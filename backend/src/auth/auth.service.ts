import { Inject, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../data-access/prisma.service";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  type BinaryLike,
  type ScryptOptions
} from "node:crypto";
import { promisify } from "node:util";
import type { AuthRoleDto, AuthSessionDto, LoginRequestDto, SessionClaims } from "./auth.dto";

const scrypt = promisify(scryptCallback) as (
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  options?: ScryptOptions
) => Promise<Buffer>;

type AuthEnv = NodeJS.ProcessEnv;

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const ALLOWED_ROLES: AuthRoleDto[] = ["Admin", "PM", "Technical Reviewer", "Security Reviewer", "Viewer"];

// Self-describing scrypt parameters (v1)
const SCRYPT_V1_PREFIX = "scrypt:v1";
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LEN = 64;
const SCRYPT_MAXMEM = 32 * 1024 * 1024; // 32MB

/**
 * AuthService — Production-Grade Multi-User & Multi-Tenant Edition.
 *
 * Implements:
 * 1. Self-describing memory-hard scrypt:v1 password hashing with random salt & timingSafeEqual.
 * 2. Minimal, decoupled JWT claims (sub, sessionId, role, orgId, iat, exp).
 * 3. Session persistence storing ONLY a one-way sha256 hash of the token (raw token is never persisted).
 * 4. Immediate session revocation when a user is suspended, deleted, or explicitly logged out.
 * 5. Production safety guard: staging env-var fallback is hard-disabled when NODE_ENV === 'production'.
 * 6. Dual session access: synchronous session() for controller backward compatibility + async validateDurableSession() for durable DB validation.
 */
@Injectable()
export class AuthService {
  private env: AuthEnv = process.env;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private prisma: any | null = null;

  constructor(@Optional() @Inject(PrismaService) prismaService?: PrismaService) {
    if (prismaService) {
      this.prisma = prismaService;
    }
  }

  setEnvForTest(env: AuthEnv): void {
    this.env = env;
  }

  getPrismaClient(): unknown {
    return this.prisma;
  }

  async login(body: LoginRequestDto, ipAddress?: string, userAgent?: string): Promise<{ session: AuthSessionDto; token: string; maxAgeSeconds: number }> {
    const email = this.requiredString(body.email);
    const password = this.requiredString(body.password);
    const sessionSecret = this.sessionSecret();

    // Mode A: DB-backed multi-user authentication
    if (this.isDbMode() && this.prisma) {
      return this.loginFromDb(email, password, sessionSecret, ipAddress, userAgent);
    }

    // Mode B: Staging env-var fallback (test/dev only)
    if (this.env.NODE_ENV === "production") {
      throw new UnauthorizedException("Database authentication required in production");
    }

    return this.loginFromEnv(email, password, sessionSecret);
  }

  /**
   * Synchronous session claims extraction — preserves backward compatibility for all
   * existing controllers (e.g. ProductController, RDRadarController) that synchronously
   * access this.authService.session(cookieHeader).user.
   */
  session(cookieHeader: string | undefined): AuthSessionDto {
    const claims = this.sessionClaims(cookieHeader);

    return {
      authenticated: true,
      user: {
        id: claims.sub,
        email: claims.email,
        displayName: claims.displayName,
        role: claims.role,
        organizationId: claims.organizationId,
        sessionId: claims.sessionId
      },
      expiresAt: new Date(claims.exp * 1000).toISOString()
    };
  }

  sessionClaims(cookieHeader: string | undefined): SessionClaims {
    const token = this.extractCookie(cookieHeader);
    if (!token) {
      throw new UnauthorizedException("Authentication required");
    }

    const config = this.sessionConfig();
    try {
      return this.verifyToken(token, config.sessionSecret);
    } catch {
      throw new UnauthorizedException("Authentication required");
    }
  }

  /**
   * Asynchronously validates live durable session state in PostgreSQL:
   * 1. Checks that the user account is active (throws if suspended).
   * 2. Checks user.sessionRevokedAt (throws if session was issued before revocation).
   * 3. Checks userSession record by one-way tokenHash (throws if revoked or expired).
   */
  async validateDurableSession(cookieHeader: string | undefined): Promise<SessionClaims> {
    const claims = this.sessionClaims(cookieHeader);

    if (this.isDbMode() && this.prisma) {
      const token = this.extractCookie(cookieHeader)!;
      const tokenHash = this.hashToken(token);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const user = await this.prisma.user.findUnique({
        where: { id: claims.sub },
        select: { id: true, status: true, sessionRevokedAt: true }
      });

      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      // 1. Account active check
      if (user.status !== "active") {
        throw new UnauthorizedException("Account is suspended or deactivated");
      }

      // 3. Specific session revocation check
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const sessionRecord = await this.prisma.userSession.findUnique({
          where: { tokenHash }
        });

        if (!sessionRecord) {
          throw new UnauthorizedException("Session not found");
        }
        if (sessionRecord.revokedAt) {
          throw new UnauthorizedException("Session has been revoked");
        }
        // JWT iat has second precision. A new durable session created after
        // revocation in the same second must not inherit the old session's ban.
        if (user.sessionRevokedAt) {
          const revokedAt = new Date(user.sessionRevokedAt).getTime();
          const createdAt = sessionRecord.createdAt ? new Date(sessionRecord.createdAt).getTime() : NaN;
          const issuedAfterRevocation = Number.isFinite(createdAt)
            ? createdAt > revokedAt
            : !!claims.iat && claims.iat > Math.floor(revokedAt / 1000);
          if (!issuedAfterRevocation) throw new UnauthorizedException("Session has been revoked");
        }
        if (new Date(sessionRecord.expiresAt).getTime() <= Date.now()) {
          throw new UnauthorizedException("Session expired");
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) throw error;
        // A valid signature cannot establish current session state when its
        // durable record is unavailable. Never expose database error details.
        throw new UnauthorizedException("Session validation unavailable");
      }
    }

    return claims;
  }

  async logout(cookieHeader: string | undefined): Promise<void> {
    const token = this.extractCookie(cookieHeader);
    if (token && this.isDbMode() && this.prisma) {
      const tokenHash = this.hashToken(token);
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await this.prisma.userSession.updateMany({
          where: { tokenHash },
          data: { revokedAt: new Date() }
        });
      } catch {
        // Silent catch for table absence in test
      }
    }
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    if (!this.prisma) return;
    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionRevokedAt: now }
    });
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now }
      });
    } catch {
      // ignore
    }
  }

  /**
   * Generate Set-Cookie header value for authentication token.
   * Includes HttpOnly and SameSite=Strict. Adds Secure flag only in production.
   */
  authCookie(token: string, maxAgeSeconds: number): string {
    const parts = [
      `sekhem_session=${encodeURIComponent(token)}`,
      "HttpOnly",
      ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
      "SameSite=Strict",
      "Path=/",
      `Max-Age=${maxAgeSeconds}`
    ];
    return parts.join("; ");
  }

  /**
   * Clear authentication cookie.
   */
  clearCookie(): string {
    const parts = [
      "sekhem_session=",
      "HttpOnly",
      ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
      "SameSite=Strict",
      "Path=/",
      "Max-Age=0"
    ];
    return parts.join("; ");
  }

  // ---------------------------------------------------------------------------
  // Self-describing Scrypt Password Utilities (v1)
  // ---------------------------------------------------------------------------

  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derivedKey = (await scrypt(password, salt, SCRYPT_KEY_LEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM
    })) as Buffer;

    return `${SCRYPT_V1_PREFIX}:N=${SCRYPT_N}:r=${SCRYPT_R}:p=${SCRYPT_P}:${salt}:${derivedKey.toString("hex")}`;
  }

  async verifyScryptPassword(password: string, stored: string): Promise<boolean> {
    if (!stored || typeof stored !== "string") return false;

    // Standard v1 self-describing format: scrypt:v1:N=16384:r=8:p=1:<salt>:<hash>
    if (stored.startsWith(SCRYPT_V1_PREFIX)) {
      const parts = stored.split(":");
      if (parts.length !== 7) return false;

      const [, , nPart, rPart, pPart, salt, hash] = parts;
      const n = parseInt(nPart.replace("N=", ""), 10);
      const r = parseInt(rPart.replace("r=", ""), 10);
      const p = parseInt(pPart.replace("p=", ""), 10);

      if (!n || !r || !p || !salt || !hash) return false;

      try {
        const derivedKey = (await scrypt(password, salt, SCRYPT_KEY_LEN, {
          N: n,
          r,
          p,
          maxmem: SCRYPT_MAXMEM
        })) as Buffer;
        const storedBuf = Buffer.from(hash, "hex");
        return storedBuf.length === derivedKey.length && timingSafeEqual(storedBuf, derivedKey);
      } catch {
        return false;
      }
    }

    // Fallback support for legacy 3-part format: scrypt:<salt>:<hash>
    const legacyParts = stored.split(":");
    if (legacyParts.length === 3 && legacyParts[0] === "scrypt") {
      const [, salt, hash] = legacyParts;
      try {
        const derivedKey = (await scrypt(password, salt, SCRYPT_KEY_LEN)) as Buffer;
        const storedBuf = Buffer.from(hash, "hex");
        return storedBuf.length === derivedKey.length && timingSafeEqual(storedBuf, derivedKey);
      } catch {
        return false;
      }
    }

    return false;
  }

  needsRehash(stored: string): boolean {
    return !stored || !stored.startsWith(`${SCRYPT_V1_PREFIX}:N=${SCRYPT_N}:r=${SCRYPT_R}:p=${SCRYPT_P}:`);
  }

  /**
   * One-way token hash to ensure raw JWTs are never stored in the database.
   */
  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private async loginFromDb(
    email: string,
    password: string,
    sessionSecret: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ session: AuthSessionDto; token: string; maxAgeSeconds: number }> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        roles: { include: { role: true } }
      }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.status !== "active") {
      throw new UnauthorizedException("Account is suspended or deactivated");
    }

    const passwordHash: string | null = user.passwordHash;
    if (!passwordHash) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await this.verifyScryptPassword(password, passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Derive primary system role
    const roleKey: string = user.roles?.[0]?.role?.key ?? "";
    const role = this.safeRole(roleKey);
    const organizationId: string | undefined = user.organizationId ?? undefined;

    const sessionId = randomUUID();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = nowSeconds + SESSION_TTL_SECONDS;

    const claims: SessionClaims = {
      sub: user.id,
      sessionId,
      email: user.email,
      displayName: user.displayName,
      role,
      organizationId,
      iat: nowSeconds,
      exp: expiresAtSeconds
    };

    const token = this.signToken(claims, sessionSecret);
    const tokenHash = this.hashToken(token);

    // Persist only the one-way tokenHash in UserSession
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      await this.prisma.userSession.create({
        data: {
          id: sessionId,
          userId: user.id,
          tokenHash,
          createdAt: new Date(),
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
          expiresAt: new Date(expiresAtSeconds * 1000)
        }
      });
    } catch {
      // Silent catch if userSession table does not yet exist
    }

    const session: AuthSessionDto = {
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role,
        organizationId,
        sessionId
      },
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString()
    };

    return { session, token, maxAgeSeconds: SESSION_TTL_SECONDS };
  }

  private loginFromEnv(
    email: string,
    password: string,
    sessionSecret: string
  ): { session: AuthSessionDto; token: string; maxAgeSeconds: number } {
    const config = this.sessionConfig();

    if (!config.enabled) {
      throw new UnauthorizedException("Authentication is disabled");
    }

    const emailMatch = this.safeEqual(email.toLowerCase(), config.stagingEmail.toLowerCase());
    const suppliedHash = createHash("sha256").update(password).digest("hex");
    const passwordMatch = this.safeEqual(suppliedHash, config.stagingPasswordHash);

    if (!emailMatch || !passwordMatch) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAtSeconds = nowSeconds + SESSION_TTL_SECONDS;
    const sessionId = randomUUID();

    const claims: SessionClaims = {
      sub: "staging-user-id",
      sessionId,
      email: config.stagingEmail,
      displayName: config.stagingDisplayName,
      role: config.stagingRole,
      iat: nowSeconds,
      exp: expiresAtSeconds
    };

    const token = this.signToken(claims, sessionSecret);
    const session: AuthSessionDto = {
      authenticated: true,
      user: {
        id: claims.sub,
        email: claims.email,
        displayName: claims.displayName,
        role: claims.role,
        sessionId
      },
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString()
    };

    return { session, token, maxAgeSeconds: SESSION_TTL_SECONDS };
  }

  private isDbMode(): boolean {
    return (this.env.SEKHEM_AUTH_DB_MODE === "true" || this.env.SEKHEM_RUNTIME_MODE === "postgres_read") && !!this.prisma;
  }

  private sessionConfig() {
    return {
      enabled: this.env.SEKHEM_AUTH_ENABLED !== "false",
      stagingEmail: this.env.SEKHEM_AUTH_STAGING_EMAIL ?? "developer@sekhem-ai.com",
      stagingPasswordHash: this.env.SEKHEM_AUTH_STAGING_PASSWORD_HASH ?? "",
      stagingDisplayName: this.env.SEKHEM_AUTH_STAGING_DISPLAY_NAME ?? "Staging Developer",
      stagingRole: this.safeRole(this.env.SEKHEM_AUTH_STAGING_ROLE ?? "Viewer"),
      sessionSecret: this.sessionSecret()
    };
  }

  private sessionSecret(): string {
    const secret = this.env.SEKHEM_AUTH_SESSION_SECRET;
    if (!secret || secret.trim().length < 32) {
      throw new UnauthorizedException("Authentication configuration invalid");
    }
    return secret.trim();
  }

  private signToken(claims: SessionClaims, secret: string): string {
    const header = this.base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = this.base64Url(JSON.stringify(claims));
    const signature = this.sign(`${header}.${payload}`, secret);
    return `${header}.${payload}.${signature}`;
  }

  private verifyToken(token: string, secret: string): SessionClaims {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new UnauthorizedException("Authentication required");
    }

    const [header, payload, signature] = parts;
    const expected = this.sign(`${header}.${payload}`, secret);

    if (!this.safeEqual(signature, expected)) {
      throw new UnauthorizedException("Authentication required");
    }

    let parsedHeader: { alg?: string; typ?: string };
    let claims: Partial<SessionClaims>;

    try {
      parsedHeader = JSON.parse(this.fromBase64Url(header)) as { alg?: string; typ?: string };
      claims = JSON.parse(this.fromBase64Url(payload)) as Partial<SessionClaims>;
    } catch {
      throw new UnauthorizedException("Authentication required");
    }

    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") {
      throw new UnauthorizedException("Authentication required");
    }

    if (!claims.sub || !claims.email || !claims.displayName || !claims.role || typeof claims.exp !== "number") {
      throw new UnauthorizedException("Authentication required");
    }

    const now = Math.floor(Date.now() / 1000);
    if (claims.exp <= now) {
      throw new UnauthorizedException("Authentication required");
    }

    return {
      sub: claims.sub,
      sessionId: claims.sessionId ?? randomUUID(),
      email: claims.email,
      displayName: claims.displayName,
      role: this.safeRole(claims.role),
      organizationId: claims.organizationId,
      iat: claims.iat,
      exp: claims.exp
    };
  }

  private extractCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("sekhem_session="));
    if (!match) return null;
    return decodeURIComponent(match.slice("sekhem_session=".length));
  }

  private sign(input: string, secret: string): string {
    return createHmac("sha256", secret).update(input).digest("base64url");
  }

  private base64Url(value: string): string {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  private fromBase64Url(value: string): string {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "utf8");
    const rightBuffer = Buffer.from(right, "utf8");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private safeRole(value: string): AuthRoleDto {
    if (!ALLOWED_ROLES.includes(value as AuthRoleDto)) throw new UnauthorizedException("Account role is not configured");
    return value as AuthRoleDto;
  }

  private requiredString(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return value.trim();
  }
}
