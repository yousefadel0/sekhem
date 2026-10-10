import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

type RawBodyRequest = Request & { rawBody?: Buffer };

@Injectable()
export class MachineCallbackGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest>();
    const secret = process.env.SEKHEM_WORKFLOW_CALLBACK_HMAC_SECRET;
    const timestamp = this.header(request, "x-sekhem-callback-timestamp");
    const suppliedSignature = this.header(request, "x-sekhem-callback-signature");

    if (!secret || secret.length < 32 || !timestamp || !suppliedSignature || !request.rawBody) {
      throw new UnauthorizedException("Machine callback authentication required");
    }

    const timestampSeconds = Number(timestamp);
    if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) {
      throw new UnauthorizedException("Machine callback authentication required");
    }

    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.`)
      .update(request.rawBody)
      .digest("hex");
    const supplied = suppliedSignature.startsWith("sha256=") ? suppliedSignature.slice("sha256=".length) : "";

    if (!/^[a-f0-9]{64}$/i.test(supplied) || !this.safeEqual(expected, supplied.toLowerCase())) {
      throw new UnauthorizedException("Machine callback authentication required");
    }

    return true;
  }

  private header(request: RawBodyRequest, name: string): string | null {
    const value = request.headers[name];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private safeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, "utf8");
    const rightBuffer = Buffer.from(right, "utf8");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
