import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Optional, SetMetadata, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AuthRoleDto, SessionClaims } from "./auth.dto";
import { AuthService } from "./auth.service";
import { AUTHZ_ROLES_KEY } from "./authz.constants";
import { ResourceAuthorizationService } from "./resource-authz.service";
import { roleCanUse } from "./role-policy";

export const PROJECT_ID_PARAM_KEY = "sekhem:project_id_param";
export const RequireProjectMember = (paramName = "projectId") => SetMetadata(PROJECT_ID_PARAM_KEY, paramName);

type RequestWithCookie = Request & {
  headers: Request["headers"] & {
    cookie?: string;
  };
  params: Record<string, string>;
};

@Injectable()
export class AuthzGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector,
    @Optional() @Inject(ResourceAuthorizationService) private readonly resourceAuthz?: ResourceAuthorizationService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.get<AuthRoleDto[]>(AUTHZ_ROLES_KEY, context.getHandler())
      ?? this.reflector.get<AuthRoleDto[]>(AUTHZ_ROLES_KEY, context.getClass()) ?? [];
    const projectIdParam = this.reflector.get<string | undefined>(PROJECT_ID_PARAM_KEY, context.getHandler());
    const request = context.switchToHttp().getRequest<RequestWithCookie>();

    // If no role guard and no project guard declared, the route is public
    if (requiredRoles.length === 0 && !projectIdParam) {
      return true;
    }

    const claims = await this.safeClaims(request.headers.cookie);

    // System-wide role check (e.g. Admin-only endpoints)
    if (requiredRoles.length > 0 && !roleCanUse(claims.role, requiredRoles)) {
      throw new ForbiddenException("You do not have permission to perform this action.");
    }

    // Project-level membership check: resolved dynamically from durable state
    if (projectIdParam) {
      const projectId = request.params[projectIdParam] ?? (request.query[projectIdParam] as string | undefined);
      if (projectId) {
        if (this.resourceAuthz) {
          await this.resourceAuthz.assertAuthorized({ userId: claims.sub, email: claims.email, displayName: claims.displayName,
            role: claims.role, organizationId: claims.organizationId, isSystemAdmin: claims.role === "Admin" }, "READ",
            { resourceType: "Project", id: projectId, projectId, organizationId: claims.organizationId });
        } else throw new ForbiddenException("Project authorization unavailable.");
      }
    }

    return true;
  }

  async extractClaims(cookieHeader: string | undefined): Promise<SessionClaims> {
    return this.safeClaims(cookieHeader);
  }

  private async safeClaims(cookieHeader: string | undefined): Promise<SessionClaims> {
    if (typeof this.authService.validateDurableSession !== "function") {
      throw new UnauthorizedException("Authentication required");
    }
    // Durable rejection is authoritative; signature-only claims cannot recover it.
    return this.authService.validateDurableSession(cookieHeader);
  }
}
