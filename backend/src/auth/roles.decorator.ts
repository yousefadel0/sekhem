import { SetMetadata, UseGuards, applyDecorators } from "@nestjs/common";
import type { AuthRoleDto } from "./auth.dto";
import { AUTHZ_ROLES_KEY } from "./authz.constants";
import { AuthzGuard } from "./authz.guard";

export function RequireRoles(...roles: AuthRoleDto[]): MethodDecorator & ClassDecorator {
  return applyDecorators(SetMetadata(AUTHZ_ROLES_KEY, roles), UseGuards(AuthzGuard));
}
