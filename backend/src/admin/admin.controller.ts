import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { response } from "../common/api-response";
import { RequireRoles } from "../auth/roles.decorator";
import { AuthzGuard } from "../auth/authz.guard";
import { AuthService } from "../auth/auth.service";
import { AdminService } from "./admin.service";
import type {
  AddGroupMemberDto,
  AddProjectMemberDto,
  CreateGroupDto,
  CreateOrganizationDto,
  CreateUserDto,
  UpdateUserDto
} from "./admin.service";

/**
 * AdminController — all routes require Admin role.
 * Enforces server-side actor derivation and organization administration.
 */
@Controller("admin")
@UseGuards(AuthzGuard)
@RequireRoles("Admin")
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly adminService: AdminService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  @Get("audit")
  async listAudit(@Headers("cookie") cookieHeader: string | undefined) {
    return response(await this.adminService.listAudit(await this.authService.validateDurableSession(cookieHeader)));
  }

  // ---------------------------------------------------------------------------
  // Organizations
  // ---------------------------------------------------------------------------

  @Get("organizations")
  async listOrganizations(@Headers("cookie") cookieHeader: string | undefined) {
    return response(await this.adminService.listOrganizations(await this.authService.validateDurableSession(cookieHeader)));
  }

  @Post("organizations")
  async createOrganization(@Body() body: CreateOrganizationDto, @Headers("cookie") cookieHeader: string | undefined) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.adminService.createOrganization(body, claims));
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  @Get("users")
  async listUsers(@Headers("cookie") cookieHeader: string | undefined, @Query("organizationId") organizationId?: string) {
    return response(await this.adminService.listUsers(await this.authService.validateDurableSession(cookieHeader), organizationId));
  }

  @Post("users")
  async createUser(@Body() body: CreateUserDto, @Headers("cookie") cookieHeader: string | undefined) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.adminService.createUser(body, claims));
  }

  @Patch("users/:id")
  async updateUser(
    @Param("id") id: string,
    @Body() body: UpdateUserDto,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.adminService.updateUser(id, body, claims));
  }

  // ---------------------------------------------------------------------------
  // Groups
  // ---------------------------------------------------------------------------

  @Get("groups")
  async listGroups(@Headers("cookie") cookieHeader: string | undefined, @Query("organizationId") organizationId?: string) {
    return response(await this.adminService.listGroups(await this.authService.validateDurableSession(cookieHeader), organizationId));
  }

  @Post("groups")
  async createGroup(@Body() body: CreateGroupDto, @Headers("cookie") cookieHeader: string | undefined) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.adminService.createGroup(body, claims));
  }

  @Post("groups/:id/members")
  async addGroupMember(
    @Param("id") groupId: string,
    @Body() body: AddGroupMemberDto,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.adminService.addGroupMember(groupId, body, claims));
  }

  @Delete("groups/:id/members/:userId")
  async removeGroupMember(
    @Param("id") groupId: string,
    @Param("userId") userId: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.adminService.removeGroupMember(groupId, userId, claims));
  }

  // ---------------------------------------------------------------------------
  // Project Members
  // ---------------------------------------------------------------------------

  @Get("projects/:projectId/members")
  async listProjectMembers(@Param("projectId") projectId: string, @Headers("cookie") cookieHeader: string | undefined) {
    return response(await this.adminService.listProjectMembers(projectId, await this.authService.validateDurableSession(cookieHeader)));
  }

  @Post("projects/:projectId/members")
  async addProjectMember(
    @Param("projectId") projectId: string,
    @Body() body: AddProjectMemberDto,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.adminService.addProjectMember(projectId, body, claims));
  }

  @Delete("projects/:projectId/members/:userId")
  async removeProjectMember(
    @Param("projectId") projectId: string,
    @Param("userId") userId: string,
    @Headers("cookie") cookieHeader: string | undefined
  ) {
    const claims = await this.authService.validateDurableSession(cookieHeader);
    return response(await this.adminService.removeProjectMember(projectId, userId, claims));
  }
}
