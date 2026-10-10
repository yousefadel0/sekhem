import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import { RequireRoles } from "../auth/roles.decorator";
import { response } from "../common/api-response";
import type { ApiResponseDto } from "../dto";
import type { AiGatewayProviderActivationDecisionDto, AiGatewayProviderSettingsDto } from "./ai-gateway-provider-settings.dto";
import { AiGatewayProviderSettingsService } from "./ai-gateway-provider-settings.service";
import type { AiAssistantResponseDto, AiGatewayPreviewResponseDto } from "./ai-gateway.dto";
import { AiGatewayService } from "./ai-gateway.service";
import type { RuntimeModelDto, RuntimeProviderDto } from "./runtime-configuration.dto";
import { RuntimeConfigurationService } from "./runtime-configuration.service";

@Controller("ai-gateway")
export class AiGatewayController {
  constructor(
    @Inject(AiGatewayService) private readonly aiGatewayService: AiGatewayService,
    @Inject(AiGatewayProviderSettingsService) private readonly providerSettingsService: AiGatewayProviderSettingsService,
    @Inject(RuntimeConfigurationService) private readonly runtimeConfigurationService: RuntimeConfigurationService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  @Post("preview-request")
  async createPreviewRequest(@Body() body: unknown): Promise<ApiResponseDto<AiGatewayPreviewResponseDto>> {
    return response(await this.aiGatewayService.createPreviewRequest(body));
  }

  @Post("assistant")
  @RequireRoles("Admin", "PM")
  async assistant(@Body() body: unknown): Promise<ApiResponseDto<AiAssistantResponseDto>> {
    return response(await this.aiGatewayService.askAssistant(body));
  }

  @Get("provider-settings")
  @RequireRoles("Admin")
  readProviderSettings(): ApiResponseDto<AiGatewayProviderSettingsDto> {
    return response(this.providerSettingsService.readSettings());
  }

  @Post("provider-settings")
  @RequireRoles("Admin")
  updateProviderSettings(@Body() body: unknown): ApiResponseDto<AiGatewayProviderSettingsDto> {
    return response(this.providerSettingsService.updateSettings(body));
  }

  @Post("provider-settings/off-switch")
  @RequireRoles("Admin")
  setProviderOffSwitch(@Body() body: unknown, @Headers("cookie") cookieHeader?: string): ApiResponseDto<AiGatewayProviderSettingsDto> {
    return response(this.providerSettingsService.setOffSwitch(this.bodyWithActor(body, "changedBy", cookieHeader)));
  }

  @Post("provider-settings/budget")
  @RequireRoles("Admin")
  setProviderBudget(@Body() body: unknown, @Headers("cookie") cookieHeader?: string): ApiResponseDto<AiGatewayProviderSettingsDto> {
    return response(this.providerSettingsService.setBudget(this.bodyWithActor(body, "changedBy", cookieHeader)));
  }

  @Post("provider-settings/activation-request")
  @RequireRoles("Admin")
  requestProviderActivation(@Body() body: unknown, @Headers("cookie") cookieHeader?: string): ApiResponseDto<AiGatewayProviderActivationDecisionDto> {
    return response(this.providerSettingsService.requestActivation(this.bodyWithActor(body, "requestedBy", cookieHeader)));
  }

  @Get("providers")
  @RequireRoles("Admin", "PM")
  async providers(): Promise<ApiResponseDto<RuntimeProviderDto[]>> {
    return response(await this.runtimeConfigurationService.providers());
  }

  @Post("providers")
  @RequireRoles("Admin")
  async createProvider(@Body() body: unknown, @Headers("cookie") cookieHeader?: string): Promise<ApiResponseDto<RuntimeProviderDto>> {
    return response(await this.runtimeConfigurationService.createProvider(this.bodyWithActor(body, "changedBy", cookieHeader)));
  }

  @Patch("providers/:id")
  @RequireRoles("Admin")
  async updateProvider(@Param("id") id: string, @Body() body: unknown, @Headers("cookie") cookieHeader?: string): Promise<ApiResponseDto<RuntimeProviderDto>> {
    return response(await this.runtimeConfigurationService.updateProvider(id, this.bodyWithActor(body, "changedBy", cookieHeader)));
  }

  @Post("providers/:id/activation")
  @RequireRoles("Admin")
  async activateProvider(@Param("id") id: string, @Body() body: unknown, @Headers("cookie") cookieHeader?: string): Promise<ApiResponseDto<RuntimeProviderDto>> {
    const value = typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    return response(await this.runtimeConfigurationService.setProviderEnabled(id, value.enabled === true, this.authenticatedActor(cookieHeader)));
  }

  @Post("providers/:id/test")
  @RequireRoles("Admin")
  async testProvider(@Param("id") id: string, @Body() _body: unknown, @Headers("cookie") cookieHeader?: string): Promise<ApiResponseDto<RuntimeProviderDto>> {
    return response(await this.runtimeConfigurationService.testProvider(id, this.authenticatedActor(cookieHeader)));
  }

  @Get("providers/:id/discover-models")
  @RequireRoles("Admin")
  async discoverModels(@Param("id") id: string): Promise<ApiResponseDto<string[]>> {
    return response(await this.runtimeConfigurationService.discoverModels(id));
  }

  @Get("models")
  @RequireRoles("Admin", "PM")
  async models(@Query("providerId") providerId?: string): Promise<ApiResponseDto<RuntimeModelDto[]>> {
    return response(await this.runtimeConfigurationService.models(providerId));
  }

  @Post("models")
  @RequireRoles("Admin")
  async createModel(@Body() body: unknown, @Headers("cookie") cookieHeader?: string): Promise<ApiResponseDto<RuntimeModelDto>> {
    return response(await this.runtimeConfigurationService.createModel(this.bodyWithActor(body, "changedBy", cookieHeader)));
  }

  @Patch("models/:id")
  @RequireRoles("Admin")
  async updateModel(@Param("id") id: string, @Body() body: unknown, @Headers("cookie") cookieHeader?: string): Promise<ApiResponseDto<RuntimeModelDto>> {
    return response(await this.runtimeConfigurationService.updateModel(id, this.bodyWithActor(body, "changedBy", cookieHeader)));
  }

  private bodyWithActor(body: unknown, field: "changedBy" | "requestedBy", cookieHeader?: string): unknown {
    if (typeof body !== "object" || body === null || Array.isArray(body)) return body;
    return { ...body, [field]: this.authenticatedActor(cookieHeader) };
  }

  private authenticatedActor(cookieHeader?: string): string {
    const user = this.authService.session(cookieHeader).user;
    return `${user.displayName} [${user.role}]`;
  }
}
