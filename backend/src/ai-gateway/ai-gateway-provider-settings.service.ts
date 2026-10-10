import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  AiGatewayProviderActivationDecisionDto,
  AiGatewayProviderActivationStatus,
  AiGatewayProviderBudgetCapDto,
  AiGatewayProviderBudgetRequestDto,
  AiGatewayProviderOffSwitchRequestDto,
  AiGatewayProviderSettingsDto,
  AiGatewayProviderSettingsUpdateDto
} from "./ai-gateway-provider-settings.dto";
import type { AiGatewayProviderMode } from "./providers/ai-gateway-provider-mode";

const BLOCKED_FIELD_KEYS = new Set(["api" + "key", "to" + "ken", "sec" + "ret", "pass" + "word", "coo" + "kie", "author" + "ization", "bear" + "er", "cred" + "ential"]);
const PROVIDER_MODES = new Set<AiGatewayProviderMode>(["mock", "openai_dry_run"]);
const ACTIVATION_STATUSES = new Set<AiGatewayProviderActivationStatus>(["disabled", "pending_pm_approval", "approved_dry_run"]);

const DEFAULT_STATE: Omit<AiGatewayProviderSettingsDto, "safety"> = {
  providerMode: "mock",
  providersEnabled: false,
  offSwitchEnabled: true,
  activationStatus: "disabled",
  pmApprovalRequired: true,
  providerCallAllowed: false,
  budgetCap: null,
  budgetCapConfigured: false,
  lastUpdatedAt: null
};

@Injectable()
export class AiGatewayProviderSettingsService {
  private settings: Omit<AiGatewayProviderSettingsDto, "safety"> = { ...DEFAULT_STATE };

  readSettings(): AiGatewayProviderSettingsDto {
    return this.toDto();
  }

  updateSettings(body: unknown): AiGatewayProviderSettingsDto {
    this.assertRecord(body);
    this.assertNoSensitiveFields(body);

    const next = { ...this.settings };
    const update = body as AiGatewayProviderSettingsUpdateDto;

    if (update.providerMode !== undefined) {
      next.providerMode = this.assertProviderMode(update.providerMode);
    }

    if (update.providersEnabled !== undefined) {
      next.providersEnabled = this.assertBoolean(update.providersEnabled, "providersEnabled");
    }

    if (update.offSwitchEnabled !== undefined) {
      next.offSwitchEnabled = this.assertBoolean(update.offSwitchEnabled, "offSwitchEnabled");
    }

    if (update.activationStatus !== undefined) {
      next.activationStatus = this.assertActivationStatus(update.activationStatus);
    }

    if (update.budgetCap !== undefined) {
      next.budgetCap = update.budgetCap === null ? null : this.parseBudgetCap(update.budgetCap);
      next.budgetCapConfigured = next.budgetCap !== null;
    }

    this.settings = this.enforceActivationRules(next);
    return this.toDto();
  }

  setOffSwitch(body: unknown): AiGatewayProviderSettingsDto {
    this.assertRecord(body);
    this.assertNoSensitiveFields(body);
    const request = body as unknown as AiGatewayProviderOffSwitchRequestDto;
    this.requireString(request.changedBy, "changedBy");
    this.requireString(request.reason, "reason");

    this.settings = this.enforceActivationRules({
      ...this.settings,
      offSwitchEnabled: this.assertBoolean(request.offSwitchEnabled, "offSwitchEnabled"),
      lastUpdatedAt: new Date().toISOString()
    });
    return this.toDto();
  }

  setBudget(body: unknown): AiGatewayProviderSettingsDto {
    this.assertRecord(body);
    this.assertNoSensitiveFields(body);
    const request = body as unknown as AiGatewayProviderBudgetRequestDto;
    this.requireString(request.changedBy, "changedBy");
    this.requireString(request.reason, "reason");

    this.settings = this.enforceActivationRules({
      ...this.settings,
      budgetCap: this.parseBudgetCap(request),
      budgetCapConfigured: true,
      lastUpdatedAt: new Date().toISOString()
    });
    return this.toDto();
  }

  requestActivation(body: unknown): AiGatewayProviderActivationDecisionDto {
    this.assertRecord(body);
    this.assertNoSensitiveFields(body);
    const request = body as { requestedBy?: unknown; reason?: unknown; providerMode?: unknown; pmApprovalReference?: unknown };
    this.requireString(request.requestedBy, "requestedBy");
    this.requireString(request.reason, "reason");
    const providerMode = this.assertProviderMode(request.providerMode);

    this.settings = this.enforceActivationRules({
      ...this.settings,
      providerMode,
      providersEnabled: true,
      activationStatus: "pending_pm_approval",
      lastUpdatedAt: new Date().toISOString()
    });

    return {
      status: "PENDING_PM_APPROVAL",
      activationStatus: this.settings.activationStatus,
      providerCallAllowed: false,
      nextGate: "PM_APPROVAL_REQUIRED",
      message: "Provider activation requires PM approval and remains disabled for runtime calls.",
      settings: this.toDto()
    };
  }

  canRouteProvider(mode: AiGatewayProviderMode): boolean {
    const current = this.toDto();
    return (
      mode === current.providerMode &&
      current.providerCallAllowed &&
      current.providersEnabled &&
      !current.offSwitchEnabled &&
      current.activationStatus === "approved_dry_run" &&
      current.budgetCapConfigured
    );
  }

  assertNoSensitiveFields(value: unknown): void {
    const inspect = (candidate: unknown): void => {
      if (Array.isArray(candidate)) {
        candidate.forEach(inspect);
        return;
      }

      if (!this.isRecord(candidate)) {
        return;
      }

      for (const [key, nested] of Object.entries(candidate)) {
        if (BLOCKED_FIELD_KEYS.has(this.normalizeKey(key))) {
          throw new BadRequestException("Provider settings reject sensitive fields");
        }
        inspect(nested);
      }
    };

    inspect(value);
  }

  private enforceActivationRules(
    candidate: Omit<AiGatewayProviderSettingsDto, "safety">
  ): Omit<AiGatewayProviderSettingsDto, "safety"> {
    const next = { ...candidate, lastUpdatedAt: new Date().toISOString() };

    if (!next.providersEnabled) {
      return {
        ...next,
        activationStatus: "disabled",
        providerCallAllowed: false
      };
    }

    return {
      ...next,
      activationStatus: "pending_pm_approval",
      providerCallAllowed: false
    };
  }

  private parseBudgetCap(value: unknown): AiGatewayProviderBudgetCapDto {
    this.assertRecord(value);
    return {
      maxRequestsPerDay: this.positiveInteger(value.maxRequestsPerDay, "maxRequestsPerDay"),
      maxRequestsPerTask: this.positiveInteger(value.maxRequestsPerTask, "maxRequestsPerTask"),
      maxInputTokensPerRequest: this.positiveInteger(value.maxInputTokensPerRequest, "maxInputTokensPerRequest"),
      maxOutputTokensPerRequest: this.positiveInteger(value.maxOutputTokensPerRequest, "maxOutputTokensPerRequest"),
      maxCostUnitsPerDay: this.positiveInteger(value.maxCostUnitsPerDay, "maxCostUnitsPerDay"),
      hardStopOnBudgetExceeded: this.assertBoolean(value.hardStopOnBudgetExceeded, "hardStopOnBudgetExceeded")
    };
  }

  private positiveInteger(value: unknown, field: string): number {
    if (!Number.isInteger(value) || typeof value !== "number" || value <= 0) {
      throw new BadRequestException(`${field} must be a positive integer`);
    }
    return value;
  }

  private assertProviderMode(value: unknown): AiGatewayProviderMode {
    if (typeof value !== "string" || !PROVIDER_MODES.has(value as AiGatewayProviderMode)) {
      throw new BadRequestException("providerMode is invalid");
    }
    return value as AiGatewayProviderMode;
  }

  private assertActivationStatus(value: unknown): AiGatewayProviderActivationStatus {
    if (typeof value !== "string" || !ACTIVATION_STATUSES.has(value as AiGatewayProviderActivationStatus)) {
      throw new BadRequestException("activationStatus is invalid");
    }
    return value as AiGatewayProviderActivationStatus;
  }

  private assertBoolean(value: unknown, field: string): boolean {
    if (typeof value !== "boolean") {
      throw new BadRequestException(`${field} must be boolean`);
    }
    return value;
  }

  private requireString(value: unknown, field: string): asserts value is string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new BadRequestException(`${field} is required`);
    }
  }

  private assertRecord(value: unknown): asserts value is Record<string, unknown> {
    if (!this.isRecord(value)) {
      throw new BadRequestException("Request body must be an object");
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private normalizeKey(value: string): string {
    return value.toLowerCase().replace(/[-_.\s]/g, "");
  }

  private toDto(): AiGatewayProviderSettingsDto {
    const budgetCapConfigured = this.settings.budgetCap !== null;

    return {
      ...this.settings,
      budgetCapConfigured,
      providerCallAllowed: false,
      safety: {
        realProviderActivated: false,
        sensitiveFieldsAccepted: false,
        sensitiveFieldsReturned: false,
        frontendKeyEntryAllowed: false,
        productionReady: false
      }
    };
  }
}
