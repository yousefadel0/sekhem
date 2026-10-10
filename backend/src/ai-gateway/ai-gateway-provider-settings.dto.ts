import type { AiGatewayProviderMode } from "./providers/ai-gateway-provider-mode";

export type AiGatewayProviderActivationStatus = "disabled" | "pending_pm_approval" | "approved_dry_run";

export interface AiGatewayProviderBudgetCapDto {
  maxRequestsPerDay: number;
  maxRequestsPerTask: number;
  maxInputTokensPerRequest: number;
  maxOutputTokensPerRequest: number;
  maxCostUnitsPerDay: number;
  hardStopOnBudgetExceeded: boolean;
}

export interface AiGatewayProviderSettingsDto {
  providerMode: AiGatewayProviderMode;
  providersEnabled: boolean;
  offSwitchEnabled: boolean;
  activationStatus: AiGatewayProviderActivationStatus;
  pmApprovalRequired: true;
  providerCallAllowed: boolean;
  budgetCap: AiGatewayProviderBudgetCapDto | null;
  budgetCapConfigured: boolean;
  lastUpdatedAt: string | null;
  safety: {
    realProviderActivated: false;
    sensitiveFieldsAccepted: false;
    sensitiveFieldsReturned: false;
    frontendKeyEntryAllowed: false;
    productionReady: false;
  };
}

export interface AiGatewayProviderSettingsUpdateDto {
  providerMode?: AiGatewayProviderMode;
  providersEnabled?: boolean;
  offSwitchEnabled?: boolean;
  activationStatus?: AiGatewayProviderActivationStatus;
  pmApprovalReference?: string;
  budgetCap?: Partial<AiGatewayProviderBudgetCapDto> | null;
}

export interface AiGatewayProviderOffSwitchRequestDto {
  offSwitchEnabled: boolean;
  changedBy: string;
  reason: string;
}

export interface AiGatewayProviderBudgetRequestDto extends AiGatewayProviderBudgetCapDto {
  changedBy: string;
  reason: string;
}

export interface AiGatewayProviderActivationRequestDto {
  requestedBy: string;
  reason: string;
  providerMode: AiGatewayProviderMode;
  pmApprovalReference?: string;
}

export interface AiGatewayProviderActivationDecisionDto {
  status: "BLOCKED" | "PENDING_PM_APPROVAL";
  activationStatus: AiGatewayProviderActivationStatus;
  providerCallAllowed: false;
  nextGate: "PM_APPROVAL_REQUIRED";
  message: string;
  settings: AiGatewayProviderSettingsDto;
}
