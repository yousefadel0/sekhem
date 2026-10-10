export type AiGatewayProviderMode = "mock" | "openai_dry_run";

export function resolveAiGatewayProviderMode(value = process.env.SEKHEM_AI_PROVIDER_MODE): AiGatewayProviderMode {
  return value === "openai_dry_run" ? "openai_dry_run" : "mock";
}
