import { BadRequestException } from "@nestjs/common";

type ProviderUrlPolicyEnv = Partial<Pick<NodeJS.ProcessEnv, "SEKHEM_PROVIDER_URL_ALLOWLIST">>;

export function validatedProviderBaseUrl(
  value: string,
  providerType: "vllm_openai_compatible" | "mock",
  env: ProviderUrlPolicyEnv = process.env
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException("Provider base URL is invalid");
  }

  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new BadRequestException("Provider base URL is invalid");
  }

  const normalized = url.toString().replace(/\/$/, "");
  if (providerType === "mock") {
    return normalized;
  }

  if (!configuredProviderUrls(env.SEKHEM_PROVIDER_URL_ALLOWLIST).has(normalized)) {
    throw new BadRequestException("Provider base URL is not in the configured provider allowlist");
  }

  return normalized;
}

function configuredProviderUrls(value: string | undefined): Set<string> {
  const allowed = new Set<string>();
  for (const candidate of (value ?? "").split(",").map((item) => item.trim()).filter(Boolean)) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      throw new BadRequestException("Provider HTTP allowlist configuration is invalid");
    }
    if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new BadRequestException("Provider URL allowlist configuration is invalid");
    }
    allowed.add(url.toString().replace(/\/$/, ""));
  }
  return allowed;
}
