import { BadRequestException } from "@nestjs/common";

type GitlabUrlEnv = Partial<Pick<NodeJS.ProcessEnv, "SEKHEM_GITLAB_BASE_URL" | "SEKHEM_GITLAB_ALLOWED_BASE_URLS">>;

export type GitlabRepositoryCoordinates = {
  baseUrl: string;
  projectPath: string;
};

export function validatedGitlabBaseUrl(
  value: string | undefined,
  env: GitlabUrlEnv = process.env
): string {
  const normalized = normalizedBaseUrl(value ?? "https://gitlab.com");
  const allowed = new Set(["https://gitlab.com"]);
  for (const candidate of (env.SEKHEM_GITLAB_ALLOWED_BASE_URLS ?? "").split(",").map((item) => item.trim()).filter(Boolean)) {
    allowed.add(normalizedBaseUrl(candidate));
  }
  if (!allowed.has(normalized)) throw new BadRequestException("GitLab base URL is not allowed");
  return normalized;
}

export function gitlabRepositoryCoordinates(
  identifier: string,
  env: GitlabUrlEnv = process.env
): GitlabRepositoryCoordinates {
  if (/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(identifier)) {
    return {
      baseUrl: validatedGitlabBaseUrl(env.SEKHEM_GITLAB_BASE_URL, env),
      projectPath: identifier.replace(/\.git$/i, "")
    };
  }

  let url: URL;
  try {
    url = new URL(identifier);
  } catch {
    throw new BadRequestException("GitLab repository identifier is invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new BadRequestException("GitLab repository URL is invalid");
  }
  const baseUrl = validatedGitlabBaseUrl(url.origin, env);
  const projectPath = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+$/.test(projectPath)) {
    throw new BadRequestException("GitLab repository identifier is invalid");
  }
  return { baseUrl, projectPath };
}

function normalizedBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException("GitLab base URL configuration is invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new BadRequestException("GitLab base URL configuration is invalid");
  }
  return url.origin;
}
