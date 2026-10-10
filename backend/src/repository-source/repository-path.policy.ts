import { BadRequestException } from "@nestjs/common";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

type RepositoryPathPolicyEnv = Partial<Pick<NodeJS.ProcessEnv, "SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS">>;

export function validatedLocalRepositoryPath(value: string, env: RepositoryPathPolicyEnv = process.env): string {
  if (!isAbsolute(value) || value.includes("\0")) {
    throw new BadRequestException("Local repository path is invalid");
  }

  const candidate = canonicalPath(value, "Local repository path is invalid");
  const roots = configuredRoots(env.SEKHEM_REPOSITORY_ALLOWED_LOCAL_ROOTS);
  if (!roots.some((root) => isWithin(root, candidate))) {
    throw new BadRequestException("Local repository path is outside the configured repository roots");
  }
  return candidate;
}

function configuredRoots(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      if (!isAbsolute(item) || item.includes("\0")) {
        throw new BadRequestException("Local repository root configuration is invalid");
      }
      return canonicalPath(item, "Local repository root configuration is invalid");
    });
}

function canonicalPath(value: string, message: string): string {
  try {
    return realpathSync.native(resolve(value));
  } catch {
    throw new BadRequestException(message);
  }
}

function isWithin(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}
