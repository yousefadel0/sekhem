import { CODE_EXTENSIONS } from "./workspace-classification";

// Discovery relevance only. This list neither grants access nor replaces the
// security policy used to authorize an explicitly requested file.
const GENERATED_DIRECTORIES = new Set([
  "node_modules", ".pnpm-store", ".next", "dist", "build", "coverage",
  ".turbo", ".cache", "tmp", "temp"
]);

export function excludedFromWorkspaceDiscovery(directoryName: string): boolean {
  return GENERATED_DIRECTORIES.has(directoryName.toLowerCase());
}

const QUERY_STOPWORDS = new Set((
  "the a an this that these those where what when who why how is are was were be been being in on of for to and or not " +
  "please can you we our my me it its with from into about find show tell look need want " +
  "read inspect analyze analyse review explain check search list understand investigate " +
  "workspace project repository repo codebase files file source code entire whole overview structure architecture"
).split(" "));

/** Path/name matching only: no content search, external index, or authorization. */
export function workspaceQueryTokens(instruction: string): string[] {
  return [...new Set(instruction.toLowerCase().split(/[^a-z0-9\u0600-\u06ff]+/)
    .filter(token => token.length >= 3 && !QUERY_STOPWORDS.has(token)))];
}

export function workspacePathRelevance(path: string, tokens: string[]): number {
  const parts = path.toLowerCase().split(/[^a-z0-9\u0600-\u06ff]+/).filter(part => part.length >= 3);
  return tokens.reduce((score, token) => score + (parts.some(part => part === token ||
    part.startsWith(token) || (part.length >= 4 && token.startsWith(part))) ? 1 : 0), 0);
}

export type WorkspaceFileCategory = "manifest" | "config" | "source" | "test" | "docs" | "other";
export function workspaceFileCategory(path: string): WorkspaceFileCategory {
  const lower = path.toLowerCase(), name = lower.split("/").pop() ?? lower;
  if (/^(package\.json|pyproject\.toml|requirements\.txt|cargo\.toml|go\.mod|composer\.json|pom\.xml|build\.gradle)$/.test(name)) return "manifest";
  if (/(^|\/)(__tests__|tests?|specs?)(\/|$)|[.-](test|spec)\./.test(lower)) return "test";
  if (/(^|\/)(config|configuration|\.github)(\/|$)/.test(lower) || /\.(json|ya?ml|toml|ini|conf)$/.test(name) || /([.-]config\.|^\.gitignore$|^dockerfile$|^makefile$)/.test(name)) return "config";
  if (/^(readme|license)(\.|$)/.test(name) || /\.(md|markdown|rst)$/.test(name) || /(^|\/)docs?\//.test(lower)) return "docs";
  if (CODE_EXTENSIONS.has(name.slice(name.lastIndexOf(".")))) return "source";
  return "other";
}

/** Visit valuable entries first; presentation can retain directories-first order. */
export function workspaceDiscoveryPriority(path: string, directory: boolean, tokens: string[] = []): number {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  const relevance = workspacePathRelevance(path, tokens) * 1000;
  if (directory) {
    const source = /^(src|app|apps|packages|backend|frontend|lib|components|server|client|services|modules|routes|controllers|auth|security)$/.test(name);
    return relevance + (source ? 100 : /^(config|configuration)$/.test(name) ? 95 : /^(test|tests|__tests__)$/.test(name) ? 90 : /^(docs?|\.github)$/.test(name) ? 85 : 10);
  }
  const priority: Record<WorkspaceFileCategory, number> = { manifest: 120, config: 115, docs: 110, source: 100, test: 90, other: 0 };
  const category = workspaceFileCategory(path);
  const sourcePriority = category === "source" ? (/\.d\.[cm]?ts$/i.test(name) ? -40 : /(^|\/)(src|app|lib|routes|controllers)\//i.test(path) ? 20 : 0) : 0;
  return relevance + priority[category] + sourcePriority;
}
