import type { WorkspaceFileKind } from "./models/workspace.types";

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
  ".cpp",
  ".cc",
  ".c",
  ".h",
  ".hpp",
  ".cs",
  ".go",
  ".rs",
  ".php",
  ".dart",
  ".sql",
  ".sh",
  ".bash",
  ".ps1",
  ".yaml",
  ".yml",
  ".xml",
  ".html",
  ".css",
  ".scss",
  ".kt",
  ".rb",
  ".swift"
]);

const MIME_BY_KIND: Record<WorkspaceFileKind, string> = {
  code: "text/plain",
  text: "text/plain",
  document: "application/octet-stream",
  structured: "application/json",
  spreadsheet: "text/csv",
  image: "application/octet-stream",
  archive: "application/octet-stream",
  binary: "application/octet-stream",
  unknown: "application/octet-stream"
};

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".java": "Java",
  ".go": "Go",
  ".rs": "Rust",
  ".cs": "C#",
  ".cpp": "C++",
  ".c": "C",
  ".php": "PHP",
  ".rb": "Ruby",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".dart": "Dart",
  ".sql": "SQL",
  ".sh": "Shell",
  ".ps1": "PowerShell",
  ".md": "Markdown",
  ".json": "JSON"
};

const IMPORTANT_FILES = new Set([
  "readme.md",
  "package.json",
  "pnpm-lock.yaml",
  "package-lock.json",
  "requirements.txt",
  "pyproject.toml",
  "cargo.toml",
  "go.mod",
  "composer.json",
  "pom.xml",
  "build.gradle"
]);

export function classifyByExtension(fileName: string, extension: string): {
  kind: WorkspaceFileKind;
  mimeType: string;
  language?: string;
} {
  const ext = extension.toLowerCase();
  const lowerName = fileName.toLowerCase();
  if (ext === ".html" || ext === ".htm") return { kind: "code", mimeType: "text/html", language: "HTML" };
  if (CODE_EXTENSIONS.has(ext)) {
    return { kind: "code", mimeType: "text/plain", language: LANGUAGE_BY_EXTENSION[ext] };
  }
  if (ext === ".md" || ext === ".txt" || ext === ".markdown") {
    return { kind: "text", mimeType: ext === ".md" || ext === ".markdown" ? "text/markdown" : "text/plain", language: LANGUAGE_BY_EXTENSION[ext] };
  }
  if (ext === ".json") {
    return { kind: "structured", mimeType: "application/json", language: "JSON" };
  }
  if (ext === ".csv") {
    return { kind: "spreadsheet", mimeType: "text/csv" };
  }
  if (ext === ".pdf") {
    return { kind: "document", mimeType: "application/pdf" };
  }
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
    return { kind: "image", mimeType: `image/${ext === ".jpg" ? "jpeg" : ext.slice(1)}` };
  }
  if ([".zip", ".tar", ".gz", ".tgz", ".7z"].includes(ext)) {
    return { kind: "archive", mimeType: "application/zip" };
  }
  if ([".bin", ".exe", ".dll", ".so", ".dylib"].includes(ext) || lowerName.endsWith(".bin")) {
    return { kind: "binary", mimeType: "application/octet-stream" };
  }
  return { kind: "unknown", mimeType: MIME_BY_KIND.unknown };
}

export function isImportantFile(relativePath: string): boolean {
  const name = relativePath.split("/").pop()?.toLowerCase() ?? "";
  return IMPORTANT_FILES.has(name);
}

export function languageForExtension(extension: string): string | undefined {
  return LANGUAGE_BY_EXTENSION[extension.toLowerCase()];
}

export { CODE_EXTENSIONS };
