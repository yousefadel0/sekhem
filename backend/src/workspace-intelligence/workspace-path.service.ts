import { Injectable } from "@nestjs/common";
import { WorkspaceIntelligenceError } from "./workspace-intelligence.errors";

@Injectable()
export class WorkspacePathService {
  normalizeRelativePath(input: string): string {
    if (typeof input !== "string" || input.trim().length === 0) {
      throw new WorkspaceIntelligenceError("WORKSPACE_PATH_INVALID");
    }
    if (input.includes("\0")) {
      throw new WorkspaceIntelligenceError("WORKSPACE_PATH_INVALID");
    }
    const unified = input.replace(/\\/g, "/").trim();
    if (this.isAbsolutePath(unified)) {
      throw new WorkspaceIntelligenceError("WORKSPACE_PATH_INVALID");
    }
    const parts = unified.split("/").filter((part) => part.length > 0 && part !== ".");
    if (parts.some((part) => part === "..")) {
      throw new WorkspaceIntelligenceError("WORKSPACE_PATH_OUTSIDE_ROOT");
    }
    return parts.join("/");
  }

  isAbsolutePath(value: string): boolean {
    const unified = value.replace(/\\/g, "/");
    return unified.startsWith("/") || unified.startsWith("//") || /^[a-zA-Z]:/.test(unified);
  }

  extensionOf(fileName: string): string {
    const idx = fileName.lastIndexOf(".");
    if (idx <= 0 || idx === fileName.length - 1) return "";
    return fileName.slice(idx).toLowerCase();
  }

  fileNameOf(relativePath: string): string {
    const parts = relativePath.split("/").filter(Boolean);
    return parts[parts.length - 1] ?? relativePath;
  }
}
