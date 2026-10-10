import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute } from "node:path";
import { runtimePath } from "./runtime.contract";

/** The executable is chosen by local installation, never by the server or model. */
export async function selectWindowsFolder(helper: string, expiresAt: string, signal?: AbortSignal): Promise<string | null> {
  if (process.platform !== "win32" || !isAbsolute(helper)) throw new Error("NATIVE_FOLDER_PICKER_UNAVAILABLE");
  const remaining = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 180000) throw new Error("FOLDER_SELECTION_EXPIRED");
  const { stdout } = await promisify(execFile)(helper, ["--choose-folder"], { windowsHide: true, timeout: remaining, maxBuffer: 8192, encoding: "utf8", signal });
  const value: unknown = JSON.parse(stdout.replace(/^\uFEFF/, ""));
  if (value === null) return null;
  return runtimePath(value);
}
