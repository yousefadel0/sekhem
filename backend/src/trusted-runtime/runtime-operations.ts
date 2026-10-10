import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { dirname, join, parse, basename, isAbsolute, relative } from "node:path";
import { promisify } from "node:util";
import { RUNTIME_LIMITS, runtimeInput, type RuntimeAttribution, type RuntimeResult } from "./runtime.contract";
import { excludedFromWorkspaceDiscovery, workspaceDiscoveryPriority, workspaceQueryTokens } from "../workspace-intelligence/workspace-discovery.policy";
import { FileIntelligenceSecurityService } from "../file-intelligence/security/file-intelligence-security.service";
import { checkWorkspaceReadPath } from "./workspace-read-path";

const exec = promisify(execFile);
const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const missing = async (path: string) => { try { await fs.lstat(path); return false; } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return true; throw e; } };
async function regular(path: string) { const s = await fs.stat(path); if (!s.isFile() || s.size > RUNTIME_LIMITS.fileBytes) throw new Error("RUNTIME_REGULAR_FILE_LIMIT"); return s; }
async function fileHash(path: string) {
  const handle = await fs.open(path, "r");
  try {
    const st = await handle.stat(); if (!st.isFile() || st.size > RUNTIME_LIMITS.fileBytes) throw new Error("RUNTIME_REGULAR_FILE_LIMIT");
    const hash = createHash("sha256"), buffer = Buffer.alloc(65536); let total = 0;
    while (true) { const { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
      if ((total += bytesRead) > RUNTIME_LIMITS.fileBytes) throw new Error("RUNTIME_REGULAR_FILE_LIMIT"); hash.update(buffer.subarray(0, bytesRead)); }
    return hash.digest("hex");
  } finally { await handle.close(); }
}
function noRoot(path: string) { if (parse(path).root === path) throw new Error("RUNTIME_ROOT_MUTATION_REJECTED"); }
function textBounded(value: string, max = RUNTIME_LIMITS.outputBytes) { let bytes = Buffer.from(value); if (bytes.length <= max) return { text: value, truncated: false }; bytes = bytes.subarray(0, max); return { text: bytes.toString("utf8").replace(/\uFFFD$/, ""), truncated: true }; }

export interface RuntimeOperationHooks { signal?: AbortSignal; onOutput?: (stdout: string, stderr: string) => void }
/** Trusted-machine executor: exact approved inputs, broad paths, no shell synthesis. */
export async function performRuntimeOperation(a: RuntimeAttribution, hooks: RuntimeOperationHooks = {}): Promise<RuntimeResult> {
  const startedAt = new Date().toISOString(), start = Date.now();
  const base: RuntimeResult = { executionId: a.executionId, operationDigest: a.operationDigest, state: "FAILED", startedAt, finishedAt: startedAt, durationMs: 0,
    pid: null, exitCode: null, stdout: "", stderr: "", result: {}, error: null, truncated: false, verificationState: "NOT_VERIFIED", verificationResult: {} };
  let mutationStarted = false;
  try {
    if (hooks.signal?.aborted) return finish({ ...base, state: "CANCELLED", verificationResult: { notStarted: true } }, start);
    if (Date.parse(a.permitExpiresAt) <= Date.now()) throw new Error("RUNTIME_PERMIT_EXPIRED");
    const input = runtimeInput(a.tool, a.validatedInput);
    if (a.workspaceRead) await checkWorkspaceReadPath(a, String(input.path ?? input.cwd ?? input.source));
    for (const field of ["path", "source", "destination", "cwd"]) if (field in input && process.platform === "win32" && !/^[a-z]:\\/i.test(String(input[field]))) throw new Error("RUNTIME_WINDOWS_ABSOLUTE_PATH_REQUIRED");
    if (a.tool === "terminal.execute") return await processOperation(a, input, base, start, hooks);
    const path = String(input.path ?? ""), source = String(input.source ?? ""), destination = String(input.destination ?? "");
    switch (a.tool) {
      case "filesystem.read": {
        const handle = await fs.open(path, "r");
        try { const stat = await handle.stat(); if (!stat.isFile()) throw new Error("RUNTIME_REGULAR_FILE_REQUIRED");
          if (a.workspaceRead && stat.nlink !== 1) throw new Error("WORKSPACE_READ_ALIAS_DENIED");
          const bytes = Buffer.alloc(Math.min(stat.size, RUNTIME_LIMITS.readBytes)); const read = await handle.read(bytes, 0, bytes.length, 0);
          base.stdout = textBounded(bytes.subarray(0, read.bytesRead).toString("utf8")).text; base.truncated = stat.size > bytes.length;
          if (a.workspaceRead) { await checkWorkspaceReadPath(a, path); const after = await handle.stat(); if (after.nlink !== 1 || after.ino !== stat.ino || after.dev !== stat.dev || after.mtimeMs !== stat.mtimeMs || after.size !== stat.size) throw new Error("WORKSPACE_READ_FILE_CHANGED"); new FileIntelligenceSecurityService().inspectText(bytes.subarray(0, read.bytesRead)); }
          base.result = { path, bytesRead: read.bytesRead, size: stat.size }; base.verificationResult = { observed: true }; }
        finally { await handle.close(); } break;
      }
      case "filesystem.list": {
        const directory = await fs.opendir(path), entries: { name: string; type: string }[] = []; let scanned = 0;
        for await (const entry of directory) { if (entries.length === RUNTIME_LIMITS.entries || (a.workspaceRead && scanned++ >= RUNTIME_LIMITS.entries)) { base.truncated = true; break; } if (a.workspaceRead) { try { await checkWorkspaceReadPath(a, join(path, entry.name)); } catch { continue; } } entries.push({ name: entry.name, type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other" }); }
        if (a.workspaceRead) await checkWorkspaceReadPath(a, path);
        base.result = { path, entries }; base.stdout = textBounded(entries.map(e => `${e.type}\t${e.name}`).join("\n")).text; base.verificationResult = { observed: true }; break;
      }
      case "filesystem.search": {
        const pending = [path], matches: { path: string; line: number; text: string }[] = []; let inspected = 0;
        const security = new FileIntelligenceSecurityService(), tokens = workspaceQueryTokens(String(input.query));
        const allowed = (candidate: string) => { const name = candidate === path ? basename(path) : relative(path, candidate); try { security.assertSafeFileName(name); return !name.replace(/\\/g, "/").split("/").some(excludedFromWorkspaceDiscovery); } catch { return false; } };
        if (!allowed(path)) throw new Error("RUNTIME_SEARCH_PATH_DENIED");
        while (pending.length && inspected < RUNTIME_LIMITS.entries && matches.length < 64) {
          if (hooks.signal?.aborted) throw new Error("RUNTIME_READ_CANCELLED");
          const current = pending.shift()!; inspected++; if (a.workspaceRead) { try { await checkWorkspaceReadPath(a, current); } catch { continue; } } const st = await fs.lstat(current);
          if (st.isSymbolicLink()) continue;
          if (st.isDirectory()) { const dir = await fs.opendir(current); for await (const e of dir) { if (pending.length >= RUNTIME_LIMITS.entries) { base.truncated = true; break; } const child = join(current, e.name); if (allowed(child)) pending.push(child); }
            pending.sort((a, b) => workspaceDiscoveryPriority(relative(path, b), false, tokens) - workspaceDiscoveryPriority(relative(path, a), false, tokens)); }
          else if (st.isFile() && st.size <= RUNTIME_LIMITS.readBytes && allowed(current)) {
            if (/\.(?:exe|dll|bin|zip|7z|rar|tar|gz|db|sqlite3?|pdf|png|jpe?g|gif|webp|ico|woff2?|ttf|mp[34]|wav|docx?|xlsx?|pptx?)$/i.test(current)) continue;
            // Bound the opened file, including a file that grew after the directory stat.
            const handle = await fs.open(current, "r"), bytes = Buffer.alloc(RUNTIME_LIMITS.readBytes + 1);
            let content: string;
            try { const stat = await handle.stat(), size = stat.size; if (size > RUNTIME_LIMITS.readBytes || (a.workspaceRead && stat.nlink !== 1)) continue;
              const read = await handle.read(bytes, 0, bytes.length, 0); if (read.bytesRead > RUNTIME_LIMITS.readBytes) continue;
              try { content = security.inspectText(bytes.subarray(0, read.bytesRead)); } catch { continue; }
              if (/^(?:MZ|PK\x03\x04|%PDF-|SQLite format)/.test(content)) continue;
              if (a.workspaceRead) { await checkWorkspaceReadPath(a, current); const after = await handle.stat(); if (after.nlink !== 1 || after.ino !== stat.ino || after.dev !== stat.dev || after.mtimeMs !== stat.mtimeMs || after.size !== stat.size) continue; }
            } finally { await handle.close(); }
            for (const [i, line] of content.split(/\r?\n/).entries()) if (line.includes(String(input.query))) { matches.push({ path: current, line: i + 1, text: line.slice(0, 256) }); if (matches.length === 64) break; } }
        }
        if (a.workspaceRead) await checkWorkspaceReadPath(a, path);
        base.truncated ||= pending.length > 0 || matches.length === 64; base.result = { matches, inspected }; base.verificationResult = { observed: true }; break;
      }
      case "filesystem.write":
      case "filesystem.create": {
        noRoot(path); if (a.tool === "filesystem.write" && !await missing(path)) await regular(path);
        const conditional = a.tool === "filesystem.write" && typeof input.expectedSha256 === "string";
        const bytes = Buffer.from(String(input.content), "utf8");
        const handle = await fs.open(path, conditional ? "r+" : a.tool === "filesystem.create" ? "wx" : "w", 0o600);
        try {
          if (conditional) {
            const stat = await handle.stat();
            if (!stat.isFile() || stat.size > RUNTIME_LIMITS.readBytes) throw new Error("RUNTIME_PREIMAGE_LIMIT");
            const original = await handle.readFile();
            if (sha(original) !== input.expectedSha256) throw new Error("RUNTIME_SOURCE_CHANGED");
          }
          mutationStarted = true;
          // The original remains untouched until the preimage is validated on
          // this handle. This is not an OS-wide multi-writer compare-and-swap.
          let offset = 0;
          while (offset < bytes.length) {
            const written = await handle.write(bytes, offset, bytes.length - offset, offset);
            if (!written.bytesWritten) throw new Error("RUNTIME_WRITE_INCOMPLETE");
            offset += written.bytesWritten;
          }
          await handle.truncate(bytes.length); await handle.sync();
        } finally { await handle.close(); }
        const observed = await fileHash(path); base.result = { path, bytesWritten: bytes.length, sha256: observed }; base.verificationResult = { exists: true, sha256: observed };
        if (observed !== sha(bytes)) throw new Error("RUNTIME_WRITE_VERIFICATION_FAILED"); break;
      }
      case "filesystem.delete": {
        noRoot(path); const stat = await fs.lstat(path); mutationStarted = true;
        if (stat.isDirectory() && !stat.isSymbolicLink()) await fs.rmdir(path); else await fs.unlink(path);
        const notFound = await missing(path); base.result = { path, deleted: notFound }; base.verificationResult = { notFound };
        if (!notFound) throw new Error("RUNTIME_DELETE_VERIFICATION_FAILED"); break;
      }
      case "filesystem.copy":
      case "filesystem.move": {
        noRoot(source); noRoot(destination); await regular(source);
        const sourceHash = await fileHash(source); mutationStarted = true;
        // File-only, no overwrite. A cross-volume move remains verifiable.
        await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
        const destinationHash = await fileHash(destination);
        if (sourceHash !== destinationHash) throw new Error("RUNTIME_COPY_VERIFICATION_FAILED");
        if (a.tool === "filesystem.move") {
          if (await fileHash(source) !== sourceHash) throw new Error("RUNTIME_SOURCE_CHANGED");
          await fs.unlink(source); const sourceAbsent = await missing(source);
          base.verificationResult = { sourceAbsent, destinationExists: !await missing(destination), sha256: destinationHash };
          if (!sourceAbsent) throw new Error("RUNTIME_MOVE_VERIFICATION_FAILED");
        } else base.verificationResult = { sourceHash, destinationHash, destinationExists: true };
        base.result = { source, destination, sha256: destinationHash }; break;
      }
    }
    base.state = "SUCCEEDED"; base.verificationState = "VERIFIED";
  } catch (error) {
    if (a.workspaceRead) { base.stdout = ""; base.stderr = ""; base.result = {}; base.verificationResult = {}; }
    base.error = String((error as NodeJS.ErrnoException).code ?? (error as Error).message).slice(0, 2048);
    base.state = hooks.signal?.aborted ? mutationStarted ? "OUTCOME_UNKNOWN" : "CANCELLED" : "FAILED";
    base.verificationState = "FAILED";
  }
  return finish(base, start);
}
function finish(r: RuntimeResult, start: number) { return { ...r, finishedAt: new Date().toISOString(), durationMs: Date.now() - start }; }

async function processOperation(a: RuntimeAttribution, input: Record<string, unknown>, base: RuntimeResult, start: number, hooks: RuntimeOperationHooks): Promise<RuntimeResult> {
  let executable = String(input.executable), args = input.args as string[];
  if (process.platform === "win32" && /^(npm|npm\.cmd)$/i.test(basename(executable))) {
    const npmRoot = isAbsolute(executable) ? dirname(executable) : dirname(process.execPath);
    const cli = join(npmRoot, "node_modules", "npm", "bin", "npm-cli.js"); await fs.access(cli);
    // npm.cmd cannot be spawned safely with shell:false on Windows. Invoke the
    // same installed npm JS entry point with node, preserving every approved arg.
    executable = process.execPath; args = [cli, ...args];
  } else if (/\.(cmd|bat)$/i.test(executable)) throw new Error("RUNTIME_BATCH_FILE_REQUIRES_EXPLICIT_INTERPRETER");
  return new Promise(resolve => {
    let timedOut = false, cancelled = false, terminationConfirmed = false, killing: Promise<void> | null = null, done = false;
    let cancellationDeadline: NodeJS.Timeout | undefined;
    let stdout = Buffer.alloc(0), stderr = Buffer.alloc(0);
    const child = spawn(executable, args, { cwd: String(input.cwd), shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32" });
    base.pid = child.pid ?? null;
    const collect = (which: "stdout" | "stderr", chunk: Buffer) => {
      const before = which === "stdout" ? stdout : stderr, remaining = Math.max(0, RUNTIME_LIMITS.outputBytes - before.length);
      if (chunk.length > remaining) base.truncated = true;
      const combined = Buffer.concat([before, chunk.subarray(0, remaining)]); if (which === "stdout") stdout = combined; else stderr = combined;
      hooks.onOutput?.(stdout.toString("utf8"), stderr.toString("utf8"));
    };
    child.stdout.on("data", c => collect("stdout", c)); child.stderr.on("data", c => collect("stderr", c));
    const terminate = () => {
      if (killing || !child.pid) return;
      killing = (async () => {
        try {
          if (process.platform === "win32") await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 5000 });
          else process.kill(-child.pid!, "SIGKILL");
          terminationConfirmed = true;
        } catch { terminationConfirmed = false; }
      })();
    };
    const timeout = setTimeout(() => { timedOut = true; terminate(); }, Number(input.timeoutMs));
    const abort = () => { cancelled = true; terminate(); cancellationDeadline = setTimeout(() => void finishProcess(null, "PROCESS_TERMINATION_UNCONFIRMED"), 10000); };
    hooks.signal?.addEventListener("abort", abort, { once: true });
    const finishProcess = async (code: number | null, error?: string) => {
      if (done) return; done = true; clearTimeout(timeout); clearTimeout(hardStop); clearTimeout(cancellationDeadline); hooks.signal?.removeEventListener("abort", abort); await killing;
      if (error === "PROCESS_TERMINATION_UNCONFIRMED") { terminationConfirmed = false; child.stdout.destroy(); child.stderr.destroy(); child.unref(); }
      base.stdout = textBounded(stdout.toString("utf8")).text; base.stderr = textBounded(stderr.toString("utf8")).text; base.exitCode = code;
      base.error = error ?? null;
      base.state = cancelled || timedOut ? terminationConfirmed ? cancelled ? "CANCELLED" : "TIMED_OUT" : "OUTCOME_UNKNOWN" : code === 0 && !error ? "SUCCEEDED" : "FAILED";
      base.result = { executable: String(input.executable), args: input.args, cwd: input.cwd, pid: base.pid, terminationConfirmed };
      base.verificationState = base.state === "SUCCEEDED" ? "VERIFIED" : "NOT_VERIFIED";
      base.verificationResult = { exitCode: code, terminationConfirmed };
      resolve(finish(base, start));
    };
    // Never wait indefinitely for a process tree whose termination is unconfirmed.
    const hardStop = setTimeout(() => { timedOut = true; terminate(); void finishProcess(null, "PROCESS_TERMINATION_UNCONFIRMED"); child.stdout.destroy(); child.stderr.destroy(); child.unref(); }, Number(input.timeoutMs) + 10000);
    if (hooks.signal?.aborted) abort();
    child.on("error", error => { void finishProcess(null, String((error as NodeJS.ErrnoException).code ?? error.message)); });
    child.on("close", code => { void finishProcess(code); });
  });
}
