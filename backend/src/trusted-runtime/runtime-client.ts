import { generateKeyPairSync, sign, verify } from "node:crypto";
import { readFile, writeFile, mkdir, lstat } from "node:fs/promises";
import { request } from "node:https";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { selectWindowsFolder } from "./runtime-folder-client";
import { performRuntimeOperation } from "./runtime-operations";
import { RuntimeReceiptOutbox } from "./runtime-receipt-outbox";
import { RUNTIME_LABEL, RUNTIME_VERSION, runtimeKey, runtimePublicKey, runtimeSigningText, type RuntimeChallenge, type RuntimeExecution } from "./runtime.contract";

import { startDiagnostic, failureCategory } from "./runtime-start-diagnostics";
const exec = promisify(execFile);
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export class RuntimeHttpError extends Error {
  constructor(readonly statusCode: number) { super(`RUNTIME_HTTP_${statusCode}:request rejected`); this.name = "RuntimeHttpError"; }
}
function temporaryTransportFailure(error: unknown): boolean {
  if (error instanceof RuntimeHttpError) return [408, 429, 500, 502, 503, 504].includes(error.statusCode);
  return ["ECONNREFUSED", "ECONNRESET", "ECONNABORTED", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "ENETDOWN"]
    .includes(String((error as NodeJS.ErrnoException | null)?.code));
}
export async function privateDirectory(path: string) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  if ((await lstat(path)).isSymbolicLink()) throw new Error("RUNTIME_KEY_DIRECTORY_LINK_REJECTED");
  if (process.platform === "win32") {
    const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value"], { windowsHide: true });
    const sid = stdout.trim(); if (!/^S-1-[0-9-]+$/.test(sid)) throw new Error("RUNTIME_KEY_OWNER_UNAVAILABLE");
    await exec("icacls.exe", [path, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], { windowsHide: true });
  }
}
export async function localIdentity(directory: string) {
  await privateDirectory(directory); const file = join(directory, "identity.json");
  try { const saved = JSON.parse(await readFile(file, "utf8")); const key = runtimePublicKey(saved.publicKey);
    const proof = Buffer.from("SEKHEM local identity consistency");
    if (runtimeKey("RUNTIME_DEVICE", key.fingerprint) !== saved.runtimeId || typeof saved.privateKey !== "string" || !verify(null, proof, saved.publicKey, sign(null, proof, saved.privateKey))) throw new Error("RUNTIME_LOCAL_IDENTITY_CORRUPT"); return saved as { runtimeId: string; publicKey: string; privateKey: string }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const keys = generateKeyPairSync("ed25519"), publicKey = String(keys.publicKey.export({ type: "spki", format: "pem" }));
  const identity = { runtimeId: runtimeKey("RUNTIME_DEVICE", runtimePublicKey(publicKey).fingerprint), publicKey, privateKey: String(keys.privateKey.export({ type: "pkcs8", format: "pem" })) };
  await writeFile(file, JSON.stringify(identity), { flag: "wx", mode: 0o600 }); return identity;
}
export class RuntimeHttpsClient {
  private epoch: number | null = null;
  constructor(readonly base: string, readonly ca: Buffer | undefined, readonly identity: { runtimeId: string; publicKey: string; privateKey: string }, readonly outbox?: RuntimeReceiptOutbox) {
    if (new URL(base).protocol !== "https:") throw new Error("RUNTIME_HTTPS_REQUIRED");
  }
  post(operation: string, payload: unknown, diagnostic?: ReturnType<typeof startDiagnostic>): Promise<any> {
    const url = new URL(`/api/trusted-runtime/transport/${operation}`, this.base), bytes = Buffer.from(JSON.stringify(payload));
    return new Promise((ok, fail) => {
      const failed = (error: unknown) => { diagnostic?.emit("HTTP_FAILED", { phase: operation as "challenge" | "started", category: failureCategory(error) }); fail(error); };
      const req = request(url, { method: "POST", family: 4, ca: this.ca, rejectUnauthorized: true, headers: { "content-type": "application/json", "content-length": bytes.length }, timeout: 25000 }, res => {
        diagnostic?.emit("HTTP_HEADERS", { phase: operation as "challenge" | "started", status: res.statusCode });
        const chunks: Buffer[] = []; let count = 0;
        res.on("data", (chunk: Buffer) => { if ((count += chunk.length) > 524288) { req.destroy(new Error("RUNTIME_RESPONSE_LIMIT")); return; } chunks.push(chunk); });
        res.on("error", failed);
        res.on("end", () => { try {
          const status = res.statusCode ?? 500;
          if (status >= 400) throw new RuntimeHttpError(status);
          const value = JSON.parse(Buffer.concat(chunks).toString("utf8")); diagnostic?.emit("HTTP_BODY_OBSERVED", { phase: operation as "challenge" | "started", status }); ok(value.data);
        } catch (e) { failed(e); } });
      }); req.on("error", failed); req.on("timeout", () => req.destroy(Object.assign(new Error("RUNTIME_REQUEST_TIMEOUT"), { code: "ETIMEDOUT" }))); diagnostic?.emit("HTTP_SUBMIT", { phase: operation as "challenge" | "started" }); req.end(bytes);
    });
  }
  async authenticated(operation: string, payload: unknown) {
    const diagnostic = operation === "started" ? startDiagnostic("runtime", { executionId: (payload as { executionId?: unknown } | null)?.executionId }) : undefined;
    try {
    const challenge: RuntimeChallenge = await this.post("challenge", { runtimeId: this.identity.runtimeId, operation, payload }, diagnostic);
    diagnostic?.correlate({ challengeId: challenge.challengeId });
    diagnostic?.emit("CHALLENGE_OBSERVED");
    if (operation !== "connect" && this.epoch !== challenge.connectionEpoch) throw new Error("RUNTIME_CONNECTION_FENCED");
    const timestamp = new Date().toISOString();
    const response = await this.post(operation, { payload, auth: { runtimeId: this.identity.runtimeId, connectionEpoch: challenge.connectionEpoch, challengeId: challenge.challengeId, timestamp,
      signature: sign(null, Buffer.from(runtimeSigningText(challenge, timestamp)), this.identity.privateKey).toString("base64") } }, diagnostic);
    if (operation === "connect") this.epoch = response.connectionEpoch;
    return response;
    } catch (error) { diagnostic?.emit("START_FAILED", { category: failureCategory(error) }); throw error; }
  }
  async pair() {
    const { code, challenge } = await this.post("enrollment", { publicKey: this.identity.publicKey, runtimeVersion: RUNTIME_VERSION });
    const timestamp = new Date().toISOString();
    await this.post("enrollment-proof", { code, timestamp, signature: sign(null, Buffer.from(runtimeSigningText(challenge, timestamp)), this.identity.privateKey).toString("base64") });
    return code as string;
  }
  async execute(execution: RuntimeExecution) {
    const a = execution.attribution;
    const diagnostic = startDiagnostic("runtime", { executionId: a.executionId, agentRunId: a.agentRunId });
    diagnostic.emit("DISPATCH_RECEIVED");
    const ack = await this.authenticated("started", { executionId: a.executionId, operationDigest: a.operationDigest });
    // An ambiguous acknowledgement is never retried as an execution grant.
    diagnostic.emit("EXECUTION_GATE", { execute: ack.execute, cancel: ack.cancel });
    if (!ack.execute || ack.cancel) return;
    const abort = new AbortController(); let output = { stdout: "", stderr: "" }, lastOutput = "", pending: Promise<void> | null = null, fatalHeartbeatError: unknown = null;
    const timer = setInterval(() => {
      if (pending) return;
      pending = (async () => {
        try { const serialized = JSON.stringify(output); const result = await this.authenticated("heartbeat", { executionId: a.executionId, operationDigest: a.operationDigest,
          ...(serialized !== lastOutput ? { output } : {}) }); lastOutput = serialized; if (result.cancel) abort.abort(); }
        catch (error) { if (!temporaryTransportFailure(error)) { fatalHeartbeatError = error; clearInterval(timer); } abort.abort(); } finally { pending = null; }
      })();
    }, 2500);
    let result;
    try { result = await performRuntimeOperation(a, { signal: abort.signal, onOutput: (stdout, stderr) => { output = { stdout, stderr }; } }); }
    finally { clearInterval(timer); await pending; }
    if (this.outbox) await this.outbox.put(a, result);
    if (fatalHeartbeatError !== null) throw fatalHeartbeatError;
    // Results may be retransmitted byte-for-byte; OS operations may not.
    for (let i = 0; i < 3; i++) {
      try { const accepted = await this.authenticated("result", result); if (this.outbox) await this.outbox.acknowledge(a.executionId); return accepted; }
      catch (error) { if (!temporaryTransportFailure(error) || i === 2) throw error; await wait(1000 * 2 ** i); }
    }
  }
  /** Run before connect: never fence the original receipt by creating a new epoch first. */
  async reconcileReceipts() {
    for (const entry of await this.outbox?.pending() ?? []) {
      this.epoch = entry.attribution.connectionEpoch;
      await this.authenticated("result", entry.result);
      await this.outbox!.acknowledge(entry.result.executionId);
    }
  }
}
/** Only temporary transport failures retry. Permanent rejection ends the worker;
 * reconnecting or re-enrolling here could undo connection fencing. */
export async function runRuntimeWorker(client: Pick<RuntimeHttpsClient, "identity" | "authenticated" | "execute"> & Partial<Pick<RuntimeHttpsClient, "reconcileReceipts">>, sleep = wait, picker?: (expiresAt: string, signal: AbortSignal) => Promise<string | null>) {
  let connected = false, retryDelay = 2000;
  let lastStatus = 0;
  let selecting: Promise<void> | null = null, selectionFailure: unknown = null;
  const pickerAbort = new AbortController();
  try { while (true) {
    try {
      if (selectionFailure) throw selectionFailure;
      if (!connected) { await client.reconcileReceipts?.(); await client.authenticated("connect", { workspaceReadProtocol: 1, conditionalWriteProtocol: 1, ...(picker ? { folderPickerProtocol: 1 } : {}) }); connected = true; console.log(`Connected: ${client.identity.runtimeId}`); }
      const next = await client.authenticated("poll", {});
      if (Date.now() - lastStatus >= 20000) { console.log("Runtime heartbeat: connected"); lastStatus = Date.now(); }
      if (next.folderSelection && picker && !selecting) {
        const selection = next.folderSelection;
        // Keep polling/liveness while the human uses the native dialog. Never reopen on a lost result.
        selecting = (async () => {
          let rootPath: string | null = null;
          try { rootPath = await picker(selection.expiresAt, pickerAbort.signal); } catch { console.error("Folder selection cancelled or unavailable"); }
          if (pickerAbort.signal.aborted) return;
          try { await client.authenticated("folder-result", { selectionId: selection.selectionId, rootPath }); }
          catch (error) { if (!temporaryTransportFailure(error) && !(error instanceof RuntimeHttpError && [400, 409].includes(error.statusCode))) selectionFailure = error; }
          finally { selecting = null; }
        })();
      }
      if (next.execution) { const result = await client.execute(next.execution); console.log(JSON.stringify({ executionId: next.execution.attribution.executionId, state: result?.state ?? "OUTCOME_UNKNOWN" })); }
      retryDelay = 2000;
    } catch (error) {
      if (!temporaryTransportFailure(error)) throw error;
      console.error(String((error as Error).message).slice(0, 200));
      await sleep(retryDelay); retryDelay = Math.min(retryDelay * 2, 30000); continue;
    }
    await sleep(2000);
  } } finally { pickerAbort.abort(); await selecting; }
}
async function main() {
  const args = process.argv.slice(2), option = (key: string, fallback?: string) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
  if (args.includes("--version")) { console.log(`SEKHEM Runtime ${RUNTIME_VERSION} · Node ${process.versions.node}`); return; }
  const caFile = option("--ca");
  const stateDirectory = resolve(option("--state", join(process.env.LOCALAPPDATA ?? process.env.HOME ?? process.cwd(), "SEKHEM", "trusted-runtime"))!);
  const identity = await localIdentity(stateDirectory);
  // Omitted CA uses Node's trusted roots. Certificate validation remains mandatory.
  const client = new RuntimeHttpsClient(option("--url", "https://localhost:7443")!, caFile ? await readFile(resolve(caFile)) : undefined, identity, new RuntimeReceiptOutbox(join(stateDirectory, "receipts"), identity));
  console.log(RUNTIME_LABEL);
  if (args.includes("--pair") || args.includes("--pair-only")) { console.log(`Pairing code: ${await client.pair()}`); console.log("In SEKHEM Settings, connect this computer using the pairing code. Enrollment grants no file access."); }
  if (args.includes("--pair-only")) return;
  const helper = option("--native-helper");
  if (helper && !(await lstat(resolve(helper))).isFile()) throw new Error("NATIVE_FOLDER_PICKER_UNAVAILABLE");
  await runRuntimeWorker(client, wait, helper ? (expiresAt, signal) => selectWindowsFolder(resolve(helper), expiresAt, signal) : undefined);
}
if (require.main === module) void main().catch(error => { console.error((error as Error).message); process.exitCode = 1; });
