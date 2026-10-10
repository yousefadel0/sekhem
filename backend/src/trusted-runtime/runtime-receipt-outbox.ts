import { createHash, randomUUID, sign, verify } from "node:crypto";
import { link, lstat, mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { boundedRuntime, type RuntimeAttribution, type RuntimeResult } from "./runtime.contract";

/** Local delivery journal only: it contains no instruction to execute an operation. */
export class RuntimeReceiptOutbox {
  constructor(readonly directory: string, readonly identity: { runtimeId: string; publicKey: string; privateKey: string }) {}
  private name(id: string) { return `${createHash("sha256").update(id).digest("hex")}.json`; }
  async pending() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if ((await lstat(this.directory)).isSymbolicLink()) throw new Error("RUNTIME_RECEIPT_OUTBOX_LINK_REJECTED");
    const names = (await readdir(this.directory)).filter(n => /^[a-f0-9]{64}\.json(?:\.[a-f0-9-]{36}\.pending)?$/.test(n)).sort();
    if (names.length > 64) throw new Error("RUNTIME_RECEIPT_OUTBOX_LIMIT");
    const entries: Array<{ attribution: RuntimeAttribution; result: RuntimeResult }> = [];
    for (const name of names) {
      const stat = await lstat(join(this.directory, name));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 300000) throw new Error("RUNTIME_RECEIPT_OUTBOX_CORRUPT");
      const text = await readFile(join(this.directory, name), "utf8");
      if (Buffer.byteLength(text) > 300000) throw new Error("RUNTIME_RECEIPT_OUTBOX_CORRUPT");
      const envelope = JSON.parse(text), bytes = Buffer.from(JSON.stringify(envelope.payload));
      if (!verify(null, bytes, this.identity.publicKey, Buffer.from(envelope.signature, "base64")) ||
        envelope.payload.attribution.runtimeId !== this.identity.runtimeId ||
        name.split(".json")[0] + ".json" !== this.name(envelope.payload.result.executionId) ||
        envelope.payload.result.executionId !== envelope.payload.attribution.executionId ||
        envelope.payload.result.operationDigest !== envelope.payload.attribution.operationDigest) throw new Error("RUNTIME_RECEIPT_OUTBOX_CORRUPT");
      boundedRuntime(envelope.payload);
      const existing = entries.find(e => e.result.executionId === envelope.payload.result.executionId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(envelope.payload)) throw new Error("RUNTIME_RECEIPT_OUTBOX_CONFLICT");
      if (!existing) entries.push(envelope.payload as { attribution: RuntimeAttribution; result: RuntimeResult });
    }
    if (entries.length > 32) throw new Error("RUNTIME_RECEIPT_OUTBOX_LIMIT");
    return entries;
  }
  async put(attribution: RuntimeAttribution, result: RuntimeResult) {
    const payload = { attribution, result }; boundedRuntime(payload);
    if (attribution.runtimeId !== this.identity.runtimeId || result.executionId !== attribution.executionId || result.operationDigest !== attribution.operationDigest)
      throw new Error("RUNTIME_RECEIPT_OUTBOX_ATTRIBUTION_INVALID");
    const prior = (await this.pending()).find(p => p.result.executionId === result.executionId);
    if (prior) { if (JSON.stringify(prior) !== JSON.stringify(payload)) throw new Error("RUNTIME_RECEIPT_OUTBOX_CONFLICT"); return; }
    if ((await this.pending()).length >= 32) throw new Error("RUNTIME_RECEIPT_OUTBOX_LIMIT");
    const file = join(this.directory, this.name(result.executionId)), temporary = `${file}.${randomUUID()}.pending`;
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(JSON.stringify({ payload, signature: sign(null, Buffer.from(JSON.stringify(payload)), this.identity.privateKey).toString("base64") })); await handle.sync(); }
    finally { await handle.close(); }
    try { await link(temporary, file); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = (await this.pending()).find(p => p.result.executionId === result.executionId);
      if (JSON.stringify(existing) !== JSON.stringify(payload)) throw new Error("RUNTIME_RECEIPT_OUTBOX_CONFLICT");
    } finally { await unlink(temporary); }
  }
  async acknowledge(id: string) {
    const name = this.name(id);
    for (const file of await readdir(this.directory)) if (file === name || file.startsWith(`${name}.`) && file.endsWith(".pending")) await unlink(join(this.directory, file));
  }
}
