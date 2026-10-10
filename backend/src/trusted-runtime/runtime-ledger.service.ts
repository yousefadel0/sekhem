import { ConflictException, Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../data-access/prisma.service";
import { isRecord, toolDigest } from "../agent-runtime/tools/tool-contract";
import type { Prisma } from "@prisma/client";
import { boundedRuntime, RUNTIME_MODULE, runtimeKey, type RuntimeRecordType } from "./runtime.contract";

export interface RuntimeRecord<T> { runtimeRecordVersion: 1; recordType: RuntimeRecordType; recordId: string; canonicalKeyDigest: string; revision: number; immutable: boolean; payloadDigest: string; payload: T }
/** Dedicated authority. No AuditService, random uniqueness, memory fallback, or run FK. */
@Injectable()
export class RuntimeLedgerService {
  constructor(@Inject(PrismaService) readonly db: PrismaService) {}
  async transaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
    // One bounded control lock for this single-machine MVP. It serializes grant
    // revocation, authentication, claims, cancellation and results across servers.
    return this.db.$transaction(async tx => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(1936026472, 1953657905)");
      return work(tx);
    }, { maxWait: 10000, timeout: 20000 });
  }
  decode<T>(row: { id: string; module: string; metadata: unknown }, type?: RuntimeRecordType, parts?: unknown): RuntimeRecord<T> {
    const v = row?.metadata;
    boundedRuntime(v);
    if (row.module !== RUNTIME_MODULE || !isRecord(v) || v.runtimeRecordVersion !== 1 || v.recordId !== row.id ||
      (type && v.recordType !== type) || typeof v.revision !== "number" || !Number.isSafeInteger(v.revision) || v.revision < 1 ||
      typeof v.immutable !== "boolean" || v.payloadDigest !== toolDigest(v.payload) ||
      (parts !== undefined && (v.canonicalKeyDigest !== toolDigest(parts) || row.id !== runtimeKey(type!, parts)))) throw new ServiceUnavailableException("RUNTIME_LEDGER_CORRUPT");
    return structuredClone(v) as unknown as RuntimeRecord<T>;
  }
  async read<T>(tx: Prisma.TransactionClient, type: RuntimeRecordType, parts: unknown): Promise<RuntimeRecord<T> | null> {
    const row = await tx.auditEvent.findUnique({ where: { id: runtimeKey(type, parts) } });
    return row ? this.decode<T>(row, type, parts) : null;
  }
  async create<T>(tx: Prisma.TransactionClient, type: RuntimeRecordType, parts: unknown, payload: T, options: { immutable?: boolean; route?: string; createdAt?: Date } = {}): Promise<RuntimeRecord<T>> {
    boundedRuntime(payload);
    const prior = await this.read<T>(tx, type, parts);
    if (prior) { if (prior.payloadDigest !== toolDigest(payload)) throw new ConflictException("RUNTIME_IDENTITY_CONFLICT"); return prior; }
    const record: RuntimeRecord<T> = { runtimeRecordVersion: 1, recordType: type, recordId: runtimeKey(type, parts), canonicalKeyDigest: toolDigest(parts), revision: 1, immutable: options.immutable ?? true, payloadDigest: toolDigest(payload), payload };
    // PK is the final uniqueness barrier, even if a caller violates serialization.
    await tx.auditEvent.create({ data: { ...this.row(record, options.route), ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }) } });
    if (!record.immutable) await this.create(tx, "RUNTIME_REVISION", [record.recordId, 1], record);
    return record;
  }
  async update<T>(tx: Prisma.TransactionClient, prior: RuntimeRecord<T>, payload: T, route?: string): Promise<RuntimeRecord<T>> {
    if (prior.immutable) throw new ConflictException("RUNTIME_RECORD_IMMUTABLE");
    if (prior.recordType === "RUNTIME_EXECUTION" && (!isRecord(prior.payload) || !isRecord(payload) ||
      toolDigest(prior.payload.attribution) !== toolDigest(payload.attribution))) throw new ConflictException("RUNTIME_ATTRIBUTION_IMMUTABLE");
    boundedRuntime(payload);
    const next = { ...prior, revision: prior.revision + 1, payloadDigest: toolDigest(payload), payload };
    const result = await tx.auditEvent.updateMany({ where: { id: prior.recordId, module: RUNTIME_MODULE, metadata: { path: ["revision"], equals: prior.revision } }, data: {
      metadata: next as unknown as Prisma.InputJsonValue, ...(route === undefined ? {} : { action: this.action(prior.recordType, route) })
    } });
    if (result.count !== 1) throw new ConflictException("RUNTIME_RECORD_CHANGED");
    // Immutable, retained versions of every mutable runtime head. Ordinary audit
    // events are never rewritten, and generic audit readers exclude this namespace.
    await this.create(tx, "RUNTIME_REVISION", [prior.recordId, next.revision], next);
    return next;
  }
  async list<T>(tx: Prisma.TransactionClient, type: RuntimeRecordType, route: string, limit = 100): Promise<RuntimeRecord<T>[]> {
    const rows = await tx.auditEvent.findMany({ where: { module: RUNTIME_MODULE, action: this.action(type, route) }, orderBy: { createdAt: "asc" }, take: Math.min(limit, 256) });
    return rows.map(row => this.decode<T>(row, type));
  }
  private action(type: RuntimeRecordType, route = ""): string { return `${type}:${toolDigest(route)}`; }
  private row<T>(record: RuntimeRecord<T>, route?: string): Prisma.AuditEventUncheckedCreateInput {
    return { id: record.recordId, projectId: null, initiativeId: null, action: this.action(record.recordType, route), actor: "runtime-ledger", actorType: "system",
      target: "private-runtime-record", module: RUNTIME_MODULE, details: null, description: "Private runtime persistence record", metadata: record as unknown as Prisma.InputJsonValue, sourceType: "manual", riskLevel: "low" };
  }
}
