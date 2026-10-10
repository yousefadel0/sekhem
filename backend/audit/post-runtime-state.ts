import "reflect-metadata";
import { PrismaService } from "../src/data-access/prisma.service";
import { RuntimeLedgerService } from "../src/trusted-runtime/runtime-ledger.service";
import { RUNTIME_MODULE, type RuntimeExecution } from "../src/trusted-runtime/runtime.contract";

async function main() {
  const db = new PrismaService(), ledger = new RuntimeLedgerService(db);
  try {
    const ids = [
      "rt1_RUNTIME_EXECUTION_1f6c28f6c838f9ff737d3a432d62adc1539e52f766afa44396eed31eb1c78b30",
      "rt1_RUNTIME_EXECUTION_0b4ef1e156a371481a7c05b661945454bcbee9b6b81007b9beb7725655d92483",
      "rt1_RUNTIME_EXECUTION_1c6aa3af30a3d4fb998414883bb86ab151aa16927cb673c310310991ccb7afe7",
      "rt1_RUNTIME_EXECUTION_dedbc3ff8416e564e5bf4ad4b0e0a4df6752141526787bb75f57bc2177ffa0e2"
    ];
    const records = await db.auditEvent.findMany({ where: { id: { in: ids } } });
    const receipts = records.map(row => { const e = ledger.decode<RuntimeExecution>(row, "RUNTIME_EXECUTION").payload;
      return { executionId: e.attribution.executionId, tool: e.attribution.tool, state: e.state, verificationState: e.verificationState,
        pid: e.result?.pid, exitCode: e.result?.exitCode, durationMs: e.result?.durationMs, finishedAt: e.finishedAt,
        attributionRetained: !!e.attribution.userId && !!e.attribution.organizationId && !!e.attribution.projectId && !!e.attribution.approvalId,
        resultRetained: !!e.result, outputBytes: Buffer.byteLength(e.result?.stdout ?? "") };
    });
    const runtimeId = "rt1_RUNTIME_DEVICE_dc70058e69586dcc1a90d23a533bb5f412153e02794a0cb2682481f79a6096da";
    const deviceRow = await db.auditEvent.findUnique({ where: { id: runtimeId } });
    const device = deviceRow ? ledger.decode<any>(deviceRow, "RUNTIME_DEVICE").payload : null;
    const activeExecutions = await db.auditEvent.count({ where: { module: RUNTIME_MODULE, action: { startsWith: "RUNTIME_EXECUTION:" }, OR: ["DISPATCHED", "RUNNING"].map(state => ({ metadata: { path: ["payload", "state"], equals: state } })) } });
    const pendingProposals = await db.auditEvent.count({ where: { module: RUNTIME_MODULE, action: { startsWith: "RUNTIME_PROPOSAL:" }, metadata: { path: ["payload", "state"], equals: "APPROVED" } } });
    // Inspect only typed device records for key material; do not emit their contents.
    const devices = await db.auditEvent.findMany({ where: { module: RUNTIME_MODULE, action: { startsWith: "RUNTIME_DEVICE:" } }, select: { metadata: true } });
    const privateKeyMarkers = devices.filter(row => /PRIVATE KEY|privateKey/.test(JSON.stringify(row.metadata))).length;
    const fixtureRows = await db.auditEvent.count({ where: { module: RUNTIME_MODULE, metadata: { path: ["payload", "userId"], string_starts_with: "runtime-test-" } } });
    console.log(JSON.stringify({ receipts, device: device && { status: device.status, connectionEpoch: device.connectionEpoch, lastSeenAt: device.lastSeenAt, privateKeyPresent: Object.hasOwn(device, "privateKey") }, activeExecutions, pendingProposals, privateKeyMarkers, fixtureRows }, null, 2));
  } finally { await db.$disconnect(); }
}
void main();
