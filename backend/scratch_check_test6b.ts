import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const runs = await prisma.agentRun.findMany({
      where: { conversationId: 'conv-1791336587788-pss3d9' },
      orderBy: { createdAt: 'desc' }
    });
    console.log('Runs:');
    for (const r of runs) console.log(`${r.id} status=${r.status} failureReason=${r.failureReason ?? '-'}`);

    if (!runs.length) return;
    // Diagnostics on latest run
    const events = await prisma.agentRunEvent.findMany({
      where: { agentRunId: runs[0].id, eventType: { in: ['MODEL_OUTPUT_DIAGNOSTIC', 'INSPECTION_STATE_CHANGED'] } },
      orderBy: { seq: 'asc' }
    });
    console.log(`\nKey events (${events.length}):`);
    for (const e of events) {
      const p = e.payload as any;
      let extra = '';
      if (e.eventType === 'MODEL_OUTPUT_DIAGNOSTIC') {
        extra = ` codes=${JSON.stringify(p.codes)}`;
        if (p.validation?.issues?.length) extra += ' issues=' + JSON.stringify(p.validation.issues.map((i: any) => ({ code: i.code, path: i.path })));
      } else {
        extra = ` state=${p.state ?? '-'} code=${p.code ?? '-'}`;
      }
      console.log(`seq=${e.seq} ${e.eventType}${extra}`);
    }

    // Inspection loop final state
    const inspections = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger', metadata: { path: ['recordType'], equals: 'AGENT_INSPECTION' } },
      take: 300
    });
    for (const r of inspections) {
      const meta = r.metadata as any;
      const p = meta.payload ?? {};
      if (p.runId === runs[0].id) {
        console.log('\nInspection loop:', JSON.stringify({
          state: p.state,
          understandingStatus: p.understanding?.status ?? null,
          readiness: p.understanding?.understanding?.readiness ?? null,
          unknowns: (p.understanding?.understanding?.unknowns ?? []).map((u: any) => ({ id: u.id, severity: u.severity, category: u.evidenceCategory }))
        }, null, 2));
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();