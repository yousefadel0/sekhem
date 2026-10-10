import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const runs = await prisma.agentRun.findMany({
      where: { conversationId: 'conv-1791336587788-pss3d9' },
      orderBy: { createdAt: 'desc' }
    });
    console.log('Runs:');
    for (const r of runs) console.log(`${r.id} status=${r.status} failureReason=${r.failureReason ?? '-'} completedAt=${r.completedAt?.toISOString() ?? '-'}`);

    if (!runs.length) return;
    // Latest run's inspection loop state
    const inspections = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger', metadata: { path: ['recordType'], equals: 'AGENT_INSPECTION' } },
      take: 300
    });
    for (const r of inspections) {
      const meta = r.metadata as any;
      const p = meta.payload ?? {};
      if (p.runId === runs[0].id) {
        console.log('\nLatest run inspection loop:', JSON.stringify({
          state: p.state,
          understandingStatus: p.understanding?.status ?? null,
          readiness: p.understanding?.understanding?.readiness ?? null,
          planningContinuation: p.planningContinuation ? { blocked: p.planningContinuation.blocked ?? false, hasResult: !!p.planningContinuation.result } : null
        }, null, 2));
      }
    }

    // Plans on latest run
    const plans = await prisma.agentPlan.findMany({
      where: { agentRunId: runs[0].id },
      orderBy: { version: 'desc' }
    });
    console.log(`\nPlans (${plans.length}):`);
    for (const pl of plans) console.log(`v${pl.version} status=${pl.status} requiresApproval=${pl.requiresApproval}`);
  } finally {
    await prisma.$disconnect();
  }
}
main();