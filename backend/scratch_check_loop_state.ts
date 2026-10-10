import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Current inspection loop state for run_1791340938126_4xqf7 after continuation message
    const inspections = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger', metadata: { path: ['recordType'], equals: 'AGENT_INSPECTION' } },
      take: 300
    });
    for (const r of inspections) {
      const meta = r.metadata as any;
      const p = meta.payload ?? {};
      if (p.runId === 'run_1791340938126_4xqf7') {
        console.log(JSON.stringify({
          recordId: meta.recordId, revision: meta.revision, state: p.state,
          pendingConversation: p.pendingConversation,
          modelAttempt: p.modelAttempt ? { id: p.modelAttempt.id?.slice(0, 8), expiresAt: p.modelAttempt.expiresAt } : null,
          current: p.current ? { planVersion: p.current.planVersion, tool: p.current.action?.tool, rel: p.current.action?.relativePath, state: p.current.state } : null,
          iterations: p.iterations
        }, null, 2));
      }
    }

    // Latest events on that run
    const events = await prisma.agentRunEvent.findMany({
      where: { agentRunId: 'run_1791340938126_4xqf7' },
      orderBy: { seq: 'desc' },
      take: 8
    });
    console.log('\nLatest events (newest first):');
    for (const e of events) {
      console.log(`seq=${e.seq} ${e.eventType} ${(JSON.stringify(e.payload ?? {}) as string).slice(0, 200)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();