import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Current run + latest events
    const run = await prisma.agentRun.findUnique({ where: { id: 'run_1791329712492_akele' } });
    console.log('Run status:', run?.status, '| eventSeq:', run?.eventSeq, '| failureReason:', run?.failureReason);

    const events = await prisma.agentRunEvent.findMany({
      where: { agentRunId: 'run_1791329712492_akele' },
      orderBy: { seq: 'desc' },
      take: 12
    });
    console.log('\nLatest events (newest first):');
    for (const e of events) {
      console.log(`seq=${e.seq} ${e.eventType} ${(JSON.stringify(e.payload ?? {}) as string).slice(0, 220)}`);
    }

    // Any approvals created recently for this run?
    const approvals = await prisma.agentApproval.findMany({
      where: { agentRunId: 'run_1791329712492_akele' },
      orderBy: { createdAt: 'desc' }
    });
    console.log(`\nApprovals (${approvals.length}):`);
    for (const a of approvals) {
      console.log(`${a.approvalType} status=${a.status} decision=${a.decision} dueAt=${a.dueAt} decidedAt=${a.decidedAt}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();