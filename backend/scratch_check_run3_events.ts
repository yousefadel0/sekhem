import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const events = await prisma.agentRunEvent.findMany({
      where: { agentRunId: 'run_1791335749906_iovwc' },
      orderBy: { seq: 'asc' }
    });
    console.log(`Events for run_1791335749906_iovwc (${events.length}):`);
    for (const e of events) {
      const p = e.payload as any;
      let extra = '';
      if (e.eventType === 'MODEL_OUTPUT_DIAGNOSTIC') extra = ` codes=${JSON.stringify(p.codes)}${p.validation ? ' validation=' + JSON.stringify(p.validation).slice(0, 400) : ''}`;
      else if (e.eventType === 'UNDERSTANDING_CHECKPOINT') extra = ` status=${p.status} sequence=${p.sequence} sourceReads=${p.sourceReads}`;
      else if (e.eventType?.startsWith('INSPECTION_STATE_CHANGED')) extra = ` state=${p.state ?? '-'} code=${p.code ?? '-'}`;
      console.log(`seq=${e.seq} ${e.eventType}${extra}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();