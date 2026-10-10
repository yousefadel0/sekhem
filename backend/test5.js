const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const runId = 'run_1790768668411_ae5mf';
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { events: true }
  });
  console.log('Run:', run.status, run.failureReason);
  for (const ev of run.events) {
    if (ev.eventType === 'EXECUTION_FAILED' || ev.eventType === 'INSPECTION_FAILED' || ev.eventType.includes('FAIL')) {
        console.log('Event:', ev.eventType, ev.payload);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
