const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  const runId = 'run_1790768668411_ae5mf';
  for (const e of events.reverse()) {
    let payload = e.metadata?.payload?.payload || e.metadata?.payload || {};
    if (payload.runId === runId || (e.metadata && e.metadata.runId === runId)) {
        console.log(e.action, e.metadata?.error || (e.metadata?.payload?.error));
        if (payload.operations) {
           console.log("State:", payload.state, "Op0:", payload.operations[0]?.state);
        }
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
