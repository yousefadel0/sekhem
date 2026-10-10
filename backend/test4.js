const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  for (const e of events) {
    let payload = e.metadata?.payload?.payload || e.metadata?.payload || {};
    if (payload.runId === 'run_1790773154017_qmjdo' || (e.metadata && e.metadata.runId === 'run_1790773154017_qmjdo')) {
        console.log("EVENT:", e.action);
        console.log(JSON.stringify(payload, null, 2));
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
