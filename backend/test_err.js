const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  for (const e of events) {
    if (e.metadata && e.metadata.error) {
        console.log("ERROR in action", e.action, e.metadata.error);
    }
    const payload = e.metadata?.payload?.payload || e.metadata?.payload || {};
    if (payload.error) {
        console.log("Payload ERROR:", payload.error);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
