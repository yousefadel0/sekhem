const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 1000
  });
  for (const e of events) {
    if (e.metadata?.error || e.metadata?.payload?.error) {
       console.log('Error in event:', e.action, e.metadata?.error || e.metadata?.payload?.error);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
