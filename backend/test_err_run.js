const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const runs = await prisma.agentRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  for (const r of runs) {
    if(r.status === 'FAILED') console.log(r.id, r.failureReason);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
