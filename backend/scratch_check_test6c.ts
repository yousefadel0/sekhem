import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const runs = await prisma.agentRun.findMany({
      where: { conversationId: 'conv-1791336587788-pss3d9' },
      orderBy: { createdAt: 'desc' }
    });
    console.log('Runs:');
    for (const r of runs) console.log(`${r.id} status=${r.status} failureReason=${r.failureReason ?? '-'}`);
  } finally {
    await prisma.$disconnect();
  }
}
main();