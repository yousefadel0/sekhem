import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const runs = await prisma.agentRun.findMany({
      where: { conversationId: 'conv-1791334966115-eqmjez' },
      orderBy: { createdAt: 'desc' }
    });
    console.log('Runs:');
    for (const r of runs) console.log(`${r.id} status=${r.status} failureReason=${r.failureReason ?? '-'} completedAt=${r.completedAt?.toISOString() ?? '-'}`);
  } finally {
    await prisma.$disconnect();
  }
}
main();