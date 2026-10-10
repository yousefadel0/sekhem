import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // The failure at seq=32 has no MODEL_OUTPUT_DIAGNOSTIC → the error came from
    // somewhere other than proposal validation. Check backend console output file if exists.
    // Instead, check conversation messages for the clarify/failure text to learn the code path.
    const msgs = await prisma.conversationMessage.findMany({
      where: { conversationId: 'conv-1791336587788-pss3d9' },
      orderBy: { createdAt: 'asc' }
    });
    console.log(`Messages (${msgs.length}):`);
    for (const m of msgs) {
      const meta = m.metadata as any;
      console.log(`[${m.senderType}] ${(m.content ?? '').slice(0, 220).replace(/\n/g, ' | ')}`);
      if (meta && Object.keys(meta).length) console.log('   meta:', JSON.stringify(meta).slice(0, 300));
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();