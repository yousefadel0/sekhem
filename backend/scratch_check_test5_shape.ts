import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Full diagnostic payload for seq=32 of run_1791339488056_m15iu
    const e = await prisma.agentRunEvent.findFirst({
      where: { agentRunId: 'run_1791339488056_m15iu', seq: 32 }
    });
    console.log(JSON.stringify(e?.payload ?? {}, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
main();