import { PrismaClient } from '@prisma/client';

async function checkEvents() {
  const prisma = new PrismaClient();
  try {
    const events = await prisma.agentRunEvent.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10
    });
    console.log('Events:', JSON.stringify(events, null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkEvents();
