import { PrismaClient } from '@prisma/client';

async function checkConversations() {
  const prisma = new PrismaClient();
  try {
    const convs = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 1
    });

    if (convs.length > 0) {
      console.log('Latest Conversation:', JSON.stringify(convs[0], null, 2));
    } else {
      console.log('No conversations found.');
    }
    
    // Also check AgentRun
    const runs = await prisma.agentRun.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 1
    });
    
    if (runs.length > 0) {
      console.log('Latest AgentRun:', JSON.stringify(runs[0], null, 2));
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkConversations();
