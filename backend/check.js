const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 
async function run() { 
  const latestConv = await prisma.conversation.findFirst({ orderBy: { createdAt: 'desc' } }); 
  console.log('Latest Conv:', latestConv.id); 
  const latestRun = await prisma.agentRun.findFirst({ where: { conversationId: latestConv.id }, orderBy: { createdAt: 'desc' }, include: { plans: true, events: true } }); 
  console.log('Latest Run ID:', latestRun?.id); 
  console.log('Status:', latestRun?.status); 
  const audits = await prisma.auditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
  console.log('Recent Audits:', audits.map(a => a.action).join(', '));
} 
run().catch(console.error).finally(() => prisma.$disconnect());
