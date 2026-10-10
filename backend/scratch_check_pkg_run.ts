import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  
  // Check package.json run state
  const run = await prisma.agentRun.findUnique({ where: { id: 'run_1791329712492_akele' }});
  console.log('Package.json run:', JSON.stringify(run, null, 2));
  
  await prisma.$disconnect();
}

main();