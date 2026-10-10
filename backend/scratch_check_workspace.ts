import { PrismaClient } from '@prisma/client';

async function checkWorkspace() {
  const prisma = new PrismaClient();
  try {
    const workspaces = await prisma.$queryRaw`SELECT * FROM "Workspace" ORDER BY "createdAt" DESC;`;
    console.log('Workspaces:', workspaces);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkWorkspace();
