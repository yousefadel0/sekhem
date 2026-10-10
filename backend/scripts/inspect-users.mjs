import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

function loadEnv(filePath) {
  const content = readFileSync(filePath, { encoding: 'utf8' });
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv('backend/.env');

const prisma = new PrismaClient();
(async () => {
  try {
    await prisma.$connect();
    const userCount = await prisma.user.count();
    console.log('Total Users:', userCount);
    const adminRole = await prisma.role.findFirst({ where: { name: { equals: 'Admin' } } });
    if (adminRole) {
      const adminUsers = await prisma.userRole.findMany({ where: { roleId: adminRole.id } });
      console.log('Admin Users count:', adminUsers.length);
    } else {
      console.log('Admin role not found in Role table');
    }
  } catch (e) {
    console.error('Error during inspection:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
