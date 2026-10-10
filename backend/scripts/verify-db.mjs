import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

// Simple .env parser (ignores comments and empty lines)
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
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv('backend/.env');

const prisma = new PrismaClient();
(async () => {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL connectivity verified via Prisma');
    // List a few tables to confirm existence
    const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' LIMIT 5`;
    console.log('Sample tables:', tables);
  } catch (e) {
    console.error('❌ Connection failed:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
