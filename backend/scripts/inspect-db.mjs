import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

function loadEnv(path) {
  try {
    const content = readFileSync(path, { encoding: 'utf8' });
    for (const line of content.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const idx = t.indexOf('=');
      if (idx === -1) continue;
      const key = t.slice(0, idx).trim();
      const val = t.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}
loadEnv('backend/.env');

const prisma = new PrismaClient();
(async () => {
  try {
    await prisma.$connect();
    const providers = await prisma.aiProviderConfiguration.findMany();
    console.log('PROVIDERS:', providers);
    const models = await prisma.aiModelConfiguration.findMany();
    console.log('MODELS:', models);
    const runs = await prisma.agentRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { events: true }
    });
    console.log('RECENT RUNS:', JSON.stringify(runs.map(r => ({
      id: r.id,
      title: r.title,
      status: r.status,
      failureReason: r.failureReason,
      events: r.events.map(e => ({ type: e.eventType, payload: e.payload }))
    })), null, 2));
  } catch (e) {
    console.error('ERROR', e);
  } finally {
    await prisma.$disconnect();
  }
})();
