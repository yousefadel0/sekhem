import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const providers = await (prisma as any).aiProviderConfiguration.findMany();
    for (const p of providers) {
      console.log(JSON.stringify({ id: p.id, providerType: p.providerType, baseUrl: p.baseUrl, structuredOutputDialect: p.structuredOutputDialect, healthState: p.healthState, enabled: p.enabled }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();