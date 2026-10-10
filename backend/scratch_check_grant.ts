import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Check active grant for this runtime+project (identity.activeGrant check)
    const rows = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger', metadata: { path: ['recordType'], equals: 'RUNTIME_GRANT' } },
      take: 50
    });
    console.log(`RUNTIME_GRANT records: ${rows.length}`);
    for (const r of rows) {
      const meta = r.metadata as any;
      const p = meta.payload ?? {};
      if (p.runtimeId === 'rt1_RUNTIME_DEVICE_ab6637976f7160fa50db0280c68a6e413968381d28f8769d7f40f4934379cd3f') {
        console.log(JSON.stringify({ recordId: meta.recordId, revision: meta.revision, status: p.status, projectId: p.projectId, revokedAt: p.revokedAt, expiresAt: p.expiresAt }, null, 2));
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();