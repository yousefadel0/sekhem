import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Check RUNTIME_CAPABILITY_ENROLLMENT for this user/org/project/runtime
    const rows = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger', metadata: { path: ['recordType'], equals: 'RUNTIME_CAPABILITY_ENROLLMENT' } },
      take: 50
    });
    console.log(`Enrollments: ${rows.length}`);
    for (const r of rows) {
      const meta = r.metadata as any;
      const p = meta.payload ?? {};
      if (p.runtimeId === 'rt1_RUNTIME_DEVICE_ab6637976f7160fa50db0280c68a6e413968381d28f8769d7f40f4934379cd3f') {
        console.log(JSON.stringify({ recordId: meta.recordId, revision: meta.revision, status: p.status, expiresAt: p.expiresAt, revokedAt: p.revokedAt, capabilities: p.capabilities }, null, 2));
      }
    }

    // Also check the grant's enrollment embedded payload vs current enrollment revision
    const grantRow = await prisma.auditEvent.findUnique({ where: { id: 'rt1_RUNTIME_GRANT_888d409d8a9949159c2fb231ce04a8e15196a7537a0af9b2df964df466ecae19' } });
    if (grantRow) {
      const g = (grantRow.metadata as any).payload;
      console.log('\nGrant enrollment snapshot:', JSON.stringify({
        enrollmentId: g.enrollment?.enrollmentId,
        revision: g.enrollment?.revision,
        runtimeFingerprint: g.enrollment?.runtimeFingerprint,
        capabilities: g.enrollment?.capabilities,
        mode: g.mode,
        status: g.status,
        expiresAt: g.expiresAt
      }, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();