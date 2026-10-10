import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // identity.activeGrant(tx, runtimeId, projectId, undefined, true) — find how grants are looked up.
    // List ALL grant-like ledger rows for this device regardless of recordType naming.
    const rows = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger' },
      take: 2000
    });
    let found = 0;
    for (const r of rows) {
      const meta = r.metadata as any;
      const p = meta?.payload ?? {};
      if (p.runtimeId === 'rt1_RUNTIME_DEVICE_ab6637976f7160fa50db0280c68a6e413968381d28f8769d7f40f4934379cd3f' && typeof p.status === 'string') {
        found++;
        console.log(`type=${meta.recordType} rev=${meta.revision} status=${p.status} expiresAt=${p.expiresAt ?? '-'} revokedAt=${p.revokedAt ?? '-'}`);
      }
    }
    console.log('rows with device+status:', found);
  } finally {
    await prisma.$disconnect();
  }
}
main();