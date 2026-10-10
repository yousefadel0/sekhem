import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Check runtime device status + lastSeenAt (RUNTIME_OFFLINE / RUNTIME_REVOKED hypothesis)
    const id = 'rt1_RUNTIME_DEVICE_ab6637976f7160fa50db0280c68a6e413968381d28f8769d7f40f4934379cd3f';
    const row = await prisma.auditEvent.findUnique({ where: { id } });
    if (!row) return console.log('device NOT FOUND');
    const meta = row.metadata as any;
    const p = meta.payload ?? {};
    console.log(JSON.stringify({ recordId: meta.recordId, revision: meta.revision, status: p.status, fingerprint: p.fingerprint, lastSeenAt: p.lastSeenAt }, null, 2));
    console.log('\nNow:', new Date().toISOString());
  } finally {
    await prisma.$disconnect();
  }
}
main();