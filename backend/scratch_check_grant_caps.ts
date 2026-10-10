import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const grantRow = await prisma.auditEvent.findUnique({ where: { id: 'rt1_RUNTIME_GRANT_888d409d8a9949159c2fb231ce04a8e15196a7537a0af9b2df964df466ecae19' } });
    if (!grantRow) return console.log('grant NOT FOUND');
    const g = (grantRow.metadata as any).payload;
    console.log(JSON.stringify({
      status: g.status, mode: g.mode, version: g.version,
      capabilities: g.capabilities,
      expiresAt: g.expiresAt,
      revokedAt: g.revokedAt,
      userId: g.userId,
      enrollmentStatus: g.enrollment?.status
    }, null, 2));
    console.log('\nNow:', new Date().toISOString());
  } finally {
    await prisma.$disconnect();
  }
}
main();