import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Workspace store rows use module WORKSPACE_PRIVATE_MODULE and actor workspace-store
    const rows = await prisma.auditEvent.findMany({
      where: { actor: 'workspace-store' },
      take: 500
    });
    console.log(`workspace-store rows: ${rows.length}`);
    for (const r of rows.slice(0, 30)) {
      const meta = r.metadata as any;
      if (meta?.kind === 'active') {
        console.log('ACTIVE pointer:', JSON.stringify({ id: r.id, payload: meta.payload }, null, 2));
      }
      if (meta?.kind === 'binding') {
        const p = meta.payload ?? {};
        if (p.workspaceId === 'workspace_63c08a3ef9751014b3325cae93d89417422af6bfff19ea088553d5cffd18cd8c') {
          console.log('BINDING:', JSON.stringify({ id: r.id, revision: meta.revision, version: p.version, status: p.status, verifiedAt: p.verifiedAt, runtimeId: p.runtimeId }, null, 2));
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();