import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // List distinct recordTypes in runtime ledger
    const rows = await prisma.auditEvent.findMany({
      where: { actor: 'runtime-ledger' },
      take: 500
    });
    const types = new Map<string, number>();
    for (const r of rows) {
      const meta = r.metadata as any;
      if (meta?.recordType) types.set(meta.recordType, (types.get(meta.recordType) ?? 0) + 1);
    }
    console.log('Record types:', JSON.stringify(Object.fromEntries(types), null, 2));

    // Find inspection-like records mentioning our run id anywhere in metadata text
    const matches = rows.filter(r => JSON.stringify((r.metadata as any)?.payload ?? {}).includes('run_1791329712492_akele'));
    console.log(`\nRows whose payload mentions our run: ${matches.length}`);
    for (const m of matches.slice(0, 10)) {
      const meta = m.metadata as any;
      console.log(`- type=${meta.recordType} id=${meta.recordId} rev=${meta.revision}`);
      const p = meta.payload ?? {};
      if (p.state !== undefined) console.log(`  state=${p.state}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();