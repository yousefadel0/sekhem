/**
 * verify-canonical-project.mjs
 * Read-only verification of canonical Project and ProjectMember in local DB.
 */
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

const p = await prisma.project.findUnique({
  where: { id: 'project-community-sonic-sovereign' },
  include: {
    organization: { select: { id: true, name: true, slug: true } },
    members: { include: { user: { select: { id: true, email: true } } } },
  },
});

if (!p) {
  console.error('❌  PROJECT NOT FOUND');
  process.exit(1);
}

console.log('\n=== PROJECT ===');
console.log('id             :', p.id);
console.log('slug           :', p.slug);
console.log('name           :', p.name);
console.log('customerFacing :', p.customerFacingName);
console.log('status         :', p.status);
console.log('phase          :', p.phase);
console.log('platform       :', p.platform);
console.log('organizationId :', p.organizationId);
console.log('org.name       :', p.organization?.name);
console.log('org.id         :', p.organization?.id);
console.log('org.slug       :', p.organization?.slug);
console.log('createdAt      :', p.createdAt);

console.log('\n=== PROJECT MEMBERS ===');
for (const m of p.members) {
  console.log('  member.id    :', m.id);
  console.log('  user.email   :', m.user.email);
  console.log('  user.id      :', m.user.id);
  console.log('  role         :', m.role);
}

console.log('\n✅  Verification complete.');
await prisma.$disconnect();
