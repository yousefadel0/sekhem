import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

// Load .env (simple parser)
function loadEnv(path) {
  const content = readFileSync(path, { encoding: 'utf8' });
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv('backend/.env');

(async () => {
  const prisma = new PrismaClient();
  const admin = await prisma.user.findUnique({
    where: { email: 'admin@sekhem.local' },
    include: {
      organizationRef: true,
      roles: { include: { role: true } },
    },
  });
  if (admin) {
    console.log('Admin user found');
    console.log('ID:', admin.id);
    console.log('Organization slug:', admin.organizationRef?.slug);
    console.log('Roles:', admin.roles.map(r => r.role.name).join(', '));
  } else {
    console.log('Admin user NOT found');
  }
  await prisma.$disconnect();
})();
