import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
import * as readline from 'readline';

// Simple .env parser (no external dotenv)
function loadEnv(path: string) {
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

// Hidden password prompt (no echo)
function promptPassword(query: string): Promise<string> {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // mute output
    const mutableStdout = rl.output as any;
    mutableStdout.mute = true;
    const write = mutableStdout.write;
    mutableStdout.write = (chunk: any) => {
      if (mutableStdout.mute) return true;
      return write.apply(mutableStdout, arguments);
    };
    rl.question(query, (pwd) => {
      mutableStdout.mute = false;
      mutableStdout.write = write;
      rl.close();
      resolve(pwd);
    });
  });
}

async function main() {
  const prisma = new PrismaClient();
  const auth = new AuthService();

  const password = await promptPassword('Enter root Admin password (input hidden): ');
  if (!password) {
    console.error('Password required');
    process.exit(1);
  }

  // Ensure default organization
  const orgSlug = 'sekhem-default';
  let org = await prisma.organization.findUnique({ where: { slug: orgSlug } }).catch(() => null);
  if (!org) {
    org = await prisma.organization.create({ data: { slug: orgSlug, name: 'Sekhem Primary Org' } });
    console.log('Created default organization');
  }

  // Ensure standard roles exist
  const requiredRoles = ['Admin', 'PM', 'Technical Reviewer', 'Security Reviewer', 'Viewer'];
  for (const roleName of requiredRoles) {
    const exists = await prisma.role.findFirst({ where: { name: roleName } }).catch(() => null);
    if (!exists) {
      await prisma.role.create({ data: { name: roleName, key: roleName } });
      console.log(`Created role: ${roleName}`);
    }
  }

  // Create admin user
  const adminEmail = 'admin@sekhem.local';
  const passwordHash = await auth.hashPassword(password);
  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      status: 'active',
      displayName: 'Root Admin',
      organizationId: org.id
    }
  });
  console.log('Admin user created with id', adminUser.id);

  // Assign Admin role
  const adminRole = await prisma.role.findFirst({ where: { name: 'Admin' } });
  if (adminRole) {
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } });
    console.log('Admin role assigned to user');
  } else {
    console.warn('Admin role not found after creation');
  }

  await prisma.$disconnect();
  console.log('Provisioning complete');
}

main().catch(e => {
  console.error('Provisioning failed:', e);
  process.exit(1);
});
