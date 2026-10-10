import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import * as readline from 'readline';

const scrypt = promisify(scryptCallback);

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

// Hidden password prompt (no echo)
function promptPassword(query) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Override output to hide characters
    rl._writeToOutput = function _writeToOutput(string) {
      // Do not echo input characters (including the query)
      if (string.trim().length === 0) {
        rl.output.write(string);
      } else {
        // optionally write a placeholder like '*' or nothing
        rl.output.write('');
      }
    };
    rl.question(query, (pwd) => {
      rl.close();
      resolve(pwd);
    });
  });
}

// Hash password using same scrypt:v1 parameters as AuthService
async function hashPassword(password) {
  const SCRYPT_N = 16384;
  const SCRYPT_R = 8;
  const SCRYPT_P = 1;
  const SCRYPT_KEY_LEN = 64;
  const SCRYPT_MAXMEM = 32 * 1024 * 1024;
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, SCRYPT_KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM });
  const prefix = 'scrypt:v1';
  return `${prefix}:N=${SCRYPT_N}:r=${SCRYPT_R}:p=${SCRYPT_P}:${salt}:${derivedKey.toString('hex')}`;
}

(async () => {
  const password = await promptPassword('Enter root Admin password (input hidden): ');
  if (!password) {
    console.error('Password required');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  // Ensure default organization
  const orgSlug = 'sekhem-default';
  let org = await prisma.organization.findUnique({ where: { slug: orgSlug } }).catch(() => null);
  if (!org) {
    org = await prisma.organization.create({ data: { slug: orgSlug, name: 'Sekhem Primary Org' } });
    console.log('Created default organization');
  }

  // Ensure roles exist
  const requiredRoles = ['Admin', 'PM', 'Technical Reviewer', 'Security Reviewer', 'Viewer'];
  for (const roleName of requiredRoles) {
    const exists = await prisma.role.findFirst({ where: { name: roleName } }).catch(() => null);
    if (!exists) {
      await prisma.role.create({ data: { id: randomUUID(), name: roleName, key: roleName } });
      console.log(`Created role: ${roleName}`);
    }
  }

  // Create admin user
  const adminEmail = 'admin@sekhem.local';
  const passwordHash = await hashPassword(password);
  const adminUser = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: adminEmail,
      passwordHash,
      status: 'active',
      displayName: 'Root Admin',
      organizationId: org.id
    }
  });
  console.log('Admin user created with id', adminUser.id);

  // Assign admin role
  const adminRole = await prisma.role.findFirst({ where: { name: 'Admin' } });
  if (adminRole) {
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } });
    console.log('Admin role assigned to user');
  } else {
    console.warn('Admin role not found after creation');
  }

  await prisma.$disconnect();
  console.log('Provisioning complete');
})();
