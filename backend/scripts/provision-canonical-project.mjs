/**
 * provision-canonical-project.mjs
 *
 * Provisions the canonical SEKHEM Project and its Admin ProjectMember
 * into LOCAL PostgreSQL (sekhem_product_dev).
 *
 * Idempotent — uses upsert/findFirst guards.
 * Follows the same pattern as provision-admin-js.mjs.
 *
 * Run from repo root:
 *   node backend/scripts/provision-canonical-project.mjs
 */

import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

// ── env loader (same as provision-admin-js.mjs) ──────────────────────────────
function loadEnv(path) {
  try {
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
  } catch (e) {
    console.warn('Could not load env file:', path);
  }
}

loadEnv('backend/.env');

// ── canonical values from seed-data.ts ───────────────────────────────────────
const CANONICAL_PROJECT = {
  id: 'project-community-sonic-sovereign',
  slug: 'community-sonic-sovereign-program',
  name: 'Community SONiC Sovereign Program',
  customerFacingName: 'Community SONiC Sovereign Program',
  description:
    'Phase 1 Activation workspace for governed open networking validation and release readiness.',
  status: 'active',
  phase: 'phase_1_activation',
  platform: 'SONiC',
  organizationId: 'cmu18osvt0000v3j8xfyfb9cn',
};

const ADMIN_EMAIL = 'admin@sekhem.local';
const ADMIN_PROJECT_ROLE = 'Admin';

// ─────────────────────────────────────────────────────────────────────────────

(async () => {
  const prisma = new PrismaClient();

  try {
    // ── 1. Verify organization exists ─────────────────────────────────────────
    console.log('\n[1] Verifying organization...');
    const org = await prisma.organization.findUnique({
      where: { id: CANONICAL_PROJECT.organizationId },
    });
    if (!org) {
      console.error(
        `ERROR: Organization ${CANONICAL_PROJECT.organizationId} not found. Abort.`
      );
      process.exit(1);
    }
    console.log(`    ✓ Organization found: "${org.name}" (${org.id})`);

    // ── 2. Upsert canonical Project ───────────────────────────────────────────
    console.log('\n[2] Upserting canonical Project...');
    const project = await prisma.project.upsert({
      where: { id: CANONICAL_PROJECT.id },
      update: {
        // keep all canonical fields current on re-run
        slug: CANONICAL_PROJECT.slug,
        name: CANONICAL_PROJECT.name,
        customerFacingName: CANONICAL_PROJECT.customerFacingName,
        description: CANONICAL_PROJECT.description,
        status: CANONICAL_PROJECT.status,
        phase: CANONICAL_PROJECT.phase,
        platform: CANONICAL_PROJECT.platform,
        organizationId: CANONICAL_PROJECT.organizationId,
      },
      create: {
        id: CANONICAL_PROJECT.id,
        slug: CANONICAL_PROJECT.slug,
        name: CANONICAL_PROJECT.name,
        customerFacingName: CANONICAL_PROJECT.customerFacingName,
        description: CANONICAL_PROJECT.description,
        status: CANONICAL_PROJECT.status,
        phase: CANONICAL_PROJECT.phase,
        platform: CANONICAL_PROJECT.platform,
        organizationId: CANONICAL_PROJECT.organizationId,
      },
    });
    console.log(`    ✓ Project upserted: "${project.name}" (${project.id})`);
    console.log(`      slug: ${project.slug}`);
    console.log(`      status: ${project.status} | phase: ${project.phase}`);
    console.log(`      organizationId: ${project.organizationId}`);

    // ── 3. Resolve admin user ─────────────────────────────────────────────────
    console.log('\n[3] Resolving admin user...');
    const adminUser = await prisma.user.findFirst({
      where: { email: ADMIN_EMAIL },
    });
    if (!adminUser) {
      console.error(
        `ERROR: User "${ADMIN_EMAIL}" not found. Run provision-admin-js.mjs first. Abort.`
      );
      process.exit(1);
    }
    console.log(`    ✓ Admin user found: "${adminUser.email}" (${adminUser.id})`);

    // ── 4. Upsert ProjectMember (admin) ───────────────────────────────────────
    console.log('\n[4] Upserting ProjectMember (Admin role)...');
    // ProjectMember has @@unique([projectId, userId]) — use updateMany + create pattern
    // because Prisma upsert requires a @unique scalar field in `where`
    const existingMember = await prisma.projectMember.findFirst({
      where: { projectId: project.id, userId: adminUser.id },
    });

    let member;
    if (existingMember) {
      member = await prisma.projectMember.update({
        where: { id: existingMember.id },
        data: { role: ADMIN_PROJECT_ROLE },
      });
      console.log(`    ✓ ProjectMember updated (already existed): role=${member.role}`);
    } else {
      member = await prisma.projectMember.create({
        data: {
          projectId: project.id,
          userId: adminUser.id,
          role: ADMIN_PROJECT_ROLE,
        },
      });
      console.log(`    ✓ ProjectMember created: role=${member.role}`);
    }
    console.log(`      id: ${member.id}`);
    console.log(`      projectId: ${member.projectId}`);
    console.log(`      userId: ${member.userId}`);

    // ── 5. Read-only verification queries ─────────────────────────────────────
    console.log('\n[5] Read-only verification...');

    const verifyProject = await prisma.project.findUnique({
      where: { id: CANONICAL_PROJECT.id },
      include: { organization: { select: { id: true, name: true, slug: true } } },
    });
    console.log('\n    Project record:');
    console.log(`      id:               ${verifyProject.id}`);
    console.log(`      slug:             ${verifyProject.slug}`);
    console.log(`      name:             ${verifyProject.name}`);
    console.log(`      status:           ${verifyProject.status}`);
    console.log(`      phase:            ${verifyProject.phase}`);
    console.log(`      platform:         ${verifyProject.platform}`);
    console.log(
      `      organization:     ${verifyProject.organization?.name} (${verifyProject.organization?.id})`
    );

    const verifyMember = await prisma.projectMember.findFirst({
      where: { projectId: CANONICAL_PROJECT.id, userId: adminUser.id },
      include: { user: { select: { email: true } } },
    });
    console.log('\n    ProjectMember record:');
    console.log(`      id:               ${verifyMember.id}`);
    console.log(`      projectId:        ${verifyMember.projectId}`);
    console.log(`      userId:           ${verifyMember.userId}`);
    console.log(`      user email:       ${verifyMember.user.email}`);
    console.log(`      role:             ${verifyMember.role}`);

    console.log('\n✅  Canonical Project provisioning complete.\n');
  } catch (err) {
    console.error('\n❌  Provisioning failed:', err.message);
    console.error(err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
