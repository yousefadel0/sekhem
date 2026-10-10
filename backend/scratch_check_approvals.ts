import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // Pending approvals for the paused package.json run
    const approvals = await prisma.agentApproval.findMany({
      where: { agentRunId: 'run_1791329712492_akele' },
      orderBy: { createdAt: 'desc' }
    });
    console.log('=== Approvals for run_1791329712492_akele ===');
    for (const a of approvals) {
      console.log(JSON.stringify(a, null, 2));
    }

    // Also check plans for this run
    const plans = await prisma.agentPlan.findMany({
      where: { agentRunId: 'run_1791329712492_akele' },
      orderBy: { version: 'desc' }
    });
    console.log('\n=== Plans ===');
    for (const p of plans) {
      console.log(`version=${p.version} status=${p.status} requiresApproval=${p.requiresApproval}`);
      const steps = typeof p.steps === 'string' ? JSON.parse(p.steps as string) : p.steps;
      if (Array.isArray(steps)) {
        for (const s of steps) {
          console.log(`  step[${s.index}] title="${s.title}" planningOnly=${s.planningOnly} requiresApproval=${s.requiresApproval ?? false}`);
          if (s.parameters?.planning?.action) {
            console.log(`  action: ${JSON.stringify(s.parameters.planning.action)}`);
          }
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();