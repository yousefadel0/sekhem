const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500
  });
  const runId = 'run_1790768668411_ae5mf';
  for (const e of events.reverse()) {
    let payload = e.metadata?.payload?.payload || e.metadata?.payload || {};
    if (payload.runId === runId || (e.metadata && e.metadata.runId === runId)) {
        console.log(e.action, "State:", payload.state, "Iterations:", payload.iterations);
        if (payload.operations) {
           console.log("  Operation 0:", payload.operations[0]?.state, payload.operations[0]?.verification);
           if (payload.operations[0]?.state === "FAILED" || payload.operations[0]?.state === "TRUNCATED") {
               console.log("  Evidence:", payload.operations[0]?.evidence);
           }
        }
        if (e.metadata?.error || payload.error) {
           console.log("  Error:", e.metadata?.error || payload.error);
        }
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
