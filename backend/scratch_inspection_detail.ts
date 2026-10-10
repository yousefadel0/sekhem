import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    const row = await prisma.auditEvent.findUnique({
      where: { id: 'rt1_AGENT_INSPECTION_aa368e5000bf366bb653a70b26aaa7615c0fdd43769aba7ada768006351bdf40' }
    });
    if (!row) return console.log('NOT FOUND');
    const meta = row.metadata as any;
    const p = meta.payload ?? {};
    // Print a trimmed view of the inspection loop state
    console.log(JSON.stringify({
      recordId: meta.recordId,
      revision: meta.revision,
      state: p.state,
      iterations: p.iterations,
      maxIterations: p.maxIterations,
      runId: p.runId,
      conversationId: p.conversationId,
      current: p.current ? {
        planVersion: p.current.planVersion,
        tool: p.current.action?.tool,
        relativePath: p.current.action?.relativePath,
        opState: p.current.state,
        approvalId: p.current.approvalId,
        proposalId: p.current.proposalId
      } : null,
      pendingConversation: p.pendingConversation,
      modelAttempt: p.modelAttempt,
      planningContinuation: p.planningContinuation,
      operationsCount: Array.isArray(p.operations) ? p.operations.length : 0,
      lastOperation: Array.isArray(p.operations) && p.operations.length ? (() => { const o = p.operations[p.operations.length - 1]; return { planVersion: o.planVersion, tool: o.action?.tool, rel: o.action?.relativePath, state: o.state, verification: o.verification }; })() : null
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
main();