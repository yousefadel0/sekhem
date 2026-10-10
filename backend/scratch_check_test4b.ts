import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  try {
    // All events for the failed test-4 run, including reasoning lifecycle
    const events = await prisma.agentRunEvent.findMany({
      where: { agentRunId: 'run_1791336809140_hjquc' },
      orderBy: { seq: 'asc' }
    });
    console.log(`All events (${events.length}):`);
    for (const e of events) {
      const p = e.payload as any;
      let extra = '';
      if (e.eventType === 'PROVIDER_REQUEST_DIAGNOSTIC') extra = ` httpStatus=${p.httpStatus} durationMs=${p.durationMs}`;
      else if (e.eventType === 'INSPECTION_REASONING_ATTEMPT') extra = ` attempt=${p.attempt}`;
      else if (e.eventType === 'INSPECTION_REASONING_SETTLED') extra = ` terminalReason=${p.terminalReason}`;
      else if (e.eventType === 'EXECUTION_FAILED') extra = ` exitCode=${p.exitCode} stderr=${(p.stderr ?? '').slice(0, 200)}`;
      console.log(`seq=${e.seq} ${e.eventType}${extra}`);
    }

    // Check backend output log tail via auditEvent? Not available. Print failure window events with payloads fully.
    const failWindow = events.filter(e => e.seq >= 28);
    console.log('\nFailure window full payloads:');
    for (const e of failWindow) {
      console.log(`seq=${e.seq} ${e.eventType}: ${(JSON.stringify(e.payload ?? {}) as string).slice(0, 500)}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main();