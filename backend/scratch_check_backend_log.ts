import { readFileSync, existsSync, statSync } from 'node:fs';
import { readdirSync } from 'node:fs';

// Find recent backend log files that might contain the exception for correlation ai-reasoning-d6eb07b8
const candidates = ['output.txt', '../backend/output.txt'];
console.log('cwd files with "log" or "out":');
try {
  const entries = readdirSync('.');
  for (const f of entries) if (/log|out/i.test(f)) console.log(' -', f, statSync(f).size);
} catch (e) { console.error((e as Error).message); }

// Search output.txt for the failure around 01:37-01:38 UTC (04:36 local)
if (existsSync('output.txt')) {
  const text = readFileSync('output.txt', 'utf8');
  const lines = text.split(/\r?\n/);
  const hits = lines.filter(l => /d6eb07b8|INSPECTION_FAILED|Error|error/i.test(l)).slice(-40);
  console.log('\nRelevant tail lines:');
  for (const h of hits) console.log(h.slice(0, 400));
}