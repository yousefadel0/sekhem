import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { guardEngineRename } from '../scripts/prisma-engine-copy-guard.cjs';

async function fixture(fn: (engine: string, temporary: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'sekhem-engine-test-'));
  try { await fn(join(dir, 'query_engine-windows.dll.node'), join(dir, 'query_engine-windows.dll.node.tmp123')); }
  finally { await rm(dir, { recursive: true, force: true }); }
}
const denied = Object.assign(new Error('loaded engine'), { code: 'EPERM' });
const rejectRename = async () => { throw denied; };
it('loaded byte-identical engine is preserved and only its temporary copy is removed', async () => fixture(async (engine, temp) => {
  await writeFile(engine, 'engine-bytes'); await writeFile(temp, 'engine-bytes');
  await guardEngineRename(rejectRename, engine)(temp, engine);
  assert.equal(await readFile(engine, 'utf8'), 'engine-bytes'); await assert.rejects(access(temp));
}));
it('different engine is rejected even when lengths match; never hides incompatible generation', async () => fixture(async (engine, temp) => {
  await writeFile(engine, 'engine-A'); await writeFile(temp, 'engine-B');
  await assert.rejects(guardEngineRename(rejectRename, engine)(temp, engine), e => e === denied);
  assert.equal(await readFile(engine, 'utf8'), 'engine-A'); assert.equal(await readFile(temp, 'utf8'), 'engine-B');
}));
it('rename errors outside the exact engine temporary-file boundary are unchanged', async () => fixture(async (engine, temp) => {
  const rename = guardEngineRename(rejectRename, engine);
  for (const [source, target] of [[temp, engine + '.other'], [engine + '.backup', engine], [engine + '.tmp123/other', engine]])
    await assert.rejects(rename(source, target), e => e === denied);
}));
it('successful ordinary rename is forwarded without fallback', async () => fixture(async (engine, temp) => {
  let args: any;
  await guardEngineRename(async (...values: any[]) => { args = values; }, engine)(temp, engine);
  assert.deepEqual(args, [temp, engine]);
}));
it('non-lock errors remain errors even for an identical engine', async () => fixture(async (engine, temp) => {
  await writeFile(engine, 'same'); await writeFile(temp, 'same');
  const failure = Object.assign(new Error('IO failure'), { code: 'EIO' });
  await assert.rejects(guardEngineRename(async () => { throw failure; }, engine)(temp, engine), e => e === failure);
}));
