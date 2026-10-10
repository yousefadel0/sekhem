// CLI-only workaround for Windows' loaded-DLL rename restriction.
// A different engine is NEVER accepted: only an already byte-identical engine
// can satisfy an EPERM/EACCES rename. No runtime process or vendor files are patched.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');

function guardEngineRename(rename, enginePath) {
  const expected = path.resolve(enginePath);
  return async function (source, target) {
    try { return await rename(source, target); }
    catch (error) {
      if (!['EPERM', 'EACCES'].includes(error.code) || typeof source !== 'string' || typeof target !== 'string'
          || path.resolve(target) !== expected || !/^\.tmp[0-9]+$/.test(path.resolve(source).slice(expected.length))
          || !path.resolve(source).startsWith(expected)) throw error;
      try {
        const [incoming, existing] = await Promise.all([fs.promises.readFile(source), fs.promises.readFile(target)]);
        const hash = buffer => createHash('sha256').update(buffer).digest('hex');
        if (incoming.length !== existing.length || hash(incoming) !== hash(existing)) throw error;
        // The generated engine is already installed; remove only this verified temporary copy.
        await fs.promises.unlink(source);
      } catch { throw error; }
    }
  };
}

module.exports = { guardEngineRename };
if (process.platform === 'win32') {
  const clientRequire = createRequire(require.resolve('@prisma/client/package.json'));
  const enginePath = path.join(path.dirname(clientRequire.resolve('.prisma/client/default')), 'query_engine-windows.dll.node');
  fs.promises.rename = guardEngineRename(fs.promises.rename.bind(fs.promises), enginePath);
}
