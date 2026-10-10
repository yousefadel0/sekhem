import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const env = Object.fromEntries(Object.entries(process.env).filter((entry) => typeof entry[1] === "string"));
if (process.platform === "win32" && args[0] === "generate") {
  const preload = fileURLToPath(new URL("./prisma-engine-copy-guard.cjs", import.meta.url)).replaceAll("\\", "/");
  env.NODE_OPTIONS = `${env.NODE_OPTIONS ?? ""} --require ${JSON.stringify(preload)}`.trim();
}
const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, ...args], {
  env,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
