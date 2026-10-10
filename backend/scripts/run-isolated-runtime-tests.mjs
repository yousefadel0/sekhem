import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Uses an existing disposable local database only. No database creation or DDL.
const name = process.argv.find(arg => arg.startsWith("--database="))?.slice("--database=".length);
if (!name || !/^sekhem_test_[a-z0-9_]+$/.test(name)) {
  process.stderr.write("ISOLATED_TEST_DATABASE_REQUIRED\n"); process.exit(2);
}
process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
const url = new URL(process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  process.stderr.write("LOCAL_DATABASE_REQUIRED\n"); process.exit(2);
}
url.pathname = `/${name}`;
const env = { ...process.env, DATABASE_URL: url.href, SEKHEM_TEST_DATABASE_URL: url.href,
  SEKHEM_RUNTIME_DB_TEST: "1", SEKHEM_MEMORY_DB_TEST: "1" };
const check = spawnSync(process.execPath, ["scripts/check-migration-history.mjs", `--expected-database=${name}`], { env, encoding: "utf8" });
if (check.status !== 0) {
  process.stdout.write(check.stdout ?? ""); process.stderr.write(check.stderr ?? "");
  process.exit(check.status ?? 2);
}
process.stdout.write(`Verified isolated test database: ${name}\n`);
const tests = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1",
  "test/trusted-runtime-persistence.test.ts", "test/agent-run-event-sequence.postgres.test.ts", "test/memory.postgres.integration.test.ts"],
{ env, stdio: "inherit" });
process.exitCode = tests.status ?? 2;
