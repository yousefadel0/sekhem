import { spawnSync } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

// Explicitly opt-in, reviewed additive migration on an EXISTING disposable DB.
const name = process.argv.find(arg => arg.startsWith("--database="))?.slice(11);
if (!process.argv.includes("--apply-personal-projects") || !name || !/^sekhem_test_[a-z0-9_]+$/.test(name)) {
  process.stderr.write("EXPLICIT_ISOLATED_MIGRATION_REQUIRED\n"); process.exit(2);
}
process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
const url = new URL(process.env.DATABASE_URL);
if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
  process.stderr.write("LOCAL_DATABASE_REQUIRED\n"); process.exit(2);
}
url.pathname = `/${name}`;
const env = { ...process.env, DATABASE_URL: url.href };
const inspect = () => spawnSync(process.execPath, ["scripts/check-migration-history.mjs", `--expected-database=${name}`], { env, encoding: "utf8" });
const before = inspect();
let report;
try { report = JSON.parse(before.stdout); } catch { process.stderr.write("IDENTITY_CHECK_FAILED\n"); process.exit(2); }
const migration = "20261010010000_personal_projects";
if (report.status === "CONSISTENT") { process.stdout.write("ALREADY_CONSISTENT; NO MIGRATION DISPATCHED\n"); process.exit(0); }
if (report.identity?.database !== name || report.identity?.schema !== "public" || report.missingSource?.length ||
    report.checksumMismatch?.length || report.unfinished?.length || report.missingTables?.length ||
    report.pending?.length !== 1 || report.pending[0] !== migration || report.missingColumns?.length !== 1 || report.missingColumns[0] !== "Project.personalOwnerId") {
  process.stderr.write("UNREVIEWED_DATABASE_STATE; NO MIGRATION DISPATCHED\n"); process.exit(2);
}
const bin = "C:/Program Files/PostgreSQL/18/bin/";
await access(`${bin}pg_dump.exe`);
const backup = fileURLToPath(new URL(`../../storage/${name}-before-personal-projects-${Date.now()}.dump`, import.meta.url));
const pgEnv = { ...process.env, PGHOST: url.hostname.replace(/^\[|\]$/g, ""), PGPORT: url.port || "5432",
  PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
const dump = spawnSync(`${bin}pg_dump.exe`, ["--no-password", "--format=custom", "--file", backup, name], { env: pgEnv, encoding: "utf8" });
if (dump.status !== 0) { process.stderr.write("BACKUP_FAILED; NO MIGRATION DISPATCHED\n"); process.exit(2); }
const verify = spawnSync(`${bin}pg_restore.exe`, ["--list", backup], { encoding: "utf8" });
if (verify.status !== 0) { process.stderr.write("BACKUP_ARCHIVE_INVALID; NO MIGRATION DISPATCHED\n"); process.exit(2); }
const bytes = await readFile(backup);
process.stdout.write(`${JSON.stringify({ database: name, backup, backupBytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), restoreTested: false })}\n`);
const deploy = spawnSync(process.execPath, ["scripts/prisma-cli.mjs", "migrate", "deploy"], { env, encoding: "utf8" });
if (deploy.status !== 0) { process.stderr.write("TEST_DATABASE_MIGRATION_FAILED; BACKUP RETAINED\n"); process.exit(1); }
const after = inspect();
process.stdout.write(after.stdout ?? "");
if (after.status !== 0) process.stderr.write("POST_MIGRATION_VERIFICATION_FAILED\n");
process.exitCode = after.status ?? 2;
