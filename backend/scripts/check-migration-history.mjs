import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";

// Read-only release gate. Never applies, resolves, resets or regenerates migrations.
const expectedDatabase = process.argv.find(arg => arg.startsWith("--expected-database="))?.split("=").slice(1).join("=");
if (!expectedDatabase) {
  process.stderr.write("EXPECTED_DATABASE_REQUIRED\n");
  process.exit(2);
}
try { process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url))); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const db = new PrismaClient({ log: [] });
try {
  const report = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const [identity] = await tx.$queryRawUnsafe("SELECT current_database() AS database, current_schema() AS schema");
    if (identity.database !== expectedDatabase || identity.schema !== "public") throw new Error("DATABASE_IDENTITY_MISMATCH");
    const applied = await tx.$queryRawUnsafe('SELECT migration_name, checksum, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations" ORDER BY migration_name');
    const root = new URL("../prisma/migrations/", import.meta.url);
    const directories = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory());
    const local = new Map();
    for (const entry of directories) {
      const bytes = await readFile(new URL(`${entry.name}/migration.sql`, root));
      local.set(entry.name, createHash("sha256").update(bytes).digest("hex"));
    }
    const missingSource = applied.filter(row => !row.rolled_back && !local.has(row.migration_name)).map(row => row.migration_name);
    const checksumMismatch = applied.filter(row => !row.rolled_back && local.has(row.migration_name) && local.get(row.migration_name) !== row.checksum).map(row => row.migration_name);
    const unfinished = applied.filter(row => !row.rolled_back && !row.finished).map(row => row.migration_name);
    const pending = [...local.keys()].filter(name => !applied.some(row => row.migration_name === name && row.finished && !row.rolled_back));
    const columns = await tx.$queryRawUnsafe("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'");
    const present = new Map();
    for (const column of columns) {
      if (!present.has(column.table_name)) present.set(column.table_name, new Set());
      present.get(column.table_name).add(column.column_name);
    }
    const missingTables = [], missingColumns = [];
    for (const model of Prisma.dmmf.datamodel.models) {
      const table = model.dbName ?? model.name;
      if (!present.has(table)) { missingTables.push(table); continue; }
      for (const field of model.fields.filter(field => field.kind !== "object")) {
        const column = field.dbName ?? field.name;
        if (!present.get(table).has(column)) missingColumns.push(`${table}.${column}`);
      }
    }
    return { identity, localCount: local.size, appliedCount: applied.length, missingSource, checksumMismatch, unfinished, pending,
      modelCount: Prisma.dmmf.datamodel.models.length, missingTables, missingColumns,
      schemaPresence: missingTables.length || missingColumns.length ? "INCOMPLETE" : "PRESENT",
      status: missingSource.length || checksumMismatch.length || unfinished.length || pending.length || missingTables.length || missingColumns.length ? "BLOCKED" : "CONSISTENT" };
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.status === "CONSISTENT" ? 0 : 1;
} catch (error) {
  // Never print Prisma messages, SQL, credentials or connection metadata.
  const code = error instanceof Error && /^DATABASE_IDENTITY_MISMATCH$/.test(error.message) ? error.message
    : typeof error?.code === "string" && /^P\d{4}$/.test(error.code) ? error.code : "MIGRATION_CHECK_FAILED";
  process.stderr.write(`${code}\n`);
  process.exitCode = 2;
} finally { await db.$disconnect(); }
