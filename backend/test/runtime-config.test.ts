import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RuntimeConfigError, RuntimeConfigService } from "../src/runtime-config.service";

const service = new RuntimeConfigService();

const readOnlyDatabaseUrl = "postgresql://sekhem_readonly:password@example.internal:5432/sekhem?schema=public";

describe("RuntimeConfigService", () => {
  it("defaults to safe memory and contract-only guardrail values", () => {
    const result = service.load({});

    assert.equal(result.runtimeMode, "memory");
    assert.equal(result.dataSource, "memory");
    assert.equal(result.dbWriteMode, "none");
    assert.equal(result.dbMigrationsAllowed, false);
    assert.equal(result.dbSeedAllowed, false);
    assert.equal(result.externalAdaptersAllowed, false);
  });

  it("accepts memory mode without DATABASE_URL", () => {
    const result = service.load({
      SEKHEM_RUNTIME_MODE: "memory",
      SEKHEM_DATA_SOURCE: "memory"
    });

    assert.equal(result.runtimeMode, "memory");
    assert.equal(result.dataSource, "memory");
  });

  it("accepts explicit memory-safe configuration", () => {
    const result = service.load({
      SEKHEM_RUNTIME_MODE: "memory",
      SEKHEM_DATA_SOURCE: "memory",
      SEKHEM_DB_WRITE_MODE: "none",
      SEKHEM_DB_MIGRATIONS_ALLOWED: "false",
      SEKHEM_DB_SEED_ALLOWED: "false",
      SEKHEM_ALLOW_EXTERNAL_ADAPTERS: "false"
    });

    assert.equal(result.runtimeMode, "memory");
    assert.equal(result.dataSource, "memory");
  });

  it("rejects postgres_read without DATABASE_URL", () => {
    assert.throws(
      () =>
        service.load({
          SEKHEM_RUNTIME_MODE: "postgres_read",
          SEKHEM_DATA_SOURCE: "postgres_read"
        }),
      RuntimeConfigError
    );
  });

  it("rejects postgres_read with empty DATABASE_URL", () => {
    assert.throws(
      () =>
        service.load({
          SEKHEM_RUNTIME_MODE: "postgres_read",
          SEKHEM_DATA_SOURCE: "postgres_read",
          DATABASE_URL: "   "
        }),
      RuntimeConfigError
    );
  });

  it("accepts postgres_read with DATABASE_URL as read-only prepared mode", () => {
    const result = service.load({
      SEKHEM_RUNTIME_MODE: "postgres_read",
      SEKHEM_DATA_SOURCE: "postgres_read",
      SEKHEM_DB_WRITE_MODE: "none",
      SEKHEM_DB_MIGRATIONS_ALLOWED: "false",
      SEKHEM_DB_SEED_ALLOWED: "false",
      SEKHEM_ALLOW_EXTERNAL_ADAPTERS: "false",
      DATABASE_URL: readOnlyDatabaseUrl
    });

    assert.equal(result.runtimeMode, "postgres_read");
    assert.equal(result.dataSource, "postgres_read");
    assert.equal(result.dbWriteMode, "none");
    assert.equal("DATABASE_URL" in result, false);
  });

  it("rejects invalid runtime mode", () => {
    assert.throws(() => service.load({ SEKHEM_RUNTIME_MODE: "production" }), RuntimeConfigError);
  });

  it("rejects invalid data source", () => {
    assert.throws(() => service.load({ SEKHEM_DATA_SOURCE: "postgres_write" }), RuntimeConfigError);
  });

  it("rejects memory runtime with postgres data source", () => {
    assert.throws(
      () => service.load({ SEKHEM_RUNTIME_MODE: "memory", SEKHEM_DATA_SOURCE: "postgres_read" }),
      RuntimeConfigError
    );
  });

  it("rejects postgres_read runtime without postgres_read data source", () => {
    assert.throws(
      () =>
        service.load({
          SEKHEM_RUNTIME_MODE: "postgres_read",
          SEKHEM_DATA_SOURCE: "memory",
          DATABASE_URL: readOnlyDatabaseUrl
        }),
      RuntimeConfigError
    );
  });

  it("accepts explicit R&D Radar persistence write mode with postgres runtime guardrails", () => {
    const result = service.load({
      SEKHEM_RUNTIME_MODE: "postgres_read",
      SEKHEM_DATA_SOURCE: "postgres_read",
      SEKHEM_DB_WRITE_MODE: "rd_radar_only",
      SEKHEM_DB_MIGRATIONS_ALLOWED: "false",
      SEKHEM_DB_SEED_ALLOWED: "false",
      SEKHEM_ALLOW_EXTERNAL_ADAPTERS: "false",
      DATABASE_URL: readOnlyDatabaseUrl
    });

    assert.equal(result.runtimeMode, "postgres_read");
    assert.equal(result.dataSource, "postgres_read");
    assert.equal(result.dbWriteMode, "rd_radar_only");
  });

  it("rejects R&D Radar persistence write mode without postgres runtime", () => {
    assert.throws(
      () =>
        service.load({
          SEKHEM_RUNTIME_MODE: "memory",
          SEKHEM_DATA_SOURCE: "memory",
          SEKHEM_DB_WRITE_MODE: "rd_radar_only"
        }),
      RuntimeConfigError
    );
  });

  it("rejects unapproved Prisma-backed write modes", () => {
    assert.throws(() => service.load({ SEKHEM_DB_WRITE_MODE: "staging" }), RuntimeConfigError);
  });

  it("rejects migration activation", () => {
    assert.throws(() => service.load({ SEKHEM_DB_MIGRATIONS_ALLOWED: "true" }), RuntimeConfigError);
  });

  it("rejects seed activation", () => {
    assert.throws(() => service.load({ SEKHEM_DB_SEED_ALLOWED: "true" }), RuntimeConfigError);
  });

  it("rejects external adapter activation", () => {
    assert.throws(() => service.load({ SEKHEM_ALLOW_EXTERNAL_ADAPTERS: "true" }), RuntimeConfigError);
  });

  it("rejects non-boolean guardrail flags", () => {
    assert.throws(() => service.load({ SEKHEM_DB_SEED_ALLOWED: "yes" }), RuntimeConfigError);
  });
});
