export type SekhemRuntimeMode = "memory" | "postgres_read";
export type SekhemDataSource = "memory" | "postgres_read";
export type SekhemDbWriteMode = "none" | "rd_radar_only";
export type SekhemBooleanFlag = "true" | "false";

export interface RuntimeConfigEnv {
  SEKHEM_RUNTIME_MODE?: string;
  SEKHEM_DATA_SOURCE?: string;
  SEKHEM_DB_WRITE_MODE?: string;
  SEKHEM_DB_MIGRATIONS_ALLOWED?: string;
  SEKHEM_DB_SEED_ALLOWED?: string;
  SEKHEM_ALLOW_EXTERNAL_ADAPTERS?: string;
  DATABASE_URL?: string;
}

export interface RuntimeConfig {
  runtimeMode: SekhemRuntimeMode;
  dataSource: SekhemDataSource;
  dbWriteMode: SekhemDbWriteMode;
  dbMigrationsAllowed: false;
  dbSeedAllowed: false;
  externalAdaptersAllowed: false;
}

export class RuntimeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeConfigError";
  }
}

const BOOLEAN_FLAGS = new Set<SekhemBooleanFlag>(["true", "false"]);

export class RuntimeConfigService {
  load(env: RuntimeConfigEnv = process.env): RuntimeConfig {
    const runtimeMode = this.readAllowedValue<SekhemRuntimeMode>(
      env.SEKHEM_RUNTIME_MODE,
      "SEKHEM_RUNTIME_MODE",
      ["memory", "postgres_read"],
      "memory"
    );
    const dataSource = this.readAllowedValue<SekhemDataSource>(
      env.SEKHEM_DATA_SOURCE,
      "SEKHEM_DATA_SOURCE",
      ["memory", "postgres_read"],
      "memory"
    );
    const dbWriteMode = this.readAllowedValue<SekhemDbWriteMode>(
      env.SEKHEM_DB_WRITE_MODE,
      "SEKHEM_DB_WRITE_MODE",
      ["none", "rd_radar_only"],
      "none"
    );
    const dbMigrationsAllowed = this.readBooleanFlag(
      env.SEKHEM_DB_MIGRATIONS_ALLOWED,
      "SEKHEM_DB_MIGRATIONS_ALLOWED",
      "false"
    );
    const dbSeedAllowed = this.readBooleanFlag(env.SEKHEM_DB_SEED_ALLOWED, "SEKHEM_DB_SEED_ALLOWED", "false");
    const externalAdaptersAllowed = this.readBooleanFlag(
      env.SEKHEM_ALLOW_EXTERNAL_ADAPTERS,
      "SEKHEM_ALLOW_EXTERNAL_ADAPTERS",
      "false"
    );

    if (runtimeMode === "memory" && dataSource !== "memory") {
      throw new RuntimeConfigError("Unsafe runtime config: memory runtime mode requires SEKHEM_DATA_SOURCE=memory.");
    }

    if (runtimeMode === "postgres_read" && dataSource !== "postgres_read") {
      throw new RuntimeConfigError(
        "Unsafe runtime config: postgres_read runtime mode requires SEKHEM_DATA_SOURCE=postgres_read."
      );
    }

    if ((runtimeMode === "postgres_read" || dataSource === "postgres_read") && !this.hasNonEmptyValue(env.DATABASE_URL)) {
      throw new RuntimeConfigError("Unsafe runtime config: DATABASE_URL is required for postgres_read mode.");
    }

    if (dbWriteMode === "rd_radar_only" && (runtimeMode !== "postgres_read" || dataSource !== "postgres_read")) {
      throw new RuntimeConfigError("Unsafe runtime config: R&D Radar persistence requires postgres_read runtime and data source.");
    }

    if (dbMigrationsAllowed) {
      throw new RuntimeConfigError("Unsafe runtime config: migrations are not allowed in Batch 7A.");
    }

    if (dbSeedAllowed) {
      throw new RuntimeConfigError("Unsafe runtime config: db seed is not allowed in Batch 7A.");
    }

    if (externalAdaptersAllowed) {
      throw new RuntimeConfigError("Unsafe runtime config: external adapters are not allowed in Batch 7A.");
    }

    return {
      runtimeMode,
      dataSource,
      dbWriteMode,
      dbMigrationsAllowed: false,
      dbSeedAllowed: false,
      externalAdaptersAllowed: false
    };
  }

  assertSafe(env: RuntimeConfigEnv = process.env): RuntimeConfig {
    return this.load(env);
  }

  private readAllowedValue<T extends string>(value: string | undefined, name: string, allowed: T[], fallback: T): T {
    const resolved = value ?? fallback;

    if (!allowed.includes(resolved as T)) {
      throw new RuntimeConfigError(`Invalid ${name}: ${resolved}. Allowed values: ${allowed.join(", ")}.`);
    }

    return resolved as T;
  }

  private readBooleanFlag(value: string | undefined, name: string, fallback: SekhemBooleanFlag): boolean {
    const resolved = value ?? fallback;

    if (!BOOLEAN_FLAGS.has(resolved as SekhemBooleanFlag)) {
      throw new RuntimeConfigError(`Invalid ${name}: ${resolved}. Allowed values: true, false.`);
    }

    return resolved === "true";
  }

  private hasNonEmptyValue(value: string | undefined): boolean {
    return typeof value === "string" && value.trim().length > 0;
  }
}
