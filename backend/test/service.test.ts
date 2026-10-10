import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotFoundException } from "@nestjs/common";
import { ProductService } from "../src/product.service";
import type { PrismaService } from "../src/data-access/prisma.service";
import { Prisma } from "@prisma/client";

const service = new ProductService();
const projectId = "project-community-sonic-sovereign";
const initiativeSlug = "evpn-bgp-validation-pack";
const moduleSlug = "rd-radar";
const securityGateId = "security-gate-evpn-bgp";
const releaseCandidateId = "release-candidate-evpn-bgp-001";

describe("ProductService", () => {
  for (const missing of [[], [{ table_name: "SshTarget" }]]) {
    it(`default readiness checks generated model tables: ${missing.length ? "missing schema" : "complete schema"}`, async () => {
      let calls = 0;
      const client = { $queryRaw: async (sql: TemplateStringsArray, tables: string) => {
        calls++;
        assert.match(sql.join("?"), /to_regclass/);
        assert.doesNotMatch(sql.join("?"), /INSERT|UPDATE|DELETE|CREATE|ALTER/i);
        assert.deepEqual(JSON.parse(tables), Prisma.dmmf.datamodel.models.map(model => model.dbName ?? model.name));
        return missing;
      } } as unknown as PrismaService;
      const instance = new ProductService(undefined, client);
      instance.setRuntimeEnvForTest({ SEKHEM_RUNTIME_MODE: "postgres_read", SEKHEM_DATA_SOURCE: "postgres_read", DATABASE_URL: "redacted-test-url" });
      const result = await instance.dbReadiness();
      assert.equal(calls, 1);
      assert.equal(result.db, missing.length ? "not_ready" : "ready");
      assert.equal(result.status, missing.length ? "unavailable" : "ok");
      assert.doesNotMatch(JSON.stringify(result), /SshTarget|schema incomplete|redacted-test-url/);
    });
  }
  it("returns health data", () => {
    const result = service.health();

    assert.equal(result.status, "ok");
    assert.equal(result.service, "sekhem-product-api");
    assert.equal(result.environment, "development");
    assert.equal(typeof result.uptimeSeconds, "number");
  });

  it("returns safe degraded DB readiness in memory fallback mode", async () => {
    const service = new ProductService();
    service.setRuntimeEnvForTest({});
    service.setDbReadinessProbeForTest(async () => {
      throw new Error("probe must not run in fallback mode");
    });

    const result = await service.dbReadiness();

    assert.deepEqual(Object.keys(result).sort(), ["checkedAt", "component", "dataSource", "db", "runtimeMode", "status"].sort());
    assert.equal(result.status, "degraded");
    assert.equal(result.db, "not_ready");
    assert.equal(result.runtimeMode, "memory");
    assert.equal(result.dataSource, "fallback");
    assert.equal(result.component, "postgres");
    assert.ok(Date.parse(result.checkedAt));
  });

  it("returns safe ready DB readiness in postgres_read mode", async () => {
    let probeCalls = 0;
    const service = new ProductService();
    service.setRuntimeEnvForTest({
      SEKHEM_RUNTIME_MODE: "postgres_read",
      SEKHEM_DATA_SOURCE: "postgres_read",
      SEKHEM_DB_WRITE_MODE: "rd_radar_only",
      SEKHEM_DB_MIGRATIONS_ALLOWED: "false",
      SEKHEM_DB_SEED_ALLOWED: "false",
      SEKHEM_ALLOW_EXTERNAL_ADAPTERS: "false",
      DATABASE_URL: "redacted-test-url"
    });
    service.setDbReadinessProbeForTest(async () => {
      probeCalls += 1;
    });

    const result = await service.dbReadiness();

    assert.equal(result.status, "ok");
    assert.equal(result.db, "ready");
    assert.equal(result.runtimeMode, "postgres_read");
    assert.equal(result.dataSource, "postgres_read");
    assert.equal(result.component, "postgres");
    assert.equal(probeCalls, 1);
  });

  it("returns safe unavailable DB readiness without raw error fields", async () => {
    const service = new ProductService();
    service.setRuntimeEnvForTest({
      SEKHEM_RUNTIME_MODE: "postgres_read",
      SEKHEM_DATA_SOURCE: "postgres_read",
      SEKHEM_DB_WRITE_MODE: "rd_radar_only",
      SEKHEM_DB_MIGRATIONS_ALLOWED: "false",
      SEKHEM_DB_SEED_ALLOWED: "false",
      SEKHEM_ALLOW_EXTERNAL_ADAPTERS: "false",
      DATABASE_URL: "redacted-test-url"
    });
    service.setDbReadinessProbeForTest(async () => {
      throw new Error("raw database host 10.0.0.1 should never be exposed");
    });

    const result = await service.dbReadiness();
    const serialized = JSON.stringify(result).toLowerCase();

    assert.equal(result.status, "unavailable");
    assert.equal(result.db, "not_ready");
    assert.equal(result.runtimeMode, "postgres_read");
    assert.equal(result.dataSource, "postgres_read");
    assert.equal(serialized.includes("database_url"), false);
    assert.equal(serialized.includes("10.0.0.1"), false);
    assert.equal(serialized.includes("raw database host"), false);
    assert.equal(serialized.includes("password"), false);
    assert.equal(serialized.includes("stack"), false);
  });

  it("returns seeded projects", () => {
    const result = service.listProjects();

    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, projectId);
  });

  it("returns dashboard aggregate for a valid project", () => {
    const result = service.getDashboard(projectId);

    assert.equal(result.project.id, projectId);
    assert.ok(result.modules.length > 0);
    assert.ok(result.recommendedInitiatives.length > 0);
    assert.ok(result.recentActivity.length > 0);
  });

  it("throws NotFound for invalid project dashboard", () => {
    assert.throws(() => service.getDashboard("missing-project"), NotFoundException);
  });

  it("returns module detail by slug", () => {
    const result = service.getModule(moduleSlug);

    assert.equal(result.slug, moduleSlug);
    assert.ok(result.capabilities.length > 0);
  });

  it("returns initiative detail by slug", () => {
    const result = service.getInitiative(initiativeSlug);

    assert.equal(result.slug, initiativeSlug);
    assert.equal(result.technicalMemo?.initiativeSlug, initiativeSlug);
    assert.equal(result.securityGate?.id, securityGateId);
  });

  it("returns initiative task lanes", () => {
    const result = service.getInitiativeTasks(initiativeSlug);

    assert.equal(result.initiativeSlug, initiativeSlug);
    assert.ok(result.lanes.some((lane) => lane.key === "blocked"));
    assert.ok(result.lanes.flatMap((lane) => lane.tasks).length > 0);
  });

  it("returns scoped initiative activity", () => {
    const result = service.getInitiativeActivity(initiativeSlug);

    assert.ok(result.length > 0);
    assert.ok(result.every((event) => event.initiativeSlug === initiativeSlug));
  });

  it("returns scoped initiative blockers", () => {
    const result = service.getInitiativeBlockers(initiativeSlug);

    assert.equal(result.initiativeSlug, initiativeSlug);
    assert.ok(result.blockers.length > 0);
    assert.ok(result.blockers.every((blocker) => blocker.initiativeSlug === initiativeSlug));
  });

  it("returns security gate detail", () => {
    const result = service.getSecurityGate(securityGateId);

    assert.equal(result.id, securityGateId);
    assert.ok(result.checks.length > 0);
    assert.ok(result.findings.length > 0);
  });

  it("returns release candidate detail", () => {
    const result = service.getReleaseCandidate(releaseCandidateId);

    assert.equal(result.id, releaseCandidateId);
    assert.ok(result.artifacts.length > 0);
    assert.ok(result.approvalChecklist.length > 0);
  });

  it("filters list data by query", () => {
    const approvals = service.listApprovals({ status: "pending" });
    const blockers = service.listBlockers({ severity: "high" });
    const initiatives = service.listInitiatives({ riskLevel: "high" });

    assert.ok(approvals.length > 0);
    assert.ok(approvals.every((item) => item.status === "pending"));
    assert.ok(blockers.length > 0);
    assert.ok(blockers.every((item) => item.severity === "high"));
    assert.ok(initiatives.length > 0);
    assert.ok(initiatives.every((item) => item.technicalRisk === "high"));
  });
});
