import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createContractTestApp } from "./helpers/contract-test-app";

import { ApiExceptionFilter } from "../src/common/api-exception.filter";

type HttpBody = {
  data: Record<string, unknown> | Record<string, unknown>[] | null;
  meta: { timestamp?: string; total?: number };
  errors: unknown[];
};

const forbiddenTerms = [
  "rawhtml",
  "rawcontent",
  "fullheaders",
  "secrets",
  "token",
  "authorization",
  "password",
  "privatekey",
  "embedding",
  "vector",
  "internal log",
  "github",
  "openai",
  "n8n"
];

describe("Knowledge Base HTTP contract", () => {
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    app = await createContractTestApp();
    app.setGlobalPrefix("api");
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0);

    const server = app.getHttpServer() as { address: () => string | { port: number } | null };
    const address = server.address();
    if (typeof address !== "object" || address === null) {
      throw new Error("Expected HTTP server to listen on a local port.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await app.close();
  });

  it("returns sanitized Knowledge Base items", async () => {
    const response = await fetch(`${baseUrl}/api/knowledge/items`);
    const body = (await response.json()) as HttpBody;

    assert.equal(response.status, 200);
    assert.equal(Array.isArray(body.data), true);
    assert.equal((body.data as Record<string, unknown>[]).length, 3);
    assert.equal(body.meta.total, 3);
    assert.equal(typeof body.meta.timestamp, "string");
    assert.deepEqual(body.errors, []);

    const items = body.data as Record<string, unknown>[];
    assert.deepEqual(
      items.map((item) => item.sourceLabel),
      ["R&D Radar reviewed decision", "AI Patch Assistant audit decision", "Repository Source Adapter readiness"]
    );
    for (const item of items) {
      for (const field of [
        "knowledgeItemId",
        "sourceType",
        "title",
        "summary",
        "sourceId",
        "sourceLabel",
        "createdAt",
        "permissionsScope",
        "customerSafeSummary"
      ]) {
        assert.equal(typeof item[field], "string");
        assert.notEqual(item[field], "");
      }
    }

    const serialized = JSON.stringify(body.data).toLowerCase();
    for (const forbidden of forbiddenTerms) {
      assert.equal(serialized.includes(forbidden), false);
    }
  });

  it("returns one sanitized Knowledge Base item", async () => {
    const response = await fetch(`${baseUrl}/api/knowledge/items/knowledge-rd-radar-csf-review-decision-001`);
    const body = (await response.json()) as HttpBody;

    assert.equal(response.status, 200);
    assert.equal((body.data as Record<string, unknown>).knowledgeItemId, "knowledge-rd-radar-csf-review-decision-001");
    assert.deepEqual(body.errors, []);
  });

  it("returns a safe 404 for an unknown knowledge item", async () => {
    const response = await fetch(`${baseUrl}/api/knowledge/items/missing-knowledge-item`);
    const body = (await response.json()) as HttpBody;

    assert.equal(response.status, 404);
    assert.equal(body.data, null);
    assert.equal(typeof body.meta.timestamp, "string");
    assert.deepEqual(body.errors, [{ code: "NOT_FOUND", message: "Knowledge item not found" }]);
  });
});
