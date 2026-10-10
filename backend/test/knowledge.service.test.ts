import { NotFoundException } from "@nestjs/common";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KnowledgeService } from "../src/knowledge.service";

describe("KnowledgeService read-only fixture contract", () => {
  it("returns sanitized knowledge items for the approved foundation sources", () => {
    const service = new KnowledgeService();
    const items = service.listItems();

    assert.equal(items.length, 3);
    assert.deepEqual(
      items.map((item) => item.sourceType),
      ["decision", "decision", "repository_evidence"]
    );
    assert.deepEqual(
      items.map((item) => item.sourceLabel),
      ["R&D Radar reviewed decision", "AI Patch Assistant audit decision", "Repository Source Adapter readiness"]
    );

    for (const item of items) {
      assert.match(item.knowledgeItemId, /^knowledge-/);
      assert.notEqual(item.title, "");
      assert.notEqual(item.summary, "");
      assert.notEqual(item.customerSafeSummary, "");
      assert.equal(item.permissionsScope, "internal_review");
      assert.equal(typeof item.createdAt, "string");
    }
  });

  it("returns a cloned item and throws a safe not-found error", () => {
    const service = new KnowledgeService();
    const first = service.listItems()[0];
    assert.ok(first);

    const read = service.getItem(first.knowledgeItemId);
    assert.deepEqual(read, first);
    assert.notEqual(read, first);
    assert.throws(() => service.getItem("missing-knowledge-item"), NotFoundException);
  });

  it("has no persistence, provider, vector-store, upload, or workflow delegates", () => {
    const service = new KnowledgeService() as unknown as Record<string, unknown>;

    for (const field of ["prismaClient", "database", "aiProvider", "embeddings", "vectorStore", "github", "workflow", "n8n", "filesystem", "fileUpload"]) {
      assert.equal(field in service, false);
    }
  });
});
