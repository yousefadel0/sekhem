import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { INestApplication } from "@nestjs/common";
import { createContractTestApp } from "./helpers/contract-test-app";

import { ApiExceptionFilter } from "../src/common/api-exception.filter";
import { RagService } from "../src/rag/rag.service";

const forbiddenResponseFields = ["rawHtml", "rawContent", "fullHeaders", "secrets"];

describe("RAG indexing MVP preview service", () => {
  it("maps sanitized 1930 knowledge fixtures into citation-bearing preview chunks", () => {
    const result = new RagService().indexPreview();

    assert.equal(result.chunks.length, 3);
    assert.deepEqual(result.safety, {
      noEmbedding: true,
      noVectorDb: true,
      noAiAnswer: true,
      readOnly: true
    });

    for (const chunk of result.chunks) {
      assert.match(chunk.chunkId, /^chunk-knowledge-/);
      assert.match(chunk.knowledgeItemId, /^knowledge-/);
      assert.notEqual(chunk.sourceLabel, "");
      assert.notEqual(chunk.title, "");
      assert.notEqual(chunk.chunkTextPreview, "");
      assert.notEqual(chunk.citationLabel, "");
      assert.match(chunk.citationRef, /^knowledge-item:knowledge-/);
      assert.equal(chunk.permissionsScope, "internal_review");
      assert.equal(chunk.indexedAt, null);
      assert.equal(chunk.indexingStatus, "preview_only");
    }
  });

  it("returns a deterministic static answer preview with citations and non-AI safety flags", () => {
    const result = new RagService().answerPreview({
      question: "What reviewed readiness evidence is available?"
    });

    assert.notEqual(result.answerPreview, "");
    assert.equal(result.citations.length, 3);
    assert.equal(result.sourceChunks.length, 3);
    assert.deepEqual(result.safetyFlags, {
      aiGenerated: false,
      noAiProvider: true,
      noEmbedding: true,
      noVectorDb: true,
      readOnly: true,
      previewOnly: true
    });
    assert.deepEqual(
      result.citations.map((citation) => citation.chunkId),
      result.sourceChunks.map((chunk) => chunk.chunkId)
    );
  });

  it("has no embedding, vector-store, AI, persistence, file-storage, or repository-write delegates", () => {
    const service = new RagService() as unknown as Record<string, unknown>;

    for (const field of ["embeddings", "vectorStore", "aiProvider", "prismaClient", "database", "fileStorage", "repositoryWriter", "github"]) {
      assert.equal(field in service, false);
    }
  });
});

describe("RAG indexing MVP preview HTTP contract", () => {
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

  it("returns wrapped read-only preview chunks with safety flags", async () => {
    const response = await fetch(`${baseUrl}/api/rag/index-preview`);
    const body = (await response.json()) as {
      data: ReturnType<RagService["indexPreview"]>;
      meta: { timestamp?: string };
      errors: unknown[];
    };

    assert.equal(response.status, 200);
    assert.equal(body.data.chunks.length, 3);
    assert.equal(body.data.safety.noEmbedding, true);
    assert.equal(body.data.safety.noVectorDb, true);
    assert.equal(body.data.safety.noAiAnswer, true);
    assert.equal(body.data.safety.readOnly, true);
    assert.equal(body.data.chunks.every((chunk) => chunk.indexingStatus === "preview_only"), true);
    assert.equal(typeof body.meta.timestamp, "string");
    assert.deepEqual(body.errors, []);

    for (const forbiddenField of forbiddenResponseFields) {
      assert.equal(Object.hasOwn(body.data, forbiddenField), false);
      assert.equal(body.data.chunks.some((chunk) => Object.hasOwn(chunk, forbiddenField)), false);
    }
  });

  it("does not expose write methods", async () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
      const response = await fetch(`${baseUrl}/api/rag/index-preview`, { method });
      assert.equal(response.status >= 400, true);
    }
  });

  it("returns a wrapped deterministic answer preview with citations", async () => {
    const response = await fetch(`${baseUrl}/api/rag/answer-preview`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        question: "What reviewed readiness evidence is available?"
      })
    });
    const body = (await response.json()) as {
      data: ReturnType<RagService["answerPreview"]>;
      meta: { timestamp?: string };
      errors: unknown[];
    };

    assert.equal(response.status, 201);
    assert.notEqual(body.data.answerPreview, "");
    assert.equal(body.data.citations.length, 3);
    assert.equal(body.data.sourceChunks.length, 3);
    assert.deepEqual(body.data.safetyFlags, {
      aiGenerated: false,
      noAiProvider: true,
      noEmbedding: true,
      noVectorDb: true,
      readOnly: true,
      previewOnly: true
    });
    assert.equal(typeof body.meta.timestamp, "string");
    assert.deepEqual(body.errors, []);
  });

  it("rejects missing question and forbidden raw or secret fields", async () => {
    for (const body of [
      {},
      { question: "Review readiness", rawHtml: "<main>unsafe</main>" },
      { question: "Review readiness", nested: { rawContent: "unsafe" } },
      { question: "Review readiness", fullHeaders: { authorization: "unsafe" } },
      { question: "Review readiness", secrets: "unsafe" }
    ]) {
      const response = await fetch(`${baseUrl}/api/rag/answer-preview`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });

      assert.equal(response.status >= 400, true);
    }
  });
});
