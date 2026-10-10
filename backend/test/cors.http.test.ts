import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContractTestApp } from "./helpers/contract-test-app";
import type { INestApplication } from "@nestjs/common";

import { ApiExceptionFilter } from "../src/common/api-exception.filter";
import { corsOptionsFromEnvironment } from "../src/cors.config";

const approvedOrigin = "https://app.sekhem-ai.com";
const unknownOrigin = "https://unapproved.example";

describe("Production CORS boundary", () => {
  let app: INestApplication;
  let baseUrl: string;

  before(async () => {
    app = await createContractTestApp();
    app.setGlobalPrefix("api");
    app.enableCors(corsOptionsFromEnvironment({ SEKHEM_CORS_ALLOWED_ORIGINS: approvedOrigin }));
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.listen(0, "127.0.0.1");

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

  it("allows the approved browser origin preflight with credentials", async () => {
    const response = await fetch(`${baseUrl}/api/rd-radar/analysis-runs`, {
      method: "OPTIONS",
      headers: {
        Origin: approvedOrigin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "Content-Type, Authorization"
      }
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), approvedOrigin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    assert.equal(response.headers.get("access-control-allow-methods"), "GET,POST,PATCH,OPTIONS");
    assert.equal(response.headers.get("access-control-allow-headers"), "Content-Type,Authorization");
    assert.equal(response.headers.get("vary"), "Origin");
  });

  it("does not allow an unknown browser origin", async () => {
    const response = await fetch(`${baseUrl}/api/rd-radar/analysis-runs`, {
      method: "OPTIONS",
      headers: {
        Origin: unknownOrigin,
        "Access-Control-Request-Method": "GET"
      }
    });

    assert.equal(response.ok, false);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("access-control-allow-credentials"), null);
  });

  it("retains approved credentialed CORS headers on an unauthenticated 401 response", async () => {
    const response = await fetch(`${baseUrl}/api/rd-radar/analysis-runs`, {
      headers: { Origin: approvedOrigin }
    });

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("access-control-allow-origin"), approvedOrigin);
    assert.equal(response.headers.get("access-control-allow-credentials"), "true");
    assert.equal(response.headers.get("vary"), "Origin");
  });

  it("keeps no-origin health checks available", async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});
