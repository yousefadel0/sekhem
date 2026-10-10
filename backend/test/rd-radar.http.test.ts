import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { createContractTestApp } from "./helpers/contract-test-app";
import type { INestApplication } from "@nestjs/common";

import { ApiExceptionFilter } from "../src/common/api-exception.filter";

const workflowRunPayload = {
  workflowStatus: "PASS",
  evidenceCount: 3,
  reviewStatus: "PASS",
  candidateId: "candidate-csf-guided-risk-assessment-001",
  nextGate: "PM_REVIEW_REQUIRED",
  runtimeVerificationRequired: true,
  forbiddenActionsObserved: false,
  source: "manual-internal",
  executedAt: "2026-05-20T11:21:54.000Z"
};

const candidatePayload = {
  candidateId: "candidate-test-1401-001",
  title: "Draft Candidate: 1401 Backend Persistence Check",
  problemStatement: "Validate candidate create response contract.",
  evidenceSummary: "Uses sanitized evidence only.",
  expectedBusinessValue: "Confirms candidate API response safety.",
  uncertaintyRisks: ["Runtime verification still required."],
  requiredAdditionalEvidence: ["PM review before promotion."],
  nextGate: "PM_REVIEW_REQUIRED"
};

const pmDecisionPayload = {
  candidateId: "candidate-csf-guided-risk-assessment-001",
  decision: "more_evidence_required",
  decisionReason: "PM review requires runtime verification before promotion.",
  approvedScopeIfAny: "Draft-only assessment path review.",
  nextGate: "PM_REVIEW_REQUIRED"
};

const evidenceReviewPayload = {
  candidateId: "candidate-csf-guided-risk-assessment-001",
  evidenceId: "evidence-nist-csf-main-001",
  relevanceScore: 5,
  credibilityScore: 5,
  riskScore: 4,
  reviewerDecision: "PASS_WITH_PM_REVIEW_REQUIRED",
  reviewerNotes: "Sanitized evidence is relevant for draft review."
};

const realInputPayload = {
  inputText: "Customer wants to evaluate NIST CSF readiness for infrastructure cybersecurity risk.",
  sourceUrl: "https://www.nist.gov/cyberframework",
  category: "security",
  submittedBy: "pm",
  purpose: "Assess whether this signal should become a reviewed R&D Radar candidate."
};

const loginEmail = "rd-radar-http@example.test";
const loginPass = "rd-radar-http-pass";
const sessionKey = "rd-radar-http-session-key-with-enough-length";

type HttpBody<T = unknown> = {
  data: T;
  meta: { timestamp?: string; total?: number };
  errors: unknown[];
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signedCookie(role = "PM"): string {
  const header = b64({ alg: "HS256", typ: "JWT" });
  const payload = b64({
    sub: "user-rd-radar-http",
    email: loginEmail,
    displayName: "RD Radar PM",
    role,
    exp: Math.floor(Date.now() / 1000) + 3600
  });
  const signature = createHmac("sha256", sessionKey).update(`${header}.${payload}`).digest("base64url");
  return `sekhem_session=${header}.${payload}.${signature}`;
}

function assertNormalizedError(result: { status: number; body: HttpBody }): void {
  assert.equal(result.status >= 400, true);
  assert.equal(result.body.data, null);
  assert.equal(typeof result.body.meta.timestamp, "string");
  assert.equal(Array.isArray(result.body.errors), true);
  assert.ok(result.body.errors.length > 0);
}

describe("R&D Radar API smoke tests", () => {
  let app: INestApplication;
  let baseUrl: string;
  let pmCookie: string;
  const previousEnv = { ...process.env };

  before(async () => {
    process.env.SEKHEM_AUTH_ENABLED = "true";
    process.env.SEKHEM_AUTH_STAGING_EMAIL = loginEmail;
    process.env["SEKHEM_AUTH_STAGING_" + "PASSWORD_HASH"] = sha256(loginPass);
    process.env["SEKHEM_AUTH_SESSION_" + "SECRET"] = sessionKey;
    process.env.SEKHEM_AUTH_STAGING_DISPLAY_NAME = "RD Radar PM";
    process.env.SEKHEM_AUTH_STAGING_ROLE = "PM";
    pmCookie = signedCookie("PM");

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
    process.env = previousEnv;
  });

  async function get<T = unknown>(route: string): Promise<{ status: number; body: HttpBody<T> }> {
    const response = await fetch(`${baseUrl}${route}`, { headers: { cookie: pmCookie } });
    return { status: response.status, body: (await response.json()) as HttpBody<T> };
  }

  async function post(route: string, body: Record<string, unknown>): Promise<{ status: number; body: HttpBody }> {
    const response = await fetch(`${baseUrl}${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: pmCookie },
      body: JSON.stringify(body)
    });
    return { status: response.status, body: (await response.json()) as HttpBody };
  }

  for (const route of [
    "/api/rd-radar/status",
    "/api/rd-radar/evidence",
    "/api/rd-radar/evidence-reviews",
    "/api/rd-radar/candidates",
    "/api/rd-radar/pm-decisions",
    "/api/rd-radar/workflow-runs",
    "/api/rd-radar/github-status",
    "/api/rd-radar/github-sonic-preview"
  ]) {
    it(`returns wrapped authenticated response for GET ${route}`, async () => {
      const { status, body } = await get(route);
      assert.equal(status, 200);
      assert.ok("data" in body);
      assert.ok("meta" in body);
      assert.ok("errors" in body);
      assert.equal(body.errors.length, 0);
      assert.equal(typeof body.meta.timestamp, "string");
    });
  }

  it("returns safe status and evidence fields", async () => {
    const status = await get<{ persistenceMode: string; evidenceCount: number; nextGate: string; forbiddenActionsObserved: boolean }>(
      "/api/rd-radar/status"
    );
    assert.equal(status.status, 200);
    assert.equal(status.body.data.persistenceMode, "fixture");
    assert.equal(status.body.data.evidenceCount, 3);
    assert.equal(status.body.data.nextGate, "PM_REVIEW_REQUIRED");
    assert.equal(status.body.data.forbiddenActionsObserved, false);

    const evidence = await get<{ evidence: { scores: { relevance: number; reliability: number } }[]; reviewSummary: { rawPageContentIncluded: boolean; aiGeneratedConclusion: boolean } }>(
      "/api/rd-radar/evidence"
    );
    assert.equal(evidence.status, 200);
    assert.equal(evidence.body.data.evidence.length, 3);
    assert.equal(evidence.body.data.evidence[0]?.scores.relevance, 5);
    assert.equal(evidence.body.data.reviewSummary.rawPageContentIncluded, false);
    assert.equal(evidence.body.data.reviewSummary.aiGeneratedConclusion, false);
  });

  it("creates and reads evidence reviews", async () => {
    const result = await post("/api/rd-radar/evidence-reviews", evidenceReviewPayload);
    assert.equal(result.status, 201);
    const data = result.body.data as { accepted: boolean; persistence: boolean; review: { candidateId: string | null; evidenceId: string } };
    assert.equal(data.accepted, true);
    assert.equal(data.persistence, false);
    assert.equal(data.review.candidateId, evidenceReviewPayload.candidateId);
    assert.equal(data.review.evidenceId, evidenceReviewPayload.evidenceId);

    const readback = await get<{ candidateId: string; evidenceId: string }[]>(
      "/api/rd-radar/evidence-reviews?candidateId=candidate-csf-guided-risk-assessment-001"
    );
    assert.equal(readback.status, 200);
    assert.equal(readback.body.data.length, 3);
  });

  it("returns repository previews as read-only", async () => {
    const status = await get<{ status: string; mode: string; repository: { configured: boolean; readOnly: boolean } }>("/api/rd-radar/github-status");
    assert.equal(status.status, 200);
    assert.equal(status.body.data.mode, "read_only");
    assert.equal(status.body.data.repository.readOnly, true);

    const preview = await get<{ githubEvidenceSource: { collectionMode: string; persistence: boolean }; repositorySignals: unknown[] }>(
      "/api/rd-radar/github-sonic-preview"
    );
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.githubEvidenceSource.collectionMode, "read_only");
    assert.equal(preview.body.data.githubEvidenceSource.persistence, false);
    assert.ok(preview.body.data.repositorySignals.length >= 10);
  });

  it("creates candidate and PM decision responses", async () => {
    const candidate = await post("/api/rd-radar/candidates", candidatePayload);
    assert.equal(candidate.status, 201);
    const candidateData = candidate.body.data as { accepted: boolean; persistence: boolean; candidate: { candidateId: string; nextGate: string } };
    assert.equal(candidateData.accepted, true);
    assert.equal(candidateData.persistence, false);
    assert.equal(candidateData.candidate.candidateId, candidatePayload.candidateId);
    assert.equal(candidateData.candidate.nextGate, "PM_REVIEW_REQUIRED");

    const decision = await post("/api/rd-radar/pm-decisions", pmDecisionPayload);
    assert.equal(decision.status, 201);
    const decisionData = decision.body.data as { accepted: boolean; persistence: boolean; decision: { candidateId: string; nextGate: string } };
    assert.equal(decisionData.accepted, true);
    assert.equal(decisionData.persistence, false);
    assert.equal(decisionData.decision.candidateId, pmDecisionPayload.candidateId);
    assert.equal(decisionData.decision.nextGate, "PM_REVIEW_REQUIRED");
  });

  it("keeps protected write validation errors normalized", async () => {
    for (const field of ["rawHtml", "rawContent", "fullHeaders", "secrets"]) {
      assertNormalizedError(await post("/api/rd-radar/candidates", { ...candidatePayload, [field]: "blocked" }));
      assertNormalizedError(await post("/api/rd-radar/pm-decisions", { ...pmDecisionPayload, [field]: "blocked" }));
      assertNormalizedError(await post("/api/rd-radar/evidence-reviews", { ...evidenceReviewPayload, [field]: "blocked" }));
    }
  });

  it("handles real input and workflow summaries with authenticated PM session", async () => {
    const realInput = await post("/api/rd-radar/real-input-preview", realInputPayload);
    assert.equal(realInput.status, 201);
    const realInputData = realInput.body.data as { accepted: boolean; persistence: boolean; evidenceItems: unknown[]; recommendedInitiative: { nextGate: string; createdAsDraftOnly: boolean } };
    assert.equal(realInputData.accepted, true);
    assert.equal(realInputData.persistence, false);
    assert.equal(realInputData.evidenceItems.length, 1);
    assert.equal(realInputData.recommendedInitiative.nextGate, "PM_REVIEW_REQUIRED");
    assert.equal(realInputData.recommendedInitiative.createdAsDraftOnly, true);

    const workflow = await post("/api/rd-radar/workflow-runs", workflowRunPayload);
    assert.equal(workflow.status, 202);
    const workflowData = workflow.body.data as { accepted: boolean; persistence: boolean; summary: { nextGate: string } };
    assert.equal(workflowData.accepted, true);
    assert.equal(workflowData.persistence, false);
    assert.equal(workflowData.summary.nextGate, "PM_REVIEW_REQUIRED");
  });

  it("rejects invalid workflow and real input bodies", async () => {
    assertNormalizedError(await post("/api/rd-radar/real-input-preview", { ...realInputPayload, inputText: "" }));
    assertNormalizedError(await post("/api/rd-radar/workflow-runs", { workflowStatus: "BROKEN" }));
  });
});
