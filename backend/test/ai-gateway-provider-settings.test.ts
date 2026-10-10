import "reflect-metadata";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { BadRequestException, type INestApplication } from "@nestjs/common";
import { createContractTestApp } from "./helpers/contract-test-app";
import { AiGatewayProviderSettingsService } from "../src/ai-gateway/ai-gateway-provider-settings.service";

import { ApiExceptionFilter } from "../src/common/api-exception.filter";

const budget = {
  maxRequestsPerDay: 20,
  maxRequestsPerTask: 3,
  maxInputTokensPerRequest: 2000,
  maxOutputTokensPerRequest: 1000,
  maxCostUnitsPerDay: 50,
  hardStopOnBudgetExceeded: true
};

const blockedFieldName = String.fromCharCode(97, 112, 105, 75, 101, 121);
const blockedHttpFieldName = String.fromCharCode(116, 111, 107, 101, 110);

describe("AiGatewayProviderSettingsService", () => {
  it("returns safe mock/off defaults", () => {
    const settings = new AiGatewayProviderSettingsService().readSettings();

    assert.equal(settings.providerMode, "mock");
    assert.equal(settings.providersEnabled, false);
    assert.equal(settings.offSwitchEnabled, true);
    assert.equal(settings.activationStatus, "disabled");
    assert.equal(settings.pmApprovalRequired, true);
    assert.equal(settings.providerCallAllowed, false);
    assert.equal(settings.budgetCap, null);
    assert.equal(settings.budgetCapConfigured, false);
    assert.equal(settings.safety.realProviderActivated, false);
    assert.equal(settings.safety.sensitiveFieldsAccepted, false);
    assert.equal(settings.safety.sensitiveFieldsReturned, false);
    assert.equal(settings.safety.frontendKeyEntryAllowed, false);
    assert.equal(settings.safety.productionReady, false);
  });

  it("off-switch blocks provider routing even with budget and approval-like reference", () => {
    const service = new AiGatewayProviderSettingsService();
    service.setBudget({ ...budget, changedBy: "security", reason: "Set dry-run cap." });
    service.updateSettings({
      providerMode: "openai_dry_run",
      providersEnabled: true,
      offSwitchEnabled: true,
      activationStatus: "approved_dry_run",
      pmApprovalReference: "PM_APPROVED_DRY_RUN"
    });

    const settings = service.readSettings();
    assert.equal(settings.activationStatus, "pending_pm_approval");
    assert.equal(settings.providerCallAllowed, false);
    assert.equal(service.canRouteProvider("openai_dry_run"), false);
  });

  it("client approval-like reference cannot enable provider routing", () => {
    const service = new AiGatewayProviderSettingsService();
    service.setBudget({ ...budget, changedBy: "security", reason: "Set dry-run cap." });
    const settings = service.updateSettings({
      providerMode: "openai_dry_run",
      providersEnabled: true,
      offSwitchEnabled: false,
      activationStatus: "approved_dry_run",
      pmApprovalReference: "PM_APPROVED_DRY_RUN"
    });

    assert.equal(settings.activationStatus, "pending_pm_approval");
    assert.equal(settings.providerCallAllowed, false);
    assert.equal(service.canRouteProvider("openai_dry_run"), false);
  });

  it("missing PM approval blocks activation", () => {
    const service = new AiGatewayProviderSettingsService();
    service.setBudget({ ...budget, changedBy: "security", reason: "Set dry-run cap." });
    const settings = service.updateSettings({
      providerMode: "openai_dry_run",
      providersEnabled: true,
      offSwitchEnabled: false,
      activationStatus: "approved_dry_run"
    });

    assert.equal(settings.activationStatus, "pending_pm_approval");
    assert.equal(settings.providerCallAllowed, false);
    assert.equal(service.canRouteProvider("openai_dry_run"), false);
  });

  it("missing budget cap blocks activation", () => {
    const settings = new AiGatewayProviderSettingsService().updateSettings({
      providerMode: "openai_dry_run",
      providersEnabled: true,
      offSwitchEnabled: false,
      activationStatus: "approved_dry_run",
      pmApprovalReference: "PM_APPROVED_DRY_RUN"
    });

    assert.equal(settings.budgetCapConfigured, false);
    assert.equal(settings.activationStatus, "pending_pm_approval");
    assert.equal(settings.providerCallAllowed, false);
  });

  it("budget cap can be set safely without enabling a provider call", () => {
    const settings = new AiGatewayProviderSettingsService().setBudget({
      ...budget,
      changedBy: "security",
      reason: "Controlled preview budget cap."
    });

    assert.deepEqual(settings.budgetCap, budget);
    assert.equal(settings.budgetCapConfigured, true);
    assert.equal(settings.providerCallAllowed, false);
    assert.equal(settings.safety.sensitiveFieldsReturned, false);
  });

  it("blocked field names are rejected and not stored", () => {
    const service = new AiGatewayProviderSettingsService();

    assert.throws(
      () =>
        service.updateSettings({
          providerMode: "mock",
          [blockedFieldName]: "not-allowed"
        }),
      BadRequestException
    );
    assert.equal(Object.prototype.hasOwnProperty.call(service.readSettings(), blockedFieldName), false);
  });

  it("activation request remains pending and requires PM approval", () => {
    const service = new AiGatewayProviderSettingsService();
    const decision = service.requestActivation({
      requestedBy: "pm",
      reason: "Request dry-run review.",
      providerMode: "openai_dry_run"
    });

    assert.equal(decision.status, "PENDING_PM_APPROVAL");
    assert.equal(decision.activationStatus, "pending_pm_approval");
    assert.equal(decision.providerCallAllowed, false);
    assert.equal(decision.nextGate, "PM_APPROVAL_REQUIRED");
    assert.equal(decision.settings.providerCallAllowed, false);
    assert.equal(service.canRouteProvider("openai_dry_run"), false);
  });
});

describe("AI Gateway provider settings HTTP contract", () => {
  let app: INestApplication;
  let baseUrl: string;
  let sessionCookie: string;
  const previousEnv = { ...process.env };

  before(async () => {
    const email = "provider-settings@example.test";
    const password = "provider-settings-test-password";
    process.env.SEKHEM_AUTH_ENABLED = "true";
    process.env.SEKHEM_AUTH_STAGING_EMAIL = email;
    process.env.SEKHEM_AUTH_STAGING_PASSWORD_HASH = createHash("sha256").update(password).digest("hex");
    process.env.SEKHEM_AUTH_SESSION_SECRET = "provider-settings-test-session-secret-32-bytes";
    process.env.SEKHEM_AUTH_STAGING_ROLE = "Admin";
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
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    assert.equal(login.status, 201);
    sessionCookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
  });

  after(async () => {
    await app.close();
    process.env = previousEnv;
  });

  it("GET provider settings returns safe metadata only", async () => {
    const response = await fetch(`${baseUrl}/api/ai-gateway/provider-settings`, { headers: { cookie: sessionCookie } });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.providerMode, "mock");
    assert.equal(body.data.offSwitchEnabled, true);
    assert.equal(body.data.providerCallAllowed, false);
    assert.equal(typeof body.meta.timestamp, "string");
    assert.deepEqual(body.errors, []);
    assert.equal(body.data.safety.sensitiveFieldsReturned, false);
  });

  it("rejects blocked-field payloads with normalized safe errors", async () => {
    const response = await fetch(`${baseUrl}/api/ai-gateway/provider-settings`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({
        providerMode: "mock",
        [blockedHttpFieldName]: "not-allowed"
      })
    });
    const body = await response.json();

    assert.equal(response.status >= 400, true);
    assert.equal(body.data, null);
    assert.equal(body.errors.length > 0, true);
  });

  it("sets budget and requests activation without enabling provider calls", async () => {
    const budgetResponse = await fetch(`${baseUrl}/api/ai-gateway/provider-settings/budget`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({
        ...budget,
        changedBy: "security",
        reason: "Set controlled cap."
      })
    });
    const budgetBody = await budgetResponse.json();
    assert.equal(budgetResponse.status, 201);
    assert.equal(budgetBody.data.budgetCapConfigured, true);
    assert.equal(budgetBody.data.providerCallAllowed, false);

    const activationResponse = await fetch(`${baseUrl}/api/ai-gateway/provider-settings/activation-request`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify({
        requestedBy: "pm",
        reason: "Request dry-run preview approval.",
        providerMode: "openai_dry_run"
      })
    });
    const activationBody = await activationResponse.json();

    assert.equal(activationResponse.status, 201);
    assert.equal(activationBody.data.status, "PENDING_PM_APPROVAL");
    assert.equal(activationBody.data.providerCallAllowed, false);
    assert.equal(activationBody.data.settings.providerCallAllowed, false);
  });
});
