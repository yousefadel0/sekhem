import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AiGatewayController } from "../src/ai-gateway/ai-gateway.controller";
import { AUTHZ_ROLES_KEY } from "../src/auth/authz.constants";
import { RepositoryConfigurationController } from "../src/repository-source/repository-configuration.controller";

describe("R&D Radar V1 authorization and UI contracts", () => {
  it("restricts provider, model, and repository configuration writes to Admin", () => {
    const methods = [
      AiGatewayController.prototype.createProvider,
      AiGatewayController.prototype.updateProvider,
      AiGatewayController.prototype.activateProvider,
      AiGatewayController.prototype.createModel,
      AiGatewayController.prototype.updateModel,
      RepositoryConfigurationController.prototype.createConnection,
      RepositoryConfigurationController.prototype.updateConnection,
      RepositoryConfigurationController.prototype.testConnection,
    ];
    for (const method of methods) assert.deepEqual(Reflect.getMetadata(AUTHZ_ROLES_KEY, method), ["Admin"]);
  });

  it("derives configuration audit actors from the authenticated session", async () => {
    const recorded: Record<string, unknown>[] = [];
    const sessionActor = "Session Admin [Admin]";
    const authService = {
      session: () => ({ user: { id: "admin-user", displayName: "Session Admin", role: "Admin" } })
    };
    const settingsService = {
      setOffSwitch: (body: Record<string, unknown>) => { recorded.push(body); return {}; },
      requestActivation: (body: Record<string, unknown>) => { recorded.push(body); return {}; }
    };
    const runtimeService = {
      createProvider: async (body: Record<string, unknown>) => { recorded.push(body); return {}; },
      updateModel: async (_id: string, body: Record<string, unknown>) => { recorded.push(body); return {}; },
      setProviderEnabled: async (_id: string, _enabled: boolean, actor: string) => { recorded.push({ changedBy: actor }); return {}; },
      testProvider: async (_id: string, actor: string) => { recorded.push({ changedBy: actor }); return {}; }
    };
    const gateway = new AiGatewayController({} as never, settingsService as never, runtimeService as never, authService as never);

    await gateway.createProvider({ changedBy: "Spoofed Admin", displayName: "Provider" }, "session=cookie");
    await gateway.updateModel("model", { changedBy: "Spoofed Admin", displayName: "Model" }, "session=cookie");
    await gateway.activateProvider("provider", { enabled: true, changedBy: "Spoofed Admin" }, "session=cookie");
    await gateway.testProvider("provider", { changedBy: "Spoofed Admin" }, "session=cookie");
    gateway.setProviderOffSwitch({ offSwitchEnabled: true, changedBy: "Spoofed Admin", reason: "review" }, "session=cookie");
    gateway.requestProviderActivation({ requestedBy: "Spoofed Admin", reason: "review", providerMode: "mock" }, "session=cookie");

    const repositoryService = {
      createConnection: async (body: Record<string, unknown>) => { recorded.push(body); return {}; },
      updateConnection: async (_id: string, body: Record<string, unknown>) => { recorded.push(body); return {}; }
    };
    const repositories = new RepositoryConfigurationController(repositoryService as never, authService as never);
    await repositories.createConnection({ changedBy: "Spoofed Admin", displayName: "Repository" }, "session=cookie");
    await repositories.updateConnection("repository", { changedBy: "Spoofed Admin", displayName: "Repository" }, "session=cookie");

    assert.deepEqual(recorded.map((item) => item.changedBy ?? item.requestedBy), Array(recorded.length).fill(sessionActor));
  });

  it("keeps configuration and analysis in the backend path without operational fixture substitution", async () => {
    const root = resolve(process.cwd(), "..");
    const livePanel = await readFile(resolve(root, "components/rd-radar-live-analysis-panel.tsx"), "utf8");
    const radarPage = await readFile(resolve(root, "app/demo/rd-radar/page.tsx"), "utf8");
    const adminPanel = await readFile(resolve(root, "components/runtime-configuration-panel.tsx"), "utf8");
    assert.match(livePanel, /\/rd-radar\/analysis-runs/);
    assert.match(livePanel, /Live data only/);
    assert.equal(radarPage.includes('from "@/lib/demo-data"'), false);
    assert.match(radarPage, /No demonstration fixtures were substituted/);
    assert.match(adminPanel, /\/ai-gateway\/providers/);
    assert.match(adminPanel, /\/repository-source\/connections/);
    assert.equal(/fetch\([^)]*v1\/chat\/completions/.test(livePanel), false);
    assert.equal(/fetch\([^)]*(github|gitlab)/i.test(livePanel + adminPanel), false);
  });

  it("renders only sanitized failed-run schema and runtime diagnostics", async () => {
    const livePanel = await readFile(resolve(process.cwd(), "..", "components/rd-radar-live-analysis-panel.tsx"), "utf8");
    for (const safeField of ["validationIssues", "runtimeMetadata", "issue.path", "issue.code", "issue.expectedType", "finishReason", "promptTokens", "completionTokens", "configuredMaxOutputTokens"]) {
      assert.equal(livePanel.includes(safeField), true);
    }
    assert.match(livePanel, /run\.status === "REVIEW_REQUIRED" && run\.result\.summary/);
    assert.match(livePanel, /run\.status === "REVIEW_REQUIRED" && run\.result\.findings/);
    assert.equal(/run\.result\.(raw|content|prompt|messages|credentials|authorization)/i.test(livePanel), false);
  });
});
