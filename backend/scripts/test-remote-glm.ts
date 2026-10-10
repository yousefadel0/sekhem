import "reflect-metadata";
import { readFileSync } from "fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { RuntimeConfigurationService } from "../src/ai-gateway/runtime-configuration.service";
import { VllmOpenAiCompatibleAdapter } from "../src/ai-gateway/providers/vllm-openai-compatible.adapter";

function loadEnv(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {}
}
loadEnv("backend/.env");

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const runtimeConfigs = app.get(RuntimeConfigurationService);
  const vllm = app.get(VllmOpenAiCompatibleAdapter);

  try {
    const providers = await runtimeConfigs.providers();
    const p = providers.find((pr) => pr.healthState === "healthy" && pr.providerType === "vllm_openai_compatible");
    if (!p) throw new Error("No healthy vLLM provider found");

    const provider = await runtimeConfigs.providerForUse(p.id);
    console.log("Provider resolved:", { id: provider.id, baseUrl: provider.baseUrl, timeoutMs: provider.defaultTimeoutMs });

    console.log("Sending chat request to GLM-5.2-Abliterated...");
    const started = Date.now();
    const result = await vllm.chat(
      { baseUrl: provider.baseUrl, apiKey: provider.apiKey, timeoutMs: 120_000 },
      {
        modelId: "GLM-5.2-Abliterated",
        maxOutputTokens: 512,
        systemPrompt: "Return one JSON object only with one string field named answer.",
        userPrompt: "Explain what SONiC is in two short paragraphs.",
        structuredOutput: {
          dialect: provider.structuredOutputDialect!,
          schema: {
            type: "object",
            properties: { answer: { type: "string" } },
            required: ["answer"],
            additionalProperties: false
          },
          name: "assistant_answer"
        }
      }
    );
    console.log("SUCCESS in", Date.now() - started, "ms!");
    console.log("CONTENT:", result.content);
    console.log("METADATA:", result.metadata);
  } catch (err: any) {
    console.error("FAILED:", err.message, err.safeHttpClassification || "");
  } finally {
    await app.close();
  }
}

main();
