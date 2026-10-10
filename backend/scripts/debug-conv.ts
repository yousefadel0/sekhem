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
  const vllmProvider = app.get(VllmOpenAiCompatibleAdapter);

  try {
    console.log("Step 1: getting providers...");
    const providerDto = (await runtimeConfigs.providers()).find((item) => item.enabled && item.healthState === "healthy" && item.providerType === "vllm_openai_compatible");
    console.log("providerDto:", providerDto?.id);

    console.log("Step 2: providerForUse...");
    const provider = await runtimeConfigs.providerForUse(providerDto!.id);
    console.log("provider:", provider.id, provider.baseUrl);

    console.log("Step 3: models...");
    const models = (await runtimeConfigs.models(provider.id)).filter((item) => item.enabled);
    const model = models.find((item) => item.defaultForProvider) ?? models[0];
    console.log("model:", model?.modelId);

    const systemPrompt = "Return one JSON object only with one string field named answer. Be concise, natural, harmless, and explicit that humans approve decisions. Do not include evidence sources unless supplied by the user.";
    const history = [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hi there! How can I help you today?" },
      { role: "user", content: "What is SONiC?" },
      { role: "assistant", content: "SONiC (Software for Open Networking in the Cloud) is an open-source network operating system originally developed by Microsoft for use in cloud data centers." },
      { role: "user", content: "Explain BGP in simple terms." },
      { role: "assistant", content: "BGP (Border Gateway Protocol) is like a GPS for the internet." }
    ];
    const question = "اسمك ايه";

    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: question }
    ];

    console.log("Step 4: calling vllmProvider.chat...");
    const call = await vllmProvider.chat(
      { baseUrl: provider.baseUrl, apiKey: provider.apiKey, timeoutMs: 120000 },
      {
        modelId: model.modelId,
        maxOutputTokens: Math.min(Math.max(model.maxOutputTokens, 2048), 4096),
        systemPrompt,
        userPrompt: question,
        messages: chatMessages,
        structuredOutput: provider.structuredOutputDialect
          ? {
              dialect: provider.structuredOutputDialect,
              schema: {
                type: "object",
                properties: { answer: { type: "string" } },
                required: ["answer"],
                additionalProperties: false
              },
              name: "assistant_answer"
            }
          : undefined
      }
    );
    console.log("Step 4 call success! Content:", call.content);
  } catch (err: any) {
    console.error("FAILED AT STEP with error:", err.name, err.message);
    console.error("Stack:", err.stack);
    console.error("Safe HTTP classification:", err.safeHttpClassification);
    console.error("vllmMetadata:", err.vllmMetadata);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
