import { BadGatewayException, BadRequestException, Injectable, Optional, RequestTimeoutException } from "@nestjs/common";
import type { StructuredOutputDialect } from "../runtime-configuration.dto";
import type { AiGatewayExecutionAdapter, ProviderStreamOptions } from "../provider-execution.adapter";

import { ASSISTANT_CONTEXT_LIMITS, assertModelContextFits, modelContextBudget } from "../assistant-context-budget";

type Fetcher = typeof fetch;

/** Shared by transport and inspection byte accounting; contains exactly the dispatched non-streaming envelope. */
export function chatCompletionBody(request: VllmChatRequest, maxOutputTokens: number): Record<string, unknown> {
  const body: Record<string, unknown> = { model: request.modelId,
    messages: request.messages?.length ? request.messages : [{ role: "system", content: request.systemPrompt }, { role: "user", content: request.userPrompt }],
    temperature: 0, max_tokens: maxOutputTokens };
  if ((request.structuredOutput?.dialect ?? request.dialect) === "LLAMACPP_JSON_SCHEMA") {
    body.reasoning_effort = "none"; body.chat_template_kwargs = { enable_thinking: false };
  }
  if (request.structuredOutput) structuredOutputBody(body, request.structuredOutput);
  return body;
}
function structuredOutputBody(body: Record<string, unknown>, output: NonNullable<VllmChatRequest["structuredOutput"]>) {
  if (output.dialect === "LLAMACPP_JSON_SCHEMA") body.response_format = { type: "json_schema", schema: output.schema };
  else if (output.dialect === "OPENAI_JSON_SCHEMA") body.response_format = { type: "json_schema", json_schema: { name: output.name, strict: true, schema: output.schema } };
  else if (output.dialect === "VLLM_STRUCTURED_OUTPUTS") { delete body.response_format; body.structured_outputs = { json: output.schema }; }
  else if (output.dialect === "JSON_OBJECT_ONLY") body.response_format = { type: "json_object" };
  else throw new BadRequestException("Structured output dialect is unsupported");
}

export interface VllmConnectionConfiguration {
  baseUrl: string;
  apiKey: string | null;
  timeoutMs: number;
  /** Observability only; enabled internally for structured inspection. */
  captureRequestTiming?: boolean;
}

/** Diagnostics only: origin excludes userinfo, path, query and fragment. */
function diagnosticOrigin(baseUrl: string): string | null {
  try { const url = new URL(baseUrl); return ["http:", "https:"].includes(url.protocol) ? url.origin : null; }
  catch { return null; }
}
export interface ProviderRequestTiming {
  providerOrigin?: string | null;
  deadlineAt?: number;
  responseCompleteAt?: number | null;
  dispatchedAt: number;
  responseHeadersAt: number | null;
  requestBytes: number;
}

export interface VllmChatRequest {
  /** Transport controls also apply to conversational requests without a JSON schema. */
  dialect?: StructuredOutputDialect;
  /** Known model context enables its configured output reservation; unknown contexts retain legacy bounds. */
  contextWindow?: number;
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  structuredOutput?: { dialect: StructuredOutputDialect; schema: Record<string, unknown>; name: string };
  dialectTest?: boolean;
  messages?: Array<{ role: string; content: string | Array<Record<string, unknown>> }>;
}

export interface OpenAiCompatibleModelMetadata { id: string; ownedBy: string | null; }

export interface VllmCallMetadata {
  requestTiming?: ProviderRequestTiming;
  failureStage?: "REQUEST" | "RESPONSE_BODY" | "RESPONSE_CONTENT";
  failureCode?: ProviderFailureCode;
  /** Presence only; null means no inspectable response message was received. */
  refusalFieldPresent?: boolean | null;
  providerCallExecuted: true;
  durationMs: number;
  httpClassification: "SUCCESS" | "UNAUTHORIZED" | "NOT_FOUND" | "TIMEOUT" | "PROVIDER_ERROR" | "INVALID_JSON" | "INVALID_SCHEMA";
  httpStatus: number | null;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  configuredMaxOutputTokens: number;
}

export const PROVIDER_FAILURE_CODES = ["CLIENT_DEADLINE", "HTTP_REJECTION", "INVALID_JSON", "INVALID_CONTENT", "NETWORK_ERROR", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET", "CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"] as const;
export type ProviderFailureCode = typeof PROVIDER_FAILURE_CODES[number];

export interface VllmChatResult {
  content: string;
  metadata: VllmCallMetadata;
}

export type ProviderDialectFailureCode =
  | "DIALECT_HTTP_REJECTION"
  | "DIALECT_TIMEOUT"
  | "DIALECT_NO_CONTENT"
  | "DIALECT_OUTPUT_TRUNCATED"
  | "DIALECT_JSON_INVALID"
  | "DIALECT_SCHEMA_INVALID"
  | "DIALECT_PERSISTENCE";

export interface ProviderDialectTestDiagnostic {
  stage: "DIALECT_REQUEST" | "DIALECT_RESPONSE" | "DIALECT_JSON_PARSE" | "DIALECT_SCHEMA_VALIDATE" | "DIALECT_PERSISTENCE";
  attemptedDialect: StructuredOutputDialect | null;
  reasonCode: ProviderDialectFailureCode | null;
  upstreamHttpStatus: number | null;
  transportErrorType: "BadGatewayException" | "RequestTimeoutException" | "Error" | null;
  transportErrorCode: VllmCallMetadata["httpClassification"] | null;
  responseReceived: boolean;
  generationStarted: boolean | null;
  contentPresent: boolean;
  jsonParseResult: "NOT_ATTEMPTED" | "PASS" | "FAIL";
  schemaIssues: Array<{ path: string; code: string }>;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
}

export class ProviderDialectTestError extends Error {
  constructor(
    readonly reasonCode: ProviderDialectFailureCode,
    readonly diagnostic: ProviderDialectTestDiagnostic
  ) {
    super(reasonCode);
    this.name = "ProviderDialectTestError";
  }
}

type SafeTransportError = Error & { requestTiming?: ProviderRequestTiming; safeHttpClassification?: VllmCallMetadata["httpClassification"]; safeHttpStatus?: number | null; safeDurationMs?: number; safeFailureStage?: VllmCallMetadata["failureStage"]; safeFailureCode?: ProviderFailureCode };
type SafeChatError = Error & { vllmMetadata?: VllmCallMetadata; responseReceived?: boolean; generationStarted?: boolean | null; contentPresent?: boolean };

export function vllmMetadataFromError(error: unknown): VllmCallMetadata | null {
  return error instanceof Error ? (error as SafeChatError).vllmMetadata ?? null : null;
}

@Injectable()
export class VllmOpenAiCompatibleAdapter implements AiGatewayExecutionAdapter {
  readonly providerType = "vllm_openai_compatible";
  readonly capabilities = Object.freeze(["chat", "streaming", "structured_output", "multimodal", "model_discovery"] as const);

  constructor(@Optional() private readonly fetcher: Fetcher = fetch) { }

  async discoverModels(configuration: VllmConnectionConfiguration): Promise<string[]> {
    return (await this.discoverModelMetadata(configuration)).map((item) => item.id);
  }

  async discoverModelMetadata(configuration: VllmConnectionConfiguration): Promise<OpenAiCompatibleModelMetadata[]> {
    const { body } = await this.requestJson(configuration, "/models", { method: "GET" });
    if (!this.isRecord(body) || !Array.isArray(body.data)) {
      throw new BadGatewayException("Provider returned an invalid models response");
    }

    return body.data
      .map((item) => this.isRecord(item) && typeof item.id === "string" ? { id: item.id.trim(), ownedBy: typeof item.owned_by === "string" ? item.owned_by.trim().slice(0, 80) : null } : null)
      .filter((item): item is OpenAiCompatibleModelMetadata => Boolean(item?.id))
      .filter((item, index, values) => values.findIndex((candidate) => candidate.id === item.id) === index)
      .slice(0, 100);
  }

  async testConnection(configuration: VllmConnectionConfiguration): Promise<void> {
    await this.discoverModels(configuration);
  }

  async testStructuredOutputDialect(
    configuration: VllmConnectionConfiguration,
    modelId: string,
    dialect: StructuredOutputDialect,
    configuredMaxOutputTokens: number
  ): Promise<ProviderDialectTestDiagnostic> {
    const schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
    let result: VllmChatResult;
    try {
      result = await this.chat(configuration, {
        modelId,
        maxOutputTokens: configuredMaxOutputTokens,
        systemPrompt: "Return one JSON object only with ok set to true.",
        userPrompt: "Confirm structured output support.",
        structuredOutput: { dialect, schema, name: "sekhem_structured_output_test" },
        dialectTest: true
      });
    } catch (error) {
      const safe = error instanceof Error ? error as SafeChatError : null;
      const metadata = safe?.vllmMetadata ?? null;
      const httpRejected = metadata?.httpStatus !== null && metadata?.httpStatus !== undefined && metadata.httpStatus >= 400;
      const reasonCode = metadata?.httpClassification === "TIMEOUT"
        ? "DIALECT_TIMEOUT"
        : httpRejected
          ? "DIALECT_HTTP_REJECTION"
          : metadata?.finishReason === "length"
            ? "DIALECT_OUTPUT_TRUNCATED"
            : "DIALECT_NO_CONTENT";
      throw new ProviderDialectTestError(reasonCode, {
        stage: metadata?.httpClassification === "TIMEOUT" || httpRejected ? "DIALECT_REQUEST" : "DIALECT_RESPONSE",
        attemptedDialect: dialect,
        reasonCode,
        upstreamHttpStatus: metadata?.httpStatus ?? null,
        transportErrorType: this.safeErrorType(error),
        transportErrorCode: metadata?.httpClassification ?? null,
        responseReceived: safe?.responseReceived ?? (metadata !== null && metadata.httpStatus !== null),
        generationStarted: safe?.generationStarted ?? null,
        contentPresent: safe?.contentPresent ?? false,
        jsonParseResult: "NOT_ATTEMPTED",
        schemaIssues: [],
        finishReason: metadata?.finishReason ?? null,
        promptTokens: metadata?.promptTokens ?? null,
        completionTokens: metadata?.completionTokens ?? null
      });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      const reasonCode = result.metadata.finishReason === "length" ? "DIALECT_OUTPUT_TRUNCATED" : "DIALECT_JSON_INVALID";
      throw new ProviderDialectTestError(reasonCode, this.dialectDiagnostic(result.metadata, dialect, {
        stage: "DIALECT_JSON_PARSE",
        reasonCode,
        jsonParseResult: "FAIL"
      }));
    }
    const schemaIssues = this.tinyDialectSchemaIssues(parsed);
    if (schemaIssues.length > 0) {
      throw new ProviderDialectTestError("DIALECT_SCHEMA_INVALID", this.dialectDiagnostic(result.metadata, dialect, {
        stage: "DIALECT_SCHEMA_VALIDATE",
        reasonCode: "DIALECT_SCHEMA_INVALID",
        jsonParseResult: "PASS",
        schemaIssues
      }));
    }
    return this.dialectDiagnostic(result.metadata, dialect, { stage: "DIALECT_SCHEMA_VALIDATE", reasonCode: null, jsonParseResult: "PASS" });
  }

  async chat(configuration: VllmConnectionConfiguration, request: VllmChatRequest): Promise<VllmChatResult> {
    this.validateContext(request);

    const configuredMaxOutputTokens = this.outputBudget(request);
    let response: { body: unknown; httpStatus: number; durationMs: number; requestTiming?: ProviderRequestTiming };
    try {
      const body = chatCompletionBody(request, configuredMaxOutputTokens);
      response = await this.requestJson(configuration, "/chat/completions", {
        method: "POST",
        body: JSON.stringify(body)
      });
    } catch (error) {
      if (error instanceof Error) {
        const transport = error as SafeTransportError;
        const safe = error as SafeChatError;
        safe.vllmMetadata = {
          ...(transport.requestTiming ? { requestTiming: transport.requestTiming } : {}),
          providerCallExecuted: true,
          durationMs: transport.safeDurationMs ?? 0,
          httpClassification: transport.safeHttpClassification ?? "PROVIDER_ERROR",
          httpStatus: transport.safeHttpStatus ?? null,
          finishReason: null,
          promptTokens: null,
          completionTokens: null,
          configuredMaxOutputTokens,
          failureStage: transport.safeFailureStage, failureCode: transport.safeFailureCode
        };
        safe.responseReceived = transport.safeHttpStatus !== null && transport.safeHttpStatus !== undefined;
        safe.generationStarted = transport.safeHttpStatus !== null && transport.safeHttpStatus !== undefined && transport.safeHttpStatus >= 400 && transport.safeHttpStatus < 500 ? false : null;
        safe.contentPresent = false;
      }
      throw error;
    }

    const body = response.body;
    const choices = this.isRecord(body) && Array.isArray(body.choices) ? body.choices : [];
    const first = choices[0];
    const message = this.isRecord(first) && this.isRecord(first.message) ? first.message : null;
    const content = message?.content;
    const usage = this.isRecord(body) && this.isRecord(body.usage) ? body.usage : {};
    const metadata: VllmCallMetadata = {
      ...(response.requestTiming ? { requestTiming: response.requestTiming } : {}),
      refusalFieldPresent: message ? Object.prototype.hasOwnProperty.call(message, "refusal") ||
        (Array.isArray(content) && content.some(part => this.isRecord(part) && part.type === "refusal")) : null,
      providerCallExecuted: true,
      durationMs: response.durationMs,
      httpClassification: "SUCCESS",
      httpStatus: response.httpStatus,
      finishReason: this.isRecord(first) && typeof first.finish_reason === "string" ? first.finish_reason.slice(0, 80) : null,
      promptTokens: this.nonNegativeInteger(usage.prompt_tokens),
      completionTokens: this.nonNegativeInteger(usage.completion_tokens),
      configuredMaxOutputTokens
    };
    if (typeof content !== "string" || content.trim().length === 0 || content.length > 128_000) {
      const error = new BadGatewayException("Provider returned an invalid chat response") as SafeChatError;
      error.vllmMetadata = metadata;
      metadata.failureStage = "RESPONSE_CONTENT";
      metadata.failureCode = "INVALID_CONTENT";
      error.responseReceived = true;
      error.generationStarted = this.generationStarted(metadata, typeof content === "string" && content.trim().length > 0);
      error.contentPresent = typeof content === "string" && content.trim().length > 0;
      throw error;
    }
    return {
      content: content.trim(),
      metadata
    };
  }

  async complete(configuration: VllmConnectionConfiguration, request: VllmChatRequest): Promise<VllmChatResult> {
    return this.chat(configuration, request);
  }

  async stream(
    configuration: VllmConnectionConfiguration,
    request: VllmChatRequest,
    options?: ProviderStreamOptions
  ): Promise<VllmChatResult> {
    this.validateContext(request);

    const configuredMaxOutputTokens = this.outputBudget(request);
    const messages = request.messages && request.messages.length > 0
      ? request.messages
      : [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt }
      ];
    const body: Record<string, unknown> = {
      model: request.modelId,
      messages,
      temperature: 0,
      max_tokens: configuredMaxOutputTokens,
      stream: true
    };
    if ((request.structuredOutput?.dialect ?? request.dialect) === "LLAMACPP_JSON_SCHEMA") {
      body.reasoning_effort = "none";
      body.chat_template_kwargs = { enable_thinking: false };
    }
    if (request.structuredOutput) this.applyStructuredOutput(body, request.structuredOutput);

    const controller = new AbortController();
    const startedAt = Date.now();
    const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);

    const onExternalAbort = () => controller.abort();
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeout);
        throw this.tagged(new RequestTimeoutException("Provider request cancelled"), "TIMEOUT", null, startedAt);
      }
      options.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    let response: Response;
    try {
      const headers: Record<string, string> = {
        accept: "text/event-stream",
        "content-type": "application/json"
      };
      if (configuration.apiKey) headers.authorization = `Bearer ${configuration.apiKey}`;

      response = await this.fetcher(this.endpointUrl(configuration.baseUrl, "/chat/completions"), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
        redirect: "error"
      });
    } catch (error) {
      clearTimeout(timeout);
      if (options?.signal) options.signal.removeEventListener("abort", onExternalAbort);
      const transportError = error instanceof BadGatewayException
        ? error
        : controller.signal.aborted
          ? this.tagged(new RequestTimeoutException("Provider request timed out"), "TIMEOUT", null, startedAt)
          : this.tagged(new BadGatewayException("Provider request failed"), "PROVIDER_ERROR", null, startedAt);
      const safe = transportError as SafeChatError;
      safe.vllmMetadata = {
        providerCallExecuted: true,
        durationMs: (transportError as SafeTransportError).safeDurationMs ?? Date.now() - startedAt,
        httpClassification: (transportError as SafeTransportError).safeHttpClassification ?? "PROVIDER_ERROR",
        httpStatus: (transportError as SafeTransportError).safeHttpStatus ?? null,
        finishReason: null,
        promptTokens: null,
        completionTokens: null,
        configuredMaxOutputTokens
      };
      safe.responseReceived = false;
      safe.generationStarted = false;
      safe.contentPresent = false;
      throw transportError;
    }

    if (!response.ok) {
      clearTimeout(timeout);
      if (options?.signal) options.signal.removeEventListener("abort", onExternalAbort);
      const classification = response.status === 401 || response.status === 403
        ? "UNAUTHORIZED"
        : response.status === 404
          ? "NOT_FOUND"
          : response.status === 408 || response.status === 504
            ? "TIMEOUT"
            : "PROVIDER_ERROR";
      const err = this.tagged(new BadGatewayException("Provider request failed"), classification, response.status, startedAt) as SafeChatError;
      err.vllmMetadata = {
        providerCallExecuted: true,
        durationMs: Date.now() - startedAt,
        httpClassification: classification,
        httpStatus: response.status,
        finishReason: null,
        promptTokens: null,
        completionTokens: null,
        configuredMaxOutputTokens
      };
      err.responseReceived = true;
      err.generationStarted = false;
      err.contentPresent = false;
      throw err;
    }

    if (!response.body) {
      clearTimeout(timeout);
      if (options?.signal) options.signal.removeEventListener("abort", onExternalAbort);
      const err = this.tagged(new BadGatewayException("Provider returned empty response stream"), "PROVIDER_ERROR", response.status, startedAt) as SafeChatError;
      err.vllmMetadata = {
        providerCallExecuted: true,
        durationMs: Date.now() - startedAt,
        httpClassification: "PROVIDER_ERROR",
        httpStatus: response.status,
        finishReason: null,
        promptTokens: null,
        completionTokens: null,
        configuredMaxOutputTokens
      };
      throw err;
    }

    let accumulated = "";
    let finishReason: string | null = null;
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;
    let generationStarted = false;
    let refusalFieldPresent = false;

    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        lineBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (this.isRecord(parsed)) {
              if (Array.isArray(parsed.choices) && parsed.choices[0]) {
                const choice = parsed.choices[0];
                if (this.isRecord(choice.delta) && Object.prototype.hasOwnProperty.call(choice.delta, "refusal")) refusalFieldPresent = true;
                if (typeof choice.finish_reason === "string" && choice.finish_reason) {
                  finishReason = choice.finish_reason.slice(0, 80);
                }
                const delta = choice.delta?.content;
                if (typeof delta === "string" && delta.length > 0) {
                  generationStarted = true;
                  accumulated += delta;
                  options?.onChunk?.({ delta, accumulated });
                }
              }
              if (this.isRecord(parsed.usage)) {
                promptTokens = this.nonNegativeInteger(parsed.usage.prompt_tokens) ?? promptTokens;
                completionTokens = this.nonNegativeInteger(parsed.usage.completion_tokens) ?? completionTokens;
              }
            }
          } catch {
            // Malformed SSE data chunk ignored safely without corrupting stream
          }
        }
      }
    } catch {
      const isAborted = controller.signal.aborted;
      const classification = isAborted ? "TIMEOUT" : "PROVIDER_ERROR";
      const err = (isAborted
        ? this.tagged(new RequestTimeoutException("Provider request timed out during streaming"), "TIMEOUT", null, startedAt)
        : this.tagged(new BadGatewayException("Provider stream interrupted"), "PROVIDER_ERROR", null, startedAt)) as SafeChatError;
      err.vllmMetadata = {
        providerCallExecuted: true,
        durationMs: Date.now() - startedAt,
        httpClassification: classification,
        httpStatus: response.status,
        finishReason,
        refusalFieldPresent,
        promptTokens,
        completionTokens,
        configuredMaxOutputTokens
      };
      err.responseReceived = true;
      err.generationStarted = generationStarted;
      err.contentPresent = accumulated.trim().length > 0;
      throw err;
    } finally {
      clearTimeout(timeout);
      if (options?.signal) options.signal.removeEventListener("abort", onExternalAbort);
    }

    const durationMs = Date.now() - startedAt;
    const metadata: VllmCallMetadata = {
      providerCallExecuted: true,
      durationMs,
      httpClassification: "SUCCESS",
      httpStatus: response.status,
      finishReason,
      refusalFieldPresent,
      promptTokens,
      completionTokens,
      configuredMaxOutputTokens
    };

    if (accumulated.trim().length === 0) {
      const err = new BadGatewayException("Provider returned an invalid chat response") as SafeChatError;
      err.vllmMetadata = metadata;
      err.responseReceived = true;
      err.generationStarted = false;
      err.contentPresent = false;
      throw err;
    }

    return {
      content: accumulated.trim(),
      metadata
    };
  }

  private outputBudget(request: VllmChatRequest): number {
    return request.contextWindow === undefined
      ? Math.min(Math.max(request.maxOutputTokens, 1), ASSISTANT_CONTEXT_LIMITS.legacyOutputTokens)
      : modelContextBudget({ contextWindow: request.contextWindow, maxOutputTokens: request.maxOutputTokens }).reservedOutputTokens;
  }

  private validateContext(request: VllmChatRequest): void {
    if (request.contextWindow !== undefined) {
      assertModelContextFits(
        { contextWindow: request.contextWindow, maxOutputTokens: request.maxOutputTokens },
        request.messages?.length ? request.messages : [
          { role: "system", content: request.systemPrompt }, { role: "user", content: request.userPrompt }
        ],
        request.structuredOutput
      );
    } else if (request.userPrompt.length > 96_000 || request.systemPrompt.length > 8_000) {
      // Existing R&D analysis/dialect-test contract. Live assistant requests use the model budget above.
      throw new BadRequestException("AI Gateway input exceeds the configured V1 bound");
    }
  }

  private async requestJson(
    configuration: VllmConnectionConfiguration,
    path: "/models" | "/chat/completions",
    init: { method: "GET" | "POST"; body?: string }
  ): Promise<{ body: unknown; httpStatus: number; durationMs: number; requestTiming?: ProviderRequestTiming }> {
    const controller = new AbortController();
    const startedAt = Date.now();
    const requestTiming = configuration.captureRequestTiming ? {
      providerOrigin: diagnosticOrigin(configuration.baseUrl),
      deadlineAt: startedAt + configuration.timeoutMs, responseCompleteAt: null as number | null,
      dispatchedAt: startedAt, responseHeadersAt: null as number | null,
      requestBytes: Buffer.byteLength(init.body ?? "", "utf8")
    } : undefined;
    const timeout = setTimeout(() => controller.abort(), configuration.timeoutMs);
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (init.body) headers["content-type"] = "application/json";
      if (configuration.apiKey) headers.authorization = `Bearer ${configuration.apiKey}`;
      const response = await this.fetcher(this.endpointUrl(configuration.baseUrl, path), {
        method: init.method,
        headers,
        body: init.body,
        signal: controller.signal,
        redirect: "error"
      });
      if (requestTiming) requestTiming.responseHeadersAt = Date.now();
      if (!response.ok) {
        const classification = response.status === 401 || response.status === 403
          ? "UNAUTHORIZED"
          : response.status === 404
            ? "NOT_FOUND"
            : response.status === 408 || response.status === 504
              ? "TIMEOUT"
              : "PROVIDER_ERROR";
        throw this.failure(this.tagged(new BadGatewayException("Provider request failed"), classification, response.status, startedAt), "REQUEST", "HTTP_REJECTION");
      }
      try {
        const body: unknown = await response.json();
        if (requestTiming) requestTiming.responseCompleteAt = Date.now();
        return { body, httpStatus: response.status, durationMs: Date.now() - startedAt,
          ...(requestTiming ? { requestTiming } : {}) };
      } catch (error) {
        if (requestTiming && error instanceof SyntaxError) requestTiming.responseCompleteAt = Date.now();
        // Preserve the existing rejection semantics; distinguish body transport/abort from JSON syntax in diagnostics.
        throw this.failure(this.tagged(new BadGatewayException("Provider returned invalid JSON"), "INVALID_JSON", response.status, startedAt),
          "RESPONSE_BODY", controller.signal.aborted ? "CLIENT_DEADLINE" : error instanceof SyntaxError ? "INVALID_JSON" : this.failureCode(error));
      }
    } catch (error) {
      if (requestTiming && error instanceof Error) Object.assign(error, { requestTiming });
      if (error instanceof BadGatewayException) throw error;
      const failure = controller.signal.aborted
        ? this.failure(this.tagged(new RequestTimeoutException("Provider request timed out"), "TIMEOUT", null, startedAt), "REQUEST", "CLIENT_DEADLINE")
        : this.failure(this.tagged(new BadGatewayException("Provider request failed"), "PROVIDER_ERROR", null, startedAt), "REQUEST", this.failureCode(error));
      if (requestTiming) Object.assign(failure, { requestTiming });
      throw failure;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private failureCode(error: unknown): ProviderFailureCode {
    // Never retain messages, URLs, stacks, headers, addresses or arbitrary error codes.
    let current = error;
    for (let depth = 0; depth < 3 && this.isRecord(current); depth++, current = current.cause) {
      if (typeof current.code === "string" && PROVIDER_FAILURE_CODES.includes(current.code as ProviderFailureCode)) return current.code as ProviderFailureCode;
    }
    return "NETWORK_ERROR";
  }

  private failure<T extends Error>(error: T, stage: VllmCallMetadata["failureStage"], code: ProviderFailureCode): T {
    return Object.assign(error, { safeFailureStage: stage, safeFailureCode: code });
  }

  /**
   * vLLM endpoints conventionally live under /v1. Administrators may provide
   * either the API root or the already-versioned API base; never duplicate it.
   */
  private endpointUrl(baseUrl: string, resourcePath: "/models" | "/chat/completions"): string {
    const base = baseUrl.replace(/\/$/, "");
    return `${base.endsWith("/v1") ? base : `${base}/v1`}${resourcePath}`;
  }

  private nonNegativeInteger(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
  }

  private dialectDiagnostic(
    metadata: VllmCallMetadata,
    attemptedDialect: StructuredOutputDialect,
    overrides: Pick<ProviderDialectTestDiagnostic, "stage" | "reasonCode" | "jsonParseResult"> & Partial<ProviderDialectTestDiagnostic>
  ): ProviderDialectTestDiagnostic {
    return {
      stage: overrides.stage,
      attemptedDialect,
      reasonCode: overrides.reasonCode,
      upstreamHttpStatus: metadata.httpStatus,
      transportErrorType: null,
      transportErrorCode: metadata.httpClassification,
      responseReceived: true,
      generationStarted: this.generationStarted(metadata, true),
      contentPresent: true,
      jsonParseResult: overrides.jsonParseResult,
      schemaIssues: overrides.schemaIssues ?? [],
      finishReason: metadata.finishReason,
      promptTokens: metadata.promptTokens,
      completionTokens: metadata.completionTokens
    };
  }

  private generationStarted(metadata: VllmCallMetadata, contentPresent: boolean): boolean | null {
    if (contentPresent || metadata.finishReason || (metadata.completionTokens ?? 0) > 0) return true;
    return metadata.httpStatus !== null && metadata.httpStatus >= 400 && metadata.httpStatus < 500 ? false : null;
  }

  private safeErrorType(error: unknown): ProviderDialectTestDiagnostic["transportErrorType"] {
    if (error instanceof RequestTimeoutException) return "RequestTimeoutException";
    if (error instanceof BadGatewayException) return "BadGatewayException";
    return error instanceof Error ? "Error" : null;
  }

  private tinyDialectSchemaIssues(value: unknown): Array<{ path: string; code: string }> {
    if (!this.isRecord(value)) return [{ path: "$", code: "TYPE_OBJECT" }];
    const issues: Array<{ path: string; code: string }> = [];
    if (!("ok" in value)) issues.push({ path: "$.ok", code: "REQUIRED" });
    else if (value.ok !== true) issues.push({ path: "$.ok", code: "EXPECTED_TRUE" });
    if (Object.keys(value).some((key) => key !== "ok")) issues.push({ path: "$", code: "ADDITIONAL_PROPERTIES" });
    return issues;
  }

  private applyStructuredOutput(body: Record<string, unknown>, output: NonNullable<VllmChatRequest["structuredOutput"]>): void {
    structuredOutputBody(body, output);
  }

  private tagged<T extends Error>(error: T, classification: VllmCallMetadata["httpClassification"], status: number | null, startedAt: number): T {
    return Object.assign(error, { safeHttpClassification: classification, safeHttpStatus: status, safeDurationMs: Date.now() - startedAt });
  }
}
