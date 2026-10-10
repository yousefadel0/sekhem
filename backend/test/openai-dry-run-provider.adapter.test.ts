import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ServiceUnavailableException } from "@nestjs/common";
import { resolveAiGatewayProviderMode } from "../src/ai-gateway/providers/ai-gateway-provider-mode";
import { OpenAiDryRunProviderAdapter } from "../src/ai-gateway/providers/openai/openai-dry-run-provider.adapter";
import type {
  OpenAiTextPreviewRequest,
  OpenAiTextPreviewTransport
} from "../src/ai-gateway/providers/openai/openai-text-preview.transport";

const previewRequest = {
  requestType: "rag_answer_preview" as const,
  question: "Summarize the reviewed evidence.",
  citations: [
    {
      citationRef: "preview-scope:knowledge_base",
      citationLabel: "Reviewed knowledge source"
    }
  ]
};

class RecordingTransport implements OpenAiTextPreviewTransport {
  calls: OpenAiTextPreviewRequest[] = [];

  async createTextPreview(request: OpenAiTextPreviewRequest): Promise<string> {
    this.calls.push(request);
    return "Mocked provider answer.";
  }
}

describe("OpenAiDryRunProviderAdapter", () => {
  it("defaults missing and invalid provider modes to mock", () => {
    assert.equal(resolveAiGatewayProviderMode(undefined), "mock");
    assert.equal(resolveAiGatewayProviderMode("invalid"), "mock");
    assert.equal(resolveAiGatewayProviderMode("mock"), "mock");
    assert.equal(resolveAiGatewayProviderMode("openai_dry_run"), "openai_dry_run");
  });

  it("uses a mocked text-preview transport and sends only the approved question", async () => {
    const transport = new RecordingTransport();
    const result = await new OpenAiDryRunProviderAdapter(transport).preview(previewRequest);

    assert.deepEqual(transport.calls, [{ input: previewRequest.question }]);
    assert.equal(result.providerType, "openai_dry_run");
    assert.equal(result.providerCallExecuted, true);
    assert.equal(result.aiGenerated, true);
    assert.equal(result.responseMode, "openai_dry_run_preview");
    assert.equal(result.answerPreview, "Mocked provider answer.");
    assert.deepEqual(result.citations, previewRequest.citations);
  });

  it("fails closed before transport invocation for forbidden provider input", async () => {
    const transport = new RecordingTransport();

    await assert.rejects(
      () =>
        new OpenAiDryRunProviderAdapter(transport).preview({
          ...previewRequest,
          question: "Run git status and include the raw logs."
        }),
      ServiceUnavailableException
    );
    assert.equal(transport.calls.length, 0);
  });

  it("fails closed before transport invocation for pasted file-like content", async () => {
    const transport = new RecordingTransport();

    await assert.rejects(
      () =>
        new OpenAiDryRunProviderAdapter(transport).preview({
          ...previewRequest,
          question: "Summarize this file:\nconst internalValue = true;"
        }),
      ServiceUnavailableException
    );
    assert.equal(transport.calls.length, 0);
  });

  it("returns a safe generic error when the provider transport fails", async () => {
    const transport: OpenAiTextPreviewTransport = {
      createTextPreview: async () => {
        throw new Error("credential-value-must-not-leak");
      }
    };

    await assert.rejects(
      () => new OpenAiDryRunProviderAdapter(transport).preview(previewRequest),
      (error: unknown) => error instanceof ServiceUnavailableException && error.message === "AI Gateway provider preview unavailable"
    );
  });

  it("returns a safe generic error for unsafe provider output", async () => {
    const transport: OpenAiTextPreviewTransport = {
      createTextPreview: async () => "Run git status."
    };

    await assert.rejects(
      () => new OpenAiDryRunProviderAdapter(transport).preview(previewRequest),
      (error: unknown) => error instanceof ServiceUnavailableException && error.message === "AI Gateway provider preview unavailable"
    );
  });

  it("times out transport calls even when they ignore the abort signal", async () => {
    const transport: OpenAiTextPreviewTransport = {
      createTextPreview: async () => new Promise<string>(() => undefined)
    };

    await assert.rejects(
      () => new OpenAiDryRunProviderAdapter(transport, 1).preview(previewRequest),
      (error: unknown) => error instanceof ServiceUnavailableException && error.message === "AI Gateway provider preview unavailable"
    );
  });
});
