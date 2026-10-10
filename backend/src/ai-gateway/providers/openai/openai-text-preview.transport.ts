import { Injectable } from "@nestjs/common";

export interface OpenAiTextPreviewRequest {
  input: string;
}

export interface OpenAiTextPreviewTransport {
  createTextPreview(request: OpenAiTextPreviewRequest, signal: AbortSignal): Promise<string>;
}

interface OpenAiResponseBody {
  output?: Array<{
    content?: Array<{
      text?: unknown;
      type?: unknown;
    }>;
    type?: unknown;
  }>;
}

@Injectable()
export class FetchOpenAiTextPreviewTransport implements OpenAiTextPreviewTransport {
  async createTextPreview(request: OpenAiTextPreviewRequest, signal: AbortSignal): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI dry-run credential is unavailable");
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        instructions: "Return a concise text-only preview. Do not provide commands, code, file contents, logs, environment values, credentials, or stack traces.",
        input: request.input,
        tools: [],
        store: false,
        max_output_tokens: 256
      }),
      signal
    });

    if (!response.ok) {
      throw new Error("OpenAI dry-run request failed");
    }

    const body = (await response.json()) as OpenAiResponseBody;
    const outputText = body.output
      ?.flatMap((item) => item.content ?? [])
      .find((content) => content.type === "output_text" && typeof content.text === "string");
    const text = outputText?.text;

    if (typeof text !== "string" || text.length === 0) {
      throw new Error("OpenAI dry-run response did not contain text");
    }

    return text;
  }
}
