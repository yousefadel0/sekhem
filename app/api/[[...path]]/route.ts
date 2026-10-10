import { NextRequest, NextResponse } from "next/server";
import { requestsConversationPlan } from "../../../backend/src/conversation/conversation-intent";
import { ENGINEERING_PLANNING_TIMEOUT_MS } from "../../../backend/src/ai-gateway/planning-deadline";

export const dynamic = "force-dynamic";
export const maxDuration = 310; // Route ceiling; only planning receives the longer request deadline.

const BACKEND_BASE_URL = (process.env.SEKHEM_BACKEND_URL || "http://127.0.0.1:3001").replace(/\/$/, "");
const APPLICATION_PROXY_TIMEOUT_MS = 120_000; // 120 seconds matching backend provider timeout
const PLANNING_PROXY_TIMEOUT_MS = ENGINEERING_PLANNING_TIMEOUT_MS + 10_000; // Allow revalidation and persistence after inference.

async function forwardRequest(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
): Promise<NextResponse> {
  const { path } = await context.params;
  const subpath = path && path.length > 0 ? path.join("/") : "";
  const search = request.nextUrl.search;
  const targetUrl = `${BACKEND_BASE_URL}/api${subpath ? `/${subpath}` : ""}${search}`;

  // Forward incoming headers, preserving auth, cookies, and content-type
  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (!["host", "connection", "content-length"].includes(lower)) {
      headers.set(key, value);
    }
  });

  // Read body for mutation requests
  let body: ArrayBuffer | undefined = undefined;
  if (["POST", "PATCH", "PUT"].includes(request.method)) {
    try {
      body = await request.arrayBuffer();
    } catch {
      body = undefined;
    }
  }

  let timeoutMs = APPLICATION_PROXY_TIMEOUT_MS;
  if (request.method === "POST" && path?.length === 3 && path[0] === "conversations") {
    if (path[2] === "plans") timeoutMs = PLANNING_PROXY_TIMEOUT_MS;
    else if (path[2] === "messages" && body) {
      try {
        const value = JSON.parse(new TextDecoder().decode(body));
        if (typeof value?.content === "string" && requestsConversationPlan(value.content)) timeoutMs = PLANNING_PROXY_TIMEOUT_MS;
      } catch { /* Invalid requests retain the ordinary deadline and backend validation. */ }
    }
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const backendResponse = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      signal: AbortSignal.any([controller.signal, request.signal]),
      cache: "no-store",
      redirect: "manual",
    });

    clearTimeout(timeoutId);

    // Build response headers
    const responseHeaders = new Headers();
    backendResponse.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (!["content-encoding", "transfer-encoding"].includes(lower)) {
        responseHeaders.set(key, value);
      }
    });

    // Handle Set-Cookie headers properly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getSetCookie = (backendResponse.headers as any).getSetCookie;
    if (typeof getSetCookie === "function") {
      const cookies: string[] = getSetCookie.call(backendResponse.headers);
      if (Array.isArray(cookies) && cookies.length > 0) {
        responseHeaders.delete("set-cookie");
        for (const cookie of cookies) {
          responseHeaders.append("set-cookie", cookie);
        }
      }
    }

    const streaming = backendResponse.headers.get("content-type")?.includes("text/event-stream");
    if (streaming) {
      responseHeaders.delete("content-length");
      responseHeaders.set("Cache-Control", "no-cache, no-transform");
      responseHeaders.set("X-Accel-Buffering", "no");
      return new NextResponse(backendResponse.body, {
        status: backendResponse.status,
        statusText: backendResponse.statusText,
        headers: responseHeaders,
      });
    }
    const responseBuffer = await backendResponse.arrayBuffer();
    return new NextResponse(responseBuffer, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);

    const isTimeout =
      err?.name === "AbortError" ||
      err?.name === "TimeoutError" ||
      controller.signal.aborted;

    if (isTimeout) {
      return NextResponse.json(
        {
          data: null,
          meta: { timestamp: new Date().toISOString() },
          errors: [
            {
              code: "GATEWAY_TIMEOUT",
              message: `SEKHEM backend/AI Gateway request exceeded the ${timeoutMs / 1000}-second timeout`,
            },
          ],
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        data: null,
        meta: { timestamp: new Date().toISOString() },
        errors: [
          {
            code: "BACKEND_UNAVAILABLE",
            message: "SEKHEM backend is unavailable. Please retry.",
          },
        ],
      },
      { status: 502 }
    );
  }
}

export const GET = forwardRequest;
export const POST = forwardRequest;
export const PATCH = forwardRequest;
export const PUT = forwardRequest;
export const DELETE = forwardRequest;
export const OPTIONS = forwardRequest;
