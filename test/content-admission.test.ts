import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { validateFile, MAX_FILE_COUNT, MAX_FILE_SIZE_BYTES } from "../components/chat/attachment-types"
import { uploadConversationAttachment, postConversationMessage } from "../lib/sekhem-conversation"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { ChatMessageItem } from "../components/chat/chat-message-item"

const originalFetch = globalThis.fetch
const originalBase = process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalBase === undefined) delete process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL
  else process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = originalBase
})

describe("content-based attachment admission client", () => {
  for (const name of ["index.html", "package.json", "README.md", "app.js", "app.ts", "app.tsx", "style.css", "config.yaml", "file.xml", ".gitignore", "Dockerfile", "Makefile", "LICENSE", "unknown.extension", "extensionless"]) {
    it(`allows ${name} to reach bounded server inspection`, () => {
      assert.equal(validateFile(new File(["safe source text"], name), 0), null)
    })
  }
  it("retains count and size limits", () => {
    assert.equal(validateFile(new File(["text"], "app.js"), MAX_FILE_COUNT)?.type, "count")
    assert.equal(validateFile({ name: "app.js", size: MAX_FILE_SIZE_BYTES + 1, type: "text/plain" } as File, 0)?.type, "size")
  })
  it("renders individual evidence outcomes as escaped text", () => {
    const outcomes = ["READ", "DENIED", "UNSUPPORTED", "SCANNED", "TRUNCATED", "FAILED", "IMAGE_UNAVAILABLE"]
    for (const outcome of outcomes) {
      const html = renderToStaticMarkup(React.createElement(ChatMessageItem, { message: {
        id: "message", conversationId: "conv", senderId: "assistant", senderType: "assistant", content: "Evidence receipt", createdAt: "",
        metadata: { evidenceReceipt: [{ label: "<script>source</script>", outcome }] }
      } }))
      assert.match(html, /File read outcomes/)
      assert.ok(html.includes(outcome === "IMAGE_UNAVAILABLE" ? "Image understanding unavailable" : outcome))
      assert.ok(html.includes("&lt;script&gt;source&lt;/script&gt;"))
      assert.equal(html.includes("<script>source</script>"), false)
    }
  })
  it("sends unknown MIME unchanged for server detection and permits attachment-only posting", async () => {
    process.env.NEXT_PUBLIC_SEKHEM_API_BASE_URL = "https://api.example.test/api"
    const bodies: any[] = []
    globalThis.fetch = async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)))
      return Response.json({ data: { id: "attachment" }, errors: [], meta: {} })
    }
    await uploadConversationAttachment("conv", new File(["// source"], ".gitignore"), { throwOnError: true })
    await postConversationMessage("conv", "", undefined, { attachmentIds: ["attachment"], chat: true, throwOnError: true })
    assert.equal(bodies[0].mimeType, "application/octet-stream")
    assert.equal(Buffer.from(bodies[0].contentBase64, "base64").toString(), "// source")
    assert.equal(bodies[1].content, "")
    assert.deepEqual(bodies[1].attachmentIds, ["attachment"])
    assert.equal(bodies[1].chat, true)
  })
})
