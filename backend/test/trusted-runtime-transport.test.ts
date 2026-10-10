import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ExpressAdapter } from "@nestjs/platform-express";
import { runtimeTransportParser } from "../src/trusted-runtime/runtime-tls";
const request = require("supertest");

test("bounded runtime transport parser accepts escaped receipts while preserving other route limits", async () => {
  const adapter = new ExpressAdapter(), app = adapter.getInstance();
  app.use("/api/trusted-runtime/transport", runtimeTransportParser());
  adapter.registerParserMiddleware(undefined, true);
  const receive = (req: any, res: any) => res.json({ length: req.body.output.length });
  app.post("/api/trusted-runtime/transport/result", receive);
  app.post("/ordinary-route", receive);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status ?? 500).json({ error: error.type }));
  const payload = { output: "\u0001".repeat(32768) }; // 192 KiB wire JSON, 32 KiB content.
  const allowed = await request(app).post("/api/trusted-runtime/transport/result").send(payload);
  assert.equal(allowed.status, 200); assert.equal(allowed.body.length, 32768);
  assert.equal((await request(app).post("/ordinary-route").send(payload)).status, 413);
  assert.equal((await request(app).post("/api/trusted-runtime/transport/result").send({ output: "x".repeat(524289) })).status, 413);
});
