import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PrismaService } from "../src/data-access/prisma.service";

test("production database failure rejects startup with a content-free error", async () => {
  const previous = process.env.NODE_ENV;
  const messages: string[] = [];
  const service = { $connect: async () => { throw new Error("PRIVATE_CONNECTION_SECRET"); }, logger: { warn: (m: string) => messages.push(m), error: (m: string) => messages.push(m), log: (m: string) => messages.push(m) } };
  try {
    process.env.NODE_ENV = "production";
    await assert.rejects(PrismaService.prototype.onModuleInit.call(service), /^Error: PRODUCTION_DATABASE_UNAVAILABLE$/);
    assert.ok(!messages.join().includes("PRIVATE_CONNECTION_SECRET"));
    process.env.NODE_ENV = "development";
    await PrismaService.prototype.onModuleInit.call(service);
    assert.match(messages.join(), /deferred/);
    service.$connect = async () => {};
    process.env.NODE_ENV = "production";
    await PrismaService.prototype.onModuleInit.call(service);
    assert.match(messages.join(), /connected to database/);
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
