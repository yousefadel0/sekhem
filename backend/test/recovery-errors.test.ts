import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { ApiExceptionFilter } from "../src/common/api-exception.filter";
import { isolatedDatabaseUrl } from "./helpers/isolated-database";
import { readFileSync } from "node:fs";
test("event-sequence persistence proof cannot fall back to the application database", () => {
  const source = readFileSync("test/agent-run-event-sequence.postgres.test.ts", "utf8");
  assert.match(source, /const url = isolatedDatabaseUrl\(\)/);
  assert.doesNotMatch(source, /process\.env\.DATABASE_URL|readFileSync\(['"]\.env/);
  assert.match(source, /SEKHEM_RUNTIME_DB_TEST/);
});
test("API preserves safe recovery codes and HTTP status without private exception details", () => {
  let status: number | undefined, body: { errors: Array<{ code: string }> } = { errors: [] };
  const response = { status: (s: number) => { status = s; return response; }, json: (b: typeof body) => { body = b; } };
  const host = { switchToHttp: () => ({ getResponse: () => response }) } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(new ConflictException({ message: "PLAN_SOURCE_CHANGED", privateKey: "secret" }), host);
  assert.equal(status, 409); assert.equal(body.errors[0].code, "PLAN_SOURCE_CHANGED");
  assert.doesNotMatch(JSON.stringify(body), /secret|privateKey/);
  new ApiExceptionFilter().catch(new BadRequestException({ message: "Unrecognized failure", internal: "secret" }), host);
  assert.equal(status, 400); assert.equal(body.errors[0].code, "BAD_REQUEST");
  assert.doesNotMatch(JSON.stringify(body), /secret/);
});
test("database tests reject application databases and remote databases", () => {
  const before = process.env.SEKHEM_TEST_DATABASE_URL;
  try {
    for (const url of ["postgres://test@localhost/production", "postgres://test@remote.invalid/sekhem_test_ci"]) {
      process.env.SEKHEM_TEST_DATABASE_URL = url; assert.throws(isolatedDatabaseUrl);
    }
    process.env.SEKHEM_TEST_DATABASE_URL = "postgres://test@127.0.0.1/sekhem_test_ci";
    assert.equal(isolatedDatabaseUrl(), process.env.SEKHEM_TEST_DATABASE_URL);
  } finally { if (before === undefined) delete process.env.SEKHEM_TEST_DATABASE_URL; else process.env.SEKHEM_TEST_DATABASE_URL = before; }
});
