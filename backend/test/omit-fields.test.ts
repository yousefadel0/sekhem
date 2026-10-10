import assert from "node:assert/strict";
import { test } from "node:test";
import { omitFields } from "../src/common/omit-fields";
import { toolDigest } from "../src/agent-runtime/tools/tool-contract";

test("digest projections remove only named own fields without mutating the source", () => {
  const source = Object.freeze({ id: "operation", approved: false, input: { path: "file.txt" }, fingerprint: "old", taskConsent: "old-consent" });
  const projection = omitFields(source, ["fingerprint", "taskConsent"]);
  assert.deepEqual(projection, { id: "operation", approved: false, input: { path: "file.txt" } });
  assert.equal(toolDigest(projection), toolDigest({ id: "operation", approved: false, input: { path: "file.txt" } }));
  assert.equal(source.fingerprint, "old");
  assert.equal(source.taskConsent, "old-consent");
  assert.equal(projection.input, source.input);
});

test("omission preserves other enumerable keys, including symbols and explicit undefined", () => {
  const symbol = Symbol("metadata");
  const source = { [symbol]: "retained", remove: 1, optional: undefined };
  const projection = omitFields(source, ["remove"]);
  assert.equal(Object.hasOwn(projection, "remove"), false);
  assert.equal(Object.hasOwn(projection, "optional"), true);
  assert.equal(projection[symbol], "retained");
});
