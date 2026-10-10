import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalInspectionSources } from "../src/agent-runtime/inspection/inspection-evidence-context";
import { inspectionHarness } from "./helpers/inspection-loop-harness";
import { citationSources, citationCatalog, groundInspectionConversation } from "../src/agent-runtime/inspection/inspection-grounding";
import { interpretContext } from "../src/agent-runtime/understanding/agent-planning.contract";
import { inspectUnderstanding } from "../src/agent-runtime/inspection/inspection-understanding";

const source = "// Authentication fixture\nexport function isActive(revoked: boolean) {\n  return !revoked;\n}\n";

test("receipt status is server-authored once and remains separate from strict report grounding", async () => {
  const h = await observed();
  const statuses = () => [...h.tables.conversationMessage.values()].filter(m => m.metadata?.runtimeOperationStatus);
  assert.equal(statuses().length, 1);
  const message = statuses()[0], reference = (await h.state()).references[0];
  assert.equal(message.metadata.runtimeOperationStatus.receiptId, reference.receiptId);
  assert.equal(message.metadata.runtimeOperationStatus.state, "SUCCEEDED");
  assert.equal(message.metadata.runtimeOperationStatus.verificationState, "VERIFIED");
  assert.equal(message.metadata.runtimeOperationStatus.source, "RUNTIME_RECEIPT");
  assert.equal(message.metadata.inspectionReport, undefined);
  assert.match(message.content, /not completion of the report or task/);
  const withUncitedStatus = groundInspectionConversation(`The read succeeded and the task is complete.\n\nThe helper checks revocation. ${h.citation}`, h.sources, h.base);
  assert.equal(withUncitedStatus.grounding.complete, false);
  assert.equal(withUncitedStatus.grounding.claims[0].reason, "MISSING_EVIDENCE_REFERENCE");
  h.responses.push(input => {
    assert.match(input.systemInstruction, /Operation status is rendered separately by the server from committed Runtime receipts/);
    return `The helper checks revocation. ${h.citation}`;
  });
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).understanding?.status, "GROUNDED");
  assert.equal((await h.state()).state, "COMPLETED");
  await h.service.advance(h.run.id);
  assert.equal(statuses().length, 1);
  assert.equal((await h.request("poll")).execution, null);
});

test("pending and failed reads never emit successful receipt status", async () => {
  const h = await inspectionHarness();
  h.responses.push(h.inspect("filesystem.read", "auth.ts"));
  await h.service.advance(h.run.id);
  assert.equal([...h.tables.conversationMessage.values()].filter(m => m.metadata?.runtimeOperationStatus).length, 0);
  await h.approve();
  await h.complete((await h.request("poll")).execution, "", { state: "FAILED", error: "Fixture failure", verificationState: "NOT_VERIFIED" });
  await h.service.advance(h.run.id);
  assert.equal([...h.tables.conversationMessage.values()].filter(m => m.metadata?.runtimeOperationStatus).length, 0);
});

test("operation labels are supported only by the cited admitted observation", async () => {
  const h = await observed("Harmless test content.");
  const citation = citationCatalog(h.sources)[0].citation;
  const read = groundInspectionConversation(`قرأت الملف بعملية \`filesystem.read\`. ${citation}`, h.sources, h.base);
  assert.equal(read.grounding.complete, true);
  assert.equal(read.grounding.claims[0].status, "EVIDENCE_LINKED_INFERENCE");
  assert.equal(read.proposal.facts[0].text, "Harmless test content.");
  for (const detail of ["filesystem.write", "filesystem.search", "terminal.execute", "Invented content"]) {
    const rejected = groundInspectionConversation(`Observed \`${detail}\`. ${citation}`, h.sources, h.base);
    assert.equal(rejected.grounding.complete, false);
    assert.equal(rejected.grounding.claims[0].reason, "CITED_DETAIL_NOT_IN_EXCERPT");
    assert.deepEqual(rejected.proposal.facts, []);
  }
});

test("bounded route excerpts certify separately; whole-block and uncited findings still reject", async () => {
  const body = 'a'.repeat(512) + '\n' + 'b'.repeat(183) + '\n' + 'c'.repeat(226);
  const h = await observed(body);
  const cite = (range: string) => `[auth.ts:L${range}](evidence:${h.sources[0].token})`;
  const valid = groundInspectionConversation(`${'a'.repeat(512)} ${cite('1')}\n\n${'b'.repeat(183)} ${cite('2')}`, h.sources, h.base);
  assert.equal(valid.grounding.complete, true);
  for (const [range, length] of [['1-L2', 696], ['1-L3', 923]] as const) {
    const rejected = groundInspectionConversation(`Observed routes. ${cite(range)}`, h.sources, h.base);
    assert.equal(rejected.grounding.complete, false);
    assert.equal(rejected.grounding.claims[0].reason, 'EXCERPT_BOUND');
    assert.equal(rejected.grounding.claims[0].rejectionDiagnostic?.citations[0].excerptLength, length);
  }
  const uncited = groundInspectionConversation('**Routes summary**\n\n| Path | Page |', h.sources, h.base);
  assert.equal(uncited.grounding.complete, false);
  assert.ok(uncited.grounding.claims.every(c => c.reason === 'MISSING_EVIDENCE_REFERENCE'));
});

async function currentScopeInspection(requiredGap = false, omitCurrentConstraint = false) {
  const h = await inspectionHarness();
  const objective = "Read and analyze index.html. Identify the actual Hero heading. Do not modify anything.";
  const historical = "Report:\n4. The relevant surrounding Hero structure.";
  await h.ledger.transaction(async tx => {
    const row = (await h.ledger.read<any>(tx, "AGENT_INSPECTION", h.run.id))!;
    await h.ledger.update(tx, row, { ...row.payload, objective,
      history: [{ role: "user", content: historical }] }, "settled");
  });
  h.responses.push(h.inspectStructured("filesystem.read", "index.html"));
  await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution, "<h1>Building <span>intelligent</span> digital experiences.</h1>");
  await h.service.advance(h.run.id);
  h.responses.push(input => {
    const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]);
    assert.equal(state.currentInspectionScope.objective, objective);
    assert.deepEqual(input.history, []);
    assert.equal(state.historicalReferenceData.classification, "EXPLICIT_HISTORICAL_REFERENCE_DATA");
    assert.ok(state.historicalReferenceData.messages.some((m: any) => m.sourceRole === "user" && m.content === historical));
    assert.match(input.systemInstruction, /sourceRole records provenance only/);
    assert.match(input.systemInstruction, /Derive required inspection items only from currentInspectionScope and planningContract/);
    assert.match(input.systemInstruction, /historical requests, numbered report items and unresolved findings must not introduce new current requirements/);
    assert.match(input.systemInstruction, /Keep genuinely missing current required information UNKNOWN and blocking/);
    assert.match(input.systemInstruction, /bounded contiguous excerpt from the current admitted source evidence/);
    const source = state.sourceCitations[0];
    const anchor = source.anchors.find((a: any) => source.excerpt.slice(a.start, a.end).includes("<h1>"));
    return JSON.stringify({ decision: "REPORT", tool: "none", relativePath: "", query: "", purpose: "Report",
      report: { constraintIds: omitCurrentConstraint ? [] : state.planningContract.constraints.map((c: any) => c.id),
        facts: [{ id: "heading", text: source.excerpt.slice(anchor.start, anchor.end), evidenceRef: source.evidenceRef }], inferences: [], hypotheses: [],
        unknowns: requiredGap ? [{ id: "current-required-source", description: "Requested source information is missing",
          whyNeeded: "Needed for the current request", severity: "MEDIUM", evidenceCategory: "REQUIRED_INFORMATION" }] : [] }, recommendation: null });
  });
  await h.service.advance(h.run.id);
  const state = await h.state();
  assert.deepEqual(state.history[0], { role: "user", content: historical });
  return state;
}

test("historical Item 4 remains context and cannot extend the authoritative current inspection scope", async () => {
  const state = await currentScopeInspection();
  assert.equal(state.understanding!.understanding.unknowns.length, 0);
});

test("genuinely missing current required information still blocks certification", async () => {
  const state = await currentScopeInspection(true);
  assert.equal(state.understanding!.status, "PARTIAL");
  assert.equal(state.understanding!.understanding.readiness, "NEEDS_CLARIFICATION");
  assert.equal(state.understanding!.understanding.unknowns[0].state, "UNKNOWN");
});

test("historical reference isolation does not bypass current contract constraint acknowledgment", async () => {
  const state = await currentScopeInspection(false, true);
  assert.ok(!state.understanding);
  assert.notEqual(state.state, "COMPLETED");
});

test("valid current source scope reaches GROUNDED despite broader historical inspection scope", async () => {
  const state = await currentScopeInspection();
  assert.equal(state.understanding!.status, "GROUNDED");
  assert.equal(state.understanding!.understanding.readiness, "UNDERSTANDING_READY");
  assert.equal(state.operations.length, 1);
});
test("Hero card comparison requires its class in the cited source and conclusions require citations", async () => {
  const h = await observed('<div class="hero-card">\n<h3>developer.js</h3>\n</div>');
  const cite = (range: string) => `[auth.ts:L${range}](evidence:${h.sources[0].token})`;
  const unsupported = groundInspectionConversation(`The \`.hero-card\` contains \`developer.js\`. ${cite("2")}`, h.sources, h.base);
  assert.equal(unsupported.grounding.complete, false);
  assert.equal(unsupported.grounding.claims[0].reason, "CITED_DETAIL_NOT_IN_EXCERPT");
  const supported = groundInspectionConversation(`The \`hero-card\` class contains \`developer.js\`. ${cite("1-L2")}`, h.sources, h.base);
  assert.equal(supported.grounding.complete, true);
  const conclusion = groundInspectionConversation(`The title is \`developer.js\`. ${cite("2")}\n\nIn summary, the title is developer.js.`, h.sources, h.base);
  assert.equal(conclusion.grounding.complete, false);
  assert.equal(conclusion.grounding.claims[1].reason, "MISSING_EVIDENCE_REFERENCE");
});

test("inspection prompt excludes unsupported comparisons and uncited factual conclusions", async () => {
  const h = await inspectionHarness();
  h.responses.push(h.inspect("filesystem.read", "auth.ts"));
  await h.service.advance(h.run.id);
  const prompt = h.calls.at(-1).systemInstruction;
  assert.match(prompt, /Omit unnecessary comparisons and concluding factual summaries/);
  assert.match(prompt, /citations support every literal detail/);
  assert.match(prompt, /Never emit an uncited concluding factual paragraph/);
});
test("read-only heading identification receives the narrow cited output instruction", async () => {
  const h = await inspectionHarness();
  const run = await h.db.agentRun.create({ data: { ...h.run, id: "heading-output" } });
  await h.ledger.transaction(tx => h.service.initializeTx(tx, run, h.claims, h.binding,
    "Read and analyze index.html. Identify the actual Hero heading and cite its exact source lines. Complete grounded understanding only. Do not create a modification plan or proposal. Do not modify any file or execute any write."));
  h.responses.push(h.inspect("filesystem.read", "index.html"));
  await h.service.advance(run.id);
  const prompt = h.calls.at(-1).systemInstruction;
  assert.equal(h.calls.at(-1).structured, true);
  assert.match(prompt, /Return only the existing inspection decision JSON contract/);
  assert.match(prompt, /Return only the exact requested heading supported by the supplied evidence/);
  assert.match(prompt, /No comparisons, introductions, conclusions, or extra factual claims/);
  assert.match(prompt, /If the requested heading is unsupported, retain the existing unknowns and insufficient-evidence behavior/);
});

test("general inspection retains its broader output scope", async () => {
  const h = await inspectionHarness();
  h.responses.push(h.inspect("filesystem.read", "auth.ts"));
  await h.service.advance(h.run.id);
  assert.doesNotMatch(h.calls.at(-1).systemInstruction, /For this read-only heading-identification request/);
});

test("operational verification does not receive the heading-only output restriction", async () => {
  const h = await inspectionHarness();
  const run = await h.db.agentRun.create({ data: { ...h.run, id: "heading-behavior" } });
  await h.ledger.transaction(tx => h.service.initializeTx(tx, run, h.claims, h.binding,
    "Identify the Hero heading and verify its behavior in the browser."));
  h.responses.push("Source evidence is required.");
  await h.service.advance(run.id);
  assert.doesNotMatch(h.calls.at(-1).systemInstruction, /For this read-only heading-identification request/);
});

async function observed(text = source) {
  const h = await inspectionHarness();
  h.responses.push(h.inspect("filesystem.read", "auth.ts")); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution, text); await h.service.advance(h.run.id);
  const state = await h.state();
  const context = await h.contexts.buildRuntimeInspection({ userId: h.claims.sub, userRole: h.claims.role, organizationId: h.claims.organizationId,
    sessionClaims: h.claims, projectId: h.run.projectId, conversationId: h.run.conversationId, agentRunId: h.run.id,
    instruction: state.objective, runtimeEvidence: state.references, availableCapabilities: ["workspace_reader"] });
  const visible = new Map<string, string>(); h.contexts.toReasoningPrompt(context, visible);
  const base = interpretContext(context, visible), sources = citationSources(context, visible, h.binding);
  assert.equal(sources.length, 1);
  return { ...h, context, visible, base, sources, citation: `[auth.ts:L2-L3](evidence:${sources[0].token})` };
}

test("project finding details stay within one exact excerpt; separate excerpts require separate findings", async () => {
  const h = await observed('SEKHEM is an engineering workspace.\nFrontend: Next.js.\nBackend: NestJS.\n');
  const cite = (line: number) => `[auth.ts:L${line}](evidence:${h.sources[0].token})`;
  const exact = groundInspectionConversation(`SEKHEM is an engineering workspace. ${cite(1)}`, h.sources, h.base);
  assert.equal(exact.grounding.complete, true);
  assert.equal(exact.grounding.claims[0].status, "SOURCE_EXCERPT");
  assert.equal(exact.proposal.facts[0].text, "SEKHEM is an engineering workspace.");
  for (const claim of [`Frontend is "Next.js" with "Redis". ${cite(2)}`, `Frontend is "Next.js" and backend is "NestJS". ${cite(2)}`]) {
    const invalid = groundInspectionConversation(claim, h.sources, h.base);
    assert.equal(invalid.grounding.complete, false);
    assert.equal(invalid.grounding.claims[0].reason, "CITED_DETAIL_NOT_IN_EXCERPT");
    assert.deepEqual(invalid.proposal.facts, []);
  }
  const separate = groundInspectionConversation(`Frontend: Next.js. ${cite(2)}\n\nBackend: NestJS. ${cite(3)}`, h.sources, h.base);
  assert.equal(separate.grounding.complete, true);
  assert.deepEqual(separate.proposal.facts.map(f => f.text), ["Frontend: Next.js.", "Backend: NestJS."]);
  const interpretation = groundInspectionConversation(`This product is highly scalable. ${cite(1)}`, h.sources, h.base);
  assert.equal(interpretation.grounding.claims[0].status, "EVIDENCE_LINKED_INFERENCE");
  assert.ok(interpretation.proposal.facts.every(f => !f.text.includes("highly scalable")));
});

test("exact evidence-backed claim receives server-derived excerpt, offsets and immutable receipt coordinates", async () => {
  const h = await observed(), quote = source.split("\n").slice(1,3).join("\n");
  const r = groundInspectionConversation(`${quote} ${h.citation}`, h.sources, h.base);
  assert.equal(r.grounding.complete, true); assert.equal(r.grounding.claims[0].status, "SOURCE_EXCERPT");
  const s = r.grounding.claims[0].sources[0]; assert.equal(source.slice(s.start,s.end), quote);
  assert.deepEqual(s.runtimeReference, (await h.state()).references[0]);
  assert.equal(inspectUnderstanding(h.context,h.base,r.proposal,h.visible,1,true).status, "GROUNDED");
});

test("paraphrased but traceable finding stays an inference; only extracted source becomes a verified fact", async () => {
  const h = await observed(), claim = `The helper returns false when revoked. ${h.citation}`;
  const r = groundInspectionConversation(claim,h.sources,h.base), u = inspectUnderstanding(h.context,h.base,r.proposal,h.visible,1,true);
  assert.equal(r.grounding.claims[0].status,"EVIDENCE_LINKED_INFERENCE");
  assert.equal(u.status,"GROUNDED"); assert.equal(u.understanding.facts[0].kind,"SOURCE_EXCERPT");
  assert.equal(u.understanding.facts[0].text, source.split("\n").slice(1,3).join("\n"));
  assert.match(u.understanding.inferences[0].uncertainty,/semantic correctness is not mechanically proven/);
  const arbitrary = groundInspectionConversation(`Passwords are encrypted with AES. ${h.citation}`,h.sources,h.base);
  assert.equal(arbitrary.grounding.claims[0].status,"EVIDENCE_LINKED_INFERENCE");
  assert.ok(arbitrary.proposal.facts.every(f=>!f.text.includes("AES"))); // A link is never a semantic proof.
});

test("repeated exact evidence references in a synthesis reuse verified facts instead of exhausting the distinct-fact bound", async () => {
  const h = await observed();
  const findings = Array.from({ length: 5 }, (_, i) => `Finding ${i + 1}: the helper checks revocation. ${h.citation}`);
  findings.push(`Synthesis: these findings refer to the same observed helper. ${h.citation} ${h.citation}`);
  const r = groundInspectionConversation(findings.join("\n\n"), h.sources, h.base);
  assert.equal(r.grounding.complete, true);
  assert.equal(r.proposal.facts.length, 1);
  assert.equal(r.proposal.inferences.length, 6);
  assert.ok(r.proposal.inferences.every(i => i.factIds.length === 1 && i.factIds[0] === r.proposal.facts[0].id));
  assert.equal(r.grounding.claims[5].sources.length, 1);
  assert.equal(inspectUnderstanding(h.context, h.base, r.proposal, h.visible, 1, true).status, "GROUNDED");
});

test("seven distinct source excerpts still exceed the existing six-fact bound", async () => {
  const h = await observed(Array.from({ length: 7 }, (_, i) => `// distinct source line ${i + 1}`).join("\n"));
  const cite = (line: number) => `[auth.ts:L${line}](evidence:${h.sources[0].token})`;
  const findings = Array.from({ length: 5 }, (_, i) => `Observed source line. ${cite(i + 1)}`);
  findings.push(`Two additional source lines. ${cite(6)} ${cite(7)}`);
  const r = groundInspectionConversation(findings.join("\n\n"), h.sources, h.base);
  assert.equal(r.grounding.complete, false);
  assert.equal(r.grounding.claims[5].reason, "EXCERPT_BOUND");
});

test("small-file citation hints cover the whole observed source instead of only an opening brace", async () => {
  const h = await observed('{\n  "name": "fixture"\n}\n');
  assert.equal(citationCatalog(h.sources)[0].citation, `[auth.ts:L1-L3](evidence:${h.sources[0].token})`);
  const narrow = groundInspectionConversation(`The project is named fixture. [auth.ts:L1](evidence:${h.sources[0].token})`, h.sources, h.base);
  assert.equal(narrow.grounding.complete, false);
  assert.equal(narrow.grounding.claims[0].reason, "EXCERPT_NO_CONTENT");
  const full = groundInspectionConversation(`The project is named fixture. ${citationCatalog(h.sources)[0].citation}`, h.sources, h.base);
  assert.equal(full.grounding.complete, true);
  assert.equal(full.proposal.facts[0].text, '{\n  "name": "fixture"\n}');
});

test("Hero title cannot be certified by its badge, and a Contact link cannot support other section IDs", async () => {
  const text = '<span class="hero-badge">Available for new projects</span>\n<h1>Building <span>simple</span> digital experiences.</h1>\n<a href="#contact">Contact</a>\n<section id="home"></section>\n';
  const h = await observed(text), cite = (line: number) => `[auth.ts:L${line}](evidence:${h.sources[0].token})`;
  for (const claim of [`The Hero title is "Building simple digital experiences." ${cite(1)}`,
    `Sections include home (#home), about (#about), projects (#projects), contact (#contact). ${cite(3)}`,
    `The source uses \`missingFunction()\`. ${cite(2)}`]) {
    const result = groundInspectionConversation(claim, h.sources, h.base);
    assert.equal(result.grounding.complete, false);
    assert.equal(result.grounding.claims[0].reason, "CITED_DETAIL_NOT_IN_EXCERPT");
    assert.deepEqual(result.proposal.facts, []);
  }
  const valid = groundInspectionConversation(`The Hero title is "Building simple digital experiences." ${cite(2)}`, h.sources, h.base);
  assert.equal(valid.grounding.complete, true);
  assert.equal(valid.grounding.claims[0].status, "EVIDENCE_LINKED_INFERENCE");
  assert.equal(valid.proposal.facts[0].text, text.split("\n")[1]);
  const broad = groundInspectionConversation(`This is a complete production website. ${cite(2)}`, h.sources, h.base);
  assert.equal(broad.grounding.claims[0].status, "EVIDENCE_LINKED_INFERENCE");
  assert.ok(broad.proposal.facts.every(f => !f.text.includes("complete production")));
});

test("HTML anchor hints point to actual bounded lines, preserving blank lines and CRLF offsets", async () => {
  const text = '\r\n<title>Demo</title>\r\n\r\n<section class="hero">\r\n<h1>\r\nBuilding <span>simple</span> digital experiences.\r\n</h1>\r\n</section>\r\n';
  const h = await observed(text), catalog = citationCatalog(h.sources)[0];
  const anchor = catalog.anchors!.find(a => a.excerpt.includes("<h1>"))!;
  assert.equal(anchor.citation, `[auth.ts:L5-L7](evidence:${h.sources[0].token})`);
  assert.equal(anchor.excerpt, text.split("\n").slice(4, 7).join("\n"));
  assert.equal(groundInspectionConversation(`The title contains "Building simple digital experiences." ${anchor.citation}`, h.sources, h.base).grounding.complete, true);
});

test("a mismatched required quotation preserves diagnostics and stops after bounded correction", async () => {
  const h = await observed(); h.responses.push(`The helper uses \`encryptAES()\`. ${h.citation}`);
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "NEEDS_MORE_EVIDENCE");
  assert.ok([...h.tables.conversationMessage.values()].some(m => m.metadata?.modelConversation && m.metadata.grounding?.claims.some((c: any) => c.text.includes("encryptAES()"))));
  assert.ok([...h.tables.conversationMessage.values()].filter(m => m.metadata?.modelConversation).every(m => !m.content.includes("encryptAES()")));
  for (let attempt = 0; attempt < 2; attempt++) {
    h.responses.push(`The helper uses \`encryptAES()\`. ${h.citation}`);
    await h.service.advance(h.run.id);
  }
  assert.equal((await h.state()).state, "PARTIAL");
  const calls = h.calls.length; await h.service.advance(h.run.id); assert.equal(h.calls.length, calls);
  assert.equal((await h.request("poll")).execution, null);
});

test("rejected citations persist bounded diagnostic ranges and excerpts without certifying or displaying them", async () => {
  for (const code of ["CITED_DETAIL_NOT_IN_EXCERPT", "EXCERPT_BOUND", "MISSING_EVIDENCE_REFERENCE"]) {
    const body = code === "EXCERPT_BOUND" ? source + "x".repeat(600) : source;
    const h = await observed(body);
    const citation = code === "MISSING_EVIDENCE_REFERENCE" ? "" : code === "EXCERPT_BOUND"
      ? h.citation.replace("L2-L3", "L2-L5") : h.citation;
    const finding = "The helper uses `encryptAES()`.";
    h.responses.push(`${finding} ${citation}`);
    await h.service.advance(h.run.id);
    assert.equal((await h.newService().view(h.run.id, h.claims))?.state, "NEEDS_MORE_EVIDENCE");
    const message = [...h.tables.conversationMessage.values()].find(m => m.metadata?.modelConversation &&
      m.metadata.grounding?.claims.some((c: any) => c.text === finding))!;
    // Read only the persisted JSON, not the in-memory validator result.
    const grounding = JSON.parse(JSON.stringify(message.metadata.grounding));
    const claim = grounding.claims.find((c: any) => c.text === finding);
    assert.equal(grounding.complete, false);
    assert.equal(claim.status, "UNGROUNDED");
    assert.equal(claim.reason, code);
    assert.deepEqual(claim.sources, []);
    assert.equal(claim.rejectionDiagnostic.code, code);
    assert.equal(claim.rejectionDiagnostic.citationsTruncated, false);
    assert.ok(!message.content.includes("encryptAES()"));
    if (code === "MISSING_EVIDENCE_REFERENCE") {
      assert.deepEqual(claim.rejectionDiagnostic.citations, []);
    } else {
      const [diagnostic] = claim.rejectionDiagnostic.citations;
      const last = code === "EXCERPT_BOUND" ? 5 : 3;
      const excerpt = body.split("\n").slice(1, last).join("\n");
      assert.equal(diagnostic.token, h.sources[0].token);
      assert.equal(diagnostic.evidenceRef, h.sources[0].evidenceRef);
      assert.equal(diagnostic.sourceId, h.sources[0].reference.operationId);
      assert.equal(diagnostic.receiptId, h.sources[0].reference.receiptId);
      assert.equal(diagnostic.relativePath, "auth.ts");
      assert.equal(diagnostic.lineStart, 2);
      assert.equal(diagnostic.lineEnd, last);
      assert.equal(diagnostic.start, body.indexOf("\n") + 1);
      assert.equal(diagnostic.end, diagnostic.start + excerpt.length);
      assert.equal(diagnostic.excerpt, excerpt.slice(0, 512));
      assert.equal(diagnostic.excerptLength, excerpt.length);
      assert.match(diagnostic.excerptDigest, /^[0-9a-f]{64}$/);
      assert.equal(diagnostic.excerptTruncated, code === "EXCERPT_BOUND");
      assert.ok(!message.content.includes(diagnostic.excerpt));
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      h.responses.push(`${finding} ${citation}`);
      await h.newService().advance(h.run.id);
    }
    assert.equal((await h.state()).state, "PARTIAL");
    const calls = h.calls.length;
    await h.newService().advance(h.run.id);
    assert.equal(h.calls.length, calls);
    assert.equal((await h.request("poll")).execution, null);
  }
});

for (const variant of ["missing", "wrong-path", "wrong-receipt", "bad-lines", "partial-citation", "too-long"])
  test(`${variant} cannot certify the required finding`, async () => {
    const h = await observed(); let citation = h.citation, claim = "The session helper is here.";
    if(variant==="missing") citation="";
    if(variant==="wrong-path") citation=citation.replace("auth.ts", "unread.ts");
    if(variant==="wrong-receipt") citation=citation.replace(h.sources[0].token, "S0000000000000000");
    if(variant==="bad-lines") citation=citation.replace("L2-L3", "L3-L999");
    if(variant==="partial-citation") citation += " [other](evidence:invalid)";
    if(variant==="too-long") claim="x".repeat(513);
    const r=groundInspectionConversation(`${claim} ${citation}`,h.sources,h.base);
    assert.equal(r.grounding.complete,false); assert.equal(r.grounding.claims[0].status,"UNGROUNDED"); assert.equal(r.proposal.facts.length,0);
  });

test("a stale binding, altered path or changed visible identity cannot resolve an old citation",async()=>{
  const h=await observed();
  assert.equal(citationSources(h.context,h.visible,{...h.binding,version:h.binding.version+1}).length,0);
  const changed=structuredClone(h.context); changed.evidence[0].relativePath="other.ts";
  assert.equal(citationSources(changed,h.visible,h.binding).length,0);
  const content=new Map(h.visible); content.set(h.sources[0].evidenceRef, "forged content");
  assert.equal(citationSources(h.context,content,h.binding).length,0);
  const shortened=new Map(h.visible); shortened.set(h.sources[0].evidenceRef,source.slice(0,-2));
  const next=citationSources(h.context,shortened,h.binding); assert.notEqual(next[0].token,h.sources[0].token);
  assert.equal(groundInspectionConversation(`A finding. ${h.citation}`,next,h.base).grounding.complete,false);
});

for(const [key,value] of [["receiptId","forged-receipt"],["relativePath","other.ts"],["bindingVersion",99],
  ["contentIdentity",{status:"VERIFIED",sha256:"a".repeat(64)}],["contentIdentity",{status:"UNAVAILABLE",sha256:"forged"}]] as const)
  test(`existing evidence admission rejects tampered ${key} before grounding`,async()=>{
    const h=await observed(), r=(await h.state()).references[0];
    await assert.rejects(h.collector.collectRuntimeWorkspace(h.claims,h.run.projectId,h.run.conversationId,[{...r,[key]:value} as any]));
  });

test("natural cited understanding completes in the same Chat without a second JSON report",async()=>{
  const h=await observed();
  h.responses.push(input=>{
    const catalog=JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]).sourceCitations;
    assert.deepEqual(catalog,canonicalInspectionSources(h.sources)); assert.match(input.systemInstruction,/do not produce a second JSON/);
    assert.match(input.systemInstruction,/six paragraphs total, including uncertainty notes/);
    assert.match(input.systemInstruction,/preserve the literal 'Uncertain:' prefix even in Arabic/);
    assert.match(input.systemInstruction,/do not end with a prose-only promise/);
    return `## Inspected understanding\n\nThe session helper returns false when revoked. ${h.citation}\n\nUncertain: Callers outside this inspected file were not read.`;
  });
  await h.service.advance(h.run.id);
  const s=await h.state(); assert.equal(s.state,"COMPLETED"); assert.equal(s.understanding?.status,"GROUNDED");
  assert.equal(s.understanding?.understanding.readiness,"UNDERSTANDING_READY"); assert.equal(s.planning,null);
  assert.equal(s.understanding?.grounding?.claims[1].status,"UNGROUNDED");
  const messages=[...h.tables.conversationMessage.values()];
  assert.ok(messages.some(m=>m.conversationId===h.run.conversationId&&m.metadata?.inspectionReport&&m.content.includes("Uncertain:")));
  assert.ok(messages.every(m=>!m.content.includes("ungrounded / uncertain")));
  assert.equal(messages.filter(m=>m.metadata?.inspectionReport).length, 1);
  assert.equal((await h.request("poll")).execution,null);
});

test("an unsupported required finding requests bounded correction rather than user clarification",async()=>{
  const h=await observed(); h.responses.push(`Session validation is here. ${h.citation}\n\nRedis implements token storage.`);
  await h.service.advance(h.run.id); const s=await h.state();
  assert.equal(s.state,"NEEDS_MORE_EVIDENCE"); assert.equal(s.understanding?.status,"INTERMEDIATE");
  assert.equal(h.tables.agentRun.get(h.run.id).status,"RUNNING");
  assert.equal((await h.newService().view(h.run.id, h.claims))?.state, "NEEDS_MORE_EVIDENCE");
  assert.ok([...h.tables.conversationMessage.values()].some(m=>m.metadata?.modelConversation&&m.metadata.grounding?.claims.some((c: any)=>c.text.includes("Redis implements token storage."))));
  assert.ok([...h.tables.conversationMessage.values()].filter(m=>m.metadata?.modelConversation).every(m=>!m.content.includes("Redis implements token storage.")));
  assert.equal((await h.request("poll")).execution,null);
});

for (const unsupported of [
  "The unread configuration contains `enabled?: boolean`.",
  "الإعداد غير المقروء يحتوي `enabled?: boolean`؟",
]) test(`question punctuation cannot turn rejected output into a clarification: ${unsupported}`, async () => {
  const h = await observed();
  const receiptIds = (await h.state()).references.map(r => r.receiptId);
  h.responses.push(`The helper checks revocation. ${h.citation}\n\n${unsupported}`);
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "NEEDS_MORE_EVIDENCE");
  assert.equal(h.tables.agentRun.get(h.run.id).status, "RUNNING");
  assert.deepEqual((await h.state()).references.map(r => r.receiptId), receiptIds);
  assert.equal((await h.request("poll")).execution, null);
  h.responses.push(`The helper checks revocation. ${h.citation}`);
  await h.newService().advance(h.run.id);
  assert.equal((await h.state()).state, "COMPLETED");
  assert.deepEqual((await h.state()).references.map(r => r.receiptId), receiptIds);
  assert.equal((await h.state()).operations.length, 1);
  assert.equal((await h.request("poll")).execution, null);
});

test("repeated rejected output with question punctuation stops within the correction bound", async () => {
  const h = await observed();
  const receiptIds = (await h.state()).references.map(r => r.receiptId);
  for (let i = 0; i < 3; i++) {
    h.responses.push(`The helper checks revocation. ${h.citation}\n\nUnsupported configuration?`);
    await h.newService().advance(h.run.id);
  }
  const state = await h.state();
  assert.equal(state.state, "PARTIAL");
  assert.equal(h.tables.agentRun.get(h.run.id).failureReason, "INSPECTION_OUTPUT_INCOMPLETE");
  assert.equal(state.correctiveAttempts, 2);
  assert.deepEqual(state.references.map(r => r.receiptId), receiptIds);
  assert.equal(state.operations.length, 1);
  assert.equal((await h.request("poll")).execution, null);
  const calls = h.calls.length;
  await h.newService().advance(h.run.id);
  assert.equal(h.calls.length, calls);
  assert.ok(![...h.tables.conversationMessage.values()].some(m => m.metadata?.inspectionClarification));
});

test("Arabic findings need citations and the explicit uncertainty marker before certification", async () => {
  const h = await observed();
  const finding = `الدالة تتحقق من إلغاء الجلسة. ${h.citation}`;
  const rejected = groundInspectionConversation(`قرأت الملف بالكامل.\n\n${finding}\n\nغير مؤكد: لم أقرأ الملفات الأخرى.`, h.sources, h.base);
  assert.equal(rejected.grounding.complete, false);
  assert.equal(rejected.grounding.claims[0].reason, "MISSING_EVIDENCE_REFERENCE");
  assert.equal(rejected.grounding.claims[2].optional, false);
  h.responses.push(`## نطاق الفحص\n\n${finding}\n\nUncertain: لم أقرأ الملفات الأخرى.`);
  await h.service.advance(h.run.id);
  const state = await h.state();
  assert.equal(state.state, "COMPLETED");
  assert.equal(state.understanding?.status, "GROUNDED");
  assert.equal(state.understanding?.understanding.readiness, "UNDERSTANDING_READY");
  assert.equal(state.understanding?.grounding?.claims[1].status, "UNGROUNDED");
  assert.equal((await h.request("poll")).execution, null);
});

test("a user continuation during correction receives grounding failures without promoting rejected claims", async () => {
  const h = await observed();
  h.responses.push(`Session validation is here. ${h.citation}\n\nAn unsupported source claim.`);
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).state, "NEEDS_MORE_EVIDENCE");
  await h.service.message(h.run.id, h.claims, h.run.conversationId, "Summarize the verified source only.", "grounding-follow-up");
  h.responses.push(input => {
    const state = JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]);
    assert.equal(state.groundingFeedback.complete, false);
    assert.equal(state.groundingFeedback.claims[1].reason, "MISSING_EVIDENCE_REFERENCE");
    assert.ok(!JSON.stringify(state.priorFindings.facts).includes("unsupported source claim"));
    assert.match(input.systemInstruction, /EXCERPT_BOUND means narrow the cited ranges/);
    return `The helper checks revocation. ${h.citation}`;
  });
  await h.service.advance(h.run.id);
  assert.equal((await h.state()).understanding?.status, "GROUNDED");
  assert.equal((await h.request("poll")).execution, null);
});

test("malformed optional legacy grounding does not erase independently traceable natural findings",async()=>{
  const h=await observed(); h.responses.push(`Session validation is here. ${h.citation}\n\n\`\`\`sekhem-understanding\n{bad}\n\`\`\``);
  await h.service.advance(h.run.id); assert.equal((await h.state()).state,"COMPLETED");
});

test("new binding during model inference prevents certification of previously read evidence",async()=>{
  const h=await observed(); h.responses.push(async()=>{
    await h.runtime.createBinding(h.claims,"project-a",{runtimeId:h.device.runtimeId,rootPath:"E:\\Other",displayName:"Other",requestId:"switch"});
    return `Session validation is here. ${h.citation}`;
  });
  await h.service.advance(h.run.id); assert.notEqual((await h.state()).state,"COMPLETED");
  assert.ok(![...h.tables.conversationMessage.values()].some(m=>m.metadata?.understandingReport&&m.metadata.outcome==="COMPLETED"));
});

for (const tool of ["filesystem.list", "filesystem.search"]) test(`${tool} citations can ground an observation but cannot replace source reads`,async()=>{
  const h=await inspectionHarness();
  h.responses.push(h.inspect(tool,"",tool==="filesystem.search"?"auth":"")); await h.service.advance(h.run.id); await h.approve();
  await h.complete((await h.request("poll")).execution); await h.service.advance(h.run.id);
  h.responses.push(input=>{const s=JSON.parse(input.question.split("[INSPECTION STATE]\n")[1]).sourceCitations[0];
    assert.equal(s.operation,tool); return `A session candidate was observed. ${s.citation}`;});
  await h.service.advance(h.run.id); assert.equal((await h.state()).state,"PARTIAL");
  assert.equal((await h.service.view(h.run.id,h.claims))?.objectiveGrounded,false);
});
