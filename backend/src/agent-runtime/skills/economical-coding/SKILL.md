---
name: economical-coding
description: Minimize Codex usage, context, tool calls, and unnecessary reasoning while preserving correctness. Use for all coding tasks where efficiency matters.
---

# Economical Coding

## Primary objective

Complete the task with the minimum necessary:
- context
- reasoning
- tool calls
- file reads
- test runs
- generated output

Never trade correctness or security for fewer tokens.

## Context discipline

1. Read only files directly relevant to the task.
2. Do not scan the entire repository unless the task genuinely requires it.
3. Do not reread files already inspected unless they may have changed.
4. Do not restate repository architecture, history, IDs, or previous results unless required.
5. Trust existing repository instructions and durable project state.
6. Prefer targeted search over broad exploration.
7. Prefer exact symbol/filename searches over directory-wide reads.
8. Do not read documentation unless the task requires it.

## Task discipline

1. Solve only the requested task.
2. Do not proactively fix unrelated issues.
3. Do not refactor working code without a direct requirement.
4. Prefer the smallest correct change.
5. Before changing code, identify the smallest relevant file set.
6. If the task is already satisfied, make no code changes.
7. Stop immediately when the success criteria are met.

## Tool discipline

1. Minimize tool calls.
2. Batch independent reads/searches when possible.
3. Avoid repeated searches for the same information.
4. Do not run expensive commands unless they provide information required for the task.
5. Prefer focused tests over the entire test suite.
6. Run typecheck only when code changes justify it or the task explicitly requires it.
7. Do not repeatedly rerun a failed command without new information.
8. If an external failure is proven, report it instead of retrying blindly.

## Planning discipline

For small tasks:
- Do not create elaborate plans.
- Inspect → change → focused test → finish.

For medium/large tasks:
- Make a short internal plan.
- Execute only the required steps.
- Do not produce a long written plan unless requested.

## Context compression

When prior context contains information already available in:
- repository files
- AGENTS.md
- durable runtime state
- test output
- git state

do not ask the user to repeat it and do not restate it in the prompt.

Retrieve the source only when needed.

## Verification

Use the cheapest sufficient verification.

Preferred order:

1. syntax/type-level check when relevant
2. focused regression test
3. targeted integration test
4. broader tests only when required

Do not run the full test suite when focused coverage proves the change.

## Failure handling

When a command fails:

1. Determine whether the failure is caused by:
   - code
   - environment
   - dependency
   - external service
   - resource exhaustion
2. Inspect only the evidence needed to classify it.
3. Do not repeat the same operation without new evidence.
4. Do not make speculative fixes.
5. Report the blocker concisely if it is external.

## Output discipline

Final responses should be concise.

Report only:
- what changed
- tests run
- result
- blocker, if any

Do not repeat the task description.
Do not reproduce large logs.
Do not explain obvious implementation details unless requested.

## SEKHEM safety invariants

Never reduce efficiency by bypassing correctness or security.

Preserve:
- authorization
- capability enrollment
- RuntimeGrant
- Read Consent
- Human Approval
- Execution Permit
- preimage validation
- authorized read-back
- verification
- durable receipts
- workspace binding
- fail-closed behavior

Never:
- modify the database to grant authority
- bypass approval
- forge permits
- weaken validation
- disable security checks
- alter successful execution paths without justification

## Final rule

Be economical by being precise, not by skipping necessary work.

Minimum sufficient evidence > maximum exploration.
Smallest correct change > broad refactor.
Focused verification > redundant testing.
Short context > repeated context.