# SEKHEM — PM / QA Closure Protocol

## Purpose

This protocol removes unnecessary QA loops after a task has already received QA technical acceptance.

## Authoritative Flow

```text
Tasker -> QA -> PM closure
```

## Rules

- Tasker completes the assigned task and sends evidence to QA.
- QA reviews scope, evidence, diff or commands where applicable, and forbidden-action compliance.
- If QA decision is `PASS`, or QA confirms the technical work is acceptable and no forbidden action occurred, the task goes to PM for closure.
- PM updates the Google Sheet row to `Done` and records `Notes / Evidence`.
- After PM closes the row with evidence, the task must not return to QA only because the PM updated the sheet.
- QA must not request a re-check merely to confirm a PM sheet update.
- `Done` in the Google Sheet means PM closed the task with evidence after QA acceptance.
- The task returns to QA only when there is a real technical `FIX`, a `BLOCKED` decision, missing evidence that affects acceptance, or a new risk/blocker.
- A missing sheet update after otherwise accepted QA evidence is a PM closure action, not a reason for a second QA loop.

## Operational Meaning

For production execution:

- QA owns technical acceptance.
- PM owns sheet closure.
- QA does not re-check PM administrative closure unless the closure introduces a blocker or contradicts the evidence.
- PM closure with evidence is enough to proceed to the next approved task.

## PM Standing Instruction

This protocol must be treated as the PM closure rule for SEKHEM Production Runtime Release.

If an older instruction says QA must re-check only because the PM updated the sheet, this protocol supersedes that behavior for operational execution.
