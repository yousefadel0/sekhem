# Customer Language Review

Issue ID: 1408

## Lesson learned

A screen can pass engineering validation and still fail a customer demo.

Every customer-facing frontend change must pass four gates before QA approval:

1. Technical validation
2. Claim safety
3. Customer language review
4. Information hierarchy review

## Rule

Customer UI must communicate product value, decision context, and next action. It must not read like an engineering status page.

Use customer-safe labels such as:

- Live data
- Sample view
- Workflow Summary
- Candidate Initiative Review
- Readiness Check
- Evidence Review
- General Evidence Review

## Information hierarchy rule

Customer-facing product pages must show business value before system state.

The first visible screen should answer:

- What is the value?
- What is recommended?
- What action can the customer take now?

For R&D Radar, the correct demo order is:

1. Page header and value statement
2. KPI cards
3. Primary action
4. Recommended Initiatives
5. How to Use R&D Radar
6. Recommended Review Logic
7. Current Review Status and governance panels at the bottom

Status, readiness, sample/live labels, unavailable states, and governance panels must not dominate the first screen unless there is a real customer-actionable blocker.

## QA requirement

Every customer-facing frontend PR must include:

Customer Language Review: PASS / FIX / BLOCKED
Information Hierarchy Review: PASS / FIX / BLOCKED

QA must confirm that the screen reads as a customer product experience, not as an internal implementation monitor.

QA must not approve a customer-facing demo screen based only on build success or runtime success.

QA must specifically check:

- first visible screen shows customer value
- KPI and recommendations appear before status panels
- live/sample state is visible but not dominant
- warning cards are not overused
- disabled actions are hidden or clearly explained

## Correct framing

Customer UI should answer:

- What was discovered?
- What candidate is proposed?
- What decision is required?
- Is this live information or a sample view?
- What is the next safe step?

Issue 1408 is the baseline correction for R&D Radar and future customer demo screens.
