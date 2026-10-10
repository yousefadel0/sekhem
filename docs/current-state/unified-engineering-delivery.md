# Unified conversation and engineering delivery

Date: 2026-10-09

## Product objective

A web application with IDE capabilities, one conversation/history, strong Arabic
and English dialogue, and governed engineering execution on local and remote
workspaces. ChatGPT, Codex and OpenHands are capability benchmarks. This document
tracks implementation work; it does not override the authoritative Notion roadmap
or establish production readiness.

## Evidence rules

Source inspection, deterministic tests, live acceptance and production acceptance
are separate evidence levels. A rendered connection label is not authorization.
No roadmap item is complete without its acceptance evidence. Existing user changes
must be preserved. No migration, service restart, deployment, certificate issuance
or remote execution follows automatically from this document.

## Ordered delivery

| Stage | Work | Acceptance | Status |
| --- | --- | --- | --- |
| 1. Baseline | Reconcile toolchain docs, dependency/type resolution, source provenance and capability truth | Reproducible build/typecheck and reviewed source diff in the actual environment | In progress; Git provenance unavailable |
| 2. Conversation | Full bounded answers, streaming through the conversation, cancellation, semantic interpretation and durable context | Long Arabic/code answers retained; unseen paraphrases preserve constraints; reload restores final messages | Full-answer source change implemented; conversation streaming and semantic work pending |
| 3. Runtime | Signed local distribution; authenticated remote worker; lifecycle and isolation | Clean-device signed-install acceptance and authorized isolated remote acceptance | Pending; public release record is unsigned; remote test target unspecified |
| 4. Engineering agent | Durable decision/action/observation loop; multi-file proposals; commands/tests; bounded repair; Git | A real disposable-project defect fixed, tested and verified with receipts and diff | Pending; current exact-plan adapter permits at most one write |
| 5. IDE | Incremental source/symbol indexing, navigation, diagnostics, buffers/conflicts, terminal and preview | Complete development journey and reload restoration | Existing editor foundation; expansion pending |
| 6. Operations | Durable worker ownership, concurrency measurements, isolation, backup/isolated restore and monitoring | Authorized failure/recovery/isolation and production acceptance | Pending |

## Current first increment

- Ordinary and streaming gateway answers share one parser.
- Accepted answers are no longer silently reduced to 4,000 characters.
- The existing 128,000-character provider response ceiling is retained at the
  answer parsing boundary. Oversized responses produce no successful partial answer.
- Model selection, configured output-token budgets and tool authorization are unchanged.
- Node documentation follows `.node-version` and package engines: 24.21.0.

The gateway streaming method already exists; connecting it to the durable
conversation transport remains separate work. This increment does not claim that
the visible conversation now streams or that the full product objective is delivered.

## External prerequisites

The remote journey needs a named disposable server, its allowed operations and
credentials provisioned through the supported secure connection workflow. Signed
Windows distribution needs a real publisher identity and provisioned signing
environment. Live proof of changed backend code requires identifying the active
server's source/build and supported reload process before invoking the model.
