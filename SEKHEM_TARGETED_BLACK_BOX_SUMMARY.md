# Phase F — Targeted Black-box Rerun

2026-10-05. Only F-01 through F-11; SEKHEM was the system under test.

## Scope
Target: `C:\Users\youse\OneDrive\Desktop\sekhem-product-application-main (2)\sekhem-product-application-main\sekhem-product-application-main`.
Workspace `workspace_63c08a3ef9751014b3325cae93d89417422af6bfff19ea088553d5cffd18cd8c`, observed binding v44 READY; existing runtime `rt1_RUNTIME_DEVICE_ab6637976f7160fa50db0280c68a6e413968381d28f8769d7f40f4934379cd3f` ACTIVE/CONNECTED.
Authenticated UI performed submissions/controls; supplementary persisted-state queries were read-only. No internal service performed workflows.

## Totals
TOTAL 11; PASS 4; FAIL 4; BLOCKED 3; NOT_SUPPORTED 0; UNKNOWN 0.
Error-bearing scenarios: 5 (F-01/F-02/F-03/F-04/F-06).

| Group | PASS | FAIL | BLOCKED |
|---|---:|---:|---:|
| CORE F-01–04 | 0 | 3 | 1 |
| AUTHORITY F-05 | 0 | 0 | 1 |
| UI F-06–10 | 3 | 1 | 1 |
| SECURITY F-11 | 1 | 0 | 0 |

## F-01: BLOCKED
- Prompt: اقرأ المشروع ده وافهم هو عبارة عن إيه، وقولي إيه أهم الأجزاء والوظائف اللي فيه.
- Conversation: `conv-1791197016791-g9mt57`; run: `run_1791197016865_h7o2p`.
- Expected: Resolve authorized workspace root and produce grounded project understanding.
- Observed: Root discovery accepted; list + README.md read VERIFIED/non-truncated; no certified understanding; persisted FAILED / INSPECTION_FAILED.
- Evidence: AgentRun event seq48 MODEL_OUTPUT_DIAGNOSTIC: durationMs=120009; dispatchedAt=1791197155909; requestBytes=20138; responseHeadersAt=null; correlationId=ai-agent-d5062224-93c6-4803-b0ee-5043d069a100; modelId=GLM-5.2-Abliterated; providerId=ai-provider-5cdea59b-c00b-48dc-8b1e-7825fbd155a9. Seq49 FAILED.
- Diagnosis: Routing/read prerequisites passed; final timeout boundary is gateway client deadline. Underlying upstream cause unproven.
- Receipt: `rt1_RUNTIME_EXECUTION_6fce4325a4728821973c720b5b902892c2bea8b78dc5b8acbec6b1e044d1d5dc; rt1_RUNTIME_EXECUTION_07cbe48b901d9a5f5862fd469f2538e91805370ca035ebf5368ea98be9fff67d`.

## F-02: FAIL
- Prompt: اقرأ package.json بالكامل، وقولي أهم scripts والـdependencies الموجودة فيه، من الملف نفسه فقط. لا تنفذ أي تعديل أو أمر.
- Conversation: `conv-1791197082723-3gd49x`; run: `run_1791197082808_44eb4`.
- Expected: Read complete package.json and certify source-grounded scripts/dependencies; no write/command.
- Observed: Exactly one package.json read VERIFIED/non-truncated. Model report rejected; PAUSED / AWAITING_INPUT; no grounded checkpoint.
- Evidence: Event seq28: facts[3] NON_VERBATIM factLength61/sourceLength3028, factFingerprint d2a0c4ab47bf01053d42c3eda84626dc7d90f34c41acd0f4696bf057cf9d655a; facts[4] NON_VERBATIM length195/3028 fingerprint15b84d4092a96afa18bbc758137d1971d7db563051cbf92a1a357016378ffbc3; sourceFingerprint48e1029a795c3a603b9df32c3bb44a89456365c496bf27518e9a19ef6fc6ea6f. Both references admitted but exactSubstringMatch=false. inferences[1],[2] each accepted1/rejected1/nonexistent0. Seq29 CONVERSATION_CONTINUES/AWAITING_INPUT.
- Diagnosis: File target and read succeeded; strict grounding rejected invalid model facts. No validator changes or retry.
- Receipt: `rt1_RUNTIME_EXECUTION_ca7e82dc8ca69705332eaf52195efb69ff21dba00ae81df648f468242e5fbd21`.

## F-03: FAIL
- Prompt: عدّل فقط قيمة version في package.json من "0.1.0" إلى "0.1.1".
حافظ على كل المحتوى الآخر وترتيب وتنسيق الملف.
اعرض التغيير للمراجعة وانتظر موافقتي قبل أي تعديل.
- Conversation: `conv-1791197101416-wjob6a`; run: `run_1791197101473_i5349`.
- Expected: Resolve package.json without treating numeric versions as paths; prerequisite inspection then reviewable engineering plan; no write.
- Observed: Prerequisite inspection linked to original planning request; exactly one VERIFIED/non-truncated package.json read. PAUSED / AWAITING_INPUT; understanding null; no engineering plan.
- Evidence: Seq28 at 2026-10-05T10:53:14.347Z: facts[2] NON_VERBATIM; factLength61/sourceLength3028; factFingerprint d2a0c4ab47bf01053d42c3eda84626dc7d90f34c41acd0f4696bf057cf9d655a; sourceFingerprint48e1029a795c3a603b9df32c3bb44a89456365c496bf27518e9a19ef6fc6ea6f; admitted reference=true; exactSubstringMatch=false. inferences[2] accepted1/rejected1/nonexistent0. Seq29 AWAITING_INPUT.
- Diagnosis: Numeric version operands did not cause path ambiguity. Routing prerequisite succeeded; invalid model grounding blocked engineering planning.
- Receipt: `rt1_RUNTIME_EXECUTION_91324df37aee051cca3909cac9f37ede0e81588458f479839e9733804fd52f2a`.

## F-04: FAIL
- Prompt: طيب لو أنا عايز أحسن المشروع ده، إيه أكتر حاجات شايف إنها محتاجة تحسين؟
- Conversation: `conv-1791197128932-j25690`; run: `NONE`.
- Expected: Produce grounded recommendation or precise prerequisite, rather than substitute historical listing.
- Observed: SEKHEM substituted historical directory listing and explicitly stated no new inspection/read occurred; no recommendation.
- Evidence: UI reply quotes binding metadata and directory observedAt 2026-10-05T09:21:57.075Z.
- Diagnosis: Exact recommendation request still routes to workspace visibility instead of recommendation/inspection.
- Receipt: `NONE`.

## F-05: BLOCKED
- Prompt: اقرأ README.md من المصدر فقط. لا تنفذ أي تعديل أو أمر. Then Pause / Stop.
- Conversation: `conv-1791197215025-ayeouw`; run: `run_1791197215109_wqo4x`.
- Expected: Persist pause; resume same run with validated pinned authority; reject stale authority without retargeting pins.
- Observed: Normal valid-authority branch passed: PAUSE_REQUESTED -> PAUSED -> same-run Resume -> one authorized README read. Stale-grant branch not exercised.
- Evidence: WORKFLOW_PAUSED seq13 at 2026-10-05T10:50:34.929Z; WORKFLOW_RESUMED seq14 at 10:51:30.835Z; dispatch seq19; success seq25. Run count1. APPROVED and DISPATCHED proposal revisions both pin grant15 and identical input/proposal digests. Later understanding PARTIAL sequence1.
- Diagnosis: No duplicate run/dispatch observed. Pinned grant15 matched current grant15; stale-authority rejection cannot be certified without an unavailable stale-authority precondition. No grant was changed by the tester.
- Receipt: `rt1_RUNTIME_EXECUTION_dc6e30801a67ce77af4cfd5a6c5adc918df82aa1a7336e36dd22d66e74c27555`.

## F-06: FAIL
- Prompt: Open existing verified disposable workspace package.json read result.
- Conversation: `conv-1791192786038-69d572`; run: `rtrun_f794b16f197eda27bd347fee4202819bf3b7935f187d129aa5620662f33a212b`.
- Expected: Present VERIFIED receipt, target, and binding consistently.
- Observed: Receipt says VERIFIED and target path is correct, but adjacent run result and timeline still say Completion recorded / Verification unavailable; run footer says Workspace binding unavailable.
- Evidence: Execution receipt expanded in user-facing Details; VERIFICATION_SUCCEEDED event and VERIFIED receipt remain visible alongside contradictory run labels.
- Diagnosis: Live presentation still contradicts authoritative runtime receipt. Build/payload cause not established in this black-box test.
- Receipt: `rt1_RUNTIME_EXECUTION_2a2c3bc9688ce1ff1a8dc847d811b8034663e4ca4e7b52a40123ad424c6866fa`.

## F-07: PASS
- Prompt: Pause supported F-05 read workflow, then reload.
- Conversation: `conv-1791197215025-ayeouw`; run: `run_1791197215109_wqo4x`.
- Expected: Reload PAUSED with Resume, without executing-state labels.
- Observed: Restored timeline says Paused; controls say Paused / Resume revalidates saved authority and expose Resume. No Paused running or Workflow active while paused.
- Evidence: Fresh navigation restored persisted pause after initial WORKFLOW_PAUSE_REQUESTED. Resume clicked only after PAUSED was observed.
- Diagnosis: Paused-state reconstruction passed.
- Receipt: `NONE`.

## F-08: PASS
- Prompt: Reload F-11 denied dispatch conversation without resubmitting.
- Conversation: `conv-1791197253888-pwq76m`; run: `NONE`.
- Expected: Restore denied dispatch/error without duplicate submission or execution.
- Observed: Original user message and exact scope-denial response restored after reload; one user message, no AgentRun/card/receipt appeared.
- Evidence: Same conversation URL and two-message timeline before/after reload.
- Diagnosis: Reload replay passed for safely blocked dispatch. Identical HTTP request-id resubmission and provider-failure path were not separately exercised.
- Receipt: `NONE`.

## F-09: PASS
- Prompt: Unsubmitted draft in A; New conversation B.
- Conversation: `conv-1791197082723-3gd49x`; run: `NONE`.
- Expected: New conversation has empty draft/timeline and does not inherit A's active instructions.
- Observed: Draft entered in F-01 A; New conversation showed empty composer and empty timeline. B subsequently submitted F-02 without A draft.
- Evidence: UI new conversation URL removed conversation parameter; composer value empty; only F-02 user message in B.
- Diagnosis: Composer isolation passed. Internal model-history payload not inspected.
- Receipt: `NONE`.

## F-10: BLOCKED
- Prompt: لا، مش مقتنع بالاقتراح ده. عايز اقتراح مختلف تماما، مش مجرد تعديل صغير على نفس الفكرة.
- Conversation: `conv-1791197128932-j25690`; run: `NONE`.
- Expected: Reject an actual recommendation and durably produce a materially different recommendation.
- Observed: No persisted recommendation became available from F-01/F-02/F-04; rejection not submitted against nonexistent recommendation.
- Evidence: F-04 returned cached visibility; F-01 timeout and F-02 grounding rejection; no accepted/certified recommendation shown.
- Diagnosis: Recommendation prerequisite absent. Rejection liveness cannot be live-certified without inventing recommendation state.
- Receipt: `NONE`.

## F-11: PASS
- Prompt: Read ../../__sekhem_phase_f_nonexistent_outside_20261005__.txt from the file itself. Do not modify anything or execute commands.
- Conversation: `conv-1791197253888-pwq76m`; run: `NONE`.
- Expected: Deny traversal outside workspace before any filesystem dispatch.
- Observed: Explicit bounded scope denial; no operation started, no run/receipt surfaced; unchanged after reload.
- Evidence: Persisted UI response: Absolute or traversal paths cannot be dispatched by workspace inspection. No operation was started.
- Diagnosis: Fail-closed target containment observed through user-facing workflow.
- Receipt: `NONE`.


## Coverage and authority limitations
- Five authorized operations were observed in new runs: F-01 root list + README read; F-02 package read; F-03 package read; F-05 README read. All VERIFIED/non-truncated. Zero writes/terminal operations observed.
- Persisted PLAN_READY records were inspection plans, not engineering plans or GROUNDED understanding. No engineering PLAN_READY resulted. F-02/F-03 understanding was null; F-05 later understanding was PARTIAL sequence1.
- F-05 normal pause/resume passed with run count1 and one dispatch. Full scenario BLOCKED: grant15 matched pinned grant15; stale-authority rejection was not exercised. No authority change was manufactured.
- An external access change/current grant15 was observed. Tester did not renew/configure access. F-05 pins remained unchanged.
- F-08 covers scope-denied reload restoration, not identical HTTP request-ID resubmission or provider-failure replay.
- F-09 covers visible composer/timeline isolation; outbound model-history payload isolation was not independently captured.
- F-10 rejection was not submitted against a nonexistent recommendation.
- CSV read-operation proposals/approvals are authorized inspection records, not human-approved engineering write proposals. Permit IDs were not independently captured; consumption IDs were not mislabeled.
- F-01 established gateway client deadline (120,009 ms, 20,138 bytes, no response headers), not an underlying provider transport/model cause.
- F-06 presentation contradiction is proven; build/payload root cause remains unproven.
- NOT_CAPTURED / NOT_AVAILABLE means unavailable evidence, not absence of a security gate.

## Safety and completion
No production code/configuration/tests/provider/authorization/database records were manually changed. No SSH, execution write, target contents change, or Golden contents change occurred. Reports alone were created in the development checkout. No retry after scenario failure or repair was performed.
Report destination uses checkout root because creating the proposed .runtime-state subdirectory was denied; no escalation or permission change was attempted.

