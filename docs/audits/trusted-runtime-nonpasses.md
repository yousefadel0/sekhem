# Full backend nonpass ledger — 2026-09-23

Exact results from the untouched full backend suite: 51 failed, 39 cancelled, 1 intentionally skipped. Each row has exactly one class. Error/stack blocks are preserved from JUnit, with signed test cookies redacted. Cancellation has no individual execution stack: the original failed parent-hook stack is included. A skipped test has no error/stack.

The closest recorded pre-runtime baseline documents three identical exceptions; no complete pre-runtime full-suite capture exists. Fixture diagnosis is proven separately with read-only database/auth probes. A class of TEST_INFRASTRUCTURE identifies the observed cause, not an assertion that every downstream endpoint passes.

## 1. GET provider settings returns safe metadata only

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-gateway-provider-settings.test.ts
- Suite: AI Gateway provider settings HTTP contract
- Affected module: Provider-settings HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 24 - AI Gateway provider settings HTTP contract
  ---
  duration_ms: 750.1764
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-gateway-provider-settings.test.ts:2:6900'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-gateway-provider-settings.test.ts:178:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
  ...
~~~

## 2. rejects blocked-field payloads with normalized safe errors

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-gateway-provider-settings.test.ts
- Suite: AI Gateway provider settings HTTP contract
- Affected module: Provider-settings HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 24 - AI Gateway provider settings HTTP contract
  ---
  duration_ms: 750.1764
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-gateway-provider-settings.test.ts:2:6900'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-gateway-provider-settings.test.ts:178:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
  ...
~~~

## 3. sets budget and requests activation without enabling provider calls

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-gateway-provider-settings.test.ts
- Suite: AI Gateway provider settings HTTP contract
- Affected module: Provider-settings HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 24 - AI Gateway provider settings HTTP contract
  ---
  duration_ms: 750.1764
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-gateway-provider-settings.test.ts:2:6900'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-gateway-provider-settings.test.ts:178:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async Test.processPendingSubtests (node:internal/test_runner/test:974:7)
  ...
~~~

## 4. rejects unauthenticated AI Patch reads and writes

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 5. creates and reads a draft-only AI Patch request

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 6. moves a draft through review states and returns status history

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 7. approves a reviewed draft through the explicit gate without applying artifacts

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 8. rejects only reviewed drafts through the explicit gate

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 9. stops non-terminal drafts through the explicit gate and locks terminal gate actions

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 10. rejects missing and sensitive explicit gate action fields

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 11. creates, lists, and reads review-only artifacts

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 12. returns a safe consolidated audit timeline

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 13. returns a safe 404 for an unknown audit draft

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 14. rejects unsafe artifact paths and forbidden fields

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 15. rejects artifact creation for terminal drafts

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 16. rejects invalid transitions and locks terminal states

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 17. rejects missing or invalid transition request fields

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 18. rejects missing required string fields

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 19. rejects non-string-array constraints and safety notes

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 20. rejects forbidden execution-shaped or sensitive fields

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts
- Suite: AI Patch draft-only HTTP contract
- Affected module: AI Patch HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 25 - AI Patch draft-only HTTP contract
  ---
  duration_ms: 726.1244
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\ai-patch.http.test.ts:2:3017'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\ai-patch.http.test.ts:102:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 21. allows Viewer to access product and R&D read routes

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts
- Suite: Backend RBAC authorization boundary
- Affected module: RBAC HTTP login setup
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at sessionCookie (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:75:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:128:20)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 22. blocks Viewer from audit events and approval decisions without fake audit actor

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts
- Suite: Backend RBAC authorization boundary
- Affected module: RBAC HTTP login setup
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at sessionCookie (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:75:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:142:20)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 23. blocks Technical Reviewer from generic task status updates without fake audit actor

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts
- Suite: Backend RBAC authorization boundary
- Affected module: RBAC HTTP login setup
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at sessionCookie (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:75:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:155:31)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 24. blocks Security Reviewer from non-security R&D write endpoints

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts
- Suite: Backend RBAC authorization boundary
- Affected module: RBAC HTTP login setup
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at sessionCookie (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:75:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:167:30)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 25. allows Viewer workflow reads but blocks workflow and AI Patch writes

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts
- Suite: Backend RBAC authorization boundary
- Affected module: RBAC HTTP login setup
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at sessionCookie (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:75:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:178:20)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 26. uses the authenticated actor for workflow and AI Patch audit fields

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts
- Suite: Backend RBAC authorization boundary
- Affected module: RBAC HTTP login setup
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at sessionCookie (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:75:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:201:31)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 27. allows Technical Reviewer to create R&D technical review records

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts
- Suite: Backend RBAC authorization boundary
- Affected module: RBAC HTTP login setup
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at sessionCookie (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:75:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:236:31)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 28. allows PM to create and decide approvals with authenticated audit actor

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts
- Suite: Backend RBAC authorization boundary
- Affected module: RBAC HTTP login setup
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at sessionCookie (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:75:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-rbac.http.test.ts:252:16)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 29. keeps the session cookie HttpOnly, Secure and Strict while logout clears it

- Outcome: FAILED
- Class: PRE_EXISTING
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-service-contract.test.ts
- Suite: Authentication cookie contract
- Affected module: Authentication cookie contract test
- Evidence: docs/phase-0a-control-loop.md:117; docs/sekhem-mvp-repair-report.md:133; Pre-runtime and current source/test SHA256 equality

Known pre-runtime Secure assertion expects production cookie behavior in nonproduction NODE_ENV.

~~~text
Error [ERR_TEST_FAILURE]: The input did not match the regular expression /; Secure/. Input:

'sekhem_session=[REDACTED_TEST_TOKEN]; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'

    at async Promise.all (index 0) {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: The input did not match the regular expression /; Secure/. Input:
  
  'sekhem_session=[REDACTED_TEST_TOKEN]; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800'
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth-service-contract.test.ts:26:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'sekhem_session=[REDACTED_TEST_TOKEN]; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800',
    expected: /; Secure/,
    operator: 'match',
    diff: 'simple'
  }
}
~~~

## 30. sets an HTTP-only secure cookie on valid login without token in response body

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth.http.test.ts
- Suite: Auth HTTP boundary
- Affected module: Auth HTTP login setup
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201

    at async Promise.all (index 0) {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth.http.test.ts:88:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 31. returns active session from a valid cookie

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth.http.test.ts
- Suite: Auth HTTP boundary
- Affected module: Auth HTTP login setup
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth.http.test.ts:131:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 32. clears session cookie on logout

- Outcome: FAILED
- Class: OUTDATED_ASSERTION
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth.http.test.ts
- Suite: Auth HTTP boundary
- Affected module: AuthController logout cookie assertion
- Evidence: backend/src/auth/auth.service.ts:240; backend/test/auth.http.test.ts:182; backend/.runtime-state/post-audit-fixtures.tap

Requires Secure even with NODE_ENV=development; AuthService.clearCookie deliberately adds it only in production. Status and logout-body assertions preceding it pass. AuthService and this test are unchanged from pre-runtime hashes.

~~~text
[Error [ERR_TEST_FAILURE]: The input did not match the regular expression /Secure/. Input:

'sekhem_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: The input did not match the regular expression /Secure/. Input:
  
  'sekhem_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\auth.http.test.ts:165:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 'sekhem_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
    expected: /Secure/,
    operator: 'match',
    diff: 'simple'
  }
}
~~~

## 33. rejects unauthenticated human workflow routes and unsigned machine callbacks

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 34. POST /api/workflows/events creates a local workflow run placeholder

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 35. GET /api/workflows/runs lists local workflow placeholders

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 36. GET /api/workflows/runs/:id returns local workflow placeholder

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 37. POST /api/workflows/callbacks accepts a valid manual internal callback

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 38. POST /api/workflows/callbacks rejects a missing required field

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 39. POST /api/workflows/callbacks rejects an invalid status

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 40. POST /api/workflows/callbacks rejects unsafe raw content

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 41. POST /api/workflows/callbacks rejects invalid transitions

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 42. POST /api/workflows/callbacks enforces duplicate idempotency no-op

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 43. POST /api/workflows/callbacks rejects idempotency key reuse with different payload

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 44. POST /api/workflows/callbacks requires safe error fields for failed callbacks

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 45. POST /api/workflows/callbacks requires blocker fields for blocked callbacks

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 46. POST /api/ai/memos/request queues a local memo placeholder

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 47. GET /api/ai/memos/:id returns a local memo placeholder

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 48. POST /api/system/events records a local system event

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 49. invalid workflow event returns normalized error

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 50. invalid AI memo request returns normalized error

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 51. invalid system event returns normalized error

- Outcome: CANCELLED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts
- Suite: Backend Batch 6 automation and AI contract endpoints
- Affected module: Automation HTTP suite login hook
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:66; backend/.runtime-state/post-audit-fixtures.tap

Setup supplies staging env credentials but does not provision database users/sessions or isolate auth mode. The effective environment is postgres_read, DB auth=true, NODE_ENV=development. All five expected fixture emails are absent; AuthService.login selects DB auth and returns 401 Invalid credentials. Cancelled cases never entered their test bodies because the suite login hook asserted 201.

~~~text
[Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled] { code: 'ERR_TEST_FAILURE', failureType: 'cancelledByParent', cause: 'test did not finish before its parent and was cancelled' }
~~~
Parent-hook error and stack:
~~~text
not ok 35 - Backend Batch 6 automation and AI contract endpoints
  ---
  duration_ms: 550.8851
  type: 'suite'
  location: 'D:\\yy\\yy\\sekhem-product-application-main\\sekhem-product-application-main\\backend\\test\\automation-contract.test.ts:2:4674'
  failureType: 'hookFailed'
  error: |-
    Expected values to be strictly equal:
    
    401 !== 201
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: 201
  actual: 401
  operator: 'strictEqual'
  stack: |-
    SuiteContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\automation-contract.test.ts:169:12)
    process.processTicksAndRejections (node:internal/process/task_queues:104:5)
    async TestHook.run (node:internal/test_runner/test:1409:7)
    async Suite.runHook (node:internal/test_runner/test:1289:9)
    async Suite.run (node:internal/test_runner/test:1899:7)
    async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3)
  ...
~~~

## 52. rejects an escaping symlink

- Outcome: FAILED
- Class: PRE_EXISTING
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\execution-plane.test.ts
- Suite: Execution Plane Foundation (5D-A)
- Affected module: Legacy execution-plane tests / Windows symlink privilege / source-text assertion
- Evidence: docs/phase-0a-control-loop.md:117; docs/sekhem-mvp-repair-report.md:133; Pre-runtime and current source/test SHA256 equality

Known pre-runtime Windows file-symlink creation fails EPERM before capability behavior can be exercised.

~~~text
[Error [ERR_TEST_FAILURE]: EPERM: operation not permitted, symlink 'C:\Users\youse\AppData\Local\Temp\sekhem-5d-a-outside-n0H3p7\secret.txt' -> 'C:\Users\youse\AppData\Local\Temp\sekhem-5d-a-aHKVSl\src\escape.txt'] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: Error: EPERM: operation not permitted, symlink 'C:\Users\youse\AppData\Local\Temp\sekhem-5d-a-outside-n0H3p7\secret.txt' -> 'C:\Users\youse\AppData\Local\Temp\sekhem-5d-a-aHKVSl\src\escape.txt'
      at async symlink (node:internal/fs/promises:1707:10)
      at async TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\execution-plane.test.ts:115:7)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    errno: -4048,
    code: 'EPERM',
    syscall: 'symlink',
    path: 'C:\\Users\\youse\\AppData\\Local\\Temp\\sekhem-5d-a-outside-n0H3p7\\secret.txt',
    dest: 'C:\\Users\\youse\\AppData\\Local\\Temp\\sekhem-5d-a-aHKVSl\\src\\escape.txt'
  }
}
~~~

## 53. has a non-destructive cancellation contract and a disabled PowerShell executor

- Outcome: FAILED
- Class: PRE_EXISTING
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\execution-plane.test.ts
- Suite: Execution Plane Foundation (5D-A)
- Affected module: Legacy execution-plane tests / Windows symlink privilege / source-text assertion
- Evidence: docs/phase-0a-control-loop.md:117; docs/sekhem-mvp-repair-report.md:133; Pre-runtime and current source/test SHA256 equality

Known pre-runtime regex incorrectly matches the powershell.execute capability identifier; the legacy executor remains disabled.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

true !== false
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  true !== false
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\execution-plane.test.ts:148:12)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 54. returns wrapped authenticated 200 response for GET /api/projects

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 55. returns wrapped authenticated 200 response for GET /api/projects/project-community-sonic-sovereign/dashboard

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 56. returns wrapped authenticated 200 response for GET /api/modules

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 57. returns wrapped authenticated 200 response for GET /api/modules/rd-radar

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 58. returns wrapped authenticated 200 response for GET /api/initiatives

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 59. returns wrapped authenticated 200 response for GET /api/initiatives/evpn-bgp-validation-pack

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 60. returns wrapped authenticated 200 response for GET /api/initiatives/evpn-bgp-validation-pack/tasks

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 61. returns wrapped authenticated 200 response for GET /api/initiatives/evpn-bgp-validation-pack/activity

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 62. returns wrapped authenticated 200 response for GET /api/initiatives/evpn-bgp-validation-pack/blockers

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 63. returns wrapped authenticated 200 response for GET /api/approvals

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 64. returns wrapped authenticated 200 response for GET /api/security-gates/security-gate-evpn-bgp

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 65. returns wrapped authenticated 200 response for GET /api/release-candidates

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 66. returns wrapped authenticated 200 response for GET /api/release-candidates/release-candidate-evpn-bgp-001

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 67. returns wrapped authenticated 200 response for GET /api/blockers

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 68. returns wrapped authenticated 200 response for GET /api/audit-events

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:140:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 69. returns arrays for approved authenticated list endpoints

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:185:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 70. returns normalized not found errors for authenticated requests

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts
- Suite: Backend Batch 2 HTTP smoke tests
- Affected module: Product HTTP read fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 404
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 404
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-smoke.test.ts:194:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 404,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 71. creates a draft-only handoff with authenticated audit actor

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts
- Suite: Backend Batch 5 HTTP write endpoint tests
- Affected module: Product HTTP write fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

false !== true

    at async Promise.all (index 0) {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at assertWriteSuccess (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:57:10)
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:142:5)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 72. starts initiative with authenticated audit actor

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts
- Suite: Backend Batch 5 HTTP write endpoint tests
- Affected module: Product HTTP write fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

false !== true
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at assertWriteSuccess (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:57:10)
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:154:5)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 73. creates and decides approval while ignoring spoofed audit actor fields

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts
- Suite: Backend Batch 5 HTTP write endpoint tests
- Affected module: Product HTTP write fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

false !== true
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at assertWriteSuccess (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:57:10)
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:171:5)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 74. selects execution path with matching approval and authenticated audit actor

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts
- Suite: Backend Batch 5 HTTP write endpoint tests
- Affected module: Product HTTP write fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

false !== true
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at assertWriteSuccess (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:57:10)
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:200:5)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 75. updates task status with authenticated audit actor

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts
- Suite: Backend Batch 5 HTTP write endpoint tests
- Affected module: Product HTTP write fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

false !== true
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at assertWriteSuccess (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:57:10)
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:231:5)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 76. creates blocker with authenticated audit actor

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts
- Suite: Backend Batch 5 HTTP write endpoint tests
- Affected module: Product HTTP write fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

false !== true
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at assertWriteSuccess (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:57:10)
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:251:5)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 77. assistant client actor fields are ignored for authenticated PM approval decision

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts
- Suite: Backend Batch 5 HTTP write endpoint tests
- Affected module: Product HTTP write fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

false !== true
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  false !== true
  
      at assertWriteSuccess (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:57:10)
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\http-write.test.ts:272:5)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: false,
    expected: true,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 78. returns wrapped authenticated response for GET /api/rd-radar/status

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200

    at async Promise.all (index 0) {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:159:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1905:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:387:3) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 79. returns wrapped authenticated response for GET /api/rd-radar/evidence

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:159:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 80. returns wrapped authenticated response for GET /api/rd-radar/evidence-reviews

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:159:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 81. returns wrapped authenticated response for GET /api/rd-radar/candidates

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:159:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 82. returns wrapped authenticated response for GET /api/rd-radar/pm-decisions

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:159:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 83. returns wrapped authenticated response for GET /api/rd-radar/workflow-runs

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:159:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 84. returns wrapped authenticated response for GET /api/rd-radar/github-status

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:159:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 85. returns wrapped authenticated response for GET /api/rd-radar/github-sonic-preview

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:159:14)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 86. returns safe status and evidence fields

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:172:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 87. creates and reads evidence reviews

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:190:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 88. returns repository previews as read-only

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 200
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 200
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:206:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 200,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 89. creates candidate and PM decision responses

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:221:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 90. handles real input and workflow summaries with authenticated PM session

- Outcome: FAILED
- Class: TEST_INFRASTRUCTURE
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts
- Suite: R&D Radar API smoke tests
- Affected module: R&D Radar HTTP fixtures
- Evidence: backend/audit/post-runtime-fixtures.test.ts; backend/src/auth/auth.service.ts:132; backend/src/auth/authz.guard.ts; backend/.runtime-state/post-audit-fixtures.tap

Test fabricates a signature-only cookie for a nonexistent fixture user, without a durable session or organization. Current database auth correctly rejects it with 401, before the asserted product operation. Read-only probes confirmed all three fixture users are absent and that signature extraction succeeds while durable validation returns 401 User not found.

~~~text
[Error [ERR_TEST_FAILURE]: Expected values to be strictly equal:

401 !== 201
] {
  code: 'ERR_TEST_FAILURE',
  failureType: 'testCodeFailure',
  cause: AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  401 !== 201
  
      at TestContext.<anonymous> (D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\rd-radar.http.test.ts:247:12)
      at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
      at async Test.run (node:internal/test_runner/test:1409:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: 401,
    expected: 201,
    operator: 'strictEqual',
    diff: 'simple'
  }
}
~~~

## 91. runtime ledger and authorization against PostgreSQL

- Outcome: SKIPPED
- Class: ENVIRONMENT_DEPENDENT
- File: D:\yy\yy\sekhem-product-application-main\sekhem-product-application-main\backend\test\trusted-runtime-persistence.test.ts
- Suite: test
- Affected module: Opt-in PostgreSQL runtime integration suite
- Evidence: backend/test/trusted-runtime-persistence.test.ts:28; backend/.runtime-state/post-audit-runtime.tap

Full run explicitly leaves SEKHEM_RUNTIME_DB_TEST unset. This is intentional opt-in coverage, not an executed failure. The complete runtime suite was subsequently run with the flag set and passed.

SEKHEM_RUNTIME_DB_TEST !== 1 (boolean skip; reporter emits no stack)

