# Improvement audit ledger

Baseline: `5ca412d5d2ba8e0db4d1e14d361f3443b86df90c` on `main`, verified against GitHub on 2026-10-04. Work branch: `codex/audit-safety`.

The original 36 findings below came from a source audit, not live exploitation. An open item remains a hypothesis until independently investigated. This ledger records evidence, dispositions, checks, and the next bounded work so later batches do not repeat or conflict with earlier work.

## Boundaries and coordination

- One separate draft PR; no merge, deployment, new service, credential, billing, hosting, or system/network change.
- The existing `/Users/yoginth/rag.computer` checkout is on `yoginth/remove-dead-code` with substantial uncommitted Elixir migration work. It was inspected read-only. All audit changes use a separate clone of the verified baseline; none of that work is copied or modified.
- No `.agents` directory or nested `AGENTS.md` exists in the baseline checkout. Root `AGENTS.md` and `STYLEGUIDE.md` govern this work. Removed test runners and coverage suites stay removed. Behavioral verification uses temporary local smoke scripts with mock transports and fake credentials outside the repository.
- Tenant findings 4–7, related metadata propagation, and replay authorization need a coherent design before schema, reindex, or provisioning work. Tenant provisioning stays unchanged.
- Uncommitted batches are backed up outside this checkout before commit. Each useful batch requires relevant checks and independent review. Do not create changes merely to fill an hourly schedule.
- Parent continuation requires approximately one combined commit per hour, anchored to the latest publication. Journal is running in its separate coordinator; this work must not start or modify Journal. The parent handles continuation scheduling.

## Findings

Paths below are relative to `api/bigrag/` unless another package is named.

| ID | Finding and reported source | Disposition / evidence |
|---|---|---|
| 1 | Saved chat credential can reach a caller-selected endpoint; `services/chat/turn/credentials.py`, `services/chat/provider.py` | Fixed in batch 1. Mock reproduction accepted a different endpoint at baseline. Save-time verification now records a normalized destination authenticated with a versioned HMAC using the existing provider key. Chat and suggestions reject mismatches, forged bindings, and legacy unbound keys. Existing keys need to be saved again. No schema or new secret. |
| 2 | Idempotency replay precedes current auth; `middleware/idempotency.py`, `middleware/principal.py` | Independently confirmed; open. Both replay paths bypass dependencies/handler authorization. Cookie/bearer selection also differs from auth. A middleware login check alone misses admin, scope, collection-body, tenant, and ownership guards. Next work requires reusable read-only authorization guards, fresh selected-credential validation, and safe handling of legacy cache entries; denials must never execute mutations again. |
| 3 | Document metadata omitted from chunk metadata; `services/queue_embedding/chunk_metadata.py`, `insert_batches.py` | Open; coordinate with tenant metadata design before changing stored vector metadata. |
| 4 | Tenant API-key field absent from API models/admin key creation despite auth reading it; `models/auth.py`, admin API-key routes | Open; tenant workstream, no provisioning or schema change authorized by this ledger. |
| 5 | Suggestions and analytics omit tenant guards; `services/chat/questions/api.py`, `routers/analytics.py` | Open; tenant workstream. Batch 1 only fixes session concurrency, not isolation. |
| 6 | Vector upsert/delete and collection truncate miss tenant safeguards | Open; tenant workstream, validate ownership and collection boundaries together. |
| 7 | Upload sessions owned only by issuing user | Open; tenant workstream, review key/tenant ownership together. |
| 8 | Docker context excludes SDK required by UI `COPY` | Existing PR [#77](https://github.com/bigint/rag.computer/pull/77), head `c121513f3f8fd2192f28aefb88191ae69e5b632f`. Read-only review: its targeted exclusion retains Python exclusion while making TypeScript available. Do not duplicate or merge; Docker runtime verification not performed here. |
| 9 | Ready document/source cleanup precedes fallible followups and may lead to destructive retry; queue processing/finalize | Open; inspect transaction and retry boundaries before editing. |
| 10 | Failed-document dedup prevents retry | Open; validate alongside ingestion finalization. |
| 11 | Lookup-before-insert hash dedup race with nonunique index | Open; schema coordination required if constraints are needed. |
| 12 | Upload limits use unlocked stale counts | Open; inspect concurrent quota accounting. |
| 13 | Queue recovery ignores `lrem` result and sets lease unconditionally | Open; inspect atomic recovery ownership. |
| 14 | Mixed text/scanned PDFs skip OCR | Open; reproduce with generated non-sensitive documents. |
| 15 | ProcessPool timeout leaves conversion process running | Open; inspect worker lifecycle and cancellation. |
| 16 | Whole-document embeddings retained by gather | Open; inspect ingestion memory bounds. |
| 17 | SDK exception retries ignore safety flag; Python `_core.py`, TypeScript `core.ts` | Fixed in batch 1. Python mock transport reproduced three unsafe attempts at baseline; exception retries now honor the flag in both SDKs. Timeouts fail immediately, following the style guide. Reads and keyed mutations retain connection-error retries. Multipart/large-body replay limitations remain under 18. |
| 18 | Idempotency skips multipart/large bodies and has a 60-second unrenewed lease | Open; coordinate with 2. SDK docs now disclose the replay limits; automatic upload retry policy and lease renewal still need investigation. |
| 19 | SSE heartbeat `wait_for(__anext__)` cancels slow provider iterator; `services/chat/completion.py` | Fixed in batch 1. Baseline slow-token smoke returned an empty successful assistant. One pending token task survives heartbeat ticks. Cleanup is shielded from ASGI cancellation, and the raw provider response closes even when disconnected immediately after a delta. |
| 20 | Stale chat finally/collection switch clears newer state; `app/src/features/chat/use-chat-streaming.ts` | Fixed in batch 2. Store-owned controller identity guards start, updates, stop, and finish. Same-collection selection preserves the stream; collection changes, clear, unmount, and account reset abort it. Late completion cannot clear a newer response. |
| 21 | EOF without terminal event appears successful; `app/src/lib/chat-stream.ts` | Fixed in batch 2. Truncated mock SSE reproduced success at baseline. Parser requires done/error/[DONE], handles CRLF and terminal tails, cancels the reader, and ignores post-terminal frames. Partial answers remain visible beside an interruption error. |
| 22 | Password change revokes session then UI logout fails | Fixed in batch 2. Independent review confirmed logout authenticates after password revokes every session. Successful password change now clears the cookie and local session directly, with guarded navigation and no extra logout call. Incorrect-current-password 401 preserves the session. |
| 23 | Logout leaves chat/upload Zustand stores | Fixed in batch 2. Confirmed transitions replace/remount the QueryClient provider, abort generation-owned auth/upload requests and chat, reset stores, and seed the new session. Upload persistence is owner-bound; unowned v1 IDs are discarded. Generation guards prevent late callbacks from restoring tracking. Focus/reconnect and active-tab minute refresh detect confirmed expiry/account changes. |
| 24 | Upload UI ignores returned `item.status=failed` | Fixed in batch 3. Baseline mock returned a failed item under HTTP 201 while the UI reported it queued. File responses now record failed/canceled items, final counts drive warnings, and issue panels remain visible. Failed validation rows keep their status during persistence. |
| 25 | Closed incomplete upload sessions remain uploading | Fixed in batch 3. Baseline closed sessions with missing files remained preparing/uploading. Missing files after closure now fail once accepted work is inactive; active work stays ingesting. New file requests reject closed sessions. The UI closes after all attempts, including all failed requests, and recognizes cancellation conflicts. |
| 26 | Allowed file types and empty-file semantics inconsistent | Open; compare upload entry points and server validation. |
| 27 | Personal-key-only UI gate blocks instance chat credentials | Open; inspect safe readiness contract before removing gate. |
| 28 | Analytics gather shares AsyncSession; `services/analytics.py` | Fixed in batch 1. Mock session reproduced overlapping execute calls at baseline. Period queries now run sequentially in one session, preserving output and five-minute cache. |
| 29 | NDCG duplicates document hits and can exceed 1 | Corrected in the pending batch 4. Actual baseline helper scored three hits for one relevant document as 2.1309297535714578. Each relevant ID now earns credit only once at its original rank; hit_ids, recall, MRR, and unique rankings stay unchanged. See pending-batch verification before publication. |
| 30 | ASCII/length tokenizer drops Unicode and short terms | Open; inspect backend lexical search contract and generate bounded examples. |
| 31 | Reranking only final top-k and silent degradation | Open; inspect candidate budget and safe error signaling. |
| 32 | Explicit null settings cannot clear values | Partially corrected in pending batch 4 for nullable collection default_min_score and metadata_schema. Baseline explicit null changed neither field; updates now use fields-set semantics and both SDK update types admit null. Omission, zero, and empty schema retain their semantics. API-key expiry and other nullable update contracts remain open for separate validation. |
| 33 | Retrieved context in system prompt lacks untrusted-data boundary | Open; inspect prompt/data roles without live provider calls. |
| 34 | Usage estimates characters/4 with incomplete prices/history | Open; describe estimate provenance; do not present as billing or change billing. |
| 35 | Upload polling loads all rows | Open; inspect active-session query and pagination. |
| 36 | Docker Python install ignores verified uv.lock/current Torch | Open; inspect frozen install and platform constraints; do not combine with PR 77. |

## Batch 1 verification

Changes: saved provider destination binding, slow-stream heartbeat ownership, safe SDK exception retry policy, sequential analytics queries, and matching documentation.

Temporary reproductions initially failed for saved-key redirection, slow-stream token loss, unsafe Python connection/timeout retries, and concurrent analytics session use. These now pass.

- `pnpm check`: passed on the final source, covering Biome, API Ruff lint/format, all workspace typechecks, app/SDK/docs builds, and API compile. The docs build required access for its existing Google font download; an earlier sandboxed build was interrupted after it stalled. No font or network configuration changed.
- Python SDK Ruff lint/format, compile, wheel and source distribution build: passed.
- Backend mocked smoke: eight checks passed, covering saved destination rejection, destination/credential matrix, signed preference binding and redaction/clear, delayed tokens across heartbeats, pending-read cancellation, actual OpenAI AsyncStream response closure after a delta, AnyIO scope cancellation with awaited cleanup, and exclusive analytics session use.
- Python SDK mocked connection/timeout retry matrix: four checks passed. TypeScript SDK runtime smoke: eight checks passed, including generated-key reuse and unkeyed mutation behavior.
- Independent reviewer initially found unsigned legacy preference bindings and provider cleanup gaps. All were reproduced, fixed, and re-reviewed. Final review: no blocking findings. Reviewer separately verified encrypted-key bindings, rejected updates, and legacy rejection for chat and suggestions.
- `git diff --check`: passed. No test runner or coverage suite added. The route generator emits an existing circular-module warning during otherwise successful app typecheck/build.

Local recovery: verification logs and temporary smoke scripts live beside this checkout in the task workspace. A copy of changed files, binary diff, and manifest is saved under the task's `audit-backups/` before the commit. These copies exclude dependencies, runtime data, and secrets. This ledger is the durable source for later batches; continue in the same draft PR.

Published batch 1: commit `d5f8c60d64826bdf0779678c6cf8fbbb442b9d5d` in draft PR [#90](https://github.com/bigint/rag.computer/pull/90). All six GitHub checks passed: lint, repo-check, SDK typecheck, Python SDK build, website build, and app build.

Next coordination: replay authorization (2/18) needs guard extraction design; tenant isolation (3–7) needs explicit coordination with the separate migration work before persistence changes. Other bounded findings remain available for independent reproduction.

Limitations: no live credential transmission, exploit, production database/vector access, Docker service start, provider billing, or deployed runtime verification. Idempotency authorization and tenant isolation remain open and are not claimed fixed.

## Batch 2 verification

Changes: UI stream terminal/ownership handling, password cookie cleanup, guarded auth transitions, retired query-client isolation, and owner-bound upload tracking. No schema, tenant provisioning, replay middleware, service, or credential changes.

- `pnpm check`: passed, covering repository lint, API Ruff lint/format, workspace typechecks, app/SDK/docs builds, and API compile. Existing route-generator circular-module warning remains.
- Nine external UI runtime checks passed: truncated SSE, done/error/[DONE] termination and reader cancellation, CRLF/chunked tails, atomic stream ownership, legacy persistence migration, owner/session comparisons, generation cancellation/cache isolation including a real late mutation, and same-owner refresh/sign-out behavior.
- Password backend smoke passed: successful password change deletes sessions and the cookie; validation failure retains the cookie. No database or provider connection used.
- Independent source review and 16 mocked runtime checks passed. Review found stale caller navigation, login-versus-session-refresh adoption, and overlapping auth-gate issues; all fixed and re-reviewed. Independent coverage includes actual QueryObserver cancellation, stale auth responses, upload cancellation before late callbacks, and denied localStorage.
- Browser smoke with intercepted API responses passed for truncated-answer rendering, stop/immediate resend, password validation/success, login, confirmed account switch with a late mutation, and confirmed expiry. Vite's versioned module URLs initially made the fixture inspect a duplicate module; the fixture was corrected to use the running app's imports. Incorrect-password 401 preserves the account; successful change reaches sign-in with empty chat/upload tracking and zero logout requests.
- `git diff --check`: passed. Temporary scripts, browser artifacts, and logs stay outside the production checkout; no removed runner or suite restored.

Limitations: confirmed `/me` responses drive expiry/account-switch cleanup; no claim of instantaneous detection across tabs. Canceling browser work cannot undo API work already accepted, and cross-tab cookie races remain outside this client lifecycle change. Explicit sign-out clears tracking IDs; same-account reload/refresh retains them.

Published batch 2: commit `02c2f032028b920b4338374705f34c2f7f750a21` in draft PR #90. All six GitHub checks passed on this head.

## Batch 3 verification

Changes: upload item failure reporting, preservation of validation failures, closed/missing-file terminal states, rejection of new requests after closure, cancellation handling, and retained issue panels with matching documentation.

- `pnpm check`: passed, covering repository lint, API Ruff lint/format, workspace typechecks, app/SDK/docs builds, and API compile. The final badge-only follow-up also passed app typecheck/build and Biome lint.
- Eleven backend mocked checks passed: open/closed count and active-work combinations, cancellation preservation, full-count partial success, failed-item persistence, and rejection after closure.
- Eleven UI runtime checks passed: failed/canceled HTTP-success items, accepted wording, closing after all failed requests, missing/late-failure warnings, cancellation from responses and file/finalization conflicts, unrelated conflicts, and issue-panel retention.
- Independent review reran both sets and four additional in-memory checks using the real SDK ConflictError: pending attempts stop after cancellation, unrelated conflicts stay errors, session abort blocks closure, and failed cancellation lookup does not report false cancellation. Review approved the final warning badge for completed sessions containing failed/canceled files.
- Intercepted browser smoke passed for a rejected HTTP 201 file with one completion call, a closed session with missing files, and a completed session with a canceled item. Tracking and issue panels remained visible; no browser runtime errors occurred. Screenshots were visually checked.
- `git diff --check`: passed. Temporary scripts, logs, and browser artifacts remain outside the checkout. No test runner or coverage suite restored.

Limitations: requests admitted before closure can still finish; stronger serialization, document registration, and quota races need a separate coordinated change. The batch does not claim transactional cancellation, automatic ingestion retry, or tenant isolation.

Hourly continuation: a thread-heartbeat creation was attempted, but the app returned “Automations are only supported for local threads.” No recurring automation was created. This delegated task needs continuation from its local parent task; no standalone cron workaround was installed.

Published batch 3: commit `eb9486f9eeeab1e2e3f828cf385126b241f79b3b` in draft PR #90 at approximately 10:00 UTC. All six GitHub checks passed. The parent subsequently confirmed it handles scheduling; no automation setup is needed here. The next routine combined publication is held until approximately 11:00 UTC.

## Pending batch 4

Related retrieval correctness changes: unique nDCG relevance credit and explicit clearing of nullable collection retrieval/validation settings, with SDK types and matching docs. No schema or reindex change. Reproductions and smoke scripts live outside the checkout.

Design proposals are in [authorization-options.md](docs/audit/authorization-options.md). Replay response quarantine versus shared current-authorization guards and tenant collection quarantine versus shared/separate durable layouts require a decision before larger implementation. Proposals include current reachability, compatibility, legacy handling, and schema/reindex boundaries; this batch implements none of those options.

Verification before the held publication:

- `pnpm check`: passed on final code; final documentation build also passed after compatibility clarification.
- 25 external runtime checks and 364 ranking combinations passed. Clearing metadata validation still requires tenant metadata where configured.
- Independent review passed 43,688 ranked-list/label-set comparisons against a first-occurrence oracle, including unchanged recall/MRR and 520 unchanged unique rankings. Isolated handler execution preserved hit IDs, top-k, per-case/aggregate output, and one retrieval per case.
- Actual Python SDK MockTransport and compiled TypeScript SDK mocked fetch preserved explicit null, omission, zero, and empty schema; the public TypeScript null contract compiled. An initial external type-check invocation omitted the SDK's Node type settings; it passed after using the existing Node type root.
- Pre-commit hooks, Python SDK Ruff/format, wheel/source-distribution build, and diff checks passed. The package build initially hit sandbox DNS while resolving its existing Hatchling backend; it passed with authorized network access. No build configuration or dependency declaration changed.
- Independent design review corrected credential-cache precedence, fresh role/session requirements, suggestions generation, global aggregate coverage, tenant creation, T0/replay interaction, and T2 session policy. No blocker remains to presenting the proposals; larger implementation requires the requested policy decision.

No new commit or push yet: retain one combined batch for the next approximately 11:00 UTC publication window. Existing PR head remains eb9486f9; its six CI jobs passed.
