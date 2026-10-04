# Improvement audit ledger

Baseline: `5ca412d5d2ba8e0db4d1e14d361f3443b86df90c` on `main`, verified against GitHub on 2026-10-04. Work branch: `codex/audit-safety`.

The original 36 findings below came from a source audit, not live exploitation. An open item remains a hypothesis until independently investigated. This ledger records evidence, dispositions, checks, and the next bounded work so later batches do not repeat or conflict with earlier work.

## Boundaries and coordination

- One separate draft PR; no merge, deployment, new service, credential, billing, hosting, or system/network change.
- The existing `/Users/yoginth/rag.computer` checkout is on `yoginth/remove-dead-code` with substantial uncommitted Elixir migration work. It was inspected read-only. All audit changes use a separate clone of the verified baseline; none of that work is copied or modified.
- No `.agents` directory or nested `AGENTS.md` exists in the baseline checkout. Root `AGENTS.md` and `STYLEGUIDE.md` govern this work. Removed test runners and coverage suites stay removed. Behavioral verification uses temporary local smoke scripts with mock transports and fake credentials outside the repository.
- Tenant findings 4–7, related metadata propagation, and replay authorization need a coherent design before schema, reindex, or provisioning work. Tenant provisioning stays unchanged.
- Uncommitted batches are backed up outside this checkout before commit. Each useful batch requires relevant checks and independent review. Do not create changes merely to fill an hourly schedule.

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
| 20 | Stale chat finally/collection switch clears newer state; `app/src/features/chat/use-chat-streaming.ts` | Open; inspect stream ownership and collection-switch lifecycle. |
| 21 | EOF without terminal event appears successful; `app/src/lib/chat-stream.ts` | Source inspected; open. Parser breaks on reader EOF without checking terminal completion. Validate with truncated mock SSE before editing. |
| 22 | Password change revokes session then UI logout fails | Source inspected; open. Account tab awaits logout after password change; review backend session deletion and local sign-out cleanup together. |
| 23 | Logout leaves chat/upload Zustand stores | Source inspected; open. Logout currently clears TanStack Query only; inventory all stores and active request ownership before editing. |
| 24 | Upload UI ignores returned `item.status=failed` | Open; validate terminal upload states. |
| 25 | Closed incomplete upload sessions remain uploading | Open; review completion/cancellation state transitions. |
| 26 | Allowed file types and empty-file semantics inconsistent | Open; compare upload entry points and server validation. |
| 27 | Personal-key-only UI gate blocks instance chat credentials | Open; inspect safe readiness contract before removing gate. |
| 28 | Analytics gather shares AsyncSession; `services/analytics.py` | Fixed in batch 1. Mock session reproduced overlapping execute calls at baseline. Period queries now run sequentially in one session, preserving output and five-minute cache. |
| 29 | NDCG duplicates document hits and can exceed 1 | Open; validate relevance unit and duplicate handling. |
| 30 | ASCII/length tokenizer drops Unicode and short terms | Open; inspect backend lexical search contract and generate bounded examples. |
| 31 | Reranking only final top-k and silent degradation | Open; inspect candidate budget and safe error signaling. |
| 32 | Explicit null settings cannot clear values | Open; inspect update models, fields-set semantics, and docs. |
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

Next bounded batch: validate UI stream ownership/EOF and password-change/logout cleanup (20–23), then handle upload terminal states. Replay authorization (2/18) needs guard extraction design; tenant isolation (3–7) needs explicit coordination with the separate migration work before persistence changes.

Limitations: no live credential transmission, exploit, production database/vector access, Docker service start, provider billing, or deployed runtime verification. Idempotency authorization and tenant isolation remain open and are not claimed fixed.
