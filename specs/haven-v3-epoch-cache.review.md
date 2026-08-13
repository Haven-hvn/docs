# Review: Haven V3 Epoch Cache

*Reviewed: 2026-08-13 | Spec: haven-v3-epoch-cache*

## Summary
Spec proposes a well-scoped, epoch-aware cache for `haven-aol` that correctly isolates `haven-aol` as the sole in-scope service and respects `decoupled` boundaries for `haven-dapp`/`haven-cli`/`haven-mobile`. However the document is **truncated mid-Proposed Design** and has **zero code context** (`corbell embeddings:build` 0 chunks), so all file paths and `eth_call`/`check_approval` signatures are inferred/proposed and cannot be verified. Missing Risk, Observability, Testing, and Rollout sections plus an unvetted new Redis dependency make it unsafe to approve as-is.

## Score
Completeness: 4/10
Architecture Accuracy: 8/10
Risk Coverage: 5/10

## Issues Found
- [CRITICAL] **Spec body truncated/incomplete** - Cuts off at `haven-aol/src/config/cache_conf` mid-sentence. No Testing, Observability/Metrics, Risk/Failure Modes, Alternatives, or Rollout/Safety sections present. Graph-Detected `WARNING: Spec body appears incomplete or template-only` is accurate. Cannot pass completeness gate.
- [CRITICAL] **Zero code context - all changes speculative** - `corbell embeddings:build returned 0 chunks`. Every file reference is marked `PROPOSED NEW FILES` / `INFERRED EXISTING FILES`. No verification that `check_approval(wallet, chain, token, threshold, epoch)` or `eth_call` path exists, what its signature is, or where `get_current_epoch()` lives. High drift risk.
- [CRITICAL] **No rollout/rollback plan** - No feature-flag (`V3_EPOCH_CACHE_ENABLED`) rollout stages, canary, kill-switch, or Redis migration plan despite introducing new stateful dependency. Violates Rollout Safety.
- [WARNING] **New infrastructure dependency not in graph** - `RedisEpochCache` (primary) via `REDIS_URL` / `redis.asyncio` is not present in Current Service Graph (only `haven-aol` python service). No infra provisioning, connection pooling, auth, or failure-mode defined. If Redis is unavailable, is fallback to `InMemoryEpochCache` automatic or does it fail open to `eth_call`? Undefined.
- [WARNING] **30d TTL with only-positive caching creates stale-approval / revocation risk** - Spec caches `approved==true` for 2592000s and explicitly does *not* cache `false`. No invalidation on on-chain revocation, reorg, or `allowance` decrease. Long TTL maximizes hit rate but violates correctness if approval is revoked within 30d. No revocation listener, versioning, or manual purge described.
- [WARNING] **Future-epoch guard vs threshold-zero collapse ordering ambiguous** - Spec defines `normalize_epoch(threshold==0 -> 0)` then says guard should compare *original* `requested_epoch > current_epoch` (not normalized) to prevent `threshold=0, epoch=999` abuse. Flow diagram shows `epoch_norm` first then `if epoch > current` - unclear which `epoch` is checked. Must be deterministic and tested; otherwise cache poisoning for future epochs possible.
- [WARNING] **Cache stampede / thundering herd not addressed** - On miss, concurrent `check_approval` for same key will all fire `eth_call` (RPC cost/throttle). No `singleflight`, `SETNX` lock, or request coalescing. Undermines `>80% eth_call reduction` and p99 goals.
- [WARNING] **In-memory fallback sizing and ICP stable memory sweep undefined** - `TTLCache(maxsize=10000, ttl=2592000)` with 30d TTL will hold 10k entries for 30 days per replica; no memory bound analysis, no per-replica consistency, and `stable_memory::V3_EPOCH_CACHE` sweeper worker is mentioned but not designed (interval, cost, canister upgrade persistence).
- [NOTE] **Graph-Detected Issues are false positives on decoupled services** - Detector flagged `haven-dapp`/`haven-cli`/`haven-mobile` as "not listed in front-matter" but spec's `All Known Services` *does* list them with `tags: ['decoupled']` and explicitly states they require no changes. Architecture Accuracy is actually correct: `haven-aol` is sole in-scope service, others are correctly decoupled. No fix needed, but front-matter should be regenerated to silence detector.
- [NOTE] **Key normalization contradiction** - Key schema says `token_address_normalized: lower() + checksum validation` and `wallet_normalized: lower()`. `lower()` destroys checksum. Need canonical form: `lower()` for keying *after* `isAddress`/`getAddress` validation, or `EIP-55` checksum consistently.
- [NOTE] **Negative caching gap vs success criteria** - Success criteria claims `>80% eth_call reduction` but spec punts on negative caching (`do not cache false`). Mixed workloads with many unapproved wallets will see no reduction. Should quantify or explicitly accept.
- [NOTE] **Epoch source inconsistency** - `V3_CURRENT_EPOCH_SOURCE=env|rpc|canister_state` includes `rpc` option, but guard section says "No RPC call to fetch epoch" and must fail-fast before `eth_call`. If `rpc` source is used, guard itself adds RPC pressure.

## Recommended Changes
- **Complete the document and re-run `corbell embeddings:build`** - Restore missing sections (Testing, Observability, Risks, Rollout) and resolve 0 chunks before review. Replace inferred signatures with verbatim snippets from `haven-aol` once indexed.
- **Define explicit guard ordering and add property tests** - Pseudocode: `raw_epoch = input; if raw_epoch > get_current_epoch(): reject; epoch_norm = normalize_epoch(threshold, raw_epoch); key = build(...)`. Add unit tests for `threshold=0, epoch=999` -> reject, and `threshold=0, epoch=5` vs `99` -> same key.
- **Harden TTL/revocation strategy** - Either shorten TTL (e.g., 1h-24h) with metrics, or add explicit invalidation: on-chain event listener, `cache.delete` on `approve`/`revoke` tx, or version key with `epoch` rotation. Document why 30d is safe for threshold-gated approvals.
- **Define Redis failure mode and fallback** - Specify: on `RedisTimeout/ConnectionError` -> log `v3_epoch_cache_error_total`, fallback to `eth_call` (fail-open) and optionally in-memory cache; do not fail request. Add `REDIS_URL` infra ticket and connection pool config.
- **Add stampede protection** - Use `SETNX` with short lock or `asyncio` singleflight per key for in-process, and document that `SETEX` overwrite is safe because value is deterministic.
- **Clarify key canonicalization and add collision test** - Define `normalize_address(addr): validate via `ethers.getAddress` then `lower()` for key. Add test that `0xAbC` vs `0xabc` collide correctly and `chain_id` int prevents aliasing.
- **Add observability and rollout plan** - Counters: `v3_approval_eth_call_total`, `v3_epoch_cache_hit_total`, `v3_approval_future_epoch_rejected_total`, `v3_epoch_cache_error_total`; histogram `v3_epoch_cache_lookup_duration_ms`. Rollout: `V3_EPOCH_CACHE_ENABLED=false` default -> 1% canary -> 50% -> 100% with dashboard and instant rollback via env flag. Include TTL eviction integration test.

## Open Questions
- Where does `get_current_epoch()` actually live today (`canister_state`, env, or RPC)? What is the source of truth for `current_epoch` and how is it kept consistent across replicas?
- Is Redis already provisioned for `haven-aol` or is this a new infra dependency? Is `stable_memory` required for ICP canister persistence across upgrades?
- What is the expected cardinality of `(chain, token, threshold, epoch, wallet)` and is `maxsize=10000` sufficient for 30d? What is memory limit per canister/replica?
- Should negative results (`approved==false`) be cached with short TTL (e.g., 60s) to avoid repeated `eth_call` for pending approvals, or is lockout risk unacceptable?
- How should revocation within 30d be handled - is eventual consistency acceptable for V3 threat model?
- Can you provide verbatim `check_approval` / `eth_call` call sites once `corbell embeddings:build` succeeds to validate the cache-aside insertion point before vetKD derivation?
