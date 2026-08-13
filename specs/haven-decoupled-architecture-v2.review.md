# Review: Haven Decoupled Architecture v2

*Reviewed: 2026-08-13 | Spec: haven-decoupled-architecture-v2*

## Summary
Spec correctly articulates the intended decoupled topology (no shared DB, Candid over HTTPS only) and honestly discloses that `corbell embeddings:build` returned 0 chunks so all paths are proposed. However the document is truncated after `haven-dapp` storage and lacks required sections for `haven-cli`/`haven-mobile`, risk/mitigation, constraint verification, and rollout/migration — making it unapprovable as v2 without major additions. Tag/language metadata is inconsistent with the body and VetKD security properties are only partially mitigated.

## Score
Completeness: 4/10
Architecture Accuracy: 6/10
Risk Coverage: 3/10

## Issues Found
- [CRITICAL] **Truncated / Missing Sections:** Spec ends mid-sentence at `haven-dapp` IndexedDB definition. No `haven-cli` or `haven-mobile` service change details, no dedicated `Risks / Failure Modes`, `Constraint Compliance`, or `Rollout Plan` sections despite success criteria requiring independent deploys, p99 latency, and epoch coherence. Cannot verify criteria 1,3,4.
- [CRITICAL] **No Rollout / Migration Safety:** No canister upgrade strategy for `ic-stable-structures` (`APPROVAL_CACHE`, `CONTENT_POLICY`, `DERIVED_KEY_NONCE`), no migration path for dual VetKD contexts `accessol_v1` -> `accessol_v3` without re-encryption, no staged rollout, feature flag, or rollback plan. Direct production upgrade would risk stable memory corruption and 30d approval cache incoherence at epoch boundaries.
- [CRITICAL] **Threshold-Zero Collapse Key Exposure:** `vetkd_derive_key_handler` returns `policy.plaintext_key.unwrap()` directly when `threshold == 0` and stores it in `CONTENT_POLICY` StableBTreeMap. This contradicts constraint #2 (key material never held by single replica) unless explicitly scoped to public content. No encryption-at-rest, access logging, or audit detail for `collapsed: true` records; compromise of single replica would leak all public-content keys.
- [WARNING] **Architecture Metadata Inconsistency:** `haven-aol` tagged `python` but described as ICP canister (Rust) + Python/JS SDKs. `haven-mobile` tagged `typescript`/`react-native` but described as Android Kotlin (Media3, Room, `foc-cache`, Reown AppKit). `Current Service Graph` shows only `haven-aol (python)` as registered node. Spec body correctly notes decoupled intent (no edges), but front-matter/tags will cause inaccurate dependency analysis and code generation.
- [WARNING] **Zero Code Context Verified:** `corbell embeddings:build` 0 chunks — all file paths (`haven-aol/canister/src/lib.rs`, `haven-aol/sdk/python/haven_aol/client.py`, `haven-aol/canister/aol.did`) are `TO BE CREATED` and unverified. No diff against existing implementation; blast-radius and key-management risk cannot be validated. Spec correctly discloses this but v2.1 must hydrate via `corbell embeddings:build` + `corbell docs:scan`.
- [WARNING] **Risk Coverage Inadequate:** No mitigation for: VetKD subnet `vetkd_derive_key` failure/timeout (p99 <2s update), `transport_public_key` rotation/replay via `DERIVED_KEY_NONCE`, EIP-712 `GateRequestV3` replay ( `nonce` uniqueness, domain separator, chainId), epoch rollover race (`floor(now/2592000)` cache TTL 30d — request at `expires_at` boundary), offline playback cache poisoning (IndexedDB/Service Worker, Room), or canister trap during threshold call.
- [WARNING] **Approval Cache Coherence Not Specified:** `APPROVAL_CACHE` keyed by `(Principal, ContentId, EpochId)` with TTL `2592000` aligned to epoch, but `get_approval` query vs `request_access` update consistency, cross-epoch deterministic decisions, and `expires_at < ic_cdk::api::time()` check without time-drift handling are not defined. No discussion of query vs update latency targets (<300ms / <2s) measurement.
- [NOTE] **Graph-Detected Issues Accurate but Noisy:** Linter notes `haven-dapp`/`haven-cli`/`haven-mobile` mentioned in body but not in front-matter `Service Graph` — spec's `All Known Services` *does* list them and explicitly states they are intentionally not wired with edges to reflect decoupling. Should consolidate `Service Graph` front-matter to list all four services as `decoupled` with `depends_on: []` to silence false positives.
- [NOTE] **IPC Constraint Honored in Design:** Proposed `Agent(Identity(), host="https://icp0.io")` + `https://icp-api.io` / `https://<canister-id>.icp0.io` Candid HTTPS only, no shared DB/message bus — compliant with decoupling constraint. Mermaid edges `DAPP/CLI/MOBILE -- Candid HTTPS --> AOL -- threshold call --> VETKD` are logical, not service-graph edges, which is correct.

## Recommended Changes
- **Complete the document:** Add full sections for `haven-cli` (batch encryption, `vetkd_py`, policy admin) and `haven-mobile` (Kotlin, Room, Media3 offline playback with 0 network), plus explicit `Risks & Mitigations`, `Constraint Compliance Matrix`, and `Rollout Safety` sections before approval.
- **Fix service metadata:** Change `haven-aol` type to `rust`/`canister` (keep `python` tag only for SDK), change `haven-mobile` to `kotlin`/`android`. Update front-matter `Service Graph` to enumerate all four services with `tags: ['decoupled']` and no edges, matching the mermaid intent.
- **Harden threshold-zero collapse:** Document that `plaintext_key` is only for `gate_type == public` and must not be stored in plaintext stable memory for private content; require `Option<Blob>` encrypted at rest or derived via separate public context, and mandate audit log retention for `collapsed: true`.
- **Define VetKD context and epoch handling:** Specify `context = b"accessol_v3" || content_id || epoch_id` construction, `VetKDKeyId { curve: Bls12_381_G2, name: "key_1" }` rotation policy, `DERIVED_KEY_NONCE` usage, and dual-read strategy for `v1`/`v3` during migration without re-encryption. Add epoch-boundary test cases.
- **Add risk matrix and mitigations:** VetKD subnet unavailable (retry + fallback to cached approval), EIP-712 replay (nonce store `StableBTreeMap<nonce, bool>` + domain separator validation), transport key reuse, stable memory upgrade hooks (`pre_upgrade`/`post_upgrade`), and offline cache invalidation.
- **Add rollout plan:** Staged canister upgrade on test subnet -> mainnet with stable memory backup, independent versioning (semver per surface), canary for `haven-dapp` IndexedDB schema, and verification steps: `corbell embeddings:build`, `corbell docs:scan`, `dfx canister call get_approval` query latency check, and VetKD integration test for p99.

## Open Questions
- Where is `policy.plaintext_key` sourced and how is it protected at rest for `threshold == 0`? Is it ever set for non-public content?
- How is `GateRequestV3.signature` verified (EIP-712 domain, chainId, `vetkd_context` binding) and how are `nonce` values deduplicated across replicas to prevent replay?
- What is the exact `DERIVED_KEY_NONCE` rotation schedule for `transport_public_key` and how do SDKs (`haven_aol/client.py`, JS SDK) fetch `get_vetkd_public_key`?
- What is the migration plan for existing `accessol_v1` encrypted content to `accessol_v3` epoch-bound keys without re-encrypting all assets?
- How is approval cache coherence guaranteed when `request_access` update and `get_approval` query race at `epoch = floor(now/2592000)` boundary, and what is `expires_at` clock source?
- When will `corbell embeddings:build` be re-run to hydrate file path verification for v2.1, and what are the canister stable memory upgrade tests?
