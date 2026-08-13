# Review: Haven Web3 Zero Backend

*Reviewed: 2026-08-13 | Spec: haven-web3-zero-backend*

## Summary
Spec correctly articulates the Zero Backend constraint (public networks only, no custodial API/Postgres/KMS) and accurately describes the current decoupled state where only `arkiv-chain` has verifiable code. However, the document is structurally incomplete — truncated mid-design, missing Risk, Constraints, and Rollout sections, and proposing 4 surfaces with zero code embeddings to verify against — making it unapprovable as-is despite strong architectural intent.

## Score
Completeness: 4/10
Architecture Accuracy: 6/10
Risk Coverage: 3/10

## Issues Found
- [CRITICAL] **Missing required sections:** No dedicated `Risk Coverage`, `Constraint Compliance`, or `Rollout Safety` sections. Spec truncates mid-file in `haven-dapp/src/lib/vetkd.ts` and provides zero design detail for `haven-cli` and `haven-mobile` despite listing them as core surfaces. Cannot assess failure modes or rollout safety.
- [CRITICAL] **Unverifiable proposed architecture:** `corbell embeddings:build` returned 0 chunks. All file paths are `FILES TO BE CREATED`. Current Service Graph contains only `arkiv-chain (rust)` — `haven-aol`, `haven-dapp`, `haven-cli`, `haven-mobile` have no edges or code to validate. Proposed dependencies (ICP VetKD, 0x44 precompile, IPFS) are design intent only, not verified.
- [CRITICAL] **No persistence guarantee:** `TBD: Exact Filecoin storage deal parameters (retrievability vs. IPFS pinning only for MVP)` — For a storage product, pinning-only MVP means loss of Haven domain/pinner = data loss, directly violating Success Criteria #3. No mitigation for IPFS garbage collection, Filecoin deal renewal, or retrieval latency.
- [WARNING] **Front-matter / Graph metadata drift:** Graph-Detected Issues: `haven-aol`, `haven-dapp`, `haven-cli`, `haven-mobile` mentioned in body but not listed in front-matter. `All Known Services` lists `haven-aol` as `python` with tags `['core','icp-canister','vetkd',...]` while PRD and design assert Motoko canister. Spec correctly notes stale metadata but graph is not corrected — will cause continued false positives.
- [WARNING] **VetKD + 0x44 trust boundary underspecified:** `haven-aol/main.mo` proposes `vetkd_decrypt_dek` will `Verify gate proof by calling Arkiv RPC (public) inside canister via HTTPS outcall`. Introduces: 1) HTTPS outcall trust in Arkiv RPC (centralization), 2) cycles cost/latency, 3) no replay protection or proof format defined, 4) no handling of VetKD subnet threshold failure or canister upgrade wiping `stable var encryptedDeks`.
- [WARNING] **Precompile design risk:** `arkiv-chain/src/precompiles/haven.rs` proposes `staticcall to Arkiv EVM` *inside* precompile `execute()` to verify EVM gates (ERC20/721). This is re-entrant EVM execution inside a precompile — not standard `reth_precompile::Precompile` pattern, gas metering (`15000 + len*10`) is arbitrary, and `Entity::HavenVault` storage schema has no pruning/GC or CID validation (max 128 chars noted but not enforced).
- [WARNING] **No Rollout Safety plan:** No feature flag (`ARKIV_HAVEN_PRECOMPILE_ENABLED=true` mentioned as env var but not as phased rollout), no canary, no backward compatibility for existing entities, no VetKD canister upgrade strategy, no public RPC fallback if `ARKIV_RPC_URL` or ICP boundary nodes are down.
- [NOTE] **Architecture Accuracy - Current state is correct:** Spec's claim `Current state is fully decoupled with no shared private backend. No centralized API, no shared Postgres, no queue.` is **consistent** with graph showing only `arkiv-chain` isolated. Mermaid dependencies to `ICP`, `ARKIV`, `EVM`, `IPFS` are external public networks and correctly not expected in service graph.
- [NOTE] **Constraint Compliance is honored in intent but unverified:** Design preserves Zero Backend (client-side AES-GCM, VetKD transport keys, ciphertext-only on IPFS/Arkiv) per Success Criteria #4, but no audit path defined to prove no PII/plaintext leaks via logs, gateways, or `gateConfig`.

## Recommended Changes
- **Fix completeness:** Add explicit sections: `## Risks & Mitigations`, `## Constraint Compliance Matrix`, `## Rollout Plan`. Complete `haven-dapp` code snippet and add equivalent `haven-cli` (Python) and `haven-mobile` (Kotlin) file proposals — currently absent.
- **Fix front-matter and graph:** Update spec front-matter to list all 5 services. Run `corbell tag:update haven-aol --language motoko --type icp-canister` and `corbell embeddings:build` after stub files are created to eliminate stale `python` tag and 0-chunk state.
- **Resolve persistence TBD before approval:** Define MVP decision: IPFS pinning with 3x pin providers + Filecoin deal on `haven-aol` or explicit user-acknowledged ephemerality. Specify CIDv1 validation, deal duration, renewal cron, and retrieval SLA.
- **Harden VetKD flow:** Specify transport keypair generation (client ephemeral), VetKD key ID derivation (`vaultId + caller Principal`), HTTPS outcall allowlist + certificate pinning for Arkiv RPC, and fallback if `vetkd_derive_key` fails. Clarify `stable var` upgrade persistence and that canister never sees plaintext DEK.
- **Validate precompile with reth pattern:** Prototype `HavenPrecompile` against existing `reth` precompile trait in a branch, measure gas, and avoid `staticcall` inside precompile — instead verify `gateHash` pre-image supplied as input and verified via `ecRecover`/storage proof. Add unit tests for `HavenVault` entity.
- **Add rollout safety:** Phased rollout: 1) Deploy `haven-aol` to ICP testnet, 2) Enable `0x44` on Arkiv devnet behind `ARKIV_HAVEN_PRECOMPILE_ENABLED`, 3) Canary `haven-dapp` against public RPCs with fallback gateways, 4) No data migration needed but define vaultId collision handling (`keccak256(owner+nonce)`).

## Open Questions
- What is the exact VetKD system API (`vetkd_derive_key` / `vetkd_encrypt` ) — is `mo:vetkd` a wrapper or direct management canister call, and what are cycles costs for threshold operations?
- How does `haven-aol` verify Arkiv gate proofs without introducing a trusted oracle — will it verify Merkle proofs of `HavenVaultAnchored` events or trust HTTPS outcall response?
- What is the Filecoin/IPFS retrieval path if public gateway is censored — will `haven-dapp` use `helia` (browser) vs `kubo` fallback, and who pays for pinning/deals?
- Why is `haven-aol` tagged `decoupled` if `haven-dapp`/`cli`/`mobile` all depend on its VetKD API — is this a logical decoupling or should graph show explicit edges `dapp->aol`, `cli->aol`?
- What is the upgrade and key rotation story for VetKD-encrypted DEKs if `vetkd_key_id` derivation path changes or canister is reinstalled?
