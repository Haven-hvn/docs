# ADR-001: Highly Decoupled Service Boundaries

**Status:** Accepted (2026-08-13) — Corbell `haven-platform` workspace (Services:4, decoupled tags)
**Context:** Four repos must evolve independently (ICP canister, web, CLI, mobile) with small teams / agent swarms.

## Decision

- Each service is a separate deployable with **no shared mutable state** (no shared DB, no shared in-process libs).
- Contracts limited to **Candid `.did`** + **EIP-712 typed data** + **CID lists**.
- IPC only via **HTTPS/Candid update/query** (Internet Computer).
- SDKs (`haven-aol/packages/typescript`, `packages/python`, secp256k1, `ic-kotlin`) are thin transports, versioned independently.

## Consequences

- Positive: independent scaling, rolling upgrades (canister `warmupVetKDPublicKeyV3` without frontend), parallel `spec decompose` tracks.
- Positive: approval cache (V3 `effectiveEpoch`) amortizes one VetKD derivation per corpus/epoch across N CIDs.
- Negative: duplication of cache logic (IndexedDB vs Room vs pipeline DB) — mitigated by shared policies (LRU/TTL/quota) not shared code.
- Negative: client must handle clock skew (`getCurrentEpoch`).

## Verification

`corbell graph build` shows zero edges between frontends; `corbell spec review` validates any new doc against these boundaries. Re-run `graph build --methods` with tree-sitter grammars to drill call paths (`graph callpath`).

Alternatives rejected: shared Postgres/Redis (coupling, single AZ failure), monorepo shared lib (blocks independent mobile releases).
