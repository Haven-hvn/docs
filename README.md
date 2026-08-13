# Haven Docs

Living architecture docs for the Haven platform — generated with [Corbell](https://github.com/corbell-ai/corbell) and checked in.

**Stack:** 5 highly decoupled services, no shared DB, IPC via Candid/HTTPS + Arkiv precompile.

| Service | Repo | Language | Role | Coupling |
|---------|------|----------|------|----------|
| `arkiv-chain` | `arkiv-op-reth/` | Rust (reth + precompile `0x44…0044`) | **Entity contract** — `EntityRegistry.sol` ABI, `execute(Operation[])`, `arkiv_*` RPC (Braga `0.7.0` SDK) | **Core** — state trie, no external indexer |
| `haven-aol` | `haven-aol/` | Motoko (canister) + TS/Python SDKs | ICP VetKD gating, EIP-712 `ecrecover`, epoch cache | **Core** — deployed to `dciac-uaaaa-aaaad-qlzuq-cai` |
| `haven-dapp` | `haven-dapp/` | TypeScript / Next.js 15 | Web3 frontend (`@arkiv-network/sdk` `arkiv_query`), decrypt, cache, playback | Calls `arkiv-chain` + `haven-aol` via HTTPS/Candid |
| `haven-cli` | `haven-cli/` | Python 3.11+ | Media pipeline (`arkiv_sync.py`), encryption, archival | Calls `arkiv-chain` + `haven-aol` + Filecoin |
| `haven-mobile` | `haven-mobile/` | **Kotlin** (Compose/Media3/Room, `build.gradle.kts` `org.jetbrains.kotlin.android 2.3.21`) | Android offline-first viewer (Media3 + foc-cache) | Calls `haven-aol` via `ic-kotlin` + Arkiv via SDK |

```
haven-dapp ──┐
haven-cli  ──┼──> haven-aol (ICP VetKD v1/v3) ──> EVM RPC ──> Filecoin PIN
haven-mobile─┘         ∧
                       │   arkiv-chain (0x44…0044 precompile, arkiv_query, braga.hoodi.arkiv.network)
haven-dapp/haven-cli ──┴──> state trie (entity/pair/index accounts, roaring64 + ART)
```

![Corbell graph — 5 services, 1 store](assets/corbell-graph.png)


## How this was built

```bash
corbell init                    # -> corbell-data/workspace.yaml (5 services, tags: decoupled) ← fixed 2026-08-13: added arkiv-chain (was miss)
corbell graph build             # -> .corbell/workspace.db  (Services:5 Datastores:1 Edges:6)  # arkiv-chain rust + haven-aol/dapp/cli/mobile
corbell ui serve --port 7433 --no-browser  # → http://localhost:7433 — D3 graph (assets/corbell-graph.png) + /api/mermaid
corbell spec new --feature "..." --provider meta  # → specs/ via muse-spark-1.2-contributor @ api.meta.ai/v1 ($0.18–$0.44)
# -> then materialized into docs/architecture/ for review
```

Graph store: SQLite (`.corbell/workspace.db`, 460K, now 5 services, 0 private datastores — Haven rides on **public networks only, no private backend**). No Neo4j needed. Embeddings (`sentence-transformers/all-MiniLM-L6-v2`) not required for template specs; LLM via `META_API_KEY=LLM_...` (Meta Muse Spark) now patched in `corbell/core/llm_client.py`.

> **No private backend:** All state is on public chains — **DFINITY ICP** (VetKD canister), **Arkiv OP L3** (`0x44…0044` precompile), **any EVM** (Ethereum/Base/etc. as `haven-aol` gates), **Filecoin FEVM / IPFS** (Filecoin Onchain Cloud, `filecoin-pin`/`filecoin-pay`) — verified `corbell graph build` now `Datastores:0` after fixing false `shared_postgres_db`, `haven-cli` is permissionless-local (actor-local `haven.db` SQLite per user, not shared).

## Docs layout

- `architecture/00-platform-overview.md` — decoupled principles, topology, failure modes
- `architecture/01-haven-aol.md` — canister API, v1/v3 preimages, EVM RPC, VetKD contexts
- `architecture/02-haven-dapp.md` — Next.js routes, cache, decrypt flows
- `architecture/03-haven-cli.md` — pipeline CLI, `haven_cli/` package map
- `architecture/04-haven-mobile.md` — Android v1 parity table, foc-cache, Media3
- `decisions/ADR-001-decoupled-boundaries.md` — why no shared DB
- `corbell/` — generated `workspace.yaml` + graph summary
- `api/contracts.md` — Candid + EIP-712 contracts

> All artifacts in this repo are **generated** then **reviewed** — source of truth stays in code. Re-run Corbell when services change; `corbell spec review` validates claims against the graph.
