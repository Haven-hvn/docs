# Haven Docs

Living architecture docs for the Haven platform — generated with [Corbell](https://github.com/corbell-ai/corbell) and checked in.

**Stack:** 4 highly decoupled services, no shared DB, IPC via Candid/HTTPS only.

| Service | Repo | Language | Role | Coupling |
|---------|------|----------|------|----------|
| `haven-aol` | `haven-aol/` | Motoko (canister) + TS/Python SDKs | ICP VetKD gating, EIP-712 `ecrecover`, epoch cache | **Core** — deployed to `dciac-uaaaa-aaaad-qlzuq-cai` |
| `haven-dapp` | `haven-dapp/` | TypeScript / Next.js 15 | Web3 frontend, decrypt, cache, playback | Calls `haven-aol` via Candid only |
| `haven-cli` | `haven-cli/` | Python 3.11+ | Media pipeline, encryption, archival | Calls `haven-aol` Python SDK + Filecoin |
| `haven-mobile` | `haven-mobile/` | Kotlin + TS | Android offline-first viewer (Media3 + foc-cache) | Calls `haven-aol` via `ic-kotlin` |

```
haven-dapp ──┐
haven-cli  ──┼──> haven-aol (ICP canister, VetKD v1/v3) ──> EVM RPC (eth_call) ──> Filecoin PIN
haven-mobile─┘
```

## How this was built

```bash
corbell init                    # -> corbell-data/workspace.yaml (4 services, tags: decoupled)
corbell graph build             # -> .corbell/workspace.db  (Services:4 Datastores:1 Edges:6)
corbell graph services          # verifies decoupled tags
corbell spec new --feature "..." --no-llm  # -> specs/haven-decoupled-architecture.md
# -> then materialized into docs/architecture/ for review
```

Graph store: SQLite (`.corbell/workspace.db`, 460K). No Neo4j needed. Embeddings (`sentence-transformers/all-MiniLM-L6-v2`) not required for template specs; add `corbell embeddings build` + `ANTHROPIC_API_KEY` for LLM-enriched generation.

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
