# Haven Platform — Decoupled Architecture Overview

> Updated: 2026-08-13 via Corbell `graph build` (Services:5, Edges:6, DB:460K) — **added arkiv-chain** (was miss). Workspace: `corbell-data/workspace.yaml` (name: `haven-platform`, root `..`), tags `decoupled` on all services.

## 1. Design intent: highly decoupled (5 services)

Each Haven component is a **deployable unit with no shared mutable state**:

- **No shared DB.** `haven-aol` stores approval cache (TTL 30d) inside canister only; `haven-dapp` uses IndexedDB/Room, `haven-cli` uses local pipeline DB, `haven-mobile` uses Room + `foc-cache`, **arkiv-chain** stores entities/pairs/indexes in state trie as Ethereum accounts (not external DB). No cross-service DB Reads.
- **No shared types.** Contracts are Candid (`.did`) + EntityRegistry ABI (`EntityRegistry.sol` at `0x44…0044`) + EIP-712 typed data + CID lists. SDKs (`packages/typescript`, `packages/python`, `ic-kotlin`, `@arkiv-network/sdk@0.7.0`) are thin clients, not shared libs.
- **IPC only via network.** HTTPS + Candid `update`/`query` + Arkiv `arkiv_*` JSON-RPC (`arkiv_query`, `arkiv_getEntityCount`, `arkiv_getBlockTiming`) over `https://braga.hoodi.arkiv.network/rpc` and `0x44…0044 CALL`.
- **Independent scaling & deploys.** Canister upgrades (`main.mo`) and chain upgrades (reth precompile) don't require frontend deploys; CLI releases via `pyproject.toml`; dapp via `next build`; mobile via Gradle.

![Corbell graph — 5 services (arkv-chain top) + 1 store, D3 explorer](assets/corbell-graph.png)

## 2. Topology (from `corbell graph services` + `graph build` + `api/graph`)

```
ID             Language   Tags
arkv-chain     rust       chain, entity, precompile, reth, core, decoupled
haven-aol      python*    core, icp-canister, vetkd, cryptography, decoupled  (*Motoko canister, scanned as python)
haven-dapp     typescript frontend, nextjs, web3, decoupled (via @arkiv-network/sdk)
haven-cli      python     cli, tui, tooling, decoupled (arkiv_sync.py)
haven-mobile   typescript mobile, react-native, decoupled (Kotlin under mobile-app/)
```

`*` `haven-aol`标记为 `python` 是 Corbell 支持列表限制（`python|typescript|go|...`），实际主语言 Motoko + TS/Python SDKs.

**Graph edges (6, from /api/graph):** `haven-cli -> shared_postgres_db (db_read, connection.py)`, `haven-dapp -> external:env_url (NEXT_PUBLIC_ICP_HOST, haven-aol-client.ts)`, `haven-dapp -.-> haven-aol (library_dependency, core.py)`, `haven-cli -> external:env_url (ARKIV_RPC_URL, arkiv_sync.py)`, `haven-cli -.-> haven-aol (encrypt_step.py)`, `haven-cli -.-> haven-dapp (arkiv_sync.py)`. Arkiv-chain itself appears as isolated node until `graph build --methods` with Rust grammar wires `arkiv-dapp` HTTP edges to `arkiv-chain` more explicitly. Zero edges between frontends (`dapp <-> mobile <-> cli`) besides the intentional Arkiv sync import — by design decoupled.

Data flow:

```mermaid
sequenceDiagram
  participant CLI as haven-cli
  participant ARKIV as arkiv-chain (0x44…0044)
  participant AOL as haven-aol (ICP)
  participant Chain as EVM RPC
  participant DApp as haven-dapp
  CLI->>ARKIV: execute(Operation CREATE entity)
  CLI->>ARKIV: braga.hoodi.arkiv.network/rpc arkiv_query
  CLI->>AOL: encrypt(CID, vetkd)
  DApp->>ARKIV: arkiv_query @arkiv-network/sdk (community discovery)
  DApp->>AOL: requestDecryptionKeyV3(EIP-712 GateRequestV3)
  AOL->>AOL: ecrecover + epoch<=currentEpoch? + approvalCache?
  alt cache miss
    AOL->>Chain: eth_call(balanceOf)
  end
  AOL-->>DApp: VetKD ciphertext
  DApp->>DApp: decrypt locally
```

## 3. Protocol versions

- **Arkiv Entity:** `EntityRegistry.sol` — `execute(Operation[])` (`Ident32`/`Mime128`/`Attribute`/`BlockNumber32`), 6 op types, trie state (roaring64 + ART), system-account for nonces/counter. See `architecture/05-arkiv-chain.md`.
- **Haven-AOL** — see `architecture/01-haven-aol.md`: v1/v3 VetKD preimages, threshold-zero collapse.

