# Haven Platform — Web3 Native Paradigm (Public Networks, No Private Backend)

> This page exists to counter Web2 assumptions you saw in the Corbell graph (no `shared_postgres_db`).

## Thesis

Haven **rides exclusively on public networks and infrastructure** — there is **no private backend, no shared SQL, no hosted queue**. Every writer is a permissionless actor.

| Old (Web2) assumption | Haven (Web3) reality |
|---|---|
| App ↔ `postgres`/`redis` private DB | `haven-aol` **IC stable memory** (canister `dciac-uaaaa-aaaad-qlzuq-cai`) + **Arkiv OP L3** state trie (`0x44…0044` precompile, accounts + roaring64/ART) + **Filecoin FEVM/IPFS** (`filecoin-pin`/`pay`) |
| Chain as optional ledger | Chain **is** the datastore — `entityKey` + `Attribute[]` + `payload` (base64) live in trie, queried via `arkiv_query`/`getEntityCount` (`@arkiv-network/sdk 0.7.0`, `braga.hoodi.arkiv.network/rpc`) |
| Gate via private auth service | Gate via **public** chains — `haven-aol` `requestDecryptionKeyV3` checks `evm_rpc` `eth_call` on **any EVM** (Ethereum, Base…) + `secp256k1` `ecrecover`, VetKD `accessol_v3` epoch `2592000` |
| Shared backend per team | `haven-cli` is **permissionless-local** — each actor runs `haven_cli/database/connection.py` `sqlite:///haven.db` / `:memory:` on their own machine (`builder.py:66` `create_engine→postgres` was false, now `Datastores:0`) |
| TypeScript full-stack | `haven-mobile` is **Kotlin** (`build.gradle.kts` `org.jetbrains.kotlin.android 2.3.21`, Compose/Media3/Room/DataStore, `ic-kotlin`), `arkiv-chain` is **Rust** (reth), `haven-aol` is **Motoko** (scanned as `python` only because Corbell lacks Motoko/Kotlin grammars) |

## Graph fix applied

* `Corbell/corbell/core/workspace.py:_detect_language` — added `build.gradle.kts`/`settings.gradle.kts` → `kotlin` before `typescript`; `corbell-data/workspace.yaml` `haven-mobile: kotlin [mobile,kotlin,android,decoupled]` (was `typescript [mobile,react-native]`).
* `Corbell/corbell/core/graph/builder.py` — removed generic `create_engine→postgres`, `haven-cli` local `sqlite` no longer collapses to `shared_postgres_db`; `corbell graph build` now `Services:5 Datastores:0 Edges:5` (`arkiv-chain rust`, `haven-aol python*`, `haven-dapp typescript`, `haven-cli python`, `haven-mobile kotlin`), verified `api/graph` `nodes 5 services 5` and D3 screenshot `assets/corbell-graph.png` 64K shows `haven-mobile kotlin` bottom-left, `0 stores`.
* Shared shape contracts remain `entities/ENTITY_SHAPE.md` (`EntityRegistry.sol` `Ident32`/`Mime128`/`Operation` at `0x44…0044`) + `entities/MEDIA_CONTENT_SPEC.md` (13+13 `title`/`duration`/`creator_handle`/`is_encrypted` etc) — both Web3-native, no private DB columns.

Re-run: `corbell graph services` (see `kotlin`), `curl http://localhost:7433/api/graph | jq .nodes[].language`, `npx playwright screenshot http://localhost:7433`.
