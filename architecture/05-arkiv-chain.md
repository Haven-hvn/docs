# arkiv-chain — Entity Contract & Chain (Reth + Precompile)

> Repo: `arkiv-op-reth/` (reth execution node, `contracts/src/EntityRegistry.sol` ABI-only, `crates/arkiv-entitydb` + `crates/arkiv-node` + `crates/arkiv-genesis` + `crates/arkiv-cli`). Precompile at `ARKIV_ADDRESS = 0x4400000000000000000000000000000000000044`.

## Why this was a miss

`haven-dapp`, `haven-mobile` (and `haven-cli` via `arkiv_sync.py`) all **read/write Arkiv entities** — communities, content gates, attestations. Without `arkiv-chain` in `corbell-data/workspace.yaml`, `corbell graph build` showed `Services:4` and masked the core on-chain dependency. Fixed `2026-08-13`: added `arkiv-chain` (rust, `chain,entity,precompile,reth,core,decoupled`) → `Services:5 Datastores:1 Edges:6`.

## Boundary (core, decoupled)

- **Owns:** Entity lifecycle (`CREATE/UPDATE/EXTEND/TRANSFER/DELETE/EXPIRE`), payloads, annotation index (roaring64 bitmaps), Tier-2 ART range index, global counter / nonces / ID maps — all in **state trie** as Ethereum accounts (no external indexer, `stateRoot` committed). `arkiv-entitydb` crate holds query language interpreter.
- **Exposes:** 
  - **Writes:** `execute(Operation[])` + `nonces(address)` via `CALL` to `0x44…0044` (decoded by `ArkivPrecompile` → trie mutation + `EntityOperation` events). Gas-charged, ownership/liveness/`Ident32` charset validated inside precompile.
  - **Reads:** `arkiv_*` JSON-RPC namespace (`arkiv_query`, `arkiv_getEntityCount`, `arkiv_getBlockTiming`) — local trie reads via `arkiv-entitydb`, not via `eth_call` to external DB.
- **Does NOT own:** VetKD/IC gating (that's `haven-aol`), UI, or pipeline orchestration. Haven consumers treat it as an L2/L1-like chain: submit via wallet-signed tx, query via SDK.

## ABI (from `contracts/src/EntityRegistry.sol` — ABI-only file)

No deployed implementation contract; precompile decodes calldata directly so `forge`/`foundry` artifacts stay in sync with SDK.

- `Ident32` (bytes32, lowercase-ASCII ≤32), `Mime128` (128-byte, 4×bytes32), `BlockNumber32` (uint32)
- `Entity.Attribute { Ident32 name; uint8 valueType (ATTR_UINT/ATTR_STRING/ATTR_ENTITY_KEY); bytes32[4] value }`
- `Entity.Operation { uint8 operationType (1=CREATE..6=EXPIRE); bytes32 entityKey; bytes payload; Mime128 contentType; Attribute[] attributes; BlockNumber32 btl; address newOwner }`
- Errors: `Ident32Empty`, `Ident32InvalidByte`, `EmptyBatch`, `InvalidOpType`, `ZeroBtl`, `EntityNotFound`, `NotOwner`, `EntityExpired`, `ExpiryNotExtended`, `TransferToZeroAddress`, etc — emitted as Solidity reverts so SDK decoders resolve selectors.

System-account storage host: per-caller nonces + global entity counter + ID↔address maps live in a second fixed address, lazily materialized (nonce bump to 1) to avoid EIP-161 pruning.

## How Haven depends on it (decoupled)

- **haven-dapp:** `src/lib/arkiv.ts` → `createPublicClient` from `@arkiv-network/sdk@0.7.0` (`braga` chain, `ARKIV_RPC_URL = NEXT_PUBLIC_ARKIV_RPC_URL || https://braga.hoodi.arkiv.network/rpc`, `arkv_query` via `PublicArkivClient`). `community-feed.ts` → `eq` + `arkv_query` for community discovery. See `package.json` `@arkiv-network/sdk 0.7.0`.
- **haven-aol/mobile:** no direct Arkiv dep — IC-only.
- **haven-cli:** `arkiv_sync.py` / `js-services` sync entities.
- Edge in Corbell graph: `haven-dapp -- HTTP --> external:env_url (NEXT_PUBLIC_ARKIV_RPC_URL)`, `haven-cli -- HTTP --> external:env_url (ARKIV_RPC_URL)` + `library_dependency` import edges from code scan (source import). No shared DB.

## Corbell mapping (after fix)

`id: arkiv-chain, repo: ../arkiv-op-reth, language: rust, tags: [chain, entity, precompile, reth, core, decoupled]` — now visible in `corbell ui` (top node `arkiv-chain rust`) and `graph services` (5 services) + `graph mermaid`.

If you run `corbell graph build --methods` with `corbell[treesitter]` + Rust grammar, method nodes for `arkiv_node::precompile`, `arkiv_entitydb::query::execute` will surface and call edges wire correctly.

## Running

```bash
just node-dev  # dev genesis chain 1337, 100 dev accounts, auto-mines 2s, RPC 8545/8546
```

## Links

- `AGENTS.md`, `crates/arkiv-entitydb`, `crates/arkiv-node/src/rpc.rs` (`arkiv_query` + `getEntityCount` + `getBlockTiming`), `contracts/src/EntityRegistry.sol`
