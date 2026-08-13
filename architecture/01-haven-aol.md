# haven-aol — Always Online (ICP Canister + SDKs)

> Repo: `haven-aol/` (Motoko `src/backend/main.mo` 88k, `backend.did`, `mops.toml`). SDKs: `packages/typescript` (npm `haven-aol`), `packages/python` (PyPI `haven-aol`), `packages/secp256k1` (pure Motoko ecrecover). Mainnet: `dciac-uaaaa-aaaad-qlzuq-cai`.

## Service boundary (decoupled)

- **Owns:** VetKD key derivation, EIP-712 verification, EVM balance check, approval cache (30d TTL), epoch logic.
- **Does NOT own:** UI, upload pipeline, storage (Filecoin), wallet connection.
- **Exposes:** Candid `update`/`query` only. No DB, queues, or shared libs consumed by frontends.

## Candid API (from `src/backend/backend.did` + README)

| Method | Call | Notes |
|--------|------|-------|
| `requestDecryptionKey` | update | GateRequest → balance check → VetKD v1 ciphertext |
| `batchRequestDecryptionKey` | update | Up to 20 CIDs, one balance check, N derivations (v1) |
| `getVetKDPublicKey` | query | cached V1 key |
| `warmupVetKDPublicKey` | update | populates V1 cache |
| `requestDecryptionKeyV3` | update | GateRequestV3 (epoch, not CID) → cache or balance → VetKD v3 |
| `batchRequestDecryptionKeyV3` | update | Up to 20 CIDs, **one** VetKD derivation replicated |
| `getVetKDPublicKeyV3` | query | distinct key, `accessol_v3` |
| `warmupVetKDPublicKeyV3` | update | populate V3 cache |
| `getCurrentEpoch` | query | `floor(unix/2592000)` ops diagnostic |
| `evictExpiredApprovals` | update | controller-only janitor |

EIP-712 types:
- v1: `GateRequest(address evmAddress, bytes transportPublicKey, uint256 nonce)`
- v3: `GateRequestV3(address evmAddress, bytes transportPublicKey, uint256 epoch, uint256 nonce)`

## Derivation & caching

- **v1 preimage:** `SHA-256("accessol:" + chain + ":" + tokenAddress + ":" + threshold + ":" + cid)` context `accessol_v1`
- **v3 preimage:** `SHA-256("accessol_v3:" + chain + ":" + tokenAddress + ":" + threshold + ":" + effectiveEpoch)` context `accessol_v3`
- Epoch 2_592_000s; threshold-zero collapses `effectiveEpoch=0`.
- Cache key `(chain,token,threshold,epoch,wallet)`; future epoch rejected `#InvalidEpoch` before effects; threshold-zero bypasses cache/balance but still validates epoch.

## Integration (decoupled)

- Frontends: `haven-dapp/src/lib/haven-aol/*`, `haven-mobile` via `ic-kotlin`, `haven-cli/packages/python` for encryption.
- EVM RPC: `ic/evm_rpc` canister with `RpcServices` (`EthMainnet`, `EthSepolia`, L2s), `RpcConfig` consensus.
- Crypto: `secp256k1` Motoko ecrecover (no precompile).

## Corbell context

Workspace entry: `id: haven-aol, repo: ../haven-aol, language: python, tags: [core, icp-canister, vetkd, cryptography, decoupled]`. Graph: datastore edge to EVM RPC (`eth_call`). Run `corbell graph callpath --from haven-aol.requestDecryptionKeyV3 --to VetKD.derive` after `graph build --methods` with `tree-sitter` grammars for full call graph.
