# Candid & EIP-712 Contracts

Source: `haven-aol/src/backend/backend.did`, `haven-aol/README.md` (mainnet `dciac-uaaaa-aaaad-qlzuq-cai`).

## Candid interface

```
service: (
  requestDecryptionKey: (GateRequest) -> (variant { Ok: text; Err })  // update
  batchRequestDecryptionKey: (vec CID) -> (vec variant)                 // update, up to 20, N derivations
  requestDecryptionKeyV3: (GateRequestV3) -> (variant)                  // update, epoch-based
  batchRequestDecryptionKeyV3: (vec CID) -> (vec variant)               // update, one VetKD replicated
  getVetKDPublicKey: () -> (blob)                                       // query, cached
  getVetKDPublicKeyV3: () -> (blob)                                     // query, distinct
  warmupVetKDPublicKey{,V3}: () -> ()
  getCurrentEpoch: () -> (nat)                                          // query, floor(unix/2592000)
  evictExpiredApprovals: () -> ()                                       // controller only
)
```

## EIP-712

```
GateRequest(address evmAddress, bytes transportPublicKey, uint256 nonce)         // v1, CID in payload out-of-band
GateRequestV3(address evmAddress, bytes transportPublicKey, uint256 epoch, uint256 nonce) // v3, epoch covered
```

Recovered via Motoko `secp256k1` ecrecover; nonce prevents replay.

## VetKD

- v1: `accessol_v1` context, preimage `accessol:chain:token:threshold:cid`
- v3: `accessol_v3` context, preimage `accessol_v3:chain:token:threshold:effectiveEpoch` (epoch 2_592_000s, zero-threshold => 0)

Client decrypt: fetch `getVetKDPublicKey{V3}`, use returned `transportPublicKey` ciphertext, local key unwrap.

## Decoupled usage

Frontends call only this surface; no other service-to-service API. CLI encrypts only (no decrypt path).
