# haven-dapp — Web Frontend (Next.js)

> Repo: `haven-dapp/` (Next.js 15, `src/app`, `src/components`, `src/lib`, `src/services`, `src/stores`). Scripts: `dev`/`build --webpack`/`type-check`/`test` (Playwright).

## Boundary

- **Owns:** Wallet connect, library/community/ watch routes, decrypt orchestration, IndexedDB + service-worker cache, playback.
- **Depends on:** `haven-aol` (Candid via `ic` agent) + Filecoin PIN only. No direct DB to other services.
- **Deploy:** static `out/` via `npx pinme@2.0.12 upload ./out`.

## Key routes & modules

- `app/library/page.tsx` — grid of `MediaItem`s (verified badges via `lib/attestation.ts` Ed25519 + Merkle)
- `app/watch/page.tsx` + player — decrypt then Media3-like web playback
- `app/community/page.tsx` + `lib/community-feed.ts::discoverUserCommunities` (Arkiv query)
- `components/auth/*`, `AuthProvider.tsx` — wallet connect/disconnect
- `lib/haven-aol/haven-aol-auth.ts` (EIP-712 signing), `haven-aol-decrypt.ts` (v1), `haven-aol-decrypt-v3.ts` (batch epoch)
- `services/cacheService.ts`, `lib/cache/db.ts`, `lib/video-cache.ts`, `public/haven-sw.js`, `lib/cache-integrity.ts`, `lib/security-cleanup.ts`

## Decrypt flows (V3 optimized)

```
User signs GateRequestV3(epoch) -> canister requestDecryptionKeyV3 -> VetKD v3 ciphertext
-> client AES-GCM unwrap (verificationKey from getVetKDPublicKeyV3) -> cached AES key (in-memory LRU)
-> community's entire epoch corpus unlocked; batchRequestDecryptionKeyV3 replicates one key for N CIDs
```

Batch V3: one derivation per epoch, not per CID — saves cycles.

## Cache strategy (offline-first, decoupled)

- Metadata mirror: IndexedDB (`cacheService`, `db.ts`) per wallet.
- Media bytes: service-worker `haven-sw.js` + hedged fetch (synapse pattern), LRU + TTL + quota.
- Eviction & integrity: `cache-integrity.ts` policies; errors surfaced via `cache-errors.ts`.

## Corbell mapping

`id: haven-dapp, language: typescript, tags: [frontend, nextjs, web3, decoupled]`. No edges to `haven-cli`/`haven-mobile`. Add `corbell embeddings build` to semantic-search code chunks (`lib/haven-aol/*`).
