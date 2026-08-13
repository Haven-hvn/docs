# haven-mobile — Android (Offline-First)

> Repo: `haven-mobile/` (`mobile-app/` + `maestro/`, `MOBILE_V1_REQUIREMENTS.md` locked v1). Stack: Kotlin, Compose, Media3 (ExoPlayer), Room, DataStore, `ic-kotlin`, `foc-local-first-android/foc-cache`.

## Boundary (port of haven-dapp, not superset)

**Goal:** wallet holder gets `haven-dapp-main` core on Android: connect wallet → gated library → decrypt via haven-aol → offline playback → cache mgmt → disconnect wipe.

**Non-goals (post-v1):** chat, pay-for-access/dEX, treasury, discovery (QR/NFC/carousel), multi-wallet, guest mode, push, remote wipe, publish/capture (stays in `haven-cli`), iOS.

| Web dApp | Mobile v1 |
|----------|-----------|
| `AuthProvider.tsx`, `components/auth` | Reown AppKit Android, WalletConnect v2 |
| `lib/haven-aol/haven-aol-auth.ts` (EIP-712) | AppKit signer |
| `haven-aol-decrypt.ts` (v1) | `ic-kotlin` + AES-GCM |
| `haven-aol-decrypt-v3.ts` batch | same V3 epoch key |
| AES/gate-key caches (memory) | Kotlin LRU |
| `lib/attestation.ts` Ed25519 | `core-attestation` |
| `lib/community-feed.ts` Arkiv | same Arkiv query |
| `app/library` | Compose grid/list `MediaItem` |
| `app/watch` player | Media3 |
| `app/community` | Compose + verified badges |
| `app/settings` | Compose cache quota/TTL/clear |
| `cacheService`, `db.ts` | Room + DataStore |
| `video-cache.ts`, `haven-sw.js` | `foc-cache` (LRU+TTL+quota+hedged race) |
| `security-cleanup.ts` | Kotlin purge Room+FocCache+Keystore |

## Domain: generalized `MediaKind`

`VIDEO (.mp4/.mkv/.webm/.mov)`, `AUDIO (.mp3/.flac/.ogg/.wav)`, `IMAGE`, `PDF`, generic `download & open with` — same encryption+cache pipeline, broader viewer.

## Corbell mapping

`id: haven-mobile, language: kotlin, tags: [mobile, kotlin, android, decoupled]`. Decoupled: no shared DB, talks to `haven-aol` only via `ic-kotlin`; storage is hedged multi-provider FOC cache not dapp's synapse/IndexedDB.
