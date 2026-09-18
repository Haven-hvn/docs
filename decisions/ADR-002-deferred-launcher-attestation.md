# ADR-002: Defer Attestation for Single-Launcher Publishes

**Status:** Accepted (2026-09-18)
**Context:** Haven-AOL attestations are canister-signed proofs of *holding-at-publish-time*.
Requesting one costs a canister round-trip (EVM balance check + signature + cycles);
verifying one on-device is cheap (offline Ed25519). The dapp launcher flow
(`haven-dapp` drip publish) has never requested attestations; only the
`haven-cli` pipeline embeds `payload.attn`. Mobile and dapp both verify and
badge whatever `attn` is present (Verified / Unsigned / Failed).

## Decision

- Do **not** add attestation requests to the single-launcher publish flow now.
  When publisher == launch creator, the holding-proof carries no signal: authorship
  is already proven by entity owner/creator, and launch linkage by `gate_token`.
- Rule going forward: attestation is required only where it discriminates —
  when **more than one publisher** can name the same `gate_token` (community
  uploads, remixes, third-party stage parts). Single claimant → skip.
- Revisit when a multi-publisher claiming flow ships, or when any surface gates
  on attestation (e.g. a verified-only feed).

## Consequences

- Positive: no canister cycles/latency spent on facts nobody doubts; launcher
  flow stays lean.
- Positive: no security loss — unlock still rests on `balanceOf` gate checks +
  canister decryption, not on the badge; authorship still rests on chain ownership.
- Negative: launcher-published files badge as Unsigned on both surfaces. If
  Unsigned becomes the common case, users learn to ignore the badge — which
  weakens it for the multi-publisher case where it matters. Mitigation on
  revisit: distinguish "launcher-owned, attestation skipped by policy" from
  "third-party claim, unattested".
- Note: the canister returns `#InvalidThreshold` for threshold 0, so gateless
  content can never be attested regardless of this decision.

## Verification

- `haven-dapp/src` contains no `attestHolding` / `batchAttestHolding` request
  calls (reads + offline verify only).
- Mobile `CommunityViewModel` maps absent `attn` → `UNVERIFIED`; CLI-published
  entities with genuine `attn` still verify → `VERIFIED`.

Alternatives rejected: attest-everything (canister spend for zero signal in the
common case); removing the badge (destroys the multi-publisher trust signal we
will need later).
