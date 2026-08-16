# The figure

Plain text on purpose. The submission is a web form, and ASCII survives a paste into a
textarea where an image attachment may not be rendered beside the answer it explains. The
rubric is explicit that production polish earns nothing and content clarity earns everything.

---

## Figure 1 — Four networks, and what each one holds

```
                        ┌─────────────────────────────────┐
   THE READER  ────────▶│  1. ARKIV — the registry        │
   "what exists?"       │                                 │
                        │  archive · piece                │──┐
                        │  entitlement · attribution      │  │  CIDs point out
                        │                                 │  │
                        │  public · queryable · expiring  │  │
                        └─────────────────────────────────┘  │
                                                             ▼
   ┌──────────────────────────────┐        ┌─────────────────────────────────┐
   │ 2. GATING CHAIN              │        │ 3. FILECOIN                     │
   │                              │        │                                 │
   │ balanceOf — the whole        │        │ ciphertext, under proof         │
   │ authorisation model          │        │ payment in USDFC                │
   │                              │        │                                 │
   │ never mirrored into Arkiv    │        │ bytes never touch Arkiv        │
   └──────────────────────────────┘        └─────────────────────────────────┘
                  │                                          
                  │ balance verified                         
                  ▼                                          
   ┌──────────────────────────────────────────────────────┐
   │ 4. ICP — the gate (haven-aol)                        │
   │                                                      │
   │ derives the key by threshold cryptography            │
   │ signs the Ed25519 attestation                        │
   │                                                      │
   │ keys exist for one request and are stored nowhere    │
   └──────────────────────────────────────────────────────┘

   Arkiv holds statements. Everything that is a byte, a secret,
   or a payment lives on another network.
```

---

## Figure 2 — The four entity types and the one link

```
   archive                                   key = the community slug
   ├─ gate_contract   STRING                 $creator = publisher
   ├─ gate_threshold  UINT                   $owner   = steward (transferable)
   ├─ piece_count     UINT                   attested by the canister
   ├─ bytes_stored    UINT
   └─ published_at    UINT                   ⏳ 180 days · extended
        │
        │  archive_slug  ── the shared attribute key.
        │                   No foreign keys exist, so this is the only link.
        │
        ├──▶ piece                           ⏳ 180 days · with its archive
        │    ├─ encrypted_cid  STRING  ──────── points at Filecoin
        │    ├─ duration       UINT
        │    ├─ bytes          UINT
        │    └─ sequence       UINT
        │
        ├──▶ entitlement                     ⏳ 48 HOURS · never extended
        │    ├─ holder              STRING     $creator = the CANISTER,
        │    ├─ epoch              UINT        not the holder — which is
        │    ├─ balance_at_check   UINT        why holder is an attribute
        │    └─ threshold_at_check UINT
        │
        └──▶ attribution                     ⏳ 90 days · while the deal lives
             ├─ data_set_id     UINT          $creator = the UPLOADER
             ├─ bytes_pinned    UINT          + canister attestation proving
             ├─ provider_count  UINT            they held the community's asset
             └─ attested_at     UINT
```

---

## Figure 3 — Why the entitlement expires in 48 hours

```
   t=0      holder owns the asset
            │
            ├─ gate verifies balance ──▶ derives key ──▶ writes entitlement
            │                                             ⏳ expires in 48h
            │
   t=1h     reader opens the archive.            entitlement: LIVE
            │
   t=30h    holder SELLS the asset.              entitlement: still live
            │                                    ── but nothing re-derives
            │
   t=48h    entitlement EXPIRES on its own.      entitlement: GONE
            │
   t=49h    reader tries again.
            └─ gate re-checks balance ──▶ 0 held ──▶ no key, no entitlement

   Access follows ownership because the record dissolves rather than
   being revoked. There is nothing to remember to delete, and no
   operator whose cron job could fail to run.
```

---

## Figure 4 — The two proofs on every claim

```
   Anyone may write to Arkiv. So a claim needs two things:

   ┌────────────────────────────┐   ┌──────────────────────────────────┐
   │ $creator                   │   │ Ed25519 attestation              │
   │ from Arkiv, immutable      │   │ from haven-aol                   │
   │                            │   │                                  │
   │ answers:                   │   │ answers:                         │
   │   WHO wrote this?          │   │   were they ENTITLED to?         │
   └────────────────────────────┘   └──────────────────────────────────┘
                    │                              │
                    └──────────────┬───────────────┘
                                   ▼
              "this address, which really held the community's
               asset when it said so, published these bytes"

   HAVEN_ATTEST_V1:{chain}:{token}:{threshold}:{address}:{cidHash}:{timestamp}:{balance}

   The registry accepts every write. Clients render only attested ones.
   Credibility comes from proof, not from permission — so there is no
   gatekeeper deciding who may speak.
```
