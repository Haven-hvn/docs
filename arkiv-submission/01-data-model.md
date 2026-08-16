# The Arkiv data model

The registry has **four entity types**. Every attribute below is declared with its Arkiv
type, because the type is the design decision: strings answer equality, numerics answer
ranges, and getting that wrong costs the query.

Haven's container is settled — `Ident32` keys, `Mime128` content type, typed attributes,
`BlockNumber32` blocks-to-live, written atomically through `execute(Operation[])` against
the precompile at `0x4400000000000000000000000000000000000044`. What follows is the schema
laid over that container.

Lifetimes are quoted in seconds for readability; Arkiv measures them in 2-second blocks, so
every figure is even.

---

## What the entity already gives us — so we do not store it

Three things are inherent to an Arkiv entity, and duplicating them as attributes would be
both wasted index and a second version of the truth that can disagree with the first.

| Already inherent | So we never store | Consequence for the schema |
| :--------------- | :---------------- | :------------------------- |
| **The expiry** (`btl` / `expiresIn`, set at creation, extendable) | No `expires_at`, no `is_active`, no `status: live` attribute | **Liveness needs no predicate.** An expired entity is not returned, so "only live results" is the default rather than a filter to remember. A `status` flag would be a lie waiting to happen — it can say `live` after the entity has gone. |
| **`$creator`** — immutable, set at creation | No `author`, no `publisher`, no `uploader` attribute | Whoever wrote the entity *is* recorded. Storing the writing address again would let payload and metadata disagree, and only one of them is unforgeable. |
| **`$owner`** — current controller, transferable | No `steward` or `controlled_by` attribute | Registries are "indexed by owner + attributes", so ownership is already queryable. |

The entity key does the same work for identity: Haven keys are `Ident32`, and an archive's
key **is** its slug — so `archive` carries no `slug` attribute either. Children still need
`archive_slug` as an attribute, because there are no foreign keys and a shared attribute key
is the only way to link.

What still earns an attribute is anything we need to **range-query**. Expiry tells you when
something ends, not when it began, and it is not itself a filter predicate — so a numeric
`published_at` stays, because "archives from the last month" has to be a range.

---

## The problem a public registry has, and how it is solved

Arkiv is a shared public database: anyone can write an entity, and no application logic gates
that. So `$creator` proves **who wrote a claim** — it does not prove they were **entitled to
make it**. Nothing stops a stranger from writing an `archive` entity asserting it is
Forgotten Runes' archive, or an `attribution` claiming they pinned bytes on that community's
behalf.

Haven already has the primitive that closes this, and it is not an access-control list. The
gate canister (`haven-aol`) issues **Ed25519 attestations** over a structured preimage:

```
HAVEN_ATTEST_V1:{chain}:{token}:{threshold}:{evmAddress}:{cidHash}:{timestamp}:{balance}
```

Signed by the canister, this proves that at `timestamp` the address held at least `threshold`
of `token` on `chain` — that the writer was genuinely a member of the community they are
writing about. It is point-in-time, not continuous: the protocol has no watchers, and
pretending otherwise would be a lie about what was checked.

So every claim in this registry has **two independent proofs**:

| Proof | Comes from | Answers |
| :---- | :--------- | :------ |
| `$creator` | Arkiv, immutably | *Who wrote this?* |
| The attestation | `haven-aol`, Ed25519 | *Were they entitled to?* |

**The registry accepts every write; clients only render attested ones.** That distinction is
the design, not a limitation — Arkiv cannot run Haven's verification logic and should not be
asked to. Spam is writable and simply never displayed, and because the attestation is
verifiable by anyone, a reader does not have to trust Haven's clients either. This is
permissionless writing without spoofable claims, which is not a property an
operator-controlled registry can offer: there, credibility comes from the operator deciding
who may write.

---

## 1 · `archive` — a community's collection

The registry root. One per archive, long-lived, renewed deliberately.

**Entity key:** the community slug (`forgotten_runes`) — `Ident32`-safe, and what children
reference. **`$creator`:** the publisher. **`$owner`:** the current steward.

| Attribute | Type | Example | Why this type |
| :-------- | :--- | :------ | :------------ |
| `kind` | STRING | `archive` | Namespaces the registry so a query never has to guess an entity's shape |
| `title` | STRING | `Forgotten Runes — masters` | Display, ≤128 bytes |
| `gate_chain_id` | **UINT** | `1` | Numeric: "every archive gated on an L2" is a range query |
| `gate_contract` | STRING | `0x521f9c…6f42` | Equality only — you always know the address you want |
| `gate_threshold` | **UINT** | `1` | Numeric: "archives openable by holding one item" is `lte 1` |
| `gate_kind` | STRING | `collection` \| `token` | Decides whether a balance is a count or an amount |
| `piece_count` | **UINT** | `412` | Numeric: filter out empty archives without reading payloads |
| `bytes_stored` | **UINT** | `3126000000000` | Numeric, whole bytes. Powers "archives over 1 TB" |
| `published_at` | **UINT** | `1786665600` | Unix seconds. Numeric so recency is a range, not a sort of everything |
| `attestor` | STRING | `dciac-uaaaa…qlzuq-cai` | The canister principal that signed. Equality: filter to entities attested by the canonical gate, ignoring everything else |
| `attested_at` | **UINT** | `1786665600` | Numeric — the preimage timestamp, so staleness is a range query |
| `attested_balance` | **UINT** | `4` | Numeric — what the canister actually saw the creator holding |

**Payload** — base64 JSON: description, cover thumbnail CID, codec variants, the
`encryption_metadata` block, and **the full attestation preimage plus its Ed25519 signature**
so any client can verify the creator's membership without asking us. Anything too large or
too structured to index.

**Lifetime — 180 days, extended.** An archive is a standing claim, and its renewal is the
product feature: `EXTEND` is a public, attributable act, so "this community still maintains
its archive" becomes verifiable rather than assumed. An archive that stops being renewed
expires out of the registry on its own — no moderation queue, no abandoned-content sweep.

---

## 2 · `piece` — one work inside an archive

| Attribute | Type | Example | Why this type |
| :-------- | :--- | :------ | :------------ |
| `kind` | STRING | `piece` | |
| `archive_slug` | STRING | `forgotten_runes` | **The shared key.** Children of an archive are one equality filter |
| `title` | STRING | `Ep. 04 — master` | |
| `is_encrypted` | **UINT** | `1` | |
| `encrypted_cid` | STRING | `bafy…` | Filecoin CID of the ciphertext. Equality: you resolve a known CID |
| `mime` | STRING | `video/mp4` | |
| `duration` | **UINT** | `1842` | Seconds. Numeric: "episodes over 20 minutes" |
| `bytes` | **UINT** | `418000000` | Numeric, for size filters and client-side totals |
| `sequence` | **UINT** | `4` | Numeric: ordering and "everything after episode 3" |
| `published_at` | **UINT** | `1786665600` | Numeric |

**Payload** — segment metadata, per-variant CIDs, thumbnail CID, the AES parameters the
client needs to decrypt once it holds a key.

**Lifetime — 180 days, extended with its archive.** A piece outliving its archive would be
an orphan in the registry; a piece expiring early would silently shorten a collection.
Renewing them together is what keeps the registry honest about what a community still
stands behind.

---

## 3 · `entitlement` — a proof that a holder cleared the gate

Written by the gate canister after it verifies a balance and derives a key. This is the
entity type that makes the design fit Arkiv rather than a cache.

**Here `$creator` is the canister, not the holder** — which is exactly why `holder` must stay
an attribute rather than being folded into metadata as it was on `attribution`. If the holder
wrote their own entitlement it would prove nothing; the value is that the *attesting party*
wrote it. So this entity's `$creator` is its attestation: an entitlement created by anything
other than the canonical canister principal is ignored by every client.

| Attribute | Type | Example | Why this type |
| :-------- | :--- | :------ | :------------ |
| `kind` | STRING | `entitlement` | |
| `archive_slug` | STRING | `forgotten_runes` | Shared key back to the archive |
| `holder` | STRING | `0xe23f43…a796` | Equality: "what can this address open" |
| `epoch` | **UINT** | `689` | Numeric. Range queries over epochs are the audit |
| `balance_at_check` | **UINT** | `4` | Numeric — what was actually held when the gate ran |
| `threshold_at_check` | **UINT** | `1` | Numeric — what was required *then*, so a later change is visible |
| `checked_at` | **UINT** | `1786665600` | Numeric |

**Payload** — the gate response digest and the attestation signature. Never the key.

**Lifetime — 48 hours, never extended.** This is the sharpest expiry in the schema and it
carries real product meaning: **access must not outlive ownership.** If an entitlement were
permanent, selling the gating asset would leave a standing record implying access. A short,
non-extendable lifetime makes the guarantee structural — the record dissolves and the next
request re-derives from a fresh balance. Expiry here is the authorisation model, not
cleanup.

---

## 4 · `attribution` — which uploader published on whose behalf

The join Filecoin cannot make. On Filecoin, an address paying to pin bytes looks identical
whichever community it publishes for; this entity is what resolves it.

**The uploader is `$creator`, not an attribute.** The address that pinned the bytes writes
its own attribution, so the entity already records it immutably. An `uploader` attribute would
be the same address written a second time by the same wallet, with the difference that the
attribute could be wrong. Asking "what has this address published, and for whom" is a
`$creator` query.

**But `$creator` alone would make this entity worthless**, because a self-issued claim to
publish for a community is just an assertion. The attestation is what makes it evidence: the
canister has verified that this uploader held the community's gating asset, so the pairing of
`$creator` + attestation says *this specific address, which really is a member, pinned these
bytes for this community.* That is the claim Filecoin cannot make and a self-attested
database cannot be trusted to make.

| Attribute | Type | Example | Why this type |
| :-------- | :--- | :------ | :------------ |
| `kind` | STRING | `attribution` | |
| `archive_slug` | STRING | `forgotten_runes` | Shared key |
| `data_set_id` | **UINT** | `2` | Numeric — the PDPVerifier data set |
| `bytes_pinned` | **UINT** | `208789248` | Numeric: leaf count × 32, so storage totals are queryable |
| `provider_count` | **UINT** | `1` | Numeric |
| `proven_at` | **UINT** | `1786665600` | Numeric |
| `attestor` | STRING | `dciac-uaaaa…qlzuq-cai` | The signing canister |
| `attested_at` | **UINT** | `1786665600` | Numeric — preimage timestamp |
| `attested_balance` | **UINT** | `4` | Numeric — the membership the canister verified |

**Payload** — the attestation preimage and its Ed25519 signature, plus the `cidHash` the
attestation is bound to, so the claim can be checked against the data set it describes.

**Lifetime — 90 days, extended while the deal is live.** An attribution should not outlive
the storage deal it describes. Letting it lapse is how the registry stops claiming bytes
that are no longer under proof.

---

## Relationships

There are no foreign keys, so `archive_slug` is the shared attribute key on all three child
types. One equality filter walks an archive to its pieces, its live entitlements, or its
attributions — and the same key is what lets a client assemble a whole archive view from
three cheap queries instead of one join.

```
archive (slug: forgotten_runes)
   ├── piece         (archive_slug: forgotten_runes)  × 412
   ├── entitlement   (archive_slug: forgotten_runes)  × live holders
   └── attribution   (archive_slug: forgotten_runes)  × uploaders
```

---

## The queries the product lives on

### Q1 — Browse: what can I discover?

```
kind         eq   "archive"
attestor     eq   "dciac-uaaaa-aaaad-qlzuq-cai"
piece_count  gt   0
```

Paginated, ordered client-side by `published_at`. This is the front page, and it does three
things worth naming:

- **`attestor eq`** discards every unattested write in one predicate. A public database means
  anyone can add an archive entity; this is how the front page ignores them without anyone
  holding a moderation queue. The client still verifies the signature in the payload — the
  filter narrows, it does not confer trust.
- **`piece_count gt 0`** is why that attribute is numeric: an archive registered but never
  filled should not appear, and that filter is impossible against a string.
- **There is no liveness filter, because there cannot be one.** Expired archives are not
  returned. An unrenewed archive leaves the front page by itself.

### Q2 — Open: what can this address actually reach?

```
kind    eq   "entitlement"
holder  eq   "0xe23f43…a796"
```

Two predicates, and deliberately no third. An earlier draft of this schema filtered
`epoch gte <current>` here, which was redundant with the entity's own expiry and therefore
worse than useless: it implied the index might return dead entitlements, and any code written
against that assumption would be carrying a check the database already guarantees. Expiry is
inherent, so **"live" is not a query — it is the absence of a result.**

`epoch` remains on the entity because it records *which* key epoch was derived, which is
protocol context a client needs; it is not how liveness is established.

Combined with Q1's archive records, these two predicates are the whole reader experience.

### Q3 — Attribute: how much has this community actually stored?

```
kind         eq   "attribution"
archive_slug eq   "forgotten_runes"
bytes_pinned gt   0
```

Counted and summed client-side. This is the query that turns Filecoin's anonymous payer
addresses into a per-community storage figure — the number our own Atlas currently has to
mock, because this entity type has nowhere to live yet.

The mirror of it needs no attribute at all, because the uploader is `$creator`:

```
kind      eq   "attribution"
$creator  eq   "0xaf992f…d145"
```

*Everything this address has ever published, and which communities vouched for it.* That is a
publisher's own portfolio, assembled from metadata Arkiv maintains rather than from a field we
would have had to keep correct.

### Q4 — Audit: was this gate ever loosened?

```
kind               eq   "entitlement"
archive_slug       eq   "forgotten_runes"
threshold_at_check lt   1
```

A community can raise or lower its own threshold. Recording what was required *at the time of
each check* means a member can prove the rules were not quietly relaxed. No operator can
rewrite it, because they never owned it — and because each record was written by the attesting
canister rather than by the party it benefits, the audit is evidence rather than testimony.

---

## `$creator` and `$owner` as product features

Not compliance fields. Two places they are load-bearing:

**`$creator` is the publisher badge — and the attestation is what makes it mean something.**
`$creator` is immutable, so the client renders "published by" from the entity itself rather
than from a claim in the payload: a platform cannot forge authorship because it never created
the entity. But authorship alone would only prove that *somebody* wrote this, which on a
public database is worth little. Paired with the canister's attestation, the badge reads
"published by this address, which held the community's asset when it said so" — verifiable by
the reader, with no appeal to our word. That is the difference between "we say this is the
official archive" and "the chain says who wrote it, and the gate says they belonged."

**`$owner` is stewardship, and it transfers.** A community DAO can hand its archive to a new
multisig with a `TRANSFER` — visibly, without moving a byte of media and without asking us.
Only the owner can `UPDATE` or `EXTEND`, so control over a collection is exactly as
transferable as control over any other on-chain asset. Custody of an archive stops being a
support ticket.

---

## Differentiated lifetimes, and why they differ

| Entity | Lifetime | Extended? | The product reason |
| :----- | :------- | :-------- | :----------------- |
| `archive` | 180 days | Yes | Renewal is a public signal that a community still maintains it |
| `piece` | 180 days | With its archive | Prevents orphans and silently truncated collections |
| `entitlement` | **48 hours** | **Never** | Access must not outlive ownership — expiry *is* the authorisation |
| `attribution` | 90 days | While the deal is live | Stops the registry claiming bytes no longer under proof |

The spread from 48 hours to 180 days is the schema's core argument: these four types have
genuinely different relationships to time, and a single TTL would break at least two of
them.

---

## What deliberately stays off Arkiv

| Stays off | Where it lives | Why |
| :-------- | :------------- | :-- |
| **Media bytes** | Filecoin, as ciphertext | Wrong shape and wrong economics for an index; the registry stores the CID, never the payload |
| **Decryption keys** | Nowhere at rest | Derived per request by the ICP canister via threshold cryptography. A key on a public database is not a key |
| **Plaintext of anything** | The publisher's own machine | `haven-cli` encrypts before submission. Every Arkiv entity is publicly readable, which is a design input, not a problem to work around |
| **Balance checks** | The gating chain | `balanceOf` is authoritative where the asset lives. Mirroring balances into Arkiv would create a second, staler truth |
| **Storage payment** | Filecoin payment rails, in USDFC | Escrow and settlement are hot-path financial state |
| **Proof of possession** | Filecoin PDP contracts | Filecoin already proves it holds the bytes; re-asserting that in the index would be a claim, not a proof |

The index holds exactly one class of thing: **statements about what exists, who published
it, and who may reach it.** Everything that is a byte, a secret, or a payment is somewhere
else, and that separation is the protocol.
