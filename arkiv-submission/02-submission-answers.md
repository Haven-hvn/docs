# Submission answers — `Other` lane

Drafted against the form's own questions. The data model lives in
[`01-data-model.md`](01-data-model.md) and should be pasted into the schema answer in full —
it is the criterion worth 20 points.

---

## Idea name

**Haven — the registry that makes an encrypted archive findable**

## One-line pitch

A community's archive stays encrypted on Filecoin and unlocks from a token or NFT balance —
Arkiv is the registry that says which archives exist, who published them, and who may open
them right now.

---

## The problem, and who it's for

Communities that produce their own media — a lore project with masters and unreleased cuts,
a label with stems, an artist collective with source files — keep the work on a platform
that will outlive its usefulness to them. The failure is not malice, it is structure: the
platform holds the archive on its hardware under its terms, and when the terms change the
archive changes with them. Delisting, re-attribution and quiet disappearance are all
ordinary platform behaviour.

Encryption alone does not fix it. You can encrypt media and pin it to Filecoin today —
that part works, and 69.53 TB is already under proof there. What you cannot do is find it.
Discovery is the piece that keeps dragging communities back onto a platform, because
somebody has to hold the catalogue, and whoever holds the catalogue holds the power the
community was trying to escape.

**Who it's for, day one:** communities with an existing token or NFT and media worth
keeping. We verified sixteen candidates on-chain — Forgotten Runes, Chain Runners,
Terraforms, Autoglyphs, FWB, Nouns, Kleros, Radicle among them. They already have the
membership primitive; what they lack is a catalogue nobody owns.

---

## What Arkiv is for here

The registry, and only the registry. Arkiv holds statements about what exists, who published
it, and who may reach it. Four entity types:

- **`archive`** — a community's collection, gated by a contract and a threshold
- **`piece`** — one work inside it, pointing at a Filecoin CID
- **`entitlement`** — a short-lived proof that a holder cleared the gate
- **`attribution`** — which uploader pinned which bytes on whose behalf

Every claim carries two independent proofs. **`$creator`** is Arkiv's own immutable record of
who wrote the entity. **An Ed25519 attestation from the gate canister** — over the preimage
`HAVEN_ATTEST_V1:{chain}:{token}:{threshold}:{address}:{cidHash}:{timestamp}:{balance}` —
proves the writer actually held the community's asset when they wrote it. The first answers
*who said this*; the second answers *were they entitled to*.

Nothing inherent to an Arkiv entity is duplicated as an attribute: no `expires_at` (the entity
has an expiry), no `uploader` (that is `$creator`), no `status: live` (an expired entity is
simply not returned). Liveness is therefore never a filter — it is the absence of a result.

Full schema, with types and reasoning, in `01-data-model.md`.

---

## The first slice

**A publisher registers one archive with three pieces; a reader browses it and opens one.**

Concretely: `haven-cli` encrypts three files, pins the ciphertext to Filecoin calibration,
then writes one `archive` entity and three `piece` entities. A reader's client runs one
query (`kind eq "archive"`, `piece_count gt 0`), picks the archive, signs an EIP-712
message, and the gate canister checks the balance, derives a key and writes a 48-hour
`entitlement`. The client decrypts locally.

That slice exercises everything the idea rests on: typed attributes doing real filtering,
the shared `archive_slug` key linking parent to children, a differentiated expiry that
carries product meaning, and `$creator` rendered as a publisher badge. Nothing about it is
mocked, and it is a weekend's work against a running Arkiv node.

---

## Why Arkiv and not a plain database

Most software should use Postgres. Here is what specifically breaks:

**1 · Authorship becomes forgeable, and the whole point was that it isn't.** `$creator` is
immutable and set at creation. On an operator-run index, "published by" is a column the
operator can write — so the badge means "the platform says so," which is the claim
communities are trying to stop depending on.

**2 · Expiry stops being a guarantee and becomes a promise.** An `entitlement` lives 48
hours and is never extended, so access cannot outlive ownership: sell the asset and the
record dissolves. On a conventional database that is a cron job, and a cron job is a thing
an operator can pause, patch or forget. The guarantee degrades to a policy.

**3 · Permissionless writing stops being safe.** Arkiv is a public database, so anyone can
write an archive entity claiming to be a given community — and that is fine here, because the
canister's attestation is what makes a claim credible rather than a rule about who may write.
Spam is writable and never rendered. An operator-controlled registry solves the same problem
the old way: by deciding who may speak. That is the gatekeeper we are trying to remove, and it
returns the moment credibility comes from permission instead of proof.

**4 · Delisting comes back.** A registry an operator controls is a registry an operator can
edit. Every recovery story for a platformed archive ends at "and then they removed it." An
index whose entities we do not own cannot be quietly pruned by us — including by us, which
is the part that matters, because Haven should not be trusted either.

**5 · Members cannot audit the rules.** `threshold_at_check` records what a gate required at
the moment it ran. A member can check for themselves that the bar was not quietly lowered.
That audit only means something if the record is tamper-proof; on our own database it is a
screenshot.

**The counterfactual is the product.** Haven's entire proposition is that no operator sits
between a community and its archive. Put the index on infrastructure we control and we have
rebuilt the landlord with extra steps — a worse platform, not a protocol.

---

## What deliberately stays off Arkiv

Media bytes (Filecoin, as ciphertext). Decryption keys (nowhere at rest — derived per
request by an ICP canister via threshold cryptography). Plaintext of anything (encrypted on
the publisher's machine before submission, because every Arkiv entity is publicly readable
and we designed for that rather than around it). Balance checks (the gating chain, where the
asset actually lives — mirroring balances would create a second, staler truth). Storage
payment (Filecoin rails, in USDFC). Proof of possession (Filecoin's PDP contracts already
prove it; re-asserting it in the index would be a claim rather than a proof).

Arkiv holds one class of thing: statements about existence, authorship and reachability.
Everything that is a byte, a secret or a payment lives somewhere else.

---

## Honest state, and honest unknowns

Being straight about this rather than pitching vapour:

**What is verifiably working now.** Encryption, storage, proof and payment are live on
Filecoin — we read the pin contracts directly and there are 845 live data sets holding
69.53 TB under proof across 32 providers, settled in USDFC. Gating is live: we read
`balanceOf` against all sixteen candidate contracts and the threshold comparison is
decimals-aware, which matters more than it sounds — WHALE has 4 decimals, not 18, and
getting that wrong clears a 500-token gate with 55 tokens.

**What is blocked, and on whom.** Arkiv retired its Braga testnet on 12 August 2026; the
faucet, explorer and RPC went with it, and the next public network is expected in September
2026. So this schema is designed against Arkiv's documented model, not validated against a
running node. That is our current blocker and it is on the network, not on the design.

**What that gap costs us today, concretely.** Our own visualisation of the protocol cannot
attribute stored bytes to a community. We can read every payer address on Filecoin and every
byte they hold — 115 uploaders, 16.54 TB attributable — but nothing on Filecoin records
which community an uploader publishes for. That join is the `attribution` entity in this
schema, and until it has somewhere to live, our interface fills it with a placeholder and
labels it as one. **The missing piece of our product is exactly the entity this submission
proposes**, which is the most honest argument we can make for Arkiv fit.

**Risks we would name to a builder.** Every entity is publicly readable, so an `entitlement`
reveals that an address holds enough of an asset to open an archive — a privacy leak we
would mitigate by storing a salted holder commitment rather than the raw address, at the
cost of losing the direct `holder eq` lookup. And renewal is a liveness burden: an archive
whose steward disappears expires out of the registry. We think that is correct behaviour
rather than a bug, but it is a real trade and worth saying so.

---

## Authorship, stated plainly

Rule 54 asks participants to say what is theirs. Haven is our own protocol and predates this
ideathon: the encryption model, the gate, the five surfaces and the entity container are our
design, already specified and partly built. The prior art we build on is public and named —
Filecoin's PDP pin contracts, ICP's threshold cryptography (VetKD), ERC-721/ERC-20 balances,
and Arkiv's own entity model.

**What is new here, and what this submission is:** the Arkiv registry layer — the four entity
types, their typed attributes, the differentiated lifetimes, the two-proof model pairing
`$creator` with a canister attestation, and the queries the product runs. That layer is
unbuilt, because there has been no public Arkiv network to build it against. It is the missing
piece of our own system, designed here.

We are not submitting a finished product for exposure. We are submitting the schema for the
one layer we cannot yet build, and the reason it matters is that our interface currently has
to fake the number this schema would produce.

---

## Why this is not the obvious idea

The lane's seeds are registries, provenance, governance, social graphs, game state. This is
a registry — but the thing being registered is *encrypted*, and the interesting consequence
is that the index can be fully public while the archive stays private. Nothing here is
hidden. Anyone can read every entity, see every archive, verify every publisher, and audit
every gate — and still not open a single file without holding the asset.

That inverts the usual arrangement, where the catalogue is public and the permission
system is a private table inside somebody's platform. Here the permission system is the
public part and the media is the private part. The registry is a **public index of private
things**, which is a shape we have not seen described in the lane and which only works
because the entities are queryable, time-scoped and tamper-proof.
