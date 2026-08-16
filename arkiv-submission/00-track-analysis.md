# Track analysis — which lane Haven enters

**Decision: the open `Other` lane.** Reasoning below, with the calendar first because it
eliminates half the field before fit is even considered.

---

## 1. The calendar rules out two tracks

Today is **14 August 2026**. From the ideathon's own timeline:

| Track | Window | Status today | Runway |
| :---- | :----- | :----------- | :----- |
| 1 · AI & DevTools | Aug 3 – 11 | **Closed** (Aug 11, 23:59 UTC) | — |
| 2 · Marketplaces | Aug 12 – 20 | **Open** | 6 days |
| 3 · DeFi | Aug 21 – 31 | Not yet open | opens in 7 days |
| **Other** | All month | **Open** | **17 days** |

Two consequences:

- **AI & DevTools is unavailable.** Worth naming because its tooling lens is generous and
  the track brief explicitly welcomes infrastructure that improves Arkiv's DevEx — a
  Haven-adjacent tool could have scored well there. That door closed three days ago.
- **DeFi cannot be entered yet**, and would leave 10 days.

So the live choice is **Marketplaces (6 days)** or **Other (17 days)**.

---

## 2. Fit against each track's brief

Track alignment is worth **20 points** — the joint-heaviest criterion — and its 1-point
anchor is explicit: *"The track label is incidental — the same pitch could sit in any
track."* Entering the wrong lane is not a neutral choice; it forfeits up to 16 points
before anything else is read.

Haven is a sovereign media protocol: media encrypted before publication, stored on
Filecoin, keys derived by an ICP canister from a token or NFT balance, and **indexed on
Arkiv**.

### Marketplaces — reject

The brief is listings, quotes, bookings, bounties: *"anything with a lifecycle that should
filter cleanly and expire itself."* Haven has no buyer, no seller, no quote and no
booking. Its archives have a lifecycle, which is the one point of contact — but a
lifecycle alone is not a marketplace.

We considered bolting a marketplace onto Haven (listing gated archives for sale) and
rejected it on two grounds. It contradicts the protocol's central claim — that no platform
sits between a community and its archive — and the protocol is settled, not up for
redesign to suit a submission. A retrofitted marketplace would read exactly as the rubric's
1-point anchor describes.

**Expected alignment: 1–2 / 5 → 4–8 / 20.**

### DeFi — reject

Haven touches DeFi only incidentally: storage is settled in USDFC, a FIL-backed
stablecoin, and escrowed to the Filecoin payment rails. That is Haven *paying a bill*, not
a DeFi product. There are no bids, no risk snapshots, no oracle rounds, no incentive
epochs. Also unavailable for another 7 days.

**Expected alignment: 1 / 5 → 4 / 20.**

### Other — accept

The brief: *"registries and RWA, provenance trails, governance state, social graphs, game
or world state. The bar is the same: it has to genuinely need queryable, time-scoped,
tamper-proof entities."*

For this lane the rubric redefines alignment as *"how genuinely the idea needs the
Web3-database model at all."* That is the question Haven answers best, and two of the
lane's own idea seeds describe it directly:

- **On-chain Registry** — *"domains, licenses, memberships, certificates as queryable
  entities; indexed by owner + attributes; expiry models renewals; creator metadata proves
  who issued each entity."* Haven's index is a registry of archives whose access is a
  membership, whose entitlement expires by epoch, and whose publisher must be
  unforgeable.
- **Provenance Trail** — *"an asset's history as a chain of time-stamped, verifiable
  entities."* A community archive is precisely this.

Arkiv is not a storage choice inside Haven; it is **one of the four networks the protocol
is defined on**, and the only one that answers "what exists and who published it."

**Expected alignment: 5 / 5 → 20 / 20.**

---

## 3. Where Haven stands on the other five criteria

| Criterion | Pts | Read | Why |
| :-------- | --: | :--- | :--- |
| Arkiv fit — the counterfactual | 20 | **Strongest card** | The pitch does not merely weaken on an operator-controlled database — it inverts. Haven exists so that no operator can delist an archive or rewrite its authorship. A platform-run index reintroduces exactly the landlord the protocol removes. And "what stays off Arkiv" is already answered by the architecture, not invented for the form: bytes on Filecoin, keys derived per-request and never stored, balances on the gating chain, payment on Filecoin rails. |
| Data & query design | 20 | **Needs the most work** | Haven has a settled entity container (`Ident32` keys, `Mime128` content type, typed attributes, `BlockNumber32` blocks-to-live, `execute(Operation[])`). What the submission must add is the part the rubric scores: numeric attributes chosen for range queries, relationships via shared keys, **differentiated expiry per entity type**, and `$creator` / `$owner` surfaced as user-facing features. This is where to invest. |
| Impact & usefulness | 15 | Strong | Real communities with a real dependency problem. Sixteen candidate gates are verified on-chain, and 69.53 TB is already under proof on Filecoin — the demand side is measurable, not asserted. |
| Clarity & feasibility | 15 | Strong, with one honesty requirement | Much of the protocol is built and independently verifiable today. The weekend slice can be named exactly. The honest unknown must be stated plainly: Arkiv retired its Braga testnet on 12 August 2026 and the next public network is expected in September, so the index layer is designed against the documented model rather than a running node. |
| Uniqueness | 10 | High | The lane's seeds are registries, provenance, governance, social graphs, game state. An encrypted media archive whose *decryption key* is derived from a token balance, with the index as the only public surface, is not on that list. |

Two things follow. Arkiv fit and Uniqueness are already earned by what Haven *is*. Data &
query design is earned only by writing the schema out properly — so the submission is
mostly a schema document, which is also what the ideation guide says: *"the data model is
the pitch."*

---

## 4. Scope: pitch the index, not the protocol

Haven is a five-surface protocol across four networks. Submitting all of it would damage
two criteria at once: alignment blurs, and Clarity's 5-point anchor asks for *"a crisp
scope with named risks"* and a *"weekend slice"* that is genuinely buildable.

So the submission is **the Arkiv-shaped slice**: the entity index that makes a gated
archive discoverable, attributable and expiring — with the encryption, storage, key
derivation and payment named explicitly as what stays off Arkiv. That framing serves three
criteria simultaneously:

- **Alignment** — it is a registry and provenance trail, which is what the lane asks for.
- **Counterfactual** — the thing being pitched *is* the thing that breaks without Arkiv.
- **Clarity** — the scope is one layer, not a platform.

---

## 5. Decision

**Enter the open `Other` lane. Target submission before 31 August 2026, 23:59 UTC.**

Deliberately not Marketplaces, despite it being open now: six days is enough time, but the
alignment score would cost more than the deadline saves.

One caveat to revisit: if a Haven-adjacent **developer tool** were to become the stronger
pitch, its natural home was AI & DevTools, which is closed. The Other lane accepts it, but
its alignment there is judged on needing the Web3-database model rather than on DevEx
leverage — so the index registry remains the better entry.
