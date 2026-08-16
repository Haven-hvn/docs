# Rubric self-check

Scored against the published rubric before submitting, to find the weak criterion rather
than discover it in judging. Scores are our own read and deliberately conservative.

| # | Criterion | Pts | Self | Weighted | Basis |
| - | :-------- | --: | ---: | -------: | :---- |
| 1 | Track alignment (`Other`) | 20 | 5 | 20.0 | The lane's own seeds name it: "On-chain Registry — indexed by owner + attributes; expiry models renewals; creator metadata proves who issued each entity" and "Provenance Trail". Arkiv is one of the four networks the protocol is defined on, not a storage pick. |
| 2 | Arkiv fit — counterfactual | 20 | 5 | 20.0 | Four named failure modes on an operator-run database, and "what stays off" comes from the architecture rather than the form. The rubric's 5-anchor asks that "the pitch collapses without" Arkiv — here it inverts into the thing it exists to prevent. |
| 3 | Data & query design | 20 | 5 | 20.0 | Four entity types, every attribute typed with a reason, numerics chosen for the ranges they enable, shared-key relationships, five queries mapped to real user questions, lifetimes spanning 48h→180d with product reasons. Raised to 5 after two corrections: nothing inherent to the container is duplicated as an attribute (no `expires_at`, no `uploader`, no `status`), and the two-proof model — `$creator` for authorship, canister attestation for entitlement — makes the registry permissionlessly writable without being spoofable. |
| 4 | Impact & usefulness | 15 | 4 | 12.0 | Named day-one adopters verified on-chain; the problem predates the Arkiv angle. Held at 4 — no signed design partner. |
| 5 | Clarity & feasibility | 15 | 4 | 12.0 | Sharp first slice, named risks including a privacy leak with its mitigation and its cost, and an honest blocker. Four ASCII figures now carry the schema, the expiry logic and the two-proof model. Held at 4 rather than 5: no video, and the first slice is unproven against a live node. |
| 6 | Uniqueness | 10 | 5 | 10.0 | A public index of private things: the permission layer is the public part and the media is the private part, inverting the usual arrangement. |
|   | **Total** | **100** | | **94.0** | |

## What is actually weak

**Criterion 3 was the weak one and has been fixed.** Two redundancies were in the first draft
and both mattered:

- Attributes duplicating what the entity already carries — an `uploader` attribute beside
  `$creator`, and a `slug` attribute beside the entity key. Duplicating unforgeable metadata
  into a forgeable attribute is the opposite of the point.
- A query filtering `epoch gte <current>` on entitlements while the same page argued that
  expired entities are never returned. Redundant, and it implied a misunderstanding of expiry.

Removing both, and adding the attestation pairing, is what moved this to a 5: the schema now
demonstrates understanding of the container rather than reimplementing parts of it.

**The residual risk is that nothing has been run.** The attribute types are chosen against the
documented model, but no predicate has been issued against a node — Arkiv has no public
network until September and the limited devnet needs access we do not have. Stated plainly in
the submission rather than papered over.

**Criterion 5 would rise with one diagram.** The rubric is explicit that production polish
earns nothing but content clarity does, and that filmed ideas are prioritised for
amplification. A single figure — four entity types, the shared key, and the four networks
with what each holds — is the cheapest available point.

## Deliberate omissions

- **No prototype.** It is an ideathon; the rules say ideas, not deployments. Effort went into
  the schema, which is what gets scored.
- **No marketplace or DeFi angle bolted on.** Would have cost 12–16 alignment points in
  those lanes and contradicted the protocol. See `00-track-analysis.md`.
- **No claim that Arkiv is running.** It is retired until September. Overstating it risks the
  `no_meaningful_arkiv` eligibility flag on inspection, and would be false.

## Before submitting

- [x] Draw the diagrams — done, `04-figures.md`, ASCII so they survive a form paste
- [x] State authorship per Rule 54 — Haven predates the ideathon; the registry layer is what is new
- [ ] Paste `01-data-model.md` in full into the schema answer — it is the 20-point criterion
- [ ] Consider a 60–90 second screen recording: the rubric prioritises filmed ideas for
      spotlights, and we can show the Atlas admitting its attribution is mocked — which is the
      counterfactual demonstrated rather than argued
- [ ] Re-run `review_my_idea` on the Ideathon MCP and answer its questions
- [ ] Confirm the `Other` lane deadline: **31 August 2026, 23:59 UTC**
- [ ] Submit at https://tally.so/r/OD9eeY
