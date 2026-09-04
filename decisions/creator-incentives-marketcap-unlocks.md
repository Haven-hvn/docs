# Strategic Analysis: Creator Incentives for Market-Cap-Unlocked Data Collectives

**Status:** Draft — for review
**Scope:** Market-cap-gated progressive content unlocks, creator
incentivisation, per-chain reward token design
**Non-goals:** Decryption/key-custody internals (assumed to live in a
threshold decryption service by design)

## 1. Context

In a market-cap-gated unlock protocol, content stages are encrypted under
successively higher market-cap targets: each stage's decryption key is
released only once the gating token's market capitalisation reaches its
target, as evaluated by a threshold key service against an oracle price. The
protocol can declare, discover (via range-indexed unlock-target metadata),
and enforce such unlocks. What it cannot do is make anyone care: stages sit
encrypted until targets hit, long-tail tokens may never hit them, and every
downstream system (communities, holding proofs, recommendations) starves for
lack of activity. This is a two-sided cold start amplified by locking
content behind market events.

The proposed incentive layer is a **creator reward token**: one token
contract per supported chain, earned by creating data collectives
(creator-published content series gated on a token) whose stages unlock by
market cap.

## 2. Design constraints (agreed)

1. **Cheapest possible onchain footprint.** Protocol-paid ongoing spend must
   be zero; all variable costs fall on beneficiaries (launchers fund
   registration, claimants pay claim gas).
2. **No reliance on the decryption service for the mint.** Key custody,
   gating, and holding proofs stay where they are. Reward minting and
   eligibility must be verifiable from chain state alone.
3. **Continuous mint, not discrete drops.** No per-unlock pools, funding txs,
   claim windows, or sweeps. Eligible parties accrue over time while
   conditions hold; conditions failing pauses accrual automatically.
4. **Long-tail first.** The mechanism must pay small-token communities, not
   just mid-caps that would have succeeded anyway.
5. **Creators only (current scope).** Eligibility is restricted to collective
   creators. Holder/publisher/community claims are explicitly out of scope —
   a future second mechanism, not scope creep on this one.

## 3. Recommended design

**One distributor contract + one reward token per chain.** Per content
series, the launcher sends a single registration tx:

```
registerSeries(token, targets[], pricePool)   // records creator = msg.sender
```

The creator then mints continuously, accruing per unlocked stage:

```
mintable = Σ over stages with TWAP-mcap ≥ targetᵢ : k × targetᵢ × (now − lastMint)
```

Key properties:

- **Price source is DEX TWAP (e.g. 30-min), read lazily at mint time.**
  Long-tail tokens have no dedicated price feeds; any liquidity pool
  suffices. No keeper tx, no recorded unlock event — each minter's gas
  covers one TWAP read, and mint-succeeds ⟺ unlocked.
- **Rate scales with the target cleared.** A trivial-target junk series
  drips dust while costing registration gas; a genuine large unlock drips
  proportionally. Economics filters spam — no floors, no reviews, no
  allowlists.
- **The drip follows the market.** MCap above target accrues; below pauses.
  Small tokens with reachable first-stage targets earn a steady small drip.
- **Bounded liability:** per-series cap at registration + global `maxSupply`.
- **Reward is transferable.** With a fixed creator set there is no mercenary
  vector, and a creator who cannot realise value is a weaker incentive.
- **State per series:** one `lastMint` timestamp. One SSTORE per mint,
  creator-paid.

## 4. Alternatives considered and rejected

| Alternative | Rejected because |
|---|---|
| Relative/baseline targets (multiples of mcap-at-publish) | Per-series service-side state + multi-implementation derivation work; low absolute first-stage targets achieve ~90% for zero protocol cost |
| Holder / publisher / snapshot claims | Needs trusted history (proofs or replay); out of creator-only scope |
| Flat per-address rewards | Splitting-across-wallets farming; target-scaled rates neutralise it |
| Soulbound (non-transferable) reward | Correct for holder rewards (mercenary risk); unnecessary for a fixed creator set, and weakens the incentive |
| Discrete unlock pools + windows | Funding txs, expiry/sweep admin, unbounded event handling — all eliminated by continuous accrual |
| Onchain proof/signature verification | Prohibitive gas; and excluded by the no-decryption-service constraint regardless |
| Dedicated oracle price reads | Nonexistent for long-tail tokens; DEX TWAP dominates on coverage and cost |

## 5. Deliberate non-goals and casualties

- **Conditional decryption stays in the threshold service.** A transparent
  ledger cannot hold secrets; moving the mint onchain does not and must not
  move key custody. (If full service-independence is ever wanted:
  publish-on-unlock is cheapest, an independent threshold network preserves
  real secrecy — both out of scope here.)
- **No holder/community incentives in v1.** The demand side (evangelism,
  holding through run-ups) is real but requires trusted-history machinery.
  Revisit as a separate mechanism once creator supply exists.
- **Recommendations impact: none.** Scoring continues on existing holding
  proofs; the reward token does not feed it.

## 6. Open questions

1. Rate constant `k`: fixed globally per chain, or launcher-chosen within
   bounds at registration?
2. Per-series cap sizing: launcher-chosen (flexible, gameable upward) or
   formula-derived from targets (predictable liability)?
3. First-stage preset guidance: publish recommended low ladders so launchers
   default into long-tail-friendly shapes?
4. TWAP window and pool selection: launcher-chosen pool risks thin-pool
   manipulation inflating mintable amounts — minimum-liquidity guard, or
   accept as self-limiting (inflated mcap also unlocks content early,
   against the launcher's own interest)?
5. Reward utility beyond compensation: governance weight, fee discounts,
   directory boosting — needed at launch, or does transferable value
   suffice to bootstrap?

## 7. Suggested sequencing

1. Settle open questions 1–2 (rate and caps bound all liability math).
2. Distributor + reward token per chain (one audit surface, minimal logic:
   TWAP check, accumulator, caps).
3. Launcher registration flow in the publishing client (chain the
   `registerSeries` tx after stage publish).
4. Creator dashboard: accrued/claimable display, mint button (mobile later).
5. Observe long-tail uptake before designing the demand-side (holder)
   mechanism — build it against real distribution data, not assumptions.
