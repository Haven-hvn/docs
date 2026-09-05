# V4 Bond price source — canister spec

Teach the Haven-AOL canister to verify market-cap unlocks for mint.club
bonding-curve tokens by reading the curve itself. The curve is the ONLY
price source: there is no Chainlink leg, per-token or otherwise, and v4
gates are mint.club-tokens-only by construction.

## 1. Problem (historical — fixed)

- The v4 gate JSON carried `oracleAddress`, documented as a Chainlink
  AggregatorV3 proxy. Fresh mint.club bonding-curve tokens have no
  Chainlink feed, so the field was unfillable for long-tail tokens.
- The dapp unlock preview priced via the mint.club SDK (curve math) while
  enforcement priced via Chainlink: two sources of truth that could
  disagree (`haven-dapp/src/lib/v4/market-cap.ts:8`).
- Resolution: delete the Chainlink path. `oracleAddress` must name the
  chain's Bond contract (pinned, fail-closed otherwise); `marketCapTarget`
  is whole reserve units.

## 2. Key finding (mint.club SDK source)

`@mint.club/v2-sdk` `computeUsdRateForBondToken`
(`node_modules/@mint.club/v2-sdk/dist/index.mjs`) prices a bonded token as:

```
usdRate = priceForNextMint(token) / 10^reserveDecimals × reserveUsdRate
```

where `priceForNextMint` and `tokenBond` (tuple index 4 = reserve token)
are plain Bond-contract views and `reserveUsdRate` comes from 1inch
offchain. Market cap is `currentSupply × usdRate` — the same formula the
dapp preview uses. The canister replicates the curve half onchain and
drops the USD leg entirely: targets are denominated in reserve units
(whole ETH), so no feed — per-token or reserve — is consulted on this
path. USD display stays offchain (preview only, fail-soft).

## 3. Design: curve pricing in `requestDecryptionKeyV4`

**Oracle pin.** `req.oracleAddress` (case-insensitive) must equal the
chain-configured Bond address; anything else returns
`#InvalidOracle` before touching the chain. No gate-JSON schema change,
no EIP-712 change (`oracleAddress` is not a signed field;
`marketCapTarget` stays `nat`), no re-publish for Bond-sealed gates.

**Target units.** `marketCapTarget` is whole reserve units (whole ETH
for v1 native-reserve tokens). Whole-ETH granularity is fine for
million-scale rungs; `nat` has no overflow concern at these magnitudes.

**Reads (all through existing `ethCallRaw` + `abiWordAt`):**

| # | Call | Selector | Decode |
|---|------|----------|--------|
| 1 | `priceForNextMint(token)` on Bond | `0x840d885d` | word 0 → `priceNextMintWei` |
| 2 | `totalSupply()` on token | `0x18160ddd` (exists) | word 0 (reuse `fetchTotalSupply`) |
| 3 | `decimals()` on token | `0x313ce567` (exists) | word 0 (reuse `fetchTokenDecimals`, permanent cache) |
| 4 | `tokenBond(token)` on Bond | `0xd9fe0eae` | tuple index 4 → reserve; must equal chain-configured wrapped-native |

No `latestRoundData()` anywhere on this path — one fewer `eth_call`
per refresh than the feed-based design, and zero oracle failure modes.

Selectors computed via `viem.toFunctionSelector`; **re-verify against a
live node before deploy** (acceptance criterion).

**Formula (Motoko `Nat`, no overflow concern):**

```
capReserveWei = totalSupplyRaw × priceNextMintWei / 10^tokenDecimals
```

compared against `marketCapTarget × 10^reserveDecimals`. `reserveDecimals`
is probed via `decimals()` on the reserve and permanently cached (never
assumed, even though v1 wrapped-native reserves are 18 decimals).

**v1 scope.** Native-reserve tokens only — this covers the wizard create
flow, which mints with the zero-address (wrapped-native) reserve
(`haven-dapp/src/lib/v4/mint-create.ts:52-57`). Non-native reserve →
`#InvalidOracle("unsupported reserve …")` until a reserve→feed map lands.

**Config.** Per-chain table lives canister-side, admin-set, never
publisher-supplied: `(Bond address, wrapped-native address)`. All five
`chainToRpcServices` chains ship compiled-in defaults (mainnets share the
CREATE2 Bond; Sepolia uses its testnet Bond; each reserve verified:
WETH mainnet `0xC02a…`, Base/Optimism `0x4200…0006`, Arbitrum
`0x82aF…Bab1`, Sepolia `0xfFf9…6B14`). `setBondConfig` overrides per
chain. This removes the publisher foot-gun entirely.

**Cache.** Single-unit burst cache (`chain|token → { capScaled,
scaleDecimals, fetchedAt }`, 300s TTL). Entries carry their scale
(reserve-wei / reserve decimals); Step D and the public `getMarketCap`
divide by the stored scale. The lazy-delete-on-miss ordering is
preserved.

## 4. Semantics note (document, don't solve)

Curve cap is supply × *marginal* (next-mint) price — the bonding-curve
convention, identical to what the dapp preview shows today. It is not a
DEX-clearing valuation. State this in the user docs; the win is that
preview and enforcement now agree by construction.

## 5. Dapp (implemented, uncommitted working tree)

- Wizard ladder: USD rung intent via snap-to-stop sliders
  (`RUNG_USD_STOPS`, `$1M–$1B`), per-rung live dual display
  (`$5M ≈ 1,542 ETH`) off the seal-minute rate path.
- Wizard gate: no oracle field. The committed oracle derives from the
  chain's Bond contract; unconfigured chains block arming with an explicit
  message. `isBondAddress` (haven-aol TS) is the shared classifier.
- Wizard seal: `sealTargetsUsdToReserve` converts at seal minute; missing
  rate blocks sealing (fail closed). The manifest prints the exact enforced
  ETH bars plus the seal-minute USD/ETH rate; the USD figures are labeled
  intent.
- Session: stages stamp `{ marketCapTarget, targetUnit: 'reserve' }`
  (validated: length, positive safe-ints, strictly ascending) alongside the
  USD intent. Parse round-trips valid sealed fields, tolerates absence
  (legacy), rejects malformed-present.
- Publish: gate metadata + IBE derivation use `sealedTargetOf(plan)` (sealed
  value, legacy fallback to USD intent); `mcap_usd` attr and series
  `targets` stay USD (discovery/display, not consensus). Reader passes the
  sealed number through opaquely — no reader change.
- Same-train shipping (canister + wizard together): old-wizard + new
  canister seals USD numbers read as ETH (bricked gates); new-wizard + old
  canister seals ETH numbers read as USD (fail-open direction). Neither
  window may exist.

## 6. Acceptance criteria

1. Selectors `0x840d885d` / `0xd9fe0eae` verified against Base + Ethereum
   mainnet nodes (record block + response in the deploy log).
2. Formula unit tests: 1B-supply / 18-decimal magnitudes, zero supply,
   `priceForNextMint == 0` → `#InvalidOracle`, not unlock.
3. Reserve mismatch (non-native reserve token) → `#InvalidOracle`.
4. Non-Bond `oracleAddress` → `#InvalidOracle` without chain reads.
5. Cycle budget: 3 `eth_call`s per warm refresh (tokenBond probe + supply
   + price; both decimals legs permanently cached) — measure and confirm
   under `CYCLE_BUDGET`.
6. Regression: existing v4 derivation vectors unchanged
   (`derivation-v4-vectors.json` minus the removed `oraclePriceDecimals`);
   TS 96/96, Python v3+v4 95/95, dapp v4 92/92.
7. `tokenBond` struct layout confirmed (only index 4 is load-bearing).

## 7. Risks

- **Reserve-unit targets float against the dollar.** "Unlocks at 1,540 ETH"
  means something different in USD every day. Mitigate with dual display
  at ladder/seal time; the signed ETH number is the enforced truth.
- **Marginal-price gaming.** A single mint/burn moves `priceForNextMint`
  on thin curves; the 300s burst cache dampens but does not remove this.
  Targets stay coarse (snap-to-stop sliders make fine bars unrepresentable).
- **mint.club-only.** Non-curve tokens cannot gate. Deliberate: re-adding a
  feed path would resurrect the unfillable-field problem for long-tail
  tokens, which is the entire market this serves.
- **Bond upgrades.** If mint.club V2 Bond is ever replaced per chain, the
  admin table must move with it; treat the table as deploy config, not
  constants.
