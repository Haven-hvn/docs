# haven-web

The web surface for Haven — a sovereign media protocol. Three surfaces, one
design system:

| Route | Name | What it is |
| --- | --- | --- |
| `/` | **The Record** | The argument, in eight acts. Pre-rendered, near-zero JS. |
| `/atlas` | **The Atlas** | A live WebGL observatory of communities and storage. |
| `/codex` | **The Codex** | Protocol documentation as a reference work. |

---

## Repointing Arkiv

Arkiv's public networks are short-lived: Braga was retired on 12 August 2026 and
the next public testnet is expected September 2026 under a new name. Every devnet
so far has served its RPC, faucet and explorer from a single host on the same
path convention, so `src/lib/chains.ts` describes the host once and derives the
rest. Nothing in the site hardcodes a hostname or a date.

When the next network lands, rebuild with:

```
PUBLIC_ARKIV_HOST=<new-host>            # e.g. lisbon.hoodi.arkiv.network
PUBLIC_ARKIV_CODENAME=<Name>            # used in prose
PUBLIC_ARKIV_STATUS=live|retired        # flips the badge and the status sentence
PUBLIC_ARKIV_RETIRED_ON=<date>          # only relevant while retired
PUBLIC_ARKIV_NEXT=<expectation>         # next public testnet
```

`rpc`, `faucet` and `explorer` are derived from the host. The liveness probe runs
against whatever `rpc` resolves to and reports what it actually finds, so a wrong
`PUBLIC_ARKIV_STATUS` changes the claim but never the measurement.

## Data provenance, and the one mock

Everything on the site is read live or captured from a live read, with a single
documented exception.

**Real.** Chain liveness and block heights (measured in the reader's browser),
gate `name`/`symbol`/`decimals`/`totalSupply` via multicall, market
capitalisation from CoinGecko, and the whole Filecoin storage picture: live data
sets, leaf counts, bytes under proof, payer addresses, storage providers, piece
CIDs and USDFC escrow — read from `PDPVerifier`,
`FilecoinWarmStorageService`/`StateView` and `FilecoinPay` on FEVM.

**Mocked — `src/lib/attribution.ts`.** Which community each uploading address
publishes for. No Filecoin contract records it and it cannot be derived from
chain state: an address paying to pin bytes looks identical whichever community
it publishes for. That mapping is an Arkiv entity, and Arkiv is the only
non-operational network in the stack, so the assignment is a deterministic
placeholder. The byte totals it aggregates are real; only the grouping is
invented, and every figure derived from it carries `ATTRIBUTION_CAVEAT` in the
interface.

In production the module is deleted. The Arkiv entity for an uploader carries the
community and the piece CIDs, and the uploader's address is the join key — the
same `0x…` appears in the Arkiv entity, in the community's token or NFT contract
on its own chain, and as the `payer` on the Filecoin data set. Three chains, one
address. Only the body of `attributeUploaders` changes; its return shape is
already the shape of that lookup.

**Arkiv itself** is probed on every load and currently returns 503. It is drawn
as absent — unlit station, dashed edges, explicit "awaiting the metadata index"
lists — never estimated, and never given credit for storage, which belongs to the
Filecoin pin contracts.

## The design language

**"The Record & The Observatory."** Two worlds built from one lightness geometry.

The story surfaces are an institutional document: warm archival stock, engraved
hairlines, numbered folios, figure plates, marginalia, specimen tables, and
exactly one accent — the ember seal. The Atlas inverts the entire ramp to void
black, where the network becomes the only light source. Light where the argument
is made; dark where the network is observed.

That inversion is implemented as ten token redefinitions
(`src/styles/theme.css`), applied either to the whole document
(`<html data-world="observatory">`) or to a single section
(`<section data-tone="void">`). Every component authored for the paper world
survives the flip without a single component-level override — which is why acts
can alternate tone down the page.

**Typography.** Three registers, each with one job:

- `Newsreader` — the editorial voice. Arguments, pull quotes, entry titles.
- `Inter` — the institutional voice. Statements, interface, tables.
- `JetBrains Mono` — the evidentiary voice. Addresses, hashes, ledgers, labels.

Served from our own origin, subset and metric-matched at build time by Astro's
font pipeline. Two faces are preloaded; the ledger face is not.

**Ink edition.** The Record is light by design. `⌘K → Switch edition` (or the
footer control) borrows the observatory's lightness ramp for readers who need
dark. It is an accessibility affordance, not a theme, and it flips through a
View Transition.

---

## Data provenance — the part that matters

Every figure on this site is real, and the interface says where each one came
from. There are no fallbacks and no synthetic activity.

### Live, in the reader's browser

Read at runtime over CORS-open public endpoints with no key and no proxy:

- **Block heights** — Ethereum, Base, OP Mainnet, Filecoin, with measured
  round-trip times (`src/lib/live.ts`).
- **Gate facts** — `name()`, `symbol()`, `decimals()`, `totalSupply()` for all
  sixteen candidate gates, one multicall per chain via `viem`.
- **Capitalisation** — one batched market request for the fungible gates.
- **Epoch** — computed arithmetically as `floor(unix / 2_592_000)`.

### Captured at build time

Too slow or too rate-limited for a page load, so captured with an explicit block
number and timestamp that the interface prints next to the figures
(`scripts/capture.mjs` → `src/data/`):

- **The storage ledger** — every data set on the Filecoin FEVM pin contracts,
  with real leaf counts, payers and providers, aggregated per uploader and per provider
  holdings. ~4,400 `eth_call`s folded into a handful of multicalls.
- **Collection quotes** — market capitalisation and floor per NFT gate, fetched
  with spacing because the public endpoint rate-limits hard.

Refresh with `npm run capture`, or `npm run build:fresh` to capture and build.

### Not operational

**Arkiv**, the metadata index, answers `503`. Arkiv holds metadata *only* —
pinned storage lives on the Filecoin FEVM pin contracts, keys derive on ICP, and
balances are checked on EVM chains, so none of those are affected.

The consequence is narrow and specific: a data set cannot presently be resolved
to the community that published it. The interface draws that absence rather than
estimating around it — Arkiv's blade in the hero is unlit, its station in the
Atlas is a wireframe, the edges that would bind a community to its storage are
dashed and dim, and every affected field is listed under "Awaiting the metadata
index". The probe still runs on every load, so the moment the node answers the
interface lights it without a redeploy.

### On the roster

The sixteen communities in the Atlas are **candidate gates**, not tenants: real,
verified contracts that already satisfy the gate criteria. Every one answered
`name()`, `symbol()` and `totalSupply()` from a public node before it was
committed. The selection is deliberately niche — putting a household-name
collection on the list would be the least credible thing the design could do.

Infrastructure assets (FIL, ETH, OP, ICP) are deliberately excluded from every
value measure. They are networks Haven runs on, so they are reported by
operation — block height, round-trip, epoch — and never by price.

---

## Stack

- **Astro 7** — static output, content collections, native font optimisation,
  cross-document View Transitions, Speculation Rules prerendering.
- **Tailwind 4** — CSS-first `@theme`, OKLCH throughout, Lightning CSS.
- **React 19** islands — only where interaction requires it: the Atlas, the
  command palette, the live instrument, the hero aperture.
- **three.js + React Three Fiber + postprocessing** — the Atlas, chunked
  separately so the story surfaces never download a renderer.
- **viem** — typed multicall reads against EVM and FEVM.

Motion is owned by the browser wherever possible: reveals prefer
`animation-timeline: view()` and only fall back to an `IntersectionObserver`.
`prefers-reduced-motion` removes movement while keeping opacity and colour, so
the interface still communicates state.

---

## Commands

```bash
npm install

npm run dev            # dev server
npm run check          # astro check — types across .astro, .tsx and content
npm run build          # static build into dist/
npm run preview        # serve the build

npm run capture           # refresh both datasets
npm run capture:storage   # FEVM pin contracts only  (~90s)
npm run capture:market    # collection quotes only   (~2min, rate-limited)
npm run build:fresh       # capture, then build
```

## Layout

```
src/
  styles/     theme.css (tokens) · base.css (apparatus) · material.css (light)
              codex.css · atlas.css · palette.css
  lib/        protocol.ts  the solidified protocol, transcribed
              chains.ts    verified endpoints, contracts, the gate roster
              fevm.ts      Filecoin pin contract reads
              live.ts      runtime probes
              market.ts    capitalisation
              atlas.ts     the visualisation model
              chrome.ts    ambient document behaviour
              format.ts    presentation only
  components/ Astro chrome + React islands (Atlas/, CommandPalette, …)
  content/    codex/*.mdx — the documentation
  data/       generated by scripts/capture.mjs
  pages/      index · atlas · codex/[...slug]
```
