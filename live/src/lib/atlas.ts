/**
 * THE ATLAS — MODEL
 *
 * Turns live readings into a system of bodies.
 *
 * The map has two populations, and the axis control genuinely swaps which one
 * you are looking at rather than rescaling the same one:
 *
 *   CAPITALISATION   The DataDAOs. Sixteen real communities, each sized by the
 *                    real market capitalisation of the asset that gates it.
 *
 *   STORAGE          The storage providers. Every provider currently holding a
 *                    live data set on the Filecoin pin contracts, sized by the
 *                    real bytes it holds under proof.
 *
 * Those are separate measures of separate things, so the design refuses to merge
 * them into one score. What would join them — which community's archive sits on
 * which provider — is metadata, and metadata is Arkiv's job. Arkiv is not
 * operational, so those edges are drawn unlit. The gap is the honest centre of
 * the picture rather than something to paper over.
 *
 * Infrastructure (Ethereum, Base, Optimism, Filecoin, ICP, Arkiv) appears as
 * fixed stations, never sized. Their asset prices are irrelevant to whether an
 * archive holds, so the map reports only their operational state.
 */

import { CHAINS, GATES, type GateSpec } from './chains.ts'
import type { GateFacts } from './live.ts'
import type { MarketQuote } from './market.ts'
import { attributeUploaders, ATTRIBUTION_CAVEAT, type CommunityStorage, type UploaderRecord } from './attribution.ts'
import { acquireLink, thresholdLink } from './threshold.ts'

export type Axis = 'capitalisation' | 'storage'

export type Constellation = GateSpec['constellation']

export const CONSTELLATIONS: readonly Constellation[] = ['Lore', 'Art', 'Culture', 'Governance']

/** Orbital lane per constellation, in scene units. */
const LANE: Record<Constellation, number> = {
  Lore: 11.5,
  Art: 15.5,
  Culture: 19.5,
  Governance: 23.5,
}

/** Where the infrastructure stations sit. Fixed, cardinal, never resized. */
export const STATION_RADIUS = 33

export interface Body {
  id: string
  kind: 'dao' | 'uploader'
  label: string
  sublabel: string
  /** Radius in scene units, derived from the active axis. */
  radius: number
  /** Orbital lane radius. */
  orbit: number
  /** Angle at t=0, radians. */
  phase: number
  /** Radians per second. Slower for larger orbits, as in an actual orrery. */
  speed: number
  /** Vertical offset so lanes do not read as a flat disc. */
  elevation: number
  /** Emissive hue as an RGB triplet, 0–1. */
  hue: [number, number, number]
  /** Remote logo, or null for a body that has no image of its own. */
  image: string | null
  /** Everything the inspector shows. */
  detail: BodyDetail
}

export interface BodyDetail {
  heading: string
  /** Ordered rows of label / value / provenance. */
  rows: Array<{ label: string; value: string; note?: string; mono?: boolean }>
  premise?: string
  explorer?: string
  constellation?: Constellation
  /** Fields that require the metadata index and are therefore unavailable. */
  pending?: string[]
  /** Where a reader acquires the gating asset. */
  acquire?: { href: string; venue: string }
  /** Deep link into the enrolment surface, focused on this community. */
  enrol?: string
}

/* ── Colour ─────────────────────────────────────────────────────────────────
   Constellations are tinted, but within a narrow range: the map should read as
   one instrument lit from one source, not a bag of coloured marbles. */
const CONSTELLATION_HUE: Record<Constellation, [number, number, number]> = {
  Lore: [1.0, 0.52, 0.28],
  Art: [1.0, 0.76, 0.44],
  Culture: [0.98, 0.6, 0.82],
  Governance: [0.6, 0.84, 1.0],
}

/* ── Scaling ────────────────────────────────────────────────────────────────
   Radius is proportional to the cube root of the measure, so a sphere's VOLUME
   tracks the value. Area-proportional scaling (sqrt) is correct for flat
   circles; using it on a sphere overstates large bodies badly. */
function volumetric(value: number, max: number, min = 0.62, span = 2.35): number {
  if (!Number.isFinite(value) || value <= 0 || max <= 0) return min
  return min + Math.cbrt(value / max) * span
}

function formatUsd(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Not tracked'
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `$${(value / 1e6).toFixed(value >= 1e7 ? 1 : 2)}M`
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const exp = Math.min(units.length - 1, Math.floor(Math.log10(value) / 3))
  const scaled = value / 1000 ** exp
  return `${scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2)} ${units[exp]}`
}

function formatSupply(supply: bigint | null, decimals: number | null): string {
  if (supply === null) return '—'
  const d = decimals ?? 0
  const whole = d > 0 ? supply / 10n ** BigInt(d) : supply
  return whole.toLocaleString('en-US')
}


/**
 * Contract names are frequently written as one CamelCase run
 * ("ForgottenRunesWizardsCult"). The name still comes live from the contract —
 * this only decides how it is typeset.
 */
function humanise(name: string): string {
  if (/\s/.test(name)) return name
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
}

/* ── DataDAO bodies ─────────────────────────────────────────────────────── */

export interface DaoInput {
  facts: Map<string, GateFacts>
  quotes: Map<string, MarketQuote>
  /** Real payer records from the Filecoin pin contracts. */
  uploaders: UploaderRecord[]
  /** Which measure sets the size of every body. */
  axis: Axis
}

/**
 * THE COMMUNITIES
 *
 * One population, measured two ways. The axis control does not swap what is on
 * the map — it re-measures it, and the bodies spring to their new size in place.
 * That is the honest shape for this comparison: capitalisation and storage are
 * two facts about the same sixteen communities, and putting different populations
 * on the two axes would have implied they were alternatives rather than a pair.
 *
 * Storage providers deliberately do not appear. They supply the capacity; they do
 * not publish the archive, so sizing anything by provider would answer a question
 * about Filecoin rather than about the communities Haven serves.
 */
export function buildDaoBodies({ facts, quotes, uploaders, axis }: DaoInput): Body[] {
  const caps = GATES.map((gate) => quotes.get(gate.slug)?.marketCapUsd ?? 0)
  const maxCap = Math.max(1, ...caps)

  const storage = attributeUploaders(uploaders)
  const maxBytes = Math.max(1, ...GATES.map((gate) => storage.get(gate.slug)?.bytes ?? 0))

  // Distribute each constellation's members evenly around their own lane so no
  // two bodies in a lane ever occlude one another.
  const laneCounts = new Map<Constellation, number>()
  for (const gate of GATES) {
    laneCounts.set(gate.constellation, (laneCounts.get(gate.constellation) ?? 0) + 1)
  }
  const laneCursor = new Map<Constellation, number>()

  return GATES.map((gate) => {
    const fact = facts.get(gate.slug)
    const quote = quotes.get(gate.slug)
    const cap = quote?.marketCapUsd ?? null

    const count = laneCounts.get(gate.constellation) ?? 1
    const index = laneCursor.get(gate.constellation) ?? 0
    laneCursor.set(gate.constellation, index + 1)

    const orbit = LANE[gate.constellation]
    const chain = CHAINS[gate.chain]

    const rows: BodyDetail['rows'] = [
      {
        label: 'Gate',
        value: `Hold at least ${gate.threshold.toLocaleString('en-US')} ${fact?.symbol ?? gate.slug.toUpperCase()}`,
        note: 'The entire authorisation model',
      },
      { label: 'Contract', value: gate.address, mono: true, note: chain.name },
      {
        label: 'Capitalisation',
        value: formatUsd(cap),
        note: cap === null ? 'No market quote available' : 'Market source · price is not an on-chain fact',
      },
    ]

    if (quote?.floorUsd) {
      rows.push({ label: 'Floor', value: formatUsd(quote.floorUsd), note: 'Lowest listed' })
    } else if (quote?.priceUsd) {
      rows.push({ label: 'Price', value: formatUsd(quote.priceUsd), note: 'Per unit' })
    }

    rows.push({
      label: 'Supply',
      value: formatSupply(fact?.totalSupply ?? null, fact?.decimals ?? null),
      mono: true,
      note: 'Read live from the contract',
    })

    // ── The storage side ──
    const held = storage.get(gate.slug)
    if (held) {
      rows.push({
        label: 'Pinned under proof',
        value: formatBytes(held.bytes),
        note: `Real sum over ${held.uploaders} uploader ${
          held.uploaders === 1 ? 'address' : 'addresses'
        } — leaf count × 32 bytes from the pin contracts. ${ATTRIBUTION_CAVEAT}`,
      })
      rows.push({
        label: 'Data sets',
        value: held.dataSets.toLocaleString('en-US'),
        note: 'Live and proven on Filecoin',
      })
      rows.push({
        label: 'Provider relationships',
        value: held.providers.toLocaleString('en-US'),
        note: 'Distinct providers holding those sets. Providers supply capacity; they do not publish.',
      })
    } else {
      rows.push({
        label: 'Pinned under proof',
        value: '—',
        note: 'No uploader attributed to this community',
      })
    }

    return {
      id: gate.slug,
      kind: 'dao' as const,
      label: humanise(fact?.name ?? gate.slug),
      sublabel:
        axis === 'capitalisation' ? formatUsd(cap) : held ? formatBytes(held.bytes) : '—',
      radius:
        axis === 'capitalisation'
          ? volumetric(cap ?? 0, maxCap, 0.66, 2.5)
          : volumetric(held?.bytes ?? 0, maxBytes, 0.66, 2.5),
      orbit,
      phase: (index / count) * Math.PI * 2 + orbit * 0.21,
      // Kepler-ish: outer lanes turn more slowly. Not physics, but the eye reads
      // uniform angular speed across lanes as a carousel rather than a system.
      speed: 0.055 / Math.pow(orbit / LANE.Lore, 1.4),
      elevation: Math.sin(index * 1.7 + orbit) * 1.15,
      hue: CONSTELLATION_HUE[gate.constellation],
      image: quote?.image ?? null,
      detail: {
        heading: humanise(fact?.name ?? gate.slug),
        rows,
        premise: gate.premise,
        explorer: chain.explorerAddress(gate.address),
        constellation: gate.constellation,
        // The map should not be a dead end. A reader who has just found a
        // community here needs the two things the Atlas cannot give them: where
        // to acquire the asset, and where to check whether they already qualify.
        acquire: acquireLink(gate),
        enrol: thresholdLink(gate),
        pending: [
          'Which uploader addresses belong to this community',
          'The piece CIDs bound to its archive',
        ],
      },
    }
  }).sort((a, b) => b.radius - a.radius)
}

/* ── Provider bodies ────────────────────────────────────────────────────── */

/* ────────────────────────────────────────────────────────────────────────────
   STATIONS
   The four public networks Haven runs on, fixed at the outer edge and arranged
   like the blades of the mark.

   Stations are never sized. Their assets have prices, and those prices have no
   bearing on whether an archive holds — sizing them would make the map say
   something it has no business saying. A station is lit or unlit: it answers, or
   it does not.

   Each `id` matches a key returned by `pulseAll`, so liveness is measured in the
   reader's own browser rather than declared here. Arkiv is the only one that
   currently comes back dark.
   ──────────────────────────────────────────────────────────────────────────── */
export interface Station {
  /** Matches a ChainPulse key so the station is lit by a live probe. */
  id: string
  label: string
  role: string
  /** Angle on the outer ring, radians. */
  angle: number
  elevation: number
  hue: [number, number, number]
  /** Only used before the first probe returns. */
  operational: boolean
}

export const STATIONS: readonly Station[] = [
  {
    id: 'arkiv',
    label: 'Arkiv OP L3',
    role: 'The index',
    angle: Math.PI * 0.75,
    elevation: 2.4,
    hue: [0.36, 0.95, 0.55],
    operational: false,
  },
  {
    id: 'icp',
    label: 'DFINITY ICP',
    role: 'The gate',
    angle: Math.PI * 0.25,
    elevation: 3.1,
    hue: [0.58, 0.6, 0.98],
    operational: true,
  },
  {
    id: 'ethereum',
    label: 'Any EVM',
    role: 'The criterion',
    angle: Math.PI * 1.75,
    elevation: -2.6,
    hue: [0.99, 0.75, 0.3],
    operational: true,
  },
  {
    id: 'filecoin',
    label: 'Filecoin FEVM · IPFS',
    role: 'The vault',
    angle: Math.PI * 1.25,
    elevation: -3.2,
    hue: [0.44, 0.86, 0.98],
    operational: true,
  },
]

/**
 * A body's position on its lane at time `t`, in seconds.
 *
 * Kept as a pure function of time rather than an accumulated rotation so that a
 * dropped frame, a backgrounded tab, or a camera that needs to know where a body
 * is *right now* all agree on the same answer.
 */
export function positionAt(body: Body, t: number): [number, number, number] {
  const angle = body.phase + t * body.speed
  return [Math.cos(angle) * body.orbit, body.elevation, Math.sin(angle) * body.orbit]
}

export function axisLabel(axis: Axis): { title: string; measure: string; note: string } {
  return axis === 'capitalisation'
    ? {
        title: 'Capitalisation',
        measure: 'Sixteen candidate communities, sized by the market value of the asset that gates them',
        note: 'Supply from the contract, price from the market. Infrastructure assets are excluded — their price has no bearing on whether an archive holds.',
      }
    : {
        title: 'Storage',
        measure: 'The same sixteen communities, sized by the bytes their uploaders have pinned under proof',
        note: `The demand side, read from the Filecoin pin contracts on FEVM — what a community has stored, not what a provider holds. ${ATTRIBUTION_CAVEAT}`,
      }
}
