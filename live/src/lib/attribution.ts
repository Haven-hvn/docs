/**
 * ATTRIBUTION — uploader address → community
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO — REPLACE WITH ARKIV. This is the only mocked data in the project.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What is real here: every byte, every data set, every uploader address. Those
 * are summed from live reads of the Filecoin pin contracts on FEVM —
 * `WarmStorageStateView.getDataSet(id).payer` for the uploader,
 * `PDPVerifier.getDataSetLeafCount(id) × 32` for the size. Nothing about the
 * quantities is invented.
 *
 * What is mocked: WHICH COMMUNITY EACH UPLOADER PUBLISHES FOR. No Filecoin
 * contract records that, and it cannot be derived from chain state — an address
 * paying to pin bytes looks identical whether it is publishing for one community
 * or another. That mapping is an Arkiv entity, and Arkiv is not operational, so
 * the assignment below is a deterministic placeholder.
 *
 * In production this function disappears. The Arkiv entity for an uploader
 * carries the community it contributes to alongside the piece CIDs, and the
 * uploader's address is the join key — the same `0x…` appears in the Arkiv
 * entity, in the DataDAO's token or NFT contract on its own chain, and as the
 * payer on the Filecoin data set. Three chains, one address, and the archive
 * resolves end to end. The shape of what this module returns is exactly what
 * that lookup will return, so only the body of `attributeUploaders` changes.
 *
 * The placeholder is a hash, not a hand-picked table, for two reasons: it is
 * stable across reloads so the map does not reshuffle under the reader, and it
 * is obviously arbitrary rather than quietly plausible — nobody can mistake it
 * for a measurement.
 */

import { GATES } from './chains.ts'

export interface UploaderRecord {
  uploader: string
  /** Decimal string of real pinned bytes. */
  bytes: string
  dataSets: number
  providers: number
}

export interface CommunityStorage {
  /** Real bytes, summed over the uploaders assigned to this community. */
  bytes: number
  /** How many uploader addresses were assigned here. */
  uploaders: number
  /** Real live data sets across those uploaders. */
  dataSets: number
  /** Distinct provider relationships across those uploaders. */
  providers: number
}

/** FNV-1a. Small, fast and stable — the exact function does not matter, only
 *  that the same address always lands on the same community. */
function hash(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * Group real uploader records under community slugs.
 *
 * @param uploaders Real payer records read from the pin contracts.
 * @returns A map of community slug → aggregated storage. Communities with no
 *          assigned uploader are absent rather than zeroed, so a caller can tell
 *          "nothing attributed" apart from "attributed nothing".
 */
export function attributeUploaders(uploaders: UploaderRecord[]): Map<string, CommunityStorage> {
  const out = new Map<string, CommunityStorage>()

  for (const record of uploaders) {
    // ── MOCK ── the one line that Arkiv replaces.
    const gate = GATES[hash(record.uploader.toLowerCase()) % GATES.length]
    if (!gate) continue

    const entry = out.get(gate.slug) ?? { bytes: 0, uploaders: 0, dataSets: 0, providers: 0 }
    entry.bytes += Number(record.bytes)
    entry.uploaders += 1
    entry.dataSets += record.dataSets
    entry.providers += record.providers
    out.set(gate.slug, entry)
  }

  return out
}

/**
 * Every visible figure derived from the mock carries this, so the mock is never
 * presented as a reading. Kept as one exported string so the wording cannot
 * drift between the axis panel, the inspector and the brief.
 */
export const ATTRIBUTION_CAVEAT =
  'Placeholder attribution: the bytes are real on-chain sums, but which community each uploader publishes for is mocked until the Arkiv index resolves it.'
