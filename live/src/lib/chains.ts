/**
 * HAVEN — CHAINS
 *
 * Verified live constants. Every address in this file was read back from a
 * public node before being committed: each ERC-20 or ERC-721 below answered
 * name(), symbol() and totalSupply(), and every RPC below answered a
 * cross-origin POST with `access-control-allow-origin: *` so the browser can
 * read it directly with no proxy and no API key.
 *
 * ── Operational status ──────────────────────────────────────────────────────
 * Arkiv (the entity index) is NOT operational: braga.hoodi.arkiv.network
 * answers 503 and braga.arkiv.network does not resolve. Everything the
 * interface derives from Arkiv is therefore marked `indexPending` and is drawn
 * as an unlit body — never substituted with invented numbers. Every other
 * network is read live, at runtime, in the reader's browser.
 */

/**
 * Read configuration from the environment, in either runtime.
 *
 * This module is imported by Astro (where Vite injects `import.meta.env`) and by
 * the build-time capture script running under plain Node (where it does not
 * exist, and reading it throws). Supporting both is what lets the capture script
 * share this file instead of keeping a second copy of every contract address —
 * which is how the two drift apart.
 */
declare const process: { env?: Record<string, string | undefined> } | undefined

function env(key: string): string | undefined {
  const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const fromVite = viteEnv?.[key]
  if (fromVite) return fromVite
  // `@types/node` is not a dependency of this project, so `process` is declared
  // locally rather than pulled in wholesale for one lookup.
  if (typeof process !== 'undefined') return process?.env?.[key]
  return undefined
}

export type ChainKey = 'ethereum' | 'base' | 'optimism' | 'filecoin' | 'filecoinCalibration'

export interface ChainSpec {
  key: ChainKey
  id: number
  name: string
  short: string
  /** CORS-open public RPC, verified. */
  rpc: string
  /** Secondary, used only if the first fails. Also CORS-verified. */
  rpcFallback?: string
  explorer: string
  explorerAddress: (address: string) => string
  nativeSymbol: string
  /** Which of Haven's four roles this chain plays. */
  role: 'gate' | 'vault'
}

export const CHAINS: Record<ChainKey, ChainSpec> = {
  ethereum: {
    key: 'ethereum',
    id: 1,
    name: 'Ethereum',
    short: 'ETH',
    rpc: env('PUBLIC_RPC_ETHEREUM') ?? 'https://ethereum-rpc.publicnode.com',
    rpcFallback: 'https://cloudflare-eth.com',
    explorer: 'https://etherscan.io',
    explorerAddress: (a) => `https://etherscan.io/address/${a}`,
    nativeSymbol: 'ETH',
    role: 'gate',
  },
  base: {
    key: 'base',
    id: 8453,
    name: 'Base',
    short: 'BASE',
    rpc: env('PUBLIC_RPC_BASE') ?? 'https://mainnet.base.org',
    explorer: 'https://basescan.org',
    explorerAddress: (a) => `https://basescan.org/address/${a}`,
    nativeSymbol: 'ETH',
    role: 'gate',
  },
  optimism: {
    key: 'optimism',
    id: 10,
    name: 'OP Mainnet',
    short: 'OP',
    rpc: env('PUBLIC_RPC_OPTIMISM') ?? 'https://optimism.publicnode.com',
    explorer: 'https://optimistic.etherscan.io',
    explorerAddress: (a) => `https://optimistic.etherscan.io/address/${a}`,
    nativeSymbol: 'ETH',
    role: 'gate',
  },
  filecoin: {
    key: 'filecoin',
    id: 314,
    name: 'Filecoin',
    short: 'FIL',
    rpc: env('PUBLIC_RPC_FILECOIN') ?? 'https://api.node.glif.io/rpc/v1',
    explorer: 'https://filfox.info',
    explorerAddress: (a) => `https://filfox.info/en/address/${a}`,
    nativeSymbol: 'FIL',
    role: 'vault',
  },
  filecoinCalibration: {
    key: 'filecoinCalibration',
    id: 314159,
    name: 'Filecoin Calibration',
    short: 'tFIL',
    rpc: env('PUBLIC_RPC_FILECOIN_CALIBRATION') ?? 'https://api.calibration.node.glif.io/rpc/v1',
    explorer: 'https://calibration.filfox.info',
    explorerAddress: (a) => `https://calibration.filfox.info/en/address/${a}`,
    nativeSymbol: 'tFIL',
    role: 'vault',
  },
}

/** The Internet Computer gateway. Answers CORS `*` on /api/v2/status. */
export const ICP = {
  gateway: 'https://icp0.io',
  status: 'https://icp0.io/api/v2/status',
  canister: 'dciac-uaaaa-aaaad-qlzuq-cai',
  dashboard: 'https://dashboard.internetcomputer.org/canister/dciac-uaaaa-aaaad-qlzuq-cai',
} as const

/** Arkiv. Present in the design, not currently answering. */
/**
 * Arkiv's gas token. Writing an entity to the index is a transaction on an
 * OP-stack L3, and its gas is paid in GLM — Golem's token, since Arkiv is
 * Golem's chain. Reading the index costs nothing, so this concerns publishers and
 * founders only; a reader never needs it.
 *
 * The address is the mainnet ERC-20, verified by reading the contract: it reports
 * name "Golem Network Token", symbol GLM, 18 decimals. It is what a publisher
 * holds and bridges; the balance on the L3 itself cannot be read while the devnet
 * is offline.
 */
export const ARKIV_GAS = {
  symbol: 'GLM',
  name: 'Golem Network Token',
  chain: 'ethereum' as ChainKey,
  address: '0x7DD9c5Cba05E151C895FDe1CF355C9A1D5DA6429',
  decimals: 18,
} as const

/**
 * ARKIV — the metadata index, parameterised
 *
 * Arkiv's public networks are short-lived by design: Braga was retired at 23:59
 * CET on 12 August 2026, and the next public testnet is expected in September
 * 2026 under a new name. Every previous devnet has served its RPC, faucet and
 * explorer from one host on the same path convention, so this describes the host
 * once and derives the rest — when the next network lands, one string changes.
 *
 * `PUBLIC_ARKIV_HOST` overrides the host at build time, so a new devnet can be
 * pointed at without touching code, and `PUBLIC_ARKIV_STATUS` can mark it live
 * once it answers. The probe measures reality regardless of what is declared
 * here — this only decides what the interface CLAIMS, never what it reports.
 */
const ARKIV_HOST = env('PUBLIC_ARKIV_HOST') ?? 'braga.hoodi.arkiv.network'

/** 'live' once a public network answers; 'retired' while none does. */
const ARKIV_STATUS = (env('PUBLIC_ARKIV_STATUS') ?? 'retired') as
  | 'live'
  | 'retired'

export const ARKIV = {
  host: ARKIV_HOST,
  /** The network this host belonged to, for prose that needs to name it. */
  codename: env('PUBLIC_ARKIV_CODENAME') ?? 'Braga',

  /* Paths follow the convention observed across previous devnets. They are
     derived rather than listed so a new host brings all three with it. */
  rpc: `https://${ARKIV_HOST}/rpc`,
  faucet: `https://${ARKIV_HOST}/faucet/`,
  explorer: `https://${ARKIV_HOST}/`,

  /** The entity precompile. Chain-level, so it survives a host change. */
  precompile: '0x4400000000000000000000000000000000000044',

  status: ARKIV_STATUS,
  operational: ARKIV_STATUS === 'live',
  retiredOn: env('PUBLIC_ARKIV_RETIRED_ON') ?? '12 August 2026',
  nextPublicTestnet: env('PUBLIC_ARKIV_NEXT') ?? 'September 2026',

  /** Short enough for a badge. */
  get statusShort(): string {
    return this.status === 'live' ? 'Online' : 'No public network'
  },

  /** One sentence, so every surface says the same thing. */
  get statusNote(): string {
    return this.status === 'live'
      ? 'Public node answering. Entity records are resolvable to their gates.'
      : `${this.codename} was retired on ${this.retiredOn}. No public endpoint is available; the next public testnet is expected ${this.nextPublicTestnet}.`
  },
} as const

/**
 * Kept as an alias so nothing has to change twice. `ARKIV` is the descriptor to
 * reach for; this exists because the endpoint used to be all there was.
 */
export const ARKIV_ENDPOINT = ARKIV

/**
 * Filecoin Onchain Cloud — the storage economy Haven pays into.
 * Addresses from FilOzone/synapse-sdk `chains.ts` + generated deployments,
 * confirmed against both live nodes.
 */
export const STORAGE = {
  mainnet: {
    chain: 'filecoin' as ChainKey,
    usdfc: env('PUBLIC_FIL_USDFC') ?? '0x80B98d3aa09ffff255c3ba4A241111Ff1262F045',
    filecoinPay: env('PUBLIC_FIL_PAY') ?? '0x23b1e018F08BB982348b15a86ee926eEBf7F4DAa',
    warmStorage: env('PUBLIC_FIL_WARM') ?? '0x8408502033C418E1bbC97cE9ac48E5528F371A9f',
    warmStorageView: env('PUBLIC_FIL_WARM_VIEW') ?? '0xdDd8F083a3fe9C66547D46bee24e5AaF56BCa0ab',
    pdpVerifier: env('PUBLIC_FIL_PDP') ?? '0xBADd0B92C1c71d02E7d520f64c0876538fa2557F',
    providerRegistry: env('PUBLIC_FIL_REGISTRY') ?? '0xf55dDbf63F1b55c3F1D4FA7e339a68AB7b64A5eB',
    sessionKeyRegistry: env('PUBLIC_FIL_SESSION') ?? '0x74FD50525A958aF5d484601E252271f9625231aB',
  },
  calibration: {
    chain: 'filecoinCalibration' as ChainKey,
    usdfc: env('PUBLIC_CAL_USDFC') ?? '0xb3042734b608a1B16e9e86B374A3f3e389B4cDf0',
    filecoinPay: env('PUBLIC_CAL_PAY') ?? '0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0',
    warmStorage: env('PUBLIC_CAL_WARM') ?? '0x02925630df557F957f70E112bA06e50965417CA0',
    warmStorageView: env('PUBLIC_CAL_WARM_VIEW') ?? '0x9BF9e67e83EC8613883FDdDec4D3b38AEE937177',
    pdpVerifier: env('PUBLIC_CAL_PDP') ?? '0x85e366Cf9DD2c0aE37E963d9556F5f4718d6417C',
    providerRegistry: env('PUBLIC_CAL_REGISTRY') ?? '0x839e5c9988e4e9977d40708d0094103c0839Ac9D',
    sessionKeyRegistry: env('PUBLIC_CAL_SESSION') ?? '0x518411c2062E119Aaf7A8B12A2eDf9a939347655',
  },
} as const

/* ────────────────────────────────────────────────────────────────────────────
   THE ROSTER — candidate gates

   Every entry is a real, public, verified contract: each one answered name(),
   symbol() and totalSupply() from a public node before it was committed here.

   Read this as a roster of CANDIDATES, not of tenants. None of these communities
   has been signed up, and the interface never implies otherwise — what the Atlas
   shows is which real contracts already satisfy the gate criteria, and what an
   archive gated by each would be worth to open.

   The selection is deliberately niche. Putting a household-name collection on
   this list would be the least credible thing the design could do: those projects
   plainly do not run encrypted archives, and asserting they might would cost more
   trust than the recognition is worth. Every community below is small, real, and
   already in the business of producing or holding material worth keeping —
   animation, lore, on-chain art, member media, governance evidence.

   What is deliberately absent: infrastructure assets. FIL, ETH, OP and ICP are
   networks Haven runs on, not communities that keep archives. They are measured
   by operation — block height, round-trip, epoch — never by market value, because
   their price has no bearing on whether an archive holds.

   `threshold` is the gate parameter HAVEN applies — how much of the asset a
   reader must hold to derive a key. It is our parameter, not a policy any of
   these projects has adopted. Everything else is read live: name, symbol, supply
   and decimals from the contract; capitalisation from the market.
   ──────────────────────────────────────────────────────────────────────────── */

export interface GateSpec {
  /** Stable slug, used for routing and view-transition names. */
  slug: string
  address: string
  chain: ChainKey
  kind: 'collection' | 'token'
  /** Units of the asset a reader must hold to derive a key. */
  threshold: number
  /** Editorial one-liner: what a community like this would keep in an archive. */
  premise: string
  /** Constellation the community belongs to — used for Atlas grouping. */
  constellation: 'Lore' | 'Art' | 'Culture' | 'Governance'
}

export const GATES: readonly GateSpec[] = [
  /* ── Lore: communities whose output IS media ─────────────────────────── */
  {
    slug: 'forgotten-runes',
    address: '0x521f9C7505005CFA19A8E5786a9c3c9c9F5e6f42',
    chain: 'ethereum',
    kind: 'collection',
    threshold: 1,
    premise:
      'A cult that produces its own animation, lore and serialised film. Masters, stems and unreleased cuts are exactly the material that should never sit on a platform.',
    constellation: 'Lore',
  },
  {
    slug: 'chain-runners',
    address: '0x97597002980134beA46250Aa0510C9B90d87A587',
    chain: 'ethereum',
    kind: 'collection',
    threshold: 1,
    premise:
      'On-chain characters with a written world around them. The canon is community-authored, which makes the question of where it lives a governance question.',
    constellation: 'Lore',
  },
  {
    slug: 'mfers',
    address: '0x79FCDEF22feeD20eDDacbB2587640e45491b757f',
    chain: 'ethereum',
    kind: 'collection',
    threshold: 1,
    premise:
      'A CC0 culture that generates more derivative work than any single site could host. An archive its holders control is the only stable copy.',
    constellation: 'Lore',
  },
  {
    slug: 'opepen',
    address: '0x6339e5E072086621540D0362C4e3Cea0d643E114',
    chain: 'ethereum',
    kind: 'collection',
    threshold: 1,
    premise:
      'A long-running set release with process, revisions and correspondence behind it — the parts of an artwork that usually vanish.',
    constellation: 'Lore',
  },

  /* ── Art: the on-chain canon, and the people who hold it ─────────────── */
  {
    slug: 'autoglyphs',
    address: '0xd4e4078ca3495DE5B1d4dB434BEbc5a986197782',
    chain: 'ethereum',
    kind: 'collection',
    threshold: 1,
    premise:
      'Five hundred and twelve pieces of primary art-historical material. Provenance, scholarship and interviews belong with the holders, not with a gallery site.',
    constellation: 'Art',
  },
  {
    slug: 'blitmap',
    address: '0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63',
    chain: 'ethereum',
    kind: 'collection',
    threshold: 1,
    premise:
      'Community-composed art with a documented authorship chain. The source files matter as much as the outputs.',
    constellation: 'Art',
  },
  {
    slug: 'terraforms',
    address: '0x4E1f41613c9084FdB9E34E11fAE9412427480e56',
    chain: 'ethereum',
    kind: 'collection',
    threshold: 1,
    premise:
      'Fully on-chain terrain with a deep technical record behind it. The writing about the work is as scarce as the work.',
    constellation: 'Art',
  },
  {
    slug: 'superrare',
    address: '0xba5BDe662c17e2aDFF1075610382B9B691296350',
    chain: 'ethereum',
    kind: 'token',
    threshold: 2500,
    premise:
      'A curation DAO sitting on two decades of artist material at full resolution — the masters, not the transcodes.',
    constellation: 'Art',
  },

  /* ── Culture: social and creator communities ─────────────────────────── */
  {
    slug: 'fwb',
    address: '0x35bD01FC9d6D5D81CA9E055Db88Dc49aa2c699A8',
    chain: 'ethereum',
    kind: 'token',
    threshold: 75,
    premise:
      'A membership that has always been token-gated. Talks, sets and dinners recorded for members are the canonical case for an archive with a balance for a key.',
    constellation: 'Culture',
  },
  {
    slug: 'whale',
    address: '0x9355372396e3F6daF13359B7b607a3374cc638e0',
    chain: 'ethereum',
    kind: 'token',
    threshold: 500,
    premise:
      'A social token backed by a real collection. The vault has a story, and the story is worth more to members than to the public.',
    constellation: 'Culture',
  },
  {
    slug: 'rally',
    address: '0xf1f955016EcbCd7321c7266BccFB96c68ea5E49b',
    chain: 'ethereum',
    kind: 'token',
    threshold: 5000,
    premise:
      'Creator economies whose back catalogues outlived the platforms that hosted them. That is the failure this protocol exists to answer.',
    constellation: 'Culture',
  },
  {
    slug: 'audius',
    address: '0x18aAA7115705e8be94bfFEBDE57Af9BFc265B998',
    chain: 'ethereum',
    kind: 'token',
    threshold: 10000,
    premise:
      'Music, and the unreleased half of every catalogue. Stems and sessions are precisely what an artist will not upload anywhere.',
    constellation: 'Culture',
  },

  /* ── Governance: DAOs with a record worth keeping ────────────────────── */
  {
    slug: 'nouns',
    address: '0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03',
    chain: 'ethereum',
    kind: 'collection',
    threshold: 1,
    premise:
      'One vote, one holder, and a treasury that has funded hundreds of things. The evidence of what it funded is a public good with a private half.',
    constellation: 'Governance',
  },
  {
    slug: 'juicebox',
    address: '0x4554CC10898f92D45378b98D6D6c2dD54c687Fb2',
    chain: 'ethereum',
    kind: 'token',
    threshold: 100000,
    premise:
      'The funding rail for hundreds of small treasuries. Every campaign leaves records its contributors have a claim on.',
    constellation: 'Governance',
  },
  {
    slug: 'kleros',
    address: '0x93ED3FBe21207Ec2E8f2d3c3de6e058Cb73Bc04d',
    chain: 'ethereum',
    kind: 'token',
    threshold: 25000,
    premise:
      'Dispute resolution runs on evidence. Evidence needs to be encrypted, addressable, and readable only by the panel.',
    constellation: 'Governance',
  },
  {
    slug: 'radicle',
    address: '0x31c8EAcBFFdD875c74b94b077895Bd78CF1E64A3',
    chain: 'ethereum',
    kind: 'token',
    threshold: 1000,
    premise:
      'Sovereign code collaboration — a project already committed to the premise that infrastructure should not be able to remove your work.',
    constellation: 'Governance',
  },
] as const

/** Common ERC-20 / ERC-721 selectors. No ABI, no dependency, no bundle cost. */
export const SELECTOR = {
  name: '0x06fdde03',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  totalSupply: '0x18160ddd',
  balanceOf: '0x70a08231',
  contractURI: '0xe8a3d485',
  tokenURI: '0xc87b56dd',
} as const
