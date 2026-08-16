/**
 * HAVEN — PROTOCOL FACTS
 *
 * The protocol is solidified; this file is its typed transcription. Every claim
 * the site makes about addresses, methods, preimages, languages or topology is
 * read from here, so the design surfaces can never drift from the spec.
 *
 * Source of record:
 *   arkiv-op-reth/contracts/src/EntityRegistry.sol   (entity contract)
 *   haven-aol/src/backend/{main.mo,backend.did}      (gate + VetKD)
 *   docs/architecture/*.md, docs/entities/*.md       (reviewed extracts)
 */

// Aliased: this module already exports its own ARKIV record, and that name
// belongs to the solidified protocol description rather than to the endpoint.
import { ARKIV as ARKIV_NETWORK } from './chains.ts'

export type NetworkId = 'arkiv' | 'icp' | 'evm' | 'filecoin'

export interface Network {
  id: NetworkId
  /** Display name, as it should be typeset. */
  name: string
  /** One-line role in the protocol. */
  role: string
  /** The thing it is authoritative for. */
  owns: string
  /** Canonical identifier — precompile, canister, or contract. */
  identifier: string
  identifierLabel: string
  /** Public endpoint a reader can verify against. */
  endpoint: string
  explorer: string
  /** OSI-ish layer this network provides to Haven. */
  layer: string
  /** Design token holding this network's hue. */
  hue: `var(--color-${NetworkId})`
}

export const NETWORKS: readonly Network[] = [
  {
    id: 'arkiv',
    name: 'Arkiv OP L3',
    role: 'The index',
    owns: 'Entity records, attributes, ordering',
    identifier: '0x4400000000000000000000000000000000000044',
    identifierLabel: 'Precompile',
    endpoint: ARKIV_NETWORK.rpc,
    explorer: ARKIV_NETWORK.explorer,
    layer: 'L1–L3 · State',
    hue: 'var(--color-arkiv)',
  },
  {
    id: 'icp',
    name: 'DFINITY ICP',
    role: 'The gate',
    owns: 'VetKD derivation, EIP-712 recovery, approvals',
    identifier: 'dciac-uaaaa-aaaad-qlzuq-cai',
    identifierLabel: 'Canister',
    endpoint: 'https://icp0.io',
    explorer: 'https://dashboard.internetcomputer.org/canister/dciac-uaaaa-aaaad-qlzuq-cai',
    layer: 'L5–L6 · Session',
    hue: 'var(--color-icp)',
  },
  {
    id: 'evm',
    name: 'Any EVM',
    role: 'The criterion',
    owns: 'Ownership truth — balances and holders',
    identifier: 'balanceOf · ownerOf',
    identifierLabel: 'eth_call',
    endpoint: 'https://base.meowrpc.com',
    explorer: 'https://basescan.org',
    layer: 'L1 · Settlement',
    hue: 'var(--color-evm)',
  },
  {
    id: 'filecoin',
    name: 'Filecoin FEVM · IPFS',
    role: 'The vault',
    owns: 'Ciphertext bytes, pin proofs, payment',
    identifier: '0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0',
    identifierLabel: 'filecoin-pay',
    endpoint: 'https://api.calibration.node.glif.io/rpc/v1',
    explorer: 'https://calibration.filfox.info/en/address/0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0',
    layer: 'L1–L2 · Storage',
    hue: 'var(--color-filecoin)',
  },
] as const

/** Filecoin Onchain Cloud contracts on calibration (chain 314159). */
export const FILECOIN = {
  chainId: 314159,
  chainName: 'Filecoin Calibration',
  filecoinPay: '0x09a0fDc2723fAd1A7b8e3e00eE5DF73841df55a0',
  warmStorage: '0x02925630df557F957f70E112bA06e50965417CA0',
  explorerAddress: (addr: string) => `https://calibration.filfox.info/en/address/${addr}`,
} as const

export const ARKIV = {
  precompile: '0x4400000000000000000000000000000000000044',
  contract: 'EntityRegistry.sol',
  sdk: '@arkiv-network/sdk',
  sdkVersion: '0.7.0',
  rpc: ARKIV_NETWORK.rpc,
  rpcFallback: 'https://braga.arkiv.network/rpc',
  methods: ['arkiv_query', 'arkiv_getEntityCount', 'arkiv_getBlockTiming'] as const,
  stateStructures: 'roaring64 bitmaps + adaptive radix tree',
} as const

export const AOL = {
  canister: 'dciac-uaaaa-aaaad-qlzuq-cai',
  language: 'Motoko',
  epochSeconds: 2_592_000,
  approvalTtlDays: 30,
  batchLimit: 20,
  contexts: { v1: 'accessol_v1', v3: 'accessol_v3' },
  validChains: [
    'EthMainnet',
    'EthSepolia',
    'BaseMainnet',
    'ArbitrumOne',
    'OptimismMainnet',
  ] as const,
} as const

/** ─── The five surfaces ───────────────────────────────────────────────────
 * Every client is a thin obeyer of the same rule set. No shared private
 * backend, no shared library — only the contracts below.
 */
export interface Surface {
  id: string
  name: string
  language: string
  languageDetail: string
  role: string
  owns: string
  doesNotOwn: string
  talksTo: readonly NetworkId[]
  artifact: string
}

export const SURFACES: readonly Surface[] = [
  {
    id: 'arkiv-chain',
    name: 'arkiv-chain',
    language: 'Rust',
    languageDetail: 'reth + precompile',
    role: 'Entity contract',
    owns: 'The state trie, operation decoding, query interpreter',
    doesNotOwn: 'Keys, media bytes, payment',
    talksTo: ['arkiv'],
    artifact: 'crates/arkiv-entitydb',
  },
  {
    id: 'haven-aol',
    name: 'haven-aol',
    language: 'Motoko',
    languageDetail: '+ TypeScript / Python SDKs',
    role: 'Always-online gate',
    owns: 'VetKD derivation, EIP-712 verification, balance checks, approval cache',
    doesNotOwn: 'UI, uploads, storage',
    talksTo: ['icp', 'evm'],
    artifact: 'src/backend/main.mo',
  },
  {
    id: 'haven-dapp',
    name: 'haven-dapp',
    language: 'TypeScript',
    languageDetail: 'Next.js 15',
    role: 'Web reader',
    owns: 'Discovery, decryption in the client, playback',
    doesNotOwn: 'Keys at rest, indexing, pinning',
    talksTo: ['arkiv', 'icp', 'filecoin'],
    artifact: 'src/lib/arkiv.ts',
  },
  {
    id: 'haven-cli',
    name: 'haven-cli',
    language: 'Python',
    languageDetail: '3.11+, permissionless-local',
    role: 'Publisher',
    owns: 'Encryption, media pipeline, pin submission, archival',
    doesNotOwn: 'Decryption, gating policy',
    talksTo: ['arkiv', 'icp', 'filecoin'],
    artifact: 'haven_cli/media/arkiv_sync.py',
  },
  {
    id: 'haven-mobile',
    name: 'haven-mobile',
    language: 'Kotlin',
    languageDetail: 'Compose · Media3 · Room',
    role: 'Offline-first viewer',
    owns: 'Local cache, offline playback, foreground sync',
    doesNotOwn: 'Publishing, key custody',
    talksTo: ['icp', 'arkiv'],
    artifact: 'build.gradle.kts',
  },
] as const

/** ─── Layered protocol ────────────────────────────────────────────────────
 * Haven is not a chain. It is an application-layer protocol that composes four
 * public networks as its lower layers and defines exactly one rule set on top.
 */
export interface ProtocolLayer {
  tier: string
  title: string
  provider: string
  havenDefines: string
  networks: readonly NetworkId[]
}

export const LAYERS: readonly ProtocolLayer[] = [
  {
    tier: 'L1–L3',
    title: 'Network · Consensus · Storage',
    provider:
      'Arkiv OP L3 entity trie, ICP subnet consensus, any EVM chain, Filecoin FEVM and IPFS',
    havenDefines:
      'Nothing. These layers see bytes, an eth_call and an ecrecover — no Haven semantics whatsoever.',
    networks: ['arkiv', 'icp', 'evm', 'filecoin'],
  },
  {
    tier: 'L5–L6',
    title: 'Session · Presentation',
    provider:
      'haven-aol EIP-712 GateRequest / GateRequestV3, VetKD contexts, Ed25519 attestations, contractURI resolution',
    havenDefines:
      'How a reader proves holding and derives a key, and how a community’s identity image is resolved. The session key is scoped to (chain, token, threshold, epoch).',
    networks: ['icp', 'evm'],
  },
  {
    tier: 'L7',
    title: 'Application — Haven',
    provider:
      'Entity shape, gate rule, attestation over cidHash, holder identity',
    havenDefines:
      'The protocol itself: content is a CID on Filecoin, gated by a public token, discovered through Arkiv, and identity is the collection’s own image.',
    networks: ['arkiv', 'icp', 'evm', 'filecoin'],
  },
] as const

/** ─── The four movements ──────────────────────────────────────────────────
 * The lifecycle of one piece of content, and the exact primitive each step uses.
 */
export interface Movement {
  index: number
  key: string
  title: string
  actor: string
  claim: string
  detail: string
  primitive: string
  code: string
  network: NetworkId
}

export const MOVEMENTS: readonly Movement[] = [
  {
    index: 1,
    key: 'seal',
    title: 'Seal',
    actor: 'haven-cli',
    claim: 'The bytes are encrypted before they ever leave the machine.',
    detail:
      'Media is encrypted locally under a symmetric key. Only ciphertext is ever handed to a network, so no operator anywhere in the path — including Haven — is in a position to read it.',
    primitive: 'AES · local keying',
    code: `haven publish ./film.mp4 \\
  --gate-chain BaseMainnet \\
  --gate-token 0xBC4C…f13D \\
  --gate-threshold 1

→ ciphertext  ipfs://bafy…
→ cid_hash    0x9f2c…a41e`,
    network: 'filecoin',
  },
  {
    index: 2,
    key: 'register',
    title: 'Register',
    actor: 'arkiv-chain',
    claim: 'The record is written to a public trie, not a private table.',
    detail:
      'One atomic batch of operations writes the entity: its key, its attributes, its content type and its time-to-live. The state trie is the index — there is no separate database to fall out of sync with it.',
    primitive: 'execute(Operation[]) · 0x44…0044',
    code: `execute([{
  operationType: 1,             // CREATE
  entityKey:     0x…,
  contentType:   Mime128("video/mp4"),
  attributes: [
    { name: "project",        value: "haven" },
    { name: "gate_chain",     value: "BaseMainnet" },
    { name: "gate_token",     value: "0xBC4C…f13D" },
    { name: "gate_threshold", value: 1 },
    { name: "cid_hash",       value: 0x9f2c…a41e }
  ],
  btl: 2_592_000
}])`,
    network: 'arkiv',
  },
  {
    index: 3,
    key: 'gate',
    title: 'Gate',
    actor: 'haven-aol',
    claim: 'The key is derived from what you hold, and nothing else.',
    detail:
      'A reader signs a typed request. The canister recovers the address, asks a public chain whether that address meets the threshold, and only then derives a key from the network’s own threshold material. There is no account, no password and no session to steal.',
    primitive: 'GateRequestV3 · VetKD accessol_v3',
    code: `requestDecryptionKeyV3({
  evmAddress:         0xa11c…9e3f,
  transportPublicKey: 0x…,
  epoch:              floor(now / 2_592_000),
  nonce:              7
})

ecrecover  → 0xa11c…9e3f
eth_call   → balanceOf ≥ threshold
derive     → SHA-256("accessol_v3:"
             + chain + ":" + token
             + ":" + threshold
             + ":" + effectiveEpoch)`,
    network: 'icp',
  },
  {
    index: 4,
    key: 'open',
    title: 'Open',
    actor: 'haven-dapp',
    claim: 'Decryption happens on your device. Nowhere else.',
    detail:
      'The ciphertext arrives from IPFS, the key material arrives from the canister, and they meet for the first time inside your client. Revoke the holding and the next epoch simply never derives.',
    primitive: 'arkiv_query · local unwrap',
    code: `const entities = await arkiv.query({
  attributes: { project: "haven",
                gate_token: token },
  includePayload: true
})

const key = await unwrap(ciphertext,
                        transportSecret)
await play(decrypt(bytes, key))`,
    network: 'arkiv',
  },
] as const

/** ─── Contract surface ────────────────────────────────────────────────────
 * The complete public API between surfaces. There is no other channel.
 */
export interface ContractMethod {
  name: string
  kind: 'update' | 'query' | 'call' | 'rpc'
  note: string
}

export const CANDID_METHODS: readonly ContractMethod[] = [
  { name: 'requestDecryptionKey', kind: 'update', note: 'GateRequest → balance check → VetKD v1 ciphertext' },
  { name: 'batchRequestDecryptionKey', kind: 'update', note: 'Up to 20 CIDs, one balance check, N derivations' },
  { name: 'requestDecryptionKeyV3', kind: 'update', note: 'GateRequestV3 — epoch-scoped, cache or balance' },
  { name: 'batchRequestDecryptionKeyV3', kind: 'update', note: 'Up to 20 CIDs, one derivation replicated' },
  { name: 'getVetKDPublicKey', kind: 'query', note: 'Cached v1 public key' },
  { name: 'getVetKDPublicKeyV3', kind: 'query', note: 'Distinct v3 key, accessol_v3 context' },
  { name: 'warmupVetKDPublicKey', kind: 'update', note: 'Populates the v1 cache' },
  { name: 'warmupVetKDPublicKeyV3', kind: 'update', note: 'Populates the v3 cache' },
  { name: 'getCurrentEpoch', kind: 'query', note: 'floor(unix / 2_592_000)' },
  { name: 'evictExpiredApprovals', kind: 'update', note: 'Controller-only janitor' },
] as const

export const TYPED_DATA = {
  v1: 'GateRequest(address evmAddress, bytes transportPublicKey, uint256 nonce)',
  v3: 'GateRequestV3(address evmAddress, bytes transportPublicKey, uint256 epoch, uint256 nonce)',
  recovery: 'secp256k1 ecrecover, implemented in Motoko — no precompile',
} as const

export const PREIMAGES = {
  v1: 'SHA-256("accessol:" + chain + ":" + token + ":" + threshold + ":" + cid)',
  v3: 'SHA-256("accessol_v3:" + chain + ":" + token + ":" + threshold + ":" + effectiveEpoch)',
  attest: 'HAVEN_ATTEST_V1:{chain}:{token}:{threshold}:{evmAddress}:{cidHash}:{timestamp}:{balance}',
  batchAttest: 'HAVEN_BATCH_ATTEST_V1:{…}:{merkleRoot}:{cidCount}',
} as const

/** Selectors used to resolve a community's own identity image, with no API key. */
export const SELECTORS = {
  contractURI: '0xe8a3d485',
  tokenURI: '0xc87b56dd',
  gateway: 'ipfs:// → https://ipfs.io/ipfs/',
} as const

/** ─── Entity shape ────────────────────────────────────────────────────────
 * The shared container. Every surface uses this verbatim; there is no second
 * definition in any language.
 */
export const ENTITY_TYPES = [
  { name: 'Ident32', definition: 'bytes32', note: '≤32 bytes, lowercase a–z0–9_./-, validated in the precompile' },
  { name: 'Mime128', definition: 'bytes32[4]', note: '128-byte content type, zero-padded, validated' },
  { name: 'BlockNumber32', definition: 'uint32', note: 'Distinct type for btl and expiresAt' },
] as const

export const ATTRIBUTE_KINDS = [
  { code: 1, name: 'ATTR_UINT', note: 'value[0] only, remaining words zero' },
  { code: 2, name: 'ATTR_STRING', note: '128-byte, zero-padded, no embedded null' },
  { code: 3, name: 'ATTR_ENTITY_KEY', note: 'value[0] only, references another entity' },
] as const

export const OPERATIONS = [
  { code: 1, name: 'CREATE' },
  { code: 2, name: 'UPDATE' },
  { code: 3, name: 'EXTEND' },
  { code: 4, name: 'TRANSFER' },
  { code: 5, name: 'DELETE' },
  { code: 6, name: 'EXPIRE' },
] as const

/** ─── Topology ────────────────────────────────────────────────────────────
 * Verified by graph build: five services, zero private datastores.
 */
export const TOPOLOGY = {
  services: 5,
  privateDatastores: 0,
  publicNetworks: 4,
  languages: ['Rust', 'Motoko', 'TypeScript', 'Python', 'Kotlin'] as const,
  sharedTypes: 0,
} as const

/** ─── Horizon ─────────────────────────────────────────────────────────────
 * Where the protocol is, and what it is for. Phases, not dates — the shape of
 * the work rather than a promise about a quarter.
 */
export interface Phase {
  mark: string
  title: string
  state: 'live' | 'active' | 'next' | 'horizon'
  body: string
}

export const HORIZON: readonly Phase[] = [
  {
    mark: 'I',
    title: 'The record stands',
    state: 'live',
    body:
      'The entity contract is live behind the precompile, the gate is live on a mainnet canister, and five independent clients read and write the same rule set with no shared backend between them.',
  },
  {
    mark: 'II',
    title: 'The archive fills',
    state: 'active',
    body:
      'Encrypted libraries accumulate against real gating tokens. Pin proofs and payment settle on Filecoin, and the Atlas begins to show storage that exists rather than storage that is promised.',
  },
  {
    mark: 'III',
    title: 'The key travels',
    state: 'next',
    body:
      'Epoch-scoped derivation makes access portable across every surface a person owns — desktop, phone, terminal — without a single credential moving between them.',
  },
  {
    mark: 'IV',
    title: 'The commons hold',
    state: 'horizon',
    body:
      'Communities operate their own archives at institutional scale: their own gate, their own storage economics, their own canon — and no operator, including us, able to take any of it away.',
  },
] as const

/** ─── Positioning ─────────────────────────────────────────────────────────
 * The five claims the whole design has to earn. Kept here so headline copy and
 * documentation cannot contradict each other.
 */
export const CLAIMS = [
  {
    figure: '00',
    label: 'No private backend',
    body: 'Five services, zero private datastores. Every byte of shared state is on a public network.',
  },
  {
    figure: '01',
    label: 'Encrypted at the source',
    body: 'Media is sealed on the publisher’s machine. Ciphertext is the only thing any network ever sees.',
  },
  {
    figure: '02',
    label: 'Ownership is the credential',
    body: 'A public balance is the whole authorisation model. No accounts, no passwords, no sessions.',
  },
  {
    figure: '03',
    label: 'Identity is inherited',
    body: 'A community’s image is read from its own contract — so identity needs no directory to administer it.',
  },
  {
    figure: '04',
    label: 'Nothing to shut down',
    body: 'The index is a trie, the gate is a canister, the vault is Filecoin. There is no server to seize.',
  },
] as const

export const HAVEN = {
  name: 'Haven',
  descriptor: 'Sovereign Media Protocol',
  tier: 'Application layer · L7',
  thesis: 'Ownership is the only password.',
  established: '2026',
  version: 'v3',
} as const
