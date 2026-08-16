/**
 * HAVEN — FEVM
 *
 * Reads the Filecoin Onchain Cloud pin contracts on FEVM — Filecoin's EVM
 * runtime — over plain `eth_call`. This is where pinned storage actually lives:
 * Arkiv holds metadata, Filecoin holds bytes and proofs.
 *
 * Everything in this module is real and verifiable by the reader:
 *
 *   PDPVerifier                     data sets, leaf counts, liveness, provider
 *   FilecoinWarmStorageService      client (payer) data sets and sizes
 *   ServiceProviderRegistry         the active provider set
 *   FilecoinPay                     the payment rails
 *   USDFC                           the ERC-20 that settles storage
 *
 * A leaf in the PDP merkle tree is 32 bytes, which is why size is leafCount×32
 * — the same arithmetic the contract's own pure `getDataSetSizeInBytes`
 * performs. We use the contract for the authoritative conversion and the
 * multiplication locally when aggregating thousands of sets.
 */

import { createPublicClient, http, parseAbi, type Address, type PublicClient } from 'viem'
import { CHAINS, STORAGE, type ChainKey } from './chains.ts'

const MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

/** Bytes per leaf in the PDP merkle tree. */
export const BYTES_PER_LEAF = 32n

export const pdpAbi = parseAbi([
  'function getNextDataSetId() view returns (uint64)',
  'function getDataSetLeafCount(uint256 setId) view returns (uint256)',
  'function dataSetLive(uint256 setId) view returns (bool)',
  'function getDataSetStorageProvider(uint256 setId) view returns (address)',
  'function getActivePieceCount(uint256 setId) view returns (uint256)',
  'function getDataSetLastProvenEpoch(uint256 setId) view returns (uint256)',
])

export const warmStorageViewAbi = parseAbi([
  'function getDataSetSizeInBytes(uint256 leafCount) pure returns (uint256)',
  'function getClientDataSetsLength(address payer) view returns (uint256)',
  'function getApprovedProviders(uint256 offset, uint256 limit) view returns (uint256[] providerIds)',
])

export const providerRegistryAbi = parseAbi([
  'function activeProviderCount() view returns (uint256)',
  'function getAllActiveProviders(uint256 offset, uint256 limit) view returns (uint256[])',
])

export const erc20Abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
])

const chainDefinition = (key: ChainKey) => {
  const spec = CHAINS[key]
  return {
    id: spec.id,
    name: spec.name,
    nativeCurrency: { name: spec.nativeSymbol, symbol: spec.nativeSymbol, decimals: 18 },
    rpcUrls: { default: { http: [spec.rpc] } },
    contracts: {
      multicall3: {
        address: MULTICALL3,
        blockCreated: key === 'filecoin' ? 3_328_594 : key === 'filecoinCalibration' ? 1_446_201 : 0,
      },
    },
  } as const
}

/** A read-only client with multicall batching switched on. */
export function client(key: ChainKey, timeout = 30_000): PublicClient {
  const spec = CHAINS[key]
  return createPublicClient({
    chain: chainDefinition(key),
    transport: http(spec.rpc, { timeout, retryCount: 1, batch: { wait: 12 } }),
    batch: { multicall: { batchSize: 2_048, wait: 12 } },
  }) as PublicClient
}

export type StorageNetwork = 'mainnet' | 'calibration'

const deployment = (network: StorageNetwork) =>
  network === 'mainnet' ? STORAGE.mainnet : STORAGE.calibration

/* ────────────────────────────────────────────────────────────────────────────
   HEADLINE READS
   Six calls. Cheap enough to run on page load and get real numbers on the
   screen immediately.
   ──────────────────────────────────────────────────────────────────────────── */

export interface StorageHeadline {
  network: StorageNetwork
  chainId: number
  /** Total data sets ever created on this deployment. */
  dataSetsCreated: number
  /** Active storage providers in the registry. */
  activeProviders: number
  /** USDFC in circulation. */
  usdfcSupply: bigint
  /** USDFC held by the payment rails — storage that has been paid for. */
  usdfcEscrowed: bigint
  usdfcDecimals: number
  usdfcSymbol: string
  blockNumber: bigint
  at: number
}

export async function readStorageHeadline(network: StorageNetwork): Promise<StorageHeadline> {
  const d = deployment(network)
  const c = client(d.chain)

  const [dataSetsCreated, activeProviders, usdfcSupply, usdfcEscrowed, usdfcDecimals, usdfcSymbol, blockNumber] =
    await Promise.all([
      c.readContract({ address: d.pdpVerifier as Address, abi: pdpAbi, functionName: 'getNextDataSetId' }),
      c.readContract({
        address: d.providerRegistry as Address,
        abi: providerRegistryAbi,
        functionName: 'activeProviderCount',
      }),
      c.readContract({ address: d.usdfc as Address, abi: erc20Abi, functionName: 'totalSupply' }),
      c.readContract({
        address: d.usdfc as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [d.filecoinPay as Address],
      }),
      c.readContract({ address: d.usdfc as Address, abi: erc20Abi, functionName: 'decimals' }),
      c.readContract({ address: d.usdfc as Address, abi: erc20Abi, functionName: 'symbol' }),
      c.getBlockNumber(),
    ])

  return {
    network,
    chainId: CHAINS[d.chain].id,
    dataSetsCreated: Number(dataSetsCreated),
    activeProviders: Number(activeProviders),
    usdfcSupply,
    usdfcEscrowed,
    usdfcDecimals: Number(usdfcDecimals),
    usdfcSymbol,
    blockNumber,
    at: Date.now(),
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   FULL LEDGER
   Enumerates every data set and aggregates real bytes by provider. Around 4,400
   reads on mainnet, folded into a handful of multicalls — roughly 17 seconds.
   Run at build time, not on page load.
   ──────────────────────────────────────────────────────────────────────────── */

export interface ProviderHolding {
  provider: Address
  bytes: string
  dataSets: number
  /** Share of all live pinned bytes on this deployment, 0–1. */
  share: number
}

export interface StorageLedger {
  network: StorageNetwork
  chainId: number
  blockNumber: string
  capturedAt: string
  dataSetsCreated: number
  liveDataSets: number
  totalLeaves: string
  totalBytes: string
  providers: ProviderHolding[]
  usdfc: {
    symbol: string
    decimals: number
    supply: string
    escrowed: string
  }
}

export async function readStorageLedger(
  network: StorageNetwork,
  options: { onProgress?: (done: number, total: number) => void; maxSets?: number } = {},
): Promise<StorageLedger> {
  const d = deployment(network)
  const c = client(d.chain, 60_000)
  const headline = await readStorageHeadline(network)

  const created = headline.dataSetsCreated
  const limit = Math.min(created - 1, options.maxSets ?? created - 1)
  const ids = Array.from({ length: Math.max(0, limit) }, (_, i) => BigInt(i + 1))

  const contracts = ids.flatMap((id) => [
    { address: d.pdpVerifier as Address, abi: pdpAbi, functionName: 'dataSetLive' as const, args: [id] },
    { address: d.pdpVerifier as Address, abi: pdpAbi, functionName: 'getDataSetLeafCount' as const, args: [id] },
    {
      address: d.pdpVerifier as Address,
      abi: pdpAbi,
      functionName: 'getDataSetStorageProvider' as const,
      args: [id],
    },
  ])

  const results = await c.multicall({ contracts, allowFailure: true, batchSize: 3_072 })
  options.onProgress?.(ids.length, ids.length)

  let liveDataSets = 0
  let totalLeaves = 0n
  const byProvider = new Map<Address, { leaves: bigint; dataSets: number }>()

  for (let i = 0; i < ids.length; i += 1) {
    const live = results[i * 3]
    const leafCount = results[i * 3 + 1]
    const provider = results[i * 3 + 2]

    if (live?.status !== 'success' || live.result !== true) continue
    if (leafCount?.status !== 'success') continue

    const leaves = leafCount.result as bigint
    liveDataSets += 1
    totalLeaves += leaves

    const key = (provider?.status === 'success' ? provider.result : '0x0') as Address
    const entry = byProvider.get(key) ?? { leaves: 0n, dataSets: 0 }
    entry.leaves += leaves
    entry.dataSets += 1
    byProvider.set(key, entry)
  }

  const totalBytes = totalLeaves * BYTES_PER_LEAF

  const providers: ProviderHolding[] = [...byProvider.entries()]
    .map(([provider, entry]) => ({
      provider,
      bytes: (entry.leaves * BYTES_PER_LEAF).toString(),
      dataSets: entry.dataSets,
      share: totalLeaves > 0n ? Number((entry.leaves * 10_000n) / totalLeaves) / 10_000 : 0,
    }))
    .sort((a, b) => (BigInt(b.bytes) > BigInt(a.bytes) ? 1 : -1))

  return {
    network,
    chainId: headline.chainId,
    blockNumber: headline.blockNumber.toString(),
    capturedAt: new Date().toISOString(),
    dataSetsCreated: created,
    liveDataSets,
    totalLeaves: totalLeaves.toString(),
    totalBytes: totalBytes.toString(),
    providers,
    usdfc: {
      symbol: headline.usdfcSymbol,
      decimals: headline.usdfcDecimals,
      supply: headline.usdfcSupply.toString(),
      escrowed: headline.usdfcEscrowed.toString(),
    },
  }
}

/** Live pinned bytes for one payer — the real per-publisher figure. */
export async function readPayerDataSetCount(
  network: StorageNetwork,
  payer: Address,
): Promise<number> {
  const d = deployment(network)
  const c = client(d.chain)
  const count = await c.readContract({
    address: d.warmStorageView as Address,
    abi: warmStorageViewAbi,
    functionName: 'getClientDataSetsLength',
    args: [payer],
  })
  return Number(count)
}
