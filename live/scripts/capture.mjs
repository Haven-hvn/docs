/**
 * HAVEN — BUILD-TIME CAPTURE
 *
 * Two datasets are captured before the site is built, because both are too slow
 * or too rate-limited to fetch on page load:
 *
 *   1. THE STORAGE LEDGER — every data set on the FEVM pin contracts, with real
 *      leaf counts and real storage providers, aggregated into per-provider
 *      holdings. Roughly 4,400 `eth_call`s folded into a handful of multicalls.
 *
 *   2. COLLECTION QUOTES — market capitalisation and floor for each NFT gate.
 *      The public market endpoint allows about two calls a minute, so these are
 *      fetched with spacing here rather than in the reader's browser.
 *
 * Both are written with an explicit block number and timestamp, and the
 * interface prints that stamp next to the figures. Nothing here is invented: if
 * a read fails the field is omitted and the UI says the value is unavailable.
 *
 * This is a data pipeline, not a fallback. Live values that CAN be read cheaply
 * at runtime are read at runtime and supersede these.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, http, parseAbi } from 'viem'
import { CHAINS, STORAGE } from '../src/lib/chains.ts'

const here = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(here, '../src/data')

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11'
const BYTES_PER_LEAF = 32n

/**
 * Deployment config, derived from the site's own chain table.
 *
 * This used to be a second copy of every address and RPC. Two copies of the same
 * contract set is a drift waiting to happen: repointing the site would silently
 * leave the capture reading the old deployment, and the figures would be wrong
 * without anything failing. `chains.ts` now reads its environment in a way that
 * works under plain Node, so there is one table and this derives from it —
 * including any PUBLIC_* override, which means a captured ledger always describes
 * the deployment the site is configured for.
 *
 * Only the multicall deployment blocks live here, because they are a property of
 * this script's batching rather than of the protocol.
 */
const MULTICALL_BLOCK = { mainnet: 3_328_594, calibration: 1_446_201 }

const DEPLOYMENTS = Object.fromEntries(
  ['mainnet', 'calibration'].map((name) => {
    const store = STORAGE[name]
    const chain = CHAINS[store.chain]
    return [
      name,
      {
        chainId: chain.id,
        rpc: chain.rpc,
        multicallBlock: MULTICALL_BLOCK[name],
        pdpVerifier: store.pdpVerifier,
        warmStorageView: store.warmStorageView,
        providerRegistry: store.providerRegistry,
        filecoinPay: store.filecoinPay,
        usdfc: store.usdfc,
      },
    ]
  }),
)

const pdpAbi = parseAbi([
  'function getNextDataSetId() view returns (uint64)',
  'function getDataSetLeafCount(uint256 setId) view returns (uint256)',
  'function dataSetLive(uint256 setId) view returns (bool)',
  'function getDataSetStorageProvider(uint256 setId) view returns (address)',
])
/**
 * FilecoinWarmStorageStateView.getDataSet returns a thirteen-word record. Only
 * the first six fields are named here because only those are needed and only
 * those have been verified against live data; the remainder are declared
 * positionally so the decode stays aligned without inventing meanings.
 *
 * Field 3 — `payer` — is the uploader: the address that paid to pin the set. It
 * was identified by taking the address in that slot and confirming the contract's
 * own `getClientDataSets(payer)` returns the set back, rather than by assuming a
 * struct layout. Field 4 matches `PDPVerifier.getDataSetStorageProvider`.
 */
const warmStorageViewAbi = parseAbi([
  'function getDataSet(uint256 id) view returns (uint256 pdpRailId, uint256 cacheMissRailId, uint256 cdnRailId, address payer, address serviceProvider, address payee, uint256 w6, uint256 clientDataSetId, uint256 w8, address w9, uint256 w10, uint256 w11, uint256 w12)',
])

const registryAbi = parseAbi(['function activeProviderCount() view returns (uint256)'])
const erc20Abi = parseAbi([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
])

function makeClient(d) {
  return createPublicClient({
    chain: {
      id: d.chainId,
      name: `filecoin-${d.chainId}`,
      nativeCurrency: { name: 'FIL', symbol: 'FIL', decimals: 18 },
      rpcUrls: { default: { http: [d.rpc] } },
      contracts: { multicall3: { address: MULTICALL3, blockCreated: d.multicallBlock } },
    },
    transport: http(d.rpc, { timeout: 90_000, retryCount: 2 }),
    batch: { multicall: { batchSize: 2_048, wait: 16 } },
  })
}

async function captureLedger(network) {
  const d = DEPLOYMENTS[network]
  const client = makeClient(d)
  const started = Date.now()

  const [nextId, activeProviders, symbol, decimals, supply, escrowed, blockNumber] = await Promise.all([
    client.readContract({ address: d.pdpVerifier, abi: pdpAbi, functionName: 'getNextDataSetId' }),
    client
      .readContract({ address: d.providerRegistry, abi: registryAbi, functionName: 'activeProviderCount' })
      .catch(() => null),
    client.readContract({ address: d.usdfc, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address: d.usdfc, abi: erc20Abi, functionName: 'decimals' }),
    client.readContract({ address: d.usdfc, abi: erc20Abi, functionName: 'totalSupply' }),
    client.readContract({ address: d.usdfc, abi: erc20Abi, functionName: 'balanceOf', args: [d.filecoinPay] }),
    client.getBlockNumber(),
  ])

  const created = Number(nextId)
  const ids = Array.from({ length: Math.max(0, created - 1) }, (_, i) => BigInt(i + 1))

  const contracts = ids.flatMap((id) => [
    { address: d.pdpVerifier, abi: pdpAbi, functionName: 'dataSetLive', args: [id] },
    { address: d.pdpVerifier, abi: pdpAbi, functionName: 'getDataSetLeafCount', args: [id] },
    { address: d.pdpVerifier, abi: pdpAbi, functionName: 'getDataSetStorageProvider', args: [id] },
    { address: d.warmStorageView, abi: warmStorageViewAbi, functionName: 'getDataSet', args: [id] },
  ])

  console.log(`[capture:${network}] ${created - 1} data sets → ${contracts.length} reads`)
  const results = await client.multicall({ contracts, allowFailure: true, batchSize: 3_072 })

  const ZERO = '0x0000000000000000000000000000000000000000'

  let liveDataSets = 0
  let totalLeaves = 0n
  // Bytes with no payer on record: sets registered straight against the verifier
  // rather than through WarmStorage, so no address can be charged with them.
  let unattributedLeaves = 0n
  let unattributedSets = 0
  const byProvider = new Map()
  const byUploader = new Map()

  const STRIDE = 4
  for (let i = 0; i < ids.length; i += 1) {
    const live = results[i * STRIDE]
    const leaf = results[i * STRIDE + 1]
    const provider = results[i * STRIDE + 2]
    const record = results[i * STRIDE + 3]
    if (live?.status !== 'success' || live.result !== true) continue
    if (leaf?.status !== 'success') continue

    const leaves = leaf.result
    liveDataSets += 1
    totalLeaves += leaves

    const providerKey = provider?.status === 'success' ? provider.result : 'unknown'
    const entry = byProvider.get(providerKey) ?? { leaves: 0n, dataSets: 0 }
    entry.leaves += leaves
    entry.dataSets += 1
    byProvider.set(providerKey, entry)

    // ── The demand side ──
    const payer = record?.status === 'success' ? record.result[3] : ZERO
    if (!payer || payer === ZERO) {
      unattributedLeaves += leaves
      unattributedSets += 1
      continue
    }
    const up = byUploader.get(payer) ?? { leaves: 0n, dataSets: 0, providers: new Set() }
    up.leaves += leaves
    up.dataSets += 1
    if (providerKey !== 'unknown') up.providers.add(providerKey)
    byUploader.set(payer, up)
  }

  const totalBytes = totalLeaves * BYTES_PER_LEAF
  const providers = [...byProvider.entries()]
    .map(([provider, entry]) => ({
      provider,
      bytes: (entry.leaves * BYTES_PER_LEAF).toString(),
      dataSets: entry.dataSets,
      share: totalLeaves > 0n ? Number((entry.leaves * 100_000n) / totalLeaves) / 100_000 : 0,
    }))
    .sort((a, b) => (BigInt(b.bytes) > BigInt(a.bytes) ? 1 : -1))

  // Attributed bytes are the ones an uploader can be named for. Shares are taken
  // against that figure, not the network total — dividing by a total that includes
  // unattributed bytes would understate every uploader on the map.
  const attributedLeaves = totalLeaves - unattributedLeaves
  const uploaders = [...byUploader.entries()]
    .map(([uploader, entry]) => ({
      uploader,
      bytes: (entry.leaves * BYTES_PER_LEAF).toString(),
      dataSets: entry.dataSets,
      providers: entry.providers.size,
      share:
        attributedLeaves > 0n ? Number((entry.leaves * 100_000n) / attributedLeaves) / 100_000 : 0,
    }))
    .filter((entry) => BigInt(entry.bytes) > 0n)
    .sort((a, b) => (BigInt(b.bytes) > BigInt(a.bytes) ? 1 : -1))

  const elapsed = ((Date.now() - started) / 1000).toFixed(1)
  console.log(
    `[capture:${network}] ${liveDataSets} live sets · ${(Number(totalBytes) / 1e12).toFixed(2)} TB · ` +
      `${providers.length} providers · ${uploaders.length} uploaders · ` +
      `${(Number(unattributedLeaves * BYTES_PER_LEAF) / 1e12).toFixed(2)} TB unattributed · ${elapsed}s`,
  )

  return {
    network,
    chainId: d.chainId,
    blockNumber: blockNumber.toString(),
    capturedAt: new Date().toISOString(),
    dataSetsCreated: created,
    liveDataSets,
    totalLeaves: totalLeaves.toString(),
    totalBytes: totalBytes.toString(),
    activeProviders: activeProviders === null ? null : Number(activeProviders),
    providers,
    uploaders,
    attributedBytes: (attributedLeaves * BYTES_PER_LEAF).toString(),
    unattributedBytes: (unattributedLeaves * BYTES_PER_LEAF).toString(),
    unattributedDataSets: unattributedSets,
    usdfc: {
      address: d.usdfc,
      payRails: d.filecoinPay,
      symbol,
      decimals: Number(decimals),
      supply: supply.toString(),
      escrowed: escrowed.toString(),
    },
  }
}

/* ── Collection quotes ──────────────────────────────────────────────────── */

const NFT_MARKET_IDS = {
  'forgotten-runes': 'forgotten-runes-wizards-cult',
  'chain-runners': 'chain-runners',
  mfers: 'mfers',
  opepen: 'opepen-edition',
  autoglyphs: 'autoglyphs',
  blitmap: 'blitmap',
  terraforms: 'terraforms-by-mathcastles',
  nouns: 'nouns',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function captureCollections() {
  const quotes = []
  const missing = []
  const entries = Object.entries(NFT_MARKET_IDS)

  for (const [slug, id] of entries) {
    let attempt = 0
    let quote = null
    while (attempt < 3 && !quote) {
      attempt += 1
      try {
        const response = await fetch(`https://api.coingecko.com/api/v3/nfts/${id}`, {
          signal: AbortSignal.timeout(15_000),
        })
        if (response.status === 429) {
          await sleep(20_000 * attempt)
          continue
        }
        if (!response.ok) break
        const body = await response.json()
        if (body?.status?.error_code) break
        quote = {
          slug,
          marketId: id,
          priceUsd: body.floor_price?.usd ?? null,
          marketCapUsd: body.market_cap?.usd ?? null,
          floorUsd: body.floor_price?.usd ?? null,
          floorEth: body.floor_price?.native_currency ?? null,
          change24h: body.floor_price_24h_percentage_change?.usd ?? null,
          owners: body.number_of_unique_addresses ?? null,
          totalSupply: body.total_supply ?? null,
          image: body.image?.small ?? null,
          source: 'coingecko-nft',
          asOf: new Date().toISOString(),
        }
      } catch {
        await sleep(4_000)
      }
    }

    if (quote) {
      quotes.push(quote)
      console.log(
        `[capture:market] ${slug.padEnd(16)} mcap=${quote.marketCapUsd ?? '—'} floor=${quote.floorUsd ?? '—'}`,
      )
    } else {
      missing.push(slug)
      console.warn(`[capture:market] ${slug.padEnd(16)} unavailable`)
    }
    await sleep(14_000)
  }

  return { capturedAt: new Date().toISOString(), source: 'coingecko-nft', quotes, missing }
}

/* ── Runner ─────────────────────────────────────────────────────────────── */

async function write(name, value) {
  await mkdir(DATA_DIR, { recursive: true })
  const path = resolve(DATA_DIR, name)
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  console.log(`[capture] wrote ${name}`)
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const only = args.has('--storage') ? 'storage' : args.has('--market') ? 'market' : 'all'

  if (only === 'all' || only === 'storage') {
    const [mainnet, calibration] = await Promise.all([
      captureLedger('mainnet').catch((error) => {
        console.error('[capture:mainnet] failed:', String(error).slice(0, 200))
        return null
      }),
      captureLedger('calibration').catch((error) => {
        console.error('[capture:calibration] failed:', String(error).slice(0, 200))
        return null
      }),
    ])
    if (mainnet || calibration) {
      await write('storage-ledger.json', { mainnet, calibration })
    }
  }

  if (only === 'all' || only === 'market') {
    const collections = await captureCollections()
    await write('collection-quotes.json', collections)
  }
}

main().catch((error) => {
  console.error('[capture] unexpected failure:', error)
  process.exitCode = 1
})
