/**
 * HAVEN — LIVE
 *
 * Runtime reads, executed in the reader's own browser against public endpoints.
 * Cheap enough to run on load: a handful of `eth_call`s per chain, folded into
 * multicalls, plus one batched market request.
 *
 * Arkiv is included deliberately. Its probe is expected to fail while no public
 * network exists — the entity
 * index is not operational — and the interface renders that failure as a state,
 * not as an error. It is the one body in the Atlas that is drawn unlit.
 */

import { createPublicClient, http, type Address, type PublicClient } from 'viem'
import { ARKIV, CHAINS, GATES, ICP, type ChainKey } from './chains.ts'
import { erc20Abi } from './fevm.ts'
import { AOL } from './protocol.ts'

export type Health = 'live' | 'slow' | 'down' | 'pending'

export interface ChainPulse {
  key: ChainKey | 'icp' | 'arkiv'
  label: string
  health: Health
  /** Measured round-trip in ms. */
  latencyMs: number | null
  /** The headline figure this network reports about itself. */
  value: string | null
  valueLabel: string
  note: string
  at: number
}

const TIMEOUT = 7_000

function readOnly(key: ChainKey): PublicClient {
  const spec = CHAINS[key]
  return createPublicClient({
    transport: http(spec.rpc, { timeout: TIMEOUT, retryCount: 0 }),
  }) as PublicClient
}

function health(latencyMs: number): Health {
  return latencyMs > 1_500 ? 'slow' : 'live'
}

/* ── Block heights ──────────────────────────────────────────────────────── */

async function pulseChain(key: ChainKey): Promise<ChainPulse> {
  const spec = CHAINS[key]
  const started = performance.now()
  try {
    const height = await readOnly(key).getBlockNumber()
    const latencyMs = performance.now() - started
    return {
      key,
      label: spec.name,
      health: health(latencyMs),
      latencyMs,
      value: height.toLocaleString('en-US'),
      valueLabel: 'Block height',
      note:
        spec.role === 'gate'
          ? 'Asked, on every read, whether the holder still holds.'
          : 'Where ciphertext is pinned, proven and paid for.',
      at: Date.now(),
    }
  } catch {
    return {
      key,
      label: spec.name,
      health: 'down',
      latencyMs: null,
      value: null,
      valueLabel: 'Block height',
      note: 'Public node did not answer.',
      at: Date.now(),
    }
  }
}

/* ── The Internet Computer ──────────────────────────────────────────────── */

export function currentEpoch(): number {
  return Math.floor(Date.now() / 1000 / AOL.epochSeconds)
}

export function epochRemaining(): { days: number; hours: number; fraction: number } {
  const elapsed = Math.floor(Date.now() / 1000) % AOL.epochSeconds
  const left = AOL.epochSeconds - elapsed
  return {
    days: Math.floor(left / 86_400),
    hours: Math.floor((left % 86_400) / 3_600),
    fraction: elapsed / AOL.epochSeconds,
  }
}

async function pulseIcp(): Promise<ChainPulse> {
  const epoch = currentEpoch()
  const started = performance.now()
  try {
    const response = await fetch(ICP.status, { signal: AbortSignal.timeout(TIMEOUT), cache: 'no-store' })
    const latencyMs = performance.now() - started
    if (!response.ok) throw new Error(String(response.status))
    const left = epochRemaining()
    return {
      key: 'icp',
      label: 'Internet Computer',
      health: health(latencyMs),
      latencyMs,
      value: epoch.toLocaleString('en-US'),
      valueLabel: 'Gate epoch',
      note: `Replica reachable. Keys derive against this epoch for another ${left.days}d ${left.hours}h.`,
      at: Date.now(),
    }
  } catch {
    return {
      key: 'icp',
      label: 'Internet Computer',
      health: 'down',
      latencyMs: null,
      value: epoch.toLocaleString('en-US'),
      valueLabel: 'Gate epoch',
      note: 'Replica unreachable from here. Epoch is arithmetic, so it still holds.',
      at: Date.now(),
    }
  }
}

/* ── Arkiv ──────────────────────────────────────────────────────────────── */

/**
 * The entity index. Currently returns 503. We probe it anyway, every load, so
 * that the moment it comes up the interface lights it without a redeploy.
 */
async function pulseArkiv(): Promise<ChainPulse> {
  const started = performance.now()
  try {
    const response = await fetch(ARKIV.rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_getEntityCount', params: [] }),
      signal: AbortSignal.timeout(TIMEOUT),
      cache: 'no-store',
    })
    const latencyMs = performance.now() - started
    if (!response.ok) {
      return {
        key: 'arkiv',
        label: 'Arkiv',
        health: 'down',
        latencyMs: null,
        value: null,
        valueLabel: 'Entities indexed',
        note: `No public network — the retired ${ARKIV.codename} node answers ${response.status}. Arkiv holds metadata only, so storage, proofs, payment and gating are all unaffected.`,
        at: Date.now(),
      }
    }
    const body = (await response.json()) as { result?: string | number }
    const count = Number(body.result)
    return {
      key: 'arkiv',
      label: 'Arkiv',
      health: health(latencyMs),
      latencyMs,
      value: Number.isFinite(count) ? count.toLocaleString('en-US') : null,
      valueLabel: 'Entities indexed',
      note: 'Metadata index online — records are resolvable to their gates.',
      at: Date.now(),
    }
  } catch {
    return {
      key: 'arkiv',
      label: 'Arkiv',
      health: 'down',
      latencyMs: null,
      value: null,
      valueLabel: 'Entities indexed',
      note: ARKIV.statusNote,
      at: Date.now(),
    }
  }
}

export function pendingPulses(): ChainPulse[] {
  const labels: Array<[ChainPulse['key'], string, string]> = [
    ['arkiv', 'Arkiv', 'Entities indexed'],
    ['icp', 'Internet Computer', 'Gate epoch'],
    ['ethereum', CHAINS.ethereum.name, 'Block height'],
    ['base', CHAINS.base.name, 'Block height'],
    ['optimism', CHAINS.optimism.name, 'Block height'],
    ['filecoin', CHAINS.filecoin.name, 'Block height'],
  ]
  return labels.map(([key, label, valueLabel]) => ({
    key,
    label,
    health: 'pending' as const,
    latencyMs: null,
    value: null,
    valueLabel,
    note: 'Opening a connection…',
    at: Date.now(),
  }))
}

/** Probe every network concurrently. Never throws. */
export async function pulseAll(
  /**
   * Which Filecoin to probe. The gates live on Ethereum mainnet regardless, and
   * ICP and Arkiv have one deployment each, so this only redirects the Filecoin
   * station — measuring calibration while reporting mainnet's height would be a
   * quiet lie about which network the reader is looking at.
   */
  filecoin: ChainKey = 'filecoin',
): Promise<ChainPulse[]> {
  const settled = await Promise.allSettled([
    pulseArkiv(),
    pulseIcp(),
    pulseChain('ethereum'),
    pulseChain('base'),
    pulseChain('optimism'),
    pulseChain(filecoin),
  ])
  const fallbackOrder = pendingPulses()
  return settled.map((entry, index) =>
    entry.status === 'fulfilled'
      ? entry.value
      : { ...fallbackOrder[index]!, health: 'down' as const, note: 'Probe failed to run.' },
  )
}

/* ── Gate facts, read from the gates themselves ─────────────────────────── */

export interface GateFacts {
  slug: string
  name: string | null
  symbol: string | null
  decimals: number | null
  totalSupply: bigint | null
}

/**
 * One multicall per chain reads name, symbol, decimals and totalSupply for every
 * gate on it. These are on-chain facts — the interface never hardcodes a supply.
 */
export async function readGateFacts(): Promise<Map<string, GateFacts>> {
  const byChain = new Map<ChainKey, typeof GATES[number][]>()
  for (const gate of GATES) {
    const list = byChain.get(gate.chain) ?? []
    list.push(gate)
    byChain.set(gate.chain, list)
  }

  const out = new Map<string, GateFacts>()

  await Promise.all(
    [...byChain.entries()].map(async ([chainKey, gates]) => {
      const spec = CHAINS[chainKey]
      const c = createPublicClient({
        chain: {
          id: spec.id,
          name: spec.name,
          nativeCurrency: { name: spec.nativeSymbol, symbol: spec.nativeSymbol, decimals: 18 },
          rpcUrls: { default: { http: [spec.rpc] } },
          contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
        },
        transport: http(spec.rpc, { timeout: 12_000, retryCount: 1 }),
        batch: { multicall: { batchSize: 1_024, wait: 12 } },
      }) as PublicClient

      const contracts = gates.flatMap((gate) => [
        { address: gate.address as Address, abi: erc20Abi, functionName: 'name' as const },
        { address: gate.address as Address, abi: erc20Abi, functionName: 'symbol' as const },
        { address: gate.address as Address, abi: erc20Abi, functionName: 'totalSupply' as const },
        { address: gate.address as Address, abi: erc20Abi, functionName: 'decimals' as const },
      ])

      try {
        const results = await c.multicall({ contracts, allowFailure: true })
        gates.forEach((gate, index) => {
          const name = results[index * 4]
          const symbol = results[index * 4 + 1]
          const supply = results[index * 4 + 2]
          const decimals = results[index * 4 + 3]
          out.set(gate.slug, {
            slug: gate.slug,
            name: name?.status === 'success' ? (name.result as string) : null,
            symbol: symbol?.status === 'success' ? (symbol.result as string) : null,
            totalSupply: supply?.status === 'success' ? (supply.result as bigint) : null,
            decimals: decimals?.status === 'success' ? Number(decimals.result) : null,
          })
        })
      } catch {
        for (const gate of gates) {
          out.set(gate.slug, {
            slug: gate.slug,
            name: null,
            symbol: null,
            decimals: null,
            totalSupply: null,
          })
        }
      }
    }),
  )

  return out
}
