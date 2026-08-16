/**
 * THE THRESHOLD — eligibility, readiness, acquisition and cross-surface links
 *
 * Haven's entire authorisation model is one question: does this address hold at
 * least N of the gating asset? That question is a public `eth_call`, so this
 * module answers it for real, for all sixteen candidate gates, against live
 * mainnet state.
 *
 * ── Why there is no library in here ──────────────────────────────────────────
 * The other surfaces can afford viem; this one should not spend it. `balanceOf`
 * takes a single address argument, so the calldata is a four-byte selector
 * followed by one left-padded word — encodable in a line. Decoding is
 * `BigInt(hex)`. And JSON-RPC accepts an array of requests, so every gate on a
 * chain is read in one round trip. A library here would add orders of magnitude
 * more bytes than the code it replaced.
 *
 * ── Reading is not proving ───────────────────────────────────────────────────
 * Nothing here proves control of an address, and it does not need to. Balances
 * are public: anyone can check anyone, which is exactly why this surface asks
 * for a pasted address rather than a wallet connection. There is no signature,
 * no permission prompt, no session, and nothing is stored. The request goes from
 * the reader's own browser to a public RPC — no Haven server is involved and
 * none of it is observed by us.
 *
 * Proving control happens later and elsewhere: an EIP-712 signature to
 * `haven-aol`, which derives the key. That is the reader client's job, not this
 * page's. This surface establishes readiness; it does not grant access.
 */

import {
  ARKIV,
  ARKIV_GAS,
  CHAINS,
  GATES,
  SELECTOR,
  STORAGE,
  type ChainKey,
  type GateSpec,
} from './chains.ts'

/* ── Acquisition ─────────────────────────────────────────────────────────── */

/**
 * Marketplace path segment per chain. OpenSea and Uniswap each expect a chain
 * slug that is not always the chain's own name, so it is mapped explicitly.
 */
const MARKET_SLUG: Partial<Record<ChainKey, string>> = {
  ethereum: 'ethereum',
  base: 'base',
  optimism: 'optimism',
}

/**
 * Where a reader actually acquires the asset that opens an archive.
 *
 * Collections resolve by contract address rather than by OpenSea's collection
 * slug: the slug is editorial, changes without notice, and would need
 * hand-maintaining for sixteen communities. The contract address is the same
 * identifier the gate itself uses, so the link cannot drift from the gate.
 */
export function acquireLink(gate: GateSpec): { href: string; venue: string } {
  const slug = MARKET_SLUG[gate.chain] ?? 'ethereum'
  return gate.kind === 'collection'
    ? { href: `https://opensea.io/assets/${slug}/${gate.address}`, venue: 'OpenSea' }
    : {
        href: `https://app.uniswap.org/swap?chain=${slug}&outputCurrency=${gate.address}`,
        venue: 'Uniswap',
      }
}

/**
 * Deep link into enrolment, focused on one community.
 *
 * Points at the reader's path rather than the chooser: someone who has just found
 * a community in the Atlas has already answered the question the chooser asks.
 */
export function thresholdLink(gate: Pick<GateSpec, 'slug'>): string {
  return `/threshold/read?gate=${gate.slug}`
}

/* ── Eligibility ─────────────────────────────────────────────────────────── */

export interface Holding {
  slug: string
  /** Raw balance in base units, or null if the call failed. */
  balance: bigint | null
  /** Units required by the gate, in whole tokens. */
  threshold: number
  /** Decimals for a token gate; null for a collection, which has none. */
  decimals: number | null
  /** The community's own name, read from the contract. Null if it has none. */
  name: string | null
  eligible: boolean
  error?: string
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/

export function isAddress(value: string): boolean {
  return ADDRESS.test(value.trim())
}

/** Left-pad an address into a 32-byte ABI word. */
function word(address: string): string {
  return address.trim().replace(/^0x/, '').toLowerCase().padStart(64, '0')
}

interface RpcResponse {
  id: number
  result?: string
  error?: { message?: string }
}

interface Call {
  slug: string
  kind: 'balance' | 'decimals' | 'name'
  to: string
  data: string
}

/**
 * Decode a returned ABI string.
 *
 * Two shapes have to be handled. Modern contracts return a dynamic `string`:
 * an offset word, a length word, then the bytes. Several of the older
 * collections — Autoglyphs among them — predate that convention and return a
 * fixed `bytes32` with trailing nulls. Guessing wrong yields mojibake rather
 * than an error, so both are handled explicitly and anything else gives up.
 */
function decodeString(hex: string | undefined): string | null {
  if (!hex || hex === '0x') return null
  const body = hex.replace(/^0x/, '')

  const bytesToText = (bytes: string): string | null => {
    // Decoded as UTF-8, not byte by byte. Several collections use non-ASCII
    // symbols — Autoglyphs' symbol is a multi-byte glyph — and reading each byte
    // as a code unit turns those into mojibake rather than failing outright.
    const octets = new Uint8Array(bytes.length / 2)
    for (let i = 0; i < octets.length; i += 1) {
      octets[i] = parseInt(bytes.slice(i * 2, i * 2 + 2), 16)
    }
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(octets)
    } catch {
      return null
    }
    const trimmed = text.replace(/\u0000+/g, '').trim()
    // Reject control characters and the replacement char: a wrong guess about the
    // encoding shows up here rather than being rendered as a name.
    return trimmed.length > 0 && !/[\u0000-\u001f\ufffd]/.test(trimmed) ? trimmed : null
  }

  if (body.length === 64) return bytesToText(body)

  try {
    const offset = Number(BigInt('0x' + body.slice(0, 64))) * 2
    const length = Number(BigInt('0x' + body.slice(offset, offset + 64))) * 2
    if (!Number.isFinite(length) || length <= 0) return null
    return bytesToText(body.slice(offset + 64, offset + 64 + length))
  } catch {
    return null
  }
}

/**
 * Read the holder's balance at every gate and decide eligibility.
 *
 * One batched request per chain. Failures are reported per gate rather than
 * thrown: one unreachable contract must not blank the whole report, because a
 * reader looking for a single community should not be told nothing is known.
 */
export async function readHoldings(
  address: string,
  gates: readonly GateSpec[] = GATES,
): Promise<Holding[]> {
  if (!isAddress(address)) throw new Error('Not a valid address')

  const byChain = new Map<ChainKey, GateSpec[]>()
  for (const gate of gates) {
    const list = byChain.get(gate.chain) ?? []
    list.push(gate)
    byChain.set(gate.chain, list)
  }

  const results = new Map<string, Holding>()

  const missing = (gate: GateSpec, error: string, balance: bigint | null = null): Holding => ({
    slug: gate.slug,
    balance,
    threshold: gate.threshold,
    decimals: null,
    name: null,
    eligible: false,
    error,
  })

  await Promise.all(
    [...byChain.entries()].map(async ([chainKey, chainGates]) => {
      const spec = CHAINS[chainKey]
      const balanceData = SELECTOR.balanceOf + word(address)

      const fail = (message: string) => {
        for (const gate of chainGates) results.set(gate.slug, missing(gate, message))
      }

      // Two reads per token gate, one per collection. A token's threshold is
      // quoted in whole tokens while `balanceOf` answers in base units, so
      // `decimals` is not optional: without it a gate requiring 25,000 tokens is
      // cleared by dust, which is a false positive on the only question this
      // protocol asks. Both reads still travel in the same round trip.
      const calls: Call[] = []
      for (const gate of chainGates) {
        calls.push({ slug: gate.slug, kind: 'balance', to: gate.address, data: balanceData })
        calls.push({ slug: gate.slug, kind: 'name', to: gate.address, data: SELECTOR.name })
        if (gate.kind === 'token') {
          calls.push({ slug: gate.slug, kind: 'decimals', to: gate.address, data: SELECTOR.decimals })
        }
      }

      try {
        const response = await fetch(spec.rpc, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            calls.map((call, index) => ({
              jsonrpc: '2.0',
              id: index,
              method: 'eth_call',
              params: [{ to: call.to, data: call.data }, 'latest'],
            })),
          ),
        })

        if (!response.ok) {
          fail(`${spec.name} RPC returned ${response.status}`)
          return
        }

        const payload: RpcResponse[] | RpcResponse = await response.json()
        const list = Array.isArray(payload) ? payload : [payload]
        const byId = new Map(list.map((entry) => [entry.id, entry]))

        const readWord = (index: number): bigint | null => {
          const entry = byId.get(index)
          const raw = entry?.result
          if (!raw || raw === '0x' || entry?.error) return null
          try {
            return BigInt(raw)
          } catch {
            return null
          }
        }

        const balances = new Map<string, bigint | null>()
        const decimalsBySlug = new Map<string, number | null>()
        const namesBySlug = new Map<string, string | null>()
        calls.forEach((call, index) => {
          if (call.kind === 'name') {
            namesBySlug.set(call.slug, decodeString(byId.get(index)?.result))
            return
          }
          const value = readWord(index)
          if (call.kind === 'balance') balances.set(call.slug, value)
          else decimalsBySlug.set(call.slug, value === null ? null : Number(value))
        })

        for (const gate of chainGates) {
          const balance = balances.get(gate.slug) ?? null
          if (balance === null) {
            results.set(gate.slug, missing(gate, 'No result'))
            continue
          }

          const name = namesBySlug.get(gate.slug) ?? null

          if (gate.kind === 'collection') {
            results.set(gate.slug, {
              slug: gate.slug,
              balance,
              threshold: gate.threshold,
              decimals: null,
              name,
              eligible: balance >= BigInt(gate.threshold),
            })
            continue
          }

          // A token gate whose decimals could not be read is reported as
          // undetermined rather than guessed at 0 or 18 — a wrong guess is a
          // wrong answer about access.
          const decimals = decimalsBySlug.get(gate.slug) ?? null
          if (decimals === null) {
            results.set(gate.slug, {
              ...missing(gate, 'Decimals unavailable — threshold cannot be compared', balance),
              name,
            })
            continue
          }

          results.set(gate.slug, {
            slug: gate.slug,
            balance,
            threshold: gate.threshold,
            decimals,
            name,
            eligible: balance >= BigInt(gate.threshold) * 10n ** BigInt(decimals),
          })
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Request failed')
      }
    }),
  )

  return gates.map((gate) => results.get(gate.slug) ?? missing(gate, 'Not read'))
}

/** Whole units from base units, to two places, without a bignum library. */
function toWhole(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const hundredths = ((value % base) * 100n) / base
  return `${whole.toLocaleString('en-US')}.${hundredths.toString().padStart(2, '0')}`
}

/* ── Founding: can this contract serve as a gate? ────────────────────────── */

export interface GateCandidate {
  address: string
  chain: ChainKey
  /** What the contract appears to be. */
  standard: 'collection' | 'token' | 'unknown'
  name: string | null
  symbol: string | null
  decimals: number | null
  totalSupply: bigint | null
  /** Whether Haven could gate on it as it stands. */
  usable: boolean
  /** Plain-language findings, in the order a newcomer should read them. */
  findings: Array<{ state: 'ok' | 'warn' | 'fail'; label: string; detail: string }>
}

/** ERC-165 `supportsInterface(bytes4)`, and the two interface ids worth asking for. */
const SUPPORTS_INTERFACE = '0x01ffc9a7'
const IFACE_ERC721 = '80ac58cd'
const IFACE_ERC1155 = 'd9b67a26'

/**
 * Inspect any contract and report whether it can gate an archive.
 *
 * A founder does not have to deploy anything: if their community already has an
 * NFT or a token, that asset is already a gate. Haven only ever calls
 * `balanceOf`, so the bar is genuinely low — but "low" is not "nothing", and the
 * honest thing is to check rather than to reassure.
 *
 * Everything is established by asking the contract: the name, the symbol, the
 * supply, whether it declares ERC-721 through ERC-165, whether it exposes
 * `decimals` like a fungible token, and above all whether `balanceOf` answers at
 * all. That last one is the only hard requirement.
 */
export async function inspectContract(
  address: string,
  chain: ChainKey = 'ethereum',
): Promise<GateCandidate> {
  if (!isAddress(address)) throw new Error('Not a valid address')

  const spec = CHAINS[chain]
  const probe = '0x0000000000000000000000000000000000000001'

  const calls = [
    { key: 'name', data: SELECTOR.name },
    { key: 'symbol', data: SELECTOR.symbol },
    { key: 'decimals', data: SELECTOR.decimals },
    { key: 'totalSupply', data: SELECTOR.totalSupply },
    { key: 'balanceOf', data: SELECTOR.balanceOf + word(probe) },
    { key: 'erc721', data: SUPPORTS_INTERFACE + IFACE_ERC721.padEnd(64, '0') },
    { key: 'erc1155', data: SUPPORTS_INTERFACE + IFACE_ERC1155.padEnd(64, '0') },
  ] as const

  const response = await fetch(spec.rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      calls.map((call, index) => ({
        jsonrpc: '2.0',
        id: index,
        method: 'eth_call',
        params: [{ to: address, data: call.data }, 'latest'],
      })),
    ),
  })

  const payload: RpcResponse[] | RpcResponse = await response.json()
  const list = Array.isArray(payload) ? payload : [payload]
  const byId = new Map(list.map((entry) => [entry.id, entry]))
  const raw = (key: (typeof calls)[number]['key']): string | undefined => {
    const index = calls.findIndex((call) => call.key === key)
    const entry = byId.get(index)
    return entry?.error ? undefined : entry?.result
  }

  const asBigInt = (hex: string | undefined): bigint | null => {
    if (!hex || hex === '0x') return null
    try {
      return BigInt(hex)
    } catch {
      return null
    }
  }

  const name = decodeString(raw('name'))
  const symbol = decodeString(raw('symbol'))
  const decimals = asBigInt(raw('decimals'))
  const totalSupply = asBigInt(raw('totalSupply'))
  const balance = asBigInt(raw('balanceOf'))
  const isErc721 = asBigInt(raw('erc721')) === 1n
  const isErc1155 = asBigInt(raw('erc1155')) === 1n

  const standard: GateCandidate['standard'] = isErc721
    ? 'collection'
    : decimals !== null
      ? 'token'
      : 'unknown'

  const findings: GateCandidate['findings'] = []

  // The only requirement. Stated first, because everything else is context.
  if (balance !== null) {
    findings.push({
      state: 'ok',
      label: 'It answers the only question Haven asks',
      detail:
        'The contract responded to balanceOf, which is the whole of Haven\u2019s authorisation model. Anything that can report a balance can gate an archive.',
    })
  } else {
    findings.push({
      state: 'fail',
      label: 'It does not report balances',
      detail:
        'balanceOf did not answer, so Haven has no way to tell whether someone holds this. Most NFTs and tokens do answer; a contract that does not is usually not an ownership asset at all.',
    })
  }

  if (standard === 'collection') {
    findings.push({
      state: 'ok',
      label: 'It is an NFT collection',
      detail:
        'The contract declares the ERC-721 interface, so balances are whole items. A threshold of 1 means holding any one piece from the collection.',
    })
  } else if (standard === 'token') {
    findings.push({
      state: 'ok',
      label: `It is a fungible token with ${decimals} decimals`,
      detail:
        'Balances are divisible, so a threshold is an amount rather than a count. Haven compares whole tokens, converting for the decimals itself.',
    })
  } else if (isErc1155) {
    findings.push({
      state: 'warn',
      label: 'It is a multi-token (ERC-1155) contract',
      detail:
        'Balances here are per token id rather than per holder, so gating needs the specific id as well as the address. Workable, but not with the plain balanceOf call this page makes.',
    })
  } else {
    findings.push({
      state: 'warn',
      label: 'The standard could not be established',
      detail:
        'It declares neither ERC-721 nor decimals. If it still reports balances it may work, but confirm what a balance means here before gating anything valuable on it.',
    })
  }

  if (name || symbol) {
    findings.push({
      state: 'ok',
      label: 'It has a public identity',
      detail: `Readers will see ${[name, symbol && `(${symbol})`].filter(Boolean).join(' ')} — the same name the contract reports to any explorer.`,
    })
  } else {
    findings.push({
      state: 'warn',
      label: 'It has no name or symbol',
      detail:
        'Nothing prevents gating on it, but readers will only ever see the address. A community asset usually wants a name.',
    })
  }

  if (totalSupply !== null && totalSupply === 0n) {
    findings.push({
      state: 'warn',
      label: 'Nothing has been issued yet',
      detail:
        'The supply is zero, so nobody can currently clear a gate on it — including you. Mint before you publish, or no one will be able to open the archive.',
    })
  }

  return {
    address,
    chain,
    standard,
    name,
    symbol,
    decimals: decimals === null ? null : Number(decimals),
    totalSupply,
    usable: balance !== null,
    findings,
  }
}

/** Human-readable holding, in whole units wherever decimals are known. */
export function formatBalance(holding: Holding, gate: GateSpec): string {
  if (holding.balance === null) return '—'
  if (gate.kind === 'collection') return holding.balance.toLocaleString('en-US')
  if (holding.decimals === null) return 'unknown'
  return toWhole(holding.balance, holding.decimals)
}

/* ── Publisher readiness ─────────────────────────────────────────────────── */

/** Arkiv's documentation — the only Arkiv URL that is currently answering. */
const ARKIV_DOCS = 'https://docs.arkiv.network/'

export interface Readiness {
  id: 'fil' | 'usdfc' | 'glm' | 'bridge' | 'arkiv'
  label: string
  /** Order to attempt them in. FIL first, because minting USDFC spends it. */
  step: number
  /**
   * Where to go and get it, when somewhere exists.
   *
   * Null is meaningful: on devnet there is no GLM faucet published yet, and
   * inventing a URL for one would be worse than admitting it. Every href here has
   * been checked to resolve.
   */
  action: { href: string; label: string } | null
  /** What to do, phrased as an instruction rather than a description. */
  todo: string
  /**
   * `met` and `unmet` are both determinations. `unknown` means the check could
   * not be run — a different statement, and one that must not be rendered as a
   * failure the reader could go and fix.
   */
  state: 'met' | 'unmet' | 'unknown'
  value: string
  note: string
}

/**
 * Can this address actually publish today?
 *
 * Three of the five requirements are on-chain balances and are genuinely read:
 * native FIL for Filecoin gas, USDFC for storage, and GLM for index gas — writing
 * an entity to Arkiv is a transaction on an OP-stack L3 whose gas is GLM. A reader
 * never needs GLM, because reading the index is free; a publisher does, because
 * publishing writes to it.
 *
 * The fourth — the entity itself — is not optional and not a balance.
 * The protocol requires it: without an entity an archive has no discoverable
 * existence. It cannot be checked right now because Arkiv's devnet is offline
 * while the chain is being built, so it is reported as unavailable rather than
 * unmet. A publisher who has done everything correctly must never be shown a
 * failure for a network of ours that is still under construction.
 */
export async function readPublisherReadiness(
  address: string,
  network: 'mainnet' | 'calibration' = 'mainnet',
): Promise<Readiness[]> {
  if (!isAddress(address)) throw new Error('Not a valid address')

  const deployment = STORAGE[network]
  const spec = CHAINS[deployment.chain]
  const out: Readiness[] = []

  try {
    const response = await fetch(spec.rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([
        { jsonrpc: '2.0', id: 0, method: 'eth_getBalance', params: [address, 'latest'] },
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{ to: deployment.usdfc, data: SELECTOR.balanceOf + word(address) }, 'latest'],
        },
      ]),
    })

    const payload: RpcResponse[] | RpcResponse = await response.json()
    const list = Array.isArray(payload) ? payload : [payload]
    const byId = new Map(list.map((entry) => [entry.id, entry]))

    const value = (id: number): bigint | null => {
      const raw = byId.get(id)?.result
      if (!raw || raw === '0x') return null
      try {
        return BigInt(raw)
      } catch {
        return null
      }
    }

    const testnet = network === 'calibration'
    const filSymbol = testnet ? 'tFIL' : 'FIL'

    const fil = value(0)
    out.push({
      id: 'fil',
      step: 1,
      label: `${filSymbol} for gas`,
      state: fil === null ? 'unknown' : fil > 0n ? 'met' : 'unmet',
      value: fil === null ? '—' : `${toWhole(fil, 18)} ${filSymbol}`,
      // Verified to resolve. Mainnet has no faucet by definition, so none is offered.
      action: testnet
        ? { href: 'https://faucet.calibnet.chainsafe-fil.io/', label: 'Open the faucet' }
        : null,
      todo: testnet
        ? 'Paste this address into the calibration faucet and request tFIL. It is free and arrives in a few seconds.'
        : 'Acquire FIL wherever you normally buy assets, and send it to this address.',
      note:
        fil === null
          ? `${spec.name} did not answer the balance query.`
          : fil > 0n
            ? `Enough to submit transactions on ${spec.name}.`
            : `Filecoin transactions need native ${filSymbol}. Nothing further on this list can proceed without it.`,
    })

    const usdfc = value(1)
    out.push({
      id: 'usdfc',
      step: 2,
      label: 'USDFC for storage',
      state: usdfc === null ? 'unknown' : usdfc > 0n ? 'met' : 'unmet',
      value: usdfc === null ? '—' : `${toWhole(usdfc, 18)} USDFC`,
      action: { href: 'https://usdfc.secured.finance/', label: 'Mint USDFC' },
      todo: testnet
        ? `Open the USDFC app, switch it to ${spec.name}, and borrow USDFC against the ${filSymbol} you just received. You are minting against collateral, not buying — the ${filSymbol} stays yours.`
        : 'Open the USDFC app and borrow USDFC against FIL collateral. The FIL remains yours; USDFC is issued against it.',
      note:
        usdfc === null
          ? 'The USDFC contract did not answer.'
          : usdfc > 0n
            ? 'Available to escrow against a storage deal.'
            : `Storage is paid in USDFC, escrowed to the pin contracts for the life of the deal. On ${spec.name} the contract is ${deployment.usdfc}.`,
    })
  } catch (error) {
    for (const [id, label] of [
      ['fil', 'FIL for gas'],
      ['usdfc', 'USDFC for storage'],
    ] as const) {
      out.push({
        id,
        step: id === 'fil' ? 1 : 2,
        label,
        state: 'unknown',
        value: '—',
        action: null,
        todo: 'Retry once the network answers.',
        note: error instanceof Error ? error.message : 'Request failed',
      })
    }
  }

  // ── Index gas, read on the chain where it is actually held ──
  // Writing an entity to Arkiv is an L3 transaction paid in GLM. The balance on
  // the L3 cannot be read while its devnet is offline, so what is reported is the
  // mainnet holding — the thing a publisher acquires and bridges — and the note
  // says exactly that rather than implying the L3 was reachable.
  try {
    const gasSpec = CHAINS[ARKIV_GAS.chain]
    const response = await fetch(gasSpec.rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'eth_call',
        params: [{ to: ARKIV_GAS.address, data: SELECTOR.balanceOf + word(address) }, 'latest'],
      }),
    })
    const payload: RpcResponse | RpcResponse[] = await response.json()
    const entry = Array.isArray(payload) ? payload[0] : payload
    const raw = entry?.result
    let glm: bigint | null = null
    if (raw && raw !== '0x') {
      try {
        glm = BigInt(raw)
      } catch {
        glm = null
      }
    }

    out.push({
      id: 'glm',
      step: 3,
      label: `${ARKIV_GAS.symbol} for index gas`,
      // No GLM faucet is published for the Arkiv devnet yet — checked, and it does
      // not resolve — so the only honest link is the project's own documentation.
      action: { href: ARKIV_DOCS, label: 'Arkiv documentation' },
      todo:
        network === 'calibration'
          ? `There is no faucet to use right now: Arkiv retired ${ARKIV.codename} on ${ARKIV.retiredOn} and its faucet went with it, with the next public testnet expected ${ARKIV.nextPublicTestnet}. This step is waiting on the network, not on you — everything above it can be completed today.`
          : `Acquire ${ARKIV_GAS.symbol} wherever you buy assets, then bridge it to the L3 — see the next step. It is only spent when writing to the index, never when reading it.`,
      state: glm === null ? 'unknown' : glm > 0n ? 'met' : 'unmet',
      value: glm === null ? '—' : `${toWhole(glm, ARKIV_GAS.decimals)} ${ARKIV_GAS.symbol}`,
      note:
        glm === null
          ? `${gasSpec.name} did not answer the ${ARKIV_GAS.symbol} balance query.`
          : glm > 0n
            ? `Held on ${gasSpec.name}. This is the right token, but not yet in the right place — it has to be bridged to the L3 before it can pay for gas there.`
            : `Registering an archive in the index costs gas, and Arkiv's gas is ${ARKIV_GAS.symbol}. Readers never need it — only publishing writes to the index.`,
    })
  } catch (error) {
    out.push({
      id: 'glm',
      step: 3,
      label: `${ARKIV_GAS.symbol} for index gas`,
      state: 'unknown',
      value: '—',
      action: null,
      todo: 'Retry once the network answers.',
      note: error instanceof Error ? error.message : 'Request failed',
    })
  }

  /**
   * Bridging, which is a step and not a balance.
   *
   * GLM held on Ethereum cannot pay for gas on an L3 directly — it has to be
   * bridged across, the same as any OP-stack deposit. There is no way to check the
   * bridged balance from here because the L3 has no public endpoint, so this is
   * reported as waiting on the network. It is listed anyway: a publisher who holds
   * GLM and expects to be finished would otherwise hit this without warning.
   */
  out.push({
    id: 'bridge',
    step: 4,
    label: `Bridge ${ARKIV_GAS.symbol} to the L3`,
    state: 'unknown',
    value: ARKIV.statusShort,
    action: null,
    todo: `Holding ${ARKIV_GAS.symbol} on Ethereum is not the same as having gas on Arkiv: it has to be deposited across the bridge first, as with any OP-stack chain. There is no public network to bridge to at the moment, so this cannot be done yet.`,
    note: `Once a public network exists, the faucet is expected at ${ARKIV.faucet} — the path convention every previous devnet has used. Treat it as a prediction rather than a live endpoint: it answers 503 today along with the rest of the retired host, and the next network will very likely be a new hostname on the same shape.`,
  })

  // A required layer, and not a balance — so it is reported as unavailable rather
  // than unmet. Arkiv binds an archive to its community and carries its piece
  // CIDs; nothing discovers an archive without it.
  out.push({
    id: 'arkiv',
    step: 5,
    label: 'An entity in the index',
    action: { href: ARKIV_DOCS, label: 'Follow Arkiv' },
    todo:
      'Nothing to do yet, and nothing you can do. When a public Arkiv network is available the publisher writes this entity for you as the final step of a publish.',
    state: 'unknown',
    value: ARKIV.statusShort,
    note: `Required, not optional: the Arkiv entity is what makes an archive findable and attributable. ${ARKIV.statusNote} Encryption, pinning, proof and payment are all unaffected: an archive stored today holds and opens, it simply is not yet indexed.`,
  })

  return out
}
