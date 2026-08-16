/**
 * HAVEN — MARKET
 *
 * The second axis of the Atlas. Storage answers "how much is kept here"; market
 * capitalisation answers "how much is this community worth". They are deliberately
 * separate measures and the interface never blends them into a single score.
 *
 * Provenance:
 *   Fungible governance assets — one batched request, live in the browser.
 *   Collections            — one request each, captured at build time because
 *                            the public endpoint rate-limits to a couple of
 *                            calls per minute. Carries an explicit `asOf`.
 *
 * On-chain supply always comes from the chain itself (see fevm.ts / viem
 * multicall). Only price and capitalisation come from a market source, because
 * price is not an on-chain fact.
 */

export interface MarketQuote {
  /** Gate slug from chains.ts. */
  slug: string
  priceUsd: number | null
  marketCapUsd: number | null
  /** Collections only: lowest listed price, in USD. */
  floorUsd: number | null
  change24h: number | null
  /** Remote logo, served from the market source's CDN. */
  image: string | null
  source: 'coingecko-token' | 'coingecko-nft'
  asOf: string
}

/** Gate slug → CoinGecko coin id. Verified live: all eleven resolve. */
export const TOKEN_MARKET_IDS: Record<string, string> = {
  fwb: 'friends-with-benefits-pro',
  whale: 'whale',
  superrare: 'superrare',
  rally: 'rally-2',
  juicebox: 'juicebox',
  kleros: 'kleros',
  radicle: 'radicle',
  audius: 'audius',
}

/** Gate slug → CoinGecko NFT collection id. */
export const NFT_MARKET_IDS: Record<string, string> = {
  'forgotten-runes': 'forgotten-runes-wizards-cult',
  'chain-runners': 'chain-runners',
  mfers: 'mfers',
  opepen: 'opepen-edition',
  autoglyphs: 'autoglyphs',
  blitmap: 'blitmap',
  terraforms: 'terraforms-by-mathcastles',
  nouns: 'nouns',
}

const COINGECKO = 'https://api.coingecko.com/api/v3'

/**
 * Live, batched quote for every fungible gate. One request, no key.
 * Returns an empty array rather than throwing — the Atlas must still draw.
 */
export async function fetchTokenQuotes(): Promise<MarketQuote[]> {
  const bySlug = Object.entries(TOKEN_MARKET_IDS)
  const ids = bySlug.map(([, id]) => id).join(',')
  const url = `${COINGECKO}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=60&page=1&sparkline=false&price_change_percentage=24h`

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(9_000), cache: 'no-store' })
    if (!response.ok) return []
    const rows = (await response.json()) as Array<{
      id: string
      current_price?: number | null
      market_cap?: number | null
      price_change_percentage_24h?: number | null
      image?: string | null
    }>
    if (!Array.isArray(rows)) return []

    const asOf = new Date().toISOString()
    const out: MarketQuote[] = []
    for (const [slug, id] of bySlug) {
      const row = rows.find((r) => r.id === id)
      if (!row) continue
      out.push({
        slug,
        priceUsd: row.current_price ?? null,
        // A reported capitalisation of zero means "not tracked", not "worthless".
        marketCapUsd: row.market_cap && row.market_cap > 0 ? row.market_cap : null,
        floorUsd: null,
        change24h: row.price_change_percentage_24h ?? null,
        image: row.image ?? null,
        source: 'coingecko-token',
        asOf,
      })
    }
    return out
  } catch {
    return []
  }
}

/** One collection. Used by the build-time capture, with spacing between calls. */
export async function fetchCollectionQuote(slug: string, id: string): Promise<MarketQuote | null> {
  try {
    const response = await fetch(`${COINGECKO}/nfts/${id}`, {
      signal: AbortSignal.timeout(12_000),
      cache: 'no-store',
    })
    if (!response.ok) return null
    const body = (await response.json()) as {
      market_cap?: { usd?: number | null }
      floor_price?: { usd?: number | null }
      floor_price_24h_percentage_change?: { usd?: number | null }
      image?: { small?: string | null }
      status?: { error_code?: number }
    }
    if (body.status?.error_code) return null
    return {
      slug,
      priceUsd: body.floor_price?.usd ?? null,
      marketCapUsd: body.market_cap?.usd && body.market_cap.usd > 0 ? body.market_cap.usd : null,
      floorUsd: body.floor_price?.usd ?? null,
      change24h: body.floor_price_24h_percentage_change?.usd ?? null,
      image: body.image?.small ?? null,
      source: 'coingecko-nft',
      asOf: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function indexQuotes(quotes: MarketQuote[]): Map<string, MarketQuote> {
  return new Map(quotes.map((quote) => [quote.slug, quote]))
}
