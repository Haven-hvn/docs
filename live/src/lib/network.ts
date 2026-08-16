/**
 * NETWORK SELECTION — mainnet or devnet
 *
 * Haven runs on four public networks, and every one of them has a test
 * deployment. This is the document-wide switch between the two sets, mirroring
 * the ink edition toggle: an attribute on `<html>`, persisted, applied before
 * paint, and broadcast so React islands can follow it.
 *
 * ── What it honestly changes ─────────────────────────────────────────────────
 * Filecoin has real deployments on both mainnet and calibration, and the pin
 * contracts are captured for both — so storage figures, provider counts and
 * per-uploader attribution genuinely differ. Publisher readiness reads a
 * different chain and a different USDFC contract. The founder's chain choices
 * become testnets.
 *
 * ── What it cannot change ────────────────────────────────────────────────────
 * The sixteen candidate communities exist on Ethereum mainnet. There is no
 * testnet Nouns and no calibration Autoglyphs, so the roster does not have a
 * devnet equivalent and the interface says so rather than inventing one. Arkiv
 * is devnet-only in the other direction: the index has no mainnet deployment
 * yet, which the toggle also states rather than implying parity.
 */

export type Network = 'mainnet' | 'devnet'

export const NETWORK_STORAGE_KEY = 'haven:network'

/** Fired on `document` whenever the selection changes. */
export const NETWORK_EVENT = 'haven:network'

export interface NetworkDetail {
  network: Network
}

/** The Filecoin deployment each selection maps to, as keyed in `STORAGE`. */
export const FILECOIN_DEPLOYMENT: Record<Network, 'mainnet' | 'calibration'> = {
  mainnet: 'mainnet',
  devnet: 'calibration',
}

/**
 * The current selection.
 *
 * Reads the attribute rather than storage, so it agrees with what is on screen
 * even mid-transition. Defaults to mainnet, which is what an unqualified figure
 * on this site should always mean.
 */
export function currentNetwork(): Network {
  if (typeof document === 'undefined') return 'mainnet'
  return document.documentElement.dataset.network === 'devnet' ? 'devnet' : 'mainnet'
}

/**
 * Subscribe to changes. Returns an unsubscribe function.
 *
 * Islands use this instead of polling: the toggle lives in the masthead, which is
 * Astro-rendered chrome outside any React tree, so a custom event is the only
 * thing the two share.
 */
export function onNetworkChange(handler: (network: Network) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<NetworkDetail>).detail
    handler(detail?.network ?? currentNetwork())
  }
  document.addEventListener(NETWORK_EVENT, listener)
  return () => document.removeEventListener(NETWORK_EVENT, listener)
}

/** Human labels, kept here so chrome and islands cannot disagree. */
export const NETWORK_LABEL: Record<Network, string> = {
  mainnet: 'Mainnet',
  devnet: 'Devnet',
}

export const NETWORK_NOTE: Record<Network, string> = {
  mainnet: 'Live networks. Real assets, real storage, real money.',
  devnet: 'Test networks. Calibration storage and faucet tokens — nothing here costs anything.',
}
