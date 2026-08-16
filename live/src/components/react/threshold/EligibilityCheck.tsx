import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GATES, type GateSpec } from '../../../lib/chains.ts'
import {
  acquireLink,
  formatBalance,
  isAddress,
  readHoldings,
  type Holding,
} from '../../../lib/threshold.ts'

/**
 * PATH A — THE READER'S CHECK
 *
 * A reader pastes an address and this reports, against live chain state, exactly
 * which of the sixteen candidate gates that address already clears — and, on the
 * publisher path, whether it holds the FIL and USDFC that publishing requires.
 *
 * ── Why an address field and not a wallet button ─────────────────────────────
 * Because a wallet connection would be asking for something this page does not
 * need. Balances are public: the whole check is `eth_call`, and `eth_call` does
 * not care who is asking. Connecting would add a permission prompt, a session, a
 * dependency and a reason to be suspicious, in exchange for nothing.
 *
 * So there is no connection, no signature, no session and no storage. The
 * address is held in component state and is gone on reload. The requests go from
 * the reader's browser straight to public RPCs; no Haven server sees the address,
 * because on this surface there is no Haven server at all.
 *
 * A wallet IS eventually required — an EIP-712 signature proves control of the
 * address so `haven-aol` will derive a key. That happens in the reader client at
 * the moment of decryption, not here, and the interface says so rather than
 * implying this page has granted anything.
 */

export interface Identity {
  slug: string
  /** Captured collection artwork. */
  image: string | null
  owners: number | null
  supply: number | null
}

interface Props {
  /** Optional override. Normally the focus is read from the URL in the browser. */
  focus?: string | null
  /** Community artwork and figures, captured at build time. */
  identities?: Identity[]
}

/**
 * Which community the reader arrived for.
 *
 * This has to be resolved in the browser, not on the server. The surface is
 * statically prerendered, so `Astro.url.searchParams` is empty at build time —
 * reading the parameter server-side silently produced no focus at all, which is
 * exactly the kind of bug that only shows up when someone follows a real link.
 */
function focusFromLocation(): string | null {
  if (typeof location === 'undefined') return null
  const fromQuery = new URLSearchParams(location.search).get('gate')
  const fromHash = location.hash.replace(/^#/, '')
  const candidate = fromQuery ?? fromHash
  return candidate && bySlug.has(candidate) ? candidate : null
}

const bySlug = new Map(GATES.map((gate) => [gate.slug, gate]))

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/**
 * Contract names are written for machines. `ForgottenRunesWizardsCult` is the
 * real on-chain name and should be shown as such — but rendered with the word
 * breaks a reader expects, since the absence of spaces is an artefact of Solidity
 * identifiers, not the community's own styling.
 */
function humanise(name: string): string {
  if (name.includes(' ') || name.length < 12) return name
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

export default function EligibilityCheck({ focus: override = null, identities = [] }: Props) {
  const [focus, setFocus] = useState<string | null>(override)
  const [draft, setDraft] = useState('')
  const [address, setAddress] = useState<string | null>(null)
  const [holdings, setHoldings] = useState<Holding[] | null>(null)
  const [state, setState] = useState<'idle' | 'reading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const identity = useMemo(() => new Map(identities.map((entry) => [entry.slug, entry])), [identities])
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  const valid = isAddress(draft)

  /* ── The check ─────────────────────────────────────────────────────────── */
  const run = useCallback(
    async (value: string) => {
      if (!isAddress(value)) return
      const clean = value.trim()
      setState('reading')
      setError(null)
      setAddress(clean)

      try {
        setHoldings(await readHoldings(clean))
        setState('done')
      } catch (cause) {
        setHoldings(null)
        setError(cause instanceof Error ? cause.message : 'The check failed to run.')
        setState('error')
      }
    },
    [],
  )

  const forget = () => {
    setDraft('')
    setAddress(null)
    setHoldings(null)
    setState('idle')
    setError(null)
    inputRef.current?.focus()
  }

  /* ── Arriving from the Atlas ────────────────────────────────────────────
     A deep link carries the community, not the reader, so there is nothing to
     check on arrival — but the field should be waiting and focused. */
  useEffect(() => {
    const resolved = override ?? focusFromLocation()
    setFocus(resolved)
    if (resolved) inputRef.current?.focus({ preventScroll: true })
  }, [override])

  const rows = useMemo(() => {
    if (!holdings) return []
    const list = holdings
      .map((holding) => ({ holding, gate: bySlug.get(holding.slug) }))
      .filter((entry): entry is { holding: Holding; gate: GateSpec } => Boolean(entry.gate))
    // Cleared gates first, then the focused community, then the rest — the answer
    // to "what can I open" should not require scrolling.
    return list.sort((a, b) => {
      if (a.holding.eligible !== b.holding.eligible) return a.holding.eligible ? -1 : 1
      if (a.gate.slug === focus) return -1
      if (b.gate.slug === focus) return 1
      return 0
    })
  }, [holdings, focus])

  // Three groups, not a pass/fail list. What the address can open is the answer;
  // what it could join next is an invitation; what could not be read is neither.
  const granted = rows.filter((row) => row.holding.eligible)
  const available = rows.filter((row) => !row.holding.eligible && !row.holding.error)
  const unresolved = rows.filter((row) => !row.holding.eligible && row.holding.error)

  return (
    <div className="threshold" data-state={state}>
      {/* ── The field ──────────────────────────────────────────────────────── */}
      <form
        className="threshold-form"
        onSubmit={(event) => {
          event.preventDefault()
          void run(draft)
        }}
      >
        <div className="threshold-field">
          <label className="label" htmlFor="threshold-address">
            An address to check
          </label>
          <div className="threshold-input">
            <input
              id="threshold-address"
              ref={inputRef}
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…"
              value={draft}
              aria-invalid={draft.length > 0 && !valid}
              aria-describedby="threshold-privacy"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button type="submit" className="action action-sealed" disabled={!valid || state === 'reading'}>
              {state === 'reading' ? 'Reading…' : 'Run the checks'}
            </button>
          </div>

          {draft.length > 0 && !valid && (
            <p className="threshold-invalid" role="status">
              That is not a 20-byte address. Expected <code>0x</code> followed by 40 hex characters.
            </p>
          )}

          <p className="threshold-privacy" id="threshold-privacy">
            No wallet connection. No signature. No permission prompt. Nothing is stored, and nothing
            is sent to us — the request goes from this page straight to a public RPC, because a
            balance is public and checking one does not require your consent or ours.
          </p>
        </div>
      </form>

      {/* ── The result ─────────────────────────────────────────────────────── */}
      {state === 'error' && (
        <p className="threshold-error" role="alert">
          {error ?? 'The check failed to run.'}
        </p>
      )}

      {state === 'done' && address && holdings && (
        <div className="threshold-result" ref={resultsRef}>
          <header className="threshold-verdict">
            <div>
              <span className="label label-seal">Eligible to access</span>
              <p className="threshold-verdict-line">
                {granted.length === 0 ? (
                  <>No archives yet</>
                ) : (
                  <>
                    <strong>{granted.length}</strong>{' '}
                    {granted.length === 1 ? 'archive' : 'archives'}
                  </>
                )}
              </p>
              <p className="threshold-verdict-note">
                Read from live chain state for <span className="addr">{shorten(address)}</span>.
                Holding the asset is the entire authorisation — there is no account to open and no
                approval to wait for.
              </p>
            </div>
            <div className="threshold-verdict-actions">
              <button type="button" className="action action-quiet" onClick={forget}>
                Forget this address
              </button>
            </div>
          </header>

              {/* ── What this address can open ────────────────────────────
                  The point of the check is access, so the cleared communities
                  are the result — presented as archives now open, not as rows
                  that happened to pass a test. */}
              {granted.length > 0 && (
                <section className="threshold-granted" aria-labelledby="granted-head">
                  <h3 className="threshold-granted-head" id="granted-head">
                    <span className="label label-seal">Access</span>
                    {granted.length === 1
                      ? 'You are already inside one community'
                      : `You are already inside ${granted.length} communities`}
                  </h3>

                  <ul className="threshold-granted-list">
                    {granted.map(({ holding, gate }) => {
                      const art = identity.get(gate.slug)
                      return (
                        <li
                          className="threshold-grant"
                          key={gate.slug}
                          data-focus={gate.slug === focus ? 'true' : undefined}
                        >
                          <div className="threshold-grant-head">
                            {art?.image && (
                              <img
                                className="threshold-grant-mark"
                                src={art.image}
                                alt=""
                                width="44"
                                height="44"
                                loading="lazy"
                                decoding="async"
                              />
                            )}
                            <div className="threshold-grant-ident">
                              <h4 className="threshold-grant-name">
                                {holding.name ? humanise(holding.name) : gate.slug}
                              </h4>
                              <p className="threshold-grant-meta">
                                <span className="label threshold-grant-constellation">
                                  {gate.constellation}
                                </span>
                                {art?.owners && (
                                  <span className="threshold-grant-owners">
                                    {art.owners.toLocaleString('en-US')} holders
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>

                          <p className="threshold-grant-holding">
                            You hold{' '}
                            <strong className="tnum">{formatBalance(holding, gate)}</strong> — the gate
                            asks for <span className="tnum">{gate.threshold.toLocaleString('en-US')}</span>.
                          </p>

                          <p className="threshold-grant-note">{gate.premise}</p>
                        </li>
                      )
                    })}
                  </ul>

                  {/* Where the archive is actually opened. The check happens here;
                      reading happens in a client, and saying which one is the
                      difference between an answer and an instruction. */}
                  <div className="threshold-open">
                    <h4 className="threshold-open-head">
                      <span className="label label-seal">Next</span>
                      Open it in a reader
                    </h4>
                    <p className="threshold-open-lede">
                      This page can tell you the gate opens. It cannot open it — decryption happens on
                      your own device, in a client that holds no keys of its own. Both readers ask for
                      one EIP-712 signature to prove you control this address, then{' '}
                      <code>haven-aol</code> derives the key from the very balance above. No
                      transaction, no gas, no spending approval.
                    </p>
                    <ul className="threshold-clients">
                      <li className="threshold-client">
                        <h5 className="threshold-client-name">
                          <code>haven-dapp</code>
                          <span className="label">Browser</span>
                        </h5>
                        <p>
                          The web reader. TypeScript on Next.js, shipped as a static export to IPFS,
                          decrypting entirely in the tab and caching for offline playback.
                        </p>
                      </li>
                      <li className="threshold-client">
                        <h5 className="threshold-client-name">
                          <code>haven-mobile</code>
                          <span className="label">Android</span>
                        </h5>
                        <p>
                          The offline-first viewer. Kotlin with Compose, Media3 and Room, distributed
                          as an APK or through the Play Store — built for keeping an archive on a
                          device that may not be online.
                        </p>
                      </li>
                    </ul>
                    <a className="threshold-open-link" href="/codex/clients">
                      How the clients work
                      <span aria-hidden="true"> →</span>
                    </a>
                  </div>
                </section>
              )}

              {granted.length === 0 && (
                <section className="threshold-none" aria-labelledby="none-head">
                  <h3 className="threshold-granted-head" id="none-head">
                    <span className="label label-seal">Access</span>
                    Not yet — but the door is not locked to you
                  </h3>
                  <p className="threshold-granted-next">
                    This address does not hold any of the sixteen assets yet, which is simply where
                    everyone starts. Pick a community whose work you actually care about, acquire what
                    it gates on, and run this check again. There is no application and no waiting
                    list: the balance is the whole requirement, and it counts the moment it settles.
                  </p>
                </section>
              )}

              {/* ── What else is available ─────────────────────────────────
                  Framed as communities that can be joined, not as gates that
                  were failed. No pass/fail marks: a community you have not
                  joined is an option, not a deficiency. */}
              {available.length > 0 && (
                <section className="threshold-available" aria-labelledby="available-head">
                  <h3 className="threshold-available-head" id="available-head">
                    <span className="label">Communities you could join</span>
                    <span className="label threshold-available-count">{available.length}</span>
                  </h3>
                  <ul className="threshold-available-list">
                    {available.map(({ holding, gate }) => {
                      const link = acquireLink(gate)
                      return (
                        <li className="threshold-option" key={gate.slug} data-focus={gate.slug === focus ? 'true' : undefined}>
                          <span className="threshold-option-name">{gate.slug}</span>
                          <span className="threshold-option-need">
                            Hold {gate.threshold.toLocaleString('en-US')}{' '}
                            {gate.kind === 'collection' ? 'from the collection' : 'tokens'}
                          </span>
                          <a
                            className="threshold-option-link"
                            href={link.href}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {link.venue}
                            <span aria-hidden="true"> ↗</span>
                          </a>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )}

              {/* Honest about what could not be established, kept separate from
                  both lists so it is never read as a verdict. */}
              {unresolved.length > 0 && (
                <section className="threshold-unresolved">
                  <h3 className="threshold-available-head">
                    <span className="label">Could not be determined</span>
                    <span className="label threshold-available-count">{unresolved.length}</span>
                  </h3>
                  <ul className="threshold-available-list">
                    {unresolved.map(({ holding, gate }) => (
                      <li className="threshold-option" key={gate.slug}>
                        <span className="threshold-option-name">{gate.slug}</span>
                        <span className="threshold-option-need">{holding.error}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
        </div>
      )}
    </div>
  )
}
