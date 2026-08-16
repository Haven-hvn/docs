import { useEffect, useRef, useState } from 'react'
import { isAddress, readPublisherReadiness, type Readiness } from '../../../lib/threshold.ts'
import {
  currentNetwork,
  FILECOIN_DEPLOYMENT,
  onNetworkChange,
  type Network,
} from '../../../lib/network.ts'

/**
 * PATH B — THE PUBLISHER'S READINESS
 *
 * Publishing spends real resources, so this reports whether an address actually
 * holds them: native FIL for Filecoin gas, and USDFC to escrow against a storage
 * deal. Both are live reads.
 *
 * The third requirement — an Arkiv entity — is reported as unavailable rather
 * than unmet, because Arkiv is not answering and a reader who has done everything
 * right should never be shown a failure for our outage.
 *
 * Same posture as the reader's check: an address is pasted, nothing is connected,
 * nothing is signed and nothing is kept.
 */
export default function PublisherCheck() {
  const [draft, setDraft] = useState('')
  const [checks, setChecks] = useState<Readiness[] | null>(null)
  const [state, setState] = useState<'idle' | 'reading' | 'done' | 'error'>('idle')
  /**
   * Re-checking is not the same as checking.
   *
   * Reusing the loading state would unmount the whole walkthrough and rebuild it,
   * so a publisher returning from a faucet would watch their progress disappear
   * and come back. This keeps the list on screen and only marks it as refreshing.
   */
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [network, setNetwork] = useState<Network>('mainnet')

  // Readiness is deployment-specific: calibration has its own USDFC contract and
  // its own gas. Flipping the toggle clears a stale result rather than leaving
  // mainnet figures on screen under a devnet label.
  useEffect(() => {
    setNetwork(currentNetwork())
    return onNetworkChange((next) => {
      setNetwork(next)
      setChecks(null)
      setState('idle')
    })
  }, [])

  const valid = isAddress(draft)

  const read = async () => readPublisherReadiness(draft.trim(), FILECOIN_DEPLOYMENT[network])

  const run = async () => {
    if (!valid) return
    setState('reading')
    setError(null)
    try {
      setChecks(await read())
      setState('done')
    } catch (cause) {
      setChecks(null)
      setError(cause instanceof Error ? cause.message : 'The check failed to run.')
      setState('error')
    }
  }

  const recheck = async () => {
    if (!valid || refreshing) return
    setRefreshing(true)
    try {
      setChecks(await read())
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The re-check failed to run.')
    } finally {
      setRefreshing(false)
    }
  }

  const ready = checks?.filter((check) => check.state === 'met').length ?? 0
  const blocked = checks?.filter((check) => check.state === 'unmet').length ?? 0
  // Only balances can be judged. The index entry cannot be checked while Arkiv's
  // devnet is offline, so counting it in the denominator would report a shortfall
  // the publisher has no way to close.
  const checkable = ready + blocked

  return (
    <div className="threshold" data-state={state}>
      <form
        className="threshold-form"
        onSubmit={(event) => {
          event.preventDefault()
          void run()
        }}
      >
        <div className="threshold-field">
          <label className="label" htmlFor="publisher-address">
            The address you would publish from
          </label>
          <div className="threshold-input">
            <input
              id="publisher-address"
              ref={inputRef}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…"
              value={draft}
              aria-invalid={draft.length > 0 && !valid}
              aria-describedby="publisher-privacy"
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="submit"
              className="action action-sealed"
              disabled={!valid || state === 'reading'}
            >
              {state === 'reading' ? 'Reading…' : 'Check readiness'}
            </button>
          </div>

          {draft.length > 0 && !valid && (
            <p className="threshold-invalid" role="status">
              That is not a 20-byte address. Expected <code>0x</code> followed by 40 hex characters.
            </p>
          )}

          <p className="threshold-privacy" id="publisher-privacy">
            Read-only, like everything else here. No wallet connection, no signature, nothing stored,
            and nothing sent to us — this page asks{' '}
            {network === 'devnet' ? 'Filecoin Calibration' : 'Filecoin'} and Ethereum directly for
            three public balances.
          </p>
        </div>
      </form>

      {state === 'error' && (
        <p className="threshold-error" role="alert">
          {error ?? 'The check failed to run.'}
        </p>
      )}

      {state === 'done' && checks && (
        <div className="threshold-result" data-refreshing={refreshing ? 'true' : undefined} aria-busy={refreshing}>
          <header className="threshold-verdict">
            <div>
              <span className="label label-seal">
                Readiness · {network === 'devnet' ? 'Calibration' : 'Mainnet'}
              </span>
              <p className="threshold-verdict-line">
                <strong>{ready}</strong> of {checkable} balances ready
              </p>
              <p className="threshold-verdict-note">
                {blocked === 0
                  ? 'This address can pay for everything publishing costs. The one outstanding requirement is the index entry, and that one is on us.'
                  : network === 'devnet'
                    ? 'Work down the list. Each step says where to go, and you can re-check after every one — nothing here costs real money.'
                    : 'Acquire what is missing below and run this again. They are ordinary balances — there is no application and nobody to approve you.'}
              </p>
            </div>
            <div className="threshold-verdict-actions">
              {/* Checkpointing is the whole point of a walkthrough: the reader
                  leaves for a faucet, comes back, and needs to confirm it landed
                  without retyping the address. */}
              <button
                type="button"
                className="action action-quiet"
                onClick={() => void recheck()}
                disabled={refreshing}
              >
                {refreshing ? 'Re-checking…' : 'Re-check this address'}
              </button>
              <span className="threshold-progress" aria-hidden="true">
                {checks
                  .filter((check) => check.state !== 'unknown')
                  .map((check) => (
                    <span
                      className="threshold-progress-tick"
                      key={check.id}
                      data-state={check.state}
                    />
                  ))}
              </span>
            </div>
          </header>

          <ol className="threshold-walk">
            {[...checks]
              .sort((a, b) => a.step - b.step)
              .map((check) => (
                <li className="threshold-walk-step" key={check.id} data-state={check.state}>
                  <span className="folio">{String(check.step).padStart(2, '0')}</span>

                  <div className="threshold-walk-body">
                    <h4 className="threshold-walk-head">
                      <span className="threshold-mark" data-state={check.state}>
                        {check.state === 'met'
                          ? 'Done'
                          : check.state === 'unmet'
                            ? 'To do'
                            : 'Waiting on the network'}
                      </span>
                      {check.label}
                    </h4>

                    <p className="threshold-walk-value tnum">{check.value}</p>

                    {/* Once a step is done the instruction is noise, so only the
                        outstanding ones tell you what to go and do. */}
                    {check.state !== 'met' && <p className="threshold-walk-todo">{check.todo}</p>}

                    <p className="threshold-check-note">{check.note}</p>

                    {check.state !== 'met' && check.action && (
                      <a
                        className="threshold-walk-action"
                        href={check.action.href}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        {check.action.label}
                        <span aria-hidden="true"> ↗</span>
                      </a>
                    )}
                  </div>
                </li>
              ))}
          </ol>
        </div>
      )}
    </div>
  )
}
