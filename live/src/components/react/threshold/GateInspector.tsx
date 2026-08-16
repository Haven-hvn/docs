import { useEffect, useRef, useState } from 'react'
import { CHAINS, type ChainKey } from '../../../lib/chains.ts'
import { inspectContract, isAddress, type GateCandidate } from '../../../lib/threshold.ts'
import { currentNetwork, onNetworkChange, type Network } from '../../../lib/network.ts'

/**
 * PATH C — THE FOUNDER'S GATE
 *
 * A founder does not have to deploy anything. If a community already has an NFT
 * or a token, that asset is already a gate — Haven only ever asks it for a
 * balance. This inspects any contract and says plainly whether it can serve.
 *
 * The findings are written for someone who has never deployed a contract. Every
 * one of them is derived from a live call, not from a heuristic about the address:
 * the name and symbol it reports, whether it declares ERC-721, whether it exposes
 * decimals like a fungible token, whether anything has been issued, and above all
 * whether `balanceOf` answers — which is the only hard requirement there is.
 */

/**
 * Chains a founder can test a gate on.
 *
 * Only the ones the project actually configures an RPC for are offered. There is
 * no testnet list here because `CHAINS` has no testnet EVM entries — inventing
 * endpoints for Sepolia would mean shipping a picker whose options fail. On
 * devnet the picker is therefore unchanged and the interface says why.
 */
const CHOICES: Array<{ id: ChainKey; label: string }> = [
  { id: 'ethereum', label: 'Ethereum' },
  { id: 'base', label: 'Base' },
  { id: 'optimism', label: 'Optimism' },
]

export default function GateInspector() {
  const [draft, setDraft] = useState('')
  const [chain, setChain] = useState<ChainKey>('ethereum')
  const [result, setResult] = useState<GateCandidate | null>(null)
  const [state, setState] = useState<'idle' | 'reading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [threshold, setThreshold] = useState('1')
  const inputRef = useRef<HTMLInputElement>(null)
  const [network, setNetwork] = useState<Network>('mainnet')

  useEffect(() => {
    setNetwork(currentNetwork())
    return onNetworkChange(setNetwork)
  }, [])

  const valid = isAddress(draft)

  const run = async () => {
    if (!valid) return
    setState('reading')
    setError(null)
    try {
      setResult(await inspectContract(draft.trim(), chain))
      setState('done')
    } catch (cause) {
      setResult(null)
      setError(cause instanceof Error ? cause.message : 'The inspection failed to run.')
      setState('error')
    }
  }

  const spec = CHAINS[chain]

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
          <label className="label" htmlFor="gate-address">
            A contract address to test as a gate
          </label>

          <div className="threshold-chains" role="group" aria-label="Which chain">
            {CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className="threshold-chain"
                aria-pressed={chain === choice.id}
                onClick={() => setChain(choice.id)}
              >
                {choice.label}
              </button>
            ))}
          </div>

          <div className="threshold-input">
            <input
              id="gate-address"
              ref={inputRef}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="0x…"
              value={draft}
              aria-invalid={draft.length > 0 && !valid}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button
              type="submit"
              className="action action-sealed"
              disabled={!valid || state === 'reading'}
            >
              {state === 'reading' ? 'Reading…' : 'Test this contract'}
            </button>
          </div>

          {draft.length > 0 && !valid && (
            <p className="threshold-invalid" role="status">
              That is not a 20-byte address. Expected <code>0x</code> followed by 40 hex characters.
            </p>
          )}

          <p className="threshold-privacy">
            Any contract on {spec.name} — one your community already has, or one you have just
            deployed. This reads public state only; nothing is connected and nothing is written.
            {network === 'devnet' && (
              <>
                {' '}
                Devnet is selected, but a gate is read on whichever chain it lives on: these three are
                the chains Haven is configured to read, so the picker does not change. A gate deployed
                on a test network is checked by the client that reads it, not here.
              </>
            )}
          </p>
        </div>
      </form>

      {state === 'error' && (
        <p className="threshold-error" role="alert">
          {error ?? 'The inspection failed to run.'}
        </p>
      )}

      {state === 'done' && result && (
        <div className="threshold-result">
          <header className="threshold-verdict">
            <div>
              <span className="label label-seal">Verdict</span>
              <p className="threshold-verdict-line">
                {result.usable ? 'This can gate an archive' : 'This cannot gate an archive as it stands'}
              </p>
              <p className="threshold-verdict-note">
                {result.name ? (
                  <>
                    <strong>{result.name}</strong>
                    {result.symbol && <> ({result.symbol})</>} on {spec.name}.{' '}
                  </>
                ) : (
                  <>An unnamed contract on {spec.name}. </>
                )}
                {result.usable
                  ? 'Haven asks a gate exactly one question, and this contract answers it.'
                  : 'Haven needs a contract that reports per-address balances. See below for what was found.'}
              </p>
            </div>
            <div className="threshold-verdict-actions">
              <a
                className="threshold-option-link"
                href={spec.explorerAddress(result.address)}
                target="_blank"
                rel="noreferrer noopener"
              >
                View on explorer<span aria-hidden="true"> ↗</span>
              </a>
            </div>
          </header>

          <dl className="threshold-checks">
            {result.findings.map((finding) => (
              <div className="threshold-check" key={finding.label} data-state={finding.state === 'ok' ? 'met' : finding.state === 'fail' ? 'unmet' : 'unknown'}>
                <dt>
                  <span
                    className="threshold-mark"
                    data-state={finding.state === 'ok' ? 'met' : finding.state === 'fail' ? 'unmet' : 'unknown'}
                  >
                    {finding.state === 'ok' ? 'Good' : finding.state === 'fail' ? 'Blocking' : 'Check'}
                  </span>
                  {finding.label}
                </dt>
                <dd className="threshold-check-note">{finding.detail}</dd>
              </div>
            ))}
          </dl>

          {/* Choosing the threshold is the founder's only real policy decision,
              so it gets its own step rather than being buried in the findings. */}
          {result.usable && (
            <div className="threshold-open">
              <h4 className="threshold-open-head">
                <span className="label label-seal">Then</span>
                Decide how much someone must hold
              </h4>
              <p className="threshold-open-lede">
                This is the entire membership policy — one number. Everyone at or above it can open
                the archive; everyone below it cannot, continuously, with no list to maintain.
              </p>

              <div className="threshold-threshold">
                <label className="label" htmlFor="gate-threshold">
                  Units required
                </label>
                <input
                  id="gate-threshold"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
                <p className="threshold-threshold-note">
                  {result.standard === 'collection'
                    ? `Holding ${threshold || '1'} or more item${threshold === '1' ? '' : 's'} from the collection opens the archive.`
                    : result.decimals !== null
                      ? `Holding ${threshold || '1'} or more whole tokens opens the archive. Haven converts for the ${result.decimals} decimals itself, so you never write base units.`
                      : `Holding ${threshold || '1'} or more opens the archive.`}
                </p>
              </div>

              <p className="threshold-open-lede">
                Set it low and the archive is effectively open to the community. Set it high and it
                becomes an inner circle. Either is legitimate — but a threshold nobody can reach is a
                private archive, and one anybody can reach is a public one.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
