import { useEffect, useState } from 'react'
import { pulseAll, pendingPulses, type ChainPulse } from '../../lib/live.ts'
import { bytesInline, integer, ms, since } from '../../lib/format.ts'

/**
 * THE INSTRUMENT
 *
 * Six networks, measured in the reader's own browser, every fifteen seconds.
 *
 * The editorial position matters more than the component: a marketing page that
 * animates invented "live activity" is lying, and readers who matter can tell. So
 * this panel reports a real round-trip time and a real headline figure per
 * network, and where a network is not answering it says exactly that. Arkiv is
 * expected to fail — Braga was retired and no public network has replaced it — and the row reads as a
 * status, not an error.
 */

interface StorageSummary {
  totalBytes: string
  liveDataSets: number
  activeProviders: number | null
  providerCount: number
  usdfcEscrowed: string
  usdfcSupply: string
  usdfcDecimals: number
  usdfcSymbol: string
  blockNumber: string
  capturedAt: string
}

interface Props {
  storage: StorageSummary
}

const NET_CLASS: Record<string, string> = {
  arkiv: 'net-arkiv',
  icp: 'net-icp',
  ethereum: 'net-evm',
  base: 'net-evm',
  optimism: 'net-evm',
  filecoin: 'net-filecoin',
}

function formatUnits(value: string, decimals: number, digits = 0): string {
  try {
    const raw = BigInt(value)
    const base = 10n ** BigInt(decimals)
    const whole = raw / base
    if (digits === 0) return whole.toLocaleString('en-US')
    const frac = ((raw % base) * 10n ** BigInt(digits)) / base
    return `${whole.toLocaleString('en-US')}.${frac.toString().padStart(digits, '0')}`
  } catch {
    return '—'
  }
}

export default function LiveInstrument({ storage }: Props) {
  const [pulses, setPulses] = useState<ChainPulse[]>(() => pendingPulses())
  const [measuredAt, setMeasuredAt] = useState<number | null>(null)
  const [, setClockTick] = useState(0)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const next = await pulseAll()
      if (cancelled) return
      setPulses(next)
      setMeasuredAt(Date.now())
    }

    run()
    const interval = window.setInterval(run, 15_000)
    // Re-render the "measured" stamp without re-probing.
    const clock = window.setInterval(() => setClockTick((n) => n + 1), 1_000)

    return () => {
      cancelled = true
      clearInterval(interval)
      clearInterval(clock)
    }
  }, [])

  const answering = pulses.filter((p) => p.health === 'live' || p.health === 'slow').length
  const measured = pulses.filter((p) => p.latencyMs !== null)
  const median =
    measured.length > 0
      ? [...measured].sort((a, b) => (a.latencyMs ?? 0) - (b.latencyMs ?? 0))[Math.floor(measured.length / 2)]
          ?.latencyMs ?? null
      : null

  return (
    <div className="instrument">
      <div className="instrument-head">
        <div className="instrument-summary">
          <span className={`pip ${answering === 0 ? 'pip-idle' : ''}`} aria-hidden="true" />
          <span className="label label-ink">
            {answering} of {pulses.length} networks answering
          </span>
        </div>
        <span className="label instrument-stamp" aria-live="polite">
          {measuredAt
            ? `Measured from this browser · ${since(measuredAt)} · median ${ms(median)}`
            : 'Opening connections…'}
        </span>
      </div>

      <div className="instrument-scroll">
      <table className="specimen instrument-table">
        <thead>
          <tr>
            <th scope="col">Network</th>
            <th scope="col">Reports</th>
            <th scope="col" className="num">
              Figure
            </th>
            <th scope="col" className="num">
              Round trip
            </th>
            <th scope="col" className="note-col">
              State
            </th>
          </tr>
        </thead>
        <tbody>
          {pulses.map((pulse) => (
            <tr key={pulse.key} data-health={pulse.health}>
              <th scope="row" className="net-cell">
                <span className={`net-dot ${NET_CLASS[pulse.key] ?? ''}`} aria-hidden="true" />
                <span className="net-name">{pulse.label}</span>
              </th>
              <td className="label report-cell">{pulse.valueLabel}</td>
              <td className="num figure-cell">{pulse.value ?? '—'}</td>
              <td className="num latency-cell">{ms(pulse.latencyMs)}</td>
              <td className="note-cell">
                <span className="state-mark" data-health={pulse.health}>
                  {pulse.health === 'live'
                    ? 'Answering'
                    : pulse.health === 'slow'
                      ? 'Answering, slow'
                      : pulse.health === 'pending'
                        ? 'Measuring'
                        : pulse.key === 'arkiv'
                          ? 'No public network'
                          : 'No answer'}
                </span>
                <span className="note-text">{pulse.note}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {/* ── Storage economy ─────────────────────────────────────────────────
          Read from the Filecoin FEVM pin contracts. Enumerating every data set
          is ~4,400 calls, so the aggregate is captured at build against a stated
          block; the headline figures above are live. */}
      <div className="ledger">
        <div className="ledger-head">
          <span className="label label-seal">Storage under proof</span>
          <span className="label ledger-source">
            Filecoin FEVM · block {integer(Number(storage.blockNumber))} · captured{' '}
            {storage.capturedAt.slice(0, 10)}
          </span>
        </div>
        <dl className="ledger-grid">
          <div className="ledger-cell">
            <dt className="label">Pinned</dt>
            <dd className="ledger-figure">{bytesInline(Number(storage.totalBytes))}</dd>
            <dd className="ledger-note">Live data sets, leaf-counted on-chain</dd>
          </div>
          <div className="ledger-cell">
            <dt className="label">Data sets</dt>
            <dd className="ledger-figure">{integer(storage.liveDataSets)}</dd>
            <dd className="ledger-note">Proven and live at capture</dd>
          </div>
          <div className="ledger-cell">
            <dt className="label">Providers</dt>
            <dd className="ledger-figure">{integer(storage.providerCount)}</dd>
            <dd className="ledger-note">
              Holding those sets{storage.activeProviders ? ` · ${storage.activeProviders} registered` : ''}
            </dd>
          </div>
          <div className="ledger-cell">
            <dt className="label">{storage.usdfcSymbol} escrowed</dt>
            <dd className="ledger-figure">
              {formatUnits(storage.usdfcEscrowed, storage.usdfcDecimals)}
            </dd>
            <dd className="ledger-note">
              In the payment rails, of {formatUnits(storage.usdfcSupply, storage.usdfcDecimals)} issued
            </dd>
          </div>
        </dl>
      </div>

      <style>{`
        .instrument { display: grid; gap: 1.5rem; min-width: 0; }
        .instrument-scroll { overflow-x: auto; overscroll-behavior-x: contain; }

        .instrument-head {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 1.5rem; flex-wrap: wrap;
        }
        .instrument-summary { display: flex; align-items: center; gap: 0.6rem; }
        .instrument-stamp { color: var(--fg-4); }

        .instrument-table { table-layout: auto; }
        .instrument-table th[scope='row'] { font-weight: 500; }

        .net-cell { display: flex; align-items: center; gap: 0.6rem; white-space: nowrap; padding-top: 0.7rem; }
        .net-name { font-size: var(--text-small); color: var(--fg); }

        .report-cell { color: var(--fg-4); white-space: nowrap; }

        .num { text-align: right; font-variant-numeric: tabular-nums; }

        .figure-cell {
          font-family: var(--font-ledger); font-size: var(--text-small);
          color: var(--fg); white-space: nowrap;
        }

        .latency-cell {
          font-family: var(--font-ledger); font-size: var(--text-fine);
          color: var(--fg-3); white-space: nowrap;
        }

        .note-col { width: 42%; }
        .note-cell { display: grid; gap: 0.2rem; }

        .state-mark {
          font-family: var(--font-ledger); font-size: var(--text-nano);
          letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-3);
        }
        .state-mark[data-health='live'] { color: var(--color-arkiv); }
        .state-mark[data-health='slow'] { color: var(--color-evm); }
        .state-mark[data-health='down'] { color: var(--seal); }

        .note-text { font-size: var(--text-fine); line-height: 1.45; color: var(--fg-3); }

        /* A row that is not answering is dimmed but never hidden — the absence is
           part of the report. */
        tr[data-health='down'] .net-name { color: var(--fg-3); }
        tr[data-health='pending'] { opacity: 0.55; }

        /* ── Ledger ───────────────────────────────────────────────────────── */
        .ledger { border-top: 1px solid var(--line-strong); padding-top: 1.25rem; }
        .ledger-head {
          display: flex; align-items: baseline; justify-content: space-between;
          gap: 1rem; flex-wrap: wrap; margin-bottom: 1.25rem;
        }
        .ledger-source { color: var(--fg-4); }

        .ledger-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 0; margin: 0;
        }
        .ledger-cell {
          display: grid; gap: 0.4rem; padding: 0 1.25rem;
          border-left: 1px solid var(--line);
        }
        .ledger-cell:first-child { padding-left: 0; border-left: none; }

        .ledger-figure {
          margin: 0; font-family: var(--font-institution);
          font-size: clamp(1.5rem, 1.1rem + 1.1vw, 2.125rem);
          font-weight: 500; letter-spacing: -0.028em; line-height: 1;
          color: var(--fg); font-variant-numeric: tabular-nums;
        }
        .ledger-note { margin: 0; font-size: var(--text-fine); line-height: 1.4; color: var(--fg-3); }

        /* The state column carries a full sentence per row. Below ~1300px there
           is not enough measure for five columns, so it is dropped rather than
           squeezed — the same information is in the Codex. */
        @media (max-width: 1300px) {
          .note-col, .note-cell { display: none; }
        }

        @media (max-width: 900px) {
          .report-cell { display: none; }
          .ledger-cell { padding-inline: 0.875rem; }
        }
      `}</style>
    </div>
  )
}
