import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Scene from './Scene.tsx'
import {
  buildDaoBodies,
  CONSTELLATIONS,
  axisLabel,
  type Axis,
  type Body,
  type Constellation,
} from '../../../lib/atlas.ts'
import { readGateFacts, pulseAll, pendingPulses, type ChainPulse, type GateFacts } from '../../../lib/live.ts'
import { fetchTokenQuotes, indexQuotes, type MarketQuote } from '../../../lib/market.ts'
import { bytesInline, integer, ms } from '../../../lib/format.ts'
import { currentNetwork, onNetworkChange, type Network } from '../../../lib/network.ts'

/**
 * THE ATLAS
 *
 * The consumer entry point. A reader who knows nothing about the protocol should
 * be able to arrive here, read three sentences, and understand what they are
 * looking at — and a reader who knows everything should be able to click through
 * to a block explorer and check it.
 *
 * The axis control does not rescale one population; it swaps which population is
 * on the map. That is the honest design, because storage and capitalisation
 * measure different things about different entities, and the thing that would
 * join them is the metadata index — which is not operational.
 */

interface UploaderRow {
  uploader: string
  bytes: string
  dataSets: number
  providers: number
  share: number
}

interface Deployment {
  uploaders: UploaderRow[]
  chainLabel: string
  storage: {
    totalBytes: string
    liveDataSets: number
    providerCount: number
    blockNumber: string
    capturedAt: string
    usdfcEscrowed: string
    usdfcDecimals: number
    usdfcSymbol: string
    attributedBytes: string
    unattributedBytes: string
    unattributedDataSets: number
    uploaderCount: number
  }
}

interface Props {
  /** Both Filecoin deployments, captured at build time. */
  deployments: Record<Network, Deployment>
  collectionQuotes: MarketQuote[]
}

const AXES: Array<{ id: Axis; label: string; key: string }> = [
  { id: 'capitalisation', label: 'Capitalisation', key: '1' },
  { id: 'storage', label: 'Storage', key: '2' },
]

function formatUnits(value: string, decimals: number): string {
  try {
    const raw = BigInt(value)
    return (raw / 10n ** BigInt(decimals)).toLocaleString('en-US')
  } catch {
    return '—'
  }
}

export default function Atlas({ deployments, collectionQuotes }: Props) {
  /* ── Which deployment is on screen ──────────────────────────────────────
     Both ledgers arrive as props, so switching is a re-render rather than a
     fetch. The toggle lives in the masthead — Astro chrome, outside this tree —
     so the only channel between them is the document event. */
  const [network, setNetwork] = useState<Network>('mainnet')

  useEffect(() => {
    setNetwork(currentNetwork())
    return onNetworkChange(setNetwork)
  }, [])

  const deployment = deployments[network] ?? deployments.mainnet
  const uploaders = deployment.uploaders
  const storage = { ...deployment.storage, chainLabel: deployment.chainLabel }

  const [axis, setAxis] = useState<Axis>('capitalisation')
  const [facts, setFacts] = useState<Map<string, GateFacts>>(new Map())
  const [quotes, setQuotes] = useState<Map<string, MarketQuote>>(() => indexQuotes(collectionQuotes))
  const [pulses, setPulses] = useState<ChainPulse[]>(() => pendingPulses())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Constellation | null>(null)
  const [hover, setHover] = useState<{ body: Body; x: number; y: number } | null>(null)
  const [query, setQuery] = useState('')
  const [briefed, setBriefed] = useState(true)
  const [quality, setQuality] = useState<'high' | 'low'>('high')
  const [ready, setReady] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLOListElement>(null)

  /* ── First run: the brief ───────────────────────────────────────────────
     Shown once. A map like this is illegible without three sentences of
     orientation, and hiding that behind a help icon is a failure of nerve. */
  useEffect(() => {
    try {
      setBriefed(localStorage.getItem('haven:atlas-briefed') === 'true')
    } catch {
      setBriefed(false)
    }
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ?? false
    if (saveData || matchMedia('(prefers-reduced-motion: reduce)').matches) setQuality('low')
  }, [])

  const dismissBrief = () => {
    setBriefed(true)
    try {
      localStorage.setItem('haven:atlas-briefed', 'true')
    } catch {}
  }

  /* ── Live reads ─────────────────────────────────────────────────────────
     Gate facts and token quotes on mount; network pulses on an interval. */
  useEffect(() => {
    let cancelled = false

    readGateFacts().then((next) => {
      if (!cancelled) {
        setFacts(next)
        setReady(true)
      }
    })

    fetchTokenQuotes().then((tokenQuotes) => {
      if (cancelled || tokenQuotes.length === 0) return
      setQuotes((current) => {
        const merged = new Map(current)
        for (const quote of tokenQuotes) merged.set(quote.slug, quote)
        return merged
      })
    })

    const runPulses = async () => {
      const next = await pulseAll(network === 'devnet' ? 'filecoinCalibration' : 'filecoin')
      // The station is keyed 'filecoin' on the map whichever deployment answers,
      // so the probe's key is normalised rather than leaving the station unlit.
      if (!cancelled) {
        setPulses(next.map((pulse) => (pulse.key === 'filecoinCalibration' ? { ...pulse, key: 'filecoin' } : pulse)))
      }
    }
    runPulses()
    const interval = window.setInterval(runPulses, 20_000)

    // If gate facts are slow, reveal the scene anyway rather than holding a
    // blank stage — bodies fill in as data lands.
    const reveal = window.setTimeout(() => !cancelled && setReady(true), 2_400)

    return () => {
      cancelled = true
      clearInterval(interval)
      clearTimeout(reveal)
    }
  }, [network])

  // The selection survives an axis change — it is the same community either way,
  // and watching a body resize while its inspector updates is the whole point of
  // having two measures. The hover does NOT survive: the tooltip was captured
  // against the old measure and the pointer has not moved since, so leaving it up
  // shows a stale figure attached to a body that just changed size.
  useEffect(() => {
    setHover(null)
  }, [axis])

  /* ── Keep the index and the map in agreement ────────────────────────────
     Selecting a body on the map marks its row current, but the roster scrolls —
     so the row that just became current is often out of sight. Bringing it into
     view is what makes the two views read as one instrument rather than two
     panels that happen to share data. */
  useEffect(() => {
    if (!selectedId) return
    const row = listRef.current?.querySelector<HTMLElement>(`[data-body='${selectedId}']`)
    if (!row) return
    row.scrollIntoView({
      block: 'nearest',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }, [selectedId])

  // The same sixteen communities on both axes. Switching the axis re-measures
  // them rather than replacing them, so a body keeps its identity, its artwork
  // and its lane, and only its size changes.
  const bodies = useMemo(
    () => buildDaoBodies({ facts, quotes, uploaders, axis }),
    [facts, quotes, uploaders, axis],
  )

  const visible = useMemo(() => {
    let list = bodies
    if (filter) {
      list = list.filter((body) => body.detail.constellation === filter)
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(
        (body) => body.label.toLowerCase().includes(q) || body.sublabel.toLowerCase().includes(q),
      )
    }
    return list
  }, [bodies, axis, filter, query])

  const selected = useMemo(
    () => bodies.find((body) => body.id === selectedId) ?? null,
    [bodies, selectedId],
  )

  const operational = useMemo(() => {
    const map: Record<string, boolean> = {}
    for (const pulse of pulses) {
      map[pulse.key] = pulse.health === 'live' || pulse.health === 'slow'
    }
    return map
  }, [pulses])

  const arkiv = pulses.find((pulse) => pulse.key === 'arkiv')
  const answering = pulses.filter((p) => p.health === 'live' || p.health === 'slow').length

  /* ── Keyboard ───────────────────────────────────────────────────────────── */
  const cycle = useCallback(
    (direction: 1 | -1) => {
      if (visible.length === 0) return
      const index = visible.findIndex((body) => body.id === selectedId)
      const next = index === -1 ? 0 : (index + direction + visible.length) % visible.length
      setSelectedId(visible[next]?.id ?? null)
    },
    [visible, selectedId],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'

      if (event.key === 'Escape') {
        if (typing) {
          setQuery('')
          searchRef.current?.blur()
        } else {
          setSelectedId(null)
        }
        return
      }
      if (typing) return

      if (event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (event.key === '1') setAxis('capitalisation')
      if (event.key === '2') setAxis('storage')
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault()
        cycle(1)
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault()
        cycle(-1)
      }
    }

    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [cycle])

  /* ── Selection ───────────────────────────────────────────────────────────
     One handler for both routes in. Clicking a body on the map and clicking its
     row in the index are the same act and must behave identically, toggle
     included — otherwise the map and the list disagree about what a click means. */
  const select = useCallback((id: string | null) => {
    setSelectedId((current) => (id === null || current === id ? null : id))
  }, [])

  const meta = axisLabel(axis)

  return (
    <div className="atlas" data-axis={axis}>
      {/* ── The stage ─────────────────────────────────────────────────────── */}
      <div className="atlas-stage stage-interactive">
        <Scene
          bodies={visible}
          axis={axis}
          selectedId={selectedId}
          filter={filter}
          operational={operational}
          showLattice
          onHover={(body, client) =>
            setHover(body && client ? { body, x: client.x, y: client.y } : null)
          }
          onSelect={(body) => select(body?.id ?? null)}
          quality={quality}
        />
        <div className="stage-placeholder" data-ready={ready ? 'true' : 'false'} aria-hidden="true" />
      </div>

      {/* ── Tooltip ───────────────────────────────────────────────────────── */}
      {hover && (
        <div
          className="atlas-tip"
          style={{ left: `${hover.x}px`, top: `${hover.y}px` }}
          role="presentation"
        >
          <span className="atlas-tip-name">{hover.body.label}</span>
          <span className="atlas-tip-measure">{hover.body.sublabel}</span>
          {hover.body.detail.constellation && (
            <span className="label atlas-tip-constellation">{hover.body.detail.constellation}</span>
          )}
        </div>
      )}

      {/* ── Axis control ──────────────────────────────────────────────────── */}
      <div className="atlas-axis-control glass">
        <div className="atlas-axis-tabs" role="group" aria-label="Measure">
          {AXES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="atlas-axis-tab"
              aria-pressed={axis === entry.id}
              onClick={() => setAxis(entry.id)}
            >
              <span className="atlas-axis-label">{entry.label}</span>
              <kbd className="atlas-key">{entry.key}</kbd>
            </button>
          ))}
        </div>
        <p className="atlas-axis-measure">{meta.measure}</p>
        <p className="atlas-axis-note">{meta.note}</p>
      </div>

      {/* ── Index: the accessible path to every body ─────────────────────── */}
      <aside className="atlas-index glass" aria-label="Bodies on the map">
        <header className="atlas-index-head">
          <span className="label label-seal">
            Candidate gates
          </span>
          <span className="label atlas-index-count">{visible.length}</span>
        </header>

        <div className="atlas-search">
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search"
            aria-label="Search bodies"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd className="atlas-key">/</kbd>
        </div>

        {(
          <div className="atlas-filters" role="group" aria-label="Constellation">
            <button
              type="button"
              className="atlas-filter"
              aria-pressed={filter === null}
              onClick={() => setFilter(null)}
            >
              All
            </button>
            {CONSTELLATIONS.map((constellation) => (
              <button
                key={constellation}
                type="button"
                className="atlas-filter"
                aria-pressed={filter === constellation}
                onClick={() => setFilter(filter === constellation ? null : constellation)}
              >
                {constellation}
              </button>
            ))}
          </div>
        )}

        <ol className="atlas-list" ref={listRef}>
          {visible.map((body, index) => (
            <li key={body.id}>
              <button
                type="button"
                className="atlas-list-item"
                data-body={body.id}
                aria-current={selectedId === body.id}
                onClick={() => select(body.id)}
                onPointerEnter={(event) =>
                  setHover({ body, x: event.clientX, y: event.clientY })
                }
                onPointerLeave={() => setHover(null)}
              >
                <span className="atlas-list-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="atlas-list-name">{body.label}</span>
                <span className="atlas-list-measure">{body.sublabel}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 && (
            <li className="atlas-list-empty">Nothing matches that search.</li>
          )}
        </ol>
      </aside>

      {/* ── Inspector ─────────────────────────────────────────────────────── */}
      {selected && (
        <aside className="atlas-inspector glass" aria-label={`${selected.label} detail`}>
          <header className="atlas-inspector-head">
            <div>
              {selected.detail.constellation && (
                <span className="label label-seal">{selected.detail.constellation}</span>
              )}
              <h2 className="atlas-inspector-title">{selected.detail.heading}</h2>
            </div>
            <button
              type="button"
              className="atlas-close"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
            >
              ✕
            </button>
          </header>

          {selected.detail.premise && <p className="atlas-premise">{selected.detail.premise}</p>}

          <dl className="atlas-rows">
            {selected.detail.rows.map((row) => (
              <div className="atlas-row" key={row.label}>
                <dt className="label">{row.label}</dt>
                <dd className={row.mono ? 'atlas-row-value addr' : 'atlas-row-value'}>{row.value}</dd>
                {row.note && <dd className="atlas-row-note">{row.note}</dd>}
              </div>
            ))}
          </dl>

          {selected.detail.pending && selected.detail.pending.length > 0 && (
            <div className="atlas-pending">
              <span className="label">Awaiting the metadata index</span>
              <ul>
                {selected.detail.pending.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="atlas-pending-note">
                {arkiv?.note ??
                  'Arkiv carries metadata only. Storage, proofs, payment and gating are unaffected.'}
              </p>
            </div>
          )}

          {/* Outbound. The Atlas answers "who is here"; these answer "and what
              do I do about it" — acquire the asset, or check whether the address
              already clears the gate. */}
          {(selected.detail.acquire || selected.detail.enrol) && (
            <div className="atlas-onward">
              {selected.detail.enrol && (
                <a className="atlas-enrol" href={selected.detail.enrol}>
                  Check if you already qualify
                  <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                    <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </a>
              )}
              {selected.detail.acquire && (
                <a
                  className="atlas-acquire"
                  href={selected.detail.acquire.href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Acquire on {selected.detail.acquire.venue}
                  <span aria-hidden="true"> ↗</span>
                </a>
              )}
            </div>
          )}

          {selected.detail.explorer && (
            <a
              className="atlas-verify"
              href={selected.detail.explorer}
              target="_blank"
              rel="noreferrer noopener"
            >
              Verify on the explorer
              <svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </a>
          )}
        </aside>
      )}

      {/* ── Telemetry strip ───────────────────────────────────────────────── */}
      <footer className="atlas-telemetry glass">
        <div className="atlas-telemetry-networks">
          {pulses.map((pulse) => (
            <div className="atlas-telemetry-net" key={pulse.key} data-health={pulse.health}>
              <span className="label atlas-telemetry-name">{pulse.label}</span>
              <span className="atlas-telemetry-value">{pulse.value ?? '—'}</span>
              <span className="atlas-telemetry-latency">{ms(pulse.latencyMs)}</span>
            </div>
          ))}
        </div>

        <div className="atlas-telemetry-storage">
          <span className="label label-seal">
            Under proof · {network === 'devnet' ? 'Calibration' : 'Mainnet'}
          </span>
          <span className="atlas-telemetry-figure">{bytesInline(Number(storage.totalBytes))}</span>
          <span className="atlas-telemetry-note">
            {integer(storage.liveDataSets)} data sets · {storage.providerCount} providers ·{' '}
            {formatUnits(storage.usdfcEscrowed, storage.usdfcDecimals)} {storage.usdfcSymbol} escrowed ·{' '}
            {storage.chainLabel} block {integer(Number(storage.blockNumber))}
          </span>
          {/* The map can only place bytes it can attribute to an address. Stating
              the gap next to the headline figure keeps the two honest about each
              other — the difference is not missing, it is unattributable. */}
          <span className="atlas-telemetry-note">
            {bytesInline(Number(storage.attributedBytes))} carries a payer on record across{' '}
            {integer(storage.uploaderCount)} uploaders ·{' '}
            {bytesInline(Number(storage.unattributedBytes))} on{' '}
            {integer(storage.unattributedDataSets)} sets registered straight against the verifier, with
            no address to charge
          </span>
        </div>

        <div className="atlas-telemetry-state">
          <span className={`pip ${answering === 0 ? 'pip-idle' : ''}`} aria-hidden="true" />
          <span className="label">{answering}/{pulses.length} answering</span>
        </div>
      </footer>

      {/* ── The brief ─────────────────────────────────────────────────────── */}
      {!briefed && (
        <div className="atlas-brief-scrim" role="dialog" aria-modal="true" aria-labelledby="brief-title">
          <div className="atlas-brief">
            <span className="label label-seal">Reading the Atlas</span>
            <h2 className="atlas-brief-title" id="brief-title">
              Three things and you can read the whole map.
            </h2>
            <ol className="atlas-brief-list">
              <li>
                <span className="folio">01</span>
                <p>
                  <strong>Every body is a community.</strong> Sixteen candidate gates — real
                  contracts whose holders could open an archive. The same sixteen appear on both
                  axes; the axis control re-measures them rather than replacing them, so a body keeps
                  its identity and only changes size.
                </p>
              </li>
              <li>
                <span className="folio">02</span>
                <p>
                  <strong>Size is the measure, and only the measure.</strong> Volume tracks the value —
                  market capitalisation on one axis, bytes pinned under proof on the other. The four
                  outer stations are infrastructure; they are never sized, because the price of a
                  network has nothing to do with whether an archive holds. Storage providers are not
                  bodies either: they supply the capacity, they do not publish the archive.
                </p>
              </li>
              <li>
                <span className="folio">03</span>
                <p>
                  <strong>One number here is not a measurement.</strong> The bytes are real, summed
                  from live pin-contract reads. But nothing on Filecoin records which community an
                  uploader publishes for — that hop is the metadata index, and it is not yet
                  operational, so the assignment of uploaders to communities is a placeholder. The
                  dashed lines are that missing hop, drawn rather than hidden.
                </p>
              </li>
            </ol>
            <button type="button" className="action action-sealed" onClick={dismissBrief}>
              Enter the Atlas
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
