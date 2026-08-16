import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * THE INDEX
 *
 * A command palette, in the register of a reference work's index rather than an
 * app launcher: entries are grouped, numbered, and described. Opens on ⌘K, / or
 * any control marked `data-palette-open`.
 *
 * It is a real island rather than a CSS dialog because it needs fuzzy matching,
 * keyboard traversal and focus management — the three things people notice
 * immediately when they are done badly.
 */

export interface PaletteEntry {
  group: 'Surfaces' | 'The Threshold' | 'The Codex' | 'Verify' | 'Display'
  label: string
  hint?: string
  href?: string
  action?: 'edition'
  keywords?: string
}

interface Props {
  entries: PaletteEntry[]
}

/**
 * Two-tier match. A substring hit scores in the thousands; a scattered
 * subsequence scores in the tens.
 *
 * The tiers are then applied as a filter, not just a sort: once anything matches
 * as a substring, subsequence matches are dropped entirely. Without that, typing
 * "gate" surfaces every entry that happens to contain g…a…t…e in order, which is
 * most of them, and the index stops being useful precisely when the reader
 * starts typing.
 */
const SUBSTRING_FLOOR = 1_000

function score(query: string, text: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = text.toLowerCase()

  const at = t.indexOf(q)
  if (at !== -1) {
    // Earlier matches, and matches at a word boundary, rank higher.
    const boundary = at === 0 || /[\s·—/]/.test(t[at - 1] ?? '') ? 400 : 0
    return SUBSTRING_FLOOR + boundary + Math.max(0, 200 - at)
  }

  // A scattered match is only worth offering for a query long enough to be
  // deliberate, and only when the characters land reasonably close together.
  if (q.length < 3) return 0

  let index = 0
  let best = 0
  let streak = 0
  let firstHit = -1
  for (const char of q) {
    const found = t.indexOf(char, index)
    if (found === -1) return 0
    if (firstHit === -1) firstHit = found
    streak = found === index ? streak + 1 : 1
    best = Math.max(best, streak)
    index = found + 1
  }
  const span = index - firstHit
  // Reject a match smeared across more than five times the query length.
  if (span > q.length * 5) return 0
  return best * 6 + Math.max(0, 40 - span)
}

export default function CommandPalette({ entries }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  const results = useMemo(() => {
    const scored = entries
      .map((entry) => ({
        entry,
        value: score(query, `${entry.label} ${entry.hint ?? ''} ${entry.keywords ?? ''}`),
      }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)

    // If anything matched as a substring, only show substring matches.
    const hasStrong = scored.some((row) => row.value >= SUBSTRING_FLOOR)
    const kept = hasStrong ? scored.filter((row) => row.value >= SUBSTRING_FLOOR) : scored

    // Preserve the authored grouping when nothing has been typed; rank purely by
    // match once the reader starts filtering.
    if (!query) {
      const order: PaletteEntry['group'][] = ['Surfaces', 'The Threshold', 'The Codex', 'Verify', 'Display']
      kept.sort((a, b) => order.indexOf(a.entry.group) - order.indexOf(b.entry.group))
    }
    return kept.map((row) => row.entry)
  }, [entries, query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setCursor(0)
    restoreTo.current?.focus()
  }, [])

  const run = useCallback(
    (entry: PaletteEntry) => {
      if (entry.action === 'edition') {
        const toggle = document.querySelector<HTMLElement>('[data-edition-toggle]')
        toggle?.click()
        close()
        return
      }
      if (entry.href) {
        close()
        location.assign(entry.href)
      }
    },
    [close],
  )

  /* ── Global shortcuts ───────────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable

      if ((event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        restoreTo.current = document.activeElement as HTMLElement
        setOpen((value) => !value)
        return
      }

      if (!open && event.key === '/' && !typing) {
        event.preventDefault()
        restoreTo.current = document.activeElement as HTMLElement
        setOpen(true)
      }
    }

    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  /* ── Openers in the chrome ──────────────────────────────────────────────── */
  useEffect(() => {
    const openers = document.querySelectorAll<HTMLElement>('[data-palette-open]')
    const onClick = (event: Event) => {
      restoreTo.current = event.currentTarget as HTMLElement
      setOpen(true)
    }
    for (const opener of openers) opener.addEventListener('click', onClick)
    return () => {
      for (const opener of openers) opener.removeEventListener('click', onClick)
    }
  }, [])

  /* ── Focus, scroll lock, and traversal ─────────────────────────────────── */
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    setCursor(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [cursor, open])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((value) => (results.length === 0 ? 0 : (value + 1) % results.length))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((value) => (results.length === 0 ? 0 : (value - 1 + results.length) % results.length))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const entry = results[cursor]
      if (entry) run(entry)
    }
  }

  if (!open) return null

  let lastGroup: string | null = null

  return (
    <div className="palette-scrim" onPointerDown={close} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Index"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="palette-field">
          <span className="label label-seal">Index</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Jump to a surface, an entry, or a contract…"
            aria-label="Search the index"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="palette-kbd">Esc</kbd>
        </div>

        <div className="palette-results" ref={listRef}>
          {results.length === 0 && <p className="palette-empty">No entry matches that.</p>}

          {results.map((entry, index) => {
            const showGroup = entry.group !== lastGroup
            lastGroup = entry.group
            return (
              <div key={`${entry.group}-${entry.label}`}>
                {showGroup && <p className="label palette-group">{entry.group}</p>}
                <button
                  type="button"
                  className="palette-item"
                  data-active={index === cursor}
                  onPointerEnter={() => setCursor(index)}
                  onClick={() => run(entry)}
                >
                  <span className="palette-item-label">{entry.label}</span>
                  {entry.hint && <span className="palette-item-hint">{entry.hint}</span>}
                  <svg className="palette-item-arrow" viewBox="0 0 16 16" width="11" height="11" aria-hidden="true">
                    <path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>

        <footer className="palette-foot">
          <span className="label">↑↓ move</span>
          <span className="label">↵ open</span>
          <span className="label">⌘K toggle</span>
        </footer>
      </div>
    </div>
  )
}
