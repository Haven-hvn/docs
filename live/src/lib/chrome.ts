/**
 * HAVEN — CHROME
 *
 * The document's ambient behaviour. Small, dependency-free, and idempotent so it
 * can be re-run after every view transition.
 *
 * Design position on motion: the browser should own as much of the timeline as
 * possible. Reveals prefer scroll-driven CSS animations and only fall back to an
 * IntersectionObserver where those are unsupported. Nothing here runs a
 * continuous rAF loop except the pointer smoothing, which is cancelled the
 * moment the pointer leaves.
 */

const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const FINE_POINTER = () => matchMedia('(pointer: fine)').matches

let teardown: Array<() => void> = []

export function installChrome(): void {
  for (const fn of teardown) fn()
  teardown = []

  installReveals()
  installReadingLight()
  installMagnetism()
  installSpecular()
  installSequences()
  installEdition()
  installNetwork()
  installRules()
  installCopy()
}

/* ────────────────────────────────────────────────────────────────────────────
   REVEALS
   Where `animation-timeline: view()` exists, the CSS in base.css already runs
   scrubbed against the scroller and this observer is not installed at all.
   ──────────────────────────────────────────────────────────────────────────── */
function installReveals(): void {
  const nodes = document.querySelectorAll<HTMLElement>('[data-reveal]')
  if (nodes.length === 0) return

  if (REDUCED()) {
    for (const node of nodes) node.dataset.shown = 'true'
    return
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const el = entry.target as HTMLElement
        el.dataset.shown = 'true'
        observer.unobserve(el)
      }
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
  )

  for (const node of nodes) {
    // Anything already above the fold on load is shown immediately, so a reader
    // who lands mid-document never sees a blank column.
    const box = node.getBoundingClientRect()
    if (box.top < innerHeight * 0.9) {
      node.dataset.shown = 'true'
    } else {
      observer.observe(node)
    }
  }

  teardown.push(() => observer.disconnect())
}

/* ────────────────────────────────────────────────────────────────────────────
   READING LIGHT
   A warm radial that follows the pointer across the stock. Smoothed with a
   half-life rather than a fixed lerp so it behaves identically at 60 and 120Hz.
   ──────────────────────────────────────────────────────────────────────────── */
function installReadingLight(): void {
  if (!FINE_POINTER() || REDUCED()) return

  const root = document.documentElement
  let targetX = innerWidth / 2
  let targetY = innerHeight * 0.4
  let x = targetX
  let y = targetY
  let raf = 0
  let last = performance.now()
  let idle = true

  const onMove = (event: PointerEvent) => {
    targetX = event.clientX
    targetY = event.clientY
    if (idle) {
      idle = false
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
  }

  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const k = Math.pow(2, -dt / 0.06)
    x = targetX + (x - targetX) * k
    y = targetY + (y - targetY) * k
    root.style.setProperty('--px', `${x.toFixed(1)}px`)
    root.style.setProperty('--py', `${y.toFixed(1)}px`)

    if (Math.abs(x - targetX) < 0.4 && Math.abs(y - targetY) < 0.4) {
      idle = true
      return
    }
    raf = requestAnimationFrame(tick)
  }

  addEventListener('pointermove', onMove, { passive: true })
  teardown.push(() => {
    removeEventListener('pointermove', onMove)
    cancelAnimationFrame(raf)
  })
}

/* ────────────────────────────────────────────────────────────────────────────
   MAGNETISM
   Interactive elements lean a few pixels toward the pointer. Capped hard: past
   about 8px it stops reading as physical and starts reading as a bug.
   ──────────────────────────────────────────────────────────────────────────── */
function installMagnetism(): void {
  if (!FINE_POINTER() || REDUCED()) return

  const nodes = document.querySelectorAll<HTMLElement>('[data-magnetic]')
  const handlers: Array<() => void> = []

  for (const node of nodes) {
    const strength = Number(node.dataset.magnetic) || 6

    const onMove = (event: PointerEvent) => {
      const box = node.getBoundingClientRect()
      const dx = (event.clientX - (box.left + box.width / 2)) / (box.width / 2)
      const dy = (event.clientY - (box.top + box.height / 2)) / (box.height / 2)
      node.dataset.engaged = 'true'
      node.style.setProperty('--dx', `${(dx * strength).toFixed(2)}px`)
      node.style.setProperty('--dy', `${(dy * strength).toFixed(2)}px`)
    }

    const onLeave = () => {
      node.dataset.engaged = 'false'
      node.style.setProperty('--dx', '0px')
      node.style.setProperty('--dy', '0px')
    }

    node.addEventListener('pointermove', onMove)
    node.addEventListener('pointerleave', onLeave)
    handlers.push(() => {
      node.removeEventListener('pointermove', onMove)
      node.removeEventListener('pointerleave', onLeave)
    })
  }

  teardown.push(() => {
    for (const off of handlers) off()
  })
}

/** Raking highlight position for `.specular` surfaces. */
function installSpecular(): void {
  if (!FINE_POINTER()) return
  const nodes = document.querySelectorAll<HTMLElement>('.specular')
  const handlers: Array<() => void> = []

  for (const node of nodes) {
    const onMove = (event: PointerEvent) => {
      const box = node.getBoundingClientRect()
      node.style.setProperty('--mx', `${(((event.clientX - box.left) / box.width) * 100).toFixed(1)}%`)
      node.style.setProperty('--my', `${(((event.clientY - box.top) / box.height) * 100).toFixed(1)}%`)
    }
    node.addEventListener('pointermove', onMove)
    handlers.push(() => node.removeEventListener('pointermove', onMove))
  }

  teardown.push(() => {
    for (const off of handlers) off()
  })
}

/* ────────────────────────────────────────────────────────────────────────────
   SEQUENCES
   A tall region with a pinned stage. Scroll position selects the active beat and
   is published as --seq (0→1) for anything that wants to scrub continuously.
   ──────────────────────────────────────────────────────────────────────────── */
function installSequences(): void {
  const sequences = document.querySelectorAll<HTMLElement>('[data-sequence]')
  if (sequences.length === 0) return

  const state = [...sequences].map((root) => ({
    root,
    beats: [...root.querySelectorAll<HTMLElement>('[data-beat]')],
    stage: root.querySelector<HTMLElement>('[data-stage]'),
    last: -1,
  }))

  let raf = 0
  let queued = false

  const measure = () => {
    queued = false
    for (const entry of state) {
      const box = entry.root.getBoundingClientRect()
      const scrollable = box.height - innerHeight
      if (scrollable <= 0) continue

      const raw = -box.top / scrollable
      const progress = raw < 0 ? 0 : raw > 1 ? 1 : raw
      entry.root.style.setProperty('--seq', progress.toFixed(4))

      const count = entry.beats.length
      if (count === 0) continue

      // Hold each beat for an equal share, with the last beat holding to the end.
      const index = Math.min(count - 1, Math.floor(progress * count))
      if (index !== entry.last) {
        entry.last = index
        entry.beats.forEach((beat, i) => {
          beat.dataset.active = String(i === index)
          beat.dataset.passed = String(i < index)
        })
        entry.stage?.style.setProperty('--beat', String(index))
        entry.root.dataset.beatIndex = String(index)
        entry.root.dispatchEvent(
          new CustomEvent('haven:beat', { detail: { index, progress }, bubbles: true }),
        )
      }
    }
  }

  const onScroll = () => {
    if (queued) return
    queued = true
    raf = requestAnimationFrame(measure)
  }

  addEventListener('scroll', onScroll, { passive: true })
  addEventListener('resize', onScroll, { passive: true })
  measure()

  teardown.push(() => {
    removeEventListener('scroll', onScroll)
    removeEventListener('resize', onScroll)
    cancelAnimationFrame(raf)
  })
}

/* ── Rules that draw themselves ─────────────────────────────────────────── */
function installRules(): void {
  const rules = document.querySelectorAll<HTMLElement>('.rule-draw')
  if (rules.length === 0) return

  if (REDUCED()) {
    for (const rule of rules) rule.style.setProperty('--draw', '1')
    return
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        ;(entry.target as HTMLElement).style.setProperty('--draw', '1')
        observer.unobserve(entry.target)
      }
    },
    { threshold: 0.2 },
  )

  for (const rule of rules) observer.observe(rule)
  teardown.push(() => observer.disconnect())
}

/* ── Network: mainnet or devnet ─────────────────────────────────────────── */
/**
 * Mirrors the edition toggle, with one important difference: this one changes
 * DATA rather than colour, so it broadcasts an event. The masthead is Astro
 * chrome and the readouts are React islands; a custom event on `document` is the
 * only channel the two share, and it is what lets the Atlas re-read its ledger
 * without a page load.
 */
function installNetwork(): void {
  const toggles = document.querySelectorAll<HTMLElement>('[data-network-toggle]')
  const handlers: Array<() => void> = []

  const sync = () => {
    const devnet = document.documentElement.dataset.network === 'devnet'
    for (const toggle of toggles) {
      toggle.setAttribute('aria-pressed', String(devnet))
      const label = toggle.querySelector('[data-network-label]')
      if (label) label.textContent = devnet ? 'Devnet' : 'Mainnet'
    }
  }

  for (const toggle of toggles) {
    const onClick = () => {
      const root = document.documentElement
      const next = root.dataset.network === 'devnet' ? 'mainnet' : 'devnet'
      if (next === 'devnet') root.dataset.network = 'devnet'
      else delete root.dataset.network
      try {
        localStorage.setItem('haven:network', next)
      } catch {}
      sync()
      document.dispatchEvent(new CustomEvent('haven:network', { detail: { network: next } }))
    }
    toggle.addEventListener('click', onClick)
    handlers.push(() => toggle.removeEventListener('click', onClick))
  }

  sync()
  teardown.push(() => {
    for (const off of handlers) off()
  })
}

/* ── Ink edition ────────────────────────────────────────────────────────── */
function installEdition(): void {
  const toggles = document.querySelectorAll<HTMLElement>('[data-edition-toggle]')
  const handlers: Array<() => void> = []

  const sync = () => {
    const ink = document.documentElement.dataset.edition === 'ink'
    for (const toggle of toggles) {
      toggle.setAttribute('aria-pressed', String(ink))
      const label = toggle.querySelector('[data-edition-label]')
      if (label) label.textContent = ink ? 'Paper' : 'Ink'
    }
  }

  for (const toggle of toggles) {
    const onClick = () => {
      const root = document.documentElement
      const next = root.dataset.edition === 'ink' ? 'paper' : 'ink'
      const apply = () => {
        if (next === 'ink') root.dataset.edition = 'ink'
        else delete root.dataset.edition
        try {
          localStorage.setItem('haven:edition', next)
        } catch {}
        sync()
      }
      // The edition flip is a whole-document colour change: exactly what a view
      // transition is for.
      if (!REDUCED() && 'startViewTransition' in document) {
        ;(document as Document & { startViewTransition: (cb: () => void) => void }).startViewTransition(apply)
      } else {
        apply()
      }
    }
    toggle.addEventListener('click', onClick)
    handlers.push(() => toggle.removeEventListener('click', onClick))
  }

  sync()
  teardown.push(() => {
    for (const off of handlers) off()
  })
}

/* ── Copy buttons on evidence blocks ───────────────────────────────────── */
function installCopy(): void {
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-copy]')
  const handlers: Array<() => void> = []

  for (const button of buttons) {
    const onClick = async () => {
      const value = button.dataset.copy ?? ''
      try {
        await navigator.clipboard.writeText(value)
        const previous = button.dataset.copyLabel ?? button.textContent ?? ''
        button.dataset.copyLabel = previous
        button.textContent = 'Copied'
        button.dataset.copied = 'true'
        setTimeout(() => {
          button.textContent = previous
          button.dataset.copied = 'false'
        }, 1_600)
      } catch {
        button.dataset.copied = 'error'
      }
    }
    button.addEventListener('click', onClick)
    handlers.push(() => button.removeEventListener('click', onClick))
  }

  teardown.push(() => {
    for (const off of handlers) off()
  })
}
