/**
 * HAVEN — FORMAT
 *
 * Presentation-only helpers. Two rules govern everything here:
 *
 *   1. Never invent precision. If a figure is an estimate it is rounded to a
 *      scale that admits it. A number typeset to three decimals is a promise.
 *   2. Numbers are tabular. Every figure returned is safe to stack in a column.
 */

const ROMAN: readonly [number, string][] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
]

/** Section and plate numbering. */
export function roman(n: number): string {
  let value = Math.max(0, Math.floor(n))
  let out = ''
  for (const [amount, glyph] of ROMAN) {
    while (value >= amount) {
      out += glyph
      value -= amount
    }
  }
  return out || '—'
}

/** Folio numbers: 01, 02 … 12. Two digits reads as a document, one as a list. */
export function folio(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0')
}

/** Storage, at the scale the measurement actually supports. */
export function bytes(n: number): { value: string; unit: string } {
  if (!Number.isFinite(n) || n <= 0) return { value: '0', unit: 'B' }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const exp = Math.min(units.length - 1, Math.floor(Math.log10(n) / 3))
  const scaled = n / 1000 ** exp
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
  return { value: scaled.toFixed(digits), unit: units[exp] ?? 'B' }
}

export function bytesInline(n: number): string {
  const { value, unit } = bytes(n)
  return `${value} ${unit}`
}

/** Gigabytes, for the Atlas's own unit of account. */
export function gb(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 GB'
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)} TB`
  if (n >= 100) return `${Math.round(n)} GB`
  if (n >= 10) return `${n.toFixed(1)} GB`
  return `${n.toFixed(2)} GB`
}

export function usd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

export function integer(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('en-US')
}

/** Compact figures for readouts where width is fixed. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(Math.round(n))
}

/** Hex, elided at the middle. Keeps the checksum-bearing head and tail. */
export function addr(value: string, head = 6, tail = 4): string {
  if (!value) return '—'
  if (value.length <= head + tail + 1) return value
  return `${value.slice(0, head)}…${value.slice(-tail)}`
}

/** Principal-style identifiers elide differently — they are dash-grouped. */
export function principal(value: string): string {
  if (!value) return '—'
  const parts = value.split('-')
  if (parts.length <= 2) return value
  return `${parts[0]}…${parts[parts.length - 1]}`
}

export function ms(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—'
  if (n < 1) return '<1 ms'
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`
  return `${Math.round(n)} ms`
}

/** Elapsed time, in the register of a log. */
export function since(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

/** ISO date, no time. The stamp on a document. */
export function stamp(date: Date | string | number): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

/** Zulu timestamp for the ledger strip. */
export function zulu(date: Date | string | number): string {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.toISOString().slice(11, 19)}Z`
}

/** Clamp helper used by every motion routine in the codebase. */
export function clamp(v: number, min = 0, max = 1): number {
  return v < min ? min : v > max ? max : v
}

/** Normalised progress with clamping — the workhorse of scroll choreography. */
export function progress(value: number, from: number, to: number): number {
  if (to === from) return 0
  return clamp((value - from) / (to - from))
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Frame-rate independent smoothing. Half-life in seconds, not a magic 0.1. */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target
  return target + (current - target) * Math.pow(2, -dt / halfLife)
}
