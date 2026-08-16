/**
 * Records the walkthrough by driving Chrome's CDP screencast directly, writing
 * JPEG frames plus a concat manifest with real per-frame durations. Encoding is
 * left to the system ffmpeg so we go straight to h264 mp4.
 *
 * Structure is deliberately Arkiv-first: it opens on the argument, spends its
 * middle on the entity specification, and only then shows the consequence of
 * that specification having nowhere to live. The other networks get a clause,
 * not a statistic — this is an Arkiv event.
 */
import { chromium } from 'playwright'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const FRAMES = '/tmp/haven-frames'
const BASE = 'http://127.0.0.1:4321'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const t0 = Date.now()
const at = () => String(Math.round((Date.now() - t0) / 1000)).padStart(3)
const beat = (l) => console.log(`[${at()}s] ${l}`)
const step = async (l, fn) => {
  try {
    await fn()
    beat(l)
  } catch (e) {
    console.log(`[${at()}s] SKIPPED ${l} — ${e.message.split('\n')[0]}`)
  }
}

rmSync(FRAMES, { recursive: true, force: true })
mkdirSync(FRAMES, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--use-gl=angle',
    '--use-angle=metal',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
  ],
})
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
})
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('haven:atlas-briefed', 'true')
  } catch {}
})
const p = await ctx.newPage()

const cdp = await ctx.newCDPSession(p)
const frames = []
let n = 0
cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
  writeFileSync(`${FRAMES}/f${String(n).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'))
  frames.push({ file: `${FRAMES}/f${String(n++).padStart(5, '0')}.jpg`, ts: metadata.timestamp ?? Date.now() / 1000 })
  try {
    await cdp.send('Page.screencastFrameAck', { sessionId })
  } catch {}
})

// Scroll to a section by its heading text. Every spec beat aims at one of Haven's
// own decisions, and those are section-shaped rather than selector-shaped.
const heading = async (re) => {
  await p.evaluate(
    (src) => {
      const rx = new RegExp(src, 'i')
      const h = [...document.querySelectorAll('h2, h3')].find((x) => rx.test(x.textContent))
      if (!h) throw new Error(`no heading matching ${src}`)
      const mast = document.querySelector('.masthead')
      const clear = (mast ? mast.getBoundingClientRect().height : 0) + 28
      window.scrollTo({
        top: h.getBoundingClientRect().top + window.scrollY - clear,
        behavior: 'smooth',
      })
    },
    re,
  )
  await sleep(1700)
}

// Scroll clear of the sticky masthead, which otherwise covers whatever we aim at.
const bring = async (sel, extra = 28) => {
  await p.evaluate(
    ([s, pad]) => {
      const el = document.querySelector(s)
      if (!el) throw new Error(`missing ${s}`)
      const mast = document.querySelector('.masthead')
      const clear = (mast ? mast.getBoundingClientRect().height : 0) + pad
      window.scrollTo({
        top: el.getBoundingClientRect().top + window.scrollY - clear,
        behavior: 'smooth',
      })
    },
    [sel, extra],
  )
  await sleep(1500)
}

try {
  /* ── 0:00 · THE ARGUMENT — open on the home page ─────────────────────── */
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await sleep(2500)
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: 1280,
    maxHeight: 800,
    everyNthFrame: 1,
  })
  beat('screencast started')
  await sleep(6000) // hold the hero: "there is nothing to join"
  await p.mouse.wheel(0, 420)
  await sleep(4500)
  beat('0:00 home — the argument')

  /* ── 0:11 · HAVEN'S SHAPE — the attributes it chose to index ────────── */
  await p.goto(`${BASE}/codex/entity-shape`, { waitUntil: 'networkidle' })
  await sleep(2400)
  await step('0:11 media attribute keys', () => heading('media specialisation'))
  beat('0:11 codex — the shape Haven chose')
  await sleep(11000)

  /* ── 0:28 · One shape, four transcriptions ──────────────────────────── */
  await step('0:28 shared shape, not shared code', () => heading('why the shape is shared'))
  await sleep(11500)

  /* ── 0:43 · Who reads the index, and who deliberately does not ──────── */
  await p.goto(`${BASE}/codex/arkiv-chain`, { waitUntil: 'networkidle' })
  await sleep(2300)
  await step('0:43 how surfaces consume it', () => heading('how surfaces consume it'))
  beat('0:43 codex — who depends on the index')
  await sleep(11000)

  /* ── 0:58 · THE CONSEQUENCE — the index has nowhere to live ────────── */
  await p.goto(`${BASE}/atlas`, { waitUntil: 'networkidle' })
  await sleep(5500) // WebGL compiles
  beat('0:58 atlas')
  await p.keyboard.press('2') // measure by stored bytes
  await sleep(2600)
  await step('1:02 inspector open', () =>
    p.locator('.atlas-list-item').first().click({ timeout: 8000 }),
  )
  await sleep(2000)
  await step('1:02 traced the placeholder note', async () => {
    const b = await p.locator('.atlas-row-note').first().boundingBox()
    if (b) {
      await p.mouse.move(b.x + 20, b.y + 10, { steps: 20 })
      await sleep(700)
      await p.mouse.move(b.x + b.width * 0.8, b.y + 30, { steps: 40 })
    }
  })
  await sleep(10500)

  /* ── 1:16 · Arkiv drawn unlit, beside chains that answer ───────────── */
  await p.keyboard.press('Escape')
  await sleep(900)
  await step('1:16 arkiv unlit', async () => {
    const b = await p.locator('.atlas-telemetry-net').first().boundingBox()
    if (b) await p.mouse.move(b.x + b.width / 2, b.y + 20, { steps: 30 })
  })
  await sleep(9000)
  beat('1:26 closing shot')
  await sleep(3000)
} catch (e) {
  console.log(`[${at()}s] FATAL ${e.message.split('\n')[0]}`)
} finally {
  try {
    await cdp.send('Page.stopScreencast')
  } catch {}
  await browser.close()

  // Static pages emit almost no screencast frames — Chrome only sends on change.
  // So a legitimate hold on a Codex page can be many seconds between two frames,
  // and clamping per-frame duration low silently compresses the whole take. Only
  // guard against non-positive values; trust the timestamps otherwise.
  const lines = ['ffconcat version 1.0']
  frames.forEach((f, i) => {
    const next = frames[i + 1]
    const d = next ? Math.max(0.008, Math.min(15, next.ts - f.ts)) : 0.4
    lines.push(`file '${f.file}'`, `duration ${d.toFixed(4)}`)
  })
  if (frames.length) lines.push(`file '${frames[frames.length - 1].file}'`)
  writeFileSync(`${FRAMES}/manifest.txt`, lines.join('\n'))
  writeFileSync(`${FRAMES}/timestamps.json`, JSON.stringify(frames))
  const span = frames.length ? frames[frames.length - 1].ts - frames[0].ts : 0
  const sum = lines.filter((l) => l.startsWith('duration')).reduce((a, l) => a + parseFloat(l.slice(9)), 0)
  console.log(
    `frames=${frames.length} span=${span.toFixed(1)}s manifest=${sum.toFixed(1)}s` +
      (Math.abs(sum - span) > 2 ? '  ⚠ MANIFEST DOES NOT MATCH SPAN' : '  ✓ timing preserved'),
  )
}
