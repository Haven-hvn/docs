// Requires playwright and a local Chrome:  npx playwright@1.58 install --help
// or:  npm i -D playwright  &&  ORIGIN=http://127.0.0.1:4321 npm run audit:contrast
import { chromium } from 'playwright'

/**
 * Contrast audit.
 *
 * Colours are authored in OKLCH, and getComputedStyle returns them unchanged, so
 * any measurement has to resolve them to sRGB first. The reliable way to do that
 * in-page is to paint the colour into a 2D context and read the pixel back — the
 * browser's own colour conversion, rather than a reimplementation of it.
 *
 * Backgrounds are resolved by compositing every translucent layer between the
 * element and the document root, in order, which is what the eye actually sees.
 */

const AA_NORMAL = 4.5
const AA_LARGE = 3.0

/** Run `npm run preview` first, or point ORIGIN at any deployed build. */
const ORIGIN = process.env.ORIGIN ?? 'http://127.0.0.1:4321'

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } })

const auditCurrentPage = () =>
  page.evaluate(
    ({ aaNormal, aaLarge }) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      const cache = new Map()
      /** Resolve any CSS colour to [r,g,b,a] via the browser's own conversion. */
      const resolve = (value) => {
        if (cache.has(value)) return cache.get(value)
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillStyle = '#000'
        ctx.fillStyle = value
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        const out = [d[0], d[1], d[2], d[3] / 255]
        cache.set(value, out)
        return out
      }

      const over = (fg, bg) => {
        const a = fg[3]
        return [
          fg[0] * a + bg[0] * (1 - a),
          fg[1] * a + bg[1] * (1 - a),
          fg[2] * a + bg[2] * (1 - a),
          1,
        ]
      }

      const lin = (c) => {
        const v = c / 255
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
      const contrast = (a, b) => {
        const l1 = lum(a)
        const l2 = lum(b)
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      }

      /** Composite every background between el and the root. */
      const backdrop = (el) => {
        const stack = []
        let node = el
        while (node && node !== document.documentElement) {
          const bg = resolve(getComputedStyle(node).backgroundColor)
          if (bg[3] > 0.001) stack.push(bg)
          node = node.parentElement
        }
        stack.push(resolve(getComputedStyle(document.documentElement).backgroundColor))
        stack.push([255, 255, 255, 1])
        let acc = stack[stack.length - 1]
        for (let i = stack.length - 2; i >= 0; i -= 1) acc = over(stack[i], acc)
        return acc
      }

      const failures = []
      let checked = 0

      for (const el of document.querySelectorAll(
        'p, span, li, td, th, dd, dt, a, button, h1, h2, h3, h4, code, kbd, figcaption, input',
      )) {
        const text = (el.textContent ?? '').trim()
        if (!text) continue
        // Only leaf-ish text nodes, so a paragraph is not counted through its span.
        if (el.querySelector('p, span, li, td, th, dd, dt, a, button, code')) continue

        const rect = el.getBoundingClientRect()
        if (rect.width < 4 || rect.height < 4) continue

        const cs = getComputedStyle(el)
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.15) continue
        // Skip anything scrolled far out of the document flow (e.g. skip links).
        if (rect.bottom < -400) continue

        const size = Number.parseFloat(cs.fontSize)
        const weight = Number(cs.fontWeight) || 400
        const isLarge = size >= 24 || (size >= 18.66 && weight >= 700)
        const threshold = isLarge ? aaLarge : aaNormal

        const bg = backdrop(el)
        const fgRaw = resolve(cs.color)
        const fg = fgRaw[3] < 1 ? over(fgRaw, bg) : fgRaw
        const ratio = contrast(fg, bg)
        checked += 1

        if (ratio < threshold) {
          const hex = (c) => '#' + c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')
          failures.push({
            sel: `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`,
            size: `${size}px`,
            ratio: Number(ratio.toFixed(2)),
            need: threshold,
            text: text.slice(0, 26),
            fg: hex(fg),
            bg: hex(bg),
            declared: cs.color,
          })
        }
      }

      const unique = new Map()
      for (const f of failures) {
        const key = `${f.sel}|${f.size}`
        if (!unique.has(key) || unique.get(key).ratio > f.ratio) unique.set(key, f)
      }
      const result = { checked, failures: [...unique.values()].sort((a, b) => a.ratio - b.ratio) }
      window.__havenAuditResult = result
      return result
    },
    { aaNormal: AA_NORMAL, aaLarge: AA_LARGE },
  )

const audit = async (path, wait = 1600) => {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle', timeout: 45000 })
  await page.waitForTimeout(wait)
  return auditCurrentPage()
}


/**
 * Drive one of the Threshold checks.
 *
 * The islands hydrate on visibility and their containers are reveal-animated, so
 * a fill immediately after navigation races both: the submit button is still
 * disabled and the element is still moving. Waiting for the button to become
 * enabled is the reliable signal that React has taken over.
 */
const runCheck = async (path, field, value) => {
  await page.goto(`${ORIGIN}${path}`, { waitUntil: 'networkidle' })
  await page.locator(field).scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)
  await page.locator(field).fill(value)
  await page.locator('.threshold-form button[type=submit]:not([disabled])').waitFor({ timeout: 15000 })
  await page.locator('.threshold-form button[type=submit]').click()
  await page.waitForSelector('.threshold-result', { timeout: 30000 })
  await page.waitForTimeout(900)
}

/** Drives a surface into an interactive state before auditing it. */
const states = {
  '/palette': async () => {
    await page.goto(`${ORIGIN}/codex`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.keyboard.press('Meta+k')
    await page.waitForTimeout(700)
  },
  /* Each path only shows its verdict once a check has run, so all three are
     driven into place with real addresses and a real contract. */
  '/threshold-read-result': () =>
    runCheck('/threshold/read', '#threshold-address', '0x000000000000000000000000000000000000dEaD'),

  '/threshold-publish-result': () =>
    runCheck('/threshold/publish', '#publisher-address', '0xe23f4310184db1e02b71b30d07870cc659d1a796'),

  '/threshold-found-result': () =>
    runCheck('/threshold/found', '#gate-address', '0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03'),

  '/threshold-explainers-open': async () => {
    await page.goto(`${ORIGIN}/threshold/found`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    await page.evaluate(() =>
      document.querySelectorAll('details.explain').forEach((d) => d.setAttribute('open', '')),
    )
    await page.waitForTimeout(400)
  },

  /* Devnet is a whole second set of figures and a different walkthrough, so it is
     audited as its own states rather than assumed to inherit mainnet's contrast. */
  '/devnet-atlas': async () => {
    await page.goto(`${ORIGIN}/atlas`, { waitUntil: 'networkidle' })
    await page.locator('[data-network-toggle]').click()
    await page.waitForTimeout(6500)
  },

  '/devnet-walkthrough': async () => {
    await page.goto(`${ORIGIN}/threshold/publish`, { waitUntil: 'networkidle' })
    await page.locator('[data-network-toggle]').click()
    await page.waitForTimeout(700)
    await page.locator('#publisher-address').scrollIntoViewIfNeeded()
    await page.waitForTimeout(900)
    await page.locator('#publisher-address').fill('0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B')
    await page.locator('.threshold-form button[type=submit]:not([disabled])').waitFor({ timeout: 15000 })
    await page.locator('.threshold-form button[type=submit]').click()
    await page.waitForSelector('.threshold-walk', { timeout: 30000 })
    await page.waitForTimeout(900)
  },

  '/devnet-reader-note': async () => {
    await page.goto(`${ORIGIN}/threshold/read`, { waitUntil: 'networkidle' })
    await page.locator('[data-network-toggle]').click()
    await page.waitForTimeout(1200)
  },

  '/atlas-inspector': async () => {
    await page.goto(`${ORIGIN}/atlas`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(6000)
    await page.getByRole('button', { name: 'Enter the Atlas' }).click().catch(() => {})
    await page.waitForTimeout(3000)
    await page.locator('.atlas-list-item').first().click().catch(() => {})
    await page.waitForTimeout(2000)
  },
  '/ink-edition': async () => {
    await page.goto(`${ORIGIN}/`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    await page.evaluate(() => {
      document.documentElement.dataset.edition = 'ink'
    })
    await page.waitForTimeout(900)
  },
}

let total = 0
for (const [path, wait] of [
  ['/', 1600],
  ['/codex', 1400],
  ['/codex/verify-it-yourself', 1400],
  ['/atlas', 6000],
  ['/threshold', 1600],
  ['/threshold/read', 1800],
  ['/threshold/publish', 1600],
  ['/threshold/found', 1600],
]) {
  const result = await audit(path, wait)
  total += result.failures.length
  console.log(`\n── ${path}  (${result.checked} text nodes checked)`)
  if (result.failures.length === 0) {
    console.log('   all pass AA')
  } else {
    for (const f of result.failures.slice(0, 14)) {
      console.log(
        `   ${String(f.ratio).padStart(5)} / ${f.need}  ${f.size.padEnd(7)} ${f.sel.padEnd(28)} fg=${f.fg} bg=${f.bg}  "${f.text}"`,
      )
    }
    if (result.failures.length > 14) console.log(`   … and ${result.failures.length - 14} more`)
  }
}

// Interactive states
for (const [label, drive] of Object.entries(states)) {
  await drive()
  const result = await auditCurrentPage()
  total += result.failures.length
  console.log(`\n── ${label}  (${result.checked} text nodes checked)`)
  if (result.failures.length === 0) console.log('   all pass AA')
  else
    for (const f of result.failures.slice(0, 12))
      console.log(`   ${String(f.ratio).padStart(5)} / ${f.need}  ${f.size.padEnd(7)} ${f.sel.padEnd(28)} fg=${f.fg} bg=${f.bg}  "${f.text}"`)
}

console.log(`\ntotal AA failures: ${total}`)
await browser.close()
