import { useEffect, useRef } from 'react'

/**
 * THE APERTURE
 *
 * The mark, rendered at monumental scale as a measuring instrument.
 *
 * Four blades — one per public network — rotate around a void they never touch.
 * Behind them, a graduated bezel: hairline rings and tick marks, the register of
 * something machined rather than drawn. The void at the centre is the archive:
 * enclosed by the arrangement, owned by none of the parts.
 *
 * Deliberately 2D canvas rather than WebGL. The Atlas earns a full renderer; a
 * hero does not, and a page that ships a 3D engine to draw four arcs is a page
 * that has confused expense with quality. Everything here is composited on the
 * GPU anyway, and it starts in under a frame.
 */

type Rgb = [number, number, number]

const FALLBACK: Record<string, Rgb> = {
  arkiv: [86, 214, 142],
  icp: [150, 130, 255],
  evm: [232, 178, 74],
  filecoin: [110, 198, 232],
  seal: [232, 97, 58],
}

/** Reads a token from the cascade so the canvas always agrees with the CSS. */
function readToken(name: string, fallback: Rgb): Rgb {
  if (typeof window === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) return fallback
  try {
    const probe = document.createElement('canvas').getContext('2d')
    if (!probe) return fallback
    probe.fillStyle = '#000'
    probe.fillStyle = raw
    // Round-trip through the 2D context so oklch() is resolved for us.
    probe.fillRect(0, 0, 1, 1)
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
    if (r === 0 && g === 0 && b === 0) return fallback
    return [r ?? fallback[0], g ?? fallback[1], b ?? fallback[2]]
  } catch {
    return fallback
  }
}

const rgba = ([r, g, b]: Rgb, alpha: number) => `rgba(${r},${g},${b},${alpha})`

interface Blade {
  /** Start angle, radians. */
  from: number
  span: number
  hue: Rgb
  /** Independent breathing phase so the four never move in lockstep. */
  phase: number
}

export default function HeroAperture({ label = 'Haven aperture' }: { label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

    const hues = {
      arkiv: readToken('--color-arkiv', FALLBACK.arkiv!),
      icp: readToken('--color-icp', FALLBACK.icp!),
      evm: readToken('--color-evm', FALLBACK.evm!),
      filecoin: readToken('--color-filecoin', FALLBACK.filecoin!),
      seal: readToken('--seal', FALLBACK.seal!),
    }

    // The four blades sit at 90° intervals with a generous gap, which is what
    // creates the pinwheel in the mark. Arkiv is drawn dim: its index is not
    // operational, and the hero states that rather than hiding it.
    const blades: Blade[] = [
      { from: -Math.PI / 2 + 0.14, span: Math.PI / 2 - 0.28, hue: hues.icp, phase: 0 },
      { from: 0.14, span: Math.PI / 2 - 0.28, hue: hues.evm, phase: 1.7 },
      { from: Math.PI / 2 + 0.14, span: Math.PI / 2 - 0.28, hue: hues.filecoin, phase: 3.1 },
      { from: Math.PI + 0.14, span: Math.PI / 2 - 0.28, hue: hues.arkiv, phase: 4.6 },
    ]
    const ARKIV_INDEX = 3

    let width = 0
    let height = 0
    let dpr = 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      width = Math.max(1, Math.round(rect.width))
      height = Math.max(1, Math.round(rect.height))
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    // Pointer parallax, smoothed. Small on purpose: 10px of travel reads as
    // depth, 40px reads as a toy.
    let pointerX = 0
    let pointerY = 0
    let driftX = 0
    let driftY = 0

    const onPointer = (event: PointerEvent) => {
      pointerX = (event.clientX / innerWidth - 0.5) * 2
      pointerY = (event.clientY / innerHeight - 0.5) * 2
    }
    if (!reduced) addEventListener('pointermove', onPointer, { passive: true })

    let raf = 0
    let start = performance.now()
    let visible = true

    const visibility = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? true
        if (visible && !raf) {
          start = performance.now() - elapsed
          raf = requestAnimationFrame(frame)
        }
        if (!visible && raf) {
          cancelAnimationFrame(raf)
          raf = 0
        }
      },
      { threshold: 0.01 },
    )
    visibility.observe(canvas)

    let elapsed = 0

    const draw = (t: number) => {
      const cx = width / 2 + driftX
      const cy = height / 2 + driftY
      const unit = Math.min(width, height)
      const R = unit * 0.315

      ctx.clearRect(0, 0, width, height)

      /* ── Bloom behind the aperture ────────────────────────────────────────
         A single wide radial. The instrument is lit from within, which is what
         makes the blades read as silhouettes rather than shapes. */
      const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.6)
      bloom.addColorStop(0, rgba(hues.seal, 0.2))
      bloom.addColorStop(0.28, rgba(hues.seal, 0.075))
      bloom.addColorStop(0.62, rgba(hues.seal, 0.018))
      bloom.addColorStop(1, rgba(hues.seal, 0))
      ctx.fillStyle = bloom
      ctx.fillRect(0, 0, width, height)

      /* ── Bezel: graduated rings and ticks ─────────────────────────────── */
      ctx.save()
      ctx.translate(cx, cy)

      for (const [radius, alpha] of [
        [R * 1.52, 0.1],
        [R * 1.28, 0.055],
        [R * 0.62, 0.075],
      ] as const) {
        ctx.beginPath()
        ctx.arc(0, 0, radius, 0, Math.PI * 2)
        ctx.strokeStyle = rgba([255, 255, 255], alpha)
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Graduations every 3°, emphasised every 45°. The slow counter-rotation
      // is what gives the whole object its sense of being a mechanism.
      const bezelSpin = t * 0.006
      for (let deg = 0; deg < 360; deg += 3) {
        const major = deg % 45 === 0
        const angle = (deg * Math.PI) / 180 + bezelSpin
        const inner = R * 1.52
        const outer = inner + (major ? unit * 0.022 : unit * 0.009)
        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner)
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer)
        ctx.strokeStyle = rgba([255, 255, 255], major ? 0.26 : 0.1)
        ctx.lineWidth = major ? 1.4 : 1
        ctx.stroke()
      }

      /* ── Blades ───────────────────────────────────────────────────────── */
      const assemblySpin = t * 0.017
      const thickness = unit * 0.052

      blades.forEach((blade, index) => {
        const pending = index === ARKIV_INDEX
        // Each blade breathes on its own phase: the aperture opens and closes by
        // a couple of degrees, never enough to notice directly.
        const breathe = Math.sin(t * 0.35 + blade.phase) * 0.035
        const from = blade.from + assemblySpin + breathe
        const to = from + blade.span

        ctx.beginPath()
        ctx.arc(0, 0, R, from, to)
        ctx.lineWidth = thickness
        ctx.lineCap = 'butt'

        if (pending) {
          // Unlit. Arkiv's index is not answering, so its blade is drawn as an
          // outline: present in the mechanism, contributing no light.
          ctx.strokeStyle = rgba(blade.hue, 0.16)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(0, 0, R, from, to)
          ctx.lineWidth = 1
          ctx.strokeStyle = rgba(blade.hue, 0.4)
          ctx.stroke()
        } else {
          const glow = ctx.createRadialGradient(0, 0, R - thickness, 0, 0, R + thickness)
          glow.addColorStop(0, rgba(blade.hue, 0.62))
          glow.addColorStop(0.5, rgba(blade.hue, 0.95))
          glow.addColorStop(1, rgba(blade.hue, 0.5))
          ctx.strokeStyle = glow
          ctx.shadowColor = rgba(blade.hue, 0.55)
          ctx.shadowBlur = unit * 0.055
          ctx.stroke()
          ctx.shadowBlur = 0

          // A bright inner edge where the blade catches the light from the void.
          ctx.beginPath()
          ctx.arc(0, 0, R - thickness / 2 + 0.5, from, to)
          ctx.lineWidth = 1
          ctx.strokeStyle = rgba([255, 255, 255], 0.34)
          ctx.stroke()
        }
      })

      /* ── The void ─────────────────────────────────────────────────────── */
      const core = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.6)
      core.addColorStop(0, rgba(hues.seal, 0.13))
      core.addColorStop(1, rgba(hues.seal, 0))
      ctx.fillStyle = core
      ctx.beginPath()
      ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2)
      ctx.fill()

      // Crosshair — a registration mark, not decoration.
      ctx.strokeStyle = rgba([255, 255, 255], 0.16)
      ctx.lineWidth = 1
      for (const [x1, y1, x2, y2] of [
        [-R * 0.1, 0, R * 0.1, 0],
        [0, -R * 0.1, 0, R * 0.1],
      ] as const) {
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }

      ctx.restore()
    }

    const frame = (now: number) => {
      elapsed = now - start
      const t = elapsed / 1000

      // Half-life smoothing so the parallax feels identical at any refresh rate.
      const k = Math.pow(2, -(1 / 60) / 0.22)
      const targetX = pointerX * Math.min(width, height) * 0.018
      const targetY = pointerY * Math.min(width, height) * 0.014
      driftX = targetX + (driftX - targetX) * k
      driftY = targetY + (driftY - targetY) * k

      draw(t)
      raf = requestAnimationFrame(frame)
    }

    if (reduced) {
      draw(0)
    } else {
      raf = requestAnimationFrame(frame)
    }

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      visibility.disconnect()
      removeEventListener('pointermove', onPointer)
    }
  }, [])

  return <canvas ref={canvasRef} className="aperture-canvas" role="img" aria-label={label} />
}
