import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STATIONS, STATION_RADIUS, positionAt, type Axis, type Body } from '../../../lib/atlas.ts'

/**
 * THE ATLAS — SCENE
 *
 * An orrery of the archive.
 *
 * At the centre is the void: the archive itself, enclosed by the arrangement and
 * owned by none of its parts — the mark, at scale, in three dimensions. Around it
 * orbit the bodies of whichever population the axis control has selected. At the
 * outer edge sit four fixed stations, one per public network, positioned like the
 * blades of the mark.
 *
 * Two rules govern everything here.
 *
 * Scale is honest: a body's radius varies with the cube root of its measure, so
 * the sphere's VOLUME tracks the value. Sqrt scaling — correct for flat circles —
 * would overstate the largest bodies by a wide margin on a sphere.
 *
 * Absence is drawn, not hidden: the edges that would bind a community to the
 * storage holding its archive require the metadata index, and the metadata index
 * is not operational. Those edges are rendered unlit and dashed. The gap is the
 * honest centre of the picture.
 */

const UP = new THREE.Vector3(0, 1, 0)

/**
 * Opt a mesh out of picking entirely. Assigned to every decorative object — the
 * void, the stations, atmospheres, rings, lanes, tethers, stars — so the only
 * things the raycaster ever considers are the pick spheres around the bodies.
 * Cheaper per frame, and it removes any chance of glow stealing a click.
 */
const NO_PICK = () => {}

/** A drag past this many CSS pixels is a camera move, not a selection. */
const DRAG_SLOP = 6

/* ────────────────────────────────────────────────────────────────────────────
   CAMERA
   Damped orbit control with a slow idle drift. The drift is what makes the map
   feel like an instrument left running rather than a still image.
   ──────────────────────────────────────────────────────────────────────────── */
function Rig({
  positions,
  selectedId,
  interacting,
  onInteract,
}: {
  /** Live positions, written every frame by each body. */
  positions: React.RefObject<Map<string, THREE.Vector3>>
  selectedId: string | null
  interacting: boolean
  onInteract: (v: boolean) => void
}) {
  const { camera, gl } = useThree()
  const controls = useRef<OrbitControls | null>(null)
  const target = useRef(new THREE.Vector3(0, 0, 0))
  const desiredDistance = useRef(52)

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enableDamping = true
    c.dampingFactor = 0.055
    c.rotateSpeed = 0.42
    c.zoomSpeed = 0.62
    c.panSpeed = 0.5
    c.enablePan = true
    c.minDistance = 8
    c.maxDistance = 130
    c.minPolarAngle = 0.18
    c.maxPolarAngle = Math.PI - 0.18
    c.autoRotate = true
    c.autoRotateSpeed = 0.22
    controls.current = c

    const start = () => onInteract(true)
    c.addEventListener('start', start)

    return () => {
      c.removeEventListener('start', start)
      c.dispose()
    }
  }, [camera, gl, onInteract])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    c.autoRotate = !interacting
  }, [interacting])

  useFrame((_, delta) => {
    const c = controls.current
    if (!c) return

    // A selected body keeps orbiting, so the camera has to track its live
    // position rather than the point where it happened to be when clicked.
    const live = selectedId ? positions.current?.get(selectedId) : null
    if (live) {
      target.current.copy(live)
      desiredDistance.current = 20
    } else {
      target.current.set(0, 0, 0)
      desiredDistance.current = 52
    }

    // Half-life smoothing: identical behaviour at any refresh rate.
    const k = Math.pow(2, -delta / 0.3)
    c.target.lerp(target.current, 1 - k)

    const current = camera.position.distanceTo(c.target)
    const next = desiredDistance.current + (current - desiredDistance.current) * k
    const direction = camera.position.clone().sub(c.target).normalize()
    camera.position.copy(c.target).add(direction.multiplyScalar(next))

    c.update()
  })

  return null
}

/* ────────────────────────────────────────────────────────────────────────────
   THE VOID
   The archive. A dark body with a bright rim and an internal ember — lit from
   inside so it reads as contained rather than solid.
   ──────────────────────────────────────────────────────────────────────────── */
function Void() {
  const rim = useRef<THREE.Mesh>(null)
  const inner = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (inner.current) {
      const s = 1 + Math.sin(t * 0.5) * 0.035
      inner.current.scale.setScalar(s)
    }
    if (rim.current) rim.current.rotation.y = t * 0.06
  })

  return (
    <group>
      <mesh raycast={NO_PICK}>
        <sphereGeometry args={[3.1, 64, 64]} />
        <meshStandardMaterial color="#0a0b10" roughness={0.42} metalness={0.65} />
      </mesh>

      <mesh ref={inner} scale={1} raycast={NO_PICK}>
        <sphereGeometry args={[3.32, 48, 48]} />
        <meshBasicMaterial
          color="#e8613a"
          transparent
          opacity={0.13}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Equatorial rim — a machined edge, not a glow. */}
      <mesh ref={rim} rotation={[Math.PI / 2, 0, 0]} raycast={NO_PICK}>
        <torusGeometry args={[3.42, 0.022, 8, 160]} />
        <meshBasicMaterial color="#ff8a5c" toneMapped={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={NO_PICK}>
        <torusGeometry args={[4.5, 0.008, 6, 160]} />
        <meshBasicMaterial color="#e8613a" transparent opacity={0.32} toneMapped={false} />
      </mesh>
    </group>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   ORBIT LANES
   Faint rings at each lane radius. Drawn once, never animated: they are the
   graticule of the map and should feel printed onto it.
   ──────────────────────────────────────────────────────────────────────────── */
function Lanes({ radii }: { radii: number[] }) {
  const geometries = useMemo(
    () =>
      radii.map((radius) => {
        const points: THREE.Vector3[] = []
        for (let i = 0; i <= 220; i += 1) {
          const a = (i / 220) * Math.PI * 2
          points.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius))
        }
        return new THREE.BufferGeometry().setFromPoints(points)
      }),
    [radii],
  )

  // Built here rather than inline so each line can be opted out of picking and
  // disposed on unmount. Lines carry their own raycast with a screen-space
  // threshold, and a graticule that can be clicked is a graticule in the way.
  const lines = useMemo(
    () =>
      geometries.map((geometry) => {
        const line = new THREE.Line(
          geometry,
          new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.055 }),
        )
        line.raycast = NO_PICK
        return line
      }),
    [geometries],
  )

  useEffect(
    () => () =>
      lines.forEach((line) => {
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      }),
    [lines],
  )

  return (
    <group>
      {lines.map((line, index) => (
        <primitive key={index} object={line} />
      ))}
    </group>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   A BODY
   ──────────────────────────────────────────────────────────────────────────── */
function BodyMesh({
  body,
  selected,
  hovered,
  dimmed,
  onHover,
  onSelect,
  onPosition,
}: {
  body: Body
  selected: boolean
  hovered: boolean
  dimmed: boolean
  onHover: (body: Body | null, client: { x: number; y: number } | null) => void
  onSelect: (body: Body) => void
  onPosition: (id: string, position: THREE.Vector3) => void
}) {
  const group = useRef<THREE.Group>(null)
  const core = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Mesh>(null)
  const scale = useRef(0.001)

  // Textures are loaded imperatively so a failure is observable. A body whose
  // image never arrives must fall back to the machined material — an unresolved
  // texture on a standard material renders as a featureless white sphere, which
  // looks like a bug rather than a missing logo.
  const [texture, setTexture] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    if (!body.image) return
    let live = true
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      body.image,
      (loaded) => {
        if (!live) {
          loaded.dispose()
          return
        }
        loaded.colorSpace = THREE.SRGBColorSpace
        setTexture(loaded)
      },
      undefined,
      () => setTexture(null),
    )
    return () => {
      live = false
    }
  }, [body.image])

  useEffect(() => () => texture?.dispose(), [texture])

  const hue = useMemo(() => new THREE.Color(body.hue[0], body.hue[1], body.hue[2]), [body.hue])

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime
    const [x, y, z] = positionAt(body, t)
    if (group.current) {
      group.current.position.set(x, y, z)
      onPosition(body.id, group.current.position)
    }
    if (core.current) core.current.rotation.y = t * 0.12 + body.phase

    // Entrance and axis changes are sprung rather than cut, so switching the
    // axis reads as the same system re-measuring itself.
    const targetScale = dimmed ? 0.42 : selected || hovered ? 1.16 : 1
    const k = Math.pow(2, -delta / 0.16)
    scale.current = targetScale + (scale.current - targetScale) * k
    if (group.current) group.current.scale.setScalar(scale.current)

    if (halo.current) {
      const material = halo.current.material as THREE.MeshBasicMaterial
      // A body carrying artwork can hold a full atmosphere; a bare vessel cannot.
      // At full strength the additive shell rings a dark sphere in near-white and
      // the body starts reading as a soap bubble, so it is held back here.
      const shell = texture ? 1 : 0.5
      const targetOpacity = (dimmed ? 0.03 : selected ? 0.3 : hovered ? 0.22 : 0.1) * shell
      material.opacity += (targetOpacity - material.opacity) * (1 - k)
    }
  })

  // The pick target is deliberately larger than the body it selects.
  //
  // Radius tracks the cube root of the measure, so the smallest community is
  // roughly a tenth the radius of the largest — a couple of pixels at default
  // zoom. Asking a reader to hit that is asking them to give up. An invisible
  // sphere carries every pointer handler instead, so a near miss still counts.
  const pick = Math.max(body.radius * 2.1, 1.45)

  return (
    <group ref={group}>
      <mesh
        visible={false}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          onHover(body, { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY })
        }}
        onPointerMove={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          onHover(body, { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY })
        }}
        onPointerOut={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          onHover(null, null)
        }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          onSelect(body)
        }}
      >
        <sphereGeometry args={[pick, 16, 16]} />
      </mesh>

      <mesh ref={core}>
        <sphereGeometry args={[body.radius, 42, 42]} />
        {texture ? (
          // A community's own image, mapped onto the body. Kept bright and low
          // metalness so the artwork stays legible; the emissive map lifts it out
          // of the void without washing the colour.
          //
          // The explicit `key` matters: without it React patches the untextured
          // material in place when the image arrives, and the props that only
          // exist on the other branch are left behind on the instance — which
          // silently suppresses the map. Keying forces a fresh material.
          <meshStandardMaterial
            key="textured"
            map={texture}
            color="#ffffff"
            emissiveMap={texture}
            emissive="#ffffff"
            emissiveIntensity={selected || hovered ? 0.55 : 0.34}
            roughness={0.58}
            metalness={0.06}
            toneMapped={false}
          />
        ) : (
          // An uploader has no image of its own, so it is drawn as a sealed
          // vessel: a dark body with a lit edge, not a coloured ball.
          //
          // The emissive figures look implausibly small and are not. Emissive is
          // applied in linear space and the frame is gamma-encoded on the way
          // out, which lifts small values hard — an intensity of 0.12 against a
          // near-white hue lands around sRGB 90, a mid grey, which is exactly
          // how twenty-eight of these came to read as pale marbles. Keeping the
          // face near-black is what lets the rim and the atmosphere do the work.
          <meshStandardMaterial
            key="machined"
            color="#0e131b"
            emissive={hue}
            emissiveIntensity={selected || hovered ? 0.11 : 0.022}
            roughness={0.62}
            metalness={0.3}
          />
        )}
      </mesh>

      {/* A machined equatorial edge, so a body with no artwork still has
          structure to catch the light and a sense of being built. */}
      {!texture && (
        <mesh rotation={[Math.PI / 2, 0.2, 0]} raycast={NO_PICK}>
          <torusGeometry args={[body.radius * 1.03, body.radius * 0.016, 6, 72]} />
          <meshBasicMaterial
            color={hue}
            transparent
            opacity={selected || hovered ? 0.8 : 0.4}
            toneMapped={false}
          />
        </mesh>
      )}

      {/* Atmosphere. Back-side additive shell: the standard trick, and still the
          only one that reads as a lit body rather than a sticker. Excluded from
          the raycast — decoration should never compete for the pointer. */}
      <mesh ref={halo} scale={1.18} raycast={NO_PICK}>
        <sphereGeometry args={[body.radius, 24, 24]} />
        <meshBasicMaterial
          color={hue}
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {selected && (
        <mesh rotation={[Math.PI / 2, 0, 0]} raycast={NO_PICK}>
          <torusGeometry args={[body.radius * 1.75, 0.014, 6, 96]} />
          <meshBasicMaterial color="#ff8a5c" toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   STATIONS
   Four fixed markers, one per network. Never sized by anything: their asset
   prices are irrelevant to whether an archive holds. An unlit station is a
   network that is not answering.
   ──────────────────────────────────────────────────────────────────────────── */
function Stations({ operational }: { operational: Record<string, boolean> }) {
  return (
    <group>
      {STATIONS.map((station) => {
        const position = new THREE.Vector3(
          Math.cos(station.angle) * STATION_RADIUS,
          station.elevation,
          Math.sin(station.angle) * STATION_RADIUS,
        )
        const live = operational[station.id] ?? station.operational
        const hue = new THREE.Color(station.hue[0], station.hue[1], station.hue[2])

        return (
          <group key={station.id} position={position}>
            {/* An octahedron reads as built rather than grown — stations should
                not look like planets. */}
            <mesh rotation={[0, station.angle, 0]} raycast={NO_PICK}>
              <octahedronGeometry args={[live ? 1.5 : 1.32, 0]} />
              <meshStandardMaterial
                color={live ? '#1b2230' : '#12141b'}
                emissive={hue}
                emissiveIntensity={live ? 0.85 : 0.06}
                roughness={0.3}
                metalness={0.85}
                wireframe={!live}
              />
            </mesh>

            {live && (
              <mesh scale={2.1} raycast={NO_PICK}>
                <octahedronGeometry args={[1.5, 0]} />
                <meshBasicMaterial
                  color={hue}
                  transparent
                  opacity={0.1}
                  blending={THREE.AdditiveBlending}
                  side={THREE.BackSide}
                  depthWrite={false}
                />
              </mesh>
            )}

            {/* Tether to the core. Solid when the station answers, dashed and
                dim when it does not. */}
            <Tether from={position} to={new THREE.Vector3(0, 0, 0)} hue={hue} live={live} />
          </group>
        )
      })}
    </group>
  )
}

function Tether({
  from,
  to,
  hue,
  live,
}: {
  from: THREE.Vector3
  to: THREE.Vector3
  hue: THREE.Color
  live: boolean
}) {
  const object = useMemo(() => {
    const local = to.clone().sub(from)
    const mid = local.clone().multiplyScalar(0.5)
    mid.add(UP.clone().multiplyScalar(local.length() * 0.14))
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), mid, local)
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(60))

    if (live) {
      const material = new THREE.LineBasicMaterial({ color: hue, transparent: true, opacity: 0.3 })
      const solid = new THREE.Line(geometry, material)
      solid.raycast = NO_PICK
      return solid
    }
    const material = new THREE.LineDashedMaterial({
      color: hue,
      transparent: true,
      opacity: 0.24,
      dashSize: 0.7,
      gapSize: 0.7,
    })
    const line = new THREE.Line(geometry, material)
    line.raycast = NO_PICK
    line.computeLineDistances()
    return line
  }, [from, to, hue, live])

  useEffect(
    () => () => {
      object.geometry.dispose()
      ;(object.material as THREE.Material).dispose()
    },
    [object],
  )

  return <primitive object={object} />
}

/* ────────────────────────────────────────────────────────────────────────────
   STARFIELD
   A thin shell of points. Sparse on purpose: a dense field competes with the
   bodies for attention and turns an instrument into a screensaver.
   ──────────────────────────────────────────────────────────────────────────── */
function Starfield({ count = 900 }: { count?: number }) {
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i += 1) {
      const r = 120 + Math.random() * 190
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.55
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return g
  }, [count])

  useEffect(() => () => geometry.dispose(), [geometry])

  const points = useRef<THREE.Points>(null)
  useFrame(({ clock }) => {
    if (points.current) points.current.rotation.y = clock.elapsedTime * 0.004
  })

  return (
    <points ref={points} geometry={geometry} raycast={NO_PICK}>
      <pointsMaterial size={0.62} color="#8fa4c8" transparent opacity={0.5} sizeAttenuation />
    </points>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   THE PENDING LATTICE
   What the metadata index would draw. Every one of these edges is unlit, because
   binding a data set to the community that published it is Arkiv's job and Arkiv
   is not answering. Drawing the absence is the most truthful thing on the map.
   ──────────────────────────────────────────────────────────────────────────── */
function PendingLattice({ visible }: { visible: boolean }) {
  const group = useRef<THREE.Group>(null)

  const lines = useMemo(() => {
    const out: THREE.Line[] = []
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2
      const inner = new THREE.Vector3(Math.cos(a) * 10.5, Math.sin(i * 1.3) * 1.4, Math.sin(a) * 10.5)
      const outerAngle = a + 0.7
      const outer = new THREE.Vector3(
        Math.cos(outerAngle) * 24,
        Math.sin(i * 0.9) * 2.2,
        Math.sin(outerAngle) * 24,
      )
      const mid = inner.clone().lerp(outer, 0.5).add(UP.clone().multiplyScalar(2.6))
      const curve = new THREE.QuadraticBezierCurve3(inner, mid, outer)
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40))
      const material = new THREE.LineDashedMaterial({
        color: '#56d68e',
        transparent: true,
        opacity: 0.16,
        dashSize: 0.5,
        gapSize: 0.9,
      })
      const line = new THREE.Line(geometry, material)
      line.raycast = NO_PICK
      line.computeLineDistances()
      out.push(line)
    }
    return out
  }, [])

  useEffect(
    () => () =>
      lines.forEach((line) => {
        line.geometry.dispose()
        ;(line.material as THREE.Material).dispose()
      }),
    [lines],
  )

  useFrame(({ clock }) => {
    if (!group.current) return
    group.current.visible = visible
    // The lattice breathes rather than crawls: three's dashed material exposes no
    // dash offset, and a slow opacity pulse reads as "waiting" more clearly than a
    // marching pattern would anyway.
    const pulse = 0.1 + (Math.sin(clock.elapsedTime * 0.6) * 0.5 + 0.5) * 0.12
    for (const line of lines) {
      const material = line.material as THREE.LineDashedMaterial
      material.opacity = pulse
    }
  })

  return (
    <group ref={group}>
      {lines.map((line, index) => (
        <primitive key={index} object={line} />
      ))}
    </group>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
   POINTER INTENT
   Separates a selection from a camera move.

   Displacement between press and release is not enough: an orbit that swings out
   and comes back releases exactly where it started, which measures as a perfectly
   still click. So the flag is sticky — once the pointer travels past the slop
   during a press, that press can no longer select anything, wherever it ends up.
   It stays set through release, because the click event arrives after pointerup.
   ──────────────────────────────────────────────────────────────────────────── */
interface Intent {
  origin: { x: number; y: number } | null
  moved: boolean
}

function PointerIntent({ intent }: { intent: React.RefObject<Intent> }) {
  const { gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement

    const onDown = (event: PointerEvent) => {
      const state = intent.current
      if (!state) return
      state.origin = { x: event.clientX, y: event.clientY }
      state.moved = false
    }

    const onMove = (event: PointerEvent) => {
      const state = intent.current
      if (!state?.origin || state.moved) return
      const travelled = Math.hypot(event.clientX - state.origin.x, event.clientY - state.origin.y)
      if (travelled > DRAG_SLOP) state.moved = true
    }

    // Released outside the canvas still ends the gesture, so this listens wide.
    const onUp = () => {
      const state = intent.current
      if (state) state.origin = null
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    addEventListener('pointerup', onUp)

    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      removeEventListener('pointerup', onUp)
    }
  }, [gl, intent])

  return null
}

/* ────────────────────────────────────────────────────────────────────────────
   CURSOR
   The stage cursor is `grab`, which tells a reader the view can be moved but not
   that anything in it can be opened. Over a body it becomes `pointer`. Without
   this the map is fully interactive and still reads as a picture.
   ──────────────────────────────────────────────────────────────────────────── */
function Cursor({ over }: { over: boolean }) {
  const { gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement
    canvas.style.cursor = over ? 'pointer' : ''
    return () => {
      canvas.style.cursor = ''
    }
  }, [gl, over])

  return null
}

/* ────────────────────────────────────────────────────────────────────────────
   SCENE
   ──────────────────────────────────────────────────────────────────────────── */
export interface SceneProps {
  bodies: Body[]
  axis: Axis
  selectedId: string | null
  filter: string | null
  operational: Record<string, boolean>
  showLattice: boolean
  onHover: (body: Body | null, client: { x: number; y: number } | null) => void
  onSelect: (body: Body | null) => void
  quality: 'high' | 'low'
}

export default function Scene({
  bodies,
  axis,
  selectedId,
  filter,
  operational,
  showLattice,
  onHover,
  onSelect,
  quality,
}: SceneProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [interacting, setInteracting] = useState(false)
  const positions = useRef(new Map<string, THREE.Vector3>())

  // Where the pointer went down and whether it has since travelled. A body click
  // and a camera orbit both end in a release over the scene; only the path taken
  // tells them apart.
  const intent = useRef<Intent>({ origin: null, moved: false })

  const lanes = useMemo(() => [...new Set(bodies.map((b) => Math.round(b.orbit * 2) / 2))], [bodies])

  const handleHover = (body: Body | null, client: { x: number; y: number } | null) => {
    setHoveredId(body?.id ?? null)
    onHover(body, client)
  }

  const handleSelect = (body: Body) => {
    if (intent.current.moved) return
    onSelect(body)
  }

  return (
    <Canvas
      dpr={quality === 'high' ? [1, 1.75] : [0.75, 1]}
      camera={{ position: [30, 26, 46], fov: 42, near: 0.1, far: 600 }}
      gl={{ antialias: quality === 'high', powerPreference: 'high-performance' }}
      onPointerMissed={() => {
        // Dismissing is a click too, so it takes the same test: releasing a long
        // orbit over empty space is not a request to clear the selection.
        if (intent.current.moved) return
        onSelect(null)
      }}
    >
      <color attach="background" args={['#08090d']} />
      {/* Fog starts well beyond the outer stations so it only softens the
          starfield, never the bodies. */}
      <fog attach="fog" args={['#08090d', 120, 340]} />

      {/* Lighting: one key from above-left, one cool fill from below-right, and
          an ember point at the core so bodies are rimmed by the archive itself. */}
      <ambientLight intensity={0.85} />
      <directionalLight position={[24, 34, 18]} intensity={2.1} color="#fff4e8" />
      <directionalLight position={[-28, -14, -20]} intensity={0.75} color="#8fa8dc" />
      <pointLight position={[0, 0, 0]} intensity={34} distance={46} decay={2} color="#ff8a5c" />

      <Starfield count={quality === 'high' ? 900 : 380} />
      <Lanes radii={lanes} />
      <Void />
      <Stations operational={operational} />
      <PendingLattice visible={showLattice} />

      {bodies.map((body) => (
        <BodyMesh
          key={`${axis}-${body.id}`}
          body={body}
          selected={selectedId === body.id}
          hovered={hoveredId === body.id}
          dimmed={
            (filter !== null && body.detail.constellation !== filter) ||
            (selectedId !== null && selectedId !== body.id)
          }
          onHover={handleHover}
          onSelect={handleSelect}
          onPosition={(id, position) => positions.current.set(id, position)}
        />
      ))}

      <PointerIntent intent={intent} />
      <Cursor over={hoveredId !== null} />

      <Rig positions={positions} selectedId={selectedId} interacting={interacting} onInteract={setInteracting} />

      {quality === 'high' && (
        <EffectComposer>
          <Bloom intensity={0.42} luminanceThreshold={0.62} luminanceSmoothing={0.24} mipmapBlur radius={0.55} />
          <Vignette eskil={false} offset={0.3} darkness={0.6} />
        </EffectComposer>
      )}
    </Canvas>
  )
}
