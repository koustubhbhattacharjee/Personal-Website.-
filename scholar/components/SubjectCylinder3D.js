import { useMemo, useState, useRef, useEffect } from "react"
import dynamic from "next/dynamic"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import MathText from "./MathText"
import styles from "../styles/Dashboard.module.css"

const Excalidraw = dynamic(
  () =>
    import("@excalidraw/excalidraw")
      .then((m) => m.Excalidraw || m.default)
      .catch(() => () => <div style={{ padding: 12, color: "var(--text-muted)" }}>Scratchpad unavailable</div>),
  { ssr: false }
)

// ─── cylinder constants ────────────────────────────────────────
export const CYL_R    = 0.8
const DISK_GAP = 0.04
export const CUBE_HALF = 0.86
export const TORUS_MAJOR_R = 1.02
export const TORUS_TUBE_R = 0.25
const LUMINOUS_EMISSIVE_BOOST = 1.45
// Euler rotation applied to all cylinder/cube arc and question scenes
export const ARC_SCENE_ROTATION = [-0.62, 0.56, 0.12]
function LuminousMaterial({ color, opacity = 1, emissiveIntensity = 0.2, side = undefined }) {
  return (
    <meshPhysicalMaterial
      color={color}
      emissive={color}
      emissiveIntensity={emissiveIntensity * LUMINOUS_EMISSIVE_BOOST}
      transparent={opacity < 0.999}
      opacity={opacity}
      side={side}
      roughness={0.18}
      metalness={0.08}
      clearcoat={0.28}
      clearcoatRoughness={0.16}
      reflectivity={0.38}
    />
  )
}

// Frosted, hollow ice look for subsections that carry no underlying data.
// Deliberately translucent so the viewer can tell it is a placeholder and
// not a zero-mastery reading.
function IceMaterial({ side = undefined, emissiveBoost = 0 }) {
  return (
    <meshPhysicalMaterial
      color="#e2f0f6"
      emissive="#8ec1d4"
      emissiveIntensity={0.08 + emissiveBoost}
      transparent
      opacity={0.22}
      side={side}
      roughness={0.78}
      metalness={0}
      clearcoat={0.9}
      clearcoatRoughness={0.62}
      transmission={0.7}
      thickness={0.22}
      ior={1.31}
      attenuationColor="#9fc8d6"
      attenuationDistance={3.5}
      reflectivity={0.2}
      depthWrite={false}
    />
  )
}

// Edge overlay for ice meshes: crisp white lines that read as frosted facets
// and make the hollow shell obvious even when the viewer is looking straight on.
function IceEdges({ geometry, threshold = 22 }) {
  const edges = useMemo(() => {
    if (!geometry) return null
    return new THREE.EdgesGeometry(geometry, threshold)
  }, [geometry, threshold])
  if (!edges) return null
  return (
    <lineSegments geometry={edges}>
      <lineBasicMaterial color="#f2fbff" transparent opacity={0.55} />
    </lineSegments>
  )
}

// ─── arc scene (Canvas 3) geometry ────────────────────────────
export const TOTAL_CYLINDER_HEIGHT = 10
export const DISPLAY_CYLINDER_HEIGHT = 4.2
export const SECONDARY_HEIGHT_SCALE = 0.42
const CAMERA_FIXED_PHI = 1.02
export const ZERO_TARGET = [0, 0, 0]

const WINDOW_STYLE = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  boxShadow: "none",
  overflow: "hidden",
  position: "relative",
  isolation: "isolate",
  zIndex: 0,
}

const WINDOW_BAR_STYLE = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 10,
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface)",
  flexShrink: 0,
}

const CANVAS_BG_MAP = {
  morning:   "#f2e8d6",
  afternoon: "#f2ecce",
  evening:   "#dce6f4",
  night:     "#e7eef9",
  ocean:     "#e8f0f2",
  ember:     "#fdf6e3",
  midnight:  "#0A0A2E",
  royal:     "#1A1A5E",
}

const ROTATE_ICON = (
  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.8 8A5.2 5.2 0 0 1 8 2.8c2 0 3.7 1.1 4.6 2.8"/>
    <polyline points="10.5,4.4 13.4,5.2 12.6,2.3"/>
  </svg>
)

const MASTERY_STOPS_SUNSET   = ["#FE4365", "#FC9D9A", "#F9CDA0", "#C8C8A9", "#83AF9B"]
const MASTERY_STOPS_OCEAN    = ["#554F4F", "#547980", "#45ADA8", "#9DE0AD", "#E5FCC2"]
const MASTERY_STOPS_EMBER    = ["#FF9A80", "#FFB86B", "#FFE14E", "#F5EE8F", "#ECFBD4"]
const MASTERY_STOPS_MIDNIGHT = ["#0A0A2E", "#1A1A5E", "#C9A84C", "#E8D48B", "#FFFFFF"]
const MASTERY_STOPS_ROYAL    = ["#1A1A5E", "#C9A84C", "#E8D48B", "#F0E8B0", "#FFFFFF"]

function makePalette(stops, lightBoost = 1, lightDistance = 1) {
  return { stops, low: stops[0], mid: stops[2], high: stops[4], lightBoost, lightDistance }
}

function scalePos([x, y, z], d = 1) {
  return [x * d, y * d, z * d]
}

export const VISUAL_THEME_PALETTES = {
  morning:   makePalette(MASTERY_STOPS_SUNSET),
  afternoon: makePalette(MASTERY_STOPS_SUNSET),
  evening:   makePalette(MASTERY_STOPS_SUNSET),
  night:     makePalette(MASTERY_STOPS_SUNSET),
  ocean:     makePalette(MASTERY_STOPS_OCEAN),
  ember:     makePalette(MASTERY_STOPS_EMBER, 1.25, 0.6),
  midnight:  makePalette(MASTERY_STOPS_MIDNIGHT),
  royal:     makePalette(MASTERY_STOPS_ROYAL),
}

function MasteryBar({ mastery, onMasteryChange }) {
  const barRef = useRef(null)
  if (mastery == null) return null
  const pct = Math.round(Math.min(1, Math.max(0, mastery)) * 100)
  const fillColor = mastery < 0.5
    ? `linear-gradient(90deg, #c94747 0%, #d4b800 100%)`
    : `linear-gradient(90deg, #d4b800 0%, #4aaa72 100%)`
  const draggable = !!onMasteryChange

  const handleMouseDown = (e) => {
    if (!draggable) return
    e.preventDefault()
    e.stopPropagation()
    const update = (clientX) => {
      const rect = barRef.current?.getBoundingClientRect()
      if (!rect) return
      onMasteryChange(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)))
    }
    update(e.clientX)
    const onMove = (ev) => update(ev.clientX)
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  return (
    <div style={{ flexShrink: 0, padding: "0 2px 6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          ref={barRef}
          onMouseDown={handleMouseDown}
          style={{
            flex: 1, height: draggable ? 7 : 4, borderRadius: 3,
            background: "var(--border)", overflow: "hidden",
            cursor: draggable ? "ew-resize" : "default",
          }}
        >
          <div style={{
            height: "100%", width: `${pct}%`,
            background: fillColor, borderRadius: 3,
            transition: draggable ? "none" : "width 0.55s cubic-bezier(0.4,0,0.2,1)",
            pointerEvents: "none",
          }} />
        </div>
        <span style={{
          fontFamily: "'DM Mono', monospace", fontSize: 10,
          color: "var(--text-muted)", flexShrink: 0, minWidth: 32, textAlign: "right",
        }}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

function SceneWindow({ title, subtitle, description = "", children, windowRef, width = null, large = false, squareViewport = false, mastery = null, onMasteryChange = null, hoverLabel = null }) {
  return (
    <div
      ref={windowRef}
      style={{
        ...WINDOW_STYLE,
        width: width || "100%",
        flex: width ? "0 0 auto" : 1,
        minWidth: width || 0,
      }}
    >
      <div style={WINDOW_BAR_STYLE}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11,
              color: "var(--text-dim)",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
      <div style={{
        flex: 1,
        minHeight: 0,
        padding: large ? 14 : 10,
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        <div style={{
          position: "relative",
          width: "100%",
          flex: "0 0 auto",
          height: squareViewport ? undefined : 280,
          minHeight: squareViewport ? 0 : 280,
          aspectRatio: squareViewport ? "1 / 1" : undefined,
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid var(--border)",
          background: "var(--surface)",
        }}>
          {children}
          {/* Depth vignette */}
          <div style={{
            position: "absolute",
            inset: 0,
            borderRadius: 14,
            background: "radial-gradient(ellipse at 50% 46%, transparent 38%, rgba(0,0,0,0.26) 100%)",
            pointerEvents: "none",
            zIndex: 1,
          }} />
          <div style={{
            position: "absolute",
            bottom: 8,
            right: 8,
            width: 26,
            height: 26,
            borderRadius: 6,
            background: "color-mix(in srgb, var(--text) 10%, transparent)",
            border: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
            opacity: 0.55,
            color: "var(--text-muted)",
            zIndex: 2,
          }}>
            {ROTATE_ICON}
          </div>
        </div>
        <MasteryBar mastery={mastery} onMasteryChange={onMasteryChange} />
        {hoverLabel !== null && (
          <div style={{
            flexShrink: 0,
            height: 28,
            display: "flex",
            alignItems: "center",
            padding: "0 2px",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: "var(--text-muted)",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            minHeight: 28,
          }}>
            {hoverLabel || "\u00a0"}
          </div>
        )}
        {description ? (
          <div style={{
            flexShrink: 0,
            fontFamily: "'Cormorant Garamond', 'Playfair Display', serif",
            fontSize: 12,
            lineHeight: 1.55,
            color: "var(--text-muted)",
            padding: "0 2px",
            textAlign: "left",
          }}>
            {description}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SquareSceneWindow({ title, subtitle, description = "", children, windowRef, hoverLabel = null }) {
  return (
    <div
      ref={windowRef}
      style={{
        ...WINDOW_STYLE,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Canvas area — takes all remaining height */}
      <div style={{
        flex: 1,
        minHeight: 0,
        position: "relative",
        borderRadius: "8px 8px 0 0",
        overflow: "hidden",
        background: "var(--surface)",
      }}>
        {children}
        {/* Depth vignette */}
        <div style={{
          position: "absolute",
          inset: 0,
          borderRadius: "8px 8px 0 0",
          background: "radial-gradient(ellipse at 50% 46%, transparent 38%, rgba(0,0,0,0.26) 100%)",
          pointerEvents: "none",
          zIndex: 1,
        }} />
        <div style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          width: 26,
          height: 26,
          borderRadius: 6,
          background: "color-mix(in srgb, var(--text) 10%, transparent)",
          border: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          opacity: 0.55,
          color: "var(--text-muted)",
          zIndex: 2,
        }}>
          {ROTATE_ICON}
        </div>
        {/* Title bar overlay */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          zIndex: 2,
        }}>
          <div style={{
            fontFamily: "'Cormorant Garamond', 'Playfair Display', serif",
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{
              fontFamily: "'Cormorant Garamond', 'Playfair Display', serif",
              fontSize: 11,
              color: "var(--text-dim)",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {/* Description overlay */}
        {description ? (
          <div style={{
            position: "absolute",
            left: 10,
            right: 10,
            bottom: 10,
            padding: "10px 12px",
            borderRadius: 4,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            boxShadow: "none",
            fontFamily: "'Cormorant Garamond', 'Playfair Display', serif",
            fontSize: 12,
            lineHeight: 1.45,
            color: "var(--text-muted)",
            zIndex: 2,
          }}>
            {description}
          </div>
        ) : null}
      </div>
      {/* Hover label strip — always fixed height, outside 3D space */}
      <div style={{
        flexShrink: 0,
        height: 28,
        display: "flex",
        alignItems: "center",
        padding: "0 10px",
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 12,
        color: "var(--text-muted)",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      }}>
        {hoverLabel || "\u00a0"}
      </div>
    </div>
  )
}

function hashStringToUnitInterval(input = "") {
  let hash = 2166136261
  const text = String(input || "")
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) % 1000000) / 1000000
}

function pickPreferredTheta(seedKey = "") {
  const bandPick = hashStringToUnitInterval(`${seedKey}:band`)
  const bandOffset = hashStringToUnitInterval(`${seedKey}:theta`)
  const bandStart = bandPick < 0.5 ? Math.PI / 4 : (5 * Math.PI) / 4
  return bandStart + bandOffset * (Math.PI / 2)
}

// Phi is chosen from [π/4, 3π/4] — the equatorial band.
function pickPreferredPhi(seedKey = "") {
  const raw = hashStringToUnitInterval(`${seedKey}:phi`)
  return (Math.PI / 4) + raw * (Math.PI / 2)
}

export function sphericalToCartesian(radius, theta, phi = CAMERA_FIXED_PHI) {
  const safeRadius = Math.max(1, radius)
  const sinPhi = Math.sin(phi)
  return [
    safeRadius * sinPhi * Math.cos(theta),
    safeRadius * Math.cos(phi),
    safeRadius * sinPhi * Math.sin(theta),
  ]
}

// Radius is always the 7R orbit distance — no zoom during intro.
// Only phi drifts: starts ±15° away from the target phi, eases in.
// Theta is fixed at the randomized value throughout.
export function buildCameraSpec(radius, seedKey) {
  const safeRadius = Math.max(0.12, radius)
  const theta = pickPreferredTheta(seedKey)
  const phi = pickPreferredPhi(seedKey)
  const startPhiJitter = (hashStringToUnitInterval(`${seedKey}:startphi`) - 0.5) * (Math.PI / 6) // ±15°
  return {
    radius: safeRadius,
    theta,
    phi,
    startPhi: Math.max(0.01, Math.min(Math.PI - 0.01, phi + startPhiJitter)),
  }
}

function characteristicBandSize(outer = 0, inner = 0, height = 0) {
  return Math.max(outer - inner, height) / 2
}

function rotatePoint(point, euler) {
  const v = new THREE.Vector3(point[0] || 0, point[1] || 0, point[2] || 0)
  v.applyEuler(new THREE.Euler(euler[0] || 0, euler[1] || 0, euler[2] || 0))
  return [v.x, v.y, v.z]
}

export function torusSegmentMidpoint({
  majorRadius = TORUS_MAJOR_R,
  innerTubeRadius = 0,
  outerTubeRadius = TORUS_TUBE_R,
  thetaStart = 0,
  thetaLen = Math.PI * 2,
  phiStart = 0,
  phiLen = Math.PI * 2,
  rotation = [Math.PI / 2.35, 0, 0.1],
}) {
  const thetaMid = thetaStart + thetaLen / 2
  const tubeMid = (innerTubeRadius + outerTubeRadius) / 2
  const phiMid = phiLen >= Math.PI * 2 - 1e-4 ? 0 : (phiStart + phiLen / 2)
  const localPoint = torusPoint(majorRadius, tubeMid, thetaMid, phiMid)
  return rotatePoint(localPoint, rotation)
}

function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// Ease-out cubic: fast start, decelerates into the final position (settles).
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

export function AnimatedOrbitControls({
  cameraSpec,
  target = [0, 0, 0],
  minDistance,
  maxDistance,
  enablePan = true,
  enableZoom = true,
  enableRotate = true,
  animateKey = "",
}) {
  const controlsRef = useRef(null)
  const { camera, invalidate } = useThree()
  const targetX = target[0] || 0
  const targetY = target[1] || 0
  const targetZ = target[2] || 0
  const animationRef = useRef({
    active: true,
    startedAt: null,
    duration: 0.95,
  })

  useEffect(() => {
    const startPhi = cameraSpec.startPhi ?? cameraSpec.phi
    const offset = sphericalToCartesian(cameraSpec.radius, cameraSpec.theta, startPhi)
    camera.position.set(targetX + offset[0], targetY + offset[1], targetZ + offset[2])
    camera.lookAt(targetX, targetY, targetZ)
    if (controlsRef.current) {
      controlsRef.current.target.set(targetX, targetY, targetZ)
      controlsRef.current.update()
    }
    animationRef.current = {
      active: true,
      startedAt: null,
      duration: 0.95,
    }
    invalidate()
  }, [camera, cameraSpec, targetX, targetY, targetZ, animateKey, invalidate])

  useFrame((state) => {
    if (!animationRef.current.active) return
    if (animationRef.current.startedAt == null) {
      animationRef.current.startedAt = state.clock.getElapsedTime()
    }
    const elapsed = state.clock.getElapsedTime() - animationRef.current.startedAt
    const t = Math.min(1, elapsed / animationRef.current.duration)
    const eased = easeOutCubic(t)
    // Radius and theta are fixed; only phi eases out (settles) from startPhi → phi.
    const startPhi = cameraSpec.startPhi ?? cameraSpec.phi
    const phi = startPhi + (cameraSpec.phi - startPhi) * eased
    const offset = sphericalToCartesian(cameraSpec.radius, cameraSpec.theta, phi)
    camera.position.set(targetX + offset[0], targetY + offset[1], targetZ + offset[2])
    camera.lookAt(targetX, targetY, targetZ)
    if (controlsRef.current) {
      controlsRef.current.target.set(targetX, targetY, targetZ)
      controlsRef.current.update()
    }
    invalidate()
    if (t >= 1) {
      animationRef.current.active = false
    }
  })

  // maxDistance must accommodate the 7R orbit radius so OrbitControls
  // doesn't clamp the camera back in immediately after the intro.
  const effectiveMaxDistance = maxDistance != null
    ? Math.max(maxDistance, cameraSpec.radius)
    : cameraSpec.radius * 2

  return (
    <OrbitControls
      ref={controlsRef}
      target={target}
      enablePan={enablePan}
      enableZoom={enableZoom}
      enableRotate={enableRotate}
      minDistance={minDistance}
      maxDistance={effectiveMaxDistance}
    />
  )
}

// ─── MasteryLegend: horizontal color scale for parents ──────────
function MasteryLegend({ palette }) {
  const stops = palette?.stops || [palette?.low || "#FE4365", palette?.mid || "#F9CDA0", palette?.high || "#83AF9B"]
  const low = stops[0], high = stops[stops.length - 1], mid = stops[Math.floor(stops.length / 2)]
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "5px 12px",
      borderRadius: 999,
      background: "rgba(255,255,255,0.82)",
      border: "1px solid rgba(191,203,222,0.55)",
      backdropFilter: "blur(4px)",
      width: "fit-content",
    }}>
      <div style={{
        width: 100,
        height: 7,
        borderRadius: 999,
        background: `linear-gradient(to right, ${stops.join(", ")})`,
        border: "1px solid rgba(0,0,0,0.07)",
        flexShrink: 0,
      }} />
      <div style={{ display: "flex", gap: 6, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", letterSpacing: "0.04em", fontFamily: "'DM Sans', sans-serif" }}>
        <span style={{ color: low }}>Not started</span>
        <span style={{ color: "#b0bfcf" }}>·</span>
        <span style={{ color: mid }}>Learning</span>
        <span style={{ color: "#b0bfcf" }}>·</span>
        <span style={{ color: high }}>Mastered</span>
      </div>
    </div>
  )
}

// ─── SceneExtras: floor gradient + perspective grid ─────────────
function SceneExtras({ floorY = -0.7, size = 5 }) {
  const gridObj = useMemo(() => {
    const divisions = Math.round(size * 2)
    const g = new THREE.GridHelper(size, divisions, 0x3d5a8a, 0x2c4472)
    if (Array.isArray(g.material)) {
      g.material.forEach(m => { m.transparent = true; m.opacity = 0.17 })
    } else {
      g.material.transparent = true
      g.material.opacity = 0.17
    }
    return g
  }, [size])

  return (
    <>
      {/* Subtle floor gradient plane */}
      <mesh position={[0, floorY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size * 1.1, size * 1.1]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.045} roughness={1} metalness={0} />
      </mesh>
      {/* Perspective grid */}
      <primitive object={gridObj} position={[0, floorY + 0.001, 0]} />
    </>
  )
}

// ─── helpers ──────────────────────────────────────────────────
function hexToHSL(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h, s, l }
}

function hslToHex(h, s, l) {
  const f = n => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255)
  }
  return "#" + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, "0")).join("")
}

function lerpHSL(hexA, hexB, t) {
  const ha = hexToHSL(hexA), hb = hexToHSL(hexB)
  let dh = hb.h - ha.h
  if (dh > 0.5) dh -= 1
  if (dh < -0.5) dh += 1
  return hslToHex(
    (ha.h + dh * t + 1) % 1,
    ha.s + (hb.s - ha.s) * t,
    ha.l + (hb.l - ha.l) * t,
  )
}

const PENDING_REVIEW_AMBER = "#d4a84c"

export function masteryToColor(mastery, palette = VISUAL_THEME_PALETTES.morning, pendingReview = 0) {
  if ((pendingReview || 0) > 0 && (mastery || 0) <= 0.0001) return PENDING_REVIEW_AMBER
  const stops = palette.stops || [palette.low, palette.mid, palette.high]
  const n = stops.length - 1
  const scaled = Math.min(Math.max(mastery, 0), 1) * n
  const i = Math.min(Math.floor(scaled), n - 1)
  return lerpHSL(stops[i], stops[i + 1], scaled - i)
}

function lightenColor(hex, amount = 0.35) {
  return "#" + new THREE.Color(hex).lerp(new THREE.Color(1, 1, 1), amount).getHexString()
}

function highlightColor(hex, amount = 0.35) {
  const color = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  const isRedHue = hsl.h <= 0.05 || hsl.h >= 0.95
  if (!isRedHue) return lightenColor(hex, amount)

  const boosted = color.clone().lerp(new THREE.Color("#ff3b30"), Math.min(0.7, amount + 0.18))
  const boostedHsl = { h: 0, s: 0, l: 0 }
  boosted.getHSL(boostedHsl)
  boosted.setHSL(
    boostedHsl.h,
    Math.min(1, Math.max(boostedHsl.s, 0.9)),
    Math.min(0.62, Math.max(boostedHsl.l, 0.54))
  )
  return "#" + boosted.getHexString()
}

function desaturateColor(hex, amount = 0.72) {
  const color = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  const desaturated = new THREE.Color()
  desaturated.setHSL(hsl.h, hsl.s * (1 - amount), hsl.l * 0.88 + 0.08)
  return "#" + desaturated.getHexString()
}

function complementaryColor(hex) {
  const color = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  const complementary = new THREE.Color()
  complementary.setHSL((hsl.h + 0.5) % 1, Math.max(hsl.s, 0.72), Math.min(Math.max(hsl.l, 0.42), 0.58))
  return "#" + complementary.getHexString()
}

// ─── WasherMesh: a 3-D hollow cylinder ring (outer shell + inner shell + caps) ──
function WasherMesh({ innerR, outerR, height, color, opacity, emissiveIntensity, isEmpty = false,
  onPointerOver, onPointerOut, onClick, onDoubleClick }) {
  const mat = isEmpty ? (
    <IceMaterial side={THREE.DoubleSide} />
  ) : (
    <LuminousMaterial
      color={color}
      opacity={opacity}
      emissiveIntensity={emissiveIntensity}
      side={THREE.DoubleSide}
    />
  )
  const edgeColor = "#f2fbff"
  return (
    <group onPointerOver={onPointerOver} onPointerOut={onPointerOut} onClick={onClick} onDoubleClick={onDoubleClick}>
      <mesh><cylinderGeometry args={[outerR, outerR, height, 48, 1, true]} />{mat}</mesh>
      <mesh><cylinderGeometry args={[innerR, innerR, height, 48, 1, true]} />{mat}</mesh>
      <mesh position={[0, height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerR, outerR, 48]} />{mat}
      </mesh>
      <mesh position={[0, -height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[innerR, outerR, 48]} />{mat}
      </mesh>
      {isEmpty ? (
        <>
          <mesh position={[0, height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[innerR, outerR, 48]} />
            <meshBasicMaterial color={edgeColor} wireframe transparent opacity={0.45} />
          </mesh>
          <mesh position={[0, -height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[innerR, outerR, 48]} />
            <meshBasicMaterial color={edgeColor} wireframe transparent opacity={0.45} />
          </mesh>
        </>
      ) : null}
    </group>
  )
}

// ─── ArcWasherMesh: wedge slice of a hollow cylinder ring ─────
function ArcWasherMesh({ innerR, outerR, height, thetaStart, thetaLen, color, opacity,
  emissiveIntensity, offsetY = 0, isEmpty = false, onPointerOver, onPointerOut, onClick, onDoubleClick }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    const thetaEnd = thetaStart + thetaLen
    shape.moveTo(Math.cos(thetaStart) * outerR, Math.sin(thetaStart) * outerR)
    shape.absarc(0, 0, outerR, thetaStart, thetaEnd, false)
    shape.lineTo(Math.cos(thetaEnd) * innerR, Math.sin(thetaEnd) * innerR)
    shape.absarc(0, 0, innerR, thetaEnd, thetaStart, true)
    shape.closePath()

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      curveSegments: 48,
      steps: 1,
    })
    geom.translate(0, 0, -height / 2)
    return geom
  }, [innerR, outerR, height, thetaStart, thetaLen])

  const mat = isEmpty ? (
    <IceMaterial side={THREE.DoubleSide} />
  ) : (
    <LuminousMaterial
      color={color}
      opacity={opacity}
      emissiveIntensity={emissiveIntensity}
      side={THREE.DoubleSide}
    />
  )
  return (
    <group
      position={[0, offsetY, 0]}
      rotation={[Math.PI / 2, 0, 0]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <mesh geometry={geometry}>{mat}</mesh>
      {isEmpty ? <IceEdges geometry={geometry} /> : null}
    </group>
  )
}

export function buildSquareFrameSegments(innerHalf, outerHalf) {
  const frameWidth = Math.max(0.01, outerHalf - innerHalf)
  const center = innerHalf + frameWidth / 2
  const sideLength = Math.max(0.02, innerHalf * 2)
  return [
    { key: "top", position: [0, 0, -center], size: [sideLength + frameWidth * 2, frameWidth] },
    { key: "bottom", position: [0, 0, center], size: [sideLength + frameWidth * 2, frameWidth] },
    { key: "left", position: [-center, 0, 0], size: [frameWidth, sideLength] },
    { key: "right", position: [center, 0, 0], size: [frameWidth, sideLength] },
  ]
}

function distanceToSquarePoint(sideLength, distance) {
  const total = sideLength * 4
  let remaining = ((distance % total) + total) % total
  if (remaining <= sideLength) {
    return { side: "top", offset: remaining, point: [-sideLength / 2 + remaining, -sideLength / 2] }
  }
  remaining -= sideLength
  if (remaining <= sideLength) {
    return { side: "right", offset: remaining, point: [sideLength / 2, -sideLength / 2 + remaining] }
  }
  remaining -= sideLength
  if (remaining <= sideLength) {
    return { side: "bottom", offset: remaining, point: [sideLength / 2 - remaining, sideLength / 2] }
  }
  remaining -= sideLength
  return { side: "left", offset: remaining, point: [-sideLength / 2, sideLength / 2 - remaining] }
}

export function buildSquarePerimeterPieces(innerHalf, outerHalf, fraction, startFraction = 0) {
  const frameWidth = Math.max(0.01, outerHalf - innerHalf)
  const centerHalf = innerHalf + frameWidth / 2
  const sideLength = Math.max(0.04, centerHalf * 2)
  const perimeter = sideLength * 4
  let remaining = Math.max(0.01, fraction) * perimeter
  let cursor = Math.max(0, startFraction) * perimeter
  const pieces = []
  const epsilon = 1e-6

  while (remaining > epsilon) {
    const start = distanceToSquarePoint(sideLength, cursor)
    const sideRemaining = sideLength - start.offset
    if (sideRemaining <= epsilon) {
      cursor += epsilon
      continue
    }
    const take = Math.min(remaining, sideRemaining)
    if (take <= epsilon) break
    const mid = distanceToSquarePoint(sideLength, cursor + take / 2)
    if (start.side === "top" || start.side === "bottom") {
      pieces.push({
        center: [mid.point[0], mid.point[1]],
        size: [take + frameWidth, frameWidth],
      })
    } else {
      pieces.push({
        center: [mid.point[0], mid.point[1]],
        size: [frameWidth, take + frameWidth],
      })
    }
    cursor += take
    remaining -= take
  }

  return pieces
}

function SquareFrameMesh({
  innerHalf,
  outerHalf,
  height,
  color,
  opacity = 1,
  emissiveIntensity = 0.2,
  offsetY = 0,
  isEmpty = false,
  onPointerOver,
  onPointerOut,
  onClick,
  onDoubleClick,
}) {
  const segments = useMemo(() => buildSquareFrameSegments(innerHalf, outerHalf), [innerHalf, outerHalf])
  return (
    <group position={[0, offsetY, 0]} onPointerOver={onPointerOver} onPointerOut={onPointerOut} onClick={onClick} onDoubleClick={onDoubleClick}>
      {segments.map((segment) => (
        <mesh key={segment.key} position={[segment.position[0], segment.position[1], segment.position[2]]}>
          <boxGeometry args={[segment.size[0], height, segment.size[1]]} />
          {isEmpty ? (
            <IceMaterial />
          ) : (
            <LuminousMaterial
              color={color}
              opacity={opacity}
              emissiveIntensity={emissiveIntensity}
            />
          )}
        </mesh>
      ))}
      {isEmpty ? segments.map((segment) => (
        <mesh key={`edge-${segment.key}`} position={[segment.position[0], segment.position[1], segment.position[2]]}>
          <boxGeometry args={[segment.size[0], height, segment.size[1]]} />
          <meshBasicMaterial color="#f2fbff" wireframe transparent opacity={0.45} />
        </mesh>
      )) : null}
    </group>
  )
}

function SquarePerimeterMesh({
  innerHalf,
  outerHalf,
  height,
  startFraction = 0,
  fraction = 0.25,
  color,
  opacity = 1,
  emissiveIntensity = 0.2,
  offsetY = 0,
  isEmpty = false,
  onPointerOver,
  onPointerOut,
  onClick,
  onDoubleClick,
}) {
  const pieces = useMemo(
    () => buildSquarePerimeterPieces(innerHalf, outerHalf, fraction, startFraction),
    [innerHalf, outerHalf, fraction, startFraction]
  )
  return (
    <group position={[0, offsetY, 0]} onPointerOver={onPointerOver} onPointerOut={onPointerOut} onClick={onClick} onDoubleClick={onDoubleClick}>
      {pieces.map((piece, idx) => (
        <mesh key={idx} position={[piece.center[0], 0, piece.center[1]]}>
          <boxGeometry args={[piece.size[0], height, piece.size[1]]} />
          {isEmpty ? (
            <IceMaterial />
          ) : (
            <LuminousMaterial
              color={color}
              opacity={opacity}
              emissiveIntensity={emissiveIntensity}
            />
          )}
        </mesh>
      ))}
      {isEmpty ? pieces.map((piece, idx) => (
        <mesh key={`edge-${idx}`} position={[piece.center[0], 0, piece.center[1]]}>
          <boxGeometry args={[piece.size[0], height, piece.size[1]]} />
          <meshBasicMaterial color="#f2fbff" wireframe transparent opacity={0.45} />
        </mesh>
      )) : null}
    </group>
  )
}

function torusPoint(majorRadius, tubeRadius, theta, phi) {
  return [
    (majorRadius + tubeRadius * Math.cos(phi)) * Math.cos(theta),
    (majorRadius + tubeRadius * Math.cos(phi)) * Math.sin(theta),
    tubeRadius * Math.sin(phi),
  ]
}

export function buildTorusShellSegmentGeometry({
  majorRadius = TORUS_MAJOR_R,
  innerTubeRadius = 0,
  outerTubeRadius = TORUS_TUBE_R,
  thetaStart = 0,
  thetaLen = Math.PI / 2,
  phiStart = 0,
  phiLen = Math.PI * 2,
}) {
  const geometry = new THREE.BufferGeometry()
  const positions = []
  const indices = []
  const epsilon = 1e-4
  const thetaSegments = Math.max(10, Math.round(72 * (Math.max(0.01, thetaLen) / (Math.PI * 2))))
  const tubeSegments = 28
  const fullPhi = phiLen >= Math.PI * 2 - epsilon

  const addSurface = (uSegments, vSegments, pointAt, flip = false) => {
    const baseIndex = positions.length / 3
    for (let u = 0; u <= uSegments; u += 1) {
      for (let v = 0; v <= vSegments; v += 1) {
        const point = pointAt(u / uSegments, v / vSegments)
        positions.push(point[0], point[1], point[2])
      }
    }
    for (let u = 0; u < uSegments; u += 1) {
      for (let v = 0; v < vSegments; v += 1) {
        const a = baseIndex + u * (vSegments + 1) + v
        const b = a + 1
        const c = baseIndex + (u + 1) * (vSegments + 1) + v
        const d = c + 1
        if (flip) {
          indices.push(a, b, c, b, d, c)
        } else {
          indices.push(a, c, b, b, c, d)
        }
      }
    }
  }

  addSurface(thetaSegments, tubeSegments, (u, v) => {
    const theta = thetaStart + thetaLen * u
    const phi = phiStart + phiLen * v
    return torusPoint(majorRadius, outerTubeRadius, theta, phi)
  })

  if (innerTubeRadius > epsilon) {
    addSurface(thetaSegments, tubeSegments, (u, v) => {
      const theta = thetaStart + thetaLen * u
      const phi = phiStart + phiLen * v
      return torusPoint(majorRadius, innerTubeRadius, theta, phi)
    }, true)
  }

  addSurface(12, tubeSegments, (u, v) => {
    const radius = innerTubeRadius > epsilon
      ? innerTubeRadius + (outerTubeRadius - innerTubeRadius) * u
      : outerTubeRadius * u
    const phi = phiStart + phiLen * v
    return torusPoint(majorRadius, radius, thetaStart, phi)
  }, true)

  addSurface(12, tubeSegments, (u, v) => {
    const radius = innerTubeRadius > epsilon
      ? innerTubeRadius + (outerTubeRadius - innerTubeRadius) * u
      : outerTubeRadius * u
    const phi = phiStart + phiLen * v
    return torusPoint(majorRadius, radius, thetaStart + thetaLen, phi)
  })

  if (!fullPhi) {
    addSurface(thetaSegments, 12, (u, v) => {
      const theta = thetaStart + thetaLen * u
      const radius = innerTubeRadius > epsilon
        ? innerTubeRadius + (outerTubeRadius - innerTubeRadius) * v
        : outerTubeRadius * v
      return torusPoint(majorRadius, radius, theta, phiStart)
    }, true)

    addSurface(thetaSegments, 12, (u, v) => {
      const theta = thetaStart + thetaLen * u
      const radius = innerTubeRadius > epsilon
        ? innerTubeRadius + (outerTubeRadius - innerTubeRadius) * v
        : outerTubeRadius * v
      return torusPoint(majorRadius, radius, theta, phiStart + phiLen)
    })
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function TorusShellSegmentMesh({
  majorRadius = TORUS_MAJOR_R,
  innerTubeRadius = 0,
  outerTubeRadius = TORUS_TUBE_R,
  thetaStart = 0,
  thetaLen = Math.PI / 2,
  phiStart = 0,
  phiLen = Math.PI * 2,
  color,
  opacity = 1,
  emissiveIntensity = 0.2,
  isEmpty = false,
  onPointerOver,
  onPointerOut,
  onClick,
  onDoubleClick,
}) {
  const geometry = useMemo(
    () => buildTorusShellSegmentGeometry({ majorRadius, innerTubeRadius, outerTubeRadius, thetaStart, thetaLen, phiStart, phiLen }),
    [majorRadius, innerTubeRadius, outerTubeRadius, thetaStart, thetaLen, phiStart, phiLen]
  )
  return (
    <group
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <mesh geometry={geometry}>
        {isEmpty ? (
          <IceMaterial side={THREE.DoubleSide} />
        ) : (
          <LuminousMaterial
            color={color}
            opacity={opacity}
            emissiveIntensity={emissiveIntensity}
            side={THREE.DoubleSide}
          />
        )}
      </mesh>
      {isEmpty ? <IceEdges geometry={geometry} /> : null}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════
// CANVAS 3 — arc wedges per question type
// ═══════════════════════════════════════════════════════════════
export function RingSceneInner({ ring, ringHeight, activeArc, highlightedArcId, onHighlightArc, onDrillArc, onHoverLabel, palette }) {
  const [hovArc, setHovArc] = useState(null)

  const arcData = useMemo(() => {
    let angle = -Math.PI / 2
    return ring.arcs.map((arc, i) => {
      const start = angle
      const len   = Math.max(0.01, arc.angleFraction * Math.PI * 2)
      angle += len
      return { ...arc, start, len }
    })
  }, [ring.arcs])
  const allowArcHighlight = arcData.length > 1

  return (
    <>
      <ambientLight intensity={0.85 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([2, 4, 2], palette.lightDistance ?? 1)} intensity={0.9 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-1, 2, -1], palette.lightDistance ?? 1)} intensity={0.3 * (palette.lightBoost ?? 1)} color="#b0c8e0" />
      <spotLight position={scalePos([2.5, 3, 2], palette.lightDistance ?? 1)} intensity={1.8 * (palette.lightBoost ?? 1)} angle={Math.PI / 7} penumbra={0.45} color="#ffe8a0" distance={9 * (palette.lightDistance ?? 1)} decay={2} />

      <group rotation={[-0.58, 0.52, 0.08]}>
        {arcData.map((arc, i) => {
          const color = masteryToColor(arc.mastery, palette, arc.pendingReview || 0)
          const isSelected = activeArc?.questionTypeId === arc.questionTypeId
          const isHigh = highlightedArcId === arc.questionTypeId
          const isHov = hovArc === i
          const displayColor = allowArcHighlight
            ? (isSelected ? highlightColor(color, 0.55) : isHigh ? highlightColor(color, 0.42) : isHov ? highlightColor(color, 0.25) : color)
            : color
          const emissiveIntensity = allowArcHighlight
            ? (isSelected ? 0.95 : isHigh ? 0.65 : isHov ? 0.42 : 0.12)
            : 0.12
          return (
            <group key={i}>
              <ArcWasherMesh
                innerR={ring.innerR} outerR={ring.outerR} height={ringHeight}
                thetaStart={arc.start} thetaLen={arc.len}
                color={displayColor} opacity={1}
                emissiveIntensity={emissiveIntensity}
                offsetY={0}
                isEmpty={arc.hasData === false}
                onPointerOver={e => {
                  e.stopPropagation()
                  setHovArc(i)
                  onHoverLabel?.(`QT ${i + 1}${arc.type ? `: ${arc.type}` : ""}`)
                }}
                onPointerOut={() => {
                  setHovArc(null)
                  onHoverLabel?.("")
                }}
                onClick={e => {
                  e.stopPropagation()
                  onHighlightArc?.(arc)
                }}
                onDoubleClick={e => {
                  e.stopPropagation()
                  onDrillArc?.(arc)
                }}
              />
            </group>
          )
        })}
      </group>
      <SceneExtras floorY={-(ringHeight / 2 + 0.42)} size={5} />
    </>
  )
}

export function ArcFocusSceneInner({ ring, arc, ringHeight, palette, sliceIndex = null, totalSlices = null }) {
  if (!ring || !arc) return null
  const color = masteryToColor(arc.mastery, palette, arc.pendingReview || 0)
  const n = Number.isInteger(totalSlices) && totalSlices > 0 ? totalSlices : 1
  const sliceH = ringHeight / n
  const offsetY = Number.isInteger(sliceIndex) && sliceIndex >= 0
    ? ringHeight * (2 * sliceIndex + 1 - n) / (2 * n)
    : 0
  return (
    <>
      <ambientLight intensity={0.92 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([2.2, 4.4, 2.5], palette.lightDistance ?? 1)} intensity={1 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-1.2, 2.2, -1.2], palette.lightDistance ?? 1)} intensity={0.3 * (palette.lightBoost ?? 1)} color="#b0c8e0" />
      <spotLight position={scalePos([2.5, 3, 2], palette.lightDistance ?? 1)} intensity={1.8 * (palette.lightBoost ?? 1)} angle={Math.PI / 7} penumbra={0.45} color="#ffe8a0" distance={9 * (palette.lightDistance ?? 1)} decay={2} />

      <group rotation={[-0.62, 0.56, 0.12]}>
        <ArcWasherMesh
          innerR={ring.innerR}
          outerR={ring.outerR}
          height={sliceH}
          thetaStart={arc.start}
          thetaLen={arc.len}
          color={color}
          opacity={1}
          emissiveIntensity={0.18}
          offsetY={offsetY}
          isEmpty={arc.hasData === false}
        />
      </group>
      <SceneExtras floorY={-(ringHeight / 2 + 0.42)} size={5} />
    </>
  )
}

function resolveOptionIndexFromQuestion(question = {}) {
  if (Number.isInteger(question?.correctIndex)) return question.correctIndex
  const rawCorrectOption = String(question?.correctOption || question?.answer || "").trim().toUpperCase()
  if (/^[A-D]$/.test(rawCorrectOption)) return rawCorrectOption.charCodeAt(0) - 65
  const options = Array.isArray(question?.options) ? question.options : []
  if (!rawCorrectOption || !options.length) return null
  const derivedIndex = options.findIndex((option) => String(option || "").trim().toUpperCase() === rawCorrectOption)
  return derivedIndex >= 0 ? derivedIndex : null
}

function getAttemptedQuestionKeysForArc(arc = null) {
  if (!arc) return []
  return [...new Set([
    ...(Array.isArray(arc.attemptedQuestionKeys) ? arc.attemptedQuestionKeys : []),
    ...(Array.isArray(arc.correctQuestionKeys) ? arc.correctQuestionKeys : []),
  ].filter(Boolean))]
}

function getQuestionPoolForArc(arc = null) {
  const questions = Array.isArray(arc?.questions) ? arc.questions : []
  if (!questions.length) return []
  const attemptedKeySet = new Set(getAttemptedQuestionKeysForArc(arc))
  const unseen = questions.filter((question) => !attemptedKeySet.has(question?.key))
  return unseen.length ? unseen : questions
}

function pickRandomQuestionFromPool(pool = []) {
  if (!Array.isArray(pool) || !pool.length) return null
  return pool[Math.floor(Math.random() * pool.length)] || null
}

function QuestionSlicesSceneInner({ ring, arc, ringHeight, questions, selectedQuestionKey, onSelectQuestion, onHoverLabel, palette }) {
  const [hoveredKey, setHoveredKey] = useState("")
  const [lockedClickKey, setLockedClickKey] = useState("")
  const lockedTimerRef = useRef(null)

  if (!ring || !arc || !questions?.length) return null

  const n = questions.length
  const dr = (ring.outerR - ring.innerR) / n
  const color = masteryToColor(arc.mastery, palette, arc.pendingReview || 0)
  const attemptedColor = palette.high || "#4aaa72"

  const handleLockedClick = (key) => {
    if (lockedTimerRef.current) clearTimeout(lockedTimerRef.current)
    setLockedClickKey(key)
    lockedTimerRef.current = setTimeout(() => setLockedClickKey(""), 2200)
  }

  return (
    <>
      <ambientLight intensity={0.92 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([2.2, 4.4, 2.5], palette.lightDistance ?? 1)} intensity={1 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-1.2, 2.2, -1.2], palette.lightDistance ?? 1)} intensity={0.3 * (palette.lightBoost ?? 1)} color="#b0c8e0" />
      <spotLight position={scalePos([2.5, 3, 2], palette.lightDistance ?? 1)} intensity={1.8 * (palette.lightBoost ?? 1)} angle={Math.PI / 7} penumbra={0.45} color="#ffe8a0" distance={9 * (palette.lightDistance ?? 1)} decay={2} />

      <group rotation={[-0.62, 0.56, 0.12]}>
        {questions.map((question, idx) => {
          const key = question.key || `question-${idx}`
          const sliceInnerR = ring.innerR + idx * dr
          const sliceOuterR = ring.innerR + (idx + 1) * dr
          const isSelected = selectedQuestionKey === key
          const isHovered = hoveredKey === key
          const isSolved = (arc.correctQuestionKeys || []).includes(key)
          const isLocked = !isSelected && !isSolved
          const showLockedMsg = lockedClickKey === key
          const baseColor = isSolved ? attemptedColor : color
          const displayColor = isHovered ? highlightColor(baseColor, 0.35) : baseColor
          return (
            <group key={key}>
              <ArcWasherMesh
                innerR={sliceInnerR}
                outerR={sliceOuterR}
                height={ringHeight}
                thetaStart={arc.start}
                thetaLen={arc.len}
                color={displayColor}
                opacity={1}
                emissiveIntensity={isSolved ? 0.4 : isSelected ? 0.18 : isHovered ? 0.5 : 1.6}
                offsetY={0}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  setHoveredKey(key)
                  onHoverLabel?.(showLockedMsg ? `Q${idx + 1} — locked, opens next session` : isLocked ? `Q${idx + 1} — Locked` : isSolved ? `Q${idx + 1} — Done` : `Q${idx + 1}`)
                }}
                onPointerOut={() => { setHoveredKey(""); onHoverLabel?.("") }}
                onClick={(e) => { e.stopPropagation(); onSelectQuestion?.(key) }}
              />
            </group>
          )
        })}
      </group>
      <SceneExtras floorY={-(ringHeight / 2 + 0.42)} size={5} />
    </>
  )
}

export function CubeDiskSceneInner({ unit, onHighlightRing, onDrillRing, selectedRingCode = "", highlightedRingCode = "", unitHeight, palette }) {
  const [hovRing, setHovRing] = useState(null)
  const rings = unit.rings || []
  const allowRingHighlight = rings.length > 1
  return (
    <>
      <ambientLight intensity={0.85 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([2, 4, 2], palette.lightDistance ?? 1)} intensity={0.9 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-1, 2, -1], palette.lightDistance ?? 1)} intensity={0.3 * (palette.lightBoost ?? 1)} color="#b0c8e0" />
      <spotLight position={scalePos([2.5, 3, 2], palette.lightDistance ?? 1)} intensity={1.8 * (palette.lightBoost ?? 1)} angle={Math.PI / 7} penumbra={0.45} color="#ffe8a0" distance={9 * (palette.lightDistance ?? 1)} decay={2} />
      <group rotation={[-0.62, 0.48, 0.06]}>
        {rings.map((ring, i) => {
          const color = masteryToColor(ring.mastery, palette)
          const isHov = hovRing === i
          const isHigh = highlightedRingCode === ring.code
          const isSel = selectedRingCode === ring.code
          const ringColor = allowRingHighlight ? (isSel ? highlightColor(color, 0.55) : isHigh ? highlightColor(color, 0.42) : isHov ? highlightColor(color, 0.25) : color) : color
          return (
            <group key={ring.code || i}>
              <SquareFrameMesh
                innerHalf={ring.innerR}
                outerHalf={ring.outerR}
                height={unitHeight}
                color={ringColor}
                emissiveIntensity={allowRingHighlight ? (isSel ? 1.05 : isHigh ? 0.65 : isHov ? 0.42 : 0.14) : 0.14}
                isEmpty={ring.hasData === false}
                onPointerOver={(e) => { e.stopPropagation(); setHovRing(i) }}
                onPointerOut={() => setHovRing(null)}
                onClick={(e) => { e.stopPropagation(); onDrillRing(ring) }}
                onDoubleClick={(e) => { e.stopPropagation(); onDrillRing(ring) }}
              />
            </group>
          )
        })}
      </group>
      <SceneExtras floorY={-(unitHeight / 2 + 0.42)} size={5} />
    </>
  )
}

export function CubeRingSceneInner({ ring, ringHeight, activeArc, highlightedArcId, onHighlightArc, onDrillArc, palette }) {
  const [hovArc, setHovArc] = useState(null)
  const arcData = useMemo(() => {
    let fraction = 0
    return ring.arcs.map((arc) => {
      const startFraction = fraction
      const lenFraction = Math.max(0.01, arc.angleFraction)
      fraction += lenFraction
      return { ...arc, startFraction, lenFraction }
    })
  }, [ring.arcs])
  const allowArcHighlight = arcData.length > 1
  return (
    <>
      <ambientLight intensity={0.85 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([2, 4, 2], palette.lightDistance ?? 1)} intensity={0.9 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-1, 2, -1], palette.lightDistance ?? 1)} intensity={0.3 * (palette.lightBoost ?? 1)} color="#b0c8e0" />
      <spotLight position={scalePos([2.5, 3, 2], palette.lightDistance ?? 1)} intensity={1.8 * (palette.lightBoost ?? 1)} angle={Math.PI / 7} penumbra={0.45} color="#ffe8a0" distance={9 * (palette.lightDistance ?? 1)} decay={2} />
      <group rotation={[-0.58, 0.52, 0.08]}>
        {arcData.map((arc, i) => {
          const color = masteryToColor(arc.mastery, palette, arc.pendingReview || 0)
          const isSelected = activeArc?.questionTypeId === arc.questionTypeId
          const isHigh = highlightedArcId === arc.questionTypeId
          const isHov = hovArc === i
          const displayColor = allowArcHighlight
            ? (isSelected ? highlightColor(color, 0.55) : isHigh ? highlightColor(color, 0.42) : isHov ? highlightColor(color, 0.25) : color)
            : color
          const emissiveIntensity = allowArcHighlight ? (isSelected ? 0.95 : isHigh ? 0.65 : isHov ? 0.42 : 0.12) : 0.12
          return (
            <group key={i}>
              <SquarePerimeterMesh
                innerHalf={ring.innerR}
                outerHalf={ring.outerR}
                height={ringHeight}
                startFraction={arc.startFraction}
                fraction={arc.lenFraction}
                color={displayColor}
                emissiveIntensity={emissiveIntensity}
                isEmpty={arc.hasData === false}
                onPointerOver={(e) => { e.stopPropagation(); setHovArc(i) }}
                onPointerOut={() => setHovArc(null)}
                onClick={(e) => { e.stopPropagation(); onDrillArc?.(arc) }}
                onDoubleClick={(e) => { e.stopPropagation(); onDrillArc?.(arc) }}
              />
            </group>
          )
        })}
      </group>
      <SceneExtras floorY={-(ringHeight / 2 + 0.42)} size={5} />
    </>
  )
}

export function CubeArcFocusSceneInner({ ring, arc, ringHeight, palette, sliceIndex = null, totalSlices = null }) {
  if (!ring || !arc) return null
  const color = masteryToColor(arc.mastery, palette, arc.pendingReview || 0)
  const n = Number.isInteger(totalSlices) && totalSlices > 0 ? totalSlices : 1
  const sliceH = ringHeight / n
  const offsetY = Number.isInteger(sliceIndex) && sliceIndex >= 0
    ? ringHeight * (2 * sliceIndex + 1 - n) / (2 * n)
    : 0
  return (
    <>
      <ambientLight intensity={0.92 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([2.2, 4.4, 2.5], palette.lightDistance ?? 1)} intensity={1 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-1.2, 2.2, -1.2], palette.lightDistance ?? 1)} intensity={0.3 * (palette.lightBoost ?? 1)} color="#b0c8e0" />
      <spotLight position={scalePos([2.5, 3, 2], palette.lightDistance ?? 1)} intensity={1.8 * (palette.lightBoost ?? 1)} angle={Math.PI / 7} penumbra={0.45} color="#ffe8a0" distance={9 * (palette.lightDistance ?? 1)} decay={2} />
      <group rotation={[-0.62, 0.56, 0.12]}>
        <SquarePerimeterMesh
          innerHalf={ring.innerR}
          outerHalf={ring.outerR}
          height={sliceH}
          startFraction={arc.startFraction}
          fraction={arc.lenFraction}
          color={color}
          emissiveIntensity={0.18}
          offsetY={offsetY}
          isEmpty={arc.hasData === false}
        />
      </group>
      <SceneExtras floorY={-(ringHeight / 2 + 0.42)} size={5} />
    </>
  )
}

function CubeQuestionSlicesSceneInner({ ring, arc, ringHeight, questions, selectedQuestionKey, onSelectQuestion, onHoverLabel, palette }) {
  const [hoveredKey, setHoveredKey] = useState("")
  const [lockedClickKey, setLockedClickKey] = useState("")
  const lockedTimerRef = useRef(null)
  if (!ring || !arc || !questions?.length) return null
  const n = questions.length
  const dr = (ring.outerR - ring.innerR) / n
  const color = masteryToColor(arc.mastery, palette, arc.pendingReview || 0)
  const attemptedColor = palette.high || "#4aaa72"

  const handleLockedClick = (key) => {
    if (lockedTimerRef.current) clearTimeout(lockedTimerRef.current)
    setLockedClickKey(key)
    lockedTimerRef.current = setTimeout(() => setLockedClickKey(""), 2200)
  }

  return (
    <>
      <ambientLight intensity={0.92 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([2.2, 4.4, 2.5], palette.lightDistance ?? 1)} intensity={1 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-1.2, 2.2, -1.2], palette.lightDistance ?? 1)} intensity={0.3 * (palette.lightBoost ?? 1)} color="#b0c8e0" />
      <spotLight position={scalePos([2.5, 3, 2], palette.lightDistance ?? 1)} intensity={1.8 * (palette.lightBoost ?? 1)} angle={Math.PI / 7} penumbra={0.45} color="#ffe8a0" distance={9 * (palette.lightDistance ?? 1)} decay={2} />
      <group rotation={[-0.62, 0.56, 0.12]}>
        {questions.map((question, idx) => {
          const key = question.key || `question-${idx}`
          const sliceInnerHalf = ring.innerR + idx * dr
          const sliceOuterHalf = ring.innerR + (idx + 1) * dr
          const isSelected = selectedQuestionKey === key
          const isHovered = hoveredKey === key
          const isSolved = (arc.correctQuestionKeys || []).includes(key)
          const isLocked = !isSelected && !isSolved
          const showLockedMsg = lockedClickKey === key
          const baseColor = isSolved ? attemptedColor : color
          const displayColor = isHovered ? highlightColor(baseColor, 0.35) : baseColor
          return (
            <group key={key}>
              <SquarePerimeterMesh
                innerHalf={sliceInnerHalf}
                outerHalf={sliceOuterHalf}
                height={ringHeight}
                startFraction={arc.startFraction}
                fraction={arc.lenFraction}
                color={displayColor}
                emissiveIntensity={isSolved ? 0.4 : isSelected ? 0.18 : isHovered ? 0.5 : 1.6}
                opacity={1}
                offsetY={0}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  setHoveredKey(key)
                  onHoverLabel?.(showLockedMsg ? `Q${idx + 1} — locked, opens next session` : isLocked ? `Q${idx + 1} — Locked` : isSolved ? `Q${idx + 1} — Done` : `Q${idx + 1}`)
                }}
                onPointerOut={() => { setHoveredKey(""); onHoverLabel?.("") }}
                onClick={(e) => { e.stopPropagation(); onSelectQuestion?.(key) }}
              />
            </group>
          )
        })}
      </group>
      <SceneExtras floorY={-(ringHeight / 2 + 0.42)} size={5} />
    </>
  )
}

export function CubeSceneInner({ units, totalHeight, selectedIdx, highlightedIdx, onHighlightUnit, onDrillUnit, palette }) {
  const [hovUnit, setHovUnit] = useState(null)
  const centerOffset = totalHeight / 2
  const stackGap = 0
  const allowUnitHighlight = units.length > 1
  return (
    <>
      <ambientLight intensity={0.9 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([4, 8, 4], palette.lightDistance ?? 1)} intensity={0.8 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-3, 4, -2], palette.lightDistance ?? 1)} intensity={0.25 * (palette.lightBoost ?? 1)} color="#a0b8d0" />
      <pointLight position={scalePos([1.4, 1.0, 1.4], palette.lightDistance ?? 1)} intensity={0.6 * (palette.lightBoost ?? 1)} color="#ffd580" distance={8 * (palette.lightDistance ?? 1)} decay={2} />
      {units.map((unit, i) => {
        const y = i * (unit.height + stackGap) + unit.height / 2 - centerOffset
        const isHov = hovUnit === i
        const isHigh = highlightedIdx === i
        const isSel = selectedIdx === i
        const unitColor = masteryToColor(unit.mastery, palette)
        const bandColor = isSel ? highlightColor(unitColor, 0.55) : isHigh ? highlightColor(unitColor, 0.42) : isHov ? highlightColor(unitColor, 0.25) : unitColor
        const bandEmissive = allowUnitHighlight ? (isSel ? 1.05 : isHigh ? 0.65 : isHov ? 0.42 : 0.12) : 0.12
        const unitIsEmpty = unit.hasData === false
        return (
          <group key={unit.name || i}>
            <group
              position={[0, y, 0]}
              onPointerOver={(e) => { e.stopPropagation(); setHovUnit(i) }}
              onPointerOut={() => setHovUnit(null)}
              onClick={(e) => { e.stopPropagation(); onHighlightUnit(i) }}
              onDoubleClick={(e) => { e.stopPropagation(); onDrillUnit(i) }}
            >
              <mesh>
                <boxGeometry args={[CUBE_HALF * 2, unit.height, CUBE_HALF * 2]} />
                {unitIsEmpty ? (
                  <IceMaterial />
                ) : (
                  <LuminousMaterial color={bandColor} emissiveIntensity={bandEmissive} />
                )}
              </mesh>
              {(unit.rings || []).map((ring, ringIdx) => {
                const ringColor = isSel ? highlightColor(masteryToColor(ring.mastery, palette), 0.55) : isHov ? masteryToColor(ring.mastery, palette) : unitColor
                return (
                  <SquareFrameMesh
                    key={`${unit.name || i}-${ring.code || ringIdx}`}
                    innerHalf={ring.innerR}
                    outerHalf={ring.outerR}
                    height={unit.height * 0.94}
                    color={ringColor}
                    emissiveIntensity={bandEmissive}
                    isEmpty={ring.hasData === false}
                  />
                )
              })}
            </group>
          </group>
        )
      })}
      <SceneExtras floorY={-(totalHeight / 2 + 0.7)} size={Math.ceil(totalHeight * 2.2 + 2)} />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// CANVAS 2 — concentric 3-D washer rings per LO
// ═══════════════════════════════════════════════════════════════
export function DiskSceneInner({ unit, onHighlightRing, onDrillRing, selectedRingCode = "", highlightedRingCode = "", unitHeight, diskRadius, onHoverLabel, palette }) {
  const [hovRing, setHovRing] = useState(null)
  const rings = unit.rings || []
  const allowRingHighlight = rings.length > 1

  return (
    <>
      <ambientLight intensity={0.85 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([2, 4, 2], palette.lightDistance ?? 1)} intensity={0.9 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-1, 2, -1], palette.lightDistance ?? 1)} intensity={0.3 * (palette.lightBoost ?? 1)} color="#b0c8e0" />
      <spotLight position={scalePos([2.5, 3, 2], palette.lightDistance ?? 1)} intensity={1.8 * (palette.lightBoost ?? 1)} angle={Math.PI / 7} penumbra={0.45} color="#ffe8a0" distance={9 * (palette.lightDistance ?? 1)} decay={2} />

      <group rotation={[-0.62, 0.48, 0.06]}>
        {rings.map((ring, i) => {
          const color  = masteryToColor(ring.mastery, palette)
          const isHov  = hovRing === i
          const isHigh = highlightedRingCode === ring.code
          const isSel  = selectedRingCode === ring.code
          const ringHighlightColor = allowRingHighlight ? (isSel ? highlightColor(color, 0.55) : isHigh ? highlightColor(color, 0.42) : isHov ? highlightColor(color, 0.25) : color) : color
          const labelText = [ring.displayCode || ring.code, ring.name].filter(Boolean).join(" · ")
          return (
            <group key={ring.code || i}>
              <WasherMesh
                innerR={ring.innerR} outerR={ring.outerR} height={unitHeight}
                color={ringHighlightColor} opacity={1}
                emissiveIntensity={allowRingHighlight ? (isSel ? 1.05 : isHigh ? 0.65 : isHov ? 0.42 : 0.14) : 0.14}
                isEmpty={ring.hasData === false}
                onPointerOver={e => { e.stopPropagation(); setHovRing(i); onHoverLabel?.(labelText || `Ring ${i + 1}`) }}
                onPointerOut={() => { setHovRing(null); onHoverLabel?.("") }}
                onClick={e => { e.stopPropagation(); onHighlightRing(ring) }}
                onDoubleClick={e => { e.stopPropagation(); onDrillRing(ring) }}
              />
            </group>
          )
        })}
      </group>
      <SceneExtras floorY={-(unitHeight / 2 + 0.42)} size={5} />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// CANVAS 1 — subject progress cylinder
// ═══════════════════════════════════════════════════════════════
export function CylinderSceneInner({ units, subjectName, totalMastery, totalHeight, selectedIdx, highlightedIdx, onHighlightUnit, onDrillUnit, onHoverLabel, palette }) {
  const [hovDisk, setHovDisk] = useState(null)
  const subjectDiskR = CYL_R
  const allowUnitHighlight = units.length > 1
  const centerOffset = totalHeight / 2
  const stackGap = 0

  return (
    <>
      <ambientLight intensity={0.9 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([4, 8, 4], palette.lightDistance ?? 1)} intensity={0.8 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-3, 4, -2], palette.lightDistance ?? 1)} intensity={0.25 * (palette.lightBoost ?? 1)} color="#a0b8d0" />
      <pointLight position={scalePos([1.4, 1.0, 1.4], palette.lightDistance ?? 1)} intensity={0.6 * (palette.lightBoost ?? 1)} color="#ffd580" distance={8 * (palette.lightDistance ?? 1)} decay={2} />

      {/* Stacked unit bands */}

      {units.map((unit, i) => {
        const y     = i * (unit.height + stackGap) + unit.height / 2 - centerOffset
        const isHov = hovDisk === i
        const isHigh = highlightedIdx === i
        const isSel = selectedIdx === i
        const ringSlices = (unit.rings || []).length ? unit.rings : []
        const unitColor = masteryToColor(unit.mastery, palette)
        const bandColor = isSel ? highlightColor(unitColor, 0.55) : isHigh ? highlightColor(unitColor, 0.42) : isHov ? highlightColor(unitColor, 0.25) : unitColor
        const bandEmissive = allowUnitHighlight ? (isSel ? 1.05 : isHigh ? 0.65 : isHov ? 0.42 : 0.12) : 0.12
        const unitIsEmpty = unit.hasData === false
        return (
          <group key={unit.name || i}>
            <group
              position={[0, y, 0]}
              onPointerOver={e => { e.stopPropagation(); setHovDisk(i); onHoverLabel?.(`Unit ${i + 1}${unit.name ? `: ${unit.name}` : ""}`) }}
              onPointerOut={() => { setHovDisk(null); onHoverLabel?.("") }}
              onClick={e => { e.stopPropagation(); onHighlightUnit(i) }}
              onDoubleClick={e => { e.stopPropagation(); onDrillUnit(i) }}
            >
              <mesh>
                <cylinderGeometry args={[Math.max(0.001, (ringSlices[0]?.innerR || 0) * (subjectDiskR / (unit.diskRadius || subjectDiskR))), Math.max(0.001, (ringSlices[0]?.innerR || 0) * (subjectDiskR / (unit.diskRadius || subjectDiskR))), unit.height, 96, 1, false]} />
                {unitIsEmpty ? (
                  <IceMaterial />
                ) : (
                  <LuminousMaterial color={bandColor} emissiveIntensity={bandEmissive} />
                )}
              </mesh>
              {ringSlices.map((ring, ringIdx) => {
                const radiusScale = subjectDiskR / (unit.diskRadius || subjectDiskR)
                const innerR = ring.innerR * radiusScale
                const outerR = ring.outerR * radiusScale
                // Default: match the band (uniform). Hover: reveal individual ring color. Selected: active.
                const ringColor = isSel ? highlightColor(masteryToColor(ring.mastery, palette), 0.55) : isHov ? masteryToColor(ring.mastery, palette) : unitColor
                return (
                  <WasherMesh
                    key={`${unit.name || i}-${ring.code || ringIdx}`}
                    innerR={innerR}
                    outerR={outerR}
                    height={unit.height}
                    color={ringColor}
                    opacity={1}
                    emissiveIntensity={bandEmissive}
                    isEmpty={ring.hasData === false}
                  />
                )
              })}
            </group>
          </group>
        )
      })}
      <SceneExtras floorY={-(totalHeight / 2 + 0.7)} size={Math.ceil(totalHeight * 2.2 + 2)} />
    </>
  )
}

export function TorusSceneInner({ units, selectedIdx, highlightedIdx, onHighlightUnit, onDrillUnit, palette }) {
  const [hovUnit, setHovUnit] = useState(null)
  const allowUnitHighlight = units.length > 1

  return (
    <>
      <ambientLight intensity={0.9 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([4, 8, 4], palette.lightDistance ?? 1)} intensity={0.8 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-3, 4, -2], palette.lightDistance ?? 1)} intensity={0.25 * (palette.lightBoost ?? 1)} color="#a0b8d0" />
      <pointLight position={scalePos([1.4, 1.0, 1.4], palette.lightDistance ?? 1)} intensity={0.6 * (palette.lightBoost ?? 1)} color="#ffd580" distance={8 * (palette.lightDistance ?? 1)} decay={2} />
      <group rotation={[Math.PI / 2.35, 0, 0.1]}>
        {units.map((unit, i) => {
          const start = unit.torusThetaStart || 0
          const arcLen = unit.torusThetaLen || ((Math.PI * 2) / Math.max(1, units.length))
          const mid = start + arcLen / 2
          const isHov = hovUnit === i
          const isHigh = highlightedIdx === i
          const isSel = selectedIdx === i
          const unitColor = masteryToColor(unit.mastery, palette)
          const displayColor = isSel ? highlightColor(unitColor, 0.55) : isHigh ? highlightColor(unitColor, 0.42) : isHov ? highlightColor(unitColor, 0.25) : unitColor
          const emissiveIntensity = allowUnitHighlight ? (isSel ? 1.05 : isHigh ? 0.65 : isHov ? 0.42 : 0.14) : 0.14
          return (
            <group key={unit.name || i}>
              <TorusShellSegmentMesh
                majorRadius={TORUS_MAJOR_R}
                innerTubeRadius={0}
                outerTubeRadius={TORUS_TUBE_R}
                thetaStart={start}
                thetaLen={arcLen}
                color={displayColor}
                emissiveIntensity={emissiveIntensity}
                isEmpty={unit.hasData === false}
                onPointerOver={(e) => { e.stopPropagation(); setHovUnit(i) }}
                onPointerOut={() => setHovUnit(null)}
                onClick={(e) => { e.stopPropagation(); onHighlightUnit(i) }}
                onDoubleClick={(e) => { e.stopPropagation(); onDrillUnit(i) }}
              />
            </group>
          )
        })}
      </group>
      <SceneExtras floorY={-1.7} size={7} />
    </>
  )
}

export function TorusUnitSceneInner({ unit, onHighlightRing, onDrillRing, selectedRingCode = "", highlightedRingCode = "", palette }) {
  const [hovRing, setHovRing] = useState(null)
  const rings = unit.rings || []
  const allowRingHighlight = rings.length > 1
  const unitThetaLen = unit?.torusThetaLen || (Math.PI * 2)
  const startAngle = -unitThetaLen / 2
  return (
    <>
      <ambientLight intensity={0.9 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([4, 8, 4], palette.lightDistance ?? 1)} intensity={0.8 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-3, 4, -2], palette.lightDistance ?? 1)} intensity={0.25 * (palette.lightBoost ?? 1)} color="#a0b8d0" />
      <pointLight position={scalePos([1.4, 1.0, 1.4], palette.lightDistance ?? 1)} intensity={0.6 * (palette.lightBoost ?? 1)} color="#ffd580" distance={8 * (palette.lightDistance ?? 1)} decay={2} />
      <group rotation={[Math.PI / 2.35, 0, 0.1]}>
        {rings.map((ring, i) => {
          const color = masteryToColor(ring.mastery, palette)
          const isHov = hovRing === i
          const isHigh = highlightedRingCode === ring.code
          const isSel = selectedRingCode === ring.code
          const displayColor = allowRingHighlight
            ? (isSel ? highlightColor(color, 0.55) : isHigh ? highlightColor(color, 0.42) : isHov ? highlightColor(color, 0.25) : color)
            : color
          const emissiveIntensity = allowRingHighlight ? (isSel ? 1.05 : isHigh ? 0.65 : isHov ? 0.42 : 0.14) : 0.14
          const mid = startAngle + unitThetaLen / 2
          return (
            <group key={ring.code || i}>
              <TorusShellSegmentMesh
                majorRadius={ring.torusMajorRadius || TORUS_MAJOR_R}
                innerTubeRadius={ring.torusInnerTubeRadius || 0}
                outerTubeRadius={ring.torusOuterTubeRadius || TORUS_TUBE_R}
                thetaStart={startAngle}
                thetaLen={unitThetaLen}
                color={displayColor}
                emissiveIntensity={emissiveIntensity}
                isEmpty={ring.hasData === false}
                onPointerOver={(e) => { e.stopPropagation(); setHovRing(i) }}
                onPointerOut={() => setHovRing(null)}
                onClick={(e) => { e.stopPropagation(); onDrillRing(ring) }}
                onDoubleClick={(e) => { e.stopPropagation(); onDrillRing(ring) }}
              />
            </group>
          )
        })}
      </group>
      <SceneExtras floorY={-1.7} size={7} />
    </>
  )
}

export function TorusRingSceneInner({ ring, activeArc, highlightedArcId, onHighlightArc, onDrillArc, palette }) {
  const [hovArc, setHovArc] = useState(null)
  const unitThetaLen = ring?.torusThetaLen || (Math.PI * 2)
  const startAngle = -unitThetaLen / 2
  const arcData = useMemo(() => {
    let phi = -Math.PI / 2
    return (ring.arcs || []).map((arc) => {
      const phiLen = Math.max(0.01, arc.angleFraction * Math.PI * 2)
      const phiStart = phi
      phi += phiLen
      return {
        ...arc,
        thetaStart: startAngle,
        thetaLen: unitThetaLen,
        phiStart,
        phiLen,
      }
    })
  }, [ring.arcs, startAngle, unitThetaLen])
  const allowArcHighlight = arcData.length > 1
  const majorRadius = ring.torusMajorRadius || TORUS_MAJOR_R
  const innerTubeRadius = ring.torusInnerTubeRadius || 0
  const outerTubeRadius = ring.torusOuterTubeRadius || TORUS_TUBE_R
  return (
    <>
      <ambientLight intensity={0.85 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([2, 4, 2], palette.lightDistance ?? 1)} intensity={0.9 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-1, 2, -1], palette.lightDistance ?? 1)} intensity={0.3 * (palette.lightBoost ?? 1)} color="#b0c8e0" />
      <spotLight position={scalePos([2.5, 3, 2], palette.lightDistance ?? 1)} intensity={1.8 * (palette.lightBoost ?? 1)} angle={Math.PI / 7} penumbra={0.45} color="#ffe8a0" distance={9 * (palette.lightDistance ?? 1)} decay={2} />
      <group rotation={[Math.PI / 2.35, 0, 0.1]}>
        {arcData.map((arc, i) => {
          const color = masteryToColor(arc.mastery, palette, arc.pendingReview || 0)
          const isSelected = activeArc?.questionTypeId === arc.questionTypeId
          const isHigh = highlightedArcId === arc.questionTypeId
          const isHov = hovArc === i
          const displayColor = allowArcHighlight
            ? (isSelected ? highlightColor(color, 0.55) : isHigh ? highlightColor(color, 0.42) : isHov ? highlightColor(color, 0.25) : color)
            : color
          const emissiveIntensity = allowArcHighlight ? (isSelected ? 0.95 : isHigh ? 0.65 : isHov ? 0.42 : 0.12) : 0.12
          return (
            <group key={i}>
              <TorusShellSegmentMesh
                majorRadius={majorRadius}
                innerTubeRadius={innerTubeRadius}
                outerTubeRadius={outerTubeRadius}
                thetaStart={arc.thetaStart}
                thetaLen={arc.thetaLen}
                phiStart={arc.phiStart}
                phiLen={arc.phiLen}
                color={displayColor}
                emissiveIntensity={emissiveIntensity}
                isEmpty={arc.hasData === false}
                onPointerOver={(e) => { e.stopPropagation(); setHovArc(i) }}
                onPointerOut={() => setHovArc(null)}
                onClick={(e) => { e.stopPropagation(); onDrillArc?.(arc) }}
                onDoubleClick={(e) => { e.stopPropagation(); onDrillArc?.(arc) }}
              />
            </group>
          )
        })}
      </group>
      <SceneExtras floorY={-1.7} size={7} />
    </>
  )
}

export function TorusArcFocusSceneInner({ ring, arc, palette }) {
  if (!ring || !arc) return null
  const color = masteryToColor(arc.mastery, palette, arc.pendingReview || 0)
  const majorRadius = ring.torusMajorRadius || TORUS_MAJOR_R
  const innerTubeRadius = ring.torusInnerTubeRadius || 0
  const outerTubeRadius = ring.torusOuterTubeRadius || TORUS_TUBE_R
  return (
    <>
      <ambientLight intensity={0.92 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([2.2, 4.4, 2.5], palette.lightDistance ?? 1)} intensity={1 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-1.2, 2.2, -1.2], palette.lightDistance ?? 1)} intensity={0.3 * (palette.lightBoost ?? 1)} color="#b0c8e0" />
      <spotLight position={scalePos([2.5, 3, 2], palette.lightDistance ?? 1)} intensity={1.8 * (palette.lightBoost ?? 1)} angle={Math.PI / 7} penumbra={0.45} color="#ffe8a0" distance={9 * (palette.lightDistance ?? 1)} decay={2} />
      <group rotation={[Math.PI / 2.35, 0, 0.1]}>
        <TorusShellSegmentMesh
          majorRadius={majorRadius}
          innerTubeRadius={innerTubeRadius}
          outerTubeRadius={outerTubeRadius}
          thetaStart={arc.thetaStart ?? ring?.torusThetaStart ?? -(ring?.torusThetaLen ?? Math.PI * 2) / 2}
          thetaLen={arc.thetaLen ?? ring?.torusThetaLen ?? Math.PI * 2}
          phiStart={arc.phiStart ?? arc.start ?? 0}
          phiLen={arc.phiLen ?? arc.len ?? Math.PI * 2}
          color={color}
          emissiveIntensity={0.22}
          isEmpty={arc.hasData === false}
        />
      </group>
      <SceneExtras floorY={-1.7} size={7} />
    </>
  )
}

function TorusQuestionSlicesSceneInner({ ring, arc, questions, selectedQuestionKey, onSelectQuestion, onHoverLabel, palette }) {
  const [hoveredKey, setHoveredKey] = useState("")
  const [lockedClickKey, setLockedClickKey] = useState("")
  const lockedTimerRef = useRef(null)
  if (!ring || !arc || !questions?.length) return null
  const n = questions.length
  const color = masteryToColor(arc.mastery, palette, arc.pendingReview || 0)
  const attemptedColor = palette.high || "#4aaa72"
  const majorRadius = ring.torusMajorRadius || TORUS_MAJOR_R
  const innerTubeRadius = ring.torusInnerTubeRadius || 0
  const outerTubeRadius = ring.torusOuterTubeRadius || TORUS_TUBE_R
  const dr = (outerTubeRadius - innerTubeRadius) / n
  const torusPhiStart = arc.thetaStart ?? ring?.torusThetaStart ?? (-(ring?.torusThetaLen || Math.PI * 2) / 2)
  const torusPhiLen = arc.thetaLen ?? ring?.torusThetaLen ?? Math.PI * 2
  const phiMid = torusPhiStart + torusPhiLen / 2
  const arcPhiStart = arc.phiStart ?? arc.start ?? 0
  const arcPhiLen = arc.phiLen ?? arc.len ?? Math.PI * 2

  const handleLockedClick = (key) => {
    if (lockedTimerRef.current) clearTimeout(lockedTimerRef.current)
    setLockedClickKey(key)
    lockedTimerRef.current = setTimeout(() => setLockedClickKey(""), 2200)
  }

  return (
    <>
      <ambientLight intensity={0.92 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([2.2, 4.4, 2.5], palette.lightDistance ?? 1)} intensity={1 * (palette.lightBoost ?? 1)} />
      <directionalLight position={scalePos([-1.2, 2.2, -1.2], palette.lightDistance ?? 1)} intensity={0.3 * (palette.lightBoost ?? 1)} color="#b0c8e0" />
      <spotLight position={scalePos([2.5, 3, 2], palette.lightDistance ?? 1)} intensity={1.8 * (palette.lightBoost ?? 1)} angle={Math.PI / 7} penumbra={0.45} color="#ffe8a0" distance={9 * (palette.lightDistance ?? 1)} decay={2} />
      <group rotation={[Math.PI / 2.35, 0, 0.1]}>
        {questions.map((question, idx) => {
          const key = question.key || `question-${idx}`
          const sliceInnerTube = innerTubeRadius + idx * dr
          const sliceOuterTube = innerTubeRadius + (idx + 1) * dr
          const tubeMid = (sliceInnerTube + sliceOuterTube) / 2
          const labelPos = torusPoint(majorRadius, tubeMid + 0.18, phiMid, (arcPhiStart + arcPhiLen / 2))
          const isSelected = selectedQuestionKey === key
          const isHovered = hoveredKey === key
          const isSolved = (arc.correctQuestionKeys || []).includes(key)
          const isLocked = !isSelected && !isSolved
          const showLockedMsg = lockedClickKey === key
          const baseColor = isSolved ? attemptedColor : color
          const displayColor = isHovered ? highlightColor(baseColor, 0.35) : baseColor
          return (
            <group key={key}>
              <TorusShellSegmentMesh
                majorRadius={majorRadius}
                innerTubeRadius={sliceInnerTube}
                outerTubeRadius={sliceOuterTube}
                thetaStart={torusPhiStart}
                thetaLen={torusPhiLen}
                phiStart={arcPhiStart}
                phiLen={arcPhiLen}
                color={displayColor}
                opacity={1}
                emissiveIntensity={isSolved ? 0.4 : isSelected ? 0.18 : isHovered ? 0.5 : 1.6}
                onPointerOver={(e) => {
                  e.stopPropagation()
                  setHoveredKey(key)
                  onHoverLabel?.(showLockedMsg ? `Q${idx + 1} — locked, opens next session` : isLocked ? `Q${idx + 1} — Locked` : isSolved ? `Q${idx + 1} — Done` : `Q${idx + 1}`)
                }}
                onPointerOut={() => { setHoveredKey(""); onHoverLabel?.("") }}
                onClick={(e) => { e.stopPropagation(); onSelectQuestion?.(key) }}
              />
            </group>
          )
        })}
      </group>
      <SceneExtras floorY={-1.7} size={7} />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════
export default function SubjectCylinder3D({
  units = [],
  subjectName = "",
  subjectId = "",
  asStudentId = null,
  themeName = "morning",
  mode = "default",
  mobileStage = null,
  onMobileAdvance = null,
  onProgressMutate = null,
  demoQuery = "",
  focusQuestionTypeId = "",
  tourRefs = null,
  onTourEvent = null,
  scoreEditing = false,
  shapeMode = "cylinder",
}) {
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max)
  const [isCompactViewport, setIsCompactViewport] = useState(false)
  const [selectedUnitIdx, setSelectedUnitIdx] = useState(null)
  const [selectedRingCode, setSelectedRingCode] = useState("")
  const [activeArcId, setActiveArcId] = useState("")
  const [highlightedUnitIdx, setHighlightedUnitIdx] = useState(null)
  const [highlightedRingCode, setHighlightedRingCode] = useState("")
  const [highlightedArcId, setHighlightedArcId] = useState("")
  const [practiceBusyKey, setPracticeBusyKey] = useState("")
  const [selectedChoices, setSelectedChoices] = useState({})
  const [answerFeedback, setAnswerFeedback] = useState({})
  const [practiceSaveState, setPracticeSaveState] = useState({})
  const [frStateByKey, setFrStateByKey] = useState({}) // { [key]: { mode, upload, hasExc, error, submitted } }
  const [selectedQuestionKey, setSelectedQuestionKey] = useState("")
  const [sceneVersion, setSceneVersion] = useState(0)
  const [showSubjectCard, setShowSubjectCard] = useState(true)
  const [showUnitCard, setShowUnitCard] = useState(true)
  const [showLoCard, setShowLoCard] = useState(true)
  const [questionPanelPos, setQuestionPanelPos] = useState({ x: 18, y: 18 })
  const [localProgressOverrides, setLocalProgressOverrides] = useState({})
  const [scoreOverrides, setScoreOverrides] = useState({})
  const [displayMobileStage, setDisplayMobileStage] = useState(mobileStage || null)
  const [mobileStageMotion, setMobileStageMotion] = useState("idle")
  const [mobileStageDirection, setMobileStageDirection] = useState(1)
  const [hovLabelSubject, setHovLabelSubject] = useState("")
  const [hovLabelUnit, setHovLabelUnit] = useState("")
  const [hovLabelLo, setHovLabelLo] = useState("")
  const [hovLabelQt, setHovLabelQt] = useState("")
  const [hovLabelQ, setHovLabelQ] = useState("")
  const readOnly = mode === "display"
  const palette = VISUAL_THEME_PALETTES[themeName] || VISUAL_THEME_PALETTES.morning
  const canvasBg = CANVAS_BG_MAP[themeName] || CANVAS_BG_MAP.night
  const mobileTapRef = useRef({ key: "", at: 0 })
  const lastDrillRef = useRef({ key: "", at: 0 })
  const mobileStageTimerRef = useRef(null)
  const mobileStageIdleTimerRef = useRef(null)

  const containerRef = useRef(null)
  const div1Ref      = useRef(null)
  const div2Ref      = useRef(null)
  const div3Ref      = useRef(null)
  const div4Ref      = useRef(null)
  const div5Ref      = useRef(null)
  const excalidrawViewportRef = useRef(null)
  const excalidrawApiRef = useRef(null)
  const questionPanelDragRef = useRef(null)
  const mergeRefs = (internalRef, externalRef = null) => (node) => {
    if (internalRef) internalRef.current = node
    if (!externalRef) return
    if (typeof externalRef === "function") externalRef(node)
    else externalRef.current = node
  }

  const sceneScale = DISPLAY_CYLINDER_HEIGHT / TOTAL_CYLINDER_HEIGHT
  const isCube = shapeMode === "cube"
  const cubeSideLength = CUBE_HALF * 2
  const cubeUnitCount = Math.max(1, units.length || 1)
  const cylinderGapTotal = 0
  const cylinderUnitHeight = (units.length ? TOTAL_CYLINDER_HEIGHT / units.length : TOTAL_CYLINDER_HEIGHT) * sceneScale
  const cubeUnitHeight = cubeSideLength / cubeUnitCount
  const unitHeight = isCube ? cubeUnitHeight : cylinderUnitHeight
  const secondaryHeight = unitHeight * SECONDARY_HEIGHT_SCALE
  const mergedUnits = useMemo(() => {
    return (units || []).map((unit) => {
      const rings = (unit.rings || []).map((ring) => {
        const arcs = (ring.arcs || []).map((arc) => {
          const po = localProgressOverrides[arc.questionTypeId]
          const total = Number(arc.total || arc.questions?.length || 0)
          const correctQuestionKeys = po?.correctQuestionKeys || arc.correctQuestionKeys || []
          const attemptedQuestionKeys = [...new Set([
            ...(po?.attemptedQuestionKeys || []),
            ...(arc.attemptedQuestionKeys || []),
            ...correctQuestionKeys,
          ])]
          const attempted = Math.min(attemptedQuestionKeys.length, total)
          const isLocked = po?.lockedUntil ? po.lockedUntil > Date.now() : arc.isLocked
          // In practice mode, one completed question should visually complete the QT.
          const mastery = attemptedQuestionKeys.length > 0
            ? 1
            : (typeof po?.masteryScore === "number" ? po.masteryScore : arc.mastery)
          const hasData = arc.hasData !== false && (total > 0 || !!arc.questionTypeId)
          arc = { ...arc, correctQuestionKeys, attempted, opacity: mastery, mastery, isLocked, attemptedQuestionKeys, hasData }
          // score editor override at arc level — scoped to ring+questionType so
          // multi-tagged question types don't bleed across unrelated rings
          const aKey = arc.questionTypeId && ring.code ? `a:${ring.code}:${arc.questionTypeId}` : null
          if (aKey && scoreOverrides[aKey] != null) arc = { ...arc, mastery: scoreOverrides[aKey], opacity: scoreOverrides[aKey] }
          return arc
        })
        // ring mastery: explicit override, else average only arcs that have data
        const dataArcs = arcs.filter(a => a.hasData)
        const arcAvg = dataArcs.length
          ? dataArcs.reduce((s, a) => s + a.mastery, 0) / dataArcs.length
          : ring.mastery
        const rKey = `r:${ring.code}`
        const ringMastery = scoreOverrides[rKey] != null ? scoreOverrides[rKey] : arcAvg
        const ringHasData = dataArcs.length > 0
        return { ...ring, mastery: ringMastery, hasData: ringHasData, arcs }
      })
      // unit mastery: explicit override, else average only rings that have data
      const dataRings = rings.filter(r => r.hasData)
      const ringAvg = dataRings.length
        ? dataRings.reduce((s, r) => s + r.mastery, 0) / dataRings.length
        : (rings.length ? 0 : unit.mastery)
      const uKey = `u:${unit.name}`
      const unitMastery = scoreOverrides[uKey] != null ? scoreOverrides[uKey] : ringAvg
      return { ...unit, mastery: unitMastery, hasData: dataRings.length > 0, rings }
    })
  }, [units, localProgressOverrides, scoreOverrides])
  const dataUnits = mergedUnits.filter(u => u.hasData)
  const totalMastery = dataUnits.length ? dataUnits.reduce((s, u) => s + u.mastery, 0) / dataUnits.length : 0
  const normalizedUnits = useMemo(() => {
    const diskRadius = shapeMode === "cube" ? CUBE_HALF * 0.86 : CYL_R * 0.68
    const unitCount = Math.max(1, mergedUnits.length || 1)
    return mergedUnits.map((unit, unitIdx) => {
      const ringCount = Math.max(1, unit.rings?.length || 0)
      const torusThetaLen = (Math.PI * 2) / unitCount
      const torusThetaStart = unitIdx * torusThetaLen
      const rings = (unit.rings || []).map((ring, idx) => {
        const outerIndex = ringCount - idx
        const innerR = ((outerIndex - 1) * diskRadius) / ringCount
        const outerR = (outerIndex * diskRadius) / ringCount
        const innerTubeRadius = ((outerIndex - 1) * TORUS_TUBE_R) / ringCount
        const outerTubeRadius = (outerIndex * TORUS_TUBE_R) / ringCount
        return {
          ...ring,
          innerR,
          outerR,
          torusMajorRadius: TORUS_MAJOR_R,
          torusInnerTubeRadius: innerTubeRadius,
          torusOuterTubeRadius: outerTubeRadius,
          torusThetaLen,
          torusThetaStart,
        }
      })
      return {
        ...unit,
        height: unitHeight,
        diskRadius,
        torusThetaLen,
        torusThetaStart,
        rings,
      }
    })
  }, [mergedUnits, unitHeight, shapeMode])
  const totalHeight = isCube
    ? cubeSideLength
    : Math.max(1, normalizedUnits.length * unitHeight + cylinderGapTotal)
  const isTorus = shapeMode === "torus"
  const shapeLabel = isCube ? "cube" : isTorus ? "torus" : "cylinder"
  // Shape-aware vocabulary so UI text matches what the student sees in 3D
  const st = {
    unit:      isCube ? "face"     : isTorus ? "segment" : "disk",
    units:     isCube ? "faces"    : isTorus ? "segments": "disks",
    lo:        isCube ? "slice"    : isTorus ? "band"    : "ring",
    los:       isCube ? "slices"   : isTorus ? "bands"   : "rings",
    qt:        isCube ? "segment"  : "arc",
    qts:       isCube ? "segments" : "arcs",
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
  const selectedUnit = selectedUnitIdx !== null ? normalizedUnits[selectedUnitIdx] : null
  const selectedRing = selectedUnit?.rings?.find((ring) => ring.code === selectedRingCode) || null
  const selectedRingArcData = useMemo(() => {
    if (!selectedRing?.arcs?.length) return []
    let angle = -Math.PI / 2
    let fraction = 0
    return selectedRing.arcs.map((arc) => {
      const start = angle
      const len = Math.max(0.01, arc.angleFraction * Math.PI * 2)
      angle += len
      const startFraction = fraction
      const lenFraction = Math.max(0.01, arc.angleFraction)
      fraction += lenFraction
      return { ...arc, start, len, startFraction, lenFraction }
    })
  }, [selectedRing])
  const activeArc = selectedRingArcData.find((arc) => arc.questionTypeId === activeArcId) || null
  const activeQuestionPool = useMemo(() => getQuestionPoolForArc(activeArc), [activeArc])
  const selectedPracticeQuestion = useMemo(() => {
    if (!selectedQuestionKey) return null
    return (
      activeQuestionPool.find((q) => q.key === selectedQuestionKey) ||
      (activeArc?.questions || []).find((q) => q.key === selectedQuestionKey) ||
      null
    )
  }, [activeQuestionPool, activeArc, selectedQuestionKey])
  const selectedQuestionIsLocked = !!selectedPracticeQuestion && !activeQuestionPool.some((q) => q.key === selectedPracticeQuestion.key)
  const activeQuestionList = selectedPracticeQuestion ? [selectedPracticeQuestion] : []
  const learningObjectiveCount = selectedUnit?.rings?.length || 0
  const questionTypeCount = selectedRing?.arcs?.length || 0
  const questionCount = activeArc?.questions?.length || 0
  const selectedUnitName = selectedUnit?.name || "currently selected unit"
  const selectedLearningObjectiveName = selectedRing?.name || selectedRing?.displayCode || selectedRing?.code || "this learning objective"
  const selectedQuestionTypeName = activeArc?.type || "this question type"
  const mobileUnit = selectedUnit || null
  const mobileRing = selectedRing || null
  const mobileRingArcData = useMemo(() => {
    if (!mobileRing?.arcs?.length) return []
    let angle = -Math.PI / 2
    let fraction = 0
    return mobileRing.arcs.map((arc) => {
      const start = angle
      const len = Math.max(0.01, arc.angleFraction * Math.PI * 2)
      angle += len
      const startFraction = fraction
      const lenFraction = Math.max(0.01, arc.angleFraction)
      fraction += lenFraction
      return { ...arc, start, len, startFraction, lenFraction }
    })
  }, [mobileRing])
  const mobileArc = activeArc || null
  const mobileQuestionList = activeQuestionList

  const handleHighlightUnit = (i) => {
    if (mobileStage) { handleSelectUnit(i); return }
    // Fallback double-click detection: R3F's onDoubleClick can miss when the
    // two clicks land on different sub-meshes of the same group (band vs
    // washer). If a second click on the same unit lands within 360ms, drill.
    const ref = mobileTapRef.current
    const now = Date.now()
    if (ref.key === `unit:${i}` && now - ref.at < 360) {
      mobileTapRef.current = { key: "", at: 0 }
      handleSelectUnit(i)
      return
    }
    mobileTapRef.current = { key: `unit:${i}`, at: now }
    setHighlightedUnitIdx((prev) => (prev === i ? null : i))
  }
  const handleSelectUnit = (i) => {
    // Dedup guard (desktop only): when click-timing already fired a drill,
    // R3F's onDoubleClick can arrive right after and toggle selection back off.
    // Skip in mobileStage mode so the 360ms double-tap window can trigger the
    // stage advance.
    const drillKey = `unit:${i}`
    const nowTs = Date.now()
    if (!mobileStage && lastDrillRef.current.key === drillKey && nowTs - lastDrillRef.current.at < 180) return
    lastDrillRef.current = { key: drillKey, at: nowTs }
    // eslint-disable-next-line no-console
    console.log("[cylinder] select unit", {
      i,
      unit: normalizedUnits[i]?.name,
      ringCount: normalizedUnits[i]?.rings?.length || 0,
      rings: (normalizedUnits[i]?.rings || []).map((r) => ({
        code: r.code,
        name: r.name,
        realArcs: (r.arcs || []).filter((a) => a.type !== "No data yet").length,
        totalArcs: (r.arcs || []).length,
        sampleArc: r.arcs?.[0]?.type,
      })),
    })
    const shouldAdvance =
      mobileStage === "subject" &&
      mobileTapRef.current.key === `unit:${i}` &&
      Date.now() - mobileTapRef.current.at < 360
    mobileTapRef.current = { key: `unit:${i}`, at: Date.now() }
    if (mobileStage) {
      setSelectedUnitIdx(i)
      setSelectedRingCode("")
      setActiveArcId("")
      onTourEvent?.("overview-unit-selected")
    } else if (selectedUnitIdx === i) {
      setSelectedUnitIdx(null)
      setSelectedRingCode("")
      setActiveArcId("")
    } else {
      setSelectedUnitIdx(i)
      setSelectedRingCode("")
      setActiveArcId("")
      onTourEvent?.("overview-unit-selected")
    }
    if (shouldAdvance) onMobileAdvance?.("unit")
  }
  const handleHighlightRing = (ring) => {
    if (mobileStage) { handleSelectRing(ring); return }
    const ringKey = ring?.code || ring?.name || "ring"
    const ref = mobileTapRef.current
    const now = Date.now()
    if (ref.key === `ring:${ringKey}` && now - ref.at < 360) {
      mobileTapRef.current = { key: "", at: 0 }
      handleSelectRing(ring)
      return
    }
    mobileTapRef.current = { key: `ring:${ringKey}`, at: now }
    setHighlightedRingCode((prev) => (prev === ring.code ? "" : ring.code))
  }
  const handleSelectRing = (ring) => {
    const ringKey = ring?.code || ring?.name || "ring"
    const drillKey = `ring:${ringKey}`
    const nowTs = Date.now()
    if (!mobileStage && lastDrillRef.current.key === drillKey && nowTs - lastDrillRef.current.at < 180) return
    lastDrillRef.current = { key: drillKey, at: nowTs }
    // eslint-disable-next-line no-console
    console.log("[cylinder] select ring", {
      code: ring?.code,
      name: ring?.name,
      totalArcs: (ring?.arcs || []).length,
      realArcs: (ring?.arcs || []).filter((a) => a.type !== "No data yet").length,
      arcTypes: (ring?.arcs || []).map((a) => a.type),
    })
    const shouldAdvance =
      mobileStage === "unit" &&
      mobileTapRef.current.key === `ring:${ringKey}` &&
      Date.now() - mobileTapRef.current.at < 360
    mobileTapRef.current = { key: `ring:${ringKey}`, at: Date.now() }
    setSelectedRingCode((prev) => {
      const next = mobileStage ? ring.code : (prev === ring.code ? "" : ring.code)
      if (!next) setActiveArcId("")
      if (next) onTourEvent?.("overview-ring-selected")
      return next
    })
    if (shouldAdvance) onMobileAdvance?.("lo")
  }
  const handleHighlightArc = (arc) => {
    if (mobileStage) { handleSelectArc(arc); return }
    const arcKey = arc?.questionTypeId || arc?.type || "arc"
    const ref = mobileTapRef.current
    const now = Date.now()
    if (ref.key === `arc:${arcKey}` && now - ref.at < 360) {
      mobileTapRef.current = { key: "", at: 0 }
      handleSelectArc(arc)
      return
    }
    mobileTapRef.current = { key: `arc:${arcKey}`, at: now }
    setHighlightedArcId((prev) => (prev === arc.questionTypeId ? "" : arc.questionTypeId))
  }
  const handleSelectArc = (arc) => {
    const arcKey = arc?.questionTypeId || arc?.type || "arc"
    const drillKey = `arc:${arcKey}`
    const nowTs = Date.now()
    if (!mobileStage && lastDrillRef.current.key === drillKey && nowTs - lastDrillRef.current.at < 180) return
    lastDrillRef.current = { key: drillKey, at: nowTs }
    const shouldAdvance =
      mobileStage === "lo" &&
      mobileTapRef.current.key === `arc:${arcKey}` &&
      Date.now() - mobileTapRef.current.at < 360
    mobileTapRef.current = { key: `arc:${arcKey}`, at: Date.now() }
    setActiveArcId((prev) => {
      const next = mobileStage ? arc.questionTypeId : (prev === arc.questionTypeId ? "" : arc.questionTypeId)
      if (next) onTourEvent?.("overview-arc-selected")
      return next
    })
    if (shouldAdvance) onMobileAdvance?.("questionType")
  }

  useEffect(() => {
    if (!mobileStage) {
      setDisplayMobileStage(null)
      setMobileStageMotion("idle")
      return
    }
    if (!displayMobileStage) {
      setDisplayMobileStage(mobileStage)
      setMobileStageMotion("idle")
      return
    }
    if (mobileStage === displayMobileStage) return
    const order = { subject: 0, unit: 1, lo: 2, questionType: 3, question: 4 }
    const direction = (order[mobileStage] ?? 0) >= (order[displayMobileStage] ?? 0) ? 1 : -1
    setMobileStageDirection(direction)
    setMobileStageMotion("exit")
    clearTimeout(mobileStageTimerRef.current)
    clearTimeout(mobileStageIdleTimerRef.current)
    mobileStageTimerRef.current = setTimeout(() => {
      setDisplayMobileStage(mobileStage)
      setMobileStageMotion("enter")
      mobileStageIdleTimerRef.current = setTimeout(() => {
        setMobileStageMotion("idle")
      }, 220)
    }, 190)
  }, [mobileStage, displayMobileStage])

  useEffect(() => {
    return () => {
      clearTimeout(mobileStageTimerRef.current)
      clearTimeout(mobileStageIdleTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (selectedUnitIdx !== null && !normalizedUnits[selectedUnitIdx]) {
      setSelectedUnitIdx(null)
      setSelectedRingCode("")
      setActiveArcId("")
    }
  }, [normalizedUnits, selectedUnitIdx])

  useEffect(() => {
    if (selectedRingCode && !selectedRing) {
      setSelectedRingCode("")
      setActiveArcId("")
    }
  }, [selectedRingCode, selectedRing])

  useEffect(() => {
    if (activeArcId && !activeArc) {
      setActiveArcId("")
    }
  }, [activeArcId, activeArc])

  useEffect(() => {
    if (selectedRingCode && div3Ref.current) {
      setTimeout(() => div3Ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80)
    }
  }, [selectedRingCode])

  useEffect(() => {
    if (activeArcId && div4Ref.current) {
      setTimeout(() => div4Ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 80)
    }
  }, [activeArcId])

  useEffect(() => {
    if (!activeQuestionPool.length) {
      setSelectedQuestionKey("")
      return
    }
    if (activeQuestionPool.some((question) => question.key === selectedQuestionKey)) return
    const nextQuestion = pickRandomQuestionFromPool(activeQuestionPool)
    setSelectedQuestionKey(nextQuestion?.key || "")
  }, [activeQuestionPool, selectedQuestionKey])

  useEffect(() => {
    if (mode !== "lab" || !focusQuestionTypeId || !normalizedUnits.length) return
    for (let unitIdx = 0; unitIdx < normalizedUnits.length; unitIdx += 1) {
      const ring = (normalizedUnits[unitIdx]?.rings || []).find((candidate) =>
        (candidate.arcs || []).some((arc) => arc.questionTypeId === focusQuestionTypeId)
      )
      if (ring) {
        setSelectedUnitIdx(unitIdx)
        setSelectedRingCode(ring.code || "")
        setActiveArcId(focusQuestionTypeId)
        return
      }
    }
  }, [focusQuestionTypeId, mode, normalizedUnits])

  useEffect(() => {
    setQuestionPanelPos({ x: 18, y: 18 })
  }, [selectedQuestionKey, activeArcId])

  useEffect(() => {
    setLocalProgressOverrides({})
  }, [subjectId, asStudentId])

  useEffect(() => {
    if (typeof window === "undefined") return undefined
    const media = window.matchMedia("(max-width: 900px)")
    const sync = () => setIsCompactViewport(media.matches)
    sync()
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync)
      return () => media.removeEventListener("change", sync)
    }
    media.addListener(sync)
    return () => media.removeListener(sync)
  }, [])

  useEffect(() => {
    function handlePointerMove(event) {
      if (!questionPanelDragRef.current || !excalidrawViewportRef.current) return
      const viewportRect = excalidrawViewportRef.current.getBoundingClientRect()
      const { width, height, offsetX, offsetY } = questionPanelDragRef.current
      const nextX = clamp(event.clientX - viewportRect.left - offsetX, 12, Math.max(12, viewportRect.width - width - 12))
      const nextY = clamp(event.clientY - viewportRect.top - offsetY, 12, Math.max(12, viewportRect.height - height - 12))
      setQuestionPanelPos({ x: nextX, y: nextY })
    }

    function stopDragging() {
      questionPanelDragRef.current = null
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", stopDragging)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", stopDragging)
    }
  }, [])

  async function savePracticeWork(question) {
    if (!question?.key || !activeArc?.questionTypeId || !subjectId) return
    if (asStudentId) return
    const api = excalidrawApiRef.current
    if (!api) return
    const elements = api.getSceneElements?.() || []
    if (!elements.length) {
      setPracticeSaveState((prev) => ({ ...prev, [question.key]: "empty" }))
      return
    }
    setPracticeSaveState((prev) => ({ ...prev, [question.key]: "saving" }))
    try {
      const mod = await import("@excalidraw/excalidraw")
      if (!mod?.exportToBlob) throw new Error("Excalidraw export unavailable")
      const blob = await mod.exportToBlob({
        elements,
        appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff" },
        files: api.getFiles?.() || {},
        mimeType: "image/png",
      })
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(String(reader.result).split(",")[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      const res = await fetch("/api/student/save-scratch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionKey: question.key,
          imageBase64: base64,
          subjectId,
          questionTypeId: activeArc.questionTypeId,
          mode: "practice",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) throw new Error(data?.error || "Save failed")
      setPracticeSaveState((prev) => ({ ...prev, [question.key]: "saved" }))
    } catch {
      setPracticeSaveState((prev) => ({ ...prev, [question.key]: "error" }))
    }
  }

  function updateFrState(key, patch) {
    setFrStateByKey((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }))
  }

  async function handleFrUploadChoice(key, file) {
    if (!file) { updateFrState(key, { upload: null }); return }
    const ok = ["image/jpeg", "image/png", "application/pdf"].includes(file.type)
    if (!ok) { updateFrState(key, { error: "Only JPEG, PNG, or PDF files allowed." }); return }
    if (file.size > 22 * 1024 * 1024) { updateFrState(key, { error: "File too large (max 22 MB)." }); return }
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onloadend = () => resolve(String(r.result).split(",")[1] || "")
      r.onerror = reject
      r.readAsDataURL(file)
    })
    updateFrState(key, { upload: { file, base64, mime: file.type }, error: "" })
  }

  async function submitFreeResponsePractice(question) {
    const key = question?.key
    if (!key || !activeArc?.questionTypeId || practiceBusyKey) return
    const state = frStateByKey[key] || { mode: "excalidraw" }
    const mode = state.mode || "excalidraw"
    updateFrState(key, { error: "", submitting: true })
    try {
      const body = {
        questionKey: question.qhash || question.key,
        questionTypeId: activeArc.questionTypeId,
        subjectId,
        mode: "practice",
        workType: mode,
      }
      if (mode === "excalidraw") {
        const api = excalidrawApiRef.current
        const elements = api?.getSceneElements?.() || []
        if (!elements.length) {
          updateFrState(key, { error: "Draw your work in the workspace, or switch to upload.", submitting: false })
          return
        }
        const mod = await import("@excalidraw/excalidraw")
        const blob = await mod.exportToBlob({
          elements,
          appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff" },
          files: api.getFiles?.() || {},
          mimeType: "image/png",
        })
        const png = await new Promise((resolve, reject) => {
          const r = new FileReader()
          r.onloadend = () => resolve(String(r.result).split(",")[1] || "")
          r.onerror = reject
          r.readAsDataURL(blob)
        })
        body.excalidrawJson = { elements, appState: { viewBackgroundColor: "#ffffff" } }
        body.excalidrawPngBase64 = png
      } else {
        if (!state.upload?.base64) {
          updateFrState(key, { error: "Choose a file to upload, or switch to drawing.", submitting: false })
          return
        }
        body.uploadBase64 = state.upload.base64
        body.uploadMime = state.upload.mime
      }
      const res = await fetch("/api/student/submit-freeresponse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) throw new Error(data?.error || "Submission failed")
      updateFrState(key, { submitted: true, submitting: false })
      setAnswerFeedback((prev) => ({
        ...prev,
        [key]: { tone: "neutral", text: "Submitted for review. Amber in the ring until graded." },
      }))
      setLocalProgressOverrides((prev) => {
        const existing = prev[activeArc.questionTypeId] || {}
        const attemptedQuestionKeys = [...new Set([...(existing.attemptedQuestionKeys || []), key])]
        return {
          ...prev,
          [activeArc.questionTypeId]: {
            ...existing,
            attemptedQuestionKeys,
            pendingReviewCount: Number(existing.pendingReviewCount || 0) + 1,
          },
        }
      })
      await onProgressMutate?.()
      setSceneVersion((prev) => prev + 1)
    } catch (err) {
      updateFrState(key, { error: err?.message || "Submission failed", submitting: false })
    }
  }

  async function markQuestionAttempted(question, result = "correct") {
    if (!activeArc?.questionTypeId || !question?.key || practiceBusyKey) return
    setPracticeBusyKey(question.key)
    try {
      const requestUrl = `/api/student/progress-graph-attempt${demoQuery || ""}`
      const res = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          as: asStudentId || null,
          questionTypeId: activeArc.questionTypeId,
          questionKey: question.key,
          result,
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setLocalProgressOverrides((prev) => {
        const existing = prev[activeArc.questionTypeId] || {}
        const attemptedQuestionKeys = [...new Set([...(existing.attemptedQuestionKeys || []), question.key])]
        const newCorrectKeys = result === "correct" ? (data.correctQuestionKeys || []) : (existing.correctQuestionKeys || [])
        const total = Number(activeArc?.total || 0)
        const allDone = total > 0 && newCorrectKeys.length >= total
        return {
          ...prev,
          [activeArc.questionTypeId]: {
            correctQuestionKeys: newCorrectKeys,
            masteryScore: typeof data.masteryScore === "number" ? data.masteryScore : undefined,
            attemptedQuestionKeys,
            lockedUntil: allDone ? Number.MAX_SAFE_INTEGER : null,
          },
        }
      })
      await onProgressMutate?.()
      setSceneVersion((prev) => prev + 1)
      setAnswerFeedback((prev) => ({
        ...prev,
        [question.key]: {
          tone: result === "correct" ? "success" : "error",
          text: result === "correct"
            ? "Correct."
            : "Not quite — review the answer and explanation below."
        }
      }))
    } catch (err) {
      console.error("Failed to mark attempted question:", err)
      setAnswerFeedback((prev) => ({
        ...prev,
        [question.key]: { tone: "error", text: err?.message || "Could not save progress." }
      }))
    } finally {
      setPracticeBusyKey("")
    }
  }

  async function submitQuestionAnswer(question) {
    if (!question?.key || practiceBusyKey) return
    const selectedIndex = selectedChoices[question.key]
    const options = Array.isArray(question.options) ? question.options : []
    const rawCorrectOption = String(question.correctOption || question.answer || "").trim()
    const resolvedCorrectIndex = resolveOptionIndexFromQuestion(question)
    const derivedCorrectIndex = Number.isInteger(question.correctIndex)
      ? question.correctIndex
      : resolvedCorrectIndex
    console.log("[practice][submitQuestionAnswer]", {
      questionTypeId: activeArc?.questionTypeId || "",
      questionKey: question.key,
      selectedIndex,
      resolvedCorrectIndex,
      originalCorrectIndex: question.correctIndex,
      rawCorrectOption,
      answer: question.answer || "",
      options,
      question,
    })
    if (!Number.isInteger(selectedIndex)) {
      setAnswerFeedback((prev) => ({
        ...prev,
        [question.key]: { tone: "neutral", text: "Pick an option first." }
      }))
      return
    }
    if (!Number.isInteger(resolvedCorrectIndex)) {
      console.error("[practice][question-not-ready]", {
        questionTypeId: activeArc?.questionTypeId || "",
        questionKey: question.key,
        originalCorrectIndex: question.correctIndex,
        derivedCorrectIndex,
        rawCorrectOption,
        answer: question.answer || "",
        options,
        question,
      })
      setAnswerFeedback((prev) => ({
        ...prev,
        [question.key]: { tone: "error", text: "This question is not ready to be checked yet." }
      }))
      return
    }
    if (selectedIndex !== resolvedCorrectIndex) {
      await markQuestionAttempted(question, "wrong")
      return
    }
    await markQuestionAttempted(question, "correct")
  }

  function renderQuestionPanelContent({ floating = false } = {}) {
    return (
      <div style={{
        height: "100%",
        overflowY: "auto",
        padding: floating ? 0 : 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: "var(--surface)",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        {selectedPracticeQuestion
          ? renderSingleQuestionCard(selectedPracticeQuestion)
          : (
            <div style={{
              fontSize: 12,
              color: "var(--text-dim)",
              lineHeight: 1.6,
              border: "1px solid var(--border)",
              background: "var(--surface2)",
              borderRadius: 12,
              padding: "12px 14px",
            }}>
              {activeArc?.total > 0 && activeArc?.attempted >= activeArc?.total
                ? "All questions in this type have been seen. A previously seen one will be chosen the next time you open it."
                : "No stored questions found for this question type yet."}
            </div>
          )
        }
      </div>
    )
  }

  function renderSingleQuestionCard(question) {
    if (!question) return null
    const attempted = getAttemptedQuestionKeysForArc(activeArc).includes(question.key)
    const feedback = answerFeedback[question.key]
    const absoluteIndex = Math.max(0, (activeArc?.questions || []).findIndex((item) => item.key === question.key))
    const isThisQuestionLocked = selectedQuestionIsLocked || activeArc?.isLocked
    const isFR = question.questionFormat === "free_response"
    const frState = frStateByKey[question.key] || { mode: "excalidraw" }
    const frSubmitted = !!frState.submitted || attempted
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: "’DM Sans’, sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)" }}>
              Question {absoluteIndex + 1}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
              {activeArc?.type || "Question type"}
            </div>
          </div>
          <div style={{ fontSize: 11, color: attempted ? "var(--green)" : isThisQuestionLocked ? "var(--gold)" : "var(--text-dim)" }}>
            {attempted ? "Completed" : isThisQuestionLocked ? "Locked" : "Unlocked now"}
          </div>
        </div>
        {isThisQuestionLocked && (
          <div style={{
            border: "1px solid color-mix(in srgb, var(--gold) 36%, var(--border))",
            background: "color-mix(in srgb, var(--gold) 12%, var(--surface))",
            color: "var(--gold)",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: 1.5,
          }}>
            {activeArc?.isLocked
              ? (activeArc.lockReason === "session"
                ? `Locked for this session. Questions introduced on ${activeArc.dateIntroduced || "this session"} unlock after a later class day.`
                : activeArc.lockReason === "wrong_today"
                  ? "Locked until tomorrow because today’s question was answered incorrectly."
                  : "All questions in this type are complete.")
              : "This question is locked — only one question per type is active at a time. Complete the active one first."}
          </div>
        )}
        {question.isStemChild && Array.isArray(question.stemHeader) && question.stemHeader.length > 0 && (
          <div style={{
            background: "color-mix(in srgb, var(--gold) 10%, var(--surface))",
            borderLeft: "3px solid var(--gold)",
            padding: "8px 12px",
            borderRadius: 8,
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", color: "var(--gold)", marginBottom: 6 }}>STEM</div>
            {question.stemHeader.map((item, i) => {
              if (item?.type === "image" && item?.url) {
                return <img key={`pr-stem-img-${i}`} src={item.url} alt={item.alt || "Stem"} style={{ width: "100%", maxHeight: 140, objectFit: "contain", borderRadius: 6, marginBottom: 6 }} />
              }
              if (item?.type === "text" && item?.value) {
                return <div key={`pr-stem-txt-${i}`} style={{ fontSize: 12, color: "#000", marginBottom: 4 }}><MathText text={item.value} /></div>
              }
              return null
            })}
          </div>
        )}
        {Array.isArray(question.content) && question.content.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {question.content.map((item, itemIdx) => {
              if (item?.type === "image" && item?.url) {
                return (
                  <img
                    key={`qc-img-${itemIdx}`}
                    src={item.url}
                    alt={item.alt || ""}
                    style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 10, border: "1px solid var(--border)" }}
                  />
                )
              }
              if (item?.type === "text" && item?.value) {
                return (
                  <div key={`qc-txt-${itemIdx}`} style={{ fontSize: 13, color: "#000", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                    <MathText text={item.value} block />
                  </div>
                )
              }
              return null
            })}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "#000", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
              <MathText text={question.question || "No stored question text."} block />
            </div>
            {question.imageUrl ? (
              <img src={question.imageUrl} alt="" style={{ width: "100%", maxHeight: 180, objectFit: "contain", borderRadius: 10, border: "1px solid var(--border)" }} />
            ) : null}
          </>
        )}
        {isFR ? (
          <PracticeFrBlock
            frState={frState}
            disabled={frSubmitted || isThisQuestionLocked}
            onSetMode={(mode) => updateFrState(question.key, { mode })}
            onUploadFile={(file) => handleFrUploadChoice(question.key, file)}
          />
        ) : question.options?.length ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(() => {
              const correctIdx = resolveOptionIndexFromQuestion(question)
              return question.options.map((option, optionIndex) => {
                const isSelected = selectedChoices[question.key] === optionIndex
                const isCorrectChoice = attempted && correctIdx != null && optionIndex === correctIdx
                const isWrongChoice = attempted && isSelected && correctIdx != null && optionIndex !== correctIdx
                let borderColor, bg, badgeBg
                if (isCorrectChoice) {
                  borderColor = "#3a8f5b"
                  bg = "color-mix(in srgb, #3a8f5b 22%, var(--surface))"
                  badgeBg = "color-mix(in srgb, #3a8f5b 34%, transparent)"
                } else if (isWrongChoice) {
                  borderColor = "#b84949"
                  bg = "color-mix(in srgb, #b84949 22%, var(--surface))"
                  badgeBg = "color-mix(in srgb, #b84949 34%, transparent)"
                } else if (isSelected) {
                  borderColor = "color-mix(in srgb, var(--blue) 62%, var(--border))"
                  bg = "color-mix(in srgb, var(--blue) 10%, var(--surface))"
                  badgeBg = "color-mix(in srgb, var(--blue) 18%, transparent)"
                } else {
                  borderColor = "var(--border)"
                  bg = "var(--surface)"
                  badgeBg = "color-mix(in srgb, var(--border) 40%, transparent)"
                }
                return (
                  <button
                    key={`${question.key}-${optionIndex}`}
                    type="button"
                    onClick={() => {
                      if (attempted || isThisQuestionLocked) return
                      setSelectedChoices((prev) => ({ ...prev, [question.key]: optionIndex }))
                      setAnswerFeedback((prev) => ({ ...prev, [question.key]: null }))
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      borderRadius: 10,
                      border: `1px solid ${borderColor}`,
                      background: bg,
                      padding: "10px 12px",
                      color: isThisQuestionLocked ? "var(--text-dim)" : "#000",
                      fontSize: 12,
                      cursor: attempted || isThisQuestionLocked ? "default" : "pointer",
                      opacity: isThisQuestionLocked ? 0.55 : 1,
                    }}
                  >
                    <span style={{
                      display: "inline-flex",
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      alignItems: "center",
                      justifyContent: "center",
                      background: badgeBg,
                      fontSize: 11,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {["A", "B", "C", "D"][optionIndex] || optionIndex + 1}
                    </span>
                    <span style={{ flex: 1 }}>
                      <MathText text={option} />
                    </span>
                  </button>
                )
              })
            })()}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
            Answer choices are not available for this question yet.
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {isFR ? (
            <button
              onClick={() => submitFreeResponsePractice(question)}
              disabled={frSubmitted || isThisQuestionLocked || frState.submitting}
              style={{
                border: "1px solid color-mix(in srgb, var(--gold) 50%, var(--border))",
                background: frSubmitted
                  ? "color-mix(in srgb, var(--gold) 14%, var(--surface))"
                  : isThisQuestionLocked
                    ? "color-mix(in srgb, var(--border) 28%, var(--surface))"
                    : "color-mix(in srgb, var(--gold) 14%, var(--surface))",
                color: frSubmitted ? "var(--gold)" : isThisQuestionLocked ? "var(--text-dim)" : "var(--gold)",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: frSubmitted || isThisQuestionLocked || frState.submitting ? "default" : "pointer",
              }}
            >
              {frSubmitted ? "Under review" : isThisQuestionLocked ? "Locked" : frState.submitting ? "Submitting..." : "Submit for review"}
            </button>
          ) : (
            <button
              onClick={() => submitQuestionAnswer(question)}
              disabled={attempted || isThisQuestionLocked || practiceBusyKey === question.key || !question.options?.length}
              style={{
                border: "1px solid color-mix(in srgb, var(--blue) 40%, var(--border))",
                background: attempted
                  ? "color-mix(in srgb, var(--green) 12%, var(--surface))"
                  : isThisQuestionLocked
                    ? "color-mix(in srgb, var(--border) 28%, var(--surface))"
                    : "color-mix(in srgb, var(--blue) 12%, var(--surface))",
                color: attempted ? "var(--green)" : isThisQuestionLocked ? "var(--text-dim)" : "var(--blue)",
                borderRadius: 10,
                padding: "8px 10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: attempted || isThisQuestionLocked ? "default" : "pointer",
              }}
            >
              {attempted ? "Completed" : isThisQuestionLocked ? "Locked" : practiceBusyKey === question.key ? "Checking..." : "Check answer"}
            </button>
          )}
          {!asStudentId && (() => {
            const saveStatus = practiceSaveState[question.key] || "idle"
            const saveLabel = saveStatus === "saving" ? "Saving..."
              : saveStatus === "saved" ? "Work saved"
              : saveStatus === "empty" ? "Canvas empty"
              : saveStatus === "error" ? "Retry save"
              : "Save my work"
            return (
              <button
                onClick={() => savePracticeWork(question)}
                disabled={saveStatus === "saving"}
                style={{
                  border: "1px solid color-mix(in srgb, var(--gold) 42%, var(--border))",
                  background: saveStatus === "saved"
                    ? "color-mix(in srgb, var(--green) 12%, var(--surface))"
                    : saveStatus === "error"
                      ? "color-mix(in srgb, var(--red) 12%, var(--surface))"
                      : "color-mix(in srgb, var(--gold) 12%, var(--surface))",
                  color: saveStatus === "saved" ? "var(--green)"
                    : saveStatus === "error" ? "var(--red)"
                    : "var(--gold)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: saveStatus === "saving" ? "default" : "pointer",
                }}
              >
                {saveLabel}
              </button>
            )
          })()}
        </div>
        {feedback?.text ? (
          <div style={{
            fontSize: 12,
            color: feedback.tone === "success" ? "var(--green)" : feedback.tone === "error" ? "var(--red)" : "var(--text-muted)"
          }}>
            {feedback.text}
          </div>
        ) : null}
      </div>
    )
  }

  if (!units.length) {
    return (
      <div style={{ display:"flex", width:"100%", height:"100%", alignItems:"center", justifyContent:"center" }}>
        <span style={{ color:"var(--text-muted)", fontSize:13 }}>No curriculum data.</span>
      </div>
    )
  }

  const subjectR = isTorus
    ? TORUS_TUBE_R
    : isCube
      ? CUBE_HALF
      : CYL_R
  const unitR = useMemo(() => {
    if (!selectedUnit) return Math.max(0.12, subjectR)
    if (isTorus) {
      return Math.max(
        0.12,
        ...(selectedUnit.rings || []).map((ring) => characteristicBandSize(
          ring.torusOuterTubeRadius || TORUS_TUBE_R,
          ring.torusInnerTubeRadius || 0,
          secondaryHeight
        ))
      )
    }
    if (isCube) return Math.max(0.12, CUBE_HALF)
    return Math.max(0.12, selectedUnit.diskRadius || CYL_R, secondaryHeight / 2)
  }, [selectedUnit, isTorus, isCube, subjectR, secondaryHeight])
  const loR = useMemo(() => {
    if (!selectedRing) return Math.max(0.12, unitR)
    if (isTorus) {
      return Math.max(0.12, characteristicBandSize(
        selectedRing.torusOuterTubeRadius || TORUS_TUBE_R,
        selectedRing.torusInnerTubeRadius || 0,
        secondaryHeight
      ))
    }
    if (isCube) return Math.max(0.12, characteristicBandSize(selectedRing.outerR || CUBE_HALF, selectedRing.innerR || 0, secondaryHeight))
    return Math.max(0.12, characteristicBandSize(selectedRing.outerR || CYL_R, selectedRing.innerR || 0, secondaryHeight))
  }, [selectedRing, isTorus, isCube, unitR, secondaryHeight])
  const qtR = useMemo(() => {
    if (!activeArc) return Math.max(0.12, loR)
    if (isTorus && selectedRing) {
      return Math.max(0.12, characteristicBandSize(
        selectedRing.torusOuterTubeRadius || TORUS_TUBE_R,
        selectedRing.torusInnerTubeRadius || 0,
        secondaryHeight
      ))
    }
    if (isCube && selectedRing) return Math.max(0.12, characteristicBandSize(selectedRing.outerR || CUBE_HALF, selectedRing.innerR || 0, secondaryHeight))
    if (selectedRing) return Math.max(0.12, characteristicBandSize(selectedRing.outerR || CYL_R, selectedRing.innerR || 0, secondaryHeight))
    return Math.max(0.12, loR)
  }, [activeArc, selectedRing, isTorus, isCube, loR, secondaryHeight])

  // Camera start radius: (Router + Rinner) / 2 of the rendered geometry,
  // which is the midpoint radial distance from origin to the band centre.
  // For torus this equals TORUS_MAJOR_R (the hole-to-outer cancellation),
  // for cylinder/cube it's the midpoint of the ring's inner/outer extent.
  const subjectMidR = isTorus
    ? TORUS_MAJOR_R
    : isCube ? CUBE_HALF : CYL_R
  const unitMidR = useMemo(() => {
    if (!selectedUnit) return subjectMidR
    if (isTorus) return TORUS_MAJOR_R
    const maxOuter = Math.max(0.12, ...(selectedUnit.rings || []).map(r => r.outerR || (isCube ? CUBE_HALF : CYL_R)))
    const minInner = Math.min(...(selectedUnit.rings || []).map(r => r.innerR || 0))
    return Math.max(0.12, (maxOuter + minInner) / 2)
  }, [selectedUnit, isTorus, isCube, subjectMidR])
  const loMidR = useMemo(() => {
    if (!selectedRing) return unitMidR
    if (isTorus) return TORUS_MAJOR_R
    return Math.max(0.12, ((selectedRing.outerR || (isCube ? CUBE_HALF : CYL_R)) + (selectedRing.innerR || 0)) / 2)
  }, [selectedRing, isTorus, isCube, unitMidR])

  const camSubject = useMemo(
    () => buildCameraSpec((!isTorus && !isCube) ? subjectMidR * 7 : subjectMidR * 4, `${shapeMode}:subject:${subjectName || "subject"}:${units.length}`),
    [subjectMidR, isTorus, isCube, shapeMode, subjectName, units.length]
  )
  const camUnit = useMemo(
    () => buildCameraSpec((!isTorus && !isCube) ? unitR * 7 : unitMidR * 4, `${shapeMode}:unit:${selectedUnit?.name || selectedUnitIdx || "none"}`),
    [unitR, unitMidR, isTorus, isCube, shapeMode, selectedUnit?.name, selectedUnitIdx]
  )
  const camLo = useMemo(
    () => buildCameraSpec(loMidR * 4, `${shapeMode}:lo:${selectedRing?.code || selectedRing?.name || "none"}`),
    [loMidR, shapeMode, selectedRing?.code, selectedRing?.name]
  )
  const camQt = useMemo(
    () => buildCameraSpec(loMidR * 4, `${shapeMode}:qt:${activeArc?.questionTypeId || activeArc?.type || "none"}`),
    [loMidR, shapeMode, activeArc?.questionTypeId, activeArc?.type]
  )
  const torusUnitTarget = useMemo(() => {
    if (!selectedUnit) return ZERO_TARGET
    return torusSegmentMidpoint({
      majorRadius: TORUS_MAJOR_R,
      innerTubeRadius: 0,
      outerTubeRadius: TORUS_TUBE_R,
      thetaStart: -(selectedUnit.torusThetaLen || Math.PI * 2) / 2,
      thetaLen: selectedUnit.torusThetaLen || Math.PI * 2,
    })
  }, [selectedUnit])
  const torusLoTarget = useMemo(() => {
    if (!selectedRing) return ZERO_TARGET
    return torusSegmentMidpoint({
      majorRadius: selectedRing.torusMajorRadius || TORUS_MAJOR_R,
      innerTubeRadius: selectedRing.torusInnerTubeRadius || 0,
      outerTubeRadius: selectedRing.torusOuterTubeRadius || TORUS_TUBE_R,
      thetaStart: -((selectedRing.torusThetaLen || selectedUnit?.torusThetaLen || Math.PI * 2) / 2),
      thetaLen: selectedRing.torusThetaLen || selectedUnit?.torusThetaLen || Math.PI * 2,
    })
  }, [selectedRing, selectedUnit?.torusThetaLen])
  const torusQtTarget = useMemo(() => {
    if (!(selectedRing && activeArc)) return ZERO_TARGET
    return torusSegmentMidpoint({
      majorRadius: selectedRing.torusMajorRadius || TORUS_MAJOR_R,
      innerTubeRadius: selectedRing.torusInnerTubeRadius || 0,
      outerTubeRadius: selectedRing.torusOuterTubeRadius || TORUS_TUBE_R,
      thetaStart: activeArc.thetaStart ?? selectedRing.torusThetaStart ?? (-((selectedRing.torusThetaLen || selectedUnit?.torusThetaLen || Math.PI * 2) / 2)),
      thetaLen: activeArc.thetaLen ?? (selectedRing.torusThetaLen || selectedUnit?.torusThetaLen || Math.PI * 2),
      phiStart: activeArc.phiStart ?? activeArc.start ?? 0,
      phiLen: activeArc.phiLen ?? activeArc.len ?? Math.PI * 2,
    })
  }, [selectedRing, selectedUnit?.torusThetaLen, activeArc])

  // For cylinder/cube the arc is a wedge — its visual midpoint is NOT at origin.
  // Compute the arc midpoint in local scene space then apply the scene tilt rotation.
  const cylArcMidTarget = useMemo(() => {
    if (!selectedRing || !activeArc) return ZERO_TARGET
    const midR = ((selectedRing.outerR || CYL_R) + (selectedRing.innerR || 0)) / 2
    const thetaMid = (activeArc.start ?? 0) + (activeArc.len ?? Math.PI * 2) / 2
    return rotatePoint([midR * Math.cos(thetaMid), 0, midR * Math.sin(thetaMid)], ARC_SCENE_ROTATION)
  }, [selectedRing, activeArc])

  const qtTarget = isTorus ? torusQtTarget : cylArcMidTarget

  const selectedQuestionSliceIndex = useMemo(
    () => activeArc?.questions?.findIndex((q) => q.key === selectedPracticeQuestion?.key) ?? -1,
    [activeArc?.questions, selectedPracticeQuestion?.key]
  )

  // For cylinder/cube: narrow the ring radially to the selected question's band
  const questionRing = useMemo(() => {
    if (!selectedRing || !activeArc?.questions?.length || selectedQuestionSliceIndex < 0 || isTorus) return selectedRing
    const n = activeArc.questions.length
    const dr = (selectedRing.outerR - selectedRing.innerR) / n
    return {
      ...selectedRing,
      innerR: selectedRing.innerR + selectedQuestionSliceIndex * dr,
      outerR: selectedRing.innerR + (selectedQuestionSliceIndex + 1) * dr,
    }
  }, [selectedRing, activeArc?.questions?.length, selectedQuestionSliceIndex, isTorus])
  const questionFocusTarget = useMemo(() => {
    if (!selectedPracticeQuestion || !activeArc?.questions?.length) return qtTarget
    if (isTorus) return torusQtTarget
    if (!selectedRing) return qtTarget
    const midR = ((selectedRing.outerR || CYL_R) + (selectedRing.innerR || 0)) / 2
    const thetaMid = (activeArc.start ?? 0) + (activeArc.len ?? Math.PI * 2) / 2
    const n = activeArc.questions.length
    const offsetY = Number.isInteger(selectedQuestionSliceIndex) && selectedQuestionSliceIndex >= 0
      ? secondaryHeight * (2 * selectedQuestionSliceIndex + 1 - n) / (2 * n)
      : 0
    return rotatePoint([midR * Math.cos(thetaMid), offsetY, midR * Math.sin(thetaMid)], ARC_SCENE_ROTATION)
  }, [selectedPracticeQuestion, activeArc, selectedRing, selectedQuestionSliceIndex, isTorus, secondaryHeight, qtTarget, torusQtTarget])
  const fovSubject = 34
  const fovUnit = 30
  const fovLo = 30
  const fovQt = 30
  const overviewGap = 14
  const visiblePanelCount = 1
    + (selectedUnit ? 1 : 0)
    + (selectedRing ? 1 : 0)
    + (activeArc ? 1 : 0)
    + (activeArc?.questions?.length > 0 ? 1 : 0)
  const totalOverviewGaps = Math.max(0, visiblePanelCount - 1)
  const panelWidth = visiblePanelCount === 1
    ? "100%"
    : `calc((100% - ${overviewGap * totalOverviewGaps}px) / ${visiblePanelCount})`

  if (mobileStage) {
    const sceneHeight = 320
    const stageContainerStyle = {
      width: "100%",
      height: "100%",
      minHeight: 0,
      transform:
        mobileStageMotion === "exit"
          ? `translateX(${mobileStageDirection > 0 ? "-10%" : "10%"}) scale(0.985)`
          : mobileStageMotion === "enter"
            ? `translateX(${mobileStageDirection > 0 ? "10%" : "-10%"}) scale(0.985)`
            : "translateX(0) scale(1)",
      opacity: mobileStageMotion === "idle" ? 1 : 0.14,
      transition: "transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 200ms ease-in-out",
      willChange: "transform, opacity",
    }
    const activeMobileStage = displayMobileStage || mobileStage
    let mobileStageNode = null
    if (activeMobileStage === "subject") {
      mobileStageNode = (
        <SceneWindow
          title="Visualization"
          subtitle={<>Subject: <strong style={{ fontWeight: 900 }}>{subjectName}</strong></>}
          large
          mastery={totalMastery}
          hoverLabel={hovLabelSubject}
        >
          <Canvas frameloop="demand" camera={{ position: camSubject, fov: fovSubject }} style={{ width: "100%", height: "100%" }}>
            <color attach="background" args={[canvasBg]} />
            {isTorus ? (
              <TorusSceneInner
                units={normalizedUnits}
                selectedIdx={selectedUnitIdx}
                highlightedIdx={highlightedUnitIdx}
                onHighlightUnit={handleHighlightUnit}
                onDrillUnit={handleSelectUnit}
                palette={palette}
              />
            ) : isCube ? (
              <CubeSceneInner
                units={normalizedUnits}
                totalHeight={totalHeight}
                selectedIdx={selectedUnitIdx}
                highlightedIdx={highlightedUnitIdx}
                onHighlightUnit={handleHighlightUnit}
                onDrillUnit={handleSelectUnit}
                palette={palette}
              />
            ) : (
              <CylinderSceneInner
                units={normalizedUnits}
                subjectName={subjectName}
                totalMastery={totalMastery}
                totalHeight={totalHeight}
                selectedIdx={selectedUnitIdx}
                highlightedIdx={highlightedUnitIdx}
                onHighlightUnit={handleHighlightUnit}
                onDrillUnit={handleSelectUnit}
                onHoverLabel={setHovLabelSubject}
                palette={palette}
              />
            )}
            <AnimatedOrbitControls cameraSpec={camSubject} target={ZERO_TARGET} minDistance={3.1} maxDistance={totalHeight * 3.8 + 8.2} animateKey={`mobile-subject-${shapeMode}-${subjectName}-${units.length}`} />
          </Canvas>
        </SceneWindow>
      )
    }
    if (activeMobileStage === "unit") {
      mobileStageNode = (
        <SceneWindow
          title="Visualization"
          subtitle={<>Unit: <strong style={{ fontWeight: 900 }}>{mobileUnit?.name || "Select a unit"}</strong></>}
          large
          mastery={mobileUnit?.mastery}
          hoverLabel={hovLabelUnit}
        >
          {mobileUnit ? (
            <Canvas frameloop="demand" camera={{ position: camUnit, fov: fovUnit }} style={{ width: "100%", height: "100%" }}>
              <color attach="background" args={[canvasBg]} />
              {isTorus ? (
                <TorusUnitSceneInner
                  unit={mobileUnit}
                  onHighlightRing={handleHighlightRing}
                  onDrillRing={handleSelectRing}
                  selectedRingCode={selectedRingCode}
                  highlightedRingCode={highlightedRingCode}
                  palette={palette}
                />
              ) : isCube ? (
                <CubeDiskSceneInner
                  unit={mobileUnit}
                  onHighlightRing={handleHighlightRing}
                  onDrillRing={handleSelectRing}
                  selectedRingCode={selectedRingCode}
                  highlightedRingCode={highlightedRingCode}
                  unitHeight={secondaryHeight}
                  palette={palette}
                />
              ) : (
                <DiskSceneInner
                  unit={mobileUnit}
                  onHighlightRing={handleHighlightRing}
                  onDrillRing={handleSelectRing}
                  selectedRingCode={selectedRingCode}
                  highlightedRingCode={highlightedRingCode}
                  unitHeight={secondaryHeight}
                  diskRadius={mobileUnit.diskRadius}
                  onHoverLabel={setHovLabelUnit}
                  palette={palette}
                />
              )}
              <AnimatedOrbitControls cameraSpec={camUnit} target={isTorus ? torusUnitTarget : ZERO_TARGET} minDistance={0.8} maxDistance={3.5} animateKey={`mobile-unit-${shapeMode}-${mobileUnit?.name || "none"}`} />
            </Canvas>
          ) : (
            <div style={{ height: sceneHeight, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              No unit available yet.
            </div>
          )}
        </SceneWindow>
      )
    }
    if (activeMobileStage === "lo") {
      mobileStageNode = (
        <SceneWindow
          title="Visualization"
          subtitle={<>Learning Objective: <strong style={{ fontWeight: 900 }}>{mobileRing?.name || mobileRing?.code || "Not available"}</strong></>}
          large
          mastery={mobileRing?.mastery}
          hoverLabel={hovLabelLo}
        >
          {mobileRing ? (
            <Canvas frameloop="demand" camera={{ position: camLo, fov: fovLo }} style={{ width: "100%", height: "100%" }}>
              <color attach="background" args={[canvasBg]} />
              {isTorus ? (
                <TorusRingSceneInner ring={mobileRing} activeArc={mobileArc} highlightedArcId={highlightedArcId} onHighlightArc={handleHighlightArc} onDrillArc={handleSelectArc} palette={palette} />
              ) : isCube ? (
                <CubeRingSceneInner ring={mobileRing} ringHeight={secondaryHeight} activeArc={mobileArc} highlightedArcId={highlightedArcId} onHighlightArc={handleHighlightArc} onDrillArc={handleSelectArc} palette={palette} />
              ) : (
                <RingSceneInner ring={mobileRing} ringHeight={secondaryHeight} activeArc={mobileArc} highlightedArcId={highlightedArcId} onHighlightArc={handleHighlightArc} onDrillArc={handleSelectArc} onHoverLabel={setHovLabelLo} palette={palette} />
              )}
              <AnimatedOrbitControls cameraSpec={camLo} target={isTorus ? torusLoTarget : ZERO_TARGET} minDistance={0.8} maxDistance={3.5} animateKey={`mobile-lo-${shapeMode}-${mobileRing?.code || mobileRing?.name || "none"}`} />
            </Canvas>
          ) : (
            <div style={{ height: sceneHeight, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              No learning objective available yet.
            </div>
          )}
        </SceneWindow>
      )
    }
    if (activeMobileStage === "questionType") {
      mobileStageNode = (
        <SceneWindow
          title="Visualization"
          subtitle={<>Question Type: <strong style={{ fontWeight: 900 }}>{mobileArc?.type || "Not available"}</strong></>}
          large
          mastery={mobileArc?.mastery}
          hoverLabel={hovLabelQt}
        >
          {mobileRing && mobileArc && mobileArc?.questions?.length ? (
            <Canvas frameloop="demand" camera={{ position: camQt, fov: fovQt }} style={{ width: "100%", height: "100%" }}>
              <color attach="background" args={[canvasBg]} />
              {isTorus ? (
                <TorusQuestionSlicesSceneInner ring={mobileRing} arc={mobileArc} questions={mobileArc?.questions || []} selectedQuestionKey={selectedPracticeQuestion?.key || ""} onSelectQuestion={setSelectedQuestionKey} onHoverLabel={setHovLabelQt} palette={palette} />
              ) : isCube ? (
                <CubeQuestionSlicesSceneInner ring={mobileRing} arc={mobileArc} ringHeight={secondaryHeight} questions={mobileArc?.questions || []} selectedQuestionKey={selectedPracticeQuestion?.key || ""} onSelectQuestion={setSelectedQuestionKey} onHoverLabel={setHovLabelQt} palette={palette} />
              ) : (
                <QuestionSlicesSceneInner ring={mobileRing} arc={mobileArc} ringHeight={secondaryHeight} questions={mobileArc?.questions || []} selectedQuestionKey={selectedPracticeQuestion?.key || ""} onSelectQuestion={setSelectedQuestionKey} onHoverLabel={setHovLabelQt} palette={palette} />
              )}
              <AnimatedOrbitControls cameraSpec={camQt} target={qtTarget} minDistance={0.8} maxDistance={3.5} animateKey={`mobile-qt-${shapeMode}-${mobileArc?.questionTypeId || mobileArc?.type || "none"}`} />
            </Canvas>
          ) : (
            <div style={{ height: sceneHeight, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              No question type available yet.
            </div>
          )}
        </SceneWindow>
      )
    }
    if (activeMobileStage === "question") {
      mobileStageNode = (
        <SceneWindow
          title="Visualization"
          subtitle={<>Question: <strong style={{ fontWeight: 900 }}>{selectedPracticeQuestion ? `Q${Math.max(1, (activeArc?.questions || []).findIndex((q) => q?.key === selectedPracticeQuestion?.key) + 1)}` : "Select a question"}</strong></>}
          large
          mastery={mobileArc?.mastery}
          hoverLabel={hovLabelQ}
        >
          {mobileRing && mobileArc && selectedPracticeQuestion ? (
            <Canvas frameloop="demand" camera={{ position: camQt, fov: fovQt }} style={{ width: "100%", height: "100%" }}>
              <color attach="background" args={[canvasBg]} />
              {isTorus ? (
                <TorusQuestionSlicesSceneInner ring={mobileRing} arc={mobileArc} questions={[selectedPracticeQuestion]} selectedQuestionKey={selectedPracticeQuestion.key} onSelectQuestion={setSelectedQuestionKey} onHoverLabel={setHovLabelQ} palette={palette} />
              ) : isCube ? (
                <CubeQuestionSlicesSceneInner ring={questionRing || mobileRing} arc={mobileArc} ringHeight={secondaryHeight} questions={[selectedPracticeQuestion]} selectedQuestionKey={selectedPracticeQuestion.key} onSelectQuestion={setSelectedQuestionKey} onHoverLabel={setHovLabelQ} palette={palette} />
              ) : (
                <QuestionSlicesSceneInner ring={questionRing || mobileRing} arc={mobileArc} ringHeight={secondaryHeight} questions={[selectedPracticeQuestion]} selectedQuestionKey={selectedPracticeQuestion.key} onSelectQuestion={setSelectedQuestionKey} onHoverLabel={setHovLabelQ} palette={palette} />
              )}
              <AnimatedOrbitControls cameraSpec={camQt} target={qtTarget} minDistance={0.8} maxDistance={3.5} animateKey={`mobile-question-${shapeMode}-${selectedPracticeQuestion?.key || "none"}`} />
            </Canvas>
          ) : (
            <div style={{ height: sceneHeight, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
              No questions available yet.
            </div>
          )}
        </SceneWindow>
      )
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <MasteryLegend palette={palette} />
        <div style={stageContainerStyle}>{mobileStageNode}</div>
      </div>
    )
  }

  if (mode === "lab") {
    const questionList = activeQuestionList
    const practiceGap = isCompactViewport ? 12 : "3.3333%"
    const practiceMain = isCompactViewport ? "1fr" : "61.1111%"
    const practiceSide = isCompactViewport ? "1fr" : "28.8889%"
    const practiceVerticalGap = isCompactViewport ? 12 : "5.4545%"
    const showFloatingQuestionPanel = !isCompactViewport
    return (
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
        <div>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 16px",
            borderRadius: 18,
            border: "1px solid rgba(191,203,222,0.85)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(248,251,255,0.92))",
            boxShadow: "0 12px 28px rgba(70, 96, 138, 0.1)",
            flexWrap: "wrap",
          }}>
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#5e7390", fontWeight: 800 }}>
                Practice Room
              </div>
              <div style={{ fontSize: 13, color: "#6f829c", marginTop: 4 }}>
                Work inside Excalidraw, inspect the shapes on the right, then use the arc and question cards below to open one MCQ at a time.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={selectedUnitIdx ?? ""}
                onChange={(e) => {
                  const nextIdx = e.target.value === "" ? null : Number(e.target.value)
                  setSelectedUnitIdx(Number.isInteger(nextIdx) ? nextIdx : null)
                  setSelectedRingCode("")
                  setActiveArcId("")
                }}
                style={{
                  border: "1px solid rgba(191,203,222,0.95)",
                  borderRadius: 999,
                  padding: "9px 14px",
                  background: "#fff",
                  color: "#203246",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <option value="">Select unit</option>
                {normalizedUnits.map((unit, idx) => (
                  <option key={unit.name || idx} value={idx}>{unit.name}</option>
                ))}
              </select>
              {[
                { label: "Subject", open: showSubjectCard, setOpen: setShowSubjectCard },
                { label: "Unit", open: showUnitCard, setOpen: setShowUnitCard },
                { label: "Learning Objective", open: showLoCard, setOpen: setShowLoCard },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => item.setOpen((prev) => !prev)}
                  style={{
                    border: "1px solid rgba(191,203,222,0.95)",
                    borderRadius: 999,
                    padding: "8px 12px",
                    background: item.open ? "rgba(109,143,216,0.12)" : "#fff",
                    color: item.open ? "#3c5f9a" : "#5e7390",
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {item.open ? `Hide ${item.label}` : `Show ${item.label}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <MasteryLegend palette={palette} />

        <div style={{
          display: "grid",
          gridTemplateColumns: isCompactViewport
            ? "1fr"
            : `${practiceGap} ${practiceMain} ${practiceGap} ${practiceSide} ${practiceGap}`,
          alignItems: "start",
          width: "100%",
          gap: isCompactViewport ? 12 : 0,
          aspectRatio: isCompactViewport ? undefined : "18 / 11",
        }}>
          <div style={{
            gridColumn: isCompactViewport ? "1 / 2" : "2 / 3",
            position: "relative",
            borderRadius: 22,
            border: "1px solid rgba(191,203,222,0.85)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(246,249,255,0.9))",
            boxShadow: "0 20px 40px rgba(70, 96, 138, 0.12)",
            overflow: "hidden",
            height: isCompactViewport ? "min(82vh, 640px)" : "100%",
          }} ref={tourRefs?.labWorkspaceRef || null}>
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              padding: "16px 18px",
              borderBottom: "1px solid rgba(191,203,222,0.75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              zIndex: 2,
              background: "linear-gradient(180deg, rgba(248,251,255,0.98), rgba(240,246,255,0.9))",
              backdropFilter: "blur(6px)",
            }}>
              <div>
                <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#5e7390", fontWeight: 800 }}>
                  Excalidraw Workspace
                </div>
                <div style={{ fontSize: 13, color: "#6f829c", marginTop: 4 }}>
                  {activeArc ? activeArc.type : "Pick a unit, then choose a learning objective ring/disk and a question type arc."}
                </div>
              </div>
              {selectedPracticeQuestion && (
                <div style={{
                  fontSize: 11,
                  color: "#6f829c",
                  border: "1px solid rgba(191,203,222,0.85)",
                  borderRadius: 999,
                  padding: "6px 10px",
                  background: "#fff",
                }}>
                  MCQ card open
                </div>
              )}
            </div>

            <div ref={excalidrawViewportRef} style={{ position: "absolute", inset: "74px 14px 14px 14px" }}>
              <div style={{
                position: "relative",
                width: "100%",
                height: "100%",
                borderRadius: 18,
                overflow: "hidden",
                border: "1px solid rgba(208,216,230,0.9)",
                background: "#ffffff",
              }}>
                <Excalidraw
                  excalidrawAPI={(api) => { excalidrawApiRef.current = api }}
                  initialData={{
                    appState: {
                      viewBackgroundColor: "#ffffff",
                    },
                  }}
                />

                {selectedPracticeQuestion && activeArc && showFloatingQuestionPanel && (
                  <div style={{
                    position: "absolute",
                    left: questionPanelPos.x,
                    top: questionPanelPos.y,
                    width: "min(320px, 34%)",
                    minWidth: 240,
                    height: "calc(100% - 72px)",
                    maxHeight: "calc(100% - 72px)",
                    overflow: "auto",
                    zIndex: 4,
                    borderRadius: 18,
                    border: "1px solid rgba(191,203,222,0.92)",
                    background: "rgba(255,255,255,0.97)",
                    boxShadow: "0 24px 44px rgba(70, 96, 138, 0.18)",
                    display: "flex",
                    flexDirection: "column",
                  }}>
                    <button
                      type="button"
                      onPointerDown={(event) => {
                        const panelRect = event.currentTarget.parentElement.getBoundingClientRect()
                        questionPanelDragRef.current = {
                          offsetX: event.clientX - panelRect.left,
                          offsetY: event.clientY - panelRect.top,
                          width: panelRect.width,
                          height: panelRect.height,
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        width: "100%",
                        padding: "10px 12px",
                        border: "none",
                        borderBottom: "1px solid rgba(191,203,222,0.8)",
                        background: "linear-gradient(180deg, rgba(248,251,255,0.98), rgba(240,246,255,0.9))",
                        color: "#4f6786",
                        cursor: "grab",
                        userSelect: "none",
                        touchAction: "none",
                        textAlign: "left",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      <span>Question Panel</span>
                      <span style={{ fontSize: 14, lineHeight: 1 }}>::</span>
                    </button>
                    <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: 14 }}>
                      {renderSingleQuestionCard(selectedPracticeQuestion)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{
            gridColumn: isCompactViewport ? "1 / 2" : "4 / 5",
            display: "grid",
            gridTemplateColumns: isCompactViewport ? "1fr" : undefined,
            gridTemplateRows: isCompactViewport ? undefined : "1fr 1fr",
            rowGap: practiceVerticalGap,
            columnGap: isCompactViewport ? 0 : undefined,
            height: "100%",
          }}>
            <SquareSceneWindow
              windowRef={mergeRefs(div1Ref, tourRefs?.labSubjectRef)}
              title="Subject Progress"
              subtitle={showSubjectCard ? subjectName : "Hidden"}
              description={showSubjectCard
                ? `The full ${shapeLabel} shows semester-scale progress for ${subjectName || "this subject"}. Use it to see which unit carries the most weight before drilling into the smaller windows.`
                : `This panel normally shows the full subject ${shapeLabel}. Reopen it from the top controls when you want the full map again.`}
              hoverLabel={hovLabelSubject}
            >
              {showSubjectCard ? (
                <Canvas frameloop="demand" key={`lab-subject-${shapeMode}-${sceneVersion}`} camera={{ position: camSubject, fov: fovSubject }} style={{ width: "100%", height: "100%" }}>
                  <color attach="background" args={[canvasBg]} />
                  {isTorus ? (
                    <TorusSceneInner
                      units={normalizedUnits}
                      selectedIdx={selectedUnitIdx}
                      highlightedIdx={highlightedUnitIdx}
                      onHighlightUnit={handleHighlightUnit}
                      onDrillUnit={handleSelectUnit}
                      palette={palette}
                    />
                  ) : isCube ? (
                    <CubeSceneInner
                      units={normalizedUnits}
                      totalHeight={totalHeight}
                      selectedIdx={selectedUnitIdx}
                      highlightedIdx={highlightedUnitIdx}
                      onHighlightUnit={handleHighlightUnit}
                      onDrillUnit={handleSelectUnit}
                      palette={palette}
                    />
                  ) : (
                    <CylinderSceneInner
                      units={normalizedUnits}
                      subjectName={subjectName}
                      totalMastery={totalMastery}
                      totalHeight={totalHeight}
                      selectedIdx={selectedUnitIdx}
                      highlightedIdx={highlightedUnitIdx}
                      onHighlightUnit={handleHighlightUnit}
                      onDrillUnit={handleSelectUnit}
                      onHoverLabel={setHovLabelSubject}
                      palette={palette}
                    />
                  )}
                  <AnimatedOrbitControls cameraSpec={camSubject} target={ZERO_TARGET} minDistance={3.1} maxDistance={totalHeight * 3.8 + 8.2} animateKey={`lab-subject-${shapeMode}-${sceneVersion}`} />
                </Canvas>
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#7f90a8", fontSize: 12, background: "#fff" }}>
                  Reopen Subject from the top controls.
                </div>
              )}
            </SquareSceneWindow>

            <SquareSceneWindow
              windowRef={mergeRefs(div2Ref, tourRefs?.labUnitRef)}
              title={`Unit ${cap(st.unit)}`}
              subtitle={showUnitCard && selectedUnit ? selectedUnit.name : "Hidden"}
              description={showUnitCard && selectedUnit
                ? `This ${st.unit} isolates one unit from the full subject stack. Double-click to move from unit-level mastery into its learning-objective ${st.los}. e.g. ${selectedUnitName} has ${learningObjectiveCount} learning objective${learningObjectiveCount === 1 ? "" : "s"}.`
                : `This panel normally shows the selected unit ${st.unit}. Reopen it from the top controls after choosing a unit.`}
              hoverLabel={hovLabelUnit}
            >
              {showUnitCard && selectedUnit ? (
                <Canvas frameloop="demand" key={`lab-unit-${shapeMode}-${sceneVersion}-${selectedUnitIdx ?? "none"}`} camera={{ position: camUnit, fov: fovUnit }} style={{ width: "100%", height: "100%" }}>
                  <color attach="background" args={[canvasBg]} />
                  {isTorus ? (
                    <TorusUnitSceneInner
                      unit={selectedUnit}
                      onHighlightRing={handleHighlightRing}
                      onDrillRing={handleSelectRing}
                      selectedRingCode={selectedRingCode}
                      highlightedRingCode={highlightedRingCode}
                      palette={palette}
                    />
                  ) : isCube ? (
                    <CubeDiskSceneInner
                      unit={selectedUnit}
                      onHighlightRing={handleHighlightRing}
                      onDrillRing={handleSelectRing}
                      selectedRingCode={selectedRingCode}
                      highlightedRingCode={highlightedRingCode}
                      unitHeight={secondaryHeight}
                      palette={palette}
                    />
                  ) : (
                    <DiskSceneInner
                      unit={selectedUnit}
                      onHighlightRing={handleHighlightRing}
                      onDrillRing={handleSelectRing}
                      selectedRingCode={selectedRingCode}
                      highlightedRingCode={highlightedRingCode}
                      unitHeight={secondaryHeight}
                      diskRadius={selectedUnit.diskRadius}
                      onHoverLabel={setHovLabelUnit}
                      palette={palette}
                    />
                  )}
                  <AnimatedOrbitControls cameraSpec={camUnit} target={isTorus ? torusUnitTarget : ZERO_TARGET} minDistance={0.8} maxDistance={3.5} animateKey={`lab-unit-${shapeMode}-${sceneVersion}-${selectedUnitIdx ?? "none"}`} />
                </Canvas>
              ) : (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#7f90a8", fontSize: 12, background: "#fff" }}>
                  Pick a unit to open this washer.
                </div>
              )}
            </SquareSceneWindow>
          </div>
        </div>

        {isCompactViewport && selectedPracticeQuestion && activeArc ? (
          <SceneWindow
            title="Question Panel"
            subtitle={activeArc.type || "Selected question"}
            description="The active practice question stays below the scratchpad on mobile so the workspace remains clear while you work."
          >
            <div style={{ height: "100%", overflow: "auto", padding: 4 }}>
              {renderSingleQuestionCard(selectedPracticeQuestion)}
            </div>
          </SceneWindow>
        ) : null}

        <MasteryLegend palette={palette} />

        <div style={{
          display: "grid",
          gridTemplateColumns: isCompactViewport
            ? "1fr"
            : `${practiceGap} ${practiceSide} ${practiceGap} ${practiceSide} ${practiceGap} ${practiceSide} ${practiceGap}`,
          alignItems: "stretch",
          width: "100%",
          gap: isCompactViewport ? 12 : 0,
          aspectRatio: isCompactViewport ? undefined : "45 / 13",
        }}>
          <div style={{ gridColumn: isCompactViewport ? "1 / 2" : "2 / 3", height: isCompactViewport ? 240 : "100%" }}>
          <SquareSceneWindow
            windowRef={mergeRefs(div4Ref, tourRefs?.labQuestionRef)}
            title="Question"
            subtitle={selectedPracticeQuestion ? `Q${Math.max(1, (activeArc?.questions || []).findIndex((q) => q.key === selectedPracticeQuestion?.key) + 1)}` : (activeArc?.type || "Select a question type")}
            description={`The selected question from this ${st.qt}. One band — one question.`}
            hoverLabel={hovLabelQ}
          >
            {selectedRing && activeArc && selectedPracticeQuestion ? (
              <Canvas frameloop="demand" key={`lab-question-single-${shapeMode}-${sceneVersion}-${selectedPracticeQuestion?.key || "none"}`} camera={{ position: camQt, fov: fovQt }} style={{ width: "100%", height: "100%" }}>
                <color attach="background" args={[canvasBg]} />
                {isTorus ? (
                  <TorusQuestionSlicesSceneInner
                    ring={selectedRing}
                    arc={activeArc}
                    questions={[selectedPracticeQuestion]}
                    selectedQuestionKey={selectedPracticeQuestion.key}
                    onSelectQuestion={setSelectedQuestionKey}
                    onHoverLabel={setHovLabelQ}
                    palette={palette}
                  />
                ) : isCube ? (
                  <CubeQuestionSlicesSceneInner
                    ring={selectedRing}
                    arc={activeArc}
                    ringHeight={secondaryHeight}
                    questions={[selectedPracticeQuestion]}
                    selectedQuestionKey={selectedPracticeQuestion.key}
                    onSelectQuestion={setSelectedQuestionKey}
                    onHoverLabel={setHovLabelQ}
                    palette={palette}
                  />
                ) : (
                  <QuestionSlicesSceneInner
                    ring={selectedRing}
                    arc={activeArc}
                    ringHeight={secondaryHeight}
                    questions={[selectedPracticeQuestion]}
                    selectedQuestionKey={selectedPracticeQuestion.key}
                    onSelectQuestion={setSelectedQuestionKey}
                    onHoverLabel={setHovLabelQ}
                    palette={palette}
                  />
                )}
                <AnimatedOrbitControls cameraSpec={camQt} target={qtTarget} minDistance={0.8} maxDistance={3.5} animateKey={`lab-question-single-${shapeMode}-${sceneVersion}-${selectedPracticeQuestion?.key || "none"}`} />
              </Canvas>
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#7f90a8", fontSize: 12, background: "#fff", padding: 16, textAlign: "center" }}>
                Select a question type to unlock one practice question from it.
              </div>
            )}
          </SquareSceneWindow>
          </div>

          <div style={{ gridColumn: isCompactViewport ? "1 / 2" : "4 / 5", height: isCompactViewport ? 240 : "100%" }}>
          <SquareSceneWindow
            windowRef={tourRefs?.labArcRef || null}
            title={`Question Type ${cap(st.qt)}`}
            subtitle={activeArc?.type || `${cap(st.qt)} cutout preview`}
            description={`Questions in this ${st.qt}, divided by band. One is unlocked — others are locked for the day.`}
            hoverLabel={hovLabelQt}
          >
            {selectedRing && activeArc && activeArc?.questions?.length ? (
              <Canvas frameloop="demand" key={`lab-arc-${shapeMode}-${sceneVersion}-${selectedRingCode || "none"}-${activeArcId || "none"}-${activeArc?.questions?.length || 0}`} camera={{ position: camQt, fov: fovQt }} style={{ width: "100%", height: "100%" }}>
                <color attach="background" args={[canvasBg]} />
                {isTorus ? (
                  <TorusQuestionSlicesSceneInner
                    ring={selectedRing}
                    arc={activeArc}
                    questions={activeArc?.questions || []}
                    selectedQuestionKey={selectedPracticeQuestion?.key || ""}
                    onSelectQuestion={setSelectedQuestionKey}
                    onHoverLabel={setHovLabelQt}
                    palette={palette}
                  />
                ) : isCube ? (
                  <CubeQuestionSlicesSceneInner
                    ring={selectedRing}
                    arc={activeArc}
                    ringHeight={secondaryHeight}
                    questions={activeArc?.questions || []}
                    selectedQuestionKey={selectedPracticeQuestion?.key || ""}
                    onSelectQuestion={setSelectedQuestionKey}
                    onHoverLabel={setHovLabelQt}
                    palette={palette}
                  />
                ) : (
                  <QuestionSlicesSceneInner
                    ring={selectedRing}
                    arc={activeArc}
                    ringHeight={secondaryHeight}
                    questions={activeArc?.questions || []}
                    selectedQuestionKey={selectedPracticeQuestion?.key || ""}
                    onSelectQuestion={setSelectedQuestionKey}
                    onHoverLabel={setHovLabelQt}
                    palette={palette}
                  />
                )}
                <AnimatedOrbitControls cameraSpec={camQt} target={qtTarget} minDistance={0.8} maxDistance={3.5} animateKey={`lab-arc-${shapeMode}-${sceneVersion}-${selectedRingCode || "none"}-${activeArcId || "none"}-${questionList.length}`} />
              </Canvas>
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#7f90a8", fontSize: 12, background: "#fff", padding: 16, textAlign: "center" }}>
                {`Pick a learning objective ${st.lo} and then a question type ${st.qt}.`}
              </div>
            )}
          </SquareSceneWindow>
          </div>

          <div style={{ gridColumn: isCompactViewport ? "1 / 2" : "6 / 7", height: isCompactViewport ? 240 : "100%" }}>
          <SquareSceneWindow
            windowRef={mergeRefs(div3Ref, tourRefs?.labLoRef)}
            title="Learning Objective"
            subtitle={showLoCard ? (selectedRing?.name || selectedRing?.code || `Select a ${st.lo}`) : "Hidden"}
            description={showLoCard
              ? `Each ${st.lo} represents one learning objective inside the selected unit. Double-click a ${st.lo} to reveal the question-type ${st.qts} inside it. e.g. ${selectedLearningObjectiveName} has ${questionTypeCount} question type${questionTypeCount === 1 ? "" : "s"}.`
              : `This panel normally shows the learning objective ${st.los} for the selected unit. Reopen it from the top controls when you want to inspect objective-level progress again.`}
            hoverLabel={hovLabelLo}
          >
            {showLoCard && selectedRing ? (
              <Canvas frameloop="demand" key={`lab-lo-${shapeMode}-${sceneVersion}-${selectedRingCode || "none"}`} camera={{ position: camLo, fov: fovLo }} style={{ width: "100%", height: "100%" }}>
                <color attach="background" args={[canvasBg]} />
                {isTorus ? (
                  <TorusRingSceneInner ring={selectedRing} activeArc={activeArc} highlightedArcId={highlightedArcId} onHighlightArc={handleHighlightArc} onDrillArc={handleSelectArc} palette={palette} />
                ) : isCube ? (
                  <CubeRingSceneInner ring={selectedRing} ringHeight={secondaryHeight} activeArc={activeArc} highlightedArcId={highlightedArcId} onHighlightArc={handleHighlightArc} onDrillArc={handleSelectArc} palette={palette} />
                ) : (
                  <RingSceneInner ring={selectedRing} ringHeight={secondaryHeight} activeArc={activeArc} highlightedArcId={highlightedArcId} onHighlightArc={handleHighlightArc} onDrillArc={handleSelectArc} onHoverLabel={setHovLabelLo} palette={palette} />
                )}
                <AnimatedOrbitControls cameraSpec={camLo} target={isTorus ? torusLoTarget : ZERO_TARGET} minDistance={0.8} maxDistance={3.5} animateKey={`lab-lo-${shapeMode}-${sceneVersion}-${selectedRingCode || "none"}`} />
              </Canvas>
            ) : (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#7f90a8", fontSize: 12, background: "#fff", padding: 16, textAlign: "center" }}>
                {showLoCard ? `Pick a unit to open its learning objective ${st.los}.` : "Reopen Learning Objective from the top controls."}
              </div>
            )}
          </SquareSceneWindow>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: 0,
        gap: 14,
        padding: 6,
      }}
    >
      <MasteryLegend palette={palette} />
      <div
        ref={containerRef}
        style={{
          position: "relative",
          display: "flex",
          flexDirection: isCompactViewport ? "column" : "row",
          width: "100%",
          minHeight: 0,
          gap: overviewGap,
          overflowX: "hidden",
          overflowY: "hidden",
          alignItems: "stretch",
          paddingBottom: 2,
        }}
      >
        <SceneWindow
          windowRef={mergeRefs(div1Ref, tourRefs?.overviewSubjectRef)}
          title="Subject Progress"
          subtitle={subjectName}
          width={isCompactViewport ? "100%" : panelWidth}
          mastery={totalMastery}
          hoverLabel={hovLabelSubject}
        >
          <Canvas frameloop="demand" camera={{ position: camSubject, fov: fovSubject }} style={{ width: "100%", height: "100%" }}>
            <color attach="background" args={[canvasBg]} />
            {isTorus ? (
              <TorusSceneInner
                units={normalizedUnits}
                selectedIdx={selectedUnitIdx}
                highlightedIdx={highlightedUnitIdx}
                onHighlightUnit={handleHighlightUnit}
                onDrillUnit={handleSelectUnit}
                palette={palette}
              />
            ) : isCube ? (
              <CubeSceneInner
                units={normalizedUnits}
                subjectName={subjectName}
                totalMastery={totalMastery}
                totalHeight={totalHeight}
                selectedIdx={selectedUnitIdx}
                highlightedIdx={highlightedUnitIdx}
                onHighlightUnit={handleHighlightUnit}
                onDrillUnit={handleSelectUnit}
                palette={palette}
              />
            ) : (
              <CylinderSceneInner
                units={normalizedUnits} subjectName={subjectName}
                totalMastery={totalMastery} totalHeight={totalHeight}
                selectedIdx={selectedUnitIdx} highlightedIdx={highlightedUnitIdx}
                onHighlightUnit={handleHighlightUnit} onDrillUnit={handleSelectUnit}
                onHoverLabel={setHovLabelSubject}
                palette={palette}
              />
            )}
            <AnimatedOrbitControls cameraSpec={camSubject} target={ZERO_TARGET} minDistance={3.1} maxDistance={totalHeight * 3.8 + 8.2} animateKey={`overview-subject-${shapeMode}-${subjectName}-${units.length}`} />
          </Canvas>
        </SceneWindow>

        {selectedUnit && (
          <SceneWindow
            windowRef={mergeRefs(div2Ref, tourRefs?.overviewUnitRef)}
            title="Unit"
            subtitle={<>Unit: <strong style={{ fontWeight: 900 }}>{selectedUnit.name || "Selected unit"}</strong></>}
            width={isCompactViewport ? "100%" : panelWidth}
            mastery={selectedUnit.mastery}
            onMasteryChange={scoreEditing ? (v) => setScoreOverrides(p => ({ ...p, [`u:${selectedUnit.name}`]: v })) : null}
            hoverLabel={hovLabelUnit}
          >
            <Canvas frameloop="demand" camera={{ position:camUnit, fov:fovUnit }} style={{ width: "100%", height: "100%" }}>
              <color attach="background" args={[canvasBg]} />
              {isTorus ? (
                <TorusUnitSceneInner
                  unit={selectedUnit}
                  onHighlightRing={handleHighlightRing}
                  onDrillRing={handleSelectRing}
                  selectedRingCode={selectedRingCode}
                  highlightedRingCode={highlightedRingCode}
                  palette={palette}
                />
              ) : isCube ? (
                <CubeDiskSceneInner
                  unit={selectedUnit}
                  onHighlightRing={handleHighlightRing}
                  onDrillRing={handleSelectRing}
                  selectedRingCode={selectedRingCode}
                  highlightedRingCode={highlightedRingCode}
                  unitHeight={secondaryHeight}
                  palette={palette}
                />
              ) : (
                <DiskSceneInner
                  unit={selectedUnit}
                  onHighlightRing={handleHighlightRing}
                  onDrillRing={handleSelectRing}
                  selectedRingCode={selectedRingCode}
                  highlightedRingCode={highlightedRingCode}
                  unitHeight={secondaryHeight}
                  diskRadius={selectedUnit.diskRadius}
                  onHoverLabel={setHovLabelUnit}
                  palette={palette}
                />
              )}
              <AnimatedOrbitControls cameraSpec={camUnit} target={isTorus ? torusUnitTarget : ZERO_TARGET} minDistance={0.8} maxDistance={3.5} animateKey={`overview-unit-${shapeMode}-${selectedUnit?.name || "none"}`} />
            </Canvas>
          </SceneWindow>
        )}

        {selectedRing && (
          <SceneWindow
            windowRef={mergeRefs(div3Ref, tourRefs?.overviewLoRef)}
            title="Learning Objective"
            subtitle={<>Learning Objective: <strong style={{ fontWeight: 900 }}>{selectedRing.name || selectedRing.code || "Selected LO"}</strong></>}
            width={isCompactViewport ? "100%" : panelWidth}
            mastery={selectedRing.mastery}
            onMasteryChange={scoreEditing ? (v) => setScoreOverrides(p => ({ ...p, [`r:${selectedRing.code}`]: v })) : null}
            hoverLabel={hovLabelLo}
          >
            <Canvas frameloop="demand" camera={{ position:camLo, fov:fovLo }} style={{ width: "100%", height: "100%" }}>
              <color attach="background" args={[canvasBg]} />
              {isTorus ? (
                <TorusRingSceneInner ring={selectedRing} activeArc={activeArc} highlightedArcId={highlightedArcId} onHighlightArc={handleHighlightArc} onDrillArc={handleSelectArc} palette={palette} />
              ) : isCube ? (
                <CubeRingSceneInner ring={selectedRing} ringHeight={secondaryHeight} activeArc={activeArc} highlightedArcId={highlightedArcId} onHighlightArc={handleHighlightArc} onDrillArc={handleSelectArc} palette={palette} />
              ) : (
                <RingSceneInner ring={selectedRing} ringHeight={secondaryHeight} activeArc={activeArc} highlightedArcId={highlightedArcId} onHighlightArc={handleHighlightArc} onDrillArc={handleSelectArc} onHoverLabel={setHovLabelLo} palette={palette} />
              )}
              <AnimatedOrbitControls cameraSpec={camLo} target={isTorus ? torusLoTarget : ZERO_TARGET} minDistance={0.8} maxDistance={3.5} animateKey={`overview-lo-${shapeMode}-${selectedRing?.code || selectedRing?.name || "none"}`} />
            </Canvas>
          </SceneWindow>
        )}

        {activeArc && (
          <SceneWindow
            windowRef={div4Ref}
            title={`Question Type ${cap(st.qt)}`}
            subtitle={<>Question Type: <strong style={{ fontWeight: 900 }}>{activeArc.type}</strong></>}
            width={isCompactViewport ? "100%" : panelWidth}
            mastery={activeArc.mastery}
            onMasteryChange={scoreEditing && activeArc.questionTypeId && selectedRing?.code ? (v) => setScoreOverrides(p => ({ ...p, [`a:${selectedRing.code}:${activeArc.questionTypeId}`]: v })) : null}
            hoverLabel={hovLabelQt}
          >
            <Canvas frameloop="demand" camera={{ position:camQt, fov:fovQt }} style={{ width: "100%", height: "100%" }}>
              <color attach="background" args={[canvasBg]} />
              {activeArc.questions?.length > 0 ? (
                isTorus ? (
                  <TorusQuestionSlicesSceneInner
                    ring={selectedRing} arc={activeArc}
                    questions={activeArc.questions}
                    selectedQuestionKey={selectedPracticeQuestion?.key || ""}
                    onSelectQuestion={setSelectedQuestionKey}
                    onHoverLabel={setHovLabelQt}
                    palette={palette}
                  />
                ) : isCube ? (
                  <CubeQuestionSlicesSceneInner
                    ring={selectedRing} arc={activeArc} ringHeight={secondaryHeight}
                    questions={activeArc.questions}
                    selectedQuestionKey={selectedPracticeQuestion?.key || ""}
                    onSelectQuestion={setSelectedQuestionKey}
                    onHoverLabel={setHovLabelQt}
                    palette={palette}
                  />
                ) : (
                  <QuestionSlicesSceneInner
                    ring={selectedRing} arc={activeArc} ringHeight={secondaryHeight}
                    questions={activeArc.questions}
                    selectedQuestionKey={selectedPracticeQuestion?.key || ""}
                    onSelectQuestion={setSelectedQuestionKey}
                    onHoverLabel={setHovLabelQt}
                    palette={palette}
                  />
                )
              ) : isTorus ? (
                <TorusArcFocusSceneInner ring={selectedRing} arc={activeArc} palette={palette} />
              ) : isCube ? (
                <CubeArcFocusSceneInner ring={selectedRing} arc={activeArc} ringHeight={secondaryHeight} palette={palette} />
              ) : (
                <ArcFocusSceneInner ring={selectedRing} arc={activeArc} ringHeight={secondaryHeight} palette={palette} />
              )}
              <AnimatedOrbitControls cameraSpec={camQt} target={qtTarget} minDistance={0.8} maxDistance={3.5} animateKey={`overview-qt-${shapeMode}-${activeArcId || "none"}-${questionCount}`} />
            </Canvas>
          </SceneWindow>
        )}

        {activeArc?.questions?.length > 0 && selectedPracticeQuestion && (
          <SceneWindow
            windowRef={div5Ref}
            title="Question"
            subtitle={<>Question: <strong style={{ fontWeight: 900 }}>Q{Math.max(1, activeArc.questions.findIndex((q) => q.key === selectedPracticeQuestion.key) + 1)}</strong></>}
            width={isCompactViewport ? "100%" : panelWidth}
            mastery={activeArc.mastery}
            onMasteryChange={scoreEditing && activeArc.questionTypeId && selectedRing?.code ? (v) => setScoreOverrides(p => ({ ...p, [`a:${selectedRing.code}:${activeArc.questionTypeId}`]: v })) : null}
            hoverLabel={hovLabelQ}
          >
            <Canvas frameloop="demand" camera={{ position:camQt, fov:fovQt }} style={{ width: "100%", height: "100%" }}>
              <color attach="background" args={[canvasBg]} />
              {isTorus ? (
                <TorusQuestionSlicesSceneInner ring={selectedRing} arc={activeArc} questions={[selectedPracticeQuestion]} selectedQuestionKey={selectedPracticeQuestion.key} onSelectQuestion={setSelectedQuestionKey} onHoverLabel={setHovLabelQ} palette={palette} />
              ) : isCube ? (
                <CubeQuestionSlicesSceneInner ring={questionRing} arc={activeArc} ringHeight={secondaryHeight} questions={[selectedPracticeQuestion]} selectedQuestionKey={selectedPracticeQuestion.key} onSelectQuestion={setSelectedQuestionKey} onHoverLabel={setHovLabelQ} palette={palette} />
              ) : (
                <QuestionSlicesSceneInner ring={questionRing} arc={activeArc} ringHeight={secondaryHeight} questions={[selectedPracticeQuestion]} selectedQuestionKey={selectedPracticeQuestion.key} onSelectQuestion={setSelectedQuestionKey} onHoverLabel={setHovLabelQ} palette={palette} />
              )}
              <AnimatedOrbitControls cameraSpec={camQt} target={qtTarget} minDistance={0.8} maxDistance={3.5} animateKey={`overview-question-${shapeMode}-${selectedPracticeQuestion?.key || "none"}`} />
            </Canvas>
          </SceneWindow>
        )}

      </div>

      {!readOnly && activeArc && activeArc.type !== "No data yet" && (
        <SceneWindow
          title="Question Type"
          subtitle={<>Question Type: <strong style={{ fontWeight: 900 }}>{activeArc.type}</strong></>}
        >
          {renderQuestionPanelContent()}
        </SceneWindow>
      )}
    </div>
  )
}

function PracticeFrBlock({ frState, disabled, onSetMode, onUploadFile }) {
  const mode = frState.mode || "excalidraw"
  const btnStyle = (active) => ({
    flex: 1,
    padding: "6px 10px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    border: active ? "1px solid var(--gold)" : "1px solid var(--border)",
    background: active ? "color-mix(in srgb, var(--gold) 14%, var(--surface))" : "var(--surface)",
    color: active ? "var(--gold)" : "var(--text)",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  })
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" disabled={disabled} onClick={() => onSetMode("excalidraw")} style={btnStyle(mode === "excalidraw")}>Draw work</button>
        <button type="button" disabled={disabled} onClick={() => onSetMode("upload")} style={btnStyle(mode === "upload")}>Upload</button>
      </div>
      {mode === "excalidraw" ? (
        <div style={{
          padding: 12,
          border: "1px dashed color-mix(in srgb, var(--gold) 50%, var(--border))",
          borderRadius: 10,
          background: "color-mix(in srgb, var(--gold) 6%, var(--surface))",
          fontSize: 12,
          color: "var(--text-muted)",
          lineHeight: 1.5,
        }}>
          Draw your work in the <strong>Excalidraw workspace</strong> alongside this card. Submit will capture whatever is currently on the canvas.
        </div>
      ) : (
        <div style={{
          padding: 12,
          border: "1px dashed color-mix(in srgb, var(--gold) 50%, var(--border))",
          borderRadius: 10,
          background: "color-mix(in srgb, var(--gold) 6%, var(--surface))",
          fontSize: 12,
        }}>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            onChange={(e) => onUploadFile(e.target.files?.[0] || null)}
            disabled={disabled}
            style={{ display: "block" }}
          />
          {frState.upload?.file && (
            <div style={{ marginTop: 8, color: "var(--text-muted)" }}>
              Selected: <strong>{frState.upload.file.name}</strong> ({(frState.upload.file.size / 1024 / 1024).toFixed(2)} MB)
            </div>
          )}
          <div style={{ marginTop: 6, color: "var(--text-dim)", fontSize: 11 }}>JPEG, PNG, or PDF. Max 22 MB.</div>
        </div>
      )}
      {frState.error && (
        <div style={{ fontSize: 12, color: "var(--red)" }}>{frState.error}</div>
      )}
    </div>
  )
}
