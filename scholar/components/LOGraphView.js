import { useMemo, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { Html, OrbitControls } from "@react-three/drei"
import * as THREE from "three"

const NODE_HEIGHT = 0.1
const NODE_BASE_R = 0.14
const REPULSION_K = 1.6
const SPRING_K = 0.012
const BASE_SPRING_LEN = 2.2
const ITERATIONS = 220

// ─── Layout ──────────────────────────────────────────────────────────────────

function computeLayout(nodes, edges) {
  const codes = Object.keys(nodes)
  if (!codes.length) return {}

  // Deterministic init: distribute on a sphere by index
  const positions = {}
  codes.forEach((code, i) => {
    const theta = (i / codes.length) * Math.PI * 2
    const phi = Math.acos(1 - 2 * (i + 0.5) / codes.length)
    const r = Math.max(2, Math.sqrt(codes.length) * 1.4)
    positions[code] = new THREE.Vector3(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    )
  })

  const tmp = new THREE.Vector3()
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const forces = {}
    codes.forEach(c => (forces[c] = new THREE.Vector3()))

    // Repulsion between all pairs
    for (let i = 0; i < codes.length; i++) {
      for (let j = i + 1; j < codes.length; j++) {
        const a = codes[i], b = codes[j]
        tmp.subVectors(positions[b], positions[a])
        const dist = Math.max(tmp.length(), 0.1)
        const repul = REPULSION_K / (dist * dist)
        const n = tmp.clone().normalize()
        forces[a].addScaledVector(n, -repul)
        forces[b].addScaledVector(n, repul)
      }
    }

    // Spring attraction along edges; rest length ∝ 1/weight
    edges.forEach(({ from, to, weight }) => {
      if (!positions[from] || !positions[to]) return
      tmp.subVectors(positions[to], positions[from])
      const dist = Math.max(tmp.length(), 0.01)
      const restLen = BASE_SPRING_LEN / (weight + 0.3)
      const springF = SPRING_K * (dist - restLen)
      const n = tmp.clone().normalize()
      forces[from].addScaledVector(n, springF)
      forces[to].addScaledVector(n, -springF)
    })

    const cooling = 1 - iter / ITERATIONS
    codes.forEach(code => {
      const len = forces[code].length()
      if (len > 0)
        positions[code].addScaledVector(forces[code].normalize(), Math.min(len, cooling * 0.38))
    })
  }

  // Re-center
  const center = new THREE.Vector3()
  codes.forEach(c => center.add(positions[c]))
  center.divideScalar(codes.length)
  codes.forEach(c => positions[c].sub(center))

  return positions
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nodeRadius(code, nodes) {
  const n = nodes[code]
  return NODE_BASE_R + ((n?.inDegree || 0) + (n?.outDegree || 0)) * 0.055
}

function massColor(mass = 0) {
  if (mass < 0.33) return new THREE.Color().setHSL(0.6, 0.65, 0.42 + mass * 0.15)
  if (mass < 0.66) return new THREE.Color().setHSL(0.11, 0.82, 0.48)
  return new THREE.Color().setHSL(0.33, 0.68, 0.38)
}

// ─── Node disk ────────────────────────────────────────────────────────────────

const white = new THREE.Color(1, 1, 1)

function NodeDisk({ code, name, position, radius, mass, isHovered, isSelected, isPending, onClick, onHover }) {
  const baseColor = massColor(mass || 0)
  const hoverColor = baseColor.clone().lerp(white, 0.35)
  const selectColor = baseColor.clone().lerp(white, 0.55)
  const pendingColor = baseColor.clone().lerp(new THREE.Color("#ffd060"), 0.7)

  const color = isPending ? pendingColor : isSelected ? selectColor : isHovered ? hoverColor : baseColor

  // Emissive glow: amber for low mastery, green for high — scales with mass
  const emissiveColor = (mass || 0) >= 0.5 ? "#22ff88" : "#ff8822"
  const emissiveIntensity = (mass || 0) * 1.6

  const rimColor = baseColor.clone().lerp(white, isSelected ? 0.7 : isHovered ? 0.45 : 0.1)

  return (
    <group position={position}>
      <mesh
        onClick={e => { e.stopPropagation(); onClick(code) }}
        onPointerOver={e => { e.stopPropagation(); onHover(code) }}
        onPointerOut={e => { e.stopPropagation(); onHover(null) }}
      >
        <cylinderGeometry args={[radius, radius, NODE_HEIGHT, 36]} />
        <meshStandardMaterial
          color={color}
          roughness={0.38}
          metalness={0.18}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
        />
      </mesh>
      {/* Point light for nodes with meaningful mastery */}
      {(mass || 0) > 0.15 && (
        <pointLight
          color={emissiveColor}
          intensity={(mass || 0) * 1.2}
          distance={radius * 8}
          decay={2}
        />
      )}
      {/* Rim ring */}
      <mesh>
        <torusGeometry args={[radius, 0.018, 8, 36]} />
        <meshStandardMaterial
          color={rimColor}
          roughness={0.3}
          metalness={0.3}
          emissive={isSelected || isHovered ? rimColor : "#000000"}
          emissiveIntensity={isSelected ? 0.8 : isHovered ? 0.4 : 0}
        />
      </mesh>
      {(isHovered || isSelected || isPending) && (
        <Html center distanceFactor={6} style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
          <div style={{
            background: "rgba(8,14,32,0.92)",
            color: "#ddeeff",
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 9px",
            borderRadius: 7,
            border: "1px solid rgba(100,160,255,0.28)",
            backdropFilter: "blur(8px)",
            maxWidth: 200,
            textAlign: "center",
            lineHeight: 1.4,
          }}>
            <div style={{ fontSize: 9, opacity: 0.55, letterSpacing: "0.12em", marginBottom: 2 }}>{code}</div>
            {name}
          </div>
        </Html>
      )}
    </group>
  )
}

// ─── Rod edge ─────────────────────────────────────────────────────────────────

function RodEdge({ from, to, positions, nodes, weight, isSuggestion }) {
  const start = positions[from]
  const end = positions[to]
  if (!start || !end) return null

  const dir = new THREE.Vector3().subVectors(end, start)
  const totalDist = dir.length()
  const rA = nodeRadius(from, nodes)
  const rB = nodeRadius(to, nodes)
  const gap = 0.05
  const rodLength = Math.max(0.05, totalDist - rA - rB - gap * 2)
  if (rodLength <= 0) return null

  const rodStart = start.clone().addScaledVector(dir.clone().normalize(), rA + gap)
  const mid = rodStart.clone().addScaledVector(dir.clone().normalize(), rodLength / 2)
  const arrowBase = rodStart.clone().addScaledVector(dir.clone().normalize(), rodLength)

  const up = new THREE.Vector3(0, 1, 0)
  const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize())

  const opacity = isSuggestion ? 0.4 : Math.max(0.28, Math.min(0.92, weight * 1.6))
  const rodR = 0.022 + weight * 0.018
  const color = isSuggestion ? "#f0c040" : "#4a80d8"
  const coneColor = isSuggestion ? "#f0d060" : "#6aa0f0"

  return (
    <group>
      {/* Rod body — tapered: slightly thicker at source */}
      <mesh position={mid} quaternion={quaternion}>
        <cylinderGeometry args={[rodR * 0.55, rodR, rodLength, 8]} />
        <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.55} metalness={0.1} />
      </mesh>
      {/* Arrowhead cone at target end */}
      <mesh position={arrowBase} quaternion={quaternion}>
        <coneGeometry args={[rodR * 1.8, 0.13, 8]} />
        <meshStandardMaterial color={coneColor} transparent opacity={opacity + 0.1} roughness={0.4} />
      </mesh>
    </group>
  )
}

// ─── Scene ────────────────────────────────────────────────────────────────────

function GraphScene({ graph, editable, onEdgeAdd, mastery }) {
  const [hovered, setHovered] = useState(null)
  const [pending, setPending] = useState(null) // first node when drawing a new edge

  const positions = useMemo(
    () => computeLayout(graph.nodes, graph.edges),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(graph.nodes), JSON.stringify(graph.edges)]
  )

  function handleClick(code) {
    if (!editable) {
      setPending(p => (p === code ? null : code))
      return
    }
    if (!pending) { setPending(code); return }
    if (pending === code) { setPending(null); return }
    onEdgeAdd?.(pending, code)
    setPending(null)
  }

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 9, 4]} intensity={1.1} castShadow={false} />
      <spotLight position={[0, 12, 0]} intensity={0.7} angle={Math.PI / 4} penumbra={0.6} color="#c8daff" />

      {graph.edges.map((edge, i) => (
        <RodEdge
          key={i}
          from={edge.from}
          to={edge.to}
          weight={edge.weight || 0}
          isSuggestion={!!edge.studentSuggestion}
          positions={positions}
          nodes={graph.nodes}
        />
      ))}

      {Object.keys(graph.nodes).map(code => {
        const node = graph.nodes[code]
        const pos = positions[code]
        if (!pos) return null
        return (
          <NodeDisk
            key={code}
            code={code}
            name={node.name || code}
            position={[pos.x, pos.y, pos.z]}
            radius={nodeRadius(code, graph.nodes)}
            mass={mastery?.[code] ?? 0}
            isHovered={hovered === code}
            isSelected={pending === code}
            isPending={editable && !!pending && pending !== code && hovered === code}
            onClick={handleClick}
            onHover={setHovered}
          />
        )
      })}

      <OrbitControls makeDefault enablePan enableZoom enableRotate />
    </>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export default function LOGraphView({ graph, editable = false, onEdgeAdd, mastery = {}, height = 520 }) {
  const hasNodes = graph && Object.keys(graph.nodes || {}).length > 0

  return (
    <div style={{ position: "relative", height, borderRadius: 14, overflow: "hidden", background: "#eef4fb" }}>
      {editable && (
        <div style={{
          position: "absolute", top: 10, left: 12, zIndex: 2, pointerEvents: "none",
          fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
          color: "rgba(63,95,145,0.58)",
        }}>
          Click a node, then another to connect
        </div>
      )}
      <div style={{
        position: "absolute", bottom: 10, right: 12, zIndex: 2, pointerEvents: "none",
        display: "flex", gap: 12, fontSize: 11, color: "rgba(74,105,156,0.52)",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 20, height: 2, background: "#4a80d8", borderRadius: 2 }} />
          Reinforces
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 20, height: 2, background: "#f0c040", borderRadius: 2 }} />
          Suggested
        </span>
      </div>

      {!hasNodes ? (
        <div style={{ height: "100%", display: "grid", placeItems: "center", color: "rgba(74,105,156,0.42)", fontSize: 14 }}>
          No connections mapped yet.
        </div>
      ) : (
        <Canvas frameloop="demand" camera={{ position: [0, 3, 14], fov: 52 }}>
          <GraphScene graph={graph} editable={editable} onEdgeAdd={onEdgeAdd} mastery={mastery} />
        </Canvas>
      )}
    </div>
  )
}
