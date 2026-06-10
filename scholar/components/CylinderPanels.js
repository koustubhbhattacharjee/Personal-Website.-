import { useMemo, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import {
  AnimatedOrbitControls,
  buildCameraSpec,
  buildTorusShellSegmentGeometry,
  buildSquareFrameSegments,
  buildSquarePerimeterPieces,
  torusSegmentMidpoint,
  ARC_SCENE_ROTATION,
  ZERO_TARGET,
  CUBE_HALF,
  CYL_R,
  TOTAL_CYLINDER_HEIGHT,
  DISPLAY_CYLINDER_HEIGHT,
  SECONDARY_HEIGHT_SCALE,
  TORUS_MAJOR_R,
  TORUS_TUBE_R,
} from "./SubjectCylinder3D"

const SHAPE_PALETTES = {
  ember:    ["#6b1016", "#b3342a", "#e7613a", "#f2a96a"],
  sunset:   ["#e7614b", "#f08b5f", "#f5b56a", "#fad884"],
  ocean:    ["#0b3a4a", "#176b7a", "#3aa8b0", "#9fe0df"],
  midnight: ["#0b0f2a", "#1b2257", "#4142a3", "#8a82d9"],
  royal:    ["#2a0f4a", "#5f1e88", "#a347b7", "#e69adf"],
  forest:   ["#203a1e", "#3a6b34", "#6fa23e", "#bddc67"],
}

function rotatePoint(point, euler) {
  const v = new THREE.Vector3(point[0] || 0, point[1] || 0, point[2] || 0)
  v.applyEuler(new THREE.Euler(euler[0] || 0, euler[1] || 0, euler[2] || 0))
  return [v.x, v.y, v.z]
}

function resolveShapePalette(key) {
  const stops = SHAPE_PALETTES[key] || SHAPE_PALETTES.ember
  return {
    stops,
    low: stops[0],
    mid: stops[Math.floor(stops.length / 2)],
    high: stops[stops.length - 1],
  }
}

function hexToRgb(hex) {
  const h = String(hex || "").replace(/^#/, "")
  if (h.length !== 6) return [0, 0, 0]
  const num = parseInt(h, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function rgbToHex(r, g, b) {
  const toHex = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function masteryStep(m, stops) {
  const safeStops = Array.isArray(stops) && stops.length ? stops : ["#555555"]
  if (safeStops.length === 1) return safeStops[0]
  const v = Math.max(0, Math.min(1, Number(m) || 0))
  const scaled = v * (safeStops.length - 1)
  const lo = Math.floor(scaled)
  const hi = Math.min(safeStops.length - 1, lo + 1)
  const t = scaled - lo
  const [ar, ag, ab] = hexToRgb(safeStops[lo])
  const [br, bg, bb] = hexToRgb(safeStops[hi])
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t)
}

function CameraFrontLight() {
  const lightRef = useRef()
  const { camera } = useThree()
  useFrame(() => {
    if (!lightRef.current) return
    lightRef.current.position.copy(camera.position)
    lightRef.current.position.y += 1.2
    lightRef.current.target.position.set(0, 0, 0)
    lightRef.current.target.updateMatrixWorld()
  })
  return (
    <directionalLight
      ref={lightRef}
      intensity={1.4}
      castShadow
      shadow-mapSize-width={1024}
      shadow-mapSize-height={1024}
      shadow-camera-left={-6}
      shadow-camera-right={6}
      shadow-camera-top={6}
      shadow-camera-bottom={-6}
    />
  )
}

function SceneLights() {
  return (
    <>
      <hemisphereLight intensity={0.55} color={0xffffff} groundColor={0x222233} />
      <CameraFrontLight />
      <directionalLight position={[-3, 2, -2]} intensity={0.3} color={0xbfd8ff} />
    </>
  )
}

function MatteMat({ color, opacity = 1 }) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={0.55}
      metalness={0.04}
      transparent={opacity < 1}
      opacity={opacity}
      side={THREE.DoubleSide}
    />
  )
}

// Frosted, hollow look for subsections with no underlying data.
function IceMat() {
  return (
    <meshPhysicalMaterial
      color="#e2f0f6"
      emissive="#8ec1d4"
      emissiveIntensity={0.08}
      transparent
      opacity={0.22}
      side={THREE.DoubleSide}
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

function IceWireframe({ children }) {
  return (
    <mesh>
      {children}
      <meshBasicMaterial color="#f2fbff" wireframe transparent opacity={0.45} />
    </mesh>
  )
}

function Washer({ innerR, outerR, height, color, isEmpty = false, onClick, onDoubleClick, onPointerOver, onPointerOut }) {
  return (
    <group onClick={onClick} onDoubleClick={onDoubleClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[outerR, outerR, height, 48, 1, true]} />
        {isEmpty ? <IceMat /> : <MatteMat color={color} />}
      </mesh>
      {innerR > 0.001 && (
        <mesh>
          <cylinderGeometry args={[innerR, innerR, height, 48, 1, true]} />
          {isEmpty ? <IceMat /> : <MatteMat color={color} />}
        </mesh>
      )}
      <mesh position={[0, height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <ringGeometry args={[Math.max(innerR, 0), outerR, 48]} />
        {isEmpty ? <IceMat /> : <MatteMat color={color} />}
      </mesh>
      <mesh position={[0, -height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[Math.max(innerR, 0), outerR, 48]} />
        {isEmpty ? <IceMat /> : <MatteMat color={color} />}
      </mesh>
      {isEmpty ? (
        <>
          <mesh position={[0, height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.max(innerR, 0), outerR, 48]} />
            <meshBasicMaterial color="#f2fbff" wireframe transparent opacity={0.45} />
          </mesh>
          <mesh position={[0, -height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.max(innerR, 0), outerR, 48]} />
            <meshBasicMaterial color="#f2fbff" wireframe transparent opacity={0.45} />
          </mesh>
        </>
      ) : null}
    </group>
  )
}

function ArcWasher({ innerR, outerR, height, thetaStart, thetaLen, offsetY = 0, color, isEmpty = false, onClick, onDoubleClick, onPointerOver, onPointerOut }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    const thetaEnd = thetaStart + thetaLen
    shape.moveTo(Math.cos(thetaStart) * outerR, Math.sin(thetaStart) * outerR)
    shape.absarc(0, 0, outerR, thetaStart, thetaEnd, false)
    shape.lineTo(Math.cos(thetaEnd) * innerR, Math.sin(thetaEnd) * innerR)
    shape.absarc(0, 0, innerR, thetaEnd, thetaStart, true)
    shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 48, steps: 1 })
    g.translate(0, 0, -height / 2)
    return g
  }, [innerR, outerR, height, thetaStart, thetaLen])
  const edges = useMemo(() => (isEmpty ? new THREE.EdgesGeometry(geometry, 22) : null), [isEmpty, geometry])
  return (
    <group position={[0, offsetY, 0]} rotation={[Math.PI / 2, 0, 0]} onClick={onClick} onDoubleClick={onDoubleClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh geometry={geometry} castShadow receiveShadow>
        {isEmpty ? <IceMat /> : <MatteMat color={color} />}
      </mesh>
      {edges ? (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color="#f2fbff" transparent opacity={0.55} />
        </lineSegments>
      ) : null}
    </group>
  )
}

function MatteCylinderStack({ units, totalHeight, palette, selectedIdx, onPickUnit }) {
  const [hov, setHov] = useState(null)
  const stops = palette.stops
  const unitCount = Math.max(1, units.length)
  const unitHeight = totalHeight / unitCount
  const centerOffset = totalHeight / 2
  return (
    <>
      <SceneLights />
      {units.map((unit, i) => {
        const y = i * unitHeight + unitHeight / 2 - centerOffset
        const baseR = unit.diskRadius || CYL_R * 0.68
        const isSel = selectedIdx === i
        const isHov = hov === i
        const r = baseR * (isSel ? 1.22 : isHov ? 1.08 : 1)
        const unitIsEmpty = unit.hasData === false
        return (
          <mesh
            key={unit.name || i}
            position={[0, y, 0]}
            castShadow
            receiveShadow
            onDoubleClick={(e) => { e.stopPropagation(); onPickUnit?.(i) }}
            onPointerOver={(e) => { e.stopPropagation(); setHov(i) }}
            onPointerOut={() => setHov(null)}
          >
            <cylinderGeometry args={[r, r, unitHeight * 0.98, 96, 1, false]} />
            {unitIsEmpty ? <IceMat /> : <MatteMat color={masteryStep(unit.mastery, stops)} />}
          </mesh>
        )
      })}
    </>
  )
}

function MatteDiskScene({ unit, unitHeight, palette, selectedRingCode, onPickRing }) {
  const [hov, setHov] = useState(null)
  const rings = unit?.rings || []
  const stops = palette.stops
  return (
    <>
      <SceneLights />
      <group rotation={[-0.62, 0.48, 0.06]}>
        {rings.map((ring, i) => {
          const isSel = selectedRingCode && ring.code === selectedRingCode
          const isHov = hov === i
          const hBump = isSel ? 1.5 : isHov ? 1.08 : 1
          return (
            <Washer
              key={ring.code || i}
              innerR={ring.innerR}
              outerR={ring.outerR}
              height={unitHeight * hBump}
              color={masteryStep(ring.mastery, stops)}
              isEmpty={ring.hasData === false}
              onDoubleClick={(e) => { e.stopPropagation(); onPickRing?.(ring) }}
              onPointerOver={(e) => { e.stopPropagation(); setHov(i) }}
              onPointerOut={() => setHov(null)}
            />
          )
        })}
      </group>
    </>
  )
}

function buildArcSpans(ring) {
  if (!ring?.arcs?.length) return []
  let angle = -Math.PI / 2
  return ring.arcs.map((arc) => {
    const start = angle
    const len = Math.max(0.01, (arc.angleFraction || 1 / ring.arcs.length) * Math.PI * 2)
    angle += len
    return { ...arc, start, len }
  })
}

function MatteRingScene({ ring, ringHeight, palette, activeArcId, onPickArc }) {
  const [hov, setHov] = useState(null)
  const arcs = useMemo(() => buildArcSpans(ring), [ring])
  const stops = palette.stops
  return (
    <>
      <SceneLights />
      <group rotation={[-0.58, 0.52, 0.08]}>
        {arcs.map((arc, i) => {
          const isHov = hov === i
          const isSel = activeArcId && arc.questionTypeId === activeArcId
          const hBump = isSel ? 1.5 : isHov ? 1.08 : 1
          return (
            <ArcWasher
              key={arc.questionTypeId || i}
              innerR={ring.innerR}
              outerR={ring.outerR}
              height={ringHeight * hBump}
              thetaStart={arc.start}
              thetaLen={arc.len}
              color={masteryStep(arc.mastery, stops)}
              isEmpty={arc.hasData === false}
              onDoubleClick={(e) => { e.stopPropagation(); onPickArc?.(arc) }}
              onPointerOver={(e) => { e.stopPropagation(); setHov(i) }}
              onPointerOut={() => setHov(null)}
            />
          )
        })}
      </group>
    </>
  )
}

function TorusShellMatte({ majorRadius, innerTubeRadius, outerTubeRadius, thetaStart, thetaLen, phiStart = 0, phiLen = Math.PI * 2, color, isEmpty = false, onClick, onDoubleClick, onPointerOver, onPointerOut }) {
  const geometry = useMemo(
    () => buildTorusShellSegmentGeometry({ majorRadius, innerTubeRadius, outerTubeRadius, thetaStart, thetaLen, phiStart, phiLen }),
    [majorRadius, innerTubeRadius, outerTubeRadius, thetaStart, thetaLen, phiStart, phiLen]
  )
  const edges = useMemo(() => (isEmpty ? new THREE.EdgesGeometry(geometry, 22) : null), [isEmpty, geometry])
  return (
    <group onClick={onClick} onDoubleClick={onDoubleClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <mesh geometry={geometry} castShadow receiveShadow>
        {isEmpty ? <IceMat /> : <MatteMat color={color} />}
      </mesh>
      {edges ? (
        <lineSegments geometry={edges}>
          <lineBasicMaterial color="#f2fbff" transparent opacity={0.55} />
        </lineSegments>
      ) : null}
    </group>
  )
}

function MatteTorusSubject({ units, palette, selectedIdx, onPickUnit }) {
  const [hov, setHov] = useState(null)
  const stops = palette.stops
  return (
    <>
      <SceneLights />
      <group rotation={[Math.PI / 2.35, 0, 0.1]}>
        {units.map((unit, i) => {
          const start = unit.torusThetaStart || 0
          const arcLen = unit.torusThetaLen || ((Math.PI * 2) / Math.max(1, units.length))
          const isSel = selectedIdx === i
          const isHov = hov === i
          const tubeBump = isSel ? 1.22 : isHov ? 1.08 : 1
          return (
            <TorusShellMatte
              key={unit.name || i}
              majorRadius={TORUS_MAJOR_R}
              innerTubeRadius={0}
              outerTubeRadius={TORUS_TUBE_R * tubeBump}
              thetaStart={start}
              thetaLen={arcLen}
              color={masteryStep(unit.mastery, stops)}
              isEmpty={unit.hasData === false}
              onDoubleClick={(e) => { e.stopPropagation(); onPickUnit?.(i) }}
              onPointerOver={(e) => { e.stopPropagation(); setHov(i) }}
              onPointerOut={() => setHov(null)}
            />
          )
        })}
      </group>
    </>
  )
}

function MatteTorusUnit({ unit, palette, selectedRingCode, onPickRing }) {
  const [hov, setHov] = useState(null)
  const rings = unit?.rings || []
  const stops = palette.stops
  const unitThetaLen = unit?.torusThetaLen || Math.PI * 2
  const startAngle = -unitThetaLen / 2
  return (
    <>
      <SceneLights />
      <group rotation={[Math.PI / 2.35, 0, 0.1]}>
        {rings.map((ring, i) => {
          const isSel = selectedRingCode && ring.code === selectedRingCode
          const isHov = hov === i
          const innerR = ring.torusInnerTubeRadius || 0
          const outerR = ring.torusOuterTubeRadius || TORUS_TUBE_R
          const thetaLen = unitThetaLen * (isSel ? 1.9 : isHov ? 1.15 : 1)
          const thetaStart = startAngle + (unitThetaLen - thetaLen) / 2
          return (
            <TorusShellMatte
              key={ring.code || i}
              majorRadius={ring.torusMajorRadius || TORUS_MAJOR_R}
              innerTubeRadius={innerR}
              outerTubeRadius={outerR}
              thetaStart={thetaStart}
              thetaLen={thetaLen}
              color={masteryStep(ring.mastery, stops)}
              isEmpty={ring.hasData === false}
              onDoubleClick={(e) => { e.stopPropagation(); onPickRing?.(ring) }}
              onPointerOver={(e) => { e.stopPropagation(); setHov(i) }}
              onPointerOut={() => setHov(null)}
            />
          )
        })}
      </group>
    </>
  )
}

function MatteTorusRing({ ring, palette, activeArcId, onPickArc }) {
  const [hov, setHov] = useState(null)
  const stops = palette.stops
  const unitThetaLen = ring?.torusThetaLen || Math.PI * 2
  const startAngle = -unitThetaLen / 2
  const majorRadius = ring?.torusMajorRadius || TORUS_MAJOR_R
  const innerTubeRadius = ring?.torusInnerTubeRadius || 0
  const outerTubeRadius = ring?.torusOuterTubeRadius || TORUS_TUBE_R
  const arcs = useMemo(() => {
    let phi = -Math.PI / 2
    return (ring?.arcs || []).map((arc) => {
      const phiLen = Math.max(0.01, (arc.angleFraction || 1 / Math.max(1, ring.arcs.length)) * Math.PI * 2)
      const phiStart = phi
      phi += phiLen
      return { ...arc, phiStart, phiLen }
    })
  }, [ring?.arcs])
  return (
    <>
      <SceneLights />
      <group rotation={[Math.PI / 2.35, 0, 0.1]}>
        {arcs.map((arc, i) => {
          const isSel = activeArcId && arc.questionTypeId === activeArcId
          const isHov = hov === i
          const thetaLen = unitThetaLen * (isSel ? 1.9 : isHov ? 1.15 : 1)
          const thetaStart = startAngle + (unitThetaLen - thetaLen) / 2
          return (
            <TorusShellMatte
              key={arc.questionTypeId || i}
              majorRadius={majorRadius}
              innerTubeRadius={innerTubeRadius}
              outerTubeRadius={outerTubeRadius}
              thetaStart={thetaStart}
              thetaLen={thetaLen}
              phiStart={arc.phiStart}
              phiLen={arc.phiLen}
              color={masteryStep(arc.mastery, stops)}
              isEmpty={arc.hasData === false}
              onDoubleClick={(e) => { e.stopPropagation(); onPickArc?.(arc) }}
              onPointerOver={(e) => { e.stopPropagation(); setHov(i) }}
              onPointerOut={() => setHov(null)}
            />
          )
        })}
      </group>
    </>
  )
}

function MatteTorusArcFocus({ ring, arc, palette, sliceIndex, totalSlices, onPickSlice }) {
  const [hov, setHov] = useState(null)
  const stops = palette.stops
  const unitThetaLen = ring?.torusThetaLen || Math.PI * 2
  const startAngle = ring?.torusThetaStart != null ? ring.torusThetaStart : -unitThetaLen / 2
  const majorRadius = ring?.torusMajorRadius || TORUS_MAJOR_R
  const innerTubeRadius = ring?.torusInnerTubeRadius || 0
  const outerTubeRadius = ring?.torusOuterTubeRadius || TORUS_TUBE_R
  const phiStart = arc?.phiStart ?? arc?.start ?? 0
  const phiLen = arc?.phiLen ?? arc?.len ?? Math.PI * 2
  const color = masteryStep(arc?.mastery, stops)
  const arcIsEmpty = arc?.hasData === false
  const n = Number.isInteger(totalSlices) && totalSlices > 0 ? totalSlices : 1
  if (n > 1) {
    const dr = (outerTubeRadius - innerTubeRadius) / n
    const safeIdx = Number.isInteger(sliceIndex) ? Math.max(0, Math.min(n - 1, sliceIndex)) : -1
    return (
      <>
        <SceneLights />
        <group rotation={[Math.PI / 2.35, 0, 0.1]}>
          {Array.from({ length: n }).map((_, idx) => {
            const isSel = idx === safeIdx
            const isHov = hov === idx
            const inner = innerTubeRadius + idx * dr
            const outer = innerTubeRadius + (idx + 1) * dr
            const bump = isSel ? 1.22 : isHov ? 1.08 : 1
            return (
              <TorusShellMatte
                key={idx}
                majorRadius={majorRadius}
                innerTubeRadius={inner}
                outerTubeRadius={outer * bump}
                thetaStart={startAngle}
                thetaLen={unitThetaLen}
                phiStart={phiStart}
                phiLen={phiLen}
                color={color}
                isEmpty={arcIsEmpty}
                onDoubleClick={(e) => { e.stopPropagation(); onPickSlice?.(idx) }}
                onPointerOver={(e) => { e.stopPropagation(); setHov(idx) }}
                onPointerOut={() => setHov(null)}
              />
            )
          })}
        </group>
      </>
    )
  }
  return (
    <>
      <SceneLights />
      <group rotation={[Math.PI / 2.35, 0, 0.1]}>
        <TorusShellMatte
          majorRadius={majorRadius}
          innerTubeRadius={innerTubeRadius}
          outerTubeRadius={outerTubeRadius}
          thetaStart={startAngle}
          thetaLen={unitThetaLen}
          phiStart={phiStart}
          phiLen={phiLen}
          color={color}
          isEmpty={arcIsEmpty}
        />
      </group>
    </>
  )
}

function SquareFrameMatte({ innerHalf, outerHalf, height, color, isEmpty = false, onClick, onDoubleClick, onPointerOver, onPointerOut }) {
  const segments = useMemo(() => buildSquareFrameSegments(innerHalf, outerHalf), [innerHalf, outerHalf])
  return (
    <group onClick={onClick} onDoubleClick={onDoubleClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      {segments.map((segment) => (
        <mesh key={segment.key} position={[segment.position[0], segment.position[1], segment.position[2]]} castShadow receiveShadow>
          <boxGeometry args={[segment.size[0], height, segment.size[1]]} />
          {isEmpty ? <IceMat /> : <MatteMat color={color} />}
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

function SquarePerimeterMatte({ innerHalf, outerHalf, height, startFraction = 0, fraction = 0.25, offsetY = 0, color, isEmpty = false, onClick, onDoubleClick, onPointerOver, onPointerOut }) {
  const pieces = useMemo(
    () => buildSquarePerimeterPieces(innerHalf, outerHalf, fraction, startFraction),
    [innerHalf, outerHalf, fraction, startFraction]
  )
  return (
    <group position={[0, offsetY, 0]} onClick={onClick} onDoubleClick={onDoubleClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      {pieces.map((piece, idx) => (
        <mesh key={idx} position={[piece.center[0], 0, piece.center[1]]} castShadow receiveShadow>
          <boxGeometry args={[piece.size[0], height, piece.size[1]]} />
          {isEmpty ? <IceMat /> : <MatteMat color={color} />}
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

function MatteCubeSubject({ units, totalHeight, palette, selectedIdx, onPickUnit }) {
  const [hov, setHov] = useState(null)
  const stops = palette.stops
  const centerOffset = totalHeight / 2
  return (
    <>
      <SceneLights />
      {units.map((unit, i) => {
        const y = i * unit.height + unit.height / 2 - centerOffset
        const isSel = selectedIdx === i
        const isHov = hov === i
        const halfBump = isSel ? 1.22 : isHov ? 1.08 : 1
        const side = CUBE_HALF * 2 * halfBump
        const unitIsEmpty = unit.hasData === false
        return (
          <mesh
            key={unit.name || i}
            position={[0, y, 0]}
            castShadow
            receiveShadow
            onDoubleClick={(e) => { e.stopPropagation(); onPickUnit?.(i) }}
            onPointerOver={(e) => { e.stopPropagation(); setHov(i) }}
            onPointerOut={() => setHov(null)}
          >
            <boxGeometry args={[side, unit.height * 0.98, side]} />
            {unitIsEmpty ? <IceMat /> : <MatteMat color={masteryStep(unit.mastery, stops)} />}
          </mesh>
        )
      })}
    </>
  )
}

function MatteCubeDisk({ unit, unitHeight, palette, selectedRingCode, onPickRing }) {
  const [hov, setHov] = useState(null)
  const rings = unit?.rings || []
  const stops = palette.stops
  return (
    <>
      <SceneLights />
      <group rotation={[-0.62, 0.48, 0.06]}>
        {rings.map((ring, i) => {
          const isSel = selectedRingCode && ring.code === selectedRingCode
          const isHov = hov === i
          const hBump = isSel ? 1.5 : isHov ? 1.08 : 1
          return (
            <SquareFrameMatte
              key={ring.code || i}
              innerHalf={ring.innerR}
              outerHalf={ring.outerR}
              height={unitHeight * hBump}
              color={masteryStep(ring.mastery, stops)}
              isEmpty={ring.hasData === false}
              onDoubleClick={(e) => { e.stopPropagation(); onPickRing?.(ring) }}
              onPointerOver={(e) => { e.stopPropagation(); setHov(i) }}
              onPointerOut={() => setHov(null)}
            />
          )
        })}
      </group>
    </>
  )
}

function MatteCubeRing({ ring, ringHeight, palette, activeArcId, onPickArc }) {
  const [hov, setHov] = useState(null)
  const stops = palette.stops
  const arcData = useMemo(() => {
    let fraction = 0
    return (ring?.arcs || []).map((arc) => {
      const startFraction = fraction
      const lenFraction = Math.max(0.01, arc.angleFraction || 1 / Math.max(1, ring.arcs.length))
      fraction += lenFraction
      return { ...arc, startFraction, lenFraction }
    })
  }, [ring?.arcs])
  return (
    <>
      <SceneLights />
      <group rotation={[-0.58, 0.52, 0.08]}>
        {arcData.map((arc, i) => {
          const isSel = activeArcId && arc.questionTypeId === activeArcId
          const isHov = hov === i
          const hBump = isSel ? 1.5 : isHov ? 1.08 : 1
          return (
            <SquarePerimeterMatte
              key={arc.questionTypeId || i}
              innerHalf={ring.innerR}
              outerHalf={ring.outerR}
              height={ringHeight * hBump}
              startFraction={arc.startFraction}
              fraction={arc.lenFraction}
              color={masteryStep(arc.mastery, stops)}
              isEmpty={arc.hasData === false}
              onDoubleClick={(e) => { e.stopPropagation(); onPickArc?.(arc) }}
              onPointerOver={(e) => { e.stopPropagation(); setHov(i) }}
              onPointerOut={() => setHov(null)}
            />
          )
        })}
      </group>
    </>
  )
}

function MatteCubeArcFocus({ ring, arc, ringHeight, palette, sliceIndex, totalSlices, onPickSlice }) {
  const [hov, setHov] = useState(null)
  const arcData = useMemo(() => {
    if (!ring?.arcs || !arc) return { startFraction: 0, lenFraction: Math.max(0.01, arc?.angleFraction || 0.25) }
    let fraction = 0
    const list = ring.arcs.map((a) => {
      const startFraction = fraction
      const lenFraction = Math.max(0.01, a.angleFraction || 1 / Math.max(1, ring.arcs.length))
      fraction += lenFraction
      return { ...a, startFraction, lenFraction }
    })
    return list.find((a) => a.questionTypeId === arc.questionTypeId) || { startFraction: 0, lenFraction: Math.max(0.01, arc.angleFraction || 0.25) }
  }, [ring?.arcs, arc?.questionTypeId, arc?.angleFraction])
  if (!ring || !arc) return null
  const stops = palette.stops
  const color = masteryStep(arc.mastery, stops)
  const arcIsEmpty = arc.hasData === false
  const n = Number.isInteger(totalSlices) && totalSlices > 0 ? totalSlices : 1
  const sliceH = ringHeight / n
  const safeIdx = Number.isInteger(sliceIndex) ? Math.max(0, Math.min(n - 1, sliceIndex)) : -1
  return (
    <>
      <SceneLights />
      <group rotation={ARC_SCENE_ROTATION}>
        {Array.from({ length: n }).map((_, idx) => {
          const isSel = idx === safeIdx
          const isHov = hov === idx
          const bump = isSel ? 1.5 : isHov ? 1.08 : 1
          const y = ringHeight * (2 * idx + 1 - n) / (2 * n)
          return (
            <SquarePerimeterMatte
              key={idx}
              innerHalf={ring.innerR}
              outerHalf={ring.outerR}
              height={sliceH * bump}
              startFraction={arcData.startFraction}
              fraction={arcData.lenFraction}
              offsetY={y}
              color={color}
              isEmpty={arcIsEmpty}
              onDoubleClick={(e) => { e.stopPropagation(); onPickSlice?.(idx) }}
              onPointerOver={(e) => { e.stopPropagation(); setHov(idx) }}
              onPointerOut={() => setHov(null)}
            />
          )
        })}
      </group>
    </>
  )
}

function MatteArcFocus({ ring, arc, ringHeight, palette, sliceIndex, totalSlices, onPickSlice }) {
  const [hov, setHov] = useState(null)
  if (!ring || !arc) return null
  const stops = palette.stops
  const color = masteryStep(arc.mastery, stops)
  const arcIsEmpty = arc.hasData === false
  const n = Number.isInteger(totalSlices) && totalSlices > 0 ? totalSlices : 1
  const sliceH = ringHeight / n
  const safeIdx = Number.isInteger(sliceIndex) ? Math.max(0, Math.min(n - 1, sliceIndex)) : -1
  return (
    <>
      <SceneLights />
      <group rotation={ARC_SCENE_ROTATION}>
        {Array.from({ length: n }).map((_, idx) => {
          const isSel = idx === safeIdx
          const isHov = hov === idx
          const bump = isSel ? 1.5 : isHov ? 1.08 : 1
          const y = ringHeight * (2 * idx + 1 - n) / (2 * n)
          return (
            <ArcWasher
              key={idx}
              innerR={ring.innerR}
              outerR={ring.outerR}
              height={sliceH * bump}
              thetaStart={arc.start}
              thetaLen={arc.len}
              offsetY={y}
              color={color}
              isEmpty={arcIsEmpty}
              onDoubleClick={(e) => { e.stopPropagation(); onPickSlice?.(idx) }}
              onPointerOver={(e) => { e.stopPropagation(); setHov(idx) }}
              onPointerOut={() => setHov(null)}
            />
          )
        })}
      </group>
    </>
  )
}

function PanelCanvas({ children, cameraSpec, target = ZERO_TARGET, minDist = 0.8, maxDist = 8, animateKey, fov = 36, onPointerMissed }) {
  const initialPos = useMemo(() => {
    const tgt = target || ZERO_TARGET
    const startPhi = cameraSpec?.startPhi ?? cameraSpec?.phi ?? 1.02
    const radius = cameraSpec?.radius ?? 6
    const theta = cameraSpec?.theta ?? 0
    const sinPhi = Math.sin(startPhi)
    return [
      (tgt[0] || 0) + radius * sinPhi * Math.cos(theta),
      (tgt[1] || 0) + radius * Math.cos(startPhi),
      (tgt[2] || 0) + radius * sinPhi * Math.sin(theta),
    ]
  }, [cameraSpec, target])
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 2]}
      camera={{ position: initialPos, fov }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%" }}
      onPointerMissed={onPointerMissed}
    >
      {children}
      {cameraSpec && (
        <AnimatedOrbitControls
          cameraSpec={cameraSpec}
          target={target || ZERO_TARGET}
          minDistance={minDist}
          maxDistance={maxDist}
          enablePan={false}
          animateKey={animateKey}
        />
      )}
    </Canvas>
  )
}

function subjectCamR(shapeMode) {
  if (shapeMode === "torus") return TORUS_MAJOR_R
  if (shapeMode === "cube") return CUBE_HALF
  return CYL_R
}

function unitCamR(unit, shapeMode) {
  if (shapeMode === "torus") return TORUS_MAJOR_R
  if (shapeMode === "cube") return CUBE_HALF
  return Math.max(0.12, unit?.diskRadius || CYL_R)
}

function midR(ring, shapeMode) {
  if (shapeMode === "torus") return TORUS_MAJOR_R
  const base = shapeMode === "cube" ? CUBE_HALF : CYL_R
  const outer = ring?.outerR ?? base
  const inner = ring?.innerR ?? 0
  return Math.max(0.12, (outer + inner) / 2)
}

function subjectCamDist(shapeMode) {
  const mult = (shapeMode === "cube" || shapeMode === "torus") ? 4 : 7
  return subjectCamR(shapeMode) * mult
}

function unitCamDist(unit, shapeMode) {
  const mult = (shapeMode === "cube" || shapeMode === "torus") ? 4 : 7
  return unitCamR(unit, shapeMode) * mult
}

function loCamDist(ring, shapeMode) {
  return midR(ring, shapeMode) * 4
}

function torusUnitTarget(unit) {
  if (!unit) return ZERO_TARGET
  return torusSegmentMidpoint({
    majorRadius: TORUS_MAJOR_R,
    innerTubeRadius: 0,
    outerTubeRadius: TORUS_TUBE_R,
    thetaStart: -(unit.torusThetaLen || Math.PI * 2) / 2,
    thetaLen: unit.torusThetaLen || Math.PI * 2,
  })
}

function torusRingTarget(ring) {
  if (!ring) return ZERO_TARGET
  return torusSegmentMidpoint({
    majorRadius: ring.torusMajorRadius || TORUS_MAJOR_R,
    innerTubeRadius: ring.torusInnerTubeRadius || 0,
    outerTubeRadius: ring.torusOuterTubeRadius || TORUS_TUBE_R,
    thetaStart: -((ring.torusThetaLen || Math.PI * 2) / 2),
    thetaLen: ring.torusThetaLen || Math.PI * 2,
  })
}

function torusArcTarget(ring, arc) {
  if (!ring || !arc) return ZERO_TARGET
  return torusSegmentMidpoint({
    majorRadius: ring.torusMajorRadius || TORUS_MAJOR_R,
    innerTubeRadius: ring.torusInnerTubeRadius || 0,
    outerTubeRadius: ring.torusOuterTubeRadius || TORUS_TUBE_R,
    thetaStart: -((ring.torusThetaLen || Math.PI * 2) / 2),
    thetaLen: ring.torusThetaLen || Math.PI * 2,
    phiStart: arc.phiStart ?? arc.start ?? 0,
    phiLen: arc.phiLen ?? arc.len ?? Math.PI * 2,
  })
}

function cylArcTarget(ring, arc) {
  if (!ring || !arc) return ZERO_TARGET
  const r = midR(ring, "cylinder")
  const thetaMid = (arc.start ?? 0) + (arc.len ?? Math.PI * 2) / 2
  return rotatePoint([r * Math.cos(thetaMid), 0, r * Math.sin(thetaMid)], ARC_SCENE_ROTATION)
}

function cubeArcTarget(ring, arc) {
  if (!ring || !arc) return ZERO_TARGET
  const r = midR(ring, "cube")
  const thetaMid = (arc.start ?? 0) + (arc.len ?? Math.PI * 2) / 2
  return rotatePoint([r * Math.cos(thetaMid), 0, r * Math.sin(thetaMid)], ARC_SCENE_ROTATION)
}

export function StackPanel({ shapeMode = "cylinder", units, totalHeight, palette, selectedIdx, onDrillUnit, onPointerMissed }) {
  const p = resolveShapePalette(palette)
  const isCube = shapeMode === "cube"
  const isTorus = shapeMode === "torus"
  const dist = subjectCamDist(shapeMode)
  const cameraSpec = useMemo(
    () => buildCameraSpec(dist, `panel:${shapeMode}:stack:${units.length}`),
    [shapeMode, units.length, dist]
  )
  return (
    <PanelCanvas
      cameraSpec={cameraSpec}
      target={ZERO_TARGET}
      minDist={3.1}
      maxDist={Math.max(12, totalHeight * 3.8 + 8.2)}
      animateKey={`panel-stack-${shapeMode}-${units.length}`}
      onPointerMissed={onPointerMissed}
    >
      {isCube ? (
        <MatteCubeSubject
          units={units}
          totalHeight={totalHeight}
          palette={p}
          selectedIdx={selectedIdx ?? null}
          onPickUnit={onDrillUnit}
        />
      ) : isTorus ? (
        <MatteTorusSubject
          units={units}
          palette={p}
          selectedIdx={selectedIdx ?? null}
          onPickUnit={onDrillUnit}
        />
      ) : (
        <MatteCylinderStack
          units={units}
          totalHeight={totalHeight}
          palette={p}
          selectedIdx={selectedIdx}
          onPickUnit={onDrillUnit}
        />
      )}
    </PanelCanvas>
  )
}

export function DiskPanel({ shapeMode = "cylinder", unit, unitHeight, palette, selectedRingCode, onDrillRing, onPointerMissed }) {
  if (!unit) return null
  const p = resolveShapePalette(palette)
  const isCube = shapeMode === "cube"
  const isTorus = shapeMode === "torus"
  const dist = unitCamDist(unit, shapeMode)
  const cameraSpec = useMemo(
    () => buildCameraSpec(dist, `panel:${shapeMode}:unit:${unit.name || "unit"}`),
    [shapeMode, dist, unit?.name]
  )
  const target = isTorus ? torusUnitTarget(unit) : ZERO_TARGET
  return (
    <PanelCanvas
      cameraSpec={cameraSpec}
      target={target}
      minDist={0.8}
      maxDist={3.5}
      animateKey={`panel-disk-${shapeMode}-${unit?.name || "none"}`}
      onPointerMissed={onPointerMissed}
    >
      {isCube ? (
        <MatteCubeDisk
          unit={unit}
          unitHeight={unitHeight}
          palette={p}
          selectedRingCode={selectedRingCode || ""}
          onPickRing={onDrillRing}
        />
      ) : isTorus ? (
        <MatteTorusUnit
          unit={unit}
          palette={p}
          selectedRingCode={selectedRingCode || ""}
          onPickRing={onDrillRing}
        />
      ) : (
        <MatteDiskScene
          unit={unit}
          unitHeight={unitHeight}
          palette={p}
          selectedRingCode={selectedRingCode}
          onPickRing={onDrillRing}
        />
      )}
    </PanelCanvas>
  )
}

export function RingPanel({ shapeMode = "cylinder", ring, ringHeight, palette, activeArc, onDrillArc, onPointerMissed }) {
  if (!ring || !ring.arcs?.length) return null
  const p = resolveShapePalette(palette)
  const isCube = shapeMode === "cube"
  const isTorus = shapeMode === "torus"
  const dist = loCamDist(ring, shapeMode)
  const cameraSpec = useMemo(
    () => buildCameraSpec(dist, `panel:${shapeMode}:lo:${ring.code || ring.name || "lo"}`),
    [shapeMode, dist, ring?.code, ring?.name]
  )
  const activeArcId = activeArc?.questionTypeId || ""
  const target = isTorus ? torusRingTarget(ring) : ZERO_TARGET
  return (
    <PanelCanvas
      cameraSpec={cameraSpec}
      target={target}
      minDist={0.8}
      maxDist={3.5}
      animateKey={`panel-ring-${shapeMode}-${ring?.code || "none"}`}
      onPointerMissed={onPointerMissed}
    >
      {isCube ? (
        <MatteCubeRing
          ring={ring}
          ringHeight={ringHeight}
          palette={p}
          activeArcId={activeArcId}
          onPickArc={onDrillArc}
        />
      ) : isTorus ? (
        <MatteTorusRing
          ring={ring}
          palette={p}
          activeArcId={activeArcId}
          onPickArc={onDrillArc}
        />
      ) : (
        <MatteRingScene
          ring={ring}
          ringHeight={ringHeight}
          palette={p}
          activeArcId={activeArcId}
          onPickArc={onDrillArc}
        />
      )}
    </PanelCanvas>
  )
}

function buildArcStartLen(ring, arcId) {
  if (!ring?.arcs?.length || !arcId) return null
  let a = -Math.PI / 2
  let fraction = 0
  for (const arc of ring.arcs) {
    const start = a
    const lenFraction = Math.max(0.01, arc.angleFraction || 1 / ring.arcs.length)
    const len = lenFraction * Math.PI * 2
    const startFraction = fraction
    a += len
    fraction += lenFraction
    if (arc.questionTypeId === arcId) return { ...arc, start, len, startFraction, lenFraction }
  }
  return null
}

export function ArcPanel({ shapeMode = "cylinder", ring, arcId, ringHeight, palette, onDrillQuestion, onPointerMissed }) {
  if (!ring || !arcId) return null
  const arc = useMemo(() => buildArcStartLen(ring, arcId), [ring, arcId])
  if (!arc) return null
  const p = resolveShapePalette(palette)
  const isCube = shapeMode === "cube"
  const isTorus = shapeMode === "torus"
  const dist = loCamDist(ring, shapeMode)
  const total = Math.max(1, arc.questions?.length || arc.total || 1)
  const cameraSpec = useMemo(
    () => buildCameraSpec(dist, `panel:${shapeMode}:qt:${arc.questionTypeId || arc.type || "qt"}`),
    [shapeMode, dist, arc?.questionTypeId, arc?.type]
  )
  const target = isTorus ? torusArcTarget(ring, arc) : isCube ? cubeArcTarget(ring, arc) : cylArcTarget(ring, arc)
  const handlePickSlice = (idx) => { onDrillQuestion?.({ index: idx }) }
  return (
    <PanelCanvas
      cameraSpec={cameraSpec}
      target={target}
      minDist={0.8}
      maxDist={3.5}
      animateKey={`panel-arc-${shapeMode}-${arc.questionTypeId || "none"}`}
      onPointerMissed={onPointerMissed}
    >
      {isTorus ? (
        <MatteTorusArcFocus ring={ring} arc={arc} palette={p} totalSlices={total} onPickSlice={handlePickSlice} />
      ) : isCube ? (
        <MatteCubeArcFocus ring={ring} arc={arc} ringHeight={ringHeight} palette={p} totalSlices={total} onPickSlice={handlePickSlice} />
      ) : (
        <MatteArcFocus ring={ring} arc={arc} ringHeight={ringHeight} palette={p} totalSlices={total} onPickSlice={handlePickSlice} />
      )}
    </PanelCanvas>
  )
}

export function QuestionPanel({ shapeMode = "cylinder", ring, arcId, questionIdx, ringHeight, palette, onDrillQuestion, onPointerMissed }) {
  if (!ring || !arcId) return null
  const arc = useMemo(() => buildArcStartLen(ring, arcId), [ring, arcId])
  if (!arc) return null
  const p = resolveShapePalette(palette)
  const isCube = shapeMode === "cube"
  const isTorus = shapeMode === "torus"
  const total = Math.max(1, arc.questions?.length || arc.total || 1)
  const safeIdx = Number.isInteger(questionIdx) ? Math.max(0, Math.min(total - 1, questionIdx)) : 0
  const dist = loCamDist(ring, shapeMode)
  const cameraSpec = useMemo(
    () => buildCameraSpec(dist, `panel:${shapeMode}:q:${arc.questionTypeId || "q"}`),
    [shapeMode, dist, arc?.questionTypeId]
  )
  const target = isTorus ? torusArcTarget(ring, arc) : isCube ? cubeArcTarget(ring, arc) : cylArcTarget(ring, arc)
  const handlePickSlice = (idx) => { onDrillQuestion?.({ index: idx }) }
  return (
    <PanelCanvas
      cameraSpec={cameraSpec}
      target={target}
      minDist={0.8}
      maxDist={3.5}
      animateKey={`panel-q-${shapeMode}-${arc.questionTypeId || "none"}`}
      onPointerMissed={onPointerMissed}
    >
      {isTorus ? (
        <MatteTorusArcFocus ring={ring} arc={arc} palette={p} sliceIndex={safeIdx} totalSlices={total} onPickSlice={handlePickSlice} />
      ) : isCube ? (
        <MatteCubeArcFocus ring={ring} arc={arc} ringHeight={ringHeight} palette={p} sliceIndex={safeIdx} totalSlices={total} onPickSlice={handlePickSlice} />
      ) : (
        <MatteArcFocus ring={ring} arc={arc} ringHeight={ringHeight} palette={p} sliceIndex={safeIdx} totalSlices={total} onPickSlice={handlePickSlice} />
      )}
    </PanelCanvas>
  )
}

export function normalizeUnitsForScenes(units, shapeMode = "cylinder") {
  const list = Array.isArray(units) ? units : []
  const sceneScale = DISPLAY_CYLINDER_HEIGHT / TOTAL_CYLINDER_HEIGHT
  const isCube = shapeMode === "cube"
  const cubeSideLength = CUBE_HALF * 2
  const unitCount = Math.max(1, list.length || 1)
  const cylinderUnitHeight = (list.length ? TOTAL_CYLINDER_HEIGHT / list.length : TOTAL_CYLINDER_HEIGHT) * sceneScale
  const cubeUnitHeight = cubeSideLength / unitCount
  const unitHeight = isCube ? cubeUnitHeight : cylinderUnitHeight
  const diskRadius = isCube ? CUBE_HALF * 0.86 : CYL_R * 0.68
  const out = list.map((unit, unitIdx) => {
    const rings = Array.isArray(unit?.rings) ? unit.rings : []
    const ringCount = Math.max(1, rings.length)
    const torusThetaLen = (Math.PI * 2) / unitCount
    const torusThetaStart = unitIdx * torusThetaLen
    const normRings = rings.map((ring, idx) => {
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
      rings: normRings,
    }
  })
  const totalHeight = isCube ? cubeSideLength : Math.max(1, out.length * unitHeight)
  return {
    units: out,
    unitHeight,
    totalHeight,
    secondaryHeight: unitHeight * SECONDARY_HEIGHT_SCALE,
  }
}
