import { useMemo, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { Html, Line, OrbitControls } from "@react-three/drei"
import styles from "../styles/Dashboard.module.css"

const PALETTE = ["#4f78ca", "#74a3b5", "#8f7ec4", "#6d8fd8", "#c9a84c", "#b45f55", "#5f6fb2", "#95a7d8"]

const GLITCH_CSS = `
@keyframes callout-glitch {
  0%, 87%, 100% { opacity: 1; transform: translate(0,0); clip-path: none; filter: none; }
  88%  { opacity: 0.35; transform: translate(3px, 0);   clip-path: inset(25% 0 45% 0); filter: hue-rotate(40deg); }
  89%  { opacity: 1;    transform: translate(0, 0);     clip-path: none; filter: none; }
  90%  { opacity: 0.5;  transform: translate(-2px, 1px); clip-path: inset(60% 0 8% 0); filter: hue-rotate(-30deg); }
  91%  { opacity: 1;    transform: translate(0, 0);     clip-path: none; filter: none; }
  93%  { opacity: 0.65; transform: translate(1px, -1px); }
  94%  { opacity: 1; }
}
.slice-callout { animation: callout-glitch 5s infinite; }
`

function short(text, max = 74) {
  if (!text) return ""
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function SliceCallout({ label, percent, description, angle, delay = 0 }) {
  const ax = Math.cos(angle) * 1.22
  const az = Math.sin(angle) * 1.22
  const lx = Math.cos(angle) * 1.9
  const lz = Math.sin(angle) * 1.9

  return (
    <group>
      <Line
        points={[
          [ax, 0.56, az],
          [lx, 1.05, lz],
        ]}
        color="#d9e6ff"
        lineWidth={1.3}
        transparent
        opacity={0.92}
      />
      <mesh position={[ax, 0.56, az]}>
        <sphereGeometry args={[0.022, 16, 16]} />
        <meshStandardMaterial color="#d9e6ff" emissive="#5f86d8" emissiveIntensity={0.2} />
      </mesh>
      <Html position={[lx, 1.12, lz]} center>
        <style>{GLITCH_CSS}</style>
        <div
          className="slice-callout"
          style={{
            width: 170,
            borderRadius: 10,
            border: "1px solid rgba(84,112,168,0.45)",
            background: "rgba(15,20,32,0.9)",
            color: "#dfe8ff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
            padding: "8px 10px",
            fontFamily: "'DM Sans', sans-serif",
            animationDelay: `${delay}s`,
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9eb6e6", marginBottom: 4 }}>
            {percent}%
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>↘ {label}</div>
          <div style={{ fontSize: 11, lineHeight: 1.35, color: "#b7c7ea" }}>{short(description || label)}</div>
        </div>
      </Html>
    </group>
  )
}

export default function LoCylinderPie3D({ title, items }) {
  const [hovered, setHovered] = useState(null)

  const prepared = useMemo(() => {
    const maxSlices = 6
    const safe = Array.isArray(items) ? items : []
    const rows = safe.slice(0, maxSlices)
    const other = safe.slice(maxSlices)
    if (other.length) {
      rows.push({
        label: "Other",
        description: "Combined low-frequency learning objectives.",
        value: other.reduce((sum, item) => sum + (item.value || 0), 0),
      })
    }

    const total = rows.reduce((sum, r) => sum + (r.value || 0), 0)
    if (!total) return { total: 0, slices: [] }

    let cumulative = 0
    const slices = rows.map((row, idx) => {
      const start = (cumulative / total) * Math.PI * 2
      cumulative += row.value
      const end = (cumulative / total) * Math.PI * 2
      const mid = (start + end) / 2
      return {
        ...row,
        color: PALETTE[idx % PALETTE.length],
        start: start - Math.PI / 2,
        length: end - start,
        mid: mid - Math.PI / 2,
        percent: ((row.value / total) * 100).toFixed(1),
      }
    })

    return { total, slices }
  }, [items])

  if (!prepared.total) {
    return (
      <div className={styles.pieCard}>
        <div className={styles.pieTitle}>{title}</div>
        <div className={styles.pieBody} style={{ placeItems: "center" }}>
          <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", lineHeight: 1.6, padding: 10 }}>
            No data yet.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pieCard}>
      <div className={styles.pieTitle}>{title}</div>
      <div className={styles.pieBody}>
        <div className={styles.lo3dWrap}>
          <Canvas frameloop="demand" camera={{ position: [0, 2.3, 3.4], fov: 42 }}>
            <color attach="background" args={["#0f1420"]} />
            <ambientLight intensity={0.9} />
            <directionalLight position={[3, 5, 4]} intensity={1.1} />
            <directionalLight position={[-4, 3, -2]} intensity={0.45} color="#8fb2ff" />

            {prepared.slices.map((slice, idx) => {
              const isHover = hovered === idx
              return (
                <group key={`${slice.label}-${idx}`}>
                  <mesh
                    position={[0, isHover ? 0.07 : 0, 0]}
                    onPointerOver={(e) => {
                      e.stopPropagation()
                      setHovered(idx)
                    }}
                    onPointerOut={() => setHovered(null)}
                  >
                    <cylinderGeometry args={[1, 1, 0.52, 56, 1, false, slice.start, slice.length]} />
                    <meshStandardMaterial color={slice.color} roughness={0.45} metalness={0.2} emissive={slice.color} emissiveIntensity={isHover ? 0.22 : 0.1} />
                  </mesh>
                  <SliceCallout
                    label={slice.label}
                    percent={slice.percent}
                    description={slice.description}
                    angle={slice.mid}
                    delay={idx * 0.7}
                  />
                </group>
              )
            })}

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.27, 0]}>
              <circleGeometry args={[1.15, 64]} />
              <meshStandardMaterial color="#1a2234" roughness={0.95} metalness={0.04} />
            </mesh>

            <OrbitControls enablePan={false} enableZoom minDistance={2.1} maxDistance={6.5} maxPolarAngle={Math.PI * 0.49} minPolarAngle={Math.PI * 0.18} />
          </Canvas>
        </div>

        <div className={styles.pieLegend}>
          {prepared.slices.map((s, i) => (
            <div key={`${s.label}-${i}`} className={styles.pieLegendRow}>
              <div className={styles.pieLegendLeft}>
                <span className={styles.pieDot} style={{ background: s.color }} />
                <span className={styles.pieLegendLabel}>{s.label}</span>
              </div>
              <span className={styles.pieLegendPct}>{s.percent}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
