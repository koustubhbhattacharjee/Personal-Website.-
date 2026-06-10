import styles from "../styles/DrillBreadcrumbs.module.css"

function truncate(str, max = 48) {
  const s = String(str || "").trim()
  if (s.length <= max) return s
  return s.slice(0, max - 1) + "…"
}

export default function DrillBreadcrumbs({
  units = [],
  unitIdx = null,
  loIdx = null,
  qtIdx = null,
  qIdx = null,
  onUnit,
  onLo,
  onQt,
  onQ,
  shapeMode = "cylinder",
  className = "",
  barColor = "",
}) {
  const barStyle = barColor
    ? { background: barColor, borderTopColor: barColor, borderBottomColor: barColor }
    : undefined
  const unitIdxSafe = unitIdx != null && units.length ? Math.min(unitIdx, units.length - 1) : null
  const unit = unitIdxSafe != null ? units[unitIdxSafe] : null
  const loList = unit?.rings || []
  const loIdxSafe = loIdx != null && loList.length ? Math.min(loIdx, loList.length - 1) : null
  const lo = loIdxSafe != null ? loList[loIdxSafe] : null
  const arcList = lo?.arcs || []
  const qtIdxSafe = qtIdx != null && arcList.length ? Math.min(qtIdx, arcList.length - 1) : null
  const arc = qtIdxSafe != null ? arcList[qtIdxSafe] : null
  const questions = Array.isArray(arc?.questions) ? arc.questions : []

  const loLabel = shapeMode === "cube" ? "Section" : "Learning Objective"

  const handle = (cb) => (e) => {
    const v = e.target.value
    if (v === "") { cb?.(null); return }
    const n = Number(v)
    if (Number.isFinite(n)) cb?.(n)
  }

  return (
    <div className={`${styles.bar} ${className}`} style={barStyle}>
      <div className={styles.group}>
        <span className={styles.label}>Unit</span>
        <div className={styles.selectWrap}>
          <select
            className={styles.select}
            value={unitIdxSafe ?? ""}
            onChange={handle(onUnit)}
            disabled={!units.length}
          >
            <option value="">All units</option>
            {units.map((u, i) => (
              <option key={i} value={i}>{truncate(u?.name || `Unit ${i + 1}`)}</option>
            ))}
          </select>
          <span className={styles.caret} aria-hidden="true">▾</span>
        </div>
      </div>

      <span className={styles.sep} aria-hidden="true">/</span>

      <div className={styles.group}>
        <span className={styles.label}>{loLabel}</span>
        <div className={styles.selectWrap}>
          <select
            className={styles.select}
            value={loIdxSafe ?? ""}
            onChange={handle(onLo)}
            disabled={!loList.length}
          >
            <option value="">All</option>
            {loList.map((r, i) => (
              <option key={i} value={i}>{truncate(r?.name || r?.code || `LO ${i + 1}`)}</option>
            ))}
          </select>
          <span className={styles.caret} aria-hidden="true">▾</span>
        </div>
      </div>

      <span className={styles.sep} aria-hidden="true">/</span>

      <div className={styles.group}>
        <span className={styles.label}>Question Type</span>
        <div className={styles.selectWrap}>
          <select
            className={styles.select}
            value={qtIdxSafe ?? ""}
            onChange={handle(onQt)}
            disabled={!arcList.length}
          >
            <option value="">All</option>
            {arcList.map((a, i) => (
              <option key={i} value={i}>{truncate(a?.type || a?.name || `QT ${i + 1}`)}</option>
            ))}
          </select>
          <span className={styles.caret} aria-hidden="true">▾</span>
        </div>
      </div>

      <span className={styles.sep} aria-hidden="true">/</span>

      <div className={styles.group}>
        <span className={styles.label}>Question</span>
        <div className={styles.selectWrap}>
          <select
            className={styles.select}
            value={qIdx != null ? qIdx : ""}
            onChange={handle(onQ)}
            disabled={!questions.length}
          >
            <option value="">All</option>
            {questions.map((_, i) => (
              <option key={i} value={i}>{String(i + 1).padStart(2, "0")}</option>
            ))}
          </select>
          <span className={styles.caret} aria-hidden="true">▾</span>
        </div>
      </div>
    </div>
  )
}
