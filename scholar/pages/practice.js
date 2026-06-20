import { useSession, signIn } from "next-auth/react"
import { useRouter } from "next/router"
import { useEffect, useState, useRef } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import Head from "next/head"
import { buildCylinderData } from "../lib/cylinder-data"
import { getAllObjectives } from "../lib/district-taxonomy"
import ExcalidrawDock from "../components/ExcalidrawDock"
import MathText from "../components/MathText"
import QuestionPane from "../components/QuestionPane"
import DrillBreadcrumbs from "../components/DrillBreadcrumbs"
import { normalizeUnitsForScenes } from "../components/CylinderPanels"
import { findNext, findPrev, nextLabelFor, prevLabelFor, findNextArc, findPrevArc, nextArcLabelFor, prevArcLabelFor } from "../lib/practice-nav"
import styles from "../styles/Practice.module.css"

const StackPanel = dynamic(() => import("../components/CylinderPanels").then(m => m.StackPanel), { ssr: false })
const DiskPanel = dynamic(() => import("../components/CylinderPanels").then(m => m.DiskPanel), { ssr: false })
const RingPanel = dynamic(() => import("../components/CylinderPanels").then(m => m.RingPanel), { ssr: false })
const ArcPanel = dynamic(() => import("../components/CylinderPanels").then(m => m.ArcPanel), { ssr: false })
const QuestionPanel = dynamic(() => import("../components/CylinderPanels").then(m => m.QuestionPanel), { ssr: false })

const SHAPE_MODES = [
  { key: "cylinder", label: "Cylinder" },
  { key: "torus",    label: "Torus" },
  { key: "cube",     label: "Bar" },
]
const SHAPE_PALETTE_KEYS = ["ember", "sunset", "ocean", "midnight", "royal", "forest"]
const SHAPE_PALETTE_STOPS = {
  ember:    ["#6b1016", "#b3342a", "#e7613a", "#f2a96a"],
  sunset:   ["#e7614b", "#f08b5f", "#f5b56a", "#fad884"],
  ocean:    ["#0b3a4a", "#176b7a", "#3aa8b0", "#9fe0df"],
  midnight: ["#0b0f2a", "#1b2257", "#4142a3", "#8a82d9"],
  royal:    ["#2a0f4a", "#5f1e88", "#a347b7", "#e69adf"],
  forest:   ["#203a1e", "#3a6b34", "#6fa23e", "#bddc67"],
}
const DASHBOARD_SHAPE_MODE_STORAGE_KEY = "scholar-dashboard-shape-mode"
const DASHBOARD_PALETTE_STORAGE_KEY = "scholar-dashboard-palette"

export default function PracticePage() {
  const router = useRouter()
  const { status } = useSession()
  // showcase/demo bypass (capture-only): mirror the dashboard so the practice room
  // renders from the showcase cookie without a Google session
  const demoMode = String(router.query.demo || "") === "1"
  const subjectId = String(router.query.subjectId || "")
  const asStudentId = String(router.query.as || "")

  const [subject, setSubject] = useState(null)
  const [student, setStudent] = useState(null)
  const [questionTypes, setQuestionTypes] = useState([])
  const [loadError, setLoadError] = useState("")
  const [dataReady, setDataReady] = useState(false)
  const [shapeMode, setShapeMode] = useState("cylinder")
  const [paletteOverride, setPaletteOverride] = useState(null)
  const [drillUnitIdx, setDrillUnitIdx] = useState(null)
  const [drillLoIdx, setDrillLoIdx] = useState(null)
  const [drillQtypeIdx, setDrillQtypeIdx] = useState(null)
  const [drillQuestionIdx, setDrillQuestionIdx] = useState(null)
  const [scratchOpen, setScratchOpen] = useState(false)
  const practiceExcalidrawApiRef = useRef(null)
  const [practiceScratchHasContent, setPracticeScratchHasContent] = useState(false)
  const [questionLocks, setQuestionLocks] = useState({})
  // showcase objectives come from the progress-graph response (the showcase state
  // has no district taxonomy), mirroring the dashboard
  const [showcaseTaxonomy, setShowcaseTaxonomy] = useState(null)

  useEffect(() => {
    if (!demoMode && status === "unauthenticated") {
      const callbackUrl = typeof window !== "undefined" ? window.location.href : "/practice"
      signIn("google", { callbackUrl })
    }
  }, [status, demoMode])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const saved = localStorage.getItem(DASHBOARD_SHAPE_MODE_STORAGE_KEY)
      if (saved === "cube" || saved === "cylinder" || saved === "torus") setShapeMode(saved)
    } catch {}
  }, [])
  useEffect(() => {
    if (typeof window === "undefined") return
    try { localStorage.setItem(DASHBOARD_SHAPE_MODE_STORAGE_KEY, shapeMode) } catch {}
  }, [shapeMode])
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const saved = localStorage.getItem(DASHBOARD_PALETTE_STORAGE_KEY)
      if (SHAPE_PALETTE_KEYS.includes(saved)) setPaletteOverride(saved)
    } catch {}
  }, [])
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      if (paletteOverride) localStorage.setItem(DASHBOARD_PALETTE_STORAGE_KEY, paletteOverride)
      else localStorage.removeItem(DASHBOARD_PALETTE_STORAGE_KEY)
    } catch {}
  }, [paletteOverride])

  useEffect(() => {
    if ((!demoMode && status !== "authenticated") || !subjectId) return
    let cancelled = false
    setDataReady(false)
    setLoadError("")
    async function load() {
      try {
        const asParam = asStudentId ? `&as=${encodeURIComponent(asStudentId)}` : ""
        // showcase APIs gate on ?demo=1 (+ the showcase cookie); forward it so the
        // practice room loads showcase data without a Google session (capture-only)
        const demoParam = demoMode ? "&demo=1&showcase=1" : ""
        const dashUrl = `/api/student/dashboard?_dash=1${asStudentId ? `&as=${encodeURIComponent(asStudentId)}` : ""}${demoParam}`
        const graphUrl = `/api/student/progress-graph?subjectId=${encodeURIComponent(subjectId)}${asParam}${demoParam}&_=${Date.now()}`
        const [dashRes, graphRes] = await Promise.all([
          fetch(dashUrl, { cache: "no-store" }),
          fetch(graphUrl, { cache: "no-store" }),
        ])
        if (!dashRes.ok) throw new Error(`Dashboard load failed (${dashRes.status})`)
        if (!graphRes.ok) throw new Error(`Progress graph load failed (${graphRes.status})`)
        const dash = await dashRes.json().catch(() => ({}))
        const graph = await graphRes.json().catch(() => ({}))
        if (cancelled) return
        const sub = (dash?.subjects || []).find((s) => s.id === subjectId) || null
        setSubject(sub)
        setStudent(dash?.student || null)
        setQuestionTypes(Array.isArray(graph?.questionTypes) ? graph.questionTypes : [])
        setShowcaseTaxonomy(Array.isArray(graph?.taxonomy) && graph.taxonomy.length ? graph.taxonomy : null)
        setQuestionLocks(graph?.questionLocks && typeof graph.questionLocks === "object" ? graph.questionLocks : {})
        setDataReady(true)
      } catch (err) {
        if (!cancelled) setLoadError(err?.message || "Load failed")
      }
    }
    load()
    return () => { cancelled = true }
  }, [status, subjectId, asStudentId, demoMode])

  // close the scratchpad when not on a question (stageLevel !== 4 ⟺ no drilled
  // question). Kept above the early returns so hook order is stable (React #310).
  useEffect(() => {
    if (drillQuestionIdx == null && scratchOpen) setScratchOpen(false)
  }, [drillQuestionIdx, scratchOpen])

  // capture-only: drive the drill from the URL (?du=&dl=&dq=&dn=) so a screenshot
  // script can walk the curriculum node-by-node. Empty/absent param ⟹ that level
  // collapses to its default.
  useEffect(() => {
    if (!demoMode) return
    const q = router.query
    if (q.du === undefined && q.dl === undefined && q.dq === undefined && q.dn === undefined) return
    const num = (v) => { const n = Number(v); return v === "" || v == null || !Number.isFinite(n) ? null : n }
    setDrillUnitIdx(num(q.du))
    setDrillLoIdx(num(q.dl))
    setDrillQtypeIdx(num(q.dq))
    setDrillQuestionIdx(num(q.dn))
  }, [demoMode, router.query.du, router.query.dl, router.query.dq, router.query.dn])

  const allObjectives = dataReady && subject
    ? (showcaseTaxonomy || getAllObjectives(student?.state || "", subject.name || ""))
    : []
  const cylinderUnits = dataReady ? buildCylinderData(allObjectives, questionTypes) : []

  if (!demoMode && status === "loading") return <div className={styles.spinner}>Loading…</div>

  if (!subjectId) {
    return (
      <div className={styles.gate}>
        <h1>Pick a subject first.</h1>
        <p>Open practice from the dashboard so we know which subject to practice.</p>
        <Link href="/dashboard" className={styles.headerLink}>Go to dashboard</Link>
      </div>
    )
  }
  if (loadError) {
    return (
      <div className={styles.gate}>
        <h1>Couldn&apos;t load practice data.</h1>
        <p>{loadError}</p>
        <Link href={`/dashboard?subjectId=${subjectId}`} className={styles.headerLink}>Back to dashboard</Link>
      </div>
    )
  }
  if (!dataReady) return <div className={styles.spinner}>Loading practice…</div>
  if (!subject) {
    return (
      <div className={styles.gate}>
        <h1>Subject not found.</h1>
        <p>This account doesn&apos;t have access to subject <code>{subjectId}</code>.</p>
        <Link href="/dashboard" className={styles.headerLink}>Back to dashboard</Link>
      </div>
    )
  }
  if (!cylinderUnits.length) {
    return (
      <div className={styles.gate}>
        <h1>No practice data yet.</h1>
        <p>No question types are available for {subject.name} yet. Try completing an assessment first.</p>
        <Link href={`/dashboard?subjectId=${subjectId}`} className={styles.headerLink}>Back to dashboard</Link>
      </div>
    )
  }

  const effectivePalette = SHAPE_PALETTE_KEYS.includes(paletteOverride) ? paletteOverride : "sunset"
  const normalized = normalizeUnitsForScenes(cylinderUnits, shapeMode)
  const units = normalized.units
  const unitHeight = normalized.unitHeight
  const totalHeight = normalized.totalHeight
  // capture-only: expose the drilled tree (units → rings → arcs → questions) so the
  // screenshot script can build the curriculum walk. Plain render-time assignment
  // (not a hook) to avoid disturbing hook order.
  if (typeof window !== "undefined" && demoMode) window.__units = units
  const secondaryHeight = normalized.secondaryHeight

  const unitIdxOrNull = drillUnitIdx != null && units.length ? Math.min(drillUnitIdx, units.length - 1) : null
  const activeUnit = unitIdxOrNull != null ? units[unitIdxOrNull] : (units[0] || null)
  const loList = activeUnit?.rings || []
  const loIdxOrNull = drillLoIdx != null && loList.length ? Math.min(drillLoIdx, loList.length - 1) : null
  const activeLo = loIdxOrNull != null ? loList[loIdxOrNull] : (loList[0] || null)
  const arcList = activeLo?.arcs || []
  const arcIdxOrNull = drillQtypeIdx != null && arcList.length ? Math.min(drillQtypeIdx, arcList.length - 1) : null
  const activeArc = arcIdxOrNull != null ? arcList[arcIdxOrNull] : (arcList[0] || null)

  const stageLevel = drillQuestionIdx != null ? 4
    : drillQtypeIdx != null ? 3
    : drillLoIdx != null ? 2
    : drillUnitIdx != null ? 1
    : 0
  const currentQuestion = stageLevel === 4 && activeArc && Array.isArray(activeArc.questions)
    ? activeArc.questions[Math.max(0, Math.min(activeArc.questions.length - 1, drillQuestionIdx ?? 0))] || null
    : null
  const questionCanSave = !!(currentQuestion?.key)
  const stageLabel = stageLevel === 0 ? "Subject"
    : stageLevel === 1 ? "Unit"
    : stageLevel === 2 ? (shapeMode === "cube" ? "Section" : "Learning Objective")
    : stageLevel === 3 ? "Question Type"
    : "Question"
  const stageTitle = stageLevel === 0 ? subject.name
    : stageLevel === 1 ? (activeUnit?.name || "Unit")
    : stageLevel === 2 ? (activeLo?.name || "Objective")
    : stageLevel === 3 ? (activeArc?.type || activeArc?.name || "Question type")
    : `Question ${String((drillQuestionIdx ?? 0) + 1).padStart(2, "0")}`

  const handleStackDrill = (idx) => {
    if (idx == null || !units.length) return
    setDrillUnitIdx(idx); setDrillLoIdx(null); setDrillQtypeIdx(null); setDrillQuestionIdx(null)
  }
  const handleDiskDrill = (ring) => {
    if (!ring || !loList.length) return
    const idx = loList.findIndex((r) => r.code === ring.code)
    if (idx < 0) return
    setDrillLoIdx(idx); setDrillQtypeIdx(null); setDrillQuestionIdx(null)
  }
  const handleRingDrill = (arc) => {
    if (!arc || !arcList.length) return
    const idx = arcList.findIndex((a) => a.questionTypeId === arc.questionTypeId)
    if (idx < 0) return
    setDrillQtypeIdx(idx); setDrillQuestionIdx(null)
  }
  const handleArcDrill = (question) => {
    if (!activeArc) return
    const total = Math.max(1, activeArc.total || activeArc.questions?.length || 1)
    let idx = 0
    if (question && Number.isInteger(question.index)) idx = question.index
    else if (question && question.questionId != null && Array.isArray(activeArc.questions)) {
      const found = activeArc.questions.findIndex((q) => q?.id === question.questionId || q?.questionId === question.questionId)
      if (found >= 0) idx = found
    }
    setDrillQuestionIdx(Math.max(0, Math.min(total - 1, idx)))
  }
  const collapseToLevel = (lvl) => {
    if (lvl <= 0) setDrillUnitIdx(null)
    if (lvl <= 1) setDrillLoIdx(null)
    if (lvl <= 2) setDrillQtypeIdx(null)
    if (lvl <= 3) setDrillQuestionIdx(null)
  }
  const goBack = () => collapseToLevel(Math.max(0, stageLevel - 1))

  const navNext = stageLevel === 4
    ? findNext(units, unitIdxOrNull ?? 0, loIdxOrNull ?? 0, arcIdxOrNull ?? 0, drillQuestionIdx ?? 0)
    : null
  const navPrev = stageLevel === 4
    ? findPrev(units, unitIdxOrNull ?? 0, loIdxOrNull ?? 0, arcIdxOrNull ?? 0, drillQuestionIdx ?? 0)
    : null
  const navNextArc = stageLevel === 4
    ? findNextArc(units, unitIdxOrNull ?? 0, loIdxOrNull ?? 0, arcIdxOrNull ?? 0)
    : null
  const navPrevArc = stageLevel === 4
    ? findPrevArc(units, unitIdxOrNull ?? 0, loIdxOrNull ?? 0, arcIdxOrNull ?? 0)
    : null
  const currentQuestionAttempted = !!(currentQuestion?.key
    && Array.isArray(activeArc?.correctQuestionKeys)
    && activeArc.correctQuestionKeys.includes(currentQuestion.key))
  function applyNav(nav) {
    if (!nav) return
    setDrillUnitIdx(nav.uIdx)
    setDrillLoIdx(nav.lIdx)
    setDrillQtypeIdx(nav.qtIdx)
    setDrillQuestionIdx(nav.qIdx)
  }

  async function handleAnswer(result, questionKey) {
    const qtId = activeArc?.questionTypeId
    if (!qtId || !questionKey) return
    try {
      const res = await fetch("/api/student/progress-graph-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          as: asStudentId || null,
          questionTypeId: qtId,
          questionKey,
          result,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) return
      setQuestionTypes((prev) => prev.map((qt) => {
        if (String(qt.id) !== String(qtId)) return qt
        return {
          ...qt,
          masteryScore: typeof data.masteryScore === "number" ? data.masteryScore : qt.masteryScore,
          correctQuestionKeys: Array.isArray(data.correctQuestionKeys) ? data.correctQuestionKeys : qt.correctQuestionKeys,
        }
      }))
      const unlockAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
      setQuestionLocks((prev) => ({ ...prev, [questionKey]: unlockAt }))
    } catch {}
  }

  const [firstWord, ...restWords] = (stageTitle || "—").trim().split(/\s+/)
  const restTitle = restWords.join(" ")

  const panelCellClass = (active) => `${styles.panelCell}`
  const panelLabelClass = (active) => `${styles.panelLabel} ${active ? styles.panelLabelActive : ""}`

  return (
    <>
      <Head><title>Practice — {subject.name}</title></Head>
      <div className={styles.root}>
        <div className={styles.header}>
          <Link href={`/dashboard?subjectId=${subjectId}${asStudentId ? `&as=${asStudentId}` : ""}`} className={styles.headerLink}>← Dashboard</Link>
          <span className={styles.headerTitle}>{subject.name}</span>
          <button
            type="button"
            className={styles.headerLink}
            onClick={goBack}
            disabled={stageLevel === 0}
          >Back ↺</button>
        </div>

        <div className={styles.obsStrip}>
          <span className={styles.obsLabel}>Object</span>
          {SHAPE_MODES.map((mode) => (
            <button
              key={mode.key}
              type="button"
              className={`${styles.obsPalette} ${shapeMode === mode.key ? styles.obsPaletteActive : ""}`}
              onClick={() => setShapeMode(mode.key)}
            >
              {mode.label}
            </button>
          ))}
          <span className={styles.obsSpacer} />
          <span className={styles.obsLabel}>Palette</span>
          {SHAPE_PALETTE_KEYS.map((p) => (
            <button
              key={p}
              type="button"
              className={`${styles.obsPalette} ${effectivePalette === p ? styles.obsPaletteActive : ""}`}
              onClick={() => setPaletteOverride(p)}
              title={p}
            >
              <i className={styles.obsPaletteSwatch} style={{ background: `linear-gradient(90deg, ${SHAPE_PALETTE_STOPS[p].join(",")})` }} />
            </button>
          ))}
        </div>

        <DrillBreadcrumbs
          units={units}
          unitIdx={drillUnitIdx}
          loIdx={drillLoIdx}
          qtIdx={drillQtypeIdx}
          qIdx={drillQuestionIdx}
          shapeMode={shapeMode}
          barColor="#0e0e0e"
          onUnit={(idx) => { setDrillUnitIdx(idx); setDrillLoIdx(null); setDrillQtypeIdx(null); setDrillQuestionIdx(null) }}
          onLo={(idx) => { setDrillLoIdx(idx); setDrillQtypeIdx(null); setDrillQuestionIdx(null) }}
          onQt={(idx) => { setDrillQtypeIdx(idx); setDrillQuestionIdx(null) }}
          onQ={(idx) => setDrillQuestionIdx(idx)}
        />

        <div className={styles.questionHeader}>
          <div className={styles.questionHeaderLeft}>
            <div className={styles.cardEyebrow}>§ {String(stageLevel + 1).padStart(2, "0")} — {stageLabel}</div>
            <div className={styles.cardTitleBlock} key={`h-${stageLevel}`}>
              <MathText text={firstWord || "—"} className={styles.cardTitleFirst} />
              {restTitle ? <MathText text={restTitle} className={styles.cardTitleRest} /> : null}
            </div>
          </div>
        </div>

        <div className={styles.workspace}>
          <div className={styles.main}>
            {stageLevel === 4 && currentQuestion ? (
              scratchOpen ? (
                <div className={styles.mainSplit}>
                  <div className={styles.questionSide}>
                    <QuestionPane
                      question={currentQuestion}
                      arcTitle={activeArc?.type || activeArc?.name || ""}
                      questionIndex={drillQuestionIdx ?? 0}
                      totalQuestions={activeArc?.questions?.length || activeArc?.total || 1}
                      subjectId={subjectId}
                      questionTypeId={activeArc?.questionTypeId || ""}
                      scratchOpen={true}
                      onToggleScratch={() => setScratchOpen(false)}
                      onPrev={() => applyNav(navPrev)}
                      onNext={() => applyNav(navNext)}
                      prevLabel={prevLabelFor(navPrev)}
                      nextLabel={nextLabelFor(navNext)}
                      canPrev={!!navPrev}
                      canNext={!!navNext}
                      onPrevArc={() => applyNav(navPrevArc)}
                      onNextArc={() => applyNav(navNextArc)}
                      prevArcLabel={prevArcLabelFor(navPrevArc)}
                      nextArcLabel={nextArcLabelFor(navNextArc)}
                      canPrevArc={!!navPrevArc}
                      canNextArc={!!navNextArc}
                      attempted={currentQuestionAttempted}
                      onAnswer={handleAnswer}
                      lockedUntil={questionLocks[currentQuestion.key] || null}
                      excalidrawApiRef={practiceExcalidrawApiRef}
                      scratchHasContent={practiceScratchHasContent}
                    />
                  </div>
                  <div className={styles.dockShell}>
                    <ExcalidrawDock
                      questionKey={currentQuestion.key || ""}
                      questionLabel={activeArc?.type || "Scratch"}
                      subjectId={subjectId}
                      questionTypeId={activeArc?.questionTypeId || ""}
                      canSave={questionCanSave}
                      mode="practice"
                      onCloseScratch={() => setScratchOpen(false)}
                      onApiReady={(api) => { practiceExcalidrawApiRef.current = api }}
                      onSceneChange={setPracticeScratchHasContent}
                      hideSave={currentQuestion?.questionFormat === "free_response"}
                    />
                  </div>
                </div>
              ) : (
                <QuestionPane
                  question={currentQuestion}
                  arcTitle={activeArc?.type || activeArc?.name || ""}
                  questionIndex={drillQuestionIdx ?? 0}
                  totalQuestions={activeArc?.questions?.length || activeArc?.total || 1}
                  subjectId={subjectId}
                  questionTypeId={activeArc?.questionTypeId || ""}
                  scratchOpen={false}
                  onToggleScratch={() => setScratchOpen(true)}
                  onPrev={() => applyNav(navPrev)}
                  onNext={() => applyNav(navNext)}
                  prevLabel={prevLabelFor(navPrev)}
                  nextLabel={nextLabelFor(navNext)}
                  canPrev={!!navPrev}
                  canNext={!!navNext}
                  onPrevArc={() => applyNav(navPrevArc)}
                  onNextArc={() => applyNav(navNextArc)}
                  prevArcLabel={prevArcLabelFor(navPrevArc)}
                  nextArcLabel={nextArcLabelFor(navNextArc)}
                  canPrevArc={!!navPrevArc}
                  canNextArc={!!navNextArc}
                  attempted={currentQuestionAttempted}
                  onAnswer={handleAnswer}
                  lockedUntil={questionLocks[currentQuestion.key] || null}
                  excalidrawApiRef={practiceExcalidrawApiRef}
                  scratchHasContent={practiceScratchHasContent}
                />
              )
            ) : (
              <div className={styles.dockShell}>
                <ExcalidrawDock
                  questionKey=""
                  questionLabel="Scratch"
                  subjectId={subjectId}
                  questionTypeId=""
                  canSave={false}
                  mode="practice"
                />
              </div>
            )}
          </div>
          <div className={styles.rightColumn}>
            <div className={panelCellClass(stageLevel === 0)}>
              <div className={panelLabelClass(stageLevel === 0)}>
                <span className={styles.panelLabelKey}>Subject{subject?.name ? ":" : ""}</span>
                <span className={styles.panelLabelName}>{subject?.name || ""}</span>
                <span className={styles.panelLabelIndex}>01</span>
              </div>
              <div className={styles.panelBody}>
                <StackPanel
                  shapeMode={shapeMode}
                  units={units}
                  totalHeight={totalHeight}
                  palette={effectivePalette}
                  selectedIdx={unitIdxOrNull}
                  onDrillUnit={handleStackDrill}
                />
                <div className={styles.panelCorners}><i/><i/><i/><i/></div>
              </div>
            </div>

            <div className={panelCellClass(stageLevel === 1)}>
              <div className={panelLabelClass(stageLevel === 1)}>
                <span className={styles.panelLabelKey}>Unit{activeUnit?.name ? ":" : ""}</span>
                <span className={styles.panelLabelName}>{activeUnit?.name || ""}</span>
                <span className={styles.panelLabelIndex}>02</span>
              </div>
              <div className={styles.panelBody}>
                {activeUnit ? (
                  <DiskPanel
                    key={`disk-${unitIdxOrNull ?? "none"}-${shapeMode}`}
                    shapeMode={shapeMode}
                    unit={activeUnit}
                    unitHeight={unitHeight}
                    palette={effectivePalette}
                    selectedRingCode={activeLo?.code || ""}
                    onDrillRing={handleDiskDrill}
                  />
                ) : <div className={styles.panelEmpty}>Select a unit</div>}
                <div className={styles.panelCorners}><i/><i/><i/><i/></div>
              </div>
            </div>

            <div className={panelCellClass(stageLevel === 2)}>
              <div className={panelLabelClass(stageLevel === 2)}>
                <span className={styles.panelLabelKey}>{shapeMode === "cube" ? "Section" : "Learning Objective"}{activeLo?.name ? ":" : ""}</span>
                <span className={styles.panelLabelName}>{activeLo?.name || activeLo?.code || ""}</span>
                <span className={styles.panelLabelIndex}>03</span>
              </div>
              <div className={styles.panelBody}>
                {activeLo ? (
                  <RingPanel
                    key={`ring-${unitIdxOrNull ?? "none"}-${loIdxOrNull ?? "none"}-${shapeMode}`}
                    shapeMode={shapeMode}
                    ring={activeLo}
                    ringHeight={secondaryHeight}
                    palette={effectivePalette}
                    activeArc={activeArc}
                    onDrillArc={handleRingDrill}
                  />
                ) : <div className={styles.panelEmpty}>Select an objective</div>}
                <div className={styles.panelCorners}><i/><i/><i/><i/></div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.bottomRow}>
          <div className={panelCellClass(stageLevel === 4)}>
            <div className={panelLabelClass(stageLevel === 4)}>
              <span className={styles.panelLabelKey}>Question{currentQuestion ? ":" : ""}</span>
              <span className={styles.panelLabelName}>
                {currentQuestion
                  ? `${String((drillQuestionIdx ?? 0) + 1).padStart(2, "0")} / ${String(activeArc?.questions?.length || activeArc?.total || 1).padStart(2, "0")}`
                  : ""}
              </span>
              <span className={styles.panelLabelIndex}>05</span>
            </div>
            <div className={styles.panelBody}>
              {activeArc && activeArc.questionTypeId ? (
                <QuestionPanel
                  key={`q-${unitIdxOrNull ?? "none"}-${loIdxOrNull ?? "none"}-${arcIdxOrNull ?? "none"}-${shapeMode}`}
                  shapeMode={shapeMode}
                  ring={activeLo}
                  arcId={activeArc.questionTypeId}
                  questionIdx={drillQuestionIdx ?? 0}
                  ringHeight={secondaryHeight}
                  palette={effectivePalette}
                  onDrillQuestion={handleArcDrill}
                />
              ) : <div className={styles.panelEmpty}>Pick a question</div>}
              <div className={styles.panelCorners}><i/><i/><i/><i/></div>
            </div>
          </div>

          <div className={panelCellClass(stageLevel === 3)}>
            <div className={panelLabelClass(stageLevel === 3)}>
              <span className={styles.panelLabelKey}>Question Type{activeArc ? ":" : ""}</span>
              <span className={styles.panelLabelName}>{activeArc?.type || activeArc?.name || ""}</span>
              <span className={styles.panelLabelIndex}>04</span>
            </div>
            <div className={styles.panelBody}>
              {activeArc ? (
                <ArcPanel
                  key={`arc-${unitIdxOrNull ?? "none"}-${loIdxOrNull ?? "none"}-${arcIdxOrNull ?? "none"}-${shapeMode}`}
                  shapeMode={shapeMode}
                  ring={activeLo}
                  arcId={activeArc?.questionTypeId || null}
                  ringHeight={secondaryHeight}
                  palette={effectivePalette}
                  onDrillQuestion={handleArcDrill}
                />
              ) : <div className={styles.panelEmpty}>Select a question type</div>}
              <div className={styles.panelCorners}><i/><i/><i/><i/></div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
