import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { getDistrictTaxonomy, getObjectiveByCode, getAllObjectives } from "../lib/district-taxonomy"
import { buildCylinderData } from "../lib/cylinder-data"
import { getLoForSlo } from "../lib/slo-utils"

const ADMIN_EMAIL = "kbohuastt@gmail.com"
const MAX_UPLOAD_BYTES = 22 * 1024 * 1024 // Base64 expansion keeps request under ~30MB body limit
const REVIEW_PAGE_SIZE = 8
const REVIEW_MORPH_STEPS = 10
const Excalidraw = dynamic(
  () =>
    import("@excalidraw/excalidraw")
      .then((m) => m.Excalidraw || m.default)
      .catch(() => () => <div style={{ padding: 10, color: "#f0b3b3" }}>Excalidraw unavailable</div>),
  { ssr: false }
)
const SubjectCylinder3D = dynamic(() => import("../components/SubjectCylinder3D"), { ssr: false })
const SourcesStudio = dynamic(() => import("../components/SourcesStudio"), { ssr: false })
const ADMIN_SECTIONS = [
  { id: "dashboard", label: "Dashboard", desc: "Today, tomorrow, and the week ahead", group: "Core Workflow" },
  { id: "live-class", label: "Live Class", desc: "Run the session with prompts, timers, and tangents", group: "Core Workflow" },
  { id: "calendar", label: "Calendar", desc: "Review synced sessions, real dates, and planning frontier", group: "Core Workflow" },
  { id: "pacing", label: "Pacing Guide", desc: "Lock teaching order before review begins", group: "Core Workflow" },
  { id: "review", label: "Review Queue", desc: "Approve and polish the material for class", group: "Core Workflow" },
  { id: "import", label: "Import", desc: "Assessment and homework imports, calendar sync, and session planning", group: "Core Workflow" },
  { id: "sources", label: "Sources", desc: "Source PDFs and per-question bbox tagging on the live PDF", group: "Content + Ops" },
  { id: "reschedule", label: "Reschedule", desc: "Move or shift session plans", group: "Content + Ops" },
  { id: "practice", label: "Practice Revision", desc: "Build consolidation lists from practice data", group: "Content + Ops" },
  { id: "showcase", label: "Showcase", desc: "Generate access for the demo student", group: "Content + Ops" },
  { id: "flags", label: "Question Flags", desc: "Reported questions and student scratch work viewer", group: "Content + Ops" },
  { id: "grading", label: "Grading Queue", desc: "Review pending free-response submissions", group: "Content + Ops" },
  { id: "backup", label: "Backups", desc: "Export full Notion workspace data to R2", group: "Content + Ops" },
]

async function readJsonOrThrow(res, context = "Request") {
  const raw = await res.text()
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    const snippet = (raw || "").replace(/\s+/g, " ").slice(0, 180)
    throw new Error(
      `${context} failed (${res.status} ${res.statusText}). ` +
      `Server returned non-JSON${snippet ? `: ${snippet}` : "."}`
    )
  }
}

function uniqueStrings(values = []) {
  const out = []
  const seen = new Set()
  for (const value of values || []) {
    const key = String(value || "").trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}


function getPacingUnitGroup(entry = {}) {
  return {
    key: String(entry.schoolUnitKey || entry.standardCode || "__").trim() || "__",
    name: String(entry.schoolUnitName || entry.standardName || entry.standardCode || "General").trim() || "General",
  }
}

function getLiveStackKey(item = {}) {
  return String(item.questionPageId || item.id || "")
}

function buildLivePreClassSuggestions(attempts = [], livePlan = [], sessionDate = "") {
  const matchingAttempts = attempts
    .filter((attempt) => attempt.mode === "pre")
    .sort((a, b) => (String(b.sessionDate || "")).localeCompare(String(a.sessionDate || "")))

  const chosenAttempt =
    matchingAttempts.find((attempt) => String(attempt.sessionDate || "") === String(sessionDate || "")) ||
    matchingAttempts[0] ||
    null

  if (!chosenAttempt) return []

  const wrongItems = Array.isArray(chosenAttempt.resultPayload?.updatedScores)
    ? chosenAttempt.resultPayload.updatedScores.filter((item) => item && item.correct === false)
    : []

  const byQuestionPageId = new Map(
    (livePlan || [])
      .filter((item) => item.questionPageId)
      .map((item) => [String(item.questionPageId), item])
  )

  const deduped = new Map()
  for (const wrong of wrongItems) {
    const questionPageId = String(wrong.notionQuestionId || "").trim()
    if (!questionPageId || deduped.has(questionPageId)) continue
    const existing = byQuestionPageId.get(questionPageId)
    deduped.set(questionPageId, {
      id: existing?.id || `pre-${questionPageId}`,
      questionPageId,
      title: wrong.questionTypeTitle || existing?.title || "Missed topic",
      unit: wrong.unit || existing?.unit || "",
      standardCode: wrong.standardCode || existing?.standardCode || "",
      weaknessScore: Number(wrong.weaknessAfter ?? wrong.weaknessScore ?? existing?.weaknessScore ?? 0),
      sourceSessionDate: chosenAttempt.sessionDate || sessionDate || "",
      planKind: "pre_miss",
    })
  }

  return [...deduped.values()]
}

function buildLiveFinalStack(items = [], selection = {}) {
  const result = []
  const seen = new Set()
  for (const item of items || []) {
    const key = getLiveStackKey(item)
    if (!key || !selection[key] || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function hasSceneData(scene = null) {
  return !!(scene && Array.isArray(scene.elements) && scene.elements.length)
}

function clamp01(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  return Math.max(0, Math.min(1, num))
}

function getNormalizedBlockBbox(block = {}) {
  const bbox = block?.bbox || {}
  return {
    x: clamp01(bbox.x),
    y: clamp01(bbox.y),
    w: Math.max(0.08, clamp01(bbox.w || 0.18)),
    h: Math.max(0.04, clamp01(bbox.h || 0.08)),
  }
}

function clampNormalizedBbox(bbox = {}) {
  const x = clamp01(bbox.x)
  const y = clamp01(bbox.y)
  const w = Math.max(0.04, Math.min(1, Number(bbox.w || 0.12)))
  const h = Math.max(0.03, Math.min(1, Number(bbox.h || 0.06)))
  return {
    x: Math.min(x, Math.max(0, 1 - w)),
    y: Math.min(y, Math.max(0, 1 - h)),
    w,
    h,
  }
}

function buildContentPageRows(blocks = []) {
  const sorted = [...(blocks || [])].sort((a, b) => {
    const ay = Number(a?.bbox?.y || 0)
    const by = Number(b?.bbox?.y || 0)
    if (Math.abs(ay - by) > 0.02) return ay - by
    return Number(a?.order || 0) - Number(b?.order || 0)
  })

  const rows = sorted.map((block) => {
    const bbox = getNormalizedBlockBbox(block)
    return {
      top: bbox.y,
      bottom: bbox.y + bbox.h,
      height: Math.max(bbox.h, block.kind === "image" ? 0.14 : 0.06),
      baseHeightPx: Math.max(56, Math.round((block.kind === "image" ? 0.14 : Math.max(bbox.h, 0.06)) * 980)),
      blocks: [block],
    }
  })

  const gapPx = 10
  const totalBaseHeightPx = rows.reduce((sum, row) => sum + row.baseHeightPx, 0) + Math.max(0, rows.length - 1) * gapPx
  return {
    rows,
    gapPx,
    totalBaseHeightPx,
  }
}

function buildContentDraftPages(blocks = [], manifest = null) {
  const pageMeta = Array.isArray(manifest?.pageImages) ? manifest.pageImages : []
  const pages = new Map()

  for (const meta of pageMeta) {
    const pageNo = Number(meta?.page || 0)
    if (!pageNo) continue
    pages.set(pageNo, {
      page: pageNo,
      imageMeta: meta,
      blocks: [],
    })
  }

  for (const block of blocks || []) {
    const pageNo = Math.max(1, Number(block?.page || 1))
    if (!pages.has(pageNo)) {
      pages.set(pageNo, {
        page: pageNo,
        imageMeta: null,
        blocks: [],
      })
    }
    pages.get(pageNo).blocks.push(block)
  }

  return [...pages.values()]
    .sort((a, b) => a.page - b.page)
    .map((page) => ({
      ...page,
      blocks: [...page.blocks].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    }))
}

function formatLocalDateInput(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatRelativeMinutesAgo(iso = "") {
  const at = new Date(String(iso || ""))
  if (!iso || Number.isNaN(at.getTime())) return "unknown"
  const diffMs = Date.now() - at.getTime()
  const diffSec = Math.max(0, Math.floor(diffMs / 1000))
  if (diffSec < 15) return "just now"
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  return `${diffHr}h ago`
}

function getPacingGridColumns(unitCount = 0) {
  const count = Math.max(3, Math.min(15, Number(unitCount || 0) || 3))
  if (count <= 3) return "repeat(3, minmax(0, 1fr))"
  if (count <= 4) return "repeat(4, minmax(0, 1fr))"
  if (count <= 6) return "repeat(5, minmax(0, 1fr))"
  if (count <= 8) return "repeat(6, minmax(0, 1fr))"
  if (count <= 10) return "repeat(7, minmax(0, 1fr))"
  if (count <= 12) return "repeat(8, minmax(0, 1fr))"
  return "repeat(9, minmax(0, 1fr))"
}

function shiftLocalDateInput(base = new Date(), deltaDays = 0) {
  const next = new Date(base)
  next.setDate(next.getDate() + Number(deltaDays || 0))
  return formatLocalDateInput(next)
}

export default function AdminPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const demoMode = router.query.demo === "1"
  const authReady = demoMode || status === "authenticated"

  const [lightMode, setLightMode] = useState(true)
  const [adminTimezone, setAdminTimezone] = useState("UTC")
  const lm = lightMode
  const s = lm ? {
    ...sBase,
    page:               { ...sBase.page,               background: "#f0ebe0" },
    sidebar:            { ...sBase.sidebar,             background: "#faf7f2", border: "1px solid #ddd4c0" },
    brand:              { ...sBase.brand,               color: "#2c2410" },
    sidebarSectionTitle:{ ...sBase.sidebarSectionTitle, color: "#8a7a5a" },
    sidebarNavBtn:      { ...sBase.sidebarNavBtn,       background: "#f0ebe0", border: "1px solid #ddd4c0", color: "#3a2e1a" },
    sidebarNavBtnActive:{ ...sBase.sidebarNavBtnActive, background: "#f5e8c8", border: "1px solid #c9a84c", color: "#7a5a10" },
    sidebarNavSub:      { ...sBase.sidebarNavSub,       color: "#8a7a5a" },
    studentBtn:         { ...sBase.studentBtn,          background: "#f5f0e8", border: "1px solid #ddd4c0", color: "#4a3a22" },
    studentBtnActive:   { ...sBase.studentBtnActive,    background: "#f5e8c8", border: "1px solid #c9a84c", color: "#7a5a10" },
    main:               { ...sBase.main,                background: "#faf7f2", border: "1px solid #ddd4c0" },
    mainFull:           { ...sBase.mainFull,            background: "#faf7f2", border: "1px solid #ddd4c0" },
    title:              { ...sBase.title,               color: "#1e180a" },
    heroSub:            { ...sBase.heroSub,             color: "#7a6a50" },
    primaryNavBar:      { ...sBase.primaryNavBar,       borderBottom: "1px solid #e0d8cc" },
    primaryNavBtn:      { ...sBase.primaryNavBtn,       background: "#f0ebe0", border: "1px solid #ddd4c0", color: "#6a5a42" },
    primaryNavBtnActive:{ ...sBase.primaryNavBtnActive, background: "#f5e8c8", border: "1px solid #c9a84c", color: "#7a5a10" },
    studentContextBar:  { ...sBase.studentContextBar,   borderBottom: "1px solid #e0d8cc" },
    studentContextTitle:{ ...sBase.studentContextTitle, color: "#2c2410" },
    studentContextMeta: { ...sBase.studentContextMeta,  color: "#8a7a5a" },
    studentSummaryCard: { ...sBase.studentSummaryCard,  background: "#f5f0e8", border: "1px solid #ddd4c0" },
    studentSummaryTitle:{ ...sBase.studentSummaryTitle, color: "#2c2410" },
    studentSummaryMeta: { ...sBase.studentSummaryMeta,  color: "#8a7a5a" },
    studentSubjectCard: { ...sBase.studentSubjectCard,  background: "#f5f0e8", border: "1px solid #ddd4c0" },
    studentSubjectTitle:{ ...sBase.studentSubjectTitle, color: "#2c2410" },
    studentSubjectMeta: { ...sBase.studentSubjectMeta,  color: "#8a7a5a" },
    contextMiniBtn:     { ...sBase.contextMiniBtn,      background: "#f0ebe0", border: "1px solid #ddd4c0", color: "#4a3a22" },
    studentContextEmpty:{ ...sBase.studentContextEmpty, color: "#8a7a5a", border: "1px dashed #d7ccb8" },
    metricsGrid:        sBase.metricsGrid,
    metricCard:         { ...sBase.metricCard,          background: "#f5f0e8", border: "1px solid #ddd4c0" },
    metricLabel:        { ...sBase.metricLabel,         color: "#8a7a5a" },
    metricValue:        { ...sBase.metricValue,         color: "#2c2410" },
    insightCard:        { ...sBase.insightCard,         background: "#f5f0e8", border: "1px solid #ddd4c0" },
    insightTitle:       { ...sBase.insightTitle,        color: "#2c2410" },
    tomorrowPrepCard:   { ...sBase.tomorrowPrepCard,    background: "#faf5ec", border: "1px solid #ddd4c0" },
    tomorrowPrepTitle:  { ...sBase.tomorrowPrepTitle,   color: "#2c2410" },
    tomorrowPrepMeta:   { ...sBase.tomorrowPrepMeta,    color: "#8a7a5a" },
    tomorrowPrepStatusReady: { ...sBase.tomorrowPrepStatusReady, background: "#e2f1dd", borderColor: "#7aa36b", color: "#23401f" },
    tomorrowPrepStatusOpen:  { ...sBase.tomorrowPrepStatusOpen,  background: "#e4eafb", borderColor: "#7e8ed8", color: "#24306b" },
    tomorrowPrepStatusPending: { ...sBase.tomorrowPrepStatusPending, background: "#f5e8c8", borderColor: "#c9a84c", color: "#7a5a10" },
    tomorrowPrepLink:   { ...sBase.tomorrowPrepLink,    color: "#8a6720" },
    queueZoomBtn:       { ...sBase.queueZoomBtn,        background: "#e6ebf7", border: "1px solid #9aa8cb", color: "#2d416f" },
    weakRow:            { ...sBase.weakRow,             borderBottom: "1px solid #e0d8cc" },
    weakTopic:          { ...sBase.weakTopic,           color: "#4a3a22" },
    weakScore:          { ...sBase.weakScore,           color: "#a07820" },
    subjectDividerTitle:{ ...sBase.subjectDividerTitle, color: "#9a8a6a" },
    subjectRow:         { ...sBase.subjectRow,          borderBottom: "1px solid #e0d8cc", color: "#4a3a22" },
    subjectMeta:        { ...sBase.subjectMeta,         color: "#9a8a6a" },
    reviewPanel:        { ...sBase.reviewPanel,         background: "#f5f0e8", border: "1px solid #ddd4c0" },
    reviewItemBtn:      { ...sBase.reviewItemBtn,       background: "#f0ebe0", border: "1px solid #ddd4c0", color: "#3a2e1a" },
    reviewPageBtn:      { ...sBase.reviewPageBtn,       background: "#f0ebe0", border: "1px solid #ddd4c0", color: "#5a4a30" },
    reviewMeta:         { ...sBase.reviewMeta,          color: "#9a8a6a" },
    adminTabs:          { ...sBase.adminTabs,           borderBottom: "1px solid #e0d8cc" },
    adminTab:           { ...sBase.adminTab,            background: "#f0ebe0", border: "1px solid #ddd4c0", color: "#6a5a42" },
    adminTabActive:     { ...sBase.adminTabActive,      background: "#f5e8c8", border: "1px solid #c9a84c", color: "#7a5a10" },
    problemCard:        { ...sBase.problemCard,         background: "#f5f0e8", border: "1px solid #ddd4c0" },
    problemQ:           { ...sBase.problemQ,            color: "#2c2410" },
    problemA:           { ...sBase.problemA,            color: "#6a5a40" },
    problemEditorLabel: { ...sBase.problemEditorLabel,  color: "#8a7a5a" },
    problemInput:       { ...sBase.problemInput,        background: "#faf7f2", border: "1px solid #d0c8b8", color: "#2c2410" },
    section:            { ...sBase.section,             borderBottom: "1px solid #e0d8cc" },
    sectionTitle:       { ...sBase.sectionTitle,        color: "#1e180a" },
    sectionLabel:       { ...sBase.sectionLabel,        color: "#8a7a5a" },
    sub:                { ...sBase.sub,                 color: "#7a6a50" },
    hint:               { ...sBase.hint,                color: "#9a8a6a" },
    error:              { ...sBase.error,               background: "#fff0f0", border: "1px solid #e0a0a0", color: "#a03030" },
    label:              { ...sBase.label,               color: "#7a6a50" },
    select:             { ...sBase.select,              background: "#f5f0e8", border: "1px solid #ddd4c0", color: "#2c2410" },
    uploadBox:          { ...sBase.uploadBox,           border: "2px dashed #d0c8b8", color: "#9a8a6a" },
    fileName:           { ...sBase.fileName,            color: "#2c2410" },
    importDivider:      { ...sBase.importDivider,       background: "#e0d8cc" },
    inlineDivider:      { ...sBase.inlineDivider,       borderTop: "1px solid #e0d8cc" },
    toolsWrap:          { ...sBase.toolsWrap,           borderTop: "1px solid #e0d8cc" },
    dateList:           { ...sBase.dateList,            background: "#f5f0e8", border: "1px solid #ddd4c0" },
    dateRow:            { ...sBase.dateRow,             borderBottom: "1px solid #e0d8cc" },
    dateNames:          { ...sBase.dateNames,           color: "#9a8a6a" },
    modeBtn:            { ...sBase.modeBtn,             background: "#f5f0e8", border: "1px solid #ddd4c0", color: "#7a6a50" },
    statusText:         { ...sBase.statusText,          color: "#7a6a50" },
    connectBtn:         { ...sBase.connectBtn,          background: "#f0ebe0", border: "1px solid #ddd4c0", color: "#5a4a30" },
    calendarPlaceholder:{ ...sBase.calendarPlaceholder, background: "#f5f0e8", border: "1px dashed #d8cfbf", color: "#8a7a5a" },
    manualBtn:          { ...sBase.manualBtn,           background: "#f5f0e8", border: "1px dashed #c0b8a8", color: "#7a6a50" },
    previewLabel:       { ...sBase.previewLabel,        color: "#8a7a5a" },
    previewValue:       { ...sBase.previewValue,        color: "#2c2410" },
    chipGroupLabel:     { ...sBase.chipGroupLabel,      color: "#8a7a5a" },
    refreshBtn:         { ...sBase.refreshBtn,          color: "#9a8a6a" },
    modalCard:          { ...sBase.modalCard,           background: "#faf7f2", border: "1px solid #ddd4c0" },
    resultBox:          { ...sBase.resultBox,           background: "#f0f5f0", border: "1px solid #b8d8b8" },
  } : sBase

  const [students, setStudents] = useState([])
  const [subjects, setSubjects] = useState([])
  const [activeAdminSection, setActiveAdminSection] = useState("dashboard")
  const [importWorkspace, setImportWorkspace] = useState("regular")
  const [backupLabel, setBackupLabel] = useState("manual")
  const [backupIncludeBlocks, setBackupIncludeBlocks] = useState(true)
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupError, setBackupError] = useState(null)
  const [backupResult, setBackupResult] = useState(null)
  const [liveStudentId, setLiveStudentId] = useState("")
  const [liveSubjectId, setLiveSubjectId] = useState("")
  const [liveSessionDate, setLiveSessionDate] = useState(new Date().toISOString().split("T")[0])
  const [livePlan, setLivePlan] = useState([])
  const [liveDraftMeta, setLiveDraftMeta] = useState(null)
  const [livePlanFlow, setLivePlanFlow] = useState(null)
  const [liveCoveredSelection, setLiveCoveredSelection] = useState({})
  const [livePreClassSuggestions, setLivePreClassSuggestions] = useState([])
  const [liveTaggedSuggestions, setLiveTaggedSuggestions] = useState([])
  const [liveSessionMeta, setLiveSessionMeta] = useState(null)
  const [liveLoading, setLiveLoading] = useState(false)
  const [liveError, setLiveError] = useState(null)
  const [liveNotice, setLiveNotice] = useState("")
  const [liveSelectedId, setLiveSelectedId] = useState("")
  const [liveFlow, setLiveFlow] = useState(null)
  const [liveFlowLoading, setLiveFlowLoading] = useState(false)
  const [liveFlowError, setLiveFlowError] = useState(null)
  const [liveTimerSeconds, setLiveTimerSeconds] = useState(0)
  const [liveTimerRunning, setLiveTimerRunning] = useState(false)
  const [liveTimerExpired, setLiveTimerExpired] = useState(false)
  const [liveTangentItems, setLiveTangentItems] = useState([])
  const [liveTangentTitle, setLiveTangentTitle] = useState("")
  const [liveTangentSource, setLiveTangentSource] = useState("")
  const [liveTangentNotes, setLiveTangentNotes] = useState("")
  const [liveNotesText, setLiveNotesText] = useState("")
  const [liveNotesScene, setLiveNotesScene] = useState(null)
  const [liveNotesSaving, setLiveNotesSaving] = useState(false)
  const [liveNotesError, setLiveNotesError] = useState("")
  const [liveNotesSavedAt, setLiveNotesSavedAt] = useState("")
  const [livePreviousNotes, setLivePreviousNotes] = useState(null)


  // ── Question bank import state
  const [contentBanks, setContentBanks] = useState([])
  const [qbImportBankId, setQbImportBankId] = useState("")
  const [qbImportJson, setQbImportJson] = useState("")
  const [qbImporting, setQbImporting] = useState(false)
  const [qbImportResult, setQbImportResult] = useState(null)
  const [qbImportError, setQbImportError] = useState(null)

  // ── Import state
  const [importStudent, setImportStudent] = useState("")
  const [importSubject, setImportSubject] = useState("")
  const [file, setFile] = useState(null)
  const [worksheetText, setWorksheetText] = useState("")
  const [sidecarJson, setSidecarJson] = useState("")
  const [importUseClaudeInference, setImportUseClaudeInference] = useState(false)
  const [importTaggingMode, setImportTaggingMode] = useState("lo_only")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [importError, setImportError] = useState(null)
  const [scheduleConflictPending, setScheduleConflictPending] = useState(null) // { conflictingDates, resolve }
  const [backfillStandardRunning, setBackfillStandardRunning] = useState(false)
  const [backfillStandardResult, setBackfillStandardResult] = useState(null)
  const [backfillReinforcementRunning, setBackfillReinforcementRunning] = useState(false)
  const [backfillReinforcementResult, setBackfillReinforcementResult] = useState(null)
  const [regenLoading, setRegenLoading] = useState(false)
  const [regenResult, setRegenResult] = useState(null)
  const [regenError, setRegenError] = useState(null)
  const [contentStudent, setContentStudent] = useState("")
  const [contentSubject, setContentSubject] = useState("")
  const [contentSessionDate, setContentSessionDate] = useState(new Date().toISOString().split("T")[0])
  const [contentFile, setContentFile] = useState(null)
  const [contentSourceLabel, setContentSourceLabel] = useState("")
  const [contentLoading, setContentLoading] = useState(false)
  const [contentSaving, setContentSaving] = useState(false)
  const [contentGenerating, setContentGenerating] = useState(false)
  const [contentImporting, setContentImporting] = useState(false)
  const [contentError, setContentError] = useState(null)
  const [contentNotice, setContentNotice] = useState("")
  const [contentDraft, setContentDraft] = useState(null)
  const [contentBlocks, setContentBlocks] = useState([])
  const [contentSidecar, setContentSidecar] = useState(null)
  const [contentGroups, setContentGroups] = useState([])
  const [contentTree, setContentTree] = useState({ version: 2, units: [] })
  const [contentHintJson, setContentHintJson] = useState("")
  const [contentJsonImporting, setContentJsonImporting] = useState(false)
  const [contentTreeSaving, setContentTreeSaving] = useState(false)
  const [contentItemDrag, setContentItemDrag] = useState(null)
  const [contentLmText, setContentLmText] = useState("")
  const [contentUseClaudeInference, setContentUseClaudeInference] = useState(false)
  const [contentReordering, setContentReordering] = useState(false)
  const [contentDragBlockId, setContentDragBlockId] = useState("")
  const [contentHoverBlockId, setContentHoverBlockId] = useState("")
  const [contentPointerDrag, setContentPointerDrag] = useState(null)
  const [contextStudent, setContextStudent] = useState("")
  const [contextSubject, setContextSubject] = useState("")
  const [contextSessionDate, setContextSessionDate] = useState(new Date().toISOString().split("T")[0])
  const [contextFiles, setContextFiles] = useState([])
  const [contextUploading, setContextUploading] = useState(false)
  const [contextLoading, setContextLoading] = useState(false)
  const [contextMatching, setContextMatching] = useState(false)
  const [contextAttachingKey, setContextAttachingKey] = useState("")
  const [contextError, setContextError] = useState(null)
  const [contextNotice, setContextNotice] = useState("")
  const [contextDocs, setContextDocs] = useState([])
  const [contextDraftItems, setContextDraftItems] = useState([])
  const [contextMatches, setContextMatches] = useState([])
  const [contextSelectedQuestionId, setContextSelectedQuestionId] = useState("")

  // ── Reschedule state
  const [reschedStudent, setReschedStudent] = useState("")
  const [reschedSubject, setReschedSubject] = useState("")
  const [scheduledDates, setScheduledDates] = useState([])
  const [loadingDates, setLoadingDates] = useState(false)
  const [reschedMode, setReschedMode] = useState("move") // "move" | "shift"
  const [fromDate, setFromDate] = useState("")
  const [toDate, setToDate] = useState("")
  const [shiftDays, setShiftDays] = useState(7)
  const [rescheduling, setRescheduling] = useState(false)
  const [reschedResult, setReschedResult] = useState(null)
  const [reschedError, setReschedError] = useState(null)

  // ── Homework (admin-assigned)
  const [hwStudent, setHwStudent] = useState("")
  const [hwSubject, setHwSubject] = useState("")
  const [hwLoading, setHwLoading] = useState(false)
  const [hwError, setHwError] = useState(null)
  const [hwQuestions, setHwQuestions] = useState([])
  const [hwSelected, setHwSelected] = useState({})
  const [hwSearch, setHwSearch] = useState("")
  const [hwMutating, setHwMutating] = useState(false)
  const [hwResult, setHwResult] = useState(null)
  const [hwDocFile, setHwDocFile] = useState(null)
  const [hwDocUploading, setHwDocUploading] = useState(false)
  const [hwDocResult, setHwDocResult] = useState(null)
  const [hwDocError, setHwDocError] = useState(null)
  const [hwSessionDate, setHwSessionDate] = useState(new Date().toISOString().split("T")[0])
  const [hwResolution, setHwResolution] = useState(0)
  const [hwCycleInfo, setHwCycleInfo] = useState(null)
  const [hwAttempts, setHwAttempts] = useState([])

  // ── Calendar
  const [calendarStatus, setCalendarStatus] = useState(null)
  const [calendarSyncing, setCalendarSyncing] = useState(false)
  const [calendarSyncNotice, setCalendarSyncNotice] = useState("")
  const [calendarSyncError, setCalendarSyncError] = useState(null)
  const [calendarSyncStartDate, setCalendarSyncStartDate] = useState(shiftLocalDateInput(new Date(), -30))
  const [calendarSyncEndDate, setCalendarSyncEndDate] = useState(shiftLocalDateInput(new Date(), 60))
  const [endClassSubjectId, setEndClassSubjectId] = useState("")
  const [endClassTopics, setEndClassTopics] = useState([])
  const [endClassSessionDate, setEndClassSessionDate] = useState("")
  const [endClassSelection, setEndClassSelection] = useState({})
  const [endClassOpen, setEndClassOpen] = useState(false)
  const [endClassLoading, setEndClassLoading] = useState(false)
  const [endClassBusy, setEndClassBusy] = useState(false)
  const [endClassError, setEndClassError] = useState(null)
  const [endClassNotice, setEndClassNotice] = useState("")
  const [rebuildBusy, setRebuildBusy] = useState(false)
  const [rebuildError, setRebuildError] = useState(null)
  const [rebuildResult, setRebuildResult] = useState(null)
  const [pacingSubject, setPacingSubject] = useState("")
  const [pacingStudentId, setPacingStudentId] = useState("")
  const [pacingEntries, setPacingEntries] = useState([])
  const [pacingLocked, setPacingLocked] = useState(false)
  const [pacingSource, setPacingSource] = useState(null) // "enrollment" | "subject_default" | null
  const [pacingLoading, setPacingLoading] = useState(false)
  const [pacingSaving, setPacingSaving] = useState(false)
  const [pacingSaved, setPacingSaved] = useState(false)
  const [pacingError, setPacingError] = useState(null)
  const [pacingNotice, setPacingNotice] = useState("")
  const [pacingDrag, setPacingDrag] = useState(null)
  const [pacingDrop, setPacingDrop] = useState(null)
  const [pacingPendingSkip, setPacingPendingSkip] = useState(false)
  const [pacingHistory, setPacingHistory] = useState([])
  const [pacingUnitDrag, setPacingUnitDrag] = useState(null)
  const [pacingUnitDrop, setPacingUnitDrop] = useState(null)
  const pacingDragStartX = useRef(null)
  const [pacingHoverLo, setPacingHoverLo] = useState(null) // { code, name, subtopics, rect }
  const [pacingPinnedLo, setPacingPinnedLo] = useState(null) // same shape, stays until toggled off
  const [pacingSubjectConfig, setPacingSubjectConfig] = useState(null)
  const [pacingSubjectBanks, setPacingSubjectBanks] = useState([])
  const [pacingSubjectOverlays, setPacingSubjectOverlays] = useState([])
  const [pacingConfigLoading, setPacingConfigLoading] = useState(false)
  const [pacingConfigSaving, setPacingConfigSaving] = useState(false)
  const [pacingConfigError, setPacingConfigError] = useState(null)
  const [pacingConfigNotice, setPacingConfigNotice] = useState("")
  const [showcaseBusy, setShowcaseBusy] = useState(false)
  const [showcaseError, setShowcaseError] = useState(null)
  const [showcaseResult, setShowcaseResult] = useState(null)
  const [flags, setFlags] = useState([])
  const [flagsLoading, setFlagsLoading] = useState(false)
  const [flagsError, setFlagsError] = useState("")
  const [flagsLoadedOnce, setFlagsLoadedOnce] = useState(false)
  // Reusable loader so the auto-fetch effect and the Refresh button share
  // the same code path. Defined as a ref-stable function via useCallback.
  const loadFlags = useCallback(async () => {
    setFlagsLoading(true); setFlagsError("")
    try {
      const r = await fetch("/api/admin/question-flags")
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
      setFlags(data.flags || [])
      setFlagsLoadedOnce(true)
    } catch (e) {
      setFlagsError(e?.message || "Failed to load flags")
    } finally {
      setFlagsLoading(false)
    }
  }, [])
  // Auto-load flags the first time the admin opens this section. Without
  // this, the section just shows "No flags loaded yet." until you press the
  // button — easy to miss when you're checking on a student report.
  useEffect(() => {
    if (activeAdminSection === "flags" && !flagsLoadedOnce && !flagsLoading) {
      loadFlags()
    }
  }, [activeAdminSection, flagsLoadedOnce, flagsLoading, loadFlags])
  const [gradingItems, setGradingItems] = useState([])
  const [gradingLoading, setGradingLoading] = useState(false)
  const [gradingBusyId, setGradingBusyId] = useState("")
  const [gradingScratch, setGradingScratch] = useState({})
  const [scratchStudentId, setScratchStudentId] = useState("")
  const [scratchSubjectId, setScratchSubjectId] = useState("")
  const [scratchQts, setScratchQts] = useState([])
  const [scratchQtId, setScratchQtId] = useState("")
  const [scratchQuestions, setScratchQuestions] = useState([])
  const [scratchQuestionKey, setScratchQuestionKey] = useState("")
  const [scratchUrl, setScratchUrl] = useState(null)
  const [scratchLoading, setScratchLoading] = useState(false)
  const [scratchError, setScratchError] = useState("")
  const [focusStudentId, setFocusStudentId] = useState("")
  const [focusData, setFocusData] = useState(null)
  const [focusWeaknessBySubject, setFocusWeaknessBySubject] = useState({})
  const [focusProgressSubjectId, setFocusProgressSubjectId] = useState("")
  const [focusProgressQuestionTypes, setFocusProgressQuestionTypes] = useState([])
  const [focusProgressLoading, setFocusProgressLoading] = useState(false)
  const [focusProgressError, setFocusProgressError] = useState(null)
  const [focusAssessmentAttempts, setFocusAssessmentAttempts] = useState([])
  const [focusLoading, setFocusLoading] = useState(false)
  const [focusError, setFocusError] = useState(null)
  const [dashboardQueue, setDashboardQueue] = useState([])
  const [dashboardQueueLoading, setDashboardQueueLoading] = useState(false)
  const [dashboardQueueError, setDashboardQueueError] = useState(null)
  const [reviewSubjectId, setReviewSubjectId] = useState("")
  const [reviewStudentId, setReviewStudentId] = useState("")
  const [practiceSubjectId, setPracticeSubjectId] = useState("")
  const [practiceStudentId, setPracticeStudentId] = useState("")
  const [calendarStudentId, setCalendarStudentId] = useState("")
  const [planSubjectId, setPlanSubjectId] = useState("")
  const [planAnchorDate, setPlanAnchorDate] = useState("")
  const [planFrontierIndex, setPlanFrontierIndex] = useState("")
  const [planMode, setPlanMode] = useState("plan")
  const [planIncludeCommitted, setPlanIncludeCommitted] = useState(false)
  const [planTypesPerHour, setPlanTypesPerHour] = useState(3)
  const [planSections, setPlanSections] = useState([])
  const [planSectionsLoading, setPlanSectionsLoading] = useState(false)
  const [planPreview, setPlanPreview] = useState(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [scoreBackfillLoading, setScoreBackfillLoading] = useState(false)
  const [planError, setPlanError] = useState(null)
  const [planNotice, setPlanNotice] = useState("")
  const [sessionFrontierData, setSessionFrontierData] = useState(null)
  const [sessionFrontierLoading, setSessionFrontierLoading] = useState(false)
  const [sessionFrontierError, setSessionFrontierError] = useState(null)
  const [calendarRowsData, setCalendarRowsData] = useState(null)
  const [calendarRowsLoading, setCalendarRowsLoading] = useState(false)
  const [calendarRowsError, setCalendarRowsError] = useState(null)
  const [calendarRowsFetchedAt, setCalendarRowsFetchedAt] = useState(0)
  const [activeUsers, setActiveUsers] = useState([])
  const [activeUsersLoading, setActiveUsersLoading] = useState(false)
  const [activeUsersError, setActiveUsersError] = useState(null)
  const [practiceRevision, setPracticeRevision] = useState(null)
  const [practiceLoading, setPracticeLoading] = useState(false)
  const [practiceError, setPracticeError] = useState(null)
  const [reviewItems, setReviewItems] = useState([])
  const [reviewLoading, setReviewLoading] = useState(false)
  const [reviewError, setReviewError] = useState(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewSelectedId, setReviewSelectedId] = useState("")
  const [reviewSelectedLo, setReviewSelectedLo] = useState("")
  const [reviewPage, setReviewPage] = useState(1)
  const [reviewHoverLo, setReviewHoverLo] = useState("")
  const [reviewHoverTypeId, setReviewHoverTypeId] = useState("")
  const [reviewHoverProblem, setReviewHoverProblem] = useState("")
  const [reviewPinnedProblem, setReviewPinnedProblem] = useState("")
  const [reviewMorphTick, setReviewMorphTick] = useState(0)
  const [reviewMorphing, setReviewMorphing] = useState(false)
  const [reviewProblemDrafts, setReviewProblemDrafts] = useState({})
  const [reviewNotice, setReviewNotice] = useState("")
  const [reviewViz, setReviewViz] = useState({ width: 0, height: 0, paths: [], dots: [] })
  const reviewWorkspaceRef = useRef(null)
  const reviewBoardRef = useRef(null)
  const reviewEditorRef = useRef(null)
  const reviewEditorInnerRef = useRef(null)
  const liveNotesApiRef = useRef(null)
  const liveNotesSceneRef = useRef(null)
  const loRefs = useRef({})
  const typeRefs = useRef({})
  const problemRefs = useRef({})
  const reviewPaneOpenRef = useRef(false)
  const excalidrawApiRef = useRef(null)
  const homeworkRequestRef = useRef(0)
  const planSectionsReqRef = useRef(0)
  const focusStudent = students.find(s => s.id === focusStudentId) || null
  const focusSubjects = focusData?.subjects || []
  const focusProgressSubject = focusSubjects.find((sub) => sub.id === focusProgressSubjectId) || null
  const liveSelectedItem = livePlan.find((item) => item.id === liveSelectedId) || null
  const liveIsPracticeMode = livePlanFlow?.mode === "practice"
  const liveCurrentPlan = livePlan.filter((item) => item.planKind === "current")
  const liveFuturePlan = livePlan.filter((item) => item.planKind === "future")
  const livePracticePlan = livePlan.filter((item) => item.planKind === "practice")
  const liveCoveredCount = [...livePreClassSuggestions, ...liveCurrentPlan, ...liveFuturePlan, ...livePracticePlan, ...liveTaggedSuggestions].filter((item) => liveCoveredSelection[getLiveStackKey(item)]).length
  const liveCoveredCurrentCount = liveCurrentPlan.filter((item) => liveCoveredSelection[getLiveStackKey(item)]).length
  const liveCoveredFutureCount = liveFuturePlan.filter((item) => liveCoveredSelection[getLiveStackKey(item)]).length
  const liveCoveredPracticeCount = livePracticePlan.filter((item) => liveCoveredSelection[getLiveStackKey(item)]).length
  const liveCoveredPreCount = livePreClassSuggestions.filter((item) => liveCoveredSelection[getLiveStackKey(item)]).length
  const liveCoveredTaggedCount = liveTaggedSuggestions.filter((item) => liveCoveredSelection[getLiveStackKey(item)]).length
  const liveFinalStack = buildLiveFinalStack([
    ...livePreClassSuggestions,
    ...liveCurrentPlan,
    ...liveFuturePlan,
    ...livePracticePlan,
    ...liveTaggedSuggestions,
  ], liveCoveredSelection)

  useEffect(() => {
    if (demoMode) return
    if (status === "unauthenticated") router.replace("/")
    if (status === "authenticated" && session?.user?.email !== ADMIN_EMAIL) router.replace("/dashboard")
  }, [status, session, router, demoMode])

  useEffect(() => {
    if (lightMode) document.body.classList.add("admin-light")
    else document.body.classList.remove("admin-light")
    return () => document.body.classList.remove("admin-light")
  }, [lightMode])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (tz) setAdminTimezone(tz)
    } catch {}
  }, [])

  useEffect(() => {
    if (router.query.calendarConnected) setCalendarStatus("connected")
    if (router.query.calendarError) setCalendarStatus("error:" + router.query.calendarError)
  }, [router.query])

  useEffect(() => {
    fetch("/api/admin/calendar-status")
      .then(r => r.json())
      .then(d => { if (d.connected) setCalendarStatus("connected") })
      .catch(() => {})
  }, [])

  // Load students + subjects
  useEffect(() => {
    if (!authReady) return
    fetch("/api/admin/import")
      .then(r => r.json())
      .then(d => {
        setStudents(d.students || [])
        setSubjects(d.subjects || [])
        setContentBanks(d.contentBanks || [])
        const firstStudentId = d.students?.[0]?.id || ""
        if (firstStudentId) {
          if (!focusStudentId) setFocusStudentId(firstStudentId)
          if (!liveStudentId) setLiveStudentId(firstStudentId)
          if (!importStudent) setImportStudent(firstStudentId)
          if (!contentStudent) setContentStudent(firstStudentId)
          if (!contextStudent) setContextStudent(firstStudentId)
          if (!reschedStudent) setReschedStudent(firstStudentId)
          if (!hwStudent) setHwStudent(firstStudentId)
          if (!practiceStudentId) setPracticeStudentId(firstStudentId)
          if (!reviewStudentId) setReviewStudentId(firstStudentId)
          if (!pacingStudentId) setPacingStudentId(firstStudentId)
          if (!calendarStudentId) setCalendarStudentId(firstStudentId)
        }
      })
      .catch(() => {})
  }, [authReady, focusStudentId, liveStudentId, importStudent, contentStudent, contextStudent, reschedStudent, hwStudent, practiceStudentId, reviewStudentId, pacingStudentId, calendarStudentId])

  useEffect(() => {
    if (!focusStudentId || !authReady) {
      setFocusData(null)
      setFocusWeaknessBySubject({})
      setFocusAssessmentAttempts([])
      setFocusProgressSubjectId("")
      setFocusProgressQuestionTypes([])
      setFocusProgressError(null)
      setFocusError(null)
      return
    }
    setFocusLoading(true)
    setFocusError(null)
    Promise.all([
      fetch(`/api/student/dashboard?as=${focusStudentId}`).then(r => r.json()),
      fetch(`/api/admin/assessment-attempts?studentId=${focusStudentId}`).then(r => r.json()),
    ])
      .then(async ([dash, assessments]) => {
        if (dash?.error) throw new Error(dash.error)
        setFocusData(dash)
        setFocusAssessmentAttempts(assessments?.attempts || [])
        const subjectList = dash?.subjects || []
        if (!subjectList.length) {
          setFocusWeaknessBySubject({})
          return
        }
        const weaknessEntries = await Promise.all(
          subjectList.map(async (sub) => {
            try {
              const weak = await fetch(`/api/student/weakness?as=${focusStudentId}&subjectId=${sub.id}`).then(r => r.json())
              const topics = weak?.weaknessMap?.topics || weak?.weaknessMap || {}
              return [sub.id, { subjectName: sub.name, topics }]
            } catch {
              return [sub.id, { subjectName: sub.name, topics: {} }]
            }
          })
        )
        setFocusWeaknessBySubject(Object.fromEntries(weaknessEntries))
      })
      .catch(err => {
        setFocusError(err.message || "Failed to load student metrics")
        setFocusData(null)
        setFocusWeaknessBySubject({})
        setFocusAssessmentAttempts([])
        setFocusProgressSubjectId("")
        setFocusProgressQuestionTypes([])
        setFocusProgressError(null)
      })
      .finally(() => setFocusLoading(false))
  }, [focusStudentId, authReady])

  useEffect(() => {
    if (!focusSubjects.length) {
      setFocusProgressSubjectId("")
      return
    }
    if (!focusProgressSubjectId || !focusSubjects.find((sub) => sub.id === focusProgressSubjectId)) {
      setFocusProgressSubjectId(focusSubjects[0].id)
    }
  }, [focusSubjects, focusProgressSubjectId])

  useEffect(() => {
    if (!focusStudentId || !focusProgressSubjectId || activeAdminSection !== "dashboard") {
      setFocusProgressQuestionTypes([])
      setFocusProgressError(null)
      return
    }
    let cancelled = false
    setFocusProgressLoading(true)
    setFocusProgressError(null)
    fetch(`/api/student/progress-graph?subjectId=${encodeURIComponent(focusProgressSubjectId)}&as=${encodeURIComponent(focusStudentId)}`, {
      headers: { "cache-control": "no-cache" },
      cache: "no-store",
    })
      .then((r) => readJsonOrThrow(r, "Student progress"))
      .then((data) => {
        if (cancelled) return
        if (data?.error) throw new Error(data.error)
        setFocusProgressQuestionTypes(Array.isArray(data?.questionTypes) ? data.questionTypes : [])
      })
      .catch((err) => {
        if (cancelled) return
        setFocusProgressQuestionTypes([])
        setFocusProgressError(err.message || "Failed to load progress graph")
      })
      .finally(() => {
        if (!cancelled) setFocusProgressLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [focusStudentId, focusProgressSubjectId, activeAdminSection])

  useEffect(() => {
    if (!authReady || !students.length) {
      setDashboardQueue([])
      setDashboardQueueError(null)
      return
    }
    let cancelled = false
    setDashboardQueueLoading(true)
    setDashboardQueueError(null)

    Promise.all(
      students.map(async (student) => {
        const [dashRes, attemptRes] = await Promise.all([
          fetch(`/api/student/dashboard?as=${student.id}`).then((r) => r.json()).catch(() => ({ error: "Dashboard load failed" })),
          fetch(`/api/admin/assessment-attempts?studentId=${student.id}`).then((r) => r.json()).catch(() => ({ attempts: [] })),
        ])
        if (dashRes?.error) return []
        const attempts = Array.isArray(attemptRes?.attempts) ? attemptRes.attempts : []
        const studentTimezone = dashRes?.student?.timezone || student.timezone || "UTC"
        return (dashRes?.subjects || []).flatMap((subject) =>
          (subject.upcomingClasses || []).map((cls) => {
            const sessionDate = getDateKeyInTimezone(cls.startTime, studentTimezone)
            const adminSessionDate = getDateKeyInTimezone(cls.startTime, adminTimezone)
            const preAttempt = attempts
              .filter((attempt) => attempt.mode === "pre" && attempt.subjectId === subject.id && String(attempt.sessionDate || "") === String(sessionDate || ""))
              .sort((a, b) => String(b.unlockAt || "").localeCompare(String(a.unlockAt || "")))[0] || null
            const exitAttempt = attempts
              .filter((attempt) => attempt.mode === "exit" && attempt.subjectId === subject.id && String(attempt.sessionDate || "") === String(sessionDate || ""))
              .sort((a, b) => String(b.unlockAt || "").localeCompare(String(a.unlockAt || "")))[0] || null
            const preStatus = preAttempt?.status || "locked"
            const readinessLabel =
              preStatus === "Completed" || preStatus === "completed" ? "Ready for live class"
              : preStatus === "unlocked" || preStatus === "available" ? "Pre-class open"
              : "Needs review"
            return {
              studentId: student.id,
              studentName: student.name,
              studentTimezone,
              subjectId: subject.id,
              subjectName: subject.name,
              startTime: cls.startTime || null,
              endTime: cls.endTime || null,
              duration: cls.duration || subject.duration || 60,
              sessionDate,
              adminSessionDate,
              zoomLink: cls.zoomLink || subject.zoomLink || null,
              preAttempt,
              exitAttempt,
              preStatus,
              readinessLabel,
            }
          })
        )
      })
    )
      .then((rows) => {
        if (cancelled) return
        setDashboardQueue(
          rows
            .flat()
            .filter((item) => item?.subjectId && item?.studentId && item?.startTime)
            .sort((a, b) => new Date(a.startTime || 0).getTime() - new Date(b.startTime || 0).getTime())
        )
      })
      .catch((err) => {
        if (cancelled) return
        setDashboardQueue([])
        setDashboardQueueError(err.message || "Failed to load class queue")
      })
      .finally(() => {
        if (!cancelled) setDashboardQueueLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [authReady, students, adminTimezone])

  useEffect(() => {
    if (!authReady || activeAdminSection !== "dashboard") return undefined
    let cancelled = false

    const loadActiveUsers = async ({ silent = false } = {}) => {
      if (!silent) setActiveUsersLoading(true)
      setActiveUsersError(null)
      try {
        const res = await fetch("/api/admin/active-users?minutes=5")
        const data = await readJsonOrThrow(res, "Active users")
        if (cancelled) return
        if (data?.error) throw new Error(data.error)
        setActiveUsers(Array.isArray(data?.activeUsers) ? data.activeUsers : [])
      } catch (err) {
        if (cancelled) return
        setActiveUsers([])
        setActiveUsersError(err.message || "Failed to load active users")
      } finally {
        if (!silent && !cancelled) setActiveUsersLoading(false)
      }
    }

    loadActiveUsers()
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      loadActiveUsers({ silent: true })
    }, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [authReady, activeAdminSection])

  useEffect(() => {
    if (!focusStudentId) return
    setEndClassSubjectId("")
    setEndClassTopics([])
    setEndClassSessionDate("")
    setEndClassSelection({})
  }, [focusStudentId])

  useEffect(() => {
    if (!focusSubjects.length) {
      setEndClassSubjectId("")
      return
    }
    if (!endClassSubjectId || !focusSubjects.find(sub => sub.id === endClassSubjectId)) {
      setEndClassSubjectId(focusSubjects[0].id)
    }
  }, [focusSubjects, endClassSubjectId])

  useEffect(() => {
    if (!authReady || !calendarStudentId || !planSubjectId) {
      setSessionFrontierData(null)
      setSessionFrontierError(null)
      return
    }
    let cancelled = false
    setSessionFrontierLoading(true)
    setSessionFrontierError(null)
    fetch(`/api/admin/session-frontier?studentId=${encodeURIComponent(calendarStudentId)}&subjectId=${encodeURIComponent(planSubjectId)}`)
      .then((r) => readJsonOrThrow(r, "Session frontier"))
      .then((data) => {
        if (cancelled) return
        if (data?.error) throw new Error(data.error)
        setSessionFrontierData(data)
      })
      .catch((err) => {
        if (cancelled) return
        setSessionFrontierData(null)
        setSessionFrontierError(err.message || "Failed to load session history")
      })
      .finally(() => {
        if (!cancelled) setSessionFrontierLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authReady, calendarStudentId, planSubjectId])

  async function refreshSessionFrontier(studentId = calendarStudentId, subjectId = planSubjectId) {
    if (!studentId || !subjectId) {
      setSessionFrontierData(null)
      return
    }
    setSessionFrontierLoading(true)
    setSessionFrontierError(null)
    try {
      const r = await fetch(`/api/admin/session-frontier?studentId=${encodeURIComponent(studentId)}&subjectId=${encodeURIComponent(subjectId)}`)
      const data = await readJsonOrThrow(r, "Session frontier")
      if (data?.error) throw new Error(data.error)
      setSessionFrontierData(data)
    } catch (err) {
      setSessionFrontierData(null)
      setSessionFrontierError(err.message || "Failed to load session history")
    } finally {
      setSessionFrontierLoading(false)
    }
  }

  async function refreshCalendarRows(studentId = calendarStudentId, subjectId = planSubjectId, { silent = false } = {}) {
    if (!studentId || !subjectId) {
      setCalendarRowsData(null)
      setCalendarRowsFetchedAt(0)
      return
    }
    if (!silent) setCalendarRowsLoading(true)
    setCalendarRowsError(null)
    try {
      const r = await fetch(`/api/admin/calendar-rows?studentId=${encodeURIComponent(studentId)}&subjectId=${encodeURIComponent(subjectId)}`)
      const data = await readJsonOrThrow(r, "Calendar rows")
      if (data?.error) throw new Error(data.error)
      setCalendarRowsData(data)
      setCalendarRowsFetchedAt(Date.now())
    } catch (err) {
      setCalendarRowsData(null)
      setCalendarRowsError(err.message || "Failed to load draft and score rows")
    } finally {
      if (!silent) setCalendarRowsLoading(false)
    }
  }

  useEffect(() => {
    if (!authReady || !calendarStudentId || !planSubjectId) {
      setCalendarRowsData(null)
      setCalendarRowsError(null)
      setCalendarRowsFetchedAt(0)
      return
    }
    refreshCalendarRows(calendarStudentId, planSubjectId)
  }, [authReady, calendarStudentId, planSubjectId])

  useEffect(() => {
    if (!authReady || !calendarStudentId || !planSubjectId) return
    const STALE_MS = 60000
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      if (!calendarRowsFetchedAt || (Date.now() - calendarRowsFetchedAt) >= STALE_MS) {
        refreshCalendarRows(calendarStudentId, planSubjectId, { silent: true })
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [authReady, calendarStudentId, planSubjectId, calendarRowsFetchedAt])

  useEffect(() => {
    if (!focusStudentId || !endClassSubjectId) {
      setEndClassTopics([])
      setEndClassSessionDate("")
      setEndClassSelection({})
      setEndClassError(null)
      return
    }
    setEndClassLoading(true)
    setEndClassError(null)
    fetch(`/api/admin/end-class-context?studentId=${focusStudentId}&subjectId=${endClassSubjectId}`)
      .then(r => r.json())
      .then(d => {
        const sessionDate = d.sessionDate || ""
        const topics = d.topics || []
        setEndClassSessionDate(sessionDate)
        setEndClassTopics(topics)
        setEndClassSelection(Object.fromEntries(topics.map(topic => [topic.id, true])))
      })
      .catch(() => {
        setEndClassSessionDate("")
        setEndClassTopics([])
        setEndClassSelection({})
        setEndClassError("Failed to load current class topics")
      })
      .finally(() => setEndClassLoading(false))
  }, [focusStudentId, endClassSubjectId])

  useEffect(() => {
    const nextSubjectId = getResolvedSubjectId(liveStudentId, liveSubjectId, { preferFirst: true })
    if (nextSubjectId !== liveSubjectId) setLiveSubjectId(nextSubjectId)
  }, [liveStudentId, students, subjects, liveSubjectId])

  useEffect(() => {
    if (!liveTimerRunning || liveTimerSeconds <= 0) return
    const tick = setInterval(() => {
      setLiveTimerSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(tick)
          setLiveTimerRunning(false)
          setLiveTimerExpired(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [liveTimerRunning, liveTimerSeconds])

  useEffect(() => {
    const nextSubjectId = getResolvedSubjectId(practiceStudentId, practiceSubjectId, { preferFirst: true })
    if (nextSubjectId !== practiceSubjectId) setPracticeSubjectId(nextSubjectId)
  }, [practiceStudentId, students, subjects, practiceSubjectId])

  useEffect(() => {
    if (!practiceStudentId || !practiceSubjectId) {
      setPracticeRevision(null)
      setPracticeError(null)
      return
    }
    setPracticeLoading(true)
    setPracticeError(null)
    fetch(`/api/admin/practice-revision?studentId=${practiceStudentId}&subjectId=${practiceSubjectId}`)
      .then(r => r.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error)
        setPracticeRevision(data)
      })
      .catch((err) => {
        setPracticeRevision(null)
        setPracticeError(err.message || "Failed to load practice revision list")
      })
      .finally(() => setPracticeLoading(false))
  }, [practiceStudentId, practiceSubjectId])

  useEffect(() => {
    const nextSubjectId = getResolvedSubjectId(reviewStudentId, reviewSubjectId, { preferFirst: true })
    if (nextSubjectId !== reviewSubjectId) setReviewSubjectId(nextSubjectId)
  }, [reviewStudentId, students, subjects, reviewSubjectId])

  useEffect(() => {
    if (!reviewStudentId || !reviewSubjectId) {
      setReviewItems([])
      setReviewSelectedId("")
      setReviewError(null)
      return
    }
    setReviewLoading(true)
    setReviewError(null)
    fetch(`/api/admin/review-queue?studentId=${reviewStudentId}&subjectId=${reviewSubjectId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        const items = d.items || []
        setReviewItems(items)
        setReviewSelectedId(items[0]?.id || "")
        setReviewSelectedLo("")
        setReviewPage(1)
      })
      .catch(err => {
        setReviewItems([])
        setReviewSelectedId("")
        setReviewSelectedLo("")
        setReviewError(err.message || "Failed to load review queue")
      })
      .finally(() => setReviewLoading(false))
  }, [reviewStudentId, reviewSubjectId])

  async function loadPacingGuideFor(studentId = pacingStudentId, subId = pacingSubject) {
    if (!studentId || !subId) {
      setPacingEntries([]); setPacingLocked(false); setPacingSource(null)
      setPacingSaved(false); setPacingError(null); setPacingNotice("")
      return
    }
    setPacingLoading(true); setPacingSaved(false); setPacingError(null); setPacingNotice("")
    try {
      const res = await fetch(`/api/admin/pacing-guide?subjectId=${subId}&studentId=${encodeURIComponent(studentId)}`)
      const data = await readJsonOrThrow(res, "Pacing guide")
      if (!res.ok) throw new Error(data.error || "Failed to load pacing guide")
      setPacingLocked(!!data.locked)
      setPacingSource(data.source || null)
      setPacingEntries(data.entries || [])
    } catch (err) {
      setPacingEntries([]); setPacingLocked(false); setPacingSource(null)
      setPacingError(err.message || "Failed to load pacing guide")
    } finally {
      setPacingLoading(false)
    }
  }

  async function loadPacingSubjectConfig(subId = pacingSubject) {
    if (!subId) {
      setPacingSubjectConfig(null)
      setPacingSubjectBanks([])
      setPacingSubjectOverlays([])
      setPacingConfigError(null)
      setPacingConfigNotice("")
      return
    }
    setPacingConfigLoading(true)
    setPacingConfigError(null)
    setPacingConfigNotice("")
    try {
      const res = await fetch(`/api/admin/subject-config?subjectId=${encodeURIComponent(subId)}`)
      const data = await readJsonOrThrow(res, "Subject config")
      if (!res.ok) throw new Error(data.error || "Failed to load subject config")
      setPacingSubjectConfig(data.subject || null)
      setPacingSubjectBanks(data.banks || [])
      setPacingSubjectOverlays(data.overlays || [])
    } catch (err) {
      setPacingSubjectConfig(null)
      setPacingSubjectBanks([])
      setPacingSubjectOverlays([])
      setPacingConfigError(err.message || "Failed to load subject config")
    } finally {
      setPacingConfigLoading(false)
    }
  }

  async function savePacingSubjectConfig(nextConfig = {}) {
    if (!pacingSubject) return
    setPacingConfigSaving(true)
    setPacingConfigError(null)
    setPacingConfigNotice("")
    try {
      const res = await fetch("/api/admin/subject-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: pacingSubject,
          contentBankId: nextConfig.content_bank_id || null,
          pacingMode: nextConfig.pacing_mode || "unconfigured",
          activeOverlayId: nextConfig.active_overlay_id || null,
        }),
      })
      const data = await readJsonOrThrow(res, "Save subject config")
      if (!res.ok) throw new Error(data.error || "Failed to save subject config")
      setPacingSubjectConfig(data.subject || null)
      setPacingSubjectBanks(data.banks || [])
      setPacingSubjectOverlays(data.overlays || [])
      setPacingConfigNotice("Saved subject configuration.")
    } catch (err) {
      setPacingConfigError(err.message || "Failed to save subject config")
    } finally {
      setPacingConfigSaving(false)
    }
  }


  function getSubjectsForStudent(studentId) {
    if (!studentId) return []
    const student = students.find(s => s.id === studentId)
    if (!student) return []
    if (!student.subjectIds?.length) return []
    const allowed = new Set(student.subjectIds)
    return subjects.filter(s => allowed.has(s.id))
  }

  function getResolvedSubjectId(studentId, currentSubjectId, { preferFirst = false } = {}) {
    const allowed = getSubjectsForStudent(studentId)
    if (!allowed.length) return ""
    if (currentSubjectId && allowed.some((sub) => sub.id === currentSubjectId)) return currentSubjectId
    if (allowed.length === 1 || preferFirst) return allowed[0].id
    return ""
  }

  async function loadLiveClassPlan(studentId = liveStudentId, subjectId = liveSubjectId, dateStr = liveSessionDate) {
    if (!studentId || !subjectId || !dateStr) {
      setLivePlan([])
      setLiveDraftMeta(null)
      setLivePlanFlow(null)
      setLiveNotesText("")
      setLiveNotesScene(null)
      liveNotesSceneRef.current = null
      setLiveNotesSavedAt("")
      setLivePreviousNotes(null)
      setLiveNotesError("")
      setLiveCoveredSelection({})
      setLivePreClassSuggestions([])
      setLiveTaggedSuggestions([])
      setLiveSessionMeta(null)
      setLiveSelectedId("")
      setLiveFlow(null)
      setLiveError(null)
      setLiveNotice("")
      return
    }
    setLiveLoading(true)
    setLiveError(null)
    setLiveNotice("")
    setLiveFlow(null)
    setLiveFlowError(null)
    setLiveSelectedId("")
    try {
      const params = new URLSearchParams({ studentId, subjectId, sessionDate: dateStr })
      const planRes = await fetch(`/api/admin/live-class-plan?${params.toString()}`)
      const data = await readJsonOrThrow(planRes, "Live class plan")
      if (!planRes.ok || data.error) throw new Error(data.error || "Failed to load live class plan")

      const attemptsResult = await fetch(`/api/admin/assessment-attempts?studentId=${encodeURIComponent(studentId)}&subjectId=${encodeURIComponent(subjectId)}`)
        .then(async (res) => ({ ok: res.ok, data: await readJsonOrThrow(res, "Assessment attempts") }))
        .catch((err) => ({ ok: false, data: { error: err.message || "Failed to load assessment attempts" } }))
      const draft = data.draft || null
      const combined = [...(draft?.current || data.questions || []), ...(draft?.future || data.futureQuestions || []), ...(draft?.practice || data.practiceQuestions || [])]
      setLivePlan(combined)
      setLiveDraftMeta(draft)
      setLivePlanFlow(data.flow || null)
      const currentNotes = data?.notes?.current || null
      const previousNotes = data?.notes?.previous || null
      setLiveNotesText(currentNotes?.notesText || data?.session?.sessionNotes || "")
      setLiveNotesScene(currentNotes?.scene || null)
      liveNotesSceneRef.current = currentNotes?.scene || null
      setLiveNotesSavedAt(currentNotes?.updatedAt || "")
      setLivePreviousNotes(
        data?.previousSession
          ? {
              ...data.previousSession,
              notesText: previousNotes?.notesText || data.previousSession.sessionNotes || "",
              scene: previousNotes?.scene || null,
              updatedAt: previousNotes?.updatedAt || "",
            }
          : null
      )
      setLiveNotesError("")
      const attemptsOk = !!attemptsResult?.ok && !attemptsResult?.data?.error
      const missedSuggestions = attemptsOk
        ? buildLivePreClassSuggestions(attemptsResult.data.attempts || [], combined, dateStr)
        : []
      const seededSelection = {
        ...Object.fromEntries(combined.map((item) => [getLiveStackKey(item), false])),
        ...Object.fromEntries(missedSuggestions.map((item) => [getLiveStackKey(item), true])),
      }
      setLivePreClassSuggestions(missedSuggestions)
      setLiveCoveredSelection(seededSelection)
      setLiveTaggedSuggestions([])
      setLiveSessionMeta(data.session || null)
      if (!attemptsOk) {
        setLiveNotice(`Live plan loaded. No pre-class suggestion data was available yet.`)
      }
      if (combined.length) setLiveSelectedId(combined[0].id)
    } catch (err) {
      setLiveError(err.message || "Failed to load live class plan")
      setLivePlan([])
      setLiveDraftMeta(null)
      setLivePlanFlow(null)
      setLiveNotesText("")
      setLiveNotesScene(null)
      liveNotesSceneRef.current = null
      setLiveNotesSavedAt("")
      setLivePreviousNotes(null)
      setLiveCoveredSelection({})
      setLivePreClassSuggestions([])
      setLiveTaggedSuggestions([])
      setLiveSessionMeta(null)
    } finally {
      setLiveLoading(false)
    }
  }

  async function generateLiveFlow(item) {
    if (!item?.questionPageId || !liveStudentId || !liveSubjectId) return
    setLiveFlowLoading(true)
    setLiveFlowError(null)
    setLiveTimerRunning(false)
    setLiveTimerExpired(false)
    try {
      const res = await fetch("/api/admin/live-class-flow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: liveStudentId,
          subjectId: liveSubjectId,
          questionPageId: item.questionPageId,
          questionTitle: item.title,
          unit: item.unit,
          standardCode: item.standardCode,
        }),
      })
      const data = await readJsonOrThrow(res, "Live class flow")
      if (!res.ok || data.error) throw new Error(data.error || "Failed to generate live class flow")
      setLiveFlow(data.flow || null)
      setLiveTimerSeconds(Math.max(60, Number(data.flow?.timerSeconds || 420)))
    } catch (err) {
      setLiveFlowError(err.message || "Failed to generate teaching flow")
      setLiveFlow(null)
      setLiveTimerSeconds(0)
    } finally {
      setLiveFlowLoading(false)
    }
  }

  function completeLiveTopic() {
    setLiveTimerRunning(false)
    setLiveTimerExpired(false)
    if (liveSelectedId) {
      setLiveCoveredSelection((prev) => ({ ...prev, [getLiveStackKey(liveSelectedItem || { id: liveSelectedId })]: true }))
    }
    const idx = livePlan.findIndex((item) => item.id === liveSelectedId)
    const next = idx >= 0
      ? livePlan.slice(idx + 1).find((item) => !liveCoveredSelection[getLiveStackKey(item)] && item.id !== liveSelectedId) || livePlan[idx + 1] || null
      : null
    if (next) {
      setLiveSelectedId(next.id)
      setLiveFlow(null)
      setLiveTimerSeconds(0)
    }
  }

  function addLiveTangentItem() {
    const title = liveTangentTitle.trim()
    const source = liveTangentSource.trim()
    const notes = liveTangentNotes.trim()
    if (!title && !source && !notes) return
    setLiveTangentItems((prev) => [
      {
        id: `${Date.now()}-${prev.length}`,
        title: title || "External element",
        source,
        notes,
      },
      ...prev,
    ])
    if (liveSelectedItem) {
      const tagged = {
        id: `tagged-${getLiveStackKey(liveSelectedItem)}`,
        questionPageId: liveSelectedItem.questionPageId,
        title: title || liveSelectedItem.title,
        unit: liveSelectedItem.unit || "",
        standardCode: liveSelectedItem.standardCode || "",
        sourceSessionDate: liveSelectedItem.sourceSessionDate || liveSelectedItem.dateIntroduced || liveSessionDate,
        planKind: "tagged_live",
        source,
        notes,
      }
      setLiveTaggedSuggestions((prev) => {
        const filtered = prev.filter((item) => getLiveStackKey(item) !== getLiveStackKey(tagged))
        return [tagged, ...filtered]
      })
    }
    setLiveTangentTitle("")
    setLiveTangentSource("")
    setLiveTangentNotes("")
  }

  function formatTimer(seconds = 0) {
    const mins = Math.floor(Math.max(0, seconds) / 60)
    const secs = Math.max(0, seconds) % 60
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }

  function renderLivePlanCard(item, label) {
    const stackKey = getLiveStackKey(item)
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          setLiveSelectedId(item.id)
          setLiveFlow(null)
          setLiveFlowError(null)
          setLiveTimerExpired(false)
          setLiveTimerRunning(false)
          setLiveTimerSeconds(0)
        }}
        style={{
          ...s.liveQuestionCard,
          ...(liveSelectedId === item.id ? s.liveQuestionCardActive : {}),
          borderColor:
            item.planKind === "pre_miss" ? "#7b4f2f"
            : item.planKind === "tagged_live" ? "#4b6b56"
            : item.planKind === "practice" ? "#4b6b56"
            : item.planKind === "future" ? "#3c5068"
            : (liveCoveredSelection[stackKey] ? "#c9a84c" : undefined),
          background: item.planKind === "future"
            ? (liveSelectedId === item.id ? "#182535" : "#101821")
            : item.planKind === "pre_miss"
              ? (liveSelectedId === item.id ? "#332214" : "#1d1510")
              : item.planKind === "tagged_live"
                ? (liveSelectedId === item.id ? "#16241d" : "#101712")
                : item.planKind === "practice"
                  ? (liveSelectedId === item.id ? "#16241d" : "#101712")
            : undefined,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: item.planKind === "future" ? "#8fb4e6" : item.planKind === "pre_miss" ? "#d9a06b" : item.planKind === "tagged_live" || item.planKind === "practice" ? "#9fd1af" : "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {label}
          </span>
          <span style={{ fontSize: 11, color: "#c9a84c", fontFamily: "'DM Mono', monospace" }}>{Number(item.weaknessScore || 0).toFixed(2)}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: liveSelectedId === item.id ? "#f2dfaf" : "#fff", textAlign: "left" }}>{item.title}</div>
        <div style={{ fontSize: 12, color: "#8e8e8e", marginTop: 6, textAlign: "left" }}>
          {item.unit || "No unit"}{item.standardCode ? ` · ${item.standardCode}` : ""}{item.status ? ` · ${item.status}` : ""}{item.sourceSessionDate ? ` · ${item.planKind === "future" ? "scheduled" : item.planKind === "pre_miss" ? "missed from" : item.planKind === "tagged_live" ? "tagged on" : "date"} ${item.sourceSessionDate}` : ""}
        </div>
        {item.notes && <div style={{ fontSize: 12, color: "#9aa6a0", marginTop: 6, textAlign: "left", lineHeight: 1.4 }}>{item.notes}</div>}
        <label
          style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: liveCoveredSelection[stackKey] ? "#f2dfaf" : "#a0a7b4" }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={!!liveCoveredSelection[stackKey]}
            onChange={(e) => {
              const checked = e.target.checked
              setLiveCoveredSelection((prev) => ({ ...prev, [stackKey]: checked }))
            }}
          />
          {item.planKind === "future"
            ? "Pull into final class stack"
            : item.planKind === "pre_miss"
              ? "Keep in final class stack"
              : item.planKind === "tagged_live"
                ? "Keep tagged item in final stack"
                : item.planKind === "practice"
                  ? "Use in today's practice stack"
                : "Include in final class stack"}
        </label>
      </button>
    )
  }

  async function handleLiveClassCommit(previewExit = false) {
    const taughtIds = liveFinalStack.map((item) => item.questionPageId || item.id).filter(Boolean)
    if (!liveStudentId || !liveSubjectId || !liveSessionDate) {
      setLiveError("Missing student, subject, or session date.")
      return
    }
    if (!taughtIds.length) {
      setLiveError("Mark at least one topic as covered before ending class.")
      return
    }
    setLiveLoading(true)
    setLiveError(null)
    setLiveNotice("")
    try {
      const res = await fetch("/api/admin/end-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: liveStudentId,
          subjectId: liveSubjectId,
          sessionDate: liveSessionDate,
          taughtIds,
          idType: "questionPage",
        }),
      })
      const data = await readJsonOrThrow(res, "End live class")
      if (!res.ok || data?.error) throw new Error(data?.error || "Failed to end class")

      setEndClassSubjectId(liveSubjectId)
      setEndClassSessionDate(liveSessionDate)
      setEndClassTopics(data.exitTopics || [])
      setEndClassSelection(Object.fromEntries((data.exitTopics || []).map((topic) => [topic.id, true])))
      setEndClassNotice(`Class ended. Exit now covers ${data.exitTopics?.length || 0} topic(s).`)

      const movedCount = data.movedTopics?.length || 0
      const pulledCount = data.pulledTopics?.length || 0
      const recoveredCount = data.recoveredTopics?.length || 0
      setLiveNotice(
        `Committed ${data.exitTopics?.length || 0} taught topic(s). ${movedCount} deferred from today's draft. ${pulledCount} pulled forward from future sessions. ${recoveredCount} came from pre-class recovery.` +
        (data.pacingUpdated ? ` Pacing was updated and ${data.pacingMovedDraftRows || 0} future draft row(s) were reflowed.` : "")
      )

      if (previewExit) {
        window.open(
          `/assessment?subjectId=${liveSubjectId}&mode=exit&as=${liveStudentId}&sessionDate=${encodeURIComponent(liveSessionDate)}&previewIds=${encodeURIComponent(JSON.stringify((data.exitTopicIds || [])))}`,
          "_blank"
        )
      }

      await loadLiveClassPlan(liveStudentId, liveSubjectId, liveSessionDate)
    } catch (err) {
      setLiveError(err.message || "Failed to end class")
    } finally {
      setLiveLoading(false)
    }
  }

  async function saveLiveSessionNotes() {
    if (!liveStudentId || !liveSubjectId || !liveSessionDate) {
      setLiveNotesError("Pick a student, subject, and session date before saving notes.")
      return
    }
    setLiveNotesSaving(true)
    setLiveNotesError("")
    try {
      const res = await fetch("/api/admin/live-session-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: liveStudentId,
          subjectId: liveSubjectId,
          sessionDate: liveSessionDate,
          notesText: liveNotesText,
          scene: liveNotesSceneRef.current || liveNotesScene,
        }),
      })
      const data = await readJsonOrThrow(res, "Live session notes")
      if (!res.ok || data.error) throw new Error(data.error || "Failed to save session notes")
      liveNotesSceneRef.current = liveNotesSceneRef.current || liveNotesScene
      setLiveNotesSavedAt(data?.notes?.updatedAt || new Date().toISOString())
      setLiveNotice(`Saved live session notes for ${liveSessionDate}.`)
    } catch (err) {
      setLiveNotesError(err.message || "Failed to save session notes")
    } finally {
      setLiveNotesSaving(false)
    }
  }


  useEffect(() => {
    const nextSubjectId = getResolvedSubjectId(importStudent, importSubject)
    if (nextSubjectId !== importSubject) setImportSubject(nextSubjectId)
  }, [importStudent, importSubject, students, subjects])

  useEffect(() => {
    const nextSubjectId = getResolvedSubjectId(reschedStudent, reschedSubject)
    if (nextSubjectId !== reschedSubject) setReschedSubject(nextSubjectId)
  }, [reschedStudent, reschedSubject, students, subjects])

  useEffect(() => {
    const nextSubjectId = getResolvedSubjectId(hwStudent, hwSubject)
    if (nextSubjectId !== hwSubject) setHwSubject(nextSubjectId)
  }, [hwStudent, hwSubject, students, subjects])

  useEffect(() => {
    const nextSubjectId = getResolvedSubjectId(contentStudent, contentSubject)
    if (nextSubjectId !== contentSubject) setContentSubject(nextSubjectId)
  }, [contentStudent, contentSubject, students, subjects])

  useEffect(() => {
    const nextSubjectId = getResolvedSubjectId(contextStudent, contextSubject)
    if (nextSubjectId !== contextSubject) setContextSubject(nextSubjectId)
  }, [contextStudent, contextSubject, students, subjects])

  useEffect(() => {
    const nextSubjectId = getResolvedSubjectId(pacingStudentId, pacingSubject, { preferFirst: true })
    if (nextSubjectId !== pacingSubject) setPacingSubject(nextSubjectId)
  }, [pacingStudentId, pacingSubject, students, subjects])

  // Auto-resolve subject + fetch frontier sections for the current student.
  // Uses a request counter so stale responses from a previous student are discarded.
  useEffect(() => {
    const nextSubjectId = getResolvedSubjectId(calendarStudentId, planSubjectId, { preferFirst: true })
    if (nextSubjectId !== planSubjectId) {
      setPlanSubjectId(nextSubjectId)
      // subject change will re-trigger this effect; let that pass do the fetch
      return
    }

    setPlanSections([])
    setPlanFrontierIndex("")
    setPlanPreview(null)
    setPlanError(null)
    setPlanNotice("")

    if (!calendarStudentId || !nextSubjectId) {
      setPlanSectionsLoading(false)
      return
    }

    const reqId = ++planSectionsReqRef.current
    setPlanSectionsLoading(true)
    const student = students.find(st => st.id === calendarStudentId)
    const url = `/api/admin/pacing-guide?subjectId=${nextSubjectId}&studentId=${encodeURIComponent(calendarStudentId)}&studentState=${encodeURIComponent(student?.state || "")}`
    fetch(url)
      .then(r => r.json())
      .then(d => { if (planSectionsReqRef.current === reqId) setPlanSections(d.entries || []) })
      .catch(() => { if (planSectionsReqRef.current === reqId) setPlanSections([]) })
      .finally(() => { if (planSectionsReqRef.current === reqId) setPlanSectionsLoading(false) })
  }, [calendarStudentId, planSubjectId, students, subjects])

  useEffect(() => {
    if (!hwStudent || !hwSubject) {
      homeworkRequestRef.current += 1
      setHwQuestions([])
      setHwSelected({})
      setHwError(null)
      return
    }
    const requestId = homeworkRequestRef.current + 1
    homeworkRequestRef.current = requestId
    setHwLoading(true)
    setHwError(null)
    setHwResult(null)
    fetch(`/api/admin/homework?studentId=${hwStudent}&subjectId=${hwSubject}`)
      .then(r => r.json())
      .then(d => {
        if (homeworkRequestRef.current !== requestId) return
        if (d.error) { setHwError(d.error); setHwQuestions([]); setHwCycleInfo(null); setHwAttempts([]); return }
        setHwQuestions(d.questions || [])
        setHwCycleInfo(d.cycle || null)
        setHwAttempts(d.attempts || [])
      })
      .catch(() => {
        if (homeworkRequestRef.current !== requestId) return
        setHwError("Failed to load homework questions")
      })
      .finally(() => {
        if (homeworkRequestRef.current !== requestId) return
        setHwLoading(false)
      })
  }, [hwStudent, hwSubject])



  async function mutateHomework(action) {
    const selected = hwQuestions.filter(q => hwSelected[q.id])
    if (!selected.length) return
    setHwMutating(true)
    setHwResult(null)
    setHwError(null)
    try {
      const res = await fetch("/api/admin/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          items: selected.map(q => ({
            scoreRowId: q.scoreRowId || null,
            studentId: hwStudent,
            subjectId: hwSubject,
            questionId: q.id,
            title: q.title,
            standardCode: q.standardCode || "",
            unit: q.unit || "",
          })),
          sessionDate: hwSessionDate,
        })
      })
      const data = await res.json()
      if (data.error) setHwError(data.error)
      else {
        const added = data.updated || 0
        const created = data.created || 0
        if (action === "add") {
          setHwResult(`Added ${added} existing and created ${created} new homework row(s).`)
        } else {
          setHwResult(`Removed ${added} homework row(s).`)
        }
        // Reload
        const refreshed = await fetch(`/api/admin/homework?studentId=${hwStudent}&subjectId=${hwSubject}`)
        const d = await refreshed.json()
        setHwQuestions(d.questions || [])
        setHwCycleInfo(d.cycle || null)
        setHwAttempts(d.attempts || [])
        setHwSelected({})
      }
    } catch (e) {
      setHwError(e.message || "Failed to update homework")
    } finally {
      setHwMutating(false)
    }
  }

  async function uploadHomeworkDoc() {
    if (!hwDocFile || !hwStudent || !hwSubject) return
    setHwDocUploading(true)
    setHwDocResult(null)
    setHwDocError(null)
    try {
      if (hwDocFile.size > MAX_UPLOAD_BYTES) {
        throw new Error("File is too large. Use a file smaller than 22MB.")
      }
      const base64 = await fileToBase64(hwDocFile)
      const isDocx = hwDocFile.name.toLowerCase().endsWith(".docx")
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [isDocx ? "docxBase64" : "pdfBase64"]: base64,
          studentId: hwStudent,
          subjectId: hwSubject,
          hwSource: "admin_hw",
          sessionDate: hwSessionDate,
          questionTypeResolution: Number(hwResolution) > 0 ? Number(hwResolution) : 0,
        })
      })
      const data = await readJsonOrThrow(res, "Homework upload")
      if (data.error) {
        setHwDocError(data.error)
      } else {
        setHwDocResult(data)
        // Refresh question list so newly-imported types show up immediately
        const refreshed = await fetch(`/api/admin/homework?studentId=${hwStudent}&subjectId=${hwSubject}`)
        const d = await refreshed.json()
        setHwQuestions(d.questions || [])
        setHwCycleInfo(d.cycle || null)
        setHwAttempts(d.attempts || [])
        setHwSelected({})
      }
    } catch (e) {
      setHwDocError(e.message || "Failed to upload homework doc")
    } finally {
      setHwDocUploading(false)
    }
  }

  async function extendHomeworkAttemptByDay(attempt) {
    setHwMutating(true)
    setHwError(null)
    setHwResult(null)
    try {
      const base = attempt?.expireAt
        ? new Date(attempt.expireAt)
        : (hwCycleInfo?.expireAt ? new Date(hwCycleInfo.expireAt) : new Date())
      base.setDate(base.getDate() + 1)
      const res = await fetch("/api/admin/homework", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "override_expire",
          attemptId: attempt?.id || "",
          studentId: hwStudent,
          subjectId: hwSubject,
          expireAt: base.toISOString(),
        })
      })
      const data = await readJsonOrThrow(res, "Extend homework expiry")
      if (data.error) throw new Error(data.error)
      setHwResult(`Extended homework expiry to ${formatDateTime(base.toISOString())}.`)
      const refreshed = await fetch(`/api/admin/homework?studentId=${hwStudent}&subjectId=${hwSubject}`)
      const d = await refreshed.json()
      setHwQuestions(d.questions || [])
      setHwCycleInfo(d.cycle || null)
      setHwAttempts(d.attempts || [])
    } catch (e) {
      setHwError(e.message || "Failed to extend homework expiry")
    } finally {
      setHwMutating(false)
    }
  }

  // Load scheduled dates when reschedule student+subject changes
  useEffect(() => {
    if (!reschedStudent || !reschedSubject) return setScheduledDates([])
    setLoadingDates(true)
    fetch(`/api/admin/reschedule?studentId=${reschedStudent}&subjectId=${reschedSubject}`)
      .then(r => r.json())
      .then(d => setScheduledDates(d.dates || []))
      .catch(() => setScheduledDates([]))
      .finally(() => setLoadingDates(false))
  }, [reschedStudent, reschedSubject])

  async function handleImport() {
    if (!(file || worksheetText.trim() || sidecarJson.trim()) || !importStudent || !importSubject) return
    setImporting(true)
    setImportResult(null)
    setImportError(null)
    try {
      const baseBody = {
        studentId: importStudent,
        subjectId: importSubject,
        useClaudeInference: importUseClaudeInference,
        taggingMode: importTaggingMode,
      }
      if (file) {
        if (file.size > MAX_UPLOAD_BYTES) {
          throw new Error("File is too large. Use a file smaller than 22MB.")
        }
        const fileName = String(file.name || "").toLowerCase()
        if (fileName.endsWith(".json")) {
          baseBody.worksheetText = await fileToText(file)
        } else {
          const base64 = await fileToBase64(file)
          const isDocx = fileName.endsWith(".docx")
          baseBody[isDocx ? "docxBase64" : "pdfBase64"] = base64
        }
      }
      if (worksheetText.trim()) baseBody.worksheetText = worksheetText.trim()
      if (sidecarJson.trim()) baseBody.sidecarJson = sidecarJson.trim()

      async function runImport(extra = {}) {
        const res = await fetch("/api/admin/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...baseBody, ...extra })
        })
        const data = await readJsonOrThrow(res, "Import upload")
        return { res, data }
      }

      let { res, data } = await runImport()
      // Accumulate conflict resolutions and retry in a single call to avoid multiple full pipeline runs
      let extraOverrides = {}
      if (res.status === 409 && data?.requiresScheduleDecision) {
        const hasMajorMismatches = (data.majorMismatches || []).length > 0
        let choice
        if (hasMajorMismatches) {
          choice = await new Promise((resolve) => {
            setScheduleConflictPending({ conflictingDates: data.conflictingDates || [], majorMismatches: data.majorMismatches || [], resolve })
          })
          setScheduleConflictPending(null)
          if (!choice) throw new Error("Import cancelled.")
        } else {
          choice = "skip"
        }
        extraOverrides.scheduleConflictAction = choice
        ;({ res, data } = await runImport(extraOverrides))
      }
      if (res.status === 409 && Array.isArray(data?.dedupConflicts) && data.dedupConflicts.length) {
        const dedupDecisions = {}
        for (const conflict of data.dedupConflicts) {
          dedupDecisions[conflict.pageId] = "skip"
        }
        extraOverrides.dedupDecisions = dedupDecisions
        ;({ res, data } = await runImport(extraOverrides))
      }

      if (!res.ok && data.error) setImportError(data.error)
      else if (res.ok) setImportResult(data)
    } catch (err) {
      setImportError(err.message)
    } finally {
      setImporting(false)
    }
  }

  async function handleRegenerateCache() {
    if (!importStudent || !importSubject) return
    setRegenLoading(true)
    setRegenResult(null)
    setRegenError(null)
    try {
      const res = await fetch("/api/admin/regenerate-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: importStudent, subjectId: importSubject })
      })
      const data = await res.json()
      if (data.error) setRegenError(data.error)
      else setRegenResult(data)
    } catch (err) {
      setRegenError(err.message)
    } finally {
      setRegenLoading(false)
    }
  }

  async function handleSyncSessionsFromCalendar() {
    if (!calendarStudentId) return
    setCalendarSyncing(true)
    setCalendarSyncError(null)
    setCalendarSyncNotice("")
    try {
      const res = await fetch("/api/admin/sync-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: calendarStudentId,
          startDate: calendarSyncStartDate,
          endDate: calendarSyncEndDate,
        }),
      })
      const data = await readJsonOrThrow(res, "Sync sessions from calendar")
      const created = Number(data?.created || 0)
      const updated = Number(data?.updated || 0)
      const archived = Number(data?.archived || 0)
      const skipped = Number(data?.skipped || 0)
      setCalendarSyncNotice(`Synced sessions for ${data?.student?.name || "student"}: ${created} created, ${updated} updated, ${archived} archived, ${skipped} skipped.`)
    } catch (err) {
      setCalendarSyncError(err.message || "Failed to sync sessions from calendar")
    } finally {
      setCalendarSyncing(false)
    }
  }

  async function handleReschedule() {
    if (!reschedStudent || !reschedSubject) return
    setRescheduling(true)
    setReschedResult(null)
    setReschedError(null)
    try {
      const body = { studentId: reschedStudent, subjectId: reschedSubject, mode: reschedMode }
      if (reschedMode === "move") { body.fromDate = fromDate; body.toDate = toDate }
      if (reschedMode === "shift") body.shiftDays = shiftDays
      const res = await fetch("/api/admin/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (data.error) setReschedError(data.error)
      else {
        setReschedResult(data.message)
        // Reload scheduled dates
        const refreshed = await fetch(`/api/admin/reschedule?studentId=${reschedStudent}&subjectId=${reschedSubject}`)
        const d = await refreshed.json()
        setScheduledDates(d.dates || [])
      }
    } catch (err) {
      setReschedError(err.message)
    } finally {
      setRescheduling(false)
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return ""
    const d = new Date(dateStr + "T00:00:00")
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return ""
    const d = new Date(dateStr)
    return d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  function getDateKeyInTimezone(dateLike, timeZone = "UTC") {
    if (!dateLike) return ""
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(dateLike))
    } catch {
      return ""
    }
  }

  function formatTimeInTimezone(dateLike, timeZone = "UTC") {
    if (!dateLike) return ""
    try {
      return new Date(dateLike).toLocaleTimeString("en-GB", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
      })
    } catch {
      return ""
    }
  }

  function dateKeyToUtcMidnight(dateKey = "") {
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey))) return null
    return new Date(`${dateKey}T00:00:00Z`)
  }

  function daysBetweenDateKeys(fromKey = "", toKey = "") {
    const from = dateKeyToUtcMidnight(fromKey)
    const to = dateKeyToUtcMidnight(toKey)
    if (!from || !to) return null
    return Math.round((to.getTime() - from.getTime()) / 86400000)
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(",")[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function fileToText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ""))
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  async function handleContentOcr() {
    if (!contentStudent || !contentSubject || !contentFile) return
    setContentLoading(true)
    setContentError(null)
    setContentNotice("")
    try {
      if (contentFile.size > MAX_UPLOAD_BYTES) {
        throw new Error("File is too large. Use a file smaller than 22MB.")
      }
      const base64 = await fileToBase64(contentFile)
      const subject = subjects.find((s) => s.id === contentSubject)
      const res = await fetch("/api/admin/worksheet-ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: contentStudent,
          subjectId: contentSubject,
          subjectName: subject?.name || "",
          sessionDate: contentSessionDate,
          fileBase64: base64,
          fileName: contentFile.name,
          sourceLabel: contentSourceLabel,
        }),
      })
      const data = await readJsonOrThrow(res, "Worksheet OCR")
      setContentDraft(data.manifest ? { draftId: data.draftId, manifest: data.manifest } : null)
      setContentBlocks(Array.isArray(data.blocks) ? data.blocks : [])
      setContentSidecar(null)
      const provider = String(data?.manifest?.source?.ocrProvider || "").trim()
      const providerLabel = provider ? ` via ${provider}` : ""
      setContentNotice(`OCR ready${providerLabel}: ${data?.manifest?.counts?.blocks || 0} blocks across ${data?.manifest?.counts?.pages || 0} page(s).`)
    } catch (err) {
      setContentError(err.message || "Failed to run OCR")
    } finally {
      setContentLoading(false)
    }
  }

  function moveContentBlock(index, delta) {
    setContentBlocks((prev) => {
      const nextIndex = index + delta
      if (nextIndex < 0 || nextIndex >= prev.length) return prev
      const next = [...prev]
      const [item] = next.splice(index, 1)
      next.splice(nextIndex, 0, item)
      return next.map((block, idx) => ({ ...block, order: idx + 1 }))
    })
  }

  function updateContentBlock(index, patch) {
    setContentBlocks((prev) => prev.map((block, idx) => idx === index ? { ...block, ...patch } : block))
  }

  function deleteContentBlockById(blockId) {
    if (!blockId) return
    setContentBlocks((prev) => prev
      .filter((block) => block.id !== blockId)
      .map((block, index) => ({ ...block, order: index + 1 }))
    )
    if (contentHoverBlockId === blockId) setContentHoverBlockId("")
    if (contentDragBlockId === blockId) setContentDragBlockId("")
  }

  function swapContentBlocksById(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId) return
    setContentBlocks((prev) => {
      const sourceIndex = prev.findIndex((block) => block.id === sourceId)
      const targetIndex = prev.findIndex((block) => block.id === targetId)
      if (sourceIndex < 0 || targetIndex < 0) return prev
      const source = prev[sourceIndex]
      const target = prev[targetIndex]
      const next = [...prev]
      next[sourceIndex] = {
        ...source,
        page: target.page,
        bbox: target.bbox || source.bbox,
      }
      next[targetIndex] = {
        ...target,
        page: source.page,
        bbox: source.bbox || target.bbox,
      }
      return next
    })
  }

  async function saveContentDraft() {
    if (!contentDraft?.draftId || !contentStudent || !contentSubject) return
    setContentSaving(true)
    setContentError(null)
    try {
      const res = await fetch("/api/admin/worksheet-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: contentStudent,
          subjectId: contentSubject,
          draftId: contentDraft.draftId,
          blocks: contentBlocks,
        }),
      })
      const data = await readJsonOrThrow(res, "Save worksheet draft")
      setContentDraft((prev) => prev ? { ...prev, manifest: data.manifest } : prev)
      setContentNotice("Worksheet draft saved.")
    } catch (err) {
      setContentError(err.message || "Failed to save draft")
    } finally {
      setContentSaving(false)
    }
  }

  function startContentPointerDrag(event, blockId) {
    if (!event || event.button !== 0 || !blockId) return
    event.preventDefault()
    event.stopPropagation()
    setContentDragBlockId(blockId)
    setContentPointerDrag({
      sourceId: blockId,
      x: event.clientX,
      y: event.clientY,
      targetId: blockId,
    })
  }

  useEffect(() => {
    if (!contentPointerDrag?.sourceId) return undefined

    function handlePointerMove(event) {
      const el = document.elementFromPoint(event.clientX, event.clientY)
      const target = el?.closest?.("[data-ocr-block-id]")
      const targetId = target?.getAttribute?.("data-ocr-block-id") || contentPointerDrag.sourceId
      setContentPointerDrag((prev) => prev ? {
        ...prev,
        x: event.clientX,
        y: event.clientY,
        targetId,
      } : prev)
    }

    function handlePointerUp() {
      setContentPointerDrag((prev) => {
        if (prev?.sourceId && prev?.targetId && prev.sourceId !== prev.targetId) {
          swapContentBlocksById(prev.sourceId, prev.targetId)
        }
        return null
      })
      setContentDragBlockId("")
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [contentPointerDrag])

  useEffect(() => {
    if (!contextStudent || !contextSubject || !contextSessionDate) {
      setContextDraftItems([])
      setContextMatches([])
      setContextSelectedQuestionId("")
      return
    }
    loadDraftContextItems(contextStudent, contextSubject, contextSessionDate)
  }, [contextStudent, contextSubject, contextSessionDate])

  async function generateContentSidecar() {
    if (!contentDraft?.draftId || !contentStudent || !contentSubject) return
    setContentGenerating(true)
    setContentError(null)
    try {
      const subject = subjects.find((s) => s.id === contentSubject)
      const res = await fetch("/api/admin/worksheet-sidecar-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: contentStudent,
          subjectId: contentSubject,
          draftId: contentDraft.draftId,
          subjectName: subject?.name || "",
          useClaudeInference: contentUseClaudeInference,
        }),
      })
      const data = await readJsonOrThrow(res, "Generate worksheet sidecar")
      setContentDraft((prev) => prev ? { ...prev, manifest: data.manifest } : prev)
      setContentSidecar(data.sidecar || null)
      setContentGroups(Array.isArray(data.groups) ? data.groups : [])
      if (data?.tree && Array.isArray(data.tree.units)) setContentTree(data.tree)
      const protoCount = Array.isArray(data?.groups) ? data.groups.length : (data?.manifest?.counts?.questions || 0)
      const ambiguousCount = Number(data?.manifest?.counts?.ambiguousQuestions || 0)
      setContentNotice(`First pass done — ${protoCount || 0} question(s)${ambiguousCount ? `, ${ambiguousCount} need review` : ", none ambiguous"}.`)
    } catch (err) {
      setContentError(err.message || "Failed to generate sidecar")
    } finally {
      setContentGenerating(false)
    }
  }

  async function applyLmReorder() {
    if (!contentDraft?.draftId || !contentLmText.trim()) return
    setContentReordering(true)
    setContentError(null)
    try {
      const res = await fetch("/api/admin/worksheet-draft-reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: contentStudent,
          subjectId: contentSubject,
          draftId: contentDraft.draftId,
          lmText: contentLmText,
        }),
      })
      const data = await readJsonOrThrow(res, "Apply LM reorder")
      setContentGroups(Array.isArray(data.groups) ? data.groups : [])
      if (data?.tree && Array.isArray(data.tree.units)) setContentTree(data.tree)
      setContentNotice(`LM order applied — ${data.groups?.length || 0} groups reordered. Run First Pass again to rebuild sidecar.`)
    } catch (err) {
      setContentError(err.message || "Failed to apply LM order")
    } finally {
      setContentReordering(false)
    }
  }

  async function importContentSidecar() {
    if (!contentSidecar?.blocks?.length || !contentStudent || !contentSubject) return
    setContentImporting(true)
    setContentError(null)
    setImportError(null)
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: contentStudent,
          subjectId: contentSubject,
          sessionDate: contentSessionDate,
          sidecarJson: JSON.stringify(contentSidecar.blocks),
          useClaudeInference: contentUseClaudeInference,
        }),
      })
      const data = await readJsonOrThrow(res, "Import approved worksheet draft")
      setImportResult(data)
      setContentNotice(`Imported ${data?.resolvedQuestionTypes || 0} question type(s) from approved draft.`)
    } catch (err) {
      setContentError(err.message || "Failed to import approved sidecar")
    } finally {
      setContentImporting(false)
    }
  }

  async function saveContentTree() {
    if (!contentDraft?.draftId || !contentStudent || !contentSubject) return
    setContentTreeSaving(true)
    setContentError(null)
    try {
      const res = await fetch("/api/admin/worksheet-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: contentStudent,
          subjectId: contentSubject,
          draftId: contentDraft.draftId,
          blocks: contentBlocks,
          tree: contentTree,
        }),
      })
      const data = await readJsonOrThrow(res, "Save content tree")
      setContentDraft((prev) => prev ? { ...prev, manifest: data.manifest } : prev)
      if (data?.tree && Array.isArray(data.tree.units)) setContentTree(data.tree)
      if (Array.isArray(data?.groups)) setContentGroups(data.groups)
      setContentNotice("Content tree saved.")
    } catch (err) {
      setContentError(err.message || "Failed to save tree")
    } finally {
      setContentTreeSaving(false)
    }
  }

  async function handleContentJsonHintImport() {
    if (!contentFile || !contentStudent || !contentSubject) {
      setContentError("Pick a PDF and a student/subject first.")
      return
    }
    const hintText = contentHintJson.trim()
    if (!hintText) {
      setContentError("Paste the pre-made JSON hint before importing.")
      return
    }
    let hint
    try {
      hint = JSON.parse(hintText)
    } catch (err) {
      setContentError(`Hint JSON is not valid: ${err.message}`)
      return
    }
    setContentJsonImporting(true)
    setContentError(null)
    setContentNotice("")
    try {
      if (contentFile.size > MAX_UPLOAD_BYTES) {
        throw new Error("File is too large. Use a file smaller than 22MB.")
      }
      const base64 = await fileToBase64(contentFile)
      const subject = subjects.find((s) => s.id === contentSubject)
      const res = await fetch("/api/admin/worksheet-json-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: contentStudent,
          subjectId: contentSubject,
          subjectName: subject?.name || "",
          sessionDate: contentSessionDate,
          pdfBase64: base64,
          fileName: contentFile.name,
          sourceLabel: contentSourceLabel,
          hint,
        }),
      })
      const data = await readJsonOrThrow(res, "JSON-hint import")
      setContentDraft(data.manifest ? { draftId: data.draftId, manifest: data.manifest } : null)
      setContentBlocks(Array.isArray(data.blocks) ? data.blocks : [])
      setContentSidecar(data.sidecar || null)
      setContentGroups(Array.isArray(data.groups) ? data.groups : [])
      if (data?.tree && Array.isArray(data.tree.units)) setContentTree(data.tree)
      setContentNotice(`JSON hint imported — ${data?.manifest?.counts?.questions || 0} question(s) ready, ${data?.manifest?.counts?.imageBlocks || 0} image(s) cropped.`)
    } catch (err) {
      setContentError(err.message || "Failed to import via JSON hint")
    } finally {
      setContentJsonImporting(false)
    }
  }

  function moveItemWithinQuestion(unitId, qtId, questionId, fromIdx, toIdx) {
    setContentTree((prev) => {
      if (!prev || !Array.isArray(prev.units)) return prev
      const next = { ...prev, units: prev.units.map((unit) => {
        if (unit.id !== unitId) return unit
        return { ...unit, question_types: (unit.question_types || []).map((qt) => {
          if (qt.id !== qtId) return qt
          return { ...qt, questions: (qt.questions || []).map((q) => {
            if (q.id !== questionId) return q
            const items = Array.isArray(q.assignments) ? [...q.assignments] : []
            if (fromIdx < 0 || fromIdx >= items.length || toIdx < 0 || toIdx >= items.length) return q
            const [pulled] = items.splice(fromIdx, 1)
            items.splice(toIdx, 0, pulled)
            return { ...q, assignments: items }
          }) }
        }) }
      }) }
      return next
    })
  }

  function updateTreeLabel(kind, ids, value) {
    setContentTree((prev) => {
      if (!prev || !Array.isArray(prev.units)) return prev
      return { ...prev, units: prev.units.map((unit) => {
        if (kind === "unit" && unit.id === ids.unitId) return { ...unit, label: value }
        if (unit.id !== ids.unitId) return unit
        return { ...unit, question_types: (unit.question_types || []).map((qt) => {
          if (kind === "qt" && qt.id === ids.qtId) return { ...qt, label: value }
          if (qt.id !== ids.qtId) return qt
          return { ...qt, questions: (qt.questions || []).map((q) => {
            if (kind === "question" && q.id === ids.questionId) return { ...q, label: value }
            return q
          }) }
        }) }
      }) }
    })
  }

  async function loadDraftContextItems(studentId = contextStudent, subjectId = contextSubject, targetDate = contextSessionDate) {
    if (!studentId || !subjectId || !targetDate) {
      setContextDraftItems([])
      setContextMatches([])
      return
    }
    setContextLoading(true)
    setContextError(null)
    try {
      const params = new URLSearchParams({
        studentId,
        subjectId,
        sessionDate: targetDate,
      })
      const res = await fetch(`/api/admin/draft-context?${params.toString()}`)
      const data = await readJsonOrThrow(res, "Draft context load")
      if (!res.ok) throw new Error(data.error || "Failed to load draft context items")
      setContextDraftItems(Array.isArray(data.draftItems) ? data.draftItems : [])
      setContextMatches([])
      setContextSelectedQuestionId("")
    } catch (err) {
      setContextError(err.message || "Failed to load draft context items")
    } finally {
      setContextLoading(false)
    }
  }

  async function handleContextOcrUploads() {
    if (!contextStudent || !contextSubject || !contextFiles.length) return
    setContextUploading(true)
    setContextError(null)
    setContextNotice("")
    try {
      const subject = subjects.find((s) => s.id === contextSubject)
      const uploaded = []
      for (const fileItem of contextFiles) {
        const base64 = await fileToBase64(fileItem)
        const res = await fetch("/api/admin/worksheet-ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studentId: contextStudent,
            subjectId: contextSubject,
            subjectName: subject?.name || "",
            sessionDate: contextSessionDate,
            fileBase64: base64,
            fileName: fileItem.name,
            sourceLabel: fileItem.name,
          }),
        })
        const data = await readJsonOrThrow(res, "Draft context OCR")
        if (!res.ok) throw new Error(data.error || `Failed OCR for ${fileItem.name}`)
        uploaded.push({
          draftId: data.draftId,
          manifest: data.manifest || null,
          blocks: Array.isArray(data.blocks) ? data.blocks : [],
          sourceLabel: data.manifest?.source?.sourceLabel || fileItem.name,
        })
      }
      setContextDocs((prev) => [...prev, ...uploaded])
      setContextNotice(`OCR ready for ${uploaded.length} document(s).`)
      setContextFiles([])
    } catch (err) {
      setContextError(err.message || "Failed to OCR context documents")
    } finally {
      setContextUploading(false)
    }
  }

  async function runDraftContextMatching() {
    if (!contextStudent || !contextSubject || !contextSessionDate || !contextDocs.length) return
    setContextMatching(true)
    setContextError(null)
    setContextNotice("")
    try {
      const res = await fetch("/api/admin/draft-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "match",
          studentId: contextStudent,
          subjectId: contextSubject,
          sessionDate: contextSessionDate,
          draftIds: contextDocs.map((doc) => doc.draftId),
        }),
      })
      const data = await readJsonOrThrow(res, "Draft context match")
      if (!res.ok) throw new Error(data.error || "Failed to match draft questions")
      setContextDocs(Array.isArray(data.docs) ? data.docs.map((doc) => ({
        draftId: doc.draftId,
        manifest: doc.manifest || null,
        blocks: Array.isArray(doc.blocks) ? doc.blocks : [],
        sourceLabel: doc.sourceLabel || doc.manifest?.source?.sourceLabel || doc.draftId,
      })) : [])
      setContextMatches(Array.isArray(data.matches) ? data.matches : [])
      const firstQuestion = data.matches?.flatMap((item) =>
        (item.questions || []).map((question) => `${item.draftRowId}::${question.key}`)
      )?.[0] || ""
      if (firstQuestion) setContextSelectedQuestionId(firstQuestion)
      setContextNotice("Draft context candidates ready.")
    } catch (err) {
      setContextError(err.message || "Failed to match draft questions")
    } finally {
      setContextMatching(false)
    }
  }

  async function attachDraftContextCandidate(questionMeta, candidate) {
    if (!questionMeta?.draftRowId || !questionMeta?.questionPageId || !questionMeta?.questionKey || !candidate?.imageUrls?.length) return
    const imageUrl = candidate.imageUrls[0]
    const attachKey = `${questionMeta.draftRowId}::${questionMeta.questionKey}`
    setContextAttachingKey(attachKey)
    setContextError(null)
    try {
      const res = await fetch("/api/admin/draft-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "attach",
          studentId: contextStudent,
          subjectId: contextSubject,
          draftRowId: questionMeta.draftRowId,
          questionPageId: questionMeta.questionPageId,
          questionKey: questionMeta.questionKey,
          qhash: questionMeta.qhash,
          imageUrl,
          sourceDraftId: candidate.sourceDraftId,
          sourceLabel: candidate.sourceLabel,
          matchedBlockId: candidate.blockId,
          contextBlockIds: candidate.contextBlockIds || [],
          contextText: candidate.contextText || "",
        }),
      })
      const data = await readJsonOrThrow(res, "Draft context attach")
      if (!res.ok) throw new Error(data.error || "Failed to attach context image")
      setContextMatches((prev) => prev.map((item) => (
        item.draftRowId !== questionMeta.draftRowId ? item : {
          ...item,
          questions: (item.questions || []).map((question) => (
            question.key !== questionMeta.questionKey
              ? question
              : { ...question, attachment: data.attachment || null, imageUrl: imageUrl || question.imageUrl }
          )),
        }
      )))
      setContextDraftItems((prev) => prev.map((item) => (
        item.id !== questionMeta.draftRowId ? item : {
          ...item,
          questions: (item.questions || []).map((question) => (
            question.key !== questionMeta.questionKey
              ? question
              : { ...question, attachment: data.attachment || null, imageUrl: imageUrl || question.imageUrl }
          )),
        }
      )))
      setContextNotice(`Attached image for ${questionMeta.title}.`)
    } catch (err) {
      setContextError(err.message || "Failed to attach context image")
    } finally {
      setContextAttachingKey("")
    }
  }

  const canImport = (file || worksheetText.trim() || sidecarJson.trim()) && importStudent && importSubject && !importing
  const canRunContentOcr = !!(contentStudent && contentSubject && contentFile && !contentLoading)
  const contentBlockIndexById = contentBlocks.reduce((acc, block, index) => {
    acc[block.id] = index
    return acc
  }, {})
  const contentBlockById = contentBlocks.reduce((acc, block) => {
    acc[block.id] = block
    return acc
  }, {})
  const contentDraftPages = buildContentDraftPages(contentBlocks, contentDraft?.manifest || null)
  const canReschedule = reschedStudent && reschedSubject &&
    (reschedMode === "shift" || (fromDate && toDate)) && !rescheduling
  const adminTodayKey = getDateKeyInTimezone(new Date(), adminTimezone)
  const queueTodayClasses = dashboardQueue.filter((item) => daysBetweenDateKeys(adminTodayKey, item.adminSessionDate) === 0)
  const queueTomorrowClasses = dashboardQueue.filter((item) => daysBetweenDateKeys(adminTodayKey, item.adminSessionDate) === 1)
  const queueLaterWeekClasses = dashboardQueue.filter((item) => {
    const diff = daysBetweenDateKeys(adminTodayKey, item.adminSessionDate)
    return diff != null && diff >= 2 && diff <= 6
  })
  const reviewLoMap = reviewItems.reduce((acc, item) => {
    const codes = String(item.standardCode || "").split(/[,;|]/).map(s => s.trim()).filter(Boolean)
    if (!codes.length) codes.push("Unmapped")
    codes.forEach(code => {
      if (!acc[code]) acc[code] = []
      acc[code].push(item)
    })
    return acc
  }, {})
  const loBlocks = Object.entries(reviewLoMap).sort((a, b) => b[1].length - a[1].length)
  const filteredReviewItems = reviewSelectedLo ? (reviewLoMap[reviewSelectedLo] || []) : reviewItems
  const totalReviewPages = Math.max(1, Math.ceil(filteredReviewItems.length / REVIEW_PAGE_SIZE))
  const currentReviewPage = Math.min(reviewPage, totalReviewPages)
  const reviewStartIdx = (currentReviewPage - 1) * REVIEW_PAGE_SIZE
  const pagedReviewItems = filteredReviewItems.slice(reviewStartIdx, reviewStartIdx + REVIEW_PAGE_SIZE)
  const selectedReviewItem = pagedReviewItems.find(i => i.id === reviewSelectedId) || pagedReviewItems[0] || null
  const activeReviewProblem = selectedReviewItem
    ? (selectedReviewItem.relatedProblems || []).find((p, idx) => problemKey(p, idx) === reviewPinnedProblem) || null
    : null
  const activeReviewProblemIndex = activeReviewProblem && selectedReviewItem
    ? (selectedReviewItem.relatedProblems || []).findIndex((p, idx) => problemKey(p, idx) === reviewPinnedProblem)
    : -1
  const activeReviewProblemKey = activeReviewProblem && activeReviewProblemIndex >= 0
    ? problemKey(activeReviewProblem, activeReviewProblemIndex)
    : ""
  const activeReviewDraft = activeReviewProblem
    ? (reviewProblemDrafts[activeReviewProblemKey] || {
      questionText: activeReviewProblem.questionText || "",
      answerText: activeReviewProblem.answerText || "",
      imageUrl: activeReviewProblem.imageUrl || "",
      promptText: "",
      generatedPrompt: "",
      generatedSvg: "",
      imageLoadError: false,
      busy: false,
      busyLabel: "",
      primaryLo: activeReviewProblem.primaryLo || "",
      reinforcement: activeReviewProblem.reinforcement || [],
    })
    : null

  async function openDashboardClassPrep(item, target = "review") {
    if (!item?.subjectId || !item?.studentId) return
    setFocusStudentId(item.studentId)
    if (target === "pacing") {
      setPacingStudentId(item.studentId)
      setPacingSubject(item.subjectId)
      setActiveAdminSection("pacing")
      await loadPacingGuideFor(item.studentId, item.subjectId)
      return
    }
    if (target === "review") {
      setReviewStudentId(item.studentId)
      setReviewSubjectId(item.subjectId)
      setActiveAdminSection("review")
      return
    }
    if (target === "live") {
      setLiveStudentId(item.studentId)
      setLiveSubjectId(item.subjectId)
      setLiveSessionDate(item.sessionDate || "")
      setActiveAdminSection("live-class")
      await loadLiveClassPlan(item.studentId, item.subjectId, item.sessionDate || "")
    }
  }
  const isReviewEditorOpen = !!activeReviewProblem
  const linkedLoCodesForPinnedProblem = (reviewPinnedProblem && selectedReviewItem)
    ? [primaryLoCodeForItem(selectedReviewItem), ...reinforcementLoCodesForItem(selectedReviewItem)].filter(Boolean)
    : []
  const reviewSubjectName = subjects.find(s => s.id === reviewSubjectId)?.name || ""
  const focusState = focusData?.student?.state || null
  const focusCountry = focusData?.student?.country || null
  const focusProgressObjectives = focusProgressSubject ? getAllObjectives(focusState, focusProgressSubject.name) : []
  const focusProgressUnits = focusProgressSubject ? buildCylinderData(focusProgressObjectives, focusProgressQuestionTypes) : []

  function formatStateLabel(stateKey) {
    if (!stateKey) return ""
    return String(stateKey).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
  }

  function learningObjectiveContextLabel() {
    const subjectLower = (reviewSubjectName || "").toLowerCase()
    const hasTaxonomy = !!getDistrictTaxonomy(focusState, reviewSubjectName)
    if (!hasTaxonomy) return ""
    if (subjectLower.includes("ap ")) return "AP (College Board)"
    if (subjectLower.includes("ib ")) return "IB Curriculum"
    if (subjectLower.includes("cambridge") || subjectLower.includes("igcse") || subjectLower.includes("as level") || subjectLower.includes("a level") || subjectLower.includes("9709")) {
      return "Cambridge Curriculum"
    }
    if (
      subjectLower.includes("grade 5-8 maths revision") ||
      subjectLower.includes("grades 5-8 maths revision") ||
      subjectLower.includes("ks3") ||
      subjectLower.includes("levels 5-8")
    ) {
      return "Grades 5-8 Maths Revision"
    }
    if (focusState) return `${formatStateLabel(focusState)} Standards`
    if (focusCountry) return `${focusCountry} Curriculum`
    return ""
  }
  const loContext = learningObjectiveContextLabel()
  const loPanelLabel = `Learning Objectives${loContext ? ` (${loContext})` : ""}`
  function loCodesForItem(item) {
    const codes = String(item?.standardCode || "").split(/[,;|]/).map(s => s.trim()).filter(Boolean)
    return codes.length ? codes : ["Unmapped"]
  }

  function primaryLoCodeForItem(item) {
    return loCodesForItem(item)[0] || "Unmapped"
  }

  function reinforcementLoCodesForItem(item) {
    return Array.from(new Set(
      (Array.isArray(item?.reinforcementCodes) ? item.reinforcementCodes : [])
        .map((entry) => getLoForSlo(String(entry?.code || "").trim()) || String(entry?.code || "").trim())
        .filter(Boolean)
    ))
  }

  const hoveredReviewItem = reviewItems.find((item) => item.id === reviewHoverTypeId) || null
  const activeReviewTypeForViz = hoveredReviewItem || selectedReviewItem || null
  const visibleReviewLoCodes = activeReviewTypeForViz
    ? Array.from(new Set([
      primaryLoCodeForItem(activeReviewTypeForViz),
      ...reinforcementLoCodesForItem(activeReviewTypeForViz),
    ].filter(Boolean)))
    : []
  const visibleReviewLoBlocks = visibleReviewLoCodes
    .map((code) => [code, reviewLoMap[code] || []])
    .filter(([code]) => code && code !== "Unmapped")

  function problemKey(problem, idx) {
    return problem?.qhash || problem?.qBlockId || `problem-${idx}`
  }

  function pseudoRandom(seed) {
    let h = 2166136261
    const str = String(seed || "")
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return (h >>> 0) / 4294967295
  }

  function morphText(label, key = "") {
    const text = String(label || "")
    if (!reviewMorphing || !text) return text
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    const t = Math.max(0, Math.min(1, reviewMorphTick / REVIEW_MORPH_STEPS))
    const eased = Math.sin(Math.PI * t)
    const mutationChance = 0.08 + (0.3 * eased)
    return text
      .split("")
      .map((ch, i) => {
        const isLetter = /[a-z]/i.test(ch)
        if (!isLetter) return ch
        const r = pseudoRandom(`${key}-${reviewMorphTick}-${i}`)
        if (r > mutationChance) return ch
        const upper = ch.toUpperCase()
        const baseIdx = alphabet.indexOf(upper)
        if (baseIdx < 0) return ch
        const driftRand = pseudoRandom(`${key}-drift-${reviewMorphTick}-${i}`)
        const drift = Math.round((driftRand - 0.5) * 8) // -4..4
        const nextIdx = (baseIdx + drift + alphabet.length) % alphabet.length
        const pick = alphabet[nextIdx]
        return ch === ch.toLowerCase() ? pick.toLowerCase() : pick
      })
      .join("")
  }

  useEffect(() => {
    const workspace = reviewWorkspaceRef.current
    const board = reviewBoardRef.current
    if (!workspace || !board) {
      setReviewViz({ width: 0, height: 0, paths: [], dots: [] })
      return
    }

    const buildViz = () => {
      const workspaceRect = workspace.getBoundingClientRect()
      const width = Math.max(0, Math.round(workspaceRect.width))
      const height = Math.max(0, Math.round(workspaceRect.height))
      const paths = []
      const dots = []

      const addCurve = (fromEl, toEl, color, strokeWidth = 2.25, opacity = 0.9) => {
        if (!fromEl || !toEl) return
        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()
        const x1 = fromRect.right - workspaceRect.left
        const y1 = fromRect.top - workspaceRect.top + fromRect.height / 2
        const x2 = toRect.left - workspaceRect.left
        const y2 = toRect.top - workspaceRect.top + toRect.height / 2
        const bend = Math.max(36, Math.abs(x2 - x1) * 0.32)
        const d = `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`
        paths.push({ d, color, strokeWidth, opacity })
        dots.push({ x: x2, y: y2, r: 3.25, color, opacity })
      }

      const mappedByLo = reviewItems.reduce((acc, item) => {
        const codes = [primaryLoCodeForItem(item), ...reinforcementLoCodesForItem(item)].filter(Boolean)
        codes.forEach(code => {
          if (!acc[code]) acc[code] = []
          acc[code].push(item)
        })
        return acc
      }, {})
      const filteredItems = reviewSelectedLo ? (mappedByLo[reviewSelectedLo] || []) : reviewItems
      const totalPages = Math.max(1, Math.ceil(filteredItems.length / REVIEW_PAGE_SIZE))
      const safePage = Math.min(reviewPage, totalPages)
      const pageStart = (safePage - 1) * REVIEW_PAGE_SIZE
      const pagedItems = filteredItems.slice(pageStart, pageStart + REVIEW_PAGE_SIZE)
      const selectedItem = pagedItems.find(i => i.id === reviewSelectedId) || pagedItems[0] || null
      const hoveredType = reviewItems.find(item => item.id === reviewHoverTypeId) || null
      const activeType = hoveredType || selectedItem || null
      const visibleTypeIds = new Set(pagedItems.map(item => item.id))
      const primaryColor = "#e36b6b"
      const reinforcementColor = "#7daeff"
      const connectTypeLos = (item, typeEl) => {
        if (!item || !typeEl) return
        const primaryCode = primaryLoCodeForItem(item)
        if (primaryCode) addCurve(loRefs.current[primaryCode], typeEl, primaryColor, 2.8, 0.98)
        reinforcementLoCodesForItem(item).forEach((code) => {
          addCurve(loRefs.current[code], typeEl, reinforcementColor, 2.15, 0.82)
        })
      }

      if ((reviewHoverProblem || reviewPinnedProblem) && selectedItem) {
        const activeProblemKey = reviewHoverProblem || reviewPinnedProblem
        const typeEl = typeRefs.current[selectedItem.id]
        const problemEl = problemRefs.current[activeProblemKey]
        connectTypeLos(selectedItem, typeEl)
        addCurve(typeEl, problemEl, "#f0d58e", 2.6, 0.98)
        if (isReviewEditorOpen) {
          addCurve(problemEl, reviewEditorInnerRef.current || reviewEditorRef.current, "#95ddb2", 2.35, 0.8)
        }
      } else if (reviewHoverTypeId && hoveredType && visibleTypeIds.has(hoveredType.id)) {
        const typeEl = typeRefs.current[hoveredType.id]
        connectTypeLos(hoveredType, typeEl)
        if (selectedItem?.id === hoveredType.id) {
          ;(selectedItem.relatedProblems || []).forEach((problem, idx) => {
            addCurve(typeEl, problemRefs.current[problemKey(problem, idx)], "#f0d58e", 2.4, 0.95)
          })
        }
      } else if (reviewHoverLo) {
        const loEl = loRefs.current[reviewHoverLo]
        ;(mappedByLo[reviewHoverLo] || []).forEach(item => {
          if (!visibleTypeIds.has(item.id)) return
          const color = primaryLoCodeForItem(item) === reviewHoverLo ? primaryColor : reinforcementColor
          const width = primaryLoCodeForItem(item) === reviewHoverLo ? 2.7 : 2.1
          const opacity = primaryLoCodeForItem(item) === reviewHoverLo ? 0.96 : 0.82
          addCurve(loEl, typeRefs.current[item.id], color, width, opacity)
        })
      } else if (activeType && visibleTypeIds.has(activeType.id)) {
        const typeEl = typeRefs.current[activeType.id]
        connectTypeLos(activeType, typeEl)
        if (selectedItem?.id === activeType.id) {
          ;(selectedItem.relatedProblems || []).forEach((problem, idx) => {
            addCurve(typeEl, problemRefs.current[problemKey(problem, idx)], "#f0d58e", 2.4, 0.95)
          })
        }
      }

      setReviewViz({ width, height, paths, dots })
    }

    buildViz()
    // During panel open/close transitions, element positions change without window resize.
    // Run a short rAF sweep so connector paths stay attached while layout animates.
    let rafId = 0
    const sweepStart = performance.now()
    const sweepForMs = 520
    const sweep = () => {
      buildViz()
      if (performance.now() - sweepStart < sweepForMs) {
        rafId = requestAnimationFrame(sweep)
      }
    }
    rafId = requestAnimationFrame(sweep)

    // React to size changes in workspace/board/editor panes.
    let resizeObs = null
    if (typeof ResizeObserver !== "undefined") {
      resizeObs = new ResizeObserver(() => buildViz())
      resizeObs.observe(workspace)
      resizeObs.observe(board)
      if (reviewEditorRef.current) resizeObs.observe(reviewEditorRef.current)
      if (reviewEditorInnerRef.current) resizeObs.observe(reviewEditorInnerRef.current)
    }

    window.addEventListener("resize", buildViz)
    window.addEventListener("scroll", buildViz, true)
    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      if (resizeObs) resizeObs.disconnect()
      window.removeEventListener("resize", buildViz)
      window.removeEventListener("scroll", buildViz, true)
    }
  }, [
    reviewItems,
    reviewSelectedLo,
    reviewSelectedId,
    reviewPage,
    reviewHoverLo,
    reviewHoverTypeId,
    reviewHoverProblem,
    reviewPinnedProblem,
    isReviewEditorOpen,
  ])

  useEffect(() => {
    setReviewPage(1)
  }, [reviewSelectedLo, reviewSubjectId, reviewStudentId])

  useEffect(() => {
    const pages = Math.max(1, Math.ceil(filteredReviewItems.length / REVIEW_PAGE_SIZE))
    if (reviewPage > pages) {
      setReviewPage(pages)
      return
    }
    if (!pagedReviewItems.length) {
      setReviewSelectedId("")
      return
    }
    if (!pagedReviewItems.some(item => item.id === reviewSelectedId)) {
      setReviewSelectedId(pagedReviewItems[0].id)
    }
  }, [filteredReviewItems, pagedReviewItems, reviewPage, reviewSelectedId])

  useEffect(() => {
    if (!selectedReviewItem) return
    setReviewPinnedProblem("")
    const probs = selectedReviewItem.relatedProblems || []
    if (!probs.length) return
    setReviewProblemDrafts(prev => {
      const next = { ...prev }
      probs.forEach((problem, idx) => {
        const key = problemKey(problem, idx)
        if (!next[key]) {
          next[key] = {
            questionText: problem.questionText || "",
            answerText: problem.answerText || "",
            imageUrl: problem.imageUrl || "",
            promptText: "",
            generatedPrompt: "",
            generatedSvg: "",
            imageLoadError: false,
            busy: false,
            busyLabel: "",
          }
        }
      })
      return next
    })
  }, [selectedReviewItem])

  useEffect(() => {
    const prevOpen = reviewPaneOpenRef.current
    reviewPaneOpenRef.current = isReviewEditorOpen
    if (prevOpen === isReviewEditorOpen) return
    setReviewMorphing(true)
    setReviewMorphTick(0)
    let tick = 0
    const interval = setInterval(() => {
      tick += 1
      setReviewMorphTick(tick)
      if (tick >= REVIEW_MORPH_STEPS) {
        clearInterval(interval)
        setReviewMorphing(false)
      }
    }, 58)
    return () => clearInterval(interval)
  }, [isReviewEditorOpen])

  function updateProblemDraft(key, patch) {
    setReviewProblemDrafts(prev => ({
      ...prev,
      [key]: { ...(prev[key] || {}), ...patch },
    }))
  }

  function jumpToSection(id) {
    setActiveAdminSection(id)
    if (typeof window === "undefined") return
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function runR2Backup() {
    setBackupBusy(true)
    setBackupError(null)
    setBackupResult(null)
    try {
      const res = await fetch("/api/admin/backup-r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: backupLabel || "manual",
          includeBlocks: backupIncludeBlocks,
        }),
      })
      const data = await readJsonOrThrow(res, "R2 backup")
      if (!res.ok || data.error) throw new Error(data.error || "Failed to create backup")
      setBackupResult(data)
    } catch (err) {
      setBackupError(err.message || "Failed to create backup")
    } finally {
      setBackupBusy(false)
    }
  }


  function openEndClassModal() {
    if (!endClassTopics.length) return
    setEndClassSelection(Object.fromEntries(endClassTopics.map(topic => [topic.id, true])))
    setEndClassError(null)
    setEndClassNotice("")
    setEndClassOpen(true)
  }

  async function handleEndClass(previewExit = false) {
    const taughtIds = endClassTopics.filter(topic => endClassSelection[topic.id]).map(topic => topic.id)
    if (!focusStudentId || !endClassSubjectId || !endClassSessionDate) {
      setEndClassError("Missing student, subject, or session date.")
      return
    }
    if (!taughtIds.length) {
      setEndClassError("Pick at least one topic that was actually covered.")
      return
    }
    setEndClassBusy(true)
    setEndClassError(null)
    setEndClassNotice("")
    try {
      const res = await fetch("/api/admin/end-class", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: focusStudentId,
          subjectId: endClassSubjectId,
          sessionDate: endClassSessionDate,
          taughtIds,
          idType: "questionPage",
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setEndClassTopics(data.exitTopics || [])
      setEndClassSelection(Object.fromEntries((data.exitTopics || []).map(topic => [topic.id, true])))
      setEndClassNotice(
        `Class ended. Exit now covers ${data.exitTopics?.length || 0} topic(s).` +
        (data.pacingUpdated ? ` Pacing was updated and ${data.pacingMovedDraftRows || 0} future draft row(s) were reflowed.` : "")
      )
      setEndClassOpen(false)
      if (previewExit) {
        window.open(
          `/assessment?subjectId=${endClassSubjectId}&mode=exit&as=${focusStudentId}&sessionDate=${encodeURIComponent(endClassSessionDate)}&previewIds=${encodeURIComponent(JSON.stringify((data.exitTopicIds || [])))}`,
          "_blank"
        )
      }
    } catch (err) {
      setEndClassError(err.message || "Failed to end class")
    } finally {
      setEndClassBusy(false)
    }
  }

  async function handleRebuildPages() {
    if (!focusStudentId || !endClassSubjectId) return
    if (!window.confirm("This will DELETE and REWRITE all question page blocks for this student/subject. Proceed?")) return
    setRebuildBusy(true)
    setRebuildError(null)
    setRebuildResult(null)
    try {
      const res = await fetch("/api/admin/rebuild-pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: focusStudentId, subjectId: endClassSubjectId }),
      })
      const data = await readJsonOrThrow(res, "Rebuild pages")
      if (!res.ok || data?.error) throw new Error(data?.error || "Failed to rebuild pages")
      setRebuildResult(data)
    } catch (err) {
      setRebuildError(err.message || "Failed to rebuild pages")
    } finally {
      setRebuildBusy(false)
    }
  }

  async function handleGenerateShowcaseCode() {
    setShowcaseBusy(true)
    setShowcaseError(null)
    setShowcaseResult(null)
    try {
      const label = "Showcase"
      const res = await fetch("/api/admin/showcase-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, expiresHours: 72 }),
      })
      const data = await readJsonOrThrow(res, "Generate showcase code")
      if (!res.ok || data?.error) throw new Error(data?.error || "Failed to generate showcase code")
      setShowcaseResult(data)
    } catch (err) {
      setShowcaseError(err.message || "Failed to generate showcase code")
    } finally {
      setShowcaseBusy(false)
    }
  }

  async function handleCopyShowcaseValue(value, label = "Value") {
    try {
      await navigator.clipboard.writeText(value)
      setShowcaseError(null)
      setShowcaseResult((prev) => (prev ? { ...prev, copiedLabel: label } : prev))
    } catch (err) {
      setShowcaseError(`Failed to copy ${label.toLowerCase()}.`)
    }
  }

  async function handleCopyPracticeRevision() {
    if (!practiceRevision?.revisionLines) return
    try {
      await navigator.clipboard.writeText(practiceRevision.revisionLines)
      setPracticeError(null)
      setReviewNotice("Practice revision list copied.")
    } catch {
      setPracticeError("Failed to copy revision list.")
    }
  }

  function renderDashboardQueueSection(title, items = [], emptyCopy) {
    return (
      <div style={{ ...s.insightCard, gridColumn: "1 / -1" }}>
        <div style={s.insightTitle}>{title}</div>
        {dashboardQueueLoading && <div style={s.hint}>Loading classes...</div>}
        {!dashboardQueueLoading && dashboardQueueError && <div style={s.error}>❌ {dashboardQueueError}</div>}
        {!dashboardQueueLoading && !dashboardQueueError && items.length === 0 && (
          <div style={s.hint}>{emptyCopy}</div>
        )}
        {!dashboardQueueLoading && !dashboardQueueError && items.length > 0 && (
          <div style={s.tomorrowPrepGrid}>
            {items.map((item) => (
              <div key={`${title}-${item.studentId}-${item.subjectId}-${item.sessionDate}-${item.startTime || "na"}`} style={s.tomorrowPrepCard}>
                <div style={s.tomorrowPrepHeader}>
                  <div>
                    <div style={s.tomorrowPrepTitle}>{item.subjectName}</div>
                    <div style={s.tomorrowPrepMeta}>
                      {item.studentName} ·{" "}
                      {formatDate(item.adminSessionDate || item.sessionDate)} · {formatTimeInTimezone(item.startTime, adminTimezone) || "Time TBD"}
                      {item.duration ? ` · ${item.duration} min` : ""}
                    </div>
                  </div>
                  <div style={s.tomorrowPrepHeaderRight}>
                    {item.zoomLink && (
                      <a href={item.zoomLink} target="_blank" rel="noreferrer" style={s.queueZoomBtn}>Zoom</a>
                    )}
                    <span
                      style={{
                        ...s.tomorrowPrepStatus,
                        ...(item.preStatus === "Completed" || item.preStatus === "completed"
                          ? s.tomorrowPrepStatusReady
                          : item.preStatus === "unlocked" || item.preStatus === "available"
                            ? s.tomorrowPrepStatusOpen
                            : s.tomorrowPrepStatusPending),
                      }}
                    >
                      {item.readinessLabel}
                    </span>
                  </div>
                </div>
                <div style={s.tomorrowPrepFacts}>
                  <div><span style={s.previewLabel}>Student</span><span style={s.previewValue}>{item.studentName}</span></div>
                  <div><span style={s.previewLabel}>Admin date</span><span style={s.previewValue}>{item.adminSessionDate || "Missing"}</span></div>
                  <div><span style={s.previewLabel}>Session anchor</span><span style={s.previewValue}>{item.sessionDate || "Missing"}</span></div>
                  <div><span style={s.previewLabel}>Pre-class</span><span style={s.previewValue}>{item.preAttempt ? (item.preAttempt.status || "Assigned") : "Not unlocked"}</span></div>
                </div>
                <div style={s.tomorrowPrepActions}>
                  <button style={s.liveMiniBtn} onClick={() => openDashboardClassPrep(item, "pacing")}>Open pacing</button>
                  <button style={s.liveMiniBtn} onClick={() => openDashboardClassPrep(item, "review")}>Review draft</button>
                  <button style={s.liveMiniBtn} onClick={() => openDashboardClassPrep(item, "live")}>Open live class</button>
                  <button
                    style={s.liveMiniBtn}
                    onClick={() => window.open(`/assessment?subjectId=${item.subjectId}&mode=pre&as=${item.studentId}&sessionDate=${encodeURIComponent(item.sessionDate || "")}`, "_blank")}
                  >
                    Preview pre-class
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  function renderCalendarPlanningSection({ inline = false } = {}) {
    return (
      <div
        id="calendar"
        style={
          inline
            ? { ...s.section, marginTop: 28, paddingTop: 24, borderTop: `1px solid ${lm ? "#e0d4b8" : "#2a2416"}` }
            : s.section
        }
      >
        <h2 style={s.sectionTitle}>Calendar & Session Planning</h2>
        <p style={s.sub}>Connect your calendar to sync class sessions, then inspect the real session dates and planning frontier before scheduling question types.</p>
        <div style={s.dropdownRow}>
          <div style={s.dropdownGroup}>
            <label style={s.label}>Student</label>
            <select style={s.select} value={calendarStudentId} onChange={e => setCalendarStudentId(e.target.value)}>
              <option value="">Select student...</option>
              {students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </div>
        </div>
        <div style={s.calendarRow}>
          <div style={{ ...s.statusDot, background: calendarStatus === "connected" ? "#4caf50" : "#555" }} />
          <span style={s.statusText}>
            {calendarStatus === "connected" ? "Connected"
              : calendarStatus?.startsWith("error:") ? "Error: " + calendarStatus.split(":")[1]
              : "Not connected"}
          </span>
          <a href="/api/admin/connect-calendar" style={s.connectBtn}>
            {calendarStatus === "connected" ? "Reconnect" : "Connect Calendar"}
          </a>
        </div>
        <h3 style={{ ...s.sectionTitle, fontSize: 15, marginBottom: 4 }}>Sessions</h3>
        <p style={s.sub}>This section is for calendar sync and the actual session timeline. Use sync start and sync end here, then review or reset the session rows before planning drafts.</p>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 320px)", gap: 10, marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11, color: lm ? "#7a6440" : "#b8b0a0" }}>Subject</span>
            <select style={s.select} value={planSubjectId} onChange={e => setPlanSubjectId(e.target.value)}>
              <option value="">Select subject…</option>
              {(() => { const subs = getSubjectsForStudent(calendarStudentId); console.log("[frontier] calendarStudentId:", calendarStudentId, "subjects:", subs.map(s => s.name)); return subs; })().map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, minWidth: 320, flex: "1 1 360px" }}>
            <div>
              <label style={s.label}>Sync start</label>
              <input type="date" value={calendarSyncStartDate} onChange={e => setCalendarSyncStartDate(e.target.value)} style={s.select} />
            </div>
            <div>
              <label style={s.label}>Sync end</label>
              <input type="date" value={calendarSyncEndDate} onChange={e => setCalendarSyncEndDate(e.target.value)} style={s.select} />
            </div>
          </div>
          <button
            style={{ ...s.secondaryBtn, width: "auto", padding: "10px 16px", opacity: calendarStudentId && calendarStatus === "connected" && !calendarSyncing ? 1 : 0.5, marginBottom: 0 }}
            disabled={!calendarStudentId || calendarStatus !== "connected" || calendarSyncing}
            onClick={handleSyncSessionsFromCalendar}
          >
            {calendarSyncing ? "Syncing sessions..." : "Sync Sessions For Selected Student"}
          </button>
          <span style={{ ...s.statusText, color: lm ? "#7a6744" : "#9a8a6c" }}>
            Creates or updates `Sessions DB` rows only inside the selected date window for the chosen student across enrolled subjects.
          </span>
        </div>
        {calendarSyncError && <div style={s.error}>❌ {calendarSyncError}</div>}
        {calendarSyncNotice && <div style={{ ...s.resultBox, marginBottom: 16 }}>{calendarSyncNotice}</div>}

        <div style={{ marginTop: 20, padding: 12, borderRadius: 8, background: lm ? "#f7f1e5" : "#141008", border: `1px solid ${lm ? "#e2d2b0" : "#2c2110"}` }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <button
                style={{ background: "none", border: `1px solid ${lm ? "#c09090" : "#4a2020"}`, color: lm ? "#8a4040" : "#c08080", borderRadius: 5, padding: "10px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: planLoading || !calendarStudentId || !planSubjectId ? 0.5 : 1 }}
                disabled={planLoading || !calendarStudentId || !planSubjectId}
                onClick={async () => {
                  if (!confirm("Delete all session rows for this student and subject so you can resync from Google Calendar?")) return
                  setPlanLoading(true); setPlanError(null); setPlanNotice(""); setPlanPreview(null)
                  try {
                    const r = await fetch("/api/admin/plan-sessions", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "reset_sessions", studentId: calendarStudentId, subjectId: planSubjectId }),
                    })
                    const d = await readJsonOrThrow(r, "Reset sessions")
                    if (!r.ok) throw new Error(d.error || "Reset failed")
                    setPlanNotice(`Deleted ${d.deletedSessions} session row(s). You can now sync clean dates from Google Calendar.`)
                    await refreshSessionFrontier(calendarStudentId, planSubjectId)
                    await refreshCalendarRows(calendarStudentId, planSubjectId)
                  } catch (err) {
                    setPlanError(err.message || "Failed to reset session rows")
                  } finally {
                    setPlanLoading(false)
                  }
                }}
              >
                Reset session rows
              </button>
              <div style={{ ...s.hint, margin: 0 }}>
                Clears this subject’s session rows so the next Google sync can rebuild them cleanly.
              </div>
            </div>
            {sessionFrontierLoading && <div style={s.hint}>Loading session dates...</div>}
            {!sessionFrontierLoading && sessionFrontierError && <div style={s.error}>❌ {sessionFrontierError}</div>}
            {!sessionFrontierLoading && !sessionFrontierError && !planSubjectId && (
              <div style={s.hint}>Pick a subject to inspect the real session dates and current frontier.</div>
            )}
            {!sessionFrontierLoading && !sessionFrontierError && planSubjectId && sessionFrontierData && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 6, marginBottom: 10 }}>
                  {[["Earliest", sessionFrontierData.earliestDate || "—"], ["Latest", sessionFrontierData.latestDate || "—"], ["Frontier", sessionFrontierData.frontierDate || "None"], ["Calendar rows", sessionFrontierData.rows?.length || 0]].map(([label, val]) => (
                    <div key={label} style={{ background: lm ? "#fffdf5" : "#0e0c06", border: `1px solid ${lm ? "#e0d090" : "#1e1a08"}`, borderRadius: 5, padding: "6px 8px" }}>
                      <div style={{ fontSize: 10, color: lm ? "#8a7040" : "#8a7a50", marginBottom: 2 }}>{label}</div>
                      <div style={{ fontWeight: 600, color: lm ? "#2a2000" : "#d4c080" }}>{String(val ?? "—")}</div>
                    </div>
                  ))}
                </div>
                <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${lm ? "#e0d4b8" : "#2a2416"}`, borderRadius: 6 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: lm ? "#f1e6cf" : "#181108" }}>
                        {["Date", "Source", "Drafts", "Committed", "Scores", "Status"].map((label) => (
                          <th key={label} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${lm ? "#dcc9a0" : "#2a2110"}`, color: lm ? "#6a4b16" : "#cfa85d" }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(sessionFrontierData.rows || []).map((row) => {
                        const isFrontier = sessionFrontierData.frontierDate && row.date === sessionFrontierData.frontierDate
                        return (
                          <tr key={row.id} style={{ background: isFrontier ? (lm ? "#fff4cc" : "#2b1f06") : "transparent" }}>
                            <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}` }}>{row.date}</td>
                            <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}` }}>
                              {row.source || "—"}
                              {row.inferredOnly ? (
                                <span style={{ marginLeft: 6, fontSize: 10, color: lm ? "#8a5b00" : "#f0c15a" }}>
                                  inferred only
                                </span>
                              ) : null}
                            </td>
                            <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}` }}>
                              {row.draftCount}
                              {row.inferredDraftCount > 0 ? (
                                <span style={{ marginLeft: 6, fontSize: 10, color: lm ? "#8a7040" : "#b89c60" }}>
                                  ({row.inferredDraftCount} inferred)
                                </span>
                              ) : null}
                            </td>
                            <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}` }}>{row.committedDraftCount}</td>
                            <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}` }}>{row.scoreCount}</td>
                            <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}`, color: isFrontier ? (lm ? "#8a5b00" : "#f0c15a") : (lm ? "#6d624f" : "#aa9a7c") }}>
                              {isFrontier ? "Frontier" : row.scoreCount > 0 ? "Taught" : row.inferredOnly ? "Inferred draft" : row.draftCount > 0 ? "Planned" : "Session only"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          <h3 style={{ ...s.sectionTitle, fontSize: 15, marginBottom: 4 }}>Drafts</h3>
          <p style={s.sub}>Pick a subject, set the anchor date, choose the frontier section from the pacing guide, then preview and commit. <strong>Plan new QTs</strong> adds only QTs not yet planned. <strong>Redistribute</strong> re-sorts all uncommitted drafts by the current pacing guide — safe to run after importing new QTs; only shuffles dates, never erases scores.</p>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {[["plan", "Plan new QTs"], ["redistribute", "Redistribute all"]].map(([mode, label]) => (
              <button key={mode} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 5, cursor: "pointer", border: `1px solid ${lm ? "#c0a860" : "#5a4820"}`, background: planMode === mode ? (lm ? "#ead7aa" : "#3a3020") : "none", color: lm ? "#4a3414" : "#d4b870" }} onClick={() => { setPlanMode(mode); setPlanPreview(null); setPlanIncludeCommitted(false) }}>{label}</button>
            ))}
          </div>
          {planMode === "redistribute" && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", color: lm ? "#7a3030" : "#c08080" }}>
                <input type="checkbox" checked={planIncludeCommitted} onChange={e => { setPlanIncludeCommitted(e.target.checked); setPlanPreview(null) }} />
                Also redate committed items + their score DB rows (date_introduced, assigned_session_id)
              </label>
              {planIncludeCommitted && (
                <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 6, background: lm ? "#fff0f0" : "#1a0808", border: `1px solid ${lm ? "#e08080" : "#6a2020"}`, fontSize: 12, color: lm ? "#8a2020" : "#e09090", lineHeight: 1.6 }}>
                  <strong>WARNING — potentially destructive.</strong> This will rewrite <code>date_introduced</code> and <code>assigned_session_id</code> in <code>student_question_types</code> for all committed QTs in the redistributed range. Mastery scores, decay calculations, mastery events, streaks, and seen/wrong dates are NOT affected — decay is driven entirely by mastery event timestamps, not <code>date_introduced</code>. What does shift: which session these QTs appear under in the live rail, homework priority ordering, and exit ticket routing. Only use this when committed items were never actually practiced and their session dates are fabricated.
                </div>
              )}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: lm ? "#7a6440" : "#b8b0a0" }}>Anchor date (first forward session)</span>
              <input type="date" style={s.select} value={planAnchorDate} onChange={e => { setPlanAnchorDate(e.target.value); setPlanPreview(null) }} />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: lm ? "#7a6440" : "#b8b0a0" }}>Frontier section (first forward section) {planSectionsLoading ? "(loading…)" : ""}</span>
              <select style={s.select} value={planFrontierIndex} onChange={e => { setPlanFrontierIndex(e.target.value); setPlanPreview(null) }} disabled={!planSections.length}>
                <option value="">No frontier selected (all backfill)</option>
                {planSections.map((sec, i) => <option key={sec.sectionId || sec.code} value={i}>{sec.code}{sec.name ? ` — ${sec.name}` : ""}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 11, color: lm ? "#7a6440" : "#b8b0a0" }}>QTs per hour</span>
              <input type="number" min={1} max={12} style={s.select} value={planTypesPerHour} onChange={e => setPlanTypesPerHour(Number(e.target.value) || 3)} />
            </label>
          </div>
          <div style={{ ...s.hint, marginBottom: 14 }}>
            Select any section from the pacing guide as the frontier.
            Everything before that section backfills historically, using inferred session dates when real session rows are missing.
            The chosen frontier section and everything after it are planned forward from the anchor date.
          </div>
          {planError && <div style={{ ...s.error, marginBottom: 8 }}>{planError}</div>}
          {planNotice && <div style={{ ...s.hint, marginBottom: 8 }}>{planNotice}</div>}
          {planPreview && (
            <div style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: lm ? "#f4f0e4" : "#131008", border: `1px solid ${lm ? "#d0c090" : "#2a2010"}`, fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: lm ? "#5a4010" : "#d4b870" }}>Preview</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 6, marginBottom: 8 }}>
                {(planPreview.mode === "redistribute"
                  ? [["Anchor", planPreview.anchorDate], ["Total QTs", planPreview.totalQTs], ["Committed skipped", planPreview.committedSkipped], ["Committed redate", planPreview.committedRedated ?? "—"], ["Will update", planPreview.updatedQTs], ["Will insert (new)", planPreview.newQTs], ["Backfill QTs", planPreview.backfillQTs], ["Forward QTs", planPreview.forwardQTs], ["Overflow QTs", planPreview.overflowQTs], ["Buffer date", planPreview.bufferDate || "—"], ["Inferred sessions", planPreview.inferredSessions], ["Date range", planPreview.dateRange ? `${planPreview.dateRange.from} → ${planPreview.dateRange.to}` : "—"]]
                  : [["Anchor", planPreview.anchorDate], ["Total QTs", planPreview.totalQTs], ["Locked (prereqs)", planPreview.lockedQTs], ["Already planned", planPreview.skippedExisting], ["Backfill QTs", planPreview.backfillQTs], ["Forward QTs", planPreview.forwardQTs], ["Overflow QTs", planPreview.overflowQTs], ["Buffer date", planPreview.bufferDate || "—"], ["Inferred sessions", planPreview.inferredSessions], ["Total assignments", planPreview.totalAssignments], ["Date range", planPreview.dateRange ? `${planPreview.dateRange.from} → ${planPreview.dateRange.to}` : "—"]]
                ).map(([label, val]) => (
                  <div key={label} style={{ background: lm ? "#fffdf5" : "#0e0c06", border: `1px solid ${lm ? "#e0d090" : "#1e1a08"}`, borderRadius: 5, padding: "6px 8px" }}>
                    <div style={{ fontSize: 10, color: lm ? "#8a7040" : "#8a7a50", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontWeight: 600, color: lm ? "#2a2000" : "#d4c080" }}>{String(val ?? "—")}</div>
                  </div>
                ))}
              </div>
              {planPreview.bufferDate && planPreview.overflowQTs > 0 && (
                <div style={{ fontSize: 11, padding: "5px 8px", background: lm ? "#fff8e0" : "#141008", border: `1px solid ${lm ? "#d0b040" : "#3a2808"}`, borderRadius: 5, marginBottom: 8, color: lm ? "#6a5010" : "#c0a040" }}>
                  {planPreview.overflowQTs} QT{planPreview.overflowQTs !== 1 ? "s" : ""} overflow → buffer date {planPreview.bufferDate}. Arrange an extra session with parent.
                </div>
              )}
              {Object.keys(planPreview.sessionBreakdown || {}).length > 0 && (
                <div style={{ maxHeight: 140, overflowY: "auto" }}>
                  {Object.entries(planPreview.sessionBreakdown).map(([date, info]) => (
                    <div key={date} style={{ fontSize: 11, color: info.overflow ? (lm ? "#7a5010" : "#c0a040") : (lm ? "#4a3a10" : "#c0a860"), marginBottom: 2 }}>
                      {date}: {info.count} QT{info.count !== 1 ? "s" : ""}{info.sections?.length ? ` — ${info.sections.join(", ")}` : ""}{info.overflow ? " ⚠ buffer" : info.inferred ? " (inferred)" : ""}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button style={{ ...s.secondaryBtn, width: "auto", opacity: planLoading || !calendarStudentId || !planSubjectId || !planAnchorDate ? 0.5 : 1 }} disabled={planLoading || !calendarStudentId || !planSubjectId || !planAnchorDate} onClick={async () => {
              setPlanLoading(true); setPlanError(null); setPlanPreview(null); setPlanNotice("")
              const previewAction = planMode === "redistribute" ? "redistribute_preview" : "preview"
              try {
                const r = await fetch("/api/admin/plan-sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: previewAction, studentId: calendarStudentId, subjectId: planSubjectId, anchorDate: planAnchorDate, frontierSectionIndex: planFrontierIndex !== "" ? Number(planFrontierIndex) : null, typesPerHour: planTypesPerHour, includeCommitted: planIncludeCommitted }) })
                const d = await readJsonOrThrow(r, "Preview plan")
                if (!r.ok) throw new Error(d.error || "Preview failed")
                setPlanPreview(d)
              } catch (err) { setPlanError(err.message) } finally { setPlanLoading(false) }
            }}>{planLoading ? "Working…" : "Preview"}</button>
            <button style={{ ...s.importBtn, width: "auto", padding: "10px 22px", opacity: planLoading || !planPreview ? 0.5 : 1 }} disabled={planLoading || !planPreview} onClick={async () => {
              const commitAction = planMode === "redistribute" ? "redistribute" : "plan"
              if (planMode === "redistribute" && planIncludeCommitted) {
                if (!confirm(`Redate ${planPreview?.committedRedated ?? "some"} committed item(s) in the score DB?\n\nScores and mastery are untouched — only session assignment dates shift.`)) return
                if (!confirm("This cannot be undone. Are you sure?")) return
              } else if (planMode === "redistribute") {
                if (!confirm(`Redistribute ${planPreview?.updatedQTs ?? "?"} draft items by pacing order?`)) return
              }
              setPlanLoading(true); setPlanError(null); setPlanNotice("")
              try {
                const r = await fetch("/api/admin/plan-sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: commitAction, studentId: calendarStudentId, subjectId: planSubjectId, anchorDate: planAnchorDate, frontierSectionIndex: planFrontierIndex !== "" ? Number(planFrontierIndex) : null, typesPerHour: planTypesPerHour, includeCommitted: planIncludeCommitted }) })
                const d = await readJsonOrThrow(r, "Plan sessions")
                if (!r.ok) throw new Error(d.error || "Plan failed")
                setPlanPreview(null)
                if (planMode === "redistribute") {
                  setPlanNotice(`Redistributed: ${d.updated || 0} draft items updated, ${d.inserted || 0} new.${d.sqtUpdated ? ` Score DB redated: ${d.sqtUpdated}.` : ""} Committed skipped: ${d.committedSkipped || 0}. Inferred sessions: ${d.inferredSessions || 0}.`)
                } else {
                  setPlanNotice(`Planned ${d.totalAssignments} draft item(s). Backfill: ${d.backfillQTs}, Forward: ${d.forwardQTs}, Inferred sessions: ${d.inferredSessions}.`)
                }
              } catch (err) { setPlanError(err.message) } finally { setPlanLoading(false) }
            }}>{planLoading ? "Working…" : planMode === "redistribute" ? "Commit Redistribute" : "Commit Plan"}</button>
            <button style={{ background: "none", border: `1px solid ${lm ? "#c09090" : "#4a2020"}`, color: lm ? "#8a4040" : "#c08080", borderRadius: 5, padding: "10px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: planLoading || !calendarStudentId || !planSubjectId || !planAnchorDate ? 0.5 : 1 }} disabled={planLoading || !calendarStudentId || !planSubjectId || !planAnchorDate} onClick={async () => {
              if (!confirm("Delete all uncommitted future draft items from the anchor date onward?")) return
              setPlanLoading(true); setPlanError(null); setPlanNotice(""); setPlanPreview(null)
              try {
                const r = await fetch("/api/admin/plan-sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear_future", studentId: calendarStudentId, subjectId: planSubjectId, anchorDate: planAnchorDate }) })
                const d = await readJsonOrThrow(r, "Clear future")
                if (!r.ok) throw new Error(d.error || "Clear failed")
                setPlanNotice(`Cleared ${d.deleted} uncommitted draft item(s) from ${d.cutoff} onward.`)
                await refreshSessionFrontier(calendarStudentId, planSubjectId)
                await refreshCalendarRows(calendarStudentId, planSubjectId)
              } catch (err) { setPlanError(err.message) } finally { setPlanLoading(false) }
            }}>Clear future drafts</button>
            <button style={{ background: "none", border: `1px solid ${lm ? "#b8924c" : "#4a3414"}`, color: lm ? "#7a5716" : "#d4b870", borderRadius: 5, padding: "10px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: planLoading || !calendarStudentId || !planSubjectId || !planAnchorDate ? 0.5 : 1 }} disabled={planLoading || !calendarStudentId || !planSubjectId || !planAnchorDate} onClick={async () => {
              if (!confirm("Delete planner-created historical draft items and inferred session rows before the anchor date?")) return
              setPlanLoading(true); setPlanError(null); setPlanNotice(""); setPlanPreview(null)
              try {
                const r = await fetch("/api/admin/plan-sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "clear_inferred_historical", studentId: calendarStudentId, subjectId: planSubjectId, anchorDate: planAnchorDate }) })
                const d = await readJsonOrThrow(r, "Clear history")
                if (!r.ok) throw new Error(d.error || "Clear failed")
                setPlanNotice(`Cleared ${d.deletedDrafts} historical draft item(s) and ${d.deletedSessions} inferred session row(s) before ${d.cutoff}.`)
                await refreshSessionFrontier(calendarStudentId, planSubjectId)
                await refreshCalendarRows(calendarStudentId, planSubjectId)
              } catch (err) { setPlanError(err.message) } finally { setPlanLoading(false) }
            }}>Clear history</button>
          </div>
          {!sessionFrontierLoading && !sessionFrontierError && planSubjectId && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: lm ? "#f6f1e6" : "#120f08", border: `1px solid ${lm ? "#ddd1b7" : "#2a2114"}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: lm ? "#5a4010" : "#d4b870", marginBottom: 4 }}>Scores DB</div>
              <div style={{ ...s.hint, marginBottom: 10 }}>
                Once the draft timeline looks correct, commit the historical presence into Scores DB with zero mastery so later attempts can attach to the right dates.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  style={{ ...s.secondaryBtn, width: "auto", opacity: scoreBackfillLoading || !calendarStudentId || !planSubjectId ? 0.5 : 1 }}
                  disabled={scoreBackfillLoading || !calendarStudentId || !planSubjectId}
                  onClick={async () => {
                    const cutoff = planAnchorDate || formatLocalDateInput(new Date())
                    if (!confirm(`Create missing score rows from draft items dated on or before ${cutoff}? Existing later score rows will be pulled back to the earliest draft date, but mastery stays at 0.`)) return
                    setScoreBackfillLoading(true)
                    setPlanError(null)
                    setPlanNotice("")
                    try {
                      const r = await fetch("/api/admin/backfill-score-rows", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ studentId: calendarStudentId, subjectId: planSubjectId, cutoffDate: cutoff }),
                      })
                      const d = await readJsonOrThrow(r, "Backfill score rows")
                      if (!r.ok) throw new Error(d.error || "Backfill failed")
                      setPlanNotice(`Score backfill complete through ${d.cutoffDate}: created ${d.created}, realigned ${d.realigned}, unchanged ${d.skippedExisting}.`)
                      await refreshSessionFrontier(calendarStudentId, planSubjectId)
                      await refreshCalendarRows(calendarStudentId, planSubjectId)
                    } catch (err) {
                      setPlanError(err.message || "Failed to backfill score rows")
                    } finally {
                      setScoreBackfillLoading(false)
                    }
                  }}
                >
                  {scoreBackfillLoading ? "Working…" : "Commit to Scores DB"}
                </button>
                <div style={{ ...s.hint, margin: 0 }}>
                  Seeds missing historical score rows from past draft dates with zero mastery.
                </div>
              </div>
            </div>
          )}
          {!sessionFrontierLoading && !sessionFrontierError && planSubjectId && (
            <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: lm ? "#f6f1e6" : "#120f08", border: `1px solid ${lm ? "#ddd1b7" : "#2a2114"}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: lm ? "#5a4010" : "#d4b870", marginBottom: 4 }}>Live Rows</div>
              <div style={{ ...s.hint, marginBottom: 10 }}>
                Draft rows and score rows for this student and subject. This view refreshes automatically when stale.
              </div>
              {calendarRowsLoading && <div style={s.hint}>Loading draft and score rows...</div>}
              {!calendarRowsLoading && calendarRowsError && <div style={s.error}>❌ {calendarRowsError}</div>}
              {!calendarRowsLoading && !calendarRowsError && calendarRowsData && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 6, marginBottom: 10 }}>
                    {[["Draft rows", calendarRowsData.draftSummary?.total || 0], ["Draft inferred", calendarRowsData.draftSummary?.inferred || 0], ["Score rows", calendarRowsData.scoreSummary?.total || 0], ["Score zeroes", calendarRowsData.scoreSummary?.zeroWeakness || 0]].map(([label, val]) => (
                      <div key={label} style={{ background: lm ? "#fffdf5" : "#0e0c06", border: `1px solid ${lm ? "#e0d090" : "#1e1a08"}`, borderRadius: 5, padding: "6px 8px" }}>
                        <div style={{ fontSize: 10, color: lm ? "#8a7040" : "#8a7a50", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontWeight: 600, color: lm ? "#2a2000" : "#d4c080" }}>{String(val ?? "—")}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: lm ? "#6a4b16" : "#cfa85d", marginBottom: 6 }}>Draft rows</div>
                      <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${lm ? "#e0d4b8" : "#2a2416"}`, borderRadius: 6 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: lm ? "#f1e6cf" : "#181108" }}>
                              {["Date", "Title", "Flags"].map((label) => (
                                <th key={label} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${lm ? "#dcc9a0" : "#2a2110"}`, color: lm ? "#6a4b16" : "#cfa85d" }}>{label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(calendarRowsData.drafts || []).map((row) => (
                              <tr key={row.id}>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}` }}>{row.date || "—"}</td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}` }}>{row.title || row.questionTypeId}</td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}`, color: lm ? "#6d624f" : "#aa9a7c" }}>
                                  {row.committed ? "committed" : "draft"}{row.inferred ? " · inferred" : ""}{row.planSource ? ` · ${row.planSource}` : ""}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: lm ? "#6a4b16" : "#cfa85d", marginBottom: 6 }}>Score rows</div>
                      <div style={{ maxHeight: 240, overflowY: "auto", border: `1px solid ${lm ? "#e0d4b8" : "#2a2416"}`, borderRadius: 6 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: lm ? "#f1e6cf" : "#181108" }}>
                              {["Date", "Title", "Weakness", "Mastery"].map((label) => (
                                <th key={label} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `1px solid ${lm ? "#dcc9a0" : "#2a2110"}`, color: lm ? "#6a4b16" : "#cfa85d" }}>{label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(calendarRowsData.scores || []).map((row) => (
                              <tr key={row.id}>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}` }}>{row.date || "—"}</td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}` }}>{row.title || row.questionTypeId}</td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}` }}>{row.weaknessScore}</td>
                                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${lm ? "#eee3ca" : "#1d160a"}` }}>{Number(row.masteryScore || 0).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  function getNextFocusClass(subject) {
    const classes = Array.isArray(subject?.upcomingClasses) ? subject.upcomingClasses : []
    return classes[0] || null
  }

  function openFocusSubjectSection(subject, target = "review") {
    if (!focusStudentId || !subject?.id) return
    const nextClass = getNextFocusClass(subject)
    const sessionDate = nextClass?.startTime
      ? getDateKeyInTimezone(nextClass.startTime, focusData?.student?.timezone || focusStudent?.timezone || "UTC")
      : (subject?.sessionDate || "")

    if (target === "pacing") {
      setPacingStudentId(focusStudentId)
      setPacingSubject(subject.id)
      loadPacingGuideFor(focusStudentId, subject.id)
      jumpToSection("pacing")
      return
    }
    if (target === "review") {
      setReviewStudentId(focusStudentId)
      setReviewSubjectId(subject.id)
      jumpToSection("review")
      return
    }
    if (target === "live") {
      setLiveStudentId(focusStudentId)
      setLiveSubjectId(subject.id)
      if (sessionDate) setLiveSessionDate(sessionDate)
      jumpToSection("live-class")
      return
    }
    if (target === "import") {
      setImportStudent(focusStudentId)
      setImportSubject(subject.id)
      jumpToSection("import")
    }
  }

  function loDisplay(code) {
    if (!code || code === "Unmapped") return "Unmapped"
    const obj = getObjectiveByCode(focusState, reviewSubjectName, code)
    return obj?.name ? `${obj.name} (${code})` : code
  }

  async function applyReviewAction(action, payload = {}, options = {}) {
    if (!reviewStudentId || !reviewSubjectId || !selectedReviewItem) return
    if (reviewLoading || !reviewItems.some(item => item.id === selectedReviewItem.id)) return
    const { refresh = true, preserveSelection = true } = options
    setReviewBusy(true)
    setReviewError(null)
    try {
      const res = await fetch("/api/admin/review-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          studentId: reviewStudentId,
          subjectId: reviewSubjectId,
          scoreRowId: selectedReviewItem.id,
          questionId: selectedReviewItem.questionId || "",
          ...payload,
        })
      })
      const data = await readJsonOrThrow(res, `Review action: ${action}`)
      if (data.error === "LO_LOSS_WARNING") {
        const list = (data.loLoss || []).join(", ")
        const proceed = window.confirm(`Warning: this deletion removes the last mapping for LO(s): ${list}.\n\nProceed anyway?`)
        if (!proceed) return
        const forceRes = await fetch("/api/admin/review-queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            studentId: reviewStudentId,
            subjectId: reviewSubjectId,
            scoreRowId: selectedReviewItem.id,
            questionId: selectedReviewItem.questionId || "",
            confirmLoLoss: true,
            ...payload,
          })
        })
        const forced = await readJsonOrThrow(forceRes, `Review action (forced): ${action}`)
        if (forced.error) throw new Error(forced.error)
      } else if (data.error) {
        throw new Error(data.error)
      }
      if (refresh) {
        const prevSelected = selectedReviewItem.id
        const refreshed = await fetch(`/api/admin/review-queue?studentId=${reviewStudentId}&subjectId=${reviewSubjectId}`)
        const queue = await readJsonOrThrow(refreshed, "Review queue refresh")
        const items = queue.items || []
        setReviewItems(items)
        if (preserveSelection && items.some(i => i.id === prevSelected)) {
          setReviewSelectedId(prevSelected)
        } else {
          setReviewSelectedId(items[0]?.id || "")
          setReviewPage(1)
        }
      }
      return data
    } catch (err) {
      setReviewError(err.message || "Failed to apply review action")
      return null
    } finally {
      setReviewBusy(false)
    }
  }

  async function saveProblemEdits(problem, pKey) {
    const draft = reviewProblemDrafts[pKey] || {}
    if (!problem?.qhash && !problem?.qBlockId) return
    updateProblemDraft(pKey, { busy: true, busyLabel: "Saving..." })
    setReviewNotice("")
    const out = await applyReviewAction("update_problem", {
      qhash: problem.qhash,
      qBlockId: problem.qBlockId,
      questionText: draft.questionText || problem.questionText || "",
      answerText: draft.answerText || problem.answerText || "",
      imageUrl: draft.imageUrl || "",
    }, { refresh: true, preserveSelection: true })
    updateProblemDraft(pKey, { busy: false, busyLabel: "", imageLoadError: false })
    if (out?.ok) setReviewNotice("Problem updated.")
  }

  async function saveLoReinforcement(problem, pKey) {
    const draft = reviewProblemDrafts[pKey] || {}
    updateProblemDraft(pKey, { busy: true, busyLabel: "Saving LO..." })
    setReviewNotice("")
    const out = await applyReviewAction("update_lo_reinforcement", {
      eBlockId: problem.eBlockId || null,
      loTableBlockId: problem.loTableBlockId || null,
      aBlockId: problem.aBlockId || null,
      primaryLo: draft.primaryLo ?? problem.primaryLo ?? "",
      reinforcement: draft.reinforcement ?? problem.reinforcement ?? [],
    }, { refresh: true, preserveSelection: true })
    updateProblemDraft(pKey, { busy: false, busyLabel: "" })
    if (out?.ok) setReviewNotice("LO reinforcement saved.")
  }

  async function generateProblemImagePrompt(problem, pKey) {
    const draft = reviewProblemDrafts[pKey] || {}
    if (!problem?.qhash && !problem?.qBlockId) return
    updateProblemDraft(pKey, { busy: true, busyLabel: "Generating prompt..." })
    const out = await applyReviewAction("generate_image_prompt", {
      qhash: problem.qhash,
      qBlockId: problem.qBlockId,
      questionText: draft.questionText || problem.questionText || "",
      answerText: draft.answerText || problem.answerText || "",
    }, { refresh: false })
    updateProblemDraft(pKey, { busy: false, busyLabel: "", generatedPrompt: out?.prompt || "" })
  }

  async function uploadProblemImage(file, pKey) {
    if (!file || !reviewStudentId || !reviewSubjectId) return
    const toBase64 = (f) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "")
      reader.onerror = reject
      reader.readAsDataURL(f)
    })
    try {
      updateProblemDraft(pKey, { busy: true, busyLabel: "Uploading image..." })
      const fileBase64 = await toBase64(file)
      const res = await fetch("/api/admin/review-image-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64,
          fileName: file.name,
          contentType: file.type,
          studentId: reviewStudentId,
          subjectId: reviewSubjectId,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      updateProblemDraft(pKey, { busy: false, busyLabel: "", imageUrl: data.imageUrl || "", imageLoadError: false })
      setReviewNotice("Image uploaded. Click Save Edit to attach it to the question.")
    } catch (err) {
      updateProblemDraft(pKey, { busy: false, busyLabel: "" })
      setReviewError(err.message || "Failed to upload image")
    }
  }

  async function uploadBlobImage(blob, fileName = "diagram.png", contentType = "image/png") {
    if (!reviewStudentId || !reviewSubjectId) throw new Error("Missing student/subject context")
    const toBase64 = (b) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "")
      reader.onerror = reject
      reader.readAsDataURL(b)
    })
    const fileBase64 = await toBase64(blob)
    const res = await fetch("/api/admin/review-image-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileBase64,
        fileName,
        contentType,
        studentId: reviewStudentId,
        subjectId: reviewSubjectId,
      }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data.imageUrl
  }

  async function uploadSvgText(svgText) {
    if (!reviewStudentId || !reviewSubjectId) throw new Error("Missing student/subject context")
    const res = await fetch("/api/admin/review-image-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        svgText,
        fileName: "diagram.svg",
        contentType: "image/svg+xml",
        studentId: reviewStudentId,
        subjectId: reviewSubjectId,
      }),
    })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return data.imageUrl
  }

  async function generateProblemSvg(problem, pKey) {
    const draft = reviewProblemDrafts[pKey] || {}
    if (!problem?.qhash && !problem?.qBlockId) return
    updateProblemDraft(pKey, { busy: true, busyLabel: "Generating SVG..." })
    const out = await applyReviewAction("generate_svg_diagram", {
      qhash: problem.qhash,
      qBlockId: problem.qBlockId,
      questionText: draft.questionText || problem.questionText || "",
      answerText: draft.answerText || problem.answerText || "",
    }, { refresh: false })
    updateProblemDraft(pKey, { busy: false, busyLabel: "", generatedSvg: out?.svg || "" })
  }

  async function approveProblemSvg(problem, pKey) {
    const draft = reviewProblemDrafts[pKey] || {}
    if (!draft.generatedSvg) return
    try {
      updateProblemDraft(pKey, { busy: true, busyLabel: "Approving SVG..." })
      const imageUrl = await uploadSvgText(draft.generatedSvg)
      updateProblemDraft(pKey, {
        busy: false,
        busyLabel: "",
        generatedSvg: "",
        imageUrl,
        imageLoadError: false,
      })
      setReviewNotice("SVG approved and uploaded. Click Save Edit to attach it.")
    } catch (err) {
      updateProblemDraft(pKey, { busy: false, busyLabel: "" })
      setReviewError(err.message || "Failed to approve SVG")
    }
  }

  async function deleteProblemImage(problem, pKey) {
    const draft = reviewProblemDrafts[pKey] || {}
    if (!problem?.qhash && !problem?.qBlockId) return
    updateProblemDraft(pKey, { busy: true, busyLabel: "Deleting image..." })
    const out = await applyReviewAction("update_problem", {
      qhash: problem.qhash,
      qBlockId: problem.qBlockId,
      questionText: draft.questionText || problem.questionText || "",
      answerText: draft.answerText || problem.answerText || "",
      imageUrl: "",
      removeImage: true,
    }, { refresh: true, preserveSelection: true })
    updateProblemDraft(pKey, { busy: false, busyLabel: "", imageUrl: "", imageLoadError: false })
    if (out?.ok) setReviewNotice("Image removed from this question.")
  }

  async function importSvgToExcalidraw(pKey) {
    const draft = reviewProblemDrafts[pKey] || {}
    const svgText = String(draft.generatedSvg || "").trim()
    if (!svgText || !excalidrawApiRef.current) return
    try {
      updateProblemDraft(pKey, { busy: true, busyLabel: "Loading SVG..." })
      const mod = await import("@excalidraw/excalidraw")
      if (!mod?.loadFromBlob) throw new Error("Excalidraw loader unavailable")
      const blob = new Blob([svgText], { type: "image/svg+xml" })
      const scene = await mod.loadFromBlob(blob, null, null)
      const nextScene = scene?.elements ? scene : { elements: scene || [], appState: {}, files: {} }
      excalidrawApiRef.current.updateScene({
        elements: nextScene.elements || [],
        appState: { ...(nextScene.appState || {}), viewBackgroundColor: "#ffffff", theme: "light" },
        files: nextScene.files || {},
      })
      updateProblemDraft(pKey, { busy: false, busyLabel: "" })
    } catch (err) {
      updateProblemDraft(pKey, { busy: false, busyLabel: "" })
      setReviewError(err.message || "Failed to load SVG in Excalidraw")
    }
  }

  async function exportExcalidrawAsImage(problem, pKey, format = "png") {
    if (!excalidrawApiRef.current) return
    try {
      updateProblemDraft(pKey, { busy: true, busyLabel: `Exporting ${format.toUpperCase()}...` })
      const mod = await import("@excalidraw/excalidraw")
      if (!mod?.exportToBlob) throw new Error("Excalidraw exporter unavailable")
      const elements = excalidrawApiRef.current.getSceneElements()
      const appState = excalidrawApiRef.current.getAppState()
      const files = excalidrawApiRef.current.getFiles()
      if (!elements?.length) throw new Error("Excalidraw canvas is empty")
      const blob = await mod.exportToBlob({
        elements,
        appState: {
          ...appState,
          exportBackground: true,
          viewBackgroundColor: "#ffffff",
        },
        files,
        mimeType: format === "svg" ? "image/svg+xml" : "image/png",
      })
      const imageUrl = await uploadBlobImage(
        blob,
        `excalidraw-${Date.now()}.${format === "svg" ? "svg" : "png"}`,
        format === "svg" ? "image/svg+xml" : "image/png"
      )
      updateProblemDraft(pKey, {
        busy: false,
        busyLabel: "",
        imageUrl,
        imageLoadError: false,
      })
      setReviewNotice("Excalidraw export uploaded. Click Save Edit to attach it to the question.")
    } catch (err) {
      updateProblemDraft(pKey, { busy: false, busyLabel: "" })
      setReviewError(err.message || "Failed to export Excalidraw image")
    }
  }

  if (!demoMode && status === "loading") return <div style={s.center}>Loading...</div>
  if (!demoMode && status === "authenticated" && session?.user?.email !== ADMIN_EMAIL) return null

  const focusStudentNextClasses = (focusSubjects || [])
    .flatMap((subj) => {
      const nextClass = getNextFocusClass(subj)
      if (!nextClass?.startTime) return []
      return [{
        subjectId: subj.id,
        subjectName: subj.name,
        startTime: nextClass.startTime,
        endTime: nextClass.endTime,
        sessionDate: getDateKeyInTimezone(nextClass.startTime, focusData?.student?.timezone || focusStudent?.timezone || "UTC"),
      }]
    })
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
  const focusStudentNextClass = focusStudentNextClasses[0] || null

  return (
    <div style={s.page}>
      <main style={s.mainFull}>
        <div style={s.topbar}>
          <div>
            <h1 style={s.title}>Admin Dashboard</h1>
            <p style={s.heroSub}>A calmer daily desk for class prep, live teaching, pacing, review, and imports.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ color: lm ? "#7a6a50" : "#aaa", fontSize: 13 }}>
              Queue: <strong style={{ color: lm ? "#2c2410" : "#fff" }}>{queueTodayClasses.length + queueTomorrowClasses.length}</strong> near-term classes
            </div>
            <button
              onClick={() => setLightMode(v => !v)}
              style={{
                background: lm ? "#e8e0d0" : "#1a1a1a",
                border: `1px solid ${lm ? "#c8bfa8" : "#333"}`,
                color: lm ? "#5a4a30" : "#888",
                borderRadius: 4, padding: "6px 16px",
                cursor: "pointer", fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
                transition: "all 0.25s",
              }}
            >{lm ? "◑ Dark" : "◐ Light"}</button>
          </div>
        </div>

        <div style={s.primaryNavBar}>
          {ADMIN_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => jumpToSection(section.id)}
              style={{
                ...s.primaryNavBtn,
                ...(activeAdminSection === section.id ? s.primaryNavBtnActive : {}),
              }}
            >
              {section.label}
            </button>
          ))}
        </div>

        {activeAdminSection === "dashboard" && <div style={s.studentContextBar}>
          <div style={s.studentContextHeader}>
            <div style={s.studentContextTitle}>Student Context</div>
            <div style={s.studentContextMeta}>
              Admin time <strong>{adminTimezone}</strong> · Today {queueTodayClasses.length} · Tomorrow {queueTomorrowClasses.length}
            </div>
          </div>
          <div style={s.studentContextControls}>
            <div style={{ minWidth: 240 }}>
              <div style={s.sectionLabel}>Student</div>
              <select style={s.select} value={focusStudentId} onChange={(e) => setFocusStudentId(e.target.value)}>
                <option value="">Select student...</option>
                {students.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div style={s.studentSummaryCard}>
              <div style={s.studentSummaryTitle}>{focusStudent?.name || "No student selected"}</div>
              <div style={s.studentSummaryMeta}>
                {focusStudentNextClass
                  ? `${focusStudentNextClass.subjectName} · ${formatDate(focusStudentNextClass.sessionDate)} · ${formatTimeInTimezone(focusStudentNextClass.startTime, adminTimezone)}`
                  : "No upcoming class found yet."}
              </div>
            </div>
            <div style={s.studentContextActions}>
              <button
                style={s.secondaryBtnInline}
                disabled={!focusStudentId}
                onClick={() => window.open(`/dashboard?as=${focusStudentId}`, "_blank")}
              >
                Preview student
              </button>
              <button
                style={s.secondaryBtnInline}
                disabled={!focusStudentId}
                onClick={() => jumpToSection("dashboard")}
              >
                Open class queue
              </button>
            </div>
          </div>
          <div style={s.studentSubjectScroller}>
            {(focusSubjects || []).map((subj) => {
              const nextClass = getNextFocusClass(subj)
              const sessionDate = nextClass?.startTime
                ? getDateKeyInTimezone(nextClass.startTime, focusData?.student?.timezone || focusStudent?.timezone || "UTC")
                : (subj?.sessionDate || "")
              return (
                <div key={subj.id} style={s.studentSubjectCard}>
                  <div style={s.studentSubjectTitle}>{subj.name}</div>
                  <div style={s.studentSubjectMeta}>
                    {nextClass?.startTime
                      ? `${formatDate(sessionDate)} · ${formatTimeInTimezone(nextClass.startTime, adminTimezone)}`
                      : "No next class set"}
                  </div>
                  <div style={s.studentSubjectActionRow}>
                    <button style={s.contextMiniBtn} onClick={() => openFocusSubjectSection(subj, "live")}>Live</button>
                    <button style={s.contextMiniBtn} onClick={() => openFocusSubjectSection(subj, "review")}>Review</button>
                    <button style={s.contextMiniBtn} onClick={() => openFocusSubjectSection(subj, "pacing")}>Pacing</button>
                    <button style={s.contextMiniBtn} onClick={() => openFocusSubjectSection(subj, "import")}>Import</button>
                  </div>
                </div>
              )
            })}
            {!focusSubjects.length && (
              <div style={s.studentContextEmpty}>Choose a student to load subjects, next class timing, and quick workflow jumps.</div>
            )}
          </div>
        </div>}

        {activeAdminSection === "dashboard" && <>
        <div style={{ ...s.insightCard, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <div style={s.insightTitle}>Student Progress</div>
              <div style={{ color: lm ? "#7a6a50" : "#8f8f8f", fontSize: 13 }}>
                Pull the live cylinder for the selected student and subject without leaving admin.
              </div>
            </div>
            <button
              type="button"
              style={s.refreshBtn}
              disabled={!focusStudentId || !focusProgressSubjectId || focusProgressLoading}
              onClick={async () => {
                if (!focusStudentId || !focusProgressSubjectId) return
                setFocusProgressLoading(true)
                setFocusProgressError(null)
                try {
                  const res = await fetch(`/api/student/progress-graph?subjectId=${encodeURIComponent(focusProgressSubjectId)}&as=${encodeURIComponent(focusStudentId)}`, {
                    headers: { "cache-control": "no-cache" },
                    cache: "no-store",
                  })
                  const data = await readJsonOrThrow(res, "Student progress")
                  if (data?.error) throw new Error(data.error)
                  setFocusProgressQuestionTypes(Array.isArray(data?.questionTypes) ? data.questionTypes : [])
                } catch (err) {
                  setFocusProgressQuestionTypes([])
                  setFocusProgressError(err.message || "Failed to load progress graph")
                } finally {
                  setFocusProgressLoading(false)
                }
              }}
            >
              Refresh
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 340px) minmax(0, 1fr)", gap: 12, alignItems: "end", marginBottom: 12 }}>
            <div>
              <div style={s.sectionLabel}>Subject</div>
              <select style={s.select} value={focusProgressSubjectId} onChange={(e) => setFocusProgressSubjectId(e.target.value)} disabled={!focusSubjects.length}>
                <option value="">{focusSubjects.length ? "Select subject..." : "No subjects loaded"}</option>
                {focusSubjects.map((subj) => <option key={subj.id} value={subj.id}>{subj.name}</option>)}
              </select>
            </div>
            <div style={{ color: lm ? "#7a6a50" : "#8f8f8f", fontSize: 13 }}>
              {focusProgressSubject
                ? `${focusProgressUnits.length} units · ${focusProgressQuestionTypes.length} question types`
                : "Choose a subject to inspect the student's live mastery structure."}
            </div>
          </div>
          {focusProgressError && <div style={{ ...s.error, marginBottom: 10 }}>{focusProgressError}</div>}
          {!focusProgressSubject && <div style={s.hint}>Choose a student and subject above.</div>}
          {focusProgressSubject && focusProgressLoading && !focusProgressQuestionTypes.length && (
            <div style={s.hint}>Loading student cylinder...</div>
          )}
          {focusProgressSubject && !focusProgressLoading && !focusProgressQuestionTypes.length && !focusProgressError && (
            <div style={s.hint}>No progress graph data found for this student and subject yet.</div>
          )}
          {focusProgressSubject && focusProgressQuestionTypes.length > 0 && (
            <div style={{ borderRadius: 12, overflow: "hidden", border: lm ? "1px solid #ddd4c0" : "1px solid #2d3340" }}>
              <SubjectCylinder3D
                units={focusProgressUnits}
                subjectName={focusProgressSubject.name}
                subjectId={focusProgressSubject.id}
                asStudentId={focusStudentId}
                themeName={lm ? "morning" : "night"}
                mode="default"
                onProgressMutate={async () => {
                  if (!focusStudentId || !focusProgressSubjectId) return
                  try {
                    const res = await fetch(`/api/student/progress-graph?subjectId=${encodeURIComponent(focusProgressSubjectId)}&as=${encodeURIComponent(focusStudentId)}`, {
                      headers: { "cache-control": "no-cache" },
                      cache: "no-store",
                    })
                    const data = await readJsonOrThrow(res, "Student progress refresh")
                    if (data?.error) throw new Error(data.error)
                    setFocusProgressQuestionTypes(Array.isArray(data?.questionTypes) ? data.questionTypes : [])
                  } catch {}
                }}
              />
            </div>
          )}
        </div>
        <div style={s.insightsRow}>
          <div style={{ ...s.insightCard, gridColumn: "1 / -1" }}>
            <div style={s.insightTitle}>Class Queue</div>
            <div style={{ color: lm ? "#7a6a50" : "#8f8f8f", fontSize: 13 }}>
              The dashboard is now your scheduling inbox. Today and tomorrow stay on top; later sessions stay visible below so you can prep without hunting by student first.
            </div>
          </div>
          {renderDashboardQueueSection(
            "Today",
            queueTodayClasses,
            `No classes detected for today in ${adminTimezone}.`
          )}
          {renderDashboardQueueSection(
            "Tomorrow",
            queueTomorrowClasses,
            `No classes detected for tomorrow in ${adminTimezone}.`
          )}
          {renderDashboardQueueSection(
            "Later This Week",
            queueLaterWeekClasses,
            "No more classes scheduled later this week."
          )}
        </div>
        <div style={{ ...s.insightCard, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <div>
              <div style={s.insightTitle}>Active Users</div>
              <div style={{ color: lm ? "#7a6a50" : "#8f8f8f", fontSize: 13 }}>
                Users seen in the last 5 minutes. Updates every 30 seconds while this tab is open.
              </div>
            </div>
            <button
              type="button"
              style={s.refreshBtn}
              onClick={async () => {
                setActiveUsersLoading(true)
                setActiveUsersError(null)
                try {
                  const res = await fetch("/api/admin/active-users?minutes=5")
                  const data = await readJsonOrThrow(res, "Active users")
                  if (data?.error) throw new Error(data.error)
                  setActiveUsers(Array.isArray(data?.activeUsers) ? data.activeUsers : [])
                } catch (err) {
                  setActiveUsers([])
                  setActiveUsersError(err.message || "Failed to load active users")
                } finally {
                  setActiveUsersLoading(false)
                }
              }}
            >
              Refresh
            </button>
          </div>
          {activeUsersError && <div style={{ ...s.error, marginBottom: 10 }}>{activeUsersError}</div>}
          {activeUsersLoading ? (
            <div style={s.hint}>Loading active users...</div>
          ) : activeUsers.length ? (
            <div style={{ display: "grid", gap: 8 }}>
              {activeUsers.map((item) => (
                <div
                  key={item.id || item.user_key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(180px, 1.2fr) minmax(160px, 1fr) minmax(120px, 0.8fr) minmax(120px, 0.8fr)",
                    gap: 12,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: lm ? "1px solid #ddd4c0" : "1px solid #2d3340",
                    background: lm ? "#f8f3ea" : "#171b24",
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: lm ? "#2c2410" : "#f5f7fb" }}>
                      {item.student_name || item.email || item.user_key}
                    </div>
                    <div style={{ color: lm ? "#8a7a5a" : "#8f96a3", fontSize: 12 }}>
                      {item.role || "user"}{item.email ? ` · ${item.email}` : ""}
                    </div>
                  </div>
                  <div style={{ color: lm ? "#4a3a22" : "#d7dce5" }}>
                    <div>{item.route || "dashboard"}{item.section ? ` / ${item.section}` : ""}</div>
                    <div style={{ color: lm ? "#8a7a5a" : "#8f96a3", fontSize: 12 }}>
                      {item.subject_name || "No subject selected"}
                    </div>
                  </div>
                  <div style={{ color: lm ? "#4a3a22" : "#d7dce5" }}>
                    {item.mode || "live"}
                  </div>
                  <div style={{ color: lm ? "#8a7a5a" : "#8f96a3" }}>
                    {formatRelativeMinutesAgo(item.last_seen_at)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={s.hint}>No users active in the last 5 minutes.</div>
          )}
        </div>
        </>}

        {activeAdminSection === "import" && importWorkspace === "studio" && <div id="content" style={s.section}>
          <h2 style={s.sectionTitle}>Import Studio</h2>
          <p style={s.sub}>Run local worksheet extraction, let the first pass build mutable proto groups, then generate a sidecar before import. Use Regular Import when the material is already clean enough to anchor directly to a session.</p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <button type="button" onClick={() => setImportWorkspace("regular")} style={{ ...s.secondaryBtn, ...(importWorkspace === "regular" ? { background: lm ? "#ead7aa" : "#3a3120", borderColor: lm ? "#d2b36a" : "#8a7440", color: lm ? "#4a3414" : "#f2dfaf" } : {}) }}>
              Regular Import
            </button>
            <button type="button" onClick={() => setImportWorkspace("studio")} style={{ ...s.secondaryBtn, ...(importWorkspace === "studio" ? { background: lm ? "#ead7aa" : "#3a3120", borderColor: lm ? "#d2b36a" : "#8a7440", color: lm ? "#4a3414" : "#f2dfaf" } : {}) }}>
              Import Studio
            </button>
            <button type="button" onClick={() => setImportWorkspace("context")} style={{ ...s.secondaryBtn, ...(importWorkspace === "context" ? { background: lm ? "#ead7aa" : "#3a3120", borderColor: lm ? "#d2b36a" : "#8a7440", color: lm ? "#4a3414" : "#f2dfaf" } : {}) }}>
              Draft Context
            </button>
          </div>

          <div style={{ ...s.resultBox, marginBottom: 18 }}>
            <div style={s.resultItem}><strong>Regular Import:</strong> use this when the file or pasted text is ready to anchor straight to a session date.</div>
            <div style={s.resultItem}><strong>Import Studio:</strong> use this when you need OCR, block editing, or sidecar generation first.</div>
            <div style={s.resultItem}><strong>Draft Context:</strong> upload multiple parent docs after import, match draft questions back to OCR context, and attach the chosen image to the existing question.</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div>
              <div style={s.sectionLabel}>Student</div>
              <select style={s.select} value={contentStudent} onChange={(e) => setContentStudent(e.target.value)}>
                <option value="">Select student</option>
                {students.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div>
              <div style={s.sectionLabel}>Subject</div>
              <select style={s.select} value={contentSubject} onChange={(e) => setContentSubject(e.target.value)}>
                <option value="">Select subject</option>
                {getSubjectsForStudent(contentStudent).map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>
            </div>
            <div>
              <div style={s.sectionLabel}>Session date</div>
              <input style={s.select} type="date" value={contentSessionDate} onChange={(e) => setContentSessionDate(e.target.value)} />
            </div>
            <div>
              <div style={s.sectionLabel}>Source label</div>
              <input style={s.select} value={contentSourceLabel} onChange={(e) => setContentSourceLabel(e.target.value)} placeholder="AP Classroom set 3" />
            </div>
          </div>

          <div
            style={{ ...s.uploadBox, padding: 24, marginBottom: 12 }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const f = e.dataTransfer.files?.[0]
              if (f && (f.name.endsWith(".pdf") || f.name.endsWith(".docx"))) setContentFile(f)
            }}
          >
            {contentFile ? (
              <>
                <div style={s.fileName}>{contentFile.name}</div>
                <button style={{ ...s.refreshBtn, marginTop: 10 }} onClick={() => setContentFile(null)}>Remove</button>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Drop worksheet here</div>
                <div style={{ fontSize: 12, color: "#555", margin: "4px 0 8px" }}>.pdf · .docx</div>
                <label style={{ ...s.connectBtn, display: "inline-block", cursor: "pointer" }}>
                  Choose file
                  <input type="file" accept=".pdf,.docx" hidden onChange={e => setContentFile(e.target.files?.[0] || null)} />
                </label>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <button style={{ ...s.importBtn, opacity: canRunContentOcr ? 1 : 0.5 }} disabled={!canRunContentOcr} onClick={handleContentOcr}>
              {contentLoading ? "Running OCR..." : "Run OCR"}
            </button>
            <button style={{ ...s.secondaryBtn, opacity: contentDraft?.draftId && !contentSaving ? 1 : 0.5 }} disabled={!contentDraft?.draftId || contentSaving} onClick={saveContentDraft}>
              {contentSaving ? "Saving..." : "Save Draft"}
            </button>
            <button style={{ ...s.secondaryBtn, opacity: contentDraft?.draftId && !contentGenerating ? 1 : 0.5 }} disabled={!contentDraft?.draftId || contentGenerating} onClick={generateContentSidecar}>
              {contentGenerating ? "Running..." : contentGroups.length ? "Rebuild Sidecar" : "First Pass"}
            </button>
            <button style={{ ...s.secondaryBtn, opacity: contentSidecar?.blocks?.length && !contentImporting ? 1 : 0.5 }} disabled={!contentSidecar?.blocks?.length || contentImporting} onClick={importContentSidecar}>
              {contentImporting ? "Importing..." : "Import"}
            </button>
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12, color: lm ? "#5a4a30" : "#c7c7c7", fontSize: 13, lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={contentUseClaudeInference}
              onChange={(e) => setContentUseClaudeInference(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              Ask Claude to infer question types / cleanup.
              <span style={{ display: "block", fontSize: 12, color: lm ? "#8a7a5a" : "#8b8b8b" }}>
                Off by default. Use only when OCR grouping is too messy for deterministic blocks and manual reorder.
              </span>
            </span>
          </label>

          {contentError && <div style={s.error}>❌ {contentError}</div>}
          {contentNotice && <div style={{ ...s.hint, marginBottom: 10 }}>{contentNotice}</div>}

          {!!contentDraft?.manifest && (
            <div style={{ ...s.resultBox, marginBottom: 16 }}>
              <div style={s.resultTitle}>OCR Draft Ready</div>
              <div style={s.resultItem}>Draft ID: {contentDraft.draftId}</div>
              <div style={s.resultItem}>Provider: {contentDraft.manifest?.source?.ocrProvider || "unknown"}</div>
              <div style={s.resultItem}>Model: {contentDraft.manifest?.source?.ocrModel || "unknown"}</div>
              <div style={s.resultItem}>Pages: {contentDraft.manifest?.counts?.pages || 0}</div>
              <div style={s.resultItem}>Text blocks: {contentDraft.manifest?.counts?.textBlocks || 0}</div>
              <div style={s.resultItem}>Image blocks: {contentDraft.manifest?.counts?.imageBlocks || 0}</div>
            </div>
          )}

          {!!contentGroups.length && (() => {
            const ambiguous = contentGroups.filter((g) => g.ambiguous)
            return (
              <div style={{ ...s.resultBox, marginBottom: 16 }}>
                <div style={s.resultTitle}>
                  Proto Groups — {contentGroups.length} total
                  {ambiguous.length > 0 && <span style={{ marginLeft: 10, color: "#e0a040", fontWeight: 700 }}>⚠ {ambiguous.length} need review</span>}
                </div>
                {ambiguous.length > 0 && (
                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    {ambiguous.map((g) => (
                      <div key={g.id} style={{ background: lm ? "#fdf3dc" : "#2a2310", border: lm ? "1px solid #e0c070" : "1px solid #5a4a10", borderRadius: 8, padding: "6px 10px", fontSize: 12 }}>
                        <span style={{ fontWeight: 700, marginRight: 8 }}>{g.label}</span>
                        <span style={{ color: lm ? "#7a6020" : "#c0a050" }}>{g.notes || "ambiguous"}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <div style={s.sectionLabel}>Apply NotebookLM ordering</div>
                  <div style={{ fontSize: 12, color: lm ? "#666" : "#8f96a3", marginBottom: 6 }}>
                    Paste question labels in order from LM — comma or newline separated (e.g. Q3, Q1, Q7). Unmatched groups are appended at the end.
                  </div>
                  <textarea
                    style={{ ...s.select, height: 72, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
                    value={contentLmText}
                    onChange={(e) => setContentLmText(e.target.value)}
                    placeholder={"Q3, Q1, Q7\nQ2, Q5"}
                  />
                  <button
                    style={{ ...s.secondaryBtn, marginTop: 8, opacity: contentLmText.trim() && !contentReordering ? 1 : 0.5 }}
                    disabled={!contentLmText.trim() || contentReordering}
                    onClick={applyLmReorder}
                  >
                    {contentReordering ? "Reordering..." : "Apply LM Order"}
                  </button>
                </div>
              </div>
            )
          })()}

          <div style={{ ...s.resultBox, marginBottom: 16 }}>
            <div style={s.resultTitle}>JSON-hint import (skip OCR + Claude)</div>
            <div style={{ fontSize: 12, color: lm ? "#666" : "#8f96a3", marginBottom: 8 }}>
              Paste a pre-made tree (<code>{`{version:2, units:[...]}`}</code>). Images can be <code>{`{type:"image",url}`}</code> or <code>{`{type:"image",page,bbox:[x0,y0,x1,y1]}`}</code> for PDF crop.
            </div>
            <textarea
              style={{ ...s.select, height: 120, resize: "vertical", fontFamily: "monospace", fontSize: 12, width: "100%" }}
              value={contentHintJson}
              onChange={(e) => setContentHintJson(e.target.value)}
              placeholder={`{"version":2,"units":[{"id":"u1","label":"Unit 1",...}]}`}
            />
            <button
              style={{ ...s.secondaryBtn, marginTop: 8, width: "auto", padding: "8px 16px", opacity: contentFile && contentHintJson.trim() && !contentJsonImporting ? 1 : 0.5 }}
              disabled={!contentFile || !contentHintJson.trim() || contentJsonImporting}
              onClick={handleContentJsonHintImport}
            >
              {contentJsonImporting ? "Importing..." : "Import from Hint"}
            </button>
          </div>

          {!!(contentTree?.units?.length) && (
            <div style={{ ...s.resultBox, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={s.resultTitle}>Content Tree</div>
                <button
                  style={{ ...s.secondaryBtn, width: "auto", padding: "6px 14px", marginBottom: 0, opacity: contentTreeSaving ? 0.5 : 1 }}
                  disabled={contentTreeSaving}
                  onClick={saveContentTree}
                >
                  {contentTreeSaving ? "Saving..." : "Save Tree"}
                </button>
              </div>
              <div style={{ fontSize: 12, color: lm ? "#666" : "#8f96a3", marginBottom: 10 }}>
                Borders: <span style={{ color: "#d9534f" }}>unit</span> · <span style={{ color: "#8a63d2" }}>question type</span> · <span style={{ color: "#3c9a3c" }}>question</span> · <span style={{ color: "#3c78c7" }}>element</span>. Drag element rows within a question to reorder.
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                {contentTree.units.map((unit) => (
                  <div key={unit.id} style={{ border: "2px solid #d9534f", borderRadius: 8, padding: 10, background: lm ? "#fff" : "#120a0a" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: "#d9534f", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Unit</span>
                      <input
                        value={unit.label || ""}
                        onChange={(e) => updateTreeLabel("unit", { unitId: unit.id }, e.target.value)}
                        style={{ flex: 1, background: lm ? "#f7f7f7" : "#1a1a1a", border: "1px solid #333", color: lm ? "#333" : "#ddd", padding: "4px 8px", borderRadius: 4, fontSize: 13 }}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {(unit.question_types || []).map((qt) => (
                        <div key={qt.id} style={{ border: "2px solid #8a63d2", borderRadius: 8, padding: 10, background: lm ? "#faf8ff" : "#140a1a" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, color: "#8a63d2", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>QT</span>
                            <input
                              value={qt.label || ""}
                              onChange={(e) => updateTreeLabel("qt", { unitId: unit.id, qtId: qt.id }, e.target.value)}
                              style={{ flex: 1, minWidth: 140, background: lm ? "#f7f7f7" : "#1a1a1a", border: "1px solid #333", color: lm ? "#333" : "#ddd", padding: "4px 8px", borderRadius: 4, fontSize: 13 }}
                            />
                            {qt.section_ref && <span style={{ fontSize: 11, color: lm ? "#666" : "#8a8a8a" }}>§{qt.section_ref}</span>}
                            {qt.primary_slo && <span style={{ fontSize: 11, color: lm ? "#666" : "#8a8a8a" }}>SLO {qt.primary_slo}</span>}
                          </div>
                          <div style={{ display: "grid", gap: 6 }}>
                            {(qt.questions || []).map((q) => (
                              <div key={q.id} style={{ border: "2px solid #3c9a3c", borderRadius: 8, padding: 8, background: lm ? "#f4fbf4" : "#0c150c" }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 11, color: "#3c9a3c", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Q</span>
                                  <input
                                    value={q.label || ""}
                                    onChange={(e) => updateTreeLabel("question", { unitId: unit.id, qtId: qt.id, questionId: q.id }, e.target.value)}
                                    style={{ flex: 1, minWidth: 120, background: lm ? "#f7f7f7" : "#1a1a1a", border: "1px solid #333", color: lm ? "#333" : "#ddd", padding: "4px 8px", borderRadius: 4, fontSize: 13 }}
                                  />
                                  {q.kind && <span style={{ fontSize: 11, color: lm ? "#666" : "#8a8a8a" }}>{q.kind}</span>}
                                  {q.ambiguous && <span style={{ fontSize: 11, color: "#e0a040", fontWeight: 700 }}>⚠ review</span>}
                                </div>
                                <div style={{ display: "grid", gap: 4 }}>
                                  {(q.assignments || []).map((item, itemIdx) => {
                                    const block = contentBlockById[item.source_block_id]
                                    const kind = block?.kind || "?"
                                    const preview = block?.kind === "text"
                                      ? (block?.text || "").slice(0, 120)
                                      : block?.kind === "image"
                                        ? `image · p${block?.page || "?"}`
                                        : item.source_block_id
                                    return (
                                      <div
                                        key={`${q.id}-${itemIdx}-${item.source_block_id}`}
                                        draggable
                                        onDragStart={() => setContentItemDrag({ unitId: unit.id, qtId: qt.id, questionId: q.id, fromIdx: itemIdx })}
                                        onDragOver={(e) => { e.preventDefault() }}
                                        onDrop={(e) => {
                                          e.preventDefault()
                                          if (contentItemDrag && contentItemDrag.questionId === q.id) {
                                            moveItemWithinQuestion(unit.id, qt.id, q.id, contentItemDrag.fromIdx, itemIdx)
                                          }
                                          setContentItemDrag(null)
                                        }}
                                        onDragEnd={() => setContentItemDrag(null)}
                                        style={{
                                          border: "2px solid #3c78c7",
                                          borderRadius: 6,
                                          padding: "4px 8px",
                                          background: lm ? "#f0f6fc" : "#0a1220",
                                          fontSize: 12,
                                          display: "flex",
                                          gap: 8,
                                          alignItems: "center",
                                          cursor: "grab",
                                        }}
                                      >
                                        <span style={{ color: "#3c78c7", fontWeight: 700 }}>⋮⋮</span>
                                        <span style={{ fontSize: 10, color: lm ? "#666" : "#8a8a8a", textTransform: "uppercase", minWidth: 44 }}>{kind}</span>
                                        {item.role && <span style={{ fontSize: 10, color: lm ? "#666" : "#8a8a8a" }}>{item.role}</span>}
                                        {item.image_placement && <span style={{ fontSize: 10, color: "#3c78c7" }}>{item.image_placement}</span>}
                                        <span style={{ flex: 1, color: lm ? "#333" : "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview}</span>
                                      </div>
                                    )
                                  })}
                                  {!(q.assignments || []).length && (
                                    <div style={{ fontSize: 11, color: lm ? "#999" : "#666", fontStyle: "italic" }}>No elements assigned.</div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!!contentBlocks.length && (
            <div>
              <div style={s.sectionLabel}>Editable OCR pages</div>
              <div style={{ display: "grid", gap: 22 }}>
                {contentDraftPages.map((page) => {
                  const pageWidth = Number(page.imageMeta?.width || 612)
                  const pageHeight = Number(page.imageMeta?.height || 792)
                  const pageAspect = `${pageWidth} / ${pageHeight}`
                  const pageTextBlocks = page.blocks.filter((block) => block.kind === "text").length
                  const pageImageBlocks = page.blocks.filter((block) => block.kind === "image").length
                  const pageLayout = buildContentPageRows(page.blocks)
                  const pageRows = pageLayout.rows
                  const virtualPageHeightPx = 980
                  const contentScale = pageLayout.totalBaseHeightPx > virtualPageHeightPx
                    ? virtualPageHeightPx / pageLayout.totalBaseHeightPx
                    : 1

                  return (
                    <div key={`ocr-page-${page.page}`} style={{ display: "grid", gap: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ ...s.resultItem, margin: 0 }}>
                          Page {page.page} · {page.blocks.length} block(s) · {pageTextBlocks} text · {pageImageBlocks} image
                        </div>
                        <div style={{ fontSize: 12, color: lm ? "#8a7a5a" : "#8f96a3" }}>
                          White page layout uses each block&apos;s PDF bounding box.
                        </div>
                      </div>

                      <div style={{
                        background: lm ? "#ebe3d4" : "#0d0f14",
                        border: lm ? "1px solid #d6ccb9" : "1px solid #262a34",
                        borderRadius: 18,
                        padding: 18,
                        overflowX: "auto",
                      }}>
                        <div style={{
                          width: "min(100%, 860px)",
                          minWidth: 660,
                          margin: "0 auto",
                          background: "#ffffff",
                          borderRadius: 12,
                          boxShadow: lm
                            ? "0 20px 50px rgba(94, 74, 38, 0.12)"
                            : "0 20px 50px rgba(0, 0, 0, 0.45)",
                          border: "1px solid rgba(30, 30, 30, 0.08)",
                          position: "relative",
                          aspectRatio: pageAspect,
                          overflow: "hidden",
                          padding: 16,
                        }}>
                          <div style={{
                            position: "absolute",
                            left: 16,
                            top: 16,
                            width: `calc((100% - 32px) / ${contentScale})`,
                            display: "grid",
                            gridTemplateRows: pageRows.map((row) => `${row.baseHeightPx}px`).join(" "),
                            alignContent: "start",
                            gap: pageLayout.gapPx,
                            transform: `scale(${contentScale})`,
                            transformOrigin: "top left",
                          }}>
                            {pageRows.map((row, rowIndex) => (
                              <div
                                key={`ocr-page-${page.page}-row-${rowIndex}`}
                                style={{
                                  display: "block",
                                  minHeight: 0,
                                  width: "100%",
                                }}
                              >
                                {row.blocks.map((block) => {
                                const index = contentBlockIndexById[block.id]
                                const isImage = block.kind === "image"
                                const textRows = Math.max(2, Math.min(18, Math.ceil(String(block.text || "").length / 68)))
                                const roleTone = block.role === "ignore"
                                  ? "#d06666"
                                  : block.role === "question"
                                    ? "#6f4fd8"
                                    : block.role === "answer"
                                      ? "#3c8d5a"
                                      : block.role === "options"
                                        ? "#9c6b1f"
                                        : "#9aa3b2"

                                return (
                                  <div
                                    key={block.id}
                                    data-ocr-block-id={block.id}
                                    style={{
                                      width: "100%",
                                      minHeight: 0,
                                      height: "100%",
                                      background: isImage ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.92)",
                                      border: `1px solid ${
                                        contentPointerDrag?.targetId === block.id && contentPointerDrag?.sourceId !== block.id
                                          ? "#111827"
                                          : contentDragBlockId === block.id
                                            ? "#111827"
                                            : roleTone
                                      }`,
                                      borderRadius: 3,
                                      overflow: "hidden",
                                      opacity: contentDragBlockId && contentDragBlockId === block.id ? 0.72 : 1,
                                      position: "relative",
                                    }}
                                    onMouseEnter={() => setContentHoverBlockId(block.id)}
                                    onMouseLeave={() => setContentHoverBlockId((current) => current === block.id ? "" : current)}
                                  >
                                    {(contentHoverBlockId === block.id || contentDragBlockId === block.id) && (
                                      <div style={{
                                        position: "absolute",
                                        top: 4,
                                        right: 4,
                                        zIndex: 3,
                                        display: "flex",
                                        gap: 4,
                                      }}>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation()
                                            deleteContentBlockById(block.id)
                                          }}
                                          style={{
                                            width: 30,
                                            height: 30,
                                            borderRadius: 999,
                                            border: "1px solid rgba(17, 24, 39, 0.18)",
                                            background: "rgba(255,255,255,0.96)",
                                            color: "#7f1d1d",
                                            fontSize: 18,
                                            lineHeight: 1,
                                            cursor: "pointer",
                                            display: "grid",
                                            placeItems: "center",
                                            padding: 0,
                                          }}
                                          aria-label="Delete block"
                                          title="Delete block"
                                        >
                                          ×
                                        </button>
                                        <button
                                          type="button"
                                          onPointerDown={(event) => startContentPointerDrag(event, block.id)}
                                          style={{
                                            width: 30,
                                            height: 30,
                                            borderRadius: 999,
                                            border: "1px solid rgba(17, 24, 39, 0.18)",
                                            background: "rgba(255,255,255,0.96)",
                                            color: "#111827",
                                            fontSize: 16,
                                            lineHeight: 1,
                                            display: "grid",
                                            placeItems: "center",
                                            userSelect: "none",
                                            cursor: "grab",
                                            padding: 0,
                                          }}
                                          aria-label="Drag block"
                                          title="Drag block"
                                        >
                                          ✥
                                        </button>
                                      </div>
                                    )}
                                    {isImage ? (
                                      block.imageUrl ? (
                                        <img
                                          src={block.imageUrl}
                                          alt={`OCR block ${block.id}`}
                                          style={{
                                            width: "100%",
                                          height: "100%",
                                          display: "block",
                                          background: "#fff",
                                          objectFit: "contain",
                                          pointerEvents: "none",
                                        }}
                                      />
                                    ) : (
                                      <div style={{ ...s.hint, fontSize: 10, padding: 2 }}>Image unavailable</div>
                                    )
                                    ) : (
                                      <textarea
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          resize: "none",
                                          overflow: "auto",
                                          background: "rgba(255,255,255,0.94)",
                                          color: "#111827",
                                          border: "none",
                                          outline: "none",
                                          padding: "2px 3px",
                                          fontSize: 12,
                                          lineHeight: 1.45,
                                        }}
                                        rows={textRows}
                                        value={block.text || ""}
                                        onDragStart={(event) => event.preventDefault()}
                                        onChange={(e) => updateContentBlock(index, { text: e.target.value })}
                                      />
                                    )}
                                  </div>
                                )
                              })}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {!!contentSidecar?.blocks?.length && (
            <div style={{ marginTop: 18 }}>
              <div style={s.sectionLabel}>Generated sidecar preview</div>
              <textarea readOnly style={{ ...s.problemInput, minHeight: 260, width: "100%", fontFamily: "monospace", fontSize: 12 }} value={JSON.stringify(contentSidecar, null, 2)} />
            </div>
          )}
        </div>}

        {activeAdminSection === "live-class" && <div id="live-class" style={s.section}>
          <h2 style={s.sectionTitle}>Live Class</h2>
          <p style={s.sub}>Run the lesson from one place: load the day&apos;s planned question types, generate a Claude teaching flow for the active topic, track time, and catch tangents before the class drifts.</p>

          <div style={s.dropdownRow}>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Student</label>
              <select
                style={s.select}
                value={liveStudentId}
                onChange={(e) => {
                  setLiveStudentId(e.target.value)
                  setLivePlan([])
                  setLiveSelectedId("")
                  setLiveFlow(null)
                  setLiveError(null)
                }}
              >
                <option value="">Select student...</option>
                {students.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Subject</label>
              <select
                style={s.select}
                value={liveSubjectId}
                onChange={(e) => {
                  setLiveSubjectId(e.target.value)
                  setLivePlan([])
                  setLiveSelectedId("")
                  setLiveFlow(null)
                  setLiveError(null)
                }}
              >
                <option value="">Select subject...</option>
                {getSubjectsForStudent(liveStudentId).map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>
            </div>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Session date</label>
              <input
                type="date"
                value={liveSessionDate}
                onChange={(e) => setLiveSessionDate(e.target.value)}
                style={s.select}
              />
            </div>
            <div style={{ ...s.dropdownGroup, justifyContent: "end" }}>
              <label style={s.label}>Plan</label>
              <button
                style={{ ...s.importBtnInline, width: "100%", opacity: liveStudentId && liveSubjectId && liveSessionDate && !liveLoading ? 1 : 0.6 }}
                disabled={!liveStudentId || !liveSubjectId || !liveSessionDate || liveLoading}
                onClick={() => loadLiveClassPlan()}
              >
                {liveLoading ? "Loading..." : "Load day"}
              </button>
            </div>
          </div>

          {liveError && <div style={s.error}>❌ {liveError}</div>}
          {liveNotice && <div style={s.successNote}>{liveNotice}</div>}
          {liveSessionMeta && (
            <div style={{ ...s.resultBox, marginBottom: 16 }}>
              <div style={s.resultTitle}>Session anchor</div>
              <div style={s.resultItem}>Student session date: {liveSessionMeta.studentSessionDate || liveSessionDate}</div>
              <div style={s.resultItem}>Tutor session date: {liveSessionMeta.tutorSessionDate || "—"}</div>
              <div style={s.resultItem}>Time: {liveSessionMeta.startTime ? formatDateTime(liveSessionMeta.startTime) : "—"} {liveSessionMeta.endTime ? `→ ${formatDateTime(liveSessionMeta.endTime)}` : ""}</div>
              <div style={s.resultItem}>
                Draft layer: {liveDraftMeta?.counts?.current || liveCurrentPlan.length} current, {liveDraftMeta?.counts?.future || liveFuturePlan.length} future, {liveDraftMeta?.counts?.practice || livePracticePlan.length} practice candidate(s).
              </div>
              <div style={s.resultItem}>Suggestions: {livePreClassSuggestions.length} pre-class misses, {liveTaggedSuggestions.length} tagged live item(s).</div>
              <div style={s.resultItem}>Final class stack: {liveFinalStack.length} selected topic(s).</div>
            </div>
          )}

          <div style={s.liveClassLayout}>
            <aside style={s.liveRail}>
              <div style={s.sectionLabel}>{liveIsPracticeMode ? "Session draft and practice pool" : "Session draft and future candidates"}</div>
              {!liveLoading && !livePlan.length && (
                <div style={s.hint}>
                  {liveIsPracticeMode
                    ? "Load a student, subject, and session date to pull the draft topics plus the unlocked practice pool for this revision-phase session."
                    : "Load a student, subject, and session date to pull the draft topics plus nearby future topics you may want to pull forward."}
                </div>
              )}
              {livePlanFlow && (
                <div style={{
                  marginBottom: 14,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${liveIsPracticeMode ? "#4b6b56" : "#3c5068"}`,
                  background: liveIsPracticeMode ? "#101712" : "#101821",
                  display: "grid",
                  gap: 4,
                }}>
                  <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: liveIsPracticeMode ? "#9fd1af" : "#8fb4e6" }}>
                    {liveIsPracticeMode ? "Practice Mode" : "Teaching Mode"}
                  </div>
                  <div style={{ fontSize: 12, color: "#d7dde8", lineHeight: 1.5 }}>
                    {liveIsPracticeMode
                      ? "Planned coursework is exhausted for this session horizon, so the live rail now surfaces revision candidates from the practice pool."
                      : "The rail is still anchored to planned coursework, with nearby future topics available to pull forward if needed."}
                  </div>
                  {!!livePlanFlow.examDate && (
                    <div style={{ fontSize: 11, color: "#9b9b9b" }}>Exam date: {livePlanFlow.examDate}</div>
                  )}
                </div>
              )}
              {!!livePreClassSuggestions.length && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#d9a06b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    Suggested from Pre-Class
                  </div>
                  <div style={{ color: "#9b9b9b", fontSize: 12, marginBottom: 10 }}>
                    {liveCoveredPreCount}/{livePreClassSuggestions.length} kept in final stack by default.
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {livePreClassSuggestions.map((item) => renderLivePlanCard(item, `Pre-Class Miss ${item.sourceSessionDate || ""}`))}
                  </div>
                </div>
              )}
              {!!liveCurrentPlan.length && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#8e8e8e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    Today's Draft
                  </div>
                  <div style={{ color: "#9b9b9b", fontSize: 12, marginBottom: 10 }}>
                    {liveCoveredCurrentCount}/{liveCurrentPlan.length} marked covered.
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {liveCurrentPlan.map((item, idx) => renderLivePlanCard(item, `Today ${idx + 1}`))}
                  </div>
                </div>
              )}
              {!!liveFuturePlan.length && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#8fb4e6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    Future Candidates
                  </div>
                  <div style={{ color: "#9b9b9b", fontSize: 12, marginBottom: 10 }}>
                    {liveCoveredFutureCount}/{liveFuturePlan.length} pulled into today.
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {liveFuturePlan.map((item) => renderLivePlanCard(item, `Future ${item.sourceSessionDate || ""}`))}
                  </div>
                </div>
              )}
              {!!livePracticePlan.length && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: "#9fd1af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    Practice Pool
                  </div>
                  <div style={{ color: "#9b9b9b", fontSize: 12, marginBottom: 10 }}>
                    {liveCoveredPracticeCount}/{livePracticePlan.length} selected for this revision session.
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {livePracticePlan.map((item) => renderLivePlanCard(item, `Practice ${item.sourceSessionDate || item.dateIntroduced || liveSessionDate}`))}
                  </div>
                </div>
              )}
              {!!liveTaggedSuggestions.length && (
                <div>
                  <div style={{ fontSize: 11, color: "#9fd1af", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                    Tagged Live
                  </div>
                  <div style={{ color: "#9b9b9b", fontSize: 12, marginBottom: 10 }}>
                    {liveCoveredTaggedCount}/{liveTaggedSuggestions.length} tagged live item(s) selected.
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {liveTaggedSuggestions.map((item) => renderLivePlanCard(item, `Tagged ${item.sourceSessionDate || liveSessionDate}`))}
                  </div>
                </div>
              )}
            </aside>

            <section style={s.liveTeleprompter}>
              {!liveSelectedItem && (
                <div style={s.liveEmpty}>
                  Choose a question type from the left rail, then generate the teaching flow.
                </div>
              )}

              {liveSelectedItem && (
                <>
                  <div style={s.livePromptHeader}>
                    <div>
                      <div style={s.sectionLabel}>Active topic</div>
                      <div style={{ color: "#fff", fontSize: 24, fontWeight: 700, lineHeight: 1.2 }}>{liveSelectedItem.title}</div>
                      <div style={{ color: "#8e8e8e", fontSize: 13, marginTop: 6 }}>
                        {liveSelectedItem.unit || "No unit"}{liveSelectedItem.standardCode ? ` · ${liveSelectedItem.standardCode}` : ""}{liveSelectedItem.planKind === "future" && liveSelectedItem.sourceSessionDate ? ` · scheduled ${liveSelectedItem.sourceSessionDate}` : ""}{liveSelectedItem.planKind === "practice" ? " · practice candidate" : ""}
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                        <div style={s.liveMetricChip}>
                          <div style={s.liveMetricLabel}>Weakness</div>
                          <div style={s.liveMetricValue}>{Number(liveSelectedItem.weaknessScore || 0).toFixed(2)}</div>
                        </div>
                        <div style={s.liveMetricChip}>
                          <div style={s.liveMetricLabel}>Mastery</div>
                          <div style={s.liveMetricValue}>{Math.round(Number(liveSelectedItem.masteryScore || 0) * 100)}%</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#d7dde8", fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={!!liveCoveredSelection[getLiveStackKey(liveSelectedItem)]}
                            onChange={(e) => {
                              const checked = e.target.checked
                              setLiveCoveredSelection((prev) => ({ ...prev, [getLiveStackKey(liveSelectedItem)]: checked }))
                            }}
                          />
                          {liveSelectedItem.planKind === "future"
                            ? "Teach this future topic today"
                            : liveSelectedItem.planKind === "practice"
                              ? "Add this practice topic to today's live stack"
                              : "Mark this draft topic as covered"}
                        </label>
                        <button
                          style={s.liveMiniBtn}
                          onClick={() => {
                            if (!liveSelectedItem) return
                            const tagged = {
                              id: `tagged-${getLiveStackKey(liveSelectedItem)}`,
                              questionPageId: liveSelectedItem.questionPageId,
                              title: liveSelectedItem.title,
                              unit: liveSelectedItem.unit || "",
                              standardCode: liveSelectedItem.standardCode || "",
                              sourceSessionDate: liveSessionDate,
                              planKind: "tagged_live",
                              source: "live-class",
                              notes: "Tagged during live class",
                            }
                            setLiveTaggedSuggestions((prev) => {
                              const filtered = prev.filter((item) => getLiveStackKey(item) !== getLiveStackKey(tagged))
                              return [tagged, ...filtered]
                            })
                            setLiveCoveredSelection((prev) => ({ ...prev, [getLiveStackKey(tagged)]: true }))
                          }}
                        >
                          Tag live
                        </button>
                      </div>
                    </div>
                    <div style={s.liveTimerBox}>
                      <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>Timer</div>
                      <div style={{ fontSize: 32, fontWeight: 800, color: liveTimerExpired ? "#ff9d9d" : "#f2dfaf", fontFamily: "'DM Mono', monospace" }}>
                        {formatTimer(liveTimerSeconds)}
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
                        <button style={s.liveMiniBtn} onClick={() => generateLiveFlow(liveSelectedItem)} disabled={liveFlowLoading}>
                          {liveFlowLoading ? "Thinking..." : liveFlow ? "Refresh flow" : "Generate flow"}
                        </button>
                        <button style={s.liveMiniBtn} onClick={() => setLiveTimerRunning((v) => !v)} disabled={!liveFlow || liveTimerExpired || liveTimerSeconds <= 0}>
                          {liveTimerRunning ? "Pause" : "Start"}
                        </button>
                        <button
                          style={s.liveMiniBtn}
                          onClick={() => {
                            setLiveTimerRunning(false)
                            setLiveTimerExpired(false)
                            setLiveTimerSeconds(Math.max(60, Number(liveFlow?.timerSeconds || 420)))
                          }}
                          disabled={!liveFlow}
                        >
                          Reset
                        </button>
                        <button style={{ ...s.importBtnInline, padding: "8px 12px" }} onClick={completeLiveTopic} disabled={!liveSelectedItem}>
                          Done
                        </button>
                      </div>
                    </div>
                  </div>

                  {liveFlowError && <div style={s.error}>❌ {liveFlowError}</div>}

                  {!liveFlow && !liveFlowLoading && (
                    <div style={s.liveEmpty}>
                      Generate a live teaching flow to turn this topic into a step-by-step classroom guide.
                    </div>
                  )}

                  {liveFlow && !liveTimerExpired && (
                    <div style={s.liveFlowBody}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#f2dfaf", marginBottom: 14 }}>
                        {liveFlow.promptTitle || "Teaching flow"}
                      </div>
                      <div style={{ display: "grid", gap: 12 }}>
                        {(liveFlow.steps || []).map((step, idx) => (
                          <div key={`${idx}-${step}`} style={s.liveStep}>
                            <div style={s.liveStepNum}>{idx + 1}</div>
                            <div style={s.liveStepText}>{step}</div>
                          </div>
                        ))}
                      </div>
                      {!!liveFlow.sampleQuestion && (
                        <div style={s.liveSampleBox}>
                          <div style={s.sectionLabel}>Representative question</div>
                          <div style={{ color: "#d7dde8", fontSize: 14, lineHeight: 1.6 }}>{liveFlow.sampleQuestion}</div>
                        </div>
                      )}
                      {!!liveFlow.coachNotes?.length && (
                        <div style={s.liveNotesBox}>
                          <div style={s.sectionLabel}>Coach notes</div>
                          {liveFlow.coachNotes.map((note, idx) => (
                            <div key={`${idx}-${note}`} style={{ color: "#9fb7db", fontSize: 13, lineHeight: 1.5, marginBottom: 6 }}>• {note}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {(liveSessionMeta?.preClassWsChanges || liveSessionMeta?.preClassMasteryChanges || liveSessionMeta?.exitTicketWsChanges || liveSessionMeta?.exitTicketMasteryChanges || liveSessionMeta?.homeworkWsChanges || liveSessionMeta?.homeworkMasteryChanges) && (
                    <div style={s.liveSignalGrid}>
                      {[
                        ["Pre-Class", liveSessionMeta?.preClassWsChanges, liveSessionMeta?.preClassMasteryChanges],
                        ["Exit Ticket", liveSessionMeta?.exitTicketWsChanges, liveSessionMeta?.exitTicketMasteryChanges],
                        ["Homework", liveSessionMeta?.homeworkWsChanges, liveSessionMeta?.homeworkMasteryChanges],
                      ].filter((entry) => entry[1] || entry[2]).map(([label, ws, mastery]) => (
                        <div key={label} style={s.liveSignalCard}>
                          <div style={s.sectionLabel}>{label} signals</div>
                          {ws ? <div style={s.liveSignalText}><strong>Weakness:</strong> {ws}</div> : null}
                          {mastery ? <div style={s.liveSignalText}><strong>Mastery:</strong> {mastery}</div> : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {liveTimerExpired && (
                    <div style={s.liveAlarmScreen}>
                      <div style={s.liveAlarmText}>Tangent / Tangent / Tangent!</div>
                      <div style={{ color: "#ffd1d1", fontSize: 15, maxWidth: 520, lineHeight: 1.6, textAlign: "center" }}>
                        The timer ran out before the topic was marked done. Capture what the class veered into, or reset and push everyone back onto the planned question type.
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginTop: 18 }}>
                        <button style={s.liveMiniBtn} onClick={() => setLiveTimerExpired(false)}>Veer back on topic</button>
                        <button style={{ ...s.importBtnInline, padding: "10px 14px" }} onClick={() => {
                          addLiveTangentItem()
                          setLiveTimerExpired(false)
                        }}>
                          Add external element
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={s.liveNotesWorkspace}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <div>
                        <div style={s.sectionLabel}>Session notes workspace</div>
                        <div style={{ color: "#9b9b9b", fontSize: 12, lineHeight: 1.5 }}>
                          Use this as the live teaching scratch layer: type notes, sketch diagrams, and save them back to this session so the next class can inherit the context.
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {liveNotesSavedAt ? <div style={{ color: "#8e8e8e", fontSize: 11 }}>Saved {formatDateTime(liveNotesSavedAt)}</div> : null}
                        <button style={s.liveMiniBtn} onClick={saveLiveSessionNotes} disabled={liveNotesSaving}>
                          {liveNotesSaving ? "Saving..." : "Save notes"}
                        </button>
                      </div>
                    </div>
                    {liveNotesError ? <div style={{ ...s.error, marginTop: 10 }}>❌ {liveNotesError}</div> : null}
                    <textarea
                      style={{ ...s.problemInput, minHeight: 120, marginTop: 12 }}
                      value={liveNotesText}
                      onChange={(e) => setLiveNotesText(e.target.value)}
                      placeholder="Type lesson notes, reminders, misconceptions, or follow-up plans here..."
                    />
                    <div style={{ ...s.excalWrap, marginTop: 12, minHeight: 360 }}>
                      <Excalidraw
                        key={`live-notes-${liveStudentId}-${liveSubjectId}-${liveSessionDate}-${liveNotesSavedAt || "draft"}`}
                        excalidrawAPI={(api) => { liveNotesApiRef.current = api }}
                        initialData={{
                          elements: liveNotesScene?.elements || [],
                          appState: {
                            theme: "light",
                            viewBackgroundColor: "#ffffff",
                            ...(liveNotesScene?.appState || {}),
                          },
                          files: liveNotesScene?.files || {},
                        }}
                        onChange={(elements, appState, files) => {
                          liveNotesSceneRef.current = {
                            elements,
                            appState: {
                              viewBackgroundColor: appState?.viewBackgroundColor || "#ffffff",
                              currentItemStrokeColor: appState?.currentItemStrokeColor || "#2c436f",
                              currentItemStrokeWidth: appState?.currentItemStrokeWidth || 2,
                              currentItemFontFamily: appState?.currentItemFontFamily,
                              currentItemRoughness: appState?.currentItemRoughness,
                              currentItemOpacity: appState?.currentItemOpacity,
                              currentItemStrokeStyle: appState?.currentItemStrokeStyle,
                              currentItemFillStyle: appState?.currentItemFillStyle,
                            },
                            files,
                          }
                        }}
                        UIOptions={{
                          canvasActions: { saveToActiveFile: false, loadScene: false, export: false },
                        }}
                      />
                    </div>
                  </div>
                </>
              )}
            </section>

            <aside style={s.liveRail}>
              {!!livePreviousNotes && (
                <>
                  <div style={s.sectionLabel}>Previous session note</div>
                  <div style={s.livePreviousNotesCard}>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                      {livePreviousNotes.studentSessionDate || "Previous session"}
                    </div>
                    {livePreviousNotes.notesText ? (
                      <textarea
                        readOnly
                        style={{ ...s.problemInput, minHeight: 120, marginBottom: 10 }}
                        value={livePreviousNotes.notesText}
                      />
                    ) : (
                      <div style={s.hint}>No typed notes saved for the previous session.</div>
                    )}
                    {hasSceneData(livePreviousNotes.scene) && (
                      <div style={{ ...s.excalWrap, minHeight: 220, marginBottom: 10 }}>
                        <Excalidraw
                          key={`live-prev-notes-${livePreviousNotes.studentSessionDate}`}
                          initialData={{
                            elements: livePreviousNotes.scene?.elements || [],
                            appState: {
                              theme: "light",
                              viewBackgroundColor: "#ffffff",
                              ...(livePreviousNotes.scene?.appState || {}),
                            },
                            files: livePreviousNotes.scene?.files || {},
                          }}
                          viewModeEnabled
                          UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false, export: false } }}
                        />
                      </div>
                    )}
                    {(livePreviousNotes.preClassWsChanges || livePreviousNotes.preClassMasteryChanges || livePreviousNotes.exitTicketWsChanges || livePreviousNotes.exitTicketMasteryChanges || livePreviousNotes.homeworkWsChanges || livePreviousNotes.homeworkMasteryChanges) && (
                      <div style={{ display: "grid", gap: 6 }}>
                        {livePreviousNotes.preClassWsChanges ? <div style={s.liveSignalText}><strong>Pre WS:</strong> {livePreviousNotes.preClassWsChanges}</div> : null}
                        {livePreviousNotes.preClassMasteryChanges ? <div style={s.liveSignalText}><strong>Pre M:</strong> {livePreviousNotes.preClassMasteryChanges}</div> : null}
                        {livePreviousNotes.exitTicketWsChanges ? <div style={s.liveSignalText}><strong>Exit WS:</strong> {livePreviousNotes.exitTicketWsChanges}</div> : null}
                        {livePreviousNotes.exitTicketMasteryChanges ? <div style={s.liveSignalText}><strong>Exit M:</strong> {livePreviousNotes.exitTicketMasteryChanges}</div> : null}
                        {livePreviousNotes.homeworkWsChanges ? <div style={s.liveSignalText}><strong>HW WS:</strong> {livePreviousNotes.homeworkWsChanges}</div> : null}
                        {livePreviousNotes.homeworkMasteryChanges ? <div style={s.liveSignalText}><strong>HW M:</strong> {livePreviousNotes.homeworkMasteryChanges}</div> : null}
                      </div>
                    )}
                  </div>
                  <div style={{ ...s.inlineDivider, marginTop: 16 }} />
                </>
              )}
              <div style={s.sectionLabel}>Final class stack</div>
              {!liveFinalStack.length && (
                <div style={s.hint}>
                  {liveIsPracticeMode
                    ? "Select from pre-class misses, any remaining draft, the practice pool, or tagged live items. Only this stack changes the session outcome and exit ticket."
                    : "Select from pre-class misses, today's draft, future candidates, or tagged live items. Only this stack changes the schedule, exit ticket, and homework."}
                </div>
              )}
              <div style={{ display: "grid", gap: 8 }}>
                {liveFinalStack.map((item, idx) => (
                  <div key={`final-${getLiveStackKey(item)}`} style={s.liveExternalCard}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{idx + 1}. {item.title}</div>
                      <button
                        type="button"
                        onClick={() => setLiveCoveredSelection((prev) => ({ ...prev, [getLiveStackKey(item)]: false }))}
                        style={{ ...s.liveMiniBtn, padding: "4px 8px", fontSize: 11 }}
                      >
                        Remove
                      </button>
                    </div>
                    <div style={{ color: "#9b9b9b", fontSize: 12, marginTop: 4 }}>
                      {item.unit || "No unit"}{item.standardCode ? ` · ${item.standardCode}` : ""}{item.planKind ? ` · ${item.planKind.replace(/_/g, " ")}` : ""}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ ...s.inlineDivider, marginTop: 16 }} />
              <div style={s.sectionLabel}>Tangent / external capture</div>
              <input
                style={{ ...s.problemInput, marginBottom: 8 }}
                value={liveTangentTitle}
                onChange={(e) => setLiveTangentTitle(e.target.value)}
                placeholder="What came up instead?"
              />
              <input
                style={{ ...s.problemInput, marginBottom: 8 }}
                value={liveTangentSource}
                onChange={(e) => setLiveTangentSource(e.target.value)}
                placeholder="URL / AP Classroom / worksheet reference"
              />
              <textarea
                style={{ ...s.problemInput, minHeight: 110 }}
                value={liveTangentNotes}
                onChange={(e) => setLiveTangentNotes(e.target.value)}
                placeholder="Quick notes on what you actually taught or what external question you used"
              />
              <button style={{ ...s.secondaryBtnInline, width: "100%", marginTop: 8 }} onClick={addLiveTangentItem}>
                Add tangent note
              </button>

              <div style={{ ...s.inlineDivider, marginTop: 16 }} />
              <div style={s.sectionLabel}>Captured elements</div>
              {!liveTangentItems.length && <div style={s.hint}>No external/tangent items captured in this session yet.</div>}
              <div style={{ display: "grid", gap: 8 }}>
                {liveTangentItems.map((item) => (
                  <div key={item.id} style={s.liveExternalCard}>
                    <div style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>{item.title}</div>
                    {item.source && <div style={{ color: "#c9a84c", fontSize: 12, marginTop: 4 }}>{item.source}</div>}
                    {item.notes && <div style={{ color: "#9b9b9b", fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{item.notes}</div>}
                  </div>
                ))}
              </div>

              <div style={{ ...s.inlineDivider, marginTop: 16 }} />
              <div style={s.sectionLabel}>Commit today's actual class</div>
              <div style={{ color: "#9b9b9b", fontSize: 12, lineHeight: 1.5 }}>
                {liveIsPracticeMode
                  ? "End the revision session from the actual live stack. Selected practice topics become the exit-ticket set while pre-class misses and untouched practice items remain available for later sessions."
                  : "End class from the working draft, not from the original schedule. Topics marked here become the exit-ticket set; untaught current-session draft topics get pushed forward."}
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                <button
                  style={{ ...s.secondaryBtnInline, width: "100%", opacity: liveCoveredCount ? 1 : 0.6 }}
                  disabled={!liveFinalStack.length || liveLoading}
                  onClick={() => handleLiveClassCommit(false)}
                >
                  {liveLoading ? "Saving..." : "End class"}
                </button>
                <button
                  style={{ ...s.importBtnInline, width: "100%", opacity: liveCoveredCount ? 1 : 0.6 }}
                  disabled={!liveFinalStack.length || liveLoading}
                  onClick={() => handleLiveClassCommit(true)}
                >
                  {liveLoading ? "Saving..." : "End + Preview Exit"}
                </button>
              </div>

              <div style={{ ...s.inlineDivider, marginTop: 16 }} />
              <div style={s.sectionLabel}>Import shortcuts</div>
              <div style={{ display: "grid", gap: 8 }}>
                <button style={s.liveMiniBtn} onClick={() => {
                  setImportStudent(liveStudentId || importStudent)
                  setImportSubject(liveSubjectId || importSubject)
                  setActiveAdminSection("import")
                }}>
                  Go to assessment import
                </button>
                <button style={s.liveMiniBtn} onClick={() => {
                  setHwStudent(liveStudentId || hwStudent)
                  setHwSubject(liveSubjectId || hwSubject)
                  setHwSessionDate(liveSessionDate || hwSessionDate)
                  setActiveAdminSection("import")
                }}>
                  Go to homework import
                </button>
              </div>
            </aside>
          </div>
        </div>}

        {activeAdminSection === "showcase" && <div id="showcase" style={s.section}>
          <h2 style={s.sectionTitle}>Showcase Access</h2>
          <p style={s.sub}>Generate private read-only access for the dedicated demo student. This is separate from preview and should not follow the selected real student context.</p>

          <div style={{
            background: lm ? "linear-gradient(180deg, #f5ede0 0%, #ede0cc 100%)" : "linear-gradient(180deg, #1a1308 0%, #120e04 100%)",
            border: `1px solid ${lm ? "#c9a870" : "#3a2c12"}`,
            borderRadius: 14,
            padding: 16,
            boxShadow: lm ? "inset 0 1px 0 rgba(255,220,150,0.15)" : "inset 0 1px 0 rgba(255,200,100,0.04)",
          }}>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: lm ? "#7a6040" : "#c9a87a" }}>
              Generate a one-time 6-digit code for a private read-only showcase login. This flow is for the demo student and external feedback sharing, not for previewing a selected live student.
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              <div style={{
                background: lm ? "rgba(201,140,50,0.08)" : "rgba(201,168,76,0.06)",
                border: `1px solid ${lm ? "rgba(201,140,50,0.25)" : "rgba(201,168,76,0.18)"}`,
                borderRadius: 10,
                padding: "10px 12px",
                display: "grid",
                gap: 6,
                color: lm ? "#7a5a30" : "#c9a870",
                fontSize: 12,
              }}>
                <div><strong style={{ color: lm ? "#3a2010" : "#f2dfaf" }}>Showcase target:</strong> dedicated demo student</div>
                <div><strong style={{ color: lm ? "#3a2010" : "#f2dfaf" }}>Access:</strong> one-time code, read-only</div>
                <div><strong style={{ color: lm ? "#3a2010" : "#f2dfaf" }}>Best for:</strong> tutor/client feedback without admin access</div>
              </div>
              <button
                style={{
                  ...s.modeBtn,
                  width: "100%",
                  background: lm ? "#c9a84c" : "#2a1e0a",
                  borderColor: lm ? "transparent" : "#6a4a10",
                  color: lm ? "#000" : "#f2dfaf",
                  fontWeight: 700,
                }}
                onClick={handleGenerateShowcaseCode}
                disabled={showcaseBusy}
              >
                {showcaseBusy ? "Generating Showcase Code..." : "Generate One-Time Showcase Code"}
              </button>
              {showcaseError && <div style={s.error}>{showcaseError}</div>}
              {showcaseResult && (
                <div style={{
                  background: lm ? "#f5ede0" : "#150f04",
                  border: `1px solid ${lm ? "#c9a870" : "#3a2c12"}`,
                  borderRadius: 12,
                  padding: 12,
                  display: "grid",
                  gap: 10,
                }}>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center" }}>
                    <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: lm ? "#8a7050" : "#b8a070" }}>Code</div>
                    <div style={{ color: lm ? "#3a2010" : "#f2dfaf", fontSize: 24, fontWeight: 800, letterSpacing: "0.12em" }}>{showcaseResult.code}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
                    <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: lm ? "#8a7050" : "#b8a070" }}>Login Link</div>
                    <div style={{ wordBreak: "break-all", color: lm ? "#5a4020" : "#c9a870", fontSize: 12 }}>{showcaseResult.loginUrl}</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10 }}>
                    <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: lm ? "#8a7050" : "#b8a070" }}>Expires</div>
                    <div style={{ color: lm ? "#5a4020" : "#c9a870", fontSize: 12 }}>{new Date(showcaseResult.expiresAt).toLocaleString()}</div>
                  </div>
                  <div style={{ fontSize: 12, color: lm ? "#8a7050" : "#b8a070" }}>
                    One-time use. Share only with the person reviewing the showcase.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      style={{ ...s.modeBtn, width: "auto", padding: "8px 12px", background: lm ? "#f0e5d0" : "#1a1308", borderColor: lm ? "#c9a870" : "#4a3a18", color: lm ? "#3a2010" : "#f2dfaf" }}
                      onClick={() => handleCopyShowcaseValue(showcaseResult.code, "Code")}
                    >
                      Copy Code
                    </button>
                    <button
                      style={{ ...s.modeBtn, width: "auto", padding: "8px 12px", background: lm ? "#f0e5d0" : "#1a1308", borderColor: lm ? "#c9a870" : "#4a3a18", color: lm ? "#3a2010" : "#f2dfaf" }}
                      onClick={() => handleCopyShowcaseValue(showcaseResult.loginUrl, "Login Link")}
                    >
                      Copy Link
                    </button>
                    <a
                      href={showcaseResult.loginUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{ ...s.modeBtn, width: "auto", padding: "8px 12px", textDecoration: "none", display: "inline-flex", alignItems: "center", background: lm ? "#f0e5d0" : "#1a1308", borderColor: lm ? "#c9a870" : "#4a3a18", color: lm ? "#3a2010" : "#f2dfaf" }}
                    >
                      Open Login Page
                    </a>
                  </div>
                  {showcaseResult.copiedLabel && (
                    <div style={{ fontSize: 12, color: lm ? "#8a7050" : "#b8a070" }}>{showcaseResult.copiedLabel} copied.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>}

        {activeAdminSection === "flags" && <div id="flags" style={s.section}>
          <h2 style={s.sectionTitle}>Question Flags</h2>

          {/* ── Flagged questions list ── */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <p style={{ ...s.sub, margin: 0 }}>Questions reported by students as broken or malformed.</p>
              <button className="btn-gold" style={{ fontSize: 12, padding: "4px 14px" }} onClick={loadFlags}>
                {flagsLoading ? "Loading..." : (flags.length ? "Refresh" : "Load Flags")}
              </button>
            </div>
            {flagsError && (
              <div style={{ background: "#7a2424", color: "#ffd9d9", padding: "8px 12px", borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
                Error: {flagsError}
              </div>
            )}
            {flags.length > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: lm ? "#2c2410" : "#f5f7fb" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #c8a84b", textAlign: "left" }}>
                    <th style={{ padding: "6px 10px", color: lm ? "#2c2410" : "#f5f7fb" }}>Student</th>
                    <th style={{ padding: "6px 10px", color: lm ? "#2c2410" : "#f5f7fb" }}>Question Key</th>
                    <th style={{ padding: "6px 10px", color: lm ? "#2c2410" : "#f5f7fb" }}>Reason</th>
                    <th style={{ padding: "6px 10px", color: lm ? "#2c2410" : "#f5f7fb" }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {flags.map(f => (
                    <tr key={f.id} style={{ borderBottom: `1px solid ${lm ? "#e0d5b0" : "#2d3340"}` }}>
                      <td style={{ padding: "6px 10px", color: lm ? "#2c2410" : "#f5f7fb" }}>{f.student_name || f.student_id}</td>
                      <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 11, color: lm ? "#2c2410" : "#f5f7fb" }}>{f.question_key}</td>
                      <td style={{ padding: "6px 10px", color: lm ? "#2c2410" : "#f5f7fb" }}>{f.reason}</td>
                      <td style={{ padding: "6px 10px", opacity: 0.6, color: lm ? "#2c2410" : "#f5f7fb" }}>{new Date(f.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {flags.length === 0 && !flagsLoading && !flagsError && (
              <p style={{ opacity: 0.5, fontSize: 13 }}>
                {flagsLoadedOnce ? "No flagged questions." : "Loading flags…"}
              </p>
            )}
          </div>

          {/* ── Grading queue shortcut (FR / under review) ── */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ ...s.sub, margin: 0 }}>Pending free-response submissions appear in the <strong>Grading Queue</strong> tab.</p>
          </div>

          {/* ── Student scratch work viewer ── */}
          <h3 style={{ ...s.sectionLabel, marginBottom: 12 }}>Student Work Viewer</h3>
          <p style={{ ...s.sub, marginBottom: 16 }}>Select a student, subject, question type, and question to view their saved scratchpad.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 600, marginBottom: 16 }}>
            <div>
              <label style={s.label}>Student</label>
              <select style={s.select} value={scratchStudentId} onChange={e => { setScratchStudentId(e.target.value); setScratchQtId(""); setScratchQuestions([]); setScratchQuestionKey(""); setScratchUrl(null) }}>
                <option value="">— select —</option>
                {students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Subject</label>
              <select style={s.select} value={scratchSubjectId} onChange={async e => {
                const subId = e.target.value
                setScratchSubjectId(subId)
                setScratchQts([])
                setScratchQtId("")
                setScratchQuestions([])
                setScratchQuestionKey("")
                setScratchUrl(null)
                if (!subId) return
                try {
                  const data = await fetch(`/api/admin/question-flags?qtsForSubject=${subId}`).then(r => r.json())
                  setScratchQts(data.qts || [])
                } catch {}
              }}>
                <option value="">— select —</option>
                {subjects.filter(sub => !scratchStudentId || students.find(st => st.id === scratchStudentId)?.subjectIds?.includes(sub.id)).map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Question Type</label>
              <select style={s.select} value={scratchQtId} onChange={async e => {
                const qtId = e.target.value
                setScratchQtId(qtId)
                setScratchQuestions([])
                setScratchQuestionKey("")
                setScratchUrl(null)
                if (!qtId) return
                try {
                  const data = await fetch(`/api/admin/question-flags?questionsForQt=${qtId}`).then(r => r.json())
                  setScratchQuestions(data.questions || [])
                } catch {}
              }}>
                <option value="">— select —</option>
                {scratchQts.map(qt => <option key={qt.id} value={qt.id}>{qt.title}</option>)}
              </select>
            </div>
            <div>
              <label style={s.label}>Question</label>
              <select style={s.select} value={scratchQuestionKey} onChange={e => { setScratchQuestionKey(e.target.value); setScratchUrl(null) }}>
                <option value="">— select —</option>
                {scratchQuestions.map(q => <option key={q.qhash} value={q.qhash}>{q.question_text?.slice(0, 60)}</option>)}
              </select>
            </div>
          </div>
          <button className="btn-gold" disabled={!scratchStudentId || !scratchQuestionKey || scratchLoading} style={{ marginBottom: 16 }} onClick={async () => {
            setScratchLoading(true)
            setScratchUrl(null)
            setScratchError("")
            try {
              const data = await fetch(`/api/admin/student-scratch?studentId=${scratchStudentId}&questionKey=${scratchQuestionKey}`).then(r => r.json())
              if (data.url) setScratchUrl(data.url)
              else setScratchError(data.error || "No scratch found")
            } catch { setScratchError("Failed to load") }
            setScratchLoading(false)
          }}>{scratchLoading ? "Loading..." : "View Work"}</button>
          {scratchError && <p style={{ color: "red", fontSize: 13 }}>{scratchError}</p>}
          {scratchUrl && (
            <div style={{ marginTop: 8 }}>
              <img src={scratchUrl} alt="Student scratch work" style={{ maxWidth: "100%", border: "1px solid #ddd", borderRadius: 8 }} />
            </div>
          )}
        </div>}

        {activeAdminSection === "grading" && <div id="grading" style={s.section}>
          <h2 style={s.sectionTitle}>Grading Queue</h2>
          <p style={s.sub}>Free-response submissions awaiting your verdict. Use Correct / Partial / Incorrect — Partial = 50% credit.</p>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <button className="btn-gold" style={{ fontSize: 12, padding: "4px 14px" }} onClick={async () => {
              setGradingLoading(true)
              try {
                const data = await fetch("/api/admin/grading-queue").then(r => r.json())
                setGradingItems(data.items || [])
              } catch {}
              setGradingLoading(false)
            }}>{gradingLoading ? "Loading..." : "Refresh queue"}</button>
            <span style={{ fontSize: 13, opacity: 0.7 }}>
              {gradingItems.length ? `${gradingItems.length} pending` : "No items loaded yet."}
            </span>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {gradingItems.map((item) => {
              const busy = gradingBusyId === item.id
              const scratch = gradingScratch[item.id]
              return (
                <div key={item.id} style={{ border: "1px solid #e0d5b0", borderRadius: 10, padding: 14, background: lm ? "#fff" : "#16120a" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{item.studentName || item.studentEmail}</div>
                      <div style={{ fontSize: 12, opacity: 0.65 }}>{item.subjectName} · {item.questionTypeTitle}{item.isStemChild ? " · stem child" : ""}</div>
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.55 }}>{new Date(item.createdAt).toLocaleString()}</div>
                  </div>

                  {item.stemHeader?.length > 0 && (
                    <div style={{ fontSize: 12, background: "rgba(201,168,76,0.08)", borderLeft: "3px solid #c9a84c", padding: "6px 10px", marginBottom: 8, borderRadius: 4 }}>
                      <strong>Stem:</strong> {(item.stemHeader.filter(it => it?.type === "text").map(it => it.value).join(" ") || "").slice(0, 200)}…
                    </div>
                  )}

                  <div style={{ fontSize: 13, marginBottom: 10, color: lm ? "#333" : "#ddd" }}>
                    {item.questionText?.slice(0, 300) || "(no question text)"}
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    {item.workType === "upload" && item.uploadUrl && (
                      item.uploadUrl.toLowerCase().endsWith(".pdf") ? (
                        <a href={item.uploadUrl} target="_blank" rel="noreferrer" style={{ color: "#c9a84c", fontWeight: 600 }}>Open PDF submission ↗</a>
                      ) : (
                        <img src={item.uploadUrl} alt="Student work" style={{ maxWidth: "100%", maxHeight: 360, borderRadius: 6, border: "1px solid #ddd" }} />
                      )
                    )}
                    {item.workType === "excalidraw" && (
                      <button
                        onClick={async () => {
                          if (gradingScratch[item.id]) return
                          try {
                            const data = await fetch(`/api/admin/grading-queue?attemptId=${item.id}`).then(r => r.json())
                            setGradingScratch(prev => ({ ...prev, [item.id]: data.item || null }))
                          } catch {}
                        }}
                        style={{ fontSize: 12, padding: "4px 10px", border: "1px solid #c9a84c", background: "transparent", color: "#c9a84c", borderRadius: 4, cursor: "pointer" }}
                      >
                        {scratch ? "Excalidraw scene loaded" : "Load Excalidraw preview"}
                      </button>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    {["correct", "partial", "incorrect"].map((verdict) => (
                      <button
                        key={verdict}
                        disabled={busy}
                        onClick={async () => {
                          setGradingBusyId(item.id)
                          try {
                            await fetch("/api/admin/grading-queue", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ attemptId: item.id, verdict }),
                            })
                            setGradingItems(prev => prev.filter(x => x.id !== item.id))
                          } catch {}
                          setGradingBusyId("")
                        }}
                        style={{
                          flex: 1,
                          padding: "8px 14px",
                          borderRadius: 6,
                          fontWeight: 600,
                          fontSize: 13,
                          border: "none",
                          cursor: busy ? "not-allowed" : "pointer",
                          color: "#fff",
                          background:
                            verdict === "correct" ? "#3a8a55" :
                            verdict === "partial" ? "#c9a84c" :
                            "#a64a3b",
                          opacity: busy ? 0.55 : 1,
                        }}
                      >
                        {verdict === "correct" ? "✓ Correct (1.0)" : verdict === "partial" ? "◐ Partial (0.5)" : "✗ Incorrect (0)"}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
            {!gradingItems.length && !gradingLoading && <p style={{ opacity: 0.5, fontSize: 13 }}>No pending items yet. Click refresh after students submit.</p>}
          </div>
        </div>}

        {activeAdminSection === "sources" && <div id="sources" style={s.section}>
          <h2 style={s.sectionTitle}>Sources</h2>
          <p style={s.sub}>
            Every textbook / FRQ pack / released exam Scholar imports from is registered in the <code>sources</code> table. Pick a source on the left, the PDF renders in the panel on the right, and every question's image bbox appears as a draggable blue overlay tagged with the question label. Drag corners to resize, drag the body to move, then "Save" or "Save &amp; re-crop". Hidden bboxes don't move; only the selected one does.
          </p>
          <SourcesStudio darkMode={!lm} />
        </div>}

        {activeAdminSection === "backup" && <div id="backup" style={s.section}>
          <h2 style={s.sectionTitle}>R2 Backups</h2>
          <p style={s.sub}>Export the full Notion-backed Scholar workspace to Cloudflare R2 as timestamped JSON blobs with a manifest and a rolling latest pointer.</p>

          <div style={{
            background: lm ? "#f5f0e8" : "#101010",
            border: lm ? "1px solid #ddd4c0" : "1px solid #262626",
            borderRadius: 12,
            padding: 16,
            display: "grid",
            gap: 14,
          }}>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Backup label</label>
              <input
                style={s.problemInput}
                value={backupLabel}
                onChange={(e) => setBackupLabel(e.target.value)}
                placeholder="manual"
              />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: lm ? "#4a3a22" : "#ddd2b9" }}>
              <input
                type="checkbox"
                checked={backupIncludeBlocks}
                onChange={(e) => setBackupIncludeBlocks(e.target.checked)}
              />
              Include subject page content, callouts, and nested blocks
            </label>

            <div style={{ fontSize: 13, lineHeight: 1.65, color: lm ? "#7a6a50" : "#948770" }}>
              This backup includes Students, Subjects, Enrollments, Scores, Homework Attempts, Assessment Attempts, optional Reports, and all subject-specific data sources. Subject exports include blocks by default because important LO, reinforcement, and MCQ cache data can live outside page properties.
            </div>

            <div>
              <button
                type="button"
                className="btn-gold"
                onClick={runR2Backup}
                disabled={backupBusy}
                style={{ minWidth: 220 }}
              >
                {backupBusy ? "Running backup…" : "Run full R2 backup"}
              </button>
            </div>
          </div>

          {backupError && <div style={s.error}>{backupError}</div>}

          {backupResult && (
            <div style={{ ...s.resultBox, marginTop: 16 }}>
              <div style={s.resultTitle}>Backup complete</div>
              <div style={{ display: "grid", gap: 6, fontSize: 13, lineHeight: 1.6 }}>
                <div><strong>Bucket:</strong> {backupResult.bucket}</div>
                <div><strong>Root:</strong> {backupResult.backupRoot}</div>
                <div><strong>Manifest:</strong> {backupResult.manifestKey}</div>
                <div><strong>Latest pointer:</strong> {backupResult.latestKey}</div>
                <div>
                  <strong>Counts:</strong>{" "}
                  scores {backupResult.counts?.scores ?? 0}, students {backupResult.counts?.students ?? 0}, subjects {backupResult.counts?.subjects ?? 0}, enrollments {backupResult.counts?.enrollments ?? 0}, homework attempts {backupResult.counts?.homeworkAttempts ?? 0}, assessment attempts {backupResult.counts?.assessmentAttempts ?? 0}, subject data sources {backupResult.counts?.subjectDataSources ?? 0}, subject pages {backupResult.counts?.subjectPages ?? 0}
                </div>
              </div>
            </div>
          )}
        </div>}

        {activeAdminSection === "practice" && <div id="practice" style={s.section}>
          <h2 style={s.sectionTitle}>Practice Revision</h2>
          <p style={s.sub}>Build a consolidation list from actual practice performance. This prioritizes question types and units the student is struggling with inside Practice Room.</p>

          <div style={s.dropdownRow}>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Student</label>
              <select style={s.select} value={practiceStudentId} onChange={e => setPracticeStudentId(e.target.value)}>
                <option value="">Select student...</option>
                {students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Subject</label>
              <select style={s.select} value={practiceSubjectId} onChange={e => setPracticeSubjectId(e.target.value)}>
                <option value="">Select subject...</option>
                {getSubjectsForStudent(practiceStudentId).map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>
            </div>
          </div>

          {practiceLoading && <div style={s.hint}>Loading practice revision list...</div>}
          {practiceError && <div style={s.error}>❌ {practiceError}</div>}
          {!practiceLoading && !practiceError && !practiceRevision && (
            <div style={s.hint}>Select a subject to generate a revision list.</div>
          )}

          {!practiceLoading && !practiceError && practiceRevision && (
            <div style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ background: "#101010", border: "1px solid #222", borderRadius: 12, padding: 14 }}>
                  <div style={{ color: "#fff", fontWeight: 700, marginBottom: 10 }}>Weakest Units From Practice</div>
                  {(practiceRevision.units || []).slice(0, 6).map((unit, idx) => (
                    <div key={`${unit.unit}-${idx}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid #1a1a1a" }}>
                      <div>
                        <div style={{ color: "#ddd", fontSize: 13 }}>{unit.unit}</div>
                        <div style={{ color: "#777", fontSize: 12 }}>{unit.questionTypes} question types · {unit.wrongDays} wrong-day hits</div>
                      </div>
                      <div style={{ color: "#c9a84c", fontWeight: 700 }}>{Number(unit.totalNeedScore || 0).toFixed(2)}</div>
                    </div>
                  ))}
                  {!practiceRevision.units?.length && <div style={s.hint}>No practice unit data yet.</div>}
                </div>

                <div style={{ background: "#101010", border: "1px solid #222", borderRadius: 12, padding: 14 }}>
                  <div style={{ color: "#fff", fontWeight: 700, marginBottom: 10 }}>Weakest Question Types From Practice</div>
                  {(practiceRevision.questionTypes || []).slice(0, 8).map((item, idx) => (
                    <div key={`${item.id}-${idx}`} style={{ padding: "8px 0", borderBottom: "1px solid #1a1a1a" }}>
                      <div style={{ color: "#ddd", fontSize: 13 }}>{item.title}</div>
                      <div style={{ color: "#777", fontSize: 12, marginTop: 2 }}>
                        {item.unit} · weakness {Number(item.weaknessScore || 0).toFixed(2)} · wrong days {item.wrongDays}
                      </div>
                    </div>
                  ))}
                  {!practiceRevision.questionTypes?.length && <div style={s.hint}>No practice question-type data yet.</div>}
                </div>
              </div>

              <div style={{ background: "#0e131b", border: "1px solid #233247", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div style={{ color: "#dbe7ff", fontWeight: 700 }}>Consolidation Revision List</div>
                    <div style={{ color: "#8da1c7", fontSize: 12 }}>Use this as a tutor-facing revision plan built from practice weakness.</div>
                  </div>
                  <button style={{ ...s.modeBtn, width: "auto", padding: "8px 12px" }} onClick={handleCopyPracticeRevision}>
                    Copy List
                  </button>
                </div>
                <pre style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "#bfd0ee",
                  fontFamily: "'DM Mono', monospace",
                }}>
                  {practiceRevision.revisionLines}
                </pre>
              </div>
            </div>
          )}
        </div>}

        {(activeAdminSection === "review" || activeAdminSection === "pacing") && <div style={s.toolsWrap}>

        {/* ── Review Queue ── */}
        {activeAdminSection === "review" && <div id="review" style={s.section}>
          <h2 style={s.sectionTitle}>Question Review Queue</h2>
          <p style={s.sub}>Daily admin flash-review. `No` removes the whole type from Scores + context section. `Yes` removes the selected specific problem.</p>

          <div style={s.dropdownRow}>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Student</label>
              <select style={s.select} value={reviewStudentId} onChange={e => setReviewStudentId(e.target.value)}>
                <option value="">Select student...</option>
                {students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Subject</label>
              <select style={s.select} value={reviewSubjectId} onChange={e => setReviewSubjectId(e.target.value)}>
                <option value="">Select subject...</option>
                {getSubjectsForStudent(reviewStudentId).map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>
            </div>
          </div>

          {reviewError && <div style={s.error}>❌ {reviewError}</div>}
          {!!reviewNotice && <div style={{ ...s.resultBox, marginTop: 8, padding: 10 }}><div style={{ ...s.resultTitle, marginBottom: 0, fontSize: 13 }}>✅ {reviewNotice}</div></div>}
          {reviewLoading && <div style={s.hint}>Loading review queue...</div>}

          {!reviewLoading && (
            <div style={s.reviewWorkspace} ref={reviewWorkspaceRef}>
              <svg
                style={s.reviewSvgOverlay}
                width={reviewViz.width}
                height={reviewViz.height}
                viewBox={`0 0 ${reviewViz.width || 1} ${reviewViz.height || 1}`}
                aria-hidden="true"
              >
                {reviewViz.paths.map((line, idx) => (
                  <path
                    key={`review-path-${idx}`}
                    d={line.d}
                    fill="none"
                    stroke={line.color}
                    strokeWidth={line.strokeWidth}
                    strokeOpacity={line.opacity}
                    strokeLinecap="round"
                  />
                ))}
                {reviewViz.dots.map((dot, idx) => (
                  <circle key={`review-dot-${idx}`} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.color} fillOpacity={dot.opacity} />
                ))}
              </svg>
              <div style={{ ...s.reviewMapWrap, ...(activeReviewProblem ? s.reviewMapWrapCompressed : {}) }}>
                <div style={s.reviewBoard} ref={reviewBoardRef}>
                  <div style={{ ...s.reviewPanel, ...s.reviewPanelCompact }}>
                    <div style={s.sectionLabel}>{loPanelLabel}</div>
                    <div style={{ ...s.reviewMeta, marginTop: 0, marginBottom: 8 }}>What should the student learn?</div>
                    {!activeReviewTypeForViz && <div style={s.hint}>Hover or select a question type to see only its linked learning objectives.</div>}
                    {!!activeReviewTypeForViz && visibleReviewLoBlocks.length === 0 && <div style={s.hint}>No LO mappings found for this question type.</div>}
                    {visibleReviewLoBlocks.map(([code, items]) => (
                      (() => {
                        const primaryCode = activeReviewTypeForViz ? primaryLoCodeForItem(activeReviewTypeForViz) : ""
                        const isPrimaryLink = primaryCode === code
                        const isPrimary = reviewSelectedLo === code || reviewHoverLo === code
                        const isLinked = linkedLoCodesForPinnedProblem.includes(code) && !isPrimary
                        return (
                          <button
                            key={code}
                            ref={el => {
                              if (el) loRefs.current[code] = el
                              else delete loRefs.current[code]
                            }}
                            style={{
                              ...s.reviewItemBtn,
                              ...s.reviewItemBtnCompact,
                              ...(isLinked ? s.reviewItemBtnLinked : {}),
                              ...(isPrimary ? s.reviewItemBtnActive : {}),
                              borderColor: isPrimaryLink ? "#8d3e3e" : (isLinked ? "#355b88" : undefined),
                              background: isPrimaryLink ? "#241414" : (isLinked ? "#111c2b" : undefined),
                              color: isPrimaryLink ? "#f3c0c0" : (isLinked ? "#c7dcff" : undefined),
                            }}
                            onMouseEnter={() => setReviewHoverLo(code)}
                            onMouseLeave={() => setReviewHoverLo("")}
                            onClick={() => {
                              setReviewSelectedLo(prev => prev === code ? "" : code)
                              const first = (reviewLoMap[code] || [])[0]
                              if (first) setReviewSelectedId(first.id)
                              setReviewPage(1)
                              setReviewPinnedProblem("")
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>{morphText(loDisplay(code), `lo-${code}`)}</div>
                            <div style={s.reviewMeta}>
                              {isPrimaryLink ? "Primary LO" : "Reinforcement LO"} · {items.length} mapped question type(s)
                            </div>
                          </button>
                        )
                      })()
                    ))}
                  </div>

                  <div style={{ ...s.reviewPanel, ...s.reviewPanelWide }}>
                    <div style={s.sectionLabel}>Question Types (Pending)</div>
                    {filteredReviewItems.length === 0 && <div style={s.hint}>No pending questions for this filter.</div>}
                    {pagedReviewItems.map(item => (
                      <button
                        key={item.id}
                        ref={el => {
                          if (el) typeRefs.current[item.id] = el
                          else delete typeRefs.current[item.id]
                        }}
                        style={{ ...s.reviewItemBtn, ...s.reviewItemBtnCompact, ...((selectedReviewItem?.id === item.id || reviewHoverTypeId === item.id) ? s.reviewItemBtnActive : {}) }}
                        onMouseEnter={() => {
                          setReviewHoverTypeId(item.id)
                          setReviewSelectedId(item.id)
                        }}
                        onMouseLeave={() => setReviewHoverTypeId("")}
                        onClick={() => {
                          setReviewSelectedId(item.id)
                          setReviewPinnedProblem("")
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{morphText(item.questionName || "Untitled question type", `type-${item.id}`)}</div>
                        <div style={s.reviewMeta}>
                          Score {Number(item.score || 0).toFixed(2)} · LO {(String(item.standardCode || "").split(/[,;|]/).map(s => s.trim()).filter(Boolean).map(loDisplay).join(" · ")) || "—"}
                        </div>
                      </button>
                    ))}
                    {filteredReviewItems.length > REVIEW_PAGE_SIZE && (
                      <div style={s.reviewPagination}>
                        {Array.from({ length: totalReviewPages }, (_, i) => i + 1).map(pageNum => (
                          <button
                            key={`review-page-${pageNum}`}
                            style={{ ...s.reviewPageBtn, ...(currentReviewPage === pageNum ? s.reviewPageBtnActive : {}) }}
                            onClick={() => setReviewPage(pageNum)}
                          >
                            {pageNum}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedReviewItem && (
                      <button
                        style={{ ...s.modeBtn, marginTop: 10, width: "100%", borderColor: "#7a3131", color: "#ff9d9d" }}
                        disabled={reviewBusy}
                        onClick={() => applyReviewAction("remove_type")}
                      >
                        No — Remove Entire Type
                      </button>
                    )}
                  </div>

                  <div style={{ ...s.reviewPanel, ...s.reviewPanelCompact }}>
                    <div style={s.sectionLabel}>Related Problems</div>
                    {!selectedReviewItem && <div style={s.hint}>Select a pending question type.</div>}
                    {selectedReviewItem && (selectedReviewItem.relatedProblems || []).length === 0 && (
                      <div style={s.hint}>No extracted problems found in matching context.</div>
                    )}
                    {selectedReviewItem && (selectedReviewItem.relatedProblems || []).map((problem, idx) => {
                      const pKey = problemKey(problem, idx)
                      const draft = reviewProblemDrafts[pKey] || {}
                      const problemText = draft.questionText || problem.questionText || "Question text unavailable"
                      const isActive = reviewPinnedProblem === pKey || reviewHoverProblem === pKey
                      return (
                        <button
                          key={pKey}
                          ref={el => {
                            if (el) problemRefs.current[pKey] = el
                            else delete problemRefs.current[pKey]
                          }}
                          style={{ ...s.problemCard, ...s.problemCardCompact, ...(isActive ? s.reviewItemBtnActive : {}) }}
                          onMouseEnter={() => setReviewHoverProblem(pKey)}
                          onMouseLeave={() => setReviewHoverProblem("")}
                          onClick={() => setReviewPinnedProblem(pKey)}
                        >
                          <div style={{ ...s.problemQ, ...(isActive ? { color: "#f2dfaf" } : {}) }}>{morphText(problemText.slice(0, 120), `problem-${pKey}`)}{problemText.length > 120 ? "…" : ""}</div>
                          <div style={s.problemFooter}>
                            <span style={{ ...s.reviewMeta, ...(isActive ? { color: "#b8a070" } : {}) }}>qhash: {problem.qhash || "—"}</span>
                            <span style={{ ...s.reviewMeta, ...(isActive ? { color: "#b8a070" } : {}) }}>{reviewPinnedProblem === pKey ? "Open in editor" : "Click to edit"}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <aside ref={reviewEditorRef} style={{ ...s.reviewEditorPane, ...(activeReviewProblem ? s.reviewEditorPaneOpen : {}) }}>
                {!activeReviewProblem && (
                  <div style={s.reviewEditorEmpty}>
                    <div style={s.sectionLabel}>Question Editor</div>
                    <div style={s.hint}>Click a problem to open full editing tools here.</div>
                  </div>
                )}
                {activeReviewProblem && activeReviewDraft && (
                  <div ref={reviewEditorInnerRef} style={s.reviewEditorInner}>
                    <div style={s.sectionLabel}>Question Editor</div>
                    <div style={s.reviewMeta}>qhash: {activeReviewProblem.qhash || "—"}</div>

                    <div style={s.problemEditorLabel}>Question</div>
                    <textarea
                      style={s.problemInput}
                      value={activeReviewDraft.questionText}
                      onChange={(e) => updateProblemDraft(activeReviewProblemKey, { questionText: e.target.value })}
                      rows={4}
                    />
                    <div style={s.problemEditorLabel}>Answer</div>
                    <textarea
                      style={s.problemInput}
                      value={activeReviewDraft.answerText}
                      onChange={(e) => updateProblemDraft(activeReviewProblemKey, { answerText: e.target.value })}
                      rows={3}
                    />
                    {!!activeReviewProblem.options?.length && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={s.problemEditorLabel}>MCQ Options</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {activeReviewProblem.options.map((option, idx) => {
                            const letter = String.fromCharCode(65 + idx)
                            const isCorrect = String(activeReviewProblem.correctOption || "").trim().toUpperCase() === letter
                            return (
                              <div
                                key={`${activeReviewProblemKey}-opt-${idx}`}
                                style={{
                                  border: `1px solid ${isCorrect ? "#4c7a57" : "#2a3240"}`,
                                  background: isCorrect ? "#122018" : "#101419",
                                  color: isCorrect ? "#c7ebd0" : "#dfe6f5",
                                  borderRadius: 7,
                                  padding: "8px 10px",
                                  fontSize: 12,
                                  lineHeight: 1.4,
                                }}
                              >
                                <strong style={{ marginRight: 8 }}>{letter}.</strong>{String(option || "")}
                              </div>
                            )
                          })}
                        </div>
                        <div style={{ ...s.reviewMeta, marginTop: 6 }}>
                          Correct option: {activeReviewProblem.correctOption || "—"}{activeReviewProblem.explanation ? ` · ${activeReviewProblem.explanation}` : ""}
                        </div>
                      </div>
                    )}
                    <div style={s.problemEditorLabel}>Image URL or Upload</div>
                    <input
                      style={s.problemInput}
                      value={activeReviewDraft.imageUrl || ""}
                      onChange={(e) => updateProblemDraft(activeReviewProblemKey, { imageUrl: e.target.value })}
                      placeholder="https://..."
                    />
                    <div style={s.problemBtnRow}>
                      <label style={s.problemActionBtn}>
                        Upload Image
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          onChange={(e) => uploadProblemImage(e.target.files?.[0], activeReviewProblemKey)}
                        />
                      </label>
                      <button style={s.problemActionBtn} disabled={reviewBusy || activeReviewDraft.busy} onClick={() => saveProblemEdits(activeReviewProblem, activeReviewProblemKey)}>Save Edit</button>
                      <button
                        style={{ ...s.problemActionBtn, borderColor: "#6b3a3a", color: "#ffb0b0" }}
                        disabled={reviewBusy || activeReviewDraft.busy || !(activeReviewDraft.imageUrl || activeReviewProblem.imageUrl)}
                        onClick={() => deleteProblemImage(activeReviewProblem, activeReviewProblemKey)}
                      >
                        Delete Image
                      </button>
                    </div>

                    {(activeReviewDraft.imageUrl || activeReviewProblem.imageUrl) && (
                      <div style={{ marginBottom: 8 }}>
                        <img
                          src={activeReviewDraft.imageUrl || activeReviewProblem.imageUrl}
                          alt=""
                          style={s.problemImgPreview}
                          onError={() => updateProblemDraft(activeReviewProblemKey, { imageLoadError: true })}
                          onLoad={() => updateProblemDraft(activeReviewProblemKey, { imageLoadError: false })}
                        />
                        {activeReviewDraft.imageLoadError && (
                          <div style={s.problemImageError}>Image could not be loaded from this URL.</div>
                        )}
                      </div>
                    )}

                    <div style={{ ...s.problemEditorLabel, marginTop: 16 }}>LO Reinforcement</div>
                    {(() => {
                      const loName = (code) => {
                        if (!code) return ""
                        const obj = getObjectiveByCode(focusState, reviewSubjectName, code.trim())
                        return obj?.name || ""
                      }
                      const currentPrimaryLo = activeReviewDraft.primaryLo ?? activeReviewProblem.primaryLo ?? ""
                      const currentReinforcement = activeReviewDraft.reinforcement ?? activeReviewProblem.reinforcement ?? []
                      return (<>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Primary LO</div>
                          <input
                            style={s.problemInput}
                            value={currentPrimaryLo}
                            onChange={(e) => updateProblemDraft(activeReviewProblemKey, { primaryLo: e.target.value })}
                            placeholder="e.g. APPhy1.8.3"
                          />
                          {loName(currentPrimaryLo) && (
                            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, paddingLeft: 2 }}>{loName(currentPrimaryLo)}</div>
                          )}
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>Reinforced LOs</div>
                          {currentReinforcement.map((entry, ri) => (
                            <div key={ri} style={{ marginBottom: 6 }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <input
                                  style={{ ...s.problemInput, flex: 2, marginBottom: 0 }}
                                  value={entry.code || ""}
                                  placeholder="LO code"
                                  onChange={(e) => {
                                    const next = [...currentReinforcement]
                                    next[ri] = { ...next[ri], code: e.target.value }
                                    updateProblemDraft(activeReviewProblemKey, { reinforcement: next })
                                  }}
                                />
                                <input
                                  style={{ ...s.problemInput, flex: 1, marginBottom: 0 }}
                                  type="number"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={entry.weight ?? ""}
                                  placeholder="weight"
                                  onChange={(e) => {
                                    const next = [...currentReinforcement]
                                    next[ri] = { ...next[ri], weight: parseFloat(e.target.value) || 0 }
                                    updateProblemDraft(activeReviewProblemKey, { reinforcement: next })
                                  }}
                                />
                                <button
                                  style={{ ...s.problemActionBtn, padding: "2px 8px", fontSize: 11, borderColor: "#6b3a3a", color: "#ffb0b0" }}
                                  onClick={() => {
                                    const next = currentReinforcement.filter((_, i) => i !== ri)
                                    updateProblemDraft(activeReviewProblemKey, { reinforcement: next })
                                  }}
                                >✕</button>
                              </div>
                              {loName(entry.code) && (
                                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, paddingLeft: 2 }}>{loName(entry.code)}</div>
                              )}
                            </div>
                          ))}
                          <button
                            style={{ ...s.problemActionBtn, fontSize: 11 }}
                            onClick={() => updateProblemDraft(activeReviewProblemKey, { reinforcement: [...currentReinforcement, { code: "", weight: 0.1 }] })}
                          >+ Add LO</button>
                        </div>
                        <div style={s.problemBtnRow}>
                          <button style={s.problemActionBtn} disabled={reviewBusy || activeReviewDraft.busy} onClick={() => saveLoReinforcement(activeReviewProblem, activeReviewProblemKey)}>Save LO</button>
                        </div>
                      </>)
                    })()}

                    <div style={s.problemEditorLabel}>Claude SVG (prompt + preview)</div>
                    <input
                      style={s.problemInput}
                      value={activeReviewDraft.promptText || ""}
                      onChange={(e) => updateProblemDraft(activeReviewProblemKey, { promptText: e.target.value })}
                      placeholder="Optional: describe desired diagram style"
                    />
                    {!!activeReviewDraft.generatedPrompt && <div style={s.problemPromptBox}>{activeReviewDraft.generatedPrompt}</div>}
                    <div style={s.problemBtnRow}>
                      <button style={s.problemActionBtn} disabled={reviewBusy || activeReviewDraft.busy} onClick={() => generateProblemImagePrompt(activeReviewProblem, activeReviewProblemKey)}>Claude Prompt</button>
                      <button style={s.problemActionBtn} disabled={reviewBusy || activeReviewDraft.busy} onClick={() => generateProblemSvg(activeReviewProblem, activeReviewProblemKey)}>Generate SVG Diagram</button>
                      <button
                        style={s.problemActionBtn}
                        disabled={reviewBusy || activeReviewDraft.busy || !activeReviewDraft.generatedSvg}
                        onClick={() => approveProblemSvg(activeReviewProblem, activeReviewProblemKey)}
                      >
                        Approve SVG
                      </button>
                      <button
                        style={s.problemActionBtn}
                        disabled={reviewBusy || activeReviewDraft.busy || !activeReviewDraft.generatedSvg}
                        onClick={() => updateProblemDraft(activeReviewProblemKey, { generatedSvg: "" })}
                      >
                        Deny SVG
                      </button>
                    </div>

                    {!!activeReviewDraft.generatedSvg && (
                      <div style={s.problemSvgPreviewWrap}>
                        <div style={s.problemEditorLabel}>Editable SVG Markup</div>
                        <textarea
                          style={s.problemSvgEditor}
                          value={activeReviewDraft.generatedSvg}
                          onChange={(e) => updateProblemDraft(activeReviewProblemKey, { generatedSvg: e.target.value })}
                          rows={10}
                          spellCheck={false}
                        />
                        <div style={s.problemEditorLabel}>SVG Draft Preview</div>
                        <div style={s.problemSvgPreview} dangerouslySetInnerHTML={{ __html: activeReviewDraft.generatedSvg }} />
                      </div>
                    )}

                    <div style={s.problemSvgPreviewWrap}>
                      <div style={s.problemEditorLabel}>Excalidraw Editor</div>
                      <div style={s.problemBtnRow}>
                        <button
                          style={s.problemActionBtn}
                          disabled={reviewBusy || activeReviewDraft.busy || !activeReviewDraft.generatedSvg}
                          onClick={() => importSvgToExcalidraw(activeReviewProblemKey)}
                        >
                          Import SVG to Excalidraw
                        </button>
                        <button
                          style={s.problemActionBtn}
                          disabled={reviewBusy || activeReviewDraft.busy}
                          onClick={() => exportExcalidrawAsImage(activeReviewProblem, activeReviewProblemKey, "png")}
                        >
                          Upload Excalidraw PNG
                        </button>
                        <button
                          style={s.problemActionBtn}
                          disabled={reviewBusy || activeReviewDraft.busy}
                          onClick={() => exportExcalidrawAsImage(activeReviewProblem, activeReviewProblemKey, "svg")}
                        >
                          Upload Excalidraw SVG
                        </button>
                      </div>
                      <div style={s.excalWrap}>
                        <Excalidraw
                          excalidrawAPI={(api) => { excalidrawApiRef.current = api }}
                          initialData={{
                            appState: {
                              theme: "light",
                              viewBackgroundColor: "#ffffff",
                            },
                          }}
                          UIOptions={{
                            canvasActions: { saveToActiveFile: false, loadScene: false },
                          }}
                        />
                      </div>
                    </div>

                    <div style={s.problemBtnRow}>
                      <button
                        style={{ ...s.problemActionBtn, borderColor: "#316a43", color: "#9cf0ba" }}
                        disabled={reviewBusy || activeReviewDraft.busy}
                        onClick={() => applyReviewAction("remove_problem", {
                          qhash: activeReviewProblem.qhash,
                          qBlockId: activeReviewProblem.qBlockId,
                        })}
                      >
                        Yes — Remove Specific Problem
                      </button>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <button
                        style={s.problemCollapseBtn}
                        disabled={activeReviewDraft.busy || !!activeReviewDraft.generatedSvg}
                        onClick={() => {
                          if (activeReviewDraft.busy || activeReviewDraft.generatedSvg) return
                          setReviewPinnedProblem("")
                        }}
                      >
                        {activeReviewDraft.busy ? (activeReviewDraft.busyLabel || "Working...") : activeReviewDraft.generatedSvg ? "Approve/Deny required" : "Close editor"}
                      </button>
                    </div>
                  </div>
                )}
              </aside>
            </div>
          )}
        </div>}

        {/* ── Pacing Guide ─────────────────────────────────── */}
        {activeAdminSection === "pacing" && <div id="pacing" style={s.section}>
          <h2 style={s.sectionTitle}>Pacing Guide</h2>
          <p style={s.sub}>Drag to reorder. Toggle to skip. Subject defaults come from LO order, while school/textbook overlays come from the uploaded SLO-section mapping in Supabase.</p>

          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <select style={{ ...s.select, width: "auto" }} value={pacingStudentId} onChange={e => {
              setPacingStudentId(e.target.value)
              setPacingSubject("")
              setPacingEntries([])

              setPacingError(null)
              setPacingSubjectConfig(null)
              setPacingSubjectBanks([])
              setPacingSubjectOverlays([])
              setPacingConfigError(null)
              setPacingConfigNotice("")
            }}>
              <option value="">Select student…</option>
              {students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
            <select style={{ ...s.select, width: "auto" }} value={pacingSubject} onChange={async e => {
              const subId = e.target.value
              setPacingSubject(subId)
              setPacingEntries([])

              setPacingSaved(false)
              setPacingError(null)
              setPacingNotice("")
              if (!subId) {
                setPacingSubjectConfig(null)
                setPacingSubjectBanks([])
                setPacingSubjectOverlays([])
                setPacingConfigError(null)
                setPacingConfigNotice("")
                return
              }
              await Promise.all([
                loadPacingGuideFor(pacingStudentId, subId),
                loadPacingSubjectConfig(subId),
              ])
            }}>
              <option value="">Select subject…</option>
              {getSubjectsForStudent(pacingStudentId).map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
            </select>
          </div>

          {pacingLoading && <div style={s.hint}>Loading…</div>}
          {pacingError && <div style={s.error}>{pacingError}</div>}
          {pacingNotice && <div style={s.hint}>{pacingNotice}</div>}
          {pacingLocked && !pacingLoading && (
            <div style={{ padding: "18px 20px", borderRadius: 10, border: `1px solid ${lm ? "#d7c7a5" : "#3a2a10"}`, background: lm ? "#fdf5e0" : "#1a1208", color: lm ? "#7a5a20" : "#c8a060", fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
              <strong>Pacing guide locked.</strong> Choose a content bank first so the native LO pacing guide exists. If the school provides a pacing guide, upload the SLO-section mapping and link the overlay below to unlock school-section ordering.
            </div>
          )}
          {!pacingLocked && pacingSource && !pacingLoading && pacingEntries.length > 0 && (
            <div style={{ fontSize: 11, color: lm ? "#9a8a6a" : "#7a6a50", marginBottom: 8, letterSpacing: "0.04em" }}>
              {pacingSource === "enrollment"
                ? "Custom pacing for this student"
                : pacingSource === "overlay_native"
                  ? "School/textbook pacing guide (shared)"
                  : "Subject LO pacing guide (shared)"}
            </div>
          )}

          {pacingSubject && (
            <div style={{
              marginBottom: 16,
              padding: 14,
              borderRadius: 12,
              border: `1px solid ${lm ? "#d7c7a5" : "#3a3020"}`,
              background: lm ? "#f9f0de" : "#15120d",
              display: "grid",
              gap: 10,
            }}>
              {(() => {
                const selectedBankId = pacingSubjectConfig?.content_bank_id || ""
                const availableOverlays = selectedBankId
                  ? pacingSubjectOverlays.filter((overlay) => overlay.content_bank_id === selectedBankId)
                  : []
                const hasOverlayMapping = availableOverlays.length > 0
                const schoolModeBlocked = !hasOverlayMapping
                return (
                  <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: lm ? "#8a7050" : "#b8a070" }}>Subject configuration</div>
                  <div style={{ fontSize: 13, color: lm ? "#5d4525" : "#d7c6a0" }}>
                    Choose the canonical content bank first, then decide whether this subject follows default pacing or a school/textbook overlay.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadPacingSubjectConfig(pacingSubject)}
                  disabled={pacingConfigLoading}
                  style={{ ...s.secondaryBtn, opacity: pacingConfigLoading ? 0.6 : 1 }}
                >
                  {pacingConfigLoading ? "Refreshing..." : "Refresh config"}
                </button>
              </div>

              {pacingConfigError && <div style={s.error}>{pacingConfigError}</div>}
              {pacingConfigNotice && <div style={s.hint}>{pacingConfigNotice}</div>}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: lm ? "#7a6440" : "#b8b0a0" }}>Content bank</span>
                  <select
                    style={s.select}
                    value={pacingSubjectConfig?.content_bank_id || ""}
                    onChange={(e) => {
                      const nextBank = e.target.value || null
                      const nextBankOverlays = nextBank
                        ? pacingSubjectOverlays.filter((overlay) => overlay.content_bank_id === nextBank)
                        : []
                      setPacingSubjectConfig((prev) => ({
                        ...(prev || {}),
                        content_bank_id: nextBank,
                        pacing_mode: (prev?.pacing_mode === "school" || prev?.pacing_mode === "textbook") && !nextBankOverlays.length
                          ? "default"
                          : (prev?.pacing_mode || "unconfigured"),
                        active_overlay_id: nextBank === prev?.content_bank_id ? (prev?.active_overlay_id || null) : null,
                      }))
                    }}
                  >
                    <option value="">Select bank…</option>
                    {pacingSubjectBanks.map((bank) => (
                      <option key={bank.id} value={bank.id}>{bank.label}</option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: lm ? "#7a6440" : "#b8b0a0" }}>Pacing mode</span>
                  <select
                    style={s.select}
                    value={pacingSubjectConfig?.pacing_mode || "unconfigured"}
                    onChange={(e) => {
                      const nextMode = e.target.value
                      if ((nextMode === "school" || nextMode === "textbook") && schoolModeBlocked) return
                      setPacingSubjectConfig((prev) => ({
                        ...(prev || {}),
                        pacing_mode: nextMode,
                        active_overlay_id: nextMode === "school" || nextMode === "textbook"
                          ? (prev?.active_overlay_id || "")
                          : null,
                      }))
                    }}
                  >
                    <option value="unconfigured">Unconfigured</option>
                    <option value="default">Default pacing</option>
                    <option value="school" disabled={schoolModeBlocked}>
                      School pacing {schoolModeBlocked ? "(provided a mapping between curriculum pacing and school pacing for this option)" : ""}
                    </option>
                    <option value="textbook" disabled={schoolModeBlocked}>
                      Textbook pacing {schoolModeBlocked ? "(provided a mapping between curriculum pacing and school pacing for this option)" : ""}
                    </option>
                    <option value="manual">Manual pacing</option>
                  </select>
                </label>

                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: lm ? "#7a6440" : "#b8b0a0" }}>Active overlay</span>
                  <select
                    style={s.select}
                    value={pacingSubjectConfig?.active_overlay_id || ""}
                    disabled={!["school", "textbook"].includes(pacingSubjectConfig?.pacing_mode || "")}
                    onChange={(e) => {
                      const nextOverlay = e.target.value || null
                      setPacingSubjectConfig((prev) => ({
                        ...(prev || {}),
                        active_overlay_id: nextOverlay,
                      }))
                    }}
                  >
                    <option value="">
                      {["school", "textbook"].includes(pacingSubjectConfig?.pacing_mode || "")
                        ? "Select overlay…"
                        : "Not needed for this mode"}
                    </option>
                    {availableOverlays.map((overlay) => (
                      <option key={overlay.id} value={overlay.id}>
                        {overlay.source_label || overlay.overlay_key || overlay.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: lm ? "#7a6440" : "#a89a82" }}>
                  {pacingSubjectConfig?.pacing_mode === "unconfigured"
                    ? "Draft/session fills stay locked until you choose a pacing mode."
                    : schoolModeBlocked
                      ? "School/textbook pacing unlocks only after you upload a JSON SLO-section mapping for this content bank."
                    : ["school", "textbook"].includes(pacingSubjectConfig?.pacing_mode || "")
                      ? "Upload the school SLO-section mapping, then attach the active overlay so planning can use school sections."
                      : "This subject falls back to the saved LO pacing guide when no overlay is active."}
                </div>
                <button
                  type="button"
                  onClick={() => savePacingSubjectConfig(pacingSubjectConfig || {})}
                  disabled={
                    pacingConfigSaving ||
                    !pacingSubjectConfig ||
                    (["school", "textbook"].includes(pacingSubjectConfig?.pacing_mode || "") && (!hasOverlayMapping || !pacingSubjectConfig?.active_overlay_id))
                  }
                  style={{ ...s.importBtn, width: "auto", padding: "10px 20px", opacity: pacingConfigSaving ? 0.6 : 1 }}
                >
                  {pacingConfigSaving ? "Saving..." : "Save bank + overlay config"}
                </button>
              </div>
                  </>
                )
              })()}
            </div>
          )}

          {pacingEntries.length > 0 && (() => {
            const ITEM_H = 72
            const SKIP_THRESHOLD = 80
            const pacingStudentState = students.find(st => st.id === pacingStudentId)?.state || null
            const pacingSubjectName = subjects.find(sub => sub.id === pacingSubject)?.name || ""
            const dragUnit = pacingDrag?.unit ?? null
            const dragFrom = pacingDrag?.from ?? null
            const dropUnit = pacingDrop?.unit ?? null
            const dropTo = pacingDrop?.to ?? null

            // Group entries by school-unit overlay when available, otherwise fall back to canonical standards.
            const units = []
            const unitMap = {}
            for (const entry of pacingEntries) {
              const group = getPacingUnitGroup(entry)
              const key = group.key
              if (!unitMap[key]) {
                unitMap[key] = { code: key, name: group.name, entries: [] }
                units.push(unitMap[key])
              }
              unitMap[key].entries.push(entry)
            }

            const mutateEntries = (updater) => {
              setPacingHistory(h => [...h.slice(-29), { entries: pacingEntries }])
              setPacingEntries(updater)
            }

            const reorderUnits = (fromCode, toCode, insertAfter = false) => {
              if (!fromCode || !toCode || fromCode === toCode) return
              mutateEntries(prev => {
                const groups = {}, order = []
                for (const e of prev) {
                  const k = getPacingUnitGroup(e).key
                  if (!groups[k]) { groups[k] = []; order.push(k) }
                  groups[k].push(e)
                }
                const fi = order.indexOf(fromCode)
                if (fi === -1) return prev
                order.splice(fi, 1)
                const ti = order.indexOf(toCode)
                if (ti === -1) { order.push(fromCode) }
                else { order.splice(insertAfter ? ti + 1 : ti, 0, fromCode) }
                return order.flatMap(k => groups[k])
              })
            }
            const onUnitDragStart = (e, unitCode) => {
              e.stopPropagation()
              e.dataTransfer.effectAllowed = "move"
              e.dataTransfer.setData("text/plain", JSON.stringify({ unitDrag: unitCode }))
              setPacingUnitDrag(unitCode)
              setPacingUnitDrop(null)
            }
            const onUnitDragEnd = () => { setPacingUnitDrag(null); setPacingUnitDrop(null) }
            const onUnitDragOver = (e, unitCode) => {
              e.preventDefault()
              if (!pacingUnitDrag || pacingUnitDrag === unitCode) return
              if (pacingUnitDrop !== unitCode) setPacingUnitDrop(unitCode)
            }
            const onUnitDrop = (e, unitCode) => {
              e.preventDefault()
              let data; try { data = JSON.parse(e.dataTransfer.getData("text/plain")) } catch { return }
              const fromCode = data?.unitDrag
              setPacingUnitDrag(null); setPacingUnitDrop(null)
              if (!fromCode) return
              const fromUnitIdx = units.findIndex(u => u.code === fromCode)
              const toUnitIdx = units.findIndex(u => u.code === unitCode)
              reorderUnits(fromCode, unitCode, fromUnitIdx < toUnitIdx)
            }

            const getShift = (unitCode, i) => {
              if (dragUnit !== unitCode || dropUnit !== unitCode || dragFrom === null || dropTo === null || i === dragFrom) return 0
              if (dropTo > dragFrom) {
                if (i > dragFrom && i < dropTo) return -(ITEM_H + 2)
              } else {
                if (i >= dropTo && i < dragFrom) return (ITEM_H + 2)
              }
              return 0
            }
            const getBoundary = (unitCode) => {
              if (dragUnit !== unitCode || dropUnit !== unitCode || dragFrom === null || dropTo === null || dragFrom === dropTo) return -1
              return dropTo > dragFrom ? dragFrom + 1 : dropTo
            }

            const onDragStart = (e, unitCode, idx) => {
              e.dataTransfer.effectAllowed = "move"
              e.dataTransfer.setData("text/plain", JSON.stringify({ unit: unitCode, idx }))
              pacingDragStartX.current = e.clientX
              setPacingDrag({ unit: unitCode, from: idx })
              setPacingDrop({ unit: unitCode, to: idx })
              setPacingPendingSkip(false)
            }
            const onDragEnd = () => {
              setPacingDrag(null); setPacingDrop(null); setPacingPendingSkip(false)
              pacingDragStartX.current = null
            }
            const onDragOver = (e, unitCode, idx, el) => {
              e.preventDefault()
              if (dragUnit !== unitCode) return // items only reorder within their own unit
              const dx = e.clientX - (pacingDragStartX.current || e.clientX)
              const newPending = dx > SKIP_THRESHOLD
              if (newPending !== pacingPendingSkip) setPacingPendingSkip(newPending)
              if (newPending) return
              const rect = el?.getBoundingClientRect()
              // Compensate for CSS translateY shift so the midpoint is based on the item's
              // *original* position — prevents the animation from causing dropTo to flicker.
              const animShift = getShift(unitCode, idx)
              const unshiftedMid = rect ? (rect.top - animShift) + rect.height / 2 : null
              const newTo = unshiftedMid !== null ? (e.clientY < unshiftedMid ? idx : idx + 1) : idx
              if (dropUnit !== unitCode || dropTo !== newTo) setPacingDrop({ unit: unitCode, to: newTo })
            }
            const onDrop = (e, unitCode) => {
              e.preventDefault()
              let data
              try { data = JSON.parse(e.dataTransfer.getData("text/plain")) } catch { return }
              const wasPendingSkip = pacingPendingSkip
              const fromUnit = data?.unit
              const fromIdx = data?.idx
              setPacingDrag(null); setPacingDrop(null); setPacingPendingSkip(false)
              pacingDragStartX.current = null
              if (!fromUnit || fromIdx == null || fromUnit !== unitCode) return
              if (wasPendingSkip) {
                const entryCode = units.find(u => u.code === unitCode)?.entries[fromIdx]?.code
                if (entryCode) mutateEntries(prev => prev.map(e => e.code === entryCode ? { ...e, skipped: !e.skipped } : e))
                return
              }
              const toIdx = (dropUnit === unitCode && dropTo !== null) ? dropTo : fromIdx
              if (fromIdx === toIdx) return
              mutateEntries(prev => {
                const unitCodes = units.find(u => u.code === unitCode)?.entries.map(e => e.code) || []
                const reordered = [...unitCodes]
                const [removed] = reordered.splice(fromIdx, 1)
                reordered.splice(toIdx > fromIdx ? toIdx - 1 : toIdx, 0, removed)
                let ri = 0
                const codeMap = Object.fromEntries(prev.map(e => [e.code, e]))
                const unitSet = new Set(unitCodes)
                return prev.map(e => unitSet.has(e.code) ? codeMap[reordered[ri++]] : e)
              })
            }

            // Palette: distinct hues for up to 25 units, all muted/dark-mode friendly
            const UNIT_PALETTE = [
              { h: 210 }, { h: 160 }, { h: 280 }, { h: 35  }, { h: 340 },
              { h: 190 }, { h: 260 }, { h: 80  }, { h: 20  }, { h: 320 },
              { h: 170 }, { h: 50  }, { h: 240 }, { h: 140 }, { h: 0   },
              { h: 200 }, { h: 300 }, { h: 60  }, { h: 180 }, { h: 350 },
              { h: 100 }, { h: 230 }, { h: 15  }, { h: 270 }, { h: 130 },
            ]
            const codeToIdx = (code) => {
              let h = 0; for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0
              return h % UNIT_PALETTE.length
            }
            const unitColor = (code) => {
              const { h } = UNIT_PALETTE[codeToIdx(code)]
              if (lightMode) return {
                accent:  `hsl(${h}, 55%, 32%)`,
                dim:     `hsl(${h}, 30%, 38%)`,
                border:  `hsl(${h}, 40%, 78%)`,
                bg:      `hsl(${h}, 50%, 96%)`,
                itemBg:  `linear-gradient(90deg, hsl(${h},40%,95%), hsl(${h},35%,96%))`,
                glow:    `hsla(${h}, 55%, 40%, 0.22)`,
                dimGlow: `hsla(${h}, 40%, 50%, 0.10)`,
              }
              return {
                accent:  `hsl(${h}, 70%, 65%)`,
                dim:     `hsl(${h}, 30%, 40%)`,
                border:  `hsl(${h}, 40%, 22%)`,
                bg:      `hsl(${h}, 30%, 7%)`,
                itemBg:  `linear-gradient(90deg, hsl(${h},25%,6%), hsl(${h},20%,7%))`,
                glow:    `hsla(${h}, 70%, 65%, 0.35)`,
                dimGlow: `hsla(${h}, 40%, 50%, 0.2)`,
              }
            }

            const statColor = lm ? "#7a6a55" : "#7090b0"
            const pacingGridColumns = getPacingGridColumns(units.length)

            return (
              <div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14 }}>
                  <button
                    style={{ ...s.importBtn, width: "auto", padding: "10px 28px", opacity: pacingSaving ? 0.6 : 1 }}
                    disabled={pacingSaving}
                    onClick={async () => {
                      setPacingSaving(true); setPacingSaved(false); setPacingError(null); setPacingNotice("")
                      try {
                        const student = students.find(s => s.id === pacingStudentId)
                        const res = await fetch("/api/admin/pacing-guide", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            studentId: pacingStudentId,
                            subjectId: pacingSubject,
                            entries: pacingEntries,
                          })
                        })
                        const data = await readJsonOrThrow(res, "Save pacing guide")
                        if (!res.ok) throw new Error(data.error || "Save failed")
                        setPacingSaved(true)
                        setPacingNotice(data.affectedFutureDraftCount > 0
                          ? `Saved pacing guide. ${data.affectedFutureDraftCount} future draft items still reflect the previous pacing and should be replanned.`
                          : "Saved pacing guide.")
                        await loadPacingGuideFor(pacingStudentId, pacingSubject)
                      } catch (err) {
                        setPacingError(err.message || "Failed to save")
                      } finally { setPacingSaving(false) }
                    }}
                  >{pacingSaving ? "Saving…" : "Save section order + skips"}</button>
                  {pacingHistory.length > 0 && (
                    <button
                      onClick={() => {
                        const prev = pacingHistory[pacingHistory.length - 1]
                        setPacingHistory(h => h.slice(0, -1))
                        setPacingEntries(prev?.entries || [])
                      }}
                      style={{
                        background: "none", border: "1px solid #2a3a4a",
                        color: "#7090b0", borderRadius: 5, padding: "10px 18px",
                        cursor: "pointer", fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
                      }}
                    >Undo</button>
                  )}
                  {pacingSaved && <span style={{ color: "#3dba6a", fontSize: 13, textShadow: lm ? "none" : "0 0 8px rgba(61,186,106,0.5)" }}>Saved</span>}
                  <span style={{ fontSize: 12, color: statColor, marginLeft: "auto" }}>
                    {pacingEntries.filter(e => !e.skipped).length} active · {pacingEntries.filter(e => e.skipped).length} skipped
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: pacingGridColumns, gap: 8, alignItems: "start", marginBottom: 18 }}>
                  {units.map((unit) => {
                    const c = unitColor(unit.code)
                    const isUnitDragging = pacingUnitDrag === unit.code
                    const isUnitDropTarget = pacingUnitDrop === unit.code
                    return (
                      <div key={unit.code}
                        onDragOver={e => { onUnitDragOver(e, unit.code); if (!pacingUnitDrag) e.preventDefault() }}
                        onDrop={e => pacingUnitDrag ? onUnitDrop(e, unit.code) : onDrop(e, unit.code)}
                        style={{
                          opacity: isUnitDragging ? 0.25 : 1,
                          outline: isUnitDropTarget ? `2px solid ${c.accent}` : "none",
                          outlineOffset: 2,
                          boxShadow: isUnitDropTarget ? `0 0 16px ${c.glow}` : "none",
                          borderRadius: 7,
                          width: "100%",
                          transition: "opacity 0.15s, box-shadow 0.15s",
                        }}
                      >
                        <div
                          draggable
                          onDragStart={e => onUnitDragStart(e, unit.code)}
                          onDragEnd={onUnitDragEnd}
                          style={{
                            padding: "5px 7px 4px",
                            background: c.bg,
                            border: `1px solid ${c.border}`,
                            borderRadius: 6,
                            cursor: "grab",
                            userSelect: "none",
                            width: "100%",
                          }}>
                          <div style={{ color: c.accent, fontSize: 9, fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.04em", textShadow: `0 0 6px ${c.glow}` }}>⠿ {unit.code}</div>
                          <div style={{ color: c.dim, fontSize: 8.5, lineHeight: 1.2, marginTop: 1 }}>{unit.name}</div>
                        </div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {unit.entries.map((entry, idx) => {
                            const boundary = getBoundary(unit.code)
                            const isDragging = dragUnit === unit.code && idx === dragFrom
                            const isSkipTarget = isDragging && pacingPendingSkip
                            const isPinned = pacingPinnedLo?.code === entry.code
                            const isLocked = !!entry.locked
                            const shift = getShift(unit.code, idx)
                            const pushX = isDragging ? 0 : (idx === boundary ? 5 : 0)
                            return (
                              <div
                                key={entry.code}
                                draggable={!isLocked}
                                onDragStart={e => {
                                  if (isLocked) return
                                  setPacingHoverLo(null)
                                  onDragStart(e, unit.code, idx)
                                }}
                                onDragEnd={onDragEnd}
                                onDragOver={e => onDragOver(e, unit.code, idx, e.currentTarget)}
                                onDrop={e => onDrop(e, unit.code)}
                                style={{
                                  display: "grid",
                                  gap: 4,
                                  padding: "7px 8px",
                                  background: isSkipTarget ? "linear-gradient(90deg,#1a0e00,#1f1200)" : isPinned ? (lm ? "#fdf5e8" : "#1e1608") : entry.skipped ? "#090909" : c.itemBg,
                                  border: `1px solid ${isSkipTarget ? "#4a2800" : isPinned ? "#c9a84c" : entry.skipped ? "#111" : c.border}`,
                                  borderRadius: 6,
                                  opacity: isDragging ? (isSkipTarget ? 0.6 : 0.15) : entry.skipped ? 0.3 : 1,
                                  cursor: isLocked ? "default" : "grab",
                                  boxShadow: isPinned ? `0 0 0 2px ${lm ? "rgba(201,168,76,0.4)" : "rgba(201,168,76,0.3)"}` : isSkipTarget ? "0 0 8px rgba(255,140,0,0.15)" : entry.skipped ? "none" : `0 1px 6px ${c.dimGlow}`,
                                  transform: `translateY(${shift}px) translateX(${pushX}px)`,
                                  transition: isDragging
                                    ? "opacity 0.1s, background 0.1s, border-color 0.1s"
                                    : "transform 0.18s cubic-bezier(0.34,1.56,0.64,1), opacity 0.15s",
                                  willChange: "transform",
                                  position: "relative",
                                  zIndex: isDragging ? 10 : 1,
                                  minHeight: 96,
                                }}
                              >
                                <div style={{
                                  color: isSkipTarget ? "#c88040" : entry.skipped ? "#2a3040" : c.dim,
                                  fontSize: 10,
                                  fontWeight: 600,
                                  lineHeight: 1.18,
                                }}>
                                  {entry.name}
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "end" }}>
                                  <div style={{ display: "grid", gap: 2 }}>
                                    <div style={{
                                      color: isSkipTarget ? "#ff9940" : entry.skipped ? "#2a3040" : c.accent,
                                      fontSize: 9,
                                      fontFamily: "monospace",
                                      fontWeight: 700,
                                      letterSpacing: "0.03em",
                                    }}>{entry.code}</div>
                                    {entry.sessionDate ? (
                                      <div style={{ fontSize: 8, color: isLocked ? "#c9a84c" : c.dim }}>
                                        {entry.sessionDate}
                                      </div>
                                    ) : null}
                                  </div>
                                  {isSkipTarget
                                    ? <span style={{ fontSize: 8, color: "#ff9940", fontWeight: 700 }}>{entry.skipped ? "IN →" : "SKIP →"}</span>
                                    : <button
                                        disabled={isLocked}
                                        onClick={() => mutateEntries(prev => prev.map(e => e.code === entry.code ? { ...e, skipped: !e.skipped } : e))}
                                        style={{
                                          background: "none",
                                          border: "none",
                                          color: isLocked ? "#7a6a55" : (entry.skipped ? "#2a6a3a" : c.dim),
                                          cursor: isLocked ? "default" : "pointer",
                                          fontSize: 10,
                                          padding: "0 1px",
                                          lineHeight: 1,
                                          alignSelf: "start",
                                        }}
                                        title={isLocked ? "Locked by historical session date" : (entry.skipped ? "Include" : "Skip")}
                                      >{entry.skipped ? "+" : "×"}</button>}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

        </div>}
        </div>}

        {activeAdminSection === "import" && importWorkspace === "context" && (() => {
          const sourceItems = contextMatches.length ? contextMatches : contextDraftItems.map((item) => ({
            draftRowId: item.id,
            title: item.title,
            questionPageId: item.questionPageId,
            assignedSessionDate: item.assignedSessionDate || "",
            questions: item.questions || [],
          }))
          const selectedDraftRowId = contextSelectedQuestionId.split("::")[0] || ""
          const selectedQuestionKey = contextSelectedQuestionId.split("::").slice(1).join("::") || ""
          const selectedDraftItem = sourceItems.find((item) => item.draftRowId === selectedDraftRowId) || sourceItems[0] || null
          const selectedQuestion = selectedDraftItem?.questions?.find((question) => question.key === selectedQuestionKey) || selectedDraftItem?.questions?.[0] || null
          const selectedQuestionMeta = selectedDraftItem && selectedQuestion ? {
            draftRowId: selectedDraftItem.draftRowId,
            title: selectedDraftItem.title,
            questionPageId: selectedDraftItem.questionPageId,
            questionKey: selectedQuestion.key,
            qhash: selectedQuestion.qhash,
          } : null
          const selectedContextIds = new Set(
            (selectedQuestion?.candidates || [])
              .flatMap((candidate) => candidate.contextBlockIds || [])
              .filter(Boolean)
          )

          return (
            <div id="draft-context" style={{ ...s.section, flex: 1, minWidth: 0, marginBottom: 0, paddingBottom: 0, borderBottom: "none" }}>
              <h2 style={s.sectionTitle}>Draft Context</h2>
              <p style={s.sub}>Upload the parent PDFs after import, match OCR context across multiple documents against the existing draft questions, then attach the chosen image back onto the real question page.</p>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                <button type="button" onClick={() => setImportWorkspace("regular")} style={{ ...s.secondaryBtn, ...(importWorkspace === "regular" ? { background: lm ? "#ead7aa" : "#3a3120", borderColor: lm ? "#d2b36a" : "#8a7440", color: lm ? "#4a3414" : "#f2dfaf" } : {}) }}>
                  Regular Import
                </button>
                <button type="button" onClick={() => setImportWorkspace("studio")} style={{ ...s.secondaryBtn, ...(importWorkspace === "studio" ? { background: lm ? "#ead7aa" : "#3a3120", borderColor: lm ? "#d2b36a" : "#8a7440", color: lm ? "#4a3414" : "#f2dfaf" } : {}) }}>
                  Import Studio
                </button>
                <button type="button" onClick={() => setImportWorkspace("context")} style={{ ...s.secondaryBtn, ...(importWorkspace === "context" ? { background: lm ? "#ead7aa" : "#3a3120", borderColor: lm ? "#d2b36a" : "#8a7440", color: lm ? "#4a3414" : "#f2dfaf" } : {}) }}>
                  Draft Context
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={s.sectionLabel}>Student</div>
                  <select style={s.select} value={contextStudent} onChange={(e) => setContextStudent(e.target.value)}>
                    <option value="">Select student</option>
                    {students.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={s.sectionLabel}>Subject</div>
                  <select style={s.select} value={contextSubject} onChange={(e) => setContextSubject(e.target.value)}>
                    <option value="">Select subject</option>
                    {getSubjectsForStudent(contextStudent).map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={s.sectionLabel}>Draft session date</div>
                  <input style={s.select} type="date" value={contextSessionDate} onChange={(e) => setContextSessionDate(e.target.value)} />
                </div>
              </div>

              <div style={{ ...s.uploadBox, padding: 24, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Add parent documents</div>
                <div style={{ fontSize: 12, color: "#555", margin: "4px 0 8px" }}>Upload 1 or more `.pdf` / `.docx` files that the imported draft questions came from.</div>
                <label style={{ ...s.connectBtn, display: "inline-block", cursor: "pointer" }}>
                  Choose files
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    hidden
                    multiple
                    onChange={(e) => setContextFiles(Array.from(e.target.files || []))}
                  />
                </label>
                {!!contextFiles.length && (
                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {contextFiles.map((item) => (
                      <div key={`${item.name}-${item.size}`} style={{ background: lm ? "#f3ead8" : "#1a1a1a", border: "1px solid #333", borderRadius: 999, padding: "6px 10px", fontSize: 12 }}>
                        {item.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                <button style={{ ...s.importBtn, opacity: contextStudent && contextSubject && contextFiles.length && !contextUploading ? 1 : 0.5 }} disabled={!contextStudent || !contextSubject || !contextFiles.length || contextUploading} onClick={handleContextOcrUploads}>
                  {contextUploading ? "Running OCR..." : "OCR Documents"}
                </button>
                <button style={{ ...s.secondaryBtn, opacity: contextStudent && contextSubject && contextSessionDate && !contextLoading ? 1 : 0.5 }} disabled={!contextStudent || !contextSubject || !contextSessionDate || contextLoading} onClick={() => loadDraftContextItems()}>
                  {contextLoading ? "Loading..." : "Reload Draft Questions"}
                </button>
                <button style={{ ...s.secondaryBtn, opacity: contextDocs.length && !contextMatching ? 1 : 0.5 }} disabled={!contextDocs.length || contextMatching} onClick={runDraftContextMatching}>
                  {contextMatching ? "Matching..." : "Match Questions"}
                </button>
              </div>

              {contextError && <div style={s.error}>❌ {contextError}</div>}
              {contextNotice && <div style={{ ...s.hint, marginBottom: 10 }}>{contextNotice}</div>}

              {!!contextDocs.length && (
                <div style={{ ...s.resultBox, marginBottom: 16 }}>
                  <div style={s.resultTitle}>OCR document set</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {contextDocs.map((doc) => (
                      <div key={doc.draftId} style={{ background: lm ? "#f7edd8" : "#1b1711", border: `1px solid ${lm ? "#d8bf84" : "#4d3b18"}`, borderRadius: 12, padding: "8px 10px", fontSize: 12 }}>
                        <div style={{ fontWeight: 700 }}>{doc.sourceLabel || doc.draftId}</div>
                        <div style={{ color: lm ? "#7a6a50" : "#948770" }}>
                          {doc.manifest?.counts?.pages || 0} page(s) · {doc.manifest?.counts?.blocks || 0} block(s)
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "320px minmax(0, 1fr)", gap: 18, alignItems: "start" }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ ...s.resultBox, maxHeight: "72vh", overflowY: "auto" }}>
                    <div style={s.resultTitle}>Draft questions for {contextSessionDate || "session"}</div>
                    {!sourceItems.length && <div style={s.hint}>Select a student, subject, and session date to load the existing draft questions.</div>}
                    {sourceItems.map((item) => (
                      <div key={item.draftRowId} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10, marginTop: 10 }}>
                        <div style={{ fontWeight: 700, color: lm ? "#4a3414" : "#f2dfaf", marginBottom: 6 }}>{item.title}</div>
                        <div style={{ display: "grid", gap: 6 }}>
                          {(item.questions || []).map((question, index) => {
                            const questionId = `${item.draftRowId}::${question.key}`
                            const isActive = questionId === contextSelectedQuestionId || (!contextSelectedQuestionId && item === selectedDraftItem && question === selectedQuestion)
                            return (
                              <button
                                key={questionId}
                                type="button"
                                onClick={() => setContextSelectedQuestionId(questionId)}
                                style={{
                                  textAlign: "left",
                                  borderRadius: 10,
                                  border: `1px solid ${isActive ? (lm ? "#c89332" : "#d2b36a") : "rgba(120,120,120,0.25)"}`,
                                  background: isActive ? (lm ? "#fff5df" : "#2b2212") : (lm ? "#ffffff" : "#111111"),
                                  color: lm ? "#3b2c18" : "#ece4d4",
                                  padding: "10px 12px",
                                  cursor: "pointer",
                                }}
                              >
                                <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 4 }}>Q{index + 1}{question.qhash ? ` · ${question.qhash}` : ""}</div>
                                <div style={{ fontSize: 12, lineHeight: 1.5 }}>{question.question || "Untitled question"}</div>
                                {question.attachment?.imageUrl && (
                                  <div style={{ fontSize: 11, color: lm ? "#8a6d20" : "#c9a84c", marginTop: 6 }}>Attached image saved</div>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ ...s.resultBox }}>
                    <div style={s.resultTitle}>Selected question</div>
                    {!selectedQuestion && <div style={s.hint}>Pick a draft question from the left rail.</div>}
                    {selectedQuestion && (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ color: lm ? "#4a3414" : "#f2dfaf", fontWeight: 700 }}>{selectedDraftItem?.title}</div>
                        <div style={{ fontSize: 13, lineHeight: 1.6 }}>{selectedQuestion.question}</div>
                        {selectedQuestion.answer && (
                          <div style={{ fontSize: 12, color: lm ? "#6d5b39" : "#b8b0a0" }}>Answer: {selectedQuestion.answer}</div>
                        )}
                        {selectedQuestion.attachment?.imageUrl && (
                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ fontSize: 12, color: lm ? "#8a6d20" : "#c9a84c" }}>Current attached image</div>
                            <img src={selectedQuestion.attachment.imageUrl} alt="Attached" style={{ width: "100%", maxWidth: 280, borderRadius: 10, border: "1px solid rgba(120,120,120,0.25)" }} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ ...s.resultBox }}>
                    <div style={s.resultTitle}>Candidate context windows</div>
                    {!selectedQuestion && <div style={s.hint}>Select a question to see OCR matches.</div>}
                    {selectedQuestion && !(selectedQuestion.candidates || []).length && (
                      <div style={s.hint}>No confident OCR candidates yet. You can still click an image block in the documents below to attach it manually.</div>
                    )}
                    <div style={{ display: "grid", gap: 10 }}>
                      {(selectedQuestion?.candidates || []).map((candidate, index) => {
                        const attachId = `${selectedQuestionMeta?.draftRowId || ""}::${selectedQuestionMeta?.questionKey || ""}`
                        return (
                          <div key={`${candidate.sourceDraftId}-${candidate.blockId}-${index}`} style={{ border: "1px solid rgba(120,120,120,0.25)", borderRadius: 12, padding: 12 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 6 }}>
                              <div style={{ fontWeight: 700 }}>{candidate.sourceLabel} · page {candidate.page}</div>
                              <div style={{ fontSize: 12, color: lm ? "#7a6a50" : "#948770" }}>score {Number(candidate.score || 0).toFixed(3)}</div>
                            </div>
                            <div style={{ fontSize: 12, color: lm ? "#6d5b39" : "#b8b0a0", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{candidate.contextText || candidate.excerpt}</div>
                            {!!candidate.imageUrls?.length && (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                                {candidate.imageUrls.slice(0, 3).map((url) => (
                                  <img key={url} src={url} alt="Candidate" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid rgba(120,120,120,0.25)" }} />
                                ))}
                              </div>
                            )}
                            <button
                              type="button"
                              style={{ ...s.secondaryBtn, marginTop: 10, opacity: selectedQuestionMeta && candidate.imageUrls?.length ? 1 : 0.5 }}
                              disabled={!selectedQuestionMeta || !candidate.imageUrls?.length || contextAttachingKey === attachId}
                              onClick={() => attachDraftContextCandidate(selectedQuestionMeta, candidate)}
                            >
                              {contextAttachingKey === attachId ? "Attaching..." : "Attach first image"}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {!!contextDocs.length && (
                    <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6 }}>
                      {contextDocs.map((doc) => {
                        const docPages = buildContentDraftPages(doc.blocks || [], doc.manifest || null)
                        return (
                          <div key={doc.draftId} style={{ minWidth: 360, width: 360, display: "grid", gap: 10 }}>
                            <div style={{ ...s.resultBox, marginBottom: 0 }}>
                              <div style={s.resultTitle}>{doc.sourceLabel || doc.draftId}</div>
                              <div style={{ fontSize: 12, color: lm ? "#6d5b39" : "#b8b0a0" }}>
                                Click any image block below to attach it manually to the selected question.
                              </div>
                            </div>
                            {docPages.map((page) => {
                              const pageWidth = Number(page.imageMeta?.width || 612)
                              const pageHeight = Number(page.imageMeta?.height || 792)
                              const pageAspect = `${pageWidth} / ${pageHeight}`
                              const pageLayout = buildContentPageRows(page.blocks)
                              const pageRows = pageLayout.rows
                              const virtualPageHeightPx = 760
                              const contentScale = pageLayout.totalBaseHeightPx > virtualPageHeightPx
                                ? virtualPageHeightPx / pageLayout.totalBaseHeightPx
                                : 1
                              return (
                                <div key={`${doc.draftId}-page-${page.page}`} style={{ background: lm ? "#ebe3d4" : "#0d0f14", border: lm ? "1px solid #d6ccb9" : "1px solid #262a34", borderRadius: 18, padding: 12 }}>
                                  <div style={{ fontSize: 12, marginBottom: 8, color: lm ? "#6d5b39" : "#b8b0a0" }}>Page {page.page}</div>
                                  <div style={{ background: "#fff", borderRadius: 12, position: "relative", aspectRatio: pageAspect, overflow: "hidden", padding: 12 }}>
                                    <div style={{
                                      position: "absolute",
                                      left: 12,
                                      top: 12,
                                      width: `calc((100% - 24px) / ${contentScale})`,
                                      display: "grid",
                                      gridTemplateRows: pageRows.map((row) => `${row.baseHeightPx}px`).join(" "),
                                      alignContent: "start",
                                      gap: pageLayout.gapPx,
                                      transform: `scale(${contentScale})`,
                                      transformOrigin: "top left",
                                    }}>
                                      {pageRows.map((row, rowIndex) => (
                                        <div key={`${doc.draftId}-page-${page.page}-row-${rowIndex}`} style={{ display: "block", minHeight: 0, width: "100%" }}>
                                          {row.blocks.map((block) => {
                                            const isHighlighted = selectedContextIds.has(block.id)
                                            const isImage = block.kind === "image"
                                            return (
                                              <div
                                                key={block.id}
                                                onClick={() => {
                                                  if (!isImage || !selectedQuestionMeta || !block.imageUrl) return
                                                  attachDraftContextCandidate(selectedQuestionMeta, {
                                                    sourceDraftId: doc.draftId,
                                                    sourceLabel: doc.sourceLabel || doc.draftId,
                                                    blockId: block.id,
                                                    contextBlockIds: [block.id],
                                                    contextText: "",
                                                    imageUrls: [block.imageUrl],
                                                  })
                                                }}
                                                style={{
                                                  width: "100%",
                                                  minHeight: 0,
                                                  height: "100%",
                                                  background: isImage ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.96)",
                                                  border: `2px solid ${isHighlighted ? "#c89332" : "rgba(17,24,39,0.12)"}`,
                                                  borderRadius: 4,
                                                  overflow: "hidden",
                                                  cursor: isImage && selectedQuestionMeta ? "pointer" : "default",
                                                }}
                                              >
                                                {isImage ? (
                                                  <img src={block.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
                                                ) : (
                                                  <div style={{ padding: 6, fontSize: 10, lineHeight: 1.45, color: "#222", whiteSpace: "pre-wrap" }}>
                                                    {block.text}
                                                  </div>
                                                )}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── Import + HW side by side ── */}
        {activeAdminSection === "import" && importWorkspace === "regular" && <div style={{ ...s.section, marginBottom: 0, paddingBottom: 0, borderBottom: "none" }}>
          <h2 style={s.sectionTitle}>Import</h2>
          <p style={s.sub}>Choose the import lane below. Regular Import processes assessment content into the subject database. Import Studio handles OCR and editable block cleanup for diagram-heavy files.</p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            <button type="button" onClick={() => setImportWorkspace("regular")} style={{ ...s.secondaryBtn, ...(importWorkspace === "regular" ? { background: lm ? "#ead7aa" : "#3a3120", borderColor: lm ? "#d2b36a" : "#8a7440", color: lm ? "#4a3414" : "#f2dfaf" } : {}) }}>
              Regular Import
            </button>
            <button type="button" onClick={() => setImportWorkspace("studio")} style={{ ...s.secondaryBtn, ...(importWorkspace === "studio" ? { background: lm ? "#ead7aa" : "#3a3120", borderColor: lm ? "#d2b36a" : "#8a7440", color: lm ? "#4a3414" : "#f2dfaf" } : {}) }}>
              Import Studio
            </button>
            <button type="button" onClick={() => setImportWorkspace("context")} style={{ ...s.secondaryBtn, ...(importWorkspace === "context" ? { background: lm ? "#ead7aa" : "#3a3120", borderColor: lm ? "#d2b36a" : "#8a7440", color: lm ? "#4a3414" : "#f2dfaf" } : {}) }}>
              Draft Context
            </button>
          </div>

          <div style={{ ...s.resultBox, marginBottom: 24 }}>
            <div style={s.resultItem}><strong>Regular Import:</strong> processes content directly into the subject database — no session anchoring.</div>
            <div style={s.resultItem}><strong>Import Studio:</strong> use OCR and editable block cleanup before import when the file is diagram-heavy or messy.</div>
          </div>

        <div style={{ display: "flex", gap: 0, alignItems: "flex-start", borderTop: `1px solid ${lm ? "#e0d4b8" : "#2a2416"}`, paddingTop: 24 }}>
        <div id="import" style={{ flex: 1, minWidth: 0 }}>
          <div style={s.importStudioHeader}>
            <div>
              <div style={s.sectionLabel}>Regular Assessment Import</div>
              <div style={s.importStudioSubcopy}>NotebookLM-tagged JSON or strict structure is the default. Claude is only backup when you explicitly ask for inference.</div>
            </div>
          </div>

          <div style={s.dropdownRow}>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Student</label>
              <select
                style={s.select}
                value={importStudent}
                onChange={e => {
                  const nextStudentId = e.target.value
                  setImportStudent(nextStudentId)
                  const nextSubjects = getSubjectsForStudent(nextStudentId)
                  if (!nextSubjects.some(sub => sub.id === importSubject)) setImportSubject("")
                }}
              >
                <option value="">Select student...</option>
                {students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Subject</label>
              <select style={s.select} value={importSubject} onChange={e => setImportSubject(e.target.value)}>
                <option value="">Select subject...</option>
                {getSubjectsForStudent(importStudent).map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>
            </div>
          </div>

          <div>
          {/* File upload */}
          <div style={s.uploadBox}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f && (f.name.endsWith(".pdf") || f.name.endsWith(".docx") || f.name.endsWith(".json"))) setFile(f)
            }}
          >
            {file ? (
              <div>
                <div style={s.fileName}>
                  {file.name.endsWith(".docx") ? "📝" : file.name.endsWith(".json") ? "🧩" : "📄"} {file.name}
                </div>
                <button style={s.clearBtn} onClick={() => setFile(null)}>Remove</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
                <div>Drag & drop a PDF, Word doc, or JSON file here, or</div>
                <div style={{ fontSize: 12, color: "#555", margin: "4px 0 8px" }}>.pdf · .docx · .json</div>
                <label style={s.browseBtn}>
                  Browse
                  <input type="file" accept=".pdf,.docx,.json" hidden onChange={e => setFile(e.target.files[0])} />
                </label>
              </div>
            )}
          </div>

          {/* Worksheet text paste */}
          <div style={{ marginTop: 16 }}>
            <label style={{ ...s.label, marginBottom: 6, display: "block" }}>
              Paste worksheet text <span style={{ color: "#555", fontWeight: 400 }}>(optional — use instead of or with a file)</span>
            </label>
            <textarea
              value={worksheetText}
              onChange={e => setWorksheetText(e.target.value)}
              placeholder="Paste raw worksheet text here..."
              style={{
                width: "100%", minHeight: 100, background: "#111", color: "#ccc",
                border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px",
                fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Sidecar JSON paste */}
          <div style={{ marginTop: 12 }}>
            <label style={{ ...s.label, marginBottom: 6, display: "block" }}>
              Sidecar JSON <span style={{ color: "#555", fontWeight: 400 }}>(optional — skips segmentation pass)</span>
            </label>
            <textarea
              value={sidecarJson}
              onChange={e => setSidecarJson(e.target.value)}
              placeholder={'[{"raw_text": "block 1 content..."}, {"raw_text": "block 2 content..."}]'}
              style={{
                width: "100%", minHeight: 70, background: "#111", color: "#ccc",
                border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px",
                fontSize: 12, fontFamily: "monospace", resize: "vertical", boxSizing: "border-box",
              }}
            />
          </div>

          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 14, color: lm ? "#5a4a30" : "#c7c7c7", fontSize: 13, lineHeight: 1.5 }}>
            <input
              type="checkbox"
              checked={importUseClaudeInference}
              onChange={(e) => setImportUseClaudeInference(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              Ask Claude to infer question types / taxonomy.
              <span style={{ display: "block", fontSize: 12, color: lm ? "#8a7a5a" : "#8b8b8b" }}>
                Leave this off for strict headers, NotebookLM JSON, or sidecar-driven imports.
              </span>
            </span>
          </label>

          {importUseClaudeInference && (
            <div style={{ marginTop: 12 }}>
              <label style={{ ...s.label, marginBottom: 6, display: "block" }}>
                Claude tagging depth
              </label>
              <select
                value={importTaggingMode}
                onChange={(e) => setImportTaggingMode(e.target.value)}
                style={s.select}
              >
                <option value="lo_only">LO only (fastest)</option>
                <option value="lo_and_reinforcement">LO + reinforcement</option>
                <option value="full">Full tagging</option>
              </select>
              <div style={{ fontSize: 12, color: lm ? "#8a7a5a" : "#8b8b8b", marginTop: 6, lineHeight: 1.5 }}>
                Use <strong>LO only</strong> for large QT-first banks when you need pacing/frontier scheduling first.
                Reinforcement and fuller enrichment can be done later.
              </div>
            </div>
          )}

          <div style={s.inlineDivider} />
          <button
            style={{ ...s.secondaryBtn, opacity: importStudent && importSubject && !regenLoading ? 1 : 0.5 }}
            disabled={!importStudent || !importSubject || regenLoading}
            onClick={handleRegenerateCache}
          >
            {regenLoading ? "Regenerating cache..." : "Regenerate MCQ cache for this student"}
          </button>

          {regenError && <div style={s.error}>❌ {regenError}</div>}
          {regenResult && (
            <div style={{ ...s.resultBox, marginTop: 12 }}>
              <div style={s.resultTitle}>✅ Cache regenerated</div>
              {regenResult.message && (
                <div style={{ marginBottom: 10, color: "#aaa" }}>{regenResult.message}</div>
              )}
              <div style={{ marginBottom: 6 }}><strong>Date:</strong> {regenResult.date}</div>
              <div style={{ marginBottom: 6 }}><strong>Question types:</strong> {regenResult.questionTypes}</div>
              <div style={{ marginBottom: 6 }}><strong>MCQs cached:</strong> {regenResult.cached}</div>
              <div><strong>Skipped:</strong> {regenResult.skipped}</div>
              {Array.isArray(regenResult.availableDates) && regenResult.availableDates.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={s.sectionLabel}>Available dates in Scores DB</div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {regenResult.availableDates.slice(0, 10).map(d => `${d.date} (${d.count})`).join(", ")}
                    {regenResult.availableDates.length > 10 ? " …" : ""}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>

          <div style={s.inlineDivider} />
          <button style={{ ...s.importBtn, opacity: canImport ? 1 : 0.5 }} disabled={!canImport} onClick={handleImport}>
            {importing ? "Importing..." : file ? `Import ${file.name.endsWith(".docx") ? "Document" : file.name.endsWith(".json") ? "JSON" : "PDF"}` : "Import"}
          </button>

          {scheduleConflictPending && (
            <div style={{ marginTop: 16, border: `1px solid ${scheduleConflictPending.majorMismatches?.length ? "#8b2020" : "#555"}`, borderRadius: 10, padding: 16, background: scheduleConflictPending.majorMismatches?.length ? "#1f0a0a" : "#1a1a1a" }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: scheduleConflictPending.majorMismatches?.length ? "#ff6060" : "#f0c060" }}>
                {scheduleConflictPending.majorMismatches?.length ? "🚨 Pacing mismatch detected" : "⚠️ Schedule conflict"}
              </div>
              {scheduleConflictPending.majorMismatches?.length > 0 && (
                <div style={{ marginBottom: 12, padding: 10, background: "#2a0a0a", borderRadius: 6 }}>
                  <div style={{ fontSize: 12, color: "#ff9090", fontWeight: 600, marginBottom: 6 }}>
                    {scheduleConflictPending.majorMismatches.length} date(s) have completely different standard codes than what was previously assigned — the pacing alignment has changed:
                  </div>
                  {scheduleConflictPending.majorMismatches.slice(0, 5).map((m, i) => (
                    <div key={i} style={{ fontSize: 11, color: "#cc8080", marginBottom: 4 }}>
                      <span style={{ color: "#aaa" }}>{m.date}</span> — existing: <span style={{ color: "#f08080" }}>{m.existingCodes.join(", ")}</span> → incoming: <span style={{ color: "#80c0f0" }}>{m.incomingCodes.join(", ")}</span>
                    </div>
                  ))}
                  {scheduleConflictPending.majorMismatches.length > 5 && <div style={{ fontSize: 11, color: "#888" }}>…and {scheduleConflictPending.majorMismatches.length - 5} more</div>}
                </div>
              )}
              <div style={{ fontSize: 12, color: "#999", marginBottom: 10 }}>
                {scheduleConflictPending.conflictingDates.slice(0, 6).map((item, i) => (
                  <div key={i}>• {item.date}: {item.count} existing type(s)</div>
                ))}
                {scheduleConflictPending.conflictingDates.length > 6 && <div>…and {scheduleConflictPending.conflictingDates.length - 6} more dates</div>}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button style={s.refreshBtn} onClick={() => scheduleConflictPending.resolve("skip")}>Skip (keep existing)</button>
                <button style={s.refreshBtn} onClick={() => scheduleConflictPending.resolve("replace")}>Replace</button>
                <button style={s.refreshBtn} onClick={() => scheduleConflictPending.resolve("rollover")}>Rollover</button>
                <button style={{ ...s.refreshBtn, color: "#ff8080" }} onClick={() => scheduleConflictPending.resolve(null)}>Cancel</button>
              </div>
            </div>
          )}
          {importError && <div style={s.error}>❌ {importError}</div>}
          {importResult && (
            <div style={s.resultBox}>
              <div style={s.resultTitle}>✅ Import Complete</div>
              <div style={{ marginBottom: 6 }}><strong>Subject:</strong> {importResult.subject}</div>
              {importResult.taggingMode && (
                <div style={{ marginBottom: 6 }}>
                  <strong>Tagging:</strong>{" "}
                  {importResult.taggingMode === "lo_only"
                    ? "LO only"
                    : importResult.taggingMode === "lo_and_reinforcement"
                      ? "LO + reinforcement"
                      : "Full"}
                </div>
              )}
              {importResult.created?.length > 0 && (
                <div>
                  <div style={s.sectionLabel}>Created ({importResult.created.length})</div>
                  {importResult.created.map((q, i) => <div key={i} style={s.resultItem}>✓ {q}</div>)}
                </div>
              )}
              {importResult.replaced?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={s.sectionLabel}>Replaced ({importResult.replaced.length})</div>
                  {importResult.replaced.map((item, i) => <div key={i} style={{ ...s.resultItem, color: "#c67f4a" }}>↺ {item.new} → {item.into}</div>)}
                </div>
              )}
              {importResult.skipped?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={s.sectionLabel}>Skipped — already exists ({importResult.skipped.length})</div>
                  {importResult.skipped.map((q, i) => <div key={i} style={{ ...s.resultItem, color: "#888" }}>— {typeof q === "string" ? q : (q?.new || q?.into || "Existing page")}</div>)}
                </div>
              )}
              {importResult.scoreRowsCreated?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={s.sectionLabel}>Score rows created ({importResult.scoreRowsCreated.length})</div>
                  {importResult.scoreRowsCreated.map((q, i) => <div key={i} style={{ ...s.resultItem, color: "#7ec8a0" }}>● {q}</div>)}
                </div>
              )}
              {importResult.nativeMcqCached > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={s.sectionLabel}>Native MCQs preserved</div>
                  <div style={s.resultItem}>{importResult.nativeMcqCached} authored MCQ(s) cached directly without Claude.</div>
                </div>
              )}
              <div style={{ marginTop: 16, borderTop: "1px solid #333", paddingTop: 14 }}>
                <div style={s.sectionLabel}>Post-import backfills</div>
                <div style={{ fontSize: 12, color: "#777", marginBottom: 10 }}>Run these if you imported with LO-only tagging and want to enrich the question bank retroactively.</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    style={{ ...s.refreshBtn, opacity: backfillStandardRunning ? 0.5 : 1 }}
                    disabled={backfillStandardRunning}
                    onClick={async () => {
                      setBackfillStandardRunning(true)
                      setBackfillStandardResult(null)
                      try {
                        const res = await fetch("/api/admin/backfill-standard-codes", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ studentId: importStudent, subjectId: importSubject }),
                        })
                        const data = await res.json()
                        setBackfillStandardResult(data.updated != null ? `✓ ${data.updated} rows updated` : (data.error || "Done"))
                      } catch (e) {
                        setBackfillStandardResult("Failed: " + e.message)
                      } finally {
                        setBackfillStandardRunning(false)
                      }
                    }}
                  >
                    {backfillStandardRunning ? "Running…" : "Backfill standard codes"}
                  </button>
                  <button
                    style={{ ...s.refreshBtn, opacity: backfillReinforcementRunning ? 0.5 : 1 }}
                    disabled={backfillReinforcementRunning}
                    onClick={async () => {
                      setBackfillReinforcementRunning(true)
                      setBackfillReinforcementResult(null)
                      try {
                        const res = await fetch("/api/admin/backfill-reinforcement", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ studentId: importStudent, subjectId: importSubject }),
                        })
                        const data = await res.json()
                        setBackfillReinforcementResult(data.updated != null ? `✓ ${data.updated} rows updated` : (data.error || "Done"))
                      } catch (e) {
                        setBackfillReinforcementResult("Failed: " + e.message)
                      } finally {
                        setBackfillReinforcementRunning(false)
                      }
                    }}
                  >
                    {backfillReinforcementRunning ? "Running…" : "Backfill reinforcement maps"}
                  </button>
                </div>
                {backfillStandardResult && <div style={{ fontSize: 12, color: "#7ec8a0", marginTop: 8 }}>{backfillStandardResult}</div>}
                {backfillReinforcementResult && <div style={{ fontSize: 12, color: "#7ec8a0", marginTop: 6 }}>{backfillReinforcementResult}</div>}
              </div>
            </div>
          )}
        </div>
        <div style={s.importDivider} />
        <div id="qb-import" style={{ flex: 1, minWidth: 0 }}>
          <div style={s.importStudioHeader}>
            <div>
              <div style={s.sectionLabel}>Question Bank Import</div>
              <div style={s.importStudioSubcopy}>Paste a schema v2.0 question bank JSON and select the target content bank. Safe to re-run — upserts by title + qhash.</div>
            </div>
          </div>
          <div style={s.dropdownRow}>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Content Bank</label>
              <select style={s.select} value={qbImportBankId} onChange={e => setQbImportBankId(e.target.value)}>
                <option value="">Select content bank...</option>
                {contentBanks.map(cb => <option key={cb.id} value={cb.id}>{cb.label || cb.key}</option>)}
              </select>
            </div>
          </div>
          <textarea
            style={{ ...s.problemInput, minHeight: 180, marginTop: 12, fontFamily: "monospace", fontSize: 11 }}
            placeholder='Paste question bank JSON here...'
            value={qbImportJson}
            onChange={e => { setQbImportJson(e.target.value); setQbImportResult(null); setQbImportError(null) }}
          />
          <button
            type="button"
            style={{ ...s.importBtn, marginTop: 10, opacity: qbImportBankId && qbImportJson.trim() && !qbImporting ? 1 : 0.5 }}
            disabled={!qbImportBankId || !qbImportJson.trim() || qbImporting}
            onClick={async () => {
              setQbImporting(true)
              setQbImportResult(null)
              setQbImportError(null)
              try {
                const res = await fetch("/api/admin/import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "import_question_bank", questionBankJson: qbImportJson.trim(), contentBankId: qbImportBankId }),
                })
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || "Import failed")
                setQbImportResult(data)
              } catch (e) {
                setQbImportError(e.message)
              } finally {
                setQbImporting(false)
              }
            }}
          >
            {qbImporting ? "Importing..." : "Import Question Bank"}
          </button>
          {qbImportError && <div style={{ ...s.error, marginTop: 10 }}>❌ {qbImportError}</div>}
          {qbImportResult && (
            <div style={{ ...s.resultBox, marginTop: 12 }}>
              <div style={s.resultTitle}>✅ Question Bank Import Complete</div>
              {qbImportResult.subject && <div style={s.resultItem}><strong>Subject:</strong> {qbImportResult.subject}</div>}
              {qbImportResult.source && <div style={s.resultItem}><strong>Source:</strong> {qbImportResult.source}</div>}
              <div style={s.resultItem}><strong>QTs:</strong> +{qbImportResult.qtCreated ?? 0} created, ~{qbImportResult.qtUpdated ?? 0} updated</div>
              <div style={s.resultItem}><strong>Questions:</strong> +{qbImportResult.qCreated ?? 0} created, ~{qbImportResult.qUpdated ?? 0} updated</div>
              {qbImportResult.sloMisses?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ ...s.sectionLabel, color: "#c67f4a" }}>SLO misses ({qbImportResult.sloMisses.length})</div>
                  {qbImportResult.sloMisses.map((m, i) => <div key={i} style={{ ...s.resultItem, color: "#c67f4a" }}>⚠ {m.code} — {m.context}</div>)}
                </div>
              )}
              {qbImportResult.sectionMisses?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ ...s.sectionLabel, color: "#c67f4a" }}>Section misses ({qbImportResult.sectionMisses.length})</div>
                  {qbImportResult.sectionMisses.map((m, i) => <div key={i} style={{ ...s.resultItem, color: "#c67f4a" }}>⚠ section_ref="{m.section_ref}" — {m.context}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
        <div style={s.importDivider} />
        <div id="homework-tools" style={{ flex: 1, minWidth: 0 }}>
          <div style={s.importStudioHeader}>
            <div>
              <div style={s.sectionLabel}>Homework Import + Assignment</div>
              <div style={s.importStudioSubcopy}>Use the same section to upload homework documents, inspect the active cycle, and add or remove question types.</div>
            </div>
          </div>

          <div style={s.dropdownRow}>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Student</label>
              <select
                style={s.select}
                value={hwStudent}
                onChange={e => {
                  const nextStudentId = e.target.value
                  setHwStudent(nextStudentId)
                  const nextSubjects = getSubjectsForStudent(nextStudentId)
                  if (!nextSubjects.some(sub => sub.id === hwSubject)) setHwSubject("")
                }}
              >
                <option value="">Select student...</option>
                {students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Subject</label>
              <select style={s.select} value={hwSubject} onChange={e => setHwSubject(e.target.value)}>
                <option value="">Select subject...</option>
                {getSubjectsForStudent(hwStudent).map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>
            </div>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Homework session date</label>
              <input
                type="date"
                value={hwSessionDate}
                onChange={e => setHwSessionDate(e.target.value)}
                style={s.select}
              />
            </div>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Question type resolution</label>
              <input
                type="number"
                min="0"
                max="20"
                value={hwResolution}
                onChange={e => setHwResolution(Math.max(0, parseInt(e.target.value || "0", 10) || 0))}
                style={s.select}
                placeholder="0 = keep full type"
              />
            </div>
          </div>
          <div style={{ color: "#888", fontSize: 12, marginTop: -4, marginBottom: 12 }}>
            Set to 2, 3, 4, etc. to split each imported question type into bundles of that many questions. Use 0 to keep the full type together.
          </div>

          {hwSubject && hwCycleInfo && (
            <div style={{ ...s.resultBox, marginBottom: 12 }}>
              <div style={s.resultTitle}>Current homework cycle</div>
              <div style={s.resultItem}>
                {hwCycleInfo.available
                  ? `Active for session ${hwCycleInfo.sessionDate} · cycle ${Number(hwCycleInfo.cycleIndex || 0) + 1}`
                  : "No active cycle right now"}
              </div>
              {hwCycleInfo.unlockAt && <div style={s.resultItem}>Unlocks: {formatDateTime(hwCycleInfo.unlockAt)}</div>}
              {hwCycleInfo.expireAt && <div style={s.resultItem}>Expires: {formatDateTime(hwCycleInfo.expireAt)}</div>}
              <div style={{ marginTop: 10 }}>
                <button
                  style={{ ...s.modeBtn, width: "auto", padding: "8px 12px", opacity: hwMutating || !hwCycleInfo.available ? 0.6 : 1 }}
                  disabled={hwMutating || !hwCycleInfo.available}
                  onClick={() => extendHomeworkAttemptByDay(null)}
                >
                  Extend current cycle +1 day
                </button>
              </div>
            </div>
          )}

          {hwSubject && hwAttempts.length > 0 && (
            <div style={{ ...s.resultBox, marginBottom: 12 }}>
              <div style={s.resultTitle}>Recent homework attempts</div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {hwAttempts.slice(0, 6).map((attempt) => (
                  <div key={attempt.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 10px", border: "1px solid #242424", borderRadius: 8, background: "#111" }}>
                    <div>
                      <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>
                        {attempt.sessionDate || "No session date"} · {attempt.questionCount || 0} questions
                      </div>
                      <div style={{ color: "#888", fontSize: 12 }}>
                        {attempt.status || "Assigned"}
                        {attempt.unlockAt ? ` · unlock ${formatDateTime(attempt.unlockAt)}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                      <div style={{ color: "#c9a84c", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                        {attempt.score != null && attempt.total != null ? `${attempt.score}/${attempt.total}` : "pending"}
                      </div>
                      <button
                        style={{ ...s.modeBtn, width: "auto", padding: "6px 10px", opacity: hwMutating ? 0.6 : 1 }}
                        disabled={hwMutating}
                        onClick={() => extendHomeworkAttemptByDay(attempt)}
                      >
                        Extend +1 day
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Homework doc upload */}
          <div
            style={{ ...s.uploadBox, padding: 24, marginBottom: 12 }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const f = e.dataTransfer.files[0]
              if (f && (f.name.endsWith(".pdf") || f.name.endsWith(".docx"))) setHwDocFile(f)
            }}
          >
            {hwDocFile ? (
              <div>
                <div style={s.fileName}>
                  {hwDocFile.name.endsWith(".docx") ? "📝" : "📄"} {hwDocFile.name}
                </div>
                <button style={s.clearBtn} onClick={() => setHwDocFile(null)}>Remove</button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📚</div>
                <div>Drag & drop a homework PDF/Word doc here, or</div>
                <div style={{ fontSize: 12, color: "#555", margin: "4px 0 8px" }}>.pdf · .docx</div>
                <label style={s.browseBtn}>
                  Browse
                  <input type="file" accept=".pdf,.docx" hidden onChange={e => setHwDocFile(e.target.files[0])} />
                </label>
              </div>
            )}
          </div>

          <button
            style={{ ...s.importBtn, opacity: hwDocFile && hwStudent && hwSubject && !hwDocUploading ? 1 : 0.5, marginBottom: 12 }}
            disabled={!hwDocFile || !hwStudent || !hwSubject || hwDocUploading}
            onClick={uploadHomeworkDoc}
          >
            {hwDocUploading ? "Uploading homework..." : "Upload homework doc"}
          </button>

          <div style={s.inlineDivider} />
          {hwDocError && <div style={s.error}>❌ {hwDocError}</div>}
          {hwDocResult && (
            <div style={{ ...s.resultBox, marginTop: 12, marginBottom: 12 }}>
              <div style={s.resultTitle}>✅ Homework uploaded</div>
              <div style={s.resultItem}>Total questions parsed: {hwDocResult.totalQuestions || 0}</div>
              <div style={s.resultItem}>Question type resolution used: {hwDocResult.questionTypeResolution || 0}</div>
              <div style={s.resultItem}>Extracted question types: {hwDocResult.extractedQuestionTypes || 0}</div>
              <div style={s.resultItem}>Resolved question type bundles: {hwDocResult.resolvedQuestionTypes || 0}</div>
              <div style={s.resultItem}>New question types created: {(hwDocResult.created || []).length}</div>
              <div style={s.resultItem}>Question types appended: {(hwDocResult.appended || []).length}</div>
              <div style={s.resultItem}>Score rows created: {(hwDocResult.scoreRowsCreated || []).length}</div>
              <div style={s.resultItem}>Existing score rows tagged for homework: {(hwDocResult.scoreRowsTagged || []).length}</div>
              {(hwDocResult.scoreRowsTagged || []).length > 0 && (
                <div style={{ ...s.resultItem, color: "#7ec8a0", marginTop: 6 }}>
                  Existing question types were reused and linked into this homework batch.
                </div>
              )}
            </div>
          )}

          {hwStudent && hwSubject && (
            <input
              placeholder="Search question types..."
              value={hwSearch}
              onChange={e => setHwSearch(e.target.value)}
              style={{ ...s.select, marginBottom: 12, cursor: "text" }}
            />
          )}

          <div style={s.inlineDivider} />
          {hwLoading && <div style={s.hint}>Loading question types…</div>}
          {hwError && <div style={s.error}>❌ {hwError}</div>}
          {hwResult && <div style={{ ...s.resultBox, marginTop: 12 }}><div style={s.resultTitle}>✅ {hwResult}</div></div>}

          {hwStudent && hwSubject && !hwLoading && hwQuestions.length > 0 && (
            <div style={{ background: "#0d0d0d", border: "1px solid #222", borderRadius: 8, padding: 12, maxHeight: 260, overflowY: "auto", marginBottom: 12 }}>
              {hwQuestions
                .filter(q => !hwSearch || (q.title || "").toLowerCase().includes(hwSearch.toLowerCase()))
                .sort((a, b) => ((b.hwSourceKind === "admin_hw") - (a.hwSourceKind === "admin_hw")) || (b.weaknessScore - a.weaknessScore) || (a.title || "").localeCompare(b.title || ""))
                .slice(0, 120)
                .map(q => (
                  <label key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #1a1a1a" }}>
                    <input
                      type="checkbox"
                      checked={!!hwSelected[q.id]}
                      onChange={(e) => setHwSelected(prev => ({ ...prev, [q.id]: e.target.checked }))}
                    />
                    <span style={{ color: "#ccc", fontSize: 13, flex: 1 }}>{q.title}</span>
                    {q.hwSourceKind === "admin_hw" && <span style={{ fontSize: 11, color: "#c9a84c" }}>admin</span>}
                    {!q.scoreRowId && <span style={{ fontSize: 11, color: "#666" }}>new</span>}
                    <span style={{ fontSize: 11, color: "#777", fontFamily: "'DM Mono', monospace" }}>{(q.weaknessScore || 0).toFixed(1)}</span>
                  </label>
                ))}
              <div style={{ fontSize: 11, color: "#555", paddingTop: 8 }}>
                Selecting a row marked "new" will create a Scores row and tag it as admin homework.
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button
              style={{ ...s.modeBtn, flex: 1, opacity: hwMutating ? 0.6 : 1, borderColor: "#3a3a3a" }}
              disabled={hwMutating}
              onClick={() => mutateHomework("add")}
            >Add to homework</button>
            <button
              style={{ ...s.modeBtn, flex: 1, opacity: hwMutating ? 0.6 : 1 }}
              disabled={hwMutating}
              onClick={() => mutateHomework("remove")}
            >Remove</button>
          </div>
        </div>
        </div>
        </div>}

        {/* ── Calendar & Session Planning (inline in import) ── */}
        {activeAdminSection === "import" && renderCalendarPlanningSection({ inline: true })}

        {activeAdminSection === "calendar" && renderCalendarPlanningSection()}

        {/* ── Rescheduling ── */}
        {activeAdminSection === "reschedule" && <div id="reschedule" style={s.section}>
          <h2 style={s.sectionTitle}>Reschedule Sessions</h2>
          <p style={s.sub}>Choose the student and subject for rescheduling here.</p>

          <div style={s.dropdownRow}>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Student</label>
              <select
                style={s.select}
                value={reschedStudent}
                onChange={e => {
                  const nextStudentId = e.target.value
                  setReschedStudent(nextStudentId)
                  const nextSubjects = getSubjectsForStudent(nextStudentId)
                  if (!nextSubjects.some(sub => sub.id === reschedSubject)) setReschedSubject("")
                }}
              >
                <option value="">Select student...</option>
                {students.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
              </select>
            </div>
            <div style={s.dropdownGroup}>
              <label style={s.label}>Subject</label>
              <select style={s.select} value={reschedSubject} onChange={e => setReschedSubject(e.target.value)}>
                <option value="">Select subject...</option>
                {getSubjectsForStudent(reschedStudent).map(sub => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
              </select>
            </div>
          </div>

          {/* Scheduled dates summary */}
          {loadingDates && <div style={s.hint}>Loading scheduled dates...</div>}
          {scheduledDates.length > 0 && (
            <div style={s.dateList}>
              <div style={s.sectionLabel}>Scheduled dates</div>
              {scheduledDates.map((d, i) => (
                <div key={i} style={s.dateRow}>
                  <span style={s.dateChip}>{d.date}</span>
                  <span style={s.dateCount}>{d.rows.length} question{d.rows.length !== 1 ? "s" : ""}</span>
                  <span style={s.dateNames}>{d.rows.map(r => r.name).join(", ")}</span>
                </div>
              ))}
            </div>
          )}
          {reschedStudent && reschedSubject && !loadingDates && scheduledDates.length === 0 && (
            <div style={s.hint}>No scheduled dates found.</div>
          )}

          {/* Mode toggle */}
          {scheduledDates.length > 0 && (
            <>
              <div style={s.modeToggle}>
                <button
                  style={{ ...s.modeBtn, ...(reschedMode === "move" ? s.modeBtnActive : {}) }}
                  onClick={() => setReschedMode("move")}
                >Move a date</button>
                <button
                  style={{ ...s.modeBtn, ...(reschedMode === "shift" ? s.modeBtnActive : {}) }}
                  onClick={() => setReschedMode("shift")}
                >Bulk shift</button>
              </div>

              {reschedMode === "move" && (
                <div style={s.dropdownRow}>
                  <div style={s.dropdownGroup}>
                    <label style={s.label}>From date</label>
                    <select style={s.select} value={fromDate} onChange={e => setFromDate(e.target.value)}>
                      <option value="">Select date...</option>
                      {scheduledDates.map((d, i) => (
                        <option key={i} value={d.date}>{d.date} ({d.rows.length} questions)</option>
                      ))}
                    </select>
                  </div>
                  <div style={s.dropdownGroup}>
                    <label style={s.label}>To date</label>
                    <input type="date" style={s.select} value={toDate} onChange={e => setToDate(e.target.value)} />
                  </div>
                </div>
              )}

              {reschedMode === "shift" && (
                <div style={{ marginBottom: 24 }}>
                  <label style={s.label}>Shift all future dates by (days)</label>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {[7, 14, -7].map(d => (
                      <button
                        key={d}
                        style={{ ...s.suggestionBtn, ...(shiftDays === d ? s.suggestionBtnActive : {}) }}
                        onClick={() => setShiftDays(d)}
                      >{d > 0 ? `+${d}` : d} days</button>
                    ))}
                    <input
                      type="number"
                      style={{ ...s.select, width: 80 }}
                      value={shiftDays}
                      onChange={e => setShiftDays(parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
              )}

              <button
                style={{ ...s.importBtn, opacity: canReschedule ? 1 : 0.5 }}
                disabled={!canReschedule}
                onClick={handleReschedule}
              >
                {rescheduling ? "Rescheduling..." : reschedMode === "move" ? "Move Date" : `Shift All by ${shiftDays} Days`}
              </button>

              {reschedError && <div style={s.error}>❌ {reschedError}</div>}
              {reschedResult && <div style={{ ...s.resultBox, marginTop: 16 }}>
                <div style={s.resultTitle}>✅ {reschedResult}</div>
              </div>}
            </>
          )}
        </div>}
        {endClassOpen && (
          <div style={s.modalBackdrop}>
            <div style={s.modalCard}>
              <div style={s.sectionLabel}>Tutor Control</div>
              <h2 style={{ ...s.sectionTitle, marginBottom: 10 }}>End class for {focusStudent?.name || "student"}</h2>
              <p style={{ ...s.sub, marginBottom: 14 }}>
                Keep only the topics that were actually covered for {subjects.find(sub => sub.id === endClassSubjectId)?.name || "this subject"} on {endClassSessionDate}.
                Unticked topics move to the next estimated class slot, and the earliest pushed session rolls one slot further forward.
              </p>
              <div style={{ display: "grid", gap: 10 }}>
                {endClassTopics.map((topic, idx) => (
                  <label key={`${topic.id}-${idx}`} style={s.modalTopicRow}>
                    <input
                      type="checkbox"
                      checked={!!endClassSelection[topic.id]}
                      onChange={e => setEndClassSelection(prev => ({ ...prev, [topic.id]: e.target.checked }))}
                    />
                    <span>{topic.title}</span>
                  </label>
                ))}
              </div>
              {endClassError && <div style={s.error}>{endClassError}</div>}
              <div style={s.modalActionRow}>
                <button style={s.modeBtn} disabled={endClassBusy} onClick={() => setEndClassOpen(false)}>Cancel</button>
                <button style={s.secondaryBtnInline} disabled={endClassBusy} onClick={() => handleEndClass(false)}>
                  {endClassBusy ? "Saving..." : "End Class"}
                </button>
                <button style={s.importBtnInline} disabled={endClassBusy} onClick={() => handleEndClass(true)}>
                  {endClassBusy ? "Saving..." : "End + Preview Exit"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

const sBase = {
  page: { minHeight: "100vh", background: "#0a0a0a", display: "block", padding: 16 },
  sidebar: { width: 300, minWidth: 260, background: "#101010", border: "1px solid #1f1f1f", borderRadius: 4, padding: 16, position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto", flex: "1 1 260px" },
  brand: { color: "#f2f2f2", fontSize: 21, fontWeight: 700, marginBottom: 18, fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "0.02em" },
  sidebarSectionTitle: { color: "#777", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, marginTop: 10 },
  sidebarNav: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 },
  sidebarNavBtn: { background: "#161616", border: "1px solid #272727", borderRadius: 3, padding: "10px 12px", color: "#eee", textAlign: "left", cursor: "pointer" },
  sidebarNavBtnActive: { background: "#1f1a0d", border: "1px solid #c9a84c", color: "#f0d58e" },
  sidebarNavLabel: { fontSize: 13, fontWeight: 600, marginBottom: 2 },
  sidebarNavSub: { fontSize: 11, color: "#888" },
  sidebarInfoCard: { background: "#121212", border: "1px solid #262626", borderRadius: 3, padding: 12 },
  sidebarInfoRow: { display: "flex", alignItems: "center", justifyContent: "space-between", color: "#d5d0c5", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #1f1f1f" },
  sidebarInfoMeta: { color: "#8c8677", fontSize: 12, lineHeight: 1.5 },
  adminTabs: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18, paddingBottom: 14, borderBottom: "1px solid #1d1d1d" },
  adminTab: { background: "#141414", border: "1px solid #2a2a2a", color: "#bcbcbc", borderRadius: 999, padding: "9px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.03em", cursor: "pointer" },
  adminTabActive: { background: "#1f1a0d", border: "1px solid #c9a84c", color: "#f0d58e" },
  studentList: { display: "flex", flexDirection: "column", gap: 6 },
  studentBtn: { background: "#141414", border: "1px solid #272727", color: "#d6d6d6", borderRadius: 8, padding: "8px 10px", textAlign: "left", fontSize: 13, cursor: "pointer" },
  studentBtnActive: { background: "#1f1a0d", border: "1px solid #c9a84c", color: "#f0d58e" },
  main: { flex: "999 1 700px", minWidth: 0, background: "#111", border: "1px solid #222", borderRadius: 4, padding: 20 },
  mainFull: { minWidth: 0, background: "#111", border: "1px solid #222", borderRadius: 4, padding: 20 },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  title: { fontSize: 32, fontWeight: 700, color: "#fff", marginBottom: 8, fontFamily: "Georgia, 'Times New Roman', serif", letterSpacing: "0.01em" },
  heroSub: { color: "#8a8a8a", fontSize: 14, margin: 0, maxWidth: 620, lineHeight: 1.5 },
  primaryNavBar: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14, padding: "0 0 14px", borderBottom: "1px solid #1d1d1d" },
  primaryNavBtn: { background: "#151515", border: "1px solid #272727", color: "#bdb6a9", borderRadius: 2, padding: "9px 14px", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer" },
  primaryNavBtnActive: { background: "#1f1a0d", border: "1px solid #c9a84c", color: "#f0d58e" },
  studentContextBar: { display: "grid", gap: 12, marginBottom: 18, paddingBottom: 16, borderBottom: "1px solid #1d1d1d" },
  studentContextHeader: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" },
  studentContextTitle: { color: "#f0ece4", fontSize: 18, fontWeight: 700, fontFamily: "Georgia, 'Times New Roman', serif" },
  studentContextMeta: { color: "#8f887b", fontSize: 12 },
  studentContextControls: { display: "grid", gridTemplateColumns: "minmax(220px, 280px) minmax(260px, 1fr) auto", gap: 12, alignItems: "end" },
  studentSummaryCard: { background: "#121212", border: "1px solid #262626", borderRadius: 3, padding: "10px 12px", minHeight: 44 },
  studentSummaryTitle: { color: "#f1eee9", fontSize: 14, fontWeight: 700, marginBottom: 4 },
  studentSummaryMeta: { color: "#938c80", fontSize: 12, lineHeight: 1.45 },
  studentContextActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  studentSubjectScroller: { display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 },
  studentSubjectCard: { minWidth: 240, maxWidth: 280, background: "#121212", border: "1px solid #262626", borderRadius: 3, padding: 12, display: "grid", gap: 8 },
  studentSubjectTitle: { color: "#f5f1e8", fontSize: 14, fontWeight: 700 },
  studentSubjectMeta: { color: "#8c8579", fontSize: 12, lineHeight: 1.45, minHeight: 32 },
  studentSubjectActionRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  contextMiniBtn: { background: "#191919", border: "1px solid #333", color: "#d8d2c5", borderRadius: 2, padding: "6px 10px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", cursor: "pointer" },
  studentContextEmpty: { minWidth: 320, color: "#8e877b", border: "1px dashed #2d2d2d", borderRadius: 3, padding: 14 },
  metricsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 },
  metricCard: { background: "#0f0f0f", border: "1px solid #262626", borderRadius: 10, padding: 12 },
  metricLabel: { color: "#8a8a8a", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  metricValue: { color: "#f1f1f1", fontSize: 20, fontWeight: 700 },
  insightsRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 20 },
  insightCard: { background: "#0f0f0f", border: "1px solid #262626", borderRadius: 3, padding: 12 },
  insightTitle: { color: "#fff", fontSize: 14, fontWeight: 600, marginBottom: 10 },
  tomorrowPrepGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 },
  tomorrowPrepCard: { background: "#121212", border: "1px solid #2a2a2a", borderRadius: 3, padding: 14 },
  tomorrowPrepHeader: { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 12, flexWrap: "wrap" },
  tomorrowPrepHeaderRight: { display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },
  tomorrowPrepTitle: { color: "#f4f4f4", fontSize: 16, fontWeight: 700 },
  tomorrowPrepMeta: { color: "#969696", fontSize: 12, marginTop: 4 },
  tomorrowPrepStatus: { display: "inline-flex", alignItems: "center", borderRadius: 2, padding: "5px 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", border: "1px solid transparent" },
  tomorrowPrepStatusReady: { background: "#132518", borderColor: "#2f6b3f", color: "#9ee2a8" },
  tomorrowPrepStatusOpen: { background: "#152133", borderColor: "#315b92", color: "#a9ccff" },
  tomorrowPrepStatusPending: { background: "#231a10", borderColor: "#6b5423", color: "#e3c07a" },
  tomorrowPrepFacts: { display: "grid", gap: 8, marginBottom: 12 },
  tomorrowPrepActions: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  tomorrowPrepLink: { color: "#c9a84c", fontSize: 12, textDecoration: "none", fontWeight: 600 },
  queueZoomBtn: { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 28, padding: "5px 10px", border: "1px solid #5b6f98", background: "#172235", color: "#c8daf7", textDecoration: "none", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: 2 },
  subjectDividerTitle: { color: "#9a9a9a", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7, marginTop: 8, marginBottom: 6 },
  weakRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #1c1c1c" },
  weakTopic: { color: "#ccc", fontSize: 12, paddingRight: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  weakScore: { color: "#f0d58e", fontFamily: "'DM Mono', monospace", fontSize: 12 },
  previewSummary: { display: "grid", gap: 8, marginBottom: 8 },
  previewLabel: { color: "#888", fontSize: 11, display: "inline-block", minWidth: 72, textTransform: "uppercase", letterSpacing: 0.5 },
  previewValue: { color: "#eee", fontSize: 13 },
  subjectRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #1c1c1c", color: "#ccc", fontSize: 12 },
  subjectMeta: { fontSize: 11, color: "#8a8a8a" },
  toolsWrap: { borderTop: "1px solid #1d1d1d", paddingTop: 18 },
  reviewWorkspace: {
    display: "flex",
    alignItems: "stretch",
    gap: 14,
    minHeight: 420,
    position: "relative",
    overflow: "hidden",
  },
  reviewMapWrap: {
    flex: "1 1 100%",
    minWidth: 0,
    transition: "flex-basis 340ms ease-in-out, max-width 340ms ease-in-out",
  },
  reviewMapWrapCompressed: {
    flex: "0 0 48%",
    maxWidth: "48%",
  },
  reviewBoard: {
    display: "grid",
    gridTemplateColumns: "minmax(156px, 0.9fr) minmax(320px, 2fr) minmax(164px, 0.95fr)",
    columnGap: 20,
    rowGap: 10,
    alignItems: "stretch",
    justifyContent: "space-between",
    position: "relative",
    maxWidth: "100%",
    overflow: "hidden",
    padding: "4px 0 8px",
    transition: "transform 320ms ease-in-out, opacity 280ms ease-in-out",
  },
  reviewSvgOverlay: { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 },
  reviewPanel: { background: "#0f0f0f", border: "1px solid #262626", borderRadius: 3, padding: 12, minHeight: 240, position: "relative", zIndex: 2 },
  reviewPanelCompact: { padding: 10 },
  reviewPanelWide: { padding: 12 },
  reviewItemBtn: { width: "100%", background: "#141414", border: "1px solid #282828", color: "#ddd", borderRadius: 2, padding: "10px", textAlign: "left", marginBottom: 8, cursor: "pointer" },
  reviewItemBtnCompact: { padding: "8px 9px" },
  reviewItemBtnLinked: { border: "1px solid #2f5d4f", background: "#10261f", color: "#b7e8d6" },
  reviewItemBtnActive: { border: "1px solid #c9a84c", background: "#1c170c", color: "#f2dfaf" },
  reviewPagination: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, marginBottom: 8 },
  reviewPageBtn: { minWidth: 28, height: 28, borderRadius: 6, border: "1px solid #2f2f2f", background: "#141414", color: "#b8b8b8", fontSize: 12, cursor: "pointer" },
  reviewPageBtnActive: { border: "1px solid #4c6ca8", background: "#172233", color: "#9ec4ff" },
  reviewMeta: { color: "#7f7f7f", fontSize: 11, marginTop: 4 },
  problemCard: { border: "1px solid #282828", background: "#131313", borderRadius: 2, padding: 10, marginBottom: 8, position: "relative", zIndex: 2, cursor: "pointer" },
  problemCardCompact: { padding: 8, marginBottom: 7 },
  problemQ: { color: "#dfdfdf", fontSize: 13, lineHeight: 1.4, marginBottom: 6 },
  problemA: { color: "#9b9b9b", fontSize: 12, lineHeight: 1.35, marginBottom: 8 },
  problemEditorLabel: { color: "#9ba2b0", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 4, marginTop: 6 },
  problemInput: { width: "100%", background: "#101419", border: "1px solid #2a3240", color: "#dfe6f5", borderRadius: 7, padding: "8px 10px", fontSize: 12, lineHeight: 1.4, marginBottom: 6 },
  problemImgPreview: { width: "100%", maxHeight: 160, objectFit: "contain", borderRadius: 8, border: "1px solid #2d3440", background: "#0b0f15" },
  problemImageError: { marginTop: 6, color: "#ff9d9d", fontSize: 11 },
  problemPromptBox: { background: "#0e1726", border: "1px solid #2f476f", color: "#c7dbff", borderRadius: 8, padding: "8px 10px", fontSize: 12, lineHeight: 1.45, marginBottom: 8 },
  problemFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  problemBtnRow: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 8 },
  problemActionBtn: { background: "#141b26", border: "1px solid #314763", color: "#a7c4f0", borderRadius: 8, padding: "6px 8px", fontSize: 11, cursor: "pointer" },
  problemCollapseBtn: { background: "#101419", border: "1px solid #2d3748", color: "#9aa8bf", borderRadius: 7, padding: "5px 10px", fontSize: 11, cursor: "pointer" },
  problemSvgPreviewWrap: { marginTop: 8, border: "1px solid #2d3f5f", borderRadius: 8, padding: 8, background: "#0d121a" },
  problemSvgEditor: { width: "100%", background: "#0b1018", border: "1px solid #314763", color: "#b9cff5", borderRadius: 7, padding: "8px 10px", fontSize: 11, lineHeight: 1.35, marginBottom: 8, fontFamily: "'DM Mono', monospace" },
  problemSvgPreview: { width: "100%", minHeight: 120, background: "#fff", borderRadius: 6, overflow: "auto", padding: 8 },
  excalWrap: { height: 360, borderRadius: 8, overflow: "hidden", border: "1px solid #2d3440", background: "#fff", marginTop: 8 },
  reviewEditorPane: {
    flex: "0 0 0%",
    maxWidth: 0,
    opacity: 0,
    border: "1px solid transparent",
    borderRadius: 10,
    background: "#0f0f0f",
    overflow: "hidden",
    pointerEvents: "none",
    transform: "translateX(12px)",
    transition: "flex-basis 340ms ease-in-out, max-width 340ms ease-in-out, opacity 260ms ease-in-out, transform 340ms ease-in-out, border-color 280ms ease-in-out",
    position: "relative",
    zIndex: 3,
  },
  reviewEditorPaneOpen: {
    flex: "0 0 52%",
    maxWidth: "52%",
    opacity: 1,
    border: "1px solid #2b3240",
    pointerEvents: "auto",
    transform: "translateX(0)",
  },
  reviewEditorInner: { padding: 12 },
  reviewEditorEmpty: { padding: 12 },
  importColumns: { display: "grid", gridTemplateColumns: "1fr 1px 1fr 1px 1fr", gap: 14, alignItems: "start" },
  importCol: { minWidth: 0 },
  importDivider: { width: 1, background: "#262626", minHeight: 140, alignSelf: "stretch" },
  inlineDivider: { borderTop: "1px solid #232323", margin: "14px 0 16px" },
  section: { marginBottom: 40, paddingBottom: 40, borderBottom: "1px solid #1a1a1a" },
  sectionTitle: { fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 8, fontFamily: "Georgia, 'Times New Roman', serif" },
  sub: { color: "#888", marginBottom: 20, lineHeight: 1.6, fontSize: 14 },
  importStudioHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, padding: "0 0 12px", marginBottom: 10, borderBottom: "1px solid #232323" },
  importStudioSubcopy: { color: "#7c7c7c", fontSize: 13, lineHeight: 1.55, maxWidth: 700 },
  center: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#fff" },
  calendarRow: { display: "flex", alignItems: "center", gap: 12 },
  calendarBoardsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 16, marginTop: 18 },
  calendarBoardCol: { minWidth: 0 },
  calendarBoardContext: { display: "grid", gap: 6, marginBottom: 8 },
  calendarPlaceholder: { marginTop: 16, border: "1px dashed #303030", borderRadius: 3, minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: 18, color: "#7d7a74", textAlign: "center", fontSize: 13, background: "#0d0d0d" },
  statusDot: { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  statusText: { color: "#aaa", fontSize: 14, flex: 1 },
  connectBtn: { background: "#222", border: "1px solid #333", color: "#ccc", borderRadius: 2, padding: "8px 16px", fontSize: 14, cursor: "pointer", textDecoration: "none" },
  dropdownRow: { display: "flex", gap: 16, marginBottom: 24 },
  dropdownGroup: { flex: 1, display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, color: "#aaa", fontWeight: 500 },
  select: { background: "#1a1a1a", border: "1px solid #333", color: "#fff", borderRadius: 2, padding: "10px 12px", fontSize: 14, cursor: "pointer", width: "100%" },
  manualPrompt: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10, padding: "8px 0" },
  manualBtn: { background: "#1a1a1a", border: "1px dashed #444", color: "#888", borderRadius: 2, padding: "6px 14px", fontSize: 13, cursor: "pointer" },
  manualBtnInline: { fontSize: 11, padding: "4px 10px", border: "1px dashed #333", color: "#555" },
  inferredBtn: { borderColor: "#1a2a3a", color: "#7ec8f0", background: "#0d1a22" },
  inferredBtnActive: { background: "#0d1e2e", border: "1px solid #3a8abf", color: "#a8dff5" },
  chipGroupLabel: { fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6, fontWeight: 500 },
  pastBtn: { borderColor: "#2a1a22", color: "#c488a0" },
  pastBtnActive: { background: "#1e0f16", border: "1px solid #c9507a", color: "#e88aaa" },
  suggestionRow: { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  suggestionLabel: { fontSize: 12, color: "#666", marginRight: 4 },
  suggestionBtn: { background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#aaa", borderRadius: 2, padding: "7px 14px", fontSize: 13, cursor: "pointer" },
  suggestionBtnActive: { background: "#1e1a0e", border: "1px solid #c9a84c", color: "#c9a84c" },
  refreshBtn: { background: "none", border: "none", color: "#444", fontSize: 12, cursor: "pointer", padding: 0 },
  datePickerWrapper: { position: "relative", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 2, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", overflow: "hidden" },
  datePickerIcon: { fontSize: 16, flexShrink: 0 },
  datePickerValue: { color: "#fff", fontSize: 14, flex: 1 },
  datePickerHidden: { position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" },
  manualDateRow: { marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  uploadBox: { border: "2px dashed #333", borderRadius: 2, padding: 40, textAlign: "center", color: "#888", marginBottom: 24, cursor: "pointer" },
  fileName: { color: "#fff", fontSize: 16, marginBottom: 12 },
  clearBtn: { background: "none", border: "1px solid #444", color: "#888", borderRadius: 2, padding: "4px 12px", cursor: "pointer" },
  browseBtn: { display: "inline-block", marginTop: 12, background: "#222", border: "1px solid #333", color: "#ccc", borderRadius: 2, padding: "6px 16px", cursor: "pointer" },
  importBtn: { width: "100%", background: "#c9a84c", color: "#000", border: "none", borderRadius: 2, padding: "14px 0", fontSize: 16, fontWeight: 600, cursor: "pointer", marginBottom: 8 },
  secondaryBtn: { width: "100%", background: "#1a1a1a", color: "#aaa", border: "1px solid #333", borderRadius: 2, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", marginBottom: 16 },
  hint: { color: "#666", fontSize: 13, marginBottom: 12 },
  error: { marginTop: 16, background: "#2a0f0f", border: "1px solid #5a1a1a", borderRadius: 2, padding: 16, color: "#ff6b6b" },
  resultBox: { background: "#0f1a0f", border: "1px solid #1a3a1a", borderRadius: 2, padding: 20, color: "#ccc" },
  resultTitle: { fontSize: 16, fontWeight: 700, color: "#4caf50", marginBottom: 12 },
  sectionLabel: { fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  resultItem: { color: "#aaa", fontSize: 14, marginBottom: 4 },
  dateList: { background: "#0d0d0d", border: "1px solid #222", borderRadius: 2, padding: 16, marginBottom: 20 },
  dateRow: { display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid #1a1a1a" },
  dateChip: { background: "#1a1a2e", color: "#7ec8f0", borderRadius: 4, padding: "2px 8px", fontSize: 13, fontWeight: 600, flexShrink: 0 },
  dateCount: { color: "#888", fontSize: 12, flexShrink: 0 },
  dateNames: { color: "#555", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  modeToggle: { display: "flex", gap: 8, marginBottom: 20 },
  modeBtn: { background: "#1a1a1a", border: "1px solid #333", color: "#888", borderRadius: 2, padding: "8px 20px", fontSize: 14, cursor: "pointer" },
  modeBtnActive: { background: "#1a1a2e", border: "1px solid #4a6fa5", color: "#7ec8f0" },
  successNote: { marginTop: 4, background: "#102015", border: "1px solid #275b34", borderRadius: 2, padding: "10px 12px", color: "#9de8a9", fontSize: 13 },
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(5, 8, 12, 0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 80 },
  modalCard: { width: "min(620px, 100%)", background: "#101214", border: "1px solid #252a31", borderRadius: 3, padding: 22, boxShadow: "0 24px 80px rgba(0,0,0,0.45)" },
  modalTopicRow: { display: "flex", alignItems: "center", gap: 10, border: "1px solid #262d36", borderRadius: 2, padding: "10px 12px", background: "#131820", color: "#e7edf7" },
  modalActionRow: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18, flexWrap: "wrap" },
  secondaryBtnInline: { background: "#1a1a1a", color: "#c7d0db", border: "1px solid #333", borderRadius: 2, padding: "10px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  importBtnInline: { background: "#c9a84c", color: "#000", border: "none", borderRadius: 2, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  liveClassLayout: { display: "grid", gridTemplateColumns: "minmax(250px, 0.9fr) minmax(0, 2fr) minmax(250px, 0.95fr)", gap: 16, alignItems: "start" },
  liveRail: { background: "#0f0f0f", border: "1px solid #262626", borderRadius: 14, padding: 14, minHeight: 640 },
  liveQuestionCard: { background: "#141414", border: "1px solid #2a2a2a", borderRadius: 12, padding: 12, cursor: "pointer" },
  liveQuestionCardActive: { background: "#1c170c", border: "1px solid #c9a84c" },
  liveTeleprompter: { background: "linear-gradient(180deg, #101419 0%, #0d1014 100%)", border: "1px solid #222b34", borderRadius: 18, minHeight: 640, padding: 20, display: "flex", flexDirection: "column", justifyContent: "flex-start", overflow: "hidden" },
  livePromptHeader: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap" },
  liveMetricChip: { minWidth: 112, background: "#0b1017", border: "1px solid #243247", borderRadius: 12, padding: "10px 12px" },
  liveMetricLabel: { fontSize: 11, color: "#8fa4c7", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 },
  liveMetricValue: { fontSize: 20, fontWeight: 800, color: "#f2dfaf", fontFamily: "'DM Mono', monospace" },
  liveTimerBox: { minWidth: 240, background: "#0b0f14", border: "1px solid #273241", borderRadius: 14, padding: 14, textAlign: "center" },
  liveFlowBody: { display: "grid", gap: 14, marginTop: 6 },
  liveStep: { display: "grid", gridTemplateColumns: "48px minmax(0, 1fr)", gap: 14, alignItems: "start", background: "#111720", border: "1px solid #273241", borderRadius: 14, padding: 14 },
  liveStepNum: { width: 34, height: 34, borderRadius: 999, background: "#c9a84c", color: "#141414", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 },
  liveStepText: { color: "#eef3fb", fontSize: 18, lineHeight: 1.55 },
  liveSampleBox: { marginTop: 8, background: "#0b1017", border: "1px solid #243247", borderRadius: 12, padding: 14 },
  liveNotesBox: { background: "#0b1017", border: "1px solid #243247", borderRadius: 12, padding: 14 },
  liveSignalGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 14 },
  liveSignalCard: { background: "#0b1017", border: "1px solid #243247", borderRadius: 12, padding: 12 },
  liveSignalText: { color: "#c5d4eb", fontSize: 12, lineHeight: 1.5 },
  liveNotesWorkspace: { marginTop: 16, background: "#0b1017", border: "1px solid #243247", borderRadius: 14, padding: 14 },
  liveMiniBtn: { background: "#141b26", border: "1px solid #314763", color: "#b6d1f7", borderRadius: 10, padding: "9px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  liveAlarmScreen: { flex: 1, minHeight: 440, borderRadius: 18, background: "radial-gradient(circle at center, rgba(95,16,16,0.95) 0%, rgba(42,9,9,0.98) 65%, rgba(18,4,4,1) 100%)", border: "1px solid #823737", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  liveAlarmText: { color: "#ffd8d8", fontSize: 42, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center" },
  liveExternalCard: { background: "#131820", border: "1px solid #26303f", borderRadius: 12, padding: 12 },
  livePreviousNotesCard: { background: "#131820", border: "1px solid #26303f", borderRadius: 12, padding: 12, marginBottom: 12 },
  liveEmpty: { flex: 1, minHeight: 380, border: "1px dashed #2c394a", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#7c8aa1", fontSize: 16, lineHeight: 1.6, padding: 24 },
}
