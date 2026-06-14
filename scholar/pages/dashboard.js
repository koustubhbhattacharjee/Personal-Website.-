import { useSession, signOut, signIn } from "next-auth/react"
import { useRouter } from "next/router"
import { useEffect, useState, useRef } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Canvas } from "@react-three/fiber"
import { Html, OrbitControls } from "@react-three/drei"
import * as THREE from "three"
import styles from "../styles/Dashboard.module.css"
import loginStyles from "../styles/Login.module.css"
import { getTimeTheme } from "../lib/time-theme"
import { getAllObjectives, getObjectiveByCode } from "../lib/district-taxonomy"
import { buildCylinderData } from "../lib/cylinder-data"
import { buildShowcaseDashDataStub } from "../data/showcase-subject-stubs"
import MathText from "../components/MathText"
import FailureState from "../components/FailureState"

const SubjectCylinder3D = dynamic(() => import("../components/SubjectCylinder3D"), { ssr: false })
const LOGraphView = dynamic(() => import("../components/LOGraphView"), { ssr: false })
const StackPanel = dynamic(() => import("../components/CylinderPanels").then(m => m.StackPanel), { ssr: false })
const DiskPanel = dynamic(() => import("../components/CylinderPanels").then(m => m.DiskPanel), { ssr: false })
const RingPanel = dynamic(() => import("../components/CylinderPanels").then(m => m.RingPanel), { ssr: false })
const ArcPanel = dynamic(() => import("../components/CylinderPanels").then(m => m.ArcPanel), { ssr: false })
const QuestionPanel = dynamic(() => import("../components/CylinderPanels").then(m => m.QuestionPanel), { ssr: false })
const ExcalidrawDock = dynamic(() => import("../components/ExcalidrawDock"), { ssr: false })
const QuestionPane = dynamic(() => import("../components/QuestionPane"), { ssr: false })
const DrillBreadcrumbs = dynamic(() => import("../components/DrillBreadcrumbs"), { ssr: false })
import { normalizeUnitsForScenes } from "../components/CylinderPanels"
import { findNext, findPrev, nextLabelFor, prevLabelFor, findNextArc, findPrevArc, nextArcLabelFor, prevArcLabelFor } from "../lib/practice-nav"
const SHAPE_PALETTE_KEYS = ["ember", "sunset", "ocean", "midnight", "royal", "forest"]
const SHAPE_PALETTE_STOPS = {
  ember:    ["#6b1016", "#b3342a", "#e7613a", "#f2a96a"],
  sunset:   ["#e7614b", "#f08b5f", "#f5b56a", "#fad884"],
  ocean:    ["#0b3a4a", "#176b7a", "#3aa8b0", "#9fe0df"],
  midnight: ["#0b0f2a", "#1b2257", "#4142a3", "#8a82d9"],
  royal:    ["#2a0f4a", "#5f1e88", "#a347b7", "#e69adf"],
  forest:   ["#203a1e", "#3a6b34", "#6fa23e", "#bddc67"],
}
const SHAPE_MODES = [
  { key: "cylinder", kind: "cylinder", label: "Cylinder" },
  { key: "torus",    kind: "torus",    label: "Torus"    },
  { key: "cube",     kind: "bar",      label: "Bar"      },
]
const DASHBOARD_TOUR_STORAGE_KEY = "scholar-dashboard-tour-complete-v2"
const DASHBOARD_SHAPE_MODE_STORAGE_KEY = "scholar-dashboard-shape-mode"
const DASHBOARD_PALETTE_STORAGE_KEY = "scholar-dashboard-palette"
const PROGRESS_GRAPH_CACHE_PREFIX = "scholar-progress-graph-v3"
const PREVIEW_DASHBOARD_CACHE_PREFIX = "scholar-preview-dashboard-v3"
const PREVIEW_SUBJECT_CACHE_PREFIX = "scholar-preview-subject-v3"
const LIVE_DASHBOARD_CACHE_KEY = "scholar-dashboard-live-v3"
const LIVE_LAST_SUBJECT_KEY = "scholar-dashboard-last-subject-v3"
const PROGRESS_GRAPH_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 12
const LIVE_DASHBOARD_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24
const PROGRESS_GRAPH_REFRESH_STALE_MS = 1000 * 60 * 30

// Walk the cylinderUnits tree to find which (uIdx, loIdx, qtIdx, qIdx) a
// given question lives at, identified by qhash (preferred) and an optional
// hint qtId (skip arcs whose questionTypeId doesn't match — small speedup).
// Returns null if the question isn't in this subject's tree (most likely
// because it belongs to a different subject the student isn't on).
function locateQuestionInCylinder(units, qhash, qtIdHint) {
  if (!Array.isArray(units) || !qhash) return null
  for (let u = 0; u < units.length; u++) {
    const rings = units[u]?.rings || []
    for (let l = 0; l < rings.length; l++) {
      const arcs = rings[l]?.arcs || []
      for (let a = 0; a < arcs.length; a++) {
        if (qtIdHint && arcs[a]?.questionTypeId && arcs[a].questionTypeId !== qtIdHint) continue
        const qs = arcs[a]?.questions || []
        for (let q = 0; q < qs.length; q++) {
          if (qs[q]?.qhash === qhash || qs[q]?.key === qhash) {
            return { uIdx: u, loIdx: l, qtIdx: a, qIdx: q }
          }
        }
      }
    }
  }
  return null
}

// Find which (uIdx, loIdx, qtIdx) a given QT id sits at in the tree. Used
// for "section" results: a section is identified by (schoolSection, qt) and
// we want the first QT in that section as the drill target.
function findQtCoordinatesInCylinder(units, questionTypeId) {
  if (!Array.isArray(units) || !questionTypeId) return null
  for (let u = 0; u < units.length; u++) {
    const rings = units[u]?.rings || []
    for (let l = 0; l < rings.length; l++) {
      const arcs = rings[l]?.arcs || []
      for (let a = 0; a < arcs.length; a++) {
        if (arcs[a]?.questionTypeId === questionTypeId) return { uIdx: u, loIdx: l, qtIdx: a }
      }
    }
  }
  return null
}

// Build a snippet of `text` ~140 chars wide centered on the first match for
// any token, with **token** marks around each occurrence so the dropdown
// can render emphasis. Mirrors what the server-side search does for plain
// question_text — kept inline here so the client can render unit/LO/QT/
// section results without the network round trip.
function snippetWithMarks(text, tokens) {
  const t = String(text || "")
  if (!t) return ""
  const lower = t.toLowerCase()
  let firstHit = -1
  for (const tok of tokens) {
    const i = lower.indexOf(tok.toLowerCase())
    if (i >= 0 && (firstHit < 0 || i < firstHit)) firstHit = i
  }
  let s
  if (firstHit < 0) {
    s = t.slice(0, 160) + (t.length > 160 ? "…" : "")
  } else {
    const start = Math.max(0, firstHit - 50)
    const end = Math.min(t.length, firstHit + 110)
    s = (start > 0 ? "…" : "") + t.slice(start, end) + (end < t.length ? "…" : "")
  }
  for (const tok of tokens) {
    const re = new RegExp("(" + tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi")
    s = s.replace(re, "**$1**")
  }
  return s
}

// Search the current subject's cylinderUnits tree for matches across
// units, learning objectives, question types, and questions — plus walk
// progressQuestionTypes for school-section matches (section title + code,
// which aren't on cylinderUnits directly). Returns a heterogeneous list
// where each entry has a `kind` and the drill coordinates needed to set
// drillUnitIdx/drillLoIdx/drillQtypeIdx/drillQuestionIdx on click.
//
// Tokens are AND-matched as case-insensitive substrings: "kinematics
// graph" hits both words anywhere in the field. Limit ~50 results so the
// dropdown stays scrollable.
function searchCylinderTree(units, progressQuestionTypes, query) {
  const q = String(query || "").trim().toLowerCase()
  if (q.length < 2) return []
  const tokens = q.split(/\s+/).filter((t) => t.length >= 1).slice(0, 8)
  if (!tokens.length) return []
  const matches = (s) => {
    const lower = String(s || "").toLowerCase()
    return tokens.every((t) => lower.includes(t))
  }
  const results = []
  const seenUnits = new Set(), seenLos = new Set(), seenQts = new Set(), seenSections = new Set()

  for (let u = 0; u < (units || []).length; u++) {
    const unit = units[u]
    if ((matches(unit?.name) || matches(unit?.key)) && !seenUnits.has(u)) {
      seenUnits.add(u)
      results.push({
        kind: "unit", uIdx: u,
        label: unit.name || unit.key,
        sublabel: `${(unit.rings || []).length} learning objectives`,
      })
    }
    for (let l = 0; l < (unit?.rings || []).length; l++) {
      const lo = unit.rings[l]
      const loKey = `${u}|${l}`
      if ((matches(lo?.name) || matches(lo?.code)) && !seenLos.has(loKey)) {
        seenLos.add(loKey)
        results.push({
          kind: "lo", uIdx: u, loIdx: l,
          label: `${lo.code || ""} · ${lo.name || ""}`.trim().replace(/^·\s*/, ""),
          sublabel: `Learning objective in ${unit.name || unit.key}`,
        })
      }
      for (let a = 0; a < (lo?.arcs || []).length; a++) {
        const arc = lo.arcs[a]
        const qtKey = `${u}|${l}|${a}`
        if (matches(arc?.type) && !seenQts.has(qtKey)) {
          seenQts.add(qtKey)
          results.push({
            kind: "qt", uIdx: u, loIdx: l, qtIdx: a,
            label: arc.type || "Question type",
            sublabel: `${unit.name || unit.key} / ${lo.code || lo.name || ""}`.trim(),
          })
        }
        for (let qi = 0; qi < (arc?.questions || []).length; qi++) {
          const ques = arc.questions[qi]
          const qText = ques?.question || ""
          if (!matches(qText)) continue
          const hasImage = !!(ques.imageUrl || (Array.isArray(ques.content) && ques.content.some((c) => c?.type === "image")))
          results.push({
            kind: "question",
            uIdx: u, loIdx: l, qtIdx: a, qIdx: qi,
            question_key: ques.qhash || ques.key || "",
            snippet: snippetWithMarks(qText, tokens),
            source_label: arc.type || "",
            unit_label: unit.name || unit.key || "",
            has_image: hasImage,
          })
        }
      }
    }
  }

  // Sections (from school overlay): each progressQuestionTypes row carries
  // schoolSection (e.g. "1.1") and schoolSectionTitle ("Index laws"). We
  // dedup by (section, sectionTitle, unit) so multiple QTs in the same
  // section collapse into one result. Click drills to the first matching
  // QT — student can then navigate sideways within that section.
  for (const qt of (progressQuestionTypes || [])) {
    const sec = qt?.schoolSection || ""
    const secTitle = qt?.schoolSectionTitle || ""
    const unitName = qt?.schoolUnitName || ""
    if (!sec && !secTitle) continue
    if (!matches(sec) && !matches(secTitle)) continue
    const dedupKey = `${sec}|${secTitle}|${unitName}`
    if (seenSections.has(dedupKey)) continue
    seenSections.add(dedupKey)
    const coords = findQtCoordinatesInCylinder(units, qt.id)
    if (!coords) continue
    results.push({
      kind: "section",
      uIdx: coords.uIdx, loIdx: coords.loIdx, qtIdx: coords.qtIdx,
      label: `${sec || ""} · ${secTitle || ""}`.trim().replace(/^·\s*/, ""),
      sublabel: `Section · ${unitName || ""}`.trim(),
    })
  }

  // Stable order: structural types first (unit > lo > section > qt > question),
  // alphabetical within each kind. This lets a user typing "kinematics" see
  // the unit at the top, then objectives, then question types.
  const kindOrder = { unit: 0, lo: 1, section: 2, qt: 3, question: 4 }
  results.sort((a, b) => {
    const ka = kindOrder[a.kind] ?? 9
    const kb = kindOrder[b.kind] ?? 9
    if (ka !== kb) return ka - kb
    return String(a.label || a.snippet || "").localeCompare(String(b.label || b.snippet || ""))
  })
  return results.slice(0, 50)
}

function buildProgressGraphCacheKey({ studentId = "", subjectId = "", asStudentId = "", demoMode = false, token = "" }) {
  const viewerKey = String(asStudentId || studentId || "anon")
  const modeKey = demoMode ? `demo:${String(token || "").slice(0, 32)}` : "live"
  return `${PROGRESS_GRAPH_CACHE_PREFIX}:${modeKey}:${viewerKey}:${String(subjectId || "")}`
}

function readProgressGraphCache(cacheKey) {
  if (!cacheKey || typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(cacheKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.savedAt || !parsed?.data) return null
    if (Date.now() - Number(parsed.savedAt) > PROGRESS_GRAPH_CACHE_MAX_AGE_MS) return null
    return {
      ...parsed.data,
      savedAt: Number(parsed.savedAt),
    }
  } catch {
    return null
  }
}

function writeProgressGraphCache(cacheKey, data) {
  if (!cacheKey || typeof window === "undefined" || !data) return
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      savedAt: Date.now(),
      data,
    }))
  } catch {}
}

function buildPreviewDashboardCacheKey({ studentId = "", asStudentId = "", demoMode = false, token = "" }) {
  const viewerKey = String(asStudentId || studentId || "anon")
  const modeKey = demoMode ? `demo:${String(token || "").slice(0, 32)}` : "live"
  return `${PREVIEW_DASHBOARD_CACHE_PREFIX}:${modeKey}:${viewerKey}`
}

function buildPreviewSubjectCacheKey({ studentId = "", subjectId = "", asStudentId = "", demoMode = false, token = "" }) {
  const viewerKey = String(asStudentId || studentId || "anon")
  const modeKey = demoMode ? `demo:${String(token || "").slice(0, 32)}` : "live"
  return `${PREVIEW_SUBJECT_CACHE_PREFIX}:${modeKey}:${viewerKey}:${String(subjectId || "")}`
}

function readPreviewCache(cacheKey) {
  if (!cacheKey || typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(cacheKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.savedAt || !parsed?.data) return null
    if (Date.now() - Number(parsed.savedAt) > PROGRESS_GRAPH_CACHE_MAX_AGE_MS) return null
    return parsed.data
  } catch {
    return null
  }
}

function writePreviewCache(cacheKey, data) {
  if (!cacheKey || typeof window === "undefined" || !data) return
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      savedAt: Date.now(),
      data,
    }))
  } catch {}
}

function readLiveDashboardCache() {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(LIVE_DASHBOARD_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.savedAt || !parsed?.data) return null
    if (Date.now() - Number(parsed.savedAt) > LIVE_DASHBOARD_CACHE_MAX_AGE_MS) return null
    return parsed.data
  } catch { return null }
}

function writeLiveDashboardCache(data) {
  if (typeof window === "undefined" || !data) return
  try {
    localStorage.setItem(LIVE_DASHBOARD_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }))
  } catch {}
}

function hasUsableQuestionSlices(questionTypes = []) {
  return Array.isArray(questionTypes) && questionTypes.some((qt) =>
    Array.isArray(qt?.questions) && qt.questions.length > 0
  )
}

// Observatory dark — accent hue drifts with time of day (warm→cool) but
// the canvas stays dark charcoal with hairline borders throughout.
const TIME_THEMES = {
  morning: {
    "--bg": "oklch(0.18 0.008 60)",
    "--bg-2": "oklch(0.22 0.010 60)",
    "--bg-3": "oklch(0.26 0.012 60)",
    "--surface": "oklch(0.22 0.010 60)",
    "--surface2": "oklch(0.26 0.012 60)",
    "--rule": "oklch(0.33 0.010 70)",
    "--rule-soft": "oklch(0.27 0.010 70)",
    "--border": "oklch(0.33 0.010 70)",
    "--accent": "oklch(0.72 0.18 40)",
    "--accent-2": "oklch(0.82 0.14 40)",
    "--accent-ink": "oklch(0.18 0.02 40)",
    "--gold": "oklch(0.72 0.18 40)",
    "--gold-light": "oklch(0.82 0.14 40)",
    "--gold-dim": "color-mix(in oklab, oklch(0.72 0.18 40) 18%, transparent)",
    "--fg": "oklch(0.96 0.004 80)",
    "--fg-2": "oklch(0.82 0.010 70)",
    "--fg-3": "oklch(0.58 0.010 70)",
    "--fg-4": "oklch(0.40 0.010 70)",
    "--text": "oklch(0.96 0.004 80)",
    "--text-muted": "oklch(0.82 0.010 70)",
    "--text-dim": "oklch(0.58 0.010 70)",
    "--red": "oklch(0.65 0.20 15)",
    "--green": "oklch(0.74 0.14 150)",
    "--blue": "oklch(0.72 0.12 225)",
    "--stage": "oklch(0.21 0.008 60)",
    "--radius": "0",
  },
  afternoon: {
    "--bg": "oklch(0.18 0.008 60)",
    "--bg-2": "oklch(0.22 0.010 60)",
    "--bg-3": "oklch(0.26 0.012 60)",
    "--surface": "oklch(0.22 0.010 60)",
    "--surface2": "oklch(0.26 0.012 60)",
    "--rule": "oklch(0.33 0.010 70)",
    "--rule-soft": "oklch(0.27 0.010 70)",
    "--border": "oklch(0.33 0.010 70)",
    "--accent": "oklch(0.70 0.19 24)",
    "--accent-2": "oklch(0.80 0.14 24)",
    "--accent-ink": "oklch(0.18 0.02 24)",
    "--gold": "oklch(0.70 0.19 24)",
    "--gold-light": "oklch(0.80 0.14 24)",
    "--gold-dim": "color-mix(in oklab, oklch(0.70 0.19 24) 18%, transparent)",
    "--fg": "oklch(0.96 0.004 80)",
    "--fg-2": "oklch(0.82 0.010 70)",
    "--fg-3": "oklch(0.58 0.010 70)",
    "--fg-4": "oklch(0.40 0.010 70)",
    "--text": "oklch(0.96 0.004 80)",
    "--text-muted": "oklch(0.82 0.010 70)",
    "--text-dim": "oklch(0.58 0.010 70)",
    "--red": "oklch(0.65 0.20 15)",
    "--green": "oklch(0.74 0.14 150)",
    "--blue": "oklch(0.72 0.12 225)",
    "--stage": "oklch(0.21 0.008 60)",
    "--radius": "0",
  },
  evening: {
    "--bg": "oklch(0.17 0.015 280)",
    "--bg-2": "oklch(0.21 0.018 280)",
    "--bg-3": "oklch(0.25 0.020 280)",
    "--surface": "oklch(0.21 0.018 280)",
    "--surface2": "oklch(0.25 0.020 280)",
    "--rule": "oklch(0.33 0.020 280)",
    "--rule-soft": "oklch(0.27 0.018 280)",
    "--border": "oklch(0.33 0.020 280)",
    "--accent": "oklch(0.72 0.16 12)",
    "--accent-2": "oklch(0.82 0.13 12)",
    "--accent-ink": "oklch(0.18 0.02 12)",
    "--gold": "oklch(0.72 0.16 12)",
    "--gold-light": "oklch(0.82 0.13 12)",
    "--gold-dim": "color-mix(in oklab, oklch(0.72 0.16 12) 18%, transparent)",
    "--fg": "oklch(0.96 0.008 270)",
    "--fg-2": "oklch(0.82 0.014 270)",
    "--fg-3": "oklch(0.58 0.016 270)",
    "--fg-4": "oklch(0.40 0.016 270)",
    "--text": "oklch(0.96 0.008 270)",
    "--text-muted": "oklch(0.82 0.014 270)",
    "--text-dim": "oklch(0.58 0.016 270)",
    "--red": "oklch(0.66 0.20 15)",
    "--green": "oklch(0.74 0.14 160)",
    "--blue": "oklch(0.76 0.12 220)",
    "--stage": "oklch(0.20 0.018 280)",
    "--radius": "0",
  },
  night: {
    "--bg": "oklch(0.15 0.020 255)",
    "--bg-2": "oklch(0.19 0.024 255)",
    "--bg-3": "oklch(0.23 0.026 255)",
    "--surface": "oklch(0.19 0.024 255)",
    "--surface2": "oklch(0.23 0.026 255)",
    "--rule": "oklch(0.32 0.028 255)",
    "--rule-soft": "oklch(0.26 0.024 255)",
    "--border": "oklch(0.32 0.028 255)",
    "--accent": "oklch(0.78 0.13 220)",
    "--accent-2": "oklch(0.86 0.10 220)",
    "--accent-ink": "oklch(0.18 0.03 240)",
    "--gold": "oklch(0.78 0.13 220)",
    "--gold-light": "oklch(0.86 0.10 220)",
    "--gold-dim": "color-mix(in oklab, oklch(0.78 0.13 220) 18%, transparent)",
    "--fg": "oklch(0.96 0.012 240)",
    "--fg-2": "oklch(0.82 0.018 240)",
    "--fg-3": "oklch(0.58 0.020 240)",
    "--fg-4": "oklch(0.40 0.020 240)",
    "--text": "oklch(0.96 0.012 240)",
    "--text-muted": "oklch(0.82 0.018 240)",
    "--text-dim": "oklch(0.58 0.020 240)",
    "--red": "oklch(0.68 0.19 15)",
    "--green": "oklch(0.74 0.14 160)",
    "--blue": "oklch(0.78 0.13 220)",
    "--stage": "oklch(0.18 0.022 255)",
    "--radius": "0",
  },
}

const PAPER_THEME = {
  "--bg": "oklch(0.98 0.005 85)",
  "--bg-2": "oklch(0.95 0.006 85)",
  "--bg-3": "oklch(0.92 0.007 85)",
  "--surface": "oklch(0.95 0.006 85)",
  "--surface2": "oklch(0.92 0.007 85)",
  "--rule": "oklch(0.82 0.012 60)",
  "--rule-soft": "oklch(0.90 0.008 60)",
  "--border": "oklch(0.82 0.012 60)",
  "--accent": "oklch(0.58 0.18 24)",
  "--accent-2": "oklch(0.70 0.15 24)",
  "--accent-ink": "oklch(0.98 0.01 24)",
  "--gold": "oklch(0.58 0.18 24)",
  "--gold-light": "oklch(0.70 0.15 24)",
  "--gold-dim": "color-mix(in oklab, oklch(0.58 0.18 24) 18%, transparent)",
  "--fg": "oklch(0.20 0.010 60)",
  "--fg-2": "oklch(0.36 0.010 60)",
  "--fg-3": "oklch(0.52 0.010 60)",
  "--fg-4": "oklch(0.70 0.010 60)",
  "--text": "oklch(0.20 0.010 60)",
  "--text-muted": "oklch(0.36 0.010 60)",
  "--text-dim": "oklch(0.52 0.010 60)",
  "--red": "oklch(0.56 0.20 15)",
  "--green": "oklch(0.55 0.14 150)",
  "--blue": "oklch(0.55 0.12 225)",
  "--stage": "oklch(0.93 0.008 60)",
  "--stage-line": "oklch(0.82 0.012 60)",
  "--radius": "0",
}

function getMinutesUntilClass(startTimeISO) {
  if (!startTimeISO) return null
  return Math.floor((new Date(startTimeISO) - new Date()) / 60000)
}


function formatClassSlot(startISO, endISO, tz = "Asia/Kolkata") {
  if (!startISO || !endISO) return "Time not available"
  const opts = { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: tz }
  return `${new Date(startISO).toLocaleTimeString("en-US", opts)} – ${new Date(endISO).toLocaleTimeString("en-US", opts)}`
}

function formatClassDate(startISO, tz = "Asia/Kolkata") {
  if (!startISO) return ""
  return new Date(startISO).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz })
}

function dateKeyFromISO(iso, tz = "UTC") {
  if (!iso) return null
  // en-CA gives YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso))
}

function getUpcomingAfterToday(subject) {
  return (subject.upcomingClasses || [])
    .filter(c => (c.startTime || "") !== (subject.todayClass?.startTime || ""))
    .slice(0, 2)
}

function getTimeEmoji(timeOfDay) {
  if (timeOfDay === "morning") return "🌤"
  if (timeOfDay === "afternoon") return "🌿"
  return "🌙"
}

const HERO_GREETINGS = {
  morning: [
    "a fresh day, a fresh start — let's go!",
    "new morning, new chance to learn something cool.",
    "today's a blank page — let's write something good.",
    "small steps today, big wins later.",
    "mornings are for new ideas — let's find one.",
    "you showed up — that's already a win.",
    "one question answered is one step forward.",
    "today's going to be a good learning day.",
    "let's start with something easy and build up.",
    "ready to figure something new out?",
    "fresh mind, fresh energy — let's use it.",
    "today is yours to make awesome.",
    "one step at a time, you've got this.",
    "let's turn today into a good one.",
    "learning something new always feels good.",
    "morning is the best time to tackle the tough stuff.",
    "every expert started exactly where you are.",
    "little by little, a little becomes a lot.",
    "ready to level up today?",
    "you're building something great — one day at a time.",
  ],
  afternoon: [
    "halfway through the day — let's keep going!",
    "a little effort now goes a long way.",
    "every problem you solve makes the next one easier.",
    "you're doing better than you think.",
    "let's turn this afternoon into progress.",
    "one more topic and you're ahead of yesterday.",
    "tough stuff gets easier the more you show up.",
    "you've got time — let's use it well.",
    "small wins count — let's stack a few.",
    "pick up where you left off — you've got this.",
    "afternoons are for steady progress.",
    "one question at a time, one step at a time.",
    "you're closer than you were this morning.",
    "let's make this session count.",
    "showing up again = you're already winning.",
    "progress doesn't have to be huge to matter.",
    "let's keep the momentum going.",
    "you're building something real — keep at it.",
    "a focused afternoon beats a rushed night.",
    "ready to tackle what's next?",
  ],
  evening: [
    "end the day on a good note — one more topic!",
    "evenings are great for review — let's do it.",
    "finish today proud of what you learned.",
    "one last push and you can rest easy.",
    "close the day with a small win.",
    "tomorrow-you will thank today-you.",
    "a quiet evening session is underrated.",
    "wrap up strong — you've earned it.",
    "one more thing learned, one more step forward.",
    "evenings are perfect for locking things in.",
    "you've made it this far — let's finish well.",
    "review now, stress less later.",
    "good evening sessions lead to better mornings.",
    "you're doing great — keep going.",
    "let's make this evening count.",
    "end the day with something you're proud of.",
    "small progress is still progress.",
    "one chapter closer to the goal.",
    "tonight's effort is tomorrow's confidence.",
    "finish up, rest well, repeat tomorrow.",
  ],
  late_night: [
    "late-night study session? Let's make it count.",
    "quick win before bed — let's do it.",
    "one concept tonight, one less to worry about later.",
    "short and focused beats long and tired.",
    "make this session count, then get some rest.",
    "late-night focus hits different — use it well.",
    "one topic, then sleep — deal?",
    "quiet hours = great focus hours.",
    "small effort now, big payoff tomorrow.",
    "let's keep this quick and useful.",
    "you showed up late — that's still showing up.",
    "one more thing learned, then rest.",
    "your future self will thank you for this session.",
    "finish one thing well, then call it a night.",
    "late doesn't mean less — let's make it count.",
    "quick review, then sleep — you've earned it.",
    "even 20 focused minutes can make a difference.",
    "make it short, make it stick.",
    "one last thing, then sweet dreams.",
    "rest is part of learning too — don't forget it.",
  ],
}

function pickHeroGreeting(timeOfDay, seed = "") {
  const key = timeOfDay === "night" ? "late_night" : timeOfDay
  const list = HERO_GREETINGS[key] || HERO_GREETINGS.morning
  const today = new Date().toISOString().slice(0, 10)
  const source = `${today}:${key}:${seed}`
  let hash = 0
  for (let i = 0; i < source.length; i++) hash = (hash * 31 + source.charCodeAt(i)) | 0
  return list[Math.abs(hash) % list.length]
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function splitCodes(codeStr) {
  if (!codeStr) return []
  return String(codeStr)
    .split(/[,;|]/)
    .map(s => s.trim())
    .filter(Boolean)
}


function buildQuestionTrackerData(allObjectives, questionTypes, todayKey) {
  const objectiveMap = Object.fromEntries((allObjectives || []).map((obj) => [obj.code, obj]))
  const objectiveQuestionTypeCount = {}
  const unitQuestionTypeCount = {}

  ;(questionTypes || []).forEach((q) => {
    const primaryCode = splitCodes(q.loCode || q.standardCode || "")[0] || ""
    const objective = objectiveMap[primaryCode]
    const unitName = q.schoolUnitName || objective?.standardName || objective?.standardCode || "General"
    if (primaryCode) objectiveQuestionTypeCount[primaryCode] = (objectiveQuestionTypeCount[primaryCode] || 0) + 1
    unitQuestionTypeCount[unitName] = (unitQuestionTypeCount[unitName] || 0) + 1
  })

  return (questionTypes || []).map((q) => {
    const primaryCode = splitCodes(q.loCode || q.standardCode || "")[0] || ""
    const objective = objectiveMap[primaryCode]
    const unitName = q.schoolUnitName || objective?.standardName || objective?.standardCode || "General"
    const loName = objective?.name || primaryCode || "Learning objective"
    const attemptedCount = Array.isArray(q.correctQuestionKeys) ? q.correctQuestionKeys.length : 0
    const questionCount = Math.max(1, Number(q.questionCount || q.questions?.length || 1))
    const solvedToday = Array.isArray(q.dailySeenDates) && q.dailySeenDates.includes(todayKey) && attemptedCount > 0
    const loDelta = objectiveQuestionTypeCount[primaryCode] ? 1 / objectiveQuestionTypeCount[primaryCode] : 0
    const unitDelta = unitQuestionTypeCount[unitName] ? 1 / unitQuestionTypeCount[unitName] : 0

    return {
      id: q.id,
      title: q.title || "Question type",
      questionLabel: String(q.questions?.[0]?.question || q.title || "Question").replace(/\s+/g, " ").trim(),
      loCode: primaryCode,
      loName,
      unitName,
      sectionName: q.schoolSectionTitle || q.schoolSection || "",
      attemptedCount,
      questionCount,
      progressRatio: questionCount > 0 ? attemptedCount / questionCount : 0,
      solvedToday,
      questionDelta: solvedToday ? 1 : 0,
      loDelta: Number.isFinite(loDelta) ? loDelta : 0,
      unitDelta: Number.isFinite(unitDelta) ? unitDelta : 0,
      weaknessScore: Number(q.weaknessScore || 0),
      isLocked: !!q.isLocked,
      lockReason: q.lockReason || "",
    }
  })
}

function buildLoMasteryMap(questionTypes) {
  const buckets = {}
  ;(questionTypes || []).forEach((q) => {
    const codes = splitCodes(q.loCode || q.standardCode || "")
    const questionCount = Math.max(1, Number(q.questionCount || q.questions?.length || 1))
    const attemptedCount = Math.min(
      questionCount,
      Array.isArray(q.correctQuestionKeys) ? q.correctQuestionKeys.length : 0
    )
    const mastery = typeof q.masteryScore === "number"
      ? q.masteryScore
      : (questionCount > 0 ? attemptedCount / questionCount : 0)
    codes.forEach((code) => {
      if (!code) return
      if (!buckets[code]) buckets[code] = []
      buckets[code].push(mastery)
    })
  })
  const out = {}
  Object.entries(buckets).forEach(([code, values]) => {
    out[code] = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  })
  return out
}

function compactQuestionLabel(text = "", maxLen = 42) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim()
  if (!normalized) return "Question"
  return normalized.length > maxLen ? `${normalized.slice(0, maxLen - 1)}…` : normalized
}

function countBy(list, getKeys) {
  const map = {}
  list.forEach(item => {
    const keys = getKeys(item)
    keys.forEach(k => { map[k] = (map[k] || 0) + 1 })
  })
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

function complementHex(hex) {
  const color = new THREE.Color(hex || "#4f78ca")
  const hsl = { h: 0, s: 0, l: 0 }
  color.getHSL(hsl)
  const complementary = new THREE.Color()
  complementary.setHSL((hsl.h + 0.5) % 1, Math.max(hsl.s, 0.72), Math.min(Math.max(hsl.l, 0.42), 0.58))
  return `#${complementary.getHexString()}`
}

function ArcPreviewMesh({ color = "#4f78ca", thetaLen = Math.PI / 2 }) {
  const geometry = useRef(null)
  if (!geometry.current) {
    const innerR = 0.42
    const outerR = 0.9
    const thetaStart = -Math.PI / 2
    const shape = new THREE.Shape()
    shape.moveTo(Math.cos(thetaStart) * outerR, Math.sin(thetaStart) * outerR)
    shape.absarc(0, 0, outerR, thetaStart, thetaStart + thetaLen, false)
    shape.lineTo(Math.cos(thetaStart + thetaLen) * innerR, Math.sin(thetaStart + thetaLen) * innerR)
    shape.absarc(0, 0, innerR, thetaStart + thetaLen, thetaStart, true)
    shape.closePath()
    geometry.current = new THREE.ExtrudeGeometry(shape, {
      depth: 0.38,
      bevelEnabled: false,
      curveSegments: 48,
      steps: 1,
    })
    geometry.current.translate(0, 0, -0.19)
  }

  return (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh geometry={geometry.current}>
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.28} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function MiniArcScene({ color = "#4f78ca", hoverLabel = "" }) {
  const [hovered, setHovered] = useState(false)
  return (
    <Canvas frameloop="demand" camera={{ position: [1.4, 1.5, 1.6], fov: 32 }}>
      <color attach="background" args={["#ffffff"]} />
      <ambientLight intensity={0.95} />
      <directionalLight position={[2.5, 4, 2.5]} intensity={1} />
      <directionalLight position={[-1.5, 2.2, -1]} intensity={0.35} color="#c4d2e8" />
      <group rotation={[-0.62, 0.56, 0.12]}>
        <group onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
          <ArcPreviewMesh color={color} />
          {hovered && hoverLabel ? (
            <Html position={[0, 0.34, 0]} center>
              <div style={{
                background: "color-mix(in srgb, var(--surface) 94%, transparent)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "8px 10px",
                boxShadow: "0 12px 24px color-mix(in srgb, var(--gold-dim) 70%, transparent)",
                color: "var(--text)",
                fontSize: 11,
                lineHeight: 1.4,
                fontWeight: 700,
                fontFamily: "'DM Sans', sans-serif",
                maxWidth: 200,
                textAlign: "center",
              }}>
                {hoverLabel}
              </div>
            </Html>
          ) : null}
        </group>
      </group>
      <OrbitControls enableZoom={false} enablePan={false} enableRotate />
    </Canvas>
  )
}

function TrackerMiniWindow({ title, children, windowRef }) {
  return (
    <div
      ref={windowRef}
      style={{
        width: 198,
        height: 228,
        borderRadius: 4,
        overflow: "hidden",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{
        padding: "8px 10px",
        borderBottom: "1px solid var(--border)",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--text)",
        background: "var(--surface)",
        fontFamily: "'Cormorant Garamond', 'Playfair Display', serif",
      }}>
        {title}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { status } = useSession()
  const router = useRouter()
  const demoMode = router.query.demo === "1"
  const showcaseMode = demoMode && (router.query.showcase === "1" || !!router.query.token)
  const asStudentId = router.query.as || null
  const returnSubjectId = router.query.subjectId || null
  const authReady = demoMode || status === "authenticated"

  const [dashData, setDashData] = useState(null)
  const [selectedSubject, setSelectedSubject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [sessionResults, setSessionResults] = useState({})
  const [todayTopics, setTodayTopics] = useState([])
  const [progressQuestionTypes, setProgressQuestionTypes] = useState([])
  const [progressQuestionLocks, setProgressQuestionLocks] = useState({})
  const [progressGraphLoading, setProgressGraphLoading] = useState(false)
  const [progressGraphSubjectId, setProgressGraphSubjectId] = useState("")
  const [progressGraphLoadedAt, setProgressGraphLoadedAt] = useState(0)
  const [showcaseTaxonomy, setShowcaseTaxonomy] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState(null)
  const [activeSection, setActiveSection] = useState("overview")
  const [loGraph, setLoGraph] = useState(null)
  const [loGraphRebuilding, setLoGraphRebuilding] = useState(false)
  const [practiceFocusQuestionTypeId, setPracticeFocusQuestionTypeId] = useState("")
  const [tourStep, setTourStep] = useState(-1)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [mobileActionIndex, setMobileActionIndex] = useState(0)
  const [mobileVizIndex, setMobileVizIndex] = useState(0)
  const [shapeMode, setShapeMode] = useState("cylinder")
  const [paletteOverride, setPaletteOverride] = useState(null)
  const [themeMode, setThemeMode] = useState("paper")
  const [drillUnitIdx, setDrillUnitIdx] = useState(null)
  const [drillLoIdx, setDrillLoIdx] = useState(null)
  const [drillQtypeIdx, setDrillQtypeIdx] = useState(null)
  const [drillQuestionIdx, setDrillQuestionIdx] = useState(null)
  const [practiceScratchOpen, setPracticeScratchOpen] = useState(false)
  // Live Excalidraw API for the practice-room scratchpad. ExcalidrawDock sets
  // it via onApiReady; QuestionPane reads it to export the current canvas as a
  // PNG when the user clicks "Submit for review" in Draw-work mode.
  const practiceExcalidrawApiRef = useRef(null)
  // Tracks whether the scratchpad has any non-deleted elements right now —
  // gates the FRQ "Submit for review" button so an empty canvas can't submit.
  const [practiceScratchHasContent, setPracticeScratchHasContent] = useState(false)
  useEffect(() => {
    if (drillQuestionIdx == null && practiceScratchOpen) setPracticeScratchOpen(false)
  }, [drillQuestionIdx, practiceScratchOpen])

  // ── Question search state (in-Practice-Room search box). The effect that
  //     drives this is declared LATER in the file, after cylinderUnits is
  //     computed, because the effect closes over cylinderUnits and would
  //     otherwise hit a TDZ ReferenceError on first render.
  const [questionSearchOpen, setQuestionSearchOpen] = useState(false)
  const [questionSearchQuery, setQuestionSearchQuery] = useState("")
  const [questionSearchResults, setQuestionSearchResults] = useState([])
  const [questionSearchLoading, setQuestionSearchLoading] = useState(false)
  const [questionSearchError, setQuestionSearchError] = useState("")
  const cacheWarmTriggered = useRef(false)
  const frozenTimeOfDay = useRef(null)
  const mobileActionTouchRef = useRef({ x: 0, y: 0 })
  const mobileVizTouchRef = useRef({ x: 0, y: 0 })
  const overviewSceneRef = useRef(null)
  const subjectStackRef = useRef(null)
  const missTrackerRef = useRef({})
  const greetingRef = useRef(null)
  const panelNavRef = useRef(null)
  const overviewSubjectRef = useRef(null)
  const overviewUnitRef = useRef(null)
  const overviewLoRef = useRef(null)
  const practiceNavRef = useRef(null)
  const overviewNavRef = useRef(null)
  const trackerNavRef = useRef(null)
  const graphNavRef = useRef(null)
  const preClassNavRef = useRef(null)
  const exitNavRef = useRef(null)
  const homeworkNavRef = useRef(null)
  const practiceSceneRef = useRef(null)
  const labWorkspaceRef = useRef(null)
  const labSubjectRef = useRef(null)
  const labUnitRef = useRef(null)
  const labLoRef = useRef(null)
  const labArcRef = useRef(null)
  const labQuestionRef = useRef(null)
  const tourPaletteRowRef = useRef(null)
  const tourColorLegendRef = useRef(null)
  const tourBreadcrumbRef = useRef(null)
  const tourPracticeQuestionRef = useRef(null)
  const tourScratchpadRef = useRef(null)
  const tourFlagBtnRef = useRef(null)
  const tourParentsStackRef = useRef(null)
  const tourScenePanelRef = useRef(null)
  const overviewArcRef = useRef(null)
  const overviewStackRef = useRef(null)
  const cylinderDemoQuery = demoMode
    ? `?demo=1${showcaseMode ? "&showcase=1" : ""}${router.query.token ? `&token=${encodeURIComponent(String(router.query.token))}` : ""}`
    : ""
  const assessmentDemoQuery = demoMode
    ? `${showcaseMode ? "&showcase=1" : ""}${router.query.token ? `&token=${encodeURIComponent(String(router.query.token))}` : ""}&demo=1`
    : ""
  const shapeLabel = shapeMode === "cube" ? "Cube" : shapeMode === "torus" ? "Torus" : "Cylinder"
  const shapeNames = shapeMode === "torus"
    ? { parent: "torus",    sub: "segment", subsub: "sub-segment", subsubsub: "arc",   slice: "slice" }
    : shapeMode === "cube"
      ? { parent: "stack",  sub: "bar",     subsub: "face",        subsubsub: "panel", slice: "slice" }
      : { parent: "cylinder", sub: "disk",  subsub: "ring",        subsubsub: "arc",   slice: "slice" }

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const saved = localStorage.getItem(DASHBOARD_SHAPE_MODE_STORAGE_KEY)
      if (saved === "cube" || saved === "cylinder" || saved === "torus") setShapeMode(saved)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      localStorage.setItem(DASHBOARD_SHAPE_MODE_STORAGE_KEY, shapeMode)
    } catch {}
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
    if (typeof window === "undefined") return
    try {
      const saved = localStorage.getItem("scholar-theme-mode")
      if (saved === "paper" || saved === "observatory") setThemeMode(saved)
    } catch {}
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    const root = document.documentElement
    if (themeMode === "paper") root.setAttribute("data-theme", "paper")
    else root.removeAttribute("data-theme")
    try { localStorage.setItem("scholar-theme-mode", themeMode) } catch {}
  }, [themeMode])

  // Persist last-selected subject so mount hydration can pick the right one
  useEffect(() => {
    if (selectedSubject?.id && !demoMode && !asStudentId) {
      try { localStorage.setItem(LIVE_LAST_SUBJECT_KEY, selectedSubject.id) } catch {}
    }
  }, [selectedSubject?.id, demoMode, asStudentId])

  // Hydrate from cache on mount so the 3D cylinder is visible before the network returns
  useEffect(() => {
    if (typeof window === "undefined" || demoMode || asStudentId) return
    const cachedDash = readLiveDashboardCache()
    if (!cachedDash?.student || !Array.isArray(cachedDash?.subjects) || !cachedDash.subjects.length) return
    setDashData(cachedDash)
    let sub = cachedDash.subjects.length === 1 ? cachedDash.subjects[0] : null
    if (!sub) {
      try {
        const lastId = localStorage.getItem(LIVE_LAST_SUBJECT_KEY)
        if (lastId) sub = cachedDash.subjects.find(s => s.id === lastId) || null
      } catch {}
    }
    if (!sub?.id) return
    setSelectedSubject(sub)
    const cacheKey = buildProgressGraphCacheKey({
      studentId: cachedDash.student.id || "",
      subjectId: sub.id,
      asStudentId: "",
      demoMode: false,
      token: "",
    })
    const cachedGraph = readProgressGraphCache(cacheKey)
    if (cachedGraph && hasUsableQuestionSlices(cachedGraph.questionTypes)) {
      setProgressQuestionTypes(cachedGraph.questionTypes || [])
      setProgressGraphSubjectId(sub.id)
      setProgressGraphLoadedAt(Number(cachedGraph.savedAt || Date.now()))
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (demoMode) return
    if (status === "unauthenticated") {
      const callbackUrl = typeof window !== "undefined" ? window.location.href : "/dashboard"
      signIn("google", { callbackUrl })
    }
  }, [status, router, demoMode])

  useEffect(() => {
    if (!authReady) return
    let cancelled = false
    const demoParams = new URLSearchParams({ demo: "1" })
    if (router.query.token) demoParams.set("token", String(router.query.token))
    if (showcaseMode) demoParams.set("showcase", "1")
    const demoParam = demoMode ? demoParams.toString() : ""
    const url = demoMode
      ? `/api/student/dashboard?${demoParam}${asStudentId ? `&as=${asStudentId}` : ""}`
      : asStudentId ? `/api/student/dashboard?as=${asStudentId}` : "/api/student/dashboard"
    const previewDashboardCacheKey = buildPreviewDashboardCacheKey({
      studentId: dashData?.student?.id || "",
      asStudentId: asStudentId || "",
      demoMode,
      token: router.query.token ? String(router.query.token) : "",
    })

    let hasCachedPreview = false
    if (demoMode || asStudentId) {
      const cached = readPreviewCache(previewDashboardCacheKey)
      if (cached?.student && Array.isArray(cached?.subjects)) {
        hasCachedPreview = true
        setDashData(cached)
        if (cached.subjects?.length === 1) setSelectedSubject(cached.subjects[0])
        else if (returnSubjectId) {
          const match = cached.subjects?.find((s) => s.id === returnSubjectId)
          if (match) setSelectedSubject(match)
        }
        setLoading(false)
      }
    }

    if (!hasCachedPreview && showcaseMode) {
      let viewerName = "Scholar"
      let tz = "UTC"
      try {
        viewerName = localStorage.getItem("scholar-showcase-viewer-name") || viewerName
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz
      } catch {}
      const seeded = buildShowcaseDashDataStub({ viewerName, timezone: tz })
      setDashData(seeded)
      if (returnSubjectId) {
        const match = seeded.subjects.find((s) => s.id === returnSubjectId)
        if (match) setSelectedSubject(match)
      }
      setLoading(false)
    }

    async function loadDashboardWithRetry() {
      if (!hasCachedPreview) setLoading(true)
      setLoadError("")
      const attempts = [0, 700, 1600]
      let lastErr = null

      for (const wait of attempts) {
        if (cancelled) return
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait))
        try {
          const r = await fetch(url, { cache: "no-store" })
          const data = await r.json().catch(() => ({}))
          if (!r.ok || data?.error) {
            throw new Error(data?.error || `Failed to load dashboard (${r.status})`)
          }
          if (cancelled) return
          setDashData(data)
          if (demoMode || asStudentId) {
            writePreviewCache(previewDashboardCacheKey, data)
          } else {
            writeLiveDashboardCache(data)
          }
          if (data.subjects?.length === 1) setSelectedSubject(data.subjects[0])
          else if (returnSubjectId) {
            const match = data.subjects?.find(s => s.id === returnSubjectId)
            if (match) setSelectedSubject(match)
          } else {
            // Upgrade stub-seeded selection to the real subject object once fetch resolves.
            setSelectedSubject((prev) => {
              if (!prev?.id) return prev
              const match = data.subjects?.find((s) => s.id === prev.id)
              return match || prev
            })
          }
          setLoadError("")
          setLoading(false)
          return
        } catch (err) {
          lastErr = err
        }
      }

      if (cancelled) return
      setLoadError(lastErr?.message || "Failed to load dashboard")
      setLoading(false)
    }

    loadDashboardWithRetry()
    return () => {
      cancelled = true
    }
  }, [authReady, asStudentId, returnSubjectId])

  // Fire-and-forget cache warmup on login/dashboard load.
  useEffect(() => {
    if (!authReady || !dashData || cacheWarmTriggered.current || demoMode) return
    cacheWarmTriggered.current = true
    fetch("/api/student/warm-cache", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(asStudentId ? { as: asStudentId } : {}),
    }).catch(() => {})
  }, [authReady, dashData, asStudentId, demoMode])

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("sessionResults")
      if (stored) setSessionResults(JSON.parse(stored))
    } catch {}
  }, [])

  useEffect(() => {
    if (!dashData?.subjects?.length || typeof window === "undefined") return
    setSessionResults((prev) => {
      let changed = false
      const next = { ...(prev || {}) }
      for (const sub of dashData.subjects || []) {
        if (!sub?.id || !sub?.sessionDate) continue
        const existing = next[sub.id] || {}
        if (existing.sessionDate === sub.sessionDate) continue
        const preservedPreviewState = existing.previewState
        next[sub.id] = {
          sessionDate: sub.sessionDate,
          ...(preservedPreviewState ? { previewState: preservedPreviewState } : {}),
        }
        changed = true
      }
      if (!changed) return prev
      try {
        sessionStorage.setItem("sessionResults", JSON.stringify(next))
      } catch {}
      return next
    })
  }, [dashData])

  useEffect(() => {
    if (typeof window === "undefined") return undefined
    const media = window.matchMedia("(max-width: 768px)")
    const touchMedia = window.matchMedia("(pointer: coarse)")
    const sync = () => setIsMobileViewport(media.matches)
    const syncTouch = () => setIsTouchDevice(touchMedia.matches)
    sync()
    syncTouch()
    const hasAdd = typeof media.addEventListener === "function"
    if (hasAdd) {
      media.addEventListener("change", sync)
      touchMedia.addEventListener("change", syncTouch)
      return () => {
        media.removeEventListener("change", sync)
        touchMedia.removeEventListener("change", syncTouch)
      }
    }
    media.addListener(sync)
    touchMedia.addListener(syncTouch)
    return () => {
      media.removeListener(sync)
      touchMedia.removeListener(syncTouch)
    }
  }, [])

  const tourAutoStartedRef = useRef(false)
  useEffect(() => {
    if (!dashData || typeof window === "undefined") return
    if (!selectedSubject?.id) return
    if (tourAutoStartedRef.current) return
    tourAutoStartedRef.current = true
    const startTour = () => {
      setDrillUnitIdx(null)
      setDrillLoIdx(null)
      setDrillQtypeIdx(null)
      setDrillQuestionIdx(null)
      setActiveSection("overview")
      setTourStep(0)
    }
    if (demoMode || asStudentId || showcaseMode) {
      startTour()
      return
    }
    try {
      const dismissed = localStorage.getItem(DASHBOARD_TOUR_STORAGE_KEY) === "1"
      if (!dismissed) startTour()
    } catch {
      startTour()
    }
  }, [dashData, demoMode, asStudentId, showcaseMode, selectedSubject?.id])

  function loadProgressGraph(subjectId, options = {}) {
    const { silent = false } = options || {}
    if (!subjectId) return Promise.resolve()
    const cacheKey = buildProgressGraphCacheKey({
      studentId: dashData?.student?.id || "",
      subjectId,
      asStudentId: asStudentId || "",
      demoMode,
      token: router.query.token ? String(router.query.token) : "",
    })
    const cached = readProgressGraphCache(cacheKey)
    if (cached && hasUsableQuestionSlices(cached.questionTypes)) {
      setProgressQuestionTypes(cached.questionTypes || [])
      setProgressGraphSubjectId(subjectId)
      setProgressGraphLoadedAt(Number(cached.savedAt || Date.now()))
      setShowcaseTaxonomy(Array.isArray(cached.taxonomy) && cached.taxonomy.length ? cached.taxonomy : null)
    }
    if (!silent) setProgressGraphLoading(true)
    const asParam = asStudentId ? `&as=${asStudentId}` : ""
    const demoParams = new URLSearchParams()
    if (demoMode) {
      demoParams.set("demo", "1")
      if (router.query.token) demoParams.set("token", String(router.query.token))
    }
    const demoParam = demoMode ? `&${demoParams.toString()}` : ""
    const bust = `&_=${Date.now()}`
    return fetch(`/api/student/progress-graph?subjectId=${subjectId}${asParam}${demoParam}${bust}`, {
      cache: "no-store",
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
    })
      .then(async (r) => {
        if (r.status === 304) return null
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data?.error || `Failed to load progress graph (${r.status})`)
        return data
      })
      .then(data => {
        if (!data) return
        const savedAt = Date.now()
        setProgressQuestionTypes(data.questionTypes || [])
        setProgressQuestionLocks(data.questionLocks || {})
        setProgressGraphSubjectId(subjectId)
        setProgressGraphLoadedAt(savedAt)
        setShowcaseTaxonomy(Array.isArray(data.taxonomy) && data.taxonomy.length ? data.taxonomy : null)
        if (hasUsableQuestionSlices(data.questionTypes)) {
          writeProgressGraphCache(cacheKey, {
            questionTypes: data.questionTypes || [],
            taxonomy: Array.isArray(data.taxonomy) ? data.taxonomy : null,
          })
        }
        if (demoMode || asStudentId) {
          const previewSubjectCacheKey = buildPreviewSubjectCacheKey({
            studentId: dashData?.student?.id || "",
            subjectId,
            asStudentId: asStudentId || "",
            demoMode,
            token: router.query.token ? String(router.query.token) : "",
          })
          const cached = readPreviewCache(previewSubjectCacheKey) || {}
          if (hasUsableQuestionSlices(data.questionTypes)) {
            writePreviewCache(previewSubjectCacheKey, {
              ...cached,
              questionTypes: data.questionTypes || [],
              taxonomy: Array.isArray(data.taxonomy) ? data.taxonomy : null,
            })
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!silent) setProgressGraphLoading(false)
      })
  }

  function loadTodayTopicsForSubject(subject) {
    if (!subject?.id || !subject?.sessionDate) {
      setTodayTopics([])
      return Promise.resolve()
    }
    const cacheKey = buildPreviewSubjectCacheKey({
      studentId: dashData?.student?.id || "",
      subjectId: subject.id,
      asStudentId: asStudentId || "",
      demoMode,
      token: router.query.token ? String(router.query.token) : "",
    })
    if (demoMode || asStudentId) {
      const cached = readPreviewCache(cacheKey)
      if (Array.isArray(cached?.todayTopics)) {
        setTodayTopics(cached.todayTopics)
      }
    }
    const asParam = asStudentId ? `&as=${asStudentId}` : ""
    const demoParams = new URLSearchParams()
    if (demoMode) {
      demoParams.set("demo", "1")
      if (router.query.token) demoParams.set("token", String(router.query.token))
    }
    const demoParam = demoMode ? `&${demoParams.toString()}` : ""
    const dateParam = `&sessionDate=${encodeURIComponent(subject.sessionDate)}`
    return fetch(`/api/student/today-topics?subjectId=${subject.id}${asParam}${dateParam}${demoParam}`)
      .then(r => r.json())
      .then(data => {
        const topics = data?.topics || []
        setTodayTopics(topics)
        if (demoMode || asStudentId) {
          const cached = readPreviewCache(cacheKey) || {}
          writePreviewCache(cacheKey, {
            ...cached,
            todayTopics: topics,
          })
        }
      })
      .catch(() => { setTodayTopics([]) })
  }

  // Load weakness scores for selected subject only
  // Fetch today's topics once subject is selected
  useEffect(() => {
    if (authReady && selectedSubject?.id) {
      loadTodayTopicsForSubject(selectedSubject)
    }
  }, [authReady, selectedSubject, asStudentId, dashData])

  useEffect(() => {
    if (authReady && selectedSubject?.id) {
      const alreadyShowing = progressGraphSubjectId === selectedSubject.id && progressQuestionTypes.length > 0
      loadProgressGraph(selectedSubject.id, { silent: alreadyShowing })
    }
  }, [authReady, selectedSubject, asStudentId])

  useEffect(() => {
    if (!selectedSubject?.id || !(demoMode || asStudentId)) return
    const cacheKey = buildPreviewSubjectCacheKey({
      studentId: dashData?.student?.id || "",
      subjectId: selectedSubject.id,
      asStudentId: asStudentId || "",
      demoMode,
      token: router.query.token ? String(router.query.token) : "",
    })
    const cached = readPreviewCache(cacheKey)
    if (!cached) return
    if (hasUsableQuestionSlices(cached.questionTypes)) {
      setProgressQuestionTypes(cached.questionTypes)
      setProgressGraphSubjectId(selectedSubject.id)
      setProgressGraphLoadedAt(Date.now())
    }
    if (Array.isArray(cached.taxonomy) && cached.taxonomy.length) {
      setShowcaseTaxonomy(cached.taxonomy)
    }
    if (Array.isArray(cached.todayTopics)) {
      setTodayTopics(cached.todayTopics)
    }
  }, [selectedSubject?.id, asStudentId, demoMode, router.query.token, dashData?.student?.id])

  useEffect(() => {
    if (!authReady || !selectedSubject?.id || typeof window === "undefined") return undefined
    let refreshTimer = null
    const refresh = () => {
      loadProgressGraph(selectedSubject.id, { silent: true })
      loadTodayTopicsForSubject(selectedSubject)
    }
    const scheduleRefresh = () => {
      const ageMs = Date.now() - Number(progressGraphLoadedAt || 0)
      if (progressGraphLoadedAt && ageMs < PROGRESS_GRAPH_REFRESH_STALE_MS) return
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(refresh, 250)
    }
    const handleFocus = () => scheduleRefresh()
    const handleVisibility = () => {
      if (document.visibilityState === "visible") scheduleRefresh()
    }
    window.addEventListener("focus", handleFocus)
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      window.removeEventListener("focus", handleFocus)
      document.removeEventListener("visibilitychange", handleVisibility)
      if (refreshTimer) clearTimeout(refreshTimer)
    }
  }, [authReady, selectedSubject, asStudentId, demoMode, router.query.token, progressGraphLoadedAt])

  useEffect(() => {
    if (!authReady || status !== "authenticated" || demoMode || asStudentId || showcaseMode) return undefined
    let cancelled = false
    let timer = null

    const sendHeartbeat = async () => {
      if (cancelled) return
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      try {
        await fetch("/api/student/presence-heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            route: "dashboard",
            section: activeSection || "overview",
            subjectId: selectedSubject?.id || "",
            mode: "live",
          }),
        })
      } catch {}
    }

    sendHeartbeat()
    timer = setInterval(sendHeartbeat, 45000)

    const handleVisibility = () => {
      if (document.visibilityState === "visible") sendHeartbeat()
    }
    document.addEventListener("visibilitychange", handleVisibility)

    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      document.removeEventListener("visibilitychange", handleVisibility)
    }
  }, [authReady, status, demoMode, asStudentId, showcaseMode, activeSection, selectedSubject?.id])

  useEffect(() => {
    if (!authReady) return
    const url = asStudentId ? "/api/admin/lo-graph" : "/api/student/lo-graph"
    fetch(url)
      .then(r => r.json())
      .then(d => { if (d?.graph) setLoGraph(d.graph) })
      .catch(() => {})
  }, [authReady, asStudentId])

  // Filled after cylinderUnits is computed (lower in the render body). The
  // practice-question step's body reads this via a function getter so it
  // sees the latest value at JSX render time.
  let tourCorrectLetter = null

  const tourSteps = [
    {
      key: "intro-3d",
      title: `The ${shapeNames.parent}`,
      body: `The center of Scholar's architecture is a 3D object — a cylinder, a torus, or a cube. It represents mastery in a subject.`,
      targetRef: overviewStackRef,
      placement: "right",
      highlightPadding: 0,
    },
    {
      key: "color-legend",
      title: "Color = mastery",
      body: "A change in color from left (dark) to bright (right) represents increasing mastery.",
      targetRef: tourColorLegendRef,
      placement: "right",
      highlightPadding: 0,
    },
    {
      key: "palette-pick",
      title: "Pick a palette",
      body: "You can choose any palette to represent the 3D objects. Pick any one.",
      targetRef: tourPaletteRowRef,
      placement: "bottom",
      waitForEvent: "palette-selected",
      hint: "Click any palette to continue",
    },
    {
      key: "parent-drill",
      title: `The ${shapeNames.parent}`,
      body: `Hover over the ${shapeNames.parent}. Each ${shapeNames.sub} represents a unit (or a chapter for a textbook). Double-click one to drill in.`,
      targetRef: overviewStackRef,
      placement: "left",
      highlightPadding: 0,
      waitForEvent: "overview-unit-selected",
      hint: `Double-click a ${shapeNames.sub} to continue`,
    },
    {
      key: "sub-drill",
      title: `${shapeNames.sub.charAt(0).toUpperCase() + shapeNames.sub.slice(1)}`,
      body: `Hover over the ${shapeNames.sub} to see all ${shapeNames.subsub}s. Each ${shapeNames.subsub} represents a learning objective (or section, for a textbook). Double-click to select.`,
      targetRef: overviewUnitRef,
      placement: "right",
      highlightPadding: 0,
      waitForEvent: "overview-ring-selected",
      hint: `Double-click a ${shapeNames.subsub} to continue`,
    },
    {
      key: "subsub-drill",
      title: `${shapeNames.subsub.charAt(0).toUpperCase() + shapeNames.subsub.slice(1)}`,
      body: `Hover over the ${shapeNames.subsub} to see all the ${shapeNames.subsubsub}s. Each ${shapeNames.subsubsub} represents a Question Type. Double-click to select.`,
      targetRef: overviewLoRef,
      placement: "right",
      highlightPadding: 0,
      waitForEvent: "overview-arc-selected",
      hint: `Double-click a ${shapeNames.subsubsub} to continue`,
    },
    {
      key: "subsubsub-slices",
      title: `${shapeNames.subsubsub.charAt(0).toUpperCase() + shapeNames.subsubsub.slice(1)}`,
      body: `Hover over the ${shapeNames.subsubsub} to see the ${shapeNames.slice}s. Each ${shapeNames.slice} represents a question. Solve them in the practice room to increase your mastery.`,
      targetRef: overviewArcRef,
      placement: "right",
      highlightPadding: 0,
      autoAdvanceToSection: "cylinder",
      autoSelectQuestionIdx: 0,
    },
    {
      key: "practice-question",
      title: "Answer the question",
      body: () => tourCorrectLetter
        ? `The question you picked appears here. For this dummy question, select ${tourCorrectLetter} — it's the correct response.`
        : "The question you picked appears here. Pick the correct option to continue.",
      targetRef: tourPracticeQuestionRef,
      placement: "right",
      waitForEvent: "practice-answer-submitted",
      hint: "Pick an answer and submit to continue",
    },
    {
      key: "parents-propagation",
      title: "Color propagates upward",
      body: "Notice the change in color of the question — it propagates up to every parent shape. Click next.",
      targetRef: tourParentsStackRef,
      placement: "left",
    },
    {
      key: "scratchpad",
      title: "Scratchpad",
      body: "Draw or work on this scratchpad. Some questions may require you to save it for grading — you can send it to the teacher even when it's not required.",
      targetRef: tourScratchpadRef || tourPracticeQuestionRef,
      placement: "left",
    },
    {
      key: "flag-question",
      title: "Flag a bad question",
      body: "See a bad question, broken formatting, or wrong image? Scroll to the bottom of the question and click Report an issue to send a review request to your teacher.",
      targetRef: tourPracticeQuestionRef,
      placement: "right",
      hint: "Look for 'Report an issue with this question'",
    },
    {
      key: "breadcrumb-dropdown",
      title: "Breadcrumb shortcut",
      body: "To avoid clicking through the 3D objects repeatedly, pick a topic directly from here. Next.",
      targetRef: tourBreadcrumbRef,
      placement: "bottom",
      autoAdvanceToSection: "overview",
    },
    {
      key: "time-decay",
      title: "Mastery fades with time",
      body: "With time, your mastery of a topic fades if it's not practiced. More practice means less fading — the colors stay bright.",
      targetRef: overviewSubjectRef,
      placement: "right",
    },
  ]
  const currentTour = tourStep >= 0 ? tourSteps[tourStep] : null

  function clearTourTargets() {
    ;[
      greetingRef,
      panelNavRef,
      overviewNavRef,
      practiceNavRef,
      trackerNavRef,
      graphNavRef,
      preClassNavRef,
      exitNavRef,
      homeworkNavRef,
      overviewSubjectRef,
      overviewUnitRef,
      overviewLoRef,
      labWorkspaceRef,
      labSubjectRef,
      labUnitRef,
      labLoRef,
      labArcRef,
      labQuestionRef,
      tourPaletteRowRef,
      tourColorLegendRef,
      tourBreadcrumbRef,
      tourPracticeQuestionRef,
      tourScratchpadRef,
      tourFlagBtnRef,
      tourParentsStackRef,
      tourScenePanelRef,
      overviewArcRef,
      overviewStackRef,
    ].forEach((ref) => {
      ref?.current?.classList?.remove(styles.tourTargetActive)
    })
  }

  useEffect(() => {
    clearTourTargets()
    currentTour?.targetRef?.current?.classList?.add(styles.tourTargetActive)
    if (currentTour?.key === "scratchpad" && drillQuestionIdx != null) {
      setPracticeScratchOpen(true)
    }
    return () => {
      clearTourTargets()
    }
  }, [currentTour, drillQuestionIdx])

  // Drives the Practice-Room search dropdown. Sits ABOVE the LoadingScreen /
  // ErrorScreen / SubjectPicker early returns so its hook position is stable
  // across all renders (Hooks Rule). The cylinder/taxonomy derivation below
  // can be unavailable on the first few renders — we just gate gracefully.
  useEffect(() => {
    const q = questionSearchQuery.trim()
    if (q.length < 2) {
      setQuestionSearchResults([])
      setQuestionSearchError("")
      return
    }
    const _student = dashData?.student
    const _objectives = showcaseTaxonomy || (_student ? getAllObjectives(_student.state, selectedSubject?.name || "") : [])
    const _ready = selectedSubject?.id != null && progressGraphSubjectId === selectedSubject.id && progressQuestionTypes.length > 0
    const _cylinderUnits = _ready ? buildCylinderData(_objectives, progressQuestionTypes) : []
    let cancelled = false
    const clientResults = searchCylinderTree(_cylinderUnits, progressQuestionTypes, q)
    setQuestionSearchResults(clientResults)
    setQuestionSearchLoading(true)
    setQuestionSearchError("")
    const subjectIdForSearch = selectedSubject?.id || ""
    const t = setTimeout(async () => {
      // Skip the server hop when no subject is selected — there's nothing to
      // scope the search to and we don't want to leak across-subject results.
      if (!subjectIdForSearch) {
        if (!cancelled) setQuestionSearchLoading(false)
        return
      }
      try {
        const r = await fetch(`/api/student/search-questions?q=${encodeURIComponent(q)}&subjectId=${encodeURIComponent(subjectIdForSearch)}`)
        const data = await r.json().catch(() => ({}))
        if (cancelled) return
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`)
        const haveKeys = new Set(clientResults.filter((x) => x.kind === "question").map((x) => x.question_key))
        const extras = (data.results || [])
          .filter((s) => !haveKeys.has(s.question_key))
          .map((s) => ({
            kind:          "question",
            uIdx:          null, loIdx: null, qtIdx: null, qIdx: null,
            question_key:  s.question_key,
            snippet:       s.snippet,
            source_label:  s.qt_title || s.source_label || "",
            unit_label:    s.unit_label || "",
            has_image:     !!s.has_image,
          }))
        setQuestionSearchResults([...clientResults, ...extras])
      } catch (e) {
        if (!cancelled) setQuestionSearchError(e?.message || "Search failed")
      } finally {
        if (!cancelled) setQuestionSearchLoading(false)
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [questionSearchQuery, dashData, selectedSubject, progressQuestionTypes, progressGraphSubjectId, showcaseTaxonomy])

  useEffect(() => {
    if (typeof window === "undefined") return undefined

    window.__scholarPanelCaptureSelect = ({
      unitName = "",
      ringName = "",
      arcId = "",
      questionIdx = null,
    } = {}) => {
      const student = dashData?.student
      const subject = selectedSubject
      const ready = subject?.id != null && progressGraphSubjectId === subject.id && progressQuestionTypes.length > 0
      if (!student || !subject || !ready) return false

      const objectives = showcaseTaxonomy || getAllObjectives(student.state, subject?.name || "")
      const rawUnits = buildCylinderData(objectives, progressQuestionTypes)
      const normalized = normalizeUnitsForScenes(rawUnits, shapeMode)
      const units = normalized.units || []
      const hasText = (value, needle) =>
        !needle || String(value || "").toLowerCase().replace(/\s+/g, " ").includes(String(needle).toLowerCase().replace(/\s+/g, " "))

      const unitIdx = units.findIndex((unit) => hasText(unit?.name, unitName))
      if (unitIdx < 0) return false

      const unit = units[unitIdx]
      let loIdx = null
      let qtIdx = null

      if (ringName || arcId) {
        loIdx = (unit.rings || []).findIndex((ring) => {
          if (ringName && hasText(ring?.name, ringName)) return true
          return !!arcId && (ring.arcs || []).some((arc) => arc?.questionTypeId === arcId)
        })
        if (loIdx < 0) return false
      }

      const ring = loIdx != null ? unit.rings?.[loIdx] : null
      if (arcId) {
        qtIdx = (ring?.arcs || []).findIndex((arc) =>
          arc?.questionTypeId === arcId || hasText(arc?.type || arc?.name, arcId)
        )
        if (qtIdx < 0) return false
      }

      setActiveSection("overview")
      setShapeMode("cylinder")
      setPaletteOverride("ember")
      setDrillUnitIdx(unitIdx)
      setDrillLoIdx(loIdx)
      setDrillQtypeIdx(qtIdx)
      setDrillQuestionIdx(Number.isInteger(questionIdx) ? questionIdx : null)
      return true
    }

    window.__scholarPanelCaptureDebug = () => {
      const student = dashData?.student
      const subject = selectedSubject
      const ready = subject?.id != null && progressGraphSubjectId === subject.id && progressQuestionTypes.length > 0
      if (!student || !subject || !ready) return []
      const objectives = showcaseTaxonomy || getAllObjectives(student.state, subject?.name || "")
      const rawUnits = buildCylinderData(objectives, progressQuestionTypes)
      const normalized = normalizeUnitsForScenes(rawUnits, shapeMode)
      return (normalized.units || []).map((unit) => ({
        name: unit?.name || "",
        rings: (unit?.rings || []).map((ring) => ({
          name: ring?.name || "",
          code: ring?.code || "",
          arcs: (ring?.arcs || []).map((arc) => ({
            id: arc?.questionTypeId || "",
            type: arc?.type || arc?.name || "",
          })),
        })),
      }))
    }

    return () => {
      delete window.__scholarPanelCaptureSelect
      delete window.__scholarPanelCaptureDebug
    }
  }, [dashData, selectedSubject, progressGraphSubjectId, progressQuestionTypes, showcaseTaxonomy, shapeMode])

  if ((!demoMode && status === "loading") || loading) return <LoadingScreen />
  if (!dashData || dashData.error) return <ErrorScreen message={loadError} onRetry={() => router.reload()} />

  const impersonationBanner = !showcaseMode && dashData.isImpersonating ? (
    <div style={{
      position: "relative",
      zIndex: 5,
      background: "var(--gold)",
      color: "var(--bg)",
      borderBottom: "1px solid var(--border)",
      padding: "10px 20px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      fontSize: 14, fontWeight: 600
    }}>
      <span>👁 Previewing as: {dashData.student.name}</span>
      <a href="/admin" style={{ color: "var(--bg)", textDecoration: "underline" }}>← Back to Admin</a>
    </div>
  ) : null

  const { student, subjects } = dashData
  const tz = student.timezone || "Asia/Kolkata"
  const subject = selectedSubject
  if (!frozenTimeOfDay.current) frozenTimeOfDay.current = getTimeOfDay(tz)
  const timeOfDay = frozenTimeOfDay.current
  const timeEmoji = getTimeEmoji(timeOfDay)

  // Build a code→name lookup from the taxonomy for this student+subject.
  // Falls back to the raw code if not found (e.g. for free-text topics).
  const allObjectives = showcaseTaxonomy || getAllObjectives(student.state, subject?.name || "")
  const codeToName = {}
  allObjectives.forEach(obj => { codeToName[obj.code] = obj.name })

  const progressGraphReady = subject?.id != null && progressGraphSubjectId === subject.id && progressQuestionTypes.length > 0
  const showCylinderLoading = (progressGraphLoading && !progressGraphReady) || progressGraphSubjectId !== subject?.id
  const cylinderUnits = progressGraphReady ? buildCylinderData(allObjectives, progressQuestionTypes) : []

  if (!subject) {
    return <SubjectPicker subjects={subjects} onSelect={setSelectedSubject} student={student} />
  }

  const minsUntilClass = subject.nextClassStart ? getMinutesUntilClass(subject.nextClassStart) : null
  const preClassDone = sessionResults[subject.id]?.preDone
  const exitDone = sessionResults[subject.id]?.exitDone
  const reportReady = sessionResults[subject.id]?.reportData
  const isPreviewMode = !!asStudentId
  const showPreClassNav = true
  const sessionDateKey =
    subject?.sessionDate ||
    sessionResults?.[subject.id]?.sessionDate ||
    dateKeyFromISO(subject?.todayClass?.startTime || subject?.nextClassStart || null, tz)
  const bufferedExitIds = sessionResults?.[subject.id]?.previewTopicIds || null

  tourCorrectLetter = (() => {
    if (!Array.isArray(cylinderUnits) || !cylinderUnits.length) return null
    const norm = normalizeUnitsForScenes(cylinderUnits, shapeMode)
    const unitsN = norm.units
    if (!unitsN?.length) return null
    const unitIdx = drillUnitIdx != null ? Math.min(drillUnitIdx, unitsN.length - 1) : 0
    const activeU = unitsN[unitIdx]
    const lo = activeU?.rings || []
    if (!lo.length) return null
    const loIdx = drillLoIdx != null ? Math.min(drillLoIdx, lo.length - 1) : 0
    const activeL = lo[loIdx]
    const arcs = activeL?.arcs || []
    if (!arcs.length) return null
    const arcIdx = drillQtypeIdx != null ? Math.min(drillQtypeIdx, arcs.length - 1) : 0
    const activeA = arcs[arcIdx]
    const qs = activeA?.questions || []
    if (!qs.length) return null
    const qIdx = drillQuestionIdx != null ? Math.min(drillQuestionIdx, qs.length - 1) : 0
    const q = qs[qIdx]
    if (!q || !Number.isInteger(q.correctIndex)) return null
    return ["A", "B", "C", "D", "E", "F"][q.correctIndex] || null
  })()
  const loMastery = buildLoMasteryMap(progressQuestionTypes)
  const todayKey = dateKeyFromISO(new Date().toISOString(), tz)
  const trackerItems = buildQuestionTrackerData(allObjectives, progressQuestionTypes, todayKey)
  const topImprovementItems = trackerItems
    .filter((item) => item.solvedToday)
    .sort((a, b) => (b.questionDelta - a.questionDelta) || (b.loDelta - a.loDelta) || (b.unitDelta - a.unitDelta) || (b.progressRatio - a.progressRatio))
    .slice(0, 3)
  const weaknessTrackerItems = trackerItems
    .filter((item) => item.weaknessScore > 0)
    .sort((a, b) => (b.weaknessScore - a.weaknessScore) || (a.isLocked === b.isLocked ? 0 : a.isLocked ? 1 : -1))
    .slice(0, 6)

  const mobileVizStages = [
    { id: "subject", label: "subject" },
    { id: "unit", label: "unit" },
    { id: "lo", label: "learning objective" },
    { id: "questionType", label: "question type" },
  ]

  const mobileActionCards = [
    {
      id: "zoom",
      title: subject.hasClassToday ? "Zoom link for today's class" : "Today's class",
      subtitle: subject.name,
      body: subject.hasClassToday
        ? formatClassSlot(subject.todayClass?.startTime, subject.todayClass?.endTime, tz)
        : "No classes scheduled today.",
      ctaLabel: "Zoom link",
      ctaTone: "blue",
      onClick: () => {
        if (subject.hasClassToday && subject.zoomLink && typeof window !== "undefined") {
          window.open(subject.zoomLink, "_blank", "noopener,noreferrer")
        }
      },
      disabled: !subject.hasClassToday || !subject.zoomLink,
    },
    showPreClassNav ? {
      id: "pre",
      title: "Pre class assessment",
      subtitle: subject.name,
      body: preClassDone
        ? `Completed: ${sessionResults[subject.id]?.preScore ?? ""}/${sessionResults[subject.id]?.preTotal ?? ""}`
        : "Open the assessment before class begins.",
      ctaLabel: preClassDone ? "Open again" : "Open pre-class",
      ctaTone: "gold",
      href: `/assessment?subjectId=${subject.id}&mode=pre${asStudentId ? `&as=${asStudentId}` : ''}${sessionDateKey ? `&sessionDate=${encodeURIComponent(sessionDateKey)}` : ""}${assessmentDemoQuery}`,
    } : null,
    {
      id: "exit",
      title: "Exit ticket",
      subtitle: subject.name,
      body: exitDone
        ? `Completed: ${sessionResults[subject.id]?.exitScore ?? ""}/${sessionResults[subject.id]?.exitTotal ?? ""}`
        : "Wrap up the lesson with the exit ticket.",
      ctaLabel: exitDone ? "Open again" : "Open exit ticket",
      ctaTone: "gold",
      href: `/assessment?subjectId=${subject.id}&mode=exit${asStudentId ? `&as=${asStudentId}` : ''}${sessionDateKey ? `&sessionDate=${encodeURIComponent(sessionDateKey)}` : ""}${bufferedExitIds?.length ? `&previewIds=${encodeURIComponent(JSON.stringify(bufferedExitIds))}` : ""}${assessmentDemoQuery}`,
    },
    {
      id: "homework",
      title: "Homework",
      subtitle: subject.name,
      body: "Continue the current homework cycle after class.",
      ctaLabel: "Open homework",
      ctaTone: "gold",
      href: !showcaseMode
        ? `/homework?subjectId=${subject.id}${asStudentId ? `&as=${asStudentId}` : ""}`
        : `/homework?subjectId=${subject.id}${asStudentId ? `&as=${asStudentId}` : ""}&demo=1&showcase=1${router.query.token ? `&token=${encodeURIComponent(router.query.token)}` : ""}`,
    },
    {
      id: "practice",
      title: "Practice room",
      subtitle: subject.name,
      body: isTouchDevice
        ? "Swipe through cards and solve beside the scratchpad."
        : "Move into the workspace and solve beside the scratchpad.",
      ctaLabel: "Open practice",
      ctaTone: "gold",
      href: isTouchDevice
        ? `/practice?subjectId=${subject.id}${asStudentId ? `&as=${asStudentId}` : ""}`
        : undefined,
      onClick: isTouchDevice ? undefined : () => setActiveSection("cylinder"),
    },
    {
      id: "tracker",
      title: "Progress tracker",
      subtitle: subject.name,
      body: "See the strongest gains and the weakest question types.",
      ctaLabel: "Open tracker",
      ctaTone: "gold",
      onClick: () => setActiveSection("tracker"),
    },
    {
      id: "graph",
      title: "Knowledge graph",
      subtitle: subject.name,
      body: "Explore how learning objectives connect across units.",
      ctaLabel: "Open graph",
      ctaTone: "gold",
      onClick: () => setActiveSection("graph"),
    },
  ].filter(Boolean)

  const mobileAction = mobileActionCards[mobileActionIndex] || mobileActionCards[0]
  const mobileVizStage = mobileVizStages[mobileVizIndex]?.id || "subject"
  const mobileVizGuide = {
    subject: {
      title: "Subject map",
      body: "Tap a disk once to highlight it. Double tap a unit to move inward with a smooth slide.",
    },
    unit: {
      title: "Unit focus",
      body: "You are inside one unit now. Double tap a learning objective to move to the next layer.",
    },
    lo: {
      title: "Learning objective",
      body: "This ring isolates one learning objective. Double tap a question type to continue.",
    },
    questionType: {
      title: "Question type",
      body: "The arrows can still review the layers, but this is the last swipe stage before practice.",
    },
  }[mobileVizStage]

  function handleSwipeStart(ref, event) {
    const touch = event.touches?.[0]
    if (!touch) return
    ref.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleSwipeEnd(ref, event, onLeft, onRight) {
    const touch = event.changedTouches?.[0]
    if (!touch) return
    const dx = touch.clientX - ref.current.x
    const dy = touch.clientY - ref.current.y
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) onLeft?.()
    else onRight?.()
  }

  function openPracticeForQuestionType(questionTypeId) {
    if (!questionTypeId) return
    setPracticeFocusQuestionTypeId(questionTypeId)
    setActiveSection("cylinder")
  }

  async function handleDownloadReport() {
    if (!subject?.id) return
    const sessionDate = subject?.sessionDate || sessionResults?.[subject.id]?.sessionDate || ""
    if (!sessionDate) {
      setReportError("No sessionDate is available for this subject. Reports now require an explicit session anchor.")
      return
    }
    setReportLoading(true)
    setReportError(null)
    try {
      const stored = JSON.parse(sessionStorage.getItem("sessionResults") || "{}")
      const current = stored[subject.id] || {}
      const persistedReportUrl = current?.reportData?.reportUrl
      if (persistedReportUrl) {
        window.open(persistedReportUrl, "_blank", "noopener,noreferrer")
        return
      }

      const asParam = asStudentId ? `&as=${asStudentId}` : ""
      const res = await fetch(`/api/student/report?subjectId=${subject.id}${asParam}&sessionDate=${encodeURIComponent(sessionDate)}`)
      const data = await res.json()
      if (data?.error) throw new Error(data.error)
      if (data?.reportUrl) {
        stored[subject.id] = {
          ...current,
          reportData: { ...(current.reportData || {}), reportUrl: data.reportUrl, date: data.sessionDate || data.date || "" },
        }
        sessionStorage.setItem("sessionResults", JSON.stringify(stored))
        setSessionResults({ ...stored })
        window.open(data.reportUrl, "_blank", "noopener,noreferrer")
        return
      }

      const swappedIn = current.swappedIn || []
      const objectives = (todayTopics || []).map(t => {
        const title = t.title || ""
        return swappedIn.includes(title) ? `FIFO: ${title}` : title
      })

      const baselineWeakness = data.weaknessMap?.topics || data.weaknessMap || {}
      const sessionWeakness = (asStudentId && current.weaknessMap?.topics)
        ? current.weaknessMap.topics
        : null

      const generatedAt = new Date().toISOString()
      const reportData = {
        studentName: data.student,
        subject: data.subject,
        date: data.date,
        generatedAt,
        preAssessment: {
          score: current.preScore ?? 0,
          total: current.preTotal ?? 0,
          questions: current.preQuestions || [],
        },
        exitTicket: {
          score: current.exitScore ?? 0,
          total: current.exitTotal ?? 0,
          questions: current.exitQuestions || [],
        },
        objectives,
        fafoTriggered: !!current.swapTriggered,
        fafoTopics: swappedIn,
        weaknessScores: sessionWeakness || baselineWeakness,
        weaknessBaseline: baselineWeakness,
        trends: data.trends || {},
        exitTicketMissed: !exitDone,
      }

      const allQs = [
        ...(current.preQuestions || []),
        ...(current.exitQuestions || [])
      ].filter(Boolean)
      const negatives = allQs.filter(q => q.correct === false)
      const positives = allQs.filter(q => q.correct === true)

      const questionTypeCounts = {
        positive: countBy(positives, q => [q.topic || "Unknown"]),
        negative: countBy(negatives, q => [q.topic || "Unknown"]),
      }

      const loCounts = {
        positive: countBy(positives, q => splitCodes(q.loCode || q.standardCode || "")),
        negative: countBy(negatives, q => splitCodes(q.loCode || q.standardCode || "")),
      }

      const unitFromLo = (code) => {
        if (!code) return ""
        const obj = getObjectiveByCode(student.state, subject.name, code)
        return obj?.standardName || obj?.standardCode || ""
      }

      const unitCounts = {
        positive: countBy(positives, q => {
          if (q.unit) return [q.unit]
          const codes = splitCodes(q.loCode || q.standardCode || "")
          const units = codes.map(unitFromLo).filter(Boolean)
          return units.length ? units : ["Unknown"]
        }),
        negative: countBy(negatives, q => {
          if (q.unit) return [q.unit]
          const codes = splitCodes(q.loCode || q.standardCode || "")
          const units = codes.map(unitFromLo).filter(Boolean)
          return units.length ? units : ["Unknown"]
        }),
      }

      const loScoreMap = sessionWeakness || baselineWeakness
      const unitTotals = (() => {
        const map = {}
        Object.entries(loScoreMap || {}).forEach(([code, score]) => {
          const unit = unitFromLo(code) || "Unknown"
          map[unit] = (map[unit] || 0) + Number(score || 0)
        })
        return Object.entries(map)
          .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
          .sort((a, b) => b.value - a.value)
      })()

      reportData.chartData = {
        questionTypes: questionTypeCounts,
        los: loCounts,
        units: { ...unitCounts, total: unitTotals },
      }

      const { generatePdfBase64 } = await import("../lib/pdf")
      const pdfBase64 = await generatePdfBase64(reportData)
      const uploadRes = await fetch("/api/student/report-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          pdfBase64,
          generatedAt,
          as: asStudentId || null,
          sessionDate,
        })
      })
      const uploadData = await uploadRes.json()
      if (uploadData?.error) throw new Error(uploadData.error)
      if (uploadData?.reportUrl) reportData.reportUrl = uploadData.reportUrl

      stored[subject.id] = { ...current, reportData }
      sessionStorage.setItem("sessionResults", JSON.stringify(stored))
      setSessionResults({ ...stored })

      await downloadReport(reportData)
    } catch (err) {
      setReportError(err.message || "Failed to build report")
    } finally {
      setReportLoading(false)
    }
  }

  const resolvedTheme = themeMode === "paper" ? PAPER_THEME : (TIME_THEMES[timeOfDay] || TIME_THEMES.morning)
  const visualThemeName = (paletteOverride === "ocean" || paletteOverride === "ember" || paletteOverride === "midnight" || paletteOverride === "royal") ? paletteOverride : timeOfDay

  function advanceTour() {
    if (!currentTour) return
    if (currentTour.autoAdvanceToSection) setActiveSection(currentTour.autoAdvanceToSection)
    if (Number.isInteger(currentTour.autoSelectQuestionIdx)) {
      // Mirror "Open Practice →" hover: preserve whatever the student drilled
      // to in overview and fill any missing level with 0 so the Practice Room
      // lands with a real question selected (equivalent to double-clicking a
      // question in the Practice Room's own layout).
      if (drillUnitIdx == null) setDrillUnitIdx(0)
      if (drillLoIdx == null) setDrillLoIdx(0)
      if (drillQtypeIdx == null) setDrillQtypeIdx(0)
      setDrillQuestionIdx(currentTour.autoSelectQuestionIdx)
    }
    if (tourStep >= tourSteps.length - 1) {
      clearTourTargets()
      setTourStep(-1)
      if (!demoMode && !asStudentId && !showcaseMode && typeof window !== "undefined") {
        try {
          localStorage.setItem(DASHBOARD_TOUR_STORAGE_KEY, "1")
        } catch {}
      }
      return
    }
    setTourStep((step) => step + 1)
  }

  function dismissTour() {
    clearTourTargets()
    setTourStep(-1)
    if (!demoMode && !asStudentId && !showcaseMode && typeof window !== "undefined") {
      try {
        localStorage.setItem(DASHBOARD_TOUR_STORAGE_KEY, "1")
      } catch {}
    }
  }

  function handleTourEvent(eventKey) {
    if (!currentTour || currentTour.waitForEvent !== eventKey) return
    if (currentTour.autoAdvanceToSection) setActiveSection(currentTour.autoAdvanceToSection)
    setTourStep((step) => Math.min(step + 1, tourSteps.length - 1))
  }

  // ── Right-column derivations (Daily Check-in + Weakness Areas) ─────────
  // Lifted out of the cylinder IIFE so the right-column widget can reuse
  // them. Both depend only on cylinderUnits + progressQuestionTypes, which
  // are already in scope here. Recomputed each render — the work is small.
  const RIGHT_COL_PALETTE = SHAPE_PALETTE_STOPS[
    SHAPE_PALETTE_KEYS.includes(paletteOverride) ? paletteOverride : "sunset"
  ] || SHAPE_PALETTE_STOPS.ember
  const CHECKIN_WINDOW_DAYS = 90
  const _qtLocation = {}
  ;(cylinderUnits || []).forEach((u, ui) => (u?.rings || []).forEach((r, li) => (r?.arcs || []).forEach((a, ai) => {
    if (a?.questionTypeId) _qtLocation[a.questionTypeId] = { unitIdx: ui, loIdx: li, arcIdx: ai }
  })))
  const _qtColor = (qtId) => {
    const loc = _qtLocation[qtId]
    const idx = loc ? loc.unitIdx : 0
    return RIGHT_COL_PALETTE[idx % RIGHT_COL_PALETTE.length]
  }
  const _daysMap = {}
  ;(progressQuestionTypes || []).forEach((qt) => {
    const dates = Array.isArray(qt.dailySeenDates) ? qt.dailySeenDates : []
    dates.forEach((d) => {
      if (!d) return
      if (!_daysMap[d]) _daysMap[d] = []
      _daysMap[d].push({ id: qt.id, title: qt.title || qt.topic || "Question type", color: _qtColor(qt.id) })
    })
  })
  const _toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  const _windowEnd = new Date()
  const _windowDates = []
  for (let i = CHECKIN_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(_windowEnd); d.setDate(_windowEnd.getDate() - i)
    _windowDates.push(_toIso(d))
  }
  const _windowCounts = _windowDates.map((d) => (_daysMap[d] || []).length)
  const _maxTasksInWindow = Math.max(1, ..._windowCounts)
  const _sessionDays = _windowDates.map((date) => {
    const items = _daysMap[date] || []
    const count = items.length
    let color
    if (count <= 0) color = "var(--rule-soft)"
    else {
      const pos = Math.min(RIGHT_COL_PALETTE.length - 1, Math.round((count / _maxTasksInWindow) * (RIGHT_COL_PALETTE.length - 1)))
      color = RIGHT_COL_PALETTE[pos]
    }
    return { date, items, count, color }
  })
  const _activeDaysCount = _windowCounts.filter((n) => n > 0).length
  const _drillToQt = (qtId) => {
    const loc = _qtLocation[qtId]
    if (!loc) return
    setDrillUnitIdx(loc.unitIdx)
    setDrillLoIdx(loc.loIdx)
    setDrillQtypeIdx(loc.arcIdx)
    setDrillQuestionIdx(null)
    setActiveSection("cylinder")
  }

  // Weakness ranking — sum weaknessScore over the QTs under each Unit / LO,
  // pick the single max QT outright. Click → drills into Practice Room with
  // the matching unit/LO/QT preselected.
  const _qtById = new Map((progressQuestionTypes || []).map((qt) => [qt.id, qt]))
  let _weakestUnit = null, _weakestLO = null, _weakestQT = null
  ;(cylinderUnits || []).forEach((u, ui) => {
    let unitTotal = 0
    ;(u?.rings || []).forEach((r, li) => {
      let loTotal = 0
      ;(r?.arcs || []).forEach((a, ai) => {
        const qt = _qtById.get(a?.questionTypeId)
        const w = Number(qt?.weaknessScore || 0)
        loTotal += w
        if (!_weakestQT || w > _weakestQT.score) {
          _weakestQT = { ui, li, ai, score: w, label: qt?.title || a?.label || a?.type || "—", subLabel: u?.name || "" }
        }
      })
      if (!_weakestLO || loTotal > _weakestLO.score) {
        _weakestLO = { ui, li, score: loTotal, label: r?.name || "—", subLabel: u?.name || "" }
      }
      unitTotal += loTotal
    })
    if (!_weakestUnit || unitTotal > _weakestUnit.score) {
      _weakestUnit = { ui, score: unitTotal, label: u?.name || "—", subLabel: "" }
    }
  })
  const _weakestMax = Math.max(0, _weakestUnit?.score || 0, _weakestLO?.score || 0, _weakestQT?.score || 0)
  const _weaknessRows = [
    _weakestUnit && _weakestUnit.score > 0 && { ...{ kind: "Unit",  drill: { ui: _weakestUnit.ui, li: null, ai: null }, ..._weakestUnit } },
    _weakestLO   && _weakestLO.score   > 0 && { ...{ kind: "LO",    drill: { ui: _weakestLO.ui,   li: _weakestLO.li, ai: null }, ..._weakestLO } },
    _weakestQT   && _weakestQT.score   > 0 && { ...{ kind: "QT",    drill: { ui: _weakestQT.ui,   li: _weakestQT.li, ai: _weakestQT.ai }, ..._weakestQT } },
  ].filter(Boolean)
  const _openWeakness = (drill) => {
    if (drill.ui != null) setDrillUnitIdx(drill.ui)
    if (drill.li != null) setDrillLoIdx(drill.li); else setDrillLoIdx(null)
    if (drill.ai != null) setDrillQtypeIdx(drill.ai); else setDrillQtypeIdx(null)
    setDrillQuestionIdx(null)
    setActiveSection("cylinder")
  }

  return (
    <div className={styles.page} style={resolvedTheme}>
      {impersonationBanner}
      {/* Topbar */}
      <header className={styles.topbar}>
        <div className={styles.topbarLeft}>
          <div className={styles.logoMark}>S</div>
          <span className={styles.logoText} style={{ color: "var(--text)" }}>Scholar</span>
          {showcaseMode && (
            <span className={styles.showcaseBadge}>Showcase Demo</span>
          )}
        </div>
        <div className={styles.topbarRight}>
          {subject?.zoomLink && (
            <a
              className={`${styles.topbarZoomBtn} ${(!subject?.hasClassToday || !subject?.zoomLink) ? styles.disabled : ""}`}
              href={subject?.hasClassToday && subject?.zoomLink ? subject.zoomLink : "#"}
              target="_blank"
              rel="noreferrer"
            >
              <ZoomIcon /> {subject?.hasClassToday ? "Zoom" : "Meeting"}
            </a>
          )}
          {subjects.length > 1 && (
            <button className={styles.switchBtn} onClick={() => setSelectedSubject(null)}>
              Switch Subject
            </button>
          )}
          {!isMobileViewport && (
            <button
              className={styles.guidedNavBtn}
              onClick={() => {
                setDrillUnitIdx(null)
                setDrillLoIdx(null)
                setDrillQtypeIdx(null)
                setDrillQuestionIdx(null)
                setActiveSection("overview")
                setTourStep(0)
              }}
              title="Start guided walkthrough"
            >
              Guided Navigation
            </button>
          )}
          <button
            className={styles.guidedNavBtn}
            onClick={() => setThemeMode(themeMode === "paper" ? "observatory" : "paper")}
            title={themeMode === "paper" ? "Switch to Observatory (dark)" : "Switch to Paper (light)"}
          >
            {themeMode === "paper" ? "Dark" : "Paper"}
          </button>
          {showcaseMode ? (
            <a className={styles.logoutBtn} href={`/api/showcase/logout?next=/showcase/login`}>
              Exit Demo
            </a>
          ) : (
            <button className={styles.logoutBtn} onClick={() => signOut({ callbackUrl: "/" })}>
              Sign out
            </button>
          )}
        </div>
      </header>

      <div className={styles.body}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          {/* Subject info */}
          <section className={styles.sideSection}>
            <h3 className={styles.sideLabel}>Subjects</h3>
            <div className={styles.classWidgetList}>
              {subjects.map((subj) => {
                const upcoming = getUpcomingAfterToday(subj)
                return (
                  <div key={subj.id} className={`${styles.zoomCard} ${subject.id === subj.id ? styles.activeClassCard : ""}`}>
                    <div className={styles.classHeaderRow}>
                      <div className={styles.className}>{subj.name}</div>
                      {subjects.length > 1 && subject.id !== subj.id && (
                        <button className={styles.switchTinyBtn} onClick={() => setSelectedSubject(subj)}>
                          View
                        </button>
                      )}
                    </div>
                    <div className={styles.classTime}>
                      {subj.hasClassToday
                        ? `Today · ${formatClassSlot(subj.todayClass?.startTime, subj.todayClass?.endTime, tz)}`
                        : subj.upcomingClasses?.[0]
                          ? `Next · ${formatClassDate(subj.upcomingClasses[0]?.startTime, tz)} · ${formatClassSlot(subj.upcomingClasses[0]?.startTime, subj.upcomingClasses[0]?.endTime, tz)}`
                          : "No class scheduled yet"}
                    </div>
                    <div className={styles.upcomingMiniList}>
                      {upcoming.map((c) => (
                        <div key={`${subj.id}-${c.startTime}-${c.title}`} className={styles.upcomingMiniItem}>
                          <span>{formatClassDate(c.startTime, tz)}</span>
                          <span>{formatClassSlot(c.startTime, c.endTime, tz)}</span>
                        </div>
                      ))}
                      {!upcoming.length && (
                        <div className={styles.upcomingMiniEmpty}>No additional classes scheduled.</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>


          <section className={styles.sideSection}>
            <h3 className={styles.sideLabel}>Session Report</h3>
            <button
              className={styles.sideLinkBtn}
              onClick={handleDownloadReport}
              disabled={reportLoading || !exitDone}
              title={!exitDone ? "Complete the exit ticket to unlock" : "Download your session report PDF"}
            >
              {reportLoading ? "Generating PDF..." : reportReady ? "Download Again" : "Download PDF"}
            </button>
            {!exitDone && (
              <div className={styles.sideHint}>Unlocks after exit ticket.</div>
            )}
            {reportError && (
              <div className={styles.sideError}>✕ {reportError}</div>
            )}
          </section>

          <section className={styles.sideSection}>
            <h3 className={styles.sideLabel}>🃏 Flashcards</h3>
            <div style={{ display: "flex", flexDirection: "column", minHeight: 360 }}>
              <FlashcardPanel
                subjectId={subject.id}
                asStudentId={asStudentId}
                previewWeakness={sessionResults?.[subject.id]?.previewState?.topicScores || null}
                demoMode={demoMode}
              />
            </div>
          </section>

        </aside>

        {/* Main */}
        <main className={styles.panelShell}>

          {/* TOP CARD: greeting + assessment buttons + hw + today's topics */}
          <section className={styles.topCard}>
            <div className={styles.topCardRow}>
              <div className={styles.topCardGreeting} ref={greetingRef}>
                {isMobileViewport ? (
                  <div className={styles.mobileSubjectName}>{subject.name}</div>
                ) : null}
              </div>
            </div>
            {isMobileViewport && mobileAction ? (
              <div
                className={styles.mobileHeroCard}
                onTouchStart={(event) => handleSwipeStart(mobileActionTouchRef, event)}
                onTouchEnd={(event) =>
                  handleSwipeEnd(
                    mobileActionTouchRef,
                    event,
                    () => setMobileActionIndex((prev) => Math.min(mobileActionCards.length - 1, prev + 1)),
                    () => setMobileActionIndex((prev) => Math.max(0, prev - 1))
                  )
                }
              >
                <div className={styles.mobileHeroArrows}>
                  <button
                    type="button"
                    className={styles.mobileArrowBtn}
                    onClick={() => setMobileActionIndex((prev) => Math.max(0, prev - 1))}
                    disabled={mobileActionIndex === 0}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className={styles.mobileArrowBtn}
                    onClick={() => setMobileActionIndex((prev) => Math.min(mobileActionCards.length - 1, prev + 1))}
                    disabled={mobileActionIndex === mobileActionCards.length - 1}
                  >
                    →
                  </button>
                </div>
                <div className={styles.mobileHeroTitle}>{mobileAction.title}</div>
                <div className={styles.mobileHeroBody}>{mobileAction.body}</div>
                <button
                  type="button"
                  className={`${styles.mobileHeroCta} ${mobileAction.ctaTone === "blue" ? styles.mobileHeroCtaBlue : ""}`}
                  disabled={mobileAction.disabled}
                  onClick={() => {
                    if (mobileAction.href) router.push(mobileAction.href)
                    else mobileAction.onClick?.()
                  }}
                >
                  {mobileAction.ctaLabel}
                </button>
              </div>
            ) : null}
            <div className={styles.panelNav} ref={panelNavRef}>
              <button
                type="button"
                className={`${styles.panelNavBtn} ${activeSection === "overview" ? styles.panelNavBtnActive : ""}`}
                onClick={() => setActiveSection("overview")}
                ref={overviewNavRef}
              >
                Overview
              </button>
              {isTouchDevice ? (
                <Link
                  href={`/practice?subjectId=${subject.id}${asStudentId ? `&as=${asStudentId}` : ""}`}
                  className={styles.panelNavBtn}
                  ref={practiceNavRef}
                >
                  Practice Room
                </Link>
              ) : (
                <button
                  type="button"
                  className={`${styles.panelNavBtn} ${activeSection === "cylinder" ? styles.panelNavBtnActive : ""}`}
                  onClick={() => setActiveSection("cylinder")}
                  ref={practiceNavRef}
                >
                  Practice Room
                </button>
              )}
              <button
                type="button"
                className={`${styles.panelNavBtn} ${activeSection === "tracker" ? styles.panelNavBtnActive : ""}`}
                onClick={() => setActiveSection("tracker")}
                ref={trackerNavRef}
              >
                Progress Tracker: Questions
              </button>
              <button
                type="button"
                className={`${styles.panelNavBtn} ${activeSection === "graph" ? styles.panelNavBtnActive : ""}`}
                onClick={() => setActiveSection("graph")}
                ref={graphNavRef}
              >
                Knowledge Graph
              </button>
              {showPreClassNav && (
                <Link
                  href={`/assessment?subjectId=${subject.id}&mode=pre${asStudentId ? `&as=${asStudentId}` : ''}${sessionDateKey ? `&sessionDate=${encodeURIComponent(sessionDateKey)}` : ""}`}
                  className={`${styles.panelNavBtn} ${styles.panelNavLinkBtn} ${preClassDone ? styles.panelNavBtnDone : ""} ${!preClassDone ? styles.assessBtnFresh : ""}`}
                  ref={preClassNavRef}
                >
                  {!preClassDone && <span className={styles.assessBtnNew}>new</span>}
                  {preClassDone
                    ? `Pre-Class · ${sessionResults[subject.id]?.preScore ?? ""}/${sessionResults[subject.id]?.preTotal ?? ""}`
                    : "Pre-Class Assessment"}
                </Link>
              )}
              <Link
                href={`/assessment?subjectId=${subject.id}&mode=exit${asStudentId ? `&as=${asStudentId}` : ''}${sessionDateKey ? `&sessionDate=${encodeURIComponent(sessionDateKey)}` : ""}${bufferedExitIds?.length ? `&previewIds=${encodeURIComponent(JSON.stringify(bufferedExitIds))}` : ""}`}
                className={`${styles.panelNavBtn} ${styles.panelNavLinkBtn} ${exitDone ? styles.panelNavBtnDone : ""} ${!exitDone ? styles.assessBtnFresh : ""}`}
                ref={exitNavRef}
              >
                {!exitDone && <span className={styles.assessBtnNew}>new</span>}
                {exitDone
                  ? `Exit Ticket · ${sessionResults[subject.id]?.exitScore ?? ""}/${sessionResults[subject.id]?.exitTotal ?? ""}`
                  : "Exit Ticket"}
              </Link>
              {!showcaseMode && <Link
                href={`/homework?subjectId=${subject.id}${asStudentId ? `&as=${asStudentId}` : ""}`}
                className={`${styles.panelNavBtn} ${styles.panelNavLinkBtn}`}
                ref={homeworkNavRef}
              >
                Homework
              </Link>}
              {showcaseMode && <Link
                href={`/homework?subjectId=${subject.id}${asStudentId ? `&as=${asStudentId}` : ""}&demo=1&showcase=1${router.query.token ? `&token=${encodeURIComponent(router.query.token)}` : ""}`}
                className={`${styles.panelNavBtn} ${styles.panelNavLinkBtn}`}
                ref={homeworkNavRef}
              >
                Homework
              </Link>}
            </div>
          </section>

          <section className={styles.mobileZoomSection}>
            <div className={`${styles.zoomCard} ${styles.mobileZoomCard}`}>
              <div className={styles.sideLabel}>Selected Subject</div>
              <div className={styles.classHeaderRow}>
                <div className={styles.className}>{subject.name}</div>
              </div>
              <div className={styles.classTime}>
                {subject.hasClassToday
                  ? `Today · ${formatClassSlot(subject.todayClass?.startTime, subject.todayClass?.endTime, tz)}`
                  : subject.upcomingClasses?.[0]
                    ? `Next · ${formatClassDate(subject.upcomingClasses[0]?.startTime, tz)} · ${formatClassSlot(subject.upcomingClasses[0]?.startTime, subject.upcomingClasses[0]?.endTime, tz)}`
                    : "No class scheduled yet"}
              </div>
              <div className={styles.upcomingMiniList}>
                {getUpcomingAfterToday(subject).map((c) => (
                  <div key={`${subject.id}-${c.startTime}-${c.title}`} className={styles.upcomingMiniItem}>
                    <span>{formatClassDate(c.startTime, tz)}</span>
                    <span>{formatClassSlot(c.startTime, c.endTime, tz)}</span>
                  </div>
                ))}
                {!getUpcomingAfterToday(subject).length && (
                  <div className={styles.upcomingMiniEmpty}>No additional classes scheduled.</div>
                )}
              </div>
            </div>
          </section>

          {activeSection === "overview" ? (
            <div className={styles.bottomDock}>
              <section className={styles.pieStack}>
              {isMobileViewport && (
              <div className={styles.masteryIntro}>
                <div className={styles.masteryEyebrow}>Mastery Map</div>
                {isMobileViewport ? (
                  <div className={styles.masterySteps}>
                    <div className={styles.masteryStep}><strong>1.</strong> Begin with your name and the class cards above.</div>
                    <div className={styles.masteryStep}><strong>2.</strong> Swipe through pre-class, exit ticket, homework, practice, and tracker.</div>
                    <div className={styles.masteryStep}><strong>3.</strong> In the 3D map, tap once to select. Double tap to move from subject to unit to learning objective to question type.</div>
                    <div className={styles.masteryStep}><strong>4.</strong> Review flashcards below after the visualization.</div>
                  </div>
                ) : (
                  <p className={styles.masteryText}>
                    Welcome to your personal Scholar. Not a checklist. A living structure - question arcs, learning objectives, all in three dimensions. Every answer you give colors the geometry. Questions you struggle with become learning objectives. Nothing slips through.
                  </p>
                )}
                <div className={styles.shapeToggleRow}>
                  <span className={styles.shapeToggleLabel}>3D object</span>
                  <button
                    type="button"
                    className={`${styles.shapeToggleBtn} ${shapeMode === "cylinder" ? styles.shapeToggleBtnActive : ""}`}
                    onClick={() => setShapeMode("cylinder")}
                    aria-pressed={shapeMode === "cylinder"}
                  >
                    Cylinder
                  </button>
                  <button
                    type="button"
                    className={`${styles.shapeToggleBtn} ${shapeMode === "cube" ? styles.shapeToggleBtnActive : ""}`}
                    onClick={() => setShapeMode("cube")}
                    aria-pressed={shapeMode === "cube"}
                  >
                    Cube
                  </button>
                  <button
                    type="button"
                    className={`${styles.shapeToggleBtn} ${shapeMode === "torus" ? styles.shapeToggleBtnActive : ""}`}
                    onClick={() => setShapeMode("torus")}
                    aria-pressed={shapeMode === "torus"}
                  >
                    Torus
                  </button>
                </div>
                <div className={styles.shapeToggleRow}>
                  <span className={styles.shapeToggleLabel}>Palette</span>
                  {[
                    { key: "sunset",   stops: ["#FE4365","#FC9D9A","#F9CDA0","#C8C8A9","#83AF9B"], label: "Sunset"   },
                    { key: "ocean",    stops: ["#554F4F","#547980","#45ADA8","#9DE0AD","#E5FCC2"], label: "Ocean"    },
                    { key: "ember",    stops: ["#FF4E50","#FC913A","#F9D423","#EDE574","#E1F5C4"], label: "Ember"    },
                    { key: "midnight", stops: ["#0A0A2E","#1A1A5E","#C9A84C","#E8D48B","#FFFFFF"], label: "Midnight" },
                    { key: "royal",    stops: ["#1A1A5E","#C9A84C","#E8D48B","#F0E8B0","#FFFFFF"], label: "Royal"    },
                  ].map(({ key, stops, label }) => {
                    const isActive = paletteOverride === key || (!paletteOverride && key === "sunset")
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`${styles.shapeToggleBtn} ${isActive ? styles.shapeToggleBtnActive : ""}`}
                        onClick={() => setPaletteOverride(key === "sunset" ? null : key)}
                        aria-pressed={isActive}
                        title={label}
                      >
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            display: "inline-block", width: 40, height: 7, borderRadius: 999,
                            background: `linear-gradient(to right, ${stops.join(",")})`,
                            flexShrink: 0,
                          }} />
                          {label}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
              )}
              {isMobileViewport ? (
                <div className={styles.mobileVizStack}>
                  <div className={styles.mobileVizLabel}>
                    Visualization: {mobileVizStages[mobileVizIndex]?.label || "subject"}
                  </div>
                  <div className={styles.mobileVizGuideCard}>
                    <div className={styles.mobileVizGuideTitle}>{mobileVizGuide?.title}</div>
                    <div className={styles.mobileVizGuideBody}>{mobileVizGuide?.body}</div>
                  </div>
                  <div
                    className={styles.mobileVizShell}
                    onTouchStart={(event) => handleSwipeStart(mobileVizTouchRef, event)}
                    onTouchEnd={(event) =>
                      handleSwipeEnd(
                        mobileVizTouchRef,
                        event,
                        () => setMobileVizIndex((prev) => Math.min(mobileVizStages.length - 1, prev + 1)),
                        () => setMobileVizIndex((prev) => Math.max(0, prev - 1))
                      )
                    }
                  >
                    <div className={styles.mobileVizToolbar}>
                      <button
                        type="button"
                        className={styles.mobileArrowBtn}
                        onClick={() => setMobileVizIndex((prev) => Math.max(0, prev - 1))}
                        disabled={mobileVizIndex === 0}
                      >
                        ←
                      </button>
                      <div className={styles.mobileVizHint}>
                        Swipe to {mobileVizIndex < mobileVizStages.length - 1 ? mobileVizStages[mobileVizIndex + 1]?.label : "review"}
                      </div>
                      <button
                        type="button"
                        className={styles.mobileArrowBtn}
                        onClick={() => setMobileVizIndex((prev) => Math.min(mobileVizStages.length - 1, prev + 1))}
                        disabled={mobileVizIndex === mobileVizStages.length - 1}
                      >
                        →
                      </button>
                    </div>
                    <div ref={overviewSceneRef}>
                      {showCylinderLoading ? (
                        <div style={{ minHeight: 420, display: "grid", placeItems: "center", color: "var(--muted)" }}>
                          Loading topic map...
                        </div>
                      ) : (
                        <SubjectCylinder3D
                          key={`${subject.id}-${visualThemeName}-${shapeMode}-overview-mobile`}
                          subjectId={subject.id}
                          asStudentId={asStudentId}
                          subjectName={subject.name}
                          units={cylinderUnits}
                          themeName={visualThemeName}
                          shapeMode={shapeMode}
                          mode="display"
                          mobileStage={mobileVizStage}
                          onMobileAdvance={(targetStage) => {
                            const targetIndex = mobileVizStages.findIndex((item) => item.id === targetStage)
                            if (targetIndex >= 0) setMobileVizIndex(targetIndex)
                          }}
                          onProgressMutate={() => loadProgressGraph(subject.id, { silent: true })}
                          demoQuery={cylinderDemoQuery}
                          tourRefs={{ overviewSubjectRef, overviewUnitRef, overviewLoRef }}
                          onTourEvent={handleTourEvent}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div ref={overviewSceneRef} style={{ padding: "var(--s6) var(--s6) var(--s8)", minHeight: 0 }}>
                  {(() => {
                    const effectivePalette = SHAPE_PALETTE_KEYS.includes(paletteOverride) ? paletteOverride : "sunset"
                    const loValues = Object.values(loMastery || {})
                    const masteryPct = subject.mastery != null
                      ? Math.round(Number(subject.mastery))
                      : (loValues.length
                          ? Math.round(100 * loValues.reduce((sum, v) => sum + v, 0) / loValues.length)
                          : 0)
                    const miss = loValues.filter((v) => v < 0.25).length || 1
                    const learn = loValues.filter((v) => v >= 0.25 && v < 0.6).length || 1
                    const ok = loValues.filter((v) => v >= 0.6 && v < 0.9).length || 1
                    const mastered = loValues.filter((v) => v >= 0.9).length || 1
                    const totalSeg = miss + learn + ok + mastered
                    const answeredToday = (trackerItems || []).filter((t) => t.solvedToday).reduce((sum, t) => sum + (t.attemptedCount || 0), 0)
                    const objectivesMastered = Object.values(loMastery || {}).filter((v) => v >= 0.9).length
                    const nowLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })
                    const firstName = (student.name || "Scholar").split(" ")[0]
                    const rawUnits = cylinderUnits || []
                    const normalized = normalizeUnitsForScenes(rawUnits, shapeMode)
                    const units = normalized.units
                    const unitHeight = normalized.unitHeight
                    const totalHeight = normalized.totalHeight
                    const secondaryHeight = normalized.secondaryHeight
                    const unitIdxOrNull = drillUnitIdx != null && units.length ? Math.min(drillUnitIdx, units.length - 1) : null
                    const activeUnit = unitIdxOrNull != null ? units[unitIdxOrNull] : null
                    const loList = activeUnit?.rings || []
                    const loIdxOrNull = drillLoIdx != null && loList.length ? Math.min(drillLoIdx, loList.length - 1) : null
                    const activeLo = loIdxOrNull != null ? loList[loIdxOrNull] : null
                    const arcList = activeLo?.arcs || []
                    const arcIdxOrNull = drillQtypeIdx != null && arcList.length ? Math.min(drillQtypeIdx, arcList.length - 1) : null
                    const activeArc = arcIdxOrNull != null ? arcList[arcIdxOrNull] : null

                    const unitLabel = activeUnit?.name || "All units"
                    const objectiveLabel = activeLo?.name || "—"
                    const activeUnitPct = Math.round(100 * (Number(activeUnit?.mastery) || 0))
                    const activeLoPct = Math.round(100 * (Number(activeLo?.mastery) || 0))
                    const activeArcPct = Math.round(100 * (Number(activeArc?.mastery) ?? Number(activeArc?.opacity) ?? 0))



                    const handleStackSelect = (idx) => {
                      if (idx == null || !units.length) return
                      setDrillUnitIdx(idx)
                      setDrillLoIdx(null)
                      setDrillQtypeIdx(null)
                      setDrillQuestionIdx(null)
                      handleTourEvent("overview-unit-selected")
                    }
                    const handleDiskSelect = (ring) => {
                      if (!ring || !loList.length) return
                      const idx = loList.findIndex((r) => r.code === ring.code)
                      if (idx < 0) return
                      setDrillLoIdx(idx)
                      setDrillQtypeIdx(null)
                      setDrillQuestionIdx(null)
                      handleTourEvent("overview-ring-selected")
                    }
                    const handleRingSelect = (arc) => {
                      if (!arc || !arcList.length) return
                      const idx = arcList.findIndex((a) => a.questionTypeId === arc.questionTypeId)
                      if (idx < 0) return
                      setDrillQtypeIdx(idx)
                      setDrillQuestionIdx(null)
                      handleTourEvent("overview-arc-selected")
                    }
                    const collapseToLevel = (lvl) => {
                      if (lvl <= 0) setDrillUnitIdx(null)
                      if (lvl <= 1) setDrillLoIdx(null)
                      if (lvl <= 2) setDrillQtypeIdx(null)
                      if (lvl <= 3) setDrillQuestionIdx(null)
                    }
                    const missTracker = missTrackerRef.current
                    const makeMissHandler = (lvl) => (e) => {
                      const now = (typeof performance !== "undefined" ? performance.now() : Date.now())
                      const prev = missTracker[lvl] || 0
                      if (now - prev < 350) {
                        missTracker[lvl] = 0
                        collapseToLevel(lvl)
                      } else {
                        missTracker[lvl] = now
                      }
                    }
                    const handleArcSelect = (question) => {
                      if (!activeArc) return
                      const total = Math.max(1, activeArc.total || activeArc.questions?.length || 1)
                      let idx = 0
                      if (question && Number.isInteger(question.index)) {
                        idx = question.index
                      } else if (question && question.questionId != null && Array.isArray(activeArc.questions)) {
                        const found = activeArc.questions.findIndex((q) => q?.id === question.questionId || q?.questionId === question.questionId)
                        if (found >= 0) idx = found
                      }
                      setDrillQuestionIdx(Math.max(0, Math.min(total - 1, idx)))
                    }
                    const drillLevel = drillQuestionIdx != null ? 4
                      : arcIdxOrNull != null ? 3
                      : loIdxOrNull != null ? 2
                      : unitIdxOrNull != null ? 1
                      : 0
                    const gridLayout = (() => {
                      if (drillLevel === 0) return { gridTemplateColumns: "1fr", gridTemplateRows: "1fr", gridTemplateAreas: `"stack"` }
                      if (drillLevel === 1) return { gridTemplateColumns: "1fr 2fr", gridTemplateRows: "1fr", gridTemplateAreas: `"disk stack"` }
                      if (drillLevel === 2) return { gridTemplateColumns: "1fr 2fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: `"ring stack" "ring disk"` }
                      if (drillLevel === 3) return { gridTemplateColumns: "1fr 1fr 1fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: `"arc stack disk" "arc ring ring"` }
                      return { gridTemplateColumns: "3fr 2fr 2fr 2fr", gridTemplateRows: "1fr 1fr", gridTemplateAreas: `"question stack disk ring" "question arc arc arc"` }
                    })()
                    const subStage = { position: "relative", background: "var(--stage)", border: "1px solid var(--rule)", overflow: "hidden", minWidth: 0, minHeight: 0 }
                    return (
                      <>
                        <div className="obs-hero">
                          <div>
                            <div className="obs-hero-greet">{nowLabel}</div>
                            <h1>Good {timeOfDay},<br/><em>{firstName}</em>.</h1>
                            <div className="obs-hero-quote">{pickHeroGreeting(timeOfDay, firstName)}</div>
                          </div>
                          <div />
                          <div className="obs-hero-meta">
                            <div><b>{answeredToday}</b> questions answered today</div>
                            <div><b>{objectivesMastered}</b> objectives mastered</div>
                            <div><b>{subject.units || (cylinderUnits?.length || 0)}</b> units in this subject</div>
                          </div>
                        </div>

                        <div className="obs-strip">
                          <div className="obs-palettes">
                            <span className="obs-label" style={{ marginRight: 4 }}>Object</span>
                            {SHAPE_MODES.map((mode) => (
                              <button
                                key={mode.key}
                                type="button"
                                className="obs-palette"
                                data-active={shapeMode === mode.key}
                                onClick={() => setShapeMode(mode.key)}
                              >
                                {mode.label}
                              </button>
                            ))}
                            <span style={{ flex: 1 }} />
                            <span className="obs-label" style={{ marginRight: 4 }}>Palette</span>
                            <div ref={tourPaletteRowRef} style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                              {SHAPE_PALETTE_KEYS.map((p) => (
                                <button
                                  key={p}
                                  ref={effectivePalette === p ? tourColorLegendRef : null}
                                  type="button"
                                  className="obs-palette"
                                  data-active={effectivePalette === p}
                                  onClick={() => {
                                    setPaletteOverride(p)
                                    handleTourEvent("palette-selected")
                                  }}
                                >
                                  <i
                                    style={{ background: `linear-gradient(90deg, ${SHAPE_PALETTE_STOPS[p].join(",")})` }}
                                  />
                                  <span>{p}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {todayTopics?.length ? (
                          <div className="obs-ticker" aria-label="Today's objectives">
                            <div className="obs-ticker-label">Today&apos;s objectives</div>
                            <div className="obs-ticker-track">
                              <div className="obs-ticker-reel">
                                {[...todayTopics, ...todayTopics].map((topic, i) => (
                                  <span
                                    key={i}
                                    className="obs-objective"
                                    data-state={
                                      sessionResults[subject.id]?.swappedIn?.includes(topic.title) ? "learning" : "ok"
                                    }
                                  >
                                    {topic.title}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : null}

                        <div className="obs-coords obs-coords--lead">
                          <span>Subject <b>{subject.name}</b></span><span className="sep">/</span>
                          <span>Unit <b>{unitLabel}</b></span><span className="sep">/</span>
                          <span>Objective <b>{objectiveLabel}</b></span><span className="sep">/</span>
                          <span>Mastery <b>{masteryPct}%</b></span>
                        </div>

                        <div className="obs-sec obs-sec--stage" ref={subjectStackRef}>
                          <div className="obs-sec-head">
                            <div className="obs-label">§ 01 — {drillLevel === 0 ? "Subject stack" : drillLevel === 1 ? "Unit disk" : drillLevel === 2 ? (shapeMode === "cube" ? "Section" : "Objective ring") : drillLevel === 3 ? "Question arc" : "Question slice"}</div>
                            {(() => {
                              const stackName = shapeMode === "torus" ? "torus" : shapeMode === "cube" ? "bar" : "cylinder"
                              const unitName  = shapeMode === "torus" ? "segment" : shapeMode === "cube" ? "slice" : "disk"
                              const ringName  = shapeMode === "cube" ? "section" : "ring"
                              const arcName   = "arc"
                              const sliceName = "slice"
                              const head = (() => {
                                if (drillLevel === 4) return { title: drillQuestionIdx != null ? `Question ${String(drillQuestionIdx + 1).padStart(2, "0")}` : "Question", body: `Each ${sliceName} represents a single question attempt.` }
                                if (drillLevel === 3) return { title: activeArc?.type || activeArc?.name || "Question type", body: `An ${arcName} groups one question type. Double click on a ${sliceName} for more.` }
                                if (drillLevel === 2) return { title: activeLo?.name || (shapeMode === "cube" ? "Section" : "Learning objective"), body: `A ${ringName} represents one ${shapeMode === "cube" ? "section" : "learning objective"}. Double click on an ${arcName} for more.` }
                                if (drillLevel === 1) return { title: activeUnit?.name || "Unit", body: `A ${unitName} represents one chapter. Double click on a ${ringName} for more.` }
                                return { title: subject.name, body: `The full ${stackName} represents the entire course's work. Double click on a ${unitName} for more.` }
                              })()
                              const NOISE_WORD = /^\s*(?:chapter|lesson|unit|section|sec|module|mod|part|topic|ch\.?|lsn\.?|page|pg\.?|exercise(?:s)?|exer|ex\.?|test(?:s)?|quiz(?:zes|es)?|assessment(?:s)?|review(?:s)?|worksheet(?:s)?|ws|homework|hw|practice|problem(?:s)?|prob|prb|set|no\.?|num|number|n°|the|an?|of|for|on|in|to|from|and|or|intro(?:duction)?|overview|appendix|prelude|unit[- ]?test)\b[\s.:,\-–—)(]*/i
                              const NUM_TOKEN = /^\s*(?:\d+[a-z]?|[ivxlcdm]+(?=\s|$|[-–—:.,)]))\b[\s.:,\-–—)(]*/i
                              const PUNCT_LEAD = /^\s*[-–—:.,)(\u2013\u2014]+\s*/
                              const stripTitleNoise = (raw) => {
                                if (!raw) return ""
                                let prev = null
                                let cur = String(raw)
                                while (cur !== prev) {
                                  prev = cur
                                  cur = cur.replace(NOISE_WORD, "").replace(NUM_TOKEN, "").replace(PUNCT_LEAD, "")
                                }
                                return cur.trim()
                              }
                              const cleanTitle = stripTitleNoise(head.title) || (head.title || "").trim()
                              const [firstWord, ...restWords] = cleanTitle.split(/\s+/)
                              const rest = restWords.join(" ")
                              return (
                                <div className="obs-head-stack" key={`head-${drillLevel}-${unitIdxOrNull ?? "_"}-${loIdxOrNull ?? "_"}-${arcIdxOrNull ?? "_"}-${drillQuestionIdx ?? "_"}`}>
                                  <div className="obs-head-title">
                                    <MathText text={firstWord || "—"} className="obs-head-title-first" />
                                    {rest ? <MathText text={rest} className="obs-head-title-rest" /> : null}
                                  </div>
                                  <p className="obs-head-body"><MathText text={head.body} /></p>
                                </div>
                              )
                            })()}
                            <div className="obs-meter obs-meter--split" style={{ marginTop: 16 }}>
                              <i className="m-miss" style={{ flex: miss / totalSeg }} />
                              <i className="m-learn" style={{ flex: learn / totalSeg }} />
                              <i className="m-ok" style={{ flex: ok / totalSeg }} />
                              <i className="m-rest" style={{ flex: mastered / totalSeg }} />
                            </div>
                            <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-4)", letterSpacing: "0.08em" }}>
                              <span>0%</span>
                              <span><b style={{ color: "var(--fg-2)" }}>{masteryPct}%</b></span>
                              <span>100%</span>
                            </div>
                          </div>

                          <div className="obs-sec-body">
                            <div className="obs-stage-window">
                            <div className="obs-stage-topbar"><MathText text={subject.name} /></div>
                            <div
                              ref={tourScenePanelRef}
                              className="obs-stage"
                              style={{
                                aspectRatio: "16/7",
                                minHeight: 420,
                                display: "grid",
                                gap: 1,
                                background: "var(--rule)",
                                padding: 0,
                                ...gridLayout,
                              }}
                            >
                              <div ref={overviewStackRef} style={{ ...subStage, gridArea: "stack" }}>
                                <div className="obs-cell-label">Subject</div>
                                {showCylinderLoading ? (
                                  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "var(--fg-3)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                                    Loading topic map…
                                  </div>
                                ) : (
                                  <StackPanel
                                    shapeMode={shapeMode}
                                    units={units}
                                    totalHeight={totalHeight}
                                    palette={effectivePalette}
                                    selectedIdx={unitIdxOrNull}
                                    onHighlightUnit={handleStackSelect}
                                    onDrillUnit={handleStackSelect}
                                    onPointerMissed={makeMissHandler(0)}
                                  />
                                )}
                                <div className="obs-corners"><i/><i/><i/><i/></div>
                              </div>

                              {drillLevel >= 1 && (
                                <div ref={overviewUnitRef} style={{ ...subStage, gridArea: "disk" }}>
                                  <div className="obs-cell-label">Unit</div>
                                  <DiskPanel
                                    key={`disk-${unitIdxOrNull ?? "none"}-${shapeMode}`}
                                    shapeMode={shapeMode}
                                    unit={activeUnit}
                                    unitHeight={unitHeight}
                                    palette={effectivePalette}
                                    selectedRingCode={activeLo?.code || ""}
                                    onHighlightRing={handleDiskSelect}
                                    onDrillRing={handleDiskSelect}
                                    onPointerMissed={makeMissHandler(1)}
                                  />
                                  <div className="obs-corners"><i/><i/><i/><i/></div>
                                </div>
                              )}

                              {drillLevel >= 2 && (
                                <div ref={overviewLoRef} style={{ ...subStage, gridArea: "ring" }}>
                                  <div className="obs-cell-label">{shapeMode === "cube" ? "Section" : "Learning Objective"}</div>
                                  <RingPanel
                                    key={`ring-${unitIdxOrNull ?? "none"}-${loIdxOrNull ?? "none"}-${shapeMode}`}
                                    shapeMode={shapeMode}
                                    ring={activeLo}
                                    ringHeight={secondaryHeight}
                                    palette={effectivePalette}
                                    activeArc={activeArc}
                                    onHighlightArc={handleRingSelect}
                                    onDrillArc={handleRingSelect}
                                    onPointerMissed={makeMissHandler(2)}
                                  />
                                  <div className="obs-corners"><i/><i/><i/><i/></div>
                                </div>
                              )}

                              {drillLevel >= 3 && (
                                <div ref={overviewArcRef} style={{ ...subStage, gridArea: "arc" }}>
                                  <div className="obs-cell-label">Question Type</div>
                                  <ArcPanel
                                    key={`arc-${unitIdxOrNull ?? "none"}-${loIdxOrNull ?? "none"}-${arcIdxOrNull ?? "none"}-${shapeMode}`}
                                    shapeMode={shapeMode}
                                    ring={activeLo}
                                    arcId={activeArc?.questionTypeId || null}
                                    ringHeight={secondaryHeight}
                                    palette={effectivePalette}
                                    onDrillQuestion={handleArcSelect}
                                    onPointerMissed={makeMissHandler(3)}
                                  />
                                  <div className="obs-corners"><i/><i/><i/><i/></div>
                                </div>
                              )}

                              {drillLevel >= 4 && (
                                <div style={{ ...subStage, gridArea: "question" }}>
                                  <div className="obs-cell-label">Question</div>
                                  <PracticeHoverOverlay
                                    onOpen={() => {
                                      if (unitIdxOrNull != null) setDrillUnitIdx(unitIdxOrNull)
                                      if (loIdxOrNull != null) setDrillLoIdx(loIdxOrNull)
                                      if (arcIdxOrNull != null) setDrillQtypeIdx(arcIdxOrNull)
                                      setDrillQuestionIdx(drillQuestionIdx ?? 0)
                                      setActiveSection("cylinder")
                                    }}
                                  >
                                    <QuestionPanel
                                      key={`q-${unitIdxOrNull ?? "none"}-${loIdxOrNull ?? "none"}-${arcIdxOrNull ?? "none"}-${shapeMode}`}
                                      shapeMode={shapeMode}
                                      ring={activeLo}
                                      arcId={activeArc?.questionTypeId || null}
                                      questionIdx={drillQuestionIdx}
                                      ringHeight={secondaryHeight}
                                      palette={effectivePalette}
                                      onDrillQuestion={handleArcSelect}
                                      onPointerMissed={makeMissHandler(4)}
                                    />
                                  </PracticeHoverOverlay>
                                  <div className="obs-corners"><i/><i/><i/><i/></div>
                                </div>
                              )}
                            </div>
                            </div>

                            <div>
                              <div className="obs-callout">
                                <div className="dot">01</div>
                                <div>
                                  <span className="tag">Drill in</span>
                                  <b>Click a band to isolate a unit.</b>
                                  <p>The full cylinder collapses into one disk; the disk becomes the stage for objective rings.</p>
                                </div>
                              </div>
                              <div className="obs-callout">
                                <div className="dot">02</div>
                                <div>
                                  <span className="tag">Question arcs</span>
                                  <b>Each ring splits into arcs by question type.</b>
                                  <p>Arc length encodes volume; hue encodes recency; saturation encodes mastery.</p>
                                </div>
                              </div>
                              <div className="obs-callout">
                                <div className="dot">03</div>
                                <div>
                                  <span className="tag">Weakness signal</span>
                                  <b>Drops below 60% spawn a flashcard automatically.</b>
                                  <p>Weaknesses stay visible until the question type returns above threshold on three spaced attempts.</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                      </>
                    )
                  })()}
                </div>
              )}
              </section>
              <section className={styles.flashcardsSection}>
                {/* Daily Check-in — compact for the right column. */}
                <div className={styles.miniLabel}>📅 Daily Check-in</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 6 }}>
                  <span>Less</span>
                  <span style={{ display: "inline-flex", gap: 2 }}>
                    <i style={{ display: "inline-block", width: 9, height: 9, background: "var(--rule-soft)" }} />
                    {RIGHT_COL_PALETTE.map((stop, idx) => (
                      <i key={idx} style={{ display: "inline-block", width: 9, height: 9, background: stop }} />
                    ))}
                  </span>
                  <span>More</span>
                </div>
                <div style={{ marginBottom: 4, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--fg-3)", letterSpacing: "0.10em", textTransform: "uppercase" }}>
                  Past {CHECKIN_WINDOW_DAYS} days · {_activeDaysCount} active
                </div>
                <div className="obs-map" style={{ maxWidth: "100%", margin: "0 0 12px" }}>
                  {_sessionDays.map((day) => {
                    const title = [day.date, `${day.count} task${day.count === 1 ? "" : "s"}`, ...day.items.map((it) => `• ${it.title}`)].join("\n")
                    const firstId = day.items[0]?.id
                    return (
                      <i
                        key={day.date}
                        title={title}
                        style={{ background: day.color, cursor: firstId ? "pointer" : "default" }}
                        onClick={() => { if (firstId) _drillToQt(firstId) }}
                      />
                    )
                  })}
                </div>

                {/* Weakness Areas */}
                <div className={styles.miniLabel} style={{ marginTop: 8 }}>🎯 Top Weakness Areas</div>
                {_weaknessRows.length === 0 ? (
                  <div style={{ fontSize: 11, color: "var(--fg-3)", padding: "8px 0" }}>
                    No weakness signals yet — keep practicing.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {_weaknessRows.map((row, i) => {
                      const pct = _weakestMax > 0 ? Math.max(8, Math.round((row.score / _weakestMax) * 100)) : 0
                      return (
                        <button
                          key={`${row.kind}-${i}`}
                          type="button"
                          onClick={() => _openWeakness(row.drill)}
                          title={`Open weakest ${row.kind} in Practice Room`}
                          style={{
                            display: "block", textAlign: "left",
                            background: "transparent", border: "1px solid var(--rule)",
                            borderRadius: 0, padding: "8px 10px", cursor: "pointer",
                            color: "var(--fg)", fontFamily: "inherit",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: 9,
                              letterSpacing: "0.12em", textTransform: "uppercase",
                              color: "var(--fg-3)",
                            }}>{row.kind}</span>
                            <span style={{ fontSize: 10, color: "var(--fg-3)" }}>
                              {row.score.toFixed(1)}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--fg)", lineHeight: 1.3, margin: "2px 0 6px" }}>
                            {row.label}
                          </div>
                          {row.subLabel && row.kind !== "Unit" && (
                            <div style={{ fontSize: 10, color: "var(--fg-3)", marginBottom: 6 }}>
                              {row.subLabel}
                            </div>
                          )}
                          <div style={{ height: 4, background: "var(--rule-soft)", position: "relative" }}>
                            <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "var(--red)" }} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </section>
            </div>
          ) : activeSection === "graph" ? (
            <section className={styles.cylinderLabShell}>
              <div className={styles.masteryIntro}>
                <div className={styles.masteryEyebrow}>Knowledge Graph</div>
                <p className={styles.masteryText}>
                  {asStudentId
                    ? "Visual map of how learning objectives reinforce each other. Click two nodes to add a directed connection."
                    : "See how topics connect. Click two nodes to suggest a connection between them."}
                </p>
                <button
                  className={styles.sideLinkBtn}
                  style={{ marginTop: 10 }}
                  disabled={loGraphRebuilding}
                  onClick={() => {
                    if (!selectedSubject?.id) return
                    setLoGraphRebuilding(true)
                    fetch("/api/student/rebuild-lo-graph", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        subjectId: selectedSubject.id,
                        ...(asStudentId ? { asStudentId } : {}),
                      }),
                    })
                      .then(r => r.json())
                      .then(d => { if (d?.graph) setLoGraph(d.graph) })
                      .catch(() => {})
                      .finally(() => setLoGraphRebuilding(false))
                  }}
                >
                  {loGraphRebuilding ? "Rebuilding…" : "Rebuild from my answers"}
                </button>
              </div>
              <LOGraphView
                graph={loGraph || { nodes: {}, edges: [] }}
                mastery={loMastery}
                editable
                height={560}
                onEdgeAdd={(from, to) => {
                  const url = asStudentId ? "/api/admin/lo-graph" : "/api/student/lo-graph"
                  fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ from, to, weight: 0.5 }),
                  })
                    .then(r => r.json())
                    .then(d => { if (d?.graph) setLoGraph(d.graph) })
                    .catch(() => {})
                }}
              />
            </section>
          ) : activeSection === "tracker" ? (
            <section className={styles.cylinderLabShell}>
              <div className={styles.masteryIntro}>
                <div className={styles.masteryEyebrow}>Progress Tracker</div>
                <p className={styles.masteryText}>
                  Track which question types moved today, then jump straight into your biggest weakness areas with the matching question type preloaded in Practice Room.
                </p>
              </div>
                <ProgressTrackerQuestions
                topItems={topImprovementItems}
                weaknessItems={weaknessTrackerItems}
                onOpenPractice={openPracticeForQuestionType}
                themeGold={resolvedTheme["--gold"]}
                themeRed={resolvedTheme["--red"]}
                subjectName={subject.name}
              />
            </section>
          ) : (
            <section className={styles.cylinderLabShell}>
              <div className={styles.masteryIntro}>
                <div className={styles.masteryEyebrow}>Practice Room</div>
                <p className={styles.masteryText}>
                  The practice room keeps the 3D topic map and the scratchpad in the same place, so the student can move
                  from topic structure into active solving without leaving the workspace.
                </p>
                <div className={styles.shapeToggleHint}>Using {shapeLabel} view from the dashboard.</div>
              {/* ── Question search inside the Practice Room. Below the
                  shape-toggle hint per the user's spec. Click a result →
                  the 3D scene drills to the matching unit / LO / QT /
                  question, and the QuestionPanel below renders the
                  selected question. ─────────────────────────────────── */}
              <div style={{ position: "relative", marginTop: 14 }}>
                <input
                  type="text"
                  placeholder="search for questions"
                  value={questionSearchQuery}
                  onChange={(e) => { setQuestionSearchQuery(e.target.value); setQuestionSearchOpen(true) }}
                  onFocus={() => setQuestionSearchOpen(true)}
                  onBlur={() => setTimeout(() => setQuestionSearchOpen(false), 200)}
                  style={{
                    width: "100%", maxWidth: 520,
                    padding: "8px 12px",
                    border: "1px solid var(--border)",
                    borderRadius: 0,
                    fontSize: 13,
                    background: "var(--surface)",
                    color: "var(--fg)",
                    outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                {questionSearchOpen && (questionSearchQuery.trim().length >= 2) && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0,
                    width: "100%", maxWidth: 520,
                    marginTop: 4, maxHeight: 420, overflowY: "auto",
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 0,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                    zIndex: 50,
                    color: "var(--fg)",
                    fontSize: 12,
                  }}>
                    {questionSearchLoading && (
                      <div style={{ padding: "10px 12px", color: "var(--fg-3)" }}>Searching…</div>
                    )}
                    {questionSearchError && (
                      <div style={{ padding: "10px 12px", color: "#7a2424", background: "#ffe9e9" }}>
                        {questionSearchError}
                      </div>
                    )}
                    {!questionSearchLoading && !questionSearchError && questionSearchResults.length === 0 && (
                      <div style={{ padding: "10px 12px", color: "var(--fg-3)" }}>No matches.</div>
                    )}
                    {questionSearchResults.map((r, ri) => {
                      // Render any "**…**" markers in r.snippet/r.label as <strong>.
                      const renderMarked = (str) => String(str || "").split(/(\*\*[^*]+\*\*)/g).map((seg, i) => {
                        if (seg.startsWith("**") && seg.endsWith("**")) {
                          return <strong key={i} style={{ color: "var(--gold, #7a5a10)" }}>{seg.slice(2, -2)}</strong>
                        }
                        return <span key={i}>{seg}</span>
                      })
                      const KIND_BADGE = {
                        unit:     { label: "Unit",     bg: "#e4eafb", color: "#24306b" },
                        lo:       { label: "LO",       bg: "#e2f1dd", color: "#23401f" },
                        section:  { label: "Section",  bg: "#f0e2fb", color: "#3e1f6a" },
                        qt:       { label: "QT",       bg: "#fbe8d2", color: "#7a4a10" },
                        question: { label: "Q",        bg: "#fff3c2", color: "#7a5a10" },
                      }
                      const badge = KIND_BADGE[r.kind] || { label: r.kind, bg: "#eee", color: "#333" }
                      const isQuestion = r.kind === "question"
                      const noImageWarning = isQuestion && !r.has_image && /graph|figure|diagram|image|picture|chart|plot|shown above|shown below|the accompanying|preceding/i.test(String(r.snippet || ""))
                      const drillable = r.uIdx != null
                      const onActivate = () => {
                        if (!drillable) {
                          if (isQuestion && r.question_key) { try { navigator.clipboard?.writeText(r.question_key) } catch {} }
                          return
                        }
                        setActiveSection("cylinder")
                        setDrillUnitIdx(r.uIdx)
                        // Set lower drill levels only when the result kind goes
                        // that deep — leaving them null collapses the scene at
                        // the appropriate level (unit-only → ring map; LO → arc
                        // map; QT → question stack; question → QuestionPanel).
                        setDrillLoIdx(r.loIdx != null ? r.loIdx : null)
                        setDrillQtypeIdx(r.qtIdx != null ? r.qtIdx : null)
                        setDrillQuestionIdx(r.qIdx != null ? r.qIdx : null)
                        setQuestionSearchOpen(false)
                      }
                      return (
                        <button
                          key={`${r.kind}|${r.question_key || ""}|${r.uIdx}|${r.loIdx}|${r.qtIdx}|${r.qIdx}|${ri}`}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={onActivate}
                          style={{
                            display: "block", width: "100%",
                            textAlign: "left", padding: "10px 12px",
                            background: "transparent", border: "none",
                            borderBottom: "1px solid var(--rule-soft)",
                            color: "inherit", cursor: "pointer", fontSize: 12,
                            lineHeight: 1.4,
                          }}
                          title={drillable
                            ? `Open this ${badge.label.toLowerCase()} in the cylinder`
                            : (isQuestion ? "Question is in another subject — click to copy its key" : "Not navigable")}
                        >
                          <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 3 }}>
                            <span style={{
                              padding: "0 6px", borderRadius: 3,
                              background: badge.bg, color: badge.color,
                              fontWeight: 700, fontSize: 9, letterSpacing: "0.04em",
                              textTransform: "uppercase",
                            }}>{badge.label}</span>
                            <span style={{ flex: 1 }}>
                              {isQuestion ? renderMarked(r.snippet) : renderMarked(r.label)}
                            </span>
                          </div>
                          <div style={{ color: "var(--fg-3)", fontSize: 11, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                            {r.sublabel && <span>{r.sublabel}</span>}
                            {isQuestion && r.source_label && <span>· {r.source_label}</span>}
                            {isQuestion && r.unit_label && <span>· {r.unit_label}</span>}
                            {isQuestion && (
                              <span style={{
                                padding: "0 5px", borderRadius: 3,
                                background: r.has_image ? "#e2f1dd" : (noImageWarning ? "#ffe9c2" : "#eee"),
                                color: r.has_image ? "#23401f" : (noImageWarning ? "#7a5a10" : "#555"),
                                fontWeight: 600, fontSize: 10,
                              }}>{r.has_image ? "image" : (noImageWarning ? "no image (stem references one!)" : "no image")}</span>
                            )}
                            {isQuestion && r.question_key && (
                              <span style={{ fontFamily: "monospace", color: "var(--fg-3)" }}>{r.question_key.slice(0, 12)}</span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              </div>
              <div ref={practiceSceneRef}>
                {showCylinderLoading ? (
                  <div style={{ minHeight: 420, display: "grid", placeItems: "center", color: "var(--muted)" }}>
                    Loading topic map...
                  </div>
                ) : (() => {
                  const effectivePalette = SHAPE_PALETTE_KEYS.includes(paletteOverride) ? paletteOverride : "sunset"
                  const normalized = normalizeUnitsForScenes(cylinderUnits || [], shapeMode)
                  const units = normalized.units
                  const unitHeight = normalized.unitHeight
                  const totalHeight = normalized.totalHeight
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
                    : arcIdxOrNull != null ? 3
                    : loIdxOrNull != null ? 2
                    : unitIdxOrNull != null ? 1
                    : 0
                  const currentQuestion = stageLevel === 4 && activeArc && Array.isArray(activeArc.questions)
                    ? activeArc.questions[Math.max(0, Math.min(activeArc.questions.length - 1, drillQuestionIdx ?? 0))] || null
                    : null
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
                  const applyNav = (nav) => {
                    if (!nav) return
                    setDrillUnitIdx(nav.uIdx)
                    setDrillLoIdx(nav.lIdx)
                    setDrillQtypeIdx(nav.qtIdx)
                    setDrillQuestionIdx(nav.qIdx)
                  }
                  // Has the active question been answered (or FRQ submitted)
                  // yet? Drives the blink hint on Next-QT (or Next-question).
                  const currentQuestionAttempted = !!(currentQuestion?.key
                    && Array.isArray(activeArc?.correctQuestionKeys)
                    && activeArc.correctQuestionKeys.includes(currentQuestion.key))

                  const stageTitle = stageLevel === 0 ? subject.name
                    : stageLevel === 1 ? (activeUnit?.name || "Unit")
                    : stageLevel === 2 ? (activeLo?.name || "Objective")
                    : stageLevel === 3 ? (activeArc?.type || activeArc?.name || "Question type")
                    : `Question ${String((drillQuestionIdx ?? 0) + 1).padStart(2, "0")}`
                  const cellLabel = stageLevel === 0 ? "Subject"
                    : stageLevel === 1 ? "Unit"
                    : stageLevel === 2 ? (shapeMode === "cube" ? "Section" : "Learning Objective")
                    : stageLevel === 3 ? "Question Type"
                    : "Question"

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

                  const handleAnswer = async (result, questionKey) => {
                    const qtId = activeArc?.questionTypeId
                    if (!qtId || !questionKey) return
                    handleTourEvent("practice-answer-submitted")
                    try {
                      const res = await fetch("/api/student/progress-graph-attempt", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          subjectId: subject.id,
                          as: asStudentId || null,
                          questionTypeId: qtId,
                          questionKey,
                          result,
                        }),
                      })
                      const data = await res.json().catch(() => ({}))
                      if (!res.ok || data?.error) return
                      setProgressQuestionTypes((prev) => prev.map((qt) => {
                        if (String(qt.id) !== String(qtId)) return qt
                        return {
                          ...qt,
                          masteryScore: typeof data.masteryScore === "number" ? data.masteryScore : qt.masteryScore,
                          correctQuestionKeys: Array.isArray(data.correctQuestionKeys) ? data.correctQuestionKeys : qt.correctQuestionKeys,
                        }
                      }))
                      const unlockAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
                      setProgressQuestionLocks((prev) => ({ ...prev, [questionKey]: unlockAt }))
                    } catch {}
                  }

                  const [firstWord, ...restWords] = (stageTitle || "—").trim().split(/\s+/)
                  const restTitle = restWords.join(" ")

                  const labelStyle = {
                    padding: "6px 12px", fontFamily: "var(--font-mono)", fontSize: 9.5,
                    letterSpacing: "0.18em", textTransform: "uppercase",
                    borderBottom: "1px solid var(--rule)", background: "var(--bg)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    flexShrink: 0,
                  }
                  const panelCellStyle = {
                    position: "relative", display: "flex", flexDirection: "column",
                    minHeight: 220, minWidth: 0, overflow: "hidden", background: "var(--bg)",
                    border: "1px solid var(--rule)",
                  }
                  const panelBodyStyle = {
                    position: "relative", flex: 1, minHeight: 0, background: "var(--stage)", overflow: "hidden",
                  }
                  const cornersStyle = { position: "absolute", inset: 6, pointerEvents: "none", zIndex: 2 }

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div className="obs-strip" style={{ margin: 0 }}>
                        <div className="obs-palettes">
                          <span className="obs-label" style={{ marginRight: 4 }}>Object</span>
                          {SHAPE_MODES.map((mode) => (
                            <button
                              key={mode.key}
                              type="button"
                              className="obs-palette"
                              data-active={shapeMode === mode.key}
                              onClick={() => setShapeMode(mode.key)}
                            >
                              {mode.label}
                            </button>
                          ))}
                          <span style={{ flex: 1 }} />
                          <span className="obs-label" style={{ marginRight: 4 }}>Palette</span>
                          {SHAPE_PALETTE_KEYS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              className="obs-palette"
                              data-active={effectivePalette === p}
                              onClick={() => setPaletteOverride(p)}
                            >
                              <i style={{ background: `linear-gradient(90deg, ${SHAPE_PALETTE_STOPS[p].join(",")})` }} />
                              <span>{p}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div ref={tourBreadcrumbRef}>
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
                      </div>

                      <div style={{ display: "flex", alignItems: "baseline", gap: 14, paddingBottom: 10, borderBottom: "1px solid var(--rule-soft)" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="obs-label" style={{ marginBottom: 6 }}>§ {String(stageLevel + 1).padStart(2, "0")} — {cellLabel}</div>
                          <div className="obs-head-stack" key={`lab-h-${stageLevel}`}>
                            <div className="obs-head-title">
                              <MathText text={firstWord || "—"} className="obs-head-title-first" />
                              {restTitle ? <MathText text={restTitle} className="obs-head-title-rest" /> : null}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => collapseToLevel(Math.max(0, stageLevel - 1))}
                          disabled={stageLevel === 0}
                          style={{
                            background: "transparent", border: "none", cursor: stageLevel === 0 ? "not-allowed" : "pointer",
                            fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.16em",
                            textTransform: "uppercase", color: stageLevel === 0 ? "var(--fg-4)" : "var(--fg-2)",
                          }}
                        >Back ↺</button>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 34%)", gap: 12, minHeight: 520 }}>
                        <div ref={tourPracticeQuestionRef} style={{ position: "relative", display: "flex", flexDirection: "column", border: "1px solid var(--rule)", background: "var(--bg)", minHeight: 520, overflow: "hidden" }}>
                          {stageLevel === 4 && currentQuestion ? (
                            practiceScratchOpen ? (
                              <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
                                <div style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0, borderRight: "1px solid var(--rule)" }}>
                                  <QuestionPane
                                    question={currentQuestion}
                                    arcTitle={activeArc?.type || activeArc?.name || ""}
                                    questionIndex={drillQuestionIdx ?? 0}
                                    totalQuestions={activeArc?.questions?.length || activeArc?.total || 1}
                                    subjectId={subject.id}
                                    questionTypeId={activeArc?.questionTypeId || ""}
                                    scratchOpen={true}
                                    onToggleScratch={() => setPracticeScratchOpen(false)}
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
                                    lockedUntil={progressQuestionLocks[currentQuestion.key] || null}
                                    excalidrawApiRef={practiceExcalidrawApiRef}
                                    scratchHasContent={practiceScratchHasContent}
                                  />
                                </div>
                                <div ref={tourScratchpadRef} style={{ display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
                                  <ExcalidrawDock
                                    questionKey={currentQuestion.key || ""}
                                    questionLabel={activeArc?.type || "Scratch"}
                                    subjectId={subject.id}
                                    questionTypeId={activeArc?.questionTypeId || ""}
                                    canSave={!!currentQuestion.key}
                                    mode="practice"
                                    onCloseScratch={() => setPracticeScratchOpen(false)}
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
                                subjectId={subject.id}
                                questionTypeId={activeArc?.questionTypeId || ""}
                                scratchOpen={false}
                                onToggleScratch={() => setPracticeScratchOpen(true)}
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
                                lockedUntil={progressQuestionLocks[currentQuestion.key] || null}
                                excalidrawApiRef={practiceExcalidrawApiRef}
                                scratchHasContent={practiceScratchHasContent}
                              />
                            )
                          ) : (
                            <ExcalidrawDock
                              questionKey=""
                              questionLabel="Scratch"
                              subjectId={subject.id}
                              questionTypeId=""
                              canSave={false}
                              mode="practice"
                            />
                          )}
                        </div>
                        <div ref={tourParentsStackRef} style={{ display: "grid", gridTemplateRows: "1fr 1fr 1fr", gap: 12, minHeight: 520 }}>
                          <div style={panelCellStyle}>
                            <div style={{ ...labelStyle, color: stageLevel === 0 ? "var(--accent)" : "var(--fg-3)" }}>
                              <span>Subject</span><span>01</span>
                            </div>
                            <div style={panelBodyStyle}>
                              <StackPanel shapeMode={shapeMode} units={units} totalHeight={totalHeight}
                                palette={effectivePalette} selectedIdx={unitIdxOrNull} onDrillUnit={handleStackDrill} />
                              <div className="obs-corners" style={cornersStyle}><i/><i/><i/><i/></div>
                            </div>
                          </div>
                          <div style={panelCellStyle}>
                            <div style={{ ...labelStyle, color: stageLevel === 1 ? "var(--accent)" : "var(--fg-3)" }}>
                              <span>Unit</span><span>02</span>
                            </div>
                            <div style={panelBodyStyle}>
                              {activeUnit ? (
                                <DiskPanel key={`lab-disk-${unitIdxOrNull}-${shapeMode}`} shapeMode={shapeMode}
                                  unit={activeUnit} unitHeight={unitHeight} palette={effectivePalette}
                                  selectedRingCode={activeLo?.code || ""} onDrillRing={handleDiskDrill} />
                              ) : (
                                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-4)" }}>Select a unit</div>
                              )}
                              <div className="obs-corners" style={cornersStyle}><i/><i/><i/><i/></div>
                            </div>
                          </div>
                          <div style={panelCellStyle}>
                            <div style={{ ...labelStyle, color: stageLevel === 2 ? "var(--accent)" : "var(--fg-3)" }}>
                              <span>{shapeMode === "cube" ? "Section" : "Learning Objective"}</span><span>03</span>
                            </div>
                            <div style={panelBodyStyle}>
                              {activeLo ? (
                                <RingPanel key={`lab-ring-${unitIdxOrNull}-${loIdxOrNull}-${shapeMode}`} shapeMode={shapeMode}
                                  ring={activeLo} ringHeight={secondaryHeight} palette={effectivePalette}
                                  activeArc={activeArc} onDrillArc={handleRingDrill} />
                              ) : (
                                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-4)" }}>Select an objective</div>
                              )}
                              <div className="obs-corners" style={cornersStyle}><i/><i/><i/><i/></div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, minHeight: 260 }}>
                        <div style={panelCellStyle}>
                          <div style={{ ...labelStyle, color: stageLevel === 4 ? "var(--accent)" : "var(--fg-3)" }}>
                            <span>Question</span><span>05</span>
                          </div>
                          <div style={panelBodyStyle}>
                            {activeArc && activeArc.questionTypeId ? (
                              <QuestionPanel key={`lab-q-${unitIdxOrNull}-${loIdxOrNull}-${arcIdxOrNull}-${shapeMode}`} shapeMode={shapeMode}
                                ring={activeLo} arcId={activeArc.questionTypeId} questionIdx={drillQuestionIdx ?? 0}
                                ringHeight={secondaryHeight} palette={effectivePalette} onDrillQuestion={handleArcDrill} />
                            ) : (
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-4)" }}>Pick a question</div>
                            )}
                            <div className="obs-corners" style={cornersStyle}><i/><i/><i/><i/></div>
                          </div>
                        </div>
                        <div style={panelCellStyle}>
                          <div style={{ ...labelStyle, color: stageLevel === 3 ? "var(--accent)" : "var(--fg-3)" }}>
                            <span>Question Type</span><span>04</span>
                          </div>
                          <div style={panelBodyStyle}>
                            {activeArc ? (
                              <ArcPanel key={`lab-arc-${unitIdxOrNull}-${loIdxOrNull}-${arcIdxOrNull}-${shapeMode}`} shapeMode={shapeMode}
                                ring={activeLo} arcId={activeArc?.questionTypeId || null} ringHeight={secondaryHeight}
                                palette={effectivePalette} onDrillQuestion={handleArcDrill} />
                            ) : (
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--fg-4)" }}>Select a question type</div>
                            )}
                            <div className="obs-corners" style={cornersStyle}><i/><i/><i/><i/></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </section>
          )}

        </main>

        {currentTour && !isMobileViewport ? (
          <DashboardTourOverlay
            step={tourStep}
            totalSteps={tourSteps.length}
            title={currentTour.title}
            body={typeof currentTour.body === "function" ? currentTour.body() : currentTour.body}
            targetRef={currentTour.targetRef}
            placement={currentTour.placement}
            highlightPadding={currentTour.highlightPadding}
            onNext={advanceTour}
            onDismiss={dismissTour}
            waitForClick={!!currentTour.waitForEvent}
            hint={currentTour.hint || null}
          />
        ) : null}

      </div>
    </div>
  )
}

function DashboardTourOverlay({
  step,
  totalSteps,
  title,
  body,
  targetRef,
  placement = "right",
  onNext,
  onDismiss,
  waitForClick = false,
  hint = null,
  highlightPadding = 14,
}) {
  const [rect, setRect] = useState(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })

  useEffect(() => {
    let intervalId = null
    let tries = 0

    function measure() {
      const node = targetRef?.current
      if (!node || typeof window === "undefined") return false
      const next = node.getBoundingClientRect()
      if (!next.width && !next.height) return false
      setRect(next)
      setViewport({ width: window.innerWidth, height: window.innerHeight })
      return true
    }

    function updateRect() {
      if (!measure()) setRect(null)
    }

    if (!measure()) {
      // Target node isn't mounted yet (e.g. 3D scene still loading). Poll
      // until it shows up, then stop.
      intervalId = setInterval(() => {
        tries += 1
        if (measure() || tries > 100) {
          clearInterval(intervalId)
          intervalId = null
        }
      }, 150)
    }

    window.addEventListener("resize", updateRect)
    window.addEventListener("scroll", updateRect, true)
    return () => {
      if (intervalId) clearInterval(intervalId)
      window.removeEventListener("resize", updateRect)
      window.removeEventListener("scroll", updateRect, true)
    }
  }, [targetRef, step])

  const vw = viewport.width || (typeof window !== "undefined" ? window.innerWidth : 0)
  const vh = viewport.height || (typeof window !== "undefined" ? window.innerHeight : 0)
  if (!vw || !vh) return null

  if (!rect) {
    // Target isn't mounted yet — render a centered floating card so the
    // tour is still visible/dismissable even when the highlighted node
    // hasn't rendered (e.g. 3D scene still loading).
    const fallbackW = Math.min(360, vw - 32)
    const fallbackH = 208
    const left = Math.max(16, (vw - fallbackW) / 2)
    const top = Math.max(16, (vh - fallbackH) / 2)
    return (
      <div className={styles.tourOverlay}>
        <div className={styles.tourBackdrop} style={{ top: 0, left: 0, right: 0, bottom: 0 }} />
        <div
          className={`${styles.tourCard} ${styles.tourCardSide}`}
          style={{ top: `${top}px`, left: `${left}px`, width: `${fallbackW}px` }}
        >
          <button type="button" className={styles.tourGhostBtn} onClick={onDismiss}>
            Skip guide
          </button>
          <div className={styles.tourStepTag}>Guide {step + 1} of {totalSteps}</div>
          <div className={styles.tourTitle}>{title}</div>
          <p className={styles.tourBody}>{body}</p>
          {waitForClick ? (
            <div className={styles.tourHint}>{hint || "Interact with the highlighted area"}</div>
          ) : (
            <div className={styles.tourActions}>
              <button type="button" className={styles.tourPrimaryBtn} onClick={onNext}>
                {step === totalSteps - 1 ? "Got it" : "Next"}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const padding = highlightPadding
  const highlight = {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  }

  const cardWidth = Math.min(360, viewport.width - 32)
  const cardHeight = 208
  const gap = 24
  const candidates = {
    right: {
      left: highlight.left + highlight.width + gap,
      top: highlight.top + Math.max(0, (highlight.height - cardHeight) / 2),
    },
    left: {
      left: highlight.left - cardWidth - gap,
      top: highlight.top + Math.max(0, (highlight.height - cardHeight) / 2),
    },
    bottom: {
      left: highlight.left + Math.max(0, (highlight.width - cardWidth) / 2),
      top: highlight.top + highlight.height + 22,
    },
    top: {
      left: highlight.left + Math.max(0, (highlight.width - cardWidth) / 2),
      top: highlight.top - (cardHeight + 20),
    },
  }
  const preferredOrders = {
    right: ["right", "left", "bottom", "top"],
    left: ["left", "right", "bottom", "top"],
    top: ["top", "bottom", "left", "right"],
    bottom: ["bottom", "top", "right", "left"],
  }

  function fits(candidate) {
    return (
      candidate.left >= 16 &&
      candidate.top >= 16 &&
      candidate.left + cardWidth <= viewport.width - 16 &&
      candidate.top + cardHeight <= viewport.height - 16
    )
  }

  const placementOrder = preferredOrders[placement] || ["right", "left", "bottom", "top"]
  let resolvedPlacement = placementOrder.find((key) => fits(candidates[key])) || placementOrder[0]
  let cardLeft = candidates[resolvedPlacement].left
  let cardTop = candidates[resolvedPlacement].top

  if (cardLeft + cardWidth > viewport.width - 16) {
    cardLeft = viewport.width - cardWidth - 16
  }
  if (cardLeft < 16) cardLeft = 16
  cardTop = clamp(cardTop, 16, viewport.height - (cardHeight + 16))
  const placementClass =
    resolvedPlacement === "bottom"
      ? styles.tourCardBottom
      : resolvedPlacement === "top"
        ? styles.tourCardTop
        : resolvedPlacement === "left"
          ? styles.tourCardLeft
          : styles.tourCardSide

  return (
    <div className={styles.tourOverlay}>
      <div className={styles.tourBackdrop} style={{ top: 0, left: 0, right: 0, height: `${Math.max(0, highlight.top)}px` }} />
      <div
        className={styles.tourBackdrop}
        style={{
          top: `${Math.max(0, highlight.top)}px`,
          left: 0,
          width: `${Math.max(0, highlight.left)}px`,
          height: `${Math.max(0, highlight.height)}px`,
        }}
      />
      <div
        className={styles.tourBackdrop}
        style={{
          top: `${Math.max(0, highlight.top)}px`,
          left: `${Math.min(viewport.width, highlight.left + highlight.width)}px`,
          right: 0,
          height: `${Math.max(0, highlight.height)}px`,
        }}
      />
      <div
        className={styles.tourBackdrop}
        style={{
          top: `${Math.min(viewport.height, highlight.top + highlight.height)}px`,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      <div
        className={styles.tourHighlight}
        style={{
          top: `${highlight.top}px`,
          left: `${highlight.left}px`,
          width: `${highlight.width}px`,
          height: `${highlight.height}px`,
          pointerEvents: waitForClick ? "none" : "auto",
        }}
      />
      <div
        className={`${styles.tourCard} ${placementClass}`}
        style={{
          top: `${cardTop}px`,
          left: `${cardLeft}px`,
          width: `${cardWidth}px`,
          "--tour-arrow-top": `${Math.max(14, Math.min(cardHeight - 14, rect.top + rect.height / 2 - cardTop))}px`,
        }}
      >
        <button type="button" className={styles.tourGhostBtn} onClick={onDismiss}>
          Skip guide
        </button>
        <div className={styles.tourStepTag}>Guide {step + 1} of {totalSteps}</div>
        <div className={styles.tourTitle}>{title}</div>
        <p className={styles.tourBody}>{body}</p>
        {waitForClick ? (
          <div className={styles.tourHint}>{hint || "Click the highlighted area"}</div>
        ) : (
          <div className={styles.tourActions}>
            <button type="button" className={styles.tourPrimaryBtn} onClick={onNext}>
              {step === totalSteps - 1 ? "Got it" : "Next"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TrackerImprovementVisual({ baseColor = "#4f78ca", questionLabel = "Question 1", questionTypeLabel = "Question type" }) {
  const solvedColor = complementHex(baseColor)
  return (
    <div style={{
      width: 416,
      maxWidth: "100%",
      display: "grid",
      gridTemplateColumns: "repeat(2, 198px)",
      gap: 20,
      flexShrink: 0,
      alignItems: "start",
    }}>
      <TrackerMiniWindow title={`${questionLabel}: ${questionTypeLabel} old`}>
        <MiniArcScene color={baseColor} hoverLabel={`${questionLabel} · ${questionTypeLabel} before`} />
      </TrackerMiniWindow>
      <TrackerMiniWindow title={`${questionLabel}: ${questionTypeLabel} new`}>
        <MiniArcScene color={solvedColor} hoverLabel={`${questionLabel} · ${questionTypeLabel} after`} />
      </TrackerMiniWindow>
    </div>
  )
}

function TrackerSingleArc({ color = "#d65151", label = "Weakness" }) {
  return (
    <div style={{
      width: 198,
      maxWidth: "100%",
      height: 220,
      position: "relative",
      flexShrink: 0,
    }}>
      <TrackerMiniWindow title={label}>
        <MiniArcScene color={color} hoverLabel={`${label} question type`} />
      </TrackerMiniWindow>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 12, textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-muted)", textTransform: "uppercase" }}>
        {label}
      </div>
    </div>
  )
}

function ProgressTrackerQuestions({ topItems = [], weaknessItems = [], onOpenPractice, themeGold = "#4f78ca", themeRed = "#d65151", subjectName = "" }) {
  const formatWeakness = (value) => Number(value || 0).toFixed(1)
  const formatDivisor = (value) => Math.max(Number(value || 0), 0.01).toFixed(2)
  const formatGain = (value) => Number(value || 0).toFixed(2)
  const getLocationLabel = (item = {}) => {
    const section = String(item.sectionName || "").trim()
    const unit = String(item.unitName || "").trim()
    const lo = String(item.loName || "").trim()
    if (section && unit) return `${section} · ${unit}`
    if (section) return section
    if (lo && unit) return `${lo} · ${unit}`
    return lo || unit || "Unmapped"
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
      <section style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        border: "1px solid var(--border)",
        borderRadius: 4,
        background: "var(--surface)",
        padding: 18,
      }}>
        <div>
          <div className={styles.masteryEyebrow}>Best Same-Day Improvements</div>
          <p className={styles.masteryText} style={{ marginTop: 6 }}>
            Scroll through the strongest question-type wins from today. Each card shows the question gain first, then the lift into its learning objective and unit.
          </p>
        </div>
        <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 6 }}>
          {(topItems.length ? topItems : [{ id: "empty" }]).map((item, idx) => (
            <div key={item.id || idx} style={{
              minWidth: 860,
              flex: "0 0 860px",
              display: "grid",
              gridTemplateColumns: "416px minmax(0, 1fr)",
              gap: 18,
              alignItems: "center",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--surface2)",
              padding: 18,
            }}>
              {item.id ? (
                <>
                  <TrackerImprovementVisual
                    baseColor={themeGold}
                    questionLabel={compactQuestionLabel(item.questionLabel)}
                    questionTypeLabel={item.title}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", fontWeight: 800 }}>
                      Progress Bump
                    </div>
                    <div style={{ fontSize: 15, color: "var(--text)", fontWeight: 700 }}>{compactQuestionLabel(item.questionLabel)} +1</div>
                    <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{item.title} score bump = + 1 / {Math.max(1, Number(item.questionCount || 1))}</div>
                    <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{getLocationLabel(item)} bump = + 1 / {formatGain(item.loDelta || item.unitDelta)}</div>
                    <div style={{ fontSize: 14, color: "var(--text-muted)" }}>{subjectName || "Subject"} bump = + 1 / {formatDivisor(item.unitDelta)}</div>
                  </div>
                </>
              ) : (
                <div style={{ gridColumn: "1 / 3", color: "var(--text-muted)", fontSize: 14 }}>
                  No same-day solved question types yet.
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        border: "1px solid var(--border)",
        borderRadius: 4,
        background: "var(--surface)",
        padding: 18,
      }}>
        <div>
          <div className={styles.masteryEyebrow}>Weakness Areas</div>
          <p className={styles.masteryText} style={{ marginTop: 6 }}>
            These are the question types currently carrying the most weakness. Open one directly in Practice Room to work on it now.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxHeight: 640, overflowY: "auto", paddingRight: 4 }}>
          {(weaknessItems.length ? weaknessItems : [{ id: "empty" }]).map((item, idx) => (
            <div key={item.id || idx} style={{
              display: "grid",
              gridTemplateColumns: "220px minmax(0, 1fr)",
              gap: 18,
              alignItems: "center",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: "var(--surface2)",
              padding: 18,
            }}>
              {item.id ? (
                <>
                  <TrackerSingleArc color={themeRed} label="Weakness" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-dim)", fontWeight: 800 }}>
                      Weakness
                    </div>
                    <div style={{ fontSize: 16, color: "var(--text)", fontWeight: 700 }}>{item.title}</div>
                    <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
                      {getLocationLabel(item)}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--text-muted)" }}>
                      Weakness score {formatWeakness(item.weaknessScore)}
                    </div>
                    <div style={{ fontSize: 13, color: item.isLocked ? "var(--red)" : "var(--green)" }}>
                      {item.isLocked
                        ? "All questions answered. This type is complete."
                        : "Ready to work on in Practice Room."}
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => onOpenPractice?.(item.id)}
                        className={styles.panelNavBtn}
                      >
                        Open In Practice Room
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ gridColumn: "1 / 3", color: "var(--text-muted)", fontSize: 14 }}>
                  No weakness areas yet.
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

// ── Flashcard Panel (right side, full area, centered) ─
function FlashcardPanel({ subjectId, asStudentId = null, previewWeakness = null, demoMode = false }) {
  const [cards, setCards] = useState([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [sliding, setSliding] = useState(false)
  const [done, setDone] = useState(false)
  const [noData, setNoData] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isMobileViewport, setIsMobileViewport] = useState(false)
  const hasFetched = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return undefined
    const media = window.matchMedia("(max-width: 768px)")
    const sync = () => setIsMobileViewport(media.matches)
    sync()
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync)
      return () => media.removeEventListener("change", sync)
    }
    media.addListener(sync)
    return () => media.removeListener(sync)
  }, [])

  useEffect(() => {
    if (!subjectId || hasFetched.current) return
    hasFetched.current = true
    const asParam = asStudentId ? `&as=${encodeURIComponent(asStudentId)}` : ""
    const previewParam = previewWeakness
      ? `&previewWeakness=${encodeURIComponent(JSON.stringify(previewWeakness))}`
      : ""
    const demoParam = demoMode ? "&demo=1" : ""
    fetch(`/api/student/flashcards?subjectId=${subjectId}${asParam}${previewParam}${demoParam}`)
      .then(r => r.json())
      .then(d => {
        const fc = d.flashcards || []
        setCards(fc)
        setNoData(!!d.noData || fc.length === 0)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [subjectId, asStudentId])

  function next() {
    if (sliding) return
    setFlipped(false)
    setSliding(true)
    setTimeout(() => {
      if (index < cards.length - 1) setIndex(i => i + 1)
      else setDone(true)
      setSliding(false)
    }, 340)
  }

  const card = cards[index]

  if (loading) return <div style={fp.center}><div style={fp.spinner} /></div>
  if (noData || !cards.length) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
          No data.
        </div>
      </div>
    )
  }

  if (done) return (
    <div style={fp.center}>
      <div style={{ fontSize: 40 }}>✅</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", marginTop: 12 }}>All cards reviewed</div>
      <button style={fp.restartBtn} onClick={() => { setIndex(0); setFlipped(false); setDone(false) }}>Review again</button>
    </div>
  )

  if (!card) return null

  const mobileFace = isMobileViewport
    ? {
        ...fp.face,
        padding: "18px 16px 28px",
        justifyContent: "center",
        borderRadius: 18,
      }
    : fp.face
  const mobileFaceTopic = isMobileViewport ? { ...fp.faceTopic, fontSize: 16, lineHeight: 1.35 } : fp.faceTopic
  const mobileFaceQuestion = isMobileViewport ? { ...fp.faceQuestion, fontSize: 13, lineHeight: 1.55 } : fp.faceQuestion
  const mobileFaceAnswer = isMobileViewport ? { ...fp.faceAnswer, fontSize: 14, lineHeight: 1.6 } : fp.faceAnswer
  const mobileDeckContainer = isMobileViewport
    ? { ...fp.deckContainer, minHeight: 240, maxHeight: 280, padding: "2px 0 4px" }
    : fp.deckContainer

  return (
    <div style={isMobileViewport ? { ...fp.shell, gap: 10 } : fp.shell}>
      {/* Progress */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em" }}>
          {"▮".repeat(Math.min(Math.ceil(Number(card.weaknessScore || 0)), 5))}
          {"▯".repeat(Math.max(0, 5 - Math.ceil(Number(card.weaknessScore || 0))))}
          <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>weakness {Number(card.weaknessScore || 0).toFixed(1)}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{index + 1} / {cards.length}</div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 1, background: "var(--border)", borderRadius: 1 }}>
        <div style={{ height: "100%", background: "var(--gold)", width: `${((index+1)/cards.length)*100}%`, transition: "width 0.4s" }} />
      </div>

      {/* Deck — fills all remaining space */}
      <div style={mobileDeckContainer}>
        {/* Stack shadows always show 2 behind regardless of remaining count */}
        <div style={{ ...fp.stackCard, inset: "12px 6px -6px", transform: "none", opacity: 0.3 }} />
        <div style={{ ...fp.stackCard, inset: "6px 3px -3px", transform: "none", opacity: 0.55 }} />

        {/* Sliding + flipping card */}
        <div style={{
          ...fp.slideWrapper,
          perspective: "1200px",
          transform: sliding ? "translateX(-110%) rotateY(-15deg)" : "translateX(0)",
          opacity: sliding ? 0 : 1,
          transition: sliding ? "all 0.32s cubic-bezier(0.4,0,1,1)" : "none",
        }}>
          <div style={{
            ...fp.flipWrapper,
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            transition: "transform 0.5s cubic-bezier(0.4,0,0.2,1)",
          }}>
            {/* Front face */}
            <div style={mobileFace} onClick={() => !sliding && setFlipped(true)}>
              <div style={fp.faceCorner}>Q</div>
              <div style={fp.faceContent}>
                <div style={mobileFaceTopic}>{card.title}</div>
                {card.images?.[0] && <img src={card.images[0]} alt="" style={fp.faceImg} />}
                {card.questionText && <p style={mobileFaceQuestion}><MathText text={card.questionText} block /></p>}
              </div>
              <div style={fp.tapHint}>tap to reveal answer</div>
            </div>

            {/* Back face */}
            <div style={{ ...mobileFace, ...fp.faceBack }} onClick={() => !sliding && setFlipped(false)}>
              <div style={{ ...fp.faceCorner, color: "var(--green)" }}>A</div>
                <div style={fp.faceContent}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16, textAlign: "center" }}>Answer</div>
                  {card.images?.[1] && <img src={card.images[1]} alt="" style={fp.faceImg} />}
                <p style={mobileFaceAnswer}><MathText text={card.answer || "No notes yet for this topic."} block /></p>
                </div>
              <div style={fp.tapHint}>tap to flip back</div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {flipped && !sliding && (
        <div style={isMobileViewport ? { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } : { display: "flex", gap: 12 }}>
          <button style={isMobileViewport ? { ...fp.btnUnsure, width: "100%" } : fp.btnUnsure} onClick={next}>Still unsure</button>
          <button style={isMobileViewport ? { ...fp.btnGot, width: "100%" } : fp.btnGot} onClick={next}>Got it ✓</button>
        </div>
      )}
    </div>
  )
}

const fp = {
  // shell fills all remaining vertical space
  shell: { display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 },
  center: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 },
  spinner: { width: 24, height: 24, border: "2px solid #dbcbb7", borderTopColor: "var(--gold)", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  restartBtn: { background: "none", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text-muted)", fontSize: 12, cursor: "pointer", padding: "8px 20px", marginTop: 8 },
  // deck container fills all remaining space, position relative for absolute children
  deckContainer: {
    flex: 1, minHeight: 0,
    position: "relative",
    display: "flex",
  },
  // stack shadow cards — absolute, fill full container
  stackCard: {
    position: "absolute", left: 0, right: 0, top: 0, bottom: 0,
    background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 20,
    zIndex: 0,
  },
  // sliding wrapper — absolute, fills container
  slideWrapper: {
    position: "absolute", inset: 0, zIndex: 2,
    minHeight: 0,
  },
  // 3d flip wrapper — fills slide wrapper
  flipWrapper: {
    width: "100%", height: "100%",
    transformStyle: "preserve-3d",
  },
  // both faces are absolute and fill the flip wrapper completely
  face: {
    backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
    background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 20,
    position: "absolute", inset: 0,
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center",
    cursor: "pointer", padding: "34px 28px 44px",
    boxShadow: "0 8px 24px color-mix(in srgb, var(--gold-dim) 70%, transparent)",
    overflowY: "auto",
    overflowX: "hidden",
  },
  faceBack: {
    transform: "rotateY(180deg)",
    background: "color-mix(in srgb, var(--green) 10%, var(--surface))", border: "1px solid color-mix(in srgb, var(--green) 35%, var(--border))",
  },
  faceContent: {
    minHeight: "100%",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    textAlign: "center",
  },
  faceCorner: { position: "absolute", top: 16, left: 20, fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.1em" },
  faceTopic: { fontSize: 21, fontWeight: 700, color: "var(--text)", textAlign: "center", lineHeight: 1.35 },
  faceImg: { maxWidth: "80%", maxHeight: 180, objectFit: "contain", borderRadius: 10, border: "1px solid var(--border)", flexShrink: 0 },
  faceQuestion: { fontSize: 15, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.65, margin: 0, maxWidth: "95%" },
  faceAnswer: { fontSize: 18, color: "var(--text)", textAlign: "center", lineHeight: 1.7, margin: 0, maxWidth: "95%", fontWeight: 500 },
  tapHint: { position: "absolute", bottom: 14, fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.06em" },
  btnUnsure: { flex: 1, padding: "13px 0", background: "none", border: "1px solid color-mix(in srgb, var(--red) 45%, var(--border))", borderRadius: 12, color: "var(--red)", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  btnGot:    { flex: 1, padding: "13px 0", background: "none", border: "1px solid color-mix(in srgb, var(--green) 45%, var(--border))", borderRadius: 12, color: "var(--green)", fontSize: 14, fontWeight: 600, cursor: "pointer" },
}


function PracticeHoverOverlay({ children, onOpen }) {
  const [hover, setHover] = useState(false)
  const bg = "#0e0e0e"
  return (
    <div
      style={{ position: "absolute", inset: 0 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {children}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: hover ? "auto" : "none",
          opacity: hover ? 1 : 0,
          transition: "opacity 0.15s",
          zIndex: 4,
        }}
      >
        <div style={{
          width: 180,
          height: 180,
          background: bg,
          border: "1px solid rgba(242, 230, 216, 0.28)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          padding: 18,
          textAlign: "center",
          boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        }}>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "#ffffff",
            lineHeight: 1.4,
          }}>
            Practice this question?
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen?.() }}
            style={{
              padding: "8px 14px",
              border: "1px solid rgba(242, 230, 216, 0.4)",
              background: "rgba(0, 0, 0, 0.35)",
              color: "#ffffff",
              fontFamily: "var(--font-mono)",
              fontSize: 10.5,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            Open Practice →
          </button>
        </div>
      </div>
    </div>
  )
}

function SubjectPicker({ subjects, onSelect, student }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (!menuRef.current) return
      if (!menuRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const firstName = (student?.name || "Scholar").split(" ")[0]
  const tz = student?.timezone || (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Asia/Kolkata")
  const timeOfDay = getTimeOfDay(tz)
  const nowLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz })

  const baseBg = "#14110e"

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: baseBg,
        color: "#efe4d2",
        fontFamily: "var(--font-body)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        cursor: "default",
        overflow: "hidden",
      }}
    >
      {/* matte grain overlay */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.35,
          mixBlendMode: "overlay",
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.10  0 0 0 0 0.08  0 0 0 0 0.06  0 0 0 0.55 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      <div ref={menuRef} style={{ position: "relative", width: "min(560px, 100%)", display: "flex", flexDirection: "column", gap: 28 }}>
        <div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(239, 228, 210, 0.55)",
            marginBottom: 12,
          }}>
            {nowLabel}
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)",
            fontWeight: 300,
            fontSize: "clamp(34px, 4.6vw, 68px)",
            lineHeight: 0.98,
            letterSpacing: "-0.02em",
            margin: 0,
            color: "#f6ead6",
          }}>
            Good {timeOfDay},<br/>
            <em style={{ fontStyle: "italic", color: "rgba(246, 234, 214, 0.78)", fontWeight: 300 }}>{firstName}</em>.
          </h1>
        </div>

        <div>
          <div style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(239, 228, 210, 0.55)",
            marginBottom: 8,
          }}>
            § Choose a subject
          </div>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 18px",
                border: "1px solid rgba(239, 228, 210, 0.22)",
                background: "rgba(0, 0, 0, 0.45)",
                color: "#f2e6d8",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: "pointer",
                borderRadius: 0,
                textAlign: "left",
              }}
            >
              <span>{subjects.length ? "Select subject" : "No subjects available"}</span>
              <span style={{ fontSize: 10, color: "rgba(239, 228, 210, 0.7)" }}>{open ? "▴" : "▾"}</span>
            </button>
            {open && subjects.length > 0 ? (
              <div
                role="listbox"
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  left: 0,
                  right: 0,
                  background: "rgba(0, 0, 0, 0.88)",
                  border: "1px solid rgba(239, 228, 210, 0.28)",
                  borderRadius: 0,
                  maxHeight: 280,
                  overflowY: "auto",
                  zIndex: 5,
                  boxShadow: "0 14px 28px rgba(0, 0, 0, 0.5)",
                }}
              >
                {subjects.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    onClick={() => { setOpen(false); onSelect(s) }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 18px",
                      border: "none",
                      borderTop: i === 0 ? "none" : "1px solid rgba(239, 228, 210, 0.12)",
                      background: "transparent",
                      color: "#f2e6d8",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      fontWeight: 500,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent" }}
                  >
                    <span>{s.name}</span>
                    <span style={{ fontSize: 10, color: "rgba(239, 228, 210, 0.5)" }}>→</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function getTimeOfDay(tz = "Asia/Kolkata") {
  const h = parseInt(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()))
  if (h >= 5 && h < 12) return "morning"
  if (h >= 12 && h < 17) return "afternoon"
  if (h >= 17 && h < 22) return "evening"
  return "night"
}

async function downloadReport(reportData) {
  const { generateAndDownloadPDF } = await import("../lib/pdf")
  await generateAndDownloadPDF(reportData)
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="spinner" />
    </div>
  )
}

function ErrorScreen({ message = "", onRetry = null }) {
  return (
    <FailureState
      title="Scholar could not load."
      message={message || "Please refresh and try again."}
      action={onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--gold)",
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Try Again
        </button>
      ) : null}
    />
  )
}

function ZoomIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24">
      <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.889L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
