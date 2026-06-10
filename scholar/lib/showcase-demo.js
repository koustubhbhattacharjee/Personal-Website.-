import fs from "fs/promises"
import os from "os"
import path from "path"
import crypto from "crypto"
import { getJsonFromR2, putJsonToR2 } from "./r2"
import {
  SHOWCASE_COURSES,
  SHOWCASE_COURSE_BY_ID,
  SHOWCASE_DEFAULT_SUBJECT_ID,
} from "../data/showcase-courses"
import { getShowcaseSessionPayloadFromReq } from "./showcase"

const SHOWCASE_STORE_BUCKET = process.env.R2_BUCKET || ""
const SHOWCASE_STORE_KEY = "showcase/demo-state.json"
const SHOWCASE_DATA_VERSION = 3
const LOCAL_STORE_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), "scholar-showcase-demo-state.json")
  : path.join(process.cwd(), "data", "showcase-demo-state.json")

function dateKeyInTZ(dateLike = new Date(), tz = "UTC") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(dateLike))
}

async function ensureLocalStore() {
  await fs.mkdir(path.dirname(LOCAL_STORE_FILE), { recursive: true })
  try {
    await fs.access(LOCAL_STORE_FILE)
  } catch {
    await fs.writeFile(LOCAL_STORE_FILE, JSON.stringify({ viewers: {} }, null, 2) + "\n", "utf8")
  }
}

async function readLocalStore() {
  await ensureLocalStore()
  const raw = await fs.readFile(LOCAL_STORE_FILE, "utf8")
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : { viewers: {} }
  } catch {
    return { viewers: {} }
  }
}

async function writeLocalStore(data) {
  await ensureLocalStore()
  // Atomic write: concurrent API calls read this file in parallel — a plain
  // writeFile can be observed half-written, which makes readLocalStore fall
  // back to an empty store and silently reset all viewer progress.
  const tmp = `${LOCAL_STORE_FILE}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8")
  await fs.rename(tmp, LOCAL_STORE_FILE)
}

async function readStore() {
  const r2 = SHOWCASE_STORE_BUCKET
    ? await getJsonFromR2({ bucket: SHOWCASE_STORE_BUCKET, key: SHOWCASE_STORE_KEY }).catch(() => null)
    : null
  if (r2 && typeof r2 === "object") return r2
  return readLocalStore()
}

async function writeStore(data) {
  if (SHOWCASE_STORE_BUCKET) {
    try {
      await putJsonToR2({ bucket: SHOWCASE_STORE_BUCKET, key: SHOWCASE_STORE_KEY, data })
      return
    } catch {
      // Fall back to local store.
    }
  }
  await writeLocalStore(data)
}

function getCourse(subjectId = "") {
  return SHOWCASE_COURSE_BY_ID[String(subjectId || "").trim()] || null
}

function buildSeedRows(course) {
  const rows = {}
  for (const qt of course.questionTypes) {
    const seed = course.seed[qt.id] || {}
    rows[qt.id] = {
      correctQuestionKeys: [...(seed.correctQuestionKeys || [])],
      dailySeenDates: [],
      dailyWrongDates: [],
      masteryEvents: [],
      weaknessScore: Number(seed.weaknessScore || 0),
    }
  }
  return rows
}

function ensureViewerRecord(store, viewer) {
  store.viewers ||= {}
  if (!store.viewers[viewer.id]) {
    store.viewers[viewer.id] = {
      id: viewer.id,
      label: viewer.name,
      timezone: viewer.timezone,
      subjects: {},
    }
  }
  const record = store.viewers[viewer.id]
  record.label = viewer.name || record.label || "Guest"
  record.timezone = viewer.timezone || record.timezone || "UTC"
  record.subjects ||= {}
  return record
}

function ensureSubjectState(record, course) {
  record.subjects ||= {}
  record.subjects[course.subjectId] ||= {
    version: SHOWCASE_DATA_VERSION,
    scoreRows: buildSeedRows(course),
    homeworkAttempts: {},
    assessmentAttempts: {},
  }
  if (record.subjects[course.subjectId].version !== SHOWCASE_DATA_VERSION) {
    record.subjects[course.subjectId] = {
      version: SHOWCASE_DATA_VERSION,
      scoreRows: buildSeedRows(course),
      homeworkAttempts: {},
      assessmentAttempts: {},
    }
  }
  record.subjects[course.subjectId].scoreRows ||= {}
  const seedRows = buildSeedRows(course)
  for (const [questionTypeId, seedRow] of Object.entries(seedRows)) {
    record.subjects[course.subjectId].scoreRows[questionTypeId] ||= seedRow
  }
  record.subjects[course.subjectId].homeworkAttempts ||= {}
  record.subjects[course.subjectId].assessmentAttempts ||= {}
  return record.subjects[course.subjectId]
}

function getViewerFromReq(req) {
  const payload = getShowcaseSessionPayloadFromReq(req) || {}
  return {
    id: payload.viewerId || "showcase-viewer",
    name: payload.viewerLabel || "Guest",
    timezone: payload.timezone || "UTC",
    country: "Showcase",
    state: "showcase",
  }
}

// Age-based retention, mirroring lib/db.js getLatestMasterySnapshot: every
// review doubles the half-life, and mastery fades exponentially since the
// most recent activity. The showcase path used to serve the raw correct
// ratio, which made scores immune to time.
function retentionFactor(row, now = new Date()) {
  const dates = [
    ...(row.masteryEvents || []).map((e) => e?.occurredAt || e?.date),
    ...(row.dailySeenDates || []),
  ]
    .map((d) => new Date(String(d || "").slice(0, 10) + "T00:00:00Z").getTime())
    .filter(Number.isFinite)
  if (!dates.length) return 1
  const reviewCount = Math.max(1, (row.masteryEvents || []).length)
  const halfLifeDays = 3 * Math.pow(2, Math.max(0, reviewCount - 1))
  const ageDays = Math.max(0, (now.getTime() - Math.max(...dates)) / 86400000)
  return Math.pow(0.5, ageDays / halfLifeDays)
}

function buildQuestionTypeState(qt, row, tz) {
  const total = qt.questions.length
  const correctCount = (row.correctQuestionKeys || []).length
  const todayKey = dateKeyInTZ(new Date(), tz)
  const seenToday = (row.dailySeenDates || []).includes(todayKey)
  const wrongToday = (row.dailyWrongDates || []).includes(todayKey)
  const lockReason = wrongToday ? "wrong_today" : seenToday ? "answered_today" : ""
  return {
    id: qt.id,
    title: qt.title,
    standardCode: qt.standardCode,
    unit: qt.unit,
    status: qt.status,
    dateIntroduced: qt.dateIntroduced,
    weaknessScore: Number(row.weaknessScore || 0),
    masteryScore: total > 0 ? (correctCount / total) * retentionFactor(row) : 0,
    correctQuestionKeys: [...(row.correctQuestionKeys || [])],
    dailySeenDates: [...(row.dailySeenDates || [])],
    dailyWrongDates: [...(row.dailyWrongDates || [])],
    masteryEvents: [...(row.masteryEvents || [])],
    questionCount: total,
    isLocked: !!lockReason,
    lockReason,
    questions: qt.questions.map((q) => ({
      key: q.key,
      qhash: q.key,
      question: q.question,
      answer: q.answer,
      explanation: q.explanation,
      options: q.options,
      correctIndex: q.correctIndex,
      imageUrl: "",
      reinforcementTargets: [],
    })),
  }
}

function getStaticQuestionType(course, questionTypeId) {
  return course.questionTypes.find((qt) => qt.id === questionTypeId) || null
}

function uniquePush(list, value) {
  if (!list.includes(value)) list.push(value)
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function hashString(input = "") {
  let hash = 2166136261
  const source = String(input || "")
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function isShowcaseDemoSubjectId(subjectId = "") {
  return !!getCourse(subjectId)
}

export function getShowcaseDemoSubjects() {
  return SHOWCASE_COURSES.map((course) => ({
    id: course.subjectId,
    name: course.subjectName,
    dataSourceId: "showcase-local",
    timezone: null,
    courseSources: course.courseSources,
  }))
}

export function getShowcaseDemoSubject(subjectId = SHOWCASE_DEFAULT_SUBJECT_ID) {
  const course = getCourse(subjectId)
  if (!course) return null
  return {
    id: course.subjectId,
    name: course.subjectName,
    dataSourceId: "showcase-local",
    timezone: null,
    courseSources: course.courseSources,
  }
}

export function getShowcaseDemoTaxonomy(subjectId = SHOWCASE_DEFAULT_SUBJECT_ID) {
  return getCourse(subjectId)?.taxonomy || null
}

export async function getShowcaseDashboardPayload(req) {
  const viewer = getViewerFromReq(req)
  const todayKey = dateKeyInTZ(new Date(), viewer.timezone)
  return {
    student: {
      id: viewer.id,
      name: viewer.name,
      email: "",
      timezone: viewer.timezone,
      state: viewer.state,
      country: viewer.country,
    },
    subjects: SHOWCASE_COURSES.map((course) => ({
      id: course.subjectId,
      name: course.subjectName,
      zoomLink: null,
      nextClassStart: null,
      nextClassEnd: null,
      duration: 75,
      todayClass: null,
      upcomingClasses: [],
      hasClassToday: false,
      sessionDate: todayKey,
      studentSessionDate: todayKey,
      sessionDayDiff: 0,
      isShowcaseDemo: true,
    })),
    isImpersonating: false,
    isShowcase: true,
  }
}

function flattenTaxonomy(taxonomy) {
  const result = []
  for (const std of (taxonomy?.standards || [])) {
    for (const obj of (std.objectives || [])) {
      result.push({ ...obj, standardCode: std.code, standardName: std.name })
    }
  }
  return result
}

export async function getShowcaseProgressGraph(req, subjectId) {
  const course = getCourse(subjectId)
  if (!course) return null
  const viewer = getViewerFromReq(req)
  const store = await readStore()
  const record = ensureViewerRecord(store, viewer)
  const subjectState = ensureSubjectState(record, course)
  const questionTypes = course.questionTypes.map((qt) =>
    buildQuestionTypeState(qt, subjectState.scoreRows[qt.id] || {}, viewer.timezone)
  )
  await writeStore(store)
  return {
    subject: course.subjectName,
    questionTypes,
    taxonomy: flattenTaxonomy(course.taxonomy),
  }
}

export async function recordShowcasePracticeAttempt(req, { subjectId, questionTypeId, questionKey, result }) {
  const course = getCourse(subjectId)
  if (!course) return null
  const viewer = getViewerFromReq(req)
  const todayKey = dateKeyInTZ(new Date(), viewer.timezone)
  const store = await readStore()
  const record = ensureViewerRecord(store, viewer)
  const subjectState = ensureSubjectState(record, course)
  const row = subjectState.scoreRows[questionTypeId] ||= {
    correctQuestionKeys: [],
    dailySeenDates: [],
    dailyWrongDates: [],
    masteryEvents: [],
    weaknessScore: 0,
  }
  uniquePush(row.dailySeenDates, todayKey)
  if (result === "correct") {
    uniquePush(row.correctQuestionKeys, questionKey)
    row.weaknessScore = Math.max(0, Number(row.weaknessScore || 0) - 1)
  } else {
    uniquePush(row.dailyWrongDates, todayKey)
    row.weaknessScore = Math.min(5, Number(row.weaknessScore || 0) + 1)
  }
  row.masteryEvents.push({
    id: crypto.randomUUID(),
    date: todayKey,
    result,
    questionKey,
    source: "practice",
  })
  await writeStore(store)
  const qt = getStaticQuestionType(course, questionTypeId)
  const masteryScore = qt?.questions?.length ? row.correctQuestionKeys.length / qt.questions.length : 0
  return {
    correctQuestionKeys: [...row.correctQuestionKeys],
    dailySeenDates: [...row.dailySeenDates],
    dailyWrongDates: [...row.dailyWrongDates],
    masteryScore,
    weaknessScore: row.weaknessScore,
  }
}

function buildHomeworkQuestion(qt, row, cycleKey) {
  const unanswered = qt.questions.find((q) => !(row.correctQuestionKeys || []).includes(q.key))
  const selected = unanswered || qt.questions[cycleKey.length % qt.questions.length]
  return {
    notionQuestionId: qt.id,
    questionTypeTitle: qt.title,
    topics: [qt.title],
    weaknessScore: Number(row.weaknessScore || 0),
    isSessionQuestion: false,
    sourceImage: null,
    questionKey: selected.key,
    question: selected.question,
    answer: selected.answer,
    explanation: selected.explanation,
    options: selected.options,
    correctIndex: selected.correctIndex,
  }
}

export async function getShowcaseHomework(req, subjectId) {
  const course = getCourse(subjectId)
  if (!course) return null
  const viewer = getViewerFromReq(req)
  const cycleKey = dateKeyInTZ(new Date(), viewer.timezone)
  const store = await readStore()
  const record = ensureViewerRecord(store, viewer)
  const subjectState = ensureSubjectState(record, course)
  const attempt = subjectState.homeworkAttempts[cycleKey] || null

  const ranked = course.questionTypes
    .map((qt) => ({ qt, row: subjectState.scoreRows[qt.id] || {} }))
    .sort((a, b) =>
      (Number(b.row.weaknessScore || 0) - Number(a.row.weaknessScore || 0)) ||
      ((a.row.correctQuestionKeys || []).length - (b.row.correctQuestionKeys || []).length)
    )
    .slice(0, 5)

  const questions = ranked.map(({ qt, row }) => buildHomeworkQuestion(qt, row, cycleKey))
  await writeStore(store)

  if (attempt?.status === "Completed") {
    return {
      subject: course.subjectName,
      questions,
      attemptId: attempt.id,
      cycleKey,
      attemptStatus: "Completed",
      result: attempt.result,
    }
  }

  if (!attempt) {
    subjectState.homeworkAttempts[cycleKey] = {
      id: `showcase-hw-${cycleKey}`,
      status: "Assigned",
      createdAt: new Date().toISOString(),
    }
    await writeStore(store)
  }

  return {
    subject: course.subjectName,
    questions,
    attemptId: subjectState.homeworkAttempts[cycleKey].id,
    cycleKey,
  }
}

export async function submitShowcaseHomework(req, { subjectId, answers, cycleKey }) {
  const course = getCourse(subjectId)
  if (!course) return null
  const viewer = getViewerFromReq(req)
  const todayKey = dateKeyInTZ(new Date(), viewer.timezone)
  const store = await readStore()
  const record = ensureViewerRecord(store, viewer)
  const subjectState = ensureSubjectState(record, course)

  const updatedScores = []
  for (const answer of answers || []) {
    const row = subjectState.scoreRows[answer.notionQuestionId]
    if (!row) continue
    const weaknessBefore = Number(row.weaknessScore || 0)
    uniquePush(row.dailySeenDates, todayKey)
    if (answer.correct) {
      uniquePush(row.correctQuestionKeys, answer.questionKey)
      row.weaknessScore = Math.max(0, Number(row.weaknessScore || 0) - 1)
    } else {
      uniquePush(row.dailyWrongDates, todayKey)
      row.weaknessScore = Math.min(5, Number(row.weaknessScore || 0) + 1)
    }
    const qt = getStaticQuestionType(course, answer.notionQuestionId)
    const masteryScore = qt?.questions?.length ? row.correctQuestionKeys.length / qt.questions.length : 0
    row.masteryEvents.push({
      id: crypto.randomUUID(),
      date: todayKey,
      result: answer.correct ? "correct" : "wrong",
      questionKey: answer.questionKey,
      source: "homework",
    })
    updatedScores.push({
      ...answer,
      weaknessScore: row.weaknessScore,
      comboReduction: 0,
      masteryScore,
    })
  }

  const score = (answers || []).filter((item) => item.correct).length
  const total = (answers || []).length
  subjectState.homeworkAttempts[cycleKey] = {
    id: `showcase-hw-${cycleKey}`,
    status: "Completed",
    completedAt: new Date().toISOString(),
    result: {
      updatedScores,
      score,
      total,
    },
  }
  await writeStore(store)
  return {
    updatedScores,
    score,
    total,
  }
}

function buildWeaknessMap(scoreRows) {
  const topics = {}
  for (const course of SHOWCASE_COURSES) {
    for (const qt of course.questionTypes) {
      const row = scoreRows[qt.id] || {}
      topics[qt.title] = Number(row.weaknessScore || 0)
    }
  }
  return { topics }
}

function buildWeaknessMapForCourse(course, scoreRows) {
  const topics = {}
  for (const qt of course.questionTypes) {
    const row = scoreRows[qt.id] || {}
    topics[qt.title] = Number(row.weaknessScore || 0)
  }
  return { topics }
}

function buildAssessmentQuestions(questionTypes) {
  return questionTypes.map((qt) => {
    const picked = qt.questions[0]
    return {
      notionQuestionId: qt.id,
      questionTypeTitle: qt.title,
      standardCode: qt.standardCode,
      unit: qt.unit,
      sourceImage: null,
      questionKey: picked.key,
      question: picked.question,
      answer: picked.answer,
      explanation: picked.explanation,
      options: picked.options,
      correctIndex: picked.correctIndex,
    }
  })
}

export async function getShowcaseAssessment(req, { subjectId, mode, sessionDate = null, count = 0 }) {
  const course = getCourse(subjectId)
  if (!course) return null
  const viewer = getViewerFromReq(req)
  const store = await readStore()
  const record = ensureViewerRecord(store, viewer)
  const subjectState = ensureSubjectState(record, course)
  const effectiveSessionDate = sessionDate || dateKeyInTZ(new Date(), viewer.timezone)
  const attemptKey = `${mode}:${effectiveSessionDate}`
  subjectState.assessmentAttempts ||= {}

  const existing = subjectState.assessmentAttempts[attemptKey]
  if (existing?.questions?.length) {
    await writeStore(store)
    return {
      questions: existing.questions,
      questionCount: existing.questions.length,
      duration: 75,
      subject: course.subjectName,
      mode,
      attemptId: existing.id,
      attemptStatus: existing.status || "Assigned",
      result: existing.result || null,
      sessionDate: effectiveSessionDate,
    }
  }

  const ranked = course.questionTypes
    .map((qt) => ({ qt, row: subjectState.scoreRows[qt.id] || {} }))
    .sort((a, b) =>
      (Number(b.row.weaknessScore || 0) - Number(a.row.weaknessScore || 0)) ||
      ((a.row.correctQuestionKeys || []).length - (b.row.correctQuestionKeys || []).length)
    )
    .map((item) => item.qt)

  const baseCount = Math.max(3, Math.min(6, Number(count || 0) || 4))
  const pool = mode === "pre"
    ? ranked
    : [...ranked.slice(2), ...ranked.slice(0, 2)]
  const pickedTypes = pool.slice(0, Math.min(baseCount, pool.length))
  const questions = buildAssessmentQuestions(pickedTypes)
  const attempt = {
    id: `showcase-assessment-${attemptKey}`,
    status: "Assigned",
    mode,
    sessionDate: effectiveSessionDate,
    questions,
    createdAt: new Date().toISOString(),
    result: null,
  }
  subjectState.assessmentAttempts[attemptKey] = attempt
  await writeStore(store)
  return {
    questions,
    questionCount: questions.length,
    duration: 75,
    subject: course.subjectName,
    mode,
    attemptId: attempt.id,
    attemptStatus: attempt.status,
    sessionDate: effectiveSessionDate,
  }
}

export async function submitShowcaseAssessment(req, { subjectId, mode, answers, sessionDate, attemptId }) {
  const course = getCourse(subjectId)
  if (!course) return null
  const viewer = getViewerFromReq(req)
  const todayKey = dateKeyInTZ(new Date(), viewer.timezone)
  const store = await readStore()
  const record = ensureViewerRecord(store, viewer)
  const subjectState = ensureSubjectState(record, course)
  subjectState.assessmentAttempts ||= {}
  const effectiveSessionDate = sessionDate || dateKeyInTZ(new Date(), viewer.timezone)
  const attemptKey = `${mode}:${effectiveSessionDate}`
  const attempt = subjectState.assessmentAttempts[attemptKey] || {
    id: attemptId || `showcase-assessment-${attemptKey}`,
    status: "Assigned",
    mode,
    sessionDate: effectiveSessionDate,
    questions: [],
  }

  const updatedScores = []
  for (const answer of answers || []) {
    const row = subjectState.scoreRows[answer.notionQuestionId]
    if (!row) continue
    const weaknessBefore = Number(row.weaknessScore || 0)
    uniquePush(row.dailySeenDates, todayKey)
    if (answer.correct) {
      uniquePush(row.correctQuestionKeys, answer.questionKey)
      row.weaknessScore = Math.max(0, Number(row.weaknessScore || 0) - 1)
    } else {
      uniquePush(row.dailyWrongDates, todayKey)
      row.weaknessScore = Math.min(5, Number(row.weaknessScore || 0) + 1)
    }
    const qt = getStaticQuestionType(course, answer.notionQuestionId)
    const masteryScore = qt?.questions?.length ? row.correctQuestionKeys.length / qt.questions.length : 0
    row.masteryEvents.push({
      id: crypto.randomUUID(),
      date: todayKey,
      result: answer.correct ? "correct" : "wrong",
      questionKey: answer.questionKey,
      source: mode === "pre" ? "pre" : "exit",
    })
    updatedScores.push({
      ...answer,
      weaknessScore: row.weaknessScore,
      weaknessBefore,
      weaknessAfter: row.weaknessScore,
      masteryScore,
    })
  }

  const score = (answers || []).filter((item) => item.correct).length
  const total = (answers || []).length
  const result = {
    updatedScores,
    swap: { triggered: false, swappedIn: [], swappedOut: [], previewTopics: [], sessionDate: effectiveSessionDate, nextClassDate: null },
    weaknessMap: buildWeaknessMapForCourse(course, subjectState.scoreRows),
    trends: {},
    score,
    total,
    isPreview: false,
  }

  subjectState.assessmentAttempts[attemptKey] = {
    ...attempt,
    id: attempt.id || attemptId || `showcase-assessment-${attemptKey}`,
    status: "Completed",
    result,
    completedAt: new Date().toISOString(),
  }
  await writeStore(store)
  return result
}

export async function getShowcaseTodayTopics(req, subjectId, sessionDate = null) {
  const course = getCourse(subjectId)
  if (!course) return null
  const viewer = getViewerFromReq(req)
  const dayKey = sessionDate || dateKeyInTZ(new Date(), viewer.timezone)
  const all = course.questionTypes
  const hash = dayKey.split("-").join("").split("").reduce((sum, digit) => sum + Number(digit || 0), 0)
  const start = hash % all.length
  const picked = [all[start], all[(start + 1) % all.length], all[(start + 2) % all.length]]
  return picked.map((qt) => ({ id: qt.id, title: qt.title }))
}

export async function getShowcaseFlashcards(req, subjectId, buildFromTaxonomy) {
  const course = getCourse(subjectId)
  if (!course) return null
  const viewer = getViewerFromReq(req)
  const store = await readStore()
  const record = ensureViewerRecord(store, viewer)
  const subjectState = ensureSubjectState(record, course)
  const dayKey = dateKeyInTZ(new Date(), viewer.timezone)
  const flashcards = course.questionTypes
    .map((qt) => ({
      qt,
      row: subjectState.scoreRows[qt.id] || {},
      sortKey: hashString(`${viewer.id}:${dayKey}:${qt.id}`),
    }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .slice(0, Math.min(10, course.questionTypes.length))
    .map(({ qt, row }, idx) => ({
      id: qt.id,
      title: qt.title,
      standardCode: qt.standardCode,
      weaknessScore: 2 + (idx % 3),
      ...buildFromTaxonomy(qt.standardCode),
    }))
  await writeStore(store)
  return { flashcards, subject: course.subjectName }
}

export async function getShowcaseViewerProfile(req) {
  const viewer = getViewerFromReq(req)
  const store = await readStore()
  const record = ensureViewerRecord(store, viewer)
  for (const course of SHOWCASE_COURSES) ensureSubjectState(record, course)
  await writeStore(store)
  return {
    id: record.id,
    name: record.label,
    timezone: record.timezone,
    state: "showcase",
    country: "Showcase",
  }
}

export function buildShowcaseLoginSubjectId() {
  return SHOWCASE_DEFAULT_SUBJECT_ID
}

export function buildShowcaseViewerPayload(req) {
  return getViewerFromReq(req)
}

export function getShowcaseStaticQuestionTypes(subjectId = SHOWCASE_DEFAULT_SUBJECT_ID) {
  const course = getCourse(subjectId)
  return clone(course?.questionTypes || [])
}
