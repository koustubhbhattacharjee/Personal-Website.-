// ─────────────────────────────────────────────────────────────────────────────
//  lib/db.js — Supabase data layer
//  Drop-in replacement for lib/notion.js.
//  All entity IDs are Supabase UUIDs.
//  "score rows" → student_question_types
//  "draft rows" → draft_items
//  "question page" → question_type (question_types table)
// ─────────────────────────────────────────────────────────────────────────────

import {
  supabaseSelect,
  supabaseInsert,
  supabaseUpdate,
  supabaseRest,
} from "./supabase.js"

// ─────────────────────────────────────────────
//  PURE UTILITIES  (no DB calls)
// ─────────────────────────────────────────────

// Flip to false to restore age-based decay of mastery scores.
// While true, past work retains full strength (no color fade over time).
// false in this showcase clone: the tour needs real forgetting-curve visuals.
const MASTERY_DECAY_BYPASS = false

function parseHwSourceStr(raw = "") {
  const value = String(raw || "").trim()
  if (!value) return { kind: "", assignedAt: "", sessionDate: "", raw: "" }
  const [kind, ...parts] = value.split("::").map((p) => p.trim()).filter(Boolean)
  const meta = { kind: kind || "", assignedAt: "", sessionDate: "", raw: value }
  for (const part of parts) {
    const [key, ...rest] = part.split("=")
    const k = String(key || "").trim()
    const v = rest.join("=").trim()
    if (k === "assigned_at") meta.assignedAt = v
    if (k === "session_date") meta.sessionDate = v
  }
  return meta
}

export function formatHwSource(kind = "", { assignedAt = "", sessionDate = "" } = {}) {
  const base = String(kind || "").trim()
  if (!base) return ""
  const parts = [base]
  if (assignedAt) parts.push(`assigned_at=${assignedAt}`)
  if (sessionDate) parts.push(`session_date=${sessionDate}`)
  return parts.join("::")
}

export function isHwSourceKind(raw = "", expectedKind = "") {
  return parseHwSourceStr(raw).kind === expectedKind
}

export function getDateForTimestampInTimezone(isoString, tz = "UTC") {
  if (!isoString) return null
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(isoString))
    const year = parts.find((p) => p.type === "year")?.value || ""
    const month = parts.find((p) => p.type === "month")?.value || ""
    const day = parts.find((p) => p.type === "day")?.value || ""
    return year && month && day ? `${year}-${month}-${day}` : null
  } catch {
    return null
  }
}

export function getTodayInTimezone(tz) {
  const effective = tz || "UTC"
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: effective,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date())
    return parts.map((p) => p.value).join("")
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function isAdminHomeworkVisible(hwSourceRaw, studentTimezone, todayDateStr) {
  const parsed = parseHwSourceStr(hwSourceRaw)
  if (parsed.kind !== "admin_hw") return false
  if (!parsed.assignedAt) return true
  const assignedLocalDate = getDateForTimestampInTimezone(parsed.assignedAt, studentTimezone || "UTC")
  if (!assignedLocalDate || !todayDateStr) return true
  return assignedLocalDate <= todayDateStr
}

export function isExitCompletedStatus(status) {
  return ["exit_done", "completed"].includes(String(status || "").toLowerCase())
}

export function isExitApprovedStatus(status) {
  return ["approved", "exit_done", "completed"].includes(String(status || "").toLowerCase())
}

export function getMasteryDecayFactor(ageDays = 0) {
  if (MASTERY_DECAY_BYPASS) return 1.0
  const age = Math.max(0, Math.floor(ageDays))
  if (age === 0) return 1.0
  if (age <= 1) return 0.875
  if (age <= 2) return 0.75
  if (age <= 4) return 0.625
  if (age <= 7) return 0.5
  if (age <= 14) return 0.375
  if (age <= 21) return 0.25
  if (age <= 30) return 0.125
  return 0.0625
}

function parseMasteryTimestamp(value) {
  if (!value) return null
  try {
    const text = String(value).trim()
    if (!text) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return Date.parse(`${text}T12:00:00.000Z`)
    }
    const ms = Date.parse(text)
    return Number.isFinite(ms) ? ms : null
  } catch {
    return null
  }
}

function getMasteryReferenceTimestamp(referenceTime = null) {
  const parsed = parseMasteryTimestamp(referenceTime)
  return parsed ?? Date.now()
}

function getLatestMasterySnapshot(masteryEvents = [], referenceTime = null) {
  const successes = (Array.isArray(masteryEvents) ? masteryEvents : [])
    .map((event, index) => ({
      event,
      index,
      at: parseMasteryTimestamp(event?.occurredAt || event?.occurred_at || event?.date),
    }))
    .filter((entry) => entry.at != null)
    .sort((a, b) => a.at - b.at || a.index - b.index)

  if (!successes.length) {
    return {
      reviewCount: 0,
      halfLifeDays: 0,
      retention: 0,
      latestAt: null,
    }
  }

  const reviewCount = successes.length
  const latestAt = successes[successes.length - 1].at
  const halfLifeDays = 3 * Math.pow(2, Math.max(0, reviewCount - 1))
  const referenceAt = getMasteryReferenceTimestamp(referenceTime)
  const ageDays = Math.max(0, (referenceAt - latestAt) / 86400000)
  const rawRetention = Math.pow(0.5, ageDays / halfLifeDays)
  const retention = MASTERY_DECAY_BYPASS ? 1 : rawRetention

  return {
    reviewCount,
    halfLifeDays,
    retention: Math.max(0, Math.min(1, retention)),
    latestAt,
  }
}

function daysBetween(dateA, dateB) {
  if (!dateA || !dateB) return 0
  try {
    const a = new Date(String(dateA).slice(0, 10))
    const b = new Date(String(dateB).slice(0, 10))
    return Math.round(Math.abs(b - a) / 86400000)
  } catch {
    return 0
  }
}

export function calculateMasteryScore(masteryEvents = [], todayDateStr = getTodayInTimezone("UTC")) {
  const snapshot = getLatestMasterySnapshot(masteryEvents, todayDateStr)
  return Math.round(snapshot.retention * 1000) / 1000
}

export function parseExplanationLine(text = "") {
  const line = String(text || "").trim()
  if (!line.startsWith("E:")) return null
  const raw = line.slice(2).trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return {
      primaryLo: String(parsed?.primary_lo || parsed?.primaryLo || "").trim(),
      reinforcementTargets: (parsed?.reinforcement || parsed?.reinforcementTargets || [])
        .map((item) => ({
          code: String(item?.code || item?.loCode || "").trim(),
          weight: Math.min(1, Math.max(0, Number(item?.weight || 0))),
        }))
        .filter((item) => item.code),
    }
  } catch {
    return null
  }
}

export function calculateReinforcementByCode(masteryEvents = [], questionLookup = {}, todayDateStr = getTodayInTimezone("UTC")) {
  const out = {}
  const byQuestionKey = new Map()
  for (const event of Array.isArray(masteryEvents) ? masteryEvents : []) {
    const questionKey = String(event?.questionKey || "").trim() || "__legacy__"
    if (!byQuestionKey.has(questionKey)) byQuestionKey.set(questionKey, [])
    byQuestionKey.get(questionKey).push(event)
  }
  for (const [questionKey, events] of byQuestionKey.entries()) {
    const reinforcementTargets = questionLookup?.[questionKey]?.reinforcementTargets || []
    if (!reinforcementTargets.length) continue
    const decayedBase = getLatestMasterySnapshot(events, todayDateStr).retention
    if (!Number.isFinite(decayedBase) || decayedBase <= 0) continue
    for (const target of reinforcementTargets) {
      const code = String(target?.code || "").trim()
      const weight = Number(target?.weight || 0)
      if (!code || !Number.isFinite(weight) || weight <= 0) continue
      out[code] = Math.round(((out[code] || 0) + decayedBase * weight) * 1000) / 1000
    }
  }
  return out
}

function buildMasteryEvent(source = "", questionKey = "", eventTime = null) {
  const parsedAt = parseMasteryTimestamp(eventTime)
  const occurredAt = parsedAt != null ? new Date(parsedAt).toISOString() : new Date().toISOString()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(eventTime || "").trim())
    ? String(eventTime).trim()
    : occurredAt.slice(0, 10)
  return {
    source: String(source || "").trim() || "practice",
    weight: 1,
    date,
    occurredAt,
    ...(questionKey ? { questionKey } : {}),
  }
}

// Stub: Notion-specific block append — no-op in Supabase model
export function parseLoTableRows() { return [] }
export function buildLoTableBlock() { return null }

// ─────────────────────────────────────────────
//  STUDENTS
// ─────────────────────────────────────────────

function parseStudent(row) {
  return {
    id: row.id,
    name: row.full_name || "",
    email: row.email || "",
    parentEmail: row.parent_email || "",
    subjectIds: [],           // populated separately via enrollments
    timezone: row.timezone || "Asia/Kolkata",
    examDate: null,
    state: row.state || null,
    country: row.country || null,
  }
}

// Populate subjectIds from enrollments (replaces the Notion student.Subject relation)
async function attachSubjectIds(student) {
  if (!student?.id) return student
  const enrollments = await supabaseSelect("enrollments", {
    select: "subject_id",
    filters: { student_id: student.id },
  })
  return { ...student, subjectIds: enrollments.map((e) => e.subject_id) }
}

export async function getAllStudents() {
  const rows = await supabaseSelect("students", { select: "*", orderBy: "full_name" })
  const students = rows.map(parseStudent)
  const enrollments = await supabaseSelect("enrollments", { select: "student_id,subject_id" })
  const byStudent = {}
  for (const e of enrollments) {
    if (!byStudent[e.student_id]) byStudent[e.student_id] = []
    byStudent[e.student_id].push(e.subject_id)
  }
  return students.map(s => ({ ...s, subjectIds: byStudent[s.id] || [] }))
}

export async function getStudentByEmail(email) {
  const norm = String(email || "").trim().toLowerCase()
  if (!norm) return null
  // Check primary email first
  const rows = await supabaseSelect("students", {
    select: "*",
    filters: { email: norm },
    limit: 1,
  })
  if (rows.length) return parseStudent(rows[0])
  // Check parent_email case-insensitively — gracefully skipped if column doesn't exist yet
  try {
    const all = await supabaseSelect("students", { select: "*" })
    const match = all.find((s) =>
      String(s.email || "").toLowerCase() === norm ||
      String(s.parent_email || "").toLowerCase() === norm
    )
    return match ? parseStudent(match) : null
  } catch {
    return null
  }
}

export async function getStudentById(id) {
  if (!id) return null
  const rows = await supabaseSelect("students", { select: "*", filters: { id }, limit: 1 })
  if (!rows.length) return null
  return attachSubjectIds(parseStudent(rows[0]))
}

// ─────────────────────────────────────────────
//  SUBJECTS
// ─────────────────────────────────────────────

function parseSubject(row) {
  const storedMode = row.pacing_mode || "unconfigured"
  const hasDefaultGuide = !!row.default_pacing_guide_id
  return {
    id: row.id,
    name: row.name || "",
    dataSourceId: row.content_bank_id || null,
    contentBankId: row.content_bank_id || null,
    pacingMode: storedMode === "unconfigured" && hasDefaultGuide ? "default" : storedMode,
    defaultPacingGuideId: row.default_pacing_guide_id || null,
    activeOverlayId: row.active_overlay_id || null,
    examDate: row.exam_date || null,
    timezone: row.timezone || null,
  }
}

export async function getAllSubjects() {
  const rows = await supabaseSelect("subjects", { select: "*", orderBy: "name" })
  return rows.map(parseSubject)
}

export async function getSubjectById(id) {
  if (!id) return null
  const rows = await supabaseSelect("subjects", { select: "*", filters: { id }, limit: 1 })
  return rows.length ? parseSubject(rows[0]) : null
}

export async function getSubjectsByIds(ids) {
  if (!ids?.length) return []
  const rows = await supabaseSelect("subjects", { select: "*", filters: { id: ids } })
  return rows.map(parseSubject)
}

// ─────────────────────────────────────────────
//  ENROLLMENTS
// ─────────────────────────────────────────────

function parseEnrollment(row) {
  return {
    id: row.id,
    studentIds: [row.student_id],
    subjectIds: [row.subject_id],
    studentId: row.student_id,
    subjectId: row.subject_id,
    classTime: row.class_time || "",
    duration: row.duration_minutes || 60,
    timezone: row.timezone || "Asia/Kolkata",
    days: row.meeting_days || [],
  }
}

export async function getEnrollmentsByStudent(studentId) {
  if (!studentId) return []
  const rows = await supabaseSelect("enrollments", {
    select: "*",
    filters: { student_id: studentId },
  })
  return rows.map(parseEnrollment)
}

export async function getEnrollment(studentId, subjectId) {
  if (!studentId || !subjectId) return null
  const rows = await supabaseSelect("enrollments", {
    select: "*",
    filters: { student_id: studentId, subject_id: subjectId },
    limit: 1,
  })
  return rows.length ? parseEnrollment(rows[0]) : null
}

// ─────────────────────────────────────────────
//  SESSIONS
// ─────────────────────────────────────────────

function parseSession(row) {
  const meta = row.metadata || {}
  return {
    id: row.id,
    studentId: row.student_id,
    subjectId: row.subject_id,
    studentSessionDate: row.student_session_date || null,
    tutorSessionDate: row.tutor_session_date || null,
    startTime: row.start_time || null,
    endTime: row.end_time || null,
    source: row.source || "manual",
    sessionSource: row.source || "manual",
    sessionMode: row.mode || "unknown",
    mode: row.mode || "unknown",
    eventId: row.calendar_event_id || "",
    calendarEventId: row.calendar_event_id || "",
    importStatus: row.import_status || "",
    importOverride: row.import_override || false,
    notes: row.notes || "",
    // artifact fields stored in metadata
    preClassDone: meta.pre_class_done || false,
    exitTicketDone: meta.exit_ticket_done || false,
    homeworkDone: meta.homework_done || false,
    latestPreClassPdfUrl: meta.latest_pre_class_pdf_url || "",
    latestExitTicketPdfUrl: meta.latest_exit_ticket_pdf_url || "",
    latestHomeworkPdfUrl: meta.latest_homework_pdf_url || "",
    sessionReportPdfUrl: meta.session_report_pdf_url || "",
    sessionReportR2Key: meta.session_report_r2_key || "",
    reportStatus: meta.report_status || "",
    preClassAttemptIds: meta.pre_class_attempt_ids || [],
    exitTicketAttemptIds: meta.exit_ticket_attempt_ids || [],
    homeworkAttemptIds: meta.homework_attempt_ids || [],
    sessionLengthMinutes: row.end_time && row.start_time
      ? Math.round((new Date(row.end_time) - new Date(row.start_time)) / 60000)
      : null,
  }
}

export async function listSessionsByStudentSubject(studentId, subjectId) {
  if (!studentId || !subjectId) return []
  const rows = await supabaseSelect("sessions", {
    select: "*",
    filters: { student_id: studentId, subject_id: subjectId },
    orderBy: "student_session_date",
    ascending: false,
  })
  return rows.map(parseSession)
}

export async function getSessionByStudentSubjectDate(studentId, subjectId, sessionDate) {
  if (!studentId || !subjectId || !sessionDate) return null
  const target = String(sessionDate || "").slice(0, 10)
  const rows = await supabaseSelect("sessions", {
    select: "*",
    filters: { student_id: studentId, subject_id: subjectId, student_session_date: target },
    limit: 1,
  })
  return rows.length ? parseSession(rows[0]) : null
}

export async function getSessionByStudentSubjectTutorDate(studentId, subjectId, tutorSessionDate) {
  if (!studentId || !subjectId || !tutorSessionDate) return null
  const target = String(tutorSessionDate || "").slice(0, 10)
  const rows = await supabaseSelect("sessions", {
    select: "*",
    filters: { student_id: studentId, subject_id: subjectId, tutor_session_date: target },
    limit: 1,
  })
  if (rows.length) return parseSession(rows[0])
  // fallback: scan student_session_date
  const all = await listSessionsByStudentSubject(studentId, subjectId)
  return all.find((s) => String(s.studentSessionDate || "").slice(0, 10) === target) || null
}

export async function getLatestSessionByStudentSubjectOnOrBefore(studentId, subjectId, studentDate) {
  if (!studentDate) return null
  const rows = await listSessionsByStudentSubject(studentId, subjectId)
  return rows.find((r) => r.studentSessionDate && r.studentSessionDate <= String(studentDate).slice(0, 10)) || null
}

export async function getSessionById(sessionId) {
  if (!sessionId) return null
  const rows = await supabaseSelect("sessions", { select: "*", filters: { id: sessionId }, limit: 1 })
  return rows.length ? parseSession(rows[0]) : null
}

export async function updateSessionArtifacts(sessionId, metadataPatch = {}) {
  if (!sessionId) return null
  const existing = await getSessionById(sessionId)
  if (!existing) return null
  const merged = { ...(existing._rawMetadata || {}), ...metadataPatch }
  return supabaseUpdate("sessions", { id: sessionId }, { metadata: merged })
}

export async function updateSessionImportState(sessionId, {
  importStatus = "imported",
  importOverride = false,
  overrideReason = "",
} = {}) {
  if (!sessionId) return null
  return supabaseUpdate("sessions", { id: sessionId }, {
    import_status: importStatus,
    import_override: !!importOverride,
    override_reason: overrideReason || null,
    updated_at: new Date().toISOString(),
  })
}

export async function archiveSessionRow(sessionId) {
  // Supabase has no archive flag on sessions — soft-delete via import_status
  if (!sessionId) return null
  return supabaseUpdate("sessions", { id: sessionId }, { import_status: "archived" })
}

export async function createSessionRow({
  studentId,
  subjectId,
  studentSessionDate = "",
  sessionMode = "unknown",
  startTime = "",
  endTime = "",
  eventId = "",
  sessionSource = "calendar_exact",
  importStatus = "not_imported",
  importOverride = false,
  overrideReason = "",
  sessionNotes = "",
} = {}) {
  if (!studentId || !subjectId || !studentSessionDate) return null
  const rows = await supabaseInsert("sessions", [{
    student_id: studentId,
    subject_id: subjectId,
    student_session_date: String(studentSessionDate).slice(0, 10),
    source: sessionSource || "manual",
    mode: sessionMode || "unknown",
    calendar_event_id: eventId || null,
    start_time: startTime || null,
    end_time: endTime || null,
    import_status: importStatus || null,
    import_override: !!importOverride,
    override_reason: overrideReason || null,
    notes: sessionNotes || null,
    metadata: {},
  }])
  const row = Array.isArray(rows) ? rows[0] : rows
  return row ? parseSession(row) : null
}

// ─────────────────────────────────────────────
//  QUESTION TYPES (replaces "question pages")
// ─────────────────────────────────────────────

function parseQuestionType(row) {
  const weightedTargets = Array.isArray(row.metadata?.weighted_slo_targets_normalized)
    ? row.metadata.weighted_slo_targets_normalized
    : Array.isArray(row.metadata?.weighted_slo_targets_raw)
      ? row.metadata.weighted_slo_targets_raw
      : []
  return {
    id: row.id,
    title: row.title || "",
    standardCode: "",  // derived — not stored
    primarySlo: row.primary_slo_id || "",
    primarySloId: row.primary_slo_id || "",
    alignedSlos: row.aligned_slo_ids || [],
    reinforcementSlos: Array.isArray(row.reinforcement_slos) ? row.reinforcement_slos : [],
    reinforcementTargets: (Array.isArray(row.reinforcement_slos) ? row.reinforcement_slos : [])
      .map((r) => ({ code: r.slo || r.slo_id || "", weight: r.weight || 0 }))
      .filter((r) => r.code),
    unit: row.unit_label || "",
    unitLabel: row.unit_label || "",
    contentBankId: row.content_bank_id || null,
    schoolSectionId: row.school_section_id || null,
    weightedSloTargets: weightedTargets,
    loConfidence: row.lo_confidence || "",
    sourceLabel: row.source_label || "",
    status: row.status || "",
    // compat fields (callers may reference these)
    name: row.title || "",
    questionPageId: row.id,  // alias so legacy callers can use questionPageId
  }
}

export async function getAllQuestionsForSubject(contentBankId) {
  if (!contentBankId) return []
  const rows = await supabaseSelect("question_types", {
    select: "*",
    filters: { content_bank_id: contentBankId },
  })
  return rows.map(parseQuestionType)
}

export async function getQuestionTypeById(questionTypeId) {
  if (!questionTypeId) return null
  const rows = await supabaseSelect("question_types", {
    select: "*",
    filters: { id: questionTypeId },
    limit: 1,
  })
  return rows.length ? parseQuestionType(rows[0]) : null
}

export async function getQuestionsForQuestionType(questionTypeId) {
  if (!questionTypeId) return []
  return supabaseSelect("questions", {
    select: "*",
    filters: { question_type_id: questionTypeId },
    orderBy: "ordinal",
  })
}

// Legacy hydration: given a list of student_question_type rows, attach question_type data
async function hydrateStudentQTRows(sqtRows) {
  const ids = [...new Set(sqtRows.map((r) => r.questionTypeId).filter(Boolean))]
  if (!ids.length) return sqtRows
  const qtRows = await supabaseSelect("question_types", {
    select: "*",
    filters: { id: ids },
  })
  const qtMap = {}
  qtRows.forEach((qt) => { qtMap[qt.id] = parseQuestionType(qt) })
  return sqtRows.map((row) => {
    const qt = qtMap[row.questionTypeId] || {}
    return {
      ...qt,
      ...row,
      // spread order above lets row.id (student_question_types PK) overwrite
      // qt.id (question_types PK). Callers like assessment.js use .id as the
      // question type id, so restore it here and expose the SQT row id under
      // scoreRowId.
      id: qt.id || row.questionTypeId,
      weaknessScore: row.weaknessScore,
      scoreRowId: row.id,
    }
  })
}

// ─────────────────────────────────────────────
//  STUDENT QUESTION TYPES  (was: Scores DB)
//  Primary key for lookups: (studentId, subjectId, questionTypeId)
// ─────────────────────────────────────────────

function parseSQT(row) {
  const parsedHwSource = parseHwSourceStr(row.hw_source || "")
  // question_types join is optional — present when select includes it
  const qtTitle = row.question_types?.title || ""
  return {
    id: row.id,
    studentId: row.student_id,
    subjectId: row.subject_id,
    questionTypeId: row.question_type_id,
    questionId: row.question_type_id,       // compat alias
    questionPageId: row.question_type_id,   // compat alias
    questionName: qtTitle,                  // title from joined question_types
    assignedSessionId: row.assigned_session_id || null,
    dateIntroduced: row.date_introduced || null,
    score: Number(row.weakness_score ?? 0),
    weaknessScore: Number(row.weakness_score ?? 0),
    status: row.status || "",
    hwSource: row.hw_source || "",
    hwSourceKind: parsedHwSource.kind,
    hwAssignedAt: parsedHwSource.assignedAt,
    hwSessionDate: parsedHwSource.sessionDate,
    unitLabel: row.unit_label || "",
    unit: row.unit_label || "",
    primarySloId: row.primary_slo_id || "",
    primarySlo: row.primary_slo_id || "",
    alignedSlos: row.aligned_slo_ids || [],
    reinforcementSlos: Array.isArray(row.reinforcement_slos) ? row.reinforcement_slos : [],
    correctQuestionKeys: row.correct_question_keys || [],
    dailySeenDates: row.daily_seen_dates || [],
    dailyWrongDates: row.daily_wrong_dates || [],
    masteryEvents: Array.isArray(row.mastery_events) ? row.mastery_events : [],
    hwStreak: JSON.stringify((row.metadata?.hw_streak) || []),
  }
}

// Core lookup: get a single SQT row
export async function getScoreRow(studentId, questionTypeId) {
  if (!studentId || !questionTypeId) return null
  const rows = await supabaseSelect("student_question_types", {
    select: "*",
    filters: { student_id: studentId, question_type_id: questionTypeId },
    limit: 1,
  })
  return rows.length ? parseSQT(rows[0]) : null
}

export async function createScoreRow(studentId, subjectId, question, dateIntroduced, hwSource = "session") {
  const questionTypeId = question.id || question.questionTypeId || question.questionPageId
  if (!studentId || !subjectId || !questionTypeId) return null
  const rows = await supabaseInsert("student_question_types", [{
    student_id: studentId,
    subject_id: subjectId,
    question_type_id: questionTypeId,
    date_introduced: dateIntroduced || null,
    weakness_score: 0,
    hw_source: hwSource || null,
    unit_label: question.unit || question.unitLabel || null,
    primary_slo_id: question.primarySlo || question.primarySloId || null,
    aligned_slo_ids: question.alignedSlos || [],
    reinforcement_slos: question.reinforcementSlos || [],
    mastery_events: [],
    correct_question_keys: [],
    daily_seen_dates: [],
    daily_wrong_dates: [],
    metadata: {},
  }])
  const row = Array.isArray(rows) ? rows[0] : rows
  return row ? parseSQT(row) : null
}

export async function getAllScoresForStudent(studentId, subjectId = null) {
  if (!studentId) return []
  const filters = subjectId
    ? { student_id: studentId, subject_id: subjectId }
    : { student_id: studentId }
  // Join question_types so parseSQT can populate questionName
  const rows = await supabaseSelect("student_question_types", {
    select: "*,question_types(title)",
    filters,
  })
  return rows.map(parseSQT)
}

export async function getTodayScoreRows(studentId, subjectId) {
  const rows = await getAllScoresForStudent(studentId, subjectId)
  if (!rows.length) return []
  const dates = [...new Set(rows.map((r) => r.dateIntroduced).filter(Boolean))].sort().reverse()
  const latest = dates[0]
  return latest ? rows.filter((r) => r.dateIntroduced === latest) : []
}

export async function getScoreRowsForDate(studentId, subjectId, dateStr) {
  if (!dateStr) return []
  const rows = await getAllScoresForStudent(studentId, subjectId)
  return rows.filter((r) => r.dateIntroduced === String(dateStr).slice(0, 10))
}

export async function getPreviousSessionScoreRows(studentId, subjectId, timezone = null) {
  const rows = await getAllScoresForStudent(studentId, subjectId)
  if (!rows.length) return []
  const datesDesc = [...new Set(rows.map((r) => r.dateIntroduced).filter(Boolean))].sort().reverse()
  if (!datesDesc.length) return []
  if (datesDesc.length === 1) return rows.filter((r) => r.dateIntroduced === datesDesc[0])
  const today = getTodayInTimezone(timezone || "UTC")
  const latest = datesDesc[0]
  const pickDate = (latest >= today) ? datesDesc[1] : latest
  return rows.filter((r) => r.dateIntroduced === pickDate)
}

export async function getPreviousSessionScoreRowsBeforeDate(studentId, subjectId, anchorDate) {
  if (!anchorDate) return []
  const rows = await getAllScoresForStudent(studentId, subjectId)
  const datesDesc = [...new Set(rows.map((r) => r.dateIntroduced).filter(Boolean))].sort().reverse()
  if (!datesDesc.length) return []
  const eligible = datesDesc.filter((d) => d <= anchorDate)
  if (!eligible.length) return []
  const latestEligible = eligible[0]
  const earlierEligible = eligible.find((d) => d < latestEligible)
  const pickDate = (latestEligible === anchorDate && earlierEligible) ? earlierEligible : latestEligible
  return rows.filter((r) => r.dateIntroduced === pickDate)
}

export async function getLatestSessionDate(studentId, subjectId) {
  const rows = await getTodayScoreRows(studentId, subjectId)
  return rows[0]?.dateIntroduced || null
}

export async function getLatestSessionDateOnOrBefore(studentId, subjectId, timezone = "UTC") {
  const rows = await getAllScoresForStudent(studentId, subjectId)
  const today = getTodayInTimezone(timezone || "UTC")
  const eligible = rows
    .map((r) => r.dateIntroduced)
    .filter((d) => d && d <= today)
    .sort()
  return eligible.at(-1) || null
}

async function _updateSQT(studentId, questionTypeId, patch) {
  return supabaseUpdate(
    "student_question_types",
    { student_id: studentId, question_type_id: questionTypeId },
    { ...patch, updated_at: new Date().toISOString() }
  )
}

export async function pushQuestionToDate(scoreRowId, newDateStr) {
  return supabaseUpdate(
    "student_question_types",
    { id: scoreRowId },
    { date_introduced: newDateStr, updated_at: new Date().toISOString() }
  )
}

export async function setScoreRowStatus(scoreRowId, statusName) {
  return supabaseUpdate("student_question_types", { id: scoreRowId }, {
    status: statusName,
    updated_at: new Date().toISOString(),
  })
}

// Kept for compat — standard_code is derived, not stored; this is a no-op
export async function setScoreRowStandardCode() { return null }

export async function setScoreRowAttemptedQuestionKeys(scoreRowId, keys = []) {
  return supabaseUpdate("student_question_types", { id: scoreRowId }, {
    correct_question_keys: keys,
    updated_at: new Date().toISOString(),
  })
}

export async function setScoreRowPracticeState(scoreRowId, {
  correctQuestionKeys,
  dailySeenDates,
  dailyWrongDates,
  masteryEvents,
} = {}) {
  const patch = { updated_at: new Date().toISOString() }
  if (correctQuestionKeys != null) patch.correct_question_keys = correctQuestionKeys
  if (dailySeenDates != null) patch.daily_seen_dates = dailySeenDates
  if (dailyWrongDates != null) patch.daily_wrong_dates = dailyWrongDates
  if (masteryEvents != null) patch.mastery_events = masteryEvents
  return supabaseUpdate("student_question_types", { id: scoreRowId }, patch)
}

export async function updateQuestionStatus(studentId, questionTypeId, wrongCount) {
  const existing = await getScoreRow(studentId, questionTypeId)
  if (!existing) return null
  const newScore = Math.round(((existing.weaknessScore || 0) + wrongCount * 0.1) * 1000) / 1000
  return _updateSQT(studentId, questionTypeId, { weakness_score: newScore })
}

export async function recordAssessmentResult(studentId, questionTypeId, topic, subjectId, correct, questionData = null, source = "assessment", eventDate = null) {
  const today = eventDate || getTodayInTimezone("UTC")
  const existing = await getScoreRow(studentId, questionTypeId)
  const weaknessDelta = 1
  if (existing) {
    const masteryEvents = correct
      ? [...existing.masteryEvents, buildMasteryEvent(source, "", today)].slice(-160)
      : existing.masteryEvents
    const newScore = correct
      ? Math.max(0, Math.round((existing.weaknessScore - weaknessDelta) * 1000) / 1000)
      : Math.round((existing.weaknessScore + weaknessDelta) * 1000) / 1000
    await _updateSQT(studentId, questionTypeId, {
      weakness_score: newScore,
      mastery_events: masteryEvents,
    })
    return { weaknessScore: newScore, masteryEvents, masteryScore: calculateMasteryScore(masteryEvents, today) }
  }
  const masteryEvents = correct ? [buildMasteryEvent(source, "", today)] : []
  await createScoreRow(studentId, subjectId, { id: questionTypeId, ...(questionData || {}) }, today, "session")
  if (correct) {
    await _updateSQT(studentId, questionTypeId, { mastery_events: masteryEvents, weakness_score: 0 })
  }
  return { weaknessScore: correct ? 0 : weaknessDelta, masteryEvents, masteryScore: calculateMasteryScore(masteryEvents, today) }
}

export async function getWeaknessScore(studentId, questionTypeId) {
  const row = await getScoreRow(studentId, questionTypeId)
  return row?.weaknessScore ?? 0
}

export async function incrementWeaknessScore(studentId, questionTypeId, topic, subjectId, questionData = null) {
  const existing = await getScoreRow(studentId, questionTypeId)
  if (existing) {
    const newScore = Math.round((existing.weaknessScore + 1) * 1000) / 1000
    await _updateSQT(studentId, questionTypeId, { weakness_score: newScore })
    return newScore
  }
  await createScoreRow(studentId, subjectId, { id: questionTypeId, ...(questionData || {}) }, getTodayInTimezone("UTC"), "session")
  await _updateSQT(studentId, questionTypeId, { weakness_score: 1 })
  return 1
}

export async function getWeaknessMap(studentId, subjectId = null) {
  const scores = await getAllScoresForStudent(studentId, subjectId)
  const unitMap = {}
  scores.forEach((s) => {
    if (!s.score) return
    if (s.unit) {
      unitMap[s.unit] = Math.round(((unitMap[s.unit] || 0) + s.score) * 100) / 100
    }
  })
  return { topics: {}, units: unitMap }
}

export async function getHWStreak(studentId, questionTypeId) {
  const row = await getScoreRow(studentId, questionTypeId)
  if (!row) return []
  try { return JSON.parse(row.hwStreak || "[]") } catch { return [] }
}

export async function recordHWAttempt(studentId, questionTypeId, topic, subjectId, correct, timezone, questionKey = "") {
  const today = getTodayInTimezone(timezone)
  const existing = await getScoreRow(studentId, questionTypeId)
  let streak = []
  try { streak = JSON.parse(existing?.hwStreak || "[]") } catch {}
  const alreadyToday = streak.find((r) => r.date === today)
  if (!alreadyToday) {
    streak = [...streak, { date: today, correct }].slice(-60)
  }

  if (existing) {
    const newScore = correct
      ? Math.max(0, Math.round((existing.weaknessScore - 0.2) * 1000) / 1000)
      : Math.round((existing.weaknessScore + 0.2) * 1000) / 1000
    const masteryEvents = correct
      ? [...existing.masteryEvents, buildMasteryEvent("homework", questionKey)].slice(-160)
      : existing.masteryEvents
    await _updateSQT(studentId, questionTypeId, {
      weakness_score: newScore,
      mastery_events: masteryEvents,
      metadata: { ...(existing._rawMetadata || {}), hw_streak: streak },
    })
    return { weaknessScore: newScore, masteryEvents, masteryScore: calculateMasteryScore(masteryEvents, today) }
  }

  const masteryEvents = correct ? [buildMasteryEvent("homework", questionKey)] : []
  await createScoreRow(studentId, subjectId, { id: questionTypeId, title: topic }, today, "session")
  await _updateSQT(studentId, questionTypeId, {
    weakness_score: correct ? 0 : 0.2,
    mastery_events: masteryEvents,
    metadata: { hw_streak: streak },
  })
  return { weaknessScore: correct ? 0 : 0.2, masteryEvents, masteryScore: calculateMasteryScore(masteryEvents, today) }
}

export async function applyComboReduction(studentId, questionTypeId, reduction) {
  const existing = await getScoreRow(studentId, questionTypeId)
  if (!existing) return
  const newScore = Math.max(0, Math.round((existing.weaknessScore - reduction) * 1000) / 1000)
  await _updateSQT(studentId, questionTypeId, { weakness_score: newScore })
}

export async function recordPracticeAttempt(studentId, questionTypeId, topic, subjectId, questionKey, result, timezone) {
  const today = getTodayInTimezone(timezone)
  const existing = await getScoreRow(studentId, questionTypeId)
  const correctQuestionKeys = result === "correct"
    ? [...new Set([...(existing?.correctQuestionKeys || []), questionKey])]
    : (existing?.correctQuestionKeys || [])
  const dailySeenDates = [...new Set([...(existing?.dailySeenDates || []), today])]
  const dailyWrongDates = result === "wrong"
    ? [...new Set([...(existing?.dailyWrongDates || []), today])]
    : (existing?.dailyWrongDates || []).filter((d) => d !== today)
  const masteryEvents = result === "correct"
    ? [...(existing?.masteryEvents || []), buildMasteryEvent("practice", questionKey)].slice(-160)
    : (existing?.masteryEvents || [])
  const nextScore = result === "correct"
    ? Math.max(0, Math.round(((existing?.weaknessScore || 0) - 0.1) * 1000) / 1000)
    : Math.round(((existing?.weaknessScore || 0) + 0.1) * 1000) / 1000

  if (existing?.id) {
    await _updateSQT(studentId, questionTypeId, {
      weakness_score: nextScore,
      mastery_events: masteryEvents,
      correct_question_keys: correctQuestionKeys,
      daily_seen_dates: dailySeenDates,
      daily_wrong_dates: dailyWrongDates,
    })
    return { rowId: existing.id, weaknessScore: nextScore, correctQuestionKeys, dailySeenDates, dailyWrongDates, masteryEvents, masteryScore: calculateMasteryScore(masteryEvents, today) }
  }

  const created = await createScoreRow(studentId, subjectId, { id: questionTypeId, title: topic }, today, "session")
  await _updateSQT(studentId, questionTypeId, {
    weakness_score: nextScore,
    mastery_events: masteryEvents,
    correct_question_keys: correctQuestionKeys,
    daily_seen_dates: dailySeenDates,
    daily_wrong_dates: dailyWrongDates,
  })
  return { rowId: created?.id || null, weaknessScore: nextScore, correctQuestionKeys, dailySeenDates, dailyWrongDates, masteryEvents, masteryScore: calculateMasteryScore(masteryEvents, today) }
}

export async function setHWSource(scoreRowId, source) {
  return supabaseUpdate("student_question_types", { id: scoreRowId }, {
    hw_source: source || null,
    updated_at: new Date().toISOString(),
  })
}

export async function getHWStack(studentId, subjectId) {
  const scores = await getAllScoresForStudent(studentId, subjectId)
  return scores.filter((s) => s.hwSource || s.weaknessScore > 2)
}

export async function tagHWSource(scoreRowIds, source) {
  await Promise.all(scoreRowIds.map((id) => setHWSource(id, source)))
}

export async function clearSessionHWTags(studentId, subjectId) {
  const scores = await getAllScoresForStudent(studentId, subjectId)
  const sessionRows = scores.filter((s) => s.hwSourceKind === "session")
  await Promise.all(sessionRows.map((s) => setHWSource(s.id, "")))
}

export async function maybeRemoveFromHWStack(scoreRowId, newScore, hwSource) {
  if (newScore <= 0 && isHwSourceKind(hwSource, "weakness")) {
    await setHWSource(scoreRowId, "")
  }
}

export async function penalizeAllTodayQuestions(studentId, subjectId, timezone) {
  const rows = await getTodayScoreRows(studentId, subjectId)
  await Promise.all(rows.map((r) =>
    _updateSQT(studentId, r.questionTypeId, { weakness_score: (r.weaknessScore || 0) + 1 })
  ))
  return rows.length
}

export async function getQuestionsWithScores(dataSourceId, studentId, subjectId) {
  const [qtRows, scoreRows] = await Promise.all([
    getAllQuestionsForSubject(dataSourceId),
    getAllScoresForStudent(studentId, subjectId),
  ])
  const scoreMap = {}
  scoreRows.forEach((s) => { scoreMap[s.questionTypeId] = s })
  return qtRows.map((qt) => {
    const s = scoreMap[qt.id] || {}
    return {
      ...qt,
      weaknessScore: s.weaknessScore || 0,
      hwStreak: s.hwStreak || "[]",
      dateIntroduced: s.dateIntroduced || null,
      scoreRowId: s.id || null,
      hwSource: s.hwSource || "",
      hwSourceKind: s.hwSourceKind || "",
      hwAssignedAt: s.hwAssignedAt || "",
      hwSessionDate: s.hwSessionDate || "",
      status: s.status || "",
      unit: s.unit || qt.unit || "",
      correctQuestionKeys: s.correctQuestionKeys || [],
      dailySeenDates: s.dailySeenDates || [],
      dailyWrongDates: s.dailyWrongDates || [],
      masteryEvents: s.masteryEvents || [],
    }
  })
}

export async function getWeakQuestionsForStudent(dataSourceId, studentId) {
  const scores = await getAllScoresForStudent(studentId)
  const weakRows = scores.filter((s) => s.weaknessScore > 0)
  if (!weakRows.length) return []
  const ids = weakRows.map((r) => r.questionTypeId).filter(Boolean)
  const qtRows = await supabaseSelect("question_types", {
    select: "*",
    filters: { id: ids },
  })
  const qtMap = {}
  qtRows.forEach((qt) => { qtMap[qt.id] = parseQuestionType(qt) })
  return weakRows.map((row) => ({
    ...(qtMap[row.questionTypeId] || {}),
    score: row.weaknessScore,
    scoreRowId: row.id,
  })).filter((r) => r.id)
}

// Question hydration (legacy callers)
export async function getTodayQuestions(dataSourceId, studentId, subjectId, timezone, sessionDate = null) {
  const rows = sessionDate
    ? await getScoreRowsForDate(studentId, subjectId, sessionDate)
    : await getTodayScoreRows(studentId, subjectId)
  return hydrateStudentQTRows(rows)
}

export async function getTodayTopicsAny(dataSourceId, studentId, subjectId, timezone, sessionDate = null) {
  return sessionDate
    ? getScoreRowsForDate(studentId, subjectId, sessionDate)
    : getTodayScoreRows(studentId, subjectId)
}

export async function getPreviousClassQuestions(dataSourceId, studentId, subjectId, timezone) {
  const rows = await getPreviousSessionScoreRows(studentId, subjectId, timezone)
  return hydrateStudentQTRows(rows)
}

export async function getPreviousClassQuestionsBeforeDate(dataSourceId, studentId, subjectId, anchorDate) {
  const rows = await getPreviousSessionScoreRowsBeforeDate(studentId, subjectId, anchorDate)
  return hydrateStudentQTRows(rows)
}

export async function getQuestionsByIds(sqtRowIds) {
  if (!sqtRowIds?.length) return []
  const rows = await supabaseSelect("student_question_types", {
    select: "*",
    filters: { id: sqtRowIds },
  })
  return hydrateStudentQTRows(rows.map(parseSQT))
}

// Shape each question row into the { qhash, mcq, imageUrl } format that
// assessment.js and homework.js expect (legacy MCQ-cache pattern).
async function getQuestionPool(questionTypeId) {
  const rows = await getQuestionsForQuestionType(questionTypeId)
  // Stem master singleton: per stem_group_id, only ONE row carries
  // stem_header_content. Build a map so non-master children can inherit
  // the shared figure at fetch time.
  const stemHeaderByGroup = new Map()
  for (const r of rows) {
    if (!r.stem_group_id) continue
    const sh = Array.isArray(r.stem_header_content) && r.stem_header_content.length
      ? r.stem_header_content
      : null
    if (!sh) continue
    if (!stemHeaderByGroup.has(r.stem_group_id)) {
      stemHeaderByGroup.set(r.stem_group_id, sh)
    }
  }
  return rows
    .filter((r) => r.question_text)
    .map((r) => {
      const options = Array.isArray(r.options) ? r.options : []
      const correctOption = String(r.correct_option || "").trim()
      let correctIndex = null
      if (Number.isInteger(r.correct_index)) {
        correctIndex = r.correct_index
      } else if (correctOption && options.length) {
        const idx = options.findIndex((opt) => String(opt || "").trim() === correctOption)
        correctIndex = idx >= 0 ? idx : null
      }
      const content = Array.isArray(r.question_content) && r.question_content.length
        ? r.question_content
        : null
      const firstImageUrl = content
        ? (content.find((item) => item?.type === "image" && item?.url)?.url || null)
        : null

      const questionFormat = r.question_format || "mcq"
      // Stem children fetch the master's header by stem_group_id when their
      // own stem_header_content is null (singleton-master shape).
      const ownStemHeader = Array.isArray(r.stem_header_content) && r.stem_header_content.length
        ? r.stem_header_content
        : null
      const stemHeader = ownStemHeader
        || (r.stem_group_id ? (stemHeaderByGroup.get(r.stem_group_id) || null) : null)

      return {
        qhash: r.qhash,
        imageUrl: firstImageUrl,
        content,
        question: r.question_text,
        answer: r.answer_text || "",
        options,
        correctIndex,
        explanation: r.explanation || "",
        questionFormat,
        stemGroupId: r.stem_group_id || null,
        isStemChild: !!r.is_stem_child,
        stemHeader,
        mcq: {
          question: r.question_text,
          options,
          answer: r.answer_text || "",
          correct_option: correctOption,
          correctIndex,
          explanation: r.explanation || "",
          qhash: r.qhash,
          content,
          questionFormat,
          stemGroupId: r.stem_group_id || null,
          isStemChild: !!r.is_stem_child,
          stemHeader,
        },
      }
    })
}

export async function getQuestionsForStudentContext(questionTypeId) {
  return getQuestionPool(questionTypeId)
}

export async function getAllQuestionsForPage(questionTypeId) {
  return getQuestionPool(questionTypeId)
}

// ─────────────────────────────────────────────
//  DRAFT ITEMS  (was: Draft DB)
// ─────────────────────────────────────────────

function parseDraftItem(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    subjectId: row.subject_id,
    questionTypeId: row.question_type_id,
    questionPageId: row.question_type_id,   // compat alias
    sessionId: row.session_id || null,
    assignedSessionDate: row.assigned_session_date || null,
    state: row.state || "draft",
    planSource: row.plan_source || "",
    orderIndex: row.order_index ?? null,
    committed: row.committed || false,
    committedAt: row.committed_at || null,
    datesInferred: row.dates_inferred || false,
    inferenceReason: row.inference_reason || "",
    notes: row.notes || "",
    primarySloId: row.primary_slo_id || "",
    primarySlo: row.primary_slo_id || "",
    alignedSlos: row.aligned_slo_ids || [],
    reinforcementSlos: Array.isArray(row.reinforcement_slos) ? row.reinforcement_slos : [],
    schoolUnitName: row.school_unit_name || "",
    schoolSectionLabel: row.school_section_label || "",
    // compat
    standardCode: "",
    unit: row.school_unit_name || "",
  }
}

export async function getDraftRowById(draftId) {
  if (!draftId) return null
  const rows = await supabaseSelect("draft_items", { select: "*", filters: { id: draftId }, limit: 1 })
  return rows.length ? parseDraftItem(rows[0]) : null
}

export async function listDraftRowsByStudentSubject(studentId, subjectId, {
  state = "",
  planSource = "",
  sessionDate = "",
  committed = null,
  limit = 100,
} = {}) {
  if (!studentId || !subjectId) return []
  const rows = await supabaseSelect("draft_items", {
    select: "*",
    filters: { student_id: studentId, subject_id: subjectId },
    orderBy: "assigned_session_date",
    ascending: true,
  })
  let filtered = rows
  if (state) filtered = filtered.filter((r) => r.state === state)
  if (planSource) filtered = filtered.filter((r) => r.plan_source === planSource)
  if (sessionDate) filtered = filtered.filter((r) => r.assigned_session_date === String(sessionDate).slice(0, 10))
  if (committed != null) filtered = filtered.filter((r) => r.committed === !!committed)
  return filtered.slice(0, Math.max(1, limit)).map(parseDraftItem)
}

export async function listDraftRowsForSession(sessionId, {
  state = "",
  committed = null,
  limit = 100,
} = {}) {
  if (!sessionId) return []
  const rows = await supabaseSelect("draft_items", {
    select: "*",
    filters: { session_id: sessionId },
    orderBy: "order_index",
  })
  let filtered = rows
  if (state) filtered = filtered.filter((r) => r.state === state)
  if (committed != null) filtered = filtered.filter((r) => r.committed === !!committed)
  return filtered.slice(0, Math.max(1, limit)).map(parseDraftItem)
}

export async function listDraftRowsForDate(studentId, subjectId, sessionDate, {
  committed = null,
  limit = 100,
} = {}) {
  return listDraftRowsByStudentSubject(studentId, subjectId, { sessionDate, committed, limit })
}

export async function getDraftRowByQuestionPage(studentId, subjectId, questionTypeId) {
  if (!studentId || !subjectId || !questionTypeId) return null
  const rows = await supabaseSelect("draft_items", {
    select: "*",
    filters: { student_id: studentId, subject_id: subjectId, question_type_id: questionTypeId },
    orderBy: "assigned_session_date",
    ascending: false,
    limit: 1,
  })
  return rows.length ? parseDraftItem(rows[0]) : null
}

export async function createDraftRow({
  studentId = "",
  subjectId = "",
  questionPageId = "",   // treated as questionTypeId
  questionTypeId = "",
  sessionId = "",
  primarySlo = "",
  alignedSlos = [],
  reinforcementSlos = [],
  unit = "",
  assignedSessionDate = "",
  state = "backlog",
  planSource = "import",
  orderIndex = null,
  committed = false,
  committedAt = "",
  datesInferred = false,
  inferenceReason = "",
  notes = "",
} = {}) {
  const qtId = questionTypeId || questionPageId
  if (!studentId || !subjectId || !qtId) return null
  const rows = await supabaseInsert("draft_items", [{
    student_id: studentId,
    subject_id: subjectId,
    question_type_id: qtId,
    session_id: sessionId || null,
    assigned_session_date: assignedSessionDate ? String(assignedSessionDate).slice(0, 10) : null,
    state: state || "backlog",
    plan_source: planSource || null,
    order_index: orderIndex != null ? Number(orderIndex) : null,
    committed: !!committed,
    committed_at: committedAt || null,
    dates_inferred: !!datesInferred,
    inference_reason: inferenceReason || null,
    notes: notes || null,
    primary_slo_id: primarySlo || null,
    aligned_slo_ids: alignedSlos || [],
    reinforcement_slos: reinforcementSlos || [],
    school_unit_name: unit || null,
    metadata: {},
  }])
  const row = Array.isArray(rows) ? rows[0] : rows
  return row ? parseDraftItem(row) : null
}

export async function updateDraftRow(draftId, {
  sessionId,
  questionPageId,
  questionTypeId,
  primarySlo,
  alignedSlos,
  reinforcementSlos,
  unit,
  assignedSessionDate,
  state,
  planSource,
  orderIndex,
  committed,
  committedAt,
  datesInferred,
  inferenceReason,
  notes,
} = {}) {
  if (!draftId) return null
  const patch = { updated_at: new Date().toISOString() }
  if (sessionId != null) patch.session_id = sessionId || null
  if (questionTypeId != null || questionPageId != null) {
    patch.question_type_id = questionTypeId || questionPageId
  }
  if (primarySlo != null) patch.primary_slo_id = primarySlo || null
  if (alignedSlos != null) patch.aligned_slo_ids = alignedSlos
  if (reinforcementSlos != null) patch.reinforcement_slos = reinforcementSlos
  if (unit != null) patch.school_unit_name = unit || null
  if (assignedSessionDate != null) {
    patch.assigned_session_date = assignedSessionDate ? String(assignedSessionDate).slice(0, 10) : null
  }
  if (state != null) patch.state = state
  if (planSource != null) patch.plan_source = planSource
  if (orderIndex != null) patch.order_index = Number(orderIndex)
  if (committed != null) patch.committed = !!committed
  if (committedAt != null) patch.committed_at = committedAt || null
  if (datesInferred != null) patch.dates_inferred = !!datesInferred
  if (inferenceReason != null) patch.inference_reason = inferenceReason || null
  if (notes != null) patch.notes = notes || null
  return supabaseUpdate("draft_items", { id: draftId }, patch)
}

export async function upsertDraftRowByQuestionPage({
  studentId = "",
  subjectId = "",
  questionPageId = "",
  questionTypeId = "",
  ...rest
} = {}) {
  const qtId = questionTypeId || questionPageId
  if (!studentId || !subjectId || !qtId) return null
  const existing = await getDraftRowByQuestionPage(studentId, subjectId, qtId)
  if (existing?.id) {
    await updateDraftRow(existing.id, { studentId, subjectId, questionPageId: qtId, questionTypeId: qtId, ...rest })
    return getDraftRowById(existing.id)
  }
  return createDraftRow({ studentId, subjectId, questionPageId: qtId, questionTypeId: qtId, ...rest })
}

// ─────────────────────────────────────────────
//  HOMEWORK ATTEMPTS
// ─────────────────────────────────────────────

export function hasHomeworkAttemptsDB() { return true }

function parseHWAttempt(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    subjectId: row.subject_id,
    sessionId: row.session_id || "",
    batchKey: row.batch_key || "",
    cycleKey: row.cycle_key || "",
    sessionDate: row.session_date || null,
    unlockAt: row.unlock_at || null,
    expireAt: row.expire_at || null,
    status: row.status || "",
    score: row.score ?? null,
    total: row.total ?? null,
    sourceSummary: row.source_summary || "",
    attemptNumber: row.attempt_number ?? null,
    isLatest: row.is_latest ?? true,
    isOfficial: row.is_official ?? true,
    pdfUrl: row.pdf_url || "",
    pdfR2Key: row.storage_key || "",
    questionPayload: Array.isArray(row.question_payload) ? row.question_payload : [],
    resultPayload: row.result_payload || null,
    questionPayloadText: JSON.stringify(row.question_payload || []),
    resultPayloadText: JSON.stringify(row.result_payload || {}),
  }
}

export async function getHomeworkAttemptForSession(studentId, subjectId, sessionDate) {
  if (!sessionDate) return null
  const rows = await supabaseSelect("homework_attempts", {
    select: "*",
    filters: { student_id: studentId, subject_id: subjectId, session_date: String(sessionDate).slice(0, 10) },
    orderBy: "created_at",
    ascending: false,
    limit: 1,
  })
  return rows.length ? parseHWAttempt(rows[0]) : null
}

export async function getHomeworkAttemptByCycle(studentId, subjectId, cycleKey) {
  if (!cycleKey) return null
  const rows = await supabaseSelect("homework_attempts", {
    select: "*",
    filters: { student_id: studentId, subject_id: subjectId, cycle_key: cycleKey },
    limit: 1,
  })
  return rows.length ? parseHWAttempt(rows[0]) : null
}

export async function getHomeworkAttemptById(attemptId) {
  if (!attemptId) return null
  const rows = await supabaseSelect("homework_attempts", { select: "*", filters: { id: attemptId }, limit: 1 })
  return rows.length ? parseHWAttempt(rows[0]) : null
}

export async function listHomeworkAttempts(studentId, subjectId, limit = 12) {
  const rows = await supabaseSelect("homework_attempts", {
    select: "*",
    filters: { student_id: studentId, subject_id: subjectId },
    orderBy: "created_at",
    ascending: false,
  })
  return rows.slice(0, Math.max(1, limit)).map(parseHWAttempt)
}

export async function createHomeworkAttempt({
  studentId,
  subjectId,
  sessionId = "",
  batchKey,
  cycleKey,
  sessionDate,
  unlockAt,
  expireAt,
  status = "Assigned",
  questions = [],
  sourceSummary = "",
  attemptNumber = 1,
  isLatest = true,
  isOfficial = true,
} = {}) {
  const rows = await supabaseInsert("homework_attempts", [{
    student_id: studentId,
    subject_id: subjectId,
    session_id: sessionId || null,
    batch_key: batchKey || null,
    cycle_key: cycleKey || null,
    session_date: sessionDate ? String(sessionDate).slice(0, 10) : null,
    unlock_at: unlockAt || null,
    expire_at: expireAt || null,
    status: status || "Assigned",
    score: 0,
    total: Array.isArray(questions) ? questions.length : 0,
    source_summary: sourceSummary || null,
    question_payload: Array.isArray(questions) ? questions : [],
    result_payload: {},
    attempt_number: attemptNumber,
    is_latest: !!isLatest,
    is_official: !!isOfficial,
    pdf_url: null,
    storage_key: null,
    metadata: {},
  }])
  const row = Array.isArray(rows) ? rows[0] : rows
  return row ? parseHWAttempt(row) : null
}

export async function completeHomeworkAttempt(attemptId, {
  status = "Completed",
  resultPayload = null,
  score = 0,
  total = 0,
} = {}) {
  if (!attemptId) return null
  return supabaseUpdate("homework_attempts", { id: attemptId }, {
    status,
    score,
    total,
    result_payload: resultPayload || {},
    submitted_at: new Date().toISOString(),
  })
}

export async function appendReadableHomeworkAttemptSummary() { return null }  // Notion-specific block op
export async function appendAttemptArtifactLinks() { return null }             // Notion-specific block op
export async function appendReadableAssessmentAttemptSummary() { return null } // Notion-specific block op

export async function updateHomeworkAttemptArtifacts(attemptId, {
  sessionId = "",
  attemptNumber = null,
  isLatest = null,
  isOfficial = null,
  pdfUrl = "",
  pdfR2Key = "",
} = {}) {
  if (!attemptId) return null
  const patch = {}
  if (pdfUrl) patch.pdf_url = pdfUrl
  if (pdfR2Key) patch.storage_key = pdfR2Key
  if (sessionId) patch.session_id = sessionId
  if (attemptNumber != null) patch.attempt_number = Number(attemptNumber) || 1
  if (isLatest != null) patch.is_latest = !!isLatest
  if (isOfficial != null) patch.is_official = !!isOfficial
  return supabaseUpdate("homework_attempts", { id: attemptId }, patch)
}

export async function updateHomeworkAttemptExpireAt(attemptId, expireAt) {
  if (!attemptId) return null
  return supabaseUpdate("homework_attempts", { id: attemptId }, { expire_at: expireAt || null })
}

// ─────────────────────────────────────────────
//  ASSESSMENT ATTEMPTS
// ─────────────────────────────────────────────

export function hasAssessmentAttemptsDB() { return true }
export function hasDraftDB() { return true }

// Callers use short modes ("pre"/"exit"); DB enum assessment_kind is pre_class/exit_ticket.
function toDbAssessmentKind(mode) {
  if (mode === "pre") return "pre_class"
  if (mode === "exit") return "exit_ticket"
  return mode
}
function fromDbAssessmentKind(kind) {
  if (kind === "pre_class") return "pre"
  if (kind === "exit_ticket") return "exit"
  return kind || ""
}

function parseAssessmentAttempt(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    subjectId: row.subject_id,
    sessionId: row.session_id || "",
    mode: fromDbAssessmentKind(row.assessment_kind || row.mode || ""),
    sessionDate: row.session_date || null,
    status: row.status || "",
    score: row.score ?? null,
    total: row.total ?? null,
    sourceSummary: "",
    attemptNumber: null,
    isLatest: true,
    isOfficial: true,
    pdfUrl: row.pdf_url || "",
    pdfR2Key: row.storage_key || "",
    questionPayload: Array.isArray(row.question_payload) ? row.question_payload : [],
    resultPayload: row.result_payload || null,
    questionPayloadText: JSON.stringify(row.question_payload || []),
    resultPayloadText: JSON.stringify(row.result_payload || {}),
  }
}

export async function getAssessmentAttempt(studentId, subjectId, mode, sessionDate) {
  if (!mode || !sessionDate) return null
  const rows = await supabaseSelect("assessment_attempts", {
    select: "*",
    filters: {
      student_id: studentId,
      subject_id: subjectId,
      assessment_kind: toDbAssessmentKind(mode),
      session_date: String(sessionDate).slice(0, 10),
    },
    limit: 1,
  })
  return rows.length ? parseAssessmentAttempt(rows[0]) : null
}

export async function getAssessmentAttemptById(attemptId) {
  if (!attemptId) return null
  const rows = await supabaseSelect("assessment_attempts", { select: "*", filters: { id: attemptId }, limit: 1 })
  return rows.length ? parseAssessmentAttempt(rows[0]) : null
}

export async function createAssessmentAttempt({
  studentId,
  subjectId,
  sessionId = "",
  mode,
  sessionDate,
  status = "Assigned",
  questions = [],
  sourceSummary = "",
  attemptNumber = 1,
  isLatest = true,
  isOfficial = true,
} = {}) {
  const rows = await supabaseInsert("assessment_attempts", [{
    student_id: studentId,
    subject_id: subjectId,
    session_id: sessionId || null,
    assessment_kind: toDbAssessmentKind(mode),
    session_date: sessionDate ? String(sessionDate).slice(0, 10) : null,
    status: status || "Assigned",
    score: 0,
    total: Array.isArray(questions) ? questions.length : 0,
    question_payload: Array.isArray(questions) ? questions : [],
    result_payload: {},
    pdf_url: null,
    storage_key: null,
    metadata: {},
  }])
  const row = Array.isArray(rows) ? rows[0] : rows
  return row ? parseAssessmentAttempt(row) : null
}

export async function completeAssessmentAttempt(attemptId, {
  status = "Completed",
  resultPayload = null,
  score = 0,
  total = 0,
} = {}) {
  if (!attemptId) return null
  return supabaseUpdate("assessment_attempts", { id: attemptId }, {
    status,
    score,
    total,
    result_payload: resultPayload || {},
    submitted_at: new Date().toISOString(),
  })
}

export async function updateAssessmentAttemptArtifacts(attemptId, {
  sessionId = "",
  pdfUrl = "",
  pdfR2Key = "",
} = {}) {
  if (!attemptId) return null
  const patch = {}
  if (pdfUrl) patch.pdf_url = pdfUrl
  if (pdfR2Key) patch.storage_key = pdfR2Key
  if (sessionId) patch.session_id = sessionId
  return supabaseUpdate("assessment_attempts", { id: attemptId }, patch)
}

export async function listAssessmentAttempts(studentId, subjectId = null, limit = 24) {
  const filters = subjectId
    ? { student_id: studentId, subject_id: subjectId }
    : { student_id: studentId }
  const rows = await supabaseSelect("assessment_attempts", {
    select: "*",
    filters,
    orderBy: "created_at",
    ascending: false,
  })
  return rows.slice(0, Math.max(1, limit)).map(parseAssessmentAttempt)
}

// ─────────────────────────────────────────────
//  REPORTS  (table not yet migrated — stub)
// ─────────────────────────────────────────────

export async function createReportRow({ studentId, subjectId, dateStr, reportUrl }) {
  // Reports table not yet in Supabase schema. Log and no-op.
  console.warn("[db] createReportRow: reports table not yet migrated", { studentId, subjectId, dateStr })
  return null
}

// ─────────────────────────────────────────────
//  NOTION-SPECIFIC STUBS
//  These were Notion block/page operations with no Supabase equivalent.
//  Callers that only needed them for Notion page content can be cleaned up.
// ─────────────────────────────────────────────

export async function getPageBlocks() { return [] }
export async function getAllQuestionBlocks() { return [] }
export async function appendQuestionImageReference() { return null }
export async function appendMcqCacheToQuestionPage() { return null }
export async function appendMcqCacheBundleToQuestionPage() { return null }
