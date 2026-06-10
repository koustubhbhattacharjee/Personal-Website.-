// ─────────────────────────────────────────────────────────────────────────────
//  pages/api/admin/plan-sessions.js
//
//  Supabase-native replacement for the old import.js session-distribution logic.
//
//  Takes all QTs in a content bank, sorts them by school overlay section order
//  (pacing order), splits them at a "frontier" (the anchor session date), then:
//
//    BACKFILL — QTs for sections before the frontier
//      → distributed across sessions from inferredStartDate up to anchorDate
//      → sessions inferred from enrollment cadence if real ones don't cover all QTs
//      → draft_items created with dates_inferred=true for synthetic sessions
//
//    FORWARD — QTs for sections from frontier onward
//      → distributed across sessions from anchorDate onward
//      → 3 QTs/hour × session duration (default 2h = 6 per session)
//
//  Actions (POST):
//    preview        — dry-run, returns planned assignments without writing
//    plan           — writes draft_items (skips already-existing rows)
//    clear_future   — deletes uncommitted future draft_items (to replan)
//
//  GET → returns students, subjects, content_banks, overlays
// ─────────────────────────────────────────────────────────────────────────────

import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getEnrollment,
  getStudentById,
  getSubjectById,
  getAllStudents,
  getAllSubjects,
  listSessionsByStudentSubject,
  createSessionRow,
} from "../../../lib/db"
import { supabaseSelect, supabaseInsert, supabaseRest } from "../../../lib/supabase"
import { getQuestionCount, DEFAULT_TYPES_PER_HOUR, getNextClassDateFrom } from "../../../lib/logic"
import { buildPacingGuideContext } from "../../../lib/pacing-guide"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

// ─────────────────────────────────────────────
//  Date helpers
// ─────────────────────────────────────────────

function normDate(value = "") {
  const m = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ""
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function getPreviousClassDateFrom(anchorDateStr, enrollmentDays = []) {
  const dayMap = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
  const anchor = new Date(anchorDateStr + "T00:00:00Z")
  if (!enrollmentDays.length) {
    const prev = new Date(anchor)
    prev.setUTCDate(prev.getUTCDate() - 7)
    return prev.toISOString().slice(0, 10)
  }
  const scheduled = enrollmentDays.map(d => dayMap[String(d).toLowerCase()]).filter(d => d !== undefined).sort()
  const anchorDay = anchor.getUTCDay()
  for (let i = 1; i <= 7; i++) {
    const check = (anchorDay - i + 7) % 7
    if (scheduled.includes(check)) {
      const prev = new Date(anchor)
      prev.setUTCDate(prev.getUTCDate() - i)
      return prev.toISOString().slice(0, 10)
    }
  }
  const prev = new Date(anchor)
  prev.setUTCDate(prev.getUTCDate() - 7)
  return prev.toISOString().slice(0, 10)
}

function getSessionDurationMinutes(sessionRow, fallback = 120) {
  const start = sessionRow?.startTime ? new Date(sessionRow.startTime) : null
  const end = sessionRow?.endTime ? new Date(sessionRow.endTime) : null
  if (start && end) {
    const diff = Math.round((end - start) / 60000)
    if (diff > 0) return diff
  }
  return Math.max(30, Number(fallback || 120))
}

// ─────────────────────────────────────────────
//  Session capacity
// ─────────────────────────────────────────────

function sessionCapacity(sessionRow, fallbackMinutes, typesPerHour) {
  return Math.max(1, getQuestionCount(getSessionDurationMinutes(sessionRow, fallbackMinutes), typesPerHour))
}

// ─────────────────────────────────────────────
//  Core: distribute QTs across sessions
//  Returns [{ qt, sessionId, sessionDate, orderIndex, datesInferred }]
// ─────────────────────────────────────────────

function distributeAcrossSessions(qts, sessionRows, fallbackMinutes, typesPerHour, inferredDatesSet = new Set()) {
  const assignments = []
  let si = 0
  let used = 0
  for (const qt of qts) {
    while (si < sessionRows.length) {
      const cap = sessionCapacity(sessionRows[si], fallbackMinutes, typesPerHour)
      if (used < cap) break
      si++
      used = 0
    }
    const session = sessionRows[si]
    if (!session) {
      // Overflow — pile onto last session
      const last = sessionRows[sessionRows.length - 1]
      assignments.push({ qt, sessionId: last?.id || "", sessionDate: normDate(last?.studentSessionDate || last?.tutorSessionDate), orderIndex: used, datesInferred: inferredDatesSet.has(normDate(last?.studentSessionDate || last?.tutorSessionDate)) })
      used++
      continue
    }
    const date = normDate(session.studentSessionDate || session.tutorSessionDate)
    assignments.push({ qt, sessionId: session.id || "", sessionDate: date, orderIndex: used, datesInferred: inferredDatesSet.has(date) })
    used++
  }
  return assignments
}

function distributeBackfillQTs(qts, sessionRows, fallbackMinutes, typesPerHour, inferredDatesSet = new Set()) {
  const assignments = []
  let qi = qts.length - 1

  for (let si = sessionRows.length - 1; si >= 0 && qi >= 0; si--) {
    const session = sessionRows[si]
    const cap = sessionCapacity(session, fallbackMinutes, typesPerHour)
    const bucket = []

    while (bucket.length < cap && qi >= 0) {
      // Build each session bucket in ascending pacing order even though
      // sessions themselves are filled backward from the anchor.
      bucket.unshift(qts[qi])
      qi -= 1
    }

    const date = normDate(session.studentSessionDate || session.tutorSessionDate)
    for (let i = 0; i < bucket.length; i++) {
      assignments.push({
        qt: bucket[i],
        sessionId: session.id || "",
        sessionDate: date,
        orderIndex: i,
        datesInferred: inferredDatesSet.has(date),
      })
    }
  }

  if (qi >= 0 && sessionRows.length) {
    const first = sessionRows[0]
    const date = normDate(first.studentSessionDate || first.tutorSessionDate)
    const existingCount = assignments.filter((item) => item.sessionDate === date).length
    for (; qi >= 0; qi--) {
      assignments.push({
        qt: qts[qi],
        sessionId: first.id || "",
        sessionDate: date,
        orderIndex: existingCount + (qts.length - 1 - qi),
        datesInferred: inferredDatesSet.has(date),
      })
    }
  }

  return assignments.sort((a, b) =>
    a.sessionDate.localeCompare(b.sessionDate) ||
    a.orderIndex - b.orderIndex
  )
}

// ─────────────────────────────────────────────
//  Forward distribution — overflow-aware.
//  Unlike backfill, we never infer extra sessions forward.
//  QTs that don't fit are returned separately for buffer-date handling.
// ─────────────────────────────────────────────

function distributeForwardQTs(qts, sessionRows, fallbackMinutes, typesPerHour) {
  const assignments = []
  const overflow = []
  let si = 0
  let used = 0
  for (const qt of qts) {
    while (si < sessionRows.length) {
      const cap = sessionCapacity(sessionRows[si], fallbackMinutes, typesPerHour)
      if (used < cap) break
      si++
      used = 0
    }
    if (si >= sessionRows.length) {
      overflow.push(qt)
      continue
    }
    const session = sessionRows[si]
    const date = normDate(session.studentSessionDate || session.tutorSessionDate)
    assignments.push({ qt, sessionId: session.id || "", sessionDate: date, orderIndex: used, datesInferred: false })
    used++
  }
  return { assignments, overflow }
}

// ─────────────────────────────────────────────
//  Ensure historical sessions exist
//  (infer synthetic sessions backward from calendarStart if real ones don't cover all QTs)
// ─────────────────────────────────────────────

async function ensureHistoricalSessions({
  studentId, subjectId, anchorDate,
  allSessionRows, requiredQTs,
  fallbackMinutes, enrollmentDays, typesPerHour,
}) {
  const perCap = Math.max(1, getQuestionCount(fallbackMinutes, typesPerHour))

  const pastRows = allSessionRows
    .filter(r => normDate(r.studentSessionDate || r.tutorSessionDate) < anchorDate)
    .sort((a, b) => normDate(a.studentSessionDate || a.tutorSessionDate).localeCompare(normDate(b.studentSessionDate || b.tutorSessionDate)))

  const realCapacity = pastRows.length * perCap
  const overflow = Math.max(0, requiredQTs - realCapacity)
  const extraNeeded = overflow > 0 ? Math.ceil(overflow / perCap) : 0

  const existingDates = new Set(pastRows.map(r => normDate(r.studentSessionDate || r.tutorSessionDate)))
  const calendarStart = pastRows[0] ? normDate(pastRows[0].studentSessionDate || pastRows[0].tutorSessionDate) : anchorDate

  // Compute avg cadence from real sessions
  let avgInterval = 7
  if (pastRows.length >= 2) {
    const intervals = []
    for (let i = 1; i < pastRows.length; i++) {
      const a = new Date(normDate(pastRows[i-1].studentSessionDate || pastRows[i-1].tutorSessionDate) + "T00:00:00Z")
      const b = new Date(normDate(pastRows[i].studentSessionDate || pastRows[i].tutorSessionDate) + "T00:00:00Z")
      const d = Math.round((b - a) / 86400000)
      if (d > 0) intervals.push(d)
    }
    if (intervals.length) avgInterval = Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length)
  }

  const inferredDates = new Set()
  const allRows = [...pastRows]

  // Only infer earlier than the first real session date.
  // Do not fabricate dates inside the real session window before the anchor.
  let cursor = pastRows.length ? calendarStart : anchorDate
  for (let i = 0; i < extraNeeded; i++) {
    let candidate = enrollmentDays.length
      ? getPreviousClassDateFrom(cursor, enrollmentDays)
      : (() => {
          const d = new Date(cursor + "T00:00:00Z")
          d.setUTCDate(d.getUTCDate() - avgInterval)
          return d.toISOString().slice(0, 10)
        })()

    while (existingDates.has(candidate) || inferredDates.has(candidate)) {
      candidate = enrollmentDays.length
        ? getPreviousClassDateFrom(candidate, enrollmentDays)
        : (() => {
            const d = new Date(candidate + "T00:00:00Z")
            d.setUTCDate(d.getUTCDate() - avgInterval)
            return d.toISOString().slice(0, 10)
          })()
    }

    let sessionRow = await createSessionRow({
      studentId,
      subjectId,
      studentSessionDate: candidate,
      tutorSessionDate: candidate,
      sessionSource: "calendar_inferred",
    }).catch(() => null)
    if (sessionRow?.id) {
      inferredDates.add(candidate)
      allRows.push({ id: sessionRow.id, studentSessionDate: candidate, tutorSessionDate: candidate, startTime: null, endTime: null })
    }
    cursor = candidate
  }

  allRows.sort((a, b) => normDate(a.studentSessionDate || a.tutorSessionDate).localeCompare(normDate(b.studentSessionDate || b.tutorSessionDate)))
  return { sessionRows: allRows, inferredDates }
}

function asSloCode(raw = "") {
  const value = String(raw || "").trim()
  return value.includes("::") ? value.split("::").pop() : value
}

function resolveQtSectionOrder(qt, sectionOrderMap, sloSectionOrderMap) {
  if (qt?.school_section_id && sectionOrderMap.has(qt.school_section_id)) {
    return sectionOrderMap.get(qt.school_section_id)
  }

  const candidateCodes = [
    asSloCode(qt?.primary_slo_id || ""),
    ...((Array.isArray(qt?.reinforcement_slos) ? qt.reinforcement_slos : []).map((entry) => asSloCode(entry?.slo_id || ""))),
  ].filter(Boolean)

  let best = Number.MAX_SAFE_INTEGER
  for (const code of candidateCodes) {
    const order = sloSectionOrderMap.get(code)
    if (order != null) best = Math.min(best, order)
  }
  return best
}

// ─────────────────────────────────────────────
//  Fetch QTs from content bank, sorted by the active pacing guide.
//  Precedence is resolved in lib/pacing-guide:
//    enrollment custom > school/textbook overlay native > subject LO default
// ─────────────────────────────────────────────

async function fetchSortedQTs(contentBankId, subjectId, studentId, sectionOrderMap, sloSectionOrderMap) {
  const qts = await supabaseSelect("question_types", {
    select: "id,title,unit_label,source_type,school_section_id,primary_slo_id,reinforcement_slos",
    filters: { content_bank_id: contentBankId, status: "active" },
  })

  if (!qts.length) return qts

  return qts
    .map((qt) => ({
      ...qt,
      __sectionOrder: resolveQtSectionOrder(qt, sectionOrderMap, sloSectionOrderMap),
    }))
    .sort((a, b) => a.__sectionOrder - b.__sectionOrder)
}

// ─────────────────────────────────────────────
//  Prerequisite check: split QTs into free and locked.
//  A QT is locked if any of its reinforcement SLOs has a section order
//  that comes AFTER the QT's own section order (i.e. not yet taught).
// ─────────────────────────────────────────────

function splitByPrerequisites(qts, sloSectionOrderMap) {
  const free = []
  const locked = []
  for (const qt of qts) {
    const reinforcement = Array.isArray(qt.reinforcement_slos) ? qt.reinforcement_slos : []
    const missingPrereqs = []
    for (const entry of reinforcement) {
      const rawId = String(entry?.slo_id || "")
      const code = rawId.includes("::") ? rawId.split("::").pop() : rawId
      if (!code) continue
      const prereqOrder = sloSectionOrderMap.get(code)
      if (prereqOrder == null) continue // SLO not in pacing guide — ignore
      if (prereqOrder > qt.__sectionOrder) {
        missingPrereqs.push({ code, prereqSectionOrder: prereqOrder, qtSectionOrder: qt.__sectionOrder })
      }
    }
    if (missingPrereqs.length) {
      locked.push({ qtId: qt.id, qtTitle: qt.title, missingPrereqs })
    } else {
      free.push(qt)
    }
  }
  return { free, locked }
}

// ─────────────────────────────────────────────
//  Split QTs at frontier (anchorDate)
//  Uses section order: sections taught before anchor → backfill, rest → forward
//  frontierSectionIndex: first section index that hasn't been taught yet
// ─────────────────────────────────────────────

function splitAtFrontier(sortedQTs, frontierSectionIndex) {
  if (frontierSectionIndex == null || frontierSectionIndex <= 0) {
    return { backfill: [], forward: sortedQTs }
  }
  const backfill = sortedQTs.filter(qt => qt.__sectionOrder < frontierSectionIndex)
  const forward  = sortedQTs.filter(qt => qt.__sectionOrder >= frontierSectionIndex)
  return { backfill, forward }
}

// ─────────────────────────────────────────────
//  Get existing draft QT ids (to skip duplicates)
// ─────────────────────────────────────────────

async function getExistingDraftQTIds(studentId, subjectId) {
  const rows = await supabaseSelect("draft_items", {
    select: "question_type_id",
    filters: { student_id: studentId, subject_id: subjectId },
  })
  return new Set(rows.map(r => r.question_type_id))
}

// ─────────────────────────────────────────────
//  Write draft_items in batches
// ─────────────────────────────────────────────

async function writeDraftItems(studentId, subjectId, assignments) {
  const BATCH = 50
  let created = 0
  let failed = 0
  let failReason = null

  const rows = assignments.map(({ qt, sessionId, sessionDate, orderIndex, datesInferred, overflow, phase }) => ({
    student_id:            studentId,
    subject_id:            subjectId,
    question_type_id:      qt.id,
    session_id:            sessionId || null,
    assigned_session_date: sessionDate || null,
    state:                 "backlog",
    plan_source:           "plan_sessions",
    order_index:           orderIndex,
    committed:             false,
    dates_inferred:        !!(datesInferred || overflow),
    inference_reason:      overflow
      ? "Overflow: no available sessions before end of calendar. Arrange extra session with parent."
      : datesInferred ? "Session date inferred from enrollment cadence during pacing backfill." : null,
    primary_slo_id:        qt.primary_slo_id || null,
    aligned_slo_ids:       [],
    reinforcement_slos:    Array.isArray(qt.reinforcement_slos) ? qt.reinforcement_slos : [],
    school_unit_name:      qt.unit_label || null,
    metadata:              { ...(overflow ? { overflow: true } : {}), phase: phase || null },
  }))

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    try {
      await supabaseRest(
        "draft_items?on_conflict=student_id,question_type_id,assigned_session_date",
        {
          method: "POST",
          body: batch,
          headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        }
      )
      created += batch.length
    } catch (err) {
      failed += batch.length
      failReason = failReason || err.message
    }
  }

  return { created, failed, failReason }
}

// ─────────────────────────────────────────────
//  Session breakdown builder
//  entries: pacing.entries array (ordered), used to resolve section codes by index
// ─────────────────────────────────────────────

function buildSessionBreakdown(assignments, entries = []) {
  const by = {}
  for (const a of assignments) {
    if (!by[a.sessionDate]) by[a.sessionDate] = { count: 0, inferred: !!(a.datesInferred), overflow: !!(a.overflow), _sectionSet: new Set() }
    by[a.sessionDate].count++
    const code = entries[a.qt.__sectionOrder]?.code
    if (code) by[a.sessionDate]._sectionSet.add(code)
  }
  // Convert Set → sorted array, drop the internal Set
  for (const info of Object.values(by)) {
    info.sections = [...info._sectionSet].sort()
    delete info._sectionSet
  }
  return by
}

// ─────────────────────────────────────────────
//  Core plan function
// ─────────────────────────────────────────────

async function planSessions({
  studentId,
  subjectId,
  anchorDate,          // the "taught up to here" date — divides backfill/forward
  frontierSectionIndex, // section order index of first forward section (null = use anchorDate's session QTs)
  typesPerHour = DEFAULT_TYPES_PER_HOUR,
  dryRun = false,
}) {
  const [student, subject, enrollment] = await Promise.all([
    getStudentById(studentId),
    getSubjectById(subjectId),
    getEnrollment(studentId, subjectId),
  ])

  if (!subject?.contentBankId) throw new Error("Subject has no content bank linked. Run setup_subject first.")

  const anchor = anchorDate ? normDate(anchorDate) : today()
  const fallbackMinutes = enrollment?.duration || 120
  const enrollmentDays = enrollment?.days || []

  const pacingContext = await buildPacingGuideContext({ subjectId, studentId })
  const { pacing, sectionOrder, sloSectionOrder } = pacingContext
  if (pacing?.locked) {
    throw new Error("Pacing guide is locked for this subject. Save the subject LO guide or attach a school overlay first.")
  }

  // Fetch QTs sorted by the current pacing precedence:
  // enrollment custom > school/textbook overlay native > subject LO default
  const sortedQTs = await fetchSortedQTs(
    subject.contentBankId,
    subjectId,
    studentId,
    sectionOrder,
    sloSectionOrder
  )
  if (!sortedQTs.length) throw new Error("No active question types found in content bank.")

  // Prereq locking disabled — SLO/reinforcement mappings are QT-level metadata and
  // should not gate scheduling (see notes.md 2026-04-13)
  const readyQTs = sortedQTs
  const lockedQTs = []

  // Split ready QTs at frontier
  const { backfill: backfillQTs, forward: forwardQTs } = splitAtFrontier(readyQTs, frontierSectionIndex)

  // Get all sessions
  const allSessionRows = (await listSessionsByStudentSubject(studentId, subjectId))
    .filter(r => normDate(r.studentSessionDate))
    .sort((a, b) => normDate(a.studentSessionDate).localeCompare(normDate(b.studentSessionDate)))

  const upcomingSessions = allSessionRows.filter(r => normDate(r.studentSessionDate) >= anchor)

  // Existing drafts — skip QTs already planned
  const existingDraftQTIds = await getExistingDraftQTIds(studentId, subjectId)
  const newBackfillQTs = backfillQTs.filter(qt => !existingDraftQTIds.has(qt.id))
  const newForwardQTs  = forwardQTs.filter(qt => !existingDraftQTIds.has(qt.id))

  // Ensure historical sessions for backfill (infers sessions backward as needed)
  let backfillAssignments = []
  let inferredDates = new Set()

  if (newBackfillQTs.length) {
    const historical = await ensureHistoricalSessions({
      studentId, subjectId,
      anchorDate: anchor,
      allSessionRows,
      requiredQTs: newBackfillQTs.length,
      fallbackMinutes,
      enrollmentDays,
      typesPerHour,
    })
    inferredDates = historical.inferredDates
    backfillAssignments = distributeBackfillQTs(newBackfillQTs, historical.sessionRows, fallbackMinutes, typesPerHour, inferredDates)
      .map((item) => ({ ...item, phase: "backfill" }))
  }

  // Forward distribution — overflow goes to a buffer date, not piled on the last session
  const { assignments: forwardAssignments, overflow: forwardOverflow } = distributeForwardQTs(
    newForwardQTs, upcomingSessions, fallbackMinutes, typesPerHour
  )
  const taggedForwardAssignments = forwardAssignments.map((item) => ({ ...item, phase: "forward" }))

  // Buffer date for overflow: one day after the last known session
  let bufferDate = null
  let bufferAssignments = []
  if (forwardOverflow.length) {
    const lastSessionDate = upcomingSessions.length
      ? normDate(upcomingSessions[upcomingSessions.length - 1].studentSessionDate)
      : anchor
    const d = new Date(lastSessionDate + "T00:00:00Z")
    d.setUTCDate(d.getUTCDate() + 1)
    bufferDate = d.toISOString().slice(0, 10)
    bufferAssignments = forwardOverflow.map((qt, i) => ({
      qt, sessionId: "", sessionDate: bufferDate, orderIndex: i, datesInferred: true, overflow: true, phase: "forward_overflow",
    }))
  }

  const allAssignments = [...backfillAssignments, ...taggedForwardAssignments, ...bufferAssignments]

  const preview = {
    anchorDate: anchor,
    totalQTs:           sortedQTs.length,
    lockedQTs:          lockedQTs.length,
    lockedDetails:      lockedQTs,
    skippedExisting:    readyQTs.length - newBackfillQTs.length - newForwardQTs.length,
    backfillQTs:        newBackfillQTs.length,
    forwardQTs:         newForwardQTs.length,
    overflowQTs:        forwardOverflow.length,
    bufferDate,
    inferredSessions:   inferredDates.size,
    totalAssignments:   allAssignments.length,
    dateRange: allAssignments.length ? {
      from: allAssignments[0].sessionDate,
      to:   allAssignments[allAssignments.length - 1].sessionDate,
    } : null,
    sessionBreakdown: buildSessionBreakdown(allAssignments, pacing.entries),
  }

  if (dryRun) return { dryRun: true, ...preview }

  const writeStats = await writeDraftItems(studentId, subjectId, allAssignments)

  return { ...preview, draftItems: writeStats }
}

// ─────────────────────────────────────────────
//  Redistribute: re-sort ALL uncommitted draft_items by current pacing guide.
//  Only PATCHes assigned_session_date / session_id / order_index on existing rows.
//  Scores in student_question_types are never touched.
//  Committed draft_items are skipped (their dates are actual session history).
//  New QTs (no draft_item yet) are inserted normally.
// ─────────────────────────────────────────────

async function redistributeSessions({
  studentId, subjectId, anchorDate, frontierSectionIndex,
  typesPerHour = DEFAULT_TYPES_PER_HOUR, dryRun = false,
  includeCommitted = false,
}) {
  const [subject, enrollment] = await Promise.all([
    getSubjectById(subjectId),
    getEnrollment(studentId, subjectId),
  ])
  if (!subject?.contentBankId) throw new Error("Subject has no content bank linked.")

  const anchor = anchorDate ? normDate(anchorDate) : today()
  const fallbackMinutes = enrollment?.duration || 120
  const enrollmentDays = enrollment?.days || []

  const pacingContext = await buildPacingGuideContext({ subjectId, studentId })
  const { pacing, sectionOrder, sloSectionOrder } = pacingContext
  if (pacing?.locked) throw new Error("Pacing guide is locked for this subject.")

  const sortedQTs = await fetchSortedQTs(subject.contentBankId, subjectId, studentId, sectionOrder, sloSectionOrder)
  if (!sortedQTs.length) throw new Error("No active question types found in content bank.")

  const { backfill: backfillQTs, forward: forwardQTs } = splitAtFrontier(sortedQTs, frontierSectionIndex)

  const allSessionRows = (await listSessionsByStudentSubject(studentId, subjectId))
    .filter(r => normDate(r.studentSessionDate))
    .sort((a, b) => normDate(a.studentSessionDate).localeCompare(normDate(b.studentSessionDate)))
  const upcomingSessions = allSessionRows.filter(r => normDate(r.studentSessionDate) >= anchor)

  // Fetch all existing draft_items — track committed vs uncommitted
  const existingDrafts = await supabaseSelect("draft_items", {
    select: "id,question_type_id,committed",
    filters: { student_id: studentId, subject_id: subjectId },
  })
  // Map: questionTypeId → { id, committed }
  const existingDraftMap = new Map(existingDrafts.map(r => [r.question_type_id, { id: r.id, committed: !!r.committed }]))
  const committedQTIds = new Set(existingDrafts.filter(r => r.committed).map(r => r.question_type_id))

  // When includeCommitted is false (default), skip committed items — their dates are real history.
  // When includeCommitted is true (admin override), redistribute committed items too and also
  // patch student_question_types date fields. Scores/mastery are never touched either way.
  const redistributeBackfill = backfillQTs.filter(qt => includeCommitted || !committedQTIds.has(qt.id))
  const redistributeForward  = forwardQTs.filter(qt => includeCommitted || !committedQTIds.has(qt.id))

  // Ensure historical sessions for backfill
  let backfillAssignments = []
  let inferredDates = new Set()
  if (redistributeBackfill.length) {
    const historical = await ensureHistoricalSessions({
      studentId, subjectId, anchorDate: anchor,
      allSessionRows, requiredQTs: redistributeBackfill.length,
      fallbackMinutes, enrollmentDays, typesPerHour,
    })
    inferredDates = historical.inferredDates
    backfillAssignments = distributeBackfillQTs(redistributeBackfill, historical.sessionRows, fallbackMinutes, typesPerHour, inferredDates)
      .map(item => ({ ...item, phase: "backfill" }))
  }

  const { assignments: forwardAssignments, overflow: forwardOverflow } = distributeForwardQTs(
    redistributeForward, upcomingSessions, fallbackMinutes, typesPerHour
  )
  const taggedForwardAssignments = forwardAssignments.map(item => ({ ...item, phase: "forward" }))

  let bufferDate = null
  let bufferAssignments = []
  if (forwardOverflow.length) {
    const lastSessionDate = upcomingSessions.length
      ? normDate(upcomingSessions[upcomingSessions.length - 1].studentSessionDate)
      : anchor
    const d = new Date(lastSessionDate + "T00:00:00Z")
    d.setUTCDate(d.getUTCDate() + 1)
    bufferDate = d.toISOString().slice(0, 10)
    bufferAssignments = forwardOverflow.map((qt, i) => ({
      qt, sessionId: "", sessionDate: bufferDate, orderIndex: i, datesInferred: true, overflow: true, phase: "forward_overflow",
    }))
  }

  const allAssignments = [...backfillAssignments, ...taggedForwardAssignments, ...bufferAssignments]
  const toUpdate = allAssignments.filter(a => existingDraftMap.has(a.qt.id))
  const toInsert = allAssignments.filter(a => !existingDraftMap.has(a.qt.id))
  const committedToRedate = includeCommitted
    ? toUpdate.filter(a => committedQTIds.has(a.qt.id))
    : []

  const sessionBreakdown = buildSessionBreakdown(allAssignments, pacing.entries)

  const preview = {
    mode: "redistribute",
    includeCommitted,
    anchorDate: anchor,
    totalQTs: sortedQTs.length,
    totalAssignments: allAssignments.length,
    committedSkipped: includeCommitted ? 0 : committedQTIds.size,
    committedRedated: committedToRedate.length,
    backfillQTs: redistributeBackfill.length,
    forwardQTs: redistributeForward.length,
    overflowQTs: forwardOverflow.length,
    updatedQTs: toUpdate.length,
    newQTs: toInsert.length,
    bufferDate,
    inferredSessions: inferredDates.size,
    dateRange: allAssignments.length ? {
      from: allAssignments[0].sessionDate,
      to:   allAssignments[allAssignments.length - 1].sessionDate,
    } : null,
    sessionBreakdown,
  }

  if (dryRun) return { dryRun: true, ...preview }

  // PATCH draft_items — only date/session fields, never score fields
  let updateCount = 0
  const PATCH_BATCH = 10
  for (let i = 0; i < toUpdate.length; i += PATCH_BATCH) {
    await Promise.all(toUpdate.slice(i, i + PATCH_BATCH).map(async ({ qt, sessionId, sessionDate, orderIndex, datesInferred, overflow, phase }) => {
      const existing = existingDraftMap.get(qt.id)
      if (!existing) return
      await supabaseRest(`draft_items?id=eq.${existing.id}`, {
        method: "PATCH",
        body: {
          session_id:            sessionId || null,
          assigned_session_date: sessionDate || null,
          order_index:           orderIndex,
          dates_inferred:        !!(datesInferred || overflow),
          inference_reason:      overflow
            ? "Overflow: no available sessions before end of calendar. Arrange extra session with parent."
            : datesInferred ? "Session date inferred from enrollment cadence during pacing redistribution." : null,
          metadata: { phase: phase || null, ...(overflow ? { overflow: true } : {}) },
        },
        headers: { Prefer: "return=minimal" },
      }).catch(() => null)
      updateCount++
    }))
  }

  // If includeCommitted: patch date fields on committed items, and upsert score rows
  // for ALL redistributed QTs (committed or not) that are missing a student_question_types row.
  // This is what "save to scoresDB" means — any QT assigned a date in the plan can be practiced.
  // weakness_score, mastery_events, correct_question_keys, daily_seen_dates,
  // daily_wrong_dates, hw_source, and metadata are never touched on existing rows.
  let sqtUpdated = 0
  let sqtCreated = 0
  if (includeCommitted) {
    // PATCH date fields for committed items only (their dates are real session history)
    if (committedToRedate.length) {
      for (let i = 0; i < committedToRedate.length; i += PATCH_BATCH) {
        await Promise.all(committedToRedate.slice(i, i + PATCH_BATCH).map(async ({ qt, sessionId, sessionDate }) => {
          await supabaseRest(
            `student_question_types?student_id=eq.${studentId}&question_type_id=eq.${qt.id}`,
            {
              method: "PATCH",
              body: {
                date_introduced:     sessionDate || null,
                assigned_session_id: sessionId || null,
              },
              headers: { Prefer: "return=minimal" },
            }
          ).catch(() => null)
          sqtUpdated++
        }))
      }
    }

    // INSERT score rows for redistributed QTs that don't have one yet.
    // Pre-fetch existing QT IDs so we only POST truly missing rows (avoids on_conflict constraint issues).
    const existingSqtRows = await supabaseSelect("student_question_types", {
      select: "question_type_id",
      filters: { student_id: studentId, subject_id: subjectId },
    })
    const existingSqtQtIds = new Set((existingSqtRows || []).map(r => r.question_type_id))
    const sqtInsertRows = toUpdate
      .filter(({ qt }) => !existingSqtQtIds.has(qt.id))
      .map(({ qt, sessionId, sessionDate }) => ({
        student_id:            studentId,
        subject_id:            subjectId,
        question_type_id:      qt.id,
        date_introduced:       sessionDate || null,
        assigned_session_id:   sessionId || null,
        weakness_score:        0,
        hw_source:             "session",
        unit_label:            qt.unit_label || null,
        primary_slo_id:        qt.primary_slo_id || null,
        reinforcement_slos:    Array.isArray(qt.reinforcement_slos) ? qt.reinforcement_slos : [],
        aligned_slo_ids:       [],
        mastery_events:        [],
        correct_question_keys: [],
        daily_seen_dates:      [],
        daily_wrong_dates:     [],
        metadata:              {},
      }))
    for (let i = 0; i < sqtInsertRows.length; i += PATCH_BATCH) {
      await supabaseRest("student_question_types", {
        method: "POST",
        body: sqtInsertRows.slice(i, i + PATCH_BATCH),
        headers: { Prefer: "return=minimal" },
      }).catch(() => null)
    }
    sqtCreated = sqtInsertRows.length
  }

  // INSERT genuinely new QTs
  let insertStats = { created: 0, failed: 0 }
  if (toInsert.length) {
    insertStats = await writeDraftItems(studentId, subjectId, toInsert)
  }

  return { ...preview, updated: updateCount, sqtUpdated, sqtCreated, inserted: insertStats.created }
}

// ─────────────────────────────────────────────
//  Handler
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store")
    const [students, subjects, contentBanks, overlays] = await Promise.all([
      getAllStudents(),
      getAllSubjects(),
      supabaseSelect("content_banks", { select: "id,key,label,subject_name", orderBy: "label" }),
      supabaseSelect("school_overlays", { select: "id,overlay_key,source_label,content_bank_id", orderBy: "overlay_key" }),
    ])
    return res.status(200).json({ students, subjects, contentBanks, overlays })
  }

  if (req.method !== "POST") return res.status(405).end()

  const {
    action = "plan",
    studentId,
    subjectId,
    anchorDate = null,
    frontierSectionIndex = null,
    typesPerHour = DEFAULT_TYPES_PER_HOUR,
    includeCommitted = false,
  } = req.body

  if (!studentId) return res.status(400).json({ error: "studentId is required" })
  if (!subjectId) return res.status(400).json({ error: "subjectId is required" })

  // ── clear_future: delete uncommitted future drafts so you can replan ────────
  if (action === "clear_future") {
    const cutoff = anchorDate ? normDate(anchorDate) : today()
    const existing = await supabaseSelect("draft_items", {
      select: "id,assigned_session_date,committed",
      filters: { student_id: studentId, subject_id: subjectId },
    })
    const toDelete = existing.filter(r => !r.committed && normDate(r.assigned_session_date) >= cutoff)
    if (toDelete.length) {
      const ids = toDelete.map(r => r.id)
      await supabaseRest(`draft_items?id=in.(${ids.join(",")})`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      })
    }
    return res.status(200).json({ ok: true, deleted: toDelete.length, cutoff })
  }

  if (action === "clear_inferred_historical") {
    const cutoff = anchorDate ? normDate(anchorDate) : today()
    const [existingDrafts, existingSessions] = await Promise.all([
      supabaseSelect("draft_items", {
        select: "id,assigned_session_date,committed,dates_inferred,plan_source,metadata",
        filters: { student_id: studentId, subject_id: subjectId },
      }),
      supabaseSelect("sessions", {
        select: "id,student_session_date,source",
        filters: { student_id: studentId, subject_id: subjectId },
      }),
    ])

    const draftsToDelete = existingDrafts.filter(
      (r) => {
        const date = normDate(r.assigned_session_date)
        if (!date || date >= cutoff || r.committed) return false
        if (String(r.plan_source || "") !== "plan_sessions") return false
        const phase = String(r.metadata?.phase || "")
        return !!r.dates_inferred || phase === "backfill" || !phase
      }
    )
    const sessionsToDelete = existingSessions.filter(
      (r) => String(r.source || "") === "calendar_inferred" && normDate(r.student_session_date) < cutoff
    )

    if (draftsToDelete.length) {
      const ids = draftsToDelete.map((r) => r.id)
      await supabaseRest(`draft_items?id=in.(${ids.join(",")})`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      })
    }
    if (sessionsToDelete.length) {
      const ids = sessionsToDelete.map((r) => r.id)
      await supabaseRest(`sessions?id=in.(${ids.join(",")})`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      })
    }
    return res.status(200).json({
      ok: true,
      cutoff,
      deletedDrafts: draftsToDelete.length,
      deletedSessions: sessionsToDelete.length,
    })
  }

  if (action === "reset_sessions") {
    const existingSessions = await supabaseSelect("sessions", {
      select: "id",
      filters: { student_id: studentId, subject_id: subjectId },
    })
    const sessionIds = existingSessions.map((row) => row.id).filter(Boolean)

    if (sessionIds.length) {
      await supabaseRest(`draft_items?student_id=eq.${studentId}&subject_id=eq.${subjectId}`, {
        method: "PATCH",
        body: { session_id: null },
        headers: { Prefer: "return=minimal" },
      }).catch(() => null)

      await supabaseRest(`student_question_types?student_id=eq.${studentId}&subject_id=eq.${subjectId}`, {
        method: "PATCH",
        body: { assigned_session_id: null },
        headers: { Prefer: "return=minimal" },
      }).catch(() => null)

      await supabaseRest(`sessions?id=in.(${sessionIds.join(",")})`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      })
    }

    return res.status(200).json({ ok: true, deletedSessions: sessionIds.length })
  }

  // ── preview / plan ──────────────────────────────────────────────────────────
  if (action === "preview" || action === "plan") {
    try {
      const result = await planSessions({
        studentId,
        subjectId,
        anchorDate,
        frontierSectionIndex: frontierSectionIndex != null ? Number(frontierSectionIndex) : null,
        typesPerHour: Number(typesPerHour) || DEFAULT_TYPES_PER_HOUR,
        dryRun: action === "preview",
      })
      return res.status(200).json({ ok: true, ...result })
    } catch (err) {
      console.error("[plan-sessions] failed:", err)
      return res.status(500).json({ error: err.message })
    }
  }

  // ── redistribute / redistribute_preview ────────────────────────────────────
  if (action === "redistribute" || action === "redistribute_preview") {
    try {
      const result = await redistributeSessions({
        studentId,
        subjectId,
        anchorDate,
        frontierSectionIndex: frontierSectionIndex != null ? Number(frontierSectionIndex) : null,
        typesPerHour: Number(typesPerHour) || DEFAULT_TYPES_PER_HOUR,
        dryRun: action === "redistribute_preview",
        includeCommitted: !!includeCommitted,
      })
      return res.status(200).json({ ok: true, ...result })
    } catch (err) {
      console.error("[plan-sessions/redistribute] failed:", err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}` })
}
