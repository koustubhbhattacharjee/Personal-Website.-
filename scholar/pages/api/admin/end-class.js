// ─────────────────────────────────────────────────────────────────────────────
//  pages/api/admin/end-class.js
//
//  Called when admin ends a live class session.
//
//  Flow:
//    1. Admin picks which draft_items on the live stack were actually taught
//       (taughtIds). These are marked committed=true.
//
//    2. Untaught items from this session's stack (deferredRows) are pushed
//       forward to the next session date.
//
//    3. If any future draft_items were pulled into this session (pulled from
//       a later date), committing them frees a slot in their original session.
//       Remaining future items bulk-shift forward by one session slot to fill
//       that gap — preserving section order.
//
//    4. Score rows for committed items get date updated to sessionDate and
//       status set to "Approved for Exit" so they appear in the exit ticket
//       and drive practice mastery.
//
//  Pre-class FIFO signal:
//    The live-class-plan endpoint already surfaces failed pre-class questions
//    at the top of the live stack (current). This endpoint only handles commit
//    — it does not re-sort the stack.
// ─────────────────────────────────────────────────────────────────────────────

import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getAllScoresForStudent,
  getEnrollment,
  getScoreRowsForDate,
  getSessionByStudentSubjectDate,
  listDraftRowsByStudentSubject,
  listDraftRowsForDate,
  listDraftRowsForSession,
  listSessionsByStudentSubject,
  getStudentById,
  getSubjectById,
  pushQuestionToDate,
  setScoreRowStatus,
  updateDraftRow,
  createScoreRow,
} from "../../../lib/db"
import { getNextClassDateFrom } from "../../../lib/logic"
import { getUpcomingClassesForStudent } from "../../../lib/tutor-calendar"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function normDate(value = "") {
  const m = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ""
}

function getSessionDurationMinutes(sessionRow, fallback = 120) {
  const start = sessionRow?.startTime ? new Date(sessionRow.startTime) : null
  const end   = sessionRow?.endTime   ? new Date(sessionRow.endTime)   : null
  if (start && end) {
    const diff = Math.round((end - start) / 60000)
    if (diff > 0) return diff
  }
  return Math.max(30, Number(fallback || 120))
}

// ─────────────────────────────────────────────
//  Bulk shift: move a list of draft rows forward by one session slot each.
//  Used when pulled-in future rows create a gap — remaining future rows
//  each advance one session to preserve the planned spread.
// ─────────────────────────────────────────────

async function shiftFutureRowsForward(rows = [], allSessionRows = [], slotCount = 1) {
  if (!slotCount || !rows.length || !allSessionRows.length) return 0

  const sortedSessions = [...allSessionRows]
    .filter(r => normDate(r.studentSessionDate))
    .sort((a, b) => normDate(a.studentSessionDate).localeCompare(normDate(b.studentSessionDate)))

  const sessionIndexByDate = new Map(sortedSessions.map((r, i) => [normDate(r.studentSessionDate), i]))

  // Sort rows by session date desc so we move last ones first (prevents collisions)
  const sorted = [...rows]
    .map(row => ({
      ...row,
      __si: sessionIndexByDate.get(normDate(row.assignedSessionDate)) ?? -1,
    }))
    .filter(row => row.__si >= 0)
    .sort((a, b) => b.__si - a.__si || Number(b.orderIndex ?? 0) - Number(a.orderIndex ?? 0))

  let moved = 0
  for (const row of sorted) {
    const targetSession = sortedSessions[row.__si + slotCount]
    if (!targetSession) continue
    const targetDate = normDate(targetSession.studentSessionDate)
    if (targetDate === normDate(row.assignedSessionDate)) continue
    await updateDraftRow(row.id, {
      assignedSessionDate: targetDate,
      sessionId: targetSession.id || "",
    })
    moved++
  }
  return moved
}

// ─────────────────────────────────────────────
//  Resolve next session date (calendar first, enrollment days fallback)
// ─────────────────────────────────────────────

async function resolveNextSessionDate(sessionDate, student, subject, allSessionRows, enrollmentDays) {
  // Try real upcoming sessions first
  const next = allSessionRows
    .filter(r => normDate(r.studentSessionDate) > sessionDate)
    .sort((a, b) => normDate(a.studentSessionDate).localeCompare(normDate(b.studentSessionDate)))[0]
  if (next?.studentSessionDate) return { date: normDate(next.studentSessionDate), sessionId: next.id || "" }

  // Try calendar
  try {
    const upcoming = await getUpcomingClassesForStudent(student?.name || "", subject?.name || "", 4)
    const calDate = upcoming
      .map(item => normDate(item.startTime))
      .filter(d => d > sessionDate)
      .sort()[0]
    if (calDate) return { date: calDate, sessionId: "" }
  } catch {}

  // Enrollment days fallback
  const fallback = getNextClassDateFrom(sessionDate, enrollmentDays || [])
  return { date: fallback, sessionId: "" }
}

// ─────────────────────────────────────────────
//  Handler
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const {
    studentId,
    subjectId,
    sessionDate,
    taughtIds = [],       // draft_item ids that were taught
    idType = "draftId",   // "draftId" | "questionTypeId"
  } = req.body || {}

  if (!studentId || !subjectId || !sessionDate) {
    return res.status(400).json({ error: "Missing studentId, subjectId, or sessionDate." })
  }

  try {
    const [allScoreRows, enrollment, student, subject, sessionRow] = await Promise.all([
      getAllScoresForStudent(studentId, subjectId),
      getEnrollment(studentId, subjectId),
      getStudentById(studentId),
      getSubjectById(subjectId),
      getSessionByStudentSubjectDate(studentId, subjectId, sessionDate).catch(() => null),
    ])

    const scoreByQTId = new Map((allScoreRows || []).map(r => [String(r.questionId || ""), r]))
    const enrollmentDays = enrollment?.days || []

    // Load this session's draft stack
    let planRows = []
    if (sessionRow?.id) {
      planRows = await listDraftRowsForSession(sessionRow.id, { committed: false, limit: 200 }).catch(() => [])
    }
    if (!planRows.length) {
      planRows = await listDraftRowsForDate(studentId, subjectId, sessionDate, { committed: false, limit: 200 }).catch(() => [])
    }
    const activePlanRows = planRows.filter(r => r.state !== "archived" && r.state !== "homework_pool")

    if (!activePlanRows.length) {
      return res.status(200).json({
        ok: true,
        sessionDate,
        message: "No active draft rows found for this session.",
        exitTopics: [],
        deferredTopics: [],
        pulledTopics: [],
        shiftedForward: 0,
      })
    }

    // Map taughtIds → draft rows
    const keyForRow = (row) => idType === "questionTypeId"
      ? String(row.questionPageId || row.questionId || "")
      : String(row.id || "")

    const candidateByKey = new Map(activePlanRows.map(r => [keyForRow(r), r]))
    const selectedIds = (Array.isArray(taughtIds) ? taughtIds : []).map(String)
    const selectedSet = new Set(selectedIds)

    const taughtRows   = selectedIds.map(id => candidateByKey.get(id)).filter(Boolean)
    const deferredRows = activePlanRows.filter(r => !selectedSet.has(keyForRow(r)))

    if (!taughtRows.length) {
      return res.status(400).json({ error: "Pick at least one taught topic." })
    }

    // Categorise taught rows: on this date vs pulled from elsewhere
    const currentRows = taughtRows.filter(r => normDate(r.assignedSessionDate) === normDate(sessionDate))
    const pulledFromFuture = taughtRows.filter(r => normDate(r.assignedSessionDate) > normDate(sessionDate))
    const pulledFromPast   = taughtRows.filter(r => normDate(r.assignedSessionDate) < normDate(sessionDate))

    // ── 1. Commit all taught rows ─────────────────────────────────────────────
    await Promise.all(taughtRows.map(async (row) => {
      await updateDraftRow(row.id, {
        state: "committed",
        committed: true,
        committedAt: new Date().toISOString(),
        sessionId: sessionRow?.id || row.sessionId || "",
      })
      // Ensure score row exists and is anchored to sessionDate
      const qtId = row.questionPageId || row.questionId || ""
      let scoreRow = scoreByQTId.get(String(qtId))
      if (!scoreRow && qtId) {
        // Create score row if it doesn't exist (shouldn't happen post-plan-sessions, but safe)
        scoreRow = await createScoreRow(studentId, subjectId, { id: qtId, title: row.title }, sessionDate, "session").catch(() => null)
      }
      if (scoreRow?.id) {
        if (scoreRow.dateIntroduced && normDate(scoreRow.dateIntroduced) > normDate(sessionDate)) {
          await pushQuestionToDate(scoreRow.id, sessionDate)
        }
        await setScoreRowStatus(scoreRow.id, "Approved for Exit")
      }
    }))

    // ── 2. Defer untaught rows to next session ────────────────────────────────
    const allSessionRows = await listSessionsByStudentSubject(studentId, subjectId).catch(() => [])
    const { date: nextDate, sessionId: nextSessionId } = await resolveNextSessionDate(
      sessionDate, student, subject, allSessionRows, enrollmentDays
    )

    if (deferredRows.length && nextDate) {
      await Promise.all(deferredRows.map(row =>
        updateDraftRow(row.id, {
          assignedSessionDate: nextDate,
          sessionId: nextSessionId || "",
          state: "backlog",
        })
      ))
    }

    // ── 3. Bulk shift future rows forward if something was pulled from future ─
    let shiftedForward = 0
    if (pulledFromFuture.length) {
      // The pulled rows' original dates now have a gap — shift everything after
      // those dates forward by 1 session slot per pulled row
      const allDraftRows = await listDraftRowsByStudentSubject(studentId, subjectId, { limit: 1000 }).catch(() => [])
      const minPulledDate = pulledFromFuture
        .map(r => normDate(r.assignedSessionDate))
        .filter(Boolean)
        .sort()[0]

      const rowsToShift = allDraftRows.filter(r =>
        !r.committed &&
        r.state !== "archived" &&
        r.state !== "homework_pool" &&
        normDate(r.assignedSessionDate) >= minPulledDate &&
        !selectedSet.has(keyForRow(r)) // don't shift the ones we just committed
      )

      shiftedForward = await shiftFutureRowsForward(rowsToShift, allSessionRows, pulledFromFuture.length)
    }

    return res.status(200).json({
      ok: true,
      sessionDate,
      exitTopics: taughtRows.map(r => ({
        id: r.id,
        questionTypeId: r.questionPageId || r.questionId || "",
        title: r.title || r.questionName || "",
        sourceDate: normDate(r.assignedSessionDate),
        pulledFromFuture: pulledFromFuture.some(p => p.id === r.id),
        pulledFromPast:   pulledFromPast.some(p => p.id === r.id),
      })),
      deferredTopics: deferredRows.map(r => ({
        id: r.id,
        questionTypeId: r.questionPageId || r.questionId || "",
        title: r.title || r.questionName || "",
        pushedTo: nextDate,
      })),
      pulledTopics: pulledFromFuture.map(r => ({
        id: r.id,
        title: r.title || r.questionName || "",
        originalDate: normDate(r.assignedSessionDate),
      })),
      shiftedForward,
      nextSessionDate: nextDate || null,
    })
  } catch (err) {
    console.error("[end-class] error:", err)
    return res.status(500).json({ error: err.message || "Failed to end class." })
  }
}
