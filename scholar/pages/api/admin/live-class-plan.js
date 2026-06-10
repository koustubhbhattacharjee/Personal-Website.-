import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getAllScoresForStudent,
  getAssessmentAttempt,
  getHomeworkAttemptForSession,
  getScoreRowsForDate,
  getSessionByStudentSubjectDate,
  listDraftRowsByStudentSubject,
  listDraftRowsForDate,
  listDraftRowsForSession,
  listSessionsByStudentSubject,
  getStudentById,
  getSubjectById,
} from "../../../lib/db"
import { buildLiveDraft } from "../../../lib/live-draft"
import { getLiveSessionNotes } from "../../../lib/live-session-notes"
import { buildSessionSignals } from "../../../lib/session-signals"
import { buildSubjectFlowMeta } from "../../../lib/session-mode"
import { getQuestionCount, DEFAULT_TYPES_PER_HOUR } from "../../../lib/logic"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function normalizeDateKey(value = "") {
  const match = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ""
}

// ─────────────────────────────────────────────
//  Extract QT IDs that were answered incorrectly in the pre-class assessment.
//  Used to surface those topics at the top of the live stack (FIFO signal).
// ─────────────────────────────────────────────
function getPreClassFailedQTIds(preAttempt) {
  const scores = Array.isArray(preAttempt?.resultPayload?.updatedScores)
    ? preAttempt.resultPayload.updatedScores
    : []
  return new Set(
    scores
      .filter(s => s.correct === false)
      .map(s => String(s.questionTypeId || s.questionId || s.id || ""))
      .filter(Boolean)
  )
}

function getSessionCapacity(row = {}, fallbackMinutes = 60, typesPerHour = DEFAULT_TYPES_PER_HOUR) {
  const start = row?.startTime ? new Date(row.startTime) : null
  const end = row?.endTime ? new Date(row.endTime) : null
  if (start instanceof Date && end instanceof Date) {
    const diff = Math.round((end.getTime() - start.getTime()) / 60000)
    if (Number.isFinite(diff) && diff > 0) {
      return Math.max(1, getQuestionCount(diff, typesPerHour))
    }
  }
  return Math.max(1, getQuestionCount(fallbackMinutes, typesPerHour))
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })
  const isAdmin = (session.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  if (!isAdmin) return res.status(403).json({ error: "Forbidden" })

  const { studentId = "", subjectId = "", sessionDate = "" } = req.query || {}
  if (!studentId || !subjectId || !sessionDate) {
    return res.status(400).json({ error: "Missing studentId, subjectId, or sessionDate." })
  }

  try {
    const [student, subject, scoreRows, sessionRow, allRows, sessionRows] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
      getScoreRowsForDate(studentId, subjectId, sessionDate),
      getSessionByStudentSubjectDate(studentId, subjectId, sessionDate).catch(() => null),
      getAllScoresForStudent(studentId, subjectId),
      listSessionsByStudentSubject(studentId, subjectId).catch(() => []),
    ])

    const resolvedSessionRow = sessionRow
    const scoreMap = new Map((allRows || []).map((row) => [String(row.questionId || ""), row]))

    const mergeDraftWithScore = (row = {}) => {
      const scoreRow = scoreMap.get(String(row.questionPageId || row.questionId || ""))
      return {
        ...scoreRow,
        ...row,
        id: row.id || scoreRow?.id || row.questionPageId || row.questionId || "",
        questionId: row.questionPageId || row.questionId || scoreRow?.questionId || "",
        questionPageId: row.questionPageId || row.questionId || scoreRow?.questionId || "",
        questionName: row.title || row.questionName || scoreRow?.questionName || "",
        title: row.title || row.questionName || scoreRow?.questionName || "",
        unit: row.unit || scoreRow?.unit || "",
        standardCode: row.standardCode || scoreRow?.standardCode || "",
        score: scoreRow?.score ?? row.score ?? 0,
        masteryScore: row.masteryScore ?? scoreRow?.masteryScore ?? 0,
      }
    }

    const draftRows = await listDraftRowsByStudentSubject(studentId, subjectId, { limit: 500 }).catch(() => [])
    const uncommittedDraftRows = (draftRows || []).filter((row) => !row.committed && row.state !== "archived")
    let currentDraftRows = []
    if (resolvedSessionRow?.id) {
      currentDraftRows = await listDraftRowsForSession(resolvedSessionRow.id, { committed: false, limit: 200 }).catch(() => [])
    }
    if (!currentDraftRows.length) {
      currentDraftRows = await listDraftRowsForDate(studentId, subjectId, sessionDate, { committed: false, limit: 200 }).catch(() => [])
    }
    currentDraftRows = currentDraftRows.filter((row) => row.state !== "archived" && row.state !== "homework_pool")

    const futureDraftRows = uncommittedDraftRows
      .filter((row) =>
        row.assignedSessionDate &&
        row.assignedSessionDate > sessionDate &&
        row.state !== "homework_pool"
      )
      .sort((a, b) =>
        String(a.assignedSessionDate || "").localeCompare(String(b.assignedSessionDate || "")) ||
        Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0) ||
        String(a.title || "").localeCompare(String(b.title || ""))
      )
      .slice(0, 200)

    const fallbackFutureRows = (allRows || [])
      .filter((row) => row.dateIntroduced && row.dateIntroduced > sessionDate)
      .sort((a, b) =>
        (a.dateIntroduced || "").localeCompare(b.dateIntroduced || "") ||
        (a.questionName || "").localeCompare(b.questionName || "")
      )
      .slice(0, 200)

    // Fetch pre-class attempt early so we can reorder the live stack
    const preAttempt = await getAssessmentAttempt(studentId, subjectId, "pre", sessionDate).catch(() => null)
    const failedQTIds = getPreClassFailedQTIds(preAttempt)

    let effectiveCurrentRows = currentDraftRows.length
      ? currentDraftRows.map(mergeDraftWithScore)
      : (scoreRows || [])

    // FIFO: bubble failed pre-class QTs to the top of the live stack
    if (failedQTIds.size && effectiveCurrentRows.length) {
      effectiveCurrentRows = [
        ...effectiveCurrentRows.filter(r => failedQTIds.has(String(r.questionPageId || r.questionId || ""))),
        ...effectiveCurrentRows.filter(r => !failedQTIds.has(String(r.questionPageId || r.questionId || ""))),
      ]
    }

    const effectiveFutureRows = futureDraftRows.length
      ? futureDraftRows.map(mergeDraftWithScore)
      : fallbackFutureRows

    const flow = buildSubjectFlowMeta({
      subjectExamDate: subject?.examDate,
      activeDate: sessionDate,
      futurePlannedCount: effectiveFutureRows.length,
      currentPlannedCount: effectiveCurrentRows.length,
    })

    const plannedQuestionIds = new Set(
      [...effectiveCurrentRows, ...effectiveFutureRows]
        .map((row) => String(row.questionPageId || row.questionId || row.id || ""))
        .filter(Boolean)
    )
    const plannedDates = [
      sessionDate,
      ...effectiveCurrentRows.map((row) => normalizeDateKey(row.assignedSessionDate || row.dateIntroduced || "")),
      ...effectiveFutureRows.map((row) => normalizeDateKey(row.assignedSessionDate || row.dateIntroduced || "")),
    ].filter(Boolean)
    const futurePlanExhaustedDate = plannedDates.sort().at(-1) || normalizeDateKey(sessionDate)
    const examDate = normalizeDateKey(subject?.examDate || "")
    const practiceSessionRows = examDate
      ? (sessionRows || [])
          .filter((row) => {
            const dateKey = normalizeDateKey(row?.studentSessionDate || row?.tutorSessionDate || "")
            return dateKey && dateKey > futurePlanExhaustedDate && dateKey <= examDate
          })
          .sort((a, b) => String(a.studentSessionDate || a.tutorSessionDate || "").localeCompare(String(b.studentSessionDate || b.tutorSessionDate || "")))
      : []
    const practiceSlotCount = practiceSessionRows.length
      ? practiceSessionRows.reduce((sum, row) => sum + getSessionCapacity(row), 0)
      : 12

    const practiceRows = flow.mode === "practice"
      ? (allRows || [])
          .filter((row) => row.id && !plannedQuestionIds.has(String(row.questionId || row.id || "")))
          .map((row) => {
            const seenDays = Array.isArray(row.dailySeenDates) ? row.dailySeenDates.length : 0
            const wrongDays = Array.isArray(row.dailyWrongDates) ? row.dailyWrongDates.length : 0
            const attemptCount = Array.isArray(row.correctQuestionKeys) ? row.correctQuestionKeys.length : 0
            const frequency = Math.max(seenDays, wrongDays, attemptCount)
            return {
              ...row,
              practiceFrequency: frequency,
            }
          })
          .sort((a, b) =>
            (Number(b.practiceFrequency || 0) - Number(a.practiceFrequency || 0)) ||
            (Number(a.masteryScore || 0) - Number(b.masteryScore || 0)) ||
            (a.questionName || "").localeCompare(b.questionName || "")
          )
          .slice(0, Math.max(1, practiceSlotCount))
      : []

    if (flow.mode === "practice") {
      console.log(`[live-class-plan] practice rail — future exhausted after ${futurePlanExhaustedDate}, examDate=${examDate || "none"}, remaining sessions=${practiceSessionRows.length}, slots=${practiceSlotCount}`)
      console.log("[live-class-plan] practice rail picks:", practiceRows.map((row) => ({
        title: row.questionName || row.title || "",
        frequency: row.practiceFrequency || 0,
        masteryScore: row.masteryScore ?? 0,
        standardCode: row.standardCode || "",
      })))
    }

    const draft = buildLiveDraft({
      currentRows: effectiveCurrentRows,
      futureRows: effectiveFutureRows,
      practiceRows,
      sessionDate,
      flow,
    })

    const previousSession =
      (sessionRows || [])
        .filter((row) => row?.studentSessionDate && row.studentSessionDate < sessionDate)
        .sort((a, b) => String(b.studentSessionDate || "").localeCompare(String(a.studentSessionDate || "")))[0] || null

    // preAttempt already fetched above for FIFO reordering
    const [exitAttempt, homeworkAttempt, previousPreAttempt, previousExitAttempt, previousHomeworkAttempt] = await Promise.all([
      getAssessmentAttempt(studentId, subjectId, "exit", sessionDate).catch(() => null),
      getHomeworkAttemptForSession(studentId, subjectId, sessionDate).catch(() => null),
      previousSession?.studentSessionDate ? getAssessmentAttempt(studentId, subjectId, "pre", previousSession.studentSessionDate).catch(() => null) : Promise.resolve(null),
      previousSession?.studentSessionDate ? getAssessmentAttempt(studentId, subjectId, "exit", previousSession.studentSessionDate).catch(() => null) : Promise.resolve(null),
      previousSession?.studentSessionDate ? getHomeworkAttemptForSession(studentId, subjectId, previousSession.studentSessionDate).catch(() => null) : Promise.resolve(null),
    ])
    const currentSignals = buildSessionSignals({ preAttempt, exitAttempt, homeworkAttempt })
    const previousSignals = buildSessionSignals({
      preAttempt: previousPreAttempt,
      exitAttempt: previousExitAttempt,
      homeworkAttempt: previousHomeworkAttempt,
    })

    const [currentNotes, previousNotes] = await Promise.all([
      getLiveSessionNotes({ studentId, subjectId, sessionDate }).catch(() => null),
      previousSession?.studentSessionDate
        ? getLiveSessionNotes({ studentId, subjectId, sessionDate: previousSession.studentSessionDate }).catch(() => null)
        : Promise.resolve(null),
    ])

    return res.status(200).json({
      ok: true,
      student: student ? { id: student.id, name: student.name, timezone: student.timezone || "" } : null,
      subject: subject ? { id: subject.id, name: subject.name } : null,
      session: resolvedSessionRow ? {
        id: resolvedSessionRow.id,
        title: resolvedSessionRow.title,
        startTime: resolvedSessionRow.startTime,
        endTime: resolvedSessionRow.endTime,
        studentSessionDate: resolvedSessionRow.studentSessionDate,
        sessionNotes: resolvedSessionRow.sessionNotes,
        latestPreClassPdfUrl: resolvedSessionRow.latestPreClassPdfUrl,
        latestExitTicketPdfUrl: resolvedSessionRow.latestExitTicketPdfUrl,
        latestHomeworkPdfUrl: resolvedSessionRow.latestHomeworkPdfUrl,
        sessionReportPdfUrl: resolvedSessionRow.sessionReportPdfUrl,
        ...currentSignals,
      } : null,
      previousSession: previousSession ? {
        id: previousSession.id,
        title: previousSession.title,
        studentSessionDate: previousSession.studentSessionDate,
        sessionNotes: previousSession.sessionNotes,
        latestPreClassPdfUrl: previousSession.latestPreClassPdfUrl,
        latestExitTicketPdfUrl: previousSession.latestExitTicketPdfUrl,
        latestHomeworkPdfUrl: previousSession.latestHomeworkPdfUrl,
        sessionReportPdfUrl: previousSession.sessionReportPdfUrl,
        ...previousSignals,
      } : null,
      notes: {
        current: currentNotes,
        previous: previousNotes,
      },
      flow,
      draft,
      questions: draft.current,
      futureQuestions: draft.future,
      practiceQuestions: draft.practice,
      fifo: {
        failedQTCount: failedQTIds.size,
        failedQTIds: [...failedQTIds],
      },
    })
  } catch (err) {
    console.error("live-class-plan error:", err)
    return res.status(500).json({ error: "Failed to load live class plan." })
  }
}
