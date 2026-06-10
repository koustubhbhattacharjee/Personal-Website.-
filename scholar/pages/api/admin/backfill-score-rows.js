import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getAllQuestionsForSubject,
  getAllScoresForStudent,
  getStudentById,
  getSubjectById,
  listDraftRowsByStudentSubject,
} from "../../../lib/db"
import { supabaseRest } from "../../../lib/supabase"

const ADMIN_EMAIL = "kbohuastt@gmail.com"
const BATCH_SIZE = 50

function normalizeDate(value) {
  return String(value || "").trim().slice(0, 10)
}

async function batchInsertScoreRows(rows = []) {
  let created = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    await supabaseRest("student_question_types", {
      method: "POST",
      body: batch,
      headers: { Prefer: "return=minimal" },
    })
    created += batch.length
  }
  return created
}

async function batchRealignScoreRows(groups = new Map()) {
  let realigned = 0
  for (const [date, ids] of groups.entries()) {
    const cleanIds = [...new Set((ids || []).filter(Boolean))]
    for (let i = 0; i < cleanIds.length; i += BATCH_SIZE) {
      const batch = cleanIds.slice(i, i + BATCH_SIZE)
      await supabaseRest(`student_question_types?id=in.(${batch.join(",")})`, {
        method: "PATCH",
        body: { date_introduced: date, updated_at: new Date().toISOString() },
        headers: { Prefer: "return=minimal" },
      })
      realigned += batch.length
    }
  }
  return realigned
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { studentId = "", subjectId = "", cutoffDate = "" } = req.body || {}
  const normalizedCutoff = normalizeDate(cutoffDate) || new Date().toISOString().slice(0, 10)
  if (!studentId || !subjectId) {
    return res.status(400).json({ error: "studentId and subjectId are required" })
  }

  try {
    const [student, subject, draftRows, existingScores] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
      listDraftRowsByStudentSubject(studentId, subjectId, { limit: 5000 }),
      getAllScoresForStudent(studentId, subjectId),
    ])

    if (!student?.id || !subject?.id) {
      return res.status(404).json({ error: "Student or subject not found" })
    }
    if (!subject?.dataSourceId) {
      return res.status(400).json({ error: "Subject has no content bank configured" })
    }

    const eligibleDrafts = (draftRows || [])
      .filter((row) => normalizeDate(row.assignedSessionDate))
      .filter((row) => normalizeDate(row.assignedSessionDate) <= normalizedCutoff)

    if (!eligibleDrafts.length) {
      return res.status(200).json({
        ok: true,
        cutoffDate: normalizedCutoff,
        created: 0,
        realigned: 0,
        skippedExisting: 0,
        totalEligibleDrafts: 0,
      })
    }

    const earliestDraftByQt = new Map()
    for (const row of eligibleDrafts) {
      const qtId = String(row.questionTypeId || "").trim()
      const date = normalizeDate(row.assignedSessionDate)
      if (!qtId || !date) continue
      const existingDate = earliestDraftByQt.get(qtId)
      if (!existingDate || date < existingDate) earliestDraftByQt.set(qtId, date)
    }

    const questions = await getAllQuestionsForSubject(subject.dataSourceId)
    const questionMap = new Map((questions || []).map((q) => [String(q.id), q]))
    const scoreMap = new Map((existingScores || []).map((row) => [String(row.questionTypeId), row]))

    let created = 0
    let realigned = 0
    let skippedExisting = 0
    const missingQuestionTypes = []
    const rowsToCreate = []
    const rowsToRealign = new Map()

    for (const [qtId, earliestDate] of earliestDraftByQt.entries()) {
      const existing = scoreMap.get(qtId)
      if (!existing?.id) {
        const question = questionMap.get(qtId)
        if (!question) {
          missingQuestionTypes.push(qtId)
          continue
        }
        rowsToCreate.push({
          student_id: studentId,
          subject_id: subjectId,
          question_type_id: qtId,
          date_introduced: earliestDate || null,
          weakness_score: 0,
          hw_source: "session",
          unit_label: question.unit || question.unitLabel || null,
          primary_slo_id: question.primarySlo || question.primarySloId || null,
          aligned_slo_ids: question.alignedSlos || [],
          reinforcement_slos: question.reinforcementSlos || [],
          mastery_events: [],
          correct_question_keys: [],
          daily_seen_dates: [],
          daily_wrong_dates: [],
          metadata: {},
        })
        continue
      }
      const existingDate = normalizeDate(existing.dateIntroduced)
      if (!existingDate || existingDate > earliestDate) {
        if (!rowsToRealign.has(earliestDate)) rowsToRealign.set(earliestDate, [])
        rowsToRealign.get(earliestDate).push(existing.id)
      } else {
        skippedExisting += 1
      }
    }

    created = await batchInsertScoreRows(rowsToCreate)
    realigned = await batchRealignScoreRows(rowsToRealign)

    return res.status(200).json({
      ok: true,
      cutoffDate: normalizedCutoff,
      created,
      realigned,
      skippedExisting,
      totalEligibleDrafts: eligibleDrafts.length,
      totalUniqueQuestionTypes: earliestDraftByQt.size,
      missingQuestionTypes,
    })
  } catch (error) {
    console.error("[backfill-score-rows] failed:", error)
    return res.status(500).json({ error: error.message || "Failed to backfill score rows" })
  }
}
