import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  calculateMasteryScore,
  getAllScoresForStudent,
  getStudentById,
  getSubjectById,
  listDraftRowsByStudentSubject,
} from "../../../lib/db"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function normalizeDate(value = "") {
  return String(value || "").trim().slice(0, 10)
}

function countByDate(rows = [], getDate) {
  const out = {}
  for (const row of rows || []) {
    const date = normalizeDate(getDate(row))
    if (!date) continue
    out[date] = (out[date] || 0) + 1
  }
  return out
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const studentId = String(req.query.studentId || "").trim()
  const subjectId = String(req.query.subjectId || "").trim()
  if (!studentId || !subjectId) {
    return res.status(400).json({ error: "studentId and subjectId are required" })
  }

  try {
    const [student, subject, draftRows, scoreRows] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
      listDraftRowsByStudentSubject(studentId, subjectId, { limit: 5000 }),
      getAllScoresForStudent(studentId, subjectId),
    ])

    if (!student?.id || !subject?.id) {
      return res.status(404).json({ error: "Student or subject not found" })
    }

    const draftDateCounts = countByDate(draftRows, (row) => row.assignedSessionDate)
    const scoreDateCounts = countByDate(scoreRows, (row) => row.dateIntroduced)

    const drafts = [...(draftRows || [])]
      .sort((a, b) =>
        String(a.assignedSessionDate || "").localeCompare(String(b.assignedSessionDate || "")) ||
        Number(a.orderIndex || 0) - Number(b.orderIndex || 0)
      )
      .slice(-200)
      .reverse()
      .map((row) => ({
        id: row.id,
        date: normalizeDate(row.assignedSessionDate),
        committed: !!row.committed,
        inferred: !!row.datesInferred,
        planSource: row.planSource || "",
        questionTypeId: row.questionTypeId || "",
        title: row.title || row.questionName || "",
        unit: row.schoolUnitName || row.unit || "",
      }))

    const scores = [...(scoreRows || [])]
      .sort((a, b) =>
        String(a.dateIntroduced || "").localeCompare(String(b.dateIntroduced || "")) ||
        String(a.questionName || "").localeCompare(String(b.questionName || ""))
      )
      .slice(-200)
      .reverse()
      .map((row) => ({
        id: row.id,
        date: normalizeDate(row.dateIntroduced),
        weaknessScore: Number(row.weaknessScore || 0),
        masteryScore: calculateMasteryScore(row.masteryEvents || []),
        questionTypeId: row.questionTypeId || "",
        title: row.questionName || "",
        unit: row.unitLabel || row.unit || "",
      }))

    return res.status(200).json({
      student: { id: student.id, name: student.name },
      subject: { id: subject.id, name: subject.name },
      fetchedAt: new Date().toISOString(),
      draftSummary: {
        total: draftRows.length,
        committed: draftRows.filter((row) => row.committed).length,
        inferred: draftRows.filter((row) => row.datesInferred).length,
        byDate: draftDateCounts,
      },
      scoreSummary: {
        total: scoreRows.length,
        zeroWeakness: scoreRows.filter((row) => Number(row.weaknessScore || 0) === 0).length,
        byDate: scoreDateCounts,
      },
      drafts,
      scores,
    })
  } catch (error) {
    console.error("[calendar-rows] failed:", error)
    return res.status(500).json({ error: error.message || "Failed to load draft and score rows" })
  }
}
