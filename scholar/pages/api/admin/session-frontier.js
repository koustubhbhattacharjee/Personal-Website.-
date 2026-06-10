import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getAllScoresForStudent,
  getStudentById,
  getSubjectById,
  listDraftRowsByStudentSubject,
  listSessionsByStudentSubject,
} from "../../../lib/db"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function countBy(items = [], getKey) {
  const out = new Map()
  for (const item of items || []) {
    const key = String(getKey(item) || "").trim()
    if (!key) continue
    out.set(key, (out.get(key) || 0) + 1)
  }
  return out
}

function groupBy(items = [], getKey) {
  const out = new Map()
  for (const item of items || []) {
    const key = String(getKey(item) || "").trim()
    if (!key) continue
    if (!out.has(key)) out.set(key, [])
    out.get(key).push(item)
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
    const [student, subject, sessions, draftRows, scoreRows] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
      listSessionsByStudentSubject(studentId, subjectId),
      listDraftRowsByStudentSubject(studentId, subjectId, { limit: 2000 }),
      getAllScoresForStudent(studentId, subjectId),
    ])

    if (!student?.id || !subject?.id) {
      return res.status(404).json({ error: "Student or subject not found" })
    }

    const draftsByDate = countBy(draftRows, (row) => row.assignedSessionDate)
    const committedDraftsByDate = countBy(draftRows.filter((row) => row.committed), (row) => row.assignedSessionDate)
    const inferredDraftsByDate = countBy(draftRows.filter((row) => row.datesInferred), (row) => row.assignedSessionDate)
    const scoresByDate = countBy(scoreRows, (row) => row.dateIntroduced)
    const sessionsByDate = groupBy(
      (sessions || []).filter((row) => row.studentSessionDate),
      (row) => row.studentSessionDate
    )

    const allDates = uniqueDates([
      ...(sessions || []).map((row) => row.studentSessionDate),
      ...(draftRows || []).map((row) => row.assignedSessionDate),
      ...(scoreRows || []).map((row) => row.dateIntroduced),
    ])

    const rows = allDates.map((date) => {
      const sessionRowsForDate = sessionsByDate.get(date) || []
      const primarySession = sessionRowsForDate[0] || null
      const draftCount = draftsByDate.get(date) || 0
      const committedDraftCount = committedDraftsByDate.get(date) || 0
      const inferredDraftCount = inferredDraftsByDate.get(date) || 0
      const scoreCount = scoresByDate.get(date) || 0
      const hasSessionRow = sessionRowsForDate.length > 0
      const inferredOnly = !hasSessionRow && draftCount > 0
      return {
        id: primarySession?.id || `derived-${date}`,
        date,
        source: primarySession?.source || primarySession?.sessionSource || (inferredOnly ? "inferred draft" : ""),
        mode: primarySession?.mode || primarySession?.sessionMode || (inferredOnly ? "inferred" : ""),
        startTime: primarySession?.startTime || "",
        endTime: primarySession?.endTime || "",
        sessionLengthMinutes: primarySession?.sessionLengthMinutes || null,
        hasSessionRow,
        inferredDraftCount,
        inferredOnly,
        draftCount,
        committedDraftCount,
        scoreCount,
      }
    })

    const frontierRow =
      rows.find((row) => row.draftCount > 0 && row.scoreCount === 0) ||
      null

    return res.status(200).json({
      student: { id: student.id, name: student.name },
      subject: { id: subject.id, name: subject.name },
      earliestDate: rows[0]?.date || null,
      latestDate: rows.at(-1)?.date || null,
      frontierDate: frontierRow?.date || null,
      rows,
    })
  } catch (error) {
    console.error("[session-frontier] failed:", error)
    return res.status(500).json({ error: error.message || "Failed to load session frontier" })
  }
}

function uniqueDates(values = []) {
  return [...new Set(
    (values || [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b))
}
