import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { listDraftRowsByStudentSubject } from "../../../lib/db"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function uniqueSortedDates(rows = []) {
  return [...new Set(
    (rows || [])
      .map((row) => row.assignedSessionDate)
      .filter(Boolean)
  )].sort().reverse()
}

function rowsForDate(rows = [], dateStr = "") {
  return (rows || []).filter((row) => String(row.assignedSessionDate || "") === String(dateStr || ""))
}

function rowTitle(row = {}) {
  return row.title || row.questionPageId || "Draft Item"
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { studentId, subjectId, targetDate } = req.query
  if (!studentId || !subjectId || !targetDate) {
    return res.status(400).json({ error: "studentId, subjectId, targetDate required" })
  }

  try {
    const rows = await listDraftRowsByStudentSubject(studentId, subjectId, { committed: false, limit: 500 })
    const activeRows = (rows || []).filter((row) => row.state !== "archived" && row.state !== "homework_pool")
    const dates = uniqueSortedDates(activeRows)
    const previousDate = dates.find((date) => date < String(targetDate || "")) || null
    const previousRows = previousDate ? rowsForDate(activeRows, previousDate) : []
    const targetRows = rowsForDate(activeRows, targetDate)

    return res.status(200).json({
      previousDate,
      targetDate,
      previousQuestions: previousRows.map((row) => ({
        id: row.id,
        questionPageId: row.questionPageId || "",
        title: rowTitle(row),
      })),
      targetQuestions: targetRows.map((row) => ({
        id: row.id,
        questionPageId: row.questionPageId || "",
        title: rowTitle(row),
      })),
    })
  } catch (err) {
    console.error("rollover error", err)
    return res.status(500).json({ error: "Failed to load rollover info" })
  }
}
