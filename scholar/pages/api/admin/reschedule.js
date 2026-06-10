import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getSessionByStudentSubjectDate,
  getAllScoresForStudent,
  listDraftRowsByStudentSubject,
  updateDraftRow,
  pushQuestionToDate,
} from "../../../lib/db"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function addDays(dateStr, days) {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

function groupDraftRowsByDate(rows = []) {
  const out = {}
  for (const row of rows || []) {
    const date = String(row.assignedSessionDate || "").trim()
    if (!date) continue
    if (!out[date]) out[date] = []
    out[date].push({
      id: row.id,
      name: row.title || row.questionPageId || "Draft Item",
      questionPageId: row.questionPageId || "",
      sessionId: row.sessionId || "",
      orderIndex: row.orderIndex ?? null,
    })
  }
  return Object.entries(out)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, rows: items }))
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  if (req.method === "GET") {
    const { studentId, subjectId } = req.query
    if (!studentId || !subjectId) return res.status(400).json({ error: "Missing studentId or subjectId" })

    const draftRows = await listDraftRowsByStudentSubject(studentId, subjectId, { committed: false, limit: 500 }).catch(() => [])
    const dates = groupDraftRowsByDate(
      (draftRows || []).filter((row) => row.state !== "archived" && row.state !== "homework_pool")
    )
    return res.status(200).json({ dates })
  }

  if (req.method !== "POST") return res.status(405).end()

  const { studentId, subjectId, mode, fromDate, toDate, shiftDays } = req.body || {}
  if (!studentId || !subjectId || !mode) {
    return res.status(400).json({ error: "Missing required fields" })
  }

  try {
    const [draftRows, allScores] = await Promise.all([
      listDraftRowsByStudentSubject(studentId, subjectId, { committed: false, limit: 500 }),
      getAllScoresForStudent(studentId, subjectId),
    ])
    const scoreByQuestionPageId = new Map((allScores || []).map((row) => [String(row.questionId || ""), row]))
    let updated = 0

    if (mode === "move") {
      if (!fromDate || !toDate) return res.status(400).json({ error: "Missing fromDate or toDate" })
      const targetSession = await getSessionByStudentSubjectDate(studentId, subjectId, toDate).catch(() => null)
      const targets = (draftRows || []).filter((row) => String(row.assignedSessionDate || "") === String(fromDate || ""))
      for (const row of targets) {
        await updateDraftRow(row.id, {
          assignedSessionDate: toDate,
          sessionId: targetSession?.id || "",
          state: row.state === "deferred" ? "draft" : row.state,
        })
        const scoreRow = scoreByQuestionPageId.get(String(row.questionPageId || ""))
        if (scoreRow?.id) await pushQuestionToDate(scoreRow.id, toDate)
        updated += 1
      }
      return res.status(200).json({ updated, message: `Moved ${updated} draft row(s) from ${fromDate} to ${toDate}` })
    }

    if (mode === "shift") {
      if (!shiftDays) return res.status(400).json({ error: "Missing shiftDays" })
      const days = parseInt(shiftDays, 10)
      if (!Number.isFinite(days)) return res.status(400).json({ error: "Invalid shiftDays" })
      const today = new Date().toISOString().split("T")[0]
      const targets = (draftRows || []).filter((row) => row.assignedSessionDate && row.assignedSessionDate >= today)
      for (const row of targets) {
        const nextDate = addDays(row.assignedSessionDate, days)
        const targetSession = await getSessionByStudentSubjectDate(studentId, subjectId, nextDate).catch(() => null)
        await updateDraftRow(row.id, {
          assignedSessionDate: nextDate,
          sessionId: targetSession?.id || "",
          state: row.state === "deferred" ? "draft" : row.state,
        })
        const scoreRow = scoreByQuestionPageId.get(String(row.questionPageId || ""))
        if (scoreRow?.id) await pushQuestionToDate(scoreRow.id, nextDate)
        updated += 1
      }
      return res.status(200).json({ updated, message: `Shifted ${updated} draft row(s) by ${days} day(s)` })
    }

    return res.status(400).json({ error: "Invalid mode. Use 'move' or 'shift'" })
  } catch (err) {
    console.error("reschedule error:", err)
    return res.status(500).json({ error: "Failed to reschedule draft rows" })
  }
}
