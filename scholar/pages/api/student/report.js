import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getAllScoresForStudent,
  getScoreRowsForDate,
  getSessionByStudentSubjectDate,
  isExitCompletedStatus,
  getStudentById,
  getSubjectById,
  getWeaknessMap,
} from "../../../lib/db"
import { calculateTrends } from "../../../lib/logic"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })

  const { subjectId, sessionDate } = req.query
  const isAdmin = (session.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const studentId = (req.query.as && isAdmin) ? req.query.as : session.notionStudentId

  try {
    if (!sessionDate) {
      return res.status(400).json({
        error: "sessionDate is required. Report generation must be anchored to an explicit session date.",
      })
    }

    const student = await getStudentById(studentId)
    const subject = await getSubjectById(subjectId)

    // Exit ticket gate: require at least one status set on today's session rows.
    // Bypass in preview mode.
    const sessionRows = await getScoreRowsForDate(studentId, subjectId, sessionDate)
    if (!(req.query.as && isAdmin) && sessionRows.length > 0) {
      const exitDone = sessionRows.some(r => isExitCompletedStatus(r.status))
      if (!exitDone) {
        return res.status(403).json({ error: "Exit ticket not completed yet." })
      }
    }
    const allScores = await getAllScoresForStudent(studentId)
    let trends = calculateTrends(allScores)
    const weaknessMap = await getWeaknessMap(studentId, subjectId)
    const sessionRow = sessionDate ? await getSessionByStudentSubjectDate(studentId, subjectId, sessionDate) : null

    // If we don't have enough session history to calculate trends,
    // seed a baseline at t=0 with weakness score = 0 so graphs render.
    if ((!trends?.uptrend?.length && !trends?.downtrend?.length) && weaknessMap?.topics) {
      const seededDown = Object.entries(weaknessMap.topics)
        .filter(([, score]) => Number(score) > 0)
        .map(([topic, score]) => ({
          topic,
          previousScore: 0,
          currentScore: Number(score),
        }))
      trends = { uptrend: [], downtrend: seededDown }
    }

    return res.status(200).json({
      student: student.name,
      subject: subject.name,
      date: new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
      sessionDate,
      reportUrl: sessionRow?.sessionReportPdfUrl || "",
      trends,
      weaknessMap,
    })
  } catch (err) {
    console.error("Report error:", err)
    return res.status(500).json({ error: "Failed to generate report data" })
  }
}
