import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getSubjectById, getStudentById, hasAssessmentAttemptsDB, listAssessmentAttempts } from "../../../lib/db"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  if (req.method !== "GET") return res.status(405).end()

  const { studentId, subjectId } = req.query
  if (!studentId) return res.status(400).json({ error: "studentId required" })

  try {
    const student = await getStudentById(studentId)
    if (!hasAssessmentAttemptsDB()) {
      return res.status(200).json({ student: student.name, attempts: [], noDb: true })
    }

    const attempts = await listAssessmentAttempts(studentId, subjectId || null, 36)
    const subjectIds = [...new Set(attempts.map((item) => item.subjectId).filter(Boolean))]
    const subjectPairs = await Promise.all(subjectIds.map(async (id) => {
      try {
        const subject = await getSubjectById(id)
        return [id, subject?.name || id]
      } catch {
        return [id, id]
      }
    }))
    const subjectNameMap = Object.fromEntries(subjectPairs)

    return res.status(200).json({
      student: student.name,
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        subjectId: attempt.subjectId,
        subjectName: subjectNameMap[attempt.subjectId] || attempt.subjectId || "Unknown subject",
        mode: attempt.mode,
        sessionDate: attempt.sessionDate,
        unlockAt: attempt.unlockAt,
        expireAt: attempt.expireAt,
        status: attempt.status,
        score: attempt.score,
        total: attempt.total,
        questionCount: Array.isArray(attempt.questionPayload) ? attempt.questionPayload.length : 0,
        resultPayload: attempt.resultPayload,
      })),
    })
  } catch (err) {
    console.error("[admin/assessment-attempts] error", err)
    return res.status(500).json({ error: err.message || "Failed to load assessment attempts" })
  }
}
