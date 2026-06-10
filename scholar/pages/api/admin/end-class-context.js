import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getLatestSessionByStudentSubjectOnOrBefore,
  listDraftRowsForDate,
  getStudentById,
  getSubjectById,
  getTodayTopicsAny,
} from "../../../lib/db"
import { buildSessionDateContext, getPastClassesForStudent, getUpcomingClassesForStudent } from "../../../lib/tutor-calendar"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { studentId, subjectId } = req.query
  if (!studentId || !subjectId) {
    return res.status(400).json({ error: "Missing studentId or subjectId." })
  }

  try {
    const [student, subject] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
    ])

    const studentTimezone = student.timezone || "UTC"
    const todaySessionContext = buildSessionDateContext(new Date().toISOString(), studentTimezone)
    const canonicalSession =
      await getLatestSessionByStudentSubjectOnOrBefore(
        studentId,
        subjectId,
        todaySessionContext?.studentToday || null
      )

    let sessionDate = canonicalSession?.studentSessionDate || ""

    if (!sessionDate && student?.name && subject?.name) {
      try {
        const [pastClasses, upcomingClasses] = await Promise.all([
          getPastClassesForStudent(student.name, subject.name, 6).catch(() => []),
          getUpcomingClassesForStudent(student.name, subject.name, 2).catch(() => []),
        ])

        const now = new Date()
        const currentClass = [...pastClasses, ...upcomingClasses]
          .filter((item) => item?.startTime && item?.endTime)
          .find((item) => new Date(item.startTime) <= now && now < new Date(item.endTime))
        const anchorClass = currentClass || pastClasses.at(-1) || null
        const anchorContext = buildSessionDateContext(anchorClass?.startTime, studentTimezone)
        sessionDate = anchorContext?.studentSessionDate || ""
      } catch {}
    }

    if (!sessionDate) {
      return res.status(200).json({ sessionDate: "", topics: [] })
    }

    const draftTopics = await listDraftRowsForDate(studentId, subjectId, sessionDate, { committed: false, limit: 200 }).catch(() => [])
    const activeDraftTopics = (draftTopics || []).filter((row) => row.state !== "archived" && row.state !== "homework_pool")
    const topics = activeDraftTopics.length
      ? activeDraftTopics.map((row) => ({ questionId: row.questionPageId, questionName: row.title }))
      : await getTodayTopicsAny(subject.dataSourceId, studentId, subjectId, student.timezone, sessionDate)
    return res.status(200).json({
      sessionDate,
      topics: topics.map(t => ({ id: t.questionId, title: t.questionName })),
    })
  } catch (err) {
    console.error("End class context error:", err)
    return res.status(500).json({ error: "Failed to load end-class context." })
  }
}
