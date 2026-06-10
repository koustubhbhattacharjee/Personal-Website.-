import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getSubjectById, getTodayTopicsAny, getStudentById } from "../../../lib/db"
import { isShowcaseDemo } from "../../../lib/showcase"
import { getShowcaseTodayTopics } from "../../../lib/showcase-demo"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const demoMode = isShowcaseDemo(req)
  const session = demoMode ? null : await getServerSession(req, res, authOptions)
  if (!session && !demoMode) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = demoMode || (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const studentId = demoMode
    ? (req.query.as || getShowcaseStudentId())
    : (req.query.as && isAdmin) ? req.query.as : session?.notionStudentId

  const { subjectId } = req.query
  const sessionDate = req.query.sessionDate || null

  if (!sessionDate) {
    return res.status(400).json({
      error: "sessionDate is required. Topic lookup must be anchored to an explicit session date.",
    })
  }

  if (demoMode) {
    const topics = await getShowcaseTodayTopics(req, subjectId, sessionDate)
    if (topics) return res.status(200).json({ topics })
    // not a showcase subjectId — fall through to Notion path
  }

  try {
    const [subject, student] = await Promise.all([
      getSubjectById(subjectId),
      getStudentById(studentId),
    ])
    console.log("[today-topics] subjectId:", subjectId, "dataSourceId:", subject.dataSourceId, "studentId:", studentId)
    const topics = await getTodayTopicsAny(subject.dataSourceId, studentId, subjectId, student.timezone, sessionDate)
    console.log("[today-topics] found:", topics.length, topics.map(t => t.questionName))
    return res.status(200).json({
      topics: topics.map(t => ({ id: t.questionId, title: t.questionName }))
    })
  } catch (err) {
    console.error("today-topics error:", err)
    return res.status(500).json({ error: err.message })
  }
}
