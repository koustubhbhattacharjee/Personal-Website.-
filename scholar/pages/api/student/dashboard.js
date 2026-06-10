import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getStudentById, getSubjectsByIds } from "../../../lib/db"
import { buildSessionDateContext, getUpcomingClassesForStudent } from "../../../lib/tutor-calendar"
import { isShowcaseDemo } from "../../../lib/showcase"
import { getShowcaseDashboardPayload } from "../../../lib/showcase-demo"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function getDateKeyInTZ(dateLike = new Date(), tz = "UTC") {
  const d = new Date(dateLike)
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d)
}

export default async function handler(req, res) {
  const demoMode = isShowcaseDemo(req)
  const session = demoMode ? null : await getServerSession(req, res, authOptions)
  if (!session && !demoMode) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = demoMode || (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const impersonateId = req.query.as

  // Only admin can use ?as= param
  if (impersonateId && !isAdmin) {
    return res.status(403).json({ error: "Forbidden" })
  }

  // Pure showcase session — serve the hardcoded showcase courses, no Notion lookup needed
  if (demoMode && !impersonateId) {
    const payload = await getShowcaseDashboardPayload(req)
    return res.status(200).json(payload)
  }

  try {
    const student = impersonateId
      ? await getStudentById(impersonateId)
      : await getStudentById(session?.notionStudentId)

    if (!student) {
      return res.status(404).json({
        error: impersonateId
          ? "Preview student not found"
          : "Student profile not found",
      })
    }

    const subjects = await getSubjectsByIds(student.subjectIds)

    const subjectsWithCalendar = await Promise.all(
      subjects.map(async (subject) => {
        try {
          const classes = await getUpcomingClassesForStudent(student.name, subject.name, 3)
          const tz = student.timezone || "Asia/Kolkata"
          const todayKey = getDateKeyInTZ(new Date(), tz)
          const todayClass = classes.find(c => c.startTime && getDateKeyInTZ(c.startTime, tz) === todayKey) || null
          const nextClass = todayClass || classes[0] || null
          const sessionContext = buildSessionDateContext(nextClass?.startTime, tz)
          return {
            ...subject,
            zoomLink: nextClass?.zoomLink || null,
            nextClassStart: nextClass?.startTime || null,
            nextClassEnd: nextClass?.endTime || null,
            duration: nextClass?.duration || 60,
            todayClass,
            upcomingClasses: classes,
            hasClassToday: !!todayClass,
            // Assessment/import/homework rows are keyed to the student's local
            // session date, so preview links must carry that same anchor.
            sessionDate: sessionContext?.studentSessionDate || null,
            studentSessionDate: sessionContext?.studentSessionDate || null,
            tutorSessionDate: sessionContext?.tutorSessionDate || null,
            sessionDayDiff: sessionContext?.sessionDayDiff || 0,
          }
        } catch (err) {
          console.warn("Calendar fetch failed for", subject.name, err.message)
          return {
            ...subject,
            zoomLink: null,
            nextClassStart: null,
            nextClassEnd: null,
            duration: 60,
            todayClass: null,
            upcomingClasses: [],
            hasClassToday: false,
            sessionDate: null,
            studentSessionDate: null,
            sessionDayDiff: 0,
          }
        }
      })
    )

    return res.status(200).json({
      student: {
        id: student.id,
        name: student.name,
        email: student.email,
        timezone: student.timezone,
        state: student.state || null,
        country: student.country || null,
      },
      subjects: subjectsWithCalendar,
      isImpersonating: !!impersonateId,
      isShowcase: demoMode,
    })
  } catch (err) {
    console.error("Dashboard error:", err)
    return res.status(500).json({ error: "Failed to load dashboard" })
  }
}
