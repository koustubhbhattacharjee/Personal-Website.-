import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getStudentById, getSubjectById, getTodayInTimezone } from "../../../lib/db"
import { buildHomeworkCycle, formatDateKeyInTimezone, listHomeworkCycles } from "../../../lib/homework"
import { getPastClassesForStudent, getUpcomingClassesForStudent } from "../../../lib/tutor-calendar"

const ADMIN_EMAIL = "kbohuastt@gmail.com"
const TUTOR_TIMEZONE = process.env.TUTOR_TIMEZONE || "Asia/Kolkata"

function formatInTimezone(dateLike, timeZone, options = {}) {
  if (!dateLike) return ""
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      ...options,
    }).format(new Date(dateLike))
  } catch {
    return ""
  }
}

function uniqByKey(items = [], keyFn) {
  const seen = new Set()
  return items.filter((item) => {
    const key = keyFn(item)
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { studentId, subjectId } = req.query
  if (!studentId || !subjectId) {
    return res.status(400).json({ error: "studentId and subjectId are required" })
  }

  try {
    const [student, subject] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
    ])
    if (!student?.name || !subject?.name) {
      return res.status(404).json({ error: "Student or subject not found" })
    }

    const studentTimezone = student.timezone || "UTC"
    const [pastClasses, upcomingClasses] = await Promise.all([
      getPastClassesForStudent(student.name, subject.name, 12).catch(() => []),
      getUpcomingClassesForStudent(student.name, subject.name, 12).catch(() => []),
    ])
    const sessions = uniqByKey(
      [...pastClasses, ...upcomingClasses].sort((a, b) => new Date(a.startTime) - new Date(b.startTime)),
      (event) => `${event?.startTime || ""}|${event?.endTime || ""}|${event?.title || ""}`
    )

    const now = new Date()
    const currentSession = sessions.find(
      (event) => event?.startTime && event?.endTime && new Date(event.startTime) <= now && now < new Date(event.endTime)
    ) || null
    const cycle = buildHomeworkCycle({
      lastCompletedSession: pastClasses.at(-1) || null,
      nextSession: currentSession || upcomingClasses[0] || null,
      sessionTimezone: studentTimezone,
      tutorTimezone: TUTOR_TIMEZONE,
      now,
    })
    const studentToday = getTodayInTimezone(studentTimezone)

    const serializedSessions = sessions.map((event, index) => {
      const sessionDate = formatDateKeyInTimezone(event.startTime, studentTimezone)
      const tutorSessionDate = formatDateKeyInTimezone(event.startTime, TUTOR_TIMEZONE)
      const isPast = Boolean(event.endTime && new Date(event.endTime) <= now)
      const importLocked = Boolean(sessionDate && studentToday > sessionDate)
      return {
        id: event.eventId || `${event.startTime || "session"}-${index}`,
        title: event.title || subject.name,
        startTime: event.startTime || "",
        endTime: event.endTime || "",
        duration: event.duration || 60,
        zoomLink: event.zoomLink || "",
        sessionDate,
        tutorSessionDate,
        importLocked,
        isPast,
        isCurrent: Boolean(event.startTime && event.endTime && new Date(event.startTime) <= now && now < new Date(event.endTime)),
        studentDateLabel: formatInTimezone(event.startTime, studentTimezone, { weekday: "short", month: "short", day: "numeric" }),
        studentTimeLabel: formatInTimezone(event.startTime, studentTimezone, { hour: "numeric", minute: "2-digit" }),
        studentEndTimeLabel: formatInTimezone(event.endTime || event.startTime, studentTimezone, { hour: "numeric", minute: "2-digit" }),
        tutorDateLabel: formatInTimezone(event.startTime, TUTOR_TIMEZONE, { weekday: "short", month: "short", day: "numeric" }),
        tutorTimeLabel: formatInTimezone(event.startTime, TUTOR_TIMEZONE, { hour: "numeric", minute: "2-digit" }),
      }
    })
    const cycles = listHomeworkCycles(serializedSessions, now, {
      pastCount: 2,
      futureCount: 5,
      sessionTimezone: studentTimezone,
    })

    return res.status(200).json({
      student: {
        id: student.id,
        name: student.name,
        timezone: studentTimezone,
      },
      subject: {
        id: subject.id,
        name: subject.name,
      },
      sessions: serializedSessions,
      cycles,
      cycle: cycle.available
        ? {
            ...cycle,
            label: `Cycle ${Number(cycle.cycleIndex || 0) + 1}`,
          }
        : cycle,
    })
  } catch (err) {
    console.error("[calendar-board] error", err)
    return res.status(500).json({ error: err.message || "Failed to load calendar board" })
  }
}
