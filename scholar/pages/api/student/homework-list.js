import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getStudentById, getSubjectById, getAllScoresForStudent, getTodayInTimezone } from "../../../lib/db"
import { supabaseSelect } from "../../../lib/supabase"
import { getPastClassesForStudent, getUpcomingClassForStudent } from "../../../lib/tutor-calendar"

async function isHWDoneOnDate(studentId, dateStr) {
  const rows = await supabaseSelect("homework_attempts", {
    select: "id",
    filters: { student_id: studentId, session_date: dateStr, status: "Completed" },
    limit: 1,
  })
  return rows.length > 0
}

async function getCurrentStreak(studentId) {
  let streak = 0
  const d = new Date()
  for (let i = 0; i < 30; i++) {
    const dateStr = d.toISOString().split("T")[0]
    const done = await isHWDoneOnDate(studentId, dateStr)
    if (done) { streak++; d.setDate(d.getDate() - 1) }
    else break
  }
  return streak
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = (session.user.email || "").toLowerCase() === "kbohuastt@gmail.com"
  const { subjectId, as: asStudentId } = req.query
  const studentId = (isAdmin && asStudentId) ? asStudentId : session.notionStudentId

  try {
    const [student, subject] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId)
    ])

    const today = getTodayInTimezone(student.timezone)

    // Get session dates — prefer calendar, fall back to Notion Scores DB dates
    let pastDates = []
    let upcomingDate = null
    try {
      const past = await getPastClassesForStudent(student.name, subject.name, 20)
      pastDates = past.map(c => c.date).filter(Boolean).sort()
      const upcoming = await getUpcomingClassForStudent(student.name, subject.name)
      if (upcoming?.startTime) upcomingDate = new Date(upcoming.startTime).toISOString().split("T")[0]
    } catch {}

    // Fallback: if calendar returned nothing, use distinct Date Introduced values from Scores DB
    if (!pastDates.length) {
      const scores = await getAllScoresForStudent(studentId, subjectId)
      const notionDates = [...new Set(scores.map(s => s.dateIntroduced).filter(Boolean))].sort()
      if (notionDates.length) pastDates = notionDates
    }

    // If still nothing, nothing to show
    if (!pastDates.length) {
      return res.status(200).json({ items: [], streak: 0 })
    }

    // Build homework schedule:
    // Homework days = all days between sessions (excluding session days themselves)
    // If no dates from calendar, fall back to last 7 days
    const allDays = []

    // Only show current cycle: last session (inclusive) → next session (exclusive)
    const lastSession = pastDates[pastDates.length - 1] || today
    if (upcomingDate && upcomingDate > lastSession) {
      let d = new Date(lastSession)
      const end = new Date(upcomingDate)
      while (d < end) {
        allDays.push(d.toISOString().split("T")[0])
        d.setDate(d.getDate() + 1)
      }
    } else {
      // No upcoming session — from last session up to today + 3
      let d = new Date(lastSession)
      const end = new Date(today)
      end.setDate(end.getDate() + 3)
      while (d <= end) {
        allDays.push(d.toISOString().split("T")[0])
        d.setDate(d.getDate() + 1)
      }
    }

    // Deduplicate and sort
    const uniqueDays = [...new Set(allDays)].sort()

    // Check done status for each day (only past + today)
    const items = await Promise.all(
      uniqueDays.map(async (date) => {
        const done = date <= today ? await isHWDoneOnDate(studentId, date) : false
        return { date, done, locked: false, label: date === today ? "3 questions due" : "3 questions" }
      })
    )

    const streak = await getCurrentStreak(studentId)

    return res.status(200).json({ items, streak })
  } catch (err) {
    console.error("HW list error:", err)
    return res.status(500).json({ error: "Failed to load homework list" })
  }
}
