// Cron job — runs daily, penalizes students who didn't complete ET
// Called by Vercel cron or external scheduler
// Schedule: run at 23:30 IST daily (18:00 UTC)

import { getAllStudents, getSubjectsByIds, penalizeAllTodayQuestions, getTodayInTimezone } from "../../../lib/db"
import { supabaseSelect } from "../../../lib/supabase"

async function hasTodayHomeworkAttempt(studentId, subjectId, today) {
  const rows = await supabaseSelect("homework_attempts", {
    select: "id",
    filters: { student_id: studentId, subject_id: subjectId, session_date: today, status: "Completed" },
    limit: 1,
  })
  return rows.length > 0
}

async function hasTodayScoreRows(studentId, subjectId, today) {
  const rows = await supabaseSelect("student_question_types", {
    select: "id",
    filters: { student_id: studentId, subject_id: subjectId, date_introduced: today },
    limit: 1,
  })
  return rows.length > 0
}

export default async function handler(req, res) {
  // Verify cron secret
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  try {
    const students = await getAllStudents()
    const results = []

    for (const student of students) {
      if (!student.subjectIds?.length) continue

      const subjects = await getSubjectsByIds(student.subjectIds)
      const today = getTodayInTimezone(student.timezone || "Asia/Kolkata")

      for (const subject of subjects) {
        // Check if student completed ET (homework attempt) today
        const etDone = await hasTodayHomeworkAttempt(student.id, subject.id, today)
        if (etDone) {
          results.push({ student: student.name, subject: subject.name, status: "ET done, no penalty" })
          continue
        }

        // Check if there were any questions today (class may not have happened)
        const hadClass = await hasTodayScoreRows(student.id, subject.id, today)
        if (!hadClass) {
          results.push({ student: student.name, subject: subject.name, status: "No class today" })
          continue
        }

        // Penalize — apply weakness penalty for all today's questions
        await penalizeAllTodayQuestions(student.id, subject.id, student.timezone || "Asia/Kolkata")

        results.push({
          student: student.name,
          subject: subject.name,
          status: "Penalized (no ET completed)",
        })
      }
    }

    return res.status(200).json({ success: true, results })
  } catch (err) {
    console.error("ET penalty cron error:", err)
    return res.status(500).json({ error: err.message })
  }
}
