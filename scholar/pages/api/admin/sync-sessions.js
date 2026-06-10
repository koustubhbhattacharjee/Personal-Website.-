import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getStudentById, getSubjectsByIds } from "../../../lib/db"
import {
  ensureSessionsForStudentSubject,
  getClassesForStudentInRange,
} from "../../../lib/tutor-calendar"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function parseDateOnly(value = "") {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match
  return new Date(`${year}-${month}-${day}T00:00:00`)
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { studentId = "", startDate = "", endDate = "" } = req.body || {}
  if (!studentId) {
    return res.status(400).json({ error: "studentId is required" })
  }

  const start = parseDateOnly(startDate)
  const endBase = parseDateOnly(endDate)
  const end = endBase ? new Date(endBase.getTime() + (24 * 60 * 60 * 1000) - 1) : null
  if (!start || !end) {
    return res.status(400).json({ error: "startDate and endDate are required in YYYY-MM-DD format" })
  }
  if (end < start) {
    return res.status(400).json({ error: "endDate must be on or after startDate" })
  }

  try {
    const student = await getStudentById(studentId)
    if (!student?.id) return res.status(404).json({ error: "Student not found" })

    const subjects = await getSubjectsByIds(student.subjectIds || [])
    const validSubjects = (subjects || []).filter((subject) => subject?.id && subject?.name)

    const results = []
    let created = 0
    let updated = 0
    let archived = 0
    let skipped = 0

    for (const subject of validSubjects) {
      console.log(`[admin/sync-sessions] syncing student="${student?.name || ""}" subject="${subject?.name || ""}" range=${startDate}..${endDate}`)
      const matchedEvents = await getClassesForStudentInRange(
        student.name,
        subject.name,
        start,
        end,
        400
      )
      console.log(`[admin/sync-sessions] matched events student="${student?.name || ""}" subject="${subject?.name || ""}" count=${matchedEvents.length}`)
      const sync = await ensureSessionsForStudentSubject(student, subject, matchedEvents)
      console.log(`[admin/sync-sessions] subject summary student="${student?.name || ""}" subject="${subject?.name || ""}" created=${Number(sync?.created || 0)} updated=${Number(sync?.updated || 0)} archived=${Number(sync?.archived || 0)} skipped=${Number(sync?.skipped || 0)} error="${sync?.error || ""}"`)
      created += Number(sync?.created || 0)
      updated += Number(sync?.updated || 0)
      archived += Number(sync?.archived || 0)
      skipped += Number(sync?.skipped || 0)
      results.push({
        subjectId: subject.id,
        subjectName: subject.name,
        created: Number(sync?.created || 0),
        updated: Number(sync?.updated || 0),
        archived: Number(sync?.archived || 0),
        skipped: Number(sync?.skipped || 0),
        error: sync?.error || "",
      })
    }

    return res.status(200).json({
      ok: true,
      student: {
        id: student.id,
        name: student.name,
      },
      syncWindow: {
        startDate,
        endDate,
      },
      created,
      updated,
      archived,
      skipped,
      subjects: results,
    })
  } catch (err) {
    console.error("[admin/sync-sessions] error", err)
    return res.status(500).json({ error: err.message || "Failed to sync sessions from calendar" })
  }
}
