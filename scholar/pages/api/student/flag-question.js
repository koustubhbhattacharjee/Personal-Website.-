import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getStudentByEmail } from "../../../lib/db"
import { supabaseRest } from "../../../lib/supabase"

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })

  const student = await getStudentByEmail(session.user.email)
  if (!student?.id) return res.status(403).json({ error: "Student not found" })

  const { questionKey, questionTypeId, subjectId, reason } = req.body || {}
  if (!questionKey || !reason?.trim()) return res.status(400).json({ error: "questionKey and reason required" })

  try {
    await supabaseRest("student_question_attempts", {
      method: "POST",
      body: {
        question_key:     questionKey,
        question_type_id: questionTypeId || null,
        student_id:       student.id,
        subject_id:       subjectId || null,
        mode:             "flag",
        flag_reason:      reason.trim(),
      },
      headers: { Prefer: "return=minimal" },
    })
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error("[flag-question]", err)
    return res.status(500).json({ error: err.message || "Failed to save flag" })
  }
}
