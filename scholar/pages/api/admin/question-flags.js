import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { supabaseSelect } from "../../../lib/supabase"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  // Return QTs for a subject (for the scratch work viewer)
  if (req.query.qtsForSubject) {
    try {
      const subject = await supabaseSelect("subjects", { select: "content_bank_id", filters: { id: req.query.qtsForSubject }, limit: 1 })
      const bankId = subject[0]?.content_bank_id
      if (!bankId) return res.status(200).json({ qts: [] })
      const qts = await supabaseSelect("question_types", {
        select: "id,title",
        filters: { content_bank_id: bankId, status: "active" },
        orderBy: "title",
      })
      return res.status(200).json({ qts })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // Return questions for a QT (for the scratch work viewer)
  if (req.query.questionsForQt) {
    try {
      const questions = await supabaseSelect("questions", {
        select: "id,qhash,question_text",
        filters: { question_type_id: req.query.questionsForQt },
      })
      return res.status(200).json({ questions })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // Return recent flag attempts with student names
  try {
    const [attempts, students] = await Promise.all([
      supabaseSelect("student_question_attempts", {
        select: "*",
        filters: { mode: "flag" },
        orderBy: "created_at",
        ascending: false,
        limit: 200,
      }),
      supabaseSelect("students", { select: "id,full_name" }),
    ])
    const studentMap = new Map(students.map(s => [s.id, s.full_name]))
    const enriched = attempts.map(f => ({
      ...f,
      reason: f.flag_reason,
      student_name: studentMap.get(f.student_id) || f.student_id,
    }))
    return res.status(200).json({ flags: enriched })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
