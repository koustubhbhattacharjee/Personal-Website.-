import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { supabaseSelect, supabaseUpdate } from "../../../lib/supabase"

const ADMIN_EMAIL = "kbohuastt@gmail.com"
const VERDICT_SCORES = { correct: 1.0, partial: 0.5, incorrect: 0.0 }

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  if (req.method === "GET") {
    const attempts = await supabaseSelect("student_question_attempts", {
      select: "id,student_id,subject_id,question_type_id,question_key,mode,student_work_type,excalidraw_json,upload_url,created_at,review_status",
      filters: { review_status: "pending" },
      orderBy: "created_at",
      ascending: true,
      limit: 100,
    })
    if (!attempts.length) return res.status(200).json({ items: [] })

    const studentIds = [...new Set(attempts.map((a) => a.student_id).filter(Boolean))]
    const subjectIds = [...new Set(attempts.map((a) => a.subject_id).filter(Boolean))]
    const qtIds = [...new Set(attempts.map((a) => a.question_type_id).filter(Boolean))]
    const qhashes = [...new Set(attempts.map((a) => a.question_key).filter(Boolean))]

    const [students, subjects, qtypes, questions] = await Promise.all([
      studentIds.length ? supabaseSelect("students", { select: "id,name,email", filters: { id: studentIds } }) : [],
      subjectIds.length ? supabaseSelect("subjects", { select: "id,name", filters: { id: subjectIds } }) : [],
      qtIds.length ? supabaseSelect("question_types", { select: "id,title", filters: { id: qtIds } }) : [],
      qhashes.length ? supabaseSelect("questions", { select: "qhash,question_text,question_content,stem_header_content,is_stem_child", filters: { qhash: qhashes } }) : [],
    ])

    const studentMap = Object.fromEntries(students.map((s) => [s.id, s]))
    const subjectMap = Object.fromEntries(subjects.map((s) => [s.id, s]))
    const qtMap = Object.fromEntries(qtypes.map((q) => [q.id, q]))
    const qMap = Object.fromEntries(questions.map((q) => [q.qhash, q]))

    const items = attempts.map((a) => ({
      id: a.id,
      studentName: studentMap[a.student_id]?.name || "",
      studentEmail: studentMap[a.student_id]?.email || "",
      subjectName: subjectMap[a.subject_id]?.name || "",
      questionTypeTitle: qtMap[a.question_type_id]?.title || "",
      questionText: qMap[a.question_key]?.question_text || "",
      questionContent: qMap[a.question_key]?.question_content || null,
      stemHeader: qMap[a.question_key]?.stem_header_content || null,
      isStemChild: !!qMap[a.question_key]?.is_stem_child,
      mode: a.mode,
      workType: a.student_work_type,
      uploadUrl: a.upload_url,
      hasExcalidraw: !!a.excalidraw_json,
      createdAt: a.created_at,
    }))

    return res.status(200).json({ items })
  }

  if (req.method === "POST") {
    const { attemptId, verdict } = req.body || {}
    if (!attemptId) return res.status(400).json({ error: "attemptId required" })
    if (!(verdict in VERDICT_SCORES)) return res.status(400).json({ error: "verdict must be correct, partial, or incorrect" })

    const score = VERDICT_SCORES[verdict]
    await supabaseUpdate(
      "student_question_attempts",
      { id: attemptId },
      {
        review_status: "graded",
        admin_verdict: verdict,
        score,
        graded_by: session.user.email,
        graded_at: new Date().toISOString(),
      },
      { returning: "minimal" }
    )

    return res.status(200).json({ ok: true, verdict, score })
  }

  return res.status(405).json({ error: "Method not allowed" })
}
