import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getStudentByEmail } from "../../../lib/db"
import { uploadBinaryToR2 } from "../../../lib/r2"
import { supabaseRest, supabaseSelect } from "../../../lib/supabase"

const BUCKET = process.env.R2_BUCKET || ""
const ALLOWED_MODES = new Set(["practice", "homework", "assessment"])

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })

  const student = await getStudentByEmail(session.user.email)
  if (!student?.id) return res.status(403).json({ error: "Student not found" })

  const { questionKey, imageBase64, subjectId, questionTypeId, mode } = req.body || {}
  if (!questionKey || !imageBase64) return res.status(400).json({ error: "questionKey and imageBase64 required" })

  try {
    const buf = Buffer.from(imageBase64, "base64")
    const key = `question-work/${student.id}/${questionKey}.png`
    await uploadBinaryToR2({ bucket: BUCKET, key, body: buf, contentType: "image/png" })
    const baseUrl = String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "")
    const url = `${baseUrl}/${key}`

    const attemptMode = ALLOWED_MODES.has(mode) ? mode : null
    if (attemptMode && subjectId && questionTypeId) {
      try {
        let scoreRowId = null
        const sqtRows = await supabaseSelect("student_question_types", {
          select: "id",
          filters: { student_id: student.id, subject_id: subjectId, question_type_id: questionTypeId },
          limit: 1,
          single: true,
        })
        scoreRowId = sqtRows?.id || null

        await supabaseRest("student_question_attempts", {
          method: "POST",
          body: {
            student_id:       student.id,
            subject_id:       subjectId,
            question_type_id: questionTypeId,
            question_key:     questionKey,
            mode:             attemptMode,
            scratch_image_url: url,
            score_row_id:     scoreRowId,
          },
          headers: { Prefer: "return=minimal" },
        })
      } catch (logErr) {
        console.error("[save-scratch] attempt log failed", logErr)
      }
    }

    return res.status(200).json({ ok: true, url })
  } catch (err) {
    console.error("[save-scratch]", err)
    return res.status(500).json({ error: err.message || "Upload failed" })
  }
}
