import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getStudentByEmail } from "../../../lib/db"
import { uploadBinaryToR2 } from "../../../lib/r2"
import { supabaseRest, supabaseSelect } from "../../../lib/supabase"

const BUCKET = process.env.R2_BUCKET || ""
const ALLOWED_MODES = new Set(["practice", "homework", "assessment"])
const ALLOWED_UPLOAD_MIME = new Set(["image/jpeg", "image/png", "application/pdf"])

export const config = {
  api: {
    bodyParser: { sizeLimit: "25mb" },
  },
}

function extForMime(mime) {
  if (mime === "image/jpeg") return "jpg"
  if (mime === "image/png") return "png"
  if (mime === "application/pdf") return "pdf"
  return "bin"
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })

  const student = await getStudentByEmail(session.user.email)
  if (!student?.id) return res.status(403).json({ error: "Student not found" })

  const {
    questionKey,
    questionTypeId,
    subjectId,
    mode,
    workType,                 // "excalidraw" | "upload"
    excalidrawJson = null,
    excalidrawPngBase64 = "", // when workType === "excalidraw", we also upload a rendered PNG
    uploadBase64 = "",
    uploadMime = "",
  } = req.body || {}

  if (!questionKey || !subjectId) {
    return res.status(400).json({ error: "questionKey and subjectId required" })
  }
  const attemptMode = ALLOWED_MODES.has(mode) ? mode : "homework"
  if (workType !== "excalidraw" && workType !== "upload") {
    return res.status(400).json({ error: "workType must be 'excalidraw' or 'upload'" })
  }

  try {
    const baseUrl = String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "")
    let uploadUrl = null

    if (workType === "upload") {
      if (!uploadBase64 || !ALLOWED_UPLOAD_MIME.has(uploadMime)) {
        return res.status(400).json({ error: "uploadBase64 with mime jpeg/png/pdf required" })
      }
      const ext = extForMime(uploadMime)
      const key = `student-work/${student.id}/${questionKey}-${Date.now()}.${ext}`
      await uploadBinaryToR2({
        bucket: BUCKET,
        key,
        body: Buffer.from(uploadBase64, "base64"),
        contentType: uploadMime,
      })
      uploadUrl = `${baseUrl}/${key}`
    } else if (excalidrawPngBase64) {
      const key = `student-work/${student.id}/${questionKey}-${Date.now()}.png`
      await uploadBinaryToR2({
        bucket: BUCKET,
        key,
        body: Buffer.from(excalidrawPngBase64, "base64"),
        contentType: "image/png",
      })
      uploadUrl = `${baseUrl}/${key}`
    } else {
      return res.status(400).json({ error: "excalidrawPngBase64 required for excalidraw submissions" })
    }

    let scoreRowId = null
    if (questionTypeId) {
      const sqtRows = await supabaseSelect("student_question_types", {
        select: "id",
        filters: { student_id: student.id, subject_id: subjectId, question_type_id: questionTypeId },
        limit: 1,
        single: true,
      })
      scoreRowId = sqtRows?.id || null
    }

    await supabaseRest("student_question_attempts", {
      method: "POST",
      body: {
        student_id:        student.id,
        subject_id:        subjectId,
        question_type_id:  questionTypeId || null,
        question_key:      questionKey,
        mode:              attemptMode,
        review_status:     "pending",
        student_work_type: workType,
        excalidraw_json:   workType === "excalidraw" ? (excalidrawJson || null) : null,
        upload_url:        uploadUrl,
        score_row_id:      scoreRowId,
      },
      headers: { Prefer: "return=minimal" },
    })

    return res.status(200).json({ ok: true, uploadUrl, reviewStatus: "pending" })
  } catch (err) {
    console.error("[submit-freeresponse]", err)
    return res.status(500).json({ error: err.message || "Submission failed" })
  }
}
