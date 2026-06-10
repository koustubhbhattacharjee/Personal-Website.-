import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getStudentById,
  getSubjectById,
  getScoreRowsForDate,
  createReportRow,
  isExitCompletedStatus,
} from "../../../lib/db"
import { uploadPdfToR2 } from "../../../lib/r2"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export const config = {
  api: {
    bodyParser: { sizeLimit: "10mb" },
  },
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = (session.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const { subjectId, pdfBase64, as: asStudentId, generatedAt, sessionDate } = req.body || {}
  const studentId = (asStudentId && isAdmin) ? asStudentId : session.notionStudentId

  if (!subjectId || !pdfBase64 || !sessionDate) {
    return res.status(400).json({ error: "subjectId, pdfBase64, and sessionDate are required." })
  }

  try {
    const [student, subject] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
    ])

    // Exit ticket gate (bypass in preview)
    const sessionRows = await getScoreRowsForDate(studentId, subjectId, sessionDate)
    if (!(asStudentId && isAdmin) && sessionRows.length > 0) {
      const exitDone = sessionRows.some(r => isExitCompletedStatus(r.status))
      if (!exitDone) {
        return res.status(403).json({ error: "Exit ticket not completed yet." })
      }
    }

    const safeDate = sessionDate

    const bucket = process.env.R2_BUCKET
    const baseUrl = process.env.R2_PUBLIC_BASE_URL
    if (!bucket || !baseUrl) {
      return res.status(500).json({ error: "R2_BUCKET or R2_PUBLIC_BASE_URL is not configured." })
    }

    const stamp = (generatedAt || new Date().toISOString()).replace(/[:.]/g, "").replace("T", "_").replace("Z", "")
    const key = `reports/${studentId}/${subjectId}/${safeDate}_${stamp}.pdf`
    const body = Buffer.from(pdfBase64, "base64")
    await uploadPdfToR2({ bucket, key, body })

    const reportUrl = `${baseUrl.replace(/\/$/, "")}/${key}`

    await createReportRow({
      studentId,
      subjectId,
      dateStr: safeDate,
      reportUrl,
    })

    return res.status(200).json({ reportUrl })
  } catch (err) {
    console.error("Report upload error:", err)
    return res.status(500).json({ error: "Failed to upload report" })
  }
}
