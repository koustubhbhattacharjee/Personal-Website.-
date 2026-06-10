import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getSessionByStudentSubjectDate, updateSessionArtifacts } from "../../../lib/db"
import { getLiveSessionNotes, saveLiveSessionNotes } from "../../../lib/live-session-notes"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  if (req.method === "GET") {
    const { studentId = "", subjectId = "", sessionDate = "" } = req.query || {}
    if (!studentId || !subjectId || !sessionDate) {
      return res.status(400).json({ error: "studentId, subjectId, and sessionDate are required" })
    }
    try {
      const notes = await getLiveSessionNotes({ studentId, subjectId, sessionDate })
      return res.status(200).json({ ok: true, notes: notes || null })
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to load session notes" })
    }
  }

  if (req.method === "POST") {
    const {
      studentId = "",
      subjectId = "",
      sessionDate = "",
      notesText = "",
      scene = null,
    } = req.body || {}

    if (!studentId || !subjectId || !sessionDate) {
      return res.status(400).json({ error: "studentId, subjectId, and sessionDate are required" })
    }

    try {
      const sessionRow = await getSessionByStudentSubjectDate(studentId, subjectId, sessionDate).catch(() => null)
      const notes = await saveLiveSessionNotes({
        studentId,
        subjectId,
        sessionDate,
        sessionId: sessionRow?.id || "",
        notesText,
        scene,
      })

      if (sessionRow?.id) {
        await updateSessionArtifacts(sessionRow.id, {
          "Session Notes": {
            rich_text: notes.notesText
              ? [{ text: { content: String(notes.notesText || "").slice(0, 1900) } }]
              : [],
          },
        })
      }

      return res.status(200).json({ ok: true, notes })
    } catch (err) {
      return res.status(500).json({ error: err.message || "Failed to save session notes" })
    }
  }

  return res.status(405).end()
}
