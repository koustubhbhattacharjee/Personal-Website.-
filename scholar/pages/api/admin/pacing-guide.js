import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getSubjectById } from "../../../lib/db"
import { resolvePacingEntries, savePacingGuide } from "../../../lib/pacing-guide"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const params = req.method === "GET" ? req.query : (req.body || {})
  const { subjectId, studentId, studentState } = params
  if (!subjectId) return res.status(400).json({ error: "Missing subjectId" })
  if (!studentId) return res.status(400).json({ error: "Missing studentId" })

  // ── GET — load pacing guide (overlay or taxonomy fallback) ──
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store")

    const subject = await getSubjectById(subjectId)
    if (!subject) return res.status(404).json({ error: "Subject not found" })

    const pacing = await resolvePacingEntries({ subjectId, studentId })

    if (pacing.locked) {
      return res.status(200).json({
        locked: true,
        subjectId,
        studentId,
        subjectName: subject.name,
        entries: [],
        source: "none",
      })
    }

    return res.status(200).json({
      locked:      false,
      subjectId,
      studentId,
      subjectName: subject.name,
      entries:     pacing.entries,
      updatedAt:   pacing.updatedAt || null,
      isDefault:   pacing.isDefault,
      source:      pacing.source,
    })
  }

  // ── POST — save section order + skips ──
  if (req.method === "POST") {
    const { entries } = req.body || {}
    console.log("[pacing-guide POST] studentId:", studentId, "subjectId:", subjectId, "entries count:", Array.isArray(entries) ? entries.length : typeof entries)
    if (!Array.isArray(entries)) return res.status(400).json({ error: "entries must be an array" })
    console.log("[pacing-guide POST] first entry sample:", JSON.stringify(entries[0] || null))

    const subject = await getSubjectById(subjectId)
    console.log("[pacing-guide POST] subject found:", subject?.name || null)
    if (!subject) return res.status(404).json({ error: "Subject not found" })

    try {
      const result = await savePacingGuide(studentId, subjectId, entries)
      console.log("[pacing-guide POST] save succeeded")
      return res.status(200).json({ ok: true, ...result })
    } catch (err) {
      console.error("[pacing-guide POST] save failed:", err.message, err.payload || "")
      return res.status(500).json({ error: err.message || "Save failed" })
    }
  }

  return res.status(405).end()
}
