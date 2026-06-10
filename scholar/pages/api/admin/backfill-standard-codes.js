import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getObjectiveCodesForPrompt } from "../../../lib/district-taxonomy"
import { getSubjectById } from "../../../lib/db"
import { runStandardCodeBackfill } from "../../../lib/backfill"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { studentId, subjectId } = req.body || {}
  if (!studentId || !subjectId) {
    return res.status(400).json({ error: "Missing studentId or subjectId." })
  }

  try {
    // Quick guard: verify subject has a code taxonomy before spending Claude credits
    const subject = await getSubjectById(subjectId)
    const objectiveCodes = getObjectiveCodesForPrompt(null, subject.name || "")
    if (!objectiveCodes.length) {
      return res.status(400).json({ error: `No code-based taxonomy found for ${subject.name}.` })
    }

    const result = await runStandardCodeBackfill(studentId, subjectId)
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    console.error("Backfill standard codes error:", err)
    return res.status(500).json({ error: "Failed to backfill standard codes." })
  }
}
