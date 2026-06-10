import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { runReinforcementBackfill } from "../../../lib/backfill"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { studentId, subjectId, dryRun = false } = req.body || {}
  if (!studentId || !subjectId) {
    return res.status(400).json({ error: "Missing studentId or subjectId." })
  }

  try {
    const result = await runReinforcementBackfill(studentId, subjectId, { dryRun })
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    console.error("[backfill-reinforcement] error:", err)
    return res.status(500).json({ error: err?.message || "Backfill failed." })
  }
}
