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

  const { studentId, questionKey } = req.query
  if (!studentId || !questionKey) return res.status(400).json({ error: "studentId and questionKey required" })

  const baseUrl = String(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/+$/, "")
  const key = `question-work/${studentId}/${questionKey}.png`
  const url = `${baseUrl}/${key}`

  // Verify the image exists by HEAD request
  try {
    const check = await fetch(url, { method: "HEAD" })
    if (!check.ok) return res.status(404).json({ error: "No scratch saved for this question" })
    return res.status(200).json({ ok: true, url })
  } catch {
    return res.status(404).json({ error: "No scratch saved for this question" })
  }
}
