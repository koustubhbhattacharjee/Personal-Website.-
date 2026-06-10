import { getStudentByEmail } from "../../../lib/db"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const key = req.query.key || ""
  if (key !== process.env.CRON_SECRET) {
    return res.status(403).json({ error: "Forbidden" })
  }
  const email = String(req.query.email || "").trim()
  if (!email) return res.status(400).json({ error: "email param required" })

  try {
    const student = await getStudentByEmail(email)
    return res.status(200).json({ email, student: student || null, wouldAllow: !!student })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
