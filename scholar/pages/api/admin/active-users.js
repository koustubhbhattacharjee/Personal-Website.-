import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { supabaseRest } from "../../../lib/supabase"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })
  if ((session?.user?.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const minutes = Math.max(1, Math.min(120, Number(req.query.minutes || 5)))
  const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString()

  const rows = await supabaseRest("user_presence", {
    query: {
      select: "id,user_key,role,email,student_id,student_name,route,section,subject_id,subject_name,mode,last_seen_at,updated_at",
      last_seen_at: `gte.${cutoff}`,
      order: "last_seen_at.desc",
      limit: 100,
    },
  }).catch((err) => {
    res.status(500).json({ error: err?.message || "Failed to load active users" })
    return null
  })

  if (!rows) return

  return res.status(200).json({
    activeUsers: Array.isArray(rows) ? rows : [],
    cutoff,
    minutes,
  })
}
