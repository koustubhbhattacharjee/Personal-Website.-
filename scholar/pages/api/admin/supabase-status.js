import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getSupabaseHealth } from "../../../lib/supabase"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })

  const session = await getServerSession(req, res, authOptions)
  if (!session || String(session.user?.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  try {
    const status = await getSupabaseHealth()
    return res.status(status.ok ? 200 : 207).json(status)
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Supabase status failed" })
  }
}
