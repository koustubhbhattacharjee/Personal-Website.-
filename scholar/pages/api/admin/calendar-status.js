import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }
  return res.status(200).json({ connected: !!process.env.TUTOR_GOOGLE_REFRESH_TOKEN })
}
