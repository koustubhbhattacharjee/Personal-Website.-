// Step 1: Redirect tutor to Google OAuth
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/admin/calendar-callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    prompt: "consent", // force refresh token
  })

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
}
