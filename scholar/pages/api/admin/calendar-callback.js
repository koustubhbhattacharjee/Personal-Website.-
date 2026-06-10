// Step 2: Handle OAuth callback, exchange code for refresh token
import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import fs from "fs"
import path from "path"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { code, error } = req.query
  if (error) return res.redirect("/admin?calendarError=" + error)
  if (!code) return res.redirect("/admin?calendarError=no_code")

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${process.env.NEXTAUTH_URL}/api/admin/calendar-callback`,
        grant_type: "authorization_code",
      })
    })

    const tokens = await tokenRes.json()

    if (!tokens.refresh_token) {
      return res.redirect("/admin?calendarError=no_refresh_token")
    }

    // Write refresh token to .env.local
    const envPath = path.join(process.cwd(), ".env.local")
    let envContent = fs.readFileSync(envPath, "utf8")

    if (envContent.includes("TUTOR_GOOGLE_REFRESH_TOKEN=")) {
      envContent = envContent.replace(
        /TUTOR_GOOGLE_REFRESH_TOKEN=.*/,
        `TUTOR_GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
      )
    } else {
      envContent += `\nTUTOR_GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`
    }

    fs.writeFileSync(envPath, envContent)

    res.redirect("/admin?calendarConnected=1")
  } catch (err) {
    console.error("Calendar callback error:", err)
    res.redirect("/admin?calendarError=token_exchange_failed")
  }
}
