import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { generateOneTimeShowcaseCode, getShowcaseStudentId, getShowcaseSubjectId } from "../../../lib/showcase"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "http"
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000"
  if (host) return `${proto}://${host}`.replace(/\/$/, "")
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "")
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL.replace(/\/$/, "")
  return `${proto}://${host}`
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })
  if ((session.user?.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  try {
    const showcaseStudentId = getShowcaseStudentId()
    const showcaseSubjectId = getShowcaseSubjectId()
    if (!showcaseStudentId) {
      return res.status(400).json({
        error: "Set SCHOLAR_SHOWCASE_STUDENT_ID in .env.local before generating showcase codes.",
      })
    }

    const { label = "", expiresHours = 72 } = req.body || {}
    const code = await generateOneTimeShowcaseCode({ label, expiresHours })
    const loginUrl = `${getBaseUrl(req)}/showcase/login?code=${encodeURIComponent(code.code)}`
    return res.status(200).json({
      ok: true,
      code: code.code,
      label: code.label,
      expiresAt: code.expiresAt,
      loginUrl,
      loginMode: "one_time_code",
      showcaseStudentId,
      showcaseSubjectId: showcaseSubjectId || null,
    })
  } catch (err) {
    console.error("showcase-code error", err)
    return res.status(500).json({ error: err.message || "Failed to generate showcase code" })
  }
}
