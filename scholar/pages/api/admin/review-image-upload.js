import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { uploadBinaryToR2 } from "../../../lib/r2"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export const config = {
  api: {
    bodyParser: { sizeLimit: "10mb" },
  },
}

function safeExt(name = "", contentType = "") {
  const lower = String(name).toLowerCase()
  if (lower.endsWith(".png") || contentType.includes("png")) return "png"
  if (lower.endsWith(".webp") || contentType.includes("webp")) return "webp"
  if (lower.endsWith(".gif") || contentType.includes("gif")) return "gif"
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg"
  return "png"
}

function mimeForExt(ext) {
  if (ext === "svg") return "image/svg+xml"
  if (ext === "png") return "image/png"
  if (ext === "webp") return "image/webp"
  if (ext === "gif") return "image/gif"
  if (ext === "jpg") return "image/jpeg"
  return "application/octet-stream"
}

function normalizeBaseUrl(raw, bucket) {
  let base = String(raw || "").trim()
  if (!base) {
    const accountId = process.env.R2_ACCOUNT_ID
    if (accountId && bucket) {
      base = `https://${bucket}.${accountId}.r2.dev`
    }
  }
  if (!base) return ""
  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base}`
  }
  try {
    const u = new URL(base)
    u.hash = ""
    u.search = ""
    u.pathname = u.pathname.replace(/\/+$/, "")
    return u.toString().replace(/\/$/, "")
  } catch {
    return ""
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })
  if ((session.user?.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  try {
    const { fileBase64, fileName, contentType, studentId, subjectId, svgText } = req.body || {}
    if ((!fileBase64 && !svgText) || !studentId || !subjectId) {
      return res.status(400).json({ error: "fileBase64 or svgText, plus studentId and subjectId are required" })
    }

    const bucket = process.env.R2_BUCKET
    const baseUrl = normalizeBaseUrl(process.env.R2_PUBLIC_BASE_URL, bucket)
    if (!bucket || !baseUrl) {
      return res.status(500).json({ error: "R2 public URL is not configured. Set R2_PUBLIC_BASE_URL (or enable <bucket>.<account>.r2.dev)." })
    }

    const ext = svgText ? "svg" : safeExt(fileName, contentType)
    const stamp = Date.now()
    const cleanStudent = String(studentId).replace(/[^a-zA-Z0-9_-]/g, "")
    const cleanSubject = String(subjectId).replace(/[^a-zA-Z0-9_-]/g, "")
    const key = `review-images/${cleanStudent}/${cleanSubject}/${stamp}.${ext}`

    const body = svgText ? Buffer.from(String(svgText), "utf8") : Buffer.from(fileBase64, "base64")
    await uploadBinaryToR2({
      bucket,
      key,
      body,
      contentType: svgText ? "image/svg+xml" : (contentType || mimeForExt(ext)),
    })

    const imageUrl = `${baseUrl}/${key}`
    if (!/^https?:\/\//i.test(imageUrl)) {
      return res.status(500).json({ error: "Generated image URL is invalid." })
    }
    return res.status(200).json({ ok: true, imageUrl, key })
  } catch (err) {
    console.error("review-image-upload error:", err)
    return res.status(500).json({ error: err.message || "Failed to upload image" })
  }
}
