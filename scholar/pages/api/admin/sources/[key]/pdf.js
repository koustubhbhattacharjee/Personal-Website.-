// GET /api/admin/sources/[key]/pdf
//
// Streams the source PDF from R2 through this same-origin API route. We do
// NOT redirect to R2's public URL because Firefox / strict-CORS browsers
// throw NetworkError when the cross-origin redirect target doesn't return
// permissive Access-Control-Allow-Origin headers (R2 bucket CORS config
// varies). Streaming is slightly slower than a CDN redirect but avoids the
// CORS variable entirely.
//
// We deliberately do NOT buffer the whole PDF — a 58MB workbook fully
// buffered was taking 21+ seconds and tripping Next.js's 4MB response cap.
// `responseLimit: false` + `Body.pipe(res)` keeps memory bounded.

import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"
import { supabaseSelect } from "../../../../../lib/supabase"
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

// Lift Next.js's default 4MB response cap. This route can serve 50MB+ PDFs
// when there's no public R2 URL configured.
export const config = {
  api: { responseLimit: false },
}

function r2Endpoint() {
  if (process.env.R2_ENDPOINT) return process.env.R2_ENDPOINT
  if (process.env.R2_ACCOUNT_ID) return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  return null
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    return res.status(405).json({ error: "Method not allowed" })
  }
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const key = String(req.query.key || "").trim()
  if (!key) return res.status(400).json({ error: "key required" })

  const rows = await supabaseSelect("sources", {
    select: "textbook_key,pdf_url,pdf_storage_key",
    filters: { textbook_key: key },
    limit: 1,
  })
  const row = rows[0]
  if (!row) return res.status(404).json({ error: "Source not found" })

  const bucket = process.env.R2_BUCKET
  if (!bucket) return res.status(500).json({ error: "R2_BUCKET not configured" })

  let storageKey = row.pdf_storage_key
  const publicBase = String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "")
  if (!storageKey && row.pdf_url) {
    if (publicBase && row.pdf_url.startsWith(publicBase + "/")) {
      storageKey = row.pdf_url.slice(publicBase.length + 1)
    }
  }
  if (!storageKey) return res.status(404).json({ error: "No PDF for this source — upload one first." })

  // Stream from R2 through this same-origin API route. We tried 302-
  // redirecting to R2's public URL for speed, but Firefox throws
  // NetworkError when the cross-origin response lacks the right CORS
  // headers. Streaming is slightly slower but bulletproof.
  const endpoint = r2Endpoint()
  if (!endpoint || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    return res.status(500).json({ error: "R2 credentials not configured" })
  }
  const s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
  let obj
  try {
    obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }))
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NoSuchKey") {
      return res.status(404).json({ error: "PDF not found in R2" })
    }
    return res.status(502).json({ error: "R2 fetch failed: " + (err?.message || String(err)) })
  }
  res.setHeader("Content-Type", obj.ContentType || "application/pdf")
  res.setHeader("Cache-Control", "private, max-age=300")
  if (obj.ContentLength) res.setHeader("Content-Length", String(obj.ContentLength))
  obj.Body.pipe(res).on("error", (err) => {
    console.error("[sources/pdf] stream error:", err)
    try { res.end() } catch {}
  })
}
