// Re-crop a single image bbox on a single question and upload the new PNG
// to R2. Used by the Sources admin tab when an admin drags a bbox and hits
// "Save & re-crop" — the server runs the cropper itself instead of telling
// the admin to ssh in and run a script.
//
// Inputs:
//   - source row (textbook_key, pdf_storage_key)  → so we can fetch the PDF
//   - question row (id, question_content, stem_header_content)
//   - location  ("question_content" | "stem_header_content")
//   - imageIndex (number)
//   - bbox      [x0, y0, x1, y1] normalized, top-left origin
//   - subjectSlug (optional) — defaults to a slug derived from textbook_key
//
// Output:
//   { url, storageKey, width, height }
//
// Side effects:
//   1. Spawns scripts/crop_pdf_regions.py (PyMuPDF) to crop one region.
//   2. Uploads the cropped PNG to R2 at question-images/<subjectSlug>/<sha>.png
//      (sha-keyed so identical bboxes dedupe across reruns).
//   3. PATCHes the question row so the image item now carries the new url.

import { spawn } from "node:child_process"
import path from "node:path"
import crypto from "node:crypto"
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"

function getS3() {
  const endpoint =
    process.env.R2_ENDPOINT ||
    (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null)
  if (!endpoint || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 credentials not configured (R2_ENDPOINT/R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)")
  }
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

function r2BaseUrl() {
  return String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "")
}

async function r2GetBuffer(s3, bucket, key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const chunks = []
  for await (const chunk of res.Body) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function r2HasObject(s3, bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (err) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return false
    return false
  }
}

function pythonCrop({ pdfBase64, page, bbox, dpi }) {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd()
    const child = spawn("python3", [path.join(cwd, "scripts", "crop_pdf_regions.py")], { cwd })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (c) => { stdout += c.toString() })
    child.stderr.on("data", (c) => { stderr += c.toString() })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `crop_pdf_regions exited ${code}`))
      try {
        const parsed = JSON.parse(stdout || "{}")
        resolve(parsed)
      } catch (e) {
        reject(new Error(`Could not parse cropper output: ${e.message}`))
      }
    })
    child.stdin.write(JSON.stringify({
      pdfBase64,
      dpi: dpi || 200,
      crops: [{ id: "c0", page, bbox }],
    }))
    child.stdin.end()
  })
}

// Derive a subject slug to keep PNG paths consistent with existing layout.
// 1. If the existing image item has a url like
//      https://<base>/question-images/<slug>/<sha>.png
//    reuse <slug>.
// 2. Otherwise, slugify the textbook_key.
export function subjectSlugFor({ existingUrl, textbookKey }) {
  if (existingUrl) {
    const m = String(existingUrl).match(/\/question-images\/([^/]+)\//)
    if (m) return m[1]
  }
  return String(textbookKey || "default")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default"
}

export async function recropQuestionImage({
  pdfStorageKey,
  questionId,
  questionContent,
  stemHeaderContent,
  location,
  imageIndex,
  bbox,
  pageOverride,        // optional: the cross-page drag may have moved this
                       // image to a new page; if set, crop from there and
                       // also stamp the new page onto the image item.
  subjectSlug,
  textbookKey,
  dpi = 200,
}) {
  if (location !== "question_content" && location !== "stem_header_content") {
    throw new Error(`location must be question_content or stem_header_content, got ${location}`)
  }
  if (!Array.isArray(bbox) || bbox.length !== 4) throw new Error("bbox must be a 4-tuple")
  const arr = location === "question_content"
    ? (Array.isArray(questionContent) ? [...questionContent] : [])
    : (Array.isArray(stemHeaderContent) ? [...stemHeaderContent] : [])
  const item = arr[imageIndex]
  if (!item || item.type !== "image") {
    throw new Error(`No image item at ${location}[${imageIndex}]`)
  }
  const page = pageOverride != null ? Number(pageOverride) : Number(item.page)
  if (!page) throw new Error(`Image item is missing page number — cannot re-crop`)

  const bucket = process.env.R2_BUCKET
  if (!bucket) throw new Error("R2_BUCKET not configured")
  const baseUrl = r2BaseUrl()
  if (!baseUrl) throw new Error("R2_PUBLIC_BASE_URL not configured")
  if (!pdfStorageKey) throw new Error("source.pdf_storage_key is empty — cannot fetch the PDF to crop from")

  // 1. Pull PDF from R2
  const s3 = getS3()
  const pdfBuf = await r2GetBuffer(s3, bucket, pdfStorageKey)
  const pdfBase64 = pdfBuf.toString("base64")

  // 2. Crop just this region
  const cropResult = await pythonCrop({ pdfBase64, page, bbox, dpi })
  if (!Array.isArray(cropResult.crops) || !cropResult.crops.length) {
    const errMsg = cropResult.errors?.[0]?.error || "Cropper returned no result"
    throw new Error(errMsg)
  }
  const c0 = cropResult.crops[0]
  if (!c0?.pngBase64) throw new Error("Cropper returned no PNG data")
  const png = Buffer.from(c0.pngBase64, "base64")

  // 3. Upload to R2 (sha-keyed for idempotent dedupe)
  const slug = subjectSlug || subjectSlugFor({ existingUrl: item.url, textbookKey })
  const sha = crypto.createHash("sha256").update(png).digest("hex")
  const objectKey = `question-images/${slug}/${sha}.png`
  const url = `${baseUrl}/${objectKey}`

  if (!(await r2HasObject(s3, bucket, objectKey))) {
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: png,
      ContentType: "image/png",
    }))
  }

  // 4. Patch the array (caller persists the row). If the page changed via a
  //    cross-page drag, stamp the new page onto the image item too.
  arr[imageIndex] = {
    ...item,
    url,
    bbox: bbox.map(Number),
    ...(pageOverride != null ? { page: Number(pageOverride) } : {}),
  }

  return {
    arr,
    location,
    url,
    storageKey: objectKey,
    width: c0.width || null,
    height: c0.height || null,
  }
}
