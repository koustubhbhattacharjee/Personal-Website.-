#!/usr/bin/env node
// Attach Barron's EPUB figure images to already-imported questions.
//
// What it does:
//   1. Open Barron's EPUB, build {filename → bytes, ext} index.
//   2. Walk the extracted Barron's questions (still carry [IMG src=...] markers).
//   3. For each marker, sha256 the image bytes, upload to R2 under
//      question-images/barrons-ap-phys1-2024/<sha>.<ext> (HEAD-check first).
//   4. Build a clean ordered_content: stem text minus markers + image items
//      with {type:"image", url, alt, page} + (for MCQs) the trailing options text.
//   5. PATCH the matching DB row's question_text + question_content.
//      Lookup by metadata->>source_id=eq.<source_id> from the extraction.
//
// Idempotent — re-uploads are HEAD-skipped; re-PATCHing is a no-op set.
//
// Usage:
//   node scripts/attach-barrons-images.cjs              # dry-run
//   node scripts/attach-barrons-images.cjs --apply      # write to R2 + DB

const fs = require("fs"), path = require("path"), crypto = require("crypto")

const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1")
  }
}

const APPLY = process.argv.includes("--apply")

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_BUCKET = process.env.R2_BUCKET
const R2_PUBLIC_BASE_URL = String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "")
const R2_ENDPOINT = process.env.R2_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null)
const R2_AK = process.env.R2_ACCESS_KEY_ID
const R2_SK = process.env.R2_SECRET_ACCESS_KEY
if (!SUPABASE_URL || !KEY) { console.error("Missing Supabase env"); process.exit(1) }
if (APPLY && (!R2_BUCKET || !R2_AK || !R2_SK || !R2_ENDPOINT || !R2_PUBLIC_BASE_URL)) {
  console.error("Missing R2 env (R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT/R2_ACCOUNT_ID, R2_PUBLIC_BASE_URL)")
  process.exit(1)
}

const EPUB_PATH = "data/AP Physics 1/AP Physics 1 Premium, 2024_ 4 Practice Tests + Comprehensive -- Kenneth Rideout, Jonathan Wolf -- 2022 -- Barrons Educational Services -- 9781506287942 -- 1cec5fd5947942332912c1fc887ba933 -- Anna’s Archive.epub"
const SLUG = "barrons-ap-phys1-2024"
const TEXTBOOK_KEY = "barrons_ap_phys1_premium_2024"
const QUESTIONS_JSON = "/tmp/all-extracted-questions.json"

async function rest(method, p, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    method,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

// ─── Read EPUB into memory once. EPUBs are ZIPs; Node has no built-in ZIP
// reader, but every relevant Node version has one in undici via fetch — so
// shell out to `unzip` via Bash.

const { execFileSync } = require("child_process")
function epubReadFile(epubPath, innerPath) {
  return execFileSync("unzip", ["-p", epubPath, innerPath], { maxBuffer: 50 * 1024 * 1024 })
}

// ─── R2 client (lazy)
let s3 = null
async function getS3() {
  if (s3) return s3
  const { S3Client } = await import("@aws-sdk/client-s3")
  s3 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_AK, secretAccessKey: R2_SK },
  })
  return s3
}
async function r2Has(key) {
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3")
  try { await (await getS3()).send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true }
  catch (e) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NotFound") return false; throw e }
}
async function r2Put(key, body, contentType) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3")
  await (await getS3()).send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }))
}

function extOf(name) { const m = name.match(/\.([a-zA-Z0-9]+)$/); return m ? m[1].toLowerCase() : "bin" }
function contentTypeFor(ext) {
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg"
       : ext === "png" ? "image/png"
       : ext === "svg" ? "image/svg+xml"
       : ext === "gif" ? "image/gif"
       : "application/octet-stream"
}

;(async () => {
  // 1. Load extracted questions and find Barron's items with image markers
  const all = JSON.parse(fs.readFileSync(QUESTIONS_JSON, "utf8"))
  const imgRe = /\[IMG(?:\s+src=([^\s\]]+))?(?:\s+alt=([^\]]+))?\]|\[IMG\s+alt=([^\]]+)\s+src=([^\s\]]+)\]/g

  const targets = []  // { source_id, page, kind, text, images:[{path, alt}] }
  for (const [chapter, lst] of Object.entries(all)) {
    if (!chapter.startsWith("barrons_")) continue
    for (const q of lst) {
      // Markers come in several shapes:
      //   [IMG src=X]
      //   [IMG src=X alt=Y]
      //   [IMG alt= src=X]   (empty alt before src — most common)
      //   [IMG alt=Y src=X]
      // Strategy: find every [IMG ...] block, then pull out src= and alt= attrs
      // independently — ordering and emptiness don't matter.
      const imgs = []
      const blocks = q.text.match(/\[IMG[^\]]*\]/g) || []
      for (const block of blocks) {
        const srcMatch = block.match(/src=([^\s\]]+)/)
        const altMatch = block.match(/alt=([^\s\]]*)/)
        if (!srcMatch) continue
        const src = srcMatch[1]
        const alt = altMatch ? altMatch[1].trim() : ""
        // ../images/fXXX.jpg → OEBPS/images/fXXX.jpg
        const inner = src.replace(/^\.\.\//, "OEBPS/")
        imgs.push({ path: inner, alt })
      }
      if (imgs.length === 0) continue
      const source_id = `${chapter}_q${q.num}${q.kind === "frq" ? "_frq" : ""}`
      targets.push({ source_id, num: q.num, page: q.page, kind: q.kind, raw: q.text, images: imgs })
    }
  }

  console.log(`Barron's questions with images: ${targets.length}`)
  const allImgs = new Set(targets.flatMap(t => t.images.map(i => i.path)))
  console.log(`distinct EPUB image refs: ${allImgs.size}`)

  // 2. For each unique image, read bytes and compute sha
  const imageBytes = new Map()  // innerPath → { sha, bytes, ext }
  for (const innerPath of allImgs) {
    let bytes
    try { bytes = epubReadFile(EPUB_PATH, innerPath) }
    catch (e) {
      console.warn(`  ! could not read ${innerPath}: ${e.message?.split("\n")[0] || e}`)
      continue
    }
    const sha = crypto.createHash("sha256").update(bytes).digest("hex")
    const ext = extOf(innerPath)
    imageBytes.set(innerPath, { sha, bytes, ext })
  }
  console.log(`successfully read ${imageBytes.size} image files from EPUB`)

  // 3. Upload to R2 (idempotent)
  let uploaded = 0, skipped = 0
  if (APPLY) {
    for (const [innerPath, info] of imageBytes) {
      const key = `question-images/${SLUG}/${info.sha}.${info.ext}`
      if (await r2Has(key)) { skipped++; continue }
      await r2Put(key, info.bytes, contentTypeFor(info.ext))
      uploaded++
    }
    console.log(`R2: uploaded ${uploaded}, already-present ${skipped}`)
  } else {
    console.log(`R2: would upload ${imageBytes.size} (after HEAD-check)`)
  }

  // 4. Fetch all Barron's questions in one shot, index by metadata.source_id.
  process.stdout.write("Fetching Barron's questions from DB... ")
  let allRows = [], offset = 0
  while (true) {
    const batch = await rest("GET", `questions?select=id,question_text,question_content,options,question_format,metadata&source_reference->>textbook_key=eq.${TEXTBOOK_KEY}&limit=1000&offset=${offset}`)
    if (!batch.length) break
    allRows = allRows.concat(batch)
    if (batch.length < 1000) break
    offset += batch.length
  }
  const bySourceId = new Map()
  for (const r of allRows) {
    const sid = r.metadata?.source_id
    if (sid) bySourceId.set(sid, r)
  }
  console.log(`got ${allRows.length} rows, ${bySourceId.size} have source_id`)

  // 5. PATCH each question with cleaned ordered_content + question_text
  let patched = 0, missing = 0, unchanged = 0
  for (const t of targets) {
    const row = bySourceId.get(t.source_id)
    if (!row) { missing++; console.log(`  ? not in DB: ${t.source_id}`); continue }
    // Build new ordered_content: image items first (placement="below" is fine
    // for now — admin can re-order in Sources Studio if needed), then stem text
    // (with markers stripped), then options block (for MCQ).
    const cleanedStem = String(row.question_text || "")
      .replace(/\[IMG\s+[^\]]*\]/g, "")
      .replace(/\s+/g, " ")
      .trim()
    const imgItems = []
    for (const im of t.images) {
      const info = imageBytes.get(im.path)
      if (!info) continue
      const url = `${R2_PUBLIC_BASE_URL}/question-images/${SLUG}/${info.sha}.${info.ext}`
      imgItems.push({
        type: "image",
        url,
        alt: im.alt || "",
        caption: "",
        page: t.page || null,
        placement: "above",
      })
    }
    if (imgItems.length === 0) { unchanged++; continue }
    const ordered = [...imgItems, { type: "text", value: cleanedStem }]
    if (row.question_format === "mcq" && Array.isArray(row.options) && row.options.length) {
      ordered.push({ type: "text", value: row.options.join("\n") })
    }
    if (APPLY) {
      await rest("PATCH", `questions?id=eq.${row.id}`, {
        question_text: cleanedStem,
        question_content: ordered,
      })
    }
    patched++
    console.log(`  ${APPLY ? "✓" : "·"} ${t.source_id}  (${imgItems.length} image${imgItems.length>1?"s":""})  page=${t.page ?? "—"}`)
  }
  console.log(`\n${APPLY ? "patched" : "would patch"}: ${patched} · not in DB: ${missing} · unchanged: ${unchanged}`)
  if (!APPLY) console.log("\n(dry-run — re-run with --apply)")
})().catch(e => { console.error("FAILED:", e.message); process.exit(1) })
