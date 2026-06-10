// scripts/hydrate-db-question-images.mjs
// Walk every question + stem_header in a Supabase content bank, crop any
// image items that carry {page, bbox} but no url, upload the PNGs to R2,
// and PATCH the rows so the image items now have `url`.
//
// Usage:
//   node scripts/hydrate-db-question-images.mjs \
//     --pdf "/abs/path/source.pdf" \
//     [--bank 19522376-4b71-48a0-aa5c-845df3d6037d] \
//     [--subject-slug ap-physics-1] \
//     [--dpi 200] \
//     [--dry-run]
//
// Safe to rerun — dedupes crops by (page, bbox), uses sha256 as the R2 key,
// and HEADs the object so repeat runs skip uploads.
//
// NOTE: Python helper `scripts/crop_pdf_regions.py` handles the actual
// cropping (PyMuPDF). Make sure it runs: `pip install pymupdf`.

import { readFileSync, existsSync } from "fs"
import crypto from "crypto"
import path from "path"
import { spawn } from "child_process"
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"

const DEFAULT_BANK    = "19522376-4b71-48a0-aa5c-845df3d6037d"
const DEFAULT_SUBJECT = "ap-physics-1"

// ── env + args ────────────────────────────────────────────────────────────
function loadEnv(file) {
  const text = readFileSync(file, "utf8")
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (!flag.startsWith("--")) continue
    const key = flag.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith("--")) { out[key] = next; i++ }
    else out[key] = true
  }
  return out
}

// ── Supabase REST ─────────────────────────────────────────────────────────
let SUPABASE_URL, SUPABASE_KEY
async function rest(pathWithQuery, { method = "GET", body = null, prefer = null } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${pathWithQuery}`
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" }
  if (prefer) headers.Prefer = prefer
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : [] } catch { data = text }
  if (!res.ok) throw new Error(`${method} ${pathWithQuery} ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`)
  return data
}

// ── PDF cropper (same Python helper Content Studio uses) ──────────────────
function cropViaPython({ pdfBase64, crops, dpi }) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["scripts/crop_pdf_regions.py"], { cwd: process.cwd() })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (c) => { stdout += c.toString() })
    child.stderr.on("data", (c) => { stderr += c.toString() })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `crop_pdf_regions exited with code ${code}`))
      try { resolve(JSON.parse(stdout || "{}")) } catch (e) { reject(new Error(`parse crop output: ${e.message}`)) }
    })
    child.stdin.write(JSON.stringify({ pdfBase64, crops, dpi }))
    child.stdin.end()
  })
}

// ── R2 ────────────────────────────────────────────────────────────────────
function buildS3Client() {
  const endpoint = process.env.R2_ENDPOINT
    || (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null)
  if (!endpoint || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing R2 credentials (R2_ENDPOINT/R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)")
  }
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  })
}

async function objectExists(client, bucket, key) {
  try { await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key })); return true }
  catch (err) { if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return false; return false }
}

function normalizeBaseUrl(raw) {
  const base = String(raw || "").trim().replace(/\/+$/, "")
  if (!base) return ""
  return /^https?:\/\//i.test(base) ? base : `https://${base}`
}

// ── image walkers ─────────────────────────────────────────────────────────
const cropKey = (page, bbox) => `${page}|${bbox.map((n) => Number(n).toFixed(4)).join(",")}`

function collectImages(arr, out) {
  if (!Array.isArray(arr)) return
  for (const item of arr) {
    if (!item || item.type !== "image") continue
    if (item.url) continue
    const page = Number(item.page)
    const bbox = Array.isArray(item.bbox) && item.bbox.length === 4 ? item.bbox.map(Number) : null
    if (!page || !bbox) continue
    out.add(cropKey(page, bbox))
  }
}

function rewriteImages(arr, urlByKey) {
  if (!Array.isArray(arr)) return { changed: false, value: arr }
  let changed = false
  const out = arr.map((item) => {
    if (!item || item.type !== "image" || item.url) return item
    const page = Number(item.page)
    const bbox = Array.isArray(item.bbox) && item.bbox.length === 4 ? item.bbox.map(Number) : null
    if (!page || !bbox) return item
    const url = urlByKey.get(cropKey(page, bbox))
    if (!url) return item
    changed = true
    return { ...item, url }
  })
  return { changed, value: out }
}

// ── main ──────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.pdf) {
    console.error("Usage: node scripts/hydrate-db-question-images.mjs --pdf <path> [--bank <uuid>] [--subject-slug <slug>] [--dpi 200] [--dry-run]")
    process.exit(1)
  }
  const envPath = path.join(process.cwd(), ".env.local")
  if (existsSync(envPath)) loadEnv(envPath)

  SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
  SUPABASE_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")

  const bucket = process.env.R2_BUCKET
  if (!bucket) throw new Error("R2_BUCKET not set")
  const baseUrl = normalizeBaseUrl(process.env.R2_PUBLIC_BASE_URL)
  if (!baseUrl) throw new Error("R2_PUBLIC_BASE_URL not set")

  const pdfPath = path.resolve(args.pdf)
  if (!existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`)
  const bankId = args.bank || DEFAULT_BANK
  const subjectSlug = String(args["subject-slug"] || DEFAULT_SUBJECT).replace(/[^a-z0-9-]/gi, "-").toLowerCase()
  const dpi = Number(args.dpi || 200)
  const dryRun = Boolean(args["dry-run"])

  // 1. Fetch QTs → question ids
  const qts = await rest(`question_types?select=id&content_bank_id=eq.${bankId}&limit=10000`)
  if (!qts.length) { console.log("no QTs in bank"); return }
  const qtIds = qts.map((r) => r.id)

  // 2. Fetch questions (ordered_content + stem_header_content)
  const questions = []
  for (let i = 0; i < qtIds.length; i += 50) {
    const batch = qtIds.slice(i, i + 50)
    const rows = await rest(`questions?select=id,question_type_id,question_content,stem_header_content&question_type_id=in.(${batch.map((x) => `"${x}"`).join(",")})&limit=10000`)
    questions.push(...rows)
  }
  console.log(`[hydrate] bank ${bankId}: ${qts.length} QTs, ${questions.length} questions`)

  // 3. Collect unique crops
  const wanted = new Set()
  for (const q of questions) {
    collectImages(q.question_content, wanted)
    collectImages(q.stem_header_content, wanted)
  }
  if (!wanted.size) { console.log("no bbox-only images found — nothing to hydrate"); return }

  const cropList = []
  const cropIdByKey = new Map()
  let idx = 0
  for (const key of wanted) {
    const [pageStr, bboxStr] = key.split("|")
    const page = Number(pageStr)
    const bbox = bboxStr.split(",").map(Number)
    const id = `c${idx++}`
    cropIdByKey.set(key, id)
    cropList.push({ id, page, bbox })
  }
  console.log(`[hydrate] unique crops to produce: ${cropList.length}`)

  // 4. Crop via Python
  const pdfBase64 = readFileSync(pdfPath).toString("base64")
  console.log(`[hydrate] cropping ${cropList.length} regions @ ${dpi} dpi...`)
  const { crops: cropResults = [], errors: cropErrors = [] } = await cropViaPython({ pdfBase64, crops: cropList, dpi })
  if (cropErrors.length) {
    console.warn(`[hydrate] ${cropErrors.length} crop errors (first 5):`)
    for (const e of cropErrors.slice(0, 5)) console.warn(`  - ${e.id}: ${e.error}`)
  }

  // 5. Upload to R2 (keyed by content sha256 so reruns dedupe).
  const s3 = buildS3Client()
  const urlByKey = new Map()
  let uploaded = 0, skipped = 0
  for (const c of cropResults) {
    if (!c?.pngBase64) continue
    const keyEntry = [...cropIdByKey.entries()].find(([, id]) => id === c.id)
    if (!keyEntry) continue
    const [cropKeyStr] = keyEntry
    const png = Buffer.from(c.pngBase64, "base64")
    const sha = crypto.createHash("sha256").update(png).digest("hex")
    const objectKey = `question-images/${subjectSlug}/${sha}.png`
    const url = `${baseUrl}/${objectKey}`
    urlByKey.set(cropKeyStr, url)
    if (dryRun) continue
    if (await objectExists(s3, bucket, objectKey)) { skipped++; continue }
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: objectKey, Body: png, ContentType: "image/png" }))
    uploaded++
    if (uploaded % 20 === 0) console.log(`  uploaded ${uploaded}...`)
  }
  console.log(`[hydrate] uploaded ${uploaded}, reused ${skipped} existing${dryRun ? " [dry-run]" : ""}`)

  // 6. PATCH rows whose content changed
  let rowsPatched = 0
  for (const q of questions) {
    const qc = rewriteImages(q.question_content, urlByKey)
    const sh = rewriteImages(q.stem_header_content, urlByKey)
    if (!qc.changed && !sh.changed) continue
    const patch = {}
    if (qc.changed) patch.question_content = qc.value
    if (sh.changed) patch.stem_header_content = sh.value
    if (!dryRun) {
      await rest(`questions?id=eq.${q.id}`, { method: "PATCH", body: patch, prefer: "return=minimal" })
    }
    rowsPatched++
  }
  console.log(`[hydrate] rows patched: ${rowsPatched}${dryRun ? " [dry-run]" : ""}`)
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1) })
