#!/usr/bin/env node
// Populate the public.sources table from the textbook_keys already stamped on
// existing questions, and upload any locally-available source PDFs to R2.
//
// What it does, per textbook_key found in questions.metadata:
//   1. Inspects a sources_file_map.json (next to this script) to see if a
//      local PDF has been associated with the key.
//   2. If so and the row's pdf_storage_key is empty, uploads the PDF to
//      R2 under sources/<textbook_key>/source.pdf.
//   3. Upserts a row in public.sources with label, pdf_url, page_count,
//      source_type, and a metadata block.
//
// Usage:
//   node scripts/populate-sources.cjs            # populate from current DB
//   node scripts/populate-sources.cjs --dry-run  # report only

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { execFileSync } = require("child_process")

const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

const DRY_RUN = process.argv.includes("--dry-run")

// --only=prefix1,prefix2  → only process textbook_keys starting with one of
// these prefixes. Use it to scope a run to a single subject.
const ONLY_ARG = process.argv.find((a) => a.startsWith("--only="))
const ONLY_PREFIXES = ONLY_ARG
  ? ONLY_ARG.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : null
function keyPasses(key) {
  if (!ONLY_PREFIXES) return true
  return ONLY_PREFIXES.some((p) => key.startsWith(p))
}

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local")
  process.exit(1)
}

const R2_BUCKET           = process.env.R2_BUCKET
const R2_PUBLIC_BASE_URL  = String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "")
const R2_ACCOUNT_ID       = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY

async function rest(p, opts = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${p}`
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  }
  if (opts.prefer) headers.Prefer = opts.prefer
  const res = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : [] } catch { data = text }
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${p} ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`)
  return data
}

// ── Map textbook_key → local PDF + label. Edit this file to register more.
// Falls back to empty if the file does not exist (then rows get pdf_url=null).
const MAP_PATH = path.join(__dirname, "sources_file_map.json")
const fileMap = fs.existsSync(MAP_PATH) ? JSON.parse(fs.readFileSync(MAP_PATH, "utf8")) : {}

// ── Pull every textbook_key currently referenced by a question or QT
async function collectKeysFromDb() {
  const keys = new Map()  // key -> { qtCount, qCount, sampleLabel, sampleSection }

  // Walk QTs first (their source_reference.textbook_key is canonical)
  const qts = await rest("question_types?select=id,title,source_label,source_reference,unit_label,content_bank_id&limit=10000")
  for (const qt of qts) {
    const k = qt.source_reference?.textbook_key
    if (!k) continue
    const entry = keys.get(k) || { qtCount: 0, qCount: 0, sampleLabel: "", source_type: "textbook", contentBanks: new Set() }
    entry.qtCount++
    entry.contentBanks.add(qt.content_bank_id)
    if (!entry.sampleLabel) entry.sampleLabel = qt.source_label || qt.unit_label || k
    if (qt.source_reference?.source_type) entry.source_type = qt.source_reference.source_type
    keys.set(k, entry)
  }

  // Seed any keys that exist in sources_file_map.json but haven't been
  // referenced by a QT or question yet — lets a fresh book get a source
  // card created before its first question lands.
  for (const k of Object.keys(fileMap)) {
    if (k.startsWith("_")) continue
    if (keys.has(k)) continue
    const mapped = fileMap[k]
    keys.set(k, {
      qtCount: 0, qCount: 0,
      sampleLabel: mapped.label || k,
      source_type: mapped.source_type || "external",
      contentBanks: new Set(),
    })
  }

  // Walk questions for keys QTs may have missed. After migration 019,
  // source_reference is jsonb (PostgREST returns it parsed) and is the
  // canonical home for per-question provenance.
  let offset = 0
  while (true) {
    const rows = await rest(`questions?select=id,source_reference&limit=1000&offset=${offset}`)
    if (!rows.length) break
    for (const q of rows) {
      const sr = q.source_reference || null
      const k = sr && sr.textbook_key
      if (!k) continue
      const entry = keys.get(k) || { qtCount: 0, qCount: 0, sampleLabel: sr.worksheet_name || k, source_type: "external", contentBanks: new Set() }
      entry.qCount++
      if (!entry.sampleLabel) entry.sampleLabel = sr.worksheet_name || k
      keys.set(k, entry)
    }
    if (rows.length < 1000) break
    offset += rows.length
  }
  return keys
}

// ── R2 upload via aws sdk
async function uploadToR2({ key, body, contentType }) {
  // Use @aws-sdk/client-s3 dynamically — the project already depends on it.
  const { S3Client, PutObjectCommand, HeadObjectCommand } = await import("@aws-sdk/client-s3")
  const endpoint = process.env.R2_ENDPOINT || (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null)
  if (!endpoint || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) throw new Error("R2 credentials missing")
  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  })
  // Skip upload if the object already exists.
  try {
    await client.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }))
    return { skipped: true }
  } catch (e) {
    if (e?.$metadata?.httpStatusCode !== 404 && e?.name !== "NotFound") {
      // not a 404 — surface the error
      console.warn(`[r2] head ${key}: ${e.message}`)
    }
  }
  await client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }))
  return { skipped: false }
}

function pageCountForPdf(pdfPath) {
  try {
    const out = execFileSync("pdfinfo", [pdfPath], { encoding: "utf8" })
    const m = out.match(/Pages:\s+(\d+)/)
    return m ? Number(m[1]) : null
  } catch { return null }
}

async function main() {
  const allKeys = await collectKeysFromDb()
  const keys = ONLY_PREFIXES
    ? new Map([...allKeys].filter(([k]) => keyPasses(k)))
    : allKeys
  console.log(`Found ${allKeys.size} distinct textbook_key(s) in DB; processing ${keys.size}${ONLY_PREFIXES ? ` (filtered by --only=${ONLY_PREFIXES.join(",")})` : ""}.\n`)

  for (const [key, info] of keys) {
    const mapped = fileMap[key] || null
    const hasPath = mapped && mapped.path
    const localExists = hasPath && fs.existsSync(mapped.path)
    let pdfStatus
    if (!mapped) pdfStatus = "(no mapping in scripts/sources_file_map.json)"
    else if (!hasPath) pdfStatus = "(no PDF — non-PDF source, e.g. EPUB)"
    else if (localExists) pdfStatus = `${mapped.path} [exists]`
    else pdfStatus = `${mapped.path} [MISSING]`
    console.log(`  ${key}`)
    console.log(`     QTs: ${info.qtCount}  Qs: ${info.qCount}  source_type: ${info.source_type}`)
    console.log(`     label: ${info.sampleLabel}`)
    console.log(`     local PDF: ${pdfStatus}`)
  }

  if (DRY_RUN) {
    console.log("\n(dry run — no uploads, no upserts)")
    return
  }

  for (const [key, info] of keys) {
    const mapped = fileMap[key] || null
    const localPath = mapped && fs.existsSync(mapped.path) ? mapped.path : null
    const storageKey = `sources/${key}/source.pdf`
    let pdfUrl = null
    let pageCount = null

    if (localPath && R2_BUCKET) {
      const pdfBytes = fs.readFileSync(localPath)
      const sha = crypto.createHash("sha256").update(pdfBytes).digest("hex").slice(0, 12)
      pageCount = pageCountForPdf(localPath)
      const result = await uploadToR2({ key: storageKey, body: pdfBytes, contentType: "application/pdf" })
      pdfUrl = R2_PUBLIC_BASE_URL ? `${R2_PUBLIC_BASE_URL}/${storageKey}` : null
      console.log(`  [r2] ${storageKey} ${result.skipped ? "(already in bucket)" : "uploaded"} sha=${sha} pages=${pageCount}`)
    } else if (mapped && !localPath) {
      console.log(`  [r2] ${key}: skipping upload, file not found at ${mapped.path}`)
    }

    const row = {
      textbook_key:    key,
      label:           (mapped?.label || info.sampleLabel || key).slice(0, 240),
      source_type:     mapped?.source_type || info.source_type || "external",
      pdf_url:         pdfUrl,
      pdf_storage_key: pdfUrl ? storageKey : null,
      page_count:      pageCount,
      metadata:        {
        qt_count_at_seed:        info.qtCount,
        question_count_at_seed:  info.qCount,
        content_bank_ids:        Array.from(info.contentBanks || []),
        ...(mapped?.metadata || {}),
      },
    }

    // Upsert: PostgREST + Prefer: resolution=merge-duplicates handles it.
    await rest("sources?on_conflict=textbook_key", {
      method: "POST",
      body: row,
      prefer: "resolution=merge-duplicates,return=minimal",
    })
    console.log(`  [db] upserted sources row for ${key}`)
  }

  console.log("\nDone.")
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1) })
