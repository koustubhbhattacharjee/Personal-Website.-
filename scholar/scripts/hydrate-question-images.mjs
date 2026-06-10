// scripts/hydrate-question-images.mjs
// Parse "Page N bbox [x0,y0,x1,y1] — caption" strings in a question-bank JSON,
// crop those regions from the source PDF, upload to R2, and rewrite the JSON
// so `candidate_image_refs` contains real URLs.
//
// Usage:
//   node scripts/hydrate-question-images.mjs \
//     --pdf "/abs/path/to/source.pdf" \
//     --json docs/taxonomy/sc-precalculus-question-bank.json \
//     [--subject-slug sc-precalculus] \
//     [--out docs/taxonomy/sc-precalculus-question-bank.hydrated.json] \
//     [--report docs/taxonomy/sc-precalculus-question-bank.hydration-report.json] \
//     [--dpi 200] \
//     [--dry-run]

import { readFileSync, writeFileSync, existsSync } from "fs"
import crypto from "crypto"
import path from "path"
import { spawn } from "child_process"
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"

function parseEnvFile(file) {
  const text = readFileSync(file, "utf8")
  const out = {}
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const idx = trimmed.indexOf("=")
    out[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  return out
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (!flag.startsWith("--")) continue
    const key = flag.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith("--")) {
      args[key] = next
      i += 1
    } else {
      args[key] = true
    }
  }
  return args
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const PROSE_REF_RE = /^\s*Page\s+(\d+)\s+bbox\s*\[\s*([-\d.\s,]+)\s*\]\s*(?:[—–-]\s*(.*))?$/i

function parseRef(str) {
  if (typeof str !== "string") return null
  const match = str.match(PROSE_REF_RE)
  if (!match) return null
  const page = Number(match[1])
  const nums = match[2].split(/[,\s]+/).filter(Boolean).map(Number)
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) return null
  return {
    page,
    bbox: nums,
    caption: (match[3] || "").trim(),
    original: str,
  }
}

async function cropViaPython({ pdfBase64, crops, dpi }) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["scripts/crop_pdf_regions.py"], { cwd: process.cwd() })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk.toString() })
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `crop_pdf_regions exited with code ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout || "{}"))
      } catch (err) {
        reject(new Error(`Failed to parse crop output: ${err.message}`))
      }
    })
    child.stdin.write(JSON.stringify({ pdfBase64, crops, dpi }))
    child.stdin.end()
  })
}

function buildS3Client(env) {
  const endpoint = env.R2_ENDPOINT || (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null)
  if (!endpoint || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error("Missing R2 credentials in .env.local (R2_ENDPOINT or R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)")
  }
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  })
}

async function objectExists(client, bucket, key) {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (err) {
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) return false
    return false
  }
}

function normalizeBaseUrl(raw) {
  const base = String(raw || "").trim().replace(/\/+$/, "")
  if (!base) return ""
  return /^https?:\/\//i.test(base) ? base : `https://${base}`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.pdf || !args.json) {
    console.error("Usage: node scripts/hydrate-question-images.mjs --pdf <path> --json <path> [--subject-slug <slug>] [--out <path>] [--report <path>] [--dpi 200] [--dry-run]")
    process.exit(1)
  }

  const env = parseEnvFile(path.join(process.cwd(), ".env.local"))
  const bucket = env.R2_BUCKET
  if (!bucket) throw new Error("R2_BUCKET not set in .env.local")
  const baseUrl = normalizeBaseUrl(env.R2_PUBLIC_BASE_URL)
  if (!baseUrl) throw new Error("R2_PUBLIC_BASE_URL not set in .env.local")

  const dpi = Number(args.dpi || 200)
  const dryRun = Boolean(args["dry-run"])

  const jsonPath = path.resolve(args.json)
  const pdfPath = path.resolve(args.pdf)
  if (!existsSync(jsonPath)) throw new Error(`JSON not found: ${jsonPath}`)
  if (!existsSync(pdfPath)) throw new Error(`PDF not found: ${pdfPath}`)

  const bank = JSON.parse(readFileSync(jsonPath, "utf8"))
  const subjectSlug = slugify(args["subject-slug"] || bank.subject || "unknown")

  // Collect all refs with in-place handles so we can rewrite later.
  const entries = []
  const qts = Array.isArray(bank.question_types) ? bank.question_types : []
  for (let qi = 0; qi < qts.length; qi++) {
    const qt = qts[qi]
    const questions = Array.isArray(qt?.questions) ? qt.questions : []
    for (let ii = 0; ii < questions.length; ii++) {
      const q = questions[ii]
      const refs = Array.isArray(q?.candidate_image_refs) ? q.candidate_image_refs : []
      for (let ri = 0; ri < refs.length; ri++) {
        const ref = refs[ri]
        const parsed = parseRef(ref)
        entries.push({
          qtIndex: qi,
          questionIndex: ii,
          refIndex: ri,
          original: ref,
          parsed,
          section: qt?.section_ref || "",
          exerciseRef: q?.source_reference?.exercise_ref || "",
        })
      }
    }
  }

  const parsedEntries = entries.filter((e) => e.parsed)
  const unparsed = entries.filter((e) => !e.parsed)

  console.log(`[hydrate] total refs: ${entries.length}`)
  console.log(`[hydrate] parsed:     ${parsedEntries.length}`)
  console.log(`[hydrate] unparsed:   ${unparsed.length}`)

  // Dedup crops by page + bbox (rounded to 3 decimals).
  const cropKey = (p) => `${p.parsed.page}|${p.parsed.bbox.map((n) => n.toFixed(3)).join(",")}`
  const uniqueCrops = new Map()
  for (const entry of parsedEntries) {
    const key = cropKey(entry)
    if (!uniqueCrops.has(key)) {
      uniqueCrops.set(key, {
        id: `c${uniqueCrops.size}`,
        page: entry.parsed.page,
        bbox: entry.parsed.bbox,
      })
    }
  }
  console.log(`[hydrate] unique crops: ${uniqueCrops.size}`)

  if (uniqueCrops.size === 0) {
    console.log("[hydrate] nothing to do")
    return
  }

  const pdfBase64 = readFileSync(pdfPath).toString("base64")
  console.log(`[hydrate] cropping PDF pages via PyMuPDF...`)
  const { crops: cropResults = [], errors: cropErrors = [] } = await cropViaPython({
    pdfBase64,
    crops: Array.from(uniqueCrops.values()),
    dpi,
  })
  if (cropErrors.length) {
    console.warn(`[hydrate] ${cropErrors.length} crop errors`)
    for (const err of cropErrors.slice(0, 5)) console.warn(`  - ${err.id}: ${err.error}`)
  }

  // Map crop.id -> { sha, pngBase64 }
  const cropById = new Map()
  for (const c of cropResults) {
    const png = Buffer.from(c.pngBase64, "base64")
    const sha = crypto.createHash("sha256").update(png).digest("hex")
    cropById.set(c.id, { png, sha, width: c.width, height: c.height })
  }

  // Upload unique crops to R2 (skip HEAD-match).
  const s3 = buildS3Client(env)
  const urlByCropId = new Map()
  let uploaded = 0
  let skipped = 0
  for (const [key, crop] of uniqueCrops.entries()) {
    const data = cropById.get(crop.id)
    if (!data) continue
    const objectKey = `question-images/${subjectSlug}/${data.sha}.png`
    const url = `${baseUrl}/${objectKey}`
    urlByCropId.set(crop.id, { url, sha: data.sha, key: objectKey, width: data.width, height: data.height })
    if (dryRun) continue
    const exists = await objectExists(s3, bucket, objectKey)
    if (exists) {
      skipped += 1
      continue
    }
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: data.png,
      ContentType: "image/png",
    }))
    uploaded += 1
    if (uploaded % 25 === 0) console.log(`  uploaded ${uploaded}/${uniqueCrops.size}...`)
  }
  console.log(`[hydrate] uploaded: ${uploaded} (skipped already-present: ${skipped})${dryRun ? " [dry-run]" : ""}`)

  // Build hydration report and rewrite JSON in memory.
  const report = {
    subject: bank.subject,
    subjectSlug,
    pdf: pdfPath,
    json: jsonPath,
    dpi,
    counts: {
      totalRefs: entries.length,
      parsed: parsedEntries.length,
      unparsed: unparsed.length,
      uniqueCrops: uniqueCrops.size,
      uploaded,
      skippedExisting: skipped,
      cropErrors: cropErrors.length,
    },
    unparsed: unparsed.map((e) => ({
      qtIndex: e.qtIndex,
      questionIndex: e.questionIndex,
      refIndex: e.refIndex,
      original: e.original,
    })),
    cropErrors,
    entries: [],
  }

  for (const entry of parsedEntries) {
    const key = cropKey(entry)
    const crop = uniqueCrops.get(key)
    const uploaded = crop ? urlByCropId.get(crop.id) : null
    if (uploaded) {
      bank.question_types[entry.qtIndex].questions[entry.questionIndex].candidate_image_refs[entry.refIndex] = uploaded.url
    }
    report.entries.push({
      qtIndex: entry.qtIndex,
      questionIndex: entry.questionIndex,
      refIndex: entry.refIndex,
      section: entry.section,
      exerciseRef: entry.exerciseRef,
      page: entry.parsed.page,
      bbox: entry.parsed.bbox,
      caption: entry.parsed.caption,
      original: entry.original,
      url: uploaded?.url || null,
      sha256: uploaded?.sha || null,
      width: uploaded?.width || null,
      height: uploaded?.height || null,
      status: uploaded ? "ok" : "cropFail",
    })
  }

  if (dryRun) {
    console.log("[hydrate] dry-run: not writing files")
  } else {
    const outPath = args.out
      ? path.resolve(args.out)
      : jsonPath.replace(/\.json$/i, ".hydrated.json")
    const reportPath = args.report
      ? path.resolve(args.report)
      : jsonPath.replace(/\.json$/i, ".hydration-report.json")
    writeFileSync(outPath, JSON.stringify(bank, null, 2))
    writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`[hydrate] wrote hydrated JSON: ${outPath}`)
    console.log(`[hydrate] wrote report:        ${reportPath}`)
  }
}

main().catch((err) => {
  console.error("[hydrate] fatal:", err?.stack || err?.message || err)
  process.exit(1)
})
