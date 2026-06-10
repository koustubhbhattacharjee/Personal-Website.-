// For each entry in scripts/u2-image-manifest.json, prepend an image item
// (no `url`) to the question's `question_content`. Then run
// `scripts/hydrate-db-question-images.mjs` to crop, upload to R2, and PATCH
// the rows so the image items get URLs.
//
// Usage:
//   node scripts/insert-u2-image-stubs.mjs            # dry-run
//   node scripts/insert-u2-image-stubs.mjs --apply    # write
// Idempotent: skips a row that already has an image item with the same
// (page, bbox).

import fs from "node:fs"
import path from "node:path"

const APPLY = process.argv.includes("--apply")

const envText = fs.readFileSync(path.resolve(".env.local"), "utf8")
for (const line of envText.split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY

async function rest(method, p, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "GET" ? "" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok && method !== "GET") throw new Error(`${method} ${p} ${r.status}: ${await r.text()}`)
  if (method === "GET") return r.json()
}

const manifest = JSON.parse(fs.readFileSync("scripts/u2-image-manifest.json", "utf8"))
console.log(`Loaded ${manifest.entries.length} entries. Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`)

let inserted = 0, skipped = 0, missing = 0

for (const e of manifest.entries) {
  const rows = await rest("GET", `questions?select=id,question_content,source_file,source_page,metadata&metadata->>source_id=eq.${encodeURIComponent(e.source_id)}`)
  if (!rows.length) { console.log(`  MISS ${e.source_id}`); missing++; continue }
  const r = rows[0]
  const qc = Array.isArray(r.question_content) ? r.question_content : []
  // Skip if already an image item with same (page, bbox).
  const already = qc.some(it =>
    it?.type === "image" &&
    Number(it.page) === Number(e.page) &&
    Array.isArray(it.bbox) && it.bbox.length === 4 &&
    it.bbox.every((v, i) => Math.abs(Number(v) - e.bbox[i]) < 1e-6)
  )
  if (already) { console.log(`  SKIP ${e.source_id} (already has image item)`); skipped++; continue }

  const item = {
    type: "image",
    page: e.page,
    bbox: e.bbox,
    alt: e.alt || "",
    caption: e.caption || "",
  }
  // Prepend so the figure renders above the stem (matches "shown above" phrasing).
  const newQc = [item, ...qc]
  const patch = {
    question_content: newQc,
    source_page: r.source_page ?? e.page,
  }
  console.log(`  INSERT ${e.source_id.padEnd(14)} page=${e.page} bbox=[${e.bbox.join(",")}]`)
  if (APPLY) {
    await rest("PATCH", `questions?id=eq.${r.id}`, patch)
    inserted++
  }
}

console.log(`\nDone. inserted=${inserted}, skipped=${skipped}, missing=${missing}`)
console.log(APPLY ? "\nNext: run scripts/hydrate-db-question-images.mjs --pdf 'data/AP Physics 1/WORKBOOK 1 FULL (1).pdf'" : "(dry-run — pass --apply to write)")
