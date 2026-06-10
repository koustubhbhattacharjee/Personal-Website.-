#!/usr/bin/env node
// One-shot consolidation paired with migration 019.
//
// Some questions have provenance written into metadata.source_reference (by
// scripts/backfill-workbook-mcq-pages.cjs and similar) but a NULL
// source_reference column. The Sources Studio API filters on the canonical
// jsonb column — until those rows are backfilled they're invisible to it.
// Copy their data into the column.
//
// Strategy per question:
//   - Skip if source_reference column already populated.
//   - If metadata.source_reference exists, copy it to source_reference. If
//     metadata.source_reference lacks textbook_key but metadata.textbook_key
//     is set, splice it in.
//   - If neither exists, leave alone.
//
// Idempotent — only writes when column is null and metadata has data.
//
// Usage:
//   node scripts/consolidate-source-reference.cjs            # dry-run
//   node scripts/consolidate-source-reference.cjs --apply    # write

const fs = require("fs"), path = require("path")
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

async function rest(method, p, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    method,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${await r.text()}`)
}

async function selectAll(qs) {
  let offset = 0, all = []
  for (;;) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${qs}&limit=1000&offset=${offset}`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
    const rows = await r.json()
    all = all.concat(rows)
    if (rows.length < 1000) break
    offset += rows.length
  }
  return all
}

;(async () => {
  // Pull every question with a null source_reference but with metadata.
  const rows = await selectAll(`questions?select=id,source_reference,metadata&source_reference=is.null`)
  console.log(`questions with null source_reference: ${rows.length}`)
  let candidates = 0, copied = 0, skipped = 0
  for (const r of rows) {
    const meta = r.metadata || {}
    const metaSr = meta.source_reference
    const metaTk = meta.textbook_key
    if (!metaSr || typeof metaSr !== "object") { skipped++; continue }
    candidates++
    const newRef = { ...metaSr }
    if (!newRef.textbook_key && metaTk) newRef.textbook_key = metaTk
    if (!newRef.textbook_key) { skipped++; continue }
    console.log(`  ${APPLY ? "COPY" : "WOULD COPY"} ${r.id} ← textbook_key=${newRef.textbook_key} page=${newRef.page ?? "—"}`)
    if (APPLY) {
      await rest("PATCH", `questions?id=eq.${r.id}`, { source_reference: newRef })
      copied++
    }
  }
  console.log(`\ncandidates with metadata.source_reference: ${candidates}`)
  console.log(`copied to column: ${copied}`)
  console.log(`skipped (no usable provenance): ${skipped}`)
  if (!APPLY) console.log("\n(dry-run — re-run with --apply to write)")
})().catch((e) => { console.error(e); process.exit(1) })
