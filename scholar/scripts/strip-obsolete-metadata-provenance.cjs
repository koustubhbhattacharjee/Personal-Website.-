#!/usr/bin/env node
// One-shot cleanup AFTER migration 019.
//
// Removes the now-obsolete provenance copies from questions.metadata:
//   - metadata.textbook_key       (was the broken backfill copy)
//   - metadata.source_reference   (was a workbook-era duplicate)
//
// Both are superseded by the canonical jsonb column source_reference, which
// is what the Sources Studio API now filters on.
//
// Mastery tables (student_question_types, student_question_attempts) are NOT
// touched — only the questions table.
//
// Idempotent — only writes when one of the keys is present.
//
// Usage:
//   node scripts/strip-obsolete-metadata-provenance.cjs           # dry-run
//   node scripts/strip-obsolete-metadata-provenance.cjs --apply   # write

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
  const rows = await selectAll(`questions?select=id,metadata`)
  console.log(`questions scanned: ${rows.length}`)
  let touched = 0, alreadyClean = 0
  for (const r of rows) {
    const meta = r.metadata || {}
    const hadTk = "textbook_key" in meta
    const hadSr = "source_reference" in meta
    if (!hadTk && !hadSr) { alreadyClean++; continue }
    const { textbook_key, source_reference, ...remaining } = meta
    if (APPLY) {
      await rest("PATCH", `questions?id=eq.${r.id}`, { metadata: remaining })
    }
    touched++
  }
  console.log(`already clean: ${alreadyClean}`)
  console.log(`${APPLY ? "stripped" : "would strip"}: ${touched}`)
  if (!APPLY) console.log("\n(dry-run — re-run with --apply to write)")
})().catch((e) => { console.error(e); process.exit(1) })
