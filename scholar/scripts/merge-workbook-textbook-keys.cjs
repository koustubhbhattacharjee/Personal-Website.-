#!/usr/bin/env node
// One-shot key consolidation. Two textbook_keys ended up tagged on questions
// from the SAME book (AP Physics 1 Practice Workbook — Book 1):
//   - ap_phys1_workbook_book1          (newer, no source row)
//   - tutor_ap1_workbook_book1_2014    (canonical, has source row + PDF)
//
// Re-tag every question on the loser key to the canonical key, leaving all
// other source_reference fields (page, exercise_ref, section, worksheet_name)
// untouched.
//
// Idempotent — only writes when textbook_key actually differs.
//
// Usage:
//   node scripts/merge-workbook-textbook-keys.cjs           # dry-run
//   node scripts/merge-workbook-textbook-keys.cjs --apply   # write

const fs = require("fs"), path = require("path")
const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1")
  }
}

const APPLY = process.argv.includes("--apply")
const FROM_KEY = "ap_phys1_workbook_book1"
const TO_KEY   = "tutor_ap1_workbook_book1_2014"

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
  const rows = await selectAll(
    `questions?select=id,source_reference&source_reference->>textbook_key=eq.${encodeURIComponent(FROM_KEY)}`
  )
  console.log(`questions tagged ${FROM_KEY}: ${rows.length}`)
  let migrated = 0
  for (const r of rows) {
    const sr = r.source_reference || {}
    const newSr = { ...sr, textbook_key: TO_KEY }
    console.log(`  ${APPLY ? "MIGRATE" : "WOULD MIGRATE"} ${r.id}  page=${sr.page ?? "—"}  exercise_ref=${JSON.stringify(sr.exercise_ref ?? "")}`)
    if (APPLY) {
      await rest("PATCH", `questions?id=eq.${r.id}`, { source_reference: newSr })
      migrated++
    }
  }
  console.log(`\n${APPLY ? "migrated" : "would migrate"}: ${APPLY ? migrated : rows.length}`)
  console.log(`from: ${FROM_KEY}`)
  console.log(`to:   ${TO_KEY}`)
  if (!APPLY) console.log("\n(dry-run — re-run with --apply to write)")

  // After migration, also confirm question_types don't carry the old key.
  const qts = await selectAll(
    `question_types?select=id,title,source_reference&source_reference->>textbook_key=eq.${encodeURIComponent(FROM_KEY)}`
  )
  if (qts.length) {
    console.log(`\nquestion_types still tagged ${FROM_KEY}: ${qts.length}`)
    for (const qt of qts) console.log(`  ${qt.id}  ${qt.title}`)
    console.log("(QTs not touched by this script — re-tag manually if any appear here.)")
  } else {
    console.log(`\nquestion_types tagged ${FROM_KEY}: 0`)
  }
})().catch((e) => { console.error(e); process.exit(1) })
