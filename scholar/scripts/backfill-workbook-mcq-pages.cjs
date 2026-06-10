#!/usr/bin/env node
// Backfill workbook page numbers + exercise_ref onto questions tagged with
// textbook_key = tutor_ap1_workbook_book1_2014. The original MCQ pack import
// had labels (e.g. "6", "B12") but no page or exercise_ref on the question's
// source_reference, so the Sources admin tab shows them as "p.?" and can't
// scroll to them.
//
// Page map below was extracted by reading the workbook's cached text under
// scripts/cache/ap-physics-1-text/workbook_1_full_1.json and grepping for
// numbered question lines. See `node -e ...` snippet in the parent commit.
//
// Usage:
//   node scripts/backfill-workbook-mcq-pages.cjs --dry-run
//   node scripts/backfill-workbook-mcq-pages.cjs

const fs = require("fs")
const path = require("path")

const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error("missing supabase env"); process.exit(1) }

const TEXTBOOK_KEY = "tutor_ap1_workbook_book1_2014"
const DRY = process.argv.includes("--dry-run")

// Section A — Dynamics MCQ (1..54). Workbook pages 41..51.
const SEC_A = {
  41: [1,2,3,4,5],
  42: [6,7,8,9],
  43: [10,11,12,13,14],
  44: [15,16,17,18],
  45: [19,20,21,22],
  46: [23,24,25,26,27],
  47: [28,29,30,31,32,33],
  48: [34,35,36,37,38,39],
  49: [40,41,42,43,44,45],
  50: [46,47,48,49,50,51],   // 46 sits on this page in the source even though the regex missed it
  51: [52,53,54],
}
// Section B — Circular Motion MCQ (B1..B29). Workbook pages 52..57.
const SEC_B = {
  52: [1,2,3,4,5],
  53: [6,7,8,9],
  54: [10,11,12,13],
  55: [14,15,16,17],
  56: [18,19,20,21,22,23],
  57: [24,25,26,27,28,29],
}

// Build label → {page, exercise_ref} map.
const labelMap = new Map()
for (const [page, nums] of Object.entries(SEC_A)) {
  for (const n of nums) labelMap.set(String(n), { page: Number(page), section: "Chapter 2 Dynamics — MCQ Section A", exercise_ref: `Question ${n}` })
}
for (const [page, nums] of Object.entries(SEC_B)) {
  for (const n of nums) labelMap.set(`B${n}`, { page: Number(page), section: "Chapter 2 — Section B Circular Motion (MCQ)", exercise_ref: `Section B Question ${n}` })
}

async function rest(p, opts = {}) {
  const res = await fetch(URL_ + "/rest/v1/" + p, {
    method: opts.method || "GET",
    headers: {
      apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json",
      ...(opts.prefer ? { Prefer: opts.prefer } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let data; try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${p} ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`)
  return data
}

;(async () => {
  // Pull every workbook-tagged question + its current source_reference.
  const rows = []
  let offset = 0
  while (true) {
    const batch = await rest(`questions?select=id,metadata,source_reference&source_reference->>textbook_key=eq.${encodeURIComponent(TEXTBOOK_KEY)}&limit=1000&offset=${offset}`)
    if (!batch.length) break
    rows.push(...batch)
    if (batch.length < 1000) break
    offset += batch.length
  }
  console.log(`Workbook-tagged questions in DB: ${rows.length}`)

  let touched = 0, alreadyOk = 0, noMap = 0
  const noMapLabels = new Set()
  for (const r of rows) {
    const label = r.metadata?.label
    // Read provenance from the canonical jsonb column (post-019).
    const sr = r.source_reference || {}
    const target = labelMap.get(String(label || ""))
    if (!target) {
      // The FRQ rows (e.g. "1982B2(b)i") aren't in this map and already
      // have correct page numbers from the FRQ seeder — leave them alone.
      if (!sr.page) {
        noMap++
        if (label) noMapLabels.add(String(label))
      }
      continue
    }
    // Skip if already accurate.
    if (sr.page === target.page && sr.exercise_ref) { alreadyOk++; continue }
    if (DRY) { touched++; continue }

    const newSr = {
      worksheet_name: sr.worksheet_name || "AP Physics 1 Workbook (1) — Ch. 2 Dynamics + Circular Motion FRQ Pack — 2026-04-28",
      textbook_key:   TEXTBOOK_KEY,
      page:           target.page,
      section:        sr.section || target.section,
      exercise_ref:   sr.exercise_ref || target.exercise_ref,
    }
    await rest(`questions?id=eq.${r.id}`, { method: "PATCH", body: { source_reference: newSr }, prefer: "return=minimal" })
    touched++
  }

  console.log(`\ntouched: ${touched}    already accurate: ${alreadyOk}    no map (left alone): ${noMap}`)
  if (noMapLabels.size) {
    console.log("labels with no map (kept as-is):", [...noMapLabels].sort().join(", "))
  }
  if (DRY) console.log("(dry run — no writes)")
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1) })
