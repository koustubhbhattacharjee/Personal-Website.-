#!/usr/bin/env node
// Repair "ghost" workbook questions whose source_reference.page is null. Three
// passes:
//   1. Stem-children with no page inherit their master's page (or the master's
//      stem_header_content[0].page when the master itself has no
//      source_reference.page but does have a figure).
//   2. Stem-masters with no page but with a stem_header image use the
//      figure's page.
//   3. Questions still pageless after (1)+(2) AND whose label doesn't match
//      any workbook pattern get their textbook_key stripped — they don't
//      live in the workbook PDF, they were swept in via QT-level tagging.
//
// Run --dry-run first to see what would happen.

const fs = require("fs")
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (!m) continue
  if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

const TEXTBOOK_KEY = "tutor_ap1_workbook_book1_2014"
const DRY = process.argv.includes("--dry-run")
// Pattern: a label is "workbook-shaped" if it's plain digits 1..54, B1..B29,
// or an AP-FRQ-style year code like 1982B2, 2003Bb1, 1995B3(c) Th, etc.
const WORKBOOK_LABEL = /^(?:\d{1,2}|B\d{1,2}|\d{4}[A-Za-z]{1,3}\d?(?:\([^)]+\)[a-z]*(?:\s*T[hv])?)?)$/

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
  // 1. Pull every workbook-tagged question. After migration 019 the canonical
  //    textbook_key lives in source_reference (jsonb), not metadata.
  const rows = await rest(`questions?select=id,ordinal,stem_group_id,is_stem_child,stem_header_content,metadata,source_reference,question_text&source_reference->>textbook_key=eq.${encodeURIComponent(TEXTBOOK_KEY)}&order=stem_group_id.asc,ordinal.asc&limit=2000`)
  console.log(`Workbook-tagged questions: ${rows.length}`)

  // 2. Build group-id -> {masterPage, figurePage} from the rows that *do* know.
  const groupInfo = new Map()
  for (const r of rows) {
    if (!r.stem_group_id) continue
    const info = groupInfo.get(r.stem_group_id) || { masterPage: null, figurePage: null }
    const myPage = r.source_reference?.page || null
    if (myPage && info.masterPage == null) info.masterPage = myPage
    const sh = Array.isArray(r.stem_header_content) ? r.stem_header_content : []
    const fig = sh.find((x) => x?.type === "image" && x?.page)
    if (fig?.page && info.figurePage == null) info.figurePage = Number(fig.page)
    groupInfo.set(r.stem_group_id, info)
  }
  for (const [gid, info] of groupInfo) {
    if (!info.masterPage && info.figurePage) info.masterPage = info.figurePage
  }

  // 3. Safe pass only: backfill pages from the stem group when possible.
  //    Stripping textbook_key is destructive (we can't easily reverse it
  //    without per-question source data we don't have), so we just leave
  //    the still-pageless ghosts in place. The Sources UI will offer a
  //    "Hide pageless" toggle so they can stay out of the way by default.
  let inheritedFromGroup = 0, untouched = 0
  const pagelessLeft = []
  for (const r of rows) {
    const myPage = r.source_reference?.page || null
    if (myPage) { untouched++; continue }
    const groupPage = r.stem_group_id ? groupInfo.get(r.stem_group_id)?.masterPage : null
    if (groupPage) {
      const newSr = {
        ...(r.source_reference || {}),
        page: groupPage,
        textbook_key: TEXTBOOK_KEY,
      }
      console.log(`  inherit p.${groupPage} → ${r.metadata?.label || r.id.slice(0,8)}`)
      if (!DRY) {
        await rest(`questions?id=eq.${r.id}`, { method: "PATCH", body: { source_reference: newSr }, prefer: "return=minimal" })
      }
      inheritedFromGroup++
      continue
    }
    pagelessLeft.push(String(r.metadata?.label || r.id.slice(0, 8)))
  }

  console.log(`\n=== summary ===`)
  console.log(`already had a page:                ${untouched}`)
  console.log(`pages inherited from stem group:   ${inheritedFromGroup}`)
  console.log(`still pageless (will hide in UI):  ${pagelessLeft.length}`)
  if (pagelessLeft.length) {
    console.log(`  labels: ${pagelessLeft.sort().join(", ")}`)
  }
  if (DRY) console.log(`(dry run — no writes)`)
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1) })
