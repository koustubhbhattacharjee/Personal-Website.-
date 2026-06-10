#!/usr/bin/env node
// Survey where source_reference data actually lives across questions.
// Three possible homes:
//   A) source_reference column (text, JSON-encoded)
//   B) metadata.source_reference (some workbook backfill scripts wrote here)
//   C) metadata.textbook_key (the broken backfill copy)
//
// Read-only.

const fs = require("fs"), path = require("path")
const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1")
  }
}

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

async function rest(p) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}

function parseRef(raw) {
  if (raw == null || raw === "") return null
  if (typeof raw === "object") return raw
  try { return JSON.parse(raw) } catch { return null }
}

;(async () => {
  let offset = 0, total = 0
  const stats = {
    has_col: 0, has_meta_sr: 0, has_meta_tk: 0,
    only_col: 0, only_meta_sr: 0, only_meta_tk: 0,
    col_and_meta_sr: 0, col_and_meta_tk: 0, all_three: 0,
    none: 0,
    col_tk_eq_meta_tk: 0, col_tk_neq_meta_tk: 0,
  }
  const conflicts = []
  for (;;) {
    const rows = await rest(`questions?select=id,source_reference,metadata&limit=1000&offset=${offset}`)
    if (!rows.length) break
    for (const r of rows) {
      total++
      const col = parseRef(r.source_reference)
      const metaSr = (r.metadata && r.metadata.source_reference) || null
      const metaTk = (r.metadata && r.metadata.textbook_key) || null
      const hasCol = !!(col && col.textbook_key)
      const hasMetaSr = !!(metaSr && metaSr.textbook_key)
      const hasMetaTk = !!metaTk
      if (hasCol) stats.has_col++
      if (hasMetaSr) stats.has_meta_sr++
      if (hasMetaTk) stats.has_meta_tk++
      const flags = (hasCol?"C":"") + (hasMetaSr?"S":"") + (hasMetaTk?"T":"")
      if (flags === "")    stats.none++
      if (flags === "C")   stats.only_col++
      if (flags === "S")   stats.only_meta_sr++
      if (flags === "T")   stats.only_meta_tk++
      if (flags === "CS")  stats.col_and_meta_sr++
      if (flags === "CT")  stats.col_and_meta_tk++
      if (flags === "CST") stats.all_three++
      if (hasCol && hasMetaTk) {
        if (col.textbook_key === metaTk) stats.col_tk_eq_meta_tk++
        else {
          stats.col_tk_neq_meta_tk++
          if (conflicts.length < 10) conflicts.push({
            id: r.id,
            col_tk: col.textbook_key,
            meta_tk: metaTk,
            label: r.metadata && (r.metadata.label || r.metadata.source_id),
          })
        }
      }
    }
    offset += rows.length
    if (rows.length < 1000) break
  }
  console.log(`questions scanned: ${total}\n`)
  console.log(`presence:`)
  console.log(`  source_reference column        : ${stats.has_col}`)
  console.log(`  metadata.source_reference      : ${stats.has_meta_sr}`)
  console.log(`  metadata.textbook_key          : ${stats.has_meta_tk}\n`)
  console.log(`exclusive shapes (C=col S=meta_sr T=meta_tk):`)
  console.log(`  none      : ${stats.none}`)
  console.log(`  only C    : ${stats.only_col}`)
  console.log(`  only S    : ${stats.only_meta_sr}`)
  console.log(`  only T    : ${stats.only_meta_tk}`)
  console.log(`  C+S       : ${stats.col_and_meta_sr}`)
  console.log(`  C+T       : ${stats.col_and_meta_tk}`)
  console.log(`  C+S+T     : ${stats.all_three}\n`)
  console.log(`bug-relevant agreement check:`)
  console.log(`  col.textbook_key === meta.textbook_key : ${stats.col_tk_eq_meta_tk}`)
  console.log(`  col.textbook_key !== meta.textbook_key : ${stats.col_tk_neq_meta_tk}`)
  if (conflicts.length) {
    console.log(`\nfirst few conflicts:`)
    for (const c of conflicts) console.log(`  ${c.id}  ${c.label}  col=${c.col_tk}  meta=${c.meta_tk}`)
  }
})().catch((e) => { console.error(e); process.exit(1) })
