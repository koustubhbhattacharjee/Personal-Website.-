#!/usr/bin/env node
// Audit stem-group page consistency for the workbook source. Flags:
//   1. Stem children whose source_reference.page differs from the master's.
//   2. Stem groups whose master's stem_header_content[i].page doesn't match
//      the master's source_reference.page (figure on a different page).
//   3. Children whose source_reference.page is null/0 (will scroll to nowhere).
//
// Usage:
//   node scripts/audit-stem-pages.cjs

const fs = require("fs")
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (!m) continue
  if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const URL_ = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

async function rest(p) {
  const r = await fetch(URL_ + "/rest/v1/" + p, {
    headers: { apikey: KEY, Authorization: "Bearer " + KEY },
  })
  return JSON.parse(await r.text())
}

;(async () => {
  const rows = []
  let offset = 0
  while (true) {
    const batch = await rest(`questions?select=id,ordinal,stem_group_id,is_stem_child,stem_header_content,metadata,source_reference&stem_group_id=not.is.null&order=stem_group_id.asc,ordinal.asc&limit=1000&offset=${offset}`)
    if (!batch.length) break
    rows.push(...batch)
    if (batch.length < 1000) break
    offset += batch.length
  }
  // Bucket by group.
  const byGroup = new Map()
  for (const r of rows) {
    const g = byGroup.get(r.stem_group_id) || []
    g.push(r)
    byGroup.set(r.stem_group_id, g)
  }
  console.log(`Stem groups: ${byGroup.size}`)
  console.log("")

  let nullPages = 0
  let figurePageMismatch = 0
  let memberPageVariance = 0
  let groupDetails = []

  for (const [gid, members] of byGroup) {
    members.sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    const master = members[0]
    const masterPage = master.source_reference?.page || null
    const sh = Array.isArray(master.stem_header_content) ? master.stem_header_content : []
    const figureItem = sh.find((x) => x?.type === "image")
    const figurePage = figureItem?.page || null
    const memberPages = members.map((m) => m.source_reference?.page || null)
    const distinctPages = [...new Set(memberPages.filter(Boolean))]
    const labels = members.map((m) => m.metadata?.label || m.id.slice(0, 8))
    const masterLabel = master.metadata?.label || master.id.slice(0, 8)
    const masterTextbook = master.source_reference?.textbook_key

    let issues = []
    if (memberPages.some((p) => !p)) {
      issues.push(`null pages on: ${members.filter((m) => !m.source_reference?.page).map((m) => m.metadata?.label || m.id.slice(0,8)).join(",")}`)
      nullPages++
    }
    if (figurePage && masterPage && figurePage !== masterPage) {
      issues.push(`figure on p.${figurePage} but master.source_reference.page=${masterPage}`)
      figurePageMismatch++
    }
    if (distinctPages.length > 1) {
      issues.push(`members span ${distinctPages.join(", ")}`)
      memberPageVariance++
    }
    if (issues.length) {
      groupDetails.push({ gid: gid.slice(0, 8), masterLabel, masterTextbook, masterPage, figurePage, labels, memberPages, issues })
    }
  }

  // Filter the verbose dump to workbook-tagged groups only — those are the
  // ones the admin is actively looking at in the Sources tab.
  const TARGET_KEY = process.argv[2] || "tutor_ap1_workbook_book1_2014"
  const filteredDetails = groupDetails.filter((d) => d.masterTextbook === TARGET_KEY)
  console.log(`Issues across ${groupDetails.length} groups (of ${byGroup.size}):`)
  console.log(`  null pages on members:      ${nullPages}`)
  console.log(`  figure-page ≠ master-page:  ${figurePageMismatch}`)
  console.log(`  members span multiple pages: ${memberPageVariance}`)
  console.log(`\nIn source ${TARGET_KEY}: ${filteredDetails.length} groups with issues`)
  console.log("")
  for (const d of filteredDetails.slice(0, 40)) {
    console.log(`  group ${d.gid} master=${d.masterLabel} (textbook=${d.masterTextbook}, masterPage=${d.masterPage}, figure=${d.figurePage}):`)
    for (let i = 0; i < d.labels.length; i++) {
      console.log(`    - ${d.labels[i].padEnd(20)} page=${d.memberPages[i]}`)
    }
    for (const issue of d.issues) console.log(`    ⚠ ${issue}`)
  }
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1) })
