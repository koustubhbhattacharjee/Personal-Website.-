#!/usr/bin/env node
// Some stem groups in the DB are "orphaned": their children have a
// stem_group_id but no row in the same question_type carries
// stem_header_content with that group_id. Usually the master is sitting
// right before them (lower ordinal, is_stem_child=false, has
// stem_header_content) but with stem_group_id = NULL, so the renderer's
// inheritance lookup can't find it.
//
// This script finds those orphans and stamps the missing stem_group_id
// onto the most plausible master: the row with stem_header_content in
// the same QT with the highest ordinal less than the children's lowest
// ordinal. Idempotent — safe to rerun.
//
// Usage:
//   node scripts/fix-orphan-stem-masters.cjs --dry-run
//   node scripts/fix-orphan-stem-masters.cjs

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

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY = process.argv.includes("--dry-run")

async function rest(p, opts = {}) {
  const res = await fetch(URL_ + "/rest/v1/" + p, {
    method: opts.method || "GET",
    headers: {
      apikey: KEY,
      Authorization: "Bearer " + KEY,
      "Content-Type": "application/json",
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
  // 1. Find every distinct stem_group_id with at least one child.
  const childRows = []
  let offset = 0
  while (true) {
    const batch = await rest(`questions?select=id,question_type_id,stem_group_id,ordinal,is_stem_child,stem_header_content&stem_group_id=not.is.null&limit=1000&offset=${offset}`)
    if (!batch.length) break
    childRows.push(...batch)
    if (batch.length < 1000) break
    offset += batch.length
  }

  // Bucket by QT + group.
  const groupsByQt = new Map()  // qt -> group_id -> rows[]
  for (const r of childRows) {
    let m = groupsByQt.get(r.question_type_id)
    if (!m) { m = new Map(); groupsByQt.set(r.question_type_id, m) }
    let arr = m.get(r.stem_group_id)
    if (!arr) { arr = []; m.set(r.stem_group_id, arr) }
    arr.push(r)
  }

  let orphanGroups = []  // { qt, group, members, candidateMaster }
  for (const [qtId, groups] of groupsByQt) {
    // Pull every row in this QT (we need the unlinked masters too).
    const allInQt = await rest(`questions?select=id,ordinal,is_stem_child,stem_group_id,stem_header_content,question_text&question_type_id=eq.${qtId}&order=ordinal.asc&limit=200`)
    for (const [groupId, members] of groups) {
      members.sort((a, b) => a.ordinal - b.ordinal)
      const hasMasterWithHeader = members.some(
        (m) => Array.isArray(m.stem_header_content) && m.stem_header_content.length
      )
      if (hasMasterWithHeader) continue
      const minOrd = members[0].ordinal
      // Candidate master = highest-ordinal row in this QT with no
      // stem_group_id but a non-empty stem_header_content, and ordinal < minOrd.
      const candidates = allInQt.filter(
        (r) =>
          !r.stem_group_id &&
          Array.isArray(r.stem_header_content) &&
          r.stem_header_content.length &&
          r.ordinal < minOrd
      )
      if (!candidates.length) {
        orphanGroups.push({ qtId, groupId, members, candidate: null })
        continue
      }
      candidates.sort((a, b) => b.ordinal - a.ordinal)
      orphanGroups.push({ qtId, groupId, members, candidate: candidates[0] })
    }
  }

  console.log(`Total orphan stem groups: ${orphanGroups.length}`)
  let willFix = 0, cannotFix = 0
  for (const og of orphanGroups) {
    const tail = `(${og.members.length} children, group ${og.groupId.slice(0, 8)})`
    if (og.candidate) {
      willFix++
      console.log(`  FIX: master ord=${og.candidate.ordinal} "${(og.candidate.question_text || "").slice(0, 50)}…" ${tail}`)
    } else {
      cannotFix++
      console.log(`  ??: no master candidate ${tail}`)
    }
  }
  console.log(`\nwill fix: ${willFix}    cannot fix: ${cannotFix}`)

  if (DRY) {
    console.log("(dry run)")
    return
  }
  for (const og of orphanGroups) {
    if (!og.candidate) continue
    await rest(`questions?id=eq.${og.candidate.id}`, {
      method: "PATCH",
      body: { stem_group_id: og.groupId },
      prefer: "return=minimal",
    })
  }
  console.log("done.")
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1) })
