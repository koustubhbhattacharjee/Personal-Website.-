#!/usr/bin/env node
// Migrate every stem_group_id in `questions` to a single-master shape:
//
//   master row (lowest ordinal in the group):
//     stem_header_content    = the shared figure + intro     (kept)
//     question_content       = ONLY the master's own prompt  (leading dupes stripped)
//
//   non-master rows in the same group:
//     stem_header_content    = null                          (lookups go via stem_group_id)
//     question_content       = ONLY the child's own prompt   (leading dupes stripped)
//
// "Leading dupes" means: items at the front of question_content whose
// {type, page, bbox|value} fingerprint matches an item in stem_header_content.
// The seeder used to merge stem_header onto every child's question_content
// (see scripts/seed-ap-physics-1-unit-2.cjs), so every stem child currently
// carries a duplicated copy of the figure + intro text. We strip those.
//
// Usage:
//   node scripts/migrate-stem-master-singleton.cjs --dry-run
//   node scripts/migrate-stem-master-singleton.cjs
//
// Idempotent — safe to rerun. After the first pass, leading-dupe stripping
// is a no-op and non-masters already have stem_header_content = null.

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

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local")
  process.exit(1)
}

const DRY = process.argv.includes("--dry-run")

async function rest(p, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    method: opts.method || "GET",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
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

// Compare two ordered_content items for "are these the same shared item"
// purposes. Images match on (page, bbox, url). Text matches on trimmed value.
function fingerprint(item) {
  if (!item || typeof item !== "object") return null
  if (item.type === "image") {
    const bbox = Array.isArray(item.bbox) ? item.bbox.map((n) => Number(n).toFixed(4)).join(",") : ""
    return `image|${item.page || ""}|${bbox}|${item.url || ""}`
  }
  if (item.type === "text") {
    return `text|${String(item.value || "").trim()}`
  }
  return null
}

function stripLeadingDupes(questionContent, stemHeader) {
  const qc = Array.isArray(questionContent) ? questionContent : []
  const sh = Array.isArray(stemHeader) ? stemHeader : []
  if (!qc.length || !sh.length) return { stripped: qc, removed: 0 }
  const shFps = new Set(sh.map(fingerprint).filter(Boolean))
  let cut = 0
  while (cut < qc.length) {
    const fp = fingerprint(qc[cut])
    if (fp && shFps.has(fp)) cut++
    else break
  }
  return { stripped: qc.slice(cut), removed: cut }
}

async function main() {
  // 1. Pull every stem-grouped question.
  const rows = []
  let offset = 0
  while (true) {
    const batch = await rest(`questions?select=id,question_type_id,stem_group_id,is_stem_child,ordinal,question_content,stem_header_content&stem_group_id=not.is.null&order=stem_group_id.asc,ordinal.asc&limit=1000&offset=${offset}`)
    if (!batch.length) break
    rows.push(...batch)
    if (batch.length < 1000) break
    offset += batch.length
  }
  console.log(`Found ${rows.length} stem-grouped question rows.`)

  // 2. Bucket by stem_group_id.
  const groups = new Map()
  for (const r of rows) {
    const g = groups.get(r.stem_group_id) || []
    g.push(r)
    groups.set(r.stem_group_id, g)
  }
  console.log(`Across ${groups.size} stem groups.`)

  let mastersChanged = 0
  let childrenStripped = 0
  let childrenHeaderCleared = 0
  let alreadyClean = 0

  // 3. For each group, designate master + clean.
  for (const [gid, members] of groups) {
    members.sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    const master = members[0]
    const masterHeader = Array.isArray(master.stem_header_content) && master.stem_header_content.length
      ? master.stem_header_content
      : null

    if (!masterHeader) {
      // Group has no stem header anywhere on its lowest-ordinal row — try
      // to find one on any other member to use as the source of truth.
      const fallback = members.find((m) => Array.isArray(m.stem_header_content) && m.stem_header_content.length)
      if (!fallback) {
        // Nothing to do for this group.
        for (const m of members) alreadyClean++
        continue
      }
      // Promote fallback's header to the master.
      master.stem_header_content = fallback.stem_header_content
    }
    const headerForStripping = master.stem_header_content

    // 3a. Master: keep stem_header_content, strip dupes from question_content.
    {
      const { stripped, removed } = stripLeadingDupes(master.question_content, headerForStripping)
      const masterPatch = {}
      if (removed > 0) masterPatch.question_content = stripped
      // No-op stem_header_content set (kept as-is).
      if (Object.keys(masterPatch).length) {
        if (!DRY) {
          await rest(`questions?id=eq.${master.id}`, {
            method: "PATCH",
            body: masterPatch,
            prefer: "return=minimal",
          })
        }
        mastersChanged++
      } else {
        alreadyClean++
      }
    }

    // 3b. Non-masters: strip dupes from question_content + null out stem_header_content.
    for (let i = 1; i < members.length; i++) {
      const child = members[i]
      const { stripped, removed } = stripLeadingDupes(child.question_content, headerForStripping)
      const patch = {}
      if (removed > 0) {
        patch.question_content = stripped
        childrenStripped++
      }
      if (Array.isArray(child.stem_header_content) && child.stem_header_content.length) {
        patch.stem_header_content = null
        childrenHeaderCleared++
      }
      if (Object.keys(patch).length) {
        if (!DRY) {
          await rest(`questions?id=eq.${child.id}`, {
            method: "PATCH",
            body: patch,
            prefer: "return=minimal",
          })
        }
      } else {
        alreadyClean++
      }
    }
  }

  console.log("\n=== summary ===")
  console.log(`stem groups visited:           ${groups.size}`)
  console.log(`master rows touched:           ${mastersChanged}`)
  console.log(`children w/ leading dupes:     ${childrenStripped}`)
  console.log(`children w/ header cleared:    ${childrenHeaderCleared}`)
  console.log(`rows already clean:            ${alreadyClean}`)
  if (DRY) console.log(`(dry run — no writes)`)
}

main().catch((e) => { console.error("FAILED:", e.message); process.exit(1) })
