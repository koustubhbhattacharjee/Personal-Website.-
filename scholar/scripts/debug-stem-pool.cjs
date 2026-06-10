// Simulate getQuestionPool's stemHeaderByGroup behavior on a single QT and
// confirm that non-master children inherit the master's stem_header_content
// at fetch time.
//
// Usage: node scripts/debug-stem-pool.cjs <questionTypeId>
//        (or omit to grab the first stem-grouped QT in the bank)

const fs = require("fs")
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (!m) continue
  if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")
const KEY = process.env.SUPABASE_SECRET_KEY

async function rest(p) {
  const r = await fetch(URL_ + "/rest/v1/" + p, {
    headers: { apikey: KEY, Authorization: "Bearer " + KEY },
  })
  return JSON.parse(await r.text())
}

;(async () => {
  let qtId = process.argv[2]
  if (!qtId) {
    // Find a QT that contains stem-grouped questions
    const sample = await rest("questions?select=question_type_id&stem_group_id=not.is.null&limit=1")
    qtId = sample[0]?.question_type_id
  }
  if (!qtId) { console.log("no stem QTs found"); return }
  console.log("QT:", qtId)
  const rows = await rest(`questions?select=id,ordinal,stem_group_id,is_stem_child,stem_header_content,question_text&question_type_id=eq.${qtId}&order=ordinal.asc&limit=200`)
  console.log("rows:", rows.length)

  // Mirror lib/db.js logic
  const stemHeaderByGroup = new Map()
  for (const r of rows) {
    if (!r.stem_group_id) continue
    const sh = Array.isArray(r.stem_header_content) && r.stem_header_content.length ? r.stem_header_content : null
    if (!sh) continue
    if (!stemHeaderByGroup.has(r.stem_group_id)) stemHeaderByGroup.set(r.stem_group_id, sh)
  }
  console.log("stem groups in this QT:", stemHeaderByGroup.size)

  for (const r of rows) {
    const own = Array.isArray(r.stem_header_content) && r.stem_header_content.length ? "OWN" : "—"
    const inh = r.stem_group_id ? (stemHeaderByGroup.get(r.stem_group_id) ? "INHERIT" : "no-master") : "no-group"
    const effective = own !== "—" ? "OWN" : inh
    const imgUrl = (() => {
      const sh = Array.isArray(r.stem_header_content) && r.stem_header_content.length
        ? r.stem_header_content
        : (r.stem_group_id ? stemHeaderByGroup.get(r.stem_group_id) : null)
      if (!sh) return "(no header)"
      const img = sh.find((x) => x?.type === "image")
      if (!img) return "(no img)"
      return img.url ? img.url.slice(-40) : "(no url)"
    })()
    console.log(`  ord=${r.ordinal} child=${r.is_stem_child} group=${r.stem_group_id ? r.stem_group_id.slice(0,8) : "—"} effective=${effective.padEnd(8)} img=${imgUrl}  q=${(r.question_text||"").slice(0,40)}`)
  }
})().catch((e) => { console.error(e); process.exit(1) })
