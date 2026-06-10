#!/usr/bin/env node

// Read-only diff: compare AP Physics 1 taxonomy in lib/ vs what's in Supabase.
// Prints LOs / SLOs present only in file, only in DB, and any name/text mismatches.

const path = require("path")
const fs = require("fs")

const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

const { DISTRICT_TAXONOMY } = require(path.join(process.cwd(), "lib", "district-taxonomy.js"))

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")
  process.exit(1)
}

async function rest(table, query = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v))
  const res = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  })
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : [] } catch { body = text }
  if (!res.ok) throw new Error(`${table} ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`)
  return body
}

function expectedFromFile() {
  const subj = DISTRICT_TAXONOMY?.ap_physics_1?.["ap physics 1"]
  if (!subj) throw new Error("DISTRICT_TAXONOMY.ap_physics_1['ap physics 1'] not found")
  const los = new Map()
  const slos = new Map()
  for (const std of subj.standards || []) {
    for (const lo of std.objectives || []) {
      if (!lo?.code) continue
      los.set(String(lo.code), { code: lo.code, name: lo.name || lo.code, standard_code: std.code || null, standard_name: std.name || null })
      for (const slo of lo.subtopics || []) {
        const sloCode = typeof slo === "string" ? null : (slo?.id || null)
        const sloText = typeof slo === "string" ? slo : (slo?.text || "")
        if (!sloCode) continue
        slos.set(String(sloCode), { code: sloCode, text: sloText, lo_code: lo.code })
      }
    }
  }
  return { los, slos }
}

async function actualFromDb() {
  const frameworks = await rest("curriculum_frameworks", { select: "id,key", key: "eq.ap_physics_1::ap physics 1" })
  if (!frameworks.length) throw new Error("framework ap_physics_1::ap physics 1 not present in curriculum_frameworks")
  const fwId = frameworks[0].id
  const loRows = await rest("learning_objectives", { select: "id,code,name,standard_code,standard_name", framework_id: `eq.${fwId}`, limit: 10000 })
  const los = new Map(loRows.map(r => [String(r.code), r]))
  const loIds = loRows.map(r => r.id)
  const slos = new Map()
  const chunkSize = 50
  for (let i = 0; i < loIds.length; i += chunkSize) {
    const batch = loIds.slice(i, i + chunkSize)
    const sloRows = await rest("sub_learning_objectives", {
      select: "id,code,text,lo_id",
      lo_id: `in.(${batch.map(x => `"${x}"`).join(",")})`,
      limit: 10000,
    })
    for (const r of sloRows) slos.set(String(r.code), r)
  }
  return { los, slos, fwId }
}

function diffMaps(label, file, db, keyFields) {
  const onlyFile = [...file.keys()].filter(k => !db.has(k))
  const onlyDb = [...db.keys()].filter(k => !file.has(k))
  const mismatches = []
  for (const k of file.keys()) {
    if (!db.has(k)) continue
    const a = file.get(k), b = db.get(k)
    for (const f of keyFields) {
      const av = (a[f] || "").toString().trim()
      const bv = (b[f] || "").toString().trim()
      if (av !== bv) mismatches.push({ code: k, field: f, file: av, db: bv })
    }
  }
  console.log(`\n=== ${label} ===`)
  console.log(`file: ${file.size}  db: ${db.size}  only-in-file: ${onlyFile.length}  only-in-db: ${onlyDb.length}  mismatched-fields: ${mismatches.length}`)
  if (onlyFile.length) console.log(`only in file: ${onlyFile.slice(0, 20).join(", ")}${onlyFile.length > 20 ? " …" : ""}`)
  if (onlyDb.length) console.log(`only in db:   ${onlyDb.slice(0, 20).join(", ")}${onlyDb.length > 20 ? " …" : ""}`)
  if (mismatches.length) {
    console.log(`field mismatches (first 10):`)
    for (const m of mismatches.slice(0, 10)) {
      console.log(`  ${m.code} [${m.field}]\n    file: ${m.file.slice(0, 120)}\n    db:   ${m.db.slice(0, 120)}`)
    }
  }
  return { onlyFile, onlyDb, mismatches }
}

async function main() {
  const file = expectedFromFile()
  console.log(`file: ${file.los.size} LOs, ${file.slos.size} SLOs`)
  const db = await actualFromDb()
  console.log(`db:   framework_id=${db.fwId}, ${db.los.size} LOs, ${db.slos.size} SLOs`)
  const loDiff = diffMaps("LOs", file.los, db.los, ["name", "standard_code", "standard_name"])
  const sloDiff = diffMaps("SLOs", file.slos, db.slos, ["text"])
  const fullyAligned =
    loDiff.onlyFile.length === 0 &&
    loDiff.onlyDb.length === 0 &&
    loDiff.mismatches.length === 0 &&
    sloDiff.onlyFile.length === 0 &&
    sloDiff.onlyDb.length === 0 &&
    sloDiff.mismatches.length === 0
  console.log(`\nFULLY ALIGNED: ${fullyAligned}`)
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1) })
