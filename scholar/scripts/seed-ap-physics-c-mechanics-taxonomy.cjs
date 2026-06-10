#!/usr/bin/env node
// One-off taxonomy seeder for AP Physics C (Mechanics).
//
// Reads only the `ap_physics_c::ap physics c` subtree of district-taxonomy.js,
// upserts the curriculum_framework + namespaced learning_objectives +
// sub_learning_objectives, and deletes any leftover bare-id LO rows
// (e.g. id="1.1.A") under the same framework.
//
// Usage:
//   node scripts/seed-ap-physics-c-mechanics-taxonomy.cjs           # dry-run
//   node scripts/seed-ap-physics-c-mechanics-taxonomy.cjs --apply

const fs = require("fs"), path = require("path")

const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1")
  }
}

const APPLY = process.argv.includes("--apply")
const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
if (!SUPABASE_URL || !KEY) { console.error("missing Supabase env"); process.exit(1) }

const STATE_KEY = "ap_physics_c"
const SUBJECT_KEY = "ap physics c"
const FRAMEWORK_KEY = `${STATE_KEY}::${SUBJECT_KEY}`

const { DISTRICT_TAXONOMY } = require(path.join(process.cwd(), "lib", "district-taxonomy.js"))
const subject = DISTRICT_TAXONOMY?.[STATE_KEY]?.[SUBJECT_KEY]
if (!subject) { console.error(`taxonomy missing for ${FRAMEWORK_KEY}`); process.exit(1) }

function headers(extra = {}) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...extra }
}
async function rest(method, p, body, extraHeaders = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    method,
    headers: headers(extraHeaders),
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${text}`)
  try { return text ? JSON.parse(text) : null } catch { return text }
}
function chunk(list, size) { const out=[]; for (let i=0;i<list.length;i+=size) out.push(list.slice(i,i+size)); return out }

// Build payloads
const subjectName = String(subject.name || SUBJECT_KEY).trim()
const frameworkRow = {
  key: FRAMEWORK_KEY,
  label: `${STATE_KEY} / ${subjectName}`,
  country: subject.country || null,
  state: STATE_KEY,
  subject_name: subjectName,
  metadata: {
    subject_key: SUBJECT_KEY,
    standards_count: Array.isArray(subject.standards) ? subject.standards.length : 0,
  },
}

const loMap = new Map()
const sloMap = new Map()
;(subject.standards || []).forEach((standard, standardIndex) => {
  ;(standard.objectives || []).forEach((lo, loIndex) => {
    if (!lo?.code) return
    const loId = `${FRAMEWORK_KEY}::${lo.code}`
    loMap.set(loId, {
      id: loId,
      code: String(lo.code),
      standard_code: standard.code || null,
      standard_name: standard.name || null,
      name: lo.name || lo.code,
      sequence_index: standardIndex * 1000 + loIndex,
      metadata: { subject_key: SUBJECT_KEY, state_key: STATE_KEY },
    })
    ;(lo.subtopics || []).forEach((slo, sloIndex) => {
      const text = typeof slo === "string" ? slo : (slo.text || "")
      const code = typeof slo === "string" ? `${lo.code}.${sloIndex + 1}` : (slo.id || `${lo.code}.${sloIndex + 1}`)
      if (!code || !text) return
      const sloId = `${FRAMEWORK_KEY}::${code}`
      sloMap.set(sloId, {
        id: sloId,
        lo_id: loId,
        code: String(code),
        text: String(text),
        sequence_index: standardIndex * 100000 + loIndex * 100 + sloIndex,
        metadata: { subject_key: SUBJECT_KEY, state_key: STATE_KEY },
      })
    })
  })
})
const loRows = [...loMap.values()]
const sloRows = [...sloMap.values()]

;(async () => {
  console.log(`[seed-ap-physics-c] mode: ${APPLY ? "APPLY" : "DRY-RUN"}`)
  console.log(`[seed-ap-physics-c] framework: ${FRAMEWORK_KEY}`)
  console.log(`[seed-ap-physics-c] payload: 1 framework, ${loRows.length} LOs, ${sloRows.length} SLOs`)

  // Look up current state
  const existingFw = await rest("GET", `curriculum_frameworks?select=id,key&key=eq.${encodeURIComponent(FRAMEWORK_KEY)}`)
  const fwId = existingFw?.[0]?.id || null
  console.log(`[seed-ap-physics-c] existing framework_id: ${fwId || "(none — will create)"}`)

  const existingLos = fwId
    ? await rest("GET", `learning_objectives?select=id&framework_id=eq.${fwId}&limit=1000`)
    : []
  const namespacedExisting = existingLos.filter((r) => r.id.startsWith(`${FRAMEWORK_KEY}::`)).map((r) => r.id)
  const bareExisting = existingLos.filter((r) => !r.id.includes("::")).map((r) => r.id)
  console.log(`[seed-ap-physics-c] existing LOs in framework: ${namespacedExisting.length} namespaced, ${bareExisting.length} bare (will be deleted)`)

  if (!APPLY) {
    console.log()
    console.log("[seed-ap-physics-c] DRY-RUN — no writes. Sample LO row:")
    console.log(JSON.stringify(loRows[0], null, 2))
    console.log("[seed-ap-physics-c] sample SLO row:")
    console.log(JSON.stringify(sloRows[0], null, 2))
    if (bareExisting.length) {
      console.log(`[seed-ap-physics-c] would delete ${bareExisting.length} bare-id LO rows: ${bareExisting.slice(0,5).join(", ")}${bareExisting.length>5?", ...":""}`)
    }
    console.log("[seed-ap-physics-c] re-run with --apply to write.")
    return
  }

  // 1) Upsert framework
  await rest("POST", `curriculum_frameworks?on_conflict=key`, [frameworkRow], {
    Prefer: "resolution=merge-duplicates,return=representation",
  })
  const fwIdLatest = (await rest("GET", `curriculum_frameworks?select=id&key=eq.${encodeURIComponent(FRAMEWORK_KEY)}`))?.[0]?.id
  if (!fwIdLatest) throw new Error("framework_id missing after upsert")
  for (const r of loRows) r.framework_id = fwIdLatest
  console.log("[seed-ap-physics-c] ✔ framework upserted, id:", fwIdLatest)

  // 2) Upsert LOs
  for (const group of chunk(loRows, 200)) {
    await rest("POST", `learning_objectives?on_conflict=id`, group, {
      Prefer: "resolution=merge-duplicates,return=representation",
    })
  }
  console.log(`[seed-ap-physics-c] ✔ ${loRows.length} LOs upserted`)

  // 3) Upsert SLOs
  for (const group of chunk(sloRows, 300)) {
    await rest("POST", `sub_learning_objectives?on_conflict=id`, group, {
      Prefer: "resolution=merge-duplicates,return=representation",
    })
  }
  console.log(`[seed-ap-physics-c] ✔ ${sloRows.length} SLOs upserted`)

  // 4) Delete bare-id LO rows under this framework
  if (bareExisting.length) {
    const inList = bareExisting.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(",")
    await rest("DELETE", `learning_objectives?framework_id=eq.${fwIdLatest}&id=in.(${inList})`, null, {
      Prefer: "return=representation",
    })
    console.log(`[seed-ap-physics-c] ✔ deleted ${bareExisting.length} bare-id LO rows`)
  }

  console.log("[seed-ap-physics-c] done.")
})().catch((e) => { console.error("[seed-ap-physics-c] failed:", e.message); process.exit(1) })
