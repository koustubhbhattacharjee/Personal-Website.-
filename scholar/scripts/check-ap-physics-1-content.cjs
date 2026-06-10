#!/usr/bin/env node
// Read-only audit: what AP Physics 1 content lives in Supabase?

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

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()

async function rest(table, query = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v))
  const res = await fetch(url.toString(), {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact" },
  })
  const count = res.headers.get("content-range")
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : [] } catch { body = text }
  if (!res.ok) throw new Error(`${table} ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`)
  return { rows: body, count }
}

async function main() {
  const FRAMEWORK_ID = "434e067c-f50a-4dc1-a826-897fc32d4292"

  console.log("=== content_banks for AP Physics 1 ===")
  const banks = await rest("content_banks", { select: "id,key,label,subject_name,source_label,is_canonical,created_at", framework_id: `eq.${FRAMEWORK_ID}`, limit: 100 })
  console.log(`content_range: ${banks.count}`)
  for (const b of banks.rows) console.log(`  ${b.id}  canonical=${b.is_canonical}  key=${b.key}  label=${b.label}  source=${b.source_label || "-"}  created=${b.created_at || ""}`)

  if (!banks.rows.length) {
    console.log("  (none)")
    // fallback: look for question_types that reference AP Physics 1 SLOs
    console.log("\n=== question_types tied to AP Physics 1 SLOs (via primary_slo_id) ===")
    const los = await rest("learning_objectives", { select: "id", framework_id: `eq.${FRAMEWORK_ID}`, limit: 1000 })
    const loIds = los.rows.map(r => r.id)
    const slos = []
    const chunk = 80
    for (let i = 0; i < loIds.length; i += chunk) {
      const batch = loIds.slice(i, i + chunk)
      const res = await rest("sub_learning_objectives", { select: "id", lo_id: `in.(${batch.map(x => `"${x}"`).join(",")})`, limit: 10000 })
      slos.push(...res.rows.map(r => r.id))
    }
    console.log(`  total AP P1 SLO ids in DB: ${slos.length}`)
    let qtHits = 0
    for (let i = 0; i < slos.length; i += chunk) {
      const batch = slos.slice(i, i + chunk)
      const res = await rest("question_types", { select: "id", primary_slo_id: `in.(${batch.map(x => `"${x}"`).join(",")})`, limit: 10000 })
      qtHits += res.rows.length
    }
    console.log(`  question_types with an AP P1 primary_slo_id: ${qtHits}`)
    return
  }

  const bankIds = banks.rows.map(b => b.id)

  console.log("\n=== question_types per bank ===")
  let totalQts = 0
  for (const bid of bankIds) {
    const qts = await rest("question_types", { select: "id,title,unit_label,source_label,status", content_bank_id: `eq.${bid}`, limit: 10000 })
    totalQts += qts.rows.length
    console.log(`  bank ${bid}: ${qts.rows.length} QTs  (range: ${qts.count})`)
  }

  console.log(`\ntotal question_types across AP P1 banks: ${totalQts}`)

  console.log("\n=== questions per bank (sampled counts) ===")
  let totalQuestions = 0
  for (const bid of bankIds) {
    const qts = await rest("question_types", { select: "id", content_bank_id: `eq.${bid}`, limit: 10000 })
    const qtIds = qts.rows.map(r => r.id)
    let bankQ = 0
    for (let i = 0; i < qtIds.length; i += 80) {
      const batch = qtIds.slice(i, i + 80)
      const qs = await rest("questions", { select: "id,question_format,options,correct_option", question_type_id: `in.(${batch.map(x => `"${x}"`).join(",")})`, limit: 10000 })
      bankQ += qs.rows.length
    }
    totalQuestions += bankQ
    console.log(`  bank ${bid}: ${bankQ} questions`)
  }
  console.log(`\ntotal questions across AP P1 banks: ${totalQuestions}`)

  console.log("\n=== unit_label breakdown (first bank) ===")
  if (bankIds.length) {
    const qts = await rest("question_types", { select: "unit_label", content_bank_id: `eq.${bankIds[0]}`, limit: 10000 })
    const tally = new Map()
    for (const r of qts.rows) tally.set(r.unit_label || "(null)", (tally.get(r.unit_label || "(null)") || 0) + 1)
    for (const [k, v] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${v.toString().padStart(4)}  ${k}`)
  }

  console.log("\n=== question_format split across all AP P1 questions ===")
  const fmt = new Map()
  let withOptions = 0, withoutOptions = 0
  for (const bid of bankIds) {
    const qts = await rest("question_types", { select: "id", content_bank_id: `eq.${bid}`, limit: 10000 })
    const qtIds = qts.rows.map(r => r.id)
    for (let i = 0; i < qtIds.length; i += 80) {
      const batch = qtIds.slice(i, i + 80)
      const qs = await rest("questions", { select: "question_format,options,correct_option", question_type_id: `in.(${batch.map(x => `"${x}"`).join(",")})`, limit: 10000 })
      for (const q of qs.rows) {
        fmt.set(q.question_format || "(null)", (fmt.get(q.question_format || "(null)") || 0) + 1)
        const opts = Array.isArray(q.options) ? q.options : []
        if (opts.length >= 4 && opts.every(o => typeof o === "string" && o.trim())) withOptions++
        else withoutOptions++
      }
    }
  }
  for (const [k, v] of [...fmt.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${v.toString().padStart(4)}  ${k}`)
  console.log(`\n  fully-populated MCQ options: ${withOptions}   missing/incomplete options: ${withoutOptions}`)
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1) })
