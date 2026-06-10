#!/usr/bin/env node
// Read-only: what sources were used, how many questions per source, and when imported.

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
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : [] } catch { body = text }
  if (!res.ok) throw new Error(`${table} ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`)
  return { rows: body, count: res.headers.get("content-range") }
}

function fmtDate(iso) {
  if (!iso) return "-"
  return iso.slice(0, 10)
}

async function main() {
  const FRAMEWORK_ID = "434e067c-f50a-4dc1-a826-897fc32d4292"

  const banks = await rest("content_banks", {
    select: "id,key,label,source_label,is_canonical,created_at",
    framework_id: `eq.${FRAMEWORK_ID}`,
    limit: 100,
  })

  console.log("=== content_banks for AP Physics 1 ===")
  for (const b of banks.rows) {
    console.log(`  ${b.label}`)
    console.log(`    bank_source_label: ${b.source_label || "-"}`)
    console.log(`    created_at:        ${b.created_at || "-"}`)
  }

  for (const bank of banks.rows) {
    console.log(`\n=== question_types in bank "${bank.label}" ===`)
    const qts = await rest("question_types", {
      select: "id,title,unit_label,source_label,source_reference,created_at,updated_at",
      content_bank_id: `eq.${bank.id}`,
      limit: 10000,
    })

    // Tally by QT source_label
    const qtBySource = new Map()
    const qtDatesBySource = new Map()
    for (const qt of qts.rows) {
      const src = qt.source_label || "(null)"
      qtBySource.set(src, (qtBySource.get(src) || 0) + 1)
      if (!qtDatesBySource.has(src)) qtDatesBySource.set(src, new Set())
      qtDatesBySource.get(src).add(fmtDate(qt.created_at))
    }
    console.log(`  ${qts.rows.length} question_types`)
    console.log("\n  QT source_label tallies:")
    for (const [src, n] of [...qtBySource.entries()].sort((a, b) => b[1] - a[1])) {
      const dates = [...qtDatesBySource.get(src)].sort()
      console.log(`    ${String(n).padStart(4)}  ${src}   [created: ${dates.join(", ")}]`)
    }

    // source_reference inspection — what keys/values show up?
    const refKeys = new Map()
    const refSamples = new Map()
    for (const qt of qts.rows) {
      const ref = qt.source_reference || {}
      if (!ref || typeof ref !== "object" || Array.isArray(ref)) continue
      for (const [k, v] of Object.entries(ref)) {
        refKeys.set(k, (refKeys.get(k) || 0) + 1)
        if (!refSamples.has(k)) refSamples.set(k, new Set())
        const sample = refSamples.get(k)
        if (sample.size < 6) sample.add(typeof v === "string" ? v : JSON.stringify(v))
      }
    }
    if (refKeys.size) {
      console.log("\n  QT source_reference keys (count — sample values):")
      for (const [k, n] of [...refKeys.entries()].sort((a, b) => b[1] - a[1])) {
        const samples = [...refSamples.get(k)].slice(0, 6).join(" | ")
        console.log(`    ${String(n).padStart(4)}  ${k}   e.g. ${samples}`)
      }
    }

    // now questions — per-question source_label / source_file / source_page
    const qtIds = qts.rows.map(r => r.id)
    const qRows = []
    for (let i = 0; i < qtIds.length; i += 80) {
      const batch = qtIds.slice(i, i + 80)
      const qs = await rest("questions", {
        select: "id,question_type_id,source_file,source_page,source_reference,metadata",
        question_type_id: `in.(${batch.map(x => `"${x}"`).join(",")})`,
        limit: 10000,
      })
      qRows.push(...qs.rows)
    }

    console.log(`\n  ${qRows.length} questions in this bank`)

    const qByFile = new Map()
    for (const q of qRows) {
      const src = q.source_file || "(null)"
      qByFile.set(src, (qByFile.get(src) || 0) + 1)
    }
    console.log("\n  question source_file tallies:")
    for (const [k, n] of [...qByFile.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(n).padStart(4)}  ${k}`)
    }

    const qByRef = new Map()
    for (const q of qRows) {
      const src = q.source_reference || "(null)"
      qByRef.set(src, (qByRef.get(src) || 0) + 1)
    }
    console.log("\n  question source_reference tallies:")
    for (const [k, n] of [...qByRef.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`    ${String(n).padStart(4)}  ${k}`)
    }

    // peek at metadata for import_* fields
    const metaKeys = new Map()
    const metaSamples = new Map()
    for (const q of qRows) {
      const md = q.metadata || {}
      if (!md || typeof md !== "object" || Array.isArray(md)) continue
      for (const [k, v] of Object.entries(md)) {
        metaKeys.set(k, (metaKeys.get(k) || 0) + 1)
        if (!metaSamples.has(k)) metaSamples.set(k, new Set())
        const sample = metaSamples.get(k)
        if (sample.size < 4) sample.add(typeof v === "string" ? v : JSON.stringify(v))
      }
    }
    if (metaKeys.size) {
      console.log("\n  question metadata keys (count — sample values):")
      for (const [k, n] of [...metaKeys.entries()].sort((a, b) => b[1] - a[1])) {
        const samples = [...metaSamples.get(k)].slice(0, 4).join(" | ")
        console.log(`    ${String(n).padStart(4)}  ${k}   e.g. ${samples}`)
      }
    }
  }
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1) })
