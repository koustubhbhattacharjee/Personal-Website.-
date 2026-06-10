#!/usr/bin/env node
// One-shot pre-flight before migration 019_source_reference_jsonb.sql.
// Pulls every questions.source_reference (text) and tries JSON.parse.
// Reports malformed/non-object rows so they can be cleaned before the cast.
//
// Read-only; never writes.

const fs = require("fs")
const path = require("path")
const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1")
  }
}

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !KEY) { console.error("Missing Supabase env"); process.exit(1) }

async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}

async function main() {
  let offset = 0, total = 0, nullCount = 0, parsed = 0, bad = []
  for (;;) {
    const rows = await rest(`questions?select=id,source_reference&limit=1000&offset=${offset}`)
    if (!rows.length) break
    for (const r of rows) {
      total++
      if (r.source_reference == null || r.source_reference === "") { nullCount++; continue }
      const s = r.source_reference
      // PostgREST returns text columns as raw strings.
      try {
        const v = typeof s === "string" ? JSON.parse(s) : s
        if (v == null || typeof v !== "object" || Array.isArray(v)) {
          bad.push({ id: r.id, reason: `parsed but not an object: ${typeof v}`, raw: String(s).slice(0, 120) })
        } else {
          parsed++
        }
      } catch (e) {
        bad.push({ id: r.id, reason: `parse failed: ${e.message}`, raw: String(s).slice(0, 120) })
      }
    }
    offset += rows.length
    if (rows.length < 1000) break
  }
  console.log(`questions scanned: ${total}`)
  console.log(`  null/empty source_reference: ${nullCount}`)
  console.log(`  parses to object:            ${parsed}`)
  console.log(`  PROBLEM rows:                ${bad.length}`)
  if (bad.length) {
    console.log("\nFirst 20 bad rows:")
    for (const b of bad.slice(0, 20)) console.log(`  ${b.id}  ${b.reason}\n    raw: ${b.raw}`)
    process.exitCode = 2
  } else {
    console.log("\nSafe to cast text → jsonb.")
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
