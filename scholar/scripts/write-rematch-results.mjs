// Apply re-match results to DB. Skips low-confidence false positives.
// Pass --apply to write.

import fs from "node:fs"
import path from "node:path"

const APPLY = process.argv.includes("--apply")

const envText = fs.readFileSync(path.resolve(".env.local"), "utf8")
const ENV = {}
for (const line of envText.split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m) ENV[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const SUPABASE_URL = ENV.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")
const SUPABASE_KEY = ENV.SUPABASE_SECRET_KEY

async function rest(method, path_, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path_}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok && method !== "GET") throw new Error(`${method} ${path_} ${r.status}: ${await r.text()}`)
  if (method === "GET") return r.json()
}

// Map slug → human worksheet/textbook keys.
const SOURCE_META = {
  fluids_practice_problems_2009_05_13: {
    worksheet_name: "NJCTL AP Physics — Fluids Practice Problems (2009)",
    textbook_key: "njctl_ap_physics_fluids_2009",
  },
  "5stepsapphysics": {
    worksheet_name: "5 Steps to a 5: AP Physics 1",
    textbook_key: "ap_phys1_5steps",
  },
}

// Sources to skip on a 1-hit match (the cached text is too noisy and 1-hit
// matches there are typically false positives on generic phrasing).
const SKIP_LOW_CONFIDENCE = new Set([
  "5stepsapphysics", // a 670-page general prep book; 1-hit there is noise.
])

const rematch = JSON.parse(fs.readFileSync("scripts/cache/ap-physics-1-rematch.json", "utf8"))
console.log(`Loaded ${rematch.length} rematch rows. Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`)

let applied = 0, skippedLow = 0, stillUnmatched = 0

for (const m of rematch) {
  if (!m.best) { stillUnmatched++; continue }
  // Skip false-positive low-confidence on 5steps.
  if (SKIP_LOW_CONFIDENCE.has(m.best.slug) && m.best.hits < 4) {
    skippedLow++
    console.log(`  SKIP (low-conf 5steps hits=${m.best.hits}): ${m.label} ${m.source_id}`)
    continue
  }

  // Fetch existing row to merge.
  const rows = await rest("GET", `questions?select=id,metadata,source_reference&id=eq.${m.qid}`)
  if (!rows.length) { console.log(`  MISS row ${m.qid}`); continue }
  const r = rows[0]
  const meta = SOURCE_META[m.best.slug]
  if (!meta) { console.log(`  NO META for slug ${m.best.slug} (${m.label})`); continue }

  const newMeta = { ...(r.metadata || {}) }
  if (newMeta.flags) {
    const { source_unmatched, reason, ...rest } = newMeta.flags
    newMeta.flags = Object.keys(rest).length ? rest : undefined
    if (newMeta.flags === undefined) delete newMeta.flags
  }
  // After migration 019, source_reference is jsonb; PostgREST returns it parsed.
  const sectionRef = (r.source_reference && r.source_reference.section) || ""
  const exerciseRef = newMeta.label || newMeta.source_id || ""

  const patch = {
    source_file: m.best.file,
    source_page: m.best.page,
    source_reference: {
      worksheet_name: meta.worksheet_name,
      textbook_key: meta.textbook_key,
      page: m.best.page,
      section: sectionRef,
      exercise_ref: exerciseRef,
    },
    metadata: newMeta,
  }
  console.log(`  ASSIGN ${m.label.padEnd(14)} → ${m.best.file} p${m.best.page} (hits=${m.best.hits})`)
  if (APPLY) {
    await rest("PATCH", `questions?id=eq.${m.qid}`, patch)
    applied++
  }
}

console.log(`\nApplied: ${applied}, skipped (low-conf): ${skippedLow}, still unmatched: ${stillUnmatched}`)
console.log(APPLY ? "Done." : "(dry-run — pass --apply to write)")
