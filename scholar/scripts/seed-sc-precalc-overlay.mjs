// scripts/seed-sc-precalc-overlay.mjs
// Run: node scripts/seed-sc-precalc-overlay.mjs [--dry-run]
// Seeds the SC Precalculus school overlay into Supabase.

import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

const SUPABASE_URL = "https://xqkysqvdabwzdqbuirep.supabase.co"
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY
if (!SUPABASE_KEY) {
  console.error("Set SUPABASE_SECRET_KEY in the environment to run this script.")
  process.exit(1)
}
const DRY_RUN = process.argv.includes("--dry-run")

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
}

async function rest(path, { method = "GET", body, prefer } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path.replace(/^\//, "")}`
  const h = { ...headers }
  if (prefer) h.Prefer = prefer
  const res = await fetch(url, {
    method,
    headers: h,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${JSON.stringify(data)}`)
  return data
}

async function select(table, filters = {}, select = "*", limit = 1000) {
  let qs = `select=${select}&limit=${limit}`
  for (const [k, v] of Object.entries(filters)) qs += `&${k}=eq.${encodeURIComponent(v)}`
  return rest(`${table}?${qs}`)
}

async function upsert(table, rows, onConflict) {
  const qs = onConflict ? `on_conflict=${onConflict}` : ""
  return rest(`${table}${qs ? "?" + qs : ""}`, {
    method: "POST",
    body: rows,
    prefer: "return=representation,resolution=merge-duplicates",
  })
}

// ─── Load section-SLO map ───────────────────────────────────────────────────
const sloMapFile = join(ROOT, "data/sc-precalculus-section-slo-map.json")
const sloMap = JSON.parse(readFileSync(sloMapFile, "utf8"))
const sectionMap = sloMap.section_slo_map

// ─── Build overlay payload ───────────────────────────────────────────────────
// Group sections by unit
const unitOrder = [
  { key: "chapter_A",  name: "Appendix A — Prerequisites",                        sections: ["A2","A4","A5"] },
  { key: "chapter_1",  name: "Chapter 1 — Functions and Their Graphs",             sections: ["1.4","1.5","1.6","1.7","1.8","1.9"] },
  { key: "chapter_2",  name: "Chapter 2 — Polynomial and Rational Functions",      sections: ["2.3","2.6","2.7"] },
  { key: "chapter_3",  name: "Chapter 3 — Exponential and Logarithmic Functions",  sections: ["3.1","3.2","3.3","3.4","3.5"] },
  { key: "chapter_4",  name: "Chapter 4 — Trigonometric Functions",                sections: ["4.1","4.2","4.4","4.5","4.6","4.7","4.8"] },
  { key: "chapter_5",  name: "Chapter 5 — Analytic Trigonometry",                  sections: ["5.1","5.2","5.3","5.4","5.5"] },
  { key: "chapter_6",  name: "Chapter 6 — Additional Topics in Trigonometry",      sections: ["6.1","6.2","6.3","6.4","6.5","6.6"] },
  { key: "chapter_7",  name: "Chapter 7 — Systems of Equations and Inequalities",  sections: ["7.1","7.2"] },
  { key: "chapter_8",  name: "Chapter 8 — Matrices and Determinants",              sections: ["8.1","8.2","8.3","8.4","8.5"] },
  { key: "chapter_10", name: "Chapter 10 — Analytic Geometry in Three Dimensions", sections: ["10.2","10.3","10.4","10.7","10.8"] },
]

// ─── Step 1: find content bank ───────────────────────────────────────────────
console.log("Looking up content banks...")
const banks = await select("content_banks", {}, "id,key,label,framework_id")
console.log("Available content banks:")
banks.forEach(b => console.log(`  ${b.key} — ${b.label} (framework: ${b.framework_id})`))

// Find SC precalc bank
const bank = banks.find(b =>
  b.key?.toLowerCase().includes("precalc") ||
  b.label?.toLowerCase().includes("precalc") ||
  b.key?.toLowerCase().includes("south_carolina")
)

if (!bank) {
  console.error("\nNo SC Precalculus content bank found. Available keys above. Set BANK_KEY manually.")
  process.exit(1)
}
console.log(`\nUsing bank: ${bank.key} — ${bank.label} (id: ${bank.id})`)

// ─── Step 2: resolve SLO codes → UUIDs ──────────────────────────────────────
const allSloCodes = new Set()
for (const sec of Object.values(sectionMap)) {
  for (const sw of sec.slo_weights) allSloCodes.add(sw.slo)
}

console.log(`\nResolving ${allSloCodes.size} SLO codes...`)
const sloIdMap = {}
const sloMisses = []

for (const code of allSloCodes) {
  const rows = await select("sub_learning_objectives", { id: code }, "id")
  if (rows?.length) {
    sloIdMap[code] = rows[0].id
  } else {
    sloMisses.push(code)
  }
}

if (sloMisses.length) {
  console.warn(`\nSLO codes not found in DB (will skip): ${sloMisses.join(", ")}`)
}

console.log(`Resolved ${Object.keys(sloIdMap).length}/${allSloCodes.size} SLO codes`)

if (DRY_RUN) {
  console.log("\n[DRY RUN] Would seed:")
  for (const unit of unitOrder) {
    console.log(`  Unit: ${unit.name}`)
    for (const sk of unit.sections) {
      const s = sectionMap[sk]
      if (!s) continue
      console.log(`    ${sk}: ${s.label}`)
      for (const sw of s.slo_weights) {
        const resolved = sloIdMap[sw.slo] ? "✓" : "✗ MISSING"
        console.log(`      ${sw.slo} (${sw.weight}) ${resolved}`)
      }
    }
  }
  process.exit(0)
}

// ─── Step 3: upsert school_overlays ─────────────────────────────────────────
console.log("\nUpserting overlay...")
const existingOverlay = await select("school_overlays", { content_bank_id: bank.id, overlay_key: "sc-precalculus-standard" }, "id")

let overlayId
if (existingOverlay?.length) {
  overlayId = existingOverlay[0].id
  await rest(`school_overlays?id=eq.${overlayId}`, {
    method: "PATCH",
    body: { source_label: "Precalculus with Limits 4E (Larson)", source_kind: "textbook", is_active: true, updated_at: new Date().toISOString() },
    prefer: "return=minimal",
  })
  console.log(`Updated existing overlay: ${overlayId}`)
} else {
  const rows = await upsert("school_overlays", [{
    content_bank_id: bank.id,
    subject_id: "310ea9b0-c9ef-8071-a848-cdab53a5e855",
    overlay_key: "sc-precalculus-standard",
    source_label: "Precalculus with Limits 4E (Larson)",
    source_kind: "textbook",
    notes: "SC Pre-Calculus Honors 2025-2026. Sections from Larson Precalculus with Limits 4E.",
    is_active: true,
  }])
  overlayId = Array.isArray(rows) ? rows[0]?.id : rows?.id
  console.log(`Created overlay: ${overlayId}`)
}

// ─── Step 4: upsert units + sections + SLO links ─────────────────────────────
let stats = { unitsCreated: 0, unitsUpdated: 0, sectionsCreated: 0, sectionsUpdated: 0, sloLinks: 0 }

for (const [unitIdx, unit] of unitOrder.entries()) {
  // Upsert unit
  const existingUnit = await select("school_units", { overlay_id: overlayId, unit_key: unit.key }, "id")
  let unitId
  if (existingUnit?.length) {
    unitId = existingUnit[0].id
    await rest(`school_units?id=eq.${unitId}`, {
      method: "PATCH",
      body: { unit_name: unit.name, unit_type: "textbook", sequence_index: unitIdx + 1, metadata: {} },
      prefer: "return=minimal",
    })
    stats.unitsUpdated++
  } else {
    const rows = await upsert("school_units", [{
      overlay_id: overlayId, unit_key: unit.key, unit_name: unit.name,
      unit_type: "textbook", sequence_index: unitIdx + 1, metadata: {},
    }])
    unitId = Array.isArray(rows) ? rows[0]?.id : rows?.id
    stats.unitsCreated++
  }

  // Upsert sections
  for (const [secIdx, sectionKey] of unit.sections.entries()) {
    const secData = sectionMap[sectionKey]
    if (!secData) { console.warn(`  No data for section ${sectionKey}, skipping`); continue }

    const existingSec = await select("school_sections", { unit_id: unitId, section_key: sectionKey }, "id")
    let sectionId
    const secFields = {
      section_label: `${sectionKey} ${secData.label}`,
      section_title: secData.label,
      textbook_ref: sectionKey,
      sequence_index: secIdx + 1,
      metadata: { primary_slo: secData.primary_slo },
    }
    if (existingSec?.length) {
      sectionId = existingSec[0].id
      await rest(`school_sections?id=eq.${sectionId}`, { method: "PATCH", body: secFields, prefer: "return=minimal" })
      stats.sectionsUpdated++
    } else {
      const rows = await upsert("school_sections", [{ unit_id: unitId, section_key: sectionKey, ...secFields }])
      sectionId = Array.isArray(rows) ? rows[0]?.id : rows?.id
      stats.sectionsCreated++
    }

    // Replace SLO links
    await rest(`school_section_slos?school_section_id=eq.${sectionId}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {})
    const sloRows = secData.slo_weights
      .filter(sw => sloIdMap[sw.slo])
      .map(sw => ({ school_section_id: sectionId, slo_id: sloIdMap[sw.slo], weight: sw.weight, role: "aligned" }))
    if (sloRows.length) {
      await upsert("school_section_slos", sloRows)
      stats.sloLinks += sloRows.length
    }

    console.log(`  ✓ ${sectionKey}: ${secData.label} (${sloRows.length} SLOs)`)
  }
}

console.log("\n✅ Done!", stats)
