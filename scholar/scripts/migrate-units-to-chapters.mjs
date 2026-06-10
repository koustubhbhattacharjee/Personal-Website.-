// scripts/migrate-units-to-chapters.mjs
// Restructures SC Precalc school_units from "unit_X_part_Y" groupings to chapter-based groupings

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
const OVERLAY_ID = "76fc48c6-8268-4b83-a2db-9330b9c30ffa"
const NATIVE_GUIDE_ID = "91562b14-5153-413d-bc47-dc89f0faccf2"

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
  const res = await fetch(url, { method, headers: h, body: body != null ? JSON.stringify(body) : undefined })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(data)}`)
  return data
}

const sloMapFile = join(ROOT, "data/sc-precalculus-section-slo-map.json")
const sloMap = JSON.parse(readFileSync(sloMapFile, "utf8"))
const sectionMap = sloMap.section_slo_map

// Chapter-based unit structure
const chapterOrder = [
  { key: "chapter_A",  name: "Appendix A — Prerequisites",                         sections: ["A2","A4","A5"] },
  { key: "chapter_1",  name: "Chapter 1 — Functions and Their Graphs",              sections: ["1.4","1.5","1.6","1.7","1.8","1.9"] },
  { key: "chapter_2",  name: "Chapter 2 — Polynomial and Rational Functions",       sections: ["2.3","2.6","2.7"] },
  { key: "chapter_3",  name: "Chapter 3 — Exponential and Logarithmic Functions",   sections: ["3.1","3.2","3.3","3.4","3.5"] },
  { key: "chapter_4",  name: "Chapter 4 — Trigonometric Functions",                 sections: ["4.1","4.2","4.4","4.5","4.6","4.7","4.8"] },
  { key: "chapter_5",  name: "Chapter 5 — Analytic Trigonometry",                   sections: ["5.1","5.2","5.3","5.4","5.5"] },
  { key: "chapter_6",  name: "Chapter 6 — Additional Topics in Trigonometry",       sections: ["6.1","6.2","6.3","6.4","6.5","6.6"] },
  { key: "chapter_7",  name: "Chapter 7 — Systems of Equations and Inequalities",   sections: ["7.1","7.2"] },
  { key: "chapter_8",  name: "Chapter 8 — Matrices and Determinants",               sections: ["8.1","8.2","8.3","8.4","8.5"] },
  { key: "chapter_10", name: "Chapter 10 — Analytic Geometry in Three Dimensions",  sections: ["10.2","10.3","10.4","10.7","10.8"] },
]

// ── Step 1: Resolve SLO codes → UUIDs ───────────────────────────────────────
const allSloCodes = new Set()
for (const sec of Object.values(sectionMap)) {
  for (const sw of sec.slo_weights) allSloCodes.add(sw.slo)
}
const sloIdMap = {}
for (const code of allSloCodes) {
  const rows = await rest(`sub_learning_objectives?id=eq.${encodeURIComponent(code)}&select=id`)
  if (rows?.length) sloIdMap[code] = rows[0].id
}
console.log(`Resolved ${Object.keys(sloIdMap).length}/${allSloCodes.size} SLO codes`)

// ── Step 2: Delete existing units (cascades to sections + slo links) ─────────
console.log("\nDeleting existing school_units for overlay...")
const existingUnits = await rest(`school_units?overlay_id=eq.${OVERLAY_ID}&select=id`)
for (const unit of existingUnits || []) {
  // Delete slo links for each section in this unit
  const sections = await rest(`school_sections?unit_id=eq.${unit.id}&select=id`)
  for (const sec of sections || []) {
    await rest(`school_section_slos?school_section_id=eq.${sec.id}`, { method: "DELETE", prefer: "return=minimal" })
  }
  await rest(`school_sections?unit_id=eq.${unit.id}`, { method: "DELETE", prefer: "return=minimal" })
  await rest(`school_units?id=eq.${unit.id}`, { method: "DELETE", prefer: "return=minimal" })
}
console.log(`Deleted ${existingUnits?.length || 0} old units`)

// ── Step 3: Create new chapter-based units + sections ────────────────────────
console.log("\nCreating chapter-based units...")
const newSectionEntries = []

for (const [idx, chapter] of chapterOrder.entries()) {
  const unitRows = await rest(`school_units`, {
    method: "POST",
    body: [{
      overlay_id: OVERLAY_ID,
      unit_key: chapter.key,
      unit_name: chapter.name,
      unit_type: "textbook",
      sequence_index: idx + 1,
      metadata: {},
    }],
    prefer: "return=representation,resolution=merge-duplicates",
  })
  const unitId = Array.isArray(unitRows) ? unitRows[0]?.id : unitRows?.id
  console.log(`  ✓ ${chapter.key}: ${chapter.name} (id: ${unitId})`)

  for (const [secIdx, sectionKey] of chapter.sections.entries()) {
    const secData = sectionMap[sectionKey]
    if (!secData) { console.warn(`    No data for ${sectionKey}, skipping`); continue }

    const secRows = await rest(`school_sections`, {
      method: "POST",
      body: [{
        unit_id: unitId,
        section_key: sectionKey,
        section_label: `${sectionKey} ${secData.label}`,
        section_title: secData.label,
        textbook_ref: sectionKey,
        sequence_index: secIdx + 1,
        metadata: { primary_slo: secData.primary_slo },
      }],
      prefer: "return=representation,resolution=merge-duplicates",
    })
    const sectionId = Array.isArray(secRows) ? secRows[0]?.id : secRows?.id

    const sloRows = secData.slo_weights
      .filter(sw => sloIdMap[sw.slo])
      .map(sw => ({ school_section_id: sectionId, slo_id: sloIdMap[sw.slo], weight: sw.weight, role: "aligned" }))
    if (sloRows.length) {
      await rest(`school_section_slos`, {
        method: "POST",
        body: sloRows,
        prefer: "return=minimal,resolution=merge-duplicates",
      })
    }

    newSectionEntries.push({ sectionId, skipped: false })
    console.log(`    ${sectionKey}: ${secData.label} (${sloRows.length} SLOs)`)
  }
}

// ── Step 4: Rebuild native pacing guide sections ─────────────────────────────
console.log("\nRebulding native pacing guide sections...")
await rest(`pacing_guides?id=eq.${NATIVE_GUIDE_ID}`, {
  method: "PATCH",
  body: { sections: newSectionEntries },
  prefer: "return=minimal",
})
console.log(`Updated native guide with ${newSectionEntries.length} sections`)

console.log("\n✅ Done!")
