#!/usr/bin/env node
// scripts/seed-9ma0-overlays.cjs
// Seeds the Y1 and Y2 Pearson overlay JSONs into Supabase via the seed-overlay logic.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/seed-9ma0-overlays.cjs
//   Add --dry-run to preview without writing.

const fs   = require("fs")
const path = require("path")

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY
const DRY_RUN = process.argv.includes("--dry-run")

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set")
  process.exit(1)
}

// ─────────────────────────────────────────────
//  Supabase REST helpers
// ─────────────────────────────────────────────

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  })
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`)
  return res.json()
}

async function sbPost(path, body, headers = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : []
}

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${await res.text()}`)
}

async function sbDelete(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: "DELETE",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  })
  if (!res.ok) throw new Error(`DELETE ${path} → ${res.status}: ${await res.text()}`)
}

// ─────────────────────────────────────────────
//  Lookup helpers
// ─────────────────────────────────────────────

async function resolveContentBank(key) {
  const rows = await sbGet(`content_banks?key=eq.${encodeURIComponent(key)}&select=id,key,framework_id&limit=1`)
  if (!rows.length) throw new Error(`Content bank not found: ${key}`)
  return rows[0]
}

const _sloCache = {}
async function resolveSlo(code, frameworkId) {
  const k = `${frameworkId}::${code}`
  if (_sloCache[k] !== undefined) return _sloCache[k]

  // Try direct ID lookup first (SLO IDs ARE the codes in 9MA0)
  const byId = await sbGet(`sub_learning_objectives?id=eq.${encodeURIComponent(code)}&select=id&limit=1`).catch(() => [])
  if (byId.length) { _sloCache[k] = byId[0].id; return byId[0].id }

  // Fall back to code field match
  const byCode = await sbGet(`sub_learning_objectives?code=eq.${encodeURIComponent(code)}&select=id&limit=1`).catch(() => [])
  const id = byCode.length ? byCode[0].id : null
  _sloCache[k] = id
  return id
}

// ─────────────────────────────────────────────
//  Seed one overlay
// ─────────────────────────────────────────────

async function seedOverlay(overlay, dryRun) {
  const bank = await resolveContentBank(overlay.content_bank_key)
  console.log(`\nContent bank: ${bank.key} (${bank.id}), framework: ${bank.framework_id}`)

  // Validate SLOs upfront
  const allSlos = overlay.units.flatMap(u => u.sections.flatMap(s => s.slos || []))
  const misses = []
  for (const item of allSlos) {
    const id = await resolveSlo(item.slo, bank.framework_id)
    if (!id) misses.push(item.slo)
  }
  if (misses.length) {
    console.error(`SLO misses (${misses.length}):`, [...new Set(misses)])
    throw new Error("Aborting — fix SLO codes before seeding")
  }
  console.log(`  SLO validation: ${allSlos.length} codes all resolved ✓`)

  // Validate weights
  for (const unit of overlay.units) {
    for (const section of unit.sections) {
      const total = (section.slos || []).reduce((s, x) => s + Number(x.weight), 0)
      if (Math.abs(total - 1.0) > 0.01) {
        throw new Error(`Section ${section.section_key} weights sum to ${total.toFixed(3)}, must be 1.0`)
      }
    }
  }
  console.log(`  Weight validation: all sections sum to 1.0 ✓`)

  if (dryRun) {
    const sectionCount = overlay.units.reduce((s, u) => s + u.sections.length, 0)
    console.log(`  DRY RUN — would seed: ${overlay.units.length} units, ${sectionCount} sections`)
    return
  }

  // Upsert school_overlay
  const existingOverlay = await sbGet(`school_overlays?overlay_key=eq.${encodeURIComponent(overlay.overlay_key)}&content_bank_id=eq.${bank.id}&select=id&limit=1`)
  let overlayId
  if (existingOverlay.length) {
    overlayId = existingOverlay[0].id
    await sbPatch(`school_overlays?id=eq.${overlayId}`, {
      source_label: overlay.source_label,
      source_kind: overlay.source_kind || "textbook",
    })
    console.log(`  Overlay: updated existing ${overlayId}`)
  } else {
    // subject_id is required by the schema — use the subject linked to this content bank,
    // or fall back to the AS level subject for the 9MA0 student
    const subjectRows = await sbGet(`subjects?content_bank_id=eq.${bank.id}&select=id&limit=1`).catch(() => [])
    const subjectId = subjectRows[0]?.id || "310ea9b0-c9ef-808f-bfb4-c7ce224a3b97"

    const rows = await sbPost("school_overlays?select=id", {
      content_bank_id: bank.id,
      overlay_key: overlay.overlay_key,
      source_label: overlay.source_label,
      source_kind: overlay.source_kind || "textbook",
      subject_id: subjectId,
    }, { Prefer: "return=representation" })
    overlayId = rows[0].id
    console.log(`  Overlay: created ${overlayId}`)
  }

  let unitCount = 0, sectionCount = 0, sloCount = 0

  for (const unit of overlay.units) {
    // Upsert unit
    const existingUnit = await sbGet(`school_units?overlay_id=eq.${overlayId}&unit_key=eq.${encodeURIComponent(unit.unit_key)}&select=id&limit=1`)
    let unitId
    if (existingUnit.length) {
      unitId = existingUnit[0].id
      await sbPatch(`school_units?id=eq.${unitId}`, {
        unit_name: unit.unit_name,
        unit_type: unit.unit_type || "textbook",
        sequence_index: unit.sequence_index,
      })
    } else {
      const rows = await sbPost("school_units?select=id", {
        overlay_id: overlayId,
        unit_key: unit.unit_key,
        unit_name: unit.unit_name,
        unit_type: unit.unit_type || "textbook",
        sequence_index: unit.sequence_index,
      }, { Prefer: "return=representation" })
      unitId = rows[0].id
    }
    unitCount++

    // Optionally create mirror "Extra" unit
    if (overlay.create_external_mirror) {
      const mirrorKey = `${unit.unit_key}-extra`
      const existingMirror = await sbGet(`school_units?overlay_id=eq.${overlayId}&unit_key=eq.${encodeURIComponent(mirrorKey)}&select=id&limit=1`)
      if (!existingMirror.length) {
        await sbPost("school_units", {
          overlay_id: overlayId,
          unit_key: mirrorKey,
          unit_name: `${unit.unit_name} — Extra`,
          unit_type: "external",
          sequence_index: unit.sequence_index,
        }, { Prefer: "return=minimal" })
      }
    }

    for (const section of unit.sections) {
      // Upsert section
      const existingSection = await sbGet(`school_sections?unit_id=eq.${unitId}&section_key=eq.${encodeURIComponent(section.section_key)}&select=id&limit=1`)
      let sectionId
      if (existingSection.length) {
        sectionId = existingSection[0].id
        await sbPatch(`school_sections?id=eq.${sectionId}`, {
          section_label: section.section_label,
          sequence_index: section.sequence_index,
        })
      } else {
        const rows = await sbPost("school_sections?select=id", {
          unit_id: unitId,
          section_key: section.section_key,
          section_label: section.section_label,
          sequence_index: section.sequence_index,
        }, { Prefer: "return=representation" })
        sectionId = rows[0].id
      }
      sectionCount++

      // Replace SLO links
      await sbDelete(`school_section_slos?school_section_id=eq.${sectionId}`)
      for (const sloItem of section.slos || []) {
        const sloId = await resolveSlo(sloItem.slo, bank.framework_id)
        await sbPost("school_section_slos", {
          school_section_id: sectionId,
          slo_id: sloId,
          weight: sloItem.weight,
        }, { Prefer: "return=minimal" })
        sloCount++
      }
    }
  }

  console.log(`  Seeded: ${unitCount} units, ${sectionCount} sections, ${sloCount} SLO links`)
}

// ─────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────

async function main() {
  const files = [
    path.join(__dirname, "../data/overlay-pearson-9ma0-y1.json"),
    path.join(__dirname, "../data/overlay-pearson-9ma0-y2.json"),
    path.join(__dirname, "../data/overlay-pearson-9ma0-full.json"),
  ]

  for (const file of files) {
    const overlay = JSON.parse(fs.readFileSync(file, "utf8"))
    console.log(`\n═══════════════════════════════════════`)
    console.log(`Seeding: ${overlay.overlay_key}`)
    console.log(`═══════════════════════════════════════`)
    await seedOverlay(overlay, DRY_RUN)
  }

  console.log(`\nDone${DRY_RUN ? " (dry run)" : ""}.`)
}

main().catch(err => {
  console.error("Fatal:", err.message)
  process.exit(1)
})
