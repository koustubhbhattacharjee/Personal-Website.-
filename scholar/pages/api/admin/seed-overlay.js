// ─────────────────────────────────────────────────────────────────────────────
//  pages/api/admin/seed-overlay.js
//  Seeds a school overlay (units → sections → SLO weights) into Supabase.
//
//  GET  → returns content_banks for UI dropdown
//  POST → accepts overlay JSON, resolves SLO codes, upserts into
//         school_overlays, school_units, school_sections, school_section_slos
//
//  Input JSON shape:
//  {
//    "content_bank_key": "edexcel::as level",   // or content_bank_id (UUID)
//    "overlay_key": "edexcel_as_level_standard",
//    "source_label": "Pearson AS Level Pure Mathematics",
//    "source_kind": "textbook",
//    "notes": "...",
//    "create_external_mirror": true,             // auto-create "Extra" units
//    "units": [
//      {
//        "unit_key": "chapter_1",
//        "unit_name": "Chapter 1: Algebraic Expressions",
//        "unit_type": "textbook",                // default "textbook"
//        "sequence_index": 1,
//        "sections": [
//          {
//            "section_key": "1.1",
//            "section_label": "1.1 Index Laws",
//            "section_title": "Index Laws",
//            "textbook_ref": null,
//            "sequence_index": 1,
//            "slos": [
//              { "slo": "9MA0.P1.1.1", "weight": 0.6 },
//              { "slo": "9MA0.P1.1.2", "weight": 0.4 }
//            ]
//          }
//        ]
//      }
//    ]
//  }
//
//  POST body: { action: "seed_overlay", overlayJson, dryRun?: true }
// ─────────────────────────────────────────────────────────────────────────────

import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { supabaseSelect, supabaseInsert, supabaseRest } from "../../../lib/supabase"
import { ensureOverlayNativePacing } from "../../../lib/pacing-guide"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

// ─────────────────────────────────────────────
//  Lookup helpers (request-scoped caches)
// ─────────────────────────────────────────────

const _bankCache = {}
async function resolveContentBank(keyOrId) {
  if (!keyOrId) return null
  if (_bankCache[keyOrId]) return _bankCache[keyOrId]

  // Try UUID first, then key
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(keyOrId)
  const rows = await supabaseSelect("content_banks", {
    select: "id,key,label,framework_id",
    filters: isUuid ? { id: keyOrId } : { key: keyOrId },
    limit: 1,
  })
  const row = rows[0] || null
  if (row) {
    _bankCache[keyOrId] = row
    _bankCache[row.id] = row
    _bankCache[row.key] = row
  }
  return row
}

const _sloCache = {}
async function resolveSloCode(shortCode, frameworkId) {
  if (!shortCode || !frameworkId) return null
  const cacheKey = `${frameworkId}::${shortCode}`
  if (_sloCache[cacheKey] !== undefined) return _sloCache[cacheKey]

  // SLO ids are text PKs matching the code itself — try direct lookup first
  const directRows = await supabaseSelect("sub_learning_objectives", {
    select: "id,code",
    filters: { id: shortCode },
    limit: 1,
  })
  if (directRows.length) {
    _sloCache[cacheKey] = directRows[0].id
    return directRows[0].id
  }

  // Fall back to code match with framework filter via join
  const rows = await supabaseRest(
    `sub_learning_objectives?select=id&code=eq.${encodeURIComponent(shortCode)}&limit=1`,
    { method: "GET" }
  ).catch(() => [])
  const id = Array.isArray(rows) && rows.length ? rows[0].id : null
  _sloCache[cacheKey] = id
  return id
}

// ─────────────────────────────────────────────
//  Upsert helpers
// ─────────────────────────────────────────────

async function upsertOverlay(contentBankId, overlayKey, fields) {
  const existing = await supabaseSelect("school_overlays", {
    select: "id",
    filters: { content_bank_id: contentBankId, overlay_key: overlayKey },
    limit: 1,
  })
  if (existing.length) {
    const id = existing[0].id
    await supabaseRest(`school_overlays?id=eq.${id}`, {
      method: "PATCH",
      body: { ...fields, updated_at: new Date().toISOString() },
      headers: { Prefer: "return=minimal" },
    }).catch(() => {})
    return { id, created: false }
  }
  const rows = await supabaseInsert("school_overlays", [{ content_bank_id: contentBankId, overlay_key: overlayKey, ...fields }])
  return { id: (Array.isArray(rows) ? rows[0] : rows)?.id, created: true }
}

async function upsertUnit(overlayId, unitKey, fields) {
  const existing = await supabaseSelect("school_units", {
    select: "id",
    filters: { overlay_id: overlayId, unit_key: unitKey },
    limit: 1,
  })
  if (existing.length) {
    const id = existing[0].id
    await supabaseRest(`school_units?id=eq.${id}`, {
      method: "PATCH",
      body: fields,
      headers: { Prefer: "return=minimal" },
    }).catch(() => {})
    return { id, created: false }
  }
  const rows = await supabaseInsert("school_units", [{ overlay_id: overlayId, unit_key: unitKey, ...fields }])
  return { id: (Array.isArray(rows) ? rows[0] : rows)?.id, created: true }
}

async function upsertSection(unitId, sectionKey, fields) {
  const existing = await supabaseSelect("school_sections", {
    select: "id",
    filters: { unit_id: unitId, section_key: sectionKey },
    limit: 1,
  })
  if (existing.length) {
    const id = existing[0].id
    await supabaseRest(`school_sections?id=eq.${id}`, {
      method: "PATCH",
      body: fields,
      headers: { Prefer: "return=minimal" },
    }).catch(() => {})
    return { id, created: false }
  }
  const rows = await supabaseInsert("school_sections", [{ unit_id: unitId, section_key: sectionKey, ...fields }])
  return { id: (Array.isArray(rows) ? rows[0] : rows)?.id, created: true }
}

// Replace all SLO links for a section (delete + insert for clean weight updates)
async function replaceSectionSlos(sectionId, sloRows) {
  if (!sloRows.length) return
  // Delete existing
  await supabaseRest(`school_section_slos?school_section_id=eq.${sectionId}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }).catch(() => {})
  // Insert fresh
  await supabaseInsert("school_section_slos", sloRows)
}

// ─────────────────────────────────────────────
//  Validation
// ─────────────────────────────────────────────

function validateWeights(sections) {
  const errors = []
  for (const section of sections) {
    const slos = Array.isArray(section.slos) ? section.slos : []
    if (!slos.length) continue
    const total = slos.reduce((sum, s) => sum + Number(s.weight || 0), 0)
    if (Math.abs(total - 1.0) > 0.001) {
      errors.push(`Section "${section.section_key}": SLO weights sum to ${total.toFixed(4)}, expected 1.0`)
    }
    for (const s of slos) {
      if (Number(s.weight) <= 0 || Number(s.weight) > 1) {
        errors.push(`Section "${section.section_key}": weight ${s.weight} for SLO "${s.slo}" is out of range (0, 1]`)
      }
    }
  }
  return errors
}

// ─────────────────────────────────────────────
//  Core seed function
// ─────────────────────────────────────────────

async function seedOverlay(payload, dryRun = false) {
  const contentBankKeyOrId = String(payload.content_bank_key || payload.content_bank_id || "").trim()
  if (!contentBankKeyOrId) throw new Error("content_bank_key or content_bank_id is required")

  const bank = await resolveContentBank(contentBankKeyOrId)
  if (!bank) throw new Error(`Content bank "${contentBankKeyOrId}" not found`)
  if (!bank.framework_id) throw new Error(`Content bank "${bank.key}" has no framework_id — cannot resolve SLO codes`)

  const overlayKey   = String(payload.overlay_key   || "").trim()
  const sourceLabel  = String(payload.source_label  || "").trim() || null
  const sourceKind   = String(payload.source_kind   || "textbook").trim()
  const notes        = String(payload.notes         || "").trim() || null
  const createMirror = payload.create_external_mirror !== false  // default true

  if (!overlayKey) throw new Error("overlay_key is required")

  const units = Array.isArray(payload.units) ? payload.units : []
  if (!units.length) throw new Error("units array is empty")

  // ── Validate weights before any writes ───────────────────────────────────
  const weightErrors = []
  for (const unit of units) {
    weightErrors.push(...validateWeights(Array.isArray(unit.sections) ? unit.sections : []))
  }
  if (weightErrors.length) {
    throw new Error(`Weight validation failed:\n${weightErrors.join("\n")}`)
  }

  // ── Resolve all SLO codes upfront (collect misses) ───────────────────────
  const sloMisses = []
  const sloResolutionMap = {}  // shortCode → UUID
  const allSloCodes = new Set()
  for (const unit of units) {
    for (const section of (unit.sections || [])) {
      for (const s of (section.slos || [])) {
        if (s.slo) allSloCodes.add(String(s.slo).trim())
      }
    }
  }
  await Promise.all([...allSloCodes].map(async (code) => {
    const id = await resolveSloCode(code, bank.framework_id)
    if (id) {
      sloResolutionMap[code] = id
    } else {
      sloMisses.push(code)
    }
  }))

  if (sloMisses.length) {
    throw new Error(`SLO codes not found in framework "${bank.framework_id}":\n${sloMisses.join(", ")}`)
  }

  if (dryRun) {
    return {
      dryRun: true,
      contentBankId: bank.id,
      overlayKey,
      unitsCount: units.length,
      sectionsCount: units.reduce((n, u) => n + (u.sections?.length || 0), 0),
      sloLinksCount: units.reduce((n, u) => n + u.sections?.reduce((m, s) => m + (s.slos?.length || 0), 0), 0),
      sloMisses: [],
    }
  }

  // ── Upsert overlay ────────────────────────────────────────────────────────
  const { id: overlayId } = await upsertOverlay(bank.id, overlayKey, {
    source_label: sourceLabel,
    source_kind:  sourceKind,
    notes,
    is_active:    true,
  })

  const stats = {
    overlayId,
    unitsCreated:    0,
    unitsUpdated:    0,
    sectionsCreated: 0,
    sectionsUpdated: 0,
    sloLinksWritten: 0,
    mirrorUnitsCreated: 0,
  }

  // ── Process units ─────────────────────────────────────────────────────────
  for (const unit of units) {
    const unitKey  = String(unit.unit_key  || "").trim()
    const unitName = String(unit.unit_name || "").trim()
    const unitType = String(unit.unit_type || "textbook").trim()
    const seqIdx   = Number(unit.sequence_index || 0)
    if (!unitKey || !unitName) continue

    const { id: unitId, created: unitCreated } = await upsertUnit(overlayId, unitKey, {
      unit_name:      unitName,
      unit_type:      unitType,
      sequence_index: seqIdx,
      metadata:       {},
    })
    if (!unitId) continue
    if (unitCreated) stats.unitsCreated++; else stats.unitsUpdated++

    // ── Process sections ────────────────────────────────────────────────────
    const sections = Array.isArray(unit.sections) ? unit.sections : []
    for (const section of sections) {
      const sectionKey   = String(section.section_key   || "").trim()
      const sectionLabel = String(section.section_label || "").trim()
      const sectionTitle = String(section.section_title || "").trim() || null
      const textbookRef  = String(section.textbook_ref  || "").trim() || null
      const sectionSeq   = Number(section.sequence_index || 0)
      if (!sectionKey || !sectionLabel) continue

      const { id: sectionId, created: sectionCreated } = await upsertSection(unitId, sectionKey, {
        section_label:  sectionLabel,
        section_title:  sectionTitle,
        textbook_ref:   textbookRef,
        sequence_index: sectionSeq,
        metadata:       {},
      })
      if (!sectionId) continue
      if (sectionCreated) stats.sectionsCreated++; else stats.sectionsUpdated++

      // ── SLO links ─────────────────────────────────────────────────────────
      const sloRows = (section.slos || [])
        .map((s) => ({
          school_section_id: sectionId,
          slo_id:            sloResolutionMap[String(s.slo).trim()],
          weight:            Number(s.weight),
          role:              "aligned",   // vestigial, kept for schema compat
          confidence:        s.confidence || null,
          note:              s.note       || null,
        }))
        .filter((r) => r.slo_id && r.weight > 0)

      if (sloRows.length) {
        await replaceSectionSlos(sectionId, sloRows)
        stats.sloLinksWritten += sloRows.length
      }
    }

    // ── External mirror unit ──────────────────────────────────────────────
    if (createMirror && unitType === "textbook") {
      const mirrorKey  = `${unitKey}_extra`
      const mirrorName = `${unitName} — Extra`
      const { id: mirrorUnitId, created: mirrorCreated } = await upsertUnit(overlayId, mirrorKey, {
        unit_name:      mirrorName,
        unit_type:      "external",
        sequence_index: seqIdx,
        metadata:       { mirrors: unitKey },
      })
      if (mirrorCreated) stats.mirrorUnitsCreated++

      // Mirror sections share the same SLO weights — they are the external projection layer
      // Sections are created inside the mirror unit matching the textbook unit's sections
      for (const section of sections) {
        const sectionKey   = String(section.section_key   || "").trim()
        const sectionLabel = String(section.section_label || "").trim()
        const sectionTitle = String(section.section_title || "").trim() || null
        const sectionSeq   = Number(section.sequence_index || 0)
        if (!sectionKey || !sectionLabel) continue

        if (!mirrorUnitId) continue

        const { id: mirrorSectionId } = await upsertSection(mirrorUnitId, sectionKey, {
          section_label:  sectionLabel,
          section_title:  sectionTitle,
          textbook_ref:   null,
          sequence_index: sectionSeq,
          metadata:       {},
        })
        if (!mirrorSectionId) continue

        const mirrorSloRows = (section.slos || [])
          .map((s) => ({
            school_section_id: mirrorSectionId,
            slo_id:            sloResolutionMap[String(s.slo).trim()],
            weight:            Number(s.weight),
            role:              "aligned",
            confidence:        s.confidence || null,
            note:              null,
          }))
          .filter((r) => r.slo_id && r.weight > 0)

        if (mirrorSloRows.length) {
          await replaceSectionSlos(mirrorSectionId, mirrorSloRows)
        }
      }
    }
  }

  if (overlayId) {
    await ensureOverlayNativePacing(overlayId, { forceNew: true }).catch((err) => {
      console.error("[seed-overlay] ensureOverlayNativePacing failed:", err.message)
    })
  }

  return stats
}

// ─────────────────────────────────────────────
//  Handler
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  // ── GET: dropdown data ─────────────────────
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store")
    const contentBanks = await supabaseSelect("content_banks", {
      select: "id,key,label,subject_name,framework_id",
      orderBy: "label",
    })
    const overlays = await supabaseSelect("school_overlays", {
      select: "id,overlay_key,source_label,content_bank_id",
      orderBy: "overlay_key",
    })
    return res.status(200).json({ contentBanks, overlays })
  }

  if (req.method !== "POST") return res.status(405).end()

  const { action = "seed_overlay", overlayJson, dryRun = false } = req.body

  if (action !== "seed_overlay") {
    return res.status(400).json({ error: `Unknown action: ${action}` })
  }

  if (!overlayJson) return res.status(400).json({ error: "overlayJson is required" })

  let payload
  try {
    payload = typeof overlayJson === "string" ? JSON.parse(overlayJson) : overlayJson
  } catch {
    return res.status(400).json({ error: "overlayJson is not valid JSON" })
  }

  try {
    const stats = await seedOverlay(payload, Boolean(dryRun))
    return res.status(200).json({ ok: true, ...stats })
  } catch (err) {
    console.error("[seed-overlay] failed:", err)
    return res.status(500).json({ error: err.message || "Seed failed" })
  }
}

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } }
}
