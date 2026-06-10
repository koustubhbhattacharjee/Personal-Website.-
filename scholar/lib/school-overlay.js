function clean(value = "") {
  return String(value || "").trim()
}

function uniqueStrings(values = []) {
  const out = []
  const seen = new Set()
  for (const value of values || []) {
    const key = clean(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(key)
  }
  return out
}

function inferUnitFromSection(section = "") {
  const raw = clean(section)
  if (!raw) return { key: "", name: "" }

  const appendixMatch = raw.match(/^([A-Za-z])(?:[.\s]|$)/)
  if (appendixMatch && /^[A-Za-z]\.\d+/.test(raw)) {
    const letter = appendixMatch[1].toUpperCase()
    return { key: `appendix_${letter}`, name: `Appendix ${letter}` }
  }

  const chapterMatch = raw.match(/^(\d+)(?:[.\s]|$)/)
  if (chapterMatch) {
    const chapter = chapterMatch[1]
    return { key: `chapter_${chapter}`, name: `Chapter ${chapter}` }
  }

  return { key: raw.toLowerCase().replace(/[^a-z0-9]+/g, "_"), name: raw }
}

function normalizeUnit(raw = "", fallbackSection = "") {
  const explicit = clean(raw)
  if (explicit) {
    return {
      key: explicit.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      name: explicit,
    }
  }
  return inferUnitFromSection(fallbackSection)
}

function registerUnit(units = [], seen = new Set(), key = "", name = "") {
  const unitKey = clean(key)
  const unitName = clean(name)
  if (!unitKey || seen.has(unitKey)) return
  seen.add(unitKey)
  units.push({ key: unitKey, name: unitName || unitKey })
}

function collectLoCodesFromBlock(block = {}) {
  return uniqueStrings([
    block?.primary_lo,
    ...(Array.isArray(block?.lo_codes) ? block.lo_codes : []),
    ...(Array.isArray(block?.primary_lo_codes) ? block.primary_lo_codes : []),
  ])
}

function collectLoCodesFromSection(section = {}) {
  const primary = Array.isArray(section?.primary_alignments)
    ? section.primary_alignments.map((item) => item?.code)
    : []
  const fallback = Array.isArray(section?.primary_lo_codes)
    ? section.primary_lo_codes
    : []
  const supportingOnly = !primary.length && !fallback.length && Array.isArray(section?.supporting_alignments)
    ? section.supporting_alignments.map((item) => item?.code)
    : []
  return uniqueStrings([...primary, ...fallback, ...supportingOnly])
}

export function deriveSchoolOverlayFromJson(payload = {}) {
  const byLo = {}
  const units = []
  const unitSeen = new Set()
  let sequence = 0

  if (Array.isArray(payload?.scheduleBlocks)) {
    payload.scheduleBlocks.forEach((block, blockIndex) => {
      const sectionLabel = Array.isArray(block?.sections) ? block.sections.map(clean).filter(Boolean).join(", ") : ""
      const unit = normalizeUnit(
        block?.school_unit_name || block?.schoolUnitName || block?.unit || block?.unit_label || block?.chapter || "",
        Array.isArray(block?.sections) ? block.sections[0] : ""
      )
      registerUnit(units, unitSeen, unit.key, unit.name)
      const loCodes = collectLoCodesFromBlock(block)
      loCodes.forEach((code) => {
        if (byLo[code]) return
        byLo[code] = {
          schoolUnitKey: unit.key || "",
          schoolUnitName: unit.name || "",
          schoolSection: sectionLabel || "",
          schoolSectionTitle: clean(block?.topic || block?.title || ""),
          schoolSequenceIndex: sequence,
          sourceIndex: blockIndex,
        }
      })
      sequence += 1
    })
  }

  if (Array.isArray(payload?.units)) {
    payload.units.forEach((unit, unitIndex) => {
      const unitName = clean(unit?.label || unit?.name || unit?.title || `Unit ${unitIndex + 1}`)
      const unitKey = clean(unit?.id || unitName.toLowerCase().replace(/[^a-z0-9]+/g, "_"))
      registerUnit(units, unitSeen, unitKey, unitName)
      ;(unit?.sections || []).forEach((section, sectionIndex) => {
        const loCodes = collectLoCodesFromSection(section)
        loCodes.forEach((code) => {
          if (byLo[code]) return
          byLo[code] = {
            schoolUnitKey: unitKey,
            schoolUnitName: unitName,
            schoolSection: clean(section?.section || ""),
            schoolSectionTitle: clean(section?.title || ""),
            schoolSequenceIndex: sequence,
            sourceIndex: sectionIndex,
          }
        })
        sequence += 1
      })
    })
  }

  return {
    subject: clean(payload?.subject || payload?.course_label || ""),
    state: clean(payload?.state || ""),
    kind: Array.isArray(payload?.units) ? "lo_mapping" : Array.isArray(payload?.scheduleBlocks) ? "schedule_blocks" : "generic",
    units,
    byLo,
  }
}

export function applySchoolOverlayToEntries(entries = [], overlay = null) {
  const byLo = overlay?.byLo || {}
  return (entries || []).map((entry) => {
    const mapped = byLo[clean(entry?.code)] || null
    return {
      ...entry,
      schoolUnitKey: clean(mapped?.schoolUnitKey || entry?.schoolUnitKey || entry?.standardCode || ""),
      schoolUnitName: clean(mapped?.schoolUnitName || entry?.schoolUnitName || entry?.standardName || entry?.standardCode || "General"),
      schoolSection: clean(mapped?.schoolSection || entry?.schoolSection || ""),
      schoolSectionTitle: clean(mapped?.schoolSectionTitle || entry?.schoolSectionTitle || ""),
      schoolSequenceIndex: Number.isFinite(Number(mapped?.schoolSequenceIndex))
        ? Number(mapped.schoolSequenceIndex)
        : Number.isFinite(Number(entry?.schoolSequenceIndex))
          ? Number(entry.schoolSequenceIndex)
          : Number.MAX_SAFE_INTEGER,
    }
  })
}

export function applySchoolOverlayToQuestionTypes(questionTypes = [], overlay = null) {
  const byLo = overlay?.byLo || {}
  return (questionTypes || []).map((item) => {
    const primaryLo = clean(
      String(item?.standardCode || item?.loCode || "")
        .split(/[,;|]/)
        .map(clean)
        .find(Boolean) || ""
    )
    const mapped = byLo[primaryLo] || null
    return {
      ...item,
      schoolUnitKey: clean(mapped?.schoolUnitKey || item?.schoolUnitKey || ""),
      schoolUnitName: clean(mapped?.schoolUnitName || item?.schoolUnitName || ""),
      schoolSection: clean(mapped?.schoolSection || item?.schoolSection || ""),
      schoolSectionTitle: clean(mapped?.schoolSectionTitle || item?.schoolSectionTitle || ""),
      schoolSequenceIndex: Number.isFinite(Number(mapped?.schoolSequenceIndex))
        ? Number(mapped.schoolSequenceIndex)
        : Number.isFinite(Number(item?.schoolSequenceIndex))
          ? Number(item.schoolSequenceIndex)
          : Number.MAX_SAFE_INTEGER,
    }
  })
}
