/**
 * SLO (Sub-Learning-Objective) utilities
 *
 * SLO IDs come from the taxonomy itself.
 * Example AP Physics 1 codes:
 *   LO  -> 1.1
 *   SLO -> 1.1.A.1
 *
 * Subtopics in DISTRICT_TAXONOMY are now { id, text } objects.
 */

import { DISTRICT_TAXONOMY, getDistrictTaxonomy } from "./district-taxonomy.js"

let _sloIndex = null

function getNormalizedTaxonomySubjects() {
  const subjects = []
  for (const [stateKey, stateData] of Object.entries(DISTRICT_TAXONOMY)) {
    for (const [subjectKey, subject] of Object.entries(stateData)) {
      const normalized = getDistrictTaxonomy(stateKey, subjectKey)
      if (normalized) subjects.push({ stateKey, subjectKey, subject: normalized })
    }
  }
  return subjects
}

/**
 * Returns the parent LO code for a given SLO ID.
 * For AP Physics 1, 1.1.A.1 -> 1.1.
 * For the rest of the taxonomy, the generic fallback strips the last segment.
 */
export function getLoForSlo(sloId) {
  if (!_sloIndex) _sloIndex = buildSloIndex()
  if (_sloIndex[sloId]?.loCode) return _sloIndex[sloId].loCode
  const parts = String(sloId || "").split(".").filter(Boolean)
  if (parts.length >= 2 && /^\d+$/.test(parts[0] || "") && /^\d+$/.test(parts[1] || "")) {
    return parts.slice(0, 2).join(".")
  }
  return parts.slice(0, -1).join(".")
}

/**
 * Returns all SLO objects ({ id, text }) for a given LO code.
 * Searches all subjects in the taxonomy.
 */
export function getSlosForLo(loCode) {
  for (const { subject } of getNormalizedTaxonomySubjects()) {
    for (const standard of subject.standards || []) {
      for (const lo of standard.objectives || []) {
        if (lo.code === loCode) {
          return (lo.subtopics || []).map((s, i) => ({
            id: s.id || `${loCode}.${i + 1}`,
            text: s.text || s,
          }))
        }
      }
    }
  }
  return []
}

/**
 * Returns 1/n weight for a given SLO (n = total SLOs under its parent LO).
 */
export function getSloWeight(sloId) {
  const loCode = getLoForSlo(sloId)
  const slos = getSlosForLo(loCode)
  return slos.length > 0 ? 1 / slos.length : 1
}

/**
 * Returns a flat map of all SLOs across the entire taxonomy:
 * { [sloId]: { text, loCode, loName, standardCode, standardName, subjectKey } }
 */
export function buildSloIndex() {
  const index = {}
  for (const { stateKey, subjectKey, subject } of getNormalizedTaxonomySubjects()) {
    for (const standard of subject.standards || []) {
      for (const lo of standard.objectives || []) {
        for (let i = 0; i < (lo.subtopics || []).length; i++) {
          const s = lo.subtopics[i]
          const id = s.id || `${lo.code}.${i + 1}`
          const text = s.text || s
          const entry = {
            text,
            loCode: lo.code,
            loName: lo.name,
            standardCode: standard.code,
            standardName: standard.name,
            subjectKey,
            stateKey,
          }
          if (!index[id] || subjectKey === "ap physics 1") index[id] = entry
        }
      }
    }
  }
  return index
}

/**
 * Build a flat string listing every SLO for a given state+subject combo,
 * formatted for Claude prompts.
 *
 * Format:
 *   8.4.A.1 — A difference in pressure between two locations causes a fluid to flow.
 *   8.4.A.2 — The continuity equation for fluid flow describes conservation of mass flow rate in incompressible fluids.
 */
export function buildSloTaxonomyString(state, subjectName) {
  const taxonomy = getDistrictTaxonomy(state, subjectName)
  if (!taxonomy) return ""
  const lines = []
  for (const standard of taxonomy.standards || []) {
    for (const lo of standard.objectives || []) {
      for (let i = 0; i < (lo.subtopics || []).length; i++) {
        const s = lo.subtopics[i]
        const id = s.id || `${lo.code}.${i + 1}`
        const text = s.text || s
        lines.push(`${id} — ${text}`)
      }
    }
  }
  return lines.join("\n")
}

/**
 * Build a Set of all valid SLO IDs for a given state+subject.
 * Used for boundary validation.
 */
export function buildValidSloSet(state, subjectName) {
  const taxonomy = getDistrictTaxonomy(state, subjectName)
  if (!taxonomy) return new Set()
  const ids = new Set()
  for (const standard of taxonomy.standards || []) {
    for (const lo of standard.objectives || []) {
      for (let i = 0; i < (lo.subtopics || []).length; i++) {
        const s = lo.subtopics[i]
        const id = s.id || `${lo.code}.${i + 1}`
        ids.add(id)
      }
    }
  }
  return ids
}

/**
 * Given a list of reinforcement SLOs with weights, derive LO-level reinforcement.
 * Groups by parent LO, sums weights within each LO.
 * Returns [{ lo_code, weight }] sorted descending by weight.
 */
export function deriveReinforcementLos(reinforcementSlos) {
  const loWeights = {}
  for (const { slo_id, weight } of reinforcementSlos || []) {
    const loCode = getLoForSlo(slo_id)
    if (!loCode) continue
    loWeights[loCode] = (loWeights[loCode] || 0) + (Number(weight) || 0)
  }
  return Object.entries(loWeights)
    .map(([lo_code, weight]) => ({ lo_code, weight }))
    .sort((a, b) => b.weight - a.weight)
}

/**
 * Build a name for the SLO (just its text).
 */
export function getSloName(sloId) {
  const loCode = getLoForSlo(sloId)
  const slos = getSlosForLo(loCode)
  const slo = slos.find(s => s.id === sloId)
  return slo ? slo.text : sloId
}
