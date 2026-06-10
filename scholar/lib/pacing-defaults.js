/**
 * Typical instructional sequences for known subjects.
 * Keyed by lowercase partial subject name (same matching logic as district-taxonomy).
 * unitOrder: standardCodes in the order they are typically taught.
 * Units not listed are appended at the end in standards order.
 */
export const PACING_DEFAULT_SEQUENCES = {
  // NJ Algebra II — typical sequence diverges heavily from domain order (N→A→F→S)
  // Follows: complex numbers → polynomial ops → rational exponents → rational functions
  // → exponential/log → sequences → stats/probability
  "algebra 2": {
    unitOrder: [
      // Complex numbers (prerequisite for quadratics / polynomials)
      "N.CN.A", "N.CN.B", "N.CN.C",
      // Polynomial expressions and operations
      "A.SSE.A", "A.SSE.B",
      "A.APR.A", "A.APR.B", "A.APR.C",
      // Solving equations (linear → polynomial → systems)
      "A.CED.A",
      "A.REI.A", "A.REI.B", "A.REI.C", "A.REI.D",
      // Rational exponents and radicals
      "N.RN.A", "N.Q.A",
      // Rational functions
      "A.APR.D",
      // Functions — interpretation and building
      "F.IF.A", "F.IF.B", "F.IF.C",
      "F.BF.A", "F.BF.B",
      // Exponential and logarithmic
      "F.LE.A", "F.LE.B",
      // Trigonometric
      "F.TF.A", "F.TF.B", "F.TF.C",
      // Statistics and probability
      "S.ID.A",
      "S.IC.A", "S.IC.B",
      "S.CP.A", "S.CP.B",
      "S.MD.A", "S.MD.B",
    ],
  },

  // AP Physics C Mechanics — already domain-ordered correctly for instruction
  "appc": {
    unitOrder: [
      "APPC.1", "APPC.2", "APPC.3", "APPC.4",
      "APPC.5", "APPC.6", "APPC.7",
    ],
  },

  // AP Physics 1 (algebra-based)
  "ap physics 1": {
    unitOrder: [
      "APPhy1.1", "APPhy1.2", "APPhy1.3", "APPhy1.4",
      "APPhy1.5", "APPhy1.6", "APPhy1.7", "APPhy1.8",
    ],
  },

  // AP Calculus AB/BC — typical sequence
  "ap calc": {
    unitOrder: [
      "CHA", "LIM", "FUN", "CHA2", "FUN2", "INT", "BCO",
    ],
  },

  // SAT Math — typically scaffolded: algebra → advanced algebra → geometry → stats
  "sat": {
    unitOrder: [
      "SAT.H", "SAT.PAM", "SAT.ATM", "SAT.PSD",
    ],
  },

  // Precalculus — typical sequence
  "precal": {
    unitOrder: [
      // Functions review, transformations
      // Polynomial and rational
      // Exponential and log
      // Trig
      // Sequences/series
      // Conic sections
    ],
  },
}

/**
 * Returns the typical unit order for a subject, or null if not found.
 */
export function getHardcodedPacingDefault(subjectName) {
  const norm = (subjectName || "").toLowerCase().replace(/[-_]/g, " ")
  for (const [key, val] of Object.entries(PACING_DEFAULT_SEQUENCES)) {
    if (norm.includes(key)) return val
  }
  return null
}

export function normalizeUnitOrder(unitOrder, entries = []) {
  if (!Array.isArray(unitOrder) || !unitOrder.length) return null

  const validCodes = new Set(entries.map((e) => e.standardCode).filter(Boolean))
  const seen = new Set()
  const normalized = []

  for (const rawCode of unitOrder) {
    if (!rawCode) continue
    let code = String(rawCode).trim()
    if (!code) continue

    // Legacy AP Physics 1 pacing defaults used APP1.* while taxonomy uses APPhy1.*
    if (code.startsWith("APP1.")) code = code.replace(/^APP1\./, "APPhy1.")

    if (!validCodes.size || validCodes.has(code)) {
      if (!seen.has(code)) {
        seen.add(code)
        normalized.push(code)
      }
    }
  }

  // Append any current standards not present in the saved/generated order.
  for (const entry of entries) {
    const code = entry.standardCode
    if (code && !seen.has(code)) {
      seen.add(code)
      normalized.push(code)
    }
  }

  return normalized
}

/**
 * Applies a unit order (array of standardCodes) to sort entries.
 * Entries whose standardCode appears in unitOrder come first in that order.
 * Remaining entries are appended in their original order.
 */
export function applyUnitOrder(entries, unitOrder) {
  if (!unitOrder?.length) return entries
  const orderMap = Object.fromEntries(unitOrder.map((code, i) => [code, i]))
  const known = entries.filter(e => orderMap[e.standardCode] !== undefined)
  const unknown = entries.filter(e => orderMap[e.standardCode] === undefined)
  known.sort((a, b) => orderMap[a.standardCode] - orderMap[b.standardCode])
  return [...known, ...unknown]
}
