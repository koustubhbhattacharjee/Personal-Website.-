// Traversal order, by level:
//   - Units (cylinder/cube stack by height): bottom → top, which matches units[0] → units[N-1]
//   - LOs (disk / torus section): outer → inner, which matches rings[0] → rings[N-1]
//   - QTs (arcs around a ring): angular 0 → 2π, which matches arcs[0] → arcs[N-1]
//   - Questions (slices within an arc): start → end of the arc, which matches questions[0] → questions[N-1]
// Previous is the inverse of next.

function arcQuestionCount(arc) {
  if (!arc) return 1
  const n = Array.isArray(arc.questions) ? arc.questions.length : Number(arc.total || 0)
  return Math.max(1, n)
}

function arcName(arc) {
  return arc?.type || arc?.name || "Next question type"
}

export function findNext(units, uIdx, lIdx, qtIdx, qIdx) {
  const unit = units?.[uIdx]
  if (!unit) return null
  const loList = unit.rings || []
  const lo = loList[lIdx]
  if (!lo) return null
  const arcList = lo.arcs || []
  const arc = arcList[qtIdx]
  if (!arc) return null

  const qTotal = arcQuestionCount(arc)
  if (qIdx < qTotal - 1) {
    return { uIdx, lIdx, qtIdx, qIdx: qIdx + 1, boundary: "question", nextName: "" }
  }
  if (qtIdx < arcList.length - 1) {
    const nextArc = arcList[qtIdx + 1]
    return { uIdx, lIdx, qtIdx: qtIdx + 1, qIdx: 0, boundary: "arc", nextName: arcName(nextArc) }
  }
  if (lIdx < loList.length - 1) {
    const nextLo = loList[lIdx + 1]
    const nextArc = nextLo.arcs?.[0]
    return { uIdx, lIdx: lIdx + 1, qtIdx: 0, qIdx: 0, boundary: "lo", nextName: arcName(nextArc) || nextLo.name || "Next objective" }
  }
  if (uIdx < units.length - 1) {
    const nextUnit = units[uIdx + 1]
    const nextLo = nextUnit.rings?.[0]
    const nextArc = nextLo?.arcs?.[0]
    return { uIdx: uIdx + 1, lIdx: 0, qtIdx: 0, qIdx: 0, boundary: "unit", nextName: arcName(nextArc) || nextLo?.name || nextUnit.name || "Next unit" }
  }
  return null
}

export function findPrev(units, uIdx, lIdx, qtIdx, qIdx) {
  const unit = units?.[uIdx]
  if (!unit) return null
  const loList = unit.rings || []
  const lo = loList[lIdx]
  if (!lo) return null
  const arcList = lo.arcs || []

  if (qIdx > 0) {
    return { uIdx, lIdx, qtIdx, qIdx: qIdx - 1, boundary: "question", nextName: "" }
  }
  if (qtIdx > 0) {
    const prevArc = arcList[qtIdx - 1]
    const qLast = arcQuestionCount(prevArc) - 1
    return { uIdx, lIdx, qtIdx: qtIdx - 1, qIdx: qLast, boundary: "arc", nextName: arcName(prevArc) }
  }
  if (lIdx > 0) {
    const prevLo = loList[lIdx - 1]
    const lastArcIdx = Math.max(0, (prevLo.arcs?.length || 1) - 1)
    const prevArc = prevLo.arcs?.[lastArcIdx]
    const qLast = arcQuestionCount(prevArc) - 1
    return { uIdx, lIdx: lIdx - 1, qtIdx: lastArcIdx, qIdx: qLast, boundary: "lo", nextName: arcName(prevArc) || prevLo.name || "Previous objective" }
  }
  if (uIdx > 0) {
    const prevUnit = units[uIdx - 1]
    const lastLoIdx = Math.max(0, (prevUnit.rings?.length || 1) - 1)
    const prevLoU = prevUnit.rings?.[lastLoIdx]
    const lastArcIdx = Math.max(0, (prevLoU?.arcs?.length || 1) - 1)
    const prevArc = prevLoU?.arcs?.[lastArcIdx]
    const qLast = arcQuestionCount(prevArc) - 1
    return { uIdx: uIdx - 1, lIdx: lastLoIdx, qtIdx: lastArcIdx, qIdx: qLast, boundary: "unit", nextName: arcName(prevArc) || prevLoU?.name || prevUnit.name || "Previous unit" }
  }
  return null
}

export function nextLabelFor(nav) {
  if (!nav) return ""
  if (nav.boundary === "question") return "Next question"
  return `Up next: ${nav.nextName}`
}

export function prevLabelFor(nav) {
  if (!nav) return ""
  if (nav.boundary === "question") return "Previous question"
  return `Back to: ${nav.nextName}`
}

// Jump straight to the next question type (arc). Crosses LO + unit boundaries
// the same way findNext does. Always lands on qIdx=0 of the target arc.
export function findNextArc(units, uIdx, lIdx, qtIdx) {
  const unit = units?.[uIdx]
  if (!unit) return null
  const loList = unit.rings || []
  const lo = loList[lIdx]
  if (!lo) return null
  const arcList = lo.arcs || []

  if (qtIdx < arcList.length - 1) {
    const nextArc = arcList[qtIdx + 1]
    return { uIdx, lIdx, qtIdx: qtIdx + 1, qIdx: 0, boundary: "arc", nextName: arcName(nextArc) }
  }
  if (lIdx < loList.length - 1) {
    const nextLo = loList[lIdx + 1]
    const nextArc = nextLo.arcs?.[0]
    return { uIdx, lIdx: lIdx + 1, qtIdx: 0, qIdx: 0, boundary: "lo", nextName: arcName(nextArc) || nextLo.name || "Next objective" }
  }
  if (uIdx < units.length - 1) {
    const nextUnit = units[uIdx + 1]
    const nextLo = nextUnit.rings?.[0]
    const nextArc = nextLo?.arcs?.[0]
    return { uIdx: uIdx + 1, lIdx: 0, qtIdx: 0, qIdx: 0, boundary: "unit", nextName: arcName(nextArc) || nextLo?.name || nextUnit.name || "Next unit" }
  }
  return null
}

export function findPrevArc(units, uIdx, lIdx, qtIdx) {
  const unit = units?.[uIdx]
  if (!unit) return null
  const loList = unit.rings || []
  const lo = loList[lIdx]
  if (!lo) return null
  const arcList = lo.arcs || []

  if (qtIdx > 0) {
    const prevArc = arcList[qtIdx - 1]
    return { uIdx, lIdx, qtIdx: qtIdx - 1, qIdx: 0, boundary: "arc", nextName: arcName(prevArc) }
  }
  if (lIdx > 0) {
    const prevLo = loList[lIdx - 1]
    const lastArcIdx = Math.max(0, (prevLo.arcs?.length || 1) - 1)
    const prevArc = prevLo.arcs?.[lastArcIdx]
    return { uIdx, lIdx: lIdx - 1, qtIdx: lastArcIdx, qIdx: 0, boundary: "lo", nextName: arcName(prevArc) || prevLo.name || "Previous objective" }
  }
  if (uIdx > 0) {
    const prevUnit = units[uIdx - 1]
    const lastLoIdx = Math.max(0, (prevUnit.rings?.length || 1) - 1)
    const prevLoU = prevUnit.rings?.[lastLoIdx]
    const lastArcIdx = Math.max(0, (prevLoU?.arcs?.length || 1) - 1)
    const prevArc = prevLoU?.arcs?.[lastArcIdx]
    return { uIdx: uIdx - 1, lIdx: lastLoIdx, qtIdx: lastArcIdx, qIdx: 0, boundary: "unit", nextName: arcName(prevArc) || prevLoU?.name || prevUnit.name || "Previous unit" }
  }
  return null
}

export function nextArcLabelFor(nav) {
  if (!nav) return ""
  return `Next: ${nav.nextName}`
}

export function prevArcLabelFor(nav) {
  if (!nav) return ""
  return `Prev: ${nav.nextName}`
}
