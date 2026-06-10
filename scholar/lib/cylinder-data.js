function splitCodes(codeStr) {
  if (!codeStr) return []
  return String(codeStr)
    .split(/[,;|]/)
    .map(s => s.trim())
    .filter(Boolean)
}

function buildOverlayCylinderData(questionTypes) {
  const bankRows = Array.isArray(questionTypes) ? questionTypes : []
  const unitMap = new Map()
  const reinforcementBySection = {}

  bankRows.forEach((q) => {
    const unitKey = q.schoolUnitKey || q.schoolUnitName || "general"
    const unitName = q.schoolUnitName || q.unit || "General"
    const sectionKey = q.schoolSectionId || `${unitKey}:${q.schoolSection || q.schoolSectionTitle || q.title || q.id}`
    const displayCode = q.schoolSection || ""
    const sectionName = q.schoolSectionTitle || q.schoolSection || "Section"

    if (!unitMap.has(unitKey)) {
      unitMap.set(unitKey, {
        key: unitKey,
        name: unitName,
        schoolSequenceIndex: Number.isFinite(Number(q.schoolSequenceIndex)) ? Number(q.schoolSequenceIndex) : Number.MAX_SAFE_INTEGER,
        sections: new Map(),
      })
    }

    const unit = unitMap.get(unitKey)
    unit.schoolSequenceIndex = Math.min(unit.schoolSequenceIndex, Number.isFinite(Number(q.schoolSequenceIndex)) ? Number(q.schoolSequenceIndex) : Number.MAX_SAFE_INTEGER)

    if (!unit.sections.has(sectionKey)) {
      unit.sections.set(sectionKey, {
        code: sectionKey,
        displayCode: displayCode || sectionName,
        name: sectionName,
        schoolSequenceIndex: Number.isFinite(Number(q.schoolSequenceIndex)) ? Number(q.schoolSequenceIndex) : Number.MAX_SAFE_INTEGER,
        arcs: [],
      })
    }

    const section = unit.sections.get(sectionKey)
    section.schoolSequenceIndex = Math.min(section.schoolSequenceIndex, Number.isFinite(Number(q.schoolSequenceIndex)) ? Number(q.schoolSequenceIndex) : Number.MAX_SAFE_INTEGER)
    const questionCount = Math.max(1, Number(q.questionCount || q.questions?.length || 1))
    const attemptedCount = Math.min(
      questionCount,
      Array.isArray(q.correctQuestionKeys) ? q.correctQuestionKeys.length : 0
    )
    const mastery = typeof q.masteryScore === "number"
      ? q.masteryScore
      : (questionCount > 0 ? attemptedCount / questionCount : 0)

    section.arcs.push({
      type: q.title || q.topic || "General",
      angleFraction: 0, // filled below
      opacity: mastery,
      mastery,
      attempted: attemptedCount,
      total: questionCount,
      hasData: questionCount > 0,
      questionTypeId: q.id,
      isLocked: !!q.isLocked,
      dateIntroduced: q.dateIntroduced || null,
      questions: q.questions || [],
      correctQuestionKeys: q.correctQuestionKeys || [],
      pendingReview: Number(q.pendingReviewCount || 0),
    })

    ;(Array.isArray(q.sectionReinforcementTargets) ? q.sectionReinforcementTargets : []).forEach((target) => {
      const sectionId = String(target?.sectionId || "").trim()
      const weight = Number(target?.weight || 0)
      if (!sectionId || !Number.isFinite(weight) || weight <= 0) return
      reinforcementBySection[sectionId] = Math.min(
        1,
        (reinforcementBySection[sectionId] || 0) + mastery * weight
      )
    })
  })

  return Array.from(unitMap.values())
    .map((unit) => {
      const rings = Array.from(unit.sections.values())
        .sort((a, b) =>
          (Number(a.schoolSequenceIndex ?? Number.MAX_SAFE_INTEGER) - Number(b.schoolSequenceIndex ?? Number.MAX_SAFE_INTEGER)) ||
          String(a.name || "").localeCompare(String(b.name || ""))
        )
        .map((section) => {
          const equalAngleFraction = section.arcs.length ? 1 / section.arcs.length : 1
          const arcs = section.arcs.map((arc) => ({ ...arc, angleFraction: equalAngleFraction }))
          const dataArcs = arcs.filter((a) => a.hasData)
          const directMastery = dataArcs.length ? dataArcs.reduce((sum, arc) => sum + arc.mastery, 0) / dataArcs.length : 0
          const propagatedMastery = Math.min(1, Number(reinforcementBySection[section.code] || 0))
          const mastery = Math.min(1, directMastery + propagatedMastery * (1 - directMastery) * 0.2)
          return {
            code: section.code,
            displayCode: section.displayCode,
            name: section.name,
            mastery,
            hasData: dataArcs.length > 0,
            arcs,
          }
        })

      const dataRings = rings.filter((r) => r.hasData)
      const mastery = dataRings.length ? dataRings.reduce((sum, ring) => sum + ring.mastery, 0) / dataRings.length : 0
      return {
        name: unit.name,
        mastery,
        hasData: dataRings.length > 0,
        rings,
        schoolSequenceIndex: unit.schoolSequenceIndex,
      }
    })
    .sort((a, b) =>
      (Number(a.schoolSequenceIndex ?? Number.MAX_SAFE_INTEGER) - Number(b.schoolSequenceIndex ?? Number.MAX_SAFE_INTEGER)) ||
      (b.mastery - a.mastery) ||
      String(a.name || "").localeCompare(String(b.name || ""))
    )
}

export function buildCylinderData(allObjectives, questionTypes) {
  const bankRows = Array.isArray(questionTypes) ? questionTypes : []
  const overlayReady = bankRows.some((q) => q.schoolSectionId && (q.schoolUnitName || q.schoolSectionTitle || q.schoolSection))
  if (overlayReady) {
    return buildOverlayCylinderData(bankRows)
  }
  const schoolUnitByLo = {}
  bankRows.forEach((q) => {
    const unitName = q.schoolUnitName || ""
    const unitKey = q.schoolUnitKey || ""
    splitCodes(q.loCode || q.standardCode || "").forEach((code) => {
      if (!code || schoolUnitByLo[code]) return
      schoolUnitByLo[code] = {
        name: unitName,
        key: unitKey,
        sequence: Number.isFinite(Number(q.schoolSequenceIndex)) ? Number(q.schoolSequenceIndex) : Number.MAX_SAFE_INTEGER,
      }
    })
  })

  // Count how many question types share each primary LO code so each one
  // contributes its fair share: weight * (attempted/total) * (1/numTypesForLO)
  const loTypeCount = {}
  bankRows.forEach(q => {
    splitCodes(q.loCode || q.standardCode || "").forEach(code => {
      loTypeCount[code] = (loTypeCount[code] || 0) + 1
    })
  })

  const loTopicStats = {}
  const reinforcementByLo = {}
  bankRows.forEach(q => {
    const codes = splitCodes(q.loCode || q.standardCode || "")
    const topic = q.title || q.topic || "General"
    const questionTypeKey = q.id || topic
    const questionCount = Math.max(1, Number(q.questionCount || 1))
    const attemptedCount = Math.min(
      questionCount,
      Array.isArray(q.correctQuestionKeys) ? q.correctQuestionKeys.length : 0
    )
    const opacity = typeof q.masteryScore === "number"
      ? q.masteryScore
      : (questionCount > 0 ? attemptedCount / questionCount : 0)

    codes.forEach(code => {
      const key = `${code}\x00${questionTypeKey}`
      loTopicStats[key] = {
        type: topic,
        attempted: attemptedCount,
        total: questionCount,
        opacity,
        questionTypeId: q.id,
        isLocked: !!q.isLocked,
        dateIntroduced: q.dateIntroduced || null,
        questions: q.questions || [],
        correctQuestionKeys: q.correctQuestionKeys || [],
        pendingReview: Number(q.pendingReviewCount || 0),
      }
    })

    // Scale by (attempted/total) * (1/numTypesForThisLO) so that completing
    // one question type out of N for a primary LO contributes 1/N of its weight.
    const numTypes = codes.length ? Math.max(...codes.map(c => loTypeCount[c] || 1)) : 1
    const attemptFraction = questionCount > 0 ? (attemptedCount / questionCount) / numTypes : 0
    if (attemptFraction > 0) {
      const reinforcementEntries = Object.entries(q.reinforcementByCode || {})
        .map(([code, value]) => [code, Number(value || 0)])
        .filter(([code, v]) => code && Number.isFinite(v) && v > 0)
      const reinforcementTotal = reinforcementEntries.reduce((s, [, v]) => s + v, 0)
      reinforcementEntries.forEach(([code, value]) => {
        const normalized = reinforcementTotal > 1 ? value / reinforcementTotal : value
        reinforcementByLo[code] = Math.min(1, (reinforcementByLo[code] || 0) + normalized * attemptFraction)
      })
    }
  })

  const unitMap = {}
  allObjectives.forEach(obj => {
    const overlayUnit = schoolUnitByLo[obj.code] || null
    const unit = overlayUnit?.name || obj.standardName || obj.standardCode || "General"
    const unitKey = overlayUnit?.key || unit
    if (!unitMap[unitKey]) unitMap[unitKey] = {
      key: unitKey,
      name: unit,
      objectives: [],
      sequence: Number.isFinite(Number(overlayUnit?.sequence)) ? Number(overlayUnit.sequence) : Number.MAX_SAFE_INTEGER,
    }
    unitMap[unitKey].objectives.push(obj)
  })

  const units = Object.values(unitMap).map(({ name, objectives, sequence }) => {
    const rings = objectives.map(obj => {
      const topicEntries = Object.entries(loTopicStats)
        .filter(([k]) => k.startsWith(`${obj.code}\x00`))
        .map(([, v]) => ({
          type: v.type || "General",
          questionTypeId: v.questionTypeId || "",
          attempted: v.attempted,
          total: v.total,
          opacity: typeof v.opacity === "number" ? v.opacity : (v.total > 0 ? v.attempted / v.total : 0),
          isLocked: !!v.isLocked,
          dateIntroduced: v.dateIntroduced || null,
          questions: v.questions || [],
          correctQuestionKeys: v.correctQuestionKeys || [],
          pendingReview: Number(v.pendingReview || 0),
        }))

      if (!topicEntries.length) {
        const propagatedMastery = Math.min(1, Number(reinforcementByLo[obj.code] || 0)) * 0.2
        return {
          code: obj.code, name: obj.name, mastery: propagatedMastery, hasData: false,
          arcs: [{ type: "No data yet", angleFraction: 1, opacity: 0, mastery: 0, attempted: 0, total: 0, hasData: false, questions: [], correctQuestionKeys: [] }],
        }
      }

      const equalAngleFraction = topicEntries.length ? 1 / topicEntries.length : 1
      const arcs = topicEntries.map(t => ({
        type: t.type,
        angleFraction: equalAngleFraction,
        opacity: t.opacity,
        mastery: t.opacity,
        attempted: t.attempted,
        total: t.total,
        hasData: t.total > 0,
        questionTypeId: t.questionTypeId,
        isLocked: !!t.isLocked,
        dateIntroduced: t.dateIntroduced || null,
        questions: t.questions || [],
        correctQuestionKeys: t.correctQuestionKeys || [],
        pendingReview: Number(t.pendingReview || 0),
      }))

      const dataArcs = arcs.filter((a) => a.hasData)
      const directMastery = dataArcs.length ? dataArcs.reduce((s, a) => s + a.mastery, 0) / dataArcs.length : 0
      // Reinforcement can only contribute up to 20% of the gap left to 1.0,
      // so it nudges but never substitutes for actually doing the work.
      const propagatedMastery = Math.min(1, Number(reinforcementByLo[obj.code] || 0))
      const ringMastery = Math.min(1, directMastery + propagatedMastery * (1 - directMastery) * 0.2)
      return { code: obj.code, name: obj.name, mastery: ringMastery, hasData: dataArcs.length > 0, arcs }
    })

    const dataRings = rings.filter((r) => r.hasData)
    const diskMastery = dataRings.length ? dataRings.reduce((s, r) => s + r.mastery, 0) / dataRings.length : 0
    return { name, mastery: diskMastery, hasData: dataRings.length > 0, rings, schoolSequenceIndex: sequence }
  })

  units.sort((a, b) =>
    (Number(a.schoolSequenceIndex ?? Number.MAX_SAFE_INTEGER) - Number(b.schoolSequenceIndex ?? Number.MAX_SAFE_INTEGER)) ||
    (b.mastery - a.mastery) ||
    String(a.name || "").localeCompare(String(b.name || ""))
  )
  return units
}
