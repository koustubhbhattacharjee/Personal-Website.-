function toUpdatedScores(attempt) {
  return Array.isArray(attempt?.resultPayload?.updatedScores) ? attempt.resultPayload.updatedScores : []
}

export function summarizeWeaknessChanges(updatedScores = []) {
  const drops = []
  for (const item of updatedScores || []) {
    const before = Number(item?.weaknessBefore ?? item?.weaknessScore ?? 0)
    const after = Number(item?.weaknessAfter ?? item?.weaknessScore ?? before)
    const delta = Math.round((before - after) * 100) / 100
    if (!Number.isFinite(delta) || delta <= 0) continue
    drops.push({
      label: String(item?.questionTypeTitle || item?.questionType || item?.title || item?.standardCode || "Question").trim(),
      delta,
    })
  }
  if (!drops.length) return ""
  return drops
    .slice(0, 3)
    .map((entry) => `${entry.label} -${entry.delta}`)
    .join("; ")
}

export function summarizeMasteryChanges(updatedScores = [], kind = "") {
  const positives = (updatedScores || [])
    .filter((item) => item?.correct)
    .map((item) => String(item?.questionTypeTitle || item?.questionType || item?.title || item?.standardCode || "Question").trim())
    .filter(Boolean)
  if (!positives.length) return ""
  const prefix = kind === "homework" ? "Reinforced" : "Strengthened"
  return `${prefix}: ${positives.slice(0, 3).join(", ")}`
}

export function buildSessionSignals({ preAttempt = null, exitAttempt = null, homeworkAttempt = null } = {}) {
  return {
    preClassWsChanges: summarizeWeaknessChanges(toUpdatedScores(preAttempt)),
    preClassMasteryChanges: summarizeMasteryChanges(toUpdatedScores(preAttempt), "assessment"),
    exitTicketWsChanges: summarizeWeaknessChanges(toUpdatedScores(exitAttempt)),
    exitTicketMasteryChanges: summarizeMasteryChanges(toUpdatedScores(exitAttempt), "assessment"),
    homeworkWsChanges: summarizeWeaknessChanges(toUpdatedScores(homeworkAttempt)),
    homeworkMasteryChanges: summarizeMasteryChanges(toUpdatedScores(homeworkAttempt), "homework"),
  }
}
