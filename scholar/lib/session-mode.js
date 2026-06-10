function normalizeDateKey(value = "") {
  const src = String(value || "").trim()
  if (!src) return ""
  const iso = src.match(/\d{4}-\d{2}-\d{2}/)
  return iso ? iso[0] : ""
}

export function inferSubjectFlowMode({
  subjectExamDate = "",
  activeDate = "",
  futurePlannedCount = 0,
  currentPlannedCount = 0,
} = {}) {
  const examDate = normalizeDateKey(subjectExamDate)
  const dateKey = normalizeDateKey(activeDate)
  const futureCount = Number(futurePlannedCount || 0)
  const currentCount = Number(currentPlannedCount || 0)

  if (!dateKey) return "teaching"
  if (examDate && dateKey > examDate) return "practice"
  if (futureCount <= 0 && currentCount <= 0) return "practice"
  return "teaching"
}

export function buildSubjectFlowMeta({
  subjectExamDate = "",
  activeDate = "",
  futurePlannedCount = 0,
  currentPlannedCount = 0,
} = {}) {
  const mode = inferSubjectFlowMode({
    subjectExamDate,
    activeDate,
    futurePlannedCount,
    currentPlannedCount,
  })
  return {
    mode,
    examDate: normalizeDateKey(subjectExamDate) || null,
    activeDate: normalizeDateKey(activeDate) || null,
    futurePlannedCount: Number(futurePlannedCount || 0),
    currentPlannedCount: Number(currentPlannedCount || 0),
    practiceUnlocked: mode === "practice",
  }
}
