export function serializeLiveDraftRow(row = {}, index = 0, sessionDate = "", planKind = "current") {
  const questionPageId = row.questionPageId || row.questionId || row.id
  const assignedDate = row.assignedSessionDate || row.dateIntroduced || sessionDate
  return {
    id: row.id || questionPageId || `draft-${index}`,
    questionPageId,
    title: row.title || row.questionName || `Question Type ${index + 1}`,
    unit: row.unit || "",
    standardCode: row.standardCode || "",
    primarySlo: row.primarySlo || "",
    status: row.status || row.state || "",
    weaknessScore: Number(row.score ?? row.weaknessScore ?? 0),
    masteryScore: Number(row.masteryScore || 0),
    dateIntroduced: assignedDate,
    sourceSessionDate: assignedDate,
    assignedSessionDate: assignedDate,
    sessionId: row.sessionId || "",
    committed: !!row.committed,
    planSource: row.planSource || "",
    orderIndex: row.orderIndex ?? index,
    notes: row.notes || "",
    planKind,
  }
}

export function buildLiveDraft({ currentRows = [], futureRows = [], practiceRows = [], sessionDate = "", flow = null } = {}) {
  const current = (currentRows || []).map((row, index) => serializeLiveDraftRow(row, index, sessionDate, "current"))
  const future = (futureRows || []).map((row, index) => serializeLiveDraftRow(row, index, sessionDate, "future"))
  const practice = (practiceRows || []).map((row, index) => serializeLiveDraftRow(row, index, sessionDate, "practice"))

  return {
    mode: flow?.mode || "teaching",
    sessionDate: sessionDate || null,
    current,
    future,
    practice,
    counts: {
      current: current.length,
      future: future.length,
      practice: practice.length,
      total: current.length + future.length + practice.length,
    },
  }
}
