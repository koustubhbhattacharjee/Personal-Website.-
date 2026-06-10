import { getJsonFromR2, putJsonToR2 } from "./r2"

function cleanPart(value = "") {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"
}

export function draftContextKey(studentId = "", subjectId = "", draftRowId = "") {
  return `draft-context/${cleanPart(studentId)}/${cleanPart(subjectId)}/${cleanPart(draftRowId)}.json`
}

export async function loadDraftContext({ bucket, studentId, subjectId, draftRowId }) {
  if (!bucket || !studentId || !subjectId || !draftRowId) return null
  return getJsonFromR2({ bucket, key: draftContextKey(studentId, subjectId, draftRowId) })
}

export async function saveDraftContext({ bucket, studentId, subjectId, draftRowId, data }) {
  if (!bucket || !studentId || !subjectId || !draftRowId) return null
  await putJsonToR2({
    bucket,
    key: draftContextKey(studentId, subjectId, draftRowId),
    data,
  })
  return data
}
