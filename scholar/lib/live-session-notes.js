import { getJsonFromR2, putJsonToR2 } from "./r2"

const BUCKET = process.env.R2_BUCKET || ""

function cleanPart(value = "") {
  return String(value || "").trim().replace(/[^a-zA-Z0-9._-]+/g, "-")
}

export function liveSessionNotesKey(studentId = "", subjectId = "", sessionDate = "") {
  return `live-session-notes/${cleanPart(studentId)}/${cleanPart(subjectId)}/${cleanPart(sessionDate)}.json`
}

export async function getLiveSessionNotes({ studentId = "", subjectId = "", sessionDate = "" } = {}) {
  if (!BUCKET || !studentId || !subjectId || !sessionDate) return null
  return getJsonFromR2({
    bucket: BUCKET,
    key: liveSessionNotesKey(studentId, subjectId, sessionDate),
  })
}

export async function saveLiveSessionNotes({
  studentId = "",
  subjectId = "",
  sessionDate = "",
  sessionId = "",
  notesText = "",
  scene = null,
} = {}) {
  if (!BUCKET) throw new Error("R2_BUCKET is not configured")
  if (!studentId || !subjectId || !sessionDate) {
    throw new Error("studentId, subjectId, and sessionDate are required")
  }

  const data = {
    studentId,
    subjectId,
    sessionId: String(sessionId || ""),
    sessionDate: String(sessionDate || ""),
    notesText: String(notesText || ""),
    scene: scene && typeof scene === "object" ? scene : null,
    updatedAt: new Date().toISOString(),
  }

  await putJsonToR2({
    bucket: BUCKET,
    key: liveSessionNotesKey(studentId, subjectId, sessionDate),
    data,
  })

  return data
}
