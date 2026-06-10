import { randomUUID } from "crypto"
import { getJsonFromR2, putJsonToR2, uploadBinaryToR2 } from "./r2"

function cleanPart(value = "") {
  return String(value || "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown"
}

export function normalizeR2BaseUrl(raw, bucket) {
  let base = String(raw || "").trim()
  if (!base) {
    const accountId = process.env.R2_ACCOUNT_ID
    if (accountId && bucket) base = `https://${bucket}.${accountId}.r2.dev`
  }
  if (!base) return ""
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`
  try {
    const url = new URL(base)
    url.hash = ""
    url.search = ""
    url.pathname = url.pathname.replace(/\/+$/, "")
    return url.toString().replace(/\/$/, "")
  } catch {
    return ""
  }
}

export function createWorksheetDraftId() {
  return randomUUID()
}

export function worksheetDraftPrefix(studentId, subjectId, draftId) {
  return `worksheet-drafts/${cleanPart(studentId)}/${cleanPart(subjectId)}/${cleanPart(draftId)}`
}

export function worksheetDraftKeys(studentId, subjectId, draftId) {
  const prefix = worksheetDraftPrefix(studentId, subjectId, draftId)
  return {
    prefix,
    manifest: `${prefix}/manifest.json`,
    rawBlocks: `${prefix}/raw-blocks.json`,
    groups: `${prefix}/groups.json`,
    sidecar: `${prefix}/sidecar.json`,
    source: `${prefix}/source/original`,
    pageImage: (page) => `${prefix}/pages/page-${page}.png`,
    blockImage: (blockId) => `${prefix}/blocks/${cleanPart(blockId)}.png`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Groups tree shape (version 2)
//
//  {
//    version: 2,
//    units: [
//      {
//        id: "u1",
//        label: "Chapter 1 — Functions",
//        question_types: [
//          {
//            id: "qt1",
//            label: "Evaluating Functions",
//            section_ref: "1.4",
//            primary_slo: null,
//            notes: "",
//            questions: [ {QuestionNode}, ... ]
//          }
//        ]
//      }
//    ]
//  }
//
//  Legacy (v1) storage is a flat array of question-level groups:
//    [ {id, label, kind, ambiguous, confidence, notes, assignments}, ... ]
//
//  On load we always return BOTH shapes — `tree` (v2) and `flatGroups` (v1)
//  — so callers can pick whichever they need.
// ─────────────────────────────────────────────────────────────────────────────

export function flatGroupsFromTree(tree) {
  const units = Array.isArray(tree?.units) ? tree.units : []
  const flat = []
  for (const unit of units) {
    const qts = Array.isArray(unit?.question_types) ? unit.question_types : []
    for (const qt of qts) {
      const questions = Array.isArray(qt?.questions) ? qt.questions : []
      for (const q of questions) {
        flat.push({
          id: String(q?.id || ""),
          label: String(q?.label || ""),
          kind: q?.kind || "single_question",
          ambiguous: !!q?.ambiguous,
          confidence: Number.isFinite(Number(q?.confidence)) ? Number(q.confidence) : 0.5,
          notes: String(q?.notes || ""),
          assignments: Array.isArray(q?.assignments) ? q.assignments : [],
          unit_id: unit?.id || "",
          unit_label: unit?.label || "",
          qt_id: qt?.id || "",
          qt_label: qt?.label || "",
          qt_section_ref: qt?.section_ref || "",
          qt_primary_slo: qt?.primary_slo || null,
        })
      }
    }
  }
  return flat
}

export function treeFromFlatGroups(flatGroups) {
  const list = Array.isArray(flatGroups) ? flatGroups : []
  if (!list.length) return { version: 2, units: [] }
  const unit = {
    id: "u1",
    label: "Unclassified",
    question_types: [
      {
        id: "qt1",
        label: "Unsorted questions",
        section_ref: "",
        primary_slo: null,
        notes: "Auto-migrated from a flat (v1) groups file. Reorganize into real units and QTs before import.",
        questions: list.map((g, idx) => ({
          id: String(g?.id || `q${idx + 1}`),
          label: String(g?.label || `Q${idx + 1}`),
          kind: g?.kind || "single_question",
          ambiguous: !!g?.ambiguous,
          confidence: Number.isFinite(Number(g?.confidence)) ? Number(g.confidence) : 0.5,
          notes: String(g?.notes || ""),
          assignments: Array.isArray(g?.assignments) ? g.assignments : [],
        })),
      },
    ],
  }
  return { version: 2, units: [unit] }
}

function isTreeShape(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Number(value.version) === 2 && Array.isArray(value.units)
}

export function normalizeGroupsStorage(stored) {
  if (isTreeShape(stored)) {
    return { tree: stored, flatGroups: flatGroupsFromTree(stored) }
  }
  if (Array.isArray(stored)) {
    return { tree: treeFromFlatGroups(stored), flatGroups: stored }
  }
  return { tree: { version: 2, units: [] }, flatGroups: [] }
}

export async function saveWorksheetDraft({ bucket, studentId, subjectId, draftId, manifest, rawBlocks, groups, sidecar }) {
  const keys = worksheetDraftKeys(studentId, subjectId, draftId)
  if (manifest) await putJsonToR2({ bucket, key: keys.manifest, data: manifest })
  if (rawBlocks) await putJsonToR2({ bucket, key: keys.rawBlocks, data: rawBlocks })
  if (groups) await putJsonToR2({ bucket, key: keys.groups, data: groups })
  if (sidecar) await putJsonToR2({ bucket, key: keys.sidecar, data: sidecar })
  return keys
}

export async function loadWorksheetDraft({ bucket, studentId, subjectId, draftId }) {
  const keys = worksheetDraftKeys(studentId, subjectId, draftId)
  const [manifest, rawBlocks, storedGroups, sidecar] = await Promise.all([
    getJsonFromR2({ bucket, key: keys.manifest }),
    getJsonFromR2({ bucket, key: keys.rawBlocks }),
    getJsonFromR2({ bucket, key: keys.groups }),
    getJsonFromR2({ bucket, key: keys.sidecar }),
  ])
  const { tree, flatGroups } = normalizeGroupsStorage(storedGroups)
  return { keys, manifest, rawBlocks, groups: flatGroups, tree, sidecar }
}

export async function uploadWorksheetDraftBinary({ bucket, studentId, subjectId, draftId, key, body, contentType = "application/octet-stream" }) {
  await uploadBinaryToR2({ bucket, key, body, contentType })
  const baseUrl = normalizeR2BaseUrl(process.env.R2_PUBLIC_BASE_URL, bucket)
  return baseUrl ? `${baseUrl}/${key}` : ""
}
