import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  loadWorksheetDraft,
  saveWorksheetDraft,
  flatGroupsFromTree,
  treeFromFlatGroups,
} from "../../../lib/worksheet-drafts"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

// Parse a plain-text LM ordering like:
//   "Q3, Q1, Q7"
//   "1. Q3\n2. Q1\n3. Q7"
//   "Q3\nQ1\nQ7"
// Returns an array of label strings.
function parseLmText(lmText = "") {
  return lmText
    .split(/[\n,]+/)
    .map((s) => s.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean)
}

// Reorder questions within each QT according to a flat ordering (by ID or
// label). Unmatched questions keep their original position at the end of the
// QT. The tree's unit/QT structure itself is preserved — this endpoint only
// sequences questions, not the grouping.
function applyOrderingToTree(tree, { idOrder, labelOrder }) {
  const units = Array.isArray(tree?.units) ? tree.units : []
  const rankById = new Map((idOrder || []).map((id, i) => [String(id).trim(), i]))
  const rankByLabel = new Map((labelOrder || []).map((label, i) => [String(label).trim().toLowerCase(), i]))

  function rankOf(q) {
    if (rankById.size) {
      const r = rankById.get(String(q.id || "").trim())
      if (r !== undefined) return r
    }
    if (rankByLabel.size) {
      const r = rankByLabel.get(String(q.label || "").trim().toLowerCase())
      if (r !== undefined) return r
    }
    return Number.POSITIVE_INFINITY
  }

  for (const unit of units) {
    const qts = Array.isArray(unit.question_types) ? unit.question_types : []
    for (const qt of qts) {
      const questions = Array.isArray(qt.questions) ? qt.questions : []
      const withIdx = questions.map((q, i) => ({ q, i, rank: rankOf(q) }))
      withIdx.sort((a, b) => (a.rank - b.rank) || (a.i - b.i))
      qt.questions = withIdx.map((entry) => entry.q)
    }
  }
  return tree
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })
  if ((session.user?.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  try {
    const { studentId, subjectId, draftId, groupOrder, lmText } = req.body || {}
    if (!studentId || !subjectId || !draftId) {
      return res.status(400).json({ error: "studentId, subjectId, and draftId are required" })
    }
    if (!Array.isArray(groupOrder) && !lmText) {
      return res.status(400).json({ error: "groupOrder (array of question IDs) or lmText (ordered labels from NotebookLM) is required" })
    }

    const bucket = process.env.R2_BUCKET
    if (!bucket) return res.status(500).json({ error: "R2_BUCKET is not configured" })

    const draft = await loadWorksheetDraft({ bucket, studentId, subjectId, draftId })
    if (!draft?.manifest) return res.status(404).json({ error: "Draft not found" })

    const tree = draft.tree && Array.isArray(draft.tree.units) && draft.tree.units.length
      ? { version: 2, units: draft.tree.units.map((u) => ({
          ...u,
          question_types: (u.question_types || []).map((qt) => ({
            ...qt,
            questions: [...(qt.questions || [])],
          })),
        })) }
      : treeFromFlatGroups(draft.groups || [])

    const idOrder = Array.isArray(groupOrder) && groupOrder.length ? groupOrder : []
    const labelOrder = !idOrder.length && lmText ? parseLmText(lmText) : []

    const nextTree = applyOrderingToTree(tree, { idOrder, labelOrder })

    const manifest = {
      ...draft.manifest,
      updatedAt: new Date().toISOString(),
      status: draft.sidecar ? "sidecar_ready" : "structured",
    }

    await saveWorksheetDraft({
      bucket,
      studentId,
      subjectId,
      draftId,
      manifest,
      groups: nextTree,
      sidecar: draft.sidecar || undefined,
    })

    return res.status(200).json({
      ok: true,
      manifest,
      tree: nextTree,
      groups: flatGroupsFromTree(nextTree),
    })
  } catch (err) {
    console.error("worksheet-draft-reorder error:", err)
    return res.status(500).json({ error: err.message || "Failed to reorder draft" })
  }
}
