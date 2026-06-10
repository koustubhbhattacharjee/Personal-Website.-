import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  loadWorksheetDraft,
  saveWorksheetDraft,
  flatGroupsFromTree,
  treeFromFlatGroups,
} from "../../../lib/worksheet-drafts"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function assertAdmin(session) {
  if (!session) throw new Error("Unauthorized")
  if ((session.user?.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new Error("Forbidden")
  }
}

function isTreePayload(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.units)
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  try {
    assertAdmin(session)
  } catch (err) {
    const status = err.message === "Unauthorized" ? 401 : 403
    return res.status(status).json({ error: err.message })
  }

  const bucket = process.env.R2_BUCKET
  if (!bucket) return res.status(500).json({ error: "R2_BUCKET is not configured" })

  if (req.method === "GET") {
    const { studentId, subjectId, draftId } = req.query || {}
    if (!studentId || !subjectId || !draftId) {
      return res.status(400).json({ error: "studentId, subjectId, and draftId are required" })
    }
    const draft = await loadWorksheetDraft({ bucket, studentId, subjectId, draftId })
    if (!draft?.manifest) return res.status(404).json({ error: "Draft not found" })
    return res.status(200).json({
      ok: true,
      manifest: draft.manifest,
      blocks: draft.rawBlocks || [],
      groups: draft.groups || [],
      tree: draft.tree || { version: 2, units: [] },
      sidecar: draft.sidecar || null,
    })
  }

  if (req.method === "POST") {
    const { studentId, subjectId, draftId, blocks, groups, tree, manifestPatch = {} } = req.body || {}
    if (!studentId || !subjectId || !draftId || !Array.isArray(blocks)) {
      return res.status(400).json({ error: "studentId, subjectId, draftId, and blocks are required" })
    }
    const draft = await loadWorksheetDraft({ bucket, studentId, subjectId, draftId })
    if (!draft?.manifest) return res.status(404).json({ error: "Draft not found" })

    // Accept either a tree or a flat groups array from the client; always
    // persist the tree (v2 shape) as the source of truth.
    let nextTree
    if (isTreePayload(tree)) {
      nextTree = { version: 2, units: tree.units }
    } else if (Array.isArray(groups)) {
      nextTree = treeFromFlatGroups(groups)
    } else {
      nextTree = draft.tree || treeFromFlatGroups(draft.groups || [])
    }

    const manifest = {
      ...draft.manifest,
      ...manifestPatch,
      updatedAt: new Date().toISOString(),
      status: draft.sidecar ? "sidecar_ready" : "structured",
    }
    await saveWorksheetDraft({
      bucket,
      studentId,
      subjectId,
      draftId,
      manifest,
      rawBlocks: blocks,
      groups: nextTree,
      sidecar: draft.sidecar || undefined,
    })
    return res.status(200).json({
      ok: true,
      manifest,
      tree: nextTree,
      groups: flatGroupsFromTree(nextTree),
    })
  }

  return res.status(405).end()
}
