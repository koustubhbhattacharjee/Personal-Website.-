import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  appendQuestionImageReference,
  getAllQuestionsForPage,
  listDraftRowsForDate,
} from "../../../lib/db"
import { loadWorksheetDraft } from "../../../lib/worksheet-drafts"
import { loadDraftContext, saveDraftContext } from "../../../lib/draft-context"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function assertAdmin(session) {
  if (!session) throw new Error("Unauthorized")
  if ((session.user?.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    throw new Error("Forbidden")
  }
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\[image:[^\]]+\]/gi, " ")
    .replace(/<!--qhash:[^>]*-->/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value = "") {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
}

function buildQuestionKey(question = {}, index = 0) {
  return String(question.qhash || `idx:${index}`)
}

function buildQuestionQuery(question = {}) {
  const base = [question.question || "", question.answer || ""].filter(Boolean).join(" ")
  return normalizeText(base)
}

function scoreTextMatch(questionText = "", blockText = "") {
  const qTokens = tokenize(questionText)
  const bTokens = new Set(tokenize(blockText))
  if (!qTokens.length || !bTokens.size) return 0
  let overlap = 0
  for (const token of qTokens) {
    if (bTokens.has(token)) overlap += 1
  }
  const overlapRatio = overlap / Math.max(1, Math.min(qTokens.length, 18))
  const anchorPhrase = qTokens.slice(0, 8).join(" ")
  const phraseBonus = anchorPhrase && normalizeText(blockText).includes(anchorPhrase) ? 0.35 : 0
  return overlapRatio + phraseBonus
}

function buildContextCandidate(doc = {}, blocks = [], anchorIndex = 0, score = 0) {
  const anchor = blocks[anchorIndex] || null
  const page = Number(anchor?.page || 1)
  const samePage = blocks.filter((block) => Number(block.page || 1) === page)
  const pageIndex = samePage.findIndex((block) => block.id === anchor?.id)
  const start = Math.max(0, pageIndex - 2)
  const end = Math.min(samePage.length, pageIndex + 3)
  const windowBlocks = samePage.slice(start, end)
  const imageUrls = windowBlocks
    .filter((block) => block.kind === "image" && block.imageUrl)
    .map((block) => block.imageUrl)
  const contextText = windowBlocks
    .filter((block) => block.kind === "text")
    .map((block) => String(block.text || "").trim())
    .filter(Boolean)
    .join("\n\n")

  return {
    sourceDraftId: doc.draftId,
    sourceLabel: doc.manifest?.source?.sourceLabel || doc.manifest?.source?.fileName || `Document ${doc.draftId}`,
    page,
    blockId: anchor?.id || "",
    blockOrder: anchor?.order ?? null,
    score: Math.round(Number(score || 0) * 1000) / 1000,
    excerpt: String(anchor?.text || "").slice(0, 280),
    contextText: contextText.slice(0, 2200),
    contextBlockIds: windowBlocks.map((block) => block.id).filter(Boolean),
    imageUrls,
    pageImageUrl: anchor?.pageImageUrl || "",
  }
}

function chooseCandidatesForQuestion(question = {}, docs = []) {
  const questionText = buildQuestionQuery(question)
  const candidates = []
  for (const doc of docs) {
    const textBlocks = (doc.rawBlocks || []).filter((block) => block.kind === "text" && String(block.text || "").trim())
    for (let index = 0; index < textBlocks.length; index += 1) {
      const block = textBlocks[index]
      const score = scoreTextMatch(questionText, block.text || "")
      if (score < 0.22) continue
      candidates.push(buildContextCandidate(doc, textBlocks, index, score))
    }
  }
  return candidates
    .sort((a, b) =>
      (Number(b.score || 0) - Number(a.score || 0)) ||
      ((b.imageUrls?.length || 0) - (a.imageUrls?.length || 0)) ||
      String(a.sourceLabel || "").localeCompare(String(b.sourceLabel || ""))
    )
    .slice(0, 8)
}

async function loadDraftItems({ bucket, studentId, subjectId, sessionDate }) {
  const rows = await listDraftRowsForDate(studentId, subjectId, sessionDate, { limit: 300 }).catch(() => [])
  const activeRows = rows.filter((row) => row.state !== "archived" && row.state !== "homework_pool")
  const items = await Promise.all(activeRows.map(async (row) => {
    const [questions, context] = await Promise.all([
      row.questionPageId ? getAllQuestionsForPage(row.questionPageId).catch(() => []) : Promise.resolve([]),
      loadDraftContext({ bucket, studentId, subjectId, draftRowId: row.id }).catch(() => null),
    ])
    return {
      ...row,
      questions: (questions || []).map((question, index) => ({
        key: buildQuestionKey(question, index),
        qhash: question.qhash || "",
        question: question.question || "",
        answer: question.answer || "",
        imageUrl: question.imageUrl || "",
        contextHeader: question.contextHeader || "",
        attachment: context?.attachments?.[buildQuestionKey(question, index)] || null,
      })),
    }
  }))
  return items
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
    const { studentId = "", subjectId = "", sessionDate = "" } = req.query || {}
    if (!studentId || !subjectId || !sessionDate) {
      return res.status(400).json({ error: "studentId, subjectId, and sessionDate are required" })
    }
    const draftItems = await loadDraftItems({ bucket, studentId, subjectId, sessionDate })
    return res.status(200).json({ ok: true, draftItems })
  }

  if (req.method !== "POST") return res.status(405).end()

  const { action = "" } = req.body || {}

  if (action === "match") {
    const { studentId = "", subjectId = "", sessionDate = "", draftIds = [] } = req.body || {}
    if (!studentId || !subjectId || !sessionDate || !Array.isArray(draftIds) || !draftIds.length) {
      return res.status(400).json({ error: "studentId, subjectId, sessionDate, and draftIds are required" })
    }

    const [draftItems, docs] = await Promise.all([
      loadDraftItems({ bucket, studentId, subjectId, sessionDate }),
      Promise.all(draftIds.map(async (draftId) => {
        const draft = await loadWorksheetDraft({ bucket, studentId, subjectId, draftId })
        return {
          draftId,
          manifest: draft?.manifest || null,
          rawBlocks: draft?.rawBlocks || [],
        }
      })),
    ])

    const matches = draftItems.map((item) => ({
      draftRowId: item.id,
      title: item.title,
      questionPageId: item.questionPageId,
      assignedSessionDate: item.assignedSessionDate || "",
      questions: (item.questions || []).map((question) => ({
        ...question,
        candidates: chooseCandidatesForQuestion(question, docs),
      })),
    }))

    return res.status(200).json({
      ok: true,
      docs: docs.map((doc) => ({
        draftId: doc.draftId,
        sourceLabel: doc.manifest?.source?.sourceLabel || doc.manifest?.source?.fileName || `Document ${doc.draftId}`,
        manifest: doc.manifest || null,
        blocks: doc.rawBlocks || [],
      })),
      matches,
    })
  }

  if (action === "attach") {
    const {
      studentId = "",
      subjectId = "",
      draftRowId = "",
      questionPageId = "",
      questionKey = "",
      qhash = "",
      imageUrl = "",
      sourceDraftId = "",
      sourceLabel = "",
      matchedBlockId = "",
      contextBlockIds = [],
      contextText = "",
    } = req.body || {}

    if (!studentId || !subjectId || !draftRowId || !questionPageId || !questionKey || !imageUrl) {
      return res.status(400).json({ error: "studentId, subjectId, draftRowId, questionPageId, questionKey, and imageUrl are required" })
    }

    const existing = (await loadDraftContext({ bucket, studentId, subjectId, draftRowId }).catch(() => null)) || {}
    const attachment = {
      imageUrl: String(imageUrl || "").trim(),
      qhash: String(qhash || "").trim(),
      sourceDraftId: String(sourceDraftId || "").trim(),
      sourceLabel: String(sourceLabel || "").trim(),
      matchedBlockId: String(matchedBlockId || "").trim(),
      contextBlockIds: Array.isArray(contextBlockIds) ? contextBlockIds.filter(Boolean) : [],
      contextText: String(contextText || "").slice(0, 4000),
      attachedAt: new Date().toISOString(),
    }

    const next = {
      ...existing,
      studentId,
      subjectId,
      draftRowId,
      questionPageId,
      updatedAt: new Date().toISOString(),
      attachments: {
        ...(existing.attachments || {}),
        [questionKey]: attachment,
      },
    }
    await saveDraftContext({ bucket, studentId, subjectId, draftRowId, data: next })

    if (qhash) {
      await appendQuestionImageReference(questionPageId, {
        qhash,
        imageUrl,
        sourceLabel,
      }).catch(() => null)
    }

    return res.status(200).json({ ok: true, attachment })
  }

  return res.status(400).json({ error: "Unknown action." })
}
