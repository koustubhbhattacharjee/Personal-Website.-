import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  loadWorksheetDraft,
  saveWorksheetDraft,
  flatGroupsFromTree,
  treeFromFlatGroups,
} from "../../../lib/worksheet-drafts"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function extractJsonPayload(raw) {
  if (!raw) return null
  const text = String(raw).replace(/```json|```/g, "").trim()
  const firstObj = text.indexOf("{")
  const lastObj = text.lastIndexOf("}")
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) return text.slice(firstObj, lastObj + 1)
  return null
}

async function callClaude(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim()
}

function inferBlockRole(block = {}) {
  if (block.kind === "image") return "image"
  const text = cleanText(block.text || "")
  if (!text) return "text"
  if (/^(ans|answer)\b[:\s-]/i.test(text)) return "answer"
  if (/^\(?[A-D]\)?[.\s]/.test(text) || /(?:^|\n)\(?[A-D]\)?[.\s]/.test(text)) return "options"
  if (/^(question|q)\s*\d+/i.test(text) || /^\d+[.)]\s/.test(text)) return "question"
  return "text"
}

// ─── Chapter / section header heuristics ─────────────────────────────────────
const UNIT_HEADER_RX = /^(unit|chapter|module)\s+(\d+|[ivxlcdm]+)\b[:.\s-]*(.*)$/i
const SECTION_HEADER_RX = /^(\d+)\.(\d+)\b[:.\s-]*(.*)$/
const TOPIC_HEADER_RX = /^(section|topic|part|lesson)\s+(\d+(?:\.\d+)?)\b[:.\s-]*(.*)$/i

function classifyHeader(text = "") {
  const t = cleanText(text)
  if (!t || t.length > 140) return null
  let m = UNIT_HEADER_RX.exec(t)
  if (m) return { level: "unit", label: t, number: m[2], title: cleanText(m[3]) }
  m = TOPIC_HEADER_RX.exec(t)
  if (m) return { level: "qt", label: t, number: m[2], title: cleanText(m[3]) }
  m = SECTION_HEADER_RX.exec(t)
  if (m) return { level: "qt", label: t, number: `${m[1]}.${m[2]}`, title: cleanText(m[3]) }
  return null
}

// ─── Deterministic fallback tree ─────────────────────────────────────────────
// When Claude is off or fails, build a tree directly from block order:
// detect unit/section headers, break questions on numbered patterns, and
// leave everything else under an "Unclassified" unit.
function fallbackProtoTree(blocks = []) {
  const sorted = [...blocks].sort(
    (a, b) => (Number(a.page || 0) - Number(b.page || 0)) || (Number(a.order || 0) - Number(b.order || 0))
  )

  const units = []
  let currentUnit = null
  let currentQT = null
  let currentQuestion = null
  let qCounter = 0
  let unitCounter = 0
  let qtCounter = 0

  function ensureUnit() {
    if (!currentUnit) {
      unitCounter += 1
      currentUnit = { id: `u${unitCounter}`, label: "Unclassified", question_types: [] }
      units.push(currentUnit)
      currentQT = null
    }
  }
  function ensureQT() {
    ensureUnit()
    if (!currentQT) {
      qtCounter += 1
      currentQT = {
        id: `qt${qtCounter}`,
        label: "Unsorted questions",
        section_ref: "",
        primary_slo: null,
        notes: "",
        questions: [],
      }
      currentUnit.question_types.push(currentQT)
      currentQuestion = null
    }
  }

  for (const block of sorted) {
    if (block.role === "ignore") continue
    const text = cleanText(block.text || "")

    if (block.kind === "text") {
      const header = classifyHeader(text)
      if (header?.level === "unit") {
        unitCounter += 1
        currentUnit = {
          id: `u${unitCounter}`,
          label: header.label,
          question_types: [],
        }
        units.push(currentUnit)
        currentQT = null
        currentQuestion = null
        continue
      }
      if (header?.level === "qt") {
        ensureUnit()
        qtCounter += 1
        currentQT = {
          id: `qt${qtCounter}`,
          label: header.label,
          section_ref: header.number || "",
          primary_slo: null,
          notes: "",
          questions: [],
        }
        currentUnit.question_types.push(currentQT)
        currentQuestion = null
        continue
      }
    }

    const startsQuestion =
      block.kind === "text" &&
      (/^(question|q)\s*\d+/i.test(text) || /^\d+[.)]\s/.test(text))

    if (!currentQuestion || startsQuestion) {
      ensureQT()
      qCounter += 1
      const match = text.match(/^(question|q)?\s*(\d+)/i)
      currentQuestion = {
        id: `q${qCounter}`,
        label: match?.[2] ? `Q${match[2]}` : `Group ${qCounter}`,
        kind: "single_question",
        ambiguous: false,
        confidence: startsQuestion ? 0.78 : 0.42,
        notes: startsQuestion
          ? "Deterministic question-start grouping."
          : "Fallback grouping without a clear question anchor.",
        assignments: [],
      }
      currentQT.questions.push(currentQuestion)
    }

    currentQuestion.assignments.push({
      source_block_id: block.id,
      role: inferBlockRole(block),
    })
  }

  // Drop questions with no assignments (shouldn't happen, but be safe).
  for (const u of units) {
    for (const qt of u.question_types) {
      qt.questions = qt.questions.filter((q) => q.assignments.length)
    }
    u.question_types = u.question_types.filter((qt) => qt.questions.length)
  }

  return { version: 2, units: units.filter((u) => u.question_types.length) }
}

// ─── Tree sanitization ───────────────────────────────────────────────────────
// Ensures IDs are unique across the whole tree, assignments point at valid
// blocks, every block is assigned at most once, and anything unassigned ends
// up in a trailing "Ungrouped" QT under the last unit.
function sanitizeProtoTree(rawTree, blocks = []) {
  const validIds = new Set(blocks.map((b) => b.id))
  const seenBlockIds = new Set()
  const usedUnitIds = new Set()
  const usedQtIds = new Set()
  const usedQuestionIds = new Set()
  let uCtr = 0
  let qtCtr = 0
  let qCtr = 0
  function freshUnitId() {
    uCtr += 1
    let id = `u${uCtr}`
    while (usedUnitIds.has(id)) { uCtr += 1; id = `u${uCtr}` }
    usedUnitIds.add(id)
    return id
  }
  function freshQtId() {
    qtCtr += 1
    let id = `qt${qtCtr}`
    while (usedQtIds.has(id)) { qtCtr += 1; id = `qt${qtCtr}` }
    usedQtIds.add(id)
    return id
  }
  function freshQuestionId() {
    qCtr += 1
    let id = `q${qCtr}`
    while (usedQuestionIds.has(id)) { qCtr += 1; id = `q${qCtr}` }
    usedQuestionIds.add(id)
    return id
  }

  const inUnits = Array.isArray(rawTree?.units) ? rawTree.units : []
  const outUnits = []

  for (const unit of inUnits) {
    const rawUnitId = String(unit?.id || "").trim()
    const unitId = rawUnitId && !usedUnitIds.has(rawUnitId) ? (usedUnitIds.add(rawUnitId), rawUnitId) : freshUnitId()
    const qts = Array.isArray(unit?.question_types) ? unit.question_types : []
    const outQts = []

    for (const qt of qts) {
      const rawQtId = String(qt?.id || "").trim()
      const qtId = rawQtId && !usedQtIds.has(rawQtId) ? (usedQtIds.add(rawQtId), rawQtId) : freshQtId()
      const questions = Array.isArray(qt?.questions) ? qt.questions : []
      const outQuestions = []

      for (const q of questions) {
        const rawQId = String(q?.id || "").trim()
        const qId = rawQId && !usedQuestionIds.has(rawQId) ? (usedQuestionIds.add(rawQId), rawQId) : freshQuestionId()
        const assignments = (Array.isArray(q?.assignments) ? q.assignments : [])
          .map((item) => ({
            source_block_id: String(item?.source_block_id || "").trim(),
            role: String(item?.role || "").trim() || "text",
            ...(item?.image_placement ? { image_placement: String(item.image_placement).trim() } : {}),
          }))
          .filter((item) => item.source_block_id && validIds.has(item.source_block_id) && !seenBlockIds.has(item.source_block_id))

        assignments.forEach((a) => seenBlockIds.add(a.source_block_id))
        if (!assignments.length) continue

        outQuestions.push({
          id: qId,
          label: String(q?.label || `Q${outQuestions.length + 1}`).trim() || `Q${outQuestions.length + 1}`,
          kind: String(q?.kind || "single_question").trim() || "single_question",
          ambiguous: !!q?.ambiguous,
          confidence: Number.isFinite(Number(q?.confidence)) ? Number(q.confidence) : 0.5,
          notes: cleanText(q?.notes || ""),
          assignments,
        })
      }

      if (!outQuestions.length) continue
      outQts.push({
        id: qtId,
        label: String(qt?.label || "Unsorted questions").trim() || "Unsorted questions",
        section_ref: String(qt?.section_ref || "").trim(),
        primary_slo: qt?.primary_slo ? String(qt.primary_slo).trim() : null,
        notes: cleanText(qt?.notes || ""),
        questions: outQuestions,
      })
    }

    if (!outQts.length) continue
    outUnits.push({
      id: unitId,
      label: String(unit?.label || "Unclassified").trim() || "Unclassified",
      question_types: outQts,
    })
  }

  // Anything unassigned goes into a trailing "Ungrouped" bucket so no content
  // is silently dropped between stages.
  const unassigned = blocks.filter((b) => b.id && !seenBlockIds.has(b.id) && b.role !== "ignore")
  if (unassigned.length) {
    const host = outUnits.length ? outUnits[outUnits.length - 1] : null
    const unit = host || { id: freshUnitId(), label: "Unclassified", question_types: [] }
    if (!host) outUnits.push(unit)
    const bucket = {
      id: freshQtId(),
      label: "Ungrouped blocks",
      section_ref: "",
      primary_slo: null,
      notes: "Auto-added: first-pass grouping left these blocks unassigned.",
      questions: unassigned.map((block) => ({
        id: freshQuestionId(),
        label: `Ungrouped ${block.id}`,
        kind: block.kind === "image" ? "ambiguous_orphan" : "single_question",
        ambiguous: true,
        confidence: 0.25,
        notes: "Auto-added because the first-pass grouping left this block unassigned.",
        assignments: [{ source_block_id: block.id, role: inferBlockRole(block) }],
      })),
    }
    unit.question_types.push(bucket)
  }

  return { version: 2, units: outUnits }
}

// ─── Claude proto-tree inference ─────────────────────────────────────────────
async function generateProtoTreeWithClaude(blocks = [], subjectName = "") {
  const sorted = [...blocks].sort((a, b) =>
    (Number(a.page || 0) - Number(b.page || 0)) || (Number(a.order || 0) - Number(b.order || 0))
  )

  const input = sorted.map((block, idx) => {
    const entry = {
      id: block.id,
      page: Number(block.page || 0),
      order: Number(block.order || 0),
      kind: block.kind,
      text: block.kind === "text" ? cleanText(block.text || "").slice(0, 1200) : "",
      hasImage: block.kind === "image",
    }
    if (block.kind === "image") {
      const prev = sorted[idx - 1]
      const next = sorted[idx + 1]
      if (prev) entry.prev = { id: prev.id, kind: prev.kind, text: prev.kind === "text" ? cleanText(prev.text || "").slice(0, 300) : "" }
      if (next) entry.next = { id: next.id, kind: next.kind, text: next.kind === "text" ? cleanText(next.text || "").slice(0, 300) : "" }
    }
    return entry
  })

  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: 9000,
    temperature: 0,
    messages: [{
      role: "user",
      content: `You are doing a first-pass STRUCTURAL grouping of OCR blocks for ${subjectName || "an educational worksheet"}.
Produce a 4-level tree: units → question_types → questions → block assignments.

Return ONLY valid JSON in this exact shape:
{
  "units": [
    {
      "id": "u1",
      "label": "Unit 1 — Functions",
      "question_types": [
        {
          "id": "qt1",
          "label": "Evaluating Functions",
          "section_ref": "1.4",
          "primary_slo": null,
          "notes": "short note, optional",
          "questions": [
            {
              "id": "q1",
              "label": "Q1",
              "kind": "single_question|shared_stimulus_set|continuation|ambiguous_orphan",
              "ambiguous": false,
              "confidence": 0.0,
              "notes": "short note",
              "assignments": [
                {
                  "source_block_id": "b1",
                  "role": "question|options|answer|explanation|image|header|shared_stimulus|text",
                  "image_placement": "above_question|below_question|shared|ambiguous|null"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Units correspond to chapters/units in the source (detect phrases like "Chapter 3", "Unit 2", big topic shifts).
- Question types group questions that drill the SAME skill (e.g. "Evaluate a function at a value", "Find domain of a rational function"). If the worksheet is organized by section (e.g. "1.4 Exercises"), one QT per section is fine.
- Inside each QT, create one "question" entry per individual question number. shared_stimulus_set is for a single shared image/passage that feeds multiple questions — list those questions together in one group.
- For EVERY image block, you are given prev and next neighbor blocks. Use them to decide placement:
  - "above_question": image appears before the question text it illustrates
  - "below_question": image appears after the question text
  - "shared": image is referenced by multiple questions
  - "ambiguous": placement cannot be determined
  - Set image_placement to null for non-image blocks.
- If you cannot infer a unit or QT, put content under a single unit labeled "Unclassified" with a QT labeled "Unsorted questions". Do not invent unit/section numbers that aren't in the source.
- Every block should appear AT MOST ONCE anywhere in the tree.
- Do not invent block IDs. Only use IDs from the input.
- If image or question placement is ambiguous, set ambiguous=true on that question and explain in notes.

Blocks:
${JSON.stringify(input)}`
    }],
  }

  const data = await callClaude(body)
  const payload = extractJsonPayload(data?.content?.[0]?.text || "")
  const parsed = payload ? JSON.parse(payload) : null
  return sanitizeProtoTree(parsed || {}, blocks)
}

// ─── Sidecar build (tree-aware) ──────────────────────────────────────────────
function buildSidecarFromTree(tree, blocks = []) {
  const blockById = new Map(blocks.map((b) => [b.id, b]))
  const sidecarBlocks = []
  const units = Array.isArray(tree?.units) ? tree.units : []

  for (const unit of units) {
    const qts = Array.isArray(unit?.question_types) ? unit.question_types : []
    for (const qt of qts) {
      const questions = Array.isArray(qt?.questions) ? qt.questions : []
      for (const [qIdx, q] of questions.entries()) {
        const assignments = Array.isArray(q?.assignments) ? q.assignments : []
        const ordered = assignments
          .map((a) => {
            const block = blockById.get(a.source_block_id)
            if (!block) return null
            return {
              ...block,
              assignedRole: a.role || inferBlockRole(block),
              imagePlacement: a.image_placement || null,
            }
          })
          .filter(Boolean)
          .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))

        if (!ordered.length) continue

        const rawText = ordered
          .filter((item) => item.kind === "text")
          .map((item) => `${String(item.assignedRole || "TEXT").toUpperCase()}: ${String(item.text || "").trim()}`)
          .join("\n\n")
          .trim()

        const orderedItems = ordered.map((item) => item.kind === "image"
          ? {
              kind: "image",
              role: item.assignedRole || "image",
              url: item.imageUrl || "",
              source_block_id: item.id,
              placement: item.imagePlacement || null,
            }
          : {
              kind: "text",
              role: item.assignedRole || "text",
              text: item.text || "",
              source_block_id: item.id,
            }
        )

        sidecarBlocks.push({
          label: String(q.label || `Q${qIdx + 1}`).trim() || `Q${qIdx + 1}`,
          raw_text: rawText,
          ordered_items: orderedItems,
          images: orderedItems
            .filter((item) => item.kind === "image" && item.url)
            .map((item) => ({
              url: item.url,
              role: item.role || "question_image",
              shared: q.kind === "shared_stimulus_set",
              placement: item.placement || null,
            })),
          source_block_ids: ordered.map((item) => item.id),
          proto_group_id: q.id,
          proto_group_kind: q.kind || "single_question",
          ambiguous: !!q.ambiguous,
          confidence: Number.isFinite(Number(q.confidence)) ? Number(q.confidence) : 0.5,
          notes: cleanText(q.notes || ""),
          unit_id: unit.id || "",
          unit_label: unit.label || "",
          qt_id: qt.id || "",
          qt_label: qt.label || "",
          qt_section_ref: qt.section_ref || "",
          qt_primary_slo: qt.primary_slo || null,
        })
      }
    }
  }

  return { version: 2, blocks: sidecarBlocks }
}

async function refineSidecarWithClaude(sidecar = null, subjectName = "") {
  if (!process.env.ANTHROPIC_API_KEY || !Array.isArray(sidecar?.blocks) || !sidecar.blocks.length) return sidecar
  const input = sidecar.blocks.map((block) => ({
    label: block.label,
    proto_group_kind: block.proto_group_kind,
    ambiguous: !!block.ambiguous,
    ordered_items: block.ordered_items,
  }))
  try {
    const body = {
      model: "claude-sonnet-4-6",
      max_tokens: 5000,
      temperature: 0,
      messages: [{
        role: "user",
        content: `You are cleaning curated worksheet groups for ${subjectName || "an educational subject"}.
Return ONLY valid JSON:
{
  "blocks": [
    {
      "label": "Q1",
      "raw_text": "Flattened text for downstream taxonomy classification",
      "ordered_items": [
        { "kind": "text", "role": "question", "text": "..." },
        { "kind": "image", "role": "image", "url": "https://..." }
      ]
    }
  ]
}

Rules:
- Do not reorder items.
- Preserve image URLs exactly.
- Improve text cleanliness only.
- Keep one output block per input block.

Input:
${JSON.stringify(input)}`
      }],
    }
    const data = await callClaude(body)
    const payload = extractJsonPayload(data?.content?.[0]?.text || "")
    const parsed = payload ? JSON.parse(payload) : null
    if (!Array.isArray(parsed?.blocks) || !parsed.blocks.length) return sidecar
    return {
      ...sidecar,
      blocks: parsed.blocks.map((block, index) => {
        const prev = sidecar.blocks[index] || {}
        const orderedItems = Array.isArray(block?.ordered_items) ? block.ordered_items : (prev.ordered_items || [])
        return {
          ...prev,
          label: String(block?.label || prev.label || `Q${index + 1}`).trim() || `Q${index + 1}`,
          raw_text: String(block?.raw_text || prev.raw_text || "").trim(),
          ordered_items: orderedItems,
          images: orderedItems
            .filter((item) => item?.kind === "image" && item?.url)
            .map((item) => ({
              url: item.url,
              role: item.role || "question_image",
              shared: prev.proto_group_kind === "shared_stimulus_set",
              placement: item.placement || null,
            })),
        }
      }).filter((block) => block.raw_text || block.images.length),
    }
  } catch (err) {
    console.warn("worksheet-sidecar-generate refinement fallback:", err.message)
    return sidecar
  }
}

function countTree(tree) {
  const units = Array.isArray(tree?.units) ? tree.units : []
  let qtCount = 0
  let qCount = 0
  let ambiguousQ = 0
  for (const u of units) {
    const qts = Array.isArray(u.question_types) ? u.question_types : []
    qtCount += qts.length
    for (const qt of qts) {
      const qs = Array.isArray(qt.questions) ? qt.questions : []
      qCount += qs.length
      for (const q of qs) if (q.ambiguous) ambiguousQ += 1
    }
  }
  return { units: units.length, questionTypes: qtCount, questions: qCount, ambiguousQuestions: ambiguousQ }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })
  if ((session.user?.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  try {
    const { studentId, subjectId, draftId, subjectName = "", useClaudeInference = false } = req.body || {}
    if (!studentId || !subjectId || !draftId) {
      return res.status(400).json({ error: "studentId, subjectId, and draftId are required" })
    }
    const bucket = process.env.R2_BUCKET
    if (!bucket) return res.status(500).json({ error: "R2_BUCKET is not configured" })

    const draft = await loadWorksheetDraft({ bucket, studentId, subjectId, draftId })
    if (!draft?.manifest) return res.status(404).json({ error: "Draft not found" })
    const blocks = Array.isArray(draft.rawBlocks) ? draft.rawBlocks : []
    if (!blocks.length) return res.status(400).json({ error: "Draft has no OCR blocks" })

    // Start from whatever's on disk (tree or legacy flat), and only rebuild if
    // nothing non-trivial is there. This preserves admin edits across re-runs.
    let tree = draft.tree && Array.isArray(draft.tree.units) && draft.tree.units.length
      ? sanitizeProtoTree(draft.tree, blocks)
      : (Array.isArray(draft.groups) && draft.groups.length
          ? sanitizeProtoTree(treeFromFlatGroups(draft.groups), blocks)
          : null)

    if (!tree || !tree.units.length) {
      tree = fallbackProtoTree(blocks)
      if (useClaudeInference && process.env.ANTHROPIC_API_KEY) {
        try {
          tree = await generateProtoTreeWithClaude(blocks, subjectName)
        } catch (err) {
          console.warn("worksheet-sidecar-generate proto-tree fallback:", err.message)
        }
      }
    }

    let sidecar = buildSidecarFromTree(tree, blocks)
    if (useClaudeInference) {
      sidecar = await refineSidecarWithClaude(sidecar, subjectName)
    }

    const counts = countTree(tree)
    const manifest = {
      ...draft.manifest,
      updatedAt: new Date().toISOString(),
      status: "sidecar_ready",
      counts: {
        ...(draft.manifest?.counts || {}),
        units: counts.units,
        questionTypes: counts.questionTypes,
        questions: counts.questions,
        ambiguousQuestions: counts.ambiguousQuestions,
      },
      inferenceMode: useClaudeInference ? "claude_opt_in" : "deterministic_default",
    }
    await saveWorksheetDraft({
      bucket,
      studentId,
      subjectId,
      draftId,
      manifest,
      rawBlocks: draft.rawBlocks || [],
      groups: tree,
      sidecar,
    })
    return res.status(200).json({
      ok: true,
      manifest,
      tree,
      groups: flatGroupsFromTree(tree),
      sidecar,
    })
  } catch (err) {
    console.error("worksheet-sidecar-generate error:", err)
    return res.status(500).json({ error: err.message || "Failed to generate sidecar" })
  }
}
