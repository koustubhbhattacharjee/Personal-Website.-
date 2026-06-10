// Core backfill logic — shared between API routes and auto-triggers from import.
// Both runStandardCodeBackfill and runReinforcementBackfill can be called
// programmatically (fire-and-forget from import) or from admin API routes.

import { getObjectiveCodesForPrompt } from "./district-taxonomy"
import { buildSloTaxonomyString, buildValidSloSet } from "./slo-utils"
import {
  getAllQuestionsForPage,
  getStudentById,
  getSubjectById,
  setScoreRowStandardCode,
  buildLoTableBlock,
} from "./db"
import { readGraph, writeGraph, mergeReinforcement } from "./lo-graph"
import { deriveReinforcementLos, getLoForSlo } from "./slo-utils"

const BASE = "https://api.notion.com/v1"

function fmtId(id) {
  if (!id) return id
  const clean = String(id).replace(/-/g, "")
  if (clean.length !== 32) return id
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`
}

function notionHeaders() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  }
}

async function notionGet(path) {
  const res = await fetch(`${BASE}${path}`, { headers: notionHeaders() })
  return res.json()
}

async function notionPost(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify(body || {}),
  })
  return res.json()
}

async function notionPatch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: notionHeaders(),
    body: JSON.stringify(body || {}),
  })
  return res.json()
}

async function callClaudeJSON(body) {
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

function extractJsonPayload(raw) {
  if (!raw) return null
  const text = raw.replace(/```json|```/g, "").trim()
  const firstObj = text.indexOf("{")
  const lastObj = text.lastIndexOf("}")
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    return text.slice(firstObj, lastObj + 1)
  }
  return null
}

// ─────────────────────────────────────────────
//  Standard Code Backfill
// ─────────────────────────────────────────────

async function queryMissingStandardCodeRows(studentId, subjectId) {
  const SCORES_DB = process.env.NOTION_SCORES_DB
  const res = await fetch(`${BASE}/databases/${fmtId(SCORES_DB)}/query`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify({
      filter: {
        and: [
          { property: "Student", relation: { contains: fmtId(studentId) } },
          { property: "subject", relation: { contains: fmtId(subjectId) } },
          {
            or: [
              { property: "standard_code", rich_text: { is_empty: true } },
              { property: "standard_code", rich_text: { equals: "" } },
            ],
          },
        ],
      },
      page_size: 100,
      sorts: [{ property: "Date Introduced", direction: "descending" }],
    }),
  })
  const data = await res.json()
  return (data.results || []).map((row) => ({
    id: row.id,
    title: row.properties?.Name?.title?.[0]?.plain_text || "",
    questionId: fmtId(row.properties?.["Question ID"]?.rich_text?.[0]?.plain_text || ""),
    dateIntroduced: row.properties?.["Date Introduced"]?.date?.start || "",
  }))
}

async function inferStandardCodesForQuestion({ subjectName, objectiveCodes, title, examples, sloTaxonomyString = "", validSloIds = new Set() }) {
  const objectiveList = objectiveCodes
    .map((o) => {
      const sub = (o.subtopics || []).map((s) => `    • ${typeof s === "string" ? s : s.text}`).join("\n")
      return `"${o.code}" — ${o.name}` + (sub ? `\n${sub}` : "")
    })
    .join("\n")

  const formattedExamples = (examples || [])
    .slice(0, 5)
    .map((ex, idx) =>
      [
        `Example ${idx + 1}:`,
        ex.contextHeader ? `Context: ${ex.contextHeader}` : "",
        `Q: ${ex.question || ""}`,
        ex.answer ? `A: ${ex.answer}` : "",
        ex.imageUrl ? `Image: ${ex.imageUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n")
    .slice(0, 16000)

  const useSloPath = sloTaxonomyString.length > 0
  const sloSection = useSloPath
    ? `\nAlso choose the single best "primary_slo" from these SLO IDs:\n${sloTaxonomyString}\n`
    : ""
  const returnShape = useSloPath
    ? `{\n  "standard_codes": ["CODE1"],\n  "primary_slo": "SLO_ID"\n}`
    : `{\n  "standard_codes": ["CODE1", "CODE2"]\n}`

  const prompt = `You are mapping a tutoring question type to curriculum learning objective codes.

Subject: ${subjectName}
Question type title: ${title}

Representative question examples for this question type:
${formattedExamples || "(no parsed question/answer examples found)"}

Allowed objective codes:
${objectiveList}
${sloSection}
Return ONLY valid JSON:
${returnShape}

Rules:
- Pick only from the allowed codes above
- Include every code that genuinely applies, but do not over-tag
- Base the mapping on the actual worked question examples, not just the title
- Repeated examples across different student context separators are still the same underlying skill
- If nothing clearly matches, return an empty array
- Do not invent codes`

  const data = await callClaudeJSON({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  })

  const payload = extractJsonPayload(data.content?.[0]?.text || "")
  if (!payload) return { standard_codes: [], primary_slo: "" }
  try {
    const parsed = JSON.parse(payload)
    const standard_codes = Array.isArray(parsed.standard_codes)
      ? parsed.standard_codes.map((code) => String(code).trim()).filter(Boolean)
      : []
    const primary_slo =
      useSloPath && validSloIds.has(String(parsed.primary_slo || "").trim())
        ? String(parsed.primary_slo).trim()
        : ""
    return { standard_codes, primary_slo }
  } catch {
    return { standard_codes: [], primary_slo: "" }
  }
}

export async function runStandardCodeBackfill(studentId, subjectId) {
  const [student, subject] = await Promise.all([
    getStudentById(studentId),
    getSubjectById(subjectId),
  ])

  const objectiveCodes = getObjectiveCodesForPrompt(student.state || null, subject.name || "")
  if (!objectiveCodes.length) return { scanned: 0, updated: 0, skipped: 0, items: [] }

  const sloTaxonomyString = buildSloTaxonomyString(student.state || null, subject.name || "")
  const validSloIds = buildValidSloSet(student.state || null, subject.name || "")

  const rows = await queryMissingStandardCodeRows(studentId, subjectId)
  if (!rows.length) return { scanned: 0, updated: 0, skipped: 0, items: [] }

  const items = []
  let updated = 0
  let skipped = 0

  for (const row of rows) {
    if (!row.questionId) {
      skipped += 1
      items.push({ scoreRowId: row.id, title: row.title, status: "skipped", reason: "Missing Question ID" })
      continue
    }

    const examples = await getAllQuestionsForPage(row.questionId)
    const { standard_codes: standardCodes, primary_slo: primarySlo } = await inferStandardCodesForQuestion({
      subjectName: subject.name,
      objectiveCodes,
      title: row.title,
      examples,
      sloTaxonomyString,
      validSloIds,
    })

    if (!standardCodes.length) {
      skipped += 1
      items.push({ scoreRowId: row.id, title: row.title, status: "skipped", reason: "No confident taxonomy match" })
      continue
    }

    const joinedCodes = standardCodes.join(", ")
    await setScoreRowStandardCode(row.id, joinedCodes)

    if (primarySlo && row.questionId) {
      await notionPatch(`/pages/${fmtId(row.questionId)}`, {
        properties: {
          primary_slo: { rich_text: [{ type: "text", text: { content: primarySlo } }] },
        },
      }).catch(() => {})
    }

    updated += 1
    items.push({
      scoreRowId: row.id,
      title: row.title,
      status: "updated",
      standardCode: joinedCodes,
      primary_slo: primarySlo || undefined,
    })
  }

  return { scanned: rows.length, updated, skipped, items }
}

// ─────────────────────────────────────────────
//  Reinforcement Backfill
// ─────────────────────────────────────────────

async function getQuestionPagesForSubject(studentId, subjectId) {
  const SCORES_DB = process.env.NOTION_SCORES_DB
  const unique = new Map()
  let cursor
  do {
    const body = {
      filter: {
        and: [
          { property: "Student", relation: { contains: fmtId(studentId) } },
          { property: "subject", relation: { contains: fmtId(subjectId) } },
        ],
      },
      page_size: 100,
    }
    if (cursor) body.start_cursor = cursor
    const data = await notionPost(`/databases/${fmtId(SCORES_DB)}/query`, body)
    for (const row of data.results || []) {
      const qid = fmtId(row.properties?.["Question ID"]?.rich_text?.[0]?.plain_text || "")
      const title = row.properties?.Name?.title?.[0]?.plain_text || ""
      const standardCode = row.properties?.standard_code?.rich_text?.[0]?.plain_text || ""
      if (qid && !unique.has(qid)) unique.set(qid, { questionId: qid, title, standardCode })
    }
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
  return [...unique.values()]
}

function getBlockText(block) {
  if (!["paragraph", "numbered_list_item", "bulleted_list_item"].includes(block?.type)) return ""
  return block[block.type]?.rich_text?.map((t) => t.plain_text).join("") || ""
}

function stripQhash(text) {
  return text.trim().replace(/^<!--qhash:[^>]*-->\s*/, "")
}

async function extractUntaggedPairs(pageId) {
  const data = await notionGet(`/blocks/${fmtId(pageId)}/children`)
  const blocks = data.results || []
  const pairs = []
  for (let i = 0; i < blocks.length; i++) {
    const text = getBlockText(blocks[i])
    if (!text) continue
    const stripped = stripQhash(text)
    if (!stripped.startsWith("Q:")) continue
    const question = stripped.slice(2).trim()
    if (!question) continue
    let aIdx = -1
    for (let j = i + 1; j < blocks.length; j++) {
      const t = stripQhash(getBlockText(blocks[j]))
      if (t.startsWith("A:")) { aIdx = j; break }
      if (t.startsWith("Q:")) break
    }
    if (aIdx === -1) continue
    const answer = stripQhash(getBlockText(blocks[aIdx])).slice(2).trim()
    const aBlockId = blocks[aIdx].id
    const nextIdx = aIdx + 1
    if (nextIdx < blocks.length) {
      const nextText = stripQhash(getBlockText(blocks[nextIdx]))
      if (nextText.startsWith("E:")) { i = aIdx; continue }
    }
    pairs.push({ question, answer, aBlockId })
    i = aIdx
  }
  return pairs
}

async function tagBatch(batch, subjectName, objectiveList) {
  const data = await callClaudeJSON({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{
      role: "user",
      content: `You are tagging tutoring questions for learning-objective reinforcement in ${subjectName}.

For each question:
- choose exactly one "primary_lo"
- choose up to 4 additional reinforced learning objectives in "reinforcement"
- each reinforcement item must have a weight between 0 and 1
- do NOT include the primary LO inside reinforcement
- weights should reflect how much that related LO is genuinely used in the solution
- keep only meaningful reinforcements; return an empty array if none

Allowed objective codes:
${objectiveList}

Questions:
${JSON.stringify(batch, null, 2)}

Return ONLY valid JSON array, one entry per question:
[
  {
    "index": 0,
    "primary_lo": "APPhy1.8.3",
    "reinforcement": [
      { "code": "APPhy1.8.2", "weight": 0.2 }
    ]
  }
]`,
    }],
  })
  const text = data.content?.[0]?.text?.replace(/```json|```/g, "").trim() || "[]"
  const parsed = JSON.parse(text)
  return new Map(
    (Array.isArray(parsed) ? parsed : [])
      .filter((item) => Number.isInteger(item?.index))
      .map((item) => [
        item.index,
        {
          primary_lo: String(item?.primary_lo || "").trim(),
          reinforcement: (Array.isArray(item?.reinforcement) ? item.reinforcement : [])
            .map((e) => ({
              code: String(e?.code || "").trim(),
              weight: Math.max(0, Math.min(1, Number(e?.weight || 0))),
            }))
            .filter((e) => e.code && Number.isFinite(e.weight) && e.weight > 0)
            .filter((e) => e.code !== String(item?.primary_lo || "").trim())
            .slice(0, 4),
        },
      ])
  )
}

async function tagBatchSlo(batch, subjectName, sloTaxonomyString, validSloIds) {
  const data = await callClaudeJSON({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    temperature: 0,
    messages: [{
      role: "user",
      content: `You are tagging tutoring questions at the sub-learning-objective (SLO) level in ${subjectName}.

For each question:
- choose exactly one "primary_slo" from the list below
- choose up to 4 "reinforcement_slos" with weights summing to ≤ 1.0
- do NOT include the primary SLO inside reinforcement_slos
- weights reflect how much that SLO is genuinely used in the solution

Allowed SLO IDs:
${sloTaxonomyString}

Questions:
${JSON.stringify(batch, null, 2)}

Return ONLY valid JSON array, one entry per question:
[
  {
    "index": 0,
    "primary_slo": "APPhy1.8.4.1",
    "reinforcement_slos": [
      { "slo_id": "APPhy1.8.4.2", "weight": 0.3 }
    ]
  }
]`,
    }],
  })
  const text = data.content?.[0]?.text?.replace(/```json|```/g, "").trim() || "[]"
  try {
    const parsed = JSON.parse(text)
    return new Map(
      (Array.isArray(parsed) ? parsed : [])
        .filter((item) => Number.isInteger(item?.index))
        .map((item) => {
          const primarySlo = validSloIds.has(String(item?.primary_slo || "").trim())
            ? String(item.primary_slo).trim()
            : ""
          const reinforcementSlos = (Array.isArray(item?.reinforcement_slos) ? item.reinforcement_slos : [])
            .map((e) => ({
              slo_id: String(e?.slo_id || "").trim(),
              weight: Math.max(0, Math.min(1, Number(e?.weight || 0))),
            }))
            .filter((e) => e.slo_id && validSloIds.has(e.slo_id) && e.weight > 0 && e.slo_id !== primarySlo)
            .slice(0, 4)
          return [item.index, { primary_slo: primarySlo, reinforcement_slos: reinforcementSlos }]
        })
    )
  } catch {
    return new Map()
  }
}

const REINFORCEMENT_BATCH_SIZE = 10

export async function runReinforcementBackfill(studentId, subjectId, { dryRun = false } = {}) {
  const [student, subject] = await Promise.all([
    getStudentById(studentId),
    getSubjectById(subjectId),
  ])

  const codeOptions = getObjectiveCodesForPrompt(student?.state || null, subject?.name || "")
  const objectiveList = codeOptions.length
    ? codeOptions
        .map((o) => {
          const sub = (o.subtopics || []).map((s) => `    • ${typeof s === "string" ? s : s.text}`).join("\n")
          return `"${o.code}" — ${o.name}` + (sub ? `\n${sub}` : "")
        })
        .join("\n")
    : ""
  const loNameMap = Object.fromEntries(codeOptions.map((o) => [o.code, o.name]))
  const getLoName = (code) => loNameMap[code] || ""

  const sloTaxonomyString = buildSloTaxonomyString(student?.state || null, subject?.name || "")
  const validSloIds = buildValidSloSet(student?.state || null, subject?.name || "")
  const useSloPath = sloTaxonomyString.length > 0

  const pages = await getQuestionPagesForSubject(studentId, subjectId)

  const needsTag = []
  for (const page of pages) {
    const pairs = await extractUntaggedPairs(page.questionId)
    for (const pair of pairs) {
      needsTag.push({
        questionId: page.questionId,
        pageTitle: page.title,
        standardCode: page.standardCode,
        question: pair.question,
        answer: pair.answer,
        aBlockId: pair.aBlockId,
      })
    }
  }

  if (dryRun) {
    return {
      dryRun: true,
      scannedPages: pages.length,
      needsTagging: needsTag.length,
      sample: needsTag.slice(0, 5).map((p) => ({ pageTitle: p.pageTitle, question: p.question.slice(0, 80) })),
    }
  }

  if (!needsTag.length) {
    return { scannedPages: pages.length, taggedQuestions: 0, skipped: 0 }
  }

  let taggedQuestions = 0
  let skipped = 0
  const items = []
  const loGraph = await readGraph()

  for (let i = 0; i < needsTag.length; i += REINFORCEMENT_BATCH_SIZE) {
    const batch = needsTag.slice(i, i + REINFORCEMENT_BATCH_SIZE)
    const input = batch.map((p, batchIdx) => ({
      index: batchIdx,
      question: p.question,
      answer: p.answer,
      primaryCandidates: p.standardCode
        ? p.standardCode
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    }))

    let resultMap
    let isSloResult = false
    try {
      if (useSloPath) {
        resultMap = await tagBatchSlo(input, subject?.name || "", sloTaxonomyString, validSloIds)
        isSloResult = true
      } else if (objectiveList) {
        resultMap = await tagBatch(input, subject?.name || "", objectiveList)
      } else {
        resultMap = new Map(
          input.map((item) => [item.index, { primary_lo: item.primaryCandidates[0] || "", reinforcement: [] }])
        )
      }
    } catch (err) {
      console.warn("[backfill] reinforcement Claude batch failed:", err?.message || err)
      resultMap = new Map(
        input.map((item) => [item.index, { primary_lo: item.primaryCandidates[0] || "", reinforcement: [] }])
      )
    }

    for (let batchIdx = 0; batchIdx < batch.length; batchIdx++) {
      const entry = batch[batchIdx]
      const raw = resultMap.get(batchIdx)

      let explanationMap
      let primarySlo = ""
      if (isSloResult && raw) {
        primarySlo = raw.primary_slo || ""
        const primaryLo = getLoForSlo(primarySlo) || entry.standardCode?.split(",")[0]?.trim() || ""
        const reinforcementLos = deriveReinforcementLos(raw.reinforcement_slos || [])
        explanationMap = {
          primary_lo: primaryLo,
          reinforcement: reinforcementLos.map((r) => ({ code: r.lo_code, weight: r.weight })),
        }
      } else {
        explanationMap = raw || {
          primary_lo: entry.standardCode?.split(",")[0]?.trim() || "",
          reinforcement: [],
        }
      }

      try {
        const tableBlock = buildLoTableBlock(
          explanationMap.primary_lo || "",
          Array.isArray(explanationMap.reinforcement) ? explanationMap.reinforcement : [],
          getLoName
        )
        await notionPatch(`/blocks/${fmtId(entry.questionId)}/children`, {
          after: fmtId(entry.aBlockId),
          children: [tableBlock],
        })
        if (primarySlo) {
          await notionPatch(`/pages/${fmtId(entry.questionId)}`, {
            properties: {
              primary_slo: { rich_text: [{ type: "text", text: { content: primarySlo } }] },
            },
          }).catch(() => {})
        }
        mergeReinforcement(loGraph, explanationMap.primary_lo, "", Object.fromEntries(
          (explanationMap.reinforcement || []).map((r) => [r.code, r.weight])
        ), codeOptions)
        taggedQuestions += 1
        items.push({
          pageTitle: entry.pageTitle,
          question: entry.question.slice(0, 80),
          status: "tagged",
          primary_lo: explanationMap.primary_lo,
          primary_slo: primarySlo || undefined,
          reinforcementCount: explanationMap.reinforcement.length,
        })
      } catch (err) {
        skipped += 1
        items.push({
          pageTitle: entry.pageTitle,
          question: entry.question.slice(0, 80),
          status: "failed",
          reason: err?.message || "insert failed",
        })
      }
    }
  }

  await writeGraph(loGraph)

  return { scannedPages: pages.length, taggedQuestions, skipped, items }
}
