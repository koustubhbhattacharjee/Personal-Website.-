// ─────────────────────────────────────────────────────────────────────────────
//  Notion API
//  Architecture:
//  - Subject DB: shared across all students. No dates, no student relation.
//  - Scores DB: one row per (student × question). Holds Date Introduced,
//    weakness score, hw_streak, topics, unit. Source of truth for scheduling.
// ─────────────────────────────────────────────────────────────────────────────

import { deriveReinforcementLos, getLoForSlo } from "./slo-utils.js"

// Flip to false to restore age-based decay of mastery scores.
// While true, past work retains full strength (no color fade over time).
// false in this showcase clone: the tour needs real forgetting-curve visuals.
const MASTERY_DECAY_BYPASS = false

const BASE = "https://api.notion.com/v1"
const STUDENTS_DB    = process.env.NOTION_STUDENTS_DB
const SUBJECTS_DB    = process.env.NOTION_SUBJECTS_DB
const ENROLLMENTS_DB = process.env.NOTION_ENROLLMENTS_DB
const SCORES_DB      = process.env.NOTION_SCORES_DB
const REPORTS_DB     = process.env.NOTION_REPORTS_DB
const HOMEWORK_ATTEMPTS_DB = process.env.NOTION_HOMEWORK_ATTEMPTS_DB
const ASSESSMENT_ATTEMPTS_DB = process.env.NOTION_ASSESSMENT_ATTEMPTS_DB
const SESSIONS_DB = process.env.NOTION_SESSIONS_DB
const DRAFT_DB = process.env.NOTION_DRAFT_DB

function fmtId(id) {
  if (!id) return id
  const clean = id.replace(/-/g, "")
  if (clean.length !== 32) return id
  return `${clean.slice(0,8)}-${clean.slice(8,12)}-${clean.slice(12,16)}-${clean.slice(16,20)}-${clean.slice(20)}`
}

function parseHwSource(raw = "") {
  const value = String(raw || "").trim()
  if (!value) return { kind: "", assignedAt: "", sessionDate: "", raw: "" }
  const [kind, ...parts] = value.split("::").map((part) => part.trim()).filter(Boolean)
  const meta = { kind: kind || "", assignedAt: "", sessionDate: "", raw: value }
  for (const part of parts) {
    const [key, ...rest] = part.split("=")
    const parsedKey = String(key || "").trim()
    const parsedValue = rest.join("=").trim()
    if (parsedKey === "assigned_at") meta.assignedAt = parsedValue
    if (parsedKey === "session_date") meta.sessionDate = parsedValue
  }
  return meta
}

export function formatHwSource(kind = "", { assignedAt = "", sessionDate = "" } = {}) {
  const base = String(kind || "").trim()
  if (!base) return ""
  const parts = [base]
  if (assignedAt) parts.push(`assigned_at=${assignedAt}`)
  if (sessionDate) parts.push(`session_date=${sessionDate}`)
  return parts.join("::")
}

export function isHwSourceKind(raw = "", expectedKind = "") {
  return parseHwSource(raw).kind === expectedKind
}

export function getDateForTimestampInTimezone(isoString, tz = "UTC") {
  if (!isoString) return null
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(isoString))
    const year = parts.find((part) => part.type === "year")?.value || ""
    const month = parts.find((part) => part.type === "month")?.value || ""
    const day = parts.find((part) => part.type === "day")?.value || ""
    return year && month && day ? `${year}-${month}-${day}` : null
  } catch {
    return null
  }
}

export function isAdminHomeworkVisible(hwSourceRaw, studentTimezone, todayDateStr) {
  const parsed = parseHwSource(hwSourceRaw)
  if (parsed.kind !== "admin_hw") return false
  if (!parsed.assignedAt) return true
  const assignedLocalDate = getDateForTimestampInTimezone(parsed.assignedAt, studentTimezone || "UTC")
  if (!assignedLocalDate || !todayDateStr) return true
  return assignedLocalDate <= todayDateStr
}

function makeHeaders(version) {
  return {
    "Authorization": `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": version,
    "Content-Type": "application/json",
  }
}

async function notionGet(path, version = "2022-06-28") {
  const res = await fetch(`${BASE}${path}`, { headers: makeHeaders(version) })
  return res.json()
}

async function notionPost(path, body = {}, version = "2022-06-28") {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: makeHeaders(version),
    body: JSON.stringify(body)
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { object: "error", status: res.status, message: text.slice(0, 200) } }
}

async function notionPatch(path, body = {}, version = "2022-06-28") {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: makeHeaders(version),
    body: JSON.stringify(body)
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { object: "error", status: res.status, message: text.slice(0, 200) } }
}

async function notionDelete(path, version = "2022-06-28") {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: makeHeaders(version),
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { object: "error", status: res.status, message: text.slice(0, 200) } }
}

async function queryDB(dbId, filter, sorts = []) {
  const id = fmtId(dbId)
  const body = { sorts }
  if (filter && Object.keys(filter).length) body.filter = filter
  return notionPost(`/databases/${id}/query`, body, "2022-06-28")
}

async function queryDBAll(dbId, filter, sorts = []) {
  const id = fmtId(dbId)
  const results = []
  let startCursor = null

  while (true) {
    const body = { sorts, page_size: 100 }
    if (filter && Object.keys(filter).length) body.filter = filter
    if (startCursor) body.start_cursor = startCursor
    const res = await notionPost(`/databases/${id}/query`, body, "2022-06-28")
    results.push(...(res.results || []))
    if (!res.has_more || !res.next_cursor) break
    startCursor = res.next_cursor
  }

  return { results }
}

async function queryDataSource(dataSourceId, filter, sorts = [], page_size = 50) {
  const id = fmtId(dataSourceId)
  const body = { page_size, sorts }
  if (filter && Object.keys(filter).length) body.filter = filter
  return notionPost(`/data_sources/${id}/query`, body, "2025-09-03")
}

async function createInDB(dbId, properties) {
  return notionPost(`/pages`, {
    parent: { database_id: fmtId(dbId) },
    properties
  }, "2022-06-28")
}

async function updatePage(pageId, properties) {
  return notionPatch(`/pages/${fmtId(pageId)}`, { properties }, "2022-06-28")
}

function richTextToPlain(value) {
  return value?.rich_text?.[0]?.plain_text || ""
}

function extractUuidLike(value = "") {
  const match = String(value || "").match(/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i)
  return match ? fmtId(match[0]) : ""
}

function propertyToPlainText(prop = null) {
  if (!prop) return ""
  if (prop.url) return String(prop.url || "").trim()
  if (prop.email) return String(prop.email || "").trim()
  if (prop.phone_number) return String(prop.phone_number || "").trim()
  if (prop.select?.name) return String(prop.select.name || "").trim()
  if (prop.status?.name) return String(prop.status.name || "").trim()
  if (prop.title?.[0]?.plain_text) return String(prop.title[0].plain_text || "").trim()
  if (prop.rich_text?.[0]?.plain_text) return String(prop.rich_text[0].plain_text || "").trim()
  return ""
}

function resolvePageTitle(props = {}) {
  for (const prop of Object.values(props || {})) {
    if (prop?.type === "title" && Array.isArray(prop.title)) {
      const text = prop.title.map((item) => item?.plain_text || "").join("").trim()
      if (text) return text
    }
  }
  return ""
}

function resolveSubjectDataSourceId(props = {}) {
  const directCandidates = [
    props["data source ID"],
    props["Data Source ID"],
    props["data_source_id"],
    props["Data source ID"],
    props["data source id"],
    props["Data Source"],
    props["data source"],
    props["Collection ID"],
    props["collection id"],
    props["Collection"],
  ]
  for (const prop of directCandidates) {
    const text = propertyToPlainText(prop)
    const uuid = extractUuidLike(text)
    if (uuid) return uuid
  }

  for (const [key, prop] of Object.entries(props || {})) {
    const lower = String(key || "").toLowerCase()
    if (!lower.includes("data source") && !lower.includes("collection")) continue
    const text = propertyToPlainText(prop)
    const uuid = extractUuidLike(text)
    if (uuid) return uuid
  }
  return ""
}

function richTextProp(content = "") {
  const text = String(content || "")
  if (!text) return { rich_text: [] }
  return { rich_text: [{ text: { content: text.slice(0, 1900) } }] }
}

function urlProp(content = "") {
  const text = String(content || "").trim()
  return { url: text || null }
}

function plainText(content = "", maxLen = 1800) {
  return String(content || "").replace(/\s+/g, " ").trim().slice(0, maxLen)
}

function richTextArray(content = "", maxLen = 1800) {
  const text = plainText(content, maxLen)
  return text ? [{ type: "text", text: { content: text } }] : []
}

function paragraphBlock(content = "") {
  return {
    type: "paragraph",
    paragraph: {
      rich_text: richTextArray(content),
    },
  }
}

function bulletedListBlock(content = "") {
  return {
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: richTextArray(content),
    },
  }
}

function headingBlock(level = 2, content = "") {
  const key = level === 3 ? "heading_3" : "heading_2"
  return {
    type: key,
    [key]: {
      rich_text: richTextArray(content),
    },
  }
}

function calloutBlock(content = "") {
  return {
    type: "callout",
    callout: {
      rich_text: richTextArray(content),
      icon: { emoji: "📝" },
      color: "gray_background",
    },
  }
}

function linkText(text = "", url = "") {
  const label = plainText(text, 300)
  const href = String(url || "").trim()
  if (!label) return []
  if (!href) return [{ type: "text", text: { content: label } }]
  return [{ type: "text", text: { content: label, link: { url: href } } }]
}

function linkParagraphBlock(text = "", url = "") {
  return {
    type: "paragraph",
    paragraph: {
      rich_text: linkText(text, url),
    },
  }
}

function toggleBlock(title = "", children = []) {
  return {
    type: "toggle",
    toggle: {
      rich_text: richTextArray(title),
      color: "default",
      children,
    },
  }
}

function parseJsonText(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function parseJsonRichText(prop, fallback) {
  return parseJsonText(richTextToPlain(prop), fallback)
}

function normalizeSloIdList(list = []) {
  return [...new Set((Array.isArray(list) ? list : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean))]
}

function normalizeWeightedSloList(list = []) {
  return (Array.isArray(list) ? list : [])
    .map((item) => {
      const slo_id = String(item?.slo_id || item?.id || "").trim()
      const weight = Number(item?.weight ?? 0)
      if (!slo_id || !Number.isFinite(weight) || weight <= 0) return null
      return {
        slo_id,
        weight: Math.max(0, Math.min(1, weight)),
      }
    })
    .filter(Boolean)
}

function richTextJsonProp(value, fallback = []) {
  return richTextProp(JSON.stringify(value == null ? fallback : value))
}

function uniqueLoCodesFromSlos(primarySlo = "", alignedSlos = []) {
  return [...new Set([
    getLoForSlo(primarySlo),
    ...normalizeSloIdList(alignedSlos).map((sloId) => getLoForSlo(sloId)),
  ].filter(Boolean))]
}

function joinDerivedLoCodes(primarySlo = "", alignedSlos = []) {
  return uniqueLoCodesFromSlos(primarySlo, alignedSlos).join(", ")
}

function reinforcementTargetsFromSloWeights(reinforcementSlos = []) {
  return deriveReinforcementLos(normalizeWeightedSloList(reinforcementSlos)).map((item) => ({
    code: item.lo_code,
    weight: item.weight,
  }))
}

export function isExitCompletedStatus(status) {
  return status === "Done" || status === "To be reviewed"
}

export function isExitApprovedStatus(status) {
  return status === "Approved for Exit" || isExitCompletedStatus(status)
}

export async function getPageBlocks(pageId) {
  return notionGet(`/blocks/${fmtId(pageId)}/children`, "2022-06-28")
}

async function fetchBlockChildren(blockId) {
  const data = await notionGet(`/blocks/${fmtId(blockId)}/children`, "2022-06-28")
  return data.results || []
}

async function appendBlocksToPage(pageId, blocks) {
  return notionPatch(`/blocks/${fmtId(pageId)}/children`, { children: blocks }, "2022-06-28")
}

export async function appendQuestionImageReference(pageId, { qhash = "", imageUrl = "", sourceLabel = "" } = {}) {
  const cleanQhash = String(qhash || "").trim()
  const cleanImageUrl = String(imageUrl || "").trim()
  if (!pageId || !cleanQhash || !cleanImageUrl) return null
  const existing = await getPageBlocks(pageId)
  const blocks = existing.results || []
  const markerPrefix = `QIMAGE | QHASH: ${cleanQhash} | URL: ${cleanImageUrl}`
  for (const block of blocks) {
    const text = getTextBlockContent(block).trim()
    if (text === markerPrefix || text.startsWith(`${markerPrefix} |`)) {
      return null
    }
  }
  const line = sourceLabel
    ? `${markerPrefix} | SOURCE: ${plainText(sourceLabel, 300)}`
    : markerPrefix
  return appendBlocksToPage(pageId, [paragraphBlock(line)])
}

function buildAttemptReadableBlocks({ kind = "Attempt", questionPayload = [], resultPayload = null } = {}) {
  const updated = Array.isArray(resultPayload?.updatedScores) ? resultPayload.updatedScores : []
  const score = Number(resultPayload?.score || 0)
  const total = Number(resultPayload?.total || questionPayload.length || updated.length || 0)
  const submittedAt = resultPayload?.submittedAt
  const blocks = [
    headingBlock(2, `${kind} Summary`),
    calloutBlock(`${score}/${total} correct${submittedAt ? ` · submitted ${submittedAt}` : ""}`),
  ]

  if (resultPayload?.swap?.triggered) {
    blocks.push(calloutBlock("FIFO swap triggered for the next session."))
    const swappedIn = (resultPayload?.swap?.swappedIn || []).map((item) => item?.title).filter(Boolean)
    const swappedOut = (resultPayload?.swap?.swappedOut || []).map((item) => item?.title).filter(Boolean)
    if (swappedIn.length) blocks.push(bulletedListBlock(`Swapped in: ${swappedIn.join(", ")}`))
    if (swappedOut.length) blocks.push(bulletedListBlock(`Swapped out: ${swappedOut.join(", ")}`))
  }

  blocks.push(headingBlock(3, "Question Review"))
  questionPayload.forEach((item, index) => {
    const update = updated[index] || {}
    const questionTitle = item?.questionTypeTitle || item?.topic || `Question ${index + 1}`
    const correct = typeof update?.correct === "boolean" ? update.correct : null
    const selectedIndex = Number.isInteger(update?.selectedIndex) ? update.selectedIndex : null
    const optionLetter = Number.isInteger(selectedIndex) ? ["A", "B", "C", "D"][selectedIndex] || String(selectedIndex + 1) : ""
    const selectedText = Number.isInteger(selectedIndex) ? item?.options?.[selectedIndex] || "" : ""
    const answerText = Number.isInteger(item?.correctIndex) ? item?.options?.[item.correctIndex] || "" : ""
    const metaParts = []
    if (correct === true) metaParts.push("Correct")
    if (correct === false) metaParts.push("Wrong")
    if (update?.weaknessScore != null) metaParts.push(`Weakness ${Number(update.weaknessScore).toFixed(2)}`)
    if (update?.masteryScore != null) metaParts.push(`Mastery ${Number(update.masteryScore).toFixed(2)}`)
    const children = [
      paragraphBlock(item?.question || ""),
    ]
    if (Array.isArray(item?.options) && item.options.length) {
      item.options.forEach((opt, optIndex) => {
        const prefix = ["A", "B", "C", "D"][optIndex] || String(optIndex + 1)
        const marker = optIndex === item.correctIndex ? " [answer]" : selectedIndex === optIndex ? " [selected]" : ""
        children.push(bulletedListBlock(`${prefix}. ${plainText(opt, 1200)}${marker}`))
      })
    }
    if (selectedText) children.push(paragraphBlock(`Selected: ${optionLetter}. ${selectedText}`))
    if (answerText) children.push(paragraphBlock(`Correct answer: ${answerText}`))
    if (item?.explanation) children.push(paragraphBlock(`Explanation: ${item.explanation}`))
    if (metaParts.length) children.push(paragraphBlock(metaParts.join(" · ")))
    blocks.push(toggleBlock(`${index + 1}. ${questionTitle}${metaParts.length ? ` · ${metaParts.join(" · ")}` : ""}`, children))
  })
  return blocks
}

// ─────────────────────────────────────────────
//  LO TABLE (new canonical format)
//  Table block: Code | Name | Role | Weight
//  Role is "primary" (Weight blank) or "reinforcement" (Weight 0–1)
// ─────────────────────────────────────────────

export function parseLoTableRows(rowBlocks) {
  // rowBlocks[0] is the header row — skip it
  const dataRows = (rowBlocks || []).filter(b => b.type === "table_row").slice(1)
  let primaryLo = ""
  const reinforcement = []
  for (const row of dataRows) {
    const cells = row.table_row?.cells || []
    const code = (cells[0] || []).map(t => t.plain_text).join("").trim()
    const role = (cells[2] || []).map(t => t.plain_text).join("").trim()
    const weightStr = (cells[3] || []).map(t => t.plain_text).join("").trim()
    if (!code) continue
    if (role === "primary") {
      primaryLo = code
    } else if (role === "reinforcement") {
      const weight = parseFloat(weightStr) || 0
      if (weight > 0) reinforcement.push({ code, weight })
    }
  }
  if (!primaryLo && !reinforcement.length) return null
  return { primaryLo, reinforcementTargets: reinforcement }
}

export function buildLoTableBlock(primaryLo, reinforcement, getLoName = () => "") {
  const rows = []
  // Header
  rows.push({
    type: "table_row",
    table_row: {
      cells: [
        [{ type: "text", text: { content: "Code" } }],
        [{ type: "text", text: { content: "Name" } }],
        [{ type: "text", text: { content: "Role" } }],
        [{ type: "text", text: { content: "Weight" } }],
      ],
    },
  })
  if (primaryLo) {
    rows.push({
      type: "table_row",
      table_row: {
        cells: [
          [{ type: "text", text: { content: String(primaryLo) } }],
          [{ type: "text", text: { content: String(getLoName(primaryLo) || "") } }],
          [{ type: "text", text: { content: "primary" } }],
          [],
        ],
      },
    })
  }
  for (const r of (reinforcement || [])) {
    if (!r?.code) continue
    rows.push({
      type: "table_row",
      table_row: {
        cells: [
          [{ type: "text", text: { content: String(r.code) } }],
          [{ type: "text", text: { content: String(getLoName(r.code) || "") } }],
          [{ type: "text", text: { content: "reinforcement" } }],
          [{ type: "text", text: { content: String(r.weight ?? "") } }],
        ],
      },
    })
  }
  return {
    type: "table",
    table: {
      table_width: 4,
      has_column_header: true,
      has_row_header: false,
      children: rows,
    },
  }
}

// Pre-fetch all table block children on a page and return a map: blockId -> loData
async function preResolveLoTables(blocks) {
  const tableBlocks = (blocks || []).filter(b => b.type === "table")
  const map = {}
  await Promise.all(
    tableBlocks.map(async (block) => {
      const rows = await fetchBlockChildren(block.id)
      const parsed = parseLoTableRows(rows)
      if (parsed) map[block.id] = parsed
    })
  )
  return map
}

// Enhanced line pusher: emits synthetic E: JSON line when a table block is an LO table
function pushLineFromBlockWithLoMap(block, target, loTableMap) {
  if (block.type === "table") {
    const loData = loTableMap?.[block.id]
    if (loData) {
      target.push(
        `E: ${JSON.stringify({
          primary_lo: loData.primaryLo,
          reinforcement: (loData.reinforcementTargets || []).map(t => ({
            code: t.code,
            weight: t.weight,
          })),
        })}`
      )
    }
    return
  }
  pushLineFromBlock(block, target)
}

// Returns YYYY-MM-DD in the given IANA timezone (e.g. "America/New_York").
// Falls back to UTC if the timezone is invalid or missing.
export function getTodayInTimezone(tz) {
  const timezone = tz || "UTC"
  try {
    // Intl.DateTimeFormat gives us the correct wall-clock date in any timezone
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date())
    const get = type => parts.find(p => p.type === type)?.value || ""
    return `${get("year")}-${get("month")}-${get("day")}`
  } catch {
    // Fallback: UTC date
    const now = new Date()
    const pad = n => String(n).padStart(2, "0")
    return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`
  }
}

// ─────────────────────────────────────────────
//  QUESTION PAGE CONTENT
// ─────────────────────────────────────────────

export async function getAllQuestionBlocks(pageId) {
  const data = await getPageBlocks(pageId)
  const blocks = data.results || []
  const usable = []
  for (const block of blocks) {
    if (block.type === "image") {
      const url = block.image?.file?.url || block.image?.external?.url
      if (url) usable.push({ type: "image", url, blockId: block.id })
    } else if (["paragraph", "numbered_list_item", "bulleted_list_item"].includes(block.type)) {
      const text = block[block.type]?.rich_text?.map(t => t.plain_text).join("") || ""
      if (text.trim()) usable.push({ type: "text", text, blockId: block.id })
    }
  }
  return usable
}

function getTextBlockContent(block) {
  if (!block?.type) return ""
  if (!["paragraph", "numbered_list_item", "bulleted_list_item"].includes(block.type)) return ""
  return block[block.type]?.rich_text?.map((t) => t.plain_text).join("") || ""
}

function pushLineFromBlock(block, target) {
  if (!target) return
  const text = getTextBlockContent(block)
  if (text.trim()) {
    target.push(text)
    return
  }
  if (block.type === "image") {
    const url = block.image?.file?.url || block.image?.external?.url
    if (url) target.push(`[IMAGE:${url}]`)
  }
}

// ─────────────────────────────────────────────
//  Read question page, split by context sections,
//  return Q/A pairs matching the student's context.
//  Context header format (callout block):
//    "📌 Country: USA   |   State/Region: South Carolina   |   LO: PC.FTF.3 — ..."
// ─────────────────────────────────────────────

function isNationalCurriculumSubject(subjectName = "") {
  const subjectLower = String(subjectName || "").toLowerCase()
  return (
    subjectLower.includes("ap ") ||
    subjectLower.includes("sat") ||
    subjectLower.includes("act") ||
    subjectLower.includes("igcse") ||
    subjectLower.includes("cambridge") ||
    subjectLower.includes("as level") ||
    subjectLower.includes("a level") ||
    subjectLower.includes("9709") ||
    subjectLower.includes("ib ") ||
    subjectLower.includes("grade 5-8 maths revision") ||
    subjectLower.includes("grades 5-8 maths revision") ||
    subjectLower.includes("ks3") ||
    subjectLower.includes("levels 5-8")
  )
}

function normalizeCountryToken(value = "") {
  return String(value || "").toLowerCase().trim()
}

function isUsCountry(value = "") {
  const norm = normalizeCountryToken(value)
  return norm === "usa" || norm === "us" || norm === "united states" || norm === "united states of america"
}

function isInternationalCatchAll(value = "") {
  return normalizeCountryToken(value) === "international"
}

function countryMatchesContext(studentCountry = "", sectionCountry = "") {
  const studentNorm = normalizeCountryToken(studentCountry)
  const sectionNorm = normalizeCountryToken(sectionCountry)
  if (!studentNorm || !sectionNorm) return !studentNorm || !sectionNorm
  if (studentNorm === sectionNorm) return true
  if (isUsCountry(studentNorm) && isUsCountry(sectionNorm)) return true
  // "International" pages are the broad bucket for non-US students.
  if (isInternationalCatchAll(sectionNorm) && !isUsCountry(studentNorm)) return true
  return false
}

export async function getQuestionsForStudentContext(pageId, country, state, loCode, subjectName = "") {
  const data = await getPageBlocks(pageId)
  const blocks = data.results || []

  // Pre-resolve LO table blocks (new canonical format) in parallel
  const loTableMap = await preResolveLoTables(blocks)

  // Normalise for comparison
  const normCountry = (country || "").toLowerCase().trim()
  const normState   = (state   || "").toLowerCase().trim().replace(/\s+/g, "_").replace(/_/g, " ")
  const normLo      = (loCode  || "").toLowerCase().trim()

  const cacheMap = buildMcqCacheMap(blocks, { normCountry, normState, normLo })

  // Split blocks into sections — each section starts with a callout header, ends before next divider or next callout
  // A "section" = { header: string, blocks: [...paragraph/image blocks] }
  const sections = []
  let currentSection = null
  let leadingQas = []

  for (const block of blocks) {
    if (block.type === "callout") {
      const text = block.callout?.rich_text?.map(t => t.plain_text).join("") || ""
      // Our context headers always contain "Country:"
      if (text.includes("Country:")) {
        currentSection = { header: text, qas: leadingQas }
        sections.push(currentSection)
        leadingQas = []
        continue
      }
    }
    if (block.type === "divider") {
      currentSection = null
      if (!sections.length) leadingQas = []
      continue
    }
    const target = currentSection || (!sections.length ? { qas: leadingQas } : null)
    if (!target) continue
    if (currentSection) {
      pushLineFromBlockWithLoMap(block, currentSection.qas, loTableMap)
    } else {
      pushLineFromBlockWithLoMap(block, leadingQas, loTableMap)
    }
  }

  console.log(`[getQuestionsForStudentContext] page ${pageId}: ${sections.length} sections found`)

  // Find sections matching this student's context
  function sectionMatchState(header) {
    const h = header.toLowerCase()
    const nationalCurriculum = isNationalCurriculumSubject(subjectName)
    const countryHeaderMatch = h.match(/country:\s*([^|]+)/i)
    const sectionCountry = countryHeaderMatch?.[1]?.trim() || ""
    const countryMatch = !normCountry || !sectionCountry || countryMatchesContext(normCountry, sectionCountry)
    // State match
    const stateMatch = nationalCurriculum ? true : (!normState || h.includes(normState))
    const loMatch = !normLo || h.includes(normLo)
    return {
      countryMatch,
      stateMatch,
      loMatch,
      baseMatch: countryMatch && stateMatch,
      exactMatch: countryMatch && stateMatch && loMatch,
    }
  }

  const exactMatched = sections.filter((s) => sectionMatchState(s.header).exactMatch)
  const baseMatched = sections.filter((s) => sectionMatchState(s.header).baseMatch)
  const matched = exactMatched.length ? exactMatched : baseMatched
  console.log(
    `[getQuestionsForStudentContext] matched ${matched.length} sections ` +
    `(exact=${exactMatched.length}, base=${baseMatched.length}) for country=${country} state=${state} lo=${loCode}`
  )

  // Fall back: if nothing matched (e.g. old pages with no headers), return all blocks as one pool
  if (!matched.length && sections.length === 0) {
    // Legacy page — parse entire block list as Q/A pairs
    const allText = []
    for (const block of blocks) {
      pushLineFromBlockWithLoMap(block, allText, loTableMap)
    }
    return parseQAPairs(allText, cacheMap)
  }

  // Collect all Q/A pairs from matched sections
  const pool = []
  for (const sec of matched) {
    pool.push(...parseQAPairs(sec.qas, cacheMap))
  }
  return pool
}

export async function getAllQuestionsForPage(pageId) {
  const data = await getPageBlocks(pageId)
  const blocks = data.results || []

  // Pre-resolve LO table blocks (new canonical format) in parallel
  const loTableMap = await preResolveLoTables(blocks)

  const sections = []
  let currentSection = null
  let leadingQas = []

  for (const block of blocks) {
    if (block.type === "callout") {
      const text = block.callout?.rich_text?.map(t => t.plain_text).join("") || ""
      if (text.includes("Country:")) {
        currentSection = { header: text, qas: leadingQas }
        sections.push(currentSection)
        leadingQas = []
        continue
      }
    }
    if (block.type === "divider") {
      currentSection = null
      if (!sections.length) leadingQas = []
      continue
    }
    const target = currentSection || (!sections.length ? { qas: leadingQas } : null)
    if (!target) continue
    if (currentSection) {
      pushLineFromBlockWithLoMap(block, currentSection.qas, loTableMap)
    } else {
      pushLineFromBlockWithLoMap(block, leadingQas, loTableMap)
    }
  }

  // Legacy page with no context sections.
  if (!sections.length) {
    const allText = []
    for (const block of blocks) {
      pushLineFromBlockWithLoMap(block, allText, loTableMap)
    }
    return parseQAPairs(allText)
  }

  const seen = new Set()
  const aggregated = []
  for (const sec of sections) {
    const pairs = parseQAPairs(sec.qas)
    for (const pair of pairs) {
      const key = pair.qhash || pair.question.replace(/\s+/g, " ").trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      aggregated.push({
        ...pair,
        contextHeader: sec.header || "",
      })
    }
  }
  return aggregated
}

// Parse raw text lines into Q/A objects
// Lines starting with "Q:" are questions, "A:" are answers
// Lines may be prefixed with <!--qhash:xxxx--> from the import dedup system — strip it first
function parseQAPairs(lines, cacheMap = {}) {
  const pairs = []
  let current = null
  let pendingHash = null
  let pendingImageUrl = ""
  const explicitImageMap = {}
  for (const rawLine of lines) {
    if (rawLine.trim().startsWith("MCQ_CACHE |") || rawLine.trim().startsWith("MCQ_CACHE_BUNDLE |")) continue
    const explicitImageMatch = rawLine.match(/^QIMAGE \| QHASH:\s*([a-f0-9_-]+)\s*\| URL:\s*(.+?)(?:\s*\| SOURCE:.*)?$/i)
    if (explicitImageMatch) {
      const explicitQhash = String(explicitImageMatch[1] || "").trim()
      const explicitUrl = String(explicitImageMatch[2] || "").trim()
      if (explicitQhash && explicitUrl) explicitImageMap[explicitQhash] = explicitUrl
      continue
    }
    const hashMatch = rawLine.match(/<!--qhash:([a-f0-9]+)-->/i)
    if (hashMatch) pendingHash = hashMatch[1]
    const line = rawLine.replace(/^<!--qhash:[^>]*-->\s*/, "").trim()
    const imageMatch = line.match(/^\[IMAGE:(.+)\]$/i)
    if (imageMatch) {
      const img = imageMatch[1]?.trim() || ""
      if (current && !current.imageUrl) current.imageUrl = img
      else if (img) pendingImageUrl = img
      continue
    }
    if (line.startsWith("Q:")) {
      if (current) pairs.push(current)
      current = {
        question: line.slice(2).trim(),
        answer: "",
        qhash: pendingHash || null,
        imageUrl: pendingImageUrl || "",
        primaryLo: "",
        reinforcementTargets: [],
      }
      pendingImageUrl = ""
      pendingHash = null
    } else if (line.startsWith("A:") && current) {
      current.answer = line.slice(2).trim()
    } else if (current && parseExplanationLine(line)) {
      const explanation = parseExplanationLine(line)
      current.primaryLo = explanation.primaryLo || current.primaryLo || ""
      current.reinforcementTargets = explanation.reinforcementTargets || []
    } else if (current && !current.answer) {
      // continuation of question text (e.g. options on separate lines)
      current.question += "\n" + line
    } else if (current) {
      current.answer += (current.answer ? "\n" : "") + line
    }
  }
  if (current) pairs.push(current)
  return pairs
    .filter(p => p.question)
    .map((p) => {
      const imageUrl = (p.qhash && explicitImageMap[p.qhash]) ? explicitImageMap[p.qhash] : p.imageUrl
      return (p.qhash && cacheMap[p.qhash])
        ? { ...p, imageUrl, mcq: cacheMap[p.qhash] }
        : { ...p, imageUrl }
    })
}

function hashMcqBundle(items = []) {
  const src = JSON.stringify(items)
  let h = 5381
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h) ^ src.charCodeAt(i)
  return `bundle_${(h >>> 0).toString(16)}`
}

function buildMcqCacheMap(blocks, { normCountry, normState, normLo }) {
  const cache = {}
  const cachePriority = {}
  for (const block of blocks) {
    if (block.type !== "paragraph") continue
    const text = block.paragraph?.rich_text?.map(t => t.plain_text).join("") || ""
    if (!text.startsWith("MCQ_CACHE |") && !text.startsWith("MCQ_CACHE_BUNDLE |")) continue
    const parsed = parseMcqCacheLine(text)
    if (!parsed) continue

    const c = (parsed.country || "").toLowerCase().trim()
    const s = (parsed.state || "").toLowerCase().trim().replace(/\s+/g, "_").replace(/_/g, " ")
    const l = (parsed.lo || "").toLowerCase().trim()

    const countryMatch = !normCountry || !c || countryMatchesContext(normCountry, c)
    const stateMatch = !normState || !s || s === normState
    const loMatch = !normLo || l === normLo
    const baseMatch = countryMatch && stateMatch

    if (!baseMatch) continue
    const priority = loMatch ? 2 : 1

    if (Array.isArray(parsed.items)) {
      for (const item of parsed.items) {
        if (!item?.qhash || !item?.mcq) continue
        if ((cachePriority[item.qhash] || 0) <= priority) {
          cache[item.qhash] = item.mcq
          cachePriority[item.qhash] = priority
        }
      }
      continue
    }

    if (parsed.qhash && parsed.mcq) {
      if ((cachePriority[parsed.qhash] || 0) <= priority) {
        cache[parsed.qhash] = parsed.mcq
        cachePriority[parsed.qhash] = priority
      }
    }
  }
  return cache
}

function parseMcqCacheLine(text) {
  // Formats:
  // MCQ_CACHE | Country: X | State: Y | LO: Z | QHASH: abc | JSON: {...}
  // MCQ_CACHE_BUNDLE | Country: X | State: Y | LO: Z | MCQHASH: xyz | JSON: [{"qhash":"...","options":[...],...}]
  try {
    const parts = text.split(" | ").map(p => p.trim())
    const prefix = parts[0] || ""
    const getVal = (label) => {
      const part = parts.find(p => p.toLowerCase().startsWith(label.toLowerCase() + ":"))
      return part ? part.split(":").slice(1).join(":").trim() : ""
    }
    const jsonStr = getVal("JSON")
    const parsedJson = jsonStr ? JSON.parse(jsonStr) : null
    if (prefix === "MCQ_CACHE_BUNDLE") {
      const items = Array.isArray(parsedJson)
        ? parsedJson
            .filter((item) => item && item.qhash && Array.isArray(item.options))
            .map((item) => ({
              qhash: item.qhash,
              mcq: {
                question: item.question || "",
                options: item.options || [],
                correctIndex: Number.isInteger(item.correctIndex) ? item.correctIndex : null,
                explanation: item.explanation || "",
                topic: item.topic || "",
              },
            }))
        : []
      return {
        country: getVal("Country"),
        state: getVal("State"),
        lo: getVal("LO"),
        mcqhash: getVal("MCQHASH"),
        items,
      }
    }
    const mcq = parsedJson
    return {
      country: getVal("Country"),
      state: getVal("State"),
      lo: getVal("LO"),
      qhash: getVal("QHASH"),
      mcq,
    }
  } catch {
    return null
  }
}

export async function appendMcqCacheToQuestionPage(pageId, { country, state, loCode, qhash, mcq }) {
  if (!pageId || !qhash || !mcq) return null
  const cleanJson = JSON.stringify(mcq)
  const line = [
    "MCQ_CACHE",
    `Country: ${country || ""}`,
    `State: ${state || ""}`,
    `LO: ${loCode || ""}`,
    `QHASH: ${qhash}`,
    `JSON: ${cleanJson}`,
  ].join(" | ")

  // Size guard: Notion rich_text content has length limits.
  // Skip caching if the line is too long to store safely.
  const MAX_LEN = 1800
  if (line.length > MAX_LEN) {
    console.warn("[mcq-cache] Skipping cache write; line too long:", line.length)
    return null
  }

  // Cleanup: avoid duplicate cache entries for same context + qhash.
  const existing = await getPageBlocks(pageId)
  const blocks = existing.results || []
  const normCountry = (country || "").toLowerCase().trim()
  const normState = (state || "").toLowerCase().trim().replace(/\s+/g, "_").replace(/_/g, " ")
  const normLo = (loCode || "").toLowerCase().trim()

  for (const block of blocks) {
    if (block.type !== "paragraph") continue
    const text = block.paragraph?.rich_text?.map(t => t.plain_text).join("") || ""
    if (!text.startsWith("MCQ_CACHE |")) continue
    const parsed = parseMcqCacheLine(text)
    if (!parsed) continue
    const c = (parsed.country || "").toLowerCase().trim()
    const s = (parsed.state || "").toLowerCase().trim().replace(/\s+/g, "_").replace(/_/g, " ")
    const l = (parsed.lo || "").toLowerCase().trim()
    if (parsed.qhash === qhash && c === normCountry && s === normState && l === normLo) {
      return null
    }
  }

  const block = {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: line } }],
    },
  }
  return appendBlocksToPage(pageId, [block])
}

export async function appendMcqCacheBundleToQuestionPage(pageId, { country, state, loCode, items }) {
  const normalizedItems = (items || [])
    .filter((item) => item?.qhash && item?.mcq && Array.isArray(item.mcq?.options))
    .map((item) => ({
      qhash: item.qhash,
      question: item.mcq.question || "",
      options: item.mcq.options || [],
      correctIndex: Number.isInteger(item.mcq.correctIndex) ? item.mcq.correctIndex : null,
      explanation: item.mcq.explanation || "",
      topic: item.mcq.topic || "",
    }))

  if (!pageId || !normalizedItems.length) return null

  const mcqhash = hashMcqBundle(normalizedItems)
  const cleanJson = JSON.stringify(normalizedItems)
  const line = [
    "MCQ_CACHE_BUNDLE",
    `Country: ${country || ""}`,
    `State: ${state || ""}`,
    `LO: ${loCode || ""}`,
    `MCQHASH: ${mcqhash}`,
    `JSON: ${cleanJson}`,
  ].join(" | ")

  const MAX_LEN = 1800
  if (line.length > MAX_LEN) {
    return null
  }

  const existing = await getPageBlocks(pageId)
  const blocks = existing.results || []
  const normCountry = (country || "").toLowerCase().trim()
  const normState = (state || "").toLowerCase().trim().replace(/\s+/g, "_").replace(/_/g, " ")
  const normLo = (loCode || "").toLowerCase().trim()
  const normalizedHashes = new Set(normalizedItems.map((item) => item.qhash))

  for (const block of blocks) {
    if (block.type !== "paragraph") continue
    const text = block.paragraph?.rich_text?.map(t => t.plain_text).join("") || ""
    if (!text.startsWith("MCQ_CACHE_BUNDLE |")) continue
    const parsed = parseMcqCacheLine(text)
    if (!parsed) continue
    const c = (parsed.country || "").toLowerCase().trim()
    const s = (parsed.state || "").toLowerCase().trim().replace(/\s+/g, "_").replace(/_/g, " ")
    const l = (parsed.lo || "").toLowerCase().trim()
    if (c !== normCountry || s !== normState || l !== normLo) continue
    const existingHashes = new Set((parsed.items || []).map((item) => item.qhash))
    const alreadyCovered = [...normalizedHashes].every((qhash) => existingHashes.has(qhash))
    if (alreadyCovered) return null
  }

  const block = {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: line } }],
    },
  }
  return appendBlocksToPage(pageId, [block])
}

// ─────────────────────────────────────────────
//  STUDENTS
// ─────────────────────────────────────────────

export async function getAllStudents() {
  const res = await queryDB(STUDENTS_DB, {})
  return res.results?.map(parseStudent) || []
}

export async function getStudentByEmail(email) {
  const norm = String(email || "").trim().toLowerCase()
  if (!norm) return null

  // Fast path: exact match (common case)
  try {
    const res = await queryDB(STUDENTS_DB, {
      property: "email",
      rich_text: { equals: email }
    })
    if (res.results?.length) return parseStudent(res.results[0])
  } catch (e) {
    console.warn("[getStudentByEmail] exact query failed:", e.message)
  }

  // Robust fallback: Notion rich_text filters are case-sensitive.
  // For small cohorts this is acceptable and prevents sign-in failures
  // due to casing differences or parent-email matching.
  try {
    const all = await getAllStudents()
    const match = all.find((s) => {
      if (String(s.email || "").trim().toLowerCase() === norm) return true
      const parentEmails = parseEmailList(s.parentEmailsRaw || "")
      return parentEmails.includes(norm)
    })
    return match || null
  } catch (e) {
    console.warn("[getStudentByEmail] fallback scan failed:", e.message)
    return null
  }
}

export async function getStudentById(id) {
  const page = await notionGet(`/pages/${fmtId(id)}`)
  return parseStudent(page)
}

const TZ_MAP = {
  "ist": "Asia/Kolkata",
  "pst": "America/Los_Angeles",
  "pdt": "America/Los_Angeles",
  "est": "America/New_York",
  "edt": "America/New_York",
  "cst": "America/Chicago",
  "mst": "America/Denver",
  "gmt": "Europe/London",
  "utc": "UTC",
}

function normalizeTimezone(tz) {
  if (!tz) return "Asia/Kolkata"
  // Already a valid IANA timezone (contains /)
  if (tz.includes("/")) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date())
      return tz
    } catch {
      return "Asia/Kolkata"
    }
  }
  return TZ_MAP[String(tz).toLowerCase().trim()] || "Asia/Kolkata"
}

function parseStudent(page) {
  const parentEmailsRaw =
    page.properties["parent email"]?.rich_text?.[0]?.plain_text ||
    page.properties["parent emails"]?.rich_text?.[0]?.plain_text ||
    page.properties["Parent Email"]?.rich_text?.[0]?.plain_text ||
    page.properties["Parent Emails"]?.rich_text?.[0]?.plain_text ||
    ""
  const state = (page.properties["state"]?.select?.name || page.properties["state"]?.rich_text?.[0]?.plain_text || "")?.toLowerCase().trim().replace(/\s+/g, "_") || null
  // Infer country from state field or explicit country field
  const countryRaw = page.properties["country"]?.select?.name || page.properties["country"]?.rich_text?.[0]?.plain_text || ""
  let country = countryRaw.trim() || null
  if (!country && state) {
    const usStates = ["south_carolina","georgia","california","texas","florida","new_york","north_carolina","virginia","ohio","michigan"]
    country = usStates.some(s => state === s || state.includes(s.replace("_"," "))) ? "USA" : "International"
  }
  const timezoneRaw =
    page.properties["time zone"]?.select?.name ||
    page.properties["time zone"]?.rich_text?.[0]?.plain_text ||
    page.properties["Time zone"]?.select?.name ||
    page.properties["Time zone"]?.rich_text?.[0]?.plain_text ||
    page.properties["Timezone"]?.select?.name ||
    page.properties["Timezone"]?.rich_text?.[0]?.plain_text ||
    page.properties["time_zone"]?.select?.name ||
    page.properties["time_zone"]?.rich_text?.[0]?.plain_text ||
    ""
  return {
    id: page.id,
    name: page.properties.Name?.title?.[0]?.plain_text || "",
    email: page.properties.email?.rich_text?.[0]?.plain_text || "",
    subjectIds: page.properties.Subject?.relation?.map(r => r.id) || [],
    timezone: normalizeTimezone(timezoneRaw),
    examDate: page.properties["Exam date"]?.date?.start || null,
    state,
    country,
    parentEmailsRaw,
  }
}

function parseEmailList(raw) {
  const src = String(raw || "")
  const matches = src.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  return matches.map((e) => e.trim().toLowerCase())
}

// ─────────────────────────────────────────────
//  SUBJECTS
// ─────────────────────────────────────────────

export async function getAllSubjects() {
  const res = await queryDB(SUBJECTS_DB, {})
  return res.results?.map(parseSubject) || []
}

export async function getSubjectById(id) {
  const page = await notionGet(`/pages/${fmtId(id)}`)
  return parseSubject(page)
}

export async function getSubjectsByIds(ids) {
  const pages = await Promise.all(ids.map(id => notionGet(`/pages/${fmtId(id)}`)))
  return pages.map(parseSubject)
}

function parseSubject(page) {
  const props = page?.properties || {}
  return {
    id: page?.id || "",
    name: props.Name?.title?.[0]?.plain_text || "",
    dataSourceId: resolveSubjectDataSourceId(props),
    examDate: props["Exam date"]?.date?.start || props["Exam Date"]?.date?.start || null,
  }
}

function parseSessionRow(page) {
  const props = page?.properties || {}
  return {
    id: page.id,
    title: props.Name?.title?.[0]?.plain_text || "",
    studentId: props.Student?.relation?.[0]?.id || "",
    subjectId: props.Subject?.relation?.[0]?.id || "",
    eventId: richTextToPlain(props["Calendar Event ID"]),
    sessionMode: props["Session Mode"]?.select?.name || "",
    studentSessionDate: props["Student Session Date"]?.date?.start || null,
    tutorSessionDate: props["Tutor Session Date"]?.date?.start || null,
    startTime: props["Start Time"]?.date?.start || null,
    endTime: props["End Time"]?.date?.start || null,
    studentTimezone: richTextToPlain(props["Student Timezone"]),
    tutorTimezone: richTextToPlain(props["Tutor Timezone"]),
    sessionNotes: richTextToPlain(props["Session Notes"]),
    preClassDone: props["Pre-Class Done"]?.checkbox || false,
    exitTicketDone: props["Exit Ticket Done"]?.checkbox || false,
    homeworkDone: props["Homework Done"]?.checkbox || false,
    latestPreClassPdfUrl: props["Latest Pre-Class PDF URL"]?.url || "",
    latestExitTicketPdfUrl: props["Latest Exit Ticket PDF URL"]?.url || "",
    latestHomeworkPdfUrl: props["Latest Homework PDF URL"]?.url || "",
    sessionReportPdfUrl: props["Session Report PDF URL"]?.url || "",
    sessionReportR2Key: richTextToPlain(props["Session Report R2 Key"]),
    reportStatus: props["Report Status"]?.select?.name || "",
    sessionLengthMinutes: props["Session Length (Min)"]?.formula?.number ?? null,
    preClassView: props["Pre-Class View"]?.formula?.string || "",
    exitTicketView: props["Exit Ticket View"]?.formula?.string || "",
    homeworkView: props["Homework View"]?.formula?.string || "",
    preClassWsChanges: richTextToPlain(props["Pre-Class WS Changes"]),
    exitTicketWsChanges: richTextToPlain(props["Exit Ticket WS Changes"]),
    homeworkWsChanges: richTextToPlain(props["Homework WS Changes"]),
    preClassMasteryChanges: richTextToPlain(props["Pre-Class Mastery Changes"]),
    exitTicketMasteryChanges: richTextToPlain(props["Exit Ticket Mastery Changes"]),
    homeworkMasteryChanges: richTextToPlain(props["Homework Mastery Changes"]),
    preClassAttemptIds: props["Pre-Class Attempts"]?.relation?.map((r) => r.id) || [],
    exitTicketAttemptIds: props["Exit Ticket Attempts"]?.relation?.map((r) => r.id) || [],
    homeworkAttemptIds: props["Homework Attempts"]?.relation?.map((r) => r.id) || [],
  }
}

export async function getSessionByStudentSubjectDate(studentId, subjectId, sessionDate) {
  if (!SESSIONS_DB || !studentId || !subjectId || !sessionDate) return null
  const target = String(sessionDate || "").trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || ""
  if (!target) return null
  const rows = await listSessionsByStudentSubject(studentId, subjectId)
  return rows.find((row) => {
    const candidate = String(row.studentSessionDate || "").trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || ""
    return candidate === target
  }) || null
}

export async function getSessionByStudentSubjectTutorDate(studentId, subjectId, tutorSessionDate) {
  if (!SESSIONS_DB || !studentId || !subjectId || !tutorSessionDate) return null
  const target = String(tutorSessionDate || "").trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || ""
  if (!target) return null
  const defaultTutorTimezone = process.env.TUTOR_TIMEZONE || "Asia/Kolkata"
  const rows = await listSessionsByStudentSubject(studentId, subjectId)
  return rows.find((row) => {
    const candidate = String(
      row.tutorSessionDate ||
      row.studentSessionDate ||
      getDateForTimestampInTimezone(row.startTime, row.tutorTimezone || defaultTutorTimezone) ||
      ""
    ).trim().match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || ""
    return candidate === target
  }) || null
}

export async function listSessionsByStudentSubject(studentId, subjectId) {
  if (!SESSIONS_DB || !studentId || !subjectId) return []
  const res = await queryDBAll(SESSIONS_DB, {
    and: [
      { property: "Student", relation: { contains: fmtId(studentId) } },
      { property: "Subject", relation: { contains: fmtId(subjectId) } },
    ]
  }, [{ property: "Student Session Date", direction: "descending" }])
  return res.results?.map(parseSessionRow) || []
}

export async function getLatestSessionByStudentSubjectOnOrBefore(studentId, subjectId, studentDate) {
  if (!studentDate) return null
  const rows = await listSessionsByStudentSubject(studentId, subjectId)
  return rows.find((row) => row.studentSessionDate && row.studentSessionDate <= String(studentDate || "")) || null
}

export async function getSessionById(sessionId) {
  if (!sessionId) return null
  const page = await notionGet(`/pages/${fmtId(sessionId)}`)
  if (page?.object === "error") return null
  return parseSessionRow(page)
}

export async function updateSessionArtifacts(sessionId, properties = {}) {
  if (!sessionId) return null
  return updatePage(sessionId, properties)
}

export async function updateSessionImportState(sessionId, {
  importStatus = "imported",
  importOverride = false,
  overrideReason = "",
  importedAt = "",
} = {}) {
  if (!sessionId) return null
  return getSessionById(sessionId)
}

export async function archiveSessionRow(sessionId) {
  if (!sessionId) return null
  return notionPatch(`/pages/${fmtId(sessionId)}`, { archived: true }, "2022-06-28")
}

export async function createSessionRow({
  studentId,
  subjectId,
  title = "",
  studentSessionDate = "",
  sessionMode = "",
  startTime = "",
  endTime = "",
  eventId = "",
  sessionSource = "calendar_exact",
  importStatus = "not_imported",
  importOverride = false,
  overrideReason = "",
  importedAt = "",
  sessionNotes = "",
} = {}) {
  if (!SESSIONS_DB || !studentId || !subjectId || !studentSessionDate) return null
  const safeTitle = String(title || `${studentId} · ${subjectId} · ${studentSessionDate}`).slice(0, 120)
  return createInDB(SESSIONS_DB, {
    Name: { title: [{ text: { content: safeTitle } }] },
    Student: { relation: [{ id: fmtId(studentId) }] },
    Subject: { relation: [{ id: fmtId(subjectId) }] },
    "Session Source": { select: { name: String(sessionSource || "calendar_exact") } },
    "Session Mode": sessionMode ? { select: { name: String(sessionMode) } } : { select: null },
    "Student Session Date": { date: { start: String(studentSessionDate || "") } },
    "Start Time": startTime ? { date: { start: String(startTime) } } : { date: null },
    "End Time": endTime ? { date: { start: String(endTime) } } : { date: null },
    "Calendar Event ID": richTextProp(eventId || ""),
    "Session Notes": richTextProp(String(sessionNotes || "").slice(0, 1900)),
  })
}

export async function getHomeworkAttemptForSession(studentId, subjectId, sessionDate) {
  if (!HOMEWORK_ATTEMPTS_DB || !sessionDate) return null
  const res = await queryDB(HOMEWORK_ATTEMPTS_DB, {
    and: [
      { property: "Student ID", rich_text: { equals: String(studentId || "") } },
      { property: "Subject ID", rich_text: { equals: String(subjectId || "") } },
      { property: "Session Date", date: { equals: String(sessionDate || "") } },
    ]
  }, [
    { property: "Unlock At", direction: "descending" },
    { property: "Expire At", direction: "descending" },
  ])
  if (!res.results?.length) return null
  return parseHomeworkAttempt(res.results[0])
}

// ─────────────────────────────────────────────
//  DRAFT DB
// ─────────────────────────────────────────────

export function hasDraftDB() {
  return !!DRAFT_DB
}

function parseDraftRow(page) {
  const props = page?.properties || {}
  const primarySlo = richTextToPlain(props["Primary SLO"])
  const alignedSlos = normalizeSloIdList(parseJsonRichText(props["Aligned SLOs"], []))
  const reinforcementSlos = normalizeWeightedSloList(parseJsonRichText(props["Reinforcement SLOs"], []))
  return {
    id: page.id,
    title: props.Name?.title?.[0]?.plain_text || "",
    studentId: props.Student?.relation?.[0]?.id || "",
    subjectId: props.Subject?.relation?.[0]?.id || "",
    sessionId: props.Session?.relation?.[0]?.id || "",
    questionPageId: richTextToPlain(props["Question Page ID"]),
    standardCode: richTextToPlain(props["Standard Code"]) || joinDerivedLoCodes(primarySlo, alignedSlos),
    primarySlo,
    alignedSlos,
    reinforcementSlos,
    unit: richTextToPlain(props.Unit),
    assignedSessionDate: props["Assigned Session Date"]?.date?.start || null,
    state: props.State?.select?.name || "",
    planSource: props["Plan Source"]?.select?.name || "",
    orderIndex: props["Order Index"]?.number ?? null,
    committed: props.Committed?.checkbox || false,
    committedAt: props["Committed At"]?.date?.start || null,
    commitSessionId: props["Commit Session"]?.relation?.[0]?.id || "",
    datesInferred: props["Dates Inferred"]?.checkbox || false,
    inferenceReason: richTextToPlain(props["Inference Reason"]),
    notes: richTextToPlain(props.Notes),
  }
}

export async function getDraftRowById(draftId) {
  if (!DRAFT_DB || !draftId) return null
  const page = await notionGet(`/pages/${fmtId(draftId)}`)
  if (page?.object !== "page") return null
  return parseDraftRow(page)
}

export async function listDraftRowsByStudentSubject(studentId, subjectId, {
  state = "",
  planSource = "",
  sessionDate = "",
  committed = null,
  limit = 100,
} = {}) {
  if (!DRAFT_DB || !studentId || !subjectId) return []
  const filters = [
    { property: "Student", relation: { contains: fmtId(studentId) } },
    { property: "Subject", relation: { contains: fmtId(subjectId) } },
  ]
  if (state) filters.push({ property: "State", select: { equals: String(state) } })
  if (planSource) filters.push({ property: "Plan Source", select: { equals: String(planSource) } })
  if (sessionDate) filters.push({ property: "Assigned Session Date", date: { equals: String(sessionDate) } })
  if (committed != null) filters.push({ property: "Committed", checkbox: { equals: !!committed } })

  const res = await queryDBAll(DRAFT_DB, { and: filters }, [
    { property: "Assigned Session Date", direction: "ascending" },
    { property: "Order Index", direction: "ascending" },
  ])
  return (res.results || []).slice(0, Math.max(1, limit)).map(parseDraftRow)
}

export async function listDraftRowsForSession(sessionId, {
  state = "",
  committed = null,
  limit = 100,
} = {}) {
  if (!DRAFT_DB || !sessionId) return []
  const filters = [{ property: "Session", relation: { contains: fmtId(sessionId) } }]
  if (state) filters.push({ property: "State", select: { equals: String(state) } })
  if (committed != null) filters.push({ property: "Committed", checkbox: { equals: !!committed } })

  const res = await queryDBAll(DRAFT_DB, { and: filters }, [
    { property: "Order Index", direction: "ascending" },
    { property: "Name", direction: "ascending" },
  ])
  return (res.results || []).slice(0, Math.max(1, limit)).map(parseDraftRow)
}

export async function listDraftRowsForDate(studentId, subjectId, sessionDate, {
  committed = null,
  limit = 100,
} = {}) {
  return listDraftRowsByStudentSubject(studentId, subjectId, {
    sessionDate,
    committed,
    limit,
  })
}

export async function getDraftRowByQuestionPage(studentId, subjectId, questionPageId) {
  if (!DRAFT_DB || !studentId || !subjectId || !questionPageId) return null
  const res = await queryDBAll(DRAFT_DB, {
    and: [
      { property: "Student", relation: { contains: fmtId(studentId) } },
      { property: "Subject", relation: { contains: fmtId(subjectId) } },
      { property: "Question Page ID", rich_text: { equals: String(questionPageId || "") } },
    ],
  }, [
    { property: "Assigned Session Date", direction: "descending" },
    { property: "Order Index", direction: "descending" },
  ])
  if (!res.results?.length) return null
  return parseDraftRow(res.results[0])
}

export async function createDraftRow({
  name = "",
  studentId = "",
  subjectId = "",
  sessionId = "",
  questionPageId = "",
  standardCode = "",
  primarySlo = "",
  alignedSlos = [],
  reinforcementSlos = [],
  unit = "",
  assignedSessionDate = "",
  state = "backlog",
  planSource = "import",
  orderIndex = null,
  committed = false,
  committedAt = "",
  commitSessionId = "",
  datesInferred = false,
  inferenceReason = "",
  notes = "",
} = {}) {
  if (!DRAFT_DB || !studentId || !subjectId) return null
  const safeTitle = String(name || standardCode || primarySlo || questionPageId || "Draft Item").slice(0, 120)
  const res = await createInDB(DRAFT_DB, {
    Name: { title: [{ text: { content: safeTitle } }] },
    Student: { relation: [{ id: fmtId(studentId) }] },
    Subject: { relation: [{ id: fmtId(subjectId) }] },
    Session: sessionId ? { relation: [{ id: fmtId(sessionId) }] } : { relation: [] },
    "Question Page ID": richTextProp(questionPageId),
    "Standard Code": richTextProp(standardCode || joinDerivedLoCodes(primarySlo, alignedSlos)),
    "Primary SLO": richTextProp(primarySlo),
    "Aligned SLOs": richTextJsonProp(normalizeSloIdList(alignedSlos)),
    "Reinforcement SLOs": richTextJsonProp(normalizeWeightedSloList(reinforcementSlos)),
    Unit: richTextProp(unit),
    "Assigned Session Date": assignedSessionDate ? { date: { start: String(assignedSessionDate) } } : { date: null },
    State: { select: { name: String(state || "backlog") } },
    "Plan Source": { select: { name: String(planSource || "import") } },
    "Order Index": { number: orderIndex == null ? null : Number(orderIndex) },
    Committed: { checkbox: !!committed },
    "Committed At": committedAt ? { date: { start: String(committedAt) } } : { date: null },
    "Commit Session": commitSessionId ? { relation: [{ id: fmtId(commitSessionId) }] } : { relation: [] },
    "Dates Inferred": { checkbox: !!datesInferred },
    "Inference Reason": richTextProp(inferenceReason),
    Notes: richTextProp(notes),
  })
  if (res?.object !== "page") return null
  return parseDraftRow(res)
}

export async function updateDraftRow(draftId, {
  name,
  studentId,
  subjectId,
  sessionId,
  questionPageId,
  standardCode,
  primarySlo,
  alignedSlos,
  reinforcementSlos,
  unit,
  assignedSessionDate,
  state,
  planSource,
  orderIndex,
  committed,
  committedAt,
  commitSessionId,
  datesInferred,
  inferenceReason,
  notes,
} = {}) {
  if (!draftId) return null
  const properties = {}
  if (name != null) properties.Name = { title: [{ text: { content: String(name || "Draft Item").slice(0, 120) } }] }
  if (studentId != null) properties.Student = studentId ? { relation: [{ id: fmtId(studentId) }] } : { relation: [] }
  if (subjectId != null) properties.Subject = subjectId ? { relation: [{ id: fmtId(subjectId) }] } : { relation: [] }
  if (sessionId != null) properties.Session = sessionId ? { relation: [{ id: fmtId(sessionId) }] } : { relation: [] }
  if (questionPageId != null) properties["Question Page ID"] = richTextProp(questionPageId)
  if (standardCode != null || primarySlo != null || alignedSlos != null) {
    const nextPrimarySlo = primarySlo != null ? primarySlo : undefined
    const nextAlignedSlos = alignedSlos != null ? normalizeSloIdList(alignedSlos) : undefined
    properties["Standard Code"] = richTextProp(
      standardCode != null
        ? standardCode
        : joinDerivedLoCodes(nextPrimarySlo || "", nextAlignedSlos || [])
    )
  }
  if (primarySlo != null) properties["Primary SLO"] = richTextProp(primarySlo)
  if (alignedSlos != null) properties["Aligned SLOs"] = richTextJsonProp(normalizeSloIdList(alignedSlos))
  if (reinforcementSlos != null) properties["Reinforcement SLOs"] = richTextJsonProp(normalizeWeightedSloList(reinforcementSlos))
  if (unit != null) properties.Unit = richTextProp(unit)
  if (assignedSessionDate != null) {
    properties["Assigned Session Date"] = assignedSessionDate ? { date: { start: String(assignedSessionDate) } } : { date: null }
  }
  if (state != null) properties.State = { select: { name: String(state || "backlog") } }
  if (planSource != null) properties["Plan Source"] = { select: { name: String(planSource || "import") } }
  if (orderIndex != null) properties["Order Index"] = { number: Number(orderIndex) }
  if (committed != null) properties.Committed = { checkbox: !!committed }
  if (committedAt != null) properties["Committed At"] = committedAt ? { date: { start: String(committedAt) } } : { date: null }
  if (commitSessionId != null) properties["Commit Session"] = commitSessionId ? { relation: [{ id: fmtId(commitSessionId) }] } : { relation: [] }
  if (datesInferred != null) properties["Dates Inferred"] = { checkbox: !!datesInferred }
  if (inferenceReason != null) properties["Inference Reason"] = richTextProp(inferenceReason)
  if (notes != null) properties.Notes = richTextProp(notes)
  return updatePage(draftId, properties)
}

export async function upsertDraftRowByQuestionPage({
  studentId = "",
  subjectId = "",
  questionPageId = "",
  ...rest
} = {}) {
  if (!studentId || !subjectId || !questionPageId) return null
  const existing = await getDraftRowByQuestionPage(studentId, subjectId, questionPageId)
  if (existing?.id) {
    await updateDraftRow(existing.id, { studentId, subjectId, questionPageId, ...rest })
    return getDraftRowById(existing.id)
  }
  return createDraftRow({ studentId, subjectId, questionPageId, ...rest })
}

// ─────────────────────────────────────────────
//  ENROLLMENTS
// ─────────────────────────────────────────────

export async function getEnrollmentsByStudent(studentId) {
  const res = await queryDB(ENROLLMENTS_DB, {
    property: "Student",
    relation: { contains: fmtId(studentId) }
  })
  return res.results?.map(parseEnrollment) || []
}

export async function getEnrollment(studentId, subjectId) {
  const res = await queryDB(ENROLLMENTS_DB, {
    and: [
      { property: "Student", relation: { contains: fmtId(studentId) } },
      { property: "Subjects", relation: { contains: fmtId(subjectId) } }
    ]
  })
  if (!res.results?.length) return null
  return parseEnrollment(res.results[0])
}

function parseEnrollment(page) {
  return {
    id: page.id,
    studentIds: page.properties.Student?.relation?.map(r => r.id) || [],
    subjectIds: page.properties.Subjects?.relation?.map(r => r.id) || [],
    classTime: page.properties["Class Time"]?.rich_text?.[0]?.plain_text || "",
    duration: page.properties.Duration?.number || 60,
    timezone: page.properties.Timezone?.rich_text?.[0]?.plain_text || "Asia/Kolkata",
    days: page.properties.Day?.multi_select?.map(d => d.name) || [],
  }
}

// ─────────────────────────────────────────────
//  QUESTIONS (subject DB — shared, no student data)
// ─────────────────────────────────────────────

export async function getAllQuestionsForSubject(dataSourceId) {
  const res = await queryDataSource(dataSourceId, {})
  return res.results?.map(parseQuestion) || []
}

function parseQuestion(page) {
  const primarySlo = page.properties["primary_slo"]?.rich_text?.[0]?.plain_text || ""
  const alignedSlos = normalizeSloIdList(parseJsonRichText(page.properties["aligned_slos"], []))
  const reinforcementSlos = normalizeWeightedSloList(parseJsonRichText(page.properties["reinforcement_slos"], []))
  const standardCode = page.properties["standard_code"]?.rich_text?.[0]?.plain_text || joinDerivedLoCodes(primarySlo, alignedSlos)
  return {
    id: page.id,
    title: page.properties["Name"]?.title?.[0]?.plain_text || "",
    standardCode,
    primarySlo,
    alignedSlos,
    reinforcementSlos,
    reinforcementTargets: reinforcementTargetsFromSloWeights(reinforcementSlos),
    unit: page.properties.unit?.multi_select?.[0]?.name || page.properties.unit?.select?.name || "",
    status: page.properties.Status?.status?.name || "",
  }
}

const DAILY_SEEN_PREFIX = "__daily_seen__:"
const DAILY_WRONG_PREFIX = "__daily_wrong__:"
const MASTERY_PREFIX = "__mastery__:"

function roundScore(value) {
  return Math.round(Number(value || 0) * 1000) / 1000
}

function normalizeDateOnly(value) {
  if (!value) return null
  const text = String(value).trim()
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function normalizeQuestionKey(value = "") {
  const text = String(value || "").trim()
  return text ? text.replace(/[:|]/g, "_") : ""
}

function parseMasteryToken(token) {
  if (typeof token !== "string" || !token.startsWith(MASTERY_PREFIX)) return null
  const payload = token.slice(MASTERY_PREFIX.length)
  const [source = "", weightRaw = "0", dateRaw = "", questionKeyRaw = ""] = payload.split(":")
  const weight = Number(weightRaw)
  const date = normalizeDateOnly(dateRaw)
  if (!source || !Number.isFinite(weight) || !date) return null
  return { source, weight, date, questionKey: normalizeQuestionKey(questionKeyRaw) }
}

function encodeMasteryToken(event) {
  const source = String(event?.source || "").trim()
  const weight = roundScore(event?.weight || 0)
  const date = normalizeDateOnly(event?.date)
  const questionKey = normalizeQuestionKey(event?.questionKey || "")
  if (!source || !date || !Number.isFinite(weight) || weight <= 0) return null
  return `${MASTERY_PREFIX}${source}:${weight}:${date}:${questionKey}`
}

function buildAttemptStateTokens({
  correctQuestionKeys = [],
  dailySeenDates = [],
  dailyWrongDates = [],
  masteryEvents = [],
} = {}) {
  return [
    ...new Set((Array.isArray(correctQuestionKeys) ? correctQuestionKeys : []).filter(Boolean)),
    ...new Set((Array.isArray(dailySeenDates) ? dailySeenDates : []).filter(Boolean).map((date) => `${DAILY_SEEN_PREFIX}${date}`)),
    ...new Set((Array.isArray(dailyWrongDates) ? dailyWrongDates : []).filter(Boolean).map((date) => `${DAILY_WRONG_PREFIX}${date}`)),
    ...((Array.isArray(masteryEvents) ? masteryEvents : [])
      .map(encodeMasteryToken)
      .filter(Boolean)
      .slice(-160)),
  ]
}

function daysBetweenDateOnly(fromDate, toDate) {
  const from = normalizeDateOnly(fromDate)
  const to = normalizeDateOnly(toDate)
  if (!from || !to) return 0
  const fromUtc = new Date(`${from}T00:00:00Z`).getTime()
  const toUtc = new Date(`${to}T00:00:00Z`).getTime()
  if (!Number.isFinite(fromUtc) || !Number.isFinite(toUtc)) return 0
  return Math.max(0, Math.floor((toUtc - fromUtc) / 86400000))
}

export function getMasteryDecayFactor(ageDays = 0) {
  if (MASTERY_DECAY_BYPASS) return 1
  const age = Math.max(0, ageDays - 1)
  if (age < 2) return 1
  if (age < 4) return 0.5
  if (age < 8) return 0.25
  if (age < 16) return 0.125
  return 0.0625
}

function parseMasteryTimestamp(value) {
  if (!value) return null
  try {
    const text = String(value).trim()
    if (!text) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return Date.parse(`${text}T12:00:00.000Z`)
    }
    const ms = Date.parse(text)
    return Number.isFinite(ms) ? ms : null
  } catch {
    return null
  }
}

function getMasteryReferenceTimestamp(referenceTime = null) {
  const parsed = parseMasteryTimestamp(referenceTime)
  return parsed ?? Date.now()
}

function getLatestMasterySnapshot(masteryEvents = [], referenceTime = null) {
  const successes = (Array.isArray(masteryEvents) ? masteryEvents : [])
    .map((event, index) => ({
      event,
      index,
      at: parseMasteryTimestamp(event?.occurredAt || event?.occurred_at || event?.date),
    }))
    .filter((entry) => entry.at != null)
    .sort((a, b) => a.at - b.at || a.index - b.index)

  if (!successes.length) {
    return {
      reviewCount: 0,
      halfLifeDays: 0,
      retention: 0,
      latestAt: null,
    }
  }

  const reviewCount = successes.length
  const latestAt = successes[successes.length - 1].at
  const halfLifeDays = Math.pow(2, Math.max(0, reviewCount - 1))
  const referenceAt = getMasteryReferenceTimestamp(referenceTime)
  const ageDays = Math.max(0, (referenceAt - latestAt) / 86400000)
  const rawRetention = Math.pow(0.5, ageDays / halfLifeDays)
  const retention = MASTERY_DECAY_BYPASS ? 1 : rawRetention

  return {
    reviewCount,
    halfLifeDays,
    retention: Math.max(0, Math.min(1, retention)),
    latestAt,
  }
}

export function calculateMasteryScore(masteryEvents = [], todayDateStr = getTodayInTimezone("UTC")) {
  return roundScore(getLatestMasterySnapshot(masteryEvents, todayDateStr).retention)
}

function buildMasteryEvent(source = "", questionKey = "", eventTime = null) {
  const parsedAt = parseMasteryTimestamp(eventTime)
  const occurredAt = parsedAt != null ? new Date(parsedAt).toISOString() : new Date().toISOString()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(eventTime || "").trim())
    ? String(eventTime).trim()
    : occurredAt.slice(0, 10)
  return {
    source: String(source || "").trim() || "practice",
    weight: 1,
    date,
    occurredAt,
    ...(questionKey ? { questionKey } : {}),
  }
}

function normalizeReinforcementItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const code = String(item?.code || item?.loCode || "").trim()
      const weight = roundScore(item?.weight || 0)
      if (!code || !Number.isFinite(weight) || weight <= 0) return null
      return { code, weight: Math.min(1, Math.max(0, weight)) }
    })
    .filter(Boolean)
    .sort((a, b) => b.weight - a.weight)
}

export function parseExplanationLine(text = "") {
  const line = String(text || "").trim()
  if (!line.startsWith("E:")) return null
  const raw = line.slice(2).trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return {
      primaryLo: String(parsed?.primary_lo || parsed?.primaryLo || "").trim(),
      reinforcementTargets: normalizeReinforcementItems(parsed?.reinforcement || parsed?.reinforcementTargets || []),
    }
  } catch {
    return null
  }
}

export function calculateReinforcementByCode(masteryEvents = [], questionLookup = {}, todayDateStr = getTodayInTimezone("UTC")) {
  const out = {}
  for (const event of Array.isArray(masteryEvents) ? masteryEvents : []) {
    const questionKey = normalizeQuestionKey(event?.questionKey || "")
    if (!questionKey) continue
    const reinforcementTargets = questionLookup?.[questionKey]?.reinforcementTargets || []
    if (!reinforcementTargets.length) continue
    const ageDays = daysBetweenDateOnly(event?.date, todayDateStr)
    const decayedBase = Number(event?.weight || 0) * getMasteryDecayFactor(ageDays)
    if (!Number.isFinite(decayedBase) || decayedBase <= 0) continue
    for (const target of reinforcementTargets) {
      const code = String(target?.code || "").trim()
      const weight = Number(target?.weight || 0)
      if (!code || !Number.isFinite(weight) || weight <= 0) continue
      out[code] = roundScore((out[code] || 0) + (decayedBase * weight))
    }
  }
  return out
}

// ─────────────────────────────────────────────
//  SCORES DB
//  One row per (student × question).
//  Source of truth for scheduling, weakness, and HW.
// ─────────────────────────────────────────────

function parseScoreRow(r) {
  const primarySlo = r.properties["primary_slo"]?.rich_text?.[0]?.plain_text || ""
  const alignedSlos = normalizeSloIdList(parseJsonRichText(r.properties["aligned_slos"], []))
  const reinforcementSlos = normalizeWeightedSloList(parseJsonRichText(r.properties["reinforcement_slos"], []))
  const standardCode = r.properties["standard_code"]?.rich_text?.[0]?.plain_text || joinDerivedLoCodes(primarySlo, alignedSlos)
  const rawHwSource = r.properties.hw_source?.rich_text?.[0]?.plain_text || ""
  const parsedHwSource = parseHwSource(rawHwSource)
  const correctQuestionKeysRaw = r.properties["attempted_qhashes"]?.rich_text?.[0]?.plain_text || "[]"
  let scoreTokens = []
  try { scoreTokens = JSON.parse(correctQuestionKeysRaw) } catch {}
  if (!Array.isArray(scoreTokens)) scoreTokens = []
  const correctQuestionKeys = scoreTokens.filter(
    (token) =>
      typeof token === "string" &&
      !token.startsWith(DAILY_SEEN_PREFIX) &&
      !token.startsWith(DAILY_WRONG_PREFIX) &&
      !token.startsWith(MASTERY_PREFIX)
  )
  const dailySeenDates = scoreTokens
    .filter((token) => typeof token === "string" && token.startsWith(DAILY_SEEN_PREFIX))
    .map((token) => token.replace(DAILY_SEEN_PREFIX, ""))
  const dailyWrongDates = scoreTokens
    .filter((token) => typeof token === "string" && token.startsWith(DAILY_WRONG_PREFIX))
    .map((token) => token.replace(DAILY_WRONG_PREFIX, ""))
  const masteryEvents = scoreTokens
    .map(parseMasteryToken)
    .filter(Boolean)
  return {
    id: r.id,
    questionId: fmtId(r.properties["Question ID"]?.rich_text?.[0]?.plain_text || ""),
    questionName: r.properties.Name?.title?.[0]?.plain_text || "",
    studentId: r.properties.Student?.relation?.[0]?.id || "",
    subjectId: r.properties.subject?.relation?.[0]?.id || "",
    score: r.properties.score?.number ?? 0,
    dateIntroduced: r.properties["Date Introduced"]?.date?.start || null,
    unit: r.properties.unit?.select?.name || "",
    hwStreak: r.properties.hw_streak?.rich_text?.[0]?.plain_text || "[]",
    standardCode,
    primarySlo,
    alignedSlos,
    reinforcementSlos,
    status: r.properties.Status?.status?.name || "",
    hwSource: rawHwSource,
    hwSourceKind: parsedHwSource.kind,
    hwAssignedAt: parsedHwSource.assignedAt,
    hwSessionDate: parsedHwSource.sessionDate,
    correctQuestionKeys,
    dailySeenDates,
    dailyWrongDates,
    masteryEvents,
  }
}

export async function getScoreRow(studentId, questionPageId) {
  const dashedId = fmtId(questionPageId)
  const plainId = dashedId.replace(/-/g, "")
  // Try dashed format first (new rows), then plain (legacy rows stored without dashes)
  for (const idToTry of [dashedId, plainId]) {
    const res = await queryDB(SCORES_DB, {
      and: [
        { property: "Student", relation: { contains: fmtId(studentId) } },
        { property: "Question ID", rich_text: { equals: idToTry } }
      ]
    })
    if (res.results?.length) return parseScoreRow(res.results[0])
  }
  return null
}

export async function createScoreRow(studentId, subjectId, question, dateIntroduced, hwSource = "session") {
  const props = {
    Name: { title: [{ text: { content: question.title } }] },
    Student: { relation: [{ id: fmtId(studentId) }] },
    subject: { relation: [{ id: fmtId(subjectId) }] },
    "Question ID": { rich_text: [{ text: { content: fmtId(question.id) } }] },
    score: { number: 0 },
    "Date Introduced": { date: { start: dateIntroduced } },
    hw_source: { rich_text: [{ text: { content: hwSource } }] },
    attempted_qhashes: { rich_text: [{ text: { content: "[]" } }] },
  }
  const alignedSlos = normalizeSloIdList(question.alignedSlos || [])
  const reinforcementSlos = normalizeWeightedSloList(question.reinforcementSlos || [])
  const derivedStandardCode = question.standardCode || joinDerivedLoCodes(question.primarySlo || "", alignedSlos)
  if (derivedStandardCode) props["standard_code"] = { rich_text: [{ text: { content: derivedStandardCode } }] }
  if (question.primarySlo) props["primary_slo"] = richTextProp(question.primarySlo)
  props["aligned_slos"] = richTextJsonProp(alignedSlos)
  props["reinforcement_slos"] = richTextJsonProp(reinforcementSlos)
  if (question.unit) {
    props["unit"] = { select: { name: question.unit } }
  }
  return createInDB(SCORES_DB, props)
}

export async function getAllScoresForStudent(studentId, subjectId = null) {
  const filter = subjectId
    ? { and: [
        { property: "Student", relation: { contains: fmtId(studentId) } },
        { property: "subject", relation: { contains: fmtId(subjectId) } },
      ]}
    : { property: "Student", relation: { contains: fmtId(studentId) } }
  const res = await queryDB(SCORES_DB, filter)
  return res.results?.map(parseScoreRow) || []
}

// Returns all score rows for the most recent session date (exit ticket / today's topics).
// Timezone-independent — the admin sets the date at import; we just find the latest.
export async function getTodayScoreRows(studentId, subjectId) {
  // NOTE:
  // "Today" historically meant "latest Date Introduced". After FIFO, some rows
  // are pushed to the *next* class date, which can become the latest and break
  // exit-ticket/topic fetching. Prefer passing an explicit sessionDate when you
  // need "the current session's plan".
  const res = await queryDB(SCORES_DB, {
    and: [
      { property: "Student", relation: { contains: fmtId(studentId) } },
      { property: "subject", relation: { contains: fmtId(subjectId) } },
    ]
  }, [{ property: "Date Introduced", direction: "descending" }])
  if (!res.results?.length) return []
  const rows = res.results.map(parseScoreRow)
  const latestDate = rows[0].dateIntroduced
  return rows.filter(r => r.dateIntroduced === latestDate)
}

export async function getScoreRowsForDate(studentId, subjectId, dateStr) {
  if (!dateStr) return []
  const res = await queryDB(SCORES_DB, {
    and: [
      { property: "Student", relation: { contains: fmtId(studentId) } },
      { property: "subject", relation: { contains: fmtId(subjectId) } },
      { property: "Date Introduced", date: { equals: dateStr } },
    ]
  })
  if (!res.results?.length) return []
  return res.results.map(parseScoreRow)
}

// Returns all score rows for the second-most-recent session date (pre-class assessment).
// Uses timezone to decide whether "latest" is today/future (so pre = previous),
// or whether we have no session imported for today yet (so pre = latest).
export async function getPreviousSessionScoreRows(studentId, subjectId, timezone = null) {
  const res = await queryDB(SCORES_DB, {
    and: [
      { property: "Student", relation: { contains: fmtId(studentId) } },
      { property: "subject", relation: { contains: fmtId(subjectId) } },
    ]
  }, [{ property: "Date Introduced", direction: "descending" }])
  if (!res.results?.length) return []
  const rows = res.results.map(parseScoreRow)
  const datesDesc = [...new Set(rows.map(r => r.dateIntroduced).filter(Boolean))].sort().reverse()
  if (!datesDesc.length) return []
  if (datesDesc.length === 1) {
    return rows.filter(r => r.dateIntroduced === datesDesc[0])
  }

  const today = getTodayInTimezone(timezone || "UTC")
  const latest = datesDesc[0]

  // If we have a session imported for today (or in the future), use the previous one for pre-class.
  // If we don't have a session imported for today yet (latest is in the past), use latest.
  const pickDate = (latest >= today) ? datesDesc[1] : latest
  return rows.filter(r => r.dateIntroduced === pickDate)
}

export async function getPreviousSessionScoreRowsBeforeDate(studentId, subjectId, anchorDate) {
  if (!anchorDate) return []
  const res = await queryDB(SCORES_DB, {
    and: [
      { property: "Student", relation: { contains: fmtId(studentId) } },
      { property: "subject", relation: { contains: fmtId(subjectId) } },
    ]
  }, [{ property: "Date Introduced", direction: "descending" }])
  if (!res.results?.length) return []
  const rows = res.results.map(parseScoreRow)
  const datesDesc = [...new Set(rows.map(r => r.dateIntroduced).filter(Boolean))].sort().reverse()
  if (!datesDesc.length) return []
  if (datesDesc.length === 1) {
    return rows.filter((r) => r.dateIntroduced === datesDesc[0])
  }

  const eligible = datesDesc.filter((date) => date <= anchorDate)
  if (!eligible.length) return []

  const latestEligible = eligible[0]
  const earlierEligible = eligible.find((date) => date < latestEligible)
  const pickDate = latestEligible === anchorDate && earlierEligible
    ? earlierEligible
    : latestEligible

  return rows.filter((r) => r.dateIntroduced === pickDate)
}

// Returns the latest session date string (YYYY-MM-DD) from the scores DB for this student/subject.
// Use this anywhere you need to know "what date did the admin last import for this student".
export async function getLatestSessionDate(studentId, subjectId) {
  const rows = await getTodayScoreRows(studentId, subjectId)
  return rows[0]?.dateIntroduced || null
}

export async function getLatestSessionDateOnOrBefore(studentId, subjectId, timezone = "UTC") {
  const res = await queryDB(SCORES_DB, {
    and: [
      { property: "Student", relation: { contains: fmtId(studentId) } },
      { property: "subject", relation: { contains: fmtId(subjectId) } },
    ]
  }, [{ property: "Date Introduced", direction: "descending" }])
  if (!res.results?.length) return null
  const rows = res.results.map(parseScoreRow)
  const today = getTodayInTimezone(timezone || "UTC")
  const eligible = rows
    .map(r => r.dateIntroduced)
    .filter(date => date && date <= today)
    .sort()
    .at(-1)
  return eligible || null
}

// ─────────────────────────────────────────────
//  TODAY'S / PREVIOUS QUESTIONS
//  Query Scores DB, then hydrate with question data
// ─────────────────────────────────────────────

async function hydrateScoreRows(scoreRows) {
  console.log("[hydrate] hydrating", scoreRows.length, "rows:", scoreRows.map(r => r.questionId))
  const questions = await Promise.all(
    scoreRows.map(async row => {
      try {
        const page = await notionGet(`/pages/${fmtId(row.questionId)}`, "2022-06-28")
        if (page.object === "error") {
          console.log("[hydrate] error for", row.questionId, page.message)
          return null
        }
        const q = parseQuestion(page)
        console.log("[hydrate] ok:", row.questionId, q.title)
        return { ...q, scoreRowId: row.id, dateIntroduced: row.dateIntroduced, score: row.score, standardCode: row.standardCode || "" }
      } catch(e) {
        console.log("[hydrate] exception for", row.questionId, e.message)
        return null
      }
    })
  )
  return questions.filter(Boolean)
}

// Fetch specific questions by score row IDs (used for preview exit assessment)
export async function getQuestionsByIds(scoreRowIds) {
  const realRows = await Promise.all(
    scoreRowIds.map(async id => {
      try {
        const page = await notionGet(`/pages/${fmtId(id)}`, "2022-06-28")
        if (page.object === "error") return null
        return parseScoreRow(page)
      } catch { return null }
    })
  )
  return hydrateScoreRows(realRows.filter(Boolean))
}

export async function getTodayQuestions(dataSourceId, studentId, subjectId, timezone, sessionDate = null) {
  const rows = sessionDate
    ? await getScoreRowsForDate(studentId, subjectId, sessionDate)
    : await getTodayScoreRows(studentId, subjectId, timezone)
  return hydrateScoreRows(rows)
}

export async function getTodayTopicsAny(dataSourceId, studentId, subjectId, timezone, sessionDate = null) {
  return sessionDate
    ? getScoreRowsForDate(studentId, subjectId, sessionDate)
    : getTodayScoreRows(studentId, subjectId, timezone)
}

export async function getPreviousClassQuestions(dataSourceId, studentId, subjectId, timezone) {
  const rows = await getPreviousSessionScoreRows(studentId, subjectId, timezone)
  return hydrateScoreRows(rows)
}

export async function getPreviousClassQuestionsBeforeDate(dataSourceId, studentId, subjectId, anchorDate) {
  const rows = await getPreviousSessionScoreRowsBeforeDate(studentId, subjectId, anchorDate)
  return hydrateScoreRows(rows)
}

export async function pushQuestionToDate(scoreRowId, newDateStr) {
  return updatePage(scoreRowId, {
    "Date Introduced": { date: { start: newDateStr } }
  })
}

export async function setScoreRowStatus(scoreRowId, statusName) {
  return updatePage(scoreRowId, {
    Status: { status: { name: statusName } }
  })
}

export async function setScoreRowStandardCode(scoreRowId, standardCode) {
  return updatePage(scoreRowId, {
    standard_code: {
      rich_text: standardCode
        ? [{ text: { content: standardCode } }]
        : []
    }
  })
}

export async function setScoreRowAttemptedQuestionKeys(scoreRowId, keys = []) {
  const page = await notionGet(`/pages/${fmtId(scoreRowId)}`, "2022-06-28")
  const existing = page?.object === "page" ? parseScoreRow(page) : null
  const unique = buildAttemptStateTokens({
    correctQuestionKeys: [...new Set((Array.isArray(keys) ? keys : []).filter(Boolean))],
    dailySeenDates: existing?.dailySeenDates || [],
    dailyWrongDates: existing?.dailyWrongDates || [],
    masteryEvents: existing?.masteryEvents || [],
  })
  return updatePage(scoreRowId, {
    attempted_qhashes: {
      rich_text: [{ text: { content: JSON.stringify(unique) } }]
    }
  })
}

export async function setScoreRowPracticeState(scoreRowId, {
  correctQuestionKeys = [],
  dailySeenDates = [],
  dailyWrongDates = [],
  masteryEvents = [],
} = {}) {
  const tokens = buildAttemptStateTokens({
    correctQuestionKeys,
    dailySeenDates,
    dailyWrongDates,
    masteryEvents,
  })
  return updatePage(scoreRowId, {
    attempted_qhashes: {
      rich_text: [{ text: { content: JSON.stringify(tokens) } }]
    }
  })
}

export async function updateQuestionStatus(studentId, questionPageId, wrongCount) {
  const statusName = wrongCount >= 1 ? "To be reviewed" : "Done"
  const scoreRow = await getScoreRow(studentId, questionPageId)
  if (!scoreRow) {
    console.warn("[updateQuestionStatus] no score row found for student:", studentId, "question:", questionPageId)
    return null
  }
  return updatePage(scoreRow.id, { Status: { status: { name: statusName } } })
}

export async function recordAssessmentResult(studentId, questionPageId, topic, subjectId, correct, questionData = null, source = "assessment", eventDate = null) {
  const existing = await getScoreRow(studentId, questionPageId)
  const today = normalizeDateOnly(eventDate) || getTodayInTimezone("UTC")
  const questionKey = normalizeQuestionKey(questionData?.questionKey || "")
  if (existing) {
    const nextScore = correct ? 0 : roundScore((existing.score || 0) + 1)
    const masteryEvents = correct
      ? [...(existing.masteryEvents || []), buildMasteryEvent(source, questionKey, today)].slice(-160)
      : (existing.masteryEvents || [])
    await updatePage(existing.id, {
      score: { number: nextScore },
      attempted_qhashes: {
        rich_text: [{
          text: {
            content: JSON.stringify(buildAttemptStateTokens({
              correctQuestionKeys: existing.correctQuestionKeys || [],
              dailySeenDates: existing.dailySeenDates || [],
              dailyWrongDates: existing.dailyWrongDates || [],
              masteryEvents,
            }))
          }
        }]
      }
    })
    return {
      weaknessScore: nextScore,
      masteryEvents,
      masteryScore: calculateMasteryScore(masteryEvents, today),
    }
  }

  const masteryEvents = correct ? [buildMasteryEvent(source, questionKey, today)] : []
  const props = {
    Name: { title: [{ text: { content: topic } }] },
    Student: { relation: [{ id: fmtId(studentId) }] },
    "Question ID": { rich_text: [{ text: { content: questionPageId } }] },
    score: { number: correct ? 0 : 1 },
    subject: { relation: [{ id: fmtId(subjectId) }] },
    attempted_qhashes: { rich_text: [{ text: { content: JSON.stringify(buildAttemptStateTokens({ masteryEvents })) } }] },
  }
  if (questionData?.standardCode) props["standard_code"] = { rich_text: [{ text: { content: questionData.standardCode } }] }
  if (questionData?.primarySlo) props["primary_slo"] = richTextProp(questionData.primarySlo)
  props["aligned_slos"] = richTextJsonProp(normalizeSloIdList(questionData?.alignedSlos || []))
  props["reinforcement_slos"] = richTextJsonProp(normalizeWeightedSloList(questionData?.reinforcementSlos || []))
  if (questionData?.unit) props["unit"] = { select: { name: questionData.unit } }
  await createInDB(SCORES_DB, props)
  return {
    weaknessScore: correct ? 0 : 1,
    masteryEvents,
    masteryScore: calculateMasteryScore(masteryEvents, today),
  }
}

// ─────────────────────────────────────────────
//  WEAKNESS SCORES
// ─────────────────────────────────────────────

export async function getWeaknessScore(studentId, questionPageId) {
  return getScoreRow(studentId, questionPageId)
}

export async function incrementWeaknessScore(studentId, questionPageId, topic, subjectId, questionData = null) {
  const existing = await getScoreRow(studentId, questionPageId)
  if (existing) {
    await updatePage(existing.id, { score: { number: existing.score + 1 } })
    return existing.score + 1
  } else {
    const props = {
      Name: { title: [{ text: { content: topic } }] },
      Student: { relation: [{ id: fmtId(studentId) }] },
      "Question ID": { rich_text: [{ text: { content: questionPageId } }] },
      score: { number: 1 },
      subject: { relation: [{ id: fmtId(subjectId) }] },
    }
    if (questionData?.standardCode) props["standard_code"] = { rich_text: [{ text: { content: questionData.standardCode } }] }
    if (questionData?.primarySlo) props["primary_slo"] = richTextProp(questionData.primarySlo)
    props["aligned_slos"] = richTextJsonProp(normalizeSloIdList(questionData?.alignedSlos || []))
    props["reinforcement_slos"] = richTextJsonProp(normalizeWeightedSloList(questionData?.reinforcementSlos || []))
    if (questionData?.unit) {
      props["unit"] = { select: { name: questionData.unit } }
    }
    await createInDB(SCORES_DB, props)
    return 1
  }
}

export async function getWeaknessMap(studentId, subjectId = null) {
  const scores = await getAllScoresForStudent(studentId, subjectId)
  const unitMap  = {}
  scores.forEach(s => {
    if (!s.score) return
    if (s.unit) {
      unitMap[s.unit] = Math.round(((unitMap[s.unit] || 0) + s.score) * 100) / 100
    }
  })
  return { topics: {}, units: unitMap }
}

// ─────────────────────────────────────────────
//  HOMEWORK TRACKING
// ─────────────────────────────────────────────

export async function getHWStreak(studentId, questionPageId) {
  const row = await getScoreRow(studentId, questionPageId)
  if (!row) return []
  try { return JSON.parse(row.hwStreak || "[]") } catch { return [] }
}

export async function recordHWAttempt(studentId, questionPageId, topic, subjectId, correct, timezone, questionKey = "") {
  const today = getTodayInTimezone(timezone)
  const existing = await getScoreRow(studentId, questionPageId)
  const normalizedQuestionKey = normalizeQuestionKey(questionKey)
  let streak = []
  try { streak = JSON.parse(existing?.hwStreak || "[]") } catch {}
  const alreadyToday = streak.find(r => r.date === today)
  if (!alreadyToday) {
    streak.push({ date: today, correct })
    streak = streak.slice(-60)
  }
  if (existing) {
    let newScore = existing.score
    if (correct) newScore = Math.max(0, roundScore(newScore - 0.2))
    else newScore = roundScore(newScore + 0.2)
    const masteryEvents = correct
      ? [...(existing.masteryEvents || []), buildMasteryEvent("homework", normalizedQuestionKey)].slice(-160)
      : (existing.masteryEvents || [])
    await updatePage(existing.id, {
      score: { number: newScore },
      hw_streak: { rich_text: [{ text: { content: JSON.stringify(streak) } }] },
      attempted_qhashes: {
        rich_text: [{
          text: {
            content: JSON.stringify(buildAttemptStateTokens({
              correctQuestionKeys: existing.correctQuestionKeys || [],
              dailySeenDates: existing.dailySeenDates || [],
              dailyWrongDates: existing.dailyWrongDates || [],
              masteryEvents,
            }))
          }
        }]
      }
    })
    return {
      weaknessScore: newScore,
      masteryEvents,
      masteryScore: calculateMasteryScore(masteryEvents, today),
    }
  } else {
    const masteryEvents = correct ? [buildMasteryEvent("homework", normalizedQuestionKey)] : []
    await createInDB(SCORES_DB, {
      Name: { title: [{ text: { content: topic } }] },
      Student: { relation: [{ id: fmtId(studentId) }] },
      "Question ID": { rich_text: [{ text: { content: questionPageId } }] },
      score: { number: correct ? 0 : 0.2 },
      subject: { relation: [{ id: fmtId(subjectId) }] },
      hw_streak: { rich_text: [{ text: { content: JSON.stringify(streak) } }] },
      attempted_qhashes: { rich_text: [{ text: { content: JSON.stringify(buildAttemptStateTokens({ masteryEvents })) } }] },
    })
    return {
      weaknessScore: correct ? 0 : 0.2,
      masteryEvents,
      masteryScore: calculateMasteryScore(masteryEvents, today),
    }
  }
}

export async function applyComboReduction(studentId, questionPageId, reduction) {
  const existing = await getScoreRow(studentId, questionPageId)
  if (!existing) return
  const newScore = Math.max(0, existing.score - reduction)
  await updatePage(existing.id, { score: { number: Math.round(newScore * 100) / 100 } })
}

export async function recordPracticeAttempt(studentId, questionPageId, topic, subjectId, questionKey, result, timezone) {
  const today = getTodayInTimezone(timezone)
  const existing = await getScoreRow(studentId, questionPageId)
  const normalizedQuestionKey = normalizeQuestionKey(questionKey)
  const correctQuestionKeys = result === "correct"
    ? [...new Set([...(existing?.correctQuestionKeys || []), normalizedQuestionKey])]
    : (existing?.correctQuestionKeys || [])
  const dailySeenDates = [...new Set([...(existing?.dailySeenDates || []), today])]
  const dailyWrongDates = result === "wrong"
    ? [...new Set([...(existing?.dailyWrongDates || []), today])]
    : (existing?.dailyWrongDates || []).filter((date) => date !== today)
  const masteryEvents = result === "correct"
    ? [...(existing?.masteryEvents || []), buildMasteryEvent("practice", normalizedQuestionKey)].slice(-160)
    : (existing?.masteryEvents || [])
  const nextScore = result === "correct"
    ? Math.max(0, roundScore((existing?.score || 0) - 0.1))
    : roundScore((existing?.score || 0) + 0.1)

  if (existing?.id) {
    await updatePage(existing.id, {
      score: { number: nextScore },
      attempted_qhashes: {
        rich_text: [{
          text: {
            content: JSON.stringify(buildAttemptStateTokens({
              correctQuestionKeys,
              dailySeenDates,
              dailyWrongDates,
              masteryEvents,
            }))
          }
        }]
      }
    })
    return {
      rowId: existing.id,
      weaknessScore: nextScore,
      correctQuestionKeys,
      dailySeenDates,
      dailyWrongDates,
      masteryEvents,
      masteryScore: calculateMasteryScore(masteryEvents, today),
    }
  }

  await createInDB(SCORES_DB, {
    Name: { title: [{ text: { content: topic } }] },
    Student: { relation: [{ id: fmtId(studentId) }] },
    "Question ID": { rich_text: [{ text: { content: questionPageId } }] },
    score: { number: nextScore },
    subject: { relation: [{ id: fmtId(subjectId) }] },
    attempted_qhashes: {
      rich_text: [{
        text: {
          content: JSON.stringify(buildAttemptStateTokens({
            correctQuestionKeys,
            dailySeenDates,
            dailyWrongDates,
            masteryEvents,
          }))
        }
      }]
    },
  })

  return {
    rowId: null,
    weaknessScore: nextScore,
    correctQuestionKeys,
    dailySeenDates,
    dailyWrongDates,
    masteryEvents,
    masteryScore: calculateMasteryScore(masteryEvents, today),
  }
}

// ─────────────────────────────────────────────
//  HW STACK
//  hw_source: "session" | "weakness" | "admin_hw" | ""
//  Stack = rows where hw_source != ""
//  OR score > 2 (weakness auto-qualifies without explicit tag)
// ─────────────────────────────────────────────

export async function setHWSource(scoreRowId, source) {
  await updatePage(scoreRowId, {
    hw_source: { rich_text: [{ text: { content: source } }] }
  })
}

// Get all score rows in the HW stack for a student × subject
// Stack = hw_source tagged rows UNION rows with score > 2
export async function getHWStack(studentId, subjectId) {
  const scores = await getAllScoresForStudent(studentId, subjectId)
  return scores.filter(s => s.hwSource || s.score > 2)
}

// Tag a batch of score row IDs with hw_source
export async function tagHWSource(scoreRowIds, source) {
  await Promise.all(scoreRowIds.map(id => setHWSource(id, source)))
}

// Clear session tags from the previous session (called when new session is imported)
export async function clearSessionHWTags(studentId, subjectId) {
  const scores = await getAllScoresForStudent(studentId, subjectId)
  const sessionRows = scores.filter(s => s.hwSourceKind === "session")
  await Promise.all(sessionRows.map(s => setHWSource(s.id, "")))
}

// After a correct HW answer: if score hits 0 and source is "weakness", clear it
export async function maybeRemoveFromHWStack(scoreRowId, newScore, hwSource) {
  if (newScore <= 0 && isHwSourceKind(hwSource, "weakness")) {
    await setHWSource(scoreRowId, "")
  }
}

export async function penalizeAllTodayQuestions(studentId, subjectId, timezone) {
  const rows = await getTodayScoreRows(studentId, subjectId, timezone)
  for (const row of rows) {
    await updatePage(row.id, { score: { number: (row.score || 0) + 1 } })
  }
  return rows.length
}

export async function getQuestionsWithScores(dataSourceId, studentId, subjectId) {
  const scores = await getAllScoresForStudent(studentId, subjectId)
  const scoreMap = {}
  // Normalize both stored questionId and lookup key to dashed UUID format
  scores.forEach(s => { scoreMap[fmtId(s.questionId)] = s })
  const res = await queryDataSource(dataSourceId, {})
  const questions = res.results?.map(parseQuestion) || []
  return questions.map(q => {
    const key = fmtId(q.id)
    return {
      ...q,
      weaknessScore: scoreMap[key]?.score || 0,
      hwStreak: scoreMap[key]?.hwStreak || "[]",
      dateIntroduced: scoreMap[key]?.dateIntroduced || null,
      scoreRowId: scoreMap[key]?.id || null,
      standardCode: scoreMap[key]?.standardCode || q.standardCode || "",
      primarySlo: scoreMap[key]?.primarySlo || q.primarySlo || "",
      alignedSlos: scoreMap[key]?.alignedSlos || q.alignedSlos || [],
      reinforcementSlos: scoreMap[key]?.reinforcementSlos || q.reinforcementSlos || [],
      reinforcementTargets: scoreMap[key]?.reinforcementSlos?.length
        ? reinforcementTargetsFromSloWeights(scoreMap[key].reinforcementSlos)
        : (q.reinforcementTargets || []),
      hwSource: scoreMap[key]?.hwSource || "",
      hwSourceKind: scoreMap[key]?.hwSourceKind || "",
      hwAssignedAt: scoreMap[key]?.hwAssignedAt || "",
      hwSessionDate: scoreMap[key]?.hwSessionDate || "",
      status: scoreMap[key]?.status || "",
      unit: scoreMap[key]?.unit || q.unit || "",
      correctQuestionKeys: scoreMap[key]?.correctQuestionKeys || [],
      dailySeenDates: scoreMap[key]?.dailySeenDates || [],
      dailyWrongDates: scoreMap[key]?.dailyWrongDates || [],
      masteryEvents: scoreMap[key]?.masteryEvents || [],
    }
  })
}

export async function getWeakQuestionsForStudent(dataSourceId, studentId) {
  const scores = await getAllScoresForStudent(studentId)
  const weakRows = scores.filter(s => s.score > 0)
  if (!weakRows.length) return []
  const questions = await Promise.all(
    weakRows.map(async row => {
      try {
        const page = await notionGet(`/pages/${fmtId(row.questionId)}`, "2022-06-28")
        const q = parseQuestion(page)
        return { ...q, score: row.score, scoreRowId: row.id }
      } catch { return null }
    })
  )
  return questions.filter(Boolean)
}

// ─────────────────────────────────────────────
//  HOMEWORK ATTEMPTS DB
// ─────────────────────────────────────────────

export function hasHomeworkAttemptsDB() {
  return !!HOMEWORK_ATTEMPTS_DB
}

function parseHomeworkAttempt(page) {
  const props = page?.properties || {}
  const questionPayloadText = richTextToPlain(props["Question Payload"])
  const resultPayloadText = richTextToPlain(props["Result Payload"])
  return {
    id: page.id,
    title: props.Name?.title?.[0]?.plain_text || "",
    studentId: richTextToPlain(props["Student ID"]),
    subjectId: richTextToPlain(props["Subject ID"]),
    batchKey: richTextToPlain(props["Batch Key"]),
    cycleKey: richTextToPlain(props["Cycle Key"]),
    sessionDate: props["Session Date"]?.date?.start || null,
    unlockAt: props["Unlock At"]?.date?.start || null,
    expireAt: props["Expire At"]?.date?.start || null,
    status: props.Status?.status?.name || props.Status?.select?.name || "",
    score: props.Score?.number ?? null,
    total: props.Total?.number ?? null,
    sourceSummary: richTextToPlain(props["Source Summary"]),
    sessionId: props.Session?.relation?.[0]?.id || "",
    attemptNumber: props["Attempt Number"]?.number ?? null,
    isLatest: props["Is Latest"]?.checkbox || false,
    isOfficial: props["Is Official"]?.checkbox || false,
    pdfUrl: props["PDF URL"]?.url || "",
    pdfR2Key: richTextToPlain(props["PDF R2 Key"]),
    questionPayloadText,
    resultPayloadText,
    questionPayload: parseJsonText(questionPayloadText, []),
    resultPayload: parseJsonText(resultPayloadText, null),
  }
}

export async function getHomeworkAttemptByCycle(studentId, subjectId, cycleKey) {
  if (!HOMEWORK_ATTEMPTS_DB || !cycleKey) return null
  const res = await queryDB(HOMEWORK_ATTEMPTS_DB, {
    and: [
      { property: "Student ID", rich_text: { equals: String(studentId || "") } },
      { property: "Subject ID", rich_text: { equals: String(subjectId || "") } },
      { property: "Cycle Key", rich_text: { equals: String(cycleKey || "") } },
    ]
  })
  if (!res.results?.length) return null
  return parseHomeworkAttempt(res.results[0])
}

export async function getHomeworkAttemptById(attemptId) {
  if (!attemptId) return null
  const page = await notionGet(`/pages/${fmtId(attemptId)}`)
  if (page?.object === "error") return null
  return parseHomeworkAttempt(page)
}

export async function listHomeworkAttempts(studentId, subjectId, limit = 12) {
  if (!HOMEWORK_ATTEMPTS_DB) return []
  const res = await queryDB(HOMEWORK_ATTEMPTS_DB, {
    and: [
      { property: "Student ID", rich_text: { equals: String(studentId || "") } },
      { property: "Subject ID", rich_text: { equals: String(subjectId || "") } },
    ]
  }, [
    { property: "Unlock At", direction: "descending" },
    { property: "Session Date", direction: "descending" },
  ])
  return (res.results || []).slice(0, Math.max(1, limit)).map(parseHomeworkAttempt)
}

export async function createHomeworkAttempt({
  studentId,
  subjectId,
  sessionId = "",
  batchKey,
  cycleKey,
  sessionDate,
  unlockAt,
  expireAt,
  cycleIndex = 0,
  status = "Assigned",
  questions = [],
  sourceSummary = "",
  attemptNumber = 1,
  isLatest = true,
  isOfficial = true,
} = {}) {
  if (!HOMEWORK_ATTEMPTS_DB) return null
  const title = `Homework ${sessionDate || ""} · ${cycleIndex + 1}`.trim()
  const payload = JSON.stringify(Array.isArray(questions) ? questions : [])
  const res = await createInDB(HOMEWORK_ATTEMPTS_DB, {
    Name: { title: [{ text: { content: title.slice(0, 120) } }] },
    "Student ID": richTextProp(studentId),
    "Subject ID": richTextProp(subjectId),
    "Batch Key": richTextProp(batchKey),
    "Cycle Key": richTextProp(cycleKey),
    "Session Date": sessionDate ? { date: { start: sessionDate } } : { date: null },
    "Unlock At": unlockAt ? { date: { start: unlockAt } } : { date: null },
    "Expire At": expireAt ? { date: { start: expireAt } } : { date: null },
    Status: { select: { name: status } },
    Score: { number: 0 },
    Total: { number: Array.isArray(questions) ? questions.length : 0 },
    "Question Payload": richTextProp(payload),
    "Result Payload": richTextProp(""),
    "Source Summary": richTextProp(sourceSummary),
    Session: sessionId ? { relation: [{ id: fmtId(sessionId) }] } : { relation: [] },
    "Attempt Number": { number: attemptNumber },
    "Is Latest": { checkbox: !!isLatest },
    "Is Official": { checkbox: !!isOfficial },
    "PDF URL": urlProp(""),
    "PDF R2 Key": richTextProp(""),
  })
  if (res?.object !== "page") return null
  return parseHomeworkAttempt(res)
}

export async function completeHomeworkAttempt(attemptId, {
  status = "Completed",
  resultPayload = null,
  score = 0,
  total = 0,
} = {}) {
  if (!attemptId) return null
  const payload = resultPayload == null ? "" : JSON.stringify(resultPayload)
  return updatePage(attemptId, {
    Status: { select: { name: status } },
    Score: { number: score },
    Total: { number: total },
    "Result Payload": richTextProp(payload),
  })
}

export async function appendReadableHomeworkAttemptSummary(attemptId, attempt) {
  if (!attemptId || !attempt) return null
  const blocks = buildAttemptReadableBlocks({
    kind: "Homework",
    questionPayload: attempt.questionPayload || [],
    resultPayload: attempt.resultPayload || {},
  })
  return appendBlocksToPage(attemptId, blocks)
}

export async function appendAttemptArtifactLinks(attemptId, {
  pdfUrl = "",
  reportUrl = "",
} = {}) {
  if (!attemptId) return null
  const blocks = [headingBlock(3, "Saved Files")]
  if (pdfUrl) blocks.push(linkParagraphBlock("Attempt PDF in R2", pdfUrl))
  if (reportUrl) blocks.push(linkParagraphBlock("Session Report PDF in R2", reportUrl))
  if (blocks.length === 1) return null
  return appendBlocksToPage(attemptId, blocks)
}

export async function updateHomeworkAttemptArtifacts(attemptId, {
  sessionId = "",
  attemptNumber = null,
  isLatest = null,
  isOfficial = null,
  pdfUrl = "",
  pdfR2Key = "",
} = {}) {
  if (!attemptId) return null
  const properties = {
    "PDF URL": urlProp(pdfUrl),
    "PDF R2 Key": richTextProp(pdfR2Key),
  }
  if (sessionId) properties.Session = { relation: [{ id: fmtId(sessionId) }] }
  if (attemptNumber != null) properties["Attempt Number"] = { number: Number(attemptNumber) || 1 }
  if (isLatest != null) properties["Is Latest"] = { checkbox: !!isLatest }
  if (isOfficial != null) properties["Is Official"] = { checkbox: !!isOfficial }
  return updatePage(attemptId, properties)
}

export async function updateHomeworkAttemptExpireAt(attemptId, expireAt) {
  if (!attemptId) return null
  return updatePage(attemptId, {
    "Expire At": expireAt ? { date: { start: expireAt } } : { date: null },
  })
}

// ─────────────────────────────────────────────
//  ASSESSMENT ATTEMPTS DB
// ─────────────────────────────────────────────

export function hasAssessmentAttemptsDB() {
  return !!ASSESSMENT_ATTEMPTS_DB
}

function parseAssessmentAttempt(page) {
  const props = page?.properties || {}
  const questionPayloadText = richTextToPlain(props["Question Payload"])
  const resultPayloadText = richTextToPlain(props["Result Payload"])
  return {
    id: page.id,
    title: props.Name?.title?.[0]?.plain_text || "",
    studentId: richTextToPlain(props["Student ID"]),
    subjectId: richTextToPlain(props["Subject ID"]),
    mode: props.Mode?.select?.name || "",
    sessionDate: props["Session Date"]?.date?.start || null,
    unlockAt: props["Unlock At"]?.date?.start || null,
    expireAt: props["Expire At"]?.date?.start || null,
    status: props.Status?.select?.name || "",
    score: props.Score?.number ?? null,
    total: props.Total?.number ?? null,
    sourceSummary: richTextToPlain(props["Source Summary"]),
    sessionId: props.Session?.relation?.[0]?.id || "",
    attemptNumber: props["Attempt Number"]?.number ?? null,
    isLatest: props["Is Latest"]?.checkbox || false,
    isOfficial: props["Is Official"]?.checkbox || false,
    pdfUrl: props["PDF URL"]?.url || "",
    pdfR2Key: richTextToPlain(props["PDF R2 Key"]),
    questionPayloadText,
    resultPayloadText,
    questionPayload: parseJsonText(questionPayloadText, []),
    resultPayload: parseJsonText(resultPayloadText, null),
  }
}

export async function getAssessmentAttempt(studentId, subjectId, mode, sessionDate) {
  if (!ASSESSMENT_ATTEMPTS_DB || !mode || !sessionDate) return null
  const res = await queryDB(ASSESSMENT_ATTEMPTS_DB, {
    and: [
      { property: "Student ID", rich_text: { equals: String(studentId || "") } },
      { property: "Subject ID", rich_text: { equals: String(subjectId || "") } },
      { property: "Mode", select: { equals: String(mode || "") } },
      { property: "Session Date", date: { equals: String(sessionDate || "") } },
    ]
  })
  if (!res.results?.length) return null
  return parseAssessmentAttempt(res.results[0])
}

export async function getAssessmentAttemptById(attemptId) {
  if (!ASSESSMENT_ATTEMPTS_DB || !attemptId) return null
  const page = await notionGet(`/pages/${fmtId(attemptId)}`)
  if (page?.object !== "page") return null
  return parseAssessmentAttempt(page)
}

export async function createAssessmentAttempt({
  studentId,
  subjectId,
  sessionId = "",
  mode,
  sessionDate,
  unlockAt,
  expireAt,
  status = "Assigned",
  questions = [],
  sourceSummary = "",
  attemptNumber = 1,
  isLatest = true,
  isOfficial = true,
} = {}) {
  if (!ASSESSMENT_ATTEMPTS_DB) return null
  const title = `${String(mode || "").toUpperCase()} ${sessionDate || ""}`.trim()
  const payload = JSON.stringify(Array.isArray(questions) ? questions : [])
  const res = await createInDB(ASSESSMENT_ATTEMPTS_DB, {
    Name: { title: [{ text: { content: title.slice(0, 120) } }] },
    "Student ID": richTextProp(studentId),
    "Subject ID": richTextProp(subjectId),
    Mode: { select: { name: mode } },
    "Session Date": sessionDate ? { date: { start: sessionDate } } : { date: null },
    "Unlock At": unlockAt ? { date: { start: unlockAt } } : { date: null },
    "Expire At": expireAt ? { date: { start: expireAt } } : { date: null },
    Status: { select: { name: status } },
    Score: { number: 0 },
    Total: { number: Array.isArray(questions) ? questions.length : 0 },
    "Question Payload": richTextProp(payload),
    "Result Payload": richTextProp(""),
    "Source Summary": richTextProp(sourceSummary),
    Session: sessionId ? { relation: [{ id: fmtId(sessionId) }] } : { relation: [] },
    "Attempt Number": { number: attemptNumber },
    "Is Latest": { checkbox: !!isLatest },
    "Is Official": { checkbox: !!isOfficial },
    "PDF URL": urlProp(""),
    "PDF R2 Key": richTextProp(""),
  })
  if (res?.object !== "page") return null
  return parseAssessmentAttempt(res)
}

export async function completeAssessmentAttempt(attemptId, {
  status = "Completed",
  resultPayload = null,
  score = 0,
  total = 0,
} = {}) {
  if (!attemptId) return null
  const payload = resultPayload == null ? "" : JSON.stringify(resultPayload)
  return updatePage(attemptId, {
    Status: { select: { name: status } },
    Score: { number: score },
    Total: { number: total },
    "Result Payload": richTextProp(payload),
  })
}

export async function appendReadableAssessmentAttemptSummary(attemptId, attempt, { mode = "" } = {}) {
  if (!attemptId || !attempt) return null
  const kind = mode === "exit" ? "Exit Ticket" : "Pre-Class Assessment"
  const blocks = buildAttemptReadableBlocks({
    kind,
    questionPayload: attempt.questionPayload || [],
    resultPayload: attempt.resultPayload || {},
  })
  return appendBlocksToPage(attemptId, blocks)
}

export async function updateAssessmentAttemptArtifacts(attemptId, {
  sessionId = "",
  attemptNumber = null,
  isLatest = null,
  isOfficial = null,
  pdfUrl = "",
  pdfR2Key = "",
} = {}) {
  if (!attemptId) return null
  const properties = {
    "PDF URL": urlProp(pdfUrl),
    "PDF R2 Key": richTextProp(pdfR2Key),
  }
  if (sessionId) properties.Session = { relation: [{ id: fmtId(sessionId) }] }
  if (attemptNumber != null) properties["Attempt Number"] = { number: Number(attemptNumber) || 1 }
  if (isLatest != null) properties["Is Latest"] = { checkbox: !!isLatest }
  if (isOfficial != null) properties["Is Official"] = { checkbox: !!isOfficial }
  return updatePage(attemptId, properties)
}

export async function listAssessmentAttempts(studentId, subjectId = null, limit = 24) {
  if (!ASSESSMENT_ATTEMPTS_DB) return []
  const filter = subjectId
    ? {
        and: [
          { property: "Student ID", rich_text: { equals: String(studentId || "") } },
          { property: "Subject ID", rich_text: { equals: String(subjectId || "") } },
        ]
      }
    : { property: "Student ID", rich_text: { equals: String(studentId || "") } }
  const res = await queryDB(ASSESSMENT_ATTEMPTS_DB, filter, [
    { property: "Session Date", direction: "descending" },
    { property: "Unlock At", direction: "descending" },
  ])
  return (res.results || []).slice(0, Math.max(1, limit)).map(parseAssessmentAttempt)
}

// ─────────────────────────────────────────────
//  REPORTS
// ─────────────────────────────────────────────

export async function createReportRow({ studentId, subjectId, dateStr, reportUrl }) {
  if (!REPORTS_DB) throw new Error("NOTION_REPORTS_DB is not set.")
  const title = `Report — ${dateStr || "Session"}`
  const props = {
    Name: { title: [{ text: { content: title } }] },
    Student: { relation: [{ id: fmtId(studentId) }] },
    Subject: { relation: [{ id: fmtId(subjectId) }] },
  }
  if (dateStr) props["Date"] = { date: { start: dateStr } }
  if (reportUrl) props["Report URL"] = { url: reportUrl }
  return createInDB(REPORTS_DB, props)
}
