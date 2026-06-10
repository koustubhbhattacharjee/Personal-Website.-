// ─────────────────────────────────────────────────────────────────────────────
//  pages/api/admin/import.js
//  Supabase-only question bank importer (schema v2.0)
//
//  GET  → returns students, subjects, content_banks for UI dropdowns
//  POST → accepts v2 question bank JSON, resolves SLO codes, upserts
//         question_types + questions into Supabase
//
//  Two source tracks:
//    source_type: "textbook" — QT tagged directly to a school_section at import.
//                              Section mastery = mean(qt_mastery) for section.
//    source_type: "external" — QT routed through SLO→section weight projection.
//
//  No session anchoring. No draft writes. No Notion calls.
// ─────────────────────────────────────────────────────────────────────────────

import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import crypto from "crypto"
import { supabaseSelect, supabaseInsert, supabaseRest } from "../../../lib/supabase"
import { getAllStudents, getAllSubjects } from "../../../lib/db"
import { getLoForSlo } from "../../../lib/slo-utils"
import { getBinaryFromR2, r2ObjectExists, uploadBinaryToR2 } from "../../../lib/r2"
import { normalizeR2BaseUrl } from "../../../lib/worksheet-drafts"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function stripJsonLikeComments(text = "") {
  let out = ""
  let inString = false
  let escaped = false
  let lineComment = false
  let blockComment = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (lineComment) {
      if (ch === "\n") {
        lineComment = false
        out += ch
      }
      continue
    }

    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false
        i += 1
      }
      continue
    }

    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === "\"") inString = false
      continue
    }

    if (ch === "\"") {
      inString = true
      out += ch
      continue
    }

    if (ch === "/" && next === "/") {
      lineComment = true
      i += 1
      continue
    }

    if (ch === "/" && next === "*") {
      blockComment = true
      i += 1
      continue
    }

    out += ch
  }

  return out
}

function stripTrailingCommas(text = "") {
  let out = ""
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === "\"") inString = false
      continue
    }

    if (ch === "\"") {
      inString = true
      out += ch
      continue
    }

    if (ch === ",") {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j += 1
      if (text[j] === "]" || text[j] === "}") continue
    }

    out += ch
  }

  return out
}

function normalizeInvalidJsonEscapes(text = "") {
  let out = ""
  let inString = false
  let escaped = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (!inString) {
      out += ch
      if (ch === "\"") {
        inString = true
        escaped = false
      }
      continue
    }

    if (escaped) {
      const isValidSimpleEscape = ch === "\"" || ch === "\\" || ch === "/" || ch === "b" || ch === "f" || ch === "n" || ch === "r" || ch === "t"
      const isValidUnicodeEscape = ch === "u"
      if (isValidSimpleEscape || isValidUnicodeEscape) {
        out += ch
      } else {
        out += `\\${ch}`
      }
      escaped = false
      continue
    }

    out += ch
    if (ch === "\\") escaped = true
    else if (ch === "\"") inString = false
  }

  return out
}

function closeUnclosedJsonStructures(text = "") {
  let inString = false
  let escaped = false
  const stack = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === "\\") escaped = true
      else if (ch === "\"") inString = false
      continue
    }

    if (ch === "\"") {
      inString = true
      continue
    }
    if (ch === "{") stack.push("}")
    else if (ch === "[") stack.push("]")
    else if ((ch === "}" || ch === "]") && stack[stack.length - 1] === ch) stack.pop()
  }

  return text + stack.reverse().join("")
}

function parseQuestionBankJson(input) {
  if (input && typeof input === "object") return input
  const raw = String(input || "")
  try {
    return JSON.parse(raw)
  } catch {
    const normalized = closeUnclosedJsonStructures(normalizeInvalidJsonEscapes(
      stripTrailingCommas(stripJsonLikeComments(raw))
    )).trim()
    return JSON.parse(normalized)
  }
}

// ─────────────────────────────────────────────
//  Caches (request-scoped via module cache — fine for serverless cold starts)
// ─────────────────────────────────────────────

const _frameworkCache = {}
async function getFrameworkIdForBank(contentBankId) {
  if (_frameworkCache[contentBankId]) return _frameworkCache[contentBankId]
  const rows = await supabaseSelect("content_banks", {
    select: "id,framework_id",
    filters: { id: contentBankId },
    limit: 1,
  })
  const fwId = rows[0]?.framework_id || null
  if (fwId) _frameworkCache[contentBankId] = fwId
  return fwId
}

const _sloCache = {}
async function resolveSloCode(shortCode, frameworkId) {
  if (!shortCode || !frameworkId) return null
  const normalizedCode = String(shortCode).trim()
  const cacheKey = `${frameworkId}::${normalizedCode}`
  if (_sloCache[cacheKey] !== undefined) return _sloCache[cacheKey]
  const rows = await supabaseRest(
    `sub_learning_objectives?select=id&or=(code.eq.${encodeURIComponent(normalizedCode)},id.eq.${encodeURIComponent(normalizedCode)})&limit=1`,
    { method: "GET" }
  ).catch(() => [])
  const id = Array.isArray(rows) && rows.length ? rows[0].id : null
  _sloCache[cacheKey] = id
  return id
}

function normalizeSectionLookupValue(value) {
  return String(value || "").trim().toLowerCase()
}

// Cache school sections by overlay_id + section_key for textbook imports
const _sectionCache = {}
async function resolveSectionRef(sectionRef, overlayId, options = {}) {
  if (!sectionRef || !overlayId) return null
  const unitLabel = String(options.unitLabel || "").trim()
  const cacheKey = `${overlayId}::${sectionRef}::${unitLabel}`
  if (_sectionCache[cacheKey] !== undefined) return _sectionCache[cacheKey]

  // sectionRef can be a section_key (e.g. "6.3") or section_label.
  // We fetch all candidates because section_key can collide across units
  // like y1-ch9 vs y2-ch9, so unit_label must disambiguate.
  const rows = await supabaseRest(
    `school_sections?select=id,section_key,section_label,school_units!inner(unit_key,unit_name)&school_units.overlay_id=eq.${overlayId}&or=(section_key.eq.${encodeURIComponent(sectionRef)},section_label.ilike.${encodeURIComponent(`%${sectionRef}%`)})&limit=50`,
    { method: "GET" }
  ).catch(() => [])
  const candidates = Array.isArray(rows) ? rows : []
  const normalizedUnitLabel = normalizeSectionLookupValue(unitLabel)
  const ranked = candidates
    .map((row) => {
      const unit = Array.isArray(row.school_units) ? row.school_units[0] : row.school_units
      const normalizedUnitName = normalizeSectionLookupValue(unit?.unit_name)
      const normalizedSectionKey = normalizeSectionLookupValue(row.section_key)
      const normalizedSectionLabel = normalizeSectionLookupValue(row.section_label)
      let score = 0
      if (normalizedSectionKey === normalizeSectionLookupValue(sectionRef)) score += 4
      if (normalizedSectionLabel === normalizeSectionLookupValue(sectionRef)) score += 2
      if (normalizedUnitLabel) {
        if (normalizedUnitName === normalizedUnitLabel) score += 100
        else if (normalizedUnitName.includes(normalizedUnitLabel) || normalizedUnitLabel.includes(normalizedUnitName)) score += 50
      }
      return { row, score }
    })
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const second = ranked[1]
  const id =
    best && best.score > 0 && (!second || best.score > second.score)
      ? best.row.id
      : null
  _sectionCache[cacheKey] = id
  return id
}

// Cache overlay_id by content_bank_id + overlay_key
const _overlayCache = {}
async function resolveOverlayId(contentBankId, overlayKey) {
  if (!contentBankId || !overlayKey) return null
  const cacheKey = `${contentBankId}::${overlayKey}`
  if (_overlayCache[cacheKey] !== undefined) return _overlayCache[cacheKey]
  const rows = await supabaseSelect("school_overlays", {
    select: "id",
    filters: { content_bank_id: contentBankId, overlay_key: overlayKey },
    limit: 1,
  })
  const id = rows[0]?.id || null
  _overlayCache[cacheKey] = id
  return id
}

// ─────────────────────────────────────────────
//  SLO helpers
// ─────────────────────────────────────────────

function normalizeWeightedSloInput(item, defaultWeight = 0) {
  if (!item) return null
  if (typeof item === "string") {
    const code = String(item || "").trim()
    return code ? { slo: code, weight: defaultWeight } : null
  }
  if (typeof item === "object") {
    const code = String(item.slo || item.slo_id || item.code || item.id || "").trim()
    if (!code) return null
    const weight = Number(item.weight)
    return {
      slo: code,
      weight: Number.isFinite(weight) ? weight : defaultWeight,
    }
  }
  return null
}

function clampWeight(value) {
  const num = Number(value || 0)
  if (!Number.isFinite(num)) return 0
  return Math.min(1, Math.max(0, num))
}

function buildWeightedSloTargets({ primary = null, aligned = [], reinforcement = [] } = {}) {
  const seen = new Map()
  const merged = []

  const push = (item, role, defaultWeight) => {
    const normalized = normalizeWeightedSloInput(item, defaultWeight)
    if (!normalized?.slo) return
    const weight = clampWeight(normalized.weight)
    if (weight <= 0) return
    const existing = seen.get(normalized.slo)
    if (existing != null) {
      const prev = merged[existing]
      if (weight > prev.weight) merged[existing] = { ...prev, role, weight }
      return
    }
    seen.set(normalized.slo, merged.length)
    merged.push({ slo: normalized.slo, role, weight })
  }

  // Default weights are intentionally biased toward the primary stack.
  push(primary, "primary", 1.0)
  for (const item of Array.isArray(aligned) ? aligned : []) push(item, "aligned", 0.6)
  for (const item of Array.isArray(reinforcement) ? reinforcement : []) push(item, "reinforcement", 0.2)

  const total = merged.reduce((sum, item) => sum + item.weight, 0)
  const normalized = total > 0
    ? merged.map((item) => ({ ...item, normalized_weight: item.weight / total }))
    : []

  return { raw: merged, normalized }
}

function buildLegacyWeightedTargets({ primary = null, aligned = [], reinforcement = [] } = {}) {
  return buildWeightedSloTargets({ primary, aligned, reinforcement }).normalized
}

function deriveWeightedTargetInput(bankItem = {}) {
  if (Array.isArray(bankItem.weighted_slo_targets) && bankItem.weighted_slo_targets.length) {
    return bankItem.weighted_slo_targets
  }
  if (Array.isArray(bankItem.slo_weights) && bankItem.slo_weights.length) {
    return bankItem.slo_weights
  }
  return buildLegacyWeightedTargets({
    primary: bankItem.primary_slo || null,
    aligned: bankItem.aligned_slos || [],
    reinforcement: bankItem.reinforcement_slos || [],
  })
}

// ─── Draft-image promotion ───────────────────────────────────────────────────
// Admin review happens in the content studio while images live at
// `worksheet-drafts/<studentId>/<subjectId>/<draftId>/...`. On import (i.e.
// admin approval), we copy those images to the permanent location
// `question-images/<subjectSlug>/<sha>.png` so the question bank references
// only reviewed, stable keys. Images that are already at a non-draft URL are
// passed through unchanged.
function cleanSubjectSlug(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown"
}

function extractDraftKeyFromUrl(url, draftBaseUrl) {
  if (!url || !draftBaseUrl) return null
  const prefix = draftBaseUrl.replace(/\/+$/, "") + "/"
  if (!url.startsWith(prefix)) return null
  const key = url.slice(prefix.length)
  return key.startsWith("worksheet-drafts/") ? key : null
}

async function promoteDraftImageUrl(url, { bucket, subjectSlug, publicBaseUrl, cache }) {
  if (!url || !bucket) return url
  if (cache.has(url)) return cache.get(url)
  const draftKey = extractDraftKeyFromUrl(url, publicBaseUrl)
  if (!draftKey) {
    cache.set(url, url)
    return url
  }
  try {
    const blob = await getBinaryFromR2({ bucket, key: draftKey })
    if (!blob?.body) {
      cache.set(url, url)
      return url
    }
    const sha = crypto.createHash("sha256").update(blob.body).digest("hex")
    const ext = draftKey.toLowerCase().endsWith(".jpg") || draftKey.toLowerCase().endsWith(".jpeg")
      ? "jpg"
      : draftKey.toLowerCase().endsWith(".webp") ? "webp" : "png"
    const permanentKey = `question-images/${subjectSlug}/${sha}.${ext}`
    const exists = await r2ObjectExists({ bucket, key: permanentKey })
    if (!exists) {
      await uploadBinaryToR2({ bucket, key: permanentKey, body: blob.body, contentType: blob.contentType || `image/${ext === "jpg" ? "jpeg" : ext}` })
    }
    const finalUrl = `${publicBaseUrl}/${permanentKey}`
    cache.set(url, finalUrl)
    return finalUrl
  } catch (err) {
    console.warn("[import] draft-image promotion failed:", err?.message || err)
    cache.set(url, url)
    return url
  }
}

async function promoteOrderedContent(orderedContent, ctx) {
  if (!Array.isArray(orderedContent) || !orderedContent.length) return orderedContent
  const out = []
  for (const item of orderedContent) {
    if (item?.type === "image" && item?.url) {
      const promotedUrl = await promoteDraftImageUrl(item.url, ctx)
      out.push({ ...item, url: promotedUrl })
    } else {
      out.push(item)
    }
  }
  return out
}

function normalizeOrderedContent(raw) {
  if (!Array.isArray(raw)) return null
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const type = String(item.type || "").trim().toLowerCase()
    if (type === "text") {
      const value = String(item.value || item.text || "").trim()
      if (!value) continue
      out.push({ type: "text", value })
    } else if (type === "image") {
      const url = String(item.url || "").trim()
      if (!url) continue
      const entry = { type: "image", url }
      if (item.caption) entry.caption = String(item.caption).trim()
      if (item.alt) entry.alt = String(item.alt).trim()
      if (item.placement) entry.placement = String(item.placement).trim()
      out.push(entry)
    }
  }
  return out.length ? out : null
}

function normalizeQuestionEntry(question = {}, parent = {}, payloadMeta = {}) {
  return {
    question_format: String(question.question_format || parent.question_format || "mcq").trim() || "mcq",
    question: String(question.question || question.question_text || "").trim(),
    answer: question.answer ?? question.answer_text ?? null,
    options: Array.isArray(question.options) ? question.options : [],
    correct_option: question.correct_option || null,
    explanation: question.explanation || null,
    primary_slo: question.primary_slo || parent.primary_slo || null,
    aligned_slos: Array.isArray(question.aligned_slos) && question.aligned_slos.length
      ? question.aligned_slos
      : (Array.isArray(parent.aligned_slos) ? parent.aligned_slos : []),
    reinforcement_slos: Array.isArray(question.reinforcement_slos) && question.reinforcement_slos.length
      ? question.reinforcement_slos
      : (Array.isArray(parent.reinforcement_slos) ? parent.reinforcement_slos : []),
    weighted_slo_targets: deriveWeightedTargetInput({
      ...parent,
      ...question,
      primary_slo: question.primary_slo || parent.primary_slo || null,
      aligned_slos: Array.isArray(question.aligned_slos) && question.aligned_slos.length
        ? question.aligned_slos
        : (Array.isArray(parent.aligned_slos) ? parent.aligned_slos : []),
      reinforcement_slos: Array.isArray(question.reinforcement_slos) && question.reinforcement_slos.length
        ? question.reinforcement_slos
        : (Array.isArray(parent.reinforcement_slos) ? parent.reinforcement_slos : []),
    }),
    source_reference: question.source_reference || {
      worksheet_name: payloadMeta.worksheet_name || null,
      textbook_key: payloadMeta.textbook_key || null,
      section: parent.section_ref || null,
    },
    diagram_required: question.diagram_required || "none",
    context_snippets: Array.isArray(question.context_snippets) ? question.context_snippets : [],
    candidate_image_refs: Array.isArray(question.candidate_image_refs) ? question.candidate_image_refs : [],
    ordered_content: normalizeOrderedContent(
      question.ordered_content || question.question_content || question.content || null
    ),
  }
}

// Look for directional words that imply an image above/below the mentioning
// text. Returns { mentionsAbove, mentionsBelow } so the importer can warn when
// the supplied ordered_content contradicts the text.
const ABOVE_RX = /\b(figure|diagram|graph|table|image|picture)\s+(shown\s+)?above\b/i
const BELOW_RX = /\b(figure|diagram|graph|table|image|picture)\s+(shown\s+)?below\b/i
function detectPositionalReferences(text = "") {
  const s = String(text || "")
  return { mentionsAbove: ABOVE_RX.test(s), mentionsBelow: BELOW_RX.test(s) }
}

// Returns null if ordered_content satisfies the positional hints, or a string
// describing the mismatch. Only emits when the supplier gave us content to
// check — if ordered_content is null we skip (legacy render path handles it).
function validatePositionalOrdering(text, orderedContent) {
  if (!Array.isArray(orderedContent) || !orderedContent.length) return null
  const { mentionsAbove, mentionsBelow } = detectPositionalReferences(text)
  if (!mentionsAbove && !mentionsBelow) return null
  const firstTextIdx = orderedContent.findIndex((it) => it.type === "text")
  const lastTextIdx = (() => {
    for (let i = orderedContent.length - 1; i >= 0; i -= 1) if (orderedContent[i].type === "text") return i
    return -1
  })()
  const hasImageBeforeText = firstTextIdx > 0 && orderedContent.slice(0, firstTextIdx).some((it) => it.type === "image")
  const hasImageAfterText = lastTextIdx >= 0 && orderedContent.slice(lastTextIdx + 1).some((it) => it.type === "image")
  const issues = []
  if (mentionsAbove && !hasImageBeforeText) issues.push(`text mentions a figure "above" but no image precedes the text`)
  if (mentionsBelow && !hasImageAfterText) issues.push(`text mentions a figure "below" but no image follows the text`)
  return issues.length ? issues.join("; ") : null
}

function normalizeQuestionTypeEntry(qt = {}, payload = {}) {
  const payloadMeta = {
    worksheet_name: String(payload.source_label || payload.source || "").trim() || null,
    textbook_key: String(payload.textbook_key || "").trim() || null,
  }
  const normalizedQt = {
    title: String(qt.title || qt.name || "").trim(),
    unit_label: qt.unit_label || qt.unit || null,
    source_type: String(qt.source_type || payload.source_type || "external").trim() || "external",
    section_ref: String(qt.section_ref || qt.section_key || "").trim() || null,
    lo_confidence: qt.lo_confidence || null,
    primary_slo: qt.primary_slo || null,
    aligned_slos: Array.isArray(qt.aligned_slos) ? qt.aligned_slos : [],
    reinforcement_slos: Array.isArray(qt.reinforcement_slos) ? qt.reinforcement_slos : [],
    weighted_slo_targets: deriveWeightedTargetInput(qt),
    source_reference: qt.source_reference || null,
    questions: [],
  }
  normalizedQt.questions = (Array.isArray(qt.questions) ? qt.questions : [])
    .map((question) => normalizeQuestionEntry(question, normalizedQt, payloadMeta))
    .filter((question) => question.question)
  return normalizedQt
}

function normalizeQuestionBankPayload(payload = {}) {
  const normalized = {
    ...payload,
    schema_version: String(payload.schema_version || "2.0").trim() || "2.0",
    source: String(payload.source || payload.textbook_key || "").trim(),
    source_label: String(payload.source_label || payload.source || "").trim(),
    source_type: String(payload.source_type || "external").trim() || "external",
    textbook_key: String(payload.textbook_key || "").trim() || null,
    overlay_key: String(payload.overlay_key || "").trim() || null,
    question_types: [],
  }

  normalized.question_types = (Array.isArray(payload.question_types) ? payload.question_types : [])
    .map((qt) => normalizeQuestionTypeEntry(qt, normalized))
    .filter((qt) => qt.title)

  return normalized
}

function deriveSloRolesFromWeightedTargets(items = []) {
  const normalized = (Array.isArray(items) ? items : [])
    .map((item) => normalizeWeightedSloInput(item, 0))
    .map((item) => item ? { ...item, weight: clampWeight(item.weight) } : null)
    .filter((item) => item?.slo && item.weight > 0)

  if (!normalized.length) {
    return {
      primaryCode: "",
      alignedCodes: [],
      reinforcementItems: [],
      normalizedTargets: [],
    }
  }

  const deduped = []
  const seen = new Map()
  for (const item of normalized) {
    const existing = seen.get(item.slo)
    if (existing != null) {
      if (item.weight > deduped[existing].weight) deduped[existing] = item
      continue
    }
    seen.set(item.slo, deduped.length)
    deduped.push(item)
  }

  deduped.sort((a, b) => b.weight - a.weight)
  const total = deduped.reduce((sum, item) => sum + item.weight, 0)
  const normalizedTargets = total > 0
    ? deduped.map((item) => ({ slo: item.slo, weight: item.weight / total }))
    : []

  const primaryCode = normalizedTargets[0]?.slo || ""
  const primaryLo = getLoForSlo(primaryCode)
  const alignedCodes = normalizedTargets
    .slice(1)
    .filter((item) => getLoForSlo(item.slo) === primaryLo)
    .map((item) => item.slo)
  const reinforcementItems = normalizedTargets
    .slice(1)
    .filter((item) => getLoForSlo(item.slo) !== primaryLo)

  return {
    primaryCode,
    alignedCodes,
    reinforcementItems,
    normalizedTargets,
  }
}

// Resolve reinforcement SLOs from { slo, weight } items.
async function resolveWeightedSloRows(items, frameworkId) {
  const seen = {}
  for (const item of Array.isArray(items) ? items : []) {
    const code = String(item?.slo || item?.slo_id || "").trim()
    if (!code) continue
    if (!seen[code] || Number(item.weight) > seen[code].weight) {
      seen[code] = { slo: code, weight: Number(item.weight || 0) }
    }
  }

  const resolved = await Promise.all(
    Object.values(seen).map(async (item) => {
      if (item.weight <= 0) return null
      const weight = clampWeight(item.weight)
      const id = await resolveSloCode(item.slo, frameworkId)
      return id ? { slo_id: id, weight } : null
    })
  )
  return resolved.filter(Boolean)
}

async function resolveAlignedSloIds(items, frameworkId) {
  const resolved = await Promise.all(
    (Array.isArray(items) ? items : []).map(async (code) => {
      const id = await resolveSloCode(code, frameworkId)
      return id || null
    })
  )
  return resolved.filter(Boolean)
}

// ─────────────────────────────────────────────
//  source_reference builder
// ─────────────────────────────────────────────

function buildSourceReference(q, payloadMeta = {}) {
  // Merge payload-level defaults with per-question overrides
  const base = q.source_reference || {}
  return {
    worksheet_name: String(base.worksheet_name || payloadMeta.worksheet_name || payloadMeta.source_label || "").trim() || null,
    textbook_key:   String(base.textbook_key   || payloadMeta.textbook_key   || "").trim() || null,
    page:           base.page           ?? payloadMeta.page           ?? null,
    section:        String(base.section        || payloadMeta.section        || "").trim() || null,
    exercise_ref:   String(base.exercise_ref   || "").trim() || null,
  }
}

// ─────────────────────────────────────────────
//  qhash
// ─────────────────────────────────────────────

function computeQhash(questionText = "") {
  return crypto
    .createHash("sha256")
    .update(String(questionText || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 32)
}

// Expand stem-parent entries into individual child rows. Each child inherits
// the stem's ordered_content (rendered as a prefix), shares a stem_group_id,
// and is marked is_stem_child so the progression/lock logic can skip it.
// Non-stem entries pass through unchanged.
function expandStemQuestions(rawQuestions = []) {
  const out = []
  for (const q of rawQuestions) {
    if (q && q.is_stem && Array.isArray(q.children) && q.children.length) {
      const stemGroupId = crypto.randomUUID()
      const stemHeader = Array.isArray(q.ordered_content || q.content || q.question_content)
        ? (q.ordered_content || q.content || q.question_content)
        : null
      const stemTextForHash = String(q.question || q.stem || "").trim()
      for (let idx = 0; idx < q.children.length; idx += 1) {
        const child = q.children[idx] || {}
        const childContent = Array.isArray(child.ordered_content || child.content || child.question_content)
          ? (child.ordered_content || child.content || child.question_content)
          : null
        const merged = []
        if (stemHeader) merged.push(...stemHeader)
        if (childContent) merged.push(...childContent)
        out.push({
          ...q,          // inherit primary_slo, aligned_slos, reinforcement_slos
          ...child,      // child overrides parent-level fields
          question: String(child.question || child.question_text || "").trim(),
          ordered_content: merged.length ? merged : (childContent || stemHeader || null),
          stem_group_id: stemGroupId,
          is_stem_child: true,
          stem_header_content: stemHeader,
          stem_source_text: stemTextForHash,
          stem_child_label: String(child.label || `${idx + 1}`).trim(),
          is_stem: undefined,
          children: undefined,
        })
      }
      continue
    }
    out.push(q)
  }
  return out
}

// ─────────────────────────────────────────────
//  Upsert helpers
// ─────────────────────────────────────────────

async function upsertQuestionType(row) {
  const existing = await supabaseSelect("question_types", {
    select: "id",
    filters: { content_bank_id: row.content_bank_id, title: row.title },
    limit: 1,
  })
  if (existing.length) {
    const id = existing[0].id
    await supabaseRest(`question_types?id=eq.${id}`, {
      method: "PATCH",
      body: { ...row, updated_at: new Date().toISOString() },
      headers: { Prefer: "return=minimal" },
    })
    return { id, created: false }
  }
  const rows = await supabaseInsert("question_types", [row])
  const created = Array.isArray(rows) ? rows[0] : rows
  return { id: created?.id, created: true }
}

async function upsertQuestion(row) {
  const existing = await supabaseSelect("questions", {
    select: "id",
    filters: { qhash: row.qhash },
    limit: 1,
  })
  if (existing.length) {
    const id = existing[0].id
    await supabaseRest(`questions?id=eq.${id}`, {
      method: "PATCH",
      body: {
        question_type_id:   row.question_type_id,
        question_text:      row.question_text,
        answer_text:        row.answer_text,
        options:            row.options,
        correct_option:     row.correct_option,
        explanation:        row.explanation,
        question_format:    row.question_format,
        primary_slo_id:     row.primary_slo_id,
        aligned_slo_ids:    row.aligned_slo_ids,
        reinforcement_slos: row.reinforcement_slos,
        source_reference:   row.source_reference,
        diagram_required:   row.diagram_required,
        context_snippets:   row.context_snippets,
        candidate_image_refs: row.candidate_image_refs,
        question_content:   row.question_content,
        stem_group_id:      row.stem_group_id,
        is_stem_child:      row.is_stem_child,
        stem_header_content: row.stem_header_content,
      },
      headers: { Prefer: "return=minimal" },
    })
    return { id, created: false }
  }
  const rows = await supabaseInsert("questions", [row])
  const created = Array.isArray(rows) ? rows[0] : rows
  return { id: created?.id, created: true }
}

// ─────────────────────────────────────────────
//  Core import function
// ─────────────────────────────────────────────

async function importQuestionBank(payload, contentBankId) {
  const normalizedPayload = normalizeQuestionBankPayload(payload)
  const frameworkId = await getFrameworkIdForBank(contentBankId)
  if (!frameworkId) throw new Error(`Content bank ${contentBankId} has no framework_id — cannot resolve SLO codes`)

  const sourceLabel  = String(normalizedPayload.source_label  || normalizedPayload.source || "").trim()
  const sourceType   = String(normalizedPayload.source_type   || "external").trim()   // "textbook" | "external"
  const textbookKey  = String(normalizedPayload.textbook_key  || "").trim() || null
  const overlayKey   = String(normalizedPayload.overlay_key   || "").trim() || null

  // For textbook imports: resolve the overlay once so we can look up sections
  let overlayId = null
  if (sourceType === "textbook" && overlayKey) {
    overlayId = await resolveOverlayId(contentBankId, overlayKey)
    if (!overlayId) {
      throw new Error(`overlay_key "${overlayKey}" not found for this content bank. Seed the school overlay before importing textbook QTs.`)
    }
  }

  const payloadMeta = { worksheet_name: sourceLabel, textbook_key: textbookKey, source_label: sourceLabel }
  const questionTypes = Array.isArray(normalizedPayload.question_types) ? normalizedPayload.question_types : []
  const stats = { qtCreated: 0, qtUpdated: 0, qCreated: 0, qUpdated: 0, sloMisses: [], sectionMisses: [], contentOrderWarnings: [], imagesPromoted: 0 }

  // Context for promoting draft-hosted images into the permanent content
  // bucket. Shared cache lets duplicate image URLs across questions dedupe to
  // a single upload + URL rewrite.
  const promotionCtx = (() => {
    const bucket = String(process.env.R2_BUCKET || "").trim()
    const publicBaseUrl = normalizeR2BaseUrl(process.env.R2_PUBLIC_BASE_URL, bucket)
    const subjectSlug = cleanSubjectSlug(normalizedPayload.subject || normalizedPayload.subject_slug || "")
    return {
      enabled: !!(bucket && publicBaseUrl),
      bucket,
      publicBaseUrl,
      subjectSlug,
      cache: new Map(),
    }
  })()

  for (const qt of questionTypes) {
    const title = String(qt.title || "").trim()
    if (!title) continue

    const qtSourceType = String(qt.source_type || sourceType).trim()

    // Resolve primary SLO
    const suppliedWeightedTargets = Array.isArray(qt.weighted_slo_targets)
      ? qt.weighted_slo_targets
      : (Array.isArray(qt.slo_weights) ? qt.slo_weights : [])
    const weightedTargets = suppliedWeightedTargets.length
      ? deriveSloRolesFromWeightedTargets(suppliedWeightedTargets)
      : deriveSloRolesFromWeightedTargets(buildLegacyWeightedTargets({
          primary: qt.primary_slo,
          aligned: qt.aligned_slos,
          reinforcement: qt.reinforcement_slos,
        }))
    const primarySloCode = weightedTargets.primaryCode
    const primarySloId = primarySloCode
      ? await resolveSloCode(primarySloCode, frameworkId)
      : null
    if (primarySloCode && !primarySloId) {
      stats.sloMisses.push({ context: title, code: primarySloCode, level: "question_type" })
    }

    const alignedSloIds = await resolveAlignedSloIds(weightedTargets.alignedCodes, frameworkId)
    const reinforcementSlos = await resolveWeightedSloRows(weightedTargets.reinforcementItems, frameworkId)

    // Resolve school_section_id for textbook QTs
    let schoolSectionId = null
    if (qtSourceType === "textbook" && overlayId) {
      const sectionRef = String(qt.section_ref || qt.section_key || "").trim()
      if (sectionRef) {
        schoolSectionId = await resolveSectionRef(sectionRef, overlayId, {
          unitLabel: qt.unit_label || null,
        })
        if (!schoolSectionId) {
          stats.sectionMisses.push({ context: title, section_ref: sectionRef })
        }
      }
    }

    const qtRow = {
      content_bank_id:   contentBankId,
      title,
      unit_label:        qt.unit_label || null,
      source_type:       qtSourceType,
      source_label:      sourceLabel || null,
      school_section_id: schoolSectionId,
      primary_slo_id:    primarySloId || null,
      aligned_slo_ids:   alignedSloIds,
      reinforcement_slos: reinforcementSlos,
      lo_confidence:     qt.lo_confidence || null,
      source_reference:  { textbook_key: textbookKey, section: qt.section_ref || null },
      status:            "active",
      metadata:          {
        weighted_slo_targets_normalized: weightedTargets.normalizedTargets,
      },
    }

    const { id: qtId, created: qtCreated } = await upsertQuestionType(qtRow)
    if (!qtId) continue
    if (qtCreated) stats.qtCreated++; else stats.qtUpdated++

    // Upsert questions — expand stem parents into child rows first so each
    // answerable unit gets its own row sharing stem_group_id.
    const questions = expandStemQuestions(Array.isArray(qt.questions) ? qt.questions : [])
    for (let ordinal = 0; ordinal < questions.length; ordinal++) {
      const q = questions[ordinal]
      const questionText = String(q.question || "").trim()
      if (!questionText) continue

      // Stem children share stem text; dedupe per child with label salt.
      const qhashSeed = q.is_stem_child
        ? `${q.stem_source_text || ""}\x00${q.stem_child_label || ordinal}\x00${questionText}`
        : questionText
      const qhash = computeQhash(qhashSeed)

      const qSuppliedWeightedTargets = Array.isArray(q.weighted_slo_targets)
        ? q.weighted_slo_targets
        : (Array.isArray(q.slo_weights) ? q.slo_weights : [])
      const qWeightedTargets = qSuppliedWeightedTargets.length
        ? deriveSloRolesFromWeightedTargets(qSuppliedWeightedTargets)
        : deriveSloRolesFromWeightedTargets(buildLegacyWeightedTargets({
            primary: q.primary_slo || qt.primary_slo || null,
            aligned: (q.aligned_slos?.length ? q.aligned_slos : qt.aligned_slos) || [],
            reinforcement: (q.reinforcement_slos?.length ? q.reinforcement_slos : qt.reinforcement_slos) || [],
          }))
      const qPrimarySloCode = qWeightedTargets.primaryCode
      const qPrimarySloId = qPrimarySloCode
        ? await resolveSloCode(qPrimarySloCode, frameworkId)
        : primarySloId

      const qAlignedSloIds = await resolveAlignedSloIds(qWeightedTargets.alignedCodes, frameworkId)
      const qReinforcementSlos = await resolveWeightedSloRows(qWeightedTargets.reinforcementItems, frameworkId)

      let orderedContent = Array.isArray(q.ordered_content) ? q.ordered_content : null
      if (orderedContent && promotionCtx.enabled) {
        const before = orderedContent
        orderedContent = await promoteOrderedContent(orderedContent, promotionCtx)
        for (let k = 0; k < orderedContent.length; k += 1) {
          if (orderedContent[k]?.type === "image" && before[k]?.url && before[k].url !== orderedContent[k].url) {
            stats.imagesPromoted += 1
          }
        }
      }
      const positionalWarning = validatePositionalOrdering(questionText, orderedContent)
      if (positionalWarning) {
        stats.contentOrderWarnings.push({ context: `${title} · Q${ordinal + 1}`, qhash, message: positionalWarning })
      } else if (!orderedContent) {
        const { mentionsAbove, mentionsBelow } = detectPositionalReferences(questionText)
        if (mentionsAbove || mentionsBelow) {
          stats.contentOrderWarnings.push({
            context: `${title} · Q${ordinal + 1}`,
            qhash,
            message: "text references a figure above/below but no ordered_content was supplied — image position cannot be guaranteed",
          })
        }
      }

      const resolvedFormat = String(q.question_format || q.format || "mcq").trim() || "mcq"
      const qRow = {
        question_type_id:     qtId,
        qhash,
        ordinal,
        question_format:      resolvedFormat,
        question_text:        questionText,
        answer_text:          q.answer || null,
        options:              Array.isArray(q.options) ? q.options : [],
        correct_option:       q.correct_option || null,
        explanation:          q.explanation || null,
        primary_slo_id:       qPrimarySloId || null,
        aligned_slo_ids:      qAlignedSloIds,
        reinforcement_slos:   qReinforcementSlos,
        source_reference:     buildSourceReference(q, { ...payloadMeta, section: qt.section_ref || null }),
        diagram_required:     q.diagram_required || "none",
        context_snippets:     Array.isArray(q.context_snippets) ? q.context_snippets : [],
        candidate_image_refs: Array.isArray(q.candidate_image_refs) ? q.candidate_image_refs : [],
        question_content:     orderedContent,
        stem_group_id:        q.stem_group_id || null,
        is_stem_child:        !!q.is_stem_child,
        stem_header_content:  Array.isArray(q.stem_header_content) ? q.stem_header_content : null,
        local_context_text:   null,
        metadata:             {
          weighted_slo_targets_normalized: qWeightedTargets.normalizedTargets,
          stem_child_label:                q.stem_child_label || null,
        },
      }

      const { created: qCreated } = await upsertQuestion(qRow)
      if (qCreated) stats.qCreated++; else stats.qUpdated++
    }
  }

  return stats
}

// ─────────────────────────────────────────────
//  Handler
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  // ── GET: dropdown data ─────────────────────
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store")
    const [students, subjects, contentBanks] = await Promise.all([
      getAllStudents(),
      getAllSubjects(),
      supabaseSelect("content_banks", { select: "id,key,label,subject_name", orderBy: "label" }),
    ])
    return res.status(200).json({ students, subjects, contentBanks })
  }

  if (req.method !== "POST") return res.status(405).end()

  const { action = "import_question_bank", questionBankJson, contentBankId } = req.body

  // ── POST: import question bank JSON ─────────
  if (action === "import_question_bank") {
    if (!questionBankJson) return res.status(400).json({ error: "questionBankJson is required" })
    if (!contentBankId) return res.status(400).json({ error: "contentBankId is required" })

    let payload
    try {
      payload = parseQuestionBankJson(questionBankJson)
    } catch {
      return res.status(400).json({ error: "questionBankJson is not valid JSON" })
    }

    const schemaVersion = String(payload.schema_version || "").trim()
    if (schemaVersion && schemaVersion !== "2.0") {
      return res.status(400).json({ error: `Unsupported schema_version "${schemaVersion}". Expected "2.0".` })
    }

    try {
      const stats = await importQuestionBank(payload, contentBankId)
      return res.status(200).json({
        ok: true,
        contentBankId,
        subject:      payload.subject || "",
        source:       payload.source || "",
        source_type:  payload.source_type || "external",
        ...stats,
      })
    } catch (err) {
      console.error("[import] question bank import failed:", err)
      return res.status(500).json({ error: err.message || "Import failed" })
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}` })
}

export const config = {
  api: { bodyParser: { sizeLimit: "10mb" } }
}
