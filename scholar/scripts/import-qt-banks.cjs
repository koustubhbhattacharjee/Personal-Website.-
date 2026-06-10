#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  scripts/import-qt-banks.cjs
//  Directly imports all data/qt-bank-9ma0-*.json files into Supabase.
//  Equivalent to calling POST /api/admin/import for each file.
//
//  Usage:
//    NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/import-qt-banks.cjs
//
//  Optional: pass a single file to import just that one:
//    node scripts/import-qt-banks.cjs data/qt-bank-9ma0-y1-ch14.json
// ─────────────────────────────────────────────────────────────────────────────

const path = require("path")
const fs   = require("fs")
const crypto = require("crypto")

// ── Env ───────────────────────────────────────────────────────────────────────
// Load .env.local manually (dotenv may not be installed)
;(function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.local")
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "")
  }
})()

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")
  process.exit(1)
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
function hdr(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

async function rest(path_, { method = "GET", body, prefer } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path_}`
  const res = await fetch(url, {
    method,
    headers: hdr(prefer ? { Prefer: prefer } : {}),
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) throw new Error(data?.message || data?.hint || data?.error || `Supabase ${res.status}: ${text.slice(0, 200)}`)
  return data
}

async function select(table, query) {
  const params = new URLSearchParams(query)
  return rest(`${table}?${params}`) || []
}

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

function parseQuestionBankJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(
      closeUnclosedJsonStructures(normalizeInvalidJsonEscapes(
        stripTrailingCommas(stripJsonLikeComments(text))
      )).trim()
    )
  }
}

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

  push(primary, "primary", 1.0)
  for (const item of Array.isArray(aligned) ? aligned : []) push(item, "aligned", 0.6)
  for (const item of Array.isArray(reinforcement) ? reinforcement : []) push(item, "reinforcement", 0.2)

  const total = merged.reduce((sum, item) => sum + item.weight, 0)
  return total > 0
    ? merged.map((item) => ({ ...item, normalized_weight: item.weight / total }))
    : []
}

function deriveWeightedTargets(bankItem = {}) {
  if (Array.isArray(bankItem.weighted_slo_targets) && bankItem.weighted_slo_targets.length) {
    return bankItem.weighted_slo_targets
  }
  if (Array.isArray(bankItem.slo_weights) && bankItem.slo_weights.length) {
    return bankItem.slo_weights
  }
  return buildWeightedSloTargets({
    primary: bankItem.primary_slo || null,
    aligned: bankItem.aligned_slos || [],
    reinforcement: bankItem.reinforcement_slos || [],
  })
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
  const primaryLo = primaryCode.split(".").slice(0, -1).join(".")
  const alignedCodes = normalizedTargets
    .slice(1)
    .filter((item) => item.slo.split(".").slice(0, -1).join(".") === primaryLo)
    .map((item) => item.slo)
  const reinforcementItems = normalizedTargets
    .slice(1)
    .filter((item) => item.slo.split(".").slice(0, -1).join(".") !== primaryLo)

  return { primaryCode, alignedCodes, reinforcementItems }
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
    weighted_slo_targets: deriveWeightedTargets({
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
  }
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
    weighted_slo_targets: deriveWeightedTargets(qt),
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

// ── Request-scoped caches ─────────────────────────────────────────────────────
const _fw    = {}
const _slo   = {}
const _sec   = {}
const _ov    = {}
const _cbId  = {}   // textbook_key → content_bank_id (looked up via subject/framework)

// ── Resolvers ─────────────────────────────────────────────────────────────────
async function getContentBankId(subject) {
  if (_cbId[subject]) return _cbId[subject]
  // Find content bank via curriculum_framework key matching subject
  const rows = await rest(
    `content_banks?select=id,key,framework_id&limit=100`
  ) || []
  // Also fetch frameworks to match subject
  const fwRows = await rest(
    `curriculum_frameworks?select=id,key&key=eq.${encodeURIComponent(subject)}&limit=1`
  ) || []
  const fwId = fwRows[0]?.id
  if (!fwId) throw new Error(`No curriculum framework found for subject "${subject}"`)
  const cb = rows.find(r => r.framework_id === fwId)
  if (!cb) throw new Error(`No content bank found for framework_id ${fwId} (subject "${subject}")`)
  _cbId[subject] = cb.id
  return cb.id
}

async function getFrameworkId(contentBankId) {
  if (_fw[contentBankId]) return _fw[contentBankId]
  const rows = await rest(`content_banks?select=framework_id&id=eq.${contentBankId}&limit=1`) || []
  const id = rows[0]?.framework_id
  if (!id) throw new Error(`Content bank ${contentBankId} has no framework_id`)
  _fw[contentBankId] = id
  return id
}

async function resolveSloCode(code, frameworkId) {
  if (!code) return null
  const key = `${frameworkId}::${code}`
  if (_slo[key] !== undefined) return _slo[key]
  // SLO codes like "9MA0.P1.1.1.1" are globally unique — no framework join needed
  const rows = await rest(
    `sub_learning_objectives?select=id&code=eq.${encodeURIComponent(code)}&limit=1`
  ).catch(() => []) || []
  const id = Array.isArray(rows) && rows.length ? rows[0].id : null
  _slo[key] = id
  return id
}

async function resolveOverlayId(contentBankId, overlayKey) {
  const key = `${contentBankId}::${overlayKey}`
  if (_ov[key] !== undefined) return _ov[key]
  const rows = await rest(
    `school_overlays?select=id&content_bank_id=eq.${contentBankId}&overlay_key=eq.${encodeURIComponent(overlayKey)}&limit=1`
  ) || []
  const id = rows[0]?.id || null
  _ov[key] = id
  return id
}

async function resolveSectionRef(sectionRef, overlayId) {
  if (!sectionRef || !overlayId) return null
  const key = `${overlayId}::${sectionRef}`
  if (_sec[key] !== undefined) return _sec[key]
  const rows = await rest(
    `school_sections?select=id,section_key&school_units=inner&school_units.overlay_id=eq.${overlayId}&or=(section_key.eq.${encodeURIComponent(sectionRef)},section_label.ilike.${encodeURIComponent(`%${sectionRef}%`)})&limit=1`
  ).catch(() => []) || []
  // If the join syntax doesn't work, fall back to a two-step lookup
  let id = rows[0]?.id || null
  if (!id) {
    // Get all section IDs in this overlay via units
    const unitRows = await rest(
      `school_units?select=id&overlay_id=eq.${overlayId}&limit=1000`
    ).catch(() => []) || []
    const unitIds = unitRows.map(r => r.id)
    if (unitIds.length) {
      const inClause = unitIds.map(id => `"${id}"`).join(",")
      const secRows = await rest(
        `school_sections?select=id,section_key&unit_id=in.(${unitIds.join(",")})&section_key=eq.${encodeURIComponent(sectionRef)}&limit=1`
      ).catch(() => []) || []
      id = secRows[0]?.id || null
    }
  }
  _sec[key] = id
  return id
}

async function resolveReinforcementSlos(items, frameworkId, alignedCodes = []) {
  const aligned = (alignedCodes || []).map(c => ({ slo: String(c || "").trim(), weight: 1.0 })).filter(x => x.slo)
  const all = [...aligned, ...(items || [])]
  const seen = {}
  for (const item of all) {
    const code = String(item?.slo || "").trim()
    if (!code) continue
    if (!seen[code] || Number(item.weight) > seen[code].weight)
      seen[code] = { slo: code, weight: Number(item.weight || 1) }
  }
  const out = await Promise.all(Object.values(seen).map(async item => {
    if (item.weight <= 0) return null
    const w = Math.min(1, Math.max(0, item.weight))
    const id = await resolveSloCode(item.slo, frameworkId)
    return id ? { slo_id: id, weight: w } : null
  }))
  return out.filter(Boolean)
}

// ── Upsert helpers ────────────────────────────────────────────────────────────
async function upsertQT(row) {
  const existing = await rest(
    `question_types?select=id&content_bank_id=eq.${row.content_bank_id}&title=eq.${encodeURIComponent(row.title)}&limit=1`
  ) || []
  if (existing.length) {
    const id = existing[0].id
    await rest(`question_types?id=eq.${id}`, {
      method: "PATCH",
      body: { ...row, updated_at: new Date().toISOString() },
      prefer: "return=minimal",
    })
    return { id, created: false }
  }
  const rows = await rest("question_types?select=id", {
    method: "POST",
    body: [row],
    prefer: "return=representation",
  }) || []
  return { id: (Array.isArray(rows) ? rows[0] : rows)?.id, created: true }
}

function qhash(text) {
  return crypto.createHash("sha256").update(String(text || "").trim().toLowerCase()).digest("hex").slice(0, 32)
}

async function upsertQ(row) {
  const existing = await rest(`questions?select=id&qhash=eq.${row.qhash}&limit=1`) || []
  if (existing.length) {
    const id = existing[0].id
    await rest(`questions?id=eq.${id}`, {
      method: "PATCH",
      body: {
        question_type_id: row.question_type_id,
        question_text: row.question_text,
        answer_text: row.answer_text,
        options: row.options,
        correct_option: row.correct_option,
        explanation: row.explanation,
        question_format: row.question_format,
        primary_slo_id: row.primary_slo_id,
        aligned_slo_ids: row.aligned_slo_ids,
        reinforcement_slos: row.reinforcement_slos,
        source_reference: row.source_reference,
        diagram_required: row.diagram_required,
      },
      prefer: "return=minimal",
    })
    return { created: false }
  }
  await rest("questions", {
    method: "POST",
    body: [row],
    prefer: "return=minimal",
  })
  return { created: true }
}

// ── Core import ───────────────────────────────────────────────────────────────
async function importBank(payload, contentBankId) {
  const normalizedPayload = normalizeQuestionBankPayload(payload)
  const frameworkId = await getFrameworkId(contentBankId)
  const sourceLabel = String(normalizedPayload.source_label || normalizedPayload.source || "").trim()
  const sourceType  = String(normalizedPayload.source_type  || "external").trim()
  const textbookKey = String(normalizedPayload.textbook_key  || "").trim() || null
  const overlayKey  = String(normalizedPayload.overlay_key   || "").trim() || null

  let overlayId = null
  if (sourceType === "textbook" && overlayKey) {
    overlayId = await resolveOverlayId(contentBankId, overlayKey)
    if (!overlayId) throw new Error(`overlay_key "${overlayKey}" not found for content bank ${contentBankId}`)
  }

  const stats = { qtCreated: 0, qtUpdated: 0, qCreated: 0, qUpdated: 0, sloMisses: [], sectionMisses: [] }
  const qts = Array.isArray(normalizedPayload.question_types) ? normalizedPayload.question_types : []

  for (const qt of qts) {
    const title = String(qt.title || "").trim()
    if (!title) continue

    const qtWeightedTargets = deriveSloRolesFromWeightedTargets(deriveWeightedTargets(qt))
    const primarySloId = qtWeightedTargets.primaryCode
      ? await resolveSloCode(String(qtWeightedTargets.primaryCode).trim(), frameworkId)
      : null
    if (qtWeightedTargets.primaryCode && !primarySloId)
      stats.sloMisses.push({ context: title, code: qtWeightedTargets.primaryCode })

    const reinforcementSlos = await resolveReinforcementSlos(
      qtWeightedTargets.reinforcementItems,
      frameworkId,
      qtWeightedTargets.alignedCodes
    )

    let schoolSectionId = null
    if (sourceType === "textbook" && overlayId) {
      const ref = String(qt.section_ref || "").trim()
      if (ref) {
        schoolSectionId = await resolveSectionRef(ref, overlayId)
        if (!schoolSectionId) stats.sectionMisses.push({ context: title, section_ref: ref })
      }
    }

    const qtRow = {
      content_bank_id:    contentBankId,
      title,
      unit_label:         qt.unit_label || null,
      source_type:        sourceType,
      source_label:       sourceLabel || null,
      school_section_id:  schoolSectionId,
      primary_slo_id:     primarySloId || null,
      aligned_slo_ids:    [],
      reinforcement_slos: reinforcementSlos,
      lo_confidence:      null,
      source_reference:   { textbook_key: textbookKey, section: qt.section_ref || null },
      status:             "active",
      metadata:           {},
    }

    const { id: qtId, created: qtCreated } = await upsertQT(qtRow)
    if (!qtId) { console.warn(`  ✗ QT upsert returned no id: "${title}"`); continue }
    if (qtCreated) stats.qtCreated++; else stats.qtUpdated++

    const questions = Array.isArray(qt.questions) ? qt.questions : []
    for (let ord = 0; ord < questions.length; ord++) {
      const q = questions[ord]
      const text = String(q.question || "").trim()
      if (!text) continue

      const qWeightedTargets = deriveSloRolesFromWeightedTargets(
        deriveWeightedTargets({
          ...qt,
          ...q,
          primary_slo: q.primary_slo || qt.primary_slo || null,
          aligned_slos: q.aligned_slos?.length ? q.aligned_slos : qt.aligned_slos,
          reinforcement_slos: q.reinforcement_slos?.length ? q.reinforcement_slos : qt.reinforcement_slos,
          weighted_slo_targets: q.weighted_slo_targets?.length ? q.weighted_slo_targets : qt.weighted_slo_targets,
          slo_weights: q.slo_weights?.length ? q.slo_weights : qt.slo_weights,
        })
      )

      const qPrimary = qWeightedTargets.primaryCode
        ? await resolveSloCode(String(qWeightedTargets.primaryCode).trim(), frameworkId)
        : primarySloId

      const qReinf = (qWeightedTargets.reinforcementItems.length || qWeightedTargets.alignedCodes.length)
        ? await resolveReinforcementSlos(qWeightedTargets.reinforcementItems, frameworkId, qWeightedTargets.alignedCodes)
        : reinforcementSlos

      const qRow = {
        question_type_id:     qtId,
        qhash:                qhash(text),
        ordinal:              ord,
        question_format:      q.question_format || "mcq",
        question_text:        text,
        answer_text:          q.answer || null,
        options:              Array.isArray(q.options) ? q.options : [],
        correct_option:       q.correct_option || null,
        explanation:          q.explanation || null,
        primary_slo_id:       qPrimary || null,
        aligned_slo_ids:      [],
        reinforcement_slos:   qReinf,
        source_reference:     { worksheet_name: sourceLabel, textbook_key: textbookKey, section: qt.section_ref || null },
        diagram_required:     q.diagram_required || "none",
        context_snippets:     [],
        candidate_image_refs: [],
        local_context_text:   null,
        metadata:             {},
      }

      const { created: qCreated } = await upsertQ(qRow)
      if (qCreated) stats.qCreated++; else stats.qUpdated++
    }
  }

  return stats
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const dataDir = path.resolve(__dirname, "../data")
  let files

  if (process.argv[2]) {
    // Single file passed as argument
    files = [path.resolve(process.argv[2])]
  } else {
    files = fs.readdirSync(dataDir)
      .filter(f => f.startsWith("qt-bank-9ma0-") && f.endsWith(".json"))
      .sort()
      .map(f => path.join(dataDir, f))
  }

  console.log(`\nImporting ${files.length} file(s)...\n`)

  let totalQtCreated = 0, totalQtUpdated = 0, totalQCreated = 0, totalQUpdated = 0
  const allSloMisses = [], allSectionMisses = []

  for (const file of files) {
    const fname = path.basename(file)
    process.stdout.write(`  ${fname} ... `)
    let payload
    try {
      payload = parseQuestionBankJson(fs.readFileSync(file, "utf8"))
    } catch (err) {
      console.log(`PARSE ERROR: ${err.message}`)
      continue
    }

    try {
      const subjectKey = String(payload.subject || "9MA0").trim()
      const contentBankId = await getContentBankId(subjectKey)
      process.stdout.write(`contentBank=${contentBankId} ... `)
      const stats = await importBank(payload, contentBankId)
      console.log(`QT +${stats.qtCreated} ~${stats.qtUpdated}  Q +${stats.qCreated} ~${stats.qUpdated}${stats.sloMisses.length ? `  SLO misses: ${stats.sloMisses.length}` : ""}${stats.sectionMisses.length ? `  section misses: ${stats.sectionMisses.length}` : ""}`)
      totalQtCreated += stats.qtCreated
      totalQtUpdated += stats.qtUpdated
      totalQCreated  += stats.qCreated
      totalQUpdated  += stats.qUpdated
      allSloMisses.push(...stats.sloMisses.map(m => ({ file: fname, ...m })))
      allSectionMisses.push(...stats.sectionMisses.map(m => ({ file: fname, ...m })))
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
    }
  }

  console.log(`\n${"─".repeat(60)}`)
  console.log(`Total  QT created: ${totalQtCreated}  updated: ${totalQtUpdated}`)
  console.log(`Total  Q  created: ${totalQCreated}   updated: ${totalQUpdated}`)

  if (allSloMisses.length) {
    console.log(`\nSLO misses (${allSloMisses.length}):`)
    for (const m of allSloMisses) console.log(`  [${m.file}] ${m.code} — ${m.context}`)
  }
  if (allSectionMisses.length) {
    console.log(`\nSection misses (${allSectionMisses.length}):`)
    for (const m of allSectionMisses) console.log(`  [${m.file}] section_ref="${m.section_ref}" — ${m.context}`)
  }
  console.log()
}

main().catch(err => {
  console.error("\nFatal:", err.message)
  process.exit(1)
})
