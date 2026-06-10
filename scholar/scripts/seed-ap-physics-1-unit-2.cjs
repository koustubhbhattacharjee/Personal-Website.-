#!/usr/bin/env node
// Direct seed of data/ap-physics-1-unit-2-forces-mcq.json into Supabase.
// Bypasses /api/admin/import entirely — writes straight to question_types + questions.

const path = require("path")
const fs = require("fs")
const crypto = require("crypto")

const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local")
  process.exit(1)
}

const CONTENT_BANK_ID = "19522376-4b71-48a0-aa5c-845df3d6037d"
const FRAMEWORK_ID   = "434e067c-f50a-4dc1-a826-897fc32d4292"
const DEFAULT_SOURCE_LABEL = "AP Physics 1 Unit 2 Force and Translational Dynamics MCQ — 2026-04-21"
const DEFAULT_JSON_PATH    = path.join(process.cwd(), "data", "ap-physics-1-unit-2-forces-mcq.json")
const DRY_RUN        = process.argv.includes("--dry-run")
// Optional: --file <path> overrides DEFAULT_JSON_PATH so this script can also
// seed v2 trees authored after the original MCQ pack (e.g. workbook-FRQ
// additions). Root-level source_label / source_type / textbook_key in the JSON
// override DEFAULT_SOURCE_LABEL when present.
function argValue(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null
}
const JSON_PATH = argValue("--file") ? path.resolve(argValue("--file")) : DEFAULT_JSON_PATH

async function rest(pathWithQuery, { method = "GET", body = null, prefer = null } = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${pathWithQuery}`
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  }
  if (prefer) headers.Prefer = prefer
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text()
  let data
  try { data = text ? JSON.parse(text) : [] } catch { data = text }
  if (!res.ok) throw new Error(`${method} ${pathWithQuery} ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`)
  return data
}

// ── SLO code resolution ───────────────────────────────────────────────────
const sloCache = new Map()
const sloMissing = new Set()
async function resolveSloId(code) {
  if (!code) return null
  if (sloCache.has(code)) return sloCache.get(code)
  // Scope to this framework via lo_id in-subquery: use embedded join filter.
  // sub_learning_objectives has no framework_id, so we pull LOs once and scope.
  const rows = await rest(`sub_learning_objectives?select=id,code,lo_id&or=(code.eq.${encodeURIComponent(code)},id.eq.${encodeURIComponent(code)})&limit=20`)
  // Scope to framework: only keep rows whose lo_id belongs to our framework.
  const scoped = []
  for (const r of rows) {
    if (loFrameworkCache.has(r.lo_id) && loFrameworkCache.get(r.lo_id) === FRAMEWORK_ID) scoped.push(r)
  }
  const pick = scoped.length ? scoped[0] : (rows.length === 1 ? rows[0] : null)
  const id = pick?.id || null
  if (!id) sloMissing.add(code)
  sloCache.set(code, id)
  return id
}

const loFrameworkCache = new Map()
async function loadLoScope() {
  const rows = await rest(`learning_objectives?select=id,framework_id&framework_id=eq.${FRAMEWORK_ID}&limit=10000`)
  for (const r of rows) loFrameworkCache.set(r.id, r.framework_id)
}

// ── qhash (match importer) ────────────────────────────────────────────────
function computeQhash(seed) {
  return crypto.createHash("sha256").update(String(seed || "").trim().toLowerCase()).digest("hex").slice(0, 32)
}

// Pick the question stem text out of ordered_content — first text that is not
// the trailing options block. Matches the importer's expectation that
// question_text is the prompt, not the options.
function extractQuestionText(orderedContent, options) {
  if (!Array.isArray(orderedContent)) return ""
  const optionsBlock = Array.isArray(options) ? options.join("\n").trim() : ""
  for (const item of orderedContent) {
    if (item?.type !== "text") continue
    const val = String(item.value || "").trim()
    if (!val) continue
    if (optionsBlock && val === optionsBlock) continue
    // Heuristic: if the text starts with "(A)" it's the options block.
    if (/^\(A\)/.test(val) && /\n\(B\)/.test(val)) continue
    return val
  }
  return ""
}

// Build normalized ordered_content for persisting. Images keep page+bbox+caption+alt
// so later passes can promote to URLs; no url required to persist.
function normalizeOrderedContent(raw) {
  if (!Array.isArray(raw)) return null
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const type = String(item.type || "").toLowerCase()
    if (type === "text") {
      const value = String(item.value || item.text || "").trim()
      if (!value) continue
      out.push({ type: "text", value })
    } else if (type === "image") {
      const entry = { type: "image" }
      if (item.url) entry.url = String(item.url).trim()
      if (item.page != null) entry.page = item.page
      if (Array.isArray(item.bbox)) entry.bbox = item.bbox
      if (item.caption) entry.caption = String(item.caption).trim()
      if (item.alt) entry.alt = String(item.alt).trim()
      out.push(entry)
    }
  }
  return out.length ? out : null
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const doc = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"))
  if (!Array.isArray(doc?.units)) throw new Error("expected top-level units[]")

  // v2 trees stamp source metadata at the root.
  const SOURCE_LABEL  = doc.source_label  || DEFAULT_SOURCE_LABEL
  const SOURCE_TYPE   = doc.source_type   || null
  const TEXTBOOK_KEY  = doc.textbook_key  || null
  console.log(`reading ${JSON_PATH}`)
  console.log(`source_label = ${SOURCE_LABEL}`)
  if (TEXTBOOK_KEY) console.log(`textbook_key = ${TEXTBOOK_KEY}`)

  await loadLoScope()
  console.log(`loaded ${loFrameworkCache.size} LOs for framework ${FRAMEWORK_ID}`)

  const stats = { qtCreated: 0, qtUpdated: 0, qCreated: 0, qSkipped: 0, qFlags: [] }

  for (const unit of doc.units) {
    const unitLabel = String(unit.label || "").trim()
    for (const qt of unit.question_types || []) {
      const title = String(qt.label || qt.title || "").trim()
      if (!title) { console.warn("skip QT with no title"); continue }

      const primaryCode       = qt.primary_slo || null
      const alignedCodes      = Array.isArray(qt.aligned_slos) ? qt.aligned_slos : []
      const reinforcementRaw  = Array.isArray(qt.reinforcement_slos) ? qt.reinforcement_slos : []
      const sloWeights        = Array.isArray(qt.slo_weights) ? qt.slo_weights : []

      const primarySloId = await resolveSloId(primaryCode)
      const alignedSloIds = []
      for (const c of alignedCodes) {
        const id = await resolveSloId(c)
        if (id) alignedSloIds.push(id)
      }
      const reinforcementSlos = []
      for (const r of reinforcementRaw) {
        const code = typeof r === "string" ? r : r?.slo
        const weight = typeof r === "object" && r?.weight != null ? Number(r.weight) : null
        const id = await resolveSloId(code)
        if (id) reinforcementSlos.push(weight != null ? { slo_id: id, code, weight } : { slo_id: id, code })
      }

      const qtRow = {
        content_bank_id:    CONTENT_BANK_ID,
        title,
        unit_label:         unitLabel,
        primary_slo_id:     primarySloId,
        aligned_slo_ids:    alignedSloIds,
        reinforcement_slos: reinforcementSlos,
        source_label:       SOURCE_LABEL,
        source_reference:   {
          unit:          unit.id || null,
          section_ref:   qt.section_ref || null,
          notes:         qt.notes || null,
          source_type:   SOURCE_TYPE,
          textbook_key:  TEXTBOOK_KEY,
        },
        lo_confidence:      qt.lo_confidence || null,
        status:             "active",
        metadata:           { slo_weights: sloWeights },
      }

      // Upsert by (content_bank_id, title).
      const existing = await rest(`question_types?select=id&content_bank_id=eq.${CONTENT_BANK_ID}&title=eq.${encodeURIComponent(title)}&limit=1`)
      let qtId
      if (existing.length) {
        qtId = existing[0].id
        if (!DRY_RUN) {
          await rest(`question_types?id=eq.${qtId}`, { method: "PATCH", body: { ...qtRow, updated_at: new Date().toISOString() }, prefer: "return=minimal" })
        }
        stats.qtUpdated++
      } else {
        if (DRY_RUN) {
          qtId = `dry-${title}`
        } else {
          const created = await rest(`question_types`, { method: "POST", body: qtRow, prefer: "return=representation" })
          qtId = Array.isArray(created) ? created[0]?.id : created?.id
        }
        stats.qtCreated++
      }
      console.log(`  QT ${qtId?.toString().slice(0, 8)}  ${title}`)

      // Expand questions: shared_stimulus_set → children with stem_group_id.
      //
      // Singleton-master shape: ONE child per group owns the stem header
      // (the first one — lowest ordinal). Other children carry
      // stem_header_content = null and inherit the figure at fetch time
      // via stem_group_id (see lib/db.js:getQuestionPool). Children's
      // question_content is *just* their own prompt+options — we do NOT
      // prepend the stem header onto each child anymore (that used to
      // create duplicate figures showing twice in the student UI and
      // stacked bboxes in the Sources tab).
      const flatQs = []
      for (const q of qt.questions || []) {
        if (q.kind === "shared_stimulus_set" && Array.isArray(q.children)) {
          const stemGroupId = crypto.randomUUID()
          const stemHeader = normalizeOrderedContent(q.stem_header_content)
          const stemText = stemHeader ? stemHeader.filter(x => x.type === "text").map(x => x.value).join(" ") : ""
          for (let childIdx = 0; childIdx < q.children.length; childIdx++) {
            const child = q.children[childIdx]
            const childOC = normalizeOrderedContent(child.ordered_content)
            const isMaster = childIdx === 0
            flatQs.push({
              ...child,
              ordered_content:     childOC || [],
              stem_group_id:       stemGroupId,
              is_stem_child:       true,
              // Only the master keeps the stem header; non-masters get null.
              stem_header_content: isMaster ? stemHeader : null,
              stem_source_text:    stemText,
              stem_child_label:    String(child.label || child.id || ""),
            })
          }
        } else {
          flatQs.push({ ...q, ordered_content: normalizeOrderedContent(q.ordered_content) })
        }
      }

      for (let ordinal = 0; ordinal < flatQs.length; ordinal++) {
        const q = flatQs[ordinal]
        const questionText = extractQuestionText(q.ordered_content, q.options)
        if (!questionText) {
          stats.qSkipped++
          stats.qFlags.push({ qt: title, id: q.id, reason: "no question_text" })
          continue
        }
        const qhashSeed = q.is_stem_child
          ? `${q.stem_source_text || ""}\x00${q.stem_child_label || ordinal}\x00${questionText}`
          : questionText
        const qhash = computeQhash(qhashSeed)

        // SLO rollup: question overrides QT if present, else inherit QT.
        const qPrimary = q.primary_slo || primaryCode
        const qPrimaryId = qPrimary === primaryCode ? primarySloId : await resolveSloId(qPrimary)
        const qAlignedCodes = Array.isArray(q.aligned_slos) && q.aligned_slos.length ? q.aligned_slos : alignedCodes
        const qAlignedIds = []
        if (qAlignedCodes === alignedCodes) qAlignedIds.push(...alignedSloIds)
        else for (const c of qAlignedCodes) { const id = await resolveSloId(c); if (id) qAlignedIds.push(id) }
        const qReinforcement = Array.isArray(q.reinforcement_slos) && q.reinforcement_slos.length
          ? await Promise.all(q.reinforcement_slos.map(async (r) => {
              const code = typeof r === "string" ? r : r?.slo
              const weight = typeof r === "object" && r?.weight != null ? Number(r.weight) : null
              const id = await resolveSloId(code)
              return id ? (weight != null ? { slo_id: id, code, weight } : { slo_id: id, code }) : null
            })).then(a => a.filter(Boolean))
          : reinforcementSlos

        const qRow = {
          question_type_id:     qtId,
          qhash,
          ordinal,
          question_format:      q.question_format || "mcq",
          question_text:        questionText,
          options:              Array.isArray(q.options) ? q.options : [],
          correct_option:       q.correct_option || null,
          explanation:          q.explanation || null,
          primary_slo_id:       qPrimaryId,
          aligned_slo_ids:      qAlignedIds,
          reinforcement_slos:   qReinforcement,
          question_content:     q.ordered_content || null,
          stem_group_id:        q.stem_group_id || null,
          is_stem_child:        Boolean(q.is_stem_child),
          stem_header_content:  q.stem_header_content || null,
          metadata:             {
            source_id:        q.id || null,
            label:            q.label || null,
            source_reference: q.source_reference || null,
            textbook_key:     q.source_reference?.textbook_key || TEXTBOOK_KEY || null,
          },
        }

        if (DRY_RUN) {
          stats.qCreated++
          continue
        }

        const existingQ = await rest(`questions?select=id&qhash=eq.${qhash}&limit=1`)
        if (existingQ.length) {
          await rest(`questions?id=eq.${existingQ[0].id}`, { method: "PATCH", body: qRow, prefer: "return=minimal" })
        } else {
          await rest(`questions`, { method: "POST", body: qRow, prefer: "return=minimal" })
        }
        stats.qCreated++
      }
    }
  }

  console.log("\n=== summary ===")
  console.log(`QTs created: ${stats.qtCreated}   updated: ${stats.qtUpdated}`)
  console.log(`questions written: ${stats.qCreated}   skipped: ${stats.qSkipped}`)
  if (sloMissing.size) console.log(`UNRESOLVED SLO codes: ${[...sloMissing].join(", ")}`)
  if (stats.qFlags.length) {
    console.log(`flagged questions (${stats.qFlags.length}):`)
    for (const f of stats.qFlags) console.log(`  - ${f.qt} / ${f.id}: ${f.reason}`)
  }
  if (DRY_RUN) console.log("(DRY RUN — no writes performed)")
}

main().catch(e => { console.error("FAILED:", e.message); process.exit(1) })
