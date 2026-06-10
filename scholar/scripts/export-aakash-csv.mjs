// Exhaustive Aakash export → CSV.
//
// Sources of truth (from Supabase):
//   - student_question_attempts  per-attempt log (mode/result/timestamp)
//   - student_question_types     per-(student,QT) mastery state
//                                  (mastery_events, correct_question_keys,
//                                   daily_seen_dates, daily_wrong_dates,
//                                   weakness_score)
//   - questions / question_types / sub_learning_objectives /
//     learning_objectives / school_sections / school_units / subjects
//
// One CSV row per question Aakash has interacted with. A "question Aakash has
// interacted with" = any qhash that appears in attempts.question_key OR in
// SQT.correct_question_keys OR in any SQT.mastery_events[].questionKey.
//
// Mastery is per-QT (not per-question); each row carries the QT-level
// mastery snapshot it belongs to. Both the displayed mastery (with the
// MASTERY_DECAY_BYPASS=true override that lib/db.js currently applies) and
// the raw retention number are emitted.

import fs from "node:fs"
import path from "node:path"

const STUDENT_ID = "2e1ea9b0-c9ef-80f6-8779-d6e28eeea1e9"
const OUT_PATH = path.resolve("scripts/aakash-export.csv")

// --- env load -----------------------------------------------------------
const envText = fs.readFileSync(path.resolve(".env.local"), "utf8")
const ENV = {}
for (const line of envText.split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m) ENV[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const SUPABASE_URL = ENV.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")
const SUPABASE_KEY = ENV.SUPABASE_SECRET_KEY

// --- mastery model (mirrors lib/db.js) ----------------------------------
const MASTERY_DECAY_BYPASS = true   // lib/db.js:23 — currently true

function computeMastery(events, nowMs = Date.now()) {
  const successes = (events || [])
    .map((ev) => ({
      ev,
      at: Date.parse(ev?.occurredAt || ev?.occurred_at || ev?.date),
    }))
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at)
  if (!successes.length) {
    return { reviewCount: 0, halfLifeDays: 0, retention: 0, displayed: 0, latestAt: null }
  }
  const reviewCount = successes.length
  const latestAt = successes[successes.length - 1].at
  const halfLifeDays = 3 * Math.pow(2, Math.max(0, reviewCount - 1))
  const ageDays = Math.max(0, (nowMs - latestAt) / 86400000)
  const retention = Math.max(0, Math.min(1, Math.pow(0.5, ageDays / halfLifeDays)))
  return {
    reviewCount,
    halfLifeDays,
    retention,
    displayed: MASTERY_DECAY_BYPASS ? 1 : retention,
    latestAt,
  }
}

// --- supabase REST helpers ----------------------------------------------
async function rest(table, query) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v)
  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  })
  if (!r.ok) {
    const t = await r.text()
    throw new Error(`${table} ${r.status}: ${t}`)
  }
  return r.json()
}

// Supabase URL filters can blow past the Postgres URL limit; chunk in.() lists.
async function selectIn(table, column, values, select, extra = {}) {
  const out = []
  const arr = [...new Set(values.filter(Boolean))]
  const CHUNK = 80
  for (let i = 0; i < arr.length; i += CHUNK) {
    const slice = arr.slice(i, i + CHUNK)
    const quoted = slice.map((v) => `"${String(v).replace(/"/g, '\\"')}"`).join(",")
    const rows = await rest(table, {
      select,
      [column]: `in.(${quoted})`,
      ...extra,
    })
    out.push(...rows)
  }
  return out
}

// --- main ---------------------------------------------------------------
console.log("Fetching student…")
const students = await rest("students", {
  id: `eq.${STUDENT_ID}`,
  select: "id,full_name,email,timezone",
})
const student = students[0]
if (!student) throw new Error("Aakash not found")
console.log(`  ${student.full_name} <${student.email}>  tz=${student.timezone}`)

console.log("Fetching attempts…")
const attempts = await rest("student_question_attempts", {
  student_id: `eq.${STUDENT_ID}`,
  select:
    "id,question_key,question_type_id,subject_id,mode,result,flag_reason,review_status,score_row_id,scratch_image_url,admin_verdict,score,graded_by,graded_at,created_at",
  order: "created_at.asc",
})
console.log(`  ${attempts.length} attempt rows`)

console.log("Fetching student_question_types…")
const sqts = await rest("student_question_types", {
  student_id: `eq.${STUDENT_ID}`,
  select: "*",
  order: "updated_at.desc",
})
console.log(`  ${sqts.length} SQT rows`)

// "Touched" = any qhash in attempts, correct_question_keys, or mastery_events.
const touchedKeys = new Set()
for (const a of attempts) if (a.question_key) touchedKeys.add(a.question_key)
for (const s of sqts) {
  for (const k of s.correct_question_keys || []) touchedKeys.add(k)
  for (const ev of s.mastery_events || []) if (ev?.questionKey) touchedKeys.add(ev.questionKey)
}
console.log(`  ${touchedKeys.size} unique question keys touched`)

const subjectIds = [...new Set(sqts.map((s) => s.subject_id))]
const qtIds = [...new Set(sqts.map((s) => s.question_type_id))]

console.log("Fetching subjects…")
const subjects = await selectIn("subjects", "id", subjectIds, "id,name,content_bank_id")

console.log("Fetching question_types…")
const qts = await selectIn(
  "question_types",
  "id",
  qtIds,
  "id,content_bank_id,school_section_id,title,unit_label,primary_slo_id,aligned_slo_ids,reinforcement_slos,source_label,status"
)

// Fetch every question in every QT he is enrolled in — including ones he
// has never seen, so the CSV covers untouched + weak items, not just
// touched ones.
console.log("Fetching ALL questions in enrolled QTs…")
const questions = await selectIn(
  "questions",
  "question_type_id",
  qtIds,
  "id,qhash,question_type_id,question_format,question_text,answer_text,options,correct_option,explanation,primary_slo_id,aligned_slo_ids,source_file,source_page,source_reference,ordinal"
)
console.log(`  ${questions.length} total questions in his enrolled QTs`)
const touchedResolved = questions.filter((q) => touchedKeys.has(q.qhash)).length
console.log(`  ${touchedResolved}/${touchedKeys.size} touched qhashes resolved`)
// Surface any touched key whose question row is missing — would mean
// the question was deleted or qhash drifted.
const orphanTouched = [...touchedKeys].filter(
  (k) => !questions.some((q) => q.qhash === k)
)
if (orphanTouched.length) {
  console.log(`  WARN: ${orphanTouched.length} touched keys with no question row`)
}

const sectionIds = [
  ...new Set(qts.map((q) => q.school_section_id).filter(Boolean)),
]
console.log("Fetching school_sections…")
const sections = sectionIds.length
  ? await selectIn(
      "school_sections",
      "id",
      sectionIds,
      "id,unit_id,section_key,section_label,section_title,sequence_index"
    )
  : []

const unitIds = [...new Set(sections.map((s) => s.unit_id).filter(Boolean))]
console.log("Fetching school_units…")
const units = unitIds.length
  ? await selectIn(
      "school_units",
      "id",
      unitIds,
      "id,unit_key,unit_name,sequence_index,overlay_id"
    )
  : []

// SLO/LO collection — from QTs, questions, and reinforcement.
const sloIds = new Set()
const collectSlos = (obj) => {
  if (obj?.primary_slo_id) sloIds.add(obj.primary_slo_id)
  for (const id of obj?.aligned_slo_ids || []) sloIds.add(id)
  for (const r of obj?.reinforcement_slos || []) {
    if (r?.slo_id) sloIds.add(r.slo_id)
  }
}
qts.forEach(collectSlos)
questions.forEach(collectSlos)

console.log("Fetching sub_learning_objectives…")
const slos = sloIds.size
  ? await selectIn(
      "sub_learning_objectives",
      "id",
      [...sloIds],
      "id,lo_id,code,text,sequence_index"
    )
  : []

const loIds = [...new Set(slos.map((s) => s.lo_id).filter(Boolean))]
console.log("Fetching learning_objectives…")
const los = loIds.length
  ? await selectIn(
      "learning_objectives",
      "id",
      loIds,
      "id,code,name,framework_id,sequence_index"
    )
  : []

// --- index lookups ------------------------------------------------------
const subjectById = new Map(subjects.map((s) => [s.id, s]))
const qtById = new Map(qts.map((q) => [q.id, q]))
const sectionById = new Map(sections.map((s) => [s.id, s]))
const unitById = new Map(units.map((u) => [u.id, u]))
const sloById = new Map(slos.map((s) => [s.id, s]))
const loById = new Map(los.map((l) => [l.id, l]))
const sqtByQtId = new Map(sqts.map((s) => [s.question_type_id, s]))

const attemptsByKey = new Map()
for (const a of attempts) {
  if (!attemptsByKey.has(a.question_key)) attemptsByKey.set(a.question_key, [])
  attemptsByKey.get(a.question_key).push(a)
}

// --- per-QT mastery snapshot --------------------------------------------
const now = Date.now()
const masteryByQt = new Map()
for (const s of sqts) {
  masteryByQt.set(s.question_type_id, computeMastery(s.mastery_events, now))
}

// --- helpers for joining SLOs/LOs ---------------------------------------
const sloDisplay = (id) => {
  const s = sloById.get(id)
  if (!s) return id ? `${id}` : ""
  return s.code || s.id
}
const sloText = (id) => sloById.get(id)?.text || ""
const loDisplay = (sloId) => {
  const slo = sloById.get(sloId)
  if (!slo) return ""
  const lo = loById.get(slo.lo_id)
  if (!lo) return slo.lo_id || ""
  return lo.code || lo.id
}
const loName = (sloId) => {
  const slo = sloById.get(sloId)
  if (!slo) return ""
  return loById.get(slo.lo_id)?.name || ""
}

// --- build rows ---------------------------------------------------------
// Iterate over EVERY question in his enrolled QTs (touched or not).
// Plus emit any orphan touched-keys whose question row is missing.
const rowSource = [
  ...questions.map((q) => ({ q, key: q.qhash })),
  ...orphanTouched.map((k) => ({ q: null, key: k })),
]

const rows = []
for (const { q, key } of rowSource) {
  const qtId =
    q?.question_type_id ||
    attemptsByKey.get(key)?.[0]?.question_type_id ||
    null
  let sqt = qtId ? sqtByQtId.get(qtId) : null
  if (!sqt) {
    for (const s of sqts) {
      if ((s.correct_question_keys || []).includes(key)) {
        sqt = s
        break
      }
      if ((s.mastery_events || []).some((ev) => ev?.questionKey === key)) {
        sqt = s
        break
      }
    }
  }
  const qt = qtId ? qtById.get(qtId) : (sqt ? qtById.get(sqt.question_type_id) : null)
  const subj = subjectById.get(sqt?.subject_id) || null
  const section = qt?.school_section_id ? sectionById.get(qt.school_section_id) : null
  const unit = section?.unit_id ? unitById.get(section.unit_id) : null
  const mastery = sqt ? masteryByQt.get(sqt.question_type_id) : null

  const attemptsForKey = (attemptsByKey.get(key) || []).slice().sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
  )
  const masteryEventsForKey = (sqt?.mastery_events || []).filter(
    (ev) => ev?.questionKey === key
  )

  // Categorize the row's interaction state.
  const inCorrect = (sqt?.correct_question_keys || []).includes(key)
  const evCount = masteryEventsForKey.length
  const attCount = attemptsForKey.length
  const wrongCount = attemptsForKey.filter((a) => a.result === "wrong").length
  let interactionState = "untouched"
  if (attCount === 0 && evCount === 0 && !inCorrect) {
    interactionState = "untouched"
  } else if (evCount >= 2 || (inCorrect && evCount >= 2)) {
    interactionState = "reinforced"
  } else if (inCorrect || evCount >= 1) {
    interactionState = "correct_once"
  } else if (wrongCount > 0) {
    interactionState = "wrong_only"
  } else {
    interactionState = "attempted"
  }

  rows.push({
    interaction_state: interactionState,
    student_id: STUDENT_ID,
    student_name: student.full_name,
    student_email: student.email,
    subject_id: sqt?.subject_id || "",
    subject_name: subj?.name || "",
    qt_id: qt?.id || sqt?.question_type_id || "",
    qt_title: qt?.title || "",
    qt_unit_label: sqt?.unit_label || qt?.unit_label || "",
    qt_status: qt?.status || "",
    qt_source_label: qt?.source_label || "",
    qt_school_section_id: qt?.school_section_id || "",
    qt_school_section_label: section?.section_label || "",
    qt_school_section_title: section?.section_title || "",
    qt_school_unit_name: unit?.unit_name || "",
    qt_school_unit_key: unit?.unit_key || "",
    qt_section_sequence_index: section?.sequence_index ?? "",
    qt_unit_sequence_index: unit?.sequence_index ?? "",
    qt_primary_slo_id: qt?.primary_slo_id || sqt?.primary_slo_id || "",
    qt_primary_slo_code: sloDisplay(qt?.primary_slo_id || sqt?.primary_slo_id),
    qt_primary_slo_text: sloText(qt?.primary_slo_id || sqt?.primary_slo_id),
    qt_primary_lo_code: loDisplay(qt?.primary_slo_id || sqt?.primary_slo_id),
    qt_primary_lo_name: loName(qt?.primary_slo_id || sqt?.primary_slo_id),
    qt_aligned_slo_codes: (qt?.aligned_slo_ids || []).map(sloDisplay).join(" | "),
    qt_aligned_slo_texts: (qt?.aligned_slo_ids || []).map(sloText).join(" | "),
    qt_reinforcement_slos: (qt?.reinforcement_slos || [])
      .map((r) => `${sloDisplay(r?.slo_id)}@${r?.weight ?? ""}`)
      .join(" | "),
    qt_date_introduced: sqt?.date_introduced || "",
    qt_weakness_score: sqt?.weakness_score ?? "",
    qt_correct_keys_count: (sqt?.correct_question_keys || []).length,
    qt_daily_seen_dates: (sqt?.daily_seen_dates || []).join(" | "),
    qt_daily_wrong_dates: (sqt?.daily_wrong_dates || []).join(" | "),
    qt_mastery_events_count: (sqt?.mastery_events || []).length,
    qt_mastery_review_count: mastery?.reviewCount ?? 0,
    qt_mastery_half_life_days: mastery?.halfLifeDays ?? 0,
    qt_mastery_retention_raw: mastery
      ? Math.round(mastery.retention * 1000) / 1000
      : 0,
    qt_mastery_displayed: mastery
      ? Math.round(mastery.displayed * 1000) / 1000
      : 0,
    qt_mastery_decay_bypass_active: MASTERY_DECAY_BYPASS,
    qt_mastery_latest_event_at: mastery?.latestAt
      ? new Date(mastery.latestAt).toISOString()
      : "",
    question_id: q?.id || "",
    question_qhash: key,
    question_format: q?.question_format || "",
    question_text: q?.question_text || "",
    question_options: Array.isArray(q?.options)
      ? q.options
          .map((o) =>
            typeof o === "string"
              ? o
              : o?.text || o?.label || JSON.stringify(o)
          )
          .join(" | ")
      : "",
    question_correct_option: q?.correct_option || "",
    question_answer_text: q?.answer_text || "",
    question_explanation: q?.explanation || "",
    question_primary_slo_code: sloDisplay(q?.primary_slo_id),
    question_aligned_slo_codes: (q?.aligned_slo_ids || []).map(sloDisplay).join(" | "),
    question_source_file: q?.source_file || "",
    question_source_page: q?.source_page ?? "",
    question_source_reference: q?.source_reference || "",
    question_in_correct_keys: (sqt?.correct_question_keys || []).includes(key)
      ? "yes"
      : "no",
    attempts_count: attemptsForKey.length,
    attempts_modes: attemptsForKey.map((a) => a.mode).join(" | "),
    attempts_results: attemptsForKey.map((a) => a.result || "").join(" | "),
    attempts_flag_reasons: attemptsForKey
      .map((a) => a.flag_reason || "")
      .join(" | "),
    attempts_review_statuses: attemptsForKey
      .map((a) => a.review_status || "")
      .join(" | "),
    attempts_admin_verdicts: attemptsForKey
      .map((a) => a.admin_verdict || "")
      .join(" | "),
    attempts_scores: attemptsForKey.map((a) => a.score ?? "").join(" | "),
    attempts_timestamps: attemptsForKey.map((a) => a.created_at).join(" | "),
    mastery_events_for_question_count: masteryEventsForKey.length,
    mastery_events_for_question_sources: masteryEventsForKey
      .map((e) => e.source || "")
      .join(" | "),
    mastery_events_for_question_dates: masteryEventsForKey
      .map((e) => e.occurredAt || e.date || "")
      .join(" | "),
  })
}

// Sort: by qt sequence then question_qhash for determinism.
rows.sort((a, b) => {
  const ax = `${a.qt_unit_sequence_index ?? ""}|${a.qt_section_sequence_index ?? ""}|${a.qt_title}|${a.question_qhash}`
  const bx = `${b.qt_unit_sequence_index ?? ""}|${b.qt_section_sequence_index ?? ""}|${b.qt_title}|${b.question_qhash}`
  return ax < bx ? -1 : ax > bx ? 1 : 0
})

// --- CSV write ----------------------------------------------------------
function csvCell(v) {
  if (v == null) return ""
  let s = String(v)
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}
const headers = Object.keys(rows[0] || {})
const csv = [
  headers.join(","),
  ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(",")),
].join("\n")

fs.writeFileSync(OUT_PATH, csv)
console.log(`\nWrote ${rows.length} rows → ${OUT_PATH}`)
console.log(`Columns: ${headers.length}`)

// Quick sanity tail.
console.log("\nUnique QTs touched:", new Set(rows.map((r) => r.qt_id)).size)
console.log("Questions resolved:", rows.filter((r) => r.question_id).length)
console.log("Questions unresolved:", rows.filter((r) => !r.question_id).length)
console.log("Total attempts logged:", rows.reduce((n, r) => n + r.attempts_count, 0))
console.log("Total mastery events:", rows.reduce((n, r) => n + r.mastery_events_for_question_count, 0))
