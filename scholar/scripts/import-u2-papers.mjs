// Import u2 questions from scripts/cache/u2-papers-manifest.json into Supabase.
//
// 1. Insert any new question_types (with primary_slo_id, source_reference,
//    unit_label, status="active", school_section_id=null).
// 2. For each manifest question, INSERT a row into `questions` with:
//      qhash       = sha256(question_text.trim().toLowerCase()).slice(0,32)
//      ordinal     = (max existing in QT) + 1, incremented per insert
//      question_content = [optional image item, text stem, options text]
//      stem groups linked via stem_group_id (parent's UUID)
//      source_reference (text JSONB-cast on import) carrying worksheet/textbook/page/section/exercise_ref
//
// We DO NOT crop figures or upload to R2. Image items carry only
// {type, page, bbox, alt, caption} — user reviews before hydrating.
//
// Idempotent: if a row with the computed qhash already exists, we skip.
// Pass --apply to actually write; default is dry-run.

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

const APPLY = process.argv.includes("--apply")

const envText = fs.readFileSync(path.resolve(".env.local"), "utf8")
for (const line of envText.split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY

async function rest(method, p, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "GET" ? "" : "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const txt = await r.text()
  if (!r.ok) throw new Error(`${method} ${p} ${r.status}: ${txt}`)
  return txt ? JSON.parse(txt) : null
}

const FRAMEWORK_ID = "434e067c-f50a-4dc1-a826-897fc32d4292"
const BANK_ID = (await rest("GET", `content_banks?select=id&framework_id=eq.${FRAMEWORK_ID}`))[0].id

const manifest = JSON.parse(fs.readFileSync("scripts/cache/u2-papers-manifest.json", "utf8"))
console.log(`Manifest: ${manifest.questions.length} questions, ${manifest.new_qts.length} new QTs. Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`)

// Sanitizer: stem-group members must share a QT. Use majority vote across
// parent+children; parent's choice breaks ties.
{
  const groups = new Map()
  for (const q of manifest.questions) {
    if (!q.stem_group_key) continue
    if (!groups.has(q.stem_group_key)) groups.set(q.stem_group_key, [])
    groups.get(q.stem_group_key).push(q)
  }
  for (const [key, members] of groups) {
    const counts = new Map()
    for (const q of members) counts.set(q.qt_target, (counts.get(q.qt_target) || 0) + 1)
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
    let canonical = sorted[0][0]
    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) {
      const parent = members.find(q => q.kind === "shared_stimulus_set_parent")
      if (parent) canonical = parent.qt_target
    }
    for (const q of members) {
      if (q.qt_target !== canonical) {
        console.log(`  override ${key} ${q.source_file}/${q.exercise_ref}: ${q.qt_target.slice(0,8)} → ${canonical.slice(0,8)}`)
        q.qt_target = canonical
      }
    }
  }
}

function qhashOf(text) {
  return crypto.createHash("sha256").update(String(text || "").trim().toLowerCase()).digest("hex").slice(0, 32)
}

function yearOfFile(file) {
  const m = file.match(/(\d{4})\.pdf$/)
  return m ? Number(m[1]) : 0
}
function srcRefBase(file) {
  const yr = yearOfFile(file)
  return {
    worksheet_name: `AP Physics 1 ${yr} Released Exam`,
    textbook_key: `ap_phys1_released_${yr}`,
  }
}
function relPath(file) {
  return `AP Physics 1_ Algebra Based/${file}`
}

// ── 1. Resolve / create new QTs ────────────────────────────────────────────
const tmpToUuid = {}
for (const nqt of manifest.new_qts) {
  // Check if a QT with this title already exists (idempotency).
  const existing = await rest("GET", `question_types?select=id&content_bank_id=eq.${BANK_ID}&title=eq.${encodeURIComponent(nqt.title)}`)
  if (existing.length) {
    tmpToUuid[nqt.tmp_id] = existing[0].id
    console.log(`  reuse new QT ${nqt.tmp_id} → ${existing[0].id} ("${nqt.title}")`)
    continue
  }
  const row = {
    content_bank_id: BANK_ID,
    title: nqt.title,
    primary_slo_id: nqt.primary_slo,
    aligned_slo_ids: [],
    reinforcement_slos: [],
    school_section_id: null,
    source_reference: {
      unit: "u2",
      section_ref: nqt.section_ref,
      notes: nqt.rationale || "",
    },
    status: "active",
    unit_label: "Unit 2: Force and Translational Dynamics",
  }
  console.log(`  CREATE new QT "${nqt.title}" (slo=${nqt.primary_slo}, sec=${nqt.section_ref})`)
  if (APPLY) {
    const ins = await rest("POST", "question_types", row)
    tmpToUuid[nqt.tmp_id] = ins[0].id
  } else {
    tmpToUuid[nqt.tmp_id] = `(dry-run-${nqt.tmp_id})`
  }
}

// ── 2. Build per-QT ordinal counters ───────────────────────────────────────
const allTargets = [...new Set(manifest.questions.map(q => q.qt_target))]
const ordinalNext = new Map()
for (const t of allTargets) {
  const id = t.startsWith("new") ? tmpToUuid[t] : t
  if (!APPLY && id?.startsWith?.("(dry-run")) { ordinalNext.set(t, 1); continue }
  const rows = await rest("GET", `questions?select=ordinal&question_type_id=eq.${id}&order=ordinal.desc&limit=1`)
  ordinalNext.set(t, (rows[0]?.ordinal || 0) + 1)
}

// ── 3. Insert questions ────────────────────────────────────────────────────
let inserted = 0, skippedExisting = 0, errors = 0
const stemGroupParentUuid = new Map()  // tmp stem_group_key → real parent question UUID (after parent insert)

// Sort: parents before children of the same group, then by source/page/exercise.
const ordered = [...manifest.questions].sort((a, b) => {
  // Parents first within a group
  const grpA = a.stem_group_key || ""
  const grpB = b.stem_group_key || ""
  if (grpA && grpA === grpB) {
    if (a.kind === "shared_stimulus_set_parent") return -1
    if (b.kind === "shared_stimulus_set_parent") return 1
  }
  return `${a.source_file}|${String(a.source_page).padStart(4,"0")}|${a.exercise_ref}`.localeCompare(
         `${b.source_file}|${String(b.source_page).padStart(4,"0")}|${b.exercise_ref}`)
})

for (const q of ordered) {
  const qtUuid = q.qt_target.startsWith("new") ? tmpToUuid[q.qt_target] : q.qt_target
  if (!qtUuid || (typeof qtUuid === "string" && qtUuid.startsWith("(dry-run") && APPLY)) {
    console.log(`  ERROR: no qt UUID for ${q.qt_target}`); errors++; continue
  }

  // Build question_content
  const content = []
  if (q.image && q.kind !== "shared_stimulus_set_parent") {
    content.push({ type: "image", page: q.image.page, bbox: q.image.bbox, alt: q.image.alt || "", caption: q.image.caption || "" })
  }
  content.push({ type: "text", value: q.stem_text })
  if (q.question_format === "mcq" && Array.isArray(q.options) && q.options.length) {
    content.push({ type: "text", value: q.options.join("\n") })
  }

  // For shared_stimulus_set_parent: stem_header_content holds shared figure + intro
  let stemHeader = null
  if (q.kind === "shared_stimulus_set_parent") {
    stemHeader = []
    if (q.image) stemHeader.push({ type: "image", page: q.image.page, bbox: q.image.bbox, alt: q.image.alt || "", caption: q.image.caption || "" })
    stemHeader.push({ type: "text", value: q.stem_text })
  }

  const qhash = qhashOf(q.stem_text + (q.kind === "shared_stimulus_set_child" ? `|${q.exercise_ref}` : ""))

  // Idempotency: skip if exact qhash exists in this QT.
  const existing = (typeof qtUuid === "string" && qtUuid.startsWith("(dry-run"))
    ? []
    : await rest("GET", `questions?select=id,ordinal&qhash=eq.${qhash}&question_type_id=eq.${qtUuid}`)
  if (existing.length) {
    skippedExisting++
    if (q.kind === "shared_stimulus_set_parent") stemGroupParentUuid.set(q.stem_group_key, existing[0].id)
    console.log(`  SKIP existing qhash ${qhash} ${q.source_file}/${q.exercise_ref}`)
    continue
  }

  // For child: stem_group_id = parent's UUID (must have been inserted first)
  let stemGroupId = null
  if (q.kind === "shared_stimulus_set_child") {
    stemGroupId = stemGroupParentUuid.get(q.stem_group_key)
    if (!stemGroupId && APPLY) {
      console.log(`  ERROR child without parent uuid: ${q.source_file}/${q.exercise_ref} (key=${q.stem_group_key})`); errors++; continue
    }
  }

  const yr = yearOfFile(q.source_file)
  const sectionRef = (manifest.new_qts.find(n=>n.tmp_id===q.qt_target)?.section_ref)
                  || (await rest("GET", `question_types?select=source_reference&id=eq.${qtUuid}`))[0]?.source_reference?.section_ref
                  || ""

  const row = {
    question_type_id: qtUuid,
    qhash,
    ordinal: ordinalNext.get(q.qt_target),
    question_format: q.question_format || "mcq",
    question_text: q.stem_text,
    options: Array.isArray(q.options) ? q.options : [],
    correct_option: q.correct_option || null,
    primary_slo_id: null,  // mirror the question_types row's primary if needed; we'll let the per-row defaults stay null and rely on QT-level
    aligned_slo_ids: [],
    reinforcement_slos: [],
    source_file: relPath(q.source_file),
    source_page: q.source_page,
    source_reference: {
      ...srcRefBase(q.source_file),
      page: q.source_page,
      section: sectionRef,
      exercise_ref: q.exercise_ref,
    },
    metadata: {
      label: q.exercise_ref,
      source_id: `ap_p1_${yr}_q${String(q.exercise_ref).replace(/\s+/g,"_")}`,
    },
    stem_group_id: stemGroupId,
    is_stem_child: q.kind === "shared_stimulus_set_child",
    stem_header_content: stemHeader,
    question_content: content,
  }
  ordinalNext.set(q.qt_target, ordinalNext.get(q.qt_target) + 1)

  if (APPLY) {
    try {
      const ins = await rest("POST", "questions", row)
      const newUuid = ins[0].id
      if (q.kind === "shared_stimulus_set_parent") stemGroupParentUuid.set(q.stem_group_key, newUuid)
      inserted++
      if (inserted % 10 === 0) console.log(`  ... ${inserted} inserted`)
    } catch (e) { console.log(`  ERROR insert ${q.source_file}/${q.exercise_ref}: ${e.message.slice(0,200)}`); errors++ }
  } else {
    console.log(`  WOULD INSERT ${q.source_file}/${q.exercise_ref} → qt=${qtUuid?.slice?.(0,8)} qhash=${qhash} kind=${q.kind}`)
    if (q.kind === "shared_stimulus_set_parent") stemGroupParentUuid.set(q.stem_group_key, `(parent-${qhash.slice(0,6)})`)
    inserted++
  }
}

console.log(`\nDone. inserted=${inserted}, skipped_existing=${skippedExisting}, errors=${errors}`)
console.log(APPLY ? "" : "(dry-run — pass --apply to write)")
