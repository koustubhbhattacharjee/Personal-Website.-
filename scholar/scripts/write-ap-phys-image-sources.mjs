// Targeted second pass — apply source attributions discovered visually from
// the screenshots in data/AP Physics 1/images/.
//
// Two kinds of update:
//   1) `unmatch_*`     — clear a stale/false-positive match found in the audit.
//   2) `match_*`       — assign a screenshot + AP P2 FRQ provenance to an
//                        unmatched DB row whose stem I confirmed in the image.
//
// Pass --apply to write; default is dry-run.

import fs from "node:fs"
import path from "node:path"

const APPLY = process.argv.includes("--apply")

const envText = fs.readFileSync(path.resolve(".env.local"), "utf8")
const ENV = {}
for (const line of envText.split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m) ENV[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const SUPABASE_URL = ENV.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")
const SUPABASE_KEY = ENV.SUPABASE_SECRET_KEY

async function rest(method, path_, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path_}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "GET" ? "count=exact" : "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`${method} ${path_} ${r.status}: ${await r.text()}`)
  if (method === "GET") return r.json()
}

// Find rows by metadata.source_id.
async function findBySourceId(sid) {
  return await rest("GET", `questions?select=id,metadata,source_reference,source_file&metadata->>source_id=eq.${encodeURIComponent(sid)}`)
}

const IMAGE_DIR_PREFIX = "images/"

// Source attributions discovered in image catalog.
const ASSIGN = [
  // 2017 AP Physics 2 Q1 — pipe with diameter change & elevation
  {
    source_id: "q_frq_ap2017_a",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-21 03-13-06.png`,
    page: 5,
    worksheet_name: "AP Physics 2 2017 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2017",
    exercise_ref: "Q1(a)",
  },
  {
    source_id: "q_frq_ap2017_b",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-21 03-13-06.png`,
    page: 5,
    worksheet_name: "AP Physics 2 2017 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2017",
    exercise_ref: "Q1(b)",
  },
  {
    source_id: "q_frq_2017_c_i",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-21 03-13-16.png`,
    page: 6,
    worksheet_name: "AP Physics 2 2017 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2017",
    exercise_ref: "Q1(c)(i)",
  },
  // 2018 AP Physics 2 Q4 — boat in river
  {
    source_id: "q_frq_ap2018_c",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-21 03-12-47.png`,
    page: null,
    worksheet_name: "AP Physics 2 2018 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2018",
    exercise_ref: "Q4(c)",
  },
  // 2023 AP Physics 2 Q3 — Tank Z (cone-shaped tank)
  {
    source_id: "q_frq_ap2023_c",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-21 03-10-26.png`,
    page: 14,
    worksheet_name: "AP Physics 2 2023 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2023",
    exercise_ref: "Q3(c)",
  },
  // 2023 AP Physics 2 Q3 — Tank X (blocks A & B, parts a & b)
  {
    source_id: "q_frq_ap2023_a_ii",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-21 03-10-11.png`,
    page: 12,
    worksheet_name: "AP Physics 2 2023 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2023",
    exercise_ref: "Q3(a)(ii)",
  },
  {
    source_id: "q_frq_ap2023_b_i",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-21 03-10-22.png`,
    page: 13,
    worksheet_name: "AP Physics 2 2023 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2023",
    exercise_ref: "Q3(b)(i)",
  },
  {
    source_id: "q_frq_ap2023_b_ii",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-21 03-10-22.png`,
    page: 13,
    worksheet_name: "AP Physics 2 2023 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2023",
    exercise_ref: "Q3(b)(ii)",
  },
  {
    source_id: "q_frq_ap2023_b_iii",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-21 03-10-22.png`,
    page: 13,
    worksheet_name: "AP Physics 2 2023 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2023",
    exercise_ref: "Q3(b)(iii)",
  },
  // 2022 AP Physics 2 Q1 — block submerged in glass tank with laser
  {
    source_id: "q_frq_ap2022_a_ii",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-21 03-10-38.png`,
    page: 5,
    worksheet_name: "AP Physics 2 2022 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2022",
    exercise_ref: "Q1(a)(ii)",
  },
  // 2021 AP Physics 2 Q2 — gas density / piston experiment, balloon underwater
  {
    source_id: "q_frq_ap2021_c",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-07 14-10-56.png`,
    page: 9,
    worksheet_name: "AP Physics 2 2021 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2021",
    exercise_ref: "Q2(c)",
  },
  // 2018 AP Physics 2 Q4 — steel-hulled boat displacing river water
  {
    source_id: "q_frq_ap2018_a",
    file: `${IMAGE_DIR_PREFIX}Screenshot From 2026-04-21 03-12-47.png`,
    page: null,
    worksheet_name: "AP Physics 2 2018 Free-Response Questions",
    textbook_key: "cb_ap_p2_frq_2018",
    exercise_ref: "Q4(a)",
  },
]

// False-positive matches to clear.
const UNMATCH = [
  {
    source_id: "q_psi5",
    reason: "false-positive: workbook is mechanics-only (no fluids chapter); the only matched phrase was a generic 'what is the difference between the' fragment",
  },
]

// Stem-children whose own stem is too short for phrase-matching but whose
// parent question is known to live in the workbook. Inherit page.
const WORKBOOK_INHERIT = [
  {
    source_id: "q47",
    file: "WORKBOOK 1 FULL (1).pdf",
    page: 16,
    worksheet_name: "AP Physics 1 Practice Workbook — Book 1",
    textbook_key: "tutor_ap1_workbook_book1_2014",
    exercise_ref: "47",
    note: "stem-child of q46 ('Questions 47-48 refer to the graph above')",
  },
  {
    source_id: "q_d46",
    file: "WORKBOOK 1 FULL (1).pdf",
    page: 49,
    worksheet_name: "AP Physics 1 Practice Workbook — Book 1",
    textbook_key: "tutor_ap1_workbook_book1_2014",
    exercise_ref: "46",
    note: "stem-child referencing 'setup described in question 45'",
  },
  {
    source_id: "frq_2006Bb1",
    file: "WORKBOOK 1 FULL (1).pdf",
    page: 29,
    worksheet_name: "AP Physics 1 Practice Workbook — Book 1",
    textbook_key: "tutor_ap1_workbook_book1_2014",
    exercise_ref: "2006Bb1",
    note: "verified workbook p29 contains '2006Bb1. A student wishing to determine experimentally the acceleration g…'",
  },
]

console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`)
console.log(`Assignments: ${ASSIGN.length}, Inherit: ${WORKBOOK_INHERIT.length}, Unmatch: ${UNMATCH.length}`)

let okCount = 0

for (const u of UNMATCH) {
  const rows = await findBySourceId(u.source_id)
  if (!rows.length) {
    console.log(`  MISS unmatch ${u.source_id}: no row found`)
    continue
  }
  const r = rows[0]
  const newMeta = { ...(r.metadata || {}) }
  newMeta.flags = {
    ...(newMeta.flags || {}),
    source_unmatched: true,
    reason: u.reason,
  }
  const patch = {
    source_file: null,
    source_page: null,
    source_reference: {
      worksheet_name: "",
      textbook_key: "",
      page: null,
      section: (r.source_reference && r.source_reference.section) || "",
      exercise_ref: newMeta.label || newMeta.source_id || "",
      unmatched: true,
    },
    metadata: newMeta,
  }
  console.log(`  UNMATCH ${u.source_id} → ${r.id}`)
  if (APPLY) {
    await rest("PATCH", `questions?id=eq.${r.id}`, patch)
    okCount++
  }
}

for (const a of ASSIGN) {
  const rows = await findBySourceId(a.source_id)
  if (!rows.length) {
    console.log(`  MISS assign ${a.source_id}: no row found`)
    continue
  }
  const r = rows[0]
  const newMeta = { ...(r.metadata || {}) }
  // Clear stale unmatched flag if present.
  if (newMeta.flags) {
    const { source_unmatched, reason, ...rest } = newMeta.flags
    newMeta.flags = Object.keys(rest).length ? rest : undefined
    if (newMeta.flags === undefined) delete newMeta.flags
  }
  // Pull existing section_ref out of source_reference if present.
  // After migration 019, source_reference is jsonb; PostgREST returns it parsed.
  const sectionRef = (r.source_reference && r.source_reference.section) || ""
  const patch = {
    source_file: a.file,
    source_page: a.page,
    source_reference: {
      worksheet_name: a.worksheet_name,
      textbook_key: a.textbook_key,
      page: a.page,
      section: sectionRef,
      exercise_ref: a.exercise_ref,
    },
    metadata: newMeta,
  }
  console.log(`  ASSIGN ${a.source_id.padEnd(22)} → ${a.file}  (${a.exercise_ref})`)
  if (APPLY) {
    await rest("PATCH", `questions?id=eq.${r.id}`, patch)
    okCount++
  }
}

for (const a of WORKBOOK_INHERIT) {
  const rows = await findBySourceId(a.source_id)
  if (!rows.length) {
    console.log(`  MISS inherit ${a.source_id}: no row found`)
    continue
  }
  const r = rows[0]
  const newMeta = { ...(r.metadata || {}) }
  if (newMeta.flags) {
    const { source_unmatched, reason, ...rest } = newMeta.flags
    newMeta.flags = Object.keys(rest).length ? rest : undefined
    if (newMeta.flags === undefined) delete newMeta.flags
  }
  // After migration 019, source_reference is jsonb; PostgREST returns it parsed.
  const sectionRef = (r.source_reference && r.source_reference.section) || ""
  const patch = {
    source_file: a.file,
    source_page: a.page,
    source_reference: {
      worksheet_name: a.worksheet_name,
      textbook_key: a.textbook_key,
      page: a.page,
      section: sectionRef,
      exercise_ref: a.exercise_ref,
    },
    metadata: newMeta,
  }
  console.log(`  INHERIT ${a.source_id.padEnd(22)} → ${a.file} p${a.page}  (${a.exercise_ref})`)
  if (APPLY) {
    await rest("PATCH", `questions?id=eq.${r.id}`, patch)
    okCount++
  }
}

console.log(`\nDone. ${APPLY ? `Patched ${okCount} rows.` : "(dry-run — pass --apply to write)"}`)
