// Write source_file / source_page / source_reference back to questions for
// AP Physics 1, using matches from scripts/cache/ap-physics-1-matches.json.
//
// source_reference shape matches qt-extraction-prompt-mcq.md:
//   {
//     worksheet_name: <human label per source file>,
//     textbook_key:   <stable slug per source file>,
//     page:           <1-indexed int from match>,
//     section:        <QT.source_reference.section_ref>,
//     exercise_ref:   <question.metadata.label || question.metadata.source_id>
//   }
//
// Unmatched questions get metadata.flags = { source_unmatched: true,
// reason: "..." } and source_file/source_page/source_reference stay null
// so they're easy to find later.
//
// Pass --apply to actually patch; default is dry-run.

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

// Maps slug → human label + textbook_key. Add entries when new sources match.
const SOURCE_META = {
  workbook_1_full_1: {
    worksheet_name: "AP Physics 1 Practice Workbook — Book 1",
    textbook_key: "tutor_ap1_workbook_book1_2014",
  },
  "5stepsappphysics": {
    worksheet_name: "5 Steps to a 5: AP Physics 1",
    textbook_key: "ap_phys1_5steps",
  },
  "5stepsapphysics": {
    worksheet_name: "5 Steps to a 5: AP Physics 1",
    textbook_key: "ap_phys1_5steps",
  },
  ap25_frq_physics_1: {
    worksheet_name: "AP Physics 1 FRQs — 2025",
    textbook_key: "ap_phys1_frq_2025",
  },
  ap_physics_1_algebra_based_course_and_exam_description: {
    worksheet_name: "AP Physics 1: Algebra-Based — Course and Exam Description",
    textbook_key: "ap_phys1_ced",
  },
  ap_physics_1_premium_2024_4_practice_tests_comprehensive_kenneth_rideout_jonathan_wolf_2022_barrons_educational_servic:
    {
      worksheet_name: "Barron's AP Physics 1 Premium, 2024",
      textbook_key: "ap_phys1_barrons_2024",
    },
  ap_physics_1_algebra_based_ap_physics_1_2014: {
    worksheet_name: "AP Physics 1 Released Exam — 2014",
    textbook_key: "ap_phys1_released_2014",
  },
  ap_physics_1_algebra_based_ap_physics_1_2015: {
    worksheet_name: "AP Physics 1 Released Exam — 2015",
    textbook_key: "ap_phys1_released_2015",
  },
  ap_physics_1_algebra_based_ap_physics_1_2016: {
    worksheet_name: "AP Physics 1 Released Exam — 2016",
    textbook_key: "ap_phys1_released_2016",
  },
  ap_physics_1_algebra_based_ap_physics_1_2017: {
    worksheet_name: "AP Physics 1 Released Exam — 2017",
    textbook_key: "ap_phys1_released_2017",
  },
  ap_physics_1_algebra_based_ap_physics_1_2018: {
    worksheet_name: "AP Physics 1 Released Exam — 2018",
    textbook_key: "ap_phys1_released_2018",
  },
}

async function rest(method, path_, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path_}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`${method} ${path_} ${r.status}: ${await r.text()}`)
}

const matches = JSON.parse(
  fs.readFileSync("scripts/cache/ap-physics-1-matches.json", "utf8")
)

console.log(`Loaded ${matches.length} match rows. Mode: ${APPLY ? "APPLY" : "DRY-RUN"}`)

// First, fetch current metadata for all 220 so we can merge the flags rather
// than overwrite (existing label / source_id must survive).
const envHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
const ids = matches.map((m) => m.qid)
const idsParam = `in.(${ids.map((x) => `"${x}"`).join(",")})`
const u = new URL(`${SUPABASE_URL}/rest/v1/questions`)
u.searchParams.set("select", "id,metadata")
u.searchParams.set("id", idsParam)
const cur = await (await fetch(u, { headers: envHeaders })).json()
const metaById = new Map(cur.map((r) => [r.id, r.metadata || {}]))

let nMatched = 0
let nUnmatched = 0
let nMissingMap = 0
const missingSlugs = new Set()

for (const m of matches) {
  const existingMeta = metaById.get(m.qid) || {}
  const exerciseRef = existingMeta.label || existingMeta.source_id || ""

  if (m.unmatched) {
    nUnmatched++
    const newMeta = {
      ...existingMeta,
      flags: {
        ...(existingMeta.flags || {}),
        source_unmatched: true,
        reason: "no source PDF/EPUB in data/AP Physics 1/ contains a distinctive phrase from this stem (likely PSI/NJCTL or recent CB release we don't have locally)",
      },
    }
    const patch = {
      source_file: null,
      source_page: null,
      source_reference: {
        worksheet_name: "",
        textbook_key: "",
        page: null,
        section: m.qt_section_ref || "",
        exercise_ref: exerciseRef,
        unmatched: true,
      },
      metadata: newMeta,
    }
    if (APPLY) await rest("PATCH", `questions?id=eq.${m.qid}`, patch)
    continue
  }

  const meta = SOURCE_META[m.best.slug]
  if (!meta) {
    nMissingMap++
    missingSlugs.add(m.best.slug)
    continue
  }
  nMatched++

  const sourceRef = {
    worksheet_name: meta.worksheet_name,
    textbook_key: meta.textbook_key,
    page: m.best.page,
    section: m.qt_section_ref || "",
    exercise_ref: exerciseRef,
  }
  // Strip any stale flags now that we have a source.
  const newMeta = { ...existingMeta }
  if (newMeta.flags) {
    const { source_unmatched, ...rest } = newMeta.flags
    newMeta.flags = Object.keys(rest).length ? rest : undefined
    if (newMeta.flags === undefined) delete newMeta.flags
  }
  const patch = {
    source_file: m.best.file, // basename relative to data/AP Physics 1/
    source_page: m.best.page,
    source_reference: sourceRef,
    metadata: newMeta,
  }
  if (APPLY) await rest("PATCH", `questions?id=eq.${m.qid}`, patch)
}

console.log(`\nMatched & patched: ${nMatched}`)
console.log(`Unmatched & flagged: ${nUnmatched}`)
console.log(`Missing slug→meta mapping: ${nMissingMap}`)
if (missingSlugs.size) {
  console.log("  Add SOURCE_META entries for:")
  for (const s of missingSlugs) console.log(`    ${s}`)
}
console.log(APPLY ? "\nApplied." : "\n(dry-run — re-run with --apply to write)")
