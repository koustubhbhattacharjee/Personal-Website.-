// Match every AP Physics 1 question to a (source_file, page) by searching the
// extracted-text cache for distinctive phrases lifted from the question stem.
//
// Output: scripts/cache/ap-physics-1-matches.json
//   [{ qid, qhash, qt_id, label, source_id, stem_excerpt,
//      best: { slug, file, page, score, matched_phrases },
//      runners_up: [...], unmatched: bool }]
//
// Strategy:
//   1. Normalize stem text: lower, strip punctuation, collapse whitespace.
//   2. Pick 6 distinctive phrases (10-word windows) from the stem, skipping
//      very generic openings.
//   3. For each phrase, scan every cached source page for a substring hit.
//   4. Score each (slug, page) by # of distinct phrase hits; longest single
//      contiguous match breaks ties.
//   5. Anything with score 0 is "unmatched" and gets flagged.

import fs from "node:fs"
import path from "node:path"

const CACHE_DIR = path.resolve("scripts/cache/ap-physics-1-text")
const OUT_PATH = path.resolve("scripts/cache/ap-physics-1-matches.json")

const envText = fs.readFileSync(path.resolve(".env.local"), "utf8")
const ENV = {}
for (const line of envText.split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m) ENV[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const SUPABASE_URL = ENV.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")
const SUPABASE_KEY = ENV.SUPABASE_SECRET_KEY

async function rest(table, query) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v)
  const r = await fetch(url, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!r.ok) throw new Error(`${table} ${r.status}: ${await r.text()}`)
  return r.json()
}
async function selectIn(table, col, vals, select, extra={}) {
  const out = []
  const arr = [...new Set(vals.filter(Boolean))]
  for (let i=0;i<arr.length;i+=80) {
    const slice = arr.slice(i,i+80).map(v=>`"${String(v).replace(/"/g,'\\"')}"`).join(",")
    out.push(...await rest(table, { select, [col]:`in.(${slice})`, ...extra }))
  }
  return out
}

// --- normalization -----------------------------------------------------------
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[“”„"']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const STOP_OPENINGS = [
  "which of the following",
  "a student",
  "a car",
  "a block",
  "a ball",
  "a particle",
  "an object",
]

// Pick ~6 distinctive 10-word phrases from a stem.
function phrasesOf(stem) {
  const norm = normalize(stem)
  const words = norm.split(" ").filter(Boolean)
  if (words.length < 8) return [norm].filter(Boolean)
  const W = 10
  const phrases = []
  // sliding windows, skip openings that are too generic
  for (let i = 0; i + W <= words.length; i += 5) {
    const ph = words.slice(i, i + W).join(" ")
    if (STOP_OPENINGS.some((s) => ph.startsWith(s))) continue
    phrases.push(ph)
    if (phrases.length >= 8) break
  }
  if (phrases.length === 0 && words.length >= W) {
    // fall back to first window even if generic
    phrases.push(words.slice(0, W).join(" "))
  }
  // also include the longest non-generic 6-word phrase as a fallback
  for (let i = 0; i + 6 <= words.length; i += 3) {
    const ph = words.slice(i, i + 6).join(" ")
    if (STOP_OPENINGS.some((s) => ph.startsWith(s))) continue
    phrases.push(ph)
    if (phrases.length >= 12) break
  }
  return [...new Set(phrases)]
}

// --- load source cache (one normalized blob per page per source) -------------
console.log("Loading text cache…")
const sources = []
for (const f of fs.readdirSync(CACHE_DIR)) {
  if (!f.endsWith(".json")) continue
  const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), "utf8"))
  const pages = j.pages.map((p) => ({
    page: p.page,
    norm: normalize(p.text || ""),
  }))
  sources.push({ slug: j.slug, file: j.file, kind: j.kind, pages })
}
console.log(`  ${sources.length} sources, ${sources.reduce((n,s)=>n+s.pages.length,0)} pages total`)

// --- fetch DB questions ------------------------------------------------------
const FW = "434e067c-f50a-4dc1-a826-897fc32d4292"
console.log("Fetching question_types…")
const banks = await rest("content_banks", { select: "id", framework_id: `eq.${FW}` })
const qts = await selectIn(
  "question_types",
  "content_bank_id",
  [banks[0].id],
  "id,title,source_reference,unit_label"
)
console.log(`  ${qts.length} QTs`)
const qtById = new Map(qts.map((q) => [q.id, q]))

console.log("Fetching questions…")
const qtIds = qts.map((q) => q.id)
const questions = await selectIn(
  "questions",
  "question_type_id",
  qtIds,
  "id,qhash,question_type_id,question_text,metadata"
)
console.log(`  ${questions.length} questions`)

// --- match each question -----------------------------------------------------
const results = []
let nMatched = 0
let nUnmatched = 0
for (const q of questions) {
  const phrases = phrasesOf(q.question_text || "")
  // tally hits per (slug, page)
  const score = new Map()
  for (const src of sources) {
    for (const pg of src.pages) {
      let hits = 0
      const matched = []
      for (const ph of phrases) {
        if (ph.length < 12) continue
        if (pg.norm.includes(ph)) {
          hits++
          matched.push(ph)
        }
      }
      if (hits > 0) {
        const key = `${src.slug}|${pg.page}`
        score.set(key, { slug: src.slug, file: src.file, page: pg.page, hits, matched })
      }
    }
  }
  const ranked = [...score.values()].sort((a, b) => b.hits - a.hits || b.matched.join(" ").length - a.matched.join(" ").length)
  const best = ranked[0] || null
  const runners = ranked.slice(1, 4).map((r) => ({ slug: r.slug, page: r.page, hits: r.hits }))

  if (best) nMatched++
  else nUnmatched++

  results.push({
    qid: q.id,
    qhash: q.qhash,
    qt_id: q.question_type_id,
    label: q.metadata?.label || "",
    source_id: q.metadata?.source_id || "",
    qt_section_ref: qtById.get(q.question_type_id)?.source_reference?.section_ref || "",
    qt_unit_label: qtById.get(q.question_type_id)?.unit_label || "",
    stem_excerpt: String(q.question_text || "").slice(0, 140),
    best: best ? { slug: best.slug, file: best.file, page: best.page, score: best.hits, matched: best.matched.slice(0, 3) } : null,
    runners_up: runners,
    unmatched: !best,
  })
}

fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2))
console.log(`\nMatched: ${nMatched}/${questions.length}, Unmatched: ${nUnmatched}`)

// Per-source tally
const byFile = new Map()
for (const r of results) {
  const f = r.best?.file || "(unmatched)"
  byFile.set(f, (byFile.get(f) || 0) + 1)
}
console.log("\nPer-file question counts:")
for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${f}`)
}

// Section-ref availability
const noSection = results.filter((r) => !r.qt_section_ref).length
console.log(`\nQuestions whose QT has no section_ref: ${noSection}`)

console.log(`\nWrote ${OUT_PATH}`)
