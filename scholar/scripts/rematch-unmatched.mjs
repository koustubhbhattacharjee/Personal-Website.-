// Re-match the still-unmatched DB rows against the cached text sources.
// (The new sources — AP Physics 2 2014–2018 and NJCTL fluids — were not
// in the cache when the original matcher ran.)
//
// Output: scripts/cache/ap-physics-1-rematch.json with one entry per row
//   that found a hit. Same shape as the original matches file.

import fs from "node:fs"
import path from "node:path"

const CACHE_DIR = path.resolve("scripts/cache/ap-physics-1-text")
const OUT_PATH = path.resolve("scripts/cache/ap-physics-1-rematch.json")

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
  const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } })
  if (!r.ok) throw new Error(`${table} ${r.status}: ${await r.text()}`)
  return r.json()
}
async function selectIn(t, c, vs, sel, ex={}) {
  const out=[]; const arr=[...new Set(vs.filter(Boolean))]
  for (let i=0;i<arr.length;i+=80) {
    const slice=arr.slice(i,i+80).map(v=>`"${String(v).replace(/"/g,'\\"')}"`).join(",")
    out.push(...await rest(t,{select:sel,[c]:`in.(${slice})`,...ex}))
  }
  return out
}

function normalize(s) {
  return String(s||"").toLowerCase().replace(/[“”„"']/g,"").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim()
}

const STOP = ["which of the following","a student","a car","a block","a ball","a particle","an object","a piece","a wooden"]

function phrasesOf(stem) {
  const norm = normalize(stem)
  const w = norm.split(" ").filter(Boolean)
  if (w.length < 8) return [norm].filter(Boolean)
  const ph = []
  for (let i=0;i+10<=w.length;i+=4) {
    const s = w.slice(i,i+10).join(" ")
    if (STOP.some(o=>s.startsWith(o))) continue
    ph.push(s)
  }
  for (let i=0;i+6<=w.length;i+=3) {
    const s = w.slice(i,i+6).join(" ")
    if (STOP.some(o=>s.startsWith(o))) continue
    ph.push(s)
  }
  if (ph.length===0 && w.length>=10) ph.push(w.slice(0,10).join(" "))
  return [...new Set(ph)]
}

console.log("Loading text cache…")
const sources = []
for (const f of fs.readdirSync(CACHE_DIR)) {
  if (!f.endsWith(".json")) continue
  const j = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), "utf8"))
  sources.push({ slug: j.slug, file: j.file, pages: j.pages.map(p=>({page:p.page,norm:normalize(p.text||"")})) })
}
console.log(`  ${sources.length} sources`)

const FW = "434e067c-f50a-4dc1-a826-897fc32d4292"
const banks = await rest("content_banks", { select:"id", framework_id:`eq.${FW}` })
const qts = await selectIn("question_types","content_bank_id",[banks[0].id],"id,source_reference")
const qtIds = qts.map(q=>q.id)
const allQ = await selectIn("questions","question_type_id",qtIds,"id,question_text,metadata,question_type_id")
const unmatched = allQ.filter(q => q.metadata?.flags?.source_unmatched)
console.log(`  ${unmatched.length} unmatched DB rows to re-check`)

const qtById = new Map(qts.map(q=>[q.id,q]))

const results = []
let nNewMatches = 0
for (const q of unmatched) {
  const phrases = phrasesOf(q.question_text||"")
  const score = new Map()
  for (const src of sources) {
    for (const pg of src.pages) {
      let h=0; const m=[]
      for (const ph of phrases) {
        if (ph.length<12) continue
        if (pg.norm.includes(ph)) { h++; m.push(ph) }
      }
      if (h>0) score.set(`${src.slug}|${pg.page}`,{slug:src.slug,file:src.file,page:pg.page,hits:h,matched:m})
    }
  }
  const ranked = [...score.values()].sort((a,b)=>b.hits-a.hits||b.matched.join(" ").length-a.matched.join(" ").length)
  const best = ranked[0] || null
  if (best) nNewMatches++
  results.push({
    qid: q.id,
    label: q.metadata?.label||"",
    source_id: q.metadata?.source_id||"",
    qt_section_ref: qtById.get(q.question_type_id)?.source_reference?.section_ref||"",
    stem: (q.question_text||"").slice(0,140),
    best: best ? { slug:best.slug, file:best.file, page:best.page, hits:best.hits, sample: best.matched[0]||"" } : null,
    runners_up: ranked.slice(1,4).map(r=>({slug:r.slug, page:r.page, hits:r.hits})),
  })
}

fs.writeFileSync(OUT_PATH, JSON.stringify(results,null,2))
console.log(`\n${nNewMatches} of ${unmatched.length} previously-unmatched rows now have a phrase hit somewhere.`)
console.log(`\nPer-source breakdown of new matches:`)
const bySrc = new Map()
for (const r of results) {
  if (!r.best) continue
  bySrc.set(r.best.file, (bySrc.get(r.best.file)||0)+1)
}
for (const [f,n] of [...bySrc.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(3)}  ${f}`)

console.log(`\nWrote ${OUT_PATH}`)
