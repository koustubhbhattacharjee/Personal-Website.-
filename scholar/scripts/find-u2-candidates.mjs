// Scan cached PDF/EPUB text for pages likely to contain u2 (Forces and
// Translational Dynamics) content. Output: per-source JSON with candidate
// page numbers + a snippet for each.
//
// We identify candidates via two filters:
//   - score = number of u2-typical keywords on the page
//   - ANY page with score >= 2 is a candidate (kinematics-only or
//     pure-energy pages will only score 0–1 on these)
//
// Tunable via U2_KEYWORDS list below.

import fs from "node:fs"
import path from "node:path"

const CACHE = "scripts/cache/ap-physics-1-text"
const OUT = "scripts/cache/u2-candidates.json"

// Keywords that strongly indicate forces/dynamics content.
const U2_KEYWORDS = [
  "free-body", "free body diagram", "free-body diagram",
  "newton's second law", "newton's third law", "newton's first law",
  "newton’s second law", "newton’s third law",
  "coefficient of kinetic friction", "coefficient of static friction",
  "coefficient of friction",
  "kinetic friction", "static friction",
  "frictionless", "frictional force",
  "normal force",
  "tension in the", "tension in a", "tension t",
  "incline", "inclined plane", "inclined surface",
  "atwood",
  "pulley",
  "spring constant", "hooke", "ideal spring",
  "centripetal",
  "circular motion", "circular path", "circular track",
  "banked curve", "banked road",
  "apparent weight", "elevator",
  "pushed by a force", "applied force", "force of magnitude",
  "weight w", "weight of",
  "block of mass", "blocks of mass",
]

// Counter-keywords that suggest the page is NOT primarily u2 (other units).
const NOT_U2 = [
  "buoyant", "bernoulli", "torricelli", "fluid", "density of",
  "voltage", "capacitor", "resistor", "magnetic field",
  "wavelength", "frequency", "doppler",
  "isotope", "half-life", "radioactive",
  "heat capacity", "specific heat",
]

function norm(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ")
}

function score(pageText) {
  const t = norm(pageText)
  let s = 0
  for (const k of U2_KEYWORDS) if (t.includes(k)) s++
  let n = 0
  for (const k of NOT_U2) if (t.includes(k)) n++
  return { s, n }
}

const sources = []
for (const f of fs.readdirSync(CACHE)) {
  if (!f.endsWith(".json")) continue
  const j = JSON.parse(fs.readFileSync(path.join(CACHE, f), "utf8"))
  sources.push(j)
}

const out = []
for (const src of sources) {
  const candidates = []
  for (const p of src.pages) {
    const { s, n } = score(p.text || "")
    if (s >= 2 && n < s) {  // u2 keywords outweigh other-unit keywords
      candidates.push({ page: p.page, score: s, anti: n, snippet: norm(p.text||"").slice(0, 240) })
    }
  }
  out.push({ slug: src.slug, file: src.file, total_pages: src.pages.length, candidates })
}

fs.writeFileSync(OUT, JSON.stringify(out, null, 2))
console.log(`Wrote ${OUT}`)
console.log(`\nPer-source candidate counts:`)
for (const s of out.sort((a,b)=>b.candidates.length-a.candidates.length)) {
  console.log(`  ${String(s.candidates.length).padStart(4)} / ${String(s.total_pages).padStart(4)}  ${s.slug}`)
}
