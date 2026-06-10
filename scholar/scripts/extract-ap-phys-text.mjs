// Extract per-page text for every PDF/EPUB in data/AP Physics 1/.
// Output: one JSON file per source under scripts/cache/ap-physics-1-text/<slug>.json
//   { file, slug, kind, pages: [{page:1, text:"..."}], full: "<concat>" }
// pdftotext gives us page-numbered text; epub gets text per spine doc indexed as "page".

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { spawnSync } from "node:child_process"

const SRC_DIR = path.resolve("data/AP Physics 1")
const OUT_DIR = path.resolve("scripts/cache/ap-physics-1-text")
fs.mkdirSync(OUT_DIR, { recursive: true })

function slugify(p) {
  return p
    .replace(/^\.\//, "")
    .replace(/\.[a-zA-Z0-9]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase()
    .slice(0, 100)
}

function listSources() {
  const out = []
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) walk(p)
      else if (/\.(pdf|epub)$/i.test(ent.name)) out.push(p)
    }
  }
  walk(SRC_DIR)
  return out
}

function extractPdf(file) {
  // Use pdftotext with -layout for better structure; emit per-page via -f/-l.
  const info = execFileSync("pdfinfo", [file], { encoding: "utf8" })
  const m = info.match(/Pages:\s+(\d+)/)
  const pageCount = m ? Number(m[1]) : 0
  const pages = []
  for (let p = 1; p <= pageCount; p++) {
    const r = spawnSync(
      "pdftotext",
      ["-layout", "-f", String(p), "-l", String(p), "-enc", "UTF-8", file, "-"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    )
    if (r.status !== 0) {
      pages.push({ page: p, text: "", error: String(r.stderr || "").slice(0, 200) })
    } else {
      pages.push({ page: p, text: r.stdout })
    }
  }
  return { kind: "pdf", pages }
}

function extractEpub(file) {
  // Unzip in-memory: list, then read each xhtml/html, strip tags.
  const list = execFileSync("unzip", ["-l", file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  const docs = list
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /\.(x?html|htm)$/i.test(l))
    .map((l) => l.split(/\s+/).slice(-1)[0])
    .filter(Boolean)
    .sort()

  const pages = []
  let pageIdx = 0
  for (const d of docs) {
    pageIdx++
    const r = spawnSync("unzip", ["-p", file, d], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    if (r.status !== 0) {
      pages.push({ page: pageIdx, doc: d, text: "" })
      continue
    }
    const text = r.stdout
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x?[0-9a-fA-F]+;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    pages.push({ page: pageIdx, doc: d, text })
  }
  return { kind: "epub", pages }
}

const files = listSources()
console.log(`Found ${files.length} source files`)

for (const file of files) {
  const rel = path.relative(SRC_DIR, file)
  const slug = slugify(rel)
  const outPath = path.join(OUT_DIR, `${slug}.json`)
  if (fs.existsSync(outPath)) {
    console.log(`  skip (cached): ${rel} -> ${slug}.json`)
    continue
  }
  console.log(`  extracting: ${rel}`)
  let result
  try {
    result = file.toLowerCase().endsWith(".pdf") ? extractPdf(file) : extractEpub(file)
  } catch (e) {
    console.error(`    FAILED: ${e.message}`)
    continue
  }
  const full = result.pages.map((p) => p.text || "").join("\n\n")
  fs.writeFileSync(
    outPath,
    JSON.stringify({ file: rel, slug, kind: result.kind, pages: result.pages, full }, null, 0)
  )
  console.log(`    -> ${result.pages.length} pages, ${full.length} chars`)
}
console.log("Done.")
