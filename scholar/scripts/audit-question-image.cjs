#!/usr/bin/env node
// Show the current bbox + image URL for a question, and HEAD the URL to
// verify the R2 object exists. Usage:
//   node scripts/audit-question-image.cjs <metadata.label>
// e.g.
//   node scripts/audit-question-image.cjs "1982B2(b)i"

const fs = require("fs")
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (!m) continue
  if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")
const KEY = process.env.SUPABASE_SECRET_KEY

const label = process.argv[2]
if (!label) { console.error("Usage: node scripts/audit-question-image.cjs <label>"); process.exit(1) }

async function rest(p) {
  const r = await fetch(URL_ + "/rest/v1/" + p, {
    headers: { apikey: KEY, Authorization: "Bearer " + KEY },
  })
  return JSON.parse(await r.text())
}

;(async () => {
  const rows = await rest(`questions?select=id,ordinal,question_text,question_content,stem_header_content,stem_group_id,is_stem_child,metadata&metadata->>label=eq.${encodeURIComponent(label)}&limit=5`)
  if (!rows.length) {
    console.log("no question found with metadata.label =", label)
    return
  }
  for (const q of rows) {
    console.log("\n— " + (q.metadata?.label || q.id) + " (id " + q.id.slice(0, 8) + ", ord " + q.ordinal + ", stem_child " + q.is_stem_child + ", group " + (q.stem_group_id ? q.stem_group_id.slice(0, 8) : "—") + ")")
    console.log("  prompt: " + (q.question_text || "").slice(0, 80))
    const blocks = [
      ["question_content", q.question_content],
      ["stem_header_content", q.stem_header_content],
    ]
    for (const [name, arr] of blocks) {
      const items = Array.isArray(arr) ? arr : []
      const imgs = items.filter((x) => x && x.type === "image")
      if (!imgs.length) { console.log("  " + name + ": (no images)"); continue }
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i]
        const bboxStr = Array.isArray(img.bbox) ? img.bbox.map((n) => Number(n).toFixed(3)).join(",") : "—"
        let head = "—"
        if (img.url) {
          try {
            const r = await fetch(img.url, { method: "HEAD" })
            head = r.ok ? `${r.status} OK (${r.headers.get("content-length") || "?"} bytes)` : `${r.status}`
          } catch (e) { head = "fetch error: " + e.message }
        } else {
          head = "(no url)"
        }
        console.log(`  ${name}[${i}]: page=${img.page} bbox=[${bboxStr}]`)
        console.log(`    url:  ${img.url || "(none)"}`)
        console.log(`    HEAD: ${head}`)
      }
    }
  }
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1) })
