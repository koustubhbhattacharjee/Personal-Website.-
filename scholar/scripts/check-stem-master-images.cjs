const fs = require("fs")
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (!m) continue
  if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")
const KEY = process.env.SUPABASE_SECRET_KEY

async function rest(p) {
  const r = await fetch(URL_ + "/rest/v1/" + p, {
    headers: { apikey: KEY, Authorization: "Bearer " + KEY },
  })
  return JSON.parse(await r.text())
}

;(async () => {
  const rows = await rest("questions?select=id,ordinal,stem_group_id,stem_header_content,metadata&stem_group_id=not.is.null&order=stem_group_id.asc,ordinal.asc&limit=300")
  const seen = new Set()
  let masters = 0, withImg = 0, withUrl = 0
  const urlMissing = []
  const noImg = []
  for (const r of rows) {
    if (seen.has(r.stem_group_id)) continue
    seen.add(r.stem_group_id)
    masters++
    const sh = Array.isArray(r.stem_header_content) ? r.stem_header_content : []
    const imgs = sh.filter((x) => x && x.type === "image")
    if (imgs.length) {
      withImg++
      const allHaveUrl = imgs.every((im) => !!im.url)
      if (allHaveUrl) withUrl++
      else urlMissing.push(`${r.metadata?.label || r.id.slice(0, 8)} (group ${r.stem_group_id.slice(0, 8)}): ${imgs.length} imgs, ${imgs.filter((im) => !im.url).length} missing url`)
    } else {
      noImg.push(`${r.metadata?.label || r.id.slice(0, 8)} (group ${r.stem_group_id.slice(0, 8)})`)
    }
  }
  console.log("Total stem masters scanned:", masters)
  console.log("Masters with image in stem_header:", withImg)
  console.log("Masters where every image has url:", withUrl)
  if (urlMissing.length) {
    console.log("\nMasters missing url on >=1 image (" + urlMissing.length + "):")
    urlMissing.slice(0, 20).forEach((s) => console.log("  " + s))
  }
  if (noImg.length) {
    console.log("\nMasters with NO image item in stem_header (" + noImg.length + "):")
    noImg.slice(0, 20).forEach((s) => console.log("  " + s))
  }
})().catch((e) => { console.error(e); process.exit(1) })
