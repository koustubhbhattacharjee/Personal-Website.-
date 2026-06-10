// Quick peek at AP Physics 1 question rows so I know what fields I'm matching against.
const path = require("path"); const fs = require("fs")
const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
}
const URL_ = String(process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "")
const KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
async function rest(t, q={}) {
  const u = new URL(`${URL_}/rest/v1/${t}`); for (const [k,v] of Object.entries(q)) u.searchParams.set(k,String(v))
  const r = await fetch(u, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  return JSON.parse(await r.text())
}
async function main() {
  const FW = "434e067c-f50a-4dc1-a826-897fc32d4292"
  const banks = await rest("content_banks", { select:"id", framework_id:`eq.${FW}` })
  const qts = await rest("question_types", { select:"id", content_bank_id:`eq.${banks[0].id}`, limit:10000 })
  const ids = qts.map(q=>q.id).slice(0, 5)
  const sample = await rest("questions", {
    select: "id,qhash,question_type_id,question_text,question_format,options,source_file,source_page,source_reference,metadata",
    question_type_id: `in.(${ids.map(x=>`"${x}"`).join(",")})`,
    limit: 6,
  })
  for (const q of sample) {
    console.log("---")
    console.log("id:", q.id)
    console.log("qhash:", q.qhash)
    console.log("format:", q.question_format)
    console.log("source_file:", q.source_file, "page:", q.source_page, "ref:", q.source_reference)
    console.log("metadata:", JSON.stringify(q.metadata))
    console.log("text:", String(q.question_text || "").slice(0, 300))
    console.log("options:", Array.isArray(q.options) ? q.options.length : 0)
  }
}
main().catch(e=>{ console.error(e); process.exit(1) })
