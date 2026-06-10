import fs from "fs"
import path from "path"

const envPath = path.join(process.cwd(), ".env.local")
const env = Object.fromEntries(
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const idx = line.indexOf("=")
      return [line.slice(0, idx), line.slice(idx + 1)]
    }),
)

const URL = (env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
const KEY = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error("Missing Supabase env")
  process.exit(1)
}

const checks = [
  { id: "001", desc: "initial schema (students table)", table: "students", select: "id" },
  { id: "002", desc: "taxonomy codes (learning_objectives.framework_code)", table: "learning_objectives", select: "framework_code" },
  { id: "003", desc: "content_bank_pacing_gate (subjects.pacing_mode)", table: "subjects", select: "pacing_mode" },
  { id: "004", desc: "slo_lo_weights — DEFERRED", skip: true },
  { id: "005", desc: "textbook_source_types (school_units.unit_type)", table: "school_units", select: "unit_type" },
  { id: "006", desc: "pacing_supabase — superseded by 007 (can't probe)", skip: true },
  { id: "007", desc: "pacing_on_enrollment (enrollments.pacing_data)", table: "enrollments", select: "pacing_data" },
  { id: "008", desc: "pacing_guides table", table: "pacing_guides", select: "id" },
  { id: "009", desc: "subject_default_pacing (subjects.default_pacing_guide_id)", table: "subjects", select: "default_pacing_guide_id" },
  { id: "010", desc: "pacing_guide_hierarchy (pacing_guides.guide_type)", table: "pacing_guides", select: "guide_type" },
  { id: "011", desc: "user_presence table", table: "user_presence", select: "student_id" },
  { id: "012", desc: "student_parent_email (students.parent_email)", table: "students", select: "parent_email" },
  { id: "013", desc: "question_flags table (renamed by 015 — expected missing after 015)", table: "question_flags", select: "id" },
  { id: "014", desc: "showcase_codes table", table: "showcase_codes", select: "id" },
  { id: "015", desc: "student_question_attempts.mode (renamed from question_flags)", table: "student_question_attempts", select: "mode" },
]

async function probe(check) {
  if (check.skip) return { ...check, status: "skip" }
  const url = `${URL}/rest/v1/${check.table}?select=${encodeURIComponent(check.select)}&limit=1`
  const res = await fetch(url, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
  let bodyText = ""
  try { bodyText = await res.text() } catch {}
  return {
    ...check,
    status: res.status === 200 ? "present" : "missing",
    httpStatus: res.status,
    detail: res.status === 200 ? "" : bodyText.slice(0, 180),
  }
}

const results = []
for (const check of checks) results.push(await probe(check))

for (const r of results) {
  const mark = r.status === "present" ? "✓" : r.status === "skip" ? "·" : "✗"
  console.log(`${mark} ${r.id} ${r.desc}`)
  if (r.status === "missing") console.log(`    (${r.httpStatus}) ${r.detail}`)
}
