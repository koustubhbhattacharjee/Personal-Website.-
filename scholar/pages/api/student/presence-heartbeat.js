import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getStudentById, getSubjectById } from "../../../lib/db"
import { supabaseInsert, supabaseSelect, supabaseUpdate } from "../../../lib/supabase"
import { isShowcaseDemo } from "../../../lib/showcase"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  if (isShowcaseDemo(req)) return res.status(204).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })

  const email = String(session?.user?.email || "").trim().toLowerCase()
  const isAdmin = email === ADMIN_EMAIL.toLowerCase()
  const studentId = String(session?.notionStudentId || "").trim()

  const { route = "dashboard", section = "", subjectId = "", mode = "live" } = req.body || {}

  let student = null
  let subject = null
  if (studentId) {
    student = await getStudentById(studentId).catch(() => null)
  }
  if (subjectId) {
    subject = await getSubjectById(subjectId).catch(() => null)
  }

  const userKey = studentId ? `student:${studentId}` : `admin:${email || "unknown"}`
  const now = new Date().toISOString()
  const payload = {
    user_key: userKey,
    role: studentId ? "student" : (isAdmin ? "admin" : "user"),
    email: email || null,
    student_id: studentId || null,
    student_name: student?.name || session?.user?.studentName || session?.user?.name || null,
    route: String(route || "dashboard").trim() || "dashboard",
    section: String(section || "").trim() || null,
    subject_id: String(subjectId || "").trim() || null,
    subject_name: subject?.name || null,
    mode: String(mode || "live").trim() || "live",
    last_seen_at: now,
    updated_at: now,
    metadata: {},
  }

  const existing = await supabaseSelect("user_presence", {
    select: "id",
    filters: { user_key: userKey },
    single: true,
  }).catch(() => null)

  if (existing?.id) {
    await supabaseUpdate("user_presence", { id: existing.id }, payload)
  } else {
    await supabaseInsert("user_presence", [payload])
  }

  return res.status(200).json({ ok: true, lastSeenAt: now })
}
