#!/usr/bin/env node

const path = require("path")

const notion = require(path.join(process.cwd(), "lib", "notion.js"))

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim()

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")
  }
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

function buildUrl(table, query = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === "") continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function rest(table, { method = "GET", query = {}, body, prefer = "", onConflict = "" } = {}) {
  const url = buildUrl(table, onConflict ? { ...query, on_conflict: onConflict } : query)
  const res = await fetch(url, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : {}),
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  if (!res.ok) {
    throw new Error(payload?.message || payload?.hint || payload?.error || `Supabase REST error ${res.status}`)
  }
  return payload
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

async function upsertRows(table, rows, onConflict, batchSize = 250) {
  if (!rows.length) return
  for (const group of chunk(rows, batchSize)) {
    await rest(table, {
      method: "POST",
      body: group,
      onConflict,
      prefer: "resolution=merge-duplicates,return=representation",
    })
  }
}

function normalizeUuid(value = "") {
  return String(value || "").trim() || null
}

async function seedSubjects() {
  const subjects = await notion.getAllSubjects()
  const rows = subjects
    .filter((subject) => subject?.id && subject?.name)
    .map((subject) => ({
      id: normalizeUuid(subject.id),
      name: String(subject.name || "").trim(),
      state_scope: null,
      country_scope: null,
      exam_date: subject.examDate || null,
      timezone: null,
      updated_at: new Date().toISOString(),
    }))
  await upsertRows("subjects", rows, "id", 100)
  return rows.length
}

async function seedStudents() {
  const students = await notion.getAllStudents()
  const rows = students
    .filter((student) => student?.id && student?.name)
    .map((student) => ({
      id: normalizeUuid(student.id),
      full_name: String(student.name || "").trim(),
      email: String(student.email || "").trim() || null,
      country: student.country || null,
      state: student.state || null,
      timezone: student.timezone || null,
      updated_at: new Date().toISOString(),
    }))
  await upsertRows("students", rows, "id", 100)
  return students
}

async function seedEnrollments(students) {
  const seen = new Set()
  const rows = []
  for (const student of students) {
    if (!student?.id) continue
    const enrollments = await notion.getEnrollmentsByStudent(student.id)
    for (const enrollment of enrollments || []) {
      for (const subjectId of enrollment.subjectIds || []) {
        if (!subjectId) continue
        const key = `${student.id}::${subjectId}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({
          student_id: normalizeUuid(student.id),
          subject_id: normalizeUuid(subjectId),
          class_time: enrollment.classTime || null,
          duration_minutes: enrollment.duration || null,
          timezone: enrollment.timezone || null,
          meeting_days: Array.isArray(enrollment.days) ? enrollment.days : [],
        })
      }
    }
  }
  await upsertRows("enrollments", rows, "student_id,subject_id", 100)
  return rows.length
}

async function main() {
  assertEnv()
  const subjectsCount = await seedSubjects()
  const students = await seedStudents()
  const enrollmentsCount = await seedEnrollments(students)

  console.log(JSON.stringify({
    ok: true,
    subjects: subjectsCount,
    students: students.length,
    enrollments: enrollmentsCount,
  }, null, 2))
}

main().catch((error) => {
  console.error("[seed-core-to-supabase] failed:", error.message)
  process.exit(1)
})
