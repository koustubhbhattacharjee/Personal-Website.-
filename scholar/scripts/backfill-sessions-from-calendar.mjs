import fs from "fs"
import path from "path"

const ENV_PATH = path.join(process.cwd(), ".env.local")
loadEnvFile(ENV_PATH)

const NOTION_TOKEN = process.env.NOTION_TOKEN || ""
const NOTION_STUDENTS_DB = process.env.NOTION_STUDENTS_DB || ""
const NOTION_SUBJECTS_DB = process.env.NOTION_SUBJECTS_DB || ""
const NOTION_SESSIONS_DB = process.env.NOTION_SESSIONS_DB || ""
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ""
const TUTOR_GOOGLE_REFRESH_TOKEN = process.env.TUTOR_GOOGLE_REFRESH_TOKEN || ""
const DEFAULT_TUTOR_TIMEZONE = process.env.TUTOR_TIMEZONE || "Asia/Kolkata"
const ADMIN_EMAIL = "kbohuastt@gmail.com"

const START_DATE = process.argv[2] || "2025-10-01"
const DRY_RUN = process.argv.includes("--dry-run")
const BASE = "https://api.notion.com/v1"

const TZ_MAP = {
  ist: "Asia/Kolkata",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  est: "America/New_York",
  edt: "America/New_York",
  cst: "America/Chicago",
  mst: "America/Denver",
  gmt: "Europe/London",
  utc: "UTC",
}

const SUBJECT_STOPWORDS = new Set(["ap", "as", "a", "level", "ib", "hl", "sl", "the", "and", "of"])

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (key && !(key in process.env)) {
      process.env[key] = value
    }
  }
}

function assertEnv(name, value) {
  if (!value) throw new Error(`Missing required env: ${name}`)
}

function fmtId(id) {
  if (!id) return id
  const clean = String(id).replace(/-/g, "")
  if (clean.length !== 32) return id
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`
}

function notionHeaders(version = "2022-06-28") {
  return {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    "Notion-Version": version,
    "Content-Type": "application/json",
  }
}

async function notionPost(pathname, body, version = "2022-06-28") {
  const res = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: notionHeaders(version),
    body: JSON.stringify(body || {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || `Notion POST failed: ${pathname}`)
  return data
}

async function notionQueryAll(databaseId, version = "2022-06-28") {
  const results = []
  let startCursor = null
  while (true) {
    const body = { page_size: 100 }
    if (startCursor) body.start_cursor = startCursor
    const data = await notionPost(`/databases/${fmtId(databaseId)}/query`, body, version)
    results.push(...(data.results || []))
    if (!data.has_more || !data.next_cursor) break
    startCursor = data.next_cursor
  }
  return results
}

async function notionCreatePage({ parentDatabaseId, properties }) {
  const res = await fetch(`${BASE}/pages`, {
    method: "POST",
    headers: notionHeaders("2022-06-28"),
    body: JSON.stringify({
      parent: { database_id: fmtId(parentDatabaseId) },
      properties,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || "Failed to create Notion page")
  return data
}

function normalizeTimezone(tz) {
  if (!tz) return "Asia/Kolkata"
  if (tz.includes("/")) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date())
      return tz
    } catch {
      return "Asia/Kolkata"
    }
  }
  return TZ_MAP[String(tz).toLowerCase().trim()] || "Asia/Kolkata"
}

function normalizeTitle(str) {
  return String(str || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function getSubjectCandidates(subjectName) {
  const normalized = normalizeTitle(subjectName)
  const baseTokens = normalized.split(" ").filter(Boolean)
  const significantTokens = baseTokens.filter((token) => token.length >= 3 && !SUBJECT_STOPWORDS.has(token))
  const parts = String(subjectName || "")
    .split(/[\/,()|-]+/)
    .map(normalizeTitle)
    .filter(Boolean)

  const candidates = new Set()
  if (normalized) candidates.add(normalized)
  const shortPhrase = significantTokens.slice(0, 3).join(" ")
  if (shortPhrase) candidates.add(shortPhrase)
  parts.forEach((part) => {
    candidates.add(part)
    const partTokens = part.split(" ").filter((token) => token.length >= 3 && !SUBJECT_STOPWORDS.has(token))
    if (partTokens.length) candidates.add(partTokens.slice(0, 2).join(" "))
  })
  significantTokens.forEach((token) => candidates.add(token))
  return [...candidates].filter(Boolean)
}

function fuzzyNameMatch(studentName, eventTitle) {
  const name = String(studentName || "").toLowerCase().trim()
  const title = String(eventTitle || "").toLowerCase()
  if (!name) return false
  if (title.includes(name)) return true
  const dedup = name.replace(/(.)\1+/g, "$1")
  if (title.includes(dedup)) return true
  if (name.length >= 4) {
    if (title.includes(name.slice(1))) return true
    if (title.includes(name.slice(0, -1))) return true
  }
  for (const word of title.split(/[\s,\-]+/)) {
    if (word.length < 4) continue
    if (word.replace(/(.)\1+/g, "$1") === dedup) return true
  }
  return false
}

function scoreSubjectMatch(eventTitle, subjectName) {
  const title = normalizeTitle(eventTitle)
  const titleTokens = title.split(" ").filter((token) => token.length >= 3 && !SUBJECT_STOPWORDS.has(token))
  const candidates = getSubjectCandidates(subjectName)
  let score = 0
  for (const candidate of candidates) {
    if (!candidate) continue
    if (title.includes(candidate)) {
      score = Math.max(score, candidate.includes(" ") ? 5 : 2)
    }
  }
  const subjectTokens = normalizeTitle(subjectName)
    .split(" ")
    .filter((token) => token.length >= 3 && !SUBJECT_STOPWORDS.has(token))
  let tokenMatches = 0
  for (const token of subjectTokens) {
    const matched = titleTokens.some((titleToken) =>
      titleToken === token ||
      (token.length >= 5 && titleToken.startsWith(token.slice(0, 5))) ||
      (titleToken.length >= 5 && token.startsWith(titleToken.slice(0, 5)))
    )
    if (matched) tokenMatches += 1
  }
  if (tokenMatches >= 2) score = Math.max(score, 3)
  else if (tokenMatches === 1) score = Math.max(score, 1)
  return score
}

function scoreStudentMatch(eventTitle, studentName) {
  if (!fuzzyNameMatch(studentName, eventTitle)) return 0
  const title = normalizeTitle(eventTitle)
  const normalizedName = normalizeTitle(studentName)
  if (title.includes(normalizedName)) return 3
  return 2
}

function formatDateKeyInTimezone(dateLike, timeZone = "UTC") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dateLike))
}

function parseStudent(page) {
  const timezoneRaw =
    page.properties["time zone"]?.select?.name ||
    page.properties["time zone"]?.rich_text?.[0]?.plain_text ||
    page.properties["Timezone"]?.select?.name ||
    page.properties["Timezone"]?.rich_text?.[0]?.plain_text ||
    ""
  return {
    id: page.id,
    name: page.properties.Name?.title?.[0]?.plain_text || "",
    email: page.properties.email?.rich_text?.[0]?.plain_text || "",
    subjectIds: page.properties.Subject?.relation?.map((r) => r.id) || [],
    timezone: normalizeTimezone(timezoneRaw),
  }
}

function parseSubject(page) {
  return {
    id: page.id,
    name: page.properties.Name?.title?.[0]?.plain_text || "",
  }
}

function parseSession(page) {
  return {
    id: page.id,
    studentId: page.properties.Student?.relation?.[0]?.id || "",
    subjectId: page.properties.Subject?.relation?.[0]?.id || "",
    eventId: page.properties["Calendar Event ID"]?.rich_text?.[0]?.plain_text || "",
    startTime: page.properties["Start Time"]?.date?.start || null,
  }
}

async function getTutorAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: TUTOR_GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Failed to refresh tutor access token: ${JSON.stringify(data)}`)
  return data.access_token
}

async function fetchCalendarEventsFrom(startDateStr) {
  const accessToken = await getTutorAccessToken()
  const timeMin = new Date(`${startDateStr}T00:00:00.000Z`)
  const timeMax = new Date()
  const collected = []
  let pageToken = ""
  let pages = 0

  while (pages < 40) {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    })
    if (pageToken) params.set("pageToken", pageToken)

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error?.message || "Failed to fetch Google Calendar events")
    collected.push(...(data.items || []))
    pageToken = data.nextPageToken || ""
    pages += 1
    if (!pageToken) break
  }

  return collected.filter((item) => item?.start?.dateTime)
}

function buildMatchCandidates(event, studentById, subjectById) {
  const title = event.summary || ""
  const out = []
  for (const student of studentById.values()) {
    const studentScore = scoreStudentMatch(title, student.name)
    if (!studentScore) continue
    for (const subjectId of student.subjectIds || []) {
      const subject = subjectById.get(subjectId)
      if (!subject) continue
      const subjectScore = scoreSubjectMatch(title, subject.name)
      if (!subjectScore) continue
      out.push({
        student,
        subject,
        total: studentScore + subjectScore,
        studentScore,
        subjectScore,
      })
    }
  }
  return out.sort((a, b) => b.total - a.total)
}

function chooseBestMatch(candidates) {
  if (!candidates.length) return { accepted: null, ambiguous: false }
  const best = candidates[0]
  const second = candidates[1]
  if (best.studentScore < 2 || best.subjectScore < 2 || best.total < 5) return { accepted: null, ambiguous: false }
  if (second && second.total === best.total) {
    const sameStudent = second.student.id === best.student.id
    const sameSubject = second.subject.id === best.subject.id
    if (!sameStudent || !sameSubject) {
      return { accepted: null, ambiguous: true }
    }
  }
  return { accepted: best, ambiguous: false }
}

function buildSessionName(studentName, subjectName, studentSessionDate) {
  return `${studentName} · ${subjectName} · ${studentSessionDate}`
}

async function main() {
  assertEnv("NOTION_TOKEN", NOTION_TOKEN)
  assertEnv("NOTION_STUDENTS_DB", NOTION_STUDENTS_DB)
  assertEnv("NOTION_SUBJECTS_DB", NOTION_SUBJECTS_DB)
  assertEnv("NOTION_SESSIONS_DB", NOTION_SESSIONS_DB)
  assertEnv("GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID)
  assertEnv("GOOGLE_CLIENT_SECRET", GOOGLE_CLIENT_SECRET)
  assertEnv("TUTOR_GOOGLE_REFRESH_TOKEN", TUTOR_GOOGLE_REFRESH_TOKEN)

  console.log(`[sessions-backfill] start from ${START_DATE}${DRY_RUN ? " (dry run)" : ""}`)

  const [studentPages, subjectPages, existingSessionPages, events] = await Promise.all([
    notionQueryAll(NOTION_STUDENTS_DB),
    notionQueryAll(NOTION_SUBJECTS_DB),
    notionQueryAll(NOTION_SESSIONS_DB),
    fetchCalendarEventsFrom(START_DATE),
  ])

  const students = studentPages
    .map(parseStudent)
    .filter((item) => item.name)
    .filter((item) => String(item.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase())
    .filter((item) => normalizeTitle(item.name) !== "koustubh")
  const subjects = subjectPages.map(parseSubject).filter((item) => item.name)
  const existingSessions = existingSessionPages.map(parseSession)

  const studentById = new Map(students.map((item) => [item.id, item]))
  const subjectById = new Map(subjects.map((item) => [item.id, item]))
  const existingByEvent = new Map(existingSessions.filter((item) => item.eventId).map((item) => [item.eventId, item]))
  const existingByComposite = new Set(
    existingSessions
      .filter((item) => item.studentId && item.subjectId && item.startTime)
      .map((item) => `${item.studentId}::${item.subjectId}::${item.startTime}`)
  )

  let created = 0
  let skippedExisting = 0
  let unmatched = 0
  let ambiguous = 0

  for (const event of events) {
    const eventId = String(event.id || "").trim()
    const startTime = event.start?.dateTime
    const endTime = event.end?.dateTime || null
    const title = event.summary || "(untitled)"
    if (!startTime || !eventId) continue

    if (existingByEvent.has(eventId)) {
      skippedExisting += 1
      continue
    }

    const candidates = buildMatchCandidates(event, studentById, subjectById)
    const { accepted, ambiguous: isAmbiguous } = chooseBestMatch(candidates)

    if (!accepted) {
      if (isAmbiguous) {
        ambiguous += 1
        console.warn(`[sessions-backfill] ambiguous match: "${title}" @ ${startTime}`)
      } else {
        unmatched += 1
        console.warn(`[sessions-backfill] unmatched event: "${title}" @ ${startTime}`)
      }
      continue
    }

    const compositeKey = `${accepted.student.id}::${accepted.subject.id}::${startTime}`
    if (existingByComposite.has(compositeKey)) {
      skippedExisting += 1
      continue
    }

    const studentTz = accepted.student.timezone || "UTC"
    const tutorTz = normalizeTimezone(DEFAULT_TUTOR_TIMEZONE)
    const studentSessionDate = formatDateKeyInTimezone(startTime, studentTz)
    const tutorSessionDate = formatDateKeyInTimezone(startTime, tutorTz)
    const notes = `Imported from Google Calendar backfill on ${new Date().toISOString()}. Title: ${title}`

    const properties = {
      Name: { title: [{ text: { content: buildSessionName(accepted.student.name, accepted.subject.name, studentSessionDate) } }] },
      Student: { relation: [{ id: fmtId(accepted.student.id) }] },
      Subject: { relation: [{ id: fmtId(accepted.subject.id) }] },
      "Session Source": { select: { name: "calendar_exact" } },
      "Import Status": { select: { name: "not_imported" } },
      "Student Session Date": { date: { start: studentSessionDate } },
      "Tutor Session Date": { date: { start: tutorSessionDate } },
      "Start Time": { date: { start: startTime } },
      "End Time": endTime ? { date: { start: endTime } } : { date: null },
      "Student Timezone": { rich_text: [{ text: { content: studentTz } }] },
      "Tutor Timezone": { rich_text: [{ text: { content: tutorTz } }] },
      "Calendar Event ID": { rich_text: [{ text: { content: eventId } }] },
      "Session Notes": { rich_text: [{ text: { content: notes.slice(0, 1900) } }] },
    }

    if (DRY_RUN) {
      console.log(`[sessions-backfill] dry-run create: ${accepted.student.name} | ${accepted.subject.name} | ${studentSessionDate} | ${title}`)
    } else {
      await notionCreatePage({ parentDatabaseId: NOTION_SESSIONS_DB, properties })
      console.log(`[sessions-backfill] created: ${accepted.student.name} | ${accepted.subject.name} | ${studentSessionDate} | ${title}`)
    }

    existingByEvent.set(eventId, true)
    existingByComposite.add(compositeKey)
    created += 1
  }

  console.log("[sessions-backfill] done", {
    events: events.length,
    created,
    skippedExisting,
    unmatched,
    ambiguous,
    dryRun: DRY_RUN,
  })
}

main().catch((err) => {
  console.error("[sessions-backfill] fatal", err)
  process.exit(1)
})
