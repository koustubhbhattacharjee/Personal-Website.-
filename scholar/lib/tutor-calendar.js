// Tutor calendar — uses tutor's stored refresh token, not student's access token

import { archiveSessionRow, createSessionRow, listSessionsByStudentSubject, updateSessionArtifacts } from "./db"

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const DEFAULT_TUTOR_TIMEZONE = process.env.TUTOR_TIMEZONE || "Asia/Kolkata"
const SUBJECT_STOPWORDS = new Set(["ap", "as", "a", "level", "ib", "hl", "sl", "the", "and", "of"])

function formatDateKeyInTimezone(dateLike, timeZone = "UTC") {
  if (!dateLike) return null
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(dateLike))
    const year = parts.find((part) => part.type === "year")?.value || ""
    const month = parts.find((part) => part.type === "month")?.value || ""
    const day = parts.find((part) => part.type === "day")?.value || ""
    return year && month && day ? `${year}-${month}-${day}` : null
  } catch {
    return null
  }
}

function diffDateKeysDays(a, b) {
  if (!a || !b) return 0
  const aUtc = new Date(`${a}T00:00:00Z`)
  const bUtc = new Date(`${b}T00:00:00Z`)
  return Math.round((aUtc - bUtc) / (24 * 60 * 60 * 1000))
}

async function getTutorAccessToken() {
  const refreshToken = process.env.TUTOR_GOOGLE_REFRESH_TOKEN
  if (!refreshToken) throw new Error("Tutor calendar not connected. Go to /admin to connect.")
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    })
  })
  const data = await res.json()
  if (!data.access_token) throw new Error("Failed to refresh tutor access token: " + JSON.stringify(data))
  return data.access_token
}

function normalizeTitle(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
}

function fuzzyNameMatch(studentName, eventTitle) {
  const name = (studentName || "").toLowerCase().trim()
  const title = eventTitle.toLowerCase()
  if (!name) return true
  if (title.includes(name)) return true
  const dedup = name.replace(/(.)\1+/g, '$1')
  if (title.includes(dedup)) return true
  if (name.length >= 4) {
    if (title.includes(name.slice(1))) return true
    if (title.includes(name.slice(0, -1))) return true
  }
  for (const word of title.split(/[\s,\-]+/)) {
    if (word.length < 4) continue
    if (word.replace(/(.)\1+/g, '$1') === dedup) return true
  }
  return false
}

function getSubjectWords(subjectName) {
  return normalizeTitle(subjectName).split(" ").slice(0, 3).join(" ")
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
    if (!part) return
    candidates.add(part)
    const partTokens = part.split(" ").filter((token) => token.length >= 3 && !SUBJECT_STOPWORDS.has(token))
    if (partTokens.length) candidates.add(partTokens.slice(0, 2).join(" "))
  })
  significantTokens.forEach((token) => candidates.add(token))

  return [...candidates].filter(Boolean)
}

export function getCalendarSubjectCandidates(subjectName) {
  return getSubjectCandidates(subjectName)
}

function matchesSubject(eventTitle, subjectName) {
  const title = normalizeTitle(eventTitle)
  const candidates = getSubjectCandidates(subjectName)
  if (!candidates.length) return true
  if (candidates.some((candidate) => title.includes(candidate))) return true

  const tokenMatches = candidates.filter((candidate) => !candidate.includes(" ") && title.includes(candidate))
  return tokenMatches.length >= 2
}

export function matchesCalendarEvent(eventTitle, studentName, subjectName) {
  return matchesEvent(eventTitle, studentName, subjectName)
}

function matchesEvent(eventTitle, studentName, subjectName) {
  return matchesSubject(eventTitle, subjectName) && fuzzyNameMatch(studentName, eventTitle)
}

async function fetchEvents(timeMin, timeMax, maxResults = 50) {
  const accessToken = await getTutorAccessToken()
  const collected = []
  let pageToken = ""
  let pages = 0
  const pageSize = Math.min(Math.max(maxResults, 50), 250)
  const hardCap = Math.max(maxResults, 250)

  while (pages < 10 && collected.length < hardCap) {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(pageSize),
    })
    if (pageToken) params.set("pageToken", pageToken)

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await res.json()
    const items = data.items || []
    collected.push(...items)
    pageToken = data.nextPageToken || ""
    pages += 1
    if (!pageToken) break
  }

  return collected
}

export async function fetchTutorCalendarEvents(timeMin, timeMax, maxResults = 50) {
  return fetchEvents(timeMin, timeMax, maxResults)
}

function parseEvent(e) {
  return {
    title: e.summary,
    startTime: e.start?.dateTime || e.start?.date,
    endTime: e.end?.dateTime || e.end?.date,
    zoomLink: extractZoomLink(e),
    eventId: e.id,
    duration: e.start?.dateTime && e.end?.dateTime
      ? Math.round((new Date(e.end.dateTime) - new Date(e.start.dateTime)) / 60000)
      : 60,
  }
}

export async function getUpcomingClassForStudent(studentName, subjectName) {
  const now = new Date()
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const events = await fetchEvents(now, weekAhead)
  const match = events.find(e => matchesEvent(e.summary, studentName, subjectName))
  return match ? parseEvent(match) : null
}

export async function getUpcomingClassesForStudent(studentName, subjectName, limit = 3) {
  const now = new Date()
  const daysAhead = Math.max(7, limit * 7)
  const horizon = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)
  const events = await fetchEvents(now, horizon, Math.max(50, limit * 8))

  const filtered = events.filter(e => matchesEvent(e.summary, studentName, subjectName))

  return filtered
    .map(parseEvent)
    .filter(e => e.startTime)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    .slice(0, limit)
}

export async function getPastClassesForStudent(studentName, subjectName, limit = 20) {
  const now = new Date()
  const monthAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
  const events = await fetchEvents(monthAgo, now, limit * 5)
  return events
    .filter(e => matchesEvent(e.summary, studentName, subjectName))
    .map(e => ({
      date: (e.start?.dateTime || e.start?.date || "").split("T")[0],
      startTime: e.start?.dateTime,
      endTime: e.end?.dateTime,
      duration: e.start?.dateTime && e.end?.dateTime
        ? Math.round((new Date(e.end.dateTime) - new Date(e.start.dateTime)) / 60000)
        : 60,
      zoomLink: extractZoomLink(e),
    }))
}

export async function getClassesForStudentInRange(studentName, subjectName, startTime, endTime, limit = 200) {
  if (!startTime || !endTime) return []
  const start = new Date(startTime)
  const end = new Date(endTime)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return []

  // Session sync needs a much deeper scan than student-facing widgets because
  // the primary calendar may contain many unrelated events before the target
  // student's later recurring instances appear in start-time order.
  const fetchBudget = Math.max(1000, limit * 10)
  const events = await fetchEvents(start, end, fetchBudget)
  const matchedRaw = events.filter((e) => matchesEvent(e.summary, studentName, subjectName))
  const parsed = matchedRaw
    .map(parseEvent)
    .filter((e) => e.startTime)
    .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))

  const distinctSeriesRoots = [...new Set(
    matchedRaw
      .map((event) => String(event?.recurringEventId || event?.id || "").trim())
      .filter(Boolean)
      .map((id) => id.split("_")[0])
  )]
  const first = parsed[0] || null
  const last = parsed[parsed.length - 1] || null
  console.log(
    `[calendar] range fetch student="${studentName}" subject="${subjectName}" start="${start.toISOString()}" end="${end.toISOString()}" fetchBudget=${fetchBudget} rawFetched=${events.length} matched=${matchedRaw.length} parsed=${parsed.length} first="${first?.startTime || ""}" last="${last?.startTime || ""}" seriesRoots=${JSON.stringify(distinctSeriesRoots.slice(0, 10))}`
  )
  if (parsed.length) {
    console.log(
      "[calendar] range matched sample:",
      parsed.slice(0, 20).map((event) => ({
        title: event.title,
        eventId: event.eventId,
        startTime: event.startTime,
        endTime: event.endTime,
      }))
    )
  }

  return parsed
}

export function buildSessionDateContext(startTimeISO, studentTimezone, tutorTimezone = DEFAULT_TUTOR_TIMEZONE) {
  if (!startTimeISO) return null
  const studentTz = studentTimezone || "UTC"
  const tutorTz = tutorTimezone || DEFAULT_TUTOR_TIMEZONE
  const studentSessionDate = formatDateKeyInTimezone(startTimeISO, studentTz)
  const tutorSessionDate = formatDateKeyInTimezone(startTimeISO, tutorTz)
  const now = new Date()
  const studentToday = formatDateKeyInTimezone(now, studentTz)
  const tutorToday = formatDateKeyInTimezone(now, tutorTz)
  return {
    studentSessionDate,
    tutorSessionDate,
    studentToday,
    tutorToday,
    sessionDayDiff: diffDateKeysDays(studentSessionDate, tutorSessionDate),
    currentDayDiff: diffDateKeysDays(studentToday, tutorToday),
  }
}

function buildSessionName(studentName, subjectName, studentSessionDate) {
  return `${studentName} · ${subjectName} · ${studentSessionDate}`
}

function buildSessionSyncNote(eventTitle = "", mode = "created") {
  const prefix = mode === "updated" ? "Updated from calendar sync" : "Auto-created from calendar sync"
  return `${prefix} on ${new Date().toISOString()}. Title: ${String(eventTitle || "").slice(0, 400)}`
}

function hasLockedSessionWork(row = {}) {
  return Boolean(
    row?.preClassAttemptIds?.length ||
    row?.exitTicketAttemptIds?.length ||
    row?.homeworkAttemptIds?.length ||
    row?.latestPreClassPdfUrl ||
    row?.latestExitTicketPdfUrl ||
    row?.latestHomeworkPdfUrl ||
    row?.sessionReportPdfUrl
  )
}

export async function ensureSessionsForStudentSubject(student, subject, events = []) {
  if (!student?.id || !subject?.id || !Array.isArray(events) || !events.length) {
    return { created: 0, updated: 0, archived: 0, skipped: 0 }
  }
  try {
    console.log(`[calendar] ensureSessionsForStudentSubject start student="${student?.name || ""}" subject="${subject?.name || ""}" events=${events.length}`)
    const existingSessions = await listSessionsByStudentSubject(student.id, subject.id)
    console.log(`[calendar] existing sessions for ${student?.name || ""} / ${subject?.name || ""}: ${existingSessions.length}`)
    const existingByEvent = new Map(
      existingSessions
        .filter((row) => String(row.eventId || "").trim())
        .map((row) => [String(row.eventId || "").trim(), row])
    )
    const existingByComposite = new Map(
      existingSessions
        .filter((row) => row.studentSessionDate && row.startTime)
        .map((row) => [`${row.studentSessionDate}::${row.startTime}`, row])
    )

    let created = 0
    let updated = 0
    let archived = 0
    let skipped = 0
    const skipReasons = {
      missingStudentDate: 0,
      existingPast: 0,
      existingLocked: 0,
      existingUnchanged: 0,
      duplicateIndexHit: 0,
      createFailed: 0,
    }
    const studentTimezone = student.timezone || "UTC"
    const tutorTimezone = DEFAULT_TUTOR_TIMEZONE
    const studentToday = formatDateKeyInTimezone(new Date(), studentTimezone)

    const sortedEvents = [...events]
      .filter((event) => event?.startTime)
      .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
    console.log(`[calendar] sorted matched events for ${student?.name || ""} / ${subject?.name || ""}:`, sortedEvents.slice(0, 20).map((event) => ({
      title: String(event?.title || ""),
      eventId: String(event?.eventId || ""),
      startTime: String(event?.startTime || ""),
      endTime: String(event?.endTime || ""),
    })))
    const fetchedEventIds = new Set(
      sortedEvents
        .map((event) => String(event?.eventId || "").trim())
        .filter(Boolean)
    )
    const maxFetchedStudentDate = sortedEvents.reduce((latest, event) => {
      const dateKey = formatDateKeyInTimezone(event?.startTime, studentTimezone)
      if (!dateKey) return latest
      return !latest || dateKey > latest ? dateKey : latest
    }, "")

    for (const event of sortedEvents) {
      const eventId = String(event?.eventId || "").trim()
      const startTime = String(event?.startTime || "").trim()
      if (!startTime) continue
      const studentSessionDate = formatDateKeyInTimezone(startTime, studentTimezone)
      const tutorSessionDate = formatDateKeyInTimezone(startTime, tutorTimezone)
      if (!studentSessionDate) {
        skipped += 1
        skipReasons.missingStudentDate += 1
        console.warn(`[calendar] skip missing studentSessionDate student="${student?.name || ""}" subject="${subject?.name || ""}" eventId="${eventId}" startTime="${startTime}"`)
        continue
      }
      const compositeKey = `${studentSessionDate}::${startTime}`
      const existingRow = (eventId && existingByEvent.get(eventId)) || existingByComposite.get(compositeKey) || null
      console.log(`[calendar] candidate event student="${student?.name || ""}" subject="${subject?.name || ""}" title="${String(event?.title || "")}" eventId="${eventId}" studentDate="${studentSessionDate}" tutorDate="${tutorSessionDate}" compositeKey="${compositeKey}" existingRowId="${existingRow?.id || ""}"`)

      if (existingRow?.id) {
        const isPast = Boolean(studentToday && studentSessionDate < studentToday)
        const isLocked = hasLockedSessionWork(existingRow)
        if (isPast || isLocked) {
          skipped += 1
          if (isPast) skipReasons.existingPast += 1
          if (isLocked) skipReasons.existingLocked += 1
          console.log(`[calendar] skip existing row id="${existingRow.id}" reason="${isPast ? "past" : ""}${isPast && isLocked ? "+" : ""}${isLocked ? "locked" : ""}" studentDate="${studentSessionDate}" today="${studentToday}"`)
          continue
        }

        const currentEventId = String(existingRow.eventId || "").trim()
        const currentTitle = String(existingRow.title || "").trim()
        const nextTitle = buildSessionName(student.name, subject.name, studentSessionDate)
        const nextEndTime = String(event?.endTime || "").trim()
        const shouldUpdate =
          currentTitle !== nextTitle ||
          String(existingRow.studentSessionDate || "") !== String(studentSessionDate || "") ||
          String(existingRow.tutorSessionDate || "") !== String(tutorSessionDate || "") ||
          String(existingRow.startTime || "") !== startTime ||
          String(existingRow.endTime || "") !== nextEndTime ||
          currentEventId !== eventId

        if (!shouldUpdate) {
          skipped += 1
          skipReasons.existingUnchanged += 1
          console.log(`[calendar] skip existing row id="${existingRow.id}" reason="unchanged" eventId="${eventId}"`)
          continue
        }

        await updateSessionArtifacts(existingRow.id, {
          Name: { title: [{ text: { content: nextTitle.slice(0, 120) } }] },
          "Student Session Date": { date: { start: String(studentSessionDate || "") } },
          "Start Time": startTime ? { date: { start: String(startTime) } } : { date: null },
          "End Time": nextEndTime ? { date: { start: nextEndTime } } : { date: null },
          "Calendar Event ID": { rich_text: eventId ? [{ text: { content: eventId.slice(0, 1900) } }] : [] },
        })
        updated += 1
        console.log(`[calendar] updated existing row id="${existingRow.id}" eventId="${eventId}" studentDate="${studentSessionDate}"`)
        if (eventId) existingByEvent.set(eventId, { ...existingRow, eventId, studentSessionDate, startTime })
        existingByComposite.delete(`${existingRow.studentSessionDate}::${existingRow.startTime}`)
        existingByComposite.set(compositeKey, { ...existingRow, eventId, studentSessionDate, startTime })
        continue
      }

      if ((eventId && existingByEvent.has(eventId)) || existingByComposite.has(compositeKey)) {
        skipped += 1
        skipReasons.duplicateIndexHit += 1
        console.log(`[calendar] skip duplicate index hit eventId="${eventId}" compositeKey="${compositeKey}"`)
        continue
      }

      const createdRow = await createSessionRow({
        studentId: student.id,
        subjectId: subject.id,
        title: buildSessionName(student.name, subject.name, studentSessionDate),
        studentSessionDate,
        startTime,
        endTime: event?.endTime || "",
        eventId,
        sessionSource: "calendar_exact",
        sessionNotes: "",
      })

      if (createdRow?.id) {
        created += 1
        console.log(`[calendar] created session row id="${createdRow.id}" eventId="${eventId}" studentDate="${studentSessionDate}"`)
        const createdSession = {
          id: createdRow.id,
          eventId,
          studentSessionDate,
          startTime,
          preClassAttemptIds: [],
          exitTicketAttemptIds: [],
          homeworkAttemptIds: [],
        }
        if (eventId) existingByEvent.set(eventId, createdSession)
        existingByComposite.set(compositeKey, createdSession)
      } else {
        skipped += 1
        skipReasons.createFailed += 1
        console.warn(`[calendar] createSessionRow failed student="${student?.name || ""}" subject="${subject?.name || ""}" eventId="${eventId}" studentDate="${studentSessionDate}" start="${startTime}" end="${String(event?.endTime || "")}" response=${JSON.stringify(createdRow).slice(0, 400)}`)
      }
    }

    for (const row of existingSessions) {
      const eventId = String(row?.eventId || "").trim()
      if (!row?.id || !eventId) continue
      if (fetchedEventIds.has(eventId)) continue
      if (!row.studentSessionDate || row.studentSessionDate < studentToday) continue
      if (hasLockedSessionWork(row)) continue
      if (maxFetchedStudentDate && row.studentSessionDate > maxFetchedStudentDate) continue
      await archiveSessionRow(row.id)
      archived += 1
      console.log(`[calendar] archived stale future session row id="${row.id}" eventId="${eventId}" studentDate="${row.studentSessionDate}"`)
    }

    console.log(`[calendar] ensureSessionsForStudentSubject summary student="${student?.name || ""}" subject="${subject?.name || ""}" created=${created} updated=${updated} archived=${archived} skipped=${skipped} skipReasons=${JSON.stringify(skipReasons)}`)
    return { created, updated, archived, skipped }
  } catch (err) {
    console.warn("[calendar] ensureSessionsForStudentSubject failed:", err?.message || err)
    return { created: 0, updated: 0, archived: 0, skipped: 0, error: err?.message || String(err) }
  }
}

export async function isTutorCalendarConnected() {
  return !!process.env.TUTOR_GOOGLE_REFRESH_TOKEN
}

function extractZoomLink(event) {
  if (event.location?.includes("zoom.us")) return event.location
  const desc = event.description || ""
  const zoomMatch = desc.match(/https:\/\/[a-z0-9.]*zoom\.us\/j\/[^\s<"]+/)
  if (zoomMatch) return zoomMatch[0]
  const entryPoints = event.conferenceData?.entryPoints || []
  const videoEntry = entryPoints.find(e => e.entryPointType === "video")
  if (videoEntry?.uri) return videoEntry.uri
  return null
}

export function getMinutesUntilClass(startTimeISO) {
  if (!startTimeISO) return null
  return Math.floor((new Date(startTimeISO) - new Date()) / 60000)
}

export function isWithinExitTicketWindow(endTimeISO) {
  if (!endTimeISO) return false
  const diffMinutes = (new Date() - new Date(endTimeISO)) / 60000
  return diffMinutes >= 0 && diffMinutes <= 60
}
