import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import fs from "fs"
import path from "path"
import {
  fetchTutorCalendarEvents,
  getCalendarSubjectCandidates,
  matchesCalendarEvent,
} from "../../../lib/tutor-calendar"

const ADMIN_EMAIL = "kbohuastt@gmail.com"
const CACHE_PATH = path.join(process.cwd(), ".calendar-cache.json")
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

function formatLocalYYYYMMDD(d) {
  const pad = n => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function readCache() {
  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf8")
    const cache = JSON.parse(raw)
    if (Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.events
  } catch {}
  return null
}

function writeCache(events) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ fetchedAt: Date.now(), events }))
  } catch {}
}

function formatTimeInTimezone(dateLike, timeZone = "UTC") {
  if (!dateLike) return "All day"
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateLike))
  } catch {
    return "All day"
  }
}

function parseDateOnly(value = "") {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, year, month, day] = match
  return new Date(`${year}-${month}-${day}T00:00:00`)
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  if (!process.env.TUTOR_GOOGLE_REFRESH_TOKEN) {
    return res.status(200).json({ dates: [], error: "Calendar not connected" })
  }

  const { studentName, subjectName, studentTimezone = "UTC", refresh, startDate = "", endDate = "" } = req.query

  try {
    const isPast = req.query.past === "1"
    const explicitStart = parseDateOnly(startDate)
    const explicitEndBase = parseDateOnly(endDate)
    const explicitEnd = explicitEndBase
      ? new Date(explicitEndBase.getTime() + (24 * 60 * 60 * 1000) - 1)
      : null

    if (explicitStart && explicitEnd && explicitEnd < explicitStart) {
      return res.status(200).json({ dates: [], error: "Calendar end date must be on or after the start date." })
    }

    // Use cache if fresh — pass ?refresh=1 to force re-fetch (cache is for future events only)
    let events = (!refresh && !isPast) ? readCache() : null

    if (!events) {
      const now = new Date()
      if (isPast) {
        const start = explicitStart || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        const end = explicitEnd ? new Date(Math.min(explicitEnd.getTime(), now.getTime())) : now
        if (end < start) {
          events = []
        } else {
          events = await fetchTutorCalendarEvents(start, end, 150)
        }
      } else {
        const start = explicitStart ? new Date(Math.max(explicitStart.getTime(), now.getTime())) : now
        const end = explicitEnd || new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000) // 60 days out
        if (end < start) {
          events = []
        } else {
          events = await fetchTutorCalendarEvents(start, end, 150)
        }
      }
      if (!isPast) {
        writeCache(events)
        console.log("[calendar-events] fetched fresh from Google, cached", events.length, "events")
      } else {
        console.log("[calendar-events] fetched past events from Google:", events.length)
      }
    } else {
      console.log("[calendar-events] serving from cache")
    }

    // Format: "AP Physics C (Mechanics)-Agasti" or "AS level Math, Dhyani"
    // Separator can be - or , — we just check if both names appear anywhere in title
    // Case-insensitive. Use first 3 words of subject to handle truncated titles.
    // Format: "AS level Math/Stat/Mech, Akash" or "AP Physics C (Mechanics)-Agasti"
    // colorId is undefined for calendar-colored recurring events — do not filter by it
    // Use partial name matching: calendar may have "Akash" while Notion has "Aakash"
    const firstName = (studentName || "").toLowerCase().trim()
    const subjectCandidates = getCalendarSubjectCandidates(subjectName)

    const finalEvents = events.filter(e => {
      const title = e.summary || ""
      return matchesCalendarEvent(title, firstName, subjectName)
    })


    // Extract unique dates (YYYY-MM-DD), deduplicated
    const seen = new Set()
    const dates = []
    for (const e of finalEvents) {
      const date = e.start?.date || e.start?.dateTime?.split("T")[0]
      if (date && !seen.has(date)) {
        seen.add(date)
        dates.push({
          date,
          title: e.summary || "",
          time: e.start?.dateTime
            ? formatTimeInTimezone(e.start.dateTime, studentTimezone)
            : "All day"
        })
      }
    }

    const isInfer = req.query.infer === "1"

    if (isInfer) {
      // ── INFER MODE ──
      // Use future matched events to detect the recurring weekday+time pattern,
      // then project backwards to find the last 2 class occurrences before today.
      // We need future events for this, so re-fetch if we only have past events.
      let futureEvents = events
      if (isPast) {
        const now2 = new Date()
        const end2 = new Date(now2.getTime() + 60 * 24 * 60 * 60 * 1000)
        futureEvents = await fetchTutorCalendarEvents(now2, end2, 150)
      }

      const futureMatched = futureEvents.filter(e => {
        const title = e.summary || ""
        return matchesCalendarEvent(title, firstName, subjectName)
      })

      if (futureMatched.length < 2) {
        // Not enough future events to detect a pattern
        return res.status(200).json({ dates: [], inferred: true, error: "Not enough future events to detect schedule pattern" })
      }

      // Collect weekday → time occurrences from future events
      const weekdayTimes = {}
      for (const e of futureMatched) {
        const dt = e.start?.dateTime
        if (!dt) continue
        const d = new Date(dt)
        const weekday = d.getDay() // 0=Sun … 6=Sat
        const timeStr = formatTimeInTimezone(d, studentTimezone)
        if (!weekdayTimes[weekday]) weekdayTimes[weekday] = {}
        weekdayTimes[weekday][timeStr] = (weekdayTimes[weekday][timeStr] || 0) + 1
      }

      // Find the dominant weekday (highest count)
      let bestDay = null, bestCount = 0
      for (const [day, times] of Object.entries(weekdayTimes)) {
        const count = Object.values(times).reduce((a, b) => a + b, 0)
        if (count > bestCount) { bestCount = count; bestDay = parseInt(day) }
      }

      if (bestDay === null) {
        return res.status(200).json({ dates: [], inferred: true, error: "Could not detect recurring weekday" })
      }

      // Find dominant time for that weekday
      const timeCounts = weekdayTimes[bestDay]
      const bestTime = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0][0]

      // Project back: find the last 2 occurrences of bestDay before today
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const inferredDates = []
      const cursor = new Date(today)
      cursor.setDate(cursor.getDate() - 1) // start from yesterday

      while (inferredDates.length < 2) {
        if (cursor.getDay() === bestDay) {
          inferredDates.push({
            // Do NOT use toISOString() here: that formats in UTC and can shift the date by -1 day
            // for positive offsets like Asia/Kolkata.
            date: formatLocalYYYYMMDD(cursor),
            time: bestTime,
            title: `Inferred from schedule (${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][bestDay]}s at ${bestTime})`,
            inferred: true,
          })
        }
        cursor.setDate(cursor.getDate() - 1)
        if (inferredDates.length >= 2 || cursor < new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)) break
      }

      console.log("[calendar-events] inferred past dates:", inferredDates, "from pattern: weekday", bestDay, "at", bestTime)
      return res.status(200).json({ dates: inferredDates, inferred: true, pattern: { weekday: bestDay, time: bestTime } })
    }

    // Past mode: return 2 most recent (reverse chronological). Future: up to 8.
    const result = isPast ? dates.slice(-2).reverse() : dates.slice(0, 8)
    return res.status(200).json({ dates: result, isPast })
  } catch (err) {
    console.error("Calendar events error:", err)
    return res.status(200).json({ dates: [], error: err.message })
  }
}
