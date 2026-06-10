// Homework logic — streak tracking, combo system, weakness reduction

export const HW_CORRECT_REDUCTION = 0.05
export const PARTIAL_COMBO_REDUCTION = 0.25  // 2+ day streak
export const FULL_COMBO_REDUCTION = 0.5       // correct every day between sessions
export const HOMEWORK_DAILY_COUNT = 3

const DAY_MS = 24 * 60 * 60 * 1000

function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDateKeyInTimezone(dateLike, timeZone = "UTC") {
  const date = toDate(dateLike)
  if (!date) return null
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function normalizeEvent(event) {
  const start = toDate(event?.startTime)
  if (!start) return null
  const end = toDate(event?.endTime || (event?.duration ? start.getTime() + event.duration * 60000 : null))
  return {
    ...event,
    start,
    end: end || new Date(start.getTime() + 60 * 60000),
  }
}

export function resolveHomeworkSessionWindow(events = [], now = new Date()) {
  const current = toDate(now) || new Date()
  const normalized = events
    .map(normalizeEvent)
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

  const currentSession = normalized.find((event) => event.start <= current && current < event.end) || null
  const lastCompletedSession = normalized.filter((event) => event.end <= current).at(-1) || null
  const nextSession = normalized.find((event) => event.start > current) || null

  return { currentSession, lastCompletedSession, nextSession, events: normalized }
}

export function buildHomeworkCycle({
  lastCompletedSession,
  nextSession,
  sessionTimezone,
  tutorTimezone = "UTC",
  now = new Date(),
} = {}) {
  const current = toDate(now) || new Date()
  const completed = normalizeEvent(lastCompletedSession)
  const upcoming = normalizeEvent(nextSession)

  if (!completed) {
    return {
      available: false,
      reason: "no_completed_session",
    }
  }

  const unlockAt = completed.end
  if (current < unlockAt) {
    return {
      available: false,
      reason: "session_in_progress",
      unlockAt: unlockAt.toISOString(),
    }
  }

  if (upcoming && current >= upcoming.start) {
    return {
      available: false,
      reason: "next_session_started",
      unlockAt: unlockAt.toISOString(),
      nextSessionStart: upcoming.start.toISOString(),
    }
  }

  const cycleIndex = Math.max(0, Math.floor((current.getTime() - unlockAt.getTime()) / DAY_MS))
  const cycleStart = new Date(unlockAt.getTime() + cycleIndex * DAY_MS)
  const naturalExpireAt = new Date(cycleStart.getTime() + DAY_MS)
  const expireAt = upcoming && naturalExpireAt > upcoming.start ? upcoming.start : naturalExpireAt
  const effectiveTimezone = sessionTimezone || tutorTimezone
  const tutorSessionDate = formatDateKeyInTimezone(completed.start, effectiveTimezone) || completed.start.toISOString().slice(0, 10)

  return {
    available: true,
    sessionDate: tutorSessionDate,
    unlockAt: unlockAt.toISOString(),
    cycleIndex,
    cycleStart: cycleStart.toISOString(),
    expireAt: expireAt.toISOString(),
    nextSessionStart: upcoming?.start?.toISOString() || null,
  }
}

export function listHomeworkCycles(events = [], now = new Date(), {
  pastCount = 2,
  futureCount = 5,
  sessionTimezone = "UTC",
} = {}) {
  const current = toDate(now) || new Date()
  const normalized = events
    .map(normalizeEvent)
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)

  if (normalized.length < 2) return []

  const windows = []
  for (let i = 0; i < normalized.length - 1; i++) {
    const completed = normalized[i]
    const next = normalized[i + 1]
    if (!completed?.end || !next?.start || completed.end >= next.start) continue
    const status = current < completed.end
      ? "future"
      : current >= next.start
        ? "past"
        : "current"
    windows.push({
      cycleIndex: i,
      label: `Cycle ${i + 1}`,
      status,
      sessionDate: formatDateKeyInTimezone(completed.start, sessionTimezone),
      nextSessionDate: formatDateKeyInTimezone(next.start, sessionTimezone),
      unlockAt: completed.end.toISOString(),
      cycleStart: completed.end.toISOString(),
      expireAt: next.start.toISOString(),
      nextSessionStart: next.start.toISOString(),
    })
  }

  if (!windows.length) return []

  let focusIndex = windows.findIndex((item) => item.status === "current")
  if (focusIndex < 0) focusIndex = Math.max(0, windows.length - 1)
  const start = Math.max(0, focusIndex - pastCount)
  const end = Math.min(windows.length, focusIndex + futureCount + 1)
  return windows.slice(start, end)
}

export function takeCycledDistinct(items = [], startIndex = 0, count = HOMEWORK_DAILY_COUNT) {
  if (!Array.isArray(items) || !items.length || count <= 0) return []
  const target = Math.min(count, items.length)
  const out = []
  const seen = new Set()

  for (let offset = 0; offset < items.length * 2 && out.length < target; offset++) {
    const item = items[(startIndex + offset) % items.length]
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
  }

  return out
}

// Get days between two session dates
export function getDaysBetweenSessions(sessionDates) {
  if (!sessionDates || sessionDates.length < 2) return 7 // default
  const sorted = [...sessionDates].sort()
  const gaps = []
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i-1])
    const b = new Date(sorted[i])
    gaps.push(Math.round((b - a) / (1000 * 60 * 60 * 24)))
  }
  // Return average gap
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
}

// Given a student's HW records for a question, calculate combo reduction
// hwRecords: [{ date: "2026-02-20", correct: true }, ...]
// sessionDates: ["2026-02-17", "2026-02-24"]
export function calculateComboReduction(hwRecords, sessionDates) {
  if (!hwRecords?.length) return 0

  const sorted = [...hwRecords].sort((a, b) => a.date.localeCompare(b.date))
  
  // Find the two most recent sessions
  const recentSessions = [...sessionDates].sort().slice(-2)
  if (recentSessions.length < 2) return 0

  const [lastSession, nextSession] = recentSessions
  
  // Get HW done between those two sessions
  const hwBetween = sorted.filter(r => r.date > lastSession && r.date < nextSession)
  if (!hwBetween.length) return 0

  // Count streak of correct answers
  let streak = 0
  let maxStreak = 0
  let currentStreak = 0
  
  for (const record of hwBetween) {
    if (record.correct) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else {
      currentStreak = 0
    }
    streak = maxStreak
  }

  const daysBetween = getDaysBetweenSessions(recentSessions)
  const allCorrect = hwBetween.length >= daysBetween && hwBetween.every(r => r.correct)

  if (allCorrect) return FULL_COMBO_REDUCTION
  if (streak >= 2) return PARTIAL_COMBO_REDUCTION
  return 0
}

// Select 3 HW questions weighted by weakness score
export function selectHomeworkQuestions(questionsWithScores, count = 3) {
  if (!questionsWithScores?.length) return []
  
  // Weight by score — higher score = more likely
  const weighted = questionsWithScores.map(q => ({
    ...q,
    weight: Math.max(q.weaknessScore || 0, 0.5) // min weight 0.5 so all questions can appear
  }))

  const totalWeight = weighted.reduce((sum, q) => sum + q.weight, 0)
  const selected = []
  const used = new Set()

  for (let i = 0; i < count && i < weighted.length; i++) {
    let rand = Math.random() * totalWeight
    for (const q of weighted) {
      if (used.has(q.id)) continue
      rand -= q.weight
      if (rand <= 0) {
        selected.push(q)
        used.add(q.id)
        break
      }
    }
  }

  // Fill remaining if weighted selection didn't get enough
  if (selected.length < count) {
    for (const q of weighted) {
      if (selected.length >= count) break
      if (!used.has(q.id)) selected.push(q)
    }
  }

  return selected
}

export function applyWeaknessFloor(score) {
  return Math.max(0, score)
}
