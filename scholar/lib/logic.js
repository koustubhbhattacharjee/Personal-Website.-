import { pushQuestionToDate } from "./db"

// ─────────────────────────────────────────────
//  QUESTION COUNT
//  duration (minutes) / 20, minimum 1
// ─────────────────────────────────────────────
export const DEFAULT_TYPES_PER_HOUR = 3

export function getQuestionCount(durationMinutes, typesPerHour = DEFAULT_TYPES_PER_HOUR) {
  // If duration is suspiciously small (≤ 10), assume it's in hours
  const hours = durationMinutes <= 10 ? durationMinutes : (durationMinutes / 60)
  const rate = Number.isFinite(typesPerHour) && typesPerHour > 0 ? typesPerHour : DEFAULT_TYPES_PER_HOUR
  return Math.max(1, Math.round(hours * rate))
}

// ─────────────────────────────────────────────
//  SWAP
//  Wrong answers from pre-class replace the
//  first N scheduled topics for today.
//  Displaced topics get pushed to next class.
// ─────────────────────────────────────────────
export async function applySwap({
  wrongQuestions,   // full question objects the student got wrong
  todayQuestions,   // today's scheduled question rows (parsed)
  nextClassDate,    // ISO date string for next class (relative to session date, not server clock)
  enrollmentDays,   // optional — used to recompute nextClassDate from session date if not provided
}) {
  if (!wrongQuestions.length) {
    return { triggered: false, swappedIn: [], swappedOut: [], previewTopics: [], sessionDate: null, nextClassDate: null }
  }

  // Use the session date from the displaced questions themselves, not the server clock.
  // todayQuestions come from getTodayScoreRows which already returns the most-recent-date rows.
  const sessionDate = todayQuestions[0]?.dateIntroduced || null

  // Compute nextClassDate from session date if not supplied or if we have a session date anchor.
  // This avoids the +7-days bug when server clock differs from import date.
  const targetDate = sessionDate
    ? getNextClassDateFrom(sessionDate, enrollmentDays || [])
    : (nextClassDate || getNextClassDateFrom(getTodayIST(), []))

  const today = sessionDate || getTodayIST()

  // Keep wrong topics unique to avoid duplicate schedule moves
  const uniqueWrong = []
  const seenWrongIds = new Set()
  for (const q of wrongQuestions) {
    if (!q?.id || seenWrongIds.has(q.id)) continue
    seenWrongIds.add(q.id)
    uniqueWrong.push(q)
  }

  if (!uniqueWrong.length) {
    return { triggered: false, swappedIn: [], swappedOut: [], previewTopics: [], sessionDate: today, nextClassDate: targetDate }
  }

  const todayIds = new Set(todayQuestions.map(q => q.id))

  // If there is no current plan for this session, still pull wrong pre-class topics
  // into the active session date so FIFO always materializes something for the student.
  if (!todayQuestions.length) {
    const injectCount = uniqueWrong.length
    const actualSwapIn = uniqueWrong.slice(0, injectCount)
    await Promise.all(
      actualSwapIn.map((q) => pushQuestionToDate(q.id, today))
    )
    return {
      triggered: actualSwapIn.length > 0,
      swappedIn: actualSwapIn,
      swappedOut: [],
      previewTopics: actualSwapIn.map(q => ({ id: q.id, title: q.title || q.questionName || q.questionId })),
      sessionDate: today,
      nextClassDate: targetDate,
    }
  }

  // Prefer wrong topics not already scheduled today.
  // If all wrong topics are already in today's schedule, still force a swap window
  // so "any wrong pre-class answer" triggers the FIFO behavior.
  const preferredSwapIn = uniqueWrong.filter(q => !todayIds.has(q.id))
  const swapPool = preferredSwapIn.length ? preferredSwapIn : uniqueWrong
  const swapCount = Math.min(swapPool.length, todayQuestions.length)
  const actualSwapIn = swapPool.slice(0, swapCount)

  // Displace first topics not already being swapped in to avoid noop swaps.
  const swapInIds = new Set(actualSwapIn.map(q => q.id))
  const toSwapOut = todayQuestions
    .filter(q => !swapInIds.has(q.id))
    .slice(0, actualSwapIn.length)

  await Promise.all([
    // Push displaced topics to next class (anchored to session date, not server clock)
    ...toSwapOut.map(q => pushQuestionToDate(q.id, targetDate)),
    // Pull wrong topics into today (session date)
    ...actualSwapIn.map(q => pushQuestionToDate(q.id, today)),
  ])

  // Build the "today plan" as it should be used for the exit ticket:
  // swapped-in topics first, then the remaining original topics (excluding displaced).
  const swappedOutIds = new Set(toSwapOut.map(q => q.id))
  const remainingToday = todayQuestions
    .filter(q => !swappedOutIds.has(q.id) && !swapInIds.has(q.id))
    .map(q => ({ id: q.id, title: q.questionName || q.questionId }))
  const previewTopics = [
    ...actualSwapIn.map(q => ({ id: q.id, title: q.title || q.questionName || q.questionId })),
    ...remainingToday,
  ]

  return {
    triggered: actualSwapIn.length > 0,
    swappedIn: actualSwapIn,
    swappedOut: toSwapOut,
    previewTopics,
    sessionDate: today,
    nextClassDate: targetDate,
  }
}

// ─────────────────────────────────────────────
//  DATE HELPERS
// ─────────────────────────────────────────────
export function getTodayIST() {
  const istOffset = 5.5 * 60 * 60 * 1000
  return new Date(Date.now() + istOffset).toISOString().split("T")[0]
}

// ─────────────────────────────────────────────
//  NEXT CLASS DATE
//  Returns the next scheduled class day after a given anchor date string.
//  Uses enrollment days if available; otherwise +7 days from anchor.
// ─────────────────────────────────────────────
export function getNextClassDateFrom(anchorDateStr, enrollmentDays = []) {
  const dayMap = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6
  }

  // Parse anchor as UTC date (YYYY-MM-DD → midnight UTC)
  const anchor = new Date(anchorDateStr + "T00:00:00Z")

  if (!enrollmentDays.length) {
    const next = new Date(anchor)
    next.setUTCDate(next.getUTCDate() + 7)
    return next.toISOString().split("T")[0]
  }

  const scheduledDayNums = enrollmentDays
    .map(d => dayMap[d])
    .filter(d => d !== undefined)
    .sort()

  const anchorDay = anchor.getUTCDay()
  for (let i = 1; i <= 7; i++) {
    const checkDay = (anchorDay + i) % 7
    if (scheduledDayNums.includes(checkDay)) {
      const next = new Date(anchor)
      next.setUTCDate(next.getUTCDate() + i)
      return next.toISOString().split("T")[0]
    }
  }

  const next = new Date(anchor)
  next.setUTCDate(next.getUTCDate() + 7)
  return next.toISOString().split("T")[0]
}

export function getNextClassDate(enrollmentDays = []) {
  return getNextClassDateFrom(getTodayIST(), enrollmentDays)
}

// ─────────────────────────────────────────────
//  TRENDS
//  Compare oldest vs newest score per topic
// ─────────────────────────────────────────────
export function calculateTrends(allScores) {
  const byTopic = {}
  allScores.forEach(s => {
    if (!s.topic) return
    if (!byTopic[s.topic]) byTopic[s.topic] = []
    byTopic[s.topic].push(s)
  })

  const uptrend = []
  const downtrend = []

  Object.entries(byTopic).forEach(([topic, scores]) => {
    if (scores.length < 2) return
    const sorted = [...scores].sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt))
    const first = sorted[0].score
    const last = sorted[sorted.length - 1].score
    if (last < first) uptrend.push({ topic, currentScore: last, previousScore: first })
    else if (last > first) downtrend.push({ topic, currentScore: last, previousScore: first })
  })

  return { uptrend, downtrend }
}
