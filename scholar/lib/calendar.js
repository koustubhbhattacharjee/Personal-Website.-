// Google Calendar via REST API (no googleapis SDK — not compatible with Next.js edge)

export async function getUpcomingClassEvent(accessToken, subjectName) {
  const now = new Date()
  const lookback = new Date(now.getTime() - 3 * 60 * 60 * 1000)
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const params = new URLSearchParams({
    timeMin: lookback.toISOString(),
    timeMax: weekAhead.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    q: subjectName,
    maxResults: "10",
  })

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  const data = await res.json()
  const events = data.items || []

  const match = events.find(e =>
    e.summary?.toLowerCase().includes(subjectName.toLowerCase()) ||
    e.description?.toLowerCase().includes(subjectName.toLowerCase())
  )

  if (!match) return null

  return {
    title: match.summary,
    startTime: match.start?.dateTime || match.start?.date,
    endTime: match.end?.dateTime || match.end?.date,
    zoomLink: extractZoomLink(match),
    eventId: match.id,
  }
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

export function hasExitTicketWindowPassed(endTimeISO) {
  if (!endTimeISO) return false
  return (new Date() - new Date(endTimeISO)) / 60000 > 60
}
