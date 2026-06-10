import { useMemo, useRef, useState } from "react"
import FullCalendar from "@fullcalendar/react"
import interactionPlugin from "@fullcalendar/interaction"
import timeGridPlugin from "@fullcalendar/timegrid"

function toIso(value) {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

function getZonedParts(dateLike, timeZone) {
  if (!dateLike) return null
  try {
    const date = dateLike instanceof Date ? dateLike : new Date(dateLike)
    if (Number.isNaN(date.getTime())) return null
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date)
    const get = (type) => parts.find((part) => part.type === type)?.value || ""
    return {
      year: get("year"),
      month: get("month"),
      day: get("day"),
      hour: get("hour"),
      minute: get("minute"),
      second: get("second"),
    }
  } catch {
    return null
  }
}

function toDisplayIso(dateLike, timeZone) {
  const p = getZonedParts(dateLike, timeZone)
  if (!p) return ""
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`
}

function formatInTimezone(dateLike, timeZone, options = {}) {
  if (!dateLike) return ""
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      ...options,
    }).format(new Date(dateLike))
  } catch {
    return ""
  }
}

export default function AdminSchedulingCalendar({
  title,
  subtitle,
  mode,
  lightMode = false,
  studentTimezone = "UTC",
  sessions = [],
  cycles = [],
  cycle = null,
  notice = "",
  cards = [],
  activeAction = "",
  onActionChange,
  onSessionClick,
  onRangeSelect,
}) {
  const [hoveredEvent, setHoveredEvent] = useState(null)
  const shellRef = useRef(null)
  const theme = lightMode ? lightTheme : darkTheme

  const events = useMemo(() => {
    const sessionEvents = (sessions || []).map((session) => ({
      id: `session:${session.id}`,
      title: `${session.title || "Session"}${session.importLocked && mode === "import" ? " · locked" : ""}`,
      start: toDisplayIso(session.startTime, studentTimezone),
      end: toDisplayIso(session.endTime, studentTimezone),
      backgroundColor: session.importLocked && mode === "import" ? "#4f2626" : "#1f3d5a",
      borderColor: session.importLocked && mode === "import" ? "#9a4d4d" : "#4f88c6",
      textColor: "#f8fbff",
      extendedProps: { kind: "session", session },
    }))

    const cycleEvents = mode === "homework" && Array.isArray(cycles) && cycles.length
      ? cycles.map((entry) => {
          const palette = entry.status === "past"
            ? { backgroundColor: "rgba(116, 141, 171, 0.16)", borderColor: "#6f8cac", textColor: "#d7e4f3" }
            : entry.status === "future"
              ? { backgroundColor: "rgba(120, 168, 116, 0.14)", borderColor: "#73a16c", textColor: "#ddf0d8" }
              : { backgroundColor: "rgba(201, 168, 76, 0.18)", borderColor: "#c9a84c", textColor: "#f4e5b1" }
          return {
            id: `cycle:${entry.cycleIndex}`,
            title: `${entry.label || `Cycle ${Number(entry.cycleIndex || 0) + 1}`} · ${entry.sessionDate}`,
            start: toDisplayIso(entry.cycleStart, studentTimezone),
            end: toDisplayIso(entry.expireAt, studentTimezone),
            ...palette,
            extendedProps: { kind: "cycle", cycle: entry },
          }
        })
      : []

    return [...sessionEvents, ...cycleEvents]
  }, [sessions, cycles, mode])

  const initialDate = cycle?.available
    ? toDisplayIso(cycle.unlockAt, studentTimezone)
    : toDisplayIso(sessions[0]?.startTime || new Date().toISOString(), studentTimezone)

  function buildHoverCard(eventTitle, lines, element) {
    const shellEl = shellRef.current
    if (!shellEl || !element) {
      return { title: eventTitle, lines, anchorX: 0, anchorY: 0, cardX: 0, cardY: 0, path: "" }
    }

    const shellRect = shellEl.getBoundingClientRect()
    const eventRect = element.getBoundingClientRect()
    const anchorX = eventRect.left - shellRect.left + (eventRect.width / 2)
    const anchorY = eventRect.top - shellRect.top + (eventRect.height / 2)
    const cardWidth = Math.min(260, Math.max(220, shellRect.width * 0.34))
    const estimatedHeight = 56 + (lines.length * 20)
    const preferLeft = anchorX > shellRect.width * 0.58
    const cardX = preferLeft
      ? Math.max(12, anchorX - cardWidth - 34)
      : Math.min(shellRect.width - cardWidth - 12, anchorX + 34)
    const cardY = Math.max(12, Math.min(shellRect.height - estimatedHeight - 12, anchorY - (estimatedHeight / 2)))
    const targetX = preferLeft ? cardX + cardWidth : cardX
    const targetY = cardY + (estimatedHeight / 2)
    const controlX = preferLeft ? targetX + 40 : targetX - 40
    const path = `M ${anchorX} ${anchorY} C ${controlX} ${anchorY}, ${controlX} ${targetY}, ${targetX} ${targetY}`

    return { title: eventTitle, lines, anchorX, anchorY, cardX, cardY, cardWidth, path }
  }

  return (
    <div style={{ ...styles.wrap, ...theme.wrap }}>
      <div style={styles.header}>
        <div>
          <div style={{ ...styles.title, ...theme.title }}>{title}</div>
          <div style={{ ...styles.subtitle, ...theme.subtitle }}>{subtitle}</div>
        </div>
        <div style={{ ...styles.tzPill, ...theme.tzPill }}>{studentTimezone}</div>
      </div>

      <div style={styles.cardRow}>
        {cards.map((card) => {
          const active = activeAction === card.id
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onActionChange?.(active ? "" : card.id)}
              style={{
                ...styles.card,
                ...(active ? styles.cardActive : {}),
                ...theme.card,
                ...(active ? theme.cardActive : {}),
              }}
            >
              <div style={{ ...styles.cardLabel, ...theme.cardLabel }}>{card.label}</div>
              <div style={{ ...styles.cardDesc, ...theme.cardDesc }}>{card.description}</div>
            </button>
          )
        })}
      </div>

      {notice && <div style={{ ...styles.notice, ...theme.notice }}>{notice}</div>}

      <div ref={shellRef} style={{ ...styles.calendarShell, ...theme.calendarShell }}>
        {hoveredEvent && (
          <div style={styles.hoverOverlay}>
            <svg style={styles.hoverSvg}>
              <path d={hoveredEvent.path} style={{ ...styles.hoverPath, ...theme.hoverPath }} />
            </svg>
            <div
              style={{
                ...styles.hoverPanelFloating,
                ...theme.hoverPanel,
                left: hoveredEvent.cardX,
                top: hoveredEvent.cardY,
                width: hoveredEvent.cardWidth,
              }}
            >
              <div style={{ ...styles.hoverTitle, ...theme.hoverTitle }}>{hoveredEvent.title}</div>
              {hoveredEvent.lines.map((line) => (
                <div key={line} style={{ ...styles.hoverMeta, ...theme.hoverMeta }}>{line}</div>
              ))}
            </div>
          </div>
        )}
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          initialDate={initialDate}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "timeGridDay,timeGridWeek",
          }}
          height="auto"
          allDaySlot={false}
          nowIndicator
          selectable
          selectMirror
          timeZone="UTC"
          slotDuration="01:00:00"
          snapDuration="00:30:00"
          eventTimeFormat={{ hour: "numeric", minute: "2-digit", meridiem: "short" }}
          events={events}
          eventContent={(arg) => {
            const payload = arg.event.extendedProps || {}
            if (payload.kind === "cycle") {
              return (
                <div style={styles.cycleGhost}>
                  <div style={styles.cycleGlow} />
                </div>
              )
            }
            return (
              <div style={styles.sessionEvent}>
                <div style={styles.sessionEventTitle}>{arg.event.title}</div>
              </div>
            )
          }}
          select={(info) => onRangeSelect?.({
            start: toIso(info.start),
            end: toIso(info.end),
            startStr: info.startStr,
            endStr: info.endStr,
            studentDateStr: info.startStr.slice(0, 10),
            displayTime: true,
            viewType: info.view.type,
          })}
          eventClick={(clickInfo) => {
            const payload = clickInfo.event.extendedProps || {}
            if (payload.kind === "session") onSessionClick?.(payload.session)
            if (payload.kind === "cycle") {
              onRangeSelect?.({
                start: toIso(payload.cycle?.unlockAt),
                end: toIso(payload.cycle?.expireAt),
                cycleHit: true,
                viewType: clickInfo.view.type,
              })
            }
          }}
          eventMouseEnter={(mouseInfo) => {
            const payload = mouseInfo.event.extendedProps || {}
            if (payload.kind === "cycle" && payload.cycle) {
              setHoveredEvent(buildHoverCard(
                payload.cycle.label || "Current cycle",
                [
                  `Session ${payload.cycle.sessionDate}`,
                  `Status ${payload.cycle.status || "current"}`,
                  `Unlocks ${formatInTimezone(payload.cycle.unlockAt, studentTimezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
                  `Expires ${formatInTimezone(payload.cycle.expireAt, studentTimezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
                ],
                mouseInfo.el
              ))
              return
            }
            if (payload.kind === "session" && payload.session) {
              const session = payload.session
              const lines = []
              if (session.studentDateLabel || session.studentTimeLabel) {
                lines.push(`${session.studentDateLabel || ""} ${session.studentTimeLabel || ""}${session.studentEndTimeLabel ? ` - ${session.studentEndTimeLabel}` : ""}`.trim())
              }
              if (session.tutorDateLabel || session.tutorTimeLabel) {
                lines.push(`Tutor ${session.tutorDateLabel || ""} ${session.tutorTimeLabel || ""}`.trim())
              }
              if (session.importLocked && mode === "import") lines.push("Import locked for this past session")
              if (session.zoomLink) lines.push("Zoom link available")
              setHoveredEvent(buildHoverCard(session.title || "Session", lines, mouseInfo.el))
            }
          }}
          eventMouseLeave={() => setHoveredEvent(null)}
        />
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 12,
    flexWrap: "wrap",
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 1.5,
    maxWidth: 680,
  },
  tzPill: {
    borderRadius: 999,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  cardRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: 10,
    marginBottom: 12,
  },
  card: {
    textAlign: "left",
    borderRadius: 10,
    padding: 12,
    cursor: "pointer",
  },
  cardActive: {
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 11,
    lineHeight: 1.45,
  },
  notice: {
    marginBottom: 12,
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 12,
    lineHeight: 1.5,
  },
  hoverPanel: {
    borderRadius: 10,
    padding: 12,
    display: "grid",
    gap: 4,
  },
  hoverPanelFloating: {
    position: "absolute",
    zIndex: 6,
    boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
  },
  hoverTitle: {
    fontSize: 13,
    fontWeight: 700,
  },
  hoverMeta: {
    fontSize: 11,
    lineHeight: 1.45,
  },
  calendarShell: {
    borderRadius: 12,
    overflow: "visible",
    position: "relative",
  },
  hoverOverlay: {
    position: "absolute",
    inset: 0,
    zIndex: 5,
    pointerEvents: "none",
  },
  hoverSvg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    overflow: "visible",
  },
  hoverPath: {
    fill: "none",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeDasharray: "4 6",
  },
  cycleGhost: {
    display: "flex",
    alignItems: "stretch",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    minHeight: 18,
  },
  cycleGlow: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    background: "rgba(201, 168, 76, 0.18)",
  },
  sessionEvent: {
    width: "100%",
    height: "100%",
    overflow: "hidden",
  },
  sessionEventTitle: {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontSize: 11,
    fontWeight: 700,
  },
}

const darkTheme = {
  wrap: { border: "1px solid #242424", background: "#0d0d0d" },
  title: { color: "#f3f0e6" },
  subtitle: { color: "#8b877e" },
  tzPill: { border: "1px solid #2e2610", background: "#15120a", color: "#d9c08a" },
  card: { background: "#111111", border: "1px dashed #383838" },
  cardActive: { background: "#18130a", border: "1px solid #c9a84c" },
  cardLabel: { color: "#f2efe6" },
  cardDesc: { color: "#8b877f" },
  notice: { background: "#121923", border: "1px solid #253246", color: "#b7c9e7" },
  hoverPanel: { border: "1px solid #304867", background: "#101827" },
  hoverTitle: { color: "#d6e6ff" },
  hoverMeta: { color: "#9eb4d7" },
  calendarShell: { background: "#101010" },
  hoverPath: { stroke: "rgba(125, 177, 240, 0.9)" },
}

const lightTheme = {
  wrap: { border: "1px solid #ddd4c0", background: "#f8f3ea" },
  title: { color: "#2c2410" },
  subtitle: { color: "#7a6a50" },
  tzPill: { border: "1px solid #d8c39b", background: "#f3e7c7", color: "#6d5620" },
  card: { background: "#f5f0e8", border: "1px dashed #d3cab8" },
  cardActive: { background: "#f5e8c8", border: "1px solid #c9a84c" },
  cardLabel: { color: "#2c2410" },
  cardDesc: { color: "#7a6a50" },
  notice: { background: "#edf3fb", border: "1px solid #c8d7ee", color: "#435d85" },
  hoverPanel: { border: "1px solid #c8d7ee", background: "#eef4fb" },
  hoverTitle: { color: "#2f507f" },
  hoverMeta: { color: "#5b7194" },
  calendarShell: { background: "#ffffff" },
  hoverPath: { stroke: "rgba(88, 127, 182, 0.85)" },
}
