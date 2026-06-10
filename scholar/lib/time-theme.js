const TZ_MAP = {
  ist: "Asia/Kolkata",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  est: "America/New_York",
  edt: "America/New_York",
  cst: "America/Chicago",
  mst: "America/Denver",
  gmt: "Europe/London",
  bst: "Europe/London",
  utc: "UTC",
}

export function normalizeTimezone(timezone) {
  const value = String(timezone || "").trim()
  if (!value) return "UTC"
  if (value.includes("/")) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date())
      return value
    } catch {
      return "UTC"
    }
  }
  return TZ_MAP[value.toLowerCase()] || "UTC"
}

export function getHourForTimezone(timezone) {
  const resolvedTimezone = normalizeTimezone(timezone)
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: resolvedTimezone,
    }).formatToParts(new Date())
    const hourPart = parts.find((part) => part.type === "hour")
    if (hourPart?.value != null) return Number(hourPart.value)
  } catch {}
  try {
    const utcParts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "UTC",
    }).formatToParts(new Date())
    const utcHour = utcParts.find((part) => part.type === "hour")
    return Number(utcHour?.value ?? 12)
  } catch {
    return 12
  }
}

export function getTimeGreeting(timezone) {
  const h = getHourForTimezone(timezone)
  if (h >= 5 && h < 12) return "Good morning"
  if (h >= 12 && h < 17) return "Good afternoon"
  if (h >= 17 && h < 22) return "Good evening"
  return "Good night"
}

export function getTimeTheme(timezone) {
  const h = getHourForTimezone(timezone)
  if (h >= 5 && h < 12) {
    return {
      mode: "morning",
      markerLabel: "Sunrise",
      marker: "sun",
      style: {
        "--login-sky-top": "#ffb15f",
        "--login-sky-mid": "#ffcf7d",
        "--login-sky-bottom": "#fff1cf",
        "--login-glow": "rgba(255, 173, 72, 0.8)",
        "--marker-fill": "linear-gradient(180deg, rgba(255,244,214,0.92), rgba(255,206,112,0.72))",
        "--marker-color": "#ff8a00",
        "--headline-color": "#5c2f0a",
        "--subtle-color": "#7a5520",
        "--eyebrow-color": "rgba(92,47,10,0.72)",
      },
    }
  }
  if (h >= 12 && h < 17) {
    return {
      mode: "afternoon",
      markerLabel: "Afternoon",
      marker: "sun",
      style: {
        "--login-sky-top": "#ffe062",
        "--login-sky-mid": "#ffe98e",
        "--login-sky-bottom": "#fff7d2",
        "--login-glow": "rgba(255, 223, 90, 0.78)",
        "--marker-fill": "linear-gradient(180deg, rgba(255,250,214,0.94), rgba(255,232,120,0.74))",
        "--marker-color": "#f0b400",
        "--headline-color": "#5b4700",
        "--subtle-color": "#79651a",
        "--eyebrow-color": "rgba(91,71,0,0.7)",
      },
    }
  }
  if (h >= 17 && h < 22) {
    return {
      mode: "evening",
      markerLabel: "Evening",
      marker: "moon",
      style: {
        "--login-sky-top": "#b9c9ef",
        "--login-sky-mid": "#d5e2fa",
        "--login-sky-bottom": "#f6f9ff",
        "--login-glow": "rgba(171, 193, 241, 0.42)",
        "--marker-fill": "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(212,223,248,0.92))",
        "--marker-color": "#4d6899",
        "--headline-color": "#2c436f",
        "--subtle-color": "#617da9",
        "--eyebrow-color": "rgba(44,67,111,0.66)",
      },
    }
  }
  return {
    mode: "night",
    markerLabel: "Night",
    marker: "moon",
    style: {
      "--login-sky-top": "#d8e1f3",
      "--login-sky-mid": "#e8eefb",
      "--login-sky-bottom": "#fbfdff",
      "--login-glow": "rgba(182, 199, 235, 0.34)",
      "--marker-fill": "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(225,233,248,0.94))",
      "--marker-color": "#5a6f99",
      "--headline-color": "#33486f",
      "--subtle-color": "#6e84ab",
      "--eyebrow-color": "rgba(51,72,111,0.62)",
    },
  }
}
