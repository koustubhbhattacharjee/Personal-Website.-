#!/usr/bin/env node

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim()
const NOTION_TOKEN = String(process.env.NOTION_TOKEN || "").trim()
const NOTION_SESSIONS_DB = String(process.env.NOTION_SESSIONS_DB || "").trim()

const NOTION_BASE = "https://api.notion.com/v1"

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")
  }
  if (!NOTION_TOKEN || !NOTION_SESSIONS_DB) {
    throw new Error("Missing NOTION_TOKEN or NOTION_SESSIONS_DB")
  }
}

function notionHeaders() {
  return {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  }
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

function fmtId(id) {
  if (!id) return id
  const clean = String(id).replace(/-/g, "")
  if (clean.length !== 32) return id
  return `${clean.slice(0,8)}-${clean.slice(8,12)}-${clean.slice(12,16)}-${clean.slice(16,20)}-${clean.slice(20)}`
}

function richTextToPlain(prop) {
  return prop?.rich_text?.[0]?.plain_text || ""
}

async function notionPost(path, body = {}) {
  const res = await fetch(`${NOTION_BASE}${path}`, {
    method: "POST",
    headers: notionHeaders(),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  if (!res.ok) throw new Error(payload?.message || `Notion error ${res.status}`)
  return payload
}

async function queryAllSessions() {
  const results = []
  let startCursor = null
  do {
    const body = {
      page_size: 100,
      sorts: [{ property: "Student Session Date", direction: "descending" }],
    }
    if (startCursor) body.start_cursor = startCursor
    const data = await notionPost(`/databases/${fmtId(NOTION_SESSIONS_DB)}/query`, body)
    results.push(...(data.results || []))
    startCursor = data.has_more ? data.next_cursor : null
  } while (startCursor)
  return results
}

function normalizeSessionSource(value = "") {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return "manual"
  if (["calendar_exact", "calendar exact", "calendar"].includes(raw)) return "calendar_exact"
  if (["calendar_inferred", "calendar inferred", "inferred"].includes(raw)) return "calendar_inferred"
  if (["import"].includes(raw)) return "import"
  return "manual"
}

function normalizeSessionMode(value = "") {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return "unknown"
  if (["live_class", "live class", "class", "lesson"].includes(raw)) return "live_class"
  if (["homework"].includes(raw)) return "homework"
  if (["practice"].includes(raw)) return "practice"
  if (["assessment", "pre_class", "pre class", "exit_ticket", "exit ticket"].includes(raw)) return "assessment"
  return "unknown"
}

function parseSession(page) {
  const props = page?.properties || {}
  return {
    id: fmtId(page.id),
    student_id: props.Student?.relation?.[0]?.id || null,
    subject_id: props.Subject?.relation?.[0]?.id || null,
    student_session_date: props["Student Session Date"]?.date?.start || null,
    tutor_session_date: props["Tutor Session Date"]?.date?.start || null,
    start_time: props["Start Time"]?.date?.start || null,
    end_time: props["End Time"]?.date?.start || null,
    source: normalizeSessionSource(props["Session Source"]?.select?.name || ""),
    mode: normalizeSessionMode(props["Session Mode"]?.select?.name || ""),
    calendar_event_id: richTextToPlain(props["Calendar Event ID"]) || null,
    import_status: props["Import Status"]?.select?.name || props["Import Status"]?.status?.name || null,
    import_override: !!props["Import Override"]?.checkbox,
    override_reason: richTextToPlain(props["Override Reason"]) || null,
    notes: richTextToPlain(props["Session Notes"]) || null,
    metadata: {
      title: props.Name?.title?.[0]?.plain_text || "",
      pre_class_done: !!props["Pre-Class Done"]?.checkbox,
      exit_ticket_done: !!props["Exit Ticket Done"]?.checkbox,
      homework_done: !!props["Homework Done"]?.checkbox,
      report_status: props["Report Status"]?.select?.name || "",
      session_length_minutes: props["Session Length (Min)"]?.formula?.number ?? null,
    },
    updated_at: new Date().toISOString(),
  }
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

async function supabaseInsert(rows) {
  for (const group of chunk(rows, 100)) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/sessions`)
    url.searchParams.set("on_conflict", "id")
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: supabaseHeaders({
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify(group),
    })
    const text = await res.text()
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = text
    }
    if (!res.ok) {
      throw new Error(payload?.message || payload?.hint || payload?.error || `Supabase error ${res.status}`)
    }
  }
}

async function main() {
  assertEnv()
  const rows = (await queryAllSessions())
    .map(parseSession)
    .filter((row) => row.id && row.student_id && row.subject_id && row.student_session_date)
  await supabaseInsert(rows)
  console.log(JSON.stringify({ ok: true, sessions: rows.length }, null, 2))
}

main().catch((error) => {
  console.error("[seed-sessions-to-supabase] failed:", error.message)
  process.exit(1)
})
