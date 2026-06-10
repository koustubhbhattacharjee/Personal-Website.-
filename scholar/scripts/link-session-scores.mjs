import fs from "fs"
import path from "path"

const ENV_PATH = path.join(process.cwd(), ".env.local")
loadEnvFile(ENV_PATH)

const NOTION_TOKEN = process.env.NOTION_TOKEN || ""
const NOTION_SCORES_DB = process.env.NOTION_SCORES_DB || ""
const NOTION_SESSIONS_DB = process.env.NOTION_SESSIONS_DB || ""
const BASE = "https://api.notion.com/v1"
const DRY_RUN = process.argv.includes("--dry-run")

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
    if (key && !(key in process.env)) process.env[key] = value
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

async function notionPatch(pathname, body, version = "2022-06-28") {
  const res = await fetch(`${BASE}${pathname}`, {
    method: "PATCH",
    headers: notionHeaders(version),
    body: JSON.stringify(body || {}),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || `Notion PATCH failed: ${pathname}`)
  return data
}

async function notionQueryAll(databaseId) {
  const results = []
  let startCursor = null
  while (true) {
    const body = { page_size: 100 }
    if (startCursor) body.start_cursor = startCursor
    const data = await notionPost(`/databases/${fmtId(databaseId)}/query`, body)
    results.push(...(data.results || []))
    if (!data.has_more || !data.next_cursor) break
    startCursor = data.next_cursor
  }
  return results
}

function normalizeDateOnly(value) {
  if (!value) return null
  const text = String(value).trim()
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

function parseScoreRow(page) {
  return {
    id: page.id,
    name: page.properties.Name?.title?.[0]?.plain_text || "",
    studentId: page.properties.Student?.relation?.[0]?.id || "",
    subjectId: page.properties.subject?.relation?.[0]?.id || "",
    sessionDate: normalizeDateOnly(page.properties["Date Introduced"]?.date?.start || null),
  }
}

function parseSessionRow(page) {
  return {
    id: page.id,
    name: page.properties.Name?.title?.[0]?.plain_text || "",
    studentId: page.properties.Student?.relation?.[0]?.id || "",
    subjectId: page.properties.Subject?.relation?.[0]?.id || "",
    studentSessionDate: normalizeDateOnly(page.properties["Student Session Date"]?.date?.start || null),
    existingScoreIds: (page.properties.Scores?.relation || []).map((rel) => rel.id).filter(Boolean),
  }
}

async function main() {
  assertEnv("NOTION_TOKEN", NOTION_TOKEN)
  assertEnv("NOTION_SCORES_DB", NOTION_SCORES_DB)
  assertEnv("NOTION_SESSIONS_DB", NOTION_SESSIONS_DB)

  console.log(`[link-session-scores] start${DRY_RUN ? " (dry run)" : ""}`)

  const [scorePages, sessionPages] = await Promise.all([
    notionQueryAll(NOTION_SCORES_DB),
    notionQueryAll(NOTION_SESSIONS_DB),
  ])

  const scores = scorePages.map(parseScoreRow).filter((row) => row.studentId && row.subjectId && row.sessionDate)
  const sessions = sessionPages.map(parseSessionRow).filter((row) => row.studentId && row.subjectId && row.studentSessionDate)

  const sessionsByKey = new Map()
  for (const session of sessions) {
    const key = `${session.studentId}::${session.subjectId}::${session.studentSessionDate}`
    if (!sessionsByKey.has(key)) sessionsByKey.set(key, [])
    sessionsByKey.get(key).push(session)
  }

  const scoreIdsBySessionId = new Map()
  let unmatchedScores = 0
  let ambiguousScores = 0

  for (const score of scores) {
    const key = `${score.studentId}::${score.subjectId}::${score.sessionDate}`
    const matchedSessions = sessionsByKey.get(key) || []
    if (!matchedSessions.length) {
      unmatchedScores += 1
      continue
    }
    if (matchedSessions.length > 1) {
      ambiguousScores += 1
      console.warn(`[link-session-scores] ambiguous score match: ${score.name} (${score.sessionDate}) -> ${matchedSessions.length} sessions`)
      continue
    }
    const session = matchedSessions[0]
    if (!scoreIdsBySessionId.has(session.id)) scoreIdsBySessionId.set(session.id, new Set(session.existingScoreIds))
    scoreIdsBySessionId.get(session.id).add(score.id)
  }

  let updatedSessions = 0
  let linkedScores = 0
  let skippedUnchanged = 0

  for (const session of sessions) {
    const targetIds = [...(scoreIdsBySessionId.get(session.id) || new Set(session.existingScoreIds))]
    const currentSorted = [...session.existingScoreIds].sort()
    const targetSorted = [...targetIds].sort()
    if (JSON.stringify(currentSorted) === JSON.stringify(targetSorted)) {
      skippedUnchanged += 1
      continue
    }

    linkedScores += targetIds.length
    if (DRY_RUN) {
      console.log(`[link-session-scores] dry-run update: ${session.name} -> ${targetIds.length} score rows`)
    } else {
      await notionPatch(`/pages/${fmtId(session.id)}`, {
        properties: {
          Scores: { relation: targetIds.map((id) => ({ id: fmtId(id) })) },
        },
      })
      console.log(`[link-session-scores] updated: ${session.name} -> ${targetIds.length} score rows`)
    }
    updatedSessions += 1
  }

  console.log("[link-session-scores] done", {
    scores: scores.length,
    sessions: sessions.length,
    updatedSessions,
    linkedScores,
    skippedUnchanged,
    unmatchedScores,
    ambiguousScores,
    dryRun: DRY_RUN,
  })
}

main().catch((err) => {
  console.error("[link-session-scores] fatal", err)
  process.exit(1)
})
