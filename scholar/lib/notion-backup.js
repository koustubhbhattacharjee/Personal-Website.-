import { putJsonToR2 } from "./r2"

const BASE = "https://api.notion.com/v1"
const DEFAULT_RETRY_DELAY_MS = 4000
const MAX_RETRIES = 8
const MIN_REQUEST_GAP_MS = 350
const PAGE_QUERY_GAP_MS = 450
const PAGE_BLOCK_GAP_MS = 250
const SUBJECT_GAP_MS = 1200

let nextAllowedRequestAt = 0

function fmtId(id) {
  if (!id) return id
  const clean = String(id).replace(/-/g, "")
  if (clean.length !== 32) return id
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`
}

function headers(version = "2022-06-28") {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": version,
    "Content-Type": "application/json",
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForRequestSlot(extraDelayMs = 0) {
  const now = Date.now()
  const waitMs = Math.max(0, nextAllowedRequestAt - now)
  if (waitMs > 0) {
    await sleep(waitMs)
  }
  nextAllowedRequestAt = Date.now() + MIN_REQUEST_GAP_MS + Math.max(0, extraDelayMs)
}

function getRetryDelayMs(res, attempt = 0) {
  const retryAfter = Number(res?.headers?.get?.("retry-after") || 0)
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.max(DEFAULT_RETRY_DELAY_MS, retryAfter * 1000)
  }
  return DEFAULT_RETRY_DELAY_MS * Math.pow(2, attempt)
}

function reserveCooldown(delayMs) {
  nextAllowedRequestAt = Math.max(nextAllowedRequestAt, Date.now() + Math.max(0, delayMs))
}

async function parseJsonResponse(res, path, method = "GET") {
  const raw = await res.text()
  let data = null
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    const snippet = String(raw || "").replace(/\s+/g, " ").slice(0, 220)
    throw new Error(`Notion ${method} returned non-JSON for ${path}: ${snippet || res.statusText}`)
  }
  return data
}

async function notionGet(path, version = "2022-06-28", attempt = 0) {
  await waitForRequestSlot()
  const res = await fetch(`${BASE}${path}`, { headers: headers(version) })
  const data = await parseJsonResponse(res, path, "GET")
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const delayMs = getRetryDelayMs(res, attempt)
    console.warn(`[backup] rate limited on GET ${path}; retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
    reserveCooldown(delayMs)
    await sleep(delayMs)
    return notionGet(path, version, attempt + 1)
  }
  if (!res.ok) {
    throw new Error(data?.message || `Notion GET failed for ${path}`)
  }
  return data
}

async function notionPost(path, body = {}, version = "2022-06-28", attempt = 0) {
  await waitForRequestSlot()
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(version),
    body: JSON.stringify(body),
  })
  const data = await parseJsonResponse(res, path, "POST")
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const delayMs = getRetryDelayMs(res, attempt)
    console.warn(`[backup] rate limited on POST ${path}; retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
    reserveCooldown(delayMs)
    await sleep(delayMs)
    return notionPost(path, body, version, attempt + 1)
  }
  if (!res.ok) {
    throw new Error(data?.message || `Notion POST failed for ${path}`)
  }
  return data
}

async function queryDatabaseAll(databaseId, { filter = null, sorts = [] } = {}) {
  const id = fmtId(databaseId)
  const results = []
  let nextCursor = undefined

  while (true) {
    const body = { page_size: 100, sorts }
    if (filter && Object.keys(filter).length) body.filter = filter
    if (nextCursor) body.start_cursor = nextCursor
    const data = await notionPost(`/databases/${id}/query`, body, "2022-06-28")
    results.push(...(data.results || []))
    if (!data.has_more || !data.next_cursor) break
    nextCursor = data.next_cursor
    await sleep(PAGE_QUERY_GAP_MS)
  }

  return results
}

async function queryDataSourceAll(dataSourceId, { filter = null, sorts = [] } = {}) {
  const id = fmtId(dataSourceId)
  const results = []
  let nextCursor = undefined

  while (true) {
    const body = { page_size: 100, sorts }
    if (filter && Object.keys(filter).length) body.filter = filter
    if (nextCursor) body.start_cursor = nextCursor
    const data = await notionPost(`/data_sources/${id}/query`, body, "2025-09-03")
    results.push(...(data.results || []))
    if (!data.has_more || !data.next_cursor) break
    nextCursor = data.next_cursor
    await sleep(PAGE_QUERY_GAP_MS)
  }

  return results
}

async function listBlockChildrenAll(blockId) {
  const id = fmtId(blockId)
  const results = []
  let nextCursor = undefined

  while (true) {
    const qs = new URLSearchParams({ page_size: "100" })
    if (nextCursor) qs.set("start_cursor", nextCursor)
    const data = await notionGet(`/blocks/${id}/children?${qs.toString()}`, "2022-06-28")
    results.push(...(data.results || []))
    if (!data.has_more || !data.next_cursor) break
    nextCursor = data.next_cursor
    await sleep(PAGE_QUERY_GAP_MS)
  }

  return results
}

async function exportBlockTree(blockId, depth = 0, maxDepth = 6) {
  if (!blockId || depth > maxDepth) return []
  const children = await listBlockChildrenAll(blockId)
  const out = []
  for (const child of children) {
    let nested = []
    if (child.has_children && depth < maxDepth) {
      try {
        nested = await exportBlockTree(child.id, depth + 1, maxDepth)
      } catch (err) {
        nested = [{
          object: "backup_error",
          id: child.id,
          message: err.message || "Failed to export nested block children",
        }]
      }
    }
    out.push({
      ...child,
      children: nested,
    })
  }
  return out
}

function getTitle(page) {
  return page?.properties?.Name?.title?.[0]?.plain_text || ""
}

function getPlainRichText(page, propertyName) {
  return page?.properties?.[propertyName]?.rich_text?.[0]?.plain_text || ""
}

async function exportDatabaseBundle({ label, databaseId }) {
  if (!databaseId) {
    console.log(`[backup] skipping ${label}: missing database id`)
    return {
      label,
      databaseId: "",
      database: null,
      rows: [],
      count: 0,
      skipped: true,
      reason: "missing_id",
    }
  }

  console.log(`[backup] exporting database ${label}: ${fmtId(databaseId)}`)
  const database = await notionGet(`/databases/${fmtId(databaseId)}`, "2022-06-28")
  await sleep(PAGE_QUERY_GAP_MS)
  const rows = await queryDatabaseAll(databaseId)
  console.log(`[backup] exported database ${label}: ${rows.length} rows`)

  return {
    label,
    databaseId: fmtId(databaseId),
    database,
    rows,
    count: rows.length,
  }
}

async function exportSubjectDataSources(subjectRows = [], { includeBlocks = true } = {}) {
  const out = []
  console.log(`[backup] exporting subject data sources: ${subjectRows.length} subject rows`)

  for (const subjectPage of subjectRows) {
    const subjectId = subjectPage.id
    const subjectName = getTitle(subjectPage)
    const dataSourceId = getPlainRichText(subjectPage, "data source ID")

    if (!dataSourceId) {
      console.log(`[backup] skipping subject data source for "${subjectName || subjectId}": missing data source ID`)
      out.push({
        subjectId,
        subjectName,
        dataSourceId: "",
        dataSource: null,
        pages: [],
        count: 0,
        skipped: true,
        reason: "missing_data_source_id",
      })
      continue
    }

    console.log(`[backup] exporting subject data source for "${subjectName}" (${fmtId(dataSourceId)})`)
    const dataSource = await notionGet(`/data_sources/${fmtId(dataSourceId)}`, "2025-09-03")
    await sleep(PAGE_QUERY_GAP_MS)
    const pages = await queryDataSourceAll(dataSourceId)
    console.log(`[backup] fetched ${pages.length} pages for subject "${subjectName}"`)

    let exportedPages = pages
    if (includeBlocks) {
      console.log(`[backup] exporting block trees for subject "${subjectName}"`)
      const pagesWithBlocks = []
      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index]
        const pageTitle = getTitle(page) || page.id
        console.log(`[backup]   page ${index + 1}/${pages.length}: ${pageTitle}`)
        try {
          pagesWithBlocks.push({
            ...page,
            children: await exportBlockTree(page.id),
          })
        } catch (err) {
          console.warn(`[backup]   block export failed for page "${pageTitle}": ${err.message || err}`)
          pagesWithBlocks.push({
            ...page,
            children: [],
            backupBlockError: err.message || "Failed to export page blocks",
          })
        }
        await sleep(PAGE_BLOCK_GAP_MS)
      }
      exportedPages = pagesWithBlocks
    }

    out.push({
      subjectId,
      subjectName,
      dataSourceId: fmtId(dataSourceId),
      dataSource,
      pages: exportedPages,
      count: exportedPages.length,
    })
    console.log(`[backup] finished subject "${subjectName}": ${exportedPages.length} pages`)
    await sleep(SUBJECT_GAP_MS)
  }

  return out
}

function sanitizeLabel(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "manual"
}

function buildTimestamp() {
  return new Date().toISOString().replace(/[:]/g, "-")
}

export async function backupScholarWorkspaceToR2({
  bucket,
  includeBlocks = true,
  label = "manual",
} = {}) {
  if (!bucket) throw new Error("R2 bucket is required for backup")
  if (!process.env.NOTION_TOKEN) throw new Error("NOTION_TOKEN is not configured")

  const timestamp = buildTimestamp()
  const backupRoot = `backups/full/${timestamp}`
  const schemaVersion = 1
  console.log(`[backup] starting full backup "${label}" -> ${bucket}/${backupRoot}`)
  console.log(`[backup] includeBlocks=${includeBlocks}`)

  const dbIds = {
    students: process.env.NOTION_STUDENTS_DB || "",
    subjects: process.env.NOTION_SUBJECTS_DB || "",
    enrollments: process.env.NOTION_ENROLLMENTS_DB || "",
    scores: process.env.NOTION_SCORES_DB || "",
    reports: process.env.NOTION_REPORTS_DB || "",
    homeworkAttempts: process.env.NOTION_HOMEWORK_ATTEMPTS_DB || "",
    assessmentAttempts: process.env.NOTION_ASSESSMENT_ATTEMPTS_DB || "",
  }

  const studentsBundle = await exportDatabaseBundle({ label: "students", databaseId: dbIds.students })
  const subjectsBundle = await exportDatabaseBundle({ label: "subjects", databaseId: dbIds.subjects })
  const enrollmentsBundle = await exportDatabaseBundle({ label: "enrollments", databaseId: dbIds.enrollments })
  const scoresBundle = await exportDatabaseBundle({ label: "scores", databaseId: dbIds.scores })
  const reportsBundle = await exportDatabaseBundle({ label: "reports", databaseId: dbIds.reports })
  const homeworkBundle = await exportDatabaseBundle({ label: "homework_attempts", databaseId: dbIds.homeworkAttempts })
  const assessmentBundle = await exportDatabaseBundle({ label: "assessment_attempts", databaseId: dbIds.assessmentAttempts })
  const subjectDataSources = await exportSubjectDataSources(subjectsBundle.rows || [], { includeBlocks })
  console.log("[backup] dataset export complete, writing JSON blobs to R2")

  const datasets = {
    students: studentsBundle,
    subjects: subjectsBundle,
    enrollments: enrollmentsBundle,
    scores: scoresBundle,
    reports: reportsBundle,
    homework_attempts: homeworkBundle,
    assessment_attempts: assessmentBundle,
    subject_data_sources: {
      label: "subject_data_sources",
      count: subjectDataSources.reduce((sum, item) => sum + Number(item.count || 0), 0),
      subjects: subjectDataSources,
    },
  }

  const manifest = {
    kind: "scholar_full_backup",
    schemaVersion,
    exportedAt: new Date().toISOString(),
    label: sanitizeLabel(label),
    includeBlocks,
    backupRoot,
    bucket,
    datasets: {
      students: { key: `${backupRoot}/students.json`, count: studentsBundle.count, databaseId: studentsBundle.databaseId || "" },
      subjects: { key: `${backupRoot}/subjects.json`, count: subjectsBundle.count, databaseId: subjectsBundle.databaseId || "" },
      enrollments: { key: `${backupRoot}/enrollments.json`, count: enrollmentsBundle.count, databaseId: enrollmentsBundle.databaseId || "" },
      scores: { key: `${backupRoot}/scores.json`, count: scoresBundle.count, databaseId: scoresBundle.databaseId || "" },
      reports: { key: `${backupRoot}/reports.json`, count: reportsBundle.count, databaseId: reportsBundle.databaseId || "" },
      homework_attempts: { key: `${backupRoot}/homework-attempts.json`, count: homeworkBundle.count, databaseId: homeworkBundle.databaseId || "" },
      assessment_attempts: { key: `${backupRoot}/assessment-attempts.json`, count: assessmentBundle.count, databaseId: assessmentBundle.databaseId || "" },
      subject_data_sources: {
        key: `${backupRoot}/subject-data-sources.json`,
        count: subjectDataSources.length,
        pageCount: subjectDataSources.reduce((sum, item) => sum + Number(item.count || 0), 0),
      },
    },
  }

  await putJsonToR2({ bucket, key: `${backupRoot}/students.json`, data: datasets.students })
  await putJsonToR2({ bucket, key: `${backupRoot}/subjects.json`, data: datasets.subjects })
  await putJsonToR2({ bucket, key: `${backupRoot}/enrollments.json`, data: datasets.enrollments })
  await putJsonToR2({ bucket, key: `${backupRoot}/scores.json`, data: datasets.scores })
  await putJsonToR2({ bucket, key: `${backupRoot}/reports.json`, data: datasets.reports })
  await putJsonToR2({ bucket, key: `${backupRoot}/homework-attempts.json`, data: datasets.homework_attempts })
  await putJsonToR2({ bucket, key: `${backupRoot}/assessment-attempts.json`, data: datasets.assessment_attempts })
  await putJsonToR2({ bucket, key: `${backupRoot}/subject-data-sources.json`, data: datasets.subject_data_sources })
  await putJsonToR2({ bucket, key: `${backupRoot}/manifest.json`, data: manifest })
  await putJsonToR2({
    bucket,
    key: "backups/full/latest.json",
    data: {
      ...manifest,
      latestManifestKey: `${backupRoot}/manifest.json`,
    },
  })
  console.log(`[backup] complete -> manifest ${backupRoot}/manifest.json`)

  return {
    ok: true,
    bucket,
    backupRoot,
    manifestKey: `${backupRoot}/manifest.json`,
    latestKey: "backups/full/latest.json",
    includeBlocks,
    counts: {
      students: studentsBundle.count,
      subjects: subjectsBundle.count,
      enrollments: enrollmentsBundle.count,
      scores: scoresBundle.count,
      reports: reportsBundle.count,
      homeworkAttempts: homeworkBundle.count,
      assessmentAttempts: assessmentBundle.count,
      subjectDataSources: subjectDataSources.length,
      subjectPages: subjectDataSources.reduce((sum, item) => sum + Number(item.count || 0), 0),
    },
  }
}
