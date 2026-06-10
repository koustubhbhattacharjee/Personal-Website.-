#!/usr/bin/env node

const path = require("path")

const { DISTRICT_TAXONOMY } = require(path.join(process.cwd(), "lib", "district-taxonomy.js"))

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim()

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")
  }
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

function buildUrl(table, query = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === "") continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function rest(table, { method = "GET", query = {}, body, prefer = "", onConflict = "" } = {}) {
  const url = buildUrl(table, onConflict ? { ...query, on_conflict: onConflict } : query)
  const res = await fetch(url, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : {}),
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  if (!res.ok) {
    throw new Error(payload?.message || payload?.hint || payload?.error || `Supabase REST error ${res.status}`)
  }
  return payload
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

function frameworkRowsFromTaxonomy() {
  const rows = []
  for (const [stateKey, stateData] of Object.entries(DISTRICT_TAXONOMY || {})) {
    for (const [subjectKey, subject] of Object.entries(stateData || {})) {
      const subjectName = String(subject?.name || subjectKey || "").trim()
      rows.push({
        key: `${stateKey}::${subjectKey}`,
        label: `${stateKey} / ${subjectName}`,
        country: subject?.country || null,
        state: stateKey,
        subject_name: subjectName,
        metadata: {
          subject_key: subjectKey,
          standards_count: Array.isArray(subject?.standards) ? subject.standards.length : 0,
        },
      })
    }
  }
  return rows
}

function collectLoRows(frameworkIdByKey) {
  const rows = new Map()
  for (const [stateKey, stateData] of Object.entries(DISTRICT_TAXONOMY || {})) {
    for (const [subjectKey, subject] of Object.entries(stateData || {})) {
      const frameworkKey = `${stateKey}::${subjectKey}`
      const frameworkId = frameworkIdByKey.get(frameworkKey)
      if (!frameworkId) continue
      ;(subject?.standards || []).forEach((standard, standardIndex) => {
        ;(standard?.objectives || []).forEach((lo, loIndex) => {
          if (!lo?.code) return
          const namespacedId = `${frameworkKey}::${lo.code}`
          rows.set(namespacedId, {
            id: namespacedId,
            framework_id: frameworkId,
            code: String(lo.code),
            standard_code: standard?.code || null,
            standard_name: standard?.name || null,
            name: lo?.name || lo?.code,
            sequence_index: standardIndex * 1000 + loIndex,
            metadata: {
              subject_key: subjectKey,
              state_key: stateKey,
            },
          })
        })
      })
    }
  }
  return [...rows.values()]
}

function collectSloRows() {
  const rows = new Map()
  for (const [stateKey, stateData] of Object.entries(DISTRICT_TAXONOMY || {})) {
    for (const [subjectKey, subject] of Object.entries(stateData || {})) {
      const frameworkKey = `${stateKey}::${subjectKey}`
      ;(subject?.standards || []).forEach((standard, standardIndex) => {
        ;(standard?.objectives || []).forEach((lo, loIndex) => {
          ;(lo?.subtopics || []).forEach((slo, sloIndex) => {
            const text = typeof slo === "string" ? slo : (slo?.text || "")
            const code = typeof slo === "string" ? `${lo.code}.${sloIndex + 1}` : (slo?.id || `${lo.code}.${sloIndex + 1}`)
            if (!code || !text) return
            const namespacedId = `${frameworkKey}::${code}`
            rows.set(namespacedId, {
              id: namespacedId,
              lo_id: `${frameworkKey}::${lo.code}`,
              code: String(code),
              text: String(text),
              sequence_index: standardIndex * 100000 + loIndex * 100 + sloIndex,
              metadata: {
                subject_key: subjectKey,
                state_key: stateKey,
              },
            })
          })
        })
      })
    }
  }
  return [...rows.values()]
}

async function upsertRows(table, rows, onConflict, batchSize = 250) {
  for (const group of chunk(rows, batchSize)) {
    await rest(table, {
      method: "POST",
      body: group,
      onConflict,
      prefer: "resolution=merge-duplicates,return=representation",
    })
  }
}

async function fetchFrameworkIds() {
  const rows = await rest("curriculum_frameworks", {
    query: { select: "id,key", limit: 10000 },
  })
  const map = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    map.set(String(row.key), row.id)
  }
  return map
}

async function main() {
  assertEnv()

  const frameworkRows = frameworkRowsFromTaxonomy()
  await upsertRows("curriculum_frameworks", frameworkRows, "key", 100)

  const frameworkIdByKey = await fetchFrameworkIds()
  const loRows = collectLoRows(frameworkIdByKey)
  const sloRows = collectSloRows()

  await upsertRows("learning_objectives", loRows, "id", 300)
  await upsertRows("sub_learning_objectives", sloRows, "id", 500)

  console.log(JSON.stringify({
    ok: true,
    frameworks: frameworkRows.length,
    learning_objectives: loRows.length,
    sub_learning_objectives: sloRows.length,
  }, null, 2))
}

main().catch((error) => {
  console.error("[seed-taxonomy-to-supabase] failed:", error.message)
  process.exit(1)
})
