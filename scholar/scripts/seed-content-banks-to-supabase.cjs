#!/usr/bin/env node

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

async function upsertRows(table, rows, onConflict, batchSize = 250) {
  if (!rows.length) return
  for (const group of chunk(rows, batchSize)) {
    await rest(table, {
      method: "POST",
      body: group,
      onConflict,
      prefer: "resolution=merge-duplicates,return=representation",
    })
  }
}

async function fetchFrameworks() {
  const rows = await rest("curriculum_frameworks", {
    query: { select: "id,key,label,subject_name,country,state", limit: 10000 },
  })
  return Array.isArray(rows) ? rows : []
}

async function main() {
  assertEnv()
  const frameworks = await fetchFrameworks()
  const rows = frameworks.map((framework) => ({
    key: String(framework.key),
    label: `${framework.label} Canonical Bank`,
    subject_name: String(framework.subject_name || "").trim(),
    framework_id: framework.id,
    source_label: "taxonomy-seeded canonical content bank",
    is_canonical: true,
    metadata: {
      framework_key: framework.key,
      country: framework.country || null,
      state: framework.state || null,
    },
    updated_at: new Date().toISOString(),
  }))

  await upsertRows("content_banks", rows, "key", 100)

  console.log(JSON.stringify({
    ok: true,
    content_banks: rows.length,
  }, null, 2))
}

main().catch((error) => {
  console.error("[seed-content-banks-to-supabase] failed:", error.message)
  process.exit(1)
})
