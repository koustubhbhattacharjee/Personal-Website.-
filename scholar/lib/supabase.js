const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim()
const SUPABASE_PUBLISHABLE_KEY = String(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ""
).trim()

export function hasSupabaseServer() {
  return !!(SUPABASE_URL && SUPABASE_SECRET_KEY)
}

export function hasSupabaseBrowserConfig() {
  return !!(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)
}

export function getSupabaseConfig() {
  return {
    url: SUPABASE_URL,
    hasSecretKey: !!SUPABASE_SECRET_KEY,
    hasPublishableKey: !!SUPABASE_PUBLISHABLE_KEY,
  }
}

function buildRestUrl(path = "", query = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${String(path || "").replace(/^\/+/, "")}`)
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === "") continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function buildServerHeaders(extra = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

export async function supabaseRest(path, {
  method = "GET",
  query = {},
  body,
  headers = {},
} = {}) {
  if (!hasSupabaseServer()) {
    throw new Error("Supabase server env not configured")
  }

  const res = await fetch(buildRestUrl(path, query), {
    method,
    headers: buildServerHeaders(headers),
    body: body == null ? undefined : JSON.stringify(body),
  })

  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text || null
  }

  if (!res.ok) {
    const message = data?.message || data?.error_description || data?.hint || `Supabase REST error ${res.status}`
    const err = new Error(message)
    err.status = res.status
    err.payload = data
    throw err
  }

  return data
}

function applyFilterQuery(query, filters = {}) {
  const next = { ...query }
  for (const [column, value] of Object.entries(filters || {})) {
    if (value == null) continue
    if (Array.isArray(value)) {
      next[column] = `in.(${value.map((item) => `"${String(item).replace(/"/g, '\\"')}"`).join(",")})`
    } else {
      next[column] = `eq.${value}`
    }
  }
  return next
}

export async function supabaseSelect(table, {
  select = "*",
  filters = {},
  orderBy = "",
  ascending = true,
  limit = 0,
  single = false,
} = {}) {
  const query = applyFilterQuery({ select }, filters)
  if (orderBy) query.order = `${orderBy}.${ascending ? "asc" : "desc"}`
  if (limit > 0) query.limit = limit
  const data = await supabaseRest(table, { query })
  if (single) return Array.isArray(data) ? (data[0] || null) : data
  return Array.isArray(data) ? data : []
}

export async function supabaseInsert(table, rows, {
  upsert = false,
  onConflict = "",
  returning = "representation",
} = {}) {
  const payload = Array.isArray(rows) ? rows : [rows]
  const headers = {
    Prefer: `${upsert ? "resolution=merge-duplicates," : ""}return=${returning}`,
  }
  if (onConflict) headers["On-Conflict"] = onConflict
  return supabaseRest(table, {
    method: "POST",
    body: payload,
    headers,
  })
}

export async function supabaseUpdate(table, filters, patch, {
  returning = "representation",
} = {}) {
  const query = applyFilterQuery({}, filters)
  return supabaseRest(table, {
    method: "PATCH",
    query,
    body: patch,
    headers: { Prefer: `return=${returning}` },
  })
}

export async function getSupabaseHealth() {
  const config = getSupabaseConfig()
  if (!hasSupabaseServer()) {
    return {
      ok: false,
      configured: false,
      ...config,
    }
  }

  try {
    const subjects = await supabaseSelect("subjects", {
      select: "id,name",
      limit: 1,
    })
    return {
      ok: true,
      configured: true,
      ...config,
      sampleSubjects: subjects,
    }
  } catch (error) {
    return {
      ok: false,
      configured: true,
      ...config,
      error: error?.message || "Supabase health check failed",
      details: error?.payload || null,
    }
  }
}
