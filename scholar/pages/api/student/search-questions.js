// GET /api/student/search-questions?q=<words>&subjectId=<uuid>&limit=20
//
// Quick keyword search over public.questions.question_text, SCOPED to the
// content banks attached to the given subject (primary content_bank_id +
// active overlay's content_bank_id). subjectId is required — without it we
// return an empty result set rather than silently leaking other subjects'
// questions into the dropdown.
//
// How matching works: split the input on whitespace; each token must appear
// as a case-insensitive substring (`ilike '%token%'`) in question_text — so
// "marble graph" returns rows whose text contains both "marble" AND "graph",
// in any order. No index needed at our scale (~1300 rows; PostgREST handles
// the AND filter as a single query). If we grow, the next-step upgrade is
// an FTS column with GIN index — same endpoint shape.
//
// Returns:
//   { results: [{ question_key, snippet, qt_id, qt_title, unit_label,
//                 source_label, page, exercise_ref, has_image }] }
//
// Auth: any logged-in user (students AND admin can use it). Snippets are
// derived from question_text only — no scratchpad / private state leaks.

import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    return res.status(405).json({ error: "Method not allowed" })
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.email) return res.status(401).json({ error: "Unauthorized" })

  const q = String(req.query.q || "").trim()
  const subjectId = String(req.query.subjectId || "").trim()
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
  if (q.length < 2) return res.status(200).json({ results: [] })
  if (!subjectId) return res.status(200).json({ results: [] })

  // Tokenize: split on whitespace, drop pure-punctuation/empty, cap length so
  // a runaway URL doesn't generate a 50-clause SQL query. Each token survives
  // its own ilike — order doesn't matter.
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_-]+/gu, " ").trim())
    .flatMap((t) => t.split(/\s+/))
    .filter((t) => t.length >= 1)
    .slice(0, 8)
  if (!tokens.length) return res.status(200).json({ results: [] })

  const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const sbHeaders = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }

  // Resolve the subject's content_bank scope: primary bank + active overlay's
  // bank (if any). Unioning both covers the case where a student's view is
  // augmented by an overlay carrying its own QTs, while still keeping the
  // search strictly inside what the student should see for THIS subject.
  let bankIds = []
  try {
    const sr = await fetch(`${SUPABASE_URL}/rest/v1/subjects?id=eq.${subjectId}&select=content_bank_id,active_overlay_id`, { headers: sbHeaders })
    if (!sr.ok) return res.status(200).json({ results: [] })
    const subjectRows = await sr.json()
    const subj = Array.isArray(subjectRows) ? subjectRows[0] : null
    if (!subj) return res.status(200).json({ results: [] })
    if (subj.content_bank_id) bankIds.push(subj.content_bank_id)
    if (subj.active_overlay_id) {
      const or = await fetch(`${SUPABASE_URL}/rest/v1/content_overlays?id=eq.${subj.active_overlay_id}&select=content_bank_id`, { headers: sbHeaders })
      if (or.ok) {
        const overlayRows = await or.json()
        const overlay = Array.isArray(overlayRows) ? overlayRows[0] : null
        if (overlay?.content_bank_id) bankIds.push(overlay.content_bank_id)
      }
    }
  } catch {
    return res.status(200).json({ results: [] })
  }
  bankIds = [...new Set(bankIds.filter(Boolean))]
  if (!bankIds.length) return res.status(200).json({ results: [] })

  // QT ids belonging to those banks. We then filter questions on
  // question_type_id=in.(<qts>) so the search can never bleed across subjects.
  let qtScopedIds = []
  try {
    const inBanks = "(" + bankIds.map((id) => `"${id}"`).join(",") + ")"
    const qr = await fetch(`${SUPABASE_URL}/rest/v1/question_types?select=id&content_bank_id=in.${encodeURIComponent(inBanks)}&limit=20000`, { headers: sbHeaders })
    if (!qr.ok) return res.status(200).json({ results: [] })
    const qtRows = await qr.json()
    qtScopedIds = (Array.isArray(qtRows) ? qtRows : []).map((r) => r.id).filter(Boolean)
  } catch {
    return res.status(200).json({ results: [] })
  }
  if (!qtScopedIds.length) return res.status(200).json({ results: [] })

  // Build the PostgREST query: chain one `question_text=ilike.*token*` per
  // token (PostgREST AND-combines repeated filters), plus the subject-scope
  // filter on question_type_id.
  const params = new URLSearchParams()
  params.set("select", "id,qhash,question_text,question_format,question_type_id,source_reference,question_content,stem_header_content")
  params.set("limit", String(limit))
  const qtInList = "(" + qtScopedIds.map((id) => `"${id}"`).join(",") + ")"
  params.set("question_type_id", `in.${qtInList}`)
  for (const t of tokens) {
    // ilike pattern uses *  as the wildcard in PostgREST shorthand
    params.append("question_text", `ilike.*${encodeURIComponent(t).replace(/\*/g, "")}*`)
  }

  let rows
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/questions?${params.toString()}`, { headers: sbHeaders })
    if (!r.ok) {
      const txt = await r.text().catch(() => "")
      return res.status(500).json({ error: `Search failed: ${r.status} ${txt.slice(0, 240)}` })
    }
    rows = await r.json()
  } catch (e) {
    return res.status(500).json({ error: e.message || "Search failed" })
  }

  if (!Array.isArray(rows) || !rows.length) return res.status(200).json({ results: [] })

  // Hydrate qt titles in one extra round trip — small list, single IN-filter.
  const qtIds = [...new Set(rows.map((r) => r.question_type_id).filter(Boolean))]
  let qtById = {}
  if (qtIds.length) {
    try {
      const inList = "(" + qtIds.map((id) => `"${id}"`).join(",") + ")"
      const qr = await fetch(`${SUPABASE_URL}/rest/v1/question_types?select=id,title,unit_label&id=in.${encodeURIComponent(inList)}`, { headers: sbHeaders })
      if (qr.ok) {
        const qts = await qr.json()
        qtById = Object.fromEntries(qts.map((q) => [q.id, q]))
      }
    } catch { /* qt enrichment is nice-to-have, swallow */ }
  }

  // Snippet builder: pull a ~140-char window centered on the first token hit
  // (in original casing), and bold-mark every token occurrence with **…**.
  function buildSnippet(text, tokens) {
    const t = String(text || "")
    if (!t) return ""
    const lower = t.toLowerCase()
    let firstHit = -1
    for (const tok of tokens) {
      const i = lower.indexOf(tok.toLowerCase())
      if (i >= 0 && (firstHit < 0 || i < firstHit)) firstHit = i
    }
    if (firstHit < 0) return t.slice(0, 160) + (t.length > 160 ? "…" : "")
    const start = Math.max(0, firstHit - 50)
    const end = Math.min(t.length, firstHit + 110)
    let s = (start > 0 ? "…" : "") + t.slice(start, end) + (end < t.length ? "…" : "")
    // Surround each token (case-insensitive) with **bold** marks so the UI
    // can render emphasis without re-running the search client-side.
    for (const tok of tokens) {
      const re = new RegExp("(" + tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi")
      s = s.replace(re, "**$1**")
    }
    return s
  }

  // Detect whether a question has an image item attached — useful for the
  // admin to spot "the question Avyukt flagged for 'no graph' actually has
  // no image item" instantly from the search results, without opening it.
  function hasImageItem(q) {
    const arrs = [q.question_content, q.stem_header_content].filter(Array.isArray)
    for (const arr of arrs) for (const it of arr) if (it?.type === "image") return true
    return false
  }

  const results = rows.map((q) => {
    const qt = qtById[q.question_type_id] || null
    return {
      question_key:  q.qhash,
      snippet:       buildSnippet(q.question_text, tokens),
      qt_id:         q.question_type_id || null,
      qt_title:      qt?.title || null,
      unit_label:    qt?.unit_label || null,
      source_label:  q.source_reference?.worksheet_name || q.source_reference?.textbook_key || null,
      page:          Number(q.source_reference?.page) || null,
      exercise_ref:  q.source_reference?.exercise_ref || "",
      has_image:     hasImageItem(q),
      format:        q.question_format || null,
    }
  })

  // Cheap relevance bump: rows with all tokens earlier in the text first.
  results.sort((a, b) => (b.snippet?.startsWith("**") ? 1 : 0) - (a.snippet?.startsWith("**") ? 1 : 0))

  return res.status(200).json({ results, query: q, tokens })
}
