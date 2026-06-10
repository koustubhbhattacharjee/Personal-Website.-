// GET /api/admin/sources
//
// List every row in public.sources, decorated with question/QT counts pulled
// live from questions.source_reference.textbook_key + question_types.source_reference.textbook_key.
//
// Returns: { sources: [{ id, textbook_key, label, source_type, pdf_url,
//                        page_count, qt_count, question_count, metadata }] }
//
// Auth: admin email check, matching the rest of /api/admin.

import { getServerSession } from "next-auth"
import { authOptions } from "../../auth/[...nextauth]"
import { supabaseRest, supabaseSelect } from "../../../../lib/supabase"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET")
    return res.status(405).json({ error: "Method not allowed" })
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  try {
    // 1. Pull every source row.
    const sources = await supabaseSelect("sources", {
      select: "id,textbook_key,label,source_type,pdf_url,pdf_storage_key,page_count,metadata,created_at,updated_at",
      orderBy: "label",
    })

    // 2. Count QTs per textbook_key in one shot.
    const qts = await supabaseRest("question_types", {
      query: { select: "source_reference" },
    })
    const qtCounts = new Map()
    for (const qt of qts || []) {
      const key = qt?.source_reference?.textbook_key
      if (!key) continue
      qtCounts.set(key, (qtCounts.get(key) || 0) + 1)
    }

    // 3. Count questions per textbook_key. Filter on the canonical jsonb
    //    column source_reference->>'textbook_key' (migration 019).
    const questionCountByKey = new Map()
    for (const key of new Set([...qtCounts.keys(), ...sources.map((s) => s.textbook_key)])) {
      try {
        const data = await supabaseRest("questions", {
          query: {
            select: "id",
            limit: 1,
            "source_reference->>textbook_key": `eq.${key}`,
          },
          headers: { Prefer: "count=exact" },
        })
        // PostgREST returns the rows; the count comes back in Content-Range
        // header which we don't have here. Workaround: ask for a higher
        // ceiling and read length. For an MVP this is fine.
        // Better: do a HEAD request directly via fetch.
        questionCountByKey.set(key, Array.isArray(data) ? data.length : 0)
      } catch {
        questionCountByKey.set(key, 0)
      }
    }

    // 3b. To get accurate counts, do a direct HEAD-style fetch for content-range.
    //     supabaseRest doesn't expose response headers, so do the count via fetch.
    const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
    const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
    for (const key of questionCountByKey.keys()) {
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/questions?select=id&limit=1&source_reference->>textbook_key=eq.${encodeURIComponent(key)}`,
          { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact" } }
        )
        const cr = r.headers.get("content-range")
        if (cr) {
          const total = Number(cr.split("/")[1])
          if (Number.isFinite(total)) questionCountByKey.set(key, total)
        }
      } catch {}
    }

    // 4. Compose. Some keys may exist in DB but not yet in the sources table —
    //    expose them too so admins can add a row.
    const seenKeys = new Set(sources.map((s) => s.textbook_key))
    const ghosts = []
    for (const key of qtCounts.keys()) {
      if (seenKeys.has(key)) continue
      ghosts.push({
        id: null,
        textbook_key: key,
        label: key,
        source_type: "external",
        pdf_url: null,
        pdf_storage_key: null,
        page_count: null,
        metadata: { _ghost: true, note: "Referenced by QTs but no sources row yet — run scripts/populate-sources.cjs" },
        qt_count: qtCounts.get(key) || 0,
        question_count: questionCountByKey.get(key) || 0,
      })
    }

    const decorated = sources.map((s) => ({
      ...s,
      qt_count: qtCounts.get(s.textbook_key) || 0,
      question_count: questionCountByKey.get(s.textbook_key) || 0,
    }))

    return res.status(200).json({ sources: [...decorated, ...ghosts] })
  } catch (err) {
    console.error("[admin/sources] failed:", err)
    return res.status(500).json({ error: err.message || "Failed to load sources" })
  }
}
