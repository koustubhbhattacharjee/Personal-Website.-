// rebuild-pages.js
// Re-tags question_types in Supabase with updated SLO data using Claude.
// Replaces the old Notion page block rebuilder.
//
// POST { subjectId, contentBankId, dryRun? }
//   → for each question_type in the content bank that lacks primary_slo_id,
//     call Claude to infer SLO from title + questions, resolve to Supabase ID, update the row.

import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getStudentById, getSubjectById } from "../../../lib/db"
import { supabaseSelect, supabaseRest } from "../../../lib/supabase"
import { buildSloTaxonomyString, buildValidSloSet } from "../../../lib/slo-utils"
import { tagQuestionTypesWithSlos } from "../../../lib/claude"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

async function resolveShortSloCode(shortCode, frameworkId) {
  if (!shortCode || !frameworkId) return null
  const rows = await supabaseRest(
    `sub_learning_objectives?select=id&learning_objectives=inner&learning_objectives.framework_id=eq.${frameworkId}&code=eq.${encodeURIComponent(shortCode)}&limit=1`,
    { method: "GET" }
  ).catch(() => [])
  return Array.isArray(rows) && rows.length ? rows[0].id : null
}

async function getFrameworkForBank(contentBankId) {
  const rows = await supabaseSelect("content_banks", {
    select: "framework_id",
    filters: { id: contentBankId },
    limit: 1,
  })
  return rows[0]?.framework_id || null
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const { subjectId, contentBankId, dryRun = false } = req.body || {}
  if (!contentBankId) return res.status(400).json({ error: "contentBankId required" })

  try {
    const subject = subjectId ? await getSubjectById(subjectId) : null
    const subjectName = subject?.name || ""

    const frameworkId = await getFrameworkForBank(contentBankId)
    if (!frameworkId) return res.status(400).json({ error: "Content bank has no linked framework" })

    // Fetch question_types missing primary_slo_id
    const qtRows = await supabaseSelect("question_types", {
      select: "id,title,unit_label,primary_slo_id",
      filters: { content_bank_id: contentBankId },
    })
    const toTag = qtRows.filter((r) => !r.primary_slo_id)

    if (dryRun) {
      return res.status(200).json({
        ok: true,
        dryRun: true,
        total: qtRows.length,
        needsTagging: toTag.length,
      })
    }

    const sloTaxonomyString = buildSloTaxonomyString(null, subjectName)

    let tagged = 0
    let skipped = 0
    let failed = 0

    for (const qt of toTag) {
      try {
        // Fetch a sample question for context
        const questions = await supabaseSelect("questions", {
          select: "question_text,answer_text",
          filters: { question_type_id: qt.id },
          limit: 2,
        })
        const sampleContext = questions.map((q) => q.question_text).join("\n")

        // Ask Claude to infer the primary SLO short code
        let inferredCode = null
        if (typeof tagQuestionTypesWithSlos === "function" && sloTaxonomyString) {
          inferredCode = await tagQuestionTypesWithSlos(qt.title, sampleContext, sloTaxonomyString)
        }

        if (!inferredCode) { skipped++; continue }

        const sloId = await resolveShortSloCode(inferredCode, frameworkId)
        if (!sloId) { skipped++; continue }

        await supabaseRest(`question_types?id=eq.${qt.id}`, {
          method: "PATCH",
          body: { primary_slo_id: sloId, updated_at: new Date().toISOString() },
          headers: { Prefer: "return=minimal" },
        })
        tagged++
      } catch (e) {
        console.warn("[rebuild-pages] failed for qt:", qt.id, e.message)
        failed++
      }
    }

    return res.status(200).json({
      ok: true,
      total: qtRows.length,
      needsTagging: toTag.length,
      tagged,
      skipped,
      failed,
    })
  } catch (err) {
    console.error("[rebuild-pages] error:", err)
    return res.status(500).json({ error: err.message || "Failed to rebuild" })
  }
}
