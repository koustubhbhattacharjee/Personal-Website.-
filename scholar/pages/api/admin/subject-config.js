import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { hasSupabaseServer, supabaseSelect, supabaseUpdate } from "../../../lib/supabase"
import { ensureOverlayNativePacing, ensureSubjectDefaultPacing } from "../../../lib/pacing-guide"

const ADMIN_EMAIL = "kbohuastt@gmail.com"
const VALID_PACING_MODES = new Set(["unconfigured", "default", "school", "textbook", "manual"])

async function loadSubjectConfig(subjectId) {
  const subject = await supabaseSelect("subjects", {
    select: "id,name,content_bank_id,pacing_mode,active_overlay_id",
    filters: { id: subjectId },
    single: true,
  })
  if (!subject) return null

  const banks = await supabaseSelect("content_banks", {
    select: "id,key,label,subject_name,framework_id,source_label,is_canonical",
    orderBy: "label",
    ascending: true,
    limit: 1000,
  })

  const overlays = await supabaseSelect("school_overlays", {
    select: "id,content_bank_id,overlay_key,source_label,source_kind,is_active",
    orderBy: "source_label",
    ascending: true,
    limit: 1000,
  })

  return { subject, banks, overlays }
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  if (!hasSupabaseServer()) {
    return res.status(503).json({ error: "Supabase is not configured on the server" })
  }

  const subjectId = String(req.method === "GET" ? req.query.subjectId : req.body?.subjectId || "").trim()
  if (!subjectId) {
    return res.status(400).json({ error: "Missing subjectId" })
  }

  if (req.method === "GET") {
    try {
      const payload = await loadSubjectConfig(subjectId)
      if (!payload?.subject) return res.status(404).json({ error: "Subject not found" })
      return res.status(200).json(payload)
    } catch (error) {
      return res.status(500).json({ error: error.message || "Failed to load subject config" })
    }
  }

  if (req.method === "POST") {
    const pacingMode = String(req.body?.pacingMode || "").trim()
    const contentBankId = String(req.body?.contentBankId || "").trim() || null
    let activeOverlayId = String(req.body?.activeOverlayId || "").trim() || null

    if (!VALID_PACING_MODES.has(pacingMode)) {
      return res.status(400).json({ error: "Invalid pacingMode" })
    }

    if ((pacingMode === "school" || pacingMode === "textbook") && !activeOverlayId) {
      return res.status(400).json({ error: "School and textbook pacing require an active overlay" })
    }

    if (pacingMode === "default" || pacingMode === "manual" || pacingMode === "unconfigured") {
      activeOverlayId = null
    }

    try {
      const updatedRows = await supabaseUpdate("subjects", { id: subjectId }, {
        content_bank_id: contentBankId,
        pacing_mode: pacingMode,
        active_overlay_id: activeOverlayId,
        updated_at: new Date().toISOString(),
      })
      const subject = Array.isArray(updatedRows) ? (updatedRows[0] || null) : updatedRows

      ensureSubjectDefaultPacing(subjectId).catch((err) =>
        console.error("[subject-config] ensureSubjectDefaultPacing failed:", err.message)
      )
      if (activeOverlayId) {
        ensureOverlayNativePacing(activeOverlayId).catch((err) =>
          console.error("[subject-config] ensureOverlayNativePacing failed:", err.message)
        )
      }

      const payload = await loadSubjectConfig(subjectId)
      return res.status(200).json({
        ok: true,
        subject: subject || payload?.subject || null,
        banks: payload?.banks || [],
        overlays: payload?.overlays || [],
      })
    } catch (error) {
      return res.status(500).json({ error: error.message || "Failed to save subject config" })
    }
  }

  res.setHeader("Allow", "GET,POST")
  return res.status(405).json({ error: "Method not allowed" })
}
