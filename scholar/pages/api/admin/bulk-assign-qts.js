// ─────────────────────────────────────────────────────────────────────────────
//  pages/api/admin/bulk-assign-qts.js
//
//  Bulk-assigns all QTs from a content bank to a student, creating:
//    • student_question_types  — score/mastery rows (enables practice immediately)
//    • draft_items             — session plan rows  (enables admin planning view)
//      Draft creation requires the subject to have content_bank_id set and
//      pacing_mode != 'unconfigured'. Use action setup_subject first if needed.
//
//  Actions:
//    GET                 → returns students, subjects, content_banks
//    POST setup_subject  → links subject to content bank, sets pacing_mode
//    POST preview        → dry-run: shows what would be assigned and when
//    POST bulk_assign    → creates score rows + draft_items
//
//  Date distribution strategies (dateMode):
//    "single"   — all QTs on one date (startDate or first upcoming session)
//    "spread"   — distribute evenly across sessions from startDate onward
//                 maxPerSession controls the cap per session (default 10)
// ─────────────────────────────────────────────────────────────────────────────

import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { supabaseSelect, supabaseInsert, supabaseRest } from "../../../lib/supabase"
import { getAllStudents, getAllSubjects } from "../../../lib/db"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

// ─────────────────────────────────────────────
//  Fetch helpers
// ─────────────────────────────────────────────

async function getSubject(subjectId) {
  const rows = await supabaseSelect("subjects", {
    select: "id,name,content_bank_id,pacing_mode,active_overlay_id",
    filters: { id: subjectId },
    limit: 1,
  })
  return rows[0] || null
}

async function getStudentQTIds(studentId, subjectId) {
  // Returns Set of question_type_ids already assigned to this student+subject
  const rows = await supabaseSelect("student_question_types", {
    select: "question_type_id",
    filters: { student_id: studentId, subject_id: subjectId },
  })
  return new Set(rows.map((r) => r.question_type_id))
}

async function getQTsForBank(contentBankId) {
  const rows = await supabaseSelect("question_types", {
    select: "id,title,unit_label,primary_slo_id,reinforcement_slos,source_type",
    filters: { content_bank_id: contentBankId, status: "active" },
    orderBy: "created_at",
    ascending: true,
  })
  return rows
}

async function getSessionsFromDate(studentId, subjectId, fromDate) {
  const rows = await supabaseSelect("sessions", {
    select: "id,student_session_date",
    filters: { student_id: studentId, subject_id: subjectId },
    orderBy: "student_session_date",
    ascending: true,
  })
  const from = fromDate ? String(fromDate).slice(0, 10) : ""
  return from
    ? rows.filter((r) => r.student_session_date && r.student_session_date >= from)
    : rows
}

// ─────────────────────────────────────────────
//  Date distribution
// ─────────────────────────────────────────────

function distributeQTs(qts, sessions, { dateMode, startDate, maxPerSession = 10 }) {
  if (!qts.length) return []

  if (dateMode === "single" || !sessions.length) {
    const date = sessions[0]?.student_session_date || String(startDate || new Date().toISOString().slice(0, 10))
    const sessionId = sessions[0]?.id || null
    return qts.map((qt, i) => ({ qt, date, sessionId, orderIndex: i }))
  }

  // "spread" — fill each session up to maxPerSession, then move to next
  const cap = Math.max(1, Number(maxPerSession) || 10)
  const result = []
  let sessionIdx = 0
  let posInSession = 0

  for (let i = 0; i < qts.length; i++) {
    if (posInSession >= cap) {
      sessionIdx++
      posInSession = 0
    }
    if (sessionIdx >= sessions.length) {
      // Overflow: pile onto the last session
      sessionIdx = sessions.length - 1
    }
    const session = sessions[sessionIdx]
    result.push({
      qt: qts[i],
      date: session.student_session_date,
      sessionId: session.id,
      orderIndex: i,
    })
    posInSession++
  }
  return result
}

// ─────────────────────────────────────────────
//  Row creators
// ─────────────────────────────────────────────

async function createScoreRows(studentId, subjectId, assignments) {
  let created = 0, skipped = 0
  const BATCH = 50
  const rows = assignments.map(({ qt, date }) => ({
    student_id: studentId,
    subject_id: subjectId,
    question_type_id: qt.id,
    date_introduced: date,
    weakness_score: 0,
    hw_source: "import",
    unit_label: qt.unit_label || null,
    primary_slo_id: qt.primary_slo_id || null,
    aligned_slo_ids: [],
    reinforcement_slos: Array.isArray(qt.reinforcement_slos) ? qt.reinforcement_slos : [],
    mastery_events: [],
    correct_question_keys: [],
    daily_seen_dates: [],
    daily_wrong_dates: [],
    metadata: {},
  }))

  // Plain insert in batches (existing QTs already filtered out by caller)
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    try {
      await supabaseRest("student_question_types", {
        method: "POST",
        body: batch,
        headers: { Prefer: "return=minimal" },
      })
      created += batch.length
    } catch (err) {
      console.error("[bulk-assign] score row batch failed:", err.message)
      skipped += batch.length
    }
  }
  return { created, skipped }
}

async function createDraftItems(studentId, subjectId, assignments) {
  let created = 0, failed = 0, failReason = null
  const BATCH = 50

  const rows = assignments.map(({ qt, date, sessionId, orderIndex }) => ({
    student_id: studentId,
    subject_id: subjectId,
    question_type_id: qt.id,
    session_id: sessionId || null,
    assigned_session_date: date,
    state: "backlog",
    plan_source: "bulk_assign",
    order_index: orderIndex,
    committed: false,
    dates_inferred: false,
    primary_slo_id: qt.primary_slo_id || null,
    aligned_slo_ids: [],
    reinforcement_slos: Array.isArray(qt.reinforcement_slos) ? qt.reinforcement_slos : [],
    school_unit_name: qt.unit_label || null,
    metadata: {},
  }))

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    try {
      await supabaseRest(
        "draft_items?on_conflict=student_id,question_type_id,assigned_session_date",
        {
          method: "POST",
          body: batch,
          headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        }
      )
      created += batch.length
    } catch (err) {
      failed += batch.length
      failReason = failReason || err.message
    }
  }
  return { created, failed, failReason }
}

// ─────────────────────────────────────────────
//  setup_subject
// ─────────────────────────────────────────────

async function setupSubject(subjectId, contentBankId, pacingMode = "default") {
  const allowed = ["default", "manual", "school", "textbook"]
  if (!allowed.includes(pacingMode)) {
    throw new Error(`pacingMode must be one of: ${allowed.join(", ")}`)
  }
  const subject = await getSubject(subjectId)
  if (!subject) throw new Error(`Subject ${subjectId} not found`)

  const patch = { content_bank_id: contentBankId, pacing_mode: pacingMode }
  if (pacingMode === "default" || pacingMode === "manual") {
    patch.active_overlay_id = null
  }

  await supabaseRest(`subjects?id=eq.${subjectId}`, {
    method: "PATCH",
    body: patch,
    headers: { Prefer: "return=minimal" },
  })

  return {
    subjectId,
    contentBankId,
    pacingMode,
    previousContentBankId: subject.content_bank_id || null,
    previousPacingMode: subject.pacing_mode,
  }
}

// ─────────────────────────────────────────────
//  Core assign function
// ─────────────────────────────────────────────

async function bulkAssign({
  studentId,
  subjectId,
  contentBankId,
  dateMode = "spread",
  startDate = null,
  maxPerSession = 10,
  skipExisting = true,
  createDrafts = true,
  dryRun = false,
}) {
  // Validate subject
  const subject = await getSubject(subjectId)
  if (!subject) throw new Error(`Subject ${subjectId} not found`)

  if (subject.content_bank_id && subject.content_bank_id !== contentBankId) {
    throw new Error(
      `Subject is linked to a different content bank (${subject.content_bank_id}). ` +
      `Run setup_subject first to update it, or pass the correct contentBankId.`
    )
  }

  // Get QTs
  const allQTs = await getQTsForBank(contentBankId)
  if (!allQTs.length) throw new Error(`No active question types found in content bank ${contentBankId}`)

  // Filter out already-assigned QTs
  let qts = allQTs
  let skippedExisting = 0
  if (skipExisting) {
    const existing = await getStudentQTIds(studentId, subjectId)
    const before = qts.length
    qts = qts.filter((qt) => !existing.has(qt.id))
    skippedExisting = before - qts.length
  }

  // Get sessions
  const sessions = await getSessionsFromDate(studentId, subjectId, startDate)

  // Distribute
  const assignments = distributeQTs(qts, sessions, { dateMode, startDate, maxPerSession })

  const preview = {
    totalQTs: allQTs.length,
    skippedExisting,
    toAssign: qts.length,
    sessions: sessions.length,
    dateMode,
    dateRange: assignments.length
      ? { from: assignments[0].date, to: assignments[assignments.length - 1].date }
      : null,
    perSessionDistribution: (() => {
      const byDate = {}
      for (const a of assignments) {
        byDate[a.date] = (byDate[a.date] || 0) + 1
      }
      return byDate
    })(),
  }

  if (dryRun) return { dryRun: true, ...preview }

  // Create score rows (always)
  const scoreStats = await createScoreRows(studentId, subjectId, assignments)

  // Create draft_items (may fail if subject not configured)
  let draftStats = { created: 0, failed: 0, failReason: null, skipped: true }
  if (createDrafts) {
    draftStats = await createDraftItems(studentId, subjectId, assignments)
    draftStats.skipped = false
  }

  return {
    ...preview,
    scoreRows: scoreStats,
    draftItems: draftStats,
  }
}

// ─────────────────────────────────────────────
//  Handler
// ─────────────────────────────────────────────

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store")
    const [students, subjects, contentBanks] = await Promise.all([
      getAllStudents(),
      getAllSubjects(),
      supabaseSelect("content_banks", { select: "id,key,label,subject_name,framework_id", orderBy: "label" }),
    ])
    return res.status(200).json({ students, subjects, contentBanks })
  }

  if (req.method !== "POST") return res.status(405).end()

  const { action = "bulk_assign", ...body } = req.body

  // ── setup_subject ──────────────────────────
  if (action === "setup_subject") {
    const { subjectId, contentBankId, pacingMode = "default" } = body
    if (!subjectId || !contentBankId) {
      return res.status(400).json({ error: "subjectId and contentBankId are required" })
    }
    try {
      const result = await setupSubject(subjectId, contentBankId, pacingMode)
      return res.status(200).json({ ok: true, ...result })
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }
  }

  // ── preview / bulk_assign ──────────────────
  if (action === "preview" || action === "bulk_assign") {
    const {
      studentId,
      subjectId,
      contentBankId,
      dateMode = "spread",
      startDate = null,
      maxPerSession = 10,
      skipExisting = true,
      createDrafts = true,
    } = body

    if (!studentId) return res.status(400).json({ error: "studentId is required" })
    if (!subjectId) return res.status(400).json({ error: "subjectId is required" })
    if (!contentBankId) return res.status(400).json({ error: "contentBankId is required" })

    try {
      const result = await bulkAssign({
        studentId,
        subjectId,
        contentBankId,
        dateMode,
        startDate,
        maxPerSession: Number(maxPerSession) || 10,
        skipExisting: skipExisting !== false,
        createDrafts: createDrafts !== false,
        dryRun: action === "preview",
      })
      return res.status(200).json({ ok: true, ...result })
    } catch (err) {
      console.error("[bulk-assign-qts] failed:", err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(400).json({ error: `Unknown action: ${action}` })
}
