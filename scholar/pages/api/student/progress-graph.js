import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  calculateMasteryScore,
  calculateReinforcementByCode,
  getAllScoresForStudent,
  getSubjectById,
  getQuestionsWithScores,
  listDraftRowsByStudentSubject,
  getStudentById,
  getTodayInTimezone,
  getQuestionsForStudentContext,
} from "../../../lib/db"
import { getShowcaseStudentId, isShowcaseDemo } from "../../../lib/showcase"
import { getShowcaseProgressGraph } from "../../../lib/showcase-demo"
import { buildSubjectFlowMeta } from "../../../lib/session-mode"
import { supabaseRest, supabaseSelect } from "../../../lib/supabase"
import { getLoForSlo } from "../../../lib/slo-utils"
import { buildPacingGuideContext } from "../../../lib/pacing-guide"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function fallbackQuestionKey(text = "") {
  let h = 5381
  const src = String(text || "").replace(/\s+/g, " ").trim().slice(0, 200)
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h) ^ src.charCodeAt(i)
  return `q_${(h >>> 0).toString(16).padStart(8, "0")}`
}

function normalizeQuestionId(value = "") {
  const raw = String(value || "").trim()
  if (!raw) return ""
  const clean = raw.replace(/-/g, "")
  if (clean.length !== 32) return raw
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`
}

function resolveCorrectIndex(item = {}) {
  if (Number.isInteger(item?.mcq?.correctIndex)) return item.mcq.correctIndex
  if (Number.isInteger(item?.correctIndex)) return item.correctIndex
  const rawOption = String(item?.mcq?.correct_option || item?.correct_option || "").trim().toUpperCase()
  if (/^[A-D]$/.test(rawOption)) return rawOption.charCodeAt(0) - 65
  return null
}

async function getSloMetaMap(questionTypes = [], scoreRows = [], draftRows = []) {
  const ids = new Set()
  ;(questionTypes || []).forEach((item) => { if (item?.primarySloId) ids.add(String(item.primarySloId)) })
  ;(scoreRows || []).forEach((item) => { if (item?.primarySloId) ids.add(String(item.primarySloId)) })
  ;(draftRows || []).forEach((item) => { if (item?.primarySloId) ids.add(String(item.primarySloId)) })

  const allIds = [...ids].filter(Boolean)
  if (!allIds.length) return {}

  const rows = await supabaseSelect("sub_learning_objectives", {
    select: "id,code",
    filters: { id: allIds },
    limit: allIds.length,
  }).catch(() => [])

  return Object.fromEntries((rows || []).map((row) => {
    const sloCode = String(row.code || "")
    return [String(row.id || ""), {
      sloCode,
      loCode: getLoForSlo(sloCode),
    }]
  }))
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store")
  const demoMode = isShowcaseDemo(req)
  if (demoMode) {
    const data = await getShowcaseProgressGraph(req, req.query.subjectId)
    // If subjectId is a showcase course, serve from showcase-demo.js
    if (data) return res.status(200).json(data)
    // Otherwise subjectId is a Notion-backed preview subject — fall through to regular path
  }
  const session = demoMode ? null : await getServerSession(req, res, authOptions)
  if (!session && !demoMode) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = demoMode || (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const { subjectId, as: asStudentId } = req.query
  const debugRequested = String(req.query.debug || "").trim() === "1"
  const studentId = demoMode
    ? (asStudentId || getShowcaseStudentId())
    : (isAdmin && asStudentId) ? asStudentId : session?.notionStudentId

  if (!subjectId) return res.status(400).json({ error: "subjectId required" })

  try {
    const [subject, student] = await Promise.all([
      getSubjectById(subjectId),
      getStudentById(studentId),
    ])
    if (!subject?.contentBankId) {
      return res.status(400).json({ error: "Subject has no content bank configured." })
    }

    const country = student?.country || "International"
    const state = student?.state || null
    const today = getTodayInTimezone(student?.timezone || "UTC")

    const [questionTypes, draftRows, scoreRows, sectionRows, sectionSloRows, pacingContext] = await Promise.all([
      getQuestionsWithScores(subject.contentBankId, studentId, subjectId),
      listDraftRowsByStudentSubject(studentId, subjectId, { committed: false, limit: 500 }).catch(() => []),
      getAllScoresForStudent(studentId, subjectId),
      // Load school sections for this subject's active overlay — used to attach
      // schoolUnitKey/schoolUnitName/schoolSection/schoolSequenceIndex to each QT
      subject.activeOverlayId
        ? supabaseRest(
            `school_sections?select=id,section_key,section_label,sequence_index,school_units!inner(id,unit_key,unit_name,sequence_index)&school_units.overlay_id=eq.${subject.activeOverlayId}`,
            { method: "GET" }
          ).catch(() => [])
        : Promise.resolve([]),
      subject.activeOverlayId
        ? supabaseRest(
            `school_section_slos?select=school_section_id,slo_id,school_sections!inner(id,school_units!inner(overlay_id))&school_sections.school_units.overlay_id=eq.${subject.activeOverlayId}`,
            { method: "GET" }
          ).catch(() => [])
        : Promise.resolve([]),
      buildPacingGuideContext({ subjectId, studentId }).catch(() => ({ sectionOrder: new Map() })),
    ])
    const sloMetaMap = await getSloMetaMap(questionTypes, scoreRows, draftRows)

    const pendingAttempts = await supabaseSelect("student_question_attempts", {
      select: "question_type_id",
      filters: { student_id: studentId, subject_id: subjectId, review_status: "pending" },
      limit: 500,
    }).catch(() => [])
    const pendingReviewCountByQt = {}
    for (const a of pendingAttempts || []) {
      const k = String(a?.question_type_id || "")
      if (!k) continue
      pendingReviewCountByQt[k] = (pendingReviewCountByQt[k] || 0) + 1
    }

    const LOCK_WINDOW_MS = 3 * 60 * 60 * 1000
    const lockCutoffIso = new Date(Date.now() - LOCK_WINDOW_MS).toISOString()
    const recentAttempts = await supabaseRest(
      `student_question_attempts?select=question_key,created_at&student_id=eq.${studentId}&subject_id=eq.${subjectId}&mode=eq.practice&created_at=gte.${lockCutoffIso}&order=created_at.desc&limit=1000`,
      { method: "GET" }
    ).catch(() => [])
    const questionLocks = {}
    for (const a of recentAttempts || []) {
      const key = String(a?.question_key || "")
      if (!key) continue
      const createdAt = new Date(a.created_at).getTime()
      if (!Number.isFinite(createdAt)) continue
      const unlockAt = new Date(createdAt + LOCK_WINDOW_MS).toISOString()
      if (!questionLocks[key] || new Date(questionLocks[key]).getTime() < createdAt + LOCK_WINDOW_MS) {
        questionLocks[key] = unlockAt
      }
    }
    const pacingSectionOrder = pacingContext?.sectionOrder instanceof Map ? pacingContext.sectionOrder : new Map()
    const activeDraftRows = (draftRows || []).filter((row) => row.state !== "archived" && row.state !== "homework_pool")
    const allQuestionTypeMap = new Map(
      (questionTypes || []).map((item) => {
        const key = normalizeQuestionId(item?.id || "")
        return [key || String(item?.id || ""), {
          ...item,
          id: key || item.id,
          standardCode: item?.standardCode || sloMetaMap[item?.primarySloId || ""]?.sloCode || "",
          loCode: item?.loCode || sloMetaMap[item?.primarySloId || ""]?.loCode || "",
          plannedSessionDate: item?.dateIntroduced || null,
        }]
      })
    )

    ;(scoreRows || []).forEach((row) => {
      const key = normalizeQuestionId(row?.questionId || "")
      if (!key) return
      const existing = allQuestionTypeMap.get(key) || null
      allQuestionTypeMap.set(key, {
        ...existing,
        id: key,
        title: existing?.title || row?.questionName || "Untitled",
        standardCode: row?.standardCode || existing?.standardCode || sloMetaMap[row?.primarySloId || ""]?.sloCode || "",
        loCode: row?.loCode || existing?.loCode || sloMetaMap[row?.primarySloId || ""]?.loCode || "",
        unit: row?.unit || existing?.unit || "",
        weaknessScore: Number(row?.score || 0),
        status: row?.status || existing?.status || "",
        dateIntroduced: row?.dateIntroduced || existing?.dateIntroduced || null,
        plannedSessionDate: row?.dateIntroduced || existing?.plannedSessionDate || existing?.dateIntroduced || null,
        correctQuestionKeys: row?.correctQuestionKeys || [],
        dailySeenDates: row?.dailySeenDates || [],
        dailyWrongDates: row?.dailyWrongDates || [],
        masteryEvents: row?.masteryEvents || [],
        scoreRowId: row?.id || existing?.scoreRowId || null,
        recoveredFromScores: !existing,
      })
    })

    const questionTypeMap = new Map()
    ;(scoreRows || []).forEach((row) => {
      const key = normalizeQuestionId(row?.questionId || "")
      if (!key) return
      const existing = allQuestionTypeMap.get(key)
      if (existing) questionTypeMap.set(key, existing)
    })

    activeDraftRows.forEach((row) => {
      const key = normalizeQuestionId(row?.questionPageId || "")
      if (!key) return
      const existing = questionTypeMap.get(key) || allQuestionTypeMap.get(key) || null
      questionTypeMap.set(key, {
        ...existing,
        id: key,
        title: existing?.title || row?.title || "Untitled",
        standardCode: row?.standardCode || existing?.standardCode || sloMetaMap[row?.primarySloId || ""]?.sloCode || "",
        loCode: row?.loCode || existing?.loCode || sloMetaMap[row?.primarySloId || ""]?.loCode || "",
        unit: row?.unit || existing?.unit || "",
        plannedSessionDate: row?.assignedSessionDate || existing?.plannedSessionDate || existing?.dateIntroduced || null,
        dateIntroduced: row?.assignedSessionDate || existing?.dateIntroduced || null,
        draftState: row?.state || existing?.draftState || "",
        planSource: row?.planSource || existing?.planSource || "",
        datesInferred: row?.datesInferred ?? existing?.datesInferred ?? false,
        sessionId: row?.sessionId || existing?.sessionId || "",
      })
    })

    // Build section lookup: section_id → { unitKey, unitName, sectionKey, sectionLabel, seqIndex }
    const sectionById = new Map(
      (sectionRows || []).map((s) => {
        const unit = Array.isArray(s.school_units) ? s.school_units[0] : s.school_units
        const sectionId = String(s.id || "")
        const pacingOrder = pacingSectionOrder.has(sectionId)
          ? pacingSectionOrder.get(sectionId)
          : null
        return [s.id, {
          schoolUnitKey:      unit?.unit_key       || "",
          schoolUnitName:     unit?.unit_name      || "",
          schoolSection:      s.section_key        || "",
          schoolSectionTitle: s.section_label      || "",
          schoolSequenceIndex: pacingOrder != null
            ? Number(pacingOrder)
            : Number.isFinite(Number(unit?.sequence_index))
            ? Number(unit.sequence_index) * 1000 + Number(s.sequence_index ?? 0)
            : Number.MAX_SAFE_INTEGER,
        }]
      })
    )
    const sectionLoCodesById = new Map()
    ;(sectionSloRows || []).forEach((row) => {
      const sectionId = String(row?.school_section_id || "")
      const sloId = String(row?.slo_id || "")
      if (!sectionId || !sloId) return
      const loCode = getLoForSlo(sloId.includes("::") ? sloId.split("::").pop() : sloId)
      if (!loCode) return
      if (!sectionLoCodesById.has(sectionId)) sectionLoCodesById.set(sectionId, new Set())
      sectionLoCodesById.get(sectionId).add(loCode)
    })
    const sectionIdsByLoCode = new Map()
    sectionLoCodesById.forEach((codes, sectionId) => {
      ;[...codes].forEach((code) => {
        if (!sectionIdsByLoCode.has(code)) sectionIdsByLoCode.set(code, new Set())
        sectionIdsByLoCode.get(code).add(sectionId)
      })
    })

    const effectiveQuestionTypes = Array.from(questionTypeMap.values()).map((item) => {
      const sec = sectionById.get(item.schoolSectionId || "") || null
      return {
        ...item,
        schoolUnitKey:       sec?.schoolUnitKey       || item.schoolUnitKey       || "",
        schoolUnitName:      sec?.schoolUnitName      || item.schoolUnitName      || "",
        schoolSection:       sec?.schoolSection       || item.schoolSection       || "",
        schoolSectionTitle:  sec?.schoolSectionTitle  || item.schoolSectionTitle  || "",
        schoolSequenceIndex: sec?.schoolSequenceIndex ?? item.schoolSequenceIndex ?? Number.MAX_SAFE_INTEGER,
      }
    })
    const currentPlannedCount = activeDraftRows.length
      ? activeDraftRows.filter((row) => row.assignedSessionDate === today).length
      : effectiveQuestionTypes.filter((q) => q.dateIntroduced === today).length
    const futurePlannedCount = activeDraftRows.length
      ? activeDraftRows.filter((row) => row.assignedSessionDate && row.assignedSessionDate > today).length
      : effectiveQuestionTypes.filter((q) => q.dateIntroduced && q.dateIntroduced > today).length
    const flow = buildSubjectFlowMeta({
      subjectExamDate: subject?.examDate,
      activeDate: today,
      futurePlannedCount,
      currentPlannedCount,
    })
    const enriched = await Promise.all(
      effectiveQuestionTypes.map(async (q) => {
        const plannedSessionDate = q.plannedSessionDate || q.dateIntroduced || null
        try {
          const stored = await getQuestionsForStudentContext(
            q.id,
            country,
            state,
            q.standardCode || "",
            subject.name
          )
          const normalizedStored = stored.map((item, idx) => {
            const key = item.qhash || fallbackQuestionKey(`${idx}:${item.question}`)
            return {
              ...item,
              key,
            }
          })
          const reinforcementLookup = Object.fromEntries(
            normalizedStored.map((item) => [
              item.key,
              {
                primaryLo: item.primaryLo || "",
                reinforcementTargets: Array.isArray(item.reinforcementTargets) && item.reinforcementTargets.length
                  ? item.reinforcementTargets
                  : (Array.isArray(q.reinforcementTargets) ? q.reinforcementTargets : []),
              },
            ])
          )
          const attemptedKeys = q.correctQuestionKeys || []
          const attemptedKeySet = new Set(attemptedKeys)
          const orderedQuestions = normalizedStored
            .slice()
            .sort((a, b) => {
              const aDone = attemptedKeySet.has(a.key)
              const bDone = attemptedKeySet.has(b.key)
              if (aDone !== bDone) return aDone ? 1 : -1
              return 0
            })
          const allAnswered = normalizedStored.length > 0 && normalizedStored.every(item => attemptedKeySet.has(item.key))
          const lockReason = allAnswered ? "completed" : ""
          return {
            id: q.id,
            title: q.title || "Untitled",
            standardCode: q.standardCode || "",
            loCode: q.loCode || "",
            primarySloId: q.primarySloId || "",
            weaknessScore: Number(q.weaknessScore || 0),
            masteryScore: calculateMasteryScore(q.masteryEvents || [], today),
            reinforcementByCode: calculateReinforcementByCode(q.masteryEvents || [], reinforcementLookup, today),
            status: q.status || "",
            dateIntroduced: plannedSessionDate,
            isLocked: !!lockReason,
            lockReason,
            questionCount: normalizedStored.length || 0,
            correctQuestionKeys: attemptedKeys,
            pendingReviewCount: pendingReviewCountByQt[String(q.id || "")] || 0,
            dailySeenDates: q.dailySeenDates || [],
            dailyWrongDates: q.dailyWrongDates || [],
            masteryEvents: q.masteryEvents || [],
            draftState: q.draftState || "",
            planSource: q.planSource || "",
            datesInferred: !!q.datesInferred,
            schoolSectionId: q.schoolSectionId || "",
            schoolUnitKey: q.schoolUnitKey || "",
            schoolUnitName: q.schoolUnitName || "",
            schoolSection: q.schoolSection || "",
            schoolSectionTitle: q.schoolSectionTitle || "",
            schoolSequenceIndex: Number.isFinite(Number(q.schoolSequenceIndex)) ? Number(q.schoolSequenceIndex) : Number.MAX_SAFE_INTEGER,
            sectionReinforcementTargets: [],
            questions: orderedQuestions.map((item, idx) => ({
              key: item.key || fallbackQuestionKey(`${idx}:${item.question}`),
              qhash: item.qhash || null,
              question: item.question || item.mcq?.question || "",
              answer: item.answer || "",
              imageUrl: item.imageUrl || item.mcq?.sourceImage || item.sourceImage || "",
              content: Array.isArray(item.content) && item.content.length
                ? item.content
                : (Array.isArray(item.mcq?.content) && item.mcq.content.length ? item.mcq.content : null),
              options: Array.isArray(item.mcq?.options)
                ? item.mcq.options
                : (Array.isArray(item.options) ? item.options : []),
              correctIndex: resolveCorrectIndex(item),
              correctOption: item.mcq?.correct_option || item.correct_option || "",
              explanation: item.mcq?.explanation || item.explanation || "",
              reinforcementTargets: item.reinforcementTargets || [],
              questionFormat: item.questionFormat || item.mcq?.questionFormat || "mcq",
              stemGroupId: item.stemGroupId || item.mcq?.stemGroupId || null,
              isStemChild: !!(item.isStemChild || item.mcq?.isStemChild),
              stemHeader: Array.isArray(item.stemHeader) && item.stemHeader.length
                ? item.stemHeader
                : (Array.isArray(item.mcq?.stemHeader) && item.mcq.stemHeader.length ? item.mcq.stemHeader : null),
            })),
          }
        } catch {
          return {
            id: q.id,
            title: q.title || "Untitled",
            standardCode: q.standardCode || "",
            loCode: q.loCode || "",
            primarySloId: q.primarySloId || "",
            weaknessScore: Number(q.weaknessScore || 0),
            masteryScore: calculateMasteryScore(q.masteryEvents || [], today),
            reinforcementByCode: {},
            status: q.status || "",
            dateIntroduced: plannedSessionDate,
            isLocked: false,
            lockReason: "",
            questionCount: 0,
            correctQuestionKeys: q.correctQuestionKeys || [],
            pendingReviewCount: pendingReviewCountByQt[String(q.id || "")] || 0,
            dailySeenDates: q.dailySeenDates || [],
            dailyWrongDates: q.dailyWrongDates || [],
            masteryEvents: q.masteryEvents || [],
            draftState: q.draftState || "",
            planSource: q.planSource || "",
            datesInferred: !!q.datesInferred,
            schoolSectionId: q.schoolSectionId || "",
            schoolUnitKey: q.schoolUnitKey || "",
            schoolUnitName: q.schoolUnitName || "",
            schoolSection: q.schoolSection || "",
            schoolSectionTitle: q.schoolSectionTitle || "",
            schoolSequenceIndex: Number.isFinite(Number(q.schoolSequenceIndex)) ? Number(q.schoolSequenceIndex) : Number.MAX_SAFE_INTEGER,
            sectionReinforcementTargets: [],
            questions: [],
          }
        }
      })
    )

    const enrichedWithSectionReinforcement = enriched.map((item) => {
      const directSectionId = String(item.schoolSectionId || "")
      if (!directSectionId) return item

      const targets = []
      const addTarget = (sectionId, weight) => {
        const normalizedWeight = Number(weight || 0)
        if (!sectionId || sectionId === directSectionId || !Number.isFinite(normalizedWeight) || normalizedWeight <= 0) return
        const existing = targets.find((target) => target.sectionId === sectionId)
        if (existing) existing.weight += normalizedWeight
        else targets.push({ sectionId, weight: normalizedWeight })
      }

      const primaryLoCode = String(item.loCode || "").trim()
      const primarySections = primaryLoCode ? [...(sectionIdsByLoCode.get(primaryLoCode) || new Set())] : []
      if (primarySections.length) {
        const share = 0.5 / primarySections.length
        primarySections.forEach((sectionId) => addTarget(sectionId, share))
      }

      const otherEntries = Object.entries(item.reinforcementByCode || {})
        .map(([code, value]) => ({ code: String(code || "").trim(), value: Number(value || 0) }))
        .filter((entry) => entry.code && Number.isFinite(entry.value) && entry.value > 0)
      const otherTotal = otherEntries.reduce((sum, entry) => sum + entry.value, 0)
      if (otherTotal > 0) {
        otherEntries.forEach((entry) => {
          const sections = [...(sectionIdsByLoCode.get(entry.code) || new Set())]
          if (!sections.length) return
          const distributed = (entry.value / otherTotal) * 0.5 / sections.length
          sections.forEach((sectionId) => addTarget(sectionId, distributed))
        })
      }

      const totalWeight = targets.reduce((sum, target) => sum + target.weight, 0)
      const normalizedTargets = totalWeight > 1
        ? targets.map((target) => ({ ...target, weight: target.weight / totalWeight }))
        : targets

      return {
        ...item,
        sectionReinforcementTargets: normalizedTargets,
      }
    })

    const payload = {
      subject: subject.name,
      flow,
      questionTypes: enrichedWithSectionReinforcement,
      questionLocks,
    }

    if (debugRequested && isAdmin) {
      const debugItems = enrichedWithSectionReinforcement.map((item) => ({
        id: item.id,
        title: item.title,
        loCode: item.loCode || "",
        standardCode: item.standardCode || "",
        schoolSectionId: item.schoolSectionId || "",
        schoolUnitName: item.schoolUnitName || "",
        schoolSection: item.schoolSection || "",
        schoolSectionTitle: item.schoolSectionTitle || "",
        schoolSequenceIndex: item.schoolSequenceIndex,
      }))
      payload.debug = {
        subjectId,
        studentId,
        activeOverlayId: subject.activeOverlayId || "",
        overlaySectionCount: Array.isArray(sectionRows) ? sectionRows.length : 0,
        questionTypeCount: debugItems.length,
        withLoCode: debugItems.filter((item) => item.loCode).length,
        withStandardCode: debugItems.filter((item) => item.standardCode).length,
        withSchoolSectionId: debugItems.filter((item) => item.schoolSectionId).length,
        withSchoolUnitName: debugItems.filter((item) => item.schoolUnitName).length,
        sampleMissingSection: debugItems.filter((item) => !item.schoolSectionId).slice(0, 10),
        sampleWithSection: debugItems.filter((item) => item.schoolSectionId).slice(0, 10),
      }
    }

    return res.status(200).json(payload)
  } catch (err) {
    console.error("Progress graph error:", err)
    return res.status(500).json({ error: "Failed to load progress graph data" })
  }
}
