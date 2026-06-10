import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getAllScoresForStudent, getQuestionsWithScores, getStudentById, getSubjectById } from "../../../lib/db"
import { supabaseRest, supabaseSelect } from "../../../lib/supabase"
import { getLoForSlo } from "../../../lib/slo-utils"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

async function getSloMetaMap(questionTypes = [], scoreRows = []) {
  const ids = new Set()
  ;(questionTypes || []).forEach((item) => { if (item?.primarySloId) ids.add(String(item.primarySloId)) })
  ;(scoreRows || []).forEach((item) => { if (item?.primarySloId) ids.add(String(item.primarySloId)) })

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
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  const studentId = String(req.query.studentId || req.body?.studentId || "").trim()
  const subjectId = String(req.query.subjectId || req.body?.subjectId || "").trim()
  const limit = Math.max(1, Math.min(200, Number(req.query.limit || req.body?.limit || 50)))
  if (!studentId || !subjectId) {
    return res.status(400).json({ error: "studentId and subjectId are required" })
  }

  try {
    const [student, subject] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
    ])
    if (!student || !subject?.contentBankId) {
      return res.status(404).json({ error: "Student or subject not found" })
    }

    const [questionTypes, scoreRows, sectionRows] = await Promise.all([
      getQuestionsWithScores(subject.contentBankId, studentId, subjectId),
      getAllScoresForStudent(studentId, subjectId),
      subject.activeOverlayId
        ? supabaseRest(
            `school_sections?select=id,section_key,section_label,sequence_index,school_units!inner(id,unit_key,unit_name,sequence_index,overlay_id)&school_units.overlay_id=eq.${subject.activeOverlayId}`,
            { method: "GET" }
          ).catch(() => [])
        : Promise.resolve([]),
    ])

    const sloMetaMap = await getSloMetaMap(questionTypes, scoreRows)
    const sectionById = new Map(
      (sectionRows || []).map((s) => {
        const unit = Array.isArray(s.school_units) ? s.school_units[0] : s.school_units
        return [String(s.id || ""), {
          schoolUnitKey: unit?.unit_key || "",
          schoolUnitName: unit?.unit_name || "",
          schoolSection: s.section_key || "",
          schoolSectionTitle: s.section_label || "",
          schoolSequenceIndex: Number.isFinite(Number(unit?.sequence_index))
            ? Number(unit.sequence_index) * 1000 + Number(s.sequence_index ?? 0)
            : Number.MAX_SAFE_INTEGER,
        }]
      })
    )

    const items = (questionTypes || []).map((qt) => {
      const sloMeta = sloMetaMap[qt.primarySloId || ""] || {}
      const sec = sectionById.get(String(qt.schoolSectionId || "")) || null
      return {
        id: qt.id,
        title: qt.title || "",
        sourceLabel: qt.sourceLabel || "",
        primarySloId: qt.primarySloId || "",
        standardCode: qt.standardCode || sloMeta.sloCode || "",
        loCode: qt.loCode || sloMeta.loCode || "",
        schoolSectionId: qt.schoolSectionId || "",
        schoolUnitKey: sec?.schoolUnitKey || qt.schoolUnitKey || "",
        schoolUnitName: sec?.schoolUnitName || qt.schoolUnitName || "",
        schoolSection: sec?.schoolSection || qt.schoolSection || "",
        schoolSectionTitle: sec?.schoolSectionTitle || qt.schoolSectionTitle || "",
        schoolSequenceIndex: sec?.schoolSequenceIndex ?? qt.schoolSequenceIndex ?? Number.MAX_SAFE_INTEGER,
        weaknessScore: Number(qt.weaknessScore || 0),
        dateIntroduced: qt.dateIntroduced || null,
        questionCount: Number(qt.questionCount || 0),
      }
    })

    return res.status(200).json({
      student: { id: student.id, name: student.name },
      subject: {
        id: subject.id,
        name: subject.name,
        contentBankId: subject.contentBankId,
        activeOverlayId: subject.activeOverlayId || "",
      },
      counts: {
        questionTypes: items.length,
        scoreRows: scoreRows.length,
        overlaySections: sectionRows.length,
        withLoCode: items.filter((item) => item.loCode).length,
        withStandardCode: items.filter((item) => item.standardCode).length,
        withSchoolSectionId: items.filter((item) => item.schoolSectionId).length,
        withSchoolUnitName: items.filter((item) => item.schoolUnitName).length,
      },
      sampleWithSection: items.filter((item) => item.schoolSectionId).slice(0, limit),
      sampleMissingSection: items.filter((item) => !item.schoolSectionId).slice(0, limit),
    })
  } catch (error) {
    console.error("[debug-student-cylinder] failed:", error)
    return res.status(500).json({ error: error.message || "Debug query failed" })
  }
}
