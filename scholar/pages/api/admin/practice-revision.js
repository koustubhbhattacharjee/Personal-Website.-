import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getQuestionsWithScores, getStudentById, getSubjectById } from "../../../lib/db"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function round(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }
  if (req.method !== "GET") return res.status(405).end()

  const { studentId, subjectId } = req.query
  if (!studentId || !subjectId) {
    return res.status(400).json({ error: "studentId and subjectId required" })
  }

  try {
    const [student, subject] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
    ])
    if (!subject?.dataSourceId) {
      return res.status(400).json({ error: "Subject has no data source ID configured." })
    }

    const questions = await getQuestionsWithScores(subject.dataSourceId, studentId, subjectId)
    const practiced = questions
      .map((q) => {
        const attempts = Array.isArray(q.correctQuestionKeys) ? q.correctQuestionKeys.length : 0
        const seenDays = Array.isArray(q.dailySeenDates) ? q.dailySeenDates.length : 0
        const wrongDays = Array.isArray(q.dailyWrongDates) ? q.dailyWrongDates.length : 0
        const practiceTouches = Math.max(attempts, seenDays)
        const practiceNeedScore = round((q.weaknessScore || 0) + wrongDays * 1.5 + Math.max(0, seenDays - attempts) * 0.25)
        return {
          id: q.id,
          title: q.title || "Untitled",
          unit: q.unit || "General",
          standardCode: q.standardCode || "",
          weaknessScore: round(q.weaknessScore || 0),
          attempts,
          seenDays,
          wrongDays,
          practiceTouches,
          practiceNeedScore,
        }
      })
      .filter((q) => q.practiceTouches > 0 || q.wrongDays > 0)
      .sort((a, b) =>
        (b.practiceNeedScore - a.practiceNeedScore) ||
        (b.wrongDays - a.wrongDays) ||
        (b.weaknessScore - a.weaknessScore) ||
        a.title.localeCompare(b.title)
      )

    const unitMap = {}
    for (const item of practiced) {
      const key = item.unit || "General"
      if (!unitMap[key]) {
        unitMap[key] = {
          unit: key,
          questionTypes: 0,
          practiceTouches: 0,
          wrongDays: 0,
          totalNeedScore: 0,
        }
      }
      unitMap[key].questionTypes += 1
      unitMap[key].practiceTouches += item.practiceTouches
      unitMap[key].wrongDays += item.wrongDays
      unitMap[key].totalNeedScore += item.practiceNeedScore
    }

    const units = Object.values(unitMap)
      .map((unit) => ({
        ...unit,
        totalNeedScore: round(unit.totalNeedScore),
      }))
      .sort((a, b) =>
        (b.totalNeedScore - a.totalNeedScore) ||
        (b.wrongDays - a.wrongDays) ||
        a.unit.localeCompare(b.unit)
      )

    const revisionLines = [
      `${student.name} · ${subject.name}`,
      "",
      "Units to consolidate:",
      ...units.slice(0, 5).map((unit, idx) => `${idx + 1}. ${unit.unit} (need ${unit.totalNeedScore}, wrong days ${unit.wrongDays})`),
      "",
      "Question types to revisit:",
      ...practiced.slice(0, 8).map((item, idx) => `${idx + 1}. ${item.title} [${item.unit}] (need ${item.practiceNeedScore}, weakness ${item.weaknessScore}, wrong days ${item.wrongDays})`),
    ].join("\n")

    return res.status(200).json({
      student: student.name,
      subject: subject.name,
      units,
      questionTypes: practiced,
      revisionLines,
    })
  } catch (err) {
    console.error("[admin/practice-revision] error", err)
    return res.status(500).json({ error: err.message || "Failed to load practice revision list" })
  }
}
