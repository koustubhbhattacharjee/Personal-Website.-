import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  appendReadableHomeworkAttemptSummary,
  applyComboReduction,
  completeHomeworkAttempt,
  getAllScoresForStudent,
  getHomeworkAttemptByCycle,
  getHomeworkAttemptById,
  getScoreRow,
  getStudentById,
  getSubjectById,
  hasHomeworkAttemptsDB,
  maybeRemoveFromHWStack,
  recordHWAttempt,
} from "../../../lib/db"
import { calculateComboReduction } from "../../../lib/homework"
import { getPastClassesForStudent, getUpcomingClassesForStudent } from "../../../lib/tutor-calendar"
import { getShowcaseStudentId, isShowcaseDemo } from "../../../lib/showcase"
import { submitShowcaseHomework } from "../../../lib/showcase-demo"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

async function resolveAttempt({ attemptId, cycleKey, studentId, subjectId }) {
  if (attemptId) return getHomeworkAttemptById(attemptId)
  if (cycleKey) return getHomeworkAttemptByCycle(studentId, subjectId, cycleKey)
  return null
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const demoMode = isShowcaseDemo(req)
  if (demoMode) {
    const data = await submitShowcaseHomework(req, req.body || {})
    if (data) return res.status(200).json(data)
  }
  const session = demoMode ? null : await getServerSession(req, res, authOptions)
  if (!session && !demoMode) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = demoMode || (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const { subjectId, answers, attemptId, cycleKey, as: asStudentId } = req.body || {}
  const studentId = demoMode
    ? (asStudentId || getShowcaseStudentId())
    : (isAdmin && asStudentId) ? asStudentId : session.notionStudentId

  try {
    const [student, subject] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
    ])

    let sessionDates = []
    try {
      const [pastClasses, upcomingClasses] = await Promise.all([
        getPastClassesForStudent(student.name, subject.name, 20),
        getUpcomingClassesForStudent(student.name, subject.name, 5),
      ])
      sessionDates = [...pastClasses, ...upcomingClasses]
        .map((item) => item?.date || (item?.startTime || "").split("T")[0])
        .filter(Boolean)
    } catch {
      // Calendar unavailable — combo reduction is optional
    }

    const updatedScores = []
    for (const answer of answers || []) {
      if (!answer.notionQuestionId) continue

      const topic = answer.questionTypeTitle || answer.topics?.[0] || "Unknown"
      const beforeRow = await getScoreRow(studentId, answer.notionQuestionId)
      const resultInfo = await recordHWAttempt(
        studentId,
        answer.notionQuestionId,
        topic,
        subjectId,
        answer.correct,
        student.timezone,
        answer.questionKey || ""
      )

      if (answer.correct) {
        const scores = await getAllScoresForStudent(studentId, subjectId)
        const scoreRow = scores.find((s) => s.questionId === answer.notionQuestionId)
        if (scoreRow) await maybeRemoveFromHWStack(scoreRow.id, resultInfo.weaknessScore, scoreRow.hwSource)
      }

      if (sessionDates.length >= 2 && answer.correct) {
        const scoreRow = await getScoreRow(studentId, answer.notionQuestionId)
        let hwRecords = []
        try { hwRecords = JSON.parse(scoreRow?.hwStreak || "[]") } catch {}

        const comboReduction = calculateComboReduction(hwRecords, sessionDates)
        if (comboReduction > 0) {
          await applyComboReduction(studentId, answer.notionQuestionId, comboReduction)
        }
        updatedScores.push({
          ...answer,
          weaknessScore: Math.max(0, resultInfo.weaknessScore - comboReduction),
          weaknessBefore: beforeRow?.score ?? 0,
          weaknessAfter: Math.max(0, resultInfo.weaknessScore - comboReduction),
          comboReduction,
          masteryScore: resultInfo.masteryScore,
        })
      } else {
        updatedScores.push({
          ...answer,
          weaknessScore: resultInfo.weaknessScore,
          weaknessBefore: beforeRow?.score ?? 0,
          weaknessAfter: resultInfo.weaknessScore,
          comboReduction: 0,
          masteryScore: resultInfo.masteryScore,
        })
      }
    }

    const score = (answers || []).filter((a) => a.correct).length
    const total = (answers || []).length

    if (hasHomeworkAttemptsDB()) {
      const attempt = await resolveAttempt({ attemptId, cycleKey, studentId, subjectId })
      if (attempt?.id) {
        await completeHomeworkAttempt(attempt.id, {
          resultPayload: {
            score,
            total,
            updatedScores,
            answers,
            submittedAt: new Date().toISOString(),
          },
          score,
          total,
        })
        const readableAttempt = await getHomeworkAttemptById(attempt.id)
        if (readableAttempt?.id) {
          await appendReadableHomeworkAttemptSummary(attempt.id, readableAttempt).catch(() => {})
        }
      }
    }

    return res.status(200).json({
      updatedScores,
      score,
      total,
    })
  } catch (err) {
    console.error("HW submit error:", err)
    return res.status(500).json({ error: "Failed to submit homework" })
  }
}
