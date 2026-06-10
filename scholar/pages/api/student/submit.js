import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  appendReadableAssessmentAttemptSummary,
  completeAssessmentAttempt,
  createAssessmentAttempt,
  getAllScoresForStudent,
  getAssessmentAttempt,
  getAssessmentAttemptById,
  getSessionByStudentSubjectDate,
  getWeaknessMap,
  hasAssessmentAttemptsDB,
  recordAssessmentResult,
  updateQuestionStatus,
  getEnrollment,
  getTodayTopicsAny,
  getSubjectById,
  getScoreRow,
} from "../../../lib/db"
import { applySwap, getNextClassDateFrom, getNextClassDate, calculateTrends } from "../../../lib/logic"
import { isShowcaseDemo } from "../../../lib/showcase"
import { submitShowcaseAssessment } from "../../../lib/showcase-demo"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function serializeSubmittedAnswer(answer = {}) {
  return {
    notionQuestionId: answer.notionQuestionId || "",
    questionTypeTitle: answer.questionTypeTitle || answer.topic || "",
    standardCode: answer.standardCode || "",
    unit: answer.unit || "",
    sourceImage: answer.sourceImage || null,
    questionKey: answer.questionKey || "",
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const demoMode = isShowcaseDemo(req)
  if (demoMode) {
    const data = await submitShowcaseAssessment(req, req.body || {})
    if (data) return res.status(200).json(data)
  }

  const session = demoMode ? null : await getServerSession(req, res, authOptions)
  if (!session && !demoMode) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = demoMode || (session.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const { subjectId, mode, answers, as: asStudentId, sessionDate, attemptId } = req.body
  const isPreview = isAdmin && !!asStudentId
  const studentId = isPreview ? asStudentId : session.notionStudentId
  const previewStateIn = req.body?.previewState || null

  try {
    if (!sessionDate) {
      return res.status(400).json({
        error: "sessionDate is required. Assessment submission must be anchored to an explicit session date.",
      })
    }

    const subject = await getSubjectById(subjectId)
    const enrollment = await getEnrollment(studentId, subjectId)
    const dataSourceId = subject.dataSourceId
    const enrollmentDays = enrollment?.days || []
    const nextClassDate = getNextClassDate(enrollmentDays)

    let updatedScores = []
    let weaknessMap = {}
    let swapResult = { triggered: false, swappedIn: [], swappedOut: [], previewTopics: [], sessionDate: null, nextClassDate: null }
    let trends = {}
    let previewState = null

    if (isPreview) {
      // ── SANDBOX MODE: simulate everything in memory, nothing written to Notion ──

      // Fetch current real weakness scores as baseline
      const realWeaknessMap = await getWeaknessMap(studentId, subjectId)
      const topicScores = {
        ...(realWeaknessMap.topics || realWeaknessMap || {}),
        ...((previewStateIn && previewStateIn.topicScores) ? previewStateIn.topicScores : {}),
      }
      const questionScores = { ...(previewStateIn?.questionScores || {}) }

      // Simulate score increments for wrong answers
      for (const answer of answers) {
        let weaknessScore = 0
        let weaknessBefore = 0
        if (answer.notionQuestionId) {
          const key = answer.notionQuestionId
          if (questionScores[key] === undefined) {
            const row = await getScoreRow(studentId, key)
            questionScores[key] = row?.score ?? 0
          }
          weaknessBefore = questionScores[key] || 0
          if (!answer.correct) questionScores[key] = (questionScores[key] || 0) + 1
          weaknessScore = questionScores[key] || 0
        } else {
          weaknessBefore = answer.correct ? 0 : 0
          weaknessScore = answer.correct ? 0 : 1
        }
        updatedScores.push({ ...answer, weaknessScore, weaknessBefore, weaknessAfter: weaknessScore })

        if (!answer.correct) {
          const topic = answer.questionTypeTitle || answer.topics?.[0]
          if (topic) topicScores[topic] = (topicScores[topic] || 0) + 1
        }
      }

      weaknessMap = { topics: topicScores }

      // Simulate SWAP on pre-class
      if (mode === "pre") {
        const wrongAnswers = answers.filter(a => !a.correct)
        if (wrongAnswers.length > 0) {
          const todayQuestions = await getTodayTopicsAny(dataSourceId, studentId, subjectId, "UTC", sessionDate || null)
          const planDate = todayQuestions?.[0]?.dateIntroduced || null
          const nextDate = planDate ? getNextClassDateFrom(planDate, enrollmentDays) : nextClassDate
          // Map wrong question page IDs to score row IDs for preview exit ticket
          const wrongQuestions = (await Promise.all(
            wrongAnswers
              .filter(a => a.notionQuestionId)
              .map(async a => {
                const scoreRow = await getScoreRow(studentId, a.notionQuestionId)
                if (!scoreRow) {
                  console.warn("[swap:preview] no score row for question:", a.notionQuestionId)
                  return null
                }
                return { id: scoreRow.id, title: a.questionTypeTitle }
              })
          )).filter(Boolean)
          // Simulate swap without writing dates to Notion
          swapResult = simulateSwap({ wrongQuestions, todayQuestions, nextClassDate: nextDate })
          if (swapResult.triggered) { swapResult.sessionDate = planDate; swapResult.nextClassDate = nextDate }
        }
      }

      trends = {}
      // Persist preview state back to the client so preview weakness can accumulate across attempts.
      // questionScores are keyed by notion question page ID.
      // topicScores are used for dashboard/report charts.
      // Note: this does not write to Notion.
      previewState = { questionScores, topicScores }

    } else {
      // ── REAL MODE: write to Notion ──

      for (const answer of answers) {
        if (answer.notionQuestionId) {
          const topic = answer.questionTypeTitle || answer.topics?.[0] || "Unknown"
          const beforeRow = await getScoreRow(studentId, answer.notionQuestionId)
          const resultInfo = await recordAssessmentResult(
            studentId,
            answer.notionQuestionId,
            topic,
            subjectId,
            !!answer.correct,
            {
              standardCode: answer.standardCode || "",
              unit: answer.unit || "",
              questionKey: answer.questionKey || "",
            },
            mode === "pre" ? "pre" : "exit",
            sessionDate || null
          )
          updatedScores.push({
            ...answer,
            weaknessScore: resultInfo.weaknessScore,
            weaknessBefore: beforeRow?.score ?? 0,
            weaknessAfter: resultInfo.weaknessScore,
            masteryScore: resultInfo.masteryScore,
          })
        } else {
          const score = answer.correct ? 0 : 1
          updatedScores.push({ ...answer, weaknessScore: score, weaknessBefore: score, weaknessAfter: score, masteryScore: answer.correct ? 1 : 0 })
        }
      }

      if (mode === "pre") {
        const wrongAnswers = answers.filter(a => !a.correct)
        if (wrongAnswers.length > 0) {
          const todayQuestions = await getTodayTopicsAny(dataSourceId, studentId, subjectId, "UTC", sessionDate || null)
          const planDate = todayQuestions?.[0]?.dateIntroduced || null
          const nextDate = planDate ? getNextClassDateFrom(planDate, enrollmentDays) : nextClassDate
          // Look up score row IDs for wrong questions — SWAP needs score row IDs, not question page IDs
          const wrongQuestions = (await Promise.all(
            wrongAnswers
              .filter(a => a.notionQuestionId)
              .map(async a => {
                const scoreRow = await getScoreRow(studentId, a.notionQuestionId)
                if (!scoreRow) {
                  console.warn("[swap] no score row for question:", a.notionQuestionId)
                  return null
                }
                return { id: scoreRow.id, title: a.questionTypeTitle }
              })
          )).filter(Boolean)
          // Apply FIFO immediately (updates Notion dates), but return the "today plan"
          // computed from the original pre-swap fetch so exit ticket doesn't get hijacked
          // by displaced rows being moved to a future date.
          swapResult = await applySwap({
            wrongQuestions,
            todayQuestions,
            nextClassDate: nextDate,
            enrollmentDays,
          })
        }
      }

      if (mode === "exit") {
        for (const answer of answers) {
          if (answer.notionQuestionId) {
            await updateQuestionStatus(studentId, answer.notionQuestionId, answer.correct ? 0 : 1)
          }
        }
      }

      const allScores = await getAllScoresForStudent(studentId)
      weaknessMap = await getWeaknessMap(studentId, subjectId)
      trends = calculateTrends(allScores)
    }

    if (!isPreview && hasAssessmentAttemptsDB() && mode && sessionDate) {
      const sessionRow = await getSessionByStudentSubjectDate(studentId, subjectId, sessionDate).catch(() => null)
      let persistedAttempt = null

      if (attemptId) {
        persistedAttempt = await getAssessmentAttemptById(attemptId)
        if (persistedAttempt?.id && (
          String(persistedAttempt.studentId || "") !== String(studentId || "") ||
          String(persistedAttempt.subjectId || "") !== String(subjectId || "") ||
          String(persistedAttempt.mode || "") !== String(mode || "") ||
          String(persistedAttempt.sessionDate || "") !== String(sessionDate || "")
        )) {
          console.warn("[submit] attemptId did not match current submission context, falling back to keyed lookup", {
            attemptId,
            studentId,
            subjectId,
            mode,
            sessionDate,
          })
          persistedAttempt = null
        }
      }

      if (!persistedAttempt?.id) {
        persistedAttempt = await getAssessmentAttempt(studentId, subjectId, mode, sessionDate)
      }

      if (!persistedAttempt?.id) {
        console.warn("[submit] no existing assessment attempt found on submit; creating fallback attempt", {
          studentId,
          subjectId,
          mode,
          sessionDate,
          answers: Array.isArray(answers) ? answers.length : 0,
        })
        persistedAttempt = await createAssessmentAttempt({
          studentId,
          subjectId,
          sessionId: sessionRow?.id || "",
          mode,
          sessionDate,
          questions: Array.isArray(answers) ? answers.map(serializeSubmittedAnswer) : [],
          sourceSummary: JSON.stringify({
            mode,
            sessionDate,
            createdOnSubmitFallback: true,
          }),
        })
      }

      if (!persistedAttempt?.id) {
        throw new Error("Assessment result could not be saved because no attempt row was available.")
      }

      const completionResult = await completeAssessmentAttempt(persistedAttempt.id, {
          resultPayload: {
            score: answers.filter(a => a.correct).length,
            total: answers.length,
            updatedScores,
            swap: swapResult,
            weaknessMap,
            trends,
            submittedAt: new Date().toISOString(),
          },
          score: answers.filter(a => a.correct).length,
          total: answers.length,
        })

      if (!completionResult || completionResult?.object === "error") {
        throw new Error("Assessment result could not be written to Assessment Attempts.")
      }

      const readableAttempt = await getAssessmentAttemptById(persistedAttempt.id)
      if (!readableAttempt?.id || readableAttempt.resultPayload == null) {
        throw new Error("Assessment result save did not persist readable result payload.")
      }

      await appendReadableAssessmentAttemptSummary(persistedAttempt.id, readableAttempt, { mode }).catch(() => {})
    }

    return res.status(200).json({
      updatedScores,
      swap: swapResult,
      weaknessMap,
      trends,
      score: answers.filter(a => a.correct).length,
      total: answers.length,
      isPreview,
      previewState,
    })

  } catch (err) {
    console.error("Submit error:", err)
    return res.status(500).json({ error: "Failed to submit" })
  }
}

// Simulate swap logic in memory (no Notion writes)
function simulateSwap({ wrongQuestions, todayQuestions, nextClassDate }) {
  if (!wrongQuestions.length) {
    return { triggered: false, swappedIn: [], swappedOut: [], previewTopics: [], sessionDate: null, nextClassDate: null }
  }

  if (!todayQuestions.length) {
    return {
      triggered: true,
      swappedIn: wrongQuestions,
      swappedOut: [],
      previewTopics: wrongQuestions.map(q => ({
        id: q.id,
        title: q.title || q.questionName || q.questionId,
      })),
      sessionDate: null,
      nextClassDate,
    }
  }

  const swapCount = Math.min(wrongQuestions.length, todayQuestions.length)
  const swappedIn = wrongQuestions.slice(0, swapCount)
  const swappedOut = todayQuestions.slice(0, swapCount).map(q => ({
    id: q.id,
    title: q.questionName || q.questionId,
  }))

  const remaining = todayQuestions.slice(swapCount).map(q => ({
    id: q.id,
    title: q.questionName || q.questionId,
  }))

  return {
    triggered: true,
    swappedIn,
    swappedOut,
    previewTopics: [...swappedIn, ...remaining],
    sessionDate: todayQuestions?.[0]?.dateIntroduced || null,
    nextClassDate,
  }
}
