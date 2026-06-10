import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getSubjectById, getQuestionsWithScores, getStudentById } from "../../../lib/db"
import { getObjectiveByCode } from "../../../lib/district-taxonomy"
import { isShowcaseDemo } from "../../../lib/showcase"
import { getShowcaseFlashcards } from "../../../lib/showcase-demo"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

// Build flashcard Q/A from LO taxonomy — zero tokens, instant
function flashcardFromLO(standardCode, state, subjectName) {
  if (!standardCode) {
    return { loCode: null, loName: null, questionText: null, answer: null, hasNotes: false }
  }

  // Handle comma-separated codes — use the first one as primary
  const primaryCode = standardCode.split(",")[0].trim()
  const lo = getObjectiveByCode(state, subjectName, primaryCode)
  if (!lo) {
    return { loCode: primaryCode, loName: null, questionText: null, answer: null, hasNotes: false }
  }

  const questionText = `What do you need to know for: ${lo.name}?`
  const answer = (lo.subtopics || []).map(s => `• ${typeof s === "string" ? s : s.text}`).join("\n")
  return {
    loCode: primaryCode,
    loName: lo.name,
    questionText,
    answer: answer || lo.name,
    hasNotes: !!(lo.subtopics && lo.subtopics.length),
  }
}

export default async function handler(req, res) {
  const demoMode = isShowcaseDemo(req)
  const session = demoMode ? null : await getServerSession(req, res, authOptions)
  if (!session && !demoMode) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = demoMode || (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const { subjectId, as: asStudentId, previewWeakness } = req.query
  const isPreview = isAdmin && !!asStudentId

  if (demoMode) {
    const data = await getShowcaseFlashcards(req, subjectId, (standardCode) => flashcardFromLO(standardCode, null, ""))
    if (data) return res.status(200).json(data)
    // not a showcase subjectId — fall through to Notion path
  }

  const studentId = isPreview ? asStudentId : session.notionStudentId

  try {
    const [subject, student] = await Promise.all([
      getSubjectById(subjectId),
      getStudentById(studentId),
    ])
    const dataSourceId = subject.dataSourceId
    if (!dataSourceId) return res.status(400).json({ error: "No data source ID" })

    const state = student?.state || null

    const allQuestions = await getQuestionsWithScores(dataSourceId, studentId, subjectId)

    let weakQuestions
    if (isPreview && previewWeakness) {
      try {
        const scoreMap = JSON.parse(decodeURIComponent(previewWeakness))
        weakQuestions = allQuestions
          .map(q => {
            const byScoreRow = scoreMap[q.scoreRowId] || scoreMap[q.scoreRowId?.replace(/-/g, "")] || 0
            const byQId = scoreMap[q.id] || scoreMap[q.id?.replace(/-/g, "")] || 0
            const byCode = q.standardCode ? (scoreMap[q.standardCode] || 0) : 0
            return { ...q, weaknessScore: Math.max(q.weaknessScore, byScoreRow, byQId, byCode) }
          })
          .filter(q => q.weaknessScore >= 2)
      } catch {
        weakQuestions = allQuestions.filter(q => q.weaknessScore >= 2)
      }
    } else {
      weakQuestions = allQuestions.filter(q => q.weaknessScore >= 2)
    }

    if (!weakQuestions.length) {
      return res.status(200).json({ flashcards: [], noData: true })
    }

    weakQuestions.sort((a, b) => b.weaknessScore - a.weaknessScore)

    const flashcards = weakQuestions.map(q => {
      const built = flashcardFromLO(q.standardCode, state, subject.name)

      const loLabel = built.loName || built.loCode || null
      const basePrompt = loLabel || q.title

      // Never return an empty back face. If taxonomy notes aren't present,
      // return a deterministic study scaffold rather than "check your notes".
      const questionText =
        built.questionText ||
        `Explain how to solve problems about: ${basePrompt}.`

      const answer =
        (built.answer && String(built.answer).trim()) ||
        [
          `Goal: be able to solve ${q.title} problems reliably.`,
          "",
          "Checklist:",
          "• State the key definition(s) in your own words.",
          "• List the main rule(s) / formula(s) used here.",
          "• Write the step-by-step method you would follow.",
          "• Name 2 common mistakes and how to avoid them.",
          "• Do 1 quick example and check the result.",
          "",
          built.loCode ? `LO: ${built.loCode}` : null,
        ].filter(Boolean).join("\n")

      return {
        id: q.id,
        title: q.title,
        standardCode: q.standardCode,
        weaknessScore: q.weaknessScore,
        questionText,
        answer,
        loCode: built.loCode,
        loName: built.loName,
        hasNotes: built.hasNotes,
      }
    })

    return res.status(200).json({ flashcards, subject: subject.name })
  } catch (err) {
    console.error("Flashcards error:", err)
    return res.status(500).json({ error: "Failed to load flashcards" })
  }
}
