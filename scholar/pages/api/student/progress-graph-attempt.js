import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getScoreRow,
  recordPracticeAttempt,
  getStudentById,
} from "../../../lib/db"
import { supabaseRest } from "../../../lib/supabase"
import { getShowcaseStudentId, isShowcaseDemo } from "../../../lib/showcase"
import { recordShowcasePracticeAttempt, isShowcaseDemoSubjectId } from "../../../lib/showcase-demo"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const demoMode = isShowcaseDemo(req)
  const session = demoMode ? null : await getServerSession(req, res, authOptions)
  if (!session && !demoMode) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = demoMode || (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const { as: asStudentId, questionTypeId, questionKey, subjectId, result } = req.body || {}

  if (demoMode && isShowcaseDemoSubjectId(subjectId)) {
    const data = await recordShowcasePracticeAttempt(req, { subjectId, questionTypeId, questionKey, result })
    if (data) return res.status(200).json({ ok: true, ...data })
    return res.status(400).json({ error: "Showcase course not found" })
  }
  const studentId = demoMode
    ? (asStudentId || getShowcaseStudentId())
    : (isAdmin && asStudentId) ? asStudentId : session.notionStudentId

  if (!questionTypeId || !questionKey || !subjectId) {
    return res.status(400).json({ error: "subjectId, questionTypeId and questionKey required" })
  }

  try {
    const student = await getStudentById(studentId)
    let row = await getScoreRow(studentId, questionTypeId)
    if (!row?.id) {
      return res.status(409).json({
        error: "This question type is not in Scores DB yet. Add it through sessions/drafts first.",
        code: "score_row_missing",
      })
    }
    const resultInfo = await recordPracticeAttempt(
      studentId,
      questionTypeId,
      row.questionName || "Practice",
      subjectId,
      questionKey,
      result,
      student?.timezone || "UTC"
    )

    if (!demoMode) {
      try {
        await supabaseRest("student_question_attempts", {
          method: "POST",
          body: {
            student_id:       studentId,
            subject_id:       subjectId,
            question_type_id: questionTypeId,
            question_key:     questionKey,
            mode:             "practice",
            result:           result,
            review_status:    "auto",
            score_row_id:     row.id,
          },
          headers: { Prefer: "return=minimal" },
        })
      } catch (logErr) {
        console.error("[progress-graph-attempt] attempt log failed", logErr)
      }
    }

    return res.status(200).json({
      ok: true,
      correctQuestionKeys: resultInfo.correctQuestionKeys,
      dailySeenDates: resultInfo.dailySeenDates,
      dailyWrongDates: resultInfo.dailyWrongDates,
      masteryScore: resultInfo.masteryScore,
      weaknessScore: resultInfo.weaknessScore,
    })
  } catch (err) {
    console.error("Progress graph attempt error:", err)
    return res.status(500).json({ error: "Failed to update attempted question progress" })
  }
}
