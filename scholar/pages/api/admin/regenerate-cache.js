// regenerate-cache.js
// For each question in a student's question_types that is missing MCQ options,
// call Claude to generate options + correct_option and write back to Supabase questions table.

import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getStudentById,
  getSubjectById,
  getEnrollment,
  getScoreRowsForDate,
  getAllScoresForStudent,
} from "../../../lib/db"
import { supabaseSelect, supabaseRest } from "../../../lib/supabase"
import { generateMCQBundleFromStoredQA, generateMCQFromStoredQA } from "../../../lib/claude"
import { getQuestionCount } from "../../../lib/logic"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

async function getQuestionsNeedingMCQ(questionTypeId, maxCount = 3) {
  const rows = await supabaseSelect("questions", {
    select: "id,qhash,question_text,answer_text,options,correct_option",
    filters: { question_type_id: questionTypeId },
    orderBy: "ordinal",
  })
  // Return questions that have text but are missing options
  return rows
    .filter((r) => r.question_text && (!Array.isArray(r.options) || !r.options.length || !r.correct_option))
    .slice(0, maxCount)
    .map((r) => ({ id: r.id, qhash: r.qhash, question: r.question_text, answer: r.answer_text || "" }))
}

async function writeMCQToQuestion(questionId, mcq) {
  if (!questionId || !mcq) return
  await supabaseRest(`questions?id=eq.${questionId}`, {
    method: "PATCH",
    body: {
      options: Array.isArray(mcq.options) ? mcq.options : [],
      correct_option: mcq.correct_option || mcq.answer || "",
      explanation: mcq.explanation || null,
    },
    headers: { Prefer: "return=minimal" },
  })
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }
  if (req.method !== "POST") return res.status(405).end()

  const { studentId, subjectId, sessionDate } = req.body || {}
  if (!studentId || !subjectId) return res.status(400).json({ error: "studentId and subjectId required" })

  try {
    const [student, subject, enrollment] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
      getEnrollment(studentId, subjectId),
    ])
    if (!student || !subject) return res.status(404).json({ error: "Student or subject not found" })

    const subjectName = subject.name || ""
    const duration = enrollment?.duration || 60
    const maxPerType = Math.min(3, getQuestionCount(duration))

    // Get score rows — optionally filtered by date
    const scoreRows = sessionDate
      ? await getScoreRowsForDate(studentId, subjectId, sessionDate)
      : await getAllScoresForStudent(studentId, subjectId)

    const availableDates = [...new Set(scoreRows.map((r) => r.dateIntroduced).filter(Boolean))].sort().reverse()

    if (!scoreRows.length) {
      return res.status(200).json({
        date: sessionDate || null,
        questionTypes: 0,
        generated: 0,
        skipped: 0,
        availableDates,
        message: sessionDate ? `No question types found for date ${sessionDate}.` : "No question types found.",
      })
    }

    let questionTypes = 0
    let generated = 0
    let skipped = 0

    for (const row of scoreRows) {
      const questionTypeId = row.questionTypeId
      const questionTypeName = row.questionName || row.title || ""
      if (!questionTypeId) { skipped++; continue }
      questionTypes++

      try {
        const toGenerate = await getQuestionsNeedingMCQ(questionTypeId, maxPerType)
        if (!toGenerate.length) continue

        for (const qaGroup of chunk(toGenerate, 3)) {
          try {
            const results = await generateMCQBundleFromStoredQA(qaGroup, questionTypeName, subjectName)
            for (const qa of qaGroup) {
              const mcq = results.find((r) => r.qhash === qa.qhash)
              if (mcq) {
                await writeMCQToQuestion(qa.id, mcq)
                generated++
              }
            }
          } catch {
            for (const qa of qaGroup) {
              try {
                const mcq = await generateMCQFromStoredQA(qa, questionTypeName, subjectName)
                if (mcq) {
                  await writeMCQToQuestion(qa.id, mcq)
                  generated++
                }
              } catch {
                skipped++
              }
            }
          }
        }
      } catch (e) {
        console.warn("[regen-cache] failed for question_type:", questionTypeId, e.message)
        skipped++
      }
    }

    return res.status(200).json({
      date: sessionDate || null,
      questionTypes,
      generated,
      skipped,
      availableDates,
    })
  } catch (err) {
    console.error("[regenerate-cache] error:", err)
    return res.status(500).json({ error: err.message || "Failed to regenerate cache" })
  }
}
