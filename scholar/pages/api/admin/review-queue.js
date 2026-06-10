// review-queue.js
// Admin queue for reviewing and editing question types/problems in Supabase.
//
// GET  ?studentId=&subjectId=  → list student_question_types with relatedProblems
// POST { action, studentId, subjectId, scoreRowId (=sqt.id), ... }
//   actions: remove_type, remove_problem, update_problem,
//            generate_image_prompt, generate_image, generate_svg_diagram,
//            update_lo_reinforcement

import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import { getStudentById, getSubjectById } from "../../../lib/db"
import { supabaseSelect, supabaseRest } from "../../../lib/supabase"
import { getObjectiveCodesForPrompt } from "../../../lib/district-taxonomy"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

// ---- Claude helpers ----

async function generateClaudeImagePrompt({ questionText, answerText, subjectName, standardCode }) {
  const prompt = `You are helping a tutor create a visual aid for one question.

Return ONLY a single image-generation prompt (plain text, no bullets, no markdown), under 70 words.
It should create a clear educational diagram from the question setup only.
Include labels and variables if relevant.
Do NOT include final answers, solved values, step-by-step solution text, or conclusion statements.
Avoid decorative style terms unless needed for clarity.

Subject: ${subjectName || "General"}
Learning objective code: ${standardCode || "N/A"}
Question: ${questionText || ""}
Reference answer (do not render this in image): ${answerText || ""}`

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 180,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  const data = await res.json()
  const txt = data?.content?.[0]?.text?.trim()
  if (!res.ok || !txt) {
    throw new Error(data?.error?.message || "Failed to generate image prompt")
  }
  return txt
}

async function generateClaudeSvg({ questionText, answerText, subjectName, standardCode }) {
  const prompt = `Create a clean educational physics-style SVG diagram for this question.

Return ONLY raw SVG markup beginning with <svg and ending with </svg>.
No markdown fences, no explanation.
Use width 960 and height 640.
Use simple shapes, arrows, labels, and clear spacing.
White/light background with dark text and dark stroke.
Do not include external fonts or external images.
Show the scenario only.
Do NOT include final answers, solved numeric values, equation solving steps, or statements like "therefore".
Labels should name objects/variables in the question only.

Subject: ${subjectName || "General"}
Learning objective code: ${standardCode || "N/A"}
Question: ${questionText || ""}
Reference answer (for context only, do not render): ${answerText || ""}`

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2400,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  const data = await res.json()
  const raw = Array.isArray(data?.content)
    ? data.content.map(part => part?.text || "").join("\n").trim()
    : ""
  if (!res.ok || !raw) {
    throw new Error(data?.error?.message || "Failed to generate SVG")
  }
  const svg = extractSvgFromClaudeText(raw)
  if (!svg) {
    const snippet = raw.replace(/\s+/g, " ").slice(0, 220)
    throw new Error(`Claude did not return valid SVG. Response snippet: ${snippet}`)
  }
  let out = svg
  if (!/xmlns=/.test(out)) {
    out = out.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  return out
}

function decodeHtmlEntities(txt) {
  return String(txt || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
}

function extractSvgFromClaudeText(raw) {
  let txt = decodeHtmlEntities(
    String(raw || "")
      .replace(/```svg\s*/gi, "")
      .replace(/```xml\s*/gi, "")
      .replace(/```/g, "")
      .trim()
  )

  if (!txt.includes("<svg")) {
    const jsonMatch = txt.match(/"svg"\s*:\s*"([\s\S]*?)"\s*(,|\})/)
    if (jsonMatch?.[1]) {
      const unescaped = jsonMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, "\"")
        .replace(/\\\\/g, "\\")
      txt = decodeHtmlEntities(unescaped)
    }
  }

  const start = txt.indexOf("<svg")
  if (start < 0) return ""
  let end = txt.lastIndexOf("</svg>")
  if (end < 0) {
    const tail = txt.slice(start)
    if (tail.includes(">")) return `${tail.trim()}</svg>`
    return ""
  }
  if (end <= start) return ""
  let svg = txt.slice(start, end + 6).trim()
  svg = svg.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  if (!/xmlns=/.test(svg)) {
    svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"')
  }
  return svg
}

// ---- Supabase helpers ----

async function getSloCodes(sloIds) {
  const unique = [...new Set(sloIds.filter(Boolean))]
  if (!unique.length) return {}
  const rows = await supabaseSelect("sub_learning_objectives", {
    select: "id,code",
    filters: { id: unique },
  })
  return Object.fromEntries(rows.map(r => [r.id, r.code]))
}

async function resolveShortSloCode(shortCode, frameworkId) {
  if (!shortCode || !frameworkId) return null
  const rows = await supabaseRest(
    `sub_learning_objectives?select=id&learning_objectives=inner&learning_objectives.framework_id=eq.${frameworkId}&code=eq.${encodeURIComponent(shortCode)}&limit=1`,
    { method: "GET" }
  ).catch(() => [])
  return Array.isArray(rows) && rows.length ? rows[0].id : null
}

async function getFrameworkForQuestionType(questionTypeId) {
  const rows = await supabaseSelect("question_types", {
    select: "content_bank_id",
    filters: { id: questionTypeId },
    limit: 1,
  })
  const contentBankId = rows[0]?.content_bank_id
  if (!contentBankId) return null
  const cbRows = await supabaseSelect("content_banks", {
    select: "framework_id",
    filters: { id: contentBankId },
    limit: 1,
  })
  return cbRows[0]?.framework_id || null
}

// ---- Main handler ----

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  // ---- GET ----
  if (req.method === "GET") {
    const { studentId, subjectId } = req.query
    if (!studentId || !subjectId) return res.status(400).json({ error: "studentId and subjectId are required" })

    try {
      const [student, subject] = await Promise.all([
        getStudentById(studentId),
        getSubjectById(subjectId),
      ])
      if (!student || !subject) return res.status(404).json({ error: "Student or subject not found" })

      // Fetch all student_question_types with question_types join
      const sqtRows = await supabaseSelect("student_question_types", {
        select: "*,question_types(id,title,primary_slo_id,reinforcement_slos,aligned_slo_ids,content_bank_id)",
        filters: { student_id: studentId, subject_id: subjectId },
      })

      // For each sqt, fetch relatedProblems from questions table
      const items = await Promise.all(sqtRows.map(async (sqt) => {
        const qt = sqt.question_types || {}
        const questionTypeId = sqt.question_type_id

        let relatedProblems = []
        let questionPrimarySloIds = []
        let questionReinforcementEntries = []
        if (questionTypeId) {
          const questions = await supabaseSelect("questions", {
            select: "id,qhash,question_text,answer_text,options,correct_option,explanation,ordinal,primary_slo_id,reinforcement_slos,aligned_slo_ids",
            filters: { question_type_id: questionTypeId },
            orderBy: "ordinal",
          })
          questionPrimarySloIds = questions.map((q) => q.primary_slo_id).filter(Boolean)
          questionReinforcementEntries = questions.flatMap((q) => Array.isArray(q.reinforcement_slos) ? q.reinforcement_slos : [])
          relatedProblems = questions.map(q => ({
            qhash: q.qhash || null,
            questionText: q.question_text || "",
            answerText: q.answer_text || "",
            options: Array.isArray(q.options) ? q.options : [],
            correctOption: q.correct_option || "",
            explanation: q.explanation || "",
            questionId: q.id,
          }))
        }

        const qtReinforcementEntries = Array.isArray(qt.reinforcement_slos) ? qt.reinforcement_slos : []
        const allSloIds = [
          qt.primary_slo_id,
          ...qtReinforcementEntries.map((entry) => entry?.slo_id || null),
          ...questionPrimarySloIds,
          ...questionReinforcementEntries.map((entry) => entry?.slo_id || null),
        ].filter(Boolean)
        const sloCodeMap = await getSloCodes(allSloIds)
        const reinforcementCodes = Array.from(new Map(
          [...qtReinforcementEntries, ...questionReinforcementEntries]
            .map((entry) => {
              const code = sloCodeMap[entry?.slo_id] || ""
              if (!code) return null
              return [code, {
                slo_id: entry?.slo_id || null,
                code,
                weight: Number(entry?.weight || 0),
              }]
            })
            .filter(Boolean)
        ).values())

        return {
          id: sqt.id,
          questionId: questionTypeId,
          questionTypeId,
          questionName: qt.title || "",
          standardCode: sloCodeMap[qt.primary_slo_id] || "",
          primarySloId: qt.primary_slo_id || null,
          reinforcementSlos: qt.reinforcement_slos || [],
          reinforcementCodes,
          score: Number(sqt.weakness_score ?? 0),
          relatedProblems,
        }
      }))

      return res.status(200).json({
        student: { id: studentId, state: student.state || "", country: student.country || "" },
        subject: { id: subjectId, name: subject.name || "" },
        items,
      })
    } catch (err) {
      console.error("review-queue GET error", err)
      return res.status(500).json({ error: err.message || "Failed to load review queue" })
    }
  }

  // ---- POST ----
  if (req.method === "POST") {
    const {
      action,
      studentId,
      subjectId,
      scoreRowId,
      questionId: questionTypeIdParam,
      qhash,
      questionText,
      answerText,
      imageUrl,
      promptText,
      primarySloId,
      primarySloCode,
      reinforcementSlos,
    } = req.body || {}

    if (!action || !studentId || !subjectId || !scoreRowId) {
      return res.status(400).json({ error: "action, studentId, subjectId, scoreRowId required" })
    }

    try {
      // Verify the SQT row belongs to this student/subject
      const sqtRows = await supabaseSelect("student_question_types", {
        select: "*,question_types(id,title,primary_slo_id,reinforcement_slos,content_bank_id)",
        filters: { id: scoreRowId },
        limit: 1,
      })
      const sqt = sqtRows[0]
      if (!sqt || sqt.student_id !== studentId || sqt.subject_id !== subjectId) {
        return res.status(400).json({ error: "Score row does not match student/subject" })
      }
      const questionTypeId = sqt.question_type_id
      if (!questionTypeId) return res.status(400).json({ error: "Score row has no question_type_id" })

      const subject = await getSubjectById(subjectId)
      const subjectName = subject?.name || ""
      const sloCodeMap = await getSloCodes([sqt.question_types?.primary_slo_id])
      const standardCode = sloCodeMap[sqt.question_types?.primary_slo_id] || ""

      // ---- remove_type ----
      if (action === "remove_type") {
        await supabaseRest(`student_question_types?id=eq.${scoreRowId}`, {
          method: "DELETE",
          headers: { Prefer: "return=minimal" },
        })
        return res.status(200).json({ ok: true, removedScoreRows: 1, removedBlocks: 0 })
      }

      // ---- remove_problem ----
      if (action === "remove_problem") {
        if (!qhash) return res.status(400).json({ error: "qhash required for remove_problem" })
        await supabaseRest(
          `questions?qhash=eq.${encodeURIComponent(qhash)}&question_type_id=eq.${questionTypeId}`,
          { method: "DELETE", headers: { Prefer: "return=minimal" } }
        )
        return res.status(200).json({ ok: true, removed: true })
      }

      // ---- update_problem ----
      if (action === "update_problem") {
        if (!qhash) return res.status(400).json({ error: "qhash required for update_problem" })
        const patch = {}
        if (questionText != null) patch.question_text = String(questionText).trim()
        if (answerText != null) patch.answer_text = String(answerText).trim()
        if (imageUrl != null) patch.image_url = String(imageUrl).trim() || null
        if (Object.keys(patch).length) {
          patch.updated_at = new Date().toISOString()
          await supabaseRest(
            `questions?qhash=eq.${encodeURIComponent(qhash)}&question_type_id=eq.${questionTypeId}`,
            { method: "PATCH", body: patch, headers: { Prefer: "return=minimal" } }
          )
        }
        return res.status(200).json({ ok: true, updated: true })
      }

      // ---- generate_image_prompt ----
      if (action === "generate_image_prompt") {
        const generatedPrompt = await generateClaudeImagePrompt({ questionText, answerText, subjectName, standardCode })
        return res.status(200).json({ ok: true, prompt: generatedPrompt })
      }

      // ---- generate_image ----
      if (action === "generate_image") {
        const basePrompt = String(promptText || "").trim() || await generateClaudeImagePrompt({ questionText, answerText, subjectName, standardCode })
        const imageGenUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(basePrompt)}?width=1024&height=768&nologo=true`
        return res.status(200).json({ ok: true, prompt: basePrompt, imageUrl: imageGenUrl })
      }

      // ---- generate_svg_diagram ----
      if (action === "generate_svg_diagram") {
        const svg = await generateClaudeSvg({ questionText, answerText, subjectName, standardCode })
        return res.status(200).json({ ok: true, svg })
      }

      // ---- update_lo_reinforcement ----
      if (action === "update_lo_reinforcement") {
        // Accept primarySloId (UUID) directly, or resolve primarySloCode via framework
        let resolvedPrimarySloId = primarySloId || null
        if (!resolvedPrimarySloId && primarySloCode) {
          const frameworkId = await getFrameworkForQuestionType(questionTypeId)
          resolvedPrimarySloId = await resolveShortSloCode(primarySloCode, frameworkId)
        }

        // Normalize reinforcement: accept {slo_id, weight} or {code, weight}
        const cleanedReinforcement = []
        const rawReinforcement = Array.isArray(reinforcementSlos) ? reinforcementSlos : []
        if (rawReinforcement.some(e => e?.code && !e?.slo_id)) {
          // Need to resolve codes to IDs
          const frameworkId = await getFrameworkForQuestionType(questionTypeId)
          for (const entry of rawReinforcement) {
            const code = String(entry?.code || "").trim()
            const weight = Math.max(0, Math.min(1, Number(entry?.weight || 0)))
            if (!code || !weight) continue
            const sloId = await resolveShortSloCode(code, frameworkId)
            if (sloId) cleanedReinforcement.push({ slo_id: sloId, weight })
          }
        } else {
          for (const entry of rawReinforcement) {
            const sloId = String(entry?.slo_id || "").trim()
            const weight = Math.max(0, Math.min(1, Number(entry?.weight || 0)))
            if (!sloId || !weight) continue
            cleanedReinforcement.push({ slo_id: sloId, weight })
          }
        }

        const patch = { updated_at: new Date().toISOString() }
        if (resolvedPrimarySloId !== undefined) patch.primary_slo_id = resolvedPrimarySloId
        if (cleanedReinforcement.length || reinforcementSlos != null) {
          patch.reinforcement_slos = cleanedReinforcement
        }

        await supabaseRest(`question_types?id=eq.${questionTypeId}`, {
          method: "PATCH",
          body: patch,
          headers: { Prefer: "return=minimal" },
        })
        return res.status(200).json({ ok: true, updated: true, primarySloId: resolvedPrimarySloId })
      }

      return res.status(400).json({ error: "Unknown action" })
    } catch (err) {
      console.error("review-queue POST error", err)
      return res.status(500).json({ error: err.message || "Failed to apply review action" })
    }
  }

  return res.status(405).end()
}
