import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getAllQuestionsForPage,
  getQuestionsForStudentContext,
  getStudentById,
  getSubjectById,
} from "../../../lib/db"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function extractJsonPayload(raw = "") {
  const text = String(raw || "").replace(/```json|```/g, "").trim()
  const firstObj = text.indexOf("{")
  const lastObj = text.lastIndexOf("}")
  return firstObj !== -1 && lastObj !== -1 && lastObj > firstObj ? text.slice(firstObj, lastObj + 1) : null
}

function buildFallbackFlow({ questionTitle = "", sampleQuestion = "", unit = "", standardCode = "" }) {
  return {
    promptTitle: questionTitle || "Teach the question type",
    timerSeconds: 420,
    steps: [
      `Open with the core target: ${questionTitle || "state what this problem is really asking"}.`,
      `Anchor the concept${unit ? ` in ${unit}` : ""}${standardCode ? ` and tie it to ${standardCode}` : ""}.`,
      `Work through the setup using the student's own words before doing any algebra.`,
      `Solve one representative move from the sample: ${String(sampleQuestion || "Use the most important relationship and narrate why it applies.").slice(0, 220)}`,
      "Close by checking units, sign, and physical meaning, then ask the student to restate the pattern.",
    ],
    coachNotes: [
      "Keep the first minute conceptual before calculation.",
      "If the student is lost, switch to one concrete variable relationship and rebuild from there.",
    ],
  }
}

async function generateClaudeFlow({ subjectName, questionTitle, unit, standardCode, sampleQuestion, sampleAnswer }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return buildFallbackFlow({ questionTitle, sampleQuestion, unit, standardCode })
  }

  const prompt = `You are coaching a live tutor during class for ${subjectName}.

Create a concise live teaching guide for one question type. This is not a script to read word-for-word. It is a practical coaching flow for the tutor.

Question type: ${questionTitle}
Unit: ${unit || "Unknown"}
LO / standard code: ${standardCode || "Unknown"}
Representative question: ${sampleQuestion || "Unavailable"}
Representative answer: ${sampleAnswer || "Unavailable"}

Return ONLY valid JSON:
{
  "promptTitle": "short title",
  "timerSeconds": 420,
  "steps": ["4 to 5 short coaching steps"],
  "coachNotes": ["2 or 3 short notes"]
}

Rules:
- Keep steps short, imperative, and classroom-friendly
- Focus on concept breakdown, not full solution dumping
- Assume the tutor is moving fast and needs structure
- Avoid fluff
- timerSeconds should usually be between 300 and 540
- steps should be 4 or 5 items
- coachNotes should be brief`

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  const data = await res.json()
  const raw = data?.content?.[0]?.text || ""
  const payload = extractJsonPayload(raw)
  if (!payload) throw new Error(data?.error?.message || "Failed to parse live class flow.")
  return JSON.parse(payload)
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })
  const isAdmin = (session.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  if (!isAdmin) return res.status(403).json({ error: "Forbidden" })

  const {
    studentId = "",
    subjectId = "",
    questionPageId = "",
    questionTitle = "",
    unit = "",
    standardCode = "",
  } = req.body || {}

  if (!studentId || !subjectId || !questionPageId) {
    return res.status(400).json({ error: "Missing studentId, subjectId, or questionPageId." })
  }

  try {
    const [student, subject] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
    ])

    let pool = await getQuestionsForStudentContext(
      questionPageId,
      student?.country || "International",
      student?.state || "",
      standardCode || "",
      subject?.name || ""
    )
    if (!pool.length) pool = await getAllQuestionsForPage(questionPageId)
    const sample = pool[0] || {}

    let flow
    try {
      flow = await generateClaudeFlow({
        subjectName: subject?.name || "the subject",
        questionTitle,
        unit,
        standardCode,
        sampleQuestion: sample?.question || "",
        sampleAnswer: sample?.answer || "",
      })
    } catch (err) {
      console.warn("[live-class-flow] Claude fallback:", err.message)
      flow = buildFallbackFlow({
        questionTitle,
        sampleQuestion: sample?.question || "",
        unit,
        standardCode,
      })
    }

    return res.status(200).json({
      ok: true,
      flow: {
        ...flow,
        sampleQuestion: sample?.question || "",
        sampleAnswer: sample?.answer || "",
      },
    })
  } catch (err) {
    console.error("live-class-flow error:", err)
    return res.status(500).json({ error: "Failed to generate live class flow." })
  }
}
