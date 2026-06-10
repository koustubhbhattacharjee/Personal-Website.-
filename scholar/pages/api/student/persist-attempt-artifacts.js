import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  appendAttemptArtifactLinks,
  createReportRow,
  getAllScoresForStudent,
  getAssessmentAttempt,
  getAssessmentAttemptById,
  getHomeworkAttemptById,
  getSessionByStudentSubjectDate,
  getStudentById,
  getSubjectById,
  getWeaknessMap,
  updateAssessmentAttemptArtifacts,
  updateHomeworkAttemptArtifacts,
  updateSessionArtifacts,
} from "../../../lib/db"
import { calculateTrends } from "../../../lib/logic"
import { getObjectiveByCode } from "../../../lib/district-taxonomy"
import { generateAttemptPdfBase64, generatePdfBase64 } from "../../../lib/pdf"
import { uploadPdfToR2 } from "../../../lib/r2"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function countBy(items = [], selector) {
  const map = {}
  for (const item of items || []) {
    const keys = selector(item) || []
    for (const key of keys) {
      const label = String(key || "").trim()
      if (!label) continue
      map[label] = (map[label] || 0) + 1
    }
  }
  return Object.entries(map)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
}

function splitCodes(raw = "") {
  return String(raw || "").split(",").map((item) => item.trim()).filter(Boolean)
}

function summarizeWeaknessChanges(updatedScores = []) {
  const raised = []
  const lowered = []
  for (const item of updatedScores || []) {
    const before = Number(item?.weaknessBefore ?? item?.weaknessScore ?? 0)
    const after = Number(item?.weaknessAfter ?? item?.weaknessScore ?? 0)
    const delta = Math.round((after - before) * 100) / 100
    const label = item?.questionTypeTitle || item?.topic || "Unknown"
    if (delta > 0) raised.push(`${label} (+${delta})`)
    if (delta < 0) lowered.push(`${label} (${delta})`)
  }
  if (!raised.length && !lowered.length) return "No weakness changes recorded"
  const parts = []
  if (raised.length) parts.push(`Raised: ${raised.join(", ")}`)
  if (lowered.length) parts.push(`Lowered: ${lowered.join(", ")}`)
  return parts.join(" | ")
}

function summarizeMasteryChanges(updatedScores = [], kind = "") {
  const weight = kind === "homework" ? 0.2 : 1
  const positives = (updatedScores || [])
    .filter((item) => item?.correct)
    .map((item) => `${item?.questionTypeTitle || item?.topic || "Unknown"} (+${weight})`)
  return positives.length ? positives.join(", ") : "No mastery gains recorded"
}

function buildAttemptQuestionsFromPayload(payload = [], resultPayload = null) {
  const updates = Array.isArray(resultPayload?.updatedScores) ? resultPayload.updatedScores : []
  return (payload || []).map((item, index) => ({
    topic: item.questionTypeTitle || item.topic || "Question",
    questionTypeTitle: item.questionTypeTitle || item.topic || "Question",
    question: item.question || "",
    options: item.options || [],
    correctIndex: Number.isInteger(item.correctIndex) ? item.correctIndex : null,
    selectedIndex: Number.isInteger(updates[index]?.selectedIndex) ? updates[index].selectedIndex : null,
    correct: typeof updates[index]?.correct === "boolean" ? updates[index].correct : null,
    weaknessScore: updates[index]?.weaknessScore ?? item.weaknessScore ?? null,
    comboReduction: updates[index]?.comboReduction ?? 0,
    explanation: item.explanation || "",
  }))
}

function buildAttemptPdfData({ student, subject, sessionDate, kind, attempt }) {
  const resultPayload = attempt?.resultPayload || {}
  const questions = buildAttemptQuestionsFromPayload(attempt?.questionPayload || [], resultPayload)
  return {
    studentName: student.name,
    subject: subject.name,
    date: sessionDate,
    kind,
    mode: attempt?.mode || "",
    score: resultPayload?.score ?? attempt?.score ?? 0,
    total: resultPayload?.total ?? attempt?.total ?? questions.length,
    questions,
    swap: resultPayload?.swap || null,
    updatedScores: Array.isArray(resultPayload?.updatedScores) ? resultPayload.updatedScores : [],
    preview: !!resultPayload?.preview,
    generatedAt: new Date().toISOString(),
  }
}

function buildSessionReportData({ student, subject, sessionDate, preAttempt, exitAttempt, weaknessMap, trends }) {
  const preQuestions = buildAttemptQuestionsFromPayload(preAttempt?.questionPayload || [], preAttempt?.resultPayload || {})
  const exitQuestions = buildAttemptQuestionsFromPayload(exitAttempt?.questionPayload || [], exitAttempt?.resultPayload || {})
  const allQs = [...preQuestions, ...exitQuestions].filter(Boolean)
  const negatives = allQs.filter((q) => q.correct === false)
  const positives = allQs.filter((q) => q.correct === true)
  const baselineWeakness = weaknessMap?.topics || weaknessMap || {}

  const unitFromLo = (code) => {
    if (!code) return ""
    const obj = getObjectiveByCode(student.state, subject.name, code)
    return obj?.standardName || obj?.standardCode || ""
  }

  const loScoreMap = baselineWeakness
  const unitTotals = Object.entries(loScoreMap || {})
    .map(([code, score]) => ({ unit: unitFromLo(code) || "Unknown", score: Number(score || 0) }))
    .reduce((acc, item) => {
      acc[item.unit] = (acc[item.unit] || 0) + item.score
      return acc
    }, {})

  return {
    studentName: student.name,
    subject: subject.name,
    date: sessionDate,
    generatedAt: new Date().toISOString(),
    preAssessment: {
      score: preAttempt?.resultPayload?.score ?? preAttempt?.score ?? 0,
      total: preAttempt?.resultPayload?.total ?? preAttempt?.total ?? preQuestions.length,
      questions: preQuestions,
    },
    exitTicket: {
      score: exitAttempt?.resultPayload?.score ?? exitAttempt?.score ?? 0,
      total: exitAttempt?.resultPayload?.total ?? exitAttempt?.total ?? exitQuestions.length,
      questions: exitQuestions,
    },
    objectives: [],
    fafoTriggered: !!exitAttempt?.resultPayload?.swap?.triggered,
    fafoTopics: exitAttempt?.resultPayload?.swap?.swappedIn?.map((item) => item.title).filter(Boolean) || [],
    weaknessScores: baselineWeakness,
    weaknessBaseline: baselineWeakness,
    trends: trends || {},
    exitTicketMissed: false,
    chartData: {
      questionTypes: {
        positive: countBy(positives, (q) => [q.topic || q.questionTypeTitle || "Unknown"]),
        negative: countBy(negatives, (q) => [q.topic || q.questionTypeTitle || "Unknown"]),
      },
      los: {
        positive: countBy(positives, (q) => splitCodes(q.loCode || q.standardCode || "")),
        negative: countBy(negatives, (q) => splitCodes(q.loCode || q.standardCode || "")),
      },
      units: {
        positive: [],
        negative: [],
        total: Object.entries(unitTotals)
          .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
          .sort((a, b) => b.value - a.value),
      },
    },
  }
}

async function uploadPdf({ studentId, subjectId, sessionDate, kind, attemptId, pdfBase64 }) {
  const bucket = process.env.R2_BUCKET
  const baseUrl = process.env.R2_PUBLIC_BASE_URL
  if (!bucket || !baseUrl) throw new Error("R2_BUCKET or R2_PUBLIC_BASE_URL is not configured.")
  const stamp = new Date().toISOString().replace(/[:.]/g, "").replace("T", "_").replace("Z", "")
  const key = `attempts/${studentId}/${subjectId}/${sessionDate}/${kind}/${attemptId || stamp}_${stamp}.pdf`
  const body = Buffer.from(pdfBase64, "base64")
  await uploadPdfToR2({ bucket, key, body })
  return {
    key,
    url: `${baseUrl.replace(/\/$/, "")}/${key}`,
  }
}

export const config = {
  api: {
    bodyParser: { sizeLimit: "2mb" },
  },
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = (session.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const { subjectId, mode = "", attemptId = "", as: asStudentId, kind = "" } = req.body || {}
  const studentId = (asStudentId && isAdmin) ? asStudentId : session.notionStudentId

  try {
    const [student, subject] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
    ])

    if (!subject?.id) return res.status(400).json({ error: "Invalid subject." })

    if (kind === "homework") {
      const attempt = await getHomeworkAttemptById(attemptId)
      if (!attempt?.id || !attempt?.sessionDate) return res.status(400).json({ error: "Homework attempt not found." })
      const sessionRow = await getSessionByStudentSubjectDate(studentId, subjectId, attempt.sessionDate)
      const pdfBase64 = await generateAttemptPdfBase64(buildAttemptPdfData({
        student,
        subject,
        sessionDate: attempt.sessionDate,
        kind: "Homework",
        attempt,
      }))
      const uploaded = await uploadPdf({
        studentId,
        subjectId,
        sessionDate: attempt.sessionDate,
        kind: "homework",
        attemptId: attempt.id,
        pdfBase64,
      })
      await updateHomeworkAttemptArtifacts(attempt.id, {
        sessionId: sessionRow?.id || attempt.sessionId || "",
        attemptNumber: attempt.attemptNumber || 1,
        isLatest: true,
        isOfficial: true,
        pdfUrl: uploaded.url,
        pdfR2Key: uploaded.key,
      })
      await appendAttemptArtifactLinks(attempt.id, {
        pdfUrl: uploaded.url,
      }).catch(() => {})
      if (sessionRow?.id) {
        await updateSessionArtifacts(sessionRow.id, {
          "Latest Homework PDF URL": { url: uploaded.url },
          "Homework Attempts": { relation: [...new Set([...(sessionRow.homeworkAttemptIds || []), attempt.id])].map((id) => ({ id })) },
        })
      }
      return res.status(200).json({ ok: true, pdfUrl: uploaded.url, pdfR2Key: uploaded.key })
    }

    const attempt = attemptId
      ? await getAssessmentAttemptById(attemptId)
      : await getAssessmentAttempt(studentId, subjectId, mode, req.body.sessionDate || null)
    const resolvedAttempt = attempt?.id ? attempt : null
    if (!resolvedAttempt?.id || !resolvedAttempt?.sessionDate) {
      return res.status(400).json({ error: "Assessment attempt not found." })
    }

    const sessionRow = await getSessionByStudentSubjectDate(studentId, subjectId, resolvedAttempt.sessionDate)
    const assessmentKind = mode === "exit" ? "Exit Ticket" : "Pre-Class Assessment"
    const pdfBase64 = await generateAttemptPdfBase64(buildAttemptPdfData({
      student,
      subject,
      sessionDate: resolvedAttempt.sessionDate,
      kind: assessmentKind,
      attempt: resolvedAttempt,
    }))
    const uploaded = await uploadPdf({
      studentId,
      subjectId,
      sessionDate: resolvedAttempt.sessionDate,
      kind: mode === "exit" ? "exit" : "pre",
      attemptId: resolvedAttempt.id,
      pdfBase64,
    })

    await updateAssessmentAttemptArtifacts(resolvedAttempt.id, {
      sessionId: sessionRow?.id || resolvedAttempt.sessionId || "",
      attemptNumber: resolvedAttempt.attemptNumber || 1,
      isLatest: true,
      isOfficial: true,
      pdfUrl: uploaded.url,
      pdfR2Key: uploaded.key,
    })

    const sessionProps = mode === "exit"
      ? {
          "Latest Exit Ticket PDF URL": { url: uploaded.url },
          "Exit Ticket Attempts": { relation: [...new Set([...(sessionRow?.exitTicketAttemptIds || []), resolvedAttempt.id])].map((id) => ({ id })) },
        }
      : {
          "Latest Pre-Class PDF URL": { url: uploaded.url },
          "Pre-Class Attempts": { relation: [...new Set([...(sessionRow?.preClassAttemptIds || []), resolvedAttempt.id])].map((id) => ({ id })) },
        }
    if (sessionRow?.id) {
      await updateSessionArtifacts(sessionRow.id, sessionProps)
    }

    let reportUrl = ""
    let reportR2Key = ""
    if (mode === "exit" && sessionRow?.id) {
      const preAttempt = await getAssessmentAttempt(studentId, subjectId, "pre", resolvedAttempt.sessionDate)
      const allScores = await getAllScoresForStudent(studentId)
      const weaknessMap = await getWeaknessMap(studentId, subjectId)
      const trends = calculateTrends(allScores)
      const reportPdfBase64 = await generatePdfBase64(buildSessionReportData({
        student,
        subject,
        sessionDate: resolvedAttempt.sessionDate,
        preAttempt,
        exitAttempt: resolvedAttempt,
        weaknessMap,
        trends,
      }))
      const uploadedReport = await uploadPdf({
        studentId,
        subjectId,
        sessionDate: resolvedAttempt.sessionDate,
        kind: "session-report",
        attemptId: sessionRow.id,
        pdfBase64: reportPdfBase64,
      })
      reportUrl = uploadedReport.url
      reportR2Key = uploadedReport.key
      await updateSessionArtifacts(sessionRow.id, {
        "Session Report PDF URL": { url: uploadedReport.url },
      })
      await createReportRow({
        studentId,
        subjectId,
        dateStr: resolvedAttempt.sessionDate,
        reportUrl: uploadedReport.url,
      }).catch(() => {})
    }

    await appendAttemptArtifactLinks(resolvedAttempt.id, {
      pdfUrl: uploaded.url,
      reportUrl,
    }).catch(() => {})

    return res.status(200).json({
      ok: true,
      pdfUrl: uploaded.url,
      pdfR2Key: uploaded.key,
      reportUrl,
      reportR2Key,
    })
  } catch (err) {
    console.error("Persist attempt artifacts error:", err)
    try {
      const { subjectId, mode = "" } = req.body || {}
      const studentId = (req.body?.as && isAdmin) ? req.body.as : session.notionStudentId
      const sessionRow = await getSessionByStudentSubjectDate(studentId, subjectId, req.body?.sessionDate || null).catch(() => null)
    } catch {}
    return res.status(500).json({ error: "Failed to persist attempt artifacts" })
  }
}
