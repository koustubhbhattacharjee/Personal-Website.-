import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  appendMcqCacheBundleToQuestionPage,
  appendMcqCacheToQuestionPage,
  createAssessmentAttempt,
  getAllQuestionsForPage,
  getAssessmentAttempt,
  getEnrollment,
  getPreviousClassQuestionsBeforeDate,
  getQuestionsByIds,
  getQuestionsForStudentContext,
  getScoreRowsForDate,
  getSessionByStudentSubjectDate,
  getStudentById,
  getSubjectById,
  getTodayQuestions,
  hasAssessmentAttemptsDB,
} from "../../../lib/db"
import { getQuestionCount } from "../../../lib/logic"
import { generateMCQBundleFromStoredQA, generateMCQFromStoredQA } from "../../../lib/claude"
import { getPastClassesForStudent, getUpcomingClassesForStudent } from "../../../lib/tutor-calendar"
import { getShowcaseStudentId, isShowcaseDemo } from "../../../lib/showcase"
import { getShowcaseAssessment } from "../../../lib/showcase-demo"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function djb2(value = "") {
  let hash = 5381
  const str = String(value || "")
  for (let i = 0; i < str.length; i += 1) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
  }
  return Math.abs(hash >>> 0)
}

function buildAssessmentSeed(parts = []) {
  return parts.map((part) => String(part || "")).join("|")
}

function stableRank(value = "", seed = "") {
  return djb2(`${seed}::${value}`)
}

function stableShuffle(items = [], seed = "", keyFn = (item) => String(item || "")) {
  return [...items].sort((a, b) => {
    const aRank = stableRank(keyFn(a), seed)
    const bRank = stableRank(keyFn(b), seed)
    if (aRank !== bRank) return aRank - bRank
    return String(keyFn(a)).localeCompare(String(keyFn(b)))
  })
}

function pickStable(items = [], seed = "", keyFn = (item) => String(item || "")) {
  if (!items.length) return null
  const ordered = stableShuffle(items, seed, keyFn)
  return ordered[0] || null
}

function serializeAssessmentQuestion(question = {}) {
  return {
    notionQuestionId: question.notionQuestionId,
    questionTypeTitle: question.questionTypeTitle,
    standardCode: question.standardCode || "",
    unit: question.unit || "",
    sourceImage: question.sourceImage || null,
    content: Array.isArray(question.content) && question.content.length ? question.content : null,
    questionKey: question.questionKey || "",
  }
}

async function hydrateStoredAssessmentQuestions(storedQuestions, { student, subject }) {
  const country = student.country || "International"
  const state = student.state || null
  const hydrated = []
  for (const item of storedQuestions || []) {
    if (!item?.notionQuestionId) continue
    if (Array.isArray(item.options) && item.question) {
      hydrated.push(item)
      continue
    }
    try {
      const pool = await getQuestionsForStudentContext(
        item.notionQuestionId,
        country,
        state,
        item.standardCode || "",
        subject.name
      )
      const cachedPool = pool.filter((entry) => entry.mcq)
      const picked = cachedPool.find((entry) => entry.qhash === item.questionKey) || cachedPool[0]
      if (!picked?.mcq) continue
      hydrated.push({
        ...picked.mcq,
        notionQuestionId: item.notionQuestionId,
        questionTypeTitle: item.questionTypeTitle || "",
        standardCode: item.standardCode || "",
        unit: item.unit || "",
        sourceImage: item.sourceImage || picked.imageUrl || null,
        content: (Array.isArray(item.content) && item.content.length)
          ? item.content
          : (Array.isArray(picked.content) && picked.content.length ? picked.content : null),
        questionKey: item.questionKey || picked.qhash || "",
      })
    } catch (err) {
      console.error(`[assessment] failed to hydrate stored question ${item.notionQuestionId}:`, err?.message || err)
    }
  }
  return hydrated
}

export default async function handler(req, res) {
  const demoMode = isShowcaseDemo(req)
  if (demoMode) {
    const data = await getShowcaseAssessment(req, {
      subjectId: req.query.subjectId,
      mode: req.query.mode,
      sessionDate: req.query.sessionDate || null,
      count: req.query.count || 0,
    })
    if (data) return res.status(200).json(data)
  }

  const session = demoMode ? null : await getServerSession(req, res, authOptions)
  if (!session && !demoMode) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = demoMode || (session.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const { subjectId, mode, previewIds } = req.query
  const requestedSessionDate = req.query.sessionDate || null
  const requestedCount = Math.max(0, parseInt(String(req.query.count || "").trim(), 10) || 0)
  const studentId = demoMode
    ? (req.query.as || getShowcaseStudentId())
    : (req.query.as && isAdmin) ? req.query.as : session.notionStudentId
  const isPreview = isAdmin && !!req.query.as

  try {
    if (!requestedSessionDate) {
      return res.status(400).json({
        error: "sessionDate is required. Assessment flows must be anchored to an explicit session date.",
      })
    }

    const [student, subject] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId)
    ])

    const enrollment = await getEnrollment(studentId, subjectId)
    const duration = enrollment?.duration || 60
    const defaultQuestionCount = getQuestionCount(duration)
    const questionCount = mode === "pre" && requestedCount > 0 ? requestedCount : defaultQuestionCount
    const dataSourceId = subject.dataSourceId

    if (!dataSourceId) {
      return res.status(400).json({ error: "Subject has no data source ID configured." })
    }

    let questionTypes = []
    let attemptSessionDate = requestedSessionDate
    let unlockAt = null
    let expireAt = null
    const selectionSeed = buildAssessmentSeed([studentId, subjectId, mode, requestedSessionDate])

    if (mode === "pre") {
      questionTypes = await getPreviousClassQuestionsBeforeDate(dataSourceId, studentId, subjectId, requestedSessionDate)
      if (!questionTypes.length) {
        return res.status(200).json({ questions: [], noData: true, subject: subject.name })
      }
      attemptSessionDate = requestedSessionDate
      try {
        const upcoming = await getUpcomingClassesForStudent(student.name, subject.name, 1)
        if (upcoming?.[0]?.startTime) expireAt = upcoming[0].startTime
      } catch {}
    } else if (mode === "exit") {
      const sessionRows = await getScoreRowsForDate(studentId, subjectId, requestedSessionDate)
      attemptSessionDate = requestedSessionDate
      // exit ticket lock removed — always allow
      try {
        const [pastClasses, upcomingClasses] = await Promise.all([
          getPastClassesForStudent(student.name, subject.name, 20),
          getUpcomingClassesForStudent(student.name, subject.name, 2),
        ])
        const matchingPast = pastClasses.filter((item) => item.date === attemptSessionDate).at(-1)
        unlockAt = matchingPast?.endTime || null
        expireAt = upcomingClasses?.[0]?.startTime || null
      } catch {}
      if (previewIds) {
        try {
          const ids = JSON.parse(decodeURIComponent(previewIds))
          if (ids.length) questionTypes = await getQuestionsByIds(ids)
        } catch (e) {
          console.warn("[assessment] failed to parse previewIds, falling back:", e.message)
        }
      }
      if (!questionTypes.length) {
        questionTypes = await getTodayQuestions(dataSourceId, studentId, subjectId, student.timezone, requestedSessionDate)
      }
      if (!questionTypes.length) {
        return res.status(200).json({ questions: [], noData: true, subject: subject.name })
      }
    }

    const canReuseStoredAttempt = hasAssessmentAttemptsDB() && attemptSessionDate && !previewIds
    if (canReuseStoredAttempt) {
      const existingAttempt = await getAssessmentAttempt(studentId, subjectId, mode, attemptSessionDate)
      if (existingAttempt?.questionPayload?.length) {
        const hydratedQuestions = await hydrateStoredAssessmentQuestions(existingAttempt.questionPayload, { student, subject })
        if (hydratedQuestions.length > 0) {
          return res.status(200).json({
            questions: hydratedQuestions,
            questionCount,
            duration,
            subject: subject.name,
            mode,
            attemptId: existingAttempt.id,
            attemptStatus: existingAttempt.status,
            result: existingAttempt.resultPayload,
            sessionDate: attemptSessionDate,
          })
        }
        console.warn("[assessment] stored attempt hydration returned 0 questions, regenerating:", existingAttempt.id)
      }
    }

    const shuffled = stableShuffle(
      questionTypes,
      selectionSeed,
      (item) => String(item?.id || item?.title || "")
    )
    const selected = shuffled.slice(0, Math.min(questionCount, shuffled.length))
    const country = student.country || "International"
    const state = student.state || null
    const questions = []

    for (const qt of selected) {
      if (!qt.id) continue

      const loCode = qt.standardCode || ""
      let pool = await getQuestionsForStudentContext(qt.id, country, state, loCode, subject.name)
      if (pool.length === 0) {
        pool = await getAllQuestionsForPage(qt.id)
      }
      if (pool.length === 0) continue

      const cachedPool = pool.filter(p => p.mcq)
      let picked = null
      let mcq = null
      const questionSeed = buildAssessmentSeed([selectionSeed, qt.id, qt.title])

      if (cachedPool.length) {
        picked = pickStable(cachedPool, questionSeed, (entry) => String(entry?.qhash || entry?.question || ""))
        mcq = picked.mcq || null
      } else {
        picked = pickStable(pool, questionSeed, (entry) => String(entry?.qhash || entry?.question || ""))
        if (!picked) continue
        try {
          const batchCandidates = pool.filter((item) => item?.qhash && item?.question && item?.answer).slice(0, 3)
          let usedBundleWrite = false
          if (batchCandidates.length > 1) {
            try {
              const generated = await generateMCQBundleFromStoredQA(batchCandidates, qt.title, subject.name)
              const generatedByHash = new Map(generated.map((item) => [item.qhash, item]))
              mcq = generatedByHash.get(picked.qhash) || null
              const bundleItems = batchCandidates
                .map((item) => {
                  const found = generatedByHash.get(item.qhash)
                  return found ? { qhash: item.qhash, mcq: found } : null
                })
                .filter(Boolean)
              if (bundleItems.length > 1) {
                appendMcqCacheBundleToQuestionPage(qt.id, {
                  country,
                  state,
                  loCode,
                  items: bundleItems,
                }).catch(() => {})
                usedBundleWrite = true
              }
            } catch {}
          }
          if (!mcq) mcq = await generateMCQFromStoredQA(picked, qt.title, subject.name)
          if (!usedBundleWrite && picked.qhash && mcq) {
            appendMcqCacheToQuestionPage(qt.id, {
              country,
              state,
              loCode,
              qhash: picked.qhash,
              mcq,
            }).catch(() => {})
          }
        } catch {
          continue
        }
      }

      if (!mcq) continue

      questions.push({
        ...mcq,
        notionQuestionId: qt.id,
        questionTypeTitle: qt.title,
        standardCode: qt.standardCode || "",
        unit: qt.unit || "",
        sourceImage: picked.imageUrl || null,
        content: Array.isArray(picked.content) && picked.content.length ? picked.content : null,
        questionKey: picked.qhash || "",
      })
    }

    if (!questions.length) {
      return res.status(200).json({ questions: [], noData: true, subject: subject.name })
    }

    let createdAttempt = null
    if (!isPreview && hasAssessmentAttemptsDB() && attemptSessionDate) {
      const sessionRow = await getSessionByStudentSubjectDate(studentId, subjectId, attemptSessionDate).catch(() => null)
      const sourceSummary = JSON.stringify({
        mode,
        sessionDate: attemptSessionDate,
        questionTypeIds: selected.map((item) => item.id),
      })
      createdAttempt = await createAssessmentAttempt({
        studentId,
        subjectId,
        sessionId: sessionRow?.id || "",
        mode,
        sessionDate: attemptSessionDate,
        unlockAt,
        expireAt,
        questions: questions.map(serializeAssessmentQuestion),
        sourceSummary,
      })
    }

    return res.status(200).json({
      questions,
      questionCount,
      duration,
      subject: subject.name,
      mode,
      attemptId: createdAttempt?.id || null,
      attemptStatus: createdAttempt?.status || "Assigned",
      sessionDate: attemptSessionDate,
    })
  } catch (err) {
    console.error("Assessment error:", err)
    return res.status(500).json({ error: "Failed to generate assessment" })
  }
}
