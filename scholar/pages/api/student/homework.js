import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  createHomeworkAttempt,
  getSessionByStudentSubjectDate,
  getHomeworkAttemptByCycle,
  listHomeworkAttempts,
  getQuestionsForStudentContext,
  getQuestionsWithScores,
  getStudentById,
  getSubjectById,
  getTodayInTimezone,
  hasHomeworkAttemptsDB,
  isAdminHomeworkVisible,
} from "../../../lib/db"
import {
  buildHomeworkCycle,
  HOMEWORK_DAILY_COUNT,
  takeCycledDistinct,
} from "../../../lib/homework"
import {
  getPastClassesForStudent,
  getUpcomingClassesForStudent,
} from "../../../lib/tutor-calendar"
import { getShowcaseStudentId, isShowcaseDemo } from "../../../lib/showcase"
import { getShowcaseHomework } from "../../../lib/showcase-demo"

const ADMIN_EMAIL = "kbohuastt@gmail.com"
const DEFAULT_HOMEWORK_MAX = 30

function buildQuestionPayloadEntry(qType, picked, lastSessionDate) {
  const mcq = picked.mcq || null
  if (!mcq) return null
  return {
    ...mcq,
    notionQuestionId: qType.id,
    questionTypeTitle: qType.title,
    topics: qType.topics,
    weaknessScore: qType.weaknessScore,
    isSessionQuestion: qType.dateIntroduced === lastSessionDate,
    sourceImage: picked.imageUrl || null,
    content: Array.isArray(picked.content) && picked.content.length ? picked.content : null,
    questionKey: picked.qhash || "",
    questionFormat: picked.questionFormat || "mcq",
    stemGroupId: picked.stemGroupId || null,
    isStemChild: !!picked.isStemChild,
    stemHeader: picked.stemHeader || null,
  }
}

function serializeAttemptQuestion(question = {}) {
  return {
    notionQuestionId: question.notionQuestionId,
    questionTypeTitle: question.questionTypeTitle,
    topics: Array.isArray(question.topics) ? question.topics : [],
    weaknessScore: question.weaknessScore || 0,
    isSessionQuestion: !!question.isSessionQuestion,
    sourceImage: question.sourceImage || null,
    content: Array.isArray(question.content) && question.content.length ? question.content : null,
    questionKey: question.questionKey || "",
    questionFormat: question.questionFormat || "mcq",
    stemGroupId: question.stemGroupId || null,
    isStemChild: !!question.isStemChild,
    stemHeader: question.stemHeader || null,
  }
}

function priorityForQuestion(q, lastSessionDate, activeAdminSessionDate = "") {
  if (q.hwSourceKind === "admin_hw" && q.hwSessionDate === activeAdminSessionDate) return 0
  if (q.dateIntroduced === lastSessionDate) return 1
  return 2
}

function sortHomeworkStack(stack, lastSessionDate, activeAdminSessionDate = "") {
  return [...stack].sort((a, b) =>
    (priorityForQuestion(a, lastSessionDate, activeAdminSessionDate) - priorityForQuestion(b, lastSessionDate, activeAdminSessionDate)) ||
    ((priorityForQuestion(a, lastSessionDate, activeAdminSessionDate) === 0 &&
      priorityForQuestion(b, lastSessionDate, activeAdminSessionDate) === 0)
      ? (b.hwSessionDate || "").localeCompare(a.hwSessionDate || "")
      : 0) ||
    ((b.weaknessScore || 0) - (a.weaknessScore || 0)) ||
    a.title.localeCompare(b.title)
  )
}

async function generateHomeworkQuestions(selectedTypes, {
  student,
  subject,
  cycleIndex,
  lastSessionDate,
}) {
  const country = student.country || "International"
  const state = student.state || null
  const questions = []

  for (let i = 0; i < selectedTypes.length; i++) {
    const qType = selectedTypes[i]
    try {
      const pool = await getQuestionsForStudentContext(
        qType.id,
        country,
        state,
        qType.standardCode || "",
        subject.name
      )
      const cachedPool = pool.filter((p) => p.mcq)
      if (!cachedPool.length) continue
      const picked = cachedPool[(cycleIndex + i) % cachedPool.length]

      // Stem children share a stem_group_id: surface every sibling as its own
      // sequential row in the homework so the student works through the stem
      // end to end instead of just one child.
      if (picked?.stemGroupId && picked?.isStemChild) {
        const siblings = cachedPool
          .filter((p) => p.stemGroupId === picked.stemGroupId)
          .sort((a, b) => String(a.qhash || "").localeCompare(String(b.qhash || "")))
        for (const sib of siblings) {
          const payload = buildQuestionPayloadEntry(qType, sib, lastSessionDate)
          if (payload) questions.push(payload)
        }
        continue
      }

      const payload = buildQuestionPayloadEntry(qType, picked, lastSessionDate)
      if (payload) questions.push(payload)
    } catch (err) {
      console.error(`[homework] failed to build question for ${qType.title}:`, err?.message || err)
    }
  }

  return questions
}

async function hydrateStoredQuestions(storedQuestions, {
  student,
  subject,
  lastSessionDate,
}) {
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
        "",
        subject.name
      )
      const cachedPool = pool.filter((entry) => entry.mcq)
      const picked = cachedPool.find((entry) => entry.qhash === item.questionKey) || cachedPool[0]
      if (!picked?.mcq) continue
      hydrated.push({
        ...picked.mcq,
        notionQuestionId: item.notionQuestionId,
        questionTypeTitle: item.questionTypeTitle || "",
        topics: item.topics || [],
        weaknessScore: item.weaknessScore || 0,
        isSessionQuestion: typeof item.isSessionQuestion === "boolean" ? item.isSessionQuestion : false,
        sourceImage: item.sourceImage || picked.imageUrl || null,
        content: (Array.isArray(item.content) && item.content.length)
          ? item.content
          : (Array.isArray(picked.content) && picked.content.length ? picked.content : null),
        questionKey: item.questionKey || picked.qhash || "",
      })
    } catch (err) {
      console.error(`[homework] failed to hydrate stored question ${item.notionQuestionId}:`, err?.message || err)
    }
  }

  return hydrated.map((item) => ({
    ...item,
    isSessionQuestion: item.isSessionQuestion || false,
    questionTypeTitle: item.questionTypeTitle || "",
    topics: item.topics || [],
    weaknessScore: item.weaknessScore || 0,
    sourceImage: item.sourceImage || null,
  }))
}

async function buildLegacyHomework({ student, subject, allQuestions }) {
  const today = getTodayInTimezone(student.timezone || "UTC")
  const lastSessionDate = allQuestions
    .filter((q) => q.dateIntroduced && q.dateIntroduced <= today)
    .map((q) => q.dateIntroduced)
    .sort()
    .at(-1) || null

  const sessionQuestions = lastSessionDate
    ? allQuestions.filter((q) => q.dateIntroduced === lastSessionDate)
    : []
  const weakQuestions = allQuestions.filter((q) => q.weaknessScore > 2)
  const adminQuestions = allQuestions.filter(
    (q) => q.hwSourceKind === "admin_hw" && isAdminHomeworkVisible(q.hwSource, student.timezone || "UTC", today)
  )

  const stackMap = new Map()
  for (const q of [...weakQuestions, ...sessionQuestions, ...adminQuestions]) stackMap.set(q.id, q)
  const stack = sortHomeworkStack([...stackMap.values()], lastSessionDate, "")
  if (!stack.length) return { questions: [], noData: true }

  const envCap = parseInt(process.env.HOMEWORK_MAX_QUESTIONS || "", 10)
  const maxQuestions = Number.isFinite(envCap) && envCap > 0 ? envCap : DEFAULT_HOMEWORK_MAX
  const selectedTypes = stack.slice(0, maxQuestions)
  const questions = await generateHomeworkQuestions(selectedTypes, {
    student,
    subject,
    cycleIndex: 0,
    lastSessionDate,
  })

  return { questions, subject: subject.name, mode: "legacy" }
}

function buildHomeworkStackForSession(allQuestions, student, sessionDate) {
  const today = getTodayInTimezone(student.timezone || "UTC")
  const sessionRows = sessionDate
    ? allQuestions.filter((q) => q.dateIntroduced === sessionDate)
    : []
  const weakQuestions = allQuestions.filter((q) => q.weaknessScore > 2)
  const activeAdminQuestions = allQuestions.filter(
    (q) => q.hwSourceKind === "admin_hw" &&
      q.hwSessionDate === sessionDate &&
      isAdminHomeworkVisible(q.hwSource, student.timezone || "UTC", today)
  )
  const stackMap = new Map()
  for (const q of [...weakQuestions, ...sessionRows, ...activeAdminQuestions]) stackMap.set(q.id, q)
  return {
    stack: sortHomeworkStack([...stackMap.values()], sessionDate, sessionDate),
    sessionRows,
    weakQuestions,
    activeAdminQuestions,
  }
}

export default async function handler(req, res) {
  const demoMode = isShowcaseDemo(req)
  if (demoMode) {
    const data = await getShowcaseHomework(req, req.query.subjectId)
    if (data) return res.status(200).json(data)
  }
  const session = demoMode ? null : await getServerSession(req, res, authOptions)
  if (!session && !demoMode) return res.status(401).json({ error: "Unauthorized" })

  const isAdmin = demoMode || (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const isPreview = !demoMode && isAdmin && !!req.query.as
  const { subjectId, as: asStudentId, previewExit } = req.query
  const studentId = demoMode
    ? (asStudentId || getShowcaseStudentId())
    : (isAdmin && asStudentId) ? asStudentId : session.notionStudentId

  try {
    const [student, subject] = await Promise.all([
      getStudentById(studentId),
      getSubjectById(subjectId),
    ])

    if (!subject?.dataSourceId) {
      return res.status(400).json({ error: "No data source ID for subject" })
    }

    const allQuestions = await getQuestionsWithScores(subject.dataSourceId, studentId, subjectId)
    if (!allQuestions.length) return res.status(200).json({ questions: [], noData: true })

    if (isPreview || !hasHomeworkAttemptsDB()) {
      const legacy = await buildLegacyHomework({ student, subject, allQuestions })
      return res.status(200).json(legacy)
    }

    const adminAttempts = await listHomeworkAttempts(studentId, subjectId, 12).catch(() => [])

    const sessionEvents = []
    const [pastClasses, upcomingClasses] = await Promise.all([
      getPastClassesForStudent(student.name, subject.name, 20),
      getUpcomingClassesForStudent(student.name, subject.name, 5),
    ])
    sessionEvents.push(...pastClasses, ...upcomingClasses)

    const now = new Date()
    const currentSession = sessionEvents
      .filter((event) => event?.startTime && event?.endTime)
      .find((event) => new Date(event.startTime) <= now && now < new Date(event.endTime))

    const cycle = buildHomeworkCycle({
      lastCompletedSession: pastClasses.at(-1) || null,
      nextSession: currentSession || upcomingClasses[0] || null,
      sessionTimezone: student.timezone || "UTC",
      tutorTimezone: process.env.TUTOR_TIMEZONE || "Asia/Kolkata",
      now,
    })

    const activeOverrideAttempt = (adminAttempts || [])
      .filter((attempt) => attempt?.expireAt && new Date(attempt.expireAt) > now)
      .sort((a, b) => new Date(b.expireAt) - new Date(a.expireAt))[0] || null

    if (!cycle.available && activeOverrideAttempt?.questionPayload?.length) {
      const hydratedQuestions = await hydrateStoredQuestions(activeOverrideAttempt.questionPayload, {
        student,
        subject,
        lastSessionDate: activeOverrideAttempt.sessionDate,
      })
      return res.status(200).json({
        questions: hydratedQuestions,
        subject: subject.name,
        mode: "attempts",
        cycle: {
          ...cycle,
          available: true,
          sessionDate: activeOverrideAttempt.sessionDate,
          expireAt: activeOverrideAttempt.expireAt,
          overrideExpireAt: activeOverrideAttempt.expireAt,
          overrideAttemptId: activeOverrideAttempt.id,
        },
        cycleKey: activeOverrideAttempt.cycleKey,
        attemptId: activeOverrideAttempt.id,
        attemptStatus: activeOverrideAttempt.status,
        result: activeOverrideAttempt.resultPayload,
      })
    }

    if (!cycle.available) {
      const message = cycle.reason === "session_in_progress"
        ? "Homework unlocks once class ends."
        : cycle.reason === "no_completed_session"
          ? "Homework appears after your first completed class."
          : "Homework closes once the next class begins."
      return res.status(200).json({ questions: [], locked: true, message, cycle })
    }

    let lastSessionDate = cycle.sessionDate

    let { stack, sessionRows, weakQuestions, activeAdminQuestions } = buildHomeworkStackForSession(
      allQuestions,
      student,
      lastSessionDate
    )

    if (!stack.length) {
      const fallbackAdminSessionDate = [...new Set(
        allQuestions
          .filter((q) => q.hwSourceKind === "admin_hw" && isAdminHomeworkVisible(q.hwSource, student.timezone || "UTC", getTodayInTimezone(student.timezone || "UTC")))
          .map((q) => q.hwSessionDate)
          .filter(Boolean)
      )].sort().at(-1) || ""

      if (fallbackAdminSessionDate) {
        lastSessionDate = fallbackAdminSessionDate
        ;({ stack, sessionRows, weakQuestions, activeAdminQuestions } = buildHomeworkStackForSession(
          allQuestions,
          student,
          lastSessionDate
        ))
      }
    }

    const cycleKey = `${studentId}:${subjectId}:${lastSessionDate}:${cycle.cycleIndex}`
    const batchKey = `${studentId}:${subjectId}:${lastSessionDate}`
    const existingAttempt = await getHomeworkAttemptByCycle(studentId, subjectId, cycleKey)
    if (existingAttempt?.questionPayload?.length) {
      const hydratedQuestions = await hydrateStoredQuestions(existingAttempt.questionPayload, {
        student,
        subject,
        lastSessionDate,
      })
      return res.status(200).json({
        questions: hydratedQuestions,
        subject: subject.name,
        mode: "attempts",
        cycle: {
          ...cycle,
          sessionDate: lastSessionDate,
          expireAt: existingAttempt.expireAt || cycle.expireAt,
          overrideExpireAt: existingAttempt.expireAt || null,
        },
        cycleKey,
        attemptId: existingAttempt.id,
        attemptStatus: existingAttempt.status,
        result: existingAttempt.resultPayload,
      })
    }

    if (!stack.length) return res.status(200).json({ questions: [], noData: true, cycle })

    const envCap = parseInt(process.env.HOMEWORK_MAX_QUESTIONS || "", 10)
    const maxQuestions = Number.isFinite(envCap) && envCap > 0 ? envCap : DEFAULT_HOMEWORK_MAX
    const cappedStack = stack.slice(0, maxQuestions)
    const startIndex = cycle.cycleIndex * HOMEWORK_DAILY_COUNT
    const selectedTypes = takeCycledDistinct(cappedStack, startIndex, HOMEWORK_DAILY_COUNT)
    const questions = await generateHomeworkQuestions(selectedTypes, {
      student,
      subject,
      cycleIndex: cycle.cycleIndex,
      lastSessionDate,
    })

    if (!questions.length) return res.status(200).json({ questions: [], noData: true, cycle })

    const sourceSummary = JSON.stringify({
      sessionDate: lastSessionDate,
      questionTypeIds: selectedTypes.map((item) => item.id),
      adminCount: activeAdminQuestions.length,
      sessionCount: sessionRows.length,
      weaknessCount: weakQuestions.length,
    })

    const createdAttempt = await createHomeworkAttempt({
      studentId,
      subjectId,
      sessionId: (await getSessionByStudentSubjectDate(studentId, subjectId, lastSessionDate).catch(() => null))?.id || "",
      batchKey,
      cycleKey,
      sessionDate: lastSessionDate,
      unlockAt: cycle.unlockAt,
      expireAt: cycle.expireAt,
      cycleIndex: cycle.cycleIndex,
      questions: questions.map(serializeAttemptQuestion),
      sourceSummary,
    })

    return res.status(200).json({
      questions,
      subject: subject.name,
      mode: "attempts",
      cycle,
      cycleKey,
      attemptId: createdAttempt?.id || null,
      attemptStatus: createdAttempt?.status || "Assigned",
    })
  } catch (err) {
    console.error("Homework error:", err)
    return res.status(500).json({ error: "Failed to load homework" })
  }
}
