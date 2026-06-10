import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  createHomeworkAttempt,
  createScoreRow,
  formatHwSource,
  getHomeworkAttemptByCycle,
  getQuestionsForStudentContext,
  getQuestionsWithScores,
  getStudentById,
  getSubjectById,
  getTodayInTimezone,
  hasHomeworkAttemptsDB,
  isAdminHomeworkVisible,
  listHomeworkAttempts,
  setHWSource,
  updateHomeworkAttemptExpireAt,
} from "../../../lib/db"
import { buildHomeworkCycle, HOMEWORK_DAILY_COUNT, takeCycledDistinct } from "../../../lib/homework"
import { getPastClassesForStudent, getUpcomingClassesForStudent } from "../../../lib/tutor-calendar"

const ADMIN_EMAIL = "kbohuastt@gmail.com"
const ADMIN_HW_YEAR = "2000"

function mapSessionDateToAdminAnchor(sessionDate) {
  const raw = String(sessionDate || "").trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return `${ADMIN_HW_YEAR}-01-01`
  const [, , month, day] = match
  return `${ADMIN_HW_YEAR}-${month}-${day}`
}

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
    questionKey: picked.qhash || "",
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
    questionKey: question.questionKey || "",
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
    const pool = await getQuestionsForStudentContext(
      qType.id,
      country,
      state,
      qType.standardCode || "",
      subject.name
    ).catch(() => [])
    const cachedPool = pool.filter((p) => p.mcq)
    if (!cachedPool.length) continue
    const picked = cachedPool[(cycleIndex + i) % cachedPool.length]
    const payload = buildQuestionPayloadEntry(qType, picked, lastSessionDate)
    if (payload) questions.push(payload)
  }

  return questions
}

async function ensureHomeworkAttemptForCurrentCycle(studentId, subjectId) {
  const [student, subject] = await Promise.all([
    getStudentById(studentId),
    getSubjectById(subjectId),
  ])
  if (!subject?.dataSourceId) throw new Error("Subject missing data source ID")

  const [allQuestions, pastClasses, upcomingClasses] = await Promise.all([
    getQuestionsWithScores(subject.dataSourceId, studentId, subjectId),
    getPastClassesForStudent(student.name, subject.name, 20).catch(() => []),
    getUpcomingClassesForStudent(student.name, subject.name, 5).catch(() => []),
  ])

  const now = new Date()
  const currentSession = [...pastClasses, ...upcomingClasses]
    .filter((event) => event?.startTime && event?.endTime)
    .find((event) => new Date(event.startTime) <= now && now < new Date(event.endTime))
  const cycle = buildHomeworkCycle({
    lastCompletedSession: pastClasses.at(-1) || null,
    nextSession: currentSession || upcomingClasses[0] || null,
    sessionTimezone: student.timezone || "UTC",
    tutorTimezone: process.env.TUTOR_TIMEZONE || "Asia/Kolkata",
    now,
  })

  if (!cycle.available) {
    throw new Error("No active homework cycle to extend right now.")
  }

  const cycleKey = `${studentId}:${subjectId}:${cycle.sessionDate}:${cycle.cycleIndex}`
  const existingAttempt = await getHomeworkAttemptByCycle(studentId, subjectId, cycleKey)
  if (existingAttempt?.id) {
    return { attempt: existingAttempt, cycle }
  }

  const today = getTodayInTimezone(student.timezone || "UTC")
  const weakQuestions = allQuestions.filter((q) => q.weaknessScore > 2)
  const visibleAdminQuestions = allQuestions.filter(
    (q) => q.hwSourceKind === "admin_hw" &&
      isAdminHomeworkVisible(q.hwSource, student.timezone || "UTC", today)
  )

  let effectiveSessionDate = cycle.sessionDate
  let sessionRows = allQuestions.filter((q) => q.dateIntroduced === effectiveSessionDate)
  let activeAdminQuestions = visibleAdminQuestions.filter((q) => q.hwSessionDate === effectiveSessionDate)

  let stackMap = new Map()
  for (const q of [...weakQuestions, ...sessionRows, ...activeAdminQuestions]) stackMap.set(q.id, q)
  let stack = sortHomeworkStack([...stackMap.values()], effectiveSessionDate, effectiveSessionDate)

  if (!stack.length) {
    const fallbackAdminSessionDate = [...new Set(
      visibleAdminQuestions.map((q) => q.hwSessionDate).filter(Boolean)
    )].sort().at(-1) || ""

    if (fallbackAdminSessionDate) {
      effectiveSessionDate = fallbackAdminSessionDate
      sessionRows = allQuestions.filter((q) => q.dateIntroduced === effectiveSessionDate)
      activeAdminQuestions = visibleAdminQuestions.filter((q) => q.hwSessionDate === effectiveSessionDate)
      stackMap = new Map()
      for (const q of [...weakQuestions, ...sessionRows, ...activeAdminQuestions]) stackMap.set(q.id, q)
      stack = sortHomeworkStack([...stackMap.values()], effectiveSessionDate, effectiveSessionDate)
    }
  }

  if (!stack.length) throw new Error("No homework questions available for the current cycle.")

  const startIndex = cycle.cycleIndex * HOMEWORK_DAILY_COUNT
  const selectedTypes = takeCycledDistinct(stack, startIndex, HOMEWORK_DAILY_COUNT)
  const questions = await generateHomeworkQuestions(selectedTypes, {
    student,
    subject,
    cycleIndex: cycle.cycleIndex,
    lastSessionDate: effectiveSessionDate,
  })
  if (!questions.length) throw new Error("Failed to build homework questions for the current cycle.")

  const sourceSummary = JSON.stringify({
    sessionDate: effectiveSessionDate,
    questionTypeIds: selectedTypes.map((item) => item.id),
  })
  const createdAttempt = await createHomeworkAttempt({
    studentId,
    subjectId,
    batchKey: `${studentId}:${subjectId}:${effectiveSessionDate}`,
    cycleKey,
    sessionDate: effectiveSessionDate,
    unlockAt: cycle.unlockAt,
    expireAt: cycle.expireAt,
    cycleIndex: cycle.cycleIndex,
    questions: questions.map(serializeAttemptQuestion),
    sourceSummary,
  })
  if (!createdAttempt?.id) throw new Error("Failed to create homework attempt for current cycle.")
  return { attempt: createdAttempt, cycle }
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session || (session.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  if (req.method === "GET") {
    const { studentId, subjectId } = req.query
    if (!studentId || !subjectId) return res.status(400).json({ error: "studentId, subjectId required" })
    try {
      const [student, subject] = await Promise.all([
        getStudentById(studentId),
        getSubjectById(subjectId),
      ])
      if (!subject?.dataSourceId) return res.status(400).json({ error: "Subject missing data source ID" })

      const [all, attempts, pastClasses, upcomingClasses] = await Promise.all([
        getQuestionsWithScores(subject.dataSourceId, studentId, subjectId),
        hasHomeworkAttemptsDB() ? listHomeworkAttempts(studentId, subjectId, 12) : Promise.resolve([]),
        getPastClassesForStudent(student.name, subject.name, 20).catch(() => []),
        getUpcomingClassesForStudent(student.name, subject.name, 5).catch(() => []),
      ])
      const questions = all.map(q => ({
        id: q.id,
        title: q.title,
        weaknessScore: q.weaknessScore || 0,
        hwSource: q.hwSource || "",
        hwSourceKind: q.hwSourceKind || "",
        scoreRowId: q.scoreRowId || null,
        dateIntroduced: q.dateIntroduced || null,
        standardCode: q.standardCode || "",
        hwSessionDate: q.hwSessionDate || "",
        hwAssignedAt: q.hwAssignedAt || "",
      }))
      const now = new Date()
      const currentSession = [...pastClasses, ...upcomingClasses]
        .filter((event) => event?.startTime && event?.endTime)
        .find((event) => new Date(event.startTime) <= now && now < new Date(event.endTime))
      const cycle = buildHomeworkCycle({
        lastCompletedSession: pastClasses.at(-1) || null,
        nextSession: currentSession || upcomingClasses[0] || null,
        sessionTimezone: student.timezone || "UTC",
        tutorTimezone: process.env.TUTOR_TIMEZONE || "Asia/Kolkata",
        now,
      })
      return res.status(200).json({
        student: student.name,
        subject: subject.name,
        questions,
        cycle,
        attempts: attempts.map((attempt) => ({
          id: attempt.id,
          title: attempt.title,
          sessionDate: attempt.sessionDate,
          unlockAt: attempt.unlockAt,
          expireAt: attempt.expireAt,
          status: attempt.status,
          score: attempt.score,
          total: attempt.total,
          questionCount: Array.isArray(attempt.questionPayload) ? attempt.questionPayload.length : 0,
        })),
      })
    } catch (e) {
      console.error("[admin/homework] GET error", e)
      return res.status(500).json({ error: e.message || "Failed to load homework data" })
    }
  }

  if (req.method === "POST") {
    const { action, items, sessionDate, attemptId, expireAt, studentId, subjectId } = req.body || {}
    if (!action) {
      return res.status(400).json({ error: "action is required" })
    }

    if (action === "override_expire") {
      if (!expireAt) {
        return res.status(400).json({ error: "expireAt required" })
      }
      try {
        let targetAttemptId = attemptId
        if (!targetAttemptId) {
          if (!studentId || !subjectId) {
            return res.status(400).json({ error: "attemptId or studentId+subjectId required" })
          }
          const ensured = await ensureHomeworkAttemptForCurrentCycle(studentId, subjectId)
          targetAttemptId = ensured.attempt?.id || ""
        }
        const updated = await updateHomeworkAttemptExpireAt(targetAttemptId, expireAt)
        return res.status(200).json({ ok: true, attemptId: targetAttemptId, expireAt, updated })
      } catch (e) {
        console.error("[admin/homework] override_expire error", e)
        return res.status(500).json({ error: e.message || "Failed to update expiry override" })
      }
    }

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: "items[] required for this action" })
    }
    const cleaned = items.filter(Boolean)
    if (!cleaned.length) return res.status(200).json({ updated: 0, created: 0 })

    try {
      if (action === "add") {
        let updated = 0
        let created = 0
        for (const item of cleaned) {
          const scoreRowId = item.scoreRowId || null
          const studentId = item.studentId || null
          const subjectId = item.subjectId || null
          const questionId = item.questionId || null
          const title = item.title || ""
          const standardCode = item.standardCode || ""
          const unit = item.unit || ""
          const source = formatHwSource("admin_hw", {
            assignedAt: new Date().toISOString(),
            sessionDate: sessionDate || "",
          })

          if (scoreRowId) {
            await setHWSource(scoreRowId, source)
            updated++
            continue
          }
          if (!studentId || !subjectId || !questionId || !title) continue

          // Create a new score row for this student×question so homework can reference it.
          const row = await createScoreRow(
            studentId,
            subjectId,
            { id: questionId, title, standardCode, unit },
            mapSessionDateToAdminAnchor(sessionDate),
            source
          )
          if (row?.object === "page") created++
        }
        return res.status(200).json({ updated, created })
      }
      if (action === "remove") {
        const ids = cleaned.map(i => i.scoreRowId).filter(Boolean)
        await Promise.all(ids.map(id => setHWSource(id, "")))
        return res.status(200).json({ updated: ids.length, created: 0 })
      }
      return res.status(400).json({ error: "Unknown action. Use add|remove." })
    } catch (e) {
      console.error("[admin/homework] POST error", e)
      return res.status(500).json({ error: e.message || "Failed to update homework" })
    }
  }

  return res.status(405).end()
}
