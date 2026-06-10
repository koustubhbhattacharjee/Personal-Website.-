import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]"
import {
  getStudentById,
  getSubjectById,
  getSubjectsByIds,
  getEnrollment,
  getQuestionsWithScores,
  getQuestionsForStudentContext,
  appendMcqCacheToQuestionPage,
  appendMcqCacheBundleToQuestionPage,
  getTodayInTimezone,
} from "../../../lib/db"
import { generateMCQBundleFromStoredQA, generateMCQFromStoredQA } from "../../../lib/claude"
import { getQuestionCount } from "../../../lib/logic"

const ADMIN_EMAIL = "kbohuastt@gmail.com"
const MAX_SUBJECTS_PER_RUN = 3
const MAX_TYPES_PER_SUBJECT = 12
const MAX_PER_TYPE_DEFAULT = 2

function parsePositiveInt(value, fallback) {
  const n = parseInt(String(value || ""), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function uniqueById(list) {
  const map = new Map()
  for (const item of list || []) {
    if (!item?.id) continue
    if (!map.has(item.id)) map.set(item.id, item)
  }
  return [...map.values()]
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })
  if (req.method !== "POST") return res.status(405).end()

  const isAdmin = (session.user.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase()
  const { subjectId, as: asStudentId } = req.body || {}
  if (asStudentId && !isAdmin) return res.status(403).json({ error: "Forbidden" })

  try {
    const studentId = asStudentId || session.notionStudentId
    const student = await getStudentById(studentId)
    const targetSubjects = subjectId
      ? [await getSubjectById(subjectId)]
      : await getSubjectsByIds((student.subjectIds || []).slice(0, MAX_SUBJECTS_PER_RUN))

    const country = student.country || "International"
    const state = student.state || null
    const today = getTodayInTimezone(student.timezone || "UTC")
    const maxTypes = parsePositiveInt(process.env.STUDENT_LOGIN_CACHE_MAX_TYPES, MAX_TYPES_PER_SUBJECT)
    const maxPerTypeEnv = parsePositiveInt(process.env.STUDENT_LOGIN_CACHE_PER_TYPE, MAX_PER_TYPE_DEFAULT)

    let totalSubjects = 0
    let touchedTypes = 0
    let cached = 0
    let skipped = 0

    for (const subject of targetSubjects) {
      if (!subject?.id || !subject?.dataSourceId) continue
      totalSubjects += 1

      const enrollment = await getEnrollment(studentId, subject.id)
      const duration = enrollment?.duration || 60
      const questionCount = getQuestionCount(duration)
      const maxPerType = Math.min(maxPerTypeEnv, Math.max(1, questionCount))

      const allQuestions = await getQuestionsWithScores(subject.dataSourceId, studentId, subject.id)
      const sessionDates = [...new Set(
        allQuestions
          .map(q => q.dateIntroduced)
          .filter(d => d && d <= today)
      )].sort()
      const latest = sessionDates.at(-1) || null
      const previous = sessionDates.length >= 2 ? sessionDates.at(-2) : null

      const candidates = uniqueById([
        ...allQuestions.filter(q => latest && q.dateIntroduced === latest),
        ...allQuestions.filter(q => previous && q.dateIntroduced === previous),
        ...allQuestions.filter(q => q.weaknessScore > 2),
        ...allQuestions.filter(q => q.hwSourceKind === "admin_hw"),
      ]).slice(0, maxTypes)

      for (const qType of candidates) {
        touchedTypes += 1
        try {
          const loCode = qType.standardCode || ""
          const pool = await getQuestionsForStudentContext(qType.id, country, state, loCode, subject.name)
          const toCache = pool.filter(p => !p.mcq).slice(0, maxPerType)
          for (const qaGroup of chunk(toCache, 3)) {
            try {
              const generated = await generateMCQBundleFromStoredQA(qaGroup, qType.title, subject.name)
              const bundleItems = qaGroup
                .map((qa) => {
                  const found = generated.find((item) => item.qhash === qa.qhash)
                  return found ? { qhash: qa.qhash, mcq: found } : null
                })
                .filter(Boolean)
              const bundled = bundleItems.length > 1
                ? await appendMcqCacheBundleToQuestionPage(qType.id, { country, state, loCode, items: bundleItems })
                : null
              if (bundled) {
                cached += bundleItems.length
                continue
              }
              for (const qa of qaGroup) {
                const found = generated.find((item) => item.qhash === qa.qhash)
                if (!found?.qhash) continue
                await appendMcqCacheToQuestionPage(qType.id, {
                  country,
                  state,
                  loCode,
                  qhash: qa.qhash,
                  mcq: found,
                })
                cached += 1
              }
            } catch {
              for (const qa of qaGroup) {
                const mcq = await generateMCQFromStoredQA(qa, qType.title, subject.name)
                if (mcq && qa.qhash) {
                  await appendMcqCacheToQuestionPage(qType.id, {
                    country,
                    state,
                    loCode,
                    qhash: qa.qhash,
                    mcq,
                  })
                  cached += 1
                }
              }
            }
          }
        } catch (e) {
          skipped += 1
          console.warn("[student-warm-cache] failed for question type:", qType?.id, e.message)
        }
      }
    }

    return res.status(200).json({
      ok: true,
      totalSubjects,
      touchedTypes,
      cached,
      skipped,
    })
  } catch (err) {
    console.error("student warm-cache error", err)
    return res.status(500).json({ error: err.message || "Warm cache failed" })
  }
}
