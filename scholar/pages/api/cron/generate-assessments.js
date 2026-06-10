// Vercel Cron Job — runs every hour
// Checks if any class is ~6 hours away and pre-generates assessment questions
// Questions are cached in memory (or you can store in Notion/Redis)

import { getAllStudents } from "../../../lib/db"
import { generateAssessmentQuestions } from "../../../lib/claude"
import { getPreviousClassQuestions, getSubjectById } from "../../../lib/db"

// Simple in-memory cache — replace with Redis/Upstash for production
const questionCache = {}

export default async function handler(req, res) {
  // Verify this is called by Vercel Cron (or your own secret)
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const now = new Date()
  const SIX_HOURS = 6 * 60 * 60 * 1000

  try {
    // Get all students and their subjects
    // Note: you'll need a getAllStudents function in notion.js
    // We iterate and check if class is 6hrs away

    // For each student-subject pair:
    // 1. Check class time
    // 2. If class is 6hrs ± 30min away, generate pre-class questions
    // 3. Cache them keyed by studentId + subjectId + date

    // This is a scaffold — connect to your actual student list
    console.log(`Cron ran at ${now.toISOString()}`)

    return res.status(200).json({
      message: "Cron executed",
      timestamp: now.toISOString(),
      note: "Connect getAllStudents() to trigger pre-generation"
    })

  } catch (err) {
    console.error("Cron error:", err)
    return res.status(500).json({ error: err.message })
  }
}

// Cache helpers — swap these for Upstash Redis in production
export function cacheQuestions(key, questions) {
  questionCache[key] = { questions, generatedAt: Date.now() }
}

export function getCachedQuestions(key) {
  const cached = questionCache[key]
  if (!cached) return null
  // Expire after 8 hours
  if (Date.now() - cached.generatedAt > 8 * 60 * 60 * 1000) return null
  return cached.questions
}

export function buildCacheKey(studentId, subjectId, dateStr) {
  return `${studentId}__${subjectId}__${dateStr}`
}
