import fs from "fs"
import path from "path"

import { DISTRICT_TAXONOMY } from "../lib/district-taxonomy.js"
import { buildSloIndex, deriveReinforcementLos } from "../lib/slo-utils.js"

const INPUT = "/home/koustubh/Downloads/precalc_full_MCQ_bank.md"
const OUTPUT = path.join(process.cwd(), "data", "south-carolina-precalculus-tagged-question-bank.json")

const SLO_INDEX = buildSloIndex()
const TAXONOMY = DISTRICT_TAXONOMY.south_carolina["precalculus"]

function setRange(map, start, end, value) {
  for (let i = start; i <= end; i += 1) map.set(i, { ...value })
}

const TAG_MAP = new Map()

setRange(TAG_MAP, 1, 5, { lo: "PC.ASE.1", slo: "PC.ASE.1.1", confidence: "low" })
setRange(TAG_MAP, 6, 10, { lo: "PC.AAPR.7", slo: "PC.AAPR.7.2", confidence: "medium" })
setRange(TAG_MAP, 11, 17, { lo: "PC.AREI.11", slo: "PC.AREI.11.1", confidence: "low" })

TAG_MAP.set(18, { lo: "PC.FIF.4", slo: "PC.FIF.4.1", confidence: "high" })
TAG_MAP.set(19, { lo: "PC.FIF.5", slo: "PC.FIF.5.1", confidence: "high" })
TAG_MAP.set(20, { lo: "PC.FIF.4", slo: "PC.FIF.4.1", confidence: "high" })
TAG_MAP.set(21, { lo: "PC.FIF.5", slo: "PC.FIF.5.1", confidence: "high" })
TAG_MAP.set(22, { lo: "PC.FIF.4", slo: "PC.FIF.4.2", confidence: "high" })
TAG_MAP.set(23, { lo: "PC.FIF.4", slo: "PC.FIF.4.2", confidence: "high" })
TAG_MAP.set(24, { lo: "PC.FIF.6", slo: "PC.FIF.6.1", confidence: "high" })
TAG_MAP.set(25, { lo: "PC.FIF.4", slo: "PC.FIF.4.2", confidence: "medium" })
TAG_MAP.set(26, { lo: "PC.FIF.7", slo: "PC.FIF.7.1", confidence: "high" })
TAG_MAP.set(27, { lo: "PC.FIF.7", slo: "PC.FIF.7.1", confidence: "high" })
setRange(TAG_MAP, 28, 30, { lo: "PC.FBF.3", slo: "PC.FBF.3.1", confidence: "high" })
TAG_MAP.set(31, { lo: "PC.FBF.1", slo: "PC.FBF.1.1", confidence: "high" })
TAG_MAP.set(32, { lo: "PC.FBF.1", slo: "PC.FBF.1.1", confidence: "high" })
TAG_MAP.set(33, { lo: "PC.FBF.4", slo: "PC.FBF.4.1", confidence: "high" })
TAG_MAP.set(34, { lo: "PC.FBF.4", slo: "PC.FBF.4.2", confidence: "high" })

TAG_MAP.set(35, { lo: "PC.AAPR.2", slo: "PC.AAPR.2.1", confidence: "high" })
TAG_MAP.set(36, { lo: "PC.AAPR.2", slo: "PC.AAPR.2.1", confidence: "high" })
TAG_MAP.set(37, { lo: "PC.FIF.7", slo: "PC.FIF.7.2", confidence: "high" })
TAG_MAP.set(38, { lo: "PC.FIF.7", slo: "PC.FIF.7.2", confidence: "high" })
setRange(TAG_MAP, 39, 40, { lo: "PC.AREI.11", slo: "PC.AREI.11.1", confidence: "medium" })

TAG_MAP.set(41, { lo: "PC.FLQE.2", slo: "PC.FLQE.2.1", confidence: "high" })
TAG_MAP.set(42, { lo: "PC.FLQE.5", slo: "PC.FLQE.5.1", confidence: "high" })
TAG_MAP.set(43, { lo: "PC.FLQE.4", slo: "PC.FLQE.4.1", confidence: "high" })
TAG_MAP.set(44, { lo: "PC.FIF.7", slo: "PC.FIF.7.4", confidence: "high" })
TAG_MAP.set(45, { lo: "PC.FLQE.4", slo: "PC.FLQE.4.2", confidence: "high" })
TAG_MAP.set(46, { lo: "PC.FBF.5", slo: "PC.FBF.5.2", confidence: "medium" })
TAG_MAP.set(47, { lo: "PC.FLQE.4", slo: "PC.FLQE.4.1", confidence: "high" })
TAG_MAP.set(48, { lo: "PC.FBF.5", slo: "PC.FBF.5.2", confidence: "high" })
TAG_MAP.set(49, { lo: "PC.FLQE.5", slo: "PC.FLQE.5.1", confidence: "high" })
TAG_MAP.set(50, { lo: "PC.FLQE.5", slo: "PC.FLQE.5.1", confidence: "high" })

TAG_MAP.set(51, { lo: "PC.FT.1", slo: "PC.FT.1.1", confidence: "high" })
TAG_MAP.set(52, { lo: "PC.GCI.5", slo: "PC.GCI.5.2", confidence: "high" })
TAG_MAP.set(53, { lo: "PC.FT.2", slo: "PC.FT.2.1", confidence: "high" })
TAG_MAP.set(54, { lo: "PC.FT.4", slo: "PC.FT.4.1", confidence: "high" })
TAG_MAP.set(55, { lo: "PC.FT.3", slo: "PC.FT.3.2", confidence: "high" })
TAG_MAP.set(56, { lo: "PC.FT.8", slo: "PC.FT.8.2", confidence: "high" })
TAG_MAP.set(57, { lo: "PC.FIF.7", slo: "PC.FIF.7.5", confidence: "high" })
TAG_MAP.set(58, { lo: "PC.FT.5", slo: "PC.FT.5.1", confidence: "high" })
TAG_MAP.set(59, { lo: "PC.FIF.7", slo: "PC.FIF.7.5", confidence: "high" })
TAG_MAP.set(60, { lo: "PC.FIF.7", slo: "PC.FIF.7.5", confidence: "high" })
TAG_MAP.set(61, { lo: "PC.FT.6", slo: "PC.FT.6.1", confidence: "high" })
TAG_MAP.set(62, { lo: "PC.FT.7", slo: "PC.FT.7.1", confidence: "high" })
TAG_MAP.set(63, { lo: "PC.GSRT.11", slo: "PC.GSRT.11.1", confidence: "high" })
TAG_MAP.set(64, { lo: "PC.FT.5", slo: "PC.FT.5.1", confidence: "high" })

TAG_MAP.set(65, { lo: "PC.FT.8", slo: "PC.FT.8.1", confidence: "high" })
TAG_MAP.set(66, { lo: "PC.FT.8", slo: "PC.FT.8.1", confidence: "high" })
TAG_MAP.set(67, { lo: "PC.FT.8", slo: "PC.FT.8.1", confidence: "high" })
TAG_MAP.set(68, { lo: "PC.FT.9", slo: "PC.FT.9.1", confidence: "medium" })
TAG_MAP.set(69, { lo: "PC.FT.7", slo: "PC.FT.7.1", confidence: "high" })
TAG_MAP.set(70, { lo: "PC.FT.7", slo: "PC.FT.7.1", confidence: "high" })
TAG_MAP.set(71, { lo: "PC.FT.9", slo: "PC.FT.9.1", confidence: "high" })
TAG_MAP.set(72, { lo: "PC.FT.9", slo: "PC.FT.9.1", confidence: "high" })
TAG_MAP.set(73, { lo: "PC.FT.9", slo: "PC.FT.9.1", confidence: "medium" })
TAG_MAP.set(74, { lo: "PC.FT.9", slo: "PC.FT.9.1", confidence: "medium" })

TAG_MAP.set(75, { lo: "PC.GSRT.10", slo: "PC.GSRT.10.1", confidence: "high" })
TAG_MAP.set(76, { lo: "PC.GSRT.10", slo: "PC.GSRT.10.1", confidence: "high" })
TAG_MAP.set(77, { lo: "PC.NVMQ.2", slo: "PC.NVMQ.2.2", confidence: "high" })
TAG_MAP.set(78, { lo: "PC.NVMQ.4", slo: "PC.NVMQ.4.2", confidence: "high" })
TAG_MAP.set(79, { lo: "PC.NVMQ.4", slo: "PC.NVMQ.4.2", confidence: "medium" })
TAG_MAP.set(80, { lo: "PC.NVMQ.3", slo: "PC.NVMQ.3.2", confidence: "medium" })
TAG_MAP.set(81, { lo: "PC.NCNS.4", slo: "PC.NCNS.4.1", confidence: "high" })
TAG_MAP.set(82, { lo: "PC.NCNS.8", slo: "PC.NCNS.8.1", confidence: "high" })
TAG_MAP.set(83, { lo: "PC.AREI.7", slo: "PC.AREI.7.1", confidence: "high" })

TAG_MAP.set(84, { lo: "PC.AREI.8", slo: "PC.AREI.8.1", confidence: "high" })
TAG_MAP.set(85, { lo: "PC.AREI.9", slo: "PC.AREI.9.1", confidence: "high" })
TAG_MAP.set(86, { lo: "PC.NVMQ.7", slo: "PC.NVMQ.7.1", confidence: "high" })
TAG_MAP.set(87, { lo: "PC.NVMQ.8", slo: "PC.NVMQ.8.1", confidence: "high" })
TAG_MAP.set(88, { lo: "PC.NVMQ.9", slo: "PC.NVMQ.9.2", confidence: "high" })
TAG_MAP.set(89, { lo: "PC.AREI.9", slo: "PC.AREI.9.1", confidence: "high" })
TAG_MAP.set(90, { lo: "PC.NVMQ.11", slo: "PC.NVMQ.11.2", confidence: "high" })

TAG_MAP.set(91, { lo: "PC.GGPE.2", slo: "PC.GGPE.2.1", confidence: "high" })
TAG_MAP.set(92, { lo: "PC.GGPE.2", slo: "PC.GGPE.2.1", confidence: "high" })
TAG_MAP.set(93, { lo: "PC.GGPE.3", slo: "PC.GGPE.3.1", confidence: "high" })
TAG_MAP.set(94, { lo: "PC.GGPE.3", slo: "PC.GGPE.3.1", confidence: "high" })
TAG_MAP.set(95, { lo: "PC.GGPE.3", slo: "PC.GGPE.3.1", confidence: "high" })
TAG_MAP.set(96, { lo: "PC.GGPE.3", slo: "PC.GGPE.3.1", confidence: "medium" })
TAG_MAP.set(97, { lo: "PC.NCNS.4", slo: "PC.NCNS.4.2", confidence: "low" })
TAG_MAP.set(98, { lo: "PC.NCNS.4", slo: "PC.NCNS.4.2", confidence: "low" })
TAG_MAP.set(99, { lo: "PC.FT.5", slo: "PC.FT.5.1", confidence: "low" })
TAG_MAP.set(100, { lo: "PC.FT.5", slo: "PC.FT.5.1", confidence: "low" })

function getLoName(loCode) {
  for (const standard of TAXONOMY.standards || []) {
    for (const lo of standard.objectives || []) {
      if (lo.code === loCode) return lo.name
    }
  }
  return ""
}

function getObjectiveContext(loCode) {
  for (const standard of TAXONOMY.standards || []) {
    const idx = (standard.objectives || []).findIndex((lo) => lo.code === loCode)
    if (idx >= 0) return { standard, index: idx }
  }
  return null
}

function buildReinforcementSlos(loCode, primarySlo) {
  const ctx = getObjectiveContext(loCode)
  if (!ctx) return []
  const candidates = []
  const prev = ctx.standard.objectives?.[ctx.index - 1]
  const next = ctx.standard.objectives?.[ctx.index + 1]
  for (const lo of [prev, next]) {
    const slo = lo?.subtopics?.[0]
    const sloId = slo?.id || ""
    if (sloId && sloId !== primarySlo) candidates.push(sloId)
  }
  const weights = [0.3, 0.2]
  return candidates.slice(0, 2).map((slo_id, idx) => ({ slo_id, weight: weights[idx] }))
}

function decodeHtml(str = "") {
  return String(str || "")
    .replace(/&nbsp;/g, " ")
    .replace(/↔/g, "↔")
    .trim()
}

function parseOptions(line = "") {
  const clean = decodeHtml(line).replace(/\s+/g, " ").trim()
  const matches = [...clean.matchAll(/([A-D])\)\s*(.*?)(?=\s+[A-D]\)\s*|$)/g)]
  return matches.map((m) => m[2].trim())
}

function parseAnswerKey(line = "") {
  const out = new Map()
  const clean = line.replace(/\*\*/g, "")
  for (const match of clean.matchAll(/(\d+)-([A-D])/g)) {
    out.set(Number(match[1]), match[2])
  }
  return out
}

function parseMarkdown(content) {
  const lines = content.split(/\r?\n/)
  const qts = []
  let unit = ""
  let section = ""
  let currentQt = null
  let currentQuestion = null

  function finalizeQuestion() {
    if (!currentQuestion) return
    if (!Array.isArray(currentQt.questions)) currentQt.questions = []
    currentQt.questions.push(currentQuestion)
    currentQuestion = null
  }

  function finalizeQt() {
    finalizeQuestion()
    if (currentQt) qts.push(currentQt)
    currentQt = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith("# UNIT")) {
      finalizeQt()
      unit = line.replace(/^#\s*/, "").trim()
      continue
    }
    if (line.startsWith("## Section")) {
      finalizeQt()
      section = line.replace(/^##\s*/, "").trim()
      continue
    }
    if (line.startsWith("### QT")) {
      finalizeQt()
      const match = line.match(/^### QT\s+(\d+)\s+—\s+(.+)$/)
      currentQt = {
        qtNumber: Number(match?.[1] || 0),
        type: String(match?.[2] || "").trim(),
        unit,
        section,
        questions: [],
      }
      continue
    }
    if (!currentQt) continue
    const qMatch = line.match(/^\*\*(\d+)\.\*\*\s*(.+)$/)
    if (qMatch) {
      finalizeQuestion()
      currentQuestion = {
        questionNumber: Number(qMatch[1]),
        question: qMatch[2].trim(),
        options: [],
      }
      continue
    }
    if (line.startsWith("**Answer Key QT")) {
      finalizeQuestion()
      const answerKey = parseAnswerKey(line)
      for (let idxInQt = 0; idxInQt < currentQt.questions.length; idxInQt += 1) {
        const question = currentQt.questions[idxInQt]
        const letter = answerKey.get(idxInQt + 1) || ""
        const idx = ["A", "B", "C", "D"].indexOf(letter)
        const correctOption = idx >= 0 ? question.options[idx] || "" : ""
        question.correctLetter = letter
        question.correct_option = correctOption
        question.answer = letter ? `${letter}. ${correctOption}` : ""
      }
      continue
    }
    if (currentQuestion && line.includes("A)")) {
      currentQuestion.options = parseOptions(line)
      continue
    }
  }

  finalizeQt()
  return qts
}

function buildQuestionType(qt) {
  const tag = TAG_MAP.get(qt.qtNumber)
  if (!tag) throw new Error(`No tag mapping for QT ${qt.qtNumber}`)
  const sloMeta = SLO_INDEX[tag.slo]
  if (!sloMeta) throw new Error(`Invalid SLO mapping for QT ${qt.qtNumber}: ${tag.slo}`)

  const reinforcementSlos = buildReinforcementSlos(tag.lo, tag.slo)
  const reinforcement = deriveReinforcementLos(reinforcementSlos).map((item) => ({
    code: item.lo_code,
    weight: item.weight,
  }))
  const questions = qt.questions.map((q) => ({
    question_format: "native_mcq",
    question: q.question,
    options: q.options,
    correct_option: q.correct_option,
    answer: q.answer,
    source_reference: {
      source_tier: "reference_book",
      source_name: "Larson Precalculus with Limits, 4th Edition",
      chapter: qt.section.replace(/^Section\s*/, ""),
      generated: false,
    },
    primary_lo: tag.lo,
    primary_slo: tag.slo,
    reinforcement,
    reinforcement_slos: reinforcementSlos,
  }))

  return {
    type: qt.type,
    unit: qt.unit.replace(/^UNIT\s+(\d+)\s+—\s*/i, "Unit $1: "),
    questions,
    primary_lo: tag.lo,
    lo_code: tag.lo,
    lo_name: getLoName(tag.lo),
    lo_confidence: tag.confidence,
    standard_codes: [tag.lo],
    primary_slo: tag.slo,
    reinforcement,
    reinforcement_slos: reinforcementSlos,
  }
}

function main() {
  const content = fs.readFileSync(INPUT, "utf8")
  const parsed = parseMarkdown(content)
  const questionTypes = parsed.map(buildQuestionType)
  const output = {
    subject: "Precalculus Honors",
    source: "markdown_import",
    source_label: "Larson Precalculus with Limits, 4th Edition",
    custom_notes: "South Carolina Precalculus bank generated from textbook MCQ markdown. Official SCDE-aligned taxonomy codes are used. Appendix/review and polar topics are mapped to the nearest available official standard with medium/low confidence where the source material extends beyond the official taxonomy.",
    questionTypes,
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true })
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2), "utf8")
  console.log(JSON.stringify({ output: OUTPUT, questionTypes: questionTypes.length }, null, 2))
}

main()
