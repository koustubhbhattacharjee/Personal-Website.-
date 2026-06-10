// MCQ generation via Claude API
// Sends ALL blocks from a question page so Claude understands full context
// Handles images (vision) and text blocks together

export async function generateMCQFromBlocks(blocks, questionType, subject) {
  const systemPrompt = `You are an expert ${subject} tutor. You will be given the full content of a question page — this may include text, diagrams, and images. There may be multiple questions on the page.

Pick ONE question from the content and generate a multiple-choice version of it.

Respond ONLY with valid JSON — no markdown, no preamble.
Format:
{
  "question": "Full question text here",
  "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
  "correctIndex": 0,
  "explanation": "Why the correct answer is correct.",
  "topic": "${questionType}"
}
Rules:
- correctIndex is 0-3
- Make distractors plausible
- One clearly correct answer
- Appropriate difficulty for exam preparation
- If an image is a diagram supporting a text question, treat them together as one question
- If an image contains multiple questions, pick just one`

  // Build content array with all blocks
  const userContent = []

  for (const block of blocks) {
    if (block.type === "image") {
      try {
        const imgRes = await fetch(block.url)
        const arrayBuffer = await imgRes.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString("base64")
        const contentType = imgRes.headers.get("content-type") || "image/jpeg"
        userContent.push({
          type: "image",
          source: { type: "base64", media_type: contentType, data: base64 }
        })
      } catch {
        // Skip failed images
        console.warn("Failed to fetch image block:", block.url)
      }
    } else if (block.type === "text" && block.text?.trim()) {
      userContent.push({
        type: "text",
        text: block.text
      })
    }
  }

  // Strict mode: no synthetic generation if source content is unavailable
  if (!userContent.length) {
    throw new Error(`No source content available for topic: ${questionType}`)
  } else {
    // Add instruction at the end
    userContent.push({
      type: "text",
      text: `This is ${subject} content about: ${questionType}. Pick one question from the above and generate an MCQ.`
    })
  }

  try {
    const body = {
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }]
    }
    const data = await callClaudeJSON(body)
    console.log("CLAUDE API RESPONSE:", JSON.stringify(data).slice(0, 300))
    const raw = data.content?.[0]?.text || ""
    const payload = extractJsonPayload(raw)
    if (payload) return JSON.parse(payload)

    const retry = await callClaudeJSON({
      ...body,
      messages: [{ role: "user", content: [...userContent, { type: "text", text: "Return ONLY valid JSON. No extra text." }] }]
    })
    const retryRaw = retry.content?.[0]?.text || ""
    const retryPayload = extractJsonPayload(retryRaw)
    if (retryPayload) return JSON.parse(retryPayload)

    await logClaudeFailure("generateMCQFromBlocks", raw || retryRaw)
    throw new Error(`Failed to parse Claude MCQ JSON for topic: ${questionType}`)
  } catch (err) {
    console.error("Claude MCQ generation error:", err)
    await logClaudeFailure("generateMCQFromBlocks:exception", err?.message || String(err))
    throw err
  }
}

// Generate MCQ from a real stored Q/A pair pulled from the question page
// The stored question already has full text + answer — we ask Claude to format it as MCQ
function extractJsonPayload(raw) {
  if (!raw) return null
  const text = raw.replace(/```json|```/g, "").trim()
  const firstObj = text.indexOf("{")
  const lastObj = text.lastIndexOf("}")
  const firstArr = text.indexOf("[")
  const lastArr = text.lastIndexOf("]")

  // Prefer arrays first: bundle responses are JSON arrays containing objects,
  // and slicing from the first "{" to the last "}" produces invalid JSON.
  if (firstArr !== -1 && lastArr !== -1 && lastArr > firstArr) {
    return text.slice(firstArr, lastArr + 1)
  }
  if (firstObj !== -1 && lastObj !== -1 && lastObj > firstObj) {
    return text.slice(firstObj, lastObj + 1)
  }
  return null
}

async function callClaudeJSON(body) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  })
  return res.json()
}

async function logClaudeFailure(context, raw) {
  if (process.env.CLAUDE_DEBUG_LOG !== "1") return
  try {
    const { appendFile } = await import("fs/promises")
    const entry = [
      `\n[${new Date().toISOString()}] ${context}`,
      raw ? raw.slice(0, 4000) : "<empty>",
      "\n---\n"
    ].join("\n")
    await appendFile("/tmp/claude_debug.log", entry, "utf8")
  } catch {
    // ignore logging errors
  }
}

export async function generateMCQFromStoredQA(qa, questionType, subject) {
  const prompt = `You are an expert ${subject} tutor. Below is a real question and its answer from a question bank.

Question: ${qa.question}
Answer: ${qa.answer}

Convert this into a 4-choice multiple choice question. The correct answer must match the given answer exactly (or very closely). Invent 3 plausible but wrong distractors.

Respond ONLY with valid JSON — no markdown, no preamble:
{
  "question": "The question text (keep it exactly as given, cleaned up if needed)",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctIndex": 0,
  "explanation": "Why the correct answer is correct.",
  "topic": "${questionType}"
}

Rules:
- correctIndex is 0–3 (randomise where the correct answer sits)
- Distractors should be plausible for a student who partially understands the topic
- Keep the question text clean and self-contained`

  try {
    const body = {
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }]
    }
    const data = await callClaudeJSON(body)
    const raw = data.content?.[0]?.text || ""
    const payload = extractJsonPayload(raw)
    if (payload) return JSON.parse(payload)

    // Retry once with stronger instruction
    const retryBody = {
      ...body,
      messages: [{
        role: "user",
        content: prompt + "\n\nReturn ONLY valid JSON. No extra text."
      }]
    }
    const retry = await callClaudeJSON(retryBody)
    const retryRaw = retry.content?.[0]?.text || ""
    const retryPayload = extractJsonPayload(retryRaw)
    if (retryPayload) return JSON.parse(retryPayload)

    await logClaudeFailure("generateMCQFromStoredQA", raw || retryRaw)
    throw new Error(`Failed to parse Claude stored-QA JSON for topic: ${questionType}`)
  } catch (err) {
    console.error("generateMCQFromStoredQA error:", err)
    await logClaudeFailure("generateMCQFromStoredQA:exception", err?.message || String(err))
    throw err
  }
}

export async function generateMCQBundleFromStoredQA(qaList, questionType, subject) {
  const normalized = (qaList || [])
    .filter((qa) => qa?.qhash && String(qa?.question || "").trim() && String(qa?.answer || "").trim())
    .map((qa) => ({
      qhash: qa.qhash,
      question: String(qa.question || "").trim(),
      answer: String(qa.answer || "").trim(),
    }))

  if (!normalized.length) return []

  const prompt = `You are an expert ${subject} tutor. Below is a real bundle of question/answer pairs from one question type.

Question type: ${questionType}

Return one MCQ for EACH item, preserving its qhash.

Source items:
${normalized.map((qa, idx) => {
  return [
    `Item ${idx + 1}`,
    `QHASH: ${qa.qhash}`,
    `Question: ${qa.question}`,
    `Answer: ${qa.answer}`,
  ].join("\n")
}).join("\n\n")}

Respond ONLY with valid JSON array — no markdown, no preamble:
[
  {
    "qhash": "original qhash here",
    "question": "The question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Why the correct answer is correct.",
    "topic": "${questionType}"
  }
]

Rules:
- Return one object per source item
- Preserve the qhash exactly
- correctIndex is 0-3
- Distractors should be plausible
- Keep question text clean and self-contained`

  try {
    const body = {
      model: "claude-sonnet-4-6",
      max_tokens: Math.min(6000, 900 + normalized.length * 700),
      messages: [{ role: "user", content: prompt }]
    }
    const data = await callClaudeJSON(body)
    const raw = data.content?.[0]?.text || ""
    const payload = extractJsonPayload(raw)
    let parsed = payload ? JSON.parse(payload) : null

    if (!Array.isArray(parsed)) {
      const retry = await callClaudeJSON({
        ...body,
        messages: [{
          role: "user",
          content: prompt + "\n\nReturn ONLY valid JSON array. No extra text."
        }]
      })
      const retryRaw = retry.content?.[0]?.text || ""
      const retryPayload = extractJsonPayload(retryRaw)
      parsed = retryPayload ? JSON.parse(retryPayload) : null
      if (!Array.isArray(parsed)) {
        await logClaudeFailure("generateMCQBundleFromStoredQA", raw || retryRaw)
        throw new Error(`Failed to parse Claude stored-QA bundle JSON for topic: ${questionType}`)
      }
    }

    const byHash = new Map(normalized.map((qa) => [qa.qhash, qa]))
    return parsed
      .filter((item) => item && byHash.has(String(item.qhash || "").trim()) && Array.isArray(item.options))
      .map((item) => ({
        ...item,
        qhash: String(item.qhash || "").trim(),
      }))
  } catch (err) {
    console.error("generateMCQBundleFromStoredQA error:", err)
    await logClaudeFailure("generateMCQBundleFromStoredQA:exception", err?.message || String(err))
    throw err
  }
}


// Infer the best SLO short code for a question type given the SLO taxonomy.
// Returns a short code string (e.g. "1.1.A.1") or null if Claude can't determine one.
export async function tagQuestionTypesWithSlos(qtTitle, sampleContext, sloTaxonomyString) {
  const prompt = `You are tagging a question type with the most relevant Student Learning Objective (SLO).

Question type title: ${qtTitle}
Sample questions from this type:
${sampleContext || "(no sample questions)"}

Available SLOs (format: CODE — Name):
${sloTaxonomyString}

Return ONLY the exact SLO code (e.g. "1.1.A.1") that best matches this question type.
If no SLO fits well, return the word null.
Do not return any other text.`

  try {
    const data = await callClaudeJSON({
      model: "claude-sonnet-4-6",
      max_tokens: 32,
      messages: [{ role: "user", content: prompt }],
    })
    const raw = (data?.content?.[0]?.text || "").trim()
    if (!raw || raw.toLowerCase() === "null") return null
    return raw
  } catch (err) {
    console.error("tagQuestionTypesWithSlos error:", err)
    return null
  }
}

// Generate all MCQs in a single Claude API call
export async function generateMCQBatch(questionTypes, subject) {
  const list = questionTypes.map((qt, i) => `${i + 1}. ${qt.title}`).join("\n")

  const prompt = `You are an expert ${subject} tutor. Generate one multiple-choice question for EACH of the following ${subject} topics.

Topics:
${list}

Respond ONLY with a JSON array — no markdown, no preamble. Each element:
{
  "question": "Full question text",
  "options": ["A", "B", "C", "D"],
  "correctIndex": 0,
  "explanation": "Why the correct answer is correct.",
  "topic": "exact topic name from the list"
}

Rules:
- One object per topic, in the same order
- correctIndex is 0-3
- Make distractors plausible but clearly wrong
- Appropriate difficulty for exam preparation`

  try {
    const body = {
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }]
    }
    const data = await callClaudeJSON(body)
    console.log("CLAUDE BATCH RESPONSE:", JSON.stringify(data).slice(0, 200))
    const raw = data.content?.[0]?.text || ""
    const payload = extractJsonPayload(raw)
    let parsed = payload ? JSON.parse(payload) : null

    if (!parsed) {
      const retry = await callClaudeJSON({
        ...body,
        messages: [{ role: "user", content: prompt + "\n\nReturn ONLY valid JSON. No extra text." }]
      })
      const retryRaw = retry.content?.[0]?.text || ""
      const retryPayload = extractJsonPayload(retryRaw)
      parsed = retryPayload ? JSON.parse(retryPayload) : null
    }

    if (!parsed) {
      await logClaudeFailure("generateMCQBatch", raw || retryRaw)
      throw new Error("Failed to parse Claude batch JSON.")
    }
    return parsed.map((mcq, i) => ({
      ...mcq,
      notionQuestionId: questionTypes[i].id,
      questionTypeTitle: questionTypes[i].title,
      unit: questionTypes[i].unit || "",
      sourceImage: null,
    }))
  } catch (err) {
    console.error("Claude batch MCQ error:", err)
    await logClaudeFailure("generateMCQBatch:exception", err?.message || String(err))
    throw err
  }
}
