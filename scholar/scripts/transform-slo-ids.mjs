/**
 * Transforms subtopic string arrays in district-taxonomy.js to
 * { id: "LO_CODE.N", text: "..." } objects.
 * Run: node scripts/transform-slo-ids.mjs
 */
import { readFileSync, writeFileSync } from "fs"
import { fileURLToPath } from "url"
import path from "path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const filePath = path.join(__dirname, "../lib/district-taxonomy.js")

const src = readFileSync(filePath, "utf8")
const lines = src.split("\n")
const output = []

let currentLoCode = null
let inSubtopics = false
let subtopicIndex = 0

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]

  // Detect LO code line: `              code: "APPhy1.6.3",`
  // Match `code:` that is followed by a quoted value (not inside a subtopics object — those have `id:`)
  const codeMatch = line.match(/^\s+code:\s+"([^"]+)",?\s*$/)
  if (codeMatch) {
    currentLoCode = codeMatch[1]
    inSubtopics = false
    subtopicIndex = 0
    output.push(line)
    continue
  }

  // Detect start of subtopics array
  const subtopicsStart = line.match(/^(\s+)subtopics:\s*\[\s*$/)
  if (subtopicsStart) {
    inSubtopics = true
    subtopicIndex = 0
    output.push(line)
    continue
  }

  // Inside subtopics array
  if (inSubtopics) {
    // End of array
    if (line.match(/^\s+\]\s*$/)) {
      inSubtopics = false
      output.push(line)
      continue
    }

    // Check if it's already converted (object form starting with `{`)
    if (line.match(/^\s+\{/)) {
      // Already an object — don't touch, just count
      if (line.includes("id:")) subtopicIndex++
      output.push(line)
      continue
    }

    // A string item: `    "text",` or `    "text"`
    const stringMatch = line.match(/^(\s+)"((?:[^"\\]|\\.)*)"\s*(,?)\s*$/)
    if (stringMatch && currentLoCode) {
      const indent = stringMatch[1]
      const text = stringMatch[2]
      const comma = stringMatch[3] || ","
      subtopicIndex++
      const sloId = `${currentLoCode}.${subtopicIndex}`
      output.push(`${indent}{ id: "${sloId}", text: "${text}" }${comma}`)
      continue
    }

    // Multi-line strings or other content — pass through
    output.push(line)
    continue
  }

  output.push(line)
}

const result = output.join("\n")

// Sanity check: count transformed items
const original = (src.match(/^\s+"[^"]+",?\s*$/gm) || []).filter(l => !l.includes("code:") && !l.includes("name:")).length
const converted = (result.match(/\{ id: "/g) || []).length
console.log(`Original subtopic strings: ${original}`)
console.log(`Converted to SLO objects: ${converted}`)

if (converted === 0) {
  console.error("ERROR: Nothing was converted. Aborting write.")
  process.exit(1)
}

writeFileSync(filePath, result, "utf8")
console.log(`Written: ${filePath}`)
