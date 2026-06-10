import fs from "fs"
import path from "path"

const INPUT = "/home/koustubh/Downloads/sc_lo_mapping.md"
const OUTPUT = path.join(process.cwd(), "data", "south-carolina-precalculus-lo-mapping.json")

function cleanInline(value = "") {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/`/g, "")
    .trim()
}

function parseTableRow(line = "") {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => String(cell || "").trim())
}

function slugFromHeading(text = "") {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

const raw = fs.readFileSync(INPUT, "utf8")
const lines = raw.split(/\r?\n/)

const out = {
  title: "South Carolina Pre-Calculus LO Mapping",
  source_file: INPUT,
  subject: "PreCalculus",
  state: "south_carolina",
  method: "",
  units: [],
  cross_reference: [],
  uncovered_los: [],
}

let currentUnit = null
let currentSection = null
let mode = ""

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i]
  const trimmed = line.trim()
  if (!trimmed) continue

  if (trimmed.startsWith("**Method:**")) {
    out.method = cleanInline(trimmed.replace("**Method:**", ""))
    continue
  }

  if (trimmed.startsWith("## UNIT ")) {
    currentUnit = {
      id: slugFromHeading(trimmed.replace(/^##\s+/, "")),
      label: trimmed.replace(/^##\s+/, "").trim(),
      sections: [],
    }
    out.units.push(currentUnit)
    currentSection = null
    mode = ""
    continue
  }

  if (trimmed.startsWith("### ")) {
    const heading = trimmed.replace(/^###\s+/, "")
    const match = heading.match(/^(.+?)\s+—\s+(.+)$/)
    currentSection = {
      section: match?.[1]?.trim() || heading,
      title: match?.[2]?.trim() || "",
      textbook_content: "",
      alignments: [],
    }
    currentUnit?.sections.push(currentSection)
    mode = ""
    continue
  }

  if (trimmed.startsWith("**Textbook content:**")) {
    if (currentSection) {
      currentSection.textbook_content = cleanInline(trimmed.replace("**Textbook content:**", ""))
    }
    continue
  }

  if (trimmed === "## Complete Cross-Reference Table") {
    mode = "cross_reference"
    currentSection = null
    continue
  }

  if (trimmed === "## SC LOs Not Covered by This Pacing Guide") {
    mode = "uncovered"
    currentSection = null
    continue
  }

  if (trimmed.startsWith("|")) {
    const isDivider = /^\|[-\s|]+\|?$/.test(trimmed)
    if (isDivider) continue

    if (mode === "cross_reference") {
      const [section, topic, primary] = parseTableRow(trimmed)
      if (!section || section === "Section") continue
      out.cross_reference.push({
        section,
        topic,
        primary_lo_codes: primary.split(",").map((part) => part.trim()).filter(Boolean),
      })
      continue
    }

    if (mode === "uncovered") {
      const [name, code, reason] = parseTableRow(trimmed)
      if (!code || code === "Code") continue
      out.uncovered_los.push({ name, code, reason })
      continue
    }

    if (currentSection) {
      const [loNameRaw, code, justification] = parseTableRow(trimmed)
      if (!code || code === "Code") continue
      const cleanName = cleanInline(loNameRaw)
      const kind = /^\*\(.+\)\*$/.test(String(loNameRaw || "").trim()) ? "supporting" : "primary"
      currentSection.alignments.push({
        kind,
        lo_name: cleanName,
        code: cleanInline(code),
        justification: cleanInline(justification),
      })
    }
  }
}

for (const unit of out.units) {
  for (const section of unit.sections) {
    section.primary_alignments = section.alignments.filter((item) => item.kind === "primary")
    section.supporting_alignments = section.alignments.filter((item) => item.kind === "supporting")
    delete section.alignments
  }
}

fs.writeFileSync(OUTPUT, `${JSON.stringify(out, null, 2)}\n`)
console.log(`Wrote ${OUTPUT}`)
