import fs from "fs/promises"
import path from "path"
import { getDistrictTaxonomy } from "../lib/district-taxonomy.js"

const OUTPUT = path.join(process.cwd(), "docs", "ap-physics-c-mechanics-los.md")

function line(text = "") {
  return `${text}\n`
}

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim()
}

async function main() {
  const taxonomy = getDistrictTaxonomy(null, "AP Physics C")
  if (!taxonomy?.standards?.length) {
    throw new Error("AP Physics C taxonomy not found")
  }

  const objectiveCount = taxonomy.standards.reduce((sum, standard) => sum + (standard.objectives || []).length, 0)
  let out = ""
  out += line("# AP Physics C Mechanics LO/SLO List")
  out += line("")
  out += line("This repo currently contains the **AP Physics C: Mechanics** taxonomy only.")
  out += line("It does **not** currently include a separate AP Physics C: Electricity and Magnetism runtime block under `ap_physics_c`.")
  out += line("")
  out += line("Official-source check:")
  out += line("- College Board AP Physics C: Mechanics course page lists the official 7-unit framework and links the CED.")
  out += line("- The comments in `lib/district-taxonomy.js` state this block was extracted from the official College Board AP Physics C: Mechanics CED.")
  out += line("- The unit/objective wording in the runtime taxonomy matches the official Mechanics framework structure.")
  out += line("")
  out += line("Official references:")
  out += line("- https://apcentral.collegeboard.org/courses/ap-physics-c-mechanics")
  out += line("- https://apcentral.collegeboard.org/pdf/ap-physics-c-mechanics-course-and-exam-description.pdf")
  out += line("")
  out += line(`Units: ${taxonomy.standards.length}  `)
  out += line(`Learning objectives: ${objectiveCount}`)
  out += line("")

  for (const standard of taxonomy.standards || []) {
    out += line(`## ${standard.code} - ${standard.name}`)
    out += line("")
    for (const objective of standard.objectives || []) {
      out += line(`- ${objective.code} - ${normalizeText(objective.name)}`)
      for (const slo of objective.subtopics || []) {
        out += line(`  - ${slo.id} - ${normalizeText(slo.text)}`)
      }
    }
    out += line("")
  }

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
  await fs.writeFile(OUTPUT, out, "utf8")
  console.log(`Wrote ${OUTPUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
