import fs from "fs";
import path from "path";
import { getDistrictTaxonomy } from "../lib/district-taxonomy.js";

const outPath = path.join(process.cwd(), "docs", "edexcel-9ma0-los.md");
const taxonomy = getDistrictTaxonomy(null, "AS Level Math");
const standards = taxonomy?.standards || [];

const lines = [];
lines.push("# Edexcel 9MA0 Mathematics LO / SLO Reference");
lines.push("");
lines.push("Generated from `lib/district-taxonomy.js`.");
lines.push("");
lines.push("Important:");
lines.push("- This repo's `as level` taxonomy is broader than strict AS-only content.");
lines.push("- It includes Year 1 (`P1`, `P2`, `S1`, `M1`) and later content (`P3`, `S2`, `M2`).");
lines.push("");

let loCount = 0;
let sloCount = 0;
for (const standard of standards) {
  loCount += (standard.objectives || []).length;
  for (const objective of standard.objectives || []) {
    sloCount += (objective.subtopics || []).length;
  }
}

lines.push("Summary:");
lines.push(`- Standards: ${standards.length}`);
lines.push(`- LOs: ${loCount}`);
lines.push(`- SLOs: ${sloCount}`);
lines.push("");

for (const standard of standards) {
  lines.push(`## ${standard.code} — ${standard.name}`);
  lines.push("");
  for (const objective of standard.objectives || []) {
    lines.push(`- ${objective.code} — ${objective.name}`);
    for (const subtopic of objective.subtopics || []) {
      const id = typeof subtopic === "string" ? "" : (subtopic?.id || "");
      const text = typeof subtopic === "string" ? subtopic : (subtopic?.text || "");
      lines.push(`  - ${id} — ${text}`);
    }
  }
  lines.push("");
}

fs.writeFileSync(outPath, lines.join("\n"));
console.log(`Wrote ${outPath}`);
