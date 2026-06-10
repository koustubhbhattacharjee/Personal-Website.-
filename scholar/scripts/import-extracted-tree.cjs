#!/usr/bin/env node
// Import an extracted-question tree (built from a third-party book by
// scripts/build-import.py or by web Claude with full QT context).
//
// Tree shape (per /tmp/build-import.py output):
//   {
//     "version": 2,
//     "source_label": "Barron's AP Physics 1 Premium 2024 (Rideout & Wolf)",
//     "source_type":  "external",
//     "textbook_key": "barrons_ap_phys1_premium_2024",
//     "units": [
//       {
//         "id": "u1", "label": "Unit 1: Kinematics",
//         "question_types": [
//           {
//             "existing_qt_id": "5a8c81d4-...",   // ← absorb into existing QT
//             "title": "...",                       // (informational; not used)
//             "questions": [{...}, ...]
//           },
//           {
//             // OR — new QT (no existing_qt_id present)
//             "label": "Some new skill",
//             "primary_slo": "1.5.A.3",
//             "slo_weights": [...],
//             "aligned_slos": [...],
//             "reinforcement_slos": [...],
//             "questions": [{...}, ...]
//           }
//         ]
//       }
//     ]
//   }
//
// Each question:
//   {
//     "id":              "<stable id within tree>",
//     "label":           "1",                          // printed problem number
//     "question_format": "mcq" | "free_response",
//     "options":         ["(A) ...","(B) ...","(C) ...","(D) ..."],   // mcq only
//     "correct_option":  "(A) ...",                                    // mcq only
//     "ordered_content": [{type:"text",value:"..."}, {type:"image",...}],
//     "source_reference": { textbook_key, worksheet_name, page, section, exercise_ref }
//   }
//
// Usage:
//   node scripts/import-extracted-tree.cjs <tree.json>             # dry-run
//   node scripts/import-extracted-tree.cjs <tree.json> --apply
//
// Idempotency:
//   - We do NOT dedupe across runs. Re-running creates duplicate rows.
//   - The dry-run prints exactly what would be inserted; review first.

const fs = require("fs"), path = require("path"), crypto = require("crypto")

// Match the qhash convention used by import-qt-banks.cjs and the seed-ap-physics-* scripts.
function computeQhash(seed) {
  return crypto.createHash("sha256").update(String(seed || "").trim().toLowerCase()).digest("hex").slice(0, 32)
}
const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1")
  }
}

const APPLY = process.argv.includes("--apply")
const TREE_PATH = process.argv.find((a) => a.endsWith(".json") && !a.startsWith("--"))
if (!TREE_PATH) { console.error("usage: import-extracted-tree.cjs <tree.json> [--apply]"); process.exit(1) }

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !KEY) { console.error("missing Supabase env"); process.exit(1) }

async function rest(method, p, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, {
    method,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${text}`)
  try { return JSON.parse(text) } catch { return text }
}

;(async () => {
  const tree = JSON.parse(fs.readFileSync(TREE_PATH, "utf8"))
  console.log(`Loaded tree: ${tree.source_label}`)
  console.log(`textbook_key: ${tree.textbook_key}`)
  console.log(`units: ${tree.units.length}`)
  let totalQT = 0, totalQ = 0, newQTs = 0, absorbedQTs = 0
  for (const u of tree.units) {
    for (const qt of u.question_types) {
      totalQT++
      if (qt.existing_qt_id) absorbedQTs++; else newQTs++
      totalQ += (qt.questions || []).length
    }
  }
  console.log(`QTs: ${totalQT} (${absorbedQTs} absorb-into-existing · ${newQTs} new) · questions: ${totalQ}`)
  console.log(`mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`)

  // Look up content_bank_id: top-level tree.content_bank_id wins (for all-new
  // trees), otherwise inherit from the first existing QT in the tree.
  let inheritBankId = tree.content_bank_id || null
  if (!inheritBankId) {
    for (const u of tree.units) {
      for (const qt of u.question_types) {
        if (qt.existing_qt_id && !inheritBankId) {
          const got = await rest("GET", `question_types?select=content_bank_id&id=eq.${qt.existing_qt_id}`)
          if (got[0]?.content_bank_id) inheritBankId = got[0].content_bank_id
        }
      }
    }
  }
  if (newQTs > 0 && !inheritBankId) {
    console.error("Cannot create new QTs: tree has no content_bank_id and no existing QTs to inherit from.")
    if (APPLY) process.exit(1)
  }

  // Resolve content_bank → subject → active_overlay → school_sections by section_key,
  // so each new QT gets a school_section_id and shows up in the student cylinders.
  const sectionByKey = new Map()
  if (inheritBankId) {
    const subj = await rest("GET", `subjects?select=id,active_overlay_id&content_bank_id=eq.${inheritBankId}&limit=1`).catch(() => [])
    const overlayId = subj[0]?.active_overlay_id || null
    if (overlayId) {
      const units = await rest("GET", `school_units?select=id&overlay_id=eq.${overlayId}`).catch(() => [])
      const unitIds = (units || []).map((u) => u.id).filter(Boolean)
      if (unitIds.length) {
        const inList = unitIds.map((id) => `"${id}"`).join(",")
        const sections = await rest("GET", `school_sections?select=id,section_key,unit_id&unit_id=in.(${inList})`).catch(() => [])
        for (const s of sections || []) {
          if (s.section_key) sectionByKey.set(String(s.section_key), s.id)
        }
      }
      console.log(`overlay=${overlayId.slice(0, 8)}  resolved ${sectionByKey.size} school_sections`)
    } else {
      console.log("note: subject has no active_overlay_id; new QTs will lack school_section_id")
    }
  }

  for (const u of tree.units) {
    console.log(`\n— ${u.label} —`)
    for (const qt of u.question_types) {
      let qtId = qt.existing_qt_id
      if (!qtId) {
        // Create the QT
        const slo_weights = qt.slo_weights || (qt.primary_slo ? [{ slo: qt.primary_slo, weight: 1.0 }] : [])
        const sectionKey = String(qt.section_ref || "").trim()
        const schoolSectionId = sectionKey ? sectionByKey.get(sectionKey) || null : null
        if (sectionKey && !schoolSectionId) {
          console.log(`  ! no school_section for section_ref="${sectionKey}" — QT will be invisible in cylinders`)
        }
        const newRow = {
          title: qt.label || qt.title,
          unit_label: u.label,
          primary_slo_id: qt.primary_slo,
          aligned_slo_ids: qt.aligned_slos || [],
          reinforcement_slos: qt.reinforcement_slos || [],
          source_label: tree.source_label,
          source_type: tree.source_type,
          source_reference: {
            unit: u.id,
            section_ref: qt.section_ref || "",
            textbook_key: tree.textbook_key,
            source_type: tree.source_type,
          },
          metadata: { slo_weights },
          content_bank_id: inheritBankId,
          school_section_id: schoolSectionId,
          status: "active",
          lo_confidence: qt.lo_confidence || "medium",
        }
        if (APPLY) {
          const ins = await rest("POST", "question_types", newRow)
          qtId = ins[0]?.id
          console.log(`  + new QT created: ${qtId}  ${newRow.title}${schoolSectionId ? `  [section ${sectionKey}]` : ""}`)
        } else {
          console.log(`  + WOULD create new QT: ${newRow.title}${schoolSectionId ? `  [section ${sectionKey} → ${schoolSectionId.slice(0, 8)}]` : "  [no school_section]"}`)
          qtId = "<TBD>"
        }
      } else {
        console.log(`  ⮕ absorb into ${qtId}  (${qt.title || "existing QT"})`)
      }
      // Expand questions: shared_stimulus_set → flatten children, each child
      // gets stem_header_content + a shared stem_group_id so the renderer can
      // group them under one stimulus.
      const flatQs = []
      for (const q of (qt.questions || [])) {
        if (q.kind === "shared_stimulus_set" && Array.isArray(q.children)) {
          const stemGroupId = crypto.randomUUID()
          const stemHeader = Array.isArray(q.stem_header_content) ? q.stem_header_content : []
          const stemText = stemHeader.filter((x) => x?.type === "text").map((x) => x.value).join(" ")
          for (const child of q.children) {
            const childOC = Array.isArray(child.ordered_content) ? child.ordered_content : []
            const merged = [...stemHeader, ...childOC]
            flatQs.push({
              ...child,
              ordered_content: merged,
              stem_group_id: stemGroupId,
              is_stem_child: true,
              stem_header_content: stemHeader,
              stem_source_text: stemText,
              stem_child_label: String(child.label || child.id || ""),
              source_reference: child.source_reference || q.source_reference || null,
            })
          }
        } else {
          flatQs.push(q)
        }
      }

      for (const q of flatQs) {
        const oc = Array.isArray(q.ordered_content) ? q.ordered_content : []
        const stemText = (oc.find((x) => x?.type === "text")?.value || "").toString()
        // qhash seed: for stem children, namespace by stem text + child label so
        // siblings with the same stem don't collide. For MCQ singles, include
        // options.
        const seed = q.is_stem_child
          ? `${q.stem_source_text || ""}\x00${q.stem_child_label || ""}\x00${stemText}`
          : (q.question_format === "mcq"
              ? `${stemText}\n${(q.options || []).join("\n")}`
              : stemText)
        const qhash = computeQhash(seed)
        const row = {
          question_type_id: qtId,
          qhash,
          question_text: stemText,
          question_content: oc,
          question_format: q.question_format || "mcq",
          options: Array.isArray(q.options) ? q.options : [],
          correct_option: q.correct_option || null,
          source_reference: q.source_reference || null,
          source_file: null,
          source_page: q.source_reference?.page || null,
          stem_group_id: q.stem_group_id || null,
          is_stem_child: Boolean(q.is_stem_child),
          stem_header_content: q.stem_header_content || null,
          metadata: {
            label: q.label,
            source_id: q.id,
            classification_confidence: q.confidence ?? null,
            classification_note: q.classification_note || null,
          },
        }
        if (APPLY) {
          // Idempotency: skip if a question with this qhash already exists.
          const existing = await rest("GET", `questions?select=id&qhash=eq.${qhash}&limit=1`)
          if (Array.isArray(existing) && existing.length) {
            console.log(`    = ${q.id}  (already in DB as ${existing[0].id})`)
          } else {
            await rest("POST", "questions", row)
            console.log(`    + ${q.id}${q.is_stem_child ? "  [stem child]" : ""}`)
          }
        } else {
          console.log(`    + WOULD create question: ${q.id}  fmt=${row.question_format}  label=${q.label}  qhash=${qhash.slice(0,8)}${q.is_stem_child ? "  [stem child]" : ""}`)
        }
      }
    }
  }
  console.log(APPLY ? "\nDone." : "\n(dry-run — re-run with --apply)")
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1) })
