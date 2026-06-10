import { getServerSession } from "next-auth"
import { spawn } from "child_process"
import { authOptions } from "../auth/[...nextauth]"
import {
  createWorksheetDraftId,
  saveWorksheetDraft,
  uploadWorksheetDraftBinary,
  worksheetDraftKeys,
  flatGroupsFromTree,
} from "../../../lib/worksheet-drafts"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

export const config = {
  api: {
    bodyParser: { sizeLimit: "30mb" },
  },
}

function requireEnv(name) {
  const value = String(process.env[name] || "").trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

// Run the shared Python cropper. Crops is an array of {id, page, bbox}.
function cropPdfRegions(pdfBase64, crops, dpi = 200) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["scripts/crop_pdf_regions.py"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk.toString() })
    child.stderr.on("data", (chunk) => { stderr += chunk.toString() })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `crop_pdf_regions failed (${code})`))
        return
      }
      try {
        resolve(JSON.parse(stdout || "{}"))
      } catch (err) {
        reject(new Error(`Failed to parse crop_pdf_regions output: ${err.message}`))
      }
    })
    child.stdin.write(JSON.stringify({ pdfBase64, dpi, crops }))
    child.stdin.end()
  })
}

function clean(value) {
  return String(value ?? "").trim()
}

function normalizeBbox(raw) {
  if (!Array.isArray(raw) || raw.length !== 4) return null
  const [x0, y0, x1, y1] = raw.map(Number)
  if (![x0, y0, x1, y1].every((v) => Number.isFinite(v))) return null
  if (x1 <= x0 || y1 <= y0) return null
  return [x0, y0, x1, y1]
}

// Walk the hint tree, assign stable crop IDs, collect the crop requests,
// and return a shadow tree that records where each crop ID lives so we can
// rewrite URLs back in after the Python cropper returns.
function collectCropsFromHint(hint) {
  const units = Array.isArray(hint?.units) ? hint.units : []
  const crops = []
  const shadowUnits = []
  let uIdx = 0
  let qtIdx = 0
  let qIdx = 0
  let itemIdx = 0

  for (const unit of units) {
    uIdx += 1
    const unitId = clean(unit?.id) || `u${uIdx}`
    const shadowQts = []
    const qts = Array.isArray(unit?.question_types) ? unit.question_types : []
    for (const qt of qts) {
      qtIdx += 1
      const qtId = clean(qt?.id) || `qt${qtIdx}`
      const shadowQuestions = []
      const questions = Array.isArray(qt?.questions) ? qt.questions : []
      // Walk one question's ordered_content (or .content) and collect image
      // crops + text items. Shared by parent-stem + each child.
      const collectItems = (q, suffix) => {
        const items = Array.isArray(q?.ordered_content) ? q.ordered_content : (Array.isArray(q?.content) ? q.content : [])
        const shadowItems = []
        for (const item of items) {
          itemIdx += 1
          const type = clean(item?.type).toLowerCase()
          if (type === "text") {
            const value = clean(item?.value || item?.text)
            if (!value) continue
            shadowItems.push({ type: "text", value })
          } else if (type === "image") {
            const presetUrl = clean(item?.url)
            if (presetUrl) {
              shadowItems.push({
                type: "image",
                url: presetUrl,
                caption: clean(item?.caption) || undefined,
                alt: clean(item?.alt) || undefined,
              })
              continue
            }
            const page = Number(item?.page || 0)
            const bbox = normalizeBbox(item?.bbox)
            if (!page || !bbox) continue
            const cropId = `u${uIdx}-qt${qtIdx}-q${qIdx}${suffix}-i${itemIdx}`
            crops.push({ id: cropId, page, bbox })
            shadowItems.push({
              type: "image",
              cropId,
              page,
              bbox,
              caption: clean(item?.caption) || undefined,
              alt: clean(item?.alt) || undefined,
            })
          }
        }
        return shadowItems
      }

      for (const q of questions) {
        qIdx += 1
        const qId = clean(q?.id) || `q${qIdx}`
        const baseKind = clean(q?.kind) || "single_question"
        const format = clean(q?.format || q?.question_format) || "mcq"
        const isStem = !!q?.is_stem && Array.isArray(q?.children) && q.children.length > 0

        if (isStem) {
          const stemItems = collectItems(q, "-stem")
          const stemGroupRef = clean(q?.stem_group_id) || `stem-${uIdx}-${qtIdx}-${qIdx}`
          for (let ci = 0; ci < q.children.length; ci += 1) {
            const child = q.children[ci] || {}
            const childItems = collectItems(child, `-c${ci + 1}`)
            const childFormat = clean(child?.format || child?.question_format) || format
            shadowQuestions.push({
              id: clean(child?.id) || `${qId}-c${ci + 1}`,
              label: clean(child?.label) || `${clean(q?.label) || `Q${qIdx}`}${String.fromCharCode(97 + ci)}`,
              kind: baseKind,
              format: childFormat,
              ambiguous: !!child?.ambiguous,
              confidence: Number.isFinite(Number(child?.confidence)) ? Number(child.confidence) : (Number.isFinite(Number(q?.confidence)) ? Number(q.confidence) : 0.8),
              notes: clean(child?.notes) || clean(q?.notes),
              stem_group_ref: stemGroupRef,
              is_stem_child: true,
              stem_items: stemItems,
              items: childItems,
            })
          }
          continue
        }

        shadowQuestions.push({
          id: qId,
          label: clean(q?.label) || `Q${qIdx}`,
          kind: baseKind,
          format,
          ambiguous: !!q?.ambiguous,
          confidence: Number.isFinite(Number(q?.confidence)) ? Number(q.confidence) : 0.8,
          notes: clean(q?.notes),
          is_stem_child: false,
          stem_items: null,
          items: collectItems(q, ""),
        })
      }
      shadowQts.push({
        id: qtId,
        label: clean(qt?.label) || `QT ${qtIdx}`,
        section_ref: clean(qt?.section_ref),
        primary_slo: clean(qt?.primary_slo) || null,
        notes: clean(qt?.notes),
        questions: shadowQuestions,
      })
    }
    shadowUnits.push({
      id: unitId,
      label: clean(unit?.label) || `Unit ${uIdx}`,
      question_types: shadowQts,
    })
  }

  return { crops, shadowUnits }
}

// Turn the shadow tree + uploaded image URLs into a final groups tree (v2)
// AND a raw-blocks array + sidecar so downstream code (import, review UI) can
// treat this draft the same as an OCR-origin draft.
function buildOutputsFromShadow(shadowUnits, urlByCropId) {
  const rawBlocks = []
  const outUnits = []
  const sidecarBlocks = []
  let blockCounter = 0

  // Hoist crop→url resolution for a single item list so stems + children both use it.
  function resolveItems(items, qId, accOrdered, accAssignments, blockPrefix) {
    for (const item of items) {
      blockCounter += 1
      const blockId = `${blockPrefix || "b"}${blockCounter}`
      if (item.type === "text") {
        rawBlocks.push({
          id: blockId,
          page: 0,
          order: rawBlocks.length + 1,
          kind: "text",
          role: "question",
          groupKey: qId,
          text: item.value,
          confidence: 1,
          bbox: { x: 0, y: 0, w: 1, h: 1 },
          pageImageUrl: "",
        })
        accOrdered.push({ kind: "text", role: "question", text: item.value, source_block_id: blockId })
        accAssignments.push({ source_block_id: blockId, role: "question" })
      } else {
        const url = item.url || urlByCropId.get(item.cropId) || ""
        if (!url) continue
        rawBlocks.push({
          id: blockId,
          page: Number(item.page || 0),
          order: rawBlocks.length + 1,
          kind: "image",
          role: "image",
          groupKey: qId,
          imageUrl: url,
          bbox: item.bbox
            ? { x: item.bbox[0], y: item.bbox[1], w: item.bbox[2] - item.bbox[0], h: item.bbox[3] - item.bbox[1] }
            : { x: 0, y: 0, w: 1, h: 1 },
          pageImageUrl: "",
        })
        const imgItem = { kind: "image", role: "image", url, source_block_id: blockId }
        if (item.caption) imgItem.caption = item.caption
        if (item.alt) imgItem.alt = item.alt
        accOrdered.push(imgItem)
        accAssignments.push({ source_block_id: blockId, role: "image" })
      }
    }
  }

  for (const unit of shadowUnits) {
    const outQts = []
    for (const qt of unit.question_types) {
      const outQuestions = []
      for (const q of qt.questions) {
        const orderedItems = []
        const assignments = []
        const stemOrderedItems = []
        const stemAssignments = []

        if (q.is_stem_child && Array.isArray(q.stem_items) && q.stem_items.length) {
          resolveItems(q.stem_items, q.id, stemOrderedItems, stemAssignments, "s")
          // Stem items come first in the child's rendered ordering
          orderedItems.push(...stemOrderedItems)
          assignments.push(...stemAssignments)
        }

        resolveItems(q.items, q.id, orderedItems, assignments, "b")

        if (!assignments.length) continue
        outQuestions.push({
          id: q.id,
          label: q.label,
          kind: q.kind,
          format: q.format || "mcq",
          ambiguous: q.ambiguous,
          confidence: q.confidence,
          notes: q.notes,
          is_stem_child: !!q.is_stem_child,
          stem_group_ref: q.stem_group_ref || null,
          stem_header_ordered_items: q.is_stem_child ? stemOrderedItems : null,
          assignments,
        })

        sidecarBlocks.push({
          label: q.label,
          raw_text: orderedItems.filter((it) => it.kind === "text").map((it) => `QUESTION: ${it.text}`).join("\n\n"),
          ordered_items: orderedItems,
          images: orderedItems.filter((it) => it.kind === "image" && it.url).map((it) => ({
            url: it.url,
            role: "question_image",
            shared: q.kind === "shared_stimulus_set",
          })),
          source_block_ids: assignments.map((a) => a.source_block_id),
          proto_group_id: q.id,
          proto_group_kind: q.kind || "single_question",
          ambiguous: !!q.ambiguous,
          confidence: q.confidence,
          notes: q.notes,
          unit_id: unit.id,
          unit_label: unit.label,
          qt_id: qt.id,
          qt_label: qt.label,
          qt_section_ref: qt.section_ref || "",
          qt_primary_slo: qt.primary_slo || null,
        })
      }

      if (!outQuestions.length) continue
      outQts.push({
        id: qt.id,
        label: qt.label,
        section_ref: qt.section_ref || "",
        primary_slo: qt.primary_slo || null,
        notes: qt.notes || "",
        questions: outQuestions,
      })
    }

    if (!outQts.length) continue
    outUnits.push({
      id: unit.id,
      label: unit.label,
      question_types: outQts,
    })
  }

  return {
    tree: { version: 2, units: outUnits },
    rawBlocks,
    sidecar: { version: 2, blocks: sidecarBlocks },
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end()

  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: "Unauthorized" })
  if ((session.user?.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return res.status(403).json({ error: "Forbidden" })
  }

  try {
    const {
      studentId,
      subjectId,
      subjectName = "",
      sessionDate = "",
      pdfBase64 = "",
      fileName = "worksheet.pdf",
      sourceLabel = "",
      hint = null,
      dpi = 200,
    } = req.body || {}

    if (!studentId || !subjectId) {
      return res.status(400).json({ error: "studentId and subjectId are required" })
    }
    if (!hint || typeof hint !== "object") {
      return res.status(400).json({ error: "hint (tree-shaped) is required" })
    }
    if (!pdfBase64 && collectCropsFromHint(hint).crops.length) {
      return res.status(400).json({ error: "pdfBase64 is required when the hint references image crops" })
    }

    const bucket = requireEnv("R2_BUCKET")
    const draftId = createWorksheetDraftId()
    const keys = worksheetDraftKeys(studentId, subjectId, draftId)

    if (pdfBase64) {
      await uploadWorksheetDraftBinary({
        bucket,
        studentId,
        subjectId,
        draftId,
        key: `${keys.source}.pdf`,
        body: Buffer.from(pdfBase64, "base64"),
        contentType: "application/pdf",
      })
    }

    const { crops, shadowUnits } = collectCropsFromHint(hint)

    const urlByCropId = new Map()
    const cropErrors = []
    if (crops.length) {
      if (!pdfBase64) throw new Error("hint has image crops but no pdfBase64 was provided")
      const cropped = await cropPdfRegions(pdfBase64, crops, dpi)
      const successes = Array.isArray(cropped?.crops) ? cropped.crops : []
      const errors = Array.isArray(cropped?.errors) ? cropped.errors : []
      cropErrors.push(...errors)

      for (const entry of successes) {
        if (!entry?.pngBase64) continue
        const blockKey = `${keys.prefix}/crops/${entry.id}.png`
        const url = await uploadWorksheetDraftBinary({
          bucket,
          studentId,
          subjectId,
          draftId,
          key: blockKey,
          body: Buffer.from(entry.pngBase64, "base64"),
          contentType: "image/png",
        })
        urlByCropId.set(entry.id, url)
      }
    }

    const { tree, rawBlocks, sidecar } = buildOutputsFromShadow(shadowUnits, urlByCropId)

    const now = new Date().toISOString()
    const manifest = {
      version: 1,
      draftId,
      createdAt: now,
      updatedAt: now,
      status: "sidecar_ready",
      studentId,
      subjectId,
      subjectName,
      sessionDate: sessionDate || "",
      source: {
        fileName,
        fileType: "pdf",
        sourceLabel,
        ocrProvider: "json-hint",
        ocrModel: "bypass",
      },
      counts: {
        pages: 0,
        blocks: rawBlocks.length,
        imageBlocks: rawBlocks.filter((b) => b.kind === "image").length,
        textBlocks: rawBlocks.filter((b) => b.kind === "text").length,
        units: tree.units.length,
        questionTypes: tree.units.reduce((sum, u) => sum + u.question_types.length, 0),
        questions: tree.units.reduce((sum, u) => sum + u.question_types.reduce((s, qt) => s + qt.questions.length, 0), 0),
        cropsRequested: crops.length,
        cropsFailed: cropErrors.length,
      },
      pageImages: [],
      inferenceMode: "json_hint_bypass",
    }

    await saveWorksheetDraft({
      bucket,
      studentId,
      subjectId,
      draftId,
      manifest,
      rawBlocks,
      groups: tree,
      sidecar,
    })

    return res.status(200).json({
      ok: true,
      draftId,
      manifest,
      blocks: rawBlocks,
      tree,
      groups: flatGroupsFromTree(tree),
      sidecar,
      cropErrors,
    })
  } catch (err) {
    console.error("worksheet-json-import error:", err)
    return res.status(500).json({ error: err.message || "JSON-hint import failed" })
  }
}
