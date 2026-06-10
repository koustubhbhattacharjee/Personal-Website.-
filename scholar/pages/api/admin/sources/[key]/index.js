// GET   /api/admin/sources/[key]
// PATCH /api/admin/sources/[key]
//
// GET   → returns the source row plus every QT and question whose
//         source_reference.textbook_key matches. For each question, also
//         flatten image entries from question_content and stem_header_content
//         into a single `image_overlays[]` array the UI can render directly.
//         Overlays come in two shapes (discriminated by `kind`):
//           kind:"pdf"  → page + bbox + url        (existing PDF flow)
//           kind:"epub" → spine_index + dom_index + url + inner_path
//
// PATCH → updates the source row itself, or mutates one image item on a
//         question. The mutation kinds:
//
//   "source"             — update sources row fields
//   "create_bbox"        — append a PDF image item (page + bbox), optionally re-crop
//   "bbox"               — edit an existing PDF image item's bbox
//   "delete_bbox"        — remove an image item by index (works on both shapes)
//   "create_epub_image"  — append an EPUB image item (no bbox; identified by
//                          spine_index + dom_index + inner_path + url)
//   "reorder_images"     — given a permutation, rewrite the image-only
//                          subsequence of question_content / stem_header_content
//
// Auth: admin email gate, like the rest of /api/admin.

import { getServerSession } from "next-auth"
import { authOptions } from "../../../auth/[...nextauth]"
import { supabaseRest, supabaseSelect, supabaseUpdate } from "../../../../../lib/supabase"
import { recropQuestionImage } from "../../../../../lib/recrop-question-image"

const ADMIN_EMAIL = "kbohuastt@gmail.com"

function isImageItem(it) {
  return it && it.type === "image"
}

function flattenImageOverlays(question) {
  const overlays = []
  const pushFrom = (arr, location) => {
    if (!Array.isArray(arr)) return
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i]
      if (!isImageItem(it)) continue
      // Discriminate by shape: an item carrying inner_path/spine_index is an
      // EPUB image; an item carrying page+bbox is a PDF image. The PDF flow
      // (existing) requires both page and bbox; the EPUB flow (new) requires
      // inner_path + spine_index + url. Items missing both are skipped.
      const isEpub =
        typeof it.inner_path === "string" && it.inner_path.length > 0 &&
        Number.isFinite(Number(it.spine_index))
      if (isEpub) {
        overlays.push({
          kind:             "epub",
          location,
          image_index:      i,
          spine_index:      Number(it.spine_index),
          dom_index:        Number.isFinite(Number(it.dom_index)) ? Number(it.dom_index) : null,
          occurrence_index: Number.isFinite(Number(it.occurrence_index)) ? Number(it.occurrence_index) : 0,
          inner_path:       it.inner_path,
          page:             Number.isFinite(Number(it.page)) ? Number(it.page) : null,
          url:              it.url || null,
          alt:              it.alt || "",
          caption:          it.caption || "",
        })
        continue
      }
      const page = Number(it.page)
      const bbox = Array.isArray(it.bbox) && it.bbox.length === 4 ? it.bbox.map(Number) : null
      if (!page || !bbox) continue
      overlays.push({
        kind:        "pdf",
        location,
        image_index: i,
        page,
        bbox,
        url:         it.url || null,
        caption:     it.caption || "",
        alt:         it.alt || "",
      })
    }
  }
  pushFrom(question.question_content,    "question_content")
  pushFrom(question.stem_header_content, "stem_header_content")
  return overlays
}

async function handleGet(req, res, key) {
  // 1. Source row (may not yet exist — accept ghost lookups).
  const sources = await supabaseSelect("sources", {
    select: "id,textbook_key,label,source_type,pdf_url,pdf_storage_key,page_count,metadata,created_at,updated_at",
    filters: { textbook_key: key },
    limit: 1,
  })
  const source = sources[0] || {
    id: null,
    textbook_key: key,
    label: key,
    source_type: "external",
    pdf_url: null,
    pdf_storage_key: null,
    page_count: null,
    metadata: { _ghost: true },
  }

  // 2. QTs whose source_reference.textbook_key matches.
  const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const qtRes = await fetch(
    `${SUPABASE_URL}/rest/v1/question_types?select=id,title,unit_label,primary_slo_id,source_label,source_reference,content_bank_id&source_reference->>textbook_key=eq.${encodeURIComponent(key)}&limit=2000`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  )
  const qts = qtRes.ok ? await qtRes.json() : []

  // 3. Questions whose source_reference.textbook_key matches.
  //    source_reference is real jsonb after migration 019; PostgREST returns
  //    it parsed.
  const qRes = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?select=id,question_type_id,question_text,question_content,stem_header_content,stem_group_id,is_stem_child,metadata,source_reference,question_format&source_reference->>textbook_key=eq.${encodeURIComponent(key)}&limit=5000`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  )
  const questions = qRes.ok ? await qRes.json() : []

  // 4. Decorate each question with flattened image overlays + a short label.
  //
  //    Singleton-master stem shape: only the master row in a stem group
  //    carries stem_header_content. So flattenImageOverlays naturally yields
  //    exactly ONE overlay per stem figure (on the master). Non-master
  //    children contribute only their own question_content overlays — which
  //    is right: a stem child's "secondary image" lives in question_content
  //    and is per-question, not shared.
  //
  //    To make the stem overlay's tag useful (master row's exercise_ref is
  //    one of N children, e.g. "1982B2(b)i" — but conceptually it belongs
  //    to the whole group "1982B2"), we count siblings and strip the
  //    "(part)" suffix so the tag reads e.g. "1982B2 (stem, 4 parts)".
  const siblingCount = new Map()
  for (const q of questions) {
    if (!q.stem_group_id) continue
    siblingCount.set(q.stem_group_id, (siblingCount.get(q.stem_group_id) || 0) + 1)
  }
  const stripPartSuffix = (ref) => String(ref || "").replace(/\s*\([^)]*\)[^()]*$/, "").trim()

  const decorated = questions.map((q) => {
    const overlays = flattenImageOverlays(q)
    for (const o of overlays) {
      if (o.location === "stem_header_content" && q.stem_group_id) {
        o.stem_group_id = q.stem_group_id
        o.is_stem_master = true
        const exRef = q.source_reference?.exercise_ref || ""
        const groupLabel = stripPartSuffix(exRef) || exRef
        const n = siblingCount.get(q.stem_group_id) || 1
        o.tag_label = groupLabel ? `${groupLabel} (stem, ${n} parts)` : `Stem (${n} parts)`
      } else {
        o.tag_label = null  // UI falls back to question_label
      }
    }
    const label = q.metadata?.label || q.metadata?.source_id || q.id.slice(0, 8)
    return {
      id:                q.id,
      question_type_id:  q.question_type_id,
      question_format:   q.question_format,
      label,
      page:              Number(q.source_reference?.page) || null,
      exercise_ref:      q.source_reference?.exercise_ref || "",
      section:           q.source_reference?.section || "",
      stem_group_id:     q.stem_group_id || null,
      is_stem_child:     !!q.is_stem_child,
      preview_text:      String(q.question_text || "").slice(0, 240),
      image_overlays:    overlays,
    }
  })

  // 5. Index QT title by id so the UI can show "Question type: …" tags.
  const qtById = Object.fromEntries(qts.map((qt) => [qt.id, qt]))

  return res.status(200).json({
    source,
    question_types: qts,
    questions: decorated,
    qt_index: qtById,
  })
}

async function handlePatch(req, res, key) {
  const body = req.body && typeof req.body === "object" ? req.body : {}
  const kind = String(body.kind || "")

  if (kind === "source") {
    const patch = body.patch || {}
    const allowed = ["label", "source_type", "pdf_url", "pdf_storage_key", "page_count", "metadata"]
    const cleaned = {}
    for (const k of allowed) if (k in patch) cleaned[k] = patch[k]
    if (!Object.keys(cleaned).length) return res.status(400).json({ error: "No fields to update" })
    const updated = await supabaseUpdate("sources", { textbook_key: key }, cleaned)
    return res.status(200).json({ source: Array.isArray(updated) ? updated[0] : updated })
  }

  if (kind === "create_bbox") {
    // Append a new image item to a question's content array. The Sources tab
    // uses this when an admin draws a fresh rectangle on the PDF for a
    // question that didn't have a bbox yet. If `rehydrate` is true (default)
    // the server also crops the new region and uploads the PNG so the
    // image is immediately viewable; otherwise it stores the bbox bare and
    // the cropper can be run later.
    const qid = String(body.question_id || "")
    const location = String(body.location || "question_content")
    const page = Number(body.page)
    const bbox = Array.isArray(body.bbox) ? body.bbox.map(Number) : null
    const rehydrate = body.rehydrate !== false   // default true
    const caption = String(body.caption || "").trim()
    const alt = String(body.alt || "").trim()
    if (!qid) return res.status(400).json({ error: "question_id required" })
    if (location !== "question_content" && location !== "stem_header_content") {
      return res.status(400).json({ error: "location must be question_content or stem_header_content" })
    }
    if (!Number.isInteger(page) || page < 1) return res.status(400).json({ error: "page must be a positive integer" })
    if (!bbox || bbox.length !== 4 || !bbox.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
      return res.status(400).json({ error: "bbox must be [x0,y0,x1,y1] with each value in [0,1]" })
    }
    if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
      return res.status(400).json({ error: "bbox must satisfy x1>x0 and y1>y0" })
    }

    const rows = await supabaseSelect("questions", {
      select: "id,question_content,stem_header_content",
      filters: { id: qid },
      limit: 1,
    })
    const q = rows[0]
    if (!q) return res.status(404).json({ error: "Question not found" })
    const arr = Array.isArray(q[location]) ? [...q[location]] : []
    const newItem = { type: "image", page, bbox, caption: caption || "", alt: alt || "" }
    arr.push(newItem)
    const newImageIndex = arr.length - 1

    let cropResult = null
    if (rehydrate) {
      const sourceRows = await supabaseSelect("sources", {
        select: "textbook_key,pdf_storage_key",
        filters: { textbook_key: key },
        limit: 1,
      })
      const source = sourceRows[0]
      if (!source?.pdf_storage_key) {
        // Fall back to bare-bbox save; admin can crop later.
        await supabaseUpdate("questions", { id: qid }, { [location]: arr })
        return res.status(200).json({
          ok: true,
          image_index: newImageIndex,
          item: newItem,
          rehydrated: false,
          warning: "Source has no PDF in R2 — bbox saved without cropping.",
        })
      }
      try {
        // Hand the cropper a content array that already has the pending
        // image at its target index, so it patches the right slot.
        const recropped = await recropQuestionImage({
          pdfStorageKey:     source.pdf_storage_key,
          questionId:        qid,
          questionContent:   location === "question_content"   ? arr : q.question_content,
          stemHeaderContent: location === "stem_header_content" ? arr : q.stem_header_content,
          location,
          imageIndex:        newImageIndex,
          bbox,
          textbookKey:       key,
        })
        cropResult = recropped
        const updated = await supabaseUpdate("questions", { id: qid }, { [location]: recropped.arr })
        return res.status(200).json({
          ok: true,
          image_index: newImageIndex,
          item: recropped.arr[newImageIndex],
          rehydrated: true,
          new_url: recropped.url,
          new_storage_key: recropped.storageKey,
          question: Array.isArray(updated) ? updated[0] : updated,
        })
      } catch (e) {
        // Save the bare bbox even if cropping blew up so the admin doesn't
        // lose the rectangle they just drew.
        await supabaseUpdate("questions", { id: qid }, { [location]: arr })
        return res.status(200).json({
          ok: true,
          image_index: newImageIndex,
          item: newItem,
          rehydrated: false,
          warning: "Re-crop failed: " + (e.message || String(e)),
        })
      }
    }

    await supabaseUpdate("questions", { id: qid }, { [location]: arr })
    return res.status(200).json({
      ok: true,
      image_index: newImageIndex,
      item: newItem,
      rehydrated: false,
    })
  }

  if (kind === "create_epub_image") {
    // Append an EPUB image item to a question's content array. Called when
    // an admin clicks an <img> in the rendered spine iframe with a question
    // focused. We trust the click payload because the iframe was rendered
    // from extract-epub-assets.cjs output (and the admin gate is already
    // enforced on this endpoint).
    const qid = String(body.question_id || "")
    const location = String(body.location || "question_content")
    const spineIndex      = Number(body.spine_index)
    const domIndex        = Number.isFinite(Number(body.dom_index)) ? Number(body.dom_index) : null
    const occurrenceIndex = Number.isFinite(Number(body.occurrence_index)) ? Number(body.occurrence_index) : 0
    const innerPath = String(body.inner_path || "").trim()
    const url       = String(body.url || "").trim()
    const alt       = String(body.alt || "").trim()
    const caption   = String(body.caption || "").trim()
    const page      = Number.isFinite(Number(body.page)) ? Number(body.page) : null
    if (!qid) return res.status(400).json({ error: "question_id required" })
    if (location !== "question_content" && location !== "stem_header_content") {
      return res.status(400).json({ error: "location must be question_content or stem_header_content" })
    }
    if (!Number.isInteger(spineIndex) || spineIndex < 0) return res.status(400).json({ error: "spine_index must be a non-negative integer" })
    if (!innerPath) return res.status(400).json({ error: "inner_path required" })
    if (!url) return res.status(400).json({ error: "url required" })

    const rows = await supabaseSelect("questions", {
      select: "id,question_content,stem_header_content",
      filters: { id: qid },
      limit: 1,
    })
    const q = rows[0]
    if (!q) return res.status(404).json({ error: "Question not found" })
    const arr = Array.isArray(q[location]) ? [...q[location]] : []
    const newItem = {
      type: "image",
      // EPUB-shape image item. The (spine_index, dom_index, occurrence_index)
      // triple is the round-tripable address back into the EPUB; url is the
      // R2 location; inner_path keeps the original EPUB-internal name so the
      // image can be re-resolved after a re-extract that changes shas.
      spine_index:      spineIndex,
      dom_index:        domIndex,
      occurrence_index: occurrenceIndex,
      inner_path:       innerPath,
      url,
      alt:     alt || "",
      caption: caption || "",
      page,
    }
    arr.push(newItem)
    const newImageIndex = arr.length - 1
    const updated = await supabaseUpdate("questions", { id: qid }, { [location]: arr })
    return res.status(200).json({
      ok: true,
      image_index: newImageIndex,
      item: newItem,
      question: Array.isArray(updated) ? updated[0] : updated,
    })
  }

  if (kind === "reorder_images") {
    // Reorder the image-only subsequence of a question's content array.
    // Body: { question_id, location, image_indices: [old_idx_in_new_order] }
    //
    // Non-image items (text, etc.) keep their absolute positions; only the
    // image slots get permuted. So if question_content is
    //   [text, IMG_A, text, IMG_B, IMG_C]
    // and image_indices = [2, 0, 1] (meaning "C first, then A, then B"),
    // the result is
    //   [text, IMG_C, text, IMG_A, IMG_B]
    const qid = String(body.question_id || "")
    const location = String(body.location || "question_content")
    const imageIndicesRaw = Array.isArray(body.image_indices) ? body.image_indices : null
    if (!qid) return res.status(400).json({ error: "question_id required" })
    if (location !== "question_content" && location !== "stem_header_content") {
      return res.status(400).json({ error: "location must be question_content or stem_header_content" })
    }
    if (!imageIndicesRaw) return res.status(400).json({ error: "image_indices array required" })
    const imageIndices = imageIndicesRaw.map(Number)
    if (imageIndices.some((n) => !Number.isInteger(n) || n < 0)) {
      return res.status(400).json({ error: "image_indices must be non-negative integers" })
    }

    const rows = await supabaseSelect("questions", {
      select: "id,question_content,stem_header_content",
      filters: { id: qid },
      limit: 1,
    })
    const q = rows[0]
    if (!q) return res.status(404).json({ error: "Question not found" })
    const arr = Array.isArray(q[location]) ? [...q[location]] : []
    // Find image positions in their original order and the image items at
    // those positions. The permutation must reference exactly those indices.
    const imagePositions = []
    const imagesByOriginalIndex = new Map()
    for (let i = 0; i < arr.length; i++) {
      if (isImageItem(arr[i])) {
        imagePositions.push(i)
        imagesByOriginalIndex.set(i, arr[i])
      }
    }
    if (imageIndices.length !== imagePositions.length) {
      return res.status(400).json({ error: `image_indices length ${imageIndices.length} does not match image count ${imagePositions.length}` })
    }
    const sortedNew = [...imageIndices].sort((a, b) => a - b)
    const sortedOrig = [...imagePositions].sort((a, b) => a - b)
    if (sortedNew.some((v, i) => v !== sortedOrig[i])) {
      return res.status(400).json({ error: "image_indices must be a permutation of the existing image positions" })
    }

    // Build the new array: keep non-image items in place; fill image slots
    // (in left-to-right order) from imageIndices.
    const newArr = arr.slice()
    for (let k = 0; k < imagePositions.length; k++) {
      const slot = imagePositions[k]
      const sourceIdx = imageIndices[k]
      newArr[slot] = imagesByOriginalIndex.get(sourceIdx)
    }
    const updated = await supabaseUpdate("questions", { id: qid }, { [location]: newArr })
    return res.status(200).json({
      ok: true,
      question: Array.isArray(updated) ? updated[0] : updated,
    })
  }

  if (kind === "delete_bbox") {
    // Remove a single image item from question_content / stem_header_content.
    // Used by the Sources tab when an admin presses Delete on a selected
    // bbox to drop a mistakenly-tagged figure. We do NOT delete the cropped
    // PNG from R2 — leaving it stranded is cheap, deleting it is risky if
    // another question happens to reference the same sha.
    const qid = String(body.question_id || "")
    const location = String(body.location || "")
    const idx = Number(body.image_index)
    if (!qid) return res.status(400).json({ error: "question_id required" })
    if (location !== "question_content" && location !== "stem_header_content") {
      return res.status(400).json({ error: "location must be question_content or stem_header_content" })
    }
    const rows = await supabaseSelect("questions", {
      select: "id,question_content,stem_header_content",
      filters: { id: qid },
      limit: 1,
    })
    const q = rows[0]
    if (!q) return res.status(404).json({ error: "Question not found" })
    const arr = Array.isArray(q[location]) ? [...q[location]] : []
    const item = arr[idx]
    if (!item || item.type !== "image") {
      return res.status(404).json({ error: `No image at ${location}[${idx}]` })
    }
    arr.splice(idx, 1)
    const patch = { [location]: arr.length ? arr : null }
    const updated = await supabaseUpdate("questions", { id: qid }, patch)
    return res.status(200).json({
      ok: true,
      question: Array.isArray(updated) ? updated[0] : updated,
      deleted: { location, image_index: idx, page: item.page, bbox: item.bbox },
    })
  }

  if (kind === "bbox") {
    const qid = String(body.question_id || "")
    const location = String(body.location || "")
    const idx = Number(body.image_index)
    const bbox = Array.isArray(body.bbox) ? body.bbox.map(Number) : null
    // Optional page change — sent only when the admin drags the bbox across
    // a page boundary in the Sources tab.
    const pageOverride = body.page == null ? null : Number(body.page)
    if (!qid) return res.status(400).json({ error: "question_id required" })
    if (location !== "question_content" && location !== "stem_header_content") {
      return res.status(400).json({ error: "location must be question_content or stem_header_content" })
    }
    if (!bbox || bbox.length !== 4 || !bbox.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
      return res.status(400).json({ error: "bbox must be [x0,y0,x1,y1] with each value in [0,1]" })
    }
    if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
      return res.status(400).json({ error: "bbox must satisfy x1>x0 and y1>y0" })
    }
    if (pageOverride != null && (!Number.isInteger(pageOverride) || pageOverride < 1)) {
      return res.status(400).json({ error: "page must be a positive integer" })
    }

    // Fetch the row, mutate the JSON in memory, write it back.
    const rows = await supabaseSelect("questions", {
      select: "id,question_content,stem_header_content,metadata",
      filters: { id: qid },
      limit: 1,
    })
    const q = rows[0]
    if (!q) return res.status(404).json({ error: "Question not found" })
    const arr = Array.isArray(q[location]) ? [...q[location]] : []
    const item = arr[idx]
    if (!item || item.type !== "image") {
      return res.status(404).json({ error: `No image at ${location}[${idx}]` })
    }

    // Path A: rehydrate=true — re-crop the bbox now using the PDF stored in R2,
    // upload the new PNG, and persist both bbox AND new url in one shot.
    if (body.rehydrate) {
      const sourceRows = await supabaseSelect("sources", {
        select: "textbook_key,pdf_storage_key",
        filters: { textbook_key: key },
        limit: 1,
      })
      const source = sourceRows[0]
      if (!source?.pdf_storage_key) {
        return res.status(409).json({
          error: "Source has no PDF in R2 — upload one before re-cropping.",
          hint: "Map a local PDF in scripts/sources_file_map.json and run scripts/populate-sources.cjs.",
        })
      }
      let recropped
      try {
        recropped = await recropQuestionImage({
          pdfStorageKey:     source.pdf_storage_key,
          questionId:        qid,
          questionContent:   q.question_content,
          stemHeaderContent: q.stem_header_content,
          location,
          imageIndex:        idx,
          bbox,
          pageOverride,
          textbookKey:       key,
        })
      } catch (e) {
        return res.status(500).json({ error: "Re-crop failed: " + (e.message || String(e)) })
      }
      const patch = { [recropped.location]: recropped.arr }
      const updated = await supabaseUpdate("questions", { id: qid }, patch)
      return res.status(200).json({
        ok: true,
        question: Array.isArray(updated) ? updated[0] : updated,
        rehydrated: true,
        new_url: recropped.url,
        new_storage_key: recropped.storageKey,
        cropped_width: recropped.width,
        cropped_height: recropped.height,
      })
    }

    // Path B: just save the bbox (and optionally the page) without re-cropping.
    arr[idx] = {
      ...item,
      bbox,
      ...(pageOverride != null ? { page: pageOverride } : {}),
    }
    const patch = { [location]: arr }
    const updated = await supabaseUpdate("questions", { id: qid }, patch)
    return res.status(200).json({
      ok: true,
      question: Array.isArray(updated) ? updated[0] : updated,
      rehydrated: false,
    })
  }

  return res.status(400).json({ error: `Unknown kind: ${kind}` })
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions)
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: "Unauthorized" })
  }
  const key = String(req.query.key || "").trim()
  if (!key) return res.status(400).json({ error: "key required" })

  try {
    if (req.method === "GET") return await handleGet(req, res, key)
    if (req.method === "PATCH") return await handlePatch(req, res, key)
    res.setHeader("Allow", "GET, PATCH")
    return res.status(405).json({ error: "Method not allowed" })
  } catch (err) {
    console.error("[admin/sources/[key]] failed:", err)
    return res.status(err.status || 500).json({ error: err.message || "Internal error" })
  }
}
