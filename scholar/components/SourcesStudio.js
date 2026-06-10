// SourcesStudio.js
//
// Admin section that lists every source PDF tracked in public.sources, lets
// the admin pick one, fetches every question whose
// metadata.source_reference.textbook_key matches, and overlays each question's
// bbox on the PDF as a draggable / resizable blue border.
//
// Data flow:
//   - GET  /api/admin/sources                  → list panel on the left
//   - GET  /api/admin/sources/[key]            → questions + image_overlays
//   - GET  /api/admin/sources/[key]/pdf        → streamed PDF binary
//   - PATCH /api/admin/sources/[key]           → save bbox edits or label edits
//
// PDF.js is dynamically imported so this file is safe at SSR time.
//
// The component is intentionally chunky: the PDF takes most of the screen
// (left: source list, right: PDF + bbox tags). Each bbox carries its
// question label so the admin sees what's tagged where without leaving the
// surface. Drag a corner = resize, drag the body = move. "Save" persists,
// "Save & re-crop" clears the cached image URL so the next hydrate run
// regenerates the PNG.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"

const BORDER_COLOR = "#5b8def"        // saved, unedited
const BORDER_HOVER = "#9ec3ff"
const BORDER_SELECTED = "#ffd45b"
const BORDER_CREATE = "#7ec07e"        // queued create (not yet on server)
const BORDER_EDIT = "#d28a2b"          // queued edit (drag/resize)
const BORDER_DELETE = "#d85a5a"        // queued delete
const HANDLE_SIZE = 9

function clamp01(n) { return Math.max(0, Math.min(1, Number(n) || 0)) }
function clampBbox(bbox) {
  const [x0, y0, x1, y1] = bbox.map(Number)
  return [
    clamp01(Math.min(x0, x1)),
    clamp01(Math.min(y0, y1)),
    clamp01(Math.max(x0, x1)),
    clamp01(Math.max(y0, y1)),
  ]
}

// Stable key for an overlay across renders.
function overlayKey(o) {
  return `${o.question_id}|${o.location}|${o.image_index}`
}

// Compose every overlay across all questions, attaching question metadata
// for tooltip rendering. Stem-master overlays carry a `tag_label` from the
// API ("1982B2 (stem, 4 parts)") so the rectangle is labeled with the
// shared figure's group name rather than the master row's part label.
function flattenAllOverlays(questions) {
  const out = []
  for (const q of questions || []) {
    for (const o of q.image_overlays || []) {
      out.push({
        question_id: q.id,
        question_label: q.label,
        question_text_preview: q.preview_text,
        question_section: q.section,
        question_exercise_ref: q.exercise_ref,
        stem_group_id: o.stem_group_id || q.stem_group_id || null,
        is_stem_master: !!o.is_stem_master,
        tag_label: o.tag_label || null,
        location: o.location,
        image_index: o.image_index,
        page: o.page,
        bbox: o.bbox,
        url: o.url,
        caption: o.caption,
        alt: o.alt,
      })
    }
  }
  return out
}

export default function SourcesStudio({ darkMode = true }) {
  const lm = !darkMode

  const [sources, setSources] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [activeKey, setActiveKey] = useState("")
  const [activeData, setActiveData] = useState(null)   // { source, questions, qt_index }
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [error, setError] = useState("")

  // PDF rendering state
  const [pdfDoc, setPdfDoc] = useState(null)
  const [numPages, setNumPages] = useState(0)
  const [renderScale, setRenderScale] = useState(1.4)
  const [pageRender, setPageRender] = useState({}) // page -> { width, height }
  const [defaultPageSize, setDefaultPageSize] = useState(null) // placeholder size while a page is unrendered
  const pageContainerRefs = useRef({})
  // Lazy-render plumbing: queue pages as they scroll into view, render up to
  // MAX_CONCURRENT at a time, and skip pages we've already drawn.
  const renderQueueRef = useRef(new Set())
  const renderingRef = useRef(new Set())
  const MAX_CONCURRENT = 3

  // Overlay editing state
  const [overlays, setOverlays] = useState([])  // local working copy
  // dirty queues every pending change. One entry per overlay key, shape:
  //   { kind: "edit",   bbox, page?, pageChanged? }
  //   { kind: "create", bbox, page }     // never been to the server
  //   { kind: "delete" }                 // server overlay, mark for removal
  // Drag/draw/delete each just write into this map; flushAll() is what
  // actually talks to the server (in parallel batches).
  const [dirty, setDirty] = useState(new Map())
  const [selectedKey, setSelectedKey] = useState("")
  const [hideBbox, setHideBbox] = useState(false)
  // Global flush state. saveProgress = {done, total} while in flight.
  const [savingAll, setSavingAll] = useState(false)
  const [saveProgress, setSaveProgress] = useState({ done: 0, total: 0 })
  const [pageFilter, setPageFilter] = useState("")
  const [showAllPages, setShowAllPages] = useState(false) // default: only pages with overlays
  // Counter for synthetic image_index on unsaved creates (negative; server
  // assigns the real index when the create lands).
  const localCreateCounterRef = useRef(0)

  // Right panel: question navigator + bbox creation. focusedQuestionId is the
  // question a NEW click-drawn bbox will attach to. newBboxLocation toggles
  // whether the next drawn bbox attaches to question_content (the per-question
  // figure) or stem_header_content (the shared stem figure for all children of
  // a stem group). The server accepts both; only the UI default is here.
  const [focusedQuestionId, setFocusedQuestionId] = useState("")
  const [newBboxLocation, setNewBboxLocation] = useState("question_content")
  // creatingBbox kept as a no-op alias so any rendering that referenced it
  // doesn't crash; create flow no longer hits the network until Save changes.
  const creatingBbox = false
  // Hide pageless rows (questions whose source_reference.page is null) by
  // default — they can't be navigated to and tend to be data-soup ghosts
  // that got swept into a source via QT-level textbook_key tagging.
  const [hidePageless, setHidePageless] = useState(true)
  // While the user click-drags a new bbox, this tracks the in-flight rectangle
  // in pixel coords (within a page container) so we can render the preview.
  const drawRef = useRef(null)
  const [drawTick, setDrawTick] = useState(0)  // forces re-render during drag

  // ── EPUB mode state ─────────────────────────────────────────────────────
  // EPUB sources don't have a PDF; they have a precomputed spine of HTML
  // chapters hosted on R2 (see scripts/extract-epub-assets.cjs). The center
  // pane swaps to an iframe of the selected chapter, and clicking <img>s in
  // the iframe sends a postMessage that attaches the image to the focused
  // question. There's no "queue & flush" model here — EPUB image edits are
  // just array mutations on questions.question_content (no expensive crop),
  // so they save immediately.
  const [selectedSpineIndex, setSelectedSpineIndex] = useState(0)
  const [epubBusy, setEpubBusy] = useState("")    // human-readable in-flight tag
  // dragImageIdx: while reordering thumbnails on the focused question's
  // image strip, this holds the source index (within image_indices) so we
  // know what's being dragged when the drop fires.
  const [dragImageIdx, setDragImageIdx] = useState(null)

  // ── Fetch source list ──────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    setLoadingList(true)
    fetch("/api/admin/sources")
      .then((r) => r.json())
      .then((j) => { if (alive) setSources(j.sources || []) })
      .catch((e) => { if (alive) setError(e.message || "Failed to load sources") })
      .finally(() => { if (alive) setLoadingList(false) })
    return () => { alive = false }
  }, [])

  // ── Fetch detail for a single source ───────────────────────────────────
  const loadSource = useCallback(async (key) => {
    if (!key) return
    setActiveKey(key)
    setActiveData(null)
    setOverlays([])
    setDirty(new Map())
    setSelectedKey("")
    setPdfDoc(null)
    setNumPages(0)
    setLoadingDetail(true)
    setError("")
    try {
      const res = await fetch(`/api/admin/sources/${encodeURIComponent(key)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to load source detail")
      setActiveData(data)
      setOverlays(flattenAllOverlays(data.questions))
    } catch (e) {
      setError(e.message || "Failed to load source detail")
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  // ── Fetch + render PDF when source changes ─────────────────────────────
  useEffect(() => {
    if (!activeKey || !activeData?.source?.pdf_storage_key) return
    let cancelled = false
    ;(async () => {
      try {
        const pdfjs = await import("pdfjs-dist")
        // Worker. Use the bundled worker shipped in the package — we serve it
        // from the public CDN as a fallback so we don't have to copy it into
        // /public.
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc =
            `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
        }
        // The /pdf endpoint either streams from R2 or 302-redirects to R2's
        // public URL. We don't pass `credentials` because the redirect target
        // is cross-origin and CORS-with-credentials would just break the
        // browser's CORS check. Same-origin auth was enforced on the original
        // request before the redirect.
        const url = `/api/admin/sources/${encodeURIComponent(activeKey)}/pdf`
        const buf = await fetch(url).then((r) => {
          if (!r.ok) throw new Error("PDF fetch failed: " + r.status)
          return r.arrayBuffer()
        })
        if (cancelled) return
        const doc = await pdfjs.getDocument({ data: buf }).promise
        if (cancelled) { try { doc.destroy() } catch {} ; return }
        setPdfDoc(doc)
        setNumPages(doc.numPages)
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load PDF")
      }
    })()
    return () => {
      cancelled = true
      setPdfDoc(null)
      setNumPages(0)
      setPageRender({})
      setDefaultPageSize(null)
      renderQueueRef.current.clear()
      renderingRef.current.clear()
    }
  }, [activeKey, activeData?.source?.pdf_storage_key])

  // ── Compute placeholder page size from page 1 (so unrendered pages take up
  //     the right amount of scroll space and the layout doesn't jump). PDFs
  //     in the wild are mostly uniform, so one viewport is a fine proxy.
  useEffect(() => {
    if (!pdfDoc) return
    let cancelled = false
    pdfDoc.getPage(1).then((page) => {
      if (cancelled) return
      const vp = page.getViewport({ scale: renderScale })
      setDefaultPageSize({ width: vp.width, height: vp.height })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [pdfDoc, renderScale])

  // ── Lazy renderer: drain a queue of pages with bounded concurrency. Pages
  //     get into the queue from an IntersectionObserver below.
  const pumpRenderQueue = useCallback(() => {
    if (!pdfDoc) return
    while (
      renderingRef.current.size < MAX_CONCURRENT &&
      renderQueueRef.current.size > 0
    ) {
      const next = renderQueueRef.current.values().next().value
      renderQueueRef.current.delete(next)
      if (pageRender[next]) continue
      if (renderingRef.current.has(next)) continue
      renderingRef.current.add(next)
      ;(async () => {
        try {
          const page = await pdfDoc.getPage(next)
          const viewport = page.getViewport({ scale: renderScale })
          const canvas = document.getElementById(`src-pdf-page-${next}`)
          if (!canvas) return
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext("2d")
          await page.render({ canvasContext: ctx, viewport }).promise
          setPageRender((m) => ({ ...m, [next]: { width: viewport.width, height: viewport.height } }))
        } catch (e) {
          // Render errors (cancelled, page not found, etc.) — silently skip
          // so one bad page doesn't kill the rest.
        } finally {
          renderingRef.current.delete(next)
          pumpRenderQueue()
        }
      })()
    }
  }, [pdfDoc, renderScale, pageRender])

  // When zoom changes, throw away rendered pages and re-render the visible
  // ones via the IntersectionObserver below.
  useEffect(() => {
    if (!pdfDoc) return
    setPageRender({})
    renderQueueRef.current.clear()
    // renderingRef in-flight tasks will finish, but their setPageRender writes
    // are stale-checked by the queue (skipped if no longer needed).
  }, [renderScale, pdfDoc])

  // ── Pageset helpers ────────────────────────────────────────────────────
  const pagesWithOverlays = useMemo(() => {
    const set = new Set()
    for (const o of overlays) set.add(o.page)
    return [...set].sort((a, b) => a - b)
  }, [overlays])

  const overlaysByPage = useMemo(() => {
    const m = new Map()
    for (const o of overlays) {
      const arr = m.get(o.page) || []
      arr.push(o)
      m.set(o.page, arr)
    }
    return m
  }, [overlays])

  // Every page that has a *question* tied to this source — derived from
  // each question's source_reference.page. This is the canonical "in-scope"
  // set: a question without a bbox should still be reachable by clicking
  // its row in the right panel, otherwise scrollIntoView no-ops because the
  // page container isn't mounted.
  const pagesWithQuestions = useMemo(() => {
    const set = new Set()
    for (const q of activeData?.questions || []) {
      if (q.page) set.add(Number(q.page))
    }
    for (const p of pagesWithOverlays) set.add(p)
    return [...set].sort((a, b) => a - b)
  }, [activeData?.questions, pagesWithOverlays])

  // Which pages do we mount canvases for? Default = every page that has a
  // question or a bbox PLUS its ±NEIGHBOR_RADIUS neighbors, so admins can
  // scroll into the surrounding pages for context. The "Show all pages"
  // toggle reveals everything; the page-filter input narrows further.
  const NEIGHBOR_RADIUS = 2
  const pagesToShow = useMemo(() => {
    let base
    if (showAllPages) {
      base = Array.from({ length: numPages }, (_, i) => i + 1)
    } else {
      const set = new Set()
      for (const p of pagesWithQuestions) {
        for (let d = -NEIGHBOR_RADIUS; d <= NEIGHBOR_RADIUS; d++) {
          const np = p + d
          if (np >= 1 && np <= (numPages || Number.MAX_SAFE_INTEGER)) set.add(np)
        }
      }
      base = [...set].sort((a, b) => a - b)
    }
    if (pageFilter) base = base.filter((p) => String(p).includes(pageFilter))
    return base
  }, [showAllPages, numPages, pagesWithQuestions, pageFilter])

  // ── Right-panel question list: sorted by page, then exercise_ref/label ─
  // Each entry exposes a bbox-status badge so admins can spot "this question
  // has no image yet — go draw one" at a glance. Stem masters get a special
  // tag because their image is shared.
  const questionsByPage = useMemo(() => {
    let list = (activeData?.questions || []).map((q) => {
      const overlayCount = (q.image_overlays || []).length
      const stemHeaderImg = (q.image_overlays || []).some((o) => o.location === "stem_header_content")
      return {
        ...q,
        overlay_count: overlayCount,
        has_stem_image: stemHeaderImg,
      }
    })
    if (hidePageless) {
      list = list.filter((q) => q.page)
    }
    list.sort((a, b) => {
      if ((a.page || 0) !== (b.page || 0)) return (a.page || 0) - (b.page || 0)
      const ar = String(a.exercise_ref || a.label || ""), br = String(b.exercise_ref || b.label || "")
      return ar.localeCompare(br, undefined, { numeric: true, sensitivity: "base" })
    })
    return list
  }, [activeData?.questions, hidePageless])

  // Count of pageless rows we're hiding, so we can surface "N hidden" in the panel.
  const pagelessCount = useMemo(() => {
    return (activeData?.questions || []).filter((q) => !q.page).length
  }, [activeData?.questions])

  // ── EPUB helpers ───────────────────────────────────────────────────────
  // True for sources whose extract-epub-assets script has run (the script
  // sets metadata.epub_format=true on the sources row). The PDF rendering
  // path is skipped for these and the iframe path takes over.
  const isEpub = !!activeData?.source?.metadata?.epub_format
  const epubSpine = useMemo(() => (
    Array.isArray(activeData?.source?.metadata?.epub_spine) ? activeData.source.metadata.epub_spine : []
  ), [activeData?.source?.metadata?.epub_spine])
  // Spine entries that have at least one image — the only ones worth showing
  // in the chapter dropdown for image-attaching purposes. We keep the full
  // spine around in case we want to surface "all chapters" later.
  const epubSpineWithImages = useMemo(() => epubSpine.filter((s) => (s?.image_count || 0) > 0), [epubSpine])

  // The full question object for the currently focused question, so the
  // EPUB image strip can render its current image_overlays without
  // re-fetching.
  const focusedQuestion = useMemo(() => {
    if (!focusedQuestionId) return null
    return (activeData?.questions || []).find((q) => q.id === focusedQuestionId) || null
  }, [focusedQuestionId, activeData?.questions])

  // Replace the focused question's overlays/content locally after a server
  // mutation so the UI updates without a full re-fetch. We update both
  // questions[].image_overlays (used for the right-pane badges + the strip)
  // and overlays (the flattened state used by the PDF overlay renderer).
  const applyQuestionPatch = useCallback((qid, fields) => {
    setActiveData((prev) => {
      if (!prev) return prev
      const next = { ...prev, questions: prev.questions.map((q) => {
        if (q.id !== qid) return q
        return { ...q, ...fields }
      }) }
      return next
    })
  }, [])

  // Re-flatten overlays from a single question's content arrays (used after
  // EPUB mutations). This mirrors the API's flattenImageOverlays helper but
  // runs client-side because the server already returned a fresh row.
  const reflattenOverlaysForQuestion = useCallback((q) => {
    const out = []
    const pushFrom = (arr, location) => {
      if (!Array.isArray(arr)) return
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i]
        if (!it || it.type !== "image") continue
        const isEpubItem = typeof it.inner_path === "string" && Number.isFinite(Number(it.spine_index))
        if (isEpubItem) {
          out.push({
            kind: "epub", location, image_index: i,
            spine_index: Number(it.spine_index),
            dom_index: Number.isFinite(Number(it.dom_index)) ? Number(it.dom_index) : null,
            occurrence_index: Number.isFinite(Number(it.occurrence_index)) ? Number(it.occurrence_index) : 0,
            inner_path: it.inner_path,
            page: Number.isFinite(Number(it.page)) ? Number(it.page) : null,
            url: it.url || null,
            alt: it.alt || "", caption: it.caption || "",
          })
          continue
        }
        const page = Number(it.page)
        const bbox = Array.isArray(it.bbox) && it.bbox.length === 4 ? it.bbox.map(Number) : null
        if (!page || !bbox) continue
        out.push({ kind: "pdf", location, image_index: i, page, bbox, url: it.url || null, caption: it.caption || "", alt: it.alt || "" })
      }
    }
    pushFrom(q.question_content, "question_content")
    pushFrom(q.stem_header_content, "stem_header_content")
    return out
  }, [])

  // POST a create_epub_image to the server, then merge the returned question
  // row back into activeData. Called when an admin clicks an <img> in the
  // spine iframe with a question focused.
  const attachEpubImage = useCallback(async (payload) => {
    if (!focusedQuestionId || !activeKey) return
    setEpubBusy("attaching image…")
    try {
      const res = await fetch(`/api/admin/sources/${encodeURIComponent(activeKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "create_epub_image",
          question_id: focusedQuestionId,
          location: "question_content",
          spine_index: payload.spine_index,
          dom_index: payload.dom_index,
          occurrence_index: payload.occurrence_index,
          inner_path: payload.inner_path,
          url: payload.url,
          alt: payload.alt || "",
          page: payload.page ?? null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `attach failed: ${res.status}`)
      // Patch the question with the returned row so the strip refreshes.
      const returnedRow = data.question
      if (returnedRow) {
        const overlays = reflattenOverlaysForQuestion(returnedRow)
        applyQuestionPatch(focusedQuestionId, {
          question_content:    returnedRow.question_content,
          stem_header_content: returnedRow.stem_header_content,
          image_overlays:      overlays,
        })
      }
    } catch (e) {
      setError(e.message || "attach failed")
    } finally {
      setEpubBusy("")
    }
  }, [focusedQuestionId, activeKey, applyQuestionPatch, reflattenOverlaysForQuestion])

  const deleteEpubImage = useCallback(async (qid, location, imageIndex) => {
    if (!activeKey) return
    setEpubBusy("removing image…")
    try {
      const res = await fetch(`/api/admin/sources/${encodeURIComponent(activeKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "delete_bbox", question_id: qid, location, image_index: imageIndex }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `delete failed: ${res.status}`)
      const returnedRow = data.question
      if (returnedRow) {
        const overlays = reflattenOverlaysForQuestion(returnedRow)
        applyQuestionPatch(qid, {
          question_content:    returnedRow.question_content,
          stem_header_content: returnedRow.stem_header_content,
          image_overlays:      overlays,
        })
      }
    } catch (e) {
      setError(e.message || "delete failed")
    } finally {
      setEpubBusy("")
    }
  }, [activeKey, applyQuestionPatch, reflattenOverlaysForQuestion])

  // Reorder the focused question's images. `from` and `to` are indices into
  // the image-only subsequence on this question's question_content. We
  // translate them into the absolute image_index permutation the server
  // expects (kind:"reorder_images").
  const reorderFocusedQuestionImages = useCallback(async (from, to) => {
    if (!focusedQuestion || !activeKey) return
    if (from === to) return
    const arr = Array.isArray(focusedQuestion.question_content) ? focusedQuestion.question_content : []
    const imagePositions = []
    for (let i = 0; i < arr.length; i++) {
      if (arr[i]?.type === "image") imagePositions.push(i)
    }
    if (from < 0 || from >= imagePositions.length || to < 0 || to >= imagePositions.length) return
    // Permute imagePositions to get the new "image_indices" payload: at slot
    // k we want the image that was at original-position permuted[k]. So we
    // build the permuted list by picking up `from` and dropping it at `to`.
    const permuted = imagePositions.slice()
    const moved = permuted.splice(from, 1)[0]
    permuted.splice(to, 0, moved)
    setEpubBusy("reordering…")
    try {
      const res = await fetch(`/api/admin/sources/${encodeURIComponent(activeKey)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "reorder_images",
          question_id: focusedQuestion.id,
          location: "question_content",
          image_indices: permuted,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `reorder failed: ${res.status}`)
      const returnedRow = data.question
      if (returnedRow) {
        const overlays = reflattenOverlaysForQuestion(returnedRow)
        applyQuestionPatch(focusedQuestion.id, {
          question_content:    returnedRow.question_content,
          stem_header_content: returnedRow.stem_header_content,
          image_overlays:      overlays,
        })
      }
    } catch (e) {
      setError(e.message || "reorder failed")
    } finally {
      setEpubBusy("")
    }
  }, [focusedQuestion, activeKey, applyQuestionPatch, reflattenOverlaysForQuestion])

  // ── postMessage listener for spine iframe clicks ────────────────────────
  useEffect(() => {
    if (!isEpub) return
    function onMessage(ev) {
      const msg = ev?.data
      if (!msg || msg.type !== "epub-image-click") return
      // Spine HTML lives on R2 (cross-origin); we trust the message because
      // its payload only addresses content inside the source we asked for —
      // the API will validate question_id existence anyway.
      attachEpubImage({
        spine_index:      Number(msg.spine_index),
        dom_index:        Number.isFinite(Number(msg.dom_index)) ? Number(msg.dom_index) : null,
        occurrence_index: Number.isFinite(Number(msg.occurrence_index)) ? Number(msg.occurrence_index) : 0,
        inner_path:       String(msg.inner_path || ""),
        url:              String(msg.url || ""),
        alt:              String(msg.alt || ""),
        page:             Number.isFinite(Number(msg.page)) ? Number(msg.page) : null,
      })
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [isEpub, attachEpubImage])

  // Default the spine selection to the first chapter that actually contains
  // images when a fresh EPUB source loads.
  useEffect(() => {
    if (!isEpub) return
    if (!epubSpineWithImages.length) return
    setSelectedSpineIndex(epubSpineWithImages[0].index)
  }, [isEpub, epubSpineWithImages, activeKey])

  // Scroll a target page's container into view in the PDF panel. If the
  // page isn't currently mounted (very high page number, or "Show all
  // pages" is off and this page is outside the question set), surface a
  // hint instead of silently no-op'ing.
  const scrollToPage = useCallback((page) => {
    if (!page) {
      setError("This question has no page number. Run scripts/backfill-workbook-mcq-pages.cjs (or set source_reference.page on the question).")
      return
    }
    const el = pageContainerRefs.current[page]
    if (!el) {
      setError(`Page ${page} isn't currently mounted. Toggle "Show all pages" to load every page in the PDF.`)
      return
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [])

  // ── New-bbox drawing: click-drag-release on a page canvas while a question
  //     is focused creates a fresh image item on that question. We attach
  //     pointerdown to the canvas (which sits behind the bbox overlays) so
  //     clicks on existing bboxes still hit the move/resize path, while
  //     clicks on empty page area start drawing.
  const onDrawStart = useCallback((e, page) => {
    if (!focusedQuestionId) return
    if (e.button !== 0) return
    const meta = pageRender[page]
    const containerEl = pageContainerRefs.current[page]
    if (!meta || !containerEl) return
    const rect = containerEl.getBoundingClientRect()
    drawRef.current = {
      page,
      pageWidth:  meta.width,
      pageHeight: meta.height,
      pageLeft:   rect.left,
      pageTop:    rect.top,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      currentX: e.clientX - rect.left,
      currentY: e.clientY - rect.top,
    }
    setDrawTick((t) => t + 1)
    e.preventDefault()
    e.stopPropagation()
    window.addEventListener("pointermove", onDrawMove)
    window.addEventListener("pointerup",   onDrawEnd, { once: true })
  }, [focusedQuestionId, pageRender])

  const onDrawMove = (e) => {
    const d = drawRef.current
    if (!d) return
    d.currentX = e.clientX - d.pageLeft
    d.currentY = e.clientY - d.pageTop
    setDrawTick((t) => t + 1)
  }

  const onDrawEnd = useCallback((e) => {
    window.removeEventListener("pointermove", onDrawMove)
    const d = drawRef.current
    if (!d) return
    drawRef.current = null
    setDrawTick((t) => t + 1)
    // Convert pixel coords to normalized [0,1] bbox.
    const x0px = Math.min(d.startX, d.currentX)
    const y0px = Math.min(d.startY, d.currentY)
    const x1px = Math.max(d.startX, d.currentX)
    const y1px = Math.max(d.startY, d.currentY)
    const bbox = [
      x0px / d.pageWidth,
      y0px / d.pageHeight,
      x1px / d.pageWidth,
      y1px / d.pageHeight,
    ].map((n) => Math.max(0, Math.min(1, n)))
    // Reject tiny rectangles — likely a misclick.
    if ((bbox[2] - bbox[0]) < 0.02 || (bbox[3] - bbox[1]) < 0.02) return
    if (!focusedQuestionId) return

    // Queue-only — no network call until "Save changes" fires.
    const focusedQ = (activeData?.questions || []).find((x) => x.id === focusedQuestionId)
    const localImageIndex = --localCreateCounterRef.current  // -1, -2, ...
    const newOverlay = {
      question_id:           focusedQuestionId,
      question_label:        focusedQ?.label || "",
      question_text_preview: focusedQ?.preview_text || "",
      question_section:      focusedQ?.section || "",
      question_exercise_ref: focusedQ?.exercise_ref || "",
      stem_group_id:         null,
      is_stem_master:        false,
      tag_label:             null,
      location:              newBboxLocation,
      image_index:           localImageIndex,
      page:                  d.page,
      bbox,
      url:                   null,
      caption:               "",
      alt:                   "",
    }
    setOverlays((prev) => [...prev, newOverlay])
    const k = overlayKey(newOverlay)
    setDirty((prev) => {
      const m = new Map(prev)
      m.set(k, { kind: "create", page: d.page, bbox })
      return m
    })
    setSelectedKey(k)
  }, [focusedQuestionId, activeData?.questions, newBboxLocation])

  // ── IntersectionObserver: enqueue render when a page scrolls into view.
  useEffect(() => {
    if (!pdfDoc || !pagesToShow.length) return
    const observer = new IntersectionObserver((entries) => {
      let shouldPump = false
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const p = Number(entry.target.getAttribute("data-page"))
        if (!p || pageRender[p]) continue
        renderQueueRef.current.add(p)
        shouldPump = true
      }
      if (shouldPump) pumpRenderQueue()
    }, { rootMargin: "400px 0px" })

    // Observe each page container that's currently in the DOM.
    for (const p of pagesToShow) {
      const el = pageContainerRefs.current[p]
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [pdfDoc, pagesToShow, pumpRenderQueue, pageRender])

  // ── Drag / resize logic ────────────────────────────────────────────────
  // Two modes:
  //   - "move": follows the cursor. Can cross page boundaries — we hit-test
  //     elementFromPoint each move; if the cursor is over a different
  //     rendered page, the overlay re-anchors there (page + bbox both
  //     update). Drop on the new page persists the page change.
  //   - "nw" / "ne" / "sw" / "se": resize. Page-locked — resizing across
  //     pages doesn't make sense, so we ignore the cursor's page during
  //     resize and just compute deltas against the start page.
  const dragState = useRef(null)

  const onPointerDown = (e, key, mode, page) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedKey(key)
    const pageMeta = pageRender[page]
    const pageEl = pageContainerRefs.current[page]
    if (!pageMeta || !pageEl) return
    const overlay = overlays.find((o) => overlayKey(o) === key)
    if (!overlay) return
    // Where on the bbox did the user grab? Record as a fraction of bbox
    // dimensions so cross-page drags can keep the cursor on the same spot
    // of the box even when the box moves to a page with a different size.
    const rect = pageEl.getBoundingClientRect()
    const bw = overlay.bbox[2] - overlay.bbox[0]
    const bh = overlay.bbox[3] - overlay.bbox[1]
    const cursorXnorm = (e.clientX - rect.left) / pageMeta.width
    const cursorYnorm = (e.clientY - rect.top)  / pageMeta.height
    const grabOffsetX = bw > 0 ? clamp01((cursorXnorm - overlay.bbox[0]) / bw) : 0.5
    const grabOffsetY = bh > 0 ? clamp01((cursorYnorm - overlay.bbox[1]) / bh) : 0.5
    dragState.current = {
      key, mode, page,
      startX: e.clientX,
      startY: e.clientY,
      startBbox: [...overlay.bbox],
      startPage: page,
      pageWidth: pageMeta.width,
      pageHeight: pageMeta.height,
      grabOffsetX, grabOffsetY,
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp, { once: true })
  }

  const onPointerMove = (e) => {
    const ds = dragState.current
    if (!ds) return

    if (ds.mode === "move") {
      // Hit-test which page the cursor is currently over. We walk the DOM up
      // from elementFromPoint until we find a node carrying data-page.
      const target = document.elementFromPoint(e.clientX, e.clientY)
      const pageEl = target?.closest && target.closest("[data-page]")
      const cursorPage = pageEl ? Number(pageEl.getAttribute("data-page")) : null
      const meta = cursorPage ? pageRender[cursorPage] : null

      // If we have a rendered page under the cursor, anchor on it. Otherwise
      // (cursor in the gap between pages, or over a placeholder that's not
      // rendered yet) fall back to the original page with delta-based math
      // so the bbox doesn't snap weirdly.
      if (cursorPage && meta && pageEl) {
        const rect = pageEl.getBoundingClientRect()
        const w = ds.startBbox[2] - ds.startBbox[0]
        const h = ds.startBbox[3] - ds.startBbox[1]
        // Anchor: cursor is at the grab point inside the bbox.
        const cx = (e.clientX - rect.left) / meta.width
        const cy = (e.clientY - rect.top)  / meta.height
        const x0 = clamp01(cx - ds.grabOffsetX * w)
        const y0 = clamp01(cy - ds.grabOffsetY * h)
        const x1 = clamp01(x0 + w)
        const y1 = clamp01(y0 + h)
        const next = clampBbox([x0, y0, x1, y1])

        setOverlays((prev) => prev.map((o) =>
          overlayKey(o) === ds.key
            ? { ...o, page: cursorPage, bbox: next }
            : o
        ))
        setDirty((prev) => {
          const m = new Map(prev)
          // Preserve "create" kind across drags so the eventual save fires
          // a create_bbox PATCH instead of a (404) edit. For server-side
          // overlays default kind is "edit".
          const cur = m.get(ds.key) || { kind: "edit" }
          m.set(ds.key, {
            ...cur,
            bbox: next,
            page: cursorPage,
            pageChanged: cursorPage !== ds.startPage,
          })
          return m
        })
        return
      }

      // Fallback: gap or unrendered page → delta from start, page-locked.
      const dx = (e.clientX - ds.startX) / ds.pageWidth
      const dy = (e.clientY - ds.startY) / ds.pageHeight
      const w = ds.startBbox[2] - ds.startBbox[0]
      const h = ds.startBbox[3] - ds.startBbox[1]
      const x0 = clamp01(ds.startBbox[0] + dx)
      const y0 = clamp01(ds.startBbox[1] + dy)
      const x1 = clamp01(x0 + w)
      const y1 = clamp01(y0 + h)
      const next = clampBbox([x0, y0, x1, y1])
      setOverlays((prev) => prev.map((o) => overlayKey(o) === ds.key ? { ...o, bbox: next } : o))
      setDirty((prev) => {
        const m = new Map(prev)
        const cur = m.get(ds.key) || { kind: "edit" }
        m.set(ds.key, { ...cur, bbox: next })
        return m
      })
      return
    }

    // Resize modes: page-locked, delta-based against the start bbox.
    const dx = (e.clientX - ds.startX) / ds.pageWidth
    const dy = (e.clientY - ds.startY) / ds.pageHeight
    let [x0, y0, x1, y1] = ds.startBbox
    if (ds.mode === "nw") { x0 = clamp01(x0 + dx); y0 = clamp01(y0 + dy) }
    else if (ds.mode === "ne") { x1 = clamp01(x1 + dx); y0 = clamp01(y0 + dy) }
    else if (ds.mode === "sw") { x0 = clamp01(x0 + dx); y1 = clamp01(y1 + dy) }
    else if (ds.mode === "se") { x1 = clamp01(x1 + dx); y1 = clamp01(y1 + dy) }
    const next = clampBbox([x0, y0, x1, y1])
    setOverlays((prev) => prev.map((o) => overlayKey(o) === ds.key ? { ...o, bbox: next } : o))
    setDirty((prev) => {
      const m = new Map(prev)
      const cur = m.get(ds.key) || { kind: "edit" }
      m.set(ds.key, { ...cur, bbox: next })
      return m
    })
  }

  const onPointerUp = () => {
    dragState.current = null
    window.removeEventListener("pointermove", onPointerMove)
  }

  // ── Delete a single overlay (queue, don't persist) ─────────────────────
  // Two paths:
  //   - The overlay is an unsaved create (image_index < 0): drop both the
  //     overlay and its dirty entry — never reaches the server.
  //   - The overlay was loaded from the server: mark dirty as { kind:
  //     "delete" } and visually flag it; the global Save changes fires
  //     the actual delete_bbox PATCH.
  const deleteOverlay = useCallback((key) => {
    const o = overlays.find((x) => overlayKey(x) === key)
    if (!o) return
    if (o.image_index < 0) {
      // unsaved create — silent local removal, no confirm needed
      setOverlays((prev) => prev.filter((x) => overlayKey(x) !== key))
      setDirty((prev) => {
        const m = new Map(prev)
        m.delete(key)
        return m
      })
      if (selectedKey === key) setSelectedKey("")
      return
    }
    const stemNote = o.location === "stem_header_content" && o.stem_group_id
      ? "\n\nThis is a stem image — deleting it removes the figure from every part of this stem group."
      : ""
    const ok = window.confirm(`Mark this bbox for deletion?${stemNote}\n\nIt'll be removed when you click "Save changes". The cropped PNG itself stays in R2 either way.`)
    if (!ok) return
    setDirty((prev) => {
      const m = new Map(prev)
      m.set(key, { kind: "delete" })
      return m
    })
  }, [overlays, selectedKey])

  // Keyboard shortcut: Delete or Backspace removes the selected bbox.
  // Skip when the user is typing into an input (page filter, etc.).
  useEffect(() => {
    if (!selectedKey) return
    const onKey = (e) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return
      const tag = (e.target?.tagName || "").toUpperCase()
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return
      e.preventDefault()
      deleteOverlay(selectedKey)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedKey, deleteOverlay])

  // ── Global flush ───────────────────────────────────────────────────────
  // One button, one round-trip-batch. Walks the dirty queue and fires every
  // create / edit / delete in parallel with a small concurrency cap so the
  // server's Python cropper isn't slammed too hard. Re-crop is always on for
  // creates and edits — there's no longer a "save without crop" path.
  // Failures stay in the dirty queue so the admin can hit Save again to
  // retry just the survivors.
  const SAVE_CONCURRENCY = 6
  const saveAll = useCallback(async () => {
    if (savingAll || dirty.size === 0) return
    const entries = [...dirty.entries()]
    setSavingAll(true)
    setSaveProgress({ done: 0, total: entries.length })
    setError("")

    // Snapshot overlays at start so we read the same coords each worker sees.
    const overlaySnapshot = new Map(overlays.map((o) => [overlayKey(o), o]))

    let cursor = 0
    let doneCount = 0
    const failures = []
    const successes = new Set()  // keys that landed cleanly
    const indexUpdates = new Map() // key -> { newImageIndex, newUrl }
    const urlUpdates = new Map()   // key -> newUrl (for edits)

    const runOne = async (key, entry) => {
      const o = overlaySnapshot.get(key)
      if (!o) return
      const url = `/api/admin/sources/${encodeURIComponent(activeKey)}`
      try {
        if (entry.kind === "create") {
          const res = await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "create_bbox",
              question_id: o.question_id,
              location: o.location,
              page: o.page,
              bbox: o.bbox,
              rehydrate: true,
            }),
          })
          const j = await res.json()
          if (!res.ok) throw new Error(j?.error || "Create failed")
          indexUpdates.set(key, { newImageIndex: j.image_index, newUrl: j.new_url || null })
          successes.add(key)
        } else if (entry.kind === "delete") {
          const res = await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "delete_bbox",
              question_id: o.question_id,
              location: o.location,
              image_index: o.image_index,
            }),
          })
          if (!res.ok) {
            const j = await res.json().catch(() => ({}))
            throw new Error(j?.error || "Delete failed")
          }
          successes.add(key)
        } else {
          // edit
          const res = await fetch(url, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "bbox",
              question_id: o.question_id,
              location: o.location,
              image_index: o.image_index,
              bbox: o.bbox,
              ...(entry.pageChanged ? { page: o.page } : {}),
              rehydrate: true,
            }),
          })
          const j = await res.json()
          if (!res.ok) throw new Error(j?.error || "Save failed")
          if (j.new_url) urlUpdates.set(key, j.new_url)
          successes.add(key)
        }
      } catch (e) {
        failures.push({ key, label: o.question_label, error: e.message || String(e) })
      } finally {
        doneCount++
        setSaveProgress({ done: doneCount, total: entries.length })
      }
    }

    const workers = Array.from({ length: SAVE_CONCURRENCY }, async () => {
      while (cursor < entries.length) {
        const idx = cursor++
        if (idx >= entries.length) return
        const [key, entry] = entries[idx]
        await runOne(key, entry)
      }
    })
    await Promise.all(workers)

    // Apply local-state mutations atomically.
    setOverlays((prev) => {
      let next = prev
      // Replace local image_index + url for successful creates.
      if (indexUpdates.size > 0) {
        next = next.map((o) => {
          const k = overlayKey(o)
          const upd = indexUpdates.get(k)
          if (!upd) return o
          return { ...o, image_index: upd.newImageIndex, url: upd.newUrl || o.url }
        })
      }
      // Update urls for edits that re-cropped.
      if (urlUpdates.size > 0) {
        next = next.map((o) => {
          const k = overlayKey(o)
          const u = urlUpdates.get(k)
          if (!u) return o
          return { ...o, url: u }
        })
      }
      // Drop overlays that were successfully deleted.
      next = next.filter((o) => {
        const k = overlayKey(o)
        const entry = dirty.get(k)
        if (entry?.kind === "delete" && successes.has(k)) return false
        return true
      })
      return next
    })

    // Clear successful entries from the dirty queue; keep failures.
    setDirty((prev) => {
      const m = new Map(prev)
      for (const k of successes) m.delete(k)
      return m
    })

    if (failures.length) {
      setError(`Saved ${successes.size}/${entries.length}. ${failures.length} failed: ${failures.slice(0, 3).map((f) => f.label || "?").join(", ")}${failures.length > 3 ? "…" : ""}`)
    }

    setSavingAll(false)
    setSaveProgress({ done: 0, total: 0 })
  }, [dirty, overlays, savingAll, activeKey])

  // ── Render ─────────────────────────────────────────────────────────────
  const colors = lm ? {
    bg: "#fbf6ec", panelBg: "#fff7e6", panelBorder: "#d8c89a",
    text: "#2c2410", subtext: "#7a6a50", chipBg: "#ffd45b", btnBg: "#ead7aa",
  } : {
    bg: "#0e1118", panelBg: "#171b24", panelBorder: "#2d3340",
    text: "#f5f7fb", subtext: "#8f96a3", chipBg: "#3a3120", btnBg: "#1f2531",
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px minmax(0, 1fr) 360px", gap: 14, height: "calc(100vh - 220px)", minHeight: 700 }}>
      {/* ── Left: source list ───────────────────────────────────────── */}
      <div style={{ background: colors.panelBg, border: `1px solid ${colors.panelBorder}`, borderRadius: 10, padding: 12, overflowY: "auto" }}>
        <div style={{ fontWeight: 700, color: colors.text, fontSize: 14, marginBottom: 8 }}>Sources</div>
        <div style={{ color: colors.subtext, fontSize: 12, marginBottom: 10 }}>{sources.length} registered · click to load</div>
        {loadingList && <div style={{ color: colors.subtext, fontSize: 12 }}>Loading…</div>}
        {sources.map((s) => {
          const isActive = s.textbook_key === activeKey
          const ghost = s.metadata?._ghost
          // EPUB sources have neither pdf_url nor pdf_storage_key but should
          // load fine — they render the spine HTML iframe instead. Detect
          // via metadata.epub_format set by extract-epub-assets.cjs.
          const isEpubSource = !!s.metadata?.epub_format
          const noContent = !isEpubSource && !s.pdf_url && !s.pdf_storage_key
          const formatBadge = isEpubSource ? "EPUB" : null
          return (
            <button
              key={s.textbook_key}
              type="button"
              onClick={() => loadSource(s.textbook_key)}
              disabled={ghost || noContent}
              title={ghost ? "Run scripts/populate-sources.cjs to register this key" : noContent ? "No PDF or EPUB uploaded yet" : ""}
              style={{
                width: "100%", textAlign: "left", marginBottom: 6, padding: "10px 12px",
                background: isActive ? colors.chipBg : (ghost || noContent ? "transparent" : colors.btnBg),
                color: ghost || noContent ? colors.subtext : colors.text,
                border: `1px solid ${isActive ? colors.chipBg : colors.panelBorder}`,
                borderRadius: 6, cursor: ghost || noContent ? "not-allowed" : "pointer",
                fontSize: 12, lineHeight: 1.35,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{s.label}</div>
              <div style={{ color: colors.subtext, fontSize: 11 }}>
                {s.textbook_key}
              </div>
              <div style={{ color: colors.subtext, fontSize: 11, marginTop: 3 }}>
                {s.qt_count} QT · {s.question_count} Qs · {s.source_type}
                {formatBadge ? <span style={{ marginLeft: 6, padding: "0 5px", background: "#5b8def", color: "#0a1118", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>{formatBadge}</span> : null}
                {ghost ? " · ⚠ no row" : noContent ? " · ⬆ no source" : ""}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Right: PDF + overlays ───────────────────────────────────── */}
      <div style={{ background: colors.panelBg, border: `1px solid ${colors.panelBorder}`, borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {error && (
          <div style={{ padding: "8px 12px", background: "#7a2424", color: "#ffd9d9", borderRadius: 6, fontSize: 12, marginBottom: 10 }}>
            {error}
          </div>
        )}

        {!activeKey && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: colors.subtext, fontSize: 13 }}>
            Pick a source on the left to load its PDF and tagged bboxes.
          </div>
        )}

        {activeKey && loadingDetail && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: colors.subtext }}>
            Loading {activeKey}…
          </div>
        )}

        {activeKey && activeData && (
          <>
            {/* toolbar */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${colors.panelBorder}` }}>
              <div style={{ fontWeight: 700, color: colors.text, fontSize: 14 }}>{activeData.source.label}</div>
              <div style={{ color: colors.subtext, fontSize: 12 }}>
                {activeData.questions.length} questions · {isEpub
                  ? `${(activeData.source.metadata?.epub_image_count || 0)} EPUB images · ${(activeData.source.metadata?.epub_spine_count || 0)} chapters`
                  : `${overlays.length} bboxes · ${activeData.source.page_count || numPages || "?"} pages`}
              </div>
              <div style={{ flex: 1 }} />
              {isEpub && (
                <>
                  <label style={{ color: colors.subtext, fontSize: 12 }}>
                    Chapter
                    <select
                      value={selectedSpineIndex}
                      onChange={(e) => setSelectedSpineIndex(Number(e.target.value))}
                      style={{ marginLeft: 6, background: colors.btnBg, color: colors.text, border: `1px solid ${colors.panelBorder}`, borderRadius: 4, padding: "4px 6px", fontSize: 12, maxWidth: 280 }}
                    >
                      {epubSpineWithImages.map((s) => (
                        <option key={s.index} value={s.index}>
                          [{s.index}] {(s.title || "?").slice(0, 50)} · {s.image_count} img{s.page_first != null ? ` · p.${s.page_first}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  {epubBusy && <span style={{ color: "#a8c884", fontSize: 11, fontStyle: "italic" }}>{epubBusy}</span>}
                </>
              )}
              {!isEpub && (
                <>
                  <label style={{ color: colors.subtext, fontSize: 12 }}>
                    <input type="checkbox" checked={hideBbox} onChange={(e) => setHideBbox(e.target.checked)} /> Hide bboxes
                  </label>
                  <label
                    style={{ color: colors.subtext, fontSize: 12 }}
                    title="Default shows only pages with tagged bboxes (much faster). Toggle to render every page in the PDF."
                  >
                    <input type="checkbox" checked={showAllPages} onChange={(e) => setShowAllPages(e.target.checked)} /> Show all pages
                  </label>
                  <label style={{ color: colors.subtext, fontSize: 12 }}>
                    Zoom <input type="range" min="0.6" max="2.4" step="0.2" value={renderScale} onChange={(e) => setRenderScale(Number(e.target.value))} />
                  </label>
                  <input
                    type="text"
                    placeholder="page filter"
                    value={pageFilter}
                    onChange={(e) => setPageFilter(e.target.value.replace(/[^0-9]/g, ""))}
                    style={{ background: colors.btnBg, color: colors.text, border: `1px solid ${colors.panelBorder}`, borderRadius: 4, padding: "4px 8px", width: 90, fontSize: 12 }}
                  />
                </>
              )}
              {!isEpub && (() => {
                // Tally dirty entries by kind so the button label is honest.
                let edits = 0, creates = 0, deletes = 0
                for (const v of dirty.values()) {
                  if (v.kind === "create") creates++
                  else if (v.kind === "delete") deletes++
                  else edits++
                }
                const hasChanges = dirty.size > 0
                const label = savingAll
                  ? `Saving ${saveProgress.done}/${saveProgress.total}…`
                  : hasChanges
                    ? `Save changes · ${edits ? `${edits} edit${edits > 1 ? "s" : ""}` : ""}${edits && (creates || deletes) ? ", " : ""}${creates ? `${creates} new` : ""}${creates && deletes ? ", " : ""}${deletes ? `${deletes} delete${deletes > 1 ? "s" : ""}` : ""}`
                    : "All saved"
                return (
                  <button
                    type="button"
                    onClick={saveAll}
                    disabled={!hasChanges || savingAll}
                    style={{
                      padding: "6px 14px",
                      background: hasChanges ? "#3a6a3a" : colors.btnBg,
                      color: hasChanges ? "#f5f7fb" : colors.subtext,
                      border: `1px solid ${hasChanges ? "#5b8a5b" : colors.panelBorder}`,
                      borderRadius: 5,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: hasChanges && !savingAll ? "pointer" : "not-allowed",
                    }}
                  >{label}</button>
                )
              })()}
            </div>

            {/* scrollable pdf area (PDF mode) */}
            {!isEpub && (
            <div style={{ flex: 1, overflow: "auto", background: lm ? "#f3ead4" : "#0a0d14", borderRadius: 6, padding: 12 }}>
              {!activeData.source.pdf_storage_key && !activeData.source.pdf_url && (
                <div style={{ color: colors.subtext, padding: 24 }}>
                  No PDF stored for this source yet. Add a row to <code>scripts/sources_file_map.json</code> and run <code>node scripts/populate-sources.cjs</code> to upload.
                </div>
              )}
              {!pdfDoc && activeData.source.pdf_storage_key && (
                <div style={{ color: colors.subtext }}>Rendering PDF…</div>
              )}
              {pdfDoc && pagesToShow.length === 0 && (
                <div style={{ color: colors.subtext, padding: 24, fontSize: 13 }}>
                  {pagesWithOverlays.length === 0 && !showAllPages
                    ? <>This source has no questions with bboxes yet. Toggle <strong>Show all pages</strong> above to browse the PDF anyway.</>
                    : <>No pages match your filter.</>}
                </div>
              )}
              {pdfDoc && pagesToShow.map((p) => {
                const meta = pageRender[p]
                const list = (overlaysByPage.get(p) || [])
                // While a page hasn't been rendered yet, hold its slot open
                // with the doc's typical viewport size (from page 1) so the
                // scroll position doesn't jump as pages stream in.
                const placeholderWidth  = defaultPageSize?.width  || 800
                const placeholderHeight = defaultPageSize?.height || 1100
                const containerStyle = {
                  position: "relative",
                  margin: "0 auto 24px",
                  width: meta?.width || placeholderWidth,
                  height: meta?.height || placeholderHeight,
                  background: "#fff",
                  boxShadow: "0 6px 24px rgba(0,0,0,0.35)",
                }
                return (
                  <div
                    key={p}
                    style={containerStyle}
                    data-page={p}
                    ref={(el) => (pageContainerRefs.current[p] = el)}
                  >
                    {!meta && (
                      <div style={{
                        position: "absolute", inset: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#8a8a8a", fontSize: 12, letterSpacing: "0.04em",
                      }}>
                        rendering p.{p}…
                      </div>
                    )}
                    <canvas
                      id={`src-pdf-page-${p}`}
                      style={{
                        display: "block",
                        cursor: focusedQuestionId ? "crosshair" : "default",
                      }}
                      onPointerDown={focusedQuestionId ? (e) => onDrawStart(e, p) : undefined}
                    />
                    {/* live preview rectangle while drawing a new bbox */}
                    {drawRef.current?.page === p && (() => {
                      const d = drawRef.current
                      const left   = Math.min(d.startX, d.currentX)
                      const top    = Math.min(d.startY, d.currentY)
                      const width  = Math.abs(d.currentX - d.startX)
                      const height = Math.abs(d.currentY - d.startY)
                      return (
                        <div style={{
                          position: "absolute",
                          left, top, width, height,
                          border: "2px dashed #5b8def",
                          background: "rgba(91,141,239,0.10)",
                          pointerEvents: "none",
                        }} />
                      )
                    })()}
                    {meta && !hideBbox && list.map((o) => {
                      const k = overlayKey(o)
                      const isSel = k === selectedKey
                      const dirtyEntry = dirty.get(k)
                      const dirtyKind = dirtyEntry?.kind || null
                      const baseBorder = dirtyKind === "delete" ? BORDER_DELETE
                        : dirtyKind === "create" ? BORDER_CREATE
                        : dirtyKind === "edit"   ? BORDER_EDIT
                        : BORDER_COLOR
                      const baseBg = dirtyKind === "delete" ? "rgba(216,90,90,0.12)"
                        : dirtyKind === "create" ? "rgba(126,192,126,0.10)"
                        : dirtyKind === "edit"   ? "rgba(210,138,43,0.10)"
                        : "rgba(91,141,239,0.06)"
                      const borderColor = isSel ? BORDER_SELECTED : baseBorder
                      const borderStyle = dirtyKind === "delete" ? "dashed" : "solid"
                      const [x0, y0, x1, y1] = o.bbox
                      const left = x0 * meta.width
                      const top  = y0 * meta.height
                      const w    = (x1 - x0) * meta.width
                      const h    = (y1 - y0) * meta.height
                      return (
                        <div
                          key={k}
                          style={{
                            position: "absolute",
                            left, top, width: w, height: h,
                            border: `2px ${borderStyle} ${borderColor}`,
                            background: isSel ? "rgba(255,212,91,0.10)" : baseBg,
                            cursor: "move",
                            boxSizing: "border-box",
                            opacity: dirtyKind === "delete" ? 0.7 : 1,
                          }}
                          onPointerDown={(e) => onPointerDown(e, k, "move", p)}
                          onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.borderColor = BORDER_HOVER }}
                          onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.borderColor = baseBorder }}
                        >
                          {/* corner handles */}
                          {[
                            ["nw", { left: -HANDLE_SIZE/2, top: -HANDLE_SIZE/2, cursor: "nwse-resize" }],
                            ["ne", { right: -HANDLE_SIZE/2, top: -HANDLE_SIZE/2, cursor: "nesw-resize" }],
                            ["sw", { left: -HANDLE_SIZE/2, bottom: -HANDLE_SIZE/2, cursor: "nesw-resize" }],
                            ["se", { right: -HANDLE_SIZE/2, bottom: -HANDLE_SIZE/2, cursor: "nwse-resize" }],
                          ].map(([dir, pos]) => (
                            <div
                              key={dir}
                              onPointerDown={(e) => onPointerDown(e, k, dir, p)}
                              style={{
                                position: "absolute",
                                width: HANDLE_SIZE, height: HANDLE_SIZE,
                                background: isSel ? BORDER_SELECTED : BORDER_COLOR,
                                borderRadius: 2,
                                ...pos,
                              }}
                            />
                          ))}
                          {/* tag — stem masters show their group label, regular
                              overlays show the question's own label */}
                          <div style={{
                            position: "absolute", left: 0, top: -22,
                            background: isSel ? BORDER_SELECTED : BORDER_COLOR,
                            color: "#0a1118", fontWeight: 700, fontSize: 11,
                            padding: "2px 6px", borderRadius: 3, whiteSpace: "nowrap",
                            maxWidth: Math.max(160, w), overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {o.tag_label || o.question_label}{dirtyKind ? " ●" : ""}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
            )}

            {/* ── EPUB mode: spine iframe + focused-question image strip ─── */}
            {isEpub && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", gap: 10 }}>
                {!epubSpineWithImages.length && (
                  <div style={{ color: colors.subtext, padding: 24 }}>
                    No chapters with images. Run <code>node scripts/extract-epub-assets.cjs {activeKey} --apply</code>.
                  </div>
                )}
                {epubSpineWithImages.length > 0 && (() => {
                  const chapter = epubSpine.find((s) => s.index === selectedSpineIndex) || epubSpineWithImages[0]
                  if (!chapter?.html_url) return (
                    <div style={{ color: colors.subtext, padding: 24 }}>This chapter has no rendered HTML.</div>
                  )
                  return (
                    <iframe
                      key={chapter.html_url}
                      src={chapter.html_url}
                      title={`spine-${chapter.index}`}
                      sandbox="allow-scripts allow-same-origin"
                      style={{
                        flex: 1, width: "100%",
                        background: "#fff",
                        border: `1px solid ${colors.panelBorder}`,
                        borderRadius: 6, minHeight: 320,
                      }}
                    />
                  )
                })()}

                {/* Focused-question image strip */}
                <div style={{
                  background: colors.btnBg, border: `1px solid ${colors.panelBorder}`,
                  borderRadius: 6, padding: 10, minHeight: 110,
                }}>
                  {!focusedQuestionId && (
                    <div style={{ color: colors.subtext, fontSize: 12 }}>
                      Click a question on the right to focus it, then click any image in the chapter to attach it.
                    </div>
                  )}
                  {focusedQuestionId && focusedQuestion && (() => {
                    const arr = Array.isArray(focusedQuestion.question_content) ? focusedQuestion.question_content : []
                    const items = []
                    for (let i = 0; i < arr.length; i++) {
                      if (arr[i]?.type === "image") items.push({ item: arr[i], image_index: i })
                    }
                    return (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <strong style={{ color: colors.text, fontSize: 12 }}>{focusedQuestion.label}</strong>
                          <span style={{ color: colors.subtext, fontSize: 11 }}>
                            {items.length === 0 ? "no images yet — click any <img> in the chapter" : `${items.length} image${items.length > 1 ? "s" : ""} · drag to reorder`}
                          </span>
                          <span style={{ flex: 1 }} />
                          <button
                            type="button"
                            onClick={() => setFocusedQuestionId("")}
                            style={{ background: "transparent", border: "none", color: colors.subtext, cursor: "pointer", fontSize: 12 }}
                            title="Clear focus"
                          >✕</button>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {items.map((it, slotIdx) => {
                            const isDragging = dragImageIdx === slotIdx
                            return (
                              <div
                                key={`${focusedQuestion.id}-${it.image_index}-${it.item.url || it.item.inner_path}`}
                                draggable
                                onDragStart={(e) => {
                                  setDragImageIdx(slotIdx)
                                  e.dataTransfer.effectAllowed = "move"
                                  // Firefox needs setData to actually start a drag
                                  try { e.dataTransfer.setData("text/plain", String(slotIdx)) } catch {}
                                }}
                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }}
                                onDrop={(e) => {
                                  e.preventDefault()
                                  if (dragImageIdx == null || dragImageIdx === slotIdx) return
                                  reorderFocusedQuestionImages(dragImageIdx, slotIdx)
                                  setDragImageIdx(null)
                                }}
                                onDragEnd={() => setDragImageIdx(null)}
                                style={{
                                  position: "relative",
                                  width: 90, height: 90,
                                  background: "#fff",
                                  border: `2px solid ${isDragging ? "#5b8def" : colors.panelBorder}`,
                                  borderRadius: 6,
                                  cursor: "grab",
                                  opacity: isDragging ? 0.5 : 1,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  overflow: "hidden",
                                }}
                                title={(it.item.alt || it.item.inner_path || "") + (it.item.page ? ` · p.${it.item.page}` : "")}
                              >
                                {it.item.url ? (
                                  <img
                                    src={it.item.url}
                                    alt={it.item.alt || ""}
                                    style={{ maxWidth: "100%", maxHeight: "100%", pointerEvents: "none" }}
                                  />
                                ) : (
                                  <span style={{ color: "#888", fontSize: 10 }}>no url</span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => deleteEpubImage(focusedQuestion.id, "question_content", it.image_index)}
                                  title="Remove from question"
                                  style={{
                                    position: "absolute", top: 2, right: 2,
                                    width: 22, height: 22,
                                    background: "rgba(216,90,90,0.92)", color: "#fff",
                                    border: "none", borderRadius: 11,
                                    fontSize: 13, lineHeight: "20px",
                                    cursor: "pointer",
                                  }}
                                >✕</button>
                              </div>
                            )
                          })}
                          {/* Drop-at-end slot for re-ordering to the tail */}
                          {items.length > 0 && (
                            <div
                              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }}
                              onDrop={(e) => {
                                e.preventDefault()
                                if (dragImageIdx == null) return
                                reorderFocusedQuestionImages(dragImageIdx, items.length - 1)
                                setDragImageIdx(null)
                              }}
                              style={{
                                width: 36, height: 90, border: `2px dashed ${colors.panelBorder}`,
                                borderRadius: 6, color: colors.subtext, fontSize: 10,
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                              title="Drop here to move to end"
                            >end</div>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}

            {/* ── Selected overlay sidebar ─────────────────────────── */}
            {!isEpub && selectedKey && (() => {
              const o = overlays.find((x) => overlayKey(x) === selectedKey)
              if (!o) return null
              const isDirty = dirty.has(selectedKey)
              return (
                <div style={{
                  position: "fixed", right: 28, bottom: 28, width: 360,
                  background: colors.panelBg, border: `1px solid ${colors.panelBorder}`,
                  borderRadius: 10, padding: 14, color: colors.text,
                  boxShadow: "0 12px 32px rgba(0,0,0,0.45)", zIndex: 50,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <strong>{o.question_label}</strong>
                    <span style={{ color: colors.subtext, fontSize: 11 }}>p.{o.page} · {o.location}[{o.image_index}]</span>
                    <button onClick={() => setSelectedKey("")} style={{ marginLeft: "auto", background: "transparent", border: "none", color: colors.subtext, cursor: "pointer" }}>✕</button>
                  </div>
                  <div style={{ color: colors.subtext, fontSize: 12, marginBottom: 8 }}>{o.question_text_preview || "—"}</div>
                  <div style={{ fontSize: 11, color: colors.subtext, marginBottom: 8 }}>
                    bbox: [{o.bbox.map((n) => n.toFixed(3)).join(", ")}]
                  </div>
                  {o.url && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: colors.subtext, fontSize: 11, marginBottom: 4 }}>Current crop:</div>
                      <img
                        src={o.url}
                        alt={o.alt || ""}
                        style={{ maxWidth: "100%", maxHeight: 140, border: `1px solid ${colors.panelBorder}`, borderRadius: 4, background: "#fff" }}
                      />
                    </div>
                  )}
                  {(() => {
                    const dirtyEntry = dirty.get(selectedKey)
                    const isCreate  = dirtyEntry?.kind === "create"
                    const isDelete  = dirtyEntry?.kind === "delete"
                    const queueLine = isDelete
                      ? "🗑 Marked for deletion — fires on Save changes"
                      : isCreate
                        ? "✨ New bbox — will crop & upload on Save changes"
                        : isDirty
                          ? "✎ Edited — will re-crop on Save changes"
                          : ""
                    return queueLine ? (
                      <div style={{ color: isDelete ? "#f0c0c0" : "#a8c884", fontSize: 11, marginBottom: 8, fontStyle: "italic" }}>
                        {queueLine}
                      </div>
                    ) : null
                  })()}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => deleteOverlay(selectedKey)}
                      disabled={savingAll}
                      title="Mark this bbox for deletion (Delete key). Fires on Save changes."
                      style={{ flex: 1, padding: "8px 10px", background: "#3a1f1f", border: `1px solid ${colors.panelBorder}`, color: "#f0c0c0", borderRadius: 5, cursor: savingAll ? "not-allowed" : "pointer", fontSize: 12 }}
                    >{dirty.get(selectedKey)?.kind === "delete" ? "Already marked for delete" : "Delete bbox"}</button>
                  </div>
                  <div style={{ color: colors.subtext, fontSize: 10, marginTop: 4, fontStyle: "italic" }}>
                    Drag, draw, and delete just queue locally — click <strong>Save changes</strong> in the toolbar to flush everything in parallel. Press <kbd style={{ background: colors.btnBg, padding: "1px 5px", borderRadius: 3, border: `1px solid ${colors.panelBorder}` }}>Delete</kbd> with a bbox selected to mark it.
                  </div>
                  <div style={{ color: colors.subtext, fontSize: 11, marginTop: 8 }}>
                    "Save & re-crop" pulls the PDF from R2, re-runs the cropper for this bbox, uploads the new PNG, and updates the question's image URL. Wait a couple of seconds for the new crop to appear.
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </div>

      {/* ── Right: question navigator ────────────────────────────────
          Lists every question this source has, sorted by page. Clicking a
          row scrolls the PDF to that question's page AND focuses the
          question for new-bbox creation: any subsequent click-drag on the
          PDF draws a fresh rectangle on this question. Bbox status badge
          tells admins which questions still need an image.
          --------------------------------------------------------------- */}
      <div style={{
        background: colors.panelBg, border: `1px solid ${colors.panelBorder}`,
        borderRadius: 10, padding: 12, overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ fontWeight: 700, color: colors.text, fontSize: 13, marginBottom: 4 }}>Questions</div>
        <div style={{ color: colors.subtext, fontSize: 11, marginBottom: 6 }}>
          {questionsByPage.length}{focusedQuestionId ? " · click PDF to draw" : " · click row to focus"}
          {pagelessCount > 0 && hidePageless ? ` · ${pagelessCount} hidden` : ""}
        </div>
        {pagelessCount > 0 && (
          <label style={{ color: colors.subtext, fontSize: 11, marginBottom: 8, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={hidePageless}
              onChange={(e) => setHidePageless(e.target.checked)}
            />
            Hide pageless ({pagelessCount})
          </label>
        )}
        {focusedQuestionId && (
          <div style={{
            background: "#3a4d2a", border: `1px solid #6a8f3f`, color: "#dceec0",
            borderRadius: 5, padding: "6px 8px", fontSize: 11, marginBottom: 8,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: 1 }}>
                ✏️ Drawing for <strong>{(questionsByPage.find((q) => q.id === focusedQuestionId)?.label) || ""}</strong>
              </span>
              <button
                type="button"
                onClick={() => setFocusedQuestionId("")}
                style={{ background: "transparent", border: "none", color: "#dceec0", cursor: "pointer", fontSize: 12 }}
                title="Stop drawing mode"
              >✕</button>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { value: "question_content",    label: "Question",  title: "New bbox attaches to this question's figure (visible only on this question)" },
                { value: "stem_header_content", label: "Stem",      title: "New bbox attaches to the shared stem figure (inherited by all children of the stem group)" },
              ].map((opt) => {
                const active = newBboxLocation === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setNewBboxLocation(opt.value)}
                    title={opt.title}
                    style={{
                      flex: 1,
                      background: active ? "#6a8f3f" : "transparent",
                      border: `1px solid ${active ? "#a8c884" : "#6a8f3f"}`,
                      color: active ? "#1a1a1a" : "#dceec0",
                      borderRadius: 4,
                      padding: "3px 6px",
                      fontSize: 10,
                      fontWeight: active ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >{opt.label}</button>
                )
              })}
            </div>
          </div>
        )}
        {savingAll && saveProgress.total > 0 && (
          <div style={{ color: "#a8c884", fontSize: 11, marginBottom: 6 }}>
            Flushing {saveProgress.done} / {saveProgress.total}…
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", marginRight: -6, paddingRight: 6 }}>
          {!activeKey && <div style={{ color: colors.subtext, fontSize: 12 }}>Pick a source on the left first.</div>}
          {activeKey && !questionsByPage.length && <div style={{ color: colors.subtext, fontSize: 12 }}>No questions on this source.</div>}
          {questionsByPage.map((q, idx) => {
            const isFocused = q.id === focusedQuestionId
            const stemBadge = q.has_stem_image
              ? "stem"
              : (q.is_stem_child ? "child" : null)
            const bboxStatus = q.overlay_count > 0 ? `${q.overlay_count}✓` : "○"
            // Show 2 lines of the question text. The text is plain — math
            // shows as `$...$` etc., not perfect, but enough to spot the
            // question on the actual workbook page.
            const snippet = String(q.preview_text || "").trim()
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setFocusedQuestionId(q.id)
                  if (q.page) scrollToPage(q.page)
                }}
                style={{
                  width: "100%", textAlign: "left", marginBottom: 5, padding: "8px 10px",
                  background: isFocused ? "#3a4d2a" : colors.btnBg,
                  border: `1px solid ${isFocused ? "#6a8f3f" : colors.panelBorder}`,
                  color: isFocused ? "#dceec0" : colors.text,
                  borderRadius: 5, cursor: "pointer",
                  fontSize: 11, lineHeight: 1.3,
                  display: "block",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{
                    display: "inline-block", minWidth: 22,
                    textAlign: "right", color: isFocused ? "#dceec0" : colors.subtext,
                    fontWeight: 600,
                  }}>{idx + 1}.</span>
                  <span style={{ fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {q.label}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: q.overlay_count > 0 ? (isFocused ? "#dceec0" : "#7ec07e") : "#d28a2b",
                    whiteSpace: "nowrap",
                  }}>
                    {bboxStatus}
                  </span>
                </div>
                <div style={{ color: isFocused ? "#a8c884" : colors.subtext, fontSize: 10, marginBottom: 4 }}>
                  p.{q.page || "?"} · {q.exercise_ref || "—"}
                  {stemBadge ? <span style={{ marginLeft: 6, padding: "0 4px", background: "#5b8def", color: "#0a1118", borderRadius: 2, fontSize: 9, fontWeight: 700 }}>{stemBadge}</span> : null}
                </div>
                {snippet ? (
                  <div style={{
                    color: isFocused ? "#dceec0" : colors.text,
                    fontSize: 10, lineHeight: 1.35,
                    opacity: 0.85,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>{snippet}</div>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
