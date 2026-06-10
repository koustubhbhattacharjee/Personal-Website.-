#!/usr/bin/env node
// Extract a source EPUB into R2 + register it on the matching public.sources row.
//
// What it does (idempotent — re-runs are safe, HEAD-checked):
//
//   1. Reads the EPUB as a ZIP (shell to `unzip`).
//   2. Parses META-INF/container.xml → OPF → spine to build the reading order.
//   3. For every image referenced anywhere in the spine, sha256s the bytes and
//      uploads to R2 at  epub-assets/<textbook_key>/<sha>.<ext>.
//   4. For every spine XHTML:
//        - rewrites every <img src> to the R2 image URL
//        - stamps each <img> with data-spine-index / data-dom-index /
//          data-occurrence-index / data-inner-path / data-page so the admin
//          iframe can identify the click target
//        - rewrites every <link href="…/styles/foo.css"> to a relative href
//          we'll preserve under the same R2 prefix
//        - injects a tiny postMessage shim before </body> that posts the
//          identifying attrs to window.parent on click
//        - uploads the rewritten HTML to
//          epub-spine/<textbook_key>/<spine_index>.html
//   5. Uploads each CSS file referenced by any spine doc to
//      epub-spine/<textbook_key>/styles/<name>
//   6. Optionally uploads the source EPUB itself to
//      sources/<textbook_key>/source.epub (so the file lives somewhere
//      durable, not just on the developer's laptop).
//   7. PATCHes public.sources, merging into the existing metadata jsonb:
//        epub_format: true,
//        epub_storage_key, epub_spine_base_url,
//        epub_image_count, epub_spine_count,
//        epub_spine: [{ index, path, title, html_url, image_count, page_first }]
//
// Mental model: this is the EPUB analog of the populate-sources.cjs +
// hydrate-db-question-images.mjs pair for PDF sources. Same R2-by-sha
// dedup, same soft link via textbook_key, same metadata-on-the-source-row
// pattern. The Sources Studio UI then branches: PDF sources render the
// PDF.js canvas, EPUB sources render an iframe of the spine HTML hosted
// on R2 and let the admin click images in-place to attach them to the
// focused question.
//
// Usage:
//   node scripts/extract-epub-assets.cjs <textbook_key> [--apply]
//
// Without --apply this is a dry run — it parses everything, prints what
// would be uploaded, but does NOT touch R2 or Supabase.

const fs       = require("fs")
const path     = require("path")
const crypto   = require("crypto")
const { execFileSync } = require("child_process")

// ── env loader (same shape as attach-barrons-images.cjs) ──────────────────
const envPath = path.join(process.cwd(), ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1")
  }
}

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const APPLY = args.includes("--apply")
const TEXTBOOK_KEY = args.find((a) => !a.startsWith("--"))
if (!TEXTBOOK_KEY) {
  console.error("usage: node scripts/extract-epub-assets.cjs <textbook_key> [--apply]")
  process.exit(1)
}

// ── env required ──────────────────────────────────────────────────────────
const SUPABASE_URL  = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
const KEY           = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const R2_BUCKET     = process.env.R2_BUCKET
const R2_PUBLIC     = String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "")
const R2_ENDPOINT   = process.env.R2_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null)
const R2_AK = process.env.R2_ACCESS_KEY_ID
const R2_SK = process.env.R2_SECRET_ACCESS_KEY

if (!SUPABASE_URL || !KEY) { console.error("Missing Supabase env"); process.exit(1) }
if (APPLY && (!R2_BUCKET || !R2_AK || !R2_SK || !R2_ENDPOINT || !R2_PUBLIC)) {
  console.error("Missing R2 env (need R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT or R2_ACCOUNT_ID / R2_PUBLIC_BASE_URL)")
  process.exit(1)
}

// ── EPUB path lookup ──────────────────────────────────────────────────────
// Find the EPUB by reading scripts/sources_file_map.json. If the entry has a
// .epub path use it; otherwise fall back to a hardcoded Barron's path so the
// first run works without any config change.
const SOURCES_FILE_MAP = path.join("scripts", "sources_file_map.json")
let epubPath = null
if (fs.existsSync(SOURCES_FILE_MAP)) {
  const map = JSON.parse(fs.readFileSync(SOURCES_FILE_MAP, "utf8"))
  const entry = map[TEXTBOOK_KEY]
  if (entry?.path && entry.path.toLowerCase().endsWith(".epub")) epubPath = entry.path
}
if (!epubPath && TEXTBOOK_KEY === "barrons_ap_phys1_premium_2024") {
  epubPath = "data/AP Physics 1/AP Physics 1 Premium, 2024_ 4 Practice Tests + Comprehensive -- Kenneth Rideout, Jonathan Wolf -- 2022 -- Barrons Educational Services -- 9781506287942 -- 1cec5fd5947942332912c1fc887ba933 -- Anna’s Archive.epub"
}
if (!epubPath || !fs.existsSync(epubPath)) {
  console.error(`No .epub mapped for textbook_key="${TEXTBOOK_KEY}" (looked in scripts/sources_file_map.json).`)
  process.exit(1)
}

console.log(`textbook_key = ${TEXTBOOK_KEY}`)
console.log(`epub         = ${epubPath}`)
console.log(`mode         = ${APPLY ? "APPLY (writes to R2 + DB)" : "DRY RUN"}`)
console.log()

// ── unzip helpers ─────────────────────────────────────────────────────────
function epubReadFile(innerPath) {
  // Returns a Buffer. Larger than 50 MB → bump maxBuffer.
  return execFileSync("unzip", ["-p", epubPath, innerPath], { maxBuffer: 100 * 1024 * 1024 })
}
function epubReadText(innerPath) {
  return epubReadFile(innerPath).toString("utf8")
}

// ── R2 client (lazy) ──────────────────────────────────────────────────────
let s3 = null
async function getS3() {
  if (s3) return s3
  const { S3Client } = await import("@aws-sdk/client-s3")
  s3 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_AK, secretAccessKey: R2_SK },
  })
  return s3
}
async function r2Has(key) {
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3")
  try { await (await getS3()).send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key })); return true }
  catch (e) { if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NotFound") return false; throw e }
}
async function r2Put(key, body, contentType) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3")
  await (await getS3()).send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: contentType }))
}

function extOf(name) { const m = name.match(/\.([a-zA-Z0-9]+)$/); return m ? m[1].toLowerCase() : "bin" }
function contentTypeFor(ext) {
  return ext === "jpg" || ext === "jpeg" ? "image/jpeg"
       : ext === "png"  ? "image/png"
       : ext === "svg"  ? "image/svg+xml"
       : ext === "gif"  ? "image/gif"
       : ext === "webp" ? "image/webp"
       : ext === "css"  ? "text/css; charset=utf-8"
       : ext === "html" || ext === "xhtml" ? "text/html; charset=utf-8"
       : "application/octet-stream"
}

// ── Supabase REST ─────────────────────────────────────────────────────────
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

// ── Tiny XML/HTML helpers ─────────────────────────────────────────────────
// We deliberately avoid pulling in jsdom / cheerio — the rewrite is shallow
// (regex on <img>/<link> tags) and we don't need DOM mutation. This keeps
// the script dep-free and the rewritten HTML byte-identical apart from the
// edits we make.

function attr(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")
  const m = tag.match(re)
  return m ? (m[1] != null ? m[1] : m[2]) : null
}

// Resolve a relative href against a spine doc's path (POSIX-style).
function resolveRelative(fromPath, href) {
  // strip query/fragment from href
  const clean = href.split(/[?#]/)[0]
  const base = path.posix.dirname(fromPath.replace(/\\/g, "/"))
  return path.posix.normalize(path.posix.join(base, clean))
}

// XML-escape for attribute values we inject.
function xmlAttrEscape(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ── 1. Container → OPF ────────────────────────────────────────────────────
const containerXml = epubReadText("META-INF/container.xml")
const opfMatch = containerXml.match(/full-path\s*=\s*"([^"]+)"/)
if (!opfMatch) { console.error("Could not find OPF in container.xml"); process.exit(1) }
const opfPath = opfMatch[1]
const opfDir  = path.posix.dirname(opfPath)
const opfXml  = epubReadText(opfPath)

// ── 2. Manifest: id → { href (resolved), media-type } ─────────────────────
const manifest = {}
for (const m of opfXml.matchAll(/<item\b[^>]*>/g)) {
  const tag = m[0]
  const id = attr(tag, "id")
  const href = attr(tag, "href")
  const mediaType = attr(tag, "media-type")
  if (!id || !href) continue
  manifest[id] = {
    id,
    href: path.posix.normalize(path.posix.join(opfDir, href)),
    rawHref: href,
    mediaType: mediaType || "",
  }
}

// ── 3. Spine: ordered list of item ids → ordered list of resolved hrefs ───
const spineRefs = []
for (const m of opfXml.matchAll(/<itemref\b[^>]*>/g)) {
  const idref = attr(m[0], "idref")
  if (!idref || !manifest[idref]) continue
  spineRefs.push(manifest[idref])
}
console.log(`spine entries: ${spineRefs.length}`)

// ── 4. Walk every spine doc once: collect images, CSS refs, and pages ─────
// We process spine docs in order and accumulate three things:
//   - imageBytesByInnerPath   → unique image files we've read from EPUB
//   - cssRefs                 → unique CSS files the spine docs link to
//   - spineParsed[]           → per-doc info: title, image references, rewritten html string

const imageBytesByInnerPath = new Map()  // innerPath → { sha, bytes, ext }
const cssRefs = new Set()                // resolved inner paths
const spineParsed = []                    // one entry per spine doc

for (let i = 0; i < spineRefs.length; i++) {
  const spineEntry = spineRefs[i]
  const spinePath = spineEntry.href
  let raw
  try { raw = epubReadText(spinePath) }
  catch (e) {
    console.warn(`  ! could not read spine doc ${spinePath}: ${(e.message || "").split("\n")[0]}`)
    spineParsed.push(null)
    continue
  }

  // Title resolution: <h1> > <h2> > section[title] > <title> > filename.
  // Most EPUBs (Barron's included) set <title> to the book title for every
  // chapter, which is useless for a chapter dropdown — so we prefer the
  // first heading text inside <body>.
  function stripTags(s) { return String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() }
  let title = ""
  const h1m = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (h1m) title = stripTags(h1m[1])
  if (!title) { const h2m = raw.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i); if (h2m) title = stripTags(h2m[1]) }
  if (!title) { const sm  = raw.match(/<section[^>]*\btitle\s*=\s*"([^"]+)"/i); if (sm) title = stripTags(sm[1]) }
  if (!title) { const tm  = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i); if (tm) title = stripTags(tm[1]) }
  if (!title) title = path.basename(spinePath, path.extname(spinePath))

  // Walk pagebreaks so we can stamp each <img> with the most recent page#.
  // Accept either of the two common shapes:
  //   <span epub:type="pagebreak" id="page_42" title="42"/>
  //   <a epub:type="pagebreak" id="page_42" title="42"></a>
  // We track {offset → page} pairs and resolve per-img via offset binary search.
  const pageBreaks = []  // [{offset, page}]
  const pbRe = /<(?:span|a|div)[^>]*\bepub:type\s*=\s*"pagebreak"[^>]*\btitle\s*=\s*"([^"]+)"[^>]*>/gi
  let pbm
  while ((pbm = pbRe.exec(raw)) !== null) {
    const t = pbm[1].trim()
    const n = Number(t)
    pageBreaks.push({ offset: pbm.index, page: Number.isFinite(n) ? n : null, raw: t })
  }
  function pageAtOffset(offset) {
    let cur = null
    for (const pb of pageBreaks) {
      if (pb.offset > offset) break
      if (pb.page != null) cur = pb.page
    }
    return cur
  }

  // Collect every <img> (or <image>) tag with its src + alt + offset.
  // We index them in DOCUMENT ORDER → that's our dom_index. We also track
  // per-inner-path occurrence_index so the admin can disambiguate when one
  // image file is referenced multiple times in the same chapter.
  const imageRefs = []
  const occurrenceCount = new Map()
  const imgRe = /<img\b[^>]*>/gi
  let im
  let domIndex = 0
  while ((im = imgRe.exec(raw)) !== null) {
    const tag = im[0]
    const src = attr(tag, "src")
    const alt = attr(tag, "alt") || ""
    if (!src) { domIndex++; continue }
    // Some EPUBs use schemes/inline data URIs; skip those.
    if (/^(?:data|https?|blob):/i.test(src)) { domIndex++; continue }
    const innerPath = resolveRelative(spinePath, src)
    const occ = occurrenceCount.get(innerPath) || 0
    occurrenceCount.set(innerPath, occ + 1)
    const page = pageAtOffset(im.index)
    imageRefs.push({
      offset: im.index,
      length: tag.length,
      tag,
      src,
      innerPath,
      alt,
      domIndex,
      occurrenceIndex: occ,
      page,
    })
    domIndex++
  }

  // Collect CSS hrefs (linked stylesheets only — inline <style> blocks ride
  // along inside the HTML and need no rewriting).
  const linkRe = /<link\b[^>]*>/gi
  let lm
  while ((lm = linkRe.exec(raw)) !== null) {
    const tag = lm[0]
    const rel = (attr(tag, "rel") || "").toLowerCase()
    if (!rel.includes("stylesheet")) continue
    const href = attr(tag, "href")
    if (!href) continue
    if (/^(?:data|https?):/i.test(href)) continue
    const cssInner = resolveRelative(spinePath, href)
    cssRefs.add(cssInner)
  }

  spineParsed.push({
    spinePath, title, raw, imageRefs, pageBreaks,
    spineIndex: i,
  })
}

// Read all unique image bytes so we can compute shas before rewriting HTML.
const allImagePaths = new Set()
for (const sp of spineParsed) {
  if (!sp) continue
  for (const ref of sp.imageRefs) allImagePaths.add(ref.innerPath)
}
console.log(`distinct image refs: ${allImagePaths.size}`)

let unreadable = 0
for (const innerPath of allImagePaths) {
  let bytes
  try { bytes = epubReadFile(innerPath) }
  catch (e) {
    console.warn(`  ! could not read image ${innerPath}: ${(e.message || "").split("\n")[0]}`)
    unreadable++
    continue
  }
  const sha = crypto.createHash("sha256").update(bytes).digest("hex")
  const ext = extOf(innerPath)
  imageBytesByInnerPath.set(innerPath, { sha, bytes, ext })
}
console.log(`read OK: ${imageBytesByInnerPath.size}, unreadable: ${unreadable}`)

// ── 5. Rewrite each spine doc & emit final HTML strings + per-image rows ──
const ASSET_PREFIX = `${R2_PUBLIC}/epub-assets/${TEXTBOOK_KEY}`
const SPINE_PREFIX = `${R2_PUBLIC}/epub-spine/${TEXTBOOK_KEY}`

// Map: cssInnerPath → relative href under the spine prefix (we keep the
// basename, dropping the path so styles live flat under styles/).
const cssOutputName = new Map()
for (const cssInner of cssRefs) {
  const base = path.basename(cssInner)
  cssOutputName.set(cssInner, `styles/${base}`)
}

// Track the running record of attached images for the manifest.
const allImagesManifest = []  // [{ spine_index, dom_index, occurrence_index, inner_path, sha, ext, url, alt, page }]

// Inject this script before </body> in every rewritten spine doc. It
// listens for clicks on any <img data-spine-index> and posts a structured
// message to window.parent so the admin UI can attach the clicked image
// to the focused question without ever leaving the iframe.
const POSTMSG_SCRIPT = `<script>(function(){
  if (window.parent === window) return;
  function send(img, ev){
    ev && ev.preventDefault && ev.preventDefault();
    window.parent.postMessage({
      type: "epub-image-click",
      spine_index: Number(img.getAttribute("data-spine-index") || -1),
      dom_index: Number(img.getAttribute("data-dom-index") || -1),
      occurrence_index: Number(img.getAttribute("data-occurrence-index") || 0),
      inner_path: img.getAttribute("data-inner-path") || "",
      page: img.getAttribute("data-page") ? Number(img.getAttribute("data-page")) : null,
      alt: img.getAttribute("alt") || "",
      url: img.src,
      width: img.naturalWidth, height: img.naturalHeight
    }, "*");
  }
  document.querySelectorAll("img[data-spine-index]").forEach(function(img){
    img.style.cursor = "crosshair";
    img.addEventListener("click", function(e){ send(img, e); });
    img.addEventListener("mouseenter", function(){ img.style.outline = "3px solid #5b8def"; img.style.outlineOffset = "2px"; });
    img.addEventListener("mouseleave", function(){ img.style.outline = ""; img.style.outlineOffset = ""; });
  });
})();</script>`

const spineUploads = []  // { spineIndex, key, html, contentType }
const spineDescs = []    // { index, path, title, html_url, image_count, page_first }

for (let i = 0; i < spineParsed.length; i++) {
  const sp = spineParsed[i]
  if (!sp) {
    spineDescs.push({ index: i, path: spineRefs[i].href, title: path.basename(spineRefs[i].href), html_url: null, image_count: 0, page_first: null })
    continue
  }
  // Build rewrites in order of offset (ascending) so we can splice the
  // string left-to-right with running offsets.
  const edits = []  // { start, end, replacement }

  for (const ref of sp.imageRefs) {
    const info = imageBytesByInnerPath.get(ref.innerPath)
    const url = info ? `${ASSET_PREFIX}/${info.sha}.${info.ext}` : ref.src
    // Build a fresh tag preserving original attrs but overriding src and
    // adding our data-* attrs.
    const original = ref.tag
    // Strip any existing src attribute and our data-* attrs (in case re-run).
    let cleaned = original
      .replace(/\bsrc\s*=\s*(?:"[^"]*"|'[^']*')/i, "")
      .replace(/\bdata-(spine-index|dom-index|occurrence-index|inner-path|page)\s*=\s*(?:"[^"]*"|'[^']*')/gi, "")
      .replace(/\s+/g, " ")
    // Insert our attrs just inside the tag (after <img).
    const dataAttrs = [
      `src="${xmlAttrEscape(url)}"`,
      `data-spine-index="${i}"`,
      `data-dom-index="${ref.domIndex}"`,
      `data-occurrence-index="${ref.occurrenceIndex}"`,
      `data-inner-path="${xmlAttrEscape(ref.innerPath)}"`,
      ref.page != null ? `data-page="${ref.page}"` : "",
    ].filter(Boolean).join(" ")
    const rewritten = cleaned.replace(/^<img\b/i, `<img ${dataAttrs}`)
    edits.push({ start: ref.offset, end: ref.offset + ref.length, replacement: rewritten })

    if (info) {
      allImagesManifest.push({
        spine_index: i,
        dom_index: ref.domIndex,
        occurrence_index: ref.occurrenceIndex,
        inner_path: ref.innerPath,
        sha: info.sha,
        ext: info.ext,
        url,
        alt: ref.alt,
        page: ref.page,
      })
    }
  }

  // Rewrite <link rel="stylesheet" href="..."> → href="styles/<base>"
  const linkRe = /<link\b[^>]*>/gi
  let lm
  while ((lm = linkRe.exec(sp.raw)) !== null) {
    const tag = lm[0]
    const rel = (attr(tag, "rel") || "").toLowerCase()
    if (!rel.includes("stylesheet")) continue
    const href = attr(tag, "href")
    if (!href) continue
    if (/^(?:data|https?):/i.test(href)) continue
    const cssInner = resolveRelative(sp.spinePath, href)
    const out = cssOutputName.get(cssInner)
    if (!out) continue
    const newHref = out
    const newTag = tag.replace(/\bhref\s*=\s*(?:"[^"]*"|'[^']*')/i, `href="${xmlAttrEscape(newHref)}"`)
    edits.push({ start: lm.index, end: lm.index + tag.length, replacement: newTag })
  }

  // Apply edits in order.
  edits.sort((a, b) => a.start - b.start)
  let out = ""
  let cursor = 0
  for (const e of edits) {
    if (e.start < cursor) continue   // overlapping (shouldn't happen)
    out += sp.raw.slice(cursor, e.start) + e.replacement
    cursor = e.end
  }
  out += sp.raw.slice(cursor)

  // Inject postMessage script just before </body>. If no </body> tag (some
  // EPUBs use SVG-only docs), skip — clicks aren't useful there anyway.
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${POSTMSG_SCRIPT}\n</body>`)
  }

  // Add a base meta to widen iframe — left as-is, no viewport hacks.
  const seq = String(i).padStart(3, "0")
  const r2Key = `epub-spine/${TEXTBOOK_KEY}/${seq}.html`
  const html_url = `${SPINE_PREFIX}/${seq}.html`

  spineUploads.push({ key: r2Key, body: out, contentType: "text/html; charset=utf-8" })

  const pageFirst = sp.imageRefs.find((r) => r.page != null)?.page
    ?? sp.pageBreaks.find((p) => p.page != null)?.page
    ?? null

  spineDescs.push({
    index: i,
    path: sp.spinePath,
    title: sp.title,
    html_url,
    image_count: sp.imageRefs.length,
    page_first: pageFirst,
  })
}

console.log(`spine docs to upload: ${spineUploads.length}`)
console.log(`images to upload:     ${imageBytesByInnerPath.size}`)
console.log(`css files to upload:  ${cssRefs.size}`)
console.log()

// ── 6. Upload (idempotent, parallel with bounded concurrency) ─────────────
// Run a worker pool over an array of async tasks. Returns once all done.
async function pool(items, concurrency, worker, label) {
  let i = 0, done = 0
  const total = items.length
  const t0 = Date.now()
  const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (true) {
      const idx = i++
      if (idx >= total) return
      try { await worker(items[idx], idx) } catch (e) {
        console.error(`  ! ${label} task ${idx} failed: ${(e.message || e).toString().split("\n")[0]}`)
      }
      done++
      if (done === total || done % 50 === 0) {
        const dt = ((Date.now() - t0) / 1000).toFixed(1)
        process.stdout.write(`  [${label}] ${done}/${total} (${dt}s)\n`)
      }
    }
  })
  await Promise.all(workers)
}

async function main() {
  const CONCURRENCY = 12
  let imgUp = 0, imgSkip = 0
  let spUp = 0
  let cssUp = 0, cssSkip = 0
  let epubUp = 0

  // Images
  if (APPLY) {
    await pool(
      Array.from(imageBytesByInnerPath.values()),
      CONCURRENCY,
      async (info) => {
        const key = `epub-assets/${TEXTBOOK_KEY}/${info.sha}.${info.ext}`
        if (await r2Has(key)) { imgSkip++; return }
        await r2Put(key, info.bytes, contentTypeFor(info.ext))
        imgUp++
      },
      "images"
    )
    console.log(`images:  uploaded ${imgUp}, already-present ${imgSkip}`)
  } else {
    console.log(`images:  would upload up to ${imageBytesByInnerPath.size}`)
  }

  // CSS files
  const cssEntries = [...cssRefs].map((cssInner) => ({ cssInner, out: cssOutputName.get(cssInner) })).filter((e) => e.out)
  if (APPLY) {
    await pool(cssEntries, CONCURRENCY, async ({ cssInner, out }) => {
      const key = `epub-spine/${TEXTBOOK_KEY}/${out}`
      let bytes
      try { bytes = epubReadFile(cssInner) }
      catch { cssSkip++; return }
      if (await r2Has(key)) { cssSkip++; return }
      await r2Put(key, bytes, contentTypeFor("css"))
      cssUp++
    }, "css")
    console.log(`css:     uploaded ${cssUp}, skipped ${cssSkip}`)
  } else {
    console.log(`css:     would upload up to ${cssEntries.length}`)
  }

  // Spine HTML — always overwrite (rewritten body can change run-to-run).
  if (APPLY) {
    await pool(spineUploads, CONCURRENCY, async (u) => {
      await r2Put(u.key, Buffer.from(u.body, "utf8"), u.contentType)
      spUp++
    }, "spine")
    console.log(`spine:   uploaded ${spUp}`)
  } else {
    console.log(`spine:   would upload ${spineUploads.length}`)
  }

  // Source EPUB itself (durable backup; lets the admin re-extract from R2
  // if the local file is gone)
  const epubKey = `sources/${TEXTBOOK_KEY}/source.epub`
  if (APPLY) {
    if (await r2Has(epubKey)) { epubSkip = 1 }
    else { await r2Put(epubKey, fs.readFileSync(epubPath), "application/epub+zip"); epubUp = 1 }
  } else {
    epubUp = 1
  }
  console.log(`epub:    ${APPLY ? (epubUp ? "uploaded" : "skipped (already present)") : "would upload (one-time)"}`)

  // ── 7. PATCH sources row ─────────────────────────────────────────────────
  // Look up the existing row so we can merge metadata rather than replace
  // it (other fields like authors, isbn, edition were set by populate-sources
  // and we don't want to clobber them).
  const existing = await rest("GET", `sources?textbook_key=eq.${encodeURIComponent(TEXTBOOK_KEY)}&select=id,metadata`)
  if (!Array.isArray(existing) || existing.length === 0) {
    console.warn(`! no public.sources row for textbook_key=${TEXTBOOK_KEY}. Run scripts/populate-sources.cjs first to register the source.`)
  } else {
    const cur = existing[0]
    const merged = {
      ...(cur.metadata || {}),
      epub_format: true,
      epub_storage_key:    epubKey,
      epub_spine_base_url: SPINE_PREFIX,
      epub_image_count:    imageBytesByInnerPath.size,
      epub_spine_count:    spineDescs.length,
      epub_spine:          spineDescs,
      epub_extracted_at:   new Date().toISOString(),
    }
    // Sources Studio reads `metadata.epub_format` to switch into EPUB mode.
    // We also clear pdf_storage_key so the UI doesn't try to load PDF.js
    // for EPUB-only sources. (If a source is somehow both, leave pdf_*
    // alone — the admin can clear it manually.)
    if (APPLY) {
      const patch = { metadata: merged }
      await rest("PATCH", `sources?id=eq.${cur.id}`, patch)
      console.log(`sources row id=${cur.id} updated (metadata.epub_*).`)
    } else {
      console.log(`would PATCH sources id=${cur.id} with metadata.epub_*.`)
    }
  }

  // ── 8. Manifest dump on disk for inspection ──────────────────────────────
  const manifestOut = path.join(path.dirname(epubPath), `${TEXTBOOK_KEY}-epub-manifest.json`)
  const manifestBlob = {
    textbook_key: TEXTBOOK_KEY,
    epub_path: epubPath,
    generated_at: new Date().toISOString(),
    spine: spineDescs,
    images: allImagesManifest,
  }
  fs.writeFileSync(manifestOut, JSON.stringify(manifestBlob, null, 2))
  console.log(`\nwrote inspection manifest: ${manifestOut}  (${allImagesManifest.length} image rows, ${spineDescs.length} spine rows)`)

  if (!APPLY) console.log("\n(dry-run — re-run with --apply to actually upload + PATCH)")
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1) })
