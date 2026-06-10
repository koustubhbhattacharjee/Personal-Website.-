import { getServerSession } from "next-auth"
import sharp from "sharp"
import { google } from "googleapis"
import { PDFDocument } from "pdf-lib"
import { spawn } from "child_process"
import mammoth from "mammoth"
import { authOptions } from "../auth/[...nextauth]"
import {
  createWorksheetDraftId,
  saveWorksheetDraft,
  uploadWorksheetDraftBinary,
  worksheetDraftKeys,
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

function getGoogleAuth() {
  const clientEmail = String(process.env.GOOGLE_OCR_CLIENT_EMAIL || "").trim()
  const privateKey = String(process.env.GOOGLE_OCR_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim()
  const credentials = clientEmail && privateKey
    ? { client_email: clientEmail, private_key: privateKey }
    : undefined
  return new google.auth.GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    credentials,
  })
}

function textFromAnchor(layout, fullText = "") {
  const segments = layout?.textAnchor?.textSegments || []
  if (!segments.length) return ""
  return segments.map((segment) => {
    const start = Number(segment.startIndex || 0)
    const end = Number(segment.endIndex || 0)
    return fullText.slice(start, end)
  }).join("").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
}

function bboxFromLayout(layout, width = 1, height = 1) {
  const poly = layout?.boundingPoly || {}
  const normalized = Array.isArray(poly.normalizedVertices) && poly.normalizedVertices.length
    ? poly.normalizedVertices.map((v) => ({ x: Number(v.x || 0), y: Number(v.y || 0) }))
    : null
  const absolute = Array.isArray(poly.vertices) && poly.vertices.length
    ? poly.vertices.map((v) => ({
        x: width ? Number(v.x || 0) / width : 0,
        y: height ? Number(v.y || 0) / height : 0,
      }))
    : null
  const vertices = normalized || absolute || []
  if (!vertices.length) return { x: 0, y: 0, w: 1, h: 1 }
  const xs = vertices.map((v) => Math.max(0, Math.min(1, v.x)))
  const ys = vertices.map((v) => Math.max(0, Math.min(1, v.y)))
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys)
  return {
    x: minX,
    y: minY,
    w: Math.max(0.001, maxX - minX),
    h: Math.max(0.001, maxY - minY),
  }
}

async function processDocumentWithGoogle({ fileBase64, mimeType }) {
  const projectId = requireEnv("GOOGLE_OCR_PROJECT_ID")
  const location = requireEnv("GOOGLE_OCR_LOCATION")
  const processorId = requireEnv("GOOGLE_OCR_PROCESSOR_ID")
  const auth = getGoogleAuth()
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  const endpoint = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${typeof token === "string" ? token : token?.token || ""}`,
    },
    body: JSON.stringify({
      skipHumanReview: true,
      rawDocument: {
        content: fileBase64,
        mimeType,
      },
      processOptions: {
        ocrConfig: {
          enableImageQualityScores: false,
          enableSymbol: false,
        },
      },
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.message || `Document AI failed (${res.status})`)
  }
  const doc = data?.document || null
  if (process.env.GOOGLE_OCR_DEBUG === "1") {
    console.log("[worksheet-ocr] document stats:", JSON.stringify({
      hasDocument: !!doc,
      pages: Array.isArray(doc?.pages) ? doc.pages.length : 0,
      textLength: String(doc?.text || "").length,
      entities: Array.isArray(doc?.entities) ? doc.entities.length : 0,
      hasShardInfo: !!doc?.shardInfo,
      topKeys: Object.keys(data || {}).slice(0, 20),
      docKeys: doc ? Object.keys(doc).slice(0, 30) : [],
    }))
  }
  return doc
}

async function splitPdfIntoChunkBase64List(fileBase64, maxPages = 30) {
  const source = await PDFDocument.load(Buffer.from(fileBase64, "base64"), { ignoreEncryption: true })
  const pageIndices = source.getPageIndices()
  const chunks = []
  for (let start = 0; start < pageIndices.length; start += maxPages) {
    const pdf = await PDFDocument.create()
    const end = Math.min(start + maxPages, pageIndices.length)
    const copied = await pdf.copyPages(source, pageIndices.slice(start, end))
    copied.forEach((page) => pdf.addPage(page))
    const bytes = await pdf.save()
    chunks.push({
      startPage: start + 1,
      endPage: end,
      fileBase64: Buffer.from(bytes).toString("base64"),
    })
  }
  return { totalPages: pageIndices.length, chunks }
}

async function cropImageBuffer(buffer, bbox) {
  const image = sharp(buffer)
  const meta = await image.metadata()
  const width = Number(meta.width || 0)
  const height = Number(meta.height || 0)
  if (!width || !height) return null
  const left = Math.max(0, Math.floor(bbox.x * width))
  const top = Math.max(0, Math.floor(bbox.y * height))
  const cropWidth = Math.max(1, Math.floor(bbox.w * width))
  const cropHeight = Math.max(1, Math.floor(bbox.h * height))
  const safeWidth = Math.min(cropWidth, width - left)
  const safeHeight = Math.min(cropHeight, height - top)
  if (safeWidth <= 2 || safeHeight <= 2) return null
  return image.extract({ left, top, width: safeWidth, height: safeHeight }).png().toBuffer()
}

function mimeTypeForName(fileName = "") {
  const lower = String(fileName || "").toLowerCase()
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  return "application/pdf"
}

function decodeHtmlEntities(raw = "") {
  return String(raw || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

function normalizeDocxText(html = "") {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<(\/)?(p|div|li|tr|table|h1|h2|h3|h4|h5|h6|ul|ol)\b[^>]*>/gi, "\n")
      .replace(/<td\b[^>]*>/gi, " ")
      .replace(/<img\b[^>]*src=["'][^"']+["'][^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  )
}

async function extractDocxBlocksLocally({
  fileBase64,
  bucket,
  studentId,
  subjectId,
  draftId,
  keys,
}) {
  const buffer = Buffer.from(fileBase64, "base64")
  const blocks = []
  let blockCounter = 0

  const convertImage = mammoth.images.imgElement(async (image) => {
    const encoded = await image.read("base64")
    blockCounter += 1
    const imageUrl = await uploadWorksheetDraftBinary({
      bucket,
      studentId,
      subjectId,
      draftId,
      key: keys.blockImage(`b${blockCounter}`),
      body: Buffer.from(encoded, "base64"),
      contentType: image.contentType || "application/octet-stream",
    })
    blocks.push({
      id: `b${blockCounter}`,
      page: 1,
      order: blocks.length + 1,
      kind: "image",
      role: "unassigned",
      groupKey: "",
      imageUrl,
      bbox: { x: 0, y: 0, w: 1, h: 1 },
      pageImageUrl: "",
    })
    return { src: imageUrl || "embedded-docx-image" }
  })

  const result = await mammoth.convertToHtml({ buffer }, { convertImage })
  const text = normalizeDocxText(result.value || "")
  if (text) {
    const chunks = text
      .split(/\n{2,}/)
      .map((chunk) => String(chunk || "").trim())
      .filter(Boolean)
    for (const chunk of chunks) {
      blockCounter += 1
      blocks.push({
        id: `b${blockCounter}`,
        page: 1,
        order: blocks.length + 1,
        kind: "text",
        role: "unassigned",
        groupKey: "",
        text: chunk,
        confidence: 1,
        bbox: { x: 0, y: 0, w: 1, h: 1 },
        pageImageUrl: "",
      })
    }
  }

  return blocks
}

async function extractPdfBlocksWithPyMuPDF(fileBase64) {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["scripts/extract_pdf_blocks.py"], {
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
        reject(new Error(stderr.trim() || `PyMuPDF extractor failed (${code})`))
        return
      }
      try {
        resolve(JSON.parse(stdout || "{}"))
      } catch (err) {
        reject(new Error(`Failed to parse PyMuPDF output: ${err.message}`))
      }
    })
    child.stdin.write(JSON.stringify({ fileBase64 }))
    child.stdin.end()
  })
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
      fileBase64 = "",
      fileName = "worksheet.pdf",
      sourceLabel = "",
    } = req.body || {}

    if (!studentId || !subjectId || !fileBase64) {
      return res.status(400).json({ error: "studentId, subjectId, and fileBase64 are required" })
    }

    const bucket = requireEnv("R2_BUCKET")
    const mimeType = mimeTypeForName(fileName)
    const draftId = createWorksheetDraftId()
    const keys = worksheetDraftKeys(studentId, subjectId, draftId)

    await uploadWorksheetDraftBinary({
      bucket,
      studentId,
      subjectId,
      draftId,
      key: `${keys.source}${fileName.toLowerCase().endsWith(".docx") ? ".docx" : ".pdf"}`,
      body: Buffer.from(fileBase64, "base64"),
      contentType: mimeType,
    })

    const rawBlocks = []
    const pageImages = []
    let blockCounter = 0
    let ocrProvider = "local-pymupdf"
    let ocrModel = "native-pdf-blocks"
    console.log("[worksheet-ocr] starting extraction", JSON.stringify({
      fileName,
      mimeType,
      studentId,
      subjectId,
      draftId,
      extractionPath: mimeType === "application/pdf"
        ? "local-pymupdf-python"
        : mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ? "local-mammoth"
          : "google-document-ai",
    }))
    if (mimeType === "application/pdf") {
      const extracted = await extractPdfBlocksWithPyMuPDF(fileBase64)
      const rawPageImages = Array.isArray(extracted?.pageImages) ? extracted.pageImages : []
      const pageImageUrlByPage = new Map()
      for (const pageImage of rawPageImages) {
        const pageNo = Number(pageImage?.page || 0)
        if (!pageNo || !pageImage?.imageBase64) continue
        const pageImageUrl = await uploadWorksheetDraftBinary({
          bucket,
          studentId,
          subjectId,
          draftId,
          key: keys.pageImage(pageNo),
          body: Buffer.from(pageImage.imageBase64, "base64"),
          contentType: "image/png",
        })
        pageImages.push({
          page: pageNo,
          imageUrl: pageImageUrl,
          width: Number(pageImage?.width || 0),
          height: Number(pageImage?.height || 0),
        })
        pageImageUrlByPage.set(pageNo, pageImageUrl)
      }
      const extractedBlocks = Array.isArray(extracted?.blocks) ? extracted.blocks : []
      for (const block of extractedBlocks) {
        blockCounter += 1
        const pageNo = Number(block?.page || 0)
        const pageImageUrl = pageImageUrlByPage.get(pageNo) || ""
        if (block?.kind === "image" && block?.imageBase64) {
          const ext = String(block?.imageExt || "png").toLowerCase()
          const contentType = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png"
          const imageUrl = await uploadWorksheetDraftBinary({
            bucket,
            studentId,
            subjectId,
            draftId,
            key: keys.blockImage(`b${blockCounter}`),
            body: Buffer.from(block.imageBase64, "base64"),
            contentType,
          })
          rawBlocks.push({
            id: `b${blockCounter}`,
            page: pageNo,
            order: rawBlocks.length + 1,
            kind: "image",
            role: "unassigned",
            groupKey: "",
            imageUrl,
            bbox: block?.bbox || { x: 0, y: 0, w: 1, h: 1 },
            pageImageUrl,
          })
        } else if (block?.kind === "text" && String(block?.text || "").trim()) {
          rawBlocks.push({
            id: `b${blockCounter}`,
            page: pageNo,
            order: rawBlocks.length + 1,
            kind: "text",
            role: "unassigned",
            groupKey: "",
            text: String(block.text || "").trim(),
            confidence: 1,
            bbox: block?.bbox || { x: 0, y: 0, w: 1, h: 1 },
            pageImageUrl,
          })
        } else {
          blockCounter -= 1
        }
      }
      if (!rawBlocks.length) {
        throw new Error("PyMuPDF returned no usable blocks for this PDF")
      }
    } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const docxBlocks = await extractDocxBlocksLocally({
        fileBase64,
        bucket,
        studentId,
        subjectId,
        draftId,
        keys,
      })
      rawBlocks.push(...docxBlocks)
      ocrProvider = "local-mammoth"
      ocrModel = "docx-html-parser"
      if (!rawBlocks.length) {
        throw new Error("Local DOCX parsing returned no usable blocks")
      }
    } else {
      const chunkDocs = []
      const document = await processDocumentWithGoogle({ fileBase64, mimeType })
      chunkDocs.push({ offset: 0, document, range: "1-1" })
      ocrProvider = "google-document-ai"
      ocrModel = "layout-parser"
      for (const chunkDoc of chunkDocs) {
        const document = chunkDoc.document
        const pages = Array.isArray(document?.pages) ? document.pages : []
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
          const page = pages[pageIndex]
          const pageNo = chunkDoc.offset + pageIndex + 1
          const pageImageBase64 = page?.image?.content || ""
          const pageImageBuffer = pageImageBase64 ? Buffer.from(pageImageBase64, "base64") : null
          const pageImageKey = keys.pageImage(pageNo)
          let pageImageUrl = ""
          if (pageImageBuffer) {
            pageImageUrl = await uploadWorksheetDraftBinary({
              bucket,
              studentId,
              subjectId,
              draftId,
              key: pageImageKey,
              body: pageImageBuffer,
              contentType: "image/png",
            })
          }
          pageImages.push({ page: pageNo, imageUrl: pageImageUrl, width: Number(page?.image?.width || 0), height: Number(page?.image?.height || 0) })

          const textBlocks = Array.isArray(page?.blocks) ? page.blocks : []
          for (const block of textBlocks) {
            const text = textFromAnchor(block?.layout, document.text || "")
            if (!text) continue
            blockCounter += 1
            rawBlocks.push({
              id: `b${blockCounter}`,
              page: pageNo,
              order: rawBlocks.length + 1,
              kind: "text",
              role: "unassigned",
              groupKey: "",
              text,
              confidence: Number(block?.layout?.confidence || 0),
              bbox: bboxFromLayout(block?.layout, Number(page?.image?.width || 0), Number(page?.image?.height || 0)),
              pageImageUrl,
            })
          }
        }
      }
      if (!rawBlocks.length) throw new Error("Document AI returned no usable OCR blocks for this DOCX")
    }

    rawBlocks.sort((a, b) => (a.page - b.page) || (a.bbox?.y - b.bbox?.y) || (a.bbox?.x - b.bbox?.x) || (a.order - b.order))
    rawBlocks.forEach((block, index) => { block.order = index + 1 })

    const now = new Date().toISOString()
    const manifest = {
      version: 1,
      draftId,
      createdAt: now,
      updatedAt: now,
      status: "ocr_ready",
      studentId,
      subjectId,
      subjectName,
      sessionDate: sessionDate || "",
      source: {
        fileName,
        fileType: mimeType.includes("docx") ? "docx" : "pdf",
        sourceLabel,
        ocrProvider,
        ocrModel,
      },
      counts: {
        pages: pageImages.length,
        blocks: rawBlocks.length,
        imageBlocks: rawBlocks.filter((b) => b.kind === "image").length,
        textBlocks: rawBlocks.filter((b) => b.kind === "text").length,
      },
      pageImages,
    }

    await saveWorksheetDraft({
      bucket,
      studentId,
      subjectId,
      draftId,
      manifest,
      rawBlocks,
      groups: [],
    })

    console.log("[worksheet-ocr] extraction complete", JSON.stringify({
      draftId,
      fileName,
      ocrProvider,
      ocrModel,
      pages: pageImages.length,
      blocks: rawBlocks.length,
      textBlocks: rawBlocks.filter((block) => block.kind === "text").length,
      imageBlocks: rawBlocks.filter((block) => block.kind === "image").length,
    }))

    return res.status(200).json({
      ok: true,
      draftId,
      manifest,
      blocks: rawBlocks,
    })
  } catch (err) {
    console.error("worksheet-ocr error:", err)
    return res.status(500).json({ error: err.message || "OCR failed" })
  }
}
