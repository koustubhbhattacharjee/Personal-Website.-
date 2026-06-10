const fs = require("fs")
const path = require("path")
const { jsPDF } = require("jspdf")

const root = process.cwd()
const inputPath = path.join(root, "docs", "app-logic-and-risk-reference.md")
const outputPath = path.join(root, "docs", "scholar-app-logic-reference.pdf")

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function splitWrapped(doc, text, width) {
  return doc.splitTextToSize(String(text || ""), width)
}

function renderMarkdownToPdf(markdown) {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 48
  const marginTop = 52
  const marginBottom = 48
  const contentWidth = pageWidth - marginX * 2

  let y = marginTop
  let inCode = false

  function addPageIfNeeded(extra = 16) {
    if (y + extra <= pageHeight - marginBottom) return
    doc.addPage()
    y = marginTop
  }

  function drawWrapped(text, opts = {}) {
    const {
      size = 11,
      leading = 16,
      font = "Times",
      style = "normal",
      color = [20, 24, 33],
      indent = 0,
    } = opts
    doc.setFont(font, style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lines = splitWrapped(doc, text, contentWidth - indent)
    for (const line of lines) {
      addPageIfNeeded(leading)
      doc.text(line, marginX + indent, y)
      y += leading
    }
  }

  function drawRule() {
    addPageIfNeeded(18)
    doc.setDrawColor(210, 215, 223)
    doc.line(marginX, y, pageWidth - marginX, y)
    y += 16
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n")

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ")

    if (line.trim().startsWith("```")) {
      inCode = !inCode
      y += 4
      continue
    }

    if (!inCode && /^# /.test(line)) {
      y += 8
      drawWrapped(line.replace(/^# /, ""), {
        size: 21,
        leading: 26,
        font: "Helvetica",
        style: "bold",
        color: [26, 36, 58],
      })
      y += 4
      continue
    }

    if (!inCode && /^## /.test(line)) {
      y += 8
      drawWrapped(line.replace(/^## /, ""), {
        size: 16,
        leading: 22,
        font: "Helvetica",
        style: "bold",
        color: [38, 54, 84],
      })
      y += 2
      continue
    }

    if (!inCode && /^### /.test(line)) {
      y += 6
      drawWrapped(line.replace(/^### /, ""), {
        size: 13,
        leading: 18,
        font: "Helvetica",
        style: "bold",
        color: [58, 75, 107],
      })
      continue
    }

    if (!inCode && line.trim() === "---") {
      drawRule()
      continue
    }

    if (!line.trim()) {
      y += inCode ? 8 : 10
      continue
    }

    if (inCode) {
      drawWrapped(line, {
        size: 9.5,
        leading: 13,
        font: "Courier",
        style: "normal",
        color: [70, 45, 35],
        indent: 10,
      })
      continue
    }

    if (/^\- /.test(line)) {
      drawWrapped(`• ${line.replace(/^\- /, "")}`, {
        size: 11,
        leading: 16,
        font: "Times",
        style: "normal",
        color: [20, 24, 33],
        indent: 8,
      })
      continue
    }

    if (/^\d+\./.test(line)) {
      drawWrapped(line, {
        size: 11,
        leading: 16,
        font: "Times",
        style: "normal",
        color: [20, 24, 33],
        indent: 4,
      })
      continue
    }

    drawWrapped(line, {
      size: 11,
      leading: 16,
      font: "Times",
      style: "normal",
      color: [20, 24, 33],
    })
  }

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont("Helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(120, 128, 142)
    doc.text(`Scholar logic reference`, marginX, pageHeight - 20)
    doc.text(`${i} / ${pageCount}`, pageWidth - marginX - 28, pageHeight - 20)
  }

  return doc
}

function main() {
  const markdown = fs.readFileSync(inputPath, "utf8")
  const doc = renderMarkdownToPdf(markdown)
  ensureDir(outputPath)
  fs.writeFileSync(outputPath, Buffer.from(doc.output("arraybuffer")))
  console.log(`Wrote ${outputPath}`)
}

main()
