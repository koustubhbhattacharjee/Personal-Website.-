const fs = require("fs")
const path = require("path")
const os = require("os")

async function main() {
  const { chromium } = require("playwright")
  const { jsPDF } = await import("jspdf")

  const root = process.cwd()
  const outDir = path.join(root, "portfolio")
  fs.mkdirSync(outDir, { recursive: true })

  const chromePath = "/usr/bin/google-chrome"
  const sourceProfileRoot = path.join(os.homedir(), ".config", "google-chrome")
  const sourceDefaultProfile = path.join(sourceProfileRoot, "Default")
  const tempProfileRoot = path.join(os.tmpdir(), "scholar-portfolio-profile")

  fs.rmSync(tempProfileRoot, { recursive: true, force: true })
  fs.mkdirSync(tempProfileRoot, { recursive: true })
  if (fs.existsSync(path.join(sourceProfileRoot, "Local State"))) {
    fs.copyFileSync(
      path.join(sourceProfileRoot, "Local State"),
      path.join(tempProfileRoot, "Local State")
    )
  }
  if (!fs.existsSync(sourceDefaultProfile)) {
    throw new Error("Chrome Default profile was not found.")
  }
  fs.cpSync(sourceDefaultProfile, path.join(tempProfileRoot, "Default"), { recursive: true })

  const context = await chromium.launchPersistentContext(tempProfileRoot, {
    executablePath: chromePath,
    headless: true,
    viewport: { width: 1600, height: 1100 },
    args: [
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  })

  const page = context.pages()[0] || await context.newPage()

  const shots = []
  async function capture({ name, url, waitFor, after }) {
    await page.goto(url, { waitUntil: "networkidle", timeout: 120000 })
    if (waitFor) {
      await page.waitForSelector(waitFor, { timeout: 30000 })
    }
    if (after) {
      await after(page)
    }
    const file = path.join(outDir, `${name}.png`)
    await page.screenshot({ path: file, fullPage: true })
    shots.push({ name, file, url })
  }

  const aakashId = "2e1ea9b0-c9ef-80f6-8779-d6e28eeea1e9"
  const aakashSubjectId = "310ea9b0-c9ef-808f-bfb4-c7ce224a3b97"

  await capture({
    name: "admin-dashboard",
    url: "http://localhost:3000/admin?demo=1",
    waitFor: "text=Admin Dashboard",
  })

  await capture({
    name: "student-dashboard-overview",
    url: `http://localhost:3000/preview?demo=1&as=${aakashId}&subjectId=${aakashSubjectId}`,
    waitFor: "text=Click to begin",
    after: async (p) => {
      await p.goto(`http://localhost:3000/dashboard?demo=1&as=${aakashId}&subjectId=${aakashSubjectId}`, {
        waitUntil: "networkidle",
        timeout: 120000,
      })
      await p.waitForSelector("text=Practice Room", { timeout: 30000 })
      await p.waitForTimeout(2500)
    }
  })

  await capture({
    name: "student-practice-room",
    url: `http://localhost:3000/preview?demo=1&as=${aakashId}&subjectId=${aakashSubjectId}`,
    waitFor: "text=Click to begin",
    after: async (p) => {
      await p.goto(`http://localhost:3000/dashboard?demo=1&as=${aakashId}&subjectId=${aakashSubjectId}`, {
        waitUntil: "networkidle",
        timeout: 120000,
      })
      await p.waitForSelector("text=Practice Room", { timeout: 30000 })
      await p.getByRole("button", { name: "Practice Room" }).click()
      await p.waitForTimeout(2500)
    }
  })

  const pdf = new jsPDF({ unit: "pt", format: "a4" })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  function addWrapped(text, x, y, maxWidth, options = {}) {
    const lines = pdf.splitTextToSize(text, maxWidth)
    pdf.setFont(options.font || "helvetica", options.style || "normal")
    pdf.setFontSize(options.size || 12)
    pdf.setTextColor(...(options.color || [34, 48, 70]))
    pdf.text(lines, x, y)
    return y + lines.length * ((options.size || 12) + 3)
  }

  pdf.setFillColor(244, 247, 255)
  pdf.rect(0, 0, pageW, pageH, "F")
  pdf.setFillColor(223, 232, 255)
  pdf.roundedRect(36, 34, pageW - 72, pageH - 68, 18, 18, "F")
  pdf.setTextColor(36, 54, 83)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(26)
  pdf.text("Scholar", 54, 86)
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(15)
  pdf.text("Portfolio Case Study", 54, 110)
  let y = 150
  y = addWrapped(
    "Scholar is a tutoring platform that combines scheduling, assessment, content operations, and a 3D mastery interface. It is designed around tutor-led classes with live adaptation, FIFO topic planning, and a student-facing Practice Room built around Excalidraw and mastery objects.",
    54,
    y,
    pageW - 108,
    { size: 12, color: [59, 79, 110] }
  )
  y += 16
  y = addWrapped(
    "Highlights",
    54,
    y,
    pageW - 108,
    { size: 15, style: "bold", color: [36, 54, 83] }
  )
  y = addWrapped(
    "- Tutor-controlled end-of-class workflow and exit-ticket locking\n- Student dashboard with themed 3D progress visualization\n- Practice Room with Excalidraw, question-type arcs, and MCQ overlays\n- Admin dashboard for review, imports, scheduling, and question maintenance",
    54,
    y + 6,
    pageW - 108,
    { size: 11, color: [59, 79, 110] }
  )

  const captions = {
    "admin-dashboard": "Tutor admin operations: student context, review queue, scheduling, imports, and class-control flows.",
    "student-dashboard-overview": "Student dashboard overview: themed shell, mastery objects, assessments, homework, and session context.",
    "student-practice-room": "Practice Room: Excalidraw-centered practice surface with 3D mastery navigation and question overlays.",
  }

  shots.forEach((shot, index) => {
    if (index > 0) pdf.addPage()
    pdf.setFillColor(252, 253, 255)
    pdf.rect(0, 0, pageW, pageH, "F")
    pdf.setTextColor(36, 54, 83)
    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(18)
    pdf.text(shot.name.replace(/-/g, " "), 44, 46)
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(11)
    pdf.setTextColor(92, 112, 144)
    pdf.text(captions[shot.name] || "", 44, 66, { maxWidth: pageW - 88 })
    const img = fs.readFileSync(shot.file).toString("base64")
    const dataUrl = `data:image/png;base64,${img}`
    pdf.addImage(dataUrl, "PNG", 44, 88, pageW - 88, pageH - 150, undefined, "FAST")
  })

  const pdfPath = path.join(outDir, "scholar-portfolio-case-study.pdf")
  pdf.save(pdfPath)

  await context.close()

  console.log(JSON.stringify({
    pdf: pdfPath,
    screenshots: shots.map((s) => s.file),
  }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
