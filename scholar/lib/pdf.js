// Session Report PDF Generator
// Called server-side after exit ticket completion or window close
// Returns a base64 PDF string

export function generateSessionReportPDF(reportData) {
  // This runs client-side via jsPDF
  // Import jsPDF dynamically on the client
  return reportData // Pass to client for generation
}

async function buildPdfDoc(reportData) {
  const mod = await import("jspdf")
  const JsPdfCtor = mod?.jsPDF || mod?.default || mod
  const doc = new JsPdfCtor({ orientation: "portrait", unit: "mm", format: "a4" })

  const {
    studentName,
    subject,
    date,
    preAssessment,
    exitTicket,
    objectives,
    fafoTriggered,
    fafoTopics,
    weaknessScores,
    weaknessBaseline,
    trends,
    exitTicketMissed,
  } = reportData

  const W = 210
  const MARGIN = 20
  const COL = W - MARGIN * 2
  let y = MARGIN

  // ── Helpers ──────────────────────────────────
  function line(text, size = 11, bold = false, color = [30, 30, 30]) {
    doc.setFontSize(size)
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(text, COL)
    doc.text(lines, MARGIN, y)
    y += lines.length * (size * 0.4) + 2
  }

  function label(text, x, yPos, size = 9, color = [100, 100, 100]) {
    doc.setFontSize(size)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...color)
    doc.text(text, x, yPos)
  }

  function drawBarChart({ title, items, x, yPos, width, barHeight = 5, maxBars = 6, color = [40, 130, 80] }) {
    if (!items.length) return 0
    const max = Math.max(...items.map(i => i.value))
    const rows = items.slice(0, maxBars)
    let yCursor = yPos
    label(title, x, yCursor - 2, 9, [90, 90, 90])
    rows.forEach((row, idx) => {
      const barW = max ? Math.max(2, Math.round((row.value / max) * width)) : 2
      doc.setFillColor(...color)
      doc.rect(x, yCursor, barW, barHeight, "F")
      label(row.label, x + width + 4, yCursor + barHeight - 1, 8, [70, 70, 70])
      label(String(row.value), x + barW + 2, yCursor + barHeight - 1, 8, color)
      yCursor += barHeight + 3
      if (idx === rows.length - 1) yCursor += 2
    })
    return yCursor - yPos
  }

  function drawPieChart({ title, items, x, yPos, radius = 20, maxSlices = 6 }) {
    if (!items.length) return 0
    const total = items.reduce((sum, i) => sum + i.value, 0)
    if (!total) return 0
    const palette = [
      [79, 120, 202],
      [116, 163, 181],
      [143, 126, 196],
      [109, 143, 216],
      [197, 168, 76],
      [180, 95, 85],
    ]

    const rows = items.slice(0, maxSlices)
    const other = items.slice(maxSlices)
    if (other.length) {
      const otherVal = other.reduce((sum, i) => sum + i.value, 0)
      rows.push({ label: "Other", value: otherVal })
    }

    // Title above the pie (x/yPos is the pie center)
    label(title, x - radius, yPos - radius - 6, 9, [90, 90, 90])
    let startAngle = -Math.PI / 2
    rows.forEach((row, idx) => {
      const angle = (row.value / total) * Math.PI * 2
      const endAngle = startAngle + angle
      const steps = 18
      const points = []
      points.push([x, yPos]) // center
      for (let i = 0; i <= steps; i++) {
        const a = startAngle + (angle * i / steps)
        points.push([x + radius * Math.cos(a), yPos + radius * Math.sin(a)])
      }
      doc.setFillColor(...palette[idx % palette.length])
      // jsPDF `lines()` expects relative segments, not absolute points.
      const rel = []
      for (let i = 1; i < points.length; i++) {
        rel.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]])
      }
      doc.lines(rel, points[0][0], points[0][1], [1, 1], "F", true)
      startAngle = endAngle
    })

    // Legend
    const legendX = x + radius + 8
    const legendWidth = 70
    let legendY = yPos - radius
    rows.forEach((row, idx) => {
      const color = palette[idx % palette.length]
      doc.setFillColor(...color)
      doc.rect(legendX, legendY - 2.5, 3, 3, "F")
      const text = `${row.label} (${row.value})`
      doc.setFontSize(8)
      doc.setFont("helvetica", "normal")
      doc.setTextColor(70, 70, 70)
      const lines = doc.splitTextToSize(text, legendWidth)
      doc.text(lines, legendX + 6, legendY)
      legendY += lines.length * 4 + 1
    })

    const legendHeight = legendY - (yPos - radius)
    return Math.max(radius * 2 + 6, legendHeight)
  }

  function aggregateBy(items, key, filterFn = () => true) {
    const map = {}
    items.filter(filterFn).forEach(i => {
      const k = i[key]
      if (!k) return
      map[k] = (map[k] || 0) + 1
    })
    return Object.entries(map)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
  }

  function rule(color = [200, 200, 200]) {
    doc.setDrawColor(...color)
    doc.line(MARGIN, y, W - MARGIN, y)
    y += 5
  }

  function gap(n = 4) { y += n }

  function sectionHeader(text) {
    gap(3)
    line(text, 10, true, [100, 100, 100])
    rule([220, 220, 220])
  }

  function checkPage() {
    if (y > 270) { doc.addPage(); y = MARGIN }
  }

  // ── Header ───────────────────────────────────
  line("SCHOLAR", 22, true, [20, 20, 20])
  line("Session Report", 13, false, [100, 100, 100])
  gap(2)
  rule([40, 40, 40])

  line(`Student: ${studentName}`, 11, true)
  line(`Subject: ${subject}`, 11)
  line(`Date: ${date}`, 11)
  gap(6)

  // ── Summary ──────────────────────────────────
  sectionHeader("SESSION SUMMARY")

  const preScore = preAssessment?.score ?? "—"
  const preTotal = preAssessment?.total ?? 3
  const exitScore = exitTicketMissed ? "MISSED" : (exitTicket?.score ?? "—")
  const exitTotal = exitTicket?.total ?? 3

  line(`Pre-Class Assessment: ${preScore} / ${preTotal}`, 11)
  line(`Exit Ticket: ${exitScore}${exitTicketMissed ? "" : ` / ${exitTotal}`}`, 11)

  if (exitTicketMissed) {
    gap(2)
    line("⚠  Exit ticket was not completed within the 1-hour window.", 10, false, [180, 60, 60])
  }

  if (fafoTriggered) {
    gap(2)
    line("⚡ FIFO Triggered: at least one pre-class question was wrong.", 10, false, [180, 60, 60])
    line(`   Replaced objectives: ${fafoTopics?.join(", ") || "—"}`, 10, false, [180, 60, 60])
    line("   Remaining scheduled topics pushed to next session.", 10, false, [180, 60, 60])
  }

  // ── Learning Objectives ──────────────────────
  checkPage()
  sectionHeader("TODAY'S LEARNING OBJECTIVES")
  objectives?.forEach((obj, i) => {
    line(`${i + 1}. ${obj}${obj.includes("FIFO") ? " ⚡" : ""}`, 11)
  })

  // ── Negatives / Positives Charts ────────────
  const chartData = reportData.chartData || {}
  const qNeg = chartData.questionTypes?.negative || []
  const qPos = chartData.questionTypes?.positive || []
  const loNeg = chartData.los?.negative || []
  const loPos = chartData.los?.positive || []
  const unitNeg = chartData.units?.negative || []
  const unitPos = chartData.units?.positive || []
  const unitTotal = chartData.units?.total || []

  if (qNeg.length || qPos.length || loNeg.length || loPos.length || unitNeg.length || unitPos.length) {
    checkPage()
    sectionHeader("QUESTION TYPE PERFORMANCE")
    if (qNeg.length) { y += drawPieChart({ title: "Most Missed Question Types", items: qNeg, x: MARGIN + 22, yPos: y + 24, radius: 18 }) }
    if (qPos.length) { y += drawPieChart({ title: "Correct on First Try", items: qPos, x: MARGIN + 22, yPos: y + 24, radius: 18 }) }

    checkPage()
    sectionHeader("LEARNING OBJECTIVES (LO) PERFORMANCE")
    if (loNeg.length) { y += drawPieChart({ title: "Most Missed LO Codes", items: loNeg, x: MARGIN + 22, yPos: y + 24, radius: 18 }) }
    if (loPos.length) { y += drawPieChart({ title: "Strong LO Codes", items: loPos, x: MARGIN + 22, yPos: y + 24, radius: 18 }) }

    checkPage()
    sectionHeader("UNIT PERFORMANCE")
    if (unitTotal.length) {
      y += drawPieChart({ title: "Unit Weakness Share", items: unitTotal, x: MARGIN + 22, yPos: y + 24, radius: 18 })
    } else {
      if (unitNeg.length) { y += drawPieChart({ title: "Most Missed Units", items: unitNeg, x: MARGIN + 22, yPos: y + 24, radius: 18 }) }
      if (unitPos.length) { y += drawPieChart({ title: "Strong Units", items: unitPos, x: MARGIN + 22, yPos: y + 24, radius: 18 }) }
    }
  }

  // ── Pre-Class Breakdown ──────────────────────
  checkPage()
  sectionHeader("PRE-CLASS ASSESSMENT — BREAKDOWN")
  preAssessment?.questions?.forEach((q, i) => {
    const mark = q.correct ? "✓" : "✗"
    line(`${mark}  Q${i + 1}: ${q.topic}`, 11, false, q.correct ? [40, 130, 80] : [180, 60, 60])
    if (!q.correct) {
      line(`     Weakness score after this session: ${q.weaknessScore}`, 9, false, [130, 130, 130])
    }
  })

  // ── Exit Ticket Breakdown ────────────────────
  checkPage()
  sectionHeader("EXIT TICKET — BREAKDOWN")

  if (exitTicketMissed) {
    line("Exit ticket not completed. No data available.", 11, false, [130, 130, 130])
  } else {
    exitTicket?.questions?.forEach((q, i) => {
      const mark = q.correct ? "✓" : "✗"
      line(`${mark}  Q${i + 1}: ${q.topic}`, 11, false, q.correct ? [40, 130, 80] : [180, 60, 60])
      if (!q.correct) {
        line(`     Weakness score after this session: ${q.weaknessScore}`, 9, false, [130, 130, 130])
      }
    })
  }

  // ── Trends ───────────────────────────────────
  checkPage()
  sectionHeader("PERFORMANCE TRENDS")

  const improvements = (trends?.uptrend || [])
    .map(t => ({ label: t.topic, value: Math.max(0, (t.previousScore ?? t.currentScore) - t.currentScore) }))
    .filter(t => t.value > 0)
    .sort((a, b) => b.value - a.value)

  const declines = (trends?.downtrend || [])
    .map(t => ({ label: t.topic, value: Math.max(0, t.currentScore - (t.previousScore ?? 0)) }))
    .filter(t => t.value > 0)
    .sort((a, b) => b.value - a.value)

  const chartX = MARGIN
  const chartW = COL - 60
  if (improvements.length) {
    checkPage()
    const h = drawBarChart({
      title: "Biggest Improvements",
      items: improvements,
      x: chartX,
      yPos: y,
      width: chartW,
      color: [40, 130, 80],
    })
    y += h + 2
  }

  if (declines.length) {
    checkPage()
    const h = drawBarChart({
      title: "Biggest Declines",
      items: declines,
      x: chartX,
      yPos: y,
      width: chartW,
      color: [180, 60, 60],
    })
    y += h + 2
  }

  if (!improvements.length && !declines.length) {
    if (weaknessBaseline && weaknessScores && weaknessBaseline !== weaknessScores) {
      const changes = Object.keys({ ...weaknessBaseline, ...weaknessScores })
        .map(k => ({
          label: k,
          value: Math.round(((weaknessBaseline[k] || 0) - (weaknessScores[k] || 0)) * 100) / 100
        }))
        .filter(c => c.value !== 0)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

      if (changes.length) {
        const improvements2 = changes.filter(c => c.value > 0)
        const declines2 = changes.filter(c => c.value < 0).map(c => ({ ...c, value: Math.abs(c.value) }))

        if (improvements2.length) {
          checkPage()
          drawBarChart({
            title: "Improved (scores down) vs Baseline",
            items: improvements2,
            x: MARGIN,
            yPos: y,
            width: COL - 60,
            color: [40, 130, 80],
          })
          y += 6 + improvements2.length * 8
        }
        if (declines2.length) {
          checkPage()
          drawBarChart({
            title: "Worsened (scores up) vs Baseline",
            items: declines2,
            x: MARGIN,
            yPos: y,
            width: COL - 60,
            color: [180, 60, 60],
          })
          y += 6 + declines2.length * 8
        }
      } else {
        line("No session changes detected yet.", 10, false, [130, 130, 130])
      }
    } else {
      line("No session history available yet.", 10, false, [130, 130, 130])
    }
  }

  // ── Weakness Leaderboard ─────────────────────
  checkPage()
  sectionHeader("TOP WEAKNESS AREAS")

  const sorted = Object.entries(weaknessScores || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  if (sorted.length) {
    const weaknessItems = sorted.map(([topic, score]) => ({ label: topic, value: Number(score) }))
    checkPage()
    const h = drawBarChart({
      title: "Weakness Scores",
      items: weaknessItems,
      x: MARGIN,
      yPos: y,
      width: COL - 60,
      color: [180, 60, 60],
    })
    y += h + 2
  } else {
    line("No weakness data yet.", 10, false, [130, 130, 130])
  }

  // ── Baseline vs Session (preview) ───────────
  if (weaknessBaseline && weaknessScores && weaknessBaseline !== weaknessScores) {
    const changes = Object.keys({ ...weaknessBaseline, ...weaknessScores })
      .map(k => ({
        label: k,
        value: Math.round(((weaknessBaseline[k] || 0) - (weaknessScores[k] || 0)) * 100) / 100
      }))
      .filter(c => c.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

    if (changes.length) {
      checkPage()
      sectionHeader("SESSION CHANGE VS BASELINE")
      const improvements = changes.filter(c => c.value > 0)
      const declines = changes.filter(c => c.value < 0).map(c => ({ ...c, value: Math.abs(c.value) }))

      if (improvements.length) {
        checkPage()
        const h = drawBarChart({
          title: "Improved (scores down)",
          items: improvements,
          x: MARGIN,
          yPos: y,
          width: COL - 60,
          color: [40, 130, 80],
        })
        y += h + 2
      }
      if (declines.length) {
        checkPage()
        const h = drawBarChart({
          title: "Worsened (scores up)",
          items: declines,
          x: MARGIN,
          yPos: y,
          width: COL - 60,
          color: [180, 60, 60],
        })
        y += h + 2
      }
    }
  }

  // ── Footer ───────────────────────────────────
  gap(10)
  rule()
  line(`Generated by Scholar · ${new Date().toLocaleString()}`, 8, false, [160, 160, 160])

  // ── Save ─────────────────────────────────────
  return doc
}

export async function generatePdfBase64(reportData) {
  const doc = await buildPdfDoc(reportData)
  const dataUri = doc.output("datauristring")
  return dataUri.split(",")[1] || ""
}

async function buildAttemptPdfDoc(attemptData) {
  const mod = await import("jspdf")
  const JsPdfCtor = mod?.jsPDF || mod?.default || mod
  const doc = new JsPdfCtor({ orientation: "portrait", unit: "mm", format: "a4" })

  const {
    studentName,
    subject,
    date,
    kind,
    mode = "",
    score = 0,
    total = 0,
    questions = [],
    swap = null,
    updatedScores = [],
    preview = false,
    generatedAt = new Date().toISOString(),
  } = attemptData || {}

  const W = 210
  const MARGIN = 18
  const COL = W - MARGIN * 2
  let y = MARGIN
  const pct = total > 0 ? Math.round((score / total) * 100) : 0
  const accent = pct >= 67 ? [40, 130, 80] : pct >= 34 ? [197, 168, 76] : [180, 60, 60]
  const title = pct >= 67 ? "Great work!" : pct >= 34 ? "Keep going!" : "Needs more work"
  const isHomework = String(kind || "").toLowerCase().includes("homework")
  const subtitle = isHomework
    ? (preview ? "Preview complete." : "Homework complete. Weakness scores updated.")
    : mode === "pre"
      ? (swap?.triggered
        ? "Topics swapped — your weak areas are now in today's session."
        : "Assessment complete. Today's lesson is on track.")
      : "Exit ticket done. Weakness scores updated."
  const comboApplied = isHomework && (updatedScores || []).some((item) => Number(item?.comboReduction || 0) > 0)

  function line(text, size = 11, bold = false, color = [30, 30, 30]) {
    doc.setFontSize(size)
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(String(text || ""), COL)
    doc.text(lines, MARGIN, y)
    y += lines.length * (size * 0.4) + 2
  }

  function rule(color = [220, 220, 220]) {
    doc.setDrawColor(...color)
    doc.line(MARGIN, y, W - MARGIN, y)
    y += 5
  }

  function centered(text, yPos, size = 11, bold = false, color = [30, 30, 30]) {
    doc.setFontSize(size)
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setTextColor(...color)
    doc.text(String(text || ""), W / 2, yPos, { align: "center" })
  }

  function roundedBox(x, yPos, w, h, fill = [250, 250, 250], stroke = [225, 225, 225]) {
    doc.setFillColor(...fill)
    doc.setDrawColor(...stroke)
    doc.roundedRect(x, yPos, w, h, 3, 3, "FD")
  }

  function drawScoreRing(centerX, centerY, radius = 20, strokeWidth = 3.5) {
    doc.setDrawColor(225, 225, 225)
    doc.setLineWidth(strokeWidth)
    doc.circle(centerX, centerY, radius)

    doc.setDrawColor(...accent)
    const start = -Math.PI / 2
    const end = start + ((Math.max(0, Math.min(100, pct)) / 100) * Math.PI * 2)
    const steps = 40
    for (let i = 0; i < steps; i += 1) {
      const a0 = start + ((end - start) * i / steps)
      const a1 = start + ((end - start) * (i + 1) / steps)
      const x0 = centerX + radius * Math.cos(a0)
      const y0 = centerY + radius * Math.sin(a0)
      const x1 = centerX + radius * Math.cos(a1)
      const y1 = centerY + radius * Math.sin(a1)
      doc.line(x0, y0, x1, y1)
    }

    centered(`${score}/${total}`, centerY - 1, 14, true, accent)
    centered(`${pct}%`, centerY + 7, 10, false, [110, 110, 110])
  }

  function checkPage() {
    if (y > 270) {
      doc.addPage()
      y = MARGIN
    }
  }

  centered("SCHOLAR", y, 22, true, [20, 20, 20])
  y += 10
  centered(`${kind} Results`, y, 13, false, [100, 100, 100])
  y += 6
  rule([40, 40, 40])

  line(`Student: ${studentName}`, 11, true)
  line(`Subject: ${subject}`, 11)
  line(`Date: ${date}`, 11)
  y += 6

  drawScoreRing(W / 2, y + 26, 20, 3.5)
  y += 55

  centered(title, y, 16, true, [30, 30, 30])
  y += 8

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(110, 110, 110)
  const subLines = doc.splitTextToSize(subtitle, 120)
  doc.text(subLines, W / 2, y, { align: "center" })
  y += subLines.length * 4 + 6

  if (swap?.triggered) {
    const swappedIn = Array.isArray(swap?.swappedIn) ? swap.swappedIn.map((q) => q?.title).filter(Boolean).join(", ") : ""
    const swappedOut = Array.isArray(swap?.swappedOut) ? swap.swappedOut.map((q) => q?.title).filter(Boolean).join(", ") : ""
    const boxX = MARGIN
    const boxW = COL
    const boxH = 22 + (swappedIn ? 6 : 0) + (swappedOut ? 6 : 0)
    roundedBox(boxX, y, boxW, boxH, [253, 248, 235], [233, 215, 165])
    doc.setTextColor(120, 90, 20)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("FIFO Applied", boxX + 4, y + 7)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    let boxY = y + 13
    if (swappedIn) {
      const lines = doc.splitTextToSize(`Swapped in: ${swappedIn}`, boxW - 8)
      doc.text(lines, boxX + 4, boxY)
      boxY += lines.length * 4 + 1
    }
    if (swappedOut) {
      const lines = doc.splitTextToSize(`Pushed to next class: ${swappedOut}`, boxW - 8)
      doc.text(lines, boxX + 4, boxY)
    }
    y += boxH + 8
  }

  line("Breakdown", 11, true, [100, 100, 100])
  rule([220, 220, 220])

  if (comboApplied) {
    const boxX = MARGIN
    const boxW = COL
    const boxH = 20
    roundedBox(boxX, y, boxW, boxH, [253, 248, 235], [233, 215, 165])
    doc.setTextColor(120, 90, 20)
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.text("Combo bonus applied", boxX + 4, y + 7)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text("Consistent homework completion reduced some weakness scores.", boxX + 4, y + 13)
    y += boxH + 6
  }

  for (let index = 0; index < (questions || []).length; index += 1) {
    const q = questions[index] || {}
    checkPage()
    const itemX = MARGIN
    const itemW = COL
    const itemH = 19
    roundedBox(
      itemX,
      y,
      itemW,
      itemH,
      q.correct ? [245, 251, 246] : [253, 246, 246],
      q.correct ? [215, 235, 219] : [241, 220, 220]
    )
    doc.setFontSize(11)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...(q.correct ? [40, 130, 80] : [180, 60, 60]))
    doc.text(
      isHomework
        ? `${q.correct ? "Correct" : "Needs review"}`
        : `${q.correct ? "Correct" : "Needs review"} · Q${index + 1}`,
      itemX + 4,
      y + 7
    )
    doc.setTextColor(40, 40, 40)
    doc.text(doc.splitTextToSize(q.topic || q.questionTypeTitle || "Question", itemW - 8), itemX + 4, y + 13)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(120, 120, 120)
    const scoreMeta = q.weaknessScore != null
      ? `Weakness: ${typeof q.weaknessScore === "number" ? q.weaknessScore.toFixed(2) : q.weaknessScore}`
      : ""
    const comboMeta = isHomework && Number(q.comboReduction || 0) > 0 ? `-${q.comboReduction} combo` : ""
    const meta = isHomework
      ? [comboMeta, scoreMeta].filter(Boolean).join("   |   ")
      : [
          !q.correct ? "+1 weakness" : "",
          scoreMeta,
        ].filter(Boolean).join("   |   ")
    if (meta) doc.text(meta, itemX + 4, y + 18)
    y += itemH + 5
  }

  checkPage()
  y += 6
  rule()
  line(`Generated by Scholar · ${new Date(generatedAt).toLocaleString()}`, 8, false, [160, 160, 160])
  return doc
}

export async function generateAttemptPdfBase64(attemptData) {
  const doc = await buildAttemptPdfDoc(attemptData)
  const dataUri = doc.output("datauristring")
  return dataUri.split(",")[1] || ""
}

// Client-side PDF generation (called from the browser)
export async function generateAndDownloadPDF(reportData) {
  const doc = await buildPdfDoc(reportData)
  const { studentName, subject, date, generatedAt } = reportData
  const suffix = (generatedAt || "").replace(/[:.]/g, "").replace("T", "_").replace("Z", "")
  const filename = `${studentName.replace(/\s+/g, "_")}_${subject.replace(/\s+/g, "_")}_${date}${suffix ? "_" + suffix : ""}.pdf`
  doc.save(filename)
}
