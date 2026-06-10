import { useEffect, useState } from "react"
import MathText from "./MathText"
import ScrambleText from "./ScrambleText"
import styles from "../styles/QuestionPane.module.css"

const LETTERS = ["A", "B", "C", "D", "E", "F"]

function formatLockTime(iso) {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ""
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch { return "" }
}

export default function QuestionPane({
  question,
  arcTitle = "",
  questionIndex = 0,
  totalQuestions = 1,
  subjectId = "",
  questionTypeId = "",
  scratchOpen = false,
  onToggleScratch,
  onPrev,
  onNext,
  prevLabel = "",
  nextLabel = "",
  canPrev = false,
  canNext = false,
  onAnswer,
  lockedUntil = null,
  // FRQ wiring: parent passes a ref whose .current is the live Excalidraw API
  // (set by ExcalidrawDock's onApiReady). The "Submit for review" button
  // exports the current scene from this ref when the user picks "Draw work".
  // onFrSubmitted(key) is fired after a successful POST so the parent can
  // mark the question as Under Review in the cylinder.
  excalidrawApiRef = null,
  onFrSubmitted,
  // scratchHasContent: parent tracks the live Excalidraw element count via
  // ExcalidrawDock's onSceneChange. The Submit-for-review button is disabled
  // until either scratchHasContent (Draw mode) or a file is selected (Upload).
  scratchHasContent = false,
  // QT-level navigation: lets the user skip past remaining questions in this
  // QT and jump to the next/previous QT. Enabled separately from question-level
  // nav so the cylinder hierarchy can flip as well.
  onPrevArc,
  onNextArc,
  prevArcLabel = "",
  nextArcLabel = "",
  canPrevArc = false,
  canNextArc = false,
  // attempted: has THIS question been answered (or FRQ submitted) yet? Drives
  // the blink highlight on the Next-QT (or Next-question fallback) button.
  attempted = false,
}) {
  const [selected, setSelected] = useState(null)
  const [revealed, setRevealed] = useState(false)
  const [scrambleDone, setScrambleDone] = useState(false)
  const [flagOpen, setFlagOpen] = useState(false)
  const [flagReason, setFlagReason] = useState("")
  const [flagStatus, setFlagStatus] = useState("idle")
  const [frMode, setFrMode] = useState("excalidraw")  // "excalidraw" | "upload"
  const [frFile, setFrFile] = useState(null)
  const [frSubmitting, setFrSubmitting] = useState(false)
  const [frSubmitted, setFrSubmitted] = useState(false)
  const [frError, setFrError] = useState("")

  const questionKey = question?.key || ""

  useEffect(() => {
    setSelected(null)
    setRevealed(false)
    setScrambleDone(false)
    setFlagOpen(false)
    setFlagReason("")
    setFlagStatus("idle")
    setFrMode("excalidraw")
    setFrFile(null)
    setFrSubmitting(false)
    setFrSubmitted(false)
    setFrError("")
  }, [questionKey])

  if (!question) {
    return (
      <div className={styles.pane}>
        <div className={styles.empty}>No question selected</div>
      </div>
    )
  }

  const options = Array.isArray(question.options) ? question.options : []
  const correctIndex = Number.isInteger(question.correctIndex) ? question.correctIndex : null
  const isLocked = !!(lockedUntil && new Date(lockedUntil).getTime() > Date.now())
  const lockLabel = isLocked ? formatLockTime(lockedUntil) : ""

  function choose(i) {
    if (revealed || isLocked) return
    setSelected(i)
  }

  function submitAnswer() {
    if (revealed || selected == null || isLocked) return
    setRevealed(true)
    if (onAnswer && correctIndex != null && questionKey) {
      const result = selected === correctIndex ? "correct" : "wrong"
      onAnswer(result, questionKey)
    }
  }

  async function handleFrFileChoice(file) {
    if (!file) { setFrFile(null); return }
    const ok = ["image/jpeg", "image/png", "application/pdf"].includes(file.type)
    if (!ok) { setFrError("Only JPEG, PNG, or PDF files allowed."); setFrFile(null); return }
    if (file.size > 22 * 1024 * 1024) { setFrError("File too large (max 22 MB)."); setFrFile(null); return }
    setFrError("")
    setFrFile(file)
  }

  async function submitFreeResponse() {
    if (frSubmitted || frSubmitting || isLocked || !questionKey || !questionTypeId) return
    setFrError("")
    setFrSubmitting(true)
    try {
      const body = {
        questionKey: question?.qhash || questionKey,
        questionTypeId,
        subjectId,
        mode: "practice",
        workType: frMode,
      }
      if (frMode === "excalidraw") {
        const api = excalidrawApiRef?.current
        const elements = api?.getSceneElements?.() || []
        if (!api || !elements.length) {
          setFrError("Draw your work in the scratchpad first, or switch to Upload.")
          setFrSubmitting(false)
          return
        }
        const mod = await import("@excalidraw/excalidraw")
        const blob = await mod.exportToBlob({
          elements,
          appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff" },
          files: api.getFiles?.() || {},
          mimeType: "image/png",
        })
        const png = await new Promise((resolve, reject) => {
          const r = new FileReader()
          r.onloadend = () => resolve(String(r.result).split(",")[1] || "")
          r.onerror = reject
          r.readAsDataURL(blob)
        })
        body.excalidrawJson = { elements, appState: { viewBackgroundColor: "#ffffff" } }
        body.excalidrawPngBase64 = png
      } else {
        if (!frFile) {
          setFrError("Choose a file to upload, or switch to Draw work.")
          setFrSubmitting(false)
          return
        }
        const base64 = await new Promise((resolve, reject) => {
          const r = new FileReader()
          r.onloadend = () => resolve(String(r.result).split(",")[1] || "")
          r.onerror = reject
          r.readAsDataURL(frFile)
        })
        body.uploadBase64 = base64
        body.uploadMime = frFile.type
      }
      const res = await fetch("/api/student/submit-freeresponse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) throw new Error(data?.error || "Submission failed")
      setFrSubmitted(true)
      setFrSubmitting(false)
      onFrSubmitted?.(questionKey)
    } catch (err) {
      setFrError(err?.message || "Submission failed")
      setFrSubmitting(false)
    }
  }

  async function submitFlag() {
    if (!flagReason.trim() || !questionKey) return
    setFlagStatus("submitting")
    try {
      const res = await fetch("/api/student/flag-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionKey,
          questionTypeId: questionTypeId || null,
          subjectId: subjectId || null,
          reason: flagReason.trim(),
        }),
      })
      if (!res.ok) throw new Error("flag failed")
      setFlagStatus("done")
      setFlagReason("")
      setTimeout(() => {
        setFlagOpen(false)
        setFlagStatus("idle")
      }, 1400)
    } catch {
      setFlagStatus("error")
    }
  }

  const indexLabel = `${String(questionIndex + 1).padStart(2, "0")} / ${String(totalQuestions).padStart(2, "0")}`

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.eyebrow}>Question</span>
          <span className={styles.index}>{indexLabel}</span>
        </div>
        {onToggleScratch ? (
          <button type="button" className={styles.scratchToggle} onClick={onToggleScratch}>
            {scratchOpen ? "Close Scratchpad" : "Open Scratchpad"}
          </button>
        ) : null}
      </div>

      <div className={styles.scroll}>
        {arcTitle ? <div className={styles.qtTitle}>{arcTitle}</div> : null}

        {/* Shared stem header (figure + intro) for stem children. The
            student-facing data layer (lib/db.js getQuestionPool) injects
            this from the master row's stem_header_content, so non-master
            children inherit the figure even though their own
            stem_header_content column is null. */}
        {question.isStemChild && Array.isArray(question.stemHeader) && question.stemHeader.length > 0 ? (
          <div style={{
            background: "rgba(201,168,76,0.06)",
            borderLeft: "3px solid #c9a84c",
            padding: "10px 14px",
            borderRadius: 6,
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#c9a84c", marginBottom: 6, letterSpacing: 0.5 }}>STEM</div>
            {question.stemHeader.map((item, i) => {
              if (item?.type === "image" && item?.url) {
                return <img key={`stem-img-${i}`} src={item.url} alt={item.alt || "Stem figure"} style={{ maxWidth: "100%", borderRadius: 6, marginBottom: 8 }} />
              }
              if (item?.type === "text" && item?.value) {
                return <div key={`stem-txt-${i}`} style={{ marginBottom: 6 }}><MathText text={item.value} /></div>
              }
              return null
            })}
          </div>
        ) : null}

        {/* Question content: prefer the modern ordered_content array (text +
            images interleaved). Fall back to legacy imageUrl + plain text
            for old questions that don't have a structured content array. */}
        {Array.isArray(question.content) && question.content.length ? (
          <div className={styles.qContent}>
            {question.content.map((item, i) => {
              if (item?.type === "image" && item?.url) {
                return (
                  <div key={`qc-img-${i}`} className={styles.sourceImage}>
                    <img src={item.url} alt={item.alt || "Question figure"} style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 12 }} />
                  </div>
                )
              }
              if (item?.type === "text" && item?.value) {
                return (
                  <div key={`qc-txt-${i}`} className={styles.stem}>
                    {scrambleDone || i > 0 ? (
                      <MathText text={item.value} block />
                    ) : (
                      <ScrambleText
                        key={`scr-${questionKey}`}
                        text={item.value}
                        duration={700}
                        className={styles.stemScramble}
                        onDone={() => setScrambleDone(true)}
                      />
                    )}
                  </div>
                )
              }
              return null
            })}
          </div>
        ) : (
          <>
            {question.imageUrl ? (
              <div className={styles.sourceImage}>
                <img src={question.imageUrl} alt="Question source" />
              </div>
            ) : null}

            <div className={styles.stem}>
              {scrambleDone ? (
                <MathText text={question.question || ""} block />
              ) : (
                <ScrambleText
                  key={`scr-${questionKey}`}
                  text={question.question || ""}
                  duration={700}
                  className={styles.stemScramble}
                  onDone={() => setScrambleDone(true)}
                />
              )}
            </div>
          </>
        )}

        {isLocked ? (
          <div className={styles.lockedBanner}>
            <strong>Locked</strong>
            <span>Try this question again at {lockLabel}. Each question locks for 3 hours after an attempt.</span>
          </div>
        ) : null}

        {question.questionFormat === "free_response" ? (
          <PracticeFrBlock
            mode={frMode}
            onSetMode={(next) => {
              setFrMode(next)
              // Picking Draw work should automatically pop the scratchpad
              // open if it isn't already — otherwise the student has nothing
              // to draw on.
              if (next === "excalidraw" && !scratchOpen && onToggleScratch) onToggleScratch()
            }}
            file={frFile}
            onPickFile={handleFrFileChoice}
            disabled={frSubmitted || isLocked || frSubmitting}
            error={frError}
          />
        ) : options.length > 0 ? (
          <>
            <div className={styles.options}>
              {options.map((opt, i) => {
                const isSel = selected === i
                let cls = styles.option
                if (revealed && correctIndex != null) {
                  if (i === correctIndex) cls += " " + styles.optCorrect
                  else if (isSel) cls += " " + styles.optWrong
                } else if (isSel) {
                  cls += " " + styles.optSelected
                }
                return (
                  <button
                    key={i}
                    type="button"
                    className={cls}
                    onClick={() => choose(i)}
                    disabled={revealed || isLocked}
                  >
                    <span className={styles.optLetter}>{LETTERS[i] || String(i + 1)}</span>
                    <span><MathText text={typeof opt === "string" ? opt : (opt?.text || opt?.label || "")} /></span>
                  </button>
                )
              })}
            </div>
            {!revealed && !isLocked ? (
              <div className={styles.submitRow}>
                <button
                  type="button"
                  className={styles.submitBtn}
                  onClick={submitAnswer}
                  disabled={selected == null}
                >
                  Submit Answer
                </button>
              </div>
            ) : null}
          </>
        ) : null}

        {question.questionFormat === "free_response" && !isLocked ? (() => {
          const canSubmit = frMode === "excalidraw"
            ? scratchHasContent
            : !!frFile
          const submitTitle = frSubmitted
            ? "Submitted — under review"
            : !canSubmit
              ? (frMode === "excalidraw"
                  ? "Draw something in the scratchpad first"
                  : "Choose a file first")
              : "Submit your work for tutor review"
          return (
            <div className={styles.submitRow}>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={submitFreeResponse}
                disabled={frSubmitted || frSubmitting || !canSubmit}
                title={submitTitle}
              >
                {frSubmitted ? "Under review" : frSubmitting ? "Submitting…" : "Submit for review"}
              </button>
            </div>
          )
        })() : null}

        {revealed ? (
          (() => {
            const isCorrect = correctIndex != null && selected === correctIndex
            const correctLetter = correctIndex != null ? (LETTERS[correctIndex] || String(correctIndex + 1)) : ""
            const explanationText = (question.explanation && String(question.explanation).trim())
              || (question.answer && String(question.answer).trim())
              || ""
            return (
              <div
                className={[
                  styles.feedback,
                  isCorrect ? styles.fbCorrect : styles.fbWrong,
                ].filter(Boolean).join(" ")}
              >
                <strong>{isCorrect ? "Correct" : "Incorrect"}</strong>
                {!isCorrect && correctLetter ? (
                  <div className={styles.feedbackAnswer}>
                    Correct answer: <span>{correctLetter}</span>
                  </div>
                ) : null}
                {explanationText ? (
                  <MathText text={explanationText} />
                ) : (
                  !isCorrect ? <div className={styles.feedbackMuted}>No explanation available for this question.</div> : null
                )}
              </div>
            )
          })()
        ) : null}

        {(() => {
          // After answering, draw attention to the next logical destination:
          //   - If a Next QT exists → blink that button (cylinder hierarchy
          //     flips when the parent picks it up).
          //   - Otherwise → fall back to blinking Next question.
          const blinkNextArc = attempted && canNextArc && !!onNextArc
          const blinkNextQ = attempted && !blinkNextArc && canNext && !!onNext
          return (
            <>
              <div className={styles.navRow}>
                <button
                  type="button"
                  className={[styles.navBtn, styles.navPrev].join(" ")}
                  onClick={onPrev}
                  disabled={!canPrev || !onPrev}
                >
                  <span className={styles.navArrow} aria-hidden="true">←</span>
                  <span className={styles.navText}>{prevLabel || "Previous"}</span>
                </button>
                <button
                  type="button"
                  className={[styles.navBtn, styles.navNext, blinkNextQ ? styles.navBtnBlink : ""].filter(Boolean).join(" ")}
                  onClick={onNext}
                  disabled={!canNext || !onNext}
                >
                  <span className={styles.navText}>{nextLabel || "Next"}</span>
                  <span className={styles.navArrow} aria-hidden="true">→</span>
                </button>
              </div>
              <div className={styles.navRow}>
                <button
                  type="button"
                  className={[styles.navBtn, styles.navPrev].join(" ")}
                  onClick={onPrevArc}
                  disabled={!canPrevArc || !onPrevArc}
                  title={prevArcLabel || "Previous question type"}
                >
                  <span className={styles.navArrow} aria-hidden="true">⟸</span>
                  <span className={styles.navText}>{prevArcLabel || "Prev question type"}</span>
                </button>
                <button
                  type="button"
                  className={[styles.navBtn, styles.navNext, blinkNextArc ? styles.navBtnBlink : ""].filter(Boolean).join(" ")}
                  onClick={onNextArc}
                  disabled={!canNextArc || !onNextArc}
                  title={nextArcLabel || "Next question type"}
                >
                  <span className={styles.navText}>{nextArcLabel || "Next question type"}</span>
                  <span className={styles.navArrow} aria-hidden="true">⟹</span>
                </button>
              </div>
            </>
          )
        })()}

        <div className={styles.flagWrap}>
          {!flagOpen ? (
            <button type="button" className={styles.flagOpenBtn} onClick={() => setFlagOpen(true)}>
              Report an issue with this question
            </button>
          ) : (
            <div className={styles.flagForm}>
              <label className={styles.flagLabel}>What&apos;s wrong with this question?</label>
              <textarea
                className={styles.flagTextarea}
                value={flagReason}
                onChange={(e) => setFlagReason(e.target.value)}
                placeholder="e.g. wrong answer, typo, unclear wording…"
                disabled={flagStatus === "submitting" || flagStatus === "done"}
              />
              <div className={styles.flagActions}>
                <button
                  type="button"
                  className={[styles.flagBtn, styles.flagBtnPrimary].join(" ")}
                  onClick={submitFlag}
                  disabled={!flagReason.trim() || flagStatus === "submitting" || flagStatus === "done"}
                >
                  {flagStatus === "submitting" ? "Sending…" : flagStatus === "done" ? "Sent" : "Submit"}
                </button>
                <button
                  type="button"
                  className={styles.flagBtn}
                  onClick={() => { setFlagOpen(false); setFlagReason(""); setFlagStatus("idle") }}
                >
                  Cancel
                </button>
                {flagStatus === "error" ? (
                  <span className={[styles.flagStatus, styles.flagStatusError].join(" ")}>Failed, try again</span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PracticeFrBlock({ mode, onSetMode, file, onPickFile, disabled, error }) {
  const btnStyle = (active) => ({
    flex: 1,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 6,
    border: active ? "1px solid var(--gold, #c9a84c)" : "1px solid var(--border, #2d3340)",
    background: active ? "rgba(201,168,76,0.14)" : "transparent",
    color: active ? "var(--gold, #c9a84c)" : "inherit",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  })
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" disabled={disabled} onClick={() => onSetMode("excalidraw")} style={btnStyle(mode === "excalidraw")}>Draw work</button>
        <button type="button" disabled={disabled} onClick={() => onSetMode("upload")} style={btnStyle(mode === "upload")}>Upload</button>
      </div>
      {mode === "excalidraw" ? (
        <div style={{
          padding: 12,
          border: "1px dashed rgba(201,168,76,0.5)",
          borderRadius: 8,
          background: "rgba(201,168,76,0.06)",
          fontSize: 12,
          lineHeight: 1.5,
        }}>
          Draw your work in the <strong>scratchpad</strong> alongside this card. Submit captures whatever is currently on the canvas.
        </div>
      ) : (
        <div style={{
          padding: 12,
          border: "1px dashed rgba(201,168,76,0.5)",
          borderRadius: 8,
          background: "rgba(201,168,76,0.06)",
          fontSize: 12,
        }}>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            onChange={(e) => onPickFile(e.target.files?.[0] || null)}
            disabled={disabled}
            style={{ display: "block" }}
          />
          {file ? (
            <div style={{ marginTop: 8 }}>
              Selected: <strong>{file.name}</strong> ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </div>
          ) : null}
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>JPEG, PNG, or PDF. Max 22 MB.</div>
        </div>
      )}
      {error ? (
        <div style={{ fontSize: 12, color: "#d28a2b" }}>{error}</div>
      ) : null}
    </div>
  )
}
