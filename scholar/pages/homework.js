import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import styles from "../styles/Assessment.module.css"
import MathText from "../components/MathText"

const Excalidraw = dynamic(
  () =>
    import("@excalidraw/excalidraw")
      .then((m) => m.Excalidraw || m.default)
      .catch(() => () => <div style={{ padding: 12, color: "#f0b3b3" }}>Scratchpad unavailable</div>),
  { ssr: false }
)

export default function HomeworkPage() {
  const { status } = useSession()
  const router = useRouter()
  const { subjectId, as: asStudentId, demo, showcase, token } = router.query
  const demoMode = demo === "1"

  const [phase, setPhase] = useState("loading")
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [answers, setAnswers] = useState([])
  const [result, setResult] = useState(null)
  const [attemptId, setAttemptId] = useState(null)
  const [artifactState, setArtifactState] = useState({ status: "idle", pdfUrl: "" })
  const [cycleKey, setCycleKey] = useState("")
  const [lockedMessage, setLockedMessage] = useState("")
  const [scratchOpen, setScratchOpen] = useState(false)
  const [brushSize, setBrushSize] = useState(2)
  const [flagOpen, setFlagOpen] = useState(false)
  const [flagReason, setFlagReason] = useState("")
  const [flagStatus, setFlagStatus] = useState("idle") // idle | submitting | done | error
  const [frMode, setFrMode] = useState("excalidraw") // excalidraw | upload
  const [frUpload, setFrUpload] = useState(null) // { file, base64, mime }
  const [frHasExc, setFrHasExc] = useState(false)
  const [frSubmitting, setFrSubmitting] = useState(false)
  const [frError, setFrError] = useState("")
  const hasFetched = useRef(false)
  const excalidrawApiRef = useRef(null)
  const frExcalidrawApiRef = useRef(null)
  const artifactTriggeredRef = useRef(false)

  const dashboardHref = (() => {
    const params = new URLSearchParams()
    if (asStudentId) params.set("as", asStudentId)
    if (subjectId) params.set("subjectId", subjectId)
    if (demoMode) {
      params.set("demo", "1")
      if (showcase === "1") params.set("showcase", "1")
      if (token) params.set("token", token)
    }
    const qs = params.toString()
    return qs ? `/dashboard?${qs}` : "/dashboard"
  })()

  useEffect(() => {
    if (status === "unauthenticated" && !demoMode) router.replace("/")
  }, [status, demoMode, router])

  useEffect(() => {
    const canLoad = (status === "authenticated" || demoMode) && subjectId && !hasFetched.current
    if (!canLoad) return
    hasFetched.current = true
    const params = new URLSearchParams({ subjectId })
    if (asStudentId) {
      params.set("as", asStudentId)
      params.set("previewExit", "1")
    }
    if (demoMode) {
      params.set("demo", "1")
      if (showcase === "1") params.set("showcase", "1")
      if (token) params.set("token", token)
    }
    fetch(`/api/student/homework?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setAttemptId(data.attemptId || null)
        setCycleKey(data.cycleKey || data.cycle?.cycleKey || "")
        if (data.locked) {
          setLockedMessage(data.message || "Homework is locked right now.")
          setPhase("locked")
          return
        }
        if (data.noData || !data.questions?.length) {
          setPhase("no-questions")
          return
        }
        if (data.attemptStatus === "Completed" && data.result) {
          setQuestions(data.questions || [])
          setResult(data.result)
          setPhase("results")
          return
        }
        setQuestions(data.questions || [])
        setPhase("question")
      })
      .catch(() => setPhase("no-questions"))
  }, [status, subjectId, asStudentId, demoMode, showcase, token])

  useEffect(() => {
    if (phase !== "results" || !attemptId || !subjectId || asStudentId || demoMode || artifactTriggeredRef.current) return
    artifactTriggeredRef.current = true
    setArtifactState({ status: "saving", pdfUrl: "" })
    fetch("/api/student/persist-attempt-artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "homework", subjectId, attemptId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error)
        setArtifactState({ status: "saved", pdfUrl: data.pdfUrl || "" })
      })
      .catch(() => setArtifactState({ status: "error", pdfUrl: "" }))
  }, [phase, attemptId, subjectId, asStudentId, demoMode])

  function clearScratchpad() {
    const api = excalidrawApiRef.current
    if (!api) return
    api.updateScene({
      elements: [],
      appState: { ...api.getAppState(), selectedElementIds: {}, selectedGroupIds: {} },
      files: {},
    })
  }

  async function saveScratch(questionKey) {
    const api = excalidrawApiRef.current
    if (!api || !questionKey) return
    const elements = api.getSceneElements()
    if (!elements?.length) return
    try {
      const mod = await import("@excalidraw/excalidraw")
      if (!mod?.exportToBlob) return
      const blob = await mod.exportToBlob({
        elements,
        appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff" },
        files: api.getFiles?.() || {},
        mimeType: "image/png",
      })
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result.split(",")[1])
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
      fetch("/api/student/save-scratch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionKey, imageBase64: base64, subjectId }),
      }).catch(() => {})
    } catch {}
  }

  async function submitFlag(q) {
    if (!flagReason.trim()) return
    setFlagStatus("submitting")
    try {
      await fetch("/api/student/flag-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionKey: q.questionKey,
          questionTypeId: q.notionQuestionId,
          subjectId,
          reason: flagReason.trim(),
        }),
      })
      setFlagStatus("done")
      setFlagReason("")
      setTimeout(() => { setFlagOpen(false); setFlagStatus("idle") }, 1500)
    } catch {
      setFlagStatus("error")
    }
  }

  function applyBrushSize(next) {
    const clamped = Math.max(1, Math.min(8, next))
    setBrushSize(clamped)
    const api = excalidrawApiRef.current
    if (!api) return
    const appState = api.getAppState?.() || {}
    api.updateScene({
      appState: {
        ...appState,
        currentItemStrokeWidth: clamped,
      },
    })
  }

  function activatePanTool() {
    excalidrawApiRef.current?.setActiveTool?.({ type: "hand" })
  }

  function activateDrawTool() {
    excalidrawApiRef.current?.setActiveTool?.({ type: "freedraw" })
  }

  function selectOption(index) {
    if (answered) return
    setSelectedOption(index)
    setAnswered(true)
  }

  function resetFRState() {
    setFrMode("excalidraw")
    setFrUpload(null)
    setFrHasExc(false)
    setFrSubmitting(false)
    setFrError("")
  }

  async function handleFRUpload(file) {
    if (!file) { setFrUpload(null); return }
    const ok = ["image/jpeg", "image/png", "application/pdf"].includes(file.type)
    if (!ok) { setFrError("Only JPEG, PNG, or PDF files allowed."); return }
    if (file.size > 22 * 1024 * 1024) { setFrError("File too large (max 22 MB)."); return }
    const base64 = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onloadend = () => resolve(String(r.result).split(",")[1] || "")
      r.onerror = reject
      r.readAsDataURL(file)
    })
    setFrUpload({ file, base64, mime: file.type })
    setFrError("")
  }

  async function submitFreeResponse(q) {
    if (frSubmitting) return
    setFrSubmitting(true)
    setFrError("")
    try {
      const body = {
        questionKey: q.questionKey || "",
        questionTypeId: q.notionQuestionId,
        subjectId,
        mode: "homework",
        workType: frMode,
      }
      if (frMode === "excalidraw") {
        const api = frExcalidrawApiRef.current
        const elements = api?.getSceneElements?.() || []
        if (!elements.length) {
          setFrError("Draw your work on the canvas, or switch to upload.")
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
        if (!frUpload?.base64) {
          setFrError("Choose a file to upload, or switch to drawing.")
          setFrSubmitting(false)
          return
        }
        body.uploadBase64 = frUpload.base64
        body.uploadMime = frUpload.mime
      }
      const res = await fetch("/api/student/submit-freeresponse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || data?.error) throw new Error(data?.error || "Submission failed")
      setAnswered(true)
    } catch (err) {
      setFrError(err?.message || "Submission failed")
    } finally {
      setFrSubmitting(false)
    }
  }

  function nextQuestion() {
    const q = questions[currentIndex]
    saveScratch(q.questionKey)
    clearScratchpad()
    setFlagOpen(false)
    setFlagReason("")
    setFlagStatus("idle")

    const isFR = q.questionFormat === "free_response"
    const correct = isFR ? null : (selectedOption === q.correctIndex)
    const newAnswers = [
      ...answers,
      {
        notionQuestionId: q.notionQuestionId,
        questionTypeTitle: q.questionTypeTitle,
        topics: q.topics,
        questionKey: q.questionKey || "",
        correct,
        selectedIndex: isFR ? null : selectedOption,
        reviewStatus: isFR ? "pending" : "auto",
      },
    ]
    setAnswers(newAnswers)

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setSelectedOption(null)
      setAnswered(false)
      resetFRState()
    } else {
      submitHomework(newAnswers)
    }
  }

  async function submitHomework(finalAnswers) {
    const mcqAnswers = finalAnswers.filter((a) => a.reviewStatus !== "pending")
    const pendingCount = finalAnswers.length - mcqAnswers.length
    if (asStudentId && !demoMode) {
      setResult({
        score: mcqAnswers.filter((a) => a.correct).length,
        total: mcqAnswers.length,
        pendingReview: pendingCount,
        updatedScores: [],
        preview: true,
      })
      setPhase("results")
      return
    }
    setPhase("submitting")
    try {
      const params = new URLSearchParams()
      if (demoMode) {
        params.set("demo", "1")
        if (showcase === "1") params.set("showcase", "1")
        if (token) params.set("token", token)
      }
      const submitUrl = params.toString() ? `/api/student/submit-homework?${params.toString()}` : "/api/student/submit-homework"
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, answers: mcqAnswers, attemptId, cycleKey, as: asStudentId }),
      })
      const data = await res.json()
      setResult({ ...data, pendingReview: pendingCount })
      setPhase("results")
    } catch {
      setPhase("results")
    }
  }

  const q = questions[currentIndex]

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Homework</h2>
          <div className={styles.meta}>{questions.length} questions</div>
        </div>

        <div className={styles.timer}>
          {phase === "question" ? `${currentIndex + 1}/${questions.length}` : "HW"}
        </div>

        <div className={styles.dots}>
          {questions.map((_, i) => {
            let cls = styles.dot
            if (i < currentIndex) {
              const a = answers[i]
              cls += " " + (a?.correct ? styles.dotCorrect : styles.dotWrong)
            } else if (i === currentIndex && phase === "question") {
              cls += " " + styles.dotActive
            }
            return <div key={i} className={cls}>{i + 1}</div>
          })}
        </div>
      </header>

      <div className={styles.body}>
        {phase === "loading" && (
          <div className={styles.loadingBox}>
            <div className="spinner" />
            <span>Loading homework...</span>
          </div>
        )}

        {phase === "submitting" && (
          <div className={styles.loadingBox}>
            <div className="spinner" />
            <span>Saving results...</span>
          </div>
        )}

        {(phase === "locked" || phase === "no-questions") && (
          <div className={styles.loadingBox} style={{ flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", marginBottom: "12px" }}>{phase === "locked" ? "🔒" : "📚"}</div>
            <span style={{ fontWeight: 600, marginBottom: "8px" }}>
              {phase === "locked" ? "Homework locked" : "No homework today"}
            </span>
            <span style={{ fontSize: "0.9rem", opacity: 0.7 }}>
              {phase === "locked" ? lockedMessage : "Complete some assessments first to build your question bank."}
            </span>
            <button className="btn-gold" style={{ marginTop: 20, width: "100%", maxWidth: 260 }} onClick={() => router.replace(dashboardHref)}>
              Back to Dashboard
            </button>
          </div>
        )}

        {phase === "question" && q && (
          <div className={styles.questionWorkspace} key={`${currentIndex}-${scratchOpen ? "open" : "closed"}`}>
            <div className={styles.workspaceToolbar}>
              <button
                type="button"
                className={styles.scratchToggle}
                onClick={() => setScratchOpen((v) => !v)}
              >
                {scratchOpen ? "Hide Scratchpad" : "Open Scratchpad"}
              </button>
            </div>

            <div className={`${styles.workspaceStage} ${scratchOpen ? styles.workspaceStageSplit : ""}`}>
              <div className={`${styles.questionPane} ${scratchOpen ? styles.questionPaneShift : ""}`}>
                <div className={styles.questionCard}>
                  <div className={styles.qNumber}>Homework Question {currentIndex + 1} of {questions.length}</div>
                  <div className={styles.qTopic}>{q.questionTypeTitle || "Homework"}</div>

                  {q.isStemChild && Array.isArray(q.stemHeader) && q.stemHeader.length > 0 && (
                    <div style={{
                      background: "rgba(201,168,76,0.06)",
                      borderLeft: "3px solid #c9a84c",
                      padding: "10px 14px",
                      borderRadius: 6,
                      marginBottom: 14,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#c9a84c", marginBottom: 6, letterSpacing: 0.5 }}>STEM</div>
                      {q.stemHeader.map((item, i) => {
                        if (item?.type === "image" && item?.url) {
                          return <img key={`stem-img-${i}`} src={item.url} alt={item.alt || "Stem figure"} style={{ maxWidth: "100%", borderRadius: 6, marginBottom: 8 }} />
                        }
                        if (item?.type === "text" && item?.value) {
                          return <div key={`stem-txt-${i}`} style={{ marginBottom: 6 }}><MathText text={item.value} /></div>
                        }
                        return null
                      })}
                    </div>
                  )}

                  {Array.isArray(q.content) && q.content.length ? (
                    <div className={styles.qContent}>
                      {q.content.map((item, itemIdx) => {
                        if (item?.type === "image" && item?.url) {
                          return (
                            <div key={`hw-qc-img-${itemIdx}`} className={styles.sourceImage}>
                              <img
                                src={item.url}
                                alt={item.alt || "Question figure"}
                                style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 12 }}
                              />
                            </div>
                          )
                        }
                        if (item?.type === "text" && item?.value) {
                          return (
                            <div key={`hw-qc-txt-${itemIdx}`} className={styles.qText}>
                              <MathText text={item.value} block />
                            </div>
                          )
                        }
                        return null
                      })}
                    </div>
                  ) : (
                    <>
                      {q.sourceImage && (
                        <div className={styles.sourceImage}>
                          <img src={q.sourceImage} alt="Question source" style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 12 }} />
                        </div>
                      )}
                      <div className={styles.qText}><MathText text={q.question} block /></div>
                    </>
                  )}

                  {q.questionFormat === "free_response" ? (
                    <FreeResponseBlock
                      mode={frMode}
                      setMode={setFrMode}
                      upload={frUpload}
                      onUploadFile={handleFRUpload}
                      submitting={frSubmitting}
                      submitted={answered}
                      error={frError}
                      onSubmit={() => submitFreeResponse(q)}
                      excalidrawApiRef={frExcalidrawApiRef}
                      onExcChange={(elements) => setFrHasExc((elements?.length || 0) > 0)}
                      brushSize={brushSize}
                    />
                  ) : (
                    <div className={styles.options}>
                      {q.options?.map((opt, i) => {
                        let cls = styles.option
                        if (answered) {
                          if (i === q.correctIndex) cls += " " + styles.optCorrect
                          else if (i === selectedOption) cls += " " + styles.optWrong
                        } else if (i === selectedOption) {
                          cls += " " + styles.optSelected
                        }
                        return (
                          <button
                            key={i}
                            className={cls}
                            onClick={() => selectOption(i)}
                            disabled={answered}
                          >
                            <span className={styles.optLetter}>{["A", "B", "C", "D"][i]}</span>
                            <span><MathText text={opt} /></span>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {answered && q.questionFormat !== "free_response" && (
                    <div className={`${styles.feedback} ${selectedOption === q.correctIndex ? styles.fbCorrect : styles.fbWrong}`}>
                      {selectedOption === q.correctIndex ? "✓ Correct! " : "✗ Incorrect. "}
                      <MathText text={q.explanation} />
                    </div>
                  )}

                  {answered && q.questionFormat === "free_response" && (
                    <div style={{
                      padding: "12px 14px",
                      borderRadius: 8,
                      background: "rgba(212,168,76,0.12)",
                      border: "1px solid rgba(212,168,76,0.4)",
                      color: "#a78330",
                      marginTop: 14,
                      fontSize: 14,
                    }}>
                      Submitted for review. Your tutor will grade this shortly.
                    </div>
                  )}

                  {answered && (
                    <button className={`btn-gold ${styles.nextBtn}`} onClick={nextQuestion}>
                      {currentIndex < questions.length - 1 ? "Next Question →" : "See Results →"}
                    </button>
                  )}

                  <div style={{ marginTop: 12 }}>
                    {!flagOpen && (
                      <button
                        onClick={() => setFlagOpen(true)}
                        style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer", padding: "4px 0", textDecoration: "underline" }}
                      >
                        Report an issue with this question
                      </button>
                    )}
                    {flagOpen && (
                      <div style={{ marginTop: 8, padding: 12, border: "1px solid #e0c97a", borderRadius: 8, background: "#fffbea" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>What's wrong with this question?</div>
                        <textarea
                          value={flagReason}
                          onChange={e => setFlagReason(e.target.value)}
                          placeholder="e.g. wrong answer, typo, unclear wording..."
                          rows={3}
                          style={{ width: "100%", fontSize: 13, padding: 8, borderRadius: 6, border: "1px solid #ccc", resize: "vertical", boxSizing: "border-box" }}
                          disabled={flagStatus === "submitting" || flagStatus === "done"}
                        />
                        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                          <button
                            onClick={() => submitFlag(q)}
                            disabled={!flagReason.trim() || flagStatus === "submitting" || flagStatus === "done"}
                            style={{ fontSize: 13, padding: "5px 14px", borderRadius: 6, border: "none", background: "#c8a84b", color: "#fff", cursor: "pointer", fontWeight: 600 }}
                          >
                            {flagStatus === "submitting" ? "Sending..." : flagStatus === "done" ? "Sent!" : "Submit"}
                          </button>
                          <button
                            onClick={() => { setFlagOpen(false); setFlagReason(""); setFlagStatus("idle") }}
                            style={{ fontSize: 13, padding: "5px 14px", borderRadius: 6, border: "1px solid #ccc", background: "none", cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                          {flagStatus === "error" && <span style={{ fontSize: 12, color: "red", alignSelf: "center" }}>Failed, try again</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {scratchOpen && (
                <div className={styles.scratchPane}>
                  <div className={styles.scratchPanel}>
                    <div className={styles.scratchHeader}>
                      <span>Scratchpad</span>
                      <div className={styles.scratchControls}>
                        <button type="button" className={styles.scratchToolBtn} onClick={activateDrawTool}>Draw</button>
                        <button type="button" className={styles.scratchToolBtn} onClick={activatePanTool}>Pan</button>
                        <label className={styles.brushWrap}>
                          <span>Brush</span>
                          <input
                            type="range"
                            min="1"
                            max="8"
                            step="1"
                            value={brushSize}
                            onChange={(e) => applyBrushSize(parseInt(e.target.value, 10))}
                          />
                        </label>
                        <button type="button" className={styles.scratchClear} onClick={clearScratchpad}>Clear</button>
                      </div>
                    </div>
                    <div className={styles.scratchCanvas}>
                      <Excalidraw
                        excalidrawAPI={(api) => { excalidrawApiRef.current = api }}
                        initialData={{
                          appState: {
                            theme: "light",
                            viewBackgroundColor: "#ffffff",
                            currentItemStrokeColor: "#2c436f",
                            currentItemStrokeWidth: brushSize,
                          },
                        }}
                        UIOptions={{
                          canvasActions: { saveToActiveFile: false, loadScene: false, export: false },
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {phase === "results" && result && (
          <HomeworkResultsView
            result={result}
            artifactState={artifactState}
            onBack={() => router.replace(dashboardHref)}
          />
        )}
      </div>
    </div>
  )
}

function FreeResponseBlock({
  mode, setMode, upload, onUploadFile, submitting, submitted, error, onSubmit,
  excalidrawApiRef, onExcChange, brushSize,
}) {
  const fileInputRef = useRef(null)
  const disabled = submitted || submitting

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          onClick={() => setMode("excalidraw")}
          disabled={disabled}
          style={modeBtnStyle(mode === "excalidraw")}
        >
          Draw work
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          disabled={disabled}
          style={modeBtnStyle(mode === "upload")}
        >
          Upload image / PDF
        </button>
      </div>

      {mode === "excalidraw" ? (
        <div style={{
          height: 420,
          border: "1px solid rgba(201,168,76,0.35)",
          borderRadius: 8,
          overflow: "hidden",
          background: "#fff",
        }}>
          <Excalidraw
            excalidrawAPI={(api) => { excalidrawApiRef.current = api }}
            onChange={(elements) => onExcChange?.(elements)}
            initialData={{
              appState: {
                theme: "light",
                viewBackgroundColor: "#ffffff",
                currentItemStrokeColor: "#2c436f",
                currentItemStrokeWidth: brushSize || 2,
              },
            }}
            UIOptions={{ canvasActions: { saveToActiveFile: false, loadScene: false, export: false } }}
            viewModeEnabled={disabled}
          />
        </div>
      ) : (
        <div style={{
          padding: 18,
          border: "1px dashed rgba(201,168,76,0.5)",
          borderRadius: 8,
          background: "rgba(201,168,76,0.05)",
        }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            onChange={(e) => onUploadFile(e.target.files?.[0] || null)}
            disabled={disabled}
            style={{ display: "block", fontSize: 14 }}
          />
          {upload?.file && (
            <div style={{ marginTop: 10, fontSize: 13, color: "#555" }}>
              Selected: <strong>{upload.file.name}</strong> ({(upload.file.size / 1024 / 1024).toFixed(2)} MB)
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 12, color: "#888" }}>
            Accepted formats: JPEG, PNG, PDF. Max 22 MB.
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 10, color: "#b3261e", fontSize: 13 }}>{error}</div>
      )}

      {!submitted && (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="btn-gold"
          style={{ marginTop: 14, width: "100%" }}
        >
          {submitting ? "Submitting..." : "Submit for review"}
        </button>
      )}
    </div>
  )
}

function modeBtnStyle(active) {
  return {
    flex: 1,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    border: active ? "1px solid #c9a84c" : "1px solid #d8d8d8",
    background: active ? "rgba(201,168,76,0.15)" : "#fff",
    color: active ? "#8a6d1e" : "#555",
    cursor: "pointer",
  }
}

function HomeworkResultsView({ result, artifactState, onBack }) {
  const correct = result.score || 0
  const total = result.total || 0
  const pct = total ? Math.round((correct / total) * 100) : 0
  const circumference = 2 * Math.PI * 48
  const dash = total ? (pct / 100) * circumference : 0
  const color = pct >= 67 ? "var(--green)" : pct >= 34 ? "var(--gold)" : "var(--red)"

  return (
    <div className={styles.results}>
      <div className={styles.scoreRing}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="48" fill="none" stroke="var(--border)" strokeWidth="8" />
          <circle
            cx="60"
            cy="60"
            r="48"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
          />
        </svg>
        <div className={styles.scoreCenter}>
          <div className={styles.scoreNum} style={{ color }}>{correct}/{total}</div>
          <div className={styles.scorePct}>{pct}%</div>
        </div>
      </div>

      <h2 className={styles.resultTitle}>
        {pct >= 67 ? "Great work!" : pct >= 34 ? "Keep going!" : "Needs more work"}
      </h2>

      <p className={styles.resultSub}>
        {result.preview ? "Preview complete." : "Homework complete. Weakness scores updated."}
      </p>

      {!result.preview && artifactState?.status === "saving" && (
        <p className={styles.resultSub} style={{ marginTop: 8 }}>
          Saving PDF in the background...
        </p>
      )}

      {!result.preview && artifactState?.status === "saved" && (
        <p className={styles.resultSub} style={{ marginTop: 8 }}>
          Attempt PDF saved.
        </p>
      )}

      {!result.preview && artifactState?.status === "error" && (
        <p className={styles.resultSub} style={{ marginTop: 8, color: "var(--gold)" }}>
          PDF persistence failed, but your homework result still saved.
        </p>
      )}

      {result.updatedScores?.some((s) => s.comboReduction > 0) && (
        <div className={styles.fafoBox} style={{ color: "var(--gold-light)", background: "rgba(201,168,76,0.08)", borderColor: "rgba(201,168,76,0.18)" }}>
          <strong>Combo bonus applied</strong>
          <div style={{ marginTop: 8 }}>Consistent homework completion reduced some weakness scores.</div>
        </div>
      )}

      <div className={styles.breakdown}>
        {(result.updatedScores || []).map((item, i) => (
          <div key={i} className={`${styles.bItem} ${item.correct ? styles.bCorrect : styles.bWrong}`}>
            <span>{item.questionTypeTitle}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {item.comboReduction > 0 && <span className="tag tag-gold">-{item.comboReduction} combo</span>}
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--text-muted)" }}>
                Weakness: {item.weaknessScore?.toFixed(2)}
              </span>
            </div>
          </div>
        ))}
      </div>

      <button className="btn-gold" style={{ marginTop: 24, width: "100%" }} onClick={onBack}>
        Back to Dashboard
      </button>
    </div>
  )
}
