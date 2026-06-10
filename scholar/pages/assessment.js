import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { useEffect, useState, useRef } from "react"
import dynamic from "next/dynamic"
import styles from "../styles/Assessment.module.css"
import MathText from "../components/MathText"

const TOTAL_TIME = 600 // 10 minutes

function shuffleQuestionOptions(q) {
  if (!q || !Array.isArray(q.options) || q.options.length < 2) return q
  const correctIndex = Number.isInteger(q.correctIndex) ? q.correctIndex : -1
  const indexed = q.options.map((opt, i) => ({ opt, i }))
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indexed[i], indexed[j]] = [indexed[j], indexed[i]]
  }
  const options = indexed.map((entry) => entry.opt)
  const newCorrect = indexed.findIndex((entry) => entry.i === correctIndex)
  return { ...q, options, correctIndex: newCorrect >= 0 ? newCorrect : correctIndex }
}
const Excalidraw = dynamic(
  () =>
    import("@excalidraw/excalidraw")
      .then((m) => m.Excalidraw || m.default)
      .catch(() => () => <div style={{ padding: 12, color: "#f0b3b3" }}>Scratchpad unavailable</div>),
  { ssr: false }
)

export default function AssessmentPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { subjectId, mode, as: asStudentId, previewIds, sessionDate, count, demo, showcase, token } = router.query
  const demoMode = demo === "1"

  const [phase, setPhase] = useState("loading")
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState(null)
  const [answered, setAnswered] = useState(false)
  const [answers, setAnswers] = useState([])
  const [timeLeft, setTimeLeft] = useState(TOTAL_TIME)
  const [submitResult, setSubmitResult] = useState(null)
  const [attemptId, setAttemptId] = useState(null)
  const [artifactState, setArtifactState] = useState({ status: "idle", pdfUrl: "", reportUrl: "" })
  const [loadingSeconds, setLoadingSeconds] = useState(0)
  const [scratchOpen, setScratchOpen] = useState(false)
  const [brushSize, setBrushSize] = useState(2)
  const [lockedMessage, setLockedMessage] = useState("")
  const [submitError, setSubmitError] = useState("")


  const lastFetchKeyRef = useRef("")
  const timerRef = useRef(null)
  const excalidrawApiRef = useRef(null)
  const artifactTriggeredRef = useRef(false)

  useEffect(() => {
    if (status === "unauthenticated" && !demoMode) router.replace("/")
  }, [status, router, demoMode])

  useEffect(() => {
    if (!router.isReady) return
    if (status === "authenticated" || demoMode) {
      if (!subjectId || !mode) return
      const fetchKey = JSON.stringify({
        subjectId,
        mode,
        asStudentId: asStudentId || "",
        previewIds: previewIds || "",
        sessionDate: sessionDate || "",
        count: count || "",
        demoMode,
        showcase: showcase || "",
        token: token || "",
      })
      if (lastFetchKeyRef.current === fetchKey) return
      lastFetchKeyRef.current = fetchKey
      artifactTriggeredRef.current = false
      clearInterval(timerRef.current)
      setPhase("loading")
      setQuestions([])
      setCurrentIndex(0)
      setSelectedOption(null)
      setAnswered(false)
      setAnswers([])
      setTimeLeft(TOTAL_TIME)
      setSubmitResult(null)
      setAttemptId(null)
      setArtifactState({ status: "idle", pdfUrl: "", reportUrl: "" })
      setLoadingSeconds(0)
      setLockedMessage("")
      setSubmitError("")

      // Start a countdown ticker while loading
      let elapsed = 0
      const ticker = setInterval(() => {
        elapsed++
        setLoadingSeconds(elapsed)
      }, 1000)

      const timeout = setTimeout(() => {
        clearInterval(ticker)
        setPhase("no-questions")
      }, 90000)

      fetch(`/api/student/assessment?subjectId=${subjectId}&mode=${mode}${asStudentId ? `&as=${asStudentId}` : ""}${previewIds ? `&previewIds=${encodeURIComponent(previewIds)}` : ""}${sessionDate ? `&sessionDate=${encodeURIComponent(sessionDate)}` : ""}${count ? `&count=${encodeURIComponent(count)}` : ""}${demoMode ? `&demo=1${showcase === "1" ? "&showcase=1" : ""}${token ? `&token=${encodeURIComponent(token)}` : ""}` : ""}`)
        .then(r => r.json())
        .then(data => {
          clearTimeout(timeout)
          clearInterval(ticker)
          setAttemptId(data.attemptId || null)
          if (data?.error) {
            setLockedMessage(data.error)
            setPhase("no-questions")
            return
          }
          if (data.locked) {
            setLockedMessage(data.message || "Exit ticket is locked.")
            setPhase("no-questions")
            return
          }
          const qs = data.questions || []
          if (qs.length === 0) {
            setPhase("no-questions")
            return
          }
          if (data.attemptStatus === "Completed" && data.result) {
            setQuestions(qs)
            setSubmitResult(data.result)
            setPhase("results")
            return
          }
          setQuestions(qs.map(shuffleQuestionOptions))
          setPhase("question")
          startTimer()
        })
        .catch(() => {
          clearTimeout(timeout)
          clearInterval(ticker)
          setPhase("no-questions")
        })
    }
  }, [router.isReady, status, subjectId, mode, asStudentId, previewIds, sessionDate, count, demoMode, showcase, token])

  useEffect(() => {
    if (phase !== "results" || !attemptId || !subjectId || !mode || asStudentId || demoMode || artifactTriggeredRef.current) return
    artifactTriggeredRef.current = true
    setArtifactState({ status: "saving", pdfUrl: "", reportUrl: "" })
    fetch("/api/student/persist-attempt-artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "assessment", subjectId, mode, attemptId, sessionDate: sessionDate || null }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error)
        setArtifactState({ status: "saved", pdfUrl: data.pdfUrl || "", reportUrl: data.reportUrl || "" })
        if (mode === "exit" && data?.reportUrl && typeof window !== "undefined") {
          const existing = JSON.parse(sessionStorage.getItem("sessionResults") || "{}")
          existing[subjectId] = existing[subjectId] || {}
          existing[subjectId].reportData = { ...(existing[subjectId].reportData || {}), reportUrl: data.reportUrl }
          sessionStorage.setItem("sessionResults", JSON.stringify(existing))
        }
      })
      .catch(() => setArtifactState({ status: "error", pdfUrl: "", reportUrl: "" }))
  }, [phase, attemptId, subjectId, mode, asStudentId, sessionDate, demoMode])

  useEffect(() => {
    if (phase === "no-questions") {
      const t = setTimeout(() => {
        const params = new URLSearchParams()
        if (asStudentId) params.set("as", asStudentId)
        if (subjectId) params.set("subjectId", subjectId)
        if (demoMode) {
          params.set("demo", "1")
          if (showcase === "1") params.set("showcase", "1")
          if (token) params.set("token", token)
        }
        const base = `/dashboard?${params.toString()}`
        router.replace(base)
      }, 2000)
      return () => clearTimeout(t)
    }
  }, [phase, asStudentId, subjectId, demoMode, showcase, token, router])

  function startTimer() {
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          handleTimeUp()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function handleTimeUp() {
    submitAnswers(answers)
  }

  function clearScratchpad() {
    const api = excalidrawApiRef.current
    if (!api) return
    api.updateScene({
      elements: [],
      appState: { ...api.getAppState(), selectedElementIds: {}, selectedGroupIds: {} },
      files: {},
    })
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

  function nextQuestion() {
    const q = questions[currentIndex]
    const correct = selectedOption === q.correctIndex
    const newAnswers = [
      ...answers,
      {
        notionQuestionId: q.notionQuestionId,
        questionTypeTitle: q.questionTypeTitle,
        unit: q.unit || "",
        standardCode: q.standardCode || "",
        questionKey: q.questionKey || "",
        correct,
        selectedIndex: selectedOption,
      }
    ]
    setAnswers(newAnswers)

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1)
      setSelectedOption(null)
      setAnswered(false)
    } else {
      clearInterval(timerRef.current)
      submitAnswers(newAnswers)
    }
  }

  async function submitAnswers(finalAnswers) {
    setPhase("submitting")
    setSubmitError("")
    try {
      // Load persisted preview weakness state to send as baseline
      const existingForState = JSON.parse(sessionStorage.getItem("sessionResults") || "{}")
      const previewState = asStudentId ? (existingForState[subjectId]?.previewState || null) : null

      const submitUrl = demoMode
        ? `/api/student/submit?demo=1${showcase === "1" ? "&showcase=1" : ""}${token ? `&token=${encodeURIComponent(token)}` : ""}`
        : "/api/student/submit"
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, mode, answers: finalAnswers, as: asStudentId || null, previewState, sessionDate: sessionDate || null, attemptId })
      })
      const result = await res.json()
      if (!res.ok || result?.error) {
        throw new Error(result?.error || "Failed to submit assessment.")
      }
      setSubmitResult(result)

      const existing = JSON.parse(sessionStorage.getItem("sessionResults") || "{}")
      const key = subjectId
      existing[key] = existing[key] || {}

      // Persist updated preview weakness state for next session
      if (result.previewState) {
        existing[key].previewState = result.previewState
      }

      if (mode === "pre") {
        existing[key].preDone = true
        existing[key].preScore = result.score
        existing[key].preTotal = result.total
        existing[key].weaknessMap = result.weaknessMap
        existing[key].preQuestions = finalAnswers.map((a, i) => ({
          topic: a.questionTypeTitle || a.topic || "Unknown",
          correct: a.correct,
          weaknessScore: result.updatedScores?.[i]?.weaknessScore ?? 0,
          loCode: a.standardCode || "",
          unit: a.unit || "",
        }))
        existing[key].wrongTopics = finalAnswers.filter(a => !a.correct).map(a => a.questionTypeTitle)
        if (result.swap?.triggered) {
          existing[key].swapTriggered = true
          existing[key].swappedIn = result.swap.swappedIn?.map(q => q.title) || []
          existing[key].swappedOut = result.swap.swappedOut?.map(q => q.title) || []
          if (result.swap.previewTopics?.length) {
            existing[key].previewTopics = result.swap.previewTopics
            // Store Scores DB row IDs for the exit ticket to use the buffered plan.
            existing[key].previewTopicIds = result.swap.previewTopics.map(q => q.id).filter(Boolean)
          }
          if (result.swap.sessionDate) {
            existing[key].sessionDate = result.swap.sessionDate
          }
        }
      } else {
        existing[key].exitDone = true
        existing[key].exitScore = result.score
        existing[key].exitTotal = result.total
        existing[key].weaknessMap = result.weaknessMap
        existing[key].exitQuestions = finalAnswers.map((a, i) => ({
          topic: a.questionTypeTitle || a.topic || "Unknown",
          correct: a.correct,
          weaknessScore: result.updatedScores?.[i]?.weaknessScore ?? 0,
          loCode: a.standardCode || "",
          unit: a.unit || "",
        }))
        // Clear any stored plan IDs after exit ticket.
        delete existing[key].previewTopics
        delete existing[key].previewTopicIds
      }

      sessionStorage.setItem("sessionResults", JSON.stringify(existing))
      setPhase("results")
    } catch (err) {
      console.error(err)
      setSubmitError(err?.message || "Assessment submission failed. Your score was not saved.")
      setPhase("question")
    }
  }

  const q = questions[currentIndex]
  const mins = Math.floor(timeLeft / 60)
  const secs = timeLeft % 60
  const timerWarning = timeLeft < 60

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{mode === "pre" ? "Pre-Class Assessment" : "Exit Ticket"}</h2>
          <div className={styles.meta}>{questions.length} questions · 10 minutes</div>
        </div>

        <div className={`${styles.timer} ${timerWarning ? styles.timerWarning : ""}`}>
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </div>

        <div className={styles.dots}>
          {questions.map((_, i) => {
            let cls = styles.dot
            if (i < currentIndex) {
              const a = answers[i]
              cls += " " + (a?.correct ? styles.dotCorrect : styles.dotWrong)
            } else if (i === currentIndex) {
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
            <span>Preparing your questions{loadingSeconds > 3 ? ` (${loadingSeconds}s)...` : "..."}</span>
          </div>
        )}

        {!!submitError && phase === "question" && (
          <div style={{
            margin: "0 0 14px",
            padding: "10px 12px",
            borderRadius: 10,
            background: "#fff0ef",
            border: "1px solid #e8b7b2",
            color: "#8b2f26",
            fontSize: 14,
            fontWeight: 600,
          }}>
            {submitError}
          </div>
        )}

        {phase === "no-questions" && (
          <div className={styles.loadingBox}>
            <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📭</div>
            <span style={{ fontWeight: 600, marginBottom: "8px" }}>
              {lockedMessage ? "Assessment unavailable" : "No questions available yet"}
            </span>
            <span style={{ fontSize: "0.9rem", opacity: 0.7 }}>
              {lockedMessage || "Heading back to dashboard..."}
            </span>
          </div>
        )}

        {phase === "submitting" && (
          <div className={styles.loadingBox}>
            <div className="spinner" />
            <span>Saving results...</span>
          </div>
        )}

        {phase === "question" && q && (
          <div className={styles.questionWorkspace} key={`${currentIndex}-${scratchOpen ? "open" : "closed"}`}>
            <div className={styles.workspaceToolbar}>
              <button
                type="button"
                className={styles.scratchToggle}
                onClick={() => setScratchOpen(v => !v)}
              >
                {scratchOpen ? "Hide Scratchpad" : "Open Scratchpad"}
              </button>
            </div>

            <div className={`${styles.workspaceStage} ${scratchOpen ? styles.workspaceStageSplit : ""}`}>
              <div className={`${styles.questionPane} ${scratchOpen ? styles.questionPaneShift : ""}`}>
                <div className={styles.questionCard}>
                  <div className={styles.qNumber}>Question {currentIndex + 1} of {questions.length}</div>
                  <div className={styles.qTopic}>{q.questionTypeTitle || q.topic}</div>

                  {Array.isArray(q.content) && q.content.length ? (
                    <div className={styles.qContent}>
                      {q.content.map((item, itemIdx) => {
                        if (item?.type === "image" && item?.url) {
                          return (
                            <div key={`asm-qc-img-${itemIdx}`} className={styles.sourceImage}>
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
                            <div key={`asm-qc-txt-${itemIdx}`} className={styles.qText}>
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

                  <div className={styles.options}>
                    {(q.options || []).map((opt, i) => {
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
                          <span className={styles.optLetter}>{["A","B","C","D"][i]}</span>
                          <span><MathText text={opt} /></span>
                        </button>
                      )
                    })}
                  </div>

                  {answered && (
                    <div className={`${styles.feedback} ${selectedOption === q.correctIndex ? styles.fbCorrect : styles.fbWrong}`}>
                      {selectedOption === q.correctIndex ? "✓ Correct! " : "✗ Incorrect. "}
                      <MathText text={q.explanation} />
                    </div>
                  )}

                  {answered && (
                    <button className={`btn-gold ${styles.nextBtn}`} onClick={nextQuestion}>
                      {currentIndex < questions.length - 1 ? "Next Question →" : "See Results →"}
                    </button>
                  )}
                </div>
              </div>

              {scratchOpen && (
                <div className={styles.scratchPane}>
                  <div className={styles.scratchPanel}>
                    <div className={styles.scratchHeader}>
                      <span>Scratchpad</span>
                      <div className={styles.scratchControls}>
                        <button
                          type="button"
                          className={styles.scratchToolBtn}
                          onClick={activateDrawTool}
                        >
                          Draw
                        </button>
                        <button
                          type="button"
                          className={styles.scratchToolBtn}
                          onClick={activatePanTool}
                        >
                          Pan
                        </button>
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
                        <button
                          type="button"
                          className={styles.scratchClear}
                          onClick={clearScratchpad}
                        >
                          Clear
                        </button>
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

        {phase === "results" && submitResult && (
          <ResultsView
            answers={answers}
            result={submitResult}
            mode={mode}
            artifactState={artifactState}
            onBack={() => {
              const base = `/dashboard?subjectId=${subjectId}${asStudentId ? `&as=${asStudentId}` : ""}`
              router.replace(base)
            }}
          />
        )}
      </div>

    </div>
  )
}

function ResultsView({ answers, result, mode, artifactState, onBack }) {
  const correct = result.score
  const total = result.total
  const pct = Math.round((correct / total) * 100)
  const circumference = 2 * Math.PI * 48
  const dash = (pct / 100) * circumference
  const color = pct >= 67 ? "var(--green)" : pct >= 34 ? "var(--gold)" : "var(--red)"

  return (
    <div className={styles.results}>
      <div className={styles.scoreRing}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="48" fill="none" stroke="var(--border)" strokeWidth="8"/>
          <circle
            cx="60" cy="60" r="48" fill="none"
            stroke={color} strokeWidth="8"
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
        {mode === "pre"
          ? result.swap?.triggered
            ? "↕ Topics swapped — your weak areas are now in today's session."
            : "Assessment complete. Today's lesson is on track."
          : "Exit ticket done. Weakness scores updated."}
      </p>
      {artifactState?.status === "saving" && (
        <p className={styles.resultSub}>Saving PDF in the background...</p>
      )}
      {artifactState?.status === "saved" && (
        <p className={styles.resultSub}>
          Attempt PDF saved.
          {artifactState?.reportUrl ? " Session report saved too." : ""}
        </p>
      )}
      {artifactState?.status === "error" && (
        <p className={styles.resultSub}>PDF persistence failed, but your assessment result still saved.</p>
      )}

      {result.swap?.triggered && (
        <div className={styles.fafoBox}>
          <strong>⚡ FIFO Applied</strong>
          <div style={{ marginTop: 8 }}>
            <div><strong>Swapped in:</strong> {result.swap.swappedIn?.map(q => q.title).join(", ")}</div>
            <div><strong>Pushed to next class:</strong> {result.swap.swappedOut?.map(q => q.title).join(", ")}</div>
          </div>
        </div>
      )}

      <div className={styles.breakdown}>
        {answers.map((a, i) => (
          <div key={i} className={`${styles.bItem} ${a.correct ? styles.bCorrect : styles.bWrong}`}>
            <span>{a.questionTypeTitle || a.topic}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {!a.correct && <span className="tag tag-red">+1 weakness</span>}
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--text-muted)" }}>
                Weakness: {result.updatedScores?.[i]?.weaknessScore ?? 0}
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
