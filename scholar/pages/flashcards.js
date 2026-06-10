import { useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { useEffect, useState, useRef } from "react"
import MathText from "../components/MathText"

export default function FlashcardsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { subjectId, as: asStudentId } = router.query

  const [flashcards, setFlashcards] = useState([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [noData, setNoData] = useState(false)
  const [done, setDone] = useState(false)
  const [sliding, setSliding] = useState(false) // conveyor belt slide state
  const hasFetched = useRef(false)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/")
  }, [status])

  useEffect(() => {
    if (status === "authenticated" && subjectId && !hasFetched.current) {
      hasFetched.current = true
      fetch(`/api/student/flashcards?subjectId=${subjectId}`)
        .then(r => r.json())
        .then(data => {
          if (data.noData || !data.flashcards?.length) setNoData(true)
          else setFlashcards(data.flashcards)
          setLoading(false)
        })
        .catch(() => { setLoading(false); setNoData(true) })
    }
  }, [status, subjectId])

  function next() {
    if (sliding) return
    setSliding(true)
    // Reset flip first, then slide
    setFlipped(false)
    setTimeout(() => {
      if (index < flashcards.length - 1) {
        setIndex(i => i + 1)
      } else {
        setDone(true)
      }
      setSliding(false)
    }, 400)
  }

  const card = flashcards[index]
  const remaining = flashcards.length - index

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.backBtn} onClick={() => router.replace(asStudentId ? `/dashboard?as=${asStudentId}` : "/dashboard")}>
          ← back
        </button>
        <div style={s.headerCenter}>
          <span style={s.headerTitle}>Flashcards</span>
          {!loading && !noData && !done && (
            <span style={s.headerSub}>{index + 1} of {flashcards.length}</span>
          )}
        </div>
        <div style={{ width: 60 }} />
      </div>

      {/* Body */}
      <div style={s.body}>
        {loading && (
          <div style={s.center}>
            <div style={s.spinner} />
            <p style={{ color: "#666", marginTop: 16, fontSize: 14 }}>Loading flashcards...</p>
          </div>
        )}

        {noData && !loading && (
          <div style={s.center}>
            <div style={s.emptyCard}>
              <div style={s.emptyEmoji}>🎯</div>
              <h2 style={s.emptyTitle}>No flashcards yet</h2>
              <p style={s.emptySub}>Topics appear here when your weakness score reaches 2 or higher.</p>
              <button style={s.btnBack} onClick={() => router.replace(asStudentId ? `/dashboard?as=${asStudentId}` : "/dashboard")}>← Back to dashboard</button>
            </div>
          </div>
        )}

        {done && !loading && (
          <div style={s.center}>
            <div style={s.emptyCard}>
              <div style={s.emptyEmoji}>✅</div>
              <h2 style={s.emptyTitle}>Deck complete</h2>
              <p style={s.emptySub}>You reviewed all {flashcards.length} cards. Keep it up.</p>
              <button style={s.btnGold} onClick={() => { setIndex(0); setFlipped(false); setDone(false) }}>
                Shuffle & Review Again
              </button>
              <button style={s.btnBack} onClick={() => router.replace(asStudentId ? `/dashboard?as=${asStudentId}` : "/dashboard")}>← Back to dashboard</button>
            </div>
          </div>
        )}

        {!loading && !noData && !done && card && (
          <div style={s.deckArea}>
            {/* Stack shadow cards behind */}
            {remaining >= 3 && <div style={{ ...s.shadowCard, ...s.shadow3 }} />}
            {remaining >= 2 && <div style={{ ...s.shadowCard, ...s.shadow2 }} />}
            {remaining >= 1 && <div style={{ ...s.shadowCard, ...s.shadow1 }} />}

            {/* Main flip card */}
            <div
              style={{
                ...s.flipWrapper,
                transform: sliding ? "translateX(-120%) rotateY(-15deg)" : "translateX(0) rotateY(0deg)",
                opacity: sliding ? 0 : 1,
                transition: sliding
                  ? "transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s"
                  : "transform 0.05s",
              }}
              onClick={() => !sliding && setFlipped(f => !f)}
            >
              {/* The card itself with 3D flip */}
              <div style={{
                ...s.cardInner,
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                transition: "transform 0.55s cubic-bezier(0.4,0,0.2,1)",
              }}>
                {/* FRONT */}
                <div style={s.cardFace}>
                  <div style={s.cardCornerTL}>Q</div>
                  <div style={s.cardCornerBR}>Q</div>

                  <div style={s.weaknessPip}>
                    {"▮".repeat(Math.min(Math.ceil(card.weaknessScore), 5))}
                    {"▯".repeat(Math.max(0, 5 - Math.ceil(card.weaknessScore)))}
                    <span style={s.pipLabel}>{card.weaknessScore?.toFixed(1)}</span>
                  </div>

                  <div style={s.cardTopic}>{card.title}</div>

                  {card.images?.[0] && (
                    <img src={card.images[0]} alt="" style={s.cardImg} />
                  )}

                  {card.questionText && (
                    <p style={s.cardQuestion}><MathText text={card.questionText} block /></p>
                  )}

                  <div style={s.tapHint}>tap to flip</div>
                </div>

                {/* BACK */}
                <div style={{ ...s.cardFace, ...s.cardBack }}>
                  <div style={{ ...s.cardCornerTL, color: "#4caf50" }}>A</div>
                  <div style={{ ...s.cardCornerBR, color: "#4caf50" }}>A</div>

                  <div style={s.answerLabel}>Answer</div>

                  {card.images?.[1] && (
                    <img src={card.images[1]} alt="" style={s.cardImg} />
                  )}

                  <p style={s.cardAnswerText}>
                    <MathText text={card.answer || "No answer provided — check your Notion page."} block />
                  </p>

                  <div style={s.tapHint}>tap to flip back</div>
                </div>
              </div>
            </div>

            {/* Actions — only show when flipped */}
            <div style={{
              ...s.actions,
              opacity: flipped && !sliding ? 1 : 0,
              transform: flipped && !sliding ? "translateY(0)" : "translateY(12px)",
              transition: "opacity 0.25s, transform 0.25s",
              pointerEvents: flipped && !sliding ? "auto" : "none",
            }}>
              <button style={s.btnUnsure} onClick={next}>
                Still unsure
              </button>
              <button style={s.btnGotIt} onClick={next}>
                Got it ✓
              </button>
            </div>

            {/* Progress bar */}
            <div style={s.progressBar}>
              <div style={{
                ...s.progressFill,
                width: `${((index + 1) / flashcards.length) * 100}%`,
              }} />
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#f7f3ec",
    color: "#2b2418",
    display: "flex",
    flexDirection: "column",
    fontFamily: "'DM Sans', sans-serif",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 28px",
    borderBottom: "1px solid #ddd4c6",
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "#80694b",
    cursor: "pointer",
    fontSize: 13,
    letterSpacing: "0.05em",
    width: 60,
    textAlign: "left",
  },
  headerCenter: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#2b2418",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  headerSub: {
    fontSize: 12,
    color: "#8f7c62",
  },
  body: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
  },
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: 32,
    height: 32,
    border: "2px solid #d6ccbc",
    borderTopColor: "#c9a84c",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  emptyCard: {
    background: "#fffdf8",
    border: "1px solid #e2d8c8",
    borderRadius: 20,
    padding: "48px 40px",
    maxWidth: 380,
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 22, fontWeight: 700, color: "#2b2418", margin: 0 },
  emptySub: { fontSize: 14, color: "#8a7a64", lineHeight: 1.6, margin: 0 },

  // Deck
  deckArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 28,
    position: "relative",
    width: "100%",
    maxWidth: 480,
  },

  // Shadow cards (deck effect)
  shadowCard: {
    position: "absolute",
    width: "calc(100% - 0px)",
    borderRadius: 20,
    background: "#fffdf8",
    border: "1px solid #e2d8c8",
  },
  shadow1: {
    height: "calc(100% - 8px)",
    top: 8,
    transform: "scale(0.97)",
    zIndex: 1,
    background: "#f6efe3",
  },
  shadow2: {
    height: "calc(100% - 16px)",
    top: 16,
    transform: "scale(0.94)",
    zIndex: 0,
    background: "#f0e8da",
  },
  shadow3: {
    height: "calc(100% - 24px)",
    top: 24,
    transform: "scale(0.91)",
    zIndex: -1,
    background: "#e9e1d3",
  },

  // Flip card
  flipWrapper: {
    width: "100%",
    perspective: "1000px",
    cursor: "pointer",
    position: "relative",
    zIndex: 2,
    willChange: "transform",
  },
  cardInner: {
    width: "100%",
    minHeight: 360,
    position: "relative",
    transformStyle: "preserve-3d",
    willChange: "transform",
  },
  cardFace: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    minHeight: 360,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
    background: "#fffdf8",
    border: "1px solid #e2d8c8",
    borderRadius: 20,
    padding: "36px 32px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    boxShadow: "0 18px 40px rgba(111, 92, 64, 0.12)",
  },
  cardBack: {
    transform: "rotateY(180deg)",
    background: "#f2fbf3",
    border: "1px solid #cfe2d2",
  },
  cardCornerTL: {
    position: "absolute",
    top: 20, left: 24,
    fontSize: 12,
    fontWeight: 700,
    color: "#b19a7c",
    letterSpacing: "0.1em",
  },
  cardCornerBR: {
    position: "absolute",
    bottom: 20, right: 24,
    fontSize: 12,
    fontWeight: 700,
    color: "#b19a7c",
    letterSpacing: "0.1em",
    transform: "rotate(180deg)",
  },
  weaknessPip: {
    fontSize: 10,
    color: "#c9a84c",
    letterSpacing: 3,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  pipLabel: {
    fontSize: 11,
    color: "#8f7c62",
    letterSpacing: 0,
    fontFamily: "monospace",
  },
  cardTopic: {
    fontSize: 20,
    fontWeight: 700,
    color: "#2b2418",
    textAlign: "center",
    lineHeight: 1.3,
  },
  cardImg: {
    maxWidth: "100%",
    maxHeight: 160,
    objectFit: "contain",
    borderRadius: 10,
    border: "1px solid #ddd4c6",
  },
  cardQuestion: {
    fontSize: 14,
    color: "#615749",
    lineHeight: 1.7,
    textAlign: "center",
    margin: 0,
    maxWidth: 360,
  },
  answerLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#4caf50",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
  },
  cardAnswerText: {
    fontSize: 15,
    color: "#4e463a",
    lineHeight: 1.8,
    textAlign: "center",
    margin: 0,
    maxWidth: 360,
  },
  tapHint: {
    position: "absolute",
    bottom: 20,
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: 11,
    color: "#b19a7c",
    letterSpacing: "0.08em",
    whiteSpace: "nowrap",
  },

  // Actions
  actions: {
    display: "flex",
    gap: 12,
    width: "100%",
  },
  btnUnsure: {
    flex: 1,
    padding: "14px 0",
    background: "none",
    border: "1px solid #d8b9b2",
    borderRadius: 12,
    color: "#c0392b",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: "0.02em",
  },
  btnGotIt: {
    flex: 1,
    padding: "14px 0",
    background: "none",
    border: "1px solid #bed7c2",
    borderRadius: 12,
    color: "#27ae60",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    letterSpacing: "0.02em",
  },

  // Progress
  progressBar: {
    width: "100%",
    height: 2,
    background: "#e6ddcf",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#c9a84c",
    borderRadius: 2,
    transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)",
  },

  // Buttons
  btnGold: {
    background: "#c9a84c",
    color: "#000",
    border: "none",
    borderRadius: 12,
    padding: "13px 32px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    letterSpacing: "0.02em",
    width: "100%",
  },
  btnBack: {
    background: "none",
    border: "none",
    color: "#80694b",
    fontSize: 13,
    cursor: "pointer",
    marginTop: 4,
  },
}
