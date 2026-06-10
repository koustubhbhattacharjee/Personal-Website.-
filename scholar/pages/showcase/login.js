import { useEffect, useState } from "react"
import { useRouter } from "next/router"

export default function ShowcaseLoginPage() {
  const router = useRouter()
  const initialCode = String(router.query.code || "").replace(/\D/g, "").slice(0, 6)
  const [code, setCode] = useState(initialCode)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (initialCode && initialCode !== code) setCode(initialCode)
  }, [initialCode]) // eslint-disable-line react-hooks/exhaustive-deps

  async function redeem(nextCode = code) {
    const clean = String(nextCode || "").replace(/\D/g, "").slice(0, 6)
    const cleanName = String(name || "").trim().slice(0, 60)
    if (!cleanName) {
      setError("Enter your name to continue.")
      return
    }
    if (clean.length !== 6) {
      setError("Enter a valid 6-digit code.")
      return
    }
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/showcase/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean, name: cleanName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) throw new Error(data?.error || "Failed to open showcase")
      try { localStorage.setItem("scholar-showcase-viewer-name", cleanName) } catch {}
      router.replace("/showcase")
    } catch (err) {
      setError(err.message || "Failed to open showcase")
    } finally {
      setBusy(false)
    }
  }

  const bg = "#14110e"

  const inputStyle = {
    width: "100%",
    padding: "10px 14px",
    borderRadius: 0,
    border: "1px solid rgba(242, 230, 216, 0.22)",
    background: "rgba(0, 0, 0, 0.35)",
    color: "#f2e6d8",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    letterSpacing: "0.12em",
    textAlign: "center",
    outline: "none",
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: bg,
        color: "#f2e6d8",
        fontFamily: "var(--font-mono)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        cursor: "default",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", maxWidth: 360, width: "100%" }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(242, 230, 216, 0.7)",
          marginBottom: 10,
        }}>
          Scholar Showcase
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#ffffff",
          marginBottom: 24,
        }}>
          Enter your name &amp; code
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          <input
            type="text"
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            placeholder="Your name"
            autoFocus
            style={inputStyle}
          />
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            style={{ ...inputStyle, letterSpacing: "0.3em", fontSize: 14 }}
          />
          <button
            onClick={() => redeem()}
            disabled={busy}
            style={{
              marginTop: 4,
              padding: "10px 16px",
              borderRadius: 0,
              border: "1px solid rgba(242, 230, 216, 0.4)",
              background: "rgba(0, 0, 0, 0.35)",
              color: "#ffffff",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.55 : 1,
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            {busy ? "Opening…" : "Open Showcase →"}
          </button>
        </div>
        {error ? (
          <div style={{
            marginTop: 14,
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "#ffbdbd",
          }}>
            {error}
          </div>
        ) : null}
      </div>
    </div>
  )
}
