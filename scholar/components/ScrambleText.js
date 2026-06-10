import { useEffect, useRef, useState } from "react"

const GLYPHS = "!<>-_\\/[]{}=+*^?#$&%@~abcdefghijklmnopqrstuvwxyz0123456789"

export default function ScrambleText({
  text = "",
  duration = 700,
  className = "",
  onDone,
}) {
  const [display, setDisplay] = useState("")
  const rafRef = useRef(null)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const finalText = String(text || "")
    if (!finalText) {
      setDisplay("")
      doneRef.current?.()
      return
    }
    const start = performance.now()
    const step = (t) => {
      const progress = Math.min(1, (t - start) / duration)
      const revealCount = Math.floor(progress * finalText.length)
      let out = ""
      for (let i = 0; i < finalText.length; i++) {
        const ch = finalText[i]
        if (i < revealCount || ch === " " || ch === "\n" || ch === "\t") {
          out += ch
        } else {
          out += GLYPHS[(Math.random() * GLYPHS.length) | 0]
        }
      }
      setDisplay(out)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        setDisplay(finalText)
        doneRef.current?.()
      }
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [text, duration])

  return <span className={className}>{display}</span>
}
