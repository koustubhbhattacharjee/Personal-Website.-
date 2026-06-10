import { useMemo } from "react"
import katex from "katex"

function hasLatexDelimiters(text) {
  return /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]+?\\\]|\\\([^\n]+?\\\))/.test(text)
}

function looksLikeEquation(text) {
  const t = String(text || "").trim()
  if (!t) return false
  if (t.length > 140) return false
  if (/https?:\/\//i.test(t)) return false
  return /[=^_<>]|sqrt|frac|pi|theta|alpha|beta|gamma|\d+\s*\/\s*\d+/i.test(t)
}

function splitAsciiMathSegments(text) {
  const src = String(text || "")
  const re = /(\b(?:sqrt|sin|cos|tan|log|ln)\s*\([^)]*\)|\\[A-Za-z]+(?:\{[^{}]*\}){0,2}|[A-Za-z0-9(){}\[\],.\\]+(?:\s*[=^_<>+\-*/]\s*[A-Za-z0-9(){}\[\],.\\]+)+)/g
  const out = []
  let idx = 0
  let match
  while ((match = re.exec(src))) {
    if (match.index > idx) out.push({ type: "text", value: src.slice(idx, match.index) })
    out.push({ type: "math", value: match[0] })
    idx = re.lastIndex
  }
  if (idx < src.length) out.push({ type: "text", value: src.slice(idx) })
  return out
}

function repairBrokenAsciiMath(text) {
  let s = String(text || "")
  // Collapse over-escaped LaTeX commands like "\\\sqrt" to "\sqrt".
  s = s.replace(/\\{2,}(?=[A-Za-z])/g, "\\")
  // Normalize slash count before frac to a single LaTeX command slash.
  s = s.replace(/\\+frac/gi, "\\frac")
  s = s.replace(/\\+(sqrt|pi|theta|alpha|beta|gamma|sin|cos|tan|log|ln|le|ge|ne|to|cdot|times|left|right|begin|end|text|mathbf|mathrm|overrightarrow|vec|pm)\b/gi, "\\$1")
  // Common broken forms from escaped JSON loss:
  // "m=frac7n6", "frac7n6", "frac7/6", "frac(7,6)"
  // The (?<![A-Za-z]) lookbehind prevents these from chewing the leading prefix
  // of \tfrac, \dfrac, \cfrac (e.g. without it, \tfrac{1}{2} → \t\frac{1}{2}).
  s = s.replace(/(?<![A-Za-z])(?:\\)?frac\s*\(\s*([^,(){}\s]+)\s*,\s*([^(){}\s]+)\s*\)/gi, "\\frac{$1}{$2}")
  s = s.replace(/(?<![A-Za-z])(?:\\)?frac\s*\{\s*([^{}]+)\s*\}\s*\{\s*([^{}]+)\s*\}/gi, "\\frac{$1}{$2}")
  s = s.replace(/(?<![A-Za-z])(?:\\)?frac\s*([A-Za-z0-9.+\-*]+)\s*n\s*([A-Za-z0-9.+\-*]+)/gi, "\\frac{$1}{$2}")
  s = s.replace(/(?<![A-Za-z])(?:\\)?frac\s*([A-Za-z0-9.+\-*]+)\s*\/\s*([A-Za-z0-9.+\-*]+)/gi, "\\frac{$1}{$2}")
  // Handle \fracab style with no separators (single-char numerator/denominator).
  s = s.replace(/(?<![A-Za-z])\\frac\s*([A-Za-z0-9])\s*([A-Za-z0-9])/g, "\\frac{$1}{$2}")
  s = s.replace(/(?:^|[^\\A-Za-z])(sqrt|pi|theta|alpha|beta|gamma|sin|cos|tan|log|ln|le|ge|ne|to|cdot|times|mathbf|mathrm)\b/gi, (m, cmd) => m.replace(cmd, `\\${cmd}`))
  s = s.replace(/\\sqrt\s*([A-Za-z0-9])/g, "\\sqrt{$1}")
  // Missing slash before command after "=" or operator.
  s = s.replace(/([=+\-*/(]\s*)frac\{/g, "$1\\frac{")
  if (/^\s*frac\{/.test(s)) s = s.replace(/^\s*frac\{/, "\\frac{")
  return s
}

function asciiToLatexSafe(text) {
  let s = repairBrokenAsciiMath(text)
  s = s.replace(/<=/g, "\\le ")
  s = s.replace(/>=/g, "\\ge ")
  s = s.replace(/!=/g, "\\ne ")
  s = s.replace(/->/g, "\\to ")
  s = s.replace(/\bsqrt\s*\(([^)]+)\)/gi, "\\sqrt{$1}")
  s = s.replace(/\bpi\b/gi, "\\pi")
  s = s.replace(/\btheta\b/gi, "\\theta")
  s = s.replace(/\balpha\b/gi, "\\alpha")
  s = s.replace(/\bbeta\b/gi, "\\beta")
  s = s.replace(/\bgamma\b/gi, "\\gamma")
  s = s.replace(/(^|[\s(])([A-Za-z0-9]+)\s*\/\s*([A-Za-z0-9]+)(?=$|[\s),.;:])/g, "$1\\frac{$2}{$3}")
  return s
}

function splitLatexSegments(text) {
  const re = /(\$\$[\s\S]+?\$\$|\$[^$\n]+\$|\\\[[\s\S]+?\\\]|\\\([^\n]+?\\\))/g
  const out = []
  let idx = 0
  let match
  while ((match = re.exec(text))) {
    if (match.index > idx) out.push({ type: "text", value: text.slice(idx, match.index) })
    out.push({ type: "math", value: match[0] })
    idx = re.lastIndex
  }
  if (idx < text.length) out.push({ type: "text", value: text.slice(idx) })
  return out
}

function stripMathDelimiters(raw) {
  const s = String(raw || "")
  if (s.startsWith("$$") && s.endsWith("$$")) return { body: s.slice(2, -2), block: true }
  if (s.startsWith("\\[") && s.endsWith("\\]")) return { body: s.slice(2, -2), block: true }
  if (s.startsWith("$") && s.endsWith("$")) return { body: s.slice(1, -1), block: false }
  if (s.startsWith("\\(") && s.endsWith("\\)")) return { body: s.slice(2, -2), block: false }
  return { body: s, block: false }
}

export default function MathText({ text, block = false, className, style }) {
  const raw = repairBrokenAsciiMath(String(text || ""))
  const rendered = useMemo(() => {
    if (!raw.trim()) return null

    if (hasLatexDelimiters(raw)) {
      const segs = splitLatexSegments(raw)
      return segs.map((seg, i) => {
        if (seg.type === "text") {
          return { kind: "text", key: `t-${i}`, value: seg.value }
        }
        const { body, block: isBlock } = stripMathDelimiters(seg.value.trim())
        const repairedBody = repairBrokenAsciiMath(body)
        try {
          const html = katex.renderToString(repairedBody, {
            throwOnError: false,
            displayMode: isBlock,
            strict: "ignore",
          })
          return { kind: "math", key: `m-${i}`, html, block: isBlock }
        } catch {
          return { kind: "text", key: `f-${i}`, value: seg.value }
        }
      })
    }

    if (!looksLikeEquation(raw)) return [{ kind: "text", key: "t-0", value: raw }]

    const segs = splitAsciiMathSegments(raw)
    if (!segs.some(s => s.type === "math")) return [{ kind: "text", key: "t-0", value: raw }]
    return segs.map((seg, i) => {
      if (seg.type === "text") return { kind: "text", key: `t-${i}`, value: seg.value }
      try {
        const html = katex.renderToString(asciiToLatexSafe(seg.value), {
          throwOnError: false,
          displayMode: false,
          strict: "ignore",
        })
        return { kind: "math", key: `m-${i}`, html, block: false }
      } catch {
        return { kind: "text", key: `f-${i}`, value: seg.value }
      }
    })
  }, [raw, block])

  const Wrapper = block ? "div" : "span"
  return (
    <Wrapper className={className} style={{ ...style, whiteSpace: "pre-wrap" }}>
      {(rendered || []).map((seg) => {
        if (seg.kind === "math") {
          const Tag = seg.block ? "div" : "span"
          return <Tag key={seg.key} dangerouslySetInnerHTML={{ __html: seg.html }} />
        }
        return <span key={seg.key}>{prettifyTextArrows(seg.value)}</span>
      })}
    </Wrapper>
  )
}

function prettifyTextArrows(value) {
  return String(value || "")
    .replace(/\\rightarrow\b/g, "→")
    .replace(/\\leftarrow\b/g, "←")
    .replace(/\\leftrightarrow\b/g, "↔")
    .replace(/\\Rightarrow\b/g, "⇒")
    .replace(/\\Leftarrow\b/g, "⇐")
    .replace(/\\to\b/g, "→")
}
