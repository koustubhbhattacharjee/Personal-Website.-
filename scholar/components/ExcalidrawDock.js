import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import styles from "../styles/Practice.module.css"

const Excalidraw = dynamic(
  () => import("@excalidraw/excalidraw").then((m) => m.Excalidraw || m.default),
  { ssr: false }
)

export default function ExcalidrawDock({
  questionKey = "",
  questionLabel = "Scratch",
  subjectId = "",
  questionTypeId = "",
  canSave = false,
  mode = "practice",
  onCloseScratch,
  onApiReady,        // (api) => void  — lets the parent grab the Excalidraw scene
                     // for FRQ "Submit for review" without exporting from this dock.
  onSceneChange,     // (hasContent: boolean) => void  — fires whenever the
                     // element count changes between 0 and non-0; used to
                     // enable/disable the FRQ "Submit for review" button.
  hideSave = false,  // FRQ context: the parent's "Submit for review" button
                     // captures the canvas, so a separate Save here is just
                     // cognitive overhead. Pass true to hide it.
}) {
  const apiRef = useRef(null)
  const hasContentRef = useRef(false)
  const prevKeyRef = useRef(questionKey || "")
  const canSaveRef = useRef(canSave)
  const subjectIdRef = useRef(subjectId)
  const questionTypeIdRef = useRef(questionTypeId)
  const modeRef = useRef(mode)
  const [saveState, setSaveState] = useState("idle")
  const [sceneKey, setSceneKey] = useState(questionKey || "generic")

  canSaveRef.current = canSave
  subjectIdRef.current = subjectId
  questionTypeIdRef.current = questionTypeId
  modeRef.current = mode

  async function exportAndUpload(key) {
    if (!key) return false
    const api = apiRef.current
    if (!api) return false
    const elements = api.getSceneElements?.() || []
    if (!elements.length) return false
    const mod = await import("@excalidraw/excalidraw")
    if (!mod?.exportToBlob) throw new Error("Excalidraw export unavailable")
    const blob = await mod.exportToBlob({
      elements,
      appState: { ...api.getAppState(), exportBackground: true, viewBackgroundColor: "#ffffff" },
      files: api.getFiles?.() || {},
      mimeType: "image/png",
    })
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result).split(",")[1])
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    const res = await fetch("/api/student/save-scratch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        questionKey: key,
        imageBase64: base64,
        subjectId: subjectIdRef.current,
        questionTypeId: questionTypeIdRef.current,
        mode: modeRef.current,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.error) throw new Error(data?.error || "Save failed")
    return true
  }

  useEffect(() => {
    const prevKey = prevKeyRef.current
    if (canSaveRef.current && prevKey && prevKey !== questionKey) {
      exportAndUpload(prevKey).catch(() => {})
    }
    prevKeyRef.current = questionKey || ""
    setSceneKey(questionKey || "generic")
    setSaveState("idle")
    // New question → fresh empty scene; reset content flag and notify parent.
    if (hasContentRef.current) {
      hasContentRef.current = false
      onSceneChange?.(false)
    }
  }, [questionKey, onSceneChange])

  async function handleSave() {
    if (!canSave || !questionKey) return
    setSaveState("saving")
    try {
      const ok = await exportAndUpload(questionKey)
      setSaveState(ok ? "saved" : "empty")
    } catch {
      setSaveState("error")
    }
  }

  function handleDiscard() {
    const api = apiRef.current
    if (!api) return
    try {
      api.updateScene?.({
        elements: [],
        appState: { ...api.getAppState(), selectedElementIds: {}, selectedGroupIds: {} },
        files: {},
      })
    } catch {}
    setSaveState("idle")
  }

  return (
    <div className={styles.dock}>
      <div className={styles.dockHeader}>
        <span className={styles.dockLabel}>
          {canSave ? questionLabel : "Scratchpad"}
          {saveState === "saved" && " — saved"}
          {saveState === "saving" && " — saving…"}
          {saveState === "empty" && " — nothing to save"}
          {saveState === "error" && " — save failed"}
        </span>
        <div className={styles.dockActions}>
          {onCloseScratch ? (
            <button
              type="button"
              className={styles.dockBtn}
              onClick={onCloseScratch}
              title="Hide scratchpad and show question only"
            >
              ← Question
            </button>
          ) : null}
          <button
            type="button"
            className={styles.dockBtn}
            onClick={handleDiscard}
            title="Clear everything on the scratchpad"
          >
            Reset canvas
          </button>
          {!hideSave ? (
            <button
              type="button"
              className={[styles.dockBtn, styles.dockBtnPrimary].join(" ")}
              onClick={handleSave}
              disabled={!canSave || saveState === "saving"}
              title={canSave ? "Save your work" : "Select a question to save work"}
            >
              Save
            </button>
          ) : null}
        </div>
      </div>
      <div className={styles.dockCanvas}>
        <Excalidraw
          key={sceneKey}
          excalidrawAPI={(api) => { apiRef.current = api; onApiReady?.(api) }}
          initialData={{ appState: { viewBackgroundColor: "#ffffff" } }}
          onChange={(elements) => {
            if (!onSceneChange) return
            // Only fire on the 0 ↔ non-0 transition so we don't churn parent
            // re-renders on every stroke. Excalidraw soft-deletes elements
            // (item.isDeleted), so filter those out before counting.
            const live = (elements || []).filter((el) => !el?.isDeleted).length
            const hasContent = live > 0
            if (hasContent !== hasContentRef.current) {
              hasContentRef.current = hasContent
              onSceneChange(hasContent)
            }
          }}
        />
      </div>
    </div>
  )
}
