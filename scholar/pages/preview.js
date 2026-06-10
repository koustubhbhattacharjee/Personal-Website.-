import { useEffect, useState } from "react"
import { useRouter } from "next/router"
import { useSession, signIn } from "next-auth/react"
import styles from "../styles/Login.module.css"
import { getTimeGreeting, getTimeTheme } from "../lib/time-theme"

export default function PreviewLanding() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { as: asStudentId, subjectId } = router.query
  const [studentName, setStudentName] = useState("")
  const [studentTimezone, setStudentTimezone] = useState("")
  const [studentContextReady, setStudentContextReady] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") {
      const callbackUrl = typeof window !== "undefined" ? window.location.href : "/preview"
      signIn("google", { callbackUrl })
    }
  }, [status, router])

  useEffect(() => {
    if (!asStudentId || status !== "authenticated") return
    let cancelled = false
    setStudentContextReady(false)
    fetch(`/api/student/dashboard?as=${asStudentId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d?.student?.name) setStudentName(d.student.name)
        if (d?.student?.timezone) setStudentTimezone(d.student.timezone)
        setStudentContextReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setStudentContextReady(true)
      })
    return () => { cancelled = true }
  }, [asStudentId, status])

  if (status === "loading" || (asStudentId && status === "authenticated" && !studentContextReady)) return null

  const greeting = getTimeGreeting(studentTimezone)
  const name = studentName || ""
  const target = `/dashboard?as=${asStudentId}${subjectId ? `&subjectId=${subjectId}` : ""}`
  const timeTheme = getTimeTheme(studentTimezone)

  return (
    <div
      className={`${styles.container} ${timeTheme.mode === "night" ? styles.nightSky : ""}`}
      style={timeTheme.style}
      onClick={() => router.replace(target)}
    >
      <div className={styles.sceneGlow} />
      <div className={styles.markerWrap}>
        <div className={styles.marker}>
          {timeTheme.marker === "sun" ? <div className={styles.markerSun} /> : <div className={styles.markerMoon} />}
        </div>
      </div>
      <div className={styles.center}>
        <div className={styles.eyebrow}>Scholar Preview</div>
        <div className={styles.greeting}>
          {name ? `${greeting}, ${name}` : greeting}
        </div>
        <div className={styles.cta}>
          <span>Click to enter</span>
          <span className={styles.ctaArrow}>→</span>
        </div>
      </div>
    </div>
  )
}
