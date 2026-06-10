import { signIn, useSession } from "next-auth/react"
import { useRouter } from "next/router"
import { useEffect } from "react"
import styles from "../styles/Login.module.css"
import { getTimeGreeting, getTimeTheme } from "../lib/time-theme"

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === "authenticated") {
      if ((session?.user?.email || "").toLowerCase() === "kbohuastt@gmail.com") {
        router.replace("/admin")
      } else {
        router.replace("/dashboard")
      }
    }
  }, [status, router, session])

  if (status === "loading") return null

  const greeting = getTimeGreeting()
  const name = session?.user?.name || "Student"
  const timeTheme = getTimeTheme()

  return (
    <div
      className={`${styles.container} ${timeTheme.mode === "night" ? styles.nightSky : ""}`}
      style={timeTheme.style}
      onClick={() => signIn("google", { callbackUrl: "/" })}
    >
      <div className={styles.sceneGlow} />
      <div className={styles.markerWrap}>
        <div className={styles.marker}>
          {timeTheme.marker === "sun" ? <div className={styles.markerSun} /> : <div className={styles.markerMoon} />}
        </div>
      </div>
      <div className={styles.center}>
        <div className={styles.eyebrow}>Scholar</div>
        <div className={styles.greeting}>{greeting}, {name}</div>
        <div className={styles.cta}>
          <span>Click to log in</span>
          <span className={styles.ctaArrow}>→</span>
        </div>
      </div>
      {router.query.error && (
        <div className={styles.error}>
          Access denied. Ask your tutor to add you to the system.
        </div>
      )}
    </div>
  )
}
