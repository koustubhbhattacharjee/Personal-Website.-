import { getShowcaseSessionPayloadFromReq } from "../lib/showcase"

export default function ShowcasePage() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#14110e",
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
          Private Preview
        </div>
        <a
          href="/showcase/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
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
            textDecoration: "none",
            transition: "background 0.15s, border-color 0.15s",
          }}
        >
          Enter access code <span style={{ opacity: 0.75 }}>→</span>
        </a>
      </div>
    </div>
  )
}

export async function getServerSideProps(ctx) {
  const session = getShowcaseSessionPayloadFromReq(ctx.req)

  if (session) {
    const params = new URLSearchParams({ demo: "1", showcase: "1" })
    return { redirect: { destination: `/dashboard?${params.toString()}`, permanent: false } }
  }

  return { props: { mode: "login" } }
}
