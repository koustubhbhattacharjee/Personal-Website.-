const DEFAULT_GIF =
  "https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExaDdsOHdyaG93cnpocDd5eWN5cWVwc3dyY3B4ZmQ0OGFwamJxbmcwbSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/UmzxB1tP8SJPg9Gbh7/giphy.gif"

export default function FailureState({
  title = "Something broke.",
  message = "Please refresh and try again.",
  action = null,
  fullScreen = true,
}) {
  return (
    <div
      style={{
        minHeight: fullScreen ? "100vh" : 360,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        color: "var(--text)",
      }}
    >
      <div
        style={{
          width: "min(92vw, 520px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
          padding: "20px 18px 24px",
          borderRadius: 18,
          border: "1px solid var(--border)",
          background: "color-mix(in srgb, var(--surface) 92%, white 8%)",
          boxShadow: "0 18px 44px color-mix(in srgb, var(--gold-dim) 55%, transparent)",
        }}
      >
        <div
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 22,
            lineHeight: 1.25,
            color: "var(--gold)",
            maxWidth: 420,
          }}
        >
          sorry...
        </div>
        <img
          src={DEFAULT_GIF}
          alt="Website error"
          style={{
            width: "min(100%, 380px)",
            borderRadius: 14,
            border: "1px solid var(--border)",
            objectFit: "cover",
          }}
        />
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, lineHeight: 1.15 }}>
          {title}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--text-muted)", maxWidth: 420 }}>
          {message}
        </div>
        {action}
      </div>
    </div>
  )
}
