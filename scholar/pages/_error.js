import FailureState from "../components/FailureState"

function ErrorPage({ statusCode }) {
  const message = statusCode
    ? `The website hit an unexpected ${statusCode} error. Please refresh and try again.`
    : "The website hit an unexpected error. Please refresh and try again."

  return (
    <FailureState
      title="Scholar ran into a problem."
      message={message}
      action={
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload()
          }}
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--gold)",
            borderRadius: 999,
            padding: "10px 16px",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.03em",
          }}
        >
          Refresh
        </button>
      }
    />
  )
}

ErrorPage.getInitialProps = ({ res, err }) => {
  const statusCode = res?.statusCode || err?.statusCode || 500
  return { statusCode }
}

export default ErrorPage
