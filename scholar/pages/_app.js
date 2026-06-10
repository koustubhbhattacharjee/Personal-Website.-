import { SessionProvider } from "next-auth/react"
import Head from "next/head"
import "../styles/globals.css"
import "@excalidraw/excalidraw/index.css"
import "katex/dist/katex.min.css"

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <SessionProvider session={session}>
      <Head>
        <title>Scholar — Tutoring Portal</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#f4efe6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Scholar" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <link rel="manifest" href="/manifest.json" />
      </Head>
      <div className="app-shell">
        <div className="app-main">
          <Component {...pageProps} />
        </div>
        <footer className="site-footer">
          Scholar (registered trademark), 2026, all rights reserved
        </footer>
      </div>
    </SessionProvider>
  )
}
