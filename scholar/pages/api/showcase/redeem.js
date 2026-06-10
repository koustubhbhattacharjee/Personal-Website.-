import { buildShowcaseSessionCookie, redeemOneTimeShowcaseCode } from "../../../lib/showcase"

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    const { code, name } = req.body || {}
    const out = await redeemOneTimeShowcaseCode(code, { viewerName: name })
    if (!out.ok) return res.status(400).json({ error: out.error })
    res.setHeader("Set-Cookie", buildShowcaseSessionCookie(out.sessionToken))
    return res.status(200).json({ ok: true, label: out.label || "" })
  } catch (err) {
    console.error("showcase redeem error", err)
    return res.status(500).json({ error: err.message || "Failed to redeem showcase code" })
  }
}

