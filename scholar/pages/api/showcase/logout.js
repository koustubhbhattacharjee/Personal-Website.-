import { buildShowcaseLogoutCookie } from "../../../lib/showcase"

export default async function handler(req, res) {
  res.setHeader("Set-Cookie", buildShowcaseLogoutCookie())
  const next = String(req.query.next || "/showcase/login")
  return res.redirect(next)
}

