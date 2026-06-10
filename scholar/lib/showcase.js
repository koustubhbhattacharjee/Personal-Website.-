import crypto from "crypto"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { hasSupabaseServer, supabaseInsert, supabaseRest, supabaseSelect } from "./supabase"

const SHOWCASE_TOKEN = process.env.SCHOLAR_SHOWCASE_TOKEN || ""
const SHOWCASE_SECRET = process.env.SCHOLAR_SHOWCASE_SECRET || SHOWCASE_TOKEN || "scholar-showcase-dev-secret"
const SHOWCASE_STUDENT_ID = process.env.SCHOLAR_SHOWCASE_STUDENT_ID || ""
const SHOWCASE_SUBJECT_ID = process.env.SCHOLAR_SHOWCASE_SUBJECT_ID || ""
const SHOWCASE_COOKIE = "scholar_showcase_session"
const SHOWCASE_SESSION_HOURS = 1
const CODES_FILE = process.env.VERCEL
  ? path.join(os.tmpdir(), "scholar-showcase-codes.json")
  : path.join(process.cwd(), "data", "showcase-codes.json")

function useSupabaseStore() {
  return hasSupabaseServer()
}

function rowToEntry(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    label: row.label || "",
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
    expiresAt: row.expires_at ? new Date(row.expires_at).getTime() : 0,
    usedAt: row.used_at ? new Date(row.used_at).getTime() : null,
    deviceFingerprint: row.device_fingerprint || null,
  }
}

function base64url(input) {
  return Buffer.from(input).toString("base64url")
}

function fromBase64url(input) {
  return Buffer.from(input, "base64url").toString("utf8")
}

function hmac(value) {
  return crypto.createHmac("sha256", SHOWCASE_SECRET).update(value).digest("base64url")
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    String(cookieHeader || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=")
        if (idx === -1) return [part, ""]
        return [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))]
      })
  )
}

async function ensureCodesStore() {
  await fs.mkdir(path.dirname(CODES_FILE), { recursive: true })
  try {
    await fs.access(CODES_FILE)
  } catch {
    await fs.writeFile(CODES_FILE, "[]\n", "utf8")
  }
}

async function readCodes() {
  await ensureCodesStore()
  const raw = await fs.readFile(CODES_FILE, "utf8")
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeCodes(codes) {
  await ensureCodesStore()
  await fs.writeFile(CODES_FILE, JSON.stringify(codes, null, 2) + "\n", "utf8")
}

function buildSessionToken(payload) {
  const encoded = base64url(JSON.stringify(payload))
  return `${encoded}.${hmac(encoded)}`
}

function readSessionToken(token = "") {
  const [encoded, sig] = String(token || "").split(".")
  if (!encoded || !sig) return null
  if (hmac(encoded) !== sig) return null
  try {
    const payload = JSON.parse(fromBase64url(encoded))
    if (!payload?.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function isValidShowcaseToken() {
  return false
}

export function getShowcaseStudentId() {
  return SHOWCASE_STUDENT_ID
}

export function getShowcaseSubjectId() {
  return SHOWCASE_SUBJECT_ID
}

export function getShowcaseToken() {
  return SHOWCASE_TOKEN
}

export function getShowcaseSessionPayloadFromReq(req) {
  const cookies = parseCookies(req?.headers?.cookie || "")
  return readSessionToken(cookies[SHOWCASE_COOKIE] || "")
}

export function hasShowcaseAccess(req) {
  if (isValidShowcaseToken(req?.query?.token)) return true
  return !!getShowcaseSessionPayloadFromReq(req)
}

export function isShowcaseDemo(req) {
  return req?.query?.demo === "1" && hasShowcaseAccess(req)
}

export function buildShowcaseSessionCookie(value) {
  const maxAge = SHOWCASE_SESSION_HOURS * 60 * 60
  return `${SHOWCASE_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
}

export function buildShowcaseLogoutCookie() {
  return `${SHOWCASE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function createShowcaseSession(viewerLabel = "") {
  const now = Date.now()
  return buildSessionToken({
    kind: "showcase",
    viewerLabel: String(viewerLabel || "").trim(),
    iat: now,
    exp: now + SHOWCASE_SESSION_HOURS * 60 * 60 * 1000,
  })
}

export async function generateOneTimeShowcaseCode({ label = "", expiresHours = 72 } = {}) {
  const now = Date.now()
  const expiresAt = now + Number(expiresHours || 72) * 60 * 60 * 1000

  if (useSupabaseStore()) {
    let code = ""
    for (let attempts = 0; attempts < 16; attempts += 1) {
      code = String(crypto.randomInt(0, 1000000)).padStart(6, "0")
      const existing = await supabaseSelect("showcase_codes", {
        select: "id",
        filters: { code },
        single: true,
      })
      if (!existing) break
    }
    const [inserted] = await supabaseInsert("showcase_codes", {
      code,
      label: String(label || "").trim(),
      expires_at: new Date(expiresAt).toISOString(),
    })
    return rowToEntry(inserted)
  }

  const codes = await readCodes()
  let code = ""
  do {
    code = String(crypto.randomInt(0, 1000000)).padStart(6, "0")
  } while (codes.some((item) => item.code === code && !item.usedAt && item.expiresAt > Date.now()))

  const entry = {
    id: crypto.randomUUID(),
    code,
    label: String(label || "").trim(),
    createdAt: now,
    expiresAt,
    usedAt: null,
  }
  codes.unshift(entry)
  await writeCodes(codes)
  return entry
}

export async function redeemOneTimeShowcaseCode(code, { deviceFingerprint = "", viewerName = "" } = {}) {
  const normalized = String(code || "").replace(/\D/g, "").slice(0, 6)
  if (normalized.length !== 6) return { ok: false, error: "Enter a valid 6-digit code." }
  const fingerprint = String(deviceFingerprint || "").slice(0, 200)
  const cleanViewerName = String(viewerName || "").trim().slice(0, 60)
  const now = Date.now()

  if (useSupabaseStore()) {
    const row = await supabaseSelect("showcase_codes", {
      select: "*",
      filters: { code: normalized },
      single: true,
    })
    if (!row) return { ok: false, error: "That showcase code was not found." }
    if (row.used_at) return { ok: false, error: "That showcase code has already been used." }
    if (row.expires_at && new Date(row.expires_at).getTime() <= now) {
      return { ok: false, error: "That showcase code has expired." }
    }

    const updated = await supabaseRest("showcase_codes", {
      method: "PATCH",
      query: { code: `eq.${normalized}`, used_at: "is.null" },
      body: { used_at: new Date(now).toISOString(), device_fingerprint: fingerprint || null },
      headers: { Prefer: "return=representation" },
    })
    const applied = Array.isArray(updated) ? updated[0] : updated
    if (!applied) return { ok: false, error: "That showcase code has already been used." }

    return {
      ok: true,
      label: row.label || "",
      sessionToken: createShowcaseSession(cleanViewerName || row.label || ""),
    }
  }

  const codes = await readCodes()
  const idx = codes.findIndex((item) => item.code === normalized)
  if (idx === -1) return { ok: false, error: "That showcase code was not found." }

  const item = codes[idx]
  if (item.usedAt) return { ok: false, error: "That showcase code has already been used." }
  if (item.expiresAt <= now) return { ok: false, error: "That showcase code has expired." }

  codes[idx] = { ...item, usedAt: now, deviceFingerprint: fingerprint || null }
  await writeCodes(codes)

  return {
    ok: true,
    label: item.label || "",
    sessionToken: createShowcaseSession(cleanViewerName || item.label || ""),
  }
}
