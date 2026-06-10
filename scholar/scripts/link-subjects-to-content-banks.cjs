#!/usr/bin/env node

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim()

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")
  }
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

function buildUrl(table, query = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === "") continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function rest(table, { method = "GET", query = {}, body, prefer = "", onConflict = "" } = {}) {
  const url = buildUrl(table, onConflict ? { ...query, on_conflict: onConflict } : query)
  const res = await fetch(url, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : {}),
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let payload = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = text
  }
  if (!res.ok) {
    throw new Error(payload?.message || payload?.hint || payload?.error || `Supabase REST error ${res.status}`)
  }
  return payload
}

function normalize(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const ALIASES = new Map([
  ["ap calculus", "ap calc"],
  ["ap calculus ab", "ap calc"],
  ["ap calculus bc", "ap calc"],
  ["calculus ab", "ap calc"],
  ["calculus bc", "ap calc"],
  ["ap physics c mechanics", "ap physics c"],
  ["ap physics c e and m", "ap physics c"],
  ["ap physics c electricity and magnetism", "ap physics c"],
  ["pre calculus", "precalculus"],
  ["algebra ii", "algebra 2"],
  ["algebra 2", "algebra 2"],
  ["grades 5 8 maths revision", "grade 5 8 maths revision"],
  ["as math", "as level"],
  ["as level math", "as level"],
  ["as level maths", "as level"],
  ["a level math", "as level"],
  ["a level maths", "as level"],
])

function canonicalizeSubjectName(name = "") {
  const normalized = normalize(name)
  return ALIASES.get(normalized) || normalized
}

function scoreBankMatch(subjectName, bank) {
  const subject = canonicalizeSubjectName(subjectName)
  const bankName = canonicalizeSubjectName(bank.subject_name || "")
  const bankLabel = canonicalizeSubjectName(bank.label || "")
  const bankKey = canonicalizeSubjectName(bank.key || "")

  if (!subject) return 0
  if (subject === bankName) return 100
  if (subject === bankKey) return 95
  if (subject === bankLabel) return 90
  if (subject.includes(bankName) || bankName.includes(subject)) return 70
  if (subject.includes(bankKey) || bankKey.includes(subject)) return 65
  return 0
}

async function fetchSubjects() {
  const rows = await rest("subjects", {
    query: { select: "id,name,content_bank_id,pacing_mode,active_overlay_id", limit: 10000 },
  })
  return Array.isArray(rows) ? rows : []
}

async function fetchBanks() {
  const rows = await rest("content_banks", {
    query: { select: "id,key,label,subject_name,framework_id", limit: 10000 },
  })
  return Array.isArray(rows) ? rows : []
}

async function patchSubject(id, patch) {
  return rest("subjects", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: patch,
    prefer: "return=representation",
  })
}

function chooseBestBank(subject, banks) {
  const scored = banks
    .map((bank) => ({ bank, score: scoreBankMatch(subject.name, bank) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)

  if (!scored.length) return { match: null, ambiguous: [] }
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return { match: null, ambiguous: scored.filter((entry) => entry.score === scored[0].score).map((entry) => entry.bank) }
  }
  return { match: scored[0].bank, ambiguous: [] }
}

async function main() {
  assertEnv()
  const [subjects, banks] = await Promise.all([fetchSubjects(), fetchBanks()])

  const linked = []
  const unmatched = []
  const ambiguous = []

  for (const subject of subjects) {
    if (subject.content_bank_id) {
      linked.push({ subject: subject.name, bank: subject.content_bank_id, mode: "already-linked" })
      continue
    }

    const { match, ambiguous: collisions } = chooseBestBank(subject, banks)
    if (match) {
      await patchSubject(subject.id, {
        content_bank_id: match.id,
        updated_at: new Date().toISOString(),
      })
      linked.push({ subject: subject.name, bank: match.label, mode: "linked" })
      continue
    }

    if (collisions.length) {
      ambiguous.push({
        subject: subject.name,
        candidates: collisions.map((bank) => ({ id: bank.id, label: bank.label, key: bank.key })),
      })
    } else {
      unmatched.push(subject.name)
    }
  }

  console.log(JSON.stringify({
    ok: true,
    subjects: subjects.length,
    banks: banks.length,
    linked,
    ambiguous,
    unmatched,
  }, null, 2))
}

main().catch((error) => {
  console.error("[link-subjects-to-content-banks] failed:", error.message)
  process.exit(1)
})
