import { hasSupabaseServer, supabaseSelect, supabaseRest, supabaseUpdate, supabaseInsert } from "./supabase"

function clean(value = "") {
  return String(value || "").trim()
}

function asLoCode(raw = "") {
  const value = clean(raw)
  return value.includes("::") ? value.split("::").pop() : value
}

async function loadSubject(subjectId) {
  if (!subjectId) return null
  return supabaseSelect("subjects", {
    select: "id,content_bank_id,active_overlay_id,default_pacing_guide_id",
    filters: { id: subjectId },
    single: true,
  }).catch(() => null)
}

async function loadOverlay(overlayId) {
  if (!overlayId) return null
  return supabaseSelect("school_overlays", {
    select: "id,content_bank_id,native_pacing_guide_id",
    filters: { id: overlayId },
    single: true,
  }).catch(() => null)
}

async function loadContentBank(contentBankId) {
  if (!contentBankId) return null
  return supabaseSelect("content_banks", {
    select: "id,framework_id",
    filters: { id: contentBankId },
    single: true,
  }).catch(() => null)
}

async function fetchSectionEntries(overlayId) {
  const units = await supabaseRest(
    `school_units?overlay_id=eq.${overlayId}&select=id,unit_key,unit_name,sequence_index,school_sections(id,section_key,section_label,section_title,sequence_index)&order=sequence_index.asc`
  ).catch(() => [])

  const entries = []
  for (const unit of units || []) {
    const sections = [...(unit.school_sections || [])].sort((a, b) => Number(a.sequence_index || 0) - Number(b.sequence_index || 0))
    for (const sec of sections) {
      entries.push({
        sectionId: sec.id,
        code: clean(sec.section_key),
        name: clean(sec.section_title || sec.section_label || sec.section_key),
        schoolUnitKey: clean(unit.unit_key),
        schoolUnitName: clean(unit.unit_name),
        schoolSection: clean(sec.section_key),
        schoolSectionTitle: clean(sec.section_title || sec.section_label || ""),
        skipped: false,
      })
    }
  }
  return entries
}

async function fetchLoEntries(subjectId, contentBankId = "") {
  const bankId = clean(contentBankId) || clean((await loadSubject(subjectId))?.content_bank_id)
  if (!bankId) return []

  const bank = await loadContentBank(bankId)
  const frameworkId = clean(bank?.framework_id)
  if (!frameworkId) return []

  const los = await supabaseSelect("learning_objectives", {
    select: "id,code,name,standard_code,standard_name,sequence_index",
    filters: { framework_id: frameworkId },
    orderBy: "sequence_index",
    ascending: true,
    limit: 2000,
  }).catch(() => [])

  return los.map((lo, idx) => {
    const code = clean(lo.code || lo.standard_code || lo.id)
    return {
      sectionId: code,
      code,
      name: clean(lo.name || lo.standard_name || lo.standard_code || code || `LO ${idx + 1}`),
      schoolUnitKey: clean(lo.standard_code || code),
      schoolUnitName: clean(lo.standard_name || lo.name || code),
      schoolSection: code,
      schoolSectionTitle: clean(lo.name || ""),
      loId: clean(lo.id),
      skipped: false,
    }
  })
}

async function loadPacingGuide(guideId) {
  if (!guideId) return null
  const rows = await supabaseRest(
    `pacing_guides?id=eq.${guideId}&select=id,student_id,subject_id,overlay_id,guide_type,sections,created_at&limit=1`,
    { method: "GET" }
  ).catch(() => [])
  return Array.isArray(rows) ? rows[0] || null : null
}

function mergeSavedPacing(defaultEntries, savedSections) {
  if (!savedSections?.length) return defaultEntries
  const byId = new Map(defaultEntries.map((entry) => [clean(entry.sectionId), entry]))
  const kept = savedSections
    .map((row) => {
      const entry = byId.get(clean(row?.sectionId))
      return entry ? { ...entry, skipped: !!row?.skipped } : null
    })
    .filter(Boolean)
  const keptIds = new Set(kept.map((entry) => clean(entry.sectionId)))
  return [...kept, ...defaultEntries.filter((entry) => !keptIds.has(clean(entry.sectionId)))]
}

async function createPacingGuideRow({ studentId = null, subjectId = null, overlayId = null, guideType = "", entries = [] }) {
  const sections = (entries || [])
    .filter((entry) => clean(entry.sectionId))
    .map((entry) => ({ sectionId: clean(entry.sectionId), skipped: !!entry.skipped }))

  const rows = await supabaseInsert("pacing_guides", [{
    student_id: studentId || null,
    subject_id: subjectId || null,
    overlay_id: overlayId || null,
    guide_type: guideType,
    sections,
  }])
  return Array.isArray(rows) ? rows[0] || null : rows
}

export async function ensureSubjectDefaultPacing(subjectId, options = {}) {
  if (!subjectId || !hasSupabaseServer()) return null

  const { forceNew = false, subject = null } = options || {}
  const subjectRow = subject || await loadSubject(subjectId)
  if (!subjectRow) return null

  if (!forceNew && subjectRow.default_pacing_guide_id) {
    const existing = await loadPacingGuide(subjectRow.default_pacing_guide_id)
    if (existing) return existing.id
  }

  const entries = await fetchLoEntries(subjectId, subjectRow.content_bank_id)
  if (!entries.length) return null

  const created = await createPacingGuideRow({
    subjectId,
    guideType: "subject_default",
    entries,
  })
  const newId = clean(created?.id)
  if (!newId) return null

  await supabaseUpdate("subjects", { id: subjectId }, { default_pacing_guide_id: newId })
  return newId
}

export async function ensureOverlayNativePacing(overlayId, options = {}) {
  if (!overlayId || !hasSupabaseServer()) return null

  const { forceNew = false, overlay = null } = options || {}
  const overlayRow = overlay || await loadOverlay(overlayId)
  if (!overlayRow) return null

  if (!forceNew && overlayRow.native_pacing_guide_id) {
    const existing = await loadPacingGuide(overlayRow.native_pacing_guide_id)
    if (existing) return existing.id
  }

  const entries = await fetchSectionEntries(overlayId)
  if (!entries.length) return null

  const created = await createPacingGuideRow({
    overlayId,
    guideType: "overlay_native",
    entries,
  })
  const newId = clean(created?.id)
  if (!newId) return null

  await supabaseUpdate("school_overlays", { id: overlayId }, { native_pacing_guide_id: newId })
  return newId
}

async function resolveLatestEnrollmentGuide(studentId, subjectId, enrollment = null) {
  if (!studentId || !subjectId) return null

  const latestRows = await supabaseSelect("pacing_guides", {
    select: "id,created_at",
    filters: { student_id: studentId, subject_id: subjectId, guide_type: "enrollment_custom" },
    orderBy: "created_at",
    ascending: false,
    limit: 1,
  }).catch(() => [])
  const latest = latestRows[0] || null
  if (!latest?.id) return null

  const activeId = clean(enrollment?.active_pacing_guide_id)
  if (activeId !== latest.id) {
    await supabaseUpdate("enrollments", { student_id: studentId, subject_id: subjectId }, {
      active_pacing_guide_id: latest.id,
    }).catch(() => null)
  }

  return loadPacingGuide(latest.id)
}

async function getCanonicalEntries(subjectRow) {
  if (!subjectRow) return []
  if (subjectRow.active_overlay_id) {
    return fetchSectionEntries(subjectRow.active_overlay_id)
  }
  return fetchLoEntries(subjectRow.id, subjectRow.content_bank_id)
}

export async function resolvePacingEntries({ subjectId = "", studentId = "" } = {}) {
  const TAG = `[resolvePacingEntries subjectId=${subjectId} studentId=${studentId}]`
  if (!subjectId || !hasSupabaseServer()) {
    console.log(TAG, "early exit — missing subjectId or no supabase server")
    return { entries: [], locked: true, source: "none" }
  }

  const [subjectRow, enrollment] = await Promise.all([
    loadSubject(subjectId),
    studentId
      ? supabaseSelect("enrollments", {
          select: "active_pacing_guide_id",
          filters: { student_id: studentId, subject_id: subjectId },
          single: true,
        }).catch(() => null)
      : Promise.resolve(null),
  ])

  console.log(TAG, "subjectRow:", JSON.stringify(subjectRow))
  console.log(TAG, "enrollment:", JSON.stringify(enrollment))

  if (!subjectRow) return { entries: [], locked: true, source: "none" }

  const defaultEntries = await getCanonicalEntries(subjectRow)
  console.log(TAG, "defaultEntries count:", defaultEntries.length, "first:", JSON.stringify(defaultEntries[0] || null))
  if (!defaultEntries.length) {
    console.log(TAG, "locked — no canonical entries")
    return { entries: [], locked: true, source: "none" }
  }

  const enrollmentGuide = await resolveLatestEnrollmentGuide(studentId, subjectId, enrollment)
  console.log(TAG, "enrollmentGuide:", enrollmentGuide ? `id=${enrollmentGuide.id} sections=${enrollmentGuide.sections?.length}` : "null")
  if (enrollmentGuide) {
    return {
      entries: mergeSavedPacing(defaultEntries, enrollmentGuide.sections),
      source: "enrollment",
      isDefault: false,
      updatedAt: enrollmentGuide.created_at,
      locked: false,
    }
  }

  if (subjectRow.active_overlay_id) {
    const overlayRow = await loadOverlay(subjectRow.active_overlay_id)
    console.log(TAG, "overlayRow:", JSON.stringify(overlayRow))
    const nativeGuideId = clean(overlayRow?.native_pacing_guide_id) || clean(await ensureOverlayNativePacing(subjectRow.active_overlay_id, { overlay: overlayRow }))
    console.log(TAG, "nativeGuideId:", nativeGuideId)
    const nativeGuide = await loadPacingGuide(nativeGuideId)
    console.log(TAG, "nativeGuide:", nativeGuide ? `id=${nativeGuide.id} sections=${nativeGuide.sections?.length}` : "null")
    if (nativeGuide) {
      const merged = mergeSavedPacing(defaultEntries, nativeGuide.sections)
      console.log(TAG, "merged entries count:", merged.length)
      return {
        entries: merged,
        source: "overlay_native",
        isDefault: true,
        updatedAt: nativeGuide.created_at,
        locked: false,
      }
    }
  }

  const subjectGuideId = clean(subjectRow.default_pacing_guide_id) || clean(await ensureSubjectDefaultPacing(subjectId, { subject: subjectRow }))
  console.log(TAG, "subjectGuideId:", subjectGuideId)
  const subjectGuide = await loadPacingGuide(subjectGuideId)
  if (subjectGuide) {
    return {
      entries: mergeSavedPacing(defaultEntries, subjectGuide.sections),
      source: "subject_default",
      isDefault: true,
      updatedAt: subjectGuide.created_at,
      locked: false,
    }
  }

  return {
    entries: defaultEntries,
    source: subjectRow.active_overlay_id ? "overlay_native" : "subject_default",
    isDefault: true,
    updatedAt: null,
    locked: false,
  }
}

export async function savePacingGuide(studentId, subjectId, entries) {
  if (!studentId || !subjectId || !hasSupabaseServer()) {
    throw new Error("Missing studentId, subjectId, or Supabase config")
  }

  const created = await createPacingGuideRow({
    studentId,
    subjectId,
    guideType: "enrollment_custom",
    entries,
  })
  const newId = clean(created?.id)
  if (!newId) throw new Error("pacing_guides insert did not return an id")

  await supabaseUpdate(
    "enrollments",
    { student_id: studentId, subject_id: subjectId },
    { active_pacing_guide_id: newId }
  )

  const todayIso = new Date().toISOString().slice(0, 10)
  const futureDrafts = await supabaseRest(
    `draft_items?student_id=eq.${studentId}&subject_id=eq.${subjectId}&state=in.(backlog,draft,live_stack)&assigned_session_date=gte.${todayIso}&select=id`,
    { method: "GET" }
  ).catch(() => [])

  return {
    guideId: newId,
    affectedFutureDraftCount: Array.isArray(futureDrafts) ? futureDrafts.length : 0,
  }
}

export async function buildOverlayByLo(overlayId) {
  if (!overlayId || !hasSupabaseServer()) return {}
  const units = await supabaseRest(
    `school_units?overlay_id=eq.${overlayId}&select=unit_key,unit_name,sequence_index,school_sections(section_key,section_title,sequence_index,school_section_slos(slo_id))&order=sequence_index.asc`
  ).catch(() => [])

  const byLo = {}
  let seq = 0
  for (const unit of units || []) {
    const sections = [...(unit.school_sections || [])].sort((a, b) => Number(a.sequence_index || 0) - Number(b.sequence_index || 0))
    for (const sec of sections) {
      for (const row of sec.school_section_slos || []) {
        const sloCode = asLoCode(row?.slo_id)
        if (!sloCode || byLo[sloCode]) continue
        byLo[sloCode] = {
          schoolUnitKey: clean(unit.unit_key),
          schoolUnitName: clean(unit.unit_name),
          schoolSection: clean(sec.section_key),
          schoolSectionTitle: clean(sec.section_title || ""),
          schoolSequenceIndex: seq,
        }
      }
      seq++
    }
  }
  return byLo
}

export async function buildPacingGuideContext({ subjectId = "", studentId = "" } = {}) {
  if (!subjectId || !hasSupabaseServer()) {
    return { pacing: { entries: [], locked: true, source: "none" }, subject: null, sectionOrder: new Map(), sloSectionOrder: new Map() }
  }

  const [subjectRow, pacing] = await Promise.all([
    loadSubject(subjectId),
    resolvePacingEntries({ subjectId, studentId }),
  ])
  const entries = Array.isArray(pacing?.entries) ? pacing.entries : []
  const sectionOrder = new Map(entries.map((entry, idx) => [clean(entry.sectionId), idx]))
  const sloSectionOrder = new Map()

  if (subjectRow?.active_overlay_id && entries.length) {
    const sectionIds = entries.map((entry) => clean(entry.sectionId)).filter(Boolean)
    if (sectionIds.length) {
      const rows = await supabaseRest(
        `school_section_slos?select=school_section_id,slo_id&school_section_id=in.(${sectionIds.join(",")})`,
        { method: "GET" }
      ).catch(() => [])
      for (const row of rows || []) {
        const sectionId = clean(row?.school_section_id)
        const order = sectionOrder.get(sectionId)
        if (order == null) continue
        const sloCode = asLoCode(row?.slo_id)
        if (sloCode && !sloSectionOrder.has(sloCode)) sloSectionOrder.set(sloCode, order)
      }
    }
  } else {
    entries.forEach((entry, idx) => {
      const code = clean(entry.code || entry.sectionId)
      if (code && !sloSectionOrder.has(code)) sloSectionOrder.set(code, idx)
      const loId = asLoCode(entry.loId)
      if (loId && !sloSectionOrder.has(loId)) sloSectionOrder.set(loId, idx)
    })
  }

  // Expand sub-LOs to their parent LO's order. QTs store primary_slo_id as a
  // sub_learning_objectives key (often a code string like "1.3.A.4"), but the
  // maps above only know parent-LO keys (e.g. "1.3"). Without this lookup
  // every sub-LO resolves to MAX_SAFE_INTEGER and redistribute funnels every
  // QT to the forward side.
  const bankId = clean(subjectRow?.content_bank_id)
  if (bankId && sloSectionOrder.size) {
    const bank = await loadContentBank(bankId)
    const frameworkId = clean(bank?.framework_id)
    if (frameworkId) {
      const subLos = await supabaseRest(
        `sub_learning_objectives?select=id,code,lo_id,learning_objectives!inner(framework_id)&learning_objectives.framework_id=eq.${frameworkId}&limit=10000`,
        { method: "GET" }
      ).catch(() => [])
      for (const sl of subLos || []) {
        const parentOrder = sloSectionOrder.get(clean(sl.lo_id))
        if (parentOrder == null) continue
        const sloId = clean(sl.id)
        const sloCode = clean(sl.code)
        if (sloId && !sloSectionOrder.has(sloId)) sloSectionOrder.set(sloId, parentOrder)
        if (sloCode && !sloSectionOrder.has(sloCode)) sloSectionOrder.set(sloCode, parentOrder)
      }
    }
  }

  return { pacing, subject: subjectRow, sectionOrder, sloSectionOrder }
}
