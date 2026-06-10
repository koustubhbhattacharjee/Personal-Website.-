// Simulate the pre-class assessment pipeline for Shubhangi to find where it breaks.
// Run with: node --env-file=.env.local scripts/diagnose-shubhangi.js [anchorDate]
const URL_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

async function rest(path, query = {}) {
  const url = new URL(`${URL_BASE}/${path}`)
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  const res = await fetch(url, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

async function main() {
  const anchorArg = process.argv[2] || null
  const students = await rest("students", { select: "id,full_name,email", "full_name": "ilike.*shubhangi*" })
  if (!students.length) { console.log("no shubhangi"); return }
  const student = students[0]
  console.log(`Student: ${student.full_name} (${student.id})`)

  const enrolls = await rest("enrollments", { select: "subject_id,subjects(id,name,content_bank_id)", "student_id": `eq.${student.id}` })
  const subj = enrolls[0]
  console.log(`Subject: ${subj.subjects.name} (${subj.subject_id}) contentBankId=${subj.subjects.content_bank_id}`)

  const sqt = await rest("student_question_types", {
    select: "id,question_type_id,date_introduced,status",
    "student_id": `eq.${student.id}`,
    "subject_id": `eq.${subj.subject_id}`,
    limit: "2000",
  })
  const datesDesc = [...new Set(sqt.map((r) => r.date_introduced).filter(Boolean))].sort().reverse()
  console.log(`\nTotal SQT rows: ${sqt.length}. Unique dates (latest 10): ${JSON.stringify(datesDesc.slice(0,10))}`)

  const anchorDate = anchorArg || datesDesc[0]
  console.log(`\n--- Simulating pre-class with anchorDate=${anchorDate} ---`)
  const eligible = datesDesc.filter((d) => d <= anchorDate)
  const latestEligible = eligible[0]
  const earlierEligible = eligible.find((d) => d < latestEligible)
  const pickDate = (latestEligible === anchorDate && earlierEligible) ? earlierEligible : latestEligible
  console.log(`latestEligible=${latestEligible} earlierEligible=${earlierEligible} pickDate=${pickDate}`)

  const pickedRows = sqt.filter((r) => r.date_introduced === pickDate)
  console.log(`Rows on pickDate: ${pickedRows.length}`)
  console.log(`Sample question_type_ids: ${JSON.stringify(pickedRows.slice(0,5).map((r) => r.question_type_id))}`)

  // Check: do those question_type_ids correspond to valid question_types rows with question banks?
  const qtIds = [...new Set(pickedRows.map((r) => r.question_type_id).filter(Boolean))]
  console.log(`Unique question_type_ids: ${qtIds.length}`)
  if (qtIds.length) {
    const idList = qtIds.map((id) => `"${id}"`).join(",")
    const qts = await rest("question_types", { select: "id,title,content_bank_id", "id": `in.(${idList})` })
    console.log(`question_types matched: ${qts.length}`)

    // For each, count underlying questions
    console.log(`\nPer-QT question counts:`)
    for (const qt of qts) {
      const qs = await rest("questions", { select: "id", "question_type_id": `eq.${qt.id}`, limit: "1" })
      const cnt = await rest("questions", { select: "count", "question_type_id": `eq.${qt.id}` }, )
      const count = Array.isArray(cnt) && cnt[0]?.count != null ? cnt[0].count : qs.length
      console.log(`  ${qt.id}  "${qt.title}"  questions≥1? ${qs.length > 0}`)
    }
  }

  // Reproduce the hydrateStudentQTRows merge to confirm the id overwrite
  console.log(`\n--- Simulating hydrateStudentQTRows id merge ---`)
  if (pickedRows.length) {
    const qtIdsSet = [...new Set(pickedRows.map((r) => r.question_type_id))]
    const idList = qtIdsSet.map((id) => `"${id}"`).join(",")
    const qtRows = await rest("question_types", { select: "*", "id": `in.(${idList})` })
    const qtMap = Object.fromEntries(qtRows.map((qt) => [qt.id, qt]))
    const hydrated = pickedRows.map((row) => {
      const qt = qtMap[row.question_type_id] || {}
      // simulate parseSQT output: row.id = SQT id, row.questionTypeId = question_type_id
      const parsedRow = { id: row.id, questionTypeId: row.question_type_id, status: row.status }
      const parsedQt = { id: qt.id, title: qt.title }
      return { ...parsedQt, ...parsedRow }
    })
    console.log(`First hydrated row: ${JSON.stringify(hydrated[0])}`)
    console.log(`hydrated[0].id === SQT row id? ${hydrated[0].id === pickedRows[0].id}`)
    console.log(`hydrated[0].questionTypeId === question_type_id? ${hydrated[0].questionTypeId === pickedRows[0].question_type_id}`)
    console.log(`If assessment.js uses qt.id, it would look up questions with question_type_id=${hydrated[0].id} (wrong!)`)

    // Test: run the buggy query
    const buggyLookup = await rest("questions", { select: "id", "question_type_id": `eq.${hydrated[0].id}`, limit: "1" })
    console.log(`Questions found using SQT row id (buggy): ${buggyLookup.length}`)
    const goodLookup = await rest("questions", { select: "id", "question_type_id": `eq.${hydrated[0].questionTypeId}`, limit: "1" })
    console.log(`Questions found using true question_type_id: ${goodLookup.length}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
