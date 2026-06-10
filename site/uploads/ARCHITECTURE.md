# Scholar — Architecture

A one-on-one tutoring platform where the curriculum, the student's knowledge
state, and the day-to-day session plan are modeled as a single inspectable data
structure — and rendered as an interactive 3D solid the student drills into.

**Audience:** an engineer or tech lead picking this codebase up for the first
time. This document is the map: what the pieces are, how data flows, where the
seams and the kill-switches are, and which parts are load-bearing vs. legacy.

> **Read this first — the one claim the whole system is built on.** A tutor's
> real artifact is not a grade; it is a slowly-improving estimate of *what the
> student knows, how well they'll remember it, and what to teach next.* Every
> surface in Scholar — dashboard, practice room, 3D map, flashcards, session
> planner, report card — is a different **projection of the same per-(student,
> question-type) knowledge state.** There is no separate "grade book" and "topic
> map"; they are the same rows, rendered differently. Internalize that and the
> rest of the codebase stops looking redundant.

---

## The big ideas — the spine

Scholar has grown a lot of surface area, and the recent volume (the source
pipeline, the practice room) can make it look like a content tool. It isn't. The
whole system is the elaboration of **two ideas from week one**, which still carry
as much weight as anything shipped last week. Read these first; everything below
is mechanism in service of them. (`TIMELINE.md` has the full lineage with dates
and commits.)

**① Tutoring reacts to evidence, not a script.** The original behavior was a
pre-class diagnostic that rewrites the session on any wrong answer. That seed is
now the pre-class/exit-ticket assessments (§4.1), the prerequisite-aware session
planner (§6.1), and the whole notion of "what to teach next."

**② The student's knowledge state is the one modeled artifact.** Scored per
**(student, question-type)**, tracked over time, and *projected* into every
surface. That seed is `student_question_types`, `weakness_score` + `mastery_score`
(§3), and the rule that a new surface is a new projection, not a new pipeline.

Everything else exists to make ① and ② **legible, trustworthy, and operable**:

| Idea | Lives in |
|---|---|
| ③ Render the knowledge tree as an interactive 3D solid | §5 · `SubjectCylinder3D.js`, `cylinder-data.js` |
| ④ Answering a topic reinforces its prerequisites | §3.4 · `reinforcement_slos`, the 0.2 ceiling |
| ⑤ Topics are SLOs on a DAG | §2 · taxonomy + `lo_graph_edges` |
| ⑥ Teaching order is first-class | §2.2, §6.1 · pacing guide / overlays |
| ⑦ An isolated demo world over the same surfaces | §8 · showcase mode |
| ⑧ The session is a planned, editable object | §6.1 · draft items, live class, backfill |
| ⑨ Postgres + SLO-first planning (was Notion) | §1, §9 · `lib/db.js`, migrations |
| ⑩ Mastery decays on a doubling half-life | §3.3 · `calculateMasteryScore` |
| ⑪ Every attempt is a logged labeled pair | §4.1 · `student_question_attempts` |
| ⑫ Practice retints the geometry live | §5.3 · observatory drill-down |
| ⑬ Questions are traceable to their source | §7 · `source_reference`, Sources Studio |

The exponential growth in code lives in ⑥, ⑫, and ⑬ — but the **center of gravity
is still ① and ②.** If a change makes the knowledge state less central or less
inspectable, it's probably wrong regardless of how much it adds.

---

## 1. Stack & topology

| Layer | Choice | Notes |
|---|---|---|
| App framework | **Next.js 14, pages router** | SSR pages + `pages/api/*` route handlers *are* the backend. No separate server. |
| Database | **Supabase Postgres** | Schema lives entirely in `supabase/migrations/*.sql` (the schema of record). **No ORM.** |
| Data access | `lib/supabase.js` | Thin typed REST (PostgREST) wrapper — `select/insert/update/delete`. All DB calls go through it. |
| Domain/data layer | `lib/db.js` (~1.7k lines) | Owns all score/mastery reads & writes. The single most important file in the repo. |
| 3D | **three.js + @react-three/fiber + drei** | All visualizations. `ssr: false` dynamic imports. |
| Object storage | **Cloudflare R2** (via `@aws-sdk/client-s3`) | `lib/r2.js`. Question figure PNGs, source PDFs, draft-context JSON. |
| LLM (in-app) | **Claude Sonnet 4.6** | `lib/claude.js`. MCQ generation, SLO tagging, assessment cache warming. *Not* the source-extraction pipeline (see §7). |
| Auth | **NextAuth, Google OAuth only** | `lib/auth.js`. Also captures a read-only Calendar scope. |
| Calendar | **Google Calendar API** | Student class-timer (`lib/calendar.js`) + tutor session sync (`lib/tutor-calendar.js`). |
| Math rendering | **KaTeX** + a tolerant repairer | `components/MathText.js`. Handles under/over-escaped LLM output. |
| Scratchpad | **Excalidraw** | `components/ExcalidrawDock.js`. Free-response work surface. |

### Things to know before you grep

- **Notion is legacy/dead.** `lib/notion.js` (~3k lines) and `lib/notion-backup.js`
  were the *original* datastore; the system has fully migrated to Supabase. Many
  `lib/db.js` exports are no-op stubs that used to be Notion block ops
  (`buildLoTableBlock`, `appendReadable*`, `getPageBlocks` → `return null/[]`).
  `pages/api/admin/backup-r2.js` returns HTTP 410. Treat Notion as removed.
- **`nodemailer` is installed but not wired** into any runtime path.
- **Single-tenant assumption.** Auth gates on a **hard-coded admin email** in
  `lib/auth.js`; everyone else must already exist in the `students` table. There
  is one tutor. Multi-tenant is not a thing yet.
- **Extraction is out-of-app.** The heavy LLM work that turns a textbook into
  questions happens by pasting prompts into a chat app, *not* via a server
  endpoint (§7). The app only *imports* the resulting JSON.

---

## 2. Domain model: curriculum as a labeled tree

Everything hangs off a **five-level drilldown**:

```
Subject
  └── Unit                  (e.g. "Unit 2 — Dynamics")
        └── Learning Objective / Section
              └── Question Type (QT)
                    └── Question
```

This chain is what the student sees (as a 3D solid), what mastery is scored
against, and what the planner schedules. Units/LOs come from one of two sources.

### 2.1 Taxonomy-driven subjects

`lib/district-taxonomy.js` (~8.5k lines) is a static `DISTRICT_TAXONOMY[state][subjectKey]`
of shape `{ standards: [{ code, name, objectives: [{ code, name, subtopics: [...] }] }] }`.
Standards → Units, Objectives → LOs. Subject key is a lowercase partial match on
the subject name, so state variants coexist.

- **AP Physics 1 has its own file** — `lib/ap-physics-1-taxonomy.js` (~2.2k lines)
  — because its codes carry `legacy_ids` and a divergent format; it's registered
  back into `DISTRICT_TAXONOMY.ap_physics_1`.
- Generated taxonomies (AP Calc AB/BC, etc.) live in `data/generated-*-taxonomy.json`
  and are produced by `scripts/build_*_taxonomy.py` (§7.2).

### 2.2 Overlay-driven subjects

For textbook-anchored subjects (e.g. **Edexcel 9MA0**), `school_overlays` +
`school_units` + `school_sections` in Supabase define the pacing sequence
directly. Each `question_types.school_section_id` pins a QT to a textbook
section. The taxonomy still exists, but the UI shows textbook units/sections.

### 2.3 Question Types (QTs) — the unit of everything

A QT is a **teaching-point cluster** ("Using the quotient rule on polynomials"),
not a single question. Each QT carries:

- `primary_slo_id` — the one sub-LO it most directly teaches.
- `aligned_slo_ids` — other sub-LOs it also exercises (same parent LO).
- `reinforcement_slos: [{slo_id, weight}]` — **prerequisite** skills whose
  partial mastery answering this QT silently updates (§3.4).

QTs are the granularity of pacing, scoring, and scheduling. Questions are their
children (typically a handful of MCQs ± free-response).

### 2.4 Content banks & two import tracks

Questions live in **content banks**; a subject points at a bank (and optionally
an overlay). Two provenance tracks coexist:

- **Textbook QTs** (`source_type='textbook'`): pinned via `school_section_id`.
  Section mastery = mean of its QT mastery.
- **External QTs** (`source_type='external'`): no section id; mastery flows from
  the QT's `primary_slo_id` to sections via `school_section_slos` weights.

This is what lets curated textbook banks and scraped/LLM banks mix without
losing the section rollup.

### 2.5 Provenance: `source_reference` (canonical, jsonb)

Every question (and QT) carries a `source_reference` JSONB blob —
`{ textbook_key, worksheet_name, page, section, exercise_ref }` — so each row
traces back to the exact book/section/problem. **Migration 019** made
`questions.source_reference` jsonb (it was text) with an expression index on
`(source_reference->>'textbook_key')`. This is the key that prevents silent
merging across textbooks and that the Sources Studio (§7.5) queries on. The
soft link to the `sources` registry is by `textbook_key` string, **not** a FK.

---

## 3. The mastery model (`lib/db.js`)

### 3.1 Two numbers per (student, QT)

`student_question_types` is the per-student-per-QT row, holding two scores with
different jobs:

| Field | Range | Measures | Updated by |
|---|---|---|---|
| `weakness_score` | 0 → ∞ | **Triage signal** — "how badly is this needed *right now*?" | per-attempt ±step |
| `mastery_events` → `mastery_score` | 0 → 1 | **Retention belief** — "probability they remember it today" | append-only log replayed through a forgetting curve |

Keeping them separate is deliberate: weakness is a *decision variable* (routes
flashcards, triggers reteach); mastery is a *belief* (colors geometry, drives
reports). Collapsing them breaks one of the two.

### 3.2 Weakness updates

| Event | Δ weakness | Handler |
|---|---|---|
| Practice correct / wrong | −0.1 / +0.1 | `recordPracticeAttempt` |
| Homework correct / wrong | −0.2 / +0.2 | `recordHWAttempt` |
| Assessment correct / wrong | −1.0 / +1.0 | `recordAssessmentResult` |
| Tutor flag | +1.0 | `incrementWeaknessScore` |

Floored at 0, rounded to 3 dp. Assessment hits hardest because it's diagnostic
(done cold, pre-class and exit-ticket). **`weakness_score ≥ 2`** is the threshold
that surfaces a QT as a flashcard (`pages/api/student/flashcards.js`).

### 3.3 Mastery events & the forgetting curve

Every **correct** attempt appends `{ source, date, occurredAt, questionKey, weight }`
to `mastery_events`, capped at the **last 160** events (rolling window). The live
score comes from `getLatestMasterySnapshot` → `calculateMasteryScore`, a
spaced-repetition half-life model (`lib/db.js:137-170`):

```
reviewCount  = successful events
halfLifeDays = 3 · 2^(reviewCount − 1)        // 3d, 6d, 12d, 24d, ...
ageDays      = (today − latestEventDate) / 1d
retention    = 0.5 ^ (ageDays / halfLifeDays) // clamped [0,1]
```

Only **successes** extend the half-life; wrong answers only move weakness. There
is also a coarser stepwise decay table, `getMasteryDecayFactor(ageDays)`, kept
for secondary callers.

> ⚠️ **Kill-switch you will trip over:** `MASTERY_DECAY_BYPASS = true`
> (`lib/db.js:23`). While on, **retention is forced to `1.0`** for any QT with at
> least one success — geometry never fades during active tutoring (we want
> visible progress). The forgetting curve above is fully implemented but
> *short-circuited*. Flip the flag off for long-horizon/research runs. If you're
> debugging "why doesn't mastery decay?", this is why.

### 3.4 Reinforcement propagation (the prerequisite prior)

Questions can carry `reinforcementTargets: [{code, weight}]` — directed weighted
edges over LO codes. `calculateReinforcementByCode` groups events by question,
reads each question's targets, and accumulates `decayedBase × weight` into the
target LO. At render time (`lib/cylinder-data.js`) propagated mastery is mixed
with direct mastery under a hard ceiling:

```
ringMastery = min(1, directMastery + propagatedMastery · (1 − directMastery) · 0.2)
```

The **0.2 ceiling** (`cylinder-data.js:94, 230, 259`) is intentional:
reinforcement *nudges*, it never substitutes for attempting the topic — otherwise
the map would lie about untouched concepts. Edges live in `lo_graph_edges`
(tutor/LLM-authored, framework-namespaced) and per-question reinforcement tags;
students can also suggest edges via the Knowledge Graph view.

### 3.5 Prerequisite locking (planner)

When the session planner builds a class stack, a QT is **locked out** if any of
its `reinforcement_slos` points to a section whose pacing-order index is *greater
than the QT's own* (a prereq scheduled later). This catches pacing-guide
inversions and routes them to a "missing prerequisites" surface before they reach
the student.

### 3.6 The 3-hour question lock (changed behavior)

Each attempt stamps `unlock_at = now + 3h` on the per-question state (computed
client-side, persisted via `lib/db.js` `unlock_at`). `QuestionPane` disables a
question and shows *"Each question locks for 3 hours after an attempt."* until
then. (This **replaced** the older "wrong-today → locked until tomorrow"
behavior.) The `daily_seen_dates` / `daily_wrong_dates` arrays still exist and
feed the 90-day check-in map and "completed" rollups, but the headline retry gate
is now the 3-hour `unlock_at`.

---

## 4. The learning loop

### 4.1 Three input modes, one update channel

Every correct/wrong signal funnels through the same `lib/db.js` helpers writing
`student_question_types`, plus an append to `student_question_attempts` (the raw
labeled log, migration 015):

| Mode | Handler | Weakness step | Mastery event |
|---|---|---|---|
| Practice | `recordPracticeAttempt` | ±0.1 | on correct |
| Homework | `recordHWAttempt` | ±0.2 | on correct |
| Assessment | `recordAssessmentResult` | ±1.0 | on correct |
| Free response | `submit-freeresponse` → grading queue → verdict | deferred | on tutor approval |

### 4.2 MCQ flow (`components/QuestionPane.js`)

Select an option → **must click "Submit Answer"** before correctness is revealed
→ correct/wrong coloring (hardened against browser disabled-button defaults) →
mastery posts and the geometry retints live → 3-hour lock (§3.6). Prev/Next walks
questions within an arc; Prev-Arc/Next-Arc jumps QTs within the LO and *drills the
3D geometry forward* in step.

### 4.3 Free-response / FRQ flow (migration 017)

A `question_format = 'free_response'` question offers two work modes:

- **Draw** — Excalidraw scratchpad; on submit, the scene is exported to PNG +
  JSON and POSTed to `pages/api/student/submit-freeresponse.js`
  (`student_work_type='excalidraw'`).
- **Upload** — photo/PDF of handwritten work (`student_work_type='upload'`,
  stored to R2).

The attempt lands in `student_question_attempts` with `review_status='pending'`;
the student sees **"Under review."** A tutor clears it in the **Grading Queue**
(`pages/api/admin/grading-queue.js`) with a verdict — Correct / Partial (50%) /
Incorrect — which writes `admin_verdict`, `score`, `graded_by/at` and (on
approval) records the mastery event. The matching 3D slice stays grey while
pending.

### 4.4 Flashcards

QTs with `weakness_score ≥ 2` form the deck (`pages/api/student/flashcards.js`),
ordered by weakness desc. Front = LO-framed prompt; back = the LO's `subtopics`
or a deterministic study scaffold. **Zero-token, no LLM in the render path.**
Available as a dashboard panel and the standalone `pages/flashcards.js`.

---

## 5. The 3D visualization

The dashboard centerpiece encodes the §2 tree as geometry with **mastery as
material properties** — it's the first thing the student sees, on purpose.

### 5.1 Shape modes (`components/SubjectCylinder3D.js`, ~4.3k lines)

Three homeomorphisms of the same tree, toggled at runtime:

| Mode | Primary→Unit | Unit→LO | LO→QT |
|---|---|---|---|
| **Cylinder** *(default)* | horizontal bands (y-axis) | disk slices | arc segments |
| **Torus** | segments around the major circle | tube sub-segments | arc wedges |
| **Cube / Bar** | stacked bars | face regions | perimeter segments |

Key constants: `CUBE_HALF=0.86`, `TORUS_MAJOR_R=1.02`, `TORUS_TUBE_R=0.25`,
`TOTAL_CYLINDER_HEIGHT=10`, cylinder radius `CYL_R≈0.8`. Invariant across all
three: **arc angular length ∝ 1/(#QTs in the LO)** — every QT gets an equal slot.
Default shape is **cylinder** (a later commit overrode an earlier torus default).

### 5.2 Color = mastery

Two palette sets exist: `SHAPE_PALETTE_STOPS` in `dashboard.js` (six 4-stop
palettes: `ember, sunset, ocean, midnight, royal, forest`) drives the dashboard
shapes/breadcrumb/legend; `MASTERY_STOPS_*` in `SubjectCylinder3D.js` (5-stop)
drives the time-theme mapping. `masteryStep(m, stops)` interpolates in RGB.
**Default palette is `sunset`**, persisted in `localStorage`
(`scholar-dashboard-palette`). The palette also buckets the 90-day check-in map.

### 5.3 Drill state (stageLevel 0–4)

```
stageLevel = drillQuestionIdx != null ? 4
           : drillQtypeIdx    != null ? 3
           : drillLoIdx       != null ? 2
           : drillUnitIdx     != null ? 1 : 0
```

These are plain React state shared by the Overview and the Practice Room — which
is how "Practice this question? → Open Practice" hands off: it copies the drill
indices and flips `activeSection` to `"cylinder"`, so the Practice Room opens
already five cells deep on that exact question. Geometry is memoized per
(unit-count, shape) pair; only color/opacity update on mastery change.

### 5.4 The onboarding tour (13-step, shape-aware)

A 13-step spotlight (`tourSteps` in `dashboard.js`, rendered by
`DashboardTourOverlay`) walks: the 3D shape → color legend → palette pick →
drill parent→sub→subsub → answer a question → upward propagation → scratchpad →
flag → breadcrumb → time-decay. It is **shape-aware** — step copy swaps
terminology via `shapeNames` (Cylinder/Disk/Ring vs Torus/Segment/Ring vs
Bar/Slice/Section). Several steps gate on real events (`palette-selected`,
`overview-unit-selected`, `practice-answer-submitted`). It targets DOM refs with
~15s polling and falls back to a centered card if a ref never mounts. Dismissal
persists in `localStorage` as `scholar-dashboard-tour-complete-v2` (the `v2`
suffix re-shows it after the rewrite). This is the chosen home for UX
explanation — in the experience, not in modals users skip.

---

## 6. Tutor / admin surface (`pages/admin.js`, ~8.5k lines)

One big page, 13 tabs in two groups:

**Core workflow:** Dashboard · **Live Class** (run a session: prompts, timers,
tangents) · **Calendar** (synced sessions + planning frontier) · **Pacing Guide**
· **Review Queue** · **Import**.
**Content + Ops:** **Sources** (Sources Studio, §7.5) · Reschedule · Practice
Revision · **Showcase** · **Question Flags** (reported items + student scratch
work) · **Grading Queue** (§4.3) · Backups (deprecated/410).

API lives under `pages/api/admin/*` (~48 handlers), grouped roughly: session
planning (`plan-sessions`, `live-class-plan`, `live-class-flow`,
`session-frontier`), calendar sync (`connect-calendar`, `calendar-*`,
`sync-sessions`), review/QA (`review-queue`, `grading-queue`, `question-flags`,
`regenerate-cache`), backfill/tagging (`backfill-*`, `bulk-assign-qts`), imports
(`import`, `worksheet-*`), config (`subject-config`, `pacing-guide`,
`seed-overlay`, `showcase-code`).

### 6.1 Session planner & scheduling

`POST /api/admin/plan-sessions` is the weekly offline loop:

1. **Sort QTs** by pacing order (overlay sequence, or per-student
   `enrollments.pacing_data` for taxonomy subjects).
2. **Split by prerequisites** (§3.5) and **at the frontier** (anchor date):
   before → backfill, at/after → forward.
3. **Synthesize historical sessions** where backfill needs a date with no
   session (`source='calendar_inferred'`, cadenced from `meeting_days`).
4. **Pack** into sessions at `typesPerHour × duration` (≈3 QTs/hr); overflow
   spills to a buffer date.
5. **Write `draft_items`** (`draft_state='backlog'`, `committed=false`).

Committed items lock at live-class start; uncommitted ones can be rescheduled.
Supporting libs: `lib/backfill.js` (session synthesis + SLO/reinforcement
backfill via Claude), `lib/pacing-guide.js` / `lib/pacing-defaults.js`
(resolution + hardcoded default sequences), `lib/session-mode.js`
(teaching-vs-practice inference), `lib/live-draft.js`, `lib/draft-context.js`,
`lib/session-signals.js` (pre/exit deltas). The calendar UI is
`components/AdminSchedulingCalendar.js` (FullCalendar); tutor calendar sync uses
a stored refresh token (`lib/tutor-calendar.js`).

---

## 7. Content ingestion pipeline (source → DB)

This is the largest subsystem the app has grown and is mostly **offline +
human-in-the-loop**. The server imports JSON; it does not run extraction.

### 7.1 Extraction prompts (three passes, run in a chat app)

`qt-extraction-prompt-mcq.md` / `-epub.md` (root) and per-source prompts under
`canonicalprompts/sources/<Subject>/<Family>/extract-*.md` define a
**three-pass** spec, stamped with a SUBJECT CONTEXT block (subject key, source
label, `textbook_key`, and a trimmed **SLO LIST**):

- **Pass 1 — perception:** every question verbatim, MCQ-vs-FRQ decided *solely*
  by whether the source page printed answer choices, figure **bounding boxes**
  (normalized, top-left origin), `source_section`/`exercise_ref`, and a coarse
  `unit_guess` + `primary_slo_guess` pre-filter. Output is one
  `stage: pass1_extract` JSON object.
- **Pass 2 — clustering:** group questions into QTs.
- **Pass 3 — weights & tree:** SLO weights summing to 1.0 (primary/aligned/
  reinforcement *derived from* the weights), `ordered_content`, `source_reference`,
  stem groups → a `version: 2` import tree.

### 7.2 Build scripts (`scripts/`, Python)

- `build_*_taxonomy.py` → `data/generated-*-taxonomy.json` (e.g. AP Calc AB is
  derived from BC, dropping BC-only LOs) and patches `lib/district-taxonomy.js`.
- `generate-slo-lists.py` → `canonicalprompts/slo-list-*.md` (the human-readable
  SLO block pasted into prompts).
- `build_*_source_pipeline.py` → per-source extraction prompts + **import-tree
  scaffolds** (`import-tree-<textbook_key>.json`: units pre-binned with valid
  `slo_reference` codes and an empty `question_types: []` for the classifier to
  fill). `ap_ced_verbatim_pipeline.py` extracts raw CED text (PyMuPDF) and can
  run a strict Claude pass for verbatim LO/EK JSON.

### 7.3 Import-tree format & importer

The classifier's Pass-3 output is dropped into a scaffold's `question_types[]`,
`content_bank_id` is set, then:

```
node scripts/import-extracted-tree.cjs <tree.json>           # dry-run
node scripts/import-extracted-tree.cjs <tree.json> --apply   # write
```

The importer resolves `section_ref → school_section_id` via the overlay, creates
`question_types` rows (with `slo_weights` in metadata) or absorbs into an
existing QT, **flattens shared-stimulus sets** (parent `stem_header_content` +
children with `stem_group_id`/`is_stem_child`), computes a **`qhash`** per
question for idempotent re-runs, and writes `questions` rows with
`question_content` (ordered array), `source_reference`, and format fields.

### 7.4 Question content model (migrations 016–017)

- **016** `questions.question_content` (jsonb): ordered `[{type:"text"|"image", …}]`
  so "figure above/below/inline" render order is preserved (replaces flat
  text + image-ref columns).
- **017** stem grouping (`stem_group_id`, `is_stem_child`, `stem_header_content`)
  for multi-part FRQs, plus the free-response review columns on
  `student_question_attempts` (`review_status`, `student_work_type`,
  `excalidraw_json`, `upload_url`, `admin_verdict`, `score`, `graded_by/at`).

### 7.5 Sources Studio (`components/SourcesStudio.js`, ~1.7k lines)

Admin surface for **figure curation**, not re-extraction. It lists rows from the
`sources` registry (migration 018; counts QTs/questions by `textbook_key`),
streams the source PDF from R2 (`/api/admin/sources/[key]/pdf` — proxied, not a
CDN redirect, to dodge Firefox CORS), overlays each question's image bounding
boxes, and lets the tutor drag/resize/create/delete boxes. **"Save & re-crop"**
(`lib/recrop-question-image.js`) shells out to PyMuPDF (`scripts/crop_pdf_regions.py`),
uploads the SHA-keyed PNG to R2, and patches the question's image item URL. It
also has an EPUB code path (images keyed by `spine_index`/`inner_path`) that the
ingestion side doesn't fully populate yet.

### 7.6 In-app Claude (`lib/claude.js`) — distinct from the above

Claude **Sonnet 4.6** is used at runtime for: MCQ generation from stored Q/A or
page blocks (`generateMCQFrom*`, with vision for diagrams), SLO tagging
(`tagQuestionTypesWithSlos`), and assessment cache warming. Called from
`regenerate-cache`, `rebuild-pages`, `warm-cache`, `assessment`. It does **not**
run the §7.1 extraction.

---

## 8. Showcase mode

`lib/showcase.js` + `lib/showcase-demo.js` implement an **isolated parallel
tutoring world** for demos (investors, partner schools, candidate students):

1. Admin generates a 6-digit code (`POST /api/admin/showcase-code`); one-time,
   72h expiry.
2. Visitor enters name + code at `/showcase/login`; server redeems it, sets a
   signed HMAC cookie, redirects to `/dashboard?demo=1&showcase=1`.
3. `isShowcaseDemo(req)` swaps every read/write path to a showcase store:
   `getShowcaseDashboardPayload` serves fixed demo subjects with real banks
   (seeded with mixed LO mastery so the 3D map looks lived-in);
   `recordShowcasePracticeAttempt` writes a per-viewer in-memory/disk JSON store,
   never Supabase.

Structurally this is the proof that **the surfaces are read-through functions
over a knowledge state**: swapping the backing store is one boolean at the edge;
no 3D/scoring/UI component knows the difference.

---

## 9. Data model (migration map)

Schema of record is `supabase/migrations/*.sql` (001 → 019). High-level:

- **Curriculum spine** — `curriculum_frameworks`, `learning_objectives`,
  `sub_learning_objectives`, `content_banks`, `school_overlays`, `school_units`,
  `school_sections`, `school_section_slos`, `lo_graph_edges`.
- **Content** — `question_types`, `questions` (`question_content`,
  `source_reference` jsonb, stem-group cols), `sources`.
- **Students** — `students`, `enrollments` (`pacing_data`, `meeting_days`).
- **Knowledge state** — `student_question_types`, `student_question_attempts`
  (append-only labeled log + FRQ review cols).
- **Teaching instance** — `sessions`, `draft_items`, `assessment_attempts`,
  `homework_attempts`.
- **Misc** — `showcase_codes`, `user_presence`, `question_flags`.

Notable migrations: 015 attempts log · 016 ordered content · 017 stems + FRQ
review · 018 `sources` table · 019 `source_reference` → jsonb. `validate_*`
triggers enforce cross-table coherence (a QT must belong to the subject's bank;
draft items require a configured pacing mode). `SCHEMA.md` has the fuller table
reference.

---

## 10. Repo map

**Pages** — `dashboard.js` (~4.7k: student everything), `admin.js` (~8.5k: tutor
everything), `practice.js` / `homework.js` / `assessment.js` / `flashcards.js`
(runners), `showcase*.js`, `preview.js`, `api/{student,admin,showcase}/*`.

**Components** — `SubjectCylinder3D.js` (~4.3k: the 3D scene), `CylinderPanels.js`
(per-level drill panels), `SourcesStudio.js` (~1.7k: figure curation),
`QuestionPane.js` (MCQ/FRQ UI), `DrillBreadcrumbs.js`, `LOGraphView.js`,
`LoCylinderPie3D.js`, `MathText.js`, `ExcalidrawDock.js`, `ScrambleText.js`,
`AdminSchedulingCalendar.js`.

**Lib** — `db.js` (mastery/scoring), `supabase.js` (REST), `cylinder-data.js`
(tree→geometry projection), `district-taxonomy.js` + `ap-physics-1-taxonomy.js`,
`pacing-guide.js`/`pacing-defaults.js`, `backfill.js`, `tutor-calendar.js`/
`calendar.js`, `claude.js`, `r2.js`, `pdf.js`, `recrop-question-image.js`,
`showcase*.js`, `auth.js`, plus session/draft helpers.

**Scripts** — Python taxonomy/pipeline builders + `import-extracted-tree.cjs`.
**canonicalprompts/** — extraction prompts + generated SLO lists.
**docs/** — taxonomy references, content-pipeline specs, handoffs, infra notes.

---

## 11. Operational notes & tech debt (read before you change things)

- **`MASTERY_DECAY_BYPASS = true`** (§3.3) — mastery never decays today. Single
  most surprising behavior in the system.
- **Extraction is manual / chat-driven** (§7.1). There is no "import a textbook"
  button that calls an LLM; you paste prompts elsewhere and import JSON. The
  generated scaffolds (e.g. AP Calc AB's three) ship with `question_types: []` —
  i.e. taxonomy is seeded but no questions are imported until someone runs the
  pipeline.
- **Notion is dead code; email is unwired.** Don't build on either.
- **Provenance is a soft string link** (`textbook_key`), not a FK to `sources.id`.
  Dedup leans on `qhash`. Re-engineer carefully.
- **Single-tutor / hard-coded admin** in `lib/auth.js`. No RBAC, no org model.
- **Two giant files** (`admin.js` ~8.5k, `dashboard.js` ~4.7k) concentrate most
  product logic. Expect to spend onboarding time there.
- **Two palette systems** (dashboard vs. SubjectCylinder3D) that must be kept in
  visual sync by hand.

---

## 12. Extension points

Because every surface reads one scalar `mastery ∈ [0,1]` per (student, QT), the
belief model is swappable without touching UI:

- `lib/db.js:calculateMasteryScore` / `getLatestMasterySnapshot` — replace the
  forgetting curve (e.g. per-student half-life, BKT/DKT, IRT). The 3D layer is
  unaffected.
- `lib/db.js:calculateReinforcementByCode` + `lib/cylinder-data.js` (the 0.2
  ceiling) — replace the propagation/prereq prior; `lo_graph_edges` is already a
  weighted DAG to learn over.
- `lib/db.js:record{Practice,HW,Assessment}Attempt` + `student_question_attempts`
  — the labeled-pair telemetry tap; raw training signal already logged.
- FRQ grading (§4.3) — the tutor-verdict gate is the natural seam for an
  automated rubric evaluator.

---

_Last refresh: 2026-05-23. Anchor files: `lib/db.js` (mastery math + bypass
flag), `lib/cylinder-data.js` (tree projection + propagation ceiling),
`components/SubjectCylinder3D.js` (3D scene), `pages/dashboard.js` /
`pages/admin.js` (surfaces), `components/SourcesStudio.js` +
`scripts/import-extracted-tree.cjs` (ingestion), `supabase/migrations/` (schema
of record)._
