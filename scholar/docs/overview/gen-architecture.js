#!/usr/bin/env node
// Generates scholar-architecture.excalidraw
// Run: node docs/gen-architecture.js

const fs = require("fs");

let idCounter = 1;
const elements = [];

function id() { return `el_${idCounter++}`; }

function rect({ x, y, w, h, label, bg = "#f8f9fa", stroke = "#495057", fontSize = 14, bold = false, strokeWidth = 1, roughness = 0 }) {
  const eid = id();
  elements.push({
    id: eid, type: "rectangle", x, y, width: w, height: h,
    backgroundColor: bg, strokeColor: stroke, strokeWidth, roughness,
    fillStyle: "solid", opacity: 100, angle: 0,
    boundElements: label ? [{ type: "text", id: eid + "_t" }] : []
  });
  if (label) {
    elements.push({
      id: eid + "_t", type: "text", x: x + 4, y: y + h / 2 - (fontSize * 0.7),
      width: w - 8, height: fontSize * 1.4, text: label,
      fontSize, fontFamily: 1, textAlign: "center", verticalAlign: "middle",
      strokeColor: "#212529", backgroundColor: "transparent",
      fillStyle: "solid", opacity: 100, angle: 0,
      fontWeight: bold ? "bold" : "normal", roughness: 0,
      containerId: eid, boundElements: []
    });
  }
  return eid;
}

function text({ x, y, text: t, fontSize = 13, color = "#212529", bold = false, width = 300 }) {
  const eid = id();
  elements.push({
    id: eid, type: "text", x, y, width, height: fontSize * 1.4,
    text: t, fontSize, fontFamily: 1, textAlign: "left", verticalAlign: "top",
    strokeColor: color, backgroundColor: "transparent", fillStyle: "solid",
    opacity: 100, angle: 0, roughness: 0, fontWeight: bold ? "bold" : "normal",
    boundElements: []
  });
  return eid;
}

function arrow({ x1, y1, x2, y2, color = "#495057", label = "" }) {
  const eid = id();
  elements.push({
    id: eid, type: "arrow", x: x1, y: y1,
    width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
    points: [[0, 0], [x2 - x1, y2 - y1]],
    strokeColor: color, backgroundColor: "transparent",
    fillStyle: "solid", strokeWidth: 1.5, roughness: 0, opacity: 100, angle: 0,
    endArrowhead: "arrow", startArrowhead: null, boundElements: []
  });
  if (label) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    text({ x: mx - 50, y: my - 10, text: label, fontSize: 11, color: "#6c757d", width: 120 });
  }
  return eid;
}

function section(label, x, y, w, h, bg = "#e7f5ff") {
  rect({ x, y, w, h, bg, stroke: "#74c0fc", strokeWidth: 2, roughness: 1 });
  text({ x: x + 10, y: y + 8, text: label, fontSize: 16, color: "#1864ab", bold: true, width: w - 20 });
}

function dbTable({ x, y, w, name, fields, bg = "#fff9db", stroke = "#f59f00" }) {
  const rowH = 22, headerH = 32;
  const totalH = headerH + fields.length * rowH + 8;
  rect({ x, y, w, h: headerH, bg: stroke, stroke, strokeWidth: 2 });
  text({ x: x + 6, y: y + 8, text: `🗄 ${name}`, fontSize: 13, color: "#fff", bold: true, width: w - 12 });
  rect({ x, y: y + headerH, w, h: fields.length * rowH + 8, bg, stroke, strokeWidth: 1.5 });
  fields.forEach((f, i) => {
    text({ x: x + 10, y: y + headerH + 4 + i * rowH, text: f, fontSize: 11, color: "#495057", width: w - 20 });
  });
  return { x, y, w, h: totalH, cx: x + w / 2, cy: y + totalH / 2, bottom: y + totalH, right: x + w };
}

function apiGroup({ x, y, w, title, routes, bg = "#ebfbee", stroke = "#40c057" }) {
  const rowH = 20, headerH = 28;
  const totalH = headerH + routes.length * rowH + 8;
  rect({ x, y, w, h: headerH, bg: stroke, stroke, strokeWidth: 2 });
  text({ x: x + 6, y: y + 7, text: title, fontSize: 13, color: "#fff", bold: true, width: w - 12 });
  rect({ x, y: y + headerH, w, h: routes.length * rowH + 8, bg, stroke, strokeWidth: 1 });
  routes.forEach((r, i) => {
    text({ x: x + 8, y: y + headerH + 4 + i * rowH, text: r, fontSize: 10, color: "#2f9e44", width: w - 16 });
  });
  return { x, y, w, h: totalH, cx: x + w / 2, cy: y + totalH / 2, bottom: y + totalH, right: x + w };
}

// ─── LAYOUT ────────────────────────────────────────────────────────────────────

// TITLE
rect({ x: 300, y: 20, w: 1000, h: 60, bg: "#1c7ed6", stroke: "#1864ab", strokeWidth: 3 });
text({ x: 310, y: 36, text: "SCHOLAR TUTORING PLATFORM — Full Architecture (Microservice / API View)", fontSize: 18, color: "#fff", bold: true, width: 980 });

// ═══════════════════════════════════════════════
// SECTION 1: NOTION DATABASES  (top left)
// ═══════════════════════════════════════════════
section("NOTION (Source of Truth — all persistence)", 40, 120, 760, 980, "#fff9db");

const studentsDB = dbTable({
  x: 60, y: 170, w: 220, name: "STUDENTS_DB",
  fields: [
    "• id (Notion page ID)",
    "• Name (title)",
    "• Email",
    "• Timezone (e.g. America/New_York)",
    "• State, Country",
    "• Exam Date",
    "• Parent Emails",
    "• Subject IDs (relation →SUBJECTS)"
  ],
  bg: "#fff9db", stroke: "#f59f00"
});

const subjectsDB = dbTable({
  x: 310, y: 170, w: 220, name: "SUBJECTS_DB",
  fields: [
    "• id",
    "• Name (e.g. AP Physics 1)",
    "• Data Source ID",
    "  (Notion DB of question pages)"
  ],
  bg: "#fff9db", stroke: "#f59f00"
});

const enrollmentsDB = dbTable({
  x: 560, y: 170, w: 220, name: "ENROLLMENTS_DB",
  fields: [
    "• Student (→STUDENTS)",
    "• Subjects (→SUBJECTS)",
    "• Class Time, Duration",
    "• Timezone, Day of Week",
    "• Zoom Link"
  ],
  bg: "#fff9db", stroke: "#f59f00"
});

const scoresDB = dbTable({
  x: 60, y: 430, w: 260, name: "SCORES_DB ⭐ (canonical)",
  fields: [
    "• Student (→STUDENTS)",
    "• Subject (→SUBJECTS)",
    "• Question ID (Notion page in DataSource)",
    "• Score (weakness count)",
    "• Date Introduced",
    "• Unit, Standard Code",
    "• Status (scheduled/backlog/etc)",
    "• hw_source (session/weakness/admin_hw)",
    "• attempted_qhashes",
    "  (encodes __mastery__:src:wt:date:qkey)",
    "• assigned_at (admin homework date)"
  ],
  bg: "#ffe8cc", stroke: "#e67700"
});

const sessionsDB = dbTable({
  x: 360, y: 430, w: 220, name: "SESSIONS_DB",
  fields: [
    "• Student (→STUDENTS)",
    "• Subject (→SUBJECTS)",
    "• Student Session Date (YYYY-MM-DD)",
    "• Start / End Times",
    "• Pre-Class PDF URL",
    "• Exit Ticket PDF URL",
    "• Homework PDF URL",
    "• Session Report URL",
    "• Status",
    "• AssessmentAttempts (→)",
    "• HomeworkAttempts (→)"
  ],
  bg: "#fff9db", stroke: "#f59f00"
});

const homeworkAttemptsDB = dbTable({
  x: 60, y: 740, w: 260, name: "HOMEWORK_ATTEMPTS_DB",
  fields: [
    "• Student ID, Subject ID",
    "• Cycle Key (date string)",
    "• Session Date",
    "• Status (pending/submitted)",
    "• Score, Total",
    "• Question Payload (JSON)",
    "• Result Payload (JSON)",
    "• PDF URL (R2)",
    "• Is Latest, Is Official"
  ],
  bg: "#fff9db", stroke: "#f59f00"
});

const assessmentAttemptsDB = dbTable({
  x: 360, y: 740, w: 240, name: "ASSESSMENT_ATTEMPTS_DB",
  fields: [
    "• Student ID, Subject ID",
    "• Mode (pre / exit)",
    "• Session Date",
    "• Status",
    "• Score, Total",
    "• Question Payload (JSON)",
    "• Result Payload (JSON)",
    "• PDF URL (R2)"
  ],
  bg: "#fff9db", stroke: "#f59f00"
});

// ═══════════════════════════════════════════════
// SECTION 2: EXTERNAL SERVICES  (top right)
// ═══════════════════════════════════════════════
section("EXTERNAL SERVICES", 860, 120, 380, 420, "#f3f0ff");

rect({ x: 880, y: 170, w: 160, h: 50, bg: "#7950f2", stroke: "#5f3dc4", strokeWidth: 2 });
text({ x: 888, y: 183, text: "Claude API\n(Anthropic)", fontSize: 13, color: "#fff", bold: true, width: 144 });

rect({ x: 1060, y: 170, w: 160, h: 50, bg: "#1c7ed6", stroke: "#1864ab", strokeWidth: 2 });
text({ x: 1068, y: 183, text: "Google OAuth\n(NextAuth.js)", fontSize: 13, color: "#fff", bold: true, width: 144 });

rect({ x: 880, y: 240, w: 160, h: 50, bg: "#f76707", stroke: "#d9480f", strokeWidth: 2 });
text({ x: 888, y: 253, text: "Cloudflare R2\n(PDF + Image Storage)", fontSize: 12, color: "#fff", bold: true, width: 144 });

rect({ x: 1060, y: 240, w: 160, h: 50, bg: "#2f9e44", stroke: "#2b8a3e", strokeWidth: 2 });
text({ x: 1068, y: 253, text: "Google Calendar\n(OAuth + Sync)", fontSize: 12, color: "#fff", bold: true, width: 144 });

rect({ x: 880, y: 310, w: 160, h: 50, bg: "#e03131", stroke: "#c92a2a", strokeWidth: 2 });
text({ x: 888, y: 323, text: "Puppeteer\n(PDF Generation)", fontSize: 13, color: "#fff", bold: true, width: 144 });

rect({ x: 1060, y: 310, w: 160, h: 50, bg: "#495057", stroke: "#343a40", strokeWidth: 2 });
text({ x: 1068, y: 323, text: "Mammoth + pdf-parse\n(Import: .docx/.pdf)", fontSize: 12, color: "#fff", bold: true, width: 144 });

rect({ x: 880, y: 380, w: 340, h: 50, bg: "#0c8599", stroke: "#0b7285", strokeWidth: 2 });
text({ x: 888, y: 393, text: "Notion Question Pages (DataSource DB per subject)\nContains MCQ_CACHE blocks per region/LO", fontSize: 12, color: "#fff", bold: true, width: 324 });

text({ x: 880, y: 445, text: "MCQ_CACHE block format:", fontSize: 11, color: "#495057", width: 340 });
rect({ x: 880, y: 462, w: 340, h: 60, bg: "#f8f9fa", stroke: "#adb5bd" });
text({ x: 890, y: 470, text: "MCQ_CACHE | Country: USA | State: SC | LO: AP.1.2\n| QHASH: abc123 | JSON: {...}\nPriority: exact(LO) > base(country/state)", fontSize: 10, color: "#495057", width: 330 });

// ═══════════════════════════════════════════════
// SECTION 3: STUDENT API ROUTES  (middle)
// ═══════════════════════════════════════════════
section("STUDENT API  /api/student/*", 860, 560, 760, 560, "#ebfbee");

const studentAPIs = [
  { title: "GET /dashboard", x: 880, y: 610, routes: [
    "→ STUDENTS_DB (profile)",
    "→ ENROLLMENTS_DB (class schedule)",
    "→ SESSIONS_DB (upcoming sessions)",
    "→ SUBJECTS_DB (subject list)",
    "← {student, subjects[], nextClass, sessionDate}"
  ]},
  { title: "GET /assessment", x: 1080, y: 610, routes: [
    "→ SCORES_DB (scheduled questions for date)",
    "→ DataSource DB (question page content)",
    "→ MCQ_CACHE (or generate on-the-fly)",
    "← {questions[], attemptId, status}"
  ]},
  { title: "POST /submit", x: 880, y: 760, routes: [
    "→ SCORES_DB (update weakness/mastery)",
    "→ ASSESSMENT_ATTEMPTS_DB (create record)",
    "→ FIFO Swap (if wrong answers on pre-class)",
    "  • push wrong Qs to today's plan",
    "  • displace Qs to next class +7d",
    "← {score, updatedScores[], swap{}}"
  ]},
  { title: "GET /homework  POST /submit-homework", x: 1080, y: 760, routes: [
    "→ SCORES_DB (hw_source tagged Qs)",
    "→ HOMEWORK_ATTEMPTS_DB (create/update)",
    "→ SCORES_DB (update weakness on submit)",
    "← {questions[], cycleKey, result{}}"
  ]},
  { title: "GET /flashcards", x: 880, y: 940, routes: [
    "→ SCORES_DB (where score > 2)",
    "→ DataSource (question content)",
    "← {cards[]} — spaced repetition deck"
  ]},
  { title: "GET /today-topics  GET /weakness", x: 1080, y: 940, routes: [
    "→ SCORES_DB (today's scheduled Qs)",
    "→ DataSource (titles/units)",
    "← {topics[], weaknessByUnit{}}"
  ]},
];

studentAPIs.forEach(api => {
  apiGroup({ x: api.x, y: api.y, w: 180, title: api.title, routes: api.routes, bg: "#ebfbee", stroke: "#40c057" });
});

// ═══════════════════════════════════════════════
// SECTION 4: ADMIN API ROUTES
// ═══════════════════════════════════════════════
section("ADMIN API  /api/admin/*", 40, 1130, 1580, 460, "#fff0f6");

const adminAPIs = [
  { title: "POST /import", x: 60, y: 1180, routes: [
    "Upload PDF/Word worksheet",
    "→ Mammoth/.pdf-parse (extract text)",
    "→ Claude Vision API (generate MCQs)",
    "→ DataSource DB (create question pages)",
    "→ MCQ_CACHE blocks written to pages",
    "→ SCORES_DB (schedule new questions)"
  ]},
  { title: "GET/POST /worksheet-draft", x: 280, y: 1180, routes: [
    "OCR worksheet via Claude Vision",
    "→ R2 (upload images)",
    "→ Claude API (extract Q&A pairs)",
    "Draft stored in memory/session",
    "→ /worksheet-sidecar-generate",
    "  finalizes to DataSource DB"
  ]},
  { title: "GET /live-class-plan  /live-class-flow", x: 500, y: 1180, routes: [
    "→ SCORES_DB (today's class queue)",
    "→ SESSIONS_DB (session record)",
    "→ DataSource (question content)",
    "Tutor steps through question stack",
    "← {questionStack[], currentQ, progress}"
  ]},
  { title: "POST /end-class  GET /end-class-context", x: 720, y: 1180, routes: [
    "→ SESSIONS_DB (mark Status=complete)",
    "→ Puppeteer (generate session PDFs)",
    "→ R2 (store PDFs)",
    "→ SESSIONS_DB (write PDF URLs)",
    "Prepares exit ticket questions"
  ]},
  { title: "GET /calendar-events  /connect-calendar", x: 940, y: 1180, routes: [
    "Google Calendar OAuth flow",
    "→ SESSIONS_DB (sync class times)",
    "← {events[], nextSession}"
  ]},
  { title: "GET /pacing-guide  POST /reschedule", x: 1160, y: 1180, routes: [
    "→ SCORES_DB (question dates)",
    "Lock/unlock teaching order",
    "Move questions to new dates",
    "← {pacing[], unitsMap{}}"
  ]},
  { title: "GET /review-queue  POST /rebuild-pages", x: 1380, y: 1180, routes: [
    "→ DataSource DB (flagged questions)",
    "→ SCORES_DB (bulk reschedule)",
    "Content review + approval flow",
    "Regenerate MCQ cache on pages"
  ]},
  { title: "POST /backup-r2  /rollover", x: 60, y: 1390, routes: [
    "→ R2 (export full workspace)",
    "Year-end rollover: clear scores",
    "Archive old sessions"
  ]},
  { title: "GET /assessment-attempts  /homework-list", x: 280, y: 1390, routes: [
    "→ ASSESSMENT_ATTEMPTS_DB",
    "→ HOMEWORK_ATTEMPTS_DB",
    "← attempt history for admin review"
  ]},
  { title: "GET /setup-db-columns  /backfill-*", x: 500, y: 1390, routes: [
    "Initialize Notion DB schema",
    "Backfill standard codes",
    "Backfill reinforcement tags"
  ]},
];

adminAPIs.forEach(api => {
  apiGroup({ x: api.x, y: api.y, w: 200, title: api.title, routes: api.routes, bg: "#fff0f6", stroke: "#e64980" });
});

// ═══════════════════════════════════════════════
// SECTION 5: FRONTEND PAGES
// ═══════════════════════════════════════════════
section("FRONTEND PAGES (Next.js)", 40, 1620, 1580, 320, "#e7f5ff");

const pages = [
  { title: "/ (Login)", x: 60, y: 1670, desc: [
    "Google OAuth via NextAuth",
    "Time-based theme:",
    "  5-12am: Morning ☀",
    "  12-5pm: Afternoon",
    "  5-10pm: Evening 🌙",
    "  10pm-5am: Night",
    "→ /dashboard or /admin"
  ]},
  { title: "/dashboard", x: 290, y: 1670, desc: [
    "← /api/student/dashboard",
    "Shows: subjects, next class timer",
    "SubjectCylinder3D component",
    "LOGraphView (Three.js 3D graph)",
    "Progress charts by unit",
    "Admin: ?as=studentId impersonation"
  ]},
  { title: "/assessment", x: 520, y: 1670, desc: [
    "← /api/student/assessment",
    "10-min countdown timer",
    "MCQ question display (LaTeX via KaTeX)",
    "Excalidraw scratchpad (dynamic import)",
    "Answer tracking, submit flow",
    "→ POST /api/student/submit",
    "Shows swap result + score"
  ]},
  { title: "/homework", x: 750, y: 1670, desc: [
    "← /api/student/homework",
    "Question set by cycle key",
    "Submit answers flow",
    "→ POST /submit-homework",
    "Shows results + PDF link"
  ]},
  { title: "/flashcards", x: 980, y: 1670, desc: [
    "← /api/student/flashcards",
    "Weakness score > 2 filter",
    "Card flip animation",
    "Spaced repetition review"
  ]},
  { title: "/admin", x: 1210, y: 1670, desc: [
    "10+ panel sections:",
    "Live Class Flow + Stack",
    "Import Studio (PDF/Word→MCQ)",
    "Review Queue (approve content)",
    "Calendar Board (sync)",
    "Pacing Guide (lock order)",
    "Content Studio (worksheet OCR)",
    "Backup + Rollover tools"
  ]},
];

pages.forEach(pg => {
  const rowH = 18, headerH = 28;
  const h = headerH + pg.desc.length * rowH + 8;
  rect({ x: pg.x, y: pg.y, w: 210, h: headerH, bg: "#1c7ed6", stroke: "#1864ab", strokeWidth: 2 });
  text({ x: pg.x + 6, y: pg.y + 7, text: pg.title, fontSize: 13, color: "#fff", bold: true, width: 200 });
  rect({ x: pg.x, y: pg.y + headerH, w: 210, h: pg.desc.length * rowH + 8, bg: "#e7f5ff", stroke: "#74c0fc" });
  pg.desc.forEach((d, i) => text({ x: pg.x + 8, y: pg.y + headerH + 4 + i * rowH, text: d, fontSize: 10, color: "#1864ab", width: 196 }));
});

// ═══════════════════════════════════════════════
// SECTION 6: SCORING & BUSINESS LOGIC
// ═══════════════════════════════════════════════
section("CORE BUSINESS LOGIC (lib/logic.js + lib/notion.js)", 1660, 120, 680, 780, "#f8f9fa");

// Weakness scoring box
rect({ x: 1680, y: 170, w: 300, h: 200, bg: "#ffe8cc", stroke: "#e67700", strokeWidth: 2 });
text({ x: 1688, y: 178, text: "WEAKNESS SCORE (struggle index)", fontSize: 13, color: "#d9480f", bold: true, width: 284 });
const wLines = [
  "Stored in SCORES_DB → Score field",
  "",
  "+1.0  wrong on Assessment",
  "+0.2  wrong on Homework",
  "-0.1  correct on Practice",
  "-0.2  correct on Homework",
  "",
  "Score > 2  → appears in Flashcards",
  "Score drives hw_source tagging",
  "Score resets to 0 on strong correct"
];
wLines.forEach((l, i) => text({ x: 1690, y: 200 + i * 17, text: l, fontSize: 11, color: "#495057", width: 284 }));

// Mastery scoring box
rect({ x: 2000, y: 170, w: 320, h: 220, bg: "#d3f9d8", stroke: "#2b8a3e", strokeWidth: 2 });
text({ x: 2008, y: 178, text: "MASTERY SCORE (decay-based)", fontSize: 13, color: "#2b8a3e", bold: true, width: 304 });
const mLines = [
  "Stored in attempted_qhashes field:",
  "__mastery__:source:weight:date:qkey",
  "",
  "score = Σ(weight × decay_factor)",
  "",
  "Decay by age:",
  "  0-1 days:  1.0   (fresh)",
  "  2-3 days:  0.5",
  "  4-7 days:  0.25",
  "  8-15 days: 0.125",
  "  16+ days:  0.0625"
];
mLines.forEach((l, i) => text({ x: 2010, y: 200 + i * 17, text: l, fontSize: 11, color: "#2f9e44", width: 304 }));

// FIFO Swap box
rect({ x: 1680, y: 395, w: 320, h: 210, bg: "#e7f5ff", stroke: "#1c7ed6", strokeWidth: 2 });
text({ x: 1688, y: 403, text: "FIFO SWAP ALGORITHM", fontSize: 13, color: "#1864ab", bold: true, width: 304 });
const sLines = [
  "Triggers on: wrong answer in pre-class",
  "",
  "1. Wrong Qs → 'swap in' to today's plan",
  "2. Equal # of today's Qs → 'swap out'",
  "3. Swapped-out Qs → next class +7 days",
  "",
  "Result: student reviews mistakes",
  "before advancing to new content.",
  "",
  "Swap details returned in submit response:",
  "{ swap: { triggered, swappedIn[],",
  "  swappedOut[], nextClassDate } }"
];
sLines.forEach((l, i) => text({ x: 1690, y: 423 + i * 17, text: l, fontSize: 11, color: "#1864ab", width: 304 }));

// HW Source box
rect({ x: 2020, y: 415, w: 300, h: 185, bg: "#fff0f6", stroke: "#e64980", strokeWidth: 2 });
text({ x: 2028, y: 423, text: "HOMEWORK STACK (hw_source)", fontSize: 13, color: "#c2255c", bold: true, width: 284 });
const hLines = [
  "Questions enter HW stack if:",
  "",
  "• hw_source = 'session'",
  "  (from today's import, cleared next import)",
  "• hw_source = 'weakness'",
  "  (manually tagged by admin)",
  "• hw_source = 'admin_hw'",
  "  (directly assigned, optional assigned_at date)",
  "• score > 2 (auto-weak)",
  "",
  "Cycle key = date string for grouping",
];
hLines.forEach((l, i) => text({ x: 2028, y: 443 + i * 17, text: l, fontSize: 11, color: "#c2255c", width: 284 }));

// Question structure
rect({ x: 1680, y: 630, w: 640, h: 240, bg: "#f8f9fa", stroke: "#adb5bd", strokeWidth: 2 });
text({ x: 1688, y: 638, text: "QUESTION PAYLOAD STRUCTURE (JSON)", fontSize: 13, color: "#343a40", bold: true, width: 624 });
const qLines = [
  "{ notionQuestionId: 'page-uuid',    questionTypeTitle: 'Topic Name',",
  "  standardCode: 'AP.1.2.3',          unit: 'Unit 2 – Dynamics',",
  "  sourceImage: 'r2-url | null',       questionKey: 'md5hash',",
  "  question: 'A 5kg block...',",
  "  options: ['A. 10N', 'B. 20N', 'C. 5N', 'D. 15N'],",
  "  correctIndex: 1,",
  "  explanation: 'By Newton's second law F=ma...' }",
  "",
  "Context callout header format in Notion question pages:",
  "  📌 Country: USA | State: South Carolina | LO: PC.FTF.3 — Kinematics",
  "  System matches student Country/State/LO → serves correct MCQ version",
];
qLines.forEach((l, i) => text({ x: 1690, y: 660 + i * 20, text: l, fontSize: 11, color: "#495057", width: 624 }));

// ═══════════════════════════════════════════════
// SECTION 7: DATA FLOW ARROWS (key flows)
// ═══════════════════════════════════════════════
// Assessment flow label
rect({ x: 1660, y: 905, w: 680, h: 290, bg: "#fff9db", stroke: "#f59f00", strokeWidth: 2 });
text({ x: 1668, y: 913, text: "ASSESSMENT SUBMISSION — END TO END FLOW", fontSize: 14, color: "#d9480f", bold: true, width: 664 });
const flowLines = [
  "1.  Student submits answers at /assessment",
  "2.  POST /api/student/submit {subjectId, mode, answers[], sessionDate, attemptId}",
  "3.  For each answer:",
  "      a. recordAssessmentResult() → SCORES_DB (update weakness + mastery)",
  "      b. weakness: +1 wrong / -0.1 correct",
  "      c. mastery: write __mastery__:source:weight:date:qkey to attempted_qhashes",
  "4.  If mode=='pre' && wrong answers exist:",
  "      applySwap() → push wrong Qs to today | displace Qs to next class (+7d)",
  "5.  Create ASSESSMENT_ATTEMPTS_DB record:",
  "      { questionPayload: original Qs, resultPayload: scores + swap + timestamp }",
  "6.  Return {score, total, updatedScores[], swap{}, trends{}}",
  "7.  Frontend renders results screen",
  "8.  Trigger /persist-attempt-artifacts:",
  "      → Puppeteer generates PDF → R2 upload → URL saved to ASSESSMENT_ATTEMPTS_DB",
  "      → appendReadableAssessmentAttemptSummary() → writes result block to Notion session page",
];
flowLines.forEach((l, i) => text({ x: 1670, y: 938 + i * 17, text: l, fontSize: 11, color: "#495057", width: 664 }));

// ═══════════════════════════════════════════════
// SECTION 8: AUTH FLOW
// ═══════════════════════════════════════════════
section("AUTH & SESSION FLOW", 40, 1960, 500, 200, "#f3f0ff");
const authLines = [
  "1.  / (login page) → Google OAuth button",
  "2.  NextAuth.js → /api/auth/[...nextauth].js",
  "3.  Google returns user email",
  "4.  STUDENTS_DB queried by email → get student ID",
  "5.  Session token issued (JWT)",
  "6.  All /api/student/* endpoints call getServerSession()",
  "7.  Admin routes check session.user.isAdmin flag",
  "8.  Admin can impersonate: GET /api/student/*?as=<studentId>",
];
authLines.forEach((l, i) => text({ x: 60, y: 2000 + i * 18, text: l, fontSize: 11, color: "#495057", width: 470 }));

// ═══════════════════════════════════════════════
// SECTION 9: ENV VARS
// ═══════════════════════════════════════════════
section("ENVIRONMENT VARIABLES", 580, 1960, 420, 220, "#f8f9fa");
const envLines = [
  "NOTION_TOKEN",
  "NOTION_STUDENTS_DB      NOTION_SUBJECTS_DB",
  "NOTION_ENROLLMENTS_DB   NOTION_SCORES_DB",
  "NOTION_SESSIONS_DB      NOTION_REPORTS_DB",
  "NOTION_HOMEWORK_ATTEMPTS_DB",
  "NOTION_ASSESSMENT_ATTEMPTS_DB",
  "ANTHROPIC_API_KEY",
  "GOOGLE_CLIENT_ID        GOOGLE_CLIENT_SECRET",
  "NEXTAUTH_URL            NEXTAUTH_SECRET",
  "R2_BUCKET               R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID        R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BASE_URL      GOOGLE_CALENDAR_ID",
  "TUTOR_NAME              TUTOR_EMAIL",
];
envLines.forEach((l, i) => text({ x: 598, y: 2000 + i * 15, text: l, fontSize: 10, color: "#495057", width: 400 }));

// ─── ASSEMBLE & WRITE ─────────────────────────────────────────────────────────

const doc = {
  type: "excalidraw",
  version: 2,
  source: "https://excalidraw.com",
  elements,
  appState: {
    viewBackgroundColor: "#ffffff",
    currentItemFontFamily: 1,
    gridSize: null,
    zoom: { value: 0.6 },
    scrollX: 0,
    scrollY: 0
  },
  files: {}
};

fs.writeFileSync(
  __dirname + "/scholar-architecture.excalidraw",
  JSON.stringify(doc, null, 2)
);
console.log("✅  Wrote docs/scholar-architecture.excalidraw");
console.log(`   ${elements.length} elements`);
