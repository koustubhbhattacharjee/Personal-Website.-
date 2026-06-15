// Callout copy — drafted from Scholar's ARCHITECTURE.md.
// Each callout: which device screen it points at, anchor uv on that screen,
// which side of the stage the card sits on, and its timeline window.

export const CALLOUTS = [
  {
    id: "what",
    device: "mac",
    anchor: { u: 0.3, v: 0.22 },
    side: "left",
    kicker: "01 · What is Scholar?",
    title: "Software behind every lesson.",
    body:
      "This is the platform where I manage my students' learning. Homework, quizzes, assessments, strengths, weaknesses, retention. All in one place.",
  },
  {
    id: "shapes",
    device: "mac",
    anchor: { u: 0.56, v: 0.6 },
    side: "left",
    kicker: "02 · The map",
    title: "The course is a shape you can read.",
    body:
      "Students start by solving questions, which group into question types, then learning objectives, then units, and finally the whole subject. These are shown by the different shapes here.",
  },
  {
    id: "unit",
    device: "mac",
    anchor: { u: 0.25, v: 0.66 },
    side: "right",
    kicker: "03 · Drill in",
    title: "Double-click a band — the unit lifts out.",
    body:
      "Every band of the cylinder is a unit. Double-click one and it unfolds into a disk: Unit 5, Python and SQL. Each ring of the disk is a learning objective, and the color still means mastery.",
  },
  {
    id: "ring",
    device: "mac",
    anchor: { u: 0.24, v: 0.66 },
    side: "right",
    kicker: "04 · Keep drilling",
    title: "Rings are learning objectives.",
    body:
      "One more double-click isolates a ring: query and design relational databases with SQL. The arcs around it are the question types that prove the objective. The breadcrumb at the top tracks exactly where you are.",
  },
  {
    id: "qt",
    device: "mac",
    anchor: { u: 0.23, v: 0.7 },
    side: "right",
    kicker: "05 · The atom",
    title: "A single question type.",
    body:
      "SQL schema design is one teachable atom of the course, tested by a small set of questions. Its color is how reliably your student solves it. This is the level where Scholar decides what to teach next.",
  },
  {
    id: "question",
    device: "mac",
    anchor: { u: 0.36, v: 0.62 },
    side: "right",
    kicker: "06 · The handoff",
    title: "Down to one question slice.",
    body:
      "The last double-click lands on a single question — and Scholar offers the jump: practice this question. The map hands off to the practice room with everything already selected.",
  },
  {
    id: "mcq",
    device: "pad",
    anchor: { u: 0.5, v: 0.5 },
    side: "right",
    kicker: "07 · Practice Room",
    title: "Practice Room",
    body:
      "Students practice free-response and multiple-choice questions in the Practice Room. As correct answers come in, you see the colours of these shapes change — each correct answer pushes them further, all the way up to the cylinder.",
  },
  {
    id: "colour",
    device: "pad",
    anchor: { u: 0.5, v: 0.5 },
    side: "left",
    kicker: "08 · Roll-up",
    title: "It rolls all the way up.",
    body:
      "Each correct answer lifts the question's colour — and it rolls up the hierarchy: question, question type, learning objective, unit, and finally the whole subject. The cylinder shifts colour in front of you.",
  },
  {
    id: "decay",
    device: "pad",
    anchor: { u: 0.5, v: 0.5 },
    side: "left",
    kicker: "09 · Spaced repetition",
    title: "Colour doesn't lock in.",
    body:
      "Solving a question once doesn't lock it in. A spaced-repetition model slowly dims each shape's colour over time, until the student reinforces it by practising again. The math never lies about what's still remembered.",
    curve: true,
  },
  {
    id: "exit",
    device: "pad",
    anchor: { u: 0.52, v: 0.09 },
    side: "left",
    kicker: "10 · Exit ticket",
    title: "By hand, only when it counts.",
    body:
      "Working by hand is optional — students can answer on the laptop if they prefer, but they don't have to. The exception is free-response questions, which they work by hand.",
  },
  {
    id: "cards",
    device: "phone",
    anchor: { u: 0.5, v: 0.28 },
    side: "right",
    kicker: "11 · Flashcards",
    title: "Weak spots become flashcards. Automatically.",
    body:
      "When a topic's weakness score crosses the threshold, it turns into a flashcard — no deck-building, no busywork. The deck is always exactly what your student needs to review, easy to run from a phone.",
  },
  {
    id: "log",
    device: "phone",
    anchor: { u: 0.5, v: 0.56 },
    side: "right",
    kicker: "12 · Session log",
    title: "Progress you can see being tracked.",
    body:
      "Every attempt is logged. The daily check-in map — one square per day, GitHub-style — shows the streak at a glance. Parents see evidence, not promises.",
  },
];

export const SHOTS = {
  macDash: "/shots/mac-dashboard.png",
  macTorus: "/shots/mac-shape-torus.png",
  macBar: "/shots/mac-shape-bar.png",
  macUnit: "/shots/mac-drill-unit.png",
  macRing: "/shots/mac-drill-ring.png",
  macQt: "/shots/mac-drill-qt.png",
  macQuestion: "/shots/mac-drill-question.png",
  macMcq: "/shots/mac-mcq.png",
  macMcqSel: "/shots/mac-mcq-selected.png",
  macMcqCorrect: "/shots/mac-mcq-correct.png",
  macQtAfter: "/shots/mac-drill-qt-after.png",
  macQtDecayed: "/shots/mac-drill-qt-decayed.png",
  macDashDecayed: "/shots/mac-dashboard-decayed.png",
  padQ1: "/shots/ipad-exit-1.png",
  padQ2: "/shots/ipad-exit-2.png",
  phoneCards: "/shots/iphone-flashcards.png",
  phoneCardsBack: "/shots/iphone-flashcards-back.png",
  phoneCheckin: "/shots/iphone-checkin.png",
};

// mac screen layer order — rig keys, Scene layer list and the timeline all
// follow this sequence
export const MAC_LAYERS = [
  "macDash", "macTorus", "macBar",
  "macUnit", "macRing", "macQt", "macQuestion",
  "macMcq", "macMcqSel", "macMcqCorrect",
  "macQtAfter", "macQtDecayed", "macDashDecayed",
];
