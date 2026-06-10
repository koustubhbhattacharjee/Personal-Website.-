// Callout copy — drafted from Scholar's ARCHITECTURE.md.
// Each callout: which device screen it points at, anchor uv on that screen,
// which side of the stage the card sits on, and its timeline window.

export const CALLOUTS = [
  {
    id: "what",
    device: "mac",
    anchor: { u: 0.3, v: 0.22 },
    side: "right",
    kicker: "01 · What is Scholar?",
    title: "Software behind every lesson.",
    body:
      "Scholar is the platform I built for my tutoring. It models the whole course — and your student's knowledge of it — as one living structure: what they know, how well they'll remember it, and what to teach next. Every lesson runs on it.",
  },
  {
    id: "shapes",
    device: "mac",
    anchor: { u: 0.56, v: 0.6 },
    side: "left",
    kicker: "02 · The map",
    title: "The course is a solid you can read.",
    body:
      "Cylinder, torus or cube — the whole curriculum becomes one 3D object. Slices are chapters, rings are units of skill, and every wedge is a question type. Colour is mastery: one glance shows exactly where the course stands.",
  },
  {
    id: "unit",
    device: "mac",
    anchor: { u: 0.25, v: 0.66 },
    side: "right",
    kicker: "03 · Drill in",
    title: "Double-click a band — the unit lifts out.",
    body:
      "Every band of the cylinder is a unit. Double-click one and it unfolds into a disk: Unit 4, Memory and Data Structures. Each ring of the disk is a learning objective, and the colour still means mastery.",
  },
  {
    id: "ring",
    device: "mac",
    anchor: { u: 0.24, v: 0.66 },
    side: "right",
    kicker: "04 · Keep drilling",
    title: "Rings are learning objectives.",
    body:
      "One more double-click isolates a ring — “use pointers and manage dynamic memory in C.” The arcs around it are the question types that prove the objective. The breadcrumb at the top tracks exactly where you are.",
  },
  {
    id: "qt",
    device: "mac",
    anchor: { u: 0.23, v: 0.7 },
    side: "right",
    kicker: "05 · The atom",
    title: "A single question type.",
    body:
      "Pointer arithmetic and memory safety — one teachable atom of the course, tested by five questions. Its colour is how reliably your student solves it. This is the level where Scholar decides what to teach next.",
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
    device: "mac",
    anchor: { u: 0.3, v: 0.34 },
    side: "right",
    kicker: "07 · Practice",
    title: "A real question, answered for real.",
    body:
      "Same breadcrumb, now in the practice room: a genuine MCQ from the course bank, with a scratchpad and the 3D map keeping context alongside. Pick the right pattern… and submit.",
  },
  {
    id: "colour",
    device: "mac",
    anchor: { u: 0.25, v: 0.62 },
    side: "left",
    kicker: "08 · Proof",
    title: "Right answer — watch the map.",
    body:
      "The moment the answer lands, mastery is recomputed and the wedge re-tints. No vague grades, no waiting for a test: the map is the gradebook, and it just changed colour in front of you.",
  },
  {
    id: "decay",
    device: "mac",
    anchor: { u: 0.55, v: 0.55 },
    side: "left",
    kicker: "09 · The forgetting curve",
    title: "Leave it too long, and it fades.",
    body:
      "Memory decays — so does the map. Skip a topic for weeks and Scholar's spaced-repetition model quietly dims its colour until it's reinforced again. The map never lies about what's still remembered.",
    curve: true,
  },
  {
    id: "exit",
    device: "pad",
    anchor: { u: 0.52, v: 0.09 },
    side: "left",
    kicker: "10 · Exit ticket",
    title: "Ten minutes, on the clock, by hand.",
    body:
      "Every class ends with a timed exit ticket. Questions appear one at a time, and the student works them out by hand on the built-in scratchpad — real working, not multiple-choice guessing. Misses reshape the next session automatically.",
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
