// Callout copy — drafted from Scholar's ARCHITECTURE.md.
// Each callout: which device screen it points at, anchor uv on that screen,
// which side of the stage the card sits on, and its timeline window.
//
// The walkthrough is six beats: two on the laptop (what Scholar is, then the
// mastery colour-change), two on the iPad (mastery decay, then the answering
// system), two on the iPhone (auto-flashcards, then the session log). Every
// beat is a justified-rectangle "slab" (Tour.jsx RectTitle) EXCEPT decay, which
// keeps its own treatment with the floating decay curve.

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
    id: "mastery",
    device: "mac",
    anchor: { u: 0.72, v: 0.5 },
    side: "right",
    kicker: "02 · Mastery",
    title: "Mastery measured with colors and shapes.",
    body:
      "Each shape stands for a piece of the subject (a question, a question type, a unit, or the whole subject). As a student answers questions correctly, each shape gradually shifts color, warming from one shade to another as mastery builds.",
  },
  {
    id: "decay",
    device: "pad",
    anchor: { u: 0.5, v: 0.5 },
    side: "left",
    kicker: "03 · Spaced repetition",
    title: "Decaying mastery.",
    body:
      "Solving a topic once doesn't mean it sticks. Without a quick review, knowledge fades within a week. The app tracks that natural forgetting and nudges students to revisit topics at just the right time, keeping it fresh. It's how memory experts do it, powered by your child's real progress.",
    curve: true,
  },
  {
    id: "hand",
    device: "pad",
    anchor: { u: 0.52, v: 0.3 },
    side: "left",
    kicker: "04 · Answering",
    title: "Handwriting and touchscreen-enabled answering.",
    body:
      "Both multiple-choice and free-response questions are handled on the platform, with the option for students to answer in their own handwriting, right on the screen.",
  },
  {
    id: "cards",
    device: "phone",
    anchor: { u: 0.5, v: 0.28 },
    side: "right",
    kicker: "05 · Flashcards",
    title: "Weak spots become flashcards. Automatically.",
    body:
      "When a topic's weakness score crosses the threshold, it turns into a flashcard. The deck is always exactly what your student needs to review, easy to run from a phone.",
  },
  {
    id: "log",
    device: "phone",
    anchor: { u: 0.5, v: 0.56 },
    side: "right",
    kicker: "06 · Session log",
    title: "Progress you can see being tracked.",
    body:
      "Every attempt is logged. The daily check-in map — one square per day, GitHub-style — shows the streak at a glance. Parents see evidence, not promises.",
  },
];

export const SHOTS = {
  macDash: "/shots/mac-dashboard.png",
  decayRoom: "/shots/decay-room.png",
  padQ1: "/shots/ipad-exit-1.png",
  padQ2: "/shots/ipad-exit-2.png",
  phoneCards: "/shots/iphone-flashcards.png",
  phoneCardsBack: "/shots/iphone-flashcards-back.png",
  phoneCheckin: "/shots/iphone-checkin.png",
};

// mac screen layer order — rig keys, Scene layer list and the timeline all
// follow this sequence. The drill-down/practice screens were retired: the
// laptop now shows only the dashboard, with the mastery recolour played as a
// flipbook overlay on the screen (Scene.jsx flip mesh).
export const MAC_LAYERS = ["macDash"];

// Number of mastery-recolour flipbook frames (shapes.jsx renders them; Scene plays
// them; Tour scrubs shapeFrame across them). Kept here — a THREE-free module — so
// importing the count doesn't drag three.js into Tour's eager bundle.
export const SHAPE_FRAMES = 40;
