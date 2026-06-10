// Minimal static stubs for the showcase subject list. Kept in sync with
// the subjectId/subjectName pairs in data/showcase-courses.js. Shipped in
// the client bundle so the dashboard can paint the subject picker
// instantly in showcase mode, before the /api/student/dashboard round
// trip returns.

export const SHOWCASE_SUBJECT_STUBS = [
  {
    id: "cs50-showcase",
    name: "Harvard CS50: Introduction to Computer Science",
  },
  {
    id: "ap-bio-showcase",
    name: "AP Biology",
  },
  {
    id: "ap-lit-showcase",
    name: "AP English Literature and Composition",
  },
  {
    id: "ah100-showcase",
    name: "AH 100: Introduction to Art and Art History (UIC)",
  },
]

export function buildShowcaseDashDataStub({ viewerName = "Scholar", timezone = "UTC" } = {}) {
  const today = new Date()
  const pad = (n) => String(n).padStart(2, "0")
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  return {
    student: {
      id: "showcase-viewer",
      name: viewerName || "Scholar",
      email: "",
      timezone,
      state: "showcase",
      country: "Showcase",
    },
    subjects: SHOWCASE_SUBJECT_STUBS.map((s) => ({
      id: s.id,
      name: s.name,
      zoomLink: null,
      nextClassStart: null,
      nextClassEnd: null,
      duration: 75,
      todayClass: null,
      upcomingClasses: [],
      hasClassToday: false,
      sessionDate: todayKey,
      studentSessionDate: todayKey,
      sessionDayDiff: 0,
      isShowcaseDemo: true,
    })),
    isImpersonating: false,
    isShowcase: true,
  }
}
