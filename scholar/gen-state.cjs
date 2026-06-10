// Writes data/showcase-demo-state.json for the capture passes.
// Usage: node gen-state.cjs [--boost]   (--boost = qt-015 fully mastered, practiced today)
// shiftDays pushes every activity date into the past so server-side
// retention visibly decays (used for the tour's forgetting-curve shots).
const fs = require("fs");
const path = require("path");

// boostIds narrows the boost to specific QT ids (e.g. just the QT the tour
// drills into), leaving the rest of the course at baseline.
function generate({ boost = false, shiftDays = 0, boostIds = null } = {}) {
  const src = fs.readFileSync(path.join(__dirname, "data/showcase-courses.js"), "utf8");
  const qtIds = [...src.matchAll(/id: "(cs50-qt-\d+)", title: "([^"]+)"/g)].map((m) => m[1]);
  const keysByQt = {};
  for (const m of src.matchAll(/q\("(cs50-qt-(\d+)-q\d+)"/g)) {
    const qt = "cs50-qt-" + m[2];
    (keysByQt[qt] ||= []).push(m[1]);
  }
  const today = new Date();
  const iso = (d) =>
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const daysAgo = (n) => { const d = new Date(today); d.setDate(d.getDate() - n - shiftDays); return iso(d); };
  const activeDays = new Set();
  for (let i = 0; i < 12; i++) activeDays.add(daysAgo(i));
  for (let i = 14; i < 90; i++) { if ((i * 7) % 10 < 6 && i % 9 !== 4) activeDays.add(daysAgo(i)); }
  const activeList = [...activeDays].sort();

  const rows = {};
  qtIds.forEach((qt, idx) => {
    const keys = keysByQt[qt] || [];
    const n = keys.length;
    let frac, weakness;
    if (idx < 6) { frac = 1.0; weakness = 0; }
    else if (idx < 10) { frac = 0.75; weakness = 0.5; }
    else if (idx < 14) { frac = 0.5; weakness = 1.5; }
    else if (idx < 17) { frac = 0.25; weakness = 2.4; }
    else { frac = 0; weakness = 2.8; }
    const boosted = boostIds ? boostIds.includes(qt) : boost && idx >= 10; // master the weak tail (or just boostIds)
    if (boosted) { frac = 1.0; weakness = 0; }
    const correct = keys.slice(0, Math.round(n * frac));
    const myDays = activeList.filter((d, i) => (i + idx) % 8 === 0);
    if (frac > 0 && myDays.length === 0) myDays.push(daysAgo(idx % 12));
    if (boosted) myDays.push(daysAgo(0));
    const events = correct.map((k, i) => ({
      id: "ev-" + qt + "-" + i,
      date: myDays[i % Math.max(1, myDays.length)] || daysAgo(20 + idx),
      result: "correct",
      questionKey: k,
      source: "practice",
    }));
    rows[qt] = {
      correctQuestionKeys: correct,
      dailySeenDates: frac > 0 ? [...new Set(myDays)].sort() : [],
      dailyWrongDates: [],
      masteryEvents: events,
      weaknessScore: weakness,
    };
  });

  const state = {
    viewers: {
      "showcase-viewer": {
        id: "showcase-viewer",
        label: "Alex Carter",
        timezone: "America/New_York",
        subjects: {
          "cs50-showcase": { version: 3, scoreRows: rows, homeworkAttempts: {}, assessmentAttempts: {} },
        },
      },
    },
  };
  const target = path.join(__dirname, "data/showcase-demo-state.json");
  const tmp = `${target}.gen.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
  fs.renameSync(tmp, target);
  return Object.values(rows).reduce((s, r) => s + r.dailySeenDates.length, 0);
}

if (require.main === module) {
  const boost = process.argv.includes("--boost");
  const total = generate({ boost });
  console.log(`state written (boost=${boost}), seen entries: ${total}`);
}
module.exports = { generate };
