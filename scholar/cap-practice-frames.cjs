/* Literal full screenshots of the REAL Scholar practice room, walking the
   curriculum ONE QUESTION AT A TIME in order (sequential mastery), with the drill
   following the current node. So across the flipbook: the question/arc changes
   constantly, the question-type fills every ~5 questions, the unit every ~20, and
   the subject creeps up once — the real cascade, not everything-at-once.

   Usage: node cap-practice-frames.cjs [N]   (N frames sampled along the walk) */
const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const BASE = "http://localhost:3005";
const SECRET = "scholar-showcase-dev-secret";
const STATE = path.join(__dirname, "data/showcase-demo-state.json");
const OUT = path.resolve(__dirname, "../web/public/shots/practice");
const SUBJECT = "cs50-showcase";
const PALETTE = process.env.PALETTE || "ember";
const N = parseInt(process.argv[2] || "40", 10);
const VW = 1600, VH = 1000, OW = 768, OH = 480; // 16:10 viewport; modest output for VRAM

function mintSession() {
  const now = Date.now();
  const p = { kind: "showcase", viewerLabel: "Alex Carter", iat: now, exp: now + 3600000 };
  const e = Buffer.from(JSON.stringify(p)).toString("base64url");
  return e + "." + crypto.createHmac("sha256", SECRET).update(e).digest("base64url");
}

const src = fs.readFileSync(path.join(__dirname, "data/showcase-courses.js"), "utf8");
const keysByQt = {};
for (const m of src.matchAll(/q\("(cs50-qt-(\d+)-q\d+)"/g)) {
  const qt = "cs50-qt-" + m[2]; (keysByQt[qt] ||= []).push(m[1]);
}

// write the showcase state so that exactly `answered` (a list of {qtId,key}) are
// marked correct — i.e. each question type holds the prefix of its keys answered so far
function writeState(answered) {
  const today = new Date();
  const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const recent = iso(today);
  const byQt = {};
  for (const a of answered) (byQt[a.qtId] ||= []).push(a.key);
  const rows = {};
  for (const qt of Object.keys(keysByQt)) {
    const correct = byQt[qt] || [];
    const frac = correct.length / (keysByQt[qt].length || 1);
    const events = correct.map((k, i) => ({ id: "ev-" + qt + "-" + i, date: recent, result: "correct", questionKey: k, source: "practice" }));
    rows[qt] = { correctQuestionKeys: correct, dailySeenDates: correct.length ? [recent] : [], dailyWrongDates: [], masteryEvents: events, weaknessScore: 2.6 * (1 - frac) };
  }
  fs.writeFileSync(STATE, JSON.stringify({ viewers: { "showcase-viewer": { id: "showcase-viewer", label: "Alex Carter", timezone: "America/New_York", subjects: { [SUBJECT]: { version: 3, scoreRows: rows, homeworkAttempts: {}, assessmentAttempts: {} } } } } }, null, 2) + "\n");
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "scholar_showcase_session", value: mintSession(), url: BASE }]);
  await ctx.addInitScript((pal) => localStorage.setItem("scholar-dashboard-palette", pal), PALETTE);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 160)));

  // 1) read the drilled tree (units → rings → arcs → questions)
  writeState([]);
  await page.goto(`${BASE}/practice?subjectId=${SUBJECT}&demo=1&showcase=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let w = 0; w < 40; w++) { if (await page.evaluate(() => !!window.__units)) break; await page.waitForTimeout(500); }
  const tree = await page.evaluate(() => (window.__units || []).map((u) =>
    (u.rings || []).map((r) => (r.arcs || []).map((a) => ({ qtId: a.questionTypeId, qn: (a.questions || []).length })))));

  // 2) build the linear question walk in curriculum order
  const seq = [];
  tree.forEach((rings, ui) => rings.forEach((arcs, li) => arcs.forEach((arc, ai) => {
    const keys = keysByQt[arc.qtId] || Array.from({ length: arc.qn || 5 }, (_, k) => `${arc.qtId}-q${k + 1}`);
    keys.forEach((key, ni) => seq.push({ ui, li, ai, ni, qtId: arc.qtId, key }));
  })));
  console.log("walk length (questions):", seq.length, "units:", tree.length);

  // 3) sample N frames along the walk; at each, answer the prefix and drill to the current node
  for (let f = 0; f < N; f++) {
    const idx = N === 1 ? seq.length - 1 : Math.round((f / (N - 1)) * (seq.length - 1));
    const cur = seq[idx];
    writeState(seq.slice(0, idx + 1));
    await new Promise((r) => setTimeout(r, 250));
    const url = `${BASE}/practice?subjectId=${SUBJECT}&demo=1&showcase=1&du=${cur.ui}&dl=${cur.li}&dq=${cur.ai}&dn=${cur.ni}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    for (let w = 0; w < 40; w++) { if ((await page.evaluate(() => document.querySelectorAll("canvas").length)) >= 5) break; await page.waitForTimeout(500); }
    await page.waitForTimeout(3000);
    const buf = await page.screenshot();
    const out = path.join(OUT, `p${String(f).padStart(2, "0")}.png`);
    await sharp(buf).resize(OW, OH).png().toFile(out);
    console.log(`frame ${f}/${N - 1} q#${idx + 1}/${seq.length} U${cur.ui} LO${cur.li} QT${cur.ai} Q${cur.ni + 1} -> ${path.basename(out)}`);
  }
  await browser.close();
})();
