/* Captures the drill-down + practice MCQ + decay sequence for the tour.
   Three passes over the same drill trajectory:
     1. baseline  -> drill level shots + MCQ open/selected/correct
     2. qt-019 boosted (practiced today) -> recoloured unit/QT views
     3. boosted + 45 days old -> decayed unit/QT/dashboard views
   Run AFTER capture-all.cjs (both rewrite the showcase store). */
const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { generate } = require("./gen-state.cjs");

const BASE = "http://localhost:3005";
const OUT = path.resolve(__dirname, "../web/public/shots");
const SECRET = "scholar-showcase-dev-secret";
const SUBJECT = "cs50-showcase";
const FAKE_NOW = new Date("2026-06-10T10:00:00Z"); // morning -> light theme
const DRILL_QT = "cs50-qt-019"; // Pointer Arithmetic and Memory Safety (Unit 4)

function mintSession(label = "Alex Carter") {
  const now = Date.now();
  const payload = { kind: "showcase", viewerLabel: label, iat: now, exp: now + 3600 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

async function newPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "scholar_showcase_session", value: mintSession(), url: BASE }]);
  await ctx.addInitScript(() => localStorage.setItem("scholar-dashboard-palette", "sunset"));
  const page = await ctx.newPage();
  await page.clock.install({ time: FAKE_NOW });
  return { ctx, page };
}

async function dismissTour(page) {
  for (let i = 0; i < 10; i++) {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => /skip guide/i.test(b.textContent || ""));
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
    if (clicked) await page.waitForTimeout(1200);
    if (!(await page.$("[class*='tourBackdrop']"))) return;
    await page.waitForTimeout(1200);
  }
}

async function gotoDashboard(page) {
  await page.goto(`${BASE}/dashboard?demo=1&showcase=1`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const sel = page.getByText("Select subject", { exact: false }).first();
  if (await sel.isVisible().catch(() => false)) {
    await sel.click();
    await page.waitForTimeout(600);
    await page.getByText("CS50", { exact: false }).first().click();
  }
  await page.waitForTimeout(4000);
  await dismissTour(page);
  for (let i = 0; i < 40; i++) {
    const loading = await page.getByText("LOADING TOPIC MAP", { exact: false }).first().isVisible().catch(() => false);
    const hasCanvas = await page.$("canvas");
    if (!loading && hasCanvas) break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(3000);
  await dismissTour(page);
}

async function allCanvases(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("canvas")].map((c) => {
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }).filter((r) => r.w > 80 && r.h > 80)
  );
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name) });
  console.log("shot:", name);
}

/* drill trajectory: cylinder band -> ring -> arc -> question slice.
   Canvas clicks are positional and the bands re-sort with mastery state, so
   every level verifies the on-screen breadcrumb text and backs out + retries
   a different spot until it lands on the intended target. */
const LEVELS = [
  { tag: "unit", match: /Data Structures/i },
  { tag: "ring", match: /manage dynamic memory/i },
  { tag: "qt", match: /Arithmetic and Memory Safety/i },
  { tag: "question", match: /^Question/i },
];

// the drill panel's "§ NN — LEVEL" marker + big title (first word and the
// rest are separate spans, so textContent has no space between them)
async function headState(page) {
  return page.evaluate(() => ({
    label: [...document.querySelectorAll(".obs-label")].map((n) => n.textContent.trim()).find((t) => /^§/.test(t)) || "",
    title: (document.querySelector(".obs-head-title")?.textContent || "").replace(/\s+/g, " ").trim(),
  }));
}

async function backOut(page) {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /back\s*↺/i.test(x.textContent || ""));
    if (b && !b.disabled) b.click();
  });
  await page.waitForTimeout(3000);
}

async function drill(page, shots = {}, depth = 4) {
  // band candidates on the big cylinder, then (dx,dy) spots on the left disk
  const bandYs = [-20, -90, -160, 50, 120, -230, 190];
  const diskOffs = [
    [0.16, 0], [0.18, 0.07], [0.12, -0.1], [-0.16, 0.04], [0.05, 0.17],
    [0.03, -0.18], [0.22, 0.02], [-0.1, -0.15], [-0.08, 0.16], [0.26, 0.05],
  ];
  for (let lvl = 0; lvl < depth; lvl++) {
    const { tag, match } = LEVELS[lvl];
    const spots = lvl === 0 ? bandYs : diskOffs;
    let landed = false;
    for (const s of spots) {
      const before = await headState(page);
      const cvs = await allCanvases(page);
      if (!cvs.length) throw new Error("no canvases on page");
      let x, y;
      if (lvl === 0) {
        const big = cvs.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
        x = big.x + big.w / 2; y = big.y + big.h / 2 + s;
      } else {
        const left = cvs.reduce((a, b) => (b.x < a.x ? b : a));
        x = left.x + left.w / 2 + left.w * s[0]; y = left.y + left.h / 2 + left.h * s[1];
      }
      await page.mouse.dblclick(x, y);
      await page.waitForTimeout(4500);
      const st = await headState(page);
      if (st.label === before.label && st.title === before.title) continue; // click was a no-op
      if (match.test(st.title)) { landed = true; break; }
      await backOut(page); // descended into the wrong slice
    }
    if (!landed) throw new Error(`drill could not land on ${tag}`);
    console.log("landed:", tag, "| spots tried ok");
    if (shots[tag]) await shot(page, shots[tag]);
  }
}

const quiesce = (ms = 2500) => new Promise((r) => setTimeout(r, ms));

// Write state, then verify the server serves it (the store is last-writer-wins).
async function setStateVerified(opts, check) {
  for (let i = 0; i < 6; i++) {
    generate(opts);
    await quiesce(1800);
    const res = await fetch(
      `${BASE}/api/student/progress-graph?subjectId=${SUBJECT}&demo=1&showcase=1`,
      { headers: { Cookie: `scholar_showcase_session=${encodeURIComponent(mintSession())}` } }
    );
    const j = await res.json().catch(() => ({}));
    if (check(j)) { console.log(`state verified after ${i + 1} attempt(s)`); return; }
    await quiesce(3000);
  }
  throw new Error("could not get server to serve the generated state");
}

const qtScore = (j, id) => Number(((j.questionTypes || []).find((q) => q.id === id) || {}).masteryScore ?? -1);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { SHOWCASE_COURSES } = await import("./data/showcase-courses.js");
  const ANSWERS = {};
  for (const c of SHOWCASE_COURSES)
    for (const qt of c.questionTypes)
      for (const q of qt.questions) ANSWERS[q.question] = { answer: q.answer, idx: q.correctIndex };

  const browser = await chromium.launch();

  // ── pass 1: baseline — drill shots + MCQ ────────────────────────────────
  await setStateVerified({ boost: false }, (j) => qtScore(j, DRILL_QT) === 0);
  {
    const { ctx, page } = await newPage(browser);
    await gotoDashboard(page);
    await drill(page, {
      unit: "mac-drill-unit.png",
      ring: "mac-drill-ring.png",
      qt: "mac-drill-qt.png",
      question: "mac-drill-question.png",
    });

    await page.getByText("Open Practice", { exact: false }).first().click();
    await page.waitForTimeout(8000);
    await dismissTour(page);
    await shot(page, "mac-mcq.png");

    const qtext = await page.evaluate((questions) => {
      const body = document.body.textContent.replace(/\s+/g, " ");
      for (const q of questions) if (body.includes(q)) return q;
      return null;
    }, Object.keys(ANSWERS));
    if (!qtext) throw new Error("no known question found on practice page");
    const { answer, idx } = ANSWERS[qtext];
    const letter = String.fromCharCode(65 + idx);
    console.log("answering:", letter, "—", qtext.slice(0, 60));

    const clicked = await page.evaluate(([letter, answer]) => {
      const norm = (s) => s.replace(/\s+/g, "").toLowerCase();
      const key = norm(answer).slice(0, 12);
      const els = [...document.querySelectorAll("button, [role='button'], label, li")];
      const el = els.find((b) => {
        const t = (b.textContent || "").trim();
        return t.startsWith(letter) && norm(t).includes(key);
      });
      if (el) { el.click(); return true; }
      return false;
    }, [letter, answer]);
    if (!clicked) throw new Error("could not click the correct option");
    await page.waitForTimeout(1500);
    await shot(page, "mac-mcq-selected.png");

    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /submit answer/i.test(x.textContent || ""));
      if (b && !b.disabled) b.click();
    });
    await page.waitForTimeout(4000);
    await shot(page, "mac-mcq-correct.png");
    await ctx.close();
  }

  // ── pass 2: the drilled QT mastered today — recoloured views ───────────
  await quiesce();
  await setStateVerified({ boostIds: [DRILL_QT] }, (j) => qtScore(j, DRILL_QT) >= 0.99);
  {
    const { ctx, page } = await newPage(browser);
    await gotoDashboard(page);
    await drill(page, { unit: "mac-drill-unit-after.png", qt: "mac-drill-qt-after.png" }, 3);
    await ctx.close();
  }

  // ── pass 3: same mastery, 45 days later — decayed views ────────────────
  await quiesce();
  await setStateVerified({ boostIds: [DRILL_QT], shiftDays: 45 }, (j) => {
    const s = qtScore(j, DRILL_QT);
    return s > 0.2 && s < 0.8;
  });
  {
    const { ctx, page } = await newPage(browser);
    await gotoDashboard(page);
    await shot(page, "mac-dashboard-decayed.png");
    await drill(page, { unit: "mac-drill-unit-decayed.png", qt: "mac-drill-qt-decayed.png" }, 3);
    await ctx.close();
  }

  // restore baseline state for any later passes
  generate({ boost: false });
  await browser.close();
  console.log("done");
})();
