/* Decay beat capture. Shows ONE arc (the last-solved question type) decaying over
   7 real days via Scholar's spaced-repetition retention (lib/showcase-demo.js:
   masteryScore = correct/total × 0.5^(ageDays/halfLife), halfLife = 3 days for a
   single review). Real data only.

   Outputs into web/public/shots/:
     decay-room.png         — the full practice room, target arc fully coloured (day 0)
     decay-arc-00..07.png   — the target arc alone, decaying day 0 → day 7

   Usage: node cap-decay.cjs */
const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const BASE = "http://localhost:3005";
const SECRET = "scholar-showcase-dev-secret";
const STATE = path.join(__dirname, "data/showcase-demo-state.json");
const OUT = path.resolve(__dirname, "../web/public/shots");
const SUBJECT = "cs50-showcase";
const PALETTE = process.env.PALETTE || "ember";
const DAYS = 7;
// the last-solved arc from the mastery walk: Unit 6 / LO 2 / QT 2
const TARGET = { du: 5, dl: 1, dq: 1 };

function mintSession() {
  const now = Date.now();
  const p = { kind: "showcase", viewerLabel: "Alex Carter", iat: now, exp: now + 3600000 };
  const e = Buffer.from(JSON.stringify(p)).toString("base64url");
  return e + "." + crypto.createHmac("sha256", SECRET).update(e).digest("base64url");
}

const src = fs.readFileSync(path.join(__dirname, "data/showcase-courses.js"), "utf8");
const qtIds = [...src.matchAll(/id: "(cs50-qt-\d+)", title: "([^"]+)"/g)].map((m) => m[1]);
const keysByQt = {};
for (const m of src.matchAll(/q\("(cs50-qt-(\d+)-q\d+)"/g)) {
  const qt = "cs50-qt-" + m[2]; (keysByQt[qt] ||= []).push(m[1]);
}
const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

// resolve the target QT id from the drilled tree later; here build a row factory.
// A row: full correct, ONE review (halfLife 3 days) dated `ageDays` ago.
function row(qtId, ageDays) {
  const keys = keysByQt[qtId] || [];
  const d = daysAgo(ageDays);
  return {
    correctQuestionKeys: keys,
    dailySeenDates: keys.length ? [d] : [],
    dailyWrongDates: [],
    masteryEvents: keys.length ? [{ id: "ev-" + qtId + "-0", date: d, result: "correct", questionKey: keys[0], source: "practice" }] : [],
    weaknessScore: 0,
  };
}

// every QT fully mastered today, EXCEPT the target QT which was solved `targetAge`
// days ago (so it alone decays)
function writeState(targetQtId, targetAge) {
  const rows = {};
  for (const qt of qtIds) rows[qt] = row(qt, qt === targetQtId ? targetAge : 0);
  fs.writeFileSync(STATE, JSON.stringify({ viewers: { "showcase-viewer": { id: "showcase-viewer", label: "Alex Carter", timezone: "America/New_York", subjects: { [SUBJECT]: { version: 3, scoreRows: rows, homeworkAttempts: {}, assessmentAttempts: {} } } } } }, null, 2) + "\n");
}

const SEL_ARC = "[class*='bottomRow'] [class*='panelCell']"; // idx 1 = Question Type (the arc)

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5 });
  await ctx.addCookies([{ name: "scholar_showcase_session", value: mintSession(), url: BASE }]);
  await ctx.addInitScript((pal) => localStorage.setItem("scholar-dashboard-palette", pal), PALETTE);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 160)));

  // resolve the target QT id from the tree
  writeState(null, 0);
  await page.goto(`${BASE}/practice?subjectId=${SUBJECT}&demo=1&showcase=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (let w = 0; w < 40; w++) { if (await page.evaluate(() => !!window.__units)) break; await page.waitForTimeout(500); }
  const targetQt = await page.evaluate((t) => {
    const u = window.__units || [];
    return u[t.du]?.rings?.[t.dl]?.arcs?.[t.dq]?.questionTypeId || null;
  }, TARGET);
  console.log("target arc QT:", targetQt, "keys:", (keysByQt[targetQt] || []).length);

  const drill = `&du=${TARGET.du}&dl=${TARGET.dl}&dq=${TARGET.dq}`;
  const load = async () => {
    await page.goto(`${BASE}/practice?subjectId=${SUBJECT}&demo=1&showcase=1${drill}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    for (let w = 0; w < 40; w++) { if ((await page.evaluate(() => document.querySelectorAll("canvas").length)) >= 5) break; await page.waitForTimeout(500); }
    await page.waitForTimeout(3000);
  };

  // 1) full practice room with the target arc fully coloured (day 0)
  writeState(targetQt, 0);
  await load();
  await sharp(await page.screenshot()).resize(1280, 800).png().toFile(path.join(OUT, "decay-room.png"));
  console.log("decay-room.png");

  // 2) the arc alone, decaying day 0 → day 7
  for (let n = 0; n <= DAYS; n++) {
    writeState(targetQt, n);
    await load();
    const cell = (await page.$$(SEL_ARC))[1];
    const buf = await cell.screenshot();
    let shaped;
    try { shaped = await sharp(buf).trim({ threshold: 16 }).resize(900, 700, { fit: "contain", background: { r: 18, g: 16, b: 14 } }).png().toBuffer(); }
    catch { shaped = await sharp(buf).resize(900, 700, { fit: "contain", background: { r: 18, g: 16, b: 14 } }).png().toBuffer(); }
    fs.writeFileSync(path.join(OUT, `decay-arc-${String(n).padStart(2, "0")}.png`), shaped);
    console.log(`decay-arc-${String(n).padStart(2, "0")}.png  (age ${n}d, retention=${Math.pow(0.5, n / 3).toFixed(2)})`);
  }
  await browser.close();
})();
