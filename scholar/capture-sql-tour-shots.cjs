const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { generate } = require("./gen-state.cjs");

const BASE = "http://localhost:3005";
const OUT = path.resolve(__dirname, "../web/public/shots");
const SECRET = "scholar-showcase-dev-secret";
const SUBJECT = "cs50-showcase";
const FAKE_NOW = new Date("2026-06-11T23:30:00-04:00");
const TARGET_QT = "cs50-qt-022";

function mintSession(label = "k.") {
  const now = Date.now();
  const payload = { kind: "showcase", viewerLabel: label, iat: now, exp: now + 3600 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

async function dismissTour(page) {
  for (let i = 0; i < 10; i++) {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => /skip guide/i.test(b.textContent || ""));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }).catch(() => false);
    if (clicked) await page.waitForTimeout(1000);
    if (!(await page.$("[class*='tourBackdrop']"))) return;
    await page.waitForTimeout(800);
  }
}

async function setStateVerified() {
  for (let i = 0; i < 6; i++) {
    generate({ boostIds: [TARGET_QT] });
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`${BASE}/api/student/progress-graph?subjectId=${SUBJECT}&demo=1&showcase=1`, {
      headers: { Cookie: `scholar_showcase_session=${encodeURIComponent(mintSession())}` },
    });
    const json = await res.json().catch(() => ({}));
    const qt = (json.questionTypes || []).find((q) => q.id === TARGET_QT);
    if (qt && Number(qt.masteryScore) >= 0.99) return;
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("Could not verify showcase state for SQL tour capture");
}

async function newPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 2240, height: 1400 },
    deviceScaleFactor: 1,
  });
  await ctx.addCookies([{ name: "scholar_showcase_session", value: mintSession(), url: BASE }]);
  await ctx.addInitScript(() => localStorage.setItem("scholar-dashboard-palette", "ember"));
  const page = await ctx.newPage();
  await page.clock.install({ time: FAKE_NOW });
  return { ctx, page };
}

async function gotoDashboard(page) {
  await page.goto(`${BASE}/dashboard?demo=1&showcase=1`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(3000);
  const sel = page.getByText("Select subject", { exact: false }).first();
  if (await sel.isVisible().catch(() => false)) {
    await sel.click();
    await page.waitForTimeout(600);
    await page.getByText("CS50", { exact: false }).first().click();
  }
  await page.waitForTimeout(5000);
  await dismissTour(page);
  for (let i = 0; i < 40; i++) {
    const loading = await page.getByText("LOADING TOPIC MAP", { exact: false }).first().isVisible().catch(() => false);
    const hasCanvas = await page.$("canvas");
    if (!loading && hasCanvas) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2500);
  await dismissTour(page);
}

async function allCanvases(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("canvas")]
      .map((c) => {
        const r = c.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((r) => r.w > 80 && r.h > 80)
  );
}

async function headState(page) {
  return page.evaluate(() => ({
    label: [...document.querySelectorAll(".obs-label")].map((n) => n.textContent.trim()).find((t) => /^§/.test(t)) || "",
    title: (document.querySelector(".obs-head-title")?.textContent || "").replace(/\s+/g, " ").trim(),
  }));
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log("shot:", name);
}

async function backOut(page) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /back\s*↺/i.test(b.textContent || ""));
    if (btn && !btn.disabled) btn.click();
  });
  await page.waitForTimeout(2500);
}

async function backTo(page, target) {
  for (let i = 0; i < 5; i++) {
    const state = await headState(page);
    if (state.label === target.label && state.title === target.title) return;
    await backOut(page);
  }
}

async function drillTo(page, level) {
  const attempts = {
    unit: [-15, -75, -130, 40, 95, -190, 155, 220, -245],
    ring: [[0, -0.08], [0.04, -0.08], [-0.04, -0.08], [0, -0.12], [0.08, -0.08], [-0.08, -0.08], [0.18, 0], [0.1, 0.12], [0.2, -0.1], [-0.12, 0.1], [0.02, -0.2], [0.28, 0.04], [-0.18, -0.08], [0, 0], [0, 0.22], [0, -0.22], [0.24, 0.16], [-0.24, 0.16], [0.24, -0.16], [-0.24, -0.16]],
    qt: [[0.18, 0], [0.22, 0.06], [0.12, -0.12], [-0.12, 0.08], [0.04, 0.18], [0.3, -0.02], [0, 0], [0.24, 0.16], [0.24, -0.16], [-0.2, 0.12]],
    question: [[0.18, 0], [0.22, 0.08], [0.08, -0.12], [-0.08, 0.12], [0.3, 0.02]],
  }[level.tag];

  for (const spot of attempts) {
    const before = await headState(page);
    const cvs = await allCanvases(page);
    if (!cvs.length) throw new Error("No drill canvases found");
    let x;
    let y;
    if (level.tag === "unit") {
      const big = cvs.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
      x = big.x + big.w / 2;
      y = big.y + big.h / 2 + spot;
    } else {
      const left = cvs.reduce((a, b) => (b.x < a.x ? b : a));
      x = left.x + left.w / 2 + left.w * spot[0];
      y = left.y + left.h / 2 + left.h * spot[1];
    }
    await page.mouse.dblclick(x, y);
    await page.waitForTimeout(4000);
    const now = await headState(page);
    if (now.label === before.label && now.title === before.title) continue;
    if (level.match.test(now.title)) {
      console.log("landed:", level.tag, now.title);
      return;
    }
    console.log("wrong landing:", level.tag, now.label, now.title);
    await backTo(page, before);
  }
  throw new Error(`Could not land on ${level.tag}`);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await setStateVerified();
  const browser = await chromium.launch();
  const { ctx, page } = await newPage(browser);
  await gotoDashboard(page);
  await shot(page, "mac-dashboard.png");

  await drillTo(page, { tag: "unit", match: /Python\s*and\s*SQL|Pythonand SQL/i });
  await shot(page, "mac-drill-unit.png");

  await drillTo(page, { tag: "ring", match: /Query\s*and\s*design\s*relational\s*databases\s*with\s*SQL|Queryand design relationaldatabases with SQL/i });
  await shot(page, "mac-drill-ring.png");

  await drillTo(page, { tag: "qt", match: /SQL\s*Schema\s*Design|Schema Design/i });
  await shot(page, "mac-drill-qt.png");

  await drillTo(page, { tag: "question", match: /^Question/i });
  await shot(page, "mac-drill-question.png");

  await ctx.close();
  await browser.close();
})();
