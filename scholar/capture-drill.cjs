/* Explores the dashboard drill-down: unit disk -> ring -> QT -> question,
   dumping a screenshot + visible text after each canvas click. */
const { chromium } = require("playwright");
const crypto = require("crypto");
const path = require("path");
const { generate } = require("./gen-state.cjs");

const BASE = "http://localhost:3005";
const OUT = "/tmp/drill";
const fs = require("fs");

function mintSession() {
  const now = Date.now();
  const p = { kind: "showcase", viewerLabel: "Alex Carter", iat: now, exp: now + 3600000 };
  const e = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${e}.${crypto.createHmac("sha256", "scholar-showcase-dev-secret").update(e).digest("base64url")}`;
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

async function allCanvases(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("canvas")].map((c) => {
      const r = c.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    }).filter((r) => r.w > 80 && r.h > 80)
  );
}

async function dumpState(page, tag) {
  const txt = await page.evaluate(() => {
    const crumbs = [...document.querySelectorAll("[class*='readcrumb'], [class*='Breadcrumb']")]
      .map((e) => e.textContent.trim().replace(/\s+/g, " ").slice(0, 120));
    const btns = [...document.querySelectorAll("button")]
      .map((b) => b.textContent.trim().replace(/\s+/g, " ").slice(0, 50))
      .filter((t) => t && /practice|open|back|drill/i.test(t));
    const hints = [...document.querySelectorAll("div, p, span, h1, h2, h3, h4")]
      .filter((n) => n.childNodes.length === 1 && n.childNodes[0].nodeType === 3)
      .map((n) => n.textContent.trim())
      .filter((t) => t.length < 160 && /drill|click|double|tap a|isolate|practice this|represents/i.test(t))
      .slice(0, 8);
    return { crumbs: crumbs.slice(0, 4), btns: btns.slice(0, 10), hints };
  });
  console.log(`[${tag}]`, JSON.stringify(txt));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  generate({ boost: false });
  await new Promise((r) => setTimeout(r, 1500));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "scholar_showcase_session", value: mintSession(), url: BASE }]);
  await ctx.addInitScript(() => localStorage.setItem("scholar-dashboard-palette", "sunset"));
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date("2026-06-10T10:00:00Z") });
  await page.goto(`${BASE}/dashboard?demo=1&showcase=1`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  const sel = page.getByText("Select subject", { exact: false }).first();
  if (await sel.isVisible().catch(() => false)) {
    await sel.click(); await page.waitForTimeout(600);
    await page.getByText("CS50", { exact: false }).first().click();
  }
  await page.waitForTimeout(4000);
  await dismissTour(page);
  // wait for the topic map to actually load (dev server can be slow after idle)
  for (let i = 0; i < 40; i++) {
    const loading = await page.getByText("LOADING TOPIC MAP", { exact: false }).first().isVisible().catch(() => false);
    const hasCanvas = await page.$("canvas");
    if (!loading && hasCanvas) break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(3000);
  await dismissTour(page);

  let cvs = await allCanvases(page);
  console.log("canvases:", JSON.stringify(cvs));
  await page.screenshot({ path: path.join(OUT, "00-overview.png") });
  await dumpState(page, "overview");

  // 1. double-click a band of the cylinder (biggest canvas center)
  let big = cvs.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  await page.mouse.dblclick(big.x + big.w / 2, big.y + big.h / 2 - 20);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, "01-unit-disk.png") });
  await dumpState(page, "unit");
  cvs = await allCanvases(page);
  console.log("canvases:", JSON.stringify(cvs));

  // 2. double-click a ring on the disk (left-most canvas, offset from center)
  let left = cvs.reduce((a, b) => (b.x < a.x ? b : a));
  await page.mouse.dblclick(left.x + left.w / 2 + left.w * 0.16, left.y + left.h / 2);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, "02-ring.png") });
  await dumpState(page, "ring");
  cvs = await allCanvases(page);
  console.log("canvases:", JSON.stringify(cvs));

  // 3. double-click an arc / question type
  left = cvs.reduce((a, b) => (b.x < a.x ? b : a));
  await page.mouse.dblclick(left.x + left.w / 2 + left.w * 0.18, left.y + left.h / 2);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, "03-qt.png") });
  await dumpState(page, "qt");
  cvs = await allCanvases(page);
  console.log("canvases:", JSON.stringify(cvs));

  // 4. one more level (question band)
  left = cvs.reduce((a, b) => (b.x < a.x ? b : a));
  await page.mouse.dblclick(left.x + left.w / 2 + left.w * 0.18, left.y + left.h / 2);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, "04-question.png") });
  await dumpState(page, "question");

  await browser.close();
  console.log("done");
})();
