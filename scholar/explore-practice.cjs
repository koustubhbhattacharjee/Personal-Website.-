/* Explores the drill -> "Open Practice" -> MCQ answer flow, dumping
   screenshots + page state at each step. Output: /tmp/practice-explore */
const { chromium } = require("playwright");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { generate } = require("./gen-state.cjs");

const BASE = "http://localhost:3005";
const OUT = "/tmp/practice-explore";
const ANSWERS = JSON.parse(fs.readFileSync("/tmp/answer-map.json", "utf8"));

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

async function dump(page, tag) {
  await page.screenshot({ path: path.join(OUT, `${tag}.png`) });
  const info = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")]
      .map((b) => b.textContent.trim().replace(/\s+/g, " ").slice(0, 90)).filter(Boolean);
    const heads = [...document.querySelectorAll("h1,h2,h3,h4,[class*='question']")]
      .map((n) => n.textContent.trim().replace(/\s+/g, " ").slice(0, 140)).filter(Boolean).slice(0, 15);
    return { url: location.href, btns: btns.slice(0, 40), heads };
  });
  console.log(`[${tag}]`, JSON.stringify(info, null, 1));
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
  for (let i = 0; i < 40; i++) {
    const loading = await page.getByText("LOADING TOPIC MAP", { exact: false }).first().isVisible().catch(() => false);
    const hasCanvas = await page.$("canvas");
    if (!loading && hasCanvas) break;
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(3000);
  await dismissTour(page);

  // drill: band -> ring -> QT -> question
  let cvs = await allCanvases(page);
  let big = cvs.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  await page.mouse.dblclick(big.x + big.w / 2, big.y + big.h / 2 - 20);
  await page.waitForTimeout(4000);
  for (let i = 0; i < 3; i++) {
    cvs = await allCanvases(page);
    const left = cvs.reduce((a, b) => (b.x < a.x ? b : a));
    await page.mouse.dblclick(left.x + left.w / 2 + left.w * (i === 0 ? 0.16 : 0.18), left.y + left.h / 2);
    await page.waitForTimeout(4000);
  }
  await dump(page, "00-drill-end");

  // open practice
  const open = page.getByText("Open Practice", { exact: false }).first();
  if (!(await open.isVisible().catch(() => false))) {
    console.log("NO OPEN PRACTICE BUTTON"); await browser.close(); return;
  }
  await open.click();
  await page.waitForTimeout(8000);
  await dismissTour(page);
  await dump(page, "01-practice-open");

  // find the visible MCQ question text and click its correct answer
  const qtext = await page.evaluate((questions) => {
    const all = [...document.querySelectorAll("div,p,h1,h2,h3,h4,span")];
    for (const n of all) {
      const t = (n.textContent || "").trim().replace(/\s+/g, " ");
      for (const q of questions) if (t === q) return q;
    }
    // fallback: containment
    const body = document.body.textContent.replace(/\s+/g, " ");
    for (const q of questions) if (body.includes(q)) return q;
    return null;
  }, Object.keys(ANSWERS));
  console.log("question on screen:", qtext);
  if (!qtext) { await browser.close(); return; }
  const { answer, idx } = ANSWERS[qtext];
  const letter = String.fromCharCode(65 + idx);
  console.log("correct answer:", letter, answer);

  // option rows render as "B<content>" (KaTeX may mangle content), so match
  // letter prefix + a normalized slice of the answer text
  const clicked = await page.evaluate(([letter, answer]) => {
    const norm = (s) => s.replace(/\s+/g, "").toLowerCase();
    const key = norm(answer).slice(0, 12);
    const els = [...document.querySelectorAll("button, [role='button'], label, li")];
    const el = els.find((b) => {
      const t = (b.textContent || "").trim();
      return t.startsWith(letter) && norm(t).includes(key);
    });
    if (el) { el.click(); return el.tagName + ": " + el.textContent.trim().slice(0, 80); }
    return null;
  }, [letter, answer]);
  console.log("clicked:", clicked);
  await page.waitForTimeout(2000);
  await dump(page, "02-answered");

  const submit = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /submit answer/i.test(x.textContent || ""));
    if (b && !b.disabled) { b.click(); return b.textContent.trim(); }
    return null;
  });
  console.log("submitted via:", submit);
  await page.waitForTimeout(4000);
  await dump(page, "03-after-submit");

  // scroll the side panel column into deeper view (QT panel) if scrollable
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(1200);
  await dump(page, "04-scrolled");

  // back to overview to see whether the map recolours
  await page.evaluate(() => window.scrollTo(0, 0));
  const ov = page.getByRole("button", { name: "Overview" }).first();
  if (await ov.isVisible().catch(() => false)) {
    await ov.click();
    await page.waitForTimeout(8000);
    await dismissTour(page);
    await dump(page, "05-overview-after");
  }

  await browser.close();
  console.log("done");
})();
