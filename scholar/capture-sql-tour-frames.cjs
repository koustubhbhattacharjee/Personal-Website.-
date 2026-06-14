const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { generate } = require("./gen-state.cjs");

const BASE = "http://localhost:3005";
const OUT = path.resolve(__dirname, "../web/public/shots");
const SEQ = path.join(OUT, "mac-drill-seq");
const SECRET = "scholar-showcase-dev-secret";
const SUBJECT = "cs50-showcase";
const TARGET_QT = "cs50-qt-022";
const FAKE_NOW = new Date("2026-06-11T23:30:00-04:00");

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
  throw new Error("Could not verify SQL showcase state");
}

async function newPage(browser) {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
  });
  await ctx.addCookies([{ name: "scholar_showcase_session", value: mintSession(), url: BASE }]);
  await ctx.addInitScript(() => localStorage.setItem("scholar-dashboard-palette", "ember"));
  const page = await ctx.newPage();
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) console.log(`[browser:${msg.type()}]`, msg.text().slice(0, 300));
  });
  page.on("pageerror", (err) => console.log("[pageerror]", String(err).slice(0, 500)));
  await page.clock.install({ time: FAKE_NOW });
  return { ctx, page };
}

async function installCursor(page) {
  await page.addStyleTag({
    content: `
      #captureCursor {
        position: fixed;
        left: 0;
        top: 0;
        width: 38px;
        height: 48px;
        z-index: 2147483647;
        pointer-events: none;
        transform: translate(-100px, -100px);
        opacity: 0;
        filter: drop-shadow(0 5px 8px rgba(0,0,0,.28));
      }
      #captureCursor svg { width: 38px; height: 48px; transform-origin: 8px 8px; }
      #captureCursor.down svg { transform: scale(.9); }
      #captureCursor::after {
        content: "";
        position: absolute;
        left: -12px;
        top: -12px;
        width: 34px;
        height: 34px;
        border: 3px solid rgba(155, 50, 31, .78);
        border-radius: 50%;
        opacity: 0;
        transform: scale(.65);
      }
      #captureCursor.down::after { opacity: 1; transform: scale(1.15); }
    `,
  });
  await page.evaluate(() => {
    const cursor = document.createElement("div");
    cursor.id = "captureCursor";
    cursor.innerHTML = `
      <svg viewBox="0 0 38 48" aria-hidden="true">
        <path d="M6 4 L30 27 L19 29 L25 43 L19 46 L13 31 L5 39 Z" fill="#f7f2ea" stroke="#111" stroke-width="2" stroke-linejoin="round"/>
      </svg>`;
    document.body.appendChild(cursor);
  });
}

async function setCursor(page, x, y, down = false, visible = true) {
  await page.evaluate(({ x, y, down, visible }) => {
    const cursor = document.getElementById("captureCursor");
    if (!cursor) return;
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    cursor.style.opacity = visible ? "1" : "0";
    cursor.classList.toggle("down", down);
  }, { x, y, down, visible });
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
    const loading = await page.evaluate(() => /LOADING\s+TOPIC\s+MAP/i.test(document.body.textContent || "")).catch(() => true);
    const hasCanvas = (await allCanvases(page).catch(() => [])).length > 0;
    if (!loading && hasCanvas) break;
    await page.waitForTimeout(1000);
  }
  const ready = await page.evaluate(() => ({
    loading: /LOADING\s+TOPIC\s+MAP/i.test(document.body.textContent || ""),
    canvases: document.querySelectorAll("canvas").length,
    text: (document.body.textContent || "").slice(0, 500),
  }));
  if (ready.loading || !ready.canvases) throw new Error(`Dashboard never became ready: ${JSON.stringify(ready)}`);
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

async function waitForCanvases(page) {
  for (let i = 0; i < 30; i++) {
    const cvs = await allCanvases(page);
    if (cvs.length) return cvs;
    await page.waitForTimeout(500);
  }
  throw new Error("No canvases found");
}

async function headState(page) {
  return page.evaluate(() => ({
    label: [...document.querySelectorAll(".obs-label")].map((n) => n.textContent.trim()).find((t) => /^§/.test(t)) || "",
    title: (document.querySelector(".obs-head-title")?.textContent || "").replace(/\s+/g, " ").trim(),
  }));
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

async function waitForTitle(page, match) {
  for (let i = 0; i < 20; i++) {
    const state = await headState(page);
    if (match.test(state.title)) return state;
    await page.waitForTimeout(350);
  }
  throw new Error(`Timed out waiting for ${match}`);
}

function pad(n) {
  return String(n).padStart(3, "0");
}

async function staticShot(page, name) {
  await setCursor(page, -100, -100, false, false);
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log("shot:", name);
}

async function frameShot(page, index) {
  await page.screenshot({ path: path.join(SEQ, `${pad(index)}.png`), fullPage: false });
}

async function pointFor(page, kind, spot) {
  const cvs = await waitForCanvases(page);
  if (kind === "unit") {
    const big = cvs.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    return { x: big.x + big.w / 2, y: big.y + big.h / 2 + spot };
  }
  const left = cvs.reduce((a, b) => (b.x < a.x ? b : a));
  return { x: left.x + left.w / 2 + left.w * spot[0], y: left.y + left.h / 2 + left.h * spot[1] };
}

async function captureTransition(page, frame, opts) {
  const p = await pointFor(page, opts.kind, opts.spot);
  await setCursor(page, p.x - 4, p.y - 3, false, true);
  await frameShot(page, frame++);
  await page.waitForTimeout(180);
  await frameShot(page, frame++);
  await setCursor(page, p.x - 4, p.y - 3, true, true);
  await frameShot(page, frame++);
  await page.mouse.dblclick(p.x, p.y, { delay: 90 });
  await page.waitForTimeout(220);
  if (opts.select) {
    const ok = await page.evaluate((select) => (
      window.__scholarPanelCaptureSelect?.(select) ||
      window.__scholarCaptureSelect?.(select) ||
      false
    ), opts.select);
    if (!ok) throw new Error(`Capture select failed for ${JSON.stringify(opts.select)}`);
  }
  const delays = [120, 220, 320, 420, 520, 650, 800, 1000, 1300, 1650, 2100, 2700, 3400, 4200];
  let elapsed = 0;
  for (const d of delays) {
    await page.waitForTimeout(d - elapsed);
    elapsed = d;
    await setCursor(page, p.x - 4, p.y - 3, d < 420, true);
    await frameShot(page, frame++);
  }
  const landed = await waitForTitle(page, opts.match);
  console.log("landed:", opts.kind, landed.title);
  return frame;
}

async function silentClick(page, kind, spot, settle = 3600) {
  const p = await pointFor(page, kind, spot);
  await page.mouse.dblclick(p.x, p.y);
  await page.waitForTimeout(settle);
}

async function primeUnitOrientation(page) {
  const overview = await headState(page);
  for (const spot of [-15, -75, -130, 40]) {
    await waitForCanvases(page);
    await silentClick(page, "unit", spot);
    await backTo(page, overview);
    await waitForCanvases(page);
    await page.waitForTimeout(900);
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SEQ, { recursive: true });
  for (const f of fs.readdirSync(SEQ)) {
    if (/^\d+\.png$/.test(f)) fs.unlinkSync(path.join(SEQ, f));
  }

  await setStateVerified();
  const browser = await chromium.launch();
  const { ctx, page } = await newPage(browser);
  await gotoDashboard(page);
  await installCursor(page);
  await staticShot(page, "mac-dashboard.png");

  let frame = 0;
  frame = await captureTransition(page, frame, {
    kind: "unit",
    spot: -130,
    select: { unitName: "Python and SQL" },
    match: /Python\s*and\s*SQL|Pythonand SQL/i,
  });
  await staticShot(page, "mac-drill-unit.png");

  frame = await captureTransition(page, frame, {
    kind: "ring",
    spot: [0, -0.08],
    select: { unitName: "Python and SQL", ringName: "Query and design relational databases with SQL" },
    match: /Query\s*and\s*design\s*relational\s*databases\s*with\s*SQL|Queryand design relationaldatabases with SQL/i,
  });
  await staticShot(page, "mac-drill-ring.png");

  frame = await captureTransition(page, frame, {
    kind: "qt",
    spot: [0.18, 0],
    select: { unitName: "Python and SQL", ringName: "Query and design relational databases with SQL", arcId: "cs50-qt-022" },
    match: /SQL\s*Schema\s*Design|Schema Design/i,
  });
  await staticShot(page, "mac-drill-qt.png");

  frame = await captureTransition(page, frame, {
    kind: "question",
    spot: [0.18, 0],
    select: { unitName: "Python and SQL", ringName: "Query and design relational databases with SQL", arcId: "cs50-qt-022", questionIdx: 0 },
    match: /^Question/i,
  });
  await staticShot(page, "mac-drill-question.png");

  fs.writeFileSync(path.join(SEQ, "count.json"), JSON.stringify({ count: frame }, null, 2) + "\n");
  console.log("frames:", frame);
  await ctx.close();
  await browser.close();
})();
