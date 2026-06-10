/* Captures Scholar showcase screens for the personal-site scroll tour.
   State is written directly to the demo-state file between page loads —
   the showcase store has racy read-modify-write semantics, so we never
   mutate it through the API. */
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

function mintSession(label = "Alex Carter") {
  const now = Date.now();
  const payload = { kind: "showcase", viewerLabel: label, iat: now, exp: now + 3600 * 1000 };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

async function newPage(browser, viewport, scale) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale });
  await ctx.addCookies([{ name: "scholar_showcase_session", value: mintSession(), url: BASE }]);
  await ctx.addInitScript(() => {
    localStorage.setItem("scholar-dashboard-palette", "sunset");
  });
  const page = await ctx.newPage();
  await page.clock.install({ time: FAKE_NOW });
  return { ctx, page };
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
  await page.waitForTimeout(6000); // 3D mount + settle
  await dismissTour(page);
}

async function dismissTour(page) {
  for (let i = 0; i < 10; i++) {
    // JS click bypasses the overlay's pointer interception entirely
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) => /skip guide/i.test(b.textContent || ""));
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
    if (clicked) await page.waitForTimeout(1200);
    const backdrop = await page.$("[class*='tourBackdrop']");
    if (!backdrop) return;
    await page.waitForTimeout(1200);
  }
}


async function clickNav(page, name) {
  for (let i = 0; i < 5; i++) {
    await dismissTour(page);
    try {
      await page.getByRole("button", { name }).click({ timeout: 6000 });
      return;
    } catch {
      await page.waitForTimeout(1500);
    }
  }
  await page.screenshot({ path: "/tmp/clicknav-fail.png" });
  const texts = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map((b) => b.textContent.trim().slice(0, 50)).filter(Boolean)
  );
  console.log("clickNav fail, buttons:", JSON.stringify(texts));
  throw new Error(`could not click nav button: ${name}`);
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name) });
  console.log("shot:", name);
}

const quiesce = (ms = 3000) => new Promise((r) => setTimeout(r, ms));

// Write state, then verify the server actually serves it (a lingering
// last-writer-wins store write from the previous pass can clobber the file).
async function setStateVerified(boost) {
  for (let i = 0; i < 6; i++) {
    generate({ boost });
    await quiesce(1500);
    const res = await fetch(
      `${BASE}/api/student/progress-graph?subjectId=${SUBJECT}&demo=1&showcase=1`,
      { headers: { Cookie: `scholar_showcase_session=${encodeURIComponent(mintSession())}` } }
    );
    const j = await res.json().catch(() => ({}));
    const qt = (j.questionTypes || []).find((q) => q.id === "cs50-qt-020");
    const mastered = qt && Number(qt.masteryScore) >= 1;
    const seen = (j.questionTypes || []).some((q) => (q.dailySeenDates || []).length > 1);
    if ((boost ? mastered : !mastered) && seen) {
      console.log(`state verified (boost=${boost}) after ${i + 1} attempt(s)`);
      return;
    }
    await quiesce(3000);
  }
  throw new Error("could not get server to serve the generated state");
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // ── MacBook pass A: baseline state ────────────────────────────────────
  await setStateVerified(false);
  {
    const { ctx, page } = await newPage(browser, { width: 1680, height: 1050 }, 2);
    await gotoDashboard(page);
    await shot(page, "mac-dashboard.png");

    await dismissTour(page);
    await page.getByRole("button", { name: "Torus", exact: true }).click({ timeout: 15000 });
    await page.waitForTimeout(5000);
    await shot(page, "mac-shape-torus.png");
    await dismissTour(page);
    await page.getByRole("button", { name: "Bar", exact: true }).click({ timeout: 15000 });
    await page.waitForTimeout(5000);
    await shot(page, "mac-shape-bar.png");
    await dismissTour(page);
    await page.getByRole("button", { name: "Cylinder", exact: true }).click({ timeout: 15000 });
    await page.waitForTimeout(5000);
    await shot(page, "mac-shape-cylinder.png");

    await clickNav(page, "Practice Room");
    await page.waitForTimeout(8000);
    await shot(page, "mac-practice.png");
    await ctx.close();
  }

  // ── MacBook pass B: boosted state (qt-015 mastered) ───────────────────
  await quiesce(); // let any in-flight server writes land first
  await setStateVerified(true);
  {
    const { ctx, page } = await newPage(browser, { width: 1680, height: 1050 }, 2);
    await gotoDashboard(page);
    await shot(page, "mac-dashboard-after.png");
    await clickNav(page, "Practice Room");
    await page.waitForTimeout(8000);
    await shot(page, "mac-practice-after.png");
    await ctx.close();
  }

  // ── iPad pass: exit ticket ─────────────────────────────────────────────
  await quiesce();
  await setStateVerified(false);
  {
    const { ctx, page } = await newPage(browser, { width: 1194, height: 834 }, 2);
    // useSession can resolve "unauthenticated" before router.query parses demo=1
    // and bounce to "/" — retry until we stay on /assessment with a question up.
    for (let i = 0; i < 5; i++) {
      await page.goto(`${BASE}/assessment?subjectId=${SUBJECT}&mode=exit&demo=1&showcase=1`, {
        waitUntil: "networkidle", timeout: 60000,
      });
      await page.waitForTimeout(5000);
      const ok = page.url().includes("/assessment") &&
        (await page.getByText(/question 1 of/i).first().isVisible().catch(() => false));
      if (ok) break;
      console.log("assessment bounced, retrying", page.url());
      await page.waitForTimeout(2000);
    }
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "paper"));
    await page.waitForTimeout(800);
    const open = page.getByText("Open Scratchpad", { exact: false }).first();
    if (await open.isVisible().catch(() => false)) {
      await open.click();
      await page.waitForTimeout(4000);
    }
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "paper"));
    await page.waitForTimeout(500);
    await shot(page, "ipad-exit-1.png");

    await page.evaluate(() => {
      // option buttons render as "A<text>" — match single-letter prefix with content after
      const opts = [...document.querySelectorAll("button")].filter((b) => {
        const t = (b.textContent || "").trim();
        return /^[A-D]/.test(t) && t.length > 3 && b.closest("main, [class*=question], body");
      }).slice(0, 4);
      if (opts[1]) opts[1].click();
      else if (opts[0]) opts[0].click();
    });
    await page.waitForTimeout(1500);
    const next = page.getByText("Next Question", { exact: false }).first();
    if (await next.isVisible().catch(() => false)) await next.click();
    await page.waitForTimeout(2500);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "paper"));
    await page.waitForTimeout(400);
    await shot(page, "ipad-exit-2.png");
    await ctx.close();
  }

  // ── iPhone pass: dashboard, check-in, flashcards ───────────────────────
  await quiesce();
  await setStateVerified(false);
  {
    const { ctx, page } = await newPage(browser, { width: 390, height: 844 }, 3);
    await gotoDashboard(page);
    await shot(page, "iphone-dashboard.png");

    let scrolled = false;
    for (let i = 0; i < 8 && !scrolled; i++) {
      scrolled = await page.evaluate(() => {
        const els = [...document.querySelectorAll("*")].filter(
          (n) => n.childNodes.length === 1 && n.childNodes[0].nodeType === 3 && /Daily Check.?in/i.test(n.textContent || "")
        );
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (r.width > 0) {
            window.scrollTo(0, Math.max(0, r.top + window.scrollY - 70));
            return true;
          }
        }
        return false;
      });
      if (scrolled) {
        await page.waitForTimeout(1200);
        const y = await page.evaluate(() => window.scrollY);
        if (y < 100) scrolled = false; // something reset the scroll — try again
      }
      if (!scrolled) await page.waitForTimeout(1200);
    }
    if (!scrolled) console.log("check-in never became visible");
    await page.waitForTimeout(1200);
    await shot(page, "iphone-checkin.png");

    // flashcards live in a desktop-only aside — promote to full screen
    await page.evaluate(() => {
      const label = [...document.querySelectorAll("h3")].find((h) => /Flashcards/.test(h.textContent || ""));
      const sec = label && label.closest("section");
      if (!sec) return;
      let p = sec.parentElement;
      while (p && p !== document.body) {
        if (getComputedStyle(p).display === "none") p.style.display = "block";
        p = p.parentElement;
      }
      sec.style.cssText =
        "position:fixed;inset:0;z-index:99999;background:var(--bg);overflow:auto;padding:28px 20px;display:block;";
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(2000);
    await shot(page, "iphone-flashcards.png");

    await page.evaluate(() => {
      const label = [...document.querySelectorAll("h3")].find((h) => /Flashcards/.test(h.textContent || ""));
      const sec = label && label.closest("section");
      if (!sec) return;
      const face = sec.querySelector("div[style*='cursor']");
      if (face) face.click();
    });
    await page.waitForTimeout(1800);
    await shot(page, "iphone-flashcards-back.png");
    await ctx.close();
  }

  await browser.close();
  console.log("done ->", OUT);
})();
