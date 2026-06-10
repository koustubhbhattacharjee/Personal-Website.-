/* Checks for breadcrumb <select>s on the dashboard drill view. */
const { chromium } = require("playwright");
const crypto = require("crypto");
const { generate } = require("./gen-state.cjs");

const BASE = "http://localhost:3005";
function mintSession() {
  const now = Date.now();
  const e = Buffer.from(JSON.stringify({ kind: "showcase", viewerLabel: "Alex Carter", iat: now, exp: now + 3600000 })).toString("base64url");
  return `${e}.${crypto.createHmac("sha256", "scholar-showcase-dev-secret").update(e).digest("base64url")}`;
}

(async () => {
  generate({ boostIds: ["cs50-qt-019"] });
  await new Promise((r) => setTimeout(r, 1800));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1050 } });
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
  await page.waitForTimeout(5000);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => /skip guide/i.test(b.textContent || ""));
    if (btn) btn.click();
  });
  await page.waitForTimeout(2000);

  const dumpSelects = () => page.evaluate(() =>
    [...document.querySelectorAll("select")].map((s) => ({
      visible: !!(s.offsetWidth || s.offsetHeight),
      options: [...s.options].map((o) => o.textContent.trim().slice(0, 50)).slice(0, 8),
    }))
  );
  console.log("selects at overview:", JSON.stringify(await dumpSelects(), null, 1));

  // drill one level (any band), then dump again
  const cvs = await page.evaluate(() =>
    [...document.querySelectorAll("canvas")].map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }).filter((r) => r.w > 80)
  );
  const big = cvs.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
  await page.mouse.dblclick(big.x + big.w / 2, big.y + big.h / 2 - 20);
  await page.waitForTimeout(4500);
  console.log("selects after drill:", JSON.stringify(await dumpSelects(), null, 1));
  await browser.close();
})();
