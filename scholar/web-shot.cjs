/* Screenshots the personal-site tour at given scroll fractions.
   Usage: node web-shot.cjs [f1 f2 ...]   (defaults below) -> /tmp/web-shots */
const { chromium } = require("playwright");
const fs = require("fs");

const URL = "http://localhost:5173";
const OUT = "/tmp/web-shots";
const fracs = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const F = fracs.length ? fracs : [0.06, 0.12, 0.2, 0.3, 0.42, 0.52, 0.62, 0.75, 0.88];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error" || /\[mac-/.test(m.text())) errors.push(m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + String(e).slice(0, 300)));
  await page.goto(URL, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(5000);
  const H = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  console.log("scrollable:", H);
  for (const f of F) {
    await page.evaluate((y) => window.scrollTo(0, y), Math.round(H * f));
    await page.waitForTimeout(1700);
    const name = `${OUT}/f${String(f).replace("0.", "")}.png`;
    await page.screenshot({ path: name });
    console.log("shot:", name);
  }
  if (errors.length) console.log("CONSOLE:\n" + [...new Set(errors)].join("\n"));
  await browser.close();
})();
