/* Scrolls through the tour and screenshots key beats for visual review. */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const OUT = "/tmp/tour";
const FRACS = process.argv[2]
  ? process.argv[2].split(",").map(Number)
  : [0, 0.06, 0.12, 0.19, 0.27, 0.33, 0.40, 0.45, 0.52, 0.60, 0.67, 0.72, 0.77, 0.82, 0.88, 0.93, 0.98];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (m) => { if (m.type() === "error") console.log("[err]", m.text().slice(0, 300)); });
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
  await page.goto("http://localhost:5180", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(5000); // let three.js + textures load

  for (const f of FRACS) {
    await page.evaluate((frac) => {
      const tour = document.querySelector(".tour");
      if (!tour) { window.scrollTo(0, 0); return; }
      const top = tour.offsetTop;
      const span = tour.offsetHeight - window.innerHeight;
      window.scrollTo(0, top + frac * span);
    }, f);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: path.join(OUT, `f${String(Math.round(f * 100)).padStart(2, "0")}.png`) });
    console.log("ok", f);
  }
  await browser.close();
})();
