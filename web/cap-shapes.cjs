/* Re-captures the mastery-recolour flipbook frames. Renders each frame of the
   three side-by-side shapes (arc/disc/cylinder) via the /?cap=N route and writes
   web/public/shots/practice/pNN.png at 960x600 (mac screen 16:10). Kept modest on
   purpose: 24 frames stay resident in VRAM the whole session, so this is sized to
   land the net texture budget below the pre-refactor baseline (see project notes).

   Usage: start the web dev server (npx vite in web/), then:
     node cap-shapes.cjs            (defaults to http://localhost:5173)
     PORT=5180 node cap-shapes.cjs  (override the port) */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT || 5173;
const BASE = `http://localhost:${PORT}`;
const OUT = path.join(__dirname, "public", "shots", "practice");
const FRAMES = 24;
const W = 960, H = 600;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
  for (let i = 0; i < FRAMES; i++) {
    await page.goto(`${BASE}/?cap=${i}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(700); // let three.js settle the frame
    const name = path.join(OUT, `p${String(i).padStart(2, "0")}.png`);
    await page.screenshot({ path: name });
    console.log("ok", name);
  }
  await browser.close();
})();
