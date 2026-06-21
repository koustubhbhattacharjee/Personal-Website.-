import { chromium } from "playwright";

const URL = "http://localhost:5173/";
const MODE = process.argv[2] || "web"; // "web" | "mobile"
const OUT = `screens/${MODE}`;

// Beat = a settled moment on the GSAP timeline (window.__tl). Times are in the
// timeline's own seconds AFTER the shiftChildren(+7) applied in buildTimeline.
const BEATS = [
  { name: "00-hero",          t: 0.5 },
  { name: "01-laptop-intro",  t: 9 },
  { name: "02-what",          t: 24 },
  { name: "03-mastery",       t: 35 },
  { name: "04-decay",         t: 57 },
  { name: "05-answering",     t: 69 },
  { name: "06-flashcards",    t: 84 },
  { name: "07-session-log",   t: 92 },
  { name: "08-end-hint",      t: 99 },
];

const VIEWPORTS = {
  web:    { width: 1440, height: 900, deviceScaleFactor: 2, isMobile: false },
  mobile: { width: 390,  height: 844, deviceScaleFactor: 3, isMobile: true },
};

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable" });
const ctx = await browser.newContext({
  viewport: { width: VIEWPORTS[MODE].width, height: VIEWPORTS[MODE].height },
  deviceScaleFactor: VIEWPORTS[MODE].deviceScaleFactor,
  isMobile: VIEWPORTS[MODE].isMobile,
  hasTouch: VIEWPORTS[MODE].isMobile,
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle" });

// wait for the asset loader to clear and the timeline to be built
await page.waitForFunction(() => window.__tl && document.querySelector('.tour-loader[data-active="0"]'), null, { timeout: 30000 });
// freeze scroll-driving so we can set the playhead by hand
await page.evaluate(() => { const tl = window.__tl; if (tl.scrollTrigger) tl.scrollTrigger.disable(false); });
// the walkthrough is now a pinned section BELOW the static hero + Lead Teacher, so
// scroll into its range first (the sticky stage then fills the viewport)
await page.evaluate(() => {
  const tour = document.querySelector(".tour");
  if (tour) window.scrollTo(0, tour.offsetTop + window.innerHeight);
});
await page.waitForTimeout(600);

for (const b of BEATS) {
  await page.evaluate((t) => { window.__tl.time(t); }, b.t);
  // let a few render frames pass so the 3D canvas catches up to the new rig state
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${b.name}.png` });
  console.log(`captured ${MODE}/${b.name}`);
}

await browser.close();
