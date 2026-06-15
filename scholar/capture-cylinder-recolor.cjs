const { chromium } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const BASE = "http://localhost:3005";
const SECRET = "scholar-showcase-dev-secret";
const OUT = path.resolve(__dirname, "../web/public/shots/practice");
const STATE = path.join(__dirname, "data/showcase-demo-state.json");
const N = parseInt(process.argv[2] || "2", 10);
const PALETTE = process.argv[3] || "ember";

function mintSession() { const now=Date.now(); const p={kind:"showcase",viewerLabel:"k.",iat:now,exp:now+3600000}; const e=Buffer.from(JSON.stringify(p)).toString("base64url"); const s=crypto.createHmac("sha256",SECRET).update(e).digest("base64url"); return e+"."+s; }
const src = fs.readFileSync(path.join(__dirname, "data/showcase-courses.js"), "utf8");
const qtIds = [...src.matchAll(/id: "(cs50-qt-\d+)", title: "([^"]+)"/g)].map((m) => m[1]);
const keysByQt = {};
for (const m of src.matchAll(/q\("(cs50-qt-(\d+)-q\d+)"/g)) { const qt = "cs50-qt-" + m[2]; (keysByQt[qt] ||= []).push(m[1]); }

function writeState(masteredCount) {
  const today = new Date();
  const iso = (d) => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const recent = iso(today);
  const rows = {};
  qtIds.forEach((qt, idx) => {
    const keys = keysByQt[qt] || [];
    const mastered = idx < masteredCount;
    const frac = mastered ? 1.0 : 0.04;
    const correct = keys.slice(0, Math.max(0, Math.round(keys.length * frac)));
    const events = correct.map((k, i) => ({ id:"ev-"+qt+"-"+i, date: recent, result:"correct", questionKey:k, source:"practice" }));
    rows[qt] = { correctQuestionKeys: correct, dailySeenDates: correct.length?[recent]:[], dailyWrongDates: [], masteryEvents: events, weaknessScore: mastered?0:2.6 };
  });
  fs.writeFileSync(STATE, JSON.stringify({ viewers: { "showcase-viewer": { id:"showcase-viewer", label:"Alex Carter", timezone:"America/New_York", subjects: { "cs50-showcase": { version:3, scoreRows: rows, homeworkAttempts:{}, assessmentAttempts:{} } } } } }, null, 2) + "\n");
}
async function dismiss(page){ for(let i=0;i<5;i++){const c=await page.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(x=>/skip guide/i.test(x.textContent||""));if(b){b.click();return true;}return false;}).catch(()=>false);if(c)await page.waitForTimeout(700);else break;} }
async function selectMap(page){
  const sel=page.getByText("Select subject",{exact:false}).first();
  if(await sel.isVisible().catch(()=>false)){await sel.click();await page.waitForTimeout(600);await page.getByText("CS50",{exact:false}).first().click();}
  for(let i=0;i<40;i++){const l=await page.getByText("LOADING TOPIC MAP",{exact:false}).first().isVisible().catch(()=>false);const c=await page.$("canvas");if(!l&&c)break;await page.waitForTimeout(1000);}
  await page.waitForTimeout(2500);await dismiss(page);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  await ctx.addCookies([{ name: "scholar_showcase_session", value: mintSession(), url: BASE }]);
  await ctx.addInitScript((pal)=>localStorage.setItem("scholar-dashboard-palette", pal), PALETTE);
  const page = await ctx.newPage();
  for (let i = 0; i < N; i++) {
    const mastered = Math.round((i / (N - 1)) * qtIds.length);
    writeState(mastered);
    await new Promise((r)=>setTimeout(r,900));
    await page.goto(BASE + "/dashboard?demo=1&showcase=1", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(1500);
    await selectMap(page);
    const box = await page.evaluate(()=>{const c=document.querySelector("canvas");if(!c)return null;const r=c.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};});
    if(!box){console.log("frame",i,"NO CANVAS");continue;}
    await page.mouse.move(box.cx, box.cy);
    for(let z=0;z<8;z++){await page.mouse.wheel(0,240);await page.waitForTimeout(150);}
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(OUT, `p${String(i).padStart(2,"0")}.png`), clip: { x: box.x + (box.width - box.height * 1.4326) / 2, y: box.y, width: box.height * 1.4326, height: box.height } });
    console.log("frame", i, "mastered", mastered + "/" + qtIds.length);
  }
  await browser.close();
})();
