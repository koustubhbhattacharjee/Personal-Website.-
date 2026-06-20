import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Perf } from "r3f-perf";
import { useProgress } from "@react-three/drei";
import { rig } from "./rig";
import { CALLOUTS, SHAPE_FRAMES } from "./tour-data";
import "./tour.css";

// opt-in perf HUD: add ?perf to the URL to see FPS / draw calls / GPU memory
const SHOW_PERF = typeof location !== "undefined" && location.search.includes("perf");

gsap.registerPlugin(ScrollTrigger);

// On phones the smoothed scrub (0.7s catch-up) reads as laggy, so tie the
// timeline directly to the scrollbar (scrub:true = no smoothing). Responsiveness
// comes from that + the shorter scroll height, NOT from dropping resolution — the
// device screenshots have to stay legible, so we render at up to 2x on mobile.
const MOBILE = typeof window !== "undefined" && window.matchMedia("(max-width: 880px)").matches;

const Scene = lazy(() => import("./Scene"));

// Decay beat: a one-week window from the viewer's local date (today → +7 days), and
// the 8 real-data arc-decay frames (day 0 fully mastered → day 7 faded).
const DECAY_DATES = Array.from({ length: 8 }, (_, d) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
});
const DECAY_ARC_FRAMES = Array.from({ length: 8 }, (_, d) => `/shots/decay-arc-${String(d).padStart(2, "0")}.png`);

/* ── DOM pieces ─────────────────────────────────────────────────────────── */

function GlitchTitle({ text }) {
  return (
    <div className="ttl">
      <span className="g g1" aria-hidden>{text}</span>
      <span className="g g2" aria-hidden>{text}</span>
      <span className="main caslon">{text}</span>
    </div>
  );
}

function DecayCurve() {
  return (
    <svg className="decay-curve" viewBox="0 0 230 96" aria-hidden>
      <line x1="8" y1="84" x2="222" y2="84" stroke="rgba(26,26,26,.3)" strokeWidth="1" />
      <line x1="8" y1="84" x2="8" y2="6" stroke="rgba(26,26,26,.3)" strokeWidth="1" />
      {/* real spaced-repetition retention: 0.5^(days/3) over one week */}
      <path
        id="decay-path"
        d="M10 14 C 32 22, 58 40, 99 54 S 184 75, 218 78"
        fill="none"
        stroke="#b33600"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset="1"
      />
      <circle id="decay-dot" cx="10" cy="14" r="4.5" fill="#b33600" opacity="0" />
      <text x="12" y="94" fontSize="8" fill="rgba(26,26,26,.6)" fontFamily="Inter">day 0</text>
      <text x="202" y="94" fontSize="8" fill="rgba(26,26,26,.6)" fontFamily="Inter">day 7</text>
      <text x="14" y="12" fontSize="8" fill="rgba(26,26,26,.6)" fontFamily="Inter">retention</text>
    </svg>
  );
}

// Slabs that ride on the orange stage (the two laptop beats) get white text;
// everything past the first handoff (yellow, then off-white) reads dark. See the
// stage-curtain timing.
const ON_ORANGE = new Set(["what", "mastery"]);

/* Title set as a flush rectangle (mobile): words wrap into lines, then every
   line — including the last — is scaled so its rendered width equals the column
   width. The lines stack with tight leading, so the title fills a tight invisible
   box with gently varying per-line sizes. Measured with canvas measureText so the
   scaling matches the real Inter glyph metrics; re-runs on width change. */
function RectTitle({ text }) {
  const ref = useRef(null);
  const [lines, setLines] = useState([]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let dead = false;
    const measure = () => {
      const w = el.clientWidth;
      if (!w || dead) return;
      const cv = (RectTitle._cv ||= document.createElement("canvas"));
      const ctx = cv.getContext("2d");
      const base = Math.max(20, w * 0.11);
      ctx.font = `800 ${base}px Inter, sans-serif`;
      const words = text.replace(/[.’]+$/, "").split(/\s+/);
      const rows = [];
      let cur = [];
      for (const word of words) {
        const test = cur.concat(word).join(" ");
        if (cur.length && ctx.measureText(test).width > w) { rows.push(cur); cur = [word]; }
        else cur.push(word);
      }
      if (cur.length) rows.push(cur);
      setLines(rows.map((ws) => {
        const t = ws.join(" ");
        const nat = ctx.measureText(t).width || 1;
        return { t, size: base * (w / nat) };
      }));
    };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { dead = true; ro.disconnect(); };
  }, [text]);
  return (
    <div className="rect-ttl" ref={ref}>
      {lines.map((l, i) => (
        <span key={i} className="rt-line" style={{ fontSize: `${l.size}px` }}>{l.t}</span>
      ))}
    </div>
  );
}

function Card({ c }) {
  // Every beat — decay included — is a shared slab: a justified-rectangle heading
  // + subtext, no card chrome, text tone following the stage colour. (Decay still
  // gets the floating retention curve alongside it.)
  const tone = ON_ORANGE.has(c.id) ? "on-orange" : "on-light";
  return (
    <div id={`card-${c.id}`} className={`callout slab ${c.side} ${tone}`} style={{ opacity: 0 }}>
      <div className="kicker">{c.kicker}</div>
      <RectTitle text={c.title} />
      <p>{c.body}</p>
    </div>
  );
}

function Loader() {
  const { active, progress } = useProgress();
  return (
    <div className="tour-loader" data-active={active ? "1" : "0"} aria-hidden={!active}>
      <div className="tour-loader-bar"><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
    </div>
  );
}

function Hero() {
  return (
    <div id="hero-block">
      <div className="hero-inner">
        <h1 className="hero-greet caslon">Hi, I'm Koustubh.</h1>
        <p className="hero-creds">
          MS Physics (UT Dallas)<span className="sep">|</span>
          MS Astronomy (IIST)<span className="sep">|</span>
          B.Tech, ECE (NIT Silchar)
        </p>
        <p className="hero-desc">
          I was the lead physics teacher at <b>KIPP DC College Prep</b> in Washington, DC, USA, and I tutor physics and math. Scroll to know more.
        </p>
      </div>
      <div className="scroll-hint"><span className="label">scroll</span><span className="chev">⌄</span></div>
    </div>
  );
}

/* Daily check-in contribution graph — a crisp, resolution-independent DOM grid
   projected straight onto the iPhone screen (replaces the low-res screenshot and
   drops the cylinder). Cell intensities are a fixed pattern so it reads as a real
   streak; the timeline fades it in and staggers the cells alight (#phone-contrib). */
const CONTRIB_WEEKS = 18;
const CONTRIB_DAYS = 7;
const CONTRIB_CELLS = Array.from({ length: CONTRIB_WEEKS * CONTRIB_DAYS }, (_, i) => {
  const wk = Math.floor(i / CONTRIB_DAYS);
  // a deterministic streak: denser toward recent weeks, with a weekly rhythm
  const v = (Math.sin(i * 1.7) + Math.cos(i * 0.6 + wk)) * 0.5 + 0.5;
  const recent = wk / CONTRIB_WEEKS;
  const s = v * (0.45 + recent * 0.75);
  return s < 0.18 ? 0 : s < 0.42 ? 1 : s < 0.68 ? 2 : s < 0.9 ? 3 : 4;
});

function PhoneContrib() {
  return (
    <div id="phone-contrib" aria-hidden>
      <div className="pc-head">
        <span className="pc-title">Daily check-in</span>
        <span className="pc-sub">51 active days</span>
      </div>
      <div className="pc-grid">
        {CONTRIB_CELLS.map((lvl, i) => (
          <span key={i} className="cell" data-lvl={lvl} />
        ))}
      </div>
      <div className="pc-legend"><span>less</span><i data-lvl={0} /><i data-lvl={1} /><i data-lvl={2} /><i data-lvl={3} /><i data-lvl={4} /><span>more</span></div>
    </div>
  );
}

/* ── overlays that ride on top of the projected screens ────────────────── */

function ScreenOverlays() {
  return (
    <>
      <div id="ov-mac" className="screen-ov">
        {/* click pulse on the "Practice this question?" popup (still on the laptop) */}
        <div id="ripple" className="ripple" style={{ left: "36%", top: "64%" }} />
      </div>
      <div id="ov-pad" className="screen-ov">
        {/* decay beat (on the iPad): the practice room (sharp), then it blurs and the
            last-solved arc separates out as a card that fills the screen and loses
            its colour over 7 real days */}
        <div id="decay-stage" aria-hidden>
          <img id="decay-room-img" src="/shots/decay-room.png" alt="" />
          <div id="decay-arc">
            <img id="decay-arc-img" src="/shots/decay-arc-00.png" alt="" />
          </div>
        </div>
        {/* practice room now lives on the iPad: click pulse on the correct MCQ option */}
        <div id="ripple2" className="ripple" style={{ left: "22%", top: "36%" }} />
        {/* glow over the re-tinted wedge after the correct answer */}
        <div id="hl-band" className="hl-band" style={{ left: "14%", top: "38%", width: "24%", height: "42%" }} />
        <svg id="pad-draw" viewBox="0 0 1194 834" preserveAspectRatio="none">
          {/* hand-drawn working on the scratchpad: a force diagram + v=d/t */}
          <g stroke="#1c1813" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1" strokeDashoffset="1">
            <path className="stk" pathLength="1" d="M560 430 q 14 -36 48 -40 q 40 -5 52 28 q 10 32 -22 46 q -36 14 -64 -8 q -18 -16 -14 -26" />
            <path className="stk" pathLength="1" d="M610 458 l 0 96 m 0 0 l -10 -16 m 10 16 l 11 -16" />
            <path className="stk" pathLength="1" d="M648 418 l 92 0 m 0 0 l -16 -10 m 16 10 l -16 11" />
            <path className="stk" pathLength="1" d="M780 380 q 8 -22 22 -4 q 6 8 2 26 m 28 -34 l -4 38 m 22 -30 q 16 -10 14 8 q -2 14 -16 22" />
            <path className="stk" pathLength="1" d="M760 480 l 150 0" />
            <path className="stk" pathLength="1" d="M790 520 q 20 -28 36 0 q -18 26 -36 0 z m 60 -10 l 0 28 m 24 -34 q 14 18 0 34 m -110 30 l 160 0" />
          </g>
        </svg>
      </div>
      <div id="ov-phone" className="screen-ov"><PhoneContrib /></div>
    </>
  );
}

/* ── timeline ───────────────────────────────────────────────────────────── */

function buildTimeline(sectionEl) {
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: sectionEl,
      start: "top top",
      end: "bottom bottom",
      scrub: MOBILE ? true : 0.7,
    },
  });

  // Slab beats: the text slab slides up out of nothing and fades in (the shared
  // treatment for every callout except decay). No card, no glitch — just the rise.
  const calloutIn = (id, at, dur = 2.4) => {
    tl.fromTo(`#card-${id}`, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur * 0.4, ease: "power1.out" }, at);
    tl.fromTo(
      `#card-${id}`,
      { y: 30 },
      { y: 0, duration: dur * 0.7, ease: "power3.out" },
      at
    );
    tl.fromTo(`#ptr-${id}`, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur * 0.3 }, at + dur * 0.35);
    tl.fromTo(`#dot-${id}`, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur * 0.2 }, at + dur * 0.35);
  };
  const calloutOut = (id, at, dur = 1.4) => {
    tl.to(`#card-${id}`, { autoAlpha: 0, y: -18, duration: dur, ease: "power2.in" }, at);
    tl.to([`#ptr-${id}`, `#dot-${id}`], { autoAlpha: 0, duration: dur * 0.6 }, at);
  };
  // Decay keeps its own treatment — a soft fade in place (no slab rise).
  const decayIn = (id, at, dur = 2.2) => {
    tl.fromTo(`#card-${id}`, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur * 0.5, ease: "power1.out" }, at);
    tl.fromTo(`#ptr-${id}`, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur * 0.3 }, at + dur * 0.35);
    tl.fromTo(`#dot-${id}`, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur * 0.2 }, at + dur * 0.35);
  };
  const decayOut = (id, at, dur = 1.4) => {
    tl.to(`#card-${id}`, { autoAlpha: 0, duration: dur, ease: "power2.in" }, at);
    tl.to([`#ptr-${id}`, `#dot-${id}`], { autoAlpha: 0, duration: dur * 0.6 }, at);
  };

  // screen-content crossfade between two screen layers (iPad exit-ticket pages)
  const xfade = (from, to, at, dur = 1.8) => {
    tl.to(rig, { [from]: 0, duration: dur, ease: "power1.inOut" }, at);
    tl.to(rig, { [to]: 1, duration: dur, ease: "power1.inOut" }, at);
  };

  /* 0–6: hero hands off, MacBook rises */
  tl.to("#hero-block .hero-inner", { y: -120, autoAlpha: 0, duration: 3.2, ease: "power1.in" }, 0.8);
  tl.to(".scroll-hint", { autoAlpha: 0, duration: 1.5 }, 0.8);
  tl.to(rig, { macY: -0.15, duration: 6.4, ease: "power2.out" }, 0.4); // rises to screen-centre (y≈0)
  tl.to(rig, { camZ: 4.6, duration: 6.4, ease: "power1.inOut" }, 0.4);
  // white line above the laptop as it rises (white on the orange); it must clear
  // out before the rising/opening laptop reaches it
  tl.fromTo("#laptop-intro", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 1.4, ease: "power2.out" }, 4.4);
  tl.to("#laptop-intro", { autoAlpha: 0, y: -18, duration: 1.2, ease: "power2.in" }, 6.6);

  /* Stage colour curtains. Each wipes up from the bottom, driven by a numeric
     proxy (robust under scrub, same pattern as `rig`) instead of a transform
     fromTo, which mis-caches when the timeline is seeked. The nav bar's colour
     is tweened in lockstep so the whole frame, header included, changes colour. */
  const makeWipe = (id, extra) => {
    const p = { y: 100 };
    const paint = () => {
      const el = document.getElementById(id);
      if (el) el.style.transform = `translateY(${p.y}%)`;
      if (extra) extra();
    };
    return { p, paint };
  };
  /* Duotone header: a white-text clone of the nav, clipped to the band where the
     orange curtain is the visible colour, so the header text flips colour exactly
     along the moving wipe line — a solid swap with no opacity fade. */
  const paintNav = () => {
    const clone = document.getElementById("nav-orange");
    if (!clone) return;
    const vh = window.innerHeight;
    const navH = clone.offsetHeight || 68;
    const clamp = (v) => Math.max(0, Math.min(v, navH));
    const yO = clamp((cOrange.p.y / 100) * vh); // orange top edge
    const yY = clamp((cYellow.p.y / 100) * vh); // yellow top edge (rises over orange)
    const yW = clamp((cWhite.p.y / 100) * vh);  // off-white top edge (rises over yellow)
    // the white-text clone shows only where orange is the *topmost* colour; once
    // yellow or off-white rises over the header, the base dark nav shows instead
    // (so the header reads dark on yellow, not white-on-yellow)
    const top = yO;
    const bottom = Math.max(top, Math.min(yY, yW));
    clone.style.clipPath = `inset(${top}px 0 ${navH - bottom}px 0)`;
  };
  const cOrange = makeWipe("stage-orange", paintNav);
  const cWhite = makeWipe("stage-white", paintNav);
  const cYellow = makeWipe("stage-yellow", paintNav);

  /* orange floods up as the MacBook rises/opens — full by lid-open (~10.5) */
  tl.to(cOrange.p, { y: 0, duration: 9.3, ease: "power2.out", onUpdate: cOrange.paint }, 1.2);

  /* 6–10.5: the lid twists open — camera settles to the ONE fixed framing
     (dead-centre, tgtY=camY=0) used for the whole device sequence, so nothing
     dollies/enlarges from here on */
  tl.to(rig, { lid: 1, duration: 4.5, ease: "power2.inOut" }, 6);
  tl.to(rig, { camZ: 3.2, tgtX: 0, tgtY: 0, camX: 0, camY: 0, duration: 4, ease: "power1.inOut" }, 7);

  /* ── LAPTOP ───────────────────────────────────────────────────────────────
     The laptop's rise + the camera settle above IS the single zoom-in; nothing
     dollies or zooms again for the rest of the tour.
     Beat 1: what Scholar is — slab beside the laptop. */
  calloutIn("what", 13);
  calloutOut("what", 20.5);

  /* Beat 2: mastery — the colour-change lives on the laptop. The three
     constituent shapes (arc/disc/cylinder) play as a recolour flipbook filling
     the screen, climbing from red toward green as correct answers accumulate. */
  tl.fromTo(rig, { flipMac: 0 }, { flipMac: 1, duration: 2, ease: "power2.out" }, 21.5);
  tl.fromTo(rig, { shapeFrame: 0 }, { shapeFrame: SHAPE_FRAMES - 1, duration: 8.5, ease: "none" }, 22.5);
  calloutIn("mastery", 24);
  calloutOut("mastery", 32.5);
  tl.to(rig, { flipMac: 0, duration: 1.6, ease: "power2.inOut" }, 34);

  /* Reusable rotational hard-clip handoff (clip math in Scene.jsx). A colour
     divider rises; the two devices are stacked (the OUT device raised into the
     top band beforehand, the IN device parked in the bottom band) and spin about
     the vertical axis on one eased clock — so the 50/50 split lands with both
     edge-on (OUT facing right, IN facing the opposite way). Past it the OUT device
     turns its back and is squeezed out of the shrinking top band while the IN
     device turns to face the viewer and fills the growing bottom band. */
  const HOFF_DUR = 4.6, HOFF_EASE = "power2.inOut";
  const handoff = ({ at, out, inn, rising, inParkY }) => {
    tl.set(rig, {
      divider: 1,
      [`${inn}X`]: 0, [`${inn}Y`]: inParkY, [`${inn}RotY`]: -Math.PI,
      [`${out}ClipSide`]: 1, [`${inn}ClipSide`]: -1, clipActive: 1,
    }, at);
    const paint = () => { rising.p.y = rig.divider * 100; rising.paint(); };
    tl.to(rig, { divider: 0, duration: HOFF_DUR, ease: HOFF_EASE, onUpdate: paint }, at);
    tl.to(rig, { [`${out}RotY`]: Math.PI, duration: HOFF_DUR, ease: HOFF_EASE }, at);   // 0 → +90° → 180° (back)
    tl.to(rig, { [`${inn}RotY`]: 0, duration: HOFF_DUR, ease: HOFF_EASE }, at);          // −180° → −90° → 0° (front)
    // OUT gone + both clips released so the IN device renders whole
    tl.set(rig, { [`${out}X`]: -100, [`${out}ClipSide`]: 0, [`${inn}ClipSide`]: 0, clipActive: 0 }, at + HOFF_DUR + 0.05);
    return at + HOFF_DUR;
  };

  /* HANDOFF 1 — laptop hands off to the iPad (yellow rises). The iPad arrives
     already showing the decay practice room on its 3D screen, so it never flashes
     blank-black while it rotates in. */
  tl.set(rig, { decayRoom: 1 }, 35.6);
  handoff({ at: 36, out: "mac", inn: "pad", rising: cYellow, inParkY: 0 });

  /* ── iPad — Beat 3: decay (no problem-solving) ─────────────────────────────
     The iPad shows the practice room with the last-solved arc fully coloured and a
     one-week timer above it. Then the room blurs and that arc separates out as a
     card filling the screen, losing its colour over 7 real days (Scholar's
     spaced-repetition retention — real data). */
  tl.fromTo("#decay-stage", { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.6, ease: "power2.out" }, 42);
  tl.fromTo("#decay-timer", { autoAlpha: 0, y: -12 }, { autoAlpha: 1, y: 0, duration: 1.4, ease: "power2.out" }, 42.6);
  decayIn("decay", 43.6);
  // room blurs; the arc grows out from its corner to fill the screen
  tl.fromTo("#decay-room-img", { filter: "blur(0px)" }, { filter: "blur(9px)", duration: 2.4, ease: "power2.inOut" }, 45.2);
  tl.fromTo("#decay-arc",
    { xPercent: 20, yPercent: 24, scale: 0.26, autoAlpha: 0 },
    { xPercent: 0, yPercent: 0, scale: 1, autoAlpha: 1, duration: 2.6, ease: "power2.inOut" }, 45);
  tl.fromTo("#decay-float", { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.4, ease: "power2.out" }, 46.4);
  tl.fromTo("#decay-path", { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: 6, ease: "none" }, 47.8);
  tl.fromTo("#decay-dot", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5 }, 47.8);
  // the week elapses: the arc fades day 0 → day 7; the timer + curve dot track it
  const decayDay = { d: 0 };
  tl.to(decayDay, {
    d: 7, duration: 6, ease: "none",
    onUpdate: () => {
      const day = Math.max(0, Math.min(7, Math.round(decayDay.d)));
      const img = document.getElementById("decay-arc-img");
      if (img) { const s = `/shots/decay-arc-${String(day).padStart(2, "0")}.png`; if (!(img.getAttribute("src") || "").endsWith(s)) img.setAttribute("src", s); }
      const t = document.getElementById("decay-timer");
      if (t) { const a = t.querySelector(".dt-day"), b = t.querySelector(".dt-date"); if (a) a.textContent = `Day ${day}`; if (b) b.textContent = DECAY_DATES[day]; }
      const path = document.getElementById("decay-path"), dot = document.getElementById("decay-dot");
      if (path && dot) { const L = path.getTotalLength(); const p = path.getPointAtLength((decayDay.d / 7) * L); dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y); }
    },
  }, 47.8);
  tl.to(["#decay-stage", "#decay-timer", "#decay-float"], { autoAlpha: 0, duration: 1.3, ease: "power2.in" }, 54.6);
  decayOut("decay", 54.8);

  /* ── iPad — Beat 4: answering (handwriting + touchscreen) ───────────────────
     crossfade the iPad's 3D screen from the (sharp) room to the exit ticket as the
     blurred arc overlay clears, so there's no flash back to the sharp room */
  tl.to(rig, { decayRoom: 0, duration: 1.4, ease: "power1.inOut" }, 54.8);
  tl.to(rig, { padExit1: 1, duration: 1.4, ease: "power2.out" }, 54.8);
  calloutIn("hand", 57.5);
  gsap.utils.toArray("#pad-draw .stk").forEach((p, i) => {
    tl.fromTo(p, { attr: { "stroke-dashoffset": 1 } },
      { attr: { "stroke-dashoffset": 0 }, duration: 3, ease: "none" }, 59 + i * 0.4);
  });
  tl.to("#pad-draw", { autoAlpha: 0, duration: 0.8 }, 63.4);
  xfade("padExit1", "padExit2", 63.8, 1.3);
  calloutOut("hand", 65.8);

  /* HANDOFF 2 — iPad hands off to the iPhone; off-white floods up over the yellow. */
  tl.set(rig, { phoneCards: 1 }, 67.5); // iPhone arrives showing the flashcard deck
  handoff({ at: 68, out: "pad", inn: "phone", rising: cWhite, inParkY: 0 });

  /* ── iPhone ───────────────────────────────────────────────────────────────
     Beat 5: flashcards (content unchanged; slab caption). */
  calloutIn("cards", 75);
  tl.to(rig, { phoneCards: 0, phoneCardsBack: 1, duration: 1.2, ease: "power1.inOut" }, 77);
  calloutOut("cards", 80);

  /* Beat 6: session log — only the GitHub-style contribution graph (crisp DOM
     overlay, no cylinder). The opaque grid panel fades in over the deck and the
     cells stagger alight. */
  tl.fromTo("#phone-contrib", { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.6, ease: "power2.out" }, 81);
  tl.fromTo("#phone-contrib .cell",
    { autoAlpha: 0.16 },
    { autoAlpha: 1, duration: 3, ease: "none", stagger: { each: 0.006, from: "start" } }, 82);
  calloutIn("log", 83.4);
  calloutOut("log", 87.6);

  /* iPhone turns away in place as the stage fades to the off-white reviews. */
  tl.to("#phone-contrib", { autoAlpha: 0, duration: 1.2, ease: "power2.in" }, 88.4);
  tl.to(rig, { phoneRotY: -Math.PI, duration: 2.0, ease: "power2.in" }, 89);
  tl.to(".tour-canvas", { autoAlpha: 0, duration: 2 }, 89.6);
  tl.fromTo("#end-hint", { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 2.2, ease: "power2.out" }, 89.8);

  // Hold the intro: push the lid-open and everything after it later, so the white
  // "Scholar" line stays up much longer. Its fade-out shifts with the rest, so the
  // relative timing (line gone before the laptop finishes opening) is preserved;
  // the hero and the line's fade-in stay put (before the 5.5 split).
  tl.shiftChildren(7, false, 5.5);

  /* keep total length round */
  tl.set({}, {}, 105);
  if (import.meta.env.DEV) window.__tl = tl;
  return tl;
}

/* ── component ─────────────────────────────────────────────────────────── */

export default function Tour() {
  const sectionRef = useRef(null);
  const [frameloop, setFrameloop] = useState("always");

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      buildTimeline(sectionRef.current);
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  // stop the render loop entirely once the tour is scrolled out of view
  useEffect(() => {
    const io = new IntersectionObserver(
      ([entry]) => setFrameloop(entry.isIntersecting ? "always" : "never"),
      { rootMargin: "200px" }
    );
    io.observe(sectionRef.current);
    return () => io.disconnect();
  }, []);

  return (
    <section className="tour" ref={sectionRef}>
      <div className="tour-stage">
        {/* paint order (bottom→top) = orange, then yellow rises over it, then
            off-white rises over the yellow — so the DOM order matches */}
        <div id="stage-orange" className="stage-curtain" style={{ background: "#ff4d00" }} aria-hidden />
        <div id="stage-yellow" className="stage-curtain" style={{ background: "#f4c300" }} aria-hidden />
        <div id="stage-white" className="stage-curtain" style={{ background: "var(--bg)" }} aria-hidden />
        <div className="tour-canvas">
          <Canvas frameloop={frameloop} dpr={MOBILE ? [1, 2] : [1, 1.5]} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }}>
            <Suspense fallback={null}>
              <Scene />
            </Suspense>
            {SHOW_PERF && <Perf position="top-left" />}
          </Canvas>
        </div>
        <div className="tour-dom">
          <ScreenOverlays />
          <svg className="ptr-layer" aria-hidden>
            {CALLOUTS.map((c) => {
              // The connector reads against the stage behind it: light on the orange
              // beats, dark on the yellow/off-white ones (an ember line on orange or
              // yellow is invisible).
              const ink = ON_ORANGE.has(c.id) ? "rgba(255,255,255,.85)" : "rgba(26,26,26,.55)";
              return (
                <g key={c.id}>
                  <path id={`ptr-${c.id}`} stroke={ink} strokeWidth="2" opacity="0" strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  <circle id={`dot-${c.id}`} r="4.5" fill={ink} opacity="0" />
                </g>
              );
            })}
          </svg>
          {CALLOUTS.map((c) => <Card key={c.id} c={c} />)}
          {/* the decay curve now floats as its own small card above the iPad */}
          <div id="decay-float" aria-hidden><DecayCurve /></div>
          {/* timer above the laptop for the decay beat — one week from today */}
          <div id="decay-timer" aria-hidden>
            <span className="dt-day">Day 0</span>
            <span className="dt-date">{DECAY_DATES[0]}</span>
            <span className="dt-range">{DECAY_DATES[0]} – {DECAY_DATES[7]}</span>
          </div>
          {/* preload the 7-day arc-decay frames so the flipbook never flickers */}
          <div style={{ display: "none" }} aria-hidden>
            {DECAY_ARC_FRAMES.map((s) => <img key={s} src={s} alt="" />)}
          </div>
          <div id="laptop-intro">I use my own product — Scholar — to track student progress.</div>
          <Hero />
          <div id="end-hint">
            <span className="eyebrow">— and parents notice</span>
            <div className="caslon big">Keep scrolling for their words.</div>
          </div>
        </div>
        <Loader />
      </div>
    </section>
  );
}
