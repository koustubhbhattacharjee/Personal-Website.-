import React, { Suspense, lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Perf } from "r3f-perf";
import { useProgress } from "@react-three/drei";
import { rig } from "./rig";
import { CALLOUTS } from "./tour-data";
import "./tour.css";

// opt-in perf HUD: add ?perf to the URL to see FPS / draw calls / GPU memory
const SHOW_PERF = typeof location !== "undefined" && location.search.includes("perf");

gsap.registerPlugin(ScrollTrigger);

const Scene = lazy(() => import("./Scene"));

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
      <path
        id="decay-path"
        d="M10 14 C 50 16, 70 26, 100 44 S 170 72, 218 78"
        fill="none"
        stroke="#b33600"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset="1"
      />
      <circle id="decay-dot" cx="10" cy="14" r="4" fill="#b33600" opacity="0" />
      <text x="12" y="94" fontSize="8" fill="rgba(26,26,26,.6)" fontFamily="Inter">day 0</text>
      <text x="196" y="94" fontSize="8" fill="rgba(26,26,26,.6)" fontFamily="Inter">day 14</text>
      <text x="14" y="12" fontSize="8" fill="rgba(26,26,26,.6)" fontFamily="Inter">mastery</text>
    </svg>
  );
}

function Card({ c }) {
  return (
    <div id={`card-${c.id}`} className={`callout ${c.side}`} style={{ opacity: 0 }}>
      <div className="kicker">{c.kicker}</div>
      <GlitchTitle text={c.title} />
      <p>{c.body}</p>
      {c.curve && <DecayCurve />}
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
        <img className="hero-photo" src="/assets/portrait-warm.jpg" alt="Koustubh Bhattacharjee" />
        <p className="hero-desc">
          Hi, I'm Koustubh — a former lead high&#8209;school physics teacher in Washington, DC, US. I teach physics and math for high school and specialize in AP courses. I use my own product, <b>Scholar</b>, to structure my lessons. Scroll to learn more.
        </p>
      </div>
      <div className="scroll-hint"><span className="label">scroll</span><span className="chev">⌄</span></div>
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
      <div id="ov-phone" className="screen-ov" />
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
      scrub: 0.7,
    },
  });

  const sideOf = (id) => CALLOUTS.find((c) => c.id === id).side;

  const calloutIn = (id, at, dur = 2.2) => {
    const side = sideOf(id);
    tl.fromTo(`#card-${id}`, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur * 0.25, ease: "steps(3)" }, at);
    tl.fromTo(
      `#card-${id}`,
      { x: side === "left" ? -26 : 26, clipPath: "inset(42% 0% 42% 0%)" },
      { x: 0, clipPath: "inset(0% 0% 0% 0%)", duration: dur * 0.45, ease: "power3.out" },
      at
    );
    tl.fromTo(
      `#card-${id} .g1`,
      { x: -7, autoAlpha: 0.85 },
      { keyframes: [{ x: 5, duration: dur * 0.08 }, { x: -3, duration: dur * 0.08 }, { x: 0, autoAlpha: 0, duration: dur * 0.14 }] },
      at + dur * 0.08
    );
    tl.fromTo(
      `#card-${id} .g2`,
      { x: 7, autoAlpha: 0.85 },
      { keyframes: [{ x: -5, duration: dur * 0.08 }, { x: 3, duration: dur * 0.08 }, { x: 0, autoAlpha: 0, duration: dur * 0.14 }] },
      at + dur * 0.08
    );
    tl.fromTo(`#ptr-${id}`, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur * 0.3 }, at + dur * 0.3);
    tl.fromTo(`#dot-${id}`, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur * 0.2 }, at + dur * 0.3);
  };
  const calloutOut = (id, at, dur = 1.4) => {
    tl.to(`#card-${id}`, { autoAlpha: 0, x: sideOf(id) === "left" ? -14 : 14, duration: dur, ease: "power2.in" }, at);
    tl.to([`#ptr-${id}`, `#dot-${id}`], { autoAlpha: 0, duration: dur * 0.6 }, at);
  };

  // screen-content crossfade between two mac layers
  const xfade = (from, to, at, dur = 1.8) => {
    tl.to(rig, { [from]: 0, duration: dur, ease: "power1.inOut" }, at);
    tl.to(rig, { [to]: 1, duration: dur, ease: "power1.inOut" }, at);
  };
  const ripple = (sel, at) =>
    tl.fromTo(sel, { scale: 0.2, autoAlpha: 0 },
      { keyframes: [{ scale: 0.6, autoAlpha: 0.9, duration: 0.7 }, { scale: 1.6, autoAlpha: 0, duration: 1 }] }, at);

  /* 0–6: hero hands off, MacBook rises */
  tl.to("#hero-block .hero-inner", { y: -120, autoAlpha: 0, duration: 4.6, ease: "power1.in" }, 0.8);
  tl.to(".scroll-hint", { autoAlpha: 0, duration: 1.5 }, 0.8);
  tl.to(rig, { macY: 0.1, duration: 6.4, ease: "power2.out" }, 0.4);
  tl.to(rig, { camZ: 4.6, duration: 6.4, ease: "power1.inOut" }, 0.4);

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
    const yO = clamp((cOrange.p.y / 100) * vh); // orange curtain top edge
    const yW = clamp((cWhite.p.y / 100) * vh);  // off-white curtain top edge
    clone.style.clipPath = `inset(${yO}px 0 ${navH - yW}px 0)`;
  };
  const cOrange = makeWipe("stage-orange", paintNav);
  const cWhite = makeWipe("stage-white", paintNav);
  const cYellow = makeWipe("stage-yellow");

  /* orange floods up as the MacBook rises/opens — full by lid-open (~10.5) */
  tl.to(cOrange.p, { y: 0, duration: 9.3, ease: "power2.out", onUpdate: cOrange.paint }, 1.2);

  /* 6–10.5: the lid twists open */
  tl.to(rig, { lid: 1, duration: 4.5, ease: "power2.inOut" }, 6);
  tl.to(rig, { camZ: 3.9, tgtY: 0.12, camY: 0.12, duration: 4, ease: "power1.inOut" }, 7);

  /* 11–17: callout 1 — what is Scholar */
  calloutIn("what", 11.4);
  tl.to(rig, { camZ: 3.65, duration: 4 }, 11.6);
  calloutOut("what", 16.2);

  /* 17–23: zoom into the subject stack — frame the shape area wide enough that
     the accumulating shapes stay in view through the whole drill */
  tl.to(rig, { camZ: 2.75, camX: 0.13, tgtX: 0.11, camY: 0.04, tgtY: 0.05, duration: 5, ease: "power2.inOut" }, 17.2);
  // focus: darken the surrounding laptop UI through the drill-down and the card
  tl.to("#drill-focus", { autoAlpha: 1, duration: 2.5 }, 20.5);

  /* 24–30: quick drill-down — zip through the accumulating shapes, no cards.
     cylinder -> +disk -> +ring -> +arc -> +small arc */
  xfade("macDash", "macUnit", 24.0, 0.9);
  xfade("macUnit", "macRing", 25.6, 0.9);
  xfade("macRing", "macQt", 27.2, 0.9);
  xfade("macQt", "macQuestion", 28.8, 0.9);
  // gentle settle on the finished stack while the card reads
  tl.to(rig, { camZ: 2.6, duration: 20, ease: "power1.inOut" }, 30);

  /* 33–41: the single explanatory card, shown only once the build finishes */
  calloutIn("shapes", 33);
  ripple("#ripple", 39.6); // click "Open Practice →" on the laptop
  calloutOut("shapes", 40.6);
  tl.to("#drill-focus", { autoAlpha: 0, duration: 2 }, 40.6);

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

  /* 42–49: HANDOFF 1 — laptop hands the rest of the lesson to the iPad
     (orange band on top, yellow rising). */
  // settle dead-on (tgtY=camY=0) and raise the laptop into the top band
  tl.to(rig, { camZ: 4.2, camX: 0, camY: 0, tgtX: 0, tgtY: 0, tgtZ: 0, macY: 0.22, duration: 2.4, ease: "power2.inOut" }, 42);
  tl.set(rig, { padMcq: 1 }, 44.2); // iPad arrives already showing the practice room
  handoff({ at: 44.6, out: "mac", inn: "pad", rising: cYellow, inParkY: -0.3 });
  // recentre the iPad and frame it for the content beats
  tl.to(rig, { padY: 0, camZ: 2.95, camX: 0, tgtX: 0, camY: 0, tgtY: 0, duration: 1.6, ease: "power2.inOut" }, 49.3);

  /* 51–57: practice room (now on the iPad) — MCQ answered correctly */
  calloutIn("mcq", 51);
  ripple("#ripple2", 53.8); // click the right option
  xfade("padMcq", "padMcqSel", 54.2, 0.8);
  xfade("padMcqSel", "padMcqCorrect", 55.6, 1.2); // submit -> CORRECT
  calloutOut("mcq", 56.8);

  /* 57–63: the wedge re-tints on the iPad's map */
  xfade("padMcqCorrect", "padQtAfter", 57.4, 2.0);
  tl.fromTo("#hl-band", { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 }, 59);
  tl.to("#hl-band", { autoAlpha: 0, duration: 1 }, 61);
  calloutIn("colour", 58.2);
  calloutOut("colour", 61.6);

  /* 63–70: decay — weeks later, the colours fade */
  calloutIn("decay", 63);
  tl.fromTo("#decay-path", { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: 5, ease: "none" }, 63.6);
  tl.fromTo("#decay-dot", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 63.6);
  const dotProxy = { t: 0 };
  tl.to(dotProxy, {
    t: 1, duration: 5, ease: "none",
    onUpdate: () => {
      const path = document.getElementById("decay-path");
      const dot = document.getElementById("decay-dot");
      if (!path || !dot) return;
      const L = path.getTotalLength();
      const p = path.getPointAtLength(dotProxy.t * L);
      dot.setAttribute("cx", p.x);
      dot.setAttribute("cy", p.y);
    },
  }, 63.6);
  xfade("padQtAfter", "padQtDecayed", 63.6, 3);
  // pull back to the whole faded course
  tl.to(rig, { camZ: 3.3, duration: 3, ease: "power2.inOut" }, 66.4);
  xfade("padQtDecayed", "padDashDecayed", 66.8, 1.8);
  calloutOut("decay", 69.4);

  /* 70–77: exit ticket on the iPad — timed, worked by hand on the scratchpad */
  tl.to(rig, { camZ: 2.95, duration: 1.6, ease: "power2.inOut" }, 69.6);
  xfade("padDashDecayed", "padExit1", 70, 1.2);
  calloutIn("exit", 71);
  gsap.utils.toArray("#pad-draw .stk").forEach((p, i) => {
    tl.fromTo(p, { attr: { "stroke-dashoffset": 1 } },
      { attr: { "stroke-dashoffset": 0 }, duration: 3, ease: "none" }, 71.8 + i * 0.4);
  });
  tl.to("#pad-draw", { autoAlpha: 0, duration: 0.8 }, 75.4);
  xfade("padExit1", "padExit2", 75.8, 1.3);
  calloutOut("exit", 76.8);

  /* 78–84: HANDOFF 2 — iPad hands off to the iPhone. Same transition; this time
     the off-white floods up and removes the yellow. */
  // settle dead-on and raise the iPad into the top band
  tl.to(rig, { camZ: 4.4, camX: 0, camY: 0, tgtX: 0, tgtY: 0, tgtZ: 0, padY: 0.3, duration: 2.0, ease: "power2.inOut" }, 77.2);
  tl.set(rig, { phoneCards: 1 }, 78.6); // iPhone arrives showing the flashcard deck
  handoff({ at: 79, out: "pad", inn: "phone", rising: cWhite, inParkY: -0.42 });
  // recentre the iPhone and frame it larger (it reads small from far back)
  tl.to(rig, { phoneY: -0.04, camZ: 3.6, camY: -0.04, tgtY: -0.04, duration: 1.6, ease: "power2.inOut" }, 83.7);

  /* 85–89: flashcards */
  calloutIn("cards", 85.4);
  tl.to(rig, { phoneCards: 0, phoneCardsBack: 1, duration: 1.2, ease: "power1.inOut" }, 87.2);
  calloutOut("cards", 88.8);

  /* 89–94: session log / check-in */
  tl.to(rig, { phoneCardsBack: 0, phoneCheckin: 1, duration: 1.4, ease: "power1.inOut" }, 89.6);
  calloutIn("log", 90.6);
  calloutOut("log", 93.6);

  /* 95–100: iPhone zips off; the background is already off-white, hand off to reviews */
  tl.to(rig, { phoneX: -9, phoneRotY: -0.45, duration: 1.6, ease: "power3.in" }, 95);
  tl.to(".tour-canvas", { autoAlpha: 0, duration: 2 }, 95.6);
  tl.fromTo("#end-hint", { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 2.2, ease: "power2.out" }, 95.8);

  /* keep total length round */
  tl.set({}, {}, 100);
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
          <Canvas frameloop={frameloop} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }}>
            <Suspense fallback={null}>
              <Scene />
            </Suspense>
            {SHOW_PERF && <Perf position="top-left" />}
          </Canvas>
        </div>
        <div className="tour-dom">
          <div id="drill-focus" aria-hidden />
          <ScreenOverlays />
          <svg className="ptr-layer" aria-hidden>
            {CALLOUTS.map((c) => (
              <g key={c.id}>
                <path id={`ptr-${c.id}`} stroke="var(--ember)" strokeWidth="2" opacity="0" strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <circle id={`dot-${c.id}`} r="4.5" fill="var(--ember)" opacity="0" />
              </g>
            ))}
          </svg>
          {CALLOUTS.map((c) => <Card key={c.id} c={c} />)}
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
