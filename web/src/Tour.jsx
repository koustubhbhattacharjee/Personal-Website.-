import React, { Suspense, lazy, useLayoutEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { rig } from "./rig";
import { CALLOUTS } from "./tour-data";
import "./tour.css";

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
      <line x1="8" y1="84" x2="222" y2="84" stroke="var(--line)" strokeWidth="1" />
      <line x1="8" y1="84" x2="8" y2="6" stroke="var(--line)" strokeWidth="1" />
      <path
        id="decay-path"
        d="M10 14 C 50 16, 70 26, 100 44 S 170 72, 218 78"
        fill="none"
        stroke="var(--red)"
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset="1"
      />
      <circle id="decay-dot" cx="10" cy="14" r="4" fill="var(--red)" opacity="0" />
      <text x="12" y="94" fontSize="8" fill="var(--muted2)" fontFamily="Zilla Slab">day 0</text>
      <text x="196" y="94" fontSize="8" fill="var(--muted2)" fontFamily="Zilla Slab">day 14</text>
      <text x="14" y="12" fontSize="8" fill="var(--muted2)" fontFamily="Zilla Slab">mastery</text>
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

function Hero() {
  return (
    <div id="hero-block">
      <div className="hero-inner">
        <div className="hero-top">
          <img className="hero-photo" src="/assets/portrait-warm.jpg" alt="Koustubh Bhattacharjee" />
          <div className="hero-id">
            <span className="eyebrow">One&#8209;to&#8209;one tutoring · AP · SAT · Honors</span>
            <div className="hero-meta">
              <span><b>KIPP DC</b> physics teacher</span>
              <span><b>MS Physics</b> · UT Dallas</span>
              <span><b>MS Astrophysics</b> · IIST/ISRO</span>
            </div>
          </div>
        </div>
        <h1 className="caslon">
          Classroom rigour.<br />
          <span className="it">One&#8209;to&#8209;one focus.</span>
        </h1>
        <p className="hero-lede">
          I teach AP Physics and Math on software I built — <b>Scholar</b>. Scroll, and I'll show you how a lesson actually works.
        </p>
      </div>
      <div className="scroll-hint">scroll<span className="chev">⌄</span></div>
    </div>
  );
}

/* ── overlays that ride on top of the projected screens ────────────────── */

function ScreenOverlays() {
  return (
    <>
      <div id="ov-mac" className="screen-ov">
        {/* click pulse on the "Practice this question?" popup */}
        <div id="ripple" className="ripple" style={{ left: "36%", top: "64%" }} />
        {/* click pulse on the MCQ's correct option */}
        <div id="ripple2" className="ripple" style={{ left: "22%", top: "36%" }} />
        {/* glow over the re-tinted wedge after the correct answer */}
        <div id="hl-band" className="hl-band" style={{ left: "14%", top: "38%", width: "24%", height: "42%" }} />
      </div>
      <div id="ov-pad" className="screen-ov">
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

  /* 6–10.5: the lid twists open */
  tl.to(rig, { lid: 1, duration: 4.5, ease: "power2.inOut" }, 6);
  tl.to(rig, { camZ: 3.9, tgtY: 0.12, camY: 0.12, duration: 4, ease: "power1.inOut" }, 7);

  /* 11–17: callout 1 — what is Scholar */
  calloutIn("what", 11.4);
  tl.to(rig, { camZ: 3.65, duration: 4 }, 11.6);
  calloutOut("what", 16.2);

  /* 17–28: zoom to the solid, three shapes — long, overlapping morphs */
  tl.to(rig, { camZ: 1.45, camX: 0.25, tgtX: 0.22, tgtY: 0.0, duration: 4.5, ease: "power2.inOut" }, 17.2);
  calloutIn("shapes", 19.6);
  xfade("macDash", "macTorus", 20.6, 2.6);
  xfade("macTorus", "macBar", 24, 2.6);
  calloutOut("shapes", 26.6);
  xfade("macBar", "macDash", 26.8, 2.4);

  /* 28–35.5: drill 1 — the unit disk lifts out */
  tl.to(rig, { camX: 0.12, tgtX: 0.1, camY: 0.18, tgtY: 0.2, camZ: 2.15, duration: 3.2, ease: "power2.inOut" }, 28.4);
  xfade("macDash", "macUnit", 29.4);
  calloutIn("unit", 30.6);
  calloutOut("unit", 34.8);

  /* 35.5–42: drill 2 — ring (learning objective) */
  tl.to(rig, { camY: 0.1, tgtY: 0.12, camX: 0.1, tgtX: 0.09, duration: 2.5, ease: "power1.inOut" }, 35.7);
  xfade("macUnit", "macRing", 36.3);
  calloutIn("ring", 37.4);
  calloutOut("ring", 41.3);

  /* 42–48.5: drill 3 — question type */
  tl.to(rig, { camY: 0.04, tgtY: 0.05, duration: 2.5, ease: "power1.inOut" }, 42.2);
  xfade("macRing", "macQt", 42.8);
  calloutIn("qt", 43.9);
  calloutOut("qt", 47.8);

  /* 48.5–54: drill 4 — one question, the practice prompt pops up */
  tl.to(rig, { camZ: 2.45, duration: 2.2, ease: "power1.inOut" }, 48.7);
  xfade("macQt", "macQuestion", 49.3, 1.6);
  calloutIn("question", 50.2);
  ripple("#ripple", 52.4); // click "Open Practice →"
  calloutOut("question", 53.4);

  /* 54–62.5: practice room — MCQ answered correctly */
  tl.to(rig, { camX: 0.18, tgtX: 0.16, camY: 0.16, tgtY: 0.18, camZ: 2.9, duration: 2.8, ease: "power2.inOut" }, 53.8);
  xfade("macQuestion", "macMcq", 54.4);
  calloutIn("mcq", 55.8);
  ripple("#ripple2", 58.6); // click the right option
  xfade("macMcq", "macMcqSel", 59, 0.8);
  xfade("macMcqSel", "macMcqCorrect", 60.6, 1.2); // submit -> CORRECT
  calloutOut("mcq", 61.8);

  /* 62.5–68.5: back on the map — the wedge re-tints */
  tl.to(rig, { camX: 0.12, tgtX: 0.1, camY: 0.04, tgtY: 0.05, camZ: 2.2, duration: 2.8, ease: "power2.inOut" }, 62.4);
  xfade("macMcqCorrect", "macQtAfter", 63, 2.2);
  tl.fromTo("#hl-band", { autoAlpha: 0 }, { autoAlpha: 1, duration: 1 }, 65);
  tl.to("#hl-band", { autoAlpha: 0, duration: 1 }, 67);
  calloutIn("colour", 64.4);
  calloutOut("colour", 67.9);

  /* 68.5–76: decay — six weeks later, the colours fade */
  calloutIn("decay", 69);
  tl.fromTo("#decay-path", { attr: { "stroke-dashoffset": 1 } }, { attr: { "stroke-dashoffset": 0 }, duration: 5, ease: "none" }, 69.6);
  tl.fromTo("#decay-dot", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, 69.6);
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
  }, 69.6);
  xfade("macQtAfter", "macQtDecayed", 69.6, 3);
  // pull back out to the whole faded course
  tl.to(rig, { camZ: 3.7, camX: 0.05, tgtX: 0.04, camY: 0.1, tgtY: 0.1, duration: 3, ease: "power2.inOut" }, 72.6);
  xfade("macQtDecayed", "macDashDecayed", 73, 1.8);
  calloutOut("decay", 75.2);

  /* 76–80: MacBook swipes out left, iPad sweeps in */
  tl.to(rig, { camZ: 5.9, camX: 0, camY: 0, tgtX: 0, tgtY: 0, duration: 2.6, ease: "power2.inOut" }, 75.8);
  tl.to(rig, { macX: -9.5, macRotY: -0.45, duration: 3, ease: "power2.in" }, 77);
  tl.fromTo(rig, { padX: 9, padRotY: 0.4 }, { padX: 0, padRotY: 0, duration: 3.6, ease: "power3.out" }, 77.8);
  tl.to(rig, { camZ: 4.1, duration: 2.4 }, 78.6);

  /* 80–86.5: iPad — exit ticket */
  calloutIn("exit", 80.8);
  gsap.utils.toArray("#pad-draw .stk").forEach((p, i) => {
    tl.fromTo(p, { attr: { "stroke-dashoffset": 1 } },
      { attr: { "stroke-dashoffset": 0 }, duration: 3, ease: "none" }, 81.4 + i * 0.45);
  });
  tl.to("#pad-draw", { autoAlpha: 0, duration: 0.8 }, 84.6);
  tl.to(rig, { padQ1: 0, padQ2: 1, duration: 1.3, ease: "power1.inOut" }, 85);
  calloutOut("exit", 85.9);

  /* 86.5–89.5: iPad out, iPhone in */
  tl.to(rig, { padX: -9, padRotY: -0.45, duration: 2.8, ease: "power2.in" }, 86.6);
  tl.fromTo(rig, { phoneX: 9, phoneRotY: 0.4 }, { phoneX: 0, phoneRotY: 0, duration: 3.2, ease: "power3.out" }, 87.4);
  tl.to(rig, { camZ: 5.5, camY: -0.04, tgtY: -0.04, duration: 2.4 }, 87.8);

  /* 89.5–94: flashcards */
  calloutIn("cards", 90);
  tl.to(rig, { phoneCards: 0, phoneCardsBack: 1, duration: 1.2, ease: "power1.inOut" }, 91.8);
  calloutOut("cards", 93.4);

  /* 94–98: session log / check-in */
  tl.to(rig, { phoneCardsBack: 0, phoneCards: 0, phoneCheckin: 1, duration: 1.4, ease: "power1.inOut" }, 94);
  calloutIn("log", 94.8);
  calloutOut("log", 97.6);

  /* 98–100: iPhone leaves, hand off to the reviews section */
  tl.to(rig, { phoneX: -9, phoneRotY: -0.4, duration: 2.4, ease: "power2.in" }, 97.9);
  tl.to(".tour-canvas", { autoAlpha: 0, duration: 2 }, 98.4);
  tl.fromTo("#end-hint", { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 2.2, ease: "power2.out" }, 98.4);

  /* keep total length round */
  tl.set({}, {}, 100);
  if (import.meta.env.DEV) window.__tl = tl;
  return tl;
}

/* ── component ─────────────────────────────────────────────────────────── */

export default function Tour() {
  const sectionRef = useRef(null);

  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      buildTimeline(sectionRef.current);
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section className="tour" ref={sectionRef}>
      <div className="tour-stage">
        <div className="tour-canvas">
          <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }}>
            <Suspense fallback={null}>
              <Scene />
            </Suspense>
          </Canvas>
        </div>
        <div className="tour-dom">
          <ScreenOverlays />
          <svg className="ptr-layer" aria-hidden>
            {CALLOUTS.map((c) => (
              <g key={c.id}>
                <line id={`ptr-${c.id}`} stroke="var(--red)" strokeWidth="1.5" opacity="0" strokeDasharray="5 4" />
                <circle id={`dot-${c.id}`} r="4.5" fill="var(--red)" opacity="0" />
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
      </div>
    </section>
  );
}
