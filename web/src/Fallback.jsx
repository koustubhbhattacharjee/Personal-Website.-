import React from "react";
import { CALLOUTS, SHOTS } from "./tour-data";
import "./tour.css";

const SHOT_FOR = {
  what: { src: SHOTS.macDash, kind: "mac" },
  shapes: { src: SHOTS.macTorus, kind: "mac" },
  unit: { src: SHOTS.macUnit, kind: "mac" },
  ring: { src: SHOTS.macRing, kind: "mac" },
  qt: { src: SHOTS.macQt, kind: "mac" },
  question: { src: SHOTS.macQuestion, kind: "mac" },
  mcq: { src: SHOTS.macMcqCorrect, kind: "mac" },
  colour: { src: SHOTS.macQtAfter, kind: "mac" },
  decay: { src: SHOTS.macQtDecayed, kind: "mac" },
  exit: { src: SHOTS.padQ1, kind: "pad" },
  cards: { src: SHOTS.phoneCards, kind: "phone" },
  log: { src: SHOTS.phoneCheckin, kind: "phone" },
};

export default function Fallback() {
  return (
    <div className="tour-fallback">
      <div className="fb-hero">
        <h1 className="hero-greet caslon">Hi, I'm Koustubh.</h1>
        <p className="hero-creds">
          MS Physics (UT Dallas)<span className="sep">|</span>
          MS Astronomy (IIST)<span className="sep">|</span>
          B.Tech, ECE (NIT Silchar)
        </p>
        <p className="hero-desc">
          I was the lead physics teacher at <b>KIPP DC College Prep</b> in Washington, DC, USA, and I tutor physics and math. I use my own product, <b>Scholar</b>, to track student progress.
        </p>
      </div>
      {CALLOUTS.map((c, i) => (
        <div className={`fb-beat ${i % 2 ? "flip" : ""}`} key={c.id}>
          <div className={`fb-shot ${SHOT_FOR[c.id].kind}`}>
            <img src={SHOT_FOR[c.id].src} alt={c.title} loading="lazy" />
          </div>
          <div className="fb-card">
            <div className="kicker">{c.kicker}</div>
            <h3 className="caslon">{c.title}</h3>
            <p>{c.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
