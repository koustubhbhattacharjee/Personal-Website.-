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
        <img className="hero-photo" src="/assets/portrait-warm.jpg" alt="Koustubh Bhattacharjee" style={{ border: "1px solid var(--red)" }} />
        <h1 className="caslon">Classroom rigour.<br /><span className="it">One&#8209;to&#8209;one focus.</span></h1>
        <p style={{ color: "var(--muted)", maxWidth: 480, fontSize: 15.5 }}>
          I teach AP Physics and Math on software I built — <b style={{ color: "var(--off)" }}>Scholar</b>.
          Here's how a lesson actually works, on any device your student picks up.
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
