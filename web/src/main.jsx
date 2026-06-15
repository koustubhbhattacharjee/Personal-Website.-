import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Fallback from "./Fallback";

gsap.registerPlugin(ScrollTrigger);

const Tour = lazy(() => import("./Tour"));

function supportsWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const root = createRoot(document.getElementById("tour-root"));

// Dev-only flipbook capture: /?cap=N renders one recolour frame, nothing else.
const capMatch = typeof location !== "undefined" && location.search.match(/[?&]cap=(\d+)/);

if (capMatch) {
  // strip all page chrome so the frame is just the shapes on the dark screen bg
  document.documentElement.style.background = "#141210";
  document.body.style.background = "#141210";
  document.querySelectorAll("nav, section, footer, #nav-orange").forEach((e) => {
    e.style.display = "none";
  });
  const ShapeCapture = lazy(() => import("./ShapeCapture"));
  root.render(
    <Suspense fallback={null}>
      <ShapeCapture frame={parseInt(capMatch[1], 10)} />
    </Suspense>
  );
} else {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Phones now get the real 3D walkthrough too (re-framed for portrait in
  // Scene.jsx + tour.css). The static fallback is kept only where the scrubbed
  // timeline genuinely can't run: reduced-motion users and devices without WebGL.
  const useFallback = reduced || !supportsWebGL();

  // Buttery smooth scrolling, driven through GSAP's ticker so the scroll-scrubbed
  // walkthrough stays perfectly in sync with the scroll position.
  if (!reduced) {
    const lenis = new Lenis();
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    // anchor links (nav, CTAs) scroll smoothly through Lenis instead of jumping
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href");
        if (href.length > 1) { e.preventDefault(); lenis.scrollTo(href); }
      });
    });
    if (import.meta.env.DEV) window.__lenis = lenis;
  }

  root.render(
    useFallback ? (
      <Fallback />
    ) : (
      <Suspense fallback={<div style={{ height: "100vh" }} />}>
        <Tour />
      </Suspense>
    )
  );
}
