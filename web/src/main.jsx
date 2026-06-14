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

const small = window.matchMedia("(max-width: 880px)").matches;
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const useFallback = small || reduced || !supportsWebGL();

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

createRoot(document.getElementById("tour-root")).render(
  useFallback ? (
    <Fallback />
  ) : (
    <Suspense fallback={<div style={{ height: "100vh" }} />}>
      <Tour />
    </Suspense>
  )
);
