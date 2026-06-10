import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import Fallback from "./Fallback";

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

createRoot(document.getElementById("tour-root")).render(
  useFallback ? (
    <Fallback />
  ) : (
    <Suspense fallback={<div style={{ height: "100vh" }} />}>
      <Tour />
    </Suspense>
  )
);
