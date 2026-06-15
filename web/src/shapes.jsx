import React from "react";
import * as THREE from "three";

// mastery (0..1) → colour: low red → mid amber → high green
const STOPS = [
  new THREE.Color("#d4452f"),
  new THREE.Color("#e3b321"),
  new THREE.Color("#3fa86a"),
];
function mColor(m) {
  const t = Math.min(1, Math.max(0, m)) * 2;
  const i = Math.min(1, Math.floor(t));
  return STOPS[i].clone().lerp(STOPS[i + 1], t - i);
}

export const SHAPE_FRAMES = 24;

// roll-up schedule: each level's mastery vs overall progress p (0..1)
function cascade(p) {
  const w = (s, e) => Math.min(1, Math.max(0, (p - s) / (e - s)));
  return {
    arc: w(0.0, 0.34),     // question
    bigArc: w(0.12, 0.5),  // question type
    ring: w(0.26, 0.64),   // learning objective
    disk: w(0.44, 0.8),    // unit
    cyl: w(0.6, 1.0),      // subject
  };
}

/* Static render of the five nested levels — arc (question), bigger arc (question
   type), ring (learning objective), disk (unit), cylinder (subject) — at recolour
   `frame` (0..SHAPE_FRAMES-1). Each frame is screenshotted (scripts/capture-shapes)
   into a flipbook that plays on the iPad screen during the Practice Room. */
export default function CaptureShapes({ frame = 0 }) {
  const m = cascade(frame / (SHAPE_FRAMES - 1));
  const mat = (mv) => {
    const c = mColor(mv);
    return (
      <meshStandardMaterial
        color={c}
        emissive={c.clone().multiplyScalar(0.22)}
        roughness={0.32}
        metalness={0.04}
        side={THREE.DoubleSide}
      />
    );
  };
  return (
    <group rotation={[-0.58, 0.42, 0.1]} scale={1.05}>
      <mesh><ringGeometry args={[0.08, 0.2, 48, 1, -0.55, 1.1]} />{mat(m.arc)}</mesh>
      <mesh><ringGeometry args={[0.22, 0.35, 48, 1, -1.1, 2.2]} />{mat(m.bigArc)}</mesh>
      <mesh><ringGeometry args={[0.37, 0.5, 64]} />{mat(m.ring)}</mesh>
      <mesh><ringGeometry args={[0.52, 0.66, 64]} />{mat(m.disk)}</mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.74, 0.74, 0.26, 64, 1, true]} />{mat(m.cyl)}
      </mesh>
    </group>
  );
}
