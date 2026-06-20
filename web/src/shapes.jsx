import React from "react";
import * as THREE from "three";
import { SHAPE_FRAMES } from "./tour-data";

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

// Roll-up schedule: a question's colour builds first, then its unit, then the
// whole subject — so over the flipbook the three shapes light up left-to-right.
// p is overall progress (0..1); played backward this same schedule reads as decay.
function cascade(p) {
  const w = (s, e) => Math.min(1, Math.max(0, (p - s) / (e - s)));
  return {
    arc: w(0.0, 0.45),  // a question
    disc: w(0.2, 0.75), // a unit
    cyl: w(0.45, 1.0),  // the subject
  };
}

// The three dashboard tiles, sitting in a row on the laptop's mastery panel.
const TILES = [
  { key: "arc", x: -2.05, label: "Question" },
  { key: "disc", x: 0.0, label: "Unit" },
  { key: "cyl", x: 2.05, label: "Subject" },
];

/* Renders the three constituent shapes — an arc (a question), a disc (a unit) and
   a cylinder (the subject) — side by side as dashboard tiles, each recoloured by
   the roll-up schedule at `frame` (0..SHAPE_FRAMES-1). Each frame is screenshotted
   (cap-shapes.cjs via the /?cap=N route) into a flipbook that plays on the laptop
   screen as mastery builds, and backward on the iPad as it decays. */
export default function CaptureShapes({ frame = 0 }) {
  const m = cascade(frame / (SHAPE_FRAMES - 1));
  const mat = (mv) => {
    const c = mColor(mv);
    return (
      <meshStandardMaterial
        color={c}
        emissive={c.clone().multiplyScalar(0.18)}
        roughness={0.34}
        metalness={0.04}
        side={THREE.DoubleSide}
      />
    );
  };
  const tileMat = (
    <meshStandardMaterial color="#fbf8f1" roughness={0.95} metalness={0} />
  );
  return (
    <group>
      {TILES.map((t) => (
        <group key={t.key} position={[t.x, 0.15, 0]}>
          {/* dashboard tile card */}
          <mesh position={[0, -0.05, -0.6]} rotation={[0, 0, 0]}>
            <planeGeometry args={[1.74, 2.0]} />
            {tileMat}
          </mesh>
          {/* the shape, gently tilted toward the camera */}
          <group rotation={[-0.5, 0.5, 0.08]} scale={1.05}>
            {t.key === "arc" && (
              <mesh>
                <torusGeometry args={[0.46, 0.12, 20, 48, Math.PI * 1.3]} />
                {mat(m.arc)}
              </mesh>
            )}
            {t.key === "disc" && (
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.58, 0.58, 0.14, 64]} />
                {mat(m.disc)}
              </mesh>
            )}
            {t.key === "cyl" && (
              <mesh rotation={[Math.PI / 2.4, 0, 0]}>
                <cylinderGeometry args={[0.42, 0.42, 0.9, 48]} />
                {mat(m.cyl)}
              </mesh>
            )}
          </group>
        </group>
      ))}
    </group>
  );
}
