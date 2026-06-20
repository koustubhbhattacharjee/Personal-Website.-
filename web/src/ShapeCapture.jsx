import React from "react";
import { Canvas } from "@react-three/fiber";
import CaptureShapes from "./shapes";

/* Dev-only capture view (?cap=N): renders one recolour frame of the three mastery
   tiles on a light dashboard background so it can be screenshotted (cap-shapes.cjs)
   into the laptop/iPad flipbook. Capture at 1280×800 to match the mac screen 16:10. */
export default function ShapeCapture({ frame }) {
  return (
    <Canvas
      style={{ position: "fixed", inset: 0 }}
      camera={{ position: [0, 0.1, 6.5], fov: 35 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => gl.setClearColor("#f4f1ea", 1)}
    >
      <ambientLight intensity={1.15} />
      <directionalLight position={[2, 4, 6]} intensity={0.7} />
      <directionalLight position={[-3, -1, 4]} intensity={0.3} />
      <CaptureShapes frame={frame} />
    </Canvas>
  );
}
