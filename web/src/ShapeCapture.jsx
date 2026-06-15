import React from "react";
import { Canvas } from "@react-three/fiber";
import CaptureShapes from "./shapes";

/* Dev-only capture view (?cap=N): renders one recolour frame on the dark screen
   background so it can be screenshotted into the iPad flipbook. */
export default function ShapeCapture({ frame }) {
  return (
    <Canvas
      style={{ position: "fixed", inset: 0 }}
      camera={{ position: [0, 0, 3], fov: 35 }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => gl.setClearColor("#141210", 1)}
    >
      <ambientLight intensity={1.35} />
      <directionalLight position={[2, 4, 6]} intensity={0.6} />
      <directionalLight position={[-3, -1, 4]} intensity={0.25} />
      <CaptureShapes frame={frame} />
    </Canvas>
  );
}
