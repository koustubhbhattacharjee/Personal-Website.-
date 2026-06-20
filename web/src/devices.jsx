import React, { useEffect, useMemo, useRef } from "react";
import { RoundedBox, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SCREENS } from "./rig";

const MAC_GLB = "/models/mac-draco.glb";
const DRACO_PATH = "/draco/";

// On phones the iPad is shown nearly full-bleed during the decay beat, with dead
// space below it, so it gets an extra size bump on top of the global mobile zoom.
const MOBILE = typeof window !== "undefined" && window.matchMedia("(max-width: 880px)").matches;
const PAD_SCALE = MOBILE ? 0.48 : 0.36;

const ALU_DARK = "#c8c4bd";
const GLASS = "#14120f";

/* A rounded-rectangle plane (centred, facing +z) with UVs remapped to [0,1] so
   a screenshot maps across it with the corners clipped — used to round the
   phone's display + bezel to match the device's corner radius. */
function roundedPlane(w, h, r, seg = 8) {
  r = Math.min(r, w / 2, h / 2);
  const x = -w / 2, y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ShapeGeometry(s, seg);
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = (p.getX(i) - x) / w;
    uv[i * 2 + 1] = (p.getY(i) - y) / h;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/* A stack of screenshot layers on one plane. Layer opacities are driven by
   the rig each frame (Scene.jsx), here we just build the meshes. */
export function ScreenStack({ device, layers, screenRef, layerRefs, cornerRadius = 0, flipRef }) {
  const { w, h } = SCREENS[device];
  const screenGeom = useMemo(
    () => (cornerRadius > 0 ? roundedPlane(w, h, cornerRadius) : null),
    [w, h, cornerRadius]
  );
  const bezelGeom = useMemo(
    () => (cornerRadius > 0 ? roundedPlane(w + 0.1, h + 0.1, cornerRadius + 0.05) : null),
    [w, h, cornerRadius]
  );
  // custom ShapeGeometries aren't auto-disposed (they're attached via <primitive>)
  useEffect(() => () => { screenGeom?.dispose(); bezelGeom?.dispose(); }, [screenGeom, bezelGeom]);
  // the MacBook keeps only a hairline bezel (its thick dark frame read as a
  // drop shadow); the iPad/phone keep a real device bezel
  const bez = device === "mac" ? 0.012 : 0.1;
  return (
    <group>
      {/* glass bezel */}
      <mesh position={[0, 0, 0]}>
        {bezelGeom ? <primitive object={bezelGeom} attach="geometry" /> : <planeGeometry args={[w + bez, h + bez]} />}
        <meshBasicMaterial color={GLASS} />
      </mesh>
      {/* the tracked screen plane (invisible, used for projection) */}
      <mesh ref={screenRef} position={[0, 0, 0.004]} visible={false}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial />
      </mesh>
      {layers.map((tex, i) => (
        <mesh
          key={i}
          ref={(m) => { if (m) layerRefs.current[i] = m; }}
          position={[0, 0, 0.006 + i * 0.0022]}
          renderOrder={10 + i}
        >
          {screenGeom ? <primitive object={screenGeom} attach="geometry" /> : <planeGeometry args={[w, h]} />}
          {/* double-sided so the screenshot stays on the screen as the device spins
              through edge-on in a handoff, instead of flashing through to the stage */}
          <meshBasicMaterial map={tex} transparent opacity={i === 0 ? 1 : 0} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* mastery-recolour flipbook overlay (Scene.jsx swaps the map + opacity).
          Fills the screen; the captured frames are 16:10 (exact on the mac, a tiny
          imperceptible stretch on the iPad — better than dark letterbox bands). */}
      {flipRef && (
        <mesh
          ref={flipRef}
          position={[0, 0, 0.006 + layers.length * 0.0022 + 0.004]}
          renderOrder={10 + layers.length + 5}
          visible={false}
        >
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial transparent opacity={0} toneMapped={false} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/* MacBook: photographic glTF model (the pmndrs "mac-draco" MacBook Pro,
   CC-licensed, from the drei laptop demo). The `screenflip` node is the lid;
   Scene.jsx drives lidRef.rotation.x (PI/2 = closed, slight negative = open).
   Our ScreenStack rides on the lid, aligned to the model's display face. */
export function MacBook({ groupRef, lidRef, screenRef, layerRefs, layers, flipRef }) {
  const { nodes, materials } = useGLTF(MAC_GLB, DRACO_PATH);

  const { lid, rest, stack, scale } = useMemo(() => {
    const lidNode = nodes.screenflip;
    // the display face is the primitive using the "screen.001" material
    let face = null;
    lidNode.traverse((n) => {
      if (n.isMesh && n.material === materials["screen.001"]) face = n;
    });
    face.geometry.computeBoundingBox();

    // display rect in the lid node's local space (so the stack rides the lid)
    const toLid = new THREE.Matrix4();
    for (let n = face; n && n !== lidNode; n = n.parent) {
      n.updateMatrix();
      toLid.premultiply(n.matrix);
    }
    // the model ships a baked code-editor screenshot on the display face; it
    // bleeds through our layers mid-crossfade, so hide it entirely
    face.visible = false;

    const bb = face.geometry.boundingBox.clone().applyMatrix4(toLid);
    const size = bb.getSize(new THREE.Vector3());
    const center = bb.getCenter(new THREE.Vector3());
    center.z += 0.03; // sit just proud of the bezel to avoid z-fighting

    // orient an XY plane onto the display rect (shortest bbox axis = normal)
    const dims = [
      { axis: "x", v: size.x },
      { axis: "y", v: size.y },
      { axis: "z", v: size.z },
    ].sort((a, b) => b.v - a.v);
    const rot = new THREE.Euler(
      dims[2].axis === "y" ? -Math.PI / 2 : 0,
      dims[2].axis === "x" ? Math.PI / 2 : 0,
      0
    );

    if (import.meta.env.DEV) {
      console.log(
        "[mac-glb] rect", dims.map((d) => `${d.axis}:${d.v.toFixed(3)}`).join(" "),
        "center", center.toArray().map((v) => v.toFixed(3)),
        "lidRot", lidNode.rotation.toArray().slice(0, 3).map((v) => Number(v).toFixed(3))
      );
    }

    return {
      lid: lidNode,
      rest: ["keyboard", "base", "touchbar"].map((k) => nodes[k]).filter(Boolean),
      stack: {
        center,
        rot,
        sw: dims[0].v / SCREENS.mac.w,
        sh: dims[1].v / SCREENS.mac.h,
      },
      scale: SCREENS.mac.w / dims[0].v, // world scale: display width -> 3.3 units
    };
  }, [nodes, materials]);

  return (
    <group ref={groupRef}>
      {/* MacBook at 36% of the original model; offset keeps the screen centred
          at (0, 0.15, -0.6) so the existing camera choreography still frames it
          (offY = 0.15 - 1.2*f, offZ = -0.6 + 0.06*f, f = 0.36) */}
      <group scale={scale * 0.36} position={[0, -0.282, -0.5784]}>
        {/* the lid; Scene.jsx drives its rotation.x through lidRef */}
        <primitive ref={lidRef} object={lid}>
          {/* screenshot stack glued onto the display face */}
          <group position={stack.center} rotation={stack.rot} scale={[stack.sw, stack.sh, 1]}>
            <ScreenStack
              device="mac"
              layers={layers}
              screenRef={screenRef}
              layerRefs={layerRefs}
              flipRef={flipRef}
            />
          </group>
        </primitive>
        {rest.map((n) => (
          <primitive key={n.uuid} object={n} />
        ))}
      </group>
    </group>
  );
}

useGLTF.preload(MAC_GLB, DRACO_PATH);

/* iPad: floating landscape slab */
export function Pad({ groupRef, screenRef, layerRefs, layers, flipRef }) {
  const S = SCREENS.pad;
  const bw = S.w + 0.18, bh = S.h + 0.18;
  return (
    <group ref={groupRef} scale={PAD_SCALE}>
      {/* iPad Pro 12.9" — space black */}
      <RoundedBox args={[bw, bh, 0.075]} radius={0.05} smoothness={3}>
        <meshStandardMaterial color={"#1b1b1d"} roughness={0.48} metalness={0.6} />
      </RoundedBox>
      <group position={[0, 0, 0.042]}>
        <ScreenStack device="pad" layers={layers} screenRef={screenRef} layerRefs={layerRefs} flipRef={flipRef} />
      </group>
      {/* Apple Pencil, magnetically stuck along the top edge */}
      <group position={[0, bh / 2 + 0.022, 0.004]} rotation={[0, 0, Math.PI / 2]}>
        <mesh>
          <cylinderGeometry args={[0.028, 0.028, 1.35, 24]} />
          <meshStandardMaterial color={"#f4f3f0"} roughness={0.55} metalness={0.05} />
        </mesh>
        {/* matte writing tip */}
        <mesh position={[0, 0.735, 0]}>
          <coneGeometry args={[0.028, 0.12, 24]} />
          <meshStandardMaterial color={"#d9d7d2"} roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

/* iPhone: floating portrait slab */
export function Phone({ groupRef, screenRef, layerRefs, layers }) {
  const S = SCREENS.phone;
  // iPhone 16 Pro: 62pt display corner radius on a 390pt-wide screen
  const screenRadius = 62 * (S.w / 390);            // ≈ 0.173 world units
  const bodyRadius = screenRadius + 0.06;           // concentric with the bezel
  return (
    <group ref={groupRef} scale={0.36}>
      <RoundedBox args={[S.w + 0.12, S.h + 0.12, 0.07]} radius={bodyRadius} smoothness={6}>
        <meshStandardMaterial color={"#cfccc6"} roughness={0.55} metalness={0.3} />
      </RoundedBox>
      <group position={[0, 0, 0.04]}>
        <ScreenStack device="phone" layers={layers} screenRef={screenRef} layerRefs={layerRefs} cornerRadius={screenRadius} />
      </group>
      {/* dynamic island hint */}
      <mesh position={[0, SCREENS.phone.h / 2 - 0.085, 0.085]} renderOrder={30}>
        <planeGeometry args={[0.26, 0.055]} />
        <meshBasicMaterial color={GLASS} />
      </mesh>
    </group>
  );
}
