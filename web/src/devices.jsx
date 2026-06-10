import React, { useMemo, useRef } from "react";
import { RoundedBox, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SCREENS } from "./rig";

const MAC_GLB = "/models/mac-draco.glb";
const DRACO_PATH = "/draco/";

const ALU = "#dcd9d3";
const ALU_DARK = "#c8c4bd";
const GLASS = "#14120f";

/* A stack of screenshot layers on one plane. Layer opacities are driven by
   the rig each frame (Scene.jsx), here we just build the meshes. */
export function ScreenStack({ device, layers, screenRef, layerRefs }) {
  const { w, h } = SCREENS[device];
  return (
    <group>
      {/* glass bezel */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[w + 0.1, h + 0.1]} />
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
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial map={tex} transparent opacity={i === 0 ? 1 : 0} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/* MacBook: photographic glTF model (the pmndrs "mac-draco" MacBook Pro,
   CC-licensed, from the drei laptop demo). The `screenflip` node is the lid;
   Scene.jsx drives lidRef.rotation.x (PI/2 = closed, slight negative = open).
   Our ScreenStack rides on the lid, aligned to the model's display face. */
export function MacBook({ groupRef, lidRef, screenRef, layerRefs, layers }) {
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
      {/* offset puts the open-lid display plane where the camera choreography
          expects it: centred near (0, 0.15, -0.6) in mac-group space */}
      <group scale={scale} position={[0, -1.05, -0.54]}>
        {/* the lid; Scene.jsx drives its rotation.x through lidRef */}
        <primitive ref={lidRef} object={lid}>
          {/* screenshot stack glued onto the display face */}
          <group position={stack.center} rotation={stack.rot} scale={[stack.sw, stack.sh, 1]}>
            <ScreenStack device="mac" layers={layers} screenRef={screenRef} layerRefs={layerRefs} />
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
export function Pad({ groupRef, screenRef, layerRefs, layers }) {
  const S = SCREENS.pad;
  return (
    <group ref={groupRef}>
      <RoundedBox args={[S.w + 0.18, S.h + 0.18, 0.075]} radius={0.05} smoothness={3}>
        <meshStandardMaterial color={ALU} roughness={0.6} metalness={0.25} />
      </RoundedBox>
      <group position={[0, 0, 0.042]}>
        <ScreenStack device="pad" layers={layers} screenRef={screenRef} layerRefs={layerRefs} />
      </group>
    </group>
  );
}

/* iPhone: floating portrait slab */
export function Phone({ groupRef, screenRef, layerRefs, layers }) {
  const S = SCREENS.phone;
  return (
    <group ref={groupRef}>
      <RoundedBox args={[S.w + 0.12, S.h + 0.12, 0.07]} radius={0.085} smoothness={4}>
        <meshStandardMaterial color={"#cfccc6"} roughness={0.55} metalness={0.3} />
      </RoundedBox>
      <group position={[0, 0, 0.04]}>
        <ScreenStack device="phone" layers={layers} screenRef={screenRef} layerRefs={layerRefs} />
      </group>
      {/* dynamic island hint */}
      <mesh position={[0, SCREENS.phone.h / 2 - 0.085, 0.085]} renderOrder={30}>
        <planeGeometry args={[0.26, 0.055]} />
        <meshBasicMaterial color={GLASS} />
      </mesh>
    </group>
  );
}
