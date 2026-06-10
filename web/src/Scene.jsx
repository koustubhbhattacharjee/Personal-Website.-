import React, { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MacBook, Pad, Phone } from "./devices";
import { rig, trackers, SCREENS, uvToLocal } from "./rig";
import { SHOTS, CALLOUTS, MAC_LAYERS } from "./tour-data";

const LID_CLOSED = Math.PI / 2;
const LID_OPEN = -0.16;

const tmp = new THREE.Vector3();
const corner = new THREE.Vector3();

function projectToPx(obj, x, y, camera, size, out) {
  corner.set(x, y, 0);
  obj.localToWorld(corner);
  corner.project(camera);
  out.x = (corner.x * 0.5 + 0.5) * size.width;
  out.y = (-corner.y * 0.5 + 0.5) * size.height;
  return out;
}

export default function Scene() {
  const macRef = useRef();
  const lidRef = useRef();
  const padRef = useRef();
  const phoneRef = useRef();
  const macScreenRef = useRef();
  const padScreenRef = useRef();
  const phoneScreenRef = useRef();
  const macLayers = useRef([]);
  const padLayers = useRef([]);
  const phoneLayers = useRef([]);
  const camRef = useRef();

  // image-based lighting so the MacBook's PBR aluminium doesn't render black
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  const tex = useTexture({
    ...Object.fromEntries(MAC_LAYERS.map((k) => [k, SHOTS[k]])),
    padQ1: SHOTS.padQ1,
    padQ2: SHOTS.padQ2,
    phoneCards: SHOTS.phoneCards,
    phoneCardsBack: SHOTS.phoneCardsBack,
    phoneCheckin: SHOTS.phoneCheckin,
  });
  useEffect(() => {
    Object.values(tex).forEach((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.minFilter = THREE.LinearMipmapLinearFilter;
    });
  }, [tex]);

  // layer order must match the rig keys applied below
  const macLayerList = MAC_LAYERS.map((k) => tex[k]);
  const padLayerList = [tex.padQ1, tex.padQ2];
  const phoneLayerList = [tex.phoneCards, tex.phoneCardsBack, tex.phoneCheckin];

  useEffect(() => {
    trackers.mac = macScreenRef.current;
    trackers.pad = padScreenRef.current;
    trackers.phone = phoneScreenRef.current;
  });

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const cam = camRef.current;
    if (!cam) return;

    // camera
    cam.position.set(rig.camX, rig.camY, rig.camZ);
    cam.lookAt(rig.tgtX, rig.tgtY, rig.tgtZ);

    // devices — tiny ambient float so the white space feels alive
    const float = Math.sin(t * 0.9) * 0.012;
    if (macRef.current) {
      macRef.current.position.set(rig.macX, rig.macY + float, 0);
      macRef.current.rotation.y = rig.macRotY;
      macRef.current.visible = rig.macX > -7.5;
    }
    if (lidRef.current) {
      lidRef.current.rotation.x = LID_CLOSED + (LID_OPEN - LID_CLOSED) * rig.lid;
    }
    if (padRef.current) {
      padRef.current.position.set(rig.padX, rig.padY + Math.sin(t * 1.1 + 2) * 0.014, 0);
      padRef.current.rotation.y = rig.padRotY;
      padRef.current.visible = rig.padX > -7.5 && rig.padX < 7.5;
    }
    if (phoneRef.current) {
      phoneRef.current.position.set(rig.phoneX, rig.phoneY + Math.sin(t * 1.3 + 4) * 0.016, 0);
      phoneRef.current.rotation.y = rig.phoneRotY;
      phoneRef.current.visible = rig.phoneX > -7.5 && rig.phoneX < 7.5;
    }

    // screen layer opacities
    const setOps = (refs, vals) => {
      vals.forEach((v, i) => {
        const m = refs.current[i];
        if (m) {
          m.material.opacity = v;
          m.visible = v > 0.003;
        }
      });
    };
    setOps(macLayers, MAC_LAYERS.map((k) => rig[k]));
    setOps(padLayers, [rig.padQ1, rig.padQ2]);
    setOps(phoneLayers, [rig.phoneCards, rig.phoneCardsBack, rig.phoneCheckin]);

    // ── project screens + anchors into the DOM layer ──────────────────────
    const size = state.size;
    const a = { x: 0, y: 0 }, b = { x: 0, y: 0 };
    for (const dev of ["mac", "pad", "phone"]) {
      const mesh = trackers[dev];
      const ov = document.getElementById(`ov-${dev}`);
      if (!mesh || !ov) continue;
      const S = SCREENS[dev];
      projectToPx(mesh, -S.w / 2, S.h / 2, cam, size, a); // top-left
      projectToPx(mesh, S.w / 2, -S.h / 2, cam, size, b); // bottom-right
      ov.style.transform = `translate(${a.x}px, ${a.y}px)`;
      ov.style.width = `${Math.max(0, b.x - a.x)}px`;
      ov.style.height = `${Math.max(0, b.y - a.y)}px`;
    }
    for (const c of CALLOUTS) {
      const mesh = trackers[c.device];
      const line = document.getElementById(`ptr-${c.id}`);
      const dot = document.getElementById(`dot-${c.id}`);
      const card = document.getElementById(`card-${c.id}`);
      if (!mesh || !line || !card) continue;
      if (parseFloat(card.style.opacity || "0") < 0.02) continue;
      const [lx, ly] = uvToLocal(c.device, c.anchor.u, c.anchor.v);
      projectToPx(mesh, lx, ly, cam, size, a);
      const r = card.getBoundingClientRect();
      const stage = card.closest(".tour-stage").getBoundingClientRect();
      const cx = c.side === "left" ? r.right - stage.left : r.left - stage.left;
      const cy = r.top - stage.top + r.height * 0.5;
      line.setAttribute("x1", cx);
      line.setAttribute("y1", cy);
      line.setAttribute("x2", a.x);
      line.setAttribute("y2", a.y);
      if (dot) {
        dot.setAttribute("cx", a.x);
        dot.setAttribute("cy", a.y);
      }
    }
  });

  return (
    <>
      <PerspectiveCamera ref={camRef} makeDefault fov={30} near={0.1} far={50} position={[0, 0, 5.4]} />
      <ambientLight intensity={1.25} />
      <directionalLight position={[2, 4, 6]} intensity={0.55} />
      <directionalLight position={[-3, -1, 4]} intensity={0.2} />
      <MacBook groupRef={macRef} lidRef={lidRef} screenRef={macScreenRef} layerRefs={macLayers} layers={macLayerList} />
      <Pad groupRef={padRef} screenRef={padScreenRef} layerRefs={padLayers} layers={padLayerList} />
      <Phone groupRef={phoneRef} screenRef={phoneScreenRef} layerRefs={phoneLayers} layers={phoneLayerList} />
    </>
  );
}
