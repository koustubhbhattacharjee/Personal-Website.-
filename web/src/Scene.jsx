import React, { useRef, useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MacBook, Pad, Phone } from "./devices";
import { SHAPE_FRAMES } from "./shapes";

// Practice Room recolour flipbook frames (captured small; played on the iPad)
const FRAME_PATHS = Array.from(
  { length: SHAPE_FRAMES },
  (_, i) => `/shots/practice/p${String(i).padStart(2, "0")}.png`
);
import { rig, trackers, SCREENS, uvToLocal } from "./rig";
import { SHOTS, CALLOUTS, MAC_LAYERS } from "./tour-data";

const LID_CLOSED = Math.PI / 2;
const LID_OPEN = -0.16;

// On phones the canvas is a letterbox in the top half of the stage (tour.css),
// so the portrait viewport is far narrower than desktop and the centred devices
// would overflow the width. Pull the camera straight back by a constant factor —
// a geometrically exact zoom-out that leaves every timeline value untouched. The
// handoff clip-plane maths scales by the same factor so the divider stays aligned.
const MOBILE = typeof window !== "undefined" && window.matchMedia("(max-width: 880px)").matches;
// Pull back just enough that the widest device (the laptop) still fits the
// portrait width, but keep the devices large — they should own most of the
// (taller) mobile canvas. 1.2 ≈ a slight body bleed off the sides, which reads
// as immersive rather than cropped.
const FIT = MOBILE ? 1.2 : 1;

// The MacBook's display centre is offset from the model-group origin (the
// (0, 0.15, -0.6) note in devices.jsx). During the handoff the laptop must spin
// about THIS point — not the origin — or its edge-on screen swings sideways
// instead of standing directly above the iPad.
const MAC_SCREEN_Z = -0.6;

const tmp = new THREE.Vector3();
const corner = new THREE.Vector3();

// screen-layer opacity keys (kept module-level so useFrame allocates nothing)
const PAD_KEYS = [
  "padMcq", "padMcqSel", "padMcqCorrect",
  "padQtAfter", "padQtDecayed", "padDashDecayed",
  "padExit1", "padExit2",
];
const PHONE_KEYS = ["phoneCards", "phoneCardsBack", "phoneCheckin"];
function setOps(refs, keys) {
  for (let i = 0; i < keys.length; i++) {
    const m = refs.current[i];
    if (m) {
      const v = rig[keys[i]];
      m.material.opacity = v;
      m.visible = v > 0.003;
    }
  }
}

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
  const flipRef = useRef();
  const camRef = useRef();

  // Hard-clip planes for the rotational handoff. A horizontal world plane (normal
  // ±Y) viewed dead-on projects to a horizontal screen line, so we cut the laptop
  // and iPad against the same moving divider. constant=±1000 ⇒ "keep everything"
  // (the default the rest of the tour renders with).
  const macClip = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000), []);
  const padClip = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000), []);
  const phoneClip = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 1000), []);

  const { gl, scene, invalidate } = useThree();

  // per-object clip planes only kick in once a material opts into clipping
  useEffect(() => { gl.localClippingEnabled = true; }, [gl]);

  // attach the clip planes to every material of each device, once mounted: the
  // laptop keeps the orange (top) side, the iPad keeps the yellow (bottom) side
  useEffect(() => {
    const assign = (root, planes) => {
      root?.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { m.clippingPlanes = planes; m.needsUpdate = true; });
      });
    };
    assign(macRef.current, [macClip]);
    assign(padRef.current, [padClip]);
    assign(phoneRef.current, [phoneClip]);
  }, [macClip, padClip, phoneClip]);

  // graceful GPU recovery: preventDefault lets the browser restore the context
  // instead of leaving the canvas permanently dead after a memory hiccup
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (e) => { e.preventDefault(); };
    const onRestored = () => { invalidate(); };
    canvas.addEventListener("webglcontextlost", onLost, false);
    canvas.addEventListener("webglcontextrestored", onRestored, false);
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, invalidate]);

  // image-based lighting so the MacBook's PBR aluminium doesn't render black
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
    const maxAniso = gl.capabilities.getMaxAnisotropy();
    Object.values(tex).forEach((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = Math.min(8, maxAniso);
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      // clamp so the content-zoom offset never wraps the screenshot
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
    });
  }, [tex, gl]);

  // Practice Room flipbook frames (separate from the screen-layer textures, so the
  // content-zoom UV transform never touches them)
  const frameTex = useTexture(FRAME_PATHS);
  useEffect(() => {
    frameTex.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; });
    if (flipRef.current) {
      flipRef.current.material.map = frameTex[0];
      flipRef.current.material.needsUpdate = true;
    }
  }, [frameTex]);

  // layer order must match the rig keys applied below
  const macLayerList = MAC_LAYERS.map((k) => tex[k]);
  // the iPad replays the (laptop-aspect) practice/mastery/decay screens, then its
  // own native exit-ticket shots — same texture objects, so no extra VRAM
  const padLayerList = [
    tex.macMcq, tex.macMcqSel, tex.macMcqCorrect,
    tex.macQtAfter, tex.macQtDecayed, tex.macDashDecayed,
    tex.padQ1, tex.padQ2,
  ];
  const texList = Object.values(tex);
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

    // camera (FIT pulls it back on phones so the centred devices fit the
    // narrower portrait canvas; 1 on desktop)
    cam.position.set(rig.camX, rig.camY, rig.camZ * FIT);
    cam.lookAt(rig.tgtX, rig.tgtY, rig.tgtZ);

    // handoff hard-clip — map the divider's screen line to a world-Y plane. With
    // the camera dead-on (tgtY=camY) a horizontal screen line at fraction `divider`
    // (from top) sits at world y = camY + ndcY·tan(fov/2)·camZ. Each device keeps
    // the top band (side +1), the bottom band (side -1) or everything (side 0).
    const setClip = (plane, side, yc) => {
      if (rig.clipActive < 0.5 || side === 0) {
        plane.normal.set(0, 1, 0); plane.constant = 1000;
      } else {
        plane.normal.set(0, side, 0); plane.constant = -side * yc;
      }
    };
    const half = Math.tan((Math.PI / 180) * 15); // tan(fov/2), fov = 30°
    const ndcY = 1 - 2 * rig.divider;             // divider 1 → bottom, 0 → top
    const yc = rig.camY + ndcY * half * rig.camZ * FIT;
    setClip(macClip, rig.macClipSide, yc);
    setClip(padClip, rig.padClipSide, yc);
    setClip(phoneClip, rig.phoneClipSide, yc);

    // devices stay bang-centre — no x/y/z drift; handoffs are pure rotation
    if (macRef.current) {
      const ry = rig.macRotY;
      if (rig.macClipSide !== 0) {
        // spin about the screen centre so the screen stays put (the model origin
        // is offset from the display; compensate x/z so only rotation is seen)
        macRef.current.position.set(
          -MAC_SCREEN_Z * Math.sin(ry),
          rig.macY,
          MAC_SCREEN_Z * (1 - Math.cos(ry))
        );
      } else {
        macRef.current.position.set(rig.macX, rig.macY, 0);
      }
      macRef.current.rotation.y = ry;
      macRef.current.visible = rig.macX > -7.5;
    }
    if (lidRef.current) {
      lidRef.current.rotation.x = LID_CLOSED + (LID_OPEN - LID_CLOSED) * rig.lid;
    }
    if (padRef.current) {
      padRef.current.position.set(rig.padX, rig.padY, 0);
      padRef.current.rotation.y = rig.padRotY;
      padRef.current.visible = rig.padX > -7.5 && rig.padX < 7.5;
    }
    if (phoneRef.current) {
      phoneRef.current.position.set(rig.phoneX, rig.phoneY, 0);
      phoneRef.current.rotation.y = rig.phoneRotY;
      phoneRef.current.visible = rig.phoneX > -7.5 && rig.phoneX < 7.5;
    }

    // screen layer opacities (no per-frame allocation — see module-level setOps)
    setOps(macLayers, MAC_LAYERS);
    setOps(padLayers, PAD_KEYS);
    setOps(phoneLayers, PHONE_KEYS);

    // content zoom — pan/scale the screenshot inside the (pinned) screen so its
    // text is legible without dollying the camera toward the device
    const z = rig.zoom;
    const ox = Math.max(0, Math.min(rig.zoomX - z / 2, 1 - z));
    const oy = Math.max(0, Math.min(rig.zoomY - z / 2, 1 - z));
    for (let i = 0; i < texList.length; i++) {
      texList[i].repeat.set(z, z);
      texList[i].offset.set(ox, oy);
    }

    // Practice Room flipbook: swap the iPad-screen frame to the scrubbed recolour
    // step (played fast as the section scrolls), faded by shapesOn
    if (flipRef.current) {
      const on = rig.shapesOn;
      flipRef.current.visible = on > 0.01;
      if (on > 0.01) {
        const idx = Math.max(0, Math.min(SHAPE_FRAMES - 1, Math.round(rig.shapeFrame)));
        flipRef.current.material.map = frameTex[idx];
        flipRef.current.material.opacity = on;
      }
    }

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
      const pointer = document.getElementById(`ptr-${c.id}`);
      const dot = document.getElementById(`dot-${c.id}`);
      const card = document.getElementById(`card-${c.id}`);
      if (!mesh || !pointer || !card) continue;
      if (parseFloat(card.style.opacity || "0") < 0.02) continue;
      const [lx, ly] = uvToLocal(c.device, c.anchor.u, c.anchor.v);
      projectToPx(mesh, lx, ly, cam, size, a);
      const r = card.getBoundingClientRect();
      const stage = card.closest(".tour-stage").getBoundingClientRect();
      const cx = c.side === "left" ? r.right - stage.left : r.left - stage.left;
      const cy = r.top - stage.top + r.height * 0.5;
      pointer.setAttribute("d", `M ${cx} ${cy} H ${a.x} V ${a.y}`);
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
      <MacBook
        groupRef={macRef}
        lidRef={lidRef}
        screenRef={macScreenRef}
        layerRefs={macLayers}
        layers={macLayerList}
      />
      <Pad groupRef={padRef} screenRef={padScreenRef} layerRefs={padLayers} layers={padLayerList} />
      <Phone groupRef={phoneRef} screenRef={phoneScreenRef} layerRefs={phoneLayers} layers={phoneLayerList} />
      {/* Practice Room recolour flipbook, playing on the iPad screen */}
      <mesh ref={flipRef} position={[0, 0, 0.05]} visible={false} renderOrder={40}>
        <planeGeometry args={[0.871, 0.608]} />
        <meshBasicMaterial transparent opacity={0} toneMapped={false} depthTest={false} />
      </mesh>
    </>
  );
}
