// Shared mutable state driven by the GSAP timeline (scrubbed by scroll) and
// read every frame by the R3F scene. No React state — just numbers.

export const rig = {
  // camera
  camX: 0, camY: 0, camZ: 5.4,
  tgtX: 0, tgtY: 0, tgtZ: 0,

  // macbook
  macX: 0, macY: -3.6, macRotY: 0, lid: 0, // lid 0 closed -> 1 open
  // ipad
  padX: 8, padY: 0, padRotY: 0,
  // iphone
  phoneX: 8, phoneY: 0, phoneRotY: 0,

  // screen layer opacities (mac order mirrors MAC_LAYERS in tour-data.js)
  macDash: 1, macTorus: 0, macBar: 0,
  macUnit: 0, macRing: 0, macQt: 0, macQuestion: 0,
  macMcq: 0, macMcqSel: 0, macMcqCorrect: 0,
  macQtAfter: 0, macQtDecayed: 0, macDashDecayed: 0,
  // iPad now carries the whole post-drill sequence (practice → mastery → decay →
  // exit ticket); layer order mirrors PAD_KEYS in Scene.jsx
  padMcq: 0, padMcqSel: 0, padMcqCorrect: 0,
  padQtAfter: 0, padQtDecayed: 0, padDashDecayed: 0,
  padExit1: 0, padExit2: 0,
  phoneCards: 1, phoneCardsBack: 0, phoneCheckin: 0,

  // rotational device handoffs: a rising colour divider hard-clips two stacked
  // devices (Scene.jsx). `divider` 1 = line at the bottom, 0 = line at the top;
  // `clipActive` gates the clip planes on for a handoff; each device's ClipSide
  // is +1 (keep the top band), -1 (keep the bottom band) or 0 (unclipped).
  divider: 1, clipActive: 0,
  macClipSide: 0, padClipSide: 0, phoneClipSide: 0,

  // global fade of the 3d stage at the very end
  stageFade: 1,
};

// Screen plane meshes register here so the DOM layer can project onto them.
export const trackers = {
  mac: null, // THREE.Mesh of the mac screen plane
  pad: null,
  phone: null,
};

// Device screen sizes in world units (width, height) — keep in sync with devices.jsx
export const SCREENS = {
  mac: { w: 3.3, h: 2.0625 },   // 16:10
  pad: { w: 2.42, h: 1.69 },    // 1194x834
  phone: { w: 1.085, h: 2.35 }, // 390x844
};

// uv (u from left, v from top) -> local position on a screen plane
export function uvToLocal(device, u, v) {
  const s = SCREENS[device];
  return [(u - 0.5) * s.w, (0.5 - v) * s.h];
}
