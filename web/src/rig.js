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
  macDash: 1,
  // iPad layers (order mirrors PAD_KEYS in Scene.jsx): the decay-beat practice
  // room (so the iPad isn't blank-black as it rotates in), then the exit-ticket
  // answering screens
  decayRoom: 0, padExit1: 0, padExit2: 0,
  // the iPhone check-in is now a crisp DOM contribution graph (Tour.jsx), so only
  // the flashcard deck screens live on the phone screen itself
  phoneCards: 1, phoneCardsBack: 0,

  // rotational device handoffs: a rising colour divider hard-clips two stacked
  // devices (Scene.jsx). `divider` 1 = line at the bottom, 0 = line at the top;
  // `clipActive` gates the clip planes on for a handoff; each device's ClipSide
  // is +1 (keep the top band), -1 (keep the bottom band) or 0 (unclipped).
  divider: 1, clipActive: 0,
  macClipSide: 0, padClipSide: 0, phoneClipSide: 0,

  // content zoom: scale/pan the screen TEXTURE (not the camera) so a pinned device
  // can still show legible detail. zoom 1 = whole screen; <1 zooms in. zoomX/zoomY
  // are the focus point in texture space (0..1; y is bottom→top due to flipY).
  zoom: 1, zoomX: 0.5, zoomY: 0.5,

  // Mastery recolour flipbook (arc/disc/cylinder side-by-side). It plays on the
  // LAPTOP screen forward (mastery builds) and on the iPad screen backward
  // (decay). shapeFrame (0..SHAPE_FRAMES-1) scrubs the captured frames; flipMac
  // and flipPad fade the overlay in on each device for its beat.
  flipMac: 0, flipPad: 0, shapeFrame: 0,

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
