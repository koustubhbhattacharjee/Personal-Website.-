# Build Prompt: Scroll-Driven Multi-Device Walkthrough — Personal Site

> Paste this into Claude Code (or Claude Fable 5) from the root of the project.
> All decisions are locked — no open questions. Explore the repo, share a plan, then build.

---

## 1. Goal

Build the centerpiece of my personal website: a single **scroll-driven cinematic sequence** layered on top of an **existing HTML/CSS template** (already built in Claude Design). It opens on a typography-led hero, then walks through my existing **Scholar** app *across three Apple devices* — a **MacBook**, an **iPad**, then an **iPhone** — each swiping in as the visitor scrolls, with annotated callouts explaining the product. The three-device flow also demonstrates that the app is **responsive and consistent across desktop, tablet, and mobile**. It ends by handing off to the template's existing reviews section.

Everything is driven by **scroll position**: no real clicks. Every click, zoom, pan, and device swipe is scripted to scroll progress and is fully reversible on scroll-up. It should feel like a polished guided product tour. Keep the 3D subtle (see §6).

## 2. Hero section

- My **photo is small** — much smaller than it appears in the template. It should not dominate.
- **Big display-font typography** carries the hero (large, confident type as the focal point).
- As the visitor scrolls down, the hero hands off to the MacBook.

## 3. Existing assets — locate and inspect first

I will make these available in the workspace. Before writing any code, explore the file system and report what you find:

- The **existing template (HTML/CSS)**, already built in Claude Design. Build the scroll experience on top of it. **The reviews section already exists in this template — do not rebuild it; just hand off to it at the end.**
- The **theme package**: light + dark themes. For now the site uses the **light** theme everywhere (see §6); keep dark available for later.
- The **Scholar** project (source of truth): student dashboard with 3D geometry (tori, cylinders, boxes) and sections including **practice**, **assessments / exit ticket**, **flashcards**, and a **session log**.
- **Read `ARCHITECTURE.md` and the other `.md` docs** to understand the project. `ARCHITECTURE.md` is large — skim it and the supporting markdown to learn how Scholar works; use them as the source for the "What is Scholar?" callout and the rest of the annotation copy. **Draft all callout copy yourself from these docs.**
- The app already has a **showcase / demo feature** — find it and use it to access/capture the screen states for the walkthrough rather than rebuilding the screens. Locate it yourself while exploring.

Reuse Scholar's existing architecture, visuals, and logic. Report the structure and your plan before coding.

## 4. The scroll sequence (core deliverable)

Scroll-scrubbed and reversible throughout. Three devices, each swiping in from the side as the previous swipes out to the **left**. Keep the tour **focused**.

**Device 1 — MacBook**
1. **Hero (top):** small photo + big display typography (§2); the closed MacBook sits/enters below.
2. **Open:** on scroll, the MacBook lid twists open on its hinge (real 3D). Screen shows the **Scholar dashboard** with a **placeholder student name**.
3. **Spotlight walkthrough** (scroll = scripted clicks + zoom/pan, each with a glitch callout per §5):
   1. **What is Scholar?** — brief definition, drafted from `ARCHITECTURE.md`.
   2. **The three shapes** — zoom in; explain the three shapes represent **chapter / unit / ring**.
   3. **Practice** — practice section pops up → "click" in → show the work → come back. Demonstrate:
      - Solving a question **correctly changes its color** (mastery indicator).
      - A **decay curve** animation: if days pass without redoing the problem, the color **fades / decreases automatically**.

**Transition:** scroll → MacBook **swipes left out**, **iPad swipes in**.

**Device 2 — iPad**
4. **Exit ticket / assessment** done on the iPad: a visible **timer**, questions appearing **one by one**, answered by **drawing in the Excalidraw-style area** (animated hand-drawn sketch, stylus/Apple-Pencil feel). Callout explains it as you go.

**Transition:** scroll → iPad **swipes left out**, **iPhone swipes in**.

**Device 3 — iPhone**
5. **Flashcards** + **Session log** on the phone (easy to check on the go):
   - Flashcards section.
   - **Session log in a GitHub-style contribution graph** showing the day streak; callout makes the point that **your progress is being tracked**.

**Close:** iPhone **swipes out** → hand off to the template's **existing reviews section**.

## 5. Annotation / spotlight system (applies across all three devices)

- A **callout card floats beside the active device** (left or right, whichever is clear), with a **pointer / arrow** connecting it to the target element on screen.
- The card uses a **glitch animation** for entrance and text.
- The pointer + card stay locked to their element while the camera zooms/pans, and update as the tour advances (zoom in → pan → zoom out → next).
- **All copy is drafted by you** from `ARCHITECTURE.md` and the other repo docs.

## 6. Visual / theme requirements

- Three **Apple devices**: **MacBook → iPad → iPhone**, used to show the app is responsive and consistent across them.
- Devices hand off via **left-swipe** transitions tied to scroll.
- Use the **light theme across all sections for now** (hero, walkthrough). Dark stays in the package for later.
- The walkthrough lives in a whitish, near-flat white 3D space, dominant enough that it does **not** obviously read as a 3D/Blender scene — minimize depth cues, shadows, perspective drama. Devices should look like they're floating in clean white.

## 7. Tech (confirmed)

- **React Three Fiber** (R3F) for all three device models, the MacBook hinge, camera zoom/pan, and the left-swipe device transitions — **not** vanilla Three.js. Use **drei**; drive the timeline from scroll via drei `ScrollControls` or **GSAP ScrollTrigger** synced to the R3F scene.
- **Screen content = pre-rendered screenshots** of each Scholar state, swapped per scroll beat (live in-screen app rejected as too heavy).
- **DOM-side reveals** (callouts, drawing sketch): Framer Motion or GSAP. Glitch + Excalidraw-style sketch effects on the DOM/SVG layer.
- Integrate cleanly with the **existing HTML/CSS template** — don't fight it; build the sequence as a section within it and hand off to its reviews section.

## 8. Constraints & acceptance criteria

- Smooth, **scroll-scrubbed both ways**, ~60fps target.
- Device swipes and callouts stay **synced** to scroll and to their target elements through every zoom/pan.
- Lazy-load heavy 3D/image assets; keep initial load light.
- **Responsive:** degrade gracefully on mobile (simplified motion / screenshot swaps on small screens).
- Screens show a **placeholder name**, never real student data.

## 9. Build order

1. Explore the template + theme package + Scholar + `ARCHITECTURE.md` and other `.md` docs + the showcase feature; report structure and a plan.
2. Build the hero (small photo, big display type) within the template + light theme + scroll container.
3. Capture screenshots per beat via the showcase feature: dashboard, three shapes, practice (color-change + decay states), iPad exit ticket (with timer) + Excalidraw answer area, iPhone flashcards, iPhone GitHub-style session log.
4. Build the three R3F device models (MacBook with hinge, iPad, iPhone) + camera zoom/pan + left-swipe transition rig.
5. Wire screenshot swaps and device handoffs to scroll beats.
6. Build the annotation system: floating glitch callout + pointer; the color-change + decay-curve animation; the Excalidraw-style drawing animation.
7. Add the final iPhone exit, handing off to the template's existing reviews section.
8. Polish: performance, responsiveness, easing.
