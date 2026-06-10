// Builds data/ap-physics-1-unit-2-workbook-frq-additions.json — a v2 MCQ tree
// for the FRQs in WORKBOOK 1 FULL (1).pdf chapter 2 (Dynamics + Circular Motion)
// that are not already in the DB. Schema follows qt-extraction-prompt-mcq.md.
//
// Input: hardcoded in this file (text + answers were extracted from
// scripts/cache/wb_ch2_frq_pages.json earlier, MCQ choices authored here).
// Output: data/ap-physics-1-unit-2-workbook-frq-additions.json
//
// Design choices:
//   - Each FRQ becomes one "shared_stimulus_set" question. The shared header
//     carries the figure (when present) + the prompt's setup paragraph.
//     Each child is one MCQ part with a closed-form answer.
//   - Parts that ask for a free-body diagram or "describe the motion" are
//     skipped — they cannot reduce to a finite-choice answer.
//   - QT clustering matches the existing 22 unit-2 QTs in the bank where
//     applicable; brand-new QTs only when the skill is genuinely distinct
//     (e.g. "Conical pendulum geometry", "Climbing-student pulley").
//   - SLO weights sum to 1.0 per QT; cross-unit reinforcement_slos pull in
//     1.5.A.* (vector decomposition), 1.2.B.* (kinematics), 4.x (impulse)
//     when the work actually requires it.
//   - Image bboxes are normalized [x0,y0,x1,y1], top-left origin, on the
//     1-indexed PDF page. Estimated from the workbook's standard layout
//     (figure typically above/right of the prompt).

import fs from "node:fs"
import path from "node:path"

const SOURCE_LABEL  = "AP Physics 1 Workbook (1) — Ch. 2 Dynamics + Circular Motion FRQ Pack — 2026-04-28"
const SOURCE_TYPE   = "textbook"
const TEXTBOOK_KEY  = "tutor_ap1_workbook_book1_2014"
const UNIT_LABEL    = "Unit 2: Force and Translational Dynamics"

// Shorthand to build a source_reference object.
const sref = (page, exercise_ref, section) => ({
  worksheet_name: SOURCE_LABEL,
  textbook_key:   TEXTBOOK_KEY,
  page,
  section: section || "",
  exercise_ref,
})

// Convenience for a child MCQ.
const mcq = ({ id, label, page, exercise_ref, section, prompt, options, correct, alt_image }) => {
  const ordered_content = []
  if (alt_image) ordered_content.push({ type: "image", page: alt_image.page, bbox: alt_image.bbox, caption: alt_image.caption || "", alt: alt_image.alt || "" })
  ordered_content.push({ type: "text", value: prompt })
  ordered_content.push({ type: "text", value: options.join("\n") })
  return {
    id, label,
    is_stem_child: true,
    question_format: "mcq",
    options,
    correct_option: correct,
    source_reference: sref(page, exercise_ref, section),
    ordered_content,
  }
}

// ── FRQ records ───────────────────────────────────────────────────────────
// One entry per FRQ. children[] = MCQ parts. stem_header text is the shared
// setup that every child references; image bbox covers the figure region.

const FRQs = [

// ─── 1982B2 — Crane lifting hook + load (translational dynamics)
{
  qt_key: "crane_two_cable_tensions_under_acceleration",
  qt: {
    id: "qt_wb_1982b2",
    label: "Two-cable lift system: tension in each cable under upward acceleration",
    section_ref: "2.5.A",
    primary_slo: "2.5.A.1",
    slo_weights: [
      { slo: "2.5.A.1", weight: 0.50 },  // F=ma, system response to net force
      { slo: "2.4.A.2", weight: 0.20 },  // translational equilibrium reasoning (free body)
      { slo: "2.2.B.1", weight: 0.15 },  // free-body diagram of each subsystem
      { slo: "2.6.B.1", weight: 0.15 },  // gravitational force as constant mg
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "2.2.B.1", weight: 0.15 },
      { slo: "2.6.B.1", weight: 0.15 },
    ],
    lo_confidence: "high",
    notes: "Apply ΣF = ma separately to the load and to the (hook + load) system to read the two cable tensions; the system also exercises 2.6.B (treating g as constant on each subsystem)."
  },
  stem_id: "wb1982b2",
  label: "1982B2",
  page: 59,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "1982B2. A crane is used to hoist a load of mass m₁ = 500 kg suspended by a lower cable from a hook of mass m₂ = 50 kg. The hook is supported from above by an upper cable. The crane lifts the hook + load upward with constant acceleration a = 2 m/s². Use g = 10 m/s².",
  stem_image: { page: 59, bbox: [0.55, 0.05, 0.92, 0.30], caption: "Figure: crane with upper and lower cable", alt: "Crane raising hook of mass m2 from upper cable, with load of mass m1 hanging from a lower cable." },
  children: [
    {
      id: "q_wb1982b2_b1",
      label: "1982B2(b)i",
      prompt: "Determine the tension T₁ in the lower cable connecting the hook to the load while the system accelerates upward at 2 m/s².",
      options: [
        "(A) $T_1 = m_1(g+a) = 6000\\,\\text{N}$",
        "(B) $T_1 = m_1 g = 5000\\,\\text{N}$",
        "(C) $T_1 = (m_1+m_2)(g+a) = 6600\\,\\text{N}$",
        "(D) $T_1 = m_1 a = 1000\\,\\text{N}$",
      ],
      correct: "(A) $T_1 = m_1(g+a) = 6000\\,\\text{N}$",
    },
    {
      id: "q_wb1982b2_b2",
      label: "1982B2(b)ii",
      prompt: "Determine the tension T₂ in the upper cable supporting the hook + load while the system accelerates upward at 2 m/s².",
      options: [
        "(A) $T_2 = (m_1+m_2)(g+a) = 6600\\,\\text{N}$",
        "(B) $T_2 = (m_1+m_2)g = 5500\\,\\text{N}$",
        "(C) $T_2 = m_1(g+a) = 6000\\,\\text{N}$",
        "(D) $T_2 = m_2(g+a) = 600\\,\\text{N}$",
      ],
      correct: "(A) $T_2 = (m_1+m_2)(g+a) = 6600\\,\\text{N}$",
    },
  ]
},

// ─── 1985B2 — Two boxes, one on incline, one hanging (friction & tension)
{
  qt_key: "incline_block_with_friction",
  qt: {
    id: "qt_wb_incline_with_friction_pack",
    label: "Block on inclined plane with friction (weight components)",  // existing QT title
    section_ref: "2.7.B",
    primary_slo: "2.7.B.1",
    slo_weights: [
      { slo: "2.7.B.1", weight: 0.40 },  // static friction
      { slo: "2.4.A.2", weight: 0.25 },  // translational equilibrium
      { slo: "1.5.A.3", weight: 0.20 },  // perpendicular components of vector
      { slo: "2.7.A.1", weight: 0.15 },  // kinetic friction
    ],
    aligned_slos: ["2.7.A.1"],
    reinforcement_slos: [
      { slo: "2.4.A.2", weight: 0.25 },
      { slo: "1.5.A.3", weight: 0.20 },
    ],
    lo_confidence: "high",
    notes: "Resolve the on-incline weight into parallel/perpendicular components (1.5.A.3), apply ΣF=0 (2.4.A.2), and bound friction by μ_s N (2.7.B.1) — kinetic friction (2.7.A.1) appears once the system is moving."
  },
  stem_id: "wb1985b2",
  label: "1985B2",
  page: 59,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "1985B2 (modified). Two 10-kg boxes are connected by a massless string over a frictionless pulley. The box on the right hangs vertically; the box on the left rests on an incline at 60° with the horizontal. The system is at rest. μ_s = 0.30 and μ_k = 0.15 between the left box and the incline. Use g = 10 m/s², sin 60° = 0.87, cos 60° = 0.50.",
  stem_image: { page: 59, bbox: [0.55, 0.34, 0.92, 0.66], caption: "Figure: pulley over incline with hanging box", alt: "10 kg box on a 60° incline connected over a frictionless pulley to an identical 10 kg box hanging vertically." },
  children: [
    {
      id: "q_wb1985b2_a",
      label: "1985B2(a)",
      prompt: "What is the tension T in the string while the system is at rest?",
      options: [
        "(A) $T = m_2 g = 100\\,\\text{N}$ (weight of the hanging box)",
        "(B) $T = m_1 g \\sin 60° = 87\\,\\text{N}$",
        "(C) $T = (m_1+m_2)g = 200\\,\\text{N}$",
        "(D) $T = \\mu_s m_1 g \\cos 60° = 15\\,\\text{N}$",
      ],
      correct: "(A) $T = m_2 g = 100\\,\\text{N}$ (weight of the hanging box)",
    },
    {
      id: "q_wb1985b2_c",
      label: "1985B2(c)",
      prompt: "Determine the magnitude of the static frictional force acting on the box on the incline.",
      options: [
        "(A) $f_s = T - m_1 g \\sin 60° \\approx -13\\,\\text{N}$ — i.e. friction acts up-slope with magnitude $13\\,\\text{N}$.",
        "(B) $f_s = \\mu_s m_1 g \\cos 60° = 15\\,\\text{N}$",
        "(C) $f_s = \\mu_k m_1 g \\cos 60° = 7.5\\,\\text{N}$",
        "(D) $f_s = m_1 g \\sin 60° = 87\\,\\text{N}$",
      ],
      correct: "(A) $f_s = T - m_1 g \\sin 60° \\approx -13\\,\\text{N}$ — i.e. friction acts up-slope with magnitude $13\\,\\text{N}$.",
    },
  ]
},

// ─── 1986B1 — Three blocks 1/2/4 kg with pulley
{
  qt_key: "atwood_pulley_pack",
  qt: {
    id: "qt_wb_atwood_three_block",
    label: "Connected blocks via string/pulley (Atwood & variants)",
    section_ref: "2.5.A",
    primary_slo: "2.5.A.1",
    slo_weights: [
      { slo: "2.5.A.1", weight: 0.45 }, // F=ma applied to system + each block
      { slo: "2.4.A.2", weight: 0.20 }, // translational equilibrium for at-rest cases
      { slo: "2.2.B.1", weight: 0.15 }, // FBDs
      { slo: "2.7.A.1", weight: 0.10 }, // kinetic friction (when present)
      { slo: "2.6.B.1", weight: 0.10 }, // constant g
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "2.2.B.1", weight: 0.15 },
      { slo: "2.7.A.1", weight: 0.10 },
      { slo: "2.6.B.1", weight: 0.10 },
    ],
    lo_confidence: "high",
    notes: "ΣF = ma for the whole system, then for each block, gives the common acceleration and each tension. Friction enters when one of the blocks slides on a rough surface."
  },
  stem_id: "wb1986b1",
  label: "1986B1",
  page: 60,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "1986B1. Three blocks of masses 1.0 kg, 2.0 kg, and 4.0 kg are connected by massless strings, one of which passes over a frictionless pulley of negligible mass. The 4 kg block hangs over the edge; the 2 kg and 1 kg blocks are stacked vertically on the other side, hanging in line. Use g = 9.8 m/s².",
  stem_image: { page: 60, bbox: [0.55, 0.05, 0.92, 0.30], caption: "Figure: Atwood with 3 blocks", alt: "Pulley at table edge with a hanging 4 kg block; on the other side a 2 kg block above a 1 kg block, both hanging from the string." },
  children: [
    {
      id: "q_wb1986b1_a",
      label: "1986B1(a)",
      prompt: "Calculate the magnitude of the acceleration of the 4 kg block.",
      options: [
        "(A) $a = \\dfrac{(m_4-m_1-m_2)\\,g}{m_1+m_2+m_4} = 1.4\\,\\text{m/s}^2$",
        "(B) $a = \\dfrac{m_4 g}{m_1+m_2+m_4} = 5.6\\,\\text{m/s}^2$",
        "(C) $a = g = 9.8\\,\\text{m/s}^2$",
        "(D) $a = \\dfrac{(m_4-m_2)\\,g}{m_4+m_2} = 3.3\\,\\text{m/s}^2$",
      ],
      correct: "(A) $a = \\dfrac{(m_4-m_1-m_2)\\,g}{m_1+m_2+m_4} = 1.4\\,\\text{m/s}^2$",
    },
    {
      id: "q_wb1986b1_b",
      label: "1986B1(b)",
      prompt: "Calculate the tension in the string supporting the 4 kg block.",
      options: [
        "(A) $T_4 = m_4(g-a) = 33.6\\,\\text{N}$",
        "(B) $T_4 = m_4 g = 39.2\\,\\text{N}$",
        "(C) $T_4 = m_4(g+a) = 44.8\\,\\text{N}$",
        "(D) $T_4 = (m_1+m_2)(g+a) = 33.6\\,\\text{N}$ — only by coincidence; the correct reasoning uses $m_4(g-a)$.",
      ],
      correct: "(A) $T_4 = m_4(g-a) = 33.6\\,\\text{N}$",
    },
    {
      id: "q_wb1986b1_c",
      label: "1986B1(c)",
      prompt: "Calculate the tension in the string connected to the 1 kg block (i.e. between the 1 kg and 2 kg blocks).",
      options: [
        "(A) $T_1 = m_1(g+a) = 11.2\\,\\text{N}$",
        "(B) $T_1 = m_1 g = 9.8\\,\\text{N}$",
        "(C) $T_1 = m_1(g-a) = 8.4\\,\\text{N}$",
        "(D) $T_1 = (m_1+m_2)(g+a) = 33.6\\,\\text{N}$",
      ],
      correct: "(A) $T_1 = m_1(g+a) = 11.2\\,\\text{N}$",
    },
  ]
},

// ─── 1988B1 — Helicopter accelerating up with package
{
  qt_key: "helicopter_package_pack",
  qt: {
    id: "qt_wb_helicopter_package",
    label: "Object suspended below an accelerating vehicle: rope tension and post-cut kinematics",
    section_ref: "2.5.A",
    primary_slo: "2.5.A.1",
    slo_weights: [
      { slo: "2.5.A.1", weight: 0.40 }, // F = ma during acceleration
      { slo: "2.4.A.2", weight: 0.15 }, // FBD analysis
      { slo: "1.2.B.2", weight: 0.30 }, // 1D kinematic equations after the rope cuts (cross-unit, U1)
      { slo: "2.6.B.1", weight: 0.15 }, // g treated as constant
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "1.2.B.2", weight: 0.30 },  // cross-unit reinforcement to U1 kinematics
      { slo: "2.6.B.1", weight: 0.15 },
    ],
    lo_confidence: "high",
    notes: "Part (b) is dynamics (T = m(g+a)); part (c) reaches into U1 kinematics — once the rope cuts the package becomes a free-fall projectile while the helicopter keeps accelerating, so the separation comes from a Δ(½at²) calculation."
  },
  stem_id: "wb1988b1",
  label: "1988B1",
  page: 61,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "1988B1. A helicopter holds a 70 kg package suspended from a rope of length 5.0 m. The system accelerates upward at 5.2 m/s². Air resistance on the package is negligible. Use g = 9.8 m/s².",
  stem_image: { page: 61, bbox: [0.55, 0.05, 0.92, 0.30], caption: "Figure: helicopter with package on rope", alt: "Helicopter rising with a 70 kg package suspended below it on a 5 m rope." },
  children: [
    {
      id: "q_wb1988b1_b",
      label: "1988B1(b)",
      prompt: "Determine the tension in the rope while the system accelerates upward at 5.2 m/s².",
      options: [
        "(A) $T = m(g+a) = 70(9.8 + 5.2) = 1050\\,\\text{N}$",
        "(B) $T = mg = 686\\,\\text{N}$",
        "(C) $T = m(g-a) = 322\\,\\text{N}$",
        "(D) $T = ma = 364\\,\\text{N}$",
      ],
      correct: "(A) $T = m(g+a) = 70(9.8 + 5.2) = 1050\\,\\text{N}$",
    },
    {
      id: "q_wb1988b1_c",
      label: "1988B1(c)",
      prompt: "When the upward velocity of the helicopter is 30 m/s, the rope is cut. The helicopter continues to accelerate upward at 5.2 m/s². Determine the distance between the helicopter and the package 2.0 s after the rope is cut. (Take g = 9.8 m/s² downward; the rope is initially 5 m long.)",
      options: [
        "(A) $\\Delta d = \\tfrac12(a-(-g))t^2 + 5\\,\\text{m} = 30 + 5 = 35\\,\\text{m}$",
        "(B) $\\Delta d = \\tfrac12(a+g)t^2 = 30\\,\\text{m}$",
        "(C) $\\Delta d = (v_0)t = 60\\,\\text{m}$",
        "(D) $\\Delta d = \\tfrac12 g t^2 = 19.6\\,\\text{m}$",
      ],
      correct: "(A) $\\Delta d = \\tfrac12(a-(-g))t^2 + 5\\,\\text{m} = 30 + 5 = 35\\,\\text{m}$",
    },
  ]
},

// ─── 1998B1 — Two blocks, table edge, falling block
{
  qt_key: "atwood_pulley_pack",
  stem_id: "wb1998b1",
  label: "1998B1",
  page: 61,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "1998B1. Two small blocks each of mass m are connected by a string of constant length 4h and negligible mass. Block A sits on a smooth tabletop; block B hangs over the edge. The tabletop is a height 2h above the floor. Block B is released from rest at a height h above the floor at t = 0. Express answers in terms of h, m, and g.",
  stem_image: { page: 61, bbox: [0.55, 0.34, 0.92, 0.66], caption: "Figure: smooth table with hanging block", alt: "Block A on a smooth tabletop connected by string over edge to block B hanging above the floor." },
  children: [
    {
      id: "q_wb1998b1_a",
      label: "1998B1(a)",
      prompt: "Determine the magnitude of the acceleration of block B as it descends.",
      options: [
        "(A) $a = g/2$",
        "(B) $a = g$",
        "(C) $a = 2g$",
        "(D) $a = 0$ (the string holds B in place)",
      ],
      correct: "(A) $a = g/2$",
    },
    {
      id: "q_wb1998b1_b",
      label: "1998B1(b)",
      prompt: "Determine the time t₁ at which block B strikes the floor (after falling a distance h from rest with acceleration g/2).",
      options: [
        "(A) $t_1 = 2\\sqrt{h/g}$",
        "(B) $t_1 = \\sqrt{2h/g}$",
        "(C) $t_1 = \\sqrt{h/g}$",
        "(D) $t_1 = 2h/g$",
      ],
      correct: "(A) $t_1 = 2\\sqrt{h/g}$",
    },
    {
      id: "q_wb1998b1_e",
      label: "1998B1(e)",
      prompt: "After block B strikes the floor and stops, block A coasts at the speed it had at impact and eventually slides off the edge of the table. Determine the horizontal distance between the two landing points.",
      options: [
        "(A) $d = 2h$",
        "(B) $d = h$",
        "(C) $d = 4h$",
        "(D) $d = h/2$",
      ],
      correct: "(A) $d = 2h$",
    },
  ]
},

// ─── 2000B2 — Blocks on incline at constant velocity, hanging mass M
{
  qt_key: "incline_block_with_friction",
  stem_id: "wb2000b2",
  label: "2000B2",
  page: 62,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "2000B2. Blocks 1 (mass m₁) and 2 (mass m₂) are connected by a light string and rest on an inclined plane of angle θ. They are connected to a hanging mass M by a second light string passing over a frictionless pulley at the top of the incline. The two-block train moves with constant velocity down the plane. The kinetic friction force on block 1 is f and on block 2 is 2f.",
  stem_image: { page: 62, bbox: [0.5, 0.05, 0.95, 0.30], caption: "Figure: two blocks on incline with hanging mass", alt: "Two blocks on an incline of angle θ connected by string, with a string passing over a pulley at the top connecting to a hanging mass M." },
  children: [
    {
      id: "q_wb2000b2_b",
      label: "2000B2(b)",
      prompt: "Determine the coefficient of kinetic friction between block 1 and the inclined plane.",
      options: [
        "(A) $\\mu_k = \\dfrac{f}{m_1 g \\cos\\theta}$",
        "(B) $\\mu_k = \\dfrac{f}{m_1 g \\sin\\theta}$",
        "(C) $\\mu_k = \\dfrac{f}{(m_1+m_2)\\,g}$",
        "(D) $\\mu_k = \\tan\\theta$",
      ],
      correct: "(A) $\\mu_k = \\dfrac{f}{m_1 g \\cos\\theta}$",
    },
    {
      id: "q_wb2000b2_c",
      label: "2000B2(c)",
      prompt: "Determine the value of the suspended mass M that allows blocks 1 and 2 to move with constant velocity down the incline.",
      options: [
        "(A) $M = (m_1+m_2)\\sin\\theta - \\dfrac{3f}{g}$",
        "(B) $M = (m_1+m_2)\\sin\\theta + \\dfrac{3f}{g}$",
        "(C) $M = (m_1+m_2)\\cos\\theta - \\dfrac{3f}{g}$",
        "(D) $M = (m_1+m_2)\\sin\\theta - \\dfrac{f}{g}$",
      ],
      correct: "(A) $M = (m_1+m_2)\\sin\\theta - \\dfrac{3f}{g}$",
    },
    {
      id: "q_wb2000b2_d",
      label: "2000B2(d)",
      prompt: "After the string between blocks 1 and 2 is cut, determine the magnitude of the acceleration of block 1 down the plane.",
      options: [
        "(A) $a = g\\sin\\theta - \\dfrac{f}{m_1}$",
        "(B) $a = g\\sin\\theta + \\dfrac{f}{m_1}$",
        "(C) $a = \\dfrac{f}{m_1}$",
        "(D) $a = g\\cos\\theta - \\dfrac{f}{m_1}$",
      ],
      correct: "(A) $a = g\\sin\\theta - \\dfrac{f}{m_1}$",
    },
  ]
},

// ─── 2003B1 — Climbing student rope-and-pulley
{
  qt_key: "climbing_student_pulley",
  qt: {
    id: "qt_wb_climbing_student_pulley",
    label: "Two-person rope-and-pulley with one accelerating climber (Newton's 2nd & 3rd laws)",
    section_ref: "2.3.A",
    primary_slo: "2.3.A.3",
    slo_weights: [
      { slo: "2.3.A.3", weight: 0.40 },  // 3rd-law force pairs across the rope
      { slo: "2.5.A.1", weight: 0.30 },  // F=ma on the accelerating climber
      { slo: "2.4.A.2", weight: 0.20 },  // standing student in equilibrium with N + T - mg = 0
      { slo: "2.2.B.1", weight: 0.10 },  // FBDs of both students
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "2.5.A.1", weight: 0.30 },  // intra-unit reinforcement
      { slo: "2.2.B.1", weight: 0.10 },
    ],
    lo_confidence: "high",
    notes: "Tension is the same on both sides of the massless pulley. Standing student's normal force closes via N + T − m_A g = 0; the climbing student's tension obeys T − m_B g = m_B a."
  },
  stem_id: "wb2003b1",
  label: "2003B1",
  page: 63,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "2003B1. A massless rope passes over a massless pulley attached to the ceiling. Student A (mass 70 kg) holds one end and stands on the floor at rest. Student B (mass 60 kg) holds the other end and is suspended at rest above the floor. Use g = 10 m/s².",
  stem_image: { page: 63, bbox: [0.5, 0.05, 0.92, 0.30], caption: "Figure: two students rope and pulley", alt: "Pulley on the ceiling with rope; Student A standing on the floor holding one end, Student B suspended in the air holding the other end." },
  children: [
    {
      id: "q_wb2003b1_b",
      label: "2003B1(b)",
      prompt: "Calculate the magnitude of the force exerted by the floor on Student A while both students are at rest.",
      options: [
        "(A) $N = m_A g - m_B g = 100\\,\\text{N}$",
        "(B) $N = m_A g = 700\\,\\text{N}$",
        "(C) $N = (m_A + m_B)\\,g = 1300\\,\\text{N}$",
        "(D) $N = m_B g = 600\\,\\text{N}$",
      ],
      correct: "(A) $N = m_A g - m_B g = 100\\,\\text{N}$",
    },
    {
      id: "q_wb2003b1_c",
      label: "2003B1(c)",
      prompt: "Student B then climbs upward at constant acceleration 0.25 m/s² with respect to the floor. Calculate the tension in the rope while Student B accelerates.",
      options: [
        "(A) $T = m_B(g + a) = 60(10.25) = 615\\,\\text{N}$",
        "(B) $T = m_B g = 600\\,\\text{N}$",
        "(C) $T = m_B(g - a) = 585\\,\\text{N}$",
        "(D) $T = m_B a = 15\\,\\text{N}$",
      ],
      correct: "(A) $T = m_B(g + a) = 60(10.25) = 615\\,\\text{N}$",
    },
    {
      id: "q_wb2003b1_d",
      label: "2003B1(d)",
      prompt: "While Student B accelerates at 0.25 m/s² up the rope, is Student A pulled upward off the floor?",
      options: [
        "(A) No — the rope tension (615 N) is less than Student A's weight (700 N), so the floor still pushes up on A.",
        "(B) Yes — any upward acceleration of B lifts A off the ground.",
        "(C) Yes — once B is moving, Newton's third law requires A to lift.",
        "(D) No — only the weight of B determines whether A lifts.",
      ],
      correct: "(A) No — the rope tension (615 N) is less than Student A's weight (700 N), so the floor still pushes up on A.",
    },
    {
      id: "q_wb2003b1_e",
      label: "2003B1(e)",
      prompt: "What is the minimum upward acceleration with which Student B must climb the rope to just lift Student A off the floor (T = m_A g)?",
      options: [
        "(A) $a_{\\min} = \\dfrac{(m_A - m_B)\\,g}{m_B} = \\dfrac{(70-60)(10)}{60} \\approx 1.67\\,\\text{m/s}^2$",
        "(B) $a_{\\min} = g = 10\\,\\text{m/s}^2$",
        "(C) $a_{\\min} = \\dfrac{m_A g}{m_B} \\approx 11.7\\,\\text{m/s}^2$",
        "(D) $a_{\\min} = \\dfrac{(m_A+m_B)\\,g}{m_B} \\approx 21.7\\,\\text{m/s}^2$",
      ],
      correct: "(A) $a_{\\min} = \\dfrac{(m_A - m_B)\\,g}{m_B} = \\dfrac{(70-60)(10)}{60} \\approx 1.67\\,\\text{m/s}^2$",
    },
  ]
},

// ─── 2003Bb1 — Ring on string in accelerating airplane
{
  qt_key: "ring_pendulum_accelerating_frame",
  qt: {
    id: "qt_wb_ring_pendulum_accel_frame",
    label: "String/ring pendulum in a horizontally-accelerating frame: angle from vertical",
    section_ref: "2.5.A",
    primary_slo: "2.5.A.1",
    slo_weights: [
      { slo: "2.5.A.1", weight: 0.40 }, // F=ma; horizontal component of T provides ma
      { slo: "1.5.A.3", weight: 0.25 }, // perpendicular component decomposition
      { slo: "1.2.B.1", weight: 0.20 }, // average accel from kinematics (cross-unit, U1)
      { slo: "2.4.A.2", weight: 0.15 }, // vertical equilibrium of ring
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "1.5.A.3", weight: 0.25 },
      { slo: "1.2.B.1", weight: 0.20 }, // cross-unit reinforcement to U1 kinematics
    ],
    lo_confidence: "high",
    notes: "The horizontal component of T provides ma while the vertical component balances mg, so tan θ = a/g. Computing a itself requires v = at (kinematics, U1)."
  },
  stem_id: "wb2003bb1",
  label: "2003Bb1",
  page: 64,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "2003Bb1 (modified). An airplane accelerates uniformly from rest down the runway. A passenger holds up a thin string of negligible mass with a ring of mass m tied to its end. The string makes an angle θ with the vertical while the plane accelerates. The plane reaches a takeoff speed of 65 m/s after accelerating for 30 s. Use g = 9.8 m/s².",
  stem_image: { page: 64, bbox: [0.5, 0.05, 0.92, 0.30], caption: "Figure: ring on a string tilted by acceleration", alt: "Inside an airplane cabin a ring hangs from a string from the ceiling; the string makes an angle θ with the vertical as the plane accelerates forward." },
  children: [
    {
      id: "q_wb2003bb1_b",
      label: "2003Bb1(b)",
      prompt: "Determine the minimum length of runway needed for the plane to reach 65 m/s from rest in 30 s.",
      options: [
        "(A) $d = \\tfrac12 a t^2 \\approx 975\\,\\text{m}$, with $a = v/t \\approx 2.17\\,\\text{m/s}^2$",
        "(B) $d = vt = 1950\\,\\text{m}$",
        "(C) $d = v^2/(2a) \\approx 488\\,\\text{m}$",
        "(D) $d = at = 65\\,\\text{m}$",
      ],
      correct: "(A) $d = \\tfrac12 a t^2 \\approx 975\\,\\text{m}$, with $a = v/t \\approx 2.17\\,\\text{m/s}^2$",
    },
    {
      id: "q_wb2003bb1_c",
      label: "2003Bb1(c)",
      prompt: "Determine the angle θ that the string makes with the vertical during the acceleration of the plane.",
      options: [
        "(A) $\\theta = \\arctan(a/g) = \\arctan(2.17/9.8) \\approx 12.5°$",
        "(B) $\\theta = \\arctan(g/a) \\approx 77.5°$",
        "(C) $\\theta = a/g\\,\\text{rad} \\approx 0.22°$",
        "(D) $\\theta = \\arcsin(a/g) \\approx 12.7°$ — close numerically but uses the wrong trig identity.",
      ],
      correct: "(A) $\\theta = \\arctan(a/g) = \\arctan(2.17/9.8) \\approx 12.5°$",
    },
  ]
},

// ─── 1981M1 — Block sliding up incline with horizontal force F
{
  qt_key: "incline_horizontal_F_pack",
  qt: {
    id: "qt_wb_incline_horizontal_force",
    label: "Block on incline driven by horizontal applied force (with friction)",
    section_ref: "2.7.A",
    primary_slo: "2.7.A.1",
    slo_weights: [
      { slo: "2.7.A.1", weight: 0.35 },   // kinetic friction
      { slo: "1.5.A.3", weight: 0.30 },   // 2-axis decomposition (along + perpendicular to incline)
      { slo: "2.5.A.1", weight: 0.25 },   // F=ma
      { slo: "2.4.A.2", weight: 0.10 },   // constant velocity case → ΣF=0
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "1.5.A.3", weight: 0.30 },   // cross-unit reinforcement to U1 vector decomp
      { slo: "2.5.A.1", weight: 0.25 },
    ],
    lo_confidence: "high",
    notes: "F has components both along the incline and pressing into the surface; the latter inflates the normal force and therefore the friction. The constant-velocity special case yields a clean algebraic constraint between θ and μ."
  },
  stem_id: "wb1981m1",
  label: "1981M1",
  page: 66,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "1981M1. A block of mass m slides up an inclined plane of angle θ under a horizontal applied force F directed into the foot of the incline. The coefficient of sliding (kinetic) friction between the block and the plane is μ. Use g for the acceleration of gravity.",
  stem_image: { page: 66, bbox: [0.5, 0.05, 0.92, 0.30], caption: "Figure: block on incline with horizontal F", alt: "Block on an inclined plane of angle θ; a horizontal force F is applied to the block, directed toward the incline." },
  children: [
    {
      id: "q_wb1981m1_b",
      label: "1981M1(b)",
      prompt: "Develop an expression for the block's acceleration up the plane.",
      options: [
        "(A) $a = \\dfrac{F\\cos\\theta - mg\\sin\\theta - \\mu(F\\sin\\theta + mg\\cos\\theta)}{m}$",
        "(B) $a = \\dfrac{F - mg\\sin\\theta - \\mu mg\\cos\\theta}{m}$",
        "(C) $a = \\dfrac{F\\cos\\theta - mg\\sin\\theta + \\mu(F\\sin\\theta + mg\\cos\\theta)}{m}$",
        "(D) $a = \\dfrac{F\\sin\\theta - mg\\cos\\theta - \\mu(F\\cos\\theta + mg\\sin\\theta)}{m}$",
      ],
      correct: "(A) $a = \\dfrac{F\\cos\\theta - mg\\sin\\theta - \\mu(F\\sin\\theta + mg\\cos\\theta)}{m}$",
    },
    {
      id: "q_wb1981m1_c",
      label: "1981M1(c)",
      prompt: "What relation must θ and μ satisfy in order for the constant-velocity solution F = (mg sin θ + μ mg cos θ)/(cos θ − μ sin θ) to remain physically meaningful (F > 0)?",
      options: [
        "(A) $\\tan\\theta < 1/\\mu$",
        "(B) $\\tan\\theta > \\mu$",
        "(C) $\\sin\\theta < \\mu$",
        "(D) $\\theta < \\mu$",
      ],
      correct: "(A) $\\tan\\theta < 1/\\mu$",
    },
  ]
},

// ─── 2007M1 — Block pulled at angle on rough horizontal surface
{
  qt_key: "horizontal_pull_at_angle",
  qt: {
    id: "qt_wb_horiz_pull_at_angle",
    label: "Horizontal pull at an angle affecting normal force",  // existing QT title
    section_ref: "2.7.A",
    primary_slo: "2.7.A.1",
    slo_weights: [
      { slo: "2.7.A.1", weight: 0.40 },   // kinetic friction & μ derivation
      { slo: "2.4.A.2", weight: 0.25 },   // vertical equilibrium for normal force
      { slo: "1.5.A.3", weight: 0.20 },   // perpendicular-component decomposition of F
      { slo: "2.5.A.1", weight: 0.15 },   // F=ma along x
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "1.5.A.3", weight: 0.20 },
      { slo: "2.5.A.1", weight: 0.15 },
    ],
    lo_confidence: "high",
    notes: "Lift component of the applied force reduces N, which in turn reduces μ_k N. The 'losing-contact' limit gives the maximum acceleration the block can have while still touching the ground."
  },
  stem_id: "wb2007m1",
  label: "2007M1",
  page: 67,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "2007M1. A block of mass m is pulled along a rough horizontal surface by a constant force of magnitude F₁ acting at angle θ above horizontal. The block accelerates at a₁. Express answers in terms of m, F₁, θ, a₁, and fundamental constants.",
  stem_image: { page: 67, bbox: [0.5, 0.05, 0.92, 0.25], caption: "Figure: block pulled at angle θ", alt: "Block on horizontal surface being pulled by a force F1 at angle θ above the horizontal." },
  children: [
    {
      id: "q_wb2007m1_b",
      label: "2007M1(b)",
      prompt: "Derive an expression for the normal force exerted by the surface on the block.",
      options: [
        "(A) $N = mg - F_1 \\sin\\theta$",
        "(B) $N = mg + F_1 \\sin\\theta$",
        "(C) $N = mg - F_1 \\cos\\theta$",
        "(D) $N = mg$ — the angle does not affect the normal force.",
      ],
      correct: "(A) $N = mg - F_1 \\sin\\theta$",
    },
    {
      id: "q_wb2007m1_c",
      label: "2007M1(c)",
      prompt: "Derive an expression for the coefficient of kinetic friction between the block and the surface.",
      options: [
        "(A) $\\mu = \\dfrac{F_1\\cos\\theta - m a_1}{mg - F_1 \\sin\\theta}$",
        "(B) $\\mu = \\dfrac{F_1\\cos\\theta + m a_1}{mg - F_1 \\sin\\theta}$",
        "(C) $\\mu = \\dfrac{F_1\\sin\\theta - m a_1}{mg - F_1 \\cos\\theta}$",
        "(D) $\\mu = \\dfrac{m a_1}{mg}$",
      ],
      correct: "(A) $\\mu = \\dfrac{F_1\\cos\\theta - m a_1}{mg - F_1 \\sin\\theta}$",
    },
    {
      id: "q_wb2007m1_e",
      label: "2007M1(e)",
      prompt: "Derive the magnitude of the greatest acceleration $a_{\\max}$ the block can have and still maintain contact with the ground (i.e. the limit at which the normal force just reaches zero).",
      options: [
        "(A) $a_{\\max} = g\\cot\\theta$",
        "(B) $a_{\\max} = g\\tan\\theta$",
        "(C) $a_{\\max} = g$",
        "(D) $a_{\\max} = g\\sin\\theta$",
      ],
      correct: "(A) $a_{\\max} = g\\cot\\theta$",
    },
  ]
},

// ─── 1996M2 — Forklift with box on platform, lowering and accelerating
{
  qt_key: "forklift_box_pack",
  qt: {
    id: "qt_wb_forklift_combined_accel",
    label: "Box on lowering forklift platform with combined vertical + horizontal acceleration",
    section_ref: "2.6.C",
    primary_slo: "2.6.C.1",
    slo_weights: [
      { slo: "2.6.C.1", weight: 0.35 },   // apparent weight when accelerating
      { slo: "2.5.A.1", weight: 0.25 },   // F=ma along both axes
      { slo: "2.7.B.1", weight: 0.20 },   // static friction provides horizontal acceleration
      { slo: "1.5.B.1", weight: 0.20 },   // 2D motion / parametric path (cross-unit, U1)
    ],
    aligned_slos: ["2.5.A.1"],
    reinforcement_slos: [
      { slo: "2.7.B.1", weight: 0.20 },
      { slo: "1.5.B.1", weight: 0.20 },   // cross-unit reinforcement to U1 2D motion
    ],
    lo_confidence: "high",
    notes: "Vertical: N = m(g − a_y). Horizontal: friction provides ma_x, so f = m a_x and μ_min = a_x /(g − a_y). The path y(x) comes from eliminating t between the two kinematic equations — this last part reaches into U1 1.5.B."
  },
  stem_id: "wb1996m2",
  label: "1996M2",
  page: 68,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "1996M2. A 300 kg box rests on a horizontal platform attached to a forklift. From rest at t = 0 the box is lowered with downward acceleration a_y = 1.5 m/s². At the same time the forklift accelerates forward at a_x = 2 m/s². Use g = 9.8 m/s².",
  stem_image: { page: 68, bbox: [0.5, 0.05, 0.92, 0.30], caption: "Figure: forklift box", alt: "Forklift with a 300 kg box resting on its horizontal platform; the platform lowers while the forklift moves forward." },
  children: [
    {
      id: "q_wb1996m2_a",
      label: "1996M2(a)",
      prompt: "Determine the upward force exerted by the platform on the box while it is being lowered with downward acceleration 1.5 m/s².",
      options: [
        "(A) $N = m(g - a_y) = 300(9.8 - 1.5) = 2490\\,\\text{N}$",
        "(B) $N = mg = 2940\\,\\text{N}$",
        "(C) $N = m(g + a_y) = 3390\\,\\text{N}$",
        "(D) $N = m a_y = 450\\,\\text{N}$",
      ],
      correct: "(A) $N = m(g - a_y) = 300(9.8 - 1.5) = 2490\\,\\text{N}$",
    },
    {
      id: "q_wb1996m2_b",
      label: "1996M2(b)",
      prompt: "Determine the magnitude of the static frictional force on the box (the only horizontal force on the box once the forklift accelerates forward at 2 m/s²).",
      options: [
        "(A) $f = m a_x = 300(2) = 600\\,\\text{N}$",
        "(B) $f = \\mu m g = 588\\,\\text{N}$",
        "(C) $f = m(a_x - a_y) = 150\\,\\text{N}$",
        "(D) $f = m\\sqrt{a_x^2 + a_y^2} = 750\\,\\text{N}$",
      ],
      correct: "(A) $f = m a_x = 300(2) = 600\\,\\text{N}$",
    },
    {
      id: "q_wb1996m2_c",
      label: "1996M2(c)",
      prompt: "Given that the box does not slip, determine the minimum possible coefficient of static friction between the box and the platform.",
      options: [
        "(A) $\\mu_{\\min} = \\dfrac{a_x}{g - a_y} = \\dfrac{2}{9.8 - 1.5} \\approx 0.24$",
        "(B) $\\mu_{\\min} = \\dfrac{a_x}{g} \\approx 0.20$",
        "(C) $\\mu_{\\min} = \\dfrac{a_y}{g} \\approx 0.15$",
        "(D) $\\mu_{\\min} = \\dfrac{a_x + a_y}{g} \\approx 0.36$",
      ],
      correct: "(A) $\\mu_{\\min} = \\dfrac{a_x}{g - a_y} = \\dfrac{2}{9.8 - 1.5} \\approx 0.24$",
    },
    {
      id: "q_wb1996m2_d",
      label: "1996M2(d)",
      prompt: "Determine an equation y(x) for the path of the box if at t = 0 the box is at x = 0, y = 2 m with zero velocity, while undergoing constant a_x = 2 m/s² and a_y = −1.5 m/s².",
      options: [
        "(A) $y = 2 - 0.75\\,x$",
        "(B) $y = 2 - 1.5\\,x$",
        "(C) $y = 2 - 0.75\\,x^2$",
        "(D) $y = 2 + 0.75\\,x$",
      ],
      correct: "(A) $y = 2 - 0.75\\,x$",
    },
  ]
},

// ─── 1998M3 — Stacked blocks on table (already-existing QT for stacked)
{
  qt_key: "stacked_blocks_friction_pack",
  qt: {
    id: "qt_wb_stacked_block_friction",
    label: "Stacked blocks & friction-limited acceleration",  // existing QT title
    section_ref: "2.7.B",
    primary_slo: "2.7.B.1",
    slo_weights: [
      { slo: "2.7.B.1", weight: 0.35 },  // static friction limit
      { slo: "2.7.A.1", weight: 0.25 },  // kinetic friction once slipping
      { slo: "2.5.A.1", weight: 0.25 },  // F=ma
      { slo: "2.3.A.3", weight: 0.15 },  // 3rd-law action–reaction at the contact
    ],
    aligned_slos: ["2.7.A.1"],
    reinforcement_slos: [
      { slo: "2.5.A.1", weight: 0.25 },
      { slo: "2.3.A.3", weight: 0.15 },
    ],
    lo_confidence: "high",
    notes: "Maximum static friction sets when the system can stay at rest; once M is large enough, kinetic friction governs. The slip condition asks for the moment block 1's static friction can no longer drag it along with block 2 — at which point its acceleration is fixed by μ_k1 alone."
  },
  stem_id: "wb1998m3",
  label: "1998M3",
  page: 69,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "1998M3. Block 1 (mass m₁) sits on top of block 2 (mass m₂), which sits on a tabletop. A string connects block 2 over a pulley at the table's edge to a hanging mass M. The pulley is massless and frictionless. Coefficients of friction: μ_s1, μ_k1 between blocks 1 and 2; μ_s2, μ_k2 between block 2 and the table. Express answers in terms of these masses, coefficients, and g.",
  stem_image: { page: 69, bbox: [0.5, 0.05, 0.92, 0.30], caption: "Figure: stacked blocks with hanging mass M", alt: "Block of mass m1 on top of block of mass m2; m2 connected over a pulley at the table edge to a hanging mass M." },
  children: [
    {
      id: "q_wb1998m3_b",
      label: "1998M3(b)",
      prompt: "Determine the largest hanging mass M for which the blocks can remain at rest.",
      options: [
        "(A) $M_{\\max} = \\mu_{s2}(m_1 + m_2)$",
        "(B) $M_{\\max} = \\mu_{s2}\\,m_2$",
        "(C) $M_{\\max} = \\mu_{s1}\\,m_1$",
        "(D) $M_{\\max} = (m_1 + m_2)$",
      ],
      correct: "(A) $M_{\\max} = \\mu_{s2}(m_1 + m_2)$",
    },
    {
      id: "q_wb1998m3_c",
      label: "1998M3(c)",
      prompt: "If M is large enough that the blocks descend together (no slip between 1 and 2), determine the magnitude of their common acceleration.",
      options: [
        "(A) $a = \\dfrac{Mg - \\mu_{k2}(m_1+m_2)\\,g}{M + m_1 + m_2}$",
        "(B) $a = \\dfrac{Mg}{M + m_1 + m_2}$",
        "(C) $a = \\dfrac{Mg - \\mu_{k2}\\,m_2 g}{M + m_2}$",
        "(D) $a = \\dfrac{Mg - \\mu_{k1}\\,m_1 g}{M + m_1}$",
      ],
      correct: "(A) $a = \\dfrac{Mg - \\mu_{k2}(m_1+m_2)\\,g}{M + m_1 + m_2}$",
    },
    {
      id: "q_wb1998m3_d_i",
      label: "1998M3(d)i",
      prompt: "If M is large enough that block 1 slips on block 2 while M descends, determine the magnitude of the acceleration $a_1$ of block 1.",
      options: [
        "(A) $a_1 = \\mu_{k1}\\,g$",
        "(B) $a_1 = \\mu_{s1}\\,g$",
        "(C) $a_1 = \\mu_{k1}\\,g\\cos\\theta$",
        "(D) $a_1 = g$",
      ],
      correct: "(A) $a_1 = \\mu_{k1}\\,g$",
    },
  ]
},

// ─── 2005M1 — Air resistance F=-kv on rising/falling ball
{
  qt_key: "terminal_velocity_pack",
  qt: {
    id: "qt_wb_terminal_velocity_drag",
    label: "Terminal velocity and velocity-dependent drag",  // existing QT title
    section_ref: "2.5.A",
    primary_slo: "2.5.A.1",
    slo_weights: [
      { slo: "2.5.A.1", weight: 0.45 },  // F=ma with velocity-dependent F
      { slo: "2.4.A.2", weight: 0.25 },  // ΣF=0 at terminal
      { slo: "1.3.A.1", weight: 0.20 },  // v(t) representations (cross-unit, U1)
      { slo: "2.6.B.1", weight: 0.10 },  // gravity as constant
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "1.3.A.1", weight: 0.20 },  // cross-unit reinforcement to U1 motion graphs
      { slo: "2.6.B.1", weight: 0.10 },
    ],
    lo_confidence: "high",
    notes: "Drag opposes motion: on the way up it adds to gravity → larger |a|; on the way down it cancels gravity → smaller |a|, asymptote at v_T = Mg/k. So the descent is slower → takes longer."
  },
  stem_id: "wb2005m1",
  label: "2005M1",
  page: 70,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "2005M1 (modified). A ball of mass M is thrown vertically upward with initial speed v₀. It experiences a drag force F = −kv (k > 0). The positive direction for vector quantities is upward. Express answers in terms of M, k, v₀, and fundamental constants.",
  children: [
    {
      id: "q_wb2005m1_a",
      label: "2005M1(a)",
      prompt: "Does the magnitude of the ball's acceleration increase, decrease, or stay the same as it moves upward?",
      options: [
        "(A) Decreases — drag is downward (opposing upward velocity), and as v decreases the drag magnitude decreases, so the net force magnitude decreases.",
        "(B) Increases — drag grows as the ball rises and adds to gravity.",
        "(C) Stays the same — gravity is constant, so the acceleration is constant.",
        "(D) Decreases — gravity is the only force; drag is upward and grows as v decreases.",
      ],
      correct: "(A) Decreases — drag is downward (opposing upward velocity), and as v decreases the drag magnitude decreases, so the net force magnitude decreases.",
    },
    {
      id: "q_wb2005m1_b",
      label: "2005M1(b)",
      prompt: "Determine the terminal speed of the ball as it moves downward.",
      options: [
        "(A) $v_T = Mg/k$",
        "(B) $v_T = k/(Mg)$",
        "(C) $v_T = \\sqrt{Mg/k}$",
        "(D) $v_T = kv_0/M$",
      ],
      correct: "(A) $v_T = Mg/k$",
    },
    {
      id: "q_wb2005m1_c",
      label: "2005M1(c)",
      prompt: "Does the ball take longer to rise to its maximum height or longer to fall from there back to the launch height?",
      options: [
        "(A) Longer to fall — average speed during the fall is less than during the ascent because drag attenuates the descent before terminal speed.",
        "(B) Longer to rise — gravity decelerates it, so the ascent is slow.",
        "(C) Equal time — the trajectory is symmetric.",
        "(D) Longer to rise — drag adds to gravity on the way up, slowing it more than the fall.",
      ],
      correct: "(A) Longer to fall — average speed during the fall is less than during the ascent because drag attenuates the descent before terminal speed.",
    },
  ]
},

// ─── 1977B2 — Box on truck circular roadway (friction provides Fc)
{
  qt_key: "circular_friction_provides_fc",
  qt: {
    id: "qt_wb_circular_friction_fc",
    label: "Source of centripetal force (friction/normal/tension provides Fc)",  // existing QT title
    section_ref: "2.9.A",
    primary_slo: "2.9.A.2",
    slo_weights: [
      { slo: "2.9.A.2", weight: 0.50 },  // Fc as resultant of real forces
      { slo: "2.7.B.1", weight: 0.25 },  // static friction
      { slo: "2.4.A.2", weight: 0.15 },  // vertical equilibrium
      { slo: "2.2.B.1", weight: 0.10 },  // FBD
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "2.7.B.1", weight: 0.25 },
      { slo: "2.2.B.1", weight: 0.10 },
    ],
    lo_confidence: "high",
    notes: "Without banking, friction alone supplies the centripetal force, giving μ ≥ v²/(Rg). On a banked, frictionless roadway, the horizontal component of the normal force provides Fc, so N must exceed mg."
  },
  stem_id: "wb1977b2",
  label: "1977B2",
  page: 75,
  section: "Chapter 2 — Section B Circular Motion (FRQ)",
  stem_text: "1977B2. A box of mass M, held in place by friction, rides on the flatbed of a truck traveling with constant speed v on an unbanked circular roadway of radius R.",
  stem_image: { page: 75, bbox: [0.5, 0.05, 0.92, 0.30], caption: "Figure: box on truck on circular road", alt: "Top-down and side views of a box on the flatbed of a truck following a circular path of radius R." },
  children: [
    {
      id: "q_wb1977b2_b",
      label: "1977B2(b)",
      prompt: "What condition must the coefficient of static friction μ between the box and the truck bed satisfy so the box does not slide on the unbanked road?",
      options: [
        "(A) $\\mu \\geq v^2/(Rg)$",
        "(B) $\\mu \\geq Rg/v^2$",
        "(C) $\\mu \\geq v/(Rg)$",
        "(D) $\\mu \\geq g/(Rv^2)$",
      ],
      correct: "(A) $\\mu \\geq v^2/(Rg)$",
    },
    {
      id: "q_wb1977b2_d",
      label: "1977B2(d)",
      prompt: "If the roadway is properly banked so the box stays in place even with no friction, which of the two forces acting on the box (gravity or the normal force from the bed) is greater in magnitude?",
      options: [
        "(A) The normal force is greater — its vertical component must balance mg, so N = mg/cosθ > mg.",
        "(B) Gravity is greater — the normal force only counters part of the weight on a banked surface.",
        "(C) They are equal — the box is not accelerating vertically.",
        "(D) The normal force is greater — but only because the road pushes harder on the box during the turn.",
      ],
      correct: "(A) The normal force is greater — its vertical component must balance mg, so N = mg/cosθ > mg.",
    },
  ]
},

// ─── 1984B1 — Vertical circle, T=2W at top
{
  qt_key: "vertical_circle_pack",
  qt: {
    id: "qt_wb_vertical_circle_top_bottom",
    label: "Tension at top/bottom of vertical circle",  // existing QT title
    section_ref: "2.9.A",
    primary_slo: "2.9.A.2",
    slo_weights: [
      { slo: "2.9.A.2", weight: 0.45 },  // Fc as net of T + W (or T − W)
      { slo: "2.5.A.1", weight: 0.20 },  // F=ma (centripetal)
      { slo: "2.2.B.1", weight: 0.15 },  // FBD on the circle
      { slo: "1.5.B.1", weight: 0.20 },  // 2D projectile after string cut (cross-unit, U1)
    ],
    aligned_slos: ["2.5.A.1"],
    reinforcement_slos: [
      { slo: "2.2.B.1", weight: 0.15 },
      { slo: "1.5.B.1", weight: 0.20 },  // cross-unit reinforcement to U1 2D motion
    ],
    lo_confidence: "high",
    notes: "At the top of the circle, T and gravity both point inward (toward the center), so the net inward force = T + Mg = M v²/L. Once the string is cut, the ball follows a horizontal-launch projectile from height 2L."
  },
  stem_id: "wb1984b1",
  label: "1984B1",
  page: 75,
  section: "Chapter 2 — Section B Circular Motion (FRQ)",
  stem_text: "1984B1. A ball of mass M attached to a string of length L moves in a circle in a vertical plane. At the top of the circle the string tension is twice the weight of the ball. At the bottom of the circle the ball just clears the ground. Air resistance is negligible. Express answers in terms of M, L, and g.",
  stem_image: { page: 75, bbox: [0.5, 0.34, 0.92, 0.66], caption: "Figure: ball in vertical circle", alt: "Ball of mass M on a string of length L moving in a vertical circle in a vertical plane." },
  children: [
    {
      id: "q_wb1984b1_a",
      label: "1984B1(a)",
      prompt: "Determine the magnitude (and direction) of the net force on the ball at the top of the circle, given that T = 2Mg there.",
      options: [
        "(A) $F_{net} = T + Mg = 3Mg$ directed downward (toward the center).",
        "(B) $F_{net} = T - Mg = Mg$ directed upward.",
        "(C) $F_{net} = T = 2Mg$ directed downward.",
        "(D) $F_{net} = 0$ — the ball is momentarily at rest at the top.",
      ],
      correct: "(A) $F_{net} = T + Mg = 3Mg$ directed downward (toward the center).",
    },
    {
      id: "q_wb1984b1_b",
      label: "1984B1(b)",
      prompt: "Determine the speed v₀ of the ball at the top of the circle.",
      options: [
        "(A) $v_0 = \\sqrt{3gL}$",
        "(B) $v_0 = \\sqrt{gL}$",
        "(C) $v_0 = \\sqrt{2gL}$",
        "(D) $v_0 = \\sqrt{Lg/3}$",
      ],
      correct: "(A) $v_0 = \\sqrt{3gL}$",
    },
    {
      id: "q_wb1984b1_c",
      label: "1984B1(c)",
      prompt: "The string is cut at the top. Determine the time it takes the ball to reach the ground (the bottom of the circle is at ground level, so the top is at height 2L).",
      options: [
        "(A) $t = 2\\sqrt{L/g}$",
        "(B) $t = \\sqrt{L/g}$",
        "(C) $t = \\sqrt{2L/g}$",
        "(D) $t = 2L/g$",
      ],
      correct: "(A) $t = 2\\sqrt{L/g}$",
    },
    {
      id: "q_wb1984b1_d",
      label: "1984B1(d)",
      prompt: "Determine the horizontal distance the ball travels before hitting the ground after the string is cut at the top.",
      options: [
        "(A) $d = v_0 t = 2\\sqrt{3}\\,L$",
        "(B) $d = v_0 t = 2L$",
        "(C) $d = v_0 t = \\sqrt{3}\\,L$",
        "(D) $d = v_0 t = 6L$",
      ],
      correct: "(A) $d = v_0 t = 2\\sqrt{3}\\,L$",
    },
  ]
},

// ─── 1997B2 — Circular motion handheld device
{
  qt_key: "centripetal_calc_pack",
  qt: {
    id: "qt_wb_centripetal_calc",
    label: "Centripetal acceleration and force calculations (a = v²/r)",  // existing QT title
    section_ref: "2.9.A",
    primary_slo: "2.9.A.2",
    slo_weights: [
      { slo: "2.9.A.2", weight: 0.45 }, // Fc & ac formulas
      { slo: "2.5.A.1", weight: 0.20 },
      { slo: "2.4.A.2", weight: 0.15 }, // vertical-balance argument that string can't be horizontal
      { slo: "1.5.A.3", weight: 0.20 }, // tension component decomposition
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "2.5.A.1", weight: 0.20 },
      { slo: "1.5.A.3", weight: 0.20 },
    ],
    lo_confidence: "high",
    notes: "If the cord is taken to be horizontal, T = mv²/r gives a clean number; the actual cord must dip below horizontal so the vertical component of T balances mg, which in turn fixes the angle from horizontal."
  },
  stem_id: "wb1997b2",
  label: "1997B2",
  page: 77,
  section: "Chapter 2 — Section B Circular Motion (FRQ)",
  stem_text: "1997B2 (modified). Two students swing a ball of mass 0.200 kg in a horizontal circle of radius 0.500 m at a measured speed of 3.7 m/s. A spring scale on the cord reads 5.8 N. Friction and air resistance are negligible. Use g = 9.8 m/s².",
  stem_image: { page: 77, bbox: [0.5, 0.05, 0.92, 0.30], caption: "Figure: handheld circular motion device", alt: "Hand-held device with a rod, spring scale, glass guide tube, light cord and ball swung in a horizontal circle." },
  children: [
    {
      id: "q_wb1997b2_b",
      label: "1997B2(b)",
      prompt: "Assuming the cord is horizontal, calculate the expected tension in the cord.",
      options: [
        "(A) $T = mv^2/r = 0.200(3.7)^2/0.5 \\approx 5.5\\,\\text{N}$",
        "(B) $T = mg = 1.96\\,\\text{N}$",
        "(C) $T = m v / r \\approx 1.5\\,\\text{N}$",
        "(D) $T = m v^2 r \\approx 1.4\\,\\text{N}$",
      ],
      correct: "(A) $T = mv^2/r = 0.200(3.7)^2/0.5 \\approx 5.5\\,\\text{N}$",
    },
    {
      id: "q_wb1997b2_c",
      label: "1997B2(c)",
      prompt: "What is the percent difference between the calculated tension (5.5 N) and the measured tension (5.8 N), using the measured value as the reference?",
      options: [
        "(A) About −5%",
        "(B) About +5%",
        "(C) About −15%",
        "(D) About −0.5%",
      ],
      correct: "(A) About −5%",
    },
    {
      id: "q_wb1997b2_d_iii",
      label: "1997B2(d)iii",
      prompt: "Because the cord cannot be exactly horizontal, it must dip below horizontal so the vertical component of T balances mg. Calculate the angle the cord makes with the horizontal. (Use the measured tension 5.8 N.)",
      options: [
        "(A) $\\theta = \\arcsin(mg/T) = \\arcsin(1.96/5.8) \\approx 19.7°$ (≈ 21° using calculated T)",
        "(B) $\\theta = \\arctan(g/v^2) \\approx 35°$",
        "(C) $\\theta = \\arccos(mg/T) \\approx 70°$",
        "(D) $\\theta = 0°$ — the cord is horizontal.",
      ],
      correct: "(A) $\\theta = \\arcsin(mg/T) = \\arcsin(1.96/5.8) \\approx 19.7°$ (≈ 21° using calculated T)",
    },
  ]
},

// ─── 2002B2B — Conical pendulum
{
  qt_key: "conical_pendulum_pack",
  qt: {
    id: "qt_wb_conical_pendulum",
    label: "Conical pendulum: horizontal circle from a string at angle θ from vertical",
    section_ref: "2.9.A",
    primary_slo: "2.9.A.2",
    slo_weights: [
      { slo: "2.9.A.2", weight: 0.40 }, // Fc geometry
      { slo: "1.5.A.3", weight: 0.30 }, // T sin θ horizontal, T cos θ vertical
      { slo: "2.4.A.2", weight: 0.15 }, // vertical equilibrium
      { slo: "2.5.A.1", weight: 0.15 }, // horizontal F = ma_c
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "1.5.A.3", weight: 0.30 },
      { slo: "2.5.A.1", weight: 0.15 },
    ],
    lo_confidence: "high",
    notes: "Vertical: T cos θ = mg → m = T cos θ / g. Horizontal: T sin θ = m v² / r with r = ℓ sin θ → v = √(ℓ sin θ tan θ · g)."
  },
  stem_id: "wb2002b2b",
  label: "2002B2B",
  page: 78,
  section: "Chapter 2 — Section B Circular Motion (FRQ)",
  stem_text: "2002B2B. A ball attached to a string of length ℓ swings in a horizontal circle at constant speed. The string makes a constant angle θ with the vertical, and the tension in the string is T. Express answers in terms of T, ℓ, θ, and g.",
  stem_image: { page: 78, bbox: [0.5, 0.34, 0.92, 0.66], caption: "Figure: conical pendulum", alt: "Conical pendulum: ball at the end of string of length ℓ that makes angle θ with the vertical, sweeping out a horizontal circle." },
  children: [
    {
      id: "q_wb2002b2b_b",
      label: "2002B2B(b)",
      prompt: "Determine the mass of the ball.",
      options: [
        "(A) $m = T\\cos\\theta\\,/\\,g$",
        "(B) $m = T\\sin\\theta\\,/\\,g$",
        "(C) $m = T\\,/\\,g$",
        "(D) $m = T\\tan\\theta\\,/\\,g$",
      ],
      correct: "(A) $m = T\\cos\\theta\\,/\\,g$",
    },
    {
      id: "q_wb2002b2b_c",
      label: "2002B2B(c)",
      prompt: "Determine the speed of the ball.",
      options: [
        "(A) $v = \\sqrt{\\ell\\,g\\,\\sin\\theta\\tan\\theta}$",
        "(B) $v = \\sqrt{\\ell\\,g\\,\\cos\\theta}$",
        "(C) $v = \\sqrt{T\\ell/m}$",
        "(D) $v = \\sqrt{g\\ell}$",
      ],
      correct: "(A) $v = \\sqrt{\\ell\\,g\\,\\sin\\theta\\tan\\theta}$",
    },
    {
      id: "q_wb2002b2b_d",
      label: "2002B2B(d)",
      prompt: "Determine the frequency of revolution f of the ball.",
      options: [
        "(A) $f = \\dfrac{1}{2\\pi}\\sqrt{\\dfrac{g}{\\ell\\cos\\theta}}$",
        "(B) $f = \\dfrac{1}{2\\pi}\\sqrt{\\dfrac{g}{\\ell\\sin\\theta}}$",
        "(C) $f = \\sqrt{\\dfrac{g}{\\ell}}$",
        "(D) $f = \\dfrac{2\\pi}{\\sqrt{g\\ell}}$",
      ],
      correct: "(A) $f = \\dfrac{1}{2\\pi}\\sqrt{\\dfrac{g}{\\ell\\cos\\theta}}$",
    },
  ]
},

// ─── 2009Bb1 — Disk on frictionless table with hanging mass
{
  qt_key: "disk_on_table_pack",
  qt: {
    id: "qt_wb_disk_on_table_period",
    label: "Disk on frictionless table tethered through hole to hanging mass: period derivation",
    section_ref: "2.9.A",
    primary_slo: "2.9.A.2",
    slo_weights: [
      { slo: "2.9.A.2", weight: 0.40 }, // centripetal force from string
      { slo: "2.4.A.2", weight: 0.30 }, // hanging mass in equilibrium → T = m_2 g
      { slo: "2.5.A.1", weight: 0.15 }, // F=ma on disk
      { slo: "2.6.B.1", weight: 0.15 }, // weight as constant force
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "2.5.A.1", weight: 0.15 },
      { slo: "2.6.B.1", weight: 0.15 },
    ],
    lo_confidence: "high",
    notes: "If the hanging mass is stationary, tension T = m_2 g, which provides the centripetal force on the disk: m_2 g = m_1 (2π/P)² r → P = 2π √(m_1 r/(m_2 g)). Then P² = 4π² m_1 r / g · (1/m_2), so a graph of P² vs 1/m_2 has slope 4π² m_1 r / g."
  },
  stem_id: "wb2009bb1",
  label: "2009Bb1",
  page: 79,
  section: "Chapter 2 — Section B Circular Motion (FRQ)",
  stem_text: "2009Bb1. A small disk of mass m₁ on a frictionless table is attached via a string passing through a hole in the table and a vertical guide tube to a hanging mass m₂. A student rotates the disk in a circle of constant radius r and another student measures the period P. Constants: m₁ = 0.012 kg, r = 0.80 m. Use g for the acceleration of gravity.",
  stem_image: { page: 79, bbox: [0.5, 0.05, 0.92, 0.35], caption: "Figure: disk on table with hanging mass through hole", alt: "Disk of mass m1 on a frictionless table connected by a string through a hole in the table to a hanging mass m2." },
  children: [
    {
      id: "q_wb2009bb1_a",
      label: "2009Bb1(a)",
      prompt: "Derive the period equation $P = 2\\pi\\sqrt{m_1 r/(m_2 g)}$. Which step correctly closes the derivation?",
      options: [
        "(A) Set $m_2 g$ (tension on hanging mass) equal to $m_1 v^2/r$ on the disk, then substitute $v = 2\\pi r/P$ and solve for P.",
        "(B) Set $m_1 g = m_2 v^2/r$ (tension equals the disk's weight) and solve for P.",
        "(C) Use $P = 2\\pi/\\omega$ with $\\omega = \\sqrt{g/r}$, ignoring the hanging mass.",
        "(D) Use conservation of energy: $\\tfrac12 m_1 v^2 = m_2 g r$, then $P = 2\\pi r/v$.",
      ],
      correct: "(A) Set $m_2 g$ (tension on hanging mass) equal to $m_1 v^2/r$ on the disk, then substitute $v = 2\\pi r/P$ and solve for P.",
    },
    {
      id: "q_wb2009bb1_b",
      label: "2009Bb1(b)",
      prompt: "What two quantities should be plotted to give a straight line whose slope determines g?",
      options: [
        "(A) $P^2$ vs $1/m_2$",
        "(B) $P$ vs $m_2$",
        "(C) $P$ vs $1/m_2$",
        "(D) $1/P$ vs $m_2$",
      ],
      correct: "(A) $P^2$ vs $1/m_2$",
    },
    {
      id: "q_wb2009bb1_d",
      label: "2009Bb1(d)",
      prompt: "Given the slope of the best-fit P² vs 1/m₂ line is approximately 0.0381 kg·s², calculate the experimental value of g (m₁ = 0.012 kg, r = 0.80 m).",
      options: [
        "(A) $g = \\dfrac{4\\pi^2 m_1 r}{\\text{slope}} = \\dfrac{4\\pi^2 (0.012)(0.80)}{0.0381} \\approx 9.94\\,\\text{m/s}^2$",
        "(B) $g = \\dfrac{4\\pi^2 m_1 r}{(\\text{slope})^2} \\approx 261\\,\\text{m/s}^2$",
        "(C) $g = \\dfrac{m_1 r}{\\text{slope}} \\approx 0.25\\,\\text{m/s}^2$",
        "(D) $g = \\dfrac{2\\pi m_1 r}{\\text{slope}} \\approx 1.58\\,\\text{m/s}^2$",
      ],
      correct: "(A) $g = \\dfrac{4\\pi^2 m_1 r}{\\text{slope}} = \\dfrac{4\\pi^2 (0.012)(0.80)}{0.0381} \\approx 9.94\\,\\text{m/s}^2$",
    },
  ]
},

// ─── 1995B3 — Roller-coaster pendulum on rod (multi-scenario)
{
  qt_key: "rollercoaster_pendulum_pack",
  qt: {
    id: "qt_wb_rollercoaster_pendulum",
    label: "Pendulum-on-rod inside a roller-coaster car: T_h, T_v under varying acceleration",
    section_ref: "2.9.A",
    primary_slo: "2.5.A.1",
    slo_weights: [
      { slo: "2.5.A.1", weight: 0.40 }, // F=ma in horizontal & vertical directions
      { slo: "2.9.A.2", weight: 0.20 }, // centripetal force at top of vertical loop
      { slo: "1.5.A.3", weight: 0.20 }, // component decomposition
      { slo: "2.4.A.2", weight: 0.20 }, // equilibrium when accel = 0 (at-rest case)
    ],
    aligned_slos: ["2.4.A.2"],
    reinforcement_slos: [
      { slo: "2.9.A.2", weight: 0.20 },
      { slo: "1.5.A.3", weight: 0.20 },
    ],
    lo_confidence: "high",
    notes: "Apply Newton's second law to the suspended ball in each scenario; horizontal component of tension provides ma_horiz, vertical component balances mg + ma_vert. The vertical-loop case at the top inverts the sign convention because the string now points DOWN to the ball relative to the car, so 'tension up' becomes 'tension toward the bar at the top of the loop'."
  },
  stem_id: "wb1995b3",
  label: "1995B3",
  page: 73,
  section: "Chapter 2 Dynamics — Free Response",
  stem_text: "1995B3. Inside a roller-coaster car, a 0.10 kg ball is suspended from a horizontal safety bar by a short, light, inextensible string. Use g = 10 m/s².",
  stem_image: { page: 73, bbox: [0.10, 0.05, 0.92, 0.30], caption: "Figure: roller-coaster track and pendulum-on-rod", alt: "Roller-coaster track shape including incline up, incline down, and a vertical circular loop; a small ball hangs by string from a horizontal bar inside the car." },
  children: [
    {
      id: "q_wb1995b3_aii",
      label: "1995B3(a)ii",
      prompt: "At point A the car is at rest. Calculate the tension in the string supporting the ball.",
      options: [
        "(A) $T = mg = 1\\,\\text{N}$",
        "(B) $T = 0$ — the string is slack at rest.",
        "(C) $T = ma = 0.5\\,\\text{N}$",
        "(D) $T = m\\sqrt{g^2 + a^2} \\approx 1.12\\,\\text{N}$",
      ],
      correct: "(A) $T = mg = 1\\,\\text{N}$",
    },
    {
      id: "q_wb1995b3_b_th",
      label: "1995B3(b) Th",
      prompt: "At point B the car moves horizontally with horizontal acceleration 5.0 m/s². Calculate the horizontal component of the tension in the string T_h.",
      options: [
        "(A) $T_h = m a = (0.10)(5.0) = 0.5\\,\\text{N}$",
        "(B) $T_h = m g \\cos\\theta = 0.87\\,\\text{N}$",
        "(C) $T_h = 0$",
        "(D) $T_h = m\\sqrt{a^2+g^2} \\approx 1.12\\,\\text{N}$",
      ],
      correct: "(A) $T_h = m a = (0.10)(5.0) = 0.5\\,\\text{N}$",
    },
    {
      id: "q_wb1995b3_b_tv",
      label: "1995B3(b) Tv",
      prompt: "At point B (horizontal acceleration only), calculate the vertical component of the tension T_v.",
      options: [
        "(A) $T_v = m g = 1\\,\\text{N}$",
        "(B) $T_v = 0$",
        "(C) $T_v = m a = 0.5\\,\\text{N}$",
        "(D) $T_v = m(g+a) = 1.5\\,\\text{N}$",
      ],
      correct: "(A) $T_v = m g = 1\\,\\text{N}$",
    },
    {
      id: "q_wb1995b3_c_th",
      label: "1995B3(c) Th",
      prompt: "At point C the car moves up a 30° incline at constant speed of 30 m/s (no acceleration). Determine T_h.",
      options: [
        "(A) $T_h = 0$ — no acceleration means the string hangs straight down (no horizontal component).",
        "(B) $T_h = m g \\sin 30° = 0.5\\,\\text{N}$",
        "(C) $T_h = m g \\cos 30° = 0.87\\,\\text{N}$",
        "(D) $T_h = m v^2 / r$",
      ],
      correct: "(A) $T_h = 0$ — no acceleration means the string hangs straight down (no horizontal component).",
    },
    {
      id: "q_wb1995b3_c_tv",
      label: "1995B3(c) Tv",
      prompt: "At point C (constant speed up 30° incline), determine T_v.",
      options: [
        "(A) $T_v = m g = 1\\,\\text{N}$",
        "(B) $T_v = m g \\cos 30° = 0.87\\,\\text{N}$",
        "(C) $T_v = m g \\sin 30° = 0.5\\,\\text{N}$",
        "(D) $T_v = 0$",
      ],
      correct: "(A) $T_v = m g = 1\\,\\text{N}$",
    },
    {
      id: "q_wb1995b3_d_th",
      label: "1995B3(d) Th",
      prompt: "At point D the car moves down a 30° incline with acceleration 5.0 m/s² (along the incline, downhill). Determine T_h.",
      options: [
        "(A) $T_h = m a \\cos 30° = (0.10)(5.0)\\cos 30° \\approx 0.43\\,\\text{N}$",
        "(B) $T_h = m a = 0.5\\,\\text{N}$",
        "(C) $T_h = m g \\sin 30° = 0.5\\,\\text{N}$",
        "(D) $T_h = 0$",
      ],
      correct: "(A) $T_h = m a \\cos 30° = (0.10)(5.0)\\cos 30° \\approx 0.43\\,\\text{N}$",
    },
    {
      id: "q_wb1995b3_d_tv",
      label: "1995B3(d) Tv",
      prompt: "At point D (down 30° incline at 5.0 m/s² along the slope), determine T_v.",
      options: [
        "(A) $T_v = m g - m a \\sin 30° = (0.10)(10) - (0.10)(5)\\sin 30° = 0.75\\,\\text{N}$",
        "(B) $T_v = m g = 1\\,\\text{N}$",
        "(C) $T_v = m g \\cos 30° = 0.87\\,\\text{N}$",
        "(D) $T_v = 0$",
      ],
      correct: "(A) $T_v = m g - m a \\sin 30° = (0.10)(10) - (0.10)(5)\\sin 30° = 0.75\\,\\text{N}$",
    },
    {
      id: "q_wb1995b3_e_tv",
      label: "1995B3(e) Tv",
      prompt: "At point E the car is upside-down at the top of a vertical loop of radius 25 m at speed 25 m/s (no tangential acceleration). With the bar above, the string now points 'down' (toward the center of the loop, which is below the bar from the rider's perspective). Determine T_v as the vertical component of the string's force on the ball, taken as positive when pulling the ball toward the bar (upward in the lab frame).",
      options: [
        "(A) $T_v = m v^2/r - m g = (0.10)(25)^2/25 - (0.10)(10) = 1.5\\,\\text{N}$ — but the string pulls the ball toward the bar, i.e. UP toward the center of the (inverted) loop — so the string tension on the ball is ${\\bf -1.5\\,\\text{N}}$ in the original (string-down-from-the-bar) sign convention.",
        "(B) $T_v = m g = 1\\,\\text{N}$",
        "(C) $T_v = 0$",
        "(D) $T_v = m v^2/r = 2.5\\,\\text{N}$",
      ],
      correct: "(A) $T_v = m v^2/r - m g = (0.10)(25)^2/25 - (0.10)(10) = 1.5\\,\\text{N}$ — but the string pulls the ball toward the bar, i.e. UP toward the center of the (inverted) loop — so the string tension on the ball is ${\\bf -1.5\\,\\text{N}}$ in the original (string-down-from-the-bar) sign convention.",
    },
  ]
},

// ─── 1998B6 — Heavy ball on string at lowest/highest swing point
{
  qt_key: "circular_swing_velocity_acceleration",
  qt: {
    id: "qt_wb_swing_velocity_acceleration",
    label: "Velocity & acceleration direction in circular motion (conceptual)",  // existing QT title
    section_ref: "2.9.A",
    primary_slo: "2.9.A.1",
    slo_weights: [
      { slo: "2.9.A.1", weight: 0.50 }, // direction of v (tangent) and a (centripetal + possibly tangential)
      { slo: "2.9.A.2", weight: 0.20 }, // centripetal force concept
      { slo: "1.5.B.1", weight: 0.20 }, // post-cut projectile motion (cross-unit, U1)
      { slo: "2.6.B.1", weight: 0.10 }, // gravity as constant
    ],
    aligned_slos: ["2.9.A.2"],
    reinforcement_slos: [
      { slo: "1.5.B.1", weight: 0.20 },
      { slo: "2.6.B.1", weight: 0.10 },
    ],
    lo_confidence: "high",
    notes: "At the lowest point P the ball moves horizontally and has only centripetal (upward) acceleration; at the highest swing point Q it is momentarily at rest, so v = 0 and a points along the string toward the pivot. After the string breaks, the ball follows a horizontal-launch (P) or free-fall (Q) projectile."
  },
  stem_id: "wb1998b6",
  label: "1998B6",
  page: 81,
  section: "Chapter 2 — Section B Circular Motion (FRQ)",
  stem_text: "1998B6. A heavy ball swings at the end of a string with negligible air resistance. Point P is the lowest point of the motion; point Q is one of the two highest points reached.",
  stem_image: { page: 81, bbox: [0.5, 0.05, 0.92, 0.30], caption: "Figure: pendulum at lowest and highest points", alt: "Pendulum on a string with point P marked at the bottom of the swing and point Q at one of the highest points." },
  children: [
    {
      id: "q_wb1998b6_aP",
      label: "1998B6(a) P",
      prompt: "At point P (the lowest point of the swing), which best describes the velocity and acceleration of the ball?",
      options: [
        "(A) v is horizontal (tangent to the circle); a is straight up (centripetal, toward the pivot).",
        "(B) v = 0; a is along the string toward the pivot.",
        "(C) v is along the string; a is horizontal.",
        "(D) v is horizontal; a = 0 (at the bottom the ball is in equilibrium).",
      ],
      correct: "(A) v is horizontal (tangent to the circle); a is straight up (centripetal, toward the pivot).",
    },
    {
      id: "q_wb1998b6_aQ",
      label: "1998B6(a) Q",
      prompt: "At point Q (one of the two highest points of the swing, where the ball momentarily stops), which best describes the velocity and acceleration of the ball?",
      options: [
        "(A) v = 0; a points along the string toward the pivot (i.e. tangential, since centripetal acceleration vanishes when v = 0).",
        "(B) v points along the string; a = 0.",
        "(C) v is tangent to the circle; a is centripetal (toward the pivot).",
        "(D) v = 0; a = 0.",
      ],
      correct: "(A) v = 0; a points along the string toward the pivot (i.e. tangential, since centripetal acceleration vanishes when v = 0).",
    },
    {
      id: "q_wb1998b6_bP",
      label: "1998B6(b) P",
      prompt: "If the string breaks while the ball is at point P, describe the subsequent motion.",
      options: [
        "(A) The horizontal velocity stays constant; the ball falls under gravity and follows a parabolic path.",
        "(B) The ball falls straight down in free fall.",
        "(C) The ball stops in mid-air, then falls straight down.",
        "(D) The ball continues in a circle.",
      ],
      correct: "(A) The horizontal velocity stays constant; the ball falls under gravity and follows a parabolic path.",
    },
    {
      id: "q_wb1998b6_bQ",
      label: "1998B6(b) Q",
      prompt: "If the string breaks at point Q (where v = 0), describe the subsequent motion.",
      options: [
        "(A) The ball falls straight down in free fall.",
        "(B) The ball follows a parabolic trajectory.",
        "(C) The ball continues to swing on the broken string.",
        "(D) The ball remains stationary at Q.",
      ],
      correct: "(A) The ball falls straight down in free fall.",
    },
  ]
},

] // ── end FRQs

// ── Build the v2 tree ─────────────────────────────────────────────────────
// Group children by qt_key. Each group's QT comes from the first FRQ in the
// group that supplies a `qt` block.
const qtsByKey = new Map()
for (const f of FRQs) {
  if (f.qt) {
    if (qtsByKey.has(f.qt_key)) {
      // Merge: prefer the first definition (higher priority by listing order).
      qtsByKey.get(f.qt_key).source_frqs.push(f)
    } else {
      qtsByKey.set(f.qt_key, { qt: f.qt, source_frqs: [f] })
    }
  } else {
    if (!qtsByKey.has(f.qt_key)) {
      throw new Error(`FRQ ${f.label} references qt_key=${f.qt_key} but no QT was defined`)
    }
    qtsByKey.get(f.qt_key).source_frqs.push(f)
  }
}

const question_types = []
for (const [, { qt, source_frqs }] of qtsByKey) {
  const questions = []
  for (const f of source_frqs) {
    const stem_header_content = []
    if (f.stem_image) {
      stem_header_content.push({
        type: "image",
        page: f.stem_image.page,
        bbox: f.stem_image.bbox,
        caption: f.stem_image.caption || "",
        alt: f.stem_image.alt || "",
      })
    }
    stem_header_content.push({ type: "text", value: f.stem_text })

    const children = f.children.map(c => mcq({
      id: c.id,
      label: c.label,
      page: f.page,
      exercise_ref: c.label,
      section: f.section,
      prompt: c.prompt,
      options: c.options,
      correct: c.correct,
    }))

    questions.push({
      id: f.stem_id,
      label: f.label,
      kind: "shared_stimulus_set",
      stem_group_key: f.stem_id,
      stem_header_content,
      source_reference: sref(f.page, f.label, f.section),
      children,
    })
  }
  question_types.push({ ...qt, questions })
}

const tree = {
  version: 2,
  source_label: SOURCE_LABEL,
  source_type:  SOURCE_TYPE,
  textbook_key: TEXTBOOK_KEY,
  units: [
    {
      id: "u2",
      label: UNIT_LABEL,
      question_types,
    }
  ]
}

// ── Validation ────────────────────────────────────────────────────────────
const errs = []
for (const u of tree.units) {
  for (const qt of u.question_types) {
    const sum = (qt.slo_weights||[]).reduce((s, w) => s + Number(w.weight||0), 0)
    if (Math.abs(sum - 1.0) > 1e-6) errs.push(`QT ${qt.label}: slo_weights sum = ${sum}, not 1.0`)
    const codes = new Set((qt.slo_weights||[]).map(w => w.slo))
    if (!codes.has(qt.primary_slo)) errs.push(`QT ${qt.label}: primary_slo ${qt.primary_slo} not in slo_weights`)
    for (const a of qt.aligned_slos||[]) if (!codes.has(a)) errs.push(`QT ${qt.label}: aligned_slo ${a} not in slo_weights`)
    for (const r of qt.reinforcement_slos||[]) if (!codes.has(typeof r === "string" ? r : r.slo)) errs.push(`QT ${qt.label}: reinforcement_slo not in slo_weights`)
    for (const q of qt.questions) {
      const kids = q.kind === "shared_stimulus_set" ? q.children : [q]
      for (const c of kids) {
        if (c.question_format === "mcq") {
          if (!Array.isArray(c.options) || c.options.length !== 4) errs.push(`Q ${c.label}: options must have 4 entries`)
          if (!c.options.includes(c.correct_option)) errs.push(`Q ${c.label}: correct_option not in options`)
        }
      }
    }
  }
}
if (errs.length) {
  console.error("VALIDATION ERRORS:")
  for (const e of errs) console.error("  -", e)
  process.exit(1)
}

const outPath = "data/ap-physics-1-unit-2-workbook-frq-additions.json"
fs.writeFileSync(outPath, JSON.stringify(tree, null, 2))

let qtCount = tree.units.reduce((s,u)=>s+u.question_types.length,0)
let qCount = 0
for (const u of tree.units) for (const qt of u.question_types) for (const q of qt.questions) {
  qCount += q.kind === "shared_stimulus_set" ? q.children.length : 1
}
console.log(`Wrote ${outPath}: ${qtCount} QTs, ${qCount} MCQ children, ${FRQs.length} FRQs.`)
