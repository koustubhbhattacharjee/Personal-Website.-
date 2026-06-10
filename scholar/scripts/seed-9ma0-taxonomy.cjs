#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
//  scripts/seed-9ma0-taxonomy.cjs
//
//  Seeds the full Edexcel A Level Mathematics (9MA0) taxonomy into Supabase.
//  Source: Pearson Edexcel Level 3 Advanced GCE in Mathematics, spec Issue 4.
//
//  IDs use format:  LO  → 9MA0.P.7.1    SLO → 9MA0.P.7.1.1
//                        9MA0.SM.1.1          9MA0.SM.1.1.1
//
//  Run:
//    NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SECRET_KEY=... node scripts/seed-9ma0-taxonomy.cjs
//  or via dotenv:
//    node -e "require('dotenv').config({path:'.env.local'})" scripts/seed-9ma0-taxonomy.cjs
//    (or just use: npx dotenv -e .env.local node scripts/seed-9ma0-taxonomy.cjs)
// ─────────────────────────────────────────────────────────────────────────────

// Load .env.local if available
try { require("dotenv").config({ path: ".env.local" }) } catch {}

const SUPABASE_URL = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "")
const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ""
).trim()

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")
  }
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  }
}

function buildUrl(table, query = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === "") continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function rest(table, { method = "GET", query = {}, body, prefer = "", onConflict = "" } = {}) {
  const url = buildUrl(table, onConflict ? { ...query, on_conflict: onConflict } : query)
  const res = await fetch(url, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : {}),
    body: body == null ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let payload = null
  try { payload = text ? JSON.parse(text) : null } catch { payload = text }
  if (!res.ok) throw new Error(payload?.message || payload?.hint || payload?.error || `Supabase REST error ${res.status}`)
  return payload
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function upsertRows(table, rows, onConflict, batchSize = 200) {
  if (!rows.length) return
  for (const group of chunk(rows, batchSize)) {
    await rest(table, {
      method: "POST",
      body: group,
      onConflict,
      prefer: "resolution=merge-duplicates,return=minimal",
    })
    process.stdout.write(".")
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Taxonomy data
//  Format: { loCode, loName, topic, slos: [{ n, text }] }
//  [AS] tag stripped from lo_name (stored in metadata instead)
// ─────────────────────────────────────────────────────────────────────────────

const PURE = [

  // ── Topic 1: Proof ─────────────────────────────────────────────────────────
  {
    loCode: "P.1.1", topic: "Proof", as: true,
    loName: "Understand and use the structure of mathematical proof, proceeding from given assumptions through a series of logical steps to a conclusion; use methods of proof",
    slos: [
      { n: 1, text: "Proof by deduction" },
      { n: 2, text: "Proof by exhaustion" },
      { n: 3, text: "Disproof by counter-example" },
      { n: 4, text: "Proof by contradiction, including proof of the irrationality of √2 and the infinity of primes" },
    ],
  },

  // ── Topic 2: Algebra and Functions ─────────────────────────────────────────
  {
    loCode: "P.2.1", topic: "Algebra and Functions", as: true,
    loName: "Understand and use the laws of indices for all rational exponents",
    slos: [
      { n: 1, text: "Apply index laws: aᵐ × aⁿ = aᵐ⁺ⁿ, aᵐ ÷ aⁿ = aᵐ⁻ⁿ, (aᵐ)ⁿ = aᵐⁿ" },
      { n: 2, text: "Understand and use the equivalence of aᵐ/ⁿ and ⁿ√(aᵐ)" },
    ],
  },
  {
    loCode: "P.2.2", topic: "Algebra and Functions", as: true,
    loName: "Use and manipulate surds, including rationalising the denominator",
    slos: [
      { n: 1, text: "Simplify expressions involving surds using (√x)² = x and √(xy) = √x·√y" },
      { n: 2, text: "Rationalise the denominator using (√x + √y)(√x − √y) = x − y" },
    ],
  },
  {
    loCode: "P.2.3", topic: "Algebra and Functions", as: true,
    loName: "Work with quadratic functions and their graphs",
    slos: [
      { n: 1, text: "Use the discriminant b²−4ac to determine the nature of roots (real, repeated, no real roots)" },
      { n: 2, text: "Complete the square for a quadratic expression" },
      { n: 3, text: "Solve quadratic equations by factorisation, formula, completing the square, or calculator" },
      { n: 4, text: "Solve quadratic equations in a function of the unknown (e.g. trig, exponential, power substitution)" },
    ],
  },
  {
    loCode: "P.2.4", topic: "Algebra and Functions", as: true,
    loName: "Solve simultaneous equations in two variables by elimination and substitution, including one linear and one quadratic",
    slos: [
      { n: 1, text: "Solve simultaneous equations by elimination" },
      { n: 2, text: "Solve simultaneous equations by substitution, including one linear and one quadratic" },
    ],
  },
  {
    loCode: "P.2.5", topic: "Algebra and Functions", as: true,
    loName: "Solve linear and quadratic inequalities in a single variable and interpret graphically",
    slos: [
      { n: 1, text: "Solve linear inequalities including those with brackets and fractions" },
      { n: 2, text: "Solve quadratic inequalities, e.g. px² + qx + r ≥ 0" },
      { n: 3, text: "Express solutions using 'and'/'or' or set notation" },
      { n: 4, text: "Represent linear and quadratic inequalities graphically with shading and dotted/solid line convention" },
    ],
  },
  {
    loCode: "P.2.6", topic: "Algebra and Functions", as: true,
    loName: "Manipulate polynomials algebraically",
    slos: [
      { n: 1, text: "Expand brackets and collect like terms; factorise polynomials" },
      { n: 2, text: "Perform algebraic division by a linear expression (ax + b) or (ax − b)" },
      { n: 3, text: "Use the factor theorem: if f(b/a) = 0 then (ax − b) is a factor" },
      { n: 4, text: "Simplify rational expressions by factorising and cancelling; perform algebraic division on rational expressions with linear or quadratic denominators" },
    ],
  },
  {
    loCode: "P.2.7", topic: "Algebra and Functions", as: true,
    loName: "Understand and use graphs of functions",
    slos: [
      { n: 1, text: "Sketch curves defined by simple polynomial equations including cubics and quartics" },
      { n: 2, text: "Sketch and use the graph of the modulus of a linear function y = |ax + b|" },
      { n: 3, text: "Sketch y = a/x and y = a/x², identifying vertical and horizontal asymptotes" },
      { n: 4, text: "Interpret algebraic solutions of equations graphically; use intersection points of graphs to solve equations" },
      { n: 5, text: "Understand and use proportional relationships and their graphs" },
    ],
  },
  {
    loCode: "P.2.8", topic: "Algebra and Functions", as: true,
    loName: "Understand and use composite and inverse functions and their graphs",
    slos: [
      { n: 1, text: "Understand functions as one-to-one or many-to-one mappings; understand domain and range" },
      { n: 2, text: "Form and evaluate composite functions fg (do g first, then f)" },
      { n: 3, text: "Find and use inverse functions f⁻¹; know that f⁻¹f(x) = ff⁻¹(x) = x" },
      { n: 4, text: "Know that the graph of y = f⁻¹(x) is the reflection of y = f(x) in the line y = x" },
    ],
  },
  {
    loCode: "P.2.9", topic: "Algebra and Functions", as: true,
    loName: "Understand the effect of transformations on the graph of y = f(x)",
    slos: [
      { n: 1, text: "Apply and sketch y = af(x), y = f(x) + a, y = f(x + a), y = f(ax) individually" },
      { n: 2, text: "Apply and sketch combinations of these transformations to any standard function in the spec" },
    ],
  },
  {
    loCode: "P.2.10", topic: "Algebra and Functions", as: false,
    loName: "Decompose rational functions into partial fractions",
    slos: [
      { n: 1, text: "Decompose into partial fractions with distinct linear denominators, e.g. (ax+b)(cx+d)(ex+f)" },
      { n: 2, text: "Decompose into partial fractions with a repeated linear denominator, e.g. (ax+b)(cx+d)²" },
      { n: 3, text: "Apply partial fractions to integration, differentiation and series expansions" },
    ],
  },
  {
    loCode: "P.2.11", topic: "Algebra and Functions", as: false,
    loName: "Use of functions in modelling, including limitations and refinements",
    slos: [
      { n: 1, text: "Use trigonometric functions to model periodic phenomena (e.g. tides, hours of sunlight)" },
      { n: 2, text: "Use exponential functions for growth and decay models" },
      { n: 3, text: "Use reciprocal functions for inverse proportion models (e.g. pressure and volume)" },
      { n: 4, text: "Recognise and comment on limitations and possible refinements of a model" },
    ],
  },

  // ── Topic 3: Coordinate Geometry ───────────────────────────────────────────
  {
    loCode: "P.3.1", topic: "Coordinate Geometry in the (x, y) Plane", as: true,
    loName: "Understand and use the equation of a straight line",
    slos: [
      { n: 1, text: "Use and interpret forms y − y₁ = m(x − x₁) and ax + by + c = 0" },
      { n: 2, text: "Find the equation of a line through two given points" },
      { n: 3, text: "Apply gradient conditions for parallel lines (m₁ = m₂) and perpendicular lines (m₁m₂ = −1)" },
      { n: 4, text: "Use straight-line models in context (e.g. temperature conversion, constant-speed motion)" },
    ],
  },
  {
    loCode: "P.3.2", topic: "Coordinate Geometry in the (x, y) Plane", as: true,
    loName: "Understand and use the coordinate geometry of the circle",
    slos: [
      { n: 1, text: "Use the equation (x − a)² + (y − b)² = r²; find centre and radius" },
      { n: 2, text: "Recognise and use the expanded form x² + y² + 2fx + 2gy + c = 0" },
      { n: 3, text: "Complete the square to find centre and radius from expanded form" },
      { n: 4, text: "Apply circle properties: angle in semicircle is 90°; perpendicular from centre bisects chord; radius perpendicular to tangent at point of contact" },
      { n: 5, text: "Find the equation of a tangent to a circle at a given point" },
      { n: 6, text: "Find the circumcircle of a triangle with given vertices" },
    ],
  },
  {
    loCode: "P.3.3", topic: "Coordinate Geometry in the (x, y) Plane", as: false,
    loName: "Understand and use parametric equations of curves",
    slos: [
      { n: 1, text: "Interpret and use parametric equations to describe curves" },
      { n: 2, text: "Convert between parametric and Cartesian forms" },
      { n: 3, text: "Sketch curves defined by parametric equations, paying attention to the domain of the parameter" },
    ],
  },
  {
    loCode: "P.3.4", topic: "Coordinate Geometry in the (x, y) Plane", as: false,
    loName: "Use parametric equations in modelling",
    slos: [
      { n: 1, text: "Model shapes and motion using parametric equations in a variety of contexts" },
    ],
  },

  // ── Topic 4: Sequences and Series ──────────────────────────────────────────
  {
    loCode: "P.4.1", topic: "Sequences and Series", as: true,
    loName: "Understand and use the binomial expansion of (a + bx)ⁿ for positive integer n",
    slos: [
      { n: 1, text: "Expand (a + bx)ⁿ for positive integer n using Pascal's triangle or ⁿCᵣ" },
      { n: 2, text: "Use notations n!, ⁿCᵣ and understand their link to binomial probabilities" },
    ],
  },
  {
    loCode: "P.4.2", topic: "Sequences and Series", as: false,
    loName: "Extend the binomial expansion to any rational n",
    slos: [
      { n: 1, text: "Expand (a + bx)ⁿ for any rational n as an infinite series" },
      { n: 2, text: "Know and apply the validity condition |bx/a| < 1" },
      { n: 3, text: "Use binomial expansion with partial fractions for series approximations" },
    ],
  },
  {
    loCode: "P.4.3", topic: "Sequences and Series", as: true,
    loName: "Work with sequences",
    slos: [
      { n: 1, text: "Work with sequences defined by an nth-term formula" },
      { n: 2, text: "Work with sequences defined by a recurrence relation xₙ₊₁ = f(xₙ)" },
      { n: 3, text: "Identify and work with increasing, decreasing and periodic sequences" },
    ],
  },
  {
    loCode: "P.4.4", topic: "Sequences and Series", as: true,
    loName: "Understand and use sigma notation for sums of series",
    slos: [
      { n: 1, text: "Understand and use Σ notation; know that Σ1 (i=1 to n) = n" },
    ],
  },
  {
    loCode: "P.4.5", topic: "Sequences and Series", as: true,
    loName: "Understand and work with arithmetic sequences and series",
    slos: [
      { n: 1, text: "Use the nth term formula for an arithmetic sequence: uₙ = a + (n−1)d" },
      { n: 2, text: "Use and derive the sum formula: Sₙ = n/2(2a + (n−1)d); know the sum of first n natural numbers" },
    ],
  },
  {
    loCode: "P.4.6", topic: "Sequences and Series", as: true,
    loName: "Understand and work with geometric sequences and series",
    slos: [
      { n: 1, text: "Use the nth term formula: uₙ = arⁿ⁻¹" },
      { n: 2, text: "Use and derive the sum of a finite geometric series" },
      { n: 3, text: "Use the sum to infinity S∞ = a/(1−r) for |r| < 1" },
      { n: 4, text: "Use logarithms to find n given the sum of a series" },
    ],
  },
  {
    loCode: "P.4.7", topic: "Sequences and Series", as: false,
    loName: "Use sequences and series in modelling",
    slos: [
      { n: 1, text: "Apply arithmetic and geometric sequences to model real-world situations (e.g. savings schemes, population growth)" },
    ],
  },

  // ── Topic 5: Trigonometry ───────────────────────────────────────────────────
  {
    loCode: "P.5.1", topic: "Trigonometry", as: true,
    loName: "Understand and use the definitions of sine, cosine and tangent for all arguments",
    slos: [
      { n: 1, text: "Define sin, cos, tan using the unit circle for all arguments" },
      { n: 2, text: "Apply the sine rule, including the ambiguous case" },
      { n: 3, text: "Apply the cosine rule" },
      { n: 4, text: "Calculate the area of a triangle using ½ab sinC" },
      { n: 5, text: "Work with radian measure; use s = rθ for arc length and A = ½r²θ for sector area" },
    ],
  },
  {
    loCode: "P.5.2", topic: "Trigonometry", as: true,
    loName: "Understand and use standard small angle approximations",
    slos: [
      { n: 1, text: "Apply sin θ ≈ θ, cos θ ≈ 1 − θ²/2, tan θ ≈ θ for small θ in radians" },
    ],
  },
  {
    loCode: "P.5.3", topic: "Trigonometry", as: true,
    loName: "Understand and use sine, cosine and tangent functions: graphs, symmetries and periodicity",
    slos: [
      { n: 1, text: "Sketch and interpret graphs of sin x, cos x, tan x and transformations thereof" },
      { n: 2, text: "Know and use exact values of sin and cos for 0, π/6, π/4, π/3, π/2, π and multiples; exact values of tan for 0, π/6, π/4, π/3, π and multiples" },
    ],
  },
  {
    loCode: "P.5.4", topic: "Trigonometry", as: false,
    loName: "Understand and use sec, cosec, cot and arcsin, arccos, arctan",
    slos: [
      { n: 1, text: "Define sec, cosec, cot in terms of sin, cos, tan" },
      { n: 2, text: "Define arcsin, arccos, arctan as inverse functions; know their graphs, ranges and domains" },
    ],
  },
  {
    loCode: "P.5.5", topic: "Trigonometry", as: true,
    loName: "Understand and use trigonometric identities",
    slos: [
      { n: 1, text: "Know and use tan θ = sin θ / cos θ" },
      { n: 2, text: "Know and use sin²θ + cos²θ = 1" },
      { n: 3, text: "Know and use sec²θ = 1 + tan²θ and cosec²θ = 1 + cot²θ" },
      { n: 4, text: "Use identities to solve trigonometric equations and prove further identities" },
    ],
  },
  {
    loCode: "P.5.6", topic: "Trigonometry", as: false,
    loName: "Understand and use double angle formulae and addition formulae",
    slos: [
      { n: 1, text: "Know and use addition formulae: sin(A±B), cos(A±B), tan(A±B)" },
      { n: 2, text: "Know and use double angle formulae; apply to half angles" },
      { n: 3, text: "Express a cosθ + b sinθ in the form r cos(θ ± α) or r sin(θ ± α) and solve equations of this form" },
    ],
  },
  {
    loCode: "P.5.7", topic: "Trigonometry", as: true,
    loName: "Solve simple trigonometric equations in a given interval",
    slos: [
      { n: 1, text: "Solve equations involving sin, cos, tan in a given interval in degrees or radians" },
      { n: 2, text: "Solve quadratic equations in sin, cos or tan" },
      { n: 3, text: "Solve equations involving multiples of the unknown angle" },
    ],
  },
  {
    loCode: "P.5.8", topic: "Trigonometry", as: false,
    loName: "Construct proofs involving trigonometric functions and identities",
    slos: [
      { n: 1, text: "Prove trigonometric identities using known identities and algebraic manipulation" },
    ],
  },
  {
    loCode: "P.5.9", topic: "Trigonometry", as: false,
    loName: "Use trigonometric functions to solve problems in context",
    slos: [
      { n: 1, text: "Apply trigonometry to problems in context including wave motion, circular motion, and problems involving vectors, kinematics and forces" },
    ],
  },

  // ── Topic 6: Exponentials and Logarithms ───────────────────────────────────
  {
    loCode: "P.6.1", topic: "Exponentials and Logarithms", as: true,
    loName: "Know and use the functions aˣ and eˣ and their graphs",
    slos: [
      { n: 1, text: "Sketch and interpret the graph of y = aˣ for a > 0; understand the difference between a < 1 and a > 1" },
      { n: 2, text: "Know and use y = eˣ and its graph, including y = eᵃˣ⁺ᵇ + c" },
    ],
  },
  {
    loCode: "P.6.2", topic: "Exponentials and Logarithms", as: true,
    loName: "Know that the gradient of eᵏˣ is keᵏˣ and understand why the exponential model is suitable",
    slos: [
      { n: 1, text: "Know d/dx(eᵏˣ) = keᵏˣ and understand that this makes eˣ appropriate when rate of change is proportional to value" },
    ],
  },
  {
    loCode: "P.6.3", topic: "Exponentials and Logarithms", as: true,
    loName: "Know and use the definition of log_a(x) as the inverse of aˣ; know and use ln x",
    slos: [
      { n: 1, text: "Understand log_a(x) as the inverse of aˣ (a > 0, a ≠ 1, x > 0)" },
      { n: 2, text: "Know and use ln x and its graph; know ln x is the inverse of eˣ" },
      { n: 3, text: "Solve equations of the form eᵃˣ⁺ᵇ = p and ln(ax + b) = q" },
    ],
  },
  {
    loCode: "P.6.4", topic: "Exponentials and Logarithms", as: true,
    loName: "Understand and use the laws of logarithms",
    slos: [
      { n: 1, text: "Apply log_a(xy) = log_a(x) + log_a(y)" },
      { n: 2, text: "Apply log_a(x/y) = log_a(x) − log_a(y)" },
      { n: 3, text: "Apply log_a(xᵏ) = k·log_a(x), including k = −1 and k = −½" },
      { n: 4, text: "Know that log_a(a) = 1" },
    ],
  },
  {
    loCode: "P.6.5", topic: "Exponentials and Logarithms", as: true,
    loName: "Solve equations of the form aˣ = b",
    slos: [
      { n: 1, text: "Solve aˣ = b using logarithms; use the change of base formula where appropriate" },
    ],
  },
  {
    loCode: "P.6.6", topic: "Exponentials and Logarithms", as: true,
    loName: "Use logarithmic graphs to estimate parameters",
    slos: [
      { n: 1, text: "Linearise y = axⁿ by plotting log y against log x; identify log a (intercept) and n (gradient)" },
      { n: 2, text: "Linearise y = kbˣ by plotting log y against x; identify log k (intercept) and log b (gradient)" },
    ],
  },
  {
    loCode: "P.6.7", topic: "Exponentials and Logarithms", as: true,
    loName: "Understand and use exponential growth and decay in modelling",
    slos: [
      { n: 1, text: "Apply exponential models to contexts: compound interest, radioactive decay, drug concentration, population growth" },
      { n: 2, text: "Find constants in a given model; interpret initial value (t = 0) and behaviour for large t" },
      { n: 3, text: "Consider limitations of exponential models and suggest refinements" },
    ],
  },

  // ── Topic 7: Differentiation ────────────────────────────────────────────────
  {
    loCode: "P.7.1", topic: "Differentiation", as: true,
    loName: "Understand and use the derivative as gradient of tangent and rate of change",
    slos: [
      { n: 1, text: "Understand dy/dx as the gradient of the tangent at a point and as a rate of change" },
      { n: 2, text: "Sketch the gradient function f′(x) given the graph of f(x)" },
      { n: 3, text: "Differentiate from first principles for small positive integer powers of x and for sin x and cos x" },
      { n: 4, text: "Understand and use the second derivative as the rate of change of gradient" },
      { n: 5, text: "Use f″(x) > 0 for minimum, f″(x) < 0 for maximum (where f′(x) = 0)" },
      { n: 6, text: "Identify points of inflection where f″(x) changes sign; understand convex and concave sections" },
    ],
  },
  {
    loCode: "P.7.2", topic: "Differentiation", as: true,
    loName: "Differentiate standard functions",
    slos: [
      { n: 1, text: "Differentiate xⁿ for rational n, and related sums, differences and constant multiples" },
      { n: 2, text: "Differentiate eᵏˣ, aˣ, sin kx, cos kx, tan kx" },
      { n: 3, text: "Differentiate ln x; know d/dx(ln x) = 1/x" },
      { n: 4, text: "Know and use d/dx(aˣ) = kaˣ ln a" },
    ],
  },
  {
    loCode: "P.7.3", topic: "Differentiation", as: true,
    loName: "Apply differentiation to find gradients, tangents, normals, stationary points and identify increasing/decreasing functions",
    slos: [
      { n: 1, text: "Find equations of tangents and normals to a curve at a given point" },
      { n: 2, text: "Find and classify stationary points (maxima, minima, points of inflection) including in practical contexts" },
      { n: 3, text: "Identify intervals where a function is increasing (f′(x) > 0) or decreasing (f′(x) < 0)" },
      { n: 4, text: "Apply to curve sketching" },
    ],
  },
  {
    loCode: "P.7.4", topic: "Differentiation", as: false,
    loName: "Differentiate using the product rule, quotient rule and chain rule",
    slos: [
      { n: 1, text: "Apply the chain rule" },
      { n: 2, text: "Apply the product rule" },
      { n: 3, text: "Apply the quotient rule" },
      { n: 4, text: "Differentiate cosec x, cot x, sec x" },
      { n: 5, text: "Differentiate inverse functions using dy/dx = 1/(dx/dy)" },
      { n: 6, text: "Solve problems involving connected rates of change, e.g. dV/dt = (dV/dr)(dr/dt)" },
    ],
  },
  {
    loCode: "P.7.5", topic: "Differentiation", as: false,
    loName: "Differentiate functions defined implicitly or parametrically (first derivative only)",
    slos: [
      { n: 1, text: "Differentiate implicitly to find dy/dx" },
      { n: 2, text: "Differentiate parametrically to find dy/dx = (dy/dt)/(dx/dt)" },
      { n: 3, text: "Find equations of tangents and normals to curves given implicitly or parametrically" },
    ],
  },
  {
    loCode: "P.7.6", topic: "Differentiation", as: false,
    loName: "Construct simple differential equations in pure mathematics and in context",
    slos: [
      { n: 1, text: "Translate a described rate of change into a differential equation (e.g. rate inversely proportional to square of radius)" },
      { n: 2, text: "Set up differential equations in applied contexts including kinematics and population growth" },
    ],
  },

  // ── Topic 8: Integration ────────────────────────────────────────────────────
  {
    loCode: "P.8.1", topic: "Integration", as: true,
    loName: "Know and use the Fundamental Theorem of Calculus",
    slos: [
      { n: 1, text: "Understand integration as the reverse process of differentiation" },
      { n: 2, text: "Know that indefinite integrals require a constant of integration c" },
    ],
  },
  {
    loCode: "P.8.2", topic: "Integration", as: true,
    loName: "Integrate standard functions",
    slos: [
      { n: 1, text: "Integrate xⁿ (n ≠ −1) and related sums, differences and constant multiples" },
      { n: 2, text: "Integrate eᵏˣ, 1/x, sin kx, cos kx and related expressions" },
      { n: 3, text: "Use trigonometric identities to integrate sin²x, tan²x, cos²3x etc." },
      { n: 4, text: "Given f′(x) and a point on the curve, find the equation y = f(x)" },
    ],
  },
  {
    loCode: "P.8.3", topic: "Integration", as: true,
    loName: "Evaluate definite integrals; find areas under and between curves",
    slos: [
      { n: 1, text: "Evaluate definite integrals" },
      { n: 2, text: "Find the area bounded by a curve and given straight lines" },
      { n: 3, text: "Find the area between two curves" },
      { n: 4, text: "Find areas using curves defined parametrically" },
    ],
  },
  {
    loCode: "P.8.4", topic: "Integration", as: false,
    loName: "Understand and use integration as the limit of a sum",
    slos: [
      { n: 1, text: "Recognise ∫f(x)dx as the limit of Σf(x)δx as δx → 0" },
    ],
  },
  {
    loCode: "P.8.5", topic: "Integration", as: false,
    loName: "Carry out integration by substitution and integration by parts",
    slos: [
      { n: 1, text: "Integrate by substitution, choosing a suitable substitution (single substitution only)" },
      { n: 2, text: "Recognise and use integrals of the form ∫f′(x)/f(x)dx = ln|f(x)| + c" },
      { n: 3, text: "Integrate by parts, including more than one application; know ∫ln x dx" },
    ],
  },
  {
    loCode: "P.8.6", topic: "Integration", as: false,
    loName: "Integrate using partial fractions with linear denominators",
    slos: [
      { n: 1, text: "Integrate rational expressions arising from partial fractions, e.g. 2/(3x+5)" },
      { n: 2, text: "Integrate other rational expressions such as x/(x²+5) and 4/(2x−1)²" },
    ],
  },
  {
    loCode: "P.8.7", topic: "Integration", as: false,
    loName: "Evaluate analytical solutions of first-order differential equations with separable variables",
    slos: [
      { n: 1, text: "Separate variables and integrate to find the general solution" },
      { n: 2, text: "Apply initial conditions to find a particular solution" },
      { n: 3, text: "Sketch members of the family of solution curves" },
    ],
  },
  {
    loCode: "P.8.8", topic: "Integration", as: false,
    loName: "Interpret the solution of a differential equation in context",
    slos: [
      { n: 1, text: "Interpret the solution in the context of the original problem" },
      { n: 2, text: "Identify limitations of the solution, including behaviour for large values" },
      { n: 3, text: "Link to kinematics contexts" },
    ],
  },

  // ── Topic 9: Numerical Methods ──────────────────────────────────────────────
  {
    loCode: "P.9.1", topic: "Numerical Methods", as: true,
    loName: "Locate roots of f(x) = 0 by considering changes of sign",
    slos: [
      { n: 1, text: "Use sign change over an interval to locate a root of f(x) = 0" },
      { n: 2, text: "Understand when sign change methods can fail (even number of roots in interval; discontinuous function)" },
    ],
  },
  {
    loCode: "P.9.2", topic: "Numerical Methods", as: false,
    loName: "Solve equations approximately using simple iterative methods",
    slos: [
      { n: 1, text: "Use an iteration of the form xₙ₊₁ = g(xₙ) to find successive approximations to a root" },
      { n: 2, text: "Draw cobweb and staircase diagrams to illustrate convergence or divergence" },
    ],
  },
  {
    loCode: "P.9.3", topic: "Numerical Methods", as: false,
    loName: "Solve equations using the Newton-Raphson method",
    slos: [
      { n: 1, text: "Apply the Newton-Raphson formula xₙ₊₁ = xₙ − f(xₙ)/f′(xₙ)" },
      { n: 2, text: "Understand geometrically why the method fails near points where the gradient is small" },
    ],
  },
  {
    loCode: "P.9.4", topic: "Numerical Methods", as: false,
    loName: "Understand and use numerical integration including the trapezium rule",
    slos: [
      { n: 1, text: "Apply the trapezium rule to estimate the area under a curve" },
      { n: 2, text: "Determine from a sketch whether the trapezium rule gives an over- or under-estimate" },
    ],
  },
  {
    loCode: "P.9.5", topic: "Numerical Methods", as: false,
    loName: "Use numerical methods to solve problems in context",
    slos: [
      { n: 1, text: "Apply numerical methods to equations not soluble by analytic means in context" },
    ],
  },

  // ── Topic 10: Vectors ───────────────────────────────────────────────────────
  {
    loCode: "P.10.1", topic: "Vectors", as: true,
    loName: "Use vectors in two and three dimensions",
    slos: [
      { n: 1, text: "Represent vectors using column notation and i, j unit vectors in 2D" },
      { n: 2, text: "Represent vectors using column notation and i, j, k unit vectors in 3D" },
    ],
  },
  {
    loCode: "P.10.2", topic: "Vectors", as: true,
    loName: "Calculate magnitude and direction of a vector; convert between forms",
    slos: [
      { n: 1, text: "Calculate the magnitude of a vector; find a unit vector in a given direction" },
      { n: 2, text: "Convert between component form and magnitude/direction form" },
    ],
  },
  {
    loCode: "P.10.3", topic: "Vectors", as: true,
    loName: "Add vectors and perform scalar multiplication",
    slos: [
      { n: 1, text: "Add vectors diagrammatically using the triangle and parallelogram laws" },
      { n: 2, text: "Perform algebraic vector addition and multiplication by a scalar" },
      { n: 3, text: "Understand and identify parallel vectors" },
    ],
  },
  {
    loCode: "P.10.4", topic: "Vectors", as: true,
    loName: "Understand and use position vectors; calculate distances",
    slos: [
      { n: 1, text: "Use position vectors; find displacement vector AB = b − a" },
      { n: 2, text: "Calculate distance between two points in 2D and 3D using position vectors" },
    ],
  },
  {
    loCode: "P.10.5", topic: "Vectors", as: false,
    loName: "Use vectors to solve problems in pure mathematics and in context",
    slos: [
      { n: 1, text: "Solve geometric problems using vectors (e.g. finding the fourth vertex of a parallelogram)" },
      { n: 2, text: "Apply vectors in context: velocity, displacement, kinematics and forces" },
    ],
  },
]

const STATS_MECH = [

  // ── Topic 1: Statistical Sampling ──────────────────────────────────────────
  {
    loCode: "SM.1.1", topic: "Statistical Sampling", as: true,
    loName: "Understand and use sampling techniques",
    slos: [
      { n: 1, text: "Understand the terms population, sample, sampling unit, sampling frame" },
      { n: 2, text: "Use samples to make informal inferences about the population" },
      { n: 3, text: "Understand advantages and disadvantages of census versus sample" },
      { n: 4, text: "Understand and use simple random sampling and opportunity sampling" },
      { n: 5, text: "Understand and use stratified sampling, systematic sampling and quota sampling" },
      { n: 6, text: "Select or critique sampling techniques in context; understand that different samples can lead to different conclusions" },
    ],
  },

  // ── Topic 2: Data Presentation and Interpretation ──────────────────────────
  {
    loCode: "SM.2.1", topic: "Data Presentation and Interpretation", as: true,
    loName: "Interpret diagrams for single-variable data",
    slos: [
      { n: 1, text: "Interpret histograms, understanding that area represents frequency" },
      { n: 2, text: "Interpret frequency polygons, box and whisker plots (including outliers), and cumulative frequency diagrams" },
      { n: 3, text: "Connect data presentation to probability distributions" },
    ],
  },
  {
    loCode: "SM.2.2", topic: "Data Presentation and Interpretation", as: true,
    loName: "Interpret scatter diagrams and regression lines for bivariate data",
    slos: [
      { n: 1, text: "Interpret scatter diagrams; identify explanatory and response variables" },
      { n: 2, text: "Understand and use interpolation; understand the dangers of extrapolation" },
      { n: 3, text: "Use regression lines to make predictions within the range of the explanatory variable" },
      { n: 4, text: "Use logarithms to linearise relationships of the form y = axⁿ or y = kbˣ" },
      { n: 5, text: "Understand informal interpretation of correlation (positive, negative, zero, strong, weak)" },
      { n: 6, text: "Understand that correlation does not imply causation" },
    ],
  },
  {
    loCode: "SM.2.3", topic: "Data Presentation and Interpretation", as: true,
    loName: "Interpret measures of central tendency and variation, extending to standard deviation",
    slos: [
      { n: 1, text: "Calculate and interpret mean, median and mode for discrete, continuous, grouped and ungrouped data" },
      { n: 2, text: "Calculate and interpret range, interquartile range and interpercentile ranges" },
      { n: 3, text: "Calculate variance and standard deviation, including from summary statistics" },
      { n: 4, text: "Use linear interpolation to calculate percentiles from grouped data" },
      { n: 5, text: "Understand and use coding to simplify calculations" },
    ],
  },
  {
    loCode: "SM.2.4", topic: "Data Presentation and Interpretation", as: true,
    loName: "Recognise and interpret outliers; select and critique data presentation techniques",
    slos: [
      { n: 1, text: "Identify possible outliers using a given rule (e.g. Q1 − 1.5×IQR, Q3 + 1.5×IQR, or mean ± 3σ)" },
      { n: 2, text: "Select or critique data presentation techniques in context" },
      { n: 3, text: "Clean data: deal with missing data, errors and outliers" },
    ],
  },

  // ── Topic 3: Probability ────────────────────────────────────────────────────
  {
    loCode: "SM.3.1", topic: "Probability", as: true,
    loName: "Understand and use mutually exclusive and independent events",
    slos: [
      { n: 1, text: "Calculate probabilities using Venn diagrams, tree diagrams or two-way tables" },
      { n: 2, text: "Use set notation to describe events; apply P(A ∪ B) = P(A) + P(B) − P(A ∩ B)" },
      { n: 3, text: "Use conditions for independence: P(A ∩ B) = P(A)P(B), P(A|B) = P(A)" },
      { n: 4, text: "Understand informal connection between probability and continuous distributions (area under curve)" },
    ],
  },
  {
    loCode: "SM.3.2", topic: "Probability", as: true,
    loName: "Understand and use conditional probability",
    slos: [
      { n: 1, text: "Understand and use the conditional probability formula P(A|B) = P(A ∩ B) / P(B)" },
      { n: 2, text: "Apply P(A ∩ B) = P(A)P(B|A)" },
      { n: 3, text: "Use tree diagrams, Venn diagrams and two-way tables for conditional probability" },
    ],
  },
  {
    loCode: "SM.3.3", topic: "Probability", as: false,
    loName: "Modelling with probability, including critiquing assumptions",
    slos: [
      { n: 1, text: "Model situations using probability and critique the assumptions made (e.g. fairness of a die or coin)" },
    ],
  },

  // ── Topic 4: Statistical Distributions ────────────────────────────────────
  {
    loCode: "SM.4.1", topic: "Statistical Distributions", as: true,
    loName: "Understand and use the binomial distribution as a model",
    slos: [
      { n: 1, text: "Understand the conditions for a binomial model (fixed n, independent trials, constant p, two outcomes)" },
      { n: 2, text: "Calculate probabilities using B(n, p); use notation X ~ B(n, p)" },
      { n: 3, text: "Know the discrete uniform distribution" },
      { n: 4, text: "Use a calculator to find individual and cumulative binomial probabilities" },
      { n: 5, text: "Critically assess the appropriateness of the binomial model in context" },
    ],
  },
  {
    loCode: "SM.4.2", topic: "Statistical Distributions", as: false,
    loName: "Understand and use the Normal distribution as a model",
    slos: [
      { n: 1, text: "Understand the shape and symmetry of the Normal distribution; use notation X ~ N(μ, σ²)" },
      { n: 2, text: "Know that points of inflection on the Normal curve are at μ ± σ" },
      { n: 3, text: "Use a calculator to find probabilities for a Normal distribution" },
      { n: 4, text: "Use the standard Normal Z ~ N(0,1) and statistical tables" },
      { n: 5, text: "Use the Normal approximation to the binomial B(n,p) ≈ N(np, np(1−p)) when n is large and p ≈ 0.5; apply continuity correction" },
      { n: 6, text: "Link Normal distribution to histograms, mean and standard deviation" },
    ],
  },
  {
    loCode: "SM.4.3", topic: "Statistical Distributions", as: false,
    loName: "Select an appropriate probability distribution for a context",
    slos: [
      { n: 1, text: "Identify when a binomial or Normal model is or is not appropriate, with reasoning" },
    ],
  },

  // ── Topic 5: Statistical Hypothesis Testing ────────────────────────────────
  {
    loCode: "SM.5.1", topic: "Statistical Hypothesis Testing", as: true,
    loName: "Understand and apply the language of statistical hypothesis testing",
    slos: [
      { n: 1, text: "Understand and use: null hypothesis H₀, alternative hypothesis H₁, significance level, test statistic" },
      { n: 2, text: "Understand and use: 1-tail and 2-tail tests, critical value, critical region, acceptance region, p-value" },
      { n: 3, text: "Understand the product moment correlation coefficient r; know |r| ≤ 1 and that r = ±1 means all points are collinear" },
      { n: 4, text: "Interpret a given correlation coefficient using a given p-value or critical value; state hypotheses in terms of ρ with H₀: ρ = 0" },
    ],
  },
  {
    loCode: "SM.5.2", topic: "Statistical Hypothesis Testing", as: true,
    loName: "Conduct a statistical hypothesis test for a proportion using the binomial distribution",
    slos: [
      { n: 1, text: "State hypotheses in terms of the population parameter p" },
      { n: 2, text: "Conduct a 1-tail or 2-tail test using the binomial distribution and interpret in context" },
      { n: 3, text: "Understand that the significance level is the probability of incorrectly rejecting H₀" },
      { n: 4, text: "Understand that a sample is being used to make an inference about the population" },
    ],
  },
  {
    loCode: "SM.5.3", topic: "Statistical Hypothesis Testing", as: false,
    loName: "Conduct a hypothesis test for the mean of a Normal distribution with known variance",
    slos: [
      { n: 1, text: "Know that if X ~ N(μ, σ²) then X̄ ~ N(μ, σ²/n)" },
      { n: 2, text: "Carry out a test for μ using (X̄ − μ)/(σ/√n) ~ N(0,1); state hypotheses in terms of μ" },
      { n: 3, text: "Interpret the result in context" },
    ],
  },

  // ── Topic 6: Quantities and Units in Mechanics ─────────────────────────────
  {
    loCode: "SM.6.1", topic: "Quantities and Units in Mechanics", as: true,
    loName: "Understand and use fundamental and derived quantities and units in the SI system",
    slos: [
      { n: 1, text: "Know fundamental quantities and units: length (m), time (s), mass (kg)" },
      { n: 2, text: "Know derived quantities and units: velocity (m s⁻¹), acceleration (m s⁻²), force (N), weight (N), moment (N m)" },
      { n: 3, text: "Convert between units (e.g. km h⁻¹ to m s⁻¹)" },
    ],
  },

  // ── Topic 7: Kinematics ─────────────────────────────────────────────────────
  {
    loCode: "SM.7.1", topic: "Kinematics", as: true,
    loName: "Understand and use the language of kinematics",
    slos: [
      { n: 1, text: "Distinguish between position, displacement, distance travelled, velocity, speed and acceleration" },
      { n: 2, text: "Know that distance and speed must be non-negative" },
    ],
  },
  {
    loCode: "SM.7.2", topic: "Kinematics", as: true,
    loName: "Understand, use and interpret kinematics graphs",
    slos: [
      { n: 1, text: "Interpret displacement–time graphs; understand gradient as velocity" },
      { n: 2, text: "Interpret velocity–time graphs; understand gradient as acceleration and area as displacement" },
    ],
  },
  {
    loCode: "SM.7.3", topic: "Kinematics", as: true,
    loName: "Understand, use and derive formulae for constant acceleration",
    slos: [
      { n: 1, text: "Use and derive the suvat equations for motion in a straight line with constant acceleration" },
      { n: 2, text: "Extend to 2D using vectors: v = u + at, r = ut + ½at² in i–j or column vector form" },
      { n: 3, text: "Use vectors to solve constant acceleration problems in 2D" },
    ],
  },
  {
    loCode: "SM.7.4", topic: "Kinematics", as: true,
    loName: "Use calculus in kinematics for motion in a straight line",
    slos: [
      { n: 1, text: "Use differentiation to find velocity from displacement (v = dr/dt) and acceleration from velocity (a = dv/dt)" },
      { n: 2, text: "Use integration to find velocity from acceleration and displacement from velocity" },
      { n: 3, text: "Extend to 2D: differentiate and integrate vectors with respect to time" },
    ],
  },
  {
    loCode: "SM.7.5", topic: "Kinematics", as: false,
    loName: "Model motion under gravity in a vertical plane using vectors; projectiles",
    slos: [
      { n: 1, text: "Model projectile motion using vectors, resolving into horizontal and vertical components" },
      { n: 2, text: "Derive and use formulae for time of flight, range and greatest height" },
      { n: 3, text: "Derive the equation of the path of a projectile" },
    ],
  },

  // ── Topic 8: Forces and Newton's Laws ──────────────────────────────────────
  {
    loCode: "SM.8.1", topic: "Forces and Newton's Laws", as: true,
    loName: "Understand the concept of a force; understand and use Newton's first law",
    slos: [
      { n: 1, text: "Understand force types: normal reaction, tension, thrust/compression, resistance" },
      { n: 2, text: "Apply Newton's first law: a body remains at rest or moves with constant velocity unless acted on by a resultant force" },
    ],
  },
  {
    loCode: "SM.8.2", topic: "Forces and Newton's Laws", as: true,
    loName: "Understand and use Newton's second law",
    slos: [
      { n: 1, text: "Apply F = ma for motion in a straight line with forces parallel or perpendicular to motion" },
      { n: 2, text: "Apply F = ma in vector form with forces given in i–j notation or column vectors" },
      { n: 3, text: "Resolve forces and apply Newton's second law on inclined planes" },
    ],
  },
  {
    loCode: "SM.8.3", topic: "Forces and Newton's Laws", as: true,
    loName: "Understand and use weight and motion under gravity",
    slos: [
      { n: 1, text: "Use W = mg; know g ≈ 9.8 m s⁻² (or as specified); understand g varies with location" },
      { n: 2, text: "Solve problems involving motion in a straight line under gravity" },
    ],
  },
  {
    loCode: "SM.8.4", topic: "Forces and Newton's Laws", as: true,
    loName: "Understand and use Newton's third law; equilibrium and connected particles",
    slos: [
      { n: 1, text: "Apply Newton's third law" },
      { n: 2, text: "Solve equilibrium problems for a particle under coplanar forces" },
      { n: 3, text: "Solve connected particle problems including those with smooth pulleys" },
      { n: 4, text: "Solve problems where at least one particle is on an inclined plane" },
    ],
  },
  {
    loCode: "SM.8.5", topic: "Forces and Newton's Laws", as: false,
    loName: "Understand and use addition of forces; resultant forces; dynamics in a plane",
    slos: [
      { n: 1, text: "Find the resultant of two or more forces given in magnitude-direction form" },
      { n: 2, text: "Resolve a force into two perpendicular components" },
      { n: 3, text: "Apply dynamics to motion in a plane" },
    ],
  },
  {
    loCode: "SM.8.6", topic: "Forces and Newton's Laws", as: false,
    loName: "Understand and use the F ≤ μR model for friction",
    slos: [
      { n: 1, text: "Know and apply F = μR when a particle is sliding" },
      { n: 2, text: "Know and apply F ≤ μR in equilibrium situations" },
      { n: 3, text: "Solve problems involving motion on a rough surface and limiting friction" },
    ],
  },

  // ── Topic 9: Moments ────────────────────────────────────────────────────────
  {
    loCode: "SM.9.1", topic: "Moments", as: false,
    loName: "Understand and use moments in simple static contexts",
    slos: [
      { n: 1, text: "Calculate the moment of a force about a point" },
      { n: 2, text: "Apply the principle of moments to solve problems with parallel coplanar forces" },
      { n: 3, text: "Solve problems with non-parallel coplanar forces (e.g. ladder problems)" },
      { n: 4, text: "Solve equilibrium problems for rigid bodies including uniform and non-uniform beams" },
    ],
  },
]

const ALL_LOS = [...PURE, ...STATS_MECH]

// ─────────────────────────────────────────────────────────────────────────────
//  Build DB rows
// ─────────────────────────────────────────────────────────────────────────────

const FRAMEWORK_KEY = "9MA0"
const PREFIX        = "9MA0"

function buildLoRows(frameworkId) {
  return ALL_LOS.map((lo, idx) => ({
    id:             `${PREFIX}.${lo.loCode}`,
    framework_id:   frameworkId,
    code:           lo.loCode,
    standard_code:  lo.topic,
    standard_name:  lo.topic,
    name:           lo.loName,
    sequence_index: idx,
    metadata: {
      topic:    lo.topic,
      as_level: lo.as,
    },
  }))
}

function buildSloRows() {
  const rows = []
  let seq = 0
  for (const lo of ALL_LOS) {
    const loId = `${PREFIX}.${lo.loCode}`
    for (const slo of lo.slos) {
      const sloCode = `${lo.loCode}.${slo.n}`
      rows.push({
        id:             `${PREFIX}.${sloCode}`,
        lo_id:          loId,
        code:           sloCode,
        text:           slo.text,
        sequence_index: seq++,
        metadata:       {},
      })
    }
  }
  return rows
}

// ─────────────────────────────────────────────────────────────────────────────
//  Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  assertEnv()

  // ── Find framework ─────────────────────────────────────────────────────────
  const frameworks = await rest("curriculum_frameworks", {
    query: { select: "id,key", "key": `eq.${FRAMEWORK_KEY}`, limit: 1 },
  })
  let framework = Array.isArray(frameworks) ? frameworks.find(f => f.key === FRAMEWORK_KEY) : null

  if (!framework) {
    // Create it
    const created = await rest("curriculum_frameworks", {
      method: "POST",
      body: [{
        key:          FRAMEWORK_KEY,
        label:        "Edexcel A Level Mathematics (9MA0)",
        subject_name: "Mathematics",
        country:      "UK",
        state:        null,
        metadata:     { spec: "Pearson Edexcel Level 3 Advanced GCE, Issue 4, February 2020" },
      }],
      prefer: "return=representation",
    })
    framework = Array.isArray(created) ? created[0] : created
    console.log(`Created framework: ${framework.id}`)
  } else {
    console.log(`Found framework: ${framework.id}`)
  }

  const frameworkId = framework.id

  // ── Delete old LOs (cascade deletes SLOs) ─────────────────────────────────
  console.log("Deleting old LOs/SLOs for framework...")
  await rest("learning_objectives", {
    method: "DELETE",
    query: { framework_id: `eq.${frameworkId}` },
  })
  console.log("Deleted.")

  // ── Insert LOs ─────────────────────────────────────────────────────────────
  const loRows = buildLoRows(frameworkId)
  console.log(`\nInserting ${loRows.length} LOs...`)
  await upsertRows("learning_objectives", loRows, "id", 100)

  // ── Insert SLOs ────────────────────────────────────────────────────────────
  const sloRows = buildSloRows()
  console.log(`\nInserting ${sloRows.length} SLOs...`)
  await upsertRows("sub_learning_objectives", sloRows, "id", 200)

  console.log("\n")
  console.log(JSON.stringify({
    ok: true,
    framework_id:          frameworkId,
    learning_objectives:   loRows.length,
    sub_learning_objectives: sloRows.length,
  }, null, 2))
}

main().catch((err) => {
  console.error("\n[seed-9ma0-taxonomy] failed:", err.message)
  process.exit(1)
})
