import { AP_PHYSICS_1_TAXONOMY } from "./ap-physics-1-taxonomy.js"

// ─────────────────────────────────────────────────────────────────────────────
//  District Taxonomy — State-standard LO reference data
//  Used at import time (mapping question types → standard codes)
//  and at dashboard time (powering weakness pie charts)
//
//  Structure:
//    DISTRICT_TAXONOMY[state][subjectKey] = {
//      standards: [
//        { code, name, objectives: [
//            { code, name, subtopics: [...] }
//        ]}
//      ]
//    }
//
//  subjectKey: lowercase partial match against subject name
// ─────────────────────────────────────────────────────────────────────────────

export const DISTRICT_TAXONOMY = {
  new_jersey: {
    "algebra 2": {
      // Based on NJDOE 2023 NJSLS-M high school standards and Algebra 2 content emphases.
      standards: [
        {
          code: "N.RN.A",
          name: "The Real Number System (N.RN) — Extend the properties of exponents to rational exponents",
          objectives: [
            {
              code: "N.RN.A.1",
              name: "Explain how the definition of rational exponents follows from extending the properties of integer exponents, allowing radicals to be written in terms of rational exponents.",
              subtopics: [
                { id: "N.RN.A.1.1", text: "Extend integer exponent laws (aᵐ·aⁿ = aᵐ⁺ⁿ, (aᵐ)ⁿ = aᵐⁿ) to rational exponents" },
                { id: "N.RN.A.1.2", text: "Write the nth root as a fractional exponent: ⁿ√a = a^(1/n)" },
                { id: "N.RN.A.1.3", text: "Convert between radical form and rational exponent form: a^(m/n) = (ⁿ√a)ᵐ" },
                { id: "N.RN.A.1.4", text: "Justify each conversion step using properties of exponents" },
              ]
            },
            {
              code: "N.RN.A.2",
              name: "Rewrite expressions involving radicals and rational exponents using the properties of exponents.",
              subtopics: [
                { id: "N.RN.A.2.1", text: "Apply product, quotient, and power rules to expressions with rational exponents" },
                { id: "N.RN.A.2.2", text: "Simplify expressions like 8^(2/3) or 16^(3/4) without a calculator" },
                { id: "N.RN.A.2.3", text: "Convert between radical and rational exponent form to simplify" },
                { id: "N.RN.A.2.4", text: "Simplify algebraic expressions combining radicals and rational exponents" },
              ]
            },
            {
              code: "N.RN.A.3",
              name: "Simplify radicals, including algebraic radicals.",
              subtopics: [
                { id: "N.RN.A.3.1", text: "Simplify nth roots by factoring out perfect nth-power factors" },
                { id: "N.RN.A.3.2", text: "Simplify algebraic radicals: √(x²y) = x√y for x ≥ 0" },
                { id: "N.RN.A.3.3", text: "Rationalise denominators with monomial and binomial radical expressions" },
                { id: "N.RN.A.3.4", text: "Add and subtract like radicals by combining coefficients" },
              ]
            },
          ]
        },
        {
          code: "N.Q.A",
          name: "Quantities (N.Q) — Reason quantitatively and use units to solve problems",
          objectives: [
            {
              code: "N.Q.A.2",
              name: "Define appropriate quantities for the purpose of descriptive modeling.",
              subtopics: [
                { id: "N.Q.A.2.1", text: "Choose variables and units that accurately represent a real-world situation" },
                { id: "N.Q.A.2.2", text: "Interpret quantities in context, including rates and measurement precision" },
                { id: "N.Q.A.2.3", text: "Recognise when a quantity must be non-negative or have domain constraints" },
                { id: "N.Q.A.2.4", text: "Evaluate whether a chosen quantity is meaningful for the purpose of the model" },
              ]
            },
          ]
        },
        {
          code: "N.CN.A",
          name: "The Complex Number System (N.CN) — Perform arithmetic operations with complex numbers",
          objectives: [
            {
              code: "N.CN.A.1",
              name: "Know there is a complex number i such that i^2 = -1 and every complex number has the form a + bi with a and b real.",
              subtopics: [
                { id: "N.CN.A.1.1", text: "Define the imaginary unit i as a solution to x² = −1" },
                { id: "N.CN.A.1.2", text: "Identify the real part a and imaginary part b of a complex number a + bi" },
                { id: "N.CN.A.1.3", text: "Recognise that real numbers and purely imaginary numbers are special cases of complex numbers" },
                { id: "N.CN.A.1.4", text: "Simplify powers of i using the cycle i, −1, −i, 1 (period 4)" },
              ]
            },
            {
              code: "N.CN.A.2",
              name: "Use the relation i^2 = -1 and the properties of operations to add, subtract, and multiply complex numbers.",
              subtopics: [
                { id: "N.CN.A.2.1", text: "Add and subtract complex numbers by combining real parts and imaginary parts separately" },
                { id: "N.CN.A.2.2", text: "Multiply complex numbers using the distributive property and substitute i² = −1" },
                { id: "N.CN.A.2.3", text: "Write the result of any complex arithmetic in standard form a + bi" },
                { id: "N.CN.A.2.4", text: "Multiply complex conjugates (a + bi)(a − bi) = a² + b² and recognise the real result" },
              ]
            },
          ]
        },
        {
          code: "N.CN.C",
          name: "The Complex Number System (N.CN) — Use complex numbers in polynomial identities and equations",
          objectives: [
            {
              code: "N.CN.C.7",
              name: "Solve quadratic equations with real coefficients that have complex solutions.",
              subtopics: [
                { id: "N.CN.C.7.1", text: "Identify when the discriminant b² − 4ac is negative, indicating complex solutions" },
                { id: "N.CN.C.7.2", text: "Apply the quadratic formula to produce complex solutions" },
                { id: "N.CN.C.7.3", text: "Write solutions in the form a ± bi" },
                { id: "N.CN.C.7.4", text: "Verify that complex solutions always come in conjugate pairs for real-coefficient equations" },
              ]
            },
          ]
        },
        {
          code: "A.CED.A",
          name: "Creating Equations (A.CED) — Create equations that describe numbers or relationships",
          objectives: [
            {
              code: "A.CED.A.1",
              name: "Create equations and inequalities in one variable and use them to solve problems, including those arising from linear and quadratic functions and simple rational and exponential functions.",
              subtopics: [
                { id: "A.CED.A.1.1", text: "Translate a verbal or contextual description into an algebraic equation or inequality" },
                { id: "A.CED.A.1.2", text: "Create and solve linear, quadratic, rational, and exponential equations from context" },
                { id: "A.CED.A.1.3", text: "Solve inequalities and represent solutions using interval notation or a number line" },
                { id: "A.CED.A.1.4", text: "Interpret the solution of an equation or inequality in terms of the original context" },
              ]
            },
          ]
        },
        {
          code: "A.SSE.A",
          name: "Seeing Structure in Expressions (A.SSE) — Interpret the structure of expressions",
          objectives: [
            {
              code: "A.SSE.A.2",
              name: "Use the structure of an expression to identify ways to rewrite it.",
              subtopics: [
                { id: "A.SSE.A.2.1", text: "Recognise difference of squares, perfect square trinomials, and sum/difference of cubes" },
                { id: "A.SSE.A.2.2", text: "Factor complex expressions by treating grouped terms as a single unit" },
                { id: "A.SSE.A.2.3", text: "Use substitution u = f(x) to simplify higher-degree polynomials (e.g., u = x²)" },
                { id: "A.SSE.A.2.4", text: "Rewrite rational expressions by factoring numerator and denominator to cancel common factors" },
              ]
            },
          ]
        },
        {
          code: "A.SSE.B",
          name: "Seeing Structure in Expressions (A.SSE) — Write expressions in equivalent forms to solve problems",
          objectives: [
            {
              code: "A.SSE.B.3c",
              name: "Use the properties of exponents to transform expressions for exponential functions.",
              subtopics: [
                { id: "A.SSE.B.3c.1", text: "Rewrite A·bˢˣ as A·(bˢ)ˣ to identify the per-unit growth factor" },
                { id: "A.SSE.B.3c.2", text: "Convert between equivalent bases to reveal growth or decay rate" },
                { id: "A.SSE.B.3c.3", text: "Interpret transformed forms in context (e.g., per-quarter vs per-year growth)" },
                { id: "A.SSE.B.3c.4", text: "Classify the transformed expression as exponential growth or decay" },
              ]
            },
          ]
        },
        {
          code: "A.APR.A",
          name: "Arithmetic with Polynomials and Rational Expressions (A.APR) — Perform arithmetic operations on polynomials",
          objectives: [
            {
              code: "A.APR.A.1",
              name: "Understand that polynomials are closed under addition, subtraction, and multiplication; add, subtract, and multiply polynomials.",
              subtopics: [
                { id: "A.APR.A.1.1", text: "Add and subtract polynomials by combining like terms" },
                { id: "A.APR.A.1.2", text: "Multiply polynomials using the distributive property" },
                { id: "A.APR.A.1.3", text: "Verify closure: the result of adding, subtracting, or multiplying polynomials is always a polynomial" },
                { id: "A.APR.A.1.4", text: "Multiply polynomials of degree ≥ 2 (e.g., binomial × trinomial, cubic × quadratic)" },
              ]
            },
          ]
        },
        {
          code: "A.APR.B",
          name: "Arithmetic with Polynomials and Rational Expressions (A.APR) — Understand the relationship between zeros and factors of polynomials",
          objectives: [
            {
              code: "A.APR.B.2",
              name: "Know and apply the Remainder Theorem.",
              subtopics: [
                { id: "A.APR.B.2.1", text: "State the Remainder Theorem: p(a) equals the remainder when p(x) is divided by (x − a)" },
                { id: "A.APR.B.2.2", text: "Use synthetic division to divide a polynomial by a linear binomial" },
                { id: "A.APR.B.2.3", text: "Apply the Factor Theorem: (x − a) is a factor iff p(a) = 0" },
                { id: "A.APR.B.2.4", text: "Use the Remainder Theorem to evaluate a polynomial efficiently at a given value" },
              ]
            },
            {
              code: "A.APR.B.3",
              name: "Identify zeros of polynomials when suitable factorizations are available and use the zeros to construct a rough graph.",
              subtopics: [
                { id: "A.APR.B.3.1", text: "Factor a polynomial completely to identify all real zeros" },
                { id: "A.APR.B.3.2", text: "Determine the multiplicity of each zero and its effect on the graph (crossing vs. touching)" },
                { id: "A.APR.B.3.3", text: "Determine end behaviour from the leading term (degree and sign)" },
                { id: "A.APR.B.3.4", text: "Sketch a rough graph showing x-intercepts, y-intercept, end behaviour, and approximate turning points" },
              ]
            },
          ]
        },
        {
          code: "A.APR.D",
          name: "Arithmetic with Polynomials and Rational Expressions (A.APR) — Rewrite rational expressions",
          objectives: [
            {
              code: "A.APR.D.6",
              name: "Rewrite simple rational expressions in different forms; write a(x)/b(x) in the form q(x) + r(x)/b(x).",
              subtopics: [
                { id: "A.APR.D.6.1", text: "Perform polynomial long division of a(x) ÷ b(x)" },
                { id: "A.APR.D.6.2", text: "Express the result as quotient plus remainder over divisor: q(x) + r(x)/b(x)" },
                { id: "A.APR.D.6.3", text: "Identify when b(x) is a factor of a(x) (zero remainder)" },
                { id: "A.APR.D.6.4", text: "Simplify rational expressions by factoring and cancelling common factors" },
              ]
            },
          ]
        },
        {
          code: "A.REI.A",
          name: "Reasoning with Equations and Inequalities (A.REI) — Understand solving equations as a process of reasoning",
          objectives: [
            {
              code: "A.REI.A.1",
              name: "Explain each step in solving a simple equation as following from the equality of numbers asserted at the previous step; justify a solution method.",
              subtopics: [
                { id: "A.REI.A.1.1", text: "Apply properties of equality (addition, subtraction, multiplication, division) to both sides" },
                { id: "A.REI.A.1.2", text: "Articulate the property or theorem that justifies each algebraic step" },
                { id: "A.REI.A.1.3", text: "Recognise that each step maintains the equivalence of the equation" },
                { id: "A.REI.A.1.4", text: "Identify invalid steps (e.g., dividing by an expression that could equal zero)" },
              ]
            },
            {
              code: "A.REI.A.2",
              name: "Solve simple rational and radical equations in one variable, and give examples showing how extraneous solutions may arise.",
              subtopics: [
                { id: "A.REI.A.2.1", text: "Isolate a radical and raise both sides to the appropriate power to eliminate it" },
                { id: "A.REI.A.2.2", text: "Clear denominators to solve rational equations" },
                { id: "A.REI.A.2.3", text: "Check all candidate solutions in the original equation to identify extraneous solutions" },
                { id: "A.REI.A.2.4", text: "Explain why squaring both sides or multiplying by a variable denominator can introduce extraneous solutions" },
              ]
            },
          ]
        },
        {
          code: "A.REI.B",
          name: "Reasoning with Equations and Inequalities (A.REI) — Solve equations and inequalities in one variable",
          objectives: [
            {
              code: "A.REI.B.4b",
              name: "Solve quadratic equations by appropriate methods; recognize when the quadratic formula gives complex solutions and write them as a +/- bi.",
              subtopics: [
                { id: "A.REI.B.4b.1", text: "Solve by factoring, completing the square, square-root method, and quadratic formula" },
                { id: "A.REI.B.4b.2", text: "Choose the most efficient method based on the structure of the equation" },
                { id: "A.REI.B.4b.3", text: "Compute the discriminant b² − 4ac to predict the nature of the solutions" },
                { id: "A.REI.B.4b.4", text: "Write complex solutions in a ± bi form" },
              ]
            },
          ]
        },
        {
          code: "A.REI.C",
          name: "Reasoning with Equations and Inequalities (A.REI) — Solve systems of equations",
          objectives: [
            {
              code: "A.REI.C.6",
              name: "Solve systems of linear equations algebraically and graphically, focusing on pairs of linear equations in two variables.",
              subtopics: [
                { id: "A.REI.C.6.1", text: "Solve by substitution: isolate one variable and substitute into the other equation" },
                { id: "A.REI.C.6.2", text: "Solve by elimination: add or subtract equations to eliminate one variable" },
                { id: "A.REI.C.6.3", text: "Interpret the solution as the intersection point of two lines on a graph" },
                { id: "A.REI.C.6.4", text: "Classify systems as consistent (one solution), inconsistent (no solution), or dependent (infinitely many)" },
              ]
            },
            {
              code: "A.REI.C.7",
              name: "Solve a system consisting of a linear equation and a quadratic equation in two variables algebraically and graphically.",
              subtopics: [
                { id: "A.REI.C.7.1", text: "Substitute the linear expression into the quadratic to obtain one equation in one variable" },
                { id: "A.REI.C.7.2", text: "Solve the resulting quadratic and find both variable values for each solution" },
                { id: "A.REI.C.7.3", text: "Interpret solutions graphically as intersection points of a line and a parabola" },
                { id: "A.REI.C.7.4", text: "Recognise that there may be 0, 1, or 2 real intersection points" },
              ]
            },
          ]
        },
        {
          code: "A.REI.D",
          name: "Reasoning with Equations and Inequalities (A.REI) — Represent and solve equations and inequalities graphically",
          objectives: [
            {
              code: "A.REI.D.11",
              name: "Explain why the x-coordinates where y=f(x) and y=g(x) intersect are solutions of f(x)=g(x); find solutions approximately using technology or tables.",
              subtopics: [
                { id: "A.REI.D.11.1", text: "Understand that f(x) = g(x) means both graphs share the same output at that x-value" },
                { id: "A.REI.D.11.2", text: "Use a graphing tool to identify x-coordinates at intersection points" },
                { id: "A.REI.D.11.3", text: "Use a table of values to narrow down and approximate solutions" },
                { id: "A.REI.D.11.4", text: "Apply this approach to polynomial, exponential, and logarithmic equations" },
              ]
            },
          ]
        },
        {
          code: "F.IF.A",
          name: "Interpreting Functions (F.IF) — Understand the concept of a function and use function notation",
          objectives: [
            {
              code: "F.IF.A.3",
              name: "Recognize that sequences are functions, sometimes defined recursively, whose domain is a subset of the integers.",
              subtopics: [
                { id: "F.IF.A.3.1", text: "Express arithmetic and geometric sequences using function notation f(n)" },
                { id: "F.IF.A.3.2", text: "Write recursive definitions: f(n) = f(n−1) + d (arithmetic) or f(n) = r·f(n−1) (geometric)" },
                { id: "F.IF.A.3.3", text: "Identify the domain as a subset of non-negative integers {0, 1, 2, …}" },
                { id: "F.IF.A.3.4", text: "Connect sequence notation aₙ to function notation f(n)" },
              ]
            },
          ]
        },
        {
          code: "F.IF.B",
          name: "Interpreting Functions (F.IF) — Interpret functions that arise in applications in terms of the context",
          objectives: [
            {
              code: "F.IF.B.4",
              name: "Interpret key features of graphs and tables in terms of the quantities and sketch graphs showing key features given a verbal description.",
              subtopics: [
                { id: "F.IF.B.4.1", text: "Identify intercepts, maxima, minima, intervals of increase/decrease, and end behaviour" },
                { id: "F.IF.B.4.2", text: "Interpret vertex, axis of symmetry, and x-intercepts in context for quadratic models" },
                { id: "F.IF.B.4.3", text: "Identify asymptotes and long-run behaviour for exponential, logarithmic, and rational functions" },
                { id: "F.IF.B.4.4", text: "Sketch a graph from a verbal description, labelling all key features" },
              ]
            },
            {
              code: "F.IF.B.6",
              name: "Calculate and interpret the average rate of change of a function over a specified interval; estimate from a graph.",
              subtopics: [
                { id: "F.IF.B.6.1", text: "Calculate average rate of change as (f(b) − f(a)) / (b − a)" },
                { id: "F.IF.B.6.2", text: "Interpret the result as the slope of the secant line over [a, b]" },
                { id: "F.IF.B.6.3", text: "Estimate average rate of change from a graph by reading coordinates" },
                { id: "F.IF.B.6.4", text: "Compare rates of change over different intervals to describe concavity or acceleration" },
              ]
            },
          ]
        },
        {
          code: "F.IF.C",
          name: "Interpreting Functions (F.IF) — Analyze functions using different representations",
          objectives: [
            {
              code: "F.IF.C.7b",
              name: "Graph square root, cube root, and piecewise-defined functions, including step functions and absolute value functions.",
              subtopics: [
                { id: "F.IF.C.7b.1", text: "Graph √x and ∛x, identifying domain, range, and key anchor points" },
                { id: "F.IF.C.7b.2", text: "Graph absolute value f(x) = |x − h| + k as a V-shape with vertex (h, k)" },
                { id: "F.IF.C.7b.3", text: "Write and graph piecewise-defined functions with attention to open/closed endpoints" },
                { id: "F.IF.C.7b.4", text: "Graph step functions (greatest integer function) and interpret jump discontinuities" },
              ]
            },
            {
              code: "F.IF.C.7c",
              name: "Graph polynomial functions, identifying zeros when suitable factorizations are available, and showing end behavior.",
              subtopics: [
                { id: "F.IF.C.7c.1", text: "Determine end behaviour from the leading term: degree (even/odd) and leading coefficient (positive/negative)" },
                { id: "F.IF.C.7c.2", text: "Find x-intercepts by factoring and identify the multiplicity of each zero" },
                { id: "F.IF.C.7c.3", text: "Sketch through intercepts respecting multiplicity (cross for odd, bounce for even)" },
                { id: "F.IF.C.7c.4", text: "Find the y-intercept by evaluating f(0) and use it to anchor the sketch" },
              ]
            },
            {
              code: "F.IF.C.7e",
              name: "Graph exponential and logarithmic functions, showing intercepts and end behavior.",
              subtopics: [
                { id: "F.IF.C.7e.1", text: "Graph f(x) = bˣ for b > 1 (growth) and 0 < b < 1 (decay), identifying horizontal asymptote y = 0" },
                { id: "F.IF.C.7e.2", text: "Graph f(x) = log_b(x), identifying the vertical asymptote x = 0 and x-intercept (1, 0)" },
                { id: "F.IF.C.7e.3", text: "Apply transformations (shifts, reflections, stretches) to exponential and logarithmic graphs" },
                { id: "F.IF.C.7e.4", text: "Describe end behaviour as x → ±∞ for each function type" },
              ]
            },
            {
              code: "F.IF.C.8b",
              name: "Use the properties of exponents to interpret expressions for exponential functions and classify them as growth or decay.",
              subtopics: [
                { id: "F.IF.C.8b.1", text: "Rewrite A·bˢˣ in the form A·(bˢ)ˣ to identify the per-unit growth factor" },
                { id: "F.IF.C.8b.2", text: "Classify as growth (base > 1) or decay (0 < base < 1)" },
                { id: "F.IF.C.8b.3", text: "Interpret the growth/decay rate as a percentage: factor 1.05 means 5% growth per period" },
                { id: "F.IF.C.8b.4", text: "Convert between annual and monthly/quarterly rates using exponent properties" },
              ]
            },
            {
              code: "F.IF.C.9",
              name: "Compare properties of two functions each represented in a different way (algebraically, graphically, numerically, or verbally).",
              subtopics: [
                { id: "F.IF.C.9.1", text: "Extract and compare intercepts, slopes, rates of change, and extrema across representations" },
                { id: "F.IF.C.9.2", text: "Compare a function given as an equation to one given as a graph or table" },
                { id: "F.IF.C.9.3", text: "Identify which function has a greater maximum, steeper increase, or different end behaviour" },
                { id: "F.IF.C.9.4", text: "Apply comparisons to polynomial, exponential, and logarithmic function families" },
              ]
            },
          ]
        },
        {
          code: "F.BF.A",
          name: "Building Functions (F.BF) — Build a function that models a relationship between two quantities",
          objectives: [
            {
              code: "F.BF.A.1a",
              name: "Determine an explicit expression, a recursive process, or steps for calculation for a function from a context.",
              subtopics: [
                { id: "F.BF.A.1a.1", text: "Write an explicit rule f(n) = … directly from a description or pattern" },
                { id: "F.BF.A.1a.2", text: "Write a recursive rule f(n) = f(n−1) + … from a description" },
                { id: "F.BF.A.1a.3", text: "Evaluate an explicit or recursive formula at a specific input" },
                { id: "F.BF.A.1a.4", text: "Distinguish between explicit and recursive forms and know when each is more useful" },
              ]
            },
            {
              code: "F.BF.A.1b",
              name: "Combine standard function types using arithmetic operations.",
              subtopics: [
                { id: "F.BF.A.1b.1", text: "Form sum, difference, product, and quotient of two functions: (f + g)(x), (f·g)(x), (f/g)(x)" },
                { id: "F.BF.A.1b.2", text: "Identify the domain of a combined function (intersection of individual domains)" },
                { id: "F.BF.A.1b.3", text: "Model a real-world situation as the sum or product of two simpler functions" },
                { id: "F.BF.A.1b.4", text: "Evaluate combined functions at specific values" },
              ]
            },
            {
              code: "F.BF.A.2",
              name: "Write arithmetic and geometric sequences recursively and with an explicit formula; model situations and translate between forms.",
              subtopics: [
                { id: "F.BF.A.2.1", text: "Write arithmetic sequence: explicit aₙ = a₁ + (n−1)d and recursive aₙ = aₙ₋₁ + d" },
                { id: "F.BF.A.2.2", text: "Write geometric sequence: explicit aₙ = a₁·rⁿ⁻¹ and recursive aₙ = r·aₙ₋₁" },
                { id: "F.BF.A.2.3", text: "Identify whether a sequence is arithmetic, geometric, or neither from a table or context" },
                { id: "F.BF.A.2.4", text: "Use explicit formulas to find the nth term; use recursive definitions for step-by-step iteration" },
              ]
            },
          ]
        },
        {
          code: "F.BF.B",
          name: "Building Functions (F.BF) — Build new functions from existing functions",
          objectives: [
            {
              code: "F.BF.B.3",
              name: "Identify the effect on the graph of replacing f(x) by f(x)+k, kf(x), f(kx), and f(x+k); find k given the graphs.",
              subtopics: [
                { id: "F.BF.B.3.1", text: "f(x) + k: vertical translation up k (down if k < 0)" },
                { id: "F.BF.B.3.2", text: "f(x + k): horizontal translation left k (right if k < 0)" },
                { id: "F.BF.B.3.3", text: "k·f(x): vertical stretch/compression; reflection over x-axis if k < 0" },
                { id: "F.BF.B.3.4", text: "f(kx): horizontal stretch/compression; reflection over y-axis if k < 0" },
                { id: "F.BF.B.3.5", text: "Determine k from two given graphs of the same function family" },
              ]
            },
            {
              code: "F.BF.B.4a",
              name: "Solve an equation of the form f(x)=c for a simple function that has an inverse and write an expression for the inverse.",
              subtopics: [
                { id: "F.BF.B.4a.1", text: "Find the inverse of linear and simple power/root functions by swapping x and y and solving for y" },
                { id: "F.BF.B.4a.2", text: "Verify the inverse using f(f⁻¹(x)) = x and f⁻¹(f(x)) = x" },
                { id: "F.BF.B.4a.3", text: "Recognise that a function must be one-to-one (passes horizontal line test) to have an inverse" },
                { id: "F.BF.B.4a.4", text: "Interpret the inverse function in context (e.g., reverse the input/output relationship)" },
              ]
            },
          ]
        },
        {
          code: "F.LE.A",
          name: "Linear and Exponential Models (F.LE) — Construct and compare linear and exponential models and solve problems",
          objectives: [
            {
              code: "F.LE.A.2",
              name: "Construct linear and exponential functions, including arithmetic and geometric sequences, given a graph, a description, or two input-output pairs.",
              subtopics: [
                { id: "F.LE.A.2.1", text: "Construct a linear function from two points or a slope and y-intercept description" },
                { id: "F.LE.A.2.2", text: "Construct an exponential function f(x) = a·bˣ from two points by solving for a and b" },
                { id: "F.LE.A.2.3", text: "Recognise arithmetic sequences as linear functions and geometric sequences as exponential" },
                { id: "F.LE.A.2.4", text: "Use tables or graphs to write the function rule and verify against given data" },
              ]
            },
            {
              code: "F.LE.A.4",
              name: "Understand the inverse relationship between exponents and logarithms; express solutions to exponential models as logarithms and evaluate using technology.",
              subtopics: [
                { id: "F.LE.A.4.1", text: "Convert between exponential form bˣ = y and logarithmic form log_b(y) = x" },
                { id: "F.LE.A.4.2", text: "Solve exponential equations by applying a logarithm to both sides" },
                { id: "F.LE.A.4.3", text: "Apply the change-of-base formula: log_b(x) = log(x)/log(b) = ln(x)/ln(b)" },
                { id: "F.LE.A.4.4", text: "Use technology to evaluate logarithms and interpret the result in context" },
              ]
            },
          ]
        },
        {
          code: "F.LE.B",
          name: "Linear and Exponential Models (F.LE) — Interpret expressions for functions in terms of the situation they model",
          objectives: [
            {
              code: "F.LE.B.5",
              name: "Interpret the parameters in a linear or exponential function in terms of a context.",
              subtopics: [
                { id: "F.LE.B.5.1", text: "Interpret slope and y-intercept of a linear model: rate of change and initial value" },
                { id: "F.LE.B.5.2", text: "Interpret a and b in f(x) = a·bˣ: a is the initial value, b is the growth/decay factor" },
                { id: "F.LE.B.5.3", text: "Convert growth factor b to percent rate of change: r = b − 1" },
                { id: "F.LE.B.5.4", text: "Evaluate whether a linear or exponential model is more appropriate for a given data set" },
              ]
            },
          ]
        },
        {
          code: "S.ID.A",
          name: "Interpreting Categorical and Quantitative Data (S.ID) — Summarize, represent, and interpret data on a single variable",
          objectives: [
            {
              code: "S.ID.A.1",
              name: "Represent data with plots on the real number line (dot plots, histograms, and box plots).",
              subtopics: [
                { id: "S.ID.A.1.1", text: "Create and interpret dot plots for small data sets" },
                { id: "S.ID.A.1.2", text: "Construct histograms by choosing appropriate bin widths and reading frequency" },
                { id: "S.ID.A.1.3", text: "Construct box plots from a five-number summary (min, Q1, median, Q3, max)" },
                { id: "S.ID.A.1.4", text: "Select the appropriate display type based on data size and the question being asked" },
              ]
            },
            {
              code: "S.ID.A.2",
              name: "Use statistics appropriate to the shape of the distribution to compare center and spread of two or more data sets.",
              subtopics: [
                { id: "S.ID.A.2.1", text: "Use mean and standard deviation for symmetric, approximately normal distributions" },
                { id: "S.ID.A.2.2", text: "Use median and IQR for skewed distributions or data with outliers" },
                { id: "S.ID.A.2.3", text: "Compare center and spread of two data sets side-by-side using the same display type" },
                { id: "S.ID.A.2.4", text: "Recognise that the mean is sensitive to outliers but the median is resistant" },
              ]
            },
            {
              code: "S.ID.A.3",
              name: "Interpret differences in shape, center, and spread in context, accounting for possible effects of outliers.",
              subtopics: [
                { id: "S.ID.A.3.1", text: "Describe distribution shape: symmetric, left-skewed, right-skewed, bimodal, uniform" },
                { id: "S.ID.A.3.2", text: "Identify outliers using the 1.5×IQR rule or by inspection in a box plot" },
                { id: "S.ID.A.3.3", text: "Explain what an outlier means in the context of the data" },
                { id: "S.ID.A.3.4", text: "Explain how removing an outlier would change the mean, median, and spread" },
              ]
            },
            {
              code: "S.ID.A.4",
              name: "Use the mean and standard deviation to fit data to a normal distribution and estimate population percentages when appropriate.",
              subtopics: [
                { id: "S.ID.A.4.1", text: "Identify characteristics of the normal distribution (bell-shaped, symmetric about the mean)" },
                { id: "S.ID.A.4.2", text: "Apply the Empirical Rule: ~68%, ~95%, ~99.7% of data within 1, 2, 3 standard deviations" },
                { id: "S.ID.A.4.3", text: "Calculate z-scores and use them to estimate percentages using a table or technology" },
                { id: "S.ID.A.4.4", text: "Assess whether it is appropriate to model a data set with a normal distribution" },
              ]
            },
          ]
        },
        {
          code: "S.ID.B",
          name: "Interpreting Categorical and Quantitative Data (S.ID) — Summarize, represent, and interpret data on two variables",
          objectives: [
            {
              code: "S.ID.B.5",
              name: "Summarize categorical data for two categories in two-way frequency tables; interpret relative frequencies and recognize associations and trends.",
              subtopics: [
                { id: "S.ID.B.5.1", text: "Construct a two-way frequency table from raw categorical data" },
                { id: "S.ID.B.5.2", text: "Calculate joint, marginal, and conditional relative frequencies" },
                { id: "S.ID.B.5.3", text: "Interpret relative frequencies to describe associations between categories" },
                { id: "S.ID.B.5.4", text: "Recognise that association in a sample does not imply causation" },
              ]
            },
            {
              code: "S.ID.B.6a",
              name: "Fit a function to data (including with technology) and use it to solve problems in context; emphasize linear and exponential models.",
              subtopics: [
                { id: "S.ID.B.6a.1", text: "Use technology to perform linear or exponential regression on a data set" },
                { id: "S.ID.B.6a.2", text: "Interpret the regression equation (slope, y-intercept, or growth factor) in context" },
                { id: "S.ID.B.6a.3", text: "Use the fitted model to make predictions by interpolation and extrapolation" },
                { id: "S.ID.B.6a.4", text: "Evaluate whether a linear or exponential model better fits the data from a scatterplot" },
              ]
            },
            {
              code: "S.ID.B.6b",
              name: "Informally assess the fit of a function by plotting and analyzing residuals, including with the use of technology.",
              subtopics: [
                { id: "S.ID.B.6b.1", text: "Calculate residuals: observed value − predicted value" },
                { id: "S.ID.B.6b.2", text: "Plot residuals vs. x-values and assess whether the pattern is random" },
                { id: "S.ID.B.6b.3", text: "Interpret a systematic pattern in residuals as evidence of poor model fit" },
                { id: "S.ID.B.6b.4", text: "Use residual plots alongside r² to evaluate the overall quality of fit" },
              ]
            },
          ]
        },
      ]
    }
  },
  georgia: {
    "advanced algebra": {
      standards: [
        {
          code: "AA.MM.1",
          name: "Mathematical Modeling",
          objectives: [
            {
              code: "AA.MM.1.1",
              name: "Explain applicable mathematical problems using a mathematical model.",
              subtopics: [
                { id: "AA.MM.1.1.1", text: "Interpret contextually relevant problems and make decisions about how to solve them" },
                { id: "AA.MM.1.1.2", text: "Apply content from this course to explain real-life phenomena mathematically" },
              ]
            },
            {
              code: "AA.MM.1.2",
              name: "Create mathematical models to explain phenomena across disciplines.",
              subtopics: [
                { id: "AA.MM.1.2.1", text: "Use course content to build mathematical models for real-life phenomena across disciplines" },
              ]
            },
            {
              code: "AA.MM.1.3",
              name: "Using abstract and quantitative reasoning, make decisions about information and data.",
              subtopics: [
                { id: "AA.MM.1.3.1", text: "Analyze functions, graphs, tables, and equations and make decisions about real-life situations" },
                { id: "AA.MM.1.3.2", text: "Analyze statistical results to decide best course of action" },
              ]
            },
            {
              code: "AA.MM.1.4",
              name: "Use various mathematical representations and structures to represent and solve real-life problems.",
              subtopics: [
                { id: "AA.MM.1.4.1", text: "Generate models, graphs, charts, and equations to represent real-world phenomena" },
                { id: "AA.MM.1.4.2", text: "Use technology to show phenomena and solve problems" },
              ]
            },
          ]
        },
        {
          code: "AA.DSR.2",
          name: "Descriptive and Inferential Statistics",
          objectives: [
            {
              code: "AA.DSR.2.1",
              name: "Recognize purposes and differences among sample surveys, experiments, and observational studies.",
              subtopics: [
                { id: "AA.DSR.2.1.1", text: "Collect primary data and/or use secondary data" },
                { id: "AA.DSR.2.1.2", text: "Critique studies of different design types" },
                { id: "AA.DSR.2.1.3", text: "Explain how randomization relates to each investigation style" },
                { id: "AA.DSR.2.1.4", text: "Evaluate a research study and critique its investigative measures and conclusions" },
              ]
            },
            {
              code: "AA.DSR.2.2",
              name: "Critically evaluate ethics, privacy, potential bias, and confounding variables.",
              subtopics: [
                { id: "AA.DSR.2.2.1", text: "Question how data were collected, rationale for the study, positionality of the researcher" },
                { id: "AA.DSR.2.2.2", text: "Recognize bias and describe its potential effects" },
                { id: "AA.DSR.2.2.3", text: "Search for data online and prepare it by dealing with messy data" },
                { id: "AA.DSR.2.2.4", text: "Critically evaluate methods used to collect, organize, and communicate data" },
              ]
            },
            {
              code: "AA.DSR.2.3",
              name: "Distinguish between population, sample data, and sampling distributions.",
              subtopics: [
                { id: "AA.DSR.2.3.1", text: "Recognize it is usually not feasible to study an entire population" },
                { id: "AA.DSR.2.3.2", text: "Explore representative samples to make inferences about the population" },
                { id: "AA.DSR.2.3.3", text: "Understand how sampling distributions from simulation describe sample-to-sample variability" },
                { id: "AA.DSR.2.3.4", text: "Communicate statistical results using appropriate statistical language" },
              ]
            },
            {
              code: "AA.DSR.2.4",
              name: "Calculate and interpret z-scores as a measure of relative standing.",
              subtopics: [
                { id: "AA.DSR.2.4.1", text: "Understand z-scores allow comparison of samples with differing units" },
                { id: "AA.DSR.2.4.2", text: "Use z-scores to make decisions when analyzing real-world data" },
                { id: "AA.DSR.2.4.3", text: "Use technology to calculate standard deviation when determining z-scores" },
              ]
            },
            {
              code: "AA.DSR.2.5",
              name: "Given a normally distributed population, estimate percentages using the Empirical Rule and z-scores.",
              subtopics: [
                { id: "AA.DSR.2.5.1", text: "Recognize when data is not normally distributed" },
                { id: "AA.DSR.2.5.2", text: "Use calculators, spreadsheets, or tables to estimate areas under a normal curve" },
              ]
            },
            {
              code: "AA.DSR.2.6",
              name: "Model sample-to-sample variability in sampling distributions using simulations.",
              subtopics: [
                { id: "AA.DSR.2.6.1", text: "Use simulations to decide if a specified model accurately reflects real outcomes" },
                { id: "AA.DSR.2.6.2", text: "Consider sample-to-sample variability using statistics from repeated samples" },
                { id: "AA.DSR.2.6.3", text: "Simulate sampling distributions for a sample mean or population proportion" },
              ]
            },
            {
              code: "AA.DSR.2.7",
              name: "Given a margin of error, develop and compare confidence intervals.",
              subtopics: [
                { id: "AA.DSR.2.7.1", text: "Apply margin of error to make conclusions about reliability of statistical results" },
                { id: "AA.DSR.2.7.2", text: "Develop confidence intervals using simulations and technology" },
                { id: "AA.DSR.2.7.3", text: "Compare exit polls with different margins of error to determine if results are conclusive" },
              ]
            },
            {
              code: "AA.DSR.2.8",
              name: "Summarize and evaluate reports based on data for appropriateness of study design.",
              subtopics: [
                { id: "AA.DSR.2.8.1", text: "Communicate statistical information using written and oral reports" },
              ]
            },
          ]
        },
        {
          code: "AA.FGR.3",
          name: "Exponential and Logarithmic Functions",
          objectives: [
            {
              code: "AA.FGR.3.1",
              name: "Find inverses of exponential and logarithmic functions.",
              subtopics: [
                { id: "AA.FGR.3.1.1", text: "Verify by inspection: compare graphs showing reflection across y = x" },
                { id: "AA.FGR.3.1.2", text: "Verify by inspection: show one table's y-values are another's x-values" },
                { id: "AA.FGR.3.1.3", text: "Prove by composition: determine if f(g(x)) = g(f(x)) = x" },
                { id: "AA.FGR.3.1.4", text: "Limit domain of inverses where necessary to maintain functionality" },
              ]
            },
            {
              code: "AA.FGR.3.2",
              name: "Analyze, graph, and compare exponential and logarithmic functions.",
              subtopics: [
                { id: "AA.FGR.3.2.1", text: "Identify key features: domain, range, intercepts, roots/zeros, asymptotes" },
                { id: "AA.FGR.3.2.2", text: "Identify intervals where function is positive/negative, end behavior" },
                { id: "AA.FGR.3.2.3", text: "Calculate average rate of change for a given interval" },
              ]
            },
            {
              code: "AA.FGR.3.3",
              name: "Use the definition of a logarithm and logarithmic properties to solve problems.",
              subtopics: [
                { id: "AA.FGR.3.3.1", text: "Solve real-life problems involving common logarithm and natural logarithm" },
                { id: "AA.FGR.3.3.2", text: "Apply knowledge of inverse relationship between exponential and logarithmic functions" },
              ]
            },
            {
              code: "AA.FGR.3.4",
              name: "Create exponential equations and use logarithms to solve contextual problems.",
              subtopics: [
                { id: "AA.FGR.3.4.1", text: "Solve problems involving exponential equations using logarithmic relationship" },
                { id: "AA.FGR.3.4.2", text: "Apply to real-life problems: exponential growth, compound interest, Newton's Law of Cooling" },
              ]
            },
            {
              code: "AA.FGR.3.5",
              name: "Create and interpret logarithmic equations in one variable.",
              subtopics: [
                { id: "AA.FGR.3.5.1", text: "Use logarithmic equations to solve real-life problems" },
                { id: "AA.FGR.3.5.2", text: "Example contexts: pH = −log(H⁺) to define acidity or alkalinity" },
              ]
            },
            {
              code: "AA.FGR.3.6",
              name: "Create, interpret, and solve exponential equations in two or more variables.",
              subtopics: [
                { id: "AA.FGR.3.6.1", text: "Discuss characteristics in context: domain, range, zeros, intercepts, asymptote" },
                { id: "AA.FGR.3.6.2", text: "Solve real-life problems modeled by exponential equations" },
                { id: "AA.FGR.3.6.3", text: "Example contexts: half-life, exponential growth/decay, compound interest" },
              ]
            },
            {
              code: "AA.FGR.3.7",
              name: "Create, interpret, and solve logarithmic equations in two or more variables.",
              subtopics: [
                { id: "AA.FGR.3.7.1", text: "Analyze and interpret logarithmic equations in applicable situations" },
                { id: "AA.FGR.3.7.2", text: "Discuss characteristics: domain, range, zeros, intercepts, asymptote" },
                { id: "AA.FGR.3.7.3", text: "Example contexts: magnitude of earthquakes M = log₁₀(I/S)" },
              ]
            },
          ]
        },
        {
          code: "AA.FGR.4",
          name: "Radical Functions",
          objectives: [
            {
              code: "AA.FGR.4.1",
              name: "Rewrite radical expressions as rational exponents; extend properties of integer exponents.",
              subtopics: [
                { id: "AA.FGR.4.1.1", text: "Convert between radical expressions and rational exponent expressions" },
                { id: "AA.FGR.4.1.2", text: "Recognize that ⁿ√(bˣ) = b^(x/n)" },
                { id: "AA.FGR.4.1.3", text: "Apply product rule, quotient rule, and power rule with rational exponents" },
              ]
            },
            {
              code: "AA.FGR.4.2",
              name: "Solve radical equations in one variable; identify extraneous solutions.",
              subtopics: [
                { id: "AA.FGR.4.2.1", text: "Convert between radical and rational exponent forms to solve equations" },
                { id: "AA.FGR.4.2.2", text: "Use substitution to check answers and identify extraneous solutions" },
                { id: "AA.FGR.4.2.3", text: "Use technology/graphing to solve and explore radical equations" },
              ]
            },
            {
              code: "AA.FGR.4.3",
              name: "Analyze and graph radical functions.",
              subtopics: [
                { id: "AA.FGR.4.3.1", text: "Identify key features: domain, range, intercepts, roots/zeros" },
                { id: "AA.FGR.4.3.2", text: "Identify intervals where function is increasing, decreasing, positive, negative" },
                { id: "AA.FGR.4.3.3", text: "Calculate average rate of change for a given interval" },
              ]
            },
            {
              code: "AA.FGR.4.4",
              name: "Create, interpret, and solve radical equations with one unknown.",
              subtopics: [
                { id: "AA.FGR.4.4.1", text: "Analyze and interpret radical equations in applicable situations" },
                { id: "AA.FGR.4.4.2", text: "Solve problems modeled by radical equations" },
                { id: "AA.FGR.4.4.3", text: "Example: radical equation using the distance formula with one unknown coordinate" },
              ]
            },
            {
              code: "AA.FGR.4.5",
              name: "Create, interpret, and solve radical equations in two or more variables.",
              subtopics: [
                { id: "AA.FGR.4.5.1", text: "Less focus on mechanics; more focus on interpreting radical functions in context" },
                { id: "AA.FGR.4.5.2", text: "Example contexts: problems involving velocity with two unknown variables" },
              ]
            },
          ]
        },
        {
          code: "AA.FGR.5",
          name: "Polynomial Functions",
          objectives: [
            {
              code: "AA.FGR.5.1",
              name: "Graph and analyze quadratic functions; include regression analysis.",
              subtopics: [
                { id: "AA.FGR.5.1.1", text: "Use standard, factored, and vertex forms to graph and identify key features" },
                { id: "AA.FGR.5.1.2", text: "Identify vertex, extreme value, axis of symmetry, end behavior" },
                { id: "AA.FGR.5.1.3", text: "Calculate average rate of change for a given interval" },
                { id: "AA.FGR.5.1.4", text: "Perform regression analysis informally with verbal descriptions using technology" },
              ]
            },
            {
              code: "AA.FGR.5.2",
              name: "Define complex numbers; identify form a + bi and complex conjugate.",
              subtopics: [
                { id: "AA.FGR.5.2.1", text: "Identify the real part and imaginary part of a complex number" },
                { id: "AA.FGR.5.2.2", text: "Convert any power of i to an equivalent form and identify the pattern" },
                { id: "AA.FGR.5.2.3", text: "Recognize complex numbers always occur as pairs when they represent polynomial solutions" },
              ]
            },
            {
              code: "AA.FGR.5.3",
              name: "Add, subtract, and multiply complex numbers using properties.",
              subtopics: [
                { id: "AA.FGR.5.3.1", text: "Solve real-life problems requiring operations with complex numbers" },
                { id: "AA.FGR.5.3.2", text: "Division of complex numbers is beyond the scope of this course" },
              ]
            },
            {
              code: "AA.FGR.5.4",
              name: "Factor quadratics using structure.",
              subtopics: [
                { id: "AA.FGR.5.4.1", text: "Factor perfect-square trinomials" },
                { id: "AA.FGR.5.4.2", text: "Factor difference of two perfect squares" },
              ]
            },
            {
              code: "AA.FGR.5.5",
              name: "Write and solve quadratic equations and inequalities with real coefficients.",
              subtopics: [
                { id: "AA.FGR.5.5.1", text: "Solve by inspection, square roots, factoring, completing the square, quadratic formula" },
                { id: "AA.FGR.5.5.2", text: "Model real-life scenarios using quadratic equations and inequalities" },
                { id: "AA.FGR.5.5.3", text: "Connect solutions to the graph of the corresponding quadratic function" },
                { id: "AA.FGR.5.5.4", text: "Includes equations with complex solutions" },
              ]
            },
            {
              code: "AA.FGR.5.6",
              name: "Solve systems of quadratic and linear functions; find points of intersection.",
              subtopics: [
                { id: "AA.FGR.5.6.1", text: "Solve algebraically by hand and using technology" },
                { id: "AA.FGR.5.6.2", text: "Identify intersections of a parabola and a line" },
              ]
            },
            {
              code: "AA.FGR.5.7",
              name: "Create and analyze quadratic equations to model contextual situations.",
              subtopics: [
                { id: "AA.FGR.5.7.1", text: "Model real-life scenarios using quadratic equations in two or more variables" },
                { id: "AA.FGR.5.7.2", text: "Example contexts: projectile motion" },
              ]
            },
            {
              code: "AA.FGR.5.8",
              name: "Identify number of zeros for any polynomial using degree and end behavior.",
              subtopics: [
                { id: "AA.FGR.5.8.1", text: "Apply the Fundamental Theorem of Algebra" },
                { id: "AA.FGR.5.8.2", text: "Determine left and right end behavior based on leading coefficient and degree" },
                { id: "AA.FGR.5.8.3", text: "Understand complex solutions always occur in pairs" },
              ]
            },
            {
              code: "AA.FGR.5.9",
              name: "Identify zeros of polynomial functions; construct and analyze graphs.",
              subtopics: [
                { id: "AA.FGR.5.9.1", text: "Identify key features: intercepts, roots of multiplicity, domain, range, end behavior" },
                { id: "AA.FGR.5.9.2", text: "Use technology to graph standard-form polynomials" },
              ]
            },
            {
              code: "AA.FGR.5.10",
              name: "Factor polynomials including sum/difference of cubes and higher-order types.",
              subtopics: [
                { id: "AA.FGR.5.10.1", text: "Factor sum of cubes and difference of cubes" },
                { id: "AA.FGR.5.10.2", text: "Factor higher-order polynomials expressible as quadratic-within-quadratic" },
              ]
            },
            {
              code: "AA.FGR.5.11",
              name: "Using all zeros, write a polynomial in standard form.",
              subtopics: [
                { id: "AA.FGR.5.11.1", text: "Analyze a graph to identify where multiplicity exists" },
                { id: "AA.FGR.5.11.2", text: "Recognize that repeating a factor may be necessary for multiplicity" },
              ]
            },
          ]
        },
        {
          code: "AA.PAR.6",
          name: "Linear Algebra and Matrices",
          objectives: [
            {
              code: "AA.PAR.6.1",
              name: "Use matrices to represent data; perform operations with matrices and scalars.",
              subtopics: [
                { id: "AA.PAR.6.1.1", text: "Perform operations including with identity matrix and zero matrix" },
                { id: "AA.PAR.6.1.2", text: "Recognize matrix multiplication is NOT commutative" },
                { id: "AA.PAR.6.1.3", text: "By hand: scalar multiplication, addition, subtraction, 2×2 multiplication, determinant, inverse" },
              ]
            },
            {
              code: "AA.PAR.6.2",
              name: "Rewrite a system of linear equations as a matrix representation.",
              subtopics: [
                { id: "AA.PAR.6.2.1", text: "Express as: coefficient matrix × variable matrix = constant matrix" },
              ]
            },
            {
              code: "AA.PAR.6.3",
              name: "Use the inverse of an invertible matrix to solve systems of linear equations.",
              subtopics: [
                { id: "AA.PAR.6.3.1", text: "Technology may be used for matrices 2×2 or higher to calculate the inverse" },
              ]
            },
            {
              code: "AA.PAR.6.4",
              name: "Utilize linear programming to represent and solve real-world optimization problems.",
              subtopics: [
                { id: "AA.PAR.6.4.1", text: "Represent constraints by equations or inequalities, or systems thereof" },
                { id: "AA.PAR.6.4.2", text: "Interpret data points as solutions or non-solutions under established constraints" },
                { id: "AA.PAR.6.4.3", text: "Appropriate contexts: food and agriculture, engineering, manufacturing optimization" },
              ]
            },
          ]
        },
        {
          code: "AA.GSR.7",
          name: "Trigonometry and the Unit Circle",
          objectives: [
            {
              code: "AA.GSR.7.1",
              name: "Define the three basic trigonometric ratios using the unit circle.",
              subtopics: [
                { id: "AA.GSR.7.1.1", text: "Applicable to all four quadrants of the unit circle" },
                { id: "AA.GSR.7.1.2", text: "Connect parts of a right triangle in the first quadrant to unit circle" },
                { id: "AA.GSR.7.1.3", text: "Explore, interpret, and use radian measures converted from degree measures" },
                { id: "AA.GSR.7.1.4", text: "Limited to: 30°, 45°, 60° and their reflected angles within one revolution" },
              ]
            },
            {
              code: "AA.GSR.7.2",
              name: "Apply unit circle angle measures and coordinates to solve real-life problems.",
              subtopics: [
                { id: "AA.GSR.7.2.1", text: "Limited to special right triangle angles 30°, 45°, 60° and their reflected angles" },
                { id: "AA.GSR.7.2.2", text: "Find exact values from the unit circle to solve contextual problems" },
                { id: "AA.GSR.7.2.3", text: "Example contexts: Ferris wheel rider height, tide height modeled by cosine function" },
              ]
            },
          ]
        },
        {
          code: "AA.FGR.8",
          name: "Rational Functions",
          objectives: [
            {
              code: "AA.FGR.8.1",
              name: "Rewrite simple rational expressions in equivalent forms.",
              subtopics: [
                { id: "AA.FGR.8.1.1", text: "Explore culturally relevant situations represented with rational expressions" },
                { id: "AA.FGR.8.1.2", text: "Rewrite in various equivalent forms based on context" },
              ]
            },
            {
              code: "AA.FGR.8.2",
              name: "Add, subtract, multiply, and divide rational expressions; express in irreducible form.",
              subtopics: [
                { id: "AA.FGR.8.2.1", text: "Limit operations to real-life contexts: uniform motion, work, mixtures" },
                { id: "AA.FGR.8.2.2", text: "Limit division to factorable expressions with no remainder" },
              ]
            },
            {
              code: "AA.FGR.8.3",
              name: "Graph rational functions; identify key characteristics.",
              subtopics: [
                { id: "AA.FGR.8.3.1", text: "Use technology to generate graphs" },
                { id: "AA.FGR.8.3.2", text: "Identify: intercepts, zeros, domain, range, asymptotes, end behavior" },
              ]
            },
            {
              code: "AA.FGR.8.4",
              name: "Solve simple rational equations in one variable; identify extraneous solutions.",
              subtopics: [
                { id: "AA.FGR.8.4.1", text: "Limit to real-world contexts: uniform motion, work, mixtures" },
                { id: "AA.FGR.8.4.2", text: "Check for extraneous solutions" },
              ]
            },
          ]
        },
      ]
    }
  },

  south_carolina: {
    "precalculus": {
      standards: [
        {
          code: "PC.AAPR",
          name: "Arithmetic with Polynomials and Rational Expressions",
          objectives: [
            {
              code: "PC.AAPR.2",
              name: "Division and Remainder Theorem for Polynomials",
              subtopics: [
                { id: "PC.AAPR.2.1", text: "Apply the Division Theorem to divide polynomials" },
                { id: "PC.AAPR.2.2", text: "Apply the Remainder Theorem to evaluate polynomials" },
                { id: "PC.AAPR.2.3", text: "Use synthetic division" },
                { id: "PC.AAPR.2.4", text: "Determine whether a binomial is a factor of a polynomial" },
              ]
            },
            {
              code: "PC.AAPR.3",
              name: "Graphing Polynomials",
              subtopics: [
                { id: "PC.AAPR.3.1", text: "Identify zeros from factored form and graph them" },
                { id: "PC.AAPR.3.2", text: "Determine end behavior using leading term" },
                { id: "PC.AAPR.3.3", text: "Sketch graphs of polynomial functions" },
                { id: "PC.AAPR.3.4", text: "Identify multiplicity of zeros and effect on graph" },
              ]
            },
            {
              code: "PC.AAPR.4",
              name: "Writing Polynomial Functions from Graphs",
              subtopics: [
                { id: "PC.AAPR.4.1", text: "Identify zeros and multiplicity from a graph" },
                { id: "PC.AAPR.4.2", text: "Write a polynomial of least degree from given graph" },
                { id: "PC.AAPR.4.3", text: "Determine leading coefficient from graph behavior" },
              ]
            },
            {
              code: "PC.AAPR.5",
              name: "Polynomial Identities",
              subtopics: [
                { id: "PC.AAPR.5.1", text: "Prove polynomial identities algebraically" },
                { id: "PC.AAPR.5.2", text: "Use identities to describe numerical relationships" },
                { id: "PC.AAPR.5.3", text: "Apply sum/difference of cubes and other standard identities" },
              ]
            },
            {
              code: "PC.AAPR.6",
              name: "Binomial Theorem",
              subtopics: [
                { id: "PC.AAPR.6.1", text: "Expand powers of binomials using Binomial Theorem" },
                { id: "PC.AAPR.6.2", text: "Use Pascal's Triangle to find coefficients" },
                { id: "PC.AAPR.6.3", text: "Apply Binomial Theorem with one and two variables" },
                { id: "PC.AAPR.6.4", text: "Factor squares, cubes, and fourth powers of binomials" },
              ]
            },
            {
              code: "PC.AAPR.7",
              name: "Rational Expressions",
              subtopics: [
                { id: "PC.AAPR.7.1", text: "Simplify rational expressions by factoring" },
                { id: "PC.AAPR.7.2", text: "Perform long division of rational expressions" },
                { id: "PC.AAPR.7.3", text: "Add, subtract, multiply, and divide rational expressions" },
                { id: "PC.AAPR.7.4", text: "Identify domain restrictions of rational expressions" },
              ]
            },
          ]
        },
        {
          code: "PC.FBF",
          name: "Building Functions",
          objectives: [
            {
              code: "PC.FBF.1",
              name: "Composition of Functions",
              subtopics: [
                { id: "PC.FBF.1.1", text: "Compose two functions algebraically" },
                { id: "PC.FBF.1.2", text: "Evaluate composite functions at specific values" },
                { id: "PC.FBF.1.3", text: "Find the domain of a composite function" },
                { id: "PC.FBF.1.4", text: "Decompose a composite function into component functions" },
                { id: "PC.FBF.1.5", text: "Build models using function composition" },
              ]
            },
            {
              code: "PC.FBF.2",
              name: "Inverse Functions",
              subtopics: [
                { id: "PC.FBF.2.1", text: "Find the inverse of a function algebraically" },
                { id: "PC.FBF.2.2", text: "Restrict domain to make a function invertible" },
                { id: "PC.FBF.2.3", text: "Verify inverses using composition" },
                { id: "PC.FBF.2.4", text: "Graph inverse functions using symmetry about y = x" },
                { id: "PC.FBF.2.5", text: "Interpret inverse functions in context" },
              ]
            },
            {
              code: "PC.FBF.3",
              name: "Transformations of Functions",
              subtopics: [
                { id: "PC.FBF.3.1", text: "Apply vertical and horizontal shifts" },
                { id: "PC.FBF.3.2", text: "Apply vertical and horizontal stretches and compressions" },
                { id: "PC.FBF.3.3", text: "Apply reflections over x-axis and y-axis" },
                { id: "PC.FBF.3.4", text: "Identify even and odd functions from graphs and equations" },
                { id: "PC.FBF.3.5", text: "Combine multiple transformations" },
              ]
            },
          ]
        },
        {
          code: "PC.FIF",
          name: "Interpreting Functions",
          objectives: [
            {
              code: "PC.FIF.1",
              name: "Even, Odd, and Neither Functions",
              subtopics: [
                { id: "PC.FIF.1.1", text: "Use algebraic definition to classify even and odd functions" },
                { id: "PC.FIF.1.2", text: "Identify symmetry from graph (y-axis vs origin)" },
                { id: "PC.FIF.1.3", text: "Apply even/odd properties to simplify expressions" },
              ]
            },
            {
              code: "PC.FIF.2",
              name: "Analyzing Function Families",
              subtopics: [
                { id: "PC.FIF.2.1", text: "Analyze key features of exponential functions" },
                { id: "PC.FIF.2.2", text: "Analyze key features of logarithmic functions" },
                { id: "PC.FIF.2.3", text: "Analyze key features of polynomial functions" },
                { id: "PC.FIF.2.4", text: "Analyze key features of rational functions" },
                { id: "PC.FIF.2.5", text: "Analyze key features of trigonometric functions" },
                { id: "PC.FIF.2.6", text: "Solve real-world problems modeled by these functions" },
              ]
            },
            {
              code: "PC.FIF.4",
              name: "Zeros and X-Intercepts",
              subtopics: [
                { id: "PC.FIF.4.1", text: "Find real zeros of polynomial functions algebraically" },
                { id: "PC.FIF.4.2", text: "Find real zeros of exponential and logarithmic functions" },
                { id: "PC.FIF.4.3", text: "Find real zeros of trigonometric functions" },
                { id: "PC.FIF.4.4", text: "Relate zeros to x-intercepts on a graph" },
                { id: "PC.FIF.4.5", text: "Apply the Rational Root Theorem" },
              ]
            },
            {
              code: "PC.FIF.5",
              name: "Characteristics of Graphs",
              subtopics: [
                { id: "PC.FIF.5.1", text: "Identify domain and range from graph or equation" },
                { id: "PC.FIF.5.2", text: "Identify intervals of increase and decrease" },
                { id: "PC.FIF.5.3", text: "Identify relative maxima and minima" },
                { id: "PC.FIF.5.4", text: "Identify end behavior and asymptotes" },
                { id: "PC.FIF.5.5", text: "Identify intercepts and symmetry" },
              ]
            },
          ]
        },
        {
          code: "PC.FTF",
          name: "Trigonometric Functions",
          objectives: [
            {
              code: "PC.FTF.1",
              name: "Unit Circle and Radian Measure",
              subtopics: [
                { id: "PC.FTF.1.1", text: "Define radian measure and relate to degrees" },
                { id: "PC.FTF.1.2", text: "Convert between radians and degrees" },
                { id: "PC.FTF.1.3", text: "Identify coordinates on the unit circle for standard angles" },
                { id: "PC.FTF.1.4", text: "Use unit circle to define sine, cosine, and tangent" },
                { id: "PC.FTF.1.5", text: "Apply co-function relationships" },
              ]
            },
            {
              code: "PC.FTF.2",
              name: "The Six Trigonometric Functions",
              subtopics: [
                { id: "PC.FTF.2.1", text: "Define all six trig functions using unit circle" },
                { id: "PC.FTF.2.2", text: "Evaluate trig functions at standard angles exactly" },
                { id: "PC.FTF.2.3", text: "Use reference angles to evaluate trig functions in all quadrants" },
                { id: "PC.FTF.2.4", text: "Apply reciprocal identities (csc, sec, cot)" },
                { id: "PC.FTF.2.5", text: "Determine sign of trig functions by quadrant" },
              ]
            },
            {
              code: "PC.FTF.3",
              name: "Graphs of Trigonometric Functions",
              subtopics: [
                { id: "PC.FTF.3.1", text: "Graph sine and cosine functions and identify amplitude, period, phase shift, midline" },
                { id: "PC.FTF.3.2", text: "Graph tangent, cotangent, secant, and cosecant functions" },
                { id: "PC.FTF.3.3", text: "Identify asymptotes of trig graphs" },
                { id: "PC.FTF.3.4", text: "Apply transformations to trig graphs" },
                { id: "PC.FTF.3.5", text: "Write equations from graphs of trig functions" },
              ]
            },
            {
              code: "PC.FTF.4",
              name: "Inverse Trigonometric Functions",
              subtopics: [
                { id: "PC.FTF.4.1", text: "Restrict domain of trig functions to define inverses" },
                { id: "PC.FTF.4.2", text: "Evaluate inverse trig expressions exactly" },
                { id: "PC.FTF.4.3", text: "Evaluate compositions of trig and inverse trig functions" },
                { id: "PC.FTF.4.4", text: "Solve equations using inverse trig functions" },
                { id: "PC.FTF.4.5", text: "Interpret inverse trig values in context" },
              ]
            },
          ]
        },
        {
          code: "PC.GCI",
          name: "Trigonometric Identities and Equations",
          objectives: [
            {
              code: "PC.GCI.1",
              name: "Fundamental Trigonometric Identities",
              subtopics: [
                { id: "PC.GCI.1.1", text: "Apply Pythagorean identities" },
                { id: "PC.GCI.1.2", text: "Apply reciprocal and quotient identities" },
                { id: "PC.GCI.1.3", text: "Apply co-function and even/odd identities" },
                { id: "PC.GCI.1.4", text: "Simplify trigonometric expressions using identities" },
                { id: "PC.GCI.1.5", text: "Verify trigonometric identities" },
              ]
            },
            {
              code: "PC.GCI.2",
              name: "Sum, Difference, and Double-Angle Identities",
              subtopics: [
                { id: "PC.GCI.2.1", text: "Apply sum and difference formulas for sine, cosine, tangent" },
                { id: "PC.GCI.2.2", text: "Apply double-angle formulas" },
                { id: "PC.GCI.2.3", text: "Apply half-angle formulas" },
                { id: "PC.GCI.2.4", text: "Use identities to find exact values" },
                { id: "PC.GCI.2.5", text: "Prove identities using sum/difference formulas" },
              ]
            },
            {
              code: "PC.GCI.3",
              name: "Solving Trigonometric Equations",
              subtopics: [
                { id: "PC.GCI.3.1", text: "Solve linear trig equations on a given interval" },
                { id: "PC.GCI.3.2", text: "Solve quadratic trig equations by factoring or substitution" },
                { id: "PC.GCI.3.3", text: "Find general solutions using periodicity" },
                { id: "PC.GCI.3.4", text: "Apply identities to simplify before solving" },
              ]
            },
          ]
        },
        {
          code: "PC.GAT",
          name: "Applications of Trigonometry",
          objectives: [
            {
              code: "PC.GAT.1",
              name: "Law of Sines and Law of Cosines",
              subtopics: [
                { id: "PC.GAT.1.1", text: "Apply Law of Sines to solve triangles (AAS, ASA, SSA)" },
                { id: "PC.GAT.1.2", text: "Identify the ambiguous case (SSA)" },
                { id: "PC.GAT.1.3", text: "Apply Law of Cosines to solve triangles (SAS, SSS)" },
                { id: "PC.GAT.1.4", text: "Find area of a triangle using (1/2)ab sin C" },
                { id: "PC.GAT.1.5", text: "Choose the appropriate law for a given triangle" },
              ]
            },
            {
              code: "PC.GAT.2",
              name: "Arc Length and Sector Area",
              subtopics: [
                { id: "PC.GAT.2.1", text: "Derive and apply arc length formula" },
                { id: "PC.GAT.2.2", text: "Derive and apply sector area formula" },
                { id: "PC.GAT.2.3", text: "Solve problems involving angular and linear speed" },
              ]
            },
            {
              code: "PC.GAT.3",
              name: "Vectors",
              subtopics: [
                { id: "PC.GAT.3.1", text: "Represent vectors in component form and magnitude-direction form" },
                { id: "PC.GAT.3.2", text: "Add and subtract vectors graphically and algebraically" },
                { id: "PC.GAT.3.3", text: "Find magnitude and direction of a vector" },
                { id: "PC.GAT.3.4", text: "Apply vectors to real-world problems (force, velocity)" },
                { id: "PC.GAT.3.5", text: "Find dot product and use to find angle between vectors" },
              ]
            },
          ]
        },
        {
          code: "PC.GPC",
          name: "Polar Coordinates and Parametric Equations",
          objectives: [
            {
              code: "PC.GPC.1",
              name: "Polar Coordinates",
              subtopics: [
                { id: "PC.GPC.1.1", text: "Plot points in polar coordinates" },
                { id: "PC.GPC.1.2", text: "Convert between polar and rectangular coordinates" },
                { id: "PC.GPC.1.3", text: "Graph polar equations (circles, limaçons, rose curves)" },
                { id: "PC.GPC.1.4", text: "Find multiple polar representations of a point" },
              ]
            },
            {
              code: "PC.GPC.2",
              name: "Parametric Equations",
              subtopics: [
                { id: "PC.GPC.2.1", text: "Graph parametric equations and indicate direction" },
                { id: "PC.GPC.2.2", text: "Convert parametric equations to rectangular form by eliminating parameter" },
                { id: "PC.GPC.2.3", text: "Write parametric equations for a given curve" },
                { id: "PC.GPC.2.4", text: "Model motion using parametric equations" },
              ]
            },
          ]
        },
        {
          code: "PC.ACIS",
          name: "Conic Sections",
          objectives: [
            {
              code: "PC.ACIS.1",
              name: "Parabolas and Circles",
              subtopics: [
                { id: "PC.ACIS.1.1", text: "Write and graph equations of circles in standard form" },
                { id: "PC.ACIS.1.2", text: "Complete the square to rewrite conic equations" },
                { id: "PC.ACIS.1.3", text: "Write and graph parabolas with vertex not at origin" },
                { id: "PC.ACIS.1.4", text: "Identify vertex, focus, directrix of a parabola" },
              ]
            },
            {
              code: "PC.ACIS.2",
              name: "Ellipses",
              subtopics: [
                { id: "PC.ACIS.2.1", text: "Write equations of ellipses in standard form" },
                { id: "PC.ACIS.2.2", text: "Identify center, vertices, co-vertices, foci" },
                { id: "PC.ACIS.2.3", text: "Graph ellipses from equations" },
                { id: "PC.ACIS.2.4", text: "Write equations from key features" },
              ]
            },
            {
              code: "PC.ACIS.3",
              name: "Hyperbolas",
              subtopics: [
                { id: "PC.ACIS.3.1", text: "Write equations of hyperbolas in standard form" },
                { id: "PC.ACIS.3.2", text: "Identify center, vertices, foci, asymptotes" },
                { id: "PC.ACIS.3.3", text: "Graph hyperbolas from equations" },
                { id: "PC.ACIS.3.4", text: "Distinguish horizontal vs vertical transverse axis" },
              ]
            },
            {
              code: "PC.ACIS.4",
              name: "Identifying Conics and Applications",
              subtopics: [
                { id: "PC.ACIS.4.1", text: "Identify conic type from general second-degree equation" },
                { id: "PC.ACIS.4.2", text: "Complete the square to convert to standard form" },
                { id: "PC.ACIS.4.3", text: "Apply conic sections to real-world modeling problems" },
              ]
            },
          ]
        },
        {
          code: "PC.NVM",
          name: "Matrices",
          objectives: [
            {
              code: "PC.NVM.1",
              name: "Matrix Operations",
              subtopics: [
                { id: "PC.NVM.1.1", text: "Add and subtract matrices" },
                { id: "PC.NVM.1.2", text: "Multiply matrices by scalars" },
                { id: "PC.NVM.1.3", text: "Multiply two matrices and understand when multiplication is defined" },
                { id: "PC.NVM.1.4", text: "Understand non-commutativity of matrix multiplication" },
                { id: "PC.NVM.1.5", text: "Apply associative and distributive properties to matrices" },
              ]
            },
            {
              code: "PC.NVM.2",
              name: "Determinants and Inverses",
              subtopics: [
                { id: "PC.NVM.2.1", text: "Calculate determinants of 2×2 and 3×3 matrices" },
                { id: "PC.NVM.2.2", text: "Find the inverse of a 2×2 matrix" },
                { id: "PC.NVM.2.3", text: "Understand that a matrix is invertible iff its determinant is nonzero" },
                { id: "PC.NVM.2.4", text: "Use inverse matrices to solve systems of equations" },
              ]
            },
            {
              code: "PC.NVM.3",
              name: "Matrices as Transformations",
              subtopics: [
                { id: "PC.NVM.3.1", text: "Multiply a vector by a matrix to produce a transformation" },
                { id: "PC.NVM.3.2", text: "Interpret 2×2 matrices as transformations of the plane" },
                { id: "PC.NVM.3.3", text: "Relate absolute value of determinant to area scaling" },
              ]
            },
          ]
        },
        {
          code: "PC.FLQE",
          name: "Exponential and Logarithmic Functions",
          objectives: [
            {
              code: "PC.FLQE.1",
              name: "Properties and Graphs of Exponential and Logarithmic Functions",
              subtopics: [
                { id: "PC.FLQE.1.1", text: "Graph exponential growth and decay functions" },
                { id: "PC.FLQE.1.2", text: "Graph logarithmic functions and identify key features" },
                { id: "PC.FLQE.1.3", text: "Apply transformations to exponential and log graphs" },
                { id: "PC.FLQE.1.4", text: "Identify domain, range, asymptotes, intercepts" },
                { id: "PC.FLQE.1.5", text: "Relate exponential and logarithmic forms" },
              ]
            },
            {
              code: "PC.FLQE.2",
              name: "Solving Exponential and Logarithmic Equations",
              subtopics: [
                { id: "PC.FLQE.2.1", text: "Apply properties of logarithms to expand and condense expressions" },
                { id: "PC.FLQE.2.2", text: "Change of base formula" },
                { id: "PC.FLQE.2.3", text: "Solve exponential equations using logarithms" },
                { id: "PC.FLQE.2.4", text: "Solve logarithmic equations" },
                { id: "PC.FLQE.2.5", text: "Apply to growth, decay, and compound interest problems" },
              ]
            },
          ]
        },
        {
          code: "PC.SSEI",
          name: "Sequences, Series, and the Binomial Theorem",
          objectives: [
            {
              code: "PC.SSEI.1",
              name: "Arithmetic and Geometric Sequences",
              subtopics: [
                { id: "PC.SSEI.1.1", text: "Identify arithmetic sequences and find common difference" },
                { id: "PC.SSEI.1.2", text: "Identify geometric sequences and find common ratio" },
                { id: "PC.SSEI.1.3", text: "Write explicit and recursive formulas for sequences" },
                { id: "PC.SSEI.1.4", text: "Find nth term of arithmetic and geometric sequences" },
              ]
            },
            {
              code: "PC.SSEI.2",
              name: "Series and Summation",
              subtopics: [
                { id: "PC.SSEI.2.1", text: "Find partial sums of arithmetic series" },
                { id: "PC.SSEI.2.2", text: "Find partial sums of geometric series" },
                { id: "PC.SSEI.2.3", text: "Determine convergence of infinite geometric series" },
                { id: "PC.SSEI.2.4", text: "Find sum of convergent infinite geometric series" },
                { id: "PC.SSEI.2.5", text: "Use sigma notation" },
              ]
            },
          ]
        },
        {
          code: "PC.SMD",
          name: "Statistics and Modeling with Data",
          objectives: [
            {
              code: "PC.SMD.1",
              name: "Regression and Modeling",
              subtopics: [
                { id: "PC.SMD.1.1", text: "Determine appropriate regression model for bivariate data" },
                { id: "PC.SMD.1.2", text: "Calculate and interpret regression equations" },
                { id: "PC.SMD.1.3", text: "Use regression to make predictions" },
                { id: "PC.SMD.1.4", text: "Evaluate goodness of fit using correlation coefficient" },
              ]
            },
          ]
        },
      ]
    }
  },

  // ─────────────────────────────────────────────
  //  Edexcel AS & A Level Mathematics (9MA0)
  //  Year 1: Pure 1+2, Statistics 1, Mechanics 1
  //  Year 2: Pure 3+4, Statistics 2, Mechanics 2
  //  Subject key: "as level" matches "AS level Math/Stat/Mech"
  // ─────────────────────────────────────────────
  "edexcel": {
    "as level": {
      standards: [

        // ══ PURE 1 ══════════════════════════════════════════════════════
        {
          code: "9MA0.P1.1",
          name: "Algebra and Functions — Pure 1",
          objectives: [
            {
              code: "9MA0.P1.1.1",
              name: "Index Laws and Surds",
              subtopics: [
                { id: "9MA0.P1.1.1.1", text: "Apply laws of indices: aᵐ × aⁿ = aᵐ⁺ⁿ, aᵐ ÷ aⁿ = aᵐ⁻ⁿ, (aᵐ)ⁿ = aᵐⁿ" },
                { id: "9MA0.P1.1.1.2", text: "Evaluate expressions with negative and fractional indices" },
                { id: "9MA0.P1.1.1.3", text: "Simplify surds and rationalise denominators of the form a+b√c" },
                { id: "9MA0.P1.1.1.4", text: "Manipulate expressions involving surds algebraically" },
              ]
            },
            {
              code: "9MA0.P1.1.2",
              name: "Quadratics",
              subtopics: [
                { id: "9MA0.P1.1.2.1", text: "Factorise and solve quadratic equations" },
                { id: "9MA0.P1.1.2.2", text: "Complete the square: write ax²+bx+c in form a(x+p)²+q" },
                { id: "9MA0.P1.1.2.3", text: "Use the quadratic formula and discriminant to analyse roots" },
                { id: "9MA0.P1.1.2.4", text: "Solve quadratic inequalities and represent solutions using set notation" },
                { id: "9MA0.P1.1.2.5", text: "Solve simultaneous equations with one linear and one quadratic" },
                { id: "9MA0.P1.1.2.6", text: "Use discriminant to determine intersection of line and curve" },
              ]
            },
            {
              code: "9MA0.P1.1.3",
              name: "Equations and Inequalities",
              subtopics: [
                { id: "9MA0.P1.1.3.1", text: "Solve linear and quadratic inequalities" },
                { id: "9MA0.P1.1.3.2", text: "Represent solutions on a number line and using interval notation" },
                { id: "9MA0.P1.1.3.3", text: "Solve equations involving algebraic fractions" },
                { id: "9MA0.P1.1.3.4", text: "Solve disguised quadratics (e.g. x⁴ − 5x² + 4 = 0)" },
              ]
            },
            {
              code: "9MA0.P1.1.4",
              name: "Graphs and Transformations",
              subtopics: [
                { id: "9MA0.P1.1.4.1", text: "Sketch graphs of y = xⁿ for positive and negative integer n" },
                { id: "9MA0.P1.1.4.2", text: "Apply translations: y = f(x) + a and y = f(x + a)" },
                { id: "9MA0.P1.1.4.3", text: "Apply stretches: y = af(x) and y = f(ax)" },
                { id: "9MA0.P1.1.4.4", text: "Apply reflections: y = −f(x) and y = f(−x)" },
                { id: "9MA0.P1.1.4.5", text: "Combine transformations and describe them geometrically" },
                { id: "9MA0.P1.1.4.6", text: "Sketch and use graphs of y = |f(x)|" },
              ]
            },
            {
              code: "9MA0.P1.1.5",
              name: "Algebraic Division and Factor Theorem",
              subtopics: [
                { id: "9MA0.P1.1.5.1", text: "Divide a polynomial by a linear factor using long division or inspection" },
                { id: "9MA0.P1.1.5.2", text: "Apply the Factor Theorem: f(a) = 0 ⟺ (x−a) is a factor" },
                { id: "9MA0.P1.1.5.3", text: "Apply the Remainder Theorem: remainder when f(x) ÷ (x−a) is f(a)" },
                { id: "9MA0.P1.1.5.4", text: "Fully factorise cubic and higher degree polynomials" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P1.2",
          name: "Coordinate Geometry — Pure 1",
          objectives: [
            {
              code: "9MA0.P1.2.1",
              name: "Straight Lines",
              subtopics: [
                { id: "9MA0.P1.2.1.1", text: "Find gradient of a line from two points" },
                { id: "9MA0.P1.2.1.2", text: "Write equation of a line: y−y₁ = m(x−x₁) and y = mx+c" },
                { id: "9MA0.P1.2.1.3", text: "Find midpoint and length of a line segment" },
                { id: "9MA0.P1.2.1.4", text: "Apply conditions for parallel lines (equal gradients) and perpendicular lines (m₁m₂ = −1)" },
                { id: "9MA0.P1.2.1.5", text: "Find the perpendicular bisector of a line segment" },
              ]
            },
            {
              code: "9MA0.P1.2.2",
              name: "Circles",
              subtopics: [
                { id: "9MA0.P1.2.2.1", text: "Write equation of circle: (x−a)²+(y−b)²=r²" },
                { id: "9MA0.P1.2.2.2", text: "Complete the square to find centre and radius from general form" },
                { id: "9MA0.P1.2.2.3", text: "Find equation of tangent to a circle at a given point" },
                { id: "9MA0.P1.2.2.4", text: "Apply the theorem: tangent is perpendicular to radius at point of contact" },
                { id: "9MA0.P1.2.2.5", text: "Apply the theorem: angle in a semicircle is 90°" },
                { id: "9MA0.P1.2.2.6", text: "Determine whether a line and circle intersect, are tangent, or don't meet" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P1.3",
          name: "Sequences and Series — Pure 1",
          objectives: [
            {
              code: "9MA0.P1.3.1",
              name: "Binomial Expansion",
              subtopics: [
                { id: "9MA0.P1.3.1.1", text: "Expand (a+b)ⁿ for positive integer n using binomial coefficients" },
                { id: "9MA0.P1.3.1.2", text: "Use nCr notation and Pascal's triangle" },
                { id: "9MA0.P1.3.1.3", text: "Find a specific term in a binomial expansion" },
                { id: "9MA0.P1.3.1.4", text: "Apply binomial expansion to approximate values" },
              ]
            },
            {
              code: "9MA0.P1.3.2",
              name: "Arithmetic Sequences and Series",
              subtopics: [
                { id: "9MA0.P1.3.2.1", text: "Identify first term a and common difference d" },
                { id: "9MA0.P1.3.2.2", text: "Find nth term: uₙ = a + (n−1)d" },
                { id: "9MA0.P1.3.2.3", text: "Find sum of n terms: Sₙ = n/2(2a + (n−1)d)" },
                { id: "9MA0.P1.3.2.4", text: "Solve problems finding n, a, or d given conditions on terms or sums" },
                { id: "9MA0.P1.3.2.5", text: "Recognise and work with arithmetic series in context" },
              ]
            },
            {
              code: "9MA0.P1.3.3",
              name: "Geometric Sequences and Series",
              subtopics: [
                { id: "9MA0.P1.3.3.1", text: "Identify first term a and common ratio r" },
                { id: "9MA0.P1.3.3.2", text: "Find nth term: uₙ = arⁿ⁻¹" },
                { id: "9MA0.P1.3.3.3", text: "Find sum of n terms: Sₙ = a(1−rⁿ)/(1−r)" },
                { id: "9MA0.P1.3.3.4", text: "Find sum to infinity when |r| < 1: S∞ = a/(1−r)" },
                { id: "9MA0.P1.3.3.5", text: "Solve problems involving geometric series in financial and other contexts" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P1.4",
          name: "Trigonometry — Pure 1",
          objectives: [
            {
              code: "9MA0.P1.4.1",
              name: "Sine and Cosine Rules",
              subtopics: [
                { id: "9MA0.P1.4.1.1", text: "Apply the sine rule: a/sinA = b/sinB = c/sinC" },
                { id: "9MA0.P1.4.1.2", text: "Apply the cosine rule: a² = b²+c²−2bc cosA" },
                { id: "9MA0.P1.4.1.3", text: "Find area of triangle: Area = ½ab sinC" },
                { id: "9MA0.P1.4.1.4", text: "Identify the ambiguous case of the sine rule" },
                { id: "9MA0.P1.4.1.5", text: "Solve 2D and 3D problems using sine and cosine rules" },
              ]
            },
            {
              code: "9MA0.P1.4.2",
              name: "Radians and Circular Measure",
              subtopics: [
                { id: "9MA0.P1.4.2.1", text: "Convert between radians and degrees" },
                { id: "9MA0.P1.4.2.2", text: "Know exact trig values at key angles in radians" },
                { id: "9MA0.P1.4.2.3", text: "Use arc length formula: s = rθ" },
                { id: "9MA0.P1.4.2.4", text: "Use sector area formula: A = ½r²θ" },
                { id: "9MA0.P1.4.2.5", text: "Find area and perimeter of segments" },
              ]
            },
            {
              code: "9MA0.P1.4.3",
              name: "Trigonometric Graphs and Equations",
              subtopics: [
                { id: "9MA0.P1.4.3.1", text: "Sketch graphs of sin x, cos x, tan x and their transformations" },
                { id: "9MA0.P1.4.3.2", text: "Use symmetry and periodicity to find all solutions in a given interval" },
                { id: "9MA0.P1.4.3.3", text: "Solve equations of the form sin(nθ+α) = k, cos(nθ+α) = k, tan(nθ+α) = k" },
                { id: "9MA0.P1.4.3.4", text: "Use the identities sin²x + cos²x ≡ 1 and tan x ≡ sin x/cos x" },
                { id: "9MA0.P1.4.3.5", text: "Solve equations requiring use of trig identities" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P1.5",
          name: "Exponentials and Logarithms — Pure 1",
          objectives: [
            {
              code: "9MA0.P1.5.1",
              name: "Exponential Functions and Graphs",
              subtopics: [
                { id: "9MA0.P1.5.1.1", text: "Sketch and interpret graphs of y = aˣ and y = eˣ" },
                { id: "9MA0.P1.5.1.2", text: "Understand the gradient property of y = eˣ" },
                { id: "9MA0.P1.5.1.3", text: "Apply exponential growth and decay models" },
              ]
            },
            {
              code: "9MA0.P1.5.2",
              name: "Logarithms",
              subtopics: [
                { id: "9MA0.P1.5.2.1", text: "Understand the definition: y = logₐx ⟺ x = aʸ" },
                { id: "9MA0.P1.5.2.2", text: "Apply laws of logarithms: log(AB), log(A/B), log(Aⁿ)" },
                { id: "9MA0.P1.5.2.3", text: "Solve equations of the form aˣ = b using logarithms" },
                { id: "9MA0.P1.5.2.4", text: "Use natural logarithm ln and its relationship with eˣ" },
                { id: "9MA0.P1.5.2.5", text: "Change of base formula" },
              ]
            },
            {
              code: "9MA0.P1.5.3",
              name: "Logarithmic Graphs for Non-Linear Data",
              subtopics: [
                { id: "9MA0.P1.5.3.1", text: "Linearise data of the form y = axⁿ using log y vs log x" },
                { id: "9MA0.P1.5.3.2", text: "Linearise data of the form y = abˣ using log y vs x" },
                { id: "9MA0.P1.5.3.3", text: "Find constants a and n (or b) from gradient and intercept of linearised graph" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P1.6",
          name: "Differentiation — Pure 1",
          objectives: [
            {
              code: "9MA0.P1.6.1",
              name: "Differentiation from First Principles",
              subtopics: [
                { id: "9MA0.P1.6.1.1", text: "Understand the derivative as the limit of a gradient function" },
                { id: "9MA0.P1.6.1.2", text: "Differentiate xⁿ from first principles for small n" },
              ]
            },
            {
              code: "9MA0.P1.6.2",
              name: "Differentiating Polynomials and Power Functions",
              subtopics: [
                { id: "9MA0.P1.6.2.1", text: "Differentiate xⁿ for any rational n" },
                { id: "9MA0.P1.6.2.2", text: "Differentiate sums, differences, and scalar multiples" },
                { id: "9MA0.P1.6.2.3", text: "Find second derivative and interpret it" },
                { id: "9MA0.P1.6.2.4", text: "Differentiate expressions requiring algebraic manipulation first" },
              ]
            },
            {
              code: "9MA0.P1.6.3",
              name: "Tangents and Normals",
              subtopics: [
                { id: "9MA0.P1.6.3.1", text: "Find the gradient of a curve at a point using differentiation" },
                { id: "9MA0.P1.6.3.2", text: "Find equations of tangents and normals to curves" },
                { id: "9MA0.P1.6.3.3", text: "Find points on a curve with a given gradient" },
              ]
            },
            {
              code: "9MA0.P1.6.4",
              name: "Stationary Points and Curve Sketching",
              subtopics: [
                { id: "9MA0.P1.6.4.1", text: "Find stationary points by setting f′(x) = 0" },
                { id: "9MA0.P1.6.4.2", text: "Classify stationary points using second derivative test" },
                { id: "9MA0.P1.6.4.3", text: "Determine intervals where function is increasing or decreasing" },
                { id: "9MA0.P1.6.4.4", text: "Sketch curves using roots, stationary points, and behaviour at ±∞" },
              ]
            },
            {
              code: "9MA0.P1.6.5",
              name: "Optimisation",
              subtopics: [
                { id: "9MA0.P1.6.5.1", text: "Set up and solve optimisation problems using differentiation" },
                { id: "9MA0.P1.6.5.2", text: "Form an expression for the quantity to be optimised" },
                { id: "9MA0.P1.6.5.3", text: "Use a constraint to reduce to single variable" },
                { id: "9MA0.P1.6.5.4", text: "Verify nature of optimal point using second derivative" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P1.7",
          name: "Integration — Pure 1",
          objectives: [
            {
              code: "9MA0.P1.7.1",
              name: "Indefinite Integration",
              subtopics: [
                { id: "9MA0.P1.7.1.1", text: "Integrate xⁿ for any rational n ≠ −1" },
                { id: "9MA0.P1.7.1.2", text: "Integrate sums and scalar multiples" },
                { id: "9MA0.P1.7.1.3", text: "Find the constant of integration using a given point" },
                { id: "9MA0.P1.7.1.4", text: "Integrate expressions requiring algebraic manipulation first" },
              ]
            },
            {
              code: "9MA0.P1.7.2",
              name: "Definite Integration and Area",
              subtopics: [
                { id: "9MA0.P1.7.2.1", text: "Evaluate definite integrals using limits" },
                { id: "9MA0.P1.7.2.2", text: "Find area under a curve between two x-values" },
                { id: "9MA0.P1.7.2.3", text: "Find area between a curve and a line" },
                { id: "9MA0.P1.7.2.4", text: "Recognise when area is below x-axis and handle sign correctly" },
              ]
            },
            {
              code: "9MA0.P1.7.3",
              name: "Trapezium Rule",
              subtopics: [
                { id: "9MA0.P1.7.3.1", text: "Apply the trapezium rule to estimate area under a curve" },
                { id: "9MA0.P1.7.3.2", text: "Determine whether estimate is an overestimate or underestimate" },
                { id: "9MA0.P1.7.3.3", text: "Increase accuracy by increasing number of strips" },
              ]
            },
          ]
        },

        // ══ PURE 2 ══════════════════════════════════════════════════════
        {
          code: "9MA0.P2.1",
          name: "Algebra and Functions — Pure 2",
          objectives: [
            {
              code: "9MA0.P2.1.1",
              name: "Partial Fractions",
              subtopics: [
                { id: "9MA0.P2.1.1.1", text: "Decompose rational expressions with distinct linear factors" },
                { id: "9MA0.P2.1.1.2", text: "Decompose with repeated linear factors" },
                { id: "9MA0.P2.1.1.3", text: "Decompose improper fractions (degree of numerator ≥ denominator) by division first" },
              ]
            },
            {
              code: "9MA0.P2.1.2",
              name: "Modulus Function and Equations",
              subtopics: [
                { id: "9MA0.P2.1.2.1", text: "Sketch graphs of y = |f(x)| and y = f(|x|)" },
                { id: "9MA0.P2.1.2.2", text: "Solve equations and inequalities involving modulus" },
                { id: "9MA0.P2.1.2.3", text: "Understand |a − b| as the distance between a and b" },
              ]
            },
            {
              code: "9MA0.P2.1.3",
              name: "Functions: Inverse and Composite",
              subtopics: [
                { id: "9MA0.P2.1.3.1", text: "Find and prove a function is one-to-one" },
                { id: "9MA0.P2.1.3.2", text: "Restrict domain to make a function invertible" },
                { id: "9MA0.P2.1.3.3", text: "Form and evaluate composite functions" },
                { id: "9MA0.P2.1.3.4", text: "Solve equations involving composite and inverse functions" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P2.2",
          name: "Trigonometry — Pure 2",
          objectives: [
            {
              code: "9MA0.P2.2.1",
              name: "Reciprocal Trig Functions",
              subtopics: [
                { id: "9MA0.P2.2.1.1", text: "Define and use sec x = 1/cos x, cosec x = 1/sin x, cot x = 1/tan x" },
                { id: "9MA0.P2.2.1.2", text: "Sketch graphs of sec x, cosec x, cot x" },
                { id: "9MA0.P2.2.1.3", text: "Prove and use identities: 1 + tan²x ≡ sec²x and 1 + cot²x ≡ cosec²x" },
              ]
            },
            {
              code: "9MA0.P2.2.2",
              name: "Inverse Trig Functions",
              subtopics: [
                { id: "9MA0.P2.2.2.1", text: "Define arcsin, arccos, arctan with their restricted domains and ranges" },
                { id: "9MA0.P2.2.2.2", text: "Sketch graphs of arcsin, arccos, arctan" },
                { id: "9MA0.P2.2.2.3", text: "Evaluate exact values of inverse trig functions" },
              ]
            },
            {
              code: "9MA0.P2.2.3",
              name: "Addition and Double Angle Formulae",
              subtopics: [
                { id: "9MA0.P2.2.3.1", text: "Use addition formulae: sin(A±B), cos(A±B), tan(A±B)" },
                { id: "9MA0.P2.2.3.2", text: "Derive and use double angle formulae: sin 2A, cos 2A, tan 2A" },
                { id: "9MA0.P2.2.3.3", text: "Use half-angle substitutions" },
                { id: "9MA0.P2.2.3.4", text: "Prove trigonometric identities using these formulae" },
                { id: "9MA0.P2.2.3.5", text: "Solve equations using addition and double angle formulae" },
              ]
            },
            {
              code: "9MA0.P2.2.4",
              name: "R sin(x+α) Form",
              subtopics: [
                { id: "9MA0.P2.2.4.1", text: "Express a sin x + b cos x in the form R sin(x+α) or R cos(x+α)" },
                { id: "9MA0.P2.2.4.2", text: "Find maximum and minimum values of combined trig expressions" },
                { id: "9MA0.P2.2.4.3", text: "Solve equations of the form a sin x + b cos x = c" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P2.3",
          name: "Exponentials and Logarithms — Pure 2",
          objectives: [
            {
              code: "9MA0.P2.3.1",
              name: "Further Logarithmic Equations",
              subtopics: [
                { id: "9MA0.P2.3.1.1", text: "Solve equations using logarithms including natural log" },
                { id: "9MA0.P2.3.1.2", text: "Solve simultaneous equations involving exponentials or logs" },
                { id: "9MA0.P2.3.1.3", text: "Model exponential growth/decay: N = Aeᵏᵗ and find A, k from data" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P2.4",
          name: "Differentiation — Pure 2",
          objectives: [
            {
              code: "9MA0.P2.4.1",
              name: "Differentiating Standard Functions",
              subtopics: [
                { id: "9MA0.P2.4.1.1", text: "Differentiate eˣ, ln x, sin x, cos x, tan x" },
                { id: "9MA0.P2.4.1.2", text: "Differentiate aˣ using aˣ = eˣ ln a" },
              ]
            },
            {
              code: "9MA0.P2.4.2",
              name: "Chain Rule",
              subtopics: [
                { id: "9MA0.P2.4.2.1", text: "Apply the chain rule: dy/dx = dy/du × du/dx" },
                { id: "9MA0.P2.4.2.2", text: "Differentiate composite functions including trig, exponential, and log" },
                { id: "9MA0.P2.4.2.3", text: "Find gradient of parametric curves using chain rule" },
              ]
            },
            {
              code: "9MA0.P2.4.3",
              name: "Product and Quotient Rules",
              subtopics: [
                { id: "9MA0.P2.4.3.1", text: "Apply product rule: d/dx[uv] = u dv/dx + v du/dx" },
                { id: "9MA0.P2.4.3.2", text: "Apply quotient rule: d/dx[u/v] = (v du/dx − u dv/dx)/v²" },
                { id: "9MA0.P2.4.3.3", text: "Combine chain, product, and quotient rules" },
              ]
            },
            {
              code: "9MA0.P2.4.4",
              name: "Implicit Differentiation",
              subtopics: [
                { id: "9MA0.P2.4.4.1", text: "Differentiate equations of the form f(x,y) = 0 implicitly" },
                { id: "9MA0.P2.4.4.2", text: "Find dy/dx in terms of x and y" },
                { id: "9MA0.P2.4.4.3", text: "Find equations of tangents and normals to implicit curves" },
                { id: "9MA0.P2.4.4.4", text: "Find stationary points of implicit curves" },
              ]
            },
            {
              code: "9MA0.P2.4.5",
              name: "Parametric Differentiation",
              subtopics: [
                { id: "9MA0.P2.4.5.1", text: "Find dy/dx for parametric equations using dy/dx = (dy/dt)/(dx/dt)" },
                { id: "9MA0.P2.4.5.2", text: "Find second derivative d²y/dx² parametrically" },
                { id: "9MA0.P2.4.5.3", text: "Find tangents and normals to parametric curves" },
                { id: "9MA0.P2.4.5.4", text: "Convert between parametric and Cartesian form" },
              ]
            },
            {
              code: "9MA0.P2.4.6",
              name: "Rates of Change",
              subtopics: [
                { id: "9MA0.P2.4.6.1", text: "Connect rates using the chain rule: dV/dt = dV/dr × dr/dt" },
                { id: "9MA0.P2.4.6.2", text: "Set up and solve related rates of change problems" },
                { id: "9MA0.P2.4.6.3", text: "Interpret sign of derivative in context of increasing/decreasing quantities" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P2.5",
          name: "Integration — Pure 2",
          objectives: [
            {
              code: "9MA0.P2.5.1",
              name: "Integrating Standard Functions",
              subtopics: [
                { id: "9MA0.P2.5.1.1", text: "Integrate eˣ, 1/x, sin x, cos x, sec²x" },
                { id: "9MA0.P2.5.1.2", text: "Integrate aˣ" },
                { id: "9MA0.P2.5.1.3", text: "Integrate expressions of the form f(ax+b)" },
              ]
            },
            {
              code: "9MA0.P2.5.2",
              name: "Integration by Substitution",
              subtopics: [
                { id: "9MA0.P2.5.2.1", text: "Use substitution to simplify and integrate composite functions" },
                { id: "9MA0.P2.5.2.2", text: "Handle limits in definite integration by substitution" },
                { id: "9MA0.P2.5.2.3", text: "Recognise reverse chain rule pattern" },
              ]
            },
            {
              code: "9MA0.P2.5.3",
              name: "Integration by Parts",
              subtopics: [
                { id: "9MA0.P2.5.3.1", text: "Apply integration by parts: ∫u dv/dx dx = uv − ∫v du/dx dx" },
                { id: "9MA0.P2.5.3.2", text: "Apply integration by parts twice when necessary" },
                { id: "9MA0.P2.5.3.3", text: "Choose u and dv/dx strategically (LIATE guidance)" },
              ]
            },
            {
              code: "9MA0.P2.5.4",
              name: "Integration using Partial Fractions",
              subtopics: [
                { id: "9MA0.P2.5.4.1", text: "Integrate rational functions using partial fraction decomposition" },
                { id: "9MA0.P2.5.4.2", text: "Integrate to obtain ln terms from partial fractions" },
              ]
            },
            {
              code: "9MA0.P2.5.5",
              name: "Integration with Parametric and Implicit Equations",
              subtopics: [
                { id: "9MA0.P2.5.5.1", text: "Find area under parametric curve: ∫y dx/dt dt" },
                { id: "9MA0.P2.5.5.2", text: "Find volume of revolution: π∫y² dx" },
              ]
            },
            {
              code: "9MA0.P2.5.6",
              name: "Differential Equations",
              subtopics: [
                { id: "9MA0.P2.5.6.1", text: "Solve separable first-order differential equations by separating variables" },
                { id: "9MA0.P2.5.6.2", text: "Find general and particular solutions using initial conditions" },
                { id: "9MA0.P2.5.6.3", text: "Form differential equations from rates of change problems" },
                { id: "9MA0.P2.5.6.4", text: "Interpret solutions in context (growth, decay, cooling)" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P2.6",
          name: "Numerical Methods — Pure 2",
          objectives: [
            {
              code: "9MA0.P2.6.1",
              name: "Locating Roots",
              subtopics: [
                { id: "9MA0.P2.6.1.1", text: "Show a root exists in an interval using sign change" },
                { id: "9MA0.P2.6.1.2", text: "Understand conditions for sign change method to work" },
              ]
            },
            {
              code: "9MA0.P2.6.2",
              name: "Iterative Methods",
              subtopics: [
                { id: "9MA0.P2.6.2.1", text: "Use iteration formula xₙ₊₁ = g(xₙ) to find successive approximations" },
                { id: "9MA0.P2.6.2.2", text: "Determine convergence or divergence of an iteration" },
                { id: "9MA0.P2.6.2.3", text: "Rearrange f(x) = 0 into suitable iterative form" },
              ]
            },
            {
              code: "9MA0.P2.6.3",
              name: "Newton-Raphson Method",
              subtopics: [
                { id: "9MA0.P2.6.3.1", text: "Apply Newton-Raphson: xₙ₊₁ = xₙ − f(xₙ)/f′(xₙ)" },
                { id: "9MA0.P2.6.3.2", text: "Understand when Newton-Raphson fails to converge" },
                { id: "9MA0.P2.6.3.3", text: "Use Newton-Raphson to find roots to specified accuracy" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P2.7",
          name: "Vectors — Pure 2",
          objectives: [
            {
              code: "9MA0.P2.7.1",
              name: "Vector Arithmetic in 2D and 3D",
              subtopics: [
                { id: "9MA0.P2.7.1.1", text: "Add, subtract, and scale vectors in column and i,j,k notation" },
                { id: "9MA0.P2.7.1.2", text: "Find magnitude of a vector and unit vector" },
                { id: "9MA0.P2.7.1.3", text: "Find position vectors and displacement vectors" },
                { id: "9MA0.P2.7.1.4", text: "Use vectors to describe geometric figures (midpoints, collinearity)" },
              ]
            },
            {
              code: "9MA0.P2.7.2",
              name: "Scalar (Dot) Product",
              subtopics: [
                { id: "9MA0.P2.7.2.1", text: "Calculate dot product: a·b = |a||b|cosθ" },
                { id: "9MA0.P2.7.2.2", text: "Use dot product to find angle between two vectors" },
                { id: "9MA0.P2.7.2.3", text: "Prove two vectors are perpendicular using dot product = 0" },
              ]
            },
            {
              code: "9MA0.P2.7.3",
              name: "Vector Equations of Lines",
              subtopics: [
                { id: "9MA0.P2.7.3.1", text: "Write vector equation of a line: r = a + λb" },
                { id: "9MA0.P2.7.3.2", text: "Find whether a point lies on a line" },
                { id: "9MA0.P2.7.3.3", text: "Find intersection of two lines or show they are skew" },
                { id: "9MA0.P2.7.3.4", text: "Find angle between two lines" },
              ]
            },
          ]
        },

        // ══ STATISTICS 1 ════════════════════════════════════════════════
        {
          code: "9MA0.S1.1",
          name: "Statistical Sampling",
          objectives: [
            {
              code: "9MA0.S1.1.1",
              name: "Sampling Methods",
              subtopics: [
                { id: "9MA0.S1.1.1.1", text: "Understand population, census, and sample" },
                { id: "9MA0.S1.1.1.2", text: "Describe and apply simple random, systematic, stratified, quota, and opportunity sampling" },
                { id: "9MA0.S1.1.1.3", text: "Evaluate advantages and disadvantages of each sampling method" },
              ]
            },
          ]
        },

        {
          code: "9MA0.S1.2",
          name: "Data Presentation and Interpretation",
          objectives: [
            {
              code: "9MA0.S1.2.1",
              name: "Measures of Location and Spread",
              subtopics: [
                { id: "9MA0.S1.2.1.1", text: "Calculate mean, median, mode from raw data and frequency tables" },
                { id: "9MA0.S1.2.1.2", text: "Calculate range, interquartile range, variance, and standard deviation" },
                { id: "9MA0.S1.2.1.3", text: "Use coding to simplify calculations of mean and standard deviation" },
                { id: "9MA0.S1.2.1.4", text: "Compare distributions using measures of location and spread" },
              ]
            },
            {
              code: "9MA0.S1.2.2",
              name: "Data Representations",
              subtopics: [
                { id: "9MA0.S1.2.2.1", text: "Interpret and draw box plots, histograms, cumulative frequency graphs" },
                { id: "9MA0.S1.2.2.2", text: "Identify outliers using 1.5 × IQR rule or mean ± 2 SD" },
                { id: "9MA0.S1.2.2.3", text: "Describe skewness from shape of distribution or comparing mean/median/mode" },
                { id: "9MA0.S1.2.2.4", text: "Clean data: identify and deal with outliers appropriately" },
              ]
            },
          ]
        },

        {
          code: "9MA0.S1.3",
          name: "Probability",
          objectives: [
            {
              code: "9MA0.S1.3.1",
              name: "Basic Probability",
              subtopics: [
                { id: "9MA0.S1.3.1.1", text: "Use Venn diagrams and two-way tables to find probabilities" },
                { id: "9MA0.S1.3.1.2", text: "Apply addition rule: P(A∪B) = P(A) + P(B) − P(A∩B)" },
                { id: "9MA0.S1.3.1.3", text: "Understand and apply mutually exclusive events" },
                { id: "9MA0.S1.3.1.4", text: "Understand and apply independent events: P(A∩B) = P(A)P(B)" },
              ]
            },
            {
              code: "9MA0.S1.3.2",
              name: "Conditional Probability",
              subtopics: [
                { id: "9MA0.S1.3.2.1", text: "Apply conditional probability formula: P(A|B) = P(A∩B)/P(B)" },
                { id: "9MA0.S1.3.2.2", text: "Draw and use tree diagrams for conditional probability" },
                { id: "9MA0.S1.3.2.3", text: "Recognise and apply independence condition: P(A|B) = P(A)" },
              ]
            },
          ]
        },

        {
          code: "9MA0.S1.4",
          name: "Statistical Distributions",
          objectives: [
            {
              code: "9MA0.S1.4.1",
              name: "Discrete Probability Distributions",
              subtopics: [
                { id: "9MA0.S1.4.1.1", text: "Construct a probability distribution table" },
                { id: "9MA0.S1.4.1.2", text: "Calculate E(X) = Σxp and Var(X) = Σx²p − [E(X)]²" },
                { id: "9MA0.S1.4.1.3", text: "Verify that probabilities sum to 1" },
              ]
            },
            {
              code: "9MA0.S1.4.2",
              name: "Binomial Distribution",
              subtopics: [
                { id: "9MA0.S1.4.2.1", text: "Recognise conditions for a binomial model: fixed n, constant p, independence, two outcomes" },
                { id: "9MA0.S1.4.2.2", text: "Calculate binomial probabilities: P(X=r) = nCr pʳ (1−p)ⁿ⁻ʳ" },
                { id: "9MA0.S1.4.2.3", text: "Use binomial tables or calculator for cumulative probabilities" },
                { id: "9MA0.S1.4.2.4", text: "Find E(X) = np and Var(X) = np(1−p)" },
                { id: "9MA0.S1.4.2.5", text: "Identify appropriate value of n and p from context" },
              ]
            },
            {
              code: "9MA0.S1.4.3",
              name: "Normal Distribution",
              subtopics: [
                { id: "9MA0.S1.4.3.1", text: "Understand properties of the Normal distribution N(μ, σ²)" },
                { id: "9MA0.S1.4.3.2", text: "Standardise: Z = (X−μ)/σ and use Z ~ N(0,1)" },
                { id: "9MA0.S1.4.3.3", text: "Find probabilities using Normal distribution tables or calculator" },
                { id: "9MA0.S1.4.3.4", text: "Find unknown μ or σ given a probability" },
                { id: "9MA0.S1.4.3.5", text: "Apply Normal distribution as a model for real data" },
              ]
            },
          ]
        },

        {
          code: "9MA0.S1.5",
          name: "Statistical Hypothesis Testing",
          objectives: [
            {
              code: "9MA0.S1.5.1",
              name: "Hypothesis Testing with Binomial Distribution",
              subtopics: [
                { id: "9MA0.S1.5.1.1", text: "Define null hypothesis H₀ and alternative hypothesis H₁" },
                { id: "9MA0.S1.5.1.2", text: "Conduct one-tailed and two-tailed tests at given significance level" },
                { id: "9MA0.S1.5.1.3", text: "Find critical region and critical value" },
                { id: "9MA0.S1.5.1.4", text: "Calculate p-value and compare with significance level" },
                { id: "9MA0.S1.5.1.5", text: "State conclusion in context" },
              ]
            },
            {
              code: "9MA0.S1.5.2",
              name: "Hypothesis Testing with Normal Distribution",
              subtopics: [
                { id: "9MA0.S1.5.2.1", text: "Test a population mean using sample mean and known/estimated σ" },
                { id: "9MA0.S1.5.2.2", text: "Find critical region for test of population mean" },
                { id: "9MA0.S1.5.2.3", text: "Interpret Type I and Type II errors" },
              ]
            },
          ]
        },

        // ══ MECHANICS 1 ═════════════════════════════════════════════════
        {
          code: "9MA0.M1.1",
          name: "Quantities and Units in Mechanics",
          objectives: [
            {
              code: "9MA0.M1.1.1",
              name: "SI Units and Scalars/Vectors",
              subtopics: [
                { id: "9MA0.M1.1.1.1", text: "Distinguish between scalar and vector quantities" },
                { id: "9MA0.M1.1.1.2", text: "Use SI units: metres, seconds, kilograms, Newtons" },
                { id: "9MA0.M1.1.1.3", text: "Resolve vectors into components and find resultant" },
              ]
            },
          ]
        },

        {
          code: "9MA0.M1.2",
          name: "Kinematics",
          objectives: [
            {
              code: "9MA0.M1.2.1",
              name: "Constant Acceleration (suvat)",
              subtopics: [
                { id: "9MA0.M1.2.1.1", text: "Apply equations of motion: v=u+at, s=ut+½at², v²=u²+2as, s=½(u+v)t" },
                { id: "9MA0.M1.2.1.2", text: "Solve problems with objects moving vertically under gravity" },
                { id: "9MA0.M1.2.1.3", text: "Handle sign conventions for direction in suvat problems" },
                { id: "9MA0.M1.2.1.4", text: "Solve two-body problems involving relative motion or meeting conditions" },
              ]
            },
            {
              code: "9MA0.M1.2.2",
              name: "Displacement-Time and Velocity-Time Graphs",
              subtopics: [
                { id: "9MA0.M1.2.2.1", text: "Interpret gradient of s-t graph as velocity" },
                { id: "9MA0.M1.2.2.2", text: "Interpret gradient of v-t graph as acceleration" },
                { id: "9MA0.M1.2.2.3", text: "Interpret area under v-t graph as displacement" },
                { id: "9MA0.M1.2.2.4", text: "Sketch and analyse motion graphs for various motion types" },
              ]
            },
            {
              code: "9MA0.M1.2.3",
              name: "Variable Acceleration using Calculus",
              subtopics: [
                { id: "9MA0.M1.2.3.1", text: "Differentiate displacement to find velocity: v = ds/dt" },
                { id: "9MA0.M1.2.3.2", text: "Differentiate velocity to find acceleration: a = dv/dt" },
                { id: "9MA0.M1.2.3.3", text: "Integrate acceleration to find velocity" },
                { id: "9MA0.M1.2.3.4", text: "Integrate velocity to find displacement" },
                { id: "9MA0.M1.2.3.5", text: "Use initial conditions to find constants of integration" },
                { id: "9MA0.M1.2.3.6", text: "Find when object is at rest, has maximum speed, or returns to origin" },
              ]
            },
            {
              code: "9MA0.M1.2.4",
              name: "Kinematics in 2D using Vectors",
              subtopics: [
                { id: "9MA0.M1.2.4.1", text: "Use vector equations for displacement, velocity, acceleration" },
                { id: "9MA0.M1.2.4.2", text: "Find position vector at time t: r = r₀ + vt (constant v) or integrate" },
                { id: "9MA0.M1.2.4.3", text: "Find speed and direction of motion from velocity vector" },
                { id: "9MA0.M1.2.4.4", text: "Solve interception and closest approach problems" },
              ]
            },
          ]
        },

        {
          code: "9MA0.M1.3",
          name: "Forces and Newton's Laws",
          objectives: [
            {
              code: "9MA0.M1.3.1",
              name: "Newton's Three Laws",
              subtopics: [
                { id: "9MA0.M1.3.1.1", text: "State and apply Newton's 1st law: equilibrium when net force = 0" },
                { id: "9MA0.M1.3.1.2", text: "Apply Newton's 2nd law: F = ma" },
                { id: "9MA0.M1.3.1.3", text: "Apply Newton's 3rd law: action-reaction pairs" },
                { id: "9MA0.M1.3.1.4", text: "Draw and interpret force diagrams (free body diagrams)" },
              ]
            },
            {
              code: "9MA0.M1.3.2",
              name: "Weight, Normal Reaction and Friction",
              subtopics: [
                { id: "9MA0.M1.3.2.1", text: "Distinguish between mass and weight: W = mg" },
                { id: "9MA0.M1.3.2.2", text: "Find normal reaction for objects on horizontal and inclined planes" },
                { id: "9MA0.M1.3.2.3", text: "Apply friction model: F ≤ μR, F = μR at limiting equilibrium" },
                { id: "9MA0.M1.3.2.4", text: "Solve problems with objects on rough inclined planes" },
              ]
            },
            {
              code: "9MA0.M1.3.3",
              name: "Connected Particles",
              subtopics: [
                { id: "9MA0.M1.3.3.1", text: "Solve problems with particles connected by strings over pulleys" },
                { id: "9MA0.M1.3.3.2", text: "Apply Newton's 2nd law to each particle separately" },
                { id: "9MA0.M1.3.3.3", text: "Find tension in string and acceleration of system" },
                { id: "9MA0.M1.3.3.4", text: "Solve problems with towing (e.g. car and trailer)" },
              ]
            },
            {
              code: "9MA0.M1.3.4",
              name: "Resolving Forces and Equilibrium",
              subtopics: [
                { id: "9MA0.M1.3.4.1", text: "Resolve forces into horizontal and vertical components" },
                { id: "9MA0.M1.3.4.2", text: "Apply equilibrium conditions: ΣFx = 0 and ΣFy = 0" },
                { id: "9MA0.M1.3.4.3", text: "Solve problems with three or more concurrent forces" },
                { id: "9MA0.M1.3.4.4", text: "Use Lami's theorem for three forces in equilibrium" },
              ]
            },
          ]
        },

        {
          code: "9MA0.M1.4",
          name: "Moments",
          objectives: [
            {
              code: "9MA0.M1.4.1",
              name: "Moments and Equilibrium of a Rigid Body",
              subtopics: [
                { id: "9MA0.M1.4.1.1", text: "Calculate moment of a force about a point: M = Fd" },
                { id: "9MA0.M1.4.1.2", text: "Apply principle of moments: sum of clockwise = sum of anticlockwise" },
                { id: "9MA0.M1.4.1.3", text: "Solve problems involving beams on supports with unknown reactions" },
                { id: "9MA0.M1.4.1.4", text: "Find position of unknown force for equilibrium" },
                { id: "9MA0.M1.4.1.5", text: "Solve problems involving tilting and the point about which tilting occurs" },
              ]
            },
          ]
        },

        // ══ PURE 3 & 4 (Year 2) ═════════════════════════════════════════
        {
          code: "9MA0.P3.1",
          name: "Proof — Pure 3/4",
          objectives: [
            {
              code: "9MA0.P3.1.1",
              name: "Methods of Proof",
              subtopics: [
                { id: "9MA0.P3.1.1.1", text: "Construct proofs using deduction and exhaustion" },
                { id: "9MA0.P3.1.1.2", text: "Disprove statements using counter-examples" },
                { id: "9MA0.P3.1.1.3", text: "Proof by contradiction" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P3.2",
          name: "Further Algebra — Pure 3/4",
          objectives: [
            {
              code: "9MA0.P3.2.1",
              name: "Binomial Expansion for Rational and Negative Powers",
              subtopics: [
                { id: "9MA0.P3.2.1.1", text: "Expand (1+x)ⁿ for rational n using binomial series: 1 + nx + n(n-1)x²/2! + ..." },
                { id: "9MA0.P3.2.1.2", text: "State the range of validity: |x| < 1" },
                { id: "9MA0.P3.2.1.3", text: "Expand (a+bx)ⁿ by factoring out a first" },
                { id: "9MA0.P3.2.1.4", text: "Use partial fractions combined with binomial expansion" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P3.3",
          name: "Further Trigonometry — Pure 3/4",
          objectives: [
            {
              code: "9MA0.P3.3.1",
              name: "Small Angle Approximations",
              subtopics: [
                { id: "9MA0.P3.3.1.1", text: "Use small angle approximations: sin θ ≈ θ, cos θ ≈ 1−θ²/2, tan θ ≈ θ" },
                { id: "9MA0.P3.3.1.2", text: "Apply approximations to simplify expressions and solve problems" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P3.4",
          name: "Further Differentiation — Pure 3/4",
          objectives: [
            {
              code: "9MA0.P3.4.1",
              name: "Differentiating Inverse Trig Functions",
              subtopics: [
                { id: "9MA0.P3.4.1.1", text: "Differentiate arcsin x, arccos x, arctan x" },
                { id: "9MA0.P3.4.1.2", text: "Apply chain rule to differentiate arcsin(f(x)) etc." },
              ]
            },
          ]
        },

        {
          code: "9MA0.P3.5",
          name: "Further Integration — Pure 3/4",
          objectives: [
            {
              code: "9MA0.P3.5.1",
              name: "Integrating Inverse Trig Forms",
              subtopics: [
                { id: "9MA0.P3.5.1.1", text: "Recognise and integrate 1/√(a²−x²) → arcsin(x/a)" },
                { id: "9MA0.P3.5.1.2", text: "Recognise and integrate 1/(a²+x²) → (1/a)arctan(x/a)" },
                { id: "9MA0.P3.5.1.3", text: "Complete the square to reduce to standard inverse trig forms" },
              ]
            },
            {
              code: "9MA0.P3.5.2",
              name: "Further Integration Techniques",
              subtopics: [
                { id: "9MA0.P3.5.2.1", text: "Integrate using double angle formulae: sin²x, cos²x" },
                { id: "9MA0.P3.5.2.2", text: "Integrate using trig identities to simplify products" },
                { id: "9MA0.P3.5.2.3", text: "Use substitution with trig: x = a sin θ or x = a tan θ" },
              ]
            },
          ]
        },

        {
          code: "9MA0.P3.6",
          name: "Complex Numbers — Pure 3/4",
          objectives: [
            {
              code: "9MA0.P3.6.1",
              name: "Arithmetic with Complex Numbers",
              subtopics: [
                { id: "9MA0.P3.6.1.1", text: "Add, subtract, multiply, and divide complex numbers in the form a + bi" },
                { id: "9MA0.P3.6.1.2", text: "Find the complex conjugate and use it to divide" },
                { id: "9MA0.P3.6.1.3", text: "Solve quadratic equations with complex roots" },
                { id: "9MA0.P3.6.1.4", text: "Understand that complex roots come in conjugate pairs for real polynomials" },
              ]
            },
            {
              code: "9MA0.P3.6.2",
              name: "Argand Diagram",
              subtopics: [
                { id: "9MA0.P3.6.2.1", text: "Represent complex numbers on an Argand diagram" },
                { id: "9MA0.P3.6.2.2", text: "Find modulus |z| = √(a²+b²) and argument arg(z)" },
                { id: "9MA0.P3.6.2.3", text: "Write in modulus-argument form: z = r(cos θ + i sin θ)" },
                { id: "9MA0.P3.6.2.4", text: "Interpret addition and multiplication geometrically" },
              ]
            },
            {
              code: "9MA0.P3.6.3",
              name: "Loci in the Complex Plane",
              subtopics: [
                { id: "9MA0.P3.6.3.1", text: "Sketch loci of the form |z − a| = r (circle)" },
                { id: "9MA0.P3.6.3.2", text: "Sketch loci of the form |z − a| = |z − b| (perpendicular bisector)" },
                { id: "9MA0.P3.6.3.3", text: "Sketch loci of the form arg(z − a) = θ (half-line)" },
                { id: "9MA0.P3.6.3.4", text: "Find intersections and regions defined by loci" },
              ]
            },
          ]
        },

        // ══ STATISTICS 2 (Year 2) ═══════════════════════════════════════
        {
          code: "9MA0.S2.1",
          name: "Regression, Correlation and Hypothesis Testing",
          objectives: [
            {
              code: "9MA0.S2.1.1",
              name: "Regression Lines",
              subtopics: [
                { id: "9MA0.S2.1.1.1", text: "Calculate and interpret the equation of a regression line y on x" },
                { id: "9MA0.S2.1.1.2", text: "Use regression line to make predictions within the data range" },
                { id: "9MA0.S2.1.1.3", text: "Understand limitations of extrapolation" },
                { id: "9MA0.S2.1.1.4", text: "Understand that regression line minimises squared residuals" },
              ]
            },
            {
              code: "9MA0.S2.1.2",
              name: "Correlation Coefficient",
              subtopics: [
                { id: "9MA0.S2.1.2.1", text: "Interpret the product moment correlation coefficient r: −1 ≤ r ≤ 1" },
                { id: "9MA0.S2.1.2.2", text: "Conduct a hypothesis test for zero correlation" },
                { id: "9MA0.S2.1.2.3", text: "Use critical values table to determine significance" },
                { id: "9MA0.S2.1.2.4", text: "Distinguish between correlation and causation" },
              ]
            },
          ]
        },

        {
          code: "9MA0.S2.2",
          name: "Conditional Probability and Further Distributions",
          objectives: [
            {
              code: "9MA0.S2.2.1",
              name: "Conditional Probability (Further)",
              subtopics: [
                { id: "9MA0.S2.2.1.1", text: "Apply conditional probability in multi-stage problems" },
                { id: "9MA0.S2.2.1.2", text: "Use formula P(B|A) = P(A∩B)/P(A) in complex contexts" },
                { id: "9MA0.S2.2.1.3", text: "Construct and use conditional probability tables" },
              ]
            },
            {
              code: "9MA0.S2.2.2",
              name: "Normal Approximation to Binomial",
              subtopics: [
                { id: "9MA0.S2.2.2.1", text: "State conditions for using Normal approximation: large n, p not too extreme" },
                { id: "9MA0.S2.2.2.2", text: "Apply continuity correction" },
                { id: "9MA0.S2.2.2.3", text: "Find probabilities using Normal approximation to B(n,p)" },
              ]
            },
          ]
        },

        // ══ MECHANICS 2 (Year 2) ═══════════════════════════════════════
        {
          code: "9MA0.M2.1",
          name: "Further Kinematics",
          objectives: [
            {
              code: "9MA0.M2.1.1",
              name: "Projectile Motion",
              subtopics: [
                { id: "9MA0.M2.1.1.1", text: "Resolve initial velocity into horizontal and vertical components" },
                { id: "9MA0.M2.1.1.2", text: "Apply suvat independently in horizontal (a=0) and vertical (a=−g) directions" },
                { id: "9MA0.M2.1.1.3", text: "Find range, maximum height, and time of flight" },
                { id: "9MA0.M2.1.1.4", text: "Find velocity vector at any time and angle of projection" },
                { id: "9MA0.M2.1.1.5", text: "Solve problems involving projectiles launched from a height" },
              ]
            },
          ]
        },

        {
          code: "9MA0.M2.2",
          name: "Further Forces",
          objectives: [
            {
              code: "9MA0.M2.2.1",
              name: "Friction on Inclined Planes",
              subtopics: [
                { id: "9MA0.M2.2.1.1", text: "Resolve forces parallel and perpendicular to slope" },
                { id: "9MA0.M2.2.1.2", text: "Apply F = μR at limiting equilibrium on rough incline" },
                { id: "9MA0.M2.2.1.3", text: "Determine whether particle moves up or down for a given applied force" },
                { id: "9MA0.M2.2.1.4", text: "Find angle of friction λ where tan λ = μ" },
              ]
            },
            {
              code: "9MA0.M2.2.2",
              name: "Elastic Strings and Springs (Hooke's Law)",
              subtopics: [
                { id: "9MA0.M2.2.2.1", text: "Apply Hooke's Law: T = kx or T = λx/l" },
                { id: "9MA0.M2.2.2.2", text: "Find extension or compression given force or modulus of elasticity" },
                { id: "9MA0.M2.2.2.3", text: "Calculate elastic potential energy: EPE = λx²/2l" },
                { id: "9MA0.M2.2.2.4", text: "Solve equilibrium problems with elastic strings" },
              ]
            },
          ]
        },

        {
          code: "9MA0.M2.3",
          name: "Work, Energy and Power",
          objectives: [
            {
              code: "9MA0.M2.3.1",
              name: "Work and Energy",
              subtopics: [
                { id: "9MA0.M2.3.1.1", text: "Calculate work done: W = Fd cos θ" },
                { id: "9MA0.M2.3.1.2", text: "Apply work-energy theorem: net work = change in KE" },
                { id: "9MA0.M2.3.1.3", text: "Calculate kinetic energy: KE = ½mv²" },
                { id: "9MA0.M2.3.1.4", text: "Calculate gravitational potential energy: GPE = mgh" },
                { id: "9MA0.M2.3.1.5", text: "Apply conservation of mechanical energy" },
                { id: "9MA0.M2.3.1.6", text: "Include work done against friction in energy equations" },
              ]
            },
            {
              code: "9MA0.M2.3.2",
              name: "Power",
              subtopics: [
                { id: "9MA0.M2.3.2.1", text: "Define power: P = Fv and P = W/t" },
                { id: "9MA0.M2.3.2.2", text: "Solve problems involving engines, driving forces, and resistance" },
                { id: "9MA0.M2.3.2.3", text: "Find maximum speed when driving force equals resistance" },
              ]
            },
          ]
        },

        {
          code: "9MA0.M2.4",
          name: "Impulse and Momentum",
          objectives: [
            {
              code: "9MA0.M2.4.1",
              name: "Momentum and Impulse",
              subtopics: [
                { id: "9MA0.M2.4.1.1", text: "Calculate momentum: p = mv" },
                { id: "9MA0.M2.4.1.2", text: "Calculate impulse: J = Ft = Δp = mv − mu" },
                { id: "9MA0.M2.4.1.3", text: "Apply conservation of linear momentum in collisions" },
                { id: "9MA0.M2.4.1.4", text: "Distinguish between elastic and inelastic collisions" },
              ]
            },
            {
              code: "9MA0.M2.4.2",
              name: "Coefficient of Restitution",
              subtopics: [
                { id: "9MA0.M2.4.2.1", text: "Apply Newton's law of restitution: e = speed of separation/speed of approach" },
                { id: "9MA0.M2.4.2.2", text: "Combine with conservation of momentum to solve direct impact problems" },
                { id: "9MA0.M2.4.2.3", text: "Understand perfectly elastic (e=1) and perfectly inelastic (e=0) collisions" },
                { id: "9MA0.M2.4.2.4", text: "Solve problems involving impact with a fixed surface" },
              ]
            },
          ]
        },
      ]
    }
  },

  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  //  AP Physics 1: Algebra-Based (Marker markdown extracted from official CED)
  //  Objectives are official Learning Objectives.
  //  Subtopics are official Essential Knowledge statements.
  // ─────────────────────────────────────────────
  "ap_physics_1": {
    "ap physics 1": {
      "standards": [
        {
          "code": "APP1.U1",
          "name": "Unit 1: Kinematics",
          "objectives": [
            {
              "code": "1.1.A",
              "name": "Describe a scalar or vector quantity using magnitude and direction, as appropriate.",
              "subtopics": [
                {
                  "id": "1.1.A.1",
                  "text": "Scalars are quantities described by magnitude only; vectors are quantities described by both magnitude and direction."
                },
                {
                  "id": "1.1.A.2",
                  "text": "Vectors can be visually modeled as arrows with appropriate direction and lengths proportional to their magnitude."
                },
                {
                  "id": "1.1.A.3",
                  "text": "Distance and speed are examples of scalar quantities, while position, displacement, velocity, and acceleration are examples of vector quantities."
                },
                {
                  "id": "1.1.A.3.i",
                  "text": "Vectors are notated with an arrow above the symbol for that quantity. Relevant equation: $$\\vec{v} = \\vec{v}_0 + \\vec{a}t$$"
                },
                {
                  "id": "1.1.A.3.ii",
                  "text": "Vector notation is not required for vector components along an axis. In one dimension, the sign of the component completely describes the direction of that component. Derived equation: $$v_x = v_{x0} + a_x t$$"
                }
              ]
            },
            {
              "code": "1.1.B",
              "name": "Describe a vector sum in one dimension.",
              "subtopics": [
                {
                  "id": "1.1.B.1",
                  "text": "When determining a vector sum in a given one-dimensional coordinate system, opposite directions are denoted by opposite signs."
                }
              ]
            },
            {
              "code": "1.2.A",
              "name": "Describe a change in an object's position.",
              "subtopics": [
                {
                  "id": "1.2.A.1",
                  "text": "When using the object model, the size, shape, and internal configuration are ignored. The object may be treated as a single point with extensive properties such as mass and charge."
                },
                {
                  "id": "1.2.A.2",
                  "text": "Displacement is the change in an object's position. Relevant equation: $$\\Delta x = x - x_0$$"
                }
              ]
            },
            {
              "code": "1.2.B",
              "name": "Describe the average velocity and acceleration of an object.",
              "subtopics": [
                {
                  "id": "1.2.B.1",
                  "text": "Averages of velocity and acceleration are calculated considering the initial and final states of an object over an interval of time."
                },
                {
                  "id": "1.2.B.2",
                  "text": "Average velocity is the displacement of an object divided by the interval of time in which that displacement occurs. Relevant equation: $$\\vec{v}_{avg} = \\frac{\\Delta \\vec{x}}{\\Delta t}$$"
                },
                {
                  "id": "1.2.B.3",
                  "text": "Average acceleration is the change in velocity divided by the interval of time in which that change in velocity occurs. Relevant equation: $$\\vec{a}_{avg} = \\frac{\\Delta \\vec{v}}{\\Delta t}$$"
                },
                {
                  "id": "1.2.B.4",
                  "text": "An object is accelerating if the magnitude and/or direction of the object's velocity are changing."
                },
                {
                  "id": "1.2.B.5",
                  "text": "Calculating average velocity or average acceleration over a very small time interval yields a value that is very close to the instantaneous velocity or instantaneous acceleration."
                }
              ]
            },
            {
              "code": "1.3.A",
              "name": "Describe the position, velocity, and acceleration of an object using representations of that object's motion.",
              "subtopics": [
                {
                  "id": "1.3.A.1",
                  "text": "Motion can be represented by motion diagrams, figures, graphs, equations, and narrative descriptions."
                },
                {
                  "id": "1.3.A.2",
                  "text": "For constant acceleration, three kinematic equations can be used to describe instantaneous linear motion in one dimension: $$v_x = v_{x0} + a_x t$$ $$x = x_0 + v_{x0} t + \\frac{1}{2} a_x t^2$$ $$v_x^2 = v_{x0}^2 + 2a_x (x - x_0)$$ Note: The equations above are written to indicate motion in the x-direction, but these equations can be used in any single dimension as appropriate."
                },
                {
                  "id": "1.3.A.3",
                  "text": "Near the surface of Earth, the vertical acceleration caused by the force of gravity is downward, constant, and has a measured value approximately equal to $$a_g = g \\approx 10 \\ m/s^2.$$"
                },
                {
                  "id": "1.3.A.4",
                  "text": "Graphs of position, velocity, and acceleration as functions of time can be used to find the relationships between those quantities."
                },
                {
                  "id": "1.3.A.4.i",
                  "text": "An object's instantaneous velocity is the rate of change of the object's position, which is equal to the slope of a line tangent to a point on a graph of the object's position as a function of time."
                },
                {
                  "id": "1.3.A.4.ii",
                  "text": "An object's instantaneous acceleration is the rate of change of the object's velocity, which is equal to the slope of a line tangent to a point on a graph of the object's velocity as a function of time."
                },
                {
                  "id": "1.3.A.4.iii",
                  "text": "The displacement of an object during a time interval is equal to the area under the curve of a graph of the object's velocity as a function of time (i.e., the area bounded by the function and the horizontal axis for the appropriate interval)."
                },
                {
                  "id": "1.3.A.4.iv",
                  "text": "The change in velocity of an object during a time interval is equal to the area under the curve of a graph of the acceleration of the object as a function of time."
                }
              ]
            },
            {
              "code": "1.4.A",
              "name": "Describe the reference frame of a given observer.",
              "subtopics": []
            },
            {
              "code": "1.4.B",
              "name": "Describe the motion of objects as measured by observers in different inertial reference frames.",
              "subtopics": [
                {
                  "id": "1.4.A.1",
                  "text": "The choice of reference frame will determine the direction and magnitude of quantities measured by an observer in that reference frame."
                },
                {
                  "id": "1.4.B.1",
                  "text": "Measurements from a given reference frame may be converted to measurements from another reference frame."
                },
                {
                  "id": "1.4.B.2",
                  "text": "The observed velocity of an object results from the combination of the object's velocity and the velocity of the observer's reference frame."
                },
                {
                  "id": "1.4.B.2.i",
                  "text": "Combining the motion of an object and the motion of an observer in a given reference frame involves the addition or subtraction of vectors."
                },
                {
                  "id": "1.4.B.2.ii",
                  "text": "The acceleration of any object is the same as measured from all inertial reference frames"
                }
              ]
            },
            {
              "code": "1.5.A",
              "name": "Describe the perpendicular components of a vector.",
              "subtopics": [
                {
                  "id": "1.5.A.1",
                  "text": "Vectors can be mathematically modeled as the resultant of two perpendicular components."
                },
                {
                  "id": "1.5.A.2",
                  "text": "Vectors can be resolved into components using a chosen coordinate system."
                },
                {
                  "id": "1.5.A.3",
                  "text": "Vectors can be resolved into perpendicular components using trigonometric functions and relationships. Relevant equations: $$\\sin\\theta = \\frac{a}{c}$$ $$\\cos \\theta = \\frac{b}{c}$$ $$\\tan \\theta = \\frac{a}{b}$$ $$a^2 + b^2 = c^2$$ continued on next page"
                }
              ]
            },
            {
              "code": "1.5.B",
              "name": "Describe the motion of an object moving in two dimensions.",
              "subtopics": [
                {
                  "id": "1.5.B.1",
                  "text": "Motion in two dimensions can be analyzed using one-dimensional kinematic relationships if the motion is separated into components."
                },
                {
                  "id": "1.5.B.2",
                  "text": "Projectile motion is a special case of twodimensional motion that has zero acceleration in one dimension and constant, nonzero acceleration in the second dimension. AP PHYSICS 1 UNIT 2 Force and Translational Dynamics 18-23% AP EXAM WEIGHTING ~22–27CLASS PERIODS Remember to go to AP Classroom to assign students the online Progress Check for this unit. Whether assigned as homework or completed in class, the Progress Check provides each student with immediate feedback related to this unit's topics and science practices. Progress Check 2 Multiple-choice: ~30 questions Free-response: 4 questions - Mathematical Routines - Translation Between Representations - Experimental Design and Analysis - Qualitative/Quantitative Translation Force and Translational Dynamics ←→ Developing Understanding ESSENTIAL QUESTIONS - Why do we feel pulled toward Earth but not toward a pencil? - Why is it more difficult to stop a fully loaded dump truck than a small passenger car? - Why is it difficult to walk on ice? - Why will a delivery truck filled with birds sitting on its floor be the same weight as a truck with the same birds flying around inside? In Unit 2, students are introduced to the concept of force, which is an interaction between two objects or systems of objects. Part of the larger study of dynamics, forces provide the context in which students analyze and come to understand a variety of physical phenomena. This understanding is accomplished by revisiting and building upon the models and representations presented in Unit 1—specifically through the introduction of the freebody diagram. Students will further analyze the effect of forces on systems when they encounter Newton's second law in rotational form in Unit 5. Building the Science Practices 2.A 2.D 3.B 3.C Translation between models and representations is key in this unit. Students will continue to use models and representations that will help them further analyze systems, the interactions between systems, and how these interactions result in change. Alongside gaining proficiency in the use of specific force equations, Unit 2 also encourages students to derive new expressions from fundamental principles (2.A) to help them make predictions using functional dependence between variables (2.D). The skills of making claims (3.B) and supporting those claims using evidence (3.C) can be developed throughout the unit by providing students with opportunities such as having them make predictions about the acceleration of a system based on the forces exerted on that system, and then justifying those predictions with appropriate physics principles. Preparing for the AP Exam The AP Physics 1 Exam requires students to re-express key elements of physical phenomena across multiple representations in the domain. This skill appears in the fourth question of the free-response section, the Qualitative/Quantitative Translation (QQT) question. In this question, students demonstrate translation between words and mathematics by describing and analyzing a scenario. Using content from any unit, the QQT first requires students to make a claim and provide evidence and reasoning to support their claim without reference to equations. Students are then asked to derive an equation or set of equations to mathematically represent the scenario. Lastly, students are required to make a connection between the claim made in the first part of the question and the equation(s) derived in the second part. Students exposed primarily to numerical problem solving often struggle with the QQT because it requires them to express a conceptual understanding of course content and representations. Opportunities to translate between different representations, including equations, diagrams, graphs, and verbal descriptions, can help students prepare for the QQT question. Force and Translational Dynamics UNIT AT A GLANCE | Topic | Suggested Skills | |------------------------|-----------------------------------------------------------------------------------------------------------------------------------------| | 2.1 Systems and Center | 1.B Create quantitative graphs with appropriate scales and units, including plotting data. | | of Mass | Calculate or estimate an unknown quantity with units from known quantities, by selecting and following a logical computational pathway. | | | Compare physical quantities between two or more scenarios or at different times and locations in a single scenario. | | | 3.B Apply an appropriate law, definition, theoretical relationship, or model to make a claim. | | 2.2 Forces and | 1.A Create diagrams, tables, charts, or schematics to represent physical situations. | | Free-Body Diagrams | Calculate or estimate an unknown quantity with units from known quantities, by selecting and following a logical computational pathway. | | | Compare physical quantities between two or more scenarios or at different times and locations in a single scenario. | | | Justify or support a claim using evidence from experimental data, physical representations, or physical principles or laws. | | 2.3 Newton's Third Law | 1.A Create diagrams, tables, charts, or schematics to represent physical situations. | | | Predict new values or factors of change of physical quantities using functional dependence between variables. | | | Apply an appropriate law, definition, theoretical relationship, or model to make a claim. | | | Justify or support a claim using evidence from experimental data, physical representations, or physical principles or laws. | | 2.4 Newton's First Law | 1.C Create qualitative sketches of graphs that represent features of a model or the behavior of a physical system. | | | <b>ZA</b> Derive a symbolic expression from known quantities by selecting and following a logical mathematical pathway. | | | 3.B Apply an appropriate law, definition, theoretical relationship, or model to make a claim. | | | 3.C Justify or support a claim using evidence from experimental data, physical representations, or physical principles or laws. | UNIT AT A GLANCE (cont'd) | Торіс | Suggested Skills | |----------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------| | 2.5 Newton's Second | 1.A Create diagrams, tables, charts, or schematics to represent physical situations. | | Law | <b>2.A</b> Derive a symbolic expression from known quantities by selecting and following a logical mathematical pathway. | | | 2.D Predict new values or factors of change of physical quantities using functional dependence between variables. | | | 3.5 Apply an appropriate law, definition, theoretical relationship, or model to make a claim. | | 2.6 Gravitational Force | 1.A Create diagrams, tables, charts, or schematics to represent physical situations. | | | <b>2.A</b> Derive a symbolic expression from known quantities by selecting and following a logical mathematical pathway. | | | Predict new values or factors of change of physical quantities using functional dependence between variables. | | | 3.C Justify or support a claim using evidence from experimental data, physical representations, or physical principles or laws. | | <b>2.7</b> Kinetic and Static Friction | 1.C Create qualitative sketches of graphs that represent features of a model or the behavior of a physical system. | | | 2.3 Calculate or estimate an unknown quantity with units from known quantities, by selecting and following a logical computational pathway. | | | Compare physical quantities between two or more scenarios or at different times and locations in a single scenario. | | | 3.3 Apply an appropriate law, definition, theoretical relationship, or model to make a claim. | Force and Translational Dynamics UNIT AT A GLANCE (cont'd) | Topic | Suggested Skills | |---------------------|----------------------------------------------------------------------------------------------------------------------------------------| | 2.8 Spring Forces | 1.B Create quantitative graphs with appropriate scales and units, including plotting data. | | | 2.A Derive a symbolic expression from known quantities by selecting and following a logical<br>mathematical pathway. | | | Compare physical quantities between two or more scenarios or at different times and locations in a single scenario. | | | 3.A Create experimental procedures that are appropriate for a given scientific question. | | | 3.B Apply an appropriate law, definition, theoretical relationship, or model to make a claim. | | 2.9 Circular Motion | 1.B Create quantitative graphs with appropriate scales and units, including plotting data. | | | <b>2.A</b> Derive a symbolic expression from known quantities by selecting and following a logical mathematical pathway. | | | 2.D Predict new values or factors of change of physical quantities using functional<br>dependence between variables. | | | 3.A Create experimental procedures that are appropriate for a given scientific question. | | | <b>3.C</b> Justify or support a claim using evidence from experimental data, physical representations, or physical principles or laws. | Go to AP Classroom to assign the Progress Check for Unit 2. Review the results in class to identify and address any student misunderstandings. SAMPLE INSTRUCTIONAL ACTIVITIES The sample activities on this page are optional and are offered to provide possible ways to incorporate various instructional approaches in the classroom. Teachers do not need to use these activities or instructional approaches and are free to alter or edit them. The examples below were developed in partnership with teachers from the AP community to share ways that they approach teaching some of the topics in this unit. Please refer to the Instructional Approaches section beginning on p. 153 for more examples of activities and strategies. | Activity | Topic | Sample Activity | |----------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------| | 1 | 2.2 | Changing Representations Have students consider an accelerating two-object system from everyday life (e.g., person pushes a shopping cart, car pulls a trailer). Have them draw the forces on one object, then on the other, and then the external forces exerted on the two-object system. | | 2 | 2.5 | Working Backward Put students in pairs. Have student A write a Newton's second law equation either with symbols or plugged-in numbers including units. Then, have student B describe a situation that the equation applies to, including the object's velocity direction and how velocity is changing, a diagram, and a free-body diagram. | | 3 | 2.5 | What, If Anything, Is Wrong? Have students identify some force-related problem from their homework or textbook (that requires setting up Newton's second law and maybe more). Ask students to write out a detailed solution that has exactly one mistake in it (not a calculation error). Post everyone's problems/solutions, and then ask students to identify everyone else's errors. The last student to have their error found wins. | | 4 | 2.7 | Desktop Experiment Task Have students measure the coefficient of static friction of their shoe on a wood plank or metal track. Level 1: Use a spring scale. Level 2: Use a pulley, a spring, a toy bucket, and an electronic balance. Level 3: Use a protractor. | | 5 | 2.6/2.9 | <b>Desktop Experiment Task</b> Have students use the \"My Solar System\" PhET applet to create circular orbits of varying radii around the central star and record radius, period, and planet mass for various trials. Next, have them calculate the speed using $v = 2\\pi r/T$ and force using $F = mv^2/r$ . Using the data, have students show that gravitational force is directly proportional to the mass of each object and inversely proportional to the square of the radius. | | 6 | 2.9 | Construct an Argument Ask students to consider two identical objects moving in circles (or parts of circles) of different radii. Then, ask them to think of a situation where the object with the smaller radius has a greater net force and another situation where the object with the larger radius has a greater net force. | | 7 | 2.9 | Changing Representations Describe something a driver could be doing in a car (e.g., \"turning the steering wheel to the right while pressing the brake\"). Have students walk out the motion while holding out one arm representing the velocity vector and the other arm representing the acceleration vector. | | 8 | 2.9 | Predict and Explain Attach an object of known weight (say, 2 N) to a force sensor and cause the object to swing in a 180-degree arc. Ask students, \"At the bottom, the object is neither speeding up nor slowing down, so what force is registered at the bottom?\" Expect students to (incorrectly) answer, \"2 N\" and discuss, as a class, why this answer is incorrect. |"
                }
              ]
            }
          ]
        },
        {
          "code": "APP1.U2",
          "name": "Unit 2: Force and Translational Dynamics",
          "objectives": [
            {
              "code": "2.1.A",
              "name": "Describe the properties and interactions of a system.",
              "subtopics": [
                {
                  "id": "2.1.A.1",
                  "text": "System properties are determined by the interactions between objects within the system."
                },
                {
                  "id": "2.1.A.2",
                  "text": "If the properties or interactions of the constituent objects within a system are not important in modeling the behavior of the macroscopic system, the system can itself be treated as a single object."
                },
                {
                  "id": "2.1.A.3",
                  "text": "Systems may allow interactions between constituent parts of the system and the environment, which may result in the transfer of energy or mass."
                },
                {
                  "id": "2.1.A.4",
                  "text": "Individual objects within a chosen system may behave differently from each other as well as from the system as a whole."
                },
                {
                  "id": "2.1.A.5",
                  "text": "The internal structure of a system affects the analysis of that system."
                },
                {
                  "id": "2.1.A.6",
                  "text": "As variables external to a system are changed, the system's substructure may change."
                }
              ]
            },
            {
              "code": "2.1.B",
              "name": "Describe the location of a system's center of mass with respect to the system's constituent parts.",
              "subtopics": [
                {
                  "id": "2.1.B.1",
                  "text": "For systems with symmetrical mass distributions, the center of mass is located on lines of symmetry."
                },
                {
                  "id": "2.1.B.2",
                  "text": "The location of a system's center of mass along a given axis can be calculated using the equation $$\\vec{x}_{cm} = \\frac{\\sum m_i \\vec{x}_i}{\\sum m_i}$$"
                },
                {
                  "id": "2.1.B.3",
                  "text": "A system can be modeled as a singular object that is located at the system's center of mass."
                }
              ]
            },
            {
              "code": "2.2.A",
              "name": "Describe a force as an interaction between two objects or systems.",
              "subtopics": [
                {
                  "id": "2.2.A.1",
                  "text": "Forces are vector quantities that describe the interactions between objects or systems."
                },
                {
                  "id": "2.2.A.1.i",
                  "text": "A force exerted on an object or system is always due to the interaction of that object with another object or system."
                },
                {
                  "id": "2.2.A.1.ii",
                  "text": "An object or system cannot exert a net force on itself."
                },
                {
                  "id": "2.2.A.2",
                  "text": "Contact forces describe the interaction of an object or system touching another object or system and are macroscopic effects of interatomic electric forces."
                }
              ]
            },
            {
              "code": "2.2.B",
              "name": "Describe the forces exerted on an object or system using a free-body diagram.",
              "subtopics": [
                {
                  "id": "2.2.B.1",
                  "text": "Free-body diagrams are useful tools for visualizing forces being exerted on a single object or system and for determining the equations that represent a physical situation."
                },
                {
                  "id": "2.2.B.2",
                  "text": "The free-body diagram of an object or system shows each of the forces exerted on the object by the environment."
                },
                {
                  "id": "2.2.B.3",
                  "text": "Forces exerted on an object or system are represented as vectors originating from the representation of the center of mass, such as a dot. A system is treated as though all of its mass is located at the center of mass."
                },
                {
                  "id": "2.2.B.4",
                  "text": "A coordinate system with one axis parallel to the direction of acceleration of the object or system simplifies the translation from freebody diagram to algebraic representation. For example, in a free-body diagram of an object on an inclined plane, it is useful to set one axis parallel to the surface of the incline."
                }
              ]
            },
            {
              "code": "2.3.A",
              "name": "Describe the interaction of two objects using Newton's third law and a representation of paired forces exerted on each object.",
              "subtopics": [
                {
                  "id": "2.3.A.1",
                  "text": "2.3.Δ.1 Newton's third law describes the interaction of two objects in terms of the paired forces that each exerts on the other. $$\\vec{F}_{A \\text{ on B}} = -\\vec{F}_{B \\text{ on A}}$$"
                },
                {
                  "id": "2.3.A.2",
                  "text": "Interactions between objects within a system (internal forces) do not influence the motion of a system's center of mass."
                },
                {
                  "id": "2.3.A.3",
                  "text": "Tension is the macroscopic net result of forces that segments of a string, cable, chain, or similar system exert on each other in response to an external force."
                },
                {
                  "id": "2.3.A.3.i",
                  "text": "An ideal string has negligible mass and does not stretch when under tension."
                },
                {
                  "id": "2.3.A.3.ii",
                  "text": "The tension in an ideal string is the same at all points within the string."
                },
                {
                  "id": "2.3.A.3.iii",
                  "text": "In a string with nonnegligible mass, tension may not be the same at all points within the string."
                },
                {
                  "id": "2.3.A.3.iv",
                  "text": "An ideal pulley is a pulley that has negligible mass and rotates about an axle through its center of mass with negligible friction."
                }
              ]
            },
            {
              "code": "2.4.A",
              "name": "Describe the conditions under which a system's velocity remains constant.",
              "subtopics": [
                {
                  "id": "2.4.A.1",
                  "text": "2.4.Δ.1 The net force on a system is the vector sum of all forces exerted on the system."
                },
                {
                  "id": "2.4.A.2",
                  "text": "Translational equilibrium is a configuration of forces such that the net force exerted on a system is zero. Derived equation: $$\\sum_{i} \\vec{F}_{i} = 0$$"
                },
                {
                  "id": "2.4.A.3",
                  "text": "Newton's first law states that if the net force exerted on a system is zero, the velocity of that system will remain constant."
                },
                {
                  "id": "2.4.A.4",
                  "text": "Forces may be balanced in one dimension but unbalanced in another. The system's velocity will change only in the direction of the unbalanced force."
                },
                {
                  "id": "2.4.A.5",
                  "text": "An inertial reference frame is one from which an observer would verify Newton's first law of motion."
                }
              ]
            },
            {
              "code": "2.5.A",
              "name": "Describe the conditions under which a system's velocity changes.",
              "subtopics": [
                {
                  "id": "2.5.A.1",
                  "text": "Unbalanced forces are a configuration of forces such that the net force exerted on a system is not equal to zero."
                },
                {
                  "id": "2.5.A.2",
                  "text": "Newton's second law of motion states that the acceleration of a system's center of mass has a magnitude proportional to the magnitude of the net force exerted on the system and is in the same direction as that net force. Relevant equation: $$\\vec{a}_{\\rm sys} = \\frac{\\sum \\vec{F}}{m_{\\rm sys}} = \\frac{\\vec{F}_{\\rm net}}{m_{\\rm sys}}$$"
                },
                {
                  "id": "2.5.A.3",
                  "text": "The velocity of a system's center of mass will only change if a nonzero net external force is exerted on that system."
                }
              ]
            },
            {
              "code": "2.6.A",
              "name": "Describe the gravitational interaction between two objects or systems with mass.",
              "subtopics": [
                {
                  "id": "2.6.A.1",
                  "text": "Newton's law of universal gravitation describes the gravitational force between two objects or systems as directly proportional to each of their masses and inversely proportional to the square of the distance between the systems' centers of mass. Relevant equation: $$\\left| \\vec{F}_g \\right| = G \\frac{m_1 m_2}{r^2}$$"
                },
                {
                  "id": "2.6.A.1.i",
                  "text": "The gravitational force is attractive."
                },
                {
                  "id": "2.6.A.1.ii",
                  "text": "The gravitational force is always exerted along the line connecting the centers of mass of the two interacting systems."
                },
                {
                  "id": "2.6.A.1.iii",
                  "text": "The gravitational force on a system can be considered to be exerted on the system's center of mass."
                },
                {
                  "id": "2.6.A.2",
                  "text": "A field models the effects of a noncontact force exerted on an object at various positions in space."
                },
                {
                  "id": "2.6.A.2.i",
                  "text": "The magnitude of the gravitational field created by a system of mass M at a point in space is equal to the ratio of the gravitational force exerted by the system on a test object of mass m to the mass of the test object."
                },
                {
                  "id": "2.6.A.3",
                  "text": "The gravitational force exerted by an astronomical body on a relatively small nearby object is called weight. Derived Equation: Weight = $$F_g = mg$$"
                }
              ]
            },
            {
              "code": "2.6.B",
              "name": "Describe situations in which the gravitational force can be considered constant.",
              "subtopics": [
                {
                  "id": "2.6.B.1",
                  "text": "If the gravitational force between two systems' centers of mass has a negligible change as the relative position of the two systems changes, the gravitational force can be considered constant at all points between the initial and final positions of the systems."
                },
                {
                  "id": "2.6.B.2",
                  "text": "Near the surface of Earth, the strength of the gravitational field is $g \\approx 10 \\text{ N/kg}$"
                }
              ]
            },
            {
              "code": "2.6.C",
              "name": "Describe the conditions under which the magnitude of a system's apparent weight is different from the magnitude of the gravitational force exerted on that system.",
              "subtopics": [
                {
                  "id": "2.6.C.1",
                  "text": "The magnitude of the apparent weight of a system is the magnitude of the normal force exerted on the system. If the system is accelerating, the apparent weight of the system is not equal to the magnitude of the gravitational force exerted on the system."
                },
                {
                  "id": "2.6.C.3",
                  "text": "A system appears weightless when there are no forces exerted on the system or when the force of gravity is the only force exerted on the system."
                },
                {
                  "id": "2.6.C.4",
                  "text": "The equivalence principle states that an observer in a noninertial reference frame is unable to distinguish between an object's apparent weight and the gravitational force exerted on the object by a gravitational field."
                }
              ]
            },
            {
              "code": "2.6.D",
              "name": "Describe inertial and gravitational mass.",
              "subtopics": [
                {
                  "id": "2.6.D.1",
                  "text": "Objects have inertial mass, or inertia, a property that determines how much an object's motion resists changes when interacting with another object."
                },
                {
                  "id": "2.6.D.2",
                  "text": "Gravitational mass is related to the force of attraction between two systems with mass."
                },
                {
                  "id": "2.6.D.3",
                  "text": "Inertial mass and gravitational mass have been experimentally verified to be equivalent."
                }
              ]
            },
            {
              "code": "2.7.A",
              "name": "Describe kinetic friction between two surfaces",
              "subtopics": [
                {
                  "id": "2.7.A.1",
                  "text": "Kinetic friction occurs when two surfaces in contact move relative to each other."
                },
                {
                  "id": "2.7.A.1.i",
                  "text": "The kinetic friction force is exerted in a direction opposite to the motion of each surface relative to the other surface."
                },
                {
                  "id": "2.7.A.1.ii",
                  "text": "The force of friction between two surfaces does not depend on the size of the surface area of contact."
                },
                {
                  "id": "2.7.A.2",
                  "text": "The magnitude of the kinetic friction force exerted on an object is the product of the normal force the surface exerts on the object and the coefficient of kinetic friction. Relevant equation: $$\\left| \\vec{F}_{f,k} \\right| = \\left| \\mu_k \\vec{F}_n \\right|$$ The coefficient of kinetic friction depends on the material properties of the surfaces that are in contact."
                },
                {
                  "id": "2.7.A.2.ii",
                  "text": "Normal force is the perpendicular component of the force exerted on an object by the surface with which it is in contact; it is directed away from the surface. continued on next page"
                }
              ]
            },
            {
              "code": "2.7.B",
              "name": "Describe static friction between two surfaces.",
              "subtopics": [
                {
                  "id": "2.7.B.1",
                  "text": "Static friction may occur between the contacting surfaces of two objects that are not moving relative to each other."
                },
                {
                  "id": "2.7.B.2",
                  "text": "Static friction adopts the value and direction required to prevent an object from slipping or sliding on a surface. Relevant equation: $$\\left| \\overrightarrow{F}_{f,s} \\right| \\leq \\left| \\mu_s \\overrightarrow{F}_n \\right|$$"
                },
                {
                  "id": "2.7.B.2.i",
                  "text": "Slipping and sliding refer to situations in which two surfaces are moving relative to each other."
                },
                {
                  "id": "2.7.B.2.ii",
                  "text": "There exists a maximum value for which static friction will prevent an object from slipping on a given surface. Derived equation: $$F_{f,s,\\max} = \\mu_s F_n$$"
                },
                {
                  "id": "2.7.B.3",
                  "text": "The coefficient of static friction is typically greater than the coefficient of kinetic friction for a given pair of surfaces."
                }
              ]
            },
            {
              "code": "2.8.A",
              "name": "Describe the force exerted on an object by an ideal spring",
              "subtopics": [
                {
                  "id": "2.8.A.1",
                  "text": "An ideal spring has negligible mass and exerts a force that is proportional to the change in its length as measured from its relaxed length. The magnitude of the force exerted by an ideal spring on an object is given by Hooke's law: $$\\vec{F}_s = -k\\Delta \\vec{x}$$"
                },
                {
                  "id": "2.8.A.3",
                  "text": "The force exerted on an object by a spring is always directed toward the equilibrium position of the object-spring system."
                }
              ]
            },
            {
              "code": "2.9.A",
              "name": "Describe the motion of an object traveling in a circular path.",
              "subtopics": [
                {
                  "id": "2.9.A.1",
                  "text": "Centripetal acceleration is the component of an object's acceleration directed toward the center of the object's circular path."
                },
                {
                  "id": "2.9.A.1.i",
                  "text": "The magnitude of centripetal acceleration for an object moving in a circular path is the ratio of the object's tangential speed squared to the radius of the circular path. Relevant equation: $$a_c = \\frac{v^2}{r}$$"
                },
                {
                  "id": "2.9.A.1.ii",
                  "text": "Centripetal acceleration is directed toward the center of an object's circular path."
                },
                {
                  "id": "2.9.A.2",
                  "text": "Centripetal acceleration can result from a single force, more than one force, or components of forces exerted on an object in circular motion."
                },
                {
                  "id": "2.9.A.2.i",
                  "text": "At the top of a vertical, circular loop, an object requires a minimum speed to maintain circular motion. At this point, and with this minimum speed, the gravitational force is the only force that causes the centripetal acceleration. Derived equation: $$v = \\sqrt{gr}$$"
                },
                {
                  "id": "2.9.A.2.ii",
                  "text": "Components of the static friction force and the normal force can contribute to the net force producing centripetal acceleration of an object traveling in a circle on a banked surface."
                },
                {
                  "id": "2.9.A.2.iii",
                  "text": "A component of tension contributes to the net force producing centripetal acceleration experienced by a conical pendulum."
                },
                {
                  "id": "2.9.A.3",
                  "text": "Tangential acceleration is the rate at which an object's speed changes and is directed tangent to the object's circular path."
                },
                {
                  "id": "2.9.A.4",
                  "text": "The net acceleration of an object moving in a circle is the vector sum of the centripetal acceleration and tangential acceleration. The revolution of an object traveling in a circular path at a constant speed (uniform circular motion) can be described using period and frequency."
                },
                {
                  "id": "2.9.A.5.i",
                  "text": "The time to complete one full circular path, one full rotation, or a full cycle of oscillatory motion is defined as period, T."
                },
                {
                  "id": "2.9.A.5.ii",
                  "text": "The rate at which an object is completing revolutions is defined as frequency, f. Relevant equation: $$T = \\frac{1}{f}$$"
                },
                {
                  "id": "2.9.A.5.iii",
                  "text": "For an object traveling at a constant speed in a circular path, the period is given by the derived equation $$T = \\frac{2\\pi r}{v}.$$ continued on next page"
                }
              ]
            },
            {
              "code": "2.9.B",
              "name": "Describe circular orbits using Kepler's third law.",
              "subtopics": [
                {
                  "id": "2.9.B.1",
                  "text": "For a satellite in circular orbit around a central body, the satellite's centripetal acceleration is caused only by gravitational attraction. The period and radius of the circular orbit are related to the mass of the central body. Derived equation: $$T^2 = \\frac{4\\pi^2}{GM}R^3$$"
                }
              ]
            }
          ]
        },
        {
          "code": "APP1.U3",
          "name": "Unit 3: Work, Energy, and Power",
          "objectives": [
            {
              "code": "3.1.A",
              "name": "Describe the translational kinetic energy of an object in terms of the object's mass and velocity.",
              "subtopics": [
                {
                  "id": "3.1.A.1",
                  "text": "An object's translational kinetic energy is given by the equation $$K = \\frac{1}{2}mv^2$$"
                },
                {
                  "id": "3.1.A.2",
                  "text": "Translational kinetic energy is a scalar quantity. Different observers may measure different values of the translational kinetic energy of an object, depending on the observer's frame of reference."
                }
              ]
            },
            {
              "code": "3.2.A",
              "name": "Describe the work done on an object or system by a given force or collection of forces.",
              "subtopics": [
                {
                  "id": "3.2.A.1",
                  "text": "Work is the amount of energy transferred into or out of a system by a force exerted on that system over a distance."
                },
                {
                  "id": "3.2.A.1.i",
                  "text": "The work done by a conservative force exerted on a system is path-independent and only depends on the initial and final configurations of that system."
                },
                {
                  "id": "3.2.A.1.ii",
                  "text": "The work done by a conservative force on a system—or the change in the potential energy of the system—will be zero if the system returns to its initial configuration."
                },
                {
                  "id": "3.2.A.1.iii",
                  "text": "Potential energies are associated only with conservative forces."
                },
                {
                  "id": "3.2.A.1.iv",
                  "text": "The work done by a nonconservative force is path-dependent."
                },
                {
                  "id": "3.2.A.1.v",
                  "text": "Examples of nonconservative forces are friction and air resistance."
                },
                {
                  "id": "3.2.A.2",
                  "text": "Work is a scalar quantity that may be positive, negative, or zero."
                },
                {
                  "id": "3.2.A.3",
                  "text": "The amount of work done on a system by a constant force is related to the components of that force and the displacement of the point at which that force is exerted."
                },
                {
                  "id": "3.2.A.3.i",
                  "text": "Only the component of the force exerted on a system that is parallel to the displacement of the point of application of the force will change the system's total energy. Relevant equation: $$W = F_{||}d = Fd \\cos\\theta$$"
                },
                {
                  "id": "3.2.A.3.ii",
                  "text": "The component of the force exerted on a system perpendicular to the direction of the displacement of the system's center of mass can change the direction of the system's motion without changing the system's kinetic energy."
                },
                {
                  "id": "3.2.A.4",
                  "text": "The work-energy theorem states that the change in an object's kinetic energy is equal to the sum of the work (net work) being done by all forces exerted on the object. Relevant equation: $$\\Delta K = \\sum_{i} W_{i} = \\sum_{i} F_{||,i} d$$"
                },
                {
                  "id": "3.2.A.4.i",
                  "text": "An external force may change the configuration of a system. The component of the external force parallel to the displacement times the displacement of the point of application of the force gives the change in kinetic energy of the system."
                },
                {
                  "id": "3.2.A.4.ii",
                  "text": "If the system's center of mass and the point of application of the force move the same distance when a force is exerted on a system, then the system may be modeled as an object, and only the system's kinetic energy can change."
                },
                {
                  "id": "3.2.A.4.iii",
                  "text": "The energy dissipated by friction is typically equated to the force of friction times the length of the path over which the force is exerted $$\\Delta E_{\\rm mech} = F_f d \\cos \\theta$$"
                },
                {
                  "id": "3.2.A.5",
                  "text": "Work is equal to the area under the curve of a graph of $F_{\\parallel}$ as a function of displacement."
                }
              ]
            },
            {
              "code": "3.3.A",
              "name": "Describe the potential energy of a system.",
              "subtopics": [
                {
                  "id": "3.3.A.4.ii",
                  "text": "The general form for the gravitational potential energy of a system consisting of two approximately spherical distributions of mass (e.g., moons, planets or stars) is given by the equation $$U_g = -G \\frac{m_1 m_2}{r}$$"
                },
                {
                  "id": "3.3.A.4.iii",
                  "text": "Because the gravitational field near the surface of a planet is nearly constant, the change in gravitational potential energy in a system consisting of an object with mass m and a planet with gravitational field of magnitude g when the object is near the surface of the planet may be approximated by the equation $$\\Delta U_g = mg\\Delta y$$ ."
                },
                {
                  "id": "3.3.A.5",
                  "text": "The total potential energy of a system containing more than two objects is the sum of the potential energy of each pair of objects within the system."
                }
              ]
            },
            {
              "code": "3.4.A",
              "name": "Describe the energies present in a system.",
              "subtopics": []
            },
            {
              "code": "3.4.B",
              "name": "Describe the behavior of a system using conservation of mechanical energy principles.",
              "subtopics": [
                {
                  "id": "3.4.B.1",
                  "text": "A system composed of only a single object can only have kinetic energy. A system that contains objects that interact via conservative forces or that can change its shape reversibly may have both kinetic and potential energies. Mechanical energy is the sum of a system's kinetic and potential energies. Any change to a type of energy within a system must be balanced by an equivalent change of other types of energies within the system or by a transfer of energy between the system and its surroundings. A system may be selected so that the total energy of that system is constant."
                },
                {
                  "id": "3.4.B.4",
                  "text": "If the total energy of a system changes, that change will be equivalent to the energy transferred into or out of the system. continued on next page"
                }
              ]
            },
            {
              "code": "3.4.C",
              "name": "Describe how the selection of a system determines whether the energy of that system changes.",
              "subtopics": [
                {
                  "id": "3.4.C.1",
                  "text": "Energy is conserved in all interactions."
                },
                {
                  "id": "3.4.C.2",
                  "text": "If the work done on a selected system is zero and there are no nonconservative interactions within the system, the total mechanical energy of the system is constant."
                },
                {
                  "id": "3.4.C.3",
                  "text": "If the work done on a selected system is nonzero, energy is transferred between the system and the environment."
                }
              ]
            },
            {
              "code": "3.5.A",
              "name": "Describe the transfer of energy into, out of, or within a system in terms of power.",
              "subtopics": [
                {
                  "id": "3.5.A.1",
                  "text": "Power is the rate at which energy changes with respect to time, either by transfer into or out of a system or by conversion from one type to another within a system."
                },
                {
                  "id": "3.5.A.2",
                  "text": "Average power is the amount of energy being transferred or converted, divided by the time it took for that transfer or conversion to occur. Relevant equation: $$P_{\\text{avg}} = \\frac{\\Delta E}{\\Delta t}$$"
                },
                {
                  "id": "3.5.A.3",
                  "text": "Because work is the change in energy of an object or system due to a force, average power is the total work done, divided by the time during which that work was done. Relevant equation: $$P_{\\text{avg}} = \\frac{W}{\\Delta t}$$"
                },
                {
                  "id": "3.5.A.4",
                  "text": "The instantaneous power delivered to an object by the component of a constant force parallel to the object's velocity can be described with the derived equation. $$P_{\\text{inst}} = F_{\\parallel} v = Fv \\cos \\theta.$$"
                }
              ]
            }
          ]
        },
        {
          "code": "APP1.U4",
          "name": "Unit 4: Linear Momentum",
          "objectives": [
            {
              "code": "4.1.A",
              "name": "Describe the linear momentum of an object or system.",
              "subtopics": [
                {
                  "id": "4.1.A.1",
                  "text": "Linear momentum is defined by the equation $\\overline{p} = m\\overline{v}$ ."
                },
                {
                  "id": "4.1.A.2",
                  "text": "Momentum is a vector quantity and has the same direction as the velocity."
                },
                {
                  "id": "4.1.A.3",
                  "text": "Momentum can be used to analyze collisions and explosions."
                },
                {
                  "id": "4.1.A.3.i",
                  "text": "A collision is a model for an interaction where the forces exerted between the involved objects in the system are much larger than the net external force exerted on those objects during the interaction."
                },
                {
                  "id": "4.1.A.3.ii",
                  "text": "As only the initial and final states of a collision are analyzed, the object model may be used to analyze collisions."
                },
                {
                  "id": "4.1.A.3.iii",
                  "text": "An explosion is a model for an interaction in which forces internal to the system move objects within that system apart."
                }
              ]
            },
            {
              "code": "4.2.A",
              "name": "Describe the impulse delivered to an object or system.",
              "subtopics": [
                {
                  "id": "4.2.A.1",
                  "text": "4.2.Δ.1 The rate of change of momentum is equal to the net external force exerted on an object or system. Relevant equation: $$\\vec{F}_{\\text{net}} = \\frac{\\Delta \\vec{p}}{\\Delta t}$$"
                },
                {
                  "id": "4.2.A.2",
                  "text": "Impulse is defined as the product of the average force exerted on a system and the time interval during which that force is exerted on the system. Relevant equation: $$\\vec{J} = \\vec{F}_{\\text{avg}} \\Delta t$$"
                },
                {
                  "id": "4.2.A.3",
                  "text": "Impulse is a vector quantity and has the same direction as the net force exerted on the system."
                },
                {
                  "id": "4.2.A.4",
                  "text": "The impulse delivered to a system by a net external force is equal to the area under the curve of a graph of the net external force exerted on the system as a function of time."
                },
                {
                  "id": "4.2.A.5",
                  "text": "The net external force exerted on a system is equal to the slope of a graph of the momentum of the system as a function of time. continued on next page"
                }
              ]
            },
            {
              "code": "4.2.B",
              "name": "Describe the relationship between the impulse exerted on an object or a system and the change in momentum of the object or system.",
              "subtopics": [
                {
                  "id": "4.2.B.1",
                  "text": "Change in momentum is the difference between a system's final momentum and its initial momentum. Relevant equation: $$\\Delta \\vec{p} = \\vec{p} - \\vec{p}_0$$"
                },
                {
                  "id": "4.2.B.2",
                  "text": "The impulse–momentum theorem relates the impulse exerted on a system and the system's change in momentum. Relevant equation: $$\\vec{J} = \\vec{F}_{\\text{avg}} \\Delta t = \\Delta \\vec{p}$$"
                },
                {
                  "id": "4.2.B.3",
                  "text": "Newton's second law of motion is a direct result of the impulse–momentum theorem applied to systems with constant mass. Relevant equation $$\\overline{F}_{\\text{net}} = \\frac{\\Delta \\overline{p}}{\\Delta t} = m \\frac{\\Delta \\vec{v}}{\\Delta t} = m \\vec{a}$$"
                }
              ]
            },
            {
              "code": "4.3.A",
              "name": "Describe the behavior of a system using conservation of linear momentum.",
              "subtopics": [
                {
                  "id": "4.3.A.1",
                  "text": "A collection of objects with individual momenta can be described as one system with one center-of-mass velocity."
                },
                {
                  "id": "4.3.A.1.i",
                  "text": "For a collection of objects, the velocity of a system's center of mass can be calculated using the equation $$\\vec{v}_{\\rm cm} = \\frac{\\sum \\vec{p}_i}{\\sum m_i} = \\frac{\\sum m_i \\vec{v}_i}{\\sum m_i}.$$"
                },
                {
                  "id": "4.3.A.1.ii",
                  "text": "The velocity of a system's center of mass is constant in the absence of a net external force"
                },
                {
                  "id": "4.3.A.2",
                  "text": "The total momentum of a system is the sum of the momenta of the system's constituent parts."
                },
                {
                  "id": "4.3.A.3",
                  "text": "In the absence of net external forces, any change to the momentum of an object within a system must be balanced by an equivalent and opposite change of momentum elsewhere within the system. Any change to the momentum of a system is due to a transfer of momentum between the system and its surroundings. continued on next page"
                },
                {
                  "id": "4.3.A.3.i",
                  "text": "The impulse exerted by one object on a second object is equal and opposite to the impulse exerted by the second object on the first. This is a direct result of Newton's third law."
                },
                {
                  "id": "4.3.A.3.ii",
                  "text": "A system may be selected so that the total momentum of that system is constant."
                },
                {
                  "id": "4.3.A.3.iii",
                  "text": "If the total momentum of a system changes, that change will be equivalent to the impulse exerted on the system. Relevant equation: $$\\vec{J} = \\Delta \\vec{p}$$"
                },
                {
                  "id": "4.3.A.4",
                  "text": "Correct application of conservation of momentum can be used to determine the velocity of a system immediately before and immediately after collisions or explosions."
                }
              ]
            },
            {
              "code": "4.3.B",
              "name": "Describe how the selection of a system determines whether the momentum of that system changes.",
              "subtopics": [
                {
                  "id": "4.3.B.1",
                  "text": "Momentum is conserved in all interactions."
                },
                {
                  "id": "4.3.B.2",
                  "text": "If the net external force on the selected system is zero, the total momentum of the system is constant."
                },
                {
                  "id": "4.3.B.3",
                  "text": "If the net external force on the selected system is nonzero, momentum is transferred between the system and the environment."
                }
              ]
            },
            {
              "code": "4.4.A",
              "name": "Describe whether an interaction between objects is elastic or inelastic.",
              "subtopics": [
                {
                  "id": "4.4.A.1",
                  "text": "An elastic collision between objects is one in which the initial kinetic energy of the system is equal to the final kinetic energy of the system."
                },
                {
                  "id": "4.4.A.2",
                  "text": "In an elastic collision, the final kinetic energies of each of the objects within the system may be different from their initial kinetic energies. An inelastic collision between objects is one in which the total kinetic energy of the system decreases."
                },
                {
                  "id": "4.4.A.4",
                  "text": "In an inelastic collision, some of the initial kinetic energy is not restored to kinetic energy but is transformed by nonconservative forces into other forms of energy."
                },
                {
                  "id": "4.4.A.5",
                  "text": "In a perfectly inelastic collision, the objects stick together and move with the same velocity after the collision."
                }
              ]
            }
          ]
        },
        {
          "code": "APP1.U5",
          "name": "Unit 5: Torque and Rotational Dynamics",
          "objectives": [
            {
              "code": "5.1.A",
              "name": "Describe the rotation of a system with respect to time using angular displacement, angular velocity, and angular acceleration.",
              "subtopics": [
                {
                  "id": "5.1.A.1",
                  "text": "Angular displacement is the measurement of the angle, in radians, through which a point on a rigid system rotates about a specified axis. Relevant equation: $$\\Delta\\theta = \\theta - \\theta_0$$"
                },
                {
                  "id": "5.1.A.1.i",
                  "text": "A rigid system is one that holds its shape but in which different points on the system move in different directions during rotation. A rigid system cannot be modeled as an object."
                },
                {
                  "id": "5.1.A.1.ii",
                  "text": "One direction of angular displacement about an axis of rotation—clockwise or counterclockwise—is typically indicated as mathematically positive, with the other direction becoming mathematically negative."
                },
                {
                  "id": "5.1.A.1.iii",
                  "text": "If the rotation of a system about an axis may be well described using the motion of the system's center of mass, the system may be treated as a single object. For example, the rotation of Earth about its axis may be considered negligible when considering the revolution of Earth about the center of mass of the Earth-Sun svstem. continued on next page"
                },
                {
                  "id": "5.1.A.2",
                  "text": "Average angular velocity is the average rate at which angular position changes with respect to time. Relevant equation: $$\\omega_{\\rm avg} = \\frac{\\Delta \\theta}{\\Delta t}$$"
                },
                {
                  "id": "5.1.A.3",
                  "text": "Average angular acceleration is the average rate at which the angular velocity changes with respect to time. Relevant equation: $$\\alpha_{\\text{avg}} = \\frac{\\Delta \\omega}{\\Delta t}$$"
                },
                {
                  "id": "5.1.A.4",
                  "text": "Angular displacement, angular velocity, and angular acceleration around one axis are analogous to linear displacement, velocity, and acceleration in one dimension and demonstrate the same mathematical relationships."
                },
                {
                  "id": "5.1.A.4.i",
                  "text": "For constant angular acceleration, the mathematical relationships between angular displacement, angular velocity, and angular acceleration can be described with the following equations: $$\\omega = \\omega_0 + \\alpha t$$ $$\\theta = \\theta_0 + \\omega_0 t + \\frac{1}{2} \\alpha t^2$$ $$\\omega^2 = \\omega_0^2 + 2\\alpha(\\theta - \\theta_0)$$"
                },
                {
                  "id": "5.1.A.4.ii",
                  "text": "Graphs of angular displacement, angular velocity, and angular acceleration as functions of time can be used to find the relationships between those quantities."
                }
              ]
            },
            {
              "code": "5.2.A",
              "name": "Describe the linear motion of a point on a rotating rigid system that corresponds to the rotational motion of that point, and vice versa.",
              "subtopics": [
                {
                  "id": "5.2.A.1",
                  "text": "For a point at a distance r from a fixed axis of rotation, the linear distance s traveled by the point as the system rotates through an angle $\\Delta\\theta$ is given by the equation $\\Delta s = r\\Delta\\theta$ ."
                },
                {
                  "id": "5.2.A.2",
                  "text": "Derived relationships of linear velocity and of the tangential component of acceleration to their respective angular quantities are given by the following equations: $s = r\\theta$ $v = r\\omega$ $a_T = r\\alpha$ For a rigid system, all points within that system have the same angular velocity and angular acceleration."
                }
              ]
            },
            {
              "code": "5.3.A",
              "name": "Identify the torques exerted on a rigid system.",
              "subtopics": []
            },
            {
              "code": "5.3.B",
              "name": "Describe the torques exerted on a rigid system.",
              "subtopics": [
                {
                  "id": "5.3.A.1",
                  "text": "Torque results only from the force component perpendicular to the position vector from the axis of rotation to the point of application of the force."
                },
                {
                  "id": "5.3.A.2",
                  "text": "The lever arm is the perpendicular distance from the axis of rotation to the line of action of the exerted force."
                },
                {
                  "id": "5.3.B.1",
                  "text": "Torques can be described using force diagrams."
                },
                {
                  "id": "5.3.B.1.i",
                  "text": "Force diagrams are similar to free-body diagrams and are used to analyze the torques exerted on a rigid system."
                },
                {
                  "id": "5.3.B.1.ii",
                  "text": "Similar to free-body diagrams, force diagrams represent the relative magnitude and direction of the forces exerted on a rigid system. Force diagrams also depict the location at which those forces are exerted relative to the axis of rotation."
                },
                {
                  "id": "5.3.B.2",
                  "text": "The magnitude of the torque exerted on a rigid system by a force is described by the following equation, where $\\theta$ is the angle between the force vector and the position vector from the axis of rotation to the point of application of the force. $$\\tau = rF_{\\perp} = rF \\sin \\theta$$"
                }
              ]
            },
            {
              "code": "5.4.A",
              "name": "Describe the rotational inertia of a rigid system relative to a given axis of rotation.",
              "subtopics": [
                {
                  "id": "5.4.A.1",
                  "text": "Rotational inertia measures a rigid system's resistance to changes in rotation and is related to the mass of the system and the distribution of that mass relative to the axis of rotation."
                },
                {
                  "id": "5.4.A.2",
                  "text": "The rotational inertia of an object rotating a perpendicular distance r from an axis is described by the equation $$I = mr^2$$ ."
                },
                {
                  "id": "5.4.A.3",
                  "text": "The total rotational inertia of a collection of objects about an axis is the sum of the rotational inertias of each object about that axis: $$I_{\\text{tot}} = \\sum I_i = \\sum m_i r_i^2$$"
                }
              ]
            },
            {
              "code": "5.4.B",
              "name": "Describe the rotational inertia of a rigid system rotating about an axis that does not pass through the system's center of mass.",
              "subtopics": [
                {
                  "id": "5.4.B.1",
                  "text": "A rigid system's rotational inertia in a given plane is at a minimum when the rotational axis passes through the system's center of mass. continued on next page"
                },
                {
                  "id": "5.4.B.2",
                  "text": "The parallel axis theorem uses the following equation to relate the rotational inertia of a rigid system about any axis that is parallel to an axis through its center of mass: $$I' = I_{\\rm cm} + Md^2$$"
                }
              ]
            },
            {
              "code": "5.5.A",
              "name": "Describe the conditions under which a system's angular velocity remains constant.",
              "subtopics": [
                {
                  "id": "5.5.A.1",
                  "text": "A system may exhibit rotational equilibrium (constant angular velocity) without being in translational equilibrium, and vice versa."
                },
                {
                  "id": "5.5.A.1.i",
                  "text": "Free-body and force diagrams describe the nature of the forces and torques exerted on an object or rigid system."
                },
                {
                  "id": "5.5.A.1.ii",
                  "text": "Rotational equilibrium is a configuration of torques such that the net torque exerted on the system is zero. Relevant equation: $$\\sum \\tau_i = 0$$"
                },
                {
                  "id": "5.5.A.1.iii",
                  "text": "The rotational analog of Newton's first law is that a system will have a constant angular velocity only if the net torque exerted on the system is zero."
                },
                {
                  "id": "5.5.A.2",
                  "text": "A rotational corollary to Newton's second law states that if the torques exerted on a rigid system are not balanced, the system's angular velocity must be changing."
                }
              ]
            },
            {
              "code": "5.6.A",
              "name": "Describe the conditions under which a system's angular velocity changes.",
              "subtopics": [
                {
                  "id": "5.6.A.1",
                  "text": "Angular velocity changes when the net torque exerted on the object or system is not equal to zero."
                },
                {
                  "id": "5.6.A.2",
                  "text": "The rate at which the angular velocity of a rigid system changes is directly proportional to the net torque exerted on the rigid system and is in the same direction. The angular acceleration of the rigid system is inversely proportional to the rotational inertia of the rigid system. Relevant equation: $$\\alpha_{\\rm sys} = \\frac{\\sum \\tau}{I_{\\rm sys}} = \\frac{\\tau_{\\rm net}}{I_{\\rm sys}}$$"
                },
                {
                  "id": "5.6.A.3",
                  "text": "To fully describe a rotating rigid system, linear and rotational analyses may need to be performed independently. AP PHYSICS 1 UNIT 6 Energy and Momentum of Rotating Systems 5–8% AP EXAM WEIGHTING ~8-14 CLASS PERIODS Remember to go to AP Classroom to assign students the online Progress Check for this unit. Whether assigned as homework or completed in class, the Progress Check provides each student with immediate feedback related to this unit's topics and science practices. Progress Check 6 Multiple-choice: ~18 questions Free-response: 4 questions - Mathematical Routines - Translation Between Representations - Experimental Design and Analysis - Qualitative/Quantitative Translation Energy and Momentum of Rotating Systems ESSENTIAL Developing Understanding QUESTIONS - What keeps a bicycle balanced? - Why do planets move faster when they travel closer to the sun? - What do satellites and projectiles have in common? - What do ice skaters do with their arms when they want to spin faster? Why? In Unit 6, students will apply their knowledge of energy and momentum to rotating systems. Similar to the approach used for translational energy and momentum concepts in Units 3 and 4, it is important that students have conceptual understanding of how angular momentum and rotational energy change due to external torque(s) on a system. Additionally, articulating the conditions under which the rotational energy and/or angular momentum of a system remains constant is foundational to working through more complex scenarios. Students will use the content and skills presented in both Units 5 and 6 to further study the motion of orbiting satellites and rolling without slipping in this unit. Building the Science Practices 2.C 2.D 3.B 3.C Unit 6 provides opportunities for students to compare physical quantities between scenarios or at different times in a single scenario (2.C), as well as determine new values of quantities using functional dependencies between variables (2.D). From there, students can also make and justify claims based on these physical principles and functional relationships (3.B, 3.C). For example, students could describe conceptually what happens to the rotational inertia of a system when the pivot point is moved, and then justify what impact that change will have on the angular acceleration of the system. By the end of the unit, it is important for students to be comfortable with making claims about the reasonableness of their claims and justifications made with functional dependence (2.D, 3.C), starting with first principles of physics. Preparing for the AP Exam On both the multiple-choice and freeresponse sections of the AP Physics 1 Exam, students need to be able to describe the relationships between physical quantities in order to articulate the effects of changing the value of a specific physical quantity in a scenario. Therefore, students will benefit from opportunities to investigate changes in systems, including practicing using fundamental principles of physics to decide whether a quantity will increase, decrease, or remain the same when another quantity is changed. Additionally, when writing justifications for claims, simply referencing an equation, law, or physical principle is not sufficient. For example, stating that one disk is rolling faster than another because of \"conservation of energy\" is not a complete enough answer to earn credit on the freeresponse section of the exam. Students must clearly and concisely explain the steps in their reasoning that lead from the equation, law, or physical principle to the justification of their claim in FRQ #1, the MR question. Energy and Momentum of Rotating Systems UNIT AT A GLANCE | Topic | Suggested Skills | |----------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------| | 6.1 Rotational Kinetic<br>Energy | 1.A Create diagrams, tables, charts, or schematics to represent physical situations. | | Energy | Calculate or estimate an unknown quantity with units from known quantities, by selecting and following a logical computational pathway. | | | Compare physical quantities between two or more scenarios or at different times and locations in a single scenario. | | | 3.B Apply an appropriate law, definition, theoretical relationship, or model to make a claim. | | <b>6.2</b> Torque and Work | 1.B Create quantitative graphs with appropriate scales and units, including plotting data. | | | Derive a symbolic expression from known quantities by selecting and following a logical mathematical pathway. | | | Compare physical quantities between two or more scenarios or at different times and locations in a single scenario. | | | Predict new values or factors of change of physical quantities using functional dependence between variables. | | | 3.A Create experimental procedures that are appropriate for a given scientific question. | | 6.3 Angular Momentum | 1.B Create quantitative graphs with appropriate scales and units, including plotting data. | | and Angular<br>Impulse | Derive a symbolic expression from known quantities by selecting and following a logical mathematical pathway. | | | Predict new values or factors of change of physical quantities using functional dependence between variables. | | | 3.B Apply an appropriate law, definition, theoretical relationship, or model to make a claim. | | 6.4 Conservation of | 1.B Create quantitative graphs with appropriate scales and units, including plotting data. | | Angular Momentum | Predict new values or factors of change of physical quantities using functional dependence between variables. | | | 3.A Create experimental procedures that are appropriate for a given scientific question. | | | 3.B Apply an appropriate law, definition, theoretical relationship, or model to make a claim. | | | Justify or support a claim using evidence from experimental data, physical representations, or physical principles or laws. | UNIT AT A GLANCE (cont'd) | Topic | Suggested Skills | |--------------------------------------|---------------------------------------------------------------------------------------------------------------------------------| | 6.5 Rolling | 1.A Create diagrams, tables, charts, or schematics to represent physical situations. | | | 2.A Derive a symbolic expression from known quantities by selecting and following a logical mathematical pathway. | | | Compare physical quantities between two or more scenarios or at different times and locations in a single scenario. | | | Justify or support a claim using evidence from experimental data, physical representations, or physical principles or laws. | | 6.6 Motion of Orbiting<br>Satellites | 1.C Create qualitative sketches of graphs that represent features of a model or the behavior of a physical system. | | | <b>2.A</b> Derive a symbolic expression from known quantities by selecting and following a logical mathematical pathway. | | | Compare physical quantities between two or more scenarios or at different times and locations in a single scenario. | | | 3.C Justify or support a claim using evidence from experimental data, physical representations, or physical principles or laws. | AP Go to AP Classroom to assign the Progress Check for Unit 6. Review the results in class to identify and address any student misunderstandings. Energy and Momentum of Rotating Systems SAMPLE INSTRUCTIONAL ACTIVITIES The sample activities on this page are optional and are offered to provide possible ways to incorporate various instructional approaches in the classroom. Teachers do not need to use these activities or instructional approaches and are free to alter or edit them. The examples below were developed in partnership with teachers from the AP community to share ways that they approach teaching some of the topics in this unit. Please refer to the Instructional Approaches section beginning on p. 153 for more examples of activities and strategies. | Activity | Topic | Sample Activity | |----------|-------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------| | 1 | 6.1 | Desktop Experiment Task Have students release a yo-yo from rest, calculate its acceleration from distance and time measurements, and then determine the yo-yo's rotational inertia (which requires the yo-yo's mass and the radius at which the string connects to the yo-yo). Next, have them roll the yo-yo down a ramp and use distance and time data to construct a conservation of energy equation that can be solved for the yo-yo's rotational inertia. | | 2 | 6.3 | Predict and Explain Allow students to play with a set of fidget spinners. Ask them to explain why it is difficult to change the plane of rotation of a spinner while it is rotating. | | 3 | 6.5 | Concept-Oriented Demonstration Obtain a ring and a disk of equal mass and radius and load up a low-friction cart with weights to make it the same mass. \"Race\" the three objects from rest down identical inclines to show students the cart wins, then the disk, and then the ring. Have students explain why the objects win in this order, with forces and then with energy. | | 4 | 6.5 | Ranking Tasks Present students with the following scenario and its accompanying three cases: A wheel rolls down an incline from rest and across a flat surface. Case 1: Tracks are rough enough that there is no slipping. Case 2: Tracks have some friction, but there is slipping. Case 3: Tracks have negligible friction. Have students rank translational kinetic energies at the end, rotational kinetic energies at the end, and total mechanical energies of the wheel at the end as three separate tasks. | | 5 | 6.5 | $(K_{T3} > K_{T2} > K_{T1})$ , $(K_{R1} > K_{R2} > K_{R3})$ , and $(E_1 = E_3 > E_2)$ . Construct an Argument Have students roll a hoop and a disk (of equal mass and radius) down identical ramps. Then have them explain why the disk reached the bottom in less time using energy bar charts and to-scale free-body diagrams. |"
                }
              ]
            }
          ]
        },
        {
          "code": "APP1.U6",
          "name": "Unit 6: Energy and Momentum of Rotating Systems",
          "objectives": [
            {
              "code": "6.1.A",
              "name": "Describe the rotational kinetic energy of a rigid system in terms of the rotational inertia and angular velocity of that rigid system.",
              "subtopics": [
                {
                  "id": "6.1.A.1",
                  "text": "The rotational kinetic energy of an object or rigid system is related to the rotational inertia and angular velocity of the rigid system and is given by the equation $$K = \\frac{1}{2}I\\omega^2.$$"
                },
                {
                  "id": "6.1.A.1.i",
                  "text": "The rotational inertia of an object about a fixed axis can be used to show that the rotational kinetic energy of that object is equivalent to its translational kinetic energy, which is its total kinetic energy. The total kinetic energy of a rigid system is the sum of its rotational kinetic energy due to its rotation about its center of mass and the translational kinetic energy due to the linear motion of its center of mass."
                },
                {
                  "id": "6.1.A.2",
                  "text": "A rigid system can have rotational kinetic energy while its center of mass is at rest due to the individual points within the rigid system having linear speed and, therefore, kinetic energy. Rotational kinetic energy is a scalar quantity."
                }
              ]
            },
            {
              "code": "6.2.A",
              "name": "Describe the work done on a rigid system by a given torque or collection of torques.",
              "subtopics": [
                {
                  "id": "6.2.A.1",
                  "text": "A torque can transfer energy into or out of an object or rigid system if the torque is exerted over an angular displacement."
                },
                {
                  "id": "6.2.A.2",
                  "text": "The amount of work done on a rigid system by a torque is related to the magnitude of that torque and the angular displacement through which the rigid system rotates during the interval in which that torque is exerted. Relevant equation: $W = \\tau \\Delta \\theta$"
                },
                {
                  "id": "6.2.A.3",
                  "text": "Work done on a rigid system by a given torque can be found from the area under the curve of a graph of torque as a function of angular position."
                }
              ]
            },
            {
              "code": "6.3.A",
              "name": "Describe the angular momentum of an object or rigid system.",
              "subtopics": [
                {
                  "id": "6.3.A.1",
                  "text": "The magnitude of the angular momentum of a rigid system about a specific axis can be described with the equation $L = I\\omega$ ."
                },
                {
                  "id": "6.3.A.2",
                  "text": "The magnitude of the angular momentum of an object about a given point is $L = rmv \\sin \\theta$ ."
                },
                {
                  "id": "6.3.A.2.i",
                  "text": "The selection of the axis about which an object is considered to rotate influences the determination of the angular momentum of that object."
                },
                {
                  "id": "6.3.A.2.ii",
                  "text": "The measured angular momentum of an object traveling in a straight line depends on the distance between the reference point and the object, the mass of the object, the speed of the object, and the angle between the radial distance and the velocity of the object. continued on next page"
                }
              ]
            },
            {
              "code": "6.3.B",
              "name": "Describe the angular impulse delivered to an object or rigid system by a torque.",
              "subtopics": [
                {
                  "id": "6.3.B.1",
                  "text": "Angular impulse is defined as the product of the torque exerted on an object or rigid system and the time interval during which the torque is Relevant equation: angular impulse = $\\tau \\Delta t$"
                },
                {
                  "id": "6.3.B.2",
                  "text": "Angular impulse has the same direction as the torque exerted on the object or system."
                },
                {
                  "id": "6.3.B.3",
                  "text": "The angular impulse delivered to an object or rigid system by a torque can be found from the area under the curve of a graph of the torque as a function of time."
                }
              ]
            },
            {
              "code": "6.3.C",
              "name": "Relate the change in angular momentum of an object or rigid system to the angular impulse given to that object or rigid system.",
              "subtopics": [
                {
                  "id": "6.3.C.1",
                  "text": "The magnitude of the change in angular momentum can be described by comparing the magnitudes of the final and initial angular momenta of the object or rigid system: $$\\Delta L = L - L_0$$"
                },
                {
                  "id": "6.3.C.2",
                  "text": "A rotational form of the impulse–momentum theorem relates the angular impulse delivered to an object or rigid system and the change in angular momentum of that object or rigid system."
                },
                {
                  "id": "6.3.C.2.i",
                  "text": "The angular impulse exerted on an object or rigid system is equal to the change in angular momentum of that object or rigid system. Relevant equation: $$\\Delta L = \\tau \\Delta t$$"
                },
                {
                  "id": "6.3.C.2.ii",
                  "text": "The rotational form of the impulse momentum theorem is a direct result of the rotational form of Newton's second law of motion for cases in which rotational inertia is constant: $$\\tau_{\\rm net} = \\frac{\\Delta L}{\\Delta t} = I \\frac{\\Delta \\omega}{\\Delta t} = I \\alpha$$"
                },
                {
                  "id": "6.3.C.3",
                  "text": "The net torque exerted on an object is equal to the slope of the graph of the angular momentum of an object as a function of time."
                },
                {
                  "id": "6.3.C.4",
                  "text": "The angular impulse delivered to an object is equal to the area under the curve of a graph of the net external torque exerted on an object as a function of time."
                }
              ]
            },
            {
              "code": "6.4.A",
              "name": "Describe the behavior of a system using conservation of angular momentum.",
              "subtopics": [
                {
                  "id": "6.4.A.1",
                  "text": "The total angular momentum of a system about a rotational axis is the sum of the angular momenta of the system's constituent parts about that axis."
                },
                {
                  "id": "6.4.A.2",
                  "text": "Any change to a system's angular momentum must be due to an interaction between the system and its surroundings."
                },
                {
                  "id": "6.4.A.2.i",
                  "text": "The angular impulse exerted by one object or system on a second object or system is equal and opposite to the angular impulse exerted by the second object or system on the first. This is a direct result of Newton's third law."
                },
                {
                  "id": "6.4.A.2.ii",
                  "text": "A system may be selected so that the total angular momentum of that system is constant."
                },
                {
                  "id": "6.4.A.2.iii",
                  "text": "The angular speed of a nonrigid system may change without the angular momentum of the system changing if the system changes shape by moving mass closer to or further from the rotational axis."
                },
                {
                  "id": "6.4.A.2.iv",
                  "text": "If the total angular momentum of a system changes, that change will be equivalent to the angular impulse exerted on the system."
                }
              ]
            },
            {
              "code": "6.4.B",
              "name": "Describe how the selection of a system determines whether the angular momentum of that system changes.",
              "subtopics": [
                {
                  "id": "6.4.B.1",
                  "text": "Angular momentum is conserved in all interactions."
                },
                {
                  "id": "6.4.B.2",
                  "text": "If the net external torque exerted on a selected object or rigid system is zero, the total angular momentum of that system is constant."
                },
                {
                  "id": "6.4.B.3",
                  "text": "If the net external torque exerted on a selected object or rigid system is nonzero, angular momentum is transferred between the system and the environment."
                }
              ]
            },
            {
              "code": "6.5.A",
              "name": "Describe the kinetic energy of a system that has translational and rotational motion.",
              "subtopics": []
            },
            {
              "code": "6.5.B",
              "name": "Describe the motion of a system that is rolling without slipping.",
              "subtopics": [
                {
                  "id": "6.5.B.1",
                  "text": "65 A 1 The total kinetic energy of a system is the sum of the system's translational and rotational kinetic energies. Relevant equation:. $$K_{\\text{tot}} = K_{\\text{trans}} + K_{\\text{rot}}$$"
                },
                {
                  "id": "6.5.B.1",
                  "text": "While rolling without slipping, the translational motion of a system's center of mass is related to the rotational motion of the system itself with the equations: $$\\Delta x_{\\rm cm} = r \\Delta \\theta$$ $$v_{\\rm cm} = r\\omega$$ $$a_{\\rm cm} = r\\alpha$$"
                },
                {
                  "id": "6.5.B.2",
                  "text": "For ideal cases, rolling without slipping implies that the frictional force does not dissipate any energy from the rolling system."
                }
              ]
            },
            {
              "code": "6.5.C",
              "name": "Describe the motion of a system that is rolling while slipping.",
              "subtopics": [
                {
                  "id": "6.5.C.1",
                  "text": "When slipping, the motion of a system's center of mass and the system's rotational motion cannot be directly related. When a rotating system is slipping relative to another surface, the point of application of the force of kinetic friction exerted on the system moves with respect to the surface, so the force of kinetic friction will dissipate energy from the system."
                }
              ]
            },
            {
              "code": "6.6.A",
              "name": "Describe the motions of a system consisting of two objects interacting only via gravitational forces.",
              "subtopics": [
                {
                  "id": "6.6.A.1",
                  "text": "In a system consisting only of a massive central object and an orbiting satellite with mass that is negligible in comparison to the central object's mass, the motion of the central object itself is negligible."
                },
                {
                  "id": "6.6.A.2",
                  "text": "The motion of satellites in orbits is constrained by conservation laws."
                },
                {
                  "id": "6.6.A.2.i",
                  "text": "In circular orbits, the system's total mechanical energy, the system's gravitational potential energy, and the satellite's angular momentum and kinetic energy are constant."
                },
                {
                  "id": "6.6.A.2.ii",
                  "text": "In elliptical orbits, the system's total mechanical energy and the satellite's angular momentum are constant, but the system's gravitational potential energy and the satellite's kinetic energy can each change."
                },
                {
                  "id": "6.6.A.2.iii",
                  "text": "The gravitational potential energy of a system consisting of a satellite and a massive central object is defined to be zero when the satellite is an infinite distance from the central object. Relevant equation: $$U_g = -G \\frac{m_1 m_2}{r}$$"
                },
                {
                  "id": "6.6.A.3",
                  "text": "The escape velocity of a satellite is the satellite's velocity such that the mechanical energy of the satellite–central-object system is equal to zero."
                },
                {
                  "id": "6.6.A.3.i",
                  "text": "When the only force exerted on a satellite is gravity from a central object, a satellite that reaches escape velocity will move away from the central body until its speed reaches zero at an infinite distance from the central body."
                },
                {
                  "id": "6.6.A.3.ii",
                  "text": "The escape velocity of a satellite from a central body of mass M can be derived using conservation of energy laws. Derived equation: $$v_{\\rm esc} = \\sqrt{\\frac{2GM}{r}}$$ AP PHYSICS 1 UNIT 7 Oscillations 5–8% AP EXAM WEIGHTING ~5-10 CLASS PERIODS Remember to go to AP Classroom to assign students the online Progress Check for this unit. Whether assigned as homework or completed in class, the Progress Check provides each student with immediate feedback related to this unit's topics and science practices. Progress Check 7 Multiple-choice: ~18 questions Free-response: 4 questions - Mathematical Routines - Translation Between Representations - Experimental Design and Analysis - Qualitative/Quantitative Translation Oscillations ←→ Developing Understanding ESSENTIAL QUESTIONS - How can oscillations be used to make our lives easier and more comfortable? - How can an astronaut be \"weighed\" in space? - How could you measure the length of a long string with a stopwatch? - What do a child on a swing, a beating heart, and a metronome have in common? In Unit 7, students will apply previously-encountered models and methods of analysis to simple harmonic motion. They will also be reminded that, even in new situations, the fundamental laws of physics remain the same. Because this unit is the first in which students possess all the tools of force, energy, and momentum conservation—such as energy bar charts, free-body diagrams, and momentum diagrams—scaffolding lessons will enhance student understanding of fundamental physics principles and their limitations, as they relate to oscillating systems. Students will also use the skills and knowledge they have gained to make and justify claims, as well as connect new concepts with those learned in previous Building the Science Practices 1.A 1.C 2.A 3.C Throughout this unit, there are many opportunities for students to create graphs (1.C) that may include force, energy, or momentum as either a function of position or time for a single scenario and to make connections between physics concepts based on these graphs. In Unit 7, as in other units in AP Physics 1, practice creating and using models to represent physical scenarios (1.A) and then translating the information presented in these models into other representations—such as symbolic expressions (2.A)—can help students justify or support claims about oscillating systems (3.C). Preparing for the AP Exam The second free-response question on the AP Physics 1 Exam—the Translation Between Representations question (TBR) requires students to create graphical and verbal models of scenarios, as well as compare these models to mathematical representations of the same situation. Similar in nature to the Qualitative/Quantitative Translation question (QQT), the TBR involves creating multiple representations and describing the relationships between those representations; however, the types of representations being compared in the TBR differ from those in the QQT. In the TBR, a student might be asked to sketch freebody diagrams of a block oscillating on a spring at the maximum displacement and at equilibrium. The student might then be asked to create energy bar charts for the blockspring system at maximum displacement and at equilibrium. Lastly, the student might be asked to make connections between the two representations, explaining how the representations are consistent with each other. While Unit 7 content provides especially good practice for the TBR, content from any unit may be included in this free-response question on the AP Exam. Oscillations UNIT AT A GLANCE | Topic | Suggested Skills | |-------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------| | 7.1 Defining Simple Harmonic Motion | 1.C Create qualitative sketches of graphs that represent features of a model or the behavior of a physical system. | | (SHM) | 2.B Calculate or estimate an unknown quantity with units from known quantities, by selecting and following a logical computational pathway. | | | 3.B Apply an appropriate law, definition, theoretical relationship, or model to make a claim. | | | 3.C Justify or support a claim using evidence from experimental data, physical representations, or physical principles or laws. | | 7.2 Frequency and | 1.B Create quantitative graphs with appropriate scales and units, including plotting data. | | Period of SHM | <b>2.A</b> Derive a symbolic expression from known quantities by selecting and following a logical mathematical pathway. | | | Predict new values or factors of change of physical quantities using functional dependence between variables. | | | 3.A Create experimental procedures that are appropriate for a given scientific question. | | | 3.C Justify or support a claim using evidence from experimental data, physical representations, or physical principles or laws. | | <b>7.3</b> Representing and Analyzing SHM | 1.C Create qualitative sketches of graphs that represent features of a model or the behavior of a physical system. | | | <b>2.A</b> Derive a symbolic expression from known quantities by selecting and following a logical mathematical pathway. | | | Predict new values or factors of change of physical quantities using functional dependence between variables. | | | 3.C Justify or support a claim using evidence from experimental data, physical representations, or physical principles or laws. | | 7.4 Energy of Simple | 1.A Create diagrams, tables, charts, or schematics to represent physical situations. | | Harmonic<br>Oscillators | 2.B Calculate or estimate an unknown quantity with units from known quantities, by selecting and following a logical computational pathway. | | | <b>2.C</b> Compare physical quantities between two or more scenarios or at different times and locations in a single scenario. | | | 3.B Apply an appropriate law, definition, theoretical relationship, or model to make a claim. | | | | Go to AP Classroom to assign the Progress Check for Unit 7. Review the results in class to identify and address any student misunderstandings. SAMPLE INSTRUCTIONAL ACTIVITIES The sample activities on this page are optional and are offered to provide possible ways to incorporate various instructional approaches in the classroom. Teachers do not need to use these activities or instructional approaches and are free to alter or edit them. The examples below were developed in partnership with teachers from the AP community to share ways that they approach teaching some of the topics in this unit. Please refer to the Instructional Approaches section beginning on p. 153 for more examples of activities and strategies. | Activity | Topic | Sample Activity | |----------|-------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------| | 1 | 7.2 | <b>Desktop Experiment Task</b> Have students determine the spring constant of a spring using (1) known masses and a meterstick only and then (2) known masses and a stopwatch only. | | 2 | 7.2 | <b>Desktop Experiment Task</b> Have students use a pendulum to determine the acceleration due to gravity. Ask them to refine the experiment from a single-trial calculation, to taking an average, to making a graph of linearized data. | | 3 | 7.2 | Predict and Explain Have students make a pendulum bob oscillate with the other end of the string \"clamped\" between your fingers. While the bob oscillates, pull the string through your fingers so that the string length is shortened. Before doing this, ask students what will happen to the period of the oscillation and amplitude (measured in degrees), and then explain why the period decreases and the amplitude angle increases. | | 4 | 7.2 | Create a Plan Have students choose a song and find its tempo (in beats per minute). Then, have them build a pendulum so that it swings back and forth on each beat. Next, give students a spring. Have them first find the spring's constant and then find the amount of mass necessary to make the spring-mass oscillate on each beat. | | 5 | 7.4 | Construct an Argument A cart wiggles on a horizontal spring. A blob of clay is dropped on the cart and sticks (could be when the cart is at the center or at one end). Ask students to explain what happened to the period, total energy, amplitude of motion, and maximum speed. |"
                }
              ]
            }
          ]
        },
        {
          "code": "APP1.U7",
          "name": "Unit 7: Oscillations",
          "objectives": [
            {
              "code": "7.1.A",
              "name": "Describe simple harmonic motion.",
              "subtopics": [
                {
                  "id": "7.1.A.1",
                  "text": "Simple harmonic motion is a special case of periodic motion."
                },
                {
                  "id": "7.1.A.2",
                  "text": "SHM results when the magnitude of the restoring force exerted on an object is proportional to that object's displacement from its equilibrium position. Derived equation: $$ma_x = -k\\Delta x$$"
                },
                {
                  "id": "7.1.A.2.i",
                  "text": "A restoring force is a force that is exerted in a direction opposite to the object's displacement from an equilibrium position."
                },
                {
                  "id": "7.1.A.2.ii",
                  "text": "An equilibrium position is a location at which the net force exerted on an object or system is zero."
                },
                {
                  "id": "7.1.A.2.iii",
                  "text": "The motion of a pendulum with a small angular displacement can be modeled as simple harmonic motion because the restoring torque is proportional to the angular displacement."
                }
              ]
            },
            {
              "code": "7.3.A",
              "name": "Describe the displacement, velocity, and acceleration of an object exhibiting SHM.",
              "subtopics": [
                {
                  "id": "7.3.A.1",
                  "text": "For an object exhibiting SHM, the displacement of that object measured from its equilibrium position can be represented by the equations $x = A\\cos(2\\pi \\ ft)$ or $x = A\\sin(2\\pi \\ ft)$ ."
                },
                {
                  "id": "7.3.A.1.i",
                  "text": "Minima, maxima, and zeros of displacement, velocity, and acceleration are features of harmonic motion."
                },
                {
                  "id": "7.3.A.1.ii",
                  "text": "Recognizing the positions or times at which the displacement, velocity, and acceleration for SHM have extrema or zeros can help in qualitatively describing the behavior of the motion."
                },
                {
                  "id": "7.3.A.2",
                  "text": "Changing the amplitude of a system exhibiting SHM will not change the period of that system."
                },
                {
                  "id": "7.3.A.3",
                  "text": "Properties of SHM can be determined and analyzed using graphical representations."
                }
              ]
            },
            {
              "code": "7.4.A",
              "name": "Describe the mechanical energy of a system exhibiting SHM",
              "subtopics": [
                {
                  "id": "7.4.A.1",
                  "text": "The total energy of a system exhibiting SHM is the sum of the system's kinetic and potential energies. Relevant equation: $$E_{\\text{total}} = U + K$$"
                },
                {
                  "id": "7.4.A.2",
                  "text": "Conservation of energy indicates that the total energy of a system exhibiting SHM is constant."
                },
                {
                  "id": "7.4.A.3",
                  "text": "The kinetic energy of a system exhibiting SHM is at a maximum when the system's potential energy is at a minimum."
                },
                {
                  "id": "7.4.A.4",
                  "text": "The potential energy of a system exhibiting SHM is at a maximum when the system's kinetic energy is at a minimum."
                },
                {
                  "id": "7.4.A.4.i",
                  "text": "The minimum kinetic energy of a system exhibiting SHM is zero."
                },
                {
                  "id": "7.4.A.4.ii",
                  "text": "Changing the amplitude of a system exhibiting SHM will change the maximum potential energy of the system and, therefore, the total energy of the system. Relevant equation for a spring-object system: $$E_{\\text{total}} = \\frac{1}{2}kA^2$$"
                }
              ]
            }
          ]
        },
        {
          "code": "APP1.U8",
          "name": "Unit 8: Fluids",
          "objectives": [
            {
              "code": "8.1.A",
              "name": "Describe the properties of a fluid.",
              "subtopics": [
                {
                  "id": "8.1.A.1",
                  "text": "Distinguishing properties of solids, liquids, and gases stem from the varying interactions between atoms and molecules."
                },
                {
                  "id": "8.1.A.2",
                  "text": "A fluid is a substance that has no fixed shape."
                },
                {
                  "id": "8.1.A.3",
                  "text": "Fluids can be characterized by their density. Density is defined as a ratio of mass to volume. Relevant equation: $$\\rho = \\frac{m}{V}$$"
                },
                {
                  "id": "8.1.A.4",
                  "text": "An ideal fluid is incompressible and has no viscosity."
                }
              ]
            },
            {
              "code": "8.2.A",
              "name": "Describe the pressure exerted on a surface by a given force.",
              "subtopics": [
                {
                  "id": "8.2.A.2",
                  "text": "$P = \\frac{F_{\\perp}}{A}$ ."
                },
                {
                  "id": "8.2.A.1",
                  "text": "Pressure is a scalar quantity. described by the equation ESSENTIAL KNOWLEDGE Pressure is defined as the magnitude of the perpendicular force component exerted per unit area over a given surface area, as"
                },
                {
                  "id": "8.2.A.3",
                  "text": "The volume and density of a given amount of an incompressible fluid is constant regardless of the pressure exerted on that fluid."
                }
              ]
            },
            {
              "code": "8.2.B",
              "name": "Describe the pressure exerted by a fluid.",
              "subtopics": [
                {
                  "id": "8.2.B.1",
                  "text": "The pressure exerted by a fluid is the result of the entirety of the interactions between the fluid's constituent particles and the surface with which those particles interact."
                },
                {
                  "id": "8.2.B.2",
                  "text": "The absolute pressure of a fluid at a given point is equal to the sum of a reference pressure $P_0$ , such as the atmospheric pressure $P_{\\rm atm}$ , and the gauge pressure $P_{\\rm gauge}$ . Relevant equation: $$P = P_0 + \\rho g h$$"
                },
                {
                  "id": "8.2.B.3",
                  "text": "The gauge pressure of a vertical column of fluid is described by the equation $$P_{\\text{gauge}} = \\rho g h.$$"
                }
              ]
            },
            {
              "code": "8.3.A",
              "name": "Describe the conditions under which a fluid's velocity changes.",
              "subtopics": []
            },
            {
              "code": "8.3.B",
              "name": "Describe the buoyant force exerted on an object interacting with a fluid.",
              "subtopics": [
                {
                  "id": "8.3.A.1",
                  "text": "Newton's laws can be used to describe the motion of particles within a fluid."
                },
                {
                  "id": "8.3.A.2",
                  "text": "The macroscopic behavior of a fluid is a result of the internal interactions between the fluid's constituent particles and external forces exerted on the fluid."
                },
                {
                  "id": "8.3.B.1",
                  "text": "The buoyant force is a net upward force exerted on an object by a fluid."
                },
                {
                  "id": "8.3.B.2",
                  "text": "The buoyant force exerted on an object by a fluid is a result of the collective forces exerted on the object by the particles making up the fluid."
                },
                {
                  "id": "8.3.B.3",
                  "text": "The magnitude of the buoyant force exerted on an object by a fluid is equivalent to the weight of the fluid displaced by the object. Relevant equation: $$F_b = \\rho V g$$"
                }
              ]
            },
            {
              "code": "8.4.A",
              "name": "Describe the flow of an incompressible fluid through a cross-sectional area by using mass conservation.",
              "subtopics": [
                {
                  "id": "8.4.A.1",
                  "text": "A difference in pressure between two locations causes a fluid to flow."
                },
                {
                  "id": "8.4.A.1.i",
                  "text": "The rate at which matter enters a fluid-filled tube open at both ends must equal the rate at which matter exits the tube."
                },
                {
                  "id": "8.4.A.1.ii",
                  "text": "The rate at which matter flows into a location is proportional to the crosssectional area of the flow and the speed at which the fluid flows. Derived equation: $$\\frac{V}{t} = Av$$"
                },
                {
                  "id": "8.4.A.2",
                  "text": "The continuity equation for fluid flow describes conservation of mass flow rate in incompressible fluids. Relevant equation: $$A_1 \\nu_1 = A_2 \\nu_2$$"
                }
              ]
            },
            {
              "code": "8.4.B",
              "name": "Describe the flow of a fluid as a result of a difference in energy between two locations within the fluid– Earth system.",
              "subtopics": [
                {
                  "id": "8.4.B.1",
                  "text": "A difference in gravitational potential energies between two locations in a fluid will result in a difference in kinetic energy and pressure between those two locations that is described by conservation laws."
                },
                {
                  "id": "8.4.B.2",
                  "text": "Bernoulli's equation describes the conservation of mechanical energy in fluid flow. Relevant equation: $$P_1 + \\rho g y_1 + \\frac{1}{2} \\rho v_1^2 = P_2 + \\rho g y_2 + \\frac{1}{2} \\rho v_2^2$$"
                },
                {
                  "id": "8.4.R.3",
                  "text": "Torricelli's theorem relates the speed of a fluid exiting an opening to the difference in height between the opening and the top surface of the fluid and can be derived from conservation of energy principles. Derived equation: $$v = \\sqrt{2g\\Delta y}$$"
                }
              ]
            }
          ]
        }
      ]
    }
  },

  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  //  AP Physics C: Mechanics (Marker markdown extracted from official CED)
  //  Unit codes remain APPC.* for compatibility with pacing defaults.
  //  Objectives are LO-level and subtopics are EK-level.
  // ─────────────────────────────────────────────
  "ap_physics_c": {
    "ap physics c": {
      "standards": [
        {
          "code": "APPC.1",
          "name": "Kinematics",
          "objectives": [
            {
              "code": "1.1.A",
              "name": "Describe a scalar or vector quantity using magnitude and direction, as appropriate.",
              "subtopics": [
                {
                  "id": "1.1.A.1",
                  "text": "Scalars are quantities described by magnitude only; vectors are quantities described by both magnitude and direction."
                },
                {
                  "id": "1.1.A.2",
                  "text": "Vectors can be visually modeled as arrows with appropriate direction and lengths proportional to their magnitude."
                },
                {
                  "id": "1.1.A.3",
                  "text": "Distance and speed are examples of scalar quantities, while position, displacement, velocity, and acceleration are examples of vector quantities."
                },
                {
                  "id": "1.1.A.4",
                  "text": "Vectors can be expressed in unit vector notation or as a magnitude and a direction."
                },
                {
                  "id": "1.1.A.4.i",
                  "text": "Unit vector notation can be used to represent vectors as the sum of their constituent components in the x-, y-, and z-directions, denoted by $\\hat{i}$ , $\\hat{j}$ , and $\\hat{k}$ , respectively. Relevant equation: $$\\vec{r} = \\left(A\\hat{i} + B\\hat{j} + C\\hat{k}\\right)$$"
                },
                {
                  "id": "1.1.A.4.ii",
                  "text": "The position vector of a point is given by $\\vec{r}$ , and the unit vector in the direction of the position vector is denoted $\\hat{r}$ ."
                },
                {
                  "id": "1.1.A.4.iii",
                  "text": "A resultant vector is the vector sum of the addend vectors' components. Relevant equations: $$\\vec{C} = \\vec{A} + \\vec{B}$$ $$\\vec{C} = (A_x + B_x)\\hat{i} + (A_y + B_y)\\hat{j}$$"
                },
                {
                  "id": "1.1.A.5",
                  "text": "In a given one-dimensional coordinate system, opposite directions are denoted by opposite signs."
                }
              ]
            },
            {
              "code": "1.2.A",
              "name": "Describe a change in an object's position.",
              "subtopics": [
                {
                  "id": "1.2.A.1",
                  "text": "When using the object model, the size, shape, and internal configuration are ignored. The object may be treated as a single point with extensive properties such as mass and charge."
                },
                {
                  "id": "1.2.A.2",
                  "text": "Displacement is the change in an object's position. Relevant equation: $$\\Delta x = x - x_0$$"
                }
              ]
            },
            {
              "code": "1.2.B",
              "name": "Describe the average velocity and acceleration of an object.",
              "subtopics": [
                {
                  "id": "1.2.B.1",
                  "text": "Averages of velocity and acceleration are calculated considering the initial and final states of an object over an interval of time."
                },
                {
                  "id": "1.2.B.2",
                  "text": "Average velocity is the displacement of an object divided by the interval of time in which that displacement occurs. Relevant equation: $$\\vec{v}_{\\text{avg}} = \\frac{\\Delta \\vec{x}}{\\Delta t}$$"
                },
                {
                  "id": "1.2.B.3",
                  "text": "Average acceleration is the change in velocity divided by the interval of time in which that change in velocity occurs. Relevant equation: $$\\vec{a}_{\\rm avg} = \\frac{\\Delta \\vec{v}}{\\Delta t}$$"
                },
                {
                  "id": "1.2.B.4",
                  "text": "An object is accelerating if either the magnitude and/or direction of the object's velocity are changing."
                }
              ]
            },
            {
              "code": "1.2.C",
              "name": "Describe the instantaneous position, velocity, and acceleration of an object as a function of time.",
              "subtopics": [
                {
                  "id": "1.2.C.1",
                  "text": "As the time interval used to calculate the average value of a quantity approaches zero, the average value of that quantity approaches the value of the quantity at that instant, called the instantaneous value."
                },
                {
                  "id": "1.2.C.1.i",
                  "text": "Instantaneous velocity is the rate of change of the object's position, which is equal to the derivative of position with respect to time. Relevant equations: $$\\vec{v} = \\frac{d\\vec{r}}{dt}$$ $$v_x = \\frac{dx}{dt}$$"
                },
                {
                  "id": "1.2.C.1.ii",
                  "text": "Instantaneous acceleration is the rate of change of the object's velocity, which is equal to the derivative of velocity with respect to time. Relevant equations: $$\\vec{a} = \\frac{d\\vec{v}}{dt}$$ $$a_x = \\frac{dv_x}{dt}$$"
                },
                {
                  "id": "1.2.C.2",
                  "text": "Time-dependent functions and instantaneous values of position, velocity, and acceleration can be determined using differentiation and integration."
                }
              ]
            },
            {
              "code": "1.3.A",
              "name": "Describe the position, velocity, and acceleration of an object using representations of that object's motion.",
              "subtopics": [
                {
                  "id": "1.3.A.1",
                  "text": "Motion can be represented by motion diagrams, figures, graphs, equations, and narrative descriptions."
                },
                {
                  "id": "1.3.A.2",
                  "text": "For constant acceleration, three kinematic equations can be used to describe instantaneous linear motion in one dimension: $$v_{x} = v_{x0} + a_{x}t$$ $$x = x_{0} + v_{x0}t + \\frac{1}{2}a_{x}t^{2}$$ $$v_{x}^{2} = v_{x0}^{2} + 2a_{x}(x - x_{0})$$ Note: The equations above are written to indicate motion in the x-direction, but these equations can be used in any single dimension as appropriate."
                },
                {
                  "id": "1.3.A.3",
                  "text": "Near the surface of Earth, the vertical acceleration caused by the force of gravity is downward, constant, and has a measured value approximately equal to $$a_g = g \\approx 10 \\text{ m/s}^2$$ ."
                },
                {
                  "id": "1.3.A.4",
                  "text": "Graphs of position, velocity, and acceleration as functions of time can be used to find the relationships between those quantities."
                }
              ]
            },
            {
              "code": "1.4.A",
              "name": "Describe the reference frame of a given observer.",
              "subtopics": [
                {
                  "id": "1.4.A.1",
                  "text": "The choice of reference frame will determine the direction and magnitude of quantities measured by an observer in that reference frame."
                }
              ]
            },
            {
              "code": "1.4.B",
              "name": "Describe the motion of objects as measured by observers in different inertial reference frames.",
              "subtopics": [
                {
                  "id": "1.4.A.1",
                  "text": "The choice of reference frame will determine the direction and magnitude of quantities measured by an observer in that reference frame."
                },
                {
                  "id": "1.4.B.1",
                  "text": "Measurements from a given reference frame may be converted to measurements from another reference frame."
                },
                {
                  "id": "1.4.B.2",
                  "text": "The observed velocity of an object results from the combination of the object's velocity and the velocity of the observer's reference frame."
                },
                {
                  "id": "1.4.B.2.i",
                  "text": "Combining the motion of an object and the motion of an observer in a given reference frame involves the addition or subtraction of vectors"
                },
                {
                  "id": "1.4.B.2.ii",
                  "text": "The acceleration of any object is the same as measured from all inertial reference frames"
                }
              ]
            },
            {
              "code": "1.5.A",
              "name": "Describe the motion of an object moving in two or three dimensions.",
              "subtopics": [
                {
                  "id": "1.5.A.1",
                  "text": "Motion in two or three dimensions can be analyzed using one-dimensional kinematic relationships if the motion is separated into components."
                },
                {
                  "id": "1.5.A.2",
                  "text": "Velocity and acceleration may be different in each dimension and may be nonuniform. Motion in one dimension may be changed without causing a change in a perpendicular dimension."
                },
                {
                  "id": "1.5.A.4",
                  "text": "Projectile motion is a special case of twodimensional motion that has zero acceleration in one dimension and constant, nonzero acceleration in the second dimension."
                }
              ]
            }
          ]
        },
        {
          "code": "APPC.2",
          "name": "Force and Translational Dynamics",
          "objectives": [
            {
              "code": "2.1.A",
              "name": "Describe the properties and interactions of a system.",
              "subtopics": [
                {
                  "id": "2.1.A.1",
                  "text": "System properties are determined by the interactions between objects within the"
                },
                {
                  "id": "2.1.A.2",
                  "text": "If the properties or interactions of the constituent objects within a system are not important in modeling the behavior of the macroscopic system, the system can itself be treated as a single object. Systems may allow interactions between constituent parts of the system and the environment, which may result in the transfer of energy or mass. Individual objects within a chosen system may behave differently from each other as well as from the system as a whole. The internal structure of a system affects the analysis of that system. As variables external to a system are changed, the system's substructure may change."
                }
              ]
            },
            {
              "code": "2.1.B",
              "name": "Describe the location of a system's center of mass with respect to the system's constituent parts.",
              "subtopics": [
                {
                  "id": "2.1.B.1",
                  "text": "For objects or systems with symmetrical mass distributions, the center of mass is located on lines of symmetry."
                },
                {
                  "id": "2.1.B.2",
                  "text": "The location of a system's center of mass along a given axis can be calculated using the equation $$\\vec{x}_{\\rm cm} = \\frac{\\sum m_i \\vec{x}_i}{\\sum m_i}$$ For a nonuniform solid that can be considered as a collection of differential masses, dm, the solid's center of mass can be calculated using the equation $$\\vec{r}_{\\rm cm} = \\frac{\\int \\vec{r} \\, dm}{\\int dm}.$$"
                },
                {
                  "id": "2.1.B.3.i",
                  "text": "The linear mass density of a rod or other linear rigid body is the derivative of the rod's mass with respect to the position of the differential mass element on the rigid body. Relevant equation: $$\\lambda = \\frac{d}{d\\ell} m(\\ell)$$"
                },
                {
                  "id": "2.1.B.3.ii",
                  "text": "If a function of mass density is given for a solid, the total mass can be determined by integrating the mass density over the length (one dimension), area (two dimensions), or volume (three dimensions) of the solid. For example: $$M_{\\text{total}} = \\int \\rho(r) dV$$"
                },
                {
                  "id": "2.1.B.4",
                  "text": "A system can be modeled as a singular object that is located at the system's center of mass. Force and Translational Dynamics"
                }
              ]
            },
            {
              "code": "2.2.A",
              "name": "Describe a force as an interaction between two objects or systems.",
              "subtopics": [
                {
                  "id": "2.2.A.1",
                  "text": "Forces are vector quantities that describe the interactions between objects or systems."
                },
                {
                  "id": "2.2.A.1.i",
                  "text": "A force exerted on an object or system is always due to the interaction of that object or system with another object or system."
                },
                {
                  "id": "2.2.A.1.ii",
                  "text": "An object or system cannot exert a net force on itself."
                },
                {
                  "id": "2.2.A.2",
                  "text": "Contact forces describe the interaction of an object or system touching another object or system and are macroscopic effects of interatomic electric forces."
                }
              ]
            },
            {
              "code": "2.2.B",
              "name": "Describe the forces exerted on an object or system using a free-body diagram.",
              "subtopics": [
                {
                  "id": "2.2.B.1",
                  "text": "Free-body diagrams are useful tools for visualizing forces being exerted on a single object or system and for determining the equations that represent a physical situation."
                },
                {
                  "id": "2.2.B.2",
                  "text": "The free-body diagram of an object or system shows each of the forces exerted on the object or system by the environment."
                },
                {
                  "id": "2.2.B.3",
                  "text": "Forces exerted on an object or system are represented as vectors originating from the representation of the center of mass, such as a dot. A system is treated as though all of its mass is located at the center of mass."
                },
                {
                  "id": "2.2.B.4",
                  "text": "A coordinate system with one axis parallel to the direction of acceleration of the object or system simplifies the translation from freebody diagram to algebraic representation. For example, in a free-body diagram of an object on an inclined plane, it is useful to set one axis parallel to the surface of the incline."
                }
              ]
            },
            {
              "code": "2.3.A",
              "name": "Describe the interaction of two objects or systems using Newton's third law and a representation of paired forces exerted on each object or system.",
              "subtopics": [
                {
                  "id": "2.3.A.1",
                  "text": "Newton's third law describes the interaction of two objects or systems in terms of the paired forces that each exerts on the other. $$\\vec{F}_{A \\text{ on } B} = -\\vec{F}_{B \\text{ on } A}$$ Interactions between objects within a system (internal forces) do not influence the motion of a system's center of mass."
                },
                {
                  "id": "2.3.A.2",
                  "text": "Tension is the macroscopic net result of forces that infinitesimal segments of a string, cable, chain, or similar system exert on each other in response to an external force."
                },
                {
                  "id": "2.3.A.3",
                  "text": "An ideal string has negligible mass and does not stretch when under tension."
                },
                {
                  "id": "2.3.A.3.ii",
                  "text": "The tension in an ideal string is the same at all points within the string."
                },
                {
                  "id": "2.3.A.3.iii",
                  "text": "In a string with nonnegligible mass, tension may not be the same at all points within the string. An ideal pulley is a pulley that has negligible mass and rotates about an axle through its center of mass with negligible friction."
                }
              ]
            },
            {
              "code": "2.4.A",
              "name": "Describe the conditions under which a system's velocity remains constant.",
              "subtopics": [
                {
                  "id": "2.4.A.1",
                  "text": "The net force on a system is the vector sum of all forces exerted on the system."
                },
                {
                  "id": "2.4.A.2",
                  "text": "Translational equilibrium is the configuration of forces such that the net force exerted on a system is zero. Derived equation: $$\\sum \\vec{F}_i = 0$$ Newton's first law states that if the net force exerted on a system is zero, the velocity of that system will remain constant."
                },
                {
                  "id": "2.4.A.4",
                  "text": "Forces may be balanced in one dimension but unbalanced in another. The system's velocity will change only in the direction of the unbalanced force."
                },
                {
                  "id": "2.4.A.5",
                  "text": "An inertial reference frame is one from which an observer would verify Newton's first law of motion."
                }
              ]
            },
            {
              "code": "2.5.A",
              "name": "Describe the conditions under which a system's velocity changes.",
              "subtopics": [
                {
                  "id": "2.5.A.1",
                  "text": "Unbalanced forces are a configuration of forces such that the net force exerted on a system is not equal to zero."
                },
                {
                  "id": "2.5.A.2",
                  "text": "Newton's second law of motion states that the acceleration of a system's center of mass has a magnitude proportional to the magnitude of the net force exerted on the system and is in the same direction as that net force. Relevant equation: $$\\vec{a}_{\\text{sys}} = \\frac{\\sum \\vec{F}}{m_{\\text{sys}}} = \\frac{\\vec{F}_{\\text{net}}}{m_{\\text{sys}}}$$ The velocity of a system's center of mass will only change if a nonzero net external force is exerted on that system."
                }
              ]
            },
            {
              "code": "2.6.A",
              "name": "Describe the gravitational interaction between two objects or systems with mass.",
              "subtopics": [
                {
                  "id": "2.6.A.1",
                  "text": "Newton's law of universal gravitation describes the gravitational force between two objects or systems as directly proportional to each of their masses and inversely proportional to the square of the distance between the systems' centers of mass. Relevant equation: $$\\left| \\vec{F}_{g} \\right| = G \\frac{m_{1} m_{2}}{r^{2}}$$ The gravitational force is attractive. The gravitational force is always exerted along the line connecting the center of mass of the two interacting systems. The gravitational force on a system can be considered to be exerted on the system's center of mass. A field models the effects of a noncontact force exerted on an object at various positions in space."
                }
              ]
            },
            {
              "code": "2.6.B",
              "name": "Describe situations in which the gravitational force can be considered constant.",
              "subtopics": [
                {
                  "id": "2.6.B.1",
                  "text": "If the gravitational force between two systems' centers of mass has a negligible change as the relative position of the two systems changes, the gravitational force can be considered constant at all points between the initial and final positions of the systems."
                },
                {
                  "id": "2.6.B.2",
                  "text": "Near the surface of Earth, the strength of the gravitational field is $$g \\approx 10 \\text{ N/kg}.$$"
                }
              ]
            },
            {
              "code": "2.6.C",
              "name": "Describe the conditions under which the magnitude of a system's apparent weight is different from the magnitude of the gravitational force exerted on that system.",
              "subtopics": [
                {
                  "id": "2.6.C.1",
                  "text": "The magnitude of the apparent weight of a system is the magnitude of the normal force exerted on the system."
                },
                {
                  "id": "2.6.C.2",
                  "text": "If the system is accelerating, the apparent weight of the system is not equal to the magnitude of the gravitational force exerted on the system."
                },
                {
                  "id": "2.6.C.3",
                  "text": "A system appears weightless when there are no forces exerted on the system or when the force of gravity is the only force exerted on the system."
                },
                {
                  "id": "2.6.C.4",
                  "text": "The equivalence principle states that an observer in a noninertial reference frame is unable to distinguish between an object's apparent weight and the gravitational force exerted on the object by a gravitational field."
                }
              ]
            },
            {
              "code": "2.6.D",
              "name": "Describe inertial and gravitational mass.",
              "subtopics": [
                {
                  "id": "2.6.D.1",
                  "text": "Objects have inertial mass, or inertia, a property that determines how much an object's motion resists changes when interacting with another object."
                },
                {
                  "id": "2.6.D.2",
                  "text": "Gravitational mass is related to the force of attraction between two systems with mass."
                },
                {
                  "id": "2.6.D.3",
                  "text": "Inertial mass and gravitational mass have been experimentally verified to be equivalent."
                }
              ]
            },
            {
              "code": "2.6.E",
              "name": "Describe the gravitational force exerted on an object by a uniform spherical distribution of mass.",
              "subtopics": [
                {
                  "id": "2.6.E.1",
                  "text": "The net gravitational force exerted on an object by a uniform spherical distribution of mass is the sum of the individual forces from small differential masses that comprise the distribution."
                },
                {
                  "id": "2.6.E.2",
                  "text": "Newton's shell theorem describes the net gravitational force exerted on an object by a uniform spherical shell of mass."
                },
                {
                  "id": "2.6.E.2.i",
                  "text": "The net gravitational force exerted on an object inside a thin spherical shell is zero. The net gravitational force exerted on an object outside a thin spherical shell can be determined by treating the shell as a single massive object located at the center of the shell."
                },
                {
                  "id": "2.6.E.2.ii",
                  "text": "The net gravitational force exerted on an object outside a thin spherical shell can be determined by treating the shell as a single massive object located at the center of the shell."
                },
                {
                  "id": "2.6.E.2.iii",
                  "text": "An object inside a sphere of uniform density experiences a net gravitational force from only a partial mass of the sphere."
                },
                {
                  "id": "2.6.E.2.iv",
                  "text": "The partial mass of a sphere that contributes to the net gravitational force exerted on an object within that sphere is the portion of the sphere's mass located a distance less than or equal to the object's distance from the center of the sphere and can be calculated using the density of the sphere. Derived equation: $$m_{\\text{partial}} = \\rho \\frac{4}{3} \\pi (r_{\\text{partial}})^3$$"
                },
                {
                  "id": "2.6.E.3",
                  "text": "The gravitational force exerted on an object within a uniform sphere can be shown to be proportional to the object's distance from the sphere's center. Derived equation: $$F_{g,partial} = -kr_{partial}$$"
                }
              ]
            },
            {
              "code": "2.7.A",
              "name": "Describe kinetic friction between two surfaces.",
              "subtopics": [
                {
                  "id": "2.7.A.1",
                  "text": "Kinetic friction occurs when two surfaces in contact move relative to each other. The kinetic friction force is exerted in a direction opposite the motion of each surface relative to the other surface. The force of friction between two surfaces does not depend on the size of the surface area of contact. The magnitude of the kinetic friction force exerted on an object is the product of the normal force the surface exerts on the object and the coefficient of kinetic friction. Relevant equation: $$\\left| \\vec{F}_{f,k} \\right| = \\left| \\mu_k \\vec{F}_N \\right|$$ The coefficient of kinetic friction depends on the material properties of the surfaces that are in contact."
                },
                {
                  "id": "2.7.A.2.ii",
                  "text": "Normal force is the perpendicular component of the force exerted on an object by the surface with which it is in contact; it is directed away from the surface."
                }
              ]
            },
            {
              "code": "2.7.B",
              "name": "Describe static friction between two surfaces.",
              "subtopics": [
                {
                  "id": "2.7.B.1",
                  "text": "Static friction may occur between the contacting surfaces of two objects that are not moving relative to each other."
                },
                {
                  "id": "2.7.B.2",
                  "text": "Static friction adopts the value and direction required to prevent an object from slipping or sliding on a surface. Relevant equation: $$\\left| \\vec{F}_{f,s} \\right| \\leq \\left| \\mu_s \\vec{F}_n \\right|$$"
                },
                {
                  "id": "2.7.B.2.i",
                  "text": "Slipping and sliding refer to situations in which two surfaces are moving relative to each other."
                },
                {
                  "id": "2.7.B.2.ii",
                  "text": "There exists a maximum value for which static friction will prevent an object from slipping on a given surface. Derived equation: $$F_{f,s,\\text{max}} = \\mu_s F_{\\text{N}}$$"
                },
                {
                  "id": "2.7.B.3",
                  "text": "The coefficient of static friction is typically greater than the coefficient of kinetic friction for a given pair of surfaces."
                }
              ]
            },
            {
              "code": "2.8.A",
              "name": "Describe the force exerted on an object by an ideal spring.",
              "subtopics": [
                {
                  "id": "2.8.A.1",
                  "text": "An ideal spring has negligible mass and exerts a force that is proportional to the change in its length as measured from its relaxed length. A nonideal spring either has nonnegligible mass or exerts a force that is not proportional to the change in its length as measured from its relaxed length."
                },
                {
                  "id": "2.8.A.2",
                  "text": "The magnitude of the force exerted by an ideal spring on an object is given by Hooke's law: $$\\vec{F}_{c} = -k\\Delta \\vec{x}$$"
                },
                {
                  "id": "2.8.A.3",
                  "text": "The force exerted on an object by a spring is always directed toward the equilibrium position of the object–spring system."
                }
              ]
            },
            {
              "code": "2.8.B",
              "name": "Describe the equivalent spring constant of a combination of springs exerting forces on an object.",
              "subtopics": [
                {
                  "id": "2.8.B.1",
                  "text": "A collection of springs that exert forces on an object may behave as though they were a single spring with an equivalent spring constant k subscript equivalent.."
                },
                {
                  "id": "2.8.B.1.i",
                  "text": "The inverse of the equivalent spring constant of a set of springs in series is equal to the sum of the inverses of the individual spring constants. Derived equation: $$\\frac{1}{k_{\\text{eq, series}}} = \\sum_{i} \\frac{1}{k_{i}} = \\frac{1}{k_{1}} + \\frac{1}{k_{2}} + \\dots$$"
                },
                {
                  "id": "2.8.B.1.ii",
                  "text": "The equivalent spring constant of a set of springs arranged in series is smaller than the smallest constituent spring constant. The equivalent spring constant of a set of springs arranged in parallel is the sum of the individual spring constants. Derived equation: $$k_{\\text{eq, parallel}} = \\sum_{i} k_{i} = k_{1} + k_{2} + \\dots$$"
                },
                {
                  "id": "2.8.B.1.iii",
                  "text": "The equivalent spring constant of a set of springs arranged in parallel is the sum of the individual spring constants. Derived equation: k s u bscript e q, parallel equals uppercase sigma subscript i end subscript k subscript i end subscript equals k subscript 1 end subscript plus k subscript 2 end subscript plus ellipsis."
                }
              ]
            },
            {
              "code": "2.9.A",
              "name": "Describe the motion of an object subject to a resistive force.",
              "subtopics": [
                {
                  "id": "2.9.A.1",
                  "text": "A resistive force is defined as a velocitydependent force in the opposite direction of an object's velocity, for example: $$\\vec{F}_r = -k\\vec{v}$$"
                },
                {
                  "id": "2.9.A.2",
                  "text": "Applying Newton's second law to an object upon which a resistive force is exerted results in a differential equation for velocity. Using the method of separation of variables, the velocity can be determined by integrating over the proper limits of integration. The acceleration or position of a moving object that is subject to a velocity-dependent force may be determined using initial conditions of the object and methods of calculus, once a function for velocity is determined. The position, velocity, and acceleration as functions of time of an object under the influence of a resistive force of the form $\\vec{F}_{x} = -k\\vec{v}$ are exponential and have asymptotes that are determined by the initial conditions of the object and the forces exerted on the object. Terminal velocity is defined as the maximum speed achieved by an object moving under the influence of a constant force and a resistive force that are exerted on the object in opposite directions. The terminal condition is reached when the net force exerted on the object is zero."
                }
              ]
            },
            {
              "code": "2.10.A",
              "name": "Describe the motion of an object traveling in a circular path.",
              "subtopics": [
                {
                  "id": "2.10.A.1",
                  "text": "Centripetal acceleration is the component of an object's acceleration directed toward the center of the object's circular path."
                },
                {
                  "id": "2.10.A.1.i",
                  "text": "The magnitude of centripetal acceleration for an object moving in a circular path is the ratio of the object's tangential speed squared to the radius of the circular path. Relevant equation: $$a_c = \\frac{v^2}{r}$$"
                },
                {
                  "id": "2.10.A.1.ii",
                  "text": "Centripetal acceleration is directed toward the center of an object's circular path."
                },
                {
                  "id": "2.10.A.2",
                  "text": "Centripetal acceleration can result from a single force, more than one force, or components of forces that are exerted on an object in circular motion."
                },
                {
                  "id": "2.10.A.2.i",
                  "text": "At the top of a vertical, circular loop, an object requires a minimum speed to maintain circular motion. At this point, and with this minimum velocity, the gravitational force is the only force that causes the centripetal acceleration. Derived equation: $$v = \\sqrt{gr}$$"
                },
                {
                  "id": "2.10.A.2.ii",
                  "text": "Components of the static friction force and the normal force can contribute to the net force producing centripetal acceleration of an object traveling in a circle on a banked surface."
                },
                {
                  "id": "2.10.A.2.iii",
                  "text": "A component of tension contributes to the net force producing centripetal acceleration experienced by a conical pendulum. Tangential acceleration is the rate at which an object's speed changes and is directed tangent to the object's circular path."
                },
                {
                  "id": "2.10.A.3",
                  "text": "Tangential acceleration is the rate at which an object’s speed changes and is directed tangent to the object’s circular path."
                },
                {
                  "id": "2.10.A.4",
                  "text": "The net acceleration of an object moving in a circle is the vector sum of the centripetal acceleration and tangential acceleration."
                },
                {
                  "id": "2.10.A.5",
                  "text": "The revolution of an object traveling in a circular path at a constant speed (uniform circular motion) can be described using period and frequency. The time to complete one full circular path, one full rotation, or a full cycle of oscillatory motion is defined as period, T."
                },
                {
                  "id": "2.10.A.5.i",
                  "text": "The time to complete one full circular path, one full rotation, or a full cycle of oscillatory motion\u0003is\u0003defined\u0003as\u0003period,\u0003T."
                },
                {
                  "id": "2.10.A.5.ii",
                  "text": "The rate at which an object is completing revolutions is defined as frequency, f. Relevant equation: $$T = \\frac{1}{f}$$"
                },
                {
                  "id": "2.10.A.5.iii",
                  "text": "For an object traveling at a constant speed in a circular path, the period is given by the derived equation $$T = \\frac{2\\pi r}{v}$$"
                }
              ]
            },
            {
              "code": "2.10.B",
              "name": "Describe circular orbits using Kepler's third law.",
              "subtopics": [
                {
                  "id": "2.10.B.1",
                  "text": "For a satellite in circular orbit around a central body, the satellite's centripetal acceleration is caused only by gravitational attraction. The period and radius of the circular orbit are related to the mass of the central body. Derived equation: $$T^2 = \\frac{4\\pi^2}{GM}R^3$$"
                }
              ]
            }
          ]
        },
        {
          "code": "APPC.3",
          "name": "Work, Energy, and Power",
          "objectives": [
            {
              "code": "3.1.A",
              "name": "Describe the translational kinetic energy of an object in terms of the object's mass and velocity.",
              "subtopics": [
                {
                  "id": "3.1.A.1",
                  "text": "An object's translational kinetic energy is given by the equation $$K = \\frac{1}{2}mv^2.$$"
                },
                {
                  "id": "3.1.A.2",
                  "text": "Translational kinetic energy is a scalar quantity."
                }
              ]
            },
            {
              "code": "3.2.A",
              "name": "Describe the work done on an object or system by a given force or collection of forces.",
              "subtopics": [
                {
                  "id": "3.2.A.1",
                  "text": "Work is the amount of energy transferred into or out of a system by a force exerted on that system over a distance."
                },
                {
                  "id": "3.2.A.1.i",
                  "text": "The work done by a conservative force exerted on a system is path-independent and only depends on the initial and final configurations of that system."
                },
                {
                  "id": "3.2.A.1.ii",
                  "text": "The work done by a conservative force on a system—or the change in the potential energy of the system—will be zero if the system returns to its initial configuration."
                },
                {
                  "id": "3.2.A.1.iii",
                  "text": "Potential energies are associated only with conservative forces."
                },
                {
                  "id": "3.2.A.1.iv",
                  "text": "The work done by a nonconservative force is path-dependent."
                },
                {
                  "id": "3.2.A.1.v",
                  "text": "The most common nonconservative forces are friction and air resistance."
                },
                {
                  "id": "3.2.A.2",
                  "text": "Work is a scalar quantity that may be positive, negative, or zero."
                },
                {
                  "id": "3.2.A.3",
                  "text": "The work done on an object by a variable force is calculated using $$W = \\int_{a}^{b} \\vec{F}(r) \\cdot d\\vec{r}$$ where the integral is taken over the path from point a to point b."
                },
                {
                  "id": "3.2.A.3.i",
                  "text": "The dot product between two vectors, $\\vec{A}$ and $\\vec{B}$ , results in a scalar quantity of magnitude $$\\vec{A} \\cdot \\vec{B} = AB\\cos\\theta$$ ."
                },
                {
                  "id": "3.2.A.3.ii",
                  "text": "Only the component of the force exerted on a system that is parallel to the displacement of the point of application of the force will change the system's total energy."
                },
                {
                  "id": "3.2.A.3.iii",
                  "text": "If the component of the force exerted on a system that is parallel to the displacement is constant, the work done on the system by the force is given by the derived equation $$W = F_{\\parallel}d = Fd\\cos\\theta$$ ."
                },
                {
                  "id": "3.2.A.3.iv",
                  "text": "The component of the force exerted on a system perpendicular to the direction of the displacement of the system's center of mass can change the direction of the system's motion without changing the system's kinetic energy."
                },
                {
                  "id": "3.2.A.4",
                  "text": "The work–energy theorem states that the change in an object's kinetic energy is equal to the sum of the work (net work) being done by all forces exerted on the object. Relevant equation: $$\\Delta K = \\sum W_i = \\sum F_{\\parallel,i} d_i$$"
                },
                {
                  "id": "3.2.A.4.i",
                  "text": "An external force may change the configuration of a system. The component of the external force parallel to the displacement times the displacement of the point of application of the force gives the change in kinetic energy of the system. #"
                },
                {
                  "id": "3.2.A.4.ii",
                  "text": "If the system's center of mass and the point of application of the force move the same distance when a force is exerted on a system, then the system may be modeled as an object, and only the system's kinetic energy can change."
                },
                {
                  "id": "3.2.A.4.iii",
                  "text": "The energy dissipated by friction is typically equated to the force of friction times the length of the path over which the force is exerted. $$\\Delta E_{\\rm mech} = F_f d \\cos \\theta$$"
                },
                {
                  "id": "3.2.A.5",
                  "text": "Work is equal to the area under the curve of a graph of $F_{\\parallel}$ as a function of displacement."
                }
              ]
            },
            {
              "code": "3.3.A",
              "name": "Describe the potential energy of a system.",
              "subtopics": [
                {
                  "id": "3.3.A.1",
                  "text": "A system composed of two or more objects has potential energy if the objects within that system only interact with each other through conservative forces. Potential energy is a scalar quantity associated with the position of objects within a system. The definition of zero potential energy for a given system is a decision made by the observer considering the situation to simplify or otherwise assist in analysis. The relationship between conservative forces exerted on a system and the system's potential $$\\Delta U = -\\int_{a}^{b} \\vec{F}_{cf}(r) \\cdot d\\vec{r} \\cdot$$ The conservative forces exerted on a system in a single dimension can be determined using the slope of the system's potential energy with respect to position in that dimension; these forces point in the direction of decreasing potential energy. Relevant equation: $$F_{x} = -\\frac{dU(x)}{dx}$$"
                },
                {
                  "id": "3.3.A.6",
                  "text": "Graphs of a system's potential energy as a function of its position can be useful in determining physical properties of that system."
                }
              ]
            },
            {
              "code": "3.4.A",
              "name": "Describe the energies present in a system.",
              "subtopics": [
                {
                  "id": "3.4.A.1",
                  "text": "A system composed of only a single object can only have kinetic energy."
                },
                {
                  "id": "3.4.A.2",
                  "text": "A system that contains objects that interact via conservative forces or that can change its shape reversibly may have both kinetic and potential energies."
                }
              ]
            },
            {
              "code": "3.4.B",
              "name": "Describe the behavior of a system using conservation of mechanical energy principles.",
              "subtopics": [
                {
                  "id": "3.4.A.1",
                  "text": "A system composed of only a single object can only have kinetic energy."
                },
                {
                  "id": "3.4.A.2",
                  "text": "A system that contains objects that interact via conservative forces or that can change its shape reversibly may have both kinetic and potential energies."
                },
                {
                  "id": "3.4.B.1",
                  "text": "Mechanical energy is the sum of a system's kinetic and potential energies."
                },
                {
                  "id": "3.4.B.2",
                  "text": "Any change to a type of energy within a system must be balanced by an equivalent change of other types of energies within the system or by a transfer of energy between the system and its surroundings."
                },
                {
                  "id": "3.4.B.3",
                  "text": "A system may be selected so that the total energy of that system is constant."
                },
                {
                  "id": "3.4.B.4",
                  "text": "If the total energy of a system changes, that change will be equivalent to the energy transferred into or out of the system."
                }
              ]
            },
            {
              "code": "3.4.C",
              "name": "Describe how the selection of a system determines whether the energy of that system changes.",
              "subtopics": [
                {
                  "id": "3.4.C.1",
                  "text": "Energy is conserved in all interactions."
                },
                {
                  "id": "3.4.C.2",
                  "text": "If the work done on a selected system is zero and there are no nonconservative interactions within the system, the total mechanical energy of the system is constant."
                },
                {
                  "id": "3.4.C.3",
                  "text": "If the work done on a selected system is nonzero, energy is transferred between the system and the environment."
                }
              ]
            },
            {
              "code": "3.5.A",
              "name": "Describe the transfer of energy into, out of, or within a system in terms of power.",
              "subtopics": [
                {
                  "id": "3.5.A.1",
                  "text": "Power is the rate at which energy changes with respect to time, either by transfer into or out of a system or by conversion from one type to another within a system."
                },
                {
                  "id": "3.5.A.2",
                  "text": "Average power is the amount of energy being transferred or converted, divided by the time it took for that transfer or conversion to occur. Relevant equation: $$P_{\\rm avg} = \\frac{\\Delta E}{\\Delta t}$$"
                },
                {
                  "id": "3.5.A.3",
                  "text": "Because work is the change in energy of an object or system due to a force, average power is the total work done, divided by the time during which that work was done. Relevant equation: $$P_{\\text{avg}} = \\frac{W}{\\Lambda t}$$"
                },
                {
                  "id": "3.5.A.4",
                  "text": "The instantaneous power delivered to an object by a force is given by the equation $$P_{\\text{inst}} = \\frac{dW}{dt}$$"
                },
                {
                  "id": "3.5.A.5",
                  "text": "The instantaneous power delivered to an object by the component of a constant force parallel to the object's velocity can be described with the derived equation $$P_{\\text{inst}} = F_{\\parallel} v = F v \\cos \\theta.$$ # **AP PHYSICS C: MECHANICS** # UNIT 4 #"
                }
              ]
            }
          ]
        },
        {
          "code": "APPC.4",
          "name": "Linear Momentum",
          "objectives": [
            {
              "code": "4.1.A",
              "name": "Describe the linear momentum of an object or system.",
              "subtopics": [
                {
                  "id": "4.1.A.1",
                  "text": "Linear momentum is defined by the equation $\\vec{p} = m\\vec{v}$ ."
                },
                {
                  "id": "4.1.A.2",
                  "text": "Momentum is a vector quantity and has the same direction as the velocity."
                },
                {
                  "id": "4.1.A.3",
                  "text": "Momentum can be used to analyze collisions and explosions."
                },
                {
                  "id": "4.1.A.3.i",
                  "text": "A collision is a model for an interaction where the forces exerted between the involved objects in the system are much larger than the net external force exerted on those objects during the interaction."
                },
                {
                  "id": "4.1.A.3.ii",
                  "text": "As only the initial and final states of a collision are analyzed, the object model may be used to analyze collisions. An explosion is a model for an interaction in which forces internal to the system move objects within that system apart."
                }
              ]
            },
            {
              "code": "4.2.A",
              "name": "Describe the impulse delivered to an object or system.",
              "subtopics": [
                {
                  "id": "4.2.A.1",
                  "text": "The rate of change of a system's momentum is equal to the net external force exerted on that system. Relevant equation: $$\\vec{F}_{\\text{net}} = \\frac{d\\vec{p}}{dt}$$"
                },
                {
                  "id": "4.2.A.2",
                  "text": "Impulse is defined as the integral of a force exerted on an object or system over a time interval. Relevant equation: $$\\vec{J} = \\int_{t}^{t_2} \\vec{F}_{\\text{net}}(t) dt$$"
                },
                {
                  "id": "4.2.A.3",
                  "text": "Impulse is a vector quantity and has the same direction as the net force exerted on the system."
                },
                {
                  "id": "4.2.A.4",
                  "text": "The impulse delivered to a system by a net external force is equal to the area under the curve of a graph of the net external force exerted on the system as a function of time."
                },
                {
                  "id": "4.2.A.5",
                  "text": "The net external force exerted on a system is equal to the slope of a graph of the momentum of the system as a function of time."
                }
              ]
            },
            {
              "code": "4.2.B",
              "name": "Describe the relationship between the impulse exerted on an object or system and the change in momentum of the object or system.",
              "subtopics": [
                {
                  "id": "4.2.B.1",
                  "text": "Change in momentum is the difference between a system's final momentum and its initial momentum. Relevant equation: $$\\Delta \\vec{p} = \\vec{p} - \\vec{p}_0$$"
                },
                {
                  "id": "4.2.B.2",
                  "text": "The impulse–momentum theorem relates the impulse delivered to an object and the object's change in momentum."
                },
                {
                  "id": "4.2.B.2.i",
                  "text": "The impulse exerted on an object is equal to the object's change in momentum. Relevant equation: $$\\vec{J} = \\int_{t_1}^{t_2} \\vec{F}_{\\text{net}}(t) dt = \\Delta \\vec{p}$$"
                },
                {
                  "id": "4.2.B.2.ii",
                  "text": "Newton’s second law of motion is a direct result of the impulse–momentum theorem applied to systems with constant mass. v ec to r F s ub scr i p t n e t end subscript equals d vector p over d t equals m times d vector v over d t equals m vector a."
                },
                {
                  "id": "4.2.B.2.iii",
                  "text": "The impulse–momentum theorem also describes the behavior of a system in which the velocity is constant but the mass changes with respect to time. $$\\vec{F}_{\\text{net}} = \\frac{d\\vec{p}}{dt} = \\frac{dm}{dt}\\vec{v}$$"
                }
              ]
            },
            {
              "code": "4.3.A",
              "name": "Describe the behavior of a system using conservation of linear momentum.",
              "subtopics": [
                {
                  "id": "4.3.A.1",
                  "text": "A collection of objects with individual momenta can be described as one system with one center-of-mass velocity."
                },
                {
                  "id": "4.3.A.1.i",
                  "text": "For a collection of objects, the velocity of a system's center of mass can be calculated using the equation $$\\vec{v}_{\\rm cm} = \\frac{\\sum \\vec{p}_i}{\\sum m_i} = \\frac{\\sum (m_i \\vec{v}_i)}{\\sum m_i}.$$"
                },
                {
                  "id": "4.3.A.1.ii",
                  "text": "The velocity of a system's center of mass is constant in the absence of a net external force"
                },
                {
                  "id": "4.3.A.2",
                  "text": "The total momentum of a system is the sum of the momenta of the system's constituent parts."
                },
                {
                  "id": "4.3.A.3",
                  "text": "In the absence of net external forces, any change to the momentum of an object within a system must be balanced by an equivalent and opposite change of momentum elsewhere within the system. Any change to the momentum of a system is due to a transfer of momentum between the system and its surroundings."
                },
                {
                  "id": "4.3.A.3.i",
                  "text": "The impulse exerted by one object on a second object is equal and opposite to the impulse exerted by the second object on the first. This is a direct result of Newton's third law."
                }
              ]
            },
            {
              "code": "4.3.B",
              "name": "Describe how the selection of a system determines whether the momentum of that system changes.",
              "subtopics": [
                {
                  "id": "4.3.B.1",
                  "text": "Momentum is conserved in all interactions. If the net external force on the selected system is zero, the total momentum of the system is constant."
                },
                {
                  "id": "4.3.B.2",
                  "text": "If the net external force on the selected system is\u0003zero,\u0003the\u0003total\u0003momentum\u0003of\u0003the\u0003system\u0003is\u0003 constant."
                },
                {
                  "id": "4.3.B.3",
                  "text": "If the net external force on the selected system is nonzero, momentum is transferred between the system and the environment."
                }
              ]
            },
            {
              "code": "4.4.A",
              "name": "Describe whether an interaction between objects is elastic or inelastic.",
              "subtopics": [
                {
                  "id": "4.4.A.1",
                  "text": "An elastic collision between objects is one in which the initial kinetic energy of the system is equal to the final kinetic energy of the system."
                },
                {
                  "id": "4.4.A.2",
                  "text": "In an elastic collision, the final kinetic energies of each of the objects within the system may be different from their initial kinetic energies."
                },
                {
                  "id": "4.4.A.3",
                  "text": "An inelastic collision between objects is one in which the total kinetic energy of the system decreases."
                },
                {
                  "id": "4.4.A.4",
                  "text": "In an inelastic collision, some of the initial kinetic energy is not restored to kinetic energy but is transformed by nonconservative forces into other forms of energy."
                },
                {
                  "id": "4.4.A.5",
                  "text": "In a perfectly inelastic collision, the objects stick together and move with the same velocity after the collision."
                }
              ]
            }
          ]
        },
        {
          "code": "APPC.5",
          "name": "Torque and Rotational Dynamics",
          "objectives": [
            {
              "code": "5.1.A",
              "name": "Describe the rotation of a system with respect to time using angular displacement, angular velocity, and angular acceleration.",
              "subtopics": [
                {
                  "id": "5.1.A.1",
                  "text": "Angular displacement is the measurement of the angle, in radians, through which a point on a rigid system rotates about a specified axis. Relevant equation: $$\\Delta \\theta = \\theta - \\theta_0$$"
                },
                {
                  "id": "5.1.A.1.i",
                  "text": "A rigid system is one that holds its shape but in which different points on the system move in different directions during rotation. A rigid system cannot be modeled as an object."
                },
                {
                  "id": "5.1.A.1.ii",
                  "text": "One direction of angular displacement about an axis of rotation—clockwise or counterclockwise—is typically indicated as mathematically positive, with the other direction becoming mathematically negative."
                },
                {
                  "id": "5.1.A.1.iii",
                  "text": "If the rotation of a system about an axis may be well described using the motion of the system's center of mass, the system may be treated as a single object. For example, the rotation of Earth about its axis may be considered negligible when considering the revolution of Earth about the center of mass of the Earth-Sun system."
                }
              ]
            },
            {
              "code": "5.2.A",
              "name": "Describe the linear motion of a point on a rotating rigid system that corresponds to the rotational motion of that point, and vice versa.",
              "subtopics": [
                {
                  "id": "5.2.A.1",
                  "text": "For a point at a distance r from a fixed axis of rotation, the linear distance s traveled by the point as the system rotates through an angle $\\Delta\\theta$ is given by the equation $\\Delta s = r\\Delta\\theta$."
                },
                {
                  "id": "5.2.A.2",
                  "text": "Derived relationships of linear velocity and of the tangential component of acceleration to their respective angular quantities are given by the following equations: $s = r\\theta$ $v = r\\omega$ $a_T = r\\alpha$"
                },
                {
                  "id": "5.2.A.3",
                  "text": "For a rigid system, all points within that system have the same angular velocity and angular acceleration."
                }
              ]
            },
            {
              "code": "5.3.A",
              "name": "Identify the torques exerted on a rigid system.",
              "subtopics": [
                {
                  "id": "5.3.A.1",
                  "text": "Torque results only from the force component perpendicular to the position vector from the axis of rotation to the point of application of the force."
                },
                {
                  "id": "5.3.A.2",
                  "text": "The lever arm is the perpendicular distance from the axis of rotation to the line of action of the exerted force."
                }
              ]
            },
            {
              "code": "5.3.B",
              "name": "Describe the torques exerted on a rigid system.",
              "subtopics": [
                {
                  "id": "5.3.B.1",
                  "text": "Torques can be described using force diagrams."
                },
                {
                  "id": "5.3.B.1.i",
                  "text": "Force diagrams are similar to free-body diagrams and are used to analyze the torques exerted on a rigid system."
                },
                {
                  "id": "5.3.B.1.ii",
                  "text": "Similar to free-body diagrams, force diagrams represent the relative magnitude and direction of the forces exerted on a rigid system. Force diagrams also depict the location at which those forces are exerted relative to the axis of rotation."
                },
                {
                  "id": "5.3.B.2",
                  "text": "The torque exerted on a rigid system about a chosen pivot point by a given force is described by $\\vec{\\tau} = \\vec{r} \\times \\vec{F}$ ."
                },
                {
                  "id": "5.3.B.2.i",
                  "text": "The cross-product between two vectors, $\\vec{A}$ and $\\vec{B}$ , results in a vector quantity of magnitude $\\vec{A} \\times \\vec{B} = AB \\sin \\theta$ ."
                },
                {
                  "id": "5.3.B.2.ii",
                  "text": "The direction of the vector resulting from the cross-product of vectors $\\vec{A}$ and $\\vec{B}$ is perpendicular to both vectors $\\vec{A}$ and $\\vec{B}$ and therefore is normal to the plane defined by vectors $\\vec{A}$ and $\\vec{B}$ ."
                },
                {
                  "id": "5.3.B.2.iii",
                  "text": "The direction of the vector resulting from the cross-product of vectors $\\vec{A}$ and $\\vec{B}$ can be qualitatively determined by applying the appropriate right-hand rule."
                }
              ]
            },
            {
              "code": "5.4.A",
              "name": "Describe the rotational inertia of a rigid system relative to a given axis of rotation.",
              "subtopics": [
                {
                  "id": "5.4.A.1",
                  "text": "Rotational inertia measures a rigid system's resistance to changes in rotation and is related to the mass of the system and the distribution of that mass relative to the axis of rotation."
                },
                {
                  "id": "5.4.A.2",
                  "text": "The rotational inertia of an object rotating a perpendicular distance r from an axis is described by the equation $$I = mr^2$$."
                },
                {
                  "id": "5.4.A.3",
                  "text": "The total rotational inertia of a collection of objects about an axis is the sum of the rotational inertias of each object about that axis. $$I_{\\text{tot}} = \\sum I_i = \\sum m_i r_i^2$$"
                },
                {
                  "id": "5.4.A.4",
                  "text": "For a solid that can be considered as a collection of differential masses, dm, the solid's rotational inertia can be calculated using the equation $$I = \\int r^2 dm.$$ where r is the perpendicular distance from dm to the axis of rotation."
                }
              ]
            },
            {
              "code": "5.4.B",
              "name": "Describe the rotational inertia of a rigid system rotating about an axis that does not pass through the system's center of mass. 5.4.B.1 A rigid system's rotational inertia in a given plane is at a minimum when the rotational axis passes through the system's center of mass.",
              "subtopics": [
                {
                  "id": "5.4.B.2",
                  "text": "The parallel axis theorem uses the following equation to relate the rotational inertia of a rigid system about any axis that is parallel to an axis through its center of mass: $$I' = I_{\\rm cm} + Md^2$$"
                }
              ]
            },
            {
              "code": "5.5.A",
              "name": "5.5./ Describe the conditions under which a system's angular velocity remains constant.",
              "subtopics": [
                {
                  "id": "5.5.A.1",
                  "text": "A system may exhibit rotational equilibrium (constant angular velocity) without being in translational equilibrium, and vice versa."
                },
                {
                  "id": "5.5.A.1.i",
                  "text": "Free-body and force diagrams describe the nature of the forces and torques exerted on an object or rigid system."
                },
                {
                  "id": "5.5.A.1.ii",
                  "text": "Rotational equilibrium is a configuration of torques such that the net torque exerted on the system is zero. Relevant equation: $$\\sum \\tau_i = 0$$"
                },
                {
                  "id": "5.5.A.2",
                  "text": "A rotational corollary to Newton's second law states that if the torques exerted on a rigid system are not balanced, the system's angular velocity must be changing."
                }
              ]
            },
            {
              "code": "5.6.A",
              "name": "Describe the conditions under which a system's angular velocity changes.",
              "subtopics": [
                {
                  "id": "5.6.A.1",
                  "text": "Angular velocity changes when the net torque exerted on the object or system is not equal to 7ero"
                },
                {
                  "id": "5.6.A.2",
                  "text": "The rate at which the angular velocity of a rigid system changes is directly proportional to the net torque exerted on the rigid system and is in the same direction. The angular acceleration of the rigid system is inversely proportional to the rotational inertia of the rigid system. Relevant equation: $$\\alpha_{\\rm sys} = \\frac{\\Sigma \\tau}{I_{\\rm sys}} = \\frac{\\tau_{\\rm net}}{I_{\\rm sys}}$$ To fully describe a rotating rigid system, linear and rotational analyses may need to be performed independently."
                }
              ]
            }
          ]
        },
        {
          "code": "APPC.6",
          "name": "Energy and Momentum of Rotating Systems",
          "objectives": [
            {
              "code": "6.1.A",
              "name": "Describe the rotational kinetic energy of a rigid system in terms of the rotational inertia and angular velocity of that rigid system.",
              "subtopics": [
                {
                  "id": "6.1.A.1",
                  "text": "The rotational kinetic energy of an object or rigid system is related to the rotational inertia and angular velocity of the rigid system and is given by the equation $$K_{\\rm rot} = \\frac{1}{2}I\\omega^2$$ ."
                },
                {
                  "id": "6.1.A.1.i",
                  "text": "The rotational inertia of an object about a fixed axis can be used to show that the rotational kinetic energy of that object is equivalent to its translational kinetic energy, which is its total kinetic energy. The total kinetic energy of a rigid system is the sum of its rotational kinetic energy due to its rotation about its center of mass and the translational kinetic energy due to the linear motion of its center of mass."
                },
                {
                  "id": "6.1.A.2",
                  "text": "A rigid system can have rotational kinetic energy while its center of mass is at rest due to the individual points within the rigid system having linear speed and, therefore, kinetic energy."
                },
                {
                  "id": "6.1.A.3",
                  "text": "Rotational kinetic energy is a scalar quantity."
                }
              ]
            },
            {
              "code": "6.2.A",
              "name": "Describe the work done on a rigid system by a given torque or collection of torques.",
              "subtopics": [
                {
                  "id": "6.2.A.1",
                  "text": "A torque can transfer energy into or out of an object or rigid system if the torque is exerted over an angular displacement."
                },
                {
                  "id": "6.2.A.2",
                  "text": "The amount of work done on a rigid system by a torque is related to the magnitude of that torque and the angular displacement through which the rigid system rotates during the interval in which that torque is exerted. Relevant equation: $$W = \\int_{\\theta_1}^{\\theta_2} \\tau \\, d\\theta$$"
                },
                {
                  "id": "6.2.A.3",
                  "text": "Work done on a rigid system by a given torque can be found from the area under the curve of a graph of the torque as a function of angular position."
                }
              ]
            },
            {
              "code": "6.3.A",
              "name": "Describe the angular momentum of an object or rigid system.",
              "subtopics": [
                {
                  "id": "6.3.A.1",
                  "text": "The magnitude of the angular momentum of a rigid system about a specific axis can be described with the equation $L = I\\omega$ ."
                },
                {
                  "id": "6.3.A.2",
                  "text": "The angular momentum of an object about a given point is $$\\vec{L} = \\vec{r} \\times \\vec{p}$$ ."
                },
                {
                  "id": "6.3.A.2.i",
                  "text": "The selection of the axis about which an object is considered to rotate influences the determination of the angular momentum of that object."
                },
                {
                  "id": "6.3.A.2.ii",
                  "text": "The measured angular momentum of an object traveling in a straight line depends on the distance between the reference point and the object, the mass of the object, the speed of the object, and the angle between the radial distance and the velocity of the object."
                }
              ]
            },
            {
              "code": "6.3.B",
              "name": "Describe the angular impulse delivered to an object or rigid system by a torque.",
              "subtopics": [
                {
                  "id": "6.3.B.1",
                  "text": "Angular impulse is defined as the product of the torque exerted on an object or rigid system and the time interval during which the torque is exerted. Relevant equation: angular impluse = $\\int \\tau dt$"
                },
                {
                  "id": "6.3.B.2",
                  "text": "Angular impulse has the same direction as the torque imparting it."
                },
                {
                  "id": "6.3.B.3",
                  "text": "The angular impulse delivered to an object or rigid system by a torque can be found from the area under the curve of a graph of the torque as a function of time."
                }
              ]
            },
            {
              "code": "6.3.C",
              "name": "Relate the change in angular momentum of an object or rigid system to the angular impulse given to that object or rigid system.",
              "subtopics": [
                {
                  "id": "6.3.C.1",
                  "text": "The magnitude of the change in angular momentum can be described by comparing the magnitudes of the final and initial momenta of the object or rigid system. $$\\Delta L = L - L_0$$"
                },
                {
                  "id": "6.3.C.2",
                  "text": "A rotational form of the impulse–momentum theorem relates the angular impulse delivered to an object or rigid system and the change in angular momentum of that object or rigid system."
                },
                {
                  "id": "6.3.C.2.i",
                  "text": "The angular impulse exerted on an object or rigid system is equal to the change in angular momentum of that object or rigid system. Relevant equation: $$\\Delta L = \\int_{t_1}^{t_2} \\tau \\, dt$$"
                },
                {
                  "id": "6.3.C.2.ii",
                  "text": "The rotational form of the impulse momentum theorem is a direct result of Newton's second law of motion for cases in which rotational inertia is constant $$\\tau_{\\text{net}} = \\frac{dL}{dt} = I \\frac{d\\omega}{dt} = I\\alpha$$"
                },
                {
                  "id": "6.3.C.3",
                  "text": "The net torque exerted on an object or rigid system is equal to the slope of the graph of the angular momentum of an object as a function of time."
                },
                {
                  "id": "6.3.C.4",
                  "text": "The angular impulse delivered to an object or rigid system is equal to the area under the curve of a graph of the net external torque exerted on an object as a function of time."
                }
              ]
            },
            {
              "code": "6.4.A",
              "name": "Describe the behavior of a system using conservation of angular momentum.",
              "subtopics": [
                {
                  "id": "6.4.A.1",
                  "text": "The total angular momentum of a system about a rotational axis is the sum of the angular momenta of the system's constituent parts about that rotational axis. Any change to a system's angular momentum must be due to an interaction between the system and its surroundings."
                },
                {
                  "id": "6.4.A.2.i",
                  "text": "The angular impulse exerted by one object or system on a second object or system is egual and opposite to the angular impulse exerted by the second object or system on the first. This is a direct result of Newton's third law"
                },
                {
                  "id": "6.4.A.2.ii",
                  "text": "A system may be selected so that the total angular momentum of that system is constant."
                },
                {
                  "id": "6.4.A.2.iii",
                  "text": "The angular speed of a nonrigid system may change without the angular momentum of the system changing if the system changes shape by moving mass closer to or farther from the rotational axis If the total angular momentum of a system changes, that change will be equivalent to the angular impulse exerted on the system."
                }
              ]
            },
            {
              "code": "6.4.B",
              "name": "Describe how the selection of a system determines whether the angular momentum of that system changes.",
              "subtopics": [
                {
                  "id": "6.4.B.1",
                  "text": "Angular momentum is conserved in all interactions."
                },
                {
                  "id": "6.4.B.2",
                  "text": "If the net external torque exerted on a selected object or rigid system is zero, the total angular momentum of that system is constant."
                },
                {
                  "id": "6.4.B.3",
                  "text": "If the net external torque exerted on a selected object or rigid system is nonzero, angular momentum is transferred between the system and the environment."
                }
              ]
            },
            {
              "code": "6.5.A",
              "name": "Describe the kinetic energy of a system that has translational and rotational motion.",
              "subtopics": [
                {
                  "id": "6.5.A.1",
                  "text": "The total kinetic energy of a system is the sum of the system’s translational and rotational kinetic energies. Relevant equation: K sub s c r ipt t o t equals K subscript t r a n s end subscript plus K subscript r o t."
                }
              ]
            },
            {
              "code": "6.5.B",
              "name": "Describe the motion of a system that is rolling without slipping.",
              "subtopics": [
                {
                  "id": "6.5.B.1",
                  "text": "While rolling without slipping, the translational motion of a system's center of mass is related to the rotational motion of the system itself with the following equations: $$\\Delta x_{\\rm cm} = r\\Delta\\theta$$ $$v_{\\rm cm} = r\\omega$$ $$a_{\\rm cm} = r\\alpha$$"
                },
                {
                  "id": "6.5.B.2",
                  "text": "For ideal cases, rolling without slipping implies that the frictional force does not dissipate any energy from the rolling system. When slipping, the motion of a system's center of mass and the system's rotational motion cannot be directly related. When a rotating system is slipping relative to another surface, the point of application of the force of kinetic friction exerted on the system moves with respect to the surface, so the force of kinetic friction will dissipate energy from the system."
                }
              ]
            },
            {
              "code": "6.5.C",
              "name": "Describe the motion of a system that is rolling while slipping.",
              "subtopics": [
                {
                  "id": "6.5.C.1",
                  "text": "When slipping, the motion of a system’s center of mass and the system’s rotational motion cannot be directly related."
                },
                {
                  "id": "6.5.C.2",
                  "text": "When a rotating system is slipping relative to another surface, the point of application of the force of kinetic friction exerted on the system moves with respect to the surface, so the force of kinetic friction will dissipate energy from the system."
                }
              ]
            },
            {
              "code": "6.6.A",
              "name": "Describe the motions of a system consisting of two objects or systems interacting only via gravitational forces.",
              "subtopics": [
                {
                  "id": "6.6.A.1",
                  "text": "In a system consisting only of a massive central object and an orbiting satellite with mass that is negligible in comparison to the central object's mass, the motion of the central object itself is negligible."
                },
                {
                  "id": "6.6.A.2",
                  "text": "The motion of satellites in orbits is constrained by conservation laws."
                },
                {
                  "id": "6.6.A.2.i",
                  "text": "In circular orbits, the system's total mechanical energy, the system's gravitational potential energy, and the satellite's angular momentum and kinetic energy are constant."
                },
                {
                  "id": "6.6.A.2.ii",
                  "text": "In elliptical orbits, the system's total mechanical energy and the satellite's angular momentum are constant, but the system's gravitational potential energy and the satellite's kinetic energy can each change."
                },
                {
                  "id": "6.6.A.2.iii",
                  "text": "The gravitational potential energy of a system consisting of a satellite and a massive central object is defined to be zero when the satellite is an infinite distance from the central object. Relevant equation: $$U_g = -G \\frac{m_1 m_2}{r}$$"
                },
                {
                  "id": "6.6.A.3",
                  "text": "The total energy of a system consisting of a satellite orbiting a central object in a circular path can be written in terms of the gravitational potential energy of that system or the kinetic energy of the satellite. Derived equations: $$K = -\\frac{1}{2}U$$ $$E_{total} = \\frac{1}{2}U = -\\frac{GMm}{2r}$$"
                },
                {
                  "id": "6.6.A.4",
                  "text": "The escape velocity of a satellite is the satellite's velocity such that the mechanical energy of the satellite-central-object system is equal to zero."
                },
                {
                  "id": "6.6.A.4.i",
                  "text": "When the only force exerted on a satellite is gravity from a central object, a satellite that reaches escape velocity will move away from the central body until its speed reaches zero at an infinite distance from the central body."
                },
                {
                  "id": "6.6.A.4.ii",
                  "text": "The escape velocity of a satellite from a central body of mass M can be derived using conservation of energy laws. Derived equation: $$v_{\\rm esc} = \\sqrt{\\frac{2GM}{r}}$$"
                }
              ]
            }
          ]
        },
        {
          "code": "APPC.7",
          "name": "Oscillations",
          "objectives": [
            {
              "code": "7.1.A",
              "name": "Describe simple harmonic motion.",
              "subtopics": [
                {
                  "id": "7.1.A.1",
                  "text": "Simple harmonic motion is a special case of periodic motion."
                },
                {
                  "id": "7.1.A.2",
                  "text": "SHM results when the magnitude of the restoring force exerted on an object is proportional to that object's displacement from its equilibrium position. Derived equation: $ma_x = -k\\Delta x$"
                },
                {
                  "id": "7.1.A.2.i",
                  "text": "A restoring force is a force that is exerted in a direction opposite to the object's displacement from an equilibrium position."
                },
                {
                  "id": "7.1.A.2.ii",
                  "text": "An equilibrium position is a location at which the net force exerted on an object or system is zero."
                }
              ]
            },
            {
              "code": "7.2.A",
              "name": "Describe the frequency and period of an object exhibiting SHM.",
              "subtopics": [
                {
                  "id": "7.2.A.1",
                  "text": "The period of SHM is related to the angular frequency, $\\omega$ , of the object's motion by the following equation: $$T = \\frac{2\\pi}{\\omega} = \\frac{1}{f}$$"
                },
                {
                  "id": "7.2.A.1.i",
                  "text": "The period of an object-ideal-spring oscillator is given by the equation $$T_s = 2\\pi \\sqrt{\\frac{m}{k}}.$$"
                },
                {
                  "id": "7.2.A.1.ii",
                  "text": "The period of a simple pendulum displaced by a small angle is given by the equation $$T_p = 2\\pi \\sqrt{\\frac{l}{g}}.$$"
                }
              ]
            },
            {
              "code": "7.3.A",
              "name": "Describe the displacement, velocity, and acceleration of an object exhibiting SHM.",
              "subtopics": [
                {
                  "id": "7.3.A.1",
                  "text": "For an object exhibiting SHM, the displacement of that object measured from its equilibrium position can be represented by the equations $$x = A\\cos(2\\pi ft)$$ or $x = A\\sin(2\\pi ft)$ ."
                },
                {
                  "id": "7.3.A.1.i",
                  "text": "Minima, maxima, and zeros of displacement, velocity, and acceleration are features of harmonic motion."
                },
                {
                  "id": "7.3.A.1.ii",
                  "text": "Recognizing the positions or times at which the displacement, velocity, and acceleration for SHM have extrema or zeros can help in qualitatively describing the behavior of the motion."
                },
                {
                  "id": "7.3.A.2",
                  "text": "The position as a function of time for an object exhibiting SHM is a solution of the second-order differential equation derived from the application of Newton's second law. Derived equation: $$\\frac{d^2x}{dt^2} = -\\omega^2 x$$"
                },
                {
                  "id": "7.3.A.3",
                  "text": "Characteristics of SHM, such as velocity and acceleration, can be determined by or derived from the equation $x = A\\cos(\\omega t + \\phi)$ ."
                }
              ]
            },
            {
              "code": "7.4.A",
              "name": "Describe the mechanical energy of a system exhibiting SHM.",
              "subtopics": [
                {
                  "id": "7.4.A.1",
                  "text": "The total energy of a system exhibiting SHM is the sum of the system's kinetic and potential energies. Relevant equation: $$E_{\\text{total}} = U + K$$"
                },
                {
                  "id": "7.4.A.2",
                  "text": "Conservation of energy indicates that the total energy of a system exhibiting SHM is constant."
                },
                {
                  "id": "7.4.A.3",
                  "text": "The kinetic energy of a system exhibiting SHM is at a maximum when the system's potential energy is at a minimum."
                },
                {
                  "id": "7.4.A.4",
                  "text": "The potential energy of a system exhibiting SHM is at a maximum when the system's kinetic energy is at a minimum."
                },
                {
                  "id": "7.4.A.4.i",
                  "text": "The minimum kinetic energy of a system exhibiting SHM is zero."
                },
                {
                  "id": "7.4.A.4.ii",
                  "text": "hanging the amplitude of a system exhibiting SHM will change the maximum potential energy of the system and, therefore, the total energy of the system. Relevant equation for a spring-object system: $$E_{\\text{total}} = \\frac{1}{2}kA^2$$"
                }
              ]
            },
            {
              "code": "7.5.A",
              "name": "Describe the properties of a physical pendulum.",
              "subtopics": [
                {
                  "id": "7.5.A.1",
                  "text": "A physical pendulum is a rigid body that undergoes oscillation about a fixed axis."
                },
                {
                  "id": "7.5.A.2",
                  "text": "For small amplitudes of motion, the period of a physical pendulum is derived from the application of Newton's second law in rotational form. Relevant equation: $$T_{\\rm phys} = 2\\pi \\sqrt{\\frac{I}{mgd}}$$"
                },
                {
                  "id": "7.5.A.2.i",
                  "text": "When displaced from equilibrium, the gravitational force exerted on a physical pendulum's center of mass provides a restoring torque. Derived equation: $$\\tau = -mgd \\sin \\theta$$"
                },
                {
                  "id": "7.5.A.2.ii",
                  "text": "For small amplitudes of motion, the smallangle approximation can be applied to the restoring torque. Derived equation: $$\\sin\\theta \\approx \\theta$$ $$\\tau = -mgd\\theta = I\\alpha$$"
                },
                {
                  "id": "7.5.A.2.iii",
                  "text": "The small-angle approximation and Newton's second law in rotational form yield a second-order differential equation that describes SHM: $$\\frac{d^2\\theta}{dt^2} = -\\omega^2\\theta$$ Oscillations"
                },
                {
                  "id": "7.5.A.3",
                  "text": "A simple pendulum is a special case of physical pendulums in which the hanging object can be modeled as a point mass at a distance, l, from the pivot point. Relevant equation: $$T_p = 2\\pi \\sqrt{\\frac{\\ell}{g}}$$"
                },
                {
                  "id": "7.5.A.4",
                  "text": "A torsion pendulum is a case of SHM where the restoring torque is proportional to the angular displacement of a rotating system. For example, a horizontal disk that is suspended from a wire attached to its center of mass may undergo rotational oscillations about the wire in the horizontal plane. Derived equation: $$I\\alpha = -k\\Delta\\theta$$"
                }
              ]
            }
          ]
        }
      ]
    }
  },

  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  // ─────────────────────────────────────────────
  //  AP Calculus AB and BC (Marker markdown extracted from official CED)
  //  Unit codes remain APCBC.* for compatibility.
  //  Objectives are LO-level and subtopics are EK-level.
  // ─────────────────────────────────────────────
  "ap_calculus": {
    "ap calc": {
      "standards": [
        {
          "code": "APCBC.1",
          "name": "Limits and Continuity",
          "objectives": [
            {
              "code": "CHA-1.A",
              "name": "Interpret the rate of change at an instant in terms of average rates of change over intervals containing that instant.",
              "subtopics": [
                {
                  "id": "CHA-1.A.1",
                  "text": "Calculus uses limits to understand and model dynamic change."
                },
                {
                  "id": "CHA-1.A.2",
                  "text": "Because an average rate of change divides the change in one variable by the change in another, the average rate of change is undefined at a point where the change in the independent variable would be zero."
                },
                {
                  "id": "CHA-1.A.3",
                  "text": "The limit concept allows us to define instantaneous rate of change in terms of average rates of change."
                }
              ]
            },
            {
              "code": "FUN-1.A",
              "name": "Explain the behavior of a function on an interval using the Intermediate Value Theorem.",
              "subtopics": [
                {
                  "id": "FUN-1.A.1",
                  "text": "If f is a continuous function on the closed interval [a, b] and d is a number between f(a) and f(b), then the Intermediate Value Theorem guarantees that there is at least one number c between a and b, such that f(c) = d."
                }
              ]
            },
            {
              "code": "LIM-1.A",
              "name": "Represent limits analytically using correct notation.",
              "subtopics": [
                {
                  "id": "LIM-1.A.1",
                  "text": "Given a function f, the limit of f(x) as x approaches c is a real number R if f(x) can be made arbitrarily close to R by taking x sufficiently close to c (but not equal to c). If the limit exists and is a real number, then the common notation is $\\lim_{x \\to a} f(x) = R$ ."
                }
              ]
            },
            {
              "code": "LIM-1.B",
              "name": "Interpret limits expressed in analytic notation.",
              "subtopics": [
                {
                  "id": "LIM-1.B.1",
                  "text": "A limit can be expressed in multiple ways, including graphically, numerically, and analytically."
                }
              ]
            },
            {
              "code": "LIM-1.C",
              "name": "Estimate limits of functions.",
              "subtopics": [
                {
                  "id": "LIM-1.C.1",
                  "text": "The concept of a limit includes one sided limits."
                },
                {
                  "id": "LIM-1.C.2",
                  "text": "Graphical information about a function can be used to estimate limits."
                },
                {
                  "id": "LIM-1.C.3",
                  "text": "Because of issues of scale, graphical representations of functions may miss important function behavior."
                },
                {
                  "id": "LIM-1.C.4",
                  "text": "A limit might not exist for some functions at particular values of x. Some ways that the limit might not exist are if the function is unbounded, if the function is oscillating near this value, or if the limit from the left does not equal the limit from the right."
                },
                {
                  "id": "LIM-1.C.5",
                  "text": "Numerical information can be used to estimate limits."
                }
              ]
            },
            {
              "code": "LIM-1.D",
              "name": "Determine the limits of functions using limit theorems.",
              "subtopics": [
                {
                  "id": "LIM-1.D.1",
                  "text": "One-sided limits can be determined analytically or graphically."
                },
                {
                  "id": "LIM-1.D.2",
                  "text": "Limits of sums, differences, products, quotients, and composite functions can be found using limit theorems."
                }
              ]
            },
            {
              "code": "LIM-1.E",
              "name": "Determine the limits of functions using equivalent expressions for the function or the squeeze theorem.",
              "subtopics": [
                {
                  "id": "LIM-1.E.1",
                  "text": "It may be necessary or helpful to rearrange expressions into equivalent forms before evaluating limits."
                },
                {
                  "id": "LIM-1.E.2",
                  "text": "The limit of a function may be found by using the squeeze theorem."
                }
              ]
            },
            {
              "code": "LIM-2.A",
              "name": "Justify conclusions about continuity at a point using the definition.",
              "subtopics": [
                {
                  "id": "LIM-2.A.1",
                  "text": "Types of discontinuities include removable discontinuities, jump discontinuities, and discontinuities due to vertical asymptotes."
                },
                {
                  "id": "LIM-2.A.2",
                  "text": "A function f is continuous at x = c provided that f(c) exists, lim f x( ) x c exists, and lim f x( )= f c( ) x c ."
                }
              ]
            },
            {
              "code": "LIM-2.B",
              "name": "Determine intervals over which a function is continuous.",
              "subtopics": [
                {
                  "id": "LIM-2.B.1",
                  "text": "A function is continuous on an interval if the function is continuous at each point in the interval."
                },
                {
                  "id": "LIM-2.B.2",
                  "text": "Polynomial, rational, power, exponential, logarithmic, and trigonometric functions are continuous on all points in their domains."
                }
              ]
            },
            {
              "code": "LIM-2.C",
              "name": "Determine values of x or solve for parameters that make discontinuous functions continuous, if possible.",
              "subtopics": [
                {
                  "id": "LIM-2.C.1",
                  "text": "If the limit of a function exists at a discontinuity in its graph, then it is possible to remove the discontinuity by defining or redefining the value of the function at that point, so it equals the value of the limit of the function as x approaches that point."
                },
                {
                  "id": "LIM-2.C.2",
                  "text": "In order for a piecewise-defined function to be continuous at a boundary to the partition of its domain, the value of the expression defining the function on one side of the boundary must equal the value of the expression defining the other side of the boundary, as well as the value of the function at the boundary."
                }
              ]
            },
            {
              "code": "LIM-2.D",
              "name": "Interpret the behavior of functions using limits involving infinity.",
              "subtopics": [
                {
                  "id": "LIM-2.D.1",
                  "text": "The concept of a limit can be extended to include infinite limits."
                },
                {
                  "id": "LIM-2.D.2",
                  "text": "Asymptotic and unbounded behavior of functions can be described and explained using limits."
                },
                {
                  "id": "LIM-2.D.3",
                  "text": "The concept of a limit can be extended to include limits at infinity."
                },
                {
                  "id": "LIM-2.D.4",
                  "text": "Limits at infinity describe end behavior."
                },
                {
                  "id": "LIM-2.D.5",
                  "text": "Relative magnitudes of functions and their rates of change can be compared using limits."
                }
              ]
            }
          ]
        },
        {
          "code": "APCBC.2",
          "name": "Differentiation: Definition and Fundamental Properties",
          "objectives": [
            {
              "code": "CHA-2.B",
              "name": "Represent the derivative of a function as the limit of a difference quotient.",
              "subtopics": [
                {
                  "id": "CHA-2.B.1",
                  "text": "The difference quotients $\\frac{f(a+h)-f(a)}{h}$ and f(x) - f(a) express the average rate of change of a function over an interval."
                },
                {
                  "id": "CHA-2.B.3",
                  "text": "For y = f(x), notations for the derivative include $\\frac{dy}{dx}$ , f'(x), and y'. The derivative can be represented graphically, numerically, analytically, and verbally."
                }
              ]
            },
            {
              "code": "CHA-2.C",
              "name": "Determine the equation of a line tangent to a curve at a given point.",
              "subtopics": [
                {
                  "id": "CHA-2.C.1",
                  "text": "The derivative of a function at a point is the slope of the line tangent to a graph of the function at that point."
                }
              ]
            },
            {
              "code": "CHA-2.D",
              "name": "Estimate derivatives.",
              "subtopics": [
                {
                  "id": "CHA-2.D.1",
                  "text": "The derivative at a point can be estimated from information given in tables or graphs."
                },
                {
                  "id": "CHA-2.D.2",
                  "text": "Technology can be used to calculate or estimate the value of a derivative of a function at a point."
                }
              ]
            },
            {
              "code": "FUN-2.A",
              "name": "Connecting Differentiability and Continuity: Determining When Derivatives Do and Do Not Exist",
              "subtopics": [
                {
                  "id": "FUN-2.A.1",
                  "text": "If a function is differentiable at a point, then it is continuous at that point. In particular, if a point is not in the domain of f, then it is not in the domain of f'."
                },
                {
                  "id": "FUN-2.A.2",
                  "text": "A continuous function may fail to be differentiable at a point in its domain."
                }
              ]
            },
            {
              "code": "FUN-3.A",
              "name": "Calculate derivatives of familiar functions.",
              "subtopics": [
                {
                  "id": "FUN-3.A.1",
                  "text": "Direct application of the definition of the derivative and specific rules can be used to calculate the derivative for functions of the form fx x ( ) = r ."
                },
                {
                  "id": "FUN-3.A.2",
                  "text": "Sums, differences, and constant multiples of functions can be differentiated using derivative rules."
                },
                {
                  "id": "FUN-3.A.3",
                  "text": "The power rule combined with sum, difference, and constant multiple properties can be used to find the derivatives for polynomial functions."
                },
                {
                  "id": "FUN-3.A.4",
                  "text": "Specific rules can be used to find the derivatives for sine, cosine, exponential, and logarithmic functions. ENDURING UNDERSTANDING Reasoning with definitions, theorems, and properties can be used to determine"
                }
              ]
            },
            {
              "code": "FUN-3.B",
              "name": "Calculate derivatives of products and quotients of differentiable functions.",
              "subtopics": [
                {
                  "id": "FUN-3.B.1",
                  "text": "Derivatives of products of differentiable functions can be found using the product rule."
                },
                {
                  "id": "FUN-3.B.2",
                  "text": "Derivatives of quotients of differentiable functions can be found using the quotient rule."
                },
                {
                  "id": "FUN-3.B.3",
                  "text": "Rearranging tangent, cotangent, secant, and cosecant functions using identities allows differentiation using derivative rules."
                }
              ]
            },
            {
              "code": "LIM-3.A",
              "name": "Interpret a limit as a definition of a derivative.",
              "subtopics": [
                {
                  "id": "LIM-3.A.1",
                  "text": "In some cases, recognizing an expression for the definition of the derivative of a function whose derivative is known offers a strategy for determining a limit. Differentiation: Definition and Fundamental Properties"
                }
              ]
            }
          ]
        },
        {
          "code": "APCBC.3",
          "name": "Differentiation: Composite, Implicit, and Inverse Functions",
          "objectives": [
            {
              "code": "FUN-3.C",
              "name": "Calculate derivatives of compositions of differentiable functions.",
              "subtopics": [
                {
                  "id": "FUN-3.C.1",
                  "text": "The chain rule provides a way to differentiate composite functions."
                }
              ]
            },
            {
              "code": "FUN-3.D",
              "name": "Calculate derivatives of implicitly defined functions.",
              "subtopics": [
                {
                  "id": "FUN-3.D.1",
                  "text": "The chain rule is the basis for implicit differentiation."
                }
              ]
            },
            {
              "code": "FUN-3.E",
              "name": "Calculate derivatives of inverse and inverse trigonometric functions.",
              "subtopics": [
                {
                  "id": "FUN-3.E.1",
                  "text": "The chain rule and definition of an inverse function can be used to find the derivative of an inverse function, provided the derivative exists."
                },
                {
                  "id": "FUN-3.E.2",
                  "text": "The chain rule applied with the definition of an inverse function, or the formula for the derivative of an inverse function, can be used to find the derivatives of inverse trigonometric functions."
                }
              ]
            },
            {
              "code": "FUN-3.F",
              "name": "Determine higher order derivatives of a function.",
              "subtopics": [
                {
                  "id": "FUN-3.F.1",
                  "text": "Differentiating f' produces the second derivative f'', provided the derivative of f'exists; repeating this process produces higherorder derivatives of f."
                },
                {
                  "id": "FUN-3.F.2",
                  "text": "Higher-order derivatives are represented with a variety of notations. For y = f(x), notations for the second derivative include $\\frac{d^2y}{dx^2}$ , f''(x), and y''. Higher-order derivatives can be denoted $\\frac{d^n y}{dx^n}$ or $f^{(n)}(x)$ ."
                }
              ]
            }
          ]
        },
        {
          "code": "APCBC.4",
          "name": "Contextual Applications of Differentiation",
          "objectives": [
            {
              "code": "CHA-3.A",
              "name": "Interpret the meaning of a derivative in context.",
              "subtopics": [
                {
                  "id": "CHA-3.A.1",
                  "text": "The derivative of a function can be interpreted as the instantaneous rate of change with respect to its independent variable."
                },
                {
                  "id": "CHA-3.A.2",
                  "text": "The derivative can be used to express information about rates of change in applied contexts."
                },
                {
                  "id": "CHA-3.A.3",
                  "text": "The unit for f'(x) is the unit for f divided by the unit for x."
                }
              ]
            },
            {
              "code": "CHA-3.B",
              "name": "Calculate rates of change in applied contexts.",
              "subtopics": [
                {
                  "id": "CHA-3.B.1",
                  "text": "The derivative can be used to solve rectilinear motion problems involving position, speed, velocity, and acceleration."
                }
              ]
            },
            {
              "code": "CHA-3.C",
              "name": "Interpret rates of change in applied contexts.",
              "subtopics": [
                {
                  "id": "CHA-3.C.1",
                  "text": "The derivative can be used to solve problems involving rates of change in applied contexts."
                }
              ]
            },
            {
              "code": "CHA-3.D",
              "name": "Calculate related rates in applied contexts.",
              "subtopics": [
                {
                  "id": "CHA-3.D.1",
                  "text": "The chain rule is the basis for differentiating variables in a related rates problem with respect to the same independent variable."
                },
                {
                  "id": "CHA-3.D.2",
                  "text": "Other differentiation rules, such as the product rule and the quotient rule, may also be necessary to differentiate all variables with respect to the same independent variable."
                }
              ]
            },
            {
              "code": "CHA-3.E",
              "name": "Interpret related rates in applied contexts.",
              "subtopics": [
                {
                  "id": "CHA-3.E.1",
                  "text": "The derivative can be used to solve related rates problems; that is, finding a rate at which one quantity is changing by relating it to other quantities whose rates of change are known."
                }
              ]
            },
            {
              "code": "CHA-3.F",
              "name": "Approximate a value on a curve using the equation of a tangent line.",
              "subtopics": [
                {
                  "id": "CHA-3.F.1",
                  "text": "The tangent line is the graph of a locally linear approximation of the function near the point of tangency."
                },
                {
                  "id": "CHA-3.F.2",
                  "text": "For a tangent line approximation, the function's behavior near the point of tangency may determine whether a tangent line value is an underestimate or an overestimate of the corresponding function value."
                }
              ]
            },
            {
              "code": "LIM-4.A",
              "name": "Determine limits of functions that result in indeterminate forms.",
              "subtopics": [
                {
                  "id": "LIM-4.A.1",
                  "text": "When the ratio of two functions tends to $\\frac{0}{0}$ or $\\frac{\\infty}{\\infty}$ in the limit, such forms are said to be indeterminate."
                },
                {
                  "id": "LIM-4.A.2",
                  "text": "Limits of the indeterminate forms $\\frac{0}{0}$ or $\\frac{\\infty}{\\infty}$ may be evaluated using L'Hospital's Rule."
                }
              ]
            }
          ]
        },
        {
          "code": "APCBC.5",
          "name": "Analytical Applications of Differentiation",
          "objectives": [
            {
              "code": "FUN-1.B",
              "name": "Justify conclusions about functions by applying the Mean Value Theorem over an interval.",
              "subtopics": [
                {
                  "id": "FUN-1.B.1",
                  "text": "If a function f is continuous over the interval [a, b] and differentiable over the interval (a, b), then the Mean Value Theorem guarantees a point within that open interval where the instantaneous rate of change equals the average rate of change over the interval."
                }
              ]
            },
            {
              "code": "FUN-1.C",
              "name": "Extreme Value Theorem, Global Versus Local Extrema, and Critical Points",
              "subtopics": [
                {
                  "id": "FUN-1.C.1",
                  "text": "If a function f is continuous over the interval (a, b), then the Extreme Value Theorem guarantees that f has at least one minimum value and at least one maximum value on [a, b]. A point on a function where the first derivative equals zero or fails to exist is a critical point of the function."
                },
                {
                  "id": "FUN-1.C.3",
                  "text": "All local (relative) extrema occur at critical points of a function, though not all critical points are local extrema."
                }
              ]
            },
            {
              "code": "FUN-4.A",
              "name": "Justify conclusions about the behavior of a function based on the behavior of its derivatives.",
              "subtopics": [
                {
                  "id": "FUN-4.A.1",
                  "text": "The first derivative of a function can provide information about the function and its graph, including intervals where the function is increasing or decreasing."
                },
                {
                  "id": "FUN-4.A.2",
                  "text": "The first derivative of a function can determine the location of relative (local) extrema of the function."
                },
                {
                  "id": "FUN-4.A.3",
                  "text": "Absolute (global) extrema of a function on a closed interval can only occur at critical points or at endpoints."
                },
                {
                  "id": "FUN-4.A.4",
                  "text": "The graph of a function is concave up (down) on an open interval if the function's derivative is increasing (decreasing) on that interval."
                },
                {
                  "id": "FUN-4.A.5",
                  "text": "The second derivative of a function provides information about the function and its graph, including intervals of upward or downward concavity."
                },
                {
                  "id": "FUN-4.A.6",
                  "text": "The second derivative of a function may be used to locate points of inflection for the graph of the original function."
                },
                {
                  "id": "FUN-4.A.7",
                  "text": "The second derivative of a function may determine whether a critical point is the location of a relative (local) maximum or minimum."
                },
                {
                  "id": "FUN-4.A.8",
                  "text": "When a continuous function has only one critical point on an interval on its domain and the critical point corresponds to a relative (local) extremum of the function on the interval, then that critical point also corresponds to the absolute (global) extremum of the function on the interval."
                },
                {
                  "id": "FUN-4.A.9",
                  "text": "Key features of functions and their derivatives can be identified and related to their graphical, numerical, and analytical representations. Graphical, numerical, and analytical information from f' and f'' can be used to predict and explain the behavior of f."
                },
                {
                  "id": "FUN-4.A.11",
                  "text": "Key features of the graphs of f, f', and f\" are related to one another."
                }
              ]
            },
            {
              "code": "FUN-4.B",
              "name": "Calculate minimum and maximum values in applied contexts or analysis of functions.",
              "subtopics": [
                {
                  "id": "FUN-4.B.1",
                  "text": "The derivative can be used to solve optimization problems; that is, finding a minimum or maximum value of a function on a given interval."
                }
              ]
            },
            {
              "code": "FUN-4.C",
              "name": "Interpret minimum and maximum values calculated in applied contexts.",
              "subtopics": [
                {
                  "id": "FUN-4.C.1",
                  "text": "Minimum and maximum values of a function take on specific meanings in applied contexts."
                }
              ]
            },
            {
              "code": "FUN-4.D",
              "name": "Determine critical points of implicit relations.",
              "subtopics": [
                {
                  "id": "FUN-4.D.1",
                  "text": "A point on an implicit relation where the first derivative equals zero or does not exist is a critical point of the function."
                }
              ]
            },
            {
              "code": "FUN-4.E",
              "name": "Justify conclusions about the behavior of an implicitly defined function based on evidence from its derivatives.",
              "subtopics": [
                {
                  "id": "FUN-4.E.1",
                  "text": "Applications of derivatives can be extended to implicitly defined functions."
                },
                {
                  "id": "FUN-4.E.2",
                  "text": "Second derivatives involving implicit differentiation may be relations of x, y, and $\\frac{dy}{dx}$ ."
                }
              ]
            }
          ]
        },
        {
          "code": "APCBC.6",
          "name": "Integration and Accumulation of Change",
          "objectives": [
            {
              "code": "CHA-4.A",
              "name": "Interpret the meaning of areas associated with the graph of a rate of change in context.",
              "subtopics": [
                {
                  "id": "CHA-4.A.1",
                  "text": "The area of the region between the graph of a rate of change function and the x axis gives the accumulation of change."
                },
                {
                  "id": "CHA-4.A.2",
                  "text": "In some cases, accumulation of change can be evaluated by using geometry."
                },
                {
                  "id": "CHA-4.A.3",
                  "text": "If a rate of change is positive (negative) over an interval, then the accumulated change is positive (negative)."
                },
                {
                  "id": "CHA-4.A.4",
                  "text": "The unit for the area of a region defined by rate of change is the unit for the rate of change multiplied by the unit for the independent variable. Integration and Accumulation of Change"
                }
              ]
            },
            {
              "code": "FUN-5.A",
              "name": "Represent accumulation functions using definite integrals.",
              "subtopics": [
                {
                  "id": "FUN-5.A.1",
                  "text": "The definite integral can be used to define new functions."
                },
                {
                  "id": "FUN-5.A.2",
                  "text": "If f is a continuous function on an interval containing $$a$$ , then $\\frac{d}{dx} \\left( \\int_{a}^{x} f(t) dt \\right) = f(x)$ , where x is in the interval."
                },
                {
                  "id": "FUN-5.A.3",
                  "text": "Graphical, numerical, analytical, and verbal representations of a function f provide information about the function g defined as $$g(x) = \\int_{a}^{x} f(t) dt.$$"
                }
              ]
            },
            {
              "code": "FUN-6.A",
              "name": "Calculate a definite integral using areas and properties of definite integrals.",
              "subtopics": [
                {
                  "id": "FUN-6.A.1",
                  "text": "In some cases, a definite integral can be evaluated by using geometry and the connection between the definite integral and area."
                },
                {
                  "id": "FUN-6.A.2",
                  "text": "Properties of definite integrals include the integral of a constant times a function, the integral of the sum of two functions, reversal of limits of integration, and the integral of a function over adjacent intervals."
                },
                {
                  "id": "FUN-6.A.3",
                  "text": "The definition of the definite integral may be extended to functions with removable or jump discontinuities."
                }
              ]
            },
            {
              "code": "FUN-6.B",
              "name": "Evaluate definite integrals analytically using the Fundamental Theorem of Calculus.",
              "subtopics": [
                {
                  "id": "FUN-6.B.1",
                  "text": "An antiderivative of a function f is a function g whose derivative is f."
                },
                {
                  "id": "FUN-6.B.2",
                  "text": "If a function f is continuous on an interval containing a, the function defined by F x( )= ∫ x f t( )dt a is an antiderivative of f for x in the interval."
                },
                {
                  "id": "FUN-6.B.3",
                  "text": "If f is continuous on the interval [a, b] and F is an antiderivative of f, then ∫ b f x( )dx = a F b( )− F a( )."
                }
              ]
            },
            {
              "code": "FUN-6.C",
              "name": "Determine antiderivatives of functions and indefinite integrals, using knowledge of derivatives.",
              "subtopics": [
                {
                  "id": "FUN-6.C.1",
                  "text": "f x( )dx is an indefinite integral of the function f and can be expressed as f x() () dx = + F x C, where () () f x and C is any constant."
                },
                {
                  "id": "FUN-6.C.2",
                  "text": "Differentiation rules provide the foundation for finding antiderivatives."
                },
                {
                  "id": "FUN-6.C.3",
                  "text": "Many functions do not have closed-form antiderivatives."
                }
              ]
            },
            {
              "code": "FUN-6.D",
              "name": "For integrands requiring substitution or rearrangements into equivalent forms: - (a) Determine indefinite integrals. - (b) Evaluate definite integrals.",
              "subtopics": [
                {
                  "id": "FUN-6.D.1",
                  "text": "Substitution of variables is a technique for finding antiderivatives."
                },
                {
                  "id": "FUN-6.D.2",
                  "text": "For a definite integral, substitution of variables requires corresponding changes to the limits of integration."
                },
                {
                  "id": "FUN-6.D.3",
                  "text": "Techniques for finding antiderivatives include rearrangements into equivalent forms, such as long division and completing the square."
                }
              ]
            },
            {
              "code": "FUN-6.E",
              "name": "For integrands requiring integration by parts: - (a) Determine indefinite integrals. bc only - (b) Evaluate definite integrals. bc only",
              "subtopics": [
                {
                  "id": "FUN-6.E.1",
                  "text": "Integration by parts is a technique for finding antiderivatives. bc only"
                }
              ]
            },
            {
              "code": "FUN-6.F",
              "name": "For integrands requiring integration by linear partial fractions: - (a) Determine indefinite integrals. bc only - (b) Evaluate definite integrals. bc only",
              "subtopics": [
                {
                  "id": "FUN-6.F.1",
                  "text": "Some rational functions can be decomposed into sums of ratios of linear, nonrepeating factors to which basic integration techniques can be applied. bc only"
                }
              ]
            },
            {
              "code": "LIM-5.A",
              "name": "Approximate a definite integral using geometric and numerical methods.",
              "subtopics": [
                {
                  "id": "LIM-5.A.1",
                  "text": "Definite integrals can be approximated for functions that are represented graphically, numerically, analytically, and verbally."
                },
                {
                  "id": "LIM-5.A.2",
                  "text": "Definite integrals can be approximated using a left Riemann sum, a right Riemann sum, a midpoint Riemann sum, or a trapezoidal sum; approximations can be computed using either uniform or nonuniform partitions."
                },
                {
                  "id": "LIM-5.A.3",
                  "text": "Definite integrals can be approximated using numerical methods, with or without technology."
                },
                {
                  "id": "LIM-5.A.4",
                  "text": "Depending on the behavior of a function, it may be possible to determine whether an approximation for a definite integral is an underestimate or overestimate for the value of the definite integral."
                }
              ]
            },
            {
              "code": "LIM-5.B",
              "name": "Interpret the limiting case of the Riemann sum as a definite integral.",
              "subtopics": [
                {
                  "id": "LIM-5.B.1",
                  "text": "The limit of an approximating Riemann sum can be interpreted as a definite integral."
                },
                {
                  "id": "LIM-5.B.2",
                  "text": "A Riemann sum, which requires a partition of an interval I, is the sum of products, each of which is the value of the function at a point in a subinterval multiplied by the length of that subinterval of the partition."
                }
              ]
            },
            {
              "code": "LIM-5.C",
              "name": "Represent the limiting case of the Riemann sum as a definite integral.",
              "subtopics": [
                {
                  "id": "LIM-5.C.1",
                  "text": "The definite integral of a continuous function f over the interval [a, b], denoted by $\\int_{a}^{b} f(x)dx$ , is the limit of Riemann sums as the widths of the subintervals approach 0. That is, $$\\int_a^b f(x)dx = \\lim_{\\max \\Delta x_i \\to 0} \\sum_{i=1}^n f(x_i^) \\Delta x_i, \\text{ where } n \\text{ is}$$ the number of subintervals, $\\Delta x_i$ is the width of the ith subinterval, and $x_i^$ is a value in the ith subinterval."
                },
                {
                  "id": "LIM-5.C.2",
                  "text": "A definite integral can be translated into the limit of a related Riemann sum, and the limit of a Riemann sum can be written as a definite integral."
                }
              ]
            },
            {
              "code": "LIM-6.A",
              "name": "Evaluate an improper integral or determine that the integral diverges. BC ONLY",
              "subtopics": [
                {
                  "id": "LIM-6.A.1",
                  "text": "An improper integral is an integral that has one or both limits infinite or has an integrand that is unbounded in the interval of integration. BC ONLY"
                },
                {
                  "id": "LIM-6.A.2",
                  "text": "Improper integrals can be determined using limits of definite integrals. BC ONLY"
                }
              ]
            }
          ]
        },
        {
          "code": "APCBC.7",
          "name": "Differential Equations",
          "objectives": [
            {
              "code": "FUN-7.A",
              "name": "Interpret verbal statements of problems as differential equations involving a derivative expression.",
              "subtopics": [
                {
                  "id": "FUN-7.A.1",
                  "text": "Differential equations relate a function of an independent variable and the function's derivatives."
                }
              ]
            },
            {
              "code": "FUN-7.B",
              "name": "Verify solutions to differential equations.",
              "subtopics": [
                {
                  "id": "FUN-7.B.1",
                  "text": "Derivatives can be used to verify that a function is a solution to a given differential equation."
                },
                {
                  "id": "FUN-7.B.2",
                  "text": "There may be infinitely many general solutions to a differential equation."
                }
              ]
            },
            {
              "code": "FUN-7.C",
              "name": "Estimate solutions to differential equations.",
              "subtopics": [
                {
                  "id": "FUN-7.C.1",
                  "text": "A slope field is a graphical representation of a differential equation on a finite set of points in the plane."
                },
                {
                  "id": "FUN-7.C.2",
                  "text": "Slope fields provide information about the behavior of solutions to first-order differential equations."
                },
                {
                  "id": "FUN-7.C.3",
                  "text": "Solutions to differential equations are functions or families of functions."
                },
                {
                  "id": "FUN-7.C.4",
                  "text": "Euler's method provides a procedure for approximating a solution to a differential equation or a point on a solution curve. bc only"
                }
              ]
            },
            {
              "code": "FUN-7.D",
              "name": "Determine general solutions to differential equations.",
              "subtopics": [
                {
                  "id": "FUN-7.D.1",
                  "text": "Some differential equations can be solved by separation of variables."
                },
                {
                  "id": "FUN-7.D.2",
                  "text": "Antidifferentiation can be used to find general solutions to differential equations."
                }
              ]
            },
            {
              "code": "FUN-7.E",
              "name": "Determine particular solutions to differential equations.",
              "subtopics": [
                {
                  "id": "FUN-7.E.1",
                  "text": "A general solution may describe infinitely many solutions to a differential equation. There is only one particular solution passing through a given point."
                },
                {
                  "id": "FUN-7.E.2",
                  "text": "The function F defined by $F(x) = y_0 + \\int_a^x f(t) dt$ is a particular solution to the differential equation $$\\frac{dy}{dx} = f(x)$$ , satisfying $F(a) = y_0$ ."
                },
                {
                  "id": "FUN-7.E.3",
                  "text": "Solutions to differential equations may be subject to domain restrictions."
                }
              ]
            },
            {
              "code": "FUN-7.F",
              "name": "Interpret the meaning of a differential equation and its variables in context",
              "subtopics": [
                {
                  "id": "FUN-7.F.1",
                  "text": "Specific applications of finding general and particular solutions to differential equations include motion along a line and exponential growth and decay."
                },
                {
                  "id": "FUN-7.F.2",
                  "text": "The model for exponential growth and decay that arises from the statement \"The rate of change of a quantity is proportional to the size of the quantity\" is $\\frac{dy}{dt} = ky$ ."
                }
              ]
            },
            {
              "code": "FUN-7.G",
              "name": "Determine general and particular solutions for problems involving differential equations in context.",
              "subtopics": [
                {
                  "id": "FUN-7.G.1",
                  "text": "The exponential growth and decay model, $\\frac{dy}{dt} = ky$ , with initial condition $y = y_0$ when t = 0, has solutions of the form $y = y_0 e^{kt}$ . Differential Equations"
                }
              ]
            },
            {
              "code": "FUN-7.H",
              "name": "Interpret the meaning of the logistic growth model in context. bc only",
              "subtopics": [
                {
                  "id": "FUN-7.H.1",
                  "text": "The model for logistic growth that arises from the statement \"The rate of change of a quantity is jointly proportional to the size of the quantity and the difference between the quantity and the carrying capacity\" is $$\\frac{dy}{dt} = ky(a-y)$$ . BC ONLY"
                },
                {
                  "id": "FUN-7.H.2",
                  "text": "The logistic differential equation and initial conditions can be interpreted without solving the differential equation. bc only"
                },
                {
                  "id": "FUN-7.H.3",
                  "text": "The limiting value (carrying capacity) of a logistic differential equation as the independent variable approaches infinity can be determined using the logistic growth model and initial conditions. bc only"
                },
                {
                  "id": "FUN-7.H.4",
                  "text": "The value of the dependent variable in a logistic differential equation at the point when it is changing fastest can be determined using the logistic growth model and initial conditions. bc only"
                }
              ]
            }
          ]
        },
        {
          "code": "APCBC.8",
          "name": "Applications of Integration",
          "objectives": [
            {
              "code": "CHA-4.B",
              "name": "Determine the average value of a function using definite integrals.",
              "subtopics": [
                {
                  "id": "CHA-4.B.1",
                  "text": "The average value of a continuous function f over an interval [a, b] is $\\frac{1}{b-a} \\int_a^b f(x) dx$ ."
                }
              ]
            },
            {
              "code": "CHA-4.C",
              "name": "Determine values for positions and rates of change using definite integrals in problems involving rectilinear motion.",
              "subtopics": [
                {
                  "id": "CHA-4.C.1",
                  "text": "For a particle in rectilinear motion over an interval of time, the definite integral of velocity represents the particle's displacement over the interval of time, and the definite integral of speed represents the particle's total distance traveled over the interval of time."
                }
              ]
            },
            {
              "code": "CHA-4.D",
              "name": "Interpret the meaning of a definite integral in accumulation problems.",
              "subtopics": [
                {
                  "id": "CHA-4.D.1",
                  "text": "A function defined as an integral represents an accumulation of a rate of change."
                },
                {
                  "id": "CHA-4.D.2",
                  "text": "The definite integral of the rate of change of a quantity over an interval gives the net change of that quantity over that interval."
                }
              ]
            },
            {
              "code": "CHA-4.E",
              "name": "Determine net change using definite integrals in applied contexts.",
              "subtopics": [
                {
                  "id": "CHA-4.E.1",
                  "text": "The definite integral can be used to express information about accumulation and net change in many applied contexts."
                }
              ]
            },
            {
              "code": "CHA-5.A",
              "name": "Calculate areas in the plane using the definite integral.",
              "subtopics": [
                {
                  "id": "CHA-5.A.1",
                  "text": "Areas of regions in the plane can be calculated with definite integrals."
                },
                {
                  "id": "CHA-5.A.2",
                  "text": "Areas of regions in the plane can be calculated using functions of either x or y."
                },
                {
                  "id": "CHA-5.A.3",
                  "text": "Areas of certain regions in the plane may be calculated using a sum of two or more definite integrals or by evaluating a definite integral of the absolute value of the difference of two functions."
                }
              ]
            },
            {
              "code": "CHA-5.B",
              "name": "Calculate volumes of solids with known cross sections using definite integrals.",
              "subtopics": [
                {
                  "id": "CHA-5.B.1",
                  "text": "Volumes of solids with square and rectangular cross sections can be found using definite integrals and the area formulas for these shapes."
                },
                {
                  "id": "CHA-5.B.2",
                  "text": "Volumes of solids with triangular cross sections can be found using definite integrals and the area formulas for these shapes."
                },
                {
                  "id": "CHA-5.B.3",
                  "text": "Volumes of solids with semicircular and other geometrically defined cross sections can be found using definite integrals and the area formulas for these shapes."
                }
              ]
            },
            {
              "code": "CHA-5.C",
              "name": "Calculate volumes of solids of revolution using definite integrals.",
              "subtopics": [
                {
                  "id": "CHA-5.C.1",
                  "text": "Volumes of solids of revolution around the x- or y-axis may be found by using definite integrals with the disc method."
                },
                {
                  "id": "CHA-5.C.2",
                  "text": "Volumes of solids of revolution around any horizontal or vertical line in the plane may be found by using definite integrals with the disc method."
                },
                {
                  "id": "CHA-5.C.3",
                  "text": "Volumes of solids of revolution around the x- or y-axis whose cross sections are ring shaped may be found using definite integrals with the washer method."
                },
                {
                  "id": "CHA-5.C.4",
                  "text": "Volumes of solids of revolution around any horizontal or vertical line whose cross sections are ring shaped may be found using definite integrals with the washer method."
                }
              ]
            },
            {
              "code": "CHA-6.A",
              "name": "Determine the length of a curve in the plane defined by a function, using a definite integral. BC ONLY",
              "subtopics": [
                {
                  "id": "CHA-6.A.1",
                  "text": "The length of a planar curve defined by a function can be calculated using a definite integral. BC ONLY"
                }
              ]
            }
          ]
        },
        {
          "code": "APCBC.9",
          "name": "Parametric Equations, Polar Coordinates, and Vector-Valued Functions (BC)",
          "objectives": [
            {
              "code": "CHA-3.G",
              "name": "Calculate derivatives of parametric functions. BC ONLY",
              "subtopics": [
                {
                  "id": "CHA-3.G.1",
                  "text": "Methods for calculating derivatives of real-valued functions can be extended to parametric functions. BC ONLY For a curve defined parametrically, the value of $\\frac{dy}{dt}$ at a point on the curve is the slope of the line tangent to the curve at that point. $\\frac{dy}{dx}$ the slope of the line tangent to a curve defined using parametric equations, can be determined by dividing $\\frac{dy}{dt}$ by $\\frac{dx}{dt}$ , provided $\\frac{dx}{dt}$ does not"
                },
                {
                  "id": "CHA-3.G.3",
                  "text": "$\\frac{d^2y}{dx^2}$ can be calculated by dividing $\\frac{d}{dt}\\left(\\frac{dy}{dx}\\right)$"
                }
              ]
            },
            {
              "code": "CHA-3.H",
              "name": "Calculate derivatives of vector-valued functions. bc only",
              "subtopics": [
                {
                  "id": "CHA-3.H.1",
                  "text": "Methods for calculating derivatives of realvalued functions can be extended to vectorvalued functions. bc only"
                }
              ]
            },
            {
              "code": "CHA-5.D",
              "name": "Calculate areas of regions defined by polar curves using definite integrals. bc only",
              "subtopics": [
                {
                  "id": "CHA-5.D.1",
                  "text": "The concept of calculating areas in rectangular coordinates can be extended to polar coordinates. bc only"
                },
                {
                  "id": "CHA-5.D.2",
                  "text": "Areas of regions bounded by polar curves can be calculated with definite integrals. bc only"
                }
              ]
            },
            {
              "code": "CHA-6.B",
              "name": "Determine the length of a curve in the plane defined by parametric functions, using a definite integral. bc only",
              "subtopics": [
                {
                  "id": "CHA-6.B.1",
                  "text": "The length of a parametrically defined curve can be calculated using a definite integral."
                }
              ]
            },
            {
              "code": "FUN-3.G",
              "name": "Calculate derivatives of functions written in polar coordinates. BC ONLY",
              "subtopics": [
                {
                  "id": "FUN-3.G.1",
                  "text": "Methods for calculating derivatives of realvalued functions can be extended to functions in polar coordinates. BC ONLY"
                },
                {
                  "id": "FUN-3.G.2",
                  "text": "For a curve given by a polar equation $r=f(\\theta)$ , derivatives of r, x, and y with respect to $\\theta$ , and first and second derivatives of y with respect to x can provide information about the curve."
                }
              ]
            },
            {
              "code": "FUN-8.A",
              "name": "Determine a particular solution given a rate vector and initial conditions. bc only",
              "subtopics": [
                {
                  "id": "FUN-8.A.1",
                  "text": "Methods for calculating integrals of real-valued functions can be extended to parametric or vector-valued functions. bc only"
                }
              ]
            },
            {
              "code": "FUN-8.B",
              "name": "Determine values for positions and rates of change in problems involving planar motion. bc only",
              "subtopics": [
                {
                  "id": "FUN-8.B.1",
                  "text": "Derivatives can be used to determine velocity, speed, and acceleration for a particle moving along a curve in the plane defined using parametric or vector-valued functions."
                },
                {
                  "id": "FUN-8.B.2",
                  "text": "For a particle in planar motion over an interval of time, the definite integral of the velocity vector represents the particle's displacement (net change in position) over the interval of time, from which we might determine its position. The definite integral of speed represents the particle's total distance traveled over the interval of time. bc only"
                }
              ]
            }
          ]
        },
        {
          "code": "APCBC.10",
          "name": "Infinite Sequences and Series (BC)",
          "objectives": [
            {
              "code": "LIM-7.A",
              "name": "Determine whether a series converges or diverges. bc only",
              "subtopics": [
                {
                  "id": "LIM-7.A.1",
                  "text": "The nth partial sum is defined as the sum of the first n terms of a series. bc only"
                },
                {
                  "id": "LIM-7.A.2",
                  "text": "An infinite series of numbers converges to a real number S (or has sum S), if and only if the limit of its sequence of partial sums exists and equals S. bc only"
                },
                {
                  "id": "LIM-7.A.3",
                  "text": "A geometric series is a series with a constant ratio between successive terms. BC ONLY"
                },
                {
                  "id": "LIM-7.A.4",
                  "text": "If a is a real number and r is a real number such that |r| < 1, then the geometric series $$\\sum_{n=0}^{\\infty} ar^n = \\frac{a}{1-r}$$ . BC ONLY"
                },
                {
                  "id": "LIM-7.A.5",
                  "text": "The nth term test is a test for divergence of a series. bc only"
                },
                {
                  "id": "LIM-7.A.6",
                  "text": "The integral test is a method to determine whether a series converges or diverges. bc only"
                },
                {
                  "id": "LIM-7.A.7",
                  "text": "In addition to geometric series, common series of numbers include the harmonic series, the alternating harmonic series, and p-series. bc only"
                },
                {
                  "id": "LIM-7.A.8",
                  "text": "The comparison test is a method to determine whether a series converges or diverges. bc only"
                },
                {
                  "id": "LIM-7.A.9",
                  "text": "The limit comparison test is a method to determine whether a series converges or diverges. bc only"
                },
                {
                  "id": "LIM-7.A.10",
                  "text": "The alternating series test is a method to determine whether an alternating series converges. bc only"
                },
                {
                  "id": "LIM-7.A.11",
                  "text": "The ratio test is a method to determine whether a series of numbers converges or diverges. bc only X EXCLUSION STATEMENT The nth term test for divergence, and the integral test, comparison test, limit comparison test, alternating series test, and ratio test for convergence are assessed on the AP Calculus BC Exam. Other methods are not assessed on the exam. However, teachers may include additional methods in the course, if time permits."
                },
                {
                  "id": "LIM-7.A.12",
                  "text": "A series may be absolutely convergent, conditionally convergent, or divergent. bc only"
                },
                {
                  "id": "LIM-7.A.13",
                  "text": "If a series converges absolutely, then it converges. bc only"
                },
                {
                  "id": "LIM-7.A.14",
                  "text": "If a series converges absolutely, then any series obtained from it by regrouping or rearranging the terms has the same value. bc only"
                }
              ]
            },
            {
              "code": "LIM-7.B",
              "name": "Approximate the sum of a series. bc only",
              "subtopics": [
                {
                  "id": "LIM-7.B.1",
                  "text": "If an alternating series converges by the alternating series test, then the alternating series error bound can be used to bound how far a partial sum is from the value of the infinite series. bc only"
                }
              ]
            },
            {
              "code": "LIM-8.A",
              "name": "Represent a function at a point as a Taylor polynomial. BC ONLY",
              "subtopics": [
                {
                  "id": "LIM-8.A.1",
                  "text": "The coefficient of the nth degree term in a Taylor polynomial for a function f centered at $$x = a$$ is $\\frac{f^{(n)}(a)}{n!}$ . BC ONLY In many cases, as the degree of a Taylor polynomial increases, the nth degree polynomial will approach the original function over some interval. BC ONLY"
                }
              ]
            },
            {
              "code": "LIM-8.B",
              "name": "Approximate function values using a Taylor polynomial. BC ONLY",
              "subtopics": [
                {
                  "id": "LIM-8.B.1",
                  "text": "Taylor polynomials for a function f centered at x = a can be used to approximate function values of f near x = a. BC ONLY"
                }
              ]
            },
            {
              "code": "LIM-8.C",
              "name": "Determine the error bound associated with a Taylor polynomial approximation. bc only",
              "subtopics": [
                {
                  "id": "LIM-8.C.1",
                  "text": "The Lagrange error bound can be used to determine a maximum interval for the error of a Taylor polynomial approximation to a function. bc only"
                },
                {
                  "id": "LIM-8.C.2",
                  "text": "In some situations, the alternating series error bound can be used to bound the error of a Taylor polynomial approximation to the value of a function. bc only"
                }
              ]
            },
            {
              "code": "LIM-8.D",
              "name": "Determine the radius of convergence and interval of convergence for a power series. bc only",
              "subtopics": [
                {
                  "id": "LIM-8.D.1",
                  "text": "A power series is a series of the form r n n n 0 − = , where n is a non-negative integer, a{ }n is a sequence of real numbers, and r is a real number. bc only"
                },
                {
                  "id": "LIM-8.D.2",
                  "text": "If a power series converges, it either converges at a single point or has an interval of convergence. bc only"
                },
                {
                  "id": "LIM-8.D.3",
                  "text": "The ratio test can be used to determine the radius of convergence of a power series. bc only"
                },
                {
                  "id": "LIM-8.D.4",
                  "text": "The radius of convergence of a power series can be used to identify an open interval on which the series converges, but it is necessary to test both endpoints of the interval to determine the interval of convergence. bc only"
                },
                {
                  "id": "LIM-8.D.5",
                  "text": "If a power series has a positive radius of convergence, then the power series is the Taylor series of the function to which it converges over the open interval. bc only"
                },
                {
                  "id": "LIM-8.D.6",
                  "text": "The radius of convergence of a power series obtained by term-by-term differentiation or termby-term integration is the same as the radius of convergence of the original power series. bc only"
                }
              ]
            },
            {
              "code": "LIM-8.E",
              "name": "Represent a function as a Taylor series or a Maclaurin series. BC ONLY",
              "subtopics": [
                {
                  "id": "LIM-8.E.1",
                  "text": "A Taylor polynomial for f(x) is a partial sum of the Taylor series for f(x). BC ONLY The Maclaurin series for $\\frac{1}{1-x}$ is a geometric series. BC ONLY"
                }
              ]
            },
            {
              "code": "LIM-8.F",
              "name": "Interpret Taylor series and Maclaurin series. BC ONLY",
              "subtopics": [
                {
                  "id": "LIM-8.F.2",
                  "text": "The Maclaurin series for $\\sin x$ , $\\cos x$ , and $e^x$ provides the foundation for constructing the Maclaurin series for other functions. BC ONLY"
                }
              ]
            },
            {
              "code": "LIM-8.G",
              "name": "Represent a given function as a power series. bc only",
              "subtopics": [
                {
                  "id": "LIM-8.G.1",
                  "text": "Using a known series, a power series for a given function can be derived using operations such as term-by-term differentiation or term-byterm integration, and by various methods (e.g., algebraic processes, substitutions, or using properties of geometric series). bc only"
                }
              ]
            }
          ]
        }
      ]
    }
  },

  // ─────────────────────────────────────────────
  //  SAT Math — based on College Board digital SAT math domains
  //  Subject key: "sat math" matches SAT Math / SAT math
  // ─────────────────────────────────────────────
  "sat_math": {
    "sat math": {
      standards: [
        {
          code: "SATM.A",
          name: "Algebra",
          objectives: [
            {
              code: "SATM.A.1",
              name: "Linear Equations in One Variable",
              subtopics: [
                { id: "SATM.A.1.1", text: "Solve linear equations with rational coefficients" },
                { id: "SATM.A.1.2", text: "Solve equations with variables on both sides" },
                { id: "SATM.A.1.3", text: "Interpret solutions and identify no-solution or infinite-solution cases" },
                { id: "SATM.A.1.4", text: "Rearrange formulas to isolate a variable" },
              ]
            },
            {
              code: "SATM.A.2",
              name: "Linear Equations in Two Variables",
              subtopics: [
                { id: "SATM.A.2.1", text: "Interpret and graph linear relationships" },
                { id: "SATM.A.2.2", text: "Determine slope and intercept from equations, tables, and graphs" },
                { id: "SATM.A.2.3", text: "Write equations of lines from context" },
                { id: "SATM.A.2.4", text: "Interpret rate of change and initial value" },
              ]
            },
            {
              code: "SATM.A.3",
              name: "Systems of Linear Equations",
              subtopics: [
                { id: "SATM.A.3.1", text: "Solve systems of two linear equations" },
                { id: "SATM.A.3.2", text: "Interpret systems in context" },
                { id: "SATM.A.3.3", text: "Identify the meaning of intersection points" },
                { id: "SATM.A.3.4", text: "Solve systems using substitution, elimination, or graphing" },
              ]
            },
            {
              code: "SATM.A.4",
              name: "Linear Inequalities and Contexts",
              subtopics: [
                { id: "SATM.A.4.1", text: "Solve linear inequalities in one variable" },
                { id: "SATM.A.4.2", text: "Represent solutions on the number line" },
                { id: "SATM.A.4.3", text: "Interpret constraints in word problems" },
                { id: "SATM.A.4.4", text: "Model real situations with linear inequalities" },
              ]
            },
          ]
        },
        {
          code: "SATM.B",
          name: "Advanced Math",
          objectives: [
            {
              code: "SATM.B.1",
              name: "Equivalent Expressions",
              subtopics: [
                { id: "SATM.B.1.1", text: "Rewrite algebraic expressions in equivalent forms" },
                { id: "SATM.B.1.2", text: "Factor quadratics and higher-order expressions when appropriate" },
                { id: "SATM.B.1.3", text: "Use structure to simplify rational and radical expressions" },
                { id: "SATM.B.1.4", text: "Recognize useful forms for solving or interpreting expressions" },
              ]
            },
            {
              code: "SATM.B.2",
              name: "Nonlinear Equations in One Variable",
              subtopics: [
                { id: "SATM.B.2.1", text: "Solve quadratic equations by factoring, completing the square, or formula" },
                { id: "SATM.B.2.2", text: "Solve exponential equations with matching bases or simple transformations" },
                { id: "SATM.B.2.3", text: "Solve rational and radical equations in SAT-style settings" },
                { id: "SATM.B.2.4", text: "Check for extraneous solutions where needed" },
              ]
            },
            {
              code: "SATM.B.3",
              name: "Nonlinear Functions and Graphs",
              subtopics: [
                { id: "SATM.B.3.1", text: "Interpret quadratics, exponentials, and other nonlinear functions" },
                { id: "SATM.B.3.2", text: "Identify key graph features such as vertex, intercepts, and growth/decay" },
                { id: "SATM.B.3.3", text: "Compare function forms and representations" },
                { id: "SATM.B.3.4", text: "Relate equations to tables and graphs" },
              ]
            },
            {
              code: "SATM.B.4",
              name: "Systems with Nonlinear Relationships",
              subtopics: [
                { id: "SATM.B.4.1", text: "Solve systems involving a linear and a nonlinear equation" },
                { id: "SATM.B.4.2", text: "Interpret intersections of linear and quadratic graphs" },
                { id: "SATM.B.4.3", text: "Model real contexts using systems" },
                { id: "SATM.B.4.4", text: "Choose efficient symbolic or graphical methods" },
              ]
            },
          ]
        },
        {
          code: "SATM.C",
          name: "Problem-Solving and Data Analysis",
          objectives: [
            {
              code: "SATM.C.1",
              name: "Ratios, Rates, Proportions, and Units",
              subtopics: [
                { id: "SATM.C.1.1", text: "Use ratios and proportions to solve multistep problems" },
                { id: "SATM.C.1.2", text: "Interpret unit rates and scale factors" },
                { id: "SATM.C.1.3", text: "Work with percent increase, decrease, and percent error" },
                { id: "SATM.C.1.4", text: "Analyze units and convert measurements" },
              ]
            },
            {
              code: "SATM.C.2",
              name: "Data, Statistics, and Distributions",
              subtopics: [
                { id: "SATM.C.2.1", text: "Interpret tables, dot plots, histograms, and box plots" },
                { id: "SATM.C.2.2", text: "Compare center and spread of distributions" },
                { id: "SATM.C.2.3", text: "Compute and interpret mean, median, and weighted averages" },
                { id: "SATM.C.2.4", text: "Reason about margin of error and sampling summaries" },
              ]
            },
            {
              code: "SATM.C.3",
              name: "Probability and Inference",
              subtopics: [
                { id: "SATM.C.3.1", text: "Compute simple and conditional probabilities" },
                { id: "SATM.C.3.2", text: "Interpret survey samples and experimental design" },
                { id: "SATM.C.3.3", text: "Reason about random sampling and bias" },
                { id: "SATM.C.3.4", text: "Draw inferences from data displays and summaries" },
              ]
            },
            {
              code: "SATM.C.4",
              name: "Regression and Modeling",
              subtopics: [
                { id: "SATM.C.4.1", text: "Interpret linear models from graphs and tables" },
                { id: "SATM.C.4.2", text: "Use equations of best-fit lines" },
                { id: "SATM.C.4.3", text: "Interpret slope and intercept in context" },
                { id: "SATM.C.4.4", text: "Evaluate fit and use models for prediction" },
              ]
            },
          ]
        },
        {
          code: "SATM.D",
          name: "Geometry and Trigonometry",
          objectives: [
            {
              code: "SATM.D.1",
              name: "Area, Volume, and Geometric Measurement",
              subtopics: [
                { id: "SATM.D.1.1", text: "Apply area and perimeter formulas for 2D figures" },
                { id: "SATM.D.1.2", text: "Apply volume formulas for 3D solids" },
                { id: "SATM.D.1.3", text: "Use geometric measurement in composite figures" },
                { id: "SATM.D.1.4", text: "Interpret units and scale in measurement problems" },
              ]
            },
            {
              code: "SATM.D.2",
              name: "Lines, Angles, and Triangles",
              subtopics: [
                { id: "SATM.D.2.1", text: "Use angle relationships in parallel lines and transversals" },
                { id: "SATM.D.2.2", text: "Apply triangle angle sum and exterior angle facts" },
                { id: "SATM.D.2.3", text: "Use similarity and congruence in problem solving" },
                { id: "SATM.D.2.4", text: "Work with special right triangles and triangle properties" },
              ]
            },
            {
              code: "SATM.D.3",
              name: "Right Triangle Trigonometry",
              subtopics: [
                { id: "SATM.D.3.1", text: "Use sine, cosine, and tangent ratios" },
                { id: "SATM.D.3.2", text: "Interpret trigonometric relationships in right triangles" },
                { id: "SATM.D.3.3", text: "Solve for missing side lengths or acute angles" },
                { id: "SATM.D.3.4", text: "Apply trigonometry in word problems" },
              ]
            },
            {
              code: "SATM.D.4",
              name: "Circles and Coordinate Geometry",
              subtopics: [
                { id: "SATM.D.4.1", text: "Use circle equations and circle measurements" },
                { id: "SATM.D.4.2", text: "Interpret points, slopes, and distances in the coordinate plane" },
                { id: "SATM.D.4.3", text: "Apply midpoint and distance formulas" },
                { id: "SATM.D.4.4", text: "Relate algebraic equations to geometric figures" },
              ]
            },
          ]
        },
      ]
    }
  },

  // ─────────────────────────────────────────────
  //  Grade 5-8 Maths Revision — CGP / KS3-style higher revision structure
  //  Subject matching remains broad for legacy aliases like "ks3" and "levels 5-8"
  // ─────────────────────────────────────────────
  "grade_5_8_maths_revision": {
    "grade 5-8 maths revision": {
      standards: [
        {
          code: "KS3.N",
          name: "Number",
          objectives: [
            {
              code: "KS3.N.1",
              name: "Place Value, Integers, and Decimals",
              subtopics: [
                { id: "KS3.N.1.1", text: "Work with negative numbers in context and on a number line" },
                { id: "KS3.N.1.2", text: "Order and compare integers, decimals, and signed values" },
                { id: "KS3.N.1.3", text: "Round to a given number of decimal places or significant figures" },
                { id: "KS3.N.1.4", text: "Estimate calculations and interpret accuracy of answers" },
              ]
            },
            {
              code: "KS3.N.2",
              name: "Fractions, Decimals, and Percentages",
              subtopics: [
                { id: "KS3.N.2.1", text: "Convert between fractions, decimals, and percentages" },
                { id: "KS3.N.2.2", text: "Find fractions or percentages of quantities" },
                { id: "KS3.N.2.3", text: "Compare and order fractions, decimals, and percentages" },
                { id: "KS3.N.2.4", text: "Use percentage increase and decrease" },
              ]
            },
            {
              code: "KS3.N.3",
              name: "Ratio, Proportion, and Rates",
              subtopics: [
                { id: "KS3.N.3.1", text: "Simplify and divide quantities in a ratio" },
                { id: "KS3.N.3.2", text: "Use direct proportion in one-step and multi-step problems" },
                { id: "KS3.N.3.3", text: "Solve best-buy and unit-rate questions" },
                { id: "KS3.N.3.4", text: "Interpret scale factors and proportional reasoning" },
              ]
            },
            {
              code: "KS3.N.4",
              name: "Powers, Roots, and Standard Form",
              subtopics: [
                { id: "KS3.N.4.1", text: "Evaluate squares, cubes, square roots, and cube roots" },
                { id: "KS3.N.4.2", text: "Use index notation and laws of indices" },
                { id: "KS3.N.4.3", text: "Write and interpret numbers in standard form" },
                { id: "KS3.N.4.4", text: "Perform calculations involving powers of ten" },
              ]
            },
          ]
        },
        {
          code: "KS3.A",
          name: "Algebra",
          objectives: [
            {
              code: "KS3.A.1",
              name: "Expressions and Formulae",
              subtopics: [
                { id: "KS3.A.1.1", text: "Simplify algebraic expressions by collecting like terms" },
                { id: "KS3.A.1.2", text: "Substitute integers and decimals into expressions and formulae" },
                { id: "KS3.A.1.3", text: "Expand single brackets and simple products" },
                { id: "KS3.A.1.4", text: "Factorise expressions into a single bracket" },
              ]
            },
            {
              code: "KS3.A.2",
              name: "Equations and Inequalities",
              subtopics: [
                { id: "KS3.A.2.1", text: "Solve one-step and two-step linear equations" },
                { id: "KS3.A.2.2", text: "Solve equations involving brackets and unknowns on both sides" },
                { id: "KS3.A.2.3", text: "Form and solve equations from word problems" },
                { id: "KS3.A.2.4", text: "Represent and solve simple inequalities" },
              ]
            },
            {
              code: "KS3.A.3",
              name: "Sequences",
              subtopics: [
                { id: "KS3.A.3.1", text: "Continue linear and non-linear sequences" },
                { id: "KS3.A.3.2", text: "Find term-to-term rules" },
                { id: "KS3.A.3.3", text: "Find and use nth-term rules for linear sequences" },
                { id: "KS3.A.3.4", text: "Distinguish arithmetic patterns from quadratic or geometric-looking patterns" },
              ]
            },
            {
              code: "KS3.A.4",
              name: "Graphs and Coordinates",
              subtopics: [
                { id: "KS3.A.4.1", text: "Plot coordinates in all four quadrants" },
                { id: "KS3.A.4.2", text: "Interpret and draw linear graphs" },
                { id: "KS3.A.4.3", text: "Find gradients and intercepts informally" },
                { id: "KS3.A.4.4", text: "Read real-life graphs and conversion graphs" },
              ]
            },
          ]
        },
        {
          code: "KS3.G",
          name: "Shape, Space and Measure",
          objectives: [
            {
              code: "KS3.G.1",
              name: "Angles and Polygons",
              subtopics: [
                { id: "KS3.G.1.1", text: "Use angle facts on lines, around a point, and with parallel lines" },
                { id: "KS3.G.1.2", text: "Find interior and exterior angles of polygons" },
                { id: "KS3.G.1.3", text: "Use angle reasoning in triangles and quadrilaterals" },
                { id: "KS3.G.1.4", text: "Solve multi-step angle problems with algebra" },
              ]
            },
            {
              code: "KS3.G.2",
              name: "Perimeter, Area, and Volume",
              subtopics: [
                { id: "KS3.G.2.1", text: "Find perimeter and area of rectangles, triangles, parallelograms, and trapezia" },
                { id: "KS3.G.2.2", text: "Calculate circumference and area of circles" },
                { id: "KS3.G.2.3", text: "Find volume and surface area of cuboids and prisms" },
                { id: "KS3.G.2.4", text: "Use compound measures and unit conversions in geometry" },
              ]
            },
            {
              code: "KS3.G.3",
              name: "Transformations and Coordinates",
              subtopics: [
                { id: "KS3.G.3.1", text: "Reflect, rotate, translate, and enlarge 2D shapes" },
                { id: "KS3.G.3.2", text: "Describe transformations fully" },
                { id: "KS3.G.3.3", text: "Use coordinates under transformations" },
                { id: "KS3.G.3.4", text: "Identify congruent and similar shapes informally" },
              ]
            },
            {
              code: "KS3.G.4",
              name: "Pythagoras, Constructions, and Bearings",
              subtopics: [
                { id: "KS3.G.4.1", text: "Apply Pythagoras' theorem in right-angled triangles" },
                { id: "KS3.G.4.2", text: "Use ruler-and-compass constructions and loci basics" },
                { id: "KS3.G.4.3", text: "Measure and interpret bearings" },
                { id: "KS3.G.4.4", text: "Solve geometric problems involving scale drawings" },
              ]
            },
          ]
        },
        {
          code: "KS3.D",
          name: "Handling Data and Probability",
          objectives: [
            {
              code: "KS3.D.1",
              name: "Averages and Spread",
              subtopics: [
                { id: "KS3.D.1.1", text: "Find mean, median, mode, and range" },
                { id: "KS3.D.1.2", text: "Choose appropriate averages in context" },
                { id: "KS3.D.1.3", text: "Interpret grouped and discrete data summaries" },
                { id: "KS3.D.1.4", text: "Compare two sets of data using average and spread" },
              ]
            },
            {
              code: "KS3.D.2",
              name: "Tables, Charts, and Graphs",
              subtopics: [
                { id: "KS3.D.2.1", text: "Interpret bar charts, pie charts, line graphs, and frequency diagrams" },
                { id: "KS3.D.2.2", text: "Construct charts from data tables" },
                { id: "KS3.D.2.3", text: "Use grouped frequency tables and simple histograms" },
                { id: "KS3.D.2.4", text: "Read and compare cumulative-style or distribution-style graphs" },
              ]
            },
            {
              code: "KS3.D.3",
              name: "Probability",
              subtopics: [
                { id: "KS3.D.3.1", text: "Use probability scale from 0 to 1" },
                { id: "KS3.D.3.2", text: "Find probabilities of single events" },
                { id: "KS3.D.3.3", text: "Use sample spaces and two-way tables" },
                { id: "KS3.D.3.4", text: "Calculate probabilities of combined events" },
              ]
            },
            {
              code: "KS3.D.4",
              name: "Scatter Graphs and Data Relationships",
              subtopics: [
                { id: "KS3.D.4.1", text: "Plot and interpret scatter graphs" },
                { id: "KS3.D.4.2", text: "Describe correlation and identify outliers" },
                { id: "KS3.D.4.3", text: "Draw and use lines of best fit" },
                { id: "KS3.D.4.4", text: "Use data relationships to estimate missing values" },
              ]
            },
          ]
        },
      ]
    }
  },

}

const SC_PRECALCULUS_OFFICIAL = {
  standards: [
    {
      code: "PC.AAPR",
      name: "Arithmetic with Polynomials and Rational Expressions",
      objectives: [
        { code: "PC.AAPR.2", name: "Division and Remainder Theorems", subtopics: [{ id: "PC.AAPR.2.1", text: "Know and apply the Division Theorem and the Remainder Theorem for polynomials." }] },
        { code: "PC.AAPR.3", name: "Graphing Polynomial Functions", subtopics: [{ id: "PC.AAPR.3.1", text: "Graph polynomials identifying zeros when suitable factorizations are available and indicating end behavior." }, { id: "PC.AAPR.3.2", text: "Write a polynomial function of least degree corresponding to a given graph." }] },
        { code: "PC.AAPR.4", name: "Polynomial Identities", subtopics: [{ id: "PC.AAPR.4.1", text: "Prove polynomial identities and use them to describe numerical relationships." }] },
        { code: "PC.AAPR.5", name: "Binomial Theorem", subtopics: [{ id: "PC.AAPR.5.1", text: "Apply the Binomial Theorem to expand powers of binomials, including those with one and with two variables." }, { id: "PC.AAPR.5.2", text: "Use the Binomial Theorem to factor squares, cubes, and fourth powers of binomials." }] },
        { code: "PC.AAPR.6", name: "Rewriting Rational Expressions", subtopics: [{ id: "PC.AAPR.6.1", text: "Apply algebraic techniques to rewrite simple rational expressions in different forms using inspection, long division, or, for more complicated examples, a computer algebra system." }] },
        { code: "PC.AAPR.7", name: "Rational Expressions", subtopics: [{ id: "PC.AAPR.7.1", text: "Understand that rational expressions form a system analogous to the rational numbers, closed under addition, subtraction, multiplication, and division by a nonzero rational expression." }, { id: "PC.AAPR.7.2", text: "Add, subtract, multiply, and divide rational expressions." }] },
      ],
    },
    {
      code: "PC.AREI",
      name: "Reasoning with Equations and Inequalities",
      objectives: [
        { code: "PC.AREI.7", name: "Linear-Quadratic Systems", subtopics: [{ id: "PC.AREI.7.1", text: "Solve a simple system consisting of a linear equation and a quadratic equation in two variables algebraically and graphically." }, { id: "PC.AREI.7.2", text: "Understand that such systems may have zero, one, two, or infinitely many solutions." }] },
        { code: "PC.AREI.8", name: "Matrix Equation Representation", subtopics: [{ id: "PC.AREI.8.1", text: "Represent a system of linear equations as a single matrix equation in a vector variable." }] },
        { code: "PC.AREI.9", name: "Inverse Matrices", subtopics: [{ id: "PC.AREI.9.1", text: "Using technology for matrices of dimension 3 × 3 or greater, find the inverse of a matrix if it exists and use it to solve systems of linear equations." }] },
        { code: "PC.AREI.11", name: "Graphical Solutions to f(x)=g(x)", subtopics: [{ id: "PC.AREI.11.1", text: "Solve an equation of the form f(x) = g(x) graphically by identifying the x-coordinate(s) of the point(s) of intersection of the graphs of y = f(x) and y = g(x)." }] },
      ],
    },
    {
      code: "PC.ASE",
      name: "Seeing Structure in Expressions",
      objectives: [
        { code: "PC.ASE.1", name: "Interpreting Algebraic Structure", subtopics: [{ id: "PC.ASE.1.1", text: "Interpret the meanings of coefficients, factors, terms, and expressions based on their real-world contexts." }, { id: "PC.ASE.1.2", text: "Interpret complicated expressions as being composed of simpler expressions." }] },
        { code: "PC.ASE.2", name: "Structure of Polynomial Expressions", subtopics: [{ id: "PC.ASE.2.1", text: "Analyze the structure of binomials, trinomials, and other polynomials in order to rewrite equivalent expressions." }] },
        { code: "PC.ASE.4", name: "Finite Geometric Series", subtopics: [{ id: "PC.ASE.4.1", text: "Derive the formula for the sum of a finite geometric series when the common ratio is not 1." }, { id: "PC.ASE.4.2", text: "Use the formula to solve problems including applications to finance." }] },
      ],
    },
    {
      code: "PC.FBF",
      name: "Building Functions",
      objectives: [
        { code: "PC.FBF.1", name: "Combining Functions", subtopics: [{ id: "PC.FBF.1.1", text: "Combine functions using the operations addition, subtraction, multiplication, and division to build new functions that describe relationships between two quantities in mathematical and real-world situations." }] },
        { code: "PC.FBF.3", name: "Transformations of Functions", subtopics: [{ id: "PC.FBF.3.1", text: "Describe the effect of the transformations kf(x), f(x) + k, f(x + k), and combinations of such transformations on the graph of y = f(x) for any real number k." }, { id: "PC.FBF.3.2", text: "Find the value of k given the graphs and write the equation of a transformed parent function given its graph." }] },
        { code: "PC.FBF.4", name: "Inverse Functions", subtopics: [{ id: "PC.FBF.4.1", text: "Understand that an inverse function can be obtained by expressing the dependent variable of one function as the independent variable of another, as f and g are inverse functions if and only if f(x) = y and g(y) = x, for all values of x in the domain of f and all values of y in the domain of g, and find inverse functions for one-to-one functions or by restricting the domain." }, { id: "PC.FBF.4.2", text: "Use composition to verify one function is an inverse of another." }, { id: "PC.FBF.4.3", text: "If a function has an inverse, find values of the inverse function from a graph or table." }] },
        { code: "PC.FBF.5", name: "Exponential and Logarithmic Inverses", subtopics: [{ id: "PC.FBF.5.1", text: "Understand and verify through function composition that exponential and logarithmic functions are inverses of each other." }, { id: "PC.FBF.5.2", text: "Use this relationship to solve problems involving logarithms and exponents." }] },
      ],
    },
    {
      code: "PC.FIF",
      name: "Interpreting Functions",
      objectives: [
        { code: "PC.FIF.4", name: "Key Features of Functions", subtopics: [{ id: "PC.FIF.4.1", text: "Interpret key features of a function that models the relationship between two quantities when given in graphical or tabular form." }, { id: "PC.FIF.4.2", text: "Sketch the graph of a function from a verbal description showing key features including intercepts, intervals where the function is increasing, decreasing, constant, positive, or negative, relative maximums and minimums, symmetries, end behavior, and periodicity." }] },
        { code: "PC.FIF.5", name: "Domain and Range", subtopics: [{ id: "PC.FIF.5.1", text: "Relate the domain and range of a function to its graph and, where applicable, to the quantitative relationship it describes." }] },
        { code: "PC.FIF.6", name: "Average Rate of Change", subtopics: [{ id: "PC.FIF.6.1", text: "Given a function in graphical, symbolic, or tabular form, determine the average rate of change of the function over a specified interval." }, { id: "PC.FIF.6.2", text: "Interpret the meaning of the average rate of change in a given context." }] },
        { code: "PC.FIF.7", name: "Graphing from Symbolic Representations", subtopics: [{ id: "PC.FIF.7.1", text: "Graph functions from their symbolic representations and indicate key features including intercepts, intervals where the function is increasing, decreasing, positive, or negative, relative maximums and minimums, symmetries, end behavior, and periodicity." }, { id: "PC.FIF.7.2", text: "Graph rational functions, identifying zeros and asymptotes when suitable factorizations are available, and showing end behavior." }, { id: "PC.FIF.7.3", text: "Graph radical functions over their domain and show end behavior." }, { id: "PC.FIF.7.4", text: "Graph exponential and logarithmic functions, showing intercepts and end behavior." }, { id: "PC.FIF.7.5", text: "Graph trigonometric functions, showing period, midline, and amplitude." }] },
      ],
    },
    {
      code: "PC.FLQE",
      name: "Linear, Quadratic, and Exponential",
      objectives: [
        { code: "PC.FLQE.1", name: "Linear vs Exponential Models", subtopics: [{ id: "PC.FLQE.1.1", text: "Distinguish between situations that can be modeled with linear functions or exponential functions by recognizing situations in which one quantity changes at a constant rate per unit interval as opposed to those in which a quantity changes by a constant percent rate per unit interval." }, { id: "PC.FLQE.1.2", text: "Prove that linear functions grow by equal differences over equal intervals and that exponential functions grow by equal factors over equal intervals." }, { id: "PC.FLQE.1.3", text: "Recognize situations in which a quantity grows or decays by a constant percent rate per unit interval relative to another." }] },
        { code: "PC.FLQE.2", name: "Creating Linear and Exponential Functions", subtopics: [{ id: "PC.FLQE.2.1", text: "Create symbolic representations of linear and exponential functions, including arithmetic and geometric sequences, given graphs, verbal descriptions, and tables." }] },
        { code: "PC.FLQE.3", name: "Comparing Growth Rates", subtopics: [{ id: "PC.FLQE.3.1", text: "Observe using graphs and tables that a quantity increasing exponentially eventually exceeds a quantity increasing linearly, quadratically, or more generally as a polynomial function." }] },
        { code: "PC.FLQE.4", name: "Logarithms as Exponential Solutions", subtopics: [{ id: "PC.FLQE.4.1", text: "Express a logarithm as the solution to the exponential equation a·b^(ct)=d where a, c, and d are numbers and the base b is 2, 10, or e." }, { id: "PC.FLQE.4.2", text: "Evaluate the logarithm using technology." }] },
        { code: "PC.FLQE.5", name: "Interpreting Parameters", subtopics: [{ id: "PC.FLQE.5.1", text: "Interpret the parameters in a linear or exponential function in terms of the context." }] },
      ],
    },
    {
      code: "PC.FT",
      name: "Trigonometry",
      objectives: [
        { code: "PC.FT.1", name: "Radian Measure", subtopics: [{ id: "PC.FT.1.1", text: "Understand that the radian measure of an angle is the length of the arc on the unit circle subtended by the angle." }] },
        { code: "PC.FT.2", name: "Defining Trigonometric Functions", subtopics: [{ id: "PC.FT.2.1", text: "Define sine and cosine as functions of the radian measure of an angle in terms of the x- and y-coordinates of the point on the unit circle corresponding to that angle and explain how these definitions are extensions of the right triangle definitions." }, { id: "PC.FT.2.2", text: "Define the tangent, cotangent, secant, and cosecant functions as ratios involving sine and cosine." }, { id: "PC.FT.2.3", text: "Write cotangent, secant, and cosecant functions as the reciprocals of tangent, cosine, and sine, respectively." }] },
        { code: "PC.FT.3", name: "Special Angles and the Unit Circle", subtopics: [{ id: "PC.FT.3.1", text: "Use special triangles to determine geometrically the values of sine, cosine, and tangent for π/3, π/4, and π/6." }, { id: "PC.FT.3.2", text: "Use the unit circle to express the values of sine, cosine, and tangent for π−x, π+x, and 2π−x in terms of their values for x, where x is any real number." }] },
        { code: "PC.FT.4", name: "Symmetry and Periodicity", subtopics: [{ id: "PC.FT.4.1", text: "Use the unit circle to explain symmetry (odd and even) and periodicity of trigonometric functions." }] },
        { code: "PC.FT.5", name: "Modeling Periodic Phenomena", subtopics: [{ id: "PC.FT.5.1", text: "Choose trigonometric functions to model periodic phenomena with specified amplitude, frequency, and midline." }] },
        { code: "PC.FT.6", name: "Inverse Trigonometric Functions", subtopics: [{ id: "PC.FT.6.1", text: "Define the six inverse trigonometric functions using domain restrictions for regions where the function is always increasing or always decreasing." }] },
        { code: "PC.FT.7", name: "Solving with Inverse Trigonometric Functions", subtopics: [{ id: "PC.FT.7.1", text: "Use inverse functions to solve trigonometric equations that arise in modeling contexts." }, { id: "PC.FT.7.2", text: "Evaluate the solutions using technology and interpret them in terms of the context." }] },
        { code: "PC.FT.8", name: "Core Trigonometric Identities", subtopics: [{ id: "PC.FT.8.1", text: "Justify the Pythagorean, even/odd, and cofunction identities for sine and cosine using their unit circle definitions and symmetries of the unit circle." }, { id: "PC.FT.8.2", text: "Use the Pythagorean identity to find sin A, cos A, or tan A, given sin A, cos A, or tan A, and the quadrant of the angle." }] },
        { code: "PC.FT.9", name: "Sum and Difference Formulas", subtopics: [{ id: "PC.FT.9.1", text: "Justify the sum and difference formulas for sine, cosine, and tangent and use them to solve problems." }] },
      ],
    },
    {
      code: "PC.GCI",
      name: "Circles",
      objectives: [
        { code: "PC.GCI.5", name: "Arc Length and Sector Area", subtopics: [{ id: "PC.GCI.5.1", text: "Derive the formulas for the length of an arc and the area of a sector in a circle." }, { id: "PC.GCI.5.2", text: "Apply these formulas to solve mathematical and real-world problems." }] },
      ],
    },
    {
      code: "PC.GGPE",
      name: "Expressing Geometric Properties with Equations",
      objectives: [
        { code: "PC.GGPE.2", name: "Parabolas from Focus and Directrix", subtopics: [{ id: "PC.GGPE.2.1", text: "Use the geometric definition of a parabola to derive its equation given the focus and directrix." }] },
        { code: "PC.GGPE.3", name: "Ellipses and Hyperbolas from Definitions", subtopics: [{ id: "PC.GGPE.3.1", text: "Use the geometric definition of an ellipse and of a hyperbola to derive the equation of each given the foci and points whose sum or difference of distance from the foci are constant." }] },
      ],
    },
    {
      code: "PC.GSRT",
      name: "Similarity, Right Triangles, and Trigonometry",
      objectives: [
        { code: "PC.GSRT.9", name: "Area Formula for Triangles", subtopics: [{ id: "PC.GSRT.9.1", text: "Derive the formula A = 1/2 ab sin C for the area of a triangle by drawing an auxiliary line from a vertex perpendicular to the opposite side." }] },
        { code: "PC.GSRT.10", name: "Laws of Sines and Cosines", subtopics: [{ id: "PC.GSRT.10.1", text: "Prove the Laws of Sines and Cosines and use them to solve problems." }] },
        { code: "PC.GSRT.11", name: "Solving Triangles", subtopics: [{ id: "PC.GSRT.11.1", text: "Use the Law of Sines and the Law of Cosines to solve for unknown measures of sides and angles of triangles that arise in mathematical and real-world problems." }] },
      ],
    },
    {
      code: "PC.NCNS",
      name: "Complex Number System",
      objectives: [
        { code: "PC.NCNS.2", name: "Operations with Complex Numbers", subtopics: [{ id: "PC.NCNS.2.1", text: "Use the relation i^2 = −1 and the commutative, associative, and distributive properties to add, subtract, and multiply complex numbers." }] },
        { code: "PC.NCNS.3", name: "Conjugates, Moduli, and Quotients", subtopics: [{ id: "PC.NCNS.3.1", text: "Find the conjugate of a complex number in rectangular and polar forms." }, { id: "PC.NCNS.3.2", text: "Use conjugates to find moduli and quotients of complex numbers." }] },
        { code: "PC.NCNS.4", name: "Graphing Complex Numbers", subtopics: [{ id: "PC.NCNS.4.1", text: "Graph complex numbers on the complex plane in rectangular and polar form." }, { id: "PC.NCNS.4.2", text: "Explain why the rectangular and polar forms of a given complex number represent the same number." }] },
        { code: "PC.NCNS.5", name: "Geometric Interpretation of Complex Operations", subtopics: [{ id: "PC.NCNS.5.1", text: "Represent addition, subtraction, multiplication, and conjugation of complex numbers geometrically on the complex plane." }, { id: "PC.NCNS.5.2", text: "Use properties of this representation for computation." }] },
        { code: "PC.NCNS.6", name: "Modulus and Distance", subtopics: [{ id: "PC.NCNS.6.1", text: "Determine the modulus of a complex number by multiplying by its conjugate." }, { id: "PC.NCNS.6.2", text: "Determine the distance between two complex numbers by calculating the modulus of their difference." }] },
        { code: "PC.NCNS.7", name: "Quadratics with Complex Solutions", subtopics: [{ id: "PC.NCNS.7.1", text: "Solve quadratic equations in one variable that have complex solutions." }] },
        { code: "PC.NCNS.8", name: "Polynomial Identities in the Complex Numbers", subtopics: [{ id: "PC.NCNS.8.1", text: "Extend polynomial identities to the complex numbers and use DeMoivre’s Theorem to calculate a power of a complex number." }] },
        { code: "PC.NCNS.9", name: "Fundamental Theorem of Algebra", subtopics: [{ id: "PC.NCNS.9.1", text: "Know the Fundamental Theorem of Algebra and explain why complex roots of polynomials with real coefficients must occur in conjugate pairs." }] },
      ],
    },
    {
      code: "PC.NVMQ",
      name: "Vector and Matrix Quantities",
      objectives: [
        { code: "PC.NVMQ.1", name: "Recognizing Vector Quantities", subtopics: [{ id: "PC.NVMQ.1.1", text: "Recognize vector quantities as having both magnitude and direction." }, { id: "PC.NVMQ.1.2", text: "Represent vector quantities by directed line segments, and use appropriate symbols for vectors and their magnitudes." }] },
        { code: "PC.NVMQ.2", name: "Vector Components", subtopics: [{ id: "PC.NVMQ.2.1", text: "Represent and model with vector quantities." }, { id: "PC.NVMQ.2.2", text: "Use the coordinates of an initial point and of a terminal point to find the components of a vector." }] },
        { code: "PC.NVMQ.3", name: "Modeling with Vectors", subtopics: [{ id: "PC.NVMQ.3.1", text: "Represent and model with vector quantities." }, { id: "PC.NVMQ.3.2", text: "Solve problems involving velocity and other quantities that can be represented by vectors." }] },
        { code: "PC.NVMQ.4", name: "Operations on Vectors", subtopics: [{ id: "PC.NVMQ.4.1", text: "Add and subtract vectors using components of the vectors and graphically." }, { id: "PC.NVMQ.4.2", text: "Given the magnitude and direction of two vectors, determine the magnitude of their sum and of their difference." }] },
        { code: "PC.NVMQ.5", name: "Scalar Multiplication", subtopics: [{ id: "PC.NVMQ.5.1", text: "Multiply a vector by a scalar, representing the multiplication graphically and computing the magnitude of the scalar multiple." }] },
        { code: "PC.NVMQ.6", name: "Using Matrices for Data", subtopics: [{ id: "PC.NVMQ.6.1", text: "Use matrices to represent and manipulate data." }] },
        { code: "PC.NVMQ.7", name: "Operations with Matrices", subtopics: [{ id: "PC.NVMQ.7.1", text: "Perform operations with matrices of appropriate dimensions including addition, subtraction, and scalar multiplication." }] },
        { code: "PC.NVMQ.8", name: "Properties of Matrix Multiplication", subtopics: [{ id: "PC.NVMQ.8.1", text: "Understand that, unlike multiplication of numbers, matrix multiplication for square matrices is not a commutative operation, but still satisfies the associative and distributive properties." }] },
        { code: "PC.NVMQ.9", name: "Zero, Identity, and Inverses", subtopics: [{ id: "PC.NVMQ.9.1", text: "Understand that the zero and identity matrices play a role in matrix addition and multiplication similar to the role of 0 and 1 in the real numbers." }, { id: "PC.NVMQ.9.2", text: "The determinant of a square matrix is nonzero if and only if the matrix has a multiplicative inverse." }] },
        { code: "PC.NVMQ.10", name: "Matrices as Vector Transformations", subtopics: [{ id: "PC.NVMQ.10.1", text: "Multiply a vector by a matrix of appropriate dimension to produce another vector." }, { id: "PC.NVMQ.10.2", text: "Work with matrices as transformations of vectors." }] },
        { code: "PC.NVMQ.11", name: "2×2 Matrix Transformations of the Plane", subtopics: [{ id: "PC.NVMQ.11.1", text: "Apply 2 × 2 matrices as transformations of the plane." }, { id: "PC.NVMQ.11.2", text: "Interpret the absolute value of the determinant in terms of area." }] },
      ],
    },
  ],
}

DISTRICT_TAXONOMY.south_carolina["precalculus"] = SC_PRECALCULUS_OFFICIAL
DISTRICT_TAXONOMY.ap_physics_1 = AP_PHYSICS_1_TAXONOMY

function normalizeApPhysicsObjectiveCode(code) {
  const match = String(code || "").match(/^APPhy1\.(\d+\.\d+)$/)
  return match ? match[1] : String(code || "")
}

function normalizeApPhysicsTaxonomy(taxonomy) {
  if (!taxonomy) return taxonomy
  return {
    ...taxonomy,
    standards: (taxonomy.standards || []).map((standard) => ({
      ...standard,
      objectives: (standard.objectives || []).map((objective) => ({
        ...objective,
        code: normalizeApPhysicsObjectiveCode(objective.code),
        subtopics: (objective.subtopics || []).map((subtopic) => ({
          ...subtopic,
          id: subtopic.raw_code || subtopic.id,
        })),
      })),
    })),
  }
}

// ─────────────────────────────────────────────
//  Lookup helpers
// ─────────────────────────────────────────────

/** Get taxonomy for a state + subject combo. Returns null if not found. */
function normaliseSubjectName(name) {
  return (name || "").toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\biv\b/g, "4")
    .replace(/\biii\b/g, "3")
    .replace(/\bii\b/g, "2")
    .replace(/\bvi\b/g, "6")
    .replace(/\bvii\b/g, "7")
    .replace(/\bviii\b/g, "8")
}

export function getDistrictTaxonomy(state, subjectName) {
  const subjectLower = normaliseSubjectName(subjectName)

  // National/international curricula — bypass state, match directly on subject name
  const NATIONAL_KEYS = ["cambridge", "ap ", "sat", "act", "ib ", "igcse", "as level", "a level", "9709", "grade 5-8 maths revision", "grades 5-8 maths revision", "ks3", "levels 5-8"]
  for (const key of NATIONAL_KEYS) {
    if (subjectLower.includes(key)) {
      // Search all states for a matching subject key
      for (const stateData of Object.values(DISTRICT_TAXONOMY)) {
        for (const subjKey of Object.keys(stateData)) {
          if (
            subjectLower.includes(subjKey) ||
            (subjKey === "grade 5-8 maths revision" && subjectLower.includes("grades 5-8 maths revision"))
          ) {
            const taxonomy = stateData[subjKey]
            return subjKey === "ap physics 1" ? normalizeApPhysicsTaxonomy(taxonomy) : taxonomy
          }
        }
      }
    }
  }

  // State-specific lookup
  if (state) {
    const stateKey = state.toLowerCase().trim().replace(/\s+/g, "_")
    const stateData = DISTRICT_TAXONOMY[stateKey]
    if (stateData) {
      for (const key of Object.keys(stateData)) {
        if (subjectLower.includes(key)) {
          const taxonomy = stateData[key]
          return key === "ap physics 1" ? normalizeApPhysicsTaxonomy(taxonomy) : taxonomy
        }
      }
    }
  }

  // Fallback: search all states (handles missing/wrong state, or subjects that span states)
  for (const stateData of Object.values(DISTRICT_TAXONOMY)) {
    for (const key of Object.keys(stateData)) {
      if (subjectLower.includes(key)) {
        const taxonomy = stateData[key]
        return key === "ap physics 1" ? normalizeApPhysicsTaxonomy(taxonomy) : taxonomy
      }
    }
  }
  return null
}

/** Get a specific objective by code */
export function getObjectiveByCode(state, subjectName, code) {
  const taxonomy = getDistrictTaxonomy(state, subjectName)
  if (!taxonomy) return null
  for (const std of taxonomy.standards) {
    for (const obj of std.objectives) {
      if (obj.code === code) return { ...obj, standardCode: std.code, standardName: std.name }
    }
  }
  return null
}

/** Get all objective codes flat, with their standard info — used by dashboard charts */
export function getAllObjectives(state, subjectName) {
  const taxonomy = getDistrictTaxonomy(state, subjectName)
  if (!taxonomy) return []
  const result = []
  for (const std of taxonomy.standards) {
    for (const obj of std.objectives) {
      result.push({
        ...obj,
        standardCode: std.code,
        standardName: std.name,
      })
    }
  }
  return result
}

/** Build a flat list of all objective codes for the Claude prompt */
export function getObjectiveCodesForPrompt(state, subjectName) {
  const taxonomy = getDistrictTaxonomy(state, subjectName)
  if (!taxonomy) return []
  const result = []
  for (const std of taxonomy.standards) {
    for (const obj of std.objectives) {
      result.push({ code: obj.code, name: obj.name, subtopics: obj.subtopics || [] })
    }
  }
  return result
}
