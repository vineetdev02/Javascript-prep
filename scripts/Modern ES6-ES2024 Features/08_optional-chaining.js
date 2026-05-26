// ╔══════════════════════════════════════════════════════════════════╗
// ║   Modern ES6-ES2024 Features  →  08_optional-chaining.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Optional chaining (?.)
//
// WHAT YOU WILL MASTER HERE:
//   1. Exact definition in interview language
//   2. Runtime mental model
//   3. Predict-output examples
//   4. Real bugs and production use cases
//   5. Senior-level follow-up questions
//   6. A mini drill you can run in Node or paste into the Playground


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Optional chaining (?.):
// Optional chaining safely stops on null or undefined.
//
// If interviewer says "explain it simply", say:
// "Optional chaining safely stops on null or undefined."
//
// If interviewer asks "why does it matter?", say:
// "Because this concept controls how JavaScript behaves in real apps:
// output order, object behavior, async behavior, memory behavior, or
// debugging behavior. If I cannot predict it, I cannot debug it."

// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   safe access
//
// Runtime rule:
//   `obj?.a?.b` returns undefined if a link is nullish
//
// Practical rule:
//   Use it for optional data, not required invariants.
//
// Common trap:
//   Hiding bugs by optional-chaining everything.
//
// A strong answer should not be just theory.
// A strong answer has this structure:
//
//   1. Define the concept.
//   2. Explain the runtime rule.
//   3. Predict output from a small example.
//   4. Explain the common mistake.
//   5. Connect it to real MERN code.

// ══════════════════════════════════════════════════════════════════
// § 3 — BASIC EXAMPLE
// ══════════════════════════════════════════════════════════════════
//
// Read the code first.
// Predict the output.
// Then run:
//   node "learning/07_modern-es6-es2024-features/08_optional-chaining.js"

const candidate = {
  name: "Asha",
  skills: ["JavaScript", "React", "Node"],
  meta: { level: "interview-ready" },
};

const { name, skills: [primarySkill, ...otherSkills], meta: { level } } = candidate;
console.log(name, primarySkill, otherSkills, level);

const featureReport = {
  topic: "Optional chaining (?.)",
  supported: true,
  category: "Modern ES6-ES2024 Features",
};

console.log(Object.entries(featureReport));

// ══════════════════════════════════════════════════════════════════
// § 4 — WHAT JUST HAPPENED?
// ══════════════════════════════════════════════════════════════════
//
// Explanation checklist:
//
//   • Which line runs first?
//   • Which values are created?
//   • Which callback/function/object is saved for later?
//   • Which rule from §2 decides the behavior?
//   • Which part would break in a real project?
//
// For this topic, the deciding rule is:
//   `obj?.a?.b` returns undefined if a link is nullish
//
// Do not memorize only the final output.
// Memorize the mechanism that produces the output.

// ══════════════════════════════════════════════════════════════════
// § 5 — PREDICT THE OUTPUT DRILL
// ══════════════════════════════════════════════════════════════════

function predictionDrill() {
  const steps = [];

  steps.push("1. Identify topic: Optional chaining (?.)");
  steps.push("2. Apply rule: `obj?.a?.b` returns undefined if a link is nullish");
  steps.push("3. Avoid trap: Hiding bugs by optional-chaining everything.");
  steps.push("4. Explain with code, not just words");

  return steps;
}

console.log("prediction drill:", predictionDrill());

// Expected idea:
//   You should be able to explain why each step exists.
//   If you can only repeat the answer but cannot trace it, revise again.

// ══════════════════════════════════════════════════════════════════
// § 6 — REAL MERN / FRONTEND / BACKEND USE CASES
// ══════════════════════════════════════════════════════════════════
//
// Where this shows up:
//
//   • React component bugs
//   • Node API request flow
//   • Express middleware behavior
//   • MongoDB query orchestration
//   • Browser event handlers
//   • Promise-based data loading
//   • Performance debugging
//   • Memory leaks in long-running apps
//
// Interview framing:
//   "I care about Optional chaining (?.) because it appears in real code when
//   I need to reason about control flow, state, references, and bugs."

// ══════════════════════════════════════════════════════════════════
// § 7 — COMMON BUG PATTERN
// ══════════════════════════════════════════════════════════════════
//
// Bug:
//   Hiding bugs by optional-chaining everything.
//
// Why it happens:
//   The developer remembers the syntax but not the runtime rule.
//
// Fix strategy:
//   1. Reproduce the bug with a tiny snippet.
//   2. State the rule out loud.
//   3. Change the code so the rule works in your favor.
//   4. Add a small test or console prediction.

function bugChecklist() {
  return {
    bug: "Hiding bugs by optional-chaining everything.",
    rule: "`obj?.a?.b` returns undefined if a link is nullish",
    fix: "Use it for optional data, not required invariants.",
  };
}

console.log("bug checklist:", bugChecklist());

// ══════════════════════════════════════════════════════════════════
// § 8 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked about "Optional chaining (?.)", answer like this:
//
//   "At a high level, Optional chaining safely stops on null or undefined.
//    The important runtime rule is: `obj?.a?.b` returns undefined if a link is nullish
//    A common trap is: Hiding bugs by optional-chaining everything.
//    In real MERN code, this matters because it affects async flow,
//    object behavior, debugging, or memory management."
//
// Then write a 5-10 line code example.
// Interviewers like candidates who can move from concept to code quickly.

// ══════════════════════════════════════════════════════════════════
// § 9 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is the exact definition?
// A1. Optional chaining safely stops on null or undefined.
//
// Q2. What is the runtime rule?
// A2. `obj?.a?.b` returns undefined if a link is nullish
//
// Q3. What bug does this cause in real projects?
// A3. Hiding bugs by optional-chaining everything.
//
// Q4. How do you avoid the bug?
// A4. Use it for optional data, not required invariants.
//
// Q5. How would you teach this to a junior developer?
// A5. Start from one tiny runnable snippet, ask them to predict output,
//     then explain the mechanism line by line.
//
// Q6. What should you never say in an interview?
// A6. Never give only a memorized sentence. Always connect it to runtime behavior.
//
// Q7. How can this be tested?
// A7. Build a tiny example with expected output and assert the result.

// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

const summary = {
  topic: "Optional chaining (?.)",
  keyword: "safe access",
  hasMentalModel: true,
  hasTrap: true,
};

assert(summary.hasMentalModel, "mental model exists");
assert(summary.hasTrap, "trap exists");
console.log("mini assertions passed for:", summary.topic);

// ══════════════════════════════════════════════════════════════════
// § 11 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is Optional chaining (?.)?
//   Back : Optional chaining safely stops on null or undefined.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : `obj?.a?.b` returns undefined if a link is nullish
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Hiding bugs by optional-chaining everything.
//
// Flashcard 4:
//   Front: How do you sound senior?
//   Back : Define it, trace the runtime, give a bug, give a fix.

// ══════════════════════════════════════════════════════════════════
// § 12 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rewrite the basic example without looking.
//
// Task 2:
//   Add one console.log before and after the key operation.
//
// Task 3:
//   Break the example intentionally using the common trap.
//
// Task 4:
//   Fix the broken version and explain why the fix works.
//
// Task 5:
//   Explain it in 60 seconds as if the interviewer interrupted you.

// ══════════════════════════════════════════════════════════════════
// § 13 — DEEP INTERVIEW EXPANSION
// ══════════════════════════════════════════════════════════════════
//
// The interviewer is not only checking whether you know the term.
// They are checking whether you can reason under pressure.
//
// For "Optional chaining (?.)", practice these levels:
//
// Level 1 — Definition:
//   Optional chaining safely stops on null or undefined.
//
// Level 2 — Mechanism:
//   `obj?.a?.b` returns undefined if a link is nullish
//
// Level 3 — Failure mode:
//   Hiding bugs by optional-chaining everything.
//
// Level 4 — Production judgment:
//   Use it for optional data, not required invariants.
//
// Level 5 — Communication:
//   Explain it without rushing, then draw the flow:
//     input/state -> runtime rule -> output/side effect -> bug/fix
//
// A senior answer sounds like:
//   "The syntax is the easy part. The important part is the runtime rule.
//    In this case, the rule is: `obj?.a?.b` returns undefined if a link is nullish
//    That is why the common bug happens: Hiding bugs by optional-chaining everything."
//
// A weak answer sounds like:
//   "I used it before" or "it just works like that."
//
// Do not give weak answers. Build the habit of tracing.

// ══════════════════════════════════════════════════════════════════
// § 14 — SECOND PRACTICE PROMPT
// ══════════════════════════════════════════════════════════════════
//
// Practice prompt:
//   "Here is a code snippet using Optional chaining (?.). Predict the output and
//    explain which JavaScript rule controls it."
//
// Your answer should include:
//   1. The first line that runs.
//   2. The important value/reference/callback that is created.
//   3. The exact rule: `obj?.a?.b` returns undefined if a link is nullish
//   4. The output or state change.
//   5. The bug risk: Hiding bugs by optional-chaining everything.
//
// If you cannot answer those five points, do not move to the next file yet.

// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   `obj?.a?.b` returns undefined if a link is nullish
//
// If you remember the common bug:
//   Hiding bugs by optional-chaining everything.
//
// If you remember the professional fix:
//   Use it for optional data, not required invariants.
//
// NEXT TOPIC -> 09_nullish-coalescing.js

