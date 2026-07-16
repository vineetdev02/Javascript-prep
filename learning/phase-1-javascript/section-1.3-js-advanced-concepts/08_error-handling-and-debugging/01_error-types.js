// ╔══════════════════════════════════════════════════════════════════╗
// ║   Error Handling & Debugging  →  01_error-types.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Error types (TypeError, ReferenceError)
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
// Error types (TypeError, ReferenceError):
// Error names tell you what kind of failure occurred.
//
// If interviewer says "explain it simply", say:
// "Error names tell you what kind of failure occurred."
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
//   error class
//
// Runtime rule:
//   ReferenceError means missing binding; TypeError means invalid operation on a value
//
// Practical rule:
//   Read the error name before changing code.
//
// Common trap:
//   Catching all errors and ignoring what the type tells you.
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
//   node "learning/phase-1-javascript/section-1.3-js-advanced-concepts/08_error-handling-and-debugging/01_error-types.js"

class InterviewError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "InterviewError";
    this.code = code;
  }
}

function riskyOperation(shouldFail) {
  if (shouldFail) {
    throw new InterviewError("Error types (TypeError, ReferenceError) failed", "DEMO_FAILURE");
  }
  return "Error types (TypeError, ReferenceError) succeeded";
}

try {
  console.log(riskyOperation(false));
  riskyOperation(true);
} catch (error) {
  console.log(error.name, error.code, error.message);
} finally {
  console.log("cleanup for Error types (TypeError, ReferenceError)");
}

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
//   ReferenceError means missing binding; TypeError means invalid operation on a value
//
// Do not memorize only the final output.
// Memorize the mechanism that produces the output.

// ══════════════════════════════════════════════════════════════════
// § 5 — PREDICT THE OUTPUT DRILL
// ══════════════════════════════════════════════════════════════════

function predictionDrill() {
  const steps = [];

  steps.push("1. Identify topic: Error types (TypeError, ReferenceError)");
  steps.push("2. Apply rule: ReferenceError means missing binding; TypeError means invalid operation on a value");
  steps.push("3. Avoid trap: Catching all errors and ignoring what the type tells you.");
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
//   "I care about Error types (TypeError, ReferenceError) because it appears in real code when
//   I need to reason about control flow, state, references, and bugs."

// ══════════════════════════════════════════════════════════════════
// § 7 — COMMON BUG PATTERN
// ══════════════════════════════════════════════════════════════════
//
// Bug:
//   Catching all errors and ignoring what the type tells you.
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
    bug: "Catching all errors and ignoring what the type tells you.",
    rule: "ReferenceError means missing binding; TypeError means invalid operation on a value",
    fix: "Read the error name before changing code.",
  };
}

console.log("bug checklist:", bugChecklist());

// ══════════════════════════════════════════════════════════════════
// § 8 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked about "Error types (TypeError, ReferenceError)", answer like this:
//
//   "At a high level, Error names tell you what kind of failure occurred.
//    The important runtime rule is: ReferenceError means missing binding; TypeError means invalid operation on a value
//    A common trap is: Catching all errors and ignoring what the type tells you.
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
// A1. Error names tell you what kind of failure occurred.
//
// Q2. What is the runtime rule?
// A2. ReferenceError means missing binding; TypeError means invalid operation on a value
//
// Q3. What bug does this cause in real projects?
// A3. Catching all errors and ignoring what the type tells you.
//
// Q4. How do you avoid the bug?
// A4. Read the error name before changing code.
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
  topic: "Error types (TypeError, ReferenceError)",
  keyword: "error class",
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
//   Front: What is Error types (TypeError, ReferenceError)?
//   Back : Error names tell you what kind of failure occurred.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : ReferenceError means missing binding; TypeError means invalid operation on a value
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Catching all errors and ignoring what the type tells you.
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
// For "Error types (TypeError, ReferenceError)", practice these levels:
//
// Level 1 — Definition:
//   Error names tell you what kind of failure occurred.
//
// Level 2 — Mechanism:
//   ReferenceError means missing binding; TypeError means invalid operation on a value
//
// Level 3 — Failure mode:
//   Catching all errors and ignoring what the type tells you.
//
// Level 4 — Production judgment:
//   Read the error name before changing code.
//
// Level 5 — Communication:
//   Explain it without rushing, then draw the flow:
//     input/state -> runtime rule -> output/side effect -> bug/fix
//
// A senior answer sounds like:
//   "The syntax is the easy part. The important part is the runtime rule.
//    In this case, the rule is: ReferenceError means missing binding; TypeError means invalid operation on a value
//    That is why the common bug happens: Catching all errors and ignoring what the type tells you."
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
//   "Here is a code snippet using Error types (TypeError, ReferenceError). Predict the output and
//    explain which JavaScript rule controls it."
//
// Your answer should include:
//   1. The first line that runs.
//   2. The important value/reference/callback that is created.
//   3. The exact rule: ReferenceError means missing binding; TypeError means invalid operation on a value
//   4. The output or state change.
//   5. The bug risk: Catching all errors and ignoring what the type tells you.
//
// If you cannot answer those five points, do not move to the next file yet.

// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   ReferenceError means missing binding; TypeError means invalid operation on a value
//
// If you remember the common bug:
//   Catching all errors and ignoring what the type tells you.
//
// If you remember the professional fix:
//   Read the error name before changing code.
//
// NEXT TOPIC -> 02_custom-error-classes.js

