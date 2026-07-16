// ╔══════════════════════════════════════════════════════════════════╗
// ║   Asynchronous JavaScript  →  15_callback-hell.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Callback hell
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
// Callback hell:
// Callback hell is nested async flow with scattered error handling.
//
// If interviewer says "explain it simply", say:
// "Callback hell is nested async flow with scattered error handling."
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
//   nested callbacks
//
// Runtime rule:
//   each callback depends on previous result and nests deeper
//
// Practical rule:
//   Flatten with promises, async/await, or small named functions.
//
// Common trap:
//   Thinking the only problem is indentation.
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
//   node "learning/phase-1-javascript/section-1.2-js-async-and-event-loop/04_asynchronous-javascript/15_callback-hell.js"

console.log("A sync start");

const job = Promise.resolve("Callback hell");
job.then((value) => console.log("C microtask:", value));

setTimeout(() => {
  console.log("D macrotask timer for Callback hell");
}, 0);

console.log("B sync end");

async function demoAsyncFlow() {
  const value = await Promise.resolve("awaited value");
  console.log("E async continuation:", value);
}

demoAsyncFlow();

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
//   each callback depends on previous result and nests deeper
//
// Do not memorize only the final output.
// Memorize the mechanism that produces the output.

// ══════════════════════════════════════════════════════════════════
// § 5 — PREDICT THE OUTPUT DRILL
// ══════════════════════════════════════════════════════════════════

function predictionDrill() {
  const steps = [];

  steps.push("1. Identify topic: Callback hell");
  steps.push("2. Apply rule: each callback depends on previous result and nests deeper");
  steps.push("3. Avoid trap: Thinking the only problem is indentation.");
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
//   "I care about Callback hell because it appears in real code when
//   I need to reason about control flow, state, references, and bugs."

// ══════════════════════════════════════════════════════════════════
// § 7 — COMMON BUG PATTERN
// ══════════════════════════════════════════════════════════════════
//
// Bug:
//   Thinking the only problem is indentation.
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
    bug: "Thinking the only problem is indentation.",
    rule: "each callback depends on previous result and nests deeper",
    fix: "Flatten with promises, async/await, or small named functions.",
  };
}

console.log("bug checklist:", bugChecklist());

// ══════════════════════════════════════════════════════════════════
// § 8 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked about "Callback hell", answer like this:
//
//   "At a high level, Callback hell is nested async flow with scattered error handling.
//    The important runtime rule is: each callback depends on previous result and nests deeper
//    A common trap is: Thinking the only problem is indentation.
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
// A1. Callback hell is nested async flow with scattered error handling.
//
// Q2. What is the runtime rule?
// A2. each callback depends on previous result and nests deeper
//
// Q3. What bug does this cause in real projects?
// A3. Thinking the only problem is indentation.
//
// Q4. How do you avoid the bug?
// A4. Flatten with promises, async/await, or small named functions.
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
  topic: "Callback hell",
  keyword: "nested callbacks",
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
//   Front: What is Callback hell?
//   Back : Callback hell is nested async flow with scattered error handling.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : each callback depends on previous result and nests deeper
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Thinking the only problem is indentation.
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
// For "Callback hell", practice these levels:
//
// Level 1 — Definition:
//   Callback hell is nested async flow with scattered error handling.
//
// Level 2 — Mechanism:
//   each callback depends on previous result and nests deeper
//
// Level 3 — Failure mode:
//   Thinking the only problem is indentation.
//
// Level 4 — Production judgment:
//   Flatten with promises, async/await, or small named functions.
//
// Level 5 — Communication:
//   Explain it without rushing, then draw the flow:
//     input/state -> runtime rule -> output/side effect -> bug/fix
//
// A senior answer sounds like:
//   "The syntax is the easy part. The important part is the runtime rule.
//    In this case, the rule is: each callback depends on previous result and nests deeper
//    That is why the common bug happens: Thinking the only problem is indentation."
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
//   "Here is a code snippet using Callback hell. Predict the output and
//    explain which JavaScript rule controls it."
//
// Your answer should include:
//   1. The first line that runs.
//   2. The important value/reference/callback that is created.
//   3. The exact rule: each callback depends on previous result and nests deeper
//   4. The output or state change.
//   5. The bug risk: Thinking the only problem is indentation.
//
// If you cannot answer those five points, do not move to the next file yet.

// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   each callback depends on previous result and nests deeper
//
// If you remember the common bug:
//   Thinking the only problem is indentation.
//
// If you remember the professional fix:
//   Flatten with promises, async/await, or small named functions.
//
// NEXT TOPIC -> 16_debounce.js

