// ╔══════════════════════════════════════════════════════════════════╗
// ║        JAVASCRIPT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ this Keyword — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to JavaScript Phase 1.
// Every numbered file is a deep-dive lesson with runnable code,
// detailed comments, traps, drills, and interview Q&A.
//
// Folder:
//   learning/phase-1-javascript/section-1.1-js-core-concepts/03_this-keyword/
//
// Files:
// ├── index.js
// ├── 01_this-in-global-context.js
// ├── 02_this-in-object-method.js
// ├── 03_this-in-arrow-function.js
// ├── 04_this-in-class.js
// ├── 05_call-vs-apply-vs-bind.js
// ├── 06_explicit-vs-implicit-binding.js
// ├── 07_new-binding.js
// ├── 08_losing-this-context.js
// ├── 09_this-in-event-listeners.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. this in global context — Global `this` depends on runtime and module system.
// 02. this in object method — A regular method call binds `this` to the object before the dot.
// 03. this in arrow function — Arrow functions do not create their own `this`; they close over lexical `this`.
// 04. this in class — `this` in classes is the instance for instance methods and the constructor for static methods.
// 05. call() vs apply() vs bind() — call/apply invoke immediately; bind returns a new function with fixed `this`.
// 06. Explicit vs implicit binding — Implicit binding uses `obj.fn()`, explicit binding uses call/apply/bind.
// 07. new binding — `new` creates an object, links the prototype, binds `this`, and returns the object.
// 08. Losing this context — Methods lose `this` when passed around as plain function values.
// 09. this in event listeners — Regular DOM listeners bind `this` to `event.currentTarget`; arrows do not.

const topics = [
  "this in global context",
  "this in object method",
  "this in arrow function",
  "this in class",
  "call() vs apply() vs bind()",
  "Explicit vs implicit binding",
  "new binding",
  "Losing this context",
  "this in event listeners"
];

console.log("this Keyword topic count:", topics.length);
console.log(topics.join(" | "));

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?
