// ╔══════════════════════════════════════════════════════════════════╗
// ║        JAVASCRIPT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ Asynchronous JavaScript — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to JavaScript Phase 1.
// Every numbered file is a deep-dive lesson with runnable code,
// detailed comments, traps, drills, and interview Q&A.
//
// Folder:
//   learning/phase-1-javascript/section-1.2-js-async-and-event-loop/04_asynchronous-javascript/
//
// Files:
// ├── index.js
// ├── 01_event-loop-mechanism.js
// ├── 02_call-stack.js
// ├── 03_web-apis-node-apis.js
// ├── 04_callback-queue-macro.js
// ├── 05_microtask-queue-priority.js
// ├── 06_promise-internals.js
// ├── 07_promise-chaining.js
// ├── 08_promise-all.js
// ├── 09_promise-allsettled.js
// ├── 10_promise-race.js
// ├── 11_promise-any.js
// ├── 12_async-await-syntax.js
// ├── 13_error-handling-in-async.js
// ├── 14_try-catch-finally.js
// ├── 15_callback-hell.js
// ├── 16_debounce.js
// ├── 17_throttle.js
// ├── 18_settimeout-vs-setinterval.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. Event Loop mechanism — The event loop coordinates the call stack, microtasks, macrotasks, and rendering.
// 02. Call Stack — The call stack tracks currently executing function calls in LIFO order.
// 03. Web APIs / Node APIs — Host environments provide async APIs like timers, DOM events, fetch, fs, and crypto.
// 04. Callback Queue (macro) — Macrotasks include timers, I/O callbacks, events, and message callbacks.
// 05. Microtask Queue (priority) — Microtasks from promises and `queueMicrotask` run before the next macrotask.
// 06. Promise internals — A Promise is a state machine: pending, fulfilled, or rejected.
// 07. Promise chaining — Each `.then()` returns a new promise whose value depends on return/throw.
// 08. Promise.all — Promise.all runs independent work concurrently and fails fast on first rejection.
// 09. Promise.allSettled — Promise.allSettled waits for every promise and reports each result.
// 10. Promise.race — Promise.race settles with the first input promise that settles.
// 11. Promise.any — Promise.any fulfills with the first successful promise and ignores rejections until all fail.
// 12. async/await syntax — async/await is promise syntax that reads like sequential code.
// 13. Error handling in async — Async errors are promise rejections unless properly awaited/caught.
// 14. try/catch/finally — finally runs cleanup after success or failure.
// 15. Callback hell — Callback hell is nested async flow with scattered error handling.
// 16. Debounce — Debounce waits until calls stop before running a function.
// 17. Throttle — Throttle runs at most once per interval while calls continue.
// 18. setTimeout vs setInterval — setTimeout runs once; setInterval repeats until cleared.

const topics = [
  "Event Loop mechanism",
  "Call Stack",
  "Web APIs / Node APIs",
  "Callback Queue (macro)",
  "Microtask Queue (priority)",
  "Promise internals",
  "Promise chaining",
  "Promise.all",
  "Promise.allSettled",
  "Promise.race",
  "Promise.any",
  "async/await syntax",
  "Error handling in async",
  "try/catch/finally",
  "Callback hell",
  "Debounce",
  "Throttle",
  "setTimeout vs setInterval"
];

console.log("Asynchronous JavaScript topic count:", topics.length);
console.log(topics.join(" | "));

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?
