// ╔══════════════════════════════════════════════════════════════════╗
// ║        JAVASCRIPT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ Closures & Memory — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to JavaScript Phase 1.
// Every numbered file is a deep-dive lesson with runnable code,
// detailed comments, traps, drills, and interview Q&A.
//
// Folder:
//   learning/06_closures-and-memory/
//
// Files:
// ├── index.js
// ├── 01_closure-definition.js
// ├── 02_practical-closure-examples.js
// ├── 03_module-pattern-via-closures.js
// ├── 04_memory-leaks-via-closures.js
// ├── 05_garbage-collection.js
// ├── 06_weakmap-weakset.js
// ├── 07_weakref.js
// ├── 08_finalizationregistry.js
// ├── 09_memoization-implementation.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. Closure definition — A closure is a function bundled with its lexical environment.
// 02. Practical closure examples — Closures power factories, configuration, counters, and callbacks.
// 03. Module pattern via closures — The module pattern uses closures to create private state and public methods.
// 04. Memory leaks via closures — Closures can keep large objects alive while the closure remains reachable.
// 05. Garbage collection — Garbage collection frees objects that are no longer reachable.
// 06. WeakMap / WeakSet — WeakMap and WeakSet hold object keys weakly.
// 07. WeakRef — WeakRef points at an object without keeping it alive.
// 08. FinalizationRegistry — FinalizationRegistry schedules cleanup after an object is collected.
// 09. Memoization implementation — Memoization caches pure function results by input.

const topics = [
  "Closure definition",
  "Practical closure examples",
  "Module pattern via closures",
  "Memory leaks via closures",
  "Garbage collection",
  "WeakMap / WeakSet",
  "WeakRef",
  "FinalizationRegistry",
  "Memoization implementation"
];

console.log("Closures & Memory topic count:", topics.length);
console.log(topics.join(" | "));

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?
