// ╔══════════════════════════════════════════════════════════════════╗
// ║        JAVASCRIPT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ Error Handling & Debugging — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to JavaScript Phase 1.
// Every numbered file is a deep-dive lesson with runnable code,
// detailed comments, traps, drills, and interview Q&A.
//
// Folder:
//   learning/phase-1-javascript/section-1.3-js-advanced-concepts/08_error-handling-and-debugging/
//
// Files:
// ├── index.js
// ├── 01_error-types.js
// ├── 02_custom-error-classes.js
// ├── 03_try-catch-scope.js
// ├── 04_unhandled-promise-rejection.js
// ├── 05_window-onerror.js
// ├── 06_console-methods.js
// ├── 07_breakpoints-in-devtools.js
// ├── 08_performance-profiling.js
// ├── 09_memory-snapshot.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. Error types (TypeError, ReferenceError) — Error names tell you what kind of failure occurred.
// 02. Custom Error classes — Custom errors represent domain-specific failures.
// 03. try/catch scope — try/catch creates block scopes; catch parameter is scoped to catch.
// 04. Unhandled promise rejection — Unhandled rejections are async errors nobody caught.
// 05. window.onerror — window.onerror is a browser last-resort uncaught error hook.
// 06. console methods — console has tools beyond log: table, time, trace, group, warn, error.
// 07. Breakpoints in DevTools — Breakpoints pause code so you can inspect stack, scope, and values.
// 08. Performance profiling — Performance profiling measures where time is really spent.
// 09. Memory snapshot — Memory snapshots show retained objects and reference paths.

const topics = [
  "Error types (TypeError, ReferenceError)",
  "Custom Error classes",
  "try/catch scope",
  "Unhandled promise rejection",
  "window.onerror",
  "console methods",
  "Breakpoints in DevTools",
  "Performance profiling",
  "Memory snapshot"
];

console.log("Error Handling & Debugging topic count:", topics.length);
console.log(topics.join(" | "));

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?
