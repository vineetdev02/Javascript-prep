// ╔══════════════════════════════════════════════════════════════════╗
// ║        REACT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ React Fundamentals — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to React Phase 2A, Section 2A.1 — React Core.
// Every numbered file is a deep-dive lesson with runnable code,
// detailed comments, traps, drills, and interview Q&A.
//
// Folder:
//   learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/
//
// Files:
// ├── index.js
// ├── 01_jsx-compilation.js
// ├── 02_virtual-dom-concept.js
// ├── 03_reconciliation-algorithm.js
// ├── 04_react-fiber-architecture.js
// ├── 05_keys-in-lists.js
// ├── 06_react-fragment.js
// ├── 07_conditional-rendering-patterns.js
// ├── 08_list-rendering.js
// ├── 09_component-types-class-vs-func.js
// ├── 10_controlled-vs-uncontrolled-components.js
// ├── 11_synthetic-events.js
// ├── 12_react-strictmode.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.
//
// NOTE ON THIS PHASE:
//   React needs a browser and a build step. These files do not fake that —
//   they IMPLEMENT the mechanism instead. You build createElement, the
//   reconciler, the fiber work loop, and the event system yourself, in
//   plain Node. If you can build it, you can answer any question about it.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. JSX compilation — JSX is sugar for function calls returning plain objects.
// 02. Virtual DOM concept — a description, not a faster DOM. Diff objects, write the DOM.
// 03. Reconciliation algorithm — same type + position = reuse. Anything else = destroy.
// 04. React Fiber architecture — React's call stack rebuilt as data, so it can pause.
// 05. Keys in lists — identity, not position. The index stays with the slot.
// 06. React.Fragment — one return value, zero DOM nodes. It exists because of JavaScript.
// 07. Conditional rendering — React skips null/undefined/booleans. 0 renders.
// 08. List rendering — map returns, forEach does not. And {items.sort()} mutates props.
// 09. Component types — an instance that mutates vs a render that freezes in time.
// 10. Controlled vs uncontrolled — who owns the value: React state, or the DOM node.
// 11. Synthetic events — ONE listener at the root, bubbling simulated through fibers.
// 12. React.StrictMode — a dev-only fuzzer for rules React already had.

const topics = [
  "JSX compilation",
  "Virtual DOM concept",
  "Reconciliation algorithm",
  "React Fiber architecture",
  "Keys in lists (why important)",
  "React.Fragment",
  "Conditional rendering patterns",
  "List rendering",
  "Component types (class vs func)",
  "Controlled vs uncontrolled components",
  "Synthetic events",
  "React.StrictMode",
];

console.log("React Fundamentals topic count:", topics.length);
console.log(topics.join(" | "));

// ══════════════════════════════════════════════════════════════════
// THE THREAD THROUGH THIS SECTION
// ══════════════════════════════════════════════════════════════════
//
// These twelve are not a list — they are one argument:
//
//   JSX compiles to objects (01)
//     → those objects are the Virtual DOM (02)
//       → which React diffs via reconciliation (03)
//         → executed by the Fiber work loop (04)
//
//   And then the consequences:
//     keys (05) are heuristic 2 of reconciliation
//     Fragments (06) exist because a function returns one value
//     conditionals (07) and lists (08) are just JavaScript expressions
//     StrictMode (12) enforces the purity Fiber's render phase requires
//
// If you can draw that chain, you understand React's core. Everything in
// Sections 2A.2 and 2A.3 is built on it.

// ══════════════════════════════════════════════════════════════════
// THE FIVE BUGS THIS SECTION EXPLAINS
// ══════════════════════════════════════════════════════════════════
//
//   "my input loses focus on every keystroke"
//     → a component defined inside a component. New type → remount. (03)
//
//   "the checkbox is on the wrong row after I delete one"
//     → key={index}. The index belongs to the slot, not the item. (05)
//
//   "there's a random 0 on my page"
//     → {items.length && <List/>}. && returns the operand. (07)
//
//   "I can't type in this input"
//     → value with no onChange. The render overwrites the keystroke. (10)
//
//   "my useEffect runs twice"
//     → StrictMode. Your effect cannot clean up after itself. (12)
//
// Every one of those is a real production bug, and every one is reproduced
// and PROVEN in the file that explains it.

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?

// NEXT SECTION -> section-2a.2-hooks/02_built-in-hooks/
