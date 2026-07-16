// ╔══════════════════════════════════════════════════════════════════╗
// ║        REACT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ Built-in Hooks — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to React Phase 2A, Section 2A.2 — Hooks.
// The docx calls this "the most interviewed topic". It is.
//
// Folder:
//   learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/
//
// Files:
// ├── index.js
// ├── 01_usestate-internals.js
// ├── 02_useeffect-dependency-array.js
// ├── 03_useeffect-cleanup.js
// ├── 04_usecontext-use-case.js
// ├── 05_useref-dom-mutable-ref.js
// ├── 06_usereducer-vs-usestate.js
// ├── 07_usememo-when-to-use.js
// ├── 08_usecallback-when-to-use.js
// ├── 09_uselayouteffect-vs-useeffect.js
// ├── 10_useimperativehandle.js
// ├── 11_usedeferredvalue.js
// ├── 12_usetransition.js
// ├── 13_useid.js
// ├── 14_usesyncexternalstore.js
// ├── 15_useinsertioneffect.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints.
//
// START HERE:
//   01_usestate-internals.js. You build the hook array. Every other file in
//   this section assumes you understand that array, because every hook lives
//   in it.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. useState — internals — state lives on the fiber, indexed by CALL ORDER.
// 02. useEffect — dependency array — a SYNC declaration, not a trigger list.
// 03. useEffect cleanup — runs before every re-run, not just unmount.
// 04. useContext — dependency injection, not state management. No selectors.
// 05. useRef — useState minus the setter. A box that survives, unwatched.
// 06. useReducer vs useState — useState IS useReducer. Impossible states die.
// 07. useMemo — two jobs, and job 2 (identity) is the important one.
// 08. useCallback — useMemo for functions. Does NOTHING without React.memo.
// 09. useLayoutEffect vs useEffect — before paint vs after. One line, all of it.
// 10. useImperativeHandle — the child decides what ref.current is.
// 11. useDeferredValue — two renders, urgent and interruptible. Not a debounce.
// 12. useTransition — "this update can wait." Fiber's payoff, eight years later.
// 13. useId — the id comes from TREE POSITION, because a counter breaks SSR.
// 14. useSyncExternalStore — one consistent snapshot. Tearing is a React 18 bug class.
// 15. useInsertionEffect — CSS-in-JS only. The ORDERING is the real lesson.

const topics = [
  "useState — internals",
  "useEffect — dependency array",
  "useEffect cleanup",
  "useContext — use case",
  "useRef — DOM + mutable ref",
  "useReducer vs useState",
  "useMemo — when to use",
  "useCallback — when to use",
  "useLayoutEffect vs useEffect",
  "useImperativeHandle",
  "useDeferredValue",
  "useTransition",
  "useId",
  "useSyncExternalStore",
  "useInsertionEffect",
];

console.log("Built-in Hooks topic count:", topics.length);
console.log(topics.join(" | "));

// ══════════════════════════════════════════════════════════════════
// THE THREE IDEAS BEHIND ALL FIFTEEN
// ══════════════════════════════════════════════════════════════════
//
// 1. CALL ORDER IS IDENTITY (01, and the Rules of Hooks)
//    Hooks live in a list on the fiber, matched by position. There is no
//    name. That single fact explains why hooks cannot go in conditions, why
//    custom hooks borrow the caller's slots, and why an early return crashes.
//
// 2. Object.is IS THE ONLY COMPARISON (02, 07, 08, 14)
//    Deps, memo, props, getSnapshot — all reference equality. Every render
//    makes new objects, so an object anywhere in that machinery means
//    "always changed". One rule, four hooks, half the bugs in React:
//      • an object dep     → an infinite loop      (02)
//      • a fresh prop      → memo does nothing     (07, 08)
//      • an object snapshot→ an infinite loop      (14)
//      • a fresh context   → every consumer renders (04)
//
// 3. THE COMMIT PHASE HAS AN ORDER (09, 15, and Fiber)
//      render → insertion effects → mutation → refs → layout effects
//              → 🎨 PAINT → passive effects
//    Learn that line and you have answered: why refs are null in render, why
//    useLayoutEffect can measure, why useEffect flickers, and what
//    useInsertionEffect is for.
//
// Everything else is a consequence.

// ══════════════════════════════════════════════════════════════════
// THE PATTERN THAT KEEPS RECURRING
// ══════════════════════════════════════════════════════════════════
//
// You will meet this THREE times — 05 §8, 03_custom-hooks/06 §7, and
// 03_custom-hooks/08 §7:
//
//   const savedRef = useRef(callback);
//   useEffect(() => { savedRef.current = callback; });     // every render
//   useEffect(() => {
//     const id = subscribe(() => savedRef.current());      // read the BOX
//     return () => unsubscribe(id);
//   }, []);                                                 // subscribe ONCE
//
// "Subscribe once, call the latest." It is the standard answer whenever a
// long-lived callback needs current values. The fact that React is building
// useEffectEvent to make it official tells you it is a workaround — a
// necessary, universal one.

// ══════════════════════════════════════════════════════════════════
// HOW OFTEN YOU ACTUALLY USE THESE
// ══════════════════════════════════════════════════════════════════
//
//   daily     : useState, useEffect, useRef, useContext
//   often     : useMemo, useCallback, useReducer
//   sometimes : useLayoutEffect, useTransition, useDeferredValue, useId
//   rarely    : useImperativeHandle, useSyncExternalStore
//   never     : useInsertionEffect (unless you write a CSS-in-JS runtime)
//
// Interviewers ask about the bottom rows to see whether you will BLUFF.
// The correct answer to "do you use useInsertionEffect?" is "no, and here is
// why it exists" — then pivot to the commit ordering, which is what they
// were really testing.

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What output does the example produce?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?

// NEXT -> 03_custom-hooks/01_rules-of-hooks.js
