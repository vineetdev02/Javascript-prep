// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  08_usecallback-when-to-use.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useCallback — when to use
//
// WHAT YOU WILL MASTER HERE:
//   1. useCallback IS useMemo — one line proves it
//   2. Why useCallback alone does NOTHING (the trap nobody expects)
//   3. The broken-chain problem: one unmemoized link kills everything
//   4. The stale closure useCallback([]) creates — PROVEN
//   5. When NOT to use it (which is most of the time)
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/08_usecallback-when-to-use.js"
//
// Prerequisite: 07_usememo-when-to-use.js. This file is the function-shaped
// half of the same idea.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useCallback:
// Returns the SAME function reference across renders, as long as the deps
// have not changed.
//
// If interviewer says "explain it simply", say:
// "It is useMemo for functions. useCallback(fn, deps) is exactly
//  useMemo(() => fn, deps). It caches the function identity, not a result."
//
// If interviewer asks "why does it matter?", say:
// "Because a function defined in a component body is a NEW object every
//  render. Pass it to a memoized child and the memo never hits. Put it in a
//  dep array and the effect fires forever. useCallback freezes the identity.
//  But it does nothing on its own — the child must be memoized too, and if
//  it is not, useCallback is pure cost."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   caches the FUNCTION, not the result
//
// The distinction people fumble in interviews:
//
//   useMemo(() => compute(), [x])     → caches what compute() RETURNS
//   useCallback(() => compute(), [x]) → caches the FUNCTION ITSELF
//   useMemo(() => () => compute(), [x]) → the same as useCallback
//
// Why functions need this at all:
//
//   function Parent() {
//     const handleClick = () => {};    // ← a NEW function object, every render
//     return <Child onClick={handleClick} />;
//   }
//
//   Object.is(render1Fn, render2Fn) === false. Always. Two identical arrow
//   functions are never equal. That is JavaScript, not React.
//
// Runtime rule:
//   useCallback only affects IDENTITY. It never stops the function from
//   being created — the closure is allocated every render regardless. You
//   are choosing which reference to KEEP, not avoiding an allocation.
//
// Practical rule:
//   useCallback is worth it only when the identity is OBSERVED by something:
//     • a React.memo'd child
//     • a useEffect / useMemo / useCallback dep array
//     • a context value
//   No observer? No benefit. Just cost.
//
// Common trap:
//   Wrapping every handler in useCallback "for performance". If the child is
//   not memoized, nothing compares the identity, and you have added a deps
//   array, an Object.is check, and a retained closure for exactly zero gain.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD IT (and prove it is useMemo)
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  let renderCount = 0;

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { value: initial };
    const setState = (next) => {
      const value = typeof next === "function" ? next(hooks[slot].value) : next;
      if (Object.is(value, hooks[slot].value)) return;
      hooks[slot].value = value;
      render();
    };
    return [hooks[slot].value, setState];
  }

  function useMemo(factory, deps) {
    const slot = cursor++;
    const prev = hooks[slot];
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
    if (changed) hooks[slot] = { deps, value: factory() };
    return hooks[slot].value;
  }

  // ── THE ENTIRE HOOK. One line. ──────────────────────────────────
  function useCallback(fn, deps) {
    return useMemo(() => fn, deps);
  }
  // Note what happens: `fn` is created by the CALLER on every render and
  // passed in. useCallback just decides whether to keep the new one or
  // return the cached one. The allocation always happens.

  function render() {
    cursor = 0;
    renderCount++;
    return component();
  }

  function mount(fn) {
    component = fn;
    return render();
  }

  return { useState, useMemo, useCallback, mount, getRenderCount: () => renderCount };
}

// A React.memo'd child that reports whether it re-rendered:
function createMemoChild(name) {
  let lastProps = null;
  let renders = 0;
  return {
    name,
    receive(props) {
      const changed = !lastProps ||
        Object.keys(props).some(k => !Object.is(props[k], lastProps[k]));
      if (changed) renders++;
      lastProps = props;
    },
    getRenders: () => renders,
  };
}

// A NON-memoized child — re-renders whenever the parent does, always:
function createPlainChild(name) {
  let renders = 0;
  return { name, receive: () => { renders++; }, getRenders: () => renders };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE IDENTITY PROBLEM
// ══════════════════════════════════════════════════════════════════

console.log("§4 — a function is a new object every render:\n");

const R1 = createMiniReact();
const plainFns = [];
const memoFns = [];
let bump1;

R1.mount(() => {
  const [n, set] = R1.useState(0);
  bump1 = () => set(n + 1);
  plainFns.push(() => {});                        // a fresh arrow each render
  memoFns.push(R1.useCallback(() => {}, []));     // the cached one
  return n;
});

bump1(); bump1();

console.log("  after 3 renders:");
console.log("    plain arrow identical?", plainFns[0] === plainFns[1],
  "← three different function objects");
console.log("    useCallback identical?", memoFns[0] === memoFns[1] && memoFns[1] === memoFns[2],
  "← one function object, kept");
console.log("\n  Two identical arrow functions are never ===. That is plain");
console.log("  JavaScript. React just compares with Object.is, so a fresh");
console.log("  function always looks like a changed prop.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE TRAP: useCallback ALONE DOES NOTHING
// ══════════════════════════════════════════════════════════════════
//
// This is the question that separates people who read the docs from people
// who have actually profiled a React app.

console.log("§5 — useCallback WITHOUT React.memo:\n");

// ── useCallback, but a PLAIN child ──────────────────────────────
const plainChild = createPlainChild("Button");
const R2 = createMiniReact();
let bump2;
R2.mount(() => {
  const [n, set] = R2.useState(0);
  bump2 = () => set(n + 1);
  const onClick = R2.useCallback(() => {}, []);   // stable identity...
  plainChild.receive({ onClick });                // ...but nobody compares it
  return n;
});
bump2(); bump2();

// ── React.memo, but a FRESH function ────────────────────────────
const memoChildBadProp = createMemoChild("Button");
const R3 = createMiniReact();
let bump3;
R3.mount(() => {
  const [n, set] = R3.useState(0);
  bump3 = () => set(n + 1);
  memoChildBadProp.receive({ onClick: () => {} }); // fresh fn defeats the memo
  return n;
});
bump3(); bump3();

// ── BOTH ────────────────────────────────────────────────────────
const memoChildGood = createMemoChild("Button");
const R4 = createMiniReact();
let bump4;
R4.mount(() => {
  const [n, set] = R4.useState(0);
  bump4 = () => set(n + 1);
  const onClick = R4.useCallback(() => {}, []);
  memoChildGood.receive({ onClick });
  return n;
});
bump4(); bump4();

console.log("  parent renders 3 times. Child renders:\n");
console.log("    useCallback + plain child   →", plainChild.getRenders(),
  "🐛 useCallback bought NOTHING");
console.log("    fresh fn   + React.memo     →", memoChildBadProp.getRenders(),
  "🐛 memo bought NOTHING");
console.log("    useCallback + React.memo    →", memoChildGood.getRenders(),
  " ✅ only this combination works");

console.log("\n  Read the first row again. The function identity was perfectly");
console.log("  stable — and the child re-rendered every time anyway, because a");
console.log("  non-memoized child ALWAYS re-renders when its parent does. It");
console.log("  never looks at its props.");
console.log("\n  useCallback and React.memo are useless apart. You need BOTH");
console.log("  ends of the wire. That is why 'wrap the handler in useCallback'");
console.log("  as a reflex is cargo cult — most of the time the child is not");
console.log("  memoized and you have added cost for zero benefit.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE BROKEN CHAIN
// ══════════════════════════════════════════════════════════════════
//
// Even with both ends memoized, ONE unmemoized value anywhere in the chain
// breaks everything downstream. Memoization is all-or-nothing per path.

console.log("§6 — one weak link breaks the chain:\n");

const chainChild = createMemoChild("Chart");
const R5 = createMiniReact();
let bump5;

R5.mount(() => {
  const [n, set] = R5.useState(0);
  bump5 = () => set(n + 1);

  const config = { theme: "dark" };               // 🐛 NOT memoized

  // The callback IS memoized... but it depends on `config`, which is new
  // every render, so the callback is new every render too.
  const onSelect = R5.useCallback(() => config.theme, [config]);

  chainChild.receive({ onSelect });
  return n;
});
bump5(); bump5();

const fixedChild = createMemoChild("Chart");
const R6 = createMiniReact();
let bump6;
R6.mount(() => {
  const [n, set] = R6.useState(0);
  bump6 = () => set(n + 1);
  const config = R6.useMemo(() => ({ theme: "dark" }), []);   // ✅ memoized
  const onSelect = R6.useCallback(() => config.theme, [config]);
  fixedChild.receive({ onSelect });
  return n;
});
bump6(); bump6();

console.log("  const config = { theme: 'dark' };            // not memoized");
console.log("  const onSelect = useCallback(..., [config]); // memoized, but...");
console.log("    → child rendered", chainChild.getRenders(), "times 🐛");
console.log("\n  const config = useMemo(() => ({...}), []);   // memoized");
console.log("  const onSelect = useCallback(..., [config]);");
console.log("    → child rendered", fixedChild.getRenders(), "time  ✅");

console.log("\n  The useCallback was correct. Its DEP was not. A memoized value");
console.log("  that depends on an unmemoized value is not memoized.");
console.log("\n  This is why manual memoization is so fragile: it only works if");
console.log("  EVERY link holds, and one careless object literal three files");
console.log("  away silently undoes all of it. Nothing warns you. It is also");
console.log("  exactly the argument for React Compiler.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE STALE CLOSURE useCallback CREATES
// ══════════════════════════════════════════════════════════════════

console.log("§7 — useCallback([]) freezes more than you think:\n");

const R7 = createMiniReact();
let setCount7, staleHandler, freshHandler;

R7.mount(() => {
  const [count, setCount] = R7.useState(0);
  setCount7 = setCount;

  // ❌ [] — "it never needs to change!"
  staleHandler = R7.useCallback(() => count, []);
  // ✅ [count] — honest
  freshHandler = R7.useCallback(() => count, [count]);

  return count;
});

setCount7(1);
setCount7(2);
setCount7(3);

console.log("  count is now 3.");
console.log("    useCallback(() => count, [])      →", staleHandler(),
  "🐛 frozen at render #1");
console.log("    useCallback(() => count, [count]) →", freshHandler(), "✅ current");

console.log("\n  The [] version is stable AND WRONG. A click handler that reads");
console.log("  a three-render-old count and submits it to your API.");
console.log("\n  And note the irony: [count] makes the callback correct, but its");
console.log("  identity now changes on every count change — so the memoized");
console.log("  child re-renders anyway, and the useCallback bought nothing.");
console.log("\n  That tension is the whole difficulty. The escapes:");
console.log("    • functional updater: setCount(c => c+1) reads nothing → []");
console.log("      is honest AND stable. Best fix by far.");
console.log("    • a ref holding the latest value (→ 05_useref §8)");
console.log("    • useEffectEvent, once it lands");
console.log("    • React Compiler, which handles this at the right granularity\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHEN TO ACTUALLY USE IT
// ══════════════════════════════════════════════════════════════════
//
//   ✅ USE useCallback when the identity is OBSERVED:
//     • the child is wrapped in React.memo
//     • the function is a dep of useEffect/useMemo/useCallback
//     • the function goes into a context value
//     • it is a custom hook's return value (you do not control the caller,
//       so you must be a good citizen and return a stable reference)
//
//   ❌ DO NOT bother when:
//     • the child is a plain component (it re-renders regardless) → §5
//     • the handler goes to a DOM element: <button onClick={fn}> — React's
//       event system does not care about identity at all → 11_synthetic-events
//     • the component is cheap to re-render (most are)
//     • you are doing it "just in case" — that is how a codebase ends up with
//       a useCallback around every function and slower renders than before
//
//   The measurement rule:
//     Do not memoize on suspicion. React DevTools Profiler tells you which
//     components actually cost time. Memoize those. Everything else is
//     complexity you pay for on every render, forever.
//
//   The custom-hook exception is worth calling out — it is the one case where
//   memoizing "just in case" is CORRECT, because you cannot know whether your
//   caller will put your return value in a dep array.


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real React
//   ───────────               ──────────
//   useMemo(() => fn, deps)   genuinely the same implementation shape —
//                             updateCallback stores [callback, deps]
//   n/a                       setState / dispatch are stable WITHOUT
//                             useCallback. Never wrap them.
//   n/a                       React Compiler memoizes at build time, at a
//                             finer grain, and only where it helps
//   n/a                       useEffectEvent (experimental): always-latest
//                             callback that is NOT a dep — the sanctioned
//                             answer to §7's tension
//
// A precise fact people get wrong:
//   useCallback does NOT prevent the function from being created. The arrow
//   is allocated on every render and handed to useCallback, which then throws
//   it away if the deps match. You are not saving an allocation — you are
//   choosing which reference survives. Anyone who says "useCallback avoids
//   re-creating the function" has it backwards.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — useCallback everywhere, app is slower:
//   No memoized children observing it. → §5. Pure overhead.
//
// Bug 2 — React.memo child re-renders anyway:
//   A fresh function prop. → §5, row 2.
//
// Bug 3 — The memo chain silently broken:
//   An unmemoized object in the callback's deps. → §6.
//
// Bug 4 — A handler submits a stale value:
//   useCallback([]) with a lie. → §7. Silent and shippable.
//
// Bug 5 — useEffect fires every render:
//   An unmemoized function in the deps. Parent passes onDone={() => {}}.
//
// Bug 6 — useCallback around setState:
//   setState is already stable. Wrapping it is noise.
//
// Bug 7 — useCallback on a DOM handler:
//   <button onClick={memoizedFn}> — React's event delegation never compares
//   handler identity. Zero benefit.
//
// Bug 8 — A custom hook returning a fresh function:
//   Every consumer's dep arrays and memos break, and they cannot fix it from
//   the outside. This one is the hook author's fault. → §8.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// Identity:
assert(plainFns[0] !== plainFns[1], "two identical arrows are different objects");
assert(memoFns[0] === memoFns[2], "useCallback keeps one reference across renders");
assert(Object.is(() => {}, () => {}) === false,
  "this is JavaScript, not React — arrows are never equal");

// THE headline: useCallback alone does nothing.
assert(plainChild.getRenders() === 3,
  "stable callback + PLAIN child → still 3 renders. useCallback bought nothing.");
assert(memoChildBadProp.getRenders() === 3,
  "fresh callback + MEMO child → still 3 renders. memo bought nothing.");
assert(memoChildGood.getRenders() === 1,
  "stable callback + MEMO child → 1 render. Both ends required.");

// The broken chain:
assert(chainChild.getRenders() === 3,
  "a memoized callback with an UNMEMOIZED dep is not memoized at all");
assert(fixedChild.getRenders() === 1,
  "memoize the dep too, and the chain holds");

// The stale closure:
assert(staleHandler() === 0, "useCallback([]) froze count at render #1 🐛");
assert(freshHandler() === 3, "useCallback([count]) reads the current value ✅");
assert(staleHandler() !== freshHandler(),
  "same component, same render — stability and correctness in direct conflict");

// useCallback IS useMemo:
const R8 = createMiniReact();
const viaCallback = [];
const viaMemo = [];
let bump8;
const fn = () => "x";
R8.mount(() => {
  const [n, set] = R8.useState(0);
  bump8 = () => set(n + 1);
  viaCallback.push(R8.useCallback(fn, []));
  viaMemo.push(R8.useMemo(() => fn, []));
  return n;
});
bump8();
assert(viaCallback[0] === viaMemo[0] && viaCallback[1] === viaMemo[1],
  "useCallback(fn, deps) === useMemo(() => fn, deps) — literally the same thing");

console.log("§11 — mini assertions passed for: useCallback");
console.log("\n  The row that matters: stable callback + plain child = 3 renders.");
console.log("  useCallback without React.memo is a no-op with a cost.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "when do you use useCallback?", answer like this:
//
//   "It's useMemo for functions — useCallback(fn, deps) is literally
//    useMemo(() => fn, deps). It caches the function's identity, because a
//    function defined in a component body is a new object every render, and
//    two identical arrows are never equal.
//
//    The thing I'd emphasise is that useCallback alone does nothing. If the
//    child isn't wrapped in React.memo, it re-renders whenever the parent does
//    and never looks at its props — so a perfectly stable callback changes
//    nothing, and you've paid for a deps array and a retained closure for
//    zero benefit. You need both ends of the wire. That's why wrapping every
//    handler 'for performance' is cargo cult.
//
//    It's also fragile. A memoized callback whose deps include an unmemoized
//    object isn't memoized — one careless object literal breaks the whole
//    chain and nothing warns you.
//
//    And there's a real tension: useCallback([]) is stable but freezes the
//    closure, so a handler submits a three-render-old value. Add [count] and
//    it's correct but the identity changes on every count change, so the memo
//    stops helping. The clean escape is usually the functional updater —
//    setCount(c => c + 1) reads nothing, so [] is both honest and stable.
//
//    One correction I'd make to a common claim: useCallback doesn't avoid
//    creating the function. The arrow is allocated every render regardless
//    and handed in; useCallback just decides which reference to keep.
//
//    So: memoize when something OBSERVES the identity — a memo'd child, a dep
//    array, a context value. And always in a custom hook's return value, since
//    you don't control the caller. Otherwise profile first."
//
// The "does nothing alone" point plus the allocation correction is the
// senior signal.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is useCallback?
// A1. useMemo for functions. useCallback(fn, deps) === useMemo(() => fn, deps).
//
// Q2. Does useCallback prevent the function from being created?
// A2. No. The arrow is allocated every render and passed in. useCallback only
//     decides which reference to keep.
//
// Q3. Does useCallback improve performance on its own?
// A3. No. Without an observer — memo, a dep array, context — it is pure cost.
//
// Q4. Why did my memo'd child still re-render?
// A4. A fresh function or object prop, or a memoized callback with an
//     unmemoized dep.
//
// Q5. Should you useCallback a DOM handler?
// A5. No. React's event delegation never compares handler identity.
//
// Q6. Should you wrap setState in useCallback?
// A6. No. It is already stable and guaranteed to be.
//
// Q7. What is the stability-vs-correctness tension?
// A7. [] is stable but stale; [dep] is correct but changes identity. Escape it
//     with the functional updater, a ref, or useEffectEvent.
//
// Q8. When is memoizing "just in case" correct?
// A8. In a custom hook's return value. You cannot know whether the caller
//     will put it in a dep array, so you must be stable by default.
//
// Q9. Does React Compiler remove the need for it?
// A9. Largely in compiled code, and at a finer grain than a human would. But
//     it bails out on impure components, and you still need to read existing
//     code that does it by hand.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useCallback?
//   Back : useMemo(() => fn, deps). Caches the FUNCTION, not a result.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : Identity only. The function is still allocated every render.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : useCallback without React.memo — a no-op with a cost.
//
// Flashcard 4:
//   Front: What breaks the chain?
//   Back : One unmemoized dep. Memoized-with-an-unmemoized-dep is not memoized.
//
// Flashcard 5:
//   Front: What is the [] tension?
//   Back : Stable but stale vs correct but unstable. Use the functional updater.
//
// Flashcard 6:
//   Front: When is it always right?
//   Back : A custom hook's returned function — you do not control the caller.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "It does nothing alone", and "it does not avoid the allocation."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write useCallback in terms of useMemo from memory. One line. Then explain
//   why the allocation still happens.
//
// Task 2:
//   Take §5's third case and remove React.memo from the child. Watch the
//   useCallback become worthless. Now you can spot this in a real PR.
//
// Task 3:
//   Fix §7 with the functional updater so [] is honest AND stable. That is
//   the resolution to the whole tension.
//
// Task 4:
//   Build the chain in §6 three levels deep. Break the memo at level 2 and
//   watch level 3 re-render. That is why manual memoization does not scale.
//
// Task 5:
//   Count the cost: add a counter for deps allocations and Object.is calls in
//   an app with 50 useCallbacks and no memoized children. That number is your
//   argument in the next code review.
//
// Task 6:
//   Explain in 60 seconds why useCallback without React.memo is pointless,
//   to someone who just added it to every handler in the codebase.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   useCallback(fn, deps) === useMemo(() => fn, deps). And it does NOTHING
//   unless something observes the identity.
//
// If you remember the common bug:
//   useCallback + a plain child = 3 renders and wasted cost. And one
//   unmemoized dep breaks the whole chain silently.
//
// If you remember the professional framing:
//   It does not avoid the allocation. Memoize where identity is observed,
//   always in custom hooks, and profile before the rest.
//
// NEXT TOPIC -> 09_uselayouteffect-vs-useeffect.js
