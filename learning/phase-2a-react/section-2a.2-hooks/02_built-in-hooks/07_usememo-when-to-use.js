// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  07_usememo-when-to-use.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useMemo — when to use
//
// WHAT YOU WILL MASTER HERE:
//   1. useMemo has TWO jobs, and the second one is the important one
//   2. Referential equality — why memo breaks without it, PROVEN
//   3. When useMemo makes things SLOWER — measured
//   4. The cache is one entry deep and dies on unmount
//   5. What React Compiler changes about all of this
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/07_usememo-when-to-use.js"
//
// Prerequisite: 02_useeffect-dependency-array.js — same Object.is deps rules.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useMemo:
// Caches the RESULT of a calculation between renders, recomputing only when
// a dependency changes.
//
// If interviewer says "explain it simply", say:
// "It remembers a computed value so you do not redo the work on every render.
//  If the deps have not changed, you get the same value back — the same
//  reference, not just an equal one."
//
// If interviewer asks "why does it matter?", say:
// "Two reasons, and the second is the one people miss. It skips expensive
//  work, sure. But more often it preserves REFERENCE identity, which is what
//  makes React.memo, useEffect deps, and context values work at all. An
//  object recreated every render defeats every memoization downstream."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   cache a value AND its identity
//
// THE TWO JOBS:
//
//   JOB 1 — skip expensive work
//     const sorted = useMemo(() => hugeList.sort(...), [hugeList]);
//     Rare. Most "expensive" calculations are not.
//
//   JOB 2 — keep a stable reference so downstream memoization works
//     const config = useMemo(() => ({ id }), [id]);
//     Common. This is the real reason useMemo exists in most codebases.
//
// Runtime rule:
//   useMemo does NOT guarantee the cache survives. React may throw it away
//   (for memory, for Offscreen). Treat it as a PERFORMANCE hint, never as
//   correctness. If your code breaks when the memo recomputes, it is broken.
//
// The cost — it is never free:
//   • the deps array is allocated every render
//   • Object.is runs on every dep, every render
//   • the closure is allocated every render (the function is created either way)
//   • the memoized value stays in memory until unmount
//
//   So useMemo trades CPU-later for memory-now plus a small CPU-always.
//   If the calculation is cheap, you have made it slower and used more RAM.
//
// Practical rule:
//   Memoize when (a) the calculation is genuinely expensive, or (b) the
//   result is an object/array/function that flows into memo, deps, or context.
//   Otherwise do not.
//
// Common trap:
//   useMemo(() => a + b, [a, b]). The addition is nanoseconds. The memo
//   machinery costs more than the work it skips.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD useMemo
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

  // ── THE WHOLE HOOK ──────────────────────────────────────────────
  function useMemo(factory, deps) {
    const slot = cursor++;
    const prev = hooks[slot];

    // Same Object.is comparison as useEffect. Same rules. Same traps.
    const changed = !prev || !deps ||
      deps.length !== prev.deps.length ||
      deps.some((d, i) => !Object.is(d, prev.deps[i]));

    if (changed) {
      hooks[slot] = { deps, value: factory() };   // recompute
    }
    return hooks[slot].value;                     // the SAME reference if cached
  }

  // useCallback is literally useMemo returning the function itself:
  function useCallback(fn, deps) {
    return useMemo(() => fn, deps);
  }

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


// ══════════════════════════════════════════════════════════════════
// § 4 — JOB 1: SKIPPING WORK
// ══════════════════════════════════════════════════════════════════

console.log("§4 — job 1: skip the expensive calculation:\n");

let workUnits = 0;
function expensiveFilter(items, query) {
  workUnits += items.length;                    // count the actual work
  return items.filter(i => i.includes(query));
}

const items = Array.from({ length: 1000 }, (_, i) => `item-${i}`);

// ── WITHOUT useMemo ─────────────────────────────────────────────
workUnits = 0;
const R1 = createMiniReact();
let setTheme1;
R1.mount(() => {
  const [query] = R1.useState("item-1");
  const [theme, setTheme] = R1.useState("light");
  setTheme1 = setTheme;
  expensiveFilter(items, query);                // runs on EVERY render
  return theme;
});
setTheme1("dark");                              // unrelated state changed
setTheme1("light");
const withoutMemo = workUnits;

// ── WITH useMemo ────────────────────────────────────────────────
workUnits = 0;
const R2 = createMiniReact();
let setTheme2;
R2.mount(() => {
  const [query] = R2.useState("item-1");
  const [theme, setTheme] = R2.useState("light");
  setTheme2 = setTheme;
  R2.useMemo(() => expensiveFilter(items, query), [query]);   // only on query
  return theme;
});
setTheme2("dark");
setTheme2("light");
const withMemo = workUnits;

console.log("  3 renders (theme toggled twice, query never changed):");
console.log("    without useMemo:", withoutMemo, "items scanned");
console.log("    with useMemo   :", withMemo, "items scanned");
console.log("\n  The theme has nothing to do with the filter, but without a memo");
console.log("  the filter re-runs anyway — because the whole function body");
console.log("  re-runs on every render. That is the job-1 case.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — JOB 2: REFERENTIAL EQUALITY (the important one)
// ══════════════════════════════════════════════════════════════════

console.log("§5 — job 2: keeping React.memo alive:\n");

// A memoized child — re-renders only when its props CHANGE by Object.is.
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
      return changed;
    },
    getRenders: () => renders,
  };
}

// ── WITHOUT useMemo ─────────────────────────────────────────────
const child1 = createMemoChild("Chart");
const R3 = createMiniReact();
let setTick3;
R3.mount(() => {
  const [tick, setTick] = R3.useState(0);
  setTick3 = setTick;
  const config = { color: "blue", size: 100 };     // 🐛 new object every render
  child1.receive({ config });
  return tick;
});
setTick3(1); setTick3(2);

// ── WITH useMemo ────────────────────────────────────────────────
const child2 = createMemoChild("Chart");
const R4 = createMiniReact();
let setTick4;
R4.mount(() => {
  const [tick, setTick] = R4.useState(0);
  setTick4 = setTick;
  const config = R4.useMemo(() => ({ color: "blue", size: 100 }), []);  // stable
  child2.receive({ config });
  return tick;
});
setTick4(1); setTick4(2);

console.log("  <MemoizedChart config={{ color:'blue', size:100 }} />");
console.log("  parent re-renders 3 times. The config NEVER actually changes.\n");
console.log("    plain object literal → child rendered", child1.getRenders(), "times 🐛");
console.log("    useMemo'd object     → child rendered", child2.getRenders(), "time  ✅");
console.log("\n  Same data. Same JSX. The memo on the child did NOTHING in the");
console.log("  first case, because a new object literal is a new reference and");
console.log("  React.memo compares with Object.is.");
console.log("\n  This is why React.memo so often 'does not work'. The child was");
console.log("  memoized; the PROP was not. Wrapping a component in memo while");
console.log("  passing it a fresh object is pure overhead — you added a");
console.log("  comparison that can never succeed.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — WHEN useMemo MAKES IT SLOWER
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the cost of memoizing cheap work:\n");

// Model what each path actually does per render.
function costOfPlainCalculation(n) {
  let ops = 0;
  for (let i = 0; i < n; i++) ops++;             // the work itself
  return ops;
}

function costOfMemoizedCalculation(n, depsChanged, depCount) {
  let ops = 0;
  ops += 1;                                      // allocate the deps array
  ops += 1;                                      // allocate the closure
  ops += depCount;                               // Object.is per dep
  if (depsChanged) {
    for (let i = 0; i < n; i++) ops++;           // ...and the work anyway
  }
  return ops;
}

console.log("  cost per render, in arbitrary 'ops':\n");
console.log("  calculation | plain | memo (cached) | memo (deps changed) | verdict");
console.log("  ------------|-------|---------------|---------------------|--------");

for (const [label, n] of [["a + b", 1], ["small map", 10], ["filter 1k", 1000]]) {
  const plain = costOfPlainCalculation(n);
  const cached = costOfMemoizedCalculation(n, false, 2);
  const recompute = costOfMemoizedCalculation(n, true, 2);
  const verdict = cached < plain ? "memo wins" : "memo LOSES";
  console.log(`  ${label.padEnd(11)} | ${String(plain).padStart(5)} | ` +
    `${String(cached).padStart(13)} | ${String(recompute).padStart(19)} | ${verdict}`);
}

console.log("\n  For `a + b`, useMemo costs 4 ops to avoid 1 op of work. You made");
console.log("  it four times slower AND used memory AND added a line of code");
console.log("  a reviewer has to think about.");
console.log("\n  And note the last column: when deps DO change, memo always costs");
console.log("  MORE than plain — the work runs anyway, plus the bookkeeping.");
console.log("  So memoizing a value whose deps change every render is strictly");
console.log("  worse than not memoizing at all.");
console.log("\n  (Job 2 is exempt from this table: there, you are not buying");
console.log("   speed, you are buying IDENTITY — and identity has no cheap");
console.log("   alternative.)\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE CACHE IS ONE ENTRY DEEP
// ══════════════════════════════════════════════════════════════════

console.log("§7 — useMemo is not a memoization library:\n");

let computeCount = 0;
const R5 = createMiniReact();
let setId;

R5.mount(() => {
  const [id, set] = R5.useState(1);
  setId = set;
  R5.useMemo(() => { computeCount++; return `data-${id}`; }, [id]);
  return id;
});

setId(2);
setId(1);          // back to a value we already computed!
setId(2);

console.log("  ids visited: 1 → 2 → 1 → 2");
console.log("  factory ran:", computeCount, "times");
console.log("\n  Going back to id=1 did NOT hit a cache. useMemo remembers");
console.log("  exactly ONE entry — the last deps and the last value. It is not");
console.log("  a memoize() with a keyed cache.");
console.log("\n  It also dies on unmount. Navigate away and back, and every");
console.log("  memo in that subtree recomputes from scratch. If you need a");
console.log("  real cache across mounts, that is React Query, or a module-level");
console.log("  Map, or the `cache()` API in RSC.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — useMemo IS A HINT, NOT A GUARANTEE
// ══════════════════════════════════════════════════════════════════
//
// Straight from React's docs: React may throw away the cache. Reasons
// include memory pressure and Offscreen/Activity components.
//
// So this is a REAL BUG, even though it looks clever:
//
//   ❌ const id = useMemo(() => crypto.randomUUID(), []);
//      // "a stable id!" — until React drops the cache and the id changes,
//      // orphaning whatever was keyed to the old one.
//      ✅ useId(), or useRef, or useState(() => crypto.randomUUID())
//
//   ❌ useMemo(() => { analytics.track("viewed"); return x; }, [])
//      // a side effect in a memo. May run 0, 1, or 2 times. Use an effect.
//
//   ❌ const socket = useMemo(() => new WebSocket(url), [url]);
//      // if the cache is dropped you leak a socket with no cleanup path.
//      ✅ useEffect with a cleanup, or useRef.
//
// The rule:
//   If removing every useMemo from your app breaks CORRECTNESS, your app was
//   already broken. Removing them should only make it slower.


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REACT COMPILER CHANGES
// ══════════════════════════════════════════════════════════════════
//
// The forward-looking answer that shows you follow the ecosystem:
//
// React Compiler (stable-ish as of React 19's rollout) auto-memoizes at
// BUILD time. It analyses your component, works out what depends on what,
// and inserts the caching for you — at a finer granularity than you would
// by hand.
//
// What that means practically:
//   • manual useMemo/useCallback largely become unnecessary in compiled code
//   • the compiler is more precise: it can memoize a single JSX subtree
//   • it BAILS OUT on components that break the Rules of React — which is
//     another reason to keep render pure
//   • existing useMemo calls are not wrong, just redundant
//
// The honest framing for an interview:
//   "The fact that a compiler had to be built is an admission that manual
//    memoization is hard to get right and easy to get wrong. But it is not
//    everywhere yet, and it does not remove the need to UNDERSTAND
//    referential equality — you still have to read the code you did not write,
//    and the compiler bails out on impure components without telling you
//    loudly."


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — React.memo does nothing:
//   You pass a fresh object/array/function prop. → §5. The #1 cause.
//
// Bug 2 — useEffect fires every render:
//   An unmemoized object in the deps. → 02_useeffect-dependency-array.js.
//
// Bug 3 — The whole app re-renders:
//   An unmemoized context value. → 04_usecontext-use-case.js §6.
//
// Bug 4 — useMemo everywhere and the app got slower:
//   → §6. Every memo has a cost, paid on every render, forever.
//
// Bug 5 — A "stable" ID changes randomly:
//   useMemo used for identity. It is a hint, not a guarantee. → §8.
//
// Bug 6 — Stale value inside the memo:
//   A missing dep. The exhaustive-deps rule applies to useMemo too.
//
// Bug 7 — Memoizing a value whose deps change every render:
//   Strictly slower than not memoizing. → §6's last column.
//
// Bug 8 — Memoizing the SHAPE but not the content:
//   useMemo(() => ({ user }), [user]) where user itself is fresh each render.
//   You moved the problem up one level.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// Job 1:
assert(withoutMemo === 3000, "no memo: the filter ran on all 3 renders");
assert(withMemo === 1000, "with memo: it ran once — theme changes did not touch it");

// Job 2 — the headline:
assert(child1.getRenders() === 3,
  "a fresh object prop → React.memo re-renders EVERY time. memo did nothing.");
assert(child2.getRenders() === 1,
  "a useMemo'd object prop → the memoized child renders once ✅");

// Prove WHY, in isolation:
assert(Object.is({ a: 1 }, { a: 1 }) === false,
  "two identical objects are different references — this is the whole reason");

// The cost:
const cheapPlain = costOfPlainCalculation(1);
const cheapMemo = costOfMemoizedCalculation(1, false, 2);
assert(cheapMemo > cheapPlain,
  "memoizing `a + b` costs MORE than just computing it, every render");
const expensivePlain = costOfPlainCalculation(1000);
const expensiveMemo = costOfMemoizedCalculation(1000, false, 2);
assert(expensiveMemo < expensivePlain, "...but for real work, the memo wins big");
assert(costOfMemoizedCalculation(1000, true, 2) > costOfPlainCalculation(1000),
  "when deps DO change, memo is always strictly worse — work plus bookkeeping");

// One entry deep:
assert(computeCount === 4,
  "revisiting id=1 recomputed — useMemo caches ONE entry, not a keyed map");

// useCallback is useMemo:
const R6 = createMiniReact();
const fns = [];
let bump6;
R6.mount(() => {
  const [n, set] = R6.useState(0);
  bump6 = () => set(n + 1);
  fns.push(R6.useCallback(() => {}, []));
  return n;
});
bump6(); bump6();
assert(fns[0] === fns[1] && fns[1] === fns[2],
  "useCallback(fn, deps) === useMemo(() => fn, deps) — same identity across renders");

console.log("§11 — mini assertions passed for: useMemo");
console.log("\n  The one that matters: 3 renders vs 1. React.memo on the child");
console.log("  was useless until the PROP got a stable identity.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "when do you use useMemo?", answer like this:
//
//   "It caches a computed value between renders, recomputing only when deps
//    change by Object.is. But it has two jobs and people only talk about the
//    first one.
//
//    Job one is skipping expensive work — filtering ten thousand rows on a
//    render triggered by an unrelated theme toggle. That's real but rarer
//    than people think.
//
//    Job two is preserving referential identity, and that's what I use it for
//    most. If I pass config={{ color: 'blue' }} to a React.memo'd child, that
//    object literal is a new reference every render, so memo compares with
//    Object.is, sees a change, and re-renders every time. The child was
//    memoized; the prop wasn't. Same story with an object in a useEffect dep
//    array — that's the infinite loop — or an unmemoized context value, which
//    re-renders every consumer in the app.
//
//    The cost matters too. useMemo isn't free: you allocate the deps array and
//    the closure every render, and run Object.is per dep. For something like
//    a + b, the machinery costs more than the work. And if the deps change
//    every render, memoizing is strictly worse — you pay the bookkeeping AND
//    do the work.
//
//    Two things people get wrong: the cache is ONE entry deep, so it isn't a
//    memoize() with a keyed cache and it dies on unmount. And React explicitly
//    says it may throw the cache away, so it's a performance hint, never
//    correctness. useMemo for a stable ID is a real bug.
//
//    Longer term React Compiler auto-memoizes at build time and makes most of
//    this manual work redundant — though the fact they built a compiler is an
//    admission that doing it by hand is hard to get right."
//
// Job 2 + the cost table + "hint not guarantee" is the full senior answer.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What are useMemo's two jobs?
// A1. Skip expensive work, and preserve referential identity so downstream
//     memo/deps/context work. The second is the common one.
//
// Q2. Why does React.memo often "not work"?
// A2. A fresh object, array, or function prop. memo compares by Object.is,
//     and a new reference always looks changed.
//
// Q3. Is useMemo free?
// A3. No. Deps array + closure allocation + Object.is per dep, every render,
//     plus retained memory. Cheap calculations get slower.
//
// Q4. Should you memo everything?
// A4. No. Only expensive work, or values flowing into memo/deps/context. And
//     never a value whose deps change every render — that's strictly worse.
//
// Q5. Does React guarantee the cache?
// A5. No. It may discard it. Never depend on it for correctness — a useMemo'd
//     UUID is a bug.
//
// Q6. How deep is the cache?
// A6. One entry. The last deps and the last value. And it dies on unmount.
//
// Q7. useMemo vs useCallback?
// A7. useCallback(fn, deps) === useMemo(() => fn, deps). Identical, one is
//     sugar for functions.
//
// Q8. Does React Compiler make it obsolete?
// A8. Largely, in compiled code — and at a finer grain. But it bails out on
//     impure components, and you still need to understand identity to read
//     existing code.
//
// Q9. useMemo or useState for an expensive initial value?
// A9. useState(() => expensive()) if it's state — the lazy initializer runs
//     exactly once and is guaranteed. useMemo isn't.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What are useMemo's two jobs?
//   Back : Skip expensive work; keep a stable reference.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : Object.is on deps. Cache is a HINT — React may drop it.
//
// Flashcard 3:
//   Front: Why doesn't React.memo work?
//   Back : You passed a fresh object/function prop. Memo the prop, not just
//          the component.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : Memoizing cheap work — the machinery costs more than the work.
//
// Flashcard 5:
//   Front: How deep is the cache?
//   Back : One entry, and it dies on unmount.
//
// Flashcard 6:
//   Front: When is memo strictly worse?
//   Back : When the deps change every render — bookkeeping plus the work.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Lead with job 2 (identity), name the cost, mention React Compiler.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write useMemo from memory. Then write useCallback in terms of it. One line.
//
// Task 2:
//   Break §5's fix: change the deps from [] to [tick]. Watch the memoized
//   child re-render every time again. Now the memo costs and buys nothing.
//
// Task 3:
//   Add a keyed cache (a Map) to the mini useMemo so §7's id=1 revisit hits.
//   Then explain why React does NOT do this by default. (Hint: unbounded memory.)
//
// Task 4:
//   Simulate React dropping the cache: clear hooks[slot] randomly. Which of
//   your app's useMemo calls would break? Those are bugs.
//
// Task 5:
//   Measure §6 for real with performance.now() and 100k renders. Find the
//   crossover point where useMemo starts winning. Now you have a number to
//   argue with instead of a vibe.
//
// Task 6:
//   Explain in 60 seconds why <MemoChild config={{}} /> defeats React.memo,
//   to someone who just wrapped everything in memo and saw no improvement.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Two jobs — skip work, and keep a stable reference. The second is why
//   your React.memo does nothing.
//
// If you remember the common bug:
//   A fresh object prop defeats memo, loops effects, and re-renders every
//   context consumer.
//
// If you remember the professional framing:
//   It costs something on every render, caches exactly one entry, dies on
//   unmount, and is a hint — never correctness.
//
// NEXT TOPIC -> 08_usecallback-when-to-use.js
