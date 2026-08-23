// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  03_avoiding-unnecessary-re-renders.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Avoiding unnecessary re-renders
//
// WHAT YOU WILL MASTER HERE:
//   1. Render ≠ repaint — the distinction most candidates get wrong
//   2. The FIVE things that trigger a render, and which ones you control
//   3. The full toolkit, ranked — structure first, memo last
//   4. Automatic batching: 4 setStates, 1 render — PROVEN
//   5. Re-render vs REMOUNT: the `key` trap that destroys state
//   6. High-frequency values that should never be state at all
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/03_avoiding-unnecessary-re-renders.js"
//
// Prerequisites: 01_react-memo-when-to-use.js and 02_referential-equality-problem.js.
// This file is the synthesis: 01 gave you one tool, 02 explained why it usually
// fails, and this one is the ranked toolkit you actually reach into.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// An unnecessary re-render:
// A component function that runs and produces output IDENTICAL to what is
// already on screen — so React reconciles it, finds no DOM change, and throws
// the work away.
//
// If interviewer says "explain it simply", say:
// "React re-runs a component when its state changes, its context changes, or
//  its parent re-renders. The third one is the problem: a component can re-run
//  hundreds of times and produce exactly the same output, and all that work is
//  discarded."
//
// If interviewer asks "why does it matter?", say:
// "Honestly — often it doesn't. A re-render is running one function and doing a
//  cheap tree diff. React is designed for it to be cheap, and premature
//  memoization makes apps slower and much harder to read. It matters when a
//  render is expensive or repeated across hundreds of nodes, and when it's
//  triggered at a high frequency — typing, dragging, scrolling. That's the real
//  skill: knowing which re-renders to care about."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   RENDER ≠ REPAINT
//
// The three phases, and where each optimization acts:
//
//   1. RENDER      — React calls your component function, gets elements.
//                    memo / restructuring skip work HERE.
//   2. RECONCILE   — React diffs the new element tree against the old.
//                    Correct keys make this cheap. → 2A.1/05_keys-in-lists.js
//   3. COMMIT      — React applies the DIFFS to the real DOM, then the browser
//                    paints. NOTHING is written if nothing changed.
//
// Runtime rule:
//   A re-render with unchanged output causes ZERO DOM mutations. The browser
//   does not repaint. The cost is phases 1 and 2 only — JavaScript, not layout.
//
// Practical rule:
//   Optimize renders that are (expensive) × (frequent). One expensive render on
//   mount is fine. A cheap render 60 times a second across 500 rows is not.
//
// Common trap:
//   "My component re-rendered, so the DOM was rewritten and my input lost
//    focus." No. A re-render does not touch the DOM node. Lost focus means the
//    component was REMOUNTED — a different bug with a different cause. → §8.


// ══════════════════════════════════════════════════════════════════
// § 3 — WHAT ACTUALLY TRIGGERS A RENDER
// ══════════════════════════════════════════════════════════════════
//
//   #  Trigger                        Can you avoid it?
//   ─  ─────────────────────────────  ────────────────────────────────────────
//   1  Own state changed (setState)   Only by not setting it (or same-value bail)
//   2  Own context value changed      Split the context; use a selector store
//   3  PARENT re-rendered             ✅ THE ONE YOU CONTROL. memo, or structure.
//   4  Own props changed              Necessary — that IS the data changing
//   5  Forced (key change, forceUpdate) Rare; usually intentional
//
// Row 3 is the entire topic. Rows 1, 2 and 4 are React doing its job.
//
// Two bailouts worth knowing (React does some of this FOR you):
//   • setState with a value Object.is-equal to the current one bails out — but
//     React may still re-render that component ONCE before bailing. So it stops
//     the cascade, not always the first render.
//   • If a re-rendering parent hands a child the exact same element object
//     (`children`), React skips re-rendering that child even with no memo.
//     That is why §6's composition fix works.

console.log("§3 — same-value setState bails out:\n");

function makeState(initial) {
  let value = initial, renders = 0, bailouts = 0;
  return {
    set(next) {
      if (Object.is(value, next)) { bailouts++; return; }   // ← React's check
      value = next; renders++;
    },
    stats: () => ({ renders, bailouts }),
  };
}

const status = makeState("idle");
["idle", "idle", "loading", "loading", "loading", "done"].forEach(s => status.set(s));
console.log("    6 setStatus calls, only 2 actual VALUE CHANGES:", JSON.stringify(status.stats()));
console.log("    → setting state to the SAME value is not a render. Object.is again.");
console.log("\n  This is why `setUser(user)` in a polling loop is usually harmless if");
console.log("  the value is a primitive — and a render storm if it is an object");
console.log("  rebuilt from JSON each poll. → 02\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — RENDER ≠ DOM WRITE (THE PROOF)
// ══════════════════════════════════════════════════════════════════

console.log("§4 — what a wasted render actually costs:\n");

// A miniature reconciler: it renders, diffs, and only "writes" real changes.
function makeReconciler() {
  let lastTree = null, componentCalls = 0, comparisons = 0, domWrites = 0;

  function diff(prev, next, path = "root") {
    if (prev === undefined) { domWrites++; return; }
    comparisons++;
    if (prev.text !== next.text) domWrites++;
    const kids = Math.max(prev.children?.length || 0, next.children?.length || 0);
    for (let i = 0; i < kids; i++) diff(prev.children?.[i], next.children?.[i], path + "." + i);
  }

  return {
    render(build) {
      componentCalls++;
      const tree = build();
      if (lastTree) diff(lastTree, tree); else domWrites++;
      lastTree = tree;
    },
    stats: () => ({ componentCalls, comparisons, domWrites }),
  };
}

const rc = makeReconciler();
const buildStatic = () => ({
  text: "Dashboard",
  children: Array.from({ length: 50 }, (_, i) => ({ text: `row-${i}`, children: [] })),
});

for (let i = 0; i < 10; i++) rc.render(buildStatic);   // 10 renders, identical output

const s = rc.stats();
console.log("    10 re-renders of a 51-node tree with IDENTICAL output:");
console.log("      component functions called:", s.componentCalls);
console.log("      tree nodes compared       :", s.comparisons);
console.log("      DOM writes                :", s.domWrites, "← only the initial mount");
console.log("\n  Nine of those ten renders wrote NOTHING to the DOM. The browser never");
console.log("  laid out, never painted. The cost was ~450 cheap comparisons in JS.");
console.log("\n  Which is the honest answer to 'are re-renders bad?': they are cheap");
console.log("  by design, and the wasted work is JavaScript, not layout. They become");
console.log("  expensive for exactly three reasons — the render body does real work");
console.log("  (sorting, filtering, formatting 10k items), the tree is huge (500 rows,");
console.log("  so 500 function calls), or the frequency is high (every keystroke, every");
console.log("  scroll event, every mousemove). Multiply those and you get a janky app.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE TOOLKIT, RANKED
// ══════════════════════════════════════════════════════════════════
//
// Work DOWN this list. Each rung is cheaper to maintain than the one below it.
// The bottom half is where most people start, which is the mistake.
//
//   0. MEASURE.                  Profiler + "Highlight updates". → 11, 12
//                                Never optimize a render you have not seen.
//
//   1. MOVE STATE DOWN.          The state lives in the smallest component that
//                                reads it. Siblings above it never re-render.
//                                Cost: 0 hooks. Cannot go stale. → §6
//
//   2. COMPOSITION / children.   Pass the expensive subtree as `children` from
//                                ABOVE the state. A parent does not re-render an
//                                element it was handed. → §6
//
//   3. SPLIT CONTEXT.            One provider per update frequency. Consumers of
//                                stable values stop re-rendering entirely. → §7
//
//   4. EXTERNAL STORE + SELECTOR. Zustand / Redux / useSyncExternalStore. The
//                                component subscribes to a SLICE, so it renders
//                                only when that slice changes. This is the real
//                                fix for "many consumers, frequent changes". → §7
//
//   5. memo + useCallback + useMemo.  Now, and only for what the Profiler
//                                flagged. Remember the chain. → 01, 02
//
//   6. useTransition / useDeferredValue.  Do not PREVENT the render — deprioritize
//                                it so typing stays responsive.
//                                → 02_built-in-hooks/11, 12
//
//   7. VIRTUALIZE.               Stop rendering rows that are off screen. The
//                                only fix that scales to 100,000 items. → 07
//
//   8. UNCONTROLLED / refs.      For values that change faster than the screen
//                                refreshes, do not put them in state at all. → §9
//
// Rungs 1–4 are architecture. Rungs 5–8 are tactics. Interviews reward candidates
// who reach for architecture and can say WHY.

console.log("§5 — rung 1 vs rung 5, same problem:\n");

function countRenders(strategy) {
  let expensive = 0, input = 0;
  const keystrokes = ["r", "re", "rea", "reac", "react"];
  if (strategy === "top") {
    // state at the top: everything below re-renders
    keystrokes.forEach(() => { input++; expensive++; });
  } else if (strategy === "memo") {
    // memo + useCallback: the child skips, but the parent still re-runs and
    // React still performs a prop comparison for every keystroke
    keystrokes.forEach(() => { input++; });
    expensive = 1;
  } else {
    // state moved down: the expensive sibling is not even in the render path
    keystrokes.forEach(() => { input++; });
    expensive = 1;
  }
  return { expensive, input };
}

const top = countRenders("top"), memoed = countRenders("memo"), moved = countRenders("down");
console.log("    typing 'react' (5 keystrokes):");
console.log("      state at the top   → ExpensiveChart rendered", top.expensive, "🐛");
console.log("      memo + useCallback → ExpensiveChart rendered", memoed.expensive, "✅ (+ 5 prop comparisons, 2 hooks)");
console.log("      state moved down   → ExpensiveChart rendered", moved.expensive, "✅ (+ 0 comparisons, 0 hooks)");
console.log("\n  Same result, different price. Rung 1 has nothing to keep in sync.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — RUNGS 1 & 2, IN CODE
// ══════════════════════════════════════════════════════════════════
//
// ❌ STATE TOO HIGH
//   function Page() {
//     const [query, setQuery] = useState("");
//     return (<>
//       <input value={query} onChange={e => setQuery(e.target.value)} />
//       <ExpensiveChart />        {/* re-renders on every keystroke */}
//     </>);
//   }
//
// ✅ RUNG 1 — MOVE STATE DOWN
//   function SearchBox() {                      // the state's new home
//     const [query, setQuery] = useState("");
//     return <input value={query} onChange={e => setQuery(e.target.value)} />;
//   }
//   function Page() {
//     return (<><SearchBox /><ExpensiveChart /></>);   // Page never re-renders
//   }
//
// ✅ RUNG 2 — COMPOSITION, when the state must stay high
//   function Provider({ children }) {           // owns the state
//     const [query, setQuery] = useState("");
//     return (<>
//       <input value={query} onChange={e => setQuery(e.target.value)} />
//       {children}                              {/* created by Page, NOT here */}
//     </>);
//   }
//   function Page() {
//     return <Provider><ExpensiveChart /></Provider>;
//   }
//
// WHY RUNG 2 WORKS — say this exactly:
//   `<ExpensiveChart />` is created in Page's render, not Provider's. When
//   Provider's state changes, Provider re-runs, but `children` is the SAME
//   element object it was handed. React sees an identical element and does not
//   re-render that subtree. No memo required.
//
//   This is the mirror image of 01 §6.2, where `children` BREAKS memo. Same
//   fact — a parent creates its children's elements — read from both ends.

console.log("§6 — composition: who created the element?\n");

// The element object is created by whoever renders the JSX. Simulated:
const chartElement = { type: "ExpensiveChart", props: {} };   // created ONCE by Page

let compositionRenders = 0, prevChildren = null;
for (let i = 0; i < 5; i++) {                                 // 5 Provider renders
  const children = chartElement;                              // handed down, unchanged
  if (!Object.is(children, prevChildren)) compositionRenders++;
  prevChildren = children;
}

let inlineRenders = 0, prevInline = null;
for (let i = 0; i < 5; i++) {
  const child = { type: "ExpensiveChart", props: {} };        // created INSIDE Provider
  if (!Object.is(child, prevInline)) inlineRenders++;
  prevInline = child;
}

console.log("    5 Provider renders:");
console.log("      chart created inside Provider  →", inlineRenders, "renders 🐛");
console.log("      chart passed as `children`     →", compositionRenders, "render  ✅");
console.log("\n  The element object is identical, so React bails out of the subtree.");
console.log("  This is the cheapest optimization in React and it has no API.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — RUNGS 3 & 4: CONTEXT SPLITTING AND SELECTORS
// ══════════════════════════════════════════════════════════════════

console.log("§7 — context has no selectors. That is the whole problem.\n");

// One provider holding { theme, user, cart } re-renders every consumer whenever
// ANY of the three changes — a consumer that only reads `theme` re-renders when
// the cart count changes. There is no useContext(Ctx, selector).

function simulateContext({ split, updates }) {
  // 30 consumers: 10 read theme, 5 read user, 15 read cart
  const readers = { theme: 10, user: 5, cart: 15 };
  let renders = 0;
  for (const key of updates) {
    if (split) renders += readers[key];              // only that provider's consumers
    else renders += readers.theme + readers.user + readers.cart;   // everyone
  }
  return renders;
}

// A realistic burst: the cart changes 8 times, theme once, user once.
const updates = [...Array(8).fill("cart"), "theme", "user"];
const combined = simulateContext({ split: false, updates });
const splitCtx = simulateContext({ split: true, updates });

console.log("    30 consumers, 10 context updates (8 cart, 1 theme, 1 user):");
console.log("      ONE combined provider :", combined, "re-renders 🐛");
console.log("      THREE split providers :", splitCtx, "re-renders ✅");
console.log("      wasted work removed   :", combined - splitCtx);

// Rung 4: an external store with selectors. The component subscribes to a
// SLICE, so only slice changes wake it — this is what Zustand/Redux do, and
// what useSyncExternalStore exposes natively.
function simulateSelectorStore({ updates }) {
  const readers = { theme: 10, user: 5, cart: 15 };
  return updates.reduce((n, key) => n + readers[key], 0);
}
const selectorStore = simulateSelectorStore({ updates });
console.log("      store + selectors     :", selectorStore, "re-renders ✅ (same as split)");

console.log("\n  Two true things to say here:");
console.log("    • Splitting context is free and works for 2-4 concerns. Past that,");
console.log("      provider nesting gets silly and a store is the honest answer.");
console.log("    • A selector store also lets you subscribe to a DERIVED value —");
console.log("      s => s.cart.items.length — so adding a second item to the same");
console.log("      product does not re-render the badge at all. Context cannot do");
console.log("      that at any level of splitting. → 04_state-patterns/08\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — AUTOMATIC BATCHING, AND THE key REMOUNT TRAP
// ══════════════════════════════════════════════════════════════════

console.log("§8 — batching, and render vs remount:\n");

// ── BATCHING (React 18+) ──────────────────────────────────────────
// Multiple setStates in the same tick are batched into ONE render. Before 18
// this only happened inside React event handlers; React 18's createRoot batches
// everywhere — promises, setTimeout, native listeners. This is a real, free
// optimization people still write code to work around.

function simulateBatching(batched, calls) {
  return batched ? 1 : calls;                       // one flush vs one render each
}
console.log("    4 setStates inside a fetch().then():");
console.log("      React 17 (legacy root)  :", simulateBatching(false, 4), "renders 🐛");
console.log("      React 18 (createRoot)   :", simulateBatching(true, 4), "render  ✅ automatic");
console.log("      → and flushSync() opts OUT, forcing a synchronous render. Rare,");
console.log("        and it costs you the batching, so use it only when you must");
console.log("        read layout between two updates.");

// ── RE-RENDER vs REMOUNT ──────────────────────────────────────────
// A re-render keeps state, keeps DOM nodes, keeps focus.
// A REMOUNT destroys state, destroys the DOM node, loses focus, refires effects.
//
// Three ways to accidentally remount:
//   1. Changing `key` on the element.
//   2. Defining a component INSIDE another component (new function identity →
//      new element TYPE → React unmounts the old tree). → 2A.1/03 §5.
//   3. Conditionally rendering the same component from two different branches.

console.log("\n    re-render vs remount, on a component holding text in state:");

function lifecycle(sameKey) {
  let state = "typed text", mounts = 1, effectRuns = 1;
  for (let i = 0; i < 3; i++) {
    if (!sameKey) { state = ""; mounts++; effectRuns++; }   // key changed → remount
  }
  return { state, mounts, effectRuns };
}
const kept = lifecycle(true), destroyed = lifecycle(false);
console.log("      stable key  → mounts:", kept.mounts, " state:", JSON.stringify(kept.state), "✅");
console.log("      key={Math.random()} → mounts:", destroyed.mounts, " state:", JSON.stringify(destroyed.state), "🐛");

console.log("\n  So when someone says 'my input clears when I type', it is NOT a");
console.log("  re-render problem — re-renders preserve state. It is a remount, and");
console.log("  the cause is a changing key or a component defined inside a component.");
console.log("  Getting this distinction right in an interview is a strong signal.");
console.log("\n  The flip side: `key` is also the deliberate way to RESET state —");
console.log("  <ProfileForm key={userId} /> gives each user a fresh form, with no");
console.log("  effect syncing props into state. That is the good use. → 04_state-patterns/12\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — VALUES THAT SHOULD NOT BE STATE
// ══════════════════════════════════════════════════════════════════

console.log("§9 — the frequency problem:\n");

// Some values change faster than the screen can show them. Putting those in
// state schedules a render per event, and most of those renders are invisible
// because they are superseded before the next frame.

const mouseEvents = 600;                            // ~10s of dragging at 60/s
const frames = Math.round(mouseEvents / 10);        // the screen only shows 60/s

console.log("    600 mousemove events during a drag:");
console.log("      useState(position)  → renders scheduled:", mouseEvents, "🐛");
console.log("      useRef + direct style write → renders  : 0 ✅");
console.log("      (the screen can only show ~" + frames + " updates in that time anyway)");

console.log("\n  The rule: if a value is not READ during render, it does not belong in");
console.log("  state. Candidates for a ref instead:");
console.log("    • drag / scroll / mousemove positions written straight to style");
console.log("    • a timer id, a previous value, an AbortController, a WebSocket");
console.log("    • form fields you only read on submit → UNCONTROLLED inputs");
console.log("      (defaultValue + ref) render ZERO times while typing, which is");
console.log("      why big forms often use react-hook-form. → 2A.1/10");
console.log("\n  And when the value IS read during render but the work is heavy, do not");
console.log("  remove the render — DEFER it. useDeferredValue keeps the input at 60fps");
console.log("  and lets the expensive list lag by a frame. → 02_built-in-hooks/11\n");


// ══════════════════════════════════════════════════════════════════
// § 10 — HOW TO ACTUALLY FIND THEM
// ══════════════════════════════════════════════════════════════════
//
// In order, because each step is cheaper than the next:
//
//   1. React DevTools → Profiler settings → "Highlight updates when components
//      render". Type one character and watch what flashes. If the whole page
//      flashes, you have a rung-1/2/3 problem, not a memo problem.
//   2. Profiler tab → record an interaction → the flamegraph. Wide bars are
//      expensive components; grey ones did not render. → 11
//   3. "Why did this render?" — enable it in Profiler settings. React tells you
//      whether it was props, state, hooks, or the parent.
//   4. why-did-you-render, for a console log with the exact prop that changed
//      and whether it was merely a new reference. → 12
//   5. Only now: memoize the specific component, and re-measure.
//
// Two rules that keep this honest:
//   • ALWAYS profile a production build. Dev mode is ~2-5× slower, StrictMode
//     double-renders, and both will send you optimizing the wrong thing.
//   • Re-measure after the fix. Roughly a third of memoizations do nothing, and
//     without the second measurement you will never know which third.


// ══════════════════════════════════════════════════════════════════
// § 11 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Typing lags in a form on a page with a chart:
//   State too high. Rung 1. → §5, §6.
//
// Bug 2 — One cart update re-renders 30 components:
//   A combined context. Rung 3. → §7.
//
// Bug 3 — Memoized everything, still slow:
//   Unstable props (→ 02), or the real cost is a huge list that needs
//   virtualization (→ 07), not memo.
//
// Bug 4 — "My input clears itself / loses focus":
//   A REMOUNT, not a re-render. Changing key, or a component defined inside a
//   component. → §8.
//
// Bug 5 — Dragging is janky:
//   Position in state. 600 renders for 60 frames. → §9.
//
// Bug 6 — Four setStates, four renders:
//   A legacy root (ReactDOM.render). React 18's createRoot batches. → §8.
//
// Bug 7 — Optimized in dev, no faster in prod:
//   Profiled a dev build. → §10.
//
// Bug 8 — A memo added, and now the UI shows stale data:
//   A hand-written comparator that compares too little. A skipped render is
//   silent. → 01 §8. Correctness beats a saved render, always.


// ══════════════════════════════════════════════════════════════════
// § 12 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// Same-value bailout:
assert(status.stats().renders === 2 && status.stats().bailouts === 4,
  "6 setState calls but only 2 value CHANGES → 2 renders, 4 bailouts. Object.is again.");

// Render is not a DOM write:
assert(s.componentCalls === 10, "10 renders happened");
assert(s.domWrites === 1, "...and wrote to the DOM exactly once — the initial mount ✅");
assert(s.comparisons === 459, "the cost was 459 cheap JS comparisons, not layout or paint");

// The ranked toolkit:
assert(top.expensive === 5, "state at the top → the chart re-renders per keystroke 🐛");
assert(memoed.expensive === 1 && moved.expensive === 1,
  "memo and moving state both give 1 — but moving state costs 0 hooks ✅");

// Composition:
assert(inlineRenders === 5, "an element created inside the provider is new every render 🐛");
assert(compositionRenders === 1, "the same element passed as children → React bails out ✅");

// Context:
assert(combined === 300 && splitCtx === 135,
  "one combined provider: 30 consumers × 10 updates = 300, vs 135 when split 🐛");
assert(selectorStore === splitCtx, "a selector store matches split context — and scales further");

// Batching and remount:
assert(simulateBatching(true, 4) === 1, "React 18 batches 4 setStates into 1 render ✅");
assert(kept.state === "typed text" && kept.mounts === 1, "a re-render PRESERVES state ✅");
assert(destroyed.state === "" && destroyed.mounts === 4,
  "a changing key REMOUNTS: state destroyed, effects refired 🐛 — a different bug");

console.log("§12 — mini assertions passed for: Avoiding unnecessary re-renders");
console.log("\n  The pair that captures it: 10 wasted renders produced exactly 1 DOM");
console.log("  write — so renders are cheap — while one combined context turned 10");
console.log("  updates into 300 renders. Fix the structure, not every render.");


// ══════════════════════════════════════════════════════════════════
// § 13 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you avoid unnecessary re-renders?", answer:
//
//   "First I'd separate two things, because candidates usually conflate them: a
//    re-render is React calling your function and diffing the result. It is not
//    a DOM write and not a repaint. If the output is identical, React commits
//    nothing — the browser never lays out or paints. So a wasted render costs
//    JavaScript, not pixels, and React is designed for that to be cheap.
//
//    It becomes expensive when three things multiply: the render body does real
//    work, the tree is large — 500 rows means 500 function calls — or the
//    frequency is high, like typing or dragging.
//
//    There are five triggers: own state, own context, own props, the parent
//    re-rendering, and a forced remount. Only the parent one is genuinely
//    avoidable — the rest are React doing its job.
//
//    Then I work down a ladder. Measure first, with the Profiler and 'highlight
//    updates', on a production build. Then: move state down into the smallest
//    component that reads it. Then composition — pass the expensive subtree as
//    children, because a parent doesn't re-render an element it was handed, and
//    that needs no memo at all. Then split context by update frequency, or move
//    to a store with selectors, which is the only thing that fixes 'many
//    consumers, frequent updates' properly, since context has no selectors. Only
//    then memo plus useCallback. Then useDeferredValue to deprioritize rather
//    than prevent. Then virtualization if the list is genuinely long. And for
//    values that change faster than the screen — drag positions, form fields
//    you only read on submit — a ref or an uncontrolled input, so there's no
//    render at all.
//
//    The distinction I'd make sure to draw is re-render versus remount. If
//    someone says their input loses focus or clears, that's not a re-render —
//    re-renders preserve state. That's a remount, from a changing key or a
//    component defined inside another component. Different bug, different fix.
//    And the same mechanism is the deliberate way to reset state, with
//    key={userId} on a form."
//
// The ladder — structure before memo — plus the render/remount split is what
// makes this a senior answer.


// ══════════════════════════════════════════════════════════════════
// § 14 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Does a re-render update the DOM?
// A1. Only if the diff finds a change. Identical output → zero DOM writes.
//
// Q2. What triggers a re-render?
// A2. Own state, own context, own props, the parent re-rendering, a remount.
//
// Q3. Which of those can you avoid?
// A3. The parent one — with memo, or by restructuring so the render never
//     reaches the component.
//
// Q4. Why is moving state down better than memo?
// A4. No comparison cost, no dependency array, nothing to go stale, and it
//     removes the component from the render path entirely.
//
// Q5. Why does passing `children` work?
// A5. The element was created by the grandparent, so it's the same object.
//     React bails out of that subtree without any memo.
//
// Q6. Why doesn't splitting context always fix it?
// A6. It splits by concern, not by value. Many consumers reading one
//     fast-changing value still all re-render. You need selectors.
//
// Q7. Re-render vs remount?
// A7. Re-render keeps state, DOM nodes and focus. Remount destroys all three
//     and refires effects. Caused by a changed key or a changed component type.
//
// Q8. Does React batch setState?
// A8. Yes — React 18 batches everywhere with createRoot, not just in event
//     handlers. flushSync opts out.
//
// Q9. Should I memo everything?
// A9. No. Comparisons cost, most never skip, and it makes code harder to read.
//     Measure, then memo the hot path.
//
// Q10. When is a re-render NOT worth optimizing?
// A10. Cheap body, small tree, low frequency — which is most of an app.


// ══════════════════════════════════════════════════════════════════
// § 15 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Does a wasted re-render repaint the screen?
//   Back : No. No diff → no commit → no paint. It costs JS only.
//
// Flashcard 2:
//   Front: Five render triggers?
//   Back : own state, own context, own props, parent render, remount.
//
// Flashcard 3:
//   Front: Cheapest fix for "typing lags because of a chart"?
//   Back : Move the state down. Zero hooks.
//
// Flashcard 4:
//   Front: Why does passing children avoid a re-render?
//   Back : Same element object → React bails out of the subtree. No memo.
//
// Flashcard 5:
//   Front: Context vs store?
//   Back : Context has no selectors. A store subscribes to a slice.
//
// Flashcard 6:
//   Front: "My input loses focus" — re-render or remount?
//   Back : Remount. Changing key, or a component defined inside a component.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Renders are cheap by design; I optimize expensive × frequent, and
//          I fix structure before I reach for memo."


// ══════════════════════════════════════════════════════════════════
// § 16 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Turn on "highlight updates", type in a search box, and screenshot what
//   flashes. Fix it with rung 1. Screenshot again.
//
// Task 2:
//   Build §6 both ways — chart inside the provider vs passed as children.
//   Prove with console.logs that the second one renders once.
//
// Task 3:
//   Build a context with theme + user + cart and 30 consumers. Count renders.
//   Split it into three and count again. Then do it with Zustand selectors.
//
// Task 4:
//   Break a component with key={Math.random()} and watch state vanish. Then use
//   key={userId} on a form to reset it DELIBERATELY.
//
// Task 5:
//   Track mouse position in state, log renders while dragging. Then move it to
//   a ref and write style directly. Compare the numbers and the smoothness.
//
// Task 6:
//   Profile a dev build and a production build of the same interaction. Note
//   how different the flamegraph is, and why that matters.


// ══════════════════════════════════════════════════════════════════
// § 17 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Render ≠ repaint. An identical render commits nothing. Renders are cheap by
//   design — optimize expensive × frequent.
//
// If you remember the common bug:
//   State higher than it needs to be, and one combined context provider.
//
// If you remember the professional framing:
//   Structure before memo — move state down, pass children, split context, use
//   selectors. And never confuse a re-render with a remount.
//
// NEXT TOPIC -> 04_code-splitting-lazy-suspense.js
