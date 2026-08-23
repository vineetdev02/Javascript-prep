// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  11_profiler-api.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Profiler API
//
// WHAT YOU WILL MASTER HERE:
//   1. The two Profilers — the DevTools tab and the <Profiler> component
//   2. Every onRender argument, and what each one is actually for
//   3. actualDuration vs baseDuration — the number that PROVES memo worked
//   4. The three phases, including nested-update and why it is a warning sign
//   5. Reading a flamegraph, and the 16ms budget that decides what "slow" is
//   6. Profiling in production: builds, sampling, and what to send
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/11_profiler-api.js"
//
// Prerequisites: 01, 03. Everything in this section so far has been a FIX;
// this file and the next are how you decide which fix to apply, and prove that
// it worked. Rung 0 of 03 §5's ladder.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// The Profiler API:
// A built-in React component, <Profiler>, that measures how long each render of
// a subtree takes and calls you back with the timings — and, separately, the
// DevTools Profiler tab that visualizes the same data.
//
// If interviewer says "explain it simply", say:
// "You wrap part of your tree in <Profiler id='Sidebar' onRender={fn}> and React
//  calls fn after every commit with how long that subtree took to render, plus
//  what it WOULD have taken with no memoization. The DevTools tab is the same
//  measurements with a UI on top."
//
// If interviewer asks "why does it matter?", say:
// "Because it turns performance work from guessing into arithmetic. The two
//  numbers it gives you — actualDuration and baseDuration — are exactly the
//  before and after of memoization. If they're equal, your memoization is doing
//  nothing. And it's the only React-aware measurement you can ship to real
//  users: browser Performance entries tell you the page was slow, but only the
//  Profiler tells you WHICH component and whether it was a mount or an update."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   baseDuration − actualDuration = what memoization SAVED
//
// The API, in full:
//
//   import { Profiler } from "react";
//
//   <Profiler id="Sidebar" onRender={onRender}>
//     <Sidebar />
//   </Profiler>
//
//   function onRender(
//     id,               // the id prop — which Profiler is reporting
//     phase,            // "mount" | "update" | "nested-update"
//     actualDuration,   // ms spent rendering this commit  ← what happened
//     baseDuration,     // ms to render the WHOLE subtree with no memoization
//     startTime,        // when React began this render
//     commitTime,       // when React committed it
//   ) {}
//
// Runtime rule:
//   onRender fires after EVERY commit for that subtree — including commits
//   where a memoized child was skipped. actualDuration then excludes the
//   skipped work, which is exactly how you see the saving.
//
// Practical rule:
//   Wrap a suspect subtree, log the numbers, apply a fix, and compare. Never
//   optimize a component you have not measured, and never trust a fix you have
//   not re-measured.
//
// Common trap:
//   Profiling a development build. Dev React is 2-5× slower, StrictMode renders
//   everything twice, and both distort exactly the numbers you are reading.
//   Every conclusion from a dev profile is suspect.


// ══════════════════════════════════════════════════════════════════
// § 3 — actualDuration vs baseDuration
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the two numbers, and what their gap means:\n");

// baseDuration = the cost of rendering every component in the subtree from
//                scratch, ignoring memoization. React computes it from the last
//                known render time of each component.
// actualDuration = what this commit actually cost, with skips.
//
// So:  baseDuration − actualDuration  =  time saved by memo/PureComponent
//      actualDuration ≈ baseDuration  =  your memoization is doing nothing

const subtree = [
  { name: "Sidebar",    ms: 0.4, memoized: false, propsChanged: true },
  { name: "FilterList", ms: 2.1, memoized: true,  propsChanged: false },
  { name: "ChartPanel", ms: 11.3, memoized: true,  propsChanged: false },
  { name: "Legend",     ms: 0.8, memoized: true,  propsChanged: true },
  { name: "Footer",     ms: 0.3, memoized: false, propsChanged: true },
];

function commit(components) {
  const baseDuration = components.reduce((s, c) => s + c.ms, 0);
  const actualDuration = components
    .filter(c => !c.memoized || c.propsChanged)
    .reduce((s, c) => s + c.ms, 0);
  return {
    actualDuration: +actualDuration.toFixed(1),
    baseDuration: +baseDuration.toFixed(1),
    saved: +(baseDuration - actualDuration).toFixed(1),
  };
}

const good = commit(subtree);
// The same subtree where an unstable prop broke every memo (→ 02):
const broken = commit(subtree.map(c => ({ ...c, propsChanged: true })));

console.log("    memoization working:");
console.log("      actualDuration:", good.actualDuration + "ms   baseDuration:",
  good.baseDuration + "ms   → saved", good.saved + "ms ✅");
console.log("    the same tree with one unstable prop from the parent:");
console.log("      actualDuration:", broken.actualDuration + "ms  baseDuration:",
  broken.baseDuration + "ms  → saved", broken.saved + "ms 🐛");

console.log("\n  That second line is the single most useful diagnostic in React");
console.log("  performance work. actualDuration EQUALS baseDuration means every memo");
console.log("  in the subtree skipped nothing — so before touching anything else, go");
console.log("  find the prop the parent is recreating. → 02");
console.log("\n  ⚠️ One caveat to state, because it is a good detail: baseDuration is");
console.log("  an ESTIMATE. React sums each component's most recent render time, so");
console.log("  a component that has never rendered contributes nothing, and a");
console.log("  component whose cost varies with its data gives you a stale figure.");
console.log("  Treat it as a strong signal, not a stopwatch.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE THREE PHASES
// ══════════════════════════════════════════════════════════════════

console.log("§4 — phase tells you which problem you have:\n");

// "mount"         — first render of this subtree. Expensive is often FINE here;
//                   it happens once. Compare it against your TTI budget, not
//                   against 16ms.
// "update"        — a re-render. THIS is where memoization lives, and where a
//                   number above 16ms is a dropped frame.
// "nested-update" — React 18+. The commit was caused by a setState fired from
//                   inside a layout effect or a render — React had to render
//                   AGAIN, synchronously, before painting. Always worth
//                   investigating: it is a double render the user waits for.

const commits = [
  { phase: "mount",         actual: 42.0, note: "one-off — judge against TTI, not 16ms" },
  { phase: "update",        actual: 3.2,  note: "fine" },
  { phase: "update",        actual: 24.7, note: "🐛 a dropped frame — this is the one to fix" },
  { phase: "nested-update", actual: 8.1,  note: "🐛 setState in useLayoutEffect — a second pass before paint" },
];

const FRAME_BUDGET_MS = 16.67;     // 60fps. Under it → smooth. Over → a dropped frame.
for (const c of commits) {
  const over = c.phase !== "mount" && c.actual > FRAME_BUDGET_MS;
  console.log(`    ${c.phase.padEnd(14)} ${String(c.actual).padStart(5)}ms  ${over ? "OVER BUDGET" : "           "}  ${c.note}`);
}

console.log("\n  The 16.67ms number is worth having ready: at 60fps the browser has");
console.log("  one frame every 16.67ms to run JavaScript, style, layout, paint and");
console.log("  composite. React's render is only the first slice of that, so a render");
console.log("  budget of ~8-10ms is the realistic target — and on a 120Hz display the");
console.log("  whole frame is 8.3ms. 'Under 16ms' is the ceiling, not the goal.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE DEVTOOLS PROFILER
// ══════════════════════════════════════════════════════════════════
//
// Same data, better UI, and it is where you will actually spend your time.
//
// THE WORKFLOW:
//   1. Install React DevTools. Open the Profiler tab.
//   2. Settings ⚙ → tick "Record why each component rendered while profiling".
//      This is the setting that makes the tab worth using — it turns the answer
//      from "it rendered" into "props changed: onSelect".
//   3. ⏺ Record → do ONE interaction → ⏹ Stop. One interaction. Not a tour of
//      the app; you cannot read a 200-commit profile.
//   4. Read the commit bar chart at the top: each bar is one commit, height is
//      duration, yellow/red means slow. Click the tallest.
//   5. Read the flamegraph for that commit.
//
// READING A FLAMEGRAPH:
//   • WIDTH = time, including children. The widest bar is where the time went.
//   • GREY   = did not render this commit. Grey is what you are aiming for.
//   • YELLOW/RED = slow relative to the others in this commit.
//   • Click a component → the right panel shows its own render duration and,
//     with the setting above, WHY it rendered:
//         "Props changed: (items, onSelect)"     ← check identity first → 02
//         "Hooks changed: 3"                      ← a useState/useContext fired
//         "The parent component rendered"         ← the memo candidate → 01
//         "Context changed"                       ← split it → 03 §7
//   • The RANKED chart (the second toggle) sorts components by their own
//     duration. Use it to answer "what is expensive?"; use the flamegraph to
//     answer "why did it render?".
//
// FOUR SHAPES YOU WILL RECOGNIZE:
//   1. One very wide bar        → one expensive component. Optimize IT.
//   2. Hundreds of thin bars    → a long list. Virtualize. → 07
//   3. The whole tree lights up on every keystroke → state too high. → 03 §6
//   4. Many commits per interaction → unbatched setStates, or an effect loop.
//                                     → 02 §5, 03 §8
//
// ALSO IN DEVTOOLS, and often faster than recording anything:
//   Components tab → ⚙ → "Highlight updates when components render". Type one
//   character. Whatever flashes is your answer, in about four seconds.

console.log("§5 — the four flamegraph shapes, as data:\n");
const shapes = [
  ["one wide bar",              "1 component at 38ms",        "optimize that component"],
  ["hundreds of thin bars",     "1,200 rows at 0.03ms each",  "virtualize → 07"],
  ["the whole tree, per keystroke", "60 components × 6 commits", "move state down → 03"],
  ["many commits per click",    "9 commits in one interaction", "unbatched setState / effect loop"],
];
for (const [shape, evidence, fix] of shapes) {
  console.log(`    ${shape.padEnd(32)} ${evidence.padEnd(28)} → ${fix}`);
}
console.log("");


// ══════════════════════════════════════════════════════════════════
// § 6 — PROFILING IN PRODUCTION
// ══════════════════════════════════════════════════════════════════

console.log("§6 — what your users' devices actually do:\n");

// THE BUILD PROBLEM, and it is the whole reason this section exists:
//   <Profiler> is a no-op in a normal production build. React strips the timing
//   instrumentation, so onRender never fires. You need a PROFILING build:
//
//     Vite / Rollup:  alias react-dom → react-dom/profiling
//                     and scheduler/tracing → scheduler/tracing-profiling
//     Next.js:        next build --profile
//     CRA:            react-scripts build --profile
//
//   A profiling build is production React PLUS instrumentation — a few percent
//   slower than production, and several times faster than dev. That gap is the
//   point: your dev machine's numbers are fiction.

const DEV_MULTIPLIER = 3.5;         // dev React + StrictMode double render
const LOW_END_MULTIPLIER = 4;       // mid-range Android vs a developer laptop

const measuredInDev = 24;
console.log("    a render measured at", measuredInDev + "ms in dev on your laptop:");
console.log("      → in a production build     : ~" + (measuredInDev / DEV_MULTIPLIER).toFixed(1) + "ms  (you were optimizing a phantom)");
console.log("      → on a mid-range Android    : ~" + (measuredInDev / DEV_MULTIPLIER * LOW_END_MULTIPLIER).toFixed(1) + "ms  (real, and over budget)");
console.log("\n    ...and those two errors point in OPPOSITE directions, which is why");
console.log("    a dev profile on a fast laptop can be wrong twice over.");

// SAMPLING — the pattern for shipping this:
//
//   const onRender = (id, phase, actualDuration) => {
//     if (actualDuration < 16) return;              // only report slow commits
//     if (Math.random() > 0.01) return;             // 1% of sessions
//     analytics.track("slow_render", { id, phase, ms: Math.round(actualDuration) });
//   };
//
// Rules that keep it honest:
//   • Never do work in onRender itself — it runs inside the commit phase, so a
//     synchronous network call there makes the very thing you are measuring
//     slower. Buffer and flush on idle.
//   • Sample. Reporting every commit produces more traffic than your app.
//   • Aggregate by percentile (p75/p95), not average. Averages hide the tail,
//     and the tail is the complaint.
//
// AND THE BROWSER-NATIVE ALTERNATIVES, which need no special build:
//   performance.mark("x-start"); ... performance.measure("x", "x-start");
//   PerformanceObserver for 'longtask' (>50ms blocks on the main thread)
//   → and the user-centric versions of all of this are Web Vitals. → 13
//
// The division of labour, said cleanly:
//   Web Vitals tell you the EXPERIENCE was bad (INP was 400ms).
//   The Profiler tells you WHICH COMPONENT made it bad.
//   You need both, and they answer different questions.

console.log("");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE WORKFLOW, END TO END
// ══════════════════════════════════════════════════════════════════

console.log("§7 — measure, fix, re-measure:\n");

// This is the loop. The third step is the one people skip, and it is the one
// that tells you whether you actually helped.

const beforeFix = commit(subtree.map(c => ({ ...c, propsChanged: true })));  // memos broken
const afterFix = commit(subtree);                                           // props stabilized

console.log("    1. MEASURE   →", beforeFix.actualDuration + "ms actual /",
  beforeFix.baseDuration + "ms base   (saved " + beforeFix.saved + "ms — memos doing nothing)");
console.log("    2. DIAGNOSE  → DevTools says 'Props changed: (filters)'. The parent");
console.log("                   rebuilds `filters` every render. → 02");
console.log("    3. FIX       → useMemo the filters object at the source.");
console.log("    4. RE-MEASURE→", afterFix.actualDuration + "ms actual /",
  afterFix.baseDuration + "ms base   (saved " + afterFix.saved + "ms ✅)");
console.log("    5. IMPROVEMENT:", (beforeFix.actualDuration - afterFix.actualDuration).toFixed(1) + "ms per commit,",
  Math.round((1 - afterFix.actualDuration / beforeFix.actualDuration) * 100) + "% faster");
console.log("\n  Roughly a third of memoizations change nothing. Step 4 is how you");
console.log("  find out which third — and how you justify keeping the complexity.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — onRender never fires in production:
//   A normal production build strips the instrumentation. Use a profiling
//   build. → §6.
//
// Bug 2 — Every number is 3-5× too big:
//   Dev build, and StrictMode is rendering everything twice. → §6.
//
// Bug 3 — "We optimized for a week and users saw no change":
//   Profiled a fast laptop. Throttle the CPU 4-6× and test a real device. → §6.
//
// Bug 4 — Adding <Profiler> made the app slower:
//   Real work inside onRender, or dozens of Profilers left in the tree.
//   Measure one subtree at a time and buffer the reporting. → §6.
//
// Bug 5 — actualDuration equals baseDuration and nobody notices:
//   That IS the finding. Every memo in the subtree is skipping nothing. → §3.
//
// Bug 6 — A profile with 300 commits that nobody can read:
//   Record ONE interaction. → §5.
//
// Bug 7 — "The mount is 40ms, we must fix it":
//   Maybe not. A mount happens once; judge it against TTI, not the frame
//   budget. → §4.
//
// Bug 8 — Averages look fine, users complain:
//   Report p75/p95. The average hides the tail. → §6.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The two durations:
assert(good.baseDuration === 14.9, "baseDuration is the whole subtree: 14.9ms");
assert(good.actualDuration === 1.5,
  "actualDuration excludes the memoized children that skipped: 1.5ms");
assert(good.saved === 13.4, "→ memoization saved 13.4ms on this commit ✅");

assert(broken.actualDuration === broken.baseDuration,
  "one unstable prop → actual EQUALS base → every memo skipped nothing 🐛");
assert(broken.saved === 0, "...saved exactly 0ms. That equality IS the diagnosis.");

// The budget:
assert(FRAME_BUDGET_MS > 16 && FRAME_BUDGET_MS < 17, "60fps gives you 16.67ms per frame");
assert(commits[2].actual > FRAME_BUDGET_MS, "a 24.7ms update is a dropped frame 🐛");
assert(commits[0].actual > FRAME_BUDGET_MS,
  "...while a 42ms MOUNT may be perfectly acceptable — different budget");

// The workflow:
assert(beforeFix.actualDuration === 14.9 && afterFix.actualDuration === 1.5,
  "measure → fix → re-measure: 14.9ms to 1.5ms per commit");
assert(Math.round((1 - afterFix.actualDuration / beforeFix.actualDuration) * 100) === 90,
  "a 90% reduction — and you only know that because you measured twice ✅");

console.log("§9 — mini assertions passed for: Profiler API");
console.log("\n  The pair that captures it: actualDuration 1.5ms against baseDuration");
console.log("  14.9ms is memoization working — and actual EQUALLING base is the");
console.log("  fastest way there is to prove it is not.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you profile a React app?", answer:
//
//   "Two tools with the same underlying data. The DevTools Profiler tab for
//    interactive work, and the <Profiler> component when I want the numbers
//    programmatically — including from real users.
//
//    <Profiler> takes an id and an onRender callback, and React calls it after
//    every commit with the phase, actualDuration, baseDuration, startTime and
//    commitTime. The two durations are the ones that matter: actualDuration is
//    what this commit cost, and baseDuration is what the whole subtree would
//    cost with no memoization. The gap between them is exactly what your
//    memoization bought. If they're equal, every memo in that subtree is
//    skipping nothing, and I'd go looking for a prop the parent recreates before
//    touching anything else.
//
//    Phase matters for how I read the number. A 40ms mount is often fine — it
//    happens once, and I'd judge it against Time to Interactive. A 24ms update
//    is a dropped frame, since 60fps gives you 16.67ms for everything including
//    style, layout and paint, so my render budget is really more like 8-10ms.
//    And 'nested-update' means a setState fired from a layout effect or render,
//    so React had to render twice before painting — always worth a look.
//
//    In DevTools the setting I'd turn on first is 'record why each component
//    rendered'. That's what turns 'this rendered' into 'props changed: onSelect'
//    or 'the parent component rendered', which maps straight to a fix. Grey in
//    the flamegraph is what I'm aiming for, and width is time. Honestly, before
//    recording anything I'd usually just switch on 'highlight updates', type one
//    character, and see what flashes — that answers it in four seconds.
//
//    Two rules I'd insist on. Profile a production or profiling build: dev React
//    plus StrictMode's double render inflates everything three to five times,
//    and my laptop is four times faster than my users' phones — two errors in
//    opposite directions. And re-measure after the fix, because roughly a third
//    of memoizations do nothing and step three is the only way to know which.
//
//    For production I ship <Profiler> in a profiling build, but sampled — 1% of
//    sessions, only commits over 16ms, buffered rather than reported inside the
//    commit phase, and aggregated at p75 and p95 rather than as an average.
//    That complements Web Vitals rather than replacing it: Vitals tell me the
//    experience was bad, the Profiler tells me which component made it bad."
//
// The actual-vs-base diagnostic, the dev-build caveat, and re-measuring are the
// three things that separate a profiler user from someone who has read the docs.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What arguments does onRender get?
// A1. id, phase, actualDuration, baseDuration, startTime, commitTime.
//
// Q2. Difference between actualDuration and baseDuration?
// A2. Actual is this commit with skips. Base is the whole subtree with no
//     memoization. The gap is what memoization saved.
//
// Q3. What does it mean if they're equal?
// A3. Nothing was skipped — the memoization isn't working. Look for unstable
//     props.
//
// Q4. What are the phases?
// A4. mount, update, and nested-update — the last meaning a setState from a
//     layout effect or render forced a second pass before paint.
//
// Q5. Does <Profiler> work in production?
// A5. Not in a normal production build; the instrumentation is stripped. Use a
//     profiling build.
//
// Q6. Why not profile in development?
// A6. Dev React is several times slower and StrictMode double-renders. The
//     numbers aren't real.
//
// Q7. What's a "slow" render?
// A7. Over ~16ms for an update drops a frame at 60fps, so I target 8-10ms for
//     the render itself. Mounts get a different budget.
//
// Q8. How do you know WHY a component rendered?
// A8. Enable "record why each component rendered" in the Profiler settings, or
//     use why-did-you-render. → 12.
//
// Q9. Can you ship this to real users?
// A9. Yes — profiling build, sampled, thresholded, buffered, reported at p75/p95.
//
// Q10. Profiler vs Web Vitals?
// A10. Vitals measure the user's experience; the Profiler attributes it to a
//      component. Different questions.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: onRender's six arguments?
//   Back : id, phase, actualDuration, baseDuration, startTime, commitTime.
//
// Flashcard 2:
//   Front: What does baseDuration − actualDuration tell you?
//   Back : How much time memoization saved on that commit.
//
// Flashcard 3:
//   Front: actual === base — what does it mean?
//   Back : Nothing was skipped. Your memos are decoration.
//
// Flashcard 4:
//   Front: The three phases?
//   Back : mount, update, nested-update.
//
// Flashcard 5:
//   Front: Why not profile a dev build?
//   Back : 3-5× slower plus StrictMode double renders.
//
// Flashcard 6:
//   Front: The frame budget?
//   Back : 16.67ms total at 60fps — so target ~8-10ms for the render.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "actual equals base means the memo did nothing", and always
//          re-measure after the fix.


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Wrap a subtree in <Profiler> and log all six arguments for one interaction.
//   Read them out loud.
//
// Task 2:
//   Find a commit where actualDuration equals baseDuration. Fix the unstable
//   prop and watch the gap open.
//
// Task 3:
//   Record one interaction in DevTools with "why did this render" enabled.
//   Write down the reason for the three widest bars.
//
// Task 4:
//   Profile the same interaction in dev and in a production build. Note the
//   ratio. Then throttle CPU 6× and note it again.
//
// Task 5:
//   Turn on "highlight updates" and type into a form. Screenshot what flashes,
//   fix it, screenshot again.
//
// Task 6:
//   Write a sampled onRender that reports only commits over 16ms, at 1% of
//   sessions, buffered until idle.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   baseDuration − actualDuration is what memoization saved. Equal means it
//   saved nothing.
//
// If you remember the common bug:
//   Profiling a dev build with StrictMode on a fast laptop — inflated numbers
//   about a machine your users do not have.
//
// If you remember the professional framing:
//   Measure, fix, RE-measure. And pair it with Web Vitals: Vitals say the
//   experience was bad, the Profiler says which component made it bad.
//
// NEXT TOPIC -> 12_why-did-you-render.js
