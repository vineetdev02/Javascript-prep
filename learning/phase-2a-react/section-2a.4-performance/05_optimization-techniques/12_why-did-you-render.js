// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  12_why-did-you-render.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Why Did You Render
//
// WHAT YOU WILL MASTER HERE:
//   1. The one question it answers that the Profiler cannot
//   2. Its core trick: compare SHALLOW and DEEP, and report the difference
//   3. Setup, and the import-order rule that makes or breaks it
//   4. Reading its output — the four messages and what each one means
//   5. Why it must never reach production, and how it gets there by accident
//   6. The 2025 landscape: DevTools, React Scan, and the Compiler
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/12_why-did-you-render.js"
//
// Prerequisites: 02_referential-equality-problem.js — this whole tool exists to
// detect that ONE bug automatically. And 11_profiler-api.js, which tells you
// WHERE the time went while this tells you WHY the render happened at all.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// why-did-you-render (@welldone-software/why-did-you-render):
// A development-only library that patches React to detect re-renders where the
// props were EQUAL BY VALUE but different by reference — and logs the exact prop
// that caused it.
//
// If interviewer says "explain it simply", say:
// "It monkey-patches React in development and watches every re-render. When a
//  component re-renders and its props are deeply equal to the previous ones, it
//  logs a console warning naming the prop — because that render was avoidable
//  and somebody created a new object or function."
//
// If interviewer asks "why does it matter?", say:
// "Because it automates the one diagnosis you'd otherwise do by hand. The
//  Profiler tells you a component rendered and how long it took; it doesn't tell
//  you whether the render was NECESSARY. why-did-you-render answers exactly
//  that, by doing a deep comparison the runtime never does — if the values are
//  deeply equal but the references differ, the render was pure waste, and it
//  names the prop. It's a debugging tool, not an optimization, and it turns 'the
//  parent rendered' into 'the parent recreated the onSelect callback'."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   deeply EQUAL but referentially DIFFERENT = an avoidable render
//
// Runtime rule:
//   React compares shallowly with Object.is and re-renders. wdyr additionally
//   compares DEEPLY. Those two answers disagreeing is the entire signal:
//
//     shallow says "changed"  +  deep says "identical"  →  🐛 wasted render
//     shallow says "changed"  +  deep says "changed"    →  ✅ a real update
//     shallow says "same"                                →  React already skipped
//
// Practical rule:
//   Turn it on for ONE suspect component, read the message, fix the prop at its
//   source, turn it off. It is a scalpel, not a monitor.
//
// Common trap:
//   Leaving it enabled globally. The console fills with hundreds of notices,
//   most for renders that cost nothing, and you stop reading them — which is the
//   same as not having it.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE TRICK, IMPLEMENTED
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the whole idea, in 20 lines:\n");

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a === "function" && typeof b === "function") return a.toString() === b.toString();
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every(k => deepEqual(a[k], b[k]));
}

function diagnose(prevProps, nextProps) {
  const findings = [];
  for (const key of Object.keys(nextProps)) {
    const shallowSame = Object.is(prevProps[key], nextProps[key]);
    if (shallowSame) continue;                       // React would have skipped it
    findings.push({
      prop: key,
      avoidable: deepEqual(prevProps[key], nextProps[key]),   // ← the whole trick
      kind: typeof nextProps[key] === "function" ? "function"
        : Array.isArray(nextProps[key]) ? "array"
        : typeof nextProps[key],
    });
  }
  return findings;
}

const prev = {
  title: "Orders",
  filters: { status: "open", page: 1 },
  rows: [1, 2, 3],
  onSelect: () => {},
  count: 12,
};
const next = {
  title: "Orders",                       // same primitive → React skips it
  filters: { status: "open", page: 1 },  // 🐛 new object, identical contents
  rows: [1, 2, 3],                       // 🐛 new array, identical contents
  onSelect: () => {},                    // 🐛 new function, identical body
  count: 13,                             // ✅ a genuine change
};

console.log("    wdyr's report for this re-render:\n");
for (const f of diagnose(prev, next)) {
  if (f.avoidable) {
    console.log(`      🐛 props.${f.prop.padEnd(9)} (${f.kind}) — different objects that are`);
    console.log(`         equal by value. The parent created a new one this render.`);
  } else {
    console.log(`      ✅ props.${f.prop.padEnd(9)} (${f.kind}) — genuinely changed. This render was needed.`);
  }
}

const findings = diagnose(prev, next);
const avoidable = findings.filter(f => f.avoidable).length;
console.log(`\n    ${avoidable} of ${findings.length} changed props were avoidable.`);
console.log("\n  Read what that does for you. The Profiler would have said 'Props");
console.log("  changed: (filters, rows, onSelect, count)' — four names, no verdict.");
console.log("  This says three of them were the SAME VALUE and only `count` mattered.");
console.log("  That is the difference between a clue and an answer.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — SETUP, AND THE IMPORT-ORDER RULE
// ══════════════════════════════════════════════════════════════════
//
//   npm i -D @welldone-software/why-did-you-render
//
//   // wdyr.js
//   import React from "react";
//   if (process.env.NODE_ENV === "development") {
//     const whyDidYouRender = require("@welldone-software/why-did-you-render");
//     whyDidYouRender(React, {
//       trackAllPureComponents: true,   // every memo() and PureComponent
//       trackHooks: true,               // also report hook-caused renders
//       logOnDifferentValues: false,    // false = ONLY avoidable renders. Start here.
//       collapseGroups: true,
//       include: [/^Order/],            // or: exclude: [/^Connect/]
//     });
//   }
//
//   // index.jsx — THE FIRST LINE. Before React, before your app.
//   import "./wdyr";
//   import React from "react";
//   import App from "./App";
//
// ⚠️ THE IMPORT-ORDER RULE. It patches React's createElement. Any component
//    module evaluated before the patch is applied is invisible to it. "I set it
//    up and nothing logs" is almost always this — the import is second, or a
//    bundler hoisted something above it. In Next.js, import it at the top of
//    _app / the root layout; in Vite, the first line of main.jsx.
//
// Per-component, when you do not want the whole app:
//
//   function OrderRow(props) { ... }
//   OrderRow.whyDidYouRender = true;         // just this one
//
//   // with a custom label, useful for a component rendered in many places
//   OrderRow.whyDidYouRender = { logOnDifferentValues: true, customName: "Row" };
//
// The two settings that decide whether you get signal or noise:
//   logOnDifferentValues: false  → only AVOIDABLE renders. The default. Use it.
//   logOnDifferentValues: true   → every re-render, including legitimate ones.
//                                  Useful for "why is this rendering at all?",
//                                  unusable as a default.

console.log("§4 — signal vs noise, as a count:\n");
const RENDERS = 120, AVOIDABLE = 9;
console.log("    an interaction producing", RENDERS, "re-renders:");
console.log("      logOnDifferentValues: true  →", RENDERS, "console entries 🐛 unreadable");
console.log("      logOnDifferentValues: false →", AVOIDABLE, "console entries ✅ each one actionable");
console.log("");


// ══════════════════════════════════════════════════════════════════
// § 5 — READING THE OUTPUT
// ══════════════════════════════════════════════════════════════════
//
// The four messages you will actually see, and the fix for each:
//
//   1. "Re-rendered because of props changes: different objects that are equal
//       by value. (User might have created a new object at every render)"
//      → THE message. A parent is building an object/array inline.
//      → Fix: useMemo, hoist a constant, or pass primitives. → 02 §8
//
//   2. "...different functions that are equal by value"
//      → An inline arrow prop, recreated per render.
//      → Fix: useCallback — and check the callback's OWN deps are stable. → 02 §6
//
//   3. "Re-rendered because of hook changes: [useContext]"
//      → A context value changed. memo cannot filter it.
//      → Fix: split the context, or move to a store with selectors. → 03 §7
//
//   4. "Re-rendered by [ParentName]" with no prop differences
//      → A plain parent-caused render on an unmemoized component.
//      → Fix: memo it — or better, move the state down. → 01 §9, 03 §5
//
// And the one that means you are done:
//   silence. No entry for that component means every render it did was earned.
//
// ⚠️ Message 1 has a subtlety worth knowing, because it catches people:
//    wdyr compares functions by their SOURCE TEXT. Two arrows with identical
//    bodies but DIFFERENT captured closures read as "equal by value" — so it can
//    call a render avoidable when the closure genuinely changed. Rare, but it is
//    why the tool is a lead to investigate, not a verdict to act on blindly.

console.log("§5 — the four messages, mapped to fixes:\n");
const messages = [
  ["different objects, equal by value",   "inline object prop",   "useMemo / hoist / primitives  → 02"],
  ["different functions, equal by value", "inline arrow prop",    "useCallback (+ stable deps)   → 02"],
  ["hook changes: [useContext]",          "context value changed", "split context / selectors     → 03"],
  ["Re-rendered by <Parent>",             "parent re-rendered",   "memo, or move state down      → 01/03"],
];
for (const [msg, cause, fix] of messages) {
  console.log(`    "${msg}"`);
  console.log(`       cause: ${cause.padEnd(22)} fix: ${fix}`);
}
console.log("");


// ══════════════════════════════════════════════════════════════════
// § 6 — IT MUST NEVER SHIP
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the cost of leaving it on:\n");

// It patches React itself and DEEP-COMPARES every prop of every tracked
// component on every render. That is precisely the O(n) comparison React refuses
// to do — which is the whole reason React uses Object.is. → 04_state-patterns/13

function comparisonCost({ components, renders, propsEach, depth }) {
  const shallow = components * renders * propsEach;                  // what React does
  const deep = components * renders * propsEach * Math.pow(6, depth); // what wdyr does
  return { shallow, deep, ratio: Math.round(deep / shallow) };
}

const cost = comparisonCost({ components: 60, renders: 100, propsEach: 8, depth: 3 });
console.log("    60 components × 100 renders × 8 props, props nested 3 deep:");
console.log("      React's shallow comparisons:", cost.shallow.toLocaleString());
console.log("      wdyr's deep comparisons    :", cost.deep.toLocaleString(),
  `(${cost.ratio}× more)`);
console.log("\n  So: dev only, always. Three ways it reaches production anyway:");
console.log("    1. A plain `import './wdyr'` with no NODE_ENV guard INSIDE the file.");
console.log("       The guard must be in wdyr.js, not only at the import site, or the");
console.log("       bundler still includes the library.");
console.log("    2. Installed as a `dependency` instead of a `devDependency`.");
console.log("    3. Next.js: imported in the root layout without a development check,");
console.log("       so it also runs during the SERVER render.");
console.log("  Verify the way you verify anything: search the production bundle for");
console.log("  'whyDidYouRender'. → 08_bundle-size-analysis.js\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE 2025 LANDSCAPE
// ══════════════════════════════════════════════════════════════════
//
// Say this part. The question is often really "do you keep up?".
//
//   TOOL                        answers                        cost
//   ──────────────────────────  ─────────────────────────────  ──────────────────
//   DevTools Profiler           what rendered, how long,       built in, no setup
//    + "why did this render"    and the CATEGORY of reason
//   why-did-you-render          whether the render was         a dev dependency,
//                               AVOIDABLE, and which prop      + an import-order rule
//   React Scan                  which components re-render,    a script tag or
//                               highlighted live on the page   npx, zero setup
//   React Compiler              removes the problem class      a build step (19+)
//    + eslint-plugin-react-hooks
//
// How I would actually use them together:
//   1. React Scan or "highlight updates" first — four seconds, and it usually
//      identifies the area.
//   2. DevTools Profiler to confirm the cost is real and find the widest bar.
//   3. why-did-you-render on that ONE component to name the offending prop.
//   4. Fix at the source, then re-measure in the Profiler. → 11 §7
//
// ⚠️ Version compatibility, said honestly: why-did-you-render patches React
//    internals, so it has historically lagged major React releases and can break
//    on a new one. Check its support for your React version before relying on
//    it — and know that DevTools' "why did this render" plus React Scan cover
//    most of the same ground with no patching at all. That caveat is a better
//    answer than pretending the tool is eternal.
//
// The strategic point, which is the real answer to "do you use wdyr?":
//   In React 19 with the Compiler, the bug this tool detects is largely compiled
//   away — the compiler memoizes values whose dependencies did not change, so
//   inline objects stop breaking downstream memoization. The tool becomes
//   historical for new code and stays essential for the large uncompiled
//   codebase you are actually being hired to work on.

console.log("§7 — the four tools, and the order I use them:\n");
const order = [
  ["1. React Scan / highlight updates", "WHERE is re-rendering?",  "~4 seconds"],
  ["2. DevTools Profiler",              "is it actually EXPENSIVE?", "~1 minute"],
  ["3. why-did-you-render",             "was it AVOIDABLE, and which prop?", "~2 minutes"],
  ["4. Profiler again",                 "did my fix WORK?",        "~1 minute"],
];
for (const [tool, question, time] of order) {
  console.log(`    ${tool.padEnd(36)} ${question.padEnd(36)} ${time}`);
}
console.log("\n  Note step 4. Skipping it is how codebases accumulate memoization");
console.log("  that nobody can prove is doing anything. → 11 §7\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT IT DOES NOT TELL YOU
// ══════════════════════════════════════════════════════════════════
//
// Bring these up unprompted — it is the difference between using a tool and
// understanding it.
//
//   • It does not say whether the render MATTERED. A hundred avoidable renders
//     of a <span> is a report, not a problem. Cross-reference with the Profiler
//     before acting. → 03 §4
//   • It does not measure time at all. That is the Profiler's job.
//   • Its deep comparison is not React's semantics. Two functions with identical
//     source but different closures read as equal. → §5.
//   • It reports renders, not COMMITS. A re-render that changes no DOM costs
//     JavaScript only, and React was designed for that to be cheap.
//   • It can be fooled by StrictMode's double rendering in development.
//   • It says nothing about the mount cost of a huge list — that is
//     virtualization's territory, and no amount of memo will touch it. → 07


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "I set it up and nothing logs":
//   The import is not first, so React was already patched-around. → §4.
//
// Bug 2 — The console is unusable:
//   logOnDifferentValues: true, or tracking the whole app. → §4.
//
// Bug 3 — It shipped to production:
//   No NODE_ENV guard inside wdyr.js, or a dependency instead of a
//   devDependency. → §6.
//
// Bug 4 — The app is crawling in development:
//   Deep comparison of every prop of every component. That is the tool
//   working. Narrow it with `include`. → §6.
//
// Bug 5 — Memoized dozens of components based on its output, no faster:
//   Those renders were cheap. Avoidable ≠ expensive. → §8.
//
// Bug 6 — It breaks after a React upgrade:
//   It patches React internals. Check version support. → §7.
//
// Bug 7 — It flags a render as avoidable and the fix breaks the UI:
//   The function-source comparison called two different closures equal. → §5.
//
// Bug 8 — Everything is flagged in a Next.js app:
//   It is also running during the server render. Guard it for the client.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The core trick:
assert(findings.length === 4,
  "React sees 4 changed props (title is an identical primitive, so it is skipped)");
assert(avoidable === 3, "...but 3 of the 4 were deeply equal — avoidable renders 🐛");
assert(findings.find(f => f.prop === "count").avoidable === false,
  "only `count` genuinely changed — that render was earned ✅");
assert(findings.find(f => f.prop === "filters").avoidable === true,
  "an inline object: different reference, identical value");
assert(findings.find(f => f.prop === "onSelect").kind === "function",
  "...and it names the KIND, so you know whether you need useMemo or useCallback");
assert(findings.some(f => f.prop === "title") === false,
  "an unchanged primitive never appears — Object.is matched, so React already skipped it");

// The cost:
assert(cost.deep > cost.shallow, "a deep comparison is strictly more work than React's");
assert(cost.ratio === 216, "3 levels of nesting → 216× more comparisons than React does");

console.log("§10 — mini assertions passed for: Why Did You Render");
console.log("\n  The pair that captures it: four props changed by React's rules, but");
console.log("  only ONE changed by value. That gap is the tool's entire contribution");
console.log("  — and paying 216× React's comparison cost is why it stays in dev.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is why-did-you-render / how do you find wasted renders?",
// answer:
//
//   "It's a dev-only library that patches React and reports re-renders that were
//    avoidable. The trick is simple and worth stating: React compares props
//    shallowly with Object.is, so a new object with identical contents counts as
//    changed. why-did-you-render additionally compares DEEPLY, and when the
//    shallow check says 'changed' but the deep check says 'identical', that
//    render was pure waste — and it logs the prop name.
//
//    That's what makes it complementary to the Profiler rather than a
//    replacement. The Profiler tells me a component rendered and how long it
//    took. This tells me whether it needed to. In my example React saw four
//    changed props; only one had actually changed by value, and the other three
//    were an inline object, an inline array and an inline arrow.
//
//    The setup detail that trips everyone is import order — it patches
//    createElement, so the wdyr import has to be the very first line of the
//    entry file. 'I set it up and nothing logs' is nearly always that. And I'd
//    keep logOnDifferentValues false so it reports only avoidable renders,
//    otherwise the console is unreadable and you stop looking at it.
//
//    It absolutely must not ship. It deep-compares every prop of every tracked
//    component on every render — in my numbers, a couple of hundred times
//    React's own comparison cost — so the NODE_ENV guard belongs inside the wdyr
//    module, not just at the import site, and it goes in devDependencies.
//
//    In practice I use four tools in order: React Scan or DevTools' 'highlight
//    updates' to find WHERE, in about four seconds; the Profiler to confirm the
//    cost is real; why-did-you-render on that one component to name the prop;
//    and the Profiler again to prove the fix worked.
//
//    Two honest caveats. Avoidable isn't the same as expensive — a hundred
//    wasted renders of a span is a report, not a problem, so I cross-reference
//    with the Profiler before optimizing anything. And because it patches React
//    internals it has historically lagged major React releases, so I'd check
//    version support; DevTools' 'why did this render' covers most of the same
//    ground with no patching. In a React 19 codebase with the Compiler, the bug
//    class it detects is largely compiled away — but that isn't the codebase
//    most of us are maintaining."
//
// The shallow-vs-deep explanation, the import-order rule, and "avoidable is not
// the same as expensive" are the three things that show real usage.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does why-did-you-render detect?
// A1. Re-renders where props were deeply equal but referentially different —
//     i.e. avoidable ones.
//
// Q2. How does it work?
// A2. It patches React and deep-compares props, then reports where its answer
//     disagrees with React's shallow one.
//
// Q3. Why must the import be first?
// A3. It patches createElement. Modules evaluated before the patch are
//     invisible to it.
//
// Q4. Why is it dev-only?
// A4. Deep comparison on every render is exactly the O(n) cost React avoids by
//     design. It would make production measurably slower.
//
// Q5. How is it different from the Profiler?
// A5. The Profiler measures duration and shows what rendered. This says whether
//     the render was necessary and names the prop.
//
// Q6. Does an avoidable render always need fixing?
// A6. No. Cross-reference with the Profiler — cheap renders aren't worth the
//     memoization complexity.
//
// Q7. What are the alternatives?
// A7. DevTools' "why did this render", React Scan for live highlighting, and
//     the React Compiler, which removes the problem class.
//
// Q8. What's its known weakness?
// A8. It compares functions by source text, so identical bodies with different
//     closures read as equal. Treat it as a lead.
//
// Q9. How do you scope it to one component?
// A9. Component.whyDidYouRender = true, or an `include` regex in the config.
//
// Q10. How do you confirm it isn't in production?
// A10. Search the built bundle for the package name, and keep it in
//      devDependencies.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What does wdyr detect?
//   Back : Renders where props were deeply equal but referentially different.
//
// Flashcard 2:
//   Front: The mechanism?
//   Back : Deep-compare, and report where it disagrees with React's Object.is.
//
// Flashcard 3:
//   Front: Why must the import be first?
//   Back : It patches createElement; earlier modules are invisible.
//
// Flashcard 4:
//   Front: The most common message?
//   Back : "different objects that are equal by value" — an inline object prop.
//
// Flashcard 5:
//   Front: Why dev-only?
//   Back : Deep comparison per render is the cost React exists to avoid.
//
// Flashcard 6:
//   Front: Avoidable vs expensive?
//   Back : Not the same. Confirm cost with the Profiler before optimizing.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Name the shallow-vs-deep disagreement, and say "avoidable isn't
//          expensive".


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Install it in a real app, import it first, and set
//   trackAllPureComponents: true. Read the first ten entries.
//
// Task 2:
//   Deliberately pass an inline object to a memo'd child and confirm the
//   "equal by value" message. Fix it with useMemo and watch it disappear.
//
// Task 3:
//   Import it SECOND instead of first and confirm nothing logs. Now you'll
//   never lose an hour to that.
//
// Task 4:
//   Set logOnDifferentValues to true, then false. Compare the console volume.
//
// Task 5:
//   Take three components it flagged and profile them. Find one where the
//   avoidable render was too cheap to bother fixing.
//
// Task 6:
//   Build for production and grep the bundle for "whyDidYouRender". Make sure
//   it isn't there.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   It deep-compares props and reports where React's shallow check disagreed —
//   which is exactly the definition of an avoidable render.
//
// If you remember the common bug:
//   The import must be the FIRST line, and the tool must never reach production.
//
// If you remember the professional framing:
//   Avoidable is not the same as expensive. Use it with the Profiler, fix the
//   prop at its source, and re-measure.
//
// NEXT TOPIC -> 13_web-vitals-lcp-fcp-cls-inp.js
