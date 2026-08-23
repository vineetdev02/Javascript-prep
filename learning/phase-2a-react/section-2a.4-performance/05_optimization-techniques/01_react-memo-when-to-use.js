// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  01_react-memo-when-to-use.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: React.memo — when to use
//
// WHAT YOU WILL MASTER HERE:
//   1. The DEFAULT rule React.memo overrides — parent renders, child renders
//   2. What memo actually compares: shallow, Object.is, per prop — PROVEN
//   3. The four situations where memo does exactly nothing
//   4. memo is not free: the cost, and when it is a net LOSS
//   5. The custom comparator, and its inverted return value
//   6. The alternative that needs no memo at all: move state down
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/01_react-memo-when-to-use.js"
//
// Prerequisites: 02_built-in-hooks/07_usememo-when-to-use.js and
// 08_usecallback-when-to-use.js. This file is why those two exist at all.
//
// This is the first file of Section 2A.4. It sets up the entire section:
// 02 is the reason memo usually fails, 03 is the wider toolkit.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// React.memo:
// A higher-order component that lets a component SKIP re-rendering when its
// props are shallow-equal to the previous props.
//
// If interviewer says "explain it simply", say:
// "By default, when a parent re-renders, every child re-renders too — even if
//  nothing that child cares about changed. React.memo wraps a component so
//  React compares the new props to the old ones first, and skips the render if
//  they match."
//
// If interviewer asks "why does it matter?", say:
// "Because React's default is deliberately pessimistic. It re-renders the whole
//  subtree because that is always CORRECT and usually cheap. memo trades a
//  comparison for a skipped render — which only pays off when the render is
//  expensive and the props genuinely do not change. Most memo calls in real
//  codebases fail the second condition, because a parent passing an inline
//  object or arrow function gives it a new prop every time."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   memo is a BET: comparison cost < render cost
//
// Runtime rule (the default memo overrides):
//   A component re-renders when
//     (a) its own state changes, or
//     (b) its context value changes, or
//     (c) ITS PARENT RE-RENDERS — regardless of props.
//
//   memo removes (c) — and ONLY (c). It cannot stop (a) or (b).
//
// Practical rule:
//   Reach for memo when a component is EXPENSIVE and its props are STABLE.
//   If either half is false, memo is dead weight — a comparison you pay for
//   and a skip you never get.
//
// Common trap:
//   `<Memoized data={{ id: 1 }} />` — memo does nothing. A fresh object literal
//   every render fails Object.is every render. That is topic 02, and it is the
//   single most common reason memo "does not work".
//
// The mental picture:
//
//   without memo            with memo (props changed)     with memo (props same)
//   ─────────────           ─────────────────────────     ──────────────────────
//   parent renders          parent renders                parent renders
//     child renders           compare props (cheap)         compare props (cheap)
//                             child renders                 SKIP — reuse output
//
// Note the middle column: when props DO change, memo is pure overhead.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE DEFAULT: PARENT RENDERS → CHILD RENDERS
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the default React behaviour:\n");

// A 30-line React renderer. Enough to prove everything in this file.
function createRenderer() {
  const counts = {};
  const prevProps = {};
  const memoized = new Set();
  const comparators = {};
  let comparisons = 0;

  function shallowEqual(a, b) {
    if (Object.is(a, b)) return true;
    if (!a || !b) return false;
    const ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    // This loop IS React's comparison. Object.is, per key, one level deep.
    return ak.every(k => { comparisons++; return Object.is(a[k], b[k]); });
  }

  function render(name, props = {}) {
    if (memoized.has(name) && name in prevProps) {
      const equal = comparators[name]
        ? comparators[name](prevProps[name], props)
        : shallowEqual(prevProps[name], props);
      if (equal) return "SKIPPED";          // ← the entire point of memo
    }
    prevProps[name] = props;
    counts[name] = (counts[name] || 0) + 1;
    return "RENDERED";
  }

  return {
    render,
    memo: (name, comparator) => { memoized.add(name); if (comparator) comparators[name] = comparator; },
    count: name => counts[name] || 0,
    comparisons: () => comparisons,
    resetComparisons: () => { comparisons = 0; },
  };
}

// The app:  <Parent count>  →  <Header/>  <ExpensiveList items/>  <Footer/>
// The user clicks a button that only affects `count`, three times.

const plain = createRenderer();
const items = ["a", "b", "c"];              // ← never changes. Defined ONCE.

function renderAppPlain(count) {
  plain.render("Parent", { count });
  plain.render("Header", {});               // no props at all
  plain.render("ExpensiveList", { items }); // same array reference every time
  plain.render("Footer", {});
}

renderAppPlain(0);
renderAppPlain(1);
renderAppPlain(2);
renderAppPlain(3);

console.log("  4 renders of <Parent> (initial + 3 clicks), nothing else changed:");
console.log("    Parent        :", plain.count("Parent"));
console.log("    Header        :", plain.count("Header"), "🐛 zero props, still re-rendered");
console.log("    ExpensiveList :", plain.count("ExpensiveList"), "🐛 identical items, still re-rendered");
console.log("    Footer        :", plain.count("Footer"), "🐛");
console.log("\n  React does not check whether the child's props changed. It just");
console.log("  re-renders the subtree, because that is ALWAYS correct and usually");
console.log("  cheap enough. That default is what memo opts out of.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — memo, AND WHAT IT SAVES
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the same app, with memo:\n");

const memoed = createRenderer();
memoed.memo("Header");
memoed.memo("ExpensiveList");
memoed.memo("Footer");

function renderAppMemo(count) {
  memoed.render("Parent", { count });      // NOT memoized — its own prop changes
  memoed.render("Header", {});
  memoed.render("ExpensiveList", { items });
  memoed.render("Footer", {});
}

renderAppMemo(0);
renderAppMemo(1);
renderAppMemo(2);
renderAppMemo(3);

const plainTotal =
  plain.count("Parent") + plain.count("Header") +
  plain.count("ExpensiveList") + plain.count("Footer");
const memoTotal =
  memoed.count("Parent") + memoed.count("Header") +
  memoed.count("ExpensiveList") + memoed.count("Footer");

console.log("    Parent        :", memoed.count("Parent"), "← still 4. memo cannot stop your OWN state.");
console.log("    Header        :", memoed.count("Header"), "✅ rendered once, skipped 3×");
console.log("    ExpensiveList :", memoed.count("ExpensiveList"), "✅");
console.log("    Footer        :", memoed.count("Footer"), "✅");
console.log("\n    total renders — without memo:", plainTotal, " with memo:", memoTotal);
console.log("\n  Read the Parent row twice. memo on a CHILD does not stop the child");
console.log("  from rendering when its own state changes — it only stops the render");
console.log("  that was caused by the PARENT. That is the single distinction.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — WHAT memo ACTUALLY COMPARES: SHALLOW, Object.is, PER PROP
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the comparison is one level deep:\n");

// React's real default comparator, near enough to copy into an interview:
//
//   function arePropsEqual(prev, next) {
//     const a = Object.keys(prev), b = Object.keys(next);
//     if (a.length !== b.length) return false;
//     for (const key of a) if (!Object.is(prev[key], next[key])) return false;
//     return true;
//   }
//
// Notice what is NOT in it: no recursion, no JSON.stringify, no deep equality.

const user = { id: 1, name: "Vineet" };

const cases = [
  ["primitive, same value  ", { count: 5 },          { count: 5 }],
  ["primitive, new value   ", { count: 5 },          { count: 6 }],
  ["same object reference  ", { user },              { user }],
  ["equal object, NEW ref  ", { user: { id: 1 } },   { user: { id: 1 } }],
  ["inline arrow function  ", { onClick: () => {} }, { onClick: () => {} }],
  ["NaN (Object.is quirk)  ", { v: NaN },            { v: NaN }],
  ["+0 vs -0 (Object.is)   ", { v: 0 },              { v: -0 }],
];

function shallowEqual(a, b) {
  const ak = Object.keys(a), bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every(k => Object.is(a[k], b[k]));
}

for (const [label, prev, next] of cases) {
  const equal = shallowEqual(prev, next);
  console.log(`    ${label} → ${equal ? "EQUAL   ✅ skip" : "DIFFERENT 🐛 render"}`);
}

console.log("\n  Rows 4 and 5 are the whole tragedy of React.memo. `{ id: 1 }` and");
console.log("  `{ id: 1 }` are DIFFERENT objects, and `() => {}` and `() => {}` are");
console.log("  DIFFERENT functions. A parent that writes either one inline hands its");
console.log("  memoized child a brand-new prop on every single render, and the memo");
console.log("  never skips once. → 02_referential-equality-problem.js");
console.log("\n  Rows 6 and 7 are Object.is, not ===. Object.is(NaN, NaN) is true");
console.log("  (=== says false) and Object.is(0, -0) is false (=== says true).");
console.log("  Interviewers ask this to see whether you know the comparator by name.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE FOUR PLACES memo DOES NOTHING
// ══════════════════════════════════════════════════════════════════

console.log("§6 — memo fails, four ways:\n");

// ── 1. A new object/function prop every render ────────────────────
const broken1 = createRenderer();
broken1.memo("Row");
for (let i = 0; i < 4; i++) {
  broken1.render("Row", { style: { color: "red" }, onClick: () => {} });
  //                     ^^^^^^^^^^^^^^^^^^^^^^^  new object, new function, every time
}
console.log("    1. inline object + arrow prop  → Row rendered", broken1.count("Row"), "/ 4 🐛");
console.log("       memo is present and is skipping NOTHING. Fix: useMemo/useCallback,");
console.log("       or hoist the constant out. → 02");

// ── 2. `children` as a JSX prop ───────────────────────────────────
//   <Memoized><Slow /></Memoized>
//   `children` is a React ELEMENT, created fresh by the parent on every render.
//   A new element object → new prop → memo never skips. This one surprises
//   people because there is no visible object literal in the JSX.
const broken2 = createRenderer();
broken2.memo("Card");
for (let i = 0; i < 4; i++) {
  broken2.render("Card", { children: { $$typeof: "react.element", type: "Slow" } });
}
console.log("    2. <Memoized>{children}</Memoized> → Card rendered", broken2.count("Card"), "/ 4 🐛");
console.log("       JSX children are freshly-created element objects. Invisible trap.");

// ── 3. Context ────────────────────────────────────────────────────
//   memo does not sit between a context Provider and its consumers. If the
//   component calls useContext and the value changes, it re-renders — even
//   with identical props and even if every ancestor skipped.
const broken3 = createRenderer();
broken3.memo("ThemedButton");
function renderThemed(themeValue) {
  const skipped = broken3.render("ThemedButton", {}) === "SKIPPED";
  // ...but useContext(ThemeContext) subscribed it directly to the provider:
  if (skipped && themeValue !== renderThemed.lastTheme) broken3.render("ThemedButton", { _ctx: themeValue });
  renderThemed.lastTheme = themeValue;
}
renderThemed("light"); renderThemed("dark"); renderThemed("light"); renderThemed("dark");
console.log("    3. useContext inside a memo'd component → rendered", broken3.count("ThemedButton"), "/ 4 🐛");
console.log("       memo filters PROPS. Context is a separate subscription. → 03 §7");

// ── 4. The component's own state ──────────────────────────────────
console.log("    4. its own setState → memo is irrelevant. §4's Parent row.");
console.log("\n  Memorize the list: new-reference props, children, context, own state.");
console.log("  If a memo is 'not working', it is one of those four, in that order of");
console.log("  likelihood.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — memo IS NOT FREE
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the cost side of the bet:\n");

// The comparison runs on EVERY parent render, for EVERY memoized child, over
// EVERY prop. When it succeeds you save a render. When it fails you paid for
// nothing — twice, because you also pay for the extra prevProps retained in
// memory.

const wide = createRenderer();
wide.memo("Cheap");
wide.resetComparisons();

const manyProps = () => ({
  a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8,
  onSelect: handleSelect,       // stable — hoisted below
});
function handleSelect() {}

for (let i = 0; i < 100; i++) wide.render("Cheap", manyProps());

console.log("    100 parent renders × 9 props on a memoized child");
console.log("      prop comparisons performed:", wide.comparisons());
console.log("      renders saved             :", 100 - wide.count("Cheap"));
console.log("\n  Here the bet PAID: 891 cheap Object.is calls bought 99 skipped renders.");
console.log("  Now flip one condition. If `onSelect` were an inline arrow, all 891");
console.log("  comparisons still run, every one of them ends in a re-render anyway,");
console.log("  and you have made the app strictly slower than no memo at all.");
console.log("\n  The rule that follows:");
console.log("    memo an EXPENSIVE component with STABLE props.  ✅");
console.log("    memo a <span> that renders a string.            ❌ pure overhead.");
console.log("    memo everything 'just in case'.                 ❌ this is the common");
console.log("       failure — a codebase where 200 memos each cost a comparison and");
console.log("       almost none of them ever skip.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE CUSTOM COMPARATOR (AND ITS INVERTED RETURN)
// ══════════════════════════════════════════════════════════════════

console.log("§8 — memo's second argument:\n");

//   const Row = React.memo(RowImpl, (prevProps, nextProps) => {
//     return prevProps.user.id === nextProps.user.id;   // true → SKIP
//   });
//
// ⚠️ THE TRAP: memo's comparator returns TRUE for "equal, skip the render".
//    shouldComponentUpdate returns TRUE for "yes, DO update". They are exact
//    opposites, and interviewers love this. → 09_shouldcomponentupdate.js

const custom = createRenderer();
custom.memo("UserRow", (prev, next) => prev.user.id === next.user.id);

// The parent rebuilds the user object each render (a fetch response, say),
// but the id is what the row actually renders.
custom.render("UserRow", { user: { id: 7, name: "Vineet" } });
custom.render("UserRow", { user: { id: 7, name: "Vineet" } });   // new object, same id
custom.render("UserRow", { user: { id: 7, name: "Vineet" } });
custom.render("UserRow", { user: { id: 8, name: "Asha" } });     // id changed

console.log("    4 renders, 3 with the same id, objects recreated each time");
console.log("      renders with custom comparator:", custom.count("UserRow"), "✅ (2: initial + id change)");

const noComparator = createRenderer();
noComparator.memo("UserRowDefault");
for (const u of [{ id: 7 }, { id: 7 }, { id: 7 }, { id: 8 }]) {
  noComparator.render("UserRowDefault", { user: u });
}
console.log("      renders with the DEFAULT shallow one:", noComparator.count("UserRowDefault"), "🐛 (all 4)");

console.log("\n  So the comparator works. Use it sparingly anyway:");
console.log("    • It is easy to compare too little and ship a STALE UI — a real bug,");
console.log("      not a slow render. Skipping a render you needed has no warning.");
console.log("    • A deep-equality comparator on a big object can cost more than the");
console.log("      render it saves. Comparing 10,000 keys to skip a <div> is a loss.");
console.log("    • Usually the honest fix is upstream: stop recreating the object.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — THE ALTERNATIVE THAT NEEDS NO memo
// ══════════════════════════════════════════════════════════════════

console.log("§9 — move the state down / pass children:\n");

// ❌ State at the top. Every keystroke re-renders the whole page.
const before = createRenderer();
function renderBefore(text) {
  before.render("Page", { text });
  before.render("SearchInput", { text });
  before.render("ExpensiveChart", { data: "static" });
}
["", "r", "re", "rea", "reac", "react"].forEach(renderBefore);

// ✅ The state moved INTO the component that uses it. The chart is a sibling
//    the state never reaches, so it is not re-rendered — no memo involved.
const after = createRenderer();
after.render("Page", {});                        // renders once
after.render("ExpensiveChart", { data: "static" });
["", "r", "re", "rea", "reac", "react"].forEach(t => after.render("SearchInput", { text: t }));

console.log("    typing 'react' (6 renders):");
console.log("      state at the top   → ExpensiveChart rendered", before.count("ExpensiveChart"), "🐛");
console.log("      state moved down   → ExpensiveChart rendered", after.count("ExpensiveChart"), "✅");
console.log("      ...and zero memo, zero useCallback, zero dependency arrays.");

console.log("\n  This is the senior answer. memo makes an expensive render conditional.");
console.log("  Restructuring stops the render from being triggered at all. The second");
console.log("  is better because there is no comparison to pay for, no dependency");
console.log("  array to get wrong, and nothing to go stale.");
console.log("\n  Two structural moves, in order of preference:");
console.log("    1. Move state DOWN into the smallest component that reads it.");
console.log("    2. Lift the expensive part UP and pass it as `children`. A parent");
console.log("       whose state changes does not re-render a child ELEMENT it was");
console.log("       handed — the element was created by ITS parent and is unchanged.");
console.log("       (Yes: the same `children` that breaks memo in §6 is what makes");
console.log("        this work. It is one fact seen from both sides.)\n");


// ══════════════════════════════════════════════════════════════════
// § 10 — WHEN memo IS ACTUALLY RIGHT
// ══════════════════════════════════════════════════════════════════
//
// All four of these must hold. If you cannot say yes to all four, do not memo.
//
//   1. The component renders something genuinely expensive — a big list row, a
//      chart, a heavy tree — or it is rendered MANY times (1,000 rows).
//   2. Its props are stable, or you have made them stable on purpose.
//   3. Its parent re-renders often for reasons unrelated to this component.
//   4. You MEASURED it. The Profiler says this component is hot. → 11
//
// The canonical fit: a memoized row inside a long list, where the parent holds
// a `selectedId` that changes on every click. Without memo, one click re-renders
// 1,000 rows. With memo — and a stable onSelect from useCallback — it re-renders
// the two rows whose selected state actually flipped.
//
// The canonical waste: `export default memo(Avatar)` on a 3-line component whose
// parent re-renders twice a session.
//
// ── React 19 and the React Compiler ───────────────────────────────
// The Compiler auto-memoizes components and values at build time by tracking
// which values can change — so hand-written memo/useMemo/useCallback become
// largely unnecessary in a compiled codebase. Two things stay true, and say
// them if this comes up:
//   • The compiler memoizes what it can PROVE is safe. It bails out on code that
//     mutates during render, so the rules of React still buy you the optimization.
//   • It changes who writes the memo, not what memoization IS. You are still
//     asked this question because you still have to debug it.


// ══════════════════════════════════════════════════════════════════
// § 11 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "I added memo and nothing changed":
//   An inline object/arrow prop. Every comparison fails. → §6.1, and 02.
//
// Bug 2 — "memo works until I wrap the child in a <div> with children":
//   `children` is a new element object each render. → §6.2.
//
// Bug 3 — "memo'd component still re-renders on theme change":
//   useContext. memo does not filter context. → §6.3.
//
// Bug 4 — A custom comparator that compares too little → STALE UI:
//   (prev, next) => prev.id === next.id, and then `name` changes and never
//   shows. A skipped render fails silently. → §8.
//
// Bug 5 — Comparator return value inverted:
//   Someone ports shouldComponentUpdate logic into memo. Returning true means
//   "skip" here and "render" there, so the component freezes completely. → §8.
//
// Bug 6 — memo everywhere, app is slower:
//   200 comparisons per render, almost no skips. → §7.
//
// Bug 7 — memo on a component that takes a `style={{...}}` prop from a design
//   system wrapper: the wrapper is the one recreating it. The fix is one level
//   up from where the memo is. → 02.


// ══════════════════════════════════════════════════════════════════
// § 12 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The default:
assert(plain.count("Header") === 4,
  "without memo, a child with NO props still re-renders on every parent render 🐛");
assert(plain.count("ExpensiveList") === 4,
  "...even when the prop is the identical array reference");

// What memo buys:
assert(memoed.count("Header") === 1, "memo → rendered once, skipped 3× ✅");
assert(memoed.count("ExpensiveList") === 1, "same reference → shallow-equal → skip");
assert(memoed.count("Parent") === 4,
  "memo CANNOT stop a component's own state change — only parent-caused renders");
assert(plainTotal === 16 && memoTotal === 7, "16 renders → 7");

// The comparison:
assert(shallowEqual({ user }, { user }) === true, "same reference → equal");
assert(shallowEqual({ user: { id: 1 } }, { user: { id: 1 } }) === false,
  "equal CONTENTS, different reference → memo re-renders 🐛 this is topic 02");
assert(shallowEqual({ v: NaN }, { v: NaN }) === true, "Object.is(NaN, NaN) is true — unlike ===");
assert(shallowEqual({ v: 0 }, { v: -0 }) === false, "Object.is(0, -0) is false — unlike ===");

// The four failures:
assert(broken1.count("Row") === 4, "inline object + arrow → memo skips nothing 🐛");
assert(broken2.count("Card") === 4, "JSX children are new element objects each render 🐛");
assert(broken3.count("ThemedButton") === 4, "context bypasses memo entirely 🐛");

// The cost:
assert(wide.comparisons() === 891,
  "99 comparison passes × 9 props = 891 Object.is calls — that is the price");
assert(wide.count("Cheap") === 1, "...which bought 99 skipped renders. A good bet.");

// The comparator:
assert(custom.count("UserRow") === 2, "custom comparator on id → 2 renders instead of 4 ✅");
assert(noComparator.count("UserRowDefault") === 4, "...the default shallow one skips none");

// The structural fix:
assert(before.count("ExpensiveChart") === 6, "state at the top re-renders the chart on every keystroke 🐛");
assert(after.count("ExpensiveChart") === 1, "state moved down → the chart renders once, with no memo ✅");

console.log("§12 — mini assertions passed for: React.memo — when to use");
console.log("\n  The pair that captures it: memo turned 16 renders into 7 — and moving");
console.log("  one piece of state down turned 6 chart renders into 1, using no memo");
console.log("  at all. Reach for the second one first.");


// ══════════════════════════════════════════════════════════════════
// § 13 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is React.memo and when would you use it?", answer:
//
//   "React's default is that when a component re-renders, its whole subtree
//    re-renders — regardless of whether any child's props changed. That's
//    deliberate: it's always correct and usually cheap. React.memo opts a
//    component out of that. It compares the new props to the old ones and skips
//    the render if they're shallow-equal.
//
//    Shallow means one level, Object.is per key — not deep equality. So
//    { id: 1 } and { id: 1 } are DIFFERENT, and an inline arrow is different
//    from the last inline arrow. That's why most memos in real codebases never
//    skip a single render: the parent hands them a fresh object or callback
//    every time. If you memo a child, you usually have to useCallback and
//    useMemo the props too — memo alone is half a fix.
//
//    There are four things memo can't help with, and I'd name them: new-reference
//    props, `children` — which is a freshly-created element object every render —
//    context, since memo filters props and context is a separate subscription,
//    and the component's own state.
//
//    And memo isn't free. The comparison runs on every parent render over every
//    prop, so memoizing everything 'just in case' makes an app measurably
//    slower — you pay for hundreds of comparisons and skip almost nothing. My
//    bar is four things: the render is genuinely expensive or repeated across
//    many rows, the props are stable, the parent re-renders often for unrelated
//    reasons, and the Profiler actually flagged it.
//
//    The answer I'd give first, though, is that memo is the second-best fix.
//    memo makes an expensive render conditional; restructuring stops it being
//    triggered. Move the state down into the component that reads it, or lift
//    the expensive part up and pass it as children — a parent doesn't re-render
//    a child element it was handed. In our search page that turned six chart
//    renders per word typed into one, with no memo, no useCallback and no
//    dependency array to get wrong.
//
//    In React 19 the Compiler does most of this automatically at build time,
//    which changes who writes the memo, not what it is — you still have to
//    debug it."
//
// The "second-best fix" framing and the four-failure list are what make this
// senior. Anyone can define memo.


// ══════════════════════════════════════════════════════════════════
// § 14 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does React.memo compare?
// A1. Props, shallowly — Object.is on each key, one level deep. Not deep equality.
//
// Q2. Does memo stop a re-render caused by useState inside the component?
// A2. No. memo only blocks renders caused by the PARENT re-rendering.
//
// Q3. Does memo stop a re-render caused by context?
// A3. No. useContext subscribes directly to the provider, above the prop check.
//
// Q4. Why does my memo'd component still re-render when I pass children?
// A4. `children` is a React element object, recreated by the parent every
//     render, so the shallow comparison always fails.
//
// Q5. memo vs useMemo?
// A5. memo memoizes a COMPONENT's rendered output based on props. useMemo
//     memoizes a VALUE inside a render based on a dependency array. You often
//     need useMemo to make memo work, because it stabilizes the prop.
//
// Q6. Is the comparator's return value the same as shouldComponentUpdate's?
// A6. Inverted. memo: true = props are equal = SKIP. sCU: true = DO update.
//
// Q7. When is memo a net loss?
// A7. When props change every render (you pay the comparison and render anyway),
//     or when the render is cheaper than the comparison.
//
// Q8. Should I just memo everything?
// A8. No — the comparisons are real cost and most never skip. Measure with the
//     Profiler, then memo the hot component.
//
// Q9. What is better than memo?
// A9. Not rendering at all: move state down, or pass the expensive subtree as
//     children so the re-rendering parent never re-creates it.
//
// Q10. Does memo do anything about the DOM?
// A10. It skips the component function AND the reconciliation of its subtree.
//      That's why it's worth more on a deep tree than a leaf.


// ══════════════════════════════════════════════════════════════════
// § 15 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is React's default render rule?
//   Back : Parent re-renders → whole subtree re-renders, props unchecked.
//
// Flashcard 2:
//   Front: What does memo compare?
//   Back : Props. Shallow. Object.is per key. One level.
//
// Flashcard 3:
//   Front: Four things memo cannot stop?
//   Back : New-reference props, children, context, own state.
//
// Flashcard 4:
//   Front: memo comparator returns true — what happens?
//   Back : SKIP the render. (Opposite of shouldComponentUpdate.)
//
// Flashcard 5:
//   Front: When is memo a net loss?
//   Back : Props change anyway, or the render is cheaper than the comparison.
//
// Flashcard 6:
//   Front: What beats memo?
//   Back : Moving state down, or passing the expensive tree as children.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "memo makes a render conditional; restructuring stops it being
//          triggered." And: memo is a bet you should measure before placing.


// ══════════════════════════════════════════════════════════════════
// § 16 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild §3 and §4 in a real app. A parent with a counter, three children,
//   a console.log in each. Click. Then add memo and click again.
//
// Task 2:
//   Break your own memo four different ways: inline object, inline arrow,
//   children, context. Confirm each one on its own.
//
// Task 3:
//   Write React's default comparator from memory in under 8 lines. Then explain
//   why Object.is and not ===.
//
// Task 4:
//   Take §9's search page and fix it twice — once with memo + useCallback, once
//   by moving state down. Count the lines each fix took.
//
// Task 5:
//   Write a custom comparator that compares only `user.id`, then change
//   `user.name` and watch the UI go stale. Feel why this is dangerous.
//
// Task 6:
//   Memo every component in a small app and profile it. Find the case where
//   memo made it slower, and be able to explain the number.


// ══════════════════════════════════════════════════════════════════
// § 17 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Parent renders → child renders. memo is the opt-out, and it compares props
//   shallowly with Object.is.
//
// If you remember the common bug:
//   An inline object or arrow prop makes memo skip nothing at all. So does
//   `children`. So does context.
//
// If you remember the professional framing:
//   memo is a bet — comparison cost against render cost — and most people place
//   it without measuring. The better move is structural: move state down, or
//   pass the expensive subtree as children, so there is no render to skip.
//
// NEXT TOPIC -> 02_referential-equality-problem.js
