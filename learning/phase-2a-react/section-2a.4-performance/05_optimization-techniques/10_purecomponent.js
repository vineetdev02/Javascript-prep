// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  10_purecomponent.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: PureComponent
//
// WHAT YOU WILL MASTER HERE:
//   1. What "pure" means here — and what it does NOT mean
//   2. React's shallowEqual, written out — the exact 8 lines React runs
//   3. It compares STATE too, which is the one difference from React.memo
//   4. Defining sCU inside a PureComponent: which one wins, and the warning
//   5. The nested-data trap, and why "pure" is a misleading name
//   6. The full comparison table: Component / PureComponent / memo / sCU
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/10_purecomponent.js"
//
// Prerequisites: 09_shouldcomponentupdate.js (PureComponent IS a prewritten sCU)
// and 01_react-memo-when-to-use.js (the function-component equivalent).
// This file closes the class-era pair; 11 onwards is measurement.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// React.PureComponent:
// A base class identical to React.Component except that it implements
// shouldComponentUpdate for you, as a SHALLOW comparison of props and state.
//
// If interviewer says "explain it simply", say:
// "It's Component with shouldComponentUpdate already written. React compares the
//  new props and state to the old ones, one level deep with Object.is, and skips
//  the render if everything matches."
//
// If interviewer asks "why does it matter?", say:
// "Because it's the class version of React.memo, and the comparison function is
//  literally the same one — React's shallowEqual. Which means it inherits every
//  one of memo's failure modes: a parent passing an inline object or arrow makes
//  it skip nothing at all. The name is also the most misleading in React: 'pure'
//  here refers to the comparison strategy, not to the component being a pure
//  function. A PureComponent can hold state, run side effects and be thoroughly
//  impure."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   PureComponent = Component + a free, SHALLOW sCU
//
// The implementation, in full — this is all it is:
//
//   class PureComponent extends Component {
//     shouldComponentUpdate(nextProps, nextState) {
//       return !shallowEqual(this.props, nextProps)
//           || !shallowEqual(this.state, nextState);
//     }
//   }
//
//   (React actually flags the class with isPureReactComponent and checks that
//    flag in the reconciler, so the check happens without a method call — but
//    the semantics are exactly the above.)
//
// Runtime rule:
//   Shallow means ONE LEVEL, Object.is per key. Not deep equality, not
//   JSON.stringify.
//
// Practical rule:
//   Use it on leaf components with primitive or stable props — list rows, cells,
//   labels. Not on containers that receive objects built in render.
//
// Common trap:
//   "Pure" does not mean "pure function". It means "compares props purely by
//   reference". A PureComponent that mutates state is broken in the worst way:
//   silently. → 09 §6.


// ══════════════════════════════════════════════════════════════════
// § 3 — React's shallowEqual, EXACTLY
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the comparison React actually runs:\n");

// This is React's shallowEqual, near enough to write on a whiteboard.
function shallowEqual(objA, objB) {
  if (Object.is(objA, objB)) return true;
  if (typeof objA !== "object" || objA === null ||
      typeof objB !== "object" || objB === null) return false;

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.hasOwn(objB, key) || !Object.is(objA[key], objB[key])) return false;
  }
  return true;
}

const SHARED_USER = { id: 1 };            // ONE object, referenced twice below
const SHARED_ROWS = [1, 2];

const cases = [
  ["primitives, same       ", { id: 1, name: "Vineet" }, { id: 1, name: "Vineet" }, true],
  ["primitives, changed    ", { id: 1 },                 { id: 2 },                 false],
  ["extra key added        ", { id: 1 },                 { id: 1, extra: 0 },       false],
  ["same nested reference  ", { user: SHARED_USER },     { user: SHARED_USER },     true],
  ["equal nested, new ref  ", { user: { id: 1 } },       { user: { id: 1 } },       false],
  ["array, same reference  ", { rows: SHARED_ROWS },     { rows: SHARED_ROWS },     true],
  ["array, same contents   ", { rows: [1, 2] },          { rows: [1, 2] },          false],
];

for (const [label, a, b, expected] of cases) {
  const got = shallowEqual(a, b);
  console.log(`    ${label} → ${got ? "EQUAL, skip  ✅" : "DIFFERENT, render"} ${got === expected ? "" : "  ‼️"}`);
}

console.log("\n  Rows 5 and 7 are the entire practical problem: contents identical,");
console.log("  references different, so PureComponent renders anyway. That is not a");
console.log("  bug in PureComponent — it is the price of an O(1) check. A deep");
console.log("  comparison would be correct and far too slow to run per component per");
console.log("  update. → 02_referential-equality-problem.js\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — Component vs PureComponent, SIDE BY SIDE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the same updates, two base classes:\n");

class Component_ {
  constructor(props) { this.props = props; this.state = {}; this.renders = 0; this.comparisons = 0; }
  shouldComponentUpdate() { return true; }
  render() { this.renders++; }
}
class PureComponent_ extends Component_ {
  shouldComponentUpdate(nextProps, nextState) {
    this.comparisons++;
    return !shallowEqual(this.props, nextProps) || !shallowEqual(this.state, nextState);
  }
}

function update(instance, nextProps, nextState = instance.state) {
  const should = instance.shouldComponentUpdate(nextProps, nextState);
  instance.props = nextProps;
  instance.state = nextState;
  if (should) instance.render();
  return should;
}

class Row extends Component_ {}
class PureRow extends PureComponent_ {}

const rows = new Row({ id: 7, label: "Widget" });
const pureRows = new PureRow({ id: 7, label: "Widget" });

// A parent re-rendering 5× with the SAME data (a common case — a sibling's
// state changed, and the parent re-renders everything).
for (let i = 0; i < 5; i++) {
  update(rows, { id: 7, label: "Widget" });
  update(pureRows, { id: 7, label: "Widget" });
}

console.log("    5 parent re-renders, props identical in value:");
console.log("      extends Component      → renders:", rows.renders, "🐛");
console.log("      extends PureComponent  → renders:", pureRows.renders,
  " comparisons:", pureRows.comparisons, "✅");

// ...and now the same test with an OBJECT prop rebuilt each render.
const pureWithObject = new PureRow({ user: { id: 7 } });
for (let i = 0; i < 5; i++) update(pureWithObject, { user: { id: 7 } });
console.log("\n    the same component with an inline object prop:");
console.log("      extends PureComponent  → renders:", pureWithObject.renders,
  " comparisons:", pureWithObject.comparisons, "🐛");
console.log("      → every comparison ran, every comparison failed, every render");
console.log("        happened anyway. You paid for the check and got nothing.");
console.log("\n  Exactly the memo story from 01 §6-7, in class form. PureComponent is");
console.log("  only as good as the props the parent gives it.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — IT COMPARES STATE TOO
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the one real difference from React.memo:\n");

// React.memo compares PROPS only. PureComponent compares props AND state. So a
// PureComponent can veto its OWN setState — something memo structurally cannot
// do, since a function component's state lives inside the component.

const stateful = new PureRow({});
stateful.state = { status: "idle" };

const sets = ["idle", "idle", "loading", "loading", "done"];
let vetoedSets = 0;
for (const status of sets) {
  const rendered = update(stateful, stateful.props, { status });
  if (!rendered) vetoedSets++;
}

console.log("    5 setState calls, 3 distinct values:");
console.log("      renders:", stateful.renders, " vetoed:", vetoedSets, "✅");
console.log("\n  ⚠️ But this cuts both ways, and it is the classic PureComponent bug:");

const listy = new PureRow({});
listy.state = { todos: ["a"] };
const before = listy.renders;
listy.state.todos.push("b");                 // 🐛 mutation
update(listy, listy.props, listy.state);     // setState(this.state)
console.log("      mutated this.state.todos, then setState(this.state)");
console.log("        data correct:", JSON.stringify(listy.state.todos));
console.log("        rendered?    ", listy.renders > before, "🐛 same object → 'equal' → frozen");

console.log("\n  A plain Component would have re-rendered here and hidden the mutation");
console.log("  entirely. PureComponent turns an invisible bug into a visible frozen");
console.log("  UI — which is better, but it is why 'we switched to PureComponent and");
console.log("  things stopped updating' is a real bug report. The fix is never to go");
console.log("  back to Component; it is to stop mutating. → 09 §6\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — DEFINING sCU INSIDE A PureComponent
// ══════════════════════════════════════════════════════════════════
//
//   class Row extends React.PureComponent {
//     shouldComponentUpdate(nextProps) { return nextProps.id !== this.props.id; }
//   }
//
// YOUR method wins — it overrides the inherited one, as with any subclass. But
// React warns in development:
//
//   Warning: Row has a method called shouldComponentUpdate(). shouldComponentUpdate
//   should not be used when extending React.PureComponent. Please extend
//   React.Component if shouldComponentUpdate is used.
//
// Because it is confusing, not because it fails: a reader sees "Pure" and
// assumes the shallow comparison is active, when in fact it has been replaced.
// Extend Component and write your own, or extend PureComponent and write none.
//
// ── Two related facts worth knowing ───────────────────────────────
//
//   1. Function components were NEVER "pure" by default. Before hooks, people
//      called them "stateless functional components" and assumed React
//      optimized them. It never did — they re-rendered on every parent render,
//      exactly like a plain Component. React.memo (2018) is what finally gave
//      them the PureComponent behaviour, opt-in.
//
//   2. `children` breaks PureComponent for the same reason it breaks memo: JSX
//      children are new element objects on every parent render, so the shallow
//      comparison on the `children` prop always fails. A PureComponent that
//      wraps other JSX almost never skips. → 01 §6.2

console.log("§6 — children defeats PureComponent, just like memo:\n");
const wrapper = new PureRow({ children: { type: "Chart" } });
for (let i = 0; i < 4; i++) update(wrapper, { children: { type: "Chart" } });
console.log("    <PureWrapper><Chart/></PureWrapper>, 4 parent renders:");
console.log("      renders:", wrapper.renders, "/ 4 🐛 — new element object each time\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE COMPARISON TABLE
// ══════════════════════════════════════════════════════════════════
//
//                      compares      compares   who writes    where it
//                      props?        state?     the compare?  applies
//   ──────────────────  ────────────  ─────────  ────────────  ──────────────
//   Component           no            no         —             classes
//   PureComponent       shallow       shallow    React         classes
//   Component + sCU     you decide    you decide you           classes
//   React.memo          shallow       n/a        React         functions
//   memo + comparator   you decide    n/a        you           functions
//   React Compiler      automatic     automatic  the compiler  functions (19+)
//
// Notes that turn the table into an answer:
//   • PureComponent's comparison and memo's DEFAULT comparison are the same
//     function — React's shallowEqual. Not "similar": the same.
//   • memo has no state column because a function component's state is internal;
//     there is nothing outside to compare. Which is also why there is no hook
//     that vetoes a render on state. → 09 §8.
//   • Returning false from sCU and returning true from a memo comparator both
//     mean "skip". The words are inverted; the outcome is identical. → 09 §2.
//   • All of them stop at the same wall: context. None of these mechanisms can
//     filter a context update. → 01 §6.3, 09 §5.

console.log("§7 — one comparison function, two eras:\n");
const propsA = { id: 1, name: "Vineet" };
const propsB = { id: 1, name: "Vineet" };
console.log("    PureComponent's sCU  →", !shallowEqual(propsA, propsB) ? "render" : "skip");
console.log("    memo's default       →", shallowEqual(propsA, propsB) ? "skip" : "render");
console.log("    ...same shallowEqual, opposite phrasing, identical outcome.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHEN TO USE IT (AND WHEN NOT)
// ══════════════════════════════════════════════════════════════════
//
// ✅ GOOD FITS
//   • List rows and table cells — many instances, simple props, a parent that
//     re-renders often. The canonical case, and the same one as memo.
//   • Leaf presentational components taking primitives.
//   • Components whose parent re-renders for unrelated reasons.
//
// ❌ BAD FITS
//   • Anything receiving objects/arrays/functions built in the parent's render.
//     Every comparison fails; you pay and skip nothing. Fix the parent first.
//   • Wrappers that take `children`. → §6.
//   • Components with deeply nested props. Shallow can't see inside — either it
//     skips when it shouldn't (stale UI, if you also mutate) or never skips.
//   • Trivially cheap components. The comparison can cost more than the render.
//   • Anywhere you mutate state or props. It will freeze silently. → §5.
//
// In a NEW codebase this question is historical: you write function components
// and memo, and in React 19 the compiler does it for you. But class code is
// everywhere, and "convert this PureComponent to a function component" is a
// genuinely common interview task — which is where the inverted-return bug
// from 09 §2 bites.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "We switched to PureComponent and the UI stopped updating":
//   Mutated state or props. Same object → shallow-equal → frozen. → §5.
//
// Bug 2 — PureComponent that never skips:
//   Inline object/array/arrow props from the parent. → §4.
//
// Bug 3 — A PureComponent wrapper that never skips:
//   `children`. New element objects every render. → §6.
//
// Bug 4 — Nested prop changed, nothing rendered:
//   props.user.name changed but props.user is the same object. Shallow can't
//   see it. Pass primitives, or replace the object. → §3.
//
// Bug 5 — A dev warning about shouldComponentUpdate:
//   You defined sCU in a PureComponent. Yours wins; extend Component instead.
//   → §6.
//
// Bug 6 — Everything is a PureComponent and the app is slower:
//   Hundreds of comparisons, almost no skips. Identical to memo-everything.
//   → 01 §7.
//
// Bug 7 — Converted to a function component and it froze:
//   The sCU/comparator return value is inverted. → 09 §2.
//
// Bug 8 — A PureComponent still re-renders on theme change:
//   Context. Nothing in this family filters context. → §7.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// shallowEqual:
assert(shallowEqual({ id: 1, name: "V" }, { id: 1, name: "V" }) === true,
  "primitives compare by value → equal ✅");
assert(shallowEqual({ id: 1 }, { id: 1, extra: 0 }) === false, "a key count mismatch → different");
assert(shallowEqual({ user: SHARED_USER }, { user: SHARED_USER }) === true,
  "the same nested REFERENCE → equal");
assert(shallowEqual({ user: { id: 1 } }, { user: { id: 1 } }) === false,
  "identical nested CONTENTS, new reference → different 🐛 the whole practical problem");
assert(shallowEqual({ rows: [1, 2] }, { rows: [1, 2] }) === false, "...arrays too");

// Component vs PureComponent:
assert(rows.renders === 5, "extends Component → 5 renders for 5 identical updates 🐛");
assert(pureRows.renders === 0 && pureRows.comparisons === 5,
  "extends PureComponent → 5 comparisons, 0 renders ✅");
assert(pureWithObject.renders === 5 && pureWithObject.comparisons === 5,
  "...but with an inline object prop: 5 comparisons AND 5 renders — pure overhead 🐛");

// State:
assert(stateful.renders === 2 && vetoedSets === 3,
  "PureComponent compares STATE too — 5 setStates, 2 renders, 3 vetoed ✅");
assert(listy.renders === before,
  "a mutated state object is shallow-equal to itself → the render is vetoed 🐛");
assert(listy.state.todos.length === 2, "...while the data was already correct. Silent.");

// children:
assert(wrapper.renders === 4,
  "JSX children are new element objects → a PureComponent wrapper never skips 🐛");

// The identity:
assert(shallowEqual(propsA, propsB) === true,
  "PureComponent's comparison and memo's default comparison are the SAME function");

console.log("§10 — mini assertions passed for: PureComponent");
console.log("\n  The pair that captures it: 5 comparisons and 0 renders with stable");
console.log("  props — and 5 comparisons and 5 renders with an inline object. Same");
console.log("  component, same base class; the parent decided which one you got.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is PureComponent?", answer:
//
//   "It's React.Component with shouldComponentUpdate already implemented as a
//    shallow comparison of props AND state. If everything matches one level deep
//    with Object.is, it skips the render.
//
//    The first thing I'd flag is the name, because it's the most misleading one
//    in React. 'Pure' describes the comparison strategy, not the component. A
//    PureComponent can hold state, run side effects and be thoroughly impure —
//    it just compares props by reference.
//
//    It's the class ancestor of React.memo, and the comparison isn't merely
//    similar — it's literally the same function, React's shallowEqual. So it
//    inherits every one of memo's failure modes. If the parent passes an inline
//    object or arrow, every comparison fails and every render happens anyway;
//    you've paid for the check and skipped nothing. In my example that was five
//    comparisons and five renders. Same with `children`, since JSX children are
//    new element objects every render — a PureComponent wrapper almost never
//    skips.
//
//    The one real difference from memo is that it compares state as well as
//    props, so it can veto its own setState. Which is also its most famous bug:
//    if you mutate state and call setState(this.state), the objects are
//    identical, the comparison says equal, and the UI freezes with completely
//    correct data. A plain Component would have re-rendered and hidden the
//    mutation. So 'we switched to PureComponent and things stopped updating'
//    almost always means 'we were already mutating'. The fix is to stop
//    mutating, not to switch back.
//
//    Where I'd use it: list rows, table cells, leaves with primitive props, in a
//    parent that re-renders often. Where I wouldn't: anything taking objects
//    built in render, anything taking children, or trivially cheap components
//    where the comparison costs more than the render.
//
//    And the migration gotcha, since converting classes is a common task: sCU
//    returns true for 'render' and memo's comparator returns true for 'equal, so
//    skip'. Copying the body across without inverting it freezes the component."
//
// The name critique, the "same shallowEqual" identity, and the mutation story
// are what make this more than a two-line definition.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does PureComponent do?
// A1. Implements sCU as a shallow comparison of props and state.
//
// Q2. Does "pure" mean it's a pure function?
// A2. No. It can hold state and run side effects. It refers to the comparison.
//
// Q3. What is shallow comparison?
// A3. Object.is on each own key, one level deep. Not recursive.
//
// Q4. PureComponent vs React.memo?
// A4. Same comparison function. PureComponent is for classes and also compares
//     state; memo is for function components and compares props only.
//
// Q5. Why doesn't it re-render when a nested value changes?
// A5. The nested object's reference didn't change, and shallow can't see inside.
//
// Q6. What happens if you define sCU inside a PureComponent?
// A6. Yours wins, and React warns in development. Extend Component instead.
//
// Q7. Why is mutation especially bad here?
// A7. Prev and next are the same object, so the comparison says equal and the
//     render is skipped. Correct data, frozen UI, no warning.
//
// Q8. Were function components ever pure by default?
// A8. No. "Stateless functional components" re-rendered on every parent render.
//     memo is what gave them this behaviour, opt-in.
//
// Q9. When is PureComponent a net loss?
// A9. Unstable props, `children`, or a render cheaper than the comparison.
//
// Q10. Does it block context updates?
// A10. No. Nothing in this family does.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is PureComponent?
//   Back : Component with sCU implemented as a shallow props+state compare.
//
// Flashcard 2:
//   Front: Does "pure" mean pure function?
//   Back : No. It describes the comparison, not the component.
//
// Flashcard 3:
//   Front: PureComponent vs memo?
//   Back : Same shallowEqual. Classes vs functions; PureComponent also
//          compares state.
//
// Flashcard 4:
//   Front: Why did it stop updating after we "optimized"?
//   Back : Mutated state. Same object → equal → skipped.
//
// Flashcard 5:
//   Front: Define sCU inside a PureComponent?
//   Back : Yours wins; React warns. Extend Component instead.
//
// Flashcard 6:
//   Front: Why doesn't it skip when I pass children?
//   Back : JSX children are new element objects every render.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "The name is misleading, and it's the same shallowEqual memo uses —
//          so it fails in exactly the same places."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write shallowEqual from memory in under 12 lines, including the key-count
//   check and Object.hasOwn.
//
// Task 2:
//   Build one Component and one PureComponent side by side. Re-render the
//   parent with identical props and count renders in each.
//
// Task 3:
//   Give the PureComponent an inline object prop. Confirm it renders every
//   time. Then hoist the object and confirm it stops.
//
// Task 4:
//   Mutate an array in a PureComponent's state and call setState(this.state).
//   Watch the UI freeze while the data is correct.
//
// Task 5:
//   Wrap JSX children in a PureComponent and confirm it never skips. Explain
//   why in one sentence.
//
// Task 6:
//   Convert a PureComponent to a function component with memo. Get the
//   comparator's return value right the first time.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   PureComponent = Component + a shallow props-and-state sCU, using the exact
//   same shallowEqual that React.memo uses by default.
//
// If you remember the common bug:
//   Inline object props and `children` make it skip nothing — and mutated state
//   makes it skip everything.
//
// If you remember the professional framing:
//   The name describes the comparison, not the component. And "PureComponent
//   broke our UI" almost always means "we were already mutating".
//
// NEXT TOPIC -> 11_profiler-api.js
