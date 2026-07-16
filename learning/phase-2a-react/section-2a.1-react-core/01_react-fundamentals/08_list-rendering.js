// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  08_list-rendering.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: List rendering
//
// WHAT YOU WILL MASTER HERE:
//   1. Why .map() and not .forEach() — the actual reason
//   2. What React does with a nested array child
//   3. Render-time sort/filter bugs that mutate your props — PROVEN
//   4. Empty states, index math, and the four-state list component
//   5. When a list needs virtualization (with real numbers)
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/08_list-rendering.js"
//
// Prerequisites: 05_keys-in-lists.js (identity), 07_conditional-rendering.js
// (the empty-list && bug). This file is the mechanics around them.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// List rendering:
// You render a list by transforming data into an ARRAY of elements —
// normally with .map() — and putting that array in a JSX slot. React knows
// how to render an array of children.
//
// If interviewer says "explain it simply", say:
// "JSX takes an array of elements as a child. .map() turns data into that
//  array. There is no v-for — it is just JavaScript returning elements."
//
// If interviewer asks "why does it matter?", say:
// "Because lists are where React apps actually get slow and actually get
//  buggy: keys decide identity, render-time sorting mutates props, and a
//  10,000-row list will freeze the main thread no matter how good React is."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   data → array of elements → one JSX slot
//
// Runtime rule:
//   An array child is FLATTENED into the parent's children. React renders
//   each item, matching by key (or index if you did not give keys).
//
// Why .map() and not .forEach():
//   .map RETURNS a new array. .forEach returns undefined.
//   JSX renders the VALUE of the expression. undefined renders nothing.
//   That is the entire reason. It is not a React rule — it is what those
//   two array methods do.
//
// Practical rule:
//   Do the data work (sort/filter/group) OUTSIDE the JSX. The JSX should
//   map an already-correct array. Every render-time transform is a per-render
//   cost and a chance to mutate something you do not own.
//
// Common trap:
//   {items.forEach(...)}  → renders nothing, no error, no warning.
//   {items.sort(...)}     → MUTATES props. Sorts the caller's array.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE RENDERER
// ══════════════════════════════════════════════════════════════════

function h(type, props, ...children) {
  const { key = null, ...rest } = props || {};
  return { type, key, props: rest, children: children.flat(Infinity) };
}

function render(vnode) {
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") return "";
  if (typeof vnode === "string" || typeof vnode === "number") return String(vnode);
  if (Array.isArray(vnode)) return vnode.map(render).join("");
  return `<${vnode.type}>${vnode.children.map(render).join("")}</${vnode.type}>`;
}

const fruits = [
  { id: "f1", name: "Apple", qty: 3 },
  { id: "f2", name: "Banana", qty: 0 },
  { id: "f3", name: "Cherry", qty: 7 },
];


// ══════════════════════════════════════════════════════════════════
// § 4 — map vs forEach: THE REASON, NOT THE RULE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — why .map() and not .forEach():\n");

const mapped = fruits.map(f => h("li", { key: f.id }, f.name));
const forEached = fruits.forEach(f => h("li", { key: f.id }, f.name));

console.log("  fruits.map(...)     returns:", Array.isArray(mapped)
  ? `an array of ${mapped.length} elements` : mapped);
console.log("  fruits.forEach(...) returns:", forEached);

console.log("\n  rendered with map    :", render(h("ul", null, mapped)));
console.log("  rendered with forEach:", render(h("ul", null, forEached)));
console.log("\n  ↑ forEach returns undefined. React skips undefined. So you get");
console.log("    an empty list, NO error, and NO warning. Silent nothing.");
console.log("    This is not a React rule — it is what forEach does.\n");

// The same trap with an arrow function body:
const withBraces = fruits.map(f => { h("li", { key: f.id }, f.name); });   // no return!
const withImplicit = fruits.map(f => h("li", { key: f.id }, f.name));

console.log("  map(f => { h(...) })  → ", JSON.stringify(withBraces),
  "← braces need an explicit return");
console.log("  map(f => h(...))      →  an array of", withImplicit.length, "elements");
console.log("  A missing `return` inside braces fails exactly like forEach.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE RENDER-TIME MUTATION BUG (the good one)
// ══════════════════════════════════════════════════════════════════
//
// This one is worth the whole file. It looks like clean, functional code.
// It is neither.

console.log("§5 — {items.sort()} mutates your props:\n");

const originalOrder = fruits.map(f => f.name);
console.log("  props.items order before render:", JSON.stringify(originalOrder));

// The innocent-looking component:
function SortedListBroken(items) {
  // .sort() sorts IN PLACE and returns the SAME array reference.
  return h("ul", null, items.sort((a, b) => a.name > b.name ? -1 : 1)
    .map(f => h("li", { key: f.id }, f.name)));
}

SortedListBroken(fruits);
console.log("  props.items order AFTER render :", JSON.stringify(fruits.map(f => f.name)));
console.log("  → 🐛 The component MUTATED the array its parent owns.");
console.log("    The parent's state array is now reordered. Every other");
console.log("    component reading that array sees a different order, and");
console.log("    nobody re-rendered. This is a genuine heisenbug.\n");

// Restore for the next demo
fruits.sort((a, b) => a.id > b.id ? 1 : -1);

function SortedListFixed(items) {
  // Copy first. toSorted() (ES2023) does this natively.
  return h("ul", null, [...items].sort((a, b) => a.name > b.name ? -1 : 1)
    .map(f => h("li", { key: f.id }, f.name)));
}

const beforeFixed = fruits.map(f => f.name);
SortedListFixed(fruits);
console.log("  With [...items].sort():");
console.log("    before:", JSON.stringify(beforeFixed));
console.log("    after :", JSON.stringify(fruits.map(f => f.name)), "← untouched ✅");
console.log("\n  Mutating array methods to watch for:");
console.log("    sort, reverse, splice, push, pop, shift, unshift, fill");
console.log("  Non-mutating alternatives:");
console.log("    toSorted, toReversed, toSpliced, slice, concat, [...spread]\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — NESTED ARRAYS AND FLATTENING
// ══════════════════════════════════════════════════════════════════

console.log("§6 — React flattens nested arrays:\n");

const grouped = [
  h("li", { key: "a" }, "Apple"),
  [h("li", { key: "b" }, "Banana"), h("li", { key: "c" }, "Cherry")],   // nested
  h("li", { key: "d" }, "Date"),
];

console.log("  children:", render(h("ul", null, grouped)));
console.log("  → React flattens arbitrarily nested arrays.");
console.log("\n  BUT the keys must still be unique across the FLATTENED result,");
console.log("  not per inner array. Two inner arrays both starting at key 0 is");
console.log("  the classic duplicate-key warning from a grouped list.\n");

// Concatenating two mapped lists — a real source of duplicate keys:
const pinned = [{ id: 1, name: "Pinned" }];
const normal = [{ id: 1, name: "Normal" }];   // different list, SAME id
const collide = [
  ...pinned.map(x => h("li", { key: x.id }, x.name)),
  ...normal.map(x => h("li", { key: x.id }, x.name)),
];
const keys = collide.map(el => el.key);
console.log("  concatenating two lists with overlapping ids:");
console.log("    keys:", JSON.stringify(keys), "← duplicate! React warns.");
console.log("    fix : key={`pinned-${x.id}`} / key={`normal-${x.id}`}\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE FOUR-STATE LIST (what production actually needs)
// ══════════════════════════════════════════════════════════════════
//
// A real list component is never just a map. It is four states, and juniors
// ship one. Note the empty state — that is the && bug from file 07 waiting
// to happen.

function ProductList({ loading, error, items }) {
  if (loading) return h("div", null, "Loading…");
  if (error) return h("div", null, "Something went wrong");
  if (items.length === 0) return h("div", null, "No products yet");   // ← NOT items.length &&
  return h("ul", null, items.map(p => h("li", { key: p.id }, p.name)));
}

console.log("§7 — the four states of a real list:\n");
const scenarios = [
  ["loading", { loading: true, error: null, items: [] }],
  ["error", { loading: false, error: "500", items: [] }],
  ["empty", { loading: false, error: null, items: [] }],
  ["data", { loading: false, error: null, items: fruits }],
];
for (const [label, props] of scenarios) {
  console.log(`  ${label.padEnd(8)} → ${render(ProductList(props))}`);
}
console.log("\n  The empty state is the one that gets skipped in code review");
console.log("  and reported by a user on day one.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHEN THE LIST IS TOO BIG: VIRTUALIZATION
// ══════════════════════════════════════════════════════════════════
//
// Every list-rendering interview ends here: "what if there are 10,000 rows?"
//
// The cost is not React being slow — it is that the work is proportional to
// the DATA, not to what the user can SEE. A 1080p screen shows ~20 rows.
// Rendering 10,000 means 99.8% of the work is invisible.
//
// Virtualization (react-window / react-virtuoso / TanStack Virtual):
//   render only the visible slice + a small overscan buffer, and fake the
//   scrollbar with a spacer of the full height.

console.log("§8 — virtualization, with numbers:\n");

function visibleSlice(totalRows, { rowHeight = 40, viewportHeight = 800, scrollTop = 0, overscan = 3 }) {
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const last = Math.min(totalRows - 1, first + visibleCount);
  return { first, last, rendered: last - first + 1 };
}

for (const total of [100, 1000, 10000]) {
  const { rendered } = visibleSlice(total, { scrollTop: 0 });
  const saved = (100 - (rendered / total) * 100).toFixed(1);
  console.log(`  ${String(total).padStart(5)} rows → render ${String(rendered).padStart(3)}` +
    `  (${saved}% of the DOM never created)`);
}

const scrolled = visibleSlice(10000, { scrollTop: 4000 });
console.log(`\n  scrolled to 4000px in a 10k list → rows ${scrolled.first}–${scrolled.last}`);
console.log("  Constant work regardless of list size. That is the point:");
console.log("  cost follows the VIEWPORT, not the data.\n");
console.log("  Cheaper things to try FIRST (do not reach for virtualization");
console.log("  by default — it costs you Ctrl+F, a11y, and print):");
console.log("    • paginate, or infinite-scroll in pages");
console.log("    • memo the row component (→ React.memo)");
console.log("    • move filtering/sorting out of render (→ useMemo)");
console.log("    • content-visibility: auto — one CSS line, browser-native\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version              Real React
//   ───────────              ──────────
//   children.flat(Infinity)  flattening happens in the reconciler while
//                            building the child fiber chain
//   no warnings              dev warns on missing keys ("Each child in a
//                            list should have a unique key") and on
//                            duplicate keys — both only in dev builds
//   arrays only              also accepts any ITERABLE — a Set, a Map's
//                            values(), a generator. Rare but real.
//   n/a                      React.Children.toArray() flattens AND assigns
//                            prefixed keys, used by library authors
//
// One detail worth quoting:
//   The missing-key warning is dev-only and non-fatal, which is exactly why
//   key bugs reach production. The list LOOKS right — only the state lands
//   on the wrong row. → 05_keys-in-lists.js


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The list renders nothing, no error:
//   .forEach instead of .map, or braces without a return. → §4.
//
// Bug 2 — Props mutated by a render-time .sort():
//   The parent's array is reordered behind its back. → §5. Nasty because
//   the symptom appears in a DIFFERENT component.
//
// Bug 3 — A literal "0" instead of an empty state:
//   {items.length && <List/>}. → 07_conditional-rendering-patterns.js.
//
// Bug 4 — Duplicate keys from concatenated lists:
//   Two sources with overlapping ids. → §6. Prefix them.
//
// Bug 5 — Checkbox state on the wrong row after a delete:
//   key={index}. → 05_keys-in-lists.js.
//
// Bug 6 — The whole list re-renders on every keystroke:
//   An inline arrow in the row's onClick creates a new function each render,
//   so React.memo on the row never helps. → useCallback.
//
// Bug 7 — Filtering in render on every keystroke:
//   items.filter(...) over 10k rows, per keystroke, on the main thread.
//   → useMemo, or useDeferredValue for the list itself.
//
// Bug 8 — The page freezes on a 10k-row table:
//   No amount of React tuning fixes this. The DOM is the bottleneck.
//   → §8, virtualize.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// map vs forEach:
assert(Array.isArray(mapped), "map returns an array of elements");
assert(forEached === undefined, "forEach returns undefined");
assert(render(h("ul", null, forEached)) === "<ul></ul>",
  "so forEach renders an EMPTY list — silently, with no warning");
assert(withBraces.every(x => x === undefined),
  "braces without a return produce undefined, exactly like forEach");

// The mutation bug, asserted:
const probe = [{ id: 1, name: "B" }, { id: 2, name: "A" }];
const probeRef = probe;
const sortedInPlace = probe.sort((a, b) => a.name > b.name ? 1 : -1);
assert(sortedInPlace === probeRef, ".sort() returns the SAME reference — it mutates");
assert(probe[0].name === "A", "the caller's array was reordered by the component");

const safe = [{ id: 1, name: "B" }, { id: 2, name: "A" }];
const safeCopy = [...safe].sort((a, b) => a.name > b.name ? 1 : -1);
assert(safeCopy !== safe, "[...arr].sort() returns a NEW array");
assert(safe[0].name === "B", "the original is untouched");

// Flattening and keys:
assert(render(h("ul", null, grouped)).includes("Banana"), "nested arrays are flattened");
assert(new Set(keys).size !== keys.length, "concatenated lists can collide on keys");

// The four states:
assert(render(ProductList({ loading: true, error: null, items: [] })) === "<div>Loading…</div>",
  "loading state");
assert(render(ProductList({ loading: false, error: null, items: [] })) === "<div>No products yet</div>",
  "empty state renders a message, NOT a literal 0");

// Virtualization math:
const big = visibleSlice(10000, { scrollTop: 0 });
const small = visibleSlice(100, { scrollTop: 0 });
assert(big.rendered === small.rendered,
  "virtualized work is CONSTANT — 10,000 rows costs the same as 100");
assert(big.rendered < 30, "a 10k list renders under 30 rows at a time");

console.log("§11 — mini assertions passed for: List rendering");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you render a list?", answer like this:
//
//   "I map data to an array of elements and drop that array in a JSX slot —
//    React flattens it and renders each child. It has to be .map and not
//    .forEach for a plain JavaScript reason: map returns an array, forEach
//    returns undefined, and React skips undefined. So forEach gives you an
//    empty list with no error at all.
//
//    Each item needs a key from the DATA, not the index, or state lands on
//    the wrong row after a reorder.
//
//    Two things I watch for in review. First, render-time .sort() or
//    .reverse() — those mutate in place, so a component silently reorders
//    the array its PARENT owns, and the bug surfaces somewhere else entirely.
//    I use [...items].sort() or toSorted(). Second, the empty state: a real
//    list is four states — loading, error, empty, data — and {items.length &&
//    <List/>} renders a literal 0 for the empty one.
//
//    At scale the answer changes. Ten thousand rows freezes the main thread
//    because the work tracks the data, not the viewport. I'd memo rows and
//    move filtering out of render first, then virtualize with react-window —
//    render the visible slice plus overscan and spacer the scrollbar. That
//    makes the cost constant, at the price of Ctrl+F and some a11y."
//
// The mutation point is what makes this senior. Almost nobody raises it.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why .map() and not .forEach()?
// A1. map returns an array; forEach returns undefined; React renders the
//     expression's value and skips undefined. Pure JavaScript, not a React rule.
//
// Q2. What is wrong with {items.sort(...)} in JSX?
// A2. sort mutates in place, so you reorder the parent's array from inside a
//     child, with no re-render. Copy first: [...items].sort() or toSorted().
//
// Q3. Does React handle nested arrays?
// A3. Yes, it flattens them — and any iterable. Keys must be unique across
//     the flattened result, which is how concatenated lists collide.
//
// Q4. How do you render 10,000 rows?
// A4. You do not. Virtualize: render the visible window + overscan, spacer
//     for scroll height. Cost becomes constant. Try memo/pagination first.
//
// Q5. Why is the missing-key warning dev-only?
// A5. It is a correctness hint, not a crash — the list still renders. That is
//     precisely why key bugs reach production looking fine.
//
// Q6. Where should filtering and sorting live?
// A6. Outside render, or in useMemo. Doing it in JSX means recomputing over
//     the whole dataset on every render, including unrelated ones.
//
// Q7. Is index ever a valid key?
// A7. Only for static, append-only, stateless lists. → 05_keys-in-lists.js
//
// Q8. What is the downside of virtualization?
// A8. Ctrl+F stops finding off-screen rows, screen readers see a partial list,
//     print breaks, and anchor links to hidden rows fail. It is a trade, not
//     a free win.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Why .map() and not .forEach()?
//   Back : map returns an array; forEach returns undefined; React skips undefined.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : An array child is flattened and rendered, matched by key.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : {items.sort()} in JSX — it mutates the parent's array.
//
// Flashcard 4:
//   Front: How many states does a real list have?
//   Back : Four — loading, error, empty, data.
//
// Flashcard 5:
//   Front: How do you render 10k rows?
//   Back : Virtualize — visible slice + overscan + spacer. Constant cost.
//
// Flashcard 6:
//   Front: How do you sound senior?
//   Back : Raise the render-time mutation bug, and name virtualization's cost.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rewrite §5's SortedListBroken using .reverse(). Confirm it mutates too.
//   Then list every mutating array method from memory.
//
// Task 2:
//   Add a dev warning to render(): if an array child has an element without
//   a key, log React's exact warning text. Three lines.
//
// Task 3:
//   Add duplicate-key detection across the FLATTENED children in §6.
//
// Task 4:
//   Extend visibleSlice into a real windowing calculator: return the spacer
//   heights above and below the rendered slice. That is react-window's core.
//
// Task 5:
//   Break §7: change the empty check to {items.length && ...} and watch the
//   0 appear. Two files, one bug, now connected.
//
// Task 6:
//   Explain in 60 seconds why a component that sorts its props is a bug,
//   even though the sorted output looks perfect.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Data → array of elements → one JSX slot. map returns; forEach does not.
//
// If you remember the common bug:
//   {items.sort()} in render mutates the parent's array. Copy first.
//
// If you remember the professional framing:
//   A real list is four states, keyed by data identity, with the data work
//   done outside render — and at scale, cost must follow the viewport, not
//   the dataset.
//
// NEXT TOPIC -> 09_component-types-class-vs-func.js
