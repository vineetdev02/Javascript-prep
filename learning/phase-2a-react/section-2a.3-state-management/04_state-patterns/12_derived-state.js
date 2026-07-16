// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  12_derived-state.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Derived state
//
// WHAT YOU WILL MASTER HERE:
//   1. "If you can compute it, do not store it" — and why
//   2. The desync: state that mirrors state — PROVEN
//   3. The effect-to-sync anti-pattern, and the wrong frame it renders
//   4. When to memoize derived values (and when not to)
//   5. Finding the MINIMAL state: the algorithm
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/12_derived-state.js"
//
// Prerequisites: 01_lifting-state-up.js, 03_custom-hooks/07_useprevious-hook.js
// (the derive-during-render pattern), 02_built-in-hooks/07_usememo.js.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Derived state:
// A value you can COMPUTE from existing state — so it should not be state at
// all. Compute it during render.
//
// If interviewer says "explain it simply", say:
// "If you have items and a filter, the filtered list is not state — it is a
//  function of the two. Storing it means two things that must be kept in sync,
//  and they will drift."
//
// If interviewer asks "why does it matter?", say:
// "Because every stored derived value is a desync bug waiting to happen. The
//  rule is: state should be MINIMAL. Store the smallest set from which
//  everything else can be computed, and derive the rest. The moment you have
//  a useEffect syncing one state to another, you have stored something you
//  should have computed."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   if you can compute it, do not store it
//
// The three questions React's docs suggest for any value:
//
//   1. Does it stay the same over time?      → not state. A constant.
//   2. Does it come from props?              → not state. Read the prop.
//   3. Can you compute it from other state?  → not state. DERIVE IT.
//
// Whatever survives all three IS state. Everything else is derived.
//
//   ❌ STORED (two sources of truth):
//     const [items, setItems] = useState([]);
//     const [filter, setFilter] = useState("");
//     const [visible, setVisible] = useState([]);        // 🐛 derived!
//     useEffect(() => {
//       setVisible(items.filter(i => i.includes(filter)));   // 🐛 syncing
//     }, [items, filter]);
//
//   ✅ DERIVED (one source of truth):
//     const [items, setItems] = useState([]);
//     const [filter, setFilter] = useState("");
//     const visible = items.filter(i => i.includes(filter));   // just compute it
//
// Runtime rule:
//   The render function runs on every render anyway. Computing during render
//   is FREE in the sense that you were already there. The effect version costs
//   an EXTRA render, and shows a wrong frame in between.
//
// Practical rule:
//   Derive first. Memoize only if you measured a problem.
//
// Common trap:
//   Believing a useEffect keeps them "in sync". It does not — it makes them
//   eventually consistent, with a visible wrong frame in between. → §5


// ══════════════════════════════════════════════════════════════════
// § 3 — A MINI REACT
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  const committed = [];
  const pendingEffects = [];
  let isRendering = false;
  let needsRerender = false;

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { value: initial };
    const setState = (next) => {
      const value = typeof next === "function" ? next(hooks[slot].value) : next;
      if (Object.is(value, hooks[slot].value)) return;
      hooks[slot].value = value;
      if (isRendering) { needsRerender = true; return; }
      render();
    };
    return [hooks[slot].value, setState];
  }

  function useEffect(fn, deps) {
    const slot = cursor++;
    const prev = hooks[slot];
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
    if (changed) {
      hooks[slot] = { deps };
      pendingEffects.push(fn);
    }
  }

  function useMemo(factory, deps) {
    const slot = cursor++;
    const prev = hooks[slot];
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
    if (changed) hooks[slot] = { deps, value: factory() };
    return hooks[slot].value;
  }

  function render() {
    isRendering = true;
    let output;
    do {
      needsRerender = false;
      cursor = 0;
      output = component();
    } while (needsRerender);
    isRendering = false;

    committed.push(output);                    // ← what the user SEES
    while (pendingEffects.length) pendingEffects.shift()();
    return output;
  }

  function mount(fn) { component = fn; return render(); }

  return { useState, useEffect, useMemo, mount,
    getCommitted: () => committed.slice() };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE DESYNC
// ══════════════════════════════════════════════════════════════════

console.log("§4 — storing what you could compute:\n");

const allItems = ["apple", "banana", "cherry", "avocado"];

// ❌ STORED — and someone forgets to update it
function storedDerived() {
  const R = createMiniReact();
  let setFilter, setItems;

  R.mount(() => {
    const [items, setI] = R.useState(allItems);
    const [filter, setF] = R.useState("");
    const [visible, setVisible] = R.useState(allItems);   // 🐛 derived state
    setFilter = (f) => { setF(f); setVisible(items.filter(i => i.includes(f))); };
    setItems = setI;                                       // 🐛 forgot setVisible!
    return { filter, visible: [...visible], count: visible.length };
  });

  setFilter("a");
  setItems([...allItems, "apricot"]);      // a new item arrives — visible is stale
  return R.getCommitted();
}

// ✅ DERIVED — impossible to desync
function computedDerived() {
  const R = createMiniReact();
  let setFilter, setItems;

  R.mount(() => {
    const [items, setI] = R.useState(allItems);
    const [filter, setF] = R.useState("");
    const visible = items.filter(i => i.includes(filter));   // ← just compute it
    setFilter = setF;
    setItems = setI;
    return { filter, visible: [...visible], count: visible.length };
  });

  setFilter("a");
  setItems([...allItems, "apricot"]);
  return R.getCommitted();
}

const stored = storedDerived();
const computed = computedDerived();

console.log("  filter to 'a', then a new item 'apricot' arrives:\n");
const lastStored = stored[stored.length - 1];
const lastComputed = computed[computed.length - 1];

console.log("    STORED  → filter:", JSON.stringify(lastStored.filter),
  "| visible:", JSON.stringify(lastStored.visible));
console.log("              🐛 'apricot' is missing. setItems forgot setVisible.");
console.log("\n    DERIVED → filter:", JSON.stringify(lastComputed.filter),
  "| visible:", JSON.stringify(lastComputed.visible));
console.log("              ✅ 'apricot' appeared. Nobody had to remember anything.");

console.log("\n  The stored version needs EVERY setter to also update `visible`.");
console.log("  Miss one — and there is always one — and the UI is silently");
console.log("  wrong. The derived version has nothing to forget: `visible` is a");
console.log("  function of `items` and `filter`, recomputed every render.");
console.log("\n  This is the same 'two sources of truth' bug as lifting state,");
console.log("  one level down. → 01_lifting-state-up.js §4\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE EFFECT-SYNC ANTI-PATTERN
// ══════════════════════════════════════════════════════════════════
//
// "But I DO update it — I use an effect!" That is worse, not better.

console.log("§5 — the effect renders a WRONG FRAME first:\n");

function withEffect() {
  const R = createMiniReact();
  let setFilter;
  R.mount(() => {
    const [items] = R.useState(allItems);
    const [filter, setF] = R.useState("");
    const [visible, setVisible] = R.useState(allItems);
    setFilter = setF;

    R.useEffect(() => {
      setVisible(items.filter(i => i.includes(filter)));    // 🐛 sync in an effect
    }, [items, filter]);

    return { filter, count: visible.length };
  });
  setFilter("a");
  return R.getCommitted();
}

function withDerive() {
  const R = createMiniReact();
  let setFilter;
  R.mount(() => {
    const [items] = R.useState(allItems);
    const [filter, setF] = R.useState("");
    const visible = items.filter(i => i.includes(filter));
    setFilter = setF;
    return { filter, count: visible.length };
  });
  setFilter("a");
  return R.getCommitted();
}

const effectFrames = withEffect();
const deriveFrames = withDerive();

console.log("  the user types 'a'. Frames the user actually SEES:\n");
console.log("    with useEffect sync:");
for (const f of effectFrames) {
  const wrong = f.filter === "a" && f.count === 4;
  console.log(`      filter="${f.filter}" showing ${f.count} items` +
    (wrong ? "  🐛 filtered to 'a' but showing ALL FOUR" : ""));
}
console.log("\n    computed during render:");
for (const f of deriveFrames) {
  console.log(`      filter="${f.filter}" showing ${f.count} items`);
}

console.log("\n  The effect version COMMITS a frame where the filter says 'a'");
console.log("  and the list still shows everything — then corrects it. In a");
console.log("  browser that is a visible flash of wrong data on every keystroke.");
console.log("\n  And it is strictly more work:");
console.log(`    effect version : ${effectFrames.length} commits`);
console.log(`    derived version: ${deriveFrames.length} commits`);
console.log("\n  An effect runs AFTER the commit. So the sequence is: render with");
console.log("  stale data → COMMIT → paint → effect → setState → render again →");
console.log("  commit again. Computing during render skips all of it.");
console.log("\n  React's docs are blunt about this: it is in 'You Might Not Need");
console.log("  an Effect', and the fix is always 'just calculate it during");
console.log("  rendering'. → 02_built-in-hooks/02_useeffect-dependency-array.js §8\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — WHEN TO MEMOIZE
// ══════════════════════════════════════════════════════════════════
//
// "But recomputing on every render is wasteful!" Usually it is not.

console.log("§6 — is deriving expensive?\n");

function measure(itemCount, renders) {
  const items = Array.from({ length: itemCount }, (_, i) => `item-${i}`);
  let ops = 0;
  for (let r = 0; r < renders; r++) {
    ops += items.length;                   // one filter pass per render
  }
  return ops;
}

console.log("  a filter over N items, on every render:\n");
console.log("    items   | 10 renders | verdict");
console.log("    --------|------------|---------------------------");
for (const [n, verdict] of [
  [10, "free. Do not think about it."],
  [1000, "~microseconds. Still fine."],
  [100000, "measurable. NOW consider useMemo."],
]) {
  console.log(`    ${String(n).padStart(7)} | ${String(measure(n, 10)).padStart(10)} | ${verdict}`);
}

console.log("\n  The honest rule:");
console.log("    • Deriving is FREE at normal scale. The render function was");
console.log("      going to run anyway; you are adding one array pass.");
console.log("    • useMemo has its own cost — a deps array, an Object.is per");
console.log("      dep, a retained closure, every render, forever.");
console.log("      → 02_built-in-hooks/07_usememo-when-to-use.js §6");
console.log("    • So: derive first. Memoize when you MEASURED a problem, or");
console.log("      when the derived value is an object/array that flows into");
console.log("      React.memo, deps, or context — that is job 2, and it is a");
console.log("      correctness concern, not a speed one.");

// The identity point, concretely:
const R = createMiniReact();
const identities = [];
let bump;
R.mount(() => {
  const [items] = R.useState(allItems);
  const [n, setN] = R.useState(0);
  bump = () => setN(n + 1);
  const derived = items.filter(i => i.includes("a"));          // new array each render
  const memoized = R.useMemo(() => items.filter(i => i.includes("a")), [items]);
  identities.push({ derived, memoized });
  return n;
});
bump();

console.log("\n  the identity difference:");
console.log("    plain derive → same array across renders?",
  Object.is(identities[0].derived, identities[1].derived), "← a NEW array");
console.log("    useMemo'd    → same array across renders?",
  Object.is(identities[0].memoized, identities[1].memoized), "← STABLE");
console.log("\n  Both compute the same VALUES. If you only render the array, the");
console.log("  identity is irrelevant — derive it. If you pass it to a memoized");
console.log("  child or a dep array, the identity IS the point — memoize it.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — FINDING THE MINIMAL STATE
// ══════════════════════════════════════════════════════════════════

console.log("§7 — auditing a component's state:\n");

const candidates = [
  ["items", "the source data from the server", "STATE (well — React Query)"],
  ["filter", "what the user typed", "STATE ✅"],
  ["visibleItems", "items.filter(filter)", "DERIVE"],
  ["itemCount", "items.length", "DERIVE"],
  ["hasItems", "items.length > 0", "DERIVE"],
  ["isEmpty", "!items.length", "DERIVE (and it duplicates hasItems!)"],
  ["selectedId", "what the user clicked", "STATE ✅"],
  ["selectedItem", "items.find(i => i.id === selectedId)", "DERIVE"],
  ["isSelected", "selectedId !== null", "DERIVE"],
  ["sortedItems", "[...items].sort()", "DERIVE"],
  ["pageCount", "Math.ceil(items.length / perPage)", "DERIVE"],
];

console.log("  candidate      | what it is                        | verdict");
console.log("  ---------------|-----------------------------------|------------------");
for (const [name, what, verdict] of candidates) {
  console.log(`  ${name.padEnd(14)} | ${what.padEnd(33)} | ${verdict}`);
}

const stateCount = candidates.filter(c => c[2].includes("STATE")).length;
console.log(`\n  ${candidates.length} candidates → ${stateCount} are actually state.`);
console.log("\n  Everything else is a function of those. Storing them would mean");
console.log("  9 values to keep in sync instead of 3 — and every setter would");
console.log("  need to remember all of them.");

console.log("\n  Look at `isEmpty` and `hasItems`. Storing BOTH means they can");
console.log("  contradict each other: hasItems:true AND isEmpty:true is");
console.log("  representable. That is the impossible-state problem again, and");
console.log("  deriving makes it unrepresentable.");
console.log("  → 02_built-in-hooks/06_usereducer-vs-usestate.js §4");

console.log("\n  THE ALGORITHM (React's own three questions):");
console.log("    1. Does it stay the same over time?      → a constant, not state");
console.log("    2. Does it come from props?              → read the prop");
console.log("    3. Can you compute it from other state?  → DERIVE it");
console.log("    Whatever survives is state.");
console.log("\n  The senior addition: run this AFTER moving server data out.");
console.log("  Most 'state' is a cache. → 10_react-query-usequery-usemutation.js\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE LEGITIMATE EXCEPTIONS
// ══════════════════════════════════════════════════════════════════
//
// Be honest — "never store derived state" is too absolute.
//
//   ✅ EXCEPTION 1 — a snapshot at a moment in time:
//     The invoice's total when it was SENT. That is not derived from today's
//     prices — it is a fact about the past. Store it.
//     This is the big one: if the derivation's INPUTS can change but the
//     value must NOT, it is not derived. It is a record.
//
//   ✅ EXCEPTION 2 — genuinely expensive AND hot:
//     A 100k-row aggregation on every keystroke. Memoize it — that IS
//     storing it, in a cache. But measure first.
//
//   ✅ EXCEPTION 3 — an editable draft of a derived value:
//     A form pre-filled from user.name. Once the user types, the draft is no
//     longer derived — it is its OWN state, seeded from a prop.
//     The tell: does the user's edit survive a prop change? If yes, it is
//     state. And the correct reset is key={user.id}, not an effect.
//     → 01_react-fundamentals/05_keys-in-lists.js §7
//
//   ✅ EXCEPTION 4 — the previous value, deliberately:
//     usePrevious stores the last render's value. You cannot compute the past
//     from the present. → 03_custom-hooks/07_useprevious-hook.js
//
// The unifying test:
//   Is this value a FUNCTION of current state, or a FACT about a moment?
//   A function → derive. A fact → store.

console.log("§8 — the exception that matters:\n");

const now = { price: 12, quantity: 2 };
const invoiceSentLastMonth = { total: 20, sentAt: "2026-06-01" };   // price WAS 10

console.log("  today's price:", now.price, "× quantity:", now.quantity,
  "= derived total:", now.price * now.quantity);
console.log("  the invoice we SENT last month says total:", invoiceSentLastMonth.total);
console.log("\n  If the invoice's total were DERIVED, raising your prices would");
console.log("  retroactively change every invoice you ever sent. 🐛");
console.log("\n  That total is not a function of current state — it is a FACT");
console.log("  about a moment. Store it.");
console.log("\n  The test: can the inputs change while the value must NOT?");
console.log("    Yes → it is a record. Store it.");
console.log("    No  → it is a function. Derive it.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The filtered list does not update:
//   Stored derived state, and a setter forgot to update it. → §4.
//
// Bug 2 — A visible flash of wrong data:
//   An effect syncing derived state. It commits a wrong frame first. → §5.
//
// Bug 3 — Contradictory flags:
//   hasItems && isEmpty both true. Two derived booleans stored separately.
//
// Bug 4 — Infinite loop:
//   useEffect(() => setDerived(f(x)), [derived]) — a classic.
//
// Bug 5 — The count is right and the list is wrong:
//   itemCount stored separately from items. They drifted.
//
// Bug 6 — Prices change and old invoices change with them:
//   The opposite mistake — deriving a value that should be a record. → §8.
//
// Bug 7 — useMemo on everything:
//   The memo machinery costs more than the derivation.
//   → 02_built-in-hooks/07_usememo-when-to-use.js §6
//
// Bug 8 — A form field that will not accept edits:
//   `value={derivedFromProp}` with no local state. The opposite of bug 6 —
//   you derived something that should have been a draft. → §8.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The desync:
assert(!lastStored.visible.includes("apricot"),
  "stored: the new item is MISSING — a setter forgot to update `visible` 🐛");
assert(lastStored.visible.length === 3,
  "...it is frozen at the 3 items that matched 'a' BEFORE apricot arrived");
assert(lastComputed.visible.includes("apricot"),
  "derived: the new item appeared automatically ✅");
assert(lastStored.visible.length !== lastComputed.visible.length,
  "same data, same filter, DIFFERENT results — that gap is the desync");

// The count field was stored too, and it drifted with it:
assert(lastStored.count === lastStored.visible.length,
  "at least `count` matched its own stale array...");
assert(lastComputed.count === 4,
  "...but the derived version has all 4 matches — apple, banana, avocado, apricot");

// The effect's wrong frame:
const wrongFrame = effectFrames.find(f => f.filter === "a" && f.count === 4);
assert(wrongFrame !== undefined,
  "the effect version COMMITS a frame with filter='a' showing all 4 items 🐛");
assert(!deriveFrames.some(f => f.filter === "a" && f.count === 4),
  "the derived version NEVER renders that combination ✅");
assert(effectFrames.length > deriveFrames.length,
  "and the effect version costs more commits to get to the same place");

// Memo is about IDENTITY, not values:
assert(!Object.is(identities[0].derived, identities[1].derived),
  "a plain derive returns a new array every render");
assert(Object.is(identities[0].memoized, identities[1].memoized),
  "useMemo keeps the identity stable");
assert(JSON.stringify(identities[0].derived) === JSON.stringify(identities[0].memoized),
  "...but the VALUES are identical. Memo buys identity, not correctness.");

// The audit:
assert(stateCount === 3, "11 candidate values → only 3 are real state");
assert(candidates.filter(c => c[2] === "DERIVE").length >= 7,
  "the rest are functions of those three");

console.log("§10 — mini assertions passed for: Derived state");
console.log("\n  The one that matters: the effect version commits a frame with");
console.log("  filter='a' showing all four items. The derived version cannot —");
console.log("  that combination is not representable.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is derived state / when do you store vs compute?", answer:
//
//   "If you can compute it from existing state, it isn't state. The filtered
//    list is a function of items and filter — storing it means three things
//    that must be kept in sync, and every setter has to remember to update it.
//    Miss one, and there's always one, and the UI is silently wrong.
//
//    React's docs give three questions: does it stay the same over time? does
//    it come from props? can you compute it from other state? If any is yes,
//    it's not state. In a typical component that reduces eleven candidate
//    values to about three.
//
//    The version I'd push back on hardest is the useEffect sync —
//    useEffect(() => setVisible(items.filter(f)), [items, filter]). People
//    think it keeps them in sync; it doesn't. Effects run AFTER the commit, so
//    you COMMIT a frame where the filter says 'a' and the list still shows
//    everything, then correct it. That's a visible flash of wrong data on
//    every keystroke, and it costs an extra render to get to the same place.
//    Computing during render skips all of it.
//
//    On 'recomputing every render is wasteful' — usually it isn't. The render
//    function was going to run anyway; you're adding one array pass. And
//    useMemo isn't free: a deps array and an Object.is per dep, every render,
//    forever. So derive first, memoize when you've measured — or when the
//    derived value is an object that flows into React.memo or a dep array,
//    where you're buying IDENTITY, not speed.
//
//    The exception worth naming: a value that's a FACT about a moment rather
//    than a function of now. An invoice's total when it was sent isn't derived
//    from today's prices — if it were, raising prices would retroactively
//    change every invoice you'd ever sent. The test is: can the inputs change
//    while the value must not? Then it's a record, and you store it."
//
// The wrong-frame explanation and the invoice exception are the senior markers.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is derived state?
// A1. A value computable from existing state. It should not be stored.
//
// Q2. What is wrong with storing it?
// A2. Two sources of truth. Every setter must update both, and one eventually
//     will not.
//
// Q3. Why is a useEffect sync worse, not better?
// A3. Effects run after the commit, so you render and commit the wrong data
//     first, then correct it. A visible flash, plus an extra render.
//
// Q4. Isn't recomputing every render wasteful?
// A4. Rarely. The render already runs. useMemo has its own per-render cost.
//     Measure first.
//
// Q5. When SHOULD you memoize a derived value?
// A5. When it is genuinely expensive, or when its IDENTITY flows into
//     React.memo, a dep array, or context. The second is correctness, not speed.
//
// Q6. How do you find the minimal state?
// A6. React's three questions: constant? from props? computable? Whatever
//     survives is state.
//
// Q7. What is a legitimate reason to store a derived value?
// A7. When it is a fact about a moment, not a function of now — an invoice
//     total, a snapshot. The inputs can change; the value must not.
//
// Q8. What about a form pre-filled from a prop?
// A8. Once the user edits it, it is its own state seeded from a prop. Reset it
//     with key, not an effect.
//
// Q9. How does this relate to impossible states?
// A9. Storing hasItems and isEmpty separately lets them contradict. Deriving
//     makes that unrepresentable.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is derived state?
//   Back : Computable from existing state → do not store it.
//
// Flashcard 2:
//   Front: The three questions?
//   Back : Constant? From props? Computable? → not state.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : An effect syncing derived state — it commits a wrong frame first.
//
// Flashcard 4:
//   Front: Is recomputing expensive?
//   Back : Rarely. The render runs anyway. useMemo costs something too.
//
// Flashcard 5:
//   Front: When do you memoize?
//   Back : Measured cost, or when IDENTITY flows into memo/deps/context.
//
// Flashcard 6:
//   Front: The exception?
//   Back : A fact about a moment, not a function of now. An invoice total.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Explain the wrong frame, and name the snapshot exception.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Audit a component you have written. Apply the three questions. How many
//   useStates survive?
//
// Task 2:
//   Reproduce §5's wrong frame in a real browser with a console.log in render.
//   Watch the wrong data commit.
//
// Task 3:
//   Store hasItems and isEmpty separately, then make them contradict. Now
//   derive both and try again. You cannot.
//
// Task 4:
//   Measure §6 for real with performance.now(): 100k items, 100 renders,
//   with and without useMemo. Find the crossover.
//
// Task 5:
//   Build the invoice bug: derive the total from live prices, then change a
//   price. Watch history rewrite itself.
//
// Task 6:
//   Explain in 60 seconds why an effect does not keep two states "in sync",
//   to someone who is sure it does.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   If you can compute it, do not store it. State should be minimal.
//
// If you remember the common bug:
//   An effect syncing derived state commits a wrong frame first — a visible
//   flash on every keystroke — and costs an extra render.
//
// If you remember the professional framing:
//   Derive first, memoize when measured or when identity matters. And a fact
//   about a moment is a record, not a derivation.
//
// NEXT TOPIC -> 13_immutable-state-updates.js
