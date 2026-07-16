// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  13_immutable-state-updates.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Immutable state updates
//
// WHAT YOU WILL MASTER HERE:
//   1. WHY React demands it — Object.is, and nothing else
//   2. The shallow-copy trap: spread is ONE level deep — PROVEN
//   3. Every array recipe: add, remove, update, insert, sort, reorder
//   4. Nested updates, and why they are genuinely awful to write
//   5. Structural sharing: immutability is also a PERFORMANCE feature
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/13_immutable-state-updates.js"
//
// Prerequisites: 05_redux-actions-reducers-store.js §5 (the mutation bug).
// This file is the mechanics. The next one is the tool that hides them.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Immutable updates:
// Never modify state in place — always produce a NEW object, so React can
// detect the change by comparing references.
//
// If interviewer says "explain it simply", say:
// "React compares old and new state with Object.is. If you mutate, the
//  reference is the same, so React sees no change and skips the render. You
//  must hand it a new object."
//
// If interviewer asks "why does it matter?", say:
// "Because it is not a style rule — it is the entire change-detection
//  mechanism. A deep comparison of a large state tree on every render would
//  be far too slow, so React compares references, which is O(1). Immutability
//  is the price of that O(1). And it buys structural sharing, which is what
//  makes memoization work at all."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   React compares REFERENCES, not contents
//
// The whole reason, in one line:
//
//   if (Object.is(oldState, newState)) return;   // ← React skips the render
//
// That is O(1). A deep comparison would be O(n) over your entire state tree,
// on every render, for every component. Unusable. So React trades: you promise
// never to mutate, and React gets to compare references.
//
// Runtime rule:
//   The spread operator is a SHALLOW copy. { ...state } copies the top level
//   and SHARES every nested object by reference. Mutating state.user.name
//   after spreading state still mutates the ORIGINAL user.
//
// Practical rule:
//   You must create a new object at EVERY LEVEL you change — from the root
//   down to the thing you touched. Everything else can be shared.
//
// Common trap:
//   `const copy = { ...state }; copy.user.name = "x";` — you copied the box
//   and edited the thing inside it, which was never copied.


// ══════════════════════════════════════════════════════════════════
// § 3 — WHY: Object.is IS THE WHOLE REASON
// ══════════════════════════════════════════════════════════════════

console.log("§3 — mutation is invisible to React:\n");

// React's actual check, in full:
function reactWillRerender(prev, next) {
  return !Object.is(prev, next);
}

const state = { count: 0, user: { name: "Vineet" } };

// ❌ MUTATE
const mutated = state;
mutated.count = 1;
console.log("  state.count = 1  (mutation)");
console.log("    the value changed?", state.count === 1);
console.log("    React re-renders?", reactWillRerender(state, mutated), "🐛 NO");
console.log("    → correct data, dead UI, no error, no warning.");

// ✅ COPY
const copied = { ...state, count: 2 };
console.log("\n  { ...state, count: 2 }  (a new object)");
console.log("    React re-renders?", reactWillRerender(state, copied), "✅ YES");

console.log("\n  WHY React does not just deep-compare:");
const bigState = { items: Array.from({ length: 10000 }, (_, i) => ({ id: i, name: `item-${i}` })) };
let deepComparisons = 0;
function deepEqual(a, b) {
  deepComparisons++;
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(k => deepEqual(a[k], b[k]));
}
// Note: comparing against { ...bigState } would short-circuit immediately —
// the spread SHARES the items array, so Object.is says equal at depth 1. To
// see the real traversal cost we need a genuinely deep copy, which is exactly
// what structuredClone gives you (and exactly why it is the wrong tool → §8).
deepComparisons = 0;
deepEqual(bigState, structuredClone(bigState));
const deepCloneComparisons = deepComparisons;      // capture — reused below
console.log("    deep-comparing a 10,000-item state:", deepCloneComparisons, "comparisons");
console.log("    Object.is on the same state:        1 comparison");

// And the shallow-spread case, to make the point twice:
deepComparisons = 0;
deepEqual(bigState, { ...bigState });
const spreadComparisons = deepComparisons;
console.log("\n    ...but deep-comparing a SPREAD copy:", spreadComparisons, "comparisons");
console.log("    because the spread SHARES the items array, so the deep compare");
console.log("    short-circuits on a reference check. Structural sharing is what");
console.log("    makes even deep equality cheap — when you have it. → §7");
console.log("\n  That is the trade. React does ONE reference check per state,");
console.log("  per render, for every component in your app. Deep equality would");
console.log("  be tens of thousands of comparisons — for a check that runs on");
console.log("  every single render. Immutability is the price of O(1).\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE SHALLOW-COPY TRAP
// ══════════════════════════════════════════════════════════════════

console.log("§4 — spread copies ONE level:\n");

const original = {
  name: "Vineet",
  address: { city: "Delhi", zip: "110001" },
  tags: ["react", "js"],
};

// ❌ THE TRAP
const shallow = { ...original };
shallow.address.city = "Mumbai";        // 🐛 mutates the ORIGINAL's address
shallow.tags.push("node");              // 🐛 mutates the ORIGINAL's array

console.log("  const copy = { ...original };");
console.log("  copy.address.city = 'Mumbai';");
console.log("  copy.tags.push('node');\n");
console.log("    original.address.city:", JSON.stringify(original.address.city),
  "🐛 CHANGED");
console.log("    original.tags        :", JSON.stringify(original.tags), "🐛 CHANGED");
console.log("    same address object? ", Object.is(original.address, shallow.address));

console.log("\n  The spread copied the OUTER box. `address` and `tags` are");
console.log("  references, and it copied the REFERENCES — so both objects point");
console.log("  at the same nested data. You copied the box and edited the thing");
console.log("  inside it, which was never copied.");

// ✅ THE FIX — copy every level you touch
const fresh = {
  name: "Vineet",
  address: { city: "Delhi", zip: "110001" },
  tags: ["react", "js"],
};
const correct = {
  ...fresh,                                        // new root
  address: { ...fresh.address, city: "Mumbai" },   // new address
  tags: [...fresh.tags, "node"],                   // new array
};

console.log("\n  the correct version:");
console.log("    original.address.city:", JSON.stringify(fresh.address.city),
  "✅ untouched");
console.log("    copy.address.city    :", JSON.stringify(correct.address.city));
console.log("    same address object? ", Object.is(fresh.address, correct.address),
  "← a NEW object at every level you changed");
console.log("    same `name` value?   ", Object.is(fresh.name, correct.name),
  "← unchanged branches are SHARED. That is structural sharing. → §7\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — EVERY ARRAY RECIPE
// ══════════════════════════════════════════════════════════════════
//
// The table worth memorizing. The left column MUTATES; the right does not.
//
//   MUTATING ❌            NON-MUTATING ✅
//   ──────────            ───────────────
//   push(x)               [...arr, x]              or arr.concat(x)
//   unshift(x)            [x, ...arr]
//   pop()                 arr.slice(0, -1)
//   shift()               arr.slice(1)
//   splice(i, 1)          arr.filter((_, idx) => idx !== i)
//   arr[i] = x            arr.map((v, idx) => idx === i ? x : v)
//   sort()                [...arr].sort()          or arr.toSorted()  (ES2023)
//   reverse()             [...arr].reverse()       or arr.toReversed()
//   splice(i, 0, x)       [...arr.slice(0,i), x, ...arr.slice(i)]  or toSpliced()
//   fill(x)               arr.map(() => x)
//
// The ES2023 methods — toSorted, toReversed, toSpliced, with — exist
// precisely because sort/reverse/splice mutating was a constant source of
// this bug. `arr.with(i, x)` is the immutable `arr[i] = x`.

console.log("§5 — the recipes:\n");

const nums = [3, 1, 2];
const todos = [
  { id: 1, text: "Learn", done: false },
  { id: 2, text: "Build", done: false },
];

const recipes = [
  ["add to end", () => [...nums, 4], nums],
  ["add to front", () => [4, ...nums], nums],
  ["remove by index", () => nums.filter((_, i) => i !== 1), nums],
  ["remove by id", () => todos.filter(t => t.id !== 1), todos],
  ["update by index", () => nums.map((v, i) => (i === 0 ? 99 : v)), nums],
  ["insert at index", () => [...nums.slice(0, 1), 99, ...nums.slice(1)], nums],
  ["sort", () => [...nums].sort((a, b) => a - b), nums],
  ["reverse", () => [...nums].reverse(), nums],
];

console.log("  operation        | result          | original mutated?");
console.log("  -----------------|-----------------|------------------");
for (const [name, fn, source] of recipes) {
  const before = JSON.stringify(source);
  const result = fn();
  const after = JSON.stringify(source);
  console.log(`  ${name.padEnd(16)} | ${JSON.stringify(result).padEnd(15)} | ` +
    `${before === after ? "no ✅" : "YES 🐛"}`);
}

// The update-an-object-in-an-array case — the one people get wrong:
console.log("\n  the one people get wrong — toggling one todo:\n");

// ❌ maps but MUTATES the matched object
const badToggle = todos.map(t => {
  if (t.id === 1) t.done = true;          // 🐛 mutates the ORIGINAL todo
  return t;
});
console.log("    todos.map(t => { if (t.id===1) t.done = true; return t; })");
console.log("      new array?     ", !Object.is(todos, badToggle), "← map always makes one");
console.log("      original todo mutated?", todos[0].done === true, "🐛");
console.log("      same todo object?", Object.is(todos[0], badToggle[0]),
  "← React.memo on that row will NOT re-render it");

// ✅ new array AND a new object for the one that changed
todos[0].done = false;                    // reset for the demo
const goodToggle = todos.map(t =>
  t.id === 1 ? { ...t, done: true } : t   // ← new object ONLY for the match
);
console.log("\n    todos.map(t => t.id===1 ? { ...t, done: true } : t)");
console.log("      original todo mutated?", todos[0].done === true, "✅ no");
console.log("      changed todo: new object?", !Object.is(todos[0], goodToggle[0]), "✅");
console.log("      UNCHANGED todo: same object?", Object.is(todos[1], goodToggle[1]),
  "✅ shared — so its memoized row does NOT re-render");
console.log("\n  Read the last two lines together. That is structural sharing:");
console.log("  a new object for what changed, the SAME object for what did not.");
console.log("  → §7\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — NESTED UPDATES ARE GENUINELY AWFUL
// ══════════════════════════════════════════════════════════════════

console.log("§6 — why the next file exists:\n");

const appState = {
  user: {
    profile: {
      settings: {
        notifications: { email: true, push: false, sms: false },
      },
    },
  },
};

// Turn ON push notifications. Immutably. By hand.
const updated = {
  ...appState,
  user: {
    ...appState.user,
    profile: {
      ...appState.user.profile,
      settings: {
        ...appState.user.profile.settings,
        notifications: {
          ...appState.user.profile.settings.notifications,
          push: true,                                    // ← the actual change
        },
      },
    },
  },
};

console.log("  to change ONE boolean five levels deep:\n");
console.log("    {");
console.log("      ...state,");
console.log("      user: { ...state.user,");
console.log("        profile: { ...state.user.profile,");
console.log("          settings: { ...state.user.profile.settings,");
console.log("            notifications: { ...state.user.profile.settings.notifications,");
console.log("              push: true } } } }              ← the actual change");
console.log("    }");
console.log("\n    spreads written: 5");
console.log("    lines of code   : 10");
console.log("    real changes    : 1");
console.log("    original mutated?", appState.user.profile.settings.notifications.push === true
  ? "YES 🐛" : "no ✅");

console.log("\n  This is correct, and it is horrible. Miss ONE spread and you");
console.log("  silently mutate a nested object — the bug from §4, buried five");
console.log("  levels down where nobody will find it.");
console.log("\n  Two honest reactions:");
console.log("    1. Use Immer. `draft.user.profile.settings.notifications.push =");
console.log("       true` does exactly this, safely. → 14_immer-library.js");
console.log("    2. Ask why your state is five levels deep. Deeply nested state");
console.log("       is usually a NORMALIZATION problem. Flatten it:");
console.log("         { notifications: { email: true, push: false } }");
console.log("       and the spread is one level. Redux's docs recommend");
console.log("       normalizing precisely to avoid this.");
console.log("\n  Immer fixes the symptom. Normalizing fixes the cause. A senior");
console.log("  answer mentions both.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — STRUCTURAL SHARING IS A FEATURE
// ══════════════════════════════════════════════════════════════════

console.log("§7 — immutability is also a PERFORMANCE feature:\n");

const bigList = {
  todos: Array.from({ length: 5 }, (_, i) => ({ id: i, text: `todo ${i}`, done: false })),
  filter: "all",
  user: { name: "Vineet" },
};

// Update ONE todo, immutably:
const next = {
  ...bigList,
  todos: bigList.todos.map(t => (t.id === 2 ? { ...t, done: true } : t)),
};

// Which references survived?
const survived = bigList.todos.filter((t, i) => Object.is(t, next.todos[i])).length;

console.log("  5 todos. Toggle #2. Which object references are SHARED?\n");
console.log("    root object shared? ", Object.is(bigList, next), "← changed, as it must");
console.log("    todos array shared? ", Object.is(bigList.todos, next.todos), "← changed");
console.log("    user object shared? ", Object.is(bigList.user, next.user), "← ✅ SHARED");
console.log(`    unchanged todos shared? ${survived} of 5 kept their identity ✅`);

console.log("\n  Only the path from the root to the change got new objects:");
console.log("    root → todos → todo#2");
console.log("  Everything else is the SAME object in memory.");

console.log("\n  Why that matters — it is not about saving memory:");
console.log("    • <TodoRow> is React.memo'd. Rows 0,1,3,4 got the SAME object,");
console.log("      so Object.is says 'unchanged' and they do NOT re-render.");
console.log("    • useSelector(s => s.user) sees the same reference → no render.");
console.log("    • a useEffect with [state.user] does not fire.");
console.log("\n  So immutability is not just how React DETECTS changes — it is");
console.log("  how React SKIPS work. Mutating would break both: no detection AND");
console.log("  no sharing, because there is only ever one object.");
console.log("\n  That is the senior framing. People present immutability as a");
console.log("  tax. It is the thing that makes memoization possible at all.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL CODEBASES DO DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   By hand                   Production
//   ───────                   ──────────
//   spread chains             Immer (bundled in RTK) — write `draft.x.y = z`,
//                             get the spread chain generated → file 14
//   n/a                       ES2023: toSorted, toReversed, toSpliced, with.
//                             `arr.with(i, x)` is the immutable `arr[i] = x`,
//                             and it exists because this bug was everywhere.
//   deep nesting              NORMALIZED state: { byId: {}, allIds: [] }.
//                             createEntityAdapter in RTK does this for you,
//                             and it makes most updates one level deep.
//   n/a                       structuredClone() for a genuine deep copy —
//                             but note that is the WRONG tool for state
//                             updates: it copies EVERYTHING, so you lose
//                             structural sharing and every memo breaks.
//   n/a                       Object.freeze in dev to catch mutation loudly;
//                             RTK's immutability middleware does this
//
// The structuredClone point is worth raising: people reach for it thinking
// "deep copy = safe immutable update". It is safe and it destroys structural
// sharing — every child gets a new reference, so every memoized component
// re-renders. Correct and slow is still wrong.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The data is right and the UI does not update:
//   Mutation. Same reference → Object.is → skip. → §3. THE bug.
//
// Bug 2 — Editing a copy changed the original:
//   Spread is shallow. → §4.
//
// Bug 3 — A component sorts its props:
//   items.sort() mutates the parent's array. → 08_list-rendering.js §5.
//
// Bug 4 — map() but mutating the item:
//   New array, same objects. Memoized rows do not update. → §5.
//
// Bug 5 — A missed spread five levels down:
//   Correct at the top, mutating underneath. → §6.
//
// Bug 6 — structuredClone for every update:
//   Correct, and every memo in the subtree now re-renders. → §8.
//
// Bug 7 — A mutating reducer:
//   → 05_redux-actions-reducers-store.js §5.
//
// Bug 8 — Mutating state.items directly and calling setState(state):
//   Same reference. Nothing happens. Then you add a spread at the top and it
//   "works" — but the nested mutation already happened.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// Object.is is the whole reason:
assert(reactWillRerender(state, mutated) === false,
  "mutation → same reference → React skips the render 🐛");
assert(reactWillRerender(state, copied) === true, "a new object → React renders ✅");
assert(deepCloneComparisons > 10000,
  "a deep compare of 10k items is tens of thousands of checks — per render");
assert(spreadComparisons === 2,
  "...while the same compare against a SPREAD copy short-circuits in 2 — " +
  "structural sharing is what makes it cheap");

// The shallow trap:
assert(original.address.city === "Mumbai",
  "spread is SHALLOW — editing copy.address changed the ORIGINAL 🐛");
assert(original.tags.includes("node"), "...and push on a spread array too");
assert(Object.is(original.address, shallow.address),
  "because the spread copied the REFERENCE, not the object");

// The fix:
assert(fresh.address.city === "Delhi", "copying every level leaves the original alone ✅");
assert(!Object.is(fresh.address, correct.address), "a new object at each changed level");

// The map-but-mutate trap:
assert(!Object.is(todos, badToggle), "map ALWAYS returns a new array...");
assert(Object.is(todos[0], badToggle[0]),
  "...but the ITEM is the same object — so a memoized row never re-renders 🐛");
assert(!Object.is(todos[0], goodToggle[0]),
  "the correct version gives the changed item a new object ✅");
assert(Object.is(todos[1], goodToggle[1]),
  "...and shares the UNCHANGED one — structural sharing");

// Nested:
assert(appState.user.profile.settings.notifications.push === false,
  "the 5-level spread chain left the original untouched");
assert(updated.user.profile.settings.notifications.push === true, "...and applied the change");
assert(!Object.is(appState.user, updated.user), "every level on the PATH is new");

// Structural sharing — the payoff:
assert(Object.is(bigList.user, next.user),
  "an untouched branch keeps its reference → its memoized components skip");
assert(survived === 4, "4 of 5 todos kept their identity — only #2 got a new object");
assert(!Object.is(bigList.todos, next.todos), "...while the array itself is new");

console.log("§10 — mini assertions passed for: Immutable state updates");
console.log("\n  The pair that captures it: `Object.is(todos[1], goodToggle[1])`");
console.log("  is TRUE — the unchanged todo is the same object, so its memoized");
console.log("  row skips. Immutability is what makes that possible.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "why does React need immutable updates?", answer:
//
//   "Because React detects changes with Object.is — a reference comparison.
//    If you mutate, the reference is identical, so React concludes nothing
//    changed and skips the render. The data is correct and the UI is dead, with
//    no error and no warning.
//
//    And it's not arbitrary. A deep comparison of a large state tree would be
//    tens of thousands of checks, on every render, for every component. That's
//    unusable. So React trades: you promise not to mutate, and React gets an
//    O(1) check.
//
//    The trap is that spread is SHALLOW. { ...state } copies the top level and
//    copies the REFERENCES of everything nested — so copy.address.city = 'x'
//    mutates the original's address. You have to create a new object at every
//    level from the root down to what you changed.
//
//    The one people get wrong most is map with a mutation:
//    todos.map(t => { if (t.id === 1) t.done = true; return t }). map always
//    returns a new array, so the top-level check passes and it looks fine — but
//    the ITEM is the same object, so a memoized row never re-renders. You need
//    t.id === 1 ? { ...t, done: true } : t.
//
//    The framing I'd add: immutability isn't a tax, it's what makes
//    memoization possible. Toggle one todo in a list of five and only the path
//    from root to that todo gets new objects — the other four keep their
//    identity, so their memoized rows skip. That's structural sharing. Mutating
//    would break detection AND sharing, because there'd only ever be one object.
//    It's also why structuredClone is the wrong tool: it's a correct deep copy
//    that gives everything a new reference, so every memo in the subtree fires.
//
//    For deeply nested state, the honest answer is two things: use Immer, which
//    generates the spread chain from draft.a.b.c = x — and ask why the state is
//    five levels deep, because that's usually a normalization problem. Immer
//    fixes the symptom; flattening fixes the cause."
//
// Structural sharing as a FEATURE, and the structuredClone point, are what
// make this senior.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why does React require immutability?
// A1. It detects changes with Object.is on references. Mutation keeps the
//     reference, so React sees nothing.
//
// Q2. Why not deep-compare?
// A2. O(n) over the whole state, on every render, for every component. Object.is
//     is O(1). Immutability is the price of that.
//
// Q3. What is wrong with { ...state }?
// A3. Nothing — but it is SHALLOW. Nested objects are shared by reference, so
//     editing them mutates the original.
//
// Q4. What is the map-but-mutate bug?
// A4. map returns a new array so the top check passes, but the item is the same
//     object, so memoized children never update.
//
// Q5. What is structural sharing?
// A5. Only the path from root to the change gets new objects. Untouched
//     branches keep their identity, so their memoized components skip.
//
// Q6. Why not structuredClone?
// A6. It is a correct deep copy that destroys structural sharing — everything
//     gets a new reference, so every memo re-renders.
//
// Q7. How do you handle deeply nested state?
// A7. Immer for the syntax, and normalization for the real fix. Five levels of
//     nesting is usually a modelling problem.
//
// Q8. Which array methods mutate?
// A8. push, pop, shift, unshift, splice, sort, reverse, fill. ES2023 added
//     toSorted, toReversed, toSpliced, and with as the immutable versions.
//
// Q9. Is immutability just overhead?
// A9. No — it is what makes memoization work. Without it there is nothing to
//     compare and nothing to share.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Why immutable updates?
//   Back : React compares REFERENCES with Object.is. Mutation is invisible.
//
// Flashcard 2:
//   Front: Why not deep equality?
//   Back : O(n) per render per component. Object.is is O(1).
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Spread is SHALLOW. Nested objects are shared.
//
// Flashcard 4:
//   Front: The map-but-mutate bug?
//   Back : New array, same items → memoized rows never update.
//
// Flashcard 5:
//   Front: What is structural sharing?
//   Back : Only the path to the change is new. Untouched branches are shared.
//
// Flashcard 6:
//   Front: Why not structuredClone?
//   Back : It destroys structural sharing. Every memo re-renders.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Immutability ENABLES memoization. And deep nesting is a
//          normalization problem.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the mutating/non-mutating table from memory. All ten rows.
//
// Task 2:
//   Reproduce §4's trap, then fix it. Then do it three levels deep and feel §6.
//
// Task 3:
//   Write the map-but-mutate bug and add a memoized row component. Watch the
//   row never update while the data is correct.
//
// Task 4:
//   Measure §7: 1000 todos, toggle one, count how many kept their reference.
//   That number is how many memoized rows you saved.
//
// Task 5:
//   Replace an update with structuredClone. Count how many references
//   survived. (Zero.) Now you know why it is the wrong tool.
//
// Task 6:
//   Explain in 60 seconds why the array updated but the row did not
//   re-render, to someone staring at correct data.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   React compares references, not contents. Mutation is invisible to it.
//
// If you remember the common bug:
//   Spread is shallow. And map-but-mutate gives you a new array of the SAME
//   objects — so memoized children never update.
//
// If you remember the professional framing:
//   Immutability is not a tax — structural sharing is what makes memoization
//   possible. And deep nesting is a normalization problem, not an Immer problem.
//
// NEXT TOPIC -> 14_immer-library.js
