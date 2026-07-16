// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  09_jotai-recoil-atoms.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Jotai / Recoil (atoms)
//
// WHAT YOU WILL MASTER HERE:
//   1. Bottom-up vs top-down: the actual distinction
//   2. Derived atoms — a dependency GRAPH, not a selector
//   3. Why atoms need no selectors (the atom IS the selector)
//   4. Automatic dependency tracking, demonstrated
//   5. Jotai vs Recoil vs Zustand — and why Recoil is dead
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/09_jotai-recoil-atoms.js"
//
// Prerequisite: 08_zustand-basics.js — atoms are the OTHER answer to the same
// problem, and the comparison is the interview.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Atoms:
// State split into many tiny independent units, which you COMPOSE into
// derived values — instead of one big store you SELECT slices from.
//
// If interviewer says "explain it simply", say:
// "An atom is a piece of state you can put in a variable. A component uses
//  the atoms it needs. A derived atom reads other atoms and recomputes when
//  they change — like a spreadsheet cell with a formula."
//
// If interviewer asks "why does it matter?", say:
// "It inverts the model. Redux and Zustand are top-down — one store, and you
//  select down into it. Jotai is bottom-up — many atoms, and you compose up.
//  The payoff is that there are no selectors: the atom IS the subscription
//  unit, so re-render precision is automatic rather than something you have
//  to get right."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   useState you can put in a variable
//
// That is the honest one-liner for Jotai. Compare:
//
//   const [count, setCount] = useState(0);          // trapped in a component
//   const countAtom = atom(0);                       // a module-level variable
//   const [count, setCount] = useAtom(countAtom);    // usable anywhere
//
// TOP-DOWN (Redux, Zustand):
//
//   store = { user, cart, filters, ui }
//              ↓ select
//   const name = useStore(s => s.user.name);
//
//   You start with everything and narrow. The selector is YOUR job to get
//   right — get it wrong and you re-render on unrelated changes.
//
// BOTTOM-UP (Jotai, Recoil):
//
//   userAtom  cartAtom  filterAtom          ← independent pieces
//        \       |        /
//         → totalAtom (derived)             ← composed UP
//
//   You start with pieces and compose. The atom IS the subscription unit,
//   so precision is structural.
//
// Runtime rule:
//   A derived atom's dependencies are tracked AUTOMATICALLY by watching which
//   atoms its read function calls `get` on. You never declare a dep array.
//
// Practical rule:
//   Atoms suit state that is naturally fragmented — a form field per input, a
//   canvas of independent elements. A store suits state with a shape.
//
// Common trap:
//   Making everything an atom, then needing to update six together and
//   discovering there is no transaction. Fragmentation is the cost.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD JOTAI
// ══════════════════════════════════════════════════════════════════

function createJotai() {
  const values = new Map();        // atom → current value
  const subscribers = new Map();   // atom → Set<listener>
  const dependents = new Map();    // atom → Set<derived atoms that read it>

  let currentlyComputing = null;   // ← how automatic dep tracking works

  function atom(initialOrRead, write) {
    const self = {
      isDerived: typeof initialOrRead === "function",
      read: typeof initialOrRead === "function" ? initialOrRead : null,
      init: typeof initialOrRead === "function" ? undefined : initialOrRead,
      write,
      toString: () => (typeof initialOrRead === "function" ? "derived" : `atom(${initialOrRead})`),
    };
    return self;
  }

  function get(theAtom) {
    // ── AUTOMATIC DEPENDENCY TRACKING ─────────────────────────────
    // If we are inside a derived atom's read function, record that THIS atom
    // is a dependency. No dep array. No declaration. Just: who asked?
    if (currentlyComputing) {
      if (!dependents.has(theAtom)) dependents.set(theAtom, new Set());
      dependents.get(theAtom).add(currentlyComputing);
    }

    if (theAtom.isDerived) {
      // Recompute. In real Jotai this is cached and invalidated; here we
      // recompute so the tracking is visible.
      const previous = currentlyComputing;
      currentlyComputing = theAtom;
      const value = theAtom.read(get);
      currentlyComputing = previous;
      values.set(theAtom, value);
      return value;
    }

    if (!values.has(theAtom)) values.set(theAtom, theAtom.init);
    return values.get(theAtom);
  }

  function set(theAtom, update) {
    if (theAtom.write) {                     // a write-only / action atom
      theAtom.write(get, set, update);
      return;
    }
    const next = typeof update === "function" ? update(get(theAtom)) : update;
    if (Object.is(next, values.get(theAtom))) return;    // bail out
    values.set(theAtom, next);
    notify(theAtom);
  }

  // Propagate: notify this atom's subscribers, then everything derived from it.
  function notify(theAtom, seen = new Set()) {
    if (seen.has(theAtom)) return;
    seen.add(theAtom);

    (subscribers.get(theAtom) ?? new Set()).forEach(fn => fn());

    for (const derived of dependents.get(theAtom) ?? []) {
      notify(derived, seen);                 // ← the graph propagates upward
    }
  }

  function subscribe(theAtom, listener) {
    if (!subscribers.has(theAtom)) subscribers.set(theAtom, new Set());
    subscribers.get(theAtom).add(listener);
    return () => subscribers.get(theAtom).delete(listener);
  }

  // Model a component using an atom:
  function mount(name, theAtom) {
    const component = { name, renders: 1, value: get(theAtom) };
    subscribe(theAtom, () => {
      const next = get(theAtom);
      if (!Object.is(next, component.value)) {   // ← only if MY atom changed
        component.value = next;
        component.renders++;
      }
    });
    return component;
  }

  return { atom, get, set, subscribe, mount,
    depsOf: (a) => [...(dependents.get(a) ?? [])].length };
}

const J = createJotai();


// ══════════════════════════════════════════════════════════════════
// § 4 — ATOMS ARE useState IN A VARIABLE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the whole API:\n");

const countAtom = J.atom(0);
const nameAtom = J.atom("Vineet");

console.log("  const countAtom = atom(0);          ← a module-level variable");
console.log("  const [count, setCount] = useAtom(countAtom);\n");
console.log("    initial   :", J.get(countAtom));
J.set(countAtom, 5);
console.log("    set(5)    :", J.get(countAtom));
J.set(countAtom, (c) => c + 1);
console.log("    set(c=>c+1):", J.get(countAtom));

console.log("\n  Note there is no store, no reducer, no selector, and no shape.");
console.log("  Two atoms are two independent variables. That is the model:");
console.log("  useState you can lift out of a component and share.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — DERIVED ATOMS: A DEPENDENCY GRAPH
// ══════════════════════════════════════════════════════════════════

console.log("§5 — derived atoms compose UP:\n");

const priceAtom = J.atom(100);
const quantityAtom = J.atom(2);
const taxRateAtom = J.atom(0.1);

// A derived atom READS other atoms. Its deps are tracked automatically.
const subtotalAtom = J.atom((get) => get(priceAtom) * get(quantityAtom));
const taxAtom = J.atom((get) => get(subtotalAtom) * get(taxRateAtom));
const totalAtom = J.atom((get) => get(subtotalAtom) + get(taxAtom));

console.log("  const subtotalAtom = atom(get => get(priceAtom) * get(quantityAtom));");
console.log("  const taxAtom      = atom(get => get(subtotalAtom) * get(taxRateAtom));");
console.log("  const totalAtom    = atom(get => get(subtotalAtom) + get(taxAtom));\n");

console.log("    price:", J.get(priceAtom), "| quantity:", J.get(quantityAtom));
console.log("    subtotal:", J.get(subtotalAtom));
console.log("    tax     :", J.get(taxAtom));
console.log("    total   :", J.get(totalAtom));

J.set(quantityAtom, 3);
console.log("\n  set(quantityAtom, 3):");
console.log("    subtotal:", J.get(subtotalAtom), "← recomputed");
console.log("    tax     :", J.get(taxAtom), "← recomputed (it reads subtotal)");
console.log("    total   :", J.get(totalAtom), "← recomputed");

console.log("\n  Nobody declared a dependency. Jotai watched which atoms the");
console.log("  read function called `get` on, and built the graph:");
console.log("");
console.log("    price ──┐");
console.log("            ├─→ subtotal ──┬─→ tax ──┐");
console.log("    quantity┘              │         ├─→ total");
console.log("                           └─────────┘");
console.log("    taxRate ───────────────→ tax");
console.log("");
console.log("  This is a spreadsheet. Change a cell, and every formula that");
console.log("  reads it recalculates — and nothing else does.");
console.log("\n  Compare useMemo: you write the deps array BY HAND, and getting");
console.log("  it wrong is silent. Here the deps ARE the reads. They cannot");
console.log("  drift out of sync with the code, because they are the code.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — NO SELECTORS NEEDED
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the atom IS the subscription unit:\n");

const K = createJotai();
const userAtom = K.atom({ name: "Vineet" });
const cartAtom = K.atom([]);
const themeAtom = K.atom("dark");

const header = K.mount("Header", userAtom);
const cartIcon = K.mount("CartIcon", cartAtom);
const toggle = K.mount("ThemeToggle", themeAtom);

K.set(userAtom, { name: "Ankit" });      // ONLY the user changed

console.log("  three components, three atoms. userAtom changes:\n");
console.log("    Header     (userAtom) renders:", header.renders, "← ✅ it changed");
console.log("    CartIcon   (cartAtom) renders:", cartIcon.renders, "← ✅ untouched");
console.log("    ThemeToggle(themeAtom) renders:", toggle.renders, "← ✅ untouched");

console.log("\n  Notice what is NOT here: a selector. There is nothing to select");
console.log("  FROM — the state was never combined in the first place.");
console.log("\n  That is the real difference from Zustand. Zustand gives you one");
console.log("  store and a selector to narrow it, and the selector is YOUR job");
console.log("  to write correctly — get it wrong (an object selector) and you");
console.log("  re-render on everything. Jotai has no selector to get wrong,");
console.log("  because the atom IS the granularity.");
console.log("\n  Zustand: precision is something you ACHIEVE.");
console.log("  Jotai:   precision is something you START with.");
console.log("  → 08_zustand-basics.js §6\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WRITE ATOMS (actions)
// ══════════════════════════════════════════════════════════════════
//
// A derived atom can also be WRITABLE — that is where "actions" live:
//
//   const countAtom = atom(0);
//
//   const doubleAtom = atom(
//     (get) => get(countAtom) * 2,                    // read
//     (get, set, newValue) => set(countAtom, newValue / 2)   // write
//   );
//
//   const incrementAtom = atom(
//     null,                                          // write-ONLY: no value
//     (get, set) => set(countAtom, get(countAtom) + 1)
//   );
//
//   const [, increment] = useAtom(incrementAtom);   // ← an action, as an atom
//
// The write-only atom is Jotai's answer to "where do actions live?". It is
// elegant — actions are atoms too, so they compose the same way. It is also
// where people find it too clever: `atom(null, (get, set) => ...)` is not
// obvious the first time you read it.

console.log("§7 — write atoms are actions:\n");

const L = createJotai();
const baseAtom = L.atom(10);

const incrementAtom = L.atom(null, (get, set) => set(baseAtom, get(baseAtom) + 1));
const resetAtom = L.atom(null, (get, set) => set(baseAtom, 0));

console.log("  const incrementAtom = atom(null, (get, set) => set(baseAtom, get(baseAtom)+1));\n");
console.log("    base:", L.get(baseAtom));
L.set(incrementAtom);
console.log("    after increment:", L.get(baseAtom));
L.set(incrementAtom);
console.log("    after increment:", L.get(baseAtom));
L.set(resetAtom);
console.log("    after reset    :", L.get(baseAtom));

console.log("\n  Actions are atoms. They compose like atoms, they are testable");
console.log("  like atoms, and there is one concept in the whole library.");
console.log("  Whether `atom(null, ...)` is elegant or cryptic is genuinely a");
console.log("  matter of taste — and it is a real reason teams bounce off it.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — JOTAI vs RECOIL vs ZUSTAND
// ══════════════════════════════════════════════════════════════════

console.log("§8 — the comparison, and one obituary:\n");

const table = [
  ["model", "bottom-up atoms", "bottom-up atoms", "top-down store"],
  ["identity", "the object itself", "a string key", "the store object"],
  ["derived", "atom(get => ...)", "selector({get})", "compute in a selector"],
  ["deps", "automatic", "automatic", "manual selector"],
  ["Provider", "optional", "REQUIRED", "not needed"],
  ["bundle", "~3kB", "~20kB", "~1kB"],
  ["status", "✅ active", "☠️  ARCHIVED (Jan 2025)", "✅ active"],
];

console.log("  aspect    | Jotai              | Recoil               | Zustand");
console.log("  ----------|--------------------|----------------------|------------------");
for (const [aspect, j, r, z] of table) {
  console.log(`  ${aspect.padEnd(9)} | ${j.padEnd(18)} | ${r.padEnd(20)} | ${z}`);
}

console.log("\n  ⚠️  RECOIL IS DEAD. Meta archived it in January 2025 — the repo");
console.log("     is read-only. It was never 1.0 in five years. If an");
console.log("     interviewer asks about Recoil, SAYING THIS is the answer:");
console.log("     the concepts live on in Jotai, which was directly inspired by");
console.log("     it and does the same thing in 3kB instead of 20.");
console.log("\n  The design difference worth knowing: Recoil identified atoms by");
console.log("  a STRING KEY — atom({ key: 'count', default: 0 }) — and duplicate");
console.log("  keys were a runtime error that plagued hot reloading and code");
console.log("  splitting. Jotai uses the atom OBJECT as its own identity: no");
console.log("  keys, no collisions, and it works with WeakMap so unused atoms");
console.log("  are garbage collected. That one decision is most of why Jotai");
console.log("  won.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — THE HONEST TRADE-OFFS
// ══════════════════════════════════════════════════════════════════
//
// ✅ WHERE ATOMS SHINE:
//   • naturally fragmented state — a form with 40 independent fields, a
//     canvas of independent shapes, a table of independently-editable cells
//   • derived values with real dependency chains (the spreadsheet case)
//   • re-render precision without thinking about it
//   • incremental adoption: one atom, no store to design
//
// ❌ WHERE THEY HURT:
//   • NO SHAPE. Redux gives you `state.cart.items` and you know where things
//     live. Fifty atoms in fifty files have no map. Discoverability is real.
//   • NO TRANSACTIONS. Updating six atoms together means six notifications
//     and potentially six renders. A store updates once. (Jotai batches
//     within an event handler, but there is no explicit transaction.)
//   • DEBUGGING. There is no action log. "Why did this change?" has no
//     answer — the atom just... changed. Redux's devtools tell you WHO and
//     WHY. Jotai's devtools show you a graph, which is not the same question.
//   • ATOM SPRAWL. Nothing stops you making 200 atoms. Nothing organizes them.
//
// The framing that lands:
//   "Atoms and stores are answers to the same question from opposite ends.
//    Zustand: one shape, select down. Jotai: many pieces, compose up. Atoms
//    win when the state is genuinely independent — a form, a canvas. A store
//    wins when the state has a shape people need to navigate. And honestly,
//    for most apps, once React Query has taken the server data, what's left is
//    small enough that this debate does not matter much."

console.log("§9 — atom sprawl, concretely:\n");

const M = createJotai();
const atoms = {};
for (const field of ["firstName", "lastName", "email", "phone", "street"]) {
  atoms[field] = M.atom("");
}

// Updating several atoms together: N notifications, not one transaction.
let notifications = 0;
for (const a of Object.values(atoms)) M.subscribe(a, () => notifications++);

// "Load the user's saved profile" — five atoms, five notifications:
for (const [field, a] of Object.entries(atoms)) M.set(a, "loaded-" + field);

console.log("  a 5-field form as 5 atoms. Loading a saved profile:");
console.log("    atoms updated:", Object.keys(atoms).length);
console.log("    notifications:", notifications, "← no transaction");
console.log("\n  A store would be ONE set() and ONE notification. Jotai batches");
console.log("  within a React event handler, so this is usually fine in");
console.log("  practice — but there is no explicit transaction, and 'update");
console.log("  these six atoms atomically' has no clean answer.");
console.log("\n  That is the flip side of fragmentation: independence is the");
console.log("  feature AND the cost. → §8\n");


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — An atom recreated on every render:
//   const countAtom = atom(0) INSIDE a component → a new atom every render →
//   state resets constantly. Atoms belong at module scope, or in useMemo.
//   This is Jotai's #1 bug.
//
// Bug 2 — "Duplicate atom key" (Recoil):
//   String keys plus hot reload. One of the reasons Jotai dropped keys.
//
// Bug 3 — A derived atom recomputes constantly:
//   Its read returns a new object each time. The same referential-equality
//   rule as everywhere else.
//
// Bug 4 — Atom sprawl with no map:
//   50 atoms across 30 files and no way to know what exists. → §9.
//
// Bug 5 — No transaction:
//   Six atoms must change together. There is no atomic multi-set. → §9.
//
// Bug 6 — "Why did this change?" is unanswerable:
//   No action log. The atom changed. From where? Good luck.
//
// Bug 7 — Async atoms suspend unexpectedly:
//   An async atom read triggers Suspense. Powerful, and surprising if you did
//   not put a boundary there.
//
// Bug 8 — Reaching for Recoil in 2026:
//   It is archived. Use Jotai.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// Atoms are variables:
assert(J.get(countAtom) === 6, "set with a value and an updater both work");
assert(J.get(nameAtom) === "Vineet", "atoms are INDEPENDENT — countAtom did not touch it");

// The derived graph:
assert(J.get(subtotalAtom) === 300, "subtotal = price * quantity, recomputed after set");
assert(J.get(taxAtom) === 30, "tax reads subtotal — the chain propagated");
assert(J.get(totalAtom) === 330, "total reads subtotal AND tax");
assert(J.depsOf(priceAtom) > 0,
  "priceAtom has dependents — tracked AUTOMATICALLY by watching get() calls");
assert(J.depsOf(subtotalAtom) > 0, "and subtotal is itself a dependency of tax and total");

// No selectors needed — the headline:
assert(header.renders === 2, "the Header's atom changed → it re-rendered");
assert(cartIcon.renders === 1, "the CartIcon's atom did NOT change → no re-render");
assert(toggle.renders === 1, "nor the theme's");
assert(cartIcon.renders === toggle.renders,
  "precision with ZERO selectors — the atom IS the subscription unit");

// Write atoms:
assert(L.get(baseAtom) === 0, "the reset write-atom ran");

// The cost — no transaction:
assert(notifications === 5,
  "five atoms updated → FIVE notifications. There is no transaction. 🐛");
assert(notifications === Object.keys(atoms).length,
  "one per atom — a store would have been ONE");

console.log("§11 — mini assertions passed for: Jotai / Recoil atoms");
console.log("\n  The pair that captures it: precision with zero selectors (1, 1,");
console.log("  2 renders), and five notifications for one logical update. The");
console.log("  same fragmentation is both the feature and the cost.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is Jotai / what are atoms?", answer like this:
//
//   "The honest one-liner is: useState you can put in a variable. An atom is a
//    piece of state at module scope, and any component can use it.
//
//    The real distinction is direction. Redux and Zustand are top-down — one
//    store with a shape, and you select down into it. Jotai is bottom-up —
//    many independent atoms that you compose UP into derived ones. A derived
//    atom is atom(get => get(priceAtom) * get(quantityAtom)), and its
//    dependencies are tracked automatically by watching which atoms it calls
//    get on. It's a spreadsheet: change a cell, and every formula reading it
//    recalculates. Compare useMemo, where you write the deps array by hand and
//    getting it wrong is silent — here the deps ARE the reads, so they can't
//    drift from the code.
//
//    The payoff is that there are no selectors, because there's nothing
//    combined to select from. In Zustand precision is something you ACHIEVE by
//    writing a good selector — and an object selector re-renders on everything.
//    In Jotai precision is where you START.
//
//    On Recoil: it's archived. Meta shut it down in January 2025, never hit
//    1.0 in five years. The concepts live on in Jotai, which was inspired by it
//    and is 3kB instead of 20. The key design difference is that Recoil
//    identified atoms by a string key, and duplicate keys broke hot reload and
//    code splitting. Jotai uses the atom object as its own identity — no keys,
//    no collisions, and unused atoms get garbage collected.
//
//    The trade-offs I'd name: atoms have no SHAPE, so `state.cart.items` is
//    replaced by fifty atoms in fifty files with no map. There's no
//    transaction — updating six atoms is six notifications. And there's no
//    action log, so 'why did this change?' has no answer, where Redux devtools
//    tell you exactly who and why.
//
//    Atoms win when state is genuinely fragmented — a 40-field form, a canvas.
//    A store wins when the state has a shape people need to navigate."
//
// The Recoil obituary with the key-vs-object reason, and "precision you
// achieve vs precision you start with", are the senior markers.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is an atom?
// A1. A unit of state at module scope. useState you can put in a variable.
//
// Q2. Bottom-up vs top-down?
// A2. Atoms compose UP from independent pieces; stores select DOWN from one
//     shape. Opposite ends of the same problem.
//
// Q3. How are derived deps tracked?
// A3. Automatically — Jotai watches which atoms the read function calls get on.
//     No dep array to get wrong.
//
// Q4. Why no selectors?
// A4. There is nothing combined to select from. The atom is the subscription
//     unit, so precision is structural.
//
// Q5. What happened to Recoil?
// A5. Archived by Meta in January 2025, never reached 1.0. Jotai carries the
//     ideas at a fraction of the size.
//
// Q6. Why did Jotai win?
// A6. No string keys. The atom object is its own identity, so no duplicate-key
//     errors and atoms can be garbage collected.
//
// Q7. What is the #1 Jotai bug?
// A7. Creating an atom inside a component — a new atom every render, so state
//     resets. Atoms go at module scope.
//
// Q8. What do atoms cost?
// A8. No shape (discoverability), no transactions, and no action log for
//     debugging.
//
// Q9. Jotai or Zustand?
// A9. Jotai when state is genuinely fragmented and derived — forms, canvases.
//     Zustand when it has a shape people navigate.
//
// Q10. Where do actions live?
// A10. Write-only atoms: atom(null, (get, set) => ...). Elegant or cryptic,
//      depending on taste.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is an atom?
//   Back : useState you can put in a variable.
//
// Flashcard 2:
//   Front: Bottom-up vs top-down?
//   Back : Compose UP from pieces vs select DOWN from a store.
//
// Flashcard 3:
//   Front: How are derived deps tracked?
//   Back : Automatically — by watching get() calls. No dep array.
//
// Flashcard 4:
//   Front: Why no selectors?
//   Back : Nothing was combined. The atom IS the granularity.
//
// Flashcard 5:
//   Front: What is the most common trap?
//   Back : Creating an atom inside a component — a new atom every render.
//
// Flashcard 6:
//   Front: Recoil?
//   Back : Archived, January 2025. Never 1.0. Use Jotai.
//
// Flashcard 7:
//   Front: What do atoms cost?
//   Back : No shape, no transactions, no action log.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the dependency tracker from memory. The trick is one variable:
//   `currentlyComputing`, set around the read function.
//
// Task 2:
//   Add caching to derived atoms — recompute only when a dependency actually
//   changed. That is the difference between this file and real Jotai.
//
// Task 3:
//   Build a 40-field form twice: 40 atoms vs one Zustand store. Which reads
//   better? Which re-renders less? Now you have an opinion with evidence.
//
// Task 4:
//   Reproduce the #1 bug: create an atom inside a component and watch state
//   reset on every render.
//
// Task 5:
//   Try to write a transaction: update five atoms with ONE notification. See
//   how far you get. That is the honest limitation.
//
// Task 6:
//   Explain in 60 seconds why Jotai needs no selectors, to someone who just
//   learned Zustand.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Bottom-up, not top-down. The atom IS the subscription unit, so there are
//   no selectors to get wrong.
//
// If you remember the common bug:
//   An atom created inside a component is a new atom every render. And there
//   is no transaction — six atoms is six notifications.
//
// If you remember the professional framing:
//   Recoil is archived; Jotai won by dropping string keys. Atoms trade SHAPE
//   and an action log for precision and independence.
//
// NEXT TOPIC -> 10_react-query-usequery-usemutation.js
