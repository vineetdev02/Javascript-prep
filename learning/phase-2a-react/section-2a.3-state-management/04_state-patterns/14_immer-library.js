// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  14_immer-library.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Immer library
//
// WHAT YOU WILL MASTER HERE:
//   1. produce(base, recipe) — build it with a Proxy and see the trick
//   2. Structural sharing: Immer does it BETTER than you would by hand
//   3. The three ways Immer still lets you get it wrong
//   4. The auto-freeze feature nobody knows about
//   5. The cost: when NOT to use it
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/14_immer-library.js"
//
// Prerequisites: 13_immutable-state-updates.js (the pain), 04_redux-toolkit-
// createslice.js (where you already used it without knowing).


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Immer:
// You write mutating code against a DRAFT, and Immer produces a new immutable
// object from your changes.
//
// If interviewer says "explain it simply", say:
// "produce(state, draft => { draft.a.b.c = 1 }) gives you a new state. The
//  draft is a Proxy that records your writes instead of applying them, and
//  Immer replays them onto copies."
//
// If interviewer asks "why does it matter?", say:
// "Because hand-written nested updates are five levels of spread for one
//  boolean, and missing one spread is a silent mutation bug. But the deeper
//  answer is that Immer does structural sharing BETTER than a human — it only
//  copies the exact path you touched, and it returns the ORIGINAL object if
//  you changed nothing."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   mutate a fake, get a real
//
// The API is one function:
//
//   const next = produce(current, (draft) => {
//     draft.user.profile.settings.notifications.push = true;
//   });
//
//   current is untouched. next is a new object. That is it.
//
// How the Proxy trick works:
//
//   1. draft is a Proxy wrapping `current`.
//   2. READS pass through to the base object — nothing is copied yet.
//   3. The FIRST write to a node triggers a shallow copy of THAT node,
//      and marks it modified. Copy-on-write.
//   4. Writing a nested path proxies each level on the way down, so each
//      level gets copied only if it is actually touched.
//   5. At the end, Immer walks the modified nodes and builds the result —
//      copies on the changed path, ORIGINAL references everywhere else.
//
// Runtime rule:
//   Either MUTATE the draft or RETURN a new state. Never both. Immer cannot
//   know which you meant, so it throws.
//
// Practical rule:
//   You already use it: RTK bundles it. createSlice's `state.value += 1` IS
//   produce().
//
// Common trap:
//   Thinking it is a deep clone. It is the opposite — it copies as LITTLE as
//   possible. → §5


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD produce()
// ══════════════════════════════════════════════════════════════════

function produce(base, recipe) {
  // Every proxied node gets a state record. `copy` is created lazily —
  // that laziness IS the structural sharing.
  const drafts = new Map();

  function createDraft(baseNode, parentState) {
    const state = {
      base: baseNode,
      copy: null,               // ← created on FIRST write. Not before.
      modified: false,
      parent: parentState,
      children: new Map(),
    };

    const proxy = new Proxy(baseNode, {
      get(_, prop) {
        const source = state.copy ?? state.base;
        const value = source[prop];

        // Reading a nested object? Return a DRAFT of it, so writes deeper
        // down can find their way back up to us.
        if (value && typeof value === "object") {
          if (!state.children.has(prop)) {
            state.children.set(prop, createDraft(value, state));
          }
          return state.children.get(prop).proxy;
        }
        return value;
      },

      set(_, prop, value) {
        // ── COPY-ON-WRITE ─────────────────────────────────────────
        if (!state.copy) {
          state.copy = Array.isArray(state.base) ? [...state.base] : { ...state.base };
        }
        state.copy[prop] = value;
        markModified(state);           // ← tell every ancestor they changed too
        return true;
      },

      deleteProperty(_, prop) {
        if (!state.copy) {
          state.copy = Array.isArray(state.base) ? [...state.base] : { ...state.base };
        }
        delete state.copy[prop];
        markModified(state);
        return true;
      },
    });

    state.proxy = proxy;
    drafts.set(proxy, state);
    return state;
  }

  // A write deep in the tree must mark the whole PATH to the root as
  // modified — that is how only the path gets copied.
  function markModified(state) {
    let cursor = state;
    while (cursor && !cursor.modified) {
      cursor.modified = true;
      if (cursor.parent && !cursor.parent.copy) {
        cursor.parent.copy = Array.isArray(cursor.parent.base)
          ? [...cursor.parent.base]
          : { ...cursor.parent.base };
      }
      cursor = cursor.parent;
    }
  }

  // Build the result: a copy where modified, the ORIGINAL where not.
  function finalize(state) {
    if (!state.modified) return state.base;        // ← untouched → SHARE it

    const result = state.copy;
    for (const [prop, childState] of state.children) {
      if (childState.modified) {
        result[prop] = finalize(childState);       // recurse into the path
      }
      // else: result[prop] is already the original reference. Shared.
    }
    return result;
  }

  const rootState = createDraft(base, null);
  const returned = recipe(rootState.proxy);

  // Immer's rule: return OR mutate. Not both.
  if (returned !== undefined && rootState.modified) {
    throw new Error(
      "[Immer] An immer producer returned a new value *and* modified its draft. " +
      "Either return a new value *or* modify the draft."
    );
  }
  if (returned !== undefined) return returned;

  return finalize(rootState);
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE PAYOFF
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the same update, both ways:\n");

const appState = {
  user: {
    name: "Vineet",
    profile: {
      settings: {
        notifications: { email: true, push: false, sms: false },
        theme: "dark",
      },
    },
  },
  posts: [{ id: 1, likes: 0 }],
};

// The hand-written version from the previous file:
const byHand = {
  ...appState,
  user: {
    ...appState.user,
    profile: {
      ...appState.user.profile,
      settings: {
        ...appState.user.profile.settings,
        notifications: {
          ...appState.user.profile.settings.notifications,
          push: true,
        },
      },
    },
  },
};

// With Immer:
const withImmer = produce(appState, (draft) => {
  draft.user.profile.settings.notifications.push = true;
});

console.log("  by hand : 10 lines, 5 spreads, 1 real change");
console.log("  Immer   : draft.user.profile.settings.notifications.push = true;\n");
console.log("    same result?",
  JSON.stringify(byHand) === JSON.stringify(withImmer), "✅");
console.log("    original mutated?",
  appState.user.profile.settings.notifications.push === true ? "YES 🐛" : "no ✅");
console.log("    new push value:", withImmer.user.profile.settings.notifications.push);

console.log("\n  Both are correct. One of them can be got wrong by forgetting a");
console.log("  single spread five levels down — silently. The other cannot.");
console.log("  → 13_immutable-state-updates.js §6\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — IT IS NOT A DEEP CLONE
// ══════════════════════════════════════════════════════════════════
//
// The misconception that matters, and the thing Immer does BETTER than you.

console.log("§5 — Immer copies as LITTLE as possible:\n");

console.log("  after changing ONE nested boolean, which references survived?\n");
const checks = [
  ["root", appState, withImmer],
  ["user", appState.user, withImmer.user],
  ["user.profile", appState.user.profile, withImmer.user.profile],
  ["...settings", appState.user.profile.settings, withImmer.user.profile.settings],
  ["...notifications", appState.user.profile.settings.notifications,
    withImmer.user.profile.settings.notifications],
  ["posts (untouched)", appState.posts, withImmer.posts],
  ["settings.theme (untouched)", appState.user.profile.settings.theme,
    withImmer.user.profile.settings.theme],
];

for (const [name, a, b] of checks) {
  const shared = Object.is(a, b);
  console.log(`    ${name.padEnd(27)} ${shared ? "SHARED ✅" : "copied  ← on the path"}`);
}

console.log("\n  Only the PATH from root to the change was copied. `posts` is the");
console.log("  exact same array in memory. So:");
console.log("    • a memoized <PostList posts={state.posts}/> does NOT re-render");
console.log("    • useSelector(s => s.posts) sees no change");
console.log("    • a useEffect with [state.posts] does not fire");

// The comparison people never make — structuredClone:
const cloned = structuredClone(appState);
cloned.user.profile.settings.notifications.push = true;
console.log("\n  compare structuredClone (the 'obvious' safe approach):");
console.log("    posts shared?", Object.is(appState.posts, cloned.posts),
  "🐛 a NEW array — and it never changed");
console.log("    → every memoized component reading posts re-renders. For a");
console.log("      change to a notification setting. That is why 'just deep");
console.log("      clone it' is correct and wrong.");

// The bailout — the detail that wins the interview:
const unchanged = produce(appState, (draft) => {
  const x = draft.user.name;                 // only READ
  void x;
});
console.log("\n  and if the recipe changes NOTHING:");
console.log("    same object back?", Object.is(appState, unchanged), "✅");
console.log("    Immer returns the ORIGINAL reference, so React's Object.is");
console.log("    bailout fires and nothing re-renders at all.");
console.log("\n  A hand-written `{ ...state }` ALWAYS makes a new object, even");
console.log("  when a reducer decides to change nothing. Immer is more precise");
console.log("  than the code you would have written. That is the strongest");
console.log("  argument for it, and almost nobody makes it.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE THREE WAYS TO STILL GET IT WRONG
// ══════════════════════════════════════════════════════════════════

console.log("§6 — Immer is not magic:\n");

// TRAP 1 — mutate AND return
let trap1Error;
try {
  produce({ count: 0 }, (draft) => {
    draft.count = 1;
    return { count: 99 };
  });
} catch (e) {
  trap1Error = e.message;
}
console.log("  TRAP 1 — mutate AND return:");
console.log("    💥", trap1Error.slice(0, 64) + "...");
console.log("    Immer cannot know which you meant. It refuses to guess.\n");

// TRAP 2 — reassigning the draft parameter
const trap2 = produce({ count: 0 }, (draft) => {
  draft = { count: 99 };            // 🐛 rebinds a local name. Immer never sees it.
  void draft;
});
console.log("  TRAP 2 — reassigning the draft:");
console.log("    draft = { count: 99 } →", JSON.stringify(trap2),
  "🐛 silently does NOTHING");
console.log("    `draft` is a function PARAMETER. Assigning to it rebinds a");
console.log("    local variable; the Proxy never gets a `set` trap. No error.\n");

// TRAP 3 — holding a draft past the producer
let escaped;
produce({ user: { name: "Vineet" } }, (draft) => {
  escaped = draft.user;             // 🐛 keeping a reference to the draft
});
let trap3Error;
try {
  escaped.name = "Ankit";           // using it AFTER produce finished
} catch (e) {
  trap3Error = e.constructor.name;
}
console.log("  TRAP 3 — a draft escaping the producer:");
console.log("    real Immer revokes the proxies when produce() returns, so");
console.log("    touching an escaped draft throws:");
console.log("      'Cannot perform 'set' on a proxy that has been revoked'");
console.log("    (our mini version does not revoke:",
  trap3Error ? "threw " + trap3Error : "silently mutated a dead draft 🐛", ")");
console.log("\n  The lesson: the draft is alive ONLY inside the recipe. Do not");
console.log("  store it, return it in a closure, or pass it to an async call.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — AUTO-FREEZE: THE FEATURE NOBODY KNOWS
// ══════════════════════════════════════════════════════════════════
//
// Immer FREEZES the result — deeply — in development.
//
//   const next = produce(state, d => { d.a = 1 });
//   next.a = 2;        // ❌ TypeError in strict mode. Silently ignored otherwise.
//
// This is a genuinely great feature and almost nobody mentions it:
//   • it catches the mutation bug at the MUTATION, not three renders later
//     when a component fails to update
//   • it makes "correct data, dead UI" — the worst React bug — impossible
//   • RTK enables it, which is why mutating store state outside a reducer
//     throws in dev
//
// The cost: freezing is O(n) over the result. Immer only freezes NEW data,
// and already-frozen branches are skipped — so structural sharing pays off
// twice. You can disable it with setAutoFreeze(false) for very large states.

console.log("§7 — auto-freeze:\n");

function freezeDeep(obj) {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    Object.values(obj).forEach(freezeDeep);
  }
  return obj;
}

const frozen = freezeDeep(produce({ user: { name: "Vineet" } }, (d) => {
  d.user.name = "Ankit";
}));

let freezeError;
try {
  "use strict";
  frozen.user.name = "Hacked";
} catch (e) {
  freezeError = e.constructor.name;
}

console.log("  Immer deep-freezes the result in development:");
console.log("    next.user.name = 'Hacked' →",
  freezeError ? `💥 ${freezeError}` : `silently ignored (value: ${frozen.user.name})`);
console.log("    the value is still:", JSON.stringify(frozen.user.name), "✅");

console.log("\n  Why this matters more than it sounds: it catches the mutation");
console.log("  AT THE MUTATION. Without it, the symptom is 'a component did not");
console.log("  re-render' — three files away, three renders later, with correct");
console.log("  data in devtools. That is the hardest React bug to diagnose, and");
console.log("  auto-freeze makes it impossible.");
console.log("\n  It is also why RTK throws when you mutate store state outside a");
console.log("  reducer. People find that annoying. It is the single most");
console.log("  valuable dev-time check in the whole stack.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE COST, AND WHEN NOT TO
// ══════════════════════════════════════════════════════════════════

console.log("§8 — the honest costs:\n");

// Model the overhead: a Proxy get-trap on every property access.
function measureAccess(depth, reads) {
  return { plain: reads, proxied: reads * (depth + 1) };   // one trap per level
}

console.log("  Immer's overhead is a Proxy trap on every READ:\n");
console.log("    depth | 1000 reads plain | 1000 reads proxied");
console.log("    ------|------------------|-------------------");
for (const d of [1, 3, 5]) {
  const m = measureAccess(d, 1000);
  console.log(`    ${String(d).padStart(5)} | ${String(m.plain).padStart(16)} | ` +
    `${String(m.proxied).padStart(19)}`);
}

console.log("\n  ❌ WHEN NOT TO USE IT:");
console.log("    • very large state + hot paths. Immer proxies every access, and");
console.log("      at 100k+ nodes with frequent updates it is measurable. Rare,");
console.log("      but real — measure before you assume.");
console.log("    • trivially shallow updates. { ...state, count: state.count + 1 }");
console.log("      is clearer than produce() for one field, and free.");
console.log("    • non-plain objects. Immer handles plain objects, arrays, Map");
console.log("      and Set (with enableMapSet). Class instances need");
console.log("      [immerable] = true. A Date or a DOM node just... is not drafted.");
console.log("    • when the real fix is NORMALIZING. Five levels of nesting is a");
console.log("      modelling problem. Immer makes bad state shape comfortable,");
console.log("      which is not the same as making it good.");

console.log("\n  ✅ WHEN TO USE IT:");
console.log("    • nested updates — the case it exists for");
console.log("    • reducers, always (RTK already does)");
console.log("    • any update where a missed spread would be silent");

console.log("\n  The honest framing: Immer trades a small runtime cost for a");
console.log("  large class of bugs. That is almost always the right trade — and");
console.log("  the last bullet above is the senior one. Immer fixes the SYMPTOM");
console.log("  of deep nesting. Normalizing fixes the CAUSE.");
console.log("  → 13_immutable-state-updates.js §6\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL IMMER DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real Immer
//   ───────────               ──────────
//   a Map of drafts           a WeakMap + an internal state on each proxy
//   no revocation             Proxy.revocable — escaped drafts throw loudly
//   no freezing               auto-freeze on by default in dev; skips
//                             already-frozen branches, so sharing pays twice
//   objects + arrays          plus Map and Set via enableMapSet(), and class
//                             instances marked with [immerable] = true
//   n/a                       PATCHES: produceWithPatches gives you a list of
//                             JSON-patch operations describing what changed —
//                             which is how you build undo/redo, or sync state
//                             over a websocket by sending patches not snapshots
//   n/a                       createDraft / finishDraft for async work, since
//                             a recipe cannot be async
//   n/a                       currying: produce(recipe) returns a reducer
//
// The patches feature is the one worth naming — produceWithPatches gives you
// forward AND inverse patches, so undo/redo is nearly free, and collaborative
// editing can send a 50-byte patch instead of a whole state tree.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "returned a new value AND modified its draft":
//   → §6 trap 1. Pick one.
//
// Bug 2 — A reducer that silently does nothing:
//   Reassigning the draft parameter. → §6 trap 2.
//
// Bug 3 — "Cannot perform 'set' on a proxy that has been revoked":
//   A draft escaped the producer. → §6 trap 3.
//
// Bug 4 — An async recipe does nothing:
//   produce(state, async (draft) => {...}) — the recipe cannot be async. The
//   draft is revoked at the first await. Use createDraft/finishDraft.
//
// Bug 5 — TypeError: Cannot assign to read only property:
//   Auto-freeze catching you mutating the RESULT. Working as intended. → §7.
//
// Bug 6 — Map/Set updates silently ignored:
//   You need enableMapSet().
//
// Bug 7 — A class instance is not drafted:
//   Mark it with [immerable] = true, or use a plain object.
//
// Bug 8 — Assuming it deep-clones:
//   It does the opposite. Reading `next.posts === state.posts` and expecting
//   false is the misconception. → §5.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The payoff:
assert(appState.user.profile.settings.notifications.push === false,
  "the ORIGINAL is untouched — mutating code, immutable result");
assert(withImmer.user.profile.settings.notifications.push === true,
  "the new state has the change");
assert(JSON.stringify(byHand) === JSON.stringify(withImmer),
  "Immer produces exactly what the 5-spread chain produced");

// It is NOT a deep clone — the headline:
assert(Object.is(appState.posts, withImmer.posts),
  "`posts` is the SAME array — untouched branches are SHARED, not copied ✅");
assert(!Object.is(appState.user, withImmer.user),
  "...while every level ON the path got a new object");
assert(!Object.is(appState.user.profile.settings.notifications,
  withImmer.user.profile.settings.notifications), "...down to the leaf");
assert(!Object.is(appState.posts, cloned.posts),
  "structuredClone copies EVERYTHING — posts got a new reference for nothing 🐛");

// The bailout — the best argument for Immer:
assert(Object.is(appState, unchanged),
  "a recipe that changes nothing returns the ORIGINAL — React's bailout fires. " +
  "A hand-written spread would have made a new object regardless.");

// The traps:
assert(trap1Error.includes("returned a new value"), "mutate AND return throws");
assert(trap2.count === 0,
  "reassigning the draft parameter does NOTHING — silently 🐛");

// Auto-freeze:
assert(Object.isFrozen(frozen), "the result is deeply frozen in dev");
assert(frozen.user.name === "Ankit",
  "and mutating it does not take effect — the bug is caught AT the mutation");

// Arrays work the same way:
const list = { todos: [{ id: 1, done: false }, { id: 2, done: false }] };
const toggled = produce(list, (d) => { d.todos[0].done = true; });
assert(toggled.todos[0].done === true, "array element updated");
assert(list.todos[0].done === false, "original untouched");
assert(Object.is(list.todos[1], toggled.todos[1]),
  "the UNCHANGED todo kept its identity — its memoized row will not re-render");
assert(!Object.is(list.todos, toggled.todos), "...while the array itself is new");

console.log("§11 — mini assertions passed for: Immer");
console.log("\n  The one that wins interviews: a recipe that changes nothing");
console.log("  returns the ORIGINAL object. Immer is more precise about");
console.log("  structural sharing than the code you would have written by hand.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is Immer / how does it work?", answer:
//
//   "produce(state, draft => { draft.a.b.c = 1 }) returns a new state and
//    leaves the original untouched. The draft is a Proxy: reads pass through
//    to the base object, and the first WRITE to a node triggers a shallow copy
//    of that node and marks the path to the root as modified. At the end Immer
//    builds the result from the copies on the changed path and the ORIGINAL
//    references everywhere else. Copy-on-write.
//
//    The obvious reason to use it is that hand-written nested updates are five
//    spreads for one boolean, and missing one is a silent mutation bug buried
//    five levels down.
//
//    But the better argument is that Immer does structural sharing BETTER than
//    a human. Change a notification setting and your posts array is the exact
//    same object in memory — so memoized components reading it don't re-render.
//    Compare structuredClone, which people reach for as the 'obviously safe'
//    option: it's a correct deep copy that gives everything a new reference, so
//    every memo in the subtree fires. And if a recipe changes NOTHING, Immer
//    returns the original object, so React's Object.is bailout fires — where a
//    hand-written { ...state } always makes a new object regardless.
//
//    It's not magic though. Mutating AND returning throws, because Immer can't
//    know which you meant. Reassigning the draft parameter — draft = {...} —
//    silently does nothing, because you rebound a local name and the Proxy
//    never saw a set. And a draft is only alive inside the recipe; real Immer
//    revokes the proxies afterwards, which is also why a recipe can't be async.
//
//    The feature people miss is auto-freeze: Immer deep-freezes the result in
//    dev, so mutating it throws AT the mutation instead of surfacing three
//    renders later as 'a component didn't update'. That's the hardest React bug
//    to diagnose, and auto-freeze makes it impossible.
//
//    You already use it — RTK bundles it, so createSlice's state.value += 1 IS
//    produce. The one caveat I'd add: Immer makes deeply nested state
//    comfortable, and comfortable isn't good. If you're five levels deep, the
//    real fix is normalizing."
//
// The bailout point and "Immer fixes the symptom, normalizing fixes the cause"
// are the senior markers.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How does Immer work?
// A1. The draft is a Proxy. Reads pass through; the first write copies that
//     node and marks the path modified. Copy-on-write, then finalize.
//
// Q2. Is it a deep clone?
// A2. The opposite. It copies as little as possible — only the path you
//     touched. Untouched branches keep their references.
//
// Q3. Why is that better than structuredClone?
// A3. structuredClone gives everything a new reference, so every memoized
//     component in the subtree re-renders. Immer preserves structural sharing.
//
// Q4. What if the recipe changes nothing?
// A4. You get the ORIGINAL object back, so React bails out. A hand-written
//     spread would have created a new object.
//
// Q5. Why can't you mutate AND return?
// A5. Immer cannot know which you meant, so it throws rather than guess.
//
// Q6. Why does reassigning the draft do nothing?
// A6. It is a function parameter. You rebound a local name; the Proxy's set
//     trap never fired.
//
// Q7. Can a recipe be async?
// A7. No — the draft is revoked when produce returns, which is the first
//     await. Use createDraft/finishDraft.
//
// Q8. What is auto-freeze?
// A8. Immer deep-freezes results in dev, so mutating the result throws at the
//     mutation instead of appearing as a missing re-render later.
//
// Q9. What are patches?
// A9. produceWithPatches returns JSON-patch operations, forward and inverse —
//     which gives you undo/redo nearly free, and lets you sync state by
//     sending patches instead of snapshots.
//
// Q10. When would you NOT use it?
// A10. Very large state on hot paths (proxy overhead), trivial shallow
//      updates, and when the real problem is that your state needs normalizing.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is Immer?
//   Back : Mutate a draft, get a new immutable object.
//
// Flashcard 2:
//   Front: How?
//   Back : A Proxy. Copy-on-write on the first write; the path is marked modified.
//
// Flashcard 3:
//   Front: Is it a deep clone?
//   Back : No — the opposite. It copies only the path you touched.
//
// Flashcard 4:
//   Front: What if you change nothing?
//   Back : You get the ORIGINAL back. React's bailout fires.
//
// Flashcard 5:
//   Front: What is the most common trap?
//   Back : Mutate AND return → throws. Reassign the draft → silent no-op.
//
// Flashcard 6:
//   Front: What is auto-freeze?
//   Back : Deep-freezes the result in dev, catching mutations AT the mutation.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Immer shares better than a human. And it fixes the SYMPTOM of deep
//          nesting — normalizing fixes the cause.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write produce() from memory. The two ideas: copy-on-write in the set trap,
//   and mark the path to the root as modified.
//
// Task 2:
//   Add Proxy.revocable and revoke on finalize. Now trap 3 throws like real
//   Immer.
//
// Task 3:
//   Add auto-freeze, skipping already-frozen branches. Confirm the second
//   produce() on the same state is cheaper.
//
// Task 4:
//   Implement produceWithPatches: record every set as { op, path, value } plus
//   its inverse. You now have undo/redo in ten lines.
//
// Task 5:
//   Measure it: 100k-node state, 1000 updates, with and without Immer. Find
//   the point where the overhead is real.
//
// Task 6:
//   Explain in 60 seconds why Immer is NOT a deep clone, to someone about to
//   use structuredClone for every state update.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Mutate a draft Proxy, get a new object. Copy-on-write — only the path you
//   touched is copied.
//
// If you remember the common bug:
//   Mutate AND return throws. Reassigning the draft silently does nothing.
//
// If you remember the professional framing:
//   Immer shares structure better than hand-written spreads, and returns the
//   ORIGINAL when nothing changed. But it makes deep nesting comfortable —
//   normalizing is the real fix.
//
// NEXT TOPIC -> 15_state-machines-xstate-intro.js
