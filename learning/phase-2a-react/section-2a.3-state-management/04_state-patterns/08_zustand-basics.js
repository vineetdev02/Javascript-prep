// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  08_zustand-basics.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Zustand basics
//
// WHAT YOU WILL MASTER HERE:
//   1. Build Zustand — the core is ~30 lines
//   2. Selectors: why 1 component re-renders where Context re-rendered 21
//   3. The selector trap: returning an object → infinite re-renders
//   4. No Provider — why that works, and what it costs
//   5. Zustand vs Redux vs Context: the honest table
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/08_zustand-basics.js"
//
// Prerequisites: 03_context-api-provider-pattern.js (the 21→1 problem),
// 02_built-in-hooks/14_usesyncexternalstore.js (what Zustand is built on).


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Zustand:
// A store outside React that components subscribe to with a SELECTOR — so
// each component re-renders only when the slice it selected changes.
//
// If interviewer says "explain it simply", say:
// "You create a store with a function, and components call it as a hook with
//  a selector: useStore(s => s.count). No Provider, no reducers, no actions.
//  The selector decides who re-renders."
//
// If interviewer asks "why does it matter?", say:
// "Because it is the smallest thing that fixes Context's actual problem.
//  Context has no selectors, so every consumer re-renders on every change.
//  Zustand's whole API is 'here is a selector' — and it is built on
//  useSyncExternalStore, so it does not tear either."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   a store outside React + a selector per component
//
// The whole API:
//
//   const useStore = create((set, get) => ({
//     count: 0,
//     increment: () => set(s => ({ count: s.count + 1 })),
//     reset: () => set({ count: 0 }),
//     double: () => set({ count: get().count * 2 }),
//   }));
//
//   function Counter() {
//     const count = useStore(s => s.count);          // ← the selector
//     const increment = useStore(s => s.increment);  // ← stable, never changes
//     return <button onClick={increment}>{count}</button>;
//   }
//
// Note what is NOT there: a Provider, action types, reducers, dispatch,
// combineReducers, a store file, a slice file. State and the functions that
// change it live in one object.
//
// Runtime rule:
//   `set` does a SHALLOW MERGE by default (like class setState, unlike
//   useState). set({ count: 1 }) keeps your other keys.
//
// The mechanism:
//   The store lives outside React. Each component subscribes with its
//   selector. On every set(), Zustand runs every subscriber's selector and
//   compares the result with Object.is. Different? Re-render that one
//   component. Same? Skip it.
//
// Practical rule:
//   Select the narrowest thing you need. useStore(s => s.count), never
//   useStore(s => s).
//
// Common trap:
//   useStore(s => ({ a: s.a, b: s.b })) — a new object every call, so
//   Object.is is always false, so it re-renders on EVERY store change. And
//   in React 18 that is an infinite loop, not just a slow one. → §5


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD ZUSTAND
// ══════════════════════════════════════════════════════════════════

function createStore(createState) {
  let state;
  const listeners = new Set();

  const setState = (partial, replace) => {
    const nextPartial = typeof partial === "function" ? partial(state) : partial;

    // Object.is bailout — if nothing changed, do not notify at all.
    if (Object.is(nextPartial, state)) return;

    const previousState = state;
    // ← SHALLOW MERGE by default. This is the class-setState behaviour, and
    //   it is why you rarely spread in Zustand.
    state = replace ? nextPartial : Object.assign({}, state, nextPartial);

    listeners.forEach(listener => listener(state, previousState));
  };

  const getState = () => state;

  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  // `set` and `get` are handed to your creator function:
  state = createState(setState, getState);

  return { setState, getState, subscribe, listenerCount: () => listeners.size };
}

// The React binding. In real Zustand this is useSyncExternalStore.
function createReactStore(createState) {
  const store = createStore(createState);

  // useStore(selector) — the hook.
  function useStore(selector = (s) => s, equalityFn = Object.is) {
    // In a real hook this is useSyncExternalStore(subscribe, () =>
    // selector(getState())). Here we model the SUBSCRIPTION logic, which is
    // where all the interesting behaviour lives.
    return selector(store.getState());
  }

  // Model a mounted component: a selector + a render counter.
  useStore.mountComponent = (name, selector, equalityFn = Object.is) => {
    const component = { name, selector, renders: 0, lastValue: undefined };
    component.lastValue = selector(store.getState());
    component.renders = 1;                            // the mount render

    store.subscribe((newState) => {
      const nextValue = component.selector(newState);
      // ← THE ENTIRE PERFORMANCE STORY: compare the SELECTED value.
      if (!equalityFn(nextValue, component.lastValue)) {
        component.lastValue = nextValue;
        component.renders++;
      }
    });
    return component;
  };

  useStore.getState = store.getState;
  useStore.setState = store.setState;
  useStore.subscribe = store.subscribe;
  return useStore;
}

const create = createReactStore;


// ══════════════════════════════════════════════════════════════════
// § 4 — THE WHOLE API
// ══════════════════════════════════════════════════════════════════

console.log("§4 — a store, in one call:\n");

const useCounterStore = create((set, get) => ({
  count: 0,
  name: "counter",
  increment: () => set((s) => ({ count: s.count + 1 })),
  addBy: (n) => set((s) => ({ count: s.count + n })),
  double: () => set({ count: get().count * 2 }),      // ← `get` reads the store
  reset: () => set({ count: 0 }),
}));

console.log("  create((set, get) => ({ count: 0, increment: () => ... }))\n");
console.log("    initial   :", JSON.stringify(useCounterStore.getState().count));
useCounterStore.getState().increment();
console.log("    increment():", useCounterStore.getState().count);
useCounterStore.getState().addBy(10);
console.log("    addBy(10) :", useCounterStore.getState().count);
useCounterStore.getState().double();
console.log("    double()  :", useCounterStore.getState().count);

console.log("\n  Note what is missing: no Provider, no action types, no reducer,");
console.log("  no dispatch, no slice file, no store file. State and the actions");
console.log("  that change it are in ONE object.\n");

// The shallow merge — a real difference from useState:
useCounterStore.setState({ count: 99 });
console.log("  set({ count: 99 }) →", JSON.stringify(useCounterStore.getState().name),
  "← `name` survived");
console.log("  `set` SHALLOW MERGES, like class setState — NOT like useState,");
console.log("  which replaces. This is why you rarely spread in Zustand.");
console.log("  → 01_react-fundamentals/09_component-types-class-vs-func.js §6\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — SELECTORS: THE WHOLE POINT
// ══════════════════════════════════════════════════════════════════

console.log("§5 — selectors: 21 renders → 1:\n");

const useTodoStore = create((set) => ({
  todos: [],
  filter: "all",
  addTodo: (text) => set((s) => ({ todos: [...s.todos, text] })),
  setFilter: (filter) => set({ filter }),
}));

// The same shape as the Context demo: 1 display, 20 buttons.
const display = useTodoStore.mountComponent("TodoList", (s) => s.todos);
const buttons = Array.from({ length: 20 }, (_, i) =>
  useTodoStore.mountComponent("AddButton" + i, (s) => s.addTodo)   // ← the ACTION
);

const beforeRenders = display.renders + buttons.reduce((a, b) => a + b.renders, 0);
useTodoStore.getState().addTodo("Learn Zustand");
const afterRenders = display.renders + buttons.reduce((a, b) => a + b.renders, 0);

console.log("  1 TodoList selects s.todos; 20 buttons select s.addTodo.");
console.log("  addTodo() is called:\n");
console.log("    TodoList renders:", display.renders, "← selected todos, which changed ✅");
console.log("    buttons rendered:", buttons.filter(b => b.renders > 1).length, "of 20",
  "← selected addTodo, which did NOT change ✅");
console.log("    total re-renders:", afterRenders - beforeRenders);

console.log("\n  Compare Context with the same shape: 21 re-renders.");
console.log("  → 03_context-api-provider-pattern.js §5");
console.log("\n  WHY: on every set(), Zustand runs each subscriber's selector and");
console.log("  compares the RESULT with Object.is. The buttons selected");
console.log("  `s.addTodo` — a function defined once in the creator, so its");
console.log("  identity never changes. Same value → skip.");
console.log("\n  That is the whole difference from Context, and it is the entire");
console.log("  reason Zustand exists. Context has no way to ask 'which part did");
console.log("  you read?'. Zustand's API is nothing BUT that question.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE SELECTOR TRAP
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the object selector: an infinite loop:\n");

const useUserStore = create((set) => ({
  firstName: "Vineet",
  lastName: "B",
  age: 25,
  birthday: () => set((s) => ({ age: s.age + 1 })),
}));

// ❌ a new object EVERY call
const badSelector = (s) => ({ first: s.firstName, last: s.lastName });
const a = badSelector(useUserStore.getState());
const b = badSelector(useUserStore.getState());       // the SAME state!

// ✅ two narrow selectors
const goodFirst = (s) => s.firstName;
const goodLast = (s) => s.lastName;

console.log("  useStore(s => ({ first: s.firstName, last: s.lastName }))");
console.log("    two calls, unchanged state → same result?", Object.is(a, b));
console.log("    🐛 a NEW object every call. Object.is is ALWAYS false, so this");
console.log("       component re-renders on EVERY store change — even changes to");
console.log("       `age`, which it does not read.");
console.log("\n    Worse: in React 18 useSyncExternalStore calls getSnapshot to");
console.log("    CHECK for changes, gets a new object, concludes 'it changed',");
console.log("    re-renders, checks again... That is not slow. That is");
console.log("    'The result of getSnapshot should be cached' — an infinite loop.");
console.log("    → 02_built-in-hooks/14_usesyncexternalstore.js §6");

console.log("\n  ✅ FIX 1 — two narrow selectors (the idiomatic answer):");
console.log("       const first = useStore(s => s.firstName);");
console.log("       const last  = useStore(s => s.lastName);");
console.log("     two calls, unchanged state → same result?",
  Object.is(goodFirst(useUserStore.getState()), goodFirst(useUserStore.getState())),
  "✅ primitives compare by VALUE");

// FIX 2 — useShallow
function shallow(objA, objB) {
  if (Object.is(objA, objB)) return true;
  if (typeof objA !== "object" || typeof objB !== "object" || !objA || !objB) return false;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;
  return keysA.every(k => Object.is(objA[k], objB[k]));
}

console.log("\n  ✅ FIX 2 — useShallow(s => ({ ... })) when you genuinely need many:");
console.log("       const { first, last } = useStore(useShallow(s => ({...})));");
console.log("     shallow(a, b) →", shallow(a, b),
  "✅ compares the VALUES, not the reference");

// Prove useShallow prevents the unrelated re-render:
const shallowComp = useUserStore.mountComponent("Name", badSelector, shallow);
const beforeAge = shallowComp.renders;
useUserStore.getState().birthday();               // `age` changed — not the name
console.log("\n    with useShallow, `age` changes → Name re-rendered?",
  shallowComp.renders > beforeAge, "✅ correctly skipped");

console.log("\n  This is the same referential-equality rule as useEffect deps,");
console.log("  React.memo props, and getSnapshot. One rule, four places.");
console.log("  Learn it once. → 02_built-in-hooks/07_usememo-when-to-use.js\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — NO PROVIDER
// ══════════════════════════════════════════════════════════════════
//
// Zustand's most visible difference, and it is a real trade.
//
//   Redux:    <Provider store={store}><App /></Provider>
//   Context:  <AuthProvider><App /></AuthProvider>
//   Zustand:  ...nothing. Import the hook. Use it.
//
// WHY IT WORKS:
//   The store is a module-level object. It exists on import. React does not
//   need to know about it — components just subscribe. That is exactly what
//   useSyncExternalStore was built for: an external store React can read
//   safely under concurrent rendering.
//
// WHAT IT BUYS:
//   ✅ no provider hell → 03_context-api-provider-pattern.js §6
//   ✅ read/write from OUTSIDE React — an event handler in a non-React file,
//      a websocket callback, a test. useCounterStore.getState().increment()
//      works anywhere.
//   ✅ trivial code splitting: import the store where you need it
//   ✅ no re-render from a Provider's parent
//
// WHAT IT COSTS — say this, it is the honest half:
//   ❌ It is a MODULE SINGLETON. One store per import, for the whole process.
//   ❌ SSR: a singleton is shared across REQUESTS on the server. User A's
//      state can leak into User B's render. This is a real, serious bug, and
//      the fix is the thing Zustand supposedly removed — a Provider.
//      Zustand's own docs recommend createStore + a Context Provider for SSR.
//   ❌ Testing: the store persists between tests. You need an explicit reset.
//   ❌ You cannot render two independent instances of a feature.
//
// The nuance worth stating:
//   "No Provider" is not free — it is a trade of isolation for convenience.
//   For a client-side SPA it is almost always right. For SSR, Zustand tells
//   you to add the Provider back.

console.log("§7 — no Provider: what it buys and costs:\n");

console.log("  read/write from outside React:");
console.log("    useCounterStore.getState().increment()  ← in a websocket handler");
useCounterStore.setState({ count: 0 });
useCounterStore.getState().increment();
console.log("    count is now:", useCounterStore.getState().count, "✅ no component involved");

console.log("\n  ...but it is a MODULE SINGLETON:");
const testA = useCounterStore.getState().count;
useCounterStore.getState().increment();
const testB = useCounterStore.getState().count;
console.log(`    'test A' left count at ${testA}; 'test B' sees ${testB} 🐛`);
console.log("    State persists between tests. And on a server, between");
console.log("    REQUESTS — user A's data can leak into user B's render.");
console.log("    That is why Zustand's docs recommend createStore + a Context");
console.log("    Provider for SSR: the Provider you thought you escaped.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE HONEST COMPARISON
// ══════════════════════════════════════════════════════════════════

console.log("§8 — Zustand vs Redux vs Context:\n");

const table = [
  ["boilerplate", "one create() call", "slice + store", "provider + hook"],
  ["selectors", "✅ built in", "✅ useSelector", "❌ none"],
  ["Provider", "❌ not needed", "✅ required", "✅ required"],
  ["bundle", "~1kB", "~13kB (RTK)", "0 (built in)"],
  ["devtools", "✅ via middleware", "✅ best in class", "❌"],
  ["middleware", "✅ persist, immer", "✅ rich ecosystem", "❌"],
  ["outside React", "✅ trivially", "✅ store.dispatch", "❌ impossible"],
  ["SSR", "⚠️  needs a Provider", "✅ per-request store", "✅ natural"],
  ["conventions", "⚠️  you decide", "✅ enforced", "n/a"],
];

console.log("  aspect         | Zustand           | Redux (RTK)      | Context");
console.log("  ---------------|-------------------|------------------|----------------");
for (const [aspect, z, r, c] of table) {
  console.log(`  ${aspect.padEnd(14)} | ${z.padEnd(17)} | ${r.padEnd(16)} | ${c}`);
}

console.log("\n  The 'conventions' row is the real trade, and nobody mentions it:");
console.log("  Redux's ceremony IS its value at scale. Every change is a named");
console.log("  action in a devtools log. Zustand lets any component call");
console.log("  set() however it likes — which is liberating at 5 components and");
console.log("  a mess at 50, because there is no vocabulary for what happened.");
console.log("\n  My honest ranking for a new project:");
console.log("    server data          → React Query. Not any of these.");
console.log("    a little client state → useState + lifting");
console.log("    ambient values        → Context (theme, locale, user)");
console.log("    real client state     → Zustand. It is the 90% answer.");
console.log("    a big team, complex   → RTK. The conventions pay for");
console.log("      domain, audit trail   themselves once there are enough people.");
console.log("\n  The single most useful thing to say: most 'we need a state");
console.log("  library' conversations are really 'we are caching server data by");
console.log("  hand'. Remove the server data first and see what is left. Usually");
console.log("  it is a theme and a modal. → 10_react-query-usequery-usemutation.js\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL ZUSTAND DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real Zustand
//   ───────────               ────────────
//   selector called manually  useSyncExternalStore(subscribe,
//                             () => selector(getState())) — so it cannot tear
//                             under concurrent rendering
//   n/a                       middleware: persist (localStorage), devtools
//                             (Redux devtools!), immer (mutate the draft),
//                             subscribeWithSelector
//   n/a                       useShallow / createWithEqualityFn for the §6 fix
//   n/a                       slices pattern: compose several creators into
//                             one store, which is how it scales
//   n/a                       createStore + Provider for SSR/per-request stores
//
// The devtools middleware is worth naming: Zustand can plug into the REDUX
// devtools. So the "no devtools" criticism is outdated — though you only get
// an action log if you name your actions, which Zustand does not force.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "The result of getSnapshot should be cached": an infinite loop.
//   An object selector. → §6. THE Zustand bug.
//
// Bug 2 — A component re-renders on every store change:
//   useStore(s => s) — selecting everything. Select narrowly.
//
// Bug 3 — State leaks between tests:
//   A module singleton. → §7. Reset in beforeEach.
//
// Bug 4 — SSR: one user sees another user's data:
//   The same singleton, shared across requests. Serious. Use a per-request
//   store with a Provider.
//
// Bug 5 — set() replaced your state:
//   set(x, true) replaces. Without the flag it merges. Know which you want.
//
// Bug 6 — No idea what changed:
//   No action names. The devtools middleware helps, but only if you label
//   your set() calls: set(partial, false, "cart/addItem").
//
// Bug 7 — Server data in the store:
//   You are hand-rolling a cache again. → file 10.
//
// Bug 8 — Actions selected as objects:
//   useStore(s => ({ add: s.add, remove: s.remove })) — same object trap.
//   Select them individually, or use useShallow.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The API:
const s = create((set, get) => ({
  count: 0,
  name: "test",
  inc: () => set((st) => ({ count: st.count + 1 })),
  double: () => set({ count: get().count * 2 }),
}));
s.getState().inc();
assert(s.getState().count === 1, "set with an updater works");
s.getState().double();
assert(s.getState().count === 2, "`get` reads the current state inside an action");
s.setState({ count: 10 });
assert(s.getState().name === "test",
  "set SHALLOW MERGES — unlike useState, which replaces");

// Selectors — the headline:
assert(display.renders === 2, "the TodoList selected todos, which changed → re-render");
assert(buttons.every(b => b.renders === 1),
  "all 20 buttons selected s.addTodo — a stable function → ZERO re-renders");
assert(afterRenders - beforeRenders === 1,
  "ONE re-render across 21 components. Context's number was 21.");

// The selector trap:
assert(Object.is(a, b) === false,
  "an object selector returns a new reference every call → always 'changed' 🐛");
assert(Object.is(goodFirst(useUserStore.getState()), goodFirst(useUserStore.getState())),
  "a primitive selector is stable by VALUE ✅");
assert(shallow(a, b) === true, "useShallow compares the values, so it is stable");
assert(shallowComp.renders === 1,
  "with useShallow, an unrelated `age` change did NOT re-render the name ✅");

// The singleton:
assert(testB > testA,
  "the store is a MODULE SINGLETON — state persists across 'tests' 🐛");

console.log("§11 — mini assertions passed for: Zustand");
console.log("\n  The number that matters: ONE re-render across 21 components,");
console.log("  where Context needed 21. That gap is selectors, and selectors");
console.log("  are the whole reason this library exists.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is Zustand / why use it over Context?", answer:
//
//   "It's a store that lives outside React, and components subscribe with a
//    selector: useStore(s => s.count). That selector is the whole product.
//
//    The problem it solves is Context's actual weakness. Context has no way to
//    ask 'which part did you read', so every consumer re-renders on every
//    change. In a todo app with one list and twenty action buttons, Context is
//    21 re-renders per change and Zustand is 1 — because the buttons select
//    s.addTodo, a function whose identity never changes, so Object.is says
//    nothing changed and they skip.
//
//    Under the hood it's useSyncExternalStore, which is also why it can't tear
//    under concurrent rendering.
//
//    The classic bug is selecting an object: useStore(s => ({ a: s.a, b: s.b }))
//    returns a new reference every call, so it's always 'changed' — and in
//    React 18 that's an infinite loop, not just a slow render, because
//    getSnapshot must be stable. Fix it with narrow selectors or useShallow.
//    It's the same referential-equality rule as useEffect deps and React.memo.
//
//    On 'no Provider': it works because the store is a module singleton, and
//    that buys real things — no provider hell, and you can read or write from
//    outside React entirely, like a websocket handler. But it's a trade, not a
//    free win. A singleton is shared across REQUESTS on a server, so user A's
//    state can leak into user B's render. Zustand's own docs tell you to add a
//    Context Provider back for SSR. It also persists between tests.
//
//    Versus Redux: Zustand is 1kB against 13, and no ceremony. But Redux's
//    ceremony IS the value at scale — every change is a named action in a
//    devtools log. Zustand lets any component call set() however it likes,
//    which is liberating at 5 components and a mess at 50.
//
//    Honestly though, most 'we need a state library' conversations are really
//    'we're caching server data by hand'. I'd remove the server data with React
//    Query first and see what's left — usually a theme and a modal."
//
// The 21→1 number, the SSR singleton honesty, and "remove the server data
// first" are the senior markers.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does Zustand do that Context cannot?
// A1. Selectors. Each component re-renders only when its selected slice
//     changes. Context re-renders every consumer.
//
// Q2. How does it work without a Provider?
// A2. The store is a module-level object outside React. Components subscribe
//     via useSyncExternalStore.
//
// Q3. What is the most common Zustand bug?
// A3. An object selector — a new reference every call, so it always looks
//     changed. In React 18 that is an infinite loop.
//
// Q4. Does set() merge or replace?
// A4. Shallow merge by default, like class setState. set(x, true) replaces.
//
// Q5. What does "no Provider" cost?
// A5. It is a singleton — shared across server requests (a real data-leak
//     bug), persists between tests, and cannot have two instances.
//
// Q6. How do you handle SSR?
// A6. createStore per request plus a Context Provider — the Provider you
//     thought you had escaped. Zustand's docs say so.
//
// Q7. Zustand or Redux?
// A7. Zustand for most client state — 1kB, no ceremony. RTK when the
//     conventions pay: a big team, a complex domain, an audit trail.
//
// Q8. Can you use it outside React?
// A8. Yes — getState/setState work anywhere. That is a genuine advantage.
//
// Q9. Does it have devtools?
// A9. Yes, via middleware, plugging into the Redux devtools. But you only get
//     a useful action log if you name your set() calls.
//
// Q10. When would you use none of these?
// A10. When it is server data. React Query. Most state-library debates
//      dissolve once you remove it.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is Zustand?
//   Back : A store outside React + a selector per component.
//
// Flashcard 2:
//   Front: What does it fix?
//   Back : Context's missing selectors. 21 re-renders → 1.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : An object selector → new reference → infinite loop in React 18.
//
// Flashcard 4:
//   Front: Does set() merge?
//   Back : Yes, shallow — like class setState, not useState.
//
// Flashcard 5:
//   Front: What does "no Provider" cost?
//   Back : A module singleton. SSR leaks state between requests.
//
// Flashcard 6:
//   Front: What is it built on?
//   Back : useSyncExternalStore. So it cannot tear.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Name the SSR singleton problem, and "remove the server data first."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write create() from memory. The core: a Set of listeners, a shallow-merge
//   set, and a selector comparison.
//
// Task 2:
//   Add useShallow properly and prove it stops the unrelated re-render.
//
// Task 3:
//   Reproduce the infinite loop: implement the store with a real
//   useSyncExternalStore and an object selector. Watch getSnapshot fight itself.
//
// Task 4:
//   Add the devtools middleware shape: set(partial, replace, actionName).
//   Now you have an action log — and you have re-invented the one thing Redux
//   was giving you for free.
//
// Task 5:
//   Build the SSR leak: one module store, two "requests" with different users.
//   Watch user A's data appear in user B's render. Then fix it with a Provider.
//
// Task 6:
//   Explain in 60 seconds why 20 buttons do not re-render when the todos
//   change, to someone coming from Context.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   A store outside React + selectors. That is Context's missing feature, and
//   it is the whole library.
//
// If you remember the common bug:
//   An object selector returns a new reference every call — an infinite loop
//   in React 18. Select narrowly or use useShallow.
//
// If you remember the professional framing:
//   "No Provider" means a module singleton, which leaks across SSR requests.
//   And most state-library debates are really about server data.
//
// NEXT TOPIC -> 09_jotai-recoil-atoms.js
