// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  06_observer-pattern.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Observer Pattern
//
// WHAT YOU WILL MASTER HERE:
//   1. The whole pattern in 15 lines, written from scratch
//   2. Why subscribe MUST return unsubscribe — and the leak when it does not
//   3. Mutation during notification: the bug that skips a listener silently
//   4. useSyncExternalStore — React's official observer bridge
//   5. Why an uncached getSnapshot causes an infinite render loop — PROVEN
//   6. Observer + selector: the thing context structurally cannot do
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/06_observer-pattern.js"
//
// Prerequisites: 02_built-in-hooks/14_usesyncexternalstore.js,
// 05_provider-pattern.js §9, and 04_state-patterns/08_zustand-basics.js.
//
// 05 ended at context's ceiling: a broadcast with no filter. This file is the
// machine on the other side of that ceiling. Every store you have ever used —
// Redux, Zustand, Jotai, RxJS, addEventListener, ResizeObserver — is this one
// pattern with a different name on the box.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Observer Pattern:
// A SUBJECT keeps a list of OBSERVERS and notifies all of them when its state
// changes — without knowing anything about what they are or what they do.
//
//   const unsubscribe = store.subscribe(listener);   // register
//   store.setState(next);                            // notify everyone
//   unsubscribe();                                   // deregister
//
// If interviewer says "explain it simply", say:
// "It's a mailing list. The subject doesn't know who's on it or what they do
//  with the mail — it just calls everyone when something changes. And every
//  subscribe has to hand back a way to unsubscribe, because the list outlives
//  the things on it."
//
// If interviewer asks "why does it matter?", say:
// "Because it's the only way to have state that lives OUTSIDE React and still
//  keeps React in sync. Context is a broadcast to everything below a provider;
//  an observable store is a subscription with a filter, so one component can
//  wake on one field while the rest sleep. React ships a hook specifically for
//  this — useSyncExternalStore — and every third-party store library is built
//  on it."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   PUSH, DON'T POLL. And: SUBSCRIBE RETURNS UNSUBSCRIBE.
//
// Runtime rule:
//   The subject owns an array (or Set) of callbacks. notify() iterates it and
//   calls each one. That is the entire mechanism — everything else in every
//   store library is caching, batching, selectors and devtools on top.
//
// Practical rule:
//   Use it when N unknown things must react to one change, and N changes at
//   runtime. If N is one and known, just call the function.
//
// Common trap:
//   Two, and they are both in this file. (a) subscribing without unsubscribing
//   — the listener holds the component's closure alive forever. (b) mutating
//   the listener list DURING notification — a listener that unsubscribes
//   itself makes the loop skip the next one, silently.
//
// The mental picture:
//
//   polling                      observing
//   ───────                      ─────────
//   setInterval, check, repeat   subject calls you
//   work when nothing changed    work only on change
//   latency = interval           latency = 0
//   no cleanup needed            cleanup is MANDATORY


// ══════════════════════════════════════════════════════════════════
// § 3 — THE WHOLE PATTERN, FROM SCRATCH
// ══════════════════════════════════════════════════════════════════

console.log("§3 — a store in 15 lines:\n");

function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,
    setState(partial) {
      state = { ...state, ...partial };
      // Copy before iterating. §5 is the reason this line is not optional.
      for (const listener of [...listeners]) listener(state);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);   // ← the contract
    },
    size: () => listeners.size,
  };
}

const store = createStore({ count: 0, user: "Vineet" });
const received = { a: [], b: [], c: [] };

const offA = store.subscribe(s => received.a.push(s.count));
const offB = store.subscribe(s => received.b.push(s.count));
const offC = store.subscribe(s => received.c.push(s.count));

store.setState({ count: 1 });
store.setState({ count: 2 });
offB();                                  // B leaves the list
store.setState({ count: 3 });

console.log("    listeners after 3 subscribes:", 3);
console.log("    A received:", JSON.stringify(received.a));
console.log("    B received:", JSON.stringify(received.b), "← unsubscribed before count=3");
console.log("    C received:", JSON.stringify(received.c));
console.log("    listeners now:", store.size());
console.log("\n  That is the pattern, complete. Redux's store is this plus a reducer");
console.log("  and middleware. Zustand is this plus selectors and a hook. RxJS is");
console.log("  this plus 200 operators. The core never changes.\n");

offA(); offC();


// ══════════════════════════════════════════════════════════════════
// § 4 — THE LEAK: SUBSCRIBE WITHOUT UNSUBSCRIBE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — what a missing cleanup costs:\n");

// ❌  useEffect(() => { store.subscribe(update); }, []);          // no return
// ✅  useEffect(() => store.subscribe(update), []);               // returns unsubscribe
//
// The listener is a closure. It holds the component's props, state, and every
// DOM node those reference. The store holds the listener. So the store holds
// the component — forever, across every mount and unmount.

const leaky = createStore({ v: 0 });
const clean = createStore({ v: 0 });

const leakedWrites = [];
const cleanWrites = [];

for (let mount = 1; mount <= 5; mount++) {
  // a component mounts, subscribes, and unmounts — five navigations
  leaky.subscribe(() => leakedWrites.push(mount));            // 🐛 never removed
  const off = clean.subscribe(() => cleanWrites.push(mount)); // ✅
  off();                                                      // ...on unmount
}
// The 5th component is the only one still on screen. Both stores update once:
leaky.setState({ v: 1 });
clean.subscribe(() => cleanWrites.push(5));                   // the live one resubscribes
clean.setState({ v: 1 });

console.log("    5 mount/unmount cycles, then ONE state change:");
console.log("      no cleanup → listeners:", leaky.size(), " callbacks fired:", leakedWrites.length, "🐛");
console.log("      cleanup    → listeners:", clean.size(), " callbacks fired:", cleanWrites.filter(m => m === 5).length, "✅");
console.log("      dead components written to:", leakedWrites.length - 1);

console.log("\n  Three consequences, in the order you meet them:");
console.log("    1. 'Cannot update a component that is not mounted' warnings");
console.log("    2. the work multiplies — navigate 20 times, every update runs 20×");
console.log("    3. the heap grows and never comes back down — on a long-lived SPA");
console.log("       this is the leak that actually shows up in a heap snapshot");
console.log("\n  The API design lesson: subscribe RETURNS unsubscribe, so that");
console.log("  `useEffect(() => store.subscribe(fn), [])` is correct by construction.");
console.log("  An API that returns nothing forces the caller to remember. Never");
console.log("  design one. → 02_built-in-hooks/03_useeffect-cleanup.js\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — MUTATION DURING NOTIFICATION
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the bug that skips a listener silently:\n");

// A listener that unsubscribes itself is completely normal — "notify me once",
// a modal closing on the first escape, an effect cleaning up in response to
// the very event it was waiting for. If notify() iterates the live collection,
// removing the current item shifts the next one into the slot you just left.

function naiveSubject() {
  const listeners = [];
  return {
    subscribe(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    notify(v) { for (let i = 0; i < listeners.length; i++) listeners[i](v); },  // 🐛 live array
  };
}

function safeSubject() {
  const listeners = new Set();
  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    notify(v) { for (const fn of [...listeners]) fn(v); },                       // ✅ snapshot
  };
}

function runSelfUnsubscribe(subject) {
  const calls = [];
  subject.subscribe(() => calls.push("first"));
  const offSecond = subject.subscribe(() => { calls.push("second"); offSecond(); });
  subject.subscribe(() => calls.push("third"));
  subject.notify(1);
  return calls;
}

const naiveCalls = runSelfUnsubscribe(naiveSubject());
const safeCalls = runSelfUnsubscribe(safeSubject());

console.log("    3 listeners; the middle one unsubscribes itself while running:");
console.log("      live-array iteration →", JSON.stringify(naiveCalls), "🐛 'third' never ran");
console.log("      snapshot iteration   →", JSON.stringify(safeCalls), "✅");

console.log("\n  Nothing throws. Nothing warns. A listener simply does not fire, once,");
console.log("  under a condition that only happens when a specific two components");
console.log("  are mounted together. This is the kind of bug that survives three");
console.log("  sprints and gets blamed on the network.");
console.log("\n  Two more re-entrancy questions every real store has to answer:");
console.log("    • a listener calls setState → do you notify recursively, or queue?");
console.log("      (Redux queues; a naive store recurses until the stack blows)");
console.log("    • a listener SUBSCRIBES a new listener → does the newcomer get");
console.log("      this notification? With a snapshot: no. That is the sane answer.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — REACT'S BRIDGE: useSyncExternalStore
// ══════════════════════════════════════════════════════════════════

console.log("§6 — plugging an observable into React:\n");

//   const value = useSyncExternalStore(
//     store.subscribe,     // (onStoreChange) => unsubscribe
//     store.getSnapshot,   // () => the current value, CACHED
//     store.getServerSnapshot   // optional, for SSR
//   );
//
// React calls subscribe once, and getSnapshot on every render AND after every
// notification. If the snapshot differs from the last one by Object.is, React
// re-renders the component.
//
// Which means: getSnapshot MUST return the same reference when nothing
// changed. If it builds a new object each call, React sees a change caused by
// its own read, re-renders, reads again, sees another change — forever.

function simulateReact(getSnapshot, maxRenders = 25) {
  let renders = 0;
  let last = Symbol("none");
  while (renders < maxRenders) {
    const snapshot = getSnapshot();
    renders++;
    if (Object.is(snapshot, last)) break;     // stable → React stops
    last = snapshot;
  }
  return renders;
}

const dataStore = createStore({ items: [1, 2, 3] });

// ❌ a new object on every call
const uncached = () => ({ items: dataStore.getState().items });
// ✅ the store's own state object, unchanged until setState replaces it
const cached = () => dataStore.getState();

const uncachedRenders = simulateReact(uncached);
const cachedRenders = simulateReact(cached);

console.log("    getSnapshot returning a NEW object each call → renders:", uncachedRenders, "🐛 (capped)");
console.log("    getSnapshot returning the SAME reference     → renders:", cachedRenders, "✅");
console.log("\n    React's actual message: \"The result of getSnapshot should be cached");
console.log("    to avoid an infinite loop\" — now you know exactly which loop.");

// The same trap wearing a selector costume:
//   ❌ useSyncExternalStore(sub, () => ({ x: state.x }))          // new object
//   ❌ useSelector(s => s.items.filter(i => i.done))               // new array
//   ✅ cache the derived value in the store, or compare with a custom equality
console.log("\n  The identical mistake in Redux is `useSelector(s => s.items.filter(…))`");
console.log("  — a new array every call, so the shallow check always says 'changed'.");
console.log("  It is one rule, in three libraries, wearing three costumes.");
console.log("  → 05_optimization-techniques/02_referential-equality-problem.js\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — OBSERVER + SELECTOR: WHAT CONTEXT CANNOT DO
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the filter on the subscription:\n");

// Context notifies EVERY consumer on every value change (05 §6). An observable
// store lets each subscriber declare what it cares about, and the store only
// re-renders the ones whose slice actually changed.

function createSelectorStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    getState: () => state,
    setState(partial) {
      const prev = state;
      state = { ...state, ...partial };
      for (const sub of [...subs]) {
        const before = sub.select(prev);
        const after = sub.select(state);
        if (!Object.is(before, after)) sub.onChange();    // ← the filter
      }
    },
    subscribe(select, onChange) {
      const sub = { select, onChange };
      subs.add(sub);
      return () => subs.delete(sub);
    },
  };
}

const appStore = createSelectorStore({ cart: 0, theme: "dark", user: "Vineet" });
const wakes = { cart: 0, theme: 0, user: 0 };

appStore.subscribe(s => s.cart, () => wakes.cart++);
appStore.subscribe(s => s.theme, () => wakes.theme++);
appStore.subscribe(s => s.user, () => wakes.user++);

for (let i = 1; i <= 20; i++) appStore.setState({ cart: i });

// The context equivalent: any change wakes all three consumers.
const contextWakes = 20 * 3;
const storeWakes = wakes.cart + wakes.theme + wakes.user;

console.log("    20 cart updates, 3 subscribers reading 3 different fields:");
console.log("      context (no selector) → wake-ups:", contextWakes, "🐛");
console.log("      store  (selector)     → wake-ups:", storeWakes,
  `(cart ${wakes.cart}, theme ${wakes.theme}, user ${wakes.user})`, "✅");
console.log("      wasted wake-ups avoided:", contextWakes - storeWakes);
console.log("\n  Those seven lines inside setState are the entire difference between");
console.log("  'context is my state manager' and 'I use Zustand'. The pattern is the");
console.log("  same; the store just compares the SLICE instead of the whole value.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — YOU ARE ALREADY USING IT, EVERYWHERE
// ══════════════════════════════════════════════════════════════════

console.log("§8 — the same shape, ten APIs:\n");

const inTheWild = [
  ["addEventListener / removeEventListener", "the DOM's observer, and the original one"],
  ["IntersectionObserver, ResizeObserver, MutationObserver", "the name is literal"],
  ["store.subscribe(listener)", "Redux — subscribe returns unsubscribe"],
  ["useSyncExternalStore(sub, snap)", "React's official bridge"],
  ["Zustand / Jotai / Valtio", "observer + selector, packaged"],
  ["RxJS Observable.subscribe()", "observer with operators and back-pressure"],
  ["WebSocket.onmessage / EventSource", "observer over the network"],
  ["matchMedia(q).addEventListener", "observing the viewport"],
  ["AbortController.signal", "observing a cancellation"],
  ["Node's EventEmitter.on/off", "the same object, server side"],
];
inTheWild.forEach(([api, note]) => console.log(`    ${api.padEnd(42)} ${note}`));

// Prove the DOM's version has the same signature as ours:
function domLike() {
  const handlers = new Set();
  return {
    addEventListener: fn => handlers.add(fn),
    removeEventListener: fn => handlers.delete(fn),
    dispatch: e => { for (const fn of [...handlers]) fn(e); },
    size: () => handlers.size,
  };
}
const target = domLike();
const seenEvents = [];
const handler = e => seenEvents.push(e);
target.addEventListener(handler);
target.dispatch("click");
target.removeEventListener(handler);
target.dispatch("click");

console.log("\n    addEventListener → dispatch → removeEventListener → dispatch");
console.log("      events received:", JSON.stringify(seenEvents), " listeners left:", target.size());
console.log("\n  Same three methods, same contract, same leak if you forget the third");
console.log("  one. Once you see it, useEffect's cleanup return stops being a React");
console.log("  rule and becomes the observer contract it always was.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — OBSERVER vs PUB/SUB vs SIGNALS
// ══════════════════════════════════════════════════════════════════
//
//   OBSERVER    subject holds the list. Direct. store.subscribe(fn).
//               Coupling: observers know the subject.
//
//   PUB/SUB     a BROKER sits in between. bus.emit("cart:add"),
//               bus.on("cart:add", fn). Publisher and subscriber never meet.
//               Better decoupling; worse traceability — you cannot find the
//               handlers by reading the emit site, which is why event buses
//               age badly in large front-ends.
//
//   SIGNALS     observers at the VALUE level, wired automatically. Reading a
//               signal during a computation subscribes that computation to it,
//               so only the exact expressions that read a value re-run — no
//               component re-render at all. Solid, Preact, Vue's ref, and
//               Angular signals all work this way.
//
// Where React sits: React deliberately re-renders the COMPONENT rather than
// tracking individual reads, and buys back the cost with memoization and the
// compiler. That is a real trade-off, and "why doesn't React use signals?" is
// a fair senior question — the answer is that whole-component re-render keeps
// the mental model "UI = f(state)" intact and makes concurrent rendering
// possible, at the price of doing more work per update.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Memory leak + "update on an unmounted component":
//   subscribe without unsubscribe. → §4.
//
// Bug 2 — A listener never fires, occasionally:
//   The list was mutated during notification. → §5.
//
// Bug 3 — "The result of getSnapshot should be cached to avoid an infinite loop":
//   getSnapshot builds a new object each call. → §6.
//
// Bug 4 — Everything re-renders on every store write:
//   No selector, or a selector returning a new object/array. → §6, §7.
//
// Bug 5 — Handlers fire in the wrong order after a refactor:
//   Code depending on subscription order. Order is an implementation detail;
//   if you need order, use priorities explicitly.
//
// Bug 6 — Stack overflow on a state change:
//   A listener writes to the store, which notifies the listener again. Queue
//   notifications, or guard with a "notifying" flag.
//
// Bug 7 — Server-rendered markup differs from the client:
//   No getServerSnapshot, so the store read something browser-only during SSR.
//   → 05_optimization-techniques/14_hydration-performance.js
//
// Bug 8 — Duplicate listeners:
//   subscribe called in a render instead of an effect, or in an effect with a
//   dependency that changes every render. The Set in §3 hides the first one;
//   an array does not.
//
// Bug 9 — Tearing under concurrent rendering:
//   Reading external state directly during render instead of through
//   useSyncExternalStore — two components in one paint see two values. That
//   hook exists precisely to prevent this.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The core:
assert(JSON.stringify(received.a) === "[1,2,3]", "A stayed subscribed for all three updates");
assert(JSON.stringify(received.b) === "[1,2]", "B unsubscribed and stopped receiving ✅");
assert(JSON.stringify(received.c) === "[1,2,3]", "C is unaffected by B leaving");
assert(store.size() === 0, "after unsubscribing everyone, the list is empty");

// The leak:
assert(leaky.size() === 5, "5 mounts with no cleanup → 5 live listeners 🐛");
assert(clean.size() === 1, "with cleanup → only the mounted component is subscribed ✅");
assert(leakedWrites.length === 5 && leakedWrites.length - 1 === 4,
  "one update ran 5 callbacks, 4 of them belonging to dead components 🐛");

// Mutation during notification:
assert(JSON.stringify(naiveCalls) === '["first","second"]',
  "iterating the live array skips the listener after a self-unsubscribe 🐛");
assert(JSON.stringify(safeCalls) === '["first","second","third"]',
  "iterating a snapshot notifies all three ✅");

// useSyncExternalStore:
assert(uncachedRenders === 25, "an uncached getSnapshot never stabilises — React loops 🐛");
assert(cachedRenders === 2, "a cached snapshot settles after one comparison ✅");
assert(Object.is(cached(), cached()), "...because two reads return the SAME reference");
assert(!Object.is(uncached(), uncached()), "...and the broken one never does");

// Selectors:
assert(wakes.cart === 20, "the cart subscriber woke on all 20 cart updates ✅");
assert(wakes.theme === 0 && wakes.user === 0,
  "subscribers reading other fields never woke at all ✅");
assert(contextWakes === 60 && storeWakes === 20, "60 context wake-ups vs 20 store wake-ups");

// The DOM is an observer:
assert(JSON.stringify(seenEvents) === '["click"]',
  "removeEventListener really is unsubscribe");
assert(target.size() === 0, "...and the DOM leaks exactly the same way if you skip it");

console.log("§11 — mini assertions passed for: Observer Pattern");
console.log("\n  The pair that captures it: five mounts without cleanup left 5 live");
console.log("  listeners for 1 mounted component, and an uncached getSnapshot never");
console.log("  stabilised in 25 renders while a cached one settled in 2.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "explain the observer pattern in React", answer:
//
//   "A subject keeps a list of listeners and calls all of them when its state
//    changes, without knowing what they are. subscribe returns unsubscribe.
//    That's the whole thing — about fifteen lines — and Redux, Zustand, RxJS,
//    addEventListener, IntersectionObserver and Node's EventEmitter are all
//    that same shape with different features layered on.
//
//    In React it matters because it's how state that lives OUTSIDE React stays
//    in sync with React. The official bridge is useSyncExternalStore: you give
//    it a subscribe function and a getSnapshot function, React subscribes once
//    and re-renders whenever the snapshot changes by Object.is. It exists
//    specifically to prevent tearing — under concurrent rendering, two
//    components reading an external value directly during render could see two
//    different values in one paint.
//
//    Two bugs I'd call out because they're both silent. First, cleanup: if
//    subscribe doesn't return unsubscribe, or the effect doesn't return it, the
//    listener keeps the component's whole closure alive. Five navigations later
//    one state change runs five callbacks, four of them for dead components —
//    that's the 'update on an unmounted component' warning and a real leak.
//    That's why subscribe returning unsubscribe is an API design decision, not
//    a convenience: it makes useEffect(() => store.subscribe(fn), []) correct
//    by construction.
//
//    Second, mutation during notification. A listener that unsubscribes itself
//    is completely normal, and if notify iterates the live array, removing the
//    current element shifts the next one into the slot you just passed — so a
//    listener silently never fires. Iterate a copy.
//
//    The third one is the React-specific gotcha: getSnapshot has to return the
//    same reference when nothing changed. Build a new object in there and React
//    re-renders, reads again, sees another new object, and loops — that's the
//    'result of getSnapshot should be cached' error. It's the same referential
//    equality rule as a Redux selector returning a filtered array.
//
//    And the reason to reach for an observable store over context at all is the
//    selector. Context notifies every consumer of every change; a store
//    compares the SLICE each subscriber asked for, so twenty cart updates wake
//    the cart component twenty times and the theme component zero. Context is a
//    broadcast; this is a subscription with a filter."
//
// The three silent bugs — cleanup, mutation-during-notify, uncached snapshot —
// are what make this a senior answer instead of a textbook definition.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why must subscribe return unsubscribe?
// A1. So cleanup is impossible to forget: useEffect(() => sub(fn), []) works
//     because the return value IS the cleanup function.
//
// Q2. What breaks if you iterate the live listener list?
// A2. A self-unsubscribing listener shifts the array and the next listener is
//     skipped, silently.
//
// Q3. What does useSyncExternalStore actually solve?
// A3. Tearing. It gives React a single consistent read of external state per
//     render pass, and re-subscribes correctly across concurrent renders.
//
// Q4. Why must getSnapshot be cached?
// A4. React compares snapshots with Object.is; a new object every call means
//     "changed" every time → infinite render loop.
//
// Q5. Observer vs pub/sub?
// A5. Observer: the subject holds the list, subscribers know the subject.
//     Pub/sub: a broker in between, neither side knows the other. Pub/sub
//     decouples more and is much harder to trace.
//
// Q6. Why does a store beat context for hot state?
// A6. Selectors. Context has no way to say "wake me only for this field".
//
// Q7. What are signals, and why doesn't React use them?
// A7. Value-level observers that subscribe the exact expressions that read
//     them, so nothing re-renders. React chose component-level re-render to
//     keep UI = f(state) and enable concurrent rendering, and compensates
//     with memoization and the compiler.
//
// Q8. How do you avoid infinite recursion when a listener writes state?
// A8. Queue notifications or guard with a flag; do not notify re-entrantly.
//
// Q9. Does subscription order matter?
// A9. Treat it as an implementation detail. If you need ordering, make it
//     explicit with priorities.
//
// Q10. How does this pattern show up in SSR?
// A10. getServerSnapshot. Without it, the server reads browser-only state and
//      hydration mismatches.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Observer pattern, in one line?
//   Back : A subject notifies a list of listeners on change; subscribe returns
//          unsubscribe.
//
// Flashcard 2:
//   Front: The cost of forgetting unsubscribe?
//   Back : The listener holds the component's closure alive. Leak + writes to
//          dead components.
//
// Flashcard 3:
//   Front: Why iterate a COPY of the listener list?
//   Back : A self-unsubscribing listener makes the loop skip the next one.
//
// Flashcard 4:
//   Front: useSyncExternalStore's two arguments?
//   Back : subscribe(onChange) → unsubscribe, and a CACHED getSnapshot().
//
// Flashcard 5:
//   Front: "getSnapshot should be cached" — why?
//   Back : A new object every call reads as a change → infinite re-render.
//
// Flashcard 6:
//   Front: Context vs observable store?
//   Back : Broadcast vs subscription with a filter (selectors).
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Three silent failures: no cleanup, mutating the list while
//          notifying, and an uncached snapshot."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write createStore in 15 lines from memory: getState, setState, subscribe.
//   Make subscribe return unsubscribe.
//
// Task 2:
//   Subscribe three listeners, unsubscribe the middle one, and confirm the
//   other two still fire.
//
// Task 3:
//   Reproduce §5: make the middle listener unsubscribe itself, iterate the
//   live array, and watch the third one vanish. Then fix it with a copy.
//
// Task 4:
//   Connect your store to React with useSyncExternalStore. Then deliberately
//   return a new object from getSnapshot and read the error React gives you.
//
// Task 5:
//   Add selectors: subscribe(select, onChange) and only notify when the
//   selected slice changes. Count wake-ups before and after.
//
// Task 6:
//   Mount and unmount a subscribed component 20 times with no cleanup, then
//   take a heap snapshot in DevTools and find the retained closures.
//
// Task 7:
//   Implement the same thing twice more — once as an EventEmitter (pub/sub
//   with string topics) and once with a signal-style auto-subscription. Write
//   down which one you could debug at 2am.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   A subject holds a list of listeners and calls them on change. subscribe
//   returns unsubscribe. Everything else is decoration.
//
// If you remember the common bug:
//   The listener that is never removed. It keeps a dead component alive and
//   multiplies the work on every future update.
//
// If you remember the professional framing:
//   Context broadcasts; an observable store subscribes with a filter. React
//   ships useSyncExternalStore to bridge them safely, and its one hard rule —
//   cache your snapshot — is the same referential-equality rule that governs
//   memo, deps arrays and selectors everywhere else.
//
// NEXT TOPIC -> 07_portals.js
