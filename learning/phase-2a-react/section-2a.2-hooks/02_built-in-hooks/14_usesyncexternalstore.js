// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  14_usesyncexternalstore.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useSyncExternalStore
//
// WHAT YOU WILL MASTER HERE:
//   1. TEARING — what it is, and why it only appeared in React 18
//   2. The three arguments, and what each one is for
//   3. Tearing, REPRODUCED — two components, one store, two values
//   4. The getSnapshot infinite loop (the #1 real-world bug)
//   5. Why every state library had to adopt this hook
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/14_usesyncexternalstore.js"
//
// Prerequisite: 04_react-fiber-architecture.js — tearing is only possible
// because a render can be PAUSED. This hook is the fix for a bug concurrency
// created.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useSyncExternalStore:
// Subscribes a component to a store that lives OUTSIDE React, in a way that
// guarantees every component in one render sees the SAME value.
//
// If interviewer says "explain it simply", say:
// "It is the official way to read from a non-React data source — a Redux
//  store, a browser API, a global variable. It exists because concurrent
//  React can pause mid-render, and without it two components can read
//  different values from the same store in the same render."
//
// If interviewer asks "why does it matter?", say:
// "That inconsistency is called TEARING, and it is a bug class that did not
//  exist before React 18. Every external store library — Redux, Zustand,
//  MobX, Jotai — had to migrate to this hook or ship torn UIs the moment
//  anyone enabled concurrent features."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   one consistent snapshot per render
//
// WHY TEARING EXISTS — the causal chain:
//
//   1. React 18 renders concurrently: it can PAUSE mid-render (→ Fiber).
//   2. During that pause, JavaScript keeps running. An external store can
//      change — a timer, a websocket message, another event handler.
//   3. React resumes and renders the REST of the tree.
//   4. Components rendered before the pause read the OLD value.
//      Components rendered after read the NEW value.
//   5. Both get committed together. The screen now shows two different
//      values for the same piece of data.
//
// That is tearing. The name comes from graphics — a frame drawn from two
// different buffers, torn across the middle.
//
// Why useState never tears:
//   React OWNS that state. It knows not to change it mid-render. An external
//   store does not know React is rendering and does not care.
//
// The API:
//
//   const value = useSyncExternalStore(
//     subscribe,      // (onChange) => unsubscribe   — how to hear about changes
//     getSnapshot,    // () => value                 — how to read it NOW
//     getServerSnapshot // () => value               — SSR/hydration value
//   );
//
// Runtime rule:
//   getSnapshot must return a value that is Object.is-STABLE if nothing
//   changed. Return a new object every call and React re-renders forever.
//
// Practical rule:
//   You almost never write this by hand. You use it when wrapping a browser
//   API or building a store library. Otherwise your library already uses it.
//
// Common trap:
//   getSnapshot: () => ({ width, height })  → a new object every call →
//   "The result of getSnapshot should be cached to avoid an infinite loop."


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD A STORE AND THE HOOK
// ══════════════════════════════════════════════════════════════════

function createStore(initialState) {
  let state = initialState;
  const listeners = new Set();

  return {
    getState: () => state,
    setState: (next) => {
      state = typeof next === "function" ? next(state) : next;
      listeners.forEach(l => l());          // notify React
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);   // the unsubscribe
    },
    listenerCount: () => listeners.size,
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — TEARING, REPRODUCED
// ══════════════════════════════════════════════════════════════════
//
// Two components read the same store. React pauses between them. The store
// changes during the pause.

console.log("§4 — tearing: two components, one store, two values:\n");

// ── THE NAIVE SUBSCRIPTION (what every library did pre-18) ──────
// useEffect(() => store.subscribe(forceUpdate), []) + store.getState()
function renderWithNaiveRead(store, { interruptAfter = null } = {}) {
  const rendered = [];
  const components = ["Header", "Sidebar", "Cart"];

  for (const name of components) {
    // Each component reads the store DURING its own render:
    rendered.push({ name, value: store.getState() });

    if (name === interruptAfter) {
      // React yields to the browser here. The store changes underneath us.
      store.setState(99);
    }
  }
  return rendered;
}

const store1 = createStore(1);
const torn = renderWithNaiveRead(store1, { interruptAfter: "Header" });

console.log("  store.getState() read directly during render,");
console.log("  React pauses after <Header>, and the store changes to 99:\n");
for (const c of torn) {
  console.log(`    <${c.name}> rendered with: ${c.value}`);
}
console.log("\n  🐛 TORN. The header says 1, the cart says 99. Both are on");
console.log("     screen at the same time, in the same commit. The user sees");
console.log("     '1 item' in the header and '99 items' in the cart.\n");

// ── useSyncExternalStore: ONE snapshot for the whole render ─────
function renderWithSyncStore(store, { interruptAfter = null } = {}) {
  const rendered = [];
  const components = ["Header", "Sidebar", "Cart"];

  // THE FIX: React reads the snapshot ONCE, before the render, and every
  // component in this render gets that same value. If the store changes
  // mid-render, React DISCARDS the render and starts over with the new one.
  let snapshot = store.getState();
  let restarted = false;

  for (const name of components) {
    rendered.push({ name, value: snapshot });

    if (name === interruptAfter) {
      store.setState(99);
      // React detects the store changed mid-render and RESTARTS:
      if (!Object.is(snapshot, store.getState())) {
        restarted = true;
        snapshot = store.getState();
        rendered.length = 0;                    // throw the partial render away
        for (const n of components) rendered.push({ name: n, value: snapshot });
        break;
      }
    }
  }
  return { rendered, restarted };
}

const store2 = createStore(1);
const consistent = renderWithSyncStore(store2, { interruptAfter: "Header" });

console.log("  useSyncExternalStore, same interruption:\n");
for (const c of consistent.rendered) {
  console.log(`    <${c.name}> rendered with: ${c.value}`);
}
console.log("\n  ✅ CONSISTENT. React noticed the store changed mid-render,");
console.log("     threw the partial render away, and restarted with 99.");
console.log("     restarted?", consistent.restarted);
console.log("\n  That restart is cheap — the render phase touches no DOM, so");
console.log("  nothing was wasted but CPU. → 04_react-fiber-architecture.js §7\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE THREE ARGUMENTS
// ══════════════════════════════════════════════════════════════════
//
//   useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot?)
//
//   1. subscribe(onStoreChange) => unsubscribe
//        React calls this to listen. You call onStoreChange whenever the
//        store changes. Return the cleanup.
//        ⚠️  This function must be STABLE (defined outside the component or
//            wrapped in useCallback) — if its identity changes every render,
//            React resubscribes on every render.
//
//   2. getSnapshot() => value
//        Read the CURRENT value, synchronously. React calls this a lot —
//        before render, after render, on every change — to detect updates.
//        ⚠️  MUST be Object.is-stable when nothing changed. → §6
//
//   3. getServerSnapshot() => value
//        The value during SSR and the first hydration render. Required if you
//        server-render, because there is no window/store on the server.
//        Without it: "Missing getServerSnapshot" error.
//
// The canonical real example — a browser API wrapped as a store:
//
//   function subscribe(callback) {
//     window.addEventListener("online", callback);
//     window.addEventListener("offline", callback);
//     return () => {
//       window.removeEventListener("online", callback);
//       window.removeEventListener("offline", callback);
//     };
//   }
//
//   function useOnlineStatus() {
//     return useSyncExternalStore(
//       subscribe,                     // ← module scope. Stable.
//       () => navigator.onLine,        // ← a boolean. Object.is-stable. ✅
//       () => true                     // ← assume online on the server
//     );
//   }
//
// Note WHY that getSnapshot is safe: it returns a boolean. Primitives compare
// by value. The trouble starts the moment you return an object. → §6

console.log("§5 — subscribe / getSnapshot / getServerSnapshot:\n");

const onlineStore = createStore(true);
console.log("  subscribe   → returns an unsubscribe function");
const unsub = onlineStore.subscribe(() => {});
console.log("    listeners after subscribe:", onlineStore.listenerCount());
unsub();
console.log("    listeners after unsubscribe:", onlineStore.listenerCount(), "✅ no leak");
console.log("\n  getSnapshot → reads the value RIGHT NOW, synchronously");
console.log("    value:", onlineStore.getState());
console.log("\n  getServerSnapshot → the value during SSR (no window there)");
console.log("    without it, a server-rendered component throws:");
console.log("    'Missing getServerSnapshot, which is required for server-rendered'\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE INFINITE LOOP (the bug you will actually hit)
// ══════════════════════════════════════════════════════════════════

console.log("§6 — 'The result of getSnapshot should be cached':\n");

// React's actual check, simplified:
function reactWouldRerender(getSnapshot) {
  const a = getSnapshot();
  const b = getSnapshot();          // React calls it again to check for changes
  return !Object.is(a, b);          // different? → the store "changed" → re-render
}

const dims = { width: 1920, height: 1080 };

// ❌ BROKEN — a new object every call
const badSnapshot = () => ({ width: dims.width, height: dims.height });

// ✅ FIXED — cache the object, return the SAME reference until it changes
let cached = { width: dims.width, height: dims.height };
const goodSnapshot = () => {
  if (cached.width !== dims.width || cached.height !== dims.height) {
    cached = { width: dims.width, height: dims.height };   // only then a new one
  }
  return cached;
};

// ✅ ALSO FIXED — return a primitive and let the component compose
const primitiveSnapshot = () => dims.width;

console.log("  getSnapshot: () => ({ width, height })");
console.log("    two calls return the same reference?",
  !reactWouldRerender(badSnapshot));
console.log("    → React thinks the store changed → re-render → getSnapshot →");
console.log("      new object → 'changed' again → 🐛 INFINITE LOOP\n");

console.log("  getSnapshot: () => cachedObject");
console.log("    two calls return the same reference?",
  !reactWouldRerender(goodSnapshot), "✅ stable, no loop\n");

console.log("  getSnapshot: () => store.width   (a primitive)");
console.log("    two calls equal?", !reactWouldRerender(primitiveSnapshot),
  "✅ primitives compare by VALUE\n");

// Prove the cache still UPDATES when the data really changes:
const before = goodSnapshot();
dims.width = 1280;
const after = goodSnapshot();
console.log("  ...and when the window really resizes:");
console.log("    same reference?", Object.is(before, after),
  "→ a NEW object, so React re-renders. Correctly. ✅");

console.log("\n  This is the #1 real-world useSyncExternalStore bug, and note");
console.log("  the parallel: it is the SAME referential-equality trap as");
console.log("  useEffect deps and React.memo props. One rule, three hooks.");
console.log("  → 07_usememo-when-to-use.js\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHY EVERY STATE LIBRARY ADOPTED IT
// ══════════════════════════════════════════════════════════════════
//
// The historical context that makes this hook make sense.
//
// BEFORE React 18, every external store library did roughly this:
//
//   useEffect(() => store.subscribe(forceUpdate), []);
//   const state = store.getState();          // read during render
//
// That worked perfectly, because rendering was synchronous — nothing could
// change between two components' renders.
//
// React 18 made rendering interruptible, and that pattern became unsound
// overnight. Not "slower" — WRONG. The React team knew this, so:
//
//   • useSyncExternalStore shipped WITH React 18, deliberately
//   • use-sync-external-store was published as a SHIM for React 17/16, so
//     libraries could migrate before their users upgraded
//   • React-Redux v8 was essentially a rewrite around this hook
//   • Zustand, Jotai, Valtio, MobX, Apollo all adopted it
//
// The interview line:
//   "It is a hook React built for LIBRARY authors, not app developers. It is
//    the contract that lets an external store participate in concurrent
//    rendering safely. If you are using Redux or Zustand, you are using it —
//    you just never type its name."
//
// When YOU would write it directly:
//   • wrapping a browser API: navigator.onLine, matchMedia, localStorage,
//     document.visibilityState, window size
//   • subscribing to a websocket or an event emitter
//   • integrating a non-React legacy store
//   • building your own state library
//
// When you would NOT:
//   • normal component state → useState
//   • server data → React Query
//   • anything a library already wraps


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real React
//   ───────────               ──────────
//   read a snapshot once      calls getSnapshot before AND after the render
//                             and compares — if it changed, the render is
//                             discarded and re-run synchronously
//   restart by hand           it FORCES the update to be synchronous
//                             (non-concurrent) for that store, which is the
//                             actual mechanism preventing tearing
//   n/a                       useSyncExternalStore updates are NEVER
//                             deprioritized. An external store change cannot
//                             be a transition — that is the price.
//   n/a                       the subscribe function's identity matters: a
//                             new one each render = resubscribe each render
//   n/a                       useSyncExternalStoreWithSelector (in the shim
//                             package) adds selector + isEqual, which is what
//                             React-Redux actually uses
//
// The trade-off worth naming:
//   Because external store updates are forced synchronous, they cannot be
//   interrupted or deferred. That is precisely why libraries like Jotai and
//   Zustand can feel less "concurrent-friendly" than useState for
//   high-frequency updates. Consistency was chosen over interruptibility.
//   Saying that out loud is a strong senior signal.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "The result of getSnapshot should be cached to avoid an infinite loop":
//   A new object every call. → §6. The bug everyone hits.
//
// Bug 2 — "Missing getServerSnapshot":
//   You server-render and did not pass the third argument.
//
// Bug 3 — Resubscribing on every render:
//   subscribe defined inline in the component. Move it to module scope or
//   wrap it in useCallback.
//
// Bug 4 — Torn UI with a hand-rolled store:
//   useEffect + getState during render. → §4. The pattern that React 18 broke.
//
// Bug 5 — Hydration mismatch:
//   getServerSnapshot returns something the client's getSnapshot does not
//   match. e.g. server says online, client is offline.
//
// Bug 6 — window is not defined:
//   getSnapshot touching window during SSR. That is what getServerSnapshot
//   is for.
//
// Bug 7 — Expecting transitions to work with it:
//   External store updates are forced sync. They cannot be deferred. → §8.
//
// Bug 8 — Writing it by hand when Zustand exists:
//   Correct, but you are rebuilding a library. Wrap a browser API with it;
//   do not build a state manager with it unless that is the goal.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// Tearing — the headline:
assert(torn[0].value === 1, "Header rendered BEFORE the interruption → old value");
assert(torn[2].value === 99, "Cart rendered AFTER → new value");
assert(torn[0].value !== torn[2].value,
  "TEARING: two components in ONE commit showing different values for the same store 🐛");

// The fix:
const values = consistent.rendered.map(c => c.value);
assert(new Set(values).size === 1,
  "useSyncExternalStore: every component in the render saw the SAME value ✅");
assert(consistent.restarted === true,
  "...because React discarded the partial render and restarted with the new snapshot");
assert(values[0] === 99, "and it restarted with the NEWEST value, not the stale one");

// The infinite loop:
assert(reactWouldRerender(badSnapshot) === true,
  "an object-returning getSnapshot looks 'changed' on every call → infinite loop");
assert(reactWouldRerender(goodSnapshot) === false,
  "a cached snapshot is stable → no loop");
assert(reactWouldRerender(primitiveSnapshot) === false,
  "a primitive snapshot is stable by value — the simplest fix");

// ...but the cache must still update:
assert(!Object.is(before, after),
  "the cached snapshot DOES return a new object when the data really changed");
assert(after.width === 1280, "...with the correct new value");

// Subscribe returns a working unsubscribe:
assert(onlineStore.listenerCount() === 0, "unsubscribe actually removes the listener");

console.log("§10 — mini assertions passed for: useSyncExternalStore");
console.log("\n  The one to remember: torn[0] is 1 and torn[2] is 99 — in the");
console.log("  SAME commit. That is a bug class React 18 created, and this");
console.log("  hook is the fix.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is useSyncExternalStore?", answer like this:
//
//   "It's the official way to subscribe to a store outside React, and it
//    exists because of tearing.
//
//    Tearing is a bug class React 18 created. Concurrent rendering can pause
//    mid-render, and during that pause JavaScript keeps running — a websocket
//    message or a timer can change an external store. React resumes, renders
//    the rest of the tree, and now the components rendered before the pause
//    have the old value and the ones after have the new value. Both get
//    committed. Your header says one item and your cart says ninety-nine.
//
//    useState never tears because React owns that state and knows not to
//    change it mid-render. An external store doesn't know React is rendering.
//
//    The hook takes subscribe, getSnapshot, and getServerSnapshot. React calls
//    getSnapshot before and after the render, and if it changed, it throws the
//    partial render away and re-runs synchronously — which is cheap, because
//    the render phase touches no DOM.
//
//    The bug everyone hits is 'the result of getSnapshot should be cached'.
//    If getSnapshot returns a new object each call, React compares with
//    Object.is, sees a change, re-renders, calls it again... infinite loop. It's
//    the same referential-equality trap as useEffect deps and React.memo —
//    return a primitive, or cache the object.
//
//    Worth knowing it's a hook for LIBRARY authors. Redux, Zustand, Jotai and
//    MobX all migrated to it, and there's an official shim for React 17. If
//    you use Zustand you're using this hook without typing its name. I'd write
//    it directly to wrap a browser API — navigator.onLine, matchMedia — not to
//    build a store.
//
//    One trade-off: these updates are forced synchronous, so they can never be
//    a transition. Consistency was chosen over interruptibility."
//
// Naming tearing as a React-18-created bug class, and the forced-sync
// trade-off, is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is tearing?
// A1. Two components in one commit showing different values from the same
//     store, because the store changed while React was paused mid-render.
//
// Q2. Why did it not exist before React 18?
// A2. Rendering was synchronous. There was no pause during which the store
//     could change.
//
// Q3. Why doesn't useState tear?
// A3. React owns it and will not change it mid-render. An external store
//     does not know React exists.
//
// Q4. What are the three arguments?
// A4. subscribe (returns unsubscribe), getSnapshot (read now), and
//     getServerSnapshot (the SSR/hydration value).
//
// Q5. Why the infinite loop?
// A5. getSnapshot returns a new object each call, so React's Object.is check
//     always reports a change. Return a primitive or cache the object.
//
// Q6. Why must subscribe be stable?
// A6. A new identity each render makes React unsubscribe and resubscribe on
//     every render.
//
// Q7. Should app developers use it?
// A7. Rarely. It is for library authors and for wrapping browser APIs. Your
//     state library already uses it.
//
// Q8. What is the trade-off?
// A8. External store updates are forced synchronous — never interruptible,
//     never deferrable. Consistency over concurrency.
//
// Q9. What about React 17?
// A9. The use-sync-external-store shim package, published so libraries could
//     migrate before their users upgraded.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useSyncExternalStore for?
//   Back : Reading an external store without tearing.
//
// Flashcard 2:
//   Front: What is tearing?
//   Back : Two components, one commit, two values — the store changed during
//          a render pause.
//
// Flashcard 3:
//   Front: Why is it new in React 18?
//   Back : Concurrent rendering can pause. Synchronous rendering could not.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : getSnapshot returning a new object → infinite loop.
//
// Flashcard 5:
//   Front: What are the three arguments?
//   Back : subscribe, getSnapshot, getServerSnapshot.
//
// Flashcard 6:
//   Front: Who is this hook for?
//   Back : Library authors, and wrapping browser APIs.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Call tearing a bug class React 18 created, and name the forced-sync
//          trade-off.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild the tearing demo from memory. The essential move: change the
//   store between two components' renders.
//
// Task 2:
//   Write useOnlineStatus with all three arguments. Explain why
//   () => navigator.onLine needs no caching.
//
// Task 3:
//   Break §6's fix: return a fresh object even when the data is unchanged.
//   Count the re-renders before you would hit React's loop guard.
//
// Task 4:
//   Add a selector: useSyncExternalStoreWithSelector(subscribe, getSnapshot,
//   null, selector, isEqual). That is what React-Redux uses — and now you
//   know why it needs isEqual.
//
// Task 5:
//   Wrap window.matchMedia("(prefers-color-scheme: dark)") as a store. That
//   is a genuinely useful hook and it is ten lines.
//
// Task 6:
//   Explain in 60 seconds why the header says 1 and the cart says 99, to
//   someone who thinks React "can't do that".


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   One consistent snapshot per render. Tearing is two components in one
//   commit disagreeing about the same store.
//
// If you remember the common bug:
//   getSnapshot returning a new object = an infinite loop. Same referential
//   equality rule as deps and memo.
//
// If you remember the professional framing:
//   It is a library-author hook, born because React 18's interruptible
//   rendering made the old subscribe-and-read pattern unsound.
//
// NEXT TOPIC -> 15_useinsertioneffect.js
