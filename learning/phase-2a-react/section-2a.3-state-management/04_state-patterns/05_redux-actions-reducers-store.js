// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  05_redux-actions-reducers-store.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Redux — actions, reducers, store
//
// WHAT YOU WILL MASTER HERE:
//   1. Build createStore from scratch — it is ~20 lines
//   2. The three principles, and what each one BUYS you
//   3. combineReducers, and why the state shape mirrors your reducers
//   4. Why time-travel debugging is possible at all
//   5. The mutation bug that silently does nothing
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/05_redux-actions-reducers-store.js"
//
// Prerequisites: 02_built-in-hooks/06_usereducer-vs-usestate.js,
// 04_redux-toolkit-createslice.js. This file is what RTK is built ON.
// Nobody writes this by hand anymore — but every RTK question assumes it.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Redux:
// One immutable state object in one store, changed only by dispatching plain
// action objects through pure reducer functions.
//
// If interviewer says "explain it simply", say:
// "One store holds the whole app state. You never assign to it — you dispatch
//  an action describing what happened, and a pure reducer returns the next
//  state. Subscribers get notified."
//
// If interviewer asks "why does it matter?", say:
// "Because those constraints BUY things. A pure reducer plus immutable state
//  means every state is reproducible from the action log — which is what makes
//  time-travel debugging, action replay, and optimistic rollback possible.
//  They are not rules for their own sake; each one is the price of a feature."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   state = actions.reduce(reducer, initialState)
//
// That line IS Redux. Your entire app state is a left fold over the action
// log. Everything else is plumbing around that idea.
//
// The cycle:
//
//   dispatch(action)  →  reducer(state, action)  →  newState
//        ↑                                              ↓
//   UI event  ←──────  subscribers notified  ←──── store.getState()
//
// THE THREE PRINCIPLES — and what each one buys:
//
//   1. SINGLE SOURCE OF TRUTH — one store object
//      Buys: no desync between components, trivial serialization, "dump the
//      whole state into a bug report" and reproduce it exactly.
//
//   2. STATE IS READ-ONLY — only dispatch changes it
//      Buys: an audit trail. Every change has an action naming WHY. You can
//      log, replay, and diff them.
//
//   3. CHANGES BY PURE FUNCTIONS — reducers
//      Buys: determinism. reducer(state, action) always gives the same result,
//      so you can replay the log and land in the same state. This is what
//      makes time travel possible.
//
// Runtime rule:
//   A reducer must be pure AND return a NEW object. Mutating and returning the
//   same reference means subscribers compare old === new and skip. Silent.
//
// Practical rule:
//   Write RTK. Understand this. Every "why is my component not re-rendering?"
//   Redux question is answered here.
//
// Common trap:
//   Thinking Redux "makes state global". It makes state EXPLICIT — every
//   change is an action you can name and log. That is the actual value.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD createStore
// ══════════════════════════════════════════════════════════════════

function createStore(reducer, preloadedState) {
  let state = preloadedState;
  let listeners = [];
  let isDispatching = false;

  function getState() {
    if (isDispatching) {
      throw new Error(
        "You may not call store.getState() while the reducer is executing."
      );
    }
    return state;
  }

  function subscribe(listener) {
    listeners.push(listener);
    return function unsubscribe() {                 // ← the cleanup
      listeners = listeners.filter(l => l !== listener);
    };
  }

  function dispatch(action) {
    if (typeof action.type === "undefined") {
      throw new Error("Actions may not have an undefined 'type' property.");
    }
    if (isDispatching) {
      throw new Error("Reducers may not dispatch actions.");
    }

    try {
      isDispatching = true;
      state = reducer(state, action);              // ← THE ENTIRE LIBRARY
    } finally {
      isDispatching = false;
    }

    for (const listener of listeners) listener();  // notify everyone
    return action;
  }

  // Initialize: an action no reducer handles, so every reducer returns its
  // default. This is why `state = initialState` in the signature works.
  dispatch({ type: "@@redux/INIT" });

  return { getState, dispatch, subscribe };
}

console.log("§3 — the whole store, in one line:\n");
console.log("    state = reducer(state, action)");
console.log("\n  Everything else — subscribe, getState, the INIT dispatch, the");
console.log("  guards — is plumbing around that. Redux is famously ~2kB, and");
console.log("  this is why.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — ACTIONS, REDUCERS, STORE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the three pieces:\n");

// ── 1. ACTIONS: plain objects describing WHAT HAPPENED ──────────
const ADD_TODO = "todos/added";
const TOGGLE_TODO = "todos/toggled";

const addTodo = (text) => ({ type: ADD_TODO, payload: { id: Date.now(), text } });
const toggleTodo = (id) => ({ type: TOGGLE_TODO, payload: id });

// ── 2. REDUCER: (state, action) => newState. PURE. ──────────────
const initialState = { items: [], filter: "all" };

function todosReducer(state = initialState, action) {
  switch (action.type) {
    case ADD_TODO:
      return {
        ...state,                                  // ← a NEW object
        items: [...state.items, { ...action.payload, done: false }],
      };                                           //   ↑ a NEW array
    case TOGGLE_TODO:
      return {
        ...state,
        items: state.items.map(item =>             // ← map returns a NEW array
          item.id === action.payload ? { ...item, done: !item.done } : item
        ),                                         //   ↑ and a new object for
      };                                           //     the ONE that changed
    default:
      return state;                                // ← the SAME reference
  }
}

// ── 3. STORE: holds it, dispatches to it, notifies about it ─────
const store = createStore(todosReducer);
const notifications = [];
const unsubscribe = store.subscribe(() => {
  notifications.push(store.getState().items.length);
});

console.log("  initial       :", JSON.stringify(store.getState()));
store.dispatch(addTodo("Learn Redux"));
console.log("  addTodo()     :", JSON.stringify(store.getState().items.map(i => i.text)));
store.dispatch(addTodo("Build a store"));
console.log("  addTodo()     :", JSON.stringify(store.getState().items.map(i => i.text)));

const firstId = store.getState().items[0].id;
store.dispatch(toggleTodo(firstId));
console.log("  toggleTodo()  :", JSON.stringify(store.getState().items.map(i =>
  ({ text: i.text, done: i.done }))));

console.log("\n  subscriber fired with item counts:", JSON.stringify(notifications));
unsubscribe();
store.dispatch(addTodo("After unsubscribe"));
console.log("  after unsubscribe:", JSON.stringify(notifications), "← not notified ✅\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE MUTATION BUG
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the reducer that silently does nothing:\n");

// ❌ MUTATING — returns the SAME reference
function mutatingReducer(state = { items: [] }, action) {
  switch (action.type) {
    case ADD_TODO:
      state.items.push(action.payload);   // 🐛 mutate...
      return state;                        // 🐛 ...and return the same object
    default:
      return state;
  }
}

const badStore = createStore(mutatingReducer);
const badRenders = [];
const before = badStore.getState();

// React-redux's actual check, simplified: did the reference change?
badStore.subscribe(() => {
  const after = badStore.getState();
  if (!Object.is(before, after)) badRenders.push("re-render");
});

badStore.dispatch(addTodo("Ghost todo"));
const afterBad = badStore.getState();

console.log("  state.items.push(...); return state;\n");
console.log("    items in the store:", afterBad.items.length, "← the data IS there");
console.log("    same reference?    ", Object.is(before, afterBad));
console.log("    components re-rendered:", badRenders.length, "🐛 ZERO");
console.log("\n  The todo was added. The store has it. Nothing re-rendered.");
console.log("  react-redux compares the previous and next selected value with");
console.log("  Object.is — same reference means 'nothing changed', so it skips.");
console.log("\n  This is THE Redux bug: no error, no warning, correct data, dead");
console.log("  UI. And it is exactly why RTK bundles Immer — not for elegance,");
console.log("  but because hand-written immutable updates are where this bug");
console.log("  comes from. → 04_redux-toolkit-createslice.js §5\n");

// ✅ The correct version, for contrast:
const goodStore = createStore(todosReducer);
const goodRenders = [];
const goodBefore = goodStore.getState();
goodStore.subscribe(() => {
  if (!Object.is(goodBefore, goodStore.getState())) goodRenders.push("re-render");
});
goodStore.dispatch(addTodo("Real todo"));
console.log("  return { ...state, items: [...state.items, x] }:");
console.log("    same reference?", Object.is(goodBefore, goodStore.getState()));
console.log("    components re-rendered:", goodRenders.length, "✅\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — combineReducers
// ══════════════════════════════════════════════════════════════════

console.log("§6 — combineReducers: the shape mirrors the reducers:\n");

function combineReducers(reducers) {
  return function combination(state = {}, action) {
    let hasChanged = false;
    const nextState = {};

    for (const [key, reducer] of Object.entries(reducers)) {
      const previous = state[key];
      const next = reducer(previous, action);       // each owns its SLICE
      if (typeof next === "undefined") {
        throw new Error(`Reducer "${key}" returned undefined. Add a default case.`);
      }
      nextState[key] = next;
      hasChanged = hasChanged || !Object.is(next, previous);
    }
    // ← THE OPTIMIZATION: if NO slice changed, return the OLD root object.
    //   Otherwise every dispatch would produce a new root and re-render
    //   everything, even for actions nobody handled.
    return hasChanged ? nextState : state;
  };
}

const userReducer = (state = { name: null }, action) =>
  action.type === "user/login" ? { name: action.payload } : state;
const cartReducer = (state = { items: [] }, action) =>
  action.type === "cart/add" ? { items: [...state.items, action.payload] } : state;

const rootReducer = combineReducers({
  todos: todosReducer,
  user: userReducer,
  cart: cartReducer,
});

const appStore = createStore(rootReducer);
console.log("  combineReducers({ todos, user, cart })");
console.log("  → state shape:", JSON.stringify(Object.keys(appStore.getState())));
console.log("    The KEYS you pass become the state shape. That is the whole");
console.log("    mapping — state.todos is whatever todosReducer returns.\n");

const rootBefore = appStore.getState();
appStore.dispatch({ type: "user/login", payload: "Vineet" });
const rootAfterLogin = appStore.getState();

console.log("  dispatch({ type: 'user/login' }):");
console.log("    root changed? ", !Object.is(rootBefore, rootAfterLogin), "✅");
console.log("    user changed? ", !Object.is(rootBefore.user, rootAfterLogin.user), "✅");
console.log("    todos changed?", !Object.is(rootBefore.todos, rootAfterLogin.todos),
  "← ✅ UNTOUCHED, same reference");
console.log("\n  This is STRUCTURAL SHARING. The todos slice kept its identity,");
console.log("  so useSelector(s => s.todos) sees no change and those components");
console.log("  never re-render — even though the root object is new.");

const unhandledBefore = appStore.getState();
appStore.dispatch({ type: "nobody/handles-this" });
console.log("\n  dispatch an action NO reducer handles:");
console.log("    root changed?", !Object.is(unhandledBefore, appStore.getState()),
  "← ✅ combineReducers returned the OLD root");
console.log("    Without that check, every unhandled action would create a new");
console.log("    root object and re-render the entire app. Six lines of");
console.log("    Object.is doing a lot of work.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHY TIME TRAVEL IS POSSIBLE
// ══════════════════════════════════════════════════════════════════
//
// The payoff of the three principles. This is what they BOUGHT.

console.log("§7 — time travel from the action log:\n");

const actionLog = [];
function createDevtoolsStore(reducer) {
  const s = createStore(reducer);
  const originalDispatch = s.dispatch;
  return {
    ...s,
    dispatch: (action) => { actionLog.push(action); return originalDispatch(action); },
    // Replay the log up to N actions. Determinism makes this trivial.
    // The seed is the reducer's own initial state — the same thing the
    // store's @@INIT dispatch produces.
    jumpTo: (n) => actionLog.slice(0, n).reduce(
      (state, action) => reducer(state, action),
      reducer(undefined, { type: "@@redux/INIT" })
    ),
  };
}

const dt = createDevtoolsStore(todosReducer);
actionLog.length = 0;
dt.dispatch(addTodo("First"));
dt.dispatch(addTodo("Second"));
dt.dispatch(addTodo("Third"));

console.log("  action log:", JSON.stringify(actionLog.map(a => a.type)));
console.log("\n  replaying to each point:");
for (let n = 0; n <= 3; n++) {
  const state = dt.jumpTo(n);
  console.log(`    after ${n} action(s): ${JSON.stringify(state.items.map(i => i.text))}`);
}

console.log("\n  Read that reduce: `actions.reduce(reducer, undefined)`. Your");
console.log("  entire app state at ANY point in history is a left fold over the");
console.log("  action log. That is not a devtools trick — it is a direct");
console.log("  consequence of the three principles:");
console.log("    • pure reducers  → replaying gives the same answer, always");
console.log("    • immutable state → old states still exist to jump back to");
console.log("    • actions describe intent → the log is a complete recording");
console.log("\n  Break ANY one and time travel dies. Mutate, and the old states");
console.log("  are gone. Add a fetch inside a reducer, and replaying fires ten");
console.log("  network requests. THAT is why the rules are strict — each one is");
console.log("  the price of a feature, not dogma.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REDUX DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real Redux
//   ───────────               ──────────
//   dispatch → notify all     the same. react-redux then runs each
//                             component's SELECTOR and only re-renders the
//                             ones whose selected value changed by Object.is
//                             — that selector layer is the whole performance
//                             story, and it is NOT in Redux core
//   n/a                       applyMiddleware: dispatch is wrapped in a chain,
//                             which is how thunk/saga/logger work → files 06-07
//   n/a                       enhancers, replaceReducer for code splitting
//   n/a                       createStore is DEPRECATED — configureStore from
//                             RTK is the official entry point now
//   n/a                       react-redux v8+ uses useSyncExternalStore, so
//                             the store cannot TEAR under concurrent rendering
//                             → 02_built-in-hooks/14
//
// The useSyncExternalStore point ties the whole section together: Redux is an
// external store, React 18 made external stores tearable, and react-redux was
// rewritten around the hook React shipped for exactly this.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The data is in the store, the UI does not update:
//   A mutating reducer. → §5. THE Redux bug.
//
// Bug 2 — "Reducer returned undefined":
//   A missing default case, or a switch branch with no return.
//
// Bug 3 — Everything re-renders on every action:
//   A selector returning a new object: useSelector(s => ({ a: s.a })).
//   Object.is is false every time. Use separate selectors or shallowEqual.
//
// Bug 4 — Time travel replays your API calls:
//   A side effect inside a reducer. Reducers must be pure.
//
// Bug 5 — Non-serializable state:
//   A Date, a Map, a Promise, a class instance. Devtools cannot serialize it
//   and time travel breaks. RTK warns in dev.
//
// Bug 6 — "Reducers may not dispatch actions":
//   Guarded in §3. That path would be infinite recursion.
//
// Bug 7 — The whole app in one reducer:
//   combineReducers exists so slices update independently and keep their
//   identity. → §6.
//
// Bug 8 — Writing all of this by hand in 2026:
//   createStore is deprecated. Use configureStore + createSlice. This file is
//   for UNDERSTANDING, not for shipping.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The store:
assert(store.getState().items.length === 3, "three todos were added");
assert(store.getState().items[0].done === true, "toggle flipped the first one");
assert(JSON.stringify(notifications) === JSON.stringify([1, 2, 2]),
  "the subscriber fired on EVERY dispatch — including the toggle, which did " +
  "not change the count");
assert(notifications.length === 3,
  "unsubscribe worked — the 4th dispatch did not notify");

// The mutation bug — the headline:
assert(afterBad.items.length === 1, "the mutating reducer DID add the item");
assert(Object.is(before, afterBad), "...and returned the SAME reference");
assert(badRenders.length === 0,
  "so ZERO components re-rendered. Correct data, dead UI, no error. 🐛");
assert(goodRenders.length === 1, "the immutable version re-renders correctly ✅");

// Reducer purity:
const s1 = { items: [], filter: "all" };
assert(Object.is(todosReducer(s1, { type: "unknown" }), s1),
  "an unhandled action returns the SAME reference — that is the default case's job");
assert(!Object.is(todosReducer(s1, addTodo("x")), s1),
  "a handled action returns a NEW object");

// combineReducers:
assert(JSON.stringify(Object.keys(appStore.getState())) ===
  JSON.stringify(["todos", "user", "cart"]),
  "the keys you pass ARE the state shape");
assert(Object.is(rootBefore.todos, rootAfterLogin.todos),
  "a user action left the todos slice's REFERENCE untouched — structural sharing");
assert(!Object.is(rootBefore.user, rootAfterLogin.user), "...while user got a new one");
assert(Object.is(unhandledBefore, appStore.getState()),
  "an unhandled action returns the OLD root — no app-wide re-render");

// Time travel:
assert(dt.jumpTo(0).items.length === 0, "replay 0 actions → empty");
assert(dt.jumpTo(2).items.length === 2, "replay 2 actions → 2 todos");
assert(dt.jumpTo(3).items.length === 3, "replay 3 → 3");
assert(JSON.stringify(dt.jumpTo(2)) === JSON.stringify(dt.jumpTo(2)),
  "replaying the SAME log twice gives the SAME state — determinism IS the feature");

console.log("§10 — mini assertions passed for: Redux actions, reducers, store");
console.log("\n  The one that matters most: the mutating reducer added the item");
console.log("  AND re-rendered zero components. Correct data. Dead UI. Silence.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "explain Redux", answer like this:
//
//   "It's one line: state = reducer(state, action). Your whole app state is a
//    left fold over the action log. Everything else — subscribe, getState,
//    middleware — is plumbing around that, which is why Redux core is about
//    two kilobytes.
//
//    Three principles. One store, so nothing can desync and you can serialize
//    the entire app state into a bug report. State is read-only and changes
//    only via dispatched actions, which gives you an audit trail — every change
//    has a name and a reason. And reducers are pure, which gives you
//    determinism.
//
//    The thing I'd stress is that those aren't rules for their own sake — each
//    one is the PRICE OF A FEATURE. Time-travel debugging is just
//    actions.reduce(reducer, undefined) up to any point. It works because
//    reducers are pure so replaying is deterministic, state is immutable so the
//    old states still exist, and actions describe intent so the log is a
//    complete recording. Break any one and it dies — mutate and the old states
//    are gone; put a fetch in a reducer and replaying fires ten requests.
//
//    The classic bug is a reducer that mutates and returns the same object. The
//    data IS in the store, and zero components re-render, because react-redux
//    compares with Object.is and same reference means nothing changed. No
//    error, no warning, correct data, dead UI. That's exactly why RTK bundles
//    Immer — not for elegance, but because hand-written immutable updates are
//    where that bug comes from.
//
//    combineReducers is worth knowing too: the keys you pass become the state
//    shape, and it returns the OLD root if no slice changed. That structural
//    sharing means a user action leaves the todos slice's reference intact, so
//    todo components don't re-render.
//
//    In practice nobody writes this — createStore is deprecated and
//    configureStore plus createSlice is the official path. But every 'why isn't
//    my component re-rendering' Redux question is answered here."
//
// "Each rule is the price of a feature" is the line that lands.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is Redux in one line?
// A1. state = reducer(state, action). The app state is a fold over the action log.
//
// Q2. What are the three principles and why?
// A2. Single store (no desync, serializable), read-only state (an audit
//     trail), pure reducers (determinism). Each buys a feature.
//
// Q3. Why does time travel work?
// A3. Replaying the log through pure reducers is deterministic, and immutable
//     state means past states still exist.
//
// Q4. What happens if a reducer mutates?
// A4. It returns the same reference, Object.is says nothing changed, and
//     nothing re-renders. Silent.
//
// Q5. Why must reducers be pure?
// A5. Replay and StrictMode double-invoke them. A fetch in a reducer fires on
//     every replay.
//
// Q6. What does combineReducers do?
// A6. Maps keys to slice reducers — the keys become the state shape — and
//     returns the old root if nothing changed, preserving structural sharing.
//
// Q7. Why does a selector returning an object re-render everything?
// A7. A new reference every call. Object.is is always false. Select primitives
//     or use shallowEqual.
//
// Q8. Where does middleware fit?
// A8. It wraps dispatch in a chain, which is how thunk, saga, and the logger
//     work. → files 06-07.
//
// Q9. Should you use createStore today?
// A9. No. It is deprecated. configureStore from RTK sets up devtools, thunk,
//     and the dev checks by default.
//
// Q10. How does react-redux avoid tearing?
// A10. v8+ uses useSyncExternalStore — the hook React shipped for exactly this.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is Redux?
//   Back : state = reducer(state, action). A fold over the action log.
//
// Flashcard 2:
//   Front: The three principles?
//   Back : One store, read-only state, pure reducers.
//
// Flashcard 3:
//   Front: Why are they strict?
//   Back : Each is the price of a feature — time travel needs all three.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : A mutating reducer. Same reference → nothing re-renders. Silent.
//
// Flashcard 5:
//   Front: What does combineReducers buy?
//   Back : Structural sharing — untouched slices keep their identity.
//
// Flashcard 6:
//   Front: How does time travel work?
//   Back : actions.reduce(reducer, undefined) up to any point.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Each rule is the price of a feature", and know createStore is
//          deprecated.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write createStore from memory. ~20 lines. The core is one assignment.
//
// Task 2:
//   Add applyMiddleware. The signature is
//   store => next => action => next(action). Then write a logger. You have
//   just built the thunk architecture. → file 06.
//
// Task 3:
//   Add the useSelector layer: subscribe, run a selector, and only notify if
//   the selected value changed by Object.is. That layer is the entire
//   performance story.
//
// Task 4:
//   Break §7: add console.log to a reducer, then replay. Watch it fire ten
//   times. That is why purity is not optional.
//
// Task 5:
//   Remove the hasChanged check from combineReducers. Now dispatch an
//   unhandled action and watch the root identity change — and every selector
//   with it.
//
// Task 6:
//   Explain in 60 seconds why a mutating reducer adds the data and updates
//   nothing, to someone staring at correct devtools and a frozen UI.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   state = reducer(state, action). Everything else is plumbing.
//
// If you remember the common bug:
//   A mutating reducer returns the same reference, so Object.is says nothing
//   changed and nothing re-renders. Correct data, dead UI.
//
// If you remember the professional framing:
//   Each principle is the price of a feature. Time travel is a fold over the
//   log — and it needs all three.
//
// NEXT TOPIC -> 06_redux-thunk-middleware.js
