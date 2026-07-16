// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  06_redux-thunk-middleware.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Redux Thunk middleware
//
// WHAT YOU WILL MASTER HERE:
//   1. The middleware signature — store => next => action => next(action)
//   2. Thunk is FOURTEEN LINES. Build it and see.
//   3. Why async needs middleware at all (reducers are pure)
//   4. The middleware CHAIN, and what `next` vs `dispatch` means
//   5. When a thunk is the wrong answer
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/06_redux-thunk-middleware.js"
//
// Prerequisite: 05_redux-actions-reducers-store.js — you built the store.
// This is the extension point it left open.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Redux Thunk:
// A middleware that lets you dispatch a FUNCTION instead of an object — and
// calls it with (dispatch, getState) so it can do async work and dispatch
// real actions when it is ready.
//
// If interviewer says "explain it simply", say:
// "Normally dispatch only accepts plain objects. Thunk intercepts functions
//  and calls them, handing them dispatch and getState. So you can await a
//  fetch and dispatch the result."
//
// If interviewer asks "why does it matter?", say:
// "Because reducers must be pure — no fetches, no timers — but apps are full
//  of async work, so Redux needed an extension point. That is middleware. And
//  thunk is the smallest possible answer: fourteen lines that changed how
//  every Redux app was written for five years."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   dispatch a FUNCTION, not an object
//
// The problem:
//
//   ❌ You cannot do this — the reducer must be pure:
//     function reducer(state, action) {
//       if (action.type === "user/fetch") {
//         fetch("/api/user").then(...);      // 💥 a side effect in a reducer
//       }
//     }
//     Replaying the action log would fire ten network requests. → file 05 §7
//
//   ❌ And you cannot do this — dispatch takes objects:
//     dispatch(async () => { ... })          // 💥 "Actions must be plain objects"
//
//   ✅ So: put the async work BETWEEN dispatch and the reducer. That gap is
//      middleware.
//
// The middleware signature — memorize this shape:
//
//   const middleware = (store) => (next) => (action) => { ... next(action) }
//                       ↑          ↑         ↑
//                       │          │         └─ the action being dispatched
//                       │          └─ the NEXT middleware (or the real dispatch)
//                       └─ { dispatch, getState }
//
// Three nested arrows. Curried, because Redux composes them into a chain by
// applying them one layer at a time.
//
// Runtime rule:
//   `next(action)` passes it DOWN the chain toward the reducer.
//   `store.dispatch(action)` starts it again from the TOP. Confusing these
//   is how you get an infinite loop.
//
// Practical rule:
//   RTK includes thunk by default. You never install it, and you rarely
//   write raw thunks — createAsyncThunk wraps this.
//
// Common trap:
//   Thinking thunk is a library that "adds async to Redux". It adds one
//   `typeof action === "function"` check. That is genuinely all it is.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD applyMiddleware
// ══════════════════════════════════════════════════════════════════

function createStore(reducer, preloadedState, enhancer) {
  if (enhancer) return enhancer(createStore)(reducer, preloadedState);

  let state = preloadedState;
  let listeners = [];

  const getState = () => state;
  const subscribe = (l) => { listeners.push(l); return () => {
    listeners = listeners.filter(x => x !== l);
  }; };
  const dispatch = (action) => {
    if (typeof action.type === "undefined") {
      throw new Error(
        "Actions must be plain objects with a 'type' property. " +
        "Use custom middleware for async actions."
      );
    }
    state = reducer(state, action);
    listeners.forEach(l => l());
    return action;
  };

  dispatch({ type: "@@redux/INIT" });
  return { getState, dispatch, subscribe };
}

// THE CHAIN BUILDER. This is the part people never look at.
function applyMiddleware(...middlewares) {
  return (createStoreFn) => (reducer, preloadedState) => {
    const store = createStoreFn(reducer, preloadedState);
    let dispatch = () => {
      throw new Error("Dispatching while constructing your middleware is not allowed.");
    };

    // Every middleware gets a store API whose `dispatch` is the FULLY WRAPPED
    // one — so calling store.dispatch from inside a middleware re-enters the
    // whole chain from the top. That indirection is deliberate.
    const middlewareAPI = {
      getState: store.getState,
      dispatch: (action) => dispatch(action),
    };

    // Apply the first layer: middleware(store) → (next) => (action) => ...
    const chain = middlewares.map(mw => mw(middlewareAPI));

    // Compose right-to-left, so middlewares[0] is the OUTERMOST.
    dispatch = chain.reduceRight(
      (next, mw) => mw(next),
      store.dispatch                 // ← the innermost `next` IS the real dispatch
    );

    return { ...store, dispatch };
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THUNK, IN FULL
// ══════════════════════════════════════════════════════════════════
//
// This is the entire library. Not a simplification — the real one is
// this plus an `extraArgument` option.

function createThunkMiddleware(extraArgument) {
  return ({ dispatch, getState }) => (next) => (action) => {
    if (typeof action === "function") {          // ← THE ENTIRE FEATURE
      return action(dispatch, getState, extraArgument);
    }
    return next(action);                         // not a function? pass it on.
  };
}

const thunk = createThunkMiddleware();
thunk.withExtraArgument = createThunkMiddleware;

console.log("§4 — redux-thunk, in full:\n");
console.log("    ({ dispatch, getState }) => (next) => (action) => {");
console.log("      if (typeof action === 'function') {");
console.log("        return action(dispatch, getState);");
console.log("      }");
console.log("      return next(action);");
console.log("    }");
console.log("\n  That is the whole library. One typeof check. It has been");
console.log("  downloaded billions of times and it is five lines of logic.");
console.log("\n  Everything a thunk can do comes from that: it receives");
console.log("  `dispatch`, so it can fire real actions later; it receives");
console.log("  `getState`, so it can read the store and decide whether to.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — WITHOUT THUNK vs WITH
// ══════════════════════════════════════════════════════════════════

console.log("§5 — what dispatch accepts:\n");

const initialState = { data: null, status: "idle", error: null };
function userReducer(state = initialState, action) {
  switch (action.type) {
    case "user/pending": return { ...state, status: "loading", error: null };
    case "user/fulfilled": return { status: "succeeded", data: action.payload, error: null };
    case "user/rejected": return { status: "failed", data: null, error: action.error };
    default: return state;
  }
}

// ── WITHOUT thunk ───────────────────────────────────────────────
const plainStore = createStore(userReducer);
let plainError;
try {
  plainStore.dispatch(async (dispatch) => { void dispatch; });
} catch (e) {
  plainError = e.message;
}
console.log("  plain store, dispatch(a function):");
console.log("    💥", plainError.slice(0, 58) + "...");
console.log("    Note the error text: 'Use custom middleware for async actions.'");
console.log("    Redux TELLS you the extension point exists.\n");

// ── WITH thunk ──────────────────────────────────────────────────
const store = createStore(userReducer, undefined, applyMiddleware(thunk));

function fetchUser(id) {
  // A THUNK: a function that receives (dispatch, getState).
  return async (dispatch, getState) => {
    // It can READ the store — e.g. to skip a redundant request:
    if (getState().status === "loading") return;

    dispatch({ type: "user/pending" });
    try {
      const data = await fakeApi(id);
      dispatch({ type: "user/fulfilled", payload: data });
    } catch (error) {
      dispatch({ type: "user/rejected", error: error.message });
    }
  };
}

function fakeApi(id) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (id === 0) reject(new Error("Not found"));
      else resolve({ id, name: "Vineet" });
    }, 10);
  });
}

console.log("  with applyMiddleware(thunk):");

async function runDemo() {
  const states = [];
  store.subscribe(() => states.push(store.getState().status));

  await store.dispatch(fetchUser(1));      // ← dispatch returns the thunk's promise!
  console.log("    dispatch(fetchUser(1)) → statuses:", JSON.stringify(states));
  console.log("    final state:", JSON.stringify(store.getState()));

  const errStore = createStore(userReducer, undefined, applyMiddleware(thunk));
  await errStore.dispatch(fetchUser(0));
  console.log("\n    dispatch(fetchUser(0)) → final state:",
    JSON.stringify(errStore.getState()));

  console.log("\n  Note `await store.dispatch(...)`. Thunk RETURNS whatever your");
  console.log("  function returns, so an async thunk gives you a promise. That");
  console.log("  is how you await a dispatch in a component, and it falls out");
  console.log("  of the `return action(dispatch, getState)` line for free.\n");

  chainDemo();
}


// ══════════════════════════════════════════════════════════════════
// § 6 — THE CHAIN: next vs dispatch
// ══════════════════════════════════════════════════════════════════

function chainDemo() {
  console.log("§6 — the middleware chain:\n");

  const log = [];

  const logger = ({ getState }) => (next) => (action) => {
    log.push(`  logger:  before ${action.type}  (state: ${getState().status})`);
    const result = next(action);                 // ← DOWN the chain
    log.push(`  logger:  after  ${action.type}  (state: ${getState().status})`);
    return result;
  };

  const timer = () => (next) => (action) => {
    log.push(`  timer:   start  ${action.type}`);
    const result = next(action);
    log.push(`  timer:   end    ${action.type}`);
    return result;
  };

  const chained = createStore(userReducer, undefined,
    applyMiddleware(logger, timer, thunk));

  chained.dispatch({ type: "user/pending" });

  console.log("  applyMiddleware(logger, timer, thunk)");
  console.log("  dispatch({ type: 'user/pending' }):\n");
  for (const line of log) console.log(line);

  console.log("\n  The order is an ONION: logger wraps timer wraps thunk wraps");
  console.log("  the real dispatch. The action travels DOWN through each");
  console.log("  `next(action)`, hits the reducer, and control unwinds back UP.");
  console.log("  That is why logger can print the state BEFORE and AFTER — the");
  console.log("  reducer ran in the middle of its own function call.");

  console.log("\n  next vs dispatch — the distinction that causes infinite loops:");
  console.log("    next(action)          → the NEXT middleware down. One way.");
  console.log("    store.dispatch(action) → back to the TOP of the chain.");
  console.log("\n  A middleware that calls store.dispatch(action) with the SAME");
  console.log("  action re-enters itself. Forever. Use `next` unless you");
  console.log("  genuinely mean 'start over' — which is what thunk does, so a");
  console.log("  thunk's dispatched actions pass through the logger too.\n");

  whenNotDemo();
}


// ══════════════════════════════════════════════════════════════════
// § 7 — WHEN A THUNK IS THE WRONG ANSWER
// ══════════════════════════════════════════════════════════════════

function whenNotDemo() {
  console.log("§7 — thunk's limits:\n");

  console.log("  ❌ CANCELLATION — a thunk cannot be cancelled.");
  console.log("     Once it starts, it runs. A stale response can still land.");
  console.log("     createAsyncThunk adds an AbortController; raw thunks do not.");
  console.log("     Saga has `takeLatest`, which cancels the previous run by");
  console.log("     design. → 07_redux-saga-concepts.js");
  console.log("");
  console.log("  ❌ COMPLEX ORCHESTRATION — 'debounce this, then poll every 5s");
  console.log("     until done, cancel if the user navigates' is a nightmare in");
  console.log("     a thunk and declarative in a saga.");
  console.log("");
  console.log("  ❌ TESTING — a thunk is a function that calls dispatch and");
  console.log("     fetch. To test it you mock both. A saga yields plain");
  console.log("     objects describing intent, so you assert on the objects.");
  console.log("");
  console.log("  ❌ SERVER DATA — the big one. A thunk that fetches gives you no");
  console.log("     caching, no dedup, no revalidation, no stale-while-");
  console.log("     revalidate. If you are writing fetch thunks in 2026, RTK");
  console.log("     Query or React Query does the whole job. → file 10");

  // Demonstrate the cancellation gap concretely:
  const races = [];
  async function racingThunk(id, delay) {
    return async () => {
      await new Promise(r => setTimeout(r, delay));
      races.push(id);                     // no way to say "I'm obsolete"
    };
  }

  (async () => {
    const s = createStore(userReducer, undefined, applyMiddleware(thunk));
    s.dispatch(await racingThunk("user-1", 30));   // slow
    s.dispatch(await racingThunk("user-2", 10));   // fast
    await new Promise(r => setTimeout(r, 50));

    console.log("\n  the cancellation gap, concretely:");
    console.log("    dispatched fetchUser(1) then fetchUser(2):");
    console.log("    resolution order:", JSON.stringify(races));
    console.log("    → user-1 landed LAST and overwrote user-2. A raw thunk has");
    console.log("      no cancellation, so this is your race condition, back");
    console.log("      again. → 03_custom-hooks/02_usefetch-custom-hook.js §4\n");

    runAssertions(races);
  })();
}


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REDUX DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real Redux / RTK
//   ───────────               ────────────────
//   applyMiddleware by hand   configureStore includes thunk BY DEFAULT, plus
//                             the serializability and immutability dev checks
//   raw thunks                createAsyncThunk generates pending/fulfilled/
//                             rejected, handles errors, and adds
//                             AbortController + a condition option for
//                             deduping → 04_redux-toolkit-createslice.js §8
//   n/a                       thunk.withExtraArgument(api) — inject an API
//                             client so thunks are testable without mocking
//                             fetch. Genuinely useful and nobody uses it.
//   n/a                       RTK Query is built on thunks internally — the
//                             whole data layer is thunks you never see
//
// The historical framing:
//   Thunk was the default async answer from 2015 to ~2020. It is still the
//   default in RTK. But the industry moved server data OUT of Redux entirely
//   — first to React Query, now to RSC. So thunks today handle CLIENT async:
//   a debounced save, a multi-step wizard, an optimistic update. Not fetching.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "Actions must be plain objects":
//   You dispatched a function without thunk installed. → §5.
//
// Bug 2 — An infinite loop in a middleware:
//   store.dispatch(action) instead of next(action). → §6.
//
// Bug 3 — A race condition from a stale thunk:
//   No cancellation. → §7. Use createAsyncThunk's abort, or takeLatest.
//
// Bug 4 — A thunk reading stale state:
//   getState() is a live read, so it is FRESH — but a value you captured in
//   a variable before an await is stale. Call getState() after the await.
//
// Bug 5 — Business logic scattered across thunks:
//   Thunks are imperative, so they grow. Ten thunks touching the same slice
//   is when people start looking at sagas.
//
// Bug 6 — Fetch thunks for server data:
//   You are hand-rolling a cache. → file 10.
//
// Bug 7 — Un-testable thunks:
//   They call fetch directly. Use withExtraArgument to inject the client.
//
// Bug 8 — Dispatching a thunk from a reducer:
//   Reducers must be pure. That is what thunk exists to prevent.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function runAssertions(races) {
  function assert(condition, message) {
    if (!condition) {
      throw new Error("Assertion failed: " + message);
    }
  }

  // Without thunk:
  assert(plainError.includes("plain objects"),
    "a bare store rejects a function — and names the fix: custom middleware");

  // Thunk IS the typeof check:
  const fn = () => {};
  assert(typeof fn === "function", "the entire thunk condition, in isolation");

  // With thunk:
  assert(store.getState().status === "succeeded", "the thunk dispatched fulfilled");
  assert(store.getState().data.name === "Vineet", "...with the payload");

  // Thunk returns what your function returns:
  const s = createStore(userReducer, undefined, applyMiddleware(thunk));
  const returned = s.dispatch(() => "hello from the thunk");
  assert(returned === "hello from the thunk",
    "thunk RETURNS your function's return value — that is why await works");
  const promise = s.dispatch(async () => 42);
  assert(promise instanceof Promise, "an async thunk gives you a promise back");

  // Non-function actions pass straight through:
  const passed = s.dispatch({ type: "user/pending" });
  assert(passed.type === "user/pending", "a plain object goes down the chain unchanged");
  assert(s.getState().status === "loading", "...and reaches the reducer");

  // The cancellation gap:
  assert(races[races.length - 1] === "user-1",
    "the SLOW first thunk resolved LAST and won — thunks cannot be cancelled 🐛");

  console.log("§10 — mini assertions passed for: Redux Thunk");
  console.log("\n  The one to remember: `typeof action === 'function'`. That");
  console.log("  single check is the entire library.");
}

runDemo();


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is Redux Thunk?", answer like this:
//
//   "It's a middleware that lets you dispatch a function instead of an object.
//    And it is genuinely five lines: if typeof action === 'function', call it
//    with (dispatch, getState); otherwise next(action). That's the library.
//
//    It exists because reducers must be pure. You can't fetch in a reducer —
//    replaying the action log would fire ten network requests and kill time
//    travel. But dispatch only accepts plain objects. So Redux left an
//    extension point between dispatch and the reducer, and that's middleware.
//    The signature is store => next => action, curried because Redux composes
//    them into a chain, right-to-left, with the real dispatch at the bottom.
//
//    The distinction worth knowing is next versus dispatch. next(action) goes
//    DOWN to the next middleware; store.dispatch goes back to the TOP. A
//    middleware that dispatches the same action re-enters itself forever.
//    Thunk deliberately passes store.dispatch, which is why actions from a
//    thunk pass through your logger too.
//
//    A detail people miss: thunk RETURNS whatever your function returns, so an
//    async thunk gives you a promise and you can await a dispatch. That falls
//    out of `return action(dispatch, getState)` for free.
//
//    Where it stops: a thunk can't be cancelled. Dispatch fetchUser(1) then
//    fetchUser(2), and if the first is slower it lands last and overwrites —
//    the same race condition as a hand-rolled useFetch. createAsyncThunk adds
//    an AbortController; sagas have takeLatest, which cancels by design.
//
//    And honestly, if a thunk is fetching server data, it's the wrong tool.
//    You get no caching, dedup, or revalidation. RTK Query — which is itself
//    built on thunks — or React Query does that job. Thunks today are for
//    CLIENT async: a debounced save, a wizard, an optimistic update."
//
// "It's five lines" plus the cancellation gap is the senior answer.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is thunk?
// A1. A middleware that calls action(dispatch, getState) when the action is a
//     function. One typeof check.
//
// Q2. Why can't you fetch in a reducer?
// A2. Reducers must be pure. Replaying the log would re-fire the request and
//     time travel would break.
//
// Q3. What is the middleware signature?
// A3. store => next => action => {}. Curried so Redux can compose the chain
//     right-to-left.
//
// Q4. next vs dispatch?
// A4. next goes down to the next middleware. dispatch restarts from the top —
//     and dispatching the same action from a middleware loops forever.
//
// Q5. Can you await a dispatch?
// A5. Yes. Thunk returns your function's return value, so an async thunk
//     returns a promise.
//
// Q6. Can a thunk be cancelled?
// A6. Not a raw one. createAsyncThunk adds AbortController; saga's takeLatest
//     cancels the previous run by design.
//
// Q7. Thunk or saga?
// A7. Thunk for simple async — it is smaller and RTK ships it. Saga when you
//     need cancellation, complex orchestration, or testable effects.
//
// Q8. Is a thunk right for data fetching?
// A8. Not in 2026. No caching, dedup, or revalidation. RTK Query or React Query.
//
// Q9. What is withExtraArgument?
// A9. Inject a dependency — an API client — so thunks are testable without
//     mocking fetch.
//
// Q10. Does getState() go stale inside a thunk?
// A10. No — it is a live read. But a value you captured before an await IS
//      stale. Re-read after awaiting.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is thunk?
//   Back : if (typeof action === "function") return action(dispatch, getState).
//
// Flashcard 2:
//   Front: What is the middleware signature?
//   Back : store => next => action => {}
//
// Flashcard 3:
//   Front: Why does async need middleware?
//   Back : Reducers must be pure, and dispatch only takes objects.
//
// Flashcard 4:
//   Front: next vs dispatch?
//   Back : next = down the chain. dispatch = back to the top (loop risk).
//
// Flashcard 5:
//   Front: What is the most common trap?
//   Back : Thunks cannot be cancelled — the race condition comes back.
//
// Flashcard 6:
//   Front: Why can you await a dispatch?
//   Back : Thunk returns your function's return value.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "It's five lines", and thunks are for client async, not fetching.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write thunk from memory. Five lines. Then write applyMiddleware —
//   reduceRight is the trick.
//
// Task 2:
//   Write a logger middleware. Then swap the order in applyMiddleware and
//   watch the onion invert.
//
// Task 3:
//   Cause the infinite loop: call store.dispatch(action) instead of
//   next(action). Now you will never confuse them again.
//
// Task 4:
//   Add cancellation to §7's racing thunk with an AbortController and a
//   requestId. You have just re-derived createAsyncThunk.
//
// Task 5:
//   Use withExtraArgument to inject a fake API. Test a thunk with zero mocks.
//
// Task 6:
//   Explain in 60 seconds why a fetch in a reducer breaks time travel, to
//   someone who thinks middleware is over-engineering.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   `if (typeof action === "function") return action(dispatch, getState)`.
//   That is the whole library.
//
// If you remember the common bug:
//   Thunks cannot be cancelled, so the slow first request overwrites the fast
//   second one. And next vs dispatch decides whether you loop forever.
//
// If you remember the professional framing:
//   Middleware exists because reducers must be pure. And thunks are for client
//   async now — server data left Redux years ago.
//
// NEXT TOPIC -> 07_redux-saga-concepts.js
