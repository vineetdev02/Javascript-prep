// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  06_usereducer-vs-usestate.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useReducer vs useState
//
// WHAT YOU WILL MASTER HERE:
//   1. useState is BUILT ON useReducer — prove it by implementing both
//   2. The impossible-state bug, and how a reducer makes it unrepresentable
//   3. dispatch is stable, setState is stable — what that buys you
//   4. The real decision rule (it is not "complex state")
//   5. Why a reducer must be pure (StrictMode double-invokes it)
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/06_usereducer-vs-usestate.js"
//
// Prerequisite: 01_usestate-internals.js.
// Related: 04_state-patterns/05_redux-actions-reducers-store.js — same idea,
// bigger scope.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useReducer:
// State updates expressed as (state, action) => newState, so components
// DESCRIBE what happened instead of computing what the state becomes.
//
// If interviewer says "explain it simply", say:
// "Instead of setState(newValue) scattered around the component, you
//  dispatch an action like {type:'added_todo'} and one pure function decides
//  the next state. All the update logic lives in one place."
//
// If interviewer asks "why does it matter?", say:
// "Because the transitions become a closed set. When five setStates have to
//  fire together to stay consistent, someone eventually forgets one and you
//  get an impossible state — loading AND error at the same time. A reducer
//  makes that unrepresentable, and it moves the logic somewhere you can
//  unit test without React."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   describe WHAT HAPPENED, not what changes
//
// The shift:
//
//   useState  → "set loading to false, set data to X, set error to null"
//                (the component knows HOW state changes — imperative)
//
//   useReducer → "FETCH_SUCCESS with this payload"
//                (the component knows WHAT HAPPENED — declarative)
//                (the reducer knows how — in one place)
//
// The relationship — this is the interview gold:
//   useState IS useReducer with a built-in reducer.
//
//     function stateReducer(state, action) {
//       return typeof action === "function" ? action(state) : action;
//     }
//     const useState = (init) => useReducer(stateReducer, init);
//
//   That is not an analogy. That is essentially React's implementation, and
//   it explains why setCount(c => c + 1) works: the "action" is your updater
//   function. §3 builds both.
//
// Runtime rule:
//   The reducer must be PURE. React may call it twice (StrictMode) and
//   replay actions during concurrent rendering. Side effects inside a
//   reducer will fire twice or fire for a render that never commits.
//
// Practical rule:
//   Reach for useReducer when the next state depends on the previous one AND
//   several fields must change together. Not because "state is complex".
//
// Common trap:
//   "useReducer is for complex state." Too vague. A 10-field form of
//   independent fields is fine with useState. Two fields that must move
//   together already justify a reducer.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD BOTH, AND SHOW ONE IS THE OTHER
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  let renderCount = 0;

  // ── THE PRIMITIVE. Everything below is built on this. ───────────
  function useReducer(reducer, initialArg, init) {
    const slot = cursor++;
    if (!(slot in hooks)) {
      hooks[slot] = {
        state: init ? init(initialArg) : initialArg,   // lazy init
        // dispatch is created ONCE and never changes identity:
        dispatch: (action) => {
          const next = reducer(hooks[slot].state, action);
          if (Object.is(next, hooks[slot].state)) return;   // bail out
          hooks[slot].state = next;
          render();
        },
      };
    }
    return [hooks[slot].state, hooks[slot].dispatch];
  }

  // ── useState, IMPLEMENTED WITH useReducer ──────────────────────
  function stateReducer(state, action) {
    // The "action" for useState is either a value or an updater function.
    return typeof action === "function" ? action(state) : action;
  }

  function useState(initial) {
    return useReducer(
      stateReducer,
      initial,
      typeof initial === "function" ? () => initial() : undefined
    );
  }
  // That is the whole hook. setCount(5) dispatches the action 5.
  // setCount(c => c+1) dispatches the action `c => c+1`, and stateReducer
  // calls it. The functional updater IS an action.

  function render() {
    cursor = 0;
    renderCount++;
    return component();
  }

  function mount(fn) {
    component = fn;
    return render();
  }

  return { useReducer, useState, mount, getRenderCount: () => renderCount };
}

console.log("§3 — useState built on useReducer:\n");

const R1 = createMiniReact();
let setCount1, dispatch1;

R1.mount(() => {
  const [count, setCount] = R1.useState(0);              // ← our useState
  const [count2, dispatch] = R1.useReducer(              // ← raw useReducer
    (s, a) => a.type === "inc" ? s + 1 : s, 0);
  setCount1 = setCount;
  dispatch1 = dispatch;
  return { count, count2 };
});

setCount1(5);
setCount1(c => c + 1);        // the updater form — an "action" that is a function
dispatch1({ type: "inc" });

console.log("  setCount(5)        → dispatches the action `5`");
console.log("  setCount(c => c+1) → dispatches the action `c => c+1`");
console.log("  dispatch({type})   → dispatches an action object");
console.log("\n  All three go through the SAME useReducer machinery. useState's");
console.log("  reducer is just: (state, action) => typeof action === 'function'");
console.log("  ? action(state) : action");
console.log("\n  This is why the functional updater exists at all — it was");
console.log("  always an action. React implements useState this way.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE IMPOSSIBLE STATE
// ══════════════════════════════════════════════════════════════════
//
// The argument that actually justifies useReducer.

console.log("§4 — four booleans, sixteen states, four of them legal:\n");

// ── useState version — every field independent ─────────────────
function useStateVersion() {
  const state = { loading: false, error: null, data: null };
  const log = [];

  const setLoading = (v) => { state.loading = v; };
  const setError = (v) => { state.error = v; };
  const setData = (v) => { state.data = v; };

  // The fetch flow, written the way people actually write it:
  setLoading(true);
  log.push({ ...state });

  // ...request fails...
  setError("500");
  // 🐛 THE BUG: someone forgot setLoading(false). One missing line.
  log.push({ ...state });

  return log;
}

// ── useReducer version — transitions are a closed set ──────────
function fetchReducer(state, action) {
  switch (action.type) {
    case "FETCH_START":
      // Every field is set. Not "some fields" — the whole next state.
      return { status: "loading", data: null, error: null };
    case "FETCH_SUCCESS":
      return { status: "success", data: action.payload, error: null };
    case "FETCH_ERROR":
      return { status: "error", data: null, error: action.error };
    default:
      return state;
  }
}

function useReducerVersion() {
  const log = [];
  let state = { status: "idle", data: null, error: null };
  const dispatch = (action) => { state = fetchReducer(state, action); log.push({ ...state }); };

  dispatch({ type: "FETCH_START" });
  dispatch({ type: "FETCH_ERROR", error: "500" });
  return log;
}

const stateLog = useStateVersion();
const reducerLog = useReducerVersion();

console.log("  useState — after the request fails:");
console.log("   ", JSON.stringify(stateLog[stateLog.length - 1]));
console.log("    🐛 loading:true AND error:'500' at the same time.");
console.log("       The UI shows a spinner ON TOP of an error message,");
console.log("       forever. One forgotten setLoading(false).\n");

console.log("  useReducer — same failure:");
console.log("   ", JSON.stringify(reducerLog[reducerLog.length - 1]));
console.log("    ✅ status:'error'. It is IMPOSSIBLE to be loading and errored,");
console.log("       because status is one field with one value. The bug is not");
console.log("       fixed — it cannot be written.\n");

console.log("  This is the real argument. Not 'complex state'. It is that");
console.log("  independent booleans multiply: 4 booleans = 16 combinations,");
console.log("  and maybe 4 are legal. A reducer collapses that to one field");
console.log("  and a closed set of transitions.");
console.log("  → 15_state-machines-xstate-intro.js takes this to its conclusion.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — dispatch IS STABLE (and so is setState)
// ══════════════════════════════════════════════════════════════════

console.log("§5 — identity stability:\n");

const R2 = createMiniReact();
const dispatches = [];
const setters = [];
let bump;

R2.mount(() => {
  const [n, setN] = R2.useState(0);
  const [, dispatch] = R2.useReducer((s) => s, 0);
  setters.push(setN);
  dispatches.push(dispatch);
  bump = () => setN(n + 1);
  return n;
});

bump(); bump();

console.log("  after 3 renders:");
console.log("    dispatch identity stable?",
  dispatches[0] === dispatches[1] && dispatches[1] === dispatches[2]);
console.log("    setState identity stable?",
  setters[0] === setters[1] && setters[1] === setters[2]);

console.log("\n  BOTH are stable. React guarantees it. This matters because:");
console.log("    • you can pass dispatch to a memoized child — no useCallback");
console.log("    • you can put dispatch in a dep array — it never fires");
console.log("    • you can put dispatch in a context — consumers never");
console.log("      re-render from it (→ the split-context pattern, file 04 §7)");
console.log("\n  ⚠️  A common myth: 'useReducer is better because dispatch is");
console.log("     stable.' setState is stable too. The real advantage is that");
console.log("     ONE stable dispatch replaces FIVE stable setters — a child");
console.log("     needs one prop instead of five, and the parent stops");
console.log("     exporting its update logic.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE REDUCER MUST BE PURE
// ══════════════════════════════════════════════════════════════════

console.log("§6 — an impure reducer, double-invoked:\n");

let apiCalls = 0;
const analytics = [];

function impureReducer(state, action) {
  apiCalls++;                                 // 🐛 side effect
  analytics.push(action.type);                // 🐛 side effect
  return { count: state.count + 1 };
}

function pureReducer(state, action) {
  return action.type === "inc" ? { count: state.count + 1 } : state;
}

// StrictMode calls the reducer twice to check purity:
function strictDispatch(reducer, state, action) {
  const first = reducer(state, action);
  const second = reducer(state, action);      // ← React does this in dev
  return { first, second };
}

const impureResult = strictDispatch(impureReducer, { count: 0 }, { type: "inc" });
apiCalls = 0; analytics.length = 0;
strictDispatch(impureReducer, { count: 0 }, { type: "inc" });

console.log("  impure reducer, double-invoked:");
console.log("    API calls fired:", apiCalls, "← the side effect ran TWICE");
console.log("    analytics logged:", JSON.stringify(analytics));
console.log("    same result both times?",
  JSON.stringify(impureResult.first) === JSON.stringify(impureResult.second));

const pureResult = strictDispatch(pureReducer, { count: 0 }, { type: "inc" });
console.log("\n  pure reducer, double-invoked:");
console.log("    same result both times?",
  JSON.stringify(pureResult.first) === JSON.stringify(pureResult.second));
console.log("    side effects:", 0);

console.log("\n  A reducer runs during the RENDER phase, which React may");
console.log("  discard or replay. Fetches, logging, and mutation belong in");
console.log("  event handlers or effects — never in the reducer.");
console.log("\n  Note the impure one returned the same VALUE both times. Purity");
console.log("  is not only about the return value — it is about the effects.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE DECISION RULE
// ══════════════════════════════════════════════════════════════════
//
// The vague version ("complex state → useReducer") helps nobody. Here is
// the version you can actually apply:
//
//   Use useREDUCER when:
//     ✓ several state fields must change TOGETHER to stay consistent
//       (loading + data + error — the §4 case)
//     ✓ the next state depends on the previous one in a non-trivial way
//       (undo/redo stacks, multi-step wizards, drag state)
//     ✓ the same transition is triggered from many places
//       (a reset that must clear seven fields the same way every time)
//     ✓ you want to unit test the update logic without React
//       (a reducer is a pure function — the test needs no render)
//     ✓ you are passing several setters down through props/context
//       (one dispatch replaces them all)
//
//   Use useSTATE when:
//     ✓ the fields are independent (a form of unrelated inputs)
//     ✓ the value is a primitive that just... changes (isOpen, query)
//     ✓ the update is genuinely trivial
//
//   Neither, if:
//     ✗ it is SERVER data → React Query. Not a reducer. Not a store.
//     ✗ it can be DERIVED from existing state → compute during render
//       (→ 12_derived-state.js)
//     ✗ it is only used by one deeply-nested component → keep it there
//
// The honest note:
//   Migrating useState → useReducer is cheap and mechanical. Do not
//   agonize. Start with useState, and when you catch yourself writing the
//   third setState in one handler, that IS the signal.


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version                Real React
//   ───────────                ──────────
//   state stored directly      an update QUEUE on the hook, replayed during
//                              render — this is what makes the functional
//                              updater and concurrent replay work
//   dispatch calls reducer     dispatch queues the action; the reducer runs
//                              in the next RENDER, not at dispatch time
//   n/a                        an eager-state optimization: React may run the
//                              reducer at dispatch time to check for a bailout
//                              — which is why a reducer can be called with
//                              stale-looking state. Another purity reason.
//   useState via useReducer    genuinely how it works — basicStateReducer in
//                              ReactFiberHooks.js is the same function as §3
//   n/a                        useActionState (React 19) — a reducer for
//                              async form actions with pending state built in
//
// A precise fact worth quoting:
//   dispatch does not update the state synchronously. If you dispatch twice
//   in one handler, the second reducer call receives the result of the first —
//   because they are queued and replayed in order, not applied immediately.
//   This is exactly why the functional updater fixes the stale closure.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Spinner on top of an error message forever:
//   A forgotten setLoading(false). → §4. The reducer makes it impossible.
//
// Bug 2 — A fetch fires twice in dev:
//   A side effect inside the reducer + StrictMode. → §6.
//
// Bug 3 — Mutating state inside the reducer:
//   state.items.push(x); return state;
//   Same reference → Object.is bails out → NO re-render. The classic.
//   Fix: return { ...state, items: [...state.items, x] } — or use Immer.
//   → 13_immutable-state-updates.js
//
// Bug 4 — The reducer returns undefined:
//   A missing default case, or a switch branch with no return. State becomes
//   undefined and the component crashes. ALWAYS have a default.
//
// Bug 5 — Reading state right after dispatch:
//   dispatch({type:'inc'}); console.log(count) → the OLD value. Same as
//   setState — count is a const in this render.
//
// Bug 6 — Async logic in the reducer:
//   Reducers are synchronous and pure. Do the async work in a handler or
//   effect, then dispatch the result.
//
// Bug 7 — useReducer everywhere because "it is more scalable":
//   A reducer for isOpen is ceremony. It costs readability and buys nothing.
//
// Bug 8 — Actions named for the SETTER, not the EVENT:
//   { type: 'SET_LOADING_TRUE' } is a setState wearing a costume. Prefer
//   { type: 'FETCH_STARTED' } — name what HAPPENED. This is the difference
//   between a reducer and a switch statement.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// useState IS useReducer:
const R3 = createMiniReact();
let set3;
R3.mount(() => {
  const [n, set] = R3.useState(10);
  set3 = set;
  return n;
});
set3(20);
set3(n => n + 5);
assert(R3.getRenderCount() === 3, "both the value form and the updater form work");
assert(R3.useState !== R3.useReducer, "they are different hooks...");
// ...but one is implemented with the other — proven by the updater working:
assert(typeof ((s, a) => typeof a === "function" ? a(s) : a)(10, n => n + 5) === "number",
  "stateReducer: a function action is CALLED, a value action is RETURNED");

// The impossible state:
const badState = stateLog[stateLog.length - 1];
assert(badState.loading === true && badState.error === "500",
  "useState: loading AND error at once — an impossible state, reachable");
const goodState = reducerLog[reducerLog.length - 1];
assert(goodState.status === "error", "useReducer: one status field");
assert(goodState.data === null, "...and FETCH_ERROR reset data as part of the transition");
assert(!("loading" in goodState),
  "there is no `loading` field to forget — the bug is unrepresentable");

// Stability:
assert(dispatches[0] === dispatches[2], "dispatch identity never changes");
assert(setters[0] === setters[2], "setState identity never changes EITHER");

// Purity:
assert(apiCalls === 2, "an impure reducer fires its side effect on every invoke");
assert(JSON.stringify(pureResult.first) === JSON.stringify(pureResult.second),
  "a pure reducer gives the same answer every time");

// The mutation bug:
const mutatingReducer = (s) => { s.count++; return s; };
const before = { count: 0 };
const after = mutatingReducer(before);
assert(Object.is(before, after),
  "a mutating reducer returns the SAME reference → React bails out → no render 🐛");

console.log("§10 — mini assertions passed for: useReducer vs useState");
console.log("\n  The sharpest one: `!('loading' in goodState)`. You cannot");
console.log("  forget to reset a field that does not exist.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "useReducer vs useState?", answer like this:
//
//   "They're the same machinery — useState is literally useReducer with a
//    built-in reducer: (state, action) => typeof action === 'function' ?
//    action(state) : action. That's why setCount(c => c + 1) works; the
//    updater IS an action. So the question isn't capability, it's how you
//    express updates.
//
//    useState says HOW state changes — set loading false, set data, set
//    error. useReducer says WHAT HAPPENED — FETCH_ERROR — and one pure
//    function decides the rest.
//
//    The argument I'd actually make isn't 'complex state', which is too
//    vague. It's impossible states. Four independent booleans is sixteen
//    combinations and maybe four are legal, so eventually someone forgets a
//    setLoading(false) and you ship a spinner rendered on top of an error
//    message. With a reducer, FETCH_ERROR sets the whole next state at once,
//    and status is one field — being loading and errored simultaneously isn't
//    a bug you fixed, it's a state you can't write. That's the win.
//
//    Secondary benefits: the reducer is a pure function, so I can unit test
//    the transitions without rendering anything. And one stable dispatch
//    replaces five setters through props or context — though I'd push back
//    on the common claim that dispatch's stability is the advantage, since
//    setState is stable too.
//
//    The rule I use: several fields that must move together, or the next
//    state depending on the previous non-trivially. Independent fields stay
//    useState. And if it's server data, neither — that's React Query."
//
// The impossible-state framing and correcting the dispatch-stability myth
// are what make this senior.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is the relationship between them?
// A1. useState is useReducer with a built-in reducer that either calls a
//     function action or returns a value action. Same hook machinery.
//
// Q2. When would you actually reach for useReducer?
// A2. When several fields must change together, when the next state depends
//     on the previous, or when you are threading multiple setters downward.
//
// Q3. Is dispatch more stable than setState?
// A3. No — both are guaranteed stable. The advantage is one dispatch instead
//     of five setters.
//
// Q4. Why must a reducer be pure?
// A4. It runs in the render phase, which React can discard, replay, or
//     double-invoke in StrictMode. Side effects would fire for renders that
//     never happened.
//
// Q5. What happens if the reducer mutates state?
// A5. It returns the same reference, React bails out via Object.is, and
//     nothing re-renders. A silent no-op.
//
// Q6. Can a reducer be async?
// A6. No. Do the async work outside, then dispatch the result. Or use a
//     middleware layer like Redux Thunk if you need it in a store.
//
// Q7. Does dispatch update the state immediately?
// A7. No. It queues the action; the reducer runs during the next render.
//     Reading state right after dispatch gives the old value.
//
// Q8. Is useReducer just Redux?
// A8. Same reducer concept, no store. No middleware, no devtools, no global
//     subscription — and its state is local to the component.
//
// Q9. How do you name actions well?
// A9. After the EVENT, not the setter. FETCH_STARTED, not SET_LOADING_TRUE.
//     If your actions are named after setters, you wrote a switch statement.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useReducer?
//   Back : (state, action) => newState. Describe what happened, not how to change.
//
// Flashcard 2:
//   Front: What is the relationship to useState?
//   Back : useState IS useReducer with a built-in reducer. The updater is an action.
//
// Flashcard 3:
//   Front: What is the real argument for it?
//   Back : Impossible states become unrepresentable. Not "complex state".
//
// Flashcard 4:
//   Front: What is the runtime rule?
//   Back : The reducer must be pure — render phase, may be double-invoked.
//
// Flashcard 5:
//   Front: What is the most common trap?
//   Back : Mutating state in the reducer → same reference → no re-render.
//
// Flashcard 6:
//   Front: Is dispatch more stable than setState?
//   Back : No. Both are stable. One dispatch replacing five setters is the win.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Name actions after EVENTS, and cite the spinner-over-error bug.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write useState in terms of useReducer from memory. Two lines. Then
//   explain why setCount(c => c+1) works for free.
//
// Task 2:
//   Add a real update QUEUE to useReducer: dispatch pushes, render replays.
//   Now dispatch twice in a row and prove the second sees the first's result.
//
// Task 3:
//   Write undo/redo with a reducer: { past: [], present, future: [] }.
//   Try it with useState first and feel the difference.
//
// Task 4:
//   Unit test fetchReducer from §4 — no React, no render, no mount. That
//   ease IS the argument.
//
// Task 5:
//   Break §4's reducer: make FETCH_ERROR return { ...state, error } instead
//   of the full state. Watch the impossible state come back.
//
// Task 6:
//   Explain in 60 seconds why a reducer prevents the spinner-over-error bug,
//   without using the word "reducer".


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   useState IS useReducer with a built-in reducer. The choice is about
//   expression, not power.
//
// If you remember the common bug:
//   Independent booleans reach impossible states — loading AND error. And a
//   mutating reducer silently never re-renders.
//
// If you remember the professional framing:
//   Make impossible states unrepresentable, name actions after events, keep
//   the reducer pure and testable without React.
//
// NEXT TOPIC -> 07_usememo-when-to-use.js
