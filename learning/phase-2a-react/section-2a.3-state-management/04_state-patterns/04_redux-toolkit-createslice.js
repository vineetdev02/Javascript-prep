// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  04_redux-toolkit-createslice.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Redux Toolkit — createSlice
//
// WHAT YOU WILL MASTER HERE:
//   1. What createSlice actually generates — build it yourself
//   2. Why `state.value += 1` is NOT mutation (Immer, demystified)
//   3. The 3-file → 1-file collapse, measured
//   4. The mutation trap that STILL exists inside a slice
//   5. createAsyncThunk and extraReducers
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/04_redux-toolkit-createslice.js"
//
// Prerequisites: 02_built-in-hooks/06_usereducer-vs-usestate.js.
// Deeper on the primitives: 05_redux-actions-reducers-store.js (next file).


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// createSlice:
// Takes a name, an initial state, and reducer functions — and GENERATES the
// action types, the action creators, and the reducer for you.
//
// If interviewer says "explain it simply", say:
// "You write the update logic, and RTK derives everything else. One function
//  named `increment` becomes the action type 'counter/increment', the action
//  creator increment(), and a case in the reducer."
//
// If interviewer asks "why does it matter?", say:
// "Because classic Redux made you write the same thing three times in three
//  files — a constant, a creator, and a switch case — and every one was a
//  chance to typo a string. createSlice made Redux's boilerplate criticism
//  obsolete. It also bundles Immer, so you write `state.value += 1` and get
//  an immutable update, which is the single biggest source of silent Redux
//  bugs eliminated."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   write the reducer, get everything else generated
//
// What you write:
//
//   const counterSlice = createSlice({
//     name: "counter",
//     initialState: { value: 0 },
//     reducers: {
//       increment: (state) => { state.value += 1; },
//       addBy: (state, action) => { state.value += action.payload; },
//     },
//   });
//
// What you GET:
//
//   counterSlice.actions.increment   → () => ({ type: "counter/increment" })
//   counterSlice.actions.addBy       → (n) => ({ type: "counter/addBy", payload: n })
//   counterSlice.reducer             → (state, action) => newState
//   counterSlice.name                → "counter"
//
// The naming rule: `${name}/${reducerKey}`. That is where the action type
// comes from — you never type the string.
//
// Runtime rule:
//   `state.value += 1` looks like mutation and is not. RTK wraps state in an
//   Immer DRAFT — a Proxy that records your writes and produces a new
//   immutable object. You mutate the draft; Immer returns a new state.
//
// Practical rule:
//   Either MUTATE the draft or RETURN a new state. Never both in one reducer.
//
// Common trap:
//   Believing the Immer magic is total. It is not — you can still break it,
//   and the ways are subtle. → §6


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD createSlice
// ══════════════════════════════════════════════════════════════════

// A miniature Immer: a Proxy that records writes and produces a new object.
function produce(baseState, recipe) {
  let modified = false;
  const copy = Array.isArray(baseState) ? [...baseState] : { ...baseState };

  const draft = new Proxy(copy, {
    set(target, prop, value) {
      modified = true;                    // ← the write is RECORDED, not applied
      target[prop] = value;               //    to the original
      return true;
    },
    get(target, prop) {
      const value = target[prop];
      // Nested objects need their own draft, or a nested write would hit the
      // ORIGINAL object. This is why real Immer recursively proxies.
      if (value && typeof value === "object") {
        return new Proxy(Array.isArray(value) ? [...value] : { ...value }, {
          set(t, p, v) { modified = true; t[p] = v; target[prop] = t; return true; },
          get(t, p) { return t[p]; },
        });
      }
      return value;
    },
  });

  const result = recipe(draft);

  // Immer's rule: return a new state OR mutate the draft. Not both.
  if (result !== undefined && modified) {
    throw new Error(
      "[Immer] An immer producer returned a new value *and* modified its draft. " +
      "Either return a new value *or* modify the draft."
    );
  }
  if (result !== undefined) return result;      // you returned → use it
  if (!modified) return baseState;              // nothing changed → SAME reference
  return copy;                                  // you mutated → a new object
}

// createSlice itself:
function createSlice({ name, initialState, reducers, extraReducers }) {
  const actions = {};
  const caseReducers = {};

  for (const [key, caseReducer] of Object.entries(reducers)) {
    const type = `${name}/${key}`;              // ← THE naming rule

    // Generate the action creator:
    const actionCreator = (payload) => ({ type, payload });
    actionCreator.type = type;
    actionCreator.toString = () => type;        // so it works as an object key!
    actions[key] = actionCreator;

    caseReducers[type] = caseReducer;
  }

  // Generate the reducer:
  const reducer = (state = initialState, action = {}) => {
    const caseReducer = caseReducers[action.type];
    if (caseReducer) return produce(state, (draft) => caseReducer(draft, action));

    if (extraReducers) {
      const extra = extraReducers[action.type];
      if (extra) return produce(state, (draft) => extra(draft, action));
    }
    return state;
  };

  return { name, actions, reducer, caseReducers };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — WHAT ONE SLICE GENERATES
// ══════════════════════════════════════════════════════════════════

console.log("§4 — you write 3 reducers, RTK generates 9 things:\n");

const counterSlice = createSlice({
  name: "counter",
  initialState: { value: 0, history: [] },
  reducers: {
    increment: (state) => { state.value += 1; },
    decrement: (state) => { state.value -= 1; },
    addBy: (state, action) => { state.value += action.payload; },
  },
});

const { increment, decrement, addBy } = counterSlice.actions;

console.log("  you wrote:  increment, decrement, addBy\n");
console.log("  you got:");
console.log("    action types  :", Object.values(counterSlice.actions).map(a => a.type));
console.log("    action creators: increment() →", JSON.stringify(increment()));
console.log("                     addBy(5)    →", JSON.stringify(addBy(5)));
console.log("    a reducer     :", typeof counterSlice.reducer);
console.log("\n  Note the type string 'counter/increment'. You never typed it —");
console.log("  it is `${name}/${key}`. That is the whole naming convention, and");
console.log("  it is why action types cannot typo anymore.\n");

// Run the reducer:
let state = counterSlice.reducer(undefined, {});
console.log("  running the reducer:");
console.log("    initial      :", JSON.stringify(state));
state = counterSlice.reducer(state, increment());
console.log("    increment()  :", JSON.stringify(state));
state = counterSlice.reducer(state, addBy(10));
console.log("    addBy(10)    :", JSON.stringify(state));
state = counterSlice.reducer(state, decrement());
console.log("    decrement()  :", JSON.stringify(state));
console.log("    unknown action:",
  JSON.stringify(counterSlice.reducer(state, { type: "other/thing" })),
  "← unchanged ✅\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — "MUTATION" THAT IS NOT MUTATION
// ══════════════════════════════════════════════════════════════════
//
// The single most-asked RTK question.

console.log("§5 — state.value += 1 does NOT mutate your state:\n");

const before = { value: 0, history: [] };
const after = counterSlice.reducer(before, increment());

console.log("  const before = { value: 0 };");
console.log("  const after  = reducer(before, increment());\n");
console.log("    before:", JSON.stringify(before), "← UNTOUCHED ✅");
console.log("    after :", JSON.stringify(after));
console.log("    same object?", Object.is(before, after), "← a NEW object ✅");

console.log("\n  HOW: RTK wraps `state` in an Immer DRAFT — a Proxy. When you");
console.log("  write `state.value += 1`, the Proxy's `set` trap RECORDS the");
console.log("  write against a copy. Your original is never touched. At the end");
console.log("  Immer returns the copy.");
console.log("\n  So the code READS imperative and BEHAVES immutable. That is the");
console.log("  point: the immutable version of a nested update is genuinely");
console.log("  awful to write, and awful code is where bugs live. → file 14\n");

// Immer's bailout — a genuinely nice detail:
const noChange = counterSlice.reducer(before, { type: "counter/nothing" });
console.log("  and if a reducer changes NOTHING:");
console.log("    same reference?", Object.is(before, noChange),
  "✅ Immer returns the ORIGINAL");
console.log("    → which means React's Object.is bailout fires and NOTHING");
console.log("      re-renders. Immer's structural sharing is a performance");
console.log("      feature, not just an ergonomics one.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE MUTATION TRAPS THAT STILL EXIST
// ══════════════════════════════════════════════════════════════════
//
// "RTK uses Immer so I can't have mutation bugs." Not true, and this is
// exactly what separates people who have shipped RTK from people who read
// the docs.

console.log("§6 — three ways to still get it wrong:\n");

// TRAP 1 — returning AND mutating.
const trap1 = createSlice({
  name: "t1",
  initialState: { value: 0 },
  reducers: {
    bad: (state) => {
      state.value += 1;                   // mutate the draft...
      return { value: 99 };               // ...AND return. 💥
    },
  },
});

let trap1Error;
try {
  trap1.reducer({ value: 0 }, trap1.actions.bad());
} catch (e) {
  trap1Error = e.message;
}
console.log("  TRAP 1 — mutate AND return:");
console.log("    💥", trap1Error.slice(0, 66) + "...");
console.log("    Immer cannot know which one you meant. Pick one.\n");

// TRAP 2 — reassigning the draft parameter.
const trap2 = createSlice({
  name: "t2",
  initialState: { value: 0 },
  reducers: {
    // ❌ this does NOTHING — you rebound a local variable
    reassign: (state) => { state = { value: 99 }; void state; },
    // ✅ this works — return it
    replace: () => ({ value: 99 }),
  },
});

const reassigned = trap2.reducer({ value: 0 }, trap2.actions.reassign());
const replaced = trap2.reducer({ value: 0 }, trap2.actions.replace());

console.log("  TRAP 2 — reassigning the draft:");
console.log("    state = { value: 99 }  →", JSON.stringify(reassigned),
  "🐛 silently does NOTHING");
console.log("    return { value: 99 }   →", JSON.stringify(replaced), "✅");
console.log("    `state` is a function PARAMETER. Reassigning it rebinds a");
console.log("    local name — Immer never sees it. No error, no change.\n");

// TRAP 3 — mutating state OUTSIDE a reducer.
const externalObject = { items: [1, 2] };
const trap3 = createSlice({
  name: "t3",
  initialState: externalObject,
  reducers: {
    addItem: (state, action) => { state.items.push(action.payload); },
  },
});
const t3After = trap3.reducer(externalObject, trap3.actions.addItem(3));

console.log("  TRAP 3 — Immer only protects INSIDE the reducer:");
console.log("    inside  → state.items.push(3) :", JSON.stringify(t3After.items),
  "✅ new array");
console.log("    original:", JSON.stringify(externalObject.items), "← untouched ✅");
externalObject.items.push(999);          // someone mutates it directly
console.log("    but if code elsewhere does store.getState().items.push(999):");
console.log("      →", JSON.stringify(externalObject.items),
  "🐛 Immer was never involved");
console.log("    RTK's dev-mode middleware catches this with a mutation check.");
console.log("    In production it is silent, and the UI just does not update.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE BOILERPLATE COLLAPSE
// ══════════════════════════════════════════════════════════════════

console.log("§7 — classic Redux vs createSlice:\n");

// Classic Redux — the same feature, by hand:
const classic = {
  "actionTypes.js": [
    'export const INCREMENT = "counter/INCREMENT";',
    'export const DECREMENT = "counter/DECREMENT";',
    'export const ADD_BY = "counter/ADD_BY";',
  ],
  "actions.js": [
    'export const increment = () => ({ type: INCREMENT });',
    'export const decrement = () => ({ type: DECREMENT });',
    'export const addBy = (n) => ({ type: ADD_BY, payload: n });',
  ],
  "reducer.js": [
    'export default function counterReducer(state = initial, action) {',
    '  switch (action.type) {',
    '    case INCREMENT: return { ...state, value: state.value + 1 };',
    '    case DECREMENT: return { ...state, value: state.value - 1 };',
    '    case ADD_BY:    return { ...state, value: state.value + action.payload };',
    '    default: return state;',
    '  }',
    '}',
  ],
};

const classicLines = Object.values(classic).flat().length;
const rtkLines = 9;   // the createSlice call in §4

console.log("  classic Redux:");
for (const [file, lines] of Object.entries(classic)) {
  console.log(`    ${file.padEnd(16)} ${lines.length} lines`);
}
console.log(`    ${"TOTAL".padEnd(16)} ${classicLines} lines across 3 files\n`);
console.log("  createSlice:");
console.log(`    counterSlice.js  ${rtkLines} lines, 1 file\n`);
console.log(`    ${classicLines} → ${rtkLines} lines for 3 actions.`);

// The honest version: the line count is not the real story. Watch how each
// scales as you add actions — that IS the story.
function classicCost(actions) { return actions * 3 + 5; }   // type + creator + case, plus scaffolding
function rtkCost(actions) { return actions + 6; }           // one line each, plus the wrapper

console.log("\n  ...but the line count is not really the point. Watch it SCALE:\n");
console.log("    actions | classic | RTK | files to edit per new action");
console.log("    --------|---------|-----|----------------------------");
for (const n of [3, 10, 25]) {
  console.log(`    ${String(n).padStart(7)} | ${String(classicCost(n)).padStart(7)} | ` +
    `${String(rtkCost(n)).padStart(3)} | classic: 3, RTK: 1`);
}

console.log("\n  Classic Redux costs THREE lines in THREE files per action —");
console.log("  a constant, a creator, and a switch case — and the string that");
console.log("  ties them together is typed twice and checked by nobody.");
console.log("  RTK costs one function in one file.\n");
console.log("    Plus, in every case:");
console.log("      • the action type string exists ONCE (generated)");
console.log("      • no switch, no default case to forget");
console.log("      • no manual spreading → no accidental shallow-copy bugs");
console.log("\n  'Redux has too much boilerplate' was true in 2017 and has been");
console.log("  false since 2019. RTK is the official, recommended way to write");
console.log("  Redux — the docs are explicit that hand-written Redux is legacy.");
console.log("  Saying 'Redux is boilerplate-heavy' in an interview dates you.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — createAsyncThunk AND extraReducers
// ══════════════════════════════════════════════════════════════════
//
// `reducers` handles YOUR actions. `extraReducers` handles actions from
// ELSEWHERE — another slice, or a thunk's auto-generated lifecycle.
//
//   const fetchUser = createAsyncThunk(
//     "user/fetch",                              // ← the type PREFIX
//     async (userId) => {
//       const res = await fetch(`/api/users/${userId}`);
//       return res.json();                       // ← becomes action.payload
//     }
//   );
//
// That ONE call generates THREE action types automatically:
//   user/fetch/pending
//   user/fetch/fulfilled
//   user/fetch/rejected
//
//   const userSlice = createSlice({
//     name: "user",
//     initialState: { data: null, status: "idle", error: null },
//     reducers: {},                              // no sync actions needed
//     extraReducers: (builder) => {
//       builder
//         .addCase(fetchUser.pending,   (s) => { s.status = "loading"; })
//         .addCase(fetchUser.fulfilled, (s, a) => { s.status = "succeeded"; s.data = a.payload; })
//         .addCase(fetchUser.rejected,  (s, a) => { s.status = "failed"; s.error = a.error.message; });
//     },
//   });
//
// Note the shape: ONE status field, not three booleans. That is the
// impossible-states lesson from useReducer, baked into RTK's own docs.
// → 02_built-in-hooks/06_usereducer-vs-usestate.js §4

console.log("§8 — createAsyncThunk generates three actions:\n");

function createAsyncThunk(typePrefix, payloadCreator) {
  const thunk = (arg) => async (dispatch) => {
    dispatch({ type: `${typePrefix}/pending` });
    try {
      const payload = await payloadCreator(arg);
      dispatch({ type: `${typePrefix}/fulfilled`, payload });
    } catch (error) {
      dispatch({ type: `${typePrefix}/rejected`, error: { message: error.message } });
    }
  };
  thunk.pending = { type: `${typePrefix}/pending` };
  thunk.fulfilled = { type: `${typePrefix}/fulfilled` };
  thunk.rejected = { type: `${typePrefix}/rejected` };
  return thunk;
}

const fetchUser = createAsyncThunk("user/fetch", async (id) => {
  if (id === 0) throw new Error("Not found");
  return { id, name: "Vineet" };
});

const userSlice = createSlice({
  name: "user",
  initialState: { data: null, status: "idle", error: null },
  reducers: {},
  extraReducers: {
    [fetchUser.pending.type]: (s) => { s.status = "loading"; },
    [fetchUser.fulfilled.type]: (s, a) => { s.status = "succeeded"; s.data = a.payload; },
    [fetchUser.rejected.type]: (s, a) => { s.status = "failed"; s.error = a.error.message; },
  },
});

console.log("  createAsyncThunk('user/fetch', ...) generates:");
console.log("   ", [fetchUser.pending.type, fetchUser.fulfilled.type, fetchUser.rejected.type]);

async function runThunk(action) {
  let s = userSlice.reducer(undefined, {});
  const dispatch = (a) => { s = userSlice.reducer(s, a); };
  await action(dispatch);
  return s;
}

console.log("\n  the success path:");
const ok = await runThunk(fetchUser(1));
console.log("   ", JSON.stringify(ok));

console.log("\n  the failure path:");
const failed = await runThunk(fetchUser(0));
console.log("   ", JSON.stringify(failed));

console.log("\n  Note ONE `status` field, not isLoading + isError + isSuccess.");
console.log("  RTK's own docs use this shape because three booleans give you");
console.log("  eight combinations and four are impossible.");
console.log("  → 02_built-in-hooks/06_usereducer-vs-usestate.js §4");
console.log("\n  ⚠️  Honest note: if this is SERVER data, RTK Query or React Query");
console.log("     does all of this — plus caching, dedup, and revalidation —");
console.log("     with no slice at all. createAsyncThunk is the right tool when");
console.log("     the async result feeds CLIENT state. → file 10\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL RTK DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real RTK
//   ───────────               ────────
//   a shallow Proxy           Immer proxies RECURSIVELY and does structural
//                             sharing — unchanged branches keep their
//                             identity, so selectors and memo stay stable
//   extraReducers as an       a BUILDER: builder.addCase(...).addMatcher(...)
//   object                    .addDefaultCase(...) — the object form is
//                             deprecated because it has no type inference
//   n/a                       configureStore: devtools, thunk, and the
//                             immutability + serializability check middleware,
//                             all on by default
//   n/a                       createEntityAdapter for normalized collections
//   n/a                       RTK Query — a full data-fetching layer built ON
//                             createSlice
//   n/a                       full TypeScript inference: the action creator's
//                             payload type comes from your reducer's signature
//
// The dev-middleware point is worth naming: RTK's immutability check is what
// catches trap 3. It runs on every dispatch in development and throws if you
// mutated state outside a reducer. In production it is stripped — so the bug
// is silent there.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "An immer producer returned a new value AND modified its draft":
//   → §6 trap 1. Pick one.
//
// Bug 2 — A reducer that silently does nothing:
//   Reassigning the draft parameter. → §6 trap 2.
//
// Bug 3 — The UI does not update:
//   Mutation outside a reducer. → §6 trap 3. Dev middleware catches it.
//
// Bug 4 — Mutating in a SELECTOR:
//   createSelector's result gets sorted in place. Same class of bug, and
//   Immer is nowhere near it.
//
// Bug 5 — Storing non-serializable values:
//   A Date, a Map, a class instance, a Promise. Breaks devtools time travel
//   and RTK warns. Store strings and plain objects.
//
// Bug 6 — Three booleans instead of one status:
//   Impossible states. → §8.
//
// Bug 7 — createAsyncThunk for server data:
//   You are hand-rolling a cache. RTK Query exists. → §8.
//
// Bug 8 — Expecting Immer in a plain useReducer:
//   Immer is RTK's, not React's. Plain reducers must spread by hand.
//
// Bug 9 — Huge state trees and Immer overhead:
//   Immer proxies every access. For very large state and hot paths, it is
//   measurable. Rare, but real.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// Generation:
assert(increment.type === "counter/increment",
  "the action type is `${name}/${key}` — generated, never typed");
assert(JSON.stringify(addBy(5)) === JSON.stringify({ type: "counter/addBy", payload: 5 }),
  "the action creator wraps its argument as `payload`");
assert(String(increment) === "counter/increment",
  "toString() returns the type — which is why it works as an object key");

// The reducer:
assert(counterSlice.reducer(undefined, {}).value === 0, "initialState is applied");
assert(counterSlice.reducer({ value: 5, history: [] }, increment()).value === 6, "increment works");
assert(counterSlice.reducer({ value: 5, history: [] }, addBy(10)).value === 15, "payload works");

// The headline — "mutation" is not mutation:
assert(before.value === 0, "the ORIGINAL state was never touched ✅");
assert(after.value === 1, "the new state has the update");
assert(!Object.is(before, after), "a NEW object was produced");

// Immer's bailout:
assert(Object.is(before, noChange),
  "an unchanged reducer returns the ORIGINAL reference → React's bailout fires");

// The traps:
assert(trap1Error.includes("returned a new value"),
  "mutate AND return → Immer throws. It cannot know which you meant.");
assert(reassigned.value === 0,
  "reassigning the draft parameter does NOTHING — no error, no change 🐛");
assert(replaced.value === 99, "returning a new object DOES work");
assert(reassigned.value !== replaced.value,
  "same intent, two lines apart, one silently fails");

// Immer's boundary:
assert(t3After.items.length === 3 && externalObject.items.includes(999),
  "Immer protects INSIDE the reducer only — external mutation is invisible to it");

// The collapse — and note the honest size of it:
assert(classicLines > rtkLines,
  "classic Redux is more code for the identical feature (14 vs 9 here — real, " +
  "but a 1.6x saving, not the 10x the marketing implies)");
assert(classicCost(3) - rtkCost(3) === 5, "3 actions: a 5-line difference");
assert(classicCost(25) - rtkCost(25) === 49,
  "25 actions: a 49-line difference — the gap GROWS 3x per action, which is " +
  "the actual argument");

// The thunk:
assert(fetchUser.pending.type === "user/fetch/pending", "one thunk → three types");
assert(ok.status === "succeeded" && ok.data.name === "Vineet", "the fulfilled path");
assert(failed.status === "failed" && failed.error === "Not found", "the rejected path");
assert(!("isLoading" in ok) && !("isError" in ok),
  "ONE status field — no impossible boolean combinations");

console.log("§11 — mini assertions passed for: Redux Toolkit createSlice");
console.log("\n  The one to remember: `before.value === 0` after a reducer that");
console.log("  literally executed `state.value += 1`. That is Immer, and it is");
console.log("  the whole reason RTK feels different.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is createSlice?", answer like this:
//
//   "It takes a name, an initial state, and reducer functions, and generates
//    the action types, action creators, and reducer. A function named
//    `increment` in a slice named `counter` becomes the type
//    'counter/increment', the creator increment(), and a case in the reducer.
//    You never type the string, so action types can't typo.
//
//    The part people ask about is `state.value += 1` — it looks like mutation
//    and isn't. RTK bundles Immer, which wraps state in a Proxy draft. Your
//    writes are recorded against a copy, and Immer returns a new object. The
//    original is untouched. It also does structural sharing, so if a reducer
//    changes nothing you get the SAME reference back and React's Object.is
//    bailout fires — that's a performance feature, not just ergonomics.
//
//    But I'd push back on 'Immer means no mutation bugs'. Three still exist.
//    Mutating AND returning throws — Immer can't know which you meant.
//    Reassigning the draft parameter, `state = {...}`, silently does nothing,
//    because it's a function parameter and you just rebound a local name. And
//    Immer only protects INSIDE the reducer, so mutating getState() elsewhere
//    is invisible to it — RTK's dev middleware catches that, but it's stripped
//    in production, so it's silent where it matters.
//
//    For async there's createAsyncThunk, which generates pending, fulfilled,
//    and rejected types from one call, handled in extraReducers. Note the docs
//    use ONE status field rather than three booleans — that's the impossible-
//    states argument, and RTK bakes it in.
//
//    The context that matters: classic Redux made you write a constant, a
//    creator, and a switch case in three files. createSlice is one file, and
//    RTK is the official recommended way to write Redux now. 'Redux has too
//    much boilerplate' was true in 2017 and hasn't been since 2019.
//
//    Though if it's server data, I'd use RTK Query or React Query rather than
//    a slice — createAsyncThunk is right when the result feeds CLIENT state."
//
// The three surviving traps and the dates are the senior markers.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does createSlice generate?
// A1. Action types (`${name}/${key}`), action creators, and the reducer.
//
// Q2. Is state.value += 1 mutation?
// A2. No. It writes to an Immer draft Proxy; Immer produces a new object and
//     leaves the original untouched.
//
// Q3. Can you still have mutation bugs with RTK?
// A3. Yes — mutate AND return throws; reassigning the draft silently does
//     nothing; mutation outside a reducer is invisible to Immer.
//
// Q4. Why does reassigning the draft do nothing?
// A4. `state` is a function parameter. Reassigning rebinds a local name; Immer
//     only sees writes through the proxy.
//
// Q5. What happens if a reducer changes nothing?
// A5. Immer returns the ORIGINAL reference, so React's bailout fires and
//     nothing re-renders.
//
// Q6. reducers vs extraReducers?
// A6. `reducers` handles this slice's own actions and generates creators.
//     `extraReducers` responds to actions from elsewhere — thunks, other slices.
//
// Q7. What does createAsyncThunk generate?
// A7. pending/fulfilled/rejected action types from one prefix, dispatched
//     around your async function.
//
// Q8. Why one status field instead of three booleans?
// A8. Three booleans is eight combinations, four impossible. One field makes
//     them unrepresentable.
//
// Q9. Is Redux still boilerplate-heavy?
// A9. No — that criticism is about pre-2019 hand-written Redux. RTK is the
//     official recommendation and it is one file per slice.
//
// Q10. When would you NOT use a slice?
// A10. Server data. RTK Query or React Query gives you caching, dedup, and
//      revalidation that a slice never will.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What does createSlice generate?
//   Back : Types, creators, and the reducer. Type = `${name}/${key}`.
//
// Flashcard 2:
//   Front: Is state.value += 1 mutation?
//   Back : No. It is an Immer draft Proxy. The original is untouched.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Mutating AND returning. Immer throws.
//
// Flashcard 4:
//   Front: What silently does nothing?
//   Back : state = {...} — reassigning the parameter.
//
// Flashcard 5:
//   Front: What does createAsyncThunk generate?
//   Back : pending / fulfilled / rejected from one prefix.
//
// Flashcard 6:
//   Front: Why one status field?
//   Back : Three booleans = impossible states.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Name the traps Immer does NOT catch, and say the boilerplate
//          criticism is from 2017.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write createSlice from memory. The core is `${name}/${key}` plus a map
//   from type to case reducer.
//
// Task 2:
//   Make the mini `produce` recursive so a deeply nested write works. You will
//   discover why Immer proxies on every `get`.
//
// Task 3:
//   Add structural sharing: return the ORIGINAL nested object when its branch
//   was not touched. Now selectors downstream stay stable — that is the real
//   Immer.
//
// Task 4:
//   Reproduce all three §6 traps in a real RTK app. Then turn off the dev
//   middleware and watch trap 3 go silent.
//
// Task 5:
//   Convert a classic Redux module to a slice. Count the lines and the files.
//
// Task 6:
//   Explain in 60 seconds why `state.value += 1` is safe, to someone who is
//   certain it is a mutation bug.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   You write the reducer; RTK generates the type, the creator, and the
//   reducer. The type is `${name}/${key}`.
//
// If you remember the common bug:
//   Immer is not total. Mutate-and-return throws, reassigning the draft
//   silently does nothing, and mutation outside a reducer is invisible.
//
// If you remember the professional framing:
//   RTK is the official Redux. The boilerplate criticism is from 2017. And
//   server data belongs in RTK Query, not a slice.
//
// NEXT TOPIC -> 05_redux-actions-reducers-store.js
