// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  15_state-machines-xstate-intro.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: State machines (XState intro)
//
// WHAT YOU WILL MASTER HERE:
//   1. The boolean explosion — 2^n states, and how many are legal
//   2. Impossible states AND impossible TRANSITIONS — the second one is the point
//   3. Build an interpreter: ~20 lines
//   4. Context: the data that lives alongside the state
//   5. The honest verdict — why XState is rare, and what to use instead
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/15_state-machines-xstate-intro.js"
//
// Prerequisite: 02_built-in-hooks/06_usereducer-vs-usestate.js §4 — this file
// is that idea taken to its logical conclusion.
//
// THIS IS THE LAST FILE OF SECTION 2A.3.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// A state machine:
// A finite set of states, and an explicit set of allowed transitions between
// them — so both impossible states AND impossible transitions become
// unrepresentable.
//
// If interviewer says "explain it simply", say:
// "Instead of four booleans, you have one state that is exactly one of:
//  idle, loading, success, error. And you declare which events can move you
//  from each one. Anything you did not declare simply cannot happen."
//
// If interviewer asks "why does it matter?", say:
// "Because a reducer removes impossible STATES, but a machine also removes
//  impossible TRANSITIONS. A reducer will happily let you go from 'success'
//  back to 'loading' by dispatching the wrong action. A machine says that
//  edge does not exist, so the bug is not fixed — it is unwritable."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   states are nodes, events are EDGES
//
// The progression this whole section has been building toward:
//
//   useState booleans  → 2^n combinations, most illegal
//   useReducer         → one status field. Impossible STATES gone.
//   state machine      → declared edges. Impossible TRANSITIONS gone too.
//
// The machine:
//
//   const fetchMachine = {
//     initial: "idle",
//     states: {
//       idle:    { on: { FETCH: "loading" } },
//       loading: { on: { RESOLVE: "success", REJECT: "failure" } },
//       success: { on: { FETCH: "loading" } },
//       failure: { on: { RETRY: "loading" } },
//     },
//   };
//
// Read what is NOT there: there is no edge from `idle` to `success`. No
// amount of dispatching the wrong event can produce it. The absence IS the
// specification.
//
// Runtime rule:
//   transition(state, event) → the next state, or the SAME state if that edge
//   is not declared. An undeclared event is ignored, not an error.
//
// Practical rule:
//   Reach for a machine when the ORDER of things matters. A wizard, a
//   payment flow, a video player, a drag interaction.
//
// Common trap:
//   Using a machine for state that has no meaningful transitions. `isOpen`
//   is not a state machine. It is a boolean.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE BOOLEAN EXPLOSION
// ══════════════════════════════════════════════════════════════════

console.log("§3 — four booleans, sixteen combinations:\n");

// The state everyone writes first:
//   const [isLoading, setIsLoading] = useState(false);
//   const [isSuccess, setIsSuccess] = useState(false);
//   const [isError, setIsError] = useState(false);
//   const [isIdle, setIsIdle] = useState(true);

const flags = ["isIdle", "isLoading", "isSuccess", "isError"];
const combinations = [];
for (let i = 0; i < 2 ** flags.length; i++) {
  const combo = {};
  flags.forEach((f, bit) => { combo[f] = Boolean(i & (1 << bit)); });
  combinations.push(combo);
}

// Exactly one flag true = a legal state. Anything else is nonsense.
const isLegal = (c) => Object.values(c).filter(Boolean).length === 1;
const legal = combinations.filter(isLegal);
const illegal = combinations.filter(c => !isLegal(c));

console.log(`  4 booleans → ${combinations.length} combinations`);
console.log(`    legal   : ${legal.length}  (exactly one flag true)`);
console.log(`    ILLEGAL : ${illegal.length}  🐛\n`);

console.log("  a few of the nonsense ones your code can produce:");
for (const c of illegal.slice(1, 5)) {
  const on = Object.entries(c).filter(([, v]) => v).map(([k]) => k);
  console.log(`    ${JSON.stringify(on)} ← ${on.length === 0
    ? "nothing is true. What is the UI?" : "all true at once. What renders?"}`);
}

console.log("\n  Twelve of sixteen are meaningless, and every one is reachable");
console.log("  by forgetting a setter. isLoading:true + isError:true is the");
console.log("  spinner rendered on top of the error message.");
console.log("\n  A reducer collapses this to ONE field with four values:");
console.log("    status: 'idle' | 'loading' | 'success' | 'error'");
console.log("    → 4 states. 4 legal. 0 illegal.");
console.log("  → 02_built-in-hooks/06_usereducer-vs-usestate.js §4\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — BUT A REDUCER STILL ALLOWS IMPOSSIBLE TRANSITIONS
// ══════════════════════════════════════════════════════════════════
//
// This is the part that justifies machines, and it is the part people miss.

console.log("§4 — the gap a reducer leaves:\n");

function fetchReducer(state, action) {
  switch (action.type) {
    case "FETCH_START": return { status: "loading", data: null, error: null };
    case "FETCH_SUCCESS": return { status: "success", data: action.payload, error: null };
    case "FETCH_ERROR": return { status: "error", data: null, error: action.error };
    default: return state;
  }
}

// The reducer has no concept of WHERE you are. Every action works from
// everywhere:
const fromIdle = fetchReducer({ status: "idle" }, { type: "FETCH_SUCCESS", payload: "x" });
const fromSuccess = fetchReducer({ status: "success", data: "x" },
  { type: "FETCH_SUCCESS", payload: "y" });

console.log("  reducer({ status: 'idle' }, FETCH_SUCCESS) →");
console.log("   ", JSON.stringify(fromIdle));
console.log("    🐛 We went from IDLE to SUCCESS. No request was ever made.");
console.log("       Where did the data come from?");

console.log("\n  reducer({ status: 'success' }, FETCH_SUCCESS) →");
console.log("   ", JSON.stringify(fromSuccess));
console.log("    🐛 A second response overwrote the first. That is the race");
console.log("       condition, arriving as a state bug.");

console.log("\n  The reducer removed impossible STATES. It did nothing about");
console.log("  impossible TRANSITIONS — because a switch on action.type does");
console.log("  not know or care what state you are in.");
console.log("\n  You can fix it by hand:");
console.log("    case 'FETCH_SUCCESS':");
console.log("      if (state.status !== 'loading') return state;   // ← a guard");
console.log("\n  ...and now you are hand-writing a state machine, one if at a");
console.log("  time, with no diagram and nothing checking you covered them all.");
console.log("  A machine makes the guards the STRUCTURE. → §5\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — BUILD THE INTERPRETER
// ══════════════════════════════════════════════════════════════════

// A machine is DATA. The interpreter is ~20 lines.
function createMachine(config) {
  return {
    initial: config.initial,
    states: config.states,
    context: config.context ?? {},

    // THE ENTIRE ENGINE:
    transition(state, event) {
      const stateNode = config.states[state.value];
      const eventType = typeof event === "string" ? event : event.type;
      const target = stateNode.on?.[eventType];

      // ← THE WHOLE POINT: an undeclared edge does not exist.
      if (!target) return state;

      const targetName = typeof target === "string" ? target : target.target;

      // A guard can refuse the transition:
      if (typeof target === "object" && target.cond && !target.cond(state.context, event)) {
        return state;
      }

      // An action can update the context:
      let context = state.context;
      if (typeof target === "object" && target.actions) {
        context = target.actions(state.context, event);
      }

      return { value: targetName, context, changed: targetName !== state.value };
    },
  };
}

function interpret(machine) {
  let state = { value: machine.initial, context: machine.context, changed: false };
  const history = [state.value];
  const rejected = [];

  return {
    send(event) {
      const next = machine.transition(state, event);
      const eventType = typeof event === "string" ? event : event.type;
      if (next.value === state.value && !next.changed) {
        rejected.push(`${state.value} --${eventType}--> ✋ no such edge`);
      } else {
        history.push(next.value);
      }
      state = next;
      return state;
    },
    get state() { return state; },
    getHistory: () => history.slice(),
    getRejected: () => rejected.slice(),
    can: (eventType) => Boolean(machine.states[state.value].on?.[eventType]),
  };
}

console.log("§5 — the machine refuses what you did not declare:\n");

const fetchMachine = createMachine({
  initial: "idle",
  context: { data: null, error: null, retries: 0 },
  states: {
    idle: { on: { FETCH: "loading" } },
    loading: {
      on: {
        RESOLVE: { target: "success", actions: (ctx, e) => ({ ...ctx, data: e.data }) },
        REJECT: { target: "failure", actions: (ctx, e) => ({ ...ctx, error: e.error }) },
        CANCEL: "idle",
      },
    },
    success: { on: { FETCH: "loading" } },
    failure: {
      on: {
        RETRY: { target: "loading", actions: (ctx) => ({ ...ctx, retries: ctx.retries + 1 }) },
      },
    },
  },
});

const service = interpret(fetchMachine);

console.log("  the machine:");
console.log("    idle    --FETCH-->   loading");
console.log("    loading --RESOLVE--> success");
console.log("    loading --REJECT-->  failure");
console.log("    loading --CANCEL-->  idle");
console.log("    failure --RETRY-->   loading\n");

// The illegal transition from §4 — now impossible:
console.log("  from idle, send RESOLVE (the §4 bug):");
service.send({ type: "RESOLVE", data: "x" });
console.log("    state:", service.state.value, "✅ still idle. The edge does not exist.");
console.log("    context.data:", service.state.context.data, "← no phantom data");

// The legal path:
service.send("FETCH");
service.send({ type: "REJECT", error: "500" });
service.send("RETRY");
service.send({ type: "RESOLVE", data: "the real data" });

console.log("\n  the legal path:");
console.log("    history:", service.getHistory().join(" → "));
console.log("    context:", JSON.stringify(service.state.context));

console.log("\n  rejected transitions:");
for (const r of service.getRejected()) console.log("   ", r);

console.log("\n  Read the rejection. It is not a bug that was CAUGHT — the edge");
console.log("  was never in the machine, so there is nothing to catch. The");
console.log("  absence of an edge IS the specification.");
console.log("\n  And `service.can('RETRY')` lets the UI ask the machine what is");
console.log("  possible — so a disabled button is derived from the state, not");
console.log("  a separate boolean you have to keep in sync.");
console.log("    can('FETCH') from success?", interpret(fetchMachine).can("FETCH"));
console.log("    can('RETRY') from idle?   ", interpret(fetchMachine).can("RETRY"),
  "← the Retry button disables itself\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — FINITE STATE + INFINITE CONTEXT
// ══════════════════════════════════════════════════════════════════
//
// The distinction that makes machines practical:
//
//   FINITE STATE — the mode you are in. A small enum. `loading`.
//   CONTEXT      — the data. Infinite possibilities. `{ data, error, retries }`
//
// You cannot enumerate every possible `data` value, and you do not need to.
// You enumerate the MODES, and the data rides along.
//
// This is why "state machines don't scale to real apps" is wrong: the state
// is finite because the context absorbs everything that is not a mode.

console.log("§6 — finite state, infinite context:\n");

console.log("  states (finite, enumerable):  idle | loading | success | failure");
console.log("  context (infinite):           { data: any, error: any, retries: number }");
console.log("\n  the machine has 4 states. `data` has infinite possible values.");
console.log("  You never enumerate the data — you enumerate the MODES.");
console.log("\n  That split is why machines work for real apps. If `data` had to");
console.log("  be part of the state, you would have infinite states and the");
console.log("  whole idea would collapse.\n");

// Show the context threading through:
const s2 = interpret(fetchMachine);
s2.send("FETCH");
s2.send({ type: "REJECT", error: "timeout" });
console.log("  after a failure:", JSON.stringify(s2.state));
s2.send("RETRY");
console.log("  after RETRY    :", JSON.stringify(s2.state));
console.log("    ↑ retries incremented via an ACTION on the edge — the machine");
console.log("      says WHEN it can change, and the action says HOW.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE HONEST VERDICT
// ══════════════════════════════════════════════════════════════════

console.log("§7 — why XState is rare, honestly:\n");

const table = [
  ["a modal's isOpen", "❌ no", "two states, no meaningful order. It is a boolean."],
  ["fetch idle/loading/done", "⚠️  maybe", "a reducer covers 90%. React Query covers 100%."],
  ["a multi-step wizard", "✅ yes", "ORDER is the whole feature. Back/next/skip/validate."],
  ["a payment flow", "✅ yes", "illegal transitions cost money"],
  ["a video player", "✅ yes", "idle/loading/playing/paused/buffering/ended"],
  ["drag and drop", "✅ yes", "idle/dragging/dropping, with cancellation"],
  ["an auth flow", "✅ yes", "otp/mfa/refresh/expired — genuinely stateful"],
];

console.log("  what                    | machine? | why");
console.log("  ------------------------|----------|--------------------------------");
for (const [what, verdict, why] of table) {
  console.log(`  ${what.padEnd(23)} | ${verdict.padEnd(8)} | ${why}`);
}

console.log("\n  THE COSTS — say these, they are why XState is not everywhere:");
console.log("    • a big API surface: guards, actions, services, actors,");
console.log("      hierarchical states, parallel states, history states. It is");
console.log("      a whole formalism (Harel statecharts), not a small library.");
console.log("    • ~15kB, and a real learning curve for every new hire");
console.log("    • config-as-data is verbose next to a switch. A five-line");
console.log("      reducer becomes twenty lines of machine config.");
console.log("    • most React state is not a machine. It is a boolean, or a");
console.log("      cache, or a form field.");

console.log("\n  THE PAYOFF, when it fits:");
console.log("    • the machine is a DIAGRAM. stately.ai visualizes the config");
console.log("      directly — you can hand it to a designer or a PM and they");
console.log("      can read it. No other state tool has that.");
console.log("    • it is testable without React: transition(state, event) is a");
console.log("      pure function. Same argument as sagas' yielded objects.");
console.log("    • illegal transitions are unwritable, not just guarded");
console.log("    • it is the SPEC. The machine config IS the requirements doc,");
console.log("      and it cannot drift from the code, because it is the code.");

console.log("\n  The line to use: 'I reach for a machine when the ORDER of");
console.log("  things matters and getting it wrong is expensive. A wizard, a");
console.log("  payment, a player. For loading/error, useReducer already made");
console.log("  the impossible states unrepresentable, and React Query already");
console.log("  did the whole job. Most state is not a machine.'\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL XSTATE DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real XState
//   ───────────               ───────────
//   flat states               HIERARCHICAL: `playing.buffering` — a substate
//                             inherits its parent's transitions, so you write
//                             the pause edge once, not per substate
//   n/a                       PARALLEL states: a media player that is
//                             simultaneously `playing` and `fullscreen`,
//                             without multiplying the state count
//   actions as functions      declarative action objects, assign(), and side
//                             effects declared not executed — like saga's
//                             effects, and testable the same way
//   n/a                       INVOKED services: a state can own a promise or
//                             another machine, with cancellation on exit —
//                             this is the takeLatest problem, solved structurally
//   n/a                       @xstate/react's useMachine, and the Stately
//                             visualizer that renders the config as a diagram
//   n/a                       history states, delays/after, activities
//
// The invoked-service point is the deepest one: `loading` INVOKES the fetch,
// and leaving `loading` cancels it automatically. The race condition that
// took a saga's takeLatest, or an AbortController, or a cancelled flag, is
// just... the machine's structure. Nothing to remember.
// → 03_custom-hooks/02_usefetch-custom-hook.js §4


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS PREVENTS (and causes)
// ══════════════════════════════════════════════════════════════════
//
// PREVENTS:
//   • the spinner on top of the error message (impossible state)
//   • a response arriving in `idle` and inventing data (impossible transition)
//   • double-submit: `submitting` has no SUBMIT edge, so the second click is
//     ignored — no isSubmitting flag, no debounce, no ref guard
//   • a wizard letting you skip step 2 by pressing back twice
//   • a Retry button enabled when there is nothing to retry
//
// CAUSES:
//   • Bug 1 — an event silently does nothing. You forgot the edge. There is
//     no error, because "no edge" is exactly how you say "not allowed".
//     This is the #1 XState confusion.
//   • Bug 2 — state explosion without hierarchy. Flat machines with 20 states
//     and repeated edges everywhere. Use nested states.
//   • Bug 3 — a machine for a boolean. Twenty lines of config for isOpen.
//   • Bug 4 — putting data in the state instead of the context. `loadingUser1`
//     and `loadingUser2` as separate states means you misunderstood the split.
//   • Bug 5 — the machine and the UI drifting: rendering from a separate
//     boolean instead of state.matches('loading').


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The explosion:
assert(combinations.length === 16, "4 booleans = 16 combinations");
assert(legal.length === 4, "only 4 are legal — exactly one flag true");
assert(illegal.length === 12, "12 of 16 are nonsense, and all are reachable 🐛");

// The reducer's gap — the headline:
assert(fromIdle.status === "success",
  "a reducer let us jump idle → success with NO request. An impossible " +
  "TRANSITION, which a reducer cannot prevent 🐛");
assert(fromSuccess.data === "y",
  "...and a second response overwrote the first. The race, as a state bug.");

// The machine closes it:
const m = interpret(fetchMachine);
m.send({ type: "RESOLVE", data: "phantom" });
assert(m.state.value === "idle",
  "the machine IGNORED RESOLVE from idle — the edge does not exist ✅");
assert(m.state.context.data === null, "...so no phantom data was ever set");

// The legal path works:
assert(JSON.stringify(service.getHistory()) ===
  JSON.stringify(["idle", "loading", "failure", "loading", "success"]),
  "the declared path runs exactly as drawn");
assert(service.state.context.data === "the real data", "the action set the context");
assert(service.state.context.retries === 1, "RETRY's action incremented retries");
assert(service.getRejected().length === 1, "exactly one transition was refused");

// can() derives the UI:
const idle = interpret(fetchMachine);
assert(idle.can("FETCH") === true, "from idle, FETCH is possible");
assert(idle.can("RETRY") === false,
  "from idle, RETRY is not — so the button disables itself from the STATE, " +
  "not from a separate boolean you must keep in sync");

// Double-submit is structurally impossible:
const dbl = interpret(fetchMachine);
dbl.send("FETCH");
const afterFirst = dbl.state.value;
dbl.send("FETCH");                    // the user double-clicks
assert(dbl.state.value === afterFirst,
  "a second FETCH while loading does NOTHING — `loading` has no FETCH edge. " +
  "Double-submit prevention with no flag, no ref, no debounce.");

console.log("§10 — mini assertions passed for: State machines");
console.log("\n  The one that justifies the whole idea: the reducer allowed");
console.log("  idle → success with no request. The machine cannot. Not because");
console.log("  it catches it — because that edge was never drawn.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is a state machine / would you use XState?", answer:
//
//   "A finite set of states plus an explicit set of allowed transitions. The
//    progression is: four booleans give you sixteen combinations of which
//    twelve are nonsense — that's the spinner on top of the error message. A
//    reducer collapses that to one status field, so impossible STATES are gone.
//
//    But here's the gap people miss: a reducer still allows impossible
//    TRANSITIONS. A switch on action.type doesn't know what state you're in, so
//    dispatching FETCH_SUCCESS from `idle` happily gives you success with data
//    that no request ever fetched. You can guard it with an if at the top of
//    each case — and at that point you're hand-writing a state machine one if
//    at a time, with no diagram and nothing checking you covered them all.
//
//    A machine makes the guards the STRUCTURE. `idle` declares only a FETCH
//    edge, so RESOLVE from idle isn't caught — it doesn't exist. The absence of
//    an edge IS the specification. My favourite consequence: `loading` has no
//    FETCH edge, so double-submit prevention is free. No isSubmitting flag, no
//    ref guard, no debounce.
//
//    The key split is finite state, infinite context. States are the MODES —
//    a small enum. Context is the data, which is infinite and rides along.
//    That's why 'machines don't scale' is wrong.
//
//    Honestly though, I rarely reach for XState. It's a whole formalism —
//    Harel statecharts, guards, actors, parallel states — about 15kB, and a
//    real learning curve. Most React state isn't a machine; it's a boolean, or
//    a cache. For loading/error, useReducer already fixed the impossible states
//    and React Query already did the whole job.
//
//    Where I would: a wizard, a payment flow, a video player, drag and drop —
//    anywhere the ORDER matters and getting it wrong is expensive. And the
//    unique payoff is that the machine is a DIAGRAM. Stately renders the config
//    directly, so a PM can read your state logic. The spec can't drift from the
//    code, because it IS the code."
//
// The reducer-still-allows-bad-transitions point is what makes this senior.
// Almost everyone stops at "impossible states".


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is a state machine?
// A1. Finite states plus declared transitions. States are nodes; events are
//     edges.
//
// Q2. How is it better than useReducer?
// A2. A reducer removes impossible STATES. A machine also removes impossible
//     TRANSITIONS — a reducer will let you go idle → success.
//
// Q3. What is context?
// A3. The infinite data that rides alongside the finite state. You enumerate
//     modes, not values.
//
// Q4. What happens on an undeclared event?
// A4. Nothing. It is ignored. That is how you say "not allowed" — and it is
//     also the #1 source of confusion.
//
// Q5. How does it prevent double-submit?
// A5. `submitting` has no SUBMIT edge, so the second click is ignored. No
//     flag, no ref, no debounce.
//
// Q6. What are hierarchical states for?
// A6. Avoiding state explosion. `playing.buffering` inherits `playing`'s
//     edges, so you declare the pause transition once.
//
// Q7. What is an invoked service?
// A7. A state owns a promise or a child machine, and leaving that state
//     cancels it — the takeLatest problem solved structurally.
//
// Q8. Why is XState not more popular?
// A8. It is a formalism with a big API, 15kB, and a learning curve — and most
//     React state is a boolean or a cache, not a machine.
//
// Q9. When WOULD you use it?
// A9. Wizards, payments, media players, drag interactions, auth flows.
//     Anywhere order matters and mistakes are expensive.
//
// Q10. What is the unique benefit?
// A10. The machine is a diagram. It is the spec, and it cannot drift from the
//      code because it is the code.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is a state machine?
//   Back : Finite states + declared transitions. Nodes and edges.
//
// Flashcard 2:
//   Front: vs useReducer?
//   Back : A reducer kills impossible STATES. A machine also kills impossible
//          TRANSITIONS.
//
// Flashcard 3:
//   Front: State vs context?
//   Back : Finite modes vs infinite data.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : An event silently doing nothing — you forgot the edge.
//
// Flashcard 5:
//   Front: The free win?
//   Back : Double-submit. `loading` has no FETCH edge.
//
// Flashcard 6:
//   Front: When to use it?
//   Back : When ORDER matters and mistakes are expensive.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "A reducer still allows idle → success." And: the machine is the spec.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the interpreter from memory. The whole engine is:
//   `const target = states[state].on[event]; if (!target) return state;`
//
// Task 2:
//   Add hierarchical states: `playing.buffering` inherits `playing`'s edges.
//   Watch your state count stop exploding.
//
// Task 3:
//   Add invoked services: `loading` owns a promise, and leaving `loading`
//   cancels it. You have just solved the race condition structurally.
//
// Task 4:
//   Model a real checkout: cart → address → payment → review → confirmed, with
//   back edges. Now try to reach `confirmed` without `payment`. You cannot.
//
// Task 5:
//   Take the §4 reducer and add guards until it is correct. Count the ifs.
//   That number is the machine you were writing by hand.
//
// Task 6:
//   Explain in 60 seconds why a reducer lets you go from idle to success, to
//   someone who thinks useReducer already solved this.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   A reducer removes impossible STATES. A machine also removes impossible
//   TRANSITIONS. The absence of an edge is the specification.
//
// If you remember the common bug:
//   An event silently does nothing because you never declared the edge — and
//   that is also the feature.
//
// If you remember the professional framing:
//   Finite state, infinite context. Use it when ORDER matters and mistakes
//   cost money. Most state is a boolean or a cache, not a machine.
//
// ─────────────────────────────────────────────────────────────────
// END OF SECTION 2A.3 — STATE MANAGEMENT
//
// The arc of this section, in one line each:
//   01 lift state to the common ancestor      → and pay in re-renders
//   02 the cost is coupling; compose instead  → most drilling dies here
//   03 context is DI, not state management    → no selectors
//   04 RTK: write the reducer, get the rest   → Immer, and its 3 traps
//   05 state = reducer(state, action)         → each rule buys a feature
//   06 thunk is five lines                    → but cannot cancel
//   07 saga: yield a description              → best tests, poor TS
//   08 zustand: a store + selectors           → 21 renders → 1
//   09 jotai: compose up, not select down     → no selectors to get wrong
//   10 server state is a CACHE, not state     → most of your store leaves
//   11 optimistic: cancel, snapshot, apply    → derive a layer instead
//   12 if you can compute it, do not store it → state should be minimal
//   13 React compares references              → sharing enables memoization
//   14 Immer shares better than you do        → but normalize the cause
//   15 machines kill impossible transitions   → when order matters
//
// If you take ONE thing from the whole section:
//   Move server data to React Query first. Then look at what is left. It is
//   usually a theme, a modal, and a form draft — and that needs almost none
//   of the above.
// ─────────────────────────────────────────────────────────────────
