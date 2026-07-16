// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  12_usetransition.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useTransition
//
// WHAT YOU WILL MASTER HERE:
//   1. Marking an update as non-urgent — and what "urgent" means to React
//   2. isPending, and why it beats a manual loading flag
//   3. The tab-switch freeze, fixed and measured
//   4. Why startTransition must be SYNCHRONOUS (the await bug)
//   5. useTransition vs useDeferredValue vs debounce — the full map
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/12_usetransition.js"
//
// Prerequisites: 04_react-fiber-architecture.js (lanes), 11_usedeferredvalue.js
// (the same mechanism, other end of the wire).


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useTransition:
// Marks a state update as NON-URGENT, so React can interrupt its render to
// handle something urgent — like a keystroke — and gives you an isPending
// flag while it works.
//
// If interviewer says "explain it simply", say:
// "It tells React 'this update can wait'. React renders it in the background,
//  and if the user does anything urgent meanwhile, React drops that work and
//  handles the user first."
//
// If interviewer asks "why does it matter?", say:
// "Because before this, EVERY update was urgent. Clicking a tab that renders
//  a 5,000-row table froze the page — you could not even click a different
//  tab, because the click event could not run until the render finished.
//  A transition makes that render interruptible, so the UI stays alive."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   "this update can wait"
//
// React's two priorities, in plain terms:
//
//   URGENT       — the user did something and expects INSTANT feedback:
//                  typing, clicking, hovering, dragging.
//                  If this lags, the app feels broken.
//
//   TRANSITION   — a UI change the user expects to take a moment:
//                  switching tabs, filtering a list, navigating.
//                  If this lags 200ms, nobody notices.
//
// The API:
//
//   const [isPending, startTransition] = useTransition();
//
//   startTransition(() => {
//     setTab("posts");        // ← non-urgent. Interruptible.
//   });
//   setSomethingElse(x);      // ← outside = urgent. Not interruptible.
//
// Runtime rule:
//   startTransition's callback must be SYNCHRONOUS. React marks updates as
//   transitions only during the synchronous execution of that callback. Any
//   setState after an await is back to urgent.
//
// Practical rule:
//   Wrap the update that causes the EXPENSIVE render. Leave the update that
//   the user is directly manipulating urgent.
//
// Common trap:
//   Wrapping a controlled input's setState. Now typing is non-urgent and the
//   input lags — the exact opposite of the goal. → 11_usedeferredvalue.js §8


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD IT
// ══════════════════════════════════════════════════════════════════

function createMiniReact({ renderCost = {} } = {}) {
  const hooks = [];
  let cursor = 0;
  let component = null;
  const events = [];
  let clock = 0;
  let isTransitionScope = false;

  // The "main thread" — a queue of work with real time costs.
  let pendingTransition = null;

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { value: initial };
    const setState = (next) => {
      const value = typeof next === "function" ? next(hooks[slot].value) : next;
      if (Object.is(value, hooks[slot].value)) return;

      if (isTransitionScope) {
        // NON-URGENT: schedule the expensive render, do not block.
        pendingTransition = { slot, value };
        hooks[pendingIsPendingSlot].value = true;      // isPending = true
        events.push({ at: clock, kind: "transition scheduled (non-blocking)" });
        // React DOES do one cheap urgent render right now — so the UI can
        // show isPending — but with the OLD state value still in place.
        // That is why you see the old tab while isPending is true.
        renderSync("urgent");
      } else {
        // URGENT: render right now, synchronously, blocking everything.
        hooks[slot].value = value;
        renderSync("urgent");
      }
    };
    return [hooks[slot].value, setState];
  }

  let pendingIsPendingSlot = null;

  function useTransition() {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { value: false };
    pendingIsPendingSlot = slot;

    const startTransition = (callback) => {
      isTransitionScope = true;
      callback();                    // must be SYNCHRONOUS — see §6
      isTransitionScope = false;
    };
    return [hooks[slot].value, startTransition];
  }

  function renderSync(kind) {
    cursor = 0;
    const cost = renderCost[kind] ?? 1;
    clock += cost;
    events.push({ at: clock, kind: `${kind} render (${cost}ms, BLOCKING)` });
    component();
  }

  // The scheduler: work on the transition when the main thread is free.
  function flushTransition({ interruptedBy = null } = {}) {
    if (!pendingTransition) return;
    const cost = renderCost.transition ?? 50;

    if (interruptedBy) {
      events.push({ at: clock, kind: `⚡ ${interruptedBy} arrived — transition ABANDONED` });
      // The urgent work goes first. The transition restarts after.
      return;
    }

    clock += cost;
    const { slot, value } = pendingTransition;
    hooks[slot].value = value;
    hooks[pendingIsPendingSlot].value = false;         // isPending = false
    pendingTransition = null;
    cursor = 0;
    component();
    events.push({ at: clock, kind: `transition render done (${cost}ms, interruptible)` });
  }

  function mount(fn) {
    component = fn;
    cursor = 0;
    component();
    return { flushTransition };
  }

  return {
    useState, useTransition, mount, flushTransition,
    getEvents: () => events.slice(),
    getClock: () => clock,
    tick: (ms) => { clock += ms; },
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE TAB SWITCH FREEZE
// ══════════════════════════════════════════════════════════════════
//
// The canonical example, and it is canonical because it is real: a tab that
// renders thousands of rows.

console.log("§4 — clicking a slow tab:\n");

// ── WITHOUT a transition: the click blocks everything ───────────
function withoutTransition() {
  const R = createMiniReact({ renderCost: { urgent: 300 } });
  let setTab;
  R.mount(() => {
    const [tab, set] = R.useState("home");
    setTab = set;
    return tab;
  });

  const log = [];
  log.push("t=0    user clicks 'Posts' (a 300ms render)");
  setTab("posts");                     // BLOCKS for 300ms
  log.push(`t=${R.getClock()}  render finished`);
  log.push(`t=${R.getClock()}  ...user tried clicking 'Home' at t=50 — the`);
  log.push("       event sat in the queue for 250ms. The tab looked frozen.");
  return log;
}

// ── WITH a transition: the click is interruptible ───────────────
function withTransition() {
  const R = createMiniReact({ renderCost: { urgent: 2, transition: 300 } });
  let setTab, start;
  R.mount(() => {
    const [tab, set] = R.useState("home");
    const [, startTransition] = R.useTransition();
    setTab = set;
    start = startTransition;
    return tab;
  });

  const log = [];
  log.push("t=0    user clicks 'Posts'");
  start(() => setTab("posts"));        // does NOT block
  log.push(`t=${R.getClock()}    isPending=true, UI still responsive`);
  R.tick(50);
  log.push("t=50   user clicks 'Home' — the event runs IMMEDIATELY");
  R.flushTransition({ interruptedBy: "click on Home" });
  log.push("t=50   React abandons the Posts render, handles the click");
  return log;
}

for (const line of withoutTransition()) console.log("  " + line);
console.log();
for (const line of withTransition()) console.log("  " + line);

console.log("\n  Without a transition, the 300ms render OWNS the main thread.");
console.log("  JavaScript is single-threaded, so the click on 'Home' cannot");
console.log("  even be DELIVERED until React finishes. The tab is frozen.");
console.log("\n  With a transition, React renders in interruptible units and");
console.log("  checks for urgent work between them — so the click gets through");
console.log("  at t=50 and React abandons the Posts render entirely.");
console.log("\n  That interruptibility is exactly what Fiber was built for in");
console.log("  React 16. This hook, in React 18, is the payoff.");
console.log("  → 04_react-fiber-architecture.js\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — isPending: THE FREE LOADING STATE
// ══════════════════════════════════════════════════════════════════

console.log("§5 — isPending vs a manual flag:\n");

const R2 = createMiniReact({ renderCost: { urgent: 1, transition: 30 } });
const states = [];
let setTab2, start2;

R2.mount(() => {
  const [tab, set] = R2.useState("home");
  const [isPending, startTransition] = R2.useTransition();
  setTab2 = set;
  start2 = startTransition;
  states.push({ tab, isPending });
  return tab;
});

start2(() => setTab2("posts"));
R2.flushTransition();

console.log("  states the component rendered with:");
for (const s of states) {
  console.log(`    tab="${s.tab}"${" ".repeat(7 - s.tab.length)} isPending=${s.isPending}`);
}

console.log("\n  Notice: while isPending is true, `tab` is still 'home'. The OLD");
console.log("  UI stays fully interactive and on screen. That is the key");
console.log("  difference from a spinner:");
console.log("\n    manual flag → setLoading(true) → the old UI is REPLACED by a");
console.log("                  spinner → the user loses their place");
console.log("    isPending   → the old UI STAYS, maybe dimmed → the user can");
console.log("                  still read it, scroll it, or click elsewhere");
console.log("\n  And isPending is correct by construction. A manual flag has to");
console.log("  be set AND unset, on every path including errors — the same");
console.log("  forgotten-setLoading(false) bug as 06_usereducer §4.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — startTransition MUST BE SYNCHRONOUS
// ══════════════════════════════════════════════════════════════════
//
// The bug that silently does nothing. This is a great interview question
// because the code LOOKS correct.

console.log("§6 — the await bug:\n");

function simulateScope() {
  let inScope = false;
  const marks = [];

  const startTransition = (cb) => {
    inScope = true;
    cb();                          // React marks updates ONLY during this call
    inScope = false;               // ← the scope closes the moment cb() RETURNS
  };

  const setState = (label) => marks.push({ label, urgent: !inScope });

  // ❌ BROKEN — the await lets startTransition return before setState runs
  startTransition(async () => {
    setState("before await");      // still inside the sync scope ✅
    // await fetchData();          // ← startTransition RETURNS HERE
    // Everything after the await runs LATER, outside the scope:
  });
  // Simulating the post-await continuation:
  setState("after await");         // 🐛 inScope is already false

  return marks;
}

for (const mark of simulateScope()) {
  console.log(`    setState("${mark.label}")${" ".repeat(14 - mark.label.length)}` +
    `→ ${mark.urgent ? "🐛 URGENT (not a transition!)" : "✅ transition"}`);
}

console.log("\n  ❌ startTransition(async () => {");
console.log("       const data = await fetch(...);");
console.log("       setResults(data);        // ← NOT a transition. Urgent.");
console.log("     });");
console.log("\n  ✅ const data = await fetch(...);");
console.log("     startTransition(() => {");
console.log("       setResults(data);        // ← inside the sync scope");
console.log("     });");
console.log("\n  Why: React sets a flag, calls your callback, and clears the flag");
console.log("  when it RETURNS. An async function returns at the first await, so");
console.log("  everything after it is outside the scope. No error, no warning —");
console.log("  your transition just silently is not one.");
console.log("\n  (React 19's Actions and useActionState handle async transitions");
console.log("   properly — that API exists precisely because this trap is so easy");
console.log("   to hit.)\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE FULL MAP: transition vs deferred vs debounce
// ══════════════════════════════════════════════════════════════════
//
//                  | useTransition      | useDeferredValue   | debounce
//   ---------------|--------------------|--------------------|-------------------
//   you mark       | the UPDATE         | the VALUE          | the CALL
//   you need       | the setState call  | just the value     | the call site
//   works on props | no                 | YES                | n/a
//   gives isPending| YES                | no (compute isStale)| no
//   delays by      | priority           | priority           | TIME
//   reduces work   | no                 | no                 | YES
//   interruptible  | yes                | yes                | n/a
//
//   The decision tree:
//     Do you own the setState?
//       YES → useTransition (more direct, and isPending is free)
//       NO  → useDeferredValue (it is your only option for a prop)
//
//     Is it a controlled input?
//       → useDeferredValue on the value. NEVER useTransition on the input's
//         own setState, or typing lags. → 11_usedeferredvalue.js §8
//
//     Is the cost a NETWORK REQUEST, not a render?
//       → debounce. Neither hook reduces the number of operations.
//
//     Is the list genuinely enormous?
//       → virtualize. These hooks reprioritize work; they do not remove it.
//
// The sentence that ties it together:
//   "useTransition and useDeferredValue are the same mechanism from opposite
//    ends — one marks the update, the other marks the value. Debounce is a
//    different tool entirely: it reduces how MUCH work happens, they reduce
//    how much it HURTS."


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version                Real React
//   ───────────                ──────────
//   a boolean scope flag       LANES — a bitmask. Transitions get
//                              TransitionLane; clicks get SyncLane. React
//                              can work on several lanes and preempt.
//   flushTransition by hand    the Scheduler package, yielding to the browser
//                              every ~5ms via a MessageChannel
//   never truly interrupts     genuinely abandons the workInProgress tree and
//                              restarts — cheap, because `current` was never
//                              touched (→ Fiber double buffering)
//   n/a                        startTransition also works standalone,
//                              imported from react — but then you get no
//                              isPending
//   n/a                        transitions integrate with Suspense: a
//                              suspending transition keeps the OLD UI instead
//                              of showing a fallback. This is why navigation
//                              does not flash a spinner.
//   n/a                        React 19 Actions: async transitions with
//                              pending, error, and optimistic state built in
//
// The precise fact:
//   A transition does not make anything faster. The 300ms render still takes
//   300ms. It makes the main thread AVAILABLE during those 300ms. Throughput
//   is unchanged — sometimes slightly worse. Responsiveness is transformed.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The transition silently does nothing:
//   An async callback. → §6. The code looks perfect.
//
// Bug 2 — Typing lags after adding useTransition:
//   You wrapped the input's own setState. The input must stay urgent.
//
// Bug 3 — isPending never turns off:
//   You are looking at a transition that keeps getting interrupted by more
//   urgent work — usually the user typing. Not a bug; back-pressure.
//
// Bug 4 — Everything still freezes:
//   The expensive work is not a render. A transition cannot interrupt a
//   500ms synchronous loop inside one component — Fiber yields BETWEEN units
//   of work. → 04_react-fiber-architecture.js §10.
//
// Bug 5 — A spinner flashes on every tab switch:
//   You used a manual loading flag instead of isPending, replacing the old
//   UI. → §5.
//
// Bug 6 — Using it for a network request:
//   It does not dedupe or delay requests. → §7.
//
// Bug 7 — Transitions everywhere:
//   Marking a genuinely urgent update as non-urgent makes the app feel
//   sluggish. "Can wait" must actually be true.
//
// Bug 8 — Expecting it to help in React 17:
//   The API needs concurrent rendering — React 18's createRoot. In legacy
//   mode it is a no-op that just calls the callback.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The freeze:
const blockedLog = withoutTransition();
assert(blockedLog.some(l => l.includes("t=300")),
  "no transition: the click blocked the main thread for the full 300ms");

// isPending semantics — the headline:
assert(states[0].isPending === false, "mount: not pending");
assert(states.some(s => s.isPending === true && s.tab === "home"),
  "while pending, the OLD tab is still rendered — the UI stays usable");
assert(states[states.length - 1].isPending === false &&
  states[states.length - 1].tab === "posts",
  "when the transition lands, isPending clears and the new tab appears");
assert(!states.some(s => s.isPending === true && s.tab === "posts"),
  "you never see the new tab WHILE pending — that is the point of the flag");

// The async trap:
const marks = simulateScope();
assert(marks[0].urgent === false, "setState before the await IS a transition");
assert(marks[1].urgent === true,
  "setState after the await is URGENT — the scope closed when the callback returned 🐛");

console.log("§10 — mini assertions passed for: useTransition");
console.log("\n  The one to remember: 'setState after the await is URGENT'.");
console.log("  Silent, invisible, and the code looks correct.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is useTransition?", answer like this:
//
//   "It marks a state update as non-urgent. Before concurrent React, every
//    update was urgent — so clicking a tab that renders five thousand rows
//    froze the page, and you couldn't even click a different tab because the
//    event couldn't be delivered until the render finished. Wrap that setTab
//    in startTransition and React renders it in the background, yielding
//    between units of work, so a click gets through and React abandons the
//    render it was doing. That's Fiber's payoff — the architecture landed in
//    16, this is what it was for.
//
//    You also get isPending free, and it's better than a manual loading flag
//    for a subtle reason: while pending, the OLD UI is still rendered and
//    fully interactive. A spinner REPLACES the UI and the user loses their
//    place. isPending lets you dim it instead. And it can't get out of sync,
//    unlike a flag you have to unset on every path including errors.
//
//    The trap I'd flag is that startTransition's callback must be
//    synchronous. React sets a flag, calls your callback, and clears the flag
//    when it returns — and an async function returns at the first await. So
//    startTransition(async () => { const d = await fetch(); setData(d); })
//    silently isn't a transition at all. No error, no warning. You await
//    first, then wrap the setState. React 19's Actions exist partly because
//    this is so easy to get wrong.
//
//    Versus useDeferredValue: same mechanism, opposite ends. useTransition
//    marks the update, so you need the setState. useDeferredValue marks the
//    value, which is your only option for a prop — and it's the right one for
//    a controlled input, because wrapping the input's own setState makes
//    typing lag.
//
//    One clarification: it doesn't make anything faster. The 300ms render
//    still costs 300ms. It makes the main thread available during it."
//
// The async trap plus "doesn't make it faster" is the senior answer.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does useTransition do?
// A1. Marks an update non-urgent so React can interrupt its render for urgent
//     work, and gives you isPending.
//
// Q2. Does it make rendering faster?
// A2. No. The work is unchanged — possibly slightly more. It keeps the main
//     thread available, so the app stays responsive.
//
// Q3. Why must the callback be synchronous?
// A3. React marks updates only during the callback's synchronous execution.
//     An async function returns at the first await, closing the scope.
//
// Q4. Why is isPending better than a loading flag?
// A4. The old UI stays mounted and interactive instead of being replaced, and
//     the flag cannot desync — no forgotten setLoading(false).
//
// Q5. useTransition or useDeferredValue?
// A5. Own the setState → useTransition. It is a prop, or a controlled input →
//     useDeferredValue.
//
// Q6. Why does my app still freeze?
// A6. The cost is not in rendering. Fiber yields BETWEEN units of work — one
//     component doing 500ms of synchronous work is one unit.
//
// Q7. Does it work in React 17?
// A7. No. It needs concurrent rendering via createRoot in React 18+.
//
// Q8. What happens if the user interrupts a transition?
// A8. React throws the workInProgress tree away and restarts. It is cheap
//     because `current` — what is on screen — was never touched.
//
// Q9. What about async transitions?
// A9. React 19 Actions and useActionState handle async properly with pending,
//     error, and optimistic state. That is the sanctioned path now.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useTransition?
//   Back : "This update can wait." Non-urgent, interruptible, plus isPending.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : The callback must be SYNCHRONOUS. The scope closes on return.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : startTransition(async () => { await x; setY() }) — silently not a
//          transition.
//
// Flashcard 4:
//   Front: Why is isPending better than a spinner?
//   Back : The old UI stays interactive instead of being replaced.
//
// Flashcard 5:
//   Front: Does it make rendering faster?
//   Back : No. It makes the main thread available during the render.
//
// Flashcard 6:
//   Front: vs useDeferredValue?
//   Back : Marks the UPDATE vs marks the VALUE. Props → deferred.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Call it Fiber's payoff, and name the async scope bug.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild the scope flag from memory. Three lines — and they explain the
//   entire async bug.
//
// Task 2:
//   Add real interruption: call flushTransition({ interruptedBy }) twice and
//   confirm the transition restarts from scratch, not from where it stopped.
//
// Task 3:
//   Add lanes: give each update a priority number and make the scheduler pick
//   the highest first. You have built React's scheduler in miniature.
//
// Task 4:
//   Break §4: wrap the URGENT click in a transition too. Watch the app feel
//   sluggish. "Can wait" must be true.
//
// Task 5:
//   Implement React 19's useActionState shape: an async action with pending,
//   error, and result. Notice how it removes the §6 trap by design.
//
// Task 6:
//   Explain in 60 seconds why startTransition(async () => ...) silently does
//   nothing, to someone whose PR you are reviewing.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   "This update can wait." Non-urgent, interruptible, isPending free.
//
// If you remember the common bug:
//   An async callback closes the transition scope at the first await. Silent.
//   And wrapping a controlled input's setState makes typing lag.
//
// If you remember the professional framing:
//   It does not make rendering faster — it keeps the main thread available.
//   It is Fiber's payoff, eight years later.
//
// NEXT TOPIC -> 13_useid.js
