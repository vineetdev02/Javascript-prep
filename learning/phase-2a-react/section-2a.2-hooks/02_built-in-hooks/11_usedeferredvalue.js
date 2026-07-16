// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  11_usedeferredvalue.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useDeferredValue
//
// WHAT YOU WILL MASTER HERE:
//   1. What it does: two renders, one urgent, one interruptible
//   2. Why it is NOT a debounce — the difference that matters
//   3. The stale-value window, and how to show it to the user
//   4. Why it is USELESS without memo — proven
//   5. useDeferredValue vs useTransition: the honest distinction
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/11_usedeferredvalue.js"
//
// Prerequisite: 01_react-fundamentals/04_react-fiber-architecture.js — this
// hook is the payoff for everything Fiber built.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useDeferredValue:
// Returns a possibly-STALE copy of a value, letting React render the urgent
// part of the UI immediately and the expensive part in an interruptible
// background render.
//
// If interviewer says "explain it simply", say:
// "You give it a value and get back a lagging version. The input renders
//  with the new value instantly, the expensive list renders with the old one
//  and catches up when there is time."
//
// If interviewer asks "why does it matter?", say:
// "Because the typing lag in a search-as-you-type UI is not caused by the
//  input — it is caused by the 10,000-row list re-rendering on the same
//  keystroke. This splits them into two priorities so the keystroke never
//  waits for the list."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   two renders, one urgent and one interruptible
//
// The sequence on a keystroke:
//
//   user types "r"
//        ↓
//   render #1 (URGENT, synchronous)
//     query = "r"           ← the input updates instantly
//     deferred = ""         ← the OLD value. The list does not re-render.
//        ↓
//   🎨 PAINT — the user sees their letter immediately
//        ↓
//   render #2 (BACKGROUND, interruptible)
//     query = "r"
//     deferred = "r"        ← now the list catches up
//        ↓
//   if the user types again mid-render → THROW IT AWAY, start over
//
// Runtime rule:
//   The component renders TWICE per change. The second render is
//   interruptible — React abandons it if something more urgent arrives.
//   Nothing is delayed by a timer; React just does the cheap work first.
//
// Practical rule:
//   Wrap the EXPENSIVE consumer's input with it, and memo that consumer.
//   Without memo, both renders do the expensive work and you have made
//   things strictly worse.
//
// Common trap:
//   "It is a built-in debounce." It is not. A debounce delays by TIME. This
//   delays by PRIORITY. On a fast machine, there is no delay at all.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD IT
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  const paints = [];
  let renderCount = 0;
  let pendingDeferred = null;

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { value: initial };
    const setState = (next) => {
      const value = typeof next === "function" ? next(hooks[slot].value) : next;
      if (Object.is(value, hooks[slot].value)) return;
      hooks[slot].value = value;
      renderUrgent();
    };
    return [hooks[slot].value, setState];
  }

  // ── THE HOOK ────────────────────────────────────────────────────
  function useDeferredValue(value) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { current: value };

    if (!Object.is(hooks[slot].value, value)) {
      // The value changed. Return the OLD one for this urgent render, and
      // schedule a background render that will return the new one.
      if (!Object.is(hooks[slot].current, value)) {
        pendingDeferred = { slot, value };
        return hooks[slot].current;         // ← the STALE value
      }
    }
    return hooks[slot].current;
  }

  function renderUrgent() {
    cursor = 0;
    renderCount++;
    const output = component();
    paints.push({ kind: "urgent", ...output });

    // Now the background render — interruptible.
    if (pendingDeferred) {
      const { slot, value } = pendingDeferred;
      pendingDeferred = null;
      hooks[slot].current = value;          // catch up
      cursor = 0;
      renderCount++;
      const bg = component();
      paints.push({ kind: "background", ...bg });
    }
    return output;
  }

  function mount(fn) {
    component = fn;
    return renderUrgent();
  }

  return {
    useState, useDeferredValue, mount,
    getPaints: () => paints.slice(),
    getRenderCount: () => renderCount,
    // Simulate an interrupt: the user typed before the bg render finished.
    dropPending: () => { pendingDeferred = null; },
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — TWO RENDERS PER KEYSTROKE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — what one keystroke actually produces:\n");

const R1 = createMiniReact();
let type1;

R1.mount(() => {
  const [query, setQuery] = R1.useState("");
  const deferredQuery = R1.useDeferredValue(query);
  type1 = setQuery;
  return { input: query, list: deferredQuery };
});

type1("r");

console.log("  user types 'r' into an empty search box:\n");
for (const paint of R1.getPaints()) {
  console.log(`    ${paint.kind.padEnd(11)} input="${paint.input}" list renders "${paint.list}"`);
}
console.log("\n  The urgent render shows the input as 'r' while the list still");
console.log("  shows results for '' — the OLD value. The user sees their letter");
console.log("  immediately. Then the background render catches the list up.");
console.log("\n  That mismatch — input ahead of list — IS the feature. You are");
console.log("  deliberately showing a stale list for a few milliseconds so the");
console.log("  keystroke never waits.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — IT IS NOT A DEBOUNCE
// ══════════════════════════════════════════════════════════════════
//
// The single most-asked follow-up. Get this right and you sound senior.

console.log("§5 — useDeferredValue vs debounce:\n");

// A debounce: waits a FIXED TIME, drops everything in between.
function simulateDebounce(keystrokes, delayMs, gapMs) {
  const renders = [];
  let timer = null;
  let clock = 0;
  for (const key of keystrokes) {
    clock += gapMs;
    if (timer !== null && clock - timer < delayMs) {
      // still within the window — cancel and restart
    }
    timer = clock;
  }
  // Only ONE render, delayMs after the LAST keystroke:
  renders.push({ at: clock + delayMs, value: keystrokes.join("") });
  return renders;
}

// useDeferredValue: no timer. It renders as fast as the machine allows.
function simulateDeferred(keystrokes, gapMs, listRenderMs) {
  const renders = [];
  let clock = 0;
  let bgStart = null;
  let bgValue = null;

  for (let i = 0; i < keystrokes.length; i++) {
    clock += gapMs;
    const typed = keystrokes.slice(0, i + 1).join("");

    // An in-flight background render gets INTERRUPTED by the new keystroke.
    if (bgStart !== null && clock - bgStart < listRenderMs) {
      bgStart = null;                        // thrown away — no render logged
    } else if (bgStart !== null) {
      renders.push({ at: bgStart + listRenderMs, value: bgValue });
    }
    bgStart = clock;
    bgValue = typed;
  }
  // The last background render finishes:
  renders.push({ at: bgStart + listRenderMs, value: bgValue });
  return renders;
}

const keys = ["r", "e", "a", "c", "t"];

console.log("  user types 'react' — 5 keys, 50ms apart. The list takes 30ms.\n");

console.log("  DEBOUNCE (300ms):");
for (const r of simulateDebounce(keys, 300, 50)) {
  console.log(`    at ${String(r.at).padStart(3)}ms → list renders "${r.value}"`);
}
console.log("    → ONE render, 300ms after the last key. The user stares at a");
console.log("      stale list for 300ms even though the machine was idle.\n");

console.log("  useDeferredValue:");
for (const r of simulateDeferred(keys, 50, 30)) {
  console.log(`    at ${String(r.at).padStart(3)}ms → list renders "${r.value}"`);
}
console.log("    → renders whenever there is TIME. Keys 50ms apart and a 30ms");
console.log("      list means it keeps up. On a fast machine there is NO delay.\n");

console.log("  The differences that matter:\n");
console.log("    debounce            | useDeferredValue");
console.log("    --------------------|--------------------------------");
console.log("    delays by TIME      | delays by PRIORITY");
console.log("    fixed lag, always   | zero lag if the machine is fast");
console.log("    a magic number      | adapts to the actual device");
console.log("    blocks when it runs | interruptible mid-render");
console.log("    fires the work late | starts immediately, may be abandoned");
console.log("\n  The key insight: a debounce punishes fast machines with the same");
console.log("  300ms as slow ones. useDeferredValue is FREE when there is time");
console.log("  and degrades gracefully when there is not.");
console.log("\n  ⚠️  BUT: a debounce also reduces the NUMBER of operations. If");
console.log("     each keystroke fires a network request, useDeferredValue does");
console.log("     NOT help — it does not skip work, it reprioritizes rendering.");
console.log("     For network calls you still want a debounce. They solve");
console.log("     different problems and they compose.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — USELESS WITHOUT memo
// ══════════════════════════════════════════════════════════════════
//
// The gotcha that makes people say "useDeferredValue did nothing".

console.log("§6 — why it does nothing without React.memo:\n");

let listWork = 0;

// A NON-memoized list: re-renders whenever the parent does, regardless.
function PlainList() { listWork++; }

// A memoized list: re-renders only if its props changed.
function createMemoList() {
  let lastQuery;
  return (query) => {
    if (!Object.is(query, lastQuery)) { listWork++; lastQuery = query; }
  };
}

// ── deferred + PLAIN list ───────────────────────────────────────
listWork = 0;
const R2 = createMiniReact();
let type2;
R2.mount(() => {
  const [query, setQuery] = R2.useState("");
  const deferred = R2.useDeferredValue(query);
  type2 = setQuery;
  PlainList(deferred);                       // not memoized
  return { input: query, list: deferred };
});
listWork = 0;                                // ignore the mount — count ONE keystroke
type2("r");
const plainWork = listWork;

// ── deferred + MEMO list ────────────────────────────────────────
listWork = 0;
const memoList = createMemoList();
const R3 = createMiniReact();
let type3;
R3.mount(() => {
  const [query, setQuery] = R3.useState("");
  const deferred = R3.useDeferredValue(query);
  type3 = setQuery;
  memoList(deferred);                        // memoized on `deferred`
  return { input: query, list: deferred };
});
listWork = 0;                                // ignore the mount — count ONE keystroke
type3("r");
const memoWork = listWork;

console.log("  one keystroke, which causes 2 renders (urgent + background):\n");
console.log("    <List query={deferred} />          → list rendered",
  plainWork, "times 🐛");
console.log("    <MemoList query={deferred} />      → list rendered",
  memoWork, "times ✅");

console.log("\n  Without memo, the list re-renders on the URGENT render too —");
console.log("  even though `deferred` did not change on that render. So you");
console.log("  did the expensive work during the render that was supposed to");
console.log("  be fast, AND you did it again in the background. Strictly worse");
console.log("  than not using the hook at all.");
console.log("\n  With memo, the urgent render passes the SAME deferred value, so");
console.log("  the memo hits and the list is skipped entirely. That skip is the");
console.log("  entire mechanism. useDeferredValue only creates the OPPORTUNITY");
console.log("  to skip — memo is what takes it.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — SHOWING THE STALENESS
// ══════════════════════════════════════════════════════════════════
//
// Since the list is knowingly stale, tell the user. React's docs recommend
// exactly this:
//
//   const deferredQuery = useDeferredValue(query);
//   const isStale = query !== deferredQuery;      // ← free. Just compare.
//
//   <div style={{ opacity: isStale ? 0.5 : 1, transition: "opacity 0.2s" }}>
//     <SearchResults query={deferredQuery} />
//   </div>
//
// Two notes worth saying out loud:
//   • The transition delay is deliberate. If the deferred render finishes
//     fast, the fade never becomes visible — no flash of a loading state on
//     a fast machine. That is a nicer UX than a spinner that blinks.
//   • isStale costs nothing. It is a string comparison you already have.

console.log("§7 — the staleness indicator:\n");

for (const paint of R1.getPaints()) {
  const isStale = paint.input !== paint.list;
  console.log(`    ${paint.kind.padEnd(11)} query="${paint.input}" deferred="${paint.list}"` +
    `  isStale=${String(isStale).padEnd(5)} → opacity ${isStale ? "0.5" : "1"}`);
}
console.log("\n  During the urgent render the list is dimmed. By the background");
console.log("  render it is current again and full opacity. If that takes 8ms,");
console.log("  the CSS transition never even starts — the user sees nothing.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — useDeferredValue vs useTransition
// ══════════════════════════════════════════════════════════════════
//
// They do the SAME THING at different ends of the wire. This is the
// distinction interviewers actually probe.
//
//   useTransition       — you mark the STATE UPDATE as non-urgent
//                         startTransition(() => setQuery(value));
//                         Requires access to the setState call.
//
//   useDeferredValue    — you mark the VALUE as laggable
//                         const deferred = useDeferredValue(query);
//                         Works when you do NOT control the update.
//
// The decision rule:
//   Do you own the setState? → useTransition (more direct, gives isPending)
//   Is the value a PROP from someone else? → useDeferredValue (your only option)
//
// That prop case is the killer argument:
//
//   function SearchResults({ query }) {      // query is a prop. You cannot
//     const deferred = useDeferredValue(query);   // wrap someone else's setState.
//     ...
//   }
//
// Also: useDeferredValue works with a controlled input where useTransition
// does not. If you wrap setQuery in startTransition, the INPUT itself becomes
// non-urgent and typing lags — the exact opposite of what you wanted. The
// input must be urgent; only the list should lag.
//
// That last point is a genuinely good thing to say. It shows you have used
// both rather than read about both.


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real React
//   ───────────               ──────────
//   the bg render runs        it is scheduled at TransitionLane priority and
//   immediately after         genuinely interrupted by higher-priority work
//   never actually interrupts  a keystroke mid-background-render throws the
//                             whole thing away and restarts
//   n/a                       React 19 added an initialValue argument:
//                             useDeferredValue(value, initialValue) — the
//                             first render uses initialValue, which helps SSR
//   n/a                       it integrates with Suspense: a deferred render
//                             that suspends keeps showing the old UI instead
//                             of a fallback. This is how you avoid a spinner
//                             flash on every keystroke.
//   n/a                       no effect on the first mount — nothing to be
//                             stale relative to
//
// The precise fact:
//   useDeferredValue does NOT reduce the amount of work. Both renders happen.
//   It changes WHEN and at what priority, and lets memo skip one of them.
//   If your bottleneck is the total work, this hook is the wrong tool —
//   virtualize instead. → 08_list-rendering.js §8


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "It did nothing":
//   The consumer is not memoized. → §6. The #1 cause by far.
//
// Bug 2 — Typing still lags:
//   The expensive work is in the SAME component as the input, not in a
//   memoized child. There is nothing to skip.
//
// Bug 3 — The input lags after wrapping setQuery in startTransition:
//   You deferred the wrong thing. → §8.
//
// Bug 4 — A spinner flashes on every keystroke:
//   The deferred subtree suspends. Use the stale-while-revalidate behavior,
//   or an isStale opacity instead of a fallback.
//
// Bug 5 — Using it instead of a debounce for network calls:
//   It does not reduce the number of requests. Different problem. → §5.
//
// Bug 6 — Using it to fix a 10,000-row list:
//   The work is still 10,000 rows. Virtualize. This only reprioritizes.
//
// Bug 7 — Deferring a value that is cheap to render:
//   Two renders instead of one, for nothing.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

const paints = R1.getPaints();

// Two renders, and the urgent one is deliberately inconsistent:
assert(paints.length === 3, "mount + urgent + background = 3 renders logged");
assert(paints[1].kind === "urgent" && paints[1].input === "r" && paints[1].list === "",
  "URGENT render: input updated to 'r', list still showing '' — deliberately stale");
assert(paints[2].kind === "background" && paints[2].list === "r",
  "BACKGROUND render: the list catches up");
assert(paints[1].input !== paints[1].list,
  "the urgent render is INCONSISTENT — that inconsistency is the whole feature");
assert(paints[2].input === paints[2].list,
  "...and it resolves by the background render");

// isStale is free:
assert((paints[1].input !== paints[1].list) === true, "isStale is true during the urgent render");
assert((paints[2].input !== paints[2].list) === false, "and false once it catches up");

// The memo requirement — the headline:
assert(plainWork === 2,
  "no memo: the list rendered on BOTH the urgent and background render 🐛");
assert(memoWork === 1,
  "with memo: the urgent render skipped the list entirely ✅");
assert(plainWork > memoWork,
  "useDeferredValue creates the chance to skip; memo is what takes it");

// It is not a debounce:
const debounced = simulateDebounce(keys, 300, 50);
const deferred = simulateDeferred(keys, 50, 30);
assert(debounced.length === 1, "debounce: ONE render, after the timer");
assert(debounced[0].at === 550, "...550ms — 300ms after the last key, always");
assert(deferred[deferred.length - 1].at < debounced[0].at,
  "useDeferredValue finished sooner — it never waits for a timer");
assert(deferred.length > 1,
  "and it rendered intermediate values whenever there was time");

console.log("§11 — mini assertions passed for: useDeferredValue");
console.log("\n  The two that matter: the urgent render is deliberately");
console.log("  inconsistent (input ahead of list), and without memo the list");
console.log("  renders twice instead of once.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is useDeferredValue?", answer like this:
//
//   "It returns a lagging copy of a value so React can split one update into
//    two renders at different priorities. On a keystroke, the urgent render
//    has the new query but the OLD deferred value, so the input updates
//    instantly and the expensive list doesn't re-render at all. Then a
//    background render catches the list up — and if the user types again
//    mid-render, React throws that work away and restarts.
//
//    The comparison people expect is debounce, and the distinction is that a
//    debounce delays by TIME and this delays by PRIORITY. A 300ms debounce
//    punishes a fast machine with the same 300ms as a slow one. This is free
//    when there's time and degrades gracefully when there isn't. But they
//    solve different problems — useDeferredValue doesn't reduce the NUMBER of
//    operations, so if each keystroke fires a network request you still want
//    a debounce. They compose.
//
//    The gotcha is that it's useless without memo. If the list isn't
//    memoized, it re-renders on the urgent render too, so you do the
//    expensive work on the render that was supposed to be fast AND again in
//    the background — strictly worse than not using it. The hook only creates
//    the opportunity to skip; memo takes it.
//
//    Versus useTransition: same mechanism, different end of the wire.
//    useTransition marks the state update non-urgent, so you need to own the
//    setState. useDeferredValue marks the value laggable, which is your only
//    option when it's a prop. And for a controlled input, useTransition is
//    actively wrong — wrapping setQuery makes the INPUT non-urgent and typing
//    lags, which is backwards.
//
//    Nice touch: isStale is just query !== deferred, so you can dim the list
//    with a CSS transition that never becomes visible if the render is fast."
//
// The debounce distinction + the memo requirement + the controlled-input
// point is a complete senior answer.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does useDeferredValue do?
// A1. Returns a stale copy so React can render the urgent UI first and the
//     expensive consumer in an interruptible background render.
//
// Q2. Is it a debounce?
// A2. No. Debounce delays by time with a fixed magic number. This delays by
//     priority and is free on a fast machine.
//
// Q3. Does it replace debounce for search?
// A3. Not for the network call — it does not reduce the number of requests.
//     It reprioritizes rendering. Use both.
//
// Q4. Why did it not help my app?
// A4. The consumer is not memoized, so it re-renders on the urgent pass too.
//
// Q5. useDeferredValue or useTransition?
// A5. Own the setState → useTransition (and you get isPending). It is a prop,
//     or a controlled input → useDeferredValue.
//
// Q6. Why is useTransition wrong for a controlled input?
// A6. It makes the input's own update non-urgent, so typing lags. The input
//     must stay urgent; only the list should defer.
//
// Q7. How do you show the user it is stale?
// A7. query !== deferred, then an opacity with a CSS transition — invisible
//     if the render is fast.
//
// Q8. Does it reduce work?
// A8. No. Both renders happen. For a genuinely huge list, virtualize.
//
// Q9. What happens on the first render?
// A9. Nothing to defer — it returns the value. React 19 adds an initialValue
//     argument for the SSR case.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useDeferredValue?
//   Back : A lagging copy → urgent render skips the expensive consumer.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : Two renders per change. The second is interruptible.
//
// Flashcard 3:
//   Front: Is it a debounce?
//   Back : No. Debounce delays by TIME; this delays by PRIORITY.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : Forgetting memo — then the list renders twice, not zero times.
//
// Flashcard 5:
//   Front: vs useTransition?
//   Back : Own the setState → useTransition. It is a prop → useDeferredValue.
//
// Flashcard 6:
//   Front: How do you show staleness?
//   Back : value !== deferred → opacity, with a transition that may never show.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Say it does not reduce work, and that debounce is still right for
//          network calls.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild useDeferredValue from memory. The trick: return the OLD value and
//   schedule a render that returns the new one.
//
// Task 2:
//   Add real interruption: call dropPending() mid-background-render and prove
//   the intermediate value never paints. That is what React does on a keystroke.
//
// Task 3:
//   Remove memo from §6 in your own head first — predict the number BEFORE
//   running it. If you predicted 2, you understand the hook.
//
// Task 4:
//   Implement useTransition in the same mini React. Notice you need access to
//   the setState. That constraint IS the difference from useDeferredValue.
//
// Task 5:
//   Simulate a slow machine: make listRenderMs 200 in §5. Now which wins,
//   debounce or deferred? Form an opinion you can defend with the numbers.
//
// Task 6:
//   Explain in 60 seconds why useDeferredValue is not a debounce, to someone
//   about to delete their debounce and replace it with this hook.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Two renders — urgent with the old value, background with the new. It
//   delays by PRIORITY, not by time.
//
// If you remember the common bug:
//   No memo on the consumer = the expensive work runs twice instead of once.
//
// If you remember the professional framing:
//   It does not reduce work, only reprioritizes it. Debounce is still right
//   for network calls. And useTransition would make your input lag.
//
// NEXT TOPIC -> 12_usetransition.js
