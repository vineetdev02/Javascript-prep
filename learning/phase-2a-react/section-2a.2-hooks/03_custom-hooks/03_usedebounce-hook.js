// ╔══════════════════════════════════════════════════════════════════╗
// ║   Custom Hooks  →  03_usedebounce-hook.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useDebounce hook
//
// WHAT YOU WILL MASTER HERE:
//   1. Build useDebounce — and see why the cleanup IS the debounce
//   2. Debounce vs throttle, measured on the same input
//   3. The useDebouncedCallback trap (a new timer every render)
//   4. Debounce vs useDeferredValue — when each is correct
//   5. Why the value version is easier to get right than the callback version
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/03_custom-hooks/03_usedebounce-hook.js"
//
// Prerequisites: 04_asynchronous-javascript/16_debounce.js (Phase 1 — the
// plain-JS version), 02_built-in-hooks/03_useeffect-cleanup.js.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useDebounce:
// Returns a value that only updates after the input has stopped changing for
// N milliseconds — so expensive work fires once, not once per keystroke.
//
// If interviewer says "explain it simply", say:
// "Every time the value changes, it restarts a timer. Only when the user
//  pauses does the debounced value catch up. So typing 'react' fires one
//  search, not five."
//
// If interviewer asks "why does it matter?", say:
// "Because the alternative is a network request per keystroke. And because
//  the hook version is almost entirely about useEffect's cleanup — the
//  cleanup cancelling the previous timer IS the debounce. That is the whole
//  implementation."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   the cleanup IS the debounce
//
// The mechanism:
//
//   value = "r"   → effect runs → setTimeout(500ms)
//   value = "re"  → cleanup CANCELS the previous timer → new setTimeout(500ms)
//   value = "rea" → cleanup CANCELS → new setTimeout(500ms)
//   ...user stops typing...
//   500ms pass → the timer finally fires → setDebounced("rea")
//
// Every keystroke kills the previous timer. Only the LAST one survives.
// That is why the entire hook is eight lines: useEffect's cleanup already
// does the cancelling for you.
//
// Runtime rule:
//   The cleanup runs before every re-run of the effect — not just on unmount.
//   That is exactly the behavior a debounce needs.
//   → 02_built-in-hooks/03_useeffect-cleanup.js
//
// Practical rule:
//   Debounce the VALUE, not the callback. The value version is trivial to get
//   right; the callback version has a stale-closure trap. → §5
//
// Common trap:
//   Creating the debounced function inside the component body without
//   useCallback/useRef — a NEW debounced function every render means a NEW
//   internal timer, so nothing is ever actually cancelled and nothing is
//   debounced. → §5


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD IT
// ══════════════════════════════════════════════════════════════════
//
// The real hook, in full:
//
//   function useDebounce(value, delay) {
//     const [debounced, setDebounced] = useState(value);
//
//     useEffect(() => {
//       const timer = setTimeout(() => setDebounced(value), delay);
//       return () => clearTimeout(timer);      // ← THE DEBOUNCE
//     }, [value, delay]);
//
//     return debounced;
//   }
//
// That is it. Eight lines. Look at what each does:
//   • the effect re-runs on every value change (value is in the deps)
//   • the cleanup cancels the timer from the PREVIOUS value
//   • only a value that survives `delay` ms without a change gets through
//
// Usage:
//   const [query, setQuery] = useState("");        // urgent — the input
//   const debouncedQuery = useDebounce(query, 500); // lagging — the search
//   useEffect(() => { search(debouncedQuery); }, [debouncedQuery]);
//
// Note the shape: the input stays instant, only the SEARCH lags. Same
// principle as useDeferredValue. → §6

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  const timers = new Map();
  let nextTimerId = 1;
  let clock = 0;

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { value: initial };
    const setState = (v) => {
      if (Object.is(v, hooks[slot].value)) return;
      hooks[slot].value = v;
      render();
    };
    return [hooks[slot].value, setState];
  }

  function useEffect(fn, deps) {
    const slot = cursor++;
    const prev = hooks[slot];
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
    if (changed) {
      if (prev && typeof prev.cleanup === "function") prev.cleanup();
      hooks[slot] = { deps, cleanup: undefined };
      hooks[slot].cleanup = fn();
    }
  }

  // A controllable clock, so the demos are deterministic.
  const setTimeoutFake = (fn, ms) => {
    const id = nextTimerId++;
    timers.set(id, { fn, at: clock + ms });
    return id;
  };
  const clearTimeoutFake = (id) => timers.delete(id);

  const advance = (ms) => {
    const target = clock + ms;
    let fired = 0;
    // Fire every timer due in this window, in time order.
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, timer] = due;
      clock = timer.at;
      timers.delete(id);
      timer.fn();
      fired++;
    }
    clock = target;
    return fired;
  };

  function render() { cursor = 0; return component(); }
  function mount(fn) { component = fn; return render(); }

  return {
    useState, useEffect, mount,
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    advance,
    now: () => clock,
    liveTimers: () => timers.size,
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE CLEANUP IS THE DEBOUNCE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — typing 'react', one letter every 100ms, debounce 500ms:\n");

const R = createMiniReact();
const searches = [];
let setQuery;

R.mount(() => {
  const [query, set] = R.useState("");
  const [debounced, setDebounced] = R.useState("");
  setQuery = set;

  // useDebounce, inlined so you can see it work:
  R.useEffect(() => {
    const timer = R.setTimeout(() => setDebounced(query), 500);
    return () => R.clearTimeout(timer);          // ← cancels the previous one
  }, [query]);

  // The consumer: fires a "search" whenever the debounced value changes.
  R.useEffect(() => {
    if (debounced) searches.push({ at: R.now(), query: debounced });
  }, [debounced]);

  return { query, debounced };
});

for (const char of "react") {
  setQuery(("react".slice(0, "react".indexOf(char) + 1)));
  console.log(`  t=${String(R.now()).padStart(3)}ms  typed "${char}"` +
    ` → live timers: ${R.liveTimers()} (the previous one was cancelled)`);
  R.advance(100);
}

console.log(`\n  t=${R.now()}ms  user stops typing. Waiting...`);
R.advance(500);

console.log(`  t=${R.now()}ms  the surviving timer fires\n`);
console.log("  searches actually made:", JSON.stringify(searches));
console.log("\n  ONE search, for the complete word. Five keystrokes, four");
console.log("  cancelled timers, one survivor.");
console.log("\n  Note `live timers: 1` after every keystroke — never 2, never 5.");
console.log("  The cleanup cancels the old timer before the effect creates the");
console.log("  new one. That ordering is guaranteed by useEffect, and it is");
console.log("  the entire debounce. → 02_built-in-hooks/03_useeffect-cleanup.js\n");

// Without the cleanup — the proof:
const R2 = createMiniReact();
const badSearches = [];
let setQuery2;

R2.mount(() => {
  const [query, set] = R2.useState("");
  const [debounced, setDebounced] = R2.useState("");
  setQuery2 = set;
  R2.useEffect(() => {
    R2.setTimeout(() => setDebounced(query), 500);
    // NO CLEANUP. 🐛
  }, [query]);
  R2.useEffect(() => {
    if (debounced) badSearches.push(debounced);
  }, [debounced]);
  return { query, debounced };
});

for (let i = 1; i <= 5; i++) {
  setQuery2("react".slice(0, i));
  R2.advance(100);
}
R2.advance(600);

console.log("  the SAME hook with the cleanup removed:");
console.log("    searches made:", JSON.stringify(badSearches), "🐛");
console.log("    Every timer survived and fired. That is not a debounce — it");
console.log("    is a 500ms DELAY on every keystroke. Same number of requests,");
console.log("    just later. Deleting one line removes the entire feature.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE CALLBACK VERSION AND ITS TRAP
// ══════════════════════════════════════════════════════════════════
//
// Debouncing a FUNCTION instead of a value is where people get hurt.
//
//   ❌ BROKEN:
//     function SearchBox() {
//       const [query, setQuery] = useState("");
//       const debouncedSearch = debounce(q => search(q), 500);   // 🐛
//       return <input onChange={e => debouncedSearch(e.target.value)} />;
//     }
//
//   `debounce()` returns a function that closes over ITS OWN timer variable.
//   Every render creates a NEW debounced function with a NEW timer. So the
//   second keystroke's function knows nothing about the first's timer and
//   cancels nothing. You debounced nothing at all.
//
//   ✅ FIXED — one stable debounced function for the component's lifetime:
//     const debouncedSearch = useMemo(() => debounce(q => search(q), 500), []);
//     // or useRef, or use-debounce's useDebouncedCallback
//
//   ⚠️  ...but now the closure is frozen at render #1. If search() reads other
//       state, it reads STALE state. Which is the useCallback([]) tension all
//       over again. → 02_built-in-hooks/08_usecallback-when-to-use.js §7
//
// This is why debouncing the VALUE is the better default: there is no closure
// to freeze. The value flows through state, and state is always current.

console.log("§5 — debouncing a callback: a new timer every render:\n");

function makeDebounce(setTimeoutFn, clearTimeoutFn) {
  return function debounce(fn, ms) {
    let timer = null;                       // ← lives in THIS closure
    return (...args) => {
      if (timer !== null) clearTimeoutFn(timer);
      timer = setTimeoutFn(() => fn(...args), ms);
    };
  };
}

const R3 = createMiniReact();
const debounce = makeDebounce(R3.setTimeout, R3.clearTimeout);
const brokenCalls = [];
const fixedCalls = [];

// ❌ a new debounced function per "render"
for (let i = 1; i <= 3; i++) {
  const perRenderDebounced = debounce(q => brokenCalls.push(q), 500);
  perRenderDebounced("react".slice(0, i));
  R3.advance(100);
}
R3.advance(600);

// ✅ ONE debounced function, reused (what useMemo/useRef gives you)
const R4 = createMiniReact();
const debounce4 = makeDebounce(R4.setTimeout, R4.clearTimeout);
const stableDebounced = debounce4(q => fixedCalls.push(q), 500);
for (let i = 1; i <= 3; i++) {
  stableDebounced("react".slice(0, i));
  R4.advance(100);
}
R4.advance(600);

console.log("  3 keystrokes, 500ms debounce:\n");
console.log("    new debounced fn per render →", JSON.stringify(brokenCalls),
  "🐛 THREE calls");
console.log("    one stable debounced fn     →", JSON.stringify(fixedCalls),
  "✅ ONE call");
console.log("\n  Each per-render function had its own private `timer` variable,");
console.log("  so it had nothing to cancel. The debounce ran perfectly — three");
console.log("  separate times, in three separate closures.");
console.log("\n  Fix: useMemo(() => debounce(fn, 500), []) or a ref. But then the");
console.log("  closure is frozen at render #1 and reads stale state — the exact");
console.log("  useCallback([]) tension. That is why debouncing the VALUE wins:");
console.log("  no closure to freeze.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — DEBOUNCE vs THROTTLE vs useDeferredValue
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the same input, three strategies:\n");

// Debounce: only after silence.
function simulateDebounce(events, wait) {
  const fired = [];
  let timer = null;
  for (const e of events) {
    if (timer !== null && e.at - timer.scheduledAt < wait) {
      // cancelled by this event
    } else if (timer !== null) {
      fired.push({ at: timer.scheduledAt + wait, value: timer.value });
    }
    timer = { scheduledAt: e.at, value: e.value };
  }
  if (timer) fired.push({ at: timer.scheduledAt + wait, value: timer.value });
  return fired;
}

// Throttle: at most once per interval.
function simulateThrottle(events, interval) {
  const fired = [];
  let lastFired = -Infinity;
  for (const e of events) {
    if (e.at - lastFired >= interval) {
      fired.push({ at: e.at, value: e.value });
      lastFired = e.at;
    }
  }
  return fired;
}

const typing = "react".split("").map((_, i) => ({
  at: i * 100,
  value: "react".slice(0, i + 1),
}));

console.log("  typing 'react', one letter every 100ms:\n");
console.log("    debounce(500) →",
  JSON.stringify(simulateDebounce(typing, 500).map(f => `${f.at}ms:${f.value}`)));
console.log("      → ONE call, after the user stops. Perfect for search.");
console.log("\n    throttle(200) →",
  JSON.stringify(simulateThrottle(typing, 200).map(f => `${f.at}ms:${f.value}`)));
console.log("      → a call every 200ms DURING typing. Perfect for scroll,");
console.log("        resize, or a progress indicator — where you want regular");
console.log("        updates, not just the final one.");

console.log("\n  The distinction in one line:");
console.log("    debounce → 'tell me when they STOP'   (search, autosave, validation)");
console.log("    throttle → 'tell me at most every N'  (scroll, resize, mousemove)");

console.log("\n  And versus useDeferredValue:");
console.log("    debounce         → reduces the NUMBER of operations. Use it");
console.log("                       when each one costs a NETWORK REQUEST.");
console.log("    useDeferredValue → reduces the PRIORITY of rendering. Use it");
console.log("                       when the cost is a slow re-render.");
console.log("\n  They are not alternatives — they COMPOSE. A real search box:");
console.log("    const debouncedQuery = useDebounce(query, 300);   // fewer fetches");
console.log("    const deferredResults = useDeferredValue(results); // smoother list");
console.log("  → 02_built-in-hooks/11_usedeferredvalue.js §5\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHAT REAL LIBRARIES DO DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               use-debounce / lodash.debounce
//   ───────────               ─────────────────────────────
//   trailing edge only        leading: true — fire immediately, THEN debounce.
//                             Good for a submit button: instant feedback plus
//                             double-click protection.
//   n/a                       maxWait — "debounce, but fire at least every N
//                             ms". Solves the pathological case where a user
//                             types continuously and the search NEVER fires.
//   n/a                       .cancel() and .flush() — cancel a pending call,
//                             or fire it now (e.g. on form submit)
//   n/a                       useDebouncedCallback with a stable identity AND
//                             a ref to the latest callback — so it does not go
//                             stale. That combination is the reason to use the
//                             library instead of hand-rolling it.
//
// The maxWait point is a genuinely good thing to raise:
//   A pure debounce has a starvation bug. If a user types steadily with gaps
//   under the delay, the search NEVER fires. maxWait guarantees progress.
//   Almost nobody thinks of this in an interview.


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The debounce does nothing:
//   A new debounced function every render. → §5. The #1 cause.
//
// Bug 2 — Every keystroke fires, just 500ms later:
//   Missing cleanup. That is a delay, not a debounce. → §4.
//
// Bug 3 — The debounced callback reads stale state:
//   useMemo(() => debounce(fn), []) freezes the closure. Use a ref for the
//   latest callback, or debounce the value instead.
//
// Bug 4 — The search never fires:
//   The user types steadily and never pauses for the full delay. Needs
//   maxWait. → §7.
//
// Bug 5 — A pending debounce fires after unmount:
//   No clearTimeout in the cleanup → a state update on an unmounted component.
//
// Bug 6 — The input lags:
//   You debounced the INPUT's value instead of the search. The input must be
//   instant; only the expensive consumer lags.
//
// Bug 7 — Using debounce where useDeferredValue belongs:
//   The cost is rendering, not requests. You added a fixed 300ms of lag for
//   nothing. → §6.
//
// Bug 8 — Debouncing without cancelling the request too:
//   Fewer requests, but the race condition is still there. Debounce and
//   AbortController solve different halves. → 02_usefetch-custom-hook.js


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The debounce works:
assert(searches.length === 1, "5 keystrokes → exactly ONE search");
assert(searches[0].query === "react", "...for the COMPLETE word, not a prefix");

// The cleanup IS the debounce — remove it and the feature is gone:
assert(badSearches.length === 5,
  "no cleanup: all 5 timers fired. That is a delay, not a debounce 🐛");
assert(badSearches.length > searches.length,
  "one deleted line = 5x the requests");

// The callback trap:
assert(brokenCalls.length === 3,
  "a new debounced fn per render → each has its own timer → nothing cancels 🐛");
assert(fixedCalls.length === 1,
  "one stable debounced fn → the timer is shared → one call ✅");
assert(fixedCalls[0] === "rea", "...with the last value");

// Debounce vs throttle on identical input:
const deb = simulateDebounce(typing, 500);
const thr = simulateThrottle(typing, 200);
assert(deb.length === 1, "debounce: one call, after silence");
assert(thr.length > 1, "throttle: several calls, DURING the activity");
assert(deb[0].at > thr[0].at,
  "throttle fires FIRST (immediately); debounce fires LAST (after the pause)");
assert(thr[0].value === "r",
  "throttle's first call has the FIRST value — useless for a search");
assert(deb[0].value === "react",
  "debounce's only call has the FINAL value — exactly what a search wants");

console.log("§9 — mini assertions passed for: useDebounce");
console.log("\n  The pair that says it all: throttle's first call carries 'r',");
console.log("  debounce's only call carries 'react'. Same input, opposite");
console.log("  tools — and that is why one is for search and one is for scroll.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "write a useDebounce hook", say this while writing:
//
//   "It's a useState plus a useEffect, and the interesting part is that the
//    CLEANUP is the debounce.
//
//    const [debounced, setDebounced] = useState(value);
//    useEffect(() => {
//      const t = setTimeout(() => setDebounced(value), delay);
//      return () => clearTimeout(t);
//    }, [value, delay]);
//
//    Every value change re-runs the effect, and useEffect runs the cleanup
//    BEFORE the next setup — so each keystroke cancels the previous timer. Only
//    a value that survives the full delay without a change gets through. Delete
//    that one clearTimeout line and it's not a debounce anymore, it's a 500ms
//    delay on every keystroke — same number of requests, just later.
//
//    I'd debounce the VALUE rather than a callback, deliberately. The callback
//    version has a trap: debounce() returns a function closing over its own
//    timer, so if you create it in the component body you get a new one every
//    render, each with its own timer, cancelling nothing. You wrap it in
//    useMemo to fix that — and now the closure is frozen at render one and
//    reads stale state. The value version has no closure to freeze.
//
//    Versus throttle: debounce says 'tell me when they stop' — search,
//    autosave, validation. Throttle says 'at most every N ms' — scroll,
//    resize. And versus useDeferredValue: debounce reduces the NUMBER of
//    operations, so it's right when each one is a network request.
//    useDeferredValue reduces render priority. They compose — I'd debounce the
//    query and defer the results.
//
//    One thing I'd add in production: maxWait. A pure debounce can starve — if
//    the user types steadily with gaps under the delay, the search never fires
//    at all."
//
// The cleanup insight, the callback trap, and maxWait make this senior.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How does useDebounce work?
// A1. An effect keyed on the value sets a timer; the cleanup cancels the
//     previous one. Only a value that survives the delay gets through.
//
// Q2. What happens without the cleanup?
// A2. Every timer fires. It becomes a fixed delay, not a debounce — the same
//     number of calls, just later.
//
// Q3. Debounce or throttle?
// A3. Debounce = "when they stop" (search, autosave). Throttle = "at most
//     every N" (scroll, resize, progress).
//
// Q4. Why does my debounced callback not debounce?
// A4. A new debounced function every render, each with its own timer. Stabilize
//     it with useMemo/useRef — then handle the stale closure with a ref.
//
// Q5. Debounce or useDeferredValue?
// A5. Debounce reduces the NUMBER of operations (network). useDeferredValue
//     reduces render priority. Compose them.
//
// Q6. What is maxWait for?
// A6. Starvation. Continuous typing with sub-delay gaps means a pure debounce
//     never fires. maxWait guarantees progress.
//
// Q7. Does debounce fix the fetch race condition?
// A7. No. It reduces requests; it does not cancel the ones in flight. You
//     still need AbortController.
//
// Q8. Leading or trailing edge?
// A8. Trailing by default. Leading fires immediately then debounces — good for
//     a submit button (instant feedback + double-click protection).
//
// Q9. What should you debounce — the input or the search?
// A9. The search. The input must stay instant, or you have made typing lag.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: How does useDebounce work?
//   Back : An effect sets a timer; the cleanup cancels the previous one.
//
// Flashcard 2:
//   Front: What IS the debounce?
//   Back : The cleanup. Remove it and you have a delay, not a debounce.
//
// Flashcard 3:
//   Front: Debounce vs throttle?
//   Back : "When they stop" vs "at most every N".
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : A new debounced function every render — each has its own timer.
//
// Flashcard 5:
//   Front: Value or callback?
//   Back : Value. No closure to go stale.
//
// Flashcard 6:
//   Front: Debounce vs useDeferredValue?
//   Back : Fewer OPERATIONS vs lower render PRIORITY. They compose.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Mention maxWait starvation, and that debounce does not fix the race.


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write useDebounce from memory. Eight lines. The cleanup is the whole thing.
//
// Task 2:
//   Add maxWait: track the first pending change and force a fire after N ms.
//   Then reproduce the starvation case that needs it.
//
// Task 3:
//   Build useDebouncedCallback correctly: stable identity via useRef, plus a
//   ref holding the latest callback so it never goes stale. Now you know why
//   the library exists.
//
// Task 4:
//   Add leading-edge support. When would a submit button want it?
//
// Task 5:
//   Break §4: remove the clearTimeout and predict the output BEFORE running.
//   If you predicted 5 searches, you understand the hook.
//
// Task 6:
//   Explain in 60 seconds why a debounced callback created in the component
//   body debounces nothing, to someone whose PR you are reviewing.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The cleanup IS the debounce. Every keystroke cancels the previous timer.
//
// If you remember the common bug:
//   A new debounced function per render — each has a private timer, so
//   nothing cancels and nothing debounces.
//
// If you remember the professional framing:
//   Debounce the value, not the callback. Debounce reduces requests;
//   useDeferredValue reduces render priority. Compose them, and remember
//   maxWait.
//
// NEXT TOPIC -> 04_uselocalstorage-hook.js
