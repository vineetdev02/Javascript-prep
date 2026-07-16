// ╔══════════════════════════════════════════════════════════════════╗
// ║   Custom Hooks  →  08_useinterval-hook.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useInterval hook
//
// WHAT YOU WILL MASTER HERE:
//   1. The famous "counter always logs 0" bug — reproduced
//   2. Three fixes ranked, and why Dan Abramov's version wins
//   3. delay = null to pause, and why that is elegant
//   4. Why setInterval drifts, and when it is the wrong tool entirely
//   5. The ref-latest-callback pattern, now for the third time
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/03_custom-hooks/08_useinterval-hook.js"
//
// Prerequisites: 01_usestate-internals.js §5 (stale closures),
// 05_useref-dom-mutable-ref.js §8. This hook is the canonical stale-closure
// lesson — Dan Abramov wrote a famous blog post about exactly this.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useInterval:
// A declarative setInterval — you say "run this every N ms" and the hook
// handles the closure staleness, the cleanup, and pausing.
//
// If interviewer says "explain it simply", say:
// "setInterval keeps a callback alive across renders, but that callback
//  captured the state from the render that created it. The hook stores the
//  latest callback in a ref, so the interval always calls the newest one."
//
// If interviewer asks "why does it matter?", say:
// "Because the naive version is the most famous bug in React. useEffect with
//  a setInterval and empty deps logs 0 forever — the interval survives every
//  render, but its closure does not update. It is the clearest possible demo
//  of what a stale closure IS."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   the interval outlives the render that created it
//
// The bug:
//
//   useEffect(() => {
//     setInterval(() => console.log(count), 1000);   // captured render #1's count
//   }, []);                                          // never re-runs → never re-captures
//
//   The interval is created ONCE, on mount. Its callback closes over render
//   #1's `count`, which is 0 — and `count` is a const. It cannot change. So
//   the interval logs 0 every second, forever, while the screen shows 47.
//
// Runtime rule:
//   Every render creates a NEW callback closing over THAT render's values.
//   The interval only ever holds the one you gave it at creation.
//
// The three ways out:
//   1. [count] in the deps → re-create the interval on every change.
//      Works. Destroys and rebuilds a timer 60 times a minute, and RESETS the
//      timer each time, so the tick drifts.
//   2. The functional updater → setCount(c => c + 1) reads nothing, so [] is
//      honest. Perfect when you only need to UPDATE state.
//   3. A ref holding the latest callback → the general fix. Works even when
//      the callback reads several values or does something other than setState.
//
// Practical rule:
//   Fix 2 if you only increment. Fix 3 (Dan's useInterval) for anything real.
//
// Common trap:
//   Fix 1. It looks correct and it is subtly wrong — the interval restarts on
//   every change, so a 1000ms tick never actually fires at 1000ms.


// ══════════════════════════════════════════════════════════════════
// § 3 — A CONTROLLABLE CLOCK
// ══════════════════════════════════════════════════════════════════

function createClock() {
  let now = 0;
  let nextId = 1;
  const intervals = new Map();

  return {
    setInterval(fn, ms) {
      const id = nextId++;
      intervals.set(id, { fn, ms, nextRun: now + ms, created: now });
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
    advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...intervals.entries()]
          .filter(([, t]) => t.nextRun <= target)
          .sort((a, b) => a[1].nextRun - b[1].nextRun)[0];
        if (!due) break;
        const [, timer] = due;
        now = timer.nextRun;
        timer.nextRun += timer.ms;
        timer.fn();
      }
      now = target;
    },
    now: () => now,
    liveCount: () => intervals.size,
  };
}

function createMiniReact(clock) {
  const hooks = [];
  let cursor = 0;
  let component = null;
  const pendingEffects = [];
  let createdIntervals = 0;

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { value: initial };
    const setState = (next) => {
      const value = typeof next === "function" ? next(hooks[slot].value) : next;
      if (Object.is(value, hooks[slot].value)) return;
      hooks[slot].value = value;
      render();
    };
    return [hooks[slot].value, setState];
  }

  function useRef(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { current: initial };
    return hooks[slot];
  }

  function useEffect(fn, deps) {
    const slot = cursor++;
    const prev = hooks[slot];
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
    if (changed) {
      if (prev?.cleanup) prev.cleanup();
      hooks[slot] = { deps, cleanup: undefined };
      pendingEffects.push({ fn, slot });
    }
  }

  function render() {
    cursor = 0;
    const output = component();
    while (pendingEffects.length) {
      const { fn, slot } = pendingEffects.shift();
      hooks[slot].cleanup = fn();
    }
    return output;
  }

  function mount(fn) { component = fn; return render(); }
  function unmount() { for (const h of hooks) if (h?.cleanup) h.cleanup(); }

  const trackedSetInterval = (fn, ms) => { createdIntervals++; return clock.setInterval(fn, ms); };

  return {
    useState, useRef, useEffect, mount, unmount, render,
    setInterval: trackedSetInterval,
    clearInterval: clock.clearInterval,
    intervalsCreated: () => createdIntervals,
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE FAMOUS BUG
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the counter that always logs 0:\n");

const clock1 = createClock();
const R1 = createMiniReact(clock1);
const logged = [];

R1.mount(() => {
  const [count, setCount] = R1.useState(0);

  R1.useEffect(() => {
    const id = R1.setInterval(() => {
      logged.push(count);        // ← captured THIS render's count
      setCount(count + 1);       // ← 0 + 1 = 1. Every single time.
    }, 1000);
    return () => R1.clearInterval(id);
  }, []);                        // ← never re-runs, never re-captures

  return count;
});

clock1.advance(5000);            // 5 ticks

console.log("  useEffect(() => { setInterval(() => setCount(count+1), 1000) }, [])\n");
console.log("    values the interval logged:", JSON.stringify(logged));
console.log("    intervals created:", R1.intervalsCreated());
console.log("\n  🐛 It logged 0 five times and the counter is stuck at 1.");
console.log("     The interval was created ONCE, on mount. Its callback closed");
console.log("     over render #1's count, which is 0 — and `count` is a CONST.");
console.log("     It cannot change. So `count + 1` is `0 + 1` forever.");
console.log("\n     The screen would show 1 while the timer ticks every second.");
console.log("     Nothing errors. Nothing warns. → 01_usestate-internals.js §5\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — FIX 1: PUT count IN THE DEPS (and why it is not great)
// ══════════════════════════════════════════════════════════════════

console.log("§5 — fix 1: [count] in the deps:\n");

const clock2 = createClock();
const R2 = createMiniReact(clock2);
const logged2 = [];

R2.mount(() => {
  const [count, setCount] = R2.useState(0);
  R2.useEffect(() => {
    const id = R2.setInterval(() => {
      logged2.push(count);
      setCount(count + 1);
    }, 1000);
    return () => R2.clearInterval(id);
  }, [count]);                   // ← re-create on every change
  return count;
});

clock2.advance(5000);

console.log("    values logged:", JSON.stringify(logged2), "✅ correct!");
console.log("    intervals created:", R2.intervalsCreated(), "🐛");
console.log("\n  It WORKS — and it destroys and rebuilds a timer on every tick.");
console.log("  At one tick per second that is 3,600 timers an hour.");
console.log("\n  Worse, and subtler: clearInterval + setInterval RESTARTS the");
console.log("  countdown. If a render happens 900ms into a 1000ms tick, the");
console.log("  timer resets to 1000ms and that tick takes 1900ms. With frequent");
console.log("  unrelated renders, your 'every second' interval can drift");
console.log("  arbitrarily — or never fire at all.");
console.log("\n  This is the fix people ship because the lint rule suggested it.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — FIX 2: THE FUNCTIONAL UPDATER
// ══════════════════════════════════════════════════════════════════

console.log("§6 — fix 2: setCount(c => c + 1):\n");

const clock3 = createClock();
const R3 = createMiniReact(clock3);
let finalCount = 0;

R3.mount(() => {
  const [count, setCount] = R3.useState(0);
  finalCount = count;
  R3.useEffect(() => {
    const id = R3.setInterval(() => {
      setCount(c => c + 1);      // ← reads NOTHING from the render scope
    }, 1000);
    return () => R3.clearInterval(id);
  }, []);                        // ← [] is now HONEST, not a lie
  return count;
});

clock3.advance(5000);

console.log("    final count:", finalCount, "✅");
console.log("    intervals created:", R3.intervalsCreated(), "✅ one, ever");
console.log("\n  The updater form receives the CURRENT state at apply time, so");
console.log("  the callback does not read `count` at all — which means [] is");
console.log("  an honest dependency array rather than a lie.");
console.log("\n  This is the RIGHT fix when all you do is update state from the");
console.log("  previous state. It is also the cheapest: one timer, no restarts,");
console.log("  no drift from re-creation.");
console.log("\n  ⚠️  But it only works for that one shape. The moment the callback");
console.log("     needs to READ something — a prop, another state value, or do");
console.log("     anything other than setState — you are stuck again. → §7\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — FIX 3: THE REF (Dan Abramov's useInterval)
// ══════════════════════════════════════════════════════════════════
//
// The general solution. This is the hook worth memorizing:
//
//   function useInterval(callback, delay) {
//     const savedCallback = useRef(callback);
//
//     // Keep the ref pointing at the LATEST callback, every render.
//     useEffect(() => {
//       savedCallback.current = callback;
//     }, [callback]);
//
//     // Set up the interval ONCE per delay change.
//     useEffect(() => {
//       if (delay === null) return;          // ← pause. See §8.
//       const id = setInterval(() => savedCallback.current(), delay);
//       return () => clearInterval(id);
//     }, [delay]);                           // ← callback is NOT a dep
//   }
//
// Why it works:
//   The interval's callback is `() => savedCallback.current()` — a function
//   that reads a BOX at call time. The box is mutated on every render, so
//   the interval always invokes the newest closure, which sees the newest
//   state. The interval itself is never re-created.
//
// This is the same pattern as useOnClickOutside's handler ref (file 06 §7)
// and useRef §8. Three files, one idea: SUBSCRIBE ONCE, CALL THE LATEST.
// That repetition is not accidental — it is the standard answer to "I need
// the newest value in a long-lived callback."

console.log("§7 — fix 3: the ref-latest-callback (the general fix):\n");

const clock4 = createClock();
const R4 = createMiniReact(clock4);
const logged4 = [];
let multiplier = 1;

R4.mount(() => {
  const [count, setCount] = R4.useState(0);
  const [step] = R4.useState(1);

  // The callback reads BOTH count and step, and multiplies by an outer
  // variable — the functional updater cannot save us here.
  const callback = () => {
    logged4.push(count * multiplier);
    setCount(count + step);
  };

  // useInterval, inlined:
  const savedCallback = R4.useRef(callback);
  R4.useEffect(() => { savedCallback.current = callback; });   // every render
  R4.useEffect(() => {
    const id = R4.setInterval(() => savedCallback.current(), 1000);
    return () => R4.clearInterval(id);
  }, []);                                                       // ONE interval

  return count;
});

clock4.advance(5000);

console.log("    values logged:", JSON.stringify(logged4), "✅ fresh every tick");
console.log("    intervals created:", R4.intervalsCreated(), "✅ one, ever");
console.log("\n  Best of both: correct values AND a single stable timer. The");
console.log("  interval calls `savedCallback.current()`, which reads the box at");
console.log("  CALL time — and the box was mutated by the latest render.");
console.log("\n  This is the same pattern as useOnClickOutside's handler ref.");
console.log("  Subscribe once, call the latest. Three hooks, one idea — which");
console.log("  is exactly why React is building useEffectEvent to make it");
console.log("  official. → 02_built-in-hooks/05_useref-dom-mutable-ref.js §8\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — delay = null TO PAUSE
// ══════════════════════════════════════════════════════════════════
//
// The detail that makes Dan's version genuinely elegant:
//
//   useInterval(() => setCount(c => c + 1), isRunning ? 1000 : null);
//
// Passing null stops the interval. No extra API, no pause() method, no
// imperative escape hatch. The interval is a FUNCTION of `delay`, so
// changing delay reconfigures it — the same way changing a prop
// reconfigures a component.
//
// That is what "declarative" actually means here. The alternative would be:
//
//   const { start, stop } = useInterval(...);    // ← imperative
//   useEffect(() => { isRunning ? start() : stop(); }, [isRunning]);
//
// ...which is more API, more state, and now you can desync it.

console.log("§8 — pausing with delay = null:\n");

const clock5 = createClock();
const R5 = createMiniReact(clock5);
let count5 = 0;
let setRunning;

R5.mount(() => {
  const [count, setCount] = R5.useState(0);
  const [isRunning, setIsRunning] = R5.useState(true);
  count5 = count;
  setRunning = setIsRunning;

  const delay = isRunning ? 1000 : null;      // ← the whole pause mechanism

  const savedCallback = R5.useRef();
  R5.useEffect(() => { savedCallback.current = () => setCount(c => c + 1); });
  R5.useEffect(() => {
    if (delay === null) return;               // ← no interval while paused
    const id = R5.setInterval(() => savedCallback.current(), delay);
    return () => R5.clearInterval(id);
  }, [delay]);

  return count;
});

clock5.advance(3000);
console.log("    after 3s running:", count5, "| live timers:", clock5.liveCount());

setRunning(false);                            // delay becomes null
console.log("    paused → live timers:", clock5.liveCount(), "← the cleanup ran");
clock5.advance(5000);
console.log("    after 5s paused  :", count5, "← frozen ✅");

setRunning(true);                             // delay becomes 1000 again
clock5.advance(2000);
console.log("    resumed, +2s     :", count5, "✅");

console.log("\n  Pausing is just a prop change. The effect's cleanup clears the");
console.log("  timer; resuming re-creates it. No pause() method, no ref, no");
console.log("  imperative state to keep in sync. That is the payoff of");
console.log("  expressing a timer declaratively.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — setInterval DRIFTS
// ══════════════════════════════════════════════════════════════════
//
// The honest caveat almost nobody raises, and it makes useInterval the wrong
// tool for two common jobs.
//
// 1. IT DRIFTS. setInterval(fn, 1000) does not fire every 1000ms — it fires
//    "at least 1000ms after the last one, when the main thread is free". A
//    busy tab means ticks pile up or slip. Over an hour, a clock built on
//    setInterval can be seconds wrong.
//
//    ✅ For a CLOCK: never count ticks. Store the start time and compute
//       Date.now() - startTime on each tick. The ticks become a REFRESH
//       signal, not the source of truth. Then drift is invisible.
//
// 2. BACKGROUND TABS THROTTLE IT. Browsers clamp background timers to ~1/sec
//    or freeze them entirely. Come back after five minutes and your counter
//    is wildly behind — which, again, does not matter if you compute from
//    timestamps rather than counting.
//
// 3. IT IS NOT FOR ANIMATION. requestAnimationFrame syncs to the display's
//    refresh and pauses in background tabs by design. setInterval(fn, 16)
//    fights the compositor and burns battery.
//
// The rule:
//   useInterval for POLLING and for triggering re-reads. Never as a source of
//   truth for TIME, and never for animation.

console.log("§9 — counting ticks vs computing from timestamps:\n");

function simulateClock({ jitter }) {
  // A tab under load: ticks arrive late.
  const ticksIn10s = jitter ? 8 : 10;        // 2 ticks were dropped/delayed
  const realElapsed = 10;

  const byCounting = ticksIn10s;             // count += 1 per tick
  const byTimestamp = realElapsed;           // Date.now() - start
  return { byCounting, byTimestamp };
}

const smooth = simulateClock({ jitter: false });
const busy = simulateClock({ jitter: true });

console.log("  10 real seconds elapse:\n");
console.log("    idle tab  → counting ticks:", smooth.byCounting + "s",
  "| from timestamps:", smooth.byTimestamp + "s");
console.log("    busy tab  → counting ticks:", busy.byCounting + "s",
  "🐛 | from timestamps:", busy.byTimestamp + "s", "✅");
console.log("\n  The busy tab dropped two ticks. A counter is now 2 seconds");
console.log("  behind reality — permanently, and it will keep drifting.");
console.log("  Computing from a stored start time is immune: a dropped tick");
console.log("  just means the display refreshed late, not that time stopped.\n");


// ══════════════════════════════════════════════════════════════════
// § 10 — WHAT REAL LIBRARIES DO DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               usehooks-ts / react-use
//   ───────────               ───────────────────────
//   useEffect for the ref     useLayoutEffect — so the ref is updated before
//                             paint, in case a tick could fire in between
//   n/a                       an isomorphic guard so it does not run on SSR
//   n/a                       useTimeout, useCountdown, useRafLoop as siblings
//   n/a                       React Query's refetchInterval — the polling case
//                             done properly, with focus/visibility awareness
//
// The React Query point is worth making: "poll every 30 seconds" is the most
// common reason people write useInterval, and React Query does it better —
// it pauses when the tab is hidden, resumes on focus, and dedupes with other
// queries. Reaching for useInterval to poll an API in 2026 usually means you
// have not adopted a data library yet.


// ══════════════════════════════════════════════════════════════════
// § 11 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The counter is stuck at 1 and logs 0 forever:
//   The stale closure. → §4. The canonical React bug.
//
// Bug 2 — The interval restarts on every tick:
//   [count] in the deps. Works, drifts, churns timers. → §5.
//
// Bug 3 — The counter speeds up:
//   No clearInterval in the cleanup. Every re-run adds ANOTHER timer, and
//   they all fire. → 03_useeffect-cleanup.js
//
// Bug 4 — The timer keeps running after unmount:
//   Same missing cleanup. Plus a setState on an unmounted component.
//
// Bug 5 — The clock is seconds wrong after an hour:
//   Counting ticks instead of computing from timestamps. → §9.
//
// Bug 6 — The counter is minutes behind after switching tabs:
//   Background throttling. Same fix: timestamps.
//
// Bug 7 — Animation stutters:
//   setInterval(fn, 16) instead of requestAnimationFrame.
//
// Bug 8 — Polling continues on a hidden tab and drains battery:
//   Use React Query's refetchInterval, or check document.visibilityState.


// ══════════════════════════════════════════════════════════════════
// § 12 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The famous bug:
assert(logged.length === 5, "the interval fired 5 times");
assert(logged.every(v => v === 0),
  "...and logged 0 EVERY time. `count` is a const in render #1's closure 🐛");
assert(new Set(logged).size === 1, "five ticks, one value — nothing ever changed");

// Fix 1 works but churns:
assert(JSON.stringify(logged2) === JSON.stringify([0, 1, 2, 3, 4]),
  "[count] in the deps: correct values ✅");
assert(R2.intervalsCreated() === 6,
  "...but SIX intervals created for five ticks — one per render 🐛");
assert(R2.intervalsCreated() > R1.intervalsCreated(),
  "the working fix creates 6x the timers of the broken one");

// Fix 2: honest [] via the functional updater:
assert(finalCount === 5, "the functional updater counts correctly");
assert(R3.intervalsCreated() === 1, "...with exactly ONE interval, ever ✅");

// Fix 3: the ref — correctness AND one timer:
assert(JSON.stringify(logged4) === JSON.stringify([0, 1, 2, 3, 4]),
  "the ref version sees fresh values every tick ✅");
assert(R4.intervalsCreated() === 1, "...AND creates one interval ✅");
assert(logged4.length === logged2.length && R4.intervalsCreated() < R2.intervalsCreated(),
  "the ref version has fix 1's correctness with fix 2's efficiency");

// Pausing:
assert(count5 === 5, "3s running + 5s paused + 2s running = 5 ticks");
assert(clock5.liveCount() === 1, "one live timer after resuming");

// Drift:
assert(busy.byCounting !== busy.byTimestamp,
  "counting ticks drifts on a busy tab");
assert(busy.byTimestamp === smooth.byTimestamp,
  "computing from timestamps is immune to dropped ticks ✅");

console.log("§12 — mini assertions passed for: useInterval");
console.log("\n  The comparison that matters: fix 1 made 6 intervals for 5 ticks.");
console.log("  The ref version made 1, and logged the same correct values.");


// ══════════════════════════════════════════════════════════════════
// § 13 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "why does my setInterval log 0?", answer like this:
//
//   "Stale closure. The effect has empty deps, so the interval is created once
//    on mount, and its callback closed over render one's count — which is 0.
//    count is a const in that closure; it can never change. So it logs 0 every
//    second forever while the screen shows something else. Nothing errors.
//
//    There are three fixes and they're not equal. Putting count in the deps
//    works, but it destroys and recreates the timer on every tick — and worse,
//    clearInterval plus setInterval RESTARTS the countdown, so if a render
//    lands 900ms into a 1000ms tick, that tick takes 1900ms. With frequent
//    renders your 'every second' interval drifts arbitrarily. That's the fix
//    people ship because the lint rule suggested it.
//
//    The functional updater is better when it applies — setCount(c => c + 1)
//    reads nothing from the render scope, so empty deps become honest rather
//    than a lie, and you keep one stable timer. But it only works if all you
//    do is derive state from previous state.
//
//    The general fix is Dan Abramov's useInterval: keep the callback in a ref
//    updated every render, and have the interval call savedCallback.current().
//    The interval reads the box at call time, so it always invokes the newest
//    closure — one timer, fresh values. Same pattern as a click-outside
//    handler ref: subscribe once, call the latest. That's the standard answer
//    whenever a long-lived callback needs current values, and it's why React is
//    building useEffectEvent.
//
//    His version also takes delay = null to pause, which is elegant — the
//    interval is a function of delay, so pausing is just a prop change rather
//    than a start/stop API you can desync.
//
//    One caveat I'd add: never count ticks to measure time. setInterval drifts
//    and background tabs throttle it. Store a start timestamp and compute from
//    Date.now() — then a dropped tick just means a late refresh, not lost time.
//    And for polling an API, React Query's refetchInterval handles visibility
//    and dedup properly."
//
// The drift explanation for fix 1, plus timestamps-over-counting, is senior.


// ══════════════════════════════════════════════════════════════════
// § 14 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why does the interval log 0 forever?
// A1. It was created once and captured render #1's count, which is a const in
//     that closure. The interval outlives the render; the closure does not update.
//
// Q2. Why not just put count in the deps?
// A2. It works, but it recreates the timer every tick AND restarts the
//     countdown, so the interval drifts.
//
// Q3. When is the functional updater enough?
// A3. When the callback only derives state from previous state. Then [] is
//     honest and you keep one timer.
//
// Q4. How does the ref version work?
// A4. The interval calls savedCallback.current(), reading the box at call
//     time. An effect updates the box every render. One timer, latest closure.
//
// Q5. Why is delay = null elegant?
// A5. Pausing becomes a prop change instead of an imperative start/stop API
//     that can desync from state.
//
// Q6. Why does setInterval drift?
// A6. It fires "at least N ms later, when the thread is free". Background tabs
//     also throttle it. Compute from timestamps instead of counting ticks.
//
// Q7. What if you forget the cleanup?
// A7. Every effect re-run adds ANOTHER live interval. The counter speeds up,
//     and timers keep firing after unmount.
//
// Q8. useInterval for animation?
// A8. No. requestAnimationFrame syncs to the display and pauses in background
//     tabs by design.
//
// Q9. useInterval for polling an API?
// A9. React Query's refetchInterval is better — visibility-aware, deduped,
//     and it pauses on hidden tabs.


// ══════════════════════════════════════════════════════════════════
// § 15 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Why does the interval log 0?
//   Back : It captured render #1's count. The interval outlives the closure's
//          render.
//
// Flashcard 2:
//   Front: What is wrong with [count] in the deps?
//   Back : It recreates the timer per tick and RESTARTS the countdown → drift.
//
// Flashcard 3:
//   Front: When is setCount(c => c+1) enough?
//   Back : When the callback reads nothing else. Then [] is honest.
//
// Flashcard 4:
//   Front: What is the general fix?
//   Back : A ref holding the latest callback. Subscribe once, call the latest.
//
// Flashcard 5:
//   Front: How do you pause?
//   Back : delay = null. Pausing is a prop change.
//
// Flashcard 6:
//   Front: How do you build a clock?
//   Back : Never count ticks. Store the start time, compute from Date.now().
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Explain the drift in fix 1, and say ticks are a refresh signal, not
//          a clock.


// ══════════════════════════════════════════════════════════════════
// § 16 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write Dan's useInterval from memory. Two effects: one for the ref, one for
//   the timer, and the callback is NOT a dep of the second.
//
// Task 2:
//   Reproduce §5's drift: render at 900ms into a tick and prove that tick
//   takes 1900ms. That is the bug behind the working fix.
//
// Task 3:
//   Remove the cleanup from §7 and watch the intervals stack. How fast does
//   the counter go after ten renders?
//
// Task 4:
//   Build a stopwatch two ways: counting ticks, and Date.now() - start. Drop
//   30% of the ticks and compare.
//
// Task 5:
//   Add useTimeout as a sibling. What changes? (Hint: it does not repeat, so
//   the ref matters less — but the cleanup matters just as much.)
//
// Task 6:
//   Explain in 60 seconds why the interval logs 0 while the screen shows 47,
//   to someone who thinks React is broken.


// ══════════════════════════════════════════════════════════════════
// § 17 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The interval outlives the render that created it. The ref-latest-callback
//   pattern fixes it: subscribe once, call the newest.
//
// If you remember the common bug:
//   setInterval + [] logs render #1's value forever. And [count] "fixes" it
//   by rebuilding the timer on every tick, which makes it drift.
//
// If you remember the professional framing:
//   delay = null to pause. Never count ticks to measure time. And for
//   polling, React Query already solved it.
//
// NEXT TOPIC -> 09_composing-custom-hooks.js
