// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  12_react-strictmode.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: React.StrictMode
//
// WHAT YOU WILL MASTER HERE:
//   1. What StrictMode double-invokes, and what it does NOT
//   2. Why "my useEffect runs twice" is YOUR bug, not React's — proven
//   3. Impure render, caught by double-invoking — proven
//   4. The mount→unmount→mount effect check and what it is preparing for
//   5. The wrong fixes people ship (useRef guards, removing StrictMode)
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/12_react-strictmode.js"
//
// Prerequisite: 04_react-fiber-architecture.js — the render phase can be
// thrown away or replayed. StrictMode is React ENFORCING that contract.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// React.StrictMode:
// A development-only wrapper that intentionally runs your render functions,
// state updaters, and effects TWICE to surface code that is not pure or not
// cleanup-safe.
//
// If interviewer says "explain it simply", say:
// "It is a dev-only stress test. React calls your component twice and mounts
//  your effects twice. If that breaks something, the something is your code —
//  React is allowed to do both in production too."
//
// If interviewer asks "why does it matter?", say:
// "Because concurrent React can pause, discard, and replay a render, and
//  future features may unmount and remount a component while preserving
//  state. StrictMode makes you compliant with those rules BEFORE they bite
//  you in production, where the bug would be intermittent and unreproducible."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   a dev-only fuzzer for the rules React already had
//
// What StrictMode double-invokes (React 18+):
//
//   ✓ component function bodies (render)
//   ✓ useState / useMemo / useReducer INITIALIZER functions
//   ✓ state updater functions (the c => c + 1 form)
//   ✓ effects: mount → unmount → mount
//   ✓ class constructor, render, shouldComponentUpdate
//
// What it does NOT double-invoke:
//
//   ✗ event handlers          (onClick fires once — it is not render)
//   ✗ useEffect callbacks on UPDATE (only the initial mount is doubled)
//   ✗ anything at all in PRODUCTION
//
// Runtime rule:
//   StrictMode adds NO behavior. It only reveals violations of rules that
//   already existed: render must be pure, effects must clean up after
//   themselves.
//
// Practical rule:
//   If double-invoking breaks your component, your component was already
//   broken — you just had not met the render that proved it.
//
// Common trap:
//   "React 18 broke my useEffect, it runs twice now."
//   No. React 18 started TELLING you your effect was never cleanup-safe.


// ══════════════════════════════════════════════════════════════════
// § 3 — A MINI REACT WITH A STRICT SWITCH
// ══════════════════════════════════════════════════════════════════

function createReact({ strict = false } = {}) {
  const hooks = [];
  let cursor = 0;
  let component = null;
  const log = [];

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) {
      // StrictMode double-invokes the INITIALIZER too — if it has a side
      // effect, you will see it twice.
      if (typeof initial === "function") {
        const first = initial();
        hooks[slot] = strict ? initial() : first;   // called twice in strict
      } else {
        hooks[slot] = initial;
      }
    }
    const setState = (next) => {
      const compute = (prev) => (typeof next === "function"
        ? (strict ? (next(prev), next(prev)) : next(prev))   // updater doubled
        : next);
      hooks[slot] = compute(hooks[slot]);
    };
    return [hooks[slot], setState];
  }

  function useEffect(fn, deps) {
    const slot = cursor++;
    const prev = hooks[slot];
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
    if (changed) {
      hooks[slot] = { deps, pending: fn };
    }
  }

  function renderOnce() {
    cursor = 0;
    return component();
  }

  function mount(fn) {
    component = fn;

    // ── RENDER PHASE ──────────────────────────────────────────────
    log.push("render");
    renderOnce();
    if (strict) {
      log.push("render (StrictMode 2nd call)");
      renderOnce();          // ← double-invoke. Pure code does not care.
    }

    // ── COMMIT PHASE: effects ─────────────────────────────────────
    const effects = hooks.filter(h => h && h.pending);
    for (const effect of effects) {
      log.push("effect setup");
      effect.cleanup = effect.pending();
    }

    if (strict) {
      // React 18 StrictMode: immediately unmount and remount every effect.
      for (const effect of effects) {
        log.push("effect CLEANUP (StrictMode unmount)");
        if (typeof effect.cleanup === "function") effect.cleanup();
        else log.push("  ⚠️  no cleanup returned — nothing was undone");
      }
      for (const effect of effects) {
        log.push("effect setup (StrictMode remount)");
        effect.cleanup = effect.pending();
      }
    }

    return { getLog: () => log.slice(), hooks };
  }

  return { useState, useEffect, mount };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE "MY EFFECT RUNS TWICE" COMPLAINT
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the effect that runs twice:\n");

let fetchCount = 0;

function BrokenComponent(React_) {
  const [data] = React_.useState(null);
  React_.useEffect(() => {
    fetchCount++;                       // a fetch. No cleanup. No abort.
  }, []);
  return data;
}

fetchCount = 0;
const dev = createReact({ strict: true });
const devResult = dev.mount(() => BrokenComponent(dev));

for (const line of devResult.getLog()) console.log("  " + line);
console.log("\n  fetches fired:", fetchCount, "← the famous 'why twice?!'");

fetchCount = 0;
const prod = createReact({ strict: false });
prod.mount(() => BrokenComponent(prod));
console.log("  in production  :", fetchCount, "← StrictMode does NOTHING in prod\n");

console.log("  Look at the log: '⚠️  no cleanup returned — nothing was undone'.");
console.log("  THAT is the message. React unmounted your effect and your effect");
console.log("  had no way to undo itself. React is not being annoying — it is");
console.log("  showing you that this effect leaks.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — WHY IT MATTERS: THE RACE CONDITION IT IS WARNING YOU ABOUT
// ══════════════════════════════════════════════════════════════════
//
// "Fine, it fires twice in dev, who cares — production is fine."
//
// Production is NOT fine, and this is the argument that wins the interview.
// The double-mount simulates something that happens for real:
//
//   The user visits /users/1, then quickly clicks /users/2.
//   Two fetches are now in flight. If the FIRST resolves LAST, you render
//   user 1's data on user 2's page. Forever, until the next render.
//
// An effect with no cleanup CANNOT prevent this. It has no way to say
// "ignore my result, I'm obsolete." That is precisely what StrictMode's
// unmount is testing for — and the fix for one is the fix for the other.

console.log("§5 — the real bug StrictMode is pointing at:\n");

async function raceDemo() {
  const results = [];

  // ── NO CLEANUP: the slow first response wins ──────────────────
  function fetchUser(id, delay) {
    return new Promise(resolve => setTimeout(() => resolve(`user-${id} data`), delay));
  }

  let screen = "nothing";
  // Effect for user 1 — SLOW response (300ms)
  fetchUser(1, 30).then(data => { screen = data; });
  // User navigates. Effect for user 2 — FAST response (100ms)
  fetchUser(2, 10).then(data => { screen = data; });

  await new Promise(r => setTimeout(r, 60));
  results.push(["no cleanup", screen]);

  // ── WITH CLEANUP: the obsolete response is ignored ────────────
  let screen2 = "nothing";

  function effectWithCleanup(id, delay) {
    let cancelled = false;                          // ← the whole fix
    fetchUser(id, delay).then(data => {
      if (!cancelled) screen2 = data;               // obsolete? do nothing.
    });
    return () => { cancelled = true; };             // ← the cleanup React wanted
  }

  const cleanup1 = effectWithCleanup(1, 30);
  cleanup1();                                       // user navigated away
  effectWithCleanup(2, 10);

  await new Promise(r => setTimeout(r, 60));
  results.push(["with cleanup", screen2]);

  console.log("  user opens /users/1, immediately clicks /users/2");
  console.log("  (user 1's request is SLOW, user 2's is fast)\n");
  for (const [label, value] of results) {
    const verdict = value === "user-2 data" ? "✅ correct" : "🐛 WRONG — stale data on screen";
    console.log(`    ${label.padEnd(13)} → screen shows: ${value.padEnd(14)} ${verdict}`);
  }
  console.log("\n  The 'no cleanup' version renders user 1's data on user 2's");
  console.log("  page. This is a REAL production bug, not a dev annoyance.");
  console.log("  StrictMode's double-mount is how React makes you find it on");
  console.log("  your laptop instead of in a bug report.\n");

  impureDemo();
}


// ══════════════════════════════════════════════════════════════════
// § 6 — IMPURE RENDER, CAUGHT
// ══════════════════════════════════════════════════════════════════

function impureDemo() {
  console.log("§6 — double-invoking catches impure render:\n");

  // A component that mutates something outside itself DURING render.
  // Looks harmless. It is not.
  const cart = { items: [] };

  function ImpureCart(React_) {
    const [product] = React_.useState("Book");
    cart.items.push(product);            // 🐛 side effect in RENDER
    return cart.items.length;
  }

  cart.items = [];
  const strictReact = createReact({ strict: true });
  strictReact.mount(() => ImpureCart(strictReact));
  console.log("  StrictMode  → cart.items:", JSON.stringify(cart.items));

  cart.items = [];
  const looseReact = createReact({ strict: false });
  looseReact.mount(() => ImpureCart(looseReact));
  console.log("  production  → cart.items:", JSON.stringify(cart.items));

  console.log("\n  StrictMode duplicated the item. The knee-jerk reaction is");
  console.log("  'StrictMode broke my cart'. The truth is the opposite:");
  console.log("  React is ALLOWED to render twice without committing — that is");
  console.log("  how concurrent rendering works. Your cart was always a");
  console.log("  time-bomb; StrictMode just detonated it on your laptop.");
  console.log("\n  Fix: push in an event handler or an effect. Never in render.\n");

  wrongFixes();
}


// ══════════════════════════════════════════════════════════════════
// § 7 — THE WRONG FIXES (that people ship every day)
// ══════════════════════════════════════════════════════════════════

function wrongFixes() {
  console.log("§7 — the fixes to NOT use:\n");

  console.log("  ❌ WRONG #1 — delete <StrictMode> from main.jsx");
  console.log("     You did not fix the bug. You turned off the smoke alarm.");
  console.log("     The race condition still ships.\n");

  console.log("  ❌ WRONG #2 — a useRef guard:");
  console.log("       const ran = useRef(false);");
  console.log("       useEffect(() => {");
  console.log("         if (ran.current) return;      // 'only run once!'");
  console.log("         ran.current = true;");
  console.log("         fetchData();");
  console.log("       }, []);");
  console.log("     This silences dev and keeps the production bug intact.");
  console.log("     Worse: the ref survives the StrictMode remount, so if React");
  console.log("     ever genuinely remounts your component, the fetch never");
  console.log("     runs at all. You traded a loud dev warning for a silent");
  console.log("     production failure.\n");

  console.log("  ❌ WRONG #3 — a module-level `let hasFetched = false`");
  console.log("     Same idea, now shared across every instance AND every user");
  console.log("     on a server-rendered page. Genuinely dangerous.\n");

  console.log("  ✅ RIGHT — make the effect cleanup-safe:");
  console.log("       useEffect(() => {");
  console.log("         const controller = new AbortController();");
  console.log("         fetch(url, { signal: controller.signal })");
  console.log("           .then(setData)");
  console.log("           .catch(e => { if (e.name !== 'AbortError') setError(e); });");
  console.log("         return () => controller.abort();     // ← undo yourself");
  console.log("       }, [url]);\n");

  console.log("  ✅ RIGHT — or stop writing fetch effects by hand.");
  console.log("     React Query / SWR / a framework loader handle cancellation,");
  console.log("     dedup, and caching. Double-mounting is a non-event for them:");
  console.log("     the second mount is a cache hit. → 04_state-patterns/10\n");

  finalAssertions();
}


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version              Real React
//   ───────────              ──────────
//   a strict flag            <StrictMode> wraps a SUBTREE — you can enable it
//                            for part of the app during migration
//   render called twice      React also DOUBLES the console output, then
//                            deliberately dims the second set in DevTools so
//                            logs are not confusing
//   effects doubled          plus refs are detached/reattached, and in React 19
//                            ref cleanup functions are exercised too
//   n/a                      also warns about legacy string refs,
//                            findDOMNode, legacy context, and deprecated
//                            lifecycles (componentWillMount etc.)
//   n/a                      React 17 only double-invoked render.
//                            React 18 added the effect mount→unmount→mount.
//                            That is why "18 broke my effects" is so common.
//
// What it is preparing you for — say this and you sound like you follow the
// team's direction:
//   The double-mount is groundwork for state-preserving remounts. React wants
//   to be able to unmount a component (say, a hidden tab or an Offscreen
//   subtree) and remount it later WITH ITS STATE INTACT. That is only safe if
//   every effect can tear down and set back up cleanly. StrictMode is React
//   asking: "can I do this to your component yet?"


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES (and reveals)
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Two API calls on mount:
//   An effect with no cleanup. → §4. The complaint. Not the bug.
//
// Bug 2 — Stale data from a race condition:
//   The ACTUAL bug §4 is warning about. → §5.
//
// Bug 3 — Two WebSocket connections / two subscriptions:
//   Same cause. Fix: return () => socket.close().
//
// Bug 4 — Duplicate analytics events in dev:
//   Harmless in prod, but it means the effect is not idempotent.
//
// Bug 5 — Doubled items in a cart/list:
//   Mutation during render. → §6.
//
// Bug 6 — An animation/interval running twice:
//   No clearInterval in the cleanup.
//
// Bug 7 — The useRef guard "fix" hiding a real remount failure. → §7.
//
// Bug 8 — Third-party widget initialized twice:
//   The library has no destroy(), or you did not call it. Genuinely awkward —
//   this is the one legitimate case where people reach for a ref guard.
//   Prefer wrapping the widget in a component with a proper cleanup.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function finalAssertions() {
  function assert(condition, message) {
    if (!condition) {
      throw new Error("Assertion failed: " + message);
    }
  }

  // Dev vs prod:
  let count = 0;
  const s = createReact({ strict: true });
  s.mount(() => { const [x] = s.useState(1); s.useEffect(() => { count++; }, []); return x; });
  const strictCount = count;

  count = 0;
  const p = createReact({ strict: false });
  p.mount(() => { const [x] = p.useState(1); p.useEffect(() => { count++; }, []); return x; });
  const prodCount = count;

  assert(strictCount === 2, "StrictMode mounts the effect twice");
  assert(prodCount === 1, "production mounts it ONCE — StrictMode is dev-only");

  // The log proves WHY: React tried to clean up and found nothing:
  assert(devResult.getLog().some(l => l.includes("no cleanup returned")),
    "React unmounted the effect and there was nothing to undo — that is the message");
  assert(devResult.getLog().filter(l => l.startsWith("render")).length === 2,
    "render is double-invoked too");

  // A cleanup-safe effect survives the double-mount cleanly:
  let active = 0;
  const safe = createReact({ strict: true });
  safe.mount(() => {
    safe.useEffect(() => {
      active++;
      return () => { active--; };      // ← the cleanup
    }, []);
    return null;
  });
  assert(active === 1,
    "a cleanup-safe effect ends with exactly ONE active subscription, " +
    "even though it mounted twice — this is the entire point");

  console.log("§10 — mini assertions passed for: React.StrictMode");
  console.log("\n  Read that last assertion again: the effect ran twice and");
  console.log("  still ended with exactly one live subscription. THAT is what");
  console.log("  'cleanup-safe' means, and it is all StrictMode is asking for.");
}

raceDemo();


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "why does my useEffect run twice?", answer like this:
//
//   "That is StrictMode in React 18, and it is development-only — production
//    mounts once. React deliberately mounts every effect, immediately unmounts
//    it, and mounts it again, to check the effect can undo itself.
//
//    The point is that it is not really about the double call. An effect with
//    no cleanup has a real production bug hiding in it: if the user opens
//    /users/1 and quickly clicks /users/2, both fetches are in flight, and if
//    the first resolves last you render user 1's data on user 2's page. The
//    effect has no way to say 'I'm obsolete, ignore my result.' StrictMode's
//    unmount is testing for exactly that capability, so the same fix — an
//    AbortController or a cancelled flag in the cleanup — fixes both.
//
//    So the wrong fixes are removing StrictMode or adding a useRef ran-once
//    guard. The ref guard is worse than it looks: it survives the remount, so
//    if React ever genuinely remounts the component the fetch never fires at
//    all. You have swapped a loud dev warning for a silent prod failure.
//
//    It also double-invokes render, which catches impure components — mutating
//    something outside during render. React is allowed to render without
//    committing, so that was always broken.
//
//    Longer term, the double-mount is groundwork for state-preserving
//    remounts, like Offscreen. React is asking whether it can unmount and
//    remount your component safely yet."
//
// Naming the race condition is what turns this from a memorized fact into
// an engineering answer.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Does StrictMode affect production?
// A1. No. It is stripped entirely. Zero behavior, zero cost.
//
// Q2. What does it double-invoke?
// A2. Render bodies, useState/useMemo/useReducer initializers, state updater
//     functions, and effects (mount→unmount→mount). Not event handlers.
//
// Q3. Why double-mount effects?
// A3. To prove the effect is cleanup-safe, which is required for concurrent
//     features and future state-preserving remounts — and which is the same
//     property that prevents fetch race conditions.
//
// Q4. Is a useRef guard a valid fix?
// A4. No. It hides the symptom, keeps the race condition, and breaks real
//     remounts because the ref persists. Fix the cleanup instead.
//
// Q5. Should StrictMode be on in production builds?
// A5. The question does not apply — it does nothing there. Leave it in the
//     tree; it costs nothing and protects dev.
//
// Q6. What changed between React 17 and 18?
// A6. 17 double-invoked render only. 18 added the effect double-mount. That
//     is why upgrading to 18 "broke" so many effects.
//
// Q7. My third-party widget initializes twice. Now what?
// A7. Call its destroy() in the cleanup. If it genuinely has none, wrap it so
//     you control the lifecycle. This is the one case where people reasonably
//     reach for a guard — but say why it is a compromise.
//
// Q8. Does StrictMode catch impure render reliably?
// A8. It catches obvious mutation of outer scope. It cannot catch everything —
//     it is a smoke detector, not a proof.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is StrictMode?
//   Back : A dev-only double-invoke that surfaces impure render and
//          non-cleanup-safe effects.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : Dev: mount → unmount → mount. Production: mount. Once.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : "React 18 broke my effect." It revealed that the effect never
//          cleaned up.
//
// Flashcard 4:
//   Front: What real bug is it pointing at?
//   Back : The fetch race condition — a slow first response overwriting a
//          fast second one.
//
// Flashcard 5:
//   Front: Why is a useRef guard wrong?
//   Back : It survives remounts, so a genuine remount never fetches. Silent
//          prod failure instead of a loud dev warning.
//
// Flashcard 6:
//   Front: How do you sound senior?
//   Back : Explain the race condition, then say the double-mount is
//          groundwork for state-preserving remounts.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Fix BrokenComponent from §4 with a cancelled flag. Re-run and confirm
//   the "no cleanup returned" warning disappears.
//
// Task 2:
//   Implement the useRef guard from §7 in the mini React. Then simulate a
//   REAL remount and watch the fetch never fire. Prove the fix is worse.
//
// Task 3:
//   Add ref detach/reattach to the strict path — that is what React 19 does.
//
// Task 4:
//   Extend §5: make the FIRST fetch resolve fast and the second slow. Does
//   the no-cleanup version look correct now? That is why race conditions are
//   so hard to catch — they depend on network timing.
//
// Task 5:
//   Break §6 differently: mutate props instead of an outer variable. Does
//   double-invoking catch it? Why or why not?
//
// Task 6:
//   Explain in 60 seconds why removing <StrictMode> is not a fix, to a
//   teammate who is about to do exactly that.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   StrictMode adds no behavior. It reveals code that already broke React's
//   rules — dev only, always.
//
// If you remember the common bug:
//   "My effect runs twice" means "my effect cannot clean up after itself",
//   which means "my app has a fetch race condition."
//
// If you remember the professional framing:
//   Do not silence it with a ref guard or by deleting the wrapper. Make the
//   effect cleanup-safe — the same fix that kills the race condition.
//
// NEXT TOPIC -> index.js (module map), then 02_built-in-hooks/
