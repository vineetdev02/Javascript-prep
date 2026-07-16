// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  03_useeffect-cleanup.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useEffect cleanup
//
// WHAT YOU WILL MASTER HERE:
//   1. When cleanup runs — it is NOT just unmount
//   2. The listener leak, measured: 1 effect, 50 listeners
//   3. Cleanup closes over the OLD render's values (and must)
//   4. Race conditions: the cancelled flag and AbortController
//   5. The exact ORDER of cleanup vs setup across a re-run
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/03_useeffect-cleanup.js"
//
// Prerequisites: 02_useeffect-dependency-array.js, and
// 01_react-fundamentals/12_react-strictmode.js — StrictMode exists to test
// exactly what this file teaches.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Cleanup:
// The function you return from an effect. React calls it before the effect
// runs AGAIN, and once more on unmount — so the effect can undo itself.
//
// If interviewer says "explain it simply", say:
// "If the effect subscribes, the cleanup unsubscribes. React runs it before
//  every re-run and on unmount, so there is never more than one subscription
//  alive at a time."
//
// If interviewer asks "why does it matter?", say:
// "Because without it, every re-render stacks another listener, timer, or
//  socket on top of the last. That is a memory leak that also fires your
//  handler N times per event. And the cleanup is the ONLY place to cancel an
//  in-flight request, which is how you kill fetch race conditions."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   every setup must be undoable
//
// When cleanup runs — the part people get wrong:
//
//   ✓ before the effect runs again (deps changed)   ← MOST people miss this
//   ✓ on unmount
//   ✗ NOT after every render (only when the effect actually re-runs)
//
// The exact ORDER for a re-run — memorize this:
//
//   render #2 happens
//        ↓
//   cleanup from render #1   ← the OLD closure runs first
//        ↓
//   effect from render #2
//
// React does NOT interleave them per-effect across a tree: on a commit it
// runs ALL cleanups first, then ALL setups. That prevents one component's
// setup from seeing another's stale subscription.
//
// Runtime rule:
//   The cleanup closes over the render that CREATED it. It sees old props
//   and old state — and that is correct. It must undo what THAT render did,
//   not what the current one wants.
//
// Practical rule:
//   Ask "what did this effect create?" Timer → clear it. Listener → remove
//   it. Socket → close it. Request → abort it. Nothing → return nothing.
//
// Common trap:
//   Thinking cleanup is "componentWillUnmount". It runs on EVERY re-run too.
//   That single misconception causes most cleanup bugs.


// ══════════════════════════════════════════════════════════════════
// § 3 — MINI REACT WITH REAL CLEANUP SEMANTICS
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  const order = [];

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

  function useEffect(fn, deps) {
    const slot = cursor++;
    const prev = hooks[slot];

    const changed = !prev || !deps ||
      (deps.length > 0 && deps.some((d, i) => !Object.is(d, prev.deps[i])));

    if (changed) {
      // ── THE ORDER: cleanup the OLD, then set up the NEW ──────
      if (prev && typeof prev.cleanup === "function") {
        order.push("cleanup");
        prev.cleanup();              // ← the OLD render's closure
      }
      hooks[slot] = { deps, cleanup: undefined };
      order.push("setup");
      hooks[slot].cleanup = fn();
    }
  }

  function render() {
    cursor = 0;
    return component();
  }

  function mount(fn) {
    component = fn;
    return render();
  }

  function unmount() {
    for (const hook of hooks) {
      if (hook && typeof hook.cleanup === "function") {
        order.push("cleanup (unmount)");
        hook.cleanup();
      }
    }
  }

  return { useState, useEffect, mount, unmount, getOrder: () => order.slice() };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE LEAK, MEASURED
// ══════════════════════════════════════════════════════════════════
//
// A fake DOM that counts listeners, so the leak is a number, not a lecture.

function createFakeWindow() {
  const listeners = [];
  return {
    addEventListener: (type, fn) => listeners.push({ type, fn }),
    removeEventListener: (type, fn) => {
      const i = listeners.findIndex(l => l.type === type && l.fn === fn);
      if (i !== -1) listeners.splice(i, 1);
    },
    count: () => listeners.length,
    fire: (type) => {
      let fired = 0;
      for (const l of listeners) if (l.type === type) { l.fn(); fired++; }
      return fired;
    },
  };
}

console.log("§4 — the listener leak, counted:\n");

// ── WITHOUT CLEANUP ─────────────────────────────────────────────
const win1 = createFakeWindow();
const R1 = createMiniReact();
let setWidth1;

R1.mount(() => {
  const [width, set] = R1.useState(0);
  setWidth1 = set;
  R1.useEffect(() => {
    win1.addEventListener("resize", () => {});
    // no return. no cleanup. 🐛
  }, [width]);                       // re-runs whenever width changes
  return width;
});

for (let i = 1; i <= 50; i++) setWidth1(i);   // 50 resize events
console.log("  WITHOUT cleanup — after 50 resizes:");
console.log("    listeners alive:", win1.count());
console.log("    handlers fired per resize event:", win1.fire("resize"));

// ── WITH CLEANUP ────────────────────────────────────────────────
const win2 = createFakeWindow();
const R2 = createMiniReact();
let setWidth2;

R2.mount(() => {
  const [width, set] = R2.useState(0);
  setWidth2 = set;
  R2.useEffect(() => {
    const onResize = () => {};
    win2.addEventListener("resize", onResize);
    return () => win2.removeEventListener("resize", onResize);   // ← the fix
  }, [width]);
  return width;
});

for (let i = 1; i <= 50; i++) setWidth2(i);
console.log("\n  WITH cleanup — after the same 50 resizes:");
console.log("    listeners alive:", win2.count());
console.log("    handlers fired per resize event:", win2.fire("resize"));

R2.unmount();
console.log("    after unmount:", win2.count(), "← nothing left behind ✅");

console.log("\n  Fifty-one listeners for one effect. Every one holds its");
console.log("  closure — and everything that closure captured — alive. The");
console.log("  page gets slower with every resize, and the handler runs 51");
console.log("  times per event. This is what 'memory leak' means in React.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE ORDER: CLEANUP BEFORE SETUP
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the exact order across a dep change:\n");

const R3 = createMiniReact();
let setRoom;

R3.mount(() => {
  const [roomId, set] = R3.useState("general");
  setRoom = set;
  R3.useEffect(() => {
    return () => {};
  }, [roomId]);
  return roomId;
});

setRoom("random");
setRoom("help");

console.log("  mount → roomId 'general' → 'random' → 'help':");
console.log("   ", R3.getOrder().join(" → "));
R3.unmount();
console.log("  then unmount:");
console.log("   ", R3.getOrder().slice(-1)[0]);

console.log("\n  Note: setup, then (cleanup → setup), then (cleanup → setup).");
console.log("  Cleanup ALWAYS runs before the next setup. You are never");
console.log("  connected to two chat rooms at once — not even for a moment.");
console.log("\n  This is why 'cleanup = componentWillUnmount' is wrong. It ran");
console.log("  twice here before any unmount happened.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — CLEANUP SEES THE OLD VALUES (and must)
// ══════════════════════════════════════════════════════════════════

console.log("§6 — cleanup closes over the render that created it:\n");

const connections = [];
const R4 = createMiniReact();
let setRoom4;

R4.mount(() => {
  const [roomId, set] = R4.useState("general");
  setRoom4 = set;
  R4.useEffect(() => {
    connections.push(`connect(${roomId})`);
    return () => {
      // `roomId` here is from THIS render — the old one by the time it runs.
      connections.push(`disconnect(${roomId})`);
    };
  }, [roomId]);
  return roomId;
});

setRoom4("random");
setRoom4("help");
R4.unmount();

for (const line of connections) console.log("   ", line);
console.log("\n  disconnect('general') — not disconnect('random').");
console.log("  The cleanup captured the roomId of the render that OPENED that");
console.log("  connection. If it read the CURRENT roomId, it would try to");
console.log("  close a connection it never opened, and leak the real one.");
console.log("\n  So the 'stale closure' everyone fears is exactly what makes");
console.log("  cleanup correct. Same mechanism, opposite verdict.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE RACE CONDITION (the real reason cleanup matters)
// ══════════════════════════════════════════════════════════════════

console.log("§7 — cancelling an in-flight request:\n");

function fetchUser(id, ms) {
  return new Promise(resolve => setTimeout(() => resolve(`user-${id}`), ms));
}

async function raceDemo() {
  // ── NO CLEANUP ────────────────────────────────────────────────
  let screen = "-";
  function effectNoCleanup(id, ms) {
    fetchUser(id, ms).then(data => { screen = data; });
    // no cleanup → no way to say "ignore me, I'm obsolete"
  }
  effectNoCleanup(1, 40);      // user opens /users/1  (SLOW)
  effectNoCleanup(2, 10);      // user clicks /users/2 (fast)
  await new Promise(r => setTimeout(r, 70));
  const withoutCleanup = screen;

  // ── CANCELLED FLAG ────────────────────────────────────────────
  let screen2 = "-";
  function effectWithFlag(id, ms) {
    let cancelled = false;
    fetchUser(id, ms).then(data => {
      if (!cancelled) screen2 = data;     // obsolete → drop the result
    });
    return () => { cancelled = true; };
  }
  const cleanup1 = effectWithFlag(1, 40);
  cleanup1();                             // React runs this on the dep change
  effectWithFlag(2, 10);
  await new Promise(r => setTimeout(r, 70));
  const withFlag = screen2;

  console.log("  /users/1 requested (slow), user immediately clicks /users/2:");
  console.log("    no cleanup     → screen:", withoutCleanup,
    withoutCleanup === "user-2" ? "✅" : "🐛 user 1's data on user 2's page");
  console.log("    cancelled flag → screen:", withFlag,
    withFlag === "user-2" ? "✅ correct" : "🐛");

  console.log("\n  The flag does not stop the network request — it stops the");
  console.log("  obsolete RESULT from being applied. AbortController does both:");
  console.log("\n    useEffect(() => {");
  console.log("      const c = new AbortController();");
  console.log("      fetch(url, { signal: c.signal })");
  console.log("        .then(r => r.json()).then(setData)");
  console.log("        .catch(e => { if (e.name !== 'AbortError') setError(e); });");
  console.log("      return () => c.abort();");
  console.log("    }, [url]);");
  console.log("\n  Note the catch: an aborted fetch REJECTS with AbortError.");
  console.log("  Forgetting to filter it means every navigation shows an error.\n");

  runAssertions(withoutCleanup, withFlag);
}


// ══════════════════════════════════════════════════════════════════
// § 8 — THE CLEANUP CHECKLIST
// ══════════════════════════════════════════════════════════════════
//
//   Effect did                     Cleanup must
//   ──────────                     ────────────
//   addEventListener               removeEventListener (the SAME fn ref!)
//   setInterval / setTimeout       clearInterval / clearTimeout
//   new WebSocket                  socket.close()
//   subscribe(...)                 unsubscribe() — or call the returned fn
//   fetch(...)                     controller.abort() / a cancelled flag
//   new IntersectionObserver       observer.disconnect()
//   new ResizeObserver             observer.disconnect()
//   requestAnimationFrame          cancelAnimationFrame
//   third-party widget .init()     widget.destroy()
//   document.body.style.x = "y"    restore the previous value
//   (nothing external)             return nothing — do not invent a cleanup
//
// The "SAME fn ref" note is a real bug source:
//
//   ❌ window.addEventListener("resize", () => setW(innerWidth));
//      return () => window.removeEventListener("resize", () => setW(innerWidth));
//      Two DIFFERENT arrow functions. removeEventListener matches by
//      reference, so it removes NOTHING. You leak, silently, forever.
//
//   ✅ const onResize = () => setW(innerWidth);
//      window.addEventListener("resize", onResize);
//      return () => window.removeEventListener("resize", onResize);


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version                Real React
//   ───────────                ──────────
//   cleanup then setup, per    on a commit: ALL cleanups across the tree
//   effect, inline             first, THEN all setups. So no component's
//                              setup sees another's stale subscription
//   synchronous                passive effects run after paint; layout
//                              effects (and their cleanups) run before it
//   n/a                        StrictMode dev: mount → cleanup → mount, to
//                              prove the cleanup works → file 12
//   n/a                        an error thrown in a cleanup does not stop
//                              the other cleanups from running
//   n/a                        on unmount React runs cleanups child-first,
//                              bottom-up
//
// A precise fact:
//   React does not warn if you forget a cleanup. It cannot know your effect
//   subscribed. The leak is silent until the tab is slow. This is exactly the
//   gap StrictMode's double-mount was built to expose.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The handler fires N times per event:
//   No cleanup on addEventListener. → §4.
//
// Bug 2 — removeEventListener removes nothing:
//   A different arrow function reference. → §8. The silent version of bug 1.
//
// Bug 3 — Stale data after a fast navigation:
//   No request cancellation. → §7.
//
// Bug 4 — "Can't perform a React state update on an unmounted component":
//   An async callback resolving after unmount. The cleanup should have
//   cancelled it. (React 18 removed this specific warning as it caused more
//   bad ref-guard fixes than it prevented leaks — but the leak is still real.)
//
// Bug 5 — Multiple intervals, counter speeds up:
//   setInterval with no clearInterval, re-running on every dep change.
//
// Bug 6 — Two WebSocket connections per room switch:
//   No socket.close() in the cleanup.
//
// Bug 7 — A cleanup that reads current state instead of its own:
//   Refactoring `roomId` to a ref to "get the latest value" breaks §6 — the
//   cleanup now closes the WRONG connection.
//
// Bug 8 — Effects running twice in dev, "fixed" with a ref guard:
//   → 12_react-strictmode.js §7. The guard hides the missing cleanup.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function runAssertions(withoutCleanup, withFlag) {
  function assert(condition, message) {
    if (!condition) {
      throw new Error("Assertion failed: " + message);
    }
  }

  // The leak:
  assert(win1.count() === 51, "no cleanup: 51 listeners from ONE effect (1 mount + 50 updates)");
  assert(win2.count() === 0, "with cleanup + unmount: zero listeners left");
  assert(win1.fire("resize") === 51, "the leaked listeners all fire on every event");

  // The order:
  const order = R3.getOrder();
  assert(order[0] === "setup", "mount runs setup first");
  assert(order[1] === "cleanup" && order[2] === "setup",
    "on a dep change: cleanup runs BEFORE the next setup");
  assert(order.filter(o => o === "cleanup").length === 2,
    "cleanup ran twice before any unmount — it is NOT componentWillUnmount");

  // Cleanup sees the OLD value:
  assert(connections[0] === "connect(general)", "first connect");
  assert(connections[1] === "disconnect(general)",
    "cleanup disconnected GENERAL — the room ITS render opened, not the new one");
  assert(connections[2] === "connect(random)", "then connected to the new room");
  assert(connections[connections.length - 1] === "disconnect(help)",
    "unmount disconnected the last room");
  assert(connections.filter(c => c.startsWith("connect")).length ===
    connections.filter(c => c.startsWith("disconnect")).length,
    "every connect was matched by exactly one disconnect — no leak");

  // The race:
  assert(withoutCleanup === "user-1",
    "no cleanup: the SLOW first request overwrote the fast second one 🐛");
  assert(withFlag === "user-2",
    "the cancelled flag dropped the obsolete result ✅");

  console.log("§11 — mini assertions passed for: useEffect cleanup");
  console.log("\n  The best assertion above: connects === disconnects.");
  console.log("  That balance IS the definition of a correct effect.");
}

raceDemo();


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is the useEffect cleanup for?", answer like this:
//
//   "It is how the effect undoes itself. The part people get wrong is WHEN it
//    runs: not just on unmount, but before every single re-run of the effect.
//    So if the effect depends on roomId and roomId changes, React runs the old
//    cleanup first, then the new setup — you are never subscribed twice, not
//    even momentarily.
//
//    Without it you stack subscriptions. An effect with [width] and an
//    addEventListener leaves one listener per resize — after fifty resizes
//    you have fifty-one listeners, all firing on every event, each holding its
//    closure alive. React can't warn about it because it has no idea your
//    effect subscribed to anything.
//
//    The subtlety I like is that the cleanup closes over the render that
//    CREATED it, so it sees the old roomId. That's not a bug — it's required.
//    It has to disconnect the room IT opened. If you 'fixed' that with a ref
//    to get the latest value, you'd close the wrong connection and leak the
//    real one. The stale closure is what makes cleanup correct.
//
//    And the reason it matters most is race conditions. The cleanup is the
//    only place to cancel an in-flight request. Open /users/1, click
//    /users/2, and if the first response is slower you render user 1's data
//    on user 2's page. A cancelled flag or an AbortController in the cleanup
//    is the fix — and it's the same fix StrictMode's double-mount is asking
//    you for."
//
// The §6 point — cleanup SHOULD see old values — is the senior differentiator.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. When does cleanup run?
// A1. Before every re-run of the effect, and on unmount. Not after every
//     render — only when the effect actually re-runs.
//
// Q2. Is cleanup the same as componentWillUnmount?
// A2. No. That is only its unmount role. It also runs between re-runs, which
//     is the part that prevents duplicate subscriptions.
//
// Q3. Which values does the cleanup see?
// A3. Its own render's. It must undo what THAT render did — closing the room
//     it opened, not the one you are switching to.
//
// Q4. Why doesn't my removeEventListener work?
// A4. You passed a different function reference. Removal matches by identity.
//
// Q5. How do you cancel a fetch?
// A5. AbortController in the cleanup, and filter AbortError in the catch.
//     A cancelled flag works too, but does not stop the network request.
//
// Q6. What order does React use across a tree?
// A6. All cleanups first, then all setups — so no setup observes another
//     component's stale subscription.
//
// Q7. Does React warn about a missing cleanup?
// A7. No. It cannot know you subscribed. StrictMode's double-mount is the
//     closest thing to a warning.
//
// Q8. Does an error in one cleanup stop the others?
// A8. No. React runs the rest.
//
// Q9. When should an effect return nothing?
// A9. When it created nothing external. Do not invent a cleanup for a
//     document.title assignment — there is nothing to undo.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is the cleanup?
//   Back : The effect's undo function.
//
// Flashcard 2:
//   Front: When does it run?
//   Back : Before every re-run, and on unmount. NOT componentWillUnmount.
//
// Flashcard 3:
//   Front: What is the order on a dep change?
//   Back : old cleanup → new setup. Never overlapping.
//
// Flashcard 4:
//   Front: Which values does cleanup see?
//   Back : Its OWN render's. That is what makes it correct.
//
// Flashcard 5:
//   Front: What is the most common trap?
//   Back : removeEventListener with a different arrow function → removes nothing.
//
// Flashcard 6:
//   Front: How do you sound senior?
//   Back : connects === disconnects. And cleanup is where races die.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Break §4's fix: inline the arrow in both add and remove. Watch the
//   listener count climb even though you "have a cleanup".
//
// Task 2:
//   Add setInterval to the mini React with no clearInterval. Count how many
//   intervals are alive after five dep changes. That is the "counter speeds
//   up" bug.
//
// Task 3:
//   Break §6: change the cleanup to read a ref holding the LATEST roomId.
//   Watch connects and disconnects stop matching. Then explain why.
//
// Task 4:
//   Replace §7's flag with a real AbortController. Handle AbortError in the
//   catch. Confirm a navigation does not flash an error.
//
// Task 5:
//   Add StrictMode to the mini React: mount → cleanup → mount. Confirm a
//   correct effect still ends with exactly one subscription.
//
// Task 6:
//   Explain in 60 seconds why the cleanup seeing an OLD roomId is a feature.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Cleanup runs before every re-run, not only on unmount.
//
// If you remember the common bug:
//   No cleanup on a subscription = one leak per re-run, firing N times per
//   event. And a mismatched function reference makes removeEventListener a
//   silent no-op.
//
// If you remember the professional framing:
//   Every setup must be undoable, the cleanup must use ITS OWN render's
//   values, and it is the only place to cancel a request.
//
// NEXT TOPIC -> 04_usecontext-use-case.js
