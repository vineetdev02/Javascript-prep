// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  09_uselayouteffect-vs-useeffect.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useLayoutEffect vs useEffect
//
// WHAT YOU WILL MASTER HERE:
//   1. ONE difference: before paint vs after paint. Everything follows.
//   2. The flicker, reproduced on a frame-by-frame timeline
//   3. Why useLayoutEffect BLOCKS the browser — and what that costs
//   4. The SSR warning, and why it exists
//   5. The decision rule: measure/mutate before paint, everything else after
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/09_uselayouteffect-vs-useeffect.js"
//
// Prerequisite: 01_react-fundamentals/04_react-fiber-architecture.js §8 —
// the render/commit split. This file lives inside the commit phase.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useLayoutEffect:
// Identical to useEffect in every way except one — it runs SYNCHRONOUSLY
// after the DOM is mutated but BEFORE the browser paints.
//
// If interviewer says "explain it simply", say:
// "Same API, same deps, same cleanup. The only difference is timing.
//  useLayoutEffect runs before the user sees anything; useEffect runs after
//  the screen has already been painted."
//
// If interviewer asks "why does it matter?", say:
// "Because if you measure a DOM node and then move it, useEffect gives you a
//  visible flicker — the user sees the wrong position for one frame. And
//  because useLayoutEffect blocks paint, so slow work in it freezes the
//  screen. It is a scalpel: correct for measure-then-mutate, wrong for
//  everything else."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   before the user sees it vs after
//
// The commit phase, in order:
//
//   1. MUTATION      React applies DOM changes
//   2. LAYOUT        ── useLayoutEffect runs (SYNCHRONOUS, blocking)
//                    ── refs are attached here too
//   3. PAINT         the browser draws pixels    ← THE LINE
//   4. PASSIVE       ── useEffect runs (async, non-blocking)
//
// Everything about these hooks falls out of where that line sits.
//
//   useLayoutEffect: you can measure and fix layout, and the user never
//   sees the intermediate state. But you are holding the paint hostage.
//
//   useEffect: the screen is already up. Fast, non-blocking — but if you
//   change layout here, the user saw the old layout for a frame.
//
// Runtime rule:
//   A setState inside useLayoutEffect triggers a synchronous re-render and
//   re-commit BEFORE the paint. React does the whole render → commit loop
//   again. The user never sees the first version.
//
// Practical rule:
//   Default to useEffect. Reach for useLayoutEffect only when you MEASURE
//   the DOM and MUTATE based on that measurement in the same tick.
//
// Common trap:
//   Using useLayoutEffect "to be safe" or "to run earlier". It blocks paint,
//   warns in SSR, and gains you nothing for a fetch or a subscription.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD BOTH, WITH A REAL TIMELINE
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  const timeline = [];
  let frame = 0;

  const layoutQueue = [];
  const passiveQueue = [];

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { value: initial };
    const setState = (next) => {
      const value = typeof next === "function" ? next(hooks[slot].value) : next;
      if (Object.is(value, hooks[slot].value)) return;
      hooks[slot].value = value;
      commit();                    // re-render + re-commit
    };
    return [hooks[slot].value, setState];
  }

  function makeEffectHook(queue, label) {
    return function useEffectLike(fn, deps) {
      const slot = cursor++;
      const prev = hooks[slot];
      const changed = !prev || !deps ||
        (deps.length > 0 && deps.some((d, i) => !Object.is(d, prev.deps[i])));
      if (changed) {
        hooks[slot] = { deps, cleanup: undefined, label };
        queue.push({ fn, slot });
      }
    };
  }

  const useLayoutEffect = makeEffectHook(layoutQueue, "layout");
  const useEffect = makeEffectHook(passiveQueue, "passive");

  // Nesting depth. A setState inside a LAYOUT effect re-enters commit()
  // before we ever reach the paint line, so the browser paints ONCE, at the
  // end, showing only the settled result. Modelling this depth is the whole
  // reason the timelines below differ.
  let depth = 0;

  function commit() {
    depth++;
    frame++;
    cursor = 0;
    timeline.push(`── render #${frame}`);
    component();

    timeline.push("   mutation: DOM updated");

    // LAYOUT effects: synchronous, before paint.
    while (layoutQueue.length) {
      const { fn, slot } = layoutQueue.shift();
      timeline.push("   useLayoutEffect ⚡ (blocking, pre-paint)");
      hooks[slot].cleanup = fn();
      // ← a setState in here re-enters commit() RIGHT HERE, and that nested
      //   commit will not paint, because depth is still > 0.
    }

    depth--;
    if (depth > 0) return;          // a nested commit — the paint is not ours

    timeline.push("   🎨 PAINT — the user sees this frame");

    // PASSIVE effects: after paint. A setState here starts a WHOLE new
    // commit — which paints again. That second paint IS the flicker.
    while (passiveQueue.length) {
      const { fn, slot } = passiveQueue.shift();
      timeline.push("   useEffect (after paint)");
      hooks[slot].cleanup = fn();
    }
  }

  function mount(fn) {
    component = fn;
    commit();
  }

  return { useState, useEffect, useLayoutEffect, mount, getTimeline: () => timeline.slice() };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE FLICKER
// ══════════════════════════════════════════════════════════════════
//
// A tooltip that must not overflow the screen. You render it, measure it,
// and if it would overflow you flip it to the other side.
//
// The classic measure-then-mutate case.

console.log("§4 — a tooltip that flips: with useEffect vs useLayoutEffect\n");

function runTooltip(useWhichEffect) {
  const R = createMiniReact();
  const painted = [];               // what the USER actually saw, per frame

  R.mount(() => {
    const [side, setSide] = R.useState("right");

    // The "measurement": at side=right the tooltip would overflow.
    const wouldOverflow = side === "right";

    useWhichEffect(R)(() => {
      if (wouldOverflow) setSide("left");     // measure → mutate
    }, [side]);

    painted.push(side);
    return side;
  });

  return { timeline: R.getTimeline(), painted };
}

const withEffect = runTooltip((R) => R.useEffect);
const withLayout = runTooltip((R) => R.useLayoutEffect);

console.log("  ── with useEffect ──");
for (const line of withEffect.timeline) console.log("  " + line);

console.log("\n  ── with useLayoutEffect ──");
for (const line of withLayout.timeline) console.log("  " + line);

function framesPainted(timeline) {
  return timeline.filter(l => l.includes("PAINT")).length;
}

console.log("\n  frames the user actually saw:");
console.log("    useEffect      :", framesPainted(withEffect.timeline),
  "🐛 the FIRST one showed the tooltip in the WRONG place");
console.log("    useLayoutEffect:", framesPainted(withLayout.timeline),
  "✅ the flip happened before any paint");

console.log("\n  Read the useEffect timeline: PAINT happens, THEN the effect");
console.log("  runs and calls setSide. So there is a full frame — ~16ms — where");
console.log("  the user sees the tooltip overflowing the screen, and then it");
console.log("  jumps. That jump is the flicker.");
console.log("\n  With useLayoutEffect, the effect runs BEFORE paint, setSide");
console.log("  re-renders and re-commits synchronously, and only the corrected");
console.log("  version is ever painted. The user sees one frame, and it is right.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE COST: YOU ARE BLOCKING THE BROWSER
// ══════════════════════════════════════════════════════════════════
//
// useLayoutEffect is not "the safe default". It has a real price.

console.log("§5 — the cost of blocking paint:\n");

function simulateFrameBudget(effectWorkMs, isLayout) {
  const FRAME_BUDGET = 16;      // 60fps
  const renderMs = 3;
  const paintMs = 2;

  if (isLayout) {
    // paint waits for the effect
    const total = renderMs + effectWorkMs + paintMs;
    return { timeToPaint: total, dropped: total > FRAME_BUDGET };
  }
  // paint happens first; the effect runs after
  const total = renderMs + paintMs;
  return { timeToPaint: total, dropped: total > FRAME_BUDGET };
}

console.log("  an effect doing N ms of work — when does the user see pixels?\n");
console.log("  effect work | useEffect  | useLayoutEffect | frame dropped?");
console.log("  ------------|------------|-----------------|---------------");
for (const work of [1, 5, 20, 100]) {
  const passive = simulateFrameBudget(work, false);
  const layout = simulateFrameBudget(work, true);
  console.log(`  ${String(work + "ms").padStart(11)} | ` +
    `${String(passive.timeToPaint + "ms").padStart(10)} | ` +
    `${String(layout.timeToPaint + "ms").padStart(15)} | ` +
    `${layout.dropped ? "YES — janky ⚠️" : "no"}`);
}

console.log("\n  With useEffect the user sees pixels in 5ms no matter what the");
console.log("  effect does. With useLayoutEffect, a 100ms effect means a 105ms");
console.log("  blank frame — six dropped frames, and the page feels frozen.");
console.log("\n  This is why 'use useLayoutEffect to be safe' is bad advice. You");
console.log("  are trading a hypothetical flicker for a guaranteed block.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE SSR WARNING
// ══════════════════════════════════════════════════════════════════
//
// "useLayoutEffect does nothing on the server, because the effect cannot
//  encode useful information into the server-rendered HTML..."
//
// Why: there is no DOM on the server, and no paint. So React cannot run it.
// It runs on the client AFTER hydration — which means:
//
//   server HTML → sent to browser → PAINTED (unstyled/unmeasured)
//   → hydration → useLayoutEffect finally runs → layout jumps
//
// You get the flicker you used useLayoutEffect to avoid, PLUS a warning.
//
// The standard workaround (you will see this in every UI library):
//
//   const useIsomorphicLayoutEffect =
//     typeof window !== "undefined" ? useLayoutEffect : useEffect;
//
// That silences the warning by using useEffect on the server. It does NOT
// fix the flicker — nothing can, because measurement requires a real DOM.
//
// The honest senior take:
//   "If a component needs to measure to look right, it will always flash on
//    first paint in SSR. The real fixes are CSS-first: use transforms, CSS
//    anchor positioning, or container queries so nothing needs measuring.
//    useIsomorphicLayoutEffect only hides the warning."

console.log("§6 — the SSR problem:\n");

function simulateSSR(hookName) {
  const steps = ["server renders HTML (no DOM, no paint)"];
  if (hookName === "useLayoutEffect") {
    steps.push("⚠️  warning: useLayoutEffect does nothing on the server");
  }
  steps.push("HTML sent → browser PAINTS the unmeasured version 🎨");
  steps.push("hydration");
  steps.push(`${hookName} runs → measures → mutates`);
  steps.push("🎨 PAINT the corrected version — the user saw the jump");
  return steps;
}

for (const step of simulateSSR("useLayoutEffect")) console.log("  " + step);
console.log("\n  Note step 3: the browser painted BEFORE React ever ran. On the");
console.log("  server, useLayoutEffect's whole advantage evaporates — there is");
console.log("  no paint to get ahead of.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE DECISION RULE
// ══════════════════════════════════════════════════════════════════
//
//   ✅ useLayoutEffect — you MEASURE the DOM and MUTATE from it:
//     • tooltip/popover/dropdown positioning (measure, flip if overflowing)
//     • measuring text width to truncate or fit
//     • restoring scroll position before the user sees the top
//     • reading getBoundingClientRect and adjusting
//     • the FLIP animation technique (First-Last-Invert-Play)
//     • synchronously fixing a layout to avoid a visible jump
//
//   ✅ useEffect — everything else, which is ~95% of effects:
//     • data fetching
//     • subscriptions, event listeners
//     • timers
//     • analytics, logging
//     • document.title
//     • anything the user does not visually notice one frame later
//
//   The one-question test:
//     "If this ran one frame later, would the user SEE something wrong?"
//       YES → useLayoutEffect.   NO → useEffect.
//
//   Note that "wrong" means visually wrong. A fetch resolving 16ms later is
//   invisible. A tooltip in the wrong place for 16ms is not.


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version                Real React
//   ───────────                ──────────
//   two queues                 the same idea: layout effects fire in
//                              commitLayoutEffects, passive in
//                              flushPassiveEffects after paint
//   paint is a log line        the browser's actual paint, scheduled between
//                              the two
//   n/a                        refs are attached during the LAYOUT phase, so
//                              ref.current is available in useLayoutEffect —
//                              and that is why it is the right place to
//                              measure
//   n/a                        passive effects may be delayed further if the
//                              browser is busy — they are genuinely async
//   n/a                        React flushes pending passive effects before
//                              starting a new render, so ordering stays sane
//   n/a                        class equivalent: componentDidMount and
//                              componentDidUpdate behave like useLayoutEffect,
//                              NOT useEffect. That is why class→hooks
//                              migrations introduce flickers.
//
// The last row is a great interview detail. componentDidMount was always
// synchronous pre-paint; useEffect is not. Migrate blindly and you get a
// flicker that was not there before.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Tooltip flashes in the wrong position:
//   Measure-then-mutate in useEffect. → §4.
//
// Bug 2 — The page freezes on mount:
//   Heavy work in useLayoutEffect. → §5. It blocks paint.
//
// Bug 3 — SSR warning in the console:
//   useLayoutEffect in a server-rendered component. → §6.
//
// Bug 4 — Content jumps after hydration:
//   Same root cause. useIsomorphicLayoutEffect hides the warning, not the jump.
//
// Bug 5 — A flicker appeared after migrating a class to hooks:
//   componentDidMount ran pre-paint; useEffect does not. → §8.
//
// Bug 6 — Scroll restoration lands one frame late:
//   The user sees the top of the page, then it jumps. Use useLayoutEffect.
//
// Bug 7 — useLayoutEffect used "to be safe" everywhere:
//   Every effect now blocks paint. Death by a thousand cuts.
//
// Bug 8 — Infinite loop, but synchronous and instantly frozen:
//   setState in useLayoutEffect with a bad dep. The same loop as useEffect,
//   except the browser never paints, so you cannot even see the app.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The flicker — the headline:
assert(framesPainted(withEffect.timeline) === 2,
  "useEffect: the user saw TWO frames — the wrong one, then the fix 🐛");
assert(framesPainted(withLayout.timeline) === 1,
  "useLayoutEffect: ONE frame, already correct ✅");

// Prove the ORDER is the whole difference:
const passiveIdx = withEffect.timeline.findIndex(l => l.includes("useEffect"));
const passivePaintIdx = withEffect.timeline.findIndex(l => l.includes("PAINT"));
assert(passivePaintIdx < passiveIdx, "useEffect runs AFTER paint");

const layoutIdx = withLayout.timeline.findIndex(l => l.includes("useLayoutEffect"));
const layoutPaintIdx = withLayout.timeline.findIndex(l => l.includes("PAINT"));
assert(layoutIdx < layoutPaintIdx, "useLayoutEffect runs BEFORE paint");

// Both eventually reach the same state — only the frames differ:
assert(withEffect.painted[withEffect.painted.length - 1] === "left" &&
  withLayout.painted[withLayout.painted.length - 1] === "left",
  "both end correct — the bug is what the user SAW on the way");

// The cost:
assert(simulateFrameBudget(100, false).timeToPaint === 5,
  "useEffect: paint time is independent of the effect's work");
assert(simulateFrameBudget(100, true).timeToPaint === 105,
  "useLayoutEffect: a 100ms effect delays paint by 100ms");
assert(simulateFrameBudget(100, true).dropped === true,
  "...which drops frames. This is the price.");
assert(simulateFrameBudget(1, true).dropped === false,
  "a fast layout effect is fine — the problem is slow work, not the hook");

console.log("§10 — mini assertions passed for: useLayoutEffect vs useEffect");
console.log("\n  Two frames vs one frame. That is the entire difference, and");
console.log("  every other fact in this file follows from it.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "useLayoutEffect vs useEffect?", answer like this:
//
//   "Same API, same deps, same cleanup — one difference. useLayoutEffect runs
//    synchronously after React mutates the DOM but BEFORE the browser paints.
//    useEffect runs after paint. Everything else follows from where that line
//    sits.
//
//    The case that needs it is measure-then-mutate. A tooltip renders, you
//    measure it, it would overflow, so you flip it to the other side. With
//    useEffect, React paints the overflowing version first — the user sees it
//    for a frame, then it jumps. That's the flicker. With useLayoutEffect the
//    setState re-renders and re-commits synchronously before any paint, so
//    only the corrected version is ever shown.
//
//    But it's not a safe default, because you're holding paint hostage. A
//    hundred milliseconds of work in useLayoutEffect is a hundred milliseconds
//    of blank screen — six dropped frames. With useEffect the paint time
//    doesn't depend on the effect at all. So the rule is: default to
//    useEffect, and only reach for useLayoutEffect when a one-frame delay
//    would be visibly wrong.
//
//    Two gotchas worth knowing. It warns in SSR because there's no DOM and no
//    paint on the server — everyone writes useIsomorphicLayoutEffect to
//    silence it, but that just uses useEffect on the server, so the flash is
//    still there. Measurement fundamentally needs a real DOM; the honest fix
//    is CSS that doesn't need measuring.
//
//    And componentDidMount behaved like useLayoutEffect, not useEffect. So a
//    class-to-hooks migration can introduce a flicker that was never there —
//    which surprises people."
//
// The componentDidMount detail and the honest SSR take are the senior markers.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is the actual difference?
// A1. Timing. Layout effects run synchronously before paint; passive effects
//     run after. Same API otherwise.
//
// Q2. When do you need useLayoutEffect?
// A2. Measure the DOM and mutate from that measurement in the same tick —
//     positioning, scroll restoration, FLIP animations, text fitting.
//
// Q3. Why not use it everywhere?
// A3. It blocks paint. Slow work means a frozen screen. useEffect's paint
//     time is independent of the effect.
//
// Q4. Why does it warn in SSR?
// A4. No DOM, no paint on the server, so React cannot run it. It runs after
//     hydration — by which point the browser has already painted.
//
// Q5. Does useIsomorphicLayoutEffect fix the SSR flash?
// A5. No. It silences the warning by falling back to useEffect. Measurement
//     needs a real DOM; the fix is CSS that avoids measuring.
//
// Q6. What happens if you setState in useLayoutEffect?
// A6. React re-renders and re-commits synchronously before paint. The user
//     never sees the first version — that is the whole point, and also why a
//     bad dep there freezes the tab with no visible app.
//
// Q7. Which is componentDidMount equivalent to?
// A7. useLayoutEffect. It was synchronous and pre-paint. This is why blind
//     migrations introduce flickers.
//
// Q8. When are refs attached?
// A8. During the layout phase — so refs are available in useLayoutEffect,
//     which is exactly why it is the right place to measure.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is the difference?
//   Back : Before paint (sync, blocking) vs after paint (async).
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : mutation → layout effects → PAINT → passive effects.
//
// Flashcard 3:
//   Front: When do you need useLayoutEffect?
//   Back : Measure the DOM and mutate from it. Otherwise never.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : Using it "to be safe" — you traded a maybe-flicker for a real block.
//
// Flashcard 5:
//   Front: The one-question test?
//   Back : "If this ran one frame later, would the user SEE something wrong?"
//
// Flashcard 6:
//   Front: Which one is componentDidMount?
//   Back : useLayoutEffect. Migrating to useEffect can add a flicker.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Admit useIsomorphicLayoutEffect hides the warning, not the flash.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild the two queues from memory. The whole difference is which side
//   of the PAINT line you drain them on.
//
// Task 2:
//   Add cleanup ordering: confirm layout cleanups run before layout setups,
//   and that passive cleanups do not block paint.
//
// Task 3:
//   Break §4: give the layout effect a bad dep so it loops. Notice the
//   timeline never reaches PAINT — that is a frozen tab with no visible app,
//   much worse to debug than the useEffect version.
//
// Task 4:
//   Implement useIsomorphicLayoutEffect and simulate both environments.
//   Confirm the flash still exists on the server path. Then design a CSS-only
//   tooltip that needs no measurement at all.
//
// Task 5:
//   Simulate FLIP: measure First, render Last, Invert with a transform in a
//   layout effect, Play. Do it in useEffect instead and watch it break.
//
// Task 6:
//   Explain in 60 seconds why a class-to-hooks migration introduced a
//   flicker nobody touched.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Before paint vs after paint. One line, and everything follows.
//
// If you remember the common bug:
//   Measure-then-mutate in useEffect = a visible one-frame jump. And
//   useLayoutEffect "to be safe" = a blocked paint on every commit.
//
// If you remember the professional framing:
//   Default to useEffect. useLayoutEffect only when a one-frame delay would
//   look wrong. And componentDidMount was the layout one.
//
// NEXT TOPIC -> 10_useimperativehandle.js
