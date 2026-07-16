// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  02_useeffect-dependency-array.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useEffect — dependency array
//
// WHAT YOU WILL MASTER HERE:
//   1. The three forms: no array, [], [deps] — and what each really means
//   2. Object.is comparison — why an object dep loops forever, PROVEN
//   3. The infinite loop, reproduced and fixed
//   4. Why lying about deps causes stale closures
//   5. "The dependency array is not a trigger — it is a SYNC declaration"
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/02_useeffect-dependency-array.js"
//
// Prerequisite: 01_usestate-internals.js — deps live in the same hook slot
// system. If the array indexing is unclear, go back first.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Dependency array:
// The list of values your effect READS from the render scope. React compares
// each one to the previous render's value with Object.is, and re-runs the
// effect only if something changed.
//
// If interviewer says "explain it simply", say:
// "It tells React which values the effect depends on. If none of them
//  changed, the effect does not need to run again — the DOM is already in
//  sync with those values."
//
// If interviewer asks "why does it matter?", say:
// "Because the mental model people have — 'deps are a trigger list, I choose
//  when it fires' — is wrong, and every dependency bug comes from it. Deps
//  are a DECLARATION of what the effect reads. React derives the timing.
//  When you remove a dep to 'stop it firing', you are lying about what you
//  read, and the effect gets a stale value from an old render."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   a SYNC declaration, not a trigger list
//
// The three forms:
//
//   useEffect(fn)          — no array   → runs after EVERY render
//   useEffect(fn, [])      — empty      → runs once after mount
//   useEffect(fn, [a, b])  — deps       → runs when a or b changes
//
// The comparison React does — this is the whole thing:
//
//   deps.every((dep, i) => Object.is(dep, prevDeps[i]))
//     → true  = skip the effect
//     → false = cleanup the old, run the new
//
// Object.is is REFERENCE equality for objects. Not deep equality. Never
// deep equality. {} !== {} and [] !== [] and (() => {}) !== (() => {}).
//
// Runtime rule:
//   Every render creates NEW objects, arrays, and functions. So an object
//   in the deps array is a DIFFERENT object every render, so the effect runs
//   every render, and if the effect sets state → infinite loop.
//
// Practical rule:
//   The right question is never "when do I want this to fire?"
//   It is "what does this effect READ?" List exactly those. If the answer
//   causes too many runs, the fix is to change what it reads — not to lie.
//
// Common trap:
//   Removing a dep to stop a loop. The lint rule is not being fussy — it is
//   telling you the effect reads something you did not declare, which means
//   it will read a STALE value from an old closure.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD useEffect WITH DEPS
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  let renderCount = 0;
  const effectLog = [];

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { value: initial };
    const setState = (next) => {
      const value = typeof next === "function" ? next(hooks[slot].value) : next;
      if (Object.is(value, hooks[slot].value)) return;
      hooks[slot].value = value;
      render();                      // synchronous re-render for the demo
    };
    return [hooks[slot].value, setState];
  }

  function useEffect(fn, deps) {
    const slot = cursor++;
    const prev = hooks[slot];

    // ── THE ENTIRE DECISION ─────────────────────────────────────
    let shouldRun;
    if (!prev) {
      shouldRun = true;                              // first render: always
    } else if (deps === undefined) {
      shouldRun = true;                              // no array: every render
    } else if (deps.length === 0) {
      shouldRun = false;                             // []: never again
    } else {
      shouldRun = deps.some((dep, i) => !Object.is(dep, prev.deps[i]));
    }                                                // ← Object.is. That is all.

    if (shouldRun) {
      if (prev && typeof prev.cleanup === "function") {
        prev.cleanup();                              // undo the last run first
      }
      effectLog.push({ render: renderCount, ran: true, deps });
      // Record the slot BEFORE running fn(). If fn() calls setState, our
      // demo re-renders synchronously and this hook must already show its
      // deps — otherwise the nested render thinks the effect never ran and
      // fires it again, forever. (Real React sidesteps this by running
      // effects after commit, not during render.)
      hooks[slot] = { deps, cleanup: undefined };
      hooks[slot].cleanup = fn();
    } else {
      effectLog.push({ render: renderCount, ran: false, deps });
      hooks[slot] = prev;                            // keep the old cleanup
    }
  }

  function render() {
    if (renderCount > 40) throw new Error("INFINITE LOOP — React would hang here");
    cursor = 0;
    renderCount++;
    return component();
  }

  function mount(fn) {
    component = fn;
    return render();
  }

  return {
    useState, useEffect, mount,
    getRenderCount: () => renderCount,
    getEffectLog: () => effectLog.slice(),
    getEffectRuns: () => effectLog.filter(e => e.ran).length,
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE THREE FORMS
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the three forms of the dependency array:\n");

function testForm(label, depsFor) {
  const R = createMiniReact();
  let setCount;

  R.mount(() => {
    const [count, set] = R.useState(0);
    setCount = set;
    R.useEffect(() => {}, depsFor(count));
    return count;
  });

  setCount(1);
  setCount(2);
  setCount(2);          // same value → React bails out, no render at all

  return { renders: R.getRenderCount(), effectRuns: R.getEffectRuns() };
}

const noArray = testForm("no array", () => undefined);
const emptyArray = testForm("[]", () => []);
const withDeps = testForm("[count]", (count) => [count]);
const unrelatedDep = testForm("[theme]", () => ["dark"]);   // never changes

console.log("  after mount + setCount(1) + setCount(2) + setCount(2):\n");
console.log("    useEffect(fn)          →", noArray.renders, "renders,",
  noArray.effectRuns, "effect runs   ← every render");
console.log("    useEffect(fn, [])      →", emptyArray.renders, "renders,",
  emptyArray.effectRuns, "effect run    ← mount only");
console.log("    useEffect(fn, [count]) →", withDeps.renders, "renders,",
  withDeps.effectRuns, "effect runs   ← count changed every time, so this");
console.log("                                          matches 'no array' exactly");
console.log("    useEffect(fn, [theme]) →", unrelatedDep.renders, "renders,",
  unrelatedDep.effectRuns, "effect run    ← theme never changed, so React");
console.log("                                          skipped it on renders 2 and 3");

console.log("\n  Read rows 3 and 4 together — that is the whole lesson.");
console.log("  [count] did NOT reduce anything, because count changed on every");
console.log("  render. Deps do not throttle your effect; they only skip runs");
console.log("  when NOTHING the effect reads has changed. If your deps change");
console.log("  every render, a deps array buys you exactly nothing.");
console.log("\n  Also note: all four had 3 renders — setCount(2) twice bailed");
console.log("  out. Deps never affect how often you RENDER. Only the effect.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE INFINITE LOOP
// ══════════════════════════════════════════════════════════════════
//
// The bug that makes tabs freeze. Watch it happen in a controlled way.

console.log("§5 — the infinite loop, reproduced:\n");

function runLoopDemo() {
  const R = createMiniReact();
  try {
    R.mount(() => {
      const [user, setUser] = R.useState({ name: "Vineet" });

      // The dep is an OBJECT literal. New reference every render.
      R.useEffect(() => {
        setUser({ name: "Vineet" });     // sets state → re-render → new object
      }, [user]);                        // → deps changed → effect runs → ...

      return user;
    });
    return "completed (no loop)";
  } catch (e) {
    return e.message;
  }
}

console.log("  useEffect(() => setUser({...}), [user])");
console.log("  →", runLoopDemo());
console.log("\n  The cycle:");
console.log("    render → new {} object → Object.is(old, new) is FALSE");
console.log("    → effect runs → setUser → render → new {} object → ...");
console.log("\n  Note the state VALUE never changes — it is always");
console.log("  {name:'Vineet'}. But it is a NEW OBJECT every time, and");
console.log("  Object.is compares references. React never deep-compares.\n");

// Prove Object.is is the culprit, in isolation:
console.log("  Object.is({a:1}, {a:1}) →", Object.is({ a: 1 }, { a: 1 }),
  "  ← same contents, different objects");
console.log("  Object.is([1,2], [1,2]) →", Object.is([1, 2], [1, 2]));
console.log("  Object.is(f1, f2)       →",
  Object.is(() => {}, () => {}), "  ← every render makes a new function");
console.log("  Object.is('a', 'a')     →", Object.is("a", "a"),
  "   ← primitives compare by VALUE. This is why they are safe deps.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE FIXES (in order of preference)
// ══════════════════════════════════════════════════════════════════

console.log("§6 — four ways out of the loop:\n");

// FIX 1 — depend on a PRIMITIVE, not the object. Best fix, almost always.
function fix1() {
  const R = createMiniReact();
  R.mount(() => {
    const [user, setUser] = R.useState({ name: "Vineet", id: 7 });
    R.useEffect(() => {
      // reads user.id only → so depend on user.id only
    }, [user.id]);                       // ← a NUMBER. Object.is works on it.
    return user;
  });
  return R.getEffectRuns();
}

// FIX 2 — the functional updater removes the dep entirely.
function fix2() {
  const R = createMiniReact();
  let setCount;
  R.mount(() => {
    const [count, set] = R.useState(0);
    setCount = set;
    R.useEffect(() => {
      set(c => c + 1);                   // does not READ count → no dep needed
    }, []);                              // ← honest [], not a lie
    return count;
  });
  return R.getEffectRuns();
}

// FIX 3 — move the object INSIDE the effect. Then it is not a dep at all.
function fix3() {
  const R = createMiniReact();
  R.mount(() => {
    const [id] = R.useState(7);
    R.useEffect(() => {
      const options = { headers: { id } };   // created inside → not a dep
      void options;
    }, [id]);                                // ← only the primitive
    return id;
  });
  return R.getEffectRuns();
}

console.log("  1. depend on a primitive:  [user.id] instead of [user]");
console.log("     effect runs:", fix1(), "← stable ✅");
console.log("\n  2. functional updater:     set(c => c+1) with []");
console.log("     effect runs:", fix2(), "← the effect does not READ count,");
console.log("        so [] is HONEST, not a lie ✅");
console.log("\n  3. move the object inside the effect");
console.log("     effect runs:", fix3(), "← nothing to depend on ✅");
console.log("\n  4. useMemo the object — ONLY if it must be shared:");
console.log("     const options = useMemo(() => ({ id }), [id]);");
console.log("     Real, but the last resort. If you are memoizing an object");
console.log("     purely to satisfy a dep array, the effect usually wanted a");
console.log("     primitive in the first place.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE OTHER FAILURE: LYING ABOUT DEPS
// ══════════════════════════════════════════════════════════════════
//
// People "fix" the loop by deleting the dep. That trades a loud crash for a
// silent wrong answer.

console.log("§7 — the stale closure from a lie:\n");

function honest() {
  const R = createMiniReact();
  const seen = [];
  let setQuery;
  R.mount(() => {
    const [query, set] = R.useState("a");
    setQuery = set;
    R.useEffect(() => {
      seen.push(query);                  // READS query
    }, [query]);                         // ← declares it. Honest.
    return query;
  });
  setQuery("ab");
  setQuery("abc");
  return seen;
}

function lying() {
  const R = createMiniReact();
  const seen = [];
  let setQuery;
  R.mount(() => {
    const [query, set] = R.useState("a");
    setQuery = set;
    R.useEffect(() => {
      seen.push(query);                  // READS query
    }, []);                              // ← "it only needs to run once!" 🐛
    return query;
  });
  setQuery("ab");
  setQuery("abc");
  return seen;
}

console.log("  a search box. The user types 'a', then 'ab', then 'abc'.\n");
console.log("    [query] → effect saw:", JSON.stringify(honest()),
  "✅ every search ran");
console.log("    []      → effect saw:", JSON.stringify(lying()),
  '🐛 forever searching for "a"');
console.log("\n  The [] version does not crash. It does not warn at runtime.");
console.log("  It just quietly searches for the wrong thing for the rest of");
console.log("  the session, because the effect closed over render #1's query.");
console.log("\n  THIS is why the exhaustive-deps lint rule exists, and why");
console.log("  disabling it with a comment is almost always the wrong call.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE REFRAME THAT MAKES IT ALL CLICK
// ══════════════════════════════════════════════════════════════════
//
// Stop thinking:  "when do I want this to run?"
// Start thinking: "what is this effect SYNCHRONIZING with?"
//
// An effect synchronizes something OUTSIDE React (a subscription, the
// document title, a DOM node, a network request) with something INSIDE React
// (props and state). The deps are simply the inside values it reads.
//
//   useEffect(() => {
//     document.title = `${unread} unread`;   // reads `unread`
//   }, [unread]);                            // so it depends on `unread`
//
// You did not choose "run when unread changes". You said "the title IS a
// function of unread." React derived the timing.
//
// This reframe kills the whole bug class, because you never ask "how do I
// stop it firing?" — you ask "what does it read?" and the answer is
// mechanical.
//
// The corollary that senior candidates get right:
//   If an effect is fighting you, the usual answer is that it should not be
//   an effect at all.
//     • Transforming data for render? Compute during render.
//     • Responding to a user action? That is an event handler.
//     • Resetting state when a prop changes? Use key.
//   React's docs literally have a page called "You Might Not Need an Effect."


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version                Real React
//   ───────────                ──────────
//   render() synchronously     effects run AFTER paint, asynchronously; a
//                              setState in an effect schedules another render
//   deps compared inline       stored on the fiber's hook as memoizedState
//                              with a HookHasEffect flag
//   no lint                    eslint-plugin-react-hooks/exhaustive-deps
//                              statically analyses what the closure reads
//   n/a                        useEffectEvent (experimental) — read the
//                              latest value WITHOUT declaring it as a dep.
//                              This is the sanctioned escape hatch for
//                              "I want the latest callback but do not want
//                              to re-subscribe"
//   n/a                        deps length must be CONSTANT across renders.
//                              A dynamic array warns.
//
// A precise detail worth quoting:
//   React does NOT validate deps at runtime. Lying compiles and ships. The
//   lint rule is the only thing standing between you and §7.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Infinite loop, tab freezes:
//   An object/array/function dep + setState in the effect. → §5.
//
// Bug 2 — Stale value forever:
//   Lying with []. → §7. Worse than the loop because it is silent.
//
// Bug 3 — Effect re-runs on every render:
//   A function dep. Parent passes onDone={() => {}} → new every render.
//   Fix: useCallback in the parent, or do not depend on it.
//
// Bug 4 — Effect never re-runs when the parent's object prop changes:
//   You depended on [obj.id] but the effect actually reads obj.name too.
//
// Bug 5 — Fetch fires twice per navigation:
//   Both [] and StrictMode. → 12_react-strictmode.js.
//
// Bug 6 — setState in an effect with no deps:
//   useEffect(() => setX(1)) with no array → render → effect → render → ...
//
// Bug 7 — Deps that change reference on every keystroke:
//   [searchOptions] where searchOptions = { q } inline in render.
//
// Bug 8 — Disabling the lint rule to "make it work":
//   The rule was right. It is right an overwhelming share of the time.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The three forms:
assert(noArray.effectRuns === noArray.renders, "no array → one run per render");
assert(emptyArray.effectRuns === 1, "[] → exactly one run, ever");
assert(withDeps.effectRuns === 3, "[count] → runs when count actually changed");
assert(withDeps.effectRuns === noArray.effectRuns,
  "[count] gave NO saving here — count changed every render, so a deps " +
  "array that always changes is the same as no array at all");
assert(unrelatedDep.effectRuns === 1,
  "[theme] skipped renders 2 and 3 — deps only help when they DON'T change");
assert(unrelatedDep.renders === noArray.renders,
  "...and deps never change the number of RENDERS, only effect runs");

// Object.is is the whole mechanism:
assert(Object.is({}, {}) === false, "two identical-looking objects are NOT equal");
assert(Object.is([], []) === false, "nor arrays");
assert(Object.is("a", "a") === true, "primitives compare by value — safe as deps");
assert(Object.is(NaN, NaN) === true, "Object.is is not === : NaN equals NaN");
assert(Object.is(0, -0) === false, "and 0 is not -0 — the other === difference");

// The loop:
assert(runLoopDemo().includes("INFINITE LOOP"),
  "an object dep + setState in the effect = infinite loop");

// The fixes:
assert(fix1() === 1, "a primitive dep is stable");
assert(fix2() === 1, "the functional updater makes [] honest");
assert(fix3() === 1, "an object created inside the effect is not a dep");

// The lie:
assert(JSON.stringify(honest()) === JSON.stringify(["a", "ab", "abc"]),
  "honest deps: the effect saw every value");
assert(JSON.stringify(lying()) === JSON.stringify(["a"]),
  "the lie: the effect is stuck on render #1's value FOREVER");

console.log("§11 — mini assertions passed for: useEffect dependency array");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how does the dependency array work?", answer like this:
//
//   "React compares each dep to the previous render's with Object.is and
//    re-runs the effect only if one changed. No array means every render,
//    an empty array means mount only.
//
//    The key point is that Object.is is reference equality. Every render
//    creates new objects, arrays, and functions, so an object in the deps is
//    a different reference every time — the effect runs every render, and if
//    it sets state, that is your infinite loop. The state value never even
//    changed; only the reference did.
//
//    But I would reframe the question, because the mental model causes the
//    bugs. Deps are not a trigger list you tune until it fires the right
//    amount. They are a DECLARATION of what the effect reads from render
//    scope. The effect synchronizes something outside React with props and
//    state, and the deps are just those values. React derives the timing.
//
//    That is why removing a dep to stop a loop is the wrong instinct — you
//    are lying about what you read, and the effect closes over a stale value
//    forever. That version doesn't crash or warn; it just quietly searches for
//    the wrong query for the rest of the session, which is worse than the loop.
//    The real fixes change what the effect READS: depend on a primitive like
//    user.id instead of user, use the functional updater so you don't read the
//    state at all, or move the object inside the effect.
//
//    And often the answer is that it shouldn't be an effect. Deriving data for
//    render? Compute it during render. Responding to a click? That's an event
//    handler. Resetting state on a prop change? Use key."
//
// The reframe + "You Might Not Need an Effect" is the senior signal here.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How does React compare deps?
// A1. Object.is, per index, shallowly. Never deep equality.
//
// Q2. Why does an object dep cause an infinite loop?
// A2. New reference every render → Object.is false → effect runs → setState
//     → render → new reference. The value never changed; the identity did.
//
// Q3. Why not just remove the dep?
// A3. Because the effect still READS it — from an old closure. You get a
//     stale value silently, which is worse than the loop.
//
// Q4. What is the difference between no array and []?
// A4. No array = every render. [] = mount only (twice in StrictMode dev).
//
// Q5. Is Object.is the same as ===?
// A5. Almost. Two differences: Object.is(NaN, NaN) is true, and
//     Object.is(0, -0) is false.
//
// Q6. When is useMemo the right fix for a dep?
// A6. When the object genuinely must be shared with children or other hooks.
//     If you are memoizing purely to satisfy a dep array, prefer a primitive.
//
// Q7. Should you ever disable exhaustive-deps?
// A7. Very rarely. The legitimate case — wanting the latest callback without
//     re-subscribing — is what useEffectEvent is being designed for.
//
// Q8. Can deps be dynamic?
// A8. No. The length must be constant across renders; React warns otherwise,
//     because deps are matched positionally, like hooks themselves.
//
// Q9. Does a changing dep re-render the component?
// A9. No — that is backwards. Deps do not cause renders. They only decide
//     whether the effect runs AFTER a render that already happened.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is the dependency array?
//   Back : A declaration of what the effect reads. Not a trigger list.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : Object.is per index. Reference equality. Never deep.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : An object/function dep — new reference every render → loop.
//
// Flashcard 4:
//   Front: Why not remove a dep to stop a loop?
//   Back : The effect still reads it, now from a stale closure. Silent bug.
//
// Flashcard 5:
//   Front: The best fix for an object dep?
//   Back : Depend on a primitive (user.id), or move the object into the effect.
//
// Flashcard 6:
//   Front: How do you sound senior?
//   Back : "What is this effect synchronizing with?" — then question whether
//          it should be an effect at all.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild the deps comparison from memory. One line with .some and Object.is.
//
// Task 2:
//   Add exhaustive-deps detection: use fn.toString() to find identifiers the
//   effect body references, and warn if one is missing from deps. That is a
//   toy version of the real lint rule.
//
// Task 3:
//   Reproduce §5 with a FUNCTION dep instead of an object. Same loop? Why?
//
// Task 4:
//   Break §7's honest version: add a second setState inside the effect and
//   watch it loop. Now you have both bugs in one component.
//
// Task 5:
//   Implement useEffectEvent: a ref that always holds the latest callback,
//   read by the effect without being a dep. Then explain why it is safe here
//   but not for values you render.
//
// Task 6:
//   Explain in 60 seconds why [user] loops but [user.id] does not, without
//   using the word "dependency".


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Deps are what the effect READS, compared with Object.is. Reference
//   equality — new object every render.
//
// If you remember the common bug:
//   An object dep + setState = infinite loop. Removing the dep = a stale
//   closure forever. Both come from the "trigger list" mental model.
//
// If you remember the professional framing:
//   "What is this effect synchronizing with?" And then: does it need to be
//   an effect at all?
//
// NEXT TOPIC -> 03_useeffect-cleanup.js
