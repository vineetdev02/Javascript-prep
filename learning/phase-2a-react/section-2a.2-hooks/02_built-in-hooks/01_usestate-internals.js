// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  01_usestate-internals.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useState — internals
//
// WHAT YOU WILL MASTER HERE:
//   1. Exact definition in interview language
//   2. Why hooks are an ARRAY indexed by call order (the whole secret)
//   3. A working useState you build yourself — closure over an array
//   4. Batching, stale closures, and the functional updater
//   5. Real bugs and how to trace them
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/01_usestate-internals.js"
//
// This file builds a miniature React. No dependencies. Everything runs.
// Prerequisite: 06_closures-and-memory/01_closure-definition.js — useState
// IS a closure. If closures are shaky, go back first.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useState:
// useState gives a function component a value that survives re-renders,
// by storing it OUTSIDE the component — in a list on the fiber — and
// looking it up by CALL ORDER on every render.
//
// If interviewer says "explain it simply", say:
// "A function component runs top to bottom on every render. Local variables
//  die each time. useState stores the value outside the function and hands
//  it back by position in a list."
//
// If interviewer asks "why does it matter?", say:
// "Because the whole Rules of Hooks — no hooks in conditions or loops —
//  falls out of one fact: React identifies your hook by the order it was
//  called, not by its name."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   array indexed by call order
//
// Runtime rule:
//   Render resets the cursor to 0. Each hook call takes the next slot.
//   Slot N must be the SAME hook on every single render.
//
// The mental picture:
//
//   render #1                     render #2
//   ─────────                     ─────────
//   cursor = 0                    cursor = 0
//   useState("a")  → slot[0]      useState("a")  → slot[0]  ← same slot
//   useState(0)    → slot[1]      useState(0)    → slot[1]  ← same slot
//   useEffect(...) → slot[2]      useEffect(...) → slot[2]  ← same slot
//
// Practical rule:
//   State does not live in your component. Your component only borrows it.
//
// Common trap:
//   Thinking setState mutates the current render's variable. It does not.
//   `count` is a const captured by THIS render's closure. It never changes.
//   setState schedules a NEW render where a NEW const is created.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD useState FROM SCRATCH
// ══════════════════════════════════════════════════════════════════
//
// This is the drill that wins interviews. Read it, then write it blind.

function createMiniReact() {
  const hooks = [];       // the fiber's hook list — lives OUTSIDE renders
  let cursor = 0;         // reset to 0 at the start of every render
  let currentComponent = null;
  let renderCount = 0;
  let isRendering = false;
  const pending = [];     // batching queue

  function useState(initialValue) {
    const slot = cursor;  // capture THIS render's index (closure!)
    cursor++;

    // Only the very first render initializes. After that, slot holds truth.
    if (!(slot in hooks)) {
      // Lazy initializer: useState(() => expensive()) runs only once.
      hooks[slot] = typeof initialValue === "function"
        ? initialValue()
        : initialValue;
    }

    const setState = (next) => {
      // Functional updater reads the LATEST value, not the captured one.
      const value = typeof next === "function" ? next(hooks[slot]) : next;

      // Bail out — React skips the re-render if the value is identical.
      if (Object.is(value, hooks[slot])) return;

      hooks[slot] = value;
      scheduleRender();
    };

    return [hooks[slot], setState];
  }

  function scheduleRender() {
    // Batching: many setStates inside one event → ONE render.
    if (pending.length === 0) {
      queueMicrotask(flush);
    }
    pending.push(true);
  }

  function flush() {
    pending.length = 0;
    render();
  }

  function render() {
    isRendering = true;
    cursor = 0;           // ← THE line that makes call order work
    renderCount++;
    const output = currentComponent();
    isRendering = false;
    return output;
  }

  function mount(component) {
    currentComponent = component;
    return render();
  }

  return {
    useState,
    mount,
    getRenderCount: () => renderCount,
    getHooks: () => hooks.slice(),
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — RUN IT: TWO HOOKS, ONE COMPONENT
// ══════════════════════════════════════════════════════════════════

const React1 = createMiniReact();

function Counter() {
  const [count, setCount] = React1.useState(0);      // slot 0
  const [name, setName] = React1.useState("Vineet"); // slot 1

  console.log(`  render #${React1.getRenderCount()} → count=${count}, name=${name}`);

  return { count, setCount, name, setName };
}

console.log("§4 — mount and update:");
let ui = React1.mount(Counter);

ui.setCount(1);

// Give the microtask queue a turn so the batched render flushes.
queueMicrotask(() => {
  console.log("  hooks array after update:", React1.getHooks());
  console.log("  ↑ state lives HERE, not inside Counter\n");
  demoStaleClosure();
});


// ══════════════════════════════════════════════════════════════════
// § 5 — THE STALE CLOSURE (asked in almost every React interview)
// ══════════════════════════════════════════════════════════════════

function demoStaleClosure() {
  console.log("§5 — stale closure: why setCount(count+1) x3 gives 1, not 3");

  const R = createMiniReact();
  let api;

  function Broken() {
    const [count, setCount] = R.useState(0);
    api = { count, setCount };
    return null;
  }

  R.mount(Broken);

  // All three calls close over the SAME `count` from render #1, which is 0.
  api.setCount(api.count + 1);   // 0 + 1 = 1
  api.setCount(api.count + 1);   // 0 + 1 = 1  ← still reading the old 0
  api.setCount(api.count + 1);   // 0 + 1 = 1  ← still reading the old 0

  queueMicrotask(() => {
    console.log("  direct value  → count =", R.getHooks()[0], "(expected 3, got 1)");
    demoFunctionalUpdater();
  });
}

function demoFunctionalUpdater() {
  const R = createMiniReact();
  let api;

  function Fixed() {
    const [count, setCount] = R.useState(0);
    api = { count, setCount };
    return null;
  }

  R.mount(Fixed);

  // The updater form receives the CURRENT value at apply time.
  api.setCount(c => c + 1);   // 0 → 1
  api.setCount(c => c + 1);   // 1 → 2
  api.setCount(c => c + 1);   // 2 → 3

  queueMicrotask(() => {
    console.log("  functional    → count =", R.getHooks()[0], "(correct: 3)");
    console.log("  RULE: if the next state depends on the previous, use the updater.\n");
    demoRulesOfHooks();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 6 — WHY YOU CANNOT PUT A HOOK IN AN if
// ══════════════════════════════════════════════════════════════════
//
// Now that you have built the array, the rule is obvious rather than
// something to memorize. Watch the slots shift.

function demoRulesOfHooks() {
  console.log("§6 — a conditional hook corrupts the slots:");

  const R = createMiniReact();
  let showName = true;

  function Illegal() {
    if (showName) {
      R.useState("Vineet");   // slot 0 on render #1 — GONE on render #2
    }
    const [count] = R.useState(0);   // slot 1 → then slot 0. Disaster.
    console.log(`  render #${R.getRenderCount()} → count is:`, count);
  }

  R.mount(Illegal);          // slots: [0]="Vineet", [1]=0  → count = 0 ✓
  showName = false;
  R.mount(Illegal);          // cursor 0 now hits slot[0] → count = "Vineet" ✗

  console.log("  ↑ count became a STRING. The hook read another hook's slot.");
  console.log("  This is why React throws 'rendered fewer hooks than expected'.\n");

  demoBailout();
}


// ══════════════════════════════════════════════════════════════════
// § 7 — BAIL OUT: SETTING THE SAME VALUE DOES NOT RE-RENDER
// ══════════════════════════════════════════════════════════════════

function demoBailout() {
  console.log("§7 — Object.is bailout:");

  const R = createMiniReact();
  let api;

  function Comp() {
    const [user, setUser] = R.useState({ name: "Vineet" });
    api = { user, setUser };
    return null;
  }

  R.mount(Comp);
  const before = R.getRenderCount();

  api.setUser(api.user);              // same reference → bail out, no render
  api.setUser({ name: "Vineet" });    // NEW object, same content → RE-RENDER

  queueMicrotask(() => {
    console.log("  renders before:", before, "| after:", R.getRenderCount());
    console.log("  Same reference = no render. New object = render, even if");
    console.log("  the contents look identical. React compares with Object.is,");
    console.log("  never deep equality. This is the referential equality trap.\n");
    summary();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
// Be honest about the simplification — interviewers respect precision.
//
//   Our version                    Real React
//   ───────────                    ──────────
//   one global array               a hook list per FIBER (per component
//                                  instance), so two <Counter/> are separate
//   plain values in slots          a hook OBJECT: { memoizedState, queue,
//                                  baseState, next } — a linked list, not
//                                  an array
//   setState overwrites            updates go into a circular queue and are
//                                  REPLAYED in order during the next render
//   queueMicrotask batching        a lane-based priority scheduler; React 18
//                                  batches everywhere (timeouts, promises,
//                                  native handlers), React 17 only batched
//                                  inside React event handlers
//   cursor variable                a dispatcher swapped per render phase,
//                                  which is how React throws when you call
//                                  a hook outside a component
//
// Say this:
//   "The array model explains the rules correctly. The real implementation
//    is a linked list of hook objects on the fiber with an update queue,
//    because it needs to replay updates for concurrent rendering."


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Counter that increments once instead of three times:
//   setCount(count+1) x3. All read the same stale count. → §5.
//   Fix: setCount(c => c + 1)
//
// Bug 2 — setInterval that always logs 0:
//   useEffect(() => { setInterval(() => console.log(count), 1000) }, [])
//   The callback closed over render #1's count forever.
//   Fix: functional updater, or a ref, or the right dependencies.
//
// Bug 3 — Mutating state and nothing re-renders:
//   user.name = "x"; setUser(user);
//   Same reference → Object.is bails out → no render. → §7.
//   Fix: setUser({ ...user, name: "x" })
//
// Bug 4 — "Rendered fewer hooks than expected":
//   An early return or a conditional hook shifted the slots. → §6.
//
// Bug 5 — Expensive initial state recomputed every render:
//   useState(buildHugeList())       ← runs on EVERY render, result discarded
//   useState(() => buildHugeList()) ← runs once. Lazy initializer. → §3.
//
// Bug 6 — Reading state right after setting it:
//   setCount(5); console.log(count);  // logs the OLD value
//   count is a const in this render. It cannot change. Not a race condition.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function summary() {
  function assert(condition, message) {
    if (!condition) {
      throw new Error("Assertion failed: " + message);
    }
  }

  const R = createMiniReact();
  let api;
  let initializerCalls = 0;

  function Comp() {
    const [a, setA] = R.useState(() => { initializerCalls++; return 10; });
    const [b] = R.useState("second");
    api = { a, setA, b };
    return null;
  }

  R.mount(Comp);
  assert(api.a === 10, "lazy initializer returns its value");
  assert(initializerCalls === 1, "lazy initializer ran once");

  R.mount(Comp);
  assert(initializerCalls === 1, "initializer does NOT run on re-render");
  assert(R.getHooks().length === 2, "two hooks occupy two slots");
  assert(R.getHooks()[1] === "second", "slot order is stable across renders");

  console.log("§10 — mini assertions passed for: useState internals");
  console.log("\nAll demos complete. Now close the file and rebuild");
  console.log("createMiniReact from memory. That is the actual drill.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how does useState work internally?", answer like this:
//
//   "A function component re-runs top to bottom on every render, so local
//    variables cannot hold state. React keeps the state outside, on the
//    fiber, in a linked list of hook objects. Each render resets a cursor
//    and every hook call consumes the next slot in order.
//
//    That call-order lookup is the entire reason for the Rules of Hooks:
//    React has no idea your hook is called 'count' — it only knows it was
//    the first hook. Put it in an if, and slot 0 becomes a different hook
//    next render.
//
//    setState does not mutate the current variable — that value is a const
//    captured by this render's closure. It queues an update and schedules a
//    re-render, where a fresh const is created. If the new value is Object.is
//    equal to the old one, React bails out and skips the render entirely."
//
// Then offer: "Want me to implement it? It is about fifteen lines."
// Very few candidates can. Do it, and the interview shifts in your favour.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Where is state actually stored?
// A1. On the fiber node, in memoizedState — a linked list of hook objects,
//     one per hook call, per component instance.
//
// Q2. Why must hooks be called in the same order?
// A2. React matches hooks by position, not by name. Order IS the identity.
//
// Q3. Why does setCount(count+1) three times only add 1?
// A3. All three close over the same render's count. Use the updater form,
//     which receives the latest state at apply time.
//
// Q4. Is setState asynchronous?
// A4. Not in the promise sense. It queues an update and React batches, then
//     re-renders. The variable never changes because it is a const in the
//     current render's closure.
//
// Q5. When does React skip a re-render?
// A5. When Object.is(next, current) is true — the eager bailout. Note React
//     may still render once more before settling; do not rely on skipping.
//
// Q6. What changed about batching in React 18?
// A6. Automatic batching everywhere — promises, timeouts, native handlers.
//     React 17 only batched inside React event handlers.
//
// Q7. useState vs useRef for storing a value?
// A7. useState triggers re-renders and is part of the render output. useRef
//     is a mutable box that does NOT trigger renders. If the UI does not
//     need to update, a ref is correct. → 05_useref-dom-mutable-ref.js
//
// Q8. Why does useState(expensive()) hurt?
// A8. The call is evaluated on every render and thrown away after mount.
//     useState(() => expensive()) defers it to mount only.
//
// Q9. Two <Counter /> on a page — do they share state?
// A9. No. Each fiber has its own hook list. Same code, separate instances.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: How does React know which useState is which?
//   Back : Call order. A cursor into the fiber's hook list, reset each render.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : Render resets the cursor to 0; slot N must be the same hook always.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Stale closure — setCount(count+1) reads this render's frozen count.
//
// Flashcard 4:
//   Front: When does React skip the re-render?
//   Back : Object.is(next, current) → bail out. Reference equality, never deep.
//
// Flashcard 5:
//   Front: How do you sound senior?
//   Back : Implement useState in fifteen lines, then derive the Rules of
//          Hooks from your own array.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild createMiniReact from memory. No peeking. The must-have line is
//   `cursor = 0` inside render().
//
// Task 2:
//   Add useRef to the mini React. It is four lines: a slot holding
//   { current }, returning the SAME object every render. Then prove why
//   it does not trigger a re-render.
//
// Task 3:
//   Break §4 on purpose: wrap the second useState in an if. Predict which
//   value count receives before you run it.
//
// Task 4:
//   Replace the value slots with an update QUEUE — push updates and replay
//   them during render. That is how real React handles concurrent updates,
//   and it makes the functional updater work naturally.
//
// Task 5:
//   Support multiple component instances: key the hook list by instance
//   instead of one global array. You have just invented the fiber.
//
// Task 6:
//   Explain in 60 seconds why setCount(5) followed by console.log(count)
//   prints the old value — WITHOUT using the word "asynchronous".


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   State lives on the fiber, indexed by call order. Render resets the cursor.
//
// If you remember the common bug:
//   Stale closure — setCount(count+1) x3 = +1. Use setCount(c => c + 1).
//
// If you remember the professional framing:
//   The Rules of Hooks are not arbitrary. They are the direct consequence
//   of positional lookup. Build the array once and you never forget them.
//
// NEXT TOPIC -> 02_useeffect-dependency-array.js
