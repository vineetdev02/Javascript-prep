// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  05_useref-dom-mutable-ref.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useRef — DOM + mutable ref
//
// WHAT YOU WILL MASTER HERE:
//   1. useRef is literally useState without the re-render — build it in 3 lines
//   2. The two jobs: a DOM handle, and an instance variable
//   3. Why mutating a ref does NOT update the UI — PROVEN
//   4. The ref as a stale-closure escape hatch (and when that is legitimate)
//   5. Refs vs state: the decision rule that never fails
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/05_useref-dom-mutable-ref.js"
//
// Prerequisite: 01_usestate-internals.js — useRef is the same hook slot with
// the setter removed. Understand that and this file is easy.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useRef:
// A mutable box that survives re-renders and does NOT trigger one when you
// change it.
//
// If interviewer says "explain it simply", say:
// "It is a value that persists across renders like state, but writing to it
//  does not re-render. React hands you the same { current } object every
//  render."
//
// If interviewer asks "why does it matter?", say:
// "Because it is the escape hatch from the render cycle. Two things need it:
//  a handle on a DOM node, and a value that must survive renders but is not
//  part of the output — a timer ID, a previous value, an instance counter."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   a box that survives, but nobody is watching it
//
// The relationship — say this and the whole hook falls out:
//
//   useState  = a value + a setter that RE-RENDERS
//   useRef    = a value +          no setter, no re-render
//
// Same storage. Same fiber slot. One notifies React; the other does not.
//
// Why is it { current } and not just a value?
//   Because a function component cannot reassign a captured variable and have
//   it survive. You need a stable OBJECT whose property you mutate. The box
//   identity never changes; only .current does. That indirection IS the hook.
//
// Runtime rule:
//   Mutating ref.current does nothing to the UI. React does not know and
//   does not care. The screen only updates on the NEXT render, triggered by
//   something else.
//
// Practical rule:
//   Does the UI need to change when this value changes?
//     YES → useState.   NO → useRef.
//   That single question answers it every time.
//
// Common trap:
//   Using a ref for something the UI displays. The value updates, the screen
//   does not, and it looks like React is broken. It is not — you told React
//   not to watch it.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD useRef
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  let renderCount = 0;

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { value: initial };
    const setState = (next) => {
      const value = typeof next === "function" ? next(hooks[slot].value) : next;
      if (Object.is(value, hooks[slot].value)) return;
      hooks[slot].value = value;
      render();                        // ← the ONLY difference from useRef
    };
    return [hooks[slot].value, setState];
  }

  // ── THE WHOLE HOOK. Three lines. ────────────────────────────────
  function useRef(initialValue) {
    const slot = cursor++;
    if (!(slot in hooks)) {
      hooks[slot] = { current: initialValue };   // created ONCE, on mount
    }
    return hooks[slot];                          // the SAME object, forever
  }
  // No setter. No render() call. Nothing notifies React.
  // That absence is the entire feature.

  function render() {
    cursor = 0;
    renderCount++;
    return component();
  }

  function mount(fn) {
    component = fn;
    return render();
  }

  return { useState, useRef, mount, getRenderCount: () => renderCount };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE SAME BOX, EVERY RENDER
// ══════════════════════════════════════════════════════════════════

console.log("§4 — identity is stable across renders:\n");

const R1 = createMiniReact();
const boxes = [];
let bump1;

R1.mount(() => {
  const ref = R1.useRef({ id: "the box" });
  const [n, setN] = R1.useState(0);
  bump1 = () => setN(n + 1);
  boxes.push(ref);                     // capture the box object itself
  return n;
});

bump1();
bump1();

console.log("  rendered", R1.getRenderCount(), "times");
console.log("  same ref object each render?",
  boxes[0] === boxes[1] && boxes[1] === boxes[2]);
console.log("  → React returns the SAME { current } object every render.");
console.log("    That stability is why you can put it in a dep array and it");
console.log("    never triggers anything. The BOX never changes.\n");

// The initializer runs once — a real gotcha:
let initCalls = 0;
const R2 = createMiniReact();
let bump2;
R2.mount(() => {
  R2.useRef(initCalls++);              // ← the ARGUMENT is evaluated every render
  const [n, setN] = R2.useState(0);
  bump2 = () => setN(n + 1);
  return n;
});
bump2(); bump2();

console.log("  useRef(expensive()) — argument evaluated:", initCalls, "times");
console.log("  → useRef has NO lazy initializer, unlike useState(() => x).");
console.log("    The argument is evaluated on every render and thrown away.");
console.log("    For an expensive init: useRef(null) + if (!ref.current) set it.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — MUTATING A REF DOES NOT UPDATE THE UI
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the classic 'my ref counter does not work':\n");

const R3 = createMiniReact();
let clickRef, screenWithRef;

R3.mount(() => {
  const countRef = R3.useRef(0);
  const [, setTick] = R3.useState(0);
  clickRef = () => { countRef.current++; };       // mutate the box
  screenWithRef = () => countRef.current;         // what the JSX would show
  void setTick;
  return countRef.current;
});

clickRef(); clickRef(); clickRef();

console.log("  <button onClick={() => countRef.current++}>{countRef.current}</button>");
console.log("    clicked 3 times");
console.log("    countRef.current =", screenWithRef(), "← the VALUE did change");
console.log("    renders          =", R3.getRenderCount(), "← but no re-render happened");
console.log("    screen still shows: 0");
console.log("\n  🐛 The data is right and the screen is wrong. Nothing re-rendered,");
console.log("     so React never re-read countRef.current for the JSX.");
console.log("     This is not a bug in React — you asked for a value nobody");
console.log("     is watching. If the UI shows it, it must be state.\n");

// The same thing with state:
const R4 = createMiniReact();
let clickState, screenWithState;

R4.mount(() => {
  const [count, setCount] = R4.useState(0);
  clickState = () => setCount(c => c + 1);
  screenWithState = () => count;
  return count;
});

clickState(); clickState(); clickState();
console.log("  With useState instead:");
console.log("    count   =", screenWithState());
console.log("    renders =", R4.getRenderCount(), "← each click re-rendered ✅\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — JOB 1: A HANDLE ON A DOM NODE
// ══════════════════════════════════════════════════════════════════
//
//   const inputRef = useRef(null);
//   <input ref={inputRef} />
//   inputRef.current.focus();
//
// React assigns the DOM node to .current during the COMMIT phase, and sets
// it back to null on unmount. The timing is the thing to know:
//
//   render      → inputRef.current is still null   ← you CANNOT read it here
//   commit      → React sets .current = the node
//   layout eff. → .current is available, before paint
//   passive eff → .current is available, after paint
//
// So this is a very common crash:
//
//   function Modal() {
//     const ref = useRef(null);
//     ref.current.focus();          // 💥 null — render runs before commit
//     return <input ref={ref} />;
//   }
//
//   ✅ useEffect(() => { ref.current.focus(); }, []);
//
// Legitimate DOM ref uses — the list is short on purpose:
//   • focus / blur / select
//   • scrollIntoView, measuring (getBoundingClientRect)
//   • media control (video.play())
//   • integrating a non-React library that wants a node
//   • triggering an imperative animation
//
// Everything else should be declarative. If you find yourself setting
// textContent or style through a ref, you are fighting React.

console.log("§6 — DOM ref timing:\n");

function simulateMount() {
  const ref = { current: null };
  const timeline = [];

  timeline.push(["render", ref.current]);           // null — the node does not exist
  ref.current = { tagName: "INPUT", focus: () => "focused!" };   // React commits
  timeline.push(["commit (React assigns)", ref.current.tagName]);
  timeline.push(["useLayoutEffect", ref.current.focus()]);
  timeline.push(["useEffect", ref.current.focus()]);
  ref.current = null;                                // React clears on unmount
  timeline.push(["after unmount", ref.current]);
  return timeline;
}

for (const [phase, value] of simulateMount()) {
  console.log(`  ${phase.padEnd(24)} ref.current = ${JSON.stringify(value)}`);
}
console.log("\n  Reading ref.current DURING render gives null — the node does");
console.log("  not exist yet. That is the #1 ref crash. Read it in an effect.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — JOB 2: AN INSTANCE VARIABLE
// ══════════════════════════════════════════════════════════════════
//
// The job people under-use. A ref is the function-component equivalent of
// `this.something` on a class instance.

console.log("§7 — the ref as an instance variable:\n");

// The canonical case: a timer ID. It must survive renders (to clear it), but
// the UI does not display it. So: ref, not state.
const R5 = createMiniReact();
const fakeTimers = { active: new Set(), next: 1 };
const setIntervalFake = () => { const id = fakeTimers.next++; fakeTimers.active.add(id); return id; };
const clearIntervalFake = (id) => fakeTimers.active.delete(id);

let start, stop;
R5.mount(() => {
  const timerRef = R5.useRef(null);
  const [running, setRunning] = R5.useState(false);
  start = () => { timerRef.current = setIntervalFake(); setRunning(true); };
  stop = () => { clearIntervalFake(timerRef.current); timerRef.current = null; setRunning(false); };
  return running;
});

start();
console.log("  start() → timers alive:", fakeTimers.active.size,
  "(the ID lives in a ref, not state — the UI never shows it)");
stop();
console.log("  stop()  → timers alive:", fakeTimers.active.size, "✅");

console.log("\n  Why not state for the timer ID?");
console.log("    setTimerId(id) would re-render for a value nothing displays.");
console.log("    Worse: the ID would be captured per render, so a stale closure");
console.log("    could clear the WRONG timer. The ref always holds the latest.");
console.log("\n  Other genuine instance-variable uses:");
console.log("    • previous value of a prop (→ usePrevious, custom hook 07)");
console.log("    • 'has this mounted before?' flags for skip-first-render");
console.log("    • an AbortController for the in-flight request");
console.log("    • a WebSocket / observer / third-party widget instance");
console.log("    • mutable caches that must not trigger renders\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE STALE CLOSURE ESCAPE HATCH
// ══════════════════════════════════════════════════════════════════

console.log("§8 — a ref always reads the LATEST value:\n");

const R6 = createMiniReact();
const captured = [];
let setCount6, readClosure, readRef;

R6.mount(() => {
  const [count, setCount] = R6.useState(0);
  const countRef = R6.useRef(count);
  countRef.current = count;                  // keep the ref in sync each render

  setCount6 = setCount;
  readClosure = () => count;                 // captures THIS render's count
  readRef = () => countRef.current;          // reads the box, always current
  captured.push({ closure: readClosure, ref: readRef });
  return count;
});

const firstRenderClosure = captured[0].closure;
const firstRenderRef = captured[0].ref;

setCount6(1);
setCount6(2);
setCount6(3);

console.log("  count is now 3. Reading via render #1's functions:");
console.log("    closure from render #1 →", firstRenderClosure(),
  "← frozen at render #1. This is the stale closure.");
console.log("    ref     from render #1 →", firstRenderRef(),
  "← the box was mutated. Always the latest.");

console.log("\n  This is the fix for the classic setInterval-logs-0 bug:");
console.log("    useEffect(() => {");
console.log("      const id = setInterval(() => console.log(countRef.current), 1000);");
console.log("      return () => clearInterval(id);");
console.log("    }, []);   // [] is honest — the effect reads the BOX, not count");
console.log("\n  ⚠️  But do not reach for this first. The ref pattern is correct");
console.log("     for 'I need the latest value in a callback that must not");
console.log("     re-subscribe'. It is WRONG for anything you render — refs are");
console.log("     invisible to React, so the UI will not update.");
console.log("     Prefer: the functional updater, or honest deps.");
console.log("     React's useEffectEvent is being built to make this pattern");
console.log("     official — the fact that it needs a dedicated API tells you");
console.log("     the ref version is a workaround.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — REFS vs STATE: THE DECISION TABLE
// ══════════════════════════════════════════════════════════════════
//
//                            useState          useRef
//   ─────────────────────────────────────────────────────────
//   survives re-renders       ✓                 ✓
//   triggers a re-render      ✓                 ✗
//   safe to mutate directly   ✗ (immutable)     ✓ (that is the point)
//   readable during render    ✓                 ⚠️  avoid — see below
//   writable during render    ✗                 ⚠️  avoid — see below
//   causes stale closures     ✓                 ✗ (always latest)
//   shows in the UI           ✓                 ✗
//
// Why "avoid reading/writing during render":
//   The render phase can be discarded or replayed (→ Fiber, file 04). A ref
//   mutation during render is a side effect that survives a render that never
//   committed. StrictMode double-invokes render partly to surface this.
//   Read and write refs in effects and event handlers.
//
// The rule, one line:
//   If the UI must change when the value changes, it is state. Otherwise ref.


// ══════════════════════════════════════════════════════════════════
// § 10 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real React
//   ───────────               ──────────
//   hooks[slot] = {current}   the same — a hook object with memoizedState
//                             holding { current }. Genuinely this simple.
//   n/a                       ref={node => ...} callback refs: called with
//                             the node on mount and null on unmount. React 19
//                             lets the callback RETURN a cleanup function.
//   n/a                       React 19: ref is a normal PROP for function
//                             components. forwardRef is no longer needed.
//   n/a                       dev warning if you pass ref to a component
//                             that does not forward it (pre-19)
//   n/a                       useImperativeHandle customizes what .current
//                             exposes → file 10
//
// A precise fact:
//   useRef(initialValue) has NO lazy initializer. useState(() => x) defers;
//   useRef(x) evaluates x on every render and discards it. For an expensive
//   object: useRef(null) then `if (ref.current === null) ref.current = make()`.


// ══════════════════════════════════════════════════════════════════
// § 11 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The value updates but the screen does not:
//   A ref for something rendered. → §5. The most common misuse.
//
// Bug 2 — "Cannot read property 'focus' of null":
//   Reading ref.current during render, before commit. → §6.
//
// Bug 3 — A ref inside a conditional render is null:
//   The node is not mounted, so .current is null. Guard it.
//
// Bug 4 — Expensive object recreated every render:
//   useRef(new Client()) — the argument is evaluated every time. → §4.
//
// Bug 5 — Clearing the wrong timer:
//   The timer ID kept in state and captured in a stale closure. Use a ref.
//
// Bug 6 — A ref guard hiding a StrictMode double-mount:
//   → 12_react-strictmode.js §7. A real ref, a wrong use.
//
// Bug 7 — Mutating a ref during render and getting an inconsistent UI:
//   The render was discarded; the mutation was not. → §9.
//
// Bug 8 — Putting a ref in a dep array expecting re-runs:
//   The box identity NEVER changes, so the effect never re-runs on
//   .current changes. Refs are invisible to React. That is not a workaround
//   you can fix — it is the definition.


// ══════════════════════════════════════════════════════════════════
// § 12 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// Identity:
assert(boxes[0] === boxes[1] && boxes[1] === boxes[2],
  "React returns the SAME box object on every render");
assert(R1.getRenderCount() === 3, "...across 3 real renders");
assert(initCalls === 3,
  "useRef's argument is evaluated EVERY render — there is no lazy initializer");

// The headline: mutation does not render.
assert(screenWithRef() === 3, "the ref value DID change");
assert(R3.getRenderCount() === 1, "...but no re-render was triggered. Screen shows 0 🐛");
assert(screenWithState() === 3 && R4.getRenderCount() === 4,
  "useState: same 3 clicks, but 3 extra renders — the screen updates ✅");

// DOM ref timing:
const timeline = simulateMount();
assert(timeline[0][1] === null, "ref.current is null DURING render — the node does not exist");
assert(timeline[1][1] === "INPUT", "React assigns it at commit");
assert(timeline[timeline.length - 1][1] === null, "React clears it on unmount");

// Instance variable:
assert(fakeTimers.active.size === 0, "the timer was cleared using the ref's ID");

// Stale closure vs ref:
assert(firstRenderClosure() === 0,
  "render #1's closure is frozen at 0 — the stale closure");
assert(firstRenderRef() === 3,
  "render #1's ref reads 3 — the box was mutated, so it is always current");
assert(firstRenderClosure() !== firstRenderRef(),
  "SAME render, two values. This gap is the entire ref escape hatch.");

console.log("§12 — mini assertions passed for: useRef");
console.log("\n  The last assertion is the file in one line: a closure captured");
console.log("  0, a ref read 3, from the exact same render.");


// ══════════════════════════════════════════════════════════════════
// § 13 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is useRef?", answer like this:
//
//   "It's a mutable box that survives re-renders without triggering one. The
//    cleanest way to say it: useRef is useState minus the setter. Same fiber
//    slot, same persistence — it just doesn't notify React. It's { current }
//    rather than a bare value because a function component can't reassign a
//    captured variable and have it survive; you need a stable object whose
//    property you mutate. React hands you the identical box every render.
//
//    It has two jobs. First, a handle on a DOM node — focus, scroll,
//    measure, play a video. The timing matters: .current is null during
//    render because the node doesn't exist until commit, so reading it in
//    the render body is the classic crash. Read it in an effect.
//
//    Second — and this one's under-used — it's the function-component version
//    of an instance variable. A timer ID, an AbortController, a previous
//    value. Things that must survive renders but aren't part of the output.
//
//    The rule is one question: does the UI need to change when this value
//    changes? Yes means state, no means ref. Get that backwards and you get
//    the classic bug where the ref counter increments perfectly and the screen
//    never moves — which looks like React is broken, but you literally asked
//    for a value nobody is watching.
//
//    One nuance: because the box is mutated rather than captured, a ref
//    always reads the latest value, which makes it an escape hatch from stale
//    closures — the setInterval that always logs 0. I'd reach for a functional
//    updater or honest deps first though. The fact that React is building
//    useEffectEvent for that case tells you the ref version is a workaround."
//
// "useState minus the setter" plus the two jobs is a complete senior answer.


// ══════════════════════════════════════════════════════════════════
// § 14 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is useRef?
// A1. A persistent mutable box that does not trigger renders. useState
//     without the setter.
//
// Q2. Why { current } instead of a plain value?
// A2. You need a stable object to mutate. A reassigned local would not
//     survive the next render.
//
// Q3. Why doesn't my UI update when I change a ref?
// A3. Nothing notified React. Refs are invisible to it. If the UI shows the
//     value, it must be state.
//
// Q4. When is ref.current available?
// A4. After commit. It is null during render. Read it in an effect.
//
// Q5. useRef vs useState for a timer ID?
// A5. Ref. The UI never shows it, and state would both re-render pointlessly
//     and risk a stale closure clearing the wrong timer.
//
// Q6. Does useRef have a lazy initializer?
// A6. No. The argument is evaluated every render and discarded. Use
//     useRef(null) + an if-guard for expensive values.
//
// Q7. Can you put a ref in a dep array?
// A7. You can, and it does nothing — the box identity never changes. Changes
//     to .current will never re-run the effect.
//
// Q8. Is it safe to mutate a ref during render?
// A8. No. The render can be discarded or replayed, but your mutation
//     persists. Mutate in effects and handlers.
//
// Q9. What changed with refs in React 19?
// A9. ref is a normal prop for function components — forwardRef is no longer
//     needed — and callback refs can return a cleanup function.


// ══════════════════════════════════════════════════════════════════
// § 15 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useRef?
//   Back : useState minus the setter. A box that survives, unwatched.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : Mutating .current does NOT re-render. Same box every render.
//
// Flashcard 3:
//   Front: The decision rule?
//   Back : Does the UI change when it changes? Yes → state. No → ref.
//
// Flashcard 4:
//   Front: When is ref.current set?
//   Back : At commit. It is null during render. That is the classic crash.
//
// Flashcard 5:
//   Front: What is the most common trap?
//   Back : A ref for a rendered value — it updates, the screen does not.
//
// Flashcard 6:
//   Front: Why does a ref beat a stale closure?
//   Back : The closure captured a value; the ref reads a mutated box.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Name both jobs — DOM handle AND instance variable — and warn that
//          refs during render are unsafe.


// ══════════════════════════════════════════════════════════════════
// § 16 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write useRef from memory. Three lines. Then delete the setter from your
//   useState and confirm you have just built useRef.
//
// Task 2:
//   Build usePrevious with a ref and an effect. Why must the assignment be
//   in the effect and not the render body? (→ custom hook 07.)
//
// Task 3:
//   Reproduce the setInterval-logs-0 bug in the mini React, then fix it three
//   ways: functional updater, ref, honest deps. Rank them.
//
// Task 4:
//   Add callback refs: ref={node => ...} called with the node at mount and
//   null at unmount. Then add the React 19 cleanup-return version.
//
// Task 5:
//   Break §7: store the timer ID in state instead of a ref. Trigger a render
//   between start and stop and watch the wrong timer get cleared.
//
// Task 6:
//   Explain in 60 seconds why a ref counter increments but the screen shows
//   0, to someone convinced React is broken.


// ══════════════════════════════════════════════════════════════════
// § 17 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   useRef is useState without the setter. It survives; nobody watches it.
//
// If you remember the common bug:
//   A ref for a rendered value — the number changes, the screen does not.
//   And ref.current is null during render.
//
// If you remember the professional framing:
//   Two jobs — DOM handle and instance variable. One question — does the UI
//   need to change? Never read or write refs during render.
//
// NEXT TOPIC -> 06_usereducer-vs-usestate.js
