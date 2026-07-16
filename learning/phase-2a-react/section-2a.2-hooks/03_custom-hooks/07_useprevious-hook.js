// ╔══════════════════════════════════════════════════════════════════╗
// ║   Custom Hooks  →  07_useprevious-hook.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: usePrevious hook
//
// WHAT YOU WILL MASTER HERE:
//   1. Four lines that only work because of effect TIMING
//   2. Why the assignment must be in an effect, not the render body — PROVEN
//   3. It tracks the previous RENDER, not the previous VALUE
//   4. Why React has no built-in usePrevious (a deliberate omission)
//   5. The derive-during-render alternative React actually recommends
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/03_custom-hooks/07_useprevious-hook.js"
//
// Prerequisites: 05_useref-dom-mutable-ref.js, 03_useeffect-cleanup.js.
// The smallest custom hook there is, and it teaches effect ordering better
// than almost anything else.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// usePrevious:
// Returns the value from the previous render, by stashing the current value
// in a ref AFTER the render has already read it.
//
// If interviewer says "explain it simply", say:
// "It returns the ref BEFORE updating it. The render reads the old value, and
//  then the effect overwrites it for next time. The whole hook is that
//  ordering."
//
// If interviewer asks "why does it matter?", say:
// "Because it is four lines and every one of them is about timing. Move the
//  assignment from the effect into the render body and it returns the CURRENT
//  value — the hook silently becomes useless. It is the clearest small demo
//  of why effects run after render."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   return first, THEN update
//
// The hook:
//
//   function usePrevious(value) {
//     const ref = useRef();
//     useEffect(() => {
//       ref.current = value;      // ← runs AFTER the render below returned
//     });
//     return ref.current;         // ← still holds the PREVIOUS render's value
//   }
//
// The sequence — this is the entire hook:
//
//   render #1:  ref.current is undefined → return undefined
//               ...render finishes, commits...
//               effect: ref.current = "a"
//
//   render #2:  ref.current is "a"       → return "a"   ← the previous value!
//               ...render finishes...
//               effect: ref.current = "b"
//
//   render #3:  ref.current is "b"       → return "b"
//
// Note the effect has NO dependency array. That is deliberate: it runs after
// EVERY render, so the ref always trails by exactly one.
//
// Runtime rule:
//   The return statement executes during render. The effect executes after
//   commit. That gap is where the "previous" lives.
//
// Practical rule:
//   It tracks the previous RENDER, not the previous distinct VALUE. If a
//   component re-renders for an unrelated reason, previous === current.
//
// Common trap:
//   Assigning in the render body "because it's simpler". Then you return the
//   value you just wrote. → §4


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD IT
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  const pendingEffects = [];

  // Modelling one detail that matters for §6: a setState DURING render does
  // not commit the in-progress pass. React throws that pass away and re-runs
  // the component immediately. Nothing is painted in between — which is
  // exactly why the derive-during-render pattern has no wrong frame.
  let isRendering = false;
  let needsRerender = false;

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { value: initial };
    const setState = (next) => {
      const value = typeof next === "function" ? next(hooks[slot].value) : next;
      if (Object.is(value, hooks[slot].value)) return;
      hooks[slot].value = value;
      if (isRendering) { needsRerender = true; return; }   // discard this pass
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
      hooks[slot] = { deps };
      pendingEffects.push(fn);       // ← queued. Runs AFTER the render returns.
    }
  }

  function render() {
    isRendering = true;
    let output;
    do {                             // the RENDER phase. May run more than
      needsRerender = false;         // once; only the last pass survives.
      cursor = 0;
      output = component();
    } while (needsRerender);
    isRendering = false;

    // The COMMIT. This is the only output the user ever sees.
    committed.push(output);
    while (pendingEffects.length) {  // effects run after the commit
      pendingEffects.shift()();
    }
    return output;
  }

  const committed = [];
  function mount(fn) { component = fn; return render(); }
  return { useState, useRef, useEffect, mount, render,
    getCommitted: () => committed.slice() };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE TIMING IS THE HOOK
// ══════════════════════════════════════════════════════════════════

console.log("§4 — effect vs render body:\n");

// ✅ THE REAL HOOK — assign in an effect
function correctVersion() {
  const R = createMiniReact();
  const log = [];
  let setCount;

  R.mount(() => {
    const [count, set] = R.useState(0);
    setCount = set;

    // usePrevious, inlined:
    const ref = R.useRef();
    R.useEffect(() => { ref.current = count; });   // no deps → after EVERY render
    const previous = ref.current;                   // ← read BEFORE the effect runs

    log.push({ count, previous });
    return count;
  });

  setCount(1);
  setCount(2);
  return log;
}

// 🐛 THE BROKEN VERSION — assign in the render body
function brokenVersion() {
  const R = createMiniReact();
  const log = [];
  let setCount;

  R.mount(() => {
    const [count, set] = R.useState(0);
    setCount = set;

    const ref = R.useRef();
    const previous = ref.current;
    ref.current = count;          // 🐛 assigned DURING render, right after reading

    log.push({ count, previous });
    return count;
  });

  setCount(1);
  setCount(2);
  return log;
}

const correct = correctVersion();
const broken = brokenVersion();

console.log("  count goes 0 → 1 → 2\n");
console.log("    assignment in useEffect (correct):");
for (const row of correct) {
  console.log(`      count=${row.count}  previous=${JSON.stringify(row.previous)}`);
}
console.log("\n    assignment in the render body:");
for (const row of broken) {
  console.log(`      count=${row.count}  previous=${JSON.stringify(row.previous)}`);
}

console.log("\n  They look almost identical — and that is the trap. The broken");
console.log("  version happens to be right here because it reads BEFORE it");
console.log("  writes. But it MUTATES A REF DURING RENDER, which is a real");
console.log("  violation: the render phase can be discarded or replayed, and");
console.log("  your mutation persists anyway.");
console.log("  → 01_react-fundamentals/04_react-fiber-architecture.js §8\n");

// The version people ACTUALLY write wrong — write then read:
function trulyBroken() {
  const R = createMiniReact();
  const log = [];
  let setCount;
  R.mount(() => {
    const [count, set] = R.useState(0);
    setCount = set;
    const ref = R.useRef();
    ref.current = count;          // 🐛 write FIRST
    const previous = ref.current; // 🐛 ...then read. Same value, obviously.
    log.push({ count, previous });
    return count;
  });
  setCount(1);
  setCount(2);
  return log;
}

const useless = trulyBroken();
console.log("    write-then-read in the render body:");
for (const row of useless) {
  console.log(`      count=${row.count}  previous=${JSON.stringify(row.previous)}` +
    (row.count === row.previous ? "  🐛 previous === current" : ""));
}
console.log("\n  Now the hook returns the CURRENT value and is completely");
console.log("  useless — silently. No error, no warning. Every comparison");
console.log("  `previous !== current` is false forever, so your animation never");
console.log("  triggers and your log never fires.");
console.log("\n  The effect version cannot be got wrong this way: the effect");
console.log("  physically cannot run before the return statement.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — PREVIOUS RENDER, NOT PREVIOUS VALUE
// ══════════════════════════════════════════════════════════════════
//
// The distinction that catches people, and a genuinely good interview probe.

console.log("§5 — an unrelated re-render:\n");

const R2 = createMiniReact();
const log2 = [];
let setName, setTheme;

R2.mount(() => {
  const [name, setN] = R2.useState("Vineet");
  const [theme, setT] = R2.useState("dark");
  setName = setN;
  setTheme = setT;

  const ref = R2.useRef();
  R2.useEffect(() => { ref.current = name; });
  const previousName = ref.current;

  log2.push({ name, theme, previousName, changed: previousName !== name });
  return { name, theme };
});

setName("Ankit");        // name changed
setTheme("light");       // name did NOT change, but the component re-renders

console.log("  tracking `name`, but the THEME changes on the last render:\n");
for (const row of log2) {
  console.log(`    name="${row.name}" theme="${row.theme}"` +
    ` previousName=${JSON.stringify(row.previousName)}` +
    ` → changed? ${row.changed}`);
}

console.log("\n  Look at the last row. The theme changed, name did not — and");
console.log("  previousName === name, so `changed` is false. Correct!");
console.log("\n  But that is the subtlety: usePrevious tracks the previous");
console.log("  RENDER's value, not the last DIFFERENT value. If you want 'the");
console.log("  last value that was different', this hook does not give it to");
console.log("  you — after an unrelated re-render, the previous is gone.");
console.log("\n  Concretely: name goes Vineet → Ankit → (theme re-render). If you");
console.log("  wanted to animate 'from Vineet', you missed your window: by the");
console.log("  next render previous is already 'Ankit'. That is why usePrevious");
console.log("  is a poor foundation for animation, and why libraries like");
console.log("  Framer Motion track values themselves.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — WHY REACT HAS NO BUILT-IN usePrevious
// ══════════════════════════════════════════════════════════════════
//
// It is four lines and it is in every codebase. React deliberately does not
// ship it, and the reason is the interesting part.
//
// From React's own docs (the "You Might Not Need an Effect" line of thinking):
// most usePrevious use cases are better solved by DERIVING during render.
//
//   ❌ The usePrevious approach — "did the user change?"
//     const previousUserId = usePrevious(userId);
//     useEffect(() => {
//       if (previousUserId !== userId) setSelection(null);
//     }, [userId, previousUserId]);
//
//     Two renders: one with the STALE selection, then one with it cleared.
//     The user can see the wrong selection for a frame.
//
//   ✅ Derive during render — React's documented pattern:
//     const [prevUserId, setPrevUserId] = useState(userId);
//     if (prevUserId !== userId) {
//       setPrevUserId(userId);
//       setSelection(null);          // setState DURING render — legal, and
//     }                              // React re-runs immediately without
//                                    // committing the first pass
//
//     One visible render. React explicitly supports calling setState during
//     render for exactly this "adjust state when a prop changes" case.
//
//   ✅✅ Or just use a key — usually the real answer:
//     <Profile key={userId} userId={userId} />
//     → a fresh component. No previous value needed at all.
//     → 01_react-fundamentals/05_keys-in-lists.js §7
//
// The framing:
//   "usePrevious usually means I'm reaching for 'what changed?' — which is
//    imperative thinking in a declarative system. React's answer is either
//    derive it during render, or reset with a key. The legitimate uses are
//    narrow: animating a transition between values, or debugging what changed."
//
// Legitimate uses, honestly:
//   • debugging: log which prop changed between renders
//   • animating FROM the old value TO the new one
//   • a diff-based side effect that genuinely needs both values

console.log("§6 — usePrevious vs derive-during-render:\n");

// The usePrevious + effect approach: the reset happens in an effect, which
// runs AFTER the commit — so the wrong state is committed and painted first.
function withUsePrevious() {
  const R = createMiniReact();
  let setUserId;

  R.mount(() => {
    const [userId, setU] = R.useState(1);
    const [selection, setSelection] = R.useState("item-A");
    setUserId = setU;

    const ref = R.useRef();
    R.useEffect(() => { ref.current = userId; });
    const prevUserId = ref.current;

    R.useEffect(() => {
      if (prevUserId !== undefined && prevUserId !== userId) setSelection(null);
    }, [userId, prevUserId]);

    return { userId, selection };
  });

  setUserId(2);
  return R.getCommitted();          // ← only what was actually committed
}

// The derive-during-render approach: the adjustment happens DURING render, so
// the wrong pass is discarded and never committed.
function withDerive() {
  const R = createMiniReact();
  let setUserId;

  R.mount(() => {
    const [userId, setU] = R.useState(1);
    const [prevUserId, setPrevUserId] = R.useState(1);
    const [selection, setSelection] = R.useState("item-A");
    setUserId = setU;

    // Adjust state DURING render. React discards this pass and re-runs.
    if (prevUserId !== userId) {
      setPrevUserId(userId);
      setSelection(null);
    }

    return { userId, selection };
  });

  setUserId(2);
  return R.getCommitted();
}

const viaPrevious = withUsePrevious();
const viaDerive = withDerive();

console.log("  userId changes 1 → 2. The selection must reset.\n");
console.log("    usePrevious + effect:");
for (const p of viaPrevious) {
  console.log(`      userId=${p.userId} selection=${JSON.stringify(p.selection)}` +
    (p.userId === 2 && p.selection === "item-A" ? "  🐛 user 2 with user 1's selection!" : ""));
}
console.log("\n    derive during render:");
for (const p of viaDerive) {
  console.log(`      userId=${p.userId} selection=${JSON.stringify(p.selection)}`);
}
console.log("\n  The effect version renders user 2 holding user 1's selection");
console.log("  first, THEN clears it. In a real browser that is a visible frame");
console.log("  of wrong data. The derive version never renders the wrong state");
console.log("  at all.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHAT REAL IMPLEMENTATIONS DO DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               usehooks-ts / react-use
//   ───────────               ───────────────────────
//   useEffect                 some use useLayoutEffect, so the ref is updated
//                             BEFORE paint — matters if a sibling layout
//                             effect reads it
//   ref starts undefined      some accept an initialValue so the first render
//                             is not undefined
//   n/a                       a typed version: usePrevious<T>(value: T): T |
//                             undefined — that `| undefined` is important and
//                             people fight it. It is correct: on the first
//                             render there IS no previous.
//   n/a                       usePreviousDistinct(value, compare) — the "last
//                             DIFFERENT value" that §5 showed usePrevious
//                             cannot give you
//
// The `| undefined` point is worth raising:
//   Every usePrevious returns undefined on the first render, and every
//   codebase has a `prev ?? current` somewhere to paper over it. That
//   undefined is not a flaw — it is the type system telling you the concept
//   is undefined on mount, which is exactly the kind of edge case the
//   derive-during-render pattern makes disappear.


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — previous === current, always:
//   Assigned in the render body before reading. → §4. Silent.
//
// Bug 2 — Mutating a ref during render:
//   Even the read-then-write version does this. The render can be discarded
//   and the mutation persists.
//
// Bug 3 — previous is undefined on the first render and crashes:
//   prev.name on mount. Guard it, or pass an initial value.
//
// Bug 4 — The previous value is "lost" by an unrelated re-render:
//   It tracks renders, not distinct values. → §5.
//
// Bug 5 — A visible frame of stale data:
//   usePrevious + an effect to reset state. → §6. Derive during render.
//
// Bug 6 — Animations that fire on unrelated re-renders:
//   Same root cause as bug 4. Use usePreviousDistinct or a real animation lib.
//
// Bug 7 — Using it to avoid lifting state:
//   "The parent needs to know what changed" usually means the parent should
//   own the value.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The hook works:
assert(correct[0].previous === undefined, "render #1: there IS no previous");
assert(correct[1].count === 1 && correct[1].previous === 0, "render #2: previous is 0");
assert(correct[2].count === 2 && correct[2].previous === 1, "render #3: previous is 1");
assert(correct.every(r => r.previous === undefined || r.previous === r.count - 1),
  "the ref always trails by exactly one render");

// The write-then-read version is silently useless:
assert(useless.every(r => r.previous === r.count),
  "write-then-read: previous === current on EVERY render — the hook does nothing 🐛");
assert(useless[2].previous === 2 && correct[2].previous === 1,
  "same component, same input, one returns 2 and the other returns 1");

// It tracks renders, not distinct values:
const themeRender = log2[log2.length - 1];
assert(themeRender.theme === "light", "the last render was caused by the THEME");
assert(themeRender.previousName === themeRender.name,
  "an unrelated re-render makes previous === current — the old value is GONE");
assert(themeRender.changed === false, "...so `changed` is correctly false");

// Derive-during-render avoids the wrong frame:
const badFrame = viaPrevious.find(p => p.userId === 2 && p.selection === "item-A");
assert(badFrame !== undefined,
  "usePrevious + effect: there IS a render with user 2 and user 1's selection 🐛");
assert(!viaDerive.some(p => p.userId === 2 && p.selection === "item-A"),
  "derive during render: that combination NEVER renders ✅");
assert(viaDerive.length < viaPrevious.length,
  "and it takes fewer renders to get there");

console.log("§9 — mini assertions passed for: usePrevious");
console.log("\n  The pair that matters: write-then-read returns 2 where the");
console.log("  correct hook returns 1. Same four lines, one reordering, and the");
console.log("  hook silently does nothing.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "write usePrevious", say this while writing:
//
//   "Four lines: a ref, an effect with no deps that writes value into it, and
//    return ref.current. The whole hook is the ORDER. The return runs during
//    render, the effect runs after commit — so the render reads the previous
//    value and then the effect overwrites it for next time. No dep array,
//    deliberately, so it trails by exactly one render.
//
//    The trap is doing the assignment in the render body. Write then read and
//    it returns the current value — the hook silently does nothing, every
//    `previous !== current` check is false forever, and nothing warns you. Even
//    read-then-write is wrong in principle, because you're mutating a ref
//    during render, and the render can be discarded or replayed.
//
//    A subtlety worth knowing: it tracks the previous RENDER, not the previous
//    distinct value. If the component re-renders for an unrelated reason —
//    a theme change — then previous equals current and the old value is gone.
//    So it's a weak foundation for animations.
//
//    Honestly though, I'd ask why we need it. React deliberately doesn't ship
//    it, because most uses are 'reset something when a prop changed', and
//    usePrevious plus an effect renders the wrong state for a frame first —
//    user 2 holding user 1's selection — then corrects it. React's documented
//    pattern is to adjust state DURING render, which never renders the wrong
//    state at all. Or just change the key and get a fresh component. The
//    legitimate uses are narrow: debugging what changed, and animating between
//    two values."
//
// The timing explanation plus "React deliberately omitted it" is senior.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How does usePrevious work?
// A1. Return ref.current during render; an effect with no deps writes the
//     current value after commit. The gap between them is the "previous".
//
// Q2. Why must the assignment be in an effect?
// A2. In the render body you return the value you just wrote — the hook does
//     nothing. And mutating a ref during render is unsafe: the render can be
//     discarded.
//
// Q3. Why no dependency array?
// A3. So it updates after EVERY render and always trails by exactly one.
//
// Q4. What does it return on the first render?
// A4. undefined. There is no previous. The type is T | undefined, correctly.
//
// Q5. Previous value or previous render?
// A5. Previous RENDER. An unrelated re-render makes previous === current and
//     loses the old value.
//
// Q6. Why doesn't React ship it?
// A6. Most uses are better served by deriving during render or by a key.
//     usePrevious + an effect renders the wrong state for a frame first.
//
// Q7. Is setState during render legal?
// A7. Yes, for this specific "adjust state when a prop changes" case. React
//     re-runs the component immediately without committing the first pass.
//
// Q8. When IS it the right tool?
// A8. Debugging what changed, and animating between an old and new value.
//
// Q9. What if you need the last DIFFERENT value?
// A9. usePreviousDistinct, or track it yourself. usePrevious cannot give you
//     that.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is usePrevious?
//   Back : Return the ref, THEN update it in an effect.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : The return runs during render; the effect runs after commit.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Assigning in the render body — previous === current, silently.
//
// Flashcard 4:
//   Front: Why no deps array?
//   Back : So it trails every render by exactly one.
//
// Flashcard 5:
//   Front: Previous value or previous render?
//   Back : Previous RENDER. An unrelated re-render loses the old value.
//
// Flashcard 6:
//   Front: What does React recommend instead?
//   Back : Derive during render, or reset with a key.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Say React omitted it deliberately, and show the wrong-frame problem.


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write it from memory. Four lines. Then move the assignment into the render
//   body and watch the hook silently stop working.
//
// Task 2:
//   Write usePreviousDistinct: only update the ref when the value actually
//   changed. Now §5's unrelated re-render does not lose the old value.
//
// Task 3:
//   Switch the effect to useLayoutEffect. When would that matter? (Hint: a
//   sibling layout effect reading the same ref.)
//
// Task 4:
//   Build the §6 comparison in a real component and count the paints. The
//   wrong-frame is a real, visible bug.
//
// Task 5:
//   Write useWhatChanged(props): log which keys differ from the previous
//   render. That is usePrevious's best legitimate use.
//
// Task 6:
//   Explain in 60 seconds why moving one line from an effect into the render
//   body breaks the hook without any error.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Return first, then update in an effect. The gap IS the previous value.
//
// If you remember the common bug:
//   Assigning in the render body makes previous === current — silently
//   useless, no warning.
//
// If you remember the professional framing:
//   It tracks the previous RENDER, not the previous value. React omitted it
//   deliberately — derive during render, or use a key.
//
// NEXT TOPIC -> 08_useinterval-hook.js
