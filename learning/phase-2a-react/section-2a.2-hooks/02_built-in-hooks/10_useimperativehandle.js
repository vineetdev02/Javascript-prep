// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  10_useimperativehandle.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useImperativeHandle
//
// WHAT YOU WILL MASTER HERE:
//   1. What it actually does — replace what .current exposes
//   2. Why it exists: encapsulation, not convenience
//   3. forwardRef vs React 19's ref-as-a-prop
//   4. When an imperative handle is RIGHT (the list is short)
//   5. Why this is the hook you should reach for least
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/10_useimperativehandle.js"
//
// Prerequisite: 05_useref-dom-mutable-ref.js.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useImperativeHandle:
// Lets a child component decide WHAT its parent's ref.current will be,
// instead of handing over the raw DOM node.
//
// If interviewer says "explain it simply", say:
// "Normally a ref on a component gives the parent the DOM node. This hook
//  says 'no — give them THIS object instead', with only the methods I choose
//  to expose."
//
// If interviewer asks "why does it matter?", say:
// "It is encapsulation for the imperative escape hatch. Without it, a parent
//  with a ref to your input can do anything — change styles, read values,
//  remove it from the DOM. With it, the parent gets exactly focus() and
//  clear(), and you can change your internals freely."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   a public API for the imperative escape hatch
//
// The default:
//
//   <input ref={inputRef} />       → inputRef.current = the DOM node
//                                    (the parent gets EVERYTHING)
//
// With an imperative handle:
//
//   useImperativeHandle(ref, () => ({ focus, clear }), []);
//                                  → ref.current = { focus, clear }
//                                    (the parent gets only what you chose)
//
// Runtime rule:
//   The factory runs during the LAYOUT phase — same timing as
//   useLayoutEffect, before paint. So the parent can use the handle in its
//   own layout effect. And the deps array works exactly like useMemo's: if
//   deps change, the handle object is REBUILT, and ref.current becomes a new
//   object.
//
// Practical rule:
//   Try props first. Then try props again. This hook is for the small set of
//   things that genuinely cannot be expressed declaratively.
//
// Common trap:
//   Using it to let a parent "call a method" on a child instead of passing
//   a prop. That is React written backwards, and it breaks the moment the
//   child needs to re-render from the same action.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD IT
// ══════════════════════════════════════════════════════════════════

function createMiniReact() {
  const hooks = [];
  let cursor = 0;

  function useRef(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) hooks[slot] = { current: initial };
    return hooks[slot];
  }

  // ── THE WHOLE HOOK ──────────────────────────────────────────────
  function useImperativeHandle(ref, factory, deps) {
    const slot = cursor++;
    const prev = hooks[slot];
    const changed = !prev || !deps ||
      deps.some((d, i) => !Object.is(d, prev.deps[i]));

    if (changed) {
      hooks[slot] = { deps, handle: factory() };
    }
    // The assignment. This is the entire feature: React would have set
    // ref.current = domNode; we overwrite it with our own object.
    if (ref) ref.current = hooks[slot].handle;
  }
  // Note: in real React this runs during the layout phase, and React sets
  // ref.current back to null on unmount.

  function reset() { cursor = 0; }

  return { useRef, useImperativeHandle, reset };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — RAW NODE vs CURATED HANDLE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — what the parent can reach:\n");

// A fake DOM node, with everything a real one has:
function createFakeInput() {
  return {
    tagName: "INPUT",
    value: "",
    style: { color: "black" },
    focus: () => "focused",
    blur: () => "blurred",
    remove: () => "REMOVED FROM THE DOM",
    setAttribute: () => "attribute changed",
  };
}

// ── WITHOUT useImperativeHandle: the parent gets the raw node ────
const rawRef = { current: createFakeInput() };

console.log("  <input ref={ref} />  → the parent's ref.current is the DOM node:");
console.log("    available:", Object.keys(rawRef.current).join(", "));
console.log("    parent can do: ref.current.remove()      →",
  rawRef.current.remove());
console.log("    parent can do: ref.current.style.color = 'red'");
console.log("    parent can do: ref.current.value = 'anything'");
console.log("    🐛 Your component's internals are the parent's playground.\n");

// ── WITH useImperativeHandle: only what you expose ──────────────
const R = createMiniReact();
const curatedRef = { current: null };

function FancyInput(ref) {
  R.reset();
  const innerRef = R.useRef(createFakeInput());

  R.useImperativeHandle(ref, () => ({
    focus: () => innerRef.current.focus(),
    clear: () => { innerRef.current.value = ""; return "cleared"; },
    // Note what is NOT here: remove, style, setAttribute, the node itself.
  }), []);

  return innerRef;
}

FancyInput(curatedRef);

console.log("  useImperativeHandle(ref, () => ({ focus, clear }))");
console.log("    available:", Object.keys(curatedRef.current).join(", "));
console.log("    parent can do: ref.current.focus() →", curatedRef.current.focus());
console.log("    parent can do: ref.current.clear() →", curatedRef.current.clear());
console.log("    parent CANNOT do: ref.current.remove →",
  curatedRef.current.remove, "(undefined)");
console.log("    ✅ A real API boundary. You can swap the <input> for a");
console.log("       <textarea> tomorrow and no parent breaks.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — forwardRef, AND WHY REACT 19 KILLED IT
// ══════════════════════════════════════════════════════════════════
//
// The historical context interviewers probe for.
//
// THE PROBLEM (React ≤18):
//   ref was NOT a prop. It was lifted out of props alongside key
//   (→ 01_jsx-compilation.js §4). So this silently did nothing:
//
//     function MyInput(props) {
//       return <input ref={props.ref} />;   // props.ref is ALWAYS undefined
//     }
//
//   You needed forwardRef to receive it as a second argument:
//
//     const MyInput = forwardRef((props, ref) => <input ref={ref} />);
//
//   And to customize it:
//
//     const FancyInput = forwardRef((props, ref) => {
//       const inputRef = useRef(null);
//       useImperativeHandle(ref, () => ({ focus: () => inputRef.current.focus() }), []);
//       return <input ref={inputRef} />;
//     });
//
// REACT 19:
//   ref is now a NORMAL PROP for function components.
//
//     function MyInput({ ref, ...props }) {
//       return <input ref={ref} />;         // just works
//     }
//
//   forwardRef is deprecated and there is a codemod. useImperativeHandle
//   still exists and still works — it just takes the ref from props now:
//
//     function FancyInput({ ref }) {
//       const inputRef = useRef(null);
//       useImperativeHandle(ref, () => ({ focus: ... }), []);
//       return <input ref={inputRef} />;
//     }
//
// The interview line:
//   "forwardRef existed because ref was not a prop. React 19 made it a prop,
//    so forwardRef is deprecated. useImperativeHandle is unaffected — it was
//    never about plumbing the ref, it was about controlling what the ref
//    exposes. People conflate the two."

console.log("§5 — why props.ref used to be undefined:\n");

function createElement(type, config) {
  const props = {};
  let ref = null;
  for (const key in config) {
    if (key === "ref") ref = config[key];       // ← React ≤18: lifted OUT
    else props[key] = config[key];
  }
  return { type, ref, props };
}

const el = createElement("MyInput", { ref: { current: null }, placeholder: "hi" });
console.log("  React ≤18 — createElement lifts ref out of props:");
console.log("    element.props:", JSON.stringify(Object.keys(el.props)));
console.log("    element.ref  :", el.ref ? "the ref object" : "null");
console.log("    props.ref    :", el.props.ref, "← THIS is why forwardRef existed\n");

function createElement19(type, config) {
  const props = { ...config };                  // ← React 19: ref stays IN
  return { type, props };
}
const el19 = createElement19("MyInput", { ref: { current: null }, placeholder: "hi" });
console.log("  React 19 — ref is a normal prop:");
console.log("    element.props:", JSON.stringify(Object.keys(el19.props)));
console.log("    props.ref    :", el19.props.ref ? "the ref object ✅" : "undefined");
console.log("    → forwardRef deprecated. useImperativeHandle unchanged.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — WHEN IT IS ACTUALLY RIGHT
// ══════════════════════════════════════════════════════════════════
//
// The list is genuinely short, and that is the point of the answer.
//
//   ✅ LEGITIMATE — things with NO declarative equivalent:
//     • focus() / blur() / select() — "focus this field" is an ACTION, not a
//       state. A `shouldFocus` prop is a well-known anti-pattern: you have to
//       flip it back, and it breaks if you focus twice in a row.
//     • scrollIntoView() on a specific item
//     • play() / pause() / seek() on a media component
//     • a canvas/chart component exposing redraw() or exportPNG()
//     • .validate() or .reset() on a form component whose state is internal
//     • opening a <dialog> via showModal()
//
//   ❌ NOT legitimate — use props:
//     • setValue() → make it controlled, or pass defaultValue
//     • setVisible() → pass an `open` prop
//     • refresh() → change a key, or lift the state up
//     • getData() → the parent should own the data, or use a callback prop
//
// The test:
//   "Is this a STATE the parent describes, or an ACTION the parent fires
//    once at a moment in time?"
//     State  → prop.
//     Action → maybe an imperative handle. Try a prop first anyway.
//
// Why "actions" resist props:
//   Props are declarative — they describe what IS. Focus is not a state you
//   are in; it is a thing that HAPPENS. Encoding a one-shot event as a
//   boolean prop means you must reset the boolean, which means the parent
//   now owns a piece of state that means nothing. That awkwardness is the
//   signal that an imperative handle is correct.

console.log("§6 — the shouldFocus anti-pattern:\n");

// The prop version of an action — watch it fall apart.
//
// The child can only react to the prop through an effect:
//   useEffect(() => { if (shouldFocus) inputRef.current.focus(); }, [shouldFocus]);
// ...and that effect only runs when the DEP CHANGES. That gating is the
// whole problem, so we have to model it honestly.
function propBasedFocus() {
  const log = [];
  let prevDep;
  let shouldFocus = false;

  const renderChild = () => {
    const depChanged = !Object.is(shouldFocus, prevDep);
    prevDep = shouldFocus;
    if (depChanged && shouldFocus) log.push("focused");   // the effect body
  };

  shouldFocus = true;  renderChild();   // request 1 → false→true → focused ✅
  shouldFocus = false; renderChild();   // the parent MUST reset the flag...
  shouldFocus = true;  renderChild();   // request 2 → false→true → focused ✅
  shouldFocus = true;  renderChild();   // request 3 → true→true → NOTHING 🐛
  return log;
}

const imperativeLog = [];
const imperativeFocus = () => imperativeLog.push("focused");
imperativeFocus();
imperativeFocus();
imperativeFocus();

console.log("  <Input shouldFocus={true} /> — focus as a PROP:");
console.log("    3 focus requests →", propBasedFocus().length, "focuses");
console.log("    🐛 the parent must reset the flag, and setting true→true");
console.log("       does nothing. You have modelled an event as a state.");
console.log("\n  ref.current.focus() — focus as an ACTION:");
console.log("    3 focus requests →", imperativeLog.length, "focuses ✅");
console.log("    Each call does exactly what it says, every time.");
console.log("\n  THIS is the argument. Not 'imperative is easier'. It is that");
console.log("  some things are events, and props cannot model events.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHY YOU SHOULD REACH FOR IT LEAST
// ══════════════════════════════════════════════════════════════════
//
// Be honest about the costs. This is what separates a good answer.
//
//   1. IT BREAKS THE DATA FLOW MODEL. React's whole value is that you can
//      look at props and know what a component will do. An imperative handle
//      means the parent can change the child at any time, from anywhere, and
//      it will not show up in a render trace.
//
//   2. IT DOES NOT COMPOSE. A prop can be passed down five levels, spread,
//      or defaulted. A ref cannot — every intermediate layer has to forward
//      it deliberately.
//
//   3. IT IS INVISIBLE TO CONCURRENT REACT. A method call is not a state
//      update. It cannot be batched, deprioritized, interrupted, or replayed.
//      Call ref.current.scrollTo() during a transition and it fires
//      immediately, against a DOM that may be mid-update.
//
//   4. IT IS HARDER TO TEST. Props are inputs; you pass them. Handles need a
//      ref, a mount, and a call at the right time.
//
//   5. TIMING TRAPS. ref.current is null during render and after unmount.
//      Every call site needs a guard: ref.current?.focus().
//
// The senior framing:
//   "useImperativeHandle is the hook I write the least. When I reach for it,
//    I first ask whether I am fighting the declarative model — usually I am,
//    and lifting state up is the real fix. But focus, scroll, and media
//    playback are genuinely imperative, and pretending otherwise with a
//    shouldFocus prop produces worse code."


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real React
//   ───────────               ──────────
//   assigns ref.current       runs in the LAYOUT phase (pre-paint), and
//   inline                    supports callback refs too — ref(handle)
//                             instead of ref.current = handle
//   never cleans up           sets ref.current = null on unmount, and calls
//                             the callback ref with null
//   n/a                       if deps change, the handle is REBUILT — so a
//                             parent holding onto ref.current from before is
//                             holding a stale object. Prefer [] and read
//                             fresh values through refs inside the methods.
//   n/a                       React 19: ref is a prop; forwardRef deprecated
//                             with a codemod. useImperativeHandle unchanged.
//   n/a                       dev warning if you pass ref to a component that
//                             does not forward it (React ≤18)
//
// The deps subtlety is a real bug source:
//   useImperativeHandle(ref, () => ({ save: () => api.save(value) }), [value])
//   Every value change makes a NEW handle object. Any parent that cached
//   ref.current now calls a stale method. Use [] plus a valueRef instead.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "ref.current is null":
//   Called during render, or after unmount. Guard with ref.current?.focus().
//
// Bug 2 — props.ref is undefined (React ≤18):
//   You forgot forwardRef. → §5.
//
// Bug 3 — A stale method on a cached handle:
//   Non-empty deps rebuilt the handle. → §8.
//
// Bug 4 — The parent calls setValue() and the child does not re-render:
//   You mutated internal state imperatively without a setState. The whole
//   reason setValue() should have been a prop.
//
// Bug 5 — Refs do not compose through a wrapper:
//   Each layer must forward deliberately. Three wrappers, three forwards.
//
// Bug 6 — Imperative calls fighting a transition:
//   A method call is not a state update, so React cannot schedule it.
//
// Bug 7 — Exposing the raw node "just in case":
//   useImperativeHandle(ref, () => inputRef.current, []) — you wrote the
//   hook and threw away the entire benefit.
//
// Bug 8 — Using it to avoid lifting state up:
//   The parent needs the child's value, so it calls ref.current.getValue().
//   Now the value has two owners and they will disagree. Lift it.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// Encapsulation:
assert(typeof rawRef.current.remove === "function",
  "a raw node ref exposes EVERYTHING, including remove()");
assert(curatedRef.current.remove === undefined,
  "the imperative handle exposes ONLY what you chose");
assert(Object.keys(curatedRef.current).length === 2,
  "exactly two methods — a real API surface");
assert(curatedRef.current.focus() === "focused", "and they work");

// ref is not a prop (≤18):
assert(el.props.ref === undefined,
  "React ≤18: createElement lifts ref out of props — hence forwardRef");
assert(el.ref !== null, "...it goes on element.ref instead");
assert(el19.props.ref !== undefined,
  "React 19: ref stays in props — forwardRef is no longer needed");

// The shouldFocus anti-pattern:
assert(propBasedFocus().length === 2,
  "3 focus requests via a prop → only 2 focuses. true→true changes nothing.");
assert(imperativeLog.length === 3,
  "3 imperative calls → 3 focuses. Events need a method, not a prop.");

// Deps rebuild the handle:
const R2 = createMiniReact();
const ref2 = { current: null };
function Comp(value) {
  R2.reset();
  R2.useImperativeHandle(ref2, () => ({ save: () => value }), [value]);
}
Comp("a");
const handle1 = ref2.current;
Comp("a");
assert(ref2.current === handle1, "same deps → the same handle object");
Comp("b");
assert(ref2.current !== handle1,
  "changed deps → a NEW handle. A parent caching ref.current now has a stale one 🐛");
assert(handle1.save() === "a" && ref2.current.save() === "b",
  "...and the old handle still returns the OLD value. This is the deps trap.");

console.log("§10 — mini assertions passed for: useImperativeHandle");
console.log("\n  The sharpest pair: 3 prop-based focus requests → 2 focuses.");
console.log("  3 imperative calls → 3 focuses. Props cannot model events.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is useImperativeHandle?", answer like this:
//
//   "It lets a child decide what the parent's ref.current will be, instead of
//    the raw DOM node. So instead of handing the parent an <input> — where
//    they can change styles, read values, or remove it from the DOM — I expose
//    exactly { focus, clear }. It's encapsulation for the imperative escape
//    hatch, and it means I can swap the input for a textarea without breaking
//    any parent.
//
//    On history: forwardRef existed because ref wasn't a prop — createElement
//    lifted it out alongside key, so props.ref was always undefined. React 19
//    made ref a normal prop, so forwardRef is deprecated with a codemod.
//    useImperativeHandle is unaffected, because it was never about plumbing
//    the ref — it's about controlling what the ref exposes. People conflate
//    those two.
//
//    On when to use it: the test I apply is whether the parent is describing
//    a STATE or firing an ACTION. State means a prop. Focus is an action —
//    it's not a state you're in, it's a thing that happens. If you model it
//    as shouldFocus, the parent has to reset the flag, and setting true to
//    true twice does nothing, so two focus requests in a row silently fail.
//    That awkwardness is the signal. Same for scrollIntoView, play/pause, or
//    a chart's redraw.
//
//    Honestly though, it's the hook I write least. It breaks the data flow
//    model, refs don't compose through wrappers, and a method call is
//    invisible to concurrent React — it can't be batched or interrupted. Most
//    times I reach for it, lifting state up is the real fix."
//
// The state-vs-action test plus the honest cost list is the senior answer.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does it do?
// A1. Replaces what ref.current exposes with an object you define.
//
// Q2. Why did forwardRef exist?
// A2. ref was not a prop — it was lifted out by createElement, like key. React
//     19 made it a prop, so forwardRef is deprecated.
//
// Q3. Is useImperativeHandle deprecated too?
// A3. No. It solves a different problem — what the ref exposes, not how it
//     reaches the component.
//
// Q4. When is it justified?
// A4. Actions with no declarative equivalent: focus, blur, select, scrollIntoView,
//     play/pause, canvas redraw, form validate/reset.
//
// Q5. Why not a shouldFocus prop?
// A5. Focus is an event, not a state. The parent must reset the flag, and
//     true→true does nothing, so repeated requests fail silently.
//
// Q6. When does the factory run?
// A6. In the layout phase, before paint — so a parent's layout effect can use
//     the handle.
//
// Q7. What do the deps do?
// A7. Same as useMemo. Changed deps rebuild the handle, so a parent holding
//     the old object has stale methods. Prefer [] and read via refs inside.
//
// Q8. What are the costs?
// A8. It breaks data flow, refs do not compose, method calls are invisible to
//     concurrent React, and testing is harder.
//
// Q9. Why not just expose the node?
// A9. Then you have written the hook and kept none of the benefit. The point
//     is the boundary.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useImperativeHandle?
//   Back : The child decides what ref.current is. An API, not a DOM node.
//
// Flashcard 2:
//   Front: Why did forwardRef exist?
//   Back : ref was not a prop. React 19 made it one — forwardRef deprecated.
//
// Flashcard 3:
//   Front: The decision test?
//   Back : State the parent describes → prop. Action the parent fires → maybe
//          a handle.
//
// Flashcard 4:
//   Front: Why is shouldFocus an anti-pattern?
//   Back : Focus is an event. true→true does nothing, and you must reset it.
//
// Flashcard 5:
//   Front: What is the most common trap?
//   Back : Non-empty deps rebuild the handle → the parent caches a stale one.
//
// Flashcard 6:
//   Front: When does the factory run?
//   Back : Layout phase, before paint. Same timing as useLayoutEffect.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Name the costs — no composition, invisible to concurrent React —
//          and say you reach for it least.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write useImperativeHandle from memory. It is useMemo plus one assignment.
//
// Task 2:
//   Add unmount: set ref.current = null. Then add a guard at every call site
//   and feel why ref.current?.focus() is everywhere in real code.
//
// Task 3:
//   Fix the §10 deps trap: use [] plus a valueRef that the save() method
//   reads. Confirm the handle identity is now stable AND the value is fresh.
//
// Task 4:
//   Add callback ref support: if ref is a function, call ref(handle) instead
//   of assigning. That is what real React does.
//
// Task 5:
//   Take the §6 anti-pattern and try to make shouldFocus work correctly.
//   You will end up with a counter or a nonce. Now you have PROVEN why the
//   imperative version exists.
//
// Task 6:
//   Explain in 60 seconds why focus() cannot be a prop, to someone who just
//   added shouldFocus to your component library.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The child decides what ref.current is. It is an API boundary for the
//   escape hatch.
//
// If you remember the common bug:
//   Non-empty deps rebuild the handle and strand a cached one. And modelling
//   an action as a boolean prop silently drops repeated requests.
//
// If you remember the professional framing:
//   State → prop. Action → maybe a handle. It breaks data flow and does not
//   compose, so it is the hook you should write least.
//
// NEXT TOPIC -> 11_usedeferredvalue.js
