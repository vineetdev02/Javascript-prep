// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  09_forwarding-refs.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Forwarding Refs
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: REF IS NOT A PROP
//   2. Why a ref on a function component is silently null
//   3. forwardRef's (props, ref) signature, and refs through N wrappers
//   4. useImperativeHandle — shrinking what the parent can reach
//   5. Ref attachment TIMING, and the inline callback-ref double call
//   6. React 19: ref as a prop, ref cleanup functions, forwardRef deprecated
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/09_forwarding-refs.js"
//
// Prerequisites: 02_built-in-hooks/05_useref-dom-mutable-ref.js and
// 02_built-in-hooks/10_useimperativehandle.js.
//
// 03 §6.2 left a debt: an HOC cannot forward a ref, because {...props} does
// not contain one. This file pays it. It is also the thing that makes 01's
// compound components and 11's headless components usable — a wrapper that
// swallows refs is not a transparent wrapper.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Forwarding refs:
// Letting a component pass a `ref` it was given down to a DOM node (or another
// component) inside it, so the caller can reach the real element.
//
//   const Input = React.forwardRef(function Input(props, ref) {
//     return <input ref={ref} {...props} />;      // ← hand it to the real node
//   });
//
//   const inputRef = useRef(null);
//   <Input ref={inputRef} />;   inputRef.current.focus();   // ✅ works
//
// If interviewer says "explain it simply", say:
// "By default a ref stops at your component — React can't guess which of the
//  ten elements inside it you meant. forwardRef says 'this one', and hands the
//  ref through to a specific node."
//
// If interviewer asks "why does it matter?", say:
// "Because `ref` isn't a prop. React strips it out of props before your
//  component runs — it's handled specially, like `key`. So spreading
//  {...props} does not forward it, which is why refs silently die inside every
//  wrapper, HOC and design-system component that doesn't explicitly forward
//  them. In React 19 that finally changed: ref is a normal prop for function
//  components and forwardRef is deprecated."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   REF IS NOT A PROP (React ≤18). Neither is `key`.
//
// Runtime rule:
//   <Comp ref={r} /> → React removes `ref` from props and stores it on the
//   element. A plain function component never sees it. A forwardRef component
//   receives it as the SECOND argument. A host element (<input>) gets its DOM
//   node written into ref.current during the COMMIT phase.
//
// Practical rule:
//   Any component that wraps a DOM element and is meant to be used like one —
//   Button, Input, Card, anything in a design system — must forward its ref.
//   Otherwise focus management, scrolling, measuring, tooltips, form libraries
//   and animation libraries all break at your component.
//
// Common trap:
//   `console.log(props.ref)` → undefined, and React ≤18 warns
//   "Function components cannot be given refs." The ref is not missing; it was
//   never in props.
//
// The mental picture:
//
//   <Input ref={r} />
//        │
//        ├── props  = { placeholder, onChange, … }   ← ref is NOT here
//        └── element.ref = r                          ← stored beside props
//                              │
//         forwardRef((props, ref) => <input ref={ref} />)
//                              └──→ commit phase: r.current = <input> DOM node


// ══════════════════════════════════════════════════════════════════
// § 3 — THE PROBLEM: A REF THAT GOES NOWHERE
// ══════════════════════════════════════════════════════════════════

console.log("§3 — where the ref actually goes:\n");

// ── a small React that models ref exactly as React does ───────────
const FORWARD_REF = Symbol("forwardRef");

function h(type, props, ...children) {
  const p = { ...(props || {}) };
  const ref = p.ref;
  delete p.ref;                       // ← React strips it. THE fact.
  const kids = children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false);
  if (kids.length) p.children = kids.length === 1 ? kids[0] : kids;
  return { type, props: p, ref };
}

function createRef() { return { current: null }; }
function forwardRef(render) { return { $$typeof: FORWARD_REF, render, name: render.name }; }

function createRenderer() {
  const warnings = [];
  const attachments = [];              // ordered log of ref writes
  function domNode(tag) {
    return {
      tag,
      value: "",
      focus() { this._focused = true; },
      blur() {}, scrollIntoView() {}, select() {},
      style: {}, classList: {}, remove() {},
    };
  }
  function attach(ref, value, label) {
    if (!ref) return;
    if (typeof ref === "function") { ref(value); attachments.push(`${label}:callback`); return; }
    ref.current = value;
    attachments.push(`${label}:${value ? "node" : "null"}`);
  }
  function render(node) {
    if (node === null || node === undefined || node === false) return [];
    if (typeof node === "string" || typeof node === "number") return [String(node)];
    if (Array.isArray(node)) return node.flatMap(render);
    const { type, props, ref } = node;

    if (type && type.$$typeof === FORWARD_REF) {
      return render(type.render(props, ref));          // ← ref as the 2nd argument
    }
    if (typeof type === "function") {
      if (ref) warnings.push(`Warning: Function components cannot be given refs. Check the render method of ${type.name}.`);
      return render(type(props));                       // the ref is dropped 🐛
    }
    // host element: React writes the DOM node during commit
    const out = [`<${type}>`, ...render(props.children), `</${type}>`];
    attach(ref, domNode(type), type);
    return out;
  }
  return { render, warnings: () => warnings, attachments: () => attachments };
}

// ❌ A plain function component. This is 90% of every design system's v1.
function PlainInput(props) {
  return h("input", { placeholder: props.placeholder });
}

const r1 = createRenderer();
const plainRef = createRef();
const seenProps = [];
function Probe(props) { seenProps.push(Object.keys(props)); return h("input", null); }

r1.render(h(PlainInput, { ref: plainRef, placeholder: "email" }));
r1.render(h(Probe, { ref: createRef(), placeholder: "email", onChange: () => {} }));

console.log("    props the component actually received:", JSON.stringify(seenProps[0]));
console.log("    is `ref` among them?                 :", seenProps[0].includes("ref"), "← never");
console.log("    ref.current after render             :", plainRef.current);
console.log("    React's warning                      :");
console.log("      " + r1.warnings()[0]);
console.log("\n  Note what this breaks the moment your Button is a wrapper:");
console.log("    • autofocus on mount, and focus restoration after a modal closes");
console.log("    • scrollIntoView on a validation error");
console.log("    • measuring for a tooltip/popover anchor");
console.log("    • react-hook-form's register(), which needs the input node");
console.log("    • Framer Motion, drag libraries, IntersectionObserver targets");
console.log("\n  All of it fails silently — ref.current is just null. → §10 Bug 1\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — forwardRef: THE SECOND ARGUMENT
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the fix, and what it proves:\n");

const FancyInput = forwardRef(function FancyInput(props, ref) {
  //                                     ^^^^^^^^^^^^  props first, ref second
  return h("input", { ref, placeholder: props.placeholder });
});

const r2 = createRenderer();
const fancyRef = createRef();
r2.render(h(FancyInput, { ref: fancyRef, placeholder: "email" }));

console.log("    ref.current after render:", fancyRef.current && `<${fancyRef.current.tag}> DOM node`);
console.log("    can the caller focus it?:", typeof fancyRef.current.focus === "function");
fancyRef.current.focus();
console.log("    focused                 :", fancyRef.current._focused === true, "✅");
console.log("    warnings                :", r2.warnings().length);

console.log("\n  Two details interviewers probe:");
console.log("    • forwardRef's render function takes exactly TWO arguments. There");
console.log("      is no third; if you need more, they are props.");
console.log("    • the ref can point at anything you choose — a DOM node, or the");
console.log("      object you build with useImperativeHandle (§6). The caller does");
console.log("      not get to pick; YOU decide what `ref` means for your component.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THROUGH LAYERS: EVERY WRAPPER MUST OPT IN
// ══════════════════════════════════════════════════════════════════

console.log("§5 — a ref survives only as far as the first wrapper that drops it:\n");

// A realistic design-system stack: Field wraps Control wraps the <input>.
// One missing forwardRef anywhere in the chain and the whole thing is null.

const Level3 = forwardRef(function Level3(props, ref) { return h("input", { ref }); });
const Level2Good = forwardRef(function Level2Good(props, ref) { return h(Level3, { ref }); });
const Level1Good = forwardRef(function Level1Good(props, ref) { return h(Level2Good, { ref }); });

function Level2Bad(props) { return h(Level3, null); }                       // 🐛 swallows it
const Level1Bad = forwardRef(function Level1Bad(props, ref) { return h(Level2Bad, { ref }); });

const rGood = createRenderer(), rBad = createRenderer();
const goodRef = createRef(), badRef = createRef();
rGood.render(h(Level1Good, { ref: goodRef }));
rBad.render(h(Level1Bad, { ref: badRef }));

console.log("    3 wrappers, all forwarding      → ref.current:", goodRef.current ? `<${goodRef.current.tag}>` : null, "✅");
console.log("    3 wrappers, middle one does not → ref.current:", badRef.current, "🐛");
console.log("    warnings from the broken chain  :", rBad.warnings().length, "(React tells you WHERE:)");
console.log("      " + rBad.warnings()[0]);

// memo + forwardRef — the ordering question:
//
//   ✅ memo(forwardRef(Comp))    the usual, and what most libraries ship
//   ✅ forwardRef(memo(Comp))    also legal
//   ❌ memo(Comp) where Comp is a plain function, then passing a ref → dropped
//
// memo does forward refs through to the component it wraps, so either order
// works. The practical difference is only the DevTools name and how your types
// infer. Say "either order works; memo(forwardRef(X)) is conventional" and
// move on.
console.log("\n  The rule to state: forwarding is not transitive by default. EVERY");
console.log("  layer between the caller and the DOM node has to opt in, which is");
console.log("  exactly why an HOC written without forwardRef silently breaks refs.");
console.log("  → 03_higher-order-components-hoc.js §6.2\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — useImperativeHandle: SHRINK WHAT YOU EXPOSE
// ══════════════════════════════════════════════════════════════════

console.log("§6 — handing back an API instead of a DOM node:\n");

// Forwarding the raw node makes the whole DOM element part of your public API.
// The caller can now do node.style.display = "none", node.remove(), read
// node.value directly and bypass your state entirely — and none of that will
// show up in a type error when you rewrite the internals.
//
//   const Input = forwardRef(function Input(props, ref) {
//     const inner = useRef(null);
//     useImperativeHandle(ref, () => ({
//       focus: () => inner.current.focus(),
//       clear: () => { inner.current.value = ""; props.onChange?.(""); },
//     }), []);
//     return <input ref={inner} {...props} />;
//   });

function useImperativeHandle(ref, factory) {
  const handle = factory();
  if (typeof ref === "function") ref(handle);
  else if (ref) ref.current = handle;
  return handle;
}

const SafeInput = forwardRef(function SafeInput(props, ref) {
  const inner = createRef();
  const node = { tag: "input", value: "", focus() { this._focused = true; } };
  inner.current = node;
  useImperativeHandle(ref, () => ({
    focus: () => inner.current.focus(),
    clear: () => { inner.current.value = ""; },
  }));
  return h("input", null);
});

const r3 = createRenderer();
const rawRef = createRef(), safeRef = createRef();
r3.render(h(FancyInput, { ref: rawRef }));
r3.render(h(SafeInput, { ref: safeRef }));

const rawSurface = Object.keys(rawRef.current).length;
const safeSurface = Object.keys(safeRef.current).length;

console.log("    forwarding the DOM node → the caller can reach", rawSurface, "properties");
console.log("      including:", Object.keys(rawRef.current).filter(k => ["style", "remove", "value", "classList"].includes(k)).join(", "), "🐛");
console.log("    useImperativeHandle     → the caller can reach", safeSurface, ":",
  Object.keys(safeRef.current).join(", "), "✅");
console.log("    reduction in public surface:", rawSurface - safeSurface, "properties");

safeRef.current.focus();
console.log("    and the API still works :", true);

console.log("\n  When to use which, said plainly:");
console.log("    • forward the raw node when your component IS the element —");
console.log("      a styled <input>, a <Button>. Callers expect DOM semantics.");
console.log("    • use useImperativeHandle when the component owns behaviour the");
console.log("      caller should trigger but not reimplement: a video player's");
console.log("      play()/seek(), a form's submit()/reset(), a carousel's next().");
console.log("    • and remember the dependency array — an empty one means the");
console.log("      handle is built once and closes over the FIRST render's props.");
console.log("      → 02_built-in-hooks/10_useimperativehandle.js\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — TIMING, AND THE INLINE CALLBACK-REF BUG
// ══════════════════════════════════════════════════════════════════

console.log("§7 — when does ref.current become the node?\n");

// Order within one commit, child → parent:
//
//   1. child ref attached          ref.current = node
//   2. child useLayoutEffect
//   3. parent ref attached
//   4. parent useLayoutEffect      ← the earliest a parent can measure a child
//   5. paint
//   6. useEffect (child, then parent)
//
// So during RENDER, ref.current is still null. Reading it in the render body
// is the classic mistake — and in StrictMode the first render's null is the
// one you will see.

const timeline = [];
timeline.push("1. child ref attached (ref.current = node)");
timeline.push("2. child useLayoutEffect");
timeline.push("3. parent ref attached");
timeline.push("4. parent useLayoutEffect  ← first safe place to measure");
timeline.push("5. browser paint");
timeline.push("6. useEffect (child, then parent)");
timeline.forEach(t => console.log("    " + t));

// ── the inline callback-ref bug ───────────────────────────────────
//
//   ❌ <input ref={node => setNode(node)} />       new function every render
//   ✅ const setNode = useCallback(node => …, []);
//
// A callback ref's identity is compared across renders. A new function means
// React detaches the old one (calls it with null) and attaches the new one
// (calls it with the node) on EVERY render.

function simulateCallbackRefRenders(makeRef, renders) {
  const calls = [];
  let previous = null;
  for (let i = 0; i < renders; i++) {
    const next = makeRef();
    if (previous !== next) {
      if (previous) calls.push("null");     // detach the old callback
      calls.push("node");                   // attach the new one
      previous = next;
    }
  }
  return calls;
}

const inlineCalls = simulateCallbackRefRenders(() => (node => node), 3);   // 🐛 new each time
const stableFn = node => node;
const stableCalls = simulateCallbackRefRenders(() => stableFn, 3);          // ✅ useCallback

console.log("\n    3 renders with a callback ref:");
console.log("      inline arrow  → ref called with:", JSON.stringify(inlineCalls), "🐛", inlineCalls.length, "calls");
console.log("      stable (useCallback) → ref called with:", JSON.stringify(stableCalls), "✅", stableCalls.length, "call");

console.log("\n  Harmless if the callback only stores the node. NOT harmless if it");
console.log("  starts an observer, measures, or sets state — you now do that work");
console.log("  on every render, and any state you set from it loops.");
console.log("\n  Also: React ≤18 calls a callback ref with null on unmount, and that");
console.log("  is your only cleanup hook. React 19 lets the callback RETURN a");
console.log("  cleanup function instead, like an effect. §8.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — REACT 19: ref BECAME A PROP
// ══════════════════════════════════════════════════════════════════
//
// This is the current-events part of the question, and it is worth being
// precise about.
//
//   React ≤18                          React 19
//   ─────────                          ────────
//   ref is stripped from props         ref is a NORMAL prop for function
//                                        components
//   forwardRef required                forwardRef DEPRECATED (still works;
//                                        a codemod removes it)
//   callback ref: called with null      callback ref may RETURN a cleanup
//     on unmount                          function
//
//   // React 19:
//   function Input({ ref, ...props }) {     // ← just a prop
//     return <input ref={ref} {...props} />;
//   }
//
//   // React 19 callback ref with cleanup:
//   <div ref={node => {
//     const ro = new ResizeObserver(…); ro.observe(node);
//     return () => ro.disconnect();          // ← no more `if (node === null)`
//   }} />
//
// What did NOT change, and is the reason this whole file still matters:
//   • class components still need forwardRef — ref on a class is the instance
//   • a wrapper that does not pass `ref` down still swallows it; {...props}
//     now DOES carry it, which is the actual improvement
//   • timing, useImperativeHandle and the callback-ref identity rule are all
//     unchanged
//
// Interview-safe phrasing: "In React 19 ref is a regular prop for function
// components and forwardRef is deprecated, so wrappers that spread props
// forward refs for free. Everything before 19 — and every class component —
// still needs forwardRef, and the timing rules are the same either way."


// ══════════════════════════════════════════════════════════════════
// § 9 — WHEN TO REACH FOR A REF AT ALL
// ══════════════════════════════════════════════════════════════════
//
// Refs are an escape hatch from declarative UI. Legitimate uses are narrow:
//
//   ✅ focus, text selection, scrollIntoView
//   ✅ measuring layout (getBoundingClientRect, ResizeObserver)
//   ✅ imperative media: play(), pause(), seek()
//   ✅ integrating a non-React library that wants a DOM node
//   ✅ storing a mutable value that must not trigger a render (timer ids)
//
//   ❌ reading an input's value instead of controlling it → 12
//   ❌ toggling classes or styles imperatively — that is state
//   ❌ forcing a child to re-render from a parent
//   ❌ reaching into a child's internals because the props API is awkward.
//      If the parent needs to command the child, either lift the state or
//      design an explicit imperative handle (§6). A ref is not a shortcut
//      around a bad API; it is a bigger public API.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — ref.current is null and nothing warns (React 19) or one warning
//   scrolls past (≤18): a wrapper in the chain does not forward. → §3, §5.
//
// Bug 2 — "Function components cannot be given refs":
//   The literal version of Bug 1. React even names the component. → §3.
//
// Bug 3 — Focus management breaks only in production:
//   A dev-only conditional wrapper (a debug panel) sits in the chain.
//
// Bug 4 — react-hook-form's register() silently does nothing:
//   Your <Input> does not forward. The field is never registered, so it is
//   never validated and never submitted.
//
// Bug 5 — ref.current is null inside the render body:
//   Refs attach during commit. Read it in useLayoutEffect or later. → §7.
//
// Bug 6 — A ResizeObserver observing the same node many times:
//   An inline callback ref re-attaching on every render. → §7.
//
// Bug 7 — "Maximum update depth exceeded" from a callback ref:
//   setState inside an inline callback ref → re-render → new identity →
//   re-attach → setState. → §7.
//
// Bug 8 — The imperative handle is stale:
//   useImperativeHandle with [] deps closing over the first render's props.
//
// Bug 9 — A caller hid your component with ref.current.style.display = "none":
//   You forwarded the raw node, so the DOM is your API now. → §6.
//
// Bug 10 — Refs break after wrapping a component in memo or an HOC:
//   The wrapper does not forward. memo does; a hand-written HOC does not.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The fact everything follows from:
assert(seenProps[0].includes("ref") === false,
  "`ref` is never in props — React strips it, like `key` 🐛");
assert(seenProps[0].join() === "placeholder,onChange",
  "...only the real props arrive");
assert(plainRef.current === null, "so a ref on a plain function component stays null 🐛");
assert(r1.warnings()[0].includes("Function components cannot be given refs"),
  "React ≤18 warns, and names the component");

// forwardRef:
assert(fancyRef.current !== null && fancyRef.current.tag === "input",
  "forwardRef delivers the actual DOM node ✅");
assert(typeof fancyRef.current.focus === "function" && fancyRef.current._focused === true,
  "...and the caller can drive it");
assert(r2.warnings().length === 0, "no warning once the ref has somewhere to land");

// Through layers:
assert(goodRef.current && goodRef.current.tag === "input",
  "3 wrappers, all forwarding → the ref reaches the input ✅");
assert(badRef.current === null,
  "one wrapper that does not forward → null. Forwarding is not transitive 🐛");
assert(rBad.warnings().length === 1 && rBad.warnings()[0].includes("Level2Bad"),
  "...and the warning names the exact layer that dropped it");

// useImperativeHandle:
assert(rawSurface === 9 && safeSurface === 2,
  "the raw node exposes 9 properties; the handle exposes 2 ✅");
assert(Object.keys(safeRef.current).join() === "focus,clear",
  "the public API is exactly what you chose");
assert(rawRef.current.style !== undefined && safeRef.current.style === undefined,
  "the caller can no longer restyle your internals 🐛→✅");

// Timing and callback refs:
assert(timeline[0].startsWith("1. child ref attached") && timeline[3].includes("parent useLayoutEffect"),
  "child ref → child layout effect → parent ref → parent layout effect");
assert(inlineCalls.length === 5 && inlineCalls.join() === "node,null,node,null,node",
  "an inline callback ref detaches and reattaches on every render 🐛");
assert(stableCalls.length === 1 && stableCalls[0] === "node",
  "a stable callback ref attaches once ✅");

console.log("§11 — mini assertions passed for: Forwarding Refs");
console.log("\n  The pair that captures it: `ref` never appeared in props once, and");
console.log("  one non-forwarding wrapper in a chain of three turned a working DOM");
console.log("  node into null — while useImperativeHandle cut the public surface");
console.log("  from 9 properties to 2.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is forwardRef and why do you need it?", answer:
//
//   "The whole thing follows from one fact: ref isn't a prop. React handles it
//    specially, like key, and strips it off before your component function
//    runs. So a ref on a plain function component goes nowhere — ref.current
//    stays null, and in React 18 and earlier you get 'Function components
//    cannot be given refs'. forwardRef changes the signature to (props, ref),
//    and then you decide which node it lands on — React can't guess which of
//    the elements inside your component the caller meant.
//
//    It matters because forwarding isn't transitive. Every layer between the
//    caller and the DOM node has to opt in, so one wrapper in a design-system
//    chain that doesn't forward makes the ref null for everyone above it. That
//    breaks focus management, scrollIntoView, measuring for a tooltip, and
//    react-hook-form's register — all silently, because a null ref doesn't
//    throw.
//
//    The design decision on top is what you forward. Handing back the raw DOM
//    node makes the entire element your public API — the caller can set
//    style.display or call remove(), and nothing will flag it when you rewrite
//    the internals. useImperativeHandle lets you expose two methods instead:
//    focus and clear, or play and seek. I forward the node when the component
//    IS the element, and expose a handle when it owns behaviour.
//
//    Two timing details I'd mention: refs attach during commit, so ref.current
//    is null in the render body — read it in a layout effect. And a callback
//    ref is compared by identity, so an inline arrow detaches and reattaches
//    on every render. That's harmless if it just stores the node and a loop if
//    it sets state or starts an observer.
//
//    And in React 19 this largely goes away for function components: ref is a
//    normal prop, forwardRef is deprecated with a codemod, and callback refs
//    can return a cleanup function instead of being called with null. Classes
//    still need forwardRef, and every timing rule is unchanged — but a wrapper
//    that spreads props now forwards refs for free, which removes the most
//    common silent bug in the list."
//
// Leading with "ref is not a prop" and closing with the React 19 change is
// what makes this current and complete.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why doesn't {...props} forward a ref?
// A1. Because ref was never in props. React strips it, like key.
//
// Q2. What is forwardRef's signature?
// A2. (props, ref) — exactly two arguments.
//
// Q3. Is forwarding transitive?
// A3. No. Every layer must forward explicitly.
//
// Q4. What does a ref on a CLASS component give you?
// A4. The component instance, not a DOM node. That still works without
//     forwardRef, in every version.
//
// Q5. When would you use useImperativeHandle?
// A5. When the component owns behaviour the parent should trigger but not
//     reimplement — play/seek, submit/reset, next/prev — and you want a small
//     public API instead of a DOM node.
//
// Q6. When is ref.current populated?
// A6. During commit, child before parent, before layout effects. Never during
//     render.
//
// Q7. Object ref vs callback ref?
// A7. Object refs are a stable box React writes into. Callback refs let you
//     react to attach/detach — and their identity matters.
//
// Q8. Why does my inline callback ref fire twice per render?
// A8. New identity → React detaches the old (null) and attaches the new.
//     useCallback it.
//
// Q9. Does memo forward refs?
// A9. Yes. A hand-written HOC does not unless you make it.
//
// Q10. What changed in React 19?
// A10. ref is a prop for function components, forwardRef is deprecated, and
//      callback refs can return a cleanup function.
//
// Q11. Can you forward a ref to more than one node?
// A11. Not directly — one ref, one target. Use useImperativeHandle to expose
//      methods that touch several internal nodes.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Why is a ref on a function component null?
//   Back : ref is not a prop. React strips it before the component runs.
//
// Flashcard 2:
//   Front: forwardRef's signature?
//   Back : (props, ref). Two arguments, always.
//
// Flashcard 3:
//   Front: Is ref forwarding transitive?
//   Back : No. Every wrapper must opt in.
//
// Flashcard 4:
//   Front: What does useImperativeHandle buy?
//   Back : A small chosen API instead of the whole DOM node.
//
// Flashcard 5:
//   Front: When is ref.current set?
//   Back : Commit phase, child before parent, before layout effects.
//
// Flashcard 6:
//   Front: Inline callback ref — what happens?
//   Back : Detach (null) + attach (node) on every render.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "React 19 made ref a normal prop and deprecated forwardRef —
//          classes and older versions still need it, and the timing rules
//          never changed."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Put a ref on your own <Input> wrapper and log ref.current. Then log
//   Object.keys(props) and confirm `ref` is not there.
//
// Task 2:
//   Wrap it in forwardRef and focus it from the parent on mount.
//
// Task 3:
//   Build a 3-layer chain and break the middle one. Read React's warning and
//   note that it names the guilty layer.
//
// Task 4:
//   Replace the forwarded node with useImperativeHandle exposing focus() and
//   clear(). Then try to call ref.current.remove() and enjoy the TypeError.
//
// Task 5:
//   console.log(ref.current) in the render body, in useLayoutEffect, and in
//   useEffect. Write down the three values.
//
// Task 6:
//   Use an inline callback ref that calls setState. Watch the infinite loop.
//   Fix it with useCallback.
//
// Task 7:
//   Take a forwardRef component and rewrite it React 19 style — ref as a
//   prop — then confirm both versions still work with the same caller.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   ref is not a prop (before React 19). That single fact explains the null,
//   the warning, and why {...props} does not help.
//
// If you remember the common bug:
//   One wrapper in the chain that does not forward. Everything above it gets
//   null, silently.
//
// If you remember the professional framing:
//   Forwarding a ref is publishing an API. The raw node hands the caller the
//   whole DOM element forever; useImperativeHandle hands them the two methods
//   you are willing to support. Choose deliberately.
//
// NEXT TOPIC -> 10_slot-pattern.js
