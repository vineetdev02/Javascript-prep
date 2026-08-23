// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  12_controlled-component-design.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Controlled component design
//
// WHAT YOU WILL MASTER HERE:
//   1. Who owns the value — the one question this whole pattern is
//   2. The read-only input, and the undefined → "" mode switch, both proven
//   3. useControllableState: the 12 lines every component library ships
//   4. What controlled costs per keystroke, counted
//   5. The copy-a-prop-into-state trap, and the key-reset escape
//   6. Designing the onChange contract: value not event, and onCommit
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/12_controlled-component-design.js"
//
// Prerequisites: 01_react-fundamentals/10_controlled-vs-uncontrolled-components.js
// (the mechanics) and 04_state-patterns/12_derived-state.js.
//
// This is the last file of Section 2A.5, and it is the section's question in
// its purest form. Every pattern here has been an answer to "who owns what":
// the layout, the markup, the state, the render. This one is about the value
// itself — and it is the API decision you will make most often.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Controlled component design:
// Deciding whether the CALLER owns a component's value (controlled: value +
// onChange) or the COMPONENT owns it (uncontrolled: defaultValue) — and
// designing the API so the caller can pick.
//
//   <Input value={name} onChange={setName} />       // controlled
//   <Input defaultValue="Vineet" />                 // uncontrolled
//
// If interviewer says "explain it simply", say:
// "Controlled means the value on screen is whatever the parent last passed
//  in — the component has no memory of its own, it just reports changes.
//  Uncontrolled means the component keeps the value itself and the parent only
//  hears about it when it wants to."
//
// If interviewer asks "why does it matter?", say:
// "Because it decides where the state lives, which decides what re-renders and
//  what can be validated, formatted or synced. Controlled gives you a single
//  source of truth and costs a render per keystroke; uncontrolled is free and
//  gives you nothing to work with. Any component meant to be reused has to
//  support both, and the machinery for that — useControllableState — is about
//  twelve lines that every serious library ships."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   WHO OWNS THE VALUE. Everything else is a consequence.
//
// Runtime rule:
//   A component is controlled if `value !== undefined`. React decides this on
//   the FIRST render and complains if it ever changes. `null` counts as
//   defined — which is why `value={user?.name}` and `value={data ?? null}`
//   behave differently and both surprise people.
//
// Practical rule:
//   Default to uncontrolled inside the component (it works with no props),
//   and let a `value` prop take over when it is provided. Never require the
//   caller to manage state they do not care about.
//
// Common trap:
//   `<input value={x} />` with no onChange. The field is now read-only: the
//   DOM changes, React re-renders, React puts the old value back, and the user
//   sees a field that will not accept typing. React warns in development;
//   nobody reads it.
//
// The mental picture:
//
//   uncontrolled                    controlled
//   ────────────                    ──────────
//   component (or DOM) owns it      parent owns it
//   read it when you need it        you always have it
//   no render per keystroke         a render per keystroke
//   cannot validate as you type     validate, format, mask, sync
//   defaultValue                    value + onChange


// ══════════════════════════════════════════════════════════════════
// § 3 — THE TWO MODES, RUNNING
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the same five keystrokes, two ownership models:\n");

// A field that owns its value. The parent has no idea what is in it until it
// asks — via a ref, or on submit.
function makeUncontrolled(defaultValue = "") {
  let internal = defaultValue;
  return {
    type: key => { internal += key; },
    display: () => internal,                    // what the user sees
  };
}

// A field that renders exactly what it is told. If onChange does not update
// the parent's state, nothing changes on screen — ever.
function makeControlled(getValue, onChange) {
  return {
    type: key => { onChange(getValue() + key); },
    display: () => getValue(),
  };
}

const un = makeUncontrolled("");
"abcde".split("").forEach(k => un.type(k));

let parentState = "";
const ok = makeControlled(() => parentState, next => { parentState = next; });
"abcde".split("").forEach(k => ok.type(k));

let ignoredState = "";
const readOnly = makeControlled(() => ignoredState, () => { /* 🐛 forgot to setState */ });
"abcde".split("").forEach(k => readOnly.type(k));

console.log("    uncontrolled (defaultValue)        → shows:", JSON.stringify(un.display()), "✅");
console.log("    controlled, onChange updates state → shows:", JSON.stringify(ok.display()), "✅");
console.log("    controlled, onChange does nothing  → shows:", JSON.stringify(readOnly.display()), "🐛");
console.log("\n    React's warning for the third case:");
console.log("      \"You provided a `value` prop to a form field without an `onChange`");
console.log("       handler. This will render a read-only field.\"");
console.log("\n  The third row is the whole reason controlled inputs confuse people.");
console.log("  Nothing is broken — the component is doing exactly what it promised.");
console.log("  It renders props.value, and props.value never changed.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE MODE SWITCH
// ══════════════════════════════════════════════════════════════════

console.log("§4 — undefined → \"\" is a different component:\n");

// The setup that produces this: state initialised from data that has not
// arrived yet.
//
//   const [name, setName] = useState(user?.name);   // undefined on render 1
//   <Input value={name} onChange={setName} />       // uncontrolled → controlled 🐛

function modeOf(value) { return value === undefined ? "uncontrolled" : "controlled"; }

const timeline = [undefined, undefined, "", "Vineet", "Vineet"];   // the fetch resolves at index 2
const modes = timeline.map(modeOf);
const switches = modes.filter((m, i) => i > 0 && m !== modes[i - 1]).length;

console.log("    value over five renders:", JSON.stringify(timeline));
console.log("    mode   over five renders:", JSON.stringify(modes));
console.log("    mode switches:", switches, "🐛");
console.log("\n    React's warning:");
console.log("      \"A component is changing an uncontrolled input to be controlled.\"");

// The two fixes, and they are not equivalent:
const fixedInit = timeline.map(v => v ?? "");                       // always defined
const fixedGate = timeline.filter(v => v !== undefined);            // render nothing until loaded
console.log("\n    fix A — value={value ?? \"\"}   → modes:", JSON.stringify(fixedInit.map(modeOf)), "✅");
console.log("    fix B — don't render until data arrives → renders:", fixedGate.length, "instead of", timeline.length);

console.log("\n  Fix A is right when empty is a real state (a search box). Fix B is");
console.log("  right when it is not (an edit form) — showing an empty field and then");
console.log("  filling it in makes the user think their data was lost, and if they");
console.log("  type in that first moment you will overwrite the server value with");
console.log("  their partial one. Same warning, two genuinely different bugs.");
console.log("\n  And note that `null` is NOT undefined: value={null} is controlled,");
console.log("  and React renders it as an empty string while warning about it.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE HYBRID API: useControllableState
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the twelve lines every library ships:\n");

// This is the actual design work. One component, two call sites:
//
//   <Switch defaultChecked />                       ← caller does not care
//   <Switch checked={on} onCheckedChange={setOn} /> ← caller drives it
//
// Radix calls it useControllableState; MUI calls it useControlled; the shape
// is identical everywhere:

function useControllableState({ value, defaultValue, onChange }) {
  // Mode is decided by whether `value` was passed at all — checked ONCE, in a
  // real hook, via a ref. Switching later is the §4 bug.
  const isControlled = value !== undefined;
  let internal = defaultValue;

  return {
    get current() { return isControlled ? value : internal; },
    isControlled,
    set(next) {
      if (!isControlled) internal = next;   // only own it when nobody else does
      if (onChange) onChange(next);         // ALWAYS notify — both modes
    },
  };
}

// Caller A — uncontrolled, but still wants to know
const heardA = [];
const a = useControllableState({ defaultValue: "off", onChange: v => heardA.push(v) });
a.set("on");
a.set("off");

// Caller B — fully controlled
let bState = "off";
const heardB = [];
const b = useControllableState({ value: bState, onChange: v => { heardB.push(v); bState = v; } });
b.set("on");

console.log("    uncontrolled caller: isControlled =", a.isControlled,
  " internal value =", JSON.stringify(a.current), " onChange heard:", JSON.stringify(heardA));
console.log("    controlled caller  : isControlled =", b.isControlled,
  " parent state now =", JSON.stringify(bState), " onChange heard:", JSON.stringify(heardB));

console.log("\n  Three rules hiding in those twelve lines:");
console.log("    1. mode is decided ONCE — read `value !== undefined` on the first");
console.log("       render and keep it, or you reintroduce §4 inside your own");
console.log("       component");
console.log("    2. onChange fires in BOTH modes. An uncontrolled caller still wants");
console.log("       to hear about changes; they just do not want to store them");
console.log("    3. in controlled mode the component must NOT keep its own copy.");
console.log("       The moment it does, there are two sources of truth and they");
console.log("       drift. → 04_state-patterns/12_derived-state.js");
console.log("\n  This is the API shape to reach for by default: works with zero");
console.log("  props, and gets out of the way the moment the caller wants control.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — WHAT CONTROLLED COSTS
// ══════════════════════════════════════════════════════════════════

console.log("§6 — a render per keystroke, and who pays it:\n");

// Controlled state lives in the parent, so every keystroke re-renders the
// parent — and therefore its whole subtree, unless something stops it.
// → 05_optimization-techniques/03_avoiding-unnecessary-re-renders.js

function simulateForm({ controlled, keystrokes, siblings }) {
  let ownerRenders = 0, siblingRenders = 0;
  for (let i = 0; i < keystrokes; i++) {
    if (controlled) {
      ownerRenders++;                      // setState in the owner
      siblingRenders += siblings;          // ...re-renders its children
    }
  }
  return { ownerRenders, siblingRenders };
}

const KEYS = 20, SIBLINGS = 8;
const controlledCost = simulateForm({ controlled: true, keystrokes: KEYS, siblings: SIBLINGS });
const uncontrolledCost = simulateForm({ controlled: false, keystrokes: KEYS, siblings: SIBLINGS });

console.log(`    typing 20 characters in a form with ${SIBLINGS} sibling fields:`);
console.log("      controlled at the form level → form renders:", controlledCost.ownerRenders,
  " sibling renders:", controlledCost.siblingRenders, "🐛");
console.log("      uncontrolled (or state moved into the field) → form renders:",
  uncontrolledCost.ownerRenders, " sibling renders:", uncontrolledCost.siblingRenders, "✅");
console.log("      wasted renders avoided:", controlledCost.siblingRenders);

console.log("\n  What you get for that price, and it is often worth it:");
console.log("    • validate and format as the user types (masks, currency, uppercase)");
console.log("    • disable Submit until the form is valid");
console.log("    • one source of truth to serialise, autosave, or sync to a URL");
console.log("    • the field can be reset, prefilled or driven from elsewhere");
console.log("\n  And the three ways to keep the price down, in order:");
console.log("    1. move the state DOWN — let each field own its own value and lift");
console.log("       only on blur or submit (this is the structural fix, and it is");
console.log("       always the first one to try)");
console.log("    2. use an uncontrolled form + refs, or a form library that keeps");
console.log("       state outside React and subscribes per-field (react-hook-form)");
console.log("    3. keep it controlled and split the subtree so siblings do not");
console.log("       re-render — memo, or pass them as children (→ 10 §6)");
console.log("\n  Note that 1 and 2 are the same move as 05's 'context is the wrong");
console.log("  tool for hot values'. A controlled form at the top of a page IS a");
console.log("  high-frequency value read widely. Same problem, same answer.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE COPY-A-PROP-INTO-STATE TRAP
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the halfway house that is worse than both:\n");

// ❌ const [draft, setDraft] = useState(props.value);
//
// useState's argument is the INITIAL value. It is read once, on mount, and
// ignored forever after. So when props.value changes, the copy does not.

function useStateOnce(initial) {
  let value = initial;
  return { get: () => value, set: v => { value = v; }, };
}

// mount with the server's value:
const draft = useStateOnce("Vineet");
// the parent refetches and passes a new value:
const propsOverTime = ["Vineet", "Vineet Bhatti", "Vineet B."];
const shown = propsOverTime.map(() => draft.get());

console.log("    props.value over time:", JSON.stringify(propsOverTime));
console.log("    what the field shows :", JSON.stringify(shown), "🐛 frozen at the first one");

// ✅ The escape hatch: remount the component when the identity of the thing
// being edited changes. `key` is the official answer, and it is one line.
//
// React keeps a component's state while the key at that position is the same,
// and mounts a brand-new one when it changes — exactly this Map:
const stateByKey = new Map();
function remountOn(key, initial) {
  if (!stateByKey.has(key)) stateByKey.set(key, useStateOnce(initial));
  return stateByKey.get(key);                 // same key → same state, kept
}

const draftA = remountOn("user-1", "Vineet");
draftA.set("Vineet Bhatti");                            // the user edits
const draftAAgain = remountOn("user-1", "Vineet");      // re-render, same key
const draftB = remountOn("user-2", "Asha");             // different key → new state

console.log("\n    key={user.id}:");
console.log("      user-1, edited then re-rendered →", JSON.stringify(draftAAgain.get()), "✅ state kept");
console.log("      switch to user-2               →", JSON.stringify(draftB.get()), "✅ fresh state");

console.log("\n  The decision, stated cleanly:");
console.log("    • the caller owns it and it can change → CONTROLLED. Do not copy.");
console.log("    • the component owns it, seeded once   → UNCONTROLLED + defaultValue,");
console.log("      and key={id} to re-seed when the subject changes");
console.log("    • you need both                        → useControllableState (§5)");
console.log("  What you must never do is keep a copy AND accept a prop, because now");
console.log("  two things claim to be the truth and only one of them is on screen.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — DESIGNING THE onChange CONTRACT
// ══════════════════════════════════════════════════════════════════

console.log("§8 — the other half of the API:\n");

// A controlled component's API is a PAIR. The value prop gets all the
// attention and the callback is where the design mistakes are.

const contractRules = [
  ["pass the VALUE, not the event",
   "onChange(next) — your <Rating> has no DOM event to give, and forcing callers to write e.target.value couples them to your internals"],
  ["name it for what changed",
   "onValueChange / onCheckedChange / onOpenChange. `onChange` implies a DOM event; Radix renames it for exactly this reason"],
  ["make it optional",
   "an uncontrolled caller should not have to pass one — §5 rule 2"],
  ["offer a COMMIT event for expensive work",
   "onChange on every keystroke, onCommit on blur/Enter. Autosave and network calls belong on the second one"],
  ["never call it during render",
   "notify in an event handler or an effect; calling a parent's setState while rendering is the classic 'Cannot update a component while rendering' error"],
];
contractRules.forEach(([rule, why], i) => {
  console.log(`    ${i + 1}. ${rule}`);
  console.log(`       ${why}`);
});

// Prove the commit split, because it is the one people have not thought about:
const perKeystroke = [], onCommit = [];
"hello".split("").forEach((k, i) => perKeystroke.push("hello".slice(0, i + 1)));
onCommit.push("hello");                                  // one blur

console.log("\n    typing \"hello\":");
console.log("      onChange fired:", perKeystroke.length, "times →", JSON.stringify(perKeystroke));
console.log("      onCommit fired:", onCommit.length, "time  →", JSON.stringify(onCommit));
console.log("      network requests saved by using onCommit for autosave:",
  perKeystroke.length - onCommit.length);

console.log("\n  Give the caller both and they can choose per use: live validation on");
console.log("  onChange, the PATCH request on onCommit. Give them only onChange and");
console.log("  every consumer reimplements a debounce, slightly differently.");
console.log("  → 03_custom-hooks/03_usedebounce-hook.js\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — THE SECTION, IN ONE QUESTION
// ══════════════════════════════════════════════════════════════════

console.log("§9 — what all twelve files were asking:\n");

const ownership = [
  ["01 compound components", "who owns the LAYOUT", "the caller"],
  ["02 render props", "who owns the MARKUP for a value", "the caller"],
  ["03 HOCs", "who owns the WRAPPING", "the library"],
  ["04 container / presentational", "who owns the DATA SOURCE", "the container"],
  ["05 provider", "who owns a WIDELY-READ value", "one writer"],
  ["06 observer", "who owns state OUTSIDE React", "the store"],
  ["07 portals", "who owns the DOM POSITION", "the caller's container"],
  ["08 error boundaries", "who owns the BLAST RADIUS", "whoever placed the boundary"],
  ["09 forwarding refs", "who owns the DOM NODE", "whoever you forward to"],
  ["10 slots", "who owns the ARRANGEMENT", "the component"],
  ["11 headless", "who owns the PIXELS", "the caller"],
  ["12 controlled design", "who owns the VALUE", "whoever passed it"],
];
ownership.forEach(([file, question, answer]) =>
  console.log(`    ${file.padEnd(30)} ${question.padEnd(36)} ${answer}`));

console.log("\n  Twelve patterns, one question, twelve different answers — and every");
console.log("  bug in this section came from two parties believing they owned the");
console.log("  same thing. A memo that never skips, a ref that is null, a context");
console.log("  consumer that re-renders, a modal that closes itself, a field frozen");
console.log("  on its first value: all of them are ownership disputes.\n");


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "I can't type in the field":
//   value with no onChange, or an onChange that does not setState. → §3.
//
// Bug 2 — "A component is changing an uncontrolled input to be controlled":
//   useState(user?.name) — undefined on the first render. → §4.
//
// Bug 3 — The edit form flashes empty, then fills in:
//   Rendering before the data arrives. Worse: the user types into the empty
//   field and overwrites the server value. → §4 fix B.
//
// Bug 4 — The field shows a stale value after a refetch:
//   props copied into useState. → §7.
//
// Bug 5 — Editing user A, then user B, still shows A's data:
//   Same as Bug 4, and the fix is key={user.id}. → §7.
//
// Bug 6 — Typing lags on a big form:
//   Controlled state at the form level re-rendering 8 siblings per keystroke.
//   → §6.
//
// Bug 7 — The cursor jumps to the end while typing:
//   A controlled input that formats the value (a phone mask) without
//   restoring selectionStart. Controlled inputs own the caret too.
//
// Bug 8 — Autosave fires 20 requests for one word:
//   onChange used for the network call. → §8.
//
// Bug 9 — "Cannot update a component while rendering a different component":
//   onChange called during render instead of from an event or an effect.
//
// Bug 10 — A checkbox that will not toggle:
//   `checked` without `onChange`. Same as Bug 1; React's warning even names
//   `checked` separately.
//
// Bug 11 — Two sources of truth drift apart:
//   A "controlled" component that also keeps an internal copy. → §5 rule 3.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The two modes:
assert(un.display() === "abcde", "an uncontrolled field keeps what the user typed ✅");
assert(ok.display() === "abcde", "a controlled field with a real onChange does too ✅");
assert(readOnly.display() === "", "a controlled field whose onChange does nothing is read-only 🐛");

// The mode switch:
assert(modes[0] === "uncontrolled" && modes[3] === "controlled",
  "value: undefined → 'Vineet' flips the component's mode 🐛");
assert(switches === 1, "React warns exactly once, on that transition");
assert(fixedInit.map(modeOf).every(m => m === "controlled"),
  "value={value ?? ''} keeps it controlled from render 1 ✅");
assert(fixedGate.length === 3, "gating on loaded data renders 3 times instead of 5 ✅");

// useControllableState:
assert(a.isControlled === false && a.current === "off",
  "no `value` prop → the component owns the state");
assert(JSON.stringify(heardA) === '["on","off"]',
  "...and onChange still fires, so the caller can listen without storing ✅");
assert(b.isControlled === true, "a `value` prop → the caller owns it");
assert(bState === "on" && JSON.stringify(heardB) === '["on"]',
  "...and the only way the value changes is through the caller ✅");

// The cost:
assert(controlledCost.ownerRenders === 20 && controlledCost.siblingRenders === 160,
  "20 keystrokes × 8 siblings = 160 sibling renders 🐛");
assert(uncontrolledCost.siblingRenders === 0,
  "keeping the value in the field costs the siblings nothing ✅");

// The copy trap:
assert(JSON.stringify(shown) === '["Vineet","Vineet","Vineet"]',
  "useState(props.value) freezes on the first value, forever 🐛");
assert(draftAAgain.get() === "Vineet Bhatti",
  "the same key keeps the edit across re-renders ✅");
assert(draftB.get() === "Asha",
  "a new key re-seeds the state from the new subject ✅");

// The contract:
assert(contractRules.length === 5, "five rules for the callback half of the API");
assert(perKeystroke.length === 5 && onCommit.length === 1,
  "onChange fires 5×, onCommit once — that is 4 network calls saved ✅");

// The section:
assert(ownership.length === 12, "twelve patterns, one question: who owns what");

console.log("§11 — mini assertions passed for: Controlled component design");
console.log("\n  The pair that captures it: a controlled field whose onChange did");
console.log("  nothing showed \"\" after five keystrokes, and a prop copied into");
console.log("  useState showed the same stale name across three different props —");
console.log("  while controlled form state cost 160 sibling renders for 20 keys.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "controlled vs uncontrolled, and how would you design a
// component's API?", answer:
//
//   "Controlled means the value on screen is whatever the parent passed in —
//    the component has no memory, it renders props.value and calls onChange.
//    Uncontrolled means the component or the DOM owns the value and the parent
//    reads it when it needs to, usually on submit or through a ref.
//
//    React decides which mode you're in by whether `value` is undefined, and
//    it decides on the first render. That's where the two classic bugs come
//    from. If you pass value with no onChange, the field is read-only —
//    nothing's broken, props.value just never changed. And if you initialise
//    state from data that hasn't loaded, value is undefined on the first
//    render and defined later, so the component switches modes and React
//    warns. The fix is either value ?? '' or not rendering the form until the
//    data arrives — and those aren't interchangeable. On an edit form, showing
//    an empty field first means the user might type into it and overwrite the
//    server value.
//
//    For designing an API, the answer is support both. Internally that's
//    useControllableState — Radix's name for it, MUI calls it useControlled —
//    about twelve lines: decide the mode once from whether `value` was passed,
//    keep internal state only in uncontrolled mode, and always call onChange
//    in both, because an uncontrolled caller still wants to hear about changes
//    even if it doesn't want to store them. The rule that matters most is that
//    a controlled component must not keep its own copy — the moment it does,
//    you have two sources of truth and they drift.
//
//    The related trap is copying a prop into useState. useState's argument is
//    the initial value, read once, so the field freezes on the first value it
//    ever saw and a refetch does nothing. If you genuinely want to re-seed,
//    the answer is key={user.id} to remount, not a useEffect that syncs.
//
//    And I'd mention the cost. Controlled state at the form level means a
//    render of the whole form per keystroke — twenty characters in a form with
//    eight fields is a hundred and sixty wasted sibling renders. You buy
//    live validation and a single source of truth with that; if you don't need
//    them, push the state down into the field, or use react-hook-form, which
//    keeps it outside React and subscribes per field.
//
//    Last thing: design the callback, not just the value. Pass the value, not
//    the event — a Rating component has no DOM event to hand you. Name it for
//    what changed, onValueChange. Make it optional. And offer a commit event
//    on blur, so live validation can run on every keystroke while the PATCH
//    request runs once."
//
// The useControllableState answer plus the "value ?? '' and gating aren't
// interchangeable" nuance are what mark this as senior.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How does React decide the mode?
// A1. `value !== undefined`, on the first render. null counts as controlled.
//
// Q2. Why is my input read-only?
// A2. You passed value with no onChange, so React re-renders the old value
//     over whatever the DOM did.
//
// Q3. Why the "changing an uncontrolled input to be controlled" warning?
// A3. value was undefined on the first render and defined later.
//
// Q4. How do you support both modes in one component?
// A4. useControllableState: mode decided once, internal state only when
//     uncontrolled, onChange always fired.
//
// Q5. Why must a controlled component not keep a copy?
// A5. Two sources of truth. They drift, and only one is on screen.
//
// Q6. What's wrong with useState(props.value)?
// A6. It reads the prop once. The field freezes on the first value.
//
// Q7. How do you re-seed state when the edited entity changes?
// A7. key={entity.id} to remount. Not a syncing useEffect.
//
// Q8. What does controlled cost?
// A8. A render of the state owner per keystroke, and its whole subtree.
//
// Q9. How do you keep a big form fast?
// A9. Move state down to the field, use an uncontrolled form with refs, or a
//     library with per-field subscriptions. Memoization is the last resort.
//
// Q10. What should onChange receive?
// A10. The new value. Name it for what changed and make it optional.
//
// Q11. Why offer onCommit as well?
// A11. So expensive work — autosave, network calls, analytics — runs once per
//      edit instead of once per keystroke.
//
// Q12. Does any of this change with Server Components / form actions?
// A12. Uncontrolled gets more attractive: a <form action={fn}> submits the
//      DOM's own values, so you often need no React state at all. useFormStatus
//      and useOptimistic then cover the parts you did want state for.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Controlled vs uncontrolled?
//   Back : Who owns the value — the parent (value + onChange) or the
//          component (defaultValue).
//
// Flashcard 2:
//   Front: How does React decide?
//   Back : value !== undefined, on the FIRST render. null is controlled.
//
// Flashcard 3:
//   Front: Why is my input read-only?
//   Back : value with no onChange. props.value never changed.
//
// Flashcard 4:
//   Front: The hook that supports both modes?
//   Back : useControllableState — mode once, internal state only when
//          uncontrolled, onChange always.
//
// Flashcard 5:
//   Front: useState(props.value) — what happens?
//   Back : Frozen on the first value. Use key={id} to re-seed.
//
// Flashcard 6:
//   Front: What does controlled cost?
//   Back : A render of the owner per keystroke — 20 keys × 8 siblings = 160.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "Support both, decide the mode once, never keep a copy in
//          controlled mode — and ship onCommit alongside onChange."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Render <input value="hi" /> with no onChange and try to type. Read the
//   warning React gives you.
//
// Task 2:
//   Initialise state from a fetched value and reproduce the uncontrolled →
//   controlled warning. Fix it both ways and decide which is right for an
//   edit form.
//
// Task 3:
//   Write useControllableState in twelve lines. Use it in a <Switch> that
//   works with defaultChecked AND with checked + onCheckedChange.
//
// Task 4:
//   Log renders in eight sibling fields while typing into a controlled form.
//   Then move the state into the field and log again.
//
// Task 5:
//   Copy a prop into useState, refetch the data, and watch the field ignore
//   it. Fix it with key.
//
// Task 6:
//   Add onCommit to your input and move an autosave call onto it. Count the
//   network requests before and after.
//
// Task 7:
//   Build the same form three ways — controlled, uncontrolled with refs, and
//   react-hook-form — and compare lines of code and renders per keystroke.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Controlled means props.value IS the value. If it never changes, nothing
//   on screen changes — and that is the component keeping its promise.
//
// If you remember the common bug:
//   value that starts undefined, or a prop copied into useState. One flips
//   modes and warns; the other freezes silently.
//
// If you remember the professional framing:
//   A reusable component supports both modes and decides which one it is in
//   exactly once. It never keeps a copy of a value the caller owns, it names
//   its callback for what changed, and it offers a commit event so the caller
//   is not forced to debounce your API.
//
// ─────────────────────────────────────────────────────────────────
// END OF ◆ DESIGN PATTERNS — all 12 topics.
// NEXT -> index.js  (the section map, and the argument these 12 files make)
// ─────────────────────────────────────────────────────────────────
