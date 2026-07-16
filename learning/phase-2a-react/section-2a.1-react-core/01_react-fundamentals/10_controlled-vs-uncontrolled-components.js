// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  10_controlled-vs-uncontrolled-components.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Controlled vs uncontrolled components
//
// WHAT YOU WILL MASTER HERE:
//   1. Exact definition — "who owns the value?"
//   2. Why value={x} without onChange makes a READ-ONLY input — proven
//   3. The undefined → defined switch that logs React's famous warning
//   4. defaultValue, refs, and when uncontrolled is the RIGHT answer
//   5. Real bugs: the lost keystroke, the null value, the reset
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/10_controlled-vs-uncontrolled-components.js"
//
// Prerequisite: 05_keys-in-lists.js — the checkbox that jumped rows was
// uncontrolled state. This file explains what that means.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Controlled vs uncontrolled:
// It is one question — WHO OWNS THE VALUE? If React state owns it and the
// DOM only displays it, it is controlled. If the DOM owns it and React reads
// it when needed, it is uncontrolled.
//
// If interviewer says "explain it simply", say:
// "Controlled: value comes from state, every keystroke goes through setState,
//  React is the single source of truth. Uncontrolled: the DOM node keeps its
//  own value and I grab it with a ref when I need it — like a normal HTML form."
//
// If interviewer asks "why does it matter?", say:
// "Because controlled inputs are the only way to validate, format, or
//  conditionally disable as the user types. And because the failure mode of
//  getting it half-right — value without onChange — is an input the user
//  literally cannot type into."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   who is the source of truth?
//
// CONTROLLED — a loop through React:
//
//   user types "a"
//        ↓
//   onChange fires with e.target.value = "a"
//        ↓
//   setState("a")  →  re-render  →  value="a"  →  DOM shows "a"
//
//   The DOM is a PROJECTION of state. If setState never happens, the
//   letter never appears — the DOM is overwritten back to the old value.
//
// UNCONTROLLED — the browser does its thing:
//
//   user types "a"  →  DOM value is "a"  →  React knows nothing
//   later: ref.current.value  →  "a"
//
// Runtime rule:
//   React decides which mode an input is in by whether `value` is
//   undefined or not — checked at MOUNT, and it warns if you change it later.
//
// Practical rule:
//   Controlled by default. Uncontrolled for file inputs (mandatory), for
//   big forms where per-keystroke re-renders hurt, and when integrating a
//   non-React widget.
//
// Common trap:
//   <input value={x} /> with no onChange. The input is read-only. Every
//   keystroke is discarded on the next render, and React warns.


// ══════════════════════════════════════════════════════════════════
// § 3 — A DOM INPUT THAT BEHAVES LIKE THE REAL ONE
// ══════════════════════════════════════════════════════════════════
//
// A real <input> holds its own value. React sets it back down on render.
// To prove the read-only bug we need both halves — so here they are.

function createInput({ value, defaultValue, onChange }) {
  const warnings = [];

  // THE MODE DECISION. This is React's actual test:
  const isControlled = value !== undefined && value !== null;

  if (isControlled && !onChange) {
    warnings.push(
      "You provided a `value` prop to a form field without an `onChange` " +
      "handler. This will render a read-only field."
    );
  }
  if (value !== undefined && defaultValue !== undefined) {
    warnings.push(
      "You provided both `value` and `defaultValue` to a form field. " +
      "Form fields must be either controlled or uncontrolled."
    );
  }

  const node = {
    // The DOM node's OWN value — this is the thing that exists in a browser.
    value: isControlled ? value : (defaultValue ?? ""),
    isControlled,
    warnings,
  };

  // What happens when a user presses a key:
  node.type = (char) => {
    node.value = node.value + char;      // the BROWSER updates the DOM first.
    if (onChange) onChange({ target: { value: node.value } });   // then React hears about it
    return node.value;
  };

  // What React does on every render: force the DOM back to `value`.
  node.reRenderWith = (nextValue) => {
    if (node.isControlled) {
      node.value = nextValue;            // ← the overwrite. THIS is the whole model.
    }
    // uncontrolled: React does NOT touch the DOM value. It stays whatever
    // the user typed.
    return node.value;
  };

  return node;
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE READ-ONLY BUG: value WITHOUT onChange
// ══════════════════════════════════════════════════════════════════

console.log("§4 — <input value={name} /> with no onChange:\n");

let name = "Vineet";
const broken = createInput({ value: name });      // no onChange!

console.log("  warning:", broken.warnings[0].slice(0, 62) + "...");
console.log("  DOM value:", JSON.stringify(broken.value));

broken.type("!");                                  // user presses "!"
console.log("  user types '!' → DOM value is now:", JSON.stringify(broken.value));

// React re-renders. `name` never changed, because nothing called setState.
broken.reRenderWith(name);
console.log("  React re-renders with value={name} → DOM value:",
  JSON.stringify(broken.value));

console.log("\n  🐛 The '!' is GONE. The keystroke reached the DOM, then React");
console.log("     overwrote it with the unchanged state on the next render.");
console.log("     To the user, the input is frozen. Nothing is broken in the");
console.log("     browser — React is doing exactly what you told it:");
console.log("     'the value IS name, always.'\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — CONTROLLED, DONE RIGHT
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the loop closed with onChange:\n");

let state = "Vineet";
const controlled = createInput({
  value: state,
  onChange: (e) => { state = e.target.value; },   // ← setState. The loop closes.
});

console.log("  state:", JSON.stringify(state), "| DOM:", JSON.stringify(controlled.value));
controlled.type("!");
console.log("  user types '!' → state:", JSON.stringify(state),
  "| DOM:", JSON.stringify(controlled.value));
controlled.reRenderWith(state);
console.log("  React re-renders → DOM:", JSON.stringify(controlled.value), "✅ the '!' survived");
console.log("\n  The keystroke went: DOM → onChange → state → render → DOM.");
console.log("  A full round trip through React on EVERY character.");
console.log("  That round trip is what buys you validation, formatting, and");
console.log("  a disabled submit button. It is also what costs you a render");
console.log("  per keystroke. → §8\n");

// This is what "single source of truth" buys you — transform mid-loop:
let upper = "";
const forced = createInput({
  value: upper,
  onChange: (e) => { upper = e.target.value.toUpperCase(); },   // ← transform!
});
forced.type("h"); forced.reRenderWith(upper);
forced.type("i"); forced.reRenderWith(upper);
console.log("  onChange transforming to uppercase → DOM:", JSON.stringify(forced.value));
console.log("  You cannot do this with an uncontrolled input. There is no");
console.log("  point in the loop to intervene.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — UNCONTROLLED: THE DOM KEEPS THE VALUE
// ══════════════════════════════════════════════════════════════════

console.log("§6 — uncontrolled with defaultValue + ref:\n");

const uncontrolled = createInput({ defaultValue: "Vineet" });   // no value prop

console.log("  isControlled?", uncontrolled.isControlled);
console.log("  initial DOM value:", JSON.stringify(uncontrolled.value));

uncontrolled.type("!");
console.log("  user types '!' → DOM value:", JSON.stringify(uncontrolled.value));

uncontrolled.reRenderWith("Vineet");    // React re-renders — and does NOT touch it
console.log("  React re-renders → DOM value:", JSON.stringify(uncontrolled.value),
  "← untouched ✅");

console.log("\n  React never overwrites an uncontrolled input. The DOM owns it.");
console.log("  You read it on submit:  ref.current.value →",
  JSON.stringify(uncontrolled.value));
console.log("\n  ZERO re-renders while typing. That is the trade: you get speed");
console.log("  and simplicity, you lose the ability to react to each keystroke.\n");

// defaultValue is ONLY read at mount — the trap:
const late = createInput({ defaultValue: "" });     // data has not loaded yet
late.reRenderWith("data arrived");
console.log("  defaultValue trap — data arrives AFTER mount:");
console.log("    DOM value:", JSON.stringify(late.value), "← 🐛 still empty");
console.log("    defaultValue is read ONCE at mount. Later changes do nothing.");
console.log("    Fix: don't render the form until data is ready, or key={dataId}");
console.log("    to force a remount, or just use a controlled input.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE FAMOUS WARNING: SWITCHING MODES MID-LIFE
// ══════════════════════════════════════════════════════════════════
//
// "A component is changing an uncontrolled input to be controlled."
//
// Every React developer sees this. The cause is almost always the same:
// state initialized as undefined or null, then filled in later.
//
//   const [name, setName] = useState();         // ← undefined!
//   <input value={name} onChange={...} />       // uncontrolled at mount
//   ...then setName("Vineet")                   // now controlled → WARNING
//
// The fix is one character: useState("").
//
// null is the sneakier version — API responses love null:
//   value={user.middleName}   where middleName is null → uncontrolled
//   Fix: value={user.middleName ?? ""}

console.log("§7 — the mode-switch warning:\n");

function detectMode(value) {
  return (value !== undefined && value !== null) ? "controlled" : "uncontrolled";
}

const timeline = [
  ["useState()      → undefined", undefined],
  ["API returns null            ", null],
  ['setName("Vineet")           ', "Vineet"],
  ['user clears it  → ""        ', ""],
];

let previousMode = null;
for (const [label, value] of timeline) {
  const mode = detectMode(value);
  const switched = previousMode && previousMode !== mode;
  console.log(`  ${label} → ${mode.padEnd(12)}` +
    (switched ? `⚠️  WARNING: changing ${previousMode} → ${mode}` : ""));
  previousMode = mode;
}

console.log("\n  Note the last row: \"\" is CONTROLLED. Empty string is a value.");
console.log("  Only undefined and null flip you to uncontrolled. That is why");
console.log("  useState(\"\") and value={x ?? \"\"} are the whole fix.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHICH ONE SHOULD YOU ACTUALLY USE?
// ══════════════════════════════════════════════════════════════════
//
// The honest engineering answer, not the doctrine:
//
//   CONTROLLED when you need to REACT to the value as it changes:
//     • live validation ("password too short")
//     • formatting while typing (phone numbers, currency, uppercase)
//     • disabling submit until valid
//     • one input depending on another (country → state dropdown)
//     • search-as-you-type
//     • the value must be shared with other components
//
//   UNCONTROLLED when the value is only needed at the END:
//     • a simple submit-once form
//     • large forms where per-keystroke renders are measurable
//     • integrating a non-React widget (a date picker, a rich text editor)
//     • <input type="file"> — MANDATORY. Its value is read-only for
//       security; you cannot set it programmatically, ever.
//
// The thing interviewers want to hear:
//   Modern form libraries (React Hook Form) are UNCONTROLLED by default and
//   deliberately so — they use refs and subscribe to the DOM, so typing in
//   one field re-renders nothing. Formik was controlled and re-rendered the
//   whole form on every keystroke. That performance gap is exactly why RHF won.
//
//   So "always controlled" is not the professional answer. "Controlled by
//   default, uncontrolled when the render cost is real or the DOM must own
//   it" is.

console.log("§8 — the render cost, counted:\n");

function countRenders(mode, keystrokes) {
  let renders = 0;
  const input = createInput(
    mode === "controlled"
      ? { value: "", onChange: () => { renders++; } }   // every key → a render
      : { defaultValue: "" }                            // no React involvement
  );
  for (const char of keystrokes) input.type(char);
  return { renders, finalValue: input.value };
}

const typed = "vineet@example.com";
const c = countRenders("controlled", typed);
const u = countRenders("uncontrolled", typed);

console.log(`  typing "${typed}" (${typed.length} characters):`);
console.log(`    controlled   → ${String(c.renders).padStart(2)} re-renders, value: "${c.finalValue}"`);
console.log(`    uncontrolled → ${String(u.renders).padStart(2)} re-renders, value: "${u.finalValue}"`);
console.log("\n  Both end with the right value. One did it with 18 renders of");
console.log("  the whole form subtree. On a 40-field form, that is why React");
console.log("  Hook Form exists.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version              Real React
//   ───────────              ──────────
//   reRenderWith overwrites  ReactDOM sets node.value only when it DIFFERS,
//                            to avoid moving the caret to the end
//   value/defaultValue       plus checked/defaultChecked for checkbox+radio,
//                            and <select value> instead of <option selected>
//   warnings in an array     dev-only console warnings, once per component
//   n/a                      React attaches a value TRACKER to detect
//                            programmatic changes, so it can dedupe change
//                            events — this is why setting .value directly
//                            from outside React does not fire onChange
//   n/a                      React's onChange is really the `input` event —
//                            it fires per keystroke, unlike native onchange
//                            which fires on blur. → 11_synthetic-events.js
//
// One precise detail:
//   <textarea>{value}</textarea> is invalid in React — it is
//   <textarea value={value} />. React deliberately broke from HTML here to
//   make every form control use the same value prop.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "I can't type in the input":
//   value with no onChange. → §4. The most common React form bug.
//
// Bug 2 — "changing an uncontrolled input to be controlled":
//   useState() with no argument, or an API null. → §7. Fix: useState("")
//   or value={x ?? ""}.
//
// Bug 3 — The caret jumps to the end while typing:
//   You are formatting in onChange and setting value back, so the DOM value
//   is replaced and the cursor resets. Fix: track selectionStart and restore
//   it in a layout effect.
//
// Bug 4 — defaultValue does not update when data loads:
//   It is read at mount only. → §6. Fix: render after load, or key={id}.
//
// Bug 5 — Trying to set a file input's value:
//   Throws. File inputs are read-only by security design and can ONLY be
//   uncontrolled.
//
// Bug 6 — Setting .value directly on a DOM node and onChange never fires:
//   React's value tracker sees no change. Fix: use the native setter and
//   dispatch an input event — or, better, do not fight React.
//
// Bug 7 — A 40-field controlled form gets laggy:
//   Every keystroke re-renders the whole form. → §8. Uncontrolled, RHF, or
//   split each field into its own state-holding component.
//
// Bug 8 — A checkbox is uncontrolled and its state jumps rows on a delete:
//   → 05_keys-in-lists.js. That bug is ONLY possible because the checked
//   state lived in the DOM.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The read-only bug:
assert(broken.warnings.length === 1, "value without onChange warns");
assert(broken.value === "Vineet", "the keystroke was overwritten — input is read-only");

// The controlled loop:
assert(state === "Vineet!", "controlled: onChange updated state");
assert(controlled.value === "Vineet!", "controlled: the render pushed state back to the DOM");
assert(forced.value === "HI", "controlled: onChange can TRANSFORM the value mid-loop");

// Uncontrolled:
assert(uncontrolled.isControlled === false, "no value prop → uncontrolled");
assert(uncontrolled.value === "Vineet!", "React never overwrote the DOM value");
assert(late.value === "", "defaultValue is read at mount only — later data is ignored");

// The mode detection — this is React's real test:
assert(detectMode(undefined) === "uncontrolled", "undefined → uncontrolled");
assert(detectMode(null) === "uncontrolled", "null → uncontrolled (the API-response trap)");
assert(detectMode("") === "controlled", '"" IS controlled — empty string is a value');
assert(detectMode(0) === "controlled", "0 is controlled too");

// Both props at once:
assert(createInput({ value: "a", defaultValue: "b", onChange: () => {} })
  .warnings.some(w => w.includes("either controlled or uncontrolled")),
  "value + defaultValue together warns");

// The render cost:
assert(c.renders === typed.length, "controlled: one render per keystroke");
assert(u.renders === 0, "uncontrolled: zero renders while typing");
assert(c.finalValue === u.finalValue, "...but both end with the same value");

console.log("§11 — mini assertions passed for: Controlled vs uncontrolled");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "controlled vs uncontrolled?", answer like this:
//
//   "It comes down to who owns the value. Controlled means React state is the
//    source of truth: value comes from state, onChange pushes every keystroke
//    back into state, and the DOM is just a projection. Uncontrolled means the
//    DOM node owns its value, I set defaultValue at mount, and I read it with
//    a ref when I need it.
//
//    React decides the mode by whether `value` is undefined or null. That is
//    the source of the two classic bugs. If you pass value without onChange,
//    the input is read-only — the keystroke lands in the DOM and the next
//    render overwrites it, so the user watches an input that will not accept
//    text. And if state starts as undefined, or an API returns null, the input
//    mounts uncontrolled and becomes controlled later, which triggers the
//    'changing an uncontrolled input to be controlled' warning. Empty string
//    is controlled — only undefined and null are not — so useState('') and
//    value={x ?? ''} are the entire fix.
//
//    I default to controlled because it is the only way to validate or format
//    as the user types. But I would not say always. Controlled costs a render
//    per keystroke on the whole form, which is exactly why React Hook Form is
//    uncontrolled by default and why it beat Formik. And file inputs can only
//    ever be uncontrolled — their value is read-only for security."
//
// The RHF-vs-Formik point shows you have shipped forms, not just read docs.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How does React decide the mode?
// A1. Is `value` undefined/null? Then uncontrolled. Anything else — including
//     "" and 0 — is controlled. Decided at mount; changing it later warns.
//
// Q2. Why can't I type when I pass value with no onChange?
// A2. The keystroke updates the DOM, but the next render sets the value back
//     to unchanged state. You told React the value IS that state, always.
//
// Q3. What causes "changing an uncontrolled input to be controlled"?
// A3. value went from undefined/null to a real value — useState() with no
//     argument, or a null from an API. Fix: useState("") / value={x ?? ""}.
//
// Q4. When is uncontrolled the right choice?
// A4. File inputs (mandatory), submit-once forms, large forms where the
//     per-keystroke render is measurable, and non-React widget integration.
//
// Q5. Why is React Hook Form uncontrolled?
// A5. Performance. Refs + DOM subscriptions mean typing re-renders nothing.
//     Formik was controlled and re-rendered the whole form per keystroke.
//
// Q6. Why does my caret jump to the end?
// A6. You reformatted the value in onChange, so React replaced the DOM value
//     and the browser reset the selection. Save and restore selectionStart.
//
// Q7. Can defaultValue be updated later?
// A7. No. It is read once at mount. Use a controlled input, or remount with key.
//
// Q8. Why doesn't onChange fire when I set node.value from outside React?
// A8. React tracks the value to dedupe events and sees no user change. Use the
//     native prototype setter plus a dispatched input event — or don't.
//
// Q9. Is React's onChange the native change event?
// A9. No — it is the `input` event, firing per keystroke. Native onchange
//     fires on blur. React renamed it for consistency.
//     → 11_synthetic-events.js


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Controlled vs uncontrolled?
//   Back : Who owns the value — React state, or the DOM node.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : value === undefined || null → uncontrolled. Everything else → controlled.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : value without onChange → a read-only input the user cannot type in.
//
// Flashcard 4:
//   Front: What causes the uncontrolled→controlled warning?
//   Back : useState() with no argument, or an API null. Fix: useState("").
//
// Flashcard 5:
//   Front: Is "" controlled?
//   Back : Yes. Only undefined and null are uncontrolled.
//
// Flashcard 6:
//   Front: When MUST you be uncontrolled?
//   Back : <input type="file"> — its value is read-only for security.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Name the render-per-keystroke cost, and why RHF beat Formik.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add checkbox support to createInput: checked/defaultChecked with the
//   same mode rules. Confirm the logic is identical.
//
// Task 2:
//   Reproduce the caret jump: make onChange uppercase the value and track
//   where a real browser would put the cursor. Then fix it by restoring
//   selectionStart.
//
// Task 3:
//   Build a hybrid: a component that is controlled if `value` is passed and
//   uncontrolled otherwise — that is how every real UI library's <Input>
//   works. Handle the warning when someone switches at runtime.
//
// Task 4:
//   Break §5: remove the reRenderWith call. Watch state and the DOM drift
//   apart. That divergence is what "single source of truth" prevents.
//
// Task 5:
//   Measure §8 with a 40-field form: 40 fields × 20 characters. How many
//   renders? Now argue for or against controlled inputs with that number.
//
// Task 6:
//   Explain in 60 seconds why value={undefined} then value="x" warns, but
//   value="" then value="x" does not.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Who owns the value? React state (controlled) or the DOM node (uncontrolled).
//
// If you remember the common bug:
//   value without onChange = a read-only input. And useState() with no
//   argument = the uncontrolled→controlled warning.
//
// If you remember the professional framing:
//   Controlled by default, but it costs a render per keystroke. That cost is
//   real enough that the most popular form library in React is uncontrolled.
//
// NEXT TOPIC -> 11_synthetic-events.js
