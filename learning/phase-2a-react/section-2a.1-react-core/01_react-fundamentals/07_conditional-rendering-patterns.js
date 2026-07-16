// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  07_conditional-rendering-patterns.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Conditional rendering patterns
//
// WHAT YOU WILL MASTER HERE:
//   1. Every pattern, and the one situation each is right for
//   2. The && bug that renders a literal 0 on your page — PROVEN
//   3. What React actually renders for null / false / undefined / 0 / ""
//   4. Why a conditional wrapper silently resets state
//   5. Real bugs and production fixes
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/07_conditional-rendering-patterns.js"
//
// Prerequisite: 03_reconciliation-algorithm.js — §6 here is reconciliation
// biting you through a conditional.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Conditional rendering:
// There is no special React syntax for it. JSX is an EXPRESSION, so you use
// ordinary JavaScript — ternaries, &&, early returns — and React skips
// anything that evaluates to null, undefined, false, or true.
//
// If interviewer says "explain it simply", say:
// "It is just JavaScript. Whatever the expression evaluates to is what React
//  tries to render. There is no v-if."
//
// If interviewer asks "why does it matter?", say:
// "Because the rules for what React SKIPS are not what people assume. false
//  renders nothing, but 0 renders '0'. That one gap causes the single most
//  common React display bug."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   render the VALUE, whatever it turns out to be
//
// What React does with each child value:
//
//   null       → renders NOTHING
//   undefined  → renders NOTHING
//   false      → renders NOTHING
//   true       → renders NOTHING          ← surprises people
//   0          → renders "0"              ← THE BUG
//   -0, NaN    → renders "0" / "NaN"
//   ""         → renders nothing VISIBLE (an empty text node)
//   "text"     → renders the text
//   []         → renders nothing
//   {}         → THROWS: objects are not valid as a React child
//
// The rule in one line:
//   React skips null, undefined, and BOOLEANS. Everything else is rendered.
//   0 is a number. Numbers get rendered.
//
// Runtime rule for &&:
//   `a && b` returns `a` when a is falsy — it does NOT return false.
//   So `0 && <X/>` evaluates to 0, and React renders 0.
//
// Practical rule:
//   Use && only when the left side is a real BOOLEAN. If it might be a
//   number or a string, convert it or use a ternary.
//
// Common trap:
//   {items.length && <List/>} → renders "0" on an empty list.


// ══════════════════════════════════════════════════════════════════
// § 3 — A RENDERER THAT FOLLOWS REACT'S ACTUAL RULES
// ══════════════════════════════════════════════════════════════════

function h(type, props, ...children) {
  return { type, props: props || {}, children: children.flat() };
}

function renderChild(child) {
  // These are the ONLY values React skips. Note booleans are here; 0 is not.
  if (child === null || child === undefined || typeof child === "boolean") {
    return "";
  }
  if (typeof child === "string" || typeof child === "number") {
    return String(child);         // ← 0 lands here. It gets rendered.
  }
  if (Array.isArray(child)) {
    return child.map(renderChild).join("");
  }
  if (typeof child === "object" && child.type) {
    return renderToHTML(child);
  }
  throw new Error(
    "Objects are not valid as a React child (found: " + JSON.stringify(child) + ")"
  );
}

function renderToHTML(vnode) {
  const inner = vnode.children.map(renderChild).join("");
  return `<${vnode.type}>${inner}</${vnode.type}>`;
}


// ══════════════════════════════════════════════════════════════════
// § 4 — WHAT REACT SKIPS, AND WHAT IT DOES NOT
// ══════════════════════════════════════════════════════════════════

console.log("§4 — what actually renders:\n");

const values = [
  ["null", null],
  ["undefined", undefined],
  ["false", false],
  ["true", true],
  ["0", 0],
  ["NaN", NaN],
  ['""', ""],
  ['"hi"', "hi"],
  ["[]", []],
];

for (const [label, value] of values) {
  const output = renderToHTML(h("div", null, value));
  const visible = output === "<div></div>" ? "(nothing)" : output;
  console.log(`  {${label.padEnd(9)}} → ${visible}`);
}

console.log("\n  Read that table again. false renders nothing. 0 renders '0'.");
console.log("  React skips null, undefined, and BOOLEANS. 0 is a number.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE && BUG: A LITERAL 0 ON YOUR PAGE
// ══════════════════════════════════════════════════════════════════
//
// This is the most-asked conditional rendering question in React interviews,
// and one of the most-shipped bugs in real apps.

console.log("§5 — the && bug:\n");

function CartBroken(items) {
  // {items.length && <Badge/>}  ← looks completely reasonable
  return h("div", null, items.length && h("span", null, `${items.length} items`));
}

function CartFixed(items) {
  // {items.length > 0 && <Badge/>}  ← the left side is now a real boolean
  return h("div", null, items.length > 0 && h("span", null, `${items.length} items`));
}

console.log("  cart with 2 items:");
console.log("    broken:", renderToHTML(CartBroken(["a", "b"])));
console.log("    fixed :", renderToHTML(CartFixed(["a", "b"])));

console.log("\n  cart with 0 items:");
console.log("    broken:", renderToHTML(CartBroken([])), "  ← 🐛 a literal 0 on the page!");
console.log("    fixed :", renderToHTML(CartFixed([])), "     ← correct: nothing");

console.log("\n  WHY: `0 && <Badge/>` short-circuits and returns 0, not false.");
console.log("  && does not return a boolean — it returns one of its OPERANDS.");
console.log("  React renders 0 because 0 is a number, and numbers render.");
console.log("\n  The same bug with strings:");
console.log("    {user.name && <p/>} when name is \"\" → renders nothing (invisible");
console.log("    empty text node), so this one HIDES instead of showing junk.");
console.log("    Silently wrong is worse than loudly wrong.\n");

// Three correct fixes, in order of preference:
//
//   1. {items.length > 0 && <Badge/>}     ← explicit boolean. Clearest.
//   2. {items.length ? <Badge/> : null}   ← ternary. Also fine.
//   3. {!!items.length && <Badge/>}       ← coerce. Terse, less readable.
//
// Never: {items.length && ...}


// ══════════════════════════════════════════════════════════════════
// § 6 — THE PATTERNS, AND WHEN EACH IS RIGHT
// ══════════════════════════════════════════════════════════════════
//
// PATTERN 1 — && : show something, or nothing
//
//   {isAdmin && <DeleteButton />}
//
//   Right when: there is no "else" branch, and the condition is a boolean.
//   Wrong when: the left side is a number or a string. → §5
//
// PATTERN 2 — ternary : A or B
//
//   {isLoggedIn ? <Dashboard /> : <Login />}
//
//   Right when: exactly two branches.
//   Wrong when: nested more than one level. Nested ternaries in JSX are
//   where readability goes to die:
//
//     {a ? <X/> : b ? <Y/> : c ? <Z/> : <W/>}   ← extract a function
//
// PATTERN 3 — early return : guard clauses
//
//   if (isLoading) return <Spinner />;
//   if (error)     return <Error error={error} />;
//   if (!data)     return null;
//   return <List data={data} />;
//
//   Right when: multiple exclusive states — loading/error/empty/data. This
//   is the cleanest pattern for the most common real component shape, and
//   it is the one juniors use least.
//   Note: an early return must come AFTER all hooks. → 01_rules-of-hooks.js
//
// PATTERN 4 — variable assignment : build it up
//
//   let content;
//   if (isLoading) content = <Spinner />;
//   else if (error) content = <Error />;
//   else content = <List />;
//   return <Layout>{content}</Layout>;
//
//   Right when: you need a shared wrapper around a branching middle.
//
// PATTERN 5 — object lookup : a map of states
//
//   const views = { idle: <Idle/>, loading: <Spinner/>, done: <Result/> };
//   return views[status];
//
//   Right when: many parallel branches keyed by an enum.
//   Careful: every value is CONSTRUCTED, even the ones you do not render.
//   Cheap for elements (they are just objects), expensive if you call
//   functions in there.
//
// PATTERN 6 — CSS visibility : do not unmount at all
//
//   <div hidden={!isOpen}>...</div>
//
//   Right when: you WANT to preserve state, scroll, and avoid remount cost
//   on a frequently toggled panel. It stays in the DOM.
//   Wrong when: the content is expensive or must not exist for a11y.

console.log("§6 — patterns compared on the same component:\n");

function withTernary(state) {
  return state.loading ? h("div", null, "Loading...") : h("div", null, "Data!");
}

function withEarlyReturn(state) {
  if (state.loading) return h("div", null, "Loading...");
  if (state.error) return h("div", null, "Error: " + state.error);
  if (!state.data.length) return h("div", null, "Nothing here yet");
  return h("div", null, "Data!");
}

const states = [
  { loading: true, error: null, data: [] },
  { loading: false, error: "500", data: [] },
  { loading: false, error: null, data: [] },
  { loading: false, error: null, data: ["x"] },
];

for (const state of states) {
  const label = state.loading ? "loading" : state.error ? "error" :
    !state.data.length ? "empty" : "data";
  console.log(`  ${label.padEnd(8)} ternary: ${renderToHTML(withTernary(state)).padEnd(24)}` +
    ` early-return: ${renderToHTML(withEarlyReturn(state))}`);
}
console.log("\n  ↑ The ternary handles TWO states and lies about the other two:");
console.log("    it shows 'Data!' for both an error and an empty list.");
console.log("    Real components have four states, not two. Early returns");
console.log("    handle all four without nesting a single ternary.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE HIDDEN COST: CONDITIONALS RESET STATE
// ══════════════════════════════════════════════════════════════════
//
// Reconciliation matches by type AND position. A conditional changes both.
//
//   {isEditing
//     ? <div className="editing"><Input /></div>
//     : <Input />}
//
// When isEditing flips, the slot goes from <div> to <Input>. Different type
// → destroy and rebuild → whatever the user typed is gone.
//
// The same shape, done safely — keep the tree shape stable:
//
//   <div className={isEditing ? "editing" : ""}>
//     <Input />
//   </div>
//
// Now only a prop changed. The Input is reused and the text survives.
//
// Rule: change PROPS, not TREE SHAPE, when state must survive.
//
// And the inverse — when you WANT the reset, do not fight it:
//   <Input key={itemId} />   → deliberate remount. → 05_keys-in-lists.js

console.log("§7 — conditional tree shape vs conditional props:\n");

// Reusing the reconciler idea from file 03, minimally:
function typeAt(vnode, path) {
  let node = vnode;
  for (const i of path) node = node.children[i];
  return typeof node.type === "function" ? node.type.name : node.type;
}

function Input() { return null; }

const editingOn = h("section", null, h("div", null, h(Input, null)));
const editingOff = h("section", null, h(Input, null));

console.log("  UNSTABLE shape — {cond ? <div><Input/></div> : <Input/>}:");
console.log("    isEditing=true  → slot type:", typeAt(editingOn, [0]));
console.log("    isEditing=false → slot type:", typeAt(editingOff, [0]));
console.log("    same type?", typeAt(editingOn, [0]) === typeAt(editingOff, [0]),
  "→ REMOUNT. Typed text lost. 🐛");

const stableOn = h("section", null, h("div", { className: "editing" }, h(Input, null)));
const stableOff = h("section", null, h("div", { className: "" }, h(Input, null)));

console.log("\n  STABLE shape — <div className={cond ? 'editing' : ''}><Input/></div>:");
console.log("    isEditing=true  → slot type:", typeAt(stableOn, [0]));
console.log("    isEditing=false → slot type:", typeAt(stableOff, [0]));
console.log("    same type?", typeAt(stableOn, [0]) === typeAt(stableOff, [0]),
  "→ reused. Typed text survives. ✅\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — OBJECTS ARE NOT VALID AS A REACT CHILD
// ══════════════════════════════════════════════════════════════════
//
// The error everyone hits. Usually from rendering an object you thought
// was a string — an API field, a Date, an error object.

console.log("§8 — the 'objects are not valid' crash:\n");

const errorCases = [
  ["{user}", { name: "Vineet" }],
  ["{new Date()}", new Date("2026-01-01")],
  ["{error}", new Error("boom")],
];

for (const [label, value] of errorCases) {
  try {
    renderToHTML(h("div", null, value));
    console.log(`  ${label.padEnd(14)} → rendered (no crash)`);
  } catch (e) {
    console.log(`  ${label.padEnd(14)} → 💥 ${e.message.slice(0, 52)}...`);
  }
}
console.log("\n  Fixes: {user.name}  {date.toLocaleString()}  {error.message}");
console.log("  Note a Date object throws too — React does not call toString()");
console.log("  for you. And {JSON.stringify(user)} is the debug escape hatch.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version              Real React
//   ───────────              ──────────
//   renderChild returns ""   creates no fiber at all for null/false — the
//                            slot exists but holds nothing
//   throws a plain Error     a dev-time error naming the object's keys:
//                            "found: object with keys {name}"
//   n/a                      Symbols also throw. BigInt renders.
//   n/a                      React 18+ renders promises/thenables only
//                            inside Suspense (use() and RSC)
//
// One precise detail:
//   `{true}` renders nothing, which is why `{cond && <X/>}` is safe when cond
//   is a real boolean — the false case produces a boolean React skips. The
//   entire && pattern rests on "React skips booleans." Break that assumption
//   by passing a number, and the pattern breaks with it.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A stray "0" in the UI:
//   {items.length && <List/>} with an empty array. → §5. The #1 conditional bug.
//
// Bug 2 — A stray "0" from a count prop:
//   {unreadCount && <Badge/>} — shows "0" instead of hiding the badge.
//
// Bug 3 — Content silently missing:
//   {name && <h1>{name}</h1>} where name is "". Renders nothing. Looks like
//   a data bug, is actually a && bug.
//
// Bug 4 — Input loses text when a mode toggles. → §7.
//
// Bug 5 — "Objects are not valid as a React child":
//   {user} instead of {user.name}. Or an unhandled Date/Error. → §8.
//
// Bug 6 — Hooks called conditionally:
//   if (!data) return null;  ← placed ABOVE a useState. Crashes with
//   "rendered fewer hooks than expected". Early returns go AFTER all hooks.
//
// Bug 7 — Nested ternary nobody can read:
//   Not a runtime bug — a review bug. Extract to a function with early returns.
//
// Bug 8 — Expensive work in an object lookup:
//   const views = { a: renderHeavy(), b: renderOther() } — BOTH run every
//   render. Elements are cheap; function calls are not.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The skip rules:
assert(renderToHTML(h("div", null, null)) === "<div></div>", "null renders nothing");
assert(renderToHTML(h("div", null, undefined)) === "<div></div>", "undefined renders nothing");
assert(renderToHTML(h("div", null, false)) === "<div></div>", "false renders nothing");
assert(renderToHTML(h("div", null, true)) === "<div></div>", "true renders nothing too");
assert(renderToHTML(h("div", null, [])) === "<div></div>", "an empty array renders nothing");

// The bug, asserted:
assert(renderToHTML(h("div", null, 0)) === "<div>0</div>",
  "0 RENDERS — it is a number, not a boolean. This is the whole bug.");
assert((0 && "x") === 0, "&& returns the OPERAND, not a boolean");
assert(([].length && "x") === 0, "so {items.length && <X/>} evaluates to 0");
assert(([].length > 0 && "x") === false, "the > 0 fix produces a real boolean");

assert(renderToHTML(CartBroken([])) === "<div>0</div>", "broken cart shows a literal 0");
assert(renderToHTML(CartFixed([])) === "<div></div>", "fixed cart shows nothing");
assert(renderToHTML(CartBroken(["a"])) === renderToHTML(CartFixed(["a"])),
  "both are identical when the list is non-empty — which is why this ships");

// The empty-string variant:
assert(("" && "x") === "", '"" && x returns "" — renders an invisible empty node');

// Tree shape:
assert(typeAt(editingOn, [0]) !== typeAt(editingOff, [0]),
  "conditional wrapper changes the slot type → remount");
assert(typeAt(stableOn, [0]) === typeAt(stableOff, [0]),
  "conditional className keeps the type → reuse");

// Objects throw:
let threw = false;
try { renderToHTML(h("div", null, { a: 1 })); } catch { threw = true; }
assert(threw, "objects are not valid as a React child");

console.log("§11 — mini assertions passed for: Conditional rendering patterns");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you do conditional rendering?", answer like this:
//
//   "There is no special syntax — JSX is an expression, so it is ordinary
//    JavaScript. I pick by shape: && when there is no else branch, a ternary
//    for exactly two branches, and early returns when a component has several
//    exclusive states like loading, error, empty, and data. That last one is
//    the most common real shape and it reads far better than nested ternaries.
//
//    The thing to be careful about is what React SKIPS: null, undefined, and
//    booleans. Everything else renders — including 0. So {items.length &&
//    <List/>} puts a literal 0 on the page when the array is empty, because
//    && returns its operand, not a boolean. I write {items.length > 0 && ...}.
//    The string version is sneakier: an empty string hides the element
//    instead of showing junk, so it looks like a data bug.
//
//    The other cost people miss is that conditionals change TREE SHAPE.
//    Toggling between <div><Input/></div> and <Input/> changes the type at
//    that slot, so React remounts and the user's text disappears. If state
//    must survive, I change props instead of shape."
//
// The 0-vs-false explanation plus the tree-shape point is a senior answer.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why does {0 && <X/>} render "0"?
// A1. && returns an operand, not a boolean. 0 is falsy so it returns 0, and
//     React renders numbers. It only skips null, undefined, and booleans.
//
// Q2. Does {"" && <X/>} have the same bug?
// A2. Mechanically yes — it returns "". But an empty string renders an
//     invisible empty text node, so it fails silently instead of visibly.
//
// Q3. && or ternary?
// A3. && when there is no else. Ternary for two branches. Neither for four
//     states — use early returns.
//
// Q4. Why does toggling a conditional wrapper reset my input?
// A4. It changes the element type at that slot, so reconciliation destroys
//     and rebuilds the subtree. Change props, not shape.
//
// Q5. Can I put an early return above a hook?
// A5. No. Hooks are matched by call order, so a return that skips hooks
//     corrupts the slots. All hooks first, then guards.
//
// Q6. Does {cond && <Heavy/>} avoid the cost of Heavy?
// A6. Yes — the element is never created, so Heavy never renders. But an
//     object lookup { a: <Heavy/> } DOES create every element (cheap), and
//     { a: renderHeavy() } CALLS every function (not cheap).
//
// Q7. hidden/CSS vs unmounting?
// A7. Unmounting frees memory and resets state. CSS-hiding preserves state,
//     scroll, and avoids remount cost — better for a frequently toggled panel,
//     worse for expensive or sensitive content that should not exist.
//
// Q8. Why is {true} skipped?
// A8. So that && works. The false branch of `cond && <X/>` produces a boolean,
//     and React skipping booleans is what makes the pattern render nothing.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What does React skip?
//   Back : null, undefined, and booleans. Everything else renders.
//
// Flashcard 2:
//   Front: Why does {items.length && <X/>} show "0"?
//   Back : && returns the operand (0), not false. Numbers render.
//
// Flashcard 3:
//   Front: What is the fix?
//   Back : {items.length > 0 && <X/>} — make the left side a real boolean.
//
// Flashcard 4:
//   Front: Best pattern for loading/error/empty/data?
//   Back : Early returns, after all hooks.
//
// Flashcard 5:
//   Front: Why did my input lose its text on toggle?
//   Back : The conditional changed the tree SHAPE, so the type changed →
//          remount. Change props instead.
//
// Flashcard 6:
//   Front: How do you sound senior?
//   Back : Explain 0-vs-false via && returning operands, then name the
//          tree-shape cost.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Predict before running: {NaN && <X/>}, {[] && <X/>}, {"0" && <X/>}.
//   Two of those three surprise most developers.
//
// Task 2:
//   Add Symbol to §8's error cases. Does it throw? Check React's real
//   behavior and match it.
//
// Task 3:
//   Rewrite withEarlyReturn as nested ternaries. Look at it. Now you know
//   why the pattern exists.
//
// Task 4:
//   Break §7 on purpose: make the stable version conditionally render a
//   <span> wrapper instead of a className. Predict the remount first.
//
// Task 5:
//   Build the object-lookup pattern with a console.log inside each value.
//   Watch every branch construct on every render. Then wrap the values in
//   functions and see the difference.
//
// Task 6:
//   Explain in 60 seconds why {count && <Badge/>} is a bug but
//   {isOpen && <Modal/>} is fine.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   React skips null, undefined, and booleans. 0 is a number, so 0 renders.
//
// If you remember the common bug:
//   {items.length && <List/>} prints a literal 0 on an empty list, because
//   && returns its operand.
//
// If you remember the professional framing:
//   Conditionals are free in code and expensive in the tree — changing shape
//   remounts and wipes state. Change props when state must survive.
//
// NEXT TOPIC -> 08_list-rendering.js
