// ╔══════════════════════════════════════════════════════════════════╗
// ║   Built-in Hooks  →  13_useid.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useId
//
// WHAT YOU WILL MASTER HERE:
//   1. The problem it solves — hydration mismatch, PROVEN
//   2. Why a counter or Math.random() breaks SSR
//   3. The ID is derived from TREE POSITION, not a counter
//   4. What it is NOT for (list keys — a real interview trap)
//   5. One useId for many related IDs — the idiomatic pattern
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/02_built-in-hooks/13_useid.js"
//
// The smallest hook in React, and one of the best interview questions —
// because "why not just a counter?" has a genuinely deep answer.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useId:
// Generates a unique string ID that is GUARANTEED to be identical on the
// server and the client, for accessibility attributes.
//
// If interviewer says "explain it simply", say:
// "It gives you a stable unique id for htmlFor/aria attributes. The point is
//  that the server and the browser produce the SAME id, which a counter or
//  Math.random() cannot do."
//
// If interviewer asks "why does it matter?", say:
// "Because with SSR the same component renders twice, in two different
//  processes. Any id from a counter depends on how many components rendered
//  before it — and that order differs between server and client. You get a
//  hydration mismatch and your label stops being connected to your input."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   the same ID on the server and the client
//
// The problem, precisely:
//
//   SERVER                          CLIENT (hydration)
//   ──────                          ──────────────────
//   renders <Input> → id="input-1"  renders <Input> → id="input-1"?
//                                   ...only if the counter starts at the same
//                                   place AND the same components render in
//                                   the same order. With streaming SSR,
//                                   Suspense, or lazy boundaries, they do not.
//
// The insight:
//   useId does NOT use a counter. It derives the id from the component's
//   POSITION IN THE TREE. Position is the one thing that IS identical on
//   both sides — it is the same JSX producing the same tree.
//
//   That is why real React IDs look like «r1», «:r0:», «:R2m:» — they encode
//   a path through the tree in base 32, not a sequence number.
//
// Runtime rule:
//   The ID is stable across re-renders and identical across server/client.
//   It is NOT globally sequential and you must not parse it.
//
// Practical rule:
//   useId is for ACCESSIBILITY attributes. htmlFor, aria-describedby,
//   aria-labelledby. That is the whole use case.
//
// Common trap:
//   Using it for list keys. It is one ID per COMPONENT INSTANCE, not per
//   item — you cannot call it in a loop, and it tells you nothing about data
//   identity. → §6


// ══════════════════════════════════════════════════════════════════
// § 3 — WHY A COUNTER BREAKS
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the counter approach, and why SSR kills it:\n");

// The naive implementation everyone writes first:
function createCounterId() {
  let counter = 0;
  return () => `input-${++counter}`;
}

// SERVER: renders the whole page in one pass.
const serverCounter = createCounterId();
const serverIds = {
  header: serverCounter(),      // input-1  (a search box in the header)
  email: serverCounter(),       // input-2
  password: serverCounter(),    // input-3
};

// CLIENT: hydrates. But the header is inside <Suspense> and streams in
// LATER, so the form hydrates first. Different order → different numbers.
const clientCounter = createCounterId();
const clientIds = {
  email: clientCounter(),       // input-1  ← was input-2 on the server!
  password: clientCounter(),    // input-2  ← was input-3!
  header: clientCounter(),      // input-3  ← was input-1!
};

console.log("  field    | server   | client   | match?");
console.log("  ---------|----------|----------|-------");
for (const field of ["header", "email", "password"]) {
  const match = serverIds[field] === clientIds[field];
  console.log(`  ${field.padEnd(8)} | ${serverIds[field].padEnd(8)} | ` +
    `${clientIds[field].padEnd(8)} | ${match ? "✅" : "🐛 MISMATCH"}`);
}

console.log("\n  Every id is wrong. The HTML says <label for='input-2'> and the");
console.log("  client thinks the email input is 'input-1'. React logs a");
console.log("  hydration warning, and — worse — clicking the label no longer");
console.log("  focuses the input. A screen reader announces the wrong field.");
console.log("\n  This is not hypothetical. Streaming SSR, Suspense boundaries,");
console.log("  and lazy components all change render ORDER between server and");
console.log("  client. A counter is a bet on order that you will lose.\n");

// And Math.random / uuid is worse — it cannot match even in principle:
console.log("  Math.random()/uuid: server 'x7f2a', client 'k9m1' → guaranteed");
console.log("  mismatch on EVERY id, every time. Not fixable.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — HOW useId ACTUALLY WORKS: TREE POSITION
// ══════════════════════════════════════════════════════════════════
//
// The key realization: the server and client render the SAME JSX, so they
// produce the SAME TREE SHAPE. A component's path from the root is therefore
// identical on both sides — regardless of order or timing.
//
// So: derive the ID from the path, not from a counter.

console.log("§4 — deriving the ID from tree position:\n");

// A tree where each node knows its path from the root:
function buildTree(node, path = []) {
  const fiber = { name: node.name, path, children: [] };
  (node.children || []).forEach((child, index) => {
    fiber.children.push(buildTree(child, [...path, index]));
  });
  return fiber;
}

// THE HOOK. The ID is the path, encoded.
function useId(fiber) {
  // Real React encodes the path in base 32 and wraps it in colons/guillemets
  // so it cannot collide with a hand-written id. The principle is the same.
  return ":r" + fiber.path.join("") + ":";
}

const page = {
  name: "Page",
  children: [
    { name: "Header", children: [{ name: "SearchInput" }] },
    { name: "Form", children: [{ name: "EmailInput" }, { name: "PasswordInput" }] },
  ],
};

function collectIds(fiber, out = {}) {
  if (fiber.name.includes("Input")) out[fiber.name] = useId(fiber);
  for (const child of fiber.children) collectIds(child, out);
  return out;
}

// The server renders the tree in one pass:
const serverTree = buildTree(page);
const serverUseIds = collectIds(serverTree);

// The client hydrates — DIFFERENT ORDER (the form first, header streams later).
// It does not matter. Position is position.
const clientTree = buildTree(page);
const clientUseIds = {};
collectIds(clientTree.children[1], clientUseIds);   // Form first
collectIds(clientTree.children[0], clientUseIds);   // Header later

console.log("  component      | path  | server id | client id | match?");
console.log("  ---------------|-------|-----------|-----------|-------");
for (const name of ["SearchInput", "EmailInput", "PasswordInput"]) {
  const match = serverUseIds[name] === clientUseIds[name];
  console.log(`  ${name.padEnd(14)} | ${JSON.stringify(
    serverTree.children.flatMap(function find(c) {
      return c.name === name ? [c.path] : c.children.flatMap(find);
    })[0] || []).padEnd(5)} | ${serverUseIds[name].padEnd(9)} | ` +
    `${clientUseIds[name].padEnd(9)} | ${match ? "✅" : "🐛"}`);
}

console.log("\n  The client rendered the Form BEFORE the Header — the exact");
console.log("  reordering that broke the counter — and every id still matches.");
console.log("  Because the id does not depend on WHEN the component rendered.");
console.log("  It depends on WHERE it sits in the tree, and the tree is the");
console.log("  same on both sides. That is the whole trick.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE ACTUAL USE CASE
// ══════════════════════════════════════════════════════════════════
//
// Accessibility. That is it.
//
//   function PasswordField() {
//     const id = useId();
//     return (
//       <>
//         <label htmlFor={id}>Password</label>
//         <input id={id} type="password" aria-describedby={id + "-hint"} />
//         <p id={id + "-hint"}>At least 8 characters</p>
//       </>
//     );
//   }
//
// Why this MUST be generated and not hard-coded:
//   <PasswordField /> might appear twice on a page — a signup form and a
//   change-password modal. Hard-code id="password" and you have duplicate
//   IDs, which is invalid HTML. Clicking either label focuses the FIRST
//   input, always. The second field is unreachable by label click and screen
//   readers announce it wrong.
//
// Note the pattern in that example: ONE useId, many derived IDs.
//
//   ✅ const id = useId();
//      <input id={id} aria-describedby={`${id}-hint`} />
//      <p id={`${id}-hint`}>...</p>
//
//   ❌ const inputId = useId();
//      const hintId = useId();      // wasteful — one is enough
//
// React's docs call this out explicitly: generate one and suffix it.

console.log("§5 — the same component twice on one page:\n");

const form = buildTree({
  name: "Page",
  children: [
    { name: "SignupForm", children: [{ name: "PasswordField" }] },
    { name: "SettingsModal", children: [{ name: "PasswordField" }] },
  ],
});

const instances = [];
(function walk(f) {
  if (f.name === "PasswordField") instances.push(useId(f));
  f.children.forEach(walk);
})(form);

console.log("  <PasswordField /> rendered twice:");
instances.forEach((id, i) => {
  console.log(`    instance ${i + 1}: id="${id}" → <label for="${id}">, ` +
    `<input id="${id}">, <p id="${id}-hint">`);
});
console.log("  unique?", instances[0] !== instances[1], "✅");
console.log("\n  Hard-coding id='password' would give both fields the same id.");
console.log("  Invalid HTML, and clicking EITHER label focuses the first input.");
console.log("  One useId per instance, suffixed for the hint. Done.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — WHAT IT IS NOT FOR (the interview trap)
// ══════════════════════════════════════════════════════════════════
//
// "Can I use useId for list keys?"
//
// No — and the reason is worth articulating precisely:
//
//   1. HOOKS CANNOT BE CALLED IN A LOOP. items.map(() => useId()) violates
//      the Rules of Hooks. It is mechanically impossible.
//      → 03_custom-hooks/01_rules-of-hooks.js
//
//   2. It is ONE id per COMPONENT INSTANCE, not per item. Even if you could
//      call it in a loop, it does not know your data.
//
//   3. Keys need DATA identity. A key must follow the item when the array
//      reorders. useId follows the POSITION — which is exactly the bug that
//      key={index} has. → 05_keys-in-lists.js
//
// Same reasoning for anything else that needs data identity:
//   ❌ database ids       — that is your server's job
//   ❌ list keys          — use item.id
//   ❌ a cache key        — it is position-based, not content-based
//   ❌ a CSS class name   — real React ids contain colons «:r0:», which are
//                          not valid in CSS selectors without escaping
//
// That last one is a genuine gotcha people hit: document.querySelector("#:r0:")
// throws. You must use CSS.escape() or getElementById.

console.log("§6 — why useId cannot be a list key:\n");
console.log("  ❌ {items.map(item => <li key={useId()}>)}");
console.log("     → violates the Rules of Hooks — you cannot call a hook in a loop.");
console.log("\n  And even conceptually: useId is position-derived. A key must");
console.log("  follow the DATA when the list reorders. Position-based keys are");
console.log("  exactly the key={index} bug. → 05_keys-in-lists.js");
console.log("\n  Real React ids look like ':r0:' — note the colons. That means:");
console.log("    document.querySelector('#:r0:')  → 💥 invalid selector");
console.log("    document.getElementById(':r0:')  → ✅ works");
console.log("    CSS.escape(id)                   → ✅ if you need a selector\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real React
//   ───────────               ──────────
//   path.join("")             the tree path encoded in BASE 32, so deep trees
//                             stay compact
//   ":r" + path + ":"         React 18: ":r0:" — colons chosen deliberately
//                             because they are invalid in hand-written ids,
//                             so a collision is impossible.
//                             React 19: "«r0»" — guillemets, and they moved
//                             AWAY from colons partly because of the CSS
//                             selector problem.
//   n/a                       identifierPrefix option on createRoot /
//                             hydrateRoot — required when you render MULTIPLE
//                             React roots on one page, or their ids collide
//   n/a                       useId works without SSR too — it is just
//                             unique-per-instance then
//
// The identifierPrefix detail is a great one to know:
//   Two independent React apps on one page both start their tree at the root,
//   so both generate ":r0:". You pass identifierPrefix to disambiguate. This
//   comes up in micro-frontends and in widget embedding.


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Hydration mismatch on every id:
//   A counter or Math.random() for ids. → §3.
//
// Bug 2 — Clicking a label does not focus the input:
//   Duplicate hard-coded ids, or a mismatched htmlFor. The a11y failure that
//   useId exists to prevent.
//
// Bug 3 — "Rendered more hooks than during the previous render":
//   useId called inside a map. → §6.
//
// Bug 4 — querySelector('#' + id) throws:
//   React 18 ids contain colons. Use getElementById or CSS.escape.
//
// Bug 5 — Two React roots generate the same ids:
//   Missing identifierPrefix. → §7.
//
// Bug 6 — Using useId as a list key:
//   Position-derived, and mechanically impossible in a loop anyway.
//
// Bug 7 — Wasting a useId per attribute:
//   One id, suffixed, is the idiom. → §5.
//
// Bug 8 — Expecting the ids to be sequential or parseable:
//   They encode a tree path. Do not parse them; they are opaque and the
//   format has already changed once (18 → 19).


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The counter fails:
assert(serverIds.email !== clientIds.email,
  "a counter gives DIFFERENT ids when the render order differs → hydration mismatch");
assert(serverIds.header === "input-1" && clientIds.header === "input-3",
  "the header rendered first on the server and last on the client");

// useId survives the same reordering — the headline:
assert(serverUseIds.EmailInput === clientUseIds.EmailInput,
  "useId: SAME id despite the client rendering the Form first");
assert(serverUseIds.SearchInput === clientUseIds.SearchInput, "...for every field");
assert(serverUseIds.PasswordInput === clientUseIds.PasswordInput, "...all of them");

// Because it is position-derived, not order-derived:
assert(serverUseIds.EmailInput === ":r10:",
  "the id encodes the PATH — child 1 of the root, child 0 of that");
assert(serverUseIds.SearchInput === ":r00:", "and the search box is at path 0,0");

// Uniqueness per instance:
assert(instances[0] !== instances[1],
  "the same component twice → two different ids");
assert(new Set(Object.values(serverUseIds)).size === 3,
  "every field on the page has a unique id");

// Stability across re-renders (position does not change):
const rerender = buildTree(page);
assert(collectIds(rerender).EmailInput === serverUseIds.EmailInput,
  "re-rendering gives the SAME id — position is stable");

console.log("§9 — mini assertions passed for: useId");
console.log("\n  The pair that matters: the counter's ids differ across");
console.log("  server/client, useId's are identical — under the exact same");
console.log("  reordering.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is useId for?", answer like this:
//
//   "It generates a unique id that's identical on the server and the client,
//    for accessibility attributes — htmlFor, aria-describedby, that sort of
//    thing.
//
//    The question behind the question is 'why not just a counter?' Because
//    with SSR the same component renders twice in two different processes, and
//    a counter's value depends on how many components rendered BEFORE it. With
//    streaming SSR or Suspense boundaries, that order genuinely differs — the
//    header might stream in after the form on the client. So the server writes
//    label for='input-2' and the client thinks the email field is 'input-1'.
//    You get a hydration warning, and clicking the label stops focusing the
//    input. Math.random or uuid is worse — it can't match even in principle.
//
//    The clever part is how useId avoids it: the id isn't a counter at all,
//    it's derived from the component's POSITION IN THE TREE, encoded in base
//    32. Position is the one thing guaranteed identical on both sides, because
//    it's the same JSX producing the same tree — regardless of render order or
//    timing.
//
//    It's specifically for a11y, not for keys. You can't call a hook in a loop
//    anyway, but conceptually it's position-derived and a key needs to follow
//    the DATA when the list reorders — that's the key={index} bug.
//
//    Two practical notes: generate one id and suffix it rather than calling
//    useId per attribute. And React 18's ids contain colons, so
//    querySelector('#:r0:') throws — use getElementById. React 19 switched to
//    guillemets, partly for that reason."
//
// The tree-position explanation is what makes this a great answer — most
// people just say "it's for SSR ids".


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is useId for?
// A1. Unique ids for accessibility attributes that match across SSR and
//     hydration.
//
// Q2. Why not a counter?
// A2. It depends on render ORDER, which differs between server and client
//     with streaming and Suspense. useId depends on tree POSITION, which does not.
//
// Q3. Why not Math.random or uuid?
// A3. They cannot produce the same value in two processes. Guaranteed mismatch.
//
// Q4. Can you use it for list keys?
// A4. No. Hooks cannot be called in a loop, and it is position-derived —
//     a key must follow the data.
//
// Q5. What do the ids look like?
// A5. React 18: ":r0:". React 19: "«r0»". Base-32 tree paths, deliberately
//     containing characters you would never hand-write. Opaque — do not parse.
//
// Q6. Why can't I use it in querySelector?
// A6. React 18's colons are invalid in CSS selectors. Use getElementById or
//     CSS.escape.
//
// Q7. What is identifierPrefix?
// A7. A createRoot/hydrateRoot option to disambiguate ids when multiple React
//     roots share a page. Without it, both start at ":r0:".
//
// Q8. Does it work without SSR?
// A8. Yes — it is just unique-per-instance. The SSR guarantee is the reason
//     it exists, not a requirement to use it.
//
// Q9. One useId or several?
// A9. One, suffixed. `${id}-hint`, `${id}-error`. React's docs recommend this.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useId?
//   Back : A unique id identical on server and client, for a11y attributes.
//
// Flashcard 2:
//   Front: How does it work?
//   Back : Derived from TREE POSITION (base 32), not a counter.
//
// Flashcard 3:
//   Front: Why does a counter break?
//   Back : It depends on render order, which differs under streaming SSR.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : Trying to use it for list keys. Position ≠ data identity.
//
// Flashcard 5:
//   Front: One useId or many?
//   Back : One, suffixed: `${id}-hint`.
//
// Flashcard 6:
//   Front: Why does querySelector fail?
//   Back : React 18 ids contain colons. Use getElementById.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Explain tree position vs render order, and mention identifierPrefix.


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write useId from the tree path from memory. The insight is one line:
//   position is identical across server and client; order is not.
//
// Task 2:
//   Add base-32 encoding to the path. Compare the length for a tree 10 levels
//   deep. Now you know why React does it.
//
// Task 3:
//   Add identifierPrefix and render two roots. Confirm they collide without
//   it and not with it.
//
// Task 4:
//   Break §4: derive the id from a counter incremented during the walk.
//   Re-run the reordered client and watch the ids diverge again.
//
// Task 5:
//   Try to use useId in a map. Watch the Rules of Hooks break. Then explain
//   why no amount of cleverness fixes it.
//
// Task 6:
//   Explain in 60 seconds why the server and client disagree about
//   'input-2', to someone who just shipped a counter-based id.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The id comes from TREE POSITION, not a counter — because position is the
//   same on the server and the client, and order is not.
//
// If you remember the common bug:
//   A counter or uuid for ids = a hydration mismatch and a label that no
//   longer focuses its input.
//
// If you remember the professional framing:
//   It is for accessibility attributes only. One id, suffixed. Never a key.
//
// NEXT TOPIC -> 14_usesyncexternalstore.js
