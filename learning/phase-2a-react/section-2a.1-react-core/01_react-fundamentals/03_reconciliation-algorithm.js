// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  03_reconciliation-algorithm.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Reconciliation algorithm
//
// WHAT YOU WILL MASTER HERE:
//   1. Exact definition in interview language
//   2. Why O(n³) became O(n) — the two heuristics, stated precisely
//   3. A working reconciler you build yourself (keyed and unkeyed)
//   4. Why "same position + same type = same component" causes real bugs
//   5. The component-defined-inside-a-component bug, proven
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/03_reconciliation-algorithm.js"
//
// Prerequisite: 02_virtual-dom-concept.js — you built a naive diff there.
// This file is that diff, done properly.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Reconciliation:
// The algorithm React uses to decide, for every node in the new tree,
// whether to UPDATE the existing DOM node, MOVE it, or DESTROY it and
// create a new one.
//
// If interviewer says "explain it simply", say:
// "It is React deciding what changed. Same type in the same position means
//  reuse the DOM node and just update props. Different type means tear the
//  whole subtree down and rebuild it."
//
// If interviewer asks "why does it matter?", say:
// "Because 'tear down and rebuild' destroys state — component state, focus,
//  scroll, animations. Most mysterious 'my state reset itself' bugs are
//  reconciliation doing exactly what it was told."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   identity = type + position (or type + key)
//
// The problem React had to solve:
//   Comparing two arbitrary trees optimally is O(n³). For 1000 nodes that
//   is a billion operations. Unusable.
//
// The two heuristics that make it O(n):
//
//   HEURISTIC 1 — Different types produce different trees.
//     <div> → <span>  = do not even look inside. Destroy, rebuild.
//     Never tries to be clever. Never moves a node between parents.
//
//   HEURISTIC 2 — The developer hints stability with a key.
//     Without keys, children are matched BY INDEX (position).
//     With keys, children are matched BY KEY, so React can move nodes.
//
// Runtime rule:
//   React compares trees LEVEL BY LEVEL. It never compares a node at depth 2
//   with a node at depth 3. A node that moves to a different parent is always
//   destroyed and recreated, even if it is identical.
//
// Practical rule:
//   State is attached to the POSITION in the tree, not to your component
//   name. Change the position or the type, and the state is gone.
//
// Common trap:
//   Thinking React "finds" your component wherever it moved to.
//   It does not. It looks at one slot and asks: same type as before? Yes →
//   reuse. No → destroy.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD THE RECONCILER
// ══════════════════════════════════════════════════════════════════

function h(type, props, ...children) {
  const { key = null, ...rest } = props || {};
  return { type, key, props: rest, children: children.flat() };
}

// Every decision the reconciler can make:
//   UPDATE  — same type, reuse the DOM node, patch props
//   REPLACE — different type, destroy subtree + create new  ← STATE LOST
//   INSERT  — new node
//   REMOVE  — node gone
//   MOVE    — same key, different index (only possible WITH keys)

function reconcile(oldNode, newNode, path = "root", effects = []) {
  // Case 1 — node was removed
  if (oldNode && !newNode) {
    effects.push({ op: "REMOVE", path, type: oldNode.type });
    return effects;
  }

  // Case 2 — node was added
  if (!oldNode && newNode) {
    effects.push({ op: "INSERT", path, type: newNode.type });
    return effects;
  }

  // Case 3 — text nodes
  if (typeof oldNode === "string" || typeof newNode === "string") {
    if (oldNode !== newNode) {
      effects.push({ op: "UPDATE_TEXT", path, from: oldNode, to: newNode });
    }
    return effects;
  }

  // Case 4 — HEURISTIC 1: different type = destroy the whole subtree.
  // React does not look inside. This is where state dies.
  if (oldNode.type !== newNode.type) {
    effects.push({
      op: "REPLACE",
      path,
      from: nameOf(oldNode.type),
      to: nameOf(newNode.type),
      note: "subtree destroyed — ALL state below this point is lost",
    });
    return effects;
  }

  // Case 5 — same type: REUSE the node, patch only changed props
  for (const key of new Set([
    ...Object.keys(oldNode.props),
    ...Object.keys(newNode.props),
  ])) {
    if (oldNode.props[key] !== newNode.props[key]) {
      effects.push({ op: "SET_PROP", path, key, to: newNode.props[key] });
    }
  }

  reconcileChildren(oldNode, newNode, path, effects);
  return effects;
}

function nameOf(type) {
  return typeof type === "function" ? type.name : type;
}

function reconcileChildren(oldNode, newNode, path, effects) {
  const oldKids = oldNode.children;
  const newKids = newNode.children;

  const isKeyed = newKids.length > 0 &&
    newKids.every(c => typeof c === "object" && c.key !== null);

  if (!isKeyed) {
    // HEURISTIC 2a — no keys: match strictly BY INDEX.
    // React does not look for a matching node. Slot 0 vs slot 0. That is all.
    const len = Math.max(oldKids.length, newKids.length);
    for (let i = 0; i < len; i++) {
      reconcile(oldKids[i], newKids[i], `${path}.${i}`, effects);
    }
    return effects;
  }

  // HEURISTIC 2b — keyed: build a map, match by key, detect moves.
  const oldByKey = new Map();
  oldKids.forEach((child, index) => {
    if (typeof child === "object" && child.key !== null) {
      oldByKey.set(child.key, { child, index });
    }
  });

  newKids.forEach((newChild, newIndex) => {
    const match = oldByKey.get(newChild.key);

    if (!match) {
      effects.push({ op: "INSERT", path: `${path}[${newChild.key}]`, type: newChild.type });
      return;
    }

    if (match.index !== newIndex) {
      effects.push({
        op: "MOVE",
        path: `${path}[${newChild.key}]`,
        from: match.index,
        to: newIndex,
        note: "node reused — state PRESERVED",
      });
    }

    reconcile(match.child, newChild, `${path}[${newChild.key}]`, effects);
    oldByKey.delete(newChild.key);
  });

  // Anything left in the map was not in the new list
  for (const [key, { child }] of oldByKey) {
    effects.push({ op: "REMOVE", path: `${path}[${key}]`, type: child.type });
  }

  return effects;
}


// ══════════════════════════════════════════════════════════════════
// § 4 — HEURISTIC 1 IN ACTION: TYPE CHANGE DESTROYS EVERYTHING
// ══════════════════════════════════════════════════════════════════

console.log("§4 — same type vs different type:\n");

const before = h("div", null, h("input", { value: "typing..." }));
const sameType = h("div", null, h("input", { value: "typed more" }));
const diffType = h("span", null, h("input", { value: "typing..." }));

console.log("  <div><input/></div> → <div><input/></div> (value changed):");
console.log("   ", JSON.stringify(reconcile(before, sameType)));
console.log("    → node REUSED. Focus and caret survive.\n");

console.log("  <div><input/></div> → <span><input/></span>:");
console.log("   ", JSON.stringify(reconcile(before, diffType)));
console.log("    → REPLACE. The <input> is destroyed even though it is");
console.log("      IDENTICAL, because its PARENT's type changed.");
console.log("      React never looks inside. That is heuristic 1.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — HEURISTIC 2: INDEX MATCHING vs KEY MATCHING
// ══════════════════════════════════════════════════════════════════

console.log("§5 — prepending an item to a list:\n");

// Unkeyed list
const listBefore = h("ul", null,
  h("li", null, "Apple"),
  h("li", null, "Banana")
);
const listAfter = h("ul", null,
  h("li", null, "Cherry"),   // ← inserted at the FRONT
  h("li", null, "Apple"),
  h("li", null, "Banana")
);

console.log("  WITHOUT keys — matched by index:");
for (const effect of reconcile(listBefore, listAfter)) {
  console.log("   ", JSON.stringify(effect));
}
console.log("    → EVERY item was touched. React compared slot 0 (Apple)");
console.log("      to slot 0 (Cherry), saw different text, and rewrote it.");
console.log("      It has no idea an item was inserted.\n");

// Keyed list
const keyedBefore = h("ul", null,
  h("li", { key: "a" }, "Apple"),
  h("li", { key: "b" }, "Banana")
);
const keyedAfter = h("ul", null,
  h("li", { key: "c" }, "Cherry"),
  h("li", { key: "a" }, "Apple"),
  h("li", { key: "b" }, "Banana")
);

console.log("  WITH keys — matched by key:");
for (const effect of reconcile(keyedBefore, keyedAfter)) {
  console.log("   ", JSON.stringify(effect));
}
console.log("    → ONE insert, plus moves. Apple and Banana keep their");
console.log("      DOM nodes and their state.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE BUG THAT BREAKS PRODUCTION APPS
// ══════════════════════════════════════════════════════════════════
//
// This is the most valuable thing in this file. Interviewers love it
// because it looks like a React bug and is actually reconciliation
// working exactly as documented.

function Parent() { return null; }
function TextInput() { return null; }

console.log("§6 — the component-inside-a-component bug:\n");

// A component DEFINED INSIDE another component gets a NEW function
// identity on every single render of the parent.
function makeParentRender() {
  // Simulating: function Parent() { function Field() {...}; return <Field/> }
  function Field() { return null; }        // ← new function object each call
  return h("div", null, h(Field, null));
}

const render1 = makeParentRender();
const render2 = makeParentRender();

console.log("  Field identity stable across renders?",
  render1.children[0].type === render2.children[0].type);
console.log("  reconcile result:");
console.log("   ", JSON.stringify(reconcile(render1, render2)));
console.log("    → REPLACE on every render. type is a NEW function object,");
console.log("      so oldNode.type !== newNode.type. React destroys and");
console.log("      remounts. Your input loses focus on every keystroke,");
console.log("      state resets, useEffect re-fires forever.\n");
console.log("  FIX: define the component at module scope, never inside another.\n");

// The same shape, done correctly:
const fixed1 = h("div", null, h(TextInput, null));
const fixed2 = h("div", null, h(TextInput, null));
console.log("  Same component hoisted out:");
console.log("   ", JSON.stringify(reconcile(fixed1, fixed2)), "← zero effects\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — STATE IS TIED TO POSITION, NOT TO THE COMPONENT
// ══════════════════════════════════════════════════════════════════
//
// The classic interview puzzle:
//
//   {isLoggedIn ? <Input /> : <Input />}
//
// Same type, same position → React REUSES the node. Whatever you typed
// stays there when isLoggedIn flips. Surprising, but correct.
//
//   {isLoggedIn ? <Input /> : <div><Input /></div>}
//
// Different type at that slot → REPLACE → the text is gone.
//
// And the counter-intuitive one:
//
//   {show && <Counter />}
//   {show ? <Counter /> : null}
//
// Unmounting sets the slot to null. Remounting creates a FRESH Counter with
// state reset to its initial value. There is no "remembering."
//
// How to force a reset ON PURPOSE:
//   <Profile key={userId} />
//   Change the key → different identity → React unmounts the old and mounts
//   a fresh one. This is the idiomatic "reset state when the prop changes"
//   trick, and it is much better than a useEffect that resets state.

const slotA = h("div", null, h(TextInput, null));
const slotB = h("div", null, h("div", null, h(TextInput, null)));

console.log("§7 — same component, wrapped in a div:");
console.log("   ", JSON.stringify(reconcile(slotA, slotB).map(e => e.op)));
console.log("    → REPLACE. Adding a wrapper div reset your component's state.");
console.log("      This is why conditional wrappers cause 'random' state loss.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version                   Real React
//   ───────────                   ──────────
//   returns an effects array      flags each fiber (Placement, Update,
//                                 Deletion) and builds an effect list
//   recursive                     an interruptible loop over fibers
//   moves computed naively        a two-pass keyed algorithm; it optimizes
//                                 the common case (append/update) in one
//                                 pass before falling back to the key map
//   no lifecycle                  fires componentWillUnmount / effect
//                                 cleanups on deletion, in order
//   one pass                      render phase (can be thrown away and
//                                 restarted) then commit phase (atomic)
//
// One precise detail worth quoting:
//   React's keyed diff walks both lists from the left while keys match,
//   handling the extremely common "list grew at the end" case without ever
//   building the map. The map is the fallback for reorders.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Input loses focus every keystroke:
//   Component defined inside a component. → §6. The #1 cause.
//
// Bug 2 — Checkbox state attaches to the wrong row:
//   key={index} on a reorderable list. The key is the POSITION, so it never
//   changes, so React thinks nothing moved and only rewrites the text.
//   → 05_keys-in-lists.js
//
// Bug 3 — Component state mysteriously resets:
//   A conditional wrapper appeared, or the type changed at that slot. → §7.
//
// Bug 4 — State bleeds between users:
//   <Profile userId={id} /> without key={id}. Same type, same position →
//   reused → old user's state survives the prop change.
//   Fix: <Profile key={id} userId={id} />
//
// Bug 5 — Expensive remounts on every parent render:
//   An inline styled-component or a lazy() call inside render creates a new
//   type each time. Hoist them out.
//
// Bug 6 — Animation restarts randomly:
//   The node was replaced, not updated, so CSS transition state reset.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

const sameTypeEffects = reconcile(before, sameType);
assert(sameTypeEffects.every(e => e.op !== "REPLACE"), "same type reuses the node");

const diffTypeEffects = reconcile(before, diffType);
assert(diffTypeEffects[0].op === "REPLACE", "different type replaces the subtree");
assert(diffTypeEffects.length === 1, "REPLACE does not recurse into children");

const unkeyed = reconcile(listBefore, listAfter);
const keyed = reconcile(keyedBefore, keyedAfter);
assert(unkeyed.filter(e => e.op === "UPDATE_TEXT").length === 2,
  "unkeyed prepend rewrites every existing item");
assert(keyed.filter(e => e.op === "INSERT").length === 1,
  "keyed prepend inserts exactly one node");
assert(keyed.every(e => e.op !== "UPDATE_TEXT"),
  "keyed prepend rewrites no text at all");

assert(reconcile(render1, render2)[0].op === "REPLACE",
  "inline component definition forces a remount");
assert(reconcile(fixed1, fixed2).length === 0,
  "hoisted component produces no effects");

console.log("§10 — mini assertions passed for: Reconciliation algorithm");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how does reconciliation work?", answer like this:
//
//   "A general tree diff is O(n³), which is unusable, so React applies two
//    heuristics to get O(n).
//
//    First: different element types produce different trees. If a <div>
//    becomes a <span>, React does not look inside — it destroys the whole
//    subtree and rebuilds it. Same type means reuse the DOM node and patch
//    only the changed props.
//
//    Second: children are matched by index unless you give keys, in which
//    case they are matched by key. That is what lets React MOVE a node
//    instead of rewriting it.
//
//    The consequence people miss is that component state lives at a POSITION
//    in the tree, not with the component. So wrapping a component in a div
//    conditionally, or defining a component inside another component — which
//    gives it a new function identity every render — causes a remount and
//    silently wipes state. You can also use this deliberately: change key to
//    force a fresh instance when a prop like userId changes."
//
// Then offer to write the reconciler. It is about forty lines.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why is reconciliation O(n) and not O(n³)?
// A1. Two heuristics: different type = replace subtree without inspecting,
//     and keys give children stable identity. Both trade optimality for speed.
//
// Q2. What happens when a node moves to a different parent?
// A2. It is destroyed and recreated. React only compares level by level and
//     never matches across parents, even for identical nodes with the same key.
//
// Q3. Why does my input lose focus on every keystroke?
// A3. Almost always a component defined inside another component: new
//     function identity each render → type mismatch → remount. Hoist it out.
//
// Q4. Is {cond ? <A/> : <A/>} a remount?
// A4. No. Same type, same position → reused, state preserved. Surprises people.
//
// Q5. How do you deliberately reset a component's state?
// A5. Change its key. Idiomatic and cheaper than a reset-on-prop-change effect.
//
// Q6. Does React reuse the node if only the key changed?
// A6. No. A different key means a different identity, so unmount + mount,
//     even with the same type in the same position.
//
// Q7. What did Fiber change about reconciliation?
// A7. Not the heuristics — the execution. Fiber made the walk interruptible
//     and prioritized. → 04_react-fiber-architecture.js


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is reconciliation?
//   Back : Deciding update vs move vs destroy for each node in the new tree.
//
// Flashcard 2:
//   Front: What are the two heuristics?
//   Back : Different type = different tree (replace). Keys give children identity.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Defining a component inside a component — new type every render → remount.
//
// Flashcard 4:
//   Front: Where does component state actually live?
//   Back : At a position in the tree (type + key + slot), not with the component.
//
// Flashcard 5:
//   Front: How do you force a state reset?
//   Back : Change the key.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Reverse a keyed list of five items. Count the MOVE effects. Then do the
//   same unkeyed and count the UPDATE_TEXT effects. Explain the difference
//   to a junior in one sentence.
//
// Task 2:
//   Implement React's real optimization: walk both keyed lists from the left
//   while keys match, and only build the map when they diverge. Prove that
//   appending to the end now builds no map at all.
//
// Task 3:
//   Add UNMOUNT lifecycle logging to REPLACE and REMOVE. Watch §6 print an
//   unmount on every render. That is the focus bug, visible.
//
// Task 4:
//   Break §7 on purpose: swap <TextInput/> for a <textarea>. Predict the
//   effect list before running.
//
// Task 5:
//   Add key support to a non-list case: reconcile h("div",{key:"a"}) against
//   h("div",{key:"b"}). Should it REPLACE? Check what React does and match it.
//
// Task 6:
//   Explain in 60 seconds why key={index} is safe for a static list but
//   catastrophic for a sortable one.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Same type + same position = reuse. Anything else = destroy and rebuild.
//
// If you remember the common bug:
//   A component defined inside a component gets a new type every render,
//   so React remounts it forever. Focus dies on every keystroke.
//
// If you remember the professional framing:
//   State is tied to POSITION, not to your component. Once you internalize
//   that, "random state reset" bugs become predictable.
//
// NEXT TOPIC -> 04_react-fiber-architecture.js
