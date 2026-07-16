// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  02_virtual-dom-concept.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Virtual DOM concept
//
// WHAT YOU WILL MASTER HERE:
//   1. Exact definition in interview language
//   2. The "Virtual DOM is fast" MYTH — and what is actually true
//   3. A working mini DOM + renderer you build yourself
//   4. Why batching, not speed, is the real win
//   5. Real bugs and production trade-offs
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/02_virtual-dom-concept.js"
//
// Prerequisite: 01_jsx-compilation.js — the VDOM IS the element tree that
// createElement returns. Same object, different name.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Virtual DOM:
// A lightweight JavaScript object tree that mirrors what the real DOM
// should look like, so React can figure out the minimum set of real DOM
// operations by comparing two plain objects instead of reading the browser.
//
// If interviewer says "explain it simply", say:
// "It is a description of the UI as plain objects. React builds a new one
//  every render, compares it to the previous one, and only touches the real
//  DOM where they differ."
//
// If interviewer asks "why does it matter?", say:
// "Because it lets me write declarative code. I describe the final UI for
//  a given state, and React works out the imperative steps to get there."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   a cheap description, not a faster DOM
//
// The cycle:
//
//   state change
//        ↓
//   re-render component  →  NEW vdom tree
//        ↓
//   diff(old vdom, new vdom)  →  list of patches
//        ↓
//   commit patches to real DOM   ← only this part touches the browser
//
// Runtime rule:
//   The VDOM is rebuilt from scratch on every render. It is garbage.
//   The point is that creating objects is cheap; touching the DOM is not.
//
// Practical rule:
//   React does not make the DOM fast. It makes AVOIDING the DOM automatic.
//
// Common trap:
//   Saying "the Virtual DOM is faster than the real DOM." It is not — it is
//   strictly extra work on top of the real DOM. See §5. This exact sentence
//   is a red flag for senior interviewers.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD A MINI DOM (so we can count real DOM operations)
// ══════════════════════════════════════════════════════════════════
//
// Node has no DOM. So we build one — and instrument it, so we can literally
// count how many operations each strategy costs.

let domOperationCount = 0;

function createMiniDOM() {
  domOperationCount = 0;

  function createNode(tag) {
    domOperationCount++;                       // createElement is expensive
    return { tag, attrs: {}, children: [], text: null };
  }

  function setAttribute(node, key, value) {
    domOperationCount++;                       // a real layout-affecting write
    node.attrs[key] = value;
  }

  function setText(node, text) {
    domOperationCount++;
    node.text = text;
  }

  function appendChild(parent, child) {
    domOperationCount++;
    parent.children.push(child);
  }

  function removeChild(parent, child) {
    domOperationCount++;
    parent.children = parent.children.filter(c => c !== child);
  }

  function serialize(node) {
    if (typeof node === "string") return node;
    const attrs = Object.entries(node.attrs)
      .map(([k, v]) => ` ${k}="${v}"`)
      .join("");
    const inner = node.text !== null
      ? node.text
      : node.children.map(serialize).join("");
    return `<${node.tag}${attrs}>${inner}</${node.tag}>`;
  }

  return { createNode, setAttribute, setText, appendChild, removeChild, serialize };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE VDOM: JUST OBJECTS
// ══════════════════════════════════════════════════════════════════

function h(type, props, ...children) {
  return { type, props: props || {}, children: children.flat() };
}

// This is a VDOM tree. Look at it. It is nothing but nested objects.
const screenA = h("div", { className: "app" },
  h("h1", null, "Inbox"),
  h("p", { className: "count" }, "3 unread")
);

console.log("§4 — the VDOM is just a plain object:");
console.log(JSON.stringify(screenA, null, 2).split("\n").slice(0, 12).join("\n"));
console.log("  ...\n");
console.log("  There is no browser here. No DOM. Just data describing UI.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE MYTH: "VIRTUAL DOM IS FASTER"
// ══════════════════════════════════════════════════════════════════
//
// Prove it to yourself. Mount the same UI two ways and count operations.

const dom = createMiniDOM();

function mount(vnode, parent) {
  if (typeof vnode === "string" || typeof vnode === "number") {
    const textNode = dom.createNode("#text");
    dom.setText(textNode, String(vnode));
    dom.appendChild(parent, textNode);
    return textNode;
  }

  const node = dom.createNode(vnode.type);
  for (const [key, value] of Object.entries(vnode.props)) {
    dom.setAttribute(node, key, value);
  }
  for (const child of vnode.children) {
    mount(child, node);
  }
  dom.appendChild(parent, node);
  return node;
}

const root = dom.createNode("#root");
mount(screenA, root);
const vdomCost = domOperationCount;

// Now the hand-written imperative version doing the EXACT same thing:
const dom2 = createMiniDOM();
const root2 = dom2.createNode("#root");
const div = dom2.createNode("div");
dom2.setAttribute(div, "className", "app");
const h1 = dom2.createNode("h1");
const h1text = dom2.createNode("#text");
dom2.setText(h1text, "Inbox");
dom2.appendChild(h1, h1text);
dom2.appendChild(div, h1);
const p = dom2.createNode("p");
dom2.setAttribute(p, "className", "count");
const ptext = dom2.createNode("#text");
dom2.setText(ptext, "3 unread");
dom2.appendChild(p, ptext);
dom2.appendChild(div, p);
dom2.appendChild(root2, div);
const manualCost = domOperationCount;

console.log("§5 — the honest comparison (first mount):");
console.log("  VDOM path   :", vdomCost, "DOM operations");
console.log("  Hand-written:", manualCost, "DOM operations");
console.log("  → IDENTICAL. Plus React ALSO built the object tree first.");
console.log("  On first mount, the VDOM is pure overhead. Say this out loud");
console.log("  in an interview and you separate yourself from the crowd.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — WHERE THE VDOM ACTUALLY WINS: THE UPDATE
// ══════════════════════════════════════════════════════════════════
//
// One number changed: "3 unread" → "4 unread".
// Naive approach: blow away the DOM and rebuild. Correct, and very common
// in the jQuery era (innerHTML = template(state)).

const screenB = h("div", { className: "app" },
  h("h1", null, "Inbox"),
  h("p", { className: "count" }, "4 unread")   // ← only this changed
);

// Strategy 1 — rebuild everything (the innerHTML approach):
const domRebuild = createMiniDOM();
const rebuildRoot = domRebuild.createNode("#root");
(function rebuild(vnode, parent) {
  if (typeof vnode === "string") {
    const t = domRebuild.createNode("#text");
    domRebuild.setText(t, vnode);
    domRebuild.appendChild(parent, t);
    return;
  }
  const n = domRebuild.createNode(vnode.type);
  for (const [k, v] of Object.entries(vnode.props)) domRebuild.setAttribute(n, k, v);
  for (const c of vnode.children) rebuild(c, n);
  domRebuild.appendChild(parent, n);
})(screenB, rebuildRoot);
const rebuildCost = domOperationCount;

// Strategy 2 — diff the two object trees, patch only what differs:
const domPatch = createMiniDOM();
domOperationCount = 0;   // start counting from the update only

function diff(oldNode, newNode, patches = []) {
  if (typeof oldNode === "string" || typeof newNode === "string") {
    if (oldNode !== newNode) {
      patches.push({ op: "SET_TEXT", from: oldNode, to: newNode });
    }
    return patches;
  }
  if (oldNode.type !== newNode.type) {
    patches.push({ op: "REPLACE", to: newNode.type });
    return patches;
  }
  for (const key of new Set([
    ...Object.keys(oldNode.props),
    ...Object.keys(newNode.props),
  ])) {
    if (oldNode.props[key] !== newNode.props[key]) {
      patches.push({ op: "SET_ATTR", key, to: newNode.props[key] });
    }
  }
  const len = Math.max(oldNode.children.length, newNode.children.length);
  for (let i = 0; i < len; i++) {
    diff(oldNode.children[i], newNode.children[i], patches);
  }
  return patches;
}

const patches = diff(screenA, screenB);
for (const patch of patches) {
  domOperationCount++;   // apply it — one op per patch
}
const patchCost = domOperationCount;

console.log("§6 — the update: '3 unread' → '4 unread'");
console.log("  Rebuild everything:", rebuildCost, "DOM operations");
console.log("  Diff + patch      :", patchCost, "DOM operation(s)");
console.log("  patches:", JSON.stringify(patches));
console.log("  ↑ THIS is the win. Not raw speed — MINIMAL WRITES,");
console.log("    computed automatically from declarative code.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHY MINIMAL WRITES MATTER SO MUCH
// ══════════════════════════════════════════════════════════════════
//
// A DOM write is not just "slow because it is native". The real costs:
//
//   1. LAYOUT / REFLOW — changing geometry forces the browser to
//      recompute positions of possibly the entire page.
//   2. LAYOUT THRASHING — write, then read offsetHeight, then write again
//      forces SYNCHRONOUS layout each time. This is the classic killer.
//   3. LOST STATE — rebuilding a node destroys focus, text selection,
//      scroll position, video playback, and CSS transition state.
//
// Point 3 is the one juniors miss. Try innerHTML on a form the user is
// typing in — the caret jumps out on every keystroke. React's diff keeps
// the same node alive, so focus survives. That is not a performance win,
// it is a CORRECTNESS win.
//
// Interview line:
//   "The Virtual DOM is not about being faster than the DOM. It is about
//    making the minimal-update strategy the DEFAULT, instead of something
//    I have to hand-write and get wrong."


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version                 Real React
//   ───────────                 ──────────
//   diff returns a patch array  effects are flagged on fiber nodes and
//                               collected into an effect list
//   recursive diff              an interruptible work loop over fibers
//                               (see 04_react-fiber-architecture.js)
//   children matched by index   keyed matching for lists
//                               (see 05_keys-in-lists.js)
//   patches applied immediately two phases: render (interruptible, no DOM)
//                               then commit (synchronous, touches DOM)
//   no components               function components, hooks, context
//
// Also worth knowing — the honest modern take:
//   Svelte and Solid have NO Virtual DOM. They compile to targeted updates
//   at build time, so they skip the diff entirely. React chose the VDOM for
//   flexibility (runtime-dynamic UI, one model for DOM/Native/canvas), not
//   because it is the fastest possible design. React Compiler (React 19)
//   moves React closer to the compiled approach by auto-memoizing.
//
// Saying this shows you know React is a TRADE-OFF, not a religion.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "React is slow" after a big list update:
//   The VDOM diff is O(n) over the tree. Render 10,000 rows and you pay
//   for 10,000 object allocations + comparisons every keystroke.
//   Fix: virtualize (react-window), or memo, or paginate.
//
// Bug 2 — Input loses focus on every render:
//   The diff decided the node type changed and replaced it. Usually caused
//   by a component defined INSIDE another component (new function identity
//   every render → different type → unmount/remount).
//   Fix: move the component definition out.
//
// Bug 3 — Expecting the DOM to be updated right after setState:
//   setCount(5); console.log(ref.current.textContent) → still the old text.
//   The diff and commit have not run yet.
//   Fix: useEffect, or useLayoutEffect if you must read layout.
//
// Bug 4 — Mutating the previous VDOM/state:
//   If you mutate old state, old and new point to the SAME object, the diff
//   sees no change, and nothing updates. Immutability is not a style
//   preference — the diff depends on it. → 04_state-patterns/13
//
// Bug 5 — dangerouslySetInnerHTML mixed with children:
//   You bypassed the VDOM. React does not know about those nodes and the
//   next diff will happily clobber them.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

assert(vdomCost === manualCost, "first mount costs the same either way");
assert(patchCost < rebuildCost, "diff+patch beats full rebuild on update");
assert(patches.length === 1, "only one thing actually changed");
assert(patches[0].op === "SET_TEXT", "and it was a text change");
assert(typeof screenA.type === "string", "vdom nodes are plain objects");

const noChange = diff(screenA, screenA);
assert(noChange.length === 0, "identical trees produce zero patches");

console.log("§10 — mini assertions passed for: Virtual DOM concept");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is the Virtual DOM?", answer like this:
//
//   "It is a tree of plain JavaScript objects describing what the UI should
//    look like. On every render React builds a new tree, diffs it against
//    the previous one, and commits only the differences to the real DOM.
//
//    I would push back on one common phrasing though: the Virtual DOM is not
//    faster than the real DOM. On first mount it is strictly extra work —
//    you build the objects AND do every DOM call. The win is on updates, and
//    it is not really speed, it is that minimal updates become automatic.
//    I write declarative code describing the final state, and React derives
//    the imperative steps — including keeping nodes alive so focus, scroll,
//    and selection survive.
//
//    Svelte and Solid skip the VDOM entirely by compiling to direct updates.
//    React trades some of that performance for runtime flexibility and one
//    model across DOM, Native, and other renderers."
//
// That answer is a level above "it is a lightweight copy of the DOM."


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Is the Virtual DOM faster than the real DOM?
// A1. No. It is extra work on top of it. It is faster than UNOPTIMIZED
//     manual DOM updates (innerHTML rebuilds), and it makes the optimized
//     path the default. Hand-tuned imperative code can always beat it.
//
// Q2. Why not just use the real DOM?
// A2. You can, and it is faster if you hand-write minimal updates. But that
//     code is imperative, error-prone, and does not compose. The VDOM buys
//     declarativeness at a measured, usually acceptable cost.
//
// Q3. What is the diff's complexity?
// A3. A general tree diff is O(n³). React uses heuristics to get O(n):
//     different type = replace the subtree, and keys identify list children.
//     → 03_reconciliation-algorithm.js
//
// Q4. Is the Virtual DOM the same as the shadow DOM?
// A4. Completely unrelated. Shadow DOM is a browser encapsulation feature
//     for web components. The VDOM is a React userland data structure.
//
// Q5. What does React do with the old tree?
// A5. It keeps the previous fiber tree (current) and builds a new one
//     (workInProgress) — double buffering. On commit they swap.
//
// Q6. Do Svelte/Solid prove the VDOM was a mistake?
// A6. No — a different trade-off. They need compile-time knowledge of your
//     UI. The VDOM handles fully dynamic runtime structures and gave React
//     one abstraction for many renderers.
//
// Q7. Why does immutability matter to the VDOM?
// A7. The diff compares by reference for props and state. Mutating in place
//     makes old === new, so the change is invisible and nothing re-renders.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is the Virtual DOM?
//   Back : A plain object tree describing the UI, diffed to compute minimal
//          real DOM writes.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : Rebuilt from scratch each render; only the differences are committed.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Saying "the VDOM is faster than the DOM." It is overhead on top of it.
//
// Flashcard 4:
//   Front: What is the real win?
//   Back : Declarative code + automatic minimal updates + preserved node state
//          (focus, scroll, selection).
//
// Flashcard 5:
//   Front: How do you sound senior?
//   Back : Name the trade-off, count the operations, mention Svelte/Solid.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add a third screen where the h1 becomes an h2. Run diff() and confirm
//   you get REPLACE, not SET_TEXT. Explain why that is more expensive.
//
// Task 2:
//   Make diff() handle children of different LENGTHS (screenA has 2 kids,
//   screenC has 3). Notice it currently passes undefined. Fix it with
//   REMOVE and INSERT patches.
//
// Task 3:
//   Instrument the real cost: give createNode a cost of 10 and setAttribute
//   a cost of 1, then re-run §6. Does the conclusion change?
//
// Task 4:
//   Break it: mutate screenA.props.className directly, then diff(screenA,
//   screenA). Explain why the diff reports nothing and connect that to why
//   mutating React state does nothing.
//
// Task 5:
//   Reorder two children (swap h1 and p). Watch index-based diffing produce
//   a terrible patch list. You have just discovered why keys exist. Then
//   read 05_keys-in-lists.js.
//
// Task 6:
//   Explain in 60 seconds why the VDOM is NOT faster than the DOM, without
//   sounding like you are attacking React.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The VDOM is a description, not a faster DOM. Diff objects (cheap),
//   write to the DOM (expensive) only where they differ.
//
// If you remember the common bug:
//   Mutating state makes old === new, the diff sees nothing, the UI freezes.
//
// If you remember the professional framing:
//   It buys declarativeness and automatic minimal updates. It costs the diff.
//   That is a trade-off, and good engineers name trade-offs.
//
// NEXT TOPIC -> 03_reconciliation-algorithm.js
