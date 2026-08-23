// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  07_portals.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Portals
//
// WHAT YOU WILL MASTER HERE:
//   1. The three CSS walls a portal exists to climb — each one demonstrated
//   2. TWO TREES: the DOM parent moves, the React parent does not
//   3. Events bubble through the REACT tree — proven, both directions
//   4. The click-outside bug that follows directly from that fact
//   5. What a portal does NOT give you: focus, aria, scroll lock, Escape
//   6. SSR and container lifetime — the two runtime failures
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/07_portals.js"
//
// Prerequisites: 01_react-fundamentals/11_synthetic-events.js — the event
// section below is that file's rule applied to a tree that no longer matches
// the DOM.
//
// 01-06 were about how components TALK to each other. This one is about where
// they LAND. It is the first pattern in this section that exists because of
// CSS rather than because of JavaScript.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Portal:
// createPortal(children, domNode) renders children into a DIFFERENT part of
// the DOM, while keeping them in the same place in the REACT tree.
//
//   function Modal({ children }) {
//     return createPortal(
//       <div className="overlay">{children}</div>,
//       document.body                       // ← lands here in the DOM
//     );
//   }
//
// If interviewer says "explain it simply", say:
// "It renders a child somewhere else in the DOM. The component stays exactly
//  where it is in your React tree — same parent, same props, same context,
//  same event bubbling — but the actual DOM nodes are appended to
//  document.body instead of to the parent's div."
//
// If interviewer asks "why does it matter?", say:
// "Because of CSS containment. A modal inside a container with overflow:
//  hidden gets clipped, a tooltip inside a stacking context can't be raised
//  above a sibling no matter how big its z-index is, and position: fixed stops
//  being relative to the viewport as soon as any ancestor has a transform.
//  Portals are the escape hatch — and the reason people are surprised by them
//  is that events still bubble through the React tree, not the DOM tree."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   TWO TREES. React's tree decides behaviour; the DOM tree decides painting.
//
// Runtime rule:
//   A portal changes ONLY the DOM insertion point. Everything React owns —
//   context, state, the component hierarchy, event propagation, error
//   boundaries, Suspense — follows the React tree, unchanged.
//
// Practical rule:
//   Portal anything that must escape its container's box: modal, dialog,
//   dropdown, tooltip, popover, toast, context menu, drag preview.
//
// Common trap:
//   "The click inside my modal is closing the sidebar behind it." Yes — the
//   modal is still a React child of the sidebar, so the sidebar's onClick
//   receives the bubbled event, even though the DOM nodes are on opposite
//   sides of the document. §5.
//
// The mental picture:
//
//   REACT TREE (behaviour)        DOM TREE (painting)
//   ──────────────────────        ───────────────────
//   <App>                         <div id="root">
//     <Sidebar>                     <aside>…</aside>
//       <Modal>          ────┐    </div>
//         <Content/>         └──> <body>
//                                   <div class="overlay">…</div>
//
//   context: flows down the LEFT tree
//   events : bubble up the LEFT tree
//   z-index: decided by the RIGHT tree


// ══════════════════════════════════════════════════════════════════
// § 3 — THE THREE CSS WALLS
// ══════════════════════════════════════════════════════════════════

console.log("§3 — why a modal cannot just be a <div> where you wrote it:\n");

// ── a small DOM ───────────────────────────────────────────────────
function node(tag, style = {}) { return { tag, style, children: [], parent: null }; }
function append(parent, child) { child.parent = parent; parent.children.push(child); return child; }
function ancestorsOf(n) { const out = []; let p = n.parent; while (p) { out.push(p); p = p.parent; } return out; }
function remove(child) {                       // node.remove(), near enough
  if (child.parent) child.parent.children = child.parent.children.filter(c => c !== child);
  child.parent = null;
  return child;
}

const body = node("body");
const root = append(body, node("div#root"));
const page = append(root, node("main", { overflow: "hidden" }));           // wall 1
const card = append(page, node("section", { position: "relative", zIndex: 1 })); // wall 2
const animated = append(card, node("div.animated", { transform: "translateY(0)" })); // wall 3
const inlineModal = append(animated, node("div.modal", { position: "fixed", zIndex: 9999 }));

// The three rules, each one a real CSS spec behaviour:
function isClipped(n) {
  return ancestorsOf(n).some(a => a.style.overflow === "hidden");
}
function isTrappedInStackingContext(n) {
  return ancestorsOf(n).some(a =>
    (a.style.position === "relative" && a.style.zIndex !== undefined) ||
    a.style.transform !== undefined || a.style.opacity !== undefined);
}
function fixedIsBroken(n) {
  // A transformed ancestor becomes the containing block for position: fixed.
  return n.style.position === "fixed" && ancestorsOf(n).some(a => a.style.transform !== undefined);
}

const wallsHit = [
  ["overflow: hidden on an ancestor clips it", isClipped(inlineModal)],
  ["an ancestor stacking context caps z-index", isTrappedInStackingContext(inlineModal)],
  ["a transformed ancestor breaks position: fixed", fixedIsBroken(inlineModal)],
];

wallsHit.forEach(([label, hit]) => console.log(`    ${hit ? "🐛" : "✅"} ${label}: ${hit}`));
console.log("\n    walls hit by an inline modal:", wallsHit.filter(([, hit]) => hit).length, "/ 3");
console.log("\n  Read the second one carefully, because it is the one people fight:");
console.log("  z-index: 9999 loses to a sibling with z-index: 2 whenever an ancestor");
console.log("  has already created a stacking context. z-index does not compare");
console.log("  across contexts — it only orders siblings INSIDE one. No number is");
console.log("  big enough. That is why 'just raise the z-index' never ends.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE PORTAL: THE DOM PARENT MOVES, THE REACT PARENT DOES NOT
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the same modal, portalled:\n");

function createPortal(child, container) {
  // Real React: mount `child`'s DOM under `container`, keep its fiber where it
  // was. Here: reparent in the DOM only.
  if (!container) throw new Error("Target container is not a DOM element.");
  remove(child);
  append(container, child);
  return child;
}

const portalled = createPortal(node("div.modal", { position: "fixed", zIndex: 9999 }), body);

const wallsAfter = [
  ["clipped", isClipped(portalled)],
  ["z-index trapped", isTrappedInStackingContext(portalled)],
  ["fixed broken", fixedIsBroken(portalled)],
];

console.log("    DOM ancestors, inline   :", ancestorsOf(inlineModal).map(n => n.tag).join(" ← "));
console.log("    DOM ancestors, portalled:", ancestorsOf(portalled).map(n => n.tag).join(" ← "));
console.log("    walls hit after portalling:", wallsAfter.filter(([, hit]) => hit).length, "/ 3 ✅");
console.log("\n  Five ancestors became one. Every containment rule in §3 is a");
console.log("  statement about ANCESTORS, so removing the ancestors removes all");
console.log("  three problems at once — which is why one API solves what looks");
console.log("  like three unrelated CSS bugs.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — EVENTS BUBBLE THROUGH THE REACT TREE
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the fact that surprises everyone:\n");

// React attaches one listener at the root container and synthesises
// propagation by walking the FIBER tree. The portal moved the DOM node; it did
// not move the fiber. So a click inside the portal bubbles to the component
// that RENDERED the portal, not to the portal's DOM parent.
// → 01_react-fundamentals/11_synthetic-events.js

function fiber(name, handlers = {}) { return { name, handlers, reactParent: null, domParent: null }; }
function reactChild(parent, child) { child.reactParent = parent; return child; }

const fired = [];
const appFiber = fiber("App", { onClick: () => fired.push("App") });
const sidebarFiber = reactChild(appFiber, fiber("Sidebar", { onClick: () => fired.push("Sidebar") }));
const modalFiber = reactChild(sidebarFiber, fiber("Modal", { onClick: () => fired.push("Modal") }));
const buttonFiber = reactChild(modalFiber, fiber("SaveButton", { onClick: () => fired.push("SaveButton") }));

// Its DOM home is document.body — nowhere near <Sidebar>'s DOM node:
const bodyFiber = fiber("body", { onClick: () => fired.push("body-dom-handler") });
buttonFiber.domParent = bodyFiber;

function reactDispatch(target) {
  let n = target;
  while (n) { if (n.handlers.onClick) n.handlers.onClick(); n = n.reactParent; }
}

reactDispatch(buttonFiber);

console.log("    click inside the portalled modal →", JSON.stringify(fired));
console.log("    the modal's DOM parent is        :", buttonFiber.domParent.name);
console.log("    did the DOM parent's handler run?:", fired.includes("body-dom-handler"), "← no");
console.log("\n  So <Sidebar onClick={close}> closes when you click INSIDE the modal");
console.log("  it rendered — even though the modal's DOM node is a sibling of");
console.log("  <div id=\"root\">. That is not a bug in React; it is the guarantee that");
console.log("  a portal does not break your component model.");
console.log("\n  What follows from the same rule, and is worth listing:");
console.log("    • context works inside a portal, from the REACT parent  ✅");
console.log("    • an error thrown in a portal is caught by the React-tree error");
console.log("      boundary above it, not by anything near <body>         → 08");
console.log("    • Suspense boundaries behave the same way");
console.log("    • e.stopPropagation() inside the portal stops the REACT walk");
console.log("    • a native document-level listener sees it at <body>, in the DOM");
console.log("      order — the two systems genuinely disagree, and §6 is the bill\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE CLICK-OUTSIDE BUG
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the bug this pattern is famous for:\n");

// The standard close-on-outside-click hook:
//
//   useEffect(() => {
//     const onDown = e => { if (!ref.current.contains(e.target)) close(); };
//     document.addEventListener("mousedown", onDown);
//     return () => document.removeEventListener("mousedown", onDown);
//   }, []);
//
// `contains` is a DOM question. The dropdown's PANEL is portalled to <body>,
// so it is not inside the trigger's DOM subtree — and clicking the panel
// closes the panel you are trying to use.
// → 03_custom-hooks/06_useonclickoutside-hook.js

function domContains(ancestor, target) {
  let n = target;
  while (n) { if (n === ancestor) return true; n = n.parent; }
  return false;
}

const trigger = append(card, node("button.trigger"));
const panelInline = append(trigger, node("div.panel"));
const panelPortalled = createPortal(node("div.panel"), body);
const itemInline = append(panelInline, node("a.item"));
const itemPortalled = append(panelPortalled, node("a.item"));

const closedInline = !domContains(trigger, itemInline);
const closedPortalled = !domContains(trigger, itemPortalled);

console.log("    clicking an item inside the dropdown panel:");
console.log("      panel rendered inline   → closes?", closedInline, "✅");
console.log("      panel rendered in a portal → closes?", closedPortalled, "🐛");

// Fix A — check the portal container too:
const closedFixA = !(domContains(trigger, itemPortalled) || domContains(panelPortalled, itemPortalled));
// Fix B — let the event bubble through the REACT tree and stop it there, which
// is what Radix's onPointerDownOutside and Headless UI do internally.
console.log("      fix A: also test contains(panelRef, target) → closes?", closedFixA, "✅");
console.log("      fix B: use React-tree propagation instead of document listeners ✅");

console.log("\n  The general lesson, and the sentence to say out loud: a portal makes");
console.log("  the DOM tree and the React tree disagree, so ANY code that reasons");
console.log("  about the DOM — contains(), closest(), querySelector, focus order,");
console.log("  CSS descendant selectors, drag-and-drop hit testing — has to be told");
console.log("  about the portal. Code that reasons about React does not.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHAT A PORTAL DOES NOT GIVE YOU
// ══════════════════════════════════════════════════════════════════

console.log("§7 — a portal is 2/8 of a dialog:\n");

const dialogChecklist = [
  ["escapes overflow / stacking context", true, "the portal"],
  ["paints above everything", true, "the portal"],
  ["focus moves into the dialog on open", false, "you: ref.focus() in an effect"],
  ["focus is TRAPPED inside while open", false, "you: cycle Tab at the edges"],
  ["focus returns to the trigger on close", false, "you: remember document.activeElement"],
  ["Escape closes it", false, "you: a keydown listener"],
  ["background is inert to screen readers", false, "you: aria-hidden / the inert attribute"],
  ["background does not scroll", false, "you: lock body overflow, keep scrollbar width"],
];

dialogChecklist.forEach(([item, free, who]) =>
  console.log(`    ${free ? "✅ free" : "🐛 yours"}  ${item.padEnd(38)} ${who}`));

const freeCount = dialogChecklist.filter(([, free]) => free).length;
console.log("\n    solved by createPortal:", freeCount, "/", dialogChecklist.length);

console.log("\n  This is the honest senior answer to 'how would you build a modal?'.");
console.log("  The portal is the easy half and it is a CSS fix. The other six items");
console.log("  are accessibility, and they are why <dialog> exists natively — its");
console.log("  showModal() gives you the top layer, focus trapping, Escape and an");
console.log("  inert background with no z-index at all. In 2025 the right answer is");
console.log("  usually: native <dialog>, or a headless library that has already");
console.log("  fought this. → 11_headless-components.js\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — SSR AND CONTAINER LIFETIME
// ══════════════════════════════════════════════════════════════════

console.log("§8 — the two runtime failures:\n");

// ── 8.1 there is no `document` on the server ──────────────────────
//
//   ❌ return createPortal(children, document.body);        // ReferenceError in SSR
//   ✅ const [mounted, setMounted] = useState(false);
//      useEffect(() => setMounted(true), []);
//      if (!mounted) return null;
//      return createPortal(children, document.body);
//
// The consequence to state out loud: portalled content is NOT server-rendered.
// It appears after hydration. For a modal that is correct — it is closed on
// first paint anyway. For a toast region or a cookie banner it is a visible
// pop-in, and sometimes a layout shift you will see in CLS.
// → 05_optimization-techniques/13_web-vitals-lcp-fcp-cls-inp.js

let ssrError = null;
try { createPortal(node("div.toast"), undefined); } catch (e) { ssrError = e.message; }
console.log("    portal into a container that does not exist yet:");
console.log("      throws:", JSON.stringify(ssrError));

// ── 8.2 the container must outlive the portal ─────────────────────
// If another library (or your own cleanup) removes the container node while
// the portal is still mounted, React's unmount tries to remove a child from a
// parent it no longer belongs to — "The node to be removed is not a child of
// this node."
const container = append(body, node("div#toast-root"));
const toast = createPortal(node("div.toast"), container);
const attachedBefore = container.children.includes(toast);
remove(container);                                               // 🐛 someone else's cleanup
const stillReachable = ancestorsOf(toast).includes(body);

console.log("      container removed while the portal was mounted:");
console.log("        attached before:", attachedBefore, " reachable after:", stillReachable, "🐛");
console.log("\n  Two rules that come out of this:");
console.log("    • create the container yourself, in the effect that mounts the");
console.log("      portal, and remove it in the same effect's cleanup — then");
console.log("      lifetime is impossible to get wrong");
console.log("    • never portal into a node another library owns (#__next, a");
console.log("      third-party widget root); it will be replaced under you\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHEN NOT TO PORTAL
// ══════════════════════════════════════════════════════════════════
//
// Portals are cheap, but they are not free:
//
//   • Anything DOM-order-dependent breaks: reading order for screen readers
//     when the DOM order no longer matches visual order, tab order, CSS
//     descendant selectors (.card .panel stops matching), and inherited styles
//     from ancestors you just left behind (font, color, CSS custom properties
//     scoped to a container).
//   • Third-party code that queries the DOM inside your subtree stops finding
//     the portalled part.
//   • Testing gets a step harder: RTL's `within(container)` no longer contains
//     the portal, so you query the whole screen.
//
// Do NOT portal when:
//   • the element is not escaping any container — a normal inline dropdown in
//     a page with no overflow/transform ancestors is fine where it is
//   • you can use native <dialog> or popover=""; the browser's top layer
//     removes the need entirely, and gives you a11y for free
//   • you would be portalling purely "to be safe" — you have traded a CSS
//     question for a DOM-tree/React-tree divergence, and §6 is the invoice
//
// The senior framing: a portal is a CSS escape hatch that costs DOM/React tree
// alignment. Pay it when a container is genuinely trapping the element.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Clicking inside the modal triggers the parent's onClick:
//   Events bubble through the React tree. This is by design. → §5.
//
// Bug 2 — The dropdown closes the moment you click an item:
//   ref.contains(e.target) is false for portalled content. → §6.
//
// Bug 3 — "Target container is not a DOM element":
//   The container is null — SSR, or an effect ordering problem. → §8.1.
//
// Bug 4 — "The node to be removed is not a child of this node":
//   The container was removed while the portal was mounted. → §8.2.
//
// Bug 5 — Hydration mismatch on a portalled banner:
//   Server rendered nothing, client rendered the portal. Gate on mounted.
//
// Bug 6 — The modal renders behind the header anyway:
//   You portalled into a container that is ITSELF inside a stacking context.
//   The portal target must be a top-level node. → §3.
//
// Bug 7 — Styles disappear inside the portal:
//   .card .panel { } no longer matches, and inherited custom properties
//   defined on .card are gone. Style by class, not by descendant.
//
// Bug 8 — Screen reader reads the dialog in the wrong place:
//   DOM order is now the end of <body>. Use aria-modal, aria-labelledby and
//   focus management — not DOM position. → §7.
//
// Bug 9 — Two modals, wrong one on top:
//   Both portalled to body; order of insertion decides. Manage a stack, or use
//   native <dialog>'s top layer which stacks by open order.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The three walls:
assert(isClipped(inlineModal) === true, "overflow:hidden on an ancestor clips the modal 🐛");
assert(isTrappedInStackingContext(inlineModal) === true, "an ancestor stacking context caps z-index 🐛");
assert(fixedIsBroken(inlineModal) === true, "a transformed ancestor breaks position:fixed 🐛");
assert(wallsHit.filter(([, hit]) => hit).length === 3, "an inline modal hits all three walls");

// The portal:
assert(portalled.parent === body, "the portal moved the DOM parent to <body>");
assert(ancestorsOf(inlineModal).length === 5 && ancestorsOf(portalled).length === 1,
  "5 ancestors became 1 (<body>) — every containment rule is about ancestors ✅");
assert(wallsAfter.filter(([, hit]) => hit).length === 0, "so all three walls disappear at once ✅");

// Events:
assert(JSON.stringify(fired) === '["SaveButton","Modal","Sidebar","App"]',
  "the click bubbles up the REACT tree, into the component that rendered the portal ✅");
assert(fired.includes("body-dom-handler") === false,
  "...and NOT into the portal's DOM parent 🐛 for anyone expecting DOM bubbling");

// Click-outside:
assert(domContains(trigger, itemInline) === true, "inline: the item is inside the trigger's subtree");
assert(domContains(trigger, itemPortalled) === false,
  "portalled: it is not — so contains() says 'outside' and the panel closes 🐛");
assert(closedFixA === false, "checking the panel container too fixes it ✅");

// The checklist:
assert(freeCount === 2 && dialogChecklist.length === 8,
  "createPortal solves 2 of the 8 things a dialog needs");

// SSR and lifetime:
assert(ssrError === "Target container is not a DOM element.",
  "portalling into a missing container throws — this is the SSR failure 🐛");
assert(attachedBefore === true && stillReachable === false,
  "a container removed under a live portal detaches the whole subtree 🐛");

console.log("§11 — mini assertions passed for: Portals");
console.log("\n  The pair that captures it: an inline modal hit 3 of 3 CSS walls and a");
console.log("  portalled one hit 0 — while the same portal made contains() report");
console.log("  its own dropdown as 'outside', and left 6 of the 8 things a real");
console.log("  dialog needs still unimplemented.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is a portal and when do you use one?", answer:
//
//   "createPortal(children, container) renders children into a different part
//    of the DOM while keeping them in the same place in the React tree. You
//    use it for anything that has to escape its container: modals, dropdowns,
//    tooltips, toasts.
//
//    The reason is CSS containment, and it's three separate rules that all
//    happen to be about ancestors. overflow: hidden on an ancestor clips you.
//    A stacking context on an ancestor caps your z-index — z-index only orders
//    siblings within one context, so 9999 loses to a sibling's 2 and no number
//    is big enough. And a transformed ancestor becomes the containing block
//    for position: fixed, so your full-screen overlay is suddenly fixed to a
//    card. Portalling to body removes the ancestors, which is why one API
//    fixes what looks like three unrelated bugs.
//
//    The thing that surprises people is that events still bubble through the
//    REACT tree. React synthesises propagation by walking the fiber tree, and
//    the portal moved the DOM node, not the fiber. So a click inside the modal
//    fires the onClick of the component that rendered it, even though the DOM
//    nodes are on opposite sides of the document. Same for context, error
//    boundaries and Suspense — they all follow the React tree. That's a
//    guarantee, not a quirk: a portal doesn't break your component model.
//
//    The bill for that is anything reasoning about the DOM. The classic is
//    close-on-outside-click: ref.contains(e.target) is false for portalled
//    content, so clicking your own dropdown closes it. You either check the
//    portal container too, or you use React-tree propagation instead of a
//    document listener — which is what Radix does.
//
//    And I'd be clear that a portal is only about two of the eight things a
//    dialog needs. It doesn't move focus in, trap it, restore it, close on
//    Escape, make the background inert, or lock scrolling. That's why I'd
//    reach for native <dialog>.showModal() or a headless library first — the
//    browser's top layer gives you the CSS escape AND the accessibility, with
//    no z-index at all."
//
// The three-walls breakdown and the "2 of 8" honesty are what make this senior.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Does a portal change the React tree?
// A1. No. Only the DOM insertion point. Context, state, events and boundaries
//     all follow the React tree.
//
// Q2. Where do events bubble?
// A2. Up the React tree. React synthesises propagation from the fiber tree.
//
// Q3. Why does my close-on-outside handler break?
// A3. contains() is a DOM question and the portal left the subtree. Check the
//     container too, or use React propagation.
//
// Q4. Does context work through a portal?
// A4. Yes — from the React parent, not from the DOM parent.
//
// Q5. Which error boundary catches a throw inside a portal?
// A5. The nearest one in the REACT tree. → 08_error-boundaries.js
//
// Q6. Why does z-index: 9999 not work without a portal?
// A6. z-index only orders siblings inside one stacking context. An ancestor
//     with transform, opacity, filter, or position+z-index creates one.
//
// Q7. What about SSR?
// A7. There is no document. Gate on a mounted flag, and accept that portalled
//     content is not server-rendered.
//
// Q8. Where should the container come from?
// A8. Create and remove it in the same effect as the portal, so lifetimes
//     cannot diverge. Never portal into a node another library owns.
//
// Q9. Is a portal enough for a modal?
// A9. No — 2 of 8. Focus move, focus trap, focus restore, Escape, inert
//     background and scroll lock are all still yours.
//
// Q10. What replaces portals in modern browsers?
// A10. <dialog>.showModal() and popover="" render in the top layer, above
//      everything, with focus and Escape handled, no z-index needed.
//
// Q11. Two portalled modals — which is on top?
// A11. DOM insertion order into the container. Manage a stack explicitly, or
//      let <dialog>'s top layer order them by open order.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Portal, in one line?
//   Back : Different DOM parent, same React parent.
//
// Flashcard 2:
//   Front: The three CSS walls?
//   Back : overflow:hidden clips, ancestor stacking context caps z-index,
//          transformed ancestor breaks position:fixed.
//
// Flashcard 3:
//   Front: Where do portal events bubble?
//   Back : Up the REACT tree — into the component that rendered the portal.
//
// Flashcard 4:
//   Front: Why does click-outside break?
//   Back : contains() asks the DOM, and the portal left the subtree.
//
// Flashcard 5:
//   Front: Does context cross a portal?
//   Back : Yes. Everything React owns follows the React tree.
//
// Flashcard 6:
//   Front: How much of a dialog does a portal give you?
//   Back : 2 of 8. The CSS half. Focus, Escape, inert, scroll lock are yours.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "A portal makes the DOM tree and the React tree disagree — anything
//          that reasons about the DOM has to be told."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Build a modal inline inside a container with overflow: hidden and a
//   transformed ancestor. Watch it get clipped and mis-positioned. Then
//   portal it.
//
// Task 2:
//   Put z-index: 9999 on it and a z-index: 2 sibling above the stacking
//   context. Prove no number is big enough.
//
// Task 3:
//   Put an onClick on the component that renders the portal. Click inside the
//   modal. Explain the log line before you run it.
//
// Task 4:
//   Write a close-on-outside-click dropdown, portal the panel, and reproduce
//   the instant-close bug. Fix it both ways.
//
// Task 5:
//   Throw an error inside a portal and confirm which boundary catches it.
//   → 08_error-boundaries.js
//
// Task 6:
//   Implement all six missing dialog behaviours from §7 by hand, once. You
//   will never argue about using a headless library again.
//
// Task 7:
//   Rebuild the same modal with native <dialog>.showModal() and delete every
//   z-index in the file.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Different DOM parent, same React parent. Painting follows the DOM tree;
//   behaviour follows the React tree.
//
// If you remember the common bug:
//   Clicks inside a portal bubble to the React parent — and contains() says
//   the portal's own content is "outside".
//
// If you remember the professional framing:
//   A portal is a CSS escape hatch bought with DOM/React tree divergence. It
//   solves containment and nothing else — focus, Escape, inertness and scroll
//   lock are still yours, which is why native <dialog> or a headless library
//   is usually the better answer.
//
// NEXT TOPIC -> 08_error-boundaries.js
