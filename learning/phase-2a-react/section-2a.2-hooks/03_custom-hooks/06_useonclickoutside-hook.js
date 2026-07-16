// ╔══════════════════════════════════════════════════════════════════╗
// ║   Custom Hooks  →  06_useonclickoutside-hook.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useOnClickOutside hook
//
// WHAT YOU WILL MASTER HERE:
//   1. contains() — the whole hook, and why stopPropagation is the wrong fix
//   2. The React-vs-native ordering bug, PROVEN
//   3. Why mousedown beats click (the drag-select bug)
//   4. The stale-closure trap, and the ref-latest-handler fix
//   5. Portals: why the DOM tree and the React tree disagree
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/03_custom-hooks/06_useonclickoutside-hook.js"
//
// Prerequisite: 01_react-fundamentals/11_synthetic-events.js §6 — this file
// is the FIX for the bug that file diagnosed.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useOnClickOutside:
// Listens for clicks on the document and fires a callback when the click
// target is NOT inside your element.
//
// If interviewer says "explain it simply", say:
// "You attach a listener to the document and check ref.current.contains(
//  event.target). Inside means ignore, outside means close."
//
// If interviewer asks "why does it matter?", say:
// "Because the intuitive approach — stopPropagation on the dropdown — does
//  not work. The native event reaches document before React runs any handler,
//  so the dropdown closes before your stopPropagation ever executes. This
//  hook works because it asks a QUESTION about the target instead of trying
//  to stop the event."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   ask WHERE the click was, do not try to STOP it
//
// The hook:
//
//   function useOnClickOutside(ref, handler) {
//     useEffect(() => {
//       const listener = (event) => {
//         if (!ref.current || ref.current.contains(event.target)) return;
//         handler(event);
//       };
//       document.addEventListener("mousedown", listener);
//       return () => document.removeEventListener("mousedown", listener);
//     }, [ref, handler]);
//   }
//
// The whole thing is `ref.current.contains(event.target)`. Everything else in
// this file is the traps around it.
//
// Runtime rule:
//   contains() walks up the DOM tree from the target. It returns true for the
//   node itself and any descendant. That is a DOM tree question — which is
//   exactly why portals break it. → §6
//
// Practical rule:
//   Use mousedown, not click. And keep the handler in a ref so the effect
//   never re-subscribes.
//
// Common trap:
//   Reaching for stopPropagation. It cannot work, and understanding WHY is
//   the actual interview content.


// ══════════════════════════════════════════════════════════════════
// § 3 — A FAKE DOM
// ══════════════════════════════════════════════════════════════════

function createNode(name, children = []) {
  const node = {
    name,
    children,
    parent: null,
    // The real DOM's contains(): walk UP from the candidate.
    contains(other) {
      let cursor = other;
      while (cursor) {
        if (cursor === node) return true;
        cursor = cursor.parent;
      }
      return false;
    },
  };
  for (const child of children) child.parent = node;
  return node;
}

function createFakeDocument(root) {
  const listeners = { mousedown: [], click: [], mouseup: [] };
  return {
    root,
    addEventListener: (type, fn) => listeners[type].push(fn),
    removeEventListener: (type, fn) => {
      const i = listeners[type].indexOf(fn);
      if (i >= 0) listeners[type].splice(i, 1);
    },
    // Fire a native event that bubbles to the document, like a browser.
    dispatch: (type, target) => {
      listeners[type].forEach(fn => fn({ type, target }));
    },
    listenerCount: (type) => listeners[type].length,
  };
}

// The tree: <app> <dropdown> <item/> </dropdown> <outside/> </app>
const item = createNode("dropdown-item");
const dropdown = createNode("dropdown", [item]);
const outside = createNode("page-background");
const app = createNode("app", [dropdown, outside]);
const doc = createFakeDocument(app);


// ══════════════════════════════════════════════════════════════════
// § 4 — contains(): THE ENTIRE HOOK
// ══════════════════════════════════════════════════════════════════

console.log("§4 — contains() answers the only question that matters:\n");

const ref = { current: dropdown };
const closed = [];

function listener(event) {
  if (!ref.current || ref.current.contains(event.target)) return;   // inside → ignore
  closed.push(event.target.name);                                    // outside → close
}
doc.addEventListener("mousedown", listener);

console.log("  tree: <app> <dropdown> <item/> </dropdown> <page-background/> </app>");
console.log("  ref.current = <dropdown>\n");

doc.dispatch("mousedown", item);
console.log("    click <dropdown-item> → contains? ",
  dropdown.contains(item), "→ stay open ✅");

doc.dispatch("mousedown", dropdown);
console.log("    click <dropdown>      → contains? ",
  dropdown.contains(dropdown), "→ stay open ✅ (the node contains ITSELF)");

doc.dispatch("mousedown", outside);
console.log("    click <page-background> → contains?",
  dropdown.contains(outside), "→ CLOSE ✅");

console.log("\n  closed on:", JSON.stringify(closed));
console.log("\n  contains() walks UP from the target looking for your node. It");
console.log("  is a question about POSITION, and questions have answers — which");
console.log("  is why this works where fighting the event does not. → §5\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — WHY stopPropagation CANNOT WORK
// ══════════════════════════════════════════════════════════════════
//
// The instinct: "the dropdown will just stop the click from reaching the
// document." It never gets the chance.

console.log("§5 — the stopPropagation attempt:\n");

const timeline = [];

// The native listener the hook (or the naive version) attached to document:
doc.addEventListener("click", () => {
  timeline.push("3. 🔴 document listener fires → closeDropdown()");
});

// The user clicks INSIDE the dropdown.
timeline.push("1. native click on <dropdown-item>");
timeline.push("2. the native event bubbles up the REAL DOM to document...");
doc.dispatch("click", item);
timeline.push("4. NOW React starts its synthetic dispatch");
timeline.push("5. React walks the fiber tree → your onClick runs");
timeline.push("6. e.stopPropagation() ← stops REACT's walk. Nothing else.");
timeline.push("7. 💀 the dropdown closed at step 3.");

for (const step of timeline) console.log("  " + step);

console.log("\n  Your stopPropagation ran at step 6. The dropdown closed at");
console.log("  step 3 — THREE STEPS EARLIER. React's event system attaches ONE");
console.log("  listener at the root and simulates bubbling AFTERWARDS, so the");
console.log("  native event has already reached document before React runs a");
console.log("  single handler.");
console.log("\n  You cannot stop an event that already happened. That is why the");
console.log("  fix is to ask a question about the TARGET instead.");
console.log("  → 01_react-fundamentals/11_synthetic-events.js §6\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — mousedown, NOT click
// ══════════════════════════════════════════════════════════════════
//
// A detail almost nobody mentions, and it is a real bug.
//
// A `click` fires only after mousedown AND mouseup on the SAME element. So:
//
//   The user starts selecting text INSIDE your modal, drags outward, and
//   releases OUTSIDE. Where does the click land?
//
//     mousedown on <modal-text>   ← inside
//     mouseup   on <background>   ← outside
//     click     on <body>         ← the common ancestor. OUTSIDE.
//
//   Your modal closes because the user selected text. Infuriating, and very
//   hard to reproduce deliberately.
//
// mousedown fires immediately, on the element actually under the cursor when
// the button went down. Intent is captured at press time, which is what you
// meant all along.
//
// Bonus: mousedown feels faster — the modal closes on press, not on release.
//
// The trade-off worth naming: mousedown fires BEFORE any click handler on the
// outside element, so if the outside thing is a button, your close fires
// first. That is usually what you want, but it is a real ordering change.

console.log("§6 — click vs mousedown on a drag-select:\n");

function simulateDragSelect(eventType) {
  const fired = [];
  const localRef = { current: dropdown };
  const l = (e) => {
    if (localRef.current.contains(e.target)) return;
    fired.push("closed");
  };
  const d = createFakeDocument(app);
  d.addEventListener(eventType, l);

  // The user presses inside, drags out, releases outside:
  d.dispatch("mousedown", item);        // ← inside
  d.dispatch("mouseup", outside);       // ← outside
  // The browser fires `click` on the nearest COMMON ANCESTOR:
  if (eventType === "click") d.dispatch("click", app);   // <app> is outside the dropdown
  return fired;
}

console.log("  the user selects text inside the dropdown, releasing outside:\n");
console.log("    listening for 'click'     →", JSON.stringify(simulateDragSelect("click")),
  "🐛 closed on a text selection");
console.log("    listening for 'mousedown' →", JSON.stringify(simulateDragSelect("mousedown")),
  "✅ stayed open");
console.log("\n  With `click`, the browser fires on the common ancestor of the");
console.log("  mousedown and mouseup targets — which is OUTSIDE your dropdown.");
console.log("  With `mousedown`, intent is captured at press time, on the");
console.log("  element actually under the cursor.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE STALE CLOSURE
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the handler goes stale:\n");

// ❌ deps: [ref, handler] — the caller passes an inline arrow, so `handler`
//    is a NEW function every render → the effect resubscribes every render.
// ❌ deps: [] — the effect subscribes once, and the handler is frozen at
//    render #1 → it closes over stale state.

function simulateHandlerDeps(mode) {
  const d = createFakeDocument(app);
  let subscribeCount = 0;
  let seenValue = null;
  const localRef = { current: dropdown };

  // Simulating three renders where a piece of state changes each time.
  let currentHandler = null;
  const handlerRef = { current: null };

  for (const value of ["a", "b", "c"]) {
    const handler = () => { seenValue = value; };     // a NEW arrow every render
    handlerRef.current = handler;                     // the ref always has the latest

    if (mode === "handler-in-deps") {
      // The effect re-runs because `handler` changed identity:
      if (currentHandler) d.removeEventListener("mousedown", currentHandler);
      currentHandler = (e) => { if (!localRef.current.contains(e.target)) handler(e); };
      d.addEventListener("mousedown", currentHandler);
      subscribeCount++;
    } else if (mode === "empty-deps") {
      // The effect runs ONCE, capturing render #1's handler forever:
      if (subscribeCount === 0) {
        currentHandler = (e) => { if (!localRef.current.contains(e.target)) handler(e); };
        d.addEventListener("mousedown", currentHandler);
        subscribeCount++;
      }
    } else if (mode === "ref-latest") {
      // Subscribe once, but call through the REF — always the latest handler:
      if (subscribeCount === 0) {
        currentHandler = (e) => {
          if (!localRef.current.contains(e.target)) handlerRef.current(e);
        };
        d.addEventListener("mousedown", currentHandler);
        subscribeCount++;
      }
    }
  }

  d.dispatch("mousedown", outside);
  return { subscribeCount, seenValue };
}

const inDeps = simulateHandlerDeps("handler-in-deps");
const emptyDeps = simulateHandlerDeps("empty-deps");
const refLatest = simulateHandlerDeps("ref-latest");

console.log("  3 renders, state goes 'a' → 'b' → 'c', then a click outside:\n");
console.log("    deps: [handler] →", inDeps.subscribeCount,
  "subscriptions, handler saw:", JSON.stringify(inDeps.seenValue),
  "✅ correct, ❌ resubscribes every render");
console.log("    deps: []        →", emptyDeps.subscribeCount,
  "subscription,  handler saw:", JSON.stringify(emptyDeps.seenValue),
  "✅ efficient, 🐛 STALE");
console.log("    ref + deps: []  →", refLatest.subscribeCount,
  "subscription,  handler saw:", JSON.stringify(refLatest.seenValue),
  "✅ both");

console.log("\n  The ref version is what every real library does:");
console.log("\n    const handlerRef = useRef(handler);");
console.log("    useLayoutEffect(() => { handlerRef.current = handler; });");
console.log("    useEffect(() => {");
console.log("      const listener = (e) => {");
console.log("        if (!ref.current || ref.current.contains(e.target)) return;");
console.log("        handlerRef.current(e);        // ← always the latest");
console.log("      };");
console.log("      document.addEventListener('mousedown', listener);");
console.log("      return () => document.removeEventListener('mousedown', listener);");
console.log("    }, [ref]);                        // ← handler is NOT a dep");
console.log("\n  Subscribe once, always call the newest handler. This is the same");
console.log("  pattern useEffectEvent is being designed to make official.");
console.log("  → 02_built-in-hooks/05_useref-dom-mutable-ref.js §8\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — PORTALS: THE DOM TREE vs THE REACT TREE
// ══════════════════════════════════════════════════════════════════

console.log("§8 — the portal trap:\n");

// A dropdown whose menu is rendered through a portal into document.body:
const portalMenu = createNode("portal-menu");
const portalRoot = createNode("portal-root", [portalMenu]);
const trigger = createNode("trigger");
const dropdownWithPortal = createNode("dropdown", [trigger]);
const body = createNode("body", [dropdownWithPortal, portalRoot]);
void body;

const portalRef = { current: dropdownWithPortal };

console.log("  React tree:  <Dropdown> <Trigger/> <Portal><Menu/></Portal> </Dropdown>");
console.log("  DOM tree:    <body> <dropdown><trigger/></dropdown>");
console.log("                      <portal-root><portal-menu/></portal-root> </body>\n");

console.log("    dropdown.contains(trigger)     →", dropdownWithPortal.contains(trigger),
  "→ stays open ✅");
console.log("    dropdown.contains(portal-menu) →", dropdownWithPortal.contains(portalMenu),
  "→ CLOSES 🐛");

console.log("\n  Clicking your own menu closes your own dropdown. The menu IS a");
console.log("  React child, but contains() is a DOM question, and in the DOM the");
console.log("  menu lives in a different subtree entirely.");
console.log("\n  This is the mirror image of the portal event behavior: React");
console.log("  events bubble through the FIBER tree (so onClick reaches the");
console.log("  Dropdown), but contains() walks the DOM tree (so it does not).");
console.log("  Same portal, two different tree models.");
console.log("  → 01_react-fundamentals/11_synthetic-events.js §10");
console.log("\n  FIXES:");
console.log("    • check BOTH refs: menuRef.current?.contains(target) too");
console.log("    • or use React's own onClick on the portal — it bubbles through");
console.log("      the fiber tree, so a synthetic handler on the Dropdown DOES");
console.log("      see it (that asymmetry is the fix hiding in the bug)");
console.log("    • or use <dialog> / popover, which the browser handles for you\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL LIBRARIES DO DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Radix / Headless UI / usehooks-ts
//   ───────────               ─────────────────────────────────
//   mousedown only            pointerdown — covers touch and pen, not just mouse
//   contains(target)          also handles Shadow DOM via composedPath()
//   n/a                       Escape key handling — a dropdown MUST close on Esc
//   n/a                       focus trapping and focus restore on close
//   n/a                       aria-expanded, role, and keyboard navigation
//   n/a                       a "click outside on a scrollbar" guard — clicking
//                             the scrollbar is technically outside your node
//   n/a                       nested dropdown coordination: only the TOP one
//                             should close
//
// The honest framing:
//   "useOnClickOutside is ten lines and about 60% of a dropdown. The rest —
//    Escape, focus trap, focus restore, ARIA, touch, nesting — is why I would
//    use Radix rather than ship my own. And the modern browser answer is the
//    popover attribute and <dialog>, which handle light-dismiss natively."
//
// That last point is genuinely current: `popover` gives you click-outside for
// free, in HTML, with no JavaScript at all.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Clicking inside still closes it:
//   You used stopPropagation instead of contains. → §5.
//
// Bug 2 — The dropdown closes when you select text:
//   Listening for `click` instead of `mousedown`. → §6.
//
// Bug 3 — The handler sees stale state:
//   deps: []. → §7. Use a ref.
//
// Bug 4 — Resubscribes on every render:
//   deps: [handler] with an inline arrow. → §7.
//
// Bug 5 — Clicking your own portal menu closes the dropdown:
//   contains() is a DOM question; the portal is elsewhere. → §8.
//
// Bug 6 — The dropdown closes immediately on the click that OPENED it:
//   The opening click bubbles to document and the listener is already
//   attached. Classic. Fix: attach the listener in an effect keyed on isOpen,
//   or check that the target is not the trigger.
//
// Bug 7 — Escape does nothing:
//   Not a bug in this hook — an incomplete component. Always pair them.
//
// Bug 8 — Clicking the scrollbar closes the modal:
//   Technically outside the node. Guard on event.clientX vs
//   document.documentElement.clientWidth.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// contains() — the hook itself:
assert(dropdown.contains(item) === true, "a descendant is inside");
assert(dropdown.contains(dropdown) === true, "a node contains ITSELF — no off-by-one");
assert(dropdown.contains(outside) === false, "a sibling is outside");
assert(JSON.stringify(closed) === JSON.stringify(["page-background"]),
  "only the outside click closed it — 3 clicks, 1 close");

// The ordering that kills stopPropagation:
const docFires = timeline.findIndex(s => s.includes("document listener"));
const reactStops = timeline.findIndex(s => s.includes("stopPropagation"));
assert(docFires < reactStops,
  "the document listener fires BEFORE React's stopPropagation — three steps earlier");

// mousedown vs click:
assert(simulateDragSelect("click").length === 1,
  "'click' closes on a drag-select that ends outside 🐛");
assert(simulateDragSelect("mousedown").length === 0,
  "'mousedown' captures intent at press time — stays open ✅");

// The stale closure:
assert(inDeps.seenValue === "c" && inDeps.subscribeCount === 3,
  "deps:[handler] → correct value, but 3 subscriptions");
assert(emptyDeps.seenValue === "a" && emptyDeps.subscribeCount === 1,
  "deps:[] → 1 subscription, but FROZEN at render #1 🐛");
assert(refLatest.seenValue === "c" && refLatest.subscribeCount === 1,
  "ref + deps:[] → 1 subscription AND the latest handler ✅");
assert(refLatest.seenValue === inDeps.seenValue &&
  refLatest.subscribeCount === emptyDeps.subscribeCount,
  "the ref version has the correctness of one and the efficiency of the other");

// Portals:
assert(dropdownWithPortal.contains(trigger) === true, "the trigger is in the DOM subtree");
assert(dropdownWithPortal.contains(portalMenu) === false,
  "the portal menu is a REACT child but not a DOM descendant → false close 🐛");

console.log("§11 — mini assertions passed for: useOnClickOutside");
console.log("\n  The one that teaches the most: the ref version has the");
console.log("  correctness of [handler] and the efficiency of []. That is why");
console.log("  every real library does it.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you close a dropdown on an outside click?", answer:
//
//   "An effect adds a document listener, and it checks
//    ref.current.contains(event.target) — inside means ignore, outside means
//    close. That's the whole hook.
//
//    The interesting part is why the obvious approach fails. People try
//    stopPropagation on the dropdown, and it can't work: React attaches ONE
//    listener at the root and simulates bubbling afterwards, so the native
//    event has already reached document before React runs a single handler.
//    Your stopPropagation fires three steps after the dropdown closed. You
//    can't stop an event that already happened — so instead of fighting
//    propagation, you ask a question about the target.
//
//    Two details I'd insist on. Use mousedown, not click: a click only fires
//    after mousedown and mouseup on the same element, so if a user selects
//    text inside the modal and releases outside, the browser fires click on
//    the common ancestor — which is outside — and your modal closes because
//    they selected text. mousedown captures intent at press time.
//
//    And keep the handler in a ref. If you put it in the deps, an inline arrow
//    resubscribes every render. If you use empty deps, the handler freezes at
//    render one and reads stale state. A ref updated each render gives you one
//    subscription AND the latest handler.
//
//    The trap worth knowing: portals. contains() is a DOM question, but a
//    portal's menu is a React child rendered somewhere else in the DOM — so
//    clicking your own menu closes your own dropdown. Check both refs, or use
//    React's onClick, which bubbles through the fiber tree.
//
//    In production I'd use Radix — this hook is about 60% of a dropdown. The
//    rest is Escape, focus trap, focus restore, and ARIA. And the modern
//    browser answer is the popover attribute, which gives light-dismiss for
//    free."
//
// The ordering explanation + mousedown + the portal asymmetry is senior.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How does it work?
// A1. A document listener plus ref.current.contains(event.target).
//
// Q2. Why not stopPropagation?
// A2. The native event reaches document before React dispatches anything. The
//     dropdown already closed. React's stopPropagation only halts React's walk.
//
// Q3. Why mousedown over click?
// A3. click fires on the common ancestor of mousedown and mouseup, so a
//     drag-select ending outside closes your modal. mousedown captures intent
//     at press time — and feels faster.
//
// Q4. Why keep the handler in a ref?
// A4. In the deps it resubscribes every render; in empty deps it goes stale. A
//     ref gives one subscription and the newest handler.
//
// Q5. Why does the portal break it?
// A5. contains() walks the DOM tree; the portal's node is elsewhere. React
//     events bubble the FIBER tree, which is why onClick still works.
//
// Q6. Why does it close on the click that opened it?
// A6. That click bubbles to document with the listener already attached. Key
//     the effect on isOpen, or exclude the trigger.
//
// Q7. What is missing from this hook?
// A7. Escape, focus trap, focus restore, ARIA, touch, nesting, scrollbar
//     clicks. It is ~60% of a dropdown.
//
// Q8. What about touch?
// A8. Use pointerdown rather than mousedown to cover touch and pen.
//
// Q9. Is there a platform answer now?
// A9. Yes — the popover attribute and <dialog> give light-dismiss natively,
//     with no JavaScript.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is the whole hook?
//   Back : ref.current.contains(event.target) on a document listener.
//
// Flashcard 2:
//   Front: Why can't stopPropagation fix it?
//   Back : The native event reached document before React ran any handler.
//
// Flashcard 3:
//   Front: mousedown or click?
//   Back : mousedown. click fires on the common ancestor after a drag-select.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : Handler in the deps (resubscribes) or [] (stale). Use a ref.
//
// Flashcard 5:
//   Front: Why do portals break it?
//   Back : contains() is a DOM question; the portal is in another DOM subtree.
//
// Flashcard 6:
//   Front: How do you sound senior?
//   Back : Explain the ORDERING, name mousedown, and admit it is 60% of a
//          dropdown.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the hook from memory. Then write the ref-latest-handler version.
//
// Task 2:
//   Add Escape handling. Now it is 70% of a dropdown. Add focus restore —
//   what percentage now?
//
// Task 3:
//   Fix the §8 portal bug by checking two refs. Then do it with React's
//   onClick instead and explain why THAT works.
//
// Task 4:
//   Reproduce bug 6: the dropdown that closes on the click that opened it.
//   Fix it two ways and argue for one.
//
// Task 5:
//   Swap mousedown for pointerdown. What does that buy on a phone?
//
// Task 6:
//   Explain in 60 seconds why the modal closes when a user selects text, to
//   someone who cannot reproduce it.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Ask WHERE the click was — contains(target). Do not try to STOP the event.
//
// If you remember the common bug:
//   stopPropagation fires after the document listener already closed you. And
//   `click` closes your modal on a text selection.
//
// If you remember the professional framing:
//   Handler in a ref. mousedown, not click. Portals break contains() because
//   it is a DOM question. And this is 60% of a dropdown.
//
// NEXT TOPIC -> 07_useprevious-hook.js
