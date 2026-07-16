// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  11_synthetic-events.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Synthetic events
//
// WHAT YOU WILL MASTER HERE:
//   1. What a SyntheticEvent is and why React built one
//   2. Event DELEGATION — build the whole system yourself
//   3. The React 17 root-vs-document change (and the bug it fixed)
//   4. Why stopPropagation() does NOT stop a native listener
//   5. Event pooling — the famous e.persist() question, and why it is gone
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/11_synthetic-events.js"
//
// Prerequisite: 03_this-keyword/09_this-in-event-listeners.js from Phase 1.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// SyntheticEvent:
// A cross-browser wrapper around the native event. React does NOT attach a
// listener to your button — it attaches ONE listener per event type at the
// root, and simulates bubbling through the fiber tree itself.
//
// If interviewer says "explain it simply", say:
// "onClick doesn't put a listener on that button. React has one click
//  listener at the root, and when a click happens it walks up the fiber tree
//  calling the handlers it finds. The event object you get is React's, not
//  the browser's."
//
// If interviewer asks "why does it matter?", say:
// "Because React's event system and the DOM's are two separate worlds. That
//  is why e.stopPropagation() in React cannot stop a document listener — the
//  native event already reached the root before React ran a single handler."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   ONE listener at the root, synthetic bubbling through fibers
//
// What you think happens:
//
//   <button onClick={fn}>  →  button.addEventListener("click", fn)   ✗ WRONG
//
// What actually happens:
//
//   root.addEventListener("click", dispatch)   ← ONE listener, at mount
//
//   user clicks the button
//        ↓
//   the NATIVE event bubbles: button → div → root      (the browser does this)
//        ↓
//   React's root listener fires ONCE
//        ↓
//   React finds the fiber for e.target
//        ↓
//   React walks UP the FIBER tree collecting onClick props
//        ↓
//   React calls them in order — capture phase down, then bubble phase up
//
// Runtime rule:
//   The native event finishes bubbling to the root BEFORE any React handler
//   runs. React's "bubbling" is a simulation that happens afterwards.
//
// Practical rule:
//   React events and native events are different systems. Mixing them (a
//   document listener + a React onClick) is where the bugs live.
//
// Common trap:
//   Expecting e.stopPropagation() in a React handler to stop a
//   document.addEventListener. It cannot. It never could. → §6


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD THE EVENT SYSTEM
// ══════════════════════════════════════════════════════════════════

function createFiber(name, props = {}) {
  return { name, props, return: null, children: [] };
}

function tree(name, props, ...children) {
  const fiber = createFiber(name, props);
  for (const child of children) {
    child.return = fiber;
    fiber.children.push(child);
  }
  return fiber;
}

// THE SYNTHETIC EVENT — a wrapper, not the native event.
function createSyntheticEvent(nativeEvent, target) {
  let propagationStopped = false;
  let defaultPrevented = false;

  return {
    nativeEvent,                     // the real event is always available
    target,                          // what was clicked
    currentTarget: null,             // set per-handler as React walks up
    type: nativeEvent.type,
    bubbles: true,

    stopPropagation() {
      propagationStopped = true;     // ← stops REACT's walk. Nothing else.
      // Real React also calls nativeEvent.stopPropagation(), but by now the
      // native event has ALREADY reached the root. Too late for anyone
      // listening between the target and the root. → §6
    },
    isPropagationStopped: () => propagationStopped,

    preventDefault() {
      defaultPrevented = true;
      nativeEvent.defaultPrevented = true;   // this one DOES reach the browser
    },
    isDefaultPrevented: () => defaultPrevented,
  };
}

// THE DISPATCHER — this is React's whole event system in 25 lines.
function createRoot(rootFiber) {
  const log = [];

  function dispatch(eventType, targetFiber) {
    const nativeEvent = { type: eventType, defaultPrevented: false };
    log.push(`[native] event bubbled to the ROOT (React's only listener)`);

    // 1. Collect the path from target UP to root — by walking FIBERS.
    const path = [];
    let fiber = targetFiber;
    while (fiber) {
      path.push(fiber);
      fiber = fiber.return;
    }

    const syntheticEvent = createSyntheticEvent(nativeEvent, targetFiber.name);
    const capitalized = eventType[0].toUpperCase() + eventType.slice(1);

    // 2. CAPTURE PHASE — root → target (reverse order)
    for (const f of [...path].reverse()) {
      const handler = f.props["on" + capitalized + "Capture"];
      if (handler && !syntheticEvent.isPropagationStopped()) {
        syntheticEvent.currentTarget = f.name;
        log.push(`  [capture] ${f.name}`);
        handler(syntheticEvent);
      }
    }

    // 3. BUBBLE PHASE — target → root
    for (const f of path) {
      const handler = f.props["on" + capitalized];
      if (handler && !syntheticEvent.isPropagationStopped()) {
        syntheticEvent.currentTarget = f.name;
        log.push(`  [bubble]  ${f.name}`);
        handler(syntheticEvent);
      } else if (handler) {
        log.push(`  [bubble]  ${f.name} — SKIPPED (propagation stopped)`);
      }
    }

    return syntheticEvent;
  }

  return { dispatch, getLog: () => log.slice(), clearLog: () => (log.length = 0) };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — ONE LISTENER, SIMULATED BUBBLING
// ══════════════════════════════════════════════════════════════════

console.log("§4 — how a click actually travels:\n");

const calls = [];

const button = tree("button", { onClick: () => calls.push("button") });
const card = tree("div.card", { onClick: () => calls.push("div.card") }, button);
const page = tree("div.page", {
  onClick: () => calls.push("div.page"),
  onClickCapture: () => calls.push("div.page CAPTURE"),
}, card);

const root = createRoot(page);
root.dispatch("click", button);

for (const line of root.getLog()) console.log("  " + line);
console.log("\n  handler order:", JSON.stringify(calls));
console.log("\n  Note what did NOT happen: React never called addEventListener");
console.log("  on the button. There is ONE listener, at the root. React");
console.log("  reconstructed the path by walking fiber.return pointers.");
console.log("\n  Capture runs root→target, bubble runs target→root — exactly");
console.log("  mirroring the DOM, but simulated in JavaScript.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — WHY DELEGATE AT ALL?
// ══════════════════════════════════════════════════════════════════
//
// 1. MEMORY. 10,000 rows with onClick = 10,000 native listeners the old way.
//    With delegation: ONE. The handler is just a prop on a fiber — an object
//    property, not a browser listener.
//
// 2. It matches the VDOM model. Adding a row does not mean attaching a
//    listener; removing one does not mean detaching. Handlers live in the
//    tree data, so mount/unmount is free.
//
// 3. CROSS-BROWSER NORMALIZATION. This mattered enormously in 2013 (IE8's
//    attachEvent, srcElement instead of target, keyCode chaos). It matters
//    much less in 2026 — a fair thing to say out loud.
//
// 4. It let React BATCH. All handlers for one event fire inside one React
//    dispatch, so React knows exactly when to flush a single re-render.
//    (React 18 batches everywhere now, so this argument also weakened.)

console.log("§5 — listeners: delegated vs direct\n");

function buildList(rows) {
  let fiber = tree("ul", {});
  for (let i = 0; i < rows; i++) {
    const li = tree("li" + i, { onClick: () => {} });
    li.return = fiber;
    fiber.children.push(li);
  }
  return fiber;
}

for (const rows of [10, 1000, 10000]) {
  const list = buildList(rows);
  const handlerProps = list.children.filter(c => c.props.onClick).length;
  console.log(`  ${String(rows).padStart(5)} rows → ${String(handlerProps).padStart(5)} onClick props,` +
    `  native listeners: 1`);
}
console.log("\n  The onClick props are just object properties. Only the root");
console.log("  ever touched addEventListener. That is the memory win.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE BUG: stopPropagation DOESN'T STOP NATIVE LISTENERS
// ══════════════════════════════════════════════════════════════════
//
// The classic "close the dropdown when you click outside" bug, and one of
// the best senior React questions there is.
//
//   useEffect(() => {
//     document.addEventListener("click", closeDropdown);   // native
//   }, []);
//
//   <div onClick={e => e.stopPropagation()}>   // React — "don't close!"
//     ...dropdown content...
//   </div>
//
// You click INSIDE the dropdown. It closes anyway. Why?
//
//   1. The native click bubbles: content → div → ... → root → DOCUMENT.
//   2. Your document listener fires. Dropdown closes.       ← ALREADY HAPPENED
//   3. React's root listener fires (in React 17+, at the root).
//   4. React walks the fiber tree and calls your stopPropagation.
//
// Step 4 is too late. Step 2 was over before React ran ANY handler.
// React's stopPropagation only stops React's OWN simulated walk.

console.log("§6 — stopPropagation vs a native document listener:\n");

const timeline = [];

// Simulating the real ordering — this is the part people get wrong:
function simulateClickInsideDropdown() {
  timeline.length = 0;

  // PHASE 1: the browser bubbles the native event to every native listener.
  timeline.push("1. native click on dropdown content");
  timeline.push("2. native event bubbles up the real DOM...");
  timeline.push("3. 🔴 document listener fires → closeDropdown()");
  timeline.push("4. native event reaches React's root listener");

  // PHASE 2: only NOW does React start its own simulated dispatch.
  const content = tree("dropdown-content", {
    onClick: (e) => {
      timeline.push("6. React onClick runs → e.stopPropagation()");
      e.stopPropagation();
    },
  });
  const dropdown = tree("dropdown", {
    onClick: () => timeline.push("7. dropdown onClick — SKIPPED"),
  }, content);
  const app = tree("app", {}, dropdown);

  timeline.push("5. React begins its synthetic dispatch");
  createRoot(app).dispatch("click", content);
  timeline.push("8. React's walk stopped ✅ — but the dropdown already closed 🐛");
  return timeline;
}

for (const step of simulateClickInsideDropdown()) console.log("  " + step);

console.log("\n  Read steps 3 and 6. Your stopPropagation ran THREE steps after");
console.log("  the dropdown had already closed. It stopped React's walk, which");
console.log("  nobody was waiting on.");
console.log("\n  FIXES:");
console.log("    • Best: don't use a document listener. Check if the click");
console.log("      target is inside the dropdown ref — see the useOnClickOutside");
console.log("      hook in 03_custom-hooks/06.");
console.log("    • e.nativeEvent.stopImmediatePropagation() — works, but fragile");
console.log("      and ordering-dependent.");
console.log("    • Attach the outside listener in the CAPTURE phase, or on");
console.log("      mousedown instead of click, so ordering is explicit.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — REACT 17: THE ROOT vs DOCUMENT CHANGE
// ══════════════════════════════════════════════════════════════════
//
// Before React 17: React attached ALL delegated listeners to `document`.
// React 17+: it attaches them to the ROOT CONTAINER (the div you pass to
// createRoot).
//
// Why this was a real bug, not a detail:
//
//   Two React versions on one page — a React 16 widget inside a React 18
//   app, or the classic gradual-migration scenario. Both attach to document.
//   e.stopPropagation() in the inner app CANNOT stop the outer app's
//   handlers, because both listeners sit on the SAME node and the inner one
//   never gets the chance to block the outer.
//
//   With root-level attachment, the outer app's root is an ANCESTOR of the
//   inner app's root, so the native event genuinely bubbles from inner root
//   to outer root and stopPropagation works across the boundary.
//
// This is why React 17 — the release "with no new features" — mattered. It
// made incremental upgrades and micro-frontends possible.
//
// Interview line:
//   "React 17 moved delegation from document to the root container so that
//    multiple React roots on one page could nest properly and
//    stopPropagation would work across version boundaries."


// ══════════════════════════════════════════════════════════════════
// § 8 — EVENT POOLING: THE FAMOUS QUESTION THAT IS NOW OBSOLETE
// ══════════════════════════════════════════════════════════════════
//
// You WILL be asked this. The correct answer includes "that was removed."
//
// Before React 17, SyntheticEvents were POOLED: React reused one event
// object, nulling every field after the handler returned, to reduce GC
// pressure in 2014-era browsers.
//
//   function handleChange(e) {
//     setTimeout(() => {
//       console.log(e.target.value);   // 💥 null — the event was recycled
//     }, 100);
//   }
//
//   Fix (pre-17): e.persist(), or capture the value first:
//     const value = e.target.value;    // ← this always worked
//
// React 17 REMOVED pooling entirely. Modern GCs made it a pessimization, and
// it caused far more confusion than it saved. e.persist() still exists as a
// no-op so old code does not break.
//
// The senior answer:
//   "Pooling was removed in React 17. If you see e.persist() in a codebase,
//    it is a leftover. But reading e.target.value into a local before an
//    async boundary is still good practice — not because of pooling, but
//    because the DOM node's value can change under you."

console.log("§8 — event pooling, simulated (React 16 behavior):\n");

function pooledEvent(value) {
  const e = { target: { value }, type: "change" };
  const release = () => { e.target = null; e.type = null; };   // React 16 did this
  return { e, release };
}

const { e: pooled, release } = pooledEvent("hello");
console.log("  inside the handler:      e.target.value =",
  JSON.stringify(pooled.target.value));
const captured = pooled.target.value;    // the fix that always worked
release();                                // React recycles the event
console.log("  in a setTimeout (React 16): e.target =", pooled.target, "💥");
console.log("  captured local variable:   ", JSON.stringify(captured), "✅");
console.log("\n  React 17+ does NOT do this. The event object stays intact.");
console.log("  e.persist() is now a no-op kept for backwards compatibility.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version               Real React
//   ───────────               ──────────
//   one dispatch function     a plugin system (SimpleEventPlugin,
//                             ChangeEventPlugin, SelectEventPlugin...)
//   onClick → "click"         a mapping table; onChange is really the
//                             `input` event, onDoubleClick is `dblclick`
//   all events delegated      NOT ALL. Media events (play, pause), scroll,
//                             and a few others are attached DIRECTLY to the
//                             node, because they do not bubble
//   n/a                       priority per event type: a click is discrete
//                             (SyncLane), a mousemove is continuous — this
//                             is how React 18 prioritizes input
//   n/a                       React 17+ registers BOTH capture and bubble
//                             listeners at the root
//
// Two precise facts:
//   • onChange firing per keystroke is React renaming `input`. Native
//     onchange fires on blur. This is a deliberate API break for consistency.
//   • Events that do not bubble (focus/blur) are handled by React using
//     focusin/focusout, which DO bubble — which is why React's onFocus
//     bubbles but the native one does not.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Click-outside closes a dropdown when clicking inside. → §6.
//
// Bug 2 — e.target.value is null in an async callback:
//   React 16 pooling. → §8. Capture the value first.
//
// Bug 3 — e.target vs e.currentTarget confusion:
//   target = what was actually clicked (maybe a child <span>).
//   currentTarget = the element whose handler is running.
//   Clicking the icon inside a button gives target = the icon.
//
// Bug 4 — A portal's events bubble to the "wrong" parent:
//   Portals render elsewhere in the DOM but React bubbles through the FIBER
//   tree, so events reach the React parent, not the DOM parent. This is
//   intentional and surprises everyone the first time.
//
// Bug 5 — stopPropagation not stopping a third-party analytics listener:
//   Same as §6 — that listener is native and already ran.
//
// Bug 6 — Attaching onScroll and wondering why delegation is not used:
//   Scroll does not bubble, so React attaches it directly.
//
// Bug 7 — Inline arrow handlers defeating React.memo:
//   onClick={() => x} creates a new function every render, so the memoized
//   child sees a changed prop. Not an event-system bug, but it lives here.
//   → useCallback.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The dispatch order:
assert(JSON.stringify(calls) ===
  JSON.stringify(["div.page CAPTURE", "button", "div.card", "div.page"]),
  "capture runs root→target FIRST, then bubble runs target→root");

// Delegation:
const list10k = buildList(10000);
assert(list10k.children.length === 10000, "10,000 rows with onClick props");
assert(list10k.children.every(c => typeof c.props.onClick === "function"),
  "every row has a handler — but they are just object properties");

// stopPropagation stops React's walk, and only that:
const stopCalls = [];
const inner = tree("inner", { onClick: (e) => { stopCalls.push("inner"); e.stopPropagation(); } });
const outer = tree("outer", { onClick: () => stopCalls.push("outer") }, inner);
createRoot(outer).dispatch("click", inner);
assert(stopCalls.length === 1 && stopCalls[0] === "inner",
  "stopPropagation halted React's synthetic walk");

// ...but the native event had already reached the root before React started:
const steps = simulateClickInsideDropdown();
const documentFired = steps.findIndex(s => s.includes("document listener"));
const reactStopped = steps.findIndex(s => s.includes("stopPropagation"));
assert(documentFired < reactStopped,
  "the native document listener fired BEFORE React's stopPropagation — " +
  "this is why click-outside closes the dropdown anyway");

// preventDefault DOES reach the browser:
const pd = createSyntheticEvent({ type: "click", defaultPrevented: false }, "a");
pd.preventDefault();
assert(pd.nativeEvent.defaultPrevented === true,
  "preventDefault forwards to the native event — unlike stopPropagation's reach");

// Pooling:
assert(captured === "hello", "capturing the value into a local always survived");
assert(pooled.target === null, "React 16 nulled the event's fields after the handler");

console.log("§11 — mini assertions passed for: Synthetic events");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is a synthetic event?", answer like this:
//
//   "It is React's cross-browser wrapper around the native event, but the
//    interesting part is the delivery. onClick does not put a listener on
//    that button. React attaches ONE listener per event type at the root
//    container, and when it fires, React finds the fiber for the target and
//    walks UP the fiber tree calling handlers — capture down, then bubble up.
//    It is simulated bubbling over the fiber tree, not the DOM tree.
//
//    The consequence that catches people is ordering. The native event has
//    already bubbled all the way to the root before React runs a single
//    handler. So e.stopPropagation() in a React handler cannot stop a
//    document.addEventListener — that listener fired first. That is the
//    click-outside dropdown bug, and the fix is to check whether the target
//    is inside your ref rather than fighting propagation.
//
//    Two version notes. React 17 moved delegation from document to the root
//    container so multiple React roots can nest and stopPropagation works
//    across them. And React 17 removed event pooling, so e.persist() is now
//    a no-op — though reading e.target.value into a local before an async
//    boundary is still good practice.
//
//    Also worth knowing: not everything is delegated. Scroll and media events
//    don't bubble, so React attaches those directly. And onChange is really
//    the input event — React renamed it so it fires per keystroke."
//
// The ordering explanation for stopPropagation is what marks this as senior.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Does React attach a listener to each element?
// A1. No. One per event type at the root container. Handlers are props on
//     fibers; React walks the fiber tree to find them.
//
// Q2. Why doesn't stopPropagation stop my document listener?
// A2. Ordering. The native event reaches the root — and document — before
//     React dispatches anything. React's stopPropagation only halts React's
//     own simulated walk.
//
// Q3. What changed in React 17?
// A3. Delegation moved from document to the root container, enabling nested
//     React roots and cross-version stopPropagation. Pooling was removed.
//
// Q4. What was event pooling?
// A4. Reusing one event object and nulling its fields after the handler, for
//     GC reasons. Removed in 17; e.persist() is a no-op now.
//
// Q5. target vs currentTarget?
// A5. target = what was clicked. currentTarget = whose handler is running.
//
// Q6. Are all events delegated?
// A6. No. Non-bubbling events (scroll, media) attach directly to the node.
//
// Q7. Why does a portal's event bubble to its React parent?
// A7. Because React bubbles through the FIBER tree, not the DOM tree. The
//     portal's fiber parent is still the component that rendered it.
//
// Q8. Is React's onChange the native change event?
// A8. No — it is `input`, firing per keystroke. Native change fires on blur.
//
// Q9. Why does React's onFocus bubble when native focus does not?
// A9. React implements it with focusin/focusout, which do bubble.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is a SyntheticEvent?
//   Back : React's cross-browser wrapper, delivered by ONE root listener +
//          simulated bubbling through fibers.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : The native event reaches the root BEFORE any React handler runs.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Expecting React's stopPropagation to stop a native document listener.
//
// Flashcard 4:
//   Front: What did React 17 change?
//   Back : Delegation document → root container. Pooling removed.
//
// Flashcard 5:
//   Front: What was e.persist() for?
//   Back : Opting out of pooling. Now a no-op.
//
// Flashcard 6:
//   Front: How do you sound senior?
//   Back : Explain the ORDERING that makes click-outside fail, then fix it
//          with a ref check instead of propagation.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild the dispatcher from memory. The key insight: walk fiber.return
//   to build the path, then run it in reverse for capture.
//
// Task 2:
//   Add portal support: give a fiber a `portalTarget` and confirm events
//   still bubble through the FIBER parent, not the DOM parent.
//
// Task 3:
//   Implement the real fix for §6: a useOnClickOutside that checks
//   ref.current.contains(e.target) instead of using stopPropagation. Then
//   compare with 03_custom-hooks/06.
//
// Task 4:
//   Add stopImmediatePropagation to the synthetic event. What should it do
//   differently from stopPropagation inside React's own walk?
//
// Task 5:
//   Break §4: remove the `!syntheticEvent.isPropagationStopped()` check from
//   the bubble loop. Watch handlers fire after being stopped.
//
// Task 6:
//   Explain in 60 seconds why clicking inside a dropdown still closes it,
//   without saying "React is weird".


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   ONE listener at the root. React simulates bubbling by walking fibers.
//
// If you remember the common bug:
//   stopPropagation cannot stop a document listener — that listener already
//   fired before React dispatched anything.
//
// If you remember the professional framing:
//   React events and DOM events are two systems. React 17 moved delegation to
//   the root and deleted pooling. Know both, and know why they changed.
//
// NEXT TOPIC -> 12_react-strictmode.js
