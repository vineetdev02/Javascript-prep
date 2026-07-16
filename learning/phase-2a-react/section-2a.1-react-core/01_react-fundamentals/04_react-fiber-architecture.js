// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Fundamentals  →  04_react-fiber-architecture.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: React Fiber architecture
//
// WHAT YOU WILL MASTER HERE:
//   1. Exact definition in interview language
//   2. WHY Fiber exists — the recursion problem, demonstrated
//   3. A working fiber tree + interruptible work loop you build yourself
//   4. Render phase vs commit phase, and why the split matters
//   5. Double buffering (current vs workInProgress)
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.1-react-core/01_react-fundamentals/04_react-fiber-architecture.js"
//
// Prerequisite: 03_reconciliation-algorithm.js — Fiber did NOT change the
// diff rules. It changed HOW the walk executes. Know the rules first.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Fiber:
// A rewrite of React's core that replaced recursive rendering with a linked
// list of work units React can PAUSE, ABORT, RESUME, and PRIORITIZE.
//
// If interviewer says "explain it simply", say:
// "A fiber is a unit of work — one object per component instance. Because
//  they are a linked list instead of a call stack, React can stop halfway
//  through rendering, let the browser paint, and continue afterwards."
//
// If interviewer asks "why does it matter?", say:
// "Before Fiber, rendering was a recursive function call. Once it started
//  you could not stop it — the call stack owns you. A big tree blocked the
//  main thread and the page froze. Fiber made rendering interruptible, and
//  everything in Concurrent React is built on that."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   a call stack React implements itself, so React can pause it
//
// The insight in one line:
//   You cannot pause the JavaScript call stack. So React stopped using it
//   and reimplemented it as data.
//
// The fiber links (a fiber is NOT a tree node with a children array):
//
//        ┌─────────┐
//        │  App    │
//        └────┬────┘
//             │ child
//        ┌────▼────┐  sibling   ┌─────────┐
//        │ Header  ├───────────►│  Main   │
//        └────┬────┘            └────┬────┘
//             │ return (parent)      │
//        ┌────▼────┐            ┌────▼────┐
//        │  Logo   │            │  List   │
//        └─────────┘            └─────────┘
//
//   fiber.child   → first child
//   fiber.sibling → next sibling
//   fiber.return  → parent (named "return" because it is where the
//                   simulated stack RETURNS to — it is a stack frame)
//
// Traversal rule — this IS the algorithm:
//   1. Go to child if there is one.
//   2. Else go to sibling.
//   3. Else climb via return until you find a sibling.
//   4. Back at the root = done.
//
// Runtime rule:
//   After every unit of work, React checks: do I still have time?
//   If not, it saves the pointer and yields to the browser.
//
// Practical rule:
//   Render phase can run MANY times or be thrown away. Commit runs ONCE.
//   That is why render must be pure. StrictMode double-invokes to prove it.
//
// Common trap:
//   Thinking Fiber made React faster. It did not. It made React
//   INTERRUPTIBLE, which makes apps FEEL faster. Throughput is slightly
//   worse; responsiveness is much better.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE PROBLEM FIBER SOLVED
// ══════════════════════════════════════════════════════════════════
//
// Old React (Stack Reconciler) was essentially:
//
//   function render(element) {
//     const children = element.render();
//     children.forEach(render);      // ← recursion
//   }
//
// Once this starts, nothing can stop it. Not a click, not a keystroke.
// The browser cannot paint. 3000 components = a frozen tab.
//
// You cannot fix this with async/await — you cannot pause a call stack
// mid-recursion and resume it later. The only fix is to stop using the
// call stack. That is Fiber's entire thesis.

console.log("§3 — why recursion cannot be interrupted:\n");

function stackRender(node, depth = 0, log = []) {
  log.push(" ".repeat(depth * 2) + node.name);
  // Imagine wanting to stop right here because the user typed something.
  // You cannot. There is no way to pause and resume this stack.
  for (const child of node.children || []) {
    stackRender(child, depth + 1, log);
  }
  return log;
}

const tree = {
  name: "App",
  children: [
    { name: "Header", children: [{ name: "Logo" }, { name: "Nav" }] },
    { name: "Main", children: [{ name: "List", children: [{ name: "Row" }] }] },
  ],
};

console.log(stackRender(tree).join("\n"));
console.log("\n  All-or-nothing. No pause point exists.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — BUILD THE FIBER TREE
// ══════════════════════════════════════════════════════════════════

function createFiber(name, props = {}) {
  return {
    name,
    props,
    child: null,       // first child
    sibling: null,     // next sibling
    return: null,      // parent — the "stack frame" to return to
    alternate: null,   // the other tree (double buffering)
    effectTag: null,   // PLACEMENT / UPDATE / DELETION
    memoizedState: null, // hook list lives here
  };
}

function buildFiberTree(node, parent = null) {
  const fiber = createFiber(node.name);
  fiber.return = parent;

  let previousSibling = null;
  for (const childNode of node.children || []) {
    const childFiber = buildFiberTree(childNode, fiber);
    if (previousSibling === null) {
      fiber.child = childFiber;        // first child hangs off .child
    } else {
      previousSibling.sibling = childFiber;  // the rest are a sibling chain
    }
    previousSibling = childFiber;
  }
  return fiber;
}

const rootFiber = buildFiberTree(tree);

console.log("§4 — the same tree as fiber links:");
console.log("  App.child          =", rootFiber.child.name);
console.log("  App.child.sibling  =", rootFiber.child.sibling.name);
console.log("  Header.child       =", rootFiber.child.child.name);
console.log("  Logo.sibling       =", rootFiber.child.child.sibling.name);
console.log("  Logo.return        =", rootFiber.child.child.return.name);
console.log("  ↑ no children ARRAY. Just three pointers per node.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE WORK LOOP (the heart of Fiber)
// ══════════════════════════════════════════════════════════════════
//
// This is the function worth memorizing. Real React's is the same shape.

function performUnitOfWork(fiber) {
  // 1. BEGIN WORK — render this component, produce children.
  //    (Real React calls your function component here and runs hooks.)

  // 2. Return the NEXT unit of work: child → sibling → climb.
  if (fiber.child) {
    return fiber.child;
  }

  let next = fiber;
  while (next) {
    // COMPLETE WORK happens here on the way up (build DOM node, collect effects)
    if (next.sibling) {
      return next.sibling;
    }
    next = next.return;   // climb the simulated stack
  }
  return null;            // back at the root — render phase done
}

function workLoop(root, { budgetPerFrame = 2 } = {}) {
  let nextUnitOfWork = root;
  const timeline = [];
  let frame = 0;

  while (nextUnitOfWork) {
    frame++;
    let workDoneThisFrame = 0;
    const framePlan = [];

    // Work until we run out of budget — THIS is shouldYield()
    while (nextUnitOfWork && workDoneThisFrame < budgetPerFrame) {
      framePlan.push(nextUnitOfWork.name);
      nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
      workDoneThisFrame++;
    }

    timeline.push({ frame, worked: framePlan, yielded: nextUnitOfWork !== null });
    // ← Right here React RETURNS to the browser. It can paint, handle a
    //   click, run a keystroke. Then it calls us back with the saved pointer.
  }
  return timeline;
}

console.log("§5 — the interruptible work loop (budget: 2 units per frame):");
for (const frame of workLoop(rootFiber)) {
  console.log(`  frame ${frame.frame}: worked on [${frame.worked.join(", ")}]` +
    (frame.yielded ? "  → YIELD to browser 🖐" : "  → done ✓"));
}
console.log("\n  Same traversal order as the recursion in §3 — but React can");
console.log("  stop between ANY two units and let the browser breathe.");
console.log("  nextUnitOfWork is the whole state. That is why it can resume.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — PROVE THE TRAVERSAL MATCHES THE RECURSION
// ══════════════════════════════════════════════════════════════════

function fiberOrder(root) {
  const order = [];
  let next = root;
  while (next) {
    order.push(next.name);
    next = performUnitOfWork(next);
  }
  return order;
}

const recursiveOrder = stackRender(tree).map(s => s.trim());
const loopOrder = fiberOrder(rootFiber);

console.log("§6 — recursion order vs fiber loop order:");
console.log("  recursive:", recursiveOrder.join(" → "));
console.log("  fiber    :", loopOrder.join(" → "));
console.log("  identical?", JSON.stringify(recursiveOrder) === JSON.stringify(loopOrder));
console.log("  ↑ Same depth-first order. Fiber did not change WHAT React");
console.log("    visits — only that it can pause between visits.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — DOUBLE BUFFERING: current vs workInProgress
// ══════════════════════════════════════════════════════════════════
//
// React keeps TWO fiber trees at all times:
//
//   current         — what is on screen right now
//   workInProgress  — the one being built, off-screen
//
// They point at each other through .alternate. When the render phase
// finishes, React swaps the root pointer in ONE assignment. That is the
// commit. The user never sees a half-built tree.
//
// This is exactly the double buffering technique from game/graphics
// programming — draw to the back buffer, then flip.
//
// It is ALSO why an interrupted render costs nothing: React just throws the
// workInProgress tree away. current was never touched.

function cloneForWork(currentFiber) {
  if (!currentFiber) return null;
  const wip = createFiber(currentFiber.name, currentFiber.props);
  wip.alternate = currentFiber;      // point back at the on-screen fiber
  currentFiber.alternate = wip;      // and forward
  wip.child = cloneForWork(currentFiber.child);
  if (wip.child) wip.child.return = wip;
  wip.sibling = cloneForWork(currentFiber.sibling);
  if (wip.sibling) wip.sibling.return = wip.return;
  return wip;
}

let currentRoot = rootFiber;
const workInProgressRoot = cloneForWork(currentRoot);

console.log("§7 — double buffering:");
console.log("  current root      :", currentRoot.name);
console.log("  workInProgress    :", workInProgressRoot.name);
console.log("  same object?      ", currentRoot === workInProgressRoot);
console.log("  linked via alternate?", currentRoot.alternate === workInProgressRoot);

// Abandon the render — user typed something more important:
const abandoned = workInProgressRoot;
console.log("  → interrupt! throw workInProgress away.");
console.log("  current still intact?", currentRoot.name === "App", "— screen never flickered");

// Or commit it — one pointer swap:
currentRoot = abandoned;
console.log("  → or commit: swap the root pointer. Atomic. Now current =",
  currentRoot.name, "\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — RENDER PHASE vs COMMIT PHASE
// ══════════════════════════════════════════════════════════════════
//
//   RENDER PHASE (asynchronous, interruptible, can be thrown away)
//     • calls your component functions
//     • runs hooks, computes new state
//     • diffs and flags effects (Placement/Update/Deletion)
//     • touches NO DOM — nothing is visible
//     • MAY RUN TWICE OR BE DISCARDED  ← this is why render must be pure
//
//   COMMIT PHASE (synchronous, uncancellable, one pass)
//     • mutation: apply DOM changes
//     • layout:   useLayoutEffect + refs attach — BEFORE paint, blocking
//     • paint:    the browser draws
//     • passive:  useEffect runs — AFTER paint, non-blocking
//
// The commit CANNOT be interrupted. If it were, the user would see a tree
// half-updated. Consistency is not negotiable.
//
// Everything about hooks follows from this split:
//   • Side effects in render = wrong, render may run twice or be discarded.
//   • useLayoutEffect blocks paint = correct for measuring, bad for fetching.
//   • useEffect after paint = correct for fetching, causes flicker for layout.
//   → 09_uselayouteffect-vs-useeffect.js


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL REACT DOES DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our version                  Real React
//   ───────────                  ──────────
//   budgetPerFrame counter       shouldYield() checking a real 5ms deadline
//                                against performance.now()
//   while loop                   requestIdleCallback-like scheduling via a
//                                MessageChannel (Scheduler package)
//   fiber = { name, props }      a large object: tag, key, stateNode, type,
//                                pendingProps, memoizedProps, memoizedState,
//                                updateQueue, flags, lanes, ...
//   one priority                 LANES — a bitmask of priorities. A keystroke
//                                (SyncLane) preempts a transition
//                                (TransitionLane) mid-render
//   no completeWork              a real complete phase building host
//                                instances bottom-up and bubbling flags
//
// One precise fact interviewers reward:
//   Fiber shipped in React 16 (2017), but concurrency stayed OFF until
//   React 18. Fiber was the ENABLER; useTransition, useDeferredValue, and
//   Suspense streaming are what it enabled. Fiber alone is not "concurrent
//   mode" — that distinction catches people out.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Side effect in render fires twice:
//   Render may be invoked more than once per commit. StrictMode makes this
//   loud on purpose. Move it to useEffect.
//
// Bug 2 — Mutating a ref during render:
//   The render can be discarded, but your mutation is not. The ref now
//   reflects a render that never committed. Mutate refs in effects.
//
// Bug 3 — "Cannot update a component while rendering a different component":
//   setState during another component's render phase. The tree is mid-build.
//
// Bug 4 — Tearing with an external store:
//   A concurrent render reads the store, yields, the store changes, the
//   render resumes and reads a DIFFERENT value. Two parts of the UI now
//   disagree. This is exactly why useSyncExternalStore exists.
//   → 14_usesyncexternalstore.js
//
// Bug 5 — Expecting useEffect before paint:
//   It runs after. For measurement, useLayoutEffect. Otherwise: flicker.
//
// Bug 6 — Long synchronous work still freezes React 18:
//   Fiber can only yield BETWEEN units of work. One component with a
//   500ms loop blocks everything. Fiber does not give you threads.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

assert(JSON.stringify(recursiveOrder) === JSON.stringify(loopOrder),
  "fiber loop visits nodes in the same order as recursion");
assert(rootFiber.child.child.return === rootFiber.child,
  "return points at the parent");
assert(rootFiber.child.child.sibling.name === "Nav",
  "siblings form a chain, not an array");
assert(rootFiber.children === undefined,
  "a fiber has NO children array — only child/sibling/return");

const frames = workLoop(buildFiberTree(tree), { budgetPerFrame: 2 });
assert(frames.length > 1, "work is spread across multiple frames");
assert(frames[0].yielded === true, "React yielded to the browser mid-render");
assert(frames[frames.length - 1].yielded === false, "last frame completes the tree");

const smallBudget = workLoop(buildFiberTree(tree), { budgetPerFrame: 1 });
const bigBudget = workLoop(buildFiberTree(tree), { budgetPerFrame: 100 });
assert(smallBudget.length > bigBudget.length,
  "a smaller budget means more yields — the responsiveness/throughput trade-off");
assert(bigBudget.length === 1, "a huge budget = one blocking pass = old React");

console.log("§11 — mini assertions passed for: React Fiber architecture");
console.log("  (note the last two: budget 1 =", smallBudget.length, "frames,",
  "budget 100 =", bigBudget.length, "frame — that IS the trade-off)");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is Fiber?", answer like this:
//
//   "Fiber is React's reimplementation of its own call stack as data.
//
//    Old React rendered by recursion. Once recursion starts you cannot stop
//    it — the JS call stack is not pausable — so a big tree froze the page.
//    Fiber replaced the recursive tree walk with a linked list: every
//    component gets a fiber object with child, sibling, and return pointers.
//    Rendering becomes a loop over units of work, and after each unit React
//    checks a deadline and can yield to the browser, keeping the whole state
//    in one pointer, nextUnitOfWork.
//
//    That split rendering into two phases. The render phase is interruptible,
//    touches no DOM, and can be thrown away or replayed — which is exactly
//    why render must be pure and why StrictMode double-invokes it. The commit
//    phase is synchronous and atomic, because a half-applied tree would be
//    visible. React keeps two trees, current and workInProgress, and commits
//    by swapping a pointer — double buffering.
//
//    One nuance: Fiber shipped in React 16 but concurrency was only turned on
//    in React 18. Fiber was the enabler; useTransition and Suspense streaming
//    are what it enabled. And Fiber did not make React faster — throughput is
//    slightly worse. It made it interruptible, which makes apps FEEL faster."
//
// That is a staff-level answer. Then offer to write the work loop — 12 lines.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why is the parent pointer called "return"?
// A1. Because a fiber is a stack frame. return is where control returns when
//     this frame completes — exactly like a real call stack.
//
// Q2. Did Fiber make React faster?
// A2. No. It added overhead. It made rendering interruptible and prioritized,
//     which improves perceived performance, not throughput.
//
// Q3. Why can the commit phase not be interrupted?
// A3. The user would see a partially updated UI. Render is invisible and
//     therefore safe to pause; commit is visible and must be atomic.
//
// Q4. What is the alternate field?
// A4. The link between current and workInProgress. React reuses the pair to
//     avoid allocating a whole tree per render — double buffering.
//
// Q5. What are lanes?
// A5. A bitmask priority model that replaced expiration times. It lets React
//     work on multiple priorities and preempt a transition with a keystroke.
//
// Q6. Is Fiber the same as concurrent mode?
// A6. No. Fiber (React 16) is the architecture. Concurrency (React 18) is the
//     feature set built on it. Fiber alone still rendered synchronously.
//
// Q7. If Fiber can interrupt, why does my app still freeze?
// A7. Yielding happens BETWEEN units of work. One component doing 500ms of
//     synchronous work is one unit. Fiber is cooperative, not preemptive —
//     it is not threads. Use a web worker.
//
// Q8. How does Fiber cause tearing?
// A8. A paused render can resume after an external store changed, so two
//     components read different values from the same store in one commit.
//     useSyncExternalStore forces a consistent read.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is a fiber?
//   Back : A unit of work — one object per component, with child/sibling/return.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : After each unit of work, check the deadline; yield if out of time.
//
// Flashcard 3:
//   Front: Why did recursion have to go?
//   Back : The JS call stack cannot be paused. React rebuilt it as data.
//
// Flashcard 4:
//   Front: Render phase vs commit phase?
//   Back : Render = async, no DOM, discardable, must be pure.
//          Commit = sync, atomic, touches DOM.
//
// Flashcard 5:
//   Front: What is the most common trap?
//   Back : "Fiber made React faster." It made it interruptible. Throughput fell.
//
// Flashcard 6:
//   Front: How do you sound senior?
//   Back : Fiber (16) enabled concurrency (18). Name the gap.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Rebuild performUnitOfWork from memory. Three rules: child, sibling,
//   climb via return. If you can write that, you understand Fiber.
//
// Task 2:
//   Add a real deadline: replace budgetPerFrame with
//   performance.now() - start > 5. That is literally shouldYield().
//
// Task 3:
//   Add priority: give each fiber a lane number and make the loop process
//   high-priority fibers first, restarting on interrupt. You have just
//   built a toy scheduler.
//
// Task 4:
//   Add completeWork: log on the way UP the tree in §5. Notice children
//   complete before parents — that is how React builds DOM bottom-up.
//
// Task 5:
//   Simulate tearing: mutate a shared value between two frames of workLoop
//   and have two fibers read it. Watch them disagree. Then fix it by
//   snapshotting the value once per render — you invented useSyncExternalStore.
//
// Task 6:
//   Explain in 60 seconds why an interrupted render costs nothing, using
//   the word "alternate".


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Fiber = React's call stack rebuilt as a linked list, so it can pause.
//
// If you remember the common bug:
//   Side effects in render. The render phase may run twice or be thrown
//   away — only the commit is guaranteed to have happened once.
//
// If you remember the professional framing:
//   Fiber traded throughput for interruptibility. Fiber (16) enabled
//   concurrency (18). It is cooperative scheduling, not threads.
//
// NEXT TOPIC -> 05_keys-in-lists.js
