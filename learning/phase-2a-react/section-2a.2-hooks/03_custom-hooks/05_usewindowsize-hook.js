// ╔══════════════════════════════════════════════════════════════════╗
// ║   Custom Hooks  →  05_usewindowsize-hook.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useWindowSize hook
//
// WHAT YOU WILL MASTER HERE:
//   1. Build it — subscribe, read, cleanup, SSR guard
//   2. Why it re-renders on EVERY resize pixel, and how to stop it
//   3. Layout thrashing: reading innerWidth in a resize handler
//   4. Why matchMedia beats useWindowSize for breakpoints — measured
//   5. The honest answer: use CSS
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/03_custom-hooks/05_usewindowsize-hook.js"
//
// Prerequisites: 03_useeffect-cleanup.js, 03_usedebounce-hook.js,
// 14_usesyncexternalstore.js.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useWindowSize:
// Subscribes to the window's resize event and returns the current dimensions
// as React state.
//
// If interviewer says "explain it simply", say:
// "An effect adds a resize listener, sets state with innerWidth/innerHeight,
//  and removes the listener in the cleanup. The SSR guard and the throttling
//  are what make it non-trivial."
//
// If interviewer asks "why does it matter?", say:
// "Because the naive version re-renders your entire subtree on every single
//  pixel of a drag — sixty-plus renders a second — and it reads layout inside
//  a handler, which forces synchronous reflow. And because the honest answer
//  is usually 'use a CSS media query instead'."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   a firehose you are piping into React state
//
// The naive version:
//
//   function useWindowSize() {
//     const [size, setSize] = useState({
//       width: window.innerWidth,        // 🐛 SSR crash + eager read
//       height: window.innerHeight,
//     });
//     useEffect(() => {
//       const onResize = () => setSize({
//         width: window.innerWidth,      // 🐛 forced reflow, per event
//         height: window.innerHeight,
//       });
//       window.addEventListener("resize", onResize);
//       return () => window.removeEventListener("resize", onResize);  // ✅
//     }, []);
//     return size;
//   }
//
// Runtime rule:
//   `resize` fires continuously during a drag — dozens of times per second.
//   Every one of those setState calls re-renders every component using this
//   hook AND all their children.
//
// Practical rule:
//   Ask what you actually need. A breakpoint boolean? matchMedia. A layout
//   decision? CSS. An actual pixel measurement of an element? ResizeObserver.
//   The full window size in JS state is the rarest of the four.
//
// Common trap:
//   Using it for `isMobile` and re-rendering the app 60 times a second so a
//   sidebar can hide — something a media query does for free, off the main
//   thread.


// ══════════════════════════════════════════════════════════════════
// § 3 — A FAKE WINDOW
// ══════════════════════════════════════════════════════════════════

function createFakeWindow(width = 1920, height = 1080) {
  const listeners = { resize: [] };
  let layoutReads = 0;
  let layoutDirty = false;

  const win = {
    get innerWidth() {
      layoutReads++;
      // Reading layout after a change forces the browser to RECALCULATE.
      if (layoutDirty) { win.forcedReflows++; layoutDirty = false; }
      return width;
    },
    get innerHeight() { layoutReads++; return height; },
    forcedReflows: 0,
    addEventListener: (type, fn) => listeners[type]?.push(fn),
    removeEventListener: (type, fn) => {
      const i = listeners[type]?.indexOf(fn);
      if (i >= 0) listeners[type].splice(i, 1);
    },
    // Simulate a user dragging the window edge:
    resizeTo(w, h) {
      width = w; height = h;
      layoutDirty = true;
      listeners.resize.forEach(fn => fn());
    },
    listenerCount: () => listeners.resize.length,
    layoutReads: () => layoutReads,
    matchMedia: (query) => {
      const match = /\(max-width:\s*(\d+)px\)/.exec(query);
      const breakpoint = match ? Number(match[1]) : 0;
      const mqListeners = [];
      const mql = {
        get matches() { return width <= breakpoint; },
        addEventListener: (_, fn) => mqListeners.push(fn),
        removeEventListener: (_, fn) => {
          const i = mqListeners.indexOf(fn); if (i >= 0) mqListeners.splice(i, 1);
        },
        _notify: () => mqListeners.forEach(fn => fn({ matches: mql.matches })),
      };
      // The browser only notifies when the MATCH STATE flips, not on every px.
      let last = mql.matches;
      listeners.resize.push(() => {
        if (mql.matches !== last) { last = mql.matches; mql._notify(); }
      });
      return mql;
    },
  };
  return win;
}

function createMiniReact() {
  const hooks = [];
  let cursor = 0;
  let component = null;
  let renders = 0;

  function useState(initial) {
    const slot = cursor++;
    if (!(slot in hooks)) {
      hooks[slot] = { value: typeof initial === "function" ? initial() : initial };
    }
    const setState = (next) => {
      const value = typeof next === "function" ? next(hooks[slot].value) : next;
      if (Object.is(value, hooks[slot].value)) return;   // ← the bailout
      hooks[slot].value = value;
      render();
    };
    return [hooks[slot].value, setState];
  }

  function useEffect(fn, deps) {
    const slot = cursor++;
    const prev = hooks[slot];
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
    if (changed) {
      if (prev?.cleanup) prev.cleanup();
      hooks[slot] = { deps, cleanup: undefined };
      hooks[slot].cleanup = fn();
    }
  }

  function render() { cursor = 0; renders++; return component(); }
  function mount(fn) { component = fn; return render(); }
  function unmount() {
    for (const h of hooks) if (h?.cleanup) h.cleanup();
  }
  return { useState, useEffect, mount, unmount, getRenders: () => renders };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE FIREHOSE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — one drag of the window edge:\n");

const win = createFakeWindow();
const R1 = createMiniReact();

R1.mount(() => {
  const [size, setSize] = R1.useState({ width: 1920, height: 1080 });
  R1.useEffect(() => {
    const onResize = () => setSize({ width: win.innerWidth, height: win.innerHeight });
    win.addEventListener("resize", onResize);
    return () => win.removeEventListener("resize", onResize);
  }, []);
  return size;
});

// A user drags the edge. The browser fires resize for every pixel.
for (let w = 1919; w >= 1870; w--) win.resizeTo(w, 1080);   // 50 pixels

// Snapshot now — later demos fire more events, and these numbers are about
// THIS drag only.
const dragRenders = R1.getRenders() - 1;
const dragReflows = win.forcedReflows;

console.log("  dragged the edge 50px:");
console.log("    resize events fired :", 50);
console.log("    React re-renders    :", dragRenders);
console.log("    layout reads        :", win.layoutReads());
console.log("    forced reflows      :", dragReflows);

console.log("\n  Fifty re-renders of every component using this hook AND all");
console.log("  their children — for one small drag. A real drag across the");
console.log("  screen is hundreds.");
console.log("\n  Note the forced reflows. Reading innerWidth right after a");
console.log("  layout change makes the browser recalculate layout SYNCHRONOUSLY");
console.log("  before it can answer. That is layout thrashing, once per event,");
console.log("  on the main thread, during a drag. → 02_virtual-dom-concept.js §7\n");

// Note the object identity problem too. (Its own window, so it cannot
// pollute the numbers above.)
const winB = createFakeWindow();
const R2 = createMiniReact();
R2.mount(() => {
  const [size, setSize] = R2.useState({ width: 1920, height: 1080 });
  R2.useEffect(() => {
    const onResize = () => setSize({ width: 1920, height: 1080 });   // SAME values
    winB.addEventListener("resize", onResize);
    return () => winB.removeEventListener("resize", onResize);
  }, []);
  return size;
});
const before = R2.getRenders();
for (let i = 0; i < 10; i++) winB.resizeTo(1920, 1080);
console.log("  10 resizes where the size did NOT actually change:");
console.log("    re-renders:", R2.getRenders() - before, "🐛");
console.log("    Object.is({w,h}, {w,h}) is false — a NEW object every time, so");
console.log("    React's bailout never fires. Even a no-op resize re-renders.");
console.log("    → 07_usememo-when-to-use.js\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE FIXES, IN ORDER OF PREFERENCE
// ══════════════════════════════════════════════════════════════════
//
// FIX 0 — Don't use JavaScript. This is genuinely the right answer most of
//         the time and almost nobody says it:
//
//           .sidebar { display: none; }
//           @media (min-width: 768px) { .sidebar { display: block; } }
//
//         Zero renders. Zero listeners. Runs on the compositor, not the main
//         thread. Works before hydration. If the goal is "hide this on
//         mobile", CSS already solved it in 2012.
//
// FIX 1 — matchMedia, if you need the boolean IN JavaScript:
//         The browser only notifies when the match STATE FLIPS, not per pixel.
//         50 pixels of drag across a breakpoint = ONE event. → §6
//
// FIX 2 — Throttle or debounce, if you genuinely need the pixel value:
//         throttle(onResize, 100) → ~10 renders/sec instead of 60+.
//         Note: THROTTLE, not debounce — you want updates DURING the drag.
//         → 03_usedebounce-hook.js §6
//
// FIX 3 — ResizeObserver, if you actually care about an ELEMENT:
//         Usually "window size" is a proxy for "how big is my container".
//         ResizeObserver answers that directly, fires off the main thread,
//         and is what container queries are built on.

console.log("§5 — throttling the firehose:\n");

function simulateThrottled(events, intervalMs, msPerEvent) {
  let lastRun = -Infinity;
  let renders = 0;
  for (let i = 0; i < events; i++) {
    const now = i * msPerEvent;
    if (now - lastRun >= intervalMs) { renders++; lastRun = now; }
  }
  return renders;
}

const dragEvents = 300;      // a real drag across the screen
const msPerEvent = 4;        // ~250/sec during a fast drag

console.log(`  a ${dragEvents}-event drag (${dragEvents * msPerEvent}ms):\n`);
console.log("    no throttle    →", dragEvents, "re-renders 🐛");
console.log("    throttle(100)  →", simulateThrottled(dragEvents, 100, msPerEvent),
  "re-renders ✅");
console.log("    throttle(16)   →", simulateThrottled(dragEvents, 16, msPerEvent),
  "re-renders (once per frame — the most that can ever be VISIBLE)");
console.log("\n  Beyond one render per frame you are doing work the user cannot");
console.log("  see. 300 renders for 75 frames means 225 of them were invisible.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — matchMedia: THE RIGHT TOOL FOR BREAKPOINTS
// ══════════════════════════════════════════════════════════════════

console.log("§6 — useWindowSize vs useMediaQuery for `isMobile`:\n");

// ── useWindowSize for a breakpoint ──────────────────────────────
const win2 = createFakeWindow(1000);
const R3 = createMiniReact();
R3.mount(() => {
  const [width, setWidth] = R3.useState(1000);
  R3.useEffect(() => {
    const onResize = () => setWidth(win2.innerWidth);
    win2.addEventListener("resize", onResize);
    return () => win2.removeEventListener("resize", onResize);
  }, []);
  return width < 768;                  // isMobile — a BOOLEAN derived from px
});
for (let w = 999; w >= 700; w--) win2.resizeTo(w, 1080);   // 300 pixels
const windowSizeRenders = R3.getRenders() - 1;

// ── useMediaQuery ───────────────────────────────────────────────
const win3 = createFakeWindow(1000);
const R4 = createMiniReact();
R4.mount(() => {
  const mql = win3.matchMedia("(max-width: 767px)");
  const [matches, setMatches] = R4.useState(mql.matches);
  R4.useEffect(() => {
    const onChange = (e) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return matches;
});
for (let w = 999; w >= 700; w--) win3.resizeTo(w, 1080);   // the same 300
const mediaQueryRenders = R4.getRenders() - 1;

console.log("  dragging from 1000px to 700px — crossing the 768px breakpoint:\n");
console.log("    useWindowSize + width < 768 →", windowSizeRenders, "re-renders 🐛");
console.log("    useMediaQuery('max-width: 767px') →", mediaQueryRenders,
  "re-render  ✅");

console.log("\n  Both produce the same boolean. One re-rendered 300 times to");
console.log("  compute it; the other re-rendered when the ANSWER changed.");
console.log("\n  Why: the browser evaluates the media query itself and only");
console.log("  notifies you when the match state FLIPS. You are subscribing to");
console.log("  the question you actually asked, not to a stream of pixels you");
console.log("  then have to reduce yourself.");
console.log("\n  Rule: if your hook's output is a BOOLEAN, do not subscribe to a");
console.log("  NUMBER. Push the derivation down to whoever can do it cheapest —");
console.log("  and here that is the browser.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — SSR AND THE CLEANUP
// ══════════════════════════════════════════════════════════════════
//
// The SSR guard, same as useLocalStorage:
//
//   const [size, setSize] = useState(() => ({
//     width: typeof window === "undefined" ? undefined : window.innerWidth,
//     height: typeof window === "undefined" ? undefined : window.innerHeight,
//   }));
//
// Returning `undefined` rather than a guessed default is deliberate. If you
// return 1920 on the server and the user is on a phone, you render the desktop
// layout, hydrate, and it snaps to mobile — a visible jump on every load.
// Returning undefined lets the caller decide:
//
//   const { width } = useWindowSize();
//   if (width === undefined) return <Skeleton />;   // honest about not knowing
//
// The cleanup matters as much as anywhere:

console.log("§7 — the cleanup:\n");

const win4 = createFakeWindow();
const R5 = createMiniReact();
R5.mount(() => {
  const [size, setSize] = R5.useState({ width: 0, height: 0 });
  R5.useEffect(() => {
    const onResize = () => setSize({ width: win4.innerWidth, height: win4.innerHeight });
    win4.addEventListener("resize", onResize);
    return () => win4.removeEventListener("resize", onResize);
  }, []);
  return size;
});

console.log("    mounted  → listeners:", win4.listenerCount());
R5.unmount();
console.log("    unmounted → listeners:", win4.listenerCount(), "✅");
console.log("\n  Without the cleanup, every mount of every component using this");
console.log("  hook leaves a listener behind — each holding its closure, and");
console.log("  each calling setState on an unmounted component.");
console.log("  → 02_built-in-hooks/03_useeffect-cleanup.js\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE MODERN VERSION
// ══════════════════════════════════════════════════════════════════
//
// Window size is a value outside React that changes without React knowing —
// an external store. So:
//
//   function subscribe(callback) {
//     window.addEventListener("resize", callback);
//     return () => window.removeEventListener("resize", callback);
//   }
//
//   function useWindowWidth() {
//     return useSyncExternalStore(
//       subscribe,
//       () => window.innerWidth,       // ← a NUMBER. Object.is-stable ✅
//       () => undefined                // ← SSR: we genuinely do not know
//     );
//   }
//
// Note it returns the width, not { width, height }. Returning an object would
// be a new reference every call → the infinite loop from
// 14_usesyncexternalstore.js §6. If you need both, use two hooks or cache the
// object. That constraint is a feature: it pushes you toward primitives.
//
// And useMediaQuery, which is what you usually actually wanted:
//
//   function useMediaQuery(query) {
//     const mql = useMemo(() => window.matchMedia(query), [query]);
//     return useSyncExternalStore(
//       (cb) => { mql.addEventListener("change", cb);
//                 return () => mql.removeEventListener("change", cb); },
//       () => mql.matches,             // ← a BOOLEAN. Stable ✅
//       () => false
//     );
//   }


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The app janks while resizing:
//   60+ renders/sec of the whole subtree. → §4.
//
// Bug 2 — Layout thrashing:
//   Reading innerWidth in the handler forces synchronous reflow. → §4.
//
// Bug 3 — "window is not defined" during SSR:
//   No guard. Same as useLocalStorage.
//
// Bug 4 — The layout snaps after hydration:
//   You guessed 1920 on the server and the user is on a phone. → §7.
//
// Bug 5 — Re-renders even when the size did not change:
//   A new { width, height } object every time defeats React's bailout. → §4.
//
// Bug 6 — Listener leak:
//   No cleanup. → §7.
//
// Bug 7 — useWindowSize for a breakpoint:
//   300 renders to compute a boolean. → §6. Use matchMedia — or CSS.
//
// Bug 8 — useWindowSize to measure a component:
//   Window size is not element size. Sidebars, zoom, and scrollbars all break
//   the assumption. Use ResizeObserver.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) {
    throw new Error("Assertion failed: " + message);
  }
}

// The firehose:
assert(dragRenders === 50, "50 resize events → 50 re-renders");
assert(dragReflows > 0,
  "reading innerWidth after a layout change forces synchronous reflow");

// The object-identity bailout failure:
assert(R2.getRenders() - before === 10,
  "10 no-op resizes still re-rendered — a new object defeats Object.is 🐛");

// matchMedia — the headline:
assert(windowSizeRenders === 300,
  "useWindowSize: 300 re-renders to compute one boolean 🐛");
assert(mediaQueryRenders === 1,
  "useMediaQuery: ONE re-render — the browser only notifies on the FLIP ✅");
assert(windowSizeRenders / mediaQueryRenders === 300,
  "300x the renders for the identical result");

// Throttling:
assert(simulateThrottled(300, 100, 4) < 300, "throttling cuts the renders");
assert(simulateThrottled(300, 16, 4) <= 75,
  "even at one render per frame, 300 events can only ever produce ~75 visible frames");

// The cleanup:
assert(win4.listenerCount() === 0, "unmount removed the listener — no leak");

console.log("§10 — mini assertions passed for: useWindowSize");
console.log("\n  The number that matters: 300 renders vs 1, for the same");
console.log("  boolean. Subscribe to the question you are asking, not to a");
console.log("  stream of numbers you then reduce.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "write useWindowSize", say this while writing:
//
//   "The shape is an effect that adds a resize listener, sets state from
//    innerWidth/innerHeight, and removes it in the cleanup, with a lazy
//    SSR-guarded initializer.
//
//    But I'd raise three things. First, resize fires per pixel during a drag,
//    so this re-renders every consumer and their children sixty-plus times a
//    second. Second, reading innerWidth inside the handler forces a
//    synchronous reflow — layout thrashing on the main thread during a drag.
//    Third, on the server I'd return undefined rather than guessing 1920,
//    because guessing means rendering the desktop layout to a phone and
//    snapping after hydration.
//
//    Then I'd ask what it's for. If the answer is isMobile, this is the wrong
//    hook — matchMedia re-renders once when the breakpoint FLIPS, not three
//    hundred times while you drag across it. Same boolean, 300x fewer renders,
//    because the browser evaluates the query and only notifies on a state
//    change. The rule I'd state: if your output is a boolean, don't subscribe
//    to a number.
//
//    And honestly, if it's a layout decision, use a CSS media query. Zero
//    renders, zero listeners, works before hydration, runs off the main
//    thread. If it's about an element rather than the window, ResizeObserver.
//
//    The modern implementation is useSyncExternalStore — window size is an
//    external store. Note getSnapshot must return the width, not an object,
//    or you get the infinite loop from a new reference every call."
//
// "What is it for?" plus the 300-vs-1 number is the senior answer.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is wrong with the naive useWindowSize?
// A1. It re-renders per pixel of a drag, forces reflow by reading layout in
//     the handler, and crashes during SSR.
//
// Q2. Debounce or throttle for resize?
// A2. Throttle. You want updates DURING the drag; debounce only fires after
//     it stops.
//
// Q3. Why is matchMedia better for breakpoints?
// A3. The browser evaluates the query and notifies only when the match flips.
//     One render instead of three hundred.
//
// Q4. What should SSR return?
// A4. undefined. Guessing means a visible layout snap after hydration. Let the
//     caller render a skeleton.
//
// Q5. Why does it re-render when the size did not change?
// A5. A new { width, height } object each time. Object.is is false, so React's
//     bailout never fires.
//
// Q6. What is layout thrashing here?
// A6. Reading innerWidth after a layout change forces the browser to
//     recalculate synchronously before answering — once per event.
//
// Q7. When would you use ResizeObserver instead?
// A7. When you care about an ELEMENT's size, which is usually what "window
//     size" is a proxy for. It also fires off the main thread.
//
// Q8. Why must getSnapshot return a number?
// A8. An object is a new reference every call → infinite loop.
//
// Q9. When should you not use this hook at all?
// A9. When CSS can do it. A media query costs zero renders and works before
//     hydration.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useWindowSize?
//   Back : A resize subscription piped into React state.
//
// Flashcard 2:
//   Front: What is the runtime rule?
//   Back : resize fires per pixel. Every event is a re-render of the subtree.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : Using it for isMobile — 300 renders to compute a boolean.
//
// Flashcard 4:
//   Front: Debounce or throttle?
//   Back : Throttle. You need updates during the drag.
//
// Flashcard 5:
//   Front: What should SSR return?
//   Back : undefined. Guessing causes a layout snap after hydration.
//
// Flashcard 6:
//   Front: The best answer to "hide this on mobile"?
//   Back : A CSS media query. Zero renders.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Ask what it is FOR, then name matchMedia, ResizeObserver, and CSS.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the hook from memory with all four: lazy init, SSR guard, listener,
//   cleanup.
//
// Task 2:
//   Add throttling. Compare renders at 16ms, 100ms, and 250ms during a drag.
//   Which feels right? Justify it with the frame budget, not a vibe.
//
// Task 3:
//   Write useMediaQuery with useSyncExternalStore. Prove it renders once
//   across a breakpoint drag.
//
// Task 4:
//   Fix the §4 object-identity problem: only setState when the value actually
//   changed. Watch the no-op resizes stop re-rendering.
//
// Task 5:
//   Replace it with ResizeObserver on a container. Notice you no longer care
//   about the window at all — which is the real lesson.
//
// Task 6:
//   Explain in 60 seconds why a CSS media query beats useWindowSize for
//   hiding a sidebar, to someone who just wrote the hook.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   resize is a firehose. Every pixel of a drag re-renders your subtree.
//
// If you remember the common bug:
//   useWindowSize for isMobile — 300 renders to compute a boolean matchMedia
//   gives you in one.
//
// If you remember the professional framing:
//   Ask what it is for. CSS for layout, matchMedia for booleans,
//   ResizeObserver for elements. The window size in JS state is the last resort.
//
// NEXT TOPIC -> 06_useonclickoutside-hook.js
