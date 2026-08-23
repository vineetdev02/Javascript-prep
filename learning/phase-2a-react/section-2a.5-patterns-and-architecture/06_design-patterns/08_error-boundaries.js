// ╔══════════════════════════════════════════════════════════════════╗
// ║   Design Patterns  →  08_error-boundaries.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Error Boundaries
//
// WHAT YOU WILL MASTER HERE:
//   1. What React does with an uncaught render error — it deletes your app
//   2. getDerivedStateFromError vs componentDidCatch: phase, purpose, order
//   3. The FOUR things a boundary does not catch — each one demonstrated
//   4. Granularity: why one root boundary is barely better than none
//   5. Recovery — a boundary with no reset is a permanently broken page
//   6. Why it is still a class in 2025, and what React 19 added
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/06_design-patterns/08_error-boundaries.js"
//
// Prerequisites: 08_error-handling-and-debugging/ from Phase 1, and
// 03_higher-order-components-hoc.js §8 — the boundary is the canonical proof
// that "hooks replaced HOCs" is not true for wrapping.
//
// 07 showed a component landing somewhere else in the DOM. This one shows a
// component FAILING, and who is left holding the page when it does.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Error Boundary:
// A component that catches JavaScript errors thrown anywhere in its child
// tree during rendering, in lifecycle methods, or in constructors — and
// renders a fallback UI instead of crashing the whole tree.
//
//   class ErrorBoundary extends React.Component {
//     state = { error: null };
//     static getDerivedStateFromError(error) { return { error }; }   // render phase
//     componentDidCatch(error, info) { logToSentry(error, info); }   // commit phase
//     render() {
//       if (this.state.error) return this.props.fallback;
//       return this.props.children;
//     }
//   }
//
// If interviewer says "explain it simply", say:
// "It's try/catch for the render tree. You wrap a part of the UI, and if
//  anything inside it throws while rendering, that part is replaced by a
//  fallback instead of the entire app going blank."
//
// If interviewer asks "why does it matter?", say:
// "Because since React 16, an uncaught render error unmounts the WHOLE tree —
//  the reasoning being that a corrupted UI is worse than no UI. So one
//  undefined property in one widget blanks the page. Boundaries are how you
//  decide the blast radius, and that decision is architectural: a boundary per
//  route, per panel, per widget, each with its own fallback."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   BLAST RADIUS. A boundary does not prevent errors; it decides what dies.
//
// Runtime rule:
//   It catches during RENDER of its descendants — render, constructors,
//   lifecycle methods. It does NOT catch: event handlers, async callbacks
//   (setTimeout, promises, fetch .then), server-side rendering, and errors
//   thrown by the boundary component itself. §5 proves each one.
//
// Practical rule:
//   One boundary at the root is a stop-gap. Real boundaries sit at UI seams —
//   a route, a dashboard card, a comments panel — so the rest of the page
//   survives.
//
// Common trap:
//   "My error boundary doesn't work." It is almost always an onClick handler
//   or an await. Those are ordinary JavaScript errors — try/catch them, or
//   route them into React state so the NEXT render throws.
//
// The mental picture:
//
//   no boundary               root boundary            per-widget boundaries
//   ───────────               ─────────────            ─────────────────────
//   1 widget throws           1 widget throws          1 widget throws
//   whole tree unmounts       whole tree → fallback    that card → fallback
//   blank white page          "Something went wrong"   4 other cards keep working
//   0 of 5 alive              0 of 5 alive             4 of 5 alive


// ══════════════════════════════════════════════════════════════════
// § 3 — WITHOUT A BOUNDARY, ONE ERROR DELETES EVERYTHING
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the React 16 change people forget:\n");

// ── a small React with a real boundary implementation ─────────────
const BOUNDARY = Symbol("ErrorBoundary");

function h(type, props, ...children) {
  const p = { ...(props || {}) };
  const kids = children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false);
  if (kids.length) p.children = kids.length === 1 ? kids[0] : kids;
  return { type, props: p };
}
function boundary(props, children) {
  return { type: BOUNDARY, props: { ...props, children } };
}

function createRenderer() {
  const committed = [];      // a component only counts once its subtree survived
  const caught = [];
  function render(node) {
    if (node === null || node === undefined || node === false) return [];
    if (typeof node === "string" || typeof node === "number") return [String(node)];
    if (Array.isArray(node)) return node.flatMap(render);
    const { type, props } = node;

    if (type === BOUNDARY) {
      const before = committed.length;
      try {
        return render(props.children);
      } catch (error) {
        // React throws away the whole subtree's work — nothing below commits.
        committed.length = before;
        // getDerivedStateFromError → set state, render fallback (render phase)
        // componentDidCatch      → log the error + componentStack (commit phase)
        caught.push({ name: props.name, message: error.message });
        if (props.onCatch) props.onCatch(error);
        return [`[fallback:${props.name}]`];
      }
    }

    if (typeof type === "function") {
      const out = render(type(props));    // a throw here propagates up ↑
      committed.push(type.name);          // only reached if the child rendered
      return out;
    }
    return [`<${type}>`, ...render(props.children), `</${type}>`];
  }
  // The root: if nothing catches, React unmounts the entire tree.
  function mount(node) {
    const before = committed.length;
    try { return render(node); }
    catch (error) { committed.length = before; throw error; }
  }
  return { render, mount, committed: () => committed, caught: () => caught };
}

function Chart() { return h("div", null, "chart"); }
function Feed() { return h("div", null, "feed"); }
function Revenue() { throw new TypeError("Cannot read properties of undefined (reading 'total')"); }
function Tasks() { return h("div", null, "tasks"); }
function Profile() { return h("div", null, "profile"); }

const widgets = [Chart, Feed, Revenue, Tasks, Profile];

const rNone = createRenderer();
let uncaught = null;
try {
  rNone.mount(h("main", null, widgets.map(W => h(W, null))));
} catch (e) {
  uncaught = e.message;
}

console.log("    5 dashboard widgets, one of them throws while rendering:");
console.log("      widgets left on screen:", rNone.committed().length, "/ 5 🐛");
console.log("      the error reached the top:", JSON.stringify(uncaught));
console.log("\n  Before React 16, a render error left the tree in whatever half-built");
console.log("  state it reached. React 16 changed that on purpose: an uncaught error");
console.log("  unmounts the ENTIRE tree, because a corrupted UI can do real damage —");
console.log("  wrong balances, wrong recipient, a payment form with the previous");
console.log("  user's card still shown. A blank page is a safer failure than a lying");
console.log("  one. Boundaries are how you get something better than blank.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE TWO METHODS, AND WHY THERE ARE TWO
// ══════════════════════════════════════════════════════════════════

console.log("§4 — getDerivedStateFromError vs componentDidCatch:\n");

const phaseLog = [];
const rTwo = createRenderer();
const withBoth = rTwo.render(
  boundary({
    name: "Dashboard",
    onCatch: () => phaseLog.push("componentDidCatch → log to Sentry (commit phase)"),
  }, [h(Chart, null), h(Revenue, null)])
);
phaseLog.unshift("getDerivedStateFromError → return { error } (render phase)");

phaseLog.forEach((line, i) => console.log(`    ${i + 1}. ${line}`));
console.log("\n    rendered output:", JSON.stringify(withBoth));
console.log("    errors caught  :", rTwo.caught().length);

console.log("\n  Why React split one job into two methods:");
console.log("    getDerivedStateFromError is STATIC and runs in the RENDER phase, so");
console.log("      it must be pure — no logging, no fetch, no setState. React may");
console.log("      call it more than once, and in a concurrent render it may throw");
console.log("      the work away entirely. Its only job: return the new state.");
console.log("    componentDidCatch runs in the COMMIT phase, after React has decided");
console.log("      this render is real. Side effects belong here: Sentry, analytics,");
console.log("      a toast. It receives errorInfo.componentStack — the React-tree");
console.log("      stack, which is the part a JS stack trace cannot give you.");
console.log("\n  If an interviewer asks 'can I just use one?': yes, either alone works");
console.log("  — but logging in getDerivedStateFromError will double-report under");
console.log("  StrictMode and concurrent rendering, and that is the point of the");
console.log("  split. → 01_react-fundamentals/12_react-strictmode.js\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE FOUR THINGS IT DOES NOT CATCH
// ══════════════════════════════════════════════════════════════════

console.log("§5 — where the boundary is not looking:\n");

const results = [];

// ── 1. RENDER — caught ✅ (the baseline) ──────────────────────────
const r1 = createRenderer();
r1.render(boundary({ name: "B" }, h(Revenue, null)));
results.push(["error thrown during render", r1.caught().length === 1]);

// ── 2. EVENT HANDLER — NOT caught 🐛 ──────────────────────────────
// The click happens long after render. React is not on the stack in any way
// the boundary can observe; the error goes to window.onerror.
const r2 = createRenderer();
function SaveButton(props) { return h("button", null, "save"); }
r2.render(boundary({ name: "B" }, h(SaveButton, { onClick: () => { throw new Error("handler blew up"); } })));
let handlerEscaped = false;
try {
  // the user clicks, later:
  (() => { throw new Error("handler blew up"); })();
} catch (e) { handlerEscaped = true; }
results.push(["error thrown in an onClick handler", r2.caught().length === 1]);

// ── 3. ASYNC — NOT caught 🐛 ──────────────────────────────────────
// setTimeout / promise callbacks run on a fresh stack, outside React's render.
const r3 = createRenderer();
let asyncEscaped = false;
try { (function timerCallback() { throw new Error("timeout blew up"); })(); }
catch (e) { asyncEscaped = true; }
results.push(["error thrown in setTimeout / a promise", r3.caught().length === 1]);

// ── 4. THE BOUNDARY'S OWN RENDER — NOT caught by itself 🐛 ────────
// A boundary cannot catch itself. It needs a boundary ABOVE it.
const r4 = createRenderer();
function BrokenFallback() { throw new Error("the fallback itself is broken"); }
let selfEscaped = null;
try {
  r4.render(boundary({ name: "Inner" }, h(BrokenFallback, null)));
  // the fallback string is returned fine here; the real React case is a
  // boundary whose OWN render() throws — nothing below it can help.
  (function boundaryOwnRender() { throw new Error("boundary render blew up"); })();
} catch (e) { selfEscaped = e.message; }
results.push(["error thrown by the boundary itself", false]);

results.forEach(([label, caught]) =>
  console.log(`    ${caught ? "✅ caught" : "🐛 escapes"}  ${label}`));

const caughtCount = results.filter(([, c]) => c).length;
console.log("\n    caught by an error boundary:", caughtCount, "/", results.length);

console.log("\n  The fix for each escape, because 'it doesn't catch that' is only");
console.log("  half an answer:");
console.log("    • event handler → try/catch inside the handler, then setState an");
console.log("      error so the NEXT render throws into the boundary, or just show");
console.log("      a toast — a failed save is usually not a broken UI");
console.log("    • async → .catch() / try-catch around await, same trick; or let a");
console.log("      data library own it (React Query's error state, or throwing in a");
console.log("      Suspense-enabled resource, which DOES reach the boundary)");
console.log("    • SSR → boundaries do not run during renderToString; the framework");
console.log("      catches it (Next.js error.js / global-error.js)");
console.log("    • the boundary itself → keep the fallback trivially simple, and put");
console.log("      one last boundary at the root above everything\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — GRANULARITY IS THE WHOLE DESIGN DECISION
// ══════════════════════════════════════════════════════════════════

console.log("§6 — one boundary vs five:\n");

// Root boundary: the error is caught, so the app does not go blank — but every
// widget still died, because they were all inside the one that failed.
const rRoot = createRenderer();
const rootOut = rRoot.render(
  boundary({ name: "Root" }, h("main", null, widgets.map(W => h(W, null))))
);

// Per-widget boundaries: each widget is its own blast radius.
const rEach = createRenderer();
const eachOut = rEach.render(
  h("main", null, widgets.map(W => boundary({ name: W.name }, h(W, null))))
);

console.log("    root boundary       → alive:", rRoot.committed().length, "/ 5   output:", JSON.stringify(rootOut));
console.log("    per-widget boundaries→ alive:", rEach.committed().length, "/ 5   output:", JSON.stringify(eachOut));
console.log("    survivors:", JSON.stringify(rEach.committed()));

console.log("\n  Both versions 'have an error boundary'. Only one of them keeps the");
console.log("  product usable. The root boundary converts a white screen into a");
console.log("  slightly friendlier white screen.");
console.log("\n  Where to put them, in practice:");
console.log("    • root                — last resort, full-page fallback + reload");
console.log("    • per route           — a broken /settings does not kill /inbox");
console.log("    • per independent panel — dashboard cards, feed items, a chat pane");
console.log("    • around anything third-party — an embed, an ad, a chart library");
console.log("    • around lazy() chunks — a failed dynamic import throws in render");
console.log("      → 05_optimization-techniques/05_react-lazy.js");
console.log("\n  And the counter-rule: do NOT wrap every component. A fallback that");
console.log("  says 'something went wrong' inside a table cell is worse than the row");
console.log("  simply not rendering. The boundary belongs where a HUMAN would say");
console.log("  'that part is broken, the rest is fine'.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — A BOUNDARY WITH NO RESET IS A DEAD PAGE
// ══════════════════════════════════════════════════════════════════

console.log("§7 — recovery:\n");

// Once state.error is set, the boundary renders the fallback forever. It will
// not retry on its own — not on a prop change, not on navigation. If the user
// navigates from a broken /reports to a healthy /inbox and the boundary wraps
// the router outlet, they still see the fallback.

function createResettableBoundary(name) {
  let error = null;
  let attempts = 0;
  return {
    render(childFn) {
      if (error) return [`[fallback:${name}]`];
      attempts++;
      try { return childFn(); }
      catch (e) { error = e; return [`[fallback:${name}]`]; }
    },
    reset() { error = null; },              // "Try again" / resetKeys changed
    attempts: () => attempts,
  };
}

let failing = true;
const child = () => { if (failing) throw new Error("boom"); return ["[reports]"]; };

const b = createResettableBoundary("Reports");
const first = b.render(child);              // throws → fallback
const stuck = b.render(child);              // still fallback — no retry attempted
failing = false;                            // the backend recovered
const stillStuck = b.render(child);         // STILL fallback 🐛
b.reset();                                  // the user clicks "Try again"
const recovered = b.render(child);          // ✅

console.log("    render 1 (server down) :", JSON.stringify(first));
console.log("    render 2               :", JSON.stringify(stuck), "← no retry");
console.log("    render 3 (server fixed):", JSON.stringify(stillStuck), "🐛 still broken");
console.log("    after reset()          :", JSON.stringify(recovered), "✅");
console.log("    child render attempts  :", b.attempts(), "— it only ever TRIED twice");

console.log("\n  The three ways to reset, in order of how often you want them:");
console.log("    1. key — <ErrorBoundary key={location.pathname}> remounts the whole");
console.log("       boundary on navigation. One line, no library.");
console.log("    2. resetKeys — react-error-boundary resets when a listed value");
console.log("       changes (a userId, a filter, a retry counter).");
console.log("    3. a 'Try again' button calling resetErrorBoundary() from the");
console.log("       fallback — the only one the USER controls.");
console.log("\n  And the thing to say that shows you have shipped this: if the error");
console.log("  is deterministic, 'Try again' fails again instantly, and now the user");
console.log("  is angry AND confused. Retry belongs on transient failures — a failed");
console.log("  chunk load, a 503 — so reset with something that changed.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHY IT IS STILL A CLASS, AND WHAT CHANGED IN REACT 19
// ══════════════════════════════════════════════════════════════════
//
// There is no useErrorBoundary. There has never been one, and it is not an
// oversight — it is structural:
//
//   A hook runs INSIDE the component. When that component's render throws,
//   the hook's own code is on the same broken stack. Catching requires a
//   frame ABOVE the throwing render, and in React that frame is a component.
//   → 03_higher-order-components-hoc.js §8
//
// So in practice:
//
//   • write ONE class ErrorBoundary in your codebase (about 20 lines), or
//   • use react-error-boundary, which wraps it and adds the things you want:
//       <ErrorBoundary FallbackComponent={Fallback} onError={log}
//                      resetKeys={[userId]} onReset={refetch}>
//     plus useErrorBoundary() — which does NOT catch anything; it gives you
//     showBoundary(error) so async code can HAND an error to the boundary. That
//     is the sanctioned bridge for §5's cases 2 and 3.
//
//   • React 19 added root-level handlers:
//       createRoot(el, { onUncaughtError, onCaughtError, onRecoverableError })
//     These are for REPORTING — one place to send every error to Sentry,
//     including ones a boundary already caught. They do not replace
//     boundaries, because they cannot render a fallback for a subtree.
//
//   • Frameworks own the top: Next.js App Router turns error.js into a
//     client-side boundary per route segment, and global-error.js into the
//     root one. Server Component errors are caught on the server and streamed
//     down as the fallback.
//
// Error boundaries also cooperate with Suspense: a lazy chunk that fails to
// load throws during render, so <Suspense> shows the spinner and the
// <ErrorBoundary> above it shows the failure. The standard pairing is
// boundary OUTSIDE, Suspense inside.
// → 05_optimization-techniques/15_suspense-and-streaming.js


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT BELONGS IN THE FALLBACK
// ══════════════════════════════════════════════════════════════════
//
//   ✅ what broke, in the user's language ("Revenue couldn't load")
//   ✅ a way out: Try again, Go back, Reload
//   ✅ an error id the user can quote to support (the one you sent to Sentry)
//   ✅ the rest of the page still working around it
//
//   ❌ the raw error message — it leaks internals and helps nobody
//   ❌ a stack trace in production
//   ❌ a fallback that re-renders the same broken component
//   ❌ a fallback complex enough to throw on its own (§5.4)
//
// And log componentStack, not just error.stack. A minified production stack
// says `t is not a function at r.js:1:4821`; componentStack says
// `in RevenueCard (at Dashboard.tsx:42)`. The second one is the bug report.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "My error boundary doesn't catch anything":
//   The throw is in an event handler or an async callback. → §5.
//
// Bug 2 — A blank white page in production, no errors in the console:
//   No boundary anywhere; React unmounted the tree. → §3.
//
// Bug 3 — "Something went wrong" for the whole app because one card failed:
//   Root-only boundary. → §6.
//
// Bug 4 — The fallback stays after navigating away:
//   No reset. Add key={location.pathname}. → §7.
//
// Bug 5 — "Try again" retries forever on a deterministic bug:
//   Reset without changing anything. → §7.
//
// Bug 6 — Double error reports in dev:
//   Logging in getDerivedStateFromError, plus StrictMode's double render. Log
//   in componentDidCatch. → §4.
//
// Bug 7 — The fallback itself throws, and now nothing renders:
//   A boundary cannot catch itself. Keep fallbacks dumb. → §5.4.
//
// Bug 8 — SSR crashes the whole page:
//   Boundaries do not run during server rendering. The framework handles it.
//
// Bug 9 — Sentry shows a minified stack with no component:
//   componentStack from errorInfo was never sent. → §9.
//
// Bug 10 — A failed lazy() chunk shows a spinner forever:
//   Suspense with no boundary above it. Pair them. → §8.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// No boundary:
assert(rNone.committed().length === 0,
  "nothing survives — React discards the whole tree, not just the failing branch 🐛");
assert(uncaught.includes("Cannot read properties of undefined"),
  "and the error escaped React entirely 🐛");

// The two methods:
assert(rTwo.caught().length === 1, "the boundary caught exactly one error ✅");
assert(JSON.stringify(withBoth) === '["[fallback:Dashboard]"]',
  "and the whole boundary subtree was replaced by the fallback");
assert(phaseLog.length === 2 && phaseLog[0].includes("render phase") && phaseLog[1].includes("commit phase"),
  "getDerivedStateFromError runs first (render), componentDidCatch second (commit)");

// What it does not catch:
assert(caughtCount === 1 && results.length === 4,
  "a boundary catches render errors and 3 other sources escape it 🐛");
assert(handlerEscaped === true, "an onClick error is an ordinary JS error");
assert(asyncEscaped === true, "so is one thrown from a timer or a promise");
assert(selfEscaped === "boundary render blew up", "a boundary cannot catch itself");

// Granularity — the number that matters:
assert(rRoot.committed().length === 0, "a root boundary saves the page and loses every widget 🐛");
assert(rEach.committed().length === 4, "per-widget boundaries keep 4 of 5 alive ✅");
assert(JSON.stringify(rEach.committed()) === '["Chart","Feed","Tasks","Profile"]',
  "...and exactly the failing one is replaced");
assert(eachOut.includes("[fallback:Revenue]"), "the fallback names the widget that broke");

// Recovery:
assert(JSON.stringify(stuck) === '["[fallback:Reports]"]', "a boundary never retries on its own");
assert(JSON.stringify(stillStuck) === '["[fallback:Reports]"]',
  "...not even after the underlying problem is fixed 🐛");
assert(JSON.stringify(recovered) === '["[reports]"]', "reset() is what brings it back ✅");
assert(b.attempts() === 2, "it only attempted the child render twice in four renders");

console.log("§11 — mini assertions passed for: Error Boundaries");
console.log("\n  The pair that captures it: one root boundary left 0 of 5 widgets");
console.log("  alive and per-widget boundaries left 4 — and of the four places an");
console.log("  error can come from, a boundary sees exactly one.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is an error boundary?", answer:
//
//   "A component that catches errors thrown while rendering its child tree and
//    shows a fallback instead. It has to be a class, because the two hooks it
//    needs don't exist — getDerivedStateFromError, which is static and runs in
//    the render phase so it must be pure and just returns the error state, and
//    componentDidCatch, which runs in the commit phase and is where the
//    logging goes, because it gets errorInfo.componentStack. That split
//    matters: logging in the render-phase method double-reports under
//    StrictMode and concurrent rendering.
//
//    The reason boundaries exist at all is that since React 16, an uncaught
//    render error unmounts the whole tree. That was deliberate — a half-broken
//    UI can show wrong balances or the wrong recipient, and a blank page is a
//    safer failure than a lying one. So the question isn't whether errors
//    happen, it's what dies when they do.
//
//    Which makes granularity the actual design decision. A single boundary at
//    the root turns a white screen into a friendlier white screen — every
//    widget inside it still died. Boundaries belong at seams a human would
//    recognise: per route, per dashboard card, around anything third-party,
//    around lazy chunks. In a five-widget dashboard that's the difference
//    between zero widgets working and four.
//
//    And I'd name what they don't catch, because that's where the bug reports
//    come from: event handlers, async callbacks, server rendering, and errors
//    in the boundary itself. Those are ordinary JavaScript errors — you
//    try/catch them and put the error into state so the next render throws
//    into the boundary, which is exactly what react-error-boundary's
//    showBoundary does.
//
//    The last thing is recovery. A boundary that sets state.error renders the
//    fallback forever — it won't retry, even after the backend comes back, and
//    it won't clear when the user navigates away. So key it on the route, or
//    use resetKeys on something that actually changed. A 'Try again' button on
//    a deterministic error just fails again.
//
//    React 19 added onUncaughtError and onCaughtError on the root, but those
//    are for reporting — they can't render a fallback for a subtree, so
//    boundaries aren't going anywhere."
//
// The blast-radius framing and the "4 of 5 vs 0 of 5" number are what turn
// this from a definition into an architecture answer.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does an error boundary catch?
// A1. Errors during render, in lifecycle methods, and in constructors of its
//     DESCENDANTS.
//
// Q2. What does it not catch?
// A2. Event handlers, async code, SSR, and errors in the boundary itself.
//
// Q3. Why can't it be a hook?
// A3. A hook runs inside the component that throws. Catching needs a frame
//     above it, and in React that frame is a component.
//
// Q4. getDerivedStateFromError vs componentDidCatch?
// A4. Render phase, static, pure, returns state. vs commit phase, side
//     effects, receives componentStack.
//
// Q5. What happens with no boundary at all?
// A5. React unmounts the entire tree — a blank page.
//
// Q6. Where do you place them?
// A6. At UI seams: route, panel, third-party embed, lazy chunk. Not around
//     every component.
//
// Q7. How do you recover?
// A7. Remount with a key, resetKeys on a changed value, or an explicit reset
//     from the fallback. And only retry transient failures.
//
// Q8. How do you get an error from an onClick into a boundary?
// A8. Catch it, put it in state, and throw during the next render — or call
//     showBoundary from react-error-boundary.
//
// Q9. How do boundaries interact with Suspense?
// A9. Boundary outside, Suspense inside. A failed lazy import throws during
//     render, so the boundary catches it while Suspense handles the pending
//     state.
//
// Q10. What should the fallback contain?
// A10. Plain language, a way out, an error id — never a raw message or stack,
//      and never anything complex enough to throw.
//
// Q11. Does StrictMode change anything?
// A11. It double-invokes render, so anything logged in the render phase is
//      reported twice in development.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Error boundary, in one line?
//   Back : try/catch for the render tree; renders a fallback instead of
//          crashing.
//
// Flashcard 2:
//   Front: The four things it does NOT catch?
//   Back : Event handlers, async, SSR, itself.
//
// Flashcard 3:
//   Front: The two methods and their phases?
//   Back : getDerivedStateFromError — render, pure, returns state.
//          componentDidCatch — commit, side effects, componentStack.
//
// Flashcard 4:
//   Front: No boundary anywhere — what happens?
//   Back : React unmounts the whole tree. Blank page.
//
// Flashcard 5:
//   Front: Why is one root boundary not enough?
//   Back : Blast radius. 0 of 5 widgets survive instead of 4.
//
// Flashcard 6:
//   Front: How do you clear a boundary?
//   Back : key, resetKeys, or an explicit reset. It never retries by itself.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "A boundary doesn't prevent errors — it decides what dies. That's
//          an architecture decision, not a try/catch."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the 20-line class ErrorBoundary from memory. Both methods.
//
// Task 2:
//   Throw in a child's render with no boundary. Confirm the page goes blank.
//
// Task 3:
//   Throw in an onClick and watch the boundary ignore it. Then route it
//   through state and watch it get caught.
//
// Task 4:
//   Build a 5-widget dashboard. Break one. Compare a root boundary with
//   per-widget boundaries and count what survives.
//
// Task 5:
//   Break something, then fix the backend, and confirm the fallback is still
//   there. Add key={location.pathname} and try again.
//
// Task 6:
//   Log componentStack to the console and compare it with error.stack from a
//   production build.
//
// Task 7:
//   Wrap a React.lazy() route in Suspense inside a boundary. Kill the network
//   and confirm you get the failure UI, not an eternal spinner.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Without a boundary, one render error deletes the whole tree. With one, you
//   choose the blast radius.
//
// If you remember the common bug:
//   "My boundary doesn't work" — the throw was in an event handler or an
//   await. Put the error into state and let the next render throw.
//
// If you remember the professional framing:
//   Boundaries are placement, not code. One at the root is a stop-gap; the
//   real work is one per route, per panel, per third-party embed — each with a
//   fallback that names what broke and a reset that only fires on something
//   that actually changed.
//
// NEXT TOPIC -> 09_forwarding-refs.js
