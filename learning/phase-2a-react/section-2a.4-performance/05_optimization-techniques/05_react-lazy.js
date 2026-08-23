// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  05_react-lazy.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: React.lazy()
//
// WHAT YOU WILL MASTER HERE:
//   1. The exact contract: a function returning Promise<{ default: Component }>
//   2. lazy() BUILT FROM SCRATCH — the throw-a-promise mechanism, ~25 lines
//   3. Named exports: why they fail and the one-line fix
//   4. Why lazy() must live at module scope, and what happens when it does not
//   5. Preload, retry, and combining lazy with memo / refs
//   6. SSR: what lazy cannot do, and what replaces it
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/05_react-lazy.js"
//
// Prerequisites: 04_code-splitting-lazy-suspense.js — that file is the STRATEGY
// (where and why to split). This one is the API, in detail. 06 is the import()
// primitive that feeds it.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// React.lazy:
// A function that takes a loader returning a promise of a module, and gives back
// a component you can render normally — it suspends on first render until the
// module arrives.
//
// If interviewer says "explain it simply", say:
// "lazy turns 'a module that isn't here yet' into 'a component you can put in
//  JSX'. You render <Dashboard /> exactly as before; React handles the fact
//  that its code arrives later."
//
// If interviewer asks "why does it matter?", say:
// "Because it's the adapter between two worlds. import() gives you a promise,
//  and React's render is synchronous — it can't await anything. lazy bridges
//  that by throwing the promise, which React catches at the nearest Suspense
//  boundary, and retrying the subtree when it resolves. Understanding that
//  throw-and-retry is what makes Suspense stop being magic, because the same
//  mechanism powers data fetching, `use()`, and streaming SSR."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   lazy = a component that THROWS a promise, once
//
// The exact signature:
//
//   const C = React.lazy(() => import("./C"));
//
//   lazy(loader)
//     loader: () => Promise<{ default: React.ComponentType }>
//                              ^^^^^^^ mandatory. This is the whole contract.
//
// Runtime rule:
//   The loader runs ONCE — on the first render that reaches the component. The
//   result is cached on the lazy object forever. Every later render reuses it,
//   so a lazy component only suspends once per page load.
//
// Practical rule:
//   Declare lazy components at MODULE level. Never inside a component body,
//   never inside a hook, never inside a render.
//
// Common trap:
//   `lazy(() => import("./utils"))` where utils has no default export → the app
//   renders `undefined` and throws "Element type is invalid". The contract is
//   the DEFAULT export, and nothing warns you about it.


// ══════════════════════════════════════════════════════════════════
// § 3 — lazy(), BUILT FROM SCRATCH
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the whole mechanism, ~25 lines:\n");

// This is genuinely how it works. React's version has more bookkeeping, but the
// state machine is exactly this.

const Uninitialized = 0, Pending = 1, Resolved = 2, Rejected = 3;

// A pending "module" we can deliver on demand. A real import() resolves in a
// microtask; this lets the file run top-to-bottom so you can watch every state
// transition in order. Nothing else about the mechanism differs.
function deferred(value) {
  const waiting = [];
  const thenable = {
    then(onFulfilled) { waiting.push(() => onFulfilled(value)); return thenable; },
  };
  return { thenable, deliver: () => waiting.splice(0).forEach(run => run()) };
}
function mapThenable(t, fn) {                 // stands in for .then(m => ...)
  return { then(onFulfilled) { return t.then(m => onFulfilled(fn(m))); } };
}

function lazy(loader) {
  const payload = { status: Uninitialized, result: loader, loads: 0 };

  return {
    $$typeof: "react.lazy",
    _payload: payload,
    _init: function init() {
      if (payload.status === Uninitialized) {
        payload.loads++;                        // ← proof it runs ONCE
        const promise = payload.result();
        payload.status = Pending;
        payload.result = promise;
        promise.then(
          module => { payload.status = Resolved; payload.result = module.default; },
          error  => { payload.status = Rejected; payload.result = error; }
        );
      }
      if (payload.status === Resolved) return payload.result;   // the component
      throw payload.result;    // ← a PROMISE if pending, an ERROR if rejected.
                               //   Suspense catches the first. An Error
                               //   Boundary catches the second. That single
                               //   line is why you need both. → 04 §8
    },
  };
}

// A 12-line React that understands suspension:
function renderWithSuspense(lazyComponent, { fallback }) {
  try {
    const Component = lazyComponent._init();
    return { rendered: Component.name, suspended: false };
  } catch (thrown) {
    if (thrown && typeof thrown.then === "function") {
      return { rendered: fallback, suspended: true };   // ← <Suspense fallback>
    }
    throw thrown;                                        // ← to the Error Boundary
  }
}

function Dashboard() { return "the real dashboard"; }
const chunk = deferred({ default: Dashboard });
const fakeImport = () => chunk.thenable;        // stands in for import("./Dashboard")

const LazyDashboard = lazy(fakeImport);

const first = renderWithSuspense(LazyDashboard, { fallback: "<Skeleton/>" });
console.log("    render 1 (chunk not here):", JSON.stringify(first));

// The chunk arrives over the network. React retries the subtree:
chunk.deliver();

const second = renderWithSuspense(LazyDashboard, { fallback: "<Skeleton/>" });
const third = renderWithSuspense(LazyDashboard, { fallback: "<Skeleton/>" });
console.log("    render 2 (resolved)      :", JSON.stringify(second));
console.log("    render 3 (from cache)    :", JSON.stringify(third));
console.log("    loader invocations       :", LazyDashboard._payload.loads,
  "✅ once, ever — the result is cached on the lazy object");

console.log("\n  Read the throw line again. `throw promise` is the entire Suspense");
console.log("  protocol. React catches it, walks up to the nearest boundary, renders");
console.log("  the fallback, attaches a .then that re-renders the subtree, and on the");
console.log("  retry _init returns the component instead of throwing. No async/await");
console.log("  in render, ever — because render must stay synchronous and restartable.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE `default` CONTRACT, AND NAMED EXPORTS
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the named-export trap:\n");

// ❌ export function Chart() {}          ← named export, no default
//    const Chart = lazy(() => import("./Chart"));
//    → module.default is undefined
//    → "Element type is invalid: expected a string or a class/function but got:
//       undefined."

function Chart() { return "chart"; }
const namedChunk = deferred({ Chart });                           // no `default`

const Broken = lazy(() => namedChunk.thenable);
try { Broken._init(); } catch { /* it suspends — that part works fine */ }
namedChunk.deliver();
const resolvedBroken = Broken._payload.result;
console.log("    lazy(() => import('./Chart')) with only a named export:");
console.log("      module.default →", String(resolvedBroken), "🐛 React renders undefined");

// ✅ FIX 1 — remap in the loader. One line, no source changes:
const fixedChunk = deferred({ Chart });
const Fixed = lazy(() => mapThenable(fixedChunk.thenable, m => ({ default: m.Chart })));
try { Fixed._init(); } catch { /* suspends, then resolves correctly */ }
fixedChunk.deliver();
console.log("      .then(m => ({ default: m.Chart })) →",
  Fixed._payload.result.name, "✅");

// ✅ FIX 2 — add a default export to the module. Cleaner if you own the file.
// ✅ FIX 3 — a barrel of lazies, when a module exports several components:
//      const load = () => import("./widgets");
//      export const Chart = lazy(() => load().then(m => ({ default: m.Chart })));
//      export const Table = lazy(() => load().then(m => ({ default: m.Table })));
//    One chunk, one request (import() caches by specifier → 06), two components.

console.log("\n  Why the contract exists at all: lazy must know WHICH export is the");
console.log("  component, and a module can export many things. Picking `default` by");
console.log("  convention is the only choice that needs no configuration.");
console.log("\n  ⚠️ And the reason this trap survives code review: `import('./Chart')`");
console.log("     succeeds. The chunk downloads fine. The failure is a rendering");
console.log("     error further down, which reads like an unrelated bug.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — WHY THE LOADER MUST BE STATICALLY ANALYSABLE
// ══════════════════════════════════════════════════════════════════
//
// The bundler reads your source at BUILD time. It never runs it. So it can only
// create a chunk for an import specifier it can literally see:
//
//   ✅ lazy(() => import("./pages/Dashboard"))          — one chunk, emitted
//   ❌ lazy(() => import(pagePath))                     — bundler cannot know
//   ❌ lazy(() => import("./pages/" + name))            — Vite: fails.
//                                                          Webpack: emits a chunk
//                                                          for EVERY file in
//                                                          ./pages — a "context
//                                                          module". Silently ships
//                                                          more, not less.
//   ✅ lazy(() => import(`./pages/${name}.jsx`))        — a bounded template with
//                                                          a static prefix+suffix
//                                                          is supported by both,
//                                                          and still emits every
//                                                          matching file.
//
// The rule: if the specifier is not a literal, you are asking the bundler to
// guess, and its guesses are either "fail" or "include everything". For a real
// dynamic map, write the map out explicitly — that also gives you dead-code
// elimination and type safety:
//
//   const PAGES = {
//     dashboard: () => import("./pages/Dashboard"),
//     admin:     () => import("./pages/Admin"),
//   };
//   const Page = lazy(PAGES[name]);        // ← still module-level. See §6.

console.log("§5 — static analysis, simulated:\n");
const bundlerSees = {
  'import("./pages/Dashboard")': ["Dashboard.chunk.js"],
  'import(pagePath)':            [],
  'import("./pages/" + name)':   ["Dashboard.chunk.js", "Admin.chunk.js", "Reports.chunk.js",
                                  "Settings.chunk.js", "Venues.chunk.js"],
};
for (const [expr, chunks] of Object.entries(bundlerSees)) {
  const note = chunks.length === 0 ? "🐛 no chunk — runtime failure"
    : chunks.length === 1 ? "✅ exactly one chunk"
    : `🐛 ${chunks.length} chunks — the whole folder`;
  console.log(`    ${expr.padEnd(30)} → ${note}`);
}
console.log("");


// ══════════════════════════════════════════════════════════════════
// § 6 — MODULE SCOPE IS NOT A STYLE PREFERENCE
// ══════════════════════════════════════════════════════════════════

console.log("§6 — lazy() inside a component:\n");

// ❌ THE BUG
//   function App() {
//     const Dashboard = lazy(() => import("./Dashboard"));   // ← NEW lazy object
//     return <Suspense fallback={<S/>}><Dashboard /></Suspense>;
//   }
//
// A new lazy object every render means a new component TYPE every render. React
// compares element types by identity, so it unmounts the old subtree and mounts
// a new one: state destroyed, effects re-run, and the payload cache is thrown
// away, so it suspends AGAIN. The fallback flickers forever if anything above
// re-renders. Same family of bug as defining a component inside a component
// (→ 03 §8, 2A.1/03 §5).

function simulate(insideComponent, renders) {
  let loads = 0, remounts = 0, type = null;
  for (let i = 0; i < renders; i++) {
    const L = insideComponent ? lazy(fakeImport) : simulate.MODULE_LEVEL;
    if (insideComponent) loads++;
    if (type && !Object.is(type, L)) remounts++;
    type = L;
  }
  return { loads, remounts };
}
simulate.MODULE_LEVEL = lazy(fakeImport);       // declared ONCE, at module scope

const inside = simulate(true, 5);
const outside = simulate(false, 5);

console.log("    5 renders of the parent:");
console.log("      lazy() inside the component → lazy objects created:", inside.loads,
  " remounts:", inside.remounts, "🐛");
console.log("      lazy() at module level      → lazy objects created: 1  remounts:",
  outside.remounts, "✅");
console.log("\n  Symptoms in a real app: the spinner never goes away, state resets on");
console.log("  every parent render, and the network tab shows the chunk fetched once");
console.log("  but the component mounting endlessly.");
console.log("\n  The same rule covers useMemo'd lazies. `useMemo(() => lazy(...), [])`");
console.log("  is a smell — useMemo is not a guarantee (→ 02 §6), so React may drop");
console.log("  the cache and hand you a fresh type. Module scope is the only place");
console.log("  with a real lifetime guarantee.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — THE THREE UPGRADES YOU ACTUALLY SHIP
// ══════════════════════════════════════════════════════════════════

console.log("§7 — preload, retry, and what wraps what:\n");

// ── 7a. PRELOAD ───────────────────────────────────────────────────
// Attach the loader to the component so callers can warm it. import() caches
// by specifier, so preloading and rendering share ONE request. → 04 §7
//
//   function lazyWithPreload(loader) {
//     const C = React.lazy(loader);
//     C.preload = loader;                 // ← the whole trick
//     return C;
//   }
//   const Dashboard = lazyWithPreload(() => import("./Dashboard"));
//   <Link onMouseEnter={Dashboard.preload} onFocus={Dashboard.preload} />

let networkRequests = 0;
const moduleCache = new Map();
const cachedImport = (key) => {                    // ← what the ES module cache does
  if (!moduleCache.has(key)) {
    networkRequests++;                             // ONE request per specifier
    moduleCache.set(key, deferred({ default: Dashboard }));
  }
  return moduleCache.get(key);
};

const Preloadable = lazy(() => cachedImport("./Dashboard").thenable);
Preloadable.preload = () => cachedImport("./Dashboard");

Preloadable.preload();                              // user hovers the link
Preloadable.preload();                              // ...and jitters the mouse
try { Preloadable._init(); } catch { /* suspends */ }   // user clicks; React renders
cachedImport("./Dashboard").deliver();

console.log("    preload ×2 then render → network requests:", networkRequests,
  "✅ import() is cached by specifier");

// ── 7b. RETRY ─────────────────────────────────────────────────────
// A chunk fetch is a network request. Retry transient failures before the Error
// Boundary ever sees them. → 04 §8
//
//   function lazyRetry(loader, retries = 2, delay = 400) {
//     return React.lazy(() => new Promise((resolve, reject) => {
//       loader()
//         .then(resolve)
//         .catch(err => retries === 0
//           ? reject(err)
//           : setTimeout(() => lazyRetry(loader, retries - 1, delay * 2)
//               ._payload.result().then(resolve, reject), delay));
//     }));
//   }

function retryLoader(attemptsUntilSuccess) {
  let tried = 0;
  return function load(retries = 2) {
    tried++;
    if (tried >= attemptsUntilSuccess) return { loaded: "Dashboard", tried };
    if (retries === 0) return { failed: true, tried };
    return load(retries - 1);
  };
}
console.log("    transient failure, succeeds on attempt 2:",
  JSON.stringify(retryLoader(2)()), "✅");
console.log("    chunk deleted by a deploy               :",
  JSON.stringify(retryLoader(99)()), "🐛 → Error Boundary + reload");

// ── 7c. WHAT WRAPS WHAT ───────────────────────────────────────────
//
//   <ErrorBoundary fallback={<Retry/>}>      ← rejected promise lands here
//     <Suspense fallback={<Skeleton/>}>      ← pending promise lands here
//       <LazyRoute />
//     </Suspense>
//   </ErrorBoundary>
//
// Reversing them is a real bug: an ErrorBoundary INSIDE Suspense still catches
// the render error, but the boundary itself may be inside the subtree React
// replaced with the fallback, so your retry UI never appears.
//
// ── lazy + memo, and refs ─────────────────────────────────────────
//   memo(lazy(...))    ❌ memo receives the lazy wrapper, not your component.
//                         Props still compare, but you have memoized the shell.
//   lazy(() => import("./C"))  where C itself is `export default memo(C)`  ✅
//                         Memoize INSIDE the lazy-loaded module.
//   Refs: React 19 passes ref as a normal prop, so a lazy component forwards it
//         if the inner component accepts `ref`. Pre-19 the inner component needs
//         forwardRef — lazy does not add or remove that.

console.log("\n    memo(lazy(X))  ❌ memoizes the wrapper");
console.log("    lazy(memo(X))  ✅ memo lives inside the loaded module\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — SSR, AND WHAT REPLACES lazy THERE
// ══════════════════════════════════════════════════════════════════
//
// The historical answer, and still the safest thing to say:
//   React.lazy is a CLIENT mechanism. In the old synchronous
//   renderToString(), there is no way to await a chunk mid-render, so lazy
//   components render their fallback on the server and only appear after
//   hydration — a visible flash, and the content is invisible to crawlers that
//   do not execute JS.
//
// What changed in React 18:
//   renderToPipeableStream / renderToReadableStream DO support Suspense on the
//   server. A suspended boundary streams its fallback immediately, and React
//   streams the real HTML in later and swaps it in — no client round trip.
//   That is selective hydration and streaming SSR. → 15
//
// What frameworks do instead, and why:
//   • next/dynamic — same idea, but the framework tracks which chunks a request
//     used, so it can emit the right <script>/preload tags. `ssr: false` is an
//     explicit opt-out for browser-only components (a map, a chart reading
//     window). Nothing in plain React.lazy can do that tracking.
//   • @loadable/component — the pre-18 standard for SSR-safe splitting, for the
//     same reason: it collects the chunks rendered on the server.
//
// The one-line version for an interview:
//   "React.lazy plus streaming SSR works in React 18+. In Next.js I'd use
//    next/dynamic anyway, because the framework needs to know which chunks a
//    request touched in order to preload them — and because it gives me
//    ssr: false for genuinely browser-only components."
//
// ── React 19 and `use()` ──────────────────────────────────────────
//   `use(promise)` generalizes what lazy does: it unwraps a promise during
//   render by suspending, and unlike a hook it can be called conditionally. lazy
//   is now best understood as the component-shaped special case of the same
//   protocol — which is why 04 §5, this file, and 15 are all one mechanism.


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "Element type is invalid ... got: undefined":
//   The module has no default export. → §4.
//
// Bug 2 — Infinite fallback / state resets every render:
//   lazy() called inside a component. New type each render. → §6.
//
// Bug 3 — "A component suspended while responding to synchronous input":
//   No Suspense boundary, or a lazy component mounted by a click without
//   startTransition. → 04 §5.
//
// Bug 4 — Chunk 404 after a deploy:
//   Retry, Error Boundary, reload. → §7b, 04 §8.
//
// Bug 5 — Bundle got BIGGER after adding a dynamic path:
//   `import("./pages/" + name)` made webpack emit every file in the folder. → §5.
//
// Bug 6 — Content invisible to crawlers / flashes on load in SSR:
//   Classic lazy on a synchronous server render. Use streaming or next/dynamic.
//   → §8.
//
// Bug 7 — Tests fail with "not wrapped in act(...)":
//   The lazy resolution happens in a microtask. Await it —
//   `await screen.findByText(...)` — instead of asserting synchronously.
//
// Bug 8 — memo(lazy(C)) doesn't seem to memoize:
//   You memoized the wrapper. Memoize inside the module. → §7c.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The mechanism:
assert(first.suspended === true && first.rendered === "<Skeleton/>",
  "first render throws the promise → Suspense shows the fallback");
assert(second.suspended === false && second.rendered === "Dashboard",
  "after it resolves, the retry renders the real component ✅");
assert(third.suspended === false, "and every later render comes from the cache");
assert(LazyDashboard._payload.loads === 1,
  "the loader runs exactly ONCE — the payload caches the result");

// The default contract:
assert(resolvedBroken === undefined,
  "a module with only named exports gives module.default === undefined 🐛");
assert(Fixed._payload.result.name === "Chart",
  ".then(m => ({ default: m.Chart })) satisfies the contract ✅");

// Module scope:
assert(inside.loads === 5 && inside.remounts === 4,
  "lazy() inside a component → a new type every render → remount 🐛");
assert(outside.remounts === 0, "module-level lazy → one stable type ✅");

// Preload:
assert(networkRequests === 1,
  "preload twice then render = ONE request. import() caches by specifier ✅");

console.log("§10 — mini assertions passed for: React.lazy()");
console.log("\n  The pair that captures it: the loader ran exactly once across three");
console.log("  renders when declared at module scope — and five times, with four");
console.log("  remounts, when written inside a component. Same API, opposite result.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how does React.lazy work?", answer:
//
//   "lazy takes a function that returns a promise of a module whose DEFAULT
//    export is a component, and gives you back something you can render as
//    normal JSX.
//
//    The mechanism is worth knowing precisely, because it's the same one behind
//    all of Suspense. Render is synchronous — it can't await. So on the first
//    render, lazy calls the loader and THROWS the pending promise. React catches
//    it, walks up to the nearest Suspense boundary, renders the fallback, and
//    subscribes to the promise. When it resolves, React retries that subtree,
//    and this time lazy returns the component instead of throwing. If the promise
//    REJECTS, lazy throws the error instead — which is why you need an Error
//    Boundary outside the Suspense boundary, not inside it. And the result is
//    cached on the lazy object, so it only suspends once per page load.
//
//    Two rules I'd call out. First, it has to be the default export — with a
//    named export you get 'Element type is invalid: got undefined', and the
//    import itself succeeded, so it reads like an unrelated bug. The fix is one
//    line: .then(m => ({ default: m.Chart })).
//
//    Second, declare it at module scope. Calling lazy inside a component creates
//    a new lazy object every render, which is a new component type, so React
//    unmounts and remounts — state gone, fallback flickering forever. In my
//    example that was five lazy objects and four remounts across five parent
//    renders.
//
//    In production I'd wrap it twice: attach a .preload that calls the same
//    loader so links can warm it on hover — import() caches by specifier, so
//    that's still one request — and add a retry, because chunk fetches fail,
//    usually because a deploy invalidated the hashed file an open tab is asking
//    for.
//
//    On SSR: classic React.lazy is client-only, so on a synchronous server
//    render you get the fallback in the HTML. React 18's streaming renderers do
//    support Suspense on the server, but in Next.js I'd still use next/dynamic,
//    because the framework needs to track which chunks a request touched to
//    preload them — and it gives me ssr: false for genuinely browser-only
//    components."
//
// The throw/retry description, the Error-Boundary-outside rule, and the
// module-scope bug are the three things that read as experience.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What exactly does lazy's argument have to return?
// A1. A promise resolving to an object with a `default` property that is a
//     component.
//
// Q2. How does it suspend?
// A2. It throws the pending promise. React catches it at the nearest Suspense
//     boundary and retries the subtree when it resolves.
//
// Q3. What if the promise rejects?
// A3. lazy throws the error on the next render. Suspense doesn't catch that —
//     an Error Boundary does, and it must be OUTSIDE the Suspense boundary.
//
// Q4. How often does the loader run?
// A4. Once. The payload is cached on the lazy object.
//
// Q5. Named exports?
// A5. Remap in the loader: .then(m => ({ default: m.Named })).
//
// Q6. Why must lazy be at module scope?
// A6. A new lazy object is a new component type → unmount/remount, lost state,
//     endless fallback.
//
// Q7. Can the import path be a variable?
// A7. Not usefully. The bundler analyses source statically — a variable path
//     either fails or pulls in the whole folder. Use an explicit map.
//
// Q8. How do you preload?
// A8. Attach the loader to the component and call it on hover/focus/idle.
//     import() caches by specifier so it's one request.
//
// Q9. Does lazy work with SSR?
// A9. Not with synchronous renderToString. React 18's streaming renderers
//     support Suspense server-side; frameworks use next/dynamic or loadable so
//     they can track and preload the chunks a request used.
//
// Q10. lazy vs use()?
// A10. Same protocol. use() unwraps any promise during render, including
//      conditionally; lazy is the component-shaped case.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: lazy's contract?
//   Back : () => Promise<{ default: Component }>.
//
// Flashcard 2:
//   Front: How does lazy suspend?
//   Back : It throws the pending promise. Suspense catches it and retries.
//
// Flashcard 3:
//   Front: Rejected promise — who catches it?
//   Back : An Error Boundary, placed OUTSIDE the Suspense boundary.
//
// Flashcard 4:
//   Front: Named export fix?
//   Back : .then(m => ({ default: m.Named })).
//
// Flashcard 5:
//   Front: Why module scope?
//   Back : lazy in a render body = new component type = remount every render.
//
// Flashcard 6:
//   Front: How many requests if you preload then render?
//   Back : One. import() caches by specifier.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Describe throw-then-retry, and put the Error Boundary outside
//          Suspense.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write §3's lazy() from memory in under 25 lines, including the rejected
//   branch. Then explain each line.
//
// Task 2:
//   Break it with a named export. Read the real React error and connect it to
//   `module.default === undefined`.
//
// Task 3:
//   Call lazy() inside a component. Watch the fallback flicker and state reset.
//   Move it out and watch both stop.
//
// Task 4:
//   Add .preload and wire it to onMouseEnter. Confirm in the network tab that
//   hovering then clicking makes ONE request.
//
// Task 5:
//   Wrap a lazy route in an Error Boundary, block the chunk in DevTools, and
//   confirm your retry UI appears. Then move the boundary inside Suspense and
//   watch it stop working.
//
// Task 6:
//   Compare React.lazy and next/dynamic in a Next.js app: view source and see
//   which one has real HTML on the server.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   lazy throws the pending promise; Suspense catches it and retries the subtree
//   when it resolves. The result is cached, so it suspends once.
//
// If you remember the common bug:
//   No default export, or lazy() declared inside a component.
//
// If you remember the professional framing:
//   Wrap it twice in production — .preload for hover warming, retry plus an
//   Error Boundary OUTSIDE Suspense for the chunk failure a deploy guarantees.
//
// NEXT TOPIC -> 06_dynamic-import.js
