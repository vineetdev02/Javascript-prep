// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Router v6  →  08_lazy-loaded-routes.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Lazy-loaded routes
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: A ROUTE IS A NATURAL
//      SPLIT POINT — nobody needs /admin's code to render /
//   2. The payoff, measured: 622 KB eager vs 67 KB to render the landing
//      page, an 89% smaller first download
//   3. The cost nobody mentions: React.lazy creates a WATERFALL — code,
//      THEN data, sequentially. 700 ms where 400 ms was possible.
//   4. Where the <Suspense> boundary goes, and why one at the root makes
//      the whole page flash on every navigation
//   5. The v6.4+ `lazy` ROUTE property — not React.lazy — which loads the
//      component and its loader together and kills the waterfall
//   6. Preloading on intent, and why it costs nothing to get right
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/07_react-router-v6/08_lazy-loaded-routes.js"
//
// Prerequisites: 03_nested-routes-outlet.js (the match chain — a Suspense
// boundary belongs at a level of that chain) and 05_redirect-navigate.js §7,
// which introduced loaders as "things that run before render". This file
// creates the problem that file 09's loaders exist to solve.
//
// Every file so far treated the route's component as something that simply
// exists. This one asks where it comes from — and the answer turns out to
// determine whether your data fetching waterfalls or runs in parallel.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Lazy-loaded routes:
// Splitting the bundle at route boundaries so a route's JavaScript is
// downloaded only when someone navigates to it — via React.lazy() +
// <Suspense>, or (v6.4+) the route object's own `lazy` property.
//
// If interviewer says "explain it simply", say:
//   "Routes are the obvious place to split a bundle, because nobody needs
//    the admin page's code to render the homepage. React.lazy turns an
//    import into a dynamic one, the bundler emits a separate chunk, and
//    <Suspense> shows a fallback while that chunk downloads."
//
// If interviewer says "what's the catch?", say:
//   "With React.lazy specifically, you've created a waterfall. The chunk
//    downloads, THEN the component mounts, THEN its effect fires and
//    fetches data — three steps in sequence where two of them could have
//    been parallel. React Router's own `lazy` route property fixes that,
//    because it loads the module and runs the route's loader together."
//
// Why it matters in interviews:
//   Almost everyone can describe React.lazy. Far fewer can name what it
//   costs. "Lazy routes are strictly better" is the answer of someone who
//   has added it to a demo; "lazy routes trade a waterfall for a smaller
//   first load, and here's how to get both" is the answer of someone who has
//   measured a real app.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   SMALLER FIRST LOAD, BOUGHT WITH AN EXTRA ROUND TRIP LATER.
//
// Runtime rule:
//   `React.lazy(() => import('./Page'))` returns a component that, on first
//   render, throws a promise. The nearest <Suspense> catches it, renders its
//   fallback, and re-renders when the promise resolves. Nothing is
//   downloaded until that first render — which is precisely why the download
//   cannot overlap with anything the component would have done.
//
// Practical rule:
//   Split at route boundaries, not at every component. Put the Suspense
//   boundary at the level of the chain whose content is actually changing.
//   And on a data router, prefer the route `lazy` property over React.lazy,
//   because it eliminates the waterfall rather than just hiding it behind a
//   spinner.
//
// Common trap:
//   One <Suspense> wrapping the entire app. Every lazy navigation then
//   unmounts the whole page — layout, sidebar, everything — and replaces it
//   with the fallback, which is a worse experience than not splitting at
//   all. §5 shows where it should go instead.
//
// The mental picture:
//
//   EAGER                          LAZY (React.lazy)
//   one bundle, everything         shell + one chunk per route
//   ──────────────────────         ─────────────────────────────
//   [shell|home|dash|admin|…]      [shell|home]  ← first load
//    ↑ user downloads all of it     then, on navigating to /admin:
//      to see the homepage          [admin] ← downloaded now
//
//   …but that download happens AT RENDER TIME, so:
//
//   render <Admin/> → throw promise → download chunk → mount → useEffect
//                                                              → fetch data
//   └────────────── code ───────────┘└──────────── data ──────────────┘
//                          SEQUENTIAL — the waterfall this file is about


// ══════════════════════════════════════════════════════════════════
// § 3 — THE PAYOFF, MEASURED
// ══════════════════════════════════════════════════════════════════

console.log("§3 — what route splitting actually saves on first load:\n");

const shellKb = 55;                 // React, the router, shared UI — needed always
const routeChunks = [
  { path: "/",          name: "Home",      kb: 12 },
  { path: "/dashboard", name: "Dashboard", kb: 180 },   // charting library
  { path: "/reports",   name: "Reports",   kb: 240 },   // a PDF renderer + a grid
  { path: "/admin",     name: "Admin",     kb: 95 },
  { path: "/settings",  name: "Settings",  kb: 40 },
];

const totalRouteKb = routeChunks.reduce((sum, r) => sum + r.kb, 0);
const eagerBundleKb = shellKb + totalRouteKb;

function lazyFirstLoad(landingPath) {
  const route = routeChunks.find(r => r.path === landingPath);
  return shellKb + route.kb;
}

console.log("      route".padEnd(14) + "chunk size");
console.log("      " + "─".repeat(30));
console.log("      " + "(shell)".padEnd(14) + shellKb + " KB   ← always needed");
for (const r of routeChunks) console.log("      " + r.path.padEnd(14) + r.kb + " KB");

console.log("\n    eager — one bundle containing everything :", eagerBundleKb, "KB");
console.log("    lazy  — landing on /                     :", lazyFirstLoad("/"), "KB",
  "  (" + (100 - lazyFirstLoad("/") / eagerBundleKb * 100).toFixed(0) + "% smaller)");
console.log("    lazy  — landing on /admin                :", lazyFirstLoad("/admin"), "KB",
  "  (" + (100 - lazyFirstLoad("/admin") / eagerBundleKb * 100).toFixed(0) + "% smaller)");

console.log("\n    The asymmetry is the point: the homepage — the page most first-time");
console.log("    visitors land on — was paying for a PDF renderer and a charting library");
console.log("    it never uses. Routes make that obvious in a way component-level");
console.log("    splitting does not, because a route boundary is already a boundary the");
console.log("    user understands.");
console.log("\n    And note what does NOT shrink: the shell. React, the router, your design");
console.log("    system and anything imported by every route stay in the first download.");
console.log("    Splitting routes cannot fix a 400 KB shell — that is a different problem");
console.log("    with a different fix.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE COST: React.lazy CREATES A WATERFALL
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the round trip nobody mentions when recommending React.lazy:\n");

const CODE_MS = 300;    // downloading the route's chunk
const DATA_MS = 400;    // the API call that route needs

function timelineReactLazy() {
  const steps = [
    { at: 0,                    event: "navigate to /reports" },
    { at: 0,                    event: "render <Reports/> → throws a promise" },
    { at: 0,                    event: "<Suspense> shows the fallback" },
    { at: 0,                    event: "chunk download STARTS" },
    { at: CODE_MS,              event: "chunk arrives, component mounts" },
    { at: CODE_MS,              event: "useEffect fires → fetch STARTS" },
    { at: CODE_MS + DATA_MS,    event: "data arrives, real content renders" },
  ];
  return { steps, total: CODE_MS + DATA_MS };
}

function timelineRouteLazy() {
  const steps = [
    { at: 0,                          event: "navigate to /reports" },
    { at: 0,                          event: "router: chunk download STARTS" },
    { at: 0,                          event: "router: loader STARTS (in parallel)" },
    { at: Math.min(CODE_MS, DATA_MS), event: "whichever finished first is done waiting" },
    { at: Math.max(CODE_MS, DATA_MS), event: "both ready → real content renders, once" },
  ];
  return { steps, total: Math.max(CODE_MS, DATA_MS) };
}

const lazyTimeline = timelineReactLazy();
const routeTimeline = timelineRouteLazy();

console.log("    React.lazy + a fetch inside the component:");
for (const s of lazyTimeline.steps) console.log("      " + String(s.at).padStart(4) + " ms   " + s.event);
console.log("      → time to real content:", lazyTimeline.total, "ms  🐛 code and data ran in SEQUENCE");

console.log("\n    the route `lazy` property + a loader (v6.4+):");
for (const s of routeTimeline.steps) console.log("      " + String(s.at).padStart(4) + " ms   " + s.event);
console.log("      → time to real content:", routeTimeline.total, "ms  ✅ they overlapped");

const saved = lazyTimeline.total - routeTimeline.total;
console.log("\n      saved:", saved, "ms —", ((saved / lazyTimeline.total) * 100).toFixed(0) + "% of the wait, from a config change");

console.log("\n    Why React.lazy CANNOT avoid this, structurally: the download is triggered");
console.log("    BY RENDERING the component. The router does not know the chunk is needed");
console.log("    until it tries to render it, and the component does not know what data to");
console.log("    fetch until it has mounted. Each step is the trigger for the next — that");
console.log("    is the definition of a waterfall.");
console.log("\n    This is the same shape as the fetch-on-render problem generally, and it");
console.log("    is exactly what loaders were introduced to fix. → §6, file 09\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — WHERE THE <Suspense> BOUNDARY GOES
// ══════════════════════════════════════════════════════════════════

console.log("§5 — one boundary at the root vs one per level of the chain:\n");

// The matched chain from 03 — a Suspense boundary sits at one of these levels.
const chain = ["RootLayout", "AppShell (nav + sidebar)", "ReportsLayout", "ReportDetail"];

function whatTheUserSees(boundaryAtIndex) {
  // Everything from the boundary DOWN is replaced by the fallback.
  const kept = chain.slice(0, boundaryAtIndex);
  const replaced = chain.slice(boundaryAtIndex);
  return { kept, replaced };
}

const atRoot = whatTheUserSees(0);
const atLeafLevel = whatTheUserSees(3);

console.log("    navigating to a lazy /reports/42, with the boundary at different levels:\n");
console.log("      <Suspense> at the ROOT (wrapping <App/>):");
console.log("        stays on screen :", atRoot.kept.length ? atRoot.kept.join(", ") : "(nothing)", "🐛");
console.log("        replaced by the fallback :", atRoot.replaced.join(", "));
console.log("        → the entire page blanks, including the nav the user is looking at.");
console.log("          Every lazy navigation is a full-page flash. Worse than no splitting.");

console.log("\n      <Suspense> around the OUTLET that is actually changing:");
console.log("        stays on screen :", atLeafLevel.kept.join(", "), "✅");
console.log("        replaced by the fallback :", atLeafLevel.replaced.join(", "));
console.log("        → the shell and sidebar stay put; only the content area shows a");
console.log("          skeleton. This is what 03 §5's 'parents do not re-mount' buys you,");
console.log("          and putting the boundary at the root throws it away.");

console.log("\n    The rule: a Suspense boundary should wrap the SMALLEST part of the chain");
console.log("    that is genuinely changing — which in a nested router is almost always an");
console.log("    <Outlet>, not the app root.");
console.log("\n    A second, related mistake: a fallback that is a different SHAPE from the");
console.log("    content it replaces. A centred spinner where a table will appear causes a");
console.log("    layout shift the moment data arrives. A skeleton with the table's");
console.log("    dimensions does not.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE ROUTE `lazy` PROPERTY IS NOT React.lazy
// ══════════════════════════════════════════════════════════════════

console.log("§6 — two different APIs with confusingly similar names:\n");

const comparison = [
  ["what it is",        "a React component wrapper", "a ROUTE object property"],
  ["what it loads",     "the component only",        "the whole route module"],
  ["loads the loader?", "no — there is none",        "yes, and runs it in parallel"],
  ["triggered by",      "RENDERING the component",   "MATCHING the route, before render"],
  ["needs <Suspense>?", "yes",                       "no — the router waits"],
  ["waterfall?",        "yes 🐛",                    "no ✅"],
  ["needs a data router?", "no — works anywhere",    "yes — createBrowserRouter only"],
];

console.log("      " + "aspect".padEnd(22) + "React.lazy".padEnd(30) + "route.lazy (v6.4+)");
console.log("      " + "─".repeat(84));
for (const [aspect, reactLazy, routeLazy] of comparison) {
  console.log("      " + aspect.padEnd(22) + reactLazy.padEnd(30) + routeLazy);
}

console.log("\n    What the route `lazy` property actually returns is the route's own");
console.log("    definition — element, loader, action, errorElement — all at once:");
console.log("      {");
console.log("        path: 'reports/:id',");
console.log("        lazy: async () => {");
console.log("          const { ReportDetail, loader } = await import('./ReportDetail');");
console.log("          return { Component: ReportDetail, loader };   // ← BOTH");
console.log("        },");
console.log("      }");
console.log("\n    Because the router calls that on MATCH rather than on RENDER, it learns");
console.log("    about the loader at the same moment it learns about the component — so it");
console.log("    can start the fetch immediately instead of after mounting. That single");
console.log("    difference is the", saved + " ms from §4.");
console.log("\n    Worth being explicit: these are not competitors. React.lazy is the right");
console.log("    tool when you are not on a data router, or when you are splitting");
console.log("    something that is not a route at all — a heavy modal, an editor, a chart");
console.log("    that appears on demand. route.lazy is the right tool for routes on a data");
console.log("    router. The bug is using React.lazy for routes and then wondering why the");
console.log("    spinner lasts twice as long as the API call. 🐛\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — PRELOADING ON INTENT
// ══════════════════════════════════════════════════════════════════

console.log("§7 — starting the download before the click:\n");

// The user reveals intent well before they navigate: they hover a link,
// focus it with the keyboard, or start a touch. Any of those is a signal.
const HOVER_TO_CLICK_MS = 250;      // a realistic median for a deliberate click

function perceivedWait({ preloadOnHover }) {
  if (!preloadOnHover) {
    return { startedAt: "click", waitAfterClick: CODE_MS };
  }
  const alreadyDownloaded = Math.min(HOVER_TO_CLICK_MS, CODE_MS);
  return { startedAt: "hover", waitAfterClick: Math.max(0, CODE_MS - alreadyDownloaded) };
}

const noPreload = perceivedWait({ preloadOnHover: false });
const withPreload = perceivedWait({ preloadOnHover: true });

console.log("    chunk takes", CODE_MS, "ms; the user hovers", HOVER_TO_CLICK_MS, "ms before clicking.\n");
console.log("      no preloading    → download starts on", noPreload.startedAt.padEnd(6),
  "→ user waits", noPreload.waitAfterClick, "ms after clicking");
console.log("      preload on hover → download starts on", withPreload.startedAt.padEnd(6),
  "→ user waits", withPreload.waitAfterClick, "ms after clicking",
  withPreload.waitAfterClick < noPreload.waitAfterClick ? "✅" : "");
console.log("      perceived improvement:", noPreload.waitAfterClick - withPreload.waitAfterClick, "ms of the wait removed");

console.log("\n    The implementation is genuinely trivial — the import function is");
console.log("    idempotent, so calling it early just starts the download early:");
console.log("      const load = () => import('./Reports');");
console.log("      <Link to='/reports' onMouseEnter={load} onFocus={load} />");
console.log("\n    Three things to keep honest about it:");
console.log("      • it is a HINT, not a guarantee — the user may never click, so never");
console.log("        preload something with side effects, only code.");
console.log("      • respect data saving: skip it when navigator.connection.saveData is");
console.log("        set, or on a slow effective connection type.");
console.log("      • onFocus matters as much as onMouseEnter — keyboard users reveal the");
console.log("        same intent and get none of the benefit if you only listen for hover.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Every navigation flashes the whole page white: one <Suspense> at
//   the app root, so the fallback replaces the layout the user is looking
//   at. → §5.
//
// Bug 2 — A spinner that lasts noticeably longer than the API call: the
//   React.lazy waterfall — code, then mount, then fetch. → §4.
//
// Bug 3 — Layout shift when content arrives: the fallback was a centred
//   spinner where a table appears. → §5.
//
// Bug 4 — Splitting made the app SLOWER: too many tiny chunks, so each
//   navigation costs a request with poor compression. Split at route
//   boundaries, not per component.
//
// Bug 5 — First load barely improved after adding lazy routes: the weight
//   was in the shared shell, not the route chunks. Splitting routes cannot
//   fix a heavy shell. → §3.
//
// Bug 6 — A lazy route that fails to load and shows the fallback forever:
//   a chunk 404 (common after a deploy invalidates old hashed filenames)
//   with no error boundary. Every Suspense boundary needs an error boundary
//   beside it. → 06_design-patterns/08.
//
// Bug 7 — Using React.lazy on a data router and keeping the fetch in a
//   useEffect: you have code-splitting AND a waterfall, when route.lazy plus
//   a loader would have given you the first without the second. → §6.
//
// Bug 8 — Preloading on hover only, so keyboard users get none of it: add
//   onFocus. → §7.
//
// Bug 9 — Aggressive preloading on a metered connection: check
//   navigator.connection.saveData before prefetching. → §7.
//
// Bug 10 — A lazy component imported at the top of a parent that always
//   renders: the chunk is requested immediately and the split achieves
//   nothing. Make sure the lazy boundary is genuinely conditional.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The payoff:
assert(eagerBundleKb === 622,
  "the eager bundle is the shell plus every route chunk — 622 KB");
assert(lazyFirstLoad("/") === 67,
  "…while landing on / lazily costs only the shell plus Home — 67 KB");
assert(lazyFirstLoad("/") < eagerBundleKb * 0.15,
  "…an 85%+ reduction in first download for the most common landing page ✅");
assert(lazyFirstLoad("/admin") > lazyFirstLoad("/"),
  "…and the saving depends on where you land — a heavier route costs more");

// The waterfall:
assert(lazyTimeline.total === CODE_MS + DATA_MS,
  "React.lazy makes code and data SEQUENTIAL — the times add up 🐛");
assert(routeTimeline.total === Math.max(CODE_MS, DATA_MS),
  "…route.lazy + a loader overlaps them — only the slower one counts ✅");
assert(saved === 300 && routeTimeline.total < lazyTimeline.total,
  "…saving 300 ms of a 700 ms wait, from a configuration change alone");

// Suspense placement:
assert(atRoot.kept.length === 0 && atRoot.replaced.length === chain.length,
  "a root Suspense boundary replaces the ENTIRE chain with the fallback 🐛");
assert(atLeafLevel.kept.length === 3 && atLeafLevel.replaced.length === 1,
  "…a boundary at the changing Outlet keeps the 3 layout levels on screen ✅");

// The two APIs:
assert(comparison.find(c => c[0] === "waterfall?")[1].includes("yes"),
  "React.lazy waterfalls…");
assert(comparison.find(c => c[0] === "waterfall?")[2].includes("no"),
  "…and route.lazy does not — because it loads on MATCH, not on RENDER");
assert(comparison.find(c => c[0] === "needs <Suspense>?")[2] === "no — the router waits",
  "…which is also why route.lazy needs no Suspense boundary of its own");

// Preloading:
assert(withPreload.waitAfterClick === CODE_MS - HOVER_TO_CLICK_MS,
  "preloading on hover removes exactly the hover duration from the post-click wait");
assert(withPreload.waitAfterClick < noPreload.waitAfterClick,
  "…so the user waits measurably less for the same chunk ✅");

console.log("§9 — mini assertions passed for: Lazy-loaded routes");
console.log("\n  The pair that captures it: splitting at route boundaries cut the first");
console.log("  download from " + eagerBundleKb + " KB to " + lazyFirstLoad("/") + " KB — and then React.lazy quietly charged");
console.log("  " + lazyTimeline.total + " ms for content that route.lazy plus a loader delivers in " + routeTimeline.total + " ms,");
console.log("  because one loads on render and the other loads on match.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you lazy-load routes in React?", answer:
//
//   "Routes are the natural split point, because nobody needs the admin
//    page's code to render the homepage. The classic approach is
//    React.lazy(() => import('./Page')) with a <Suspense> boundary — the
//    bundler emits a chunk per route, and the chunk downloads on first
//    render. In an app where the shell is 55 KB and the routes total 570,
//    that takes the first download from about 620 KB to about 67 for someone
//    landing on the homepage.
//
//    The part I'd raise unprompted is what it costs. React.lazy triggers the
//    download BY RENDERING the component — so the sequence is: download the
//    chunk, then mount, then the effect fires and fetches data. That's a
//    waterfall. With a 300 ms chunk and a 400 ms API call you wait 700 ms for
//    content that could have arrived in 400 if they'd overlapped. And it's
//    structural, not a tuning problem — the router can't know the chunk is
//    needed until it renders, and the component can't know what to fetch
//    until it mounts.
//
//    On a data router, React Router's own `lazy` route property fixes it —
//    and it's a genuinely different thing from React.lazy despite the name.
//    It's a property on the route object, it runs when the route MATCHES
//    rather than when it renders, and it returns the whole route module:
//    component, loader, action, error element. Because the router learns
//    about the loader at match time, it starts the fetch in parallel with
//    the chunk download. It doesn't even need a Suspense boundary, because
//    the router waits.
//
//    The other thing people get wrong is where the Suspense boundary goes.
//    One at the app root means every lazy navigation blanks the entire page
//    including the nav the user is looking at — which throws away the whole
//    benefit of nested layouts not re-mounting. The boundary should wrap the
//    smallest part of the chain that's actually changing, which is usually an
//    Outlet. And the fallback should be the same SHAPE as the content, or
//    you get a layout shift when it arrives.
//
//    One cheap win on top: preload on intent. The import function is
//    idempotent, so calling it from onMouseEnter and onFocus on the Link
//    starts the download before the click — a couple of hundred milliseconds
//    of the wait, removed for free. Just gate it on saveData, and remember
//    onFocus so keyboard users get it too."
//
// Leading with the measured saving, then immediately naming the waterfall it
// buys, is what separates this from a docs summary.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why are routes a good split point?
// A1. They're a boundary the user already understands, and no route needs
//     another route's code.
//
// Q2. What does React.lazy actually do on first render?
// A2. Throws a promise; the nearest <Suspense> catches it, renders the
//     fallback, and re-renders on resolution.
//
// Q3. What's the hidden cost?
// A3. A waterfall — code downloads, then the component mounts, then it
//     fetches. Sequential where parallel was possible.
//
// Q4. Why can't React.lazy avoid it?
// A4. The download is triggered by rendering, and the fetch by mounting.
//     Each step is the trigger for the next.
//
// Q5. What is the route `lazy` property, and how does it differ?
// A5. A property on the route object that runs on MATCH and returns the
//     whole route module — component and loader — so both load in parallel.
//
// Q6. Does route.lazy need a Suspense boundary?
// A6. No — the router waits for it before rendering.
//
// Q7. Where should a Suspense boundary go?
// A7. Around the smallest part of the match chain that's changing — usually
//     an Outlet, never the app root.
//
// Q8. What happens with a root-level boundary?
// A8. Every lazy navigation replaces the whole page including the layout —
//     a full-page flash, worse than not splitting.
//
// Q9. What should the fallback look like?
// A9. The same shape as the content it replaces, or you get layout shift.
//
// Q10. What breaks when a chunk 404s after a deploy?
// A10. The fallback shows forever unless there's an error boundary beside
//      the Suspense boundary.
//
// Q11. How do you preload, and what are the caveats?
// A11. Call the import function on hover AND focus. Gate on saveData, and
//      never preload anything with side effects.
//
// Q12. When would you still use React.lazy over route.lazy?
// A12. When you're not on a data router, or you're splitting something
//      that isn't a route — a heavy modal, an editor, an on-demand chart.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Why split at route boundaries?
//   Back : No route needs another's code, and it's a boundary the user
//          already understands.
//
// Flashcard 2:
//   Front: React.lazy's hidden cost?
//   Back : A waterfall — chunk, then mount, then fetch. Sequential.
//
// Flashcard 3:
//   Front: Why is that structural?
//   Back : Rendering triggers the download; mounting triggers the fetch.
//
// Flashcard 4:
//   Front: What is route.lazy?
//   Back : A route-object property that runs on MATCH and returns component
//          AND loader — so they load in parallel.
//
// Flashcard 5:
//   Front: Does route.lazy need Suspense?
//   Back : No — the router waits before rendering.
//
// Flashcard 6:
//   Front: Where does a Suspense boundary go?
//   Back : Around the smallest changing part of the chain — an Outlet, not
//          the root.
//
// Flashcard 7:
//   Front: What must sit beside every Suspense boundary?
//   Back : An error boundary — chunks 404 after deploys.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "Lazy routes buy a smaller first load with an extra round trip —
//          route.lazy is how you get the first without paying the second."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add React.lazy to one heavy route in a real app and compare the initial
//   bundle in the network tab, before and after.
//
// Task 2:
//   Throttle to Slow 3G and time from click to content on that route.
//   Identify the chunk download and the fetch as separate, sequential bars.
//
// Task 3:
//   Move the Suspense boundary from the app root to the Outlet and watch the
//   layout stop flashing.
//
// Task 4:
//   Replace a centred spinner fallback with a skeleton matching the
//   content's dimensions. Measure the layout shift before and after.
//
// Task 5:
//   Convert one React.lazy route to route.lazy with a loader on a data
//   router, and compare the two waterfall shapes in the network tab.
//
// Task 6:
//   Add onMouseEnter and onFocus preloading to your nav links. Confirm in
//   the network tab that the chunk starts before the click.
//
// Task 7:
//   Delete a deployed chunk file to simulate a post-deploy 404, and confirm
//   your error boundary catches it rather than hanging on the fallback.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   React.lazy trades a smaller first load for a waterfall, because the
//   download is triggered by rendering. route.lazy triggers on matching, so
//   code and data overlap.
//
// If you remember the common bug:
//   A single Suspense boundary at the app root, turning every lazy
//   navigation into a full-page flash.
//
// If you remember the professional framing:
//   Split at route boundaries, put the boundary at the changing Outlet,
//   shape the fallback like the content, pair it with an error boundary, and
//   preload on intent.
//
// NEXT TOPIC -> 09_loader-and-action-v6-4.js
