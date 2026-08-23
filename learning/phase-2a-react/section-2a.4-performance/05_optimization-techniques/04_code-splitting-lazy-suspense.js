// ╔══════════════════════════════════════════════════════════════════╗
// ║   Optimization Techniques  →  04_code-splitting-lazy-suspense.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Code splitting (lazy + Suspense)
//
// WHAT YOU WILL MASTER HERE:
//   1. The problem: one bundle, and what the user pays for code they never run
//   2. Where to split — the four split points, ranked by payoff — MEASURED
//   3. lazy + Suspense as one mechanism, and why neither works alone
//   4. The waterfall: nested lazy boundaries turning parallel into serial
//   5. Preloading — how to get splitting's win without its latency
//   6. The chunk-load error nobody handles, and why it happens on deploy
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.4-performance/05_optimization-techniques/04_code-splitting-lazy-suspense.js"
//
// Prerequisites: none beyond 01-03. This begins the LOAD half of the section —
// 01-03 made rendering cheaper; 04-08 make the app smaller.
// 05 is the React.lazy API in detail; 06 is the import() primitive underneath.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Code splitting:
// Breaking one JavaScript bundle into chunks that load on demand, so the user
// downloads and parses only the code the current screen actually needs.
//
// If interviewer says "explain it simply", say:
// "By default a bundler produces one big JS file containing your whole app.
//  Someone visiting the login page still downloads the admin dashboard, the
//  chart library and the PDF exporter. Code splitting cuts the bundle at chosen
//  points so each route or heavy component arrives only when it's needed."
//
// If interviewer asks "why does it matter?", say:
// "Because JavaScript is the most expensive byte you can ship. An image that
//  size decodes off the main thread; JavaScript must be downloaded, parsed,
//  compiled and executed on the main thread, and until that finishes the page
//  can't respond to input. That's Time to Interactive, and on a mid-range
//  Android over 4G it's where most 'the site feels slow' complaints come from.
//  Splitting by route is usually the single largest performance win available
//  in a React app, and it's about ten lines of code."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   Ship what this SCREEN needs. Nothing else.
//
// Runtime rule:
//   A bundler treats a static `import X from "./x"` as "put this in the bundle
//   now". It treats a dynamic `import("./x")` as "make this a separate chunk and
//   fetch it when this line runs". The syntax IS the instruction. → 06
//
// Practical rule:
//   Split at ROUTES first. Then at heavy components the first screen does not
//   show: modals, editors, charts, maps, date pickers, anything below the fold.
//
// Common trap:
//   Splitting everything. Each chunk is a request with its own latency, and a
//   50-line component in its own chunk costs more in round-trip than it saves in
//   bytes. Splitting is a knife, not a sprinkler.
//
// The three pieces, and why all three are required:
//
//   import("./Chart")   the BUNDLER instruction — creates the chunk        (06)
//   React.lazy(...)     the REACT wrapper — turns that promise into a
//                       component that suspends while loading              (05)
//   <Suspense>          the BOUNDARY — what the user sees during the wait  (this file)
//
//   lazy without Suspense throws. Suspense without lazy renders nothing special.
//   import() without lazy gives you a promise React cannot render.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE BUNDLE MATH
// ══════════════════════════════════════════════════════════════════

console.log("§3 — what the login page is actually downloading:\n");

// A realistic mid-size React app, in KB of minified+gzipped JS.
const modules = [
  { name: "react + react-dom",  kb: 45,  usedOn: ["*"] },
  { name: "router",             kb: 12,  usedOn: ["*"] },
  { name: "design system",      kb: 60,  usedOn: ["*"] },
  { name: "LoginPage",          kb: 8,   usedOn: ["/login"] },
  { name: "Dashboard",          kb: 40,  usedOn: ["/dashboard"] },
  { name: "chart library",      kb: 210, usedOn: ["/dashboard"] },
  { name: "AdminPanel",         kb: 55,  usedOn: ["/admin"] },
  { name: "data grid",          kb: 180, usedOn: ["/admin"] },
  { name: "PDF exporter",       kb: 320, usedOn: ["/reports"] },
  { name: "rich text editor",   kb: 290, usedOn: ["/reports"] },
  { name: "map + tiles client", kb: 150, usedOn: ["/venues"] },
];

const oneBundle = modules.reduce((sum, m) => sum + m.kb, 0);
const shared = modules.filter(m => m.usedOn.includes("*")).reduce((s, m) => s + m.kb, 0);
const loginChunk = modules
  .filter(m => m.usedOn.includes("/login"))
  .reduce((s, m) => s + m.kb, 0);
const loginSplit = shared + loginChunk;

console.log("    single bundle (no splitting):", oneBundle, "KB");
console.log("    split by route, visiting /login:", loginSplit, "KB");
console.log("      = shared", shared, "KB + LoginPage", loginChunk, "KB");
console.log("    bytes NOT downloaded         :", oneBundle - loginSplit, "KB",
  `(${Math.round((1 - loginSplit / oneBundle) * 100)}% smaller)`);

// Bytes are the headline; TIME is the argument. Parse+compile is the part
// people forget, and it is the part that blocks the main thread.
const THROUGHPUT_KBPS = 150;      // "Slow 4G" throughput, roughly
const PARSE_MS_PER_KB = 1.5;      // mid-range Android, gzipped JS, ballpark

function cost(kb) {
  const download = (kb / THROUGHPUT_KBPS) * 1000;
  const parse = kb * PARSE_MS_PER_KB;               // main thread. Blocking.
  return { download: Math.round(download), parse: Math.round(parse), total: Math.round(download + parse) };
}

const full = cost(oneBundle), split = cost(loginSplit);
console.log("\n    on a mid-range Android over slow 4G:");
console.log("      one bundle : download", full.download + "ms  parse+compile", full.parse + "ms  → ~" + full.total + "ms");
console.log("      route-split: download", split.download + "ms  parse+compile", split.parse + "ms  → ~" + split.total + "ms");
console.log("      saved      : ~" + (full.total - split.total) + "ms before the page can respond to a tap");

console.log("\n  The parse column is the point worth making out loud. A 320KB image");
console.log("  and 320KB of JavaScript cost the same to download and are not remotely");
console.log("  the same cost: the image decodes off the main thread, the JS must be");
console.log("  parsed, compiled and executed ON it. Bytes of JS are the expensive");
console.log("  bytes, which is why removing them beats compressing them.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — WHERE TO SPLIT, RANKED
// ══════════════════════════════════════════════════════════════════
//
//   1. ROUTES — always. Every route the user is not on is dead weight.
//      const Dashboard = lazy(() => import("./pages/Dashboard"));
//      <Route path="/dashboard" element={<Dashboard />} />
//      Biggest win, lowest risk, one line per route.
//
//   2. HEAVY LIBRARIES behind an interaction. A chart, a map, an editor, a PDF
//      generator, a QR scanner, moment/date-fns locales. If the user has to
//      click to see it, the code should arrive when they click.
//
//   3. BELOW-THE-FOLD / CONDITIONAL UI. Modals, drawers, the comments section,
//      the "advanced settings" tab, an onboarding tour. Most users never open it.
//
//   4. ROLE-GATED CODE. An admin panel shipped to every logged-in user is the
//      purest waste there is — and it is also a mild information leak, since
//      your admin UI's source is readable by anyone.
//
//   ❌ DO NOT SPLIT: small components, anything on the critical render path,
//      anything needed immediately after hydration, or a component used by
//      every route (it just ends up in the shared chunk anyway, with extra
//      indirection).

console.log("§4 — split points, measured on the /login visit:\n");

function bundleFor(strategy) {
  if (strategy === "none") return oneBundle;
  if (strategy === "routes") return loginSplit;
  if (strategy === "routes+libs") return loginSplit;      // libs already excluded here
  return oneBundle;
}

const strategies = [
  ["no splitting          ", "none"],
  ["route-based splitting ", "routes"],
];
for (const [label, key] of strategies) {
  const kb = bundleFor(key);
  console.log(`    ${label} → ${kb} KB, ~${cost(kb).total}ms to interactive`);
}

// Over-splitting, priced honestly. Each chunk costs a request.
const REQUEST_OVERHEAD_MS = 40;                  // connection reuse assumed, HTTP/2
function overSplitCost(chunks, kbTotal) {
  return Math.round(cost(kbTotal).total + chunks * REQUEST_OVERHEAD_MS);
}
console.log("\n    the over-splitting trap (same 113 KB, different chunk counts):");
for (const chunks of [1, 3, 12, 40]) {
  console.log(`      ${String(chunks).padStart(2)} chunks → ~${overSplitCost(chunks, loginSplit)}ms`);
}
console.log("\n  Forty chunks to deliver the same bytes is slower than one. HTTP/2");
console.log("  multiplexing makes extra requests cheap, not free — and every chunk");
console.log("  also loses cross-chunk minification and tree-shaking. Split where a");
console.log("  USER BOUNDARY exists, not per file.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — lazy + Suspense: THE MECHANISM
// ══════════════════════════════════════════════════════════════════
//
//   import { lazy, Suspense } from "react";
//
//   const Dashboard = lazy(() => import("./pages/Dashboard"));
//
//   function App() {
//     return (
//       <Suspense fallback={<PageSkeleton />}>
//         <Dashboard />
//       </Suspense>
//     );
//   }
//
// What happens, in order:
//   1. React renders <Dashboard/>. The chunk is not loaded.
//   2. lazy's wrapper THROWS the pending promise. (React 19: it uses the same
//      mechanism through `use`, but the model is unchanged.)
//   3. React catches it at the nearest <Suspense> ancestor and renders `fallback`.
//   4. The promise resolves. React retries the subtree and renders the real
//      component. The fallback disappears.
//
// Two things fall out of that, and both are asked:
//   • Suspense is REQUIRED. Without a boundary the throw reaches the root and
//     you get "A component suspended while responding to synchronous input" or
//     a hard crash.
//   • The BOUNDARY POSITION decides what disappears during loading. A boundary
//     at the app root replaces the whole page — including the nav — with a
//     spinner. That is a worse experience than the code splitting is worth.

console.log("§5 — the boundary decides how much of the page vanishes:\n");

function simulateBoundary(where) {
  const page = ["Nav", "Sidebar", "Content", "Footer"];
  if (where === "root") return { visible: [], fallback: page.slice() };
  return { visible: ["Nav", "Sidebar", "Footer"], fallback: ["Content"] };
}

for (const where of ["root", "around content"]) {
  const r = simulateBoundary(where === "root" ? "root" : "content");
  console.log(`    <Suspense> at ${where.padEnd(15)} → still visible: ${JSON.stringify(r.visible)}`);
}
console.log("\n  Put the boundary as CLOSE to the lazy component as is useful, and");
console.log("  make the fallback a skeleton with the same dimensions as the real");
console.log("  content — a spinner that gets replaced by taller content pushes the");
console.log("  page down and costs you CLS. → 13_web-vitals\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — THE WATERFALL
// ══════════════════════════════════════════════════════════════════

console.log("§6 — nesting lazy boundaries turns parallel into serial:\n");

// ❌ Dashboard is lazy, and INSIDE it Chart is lazy, and inside that a locale
//    file is lazy. Nothing starts until the previous one finishes, because the
//    import() call that requests chunk 2 lives inside chunk 1.

const CHUNK_MS = { Dashboard: 300, Chart: 450, Locale: 120 };

const serial = CHUNK_MS.Dashboard + CHUNK_MS.Chart + CHUNK_MS.Locale;
const parallel = Math.max(CHUNK_MS.Dashboard, CHUNK_MS.Chart, CHUNK_MS.Locale);

console.log("    3 nested lazy boundaries (a real dashboard):");
console.log("      serial   (nested)  :", serial + "ms  🐛 each waits for its parent's code");
console.log("      parallel (preload) :", parallel + "ms ✅ all three requested at once");
console.log("      difference         :", serial - parallel + "ms");

console.log("\n  The three fixes, in order of preference:");
console.log("    1. Do not nest split points on one screen. One boundary per ROUTE,");
console.log("       not one per component inside it.");
console.log("    2. Kick off the imports together at the route level:");
console.log("         Promise.all([import('./Dashboard'), import('./Chart')])");
console.log("    3. Let the router do it. React Router's lazy() and Next.js's");
console.log("       route loaders start the code fetch as part of navigation, in");
console.log("       parallel with the data fetch — which is the OTHER waterfall:");
console.log("       code-then-data. A route that loads its chunk, then mounts, then");
console.log("       fires useEffect to fetch, has serialized two independent waits.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — PRELOADING: THE WIN WITHOUT THE WAIT
// ══════════════════════════════════════════════════════════════════

console.log("§7 — preloading on intent:\n");

// The complaint about code splitting is real: the user clicks, and now they
// WAIT for a network round trip they would not have waited for in one bundle.
// Preloading removes that, and it is the detail that separates candidates who
// have shipped this from candidates who have read about it.
//
//   const Dashboard = lazy(() => import("./Dashboard"));
//
//   // The SAME promise. import() caches by specifier, so calling it early and
//   // calling it at render time resolve to one module and one request.
//   const preload = () => import("./Dashboard");
//
//   <Link to="/dashboard" onMouseEnter={preload} onFocus={preload}>…</Link>
//
// Triggers worth knowing, cheapest first:
//   • onMouseEnter / onFocus / onTouchStart on the link  ← ~200-300ms of warning
//   • requestIdleCallback after the first screen settles ← free, invisible
//   • IntersectionObserver when the trigger scrolls into view
//   • <link rel="prefetch" href="/chunk.js"> emitted by the bundler/framework
//     (Next.js does this for every visible <Link> automatically)

const HOVER_LEAD_MS = 250;                       // typical hover→click gap
const CHUNK_LOAD_MS = 300;

const noPreload = CHUNK_LOAD_MS;
const withPreload = Math.max(0, CHUNK_LOAD_MS - HOVER_LEAD_MS);

console.log("    user hovers a nav link for ~" + HOVER_LEAD_MS + "ms, then clicks:");
console.log("      no preload   → visible wait after click:", noPreload + "ms 🐛 a spinner");
console.log("      preload on hover → visible wait:", withPreload + "ms ✅ feels instant");
console.log("\n  Same bytes, same chunk, same code — the fetch just started 250ms");
console.log("  earlier, during time the user was going to spend anyway. This is the");
console.log("  answer to 'doesn't code splitting make navigation slower?': it does,");
console.log("  unless you preload on intent, and then it does not.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — THE ERROR NOBODY HANDLES
// ══════════════════════════════════════════════════════════════════

console.log("§8 — chunk load failures are a WHEN, not an if:\n");

// A dynamic import is a network request, so it can fail: flaky connection,
// tunnel, captive portal — and the one people miss:
//
//   YOU DEPLOYED. The user's tab has been open for an hour. Its HTML references
//   main.a1b2c3.js, which imports Dashboard.d4e5f6.js. Your new deploy replaced
//   those hashed files. The user clicks a link, the browser requests a chunk
//   that no longer exists, and gets a 404 — as HTML, not JS. The app dies with
//   "Failed to fetch dynamically imported module".
//
// Suspense does NOT catch this. Suspense handles PENDING; an Error Boundary
// handles REJECTED. You need both, and they nest in this order:
//
//   <ErrorBoundary fallback={<Retry />}>       ← rejected
//     <Suspense fallback={<Skeleton />}>       ← pending
//       <Dashboard />
//     </Suspense>
//   </ErrorBoundary>

function lazyWithRetry(loader, { retries = 2, failuresBeforeSuccess = 0 } = {}) {
  let attempts = 0;
  return function load() {
    attempts++;
    if (attempts <= failuresBeforeSuccess) {
      if (attempts > retries) return { ok: false, attempts };
      return load();                              // retry — a new request
    }
    return { ok: true, attempts };
  };
}

const flaky = lazyWithRetry(null, { retries: 2, failuresBeforeSuccess: 1 });
const dead = lazyWithRetry(null, { retries: 2, failuresBeforeSuccess: 99 });

console.log("    one transient failure, then success:", JSON.stringify(flaky()), "✅ retry saved it");
console.log("    chunk genuinely gone (stale deploy):", JSON.stringify(dead()), "🐛 → Error Boundary");
console.log("\n  The production-grade pattern is all three:");
console.log("    1. retry the import once or twice with a short backoff,");
console.log("    2. wrap in an Error Boundary with a real 'Reload' button,");
console.log("    3. because for the stale-deploy case the only true fix is");
console.log("       window.location.reload() — the user needs the NEW index.html.");
console.log("  Keeping old chunks on the CDN for a release or two also helps a lot.");
console.log("  → 06_dynamic-import.js §7, and 06_design-patterns Error Boundaries\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT SPLITTING DOES *NOT* FIX
// ══════════════════════════════════════════════════════════════════
//
// Say this unprompted. It shows you have measured rather than cargo-culted.
//
//   • It does not reduce TOTAL bytes for a user who visits every route. It
//     moves them, and often adds a little (chunk boilerplate, lost cross-chunk
//     minification). The win is the FIRST screen, and it is a real win because
//     most users never visit most routes.
//   • It does not help if the shared chunk is the problem. If react + your
//     design system is 400KB, every route pays it. That is a dependency
//     problem, solved by 08_bundle-size-analysis.js, not by splitting.
//   • It does not fix a slow API. A 900ms fetch is 900ms whether the JS was
//     100KB or 1MB.
//   • It can HURT perceived speed if you split badly: a spinner on every
//     navigation feels worse than one slower initial load. Preload (§7) is what
//     buys that back.
//   • It does not change hydration cost in SSR apps — the server still rendered
//     the HTML and the client still has to hydrate what is on screen. → 14.
//
// The honest ranking of load optimizations, most impact first:
//   1. Delete or replace an oversized dependency.       → 08
//   2. Route-based code splitting.                       → this file
//   3. Preload on intent.                                → §7
//   4. Split heavy interaction-gated components.         → §4
//   5. Everything else.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "A React component suspended while responding to synchronous input":
//   A lazy component with no <Suspense> ancestor, or one mounted by a click
//   without startTransition. Add the boundary. → §5.
//
// Bug 2 — The whole page flashes a spinner on every navigation:
//   The Suspense boundary is at the root. Move it in, and use a skeleton. → §5.
//
// Bug 3 — Navigation got SLOWER after splitting:
//   No preloading. The user now waits for a round trip they never used to. → §7.
//
// Bug 4 — "Failed to fetch dynamically imported module" in production:
//   A stale tab requesting chunks a deploy deleted. Retry + Error Boundary +
//   reload. → §8.
//
// Bug 5 — Three spinners appear one after another:
//   Nested lazy boundaries. A waterfall. → §6.
//
// Bug 6 — Split everything, no faster:
//   The bytes were in the shared vendor chunk all along. → 08.
//
// Bug 7 — Layout jumps when the chunk arrives:
//   A short spinner replaced by tall content. CLS. Size the fallback. → 13.
//
// Bug 8 — A lazy component defined INSIDE another component:
//   `const C = lazy(...)` in a render body creates a NEW component type every
//   render → remount, refetch, state lost, infinite fallback flicker. Define
//   lazy components at MODULE level. → 05 §6.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The math:
assert(oneBundle === 1370, "the unsplit bundle is 1370 KB of JS");
assert(shared === 117 && loginChunk === 8, "shared 117 KB + LoginPage 8 KB");
assert(loginSplit === 125, "/login only needs 125 KB");
assert(oneBundle - loginSplit === 1245,
  "1245 KB — 91% — is code the login visitor never runs 🐛");
assert(full.total > split.total * 5,
  "and the TIME difference is bigger than the byte ratio suggests, because " +
  "parse+compile is charged to the main thread");

// Over-splitting:
assert(overSplitCost(1, loginSplit) < overSplitCost(40, loginSplit),
  "40 chunks delivering the same bytes is slower than 1 — requests are not free 🐛");

// The waterfall:
assert(serial === 870 && parallel === 450,
  "3 nested lazy boundaries serialize into 870ms; requested in parallel, 450ms");
assert(serial - parallel === 420, "420ms of pure waterfall");

// Preloading:
assert(noPreload === 300 && withPreload === 50,
  "preloading on hover turns a 300ms post-click wait into 50ms ✅");

// Errors:
assert(flaky().ok === true, "a transient chunk failure is fixed by a retry");
assert(dead().ok === false, "a deleted chunk is not — that needs an Error Boundary 🐛");

console.log("§11 — mini assertions passed for: Code splitting (lazy + Suspense)");
console.log("\n  The pair that captures it: 91% of that bundle was code the login");
console.log("  visitor never runs — and nesting three lazy boundaries handed 420ms");
console.log("  of that win straight back. Split at routes, preload on intent.");


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is code splitting and how do you do it in React?", answer:
//
//   "By default a bundler emits one JS file with the whole app in it, so someone
//    on the login page downloads the admin panel, the chart library and the PDF
//    exporter. In the app I measured, 91% of the bundle was code that visitor
//    never runs. Code splitting cuts it into chunks that load on demand.
//
//    It matters more than the byte count suggests, because JavaScript isn't just
//    downloaded — it's parsed, compiled and executed on the main thread. A
//    megabyte of images and a megabyte of JS are not the same cost. Until that
//    JS finishes, the page can't respond to a tap.
//
//    Mechanically it's three pieces: a dynamic import() tells the bundler to
//    emit a separate chunk, React.lazy wraps that promise into a component that
//    suspends while it loads, and a Suspense boundary catches the suspension and
//    renders a fallback. All three are needed — lazy without Suspense throws.
//
//    Where I split: routes first, always, since that's the biggest win for the
//    least risk. Then heavy libraries behind an interaction — an editor, a map,
//    a PDF generator. Then below-the-fold and role-gated UI. What I don't do is
//    split per component: every chunk is a request, and forty chunks delivering
//    the same bytes is slower than one.
//
//    Two things I'd bring up unprompted. First, the waterfall: nesting lazy
//    boundaries serializes them, because the import for chunk two lives inside
//    chunk one — three nested boundaries turned 450ms into 870ms in my example.
//    Fix it by keeping one boundary per route and starting the imports together.
//    Second, preloading. The fair criticism of splitting is that the user now
//    waits on click. Calling the same import() on link hover fixes that — import()
//    caches by specifier, so it's one request — and turns a 300ms spinner into
//    about 50ms.
//
//    And the failure mode people forget: dynamic imports can reject. The common
//    cause isn't a flaky network, it's a deploy — an open tab asks for a hashed
//    chunk that no longer exists. Suspense handles pending, not rejected, so you
//    need an Error Boundary outside the Suspense boundary, a retry, and
//    realistically a reload, because that user needs the new index.html."
//
// The waterfall, preloading, and the stale-deploy failure are the three details
// that mark someone who has actually shipped this.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What creates a chunk?
// A1. A dynamic import() in the source. The bundler sees it statically and
//     emits a separate file.
//
// Q2. Can you use React.lazy without Suspense?
// A2. No. The suspension needs a boundary or it reaches the root and throws.
//
// Q3. Where should the Suspense boundary go?
// A3. Close enough to the lazy component that the rest of the page stays
//     visible, with a fallback sized like the real content to avoid CLS.
//
// Q4. What's a lazy waterfall?
// A4. Nested lazy boundaries. Chunk 2's import lives inside chunk 1, so nothing
//     can start in parallel.
//
// Q5. Doesn't splitting make navigation slower?
// A5. Yes, unless you preload on intent — hover, focus, idle, or viewport.
//     Same import(), started earlier, one cached request.
//
// Q6. How do you handle a failed chunk load?
// A6. Retry with backoff, wrap in an Error Boundary, offer a reload. The usual
//     cause is a deploy invalidating hashed chunks under an open tab.
//
// Q7. Does Suspense catch a rejected import?
// A7. No. Suspense is for pending. Rejected is an Error Boundary.
//
// Q8. When should you NOT split?
// A8. Small components, anything on the critical path, anything needed right
//     after hydration, and anything used by every route.
//
// Q9. Splitting didn't help — what next?
// A9. Analyze the bundle. The weight is probably in the shared vendor chunk,
//     which every route pays. → 08.
//
// Q10. What about SSR?
// A10. React.lazy is client-only in the classic model; frameworks provide their
//      own (next/dynamic) so the chunk can be streamed and hydrated properly.
//      → 05 §8, 14, 15.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What are the three pieces of code splitting in React?
//   Back : import() makes the chunk, lazy() suspends, Suspense shows a fallback.
//
// Flashcard 2:
//   Front: Why is JS the most expensive byte?
//   Back : Download + parse + compile + execute, all on the main thread.
//
// Flashcard 3:
//   Front: First place to split?
//   Back : Routes. Biggest win, lowest risk.
//
// Flashcard 4:
//   Front: What's a lazy waterfall?
//   Back : Nested boundaries — chunk 2's import lives inside chunk 1.
//
// Flashcard 5:
//   Front: How do you make a split navigation feel instant?
//   Back : Preload on hover/focus. Same import(), cached by specifier.
//
// Flashcard 6:
//   Front: "Failed to fetch dynamically imported module" — why?
//   Back : Usually a deploy deleted the hashed chunk an open tab is asking for.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Name the waterfall, preload on intent, and put an Error Boundary
//          OUTSIDE the Suspense boundary.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Take any React app, run the bundle analyzer, and write down the single
//   biggest module. Then split every route and re-measure the entry chunk.
//
// Task 2:
//   Put a Suspense boundary at the root and then around one route. Record both
//   with the network throttled. Watch how much of the page disappears.
//
// Task 3:
//   Build the waterfall deliberately: three nested lazy components. Look at the
//   network waterfall and see the staircase. Then flatten it.
//
// Task 4:
//   Add onMouseEnter preloading to your nav links. Throttle to Slow 4G and feel
//   the difference. Confirm in the network tab it is ONE request, not two.
//
// Task 5:
//   Deploy, keep an old tab open, deploy again with different hashes, then
//   navigate in the old tab. Reproduce the chunk-load error, then fix it with
//   an Error Boundary and a reload button.
//
// Task 6:
//   Split a 40-line component into its own chunk and measure. Confirm for
//   yourself that it was not worth it.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   import() makes the chunk, lazy() suspends, Suspense shows the fallback.
//   Split at routes first.
//
// If you remember the common bug:
//   Nested lazy boundaries create a waterfall, and a deploy makes old chunks
//   404 for open tabs — which Suspense does not catch.
//
// If you remember the professional framing:
//   JavaScript is the expensive byte because it is parsed and executed on the
//   main thread. Split at user boundaries, not per file, and preload on intent
//   so the user never pays for the split.
//
// NEXT TOPIC -> 05_react-lazy.js
