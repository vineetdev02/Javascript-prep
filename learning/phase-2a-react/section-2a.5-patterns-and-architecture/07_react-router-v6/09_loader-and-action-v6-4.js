// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Router v6  →  09_loader-and-action-v6-4.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Loader & Action (v6.4+)
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: THE ROUTER KNOWS THE
//      WHOLE CHAIN BEFORE RENDERING IT — so every loader can start at once
//   2. The waterfall, killed and measured: 500 ms sequential → 200 ms
//      parallel, drawn as a timeline
//   3. useLoaderData(): the component has no loading state, because data
//      arrives before it does
//   4. Actions, and the thing that surprises people — automatic
//      REVALIDATION of every loader in the chain after a mutation
//   5. Errors: a throw in a loader is caught by the route's errorElement,
//      and the rest of the page survives
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/07_react-router-v6/09_loader-and-action-v6-4.js"
//
// Prerequisites: 03_nested-routes-outlet.js §4 (matching returns a chain —
// the fact this entire file is built on), 08_lazy-loaded-routes.js §4 (which
// created the waterfall problem and pointed here), and 05 §7 (redirect()
// from a loader).
//
// This is the last file of ◆ React Router v6 and the payoff of the whole
// group. 03 said "matching returns an array" and hinted it would matter for
// data loading. 05 showed redirect() running before render. 08 measured a
// waterfall and named loaders as the fix. Here is the mechanism all three
// were pointing at.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// loader:
// A function attached to a route that runs BEFORE that route renders, whose
// return value the component reads synchronously with useLoaderData().
//
// action:
// The same idea for mutations — it runs on a form submission, and when it
// finishes the router automatically re-runs the loaders for the current
// page.
//
// If interviewer says "explain it simply", say:
//   "Instead of a component mounting and then fetching in a useEffect, you
//    declare the data the route needs next to the route. The router matches
//    the URL, sees the whole chain of routes it's about to render, kicks off
//    every loader in parallel, waits, and only then renders — so components
//    receive data that already exists. There's no loading state inside them
//    at all."
//
// If interviewer says "why is that better than useEffect?", say:
//   "Because it removes the waterfall. With fetch-on-render, a child can't
//    start fetching until its parent has rendered, which means it can't
//    start until the parent's fetch finished. Three nested routes needing
//    120, 200 and 180 milliseconds take 500 ms sequentially and 200 in
//    parallel. The router can do that because it knows the entire matched
//    chain before rendering any of it — which components never can."
//
// Why it matters in interviews:
//   This is the render-as-you-fetch versus fetch-on-render distinction, and
//   it's the same idea behind React Server Components and every modern data
//   framework. Understanding WHY the router can parallelise and a component
//   cannot is the transferable part.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   FETCH-ON-RENDER WATERFALLS. RENDER-AS-YOU-FETCH CANNOT.
//
// Runtime rule:
//   On navigation the router (1) matches the URL to a chain (03 §4), (2)
//   calls every matched route's loader IN PARALLEL, (3) waits for all of
//   them, (4) renders the whole chain at once with data already in hand.
//   On a form submission it calls the action first, then re-runs step 2 for
//   the current chain — that's revalidation.
//
// Practical rule:
//   Put a route's data requirement on the route. If a component needs data
//   that its route didn't declare, that's a signal the route boundary is in
//   the wrong place — not a reason to add a useEffect.
//
// Common trap:
//   Assuming a loader replaces a client cache. It doesn't — it re-runs on
//   every navigation to that route. Loaders solve WHEN fetching starts, not
//   how often. Pair them with a cache (React Query, or your own) if
//   deduplication matters.
//
// The mental picture:
//
//   FETCH-ON-RENDER                   RENDER-AS-YOU-FETCH
//   (useEffect in each component)     (loaders on each route)
//
//   render Root ─┐                    match chain ─┬─▶ Root's loader   ┐
//                └▶ fetch ─┐                       ├─▶ User's loader   ├ all
//   render User ───────────┴▶ fetch ─┐             └─▶ Post's loader   ┘ at once
//                                    └▶ …                  │
//   render Post ────────────────────────▶ fetch            ▼
//                                                   render EVERYTHING, once,
//   ▲ each fetch waits for a render                   with data in hand
//     that waits for a fetch


// ══════════════════════════════════════════════════════════════════
// § 3 — THE WATERFALL, AND THE FIX, DRAWN
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the same three requests, two architectures:\n");

// A realistic nested route chain, each level needing its own data.
const matchedChain = [
  { route: "RootLayout", needs: "current user",   ms: 120 },
  { route: "UserLayout", needs: "the user record", ms: 200 },
  { route: "PostDetail", needs: "the post",        ms: 180 },
];

// fetch-on-render: a child cannot render until its parent has data, and it
// cannot fetch until it renders. Each level's start time is the previous
// level's finish time.
function fetchOnRender(chain) {
  let clock = 0;
  const bars = chain.map(r => {
    const bar = { route: r.route, start: clock, end: clock + r.ms };
    clock += r.ms;
    return bar;
  });
  return { bars, total: clock };
}

// loaders: the router has the whole chain at match time, so every loader
// starts immediately. Total time is the SLOWEST one, not the sum.
function loadersInParallel(chain) {
  const bars = chain.map(r => ({ route: r.route, start: 0, end: r.ms }));
  return { bars, total: Math.max(...chain.map(r => r.ms)) };
}

const waterfall = fetchOnRender(matchedChain);
const parallel = loadersInParallel(matchedChain);

const SCALE = 20;   // ms per character
function drawTimeline(result) {
  for (const bar of result.bars) {
    const lead = " ".repeat(Math.round(bar.start / SCALE));
    const bodyWidth = Math.max(1, Math.round((bar.end - bar.start) / SCALE));
    console.log("      " + bar.route.padEnd(12) + lead + "█".repeat(bodyWidth) +
      "  " + bar.start + "–" + bar.end + " ms");
  }
}

console.log("    ❌ fetch-on-render — a useEffect inside each component:");
drawTimeline(waterfall);
console.log("      " + " ".repeat(12) + "total: " + waterfall.total + " ms  (the requests ADD UP)");

console.log("\n    ✅ loaders — declared on each route, run by the router:");
drawTimeline(parallel);
console.log("      " + " ".repeat(12) + "total: " + parallel.total + " ms  (only the SLOWEST one counts)");

const savedMs = waterfall.total - parallel.total;
console.log("\n      saved: " + savedMs + " ms — " +
  ((savedMs / waterfall.total) * 100).toFixed(0) + "% of the wait, with the same three requests");

console.log("\n    Why components structurally CANNOT do this: <PostDetail> does not exist");
console.log("    until <UserLayout> has rendered it, and <UserLayout> does not render its");
console.log("    children until it has something to render them with. The information");
console.log("    needed to start all three fetches at once — 'these three routes are about");
console.log("    to render' — only exists at the ROUTER level, and only after matching.");
console.log("    That is 03 §4's chain, finally being used for something. \n");


// ══════════════════════════════════════════════════════════════════
// § 4 — useLoaderData(): NO LOADING STATE IN THE COMPONENT
// ══════════════════════════════════════════════════════════════════

console.log("§4 — what disappears from a component when its route has a loader:\n");

// A faithful model of the two component shapes.
function componentShapeWithEffect() {
  return {
    stateVariables: ["data", "isLoading", "error"],
    branchesToRender: ["loading", "error", "empty", "success"],
    effects: 1,
    racesToWorryAbout: ["stale response after params change", "setState after unmount"],
  };
}
function componentShapeWithLoader() {
  return {
    stateVariables: [],
    branchesToRender: ["success"],
    effects: 0,
    racesToWorryAbout: [],
  };
}

const withEffect = componentShapeWithEffect();
const withLoader = componentShapeWithLoader();

console.log("      what the component contains".padEnd(34) + "useEffect".padEnd(14) + "loader");
console.log("      " + "─".repeat(72));
console.log("      " + "state variables".padEnd(34) + String(withEffect.stateVariables.length).padEnd(14) + withLoader.stateVariables.length);
console.log("      " + "render branches".padEnd(34) + String(withEffect.branchesToRender.length).padEnd(14) + withLoader.branchesToRender.length);
console.log("      " + "effects".padEnd(34) + String(withEffect.effects).padEnd(14) + withLoader.effects);
console.log("      " + "race conditions to handle".padEnd(34) + String(withEffect.racesToWorryAbout.length).padEnd(14) + withLoader.racesToWorryAbout.length);

console.log("\n      the useEffect version must handle :", JSON.stringify(withEffect.branchesToRender));
console.log("      the loader version must handle    :", JSON.stringify(withLoader.branchesToRender));

console.log("\n    ❌  function PostDetail() {");
console.log("          const [post, setPost] = useState(null);");
console.log("          const [loading, setLoading] = useState(true);");
console.log("          const [error, setError] = useState(null);");
console.log("          useEffect(() => { /* fetch, setState, handle unmount */ }, [id]);");
console.log("          if (loading) return <Spinner/>;");
console.log("          if (error) return <Error/>;");
console.log("          return <article>{post.title}</article>;");
console.log("        }");
console.log("\n    ✅  export async function loader({ params }) {");
console.log("          return getPost(params.postId);        // throw → §6 handles it");
console.log("        }");
console.log("        function PostDetail() {");
console.log("          const post = useLoaderData();          // already here");
console.log("          return <article>{post.title}</article>;");
console.log("        }");

console.log("\n    The loading state has not been hidden — it has MOVED, to the router,");
console.log("    where one implementation serves every route. useNavigation() exposes it");
console.log("    for a global progress bar:");
console.log("      const { state } = useNavigation();   // 'idle' | 'loading' | 'submitting'");
console.log("\n    And the race conditions are genuinely gone, not relocated: the router");
console.log("    cancels a superseded navigation's loaders, so a slow response for a route");
console.log("    the user already left can never overwrite fresher data. That bug class —");
console.log("    'I clicked three users quickly and the wrong one rendered' — stops");
console.log("    existing rather than needing an AbortController in every component.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — ACTIONS, AND AUTOMATIC REVALIDATION
// ══════════════════════════════════════════════════════════════════

console.log("§5 — what happens after a mutation, without you wiring anything:\n");

// The router's post-action sequence, modelled.
function submitViaAction(chain) {
  const timeline = [];
  timeline.push("<Form method='post'> submitted → router calls the route's ACTION");
  timeline.push("action runs: POST /api/posts/7/comments");
  timeline.push("action returns (or redirects — 05 §7)");
  timeline.push("router REVALIDATES: re-runs every loader in the current chain, in parallel");
  const revalidated = chain.map(r => r.route);
  timeline.push("re-render with fresh data for all " + revalidated.length + " levels");
  return { timeline, revalidated };
}

// The manual equivalent, which is what you write without actions.
function submitManually(chain) {
  const timeline = [];
  timeline.push("onSubmit handler → setSubmitting(true)");
  timeline.push("fetch POST /api/posts/7/comments");
  timeline.push("await response, handle errors by hand");
  timeline.push("now… which caches are stale? YOU decide:");
  timeline.push("  refetch the comment list          ← easy to remember");
  timeline.push("  refetch the post (comment count!) ← easy to FORGET 🐛");
  timeline.push("  refetch the user (activity feed?) ← almost never remembered 🐛");
  timeline.push("setSubmitting(false)");
  return { timeline, revalidated: ["(whatever you remembered)"] };
}

const viaAction = submitViaAction(matchedChain);
const viaHandler = submitManually(matchedChain);

console.log("    ✅ with an action:");
for (const t of viaAction.timeline) console.log("      " + t);
console.log("      → loaders re-run:", JSON.stringify(viaAction.revalidated), "— ALL of them, automatically");

console.log("\n    ❌ with an onSubmit handler:");
for (const t of viaHandler.timeline) console.log("      " + t);
console.log("      → loaders re-run:", JSON.stringify(viaHandler.revalidated));

console.log("\n    Revalidation is the feature people underestimate. The staleness bug it");
console.log("    prevents is specific and extremely common: you post a comment, the list");
console.log("    updates because you remembered to refetch it, and the 'N comments' count");
console.log("    in the header above it still says the old number — because that count");
console.log("    came from a DIFFERENT loader, at a different level of the chain, and");
console.log("    nobody thought about it.");
console.log("\n    The router does not have to think about it. It re-runs the whole chain,");
console.log("    in parallel, because it already knows what the whole chain is.");

console.log("\n    Two more things <Form> gives you over a hand-written onSubmit:");
console.log("      • it works before JavaScript loads — it is a real <form> with a real");
console.log("        method and action, progressively enhanced. The onSubmit version is");
console.log("        inert until the bundle arrives.");
console.log("      • useNavigation().state becomes 'submitting', so the pending UI is the");
console.log("        same mechanism as navigation — one implementation, not two.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — ERRORS: A THROW IS A ROUTE-LEVEL EVENT
// ══════════════════════════════════════════════════════════════════

console.log("§6 — one loader fails. How much of the page survives?\n");

// Each route may declare an errorElement. A thrown error propagates UP the
// chain to the NEAREST one — exactly like an error boundary, but resolved
// against the route tree rather than the component tree.
const routeTree = [
  { route: "RootLayout", hasErrorElement: true },
  { route: "UserLayout", hasErrorElement: false },
  { route: "PostDetail", hasErrorElement: true },
];

function whereDoesTheErrorLand(failingRouteName, tree) {
  const failIndex = tree.findIndex(r => r.route === failingRouteName);
  for (let i = failIndex; i >= 0; i--) {
    if (tree[i].hasErrorElement) {
      return {
        caughtAt: tree[i].route,
        stillRendered: tree.slice(0, i).map(r => r.route),
        replaced: tree.slice(i).map(r => r.route),
      };
    }
  }
  return { caughtAt: "(none — the whole app blanks)", stillRendered: [], replaced: tree.map(r => r.route) };
}

const leafFailed = whereDoesTheErrorLand("PostDetail", routeTree);
const middleFailed = whereDoesTheErrorLand("UserLayout", routeTree);

console.log("    route tree, with errorElement declared on Root and PostDetail:\n");
console.log("      the LEAF's loader throws (PostDetail):");
console.log("        caught by      :", leafFailed.caughtAt, "— its OWN errorElement");
console.log("        still on screen:", JSON.stringify(leafFailed.stillRendered), "✅ the layouts survive");
console.log("        replaced       :", JSON.stringify(leafFailed.replaced));

console.log("\n      a MIDDLE loader throws (UserLayout, which has no errorElement):");
console.log("        caught by      :", middleFailed.caughtAt, "— propagated UP to the nearest one");
console.log("        still on screen:", JSON.stringify(middleFailed.stillRendered));
console.log("        replaced       :", JSON.stringify(middleFailed.replaced), "🐛 more of the page is lost");

console.log("\n    The lesson is the same as error boundaries generally (06_design-patterns/");
console.log("    08): errorElement placement is a BLAST RADIUS decision. One at the root");
console.log("    catches everything and loses everything; one per meaningful section keeps");
console.log("    the shell alive and confines the failure.");

console.log("\n    Inside an errorElement, useRouteError() gives you what was thrown — and");
console.log("    the idiomatic thing to throw is a Response, so status codes survive:");
console.log("      if (!post) throw new Response('Not Found', { status: 404 });");
console.log("      // then: const error = useRouteError();");
console.log("      //       isRouteErrorResponse(error) && error.status === 404");
console.log("\n    That is the same Response-shaped convention as redirect() (05 §7) — the");
console.log("    data router deliberately models loaders on server request handling, so");
console.log("    'return data', 'return a redirect' and 'throw a status' all look like");
console.log("    things a server would do.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHAT LOADERS ARE NOT
// ══════════════════════════════════════════════════════════════════
//
// Being precise here prevents the most common disappointment:
//
//   ❌ NOT a cache. A loader re-runs on every navigation to its route. Two
//      visits to the same URL = two fetches. If you need deduplication,
//      stale-while-revalidate, or background refresh, pair loaders with a
//      real cache (React Query et al.) and have the loader read through it.
//
//   ❌ NOT server-side rendering. Loaders run in the browser on a client
//      data router. They are the same IDEA as server loaders in a framework
//      like Remix or Next's App Router, which is why the pattern transfers —
//      but a client loader is still a client fetch.
//
//   ❌ NOT a replacement for component state. Anything ephemeral — a form's
//      draft text, an open dropdown — stays where it was (07 §7).
//
//   ❌ NOT available without a data router. loader/action/errorElement need
//      createBrowserRouter (or the equivalent). The JSX <BrowserRouter> +
//      <Routes> form does not support them, which is the actual migration
//      cost of adopting them.
//
// And what they ARE, in one line: a way to move data requirements from
// components — which learn about them too late — to routes, which know
// about them in time.


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES (AND FIXES)
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A page that takes the SUM of its requests instead of the max:
//   fetch-on-render across nested components. Loaders fix it structurally.
//   → §3.
//
// Bug 2 — Clicking three items quickly and the wrong one rendering: a slow
//   response for an abandoned route overwriting fresher state. The router
//   cancels superseded loaders; a useEffect needs an AbortController per
//   component. → §4.
//
// Bug 3 — A comment posted, the list updates, and the header count stays
//   stale: manual refetching remembered one cache and forgot another.
//   Revalidation re-runs the whole chain. → §5.
//
// Bug 4 — A form that does nothing until the JS bundle loads: an onSubmit
//   handler instead of <Form>, which is a real form and works before
//   hydration. → §5.
//
// Bug 5 — A single loader failure blanking the entire application: no
//   errorElement, or only one at the root. → §6.
//
// Bug 6 — A 404 rendered as a generic "something went wrong": the loader
//   threw an Error instead of a Response, so the status code was lost. → §6.
//
// Bug 7 — Expecting loaders to deduplicate and being surprised by double
//   fetches on repeat visits: they are not a cache. → §7.
//
// Bug 8 — Adding a loader to a JSX <Routes> app and finding it never runs:
//   loaders require a data router. → §7.
//
// Bug 9 — Putting a slow, optional request in a loader and blocking the
//   whole page on it: the router waits for ALL loaders. Use defer() and
//   <Await> for data that should stream in after the shell.
//
// Bug 10 — Keeping useEffect fetching in components while also having
//   loaders: two data systems, two loading states, and the waterfall is
//   back for the useEffect half.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The waterfall:
assert(waterfall.total === 500,
  "fetch-on-render made the three requests ADD UP: 120 + 200 + 180 = 500 ms 🐛");
assert(parallel.total === 200,
  "…loaders ran them in parallel, so only the slowest (200 ms) counted ✅");
assert(savedMs === 300 && parallel.total === Math.max(...matchedChain.map(r => r.ms)),
  "…300 ms saved, and the parallel total is exactly the max, not the sum");
assert(waterfall.bars[1].start === waterfall.bars[0].end,
  "…in the waterfall, each level STARTED where the previous one finished — that is the definition");
assert(parallel.bars.every(b => b.start === 0),
  "…while every loader started at 0 ms, because the router knew the whole chain up front");

// The component shape:
assert(withEffect.stateVariables.length === 3 && withLoader.stateVariables.length === 0,
  "the useEffect version needs data/isLoading/error; the loader version needs none ✅");
assert(withEffect.branchesToRender.length === 4 && withLoader.branchesToRender.length === 1,
  "…four render branches collapse to one — the component only handles success");
assert(withEffect.racesToWorryAbout.length > 0 && withLoader.racesToWorryAbout.length === 0,
  "…and the race conditions are eliminated, not relocated: the router cancels superseded loaders");

// Revalidation:
assert(viaAction.revalidated.length === matchedChain.length,
  "after an action, EVERY loader in the chain re-ran — all " + matchedChain.length + " levels ✅");
assert(viaHandler.revalidated.length === 1 && viaHandler.revalidated[0].includes("remembered"),
  "…whereas a manual handler refetches only what the developer thought of 🐛");

// Errors:
assert(leafFailed.caughtAt === "PostDetail" && leafFailed.stillRendered.length === 2,
  "a leaf loader failure was caught by its own errorElement, keeping both layouts on screen ✅");
assert(middleFailed.caughtAt === "RootLayout" && middleFailed.stillRendered.length === 0,
  "…a failure at a level with NO errorElement propagated up, costing more of the page 🐛");
assert(leafFailed.stillRendered.length > middleFailed.stillRendered.length,
  "…so errorElement placement is a blast-radius decision, exactly like error boundaries");

console.log("§9 — mini assertions passed for: Loader & Action (v6.4+)");
console.log("\n  The pair that captures it: the identical three requests took " + waterfall.total + " ms as");
console.log("  useEffects inside nested components and " + parallel.total + " ms as loaders on the same");
console.log("  routes — and after a mutation the router re-ran all " + viaAction.revalidated.length + " loaders");
console.log("  automatically, which is the staleness bug nobody remembers to fix by hand.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what are loaders and actions in React Router 6.4+?", answer:
//
//   "A loader is a function you attach to a route that runs BEFORE that
//    route renders, and the component reads its result synchronously with
//    useLoaderData. An action is the same idea for mutations — it runs on a
//    form submission.
//
//    The reason they exist is to kill the fetch-on-render waterfall. With
//    useEffect-based fetching, a child component can't start fetching until
//    it renders, and it can't render until its parent has data — so three
//    nested routes needing 120, 200 and 180 milliseconds take 500 ms,
//    because the times add up. The router doesn't have that constraint: it
//    matches the URL to the whole chain of routes first, so it knows all
//    three routes are about to render before rendering any of them, and it
//    starts every loader in parallel. Same three requests, 200 ms — the max
//    instead of the sum. That's structural, not an optimisation: the
//    information needed to parallelise only exists at the router level.
//
//    What it does to components is almost more valuable. A component with a
//    loader has no data state, no isLoading, no error state, and no effect —
//    it renders one branch instead of four, because the data is already
//    there. And the classic race — clicking three items quickly and the
//    wrong one rendering — stops existing, because the router cancels
//    superseded loaders instead of every component needing its own
//    AbortController.
//
//    Actions add the piece people underestimate: revalidation. After an
//    action completes, the router automatically re-runs every loader in the
//    current chain. That fixes the staleness bug where you post a comment,
//    remember to refetch the comment list, and forget that the 'N comments'
//    count in the header came from a different loader at a different level.
//    The router doesn't have to remember — it re-runs the whole chain
//    because it already knows what the chain is. And because <Form> is a
//    real form, it works before the JS bundle loads.
//
//    Errors follow the same route-shaped logic: a throw in a loader is
//    caught by the nearest errorElement up the chain, so placement is a
//    blast-radius decision like error boundaries. Throwing a Response rather
//    than an Error preserves the status code, which is deliberate — the
//    whole data-router API is modelled on server request handling.
//
//    The honest limits: loaders aren't a cache, they re-run on every
//    navigation, they're still client-side fetches, and they require
//    createBrowserRouter — the JSX Routes form doesn't support them, which
//    is the real migration cost."
//
// Leading with "the router knows the chain before rendering it" and deriving
// parallelism, cancellation and revalidation from that one fact is what
// makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. When does a loader run?
// A1. After matching, before rendering — for every matched route in the
//     chain, in parallel.
//
// Q2. Why can loaders parallelise when components can't?
// A2. The router knows the whole matched chain before rendering. A component
//     doesn't exist until its parent renders it.
//
// Q3. What's the measured difference?
// A3. Sequential adds the times (120+200+180 = 500 ms); parallel takes the
//     max (200 ms).
//
// Q4. What disappears from a component that has a loader?
// A4. The data/loading/error state, the effect, three of four render
//     branches, and the fetch race conditions.
//
// Q5. Where did the loading state go?
// A5. To the router — useNavigation().state, one implementation for every
//     route.
//
// Q6. What is revalidation?
// A6. After an action completes, the router re-runs every loader in the
//     current chain automatically.
//
// Q7. What bug does that prevent?
// A7. Partial staleness — refetching the list you thought of and missing a
//     count or summary that came from a different loader.
//
// Q8. Why <Form> instead of onSubmit?
// A8. It's a real form, so it works before hydration, and its pending state
//     flows through the same useNavigation mechanism.
//
// Q9. Where does a thrown loader error land?
// A9. The nearest errorElement up the route chain — placement is a
//     blast-radius decision.
//
// Q10. Why throw a Response instead of an Error?
// A10. It preserves the status code, so a 404 can be handled as a 404 via
//      isRouteErrorResponse.
//
// Q11. Are loaders a cache?
// A11. No — they re-run on every navigation. Pair with a real cache if you
//      need deduplication.
//
// Q12. What if one loader is slow and optional?
// A12. defer() plus <Await>, so the shell renders and that piece streams in
//      rather than blocking everything.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: When do loaders run?
//   Back : After matching, before rendering — all of them, in parallel.
//
// Flashcard 2:
//   Front: Why can't components parallelise the same fetches?
//   Back : A child doesn't exist until its parent renders, which requires
//          the parent's data.
//
// Flashcard 3:
//   Front: Sequential vs parallel, measured?
//   Back : The sum (500 ms) vs the max (200 ms) for the same three requests.
//
// Flashcard 4:
//   Front: What does useLoaderData remove from a component?
//   Back : data/isLoading/error state, the effect, and the fetch races.
//
// Flashcard 5:
//   Front: What is revalidation?
//   Back : After an action, every loader in the chain re-runs automatically.
//
// Flashcard 6:
//   Front: Why <Form> over onSubmit?
//   Back : It's a real form — works pre-hydration, and shares the pending
//          state mechanism.
//
// Flashcard 7:
//   Front: Where does a loader throw land?
//   Back : The nearest errorElement up the chain. Throw a Response to keep
//          the status.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "The router knows the chain before rendering it — parallelism,
//          cancellation and revalidation all follow from that."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Take a nested page that fetches in three components and draw its
//   waterfall in the network tab. Then convert to loaders and re-measure.
//
// Task 2:
//   Click rapidly between three detail routes with useEffect fetching and
//   reproduce the wrong-item-renders race. Confirm loaders don't have it.
//
// Task 3:
//   Post a comment with a manual handler and find one piece of UI that goes
//   stale. Then convert to an action and confirm revalidation fixes it.
//
// Task 4:
//   Disable JavaScript and submit a <Form>. Then do the same with an
//   onSubmit handler.
//
// Task 5:
//   Throw a Response with status 404 from a loader and handle it with
//   isRouteErrorResponse in an errorElement.
//
// Task 6:
//   Move an errorElement from the leaf to the root and observe how much more
//   of the page disappears on the same failure.
//
// Task 7:
//   Add defer() + <Await> for one slow, optional request and confirm the
//   shell renders before it resolves.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The router knows the entire matched chain before rendering any of it.
//   Parallel loading, request cancellation and full-chain revalidation are
//   all consequences of that single fact.
//
// If you remember the common bug:
//   Fetch-on-render turning three parallel-able requests into a sequence —
//   500 ms where 200 was available.
//
// If you remember the professional framing:
//   Data requirements belong on routes, not in components. Components learn
//   what they need too late to fetch it well; routes know in time.
//
// ─────────────────────────────────────────────────────────────────
// END OF ◆ REACT ROUTER v6 (2A.5, group 2 of 2).
//
// This completes SECTION 2A.5 — PATTERNS & ARCHITECTURE, and with it
// PHASE 2A — REACT DEEP DIVE in full:
//   2A.1 React Core · 2A.2 Hooks · 2A.3 State Management
//   2A.4 Performance · 2A.5 Patterns & Architecture
//
// NEXT SECTION -> phase-2b-node/section-2b.2-express-js/
// (per the docx: 🟢 EXPRESS.JS — ◆ Express Deep Dive)
// ─────────────────────────────────────────────────────────────────
