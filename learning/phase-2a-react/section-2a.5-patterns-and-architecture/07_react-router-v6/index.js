// ╔══════════════════════════════════════════════════════════════════╗
// ║        REACT INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ React Router v6 — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to React Phase 2A, Section 2A.5 — Patterns &
// Architecture. It is the SECOND group in this section, following
// ◆ Design Patterns (06_design-patterns/), and it completes both Section
// 2A.5 and Phase 2A as a whole.
//
// Folder:
//   learning/phase-2a-react/section-2a.5-patterns-and-architecture/07_react-router-v6/
//
// Files:
// ├── index.js
// ├── 01_browserrouter-vs-hashrouter.js
// ├── 02_route-params-and-useparams.js
// ├── 03_nested-routes-outlet.js
// ├── 04_protected-routes.js
// ├── 05_redirect-navigate.js
// ├── 06_usenavigate-programmatic-navigation.js
// ├── 07_uselocation-and-usesearchparams.js
// ├── 08_lazy-loaded-routes.js
// ├── 09_loader-and-action-v6-4.js
//
// Study rule:
//   Do not only read. Predict output, run the file, change it, break it,
//   fix it, and then answer the Q&A without hints. Several files here build
//   a WORKING router — a real path compiler, the real ranking algorithm, a
//   real match-chain reducer. Read those implementations; they are shorter
//   than people expect, and knowing how small they are is most of what
//   separates confidence from memorisation.
//
// READ IN ORDER:
//   Nine files, one argument. 01 picks the Router and shows that the choice
//   is a DEPLOYMENT decision, not a React one. 02-03 build the matching
//   engine — patterns to params, then the single fact the rest of the group
//   leans on: matching returns a CHAIN. 04-06 are navigation, in the order
//   the decisions actually arise: who is allowed here, how do we send them
//   away, and how do we move deliberately. 07 reads the parts of the
//   location nothing else touched, and answers "where should this state
//   live". 08-09 close the loop: 08 splits the bundle and accidentally
//   creates a waterfall; 09 removes it — using nothing but the chain 03
//   established.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. BrowserRouter vs HashRouter — the fragment is never sent to the
//     server. The same route produced "GET /users/42/settings" and "GET /",
//     which is a 404 on refresh in one case and a 200 in the other.
// 02. Route params & useParams — every param is a STRING. A === lookup
//     found 0 of 3 users; Number() found 1. And v6 RANKS routes: /users/new
//     beat /users/:id, 24 to 17, despite being written second.
// 03. Nested routes + Outlet — matching returns a CHAIN, not a match. One
//     URL matched 4 routes; the root saw {} params and the leaf saw both.
//     Removing one index route rendered a layout wrapped around null.
// 04. Protected routes — a pathless guard route protects a subtree
//     structurally. Auth has THREE states, and treating it as two redirected
//     a logged-in user on render 1. None of it is security.
// 05. Redirect / Navigate — <Navigate> is a component performing a side
//     effect, which is why it costs 2 render passes and one visible frame
//     where a loader redirect() costs 1 and none.
// 06. useNavigate — `..` climbs ROUTES, not URL segments: /users/42 vs
//     /users/42/posts from the same call. navigate(-1) behaved as "back to
//     the list" in 1 of 4 realistic situations.
// 07. useLocation & useSearchParams — the URL as the store.
//     searchParams.set() changed the object and caused 0 renders; the setter
//     caused 1. Two object-form updates silently lost the first.
// 08. Lazy-loaded routes — 622 KB eager → 67 KB to render the landing page,
//     bought with a waterfall: 700 ms where 400 was possible.
// 09. Loader & Action (v6.4+) — the router knows the chain before rendering
//     it, so three requests took 200 ms instead of 500, and every loader
//     revalidated after a mutation automatically.

const topics = [
  "BrowserRouter vs HashRouter",
  "Route params & useParams",
  "Nested routes + Outlet",
  "Protected routes",
  "Redirect / Navigate",
  "useNavigate + programmatic navigation",
  "useLocation & useSearchParams",
  "Lazy-loaded routes",
  "Loader & Action (v6.4+)",
];

console.log("React Router v6 topic count:", topics.length);
console.log(topics.join(" | "));

// ══════════════════════════════════════════════════════════════════
// THE ARGUMENT THIS SECTION MAKES
// ══════════════════════════════════════════════════════════════════
//
//   01  Before any React question, one deployment question: does the server
//        need to know your routes? BrowserRouter says yes and needs one
//        rewrite rule; HashRouter says no and gives up SSR, SEO, server
//        logs and server-visible query strings to get there. Everything
//        above the Router is byte-for-byte identical either way — which is
//        exactly why files 02-09 never mention it again.
//
//   02  Now the engine. A pattern compiles to a regex, captures become
//        params, and every param is a STRING because a URL has no types.
//        v6 also RANKS routes by specificity rather than source order, which
//        removed an entire class of v5 bug — and made "which route wins" a
//        computable number instead of a code-review convention.
//
//   03  …and matching does not return one route. It returns a CHAIN, root to
//        leaf, rendered by a reduceRight where each parent's <Outlet /> holds
//        the next. THIS is the fact the rest of the group is built on:
//        params inherit downward, layouts do not re-mount between siblings,
//        and — six files later — every loader in the chain can start at once.
//
//   04-06  Three navigation questions, in the order they actually come up.
//        WHO IS ALLOWED HERE (04): a pathless route wrapping a subtree, so
//        protection is structural rather than remembered — plus the two
//        mechanical bugs (missing `replace`, auth-as-a-boolean) and the
//        honest admission that none of it is security.
//        HOW DO WE SEND THEM AWAY (05): <Navigate> is a component performing
//        a side effect, which is both why it is legal and why it costs a
//        render pass.
//        HOW DO WE MOVE DELIBERATELY (06): navigate() — whose relative
//        resolution climbs the ROUTE tree, not the URL, and whose numeric
//        form is the browser's back button rather than your app's.
//
//   07  Then the part everything else read but never wrote: the location
//        itself. useSearchParams is useState with the URL as storage, which
//        buys shareable, bookmarkable, refresh-surviving, back-button-undoable
//        state for free — and costs you two specific bugs, because the value
//        it hands you is mutable and the setter is a real state setter.
//
//   08-09  Finally, performance, as a problem and its answer. 08 splits the
//        bundle at route boundaries — a real 89% cut to first load — and in
//        doing so creates a waterfall, because React.lazy downloads on
//        RENDER. 09 removes it: loaders run on MATCH, and because the router
//        already has 03's chain, every request in it starts simultaneously.
//        The last file's payoff is the third file's fact.
//
// THE PUNCHLINE:
//   Every file here answers some version of "WHO KNOWS WHAT, AND WHEN". The
//   server knows the path but never the fragment (01). The router knows the
//   whole chain before rendering it, and a component knows its own needs only
//   after mounting (03, 08, 09). A guard knows what to render and the server
//   knows what to allow (04). And every bug in the group is someone acting on
//   information they did not actually have yet — a component fetching before
//   it could know its siblings existed, a guard deciding before auth resolved,
//   a redirect firing before React had committed.

// ══════════════════════════════════════════════════════════════════
// THE DECISION LADDER — WHICH TOOL, AND WHEN
// ══════════════════════════════════════════════════════════════════
//
//   Which Router?
//     ...can configure the server    → BrowserRouter + one rewrite rule. (01)
//     ...genuinely cannot            → HashRouter, accepting the SSR/SEO
//                                        table.                          (01)
//     ...a test, or no window at all → MemoryRouter + initialEntries.     (01)
//
//   Reading the URL?
//     ...a path segment              → useParams — and convert + validate,
//                                        because it is a string.          (02)
//     ...the query string            → useSearchParams — treat it as
//                                        read-only.                       (07)
//     ...pathname / key / state      → useLocation.                       (07)
//
//   Where should this state live?
//     ...a pasted link must show it  → a search param.                    (07)
//     ...it describes the NAVIGATION → location state (`from`, scroll).    (06, 07)
//     ...ephemeral and unshareable   → component state.                   (07)
//     ...a token or anything secret  → NEITHER. URLs end up in logs.       (07)
//
//   Sending the user somewhere?
//     ...a function of current state → <Navigate replace />.              (05)
//     ...a reaction to an event      → useNavigate() in the handler.       (06)
//     ...decidable before render     → redirect() from a loader — cheapest
//        (data router)                 of the three.                      (05, 09)
//     ...a genuine "back" affordance → navigate(-1) — and ONLY then.       (06)
//
//   Structuring the tree?
//     ...shared chrome across children → a parent route; it will not
//                                          re-mount.                      (03)
//     ...a wrapper with no URL segment → a pathless route.                (03)
//     ...what renders at the parent's
//        own path                      → an index route, or you get a
//                                          blank Outlet.                  (03)
//     ...gating a whole subtree        → a pathless guard route.          (04)
//
//   Loading data and code?
//     ...splitting a route's code      → route.lazy on a data router;
//                                          React.lazy otherwise.          (08)
//     ...the route's data              → a loader — parallel, cancellable,
//                                          revalidating.                  (09)
//     ...a mutation                    → an action + <Form>.              (09)
//     ...one slow optional piece       → defer() + <Await>.               (09)

// ══════════════════════════════════════════════════════════════════
// THE NUMBERS THIS SECTION PROVES
// ══════════════════════════════════════════════════════════════════
//
//   the same route, two Routers          "GET /users/42/settings" vs "GET /"  (01)
//   refreshing a deep link, no rewrite   404 vs 200                           (01)
//   in-app navigation hitting the server false — which is why the bug ships   (01)
//   /users/42 → useParams().id           "42", a string, always               (02)
//   a === lookup against typed data      0 of 3 found; Number() → 1 of 3      (02)
//   /users/new vs /users/:id             24 vs 17 — static beats dynamic      (02)
//   …with the dynamic route written FIRST it still lost                       (02)
//   a splat vs a dynamic param           12 vs 17 — penalised on purpose      (02)
//   /users/42/posts/7                    matched 4 routes, not 1              (03)
//   params at root vs leaf               {} vs {userId, postId}               (03)
//   navigating between sibling posts     4 of 4 route objects identical       (03)
//   switching to a different leaf        3 of 4 identical — layouts survive   (03)
//   removing one index route             layout rendered around null          (03)
//   a child path with a leading "/"      /settings, not /users/settings 🐛    (03)
//   guard redirect without `replace`     back → protected route → loop        (04)
//   auth as a boolean, render 1          valid session redirected to /login   (04)
//   login without state.from             lands on "/" instead of the target   (04)
//   anonymous vs member on /admin/users  /login vs /forbidden                 (04)
//   navigate() in the render body        fired 2× under StrictMode            (05)
//   …the same call inside an effect      fired once                           (05)
//   a two-step redirect chain, push      4 history entries vs 2               (05)
//   <Navigate> vs loader redirect()      2 render passes vs 1; 1 frame vs 0   (05)
//   navigate("..") from a post           /users/42 (route) vs /users/42/posts (06)
//   navigate(-1) as "back to the list"   correct in 1 of 4 situations         (06)
//   searchParams.set() in place          object changed, 0 renders            (07)
//   …handed to setSearchParams           1 render, URL updated                (07)
//   two updates, object form             page=2 silently lost                 (07)
//   sp.get() on a repeated key           only the first of 2 values           (07)
//   missing vs empty param               null vs ""                           (07)
//   eager bundle vs landing on /         622 KB vs 67 KB — 89% smaller        (08)
//   React.lazy code-then-data            700 ms where 400 was available       (08)
//   Suspense at the root vs the Outlet   0 of 4 levels kept vs 3 of 4         (08)
//   preloading on hover                  250 ms of the wait removed           (08)
//   three nested fetches, on render      120+200+180 = 500 ms                 (09)
//   the same three, as loaders           max(120,200,180) = 200 ms            (09)
//   component state with a loader        3 state vars → 0; 4 branches → 1     (09)
//   loaders re-run after an action       all 3, automatically                 (09)
//   a leaf error vs a middle one         2 layouts survive vs 0               (09)
//
// None of those are quoted. Every one is produced by code in its file.

// ══════════════════════════════════════════════════════════════════
// THE FIVE TRUTHS THAT KEEP RETURNING
// ══════════════════════════════════════════════════════════════════
//
// 1. MATCHING RETURNS A CHAIN, AND THE CHAIN IS THE WHOLE POINT
//    Params inherit down it (03). Guards wrap a slice of it (04). Suspense
//    boundaries belong at a level of it (08). Loaders parallelise across it
//    and revalidate all of it (09). Error elements catch up it (09). Six
//    features, one data structure — which is why 03 is the file to re-read
//    if any later one stops making sense.
//
// 2. A URL HAS NO TYPES, AND IT IS ALL PUBLIC
//    Route params are strings (02). Search params are strings (07). Both
//    need converting AND validating, because a user can type anything. And
//    everything in the URL is visible — to the user, the server, logs,
//    Referer headers and analytics — which is why tokens belong in none of
//    it (07) and why a client-side guard was never security (04).
//
// 3. THE INFORMATION HAS TO EXIST BEFORE THE DECISION
//    A component cannot parallelise fetches it does not know about yet (09).
//    A guard cannot decide while auth is still loading (04). React cannot
//    commit a navigation fired during render (05). Almost every bug in this
//    group is a decision made one step too early.
//
// 4. push RECORDS A USER'S CHOICE; replace CORRECTS THE APP'S
//    Guard redirects (04), redirect chains (05), and rapid search-param
//    updates (07) all need replace — and forgetting it produces the same
//    symptom every time: "your back button is broken". If the user did not
//    choose the navigation, it should not get its own history entry.
//
// 5. THE ROUTE IS THE RIGHT PLACE FOR ROUTE-SHAPED CONCERNS
//    Protection belongs on a route, not repeated per component (04). Code
//    splitting belongs at route boundaries (08). Data requirements belong on
//    routes, which know them in time, rather than in components, which learn
//    them too late (09). Every one of those moves a concern from N places to
//    one — and the one place is the place that already has the information.

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What number did the example produce, and how was it measured?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?

// Section drill — the seven questions this group should let you answer cold:
//   1. BrowserRouter or HashRouter — and what does the answer depend on?
//   2. Why does v6 not care what order you wrote your routes in?
//   3. What does matchRoutes return, and name three features that depend on
//      it being that shape.
//   4. Build a protected route. Then explain why it is not security.
//   5. <Navigate>, useNavigate, or redirect() — for a given case, which, and
//      what does each cost?
//   6. Given a piece of state, decide: URL, location state, or component —
//      and justify it in one sentence.
//   7. Why can a router parallelise fetches that components structurally
//      cannot?

// ─────────────────────────────────────────────────────────────────
// END OF ◆ REACT ROUTER v6 (2A.5, group 2 of 2).
//
// This completes SECTION 2A.5 — PATTERNS & ARCHITECTURE:
//   ◆ Design Patterns    (06_design-patterns/)    — 12 files
//   ◆ React Router v6    (07_react-router-v6/)    —  9 files
//
// …and with it, PHASE 2A — REACT DEEP DIVE in full:
//   2A.1 React Core · 2A.2 Hooks · 2A.3 State Management
//   2A.4 Performance · 2A.5 Patterns & Architecture
//
// NEXT SECTION -> phase-2b-node/section-2b.2-express-js/
// (per the docx: 🟢 EXPRESS.JS — ◆ Express Deep Dive — Middleware concept
// & chain, next(), error-handling middleware (4 args), and the rest)
// ─────────────────────────────────────────────────────────────────
