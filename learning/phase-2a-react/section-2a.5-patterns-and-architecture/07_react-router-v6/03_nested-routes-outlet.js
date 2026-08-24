// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Router v6  →  03_nested-routes-outlet.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Nested routes + Outlet
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: MATCHING PRODUCES A
//      CHAIN, NOT A MATCH — one URL matches N routes at once
//   2. <Outlet /> is where the child renders, and rendering is a
//      reduceRight over that chain — implemented, not described
//   3. Params accumulate DOWN the chain: the root sees {}, the leaf sees
//      everything (the claim file 02 §7 made, now proven)
//   4. Index routes — and the blank-page bug you get without one
//   5. Relative vs absolute child paths: a single leading "/" breaks the
//      child out of its parent entirely
//   6. Pathless layout routes and useOutletContext
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/07_react-router-v6/03_nested-routes-outlet.js"
//
// Prerequisites: 02_route-params-and-useparams.js — this file reuses that
// file's matcher and ranking, and pays off the promise its §7 made about
// params being inherited from ancestor routes.
//
// 02 treated routing as "one URL → one component". That was a simplification
// good enough to explain params and ranking. It is not how React Router v6
// actually works: one URL matches a CHAIN of routes, root to leaf, and each
// one renders the next inside its own <Outlet />. Every layout you have ever
// built with a persistent sidebar or header is that chain.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Nested routes:
// Routes defined as a TREE, where a URL matches a whole branch of that tree
// at once, and each matched route renders the next one down inside its
// <Outlet /> — so shared layout lives in the parent and never re-mounts when
// only the child changes.
//
// If interviewer says "explain it simply", say:
//   "Instead of one route rendering one page, a URL like /users/42/posts/7
//    matches four routes at once: the root layout, the users layout, the
//    user layout, and the post. Each parent renders `<Outlet />` where its
//    child should go. The result is nested UI that matches the nested URL —
//    and the outer layers stay mounted while you navigate between inner
//    ones."
//
// If interviewer says "why does that matter beyond tidiness?", say:
//   "Because the parent doesn't re-mount. Navigating from
//    /users/42/posts/7 to /users/42/posts/9 re-renders only the innermost
//    route — the sidebar keeps its scroll position, the layout keeps its
//    state, and any data the parent loaded isn't re-fetched. Flat routing
//    throws all of that away on every navigation."
//
// Why it matters in interviews:
//   "Matching returns an array" is the sentence that separates people who
//   have configured React Router from people who understand it. Every
//   feature in the rest of this group — guards that wrap a subtree (04),
//   lazy boundaries per level (08), loaders that run in parallel across the
//   chain (09) — only makes sense once you know the match is a chain.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   ONE URL, MANY MATCHES. <Outlet /> IS THE HOLE THE NEXT ONE FILLS.
//
// Runtime rule:
//   The route tree is flattened into BRANCHES (every root-to-leaf path),
//   each branch is scored (02 §5) and the best genuine match wins. The
//   winner is an ARRAY of matches. Rendering is a reduceRight over that
//   array: build the innermost element first, then wrap it in its parent,
//   then that parent's parent — each wrapping step supplying the child as
//   the parent's `outlet`.
//
// Practical rule:
//   Put in a parent route anything that should survive navigation between
//   its children: layout chrome, a sidebar, a tab bar, a data fetch shared
//   by every child. Put in a child anything that should be replaced.
//
// Common trap:
//   Defining a parent with children but no index route, then navigating to
//   the parent's own path and getting a layout with a blank hole in it. No
//   error, no warning, just an empty <Outlet />. §6 reproduces it exactly.
//
// The mental picture:
//
//   route tree                          URL: /users/42/posts/7
//   ──────────                          ─────────────────────
//   /                RootLayout   ──┐
//     users          UsersLayout  ──┤  matched CHAIN, root → leaf
//       :userId      UserLayout   ──┤  (4 matches, not 1)
//         posts/:postId  Post     ──┘
//
//   rendered by reduceRight:
//
//   RootLayout
//     └─ <Outlet/> → UsersLayout
//                      └─ <Outlet/> → UserLayout
//                                       └─ <Outlet/> → Post
//
//   navigate to /users/42/posts/9 → only Post re-renders.
//   The three layouts above it are the SAME component instances.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE ENGINE: A TREE FLATTENS INTO BRANCHES
// ══════════════════════════════════════════════════════════════════

console.log("§3 — a route tree, flattened into every root-to-leaf branch:\n");

function joinPaths(parentPath, childPath) {
  if (childPath === undefined || childPath === "") return parentPath || "/";
  if (childPath.startsWith("/")) return childPath;          // ← absolute child: ignores the parent. §7
  const base = parentPath === "/" ? "" : (parentPath || "");
  return (base + "/" + childPath).replace(/\/+/g, "/");
}

function flattenRoutes(routes, parentPath = "", parentChain = []) {
  const branches = [];
  for (const route of routes) {
    // an index route has no path of its own — it lives AT the parent's path
    const path = route.index ? (parentPath || "/") : joinPaths(parentPath, route.path);
    const chain = [...parentChain, { route, pathAtLevel: path }];

    if (route.children && route.children.length) {
      branches.push(...flattenRoutes(route.children, path, chain));
      // a parent with children can ALSO match on its own, rendering an
      // empty <Outlet /> — this branch is what §6's bug is made of.
      branches.push({ path, chain, isIndex: false, parentOnly: true });
    } else {
      branches.push({ path, chain, isIndex: !!route.index, parentOnly: false });
    }
  }
  return branches;
}

// Route config as a plain object tree — the same shape createBrowserRouter
// takes, and exactly what JSX <Route> elements compile down to.
const routes = [
  { path: "/", element: "RootLayout", children: [
    { index: true, element: "Home" },
    { path: "users", element: "UsersLayout", children: [
      { index: true, element: "UserList" },
      { path: ":userId", element: "UserLayout", children: [
        { index: true, element: "UserProfile" },
        { path: "posts/:postId", element: "Post" },
      ]},
    ]},
  ]},
];

const branches = flattenRoutes(routes);
console.log("    the tree above flattens into", branches.filter(b => !b.parentOnly).length, "leaf branches (+",
  branches.filter(b => b.parentOnly).length, "parent-only):\n");
for (const b of branches.filter(b => !b.parentOnly)) {
  console.log("      " + b.path.padEnd(30) + (b.isIndex ? "(index) " : "        ") +
    b.chain.map(c => c.route.element).join(" → "));
}

console.log("\n    Read the right-hand column: each branch is a CHAIN of components, not");
console.log("    one component. That is the fact this whole file rests on.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — MATCHING RETURNS AN ARRAY, AND PARAMS ACCUMULATE
// ══════════════════════════════════════════════════════════════════

console.log("§4 — one URL, four matches, and params flowing down the chain:\n");

const paramRe = /^:\w+$/;
const isSplat = (s) => s === "*";
function computeScore(path, isIndex = false) {
  const seg = path.split("/");
  let score = seg.length;
  if (seg.some(isSplat)) score -= 2;
  if (isIndex) score += 2;
  return seg.filter(s => !isSplat(s))
    .reduce((a, s) => a + (paramRe.test(s) ? 3 : s === "" ? 1 : 10), score);
}

function compilePath(path) {
  const names = [];
  const src = "^" + path
    .replace(/^\/*/, "/")
    .replace(/[\\.*+^${}|()[\]]/g, "\\$&")
    .replace(/\/:(\w+)/g, (_, n) => { names.push(n); return "/([^\\/]+)"; }) + "\\/*$";
  return { re: new RegExp(src), names };
}

function matchPath(pattern, pathname) {
  const { re, names } = compilePath(pattern);
  const m = pathname.match(re);
  if (!m) return null;
  const params = {};
  names.forEach((n, i) => { params[n] = decodeURIComponent(m[i + 1]); });
  return { params };
}

function matchRoutes(routeTree, pathname) {
  const ranked = flattenRoutes(routeTree)
    .map(b => ({ ...b, score: computeScore(b.path, b.isIndex) }))
    .sort((a, b) => b.score - a.score || (a.parentOnly ? 1 : -1));

  for (const branch of ranked) {
    const full = matchPath(branch.path, pathname);
    if (!full) continue;
    // Each level receives only the params ITS OWN cumulative path declares —
    // which is exactly how React Router builds match.params per level.
    return branch.chain.map(({ route, pathAtLevel }, depth) => {
      const declared = compilePath(pathAtLevel).names;
      const params = {};
      for (const name of declared) params[name] = full.params[name];
      return { route, params, pathAtLevel, depth };
    });
  }
  return null;
}

const chain = matchRoutes(routes, "/users/42/posts/7");

console.log("    URL: /users/42/posts/7");
console.log("    matchRoutes() returned an ARRAY of length", chain.length + ":\n");
console.log("      depth  component     pattern at that level          params visible there");
console.log("      " + "─".repeat(78));
for (const m of chain) {
  console.log("        " + m.depth + "    " + m.route.element.padEnd(14) +
    m.pathAtLevel.padEnd(31) + JSON.stringify(m.params));
}

console.log("\n    This is 02 §7's promise, proven: params ACCUMULATE going down. RootLayout");
console.log("    sees {}, UserLayout sees userId, and only Post — the leaf — sees both.");
console.log("    A child never has to be handed its parent's params as props; it inherits");
console.log("    them from the matched chain for free.");
console.log("\n    And the shadowing footgun from 02 §7 is now concrete: if two levels both");
console.log("    declared `:id`, the deeper one would overwrite the shallower one in the");
console.log("    merged object. Name them `:userId` and `:postId`, never `:id` twice.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — <Outlet /> IS A reduceRight
// ══════════════════════════════════════════════════════════════════

console.log("§5 — how the chain becomes nested UI:\n");

// This is React Router's renderMatches, faithfully: fold the array from the
// RIGHT, so the innermost element is built first and each parent wraps it.
function renderMatches(matches) {
  return matches.reduceRight(
    (outlet, match) => ({ element: match.route.element, params: match.params, outlet }),
    null   // ← the innermost route's <Outlet /> has nothing to render
  );
}

function describeTree(node, indent = 0) {
  const pad = "      " + "  ".repeat(indent);
  if (node === null) return pad + "(nothing — <Outlet /> rendered null)\n";
  let out = pad + node.element +
    (Object.keys(node.params).length ? "   " + JSON.stringify(node.params) : "") + "\n";
  out += pad + "  └─ <Outlet /> renders:\n" + describeTree(node.outlet, indent + 2);
  return out;
}

const rendered = renderMatches(chain);
console.log(describeTree(rendered));

console.log("    The whole implementation is one reduceRight. Nothing else is needed:");
console.log("      matches.reduceRight((outlet, match) =>");
console.log("        <RouteContext.Provider value={{ outlet, match }}>");
console.log("          {match.route.element}");
console.log("        </RouteContext.Provider>, null)");
console.log("\n    …and <Outlet /> is a component that does nothing but read `outlet` from");
console.log("    that context and render it. That is the entire mechanism.");

// The re-mount claim, made concrete. Two different navigations, so the
// difference between "same route, new params" and "different leaf route"
// is visible rather than asserted.
const chainA = matchRoutes(routes, "/users/42/posts/7");
const chainB = matchRoutes(routes, "/users/42/posts/9");   // sibling POST — same branch
const chainC = matchRoutes(routes, "/users/42");            // the user's index — different leaf

const sharedAB = chainA.filter((m, i) => chainB[i] && chainB[i].route === m.route).length;
const sharedAC = chainA.filter((m, i) => chainC[i] && chainC[i].route === m.route).length;

console.log("\n    navigation 1 — /users/42/posts/7 → /users/42/posts/9 (a sibling post):");
console.log("      chain length, before and after :", chainA.length, "and", chainB.length);
console.log("      route objects IDENTICAL        :", sharedAB, "of", chainA.length, "← the WHOLE chain");
console.log("      what actually changed          : only params —",
  JSON.stringify(chainA[3].params), "→", JSON.stringify(chainB[3].params));
console.log("      → not one component re-mounts. Both URLs matched the SAME branch;");
console.log("        React sees the same element types in the same positions.");

console.log("\n    navigation 2 — /users/42/posts/7 → /users/42 (a different leaf route):");
console.log("      chain length, before and after :", chainA.length, "and", chainC.length);
console.log("      route objects IDENTICAL        :", sharedAC, "of", chainA.length, "← the first three");
console.log("      leaf changed                   :", chainA[3].route.element, "→", chainC[3].route.element);
console.log("      → the three LAYOUTS above it are still the same route objects, so they");
console.log("        stay mounted. Only the leaf is swapped out.");

console.log("\n    That is the whole payoff of nesting: in both cases the layout chain");
console.log("    survives. The sidebar keeps its scroll position, the layout keeps its");
console.log("    state, and a data fetch living in a parent does not re-run. → file 09\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — INDEX ROUTES, AND THE BLANK-PAGE BUG WITHOUT ONE
// ══════════════════════════════════════════════════════════════════

console.log("§6 — what renders at the parent's OWN path:\n");

const withIndex = [
  { path: "/users", element: "UsersLayout", children: [
    { index: true, element: "UserList" },
    { path: ":id", element: "User" },
  ]},
];
const withoutIndex = [
  { path: "/users", element: "UsersLayout", children: [
    { path: ":id", element: "User" },
  ]},
];

const renderedWithIndex = renderMatches(matchRoutes(withIndex, "/users"));
const renderedWithoutIndex = renderMatches(matchRoutes(withoutIndex, "/users"));

console.log("    URL /users, WITH an index route:");
console.log(describeTree(renderedWithIndex));
console.log("    URL /users, WITHOUT an index route (identical config otherwise):");
console.log(describeTree(renderedWithoutIndex));

const deepStillWorks = renderMatches(matchRoutes(withoutIndex, "/users/42"));
console.log("    …and the DEEP url still works fine either way:");
console.log(describeTree(deepStillWorks));

console.log("    That middle case is the bug: the layout renders, the outlet is null, and");
console.log("    the user sees chrome wrapped around nothing. Nothing throws. Nothing warns.");
console.log("    It is only visible at the parent's exact path — every deeper URL looks");
console.log("    perfect, which is why it reaches production.");
console.log("\n    An index route is the answer to 'what should render when the URL is");
console.log("    exactly the parent's path?'. It has `index: true` and NO path of its own,");
console.log("    which is why it cannot have children — there is no deeper URL for them");
console.log("    to live at.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — RELATIVE VS ABSOLUTE CHILD PATHS
// ══════════════════════════════════════════════════════════════════

console.log("§7 — one leading slash changes everything:\n");

const relativeChild = [
  { path: "/users", element: "UsersLayout", children: [
    { path: "settings", element: "Settings" },        // relative — appended
  ]},
];
const absoluteChild = [
  { path: "/users", element: "UsersLayout", children: [
    { path: "/settings", element: "Settings" },       // ABSOLUTE — replaces
  ]},
];

const relPath = flattenRoutes(relativeChild).find(b => !b.parentOnly).path;
const absPath = flattenRoutes(absoluteChild).find(b => !b.parentOnly).path;

console.log("    child path \"settings\"   → full pattern:", JSON.stringify(relPath), " ✅ nested under the parent");
console.log("    child path \"/settings\"  → full pattern:", JSON.stringify(absPath), "     🐛 escaped the parent entirely");

const relMatch = matchRoutes(relativeChild, "/users/settings");
const absMatchAtUsers = matchRoutes(absoluteChild, "/users/settings");

console.log("\n    navigating to /users/settings:");
console.log("      with the relative child → matched chain:",
  relMatch ? relMatch.map(m => m.route.element).join(" → ") : "null 🐛");
console.log("      with the absolute child → matched chain:",
  absMatchAtUsers ? absMatchAtUsers.map(m => m.route.element).join(" → ") : "null  🐛 nothing matches");

console.log("\n    Child paths are RELATIVE by default, and that is almost always what you");
console.log("    want — it is what makes a subtree portable: change the parent's path from");
console.log("    /users to /people and every descendant follows automatically.");
console.log("\n    A leading slash opts out of that. It is occasionally deliberate (a route");
console.log("    that must live at a fixed URL regardless of where it sits in the tree)");
console.log("    and much more often a typo that silently produces an unreachable route.");
console.log("    Note what the failure looks like: not an error — just a URL that matches");
console.log("    nothing, and a route that can never be reached from where you expected.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — PATHLESS LAYOUT ROUTES, AND useOutletContext
// ══════════════════════════════════════════════════════════════════

console.log("§8 — a route with no path at all, and passing data through the hole:\n");

// A pathless route contributes an ELEMENT to the chain without contributing
// anything to the URL. It is how you wrap a subset of siblings in shared
// chrome (or a guard — file 04) without inventing a URL segment for it.
const pathlessLayout = [
  { path: "/", element: "Root", children: [
    { element: "AuthedLayout", children: [                 // ← no `path` key
      { path: "dashboard", element: "Dashboard" },
      { path: "settings", element: "Settings" },
    ]},
    { path: "login", element: "Login" },
  ]},
];

for (const b of flattenRoutes(pathlessLayout).filter(b => !b.parentOnly)) {
  console.log("      " + b.path.padEnd(14) + b.chain.map(c => c.route.element).join(" → "));
}

console.log("\n    AuthedLayout wraps /dashboard and /settings but adds NOTHING to either");
console.log("    URL — the paths are still /dashboard and /settings, not /authed/dashboard.");
console.log("    /login is a sibling and is deliberately outside it. That is exactly the");
console.log("    shape a route guard takes. → file 04");

// useOutletContext: the parent hands a value to whatever fills its Outlet.
function renderWithOutletContext(matches, contextByDepth = {}) {
  return matches.reduceRight((outlet, match) => ({
    element: match.route.element,
    outletContext: contextByDepth[match.depth] ?? null,
    // what the CHILD receives is the value its PARENT supplied
    received: null,
    outlet,
  }), null);
}

const ctxChain = matchRoutes(pathlessLayout, "/dashboard");
const withCtx = renderWithOutletContext(ctxChain, { 1: { user: "ada", theme: "dark" } });

// walk down and attach what each level actually received from above
(function propagate(node, fromParent) {
  if (!node) return;
  node.received = fromParent;
  propagate(node.outlet, node.outletContext ?? fromParent);
})(withCtx, null);

console.log("\n    <Outlet context={{ user, theme }} /> from AuthedLayout (depth 1):");
(function show(node, indent = 0) {
  if (!node) return;
  console.log("      " + "  ".repeat(indent) + node.element.padEnd(14) +
    "useOutletContext() → " + JSON.stringify(node.received));
  show(node.outlet, indent + 1);
})(withCtx);

console.log("\n    useOutletContext() is the escape hatch for 'the layout already has this");
console.log("    data, the child needs it, and I don't want to prop-drill or add a whole");
console.log("    context provider for one value'. It is a plain context read under the");
console.log("    hood — 06_design-patterns/05's provider pattern, scoped to one Outlet.\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A layout renders with a blank hole in the middle at the parent's
//   own URL: no index route. Every deeper URL looks fine, which is why it
//   ships. → §6.
//
// Bug 2 — A child route that can never be reached: its path started with
//   "/" and escaped the parent's prefix entirely. No error — just a URL
//   that matches nothing. → §7.
//
// Bug 3 — A sidebar that loses its scroll position (or a layout that loses
//   state) on every navigation: the shared chrome is inside the CHILD
//   route instead of the parent, so it re-mounts every time. → §5.
//
// Bug 4 — A parent's data re-fetching on every child navigation: same root
//   cause as 3 — the fetch lives in a component that re-mounts. Move it up
//   the chain, or use a loader on the parent route. → §5, file 09.
//
// Bug 5 — A child reading the wrong `:id`: the same param name was used at
//   two nesting levels and the deeper one shadows the shallower. → §4.
//
// Bug 6 — Prop-drilling a param three levels down that was already
//   available for free: every match in the chain inherits its ancestors'
//   params. → §4.
//
// Bug 7 — Inventing a URL segment purely to hang a layout on
//   (/authed/dashboard instead of /dashboard): a PATHLESS route gives you
//   the wrapper without touching the URL. → §8.
//
// Bug 8 — An index route given children, or a path: an index route is
//   defined by having no path — there is no deeper URL for children to
//   occupy. → §6.
//
// Bug 9 — Renaming a parent's path and breaking every descendant: only
//   happens if the children used absolute paths. Relative children follow
//   automatically. → §7.
//
// Bug 10 — Assuming useParams() in a LAYOUT sees a child's params: it sees
//   only what its own level's pattern declared. RootLayout sees {} even
//   when the leaf sees two params. → §4.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The chain:
assert(Array.isArray(chain) && chain.length === 4,
  "one URL matched FOUR routes — matching returns a chain, not a match ✅");
assert(chain.map(m => m.route.element).join(">") === "RootLayout>UsersLayout>UserLayout>Post",
  "…and the chain runs root → leaf, in tree order");

// Params accumulate:
assert(Object.keys(chain[0].params).length === 0,
  "the ROOT match sees no params at all — its pattern declares none");
assert(chain[2].params.userId === "42" && chain[2].params.postId === undefined,
  "UserLayout sees userId (its own) but NOT postId (declared deeper) ✅");
assert(chain[3].params.userId === "42" && chain[3].params.postId === "7",
  "…and only the LEAF sees both — params accumulate downward, as 02 §7 promised");

// Outlet / reduceRight:
assert(rendered.element === "RootLayout" && rendered.outlet.element === "UsersLayout",
  "reduceRight produced correctly nested UI: root wraps its child");
assert(rendered.outlet.outlet.outlet.element === "Post" && rendered.outlet.outlet.outlet.outlet === null,
  "…all the way to the leaf, whose own <Outlet /> renders null");
assert(sharedAB === 4 && chainA[3].params.postId !== chainB[3].params.postId,
  "navigating between two posts matched the IDENTICAL 4-route chain — only params differed, nothing re-mounts ✅");
assert(sharedAC === 3 && chainA[3].route !== chainC[3].route,
  "…and switching to a different leaf kept the 3 layouts above it identical — only the leaf swapped ✅");

// Index routes:
assert(renderedWithIndex.outlet !== null && renderedWithIndex.outlet.element === "UserList",
  "WITH an index route, /users renders the layout AND fills its outlet ✅");
assert(renderedWithoutIndex !== null && renderedWithoutIndex.outlet === null,
  "WITHOUT one, the identical URL renders the layout with a NULL outlet — a blank hole 🐛");
assert(deepStillWorks.outlet.element === "User",
  "…while every deeper URL still works perfectly, which is exactly why the bug ships");

// Relative vs absolute:
assert(relPath === "/users/settings",
  "a relative child path is appended to its parent's ✅");
assert(absPath === "/settings",
  "…a leading slash makes it ABSOLUTE and discards the parent prefix entirely 🐛");
assert(relMatch !== null && absMatchAtUsers === null,
  "so /users/settings matches with the relative child and matches NOTHING with the absolute one 🐛");

// Pathless layout:
const pathlessBranches = flattenRoutes(pathlessLayout).filter(b => !b.parentOnly).map(b => b.path);
assert(pathlessBranches.includes("/dashboard") && !pathlessBranches.some(p => p.includes("authed")),
  "a pathless route contributes an ELEMENT to the chain and NOTHING to the URL ✅");
assert(withCtx.outlet.outlet.received && withCtx.outlet.outlet.received.user === "ada",
  "useOutletContext delivered the parent's value to the component filling its Outlet ✅");

console.log("§10 — mini assertions passed for: Nested routes + Outlet");
console.log("\n  The pair that captures it: /users/42/posts/7 matched " + chain.length + " routes at once,");
console.log("  where the root saw " + JSON.stringify(chain[0].params) + " and the leaf saw " + JSON.stringify(chain[3].params) + " — and");
console.log("  removing a single index route turned a working page into a layout wrapped");
console.log("  around null, with every deeper URL still rendering perfectly.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do nested routes and Outlet work in React Router v6?",
// answer:
//
//   "The key fact is that matching returns an ARRAY, not a single match. A
//    URL like /users/42/posts/7 matches four routes at once — the root
//    layout, the users layout, the user layout, and the post — and that
//    whole chain is what gets rendered. Each parent renders `<Outlet />`
//    where its child should appear, and the implementation is literally a
//    reduceRight over the match array: build the innermost element, then
//    wrap it in its parent, then that parent's parent, passing the child
//    down as the parent's outlet.
//
//    Two things fall out of that. First, params accumulate going down: the
//    root match sees an empty params object, the user layout sees userId,
//    and only the leaf sees both userId and postId. So a child inherits its
//    ancestors' params for free and you never prop-drill them. The flip side
//    is that reusing the same param name at two depths means the deeper one
//    shadows the shallower — which is why you name them userId and postId,
//    not id and id.
//
//    Second, and this is the practical payoff people miss: navigating
//    between siblings doesn't re-mount the parents. Going from posts/7 to
//    posts/9, three of the four matched routes are the same route objects,
//    so React keeps those component instances mounted. The sidebar keeps its
//    scroll position, the layout keeps its state, and a data fetch living in
//    a parent doesn't re-run. Flat routing throws all of that away on every
//    navigation.
//
//    Two gotchas I'd flag. An index route answers 'what renders when the URL
//    is exactly the parent's path?' — and without one, navigating to the
//    parent's own path renders the layout with a null Outlet. A blank hole,
//    no error, no warning, and every deeper URL still works perfectly, which
//    is exactly why it reaches production. And child paths are relative by
//    default — a single leading slash makes a child absolute, discarding the
//    parent prefix, which usually produces a route that can never be reached
//    from where you intended.
//
//    There's also a pathless route — a route with an element and children but
//    no path — which contributes a wrapper to the chain without adding
//    anything to the URL. That's the natural shape for a layout that only
//    covers some siblings, and it's exactly how a route guard is built."
//
// Leading with "matching returns an array" and then deriving inheritance,
// non-re-mounting, and the index-route bug from it is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does matchRoutes return for a nested URL?
// A1. An array of matches, root → leaf — one entry per matched route in the
//     branch, not a single match.
//
// Q2. What is <Outlet /> actually doing?
// A2. Reading the current route context's `outlet` value and rendering it.
//     The nesting itself is a reduceRight over the match array.
//
// Q3. Which params does a middle-of-the-chain layout see?
// A3. Only the ones its own cumulative pattern declares — not its
//     children's. The root typically sees {}.
//
// Q4. What happens to a layout component when you navigate between two of
//     its children?
// A4. Nothing — it stays mounted. Only the differing part of the chain
//     re-renders, which is why layout state and scroll position survive.
//
// Q5. What is an index route for?
// A5. It renders at the parent's exact path. Without one, that URL renders
//     the layout with a null Outlet.
//
// Q6. Can an index route have children or a path?
// A6. No — it's defined by having no path, so there's no deeper URL for
//     children to occupy.
//
// Q7. Are child paths relative or absolute by default?
// A7. Relative. A leading slash makes them absolute and discards the parent
//     prefix.
//
// Q8. Why is relative-by-default the right default?
// A8. It makes a subtree portable — rename the parent's path and every
//     descendant follows automatically.
//
// Q9. What is a pathless route?
// A9. A route with an element and children but no path — it adds a wrapper
//     to the chain without adding anything to the URL. The standard shape
//     for guards and partial layouts.
//
// Q10. How do you pass data from a layout to whatever fills its Outlet?
// A10. `<Outlet context={value} />` and `useOutletContext()` in the child —
//      a scoped context read, no prop drilling.
//
// Q11. Two routes both declare `:id` at different depths. What does the
//      leaf's useParams() return?
// A11. The deeper one shadows the shallower in the merged object — a real
//      reason to use distinct names.
//
// Q12. Why does knowing the match is a chain matter for data loading?
// A12. Because loaders across the chain can run in PARALLEL rather than
//      waterfalling — the router knows every route that will render before
//      rendering any of them. → file 09.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What does matching return in v6?
//   Back : An array of matches, root → leaf — a chain, not one match.
//
// Flashcard 2:
//   Front: How is nested UI actually built?
//   Back : reduceRight over the match array, each parent wrapping its child
//          as `outlet`.
//
// Flashcard 3:
//   Front: Which params does a parent layout see?
//   Back : Only what its own pattern declares — params accumulate downward.
//
// Flashcard 4:
//   Front: Do parents re-mount when a child route changes?
//   Back : No — same route objects, same instances. Layout state survives.
//
// Flashcard 5:
//   Front: What is an index route?
//   Back : What renders at the parent's exact path. No path of its own.
//
// Flashcard 6:
//   Front: Symptom of a missing index route?
//   Back : Layout renders with a null Outlet — a blank hole, no error.
//
// Flashcard 7:
//   Front: What does a leading "/" on a child path do?
//   Back : Makes it absolute — discards the parent prefix entirely.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "Matching returns an array — inheritance, non-re-mounting, and
//          parallel loaders all follow from that one fact."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add a `/users/:userId/posts` index route to §3's tree and print the new
//   branch list. Predict the chain before running it.
//
// Task 2:
//   Delete an index route from a real app and navigate to the parent path.
//   Confirm the blank hole, then add it back.
//
// Task 3:
//   Change one child path to start with "/" and find every URL that stops
//   working. Note that nothing throws.
//
// Task 4:
//   Move a data fetch from a child route into its parent and measure how
//   many times it runs while navigating between three siblings.
//
// Task 5:
//   Build a pathless layout route that wraps three siblings, and confirm
//   none of their URLs changed.
//
// Task 6:
//   Use `<Outlet context={...} />` + useOutletContext to replace a
//   three-level prop drill in code you own.
//
// Task 7:
//   Deliberately reuse `:id` at two nesting levels and log useParams() at
//   each. Confirm the shadowing, then rename them properly.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Matching returns a CHAIN. <Outlet /> is a reduceRight over it, and
//   everything else — inherited params, layouts that don't re-mount,
//   parallel loaders — follows from that.
//
// If you remember the common bug:
//   A missing index route producing a layout wrapped around null, at
//   exactly one URL, while every deeper URL renders perfectly.
//
// If you remember the professional framing:
//   Put in a parent whatever should survive navigation between its
//   children. That single decision is what nested routing is FOR.
//
// NEXT TOPIC -> 04_protected-routes.js
