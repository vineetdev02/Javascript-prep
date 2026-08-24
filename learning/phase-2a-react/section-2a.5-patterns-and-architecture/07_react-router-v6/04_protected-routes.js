// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Router v6  →  04_protected-routes.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Protected routes
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: A CLIENT-SIDE GUARD IS
//      UX, NOT SECURITY — the route config ships in the bundle
//   2. The guard as a pathless layout route (03 §8), not a wrapper around
//      every single element
//   3. Why `replace` is not optional: without it the back button lands the
//      user in a redirect loop — reproduced, with the history stack printed
//   4. AUTH HAS THREE STATES, not two — and checking only "is there a user"
//      kicks a logged-in user to /login on the very first render
//   5. Returning the user to where they were going, via location state
//   6. Role-based guards, and why they compose rather than nest
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/07_react-router-v6/04_protected-routes.js"
//
// Prerequisites: 03_nested-routes-outlet.js — specifically §8's pathless
// layout route, which is the shape every guard in this file takes, and §5's
// "the parent stays mounted", which is why a guard placed once at the top of
// a subtree does not re-run on every child navigation.
//
// 03 ended by saying a pathless route "is exactly the shape a route guard
// takes". This file is that claim cashed in — plus the three mistakes that
// turn a working guard into a redirect loop, a logged-out user, or a
// security assumption that was never true.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// A protected route:
// A route whose element checks some condition — usually authentication —
// and either renders its children (<Outlet />) or redirects, implemented as
// an ordinary route in the tree rather than as a special router feature.
//
// If interviewer says "explain it simply", say:
//   "React Router has no built-in concept of a protected route. You build
//    one out of pieces you already have: a pathless layout route whose
//    element checks auth and returns either <Outlet /> for the children or
//    <Navigate to='/login' replace /> if not allowed. Everything nested
//    under it is protected by construction."
//
// If interviewer says "is that secure?", say:
//   "No — and that's the important part. The route config, including which
//    paths exist and what the guard checks, is in the JavaScript bundle the
//    user downloaded. Anyone can read it, and anyone can call the API
//    directly without ever loading my app. A client-side guard controls what
//    the UI SHOWS. The server has to independently enforce what the user is
//    allowed to READ and DO, on every request. The guard is UX; the
//    authorization is server-side, always."
//
// Why it matters in interviews:
//   This question tests two things at once: whether you can compose router
//   primitives into a feature the library deliberately doesn't ship, and
//   whether you understand the trust boundary. A candidate who describes a
//   perfect guard and never mentions that it isn't security has answered
//   half the question.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   THE GUARD DECIDES WHAT RENDERS. THE SERVER DECIDES WHAT'S ALLOWED.
//
// Runtime rule:
//   A guard is just a route element. It runs during render, reads auth state
//   from context, and returns one of three things: the children (<Outlet />),
//   a redirect (<Navigate />), or a loading state. Because it sits in the
//   matched chain (03 §4), everything below it in the tree is behind it —
//   and because parents don't re-mount (03 §5), it doesn't re-run when the
//   user navigates between protected children.
//
// Practical rule:
//   One guard, placed once, as a pathless layout route wrapping the whole
//   protected subtree. Not a <RequireAuth> wrapper repeated around every
//   individual element — that's the same check written N times, and the
//   Nth one will eventually be forgotten.
//
// Common trap:
//   Treating auth as a boolean when it is a THREE-state machine: loading,
//   authenticated, anonymous. Code that asks `if (!user) redirect` treats
//   "still checking" as "definitely logged out" and bounces a perfectly
//   valid session to the login page on first render. §5 reproduces it.
//
// The mental picture:
//
//   <Route element={<RequireAuth />}>          ← pathless: adds NO url segment
//     <Route path="/dashboard" …/>             ← protected
//     <Route path="/settings"  …/>             ← protected
//   </Route>
//   <Route path="/login" …/>                   ← sibling, deliberately outside
//
//   RequireAuth renders:
//        status === "loading"  → <Spinner />
//        user                  → <Outlet />          (children render)
//        otherwise             → <Navigate to="/login" replace
//                                          state={{ from: location }} />
//
//   …and NONE of that stops anyone from calling GET /api/reports directly.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE GUARD IS A PATHLESS ROUTE, AND IT WRAPS A SUBTREE
// ══════════════════════════════════════════════════════════════════

console.log("§3 — where the guard sits in the route tree:\n");

function joinPaths(parentPath, childPath) {
  if (childPath === undefined || childPath === "") return parentPath || "/";
  if (childPath.startsWith("/")) return childPath;
  const base = parentPath === "/" ? "" : (parentPath || "");
  return (base + "/" + childPath).replace(/\/+/g, "/");
}

function flattenRoutes(routes, parentPath = "", parentChain = []) {
  const branches = [];
  for (const route of routes) {
    const path = route.index ? (parentPath || "/") : joinPaths(parentPath, route.path);
    const chain = [...parentChain, route];
    if (route.children && route.children.length) {
      branches.push(...flattenRoutes(route.children, path, chain));
    } else {
      branches.push({ path, chain });
    }
  }
  return branches;
}

const appRoutes = [
  { path: "/", element: "RootLayout", children: [
    { index: true, element: "Home" },
    { path: "login", element: "Login" },                      // OUTSIDE the guard
    { element: "RequireAuth", children: [                      // ← pathless guard
      { path: "dashboard", element: "Dashboard" },
      { path: "settings", element: "Settings" },
      { element: "RequireAdmin", children: [                   // ← nested guard
        { path: "admin/users", element: "AdminUsers" },
      ]},
    ]},
  ]},
];

const branches = flattenRoutes(appRoutes);
console.log("      URL".padEnd(22) + "matched chain");
console.log("      " + "─".repeat(74));
for (const b of branches) {
  console.log("      " + b.path.padEnd(16) + b.chain.map(r => r.element).join(" → "));
}

const guardedPaths = branches.filter(b => b.chain.some(r => r.element === "RequireAuth")).map(b => b.path);
const openPaths = branches.filter(b => !b.chain.some(r => r.element === "RequireAuth")).map(b => b.path);

console.log("\n      protected (RequireAuth in the chain):", JSON.stringify(guardedPaths));
console.log("      open      (no guard in the chain)   :", JSON.stringify(openPaths));

console.log("\n    Three things this shape gets right:");
console.log("      • the guard adds NOTHING to the URLs — /dashboard is still /dashboard,");
console.log("        not /authed/dashboard. That is what pathless means. (03 §8)");
console.log("      • protection is STRUCTURAL: a new route added inside that block is");
console.log("        protected automatically, with no extra code and nothing to forget.");
console.log("      • /login is a SIBLING, deliberately outside — a guard that also");
console.log("        covered the login page would redirect to itself forever.");
console.log("\n    And guards nest naturally: /admin/users passes through RequireAuth AND");
console.log("    RequireAdmin, in that order, because the chain runs root → leaf. Each one");
console.log("    only has to answer its own question. → §7\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — WHY `replace` IS NOT OPTIONAL
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the back button, with and without replace:\n");

function createHistory(initial = ["/"]) {
  const entries = [...initial];
  let index = entries.length - 1;
  return {
    push(to) { entries.length = index + 1; entries.push(to); index = entries.length - 1; },
    replace(to) { entries[index] = to; },
    back() { if (index > 0) index--; },
    get current() { return entries[index]; },
    get entries() { return [...entries]; },
  };
}

function simulateGuardedVisit({ useReplace }) {
  const history = createHistory(["/"]);
  const isAuthenticated = false;

  history.push("/dashboard");                 // user clicks a protected link
  const beforeGuard = history.entries;

  if (!isAuthenticated) {                     // the guard fires during render
    if (useReplace) history.replace("/login");
    else history.push("/login");
  }
  const afterGuard = history.entries;

  history.back();                             // the user presses BACK
  const landedOn = history.current;
  // landing back on the protected route means the guard fires again → loop
  const loops = landedOn === "/dashboard";

  return { beforeGuard, afterGuard, landedOn, loops };
}

const withoutReplace = simulateGuardedVisit({ useReplace: false });
const withReplace = simulateGuardedVisit({ useReplace: true });

console.log("    <Navigate to=\"/login\" />            (no replace):");
console.log("      history after the guard fires :", JSON.stringify(withoutReplace.afterGuard));
console.log("      user presses BACK, lands on   :", JSON.stringify(withoutReplace.landedOn));
console.log("      guard fires again?            :", withoutReplace.loops,
  withoutReplace.loops ? "🐛 → redirected to /login again → back → /dashboard → …" : "");

console.log("\n    <Navigate to=\"/login\" replace />    (correct):");
console.log("      history after the guard fires :", JSON.stringify(withReplace.afterGuard));
console.log("      user presses BACK, lands on   :", JSON.stringify(withReplace.landedOn));
console.log("      guard fires again?            :", withReplace.loops, withReplace.loops ? "" : "✅ back works normally");

console.log("\n    The mechanism, stated plainly: the user never CHOSE to visit /login —");
console.log("    the app decided that for them. So /login should take the place of the");
console.log("    entry they were on, not add a new one. push() records a decision the");
console.log("    user made; replace() corrects one the app made.");
console.log("\n    The symptom users report is 'the back button is broken on your site' —");
console.log("    which is exactly what an unescapable two-entry loop feels like. 🐛\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — AUTH HAS THREE STATES, AND THE BUG FROM PRETENDING IT HAS TWO
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the render that happens BEFORE the token check finishes:\n");

// A realistic sequence: the app boots, checks a stored token asynchronously,
// and the user genuinely IS logged in. Two renders happen.
const renderSequence = [
  { render: 1, status: "loading", user: null },        // token check in flight
  { render: 2, status: "authenticated", user: { id: 1, name: "Ada", role: "admin" } },
];

// 🐛 the two-state guard: "no user object" is treated as "logged out"
function twoStateGuard(auth) {
  return auth.user ? "render <Outlet/>" : "redirect to /login";
}

// ✅ the three-state guard: "still checking" is its own answer
function threeStateGuard(auth) {
  if (auth.status === "loading") return "render <Spinner/>";
  return auth.user ? "render <Outlet/>" : "redirect to /login";
}

const twoStateOutcomes = renderSequence.map(twoStateGuard);
const threeStateOutcomes = renderSequence.map(threeStateGuard);

console.log("    the user IS logged in. Their session is valid. Two renders occur:\n");
console.log("      render  auth state          two-state guard          three-state guard");
console.log("      " + "─".repeat(76));
renderSequence.forEach((a, i) => {
  console.log("        " + a.render + "     " + a.status.padEnd(20) +
    twoStateOutcomes[i].padEnd(24) + threeStateOutcomes[i]);
});

const twoStateRedirectedValidUser = twoStateOutcomes[0].startsWith("redirect");
const threeStateRedirectedValidUser = threeStateOutcomes[0].startsWith("redirect");

console.log("\n      kicked a VALID session to /login:", twoStateRedirectedValidUser, "vs",
  threeStateRedirectedValidUser, twoStateRedirectedValidUser ? "🐛 vs ✅" : "");

console.log("\n    What the user actually experiences with the two-state guard: they open");
console.log("    a bookmark, get bounced to the login screen, and by the time they've");
console.log("    read it the auth check has resolved — so logging in 'works instantly',");
console.log("    or the app flickers back. Either way they were never logged out.");
console.log("\n    And it is timing-dependent, which is why it survives review: with a warm");
console.log("    cache the check may resolve before first paint and the bug is invisible.");
console.log("    On a cold load, a slow network, or a throttled CPU, it appears every time.");
console.log("\n    The fix is not a spinner. The fix is MODELLING THE THIRD STATE — once");
console.log("    `loading` is a real value the guard must handle, the compiler (or your");
console.log("    own switch) stops you from forgetting it:");
console.log("      type AuthState =");
console.log("        | { status: 'loading' }");
console.log("        | { status: 'authenticated'; user: User }");
console.log("        | { status: 'anonymous' };\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — SENDING THE USER BACK WHERE THEY WERE GOING
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the difference between a guard and a good guard:\n");

// <Navigate> can carry location state. The login page reads it and, on
// success, navigates there instead of to a hardcoded default.
function guardedLoginFlow({ preserveDestination }) {
  const attempted = "/dashboard/reports?range=90d";

  // guard: <Navigate to="/login" replace state={{ from: location }} />
  const navigateState = preserveDestination ? { from: attempted } : undefined;

  // login page, after a successful submit:
  //   const to = location.state?.from ?? "/";
  //   navigate(to, { replace: true });
  const landsOn = (navigateState && navigateState.from) || "/";

  return { attempted, stateSent: navigateState ?? null, landsOn, correct: landsOn === attempted };
}

const withoutState = guardedLoginFlow({ preserveDestination: false });
const withState = guardedLoginFlow({ preserveDestination: true });

console.log("    the user was trying to reach:", JSON.stringify(withoutState.attempted));
console.log("\n      without state={{ from: location }}:");
console.log("        state sent to /login :", JSON.stringify(withoutState.stateSent));
console.log("        after logging in     :", JSON.stringify(withoutState.landsOn),
  withoutState.correct ? "" : "🐛 dumped at the homepage, has to navigate again");
console.log("\n      with state={{ from: location }}:");
console.log("        state sent to /login :", JSON.stringify(withState.stateSent));
console.log("        after logging in     :", JSON.stringify(withState.landsOn),
  withState.correct ? "✅ exactly where they were headed, query string included" : "");

console.log("\n    Two details that make this work properly:");
console.log("      • pass the whole `location`, not just pathname — otherwise the query");
console.log("        string and hash are lost, and ?range=90d was the whole point of the");
console.log("        link someone shared.");
console.log("      • navigate to it with { replace: true } as well, so /login does not");
console.log("        stay in the history behind the page the user just reached. §4's rule");
console.log("        applies on the way back too.");
console.log("\n    And one to be careful about: `from` comes from location state, which a");
console.log("    user can influence. Redirecting to a value you did not validate is an");
console.log("    open-redirect if it can ever be an absolute URL. Only ever navigate to a");
console.log("    PATH you recognise, never to an arbitrary string from state. 🐛\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — ROLE-BASED GUARDS COMPOSE
// ══════════════════════════════════════════════════════════════════

console.log("§7 — two guards in one chain, each answering one question:\n");

function runGuardChain(chain, auth) {
  const steps = [];
  for (const routeElement of chain) {
    if (routeElement === "RequireAuth") {
      if (auth.status === "loading") { steps.push("RequireAuth → <Spinner/>"); return { steps, outcome: "spinner" }; }
      if (!auth.user) { steps.push("RequireAuth → redirect /login"); return { steps, outcome: "redirect:/login" }; }
      steps.push("RequireAuth → <Outlet/> ✓");
    } else if (routeElement === "RequireAdmin") {
      if (auth.user.role !== "admin") { steps.push("RequireAdmin → redirect /forbidden"); return { steps, outcome: "redirect:/forbidden" }; }
      steps.push("RequireAdmin → <Outlet/> ✓");
    } else {
      steps.push("render <" + routeElement + "/>");
    }
  }
  return { steps, outcome: "rendered" };
}

const adminBranch = branches.find(b => b.path === "/admin/users").chain.map(r => r.element);
const anonymous = { status: "anonymous", user: null };
const normalUser = { status: "authenticated", user: { id: 2, role: "member" } };
const adminUser = { status: "authenticated", user: { id: 1, role: "admin" } };

for (const [label, auth] of [["anonymous", anonymous], ["member", normalUser], ["admin", adminUser]]) {
  const result = runGuardChain(adminBranch, auth);
  console.log("    " + label.padEnd(10) + "→ " + result.outcome);
  for (const s of result.steps) console.log("                 " + s);
  console.log("");
}

console.log("    Each guard answers exactly ONE question and knows nothing about the");
console.log("    other. RequireAuth never checks roles; RequireAdmin never checks whether");
console.log("    there is a user — it can assume one, because it only ever renders inside");
console.log("    RequireAuth's Outlet. That assumption is guaranteed by the TREE, not by");
console.log("    a convention someone has to remember.");
console.log("\n    Note the two failures are genuinely different: an anonymous user gets");
console.log("    /login (you need to identify yourself), a member gets /forbidden (we know");
console.log("    who you are and the answer is no). Collapsing both into /login is a small");
console.log("    but real UX bug — it asks a logged-in user to log in again.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — WHY NONE OF THIS IS SECURITY
// ══════════════════════════════════════════════════════════════════

console.log("§8 — what an attacker sees, and what actually stops them:\n");

// The route table — including every protected path and what the guard
// checks — is compiled into the JS bundle the browser downloads.
const whatShipsToTheBrowser = {
  everyRoutePath: branches.map(b => b.path),
  guardLogic: "if (!user) redirect('/login')",
  roleNamesReferenced: ["admin"],
};

console.log("    in the JavaScript bundle any visitor can download and read:");
console.log("      every route path      :", JSON.stringify(whatShipsToTheBrowser.everyRoutePath));
console.log("      the guard's own logic :", JSON.stringify(whatShipsToTheBrowser.guardLogic));
console.log("      role names it checks  :", JSON.stringify(whatShipsToTheBrowser.roleNamesReferenced));

// And the API does not require the app at all.
const apiCallsThatBypassTheGuardEntirely = [
  "curl https://api.example.com/admin/users",
  "fetch('/api/admin/users') from the devtools console",
  "React DevTools: set the auth context's user to { role: 'admin' }",
  "a breakpoint on the guard, edit `user` in the scope panel, resume",
];

console.log("\n    ways to reach protected DATA without ever passing the guard:");
for (const method of apiCallsThatBypassTheGuardEntirely) console.log("      • " + method);

const guardStopsUiRender = true;
const guardStopsApiAccess = false;

console.log("\n      guard prevents the UI from rendering :", guardStopsUiRender, "✅ that is its job");
console.log("      guard prevents access to the data    :", guardStopsApiAccess, "🐛 it never could");

console.log("\n    So the correct framing, and the one interviewers are listening for:");
console.log("      the client-side guard is UX — it stops a user seeing a broken page they");
console.log("      have no data for, and sends them somewhere useful instead.");
console.log("      the SERVER independently authorises every request, every time, on its");
console.log("      own copy of who the user is. If you deleted the guard entirely, the app");
console.log("      would be uglier and exactly as secure.");
console.log("\n    A useful test for any protected route you build: if this guard were");
console.log("    removed, what could someone actually GET? If the answer is 'real data',");
console.log("    the vulnerability was always on the server. → Phase 3, Web Security\n");


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "The back button is broken": <Navigate> without `replace`, so
//   back returns to the protected route, which redirects again. → §4.
//
// Bug 2 — A logged-in user bounced to /login on every cold load: the guard
//   treated "still checking the token" as "logged out". Timing-dependent,
//   so it looks fine on a warm cache. → §5.
//
// Bug 3 — A flash of protected content before the redirect: the reverse of
//   Bug 2 — rendering children while auth is still loading, then
//   redirecting. Either way, the third state was unhandled. → §5.
//
// Bug 4 — Users always land on the homepage after logging in, losing the
//   link they clicked: no `state={{ from: location }}`. → §6.
//
// Bug 5 — The destination is preserved but the query string isn't: only
//   `location.pathname` was saved instead of the whole location. → §6.
//
// Bug 6 — An open redirect: navigating to `location.state.from` without
//   validating it, when it can be an absolute URL to another origin. → §6.
//
// Bug 7 — A new protected page that isn't protected: the guard was a
//   per-route wrapper repeated N times and someone added the N+1th route
//   without it. A pathless parent route makes this structurally impossible.
//   → §3.
//
// Bug 8 — An infinite redirect because /login is itself inside the guarded
//   subtree: the login route must be a sibling, outside. → §3.
//
// Bug 9 — A member being asked to log in again when they hit an admin page:
//   both guards redirect to /login instead of distinguishing "who are you"
//   from "you're not allowed". → §7.
//
// Bug 10 — Believing the app is secure because the UI hides the button: the
//   route config and the API are both reachable without the app. → §8.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The guard's shape:
assert(guardedPaths.includes("/dashboard") && guardedPaths.includes("/settings") && guardedPaths.includes("/admin/users"),
  "every route nested under the pathless guard is protected structurally ✅");
assert(openPaths.includes("/login") && openPaths.includes("/"),
  "…and /login is deliberately OUTSIDE it, or the guard would redirect to itself forever");
assert(!guardedPaths.some(p => p.includes("authed")) && !guardedPaths.some(p => p.includes("require")),
  "a pathless guard contributes NOTHING to the URLs it protects (03 §8)");

// replace:
assert(withoutReplace.afterGuard.length === 3 && withReplace.afterGuard.length === 2,
  "without replace the history grew to 3 entries; with replace it stayed at 2");
assert(withoutReplace.loops === true,
  "…and pressing back returned to the protected route, re-firing the guard: a loop 🐛");
assert(withReplace.loops === false && withReplace.landedOn === "/",
  "…while replace let back work normally, landing on the previous real page ✅");

// Three states:
assert(twoStateRedirectedValidUser === true,
  "the two-state guard redirected a genuinely LOGGED-IN user on render 1 🐛");
assert(threeStateRedirectedValidUser === false,
  "…the three-state guard rendered a spinner instead and never kicked them out ✅");
assert(twoStateOutcomes[1] === threeStateOutcomes[1],
  "…and both agree once auth resolves — which is exactly why the bug is invisible on a warm cache");

// Destination preservation:
assert(withoutState.landsOn === "/" && withoutState.correct === false,
  "without location state the user is dumped at the homepage after login 🐛");
assert(withState.landsOn === "/dashboard/reports?range=90d" && withState.correct === true,
  "…with it they arrive exactly where they were headed, query string intact ✅");

// Composed guards:
assert(runGuardChain(adminBranch, anonymous).outcome === "redirect:/login",
  "an anonymous user is stopped by the FIRST guard and asked to identify themselves");
assert(runGuardChain(adminBranch, normalUser).outcome === "redirect:/forbidden",
  "a logged-in member passes RequireAuth and is stopped by RequireAdmin — a DIFFERENT answer ✅");
assert(runGuardChain(adminBranch, adminUser).outcome === "rendered",
  "…and an admin passes both, each guard having answered only its own question");

// The trust boundary:
assert(guardStopsUiRender === true && guardStopsApiAccess === false,
  "the guard controls what RENDERS and nothing about what is ACCESSIBLE — UX, not security 🐛");
assert(whatShipsToTheBrowser.everyRoutePath.length === branches.length,
  "…and every protected path is in the bundle the user already downloaded");

console.log("§10 — mini assertions passed for: Protected routes");
console.log("\n  The pair that captures it: omitting one word — `replace` — turned the back");
console.log("  button into an inescapable loop, and treating auth as a boolean instead of");
console.log("  three states redirected a genuinely logged-in user to /login on render 1 —");
console.log("  while the guard that got both right still protects exactly zero data.");


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you implement protected routes in React Router v6?",
// answer:
//
//   "React Router doesn't ship a protected-route feature — you compose one.
//    The shape I use is a pathless layout route: a route with an element and
//    children but no path, whose element checks auth and returns either
//    <Outlet /> for the children or <Navigate to='/login' replace />. Because
//    it's pathless it adds nothing to the URLs — /dashboard stays /dashboard
//    — and because everything protected is nested inside it, adding a new
//    route to that block protects it automatically. That's better than a
//    <RequireAuth> wrapper repeated per route, because eventually someone
//    adds a route and forgets the wrapper.
//
//    Three details make or break it. First, `replace` is not optional. Without
//    it the redirect PUSHES /login onto the history, so pressing back returns
//    to the protected route, which redirects again — an inescapable loop.
//    Users report it as 'your back button is broken'. The rule is that push
//    records a decision the user made and replace corrects one the app made.
//
//    Second, auth is a three-state machine, not a boolean: loading,
//    authenticated, anonymous. A guard that just asks 'is there a user'
//    treats 'still checking the token' as 'logged out' and bounces a
//    perfectly valid session to the login page on the first render. It's
//    timing-dependent, so on a warm cache it looks fine and on a cold load it
//    happens every time. The fix isn't adding a spinner, it's modelling the
//    third state so you can't forget to handle it.
//
//    Third, save where they were going — <Navigate state={{ from: location }} />
//    — and pass the whole location, not just the pathname, or you lose the
//    query string that was probably the point of the link. Then the login
//    page navigates back there on success, also with replace.
//
//    And the part I'd volunteer without being asked: none of this is
//    security. The route config, the guard logic and the role names are all
//    in the JavaScript bundle the user downloaded, and the API is reachable
//    with curl without ever loading my app. The guard is UX — it stops
//    someone seeing a broken page they have no data for. The server has to
//    authorise every request independently. If I deleted the guard entirely,
//    the app would be uglier and exactly as secure."
//
// Leading with the composed shape, naming the two mechanical bugs with their
// symptoms, and closing on the trust boundary is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Does React Router have built-in protected routes?
// A1. No — you compose one from a route element that returns <Outlet /> or
//     <Navigate />.
//
// Q2. Why a pathless layout route rather than a per-route wrapper?
// A2. It protects a whole subtree structurally, adds nothing to the URLs,
//     and can't be forgotten on the next route someone adds.
//
// Q3. Why must <Navigate> use `replace` in a guard?
// A3. Otherwise /login is pushed onto history and back returns to the
//     protected route, re-firing the guard — a redirect loop.
//
// Q4. How many states does auth have?
// A4. Three — loading, authenticated, anonymous. Treating it as a boolean
//     redirects valid sessions during the initial check.
//
// Q5. Why is that bug hard to catch in review?
// A5. It's timing-dependent — a warm cache can resolve auth before first
//     paint, hiding it entirely.
//
// Q6. How do you return the user to their intended destination?
// A6. <Navigate state={{ from: location }} />, then the login page reads
//     location.state.from and navigates there with replace.
//
// Q7. Why pass the whole location instead of just pathname?
// A7. Otherwise the search string and hash are lost — often the meaningful
//     part of a shared link.
//
// Q8. What's the security risk in redirecting to location.state.from?
// A8. An open redirect if it can be an absolute URL — only navigate to
//     paths you recognise.
//
// Q9. Where does the login route go relative to the guard?
// A9. Outside it, as a sibling — inside, the guard would redirect to itself
//     forever.
//
// Q10. How do you handle roles on top of authentication?
// A10. A second, nested guard. Each answers one question; the inner one can
//      assume a user exists because the tree guarantees it.
//
// Q11. Should an unauthorised (but logged-in) user go to /login?
// A11. No — /forbidden. "We don't know who you are" and "we know and the
//      answer is no" are different answers.
//
// Q12. Is a client-side guard security?
// A12. No. The route config and guard logic ship in the bundle and the API
//      is reachable without the app. It's UX; the server authorises.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What shape is a protected route?
//   Back : A pathless layout route whose element returns <Outlet /> or
//          <Navigate replace />.
//
// Flashcard 2:
//   Front: Why is `replace` mandatory in a guard redirect?
//   Back : Without it, back returns to the protected route and loops.
//
// Flashcard 3:
//   Front: How many auth states?
//   Back : Three — loading, authenticated, anonymous. Not a boolean.
//
// Flashcard 4:
//   Front: Symptom of the two-state bug?
//   Back : Valid sessions bounced to /login on cold load only.
//
// Flashcard 5:
//   Front: How do you preserve the intended destination?
//   Back : state={{ from: location }} — the whole location, not just
//          pathname.
//
// Flashcard 6:
//   Front: Where does /login live relative to the guard?
//   Back : Outside it, as a sibling.
//
// Flashcard 7:
//   Front: Anonymous vs unauthorised — same redirect?
//   Back : No. /login vs /forbidden.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "The guard is UX. The server authorises. Delete the guard and
//          the app is uglier and exactly as secure."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Build the guard in a real app as a pathless route, then add a new
//   protected page and confirm you wrote zero extra guard code.
//
// Task 2:
//   Remove `replace` from the redirect and reproduce the back-button loop
//   yourself. Watch the history entries pile up in devtools.
//
// Task 3:
//   Throttle your network to Slow 3G and reload a protected page with a
//   two-state guard. Watch the bounce to /login, then fix it.
//
// Task 4:
//   Implement the from/state round trip including the query string, and
//   verify with a link like /reports?range=90d.
//
// Task 5:
//   Try to make your own guard redirect to an external URL via
//   location.state.from. Then add the validation that prevents it.
//
// Task 6:
//   Add a RequireAdmin guard nested inside RequireAuth and confirm a member
//   gets /forbidden while an anonymous user gets /login.
//
// Task 7:
//   Open the network tab, find your app's JS bundle, and search it for your
//   protected route paths. Then curl the API endpoint behind one of them
//   with no session. Write down what actually stopped you — if anything.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   A client-side guard decides what RENDERS. The server decides what's
//   ALLOWED. Only one of those is security.
//
// If you remember the common bug:
//   Auth treated as a boolean — "still loading" read as "logged out",
//   bouncing valid sessions on every cold load.
//
// If you remember the professional framing:
//   One pathless guard over a subtree, `replace` on every guard redirect,
//   the whole location preserved as `from`, and roles as a second nested
//   guard that answers a different question.
//
// NEXT TOPIC -> 05_redirect-navigate.js
