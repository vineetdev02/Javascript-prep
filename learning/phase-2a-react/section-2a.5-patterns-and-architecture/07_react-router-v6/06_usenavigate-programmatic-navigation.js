// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Router v6  →  06_usenavigate-programmatic-navigation.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useNavigate + programmatic navigation
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: RELATIVE `to` RESOLVES
//      AGAINST THE ROUTE HIERARCHY, NOT THE URL — and the two answers
//      genuinely differ
//   2. navigate()'s two completely different signatures: a destination, or
//      a history DELTA
//   3. navigate(-1) is not "go back to the previous page in my app" — it is
//      "press the browser back button", and those differ
//   4. Passing state, and why state is not a substitute for the URL
//   5. navigate() in an effect vs an event handler — and the identity
//      question that used to break dependency arrays
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/07_react-router-v6/06_usenavigate-programmatic-navigation.js"
//
// Prerequisites: 05_redirect-navigate.js — that file drew the declarative/
// imperative line and left two promises: that relative `to` resolves against
// the ROUTE hierarchy (05 Bug 10), and that events belong in handlers rather
// than in faked state flags (05 §6). Both are cashed in here.
//
// 05 covered WHEN to navigate imperatively. This file is the function
// itself — every argument shape it accepts, and the one resolution rule that
// produces a URL you did not expect.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useNavigate():
// A hook returning a function that changes the location when you call it —
// the imperative counterpart to <Link> and <Navigate>, for navigation that
// happens in response to something rather than as a render result.
//
// If interviewer says "explain it simply", say:
//   "It gives you a `navigate` function. Call navigate('/thanks') to go
//    somewhere, navigate(-1) to go back, and pass options for replace or
//    state. You use it in event handlers and effects — anywhere a
//    navigation is a reaction to something that happened, rather than a
//    conclusion drawn from current state."
//
// If interviewer says "what's the subtle part?", say:
//   "Relative paths. `navigate('..')` does NOT mean 'chop one segment off
//    the URL' — by default it climbs one level in the matched ROUTE
//    hierarchy, which is often a different place. From /users/42/posts/7,
//    `..` goes to /users/42, not /users/42/posts, because the parent ROUTE
//    is /users/:userId. If you actually want URL-segment behaviour you have
//    to ask for it explicitly with relative='path'."
//
// Why it matters in interviews:
//   The API looks trivial, which is exactly why the relative-resolution
//   question is a good filter — it separates people who have read the docs
//   from people who have debugged a `..` that went somewhere unexpected in
//   a deeply nested tree.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   `..` CLIMBS ROUTES, NOT SEGMENTS.
//
// Runtime rule:
//   navigate() has two signatures. Given a string or object, it resolves a
//   destination — relative values resolved against the matched route chain
//   (03 §4), not against location.pathname — and pushes or replaces it.
//   Given a NUMBER, it is a pure history delta: navigate(-1) is exactly
//   history.go(-1), the browser back button, and it ignores your route tree
//   entirely.
//
// Practical rule:
//   Prefer absolute paths, or paths built from params you already have, for
//   anything important. Reach for `..` only when the subtree is genuinely
//   meant to be portable, and when you do, be sure you mean the ROUTE
//   hierarchy — because that is what you will get.
//
// Common trap:
//   Using navigate(-1) as "go back to the list I came from". It means "undo
//   one history entry", which might be a different site, a redirect the app
//   itself performed (05 §5), or nothing at all if the user opened your page
//   in a fresh tab. A "back to list" button should navigate to the list.
//
// The mental picture:
//
//   URL:            /users/42/posts/7
//   matched chain:  RootLayout   at  /
//                   UserLayout   at  /users/:userId      → /users/42
//                   Post         at  /users/:userId/posts/:postId
//
//   navigate("..")                    → /users/42        ← up one ROUTE
//   navigate("..", {relative:"path"}) → /users/42/posts  ← up one SEGMENT
//                                        ▲
//                        which may not even be a route that exists


// ══════════════════════════════════════════════════════════════════
// § 3 — THE TWO SIGNATURES
// ══════════════════════════════════════════════════════════════════

console.log("§3 — one function, two completely different call shapes:\n");

function createNavigator(initialEntries = ["/"]) {
  const entries = [...initialEntries];
  let index = entries.length - 1;
  const log = [];

  function navigate(to, options = {}) {
    // Signature 2: a NUMBER is a history delta, and options are ignored.
    if (typeof to === "number") {
      const target = Math.min(entries.length - 1, Math.max(0, index + to));
      log.push("navigate(" + to + ") → history delta → " + entries[target]);
      index = target;
      return;
    }
    // Signature 1: a destination.
    const entry = typeof to === "string" ? { pathname: to } : to;
    const record = { ...entry, state: options.state ?? null };
    if (options.replace) {
      entries[index] = record;
      log.push("navigate(" + JSON.stringify(to) + ", {replace:true}) → replaced current");
    } else {
      entries.length = index + 1;
      entries.push(record);
      index = entries.length - 1;
      log.push("navigate(" + JSON.stringify(to) + ") → pushed");
    }
  }

  return {
    navigate,
    get current() { const e = entries[index]; return typeof e === "string" ? { pathname: e } : e; },
    get stack() { return entries.map(e => (typeof e === "string" ? e : e.pathname)); },
    get index() { return index; },
    get log() { return log; },
  };
}

const nav = createNavigator(["/"]);
nav.navigate("/users");
nav.navigate("/users/42");
nav.navigate("/users/42/edit", { state: { returnTo: "/users/42" } });
nav.navigate(-1);
nav.navigate("/users/99", { replace: true });

for (const line of nav.log) console.log("      " + line);
console.log("\n      final stack :", JSON.stringify(nav.stack));
console.log("      at index    :", nav.index, "→", JSON.stringify(nav.current.pathname));

console.log("\n    The two signatures do not mix: options are meaningless with a number,");
console.log("    because a delta is not a new entry — it is a move within existing ones.");
console.log("    navigate(-1, { replace: true }) is not an error and not meaningful. 🐛\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — RELATIVE `to` RESOLVES AGAINST ROUTES
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the resolution rule that produces surprising URLs:\n");

// The matched chain for /users/42/posts/7 — exactly what 03 §4 produced.
const matchedChain = [
  { element: "RootLayout", pattern: "/",                            resolvedTo: "/" },
  { element: "UserLayout", pattern: "/users/:userId",               resolvedTo: "/users/42" },
  { element: "Post",       pattern: "/users/:userId/posts/:postId", resolvedTo: "/users/42/posts/7" },
];
const currentPathname = "/users/42/posts/7";

// relative="route" — the DEFAULT. ".." climbs one entry in the matched chain.
function resolveAgainstRoutes(to, chain) {
  const parts = to.split("/");
  const ups = parts.filter(s => s === "..").length;
  const rest = parts.filter(s => s !== ".." && s !== "" && s !== ".");
  const targetIndex = Math.max(0, chain.length - 1 - ups);
  const base = chain[targetIndex].resolvedTo;
  const joined = (base === "/" ? "" : base) + (rest.length ? "/" + rest.join("/") : "");
  return joined || "/";
}

// relative="path" — ".." climbs one URL SEGMENT, like a filesystem.
function resolveAgainstPath(to, pathname) {
  const segments = pathname.split("/").filter(Boolean);
  const parts = to.split("/");
  const ups = parts.filter(s => s === "..").length;
  const rest = parts.filter(s => s !== ".." && s !== "" && s !== ".");
  const kept = segments.slice(0, Math.max(0, segments.length - ups));
  return "/" + [...kept, ...rest].join("/");
}

console.log("    current URL   :", currentPathname);
console.log("    matched chain :", matchedChain.map(m => m.element).join(" → "));
console.log("    parent ROUTE  :", matchedChain[matchedChain.length - 2].pattern,
  "→ resolves to", matchedChain[matchedChain.length - 2].resolvedTo);

console.log("\n      navigate(to)".padEnd(22) + "default (relative='route')".padEnd(30) + "relative='path'");
console.log("      " + "─".repeat(80));

const relativeCases = ["..", "../..", "../edit"];
const resolutions = relativeCases.map(to => ({
  to,
  route: resolveAgainstRoutes(to, matchedChain),
  path: resolveAgainstPath(to, currentPathname),
}));

for (const r of resolutions) {
  const differs = r.route !== r.path;
  console.log("      " + JSON.stringify(r.to).padEnd(22) + r.route.padEnd(30) + r.path + (differs ? "   ← different!" : ""));
}

const dotDot = resolutions[0];

console.log("\n    Look at the first row. From a post, `..` gives /users/42 — the user, not");
console.log("    the post LIST. That is correct and deliberate: the parent ROUTE is");
console.log("    /users/:userId. The URL segment /users/42/posts has no route of its own");
console.log("    in this tree, so 'up one segment' would navigate to something that does");
console.log("    not exist.");

console.log("\n    Why route-relative is the right default: it makes a subtree portable.");
console.log("    Move the whole posts section under a different parent and every `..`");
console.log("    inside it still means 'my parent route', with no edits. Path-relative");
console.log("    would silently point at a different place.");

console.log("\n    When you genuinely want segments, ask for it — and know that you are");
console.log("    opting into URL-shape coupling:");
console.log("      navigate('..', { relative: 'path' })");
console.log("\n    And the honest recommendation: in a deep tree, absolute paths built from");
console.log("    params you already have are easier to reason about than either.");
console.log("      navigate(`/users/${userId}`)     ← unambiguous, and greppable\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — navigate(-1) IS THE BACK BUTTON, NOT "MY PREVIOUS PAGE"
// ══════════════════════════════════════════════════════════════════

console.log("§5 — three situations where navigate(-1) does not do what the button says:\n");

function backButtonScenario(name, entries, indexNow, { appPushedARedirect = false } = {}) {
  const target = Math.max(0, indexNow - 1);
  const wentNowhere = target === indexNow;              // no previous entry to go to
  const landsOn = entries[target];
  const isInsideApp = landsOn.startsWith("/");
  return {
    name,
    stack: entries,
    landsOn,
    wentNowhere,
    appPushedARedirect,
    // "as intended" means: it moved, it stayed in the app, and it did not
    // land on a URL the app itself pushed and will immediately leave again.
    behavesAsIntended: !wentNowhere && isInsideApp && !appPushedARedirect,
  };
}

const scenarios = [
  backButtonScenario("normal in-app journey", ["/users", "/users/42"], 1),
  backButtonScenario("arrived from Google", ["https://google.com/search", "/users/42"], 1),
  backButtonScenario("opened in a fresh tab", ["/users/42"], 0),
  backButtonScenario("app redirected on the way in", ["/users", "/old", "/users/42"], 2, { appPushedARedirect: true }),
];

for (const s of scenarios) {
  console.log("    " + s.name.padEnd(30) + "stack: " + JSON.stringify(s.stack));
  console.log("      navigate(-1) lands on: " + JSON.stringify(s.landsOn),
    s.behavesAsIntended ? "✅" : "🐛");
  if (s.wentNowhere) {
    console.log("        ← there IS no previous entry. The button does nothing at all,");
    console.log("          and gives the user no feedback that it did nothing.");
  }
  if (s.appPushedARedirect) {
    console.log("        ← a dead redirect URL the app itself pushed (05 §5). Back goes");
    console.log("          there, which forwards again. `replace` on that redirect would");
    console.log("          have prevented it.");
  }
  if (!s.behavesAsIntended && !s.wentNowhere && !s.appPushedARedirect) {
    console.log("        ← that is a different site. The user has left your app entirely.");
  }
  console.log("");
}

const worksAsIntended = scenarios.filter(s => s.behavesAsIntended).length;
console.log("    behaved as 'go back to the list' in", worksAsIntended, "of", scenarios.length, "situations.");
console.log("\n    navigate(-1) is history.go(-1) — a browser-level operation that knows");
console.log("    nothing about your routes. It is correct for a genuine 'back' affordance");
console.log("    (a modal close, a wizard step). It is wrong for 'return to the list',");
console.log("    which has a known destination:");
console.log("      ❌ <button onClick={() => navigate(-1)}>Back to users</button>");
console.log("      ✅ <button onClick={() => navigate('/users')}>Back to users</button>");
console.log("\n    The giveaway is the label: if the button names a destination, navigate");
console.log("    to that destination.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — PASSING STATE, AND WHAT STATE IS NOT FOR
// ══════════════════════════════════════════════════════════════════

console.log("§6 — navigate(to, { state }) and its limits:\n");

const stateNav = createNavigator(["/users"]);
stateNav.navigate("/users/42/edit", { state: { from: "/users", scrollY: 320 } });

console.log("    navigate('/users/42/edit', { state: { from, scrollY } })");
console.log("      URL         :", JSON.stringify(stateNav.current.pathname));
console.log("      location.state:", JSON.stringify(stateNav.current.state));

// The properties that decide when state is appropriate.
const stateProperties = [
  ["visible in the URL",        false, "the URL looks identical with or without it"],
  ["survives a refresh",        true,  "it is stored in the history entry, not memory"],
  ["survives a shared link",    false, "the recipient gets the URL only — state is null"],
  ["survives a bookmark",       false, "same reason"],
  ["readable by the server",    false, "it never leaves the browser"],
  ["good for UI hints",         true,  "'you came from here', a scroll position, a flag"],
  ["good for app data",         false, "that belongs in the URL or in a store"],
];

console.log("\n      property".padEnd(30) + "state?".padEnd(10) + "why");
console.log("      " + "─".repeat(78));
for (const [prop, yes, why] of stateProperties) {
  console.log("      " + prop.padEnd(30) + String(yes).padEnd(10) + why);
}

console.log("\n    The rule that follows: location state is for information about the");
console.log("    NAVIGATION, not about the PAGE. 'Which list did they come from' is");
console.log("    navigation context and belongs in state — it is 04 §6's `from` exactly.");
console.log("    'Which filters are applied' is page content: it belongs in the URL, so a");
console.log("    shared link reproduces the page. That is file 07's subject.");
console.log("\n    The test: if a colleague pastes this URL into Slack, should they see the");
console.log("    same thing you see? If yes, it is not state — it is a search param. 🐛\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHERE YOU MAY CALL IT, AND THE IDENTITY QUESTION
// ══════════════════════════════════════════════════════════════════

console.log("§7 — event handlers, effects, and dependency arrays:\n");

// 05 §4 established the render-phase rule. The other two locations are both
// legal, but only one of them is usually what you want.
const callSites = [
  ["render body",   "❌ illegal", "side effect during render — fires per render attempt (05 §4)"],
  ["event handler", "✅ ideal",   "the natural home: something happened, go somewhere"],
  ["useEffect",     "⚠️ legal",   "fine for 'on mount, redirect' — but ask whether a loader (09) or <Navigate> (05) is better"],
];

console.log("      call site".padEnd(18) + "verdict".padEnd(14) + "why");
console.log("      " + "─".repeat(86));
for (const [site, verdict, why] of callSites) {
  console.log("      " + site.padEnd(18) + verdict.padEnd(14) + why);
}

// The identity question: is `navigate` stable across renders?
function simulateEffectRuns({ navigateIsStable, renders }) {
  let effectRuns = 0;
  let lastDep = Symbol("initial");
  for (let i = 0; i < renders; i++) {
    const navigateRef = navigateIsStable ? "STABLE" : Symbol("new-each-render");
    if (navigateRef !== lastDep) { effectRuns++; lastDep = navigateRef; }
  }
  return effectRuns;
}

const RENDERS = 5;
const unstableRuns = simulateEffectRuns({ navigateIsStable: false, renders: RENDERS });
const stableRuns = simulateEffectRuns({ navigateIsStable: true, renders: RENDERS });

console.log("\n    useEffect(() => { … }, [navigate]) across " + RENDERS + " renders:");
console.log("      if `navigate` gets a NEW identity each render : effect runs", unstableRuns, "times 🐛");
console.log("      if `navigate` is stable                        : effect runs", stableRuns, "time  ✅");

console.log("\n    This mattered historically: in earlier v6 versions the navigate function");
console.log("    was recreated when the location changed, so putting it in a dependency");
console.log("    array could re-run an effect on every navigation — and an effect that");
console.log("    navigates, re-running on navigation, is a loop.");
console.log("\n    Modern React Router returns a stable function, so `[navigate]` is safe.");
console.log("    But the general lesson outlives the specific version, and it is");
console.log("    06_design-patterns' truth #2 again — IDENTITY DECIDES EVERYTHING: before");
console.log("    putting any function from a library in a dependency array, know whether");
console.log("    that library promises a stable identity. If it does not, the array is");
console.log("    decorative.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — `navigate('..')` landing somewhere unexpected in a nested tree:
//   it climbed a ROUTE, not a URL segment, and the two differ whenever an
//   intermediate segment has no route of its own. → §4.
//
// Bug 2 — A "Back to list" button that leaves the site entirely: navigate(-1)
//   when the user arrived from Google. → §5.
//
// Bug 3 — A "Back" button that does nothing: navigate(-1) in a tab opened
//   directly on that URL, where there is no previous entry. → §5.
//
// Bug 4 — Back landing on a dead redirect URL: the app pushed the redirect
//   instead of replacing it, so navigate(-1) walks into it. → §5, 05 §5.
//
// Bug 5 — A shared link that shows a different page than the sender sees:
//   page state was put in location state instead of search params. → §6,
//   file 07.
//
// Bug 6 — Filters that vanish on refresh… or survive it confusingly: state
//   DOES survive refresh (it lives in the history entry) but not sharing,
//   which produces an inconsistent mental model for the user. → §6.
//
// Bug 7 — An effect that navigates, re-running on every navigation and
//   looping: an unstable function in the dependency array. → §7.
//
// Bug 8 — navigate() called in a render body, firing twice under
//   StrictMode: the render-phase rule. → 05 §4.
//
// Bug 9 — navigate(-1, { replace: true }) written as if it means something:
//   options are ignored for a delta. Harmless, but it signals a wrong model
//   of what the number does. → §3.
//
// Bug 10 — A `to` built by concatenation without encodeURIComponent,
//   changing which route matches when a value contains '/' or '?'. Same
//   class as 02 §6.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The two signatures:
assert(nav.stack.length === 4 && nav.current.pathname === "/users/99",
  "a mix of pushes, a delta and a replace produced the expected final stack and location");
assert(nav.log.some(l => l.includes("history delta")),
  "…and navigate(-1) was handled as a DELTA, not a destination");

// Relative resolution — the headline:
assert(dotDot.route === "/users/42",
  "from /users/42/posts/7, `..` resolves to /users/42 — up one ROUTE ✅");
assert(dotDot.path === "/users/42/posts",
  "…while relative='path' gives /users/42/posts — up one SEGMENT");
assert(dotDot.route !== dotDot.path,
  "…and those are genuinely different destinations, which is the whole trap 🐛");
assert(resolutions.every(r => r.route !== r.path),
  "in this tree ALL three relative forms resolve differently under the two modes");
assert(resolveAgainstRoutes("../..", matchedChain) === "/",
  "climbing two routes from the leaf reaches the root layout's path");

// navigate(-1):
assert(worksAsIntended === 1,
  "navigate(-1) behaved as 'back to the list' in only 1 of 4 realistic situations 🐛");
assert(scenarios[1].landsOn.startsWith("https://"),
  "…including one where it leaves the site entirely");
assert(scenarios[2].wentNowhere === true && scenarios[2].landsOn === "/users/42",
  "…and one where there is no previous entry at all, so the button silently does nothing 🐛");
assert(scenarios[3].appPushedARedirect === true && scenarios[3].landsOn === "/old",
  "…and one where back lands on a dead redirect the app itself pushed 🐛");

// State:
assert(stateNav.current.state && stateNav.current.state.scrollY === 320,
  "navigate(to, { state }) attached state to the history entry ✅");
assert(stateNav.current.pathname === "/users/42/edit",
  "…without changing the URL in any way — which is exactly the limitation 🐛");
assert(stateProperties.find(p => p[0] === "survives a shared link")[1] === false,
  "location state does NOT survive a shared link — page content belongs in the URL");

// Identity:
assert(unstableRuns === RENDERS && stableRuns === 1,
  "an unstable dependency re-ran the effect on every render; a stable one ran it once 🐛→✅");

console.log("§9 — mini assertions passed for: useNavigate + programmatic navigation");
console.log("\n  The pair that captures it: from /users/42/posts/7, the SAME call —");
console.log("  navigate('..') — resolves to " + dotDot.route + " by default and " + dotDot.path);
console.log("  under relative='path', and navigate(-1) behaved as 'back to the list' in");
console.log("  only " + worksAsIntended + " of " + scenarios.length + " realistic situations. Both are the same lesson: the");
console.log("  function is not doing what the shorthand looks like it says.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how does useNavigate work?", answer:
//
//   "It returns a navigate function with two genuinely different signatures.
//    Give it a destination — a string or a location object, plus options for
//    replace and state — and it navigates there. Give it a NUMBER and it's a
//    pure history delta: navigate(-1) is history.go(-1), the browser back
//    button. Options are meaningless with a number, because a delta moves
//    within existing entries rather than creating one.
//
//    The subtle part, and the thing I'd raise unprompted, is relative
//    resolution. `navigate('..')` does not chop a segment off the URL — by
//    default it climbs one level in the matched ROUTE hierarchy. From
//    /users/42/posts/7 that gives /users/42, not /users/42/posts, because the
//    parent route is /users/:userId. And /users/42/posts might not even be a
//    route in the tree. If you actually want segment behaviour you opt in
//    with relative: 'path'. Route-relative is the right default because it
//    makes a subtree portable — move the section under a different parent and
//    every `..` inside still means 'my parent route' — but in a deep tree I
//    usually prefer absolute paths built from params I already have, because
//    they're unambiguous and greppable.
//
//    The other thing I'm careful about is navigate(-1). It's a browser-level
//    operation that knows nothing about my routes, so it's right for a
//    genuine 'back' affordance like closing a modal, and wrong for 'return to
//    the list'. If the user arrived from Google it leaves the site; in a fresh
//    tab there's nothing to go back to; and if my own app pushed a redirect on
//    the way in, back lands on a dead URL that forwards again. The giveaway
//    is the label — if the button names a destination, navigate to that
//    destination.
//
//    On options: `state` attaches data to the history entry. It survives a
//    refresh but not a shared link or a bookmark, and it's invisible in the
//    URL — so it's for information about the NAVIGATION, like 'which list did
//    they come from', not about the PAGE. My test is whether a colleague
//    pasting the URL into Slack should see the same thing; if yes, it belongs
//    in search params, not state.
//
//    And on where to call it: event handlers are the natural home. The render
//    body is illegal — that's what <Navigate> is for. Effects are legal but
//    worth questioning, and historically the navigate function wasn't
//    identity-stable, so putting it in a dependency array could re-run an
//    effect on every navigation — and an effect that navigates, re-running on
//    navigation, is a loop. It's stable now, but the general habit of
//    checking whether a library promises stable identity before trusting a
//    dependency array outlives that specific fix."
//
// Leading with "two signatures", then the route-vs-path resolution with a
// concrete example, is what makes this sound like debugging experience.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What are navigate()'s two signatures?
// A1. A destination (string or object, plus options), or a NUMBER — a pure
//     history delta.
//
// Q2. What does navigate('..') resolve against by default?
// A2. The matched ROUTE hierarchy — one route up, not one URL segment.
//
// Q3. Give a case where those differ.
// A3. From /users/42/posts/7 whose parent route is /users/:userId: `..`
//     gives /users/42, path-relative gives /users/42/posts.
//
// Q4. How do you get URL-segment behaviour?
// A4. navigate('..', { relative: 'path' }) — an explicit opt-in.
//
// Q5. Why is route-relative the better default?
// A5. It makes subtrees portable — move the section and every `..` inside
//     still points at its parent route.
//
// Q6. Is navigate(-1) the same as "go back to the previous page in my app"?
// A6. No — it's history.go(-1). It can leave your site, do nothing in a
//     fresh tab, or land on a redirect your own app pushed.
//
// Q7. When IS navigate(-1) correct?
// A7. For a genuine back affordance — closing a modal, a wizard step —
//     where "undo one history entry" is literally the intent.
//
// Q8. What does the `state` option do, and what are its limits?
// A8. Attaches data to the history entry. Survives refresh; does not survive
//     a shared link or bookmark; invisible in the URL; never reaches the
//     server.
//
// Q9. What's the test for state vs search params?
// A9. Should someone pasting the URL see the same thing? If yes, it's a
//     search param, not state.
//
// Q10. Where can you legally call navigate()?
// A10. Event handlers (ideal) and effects (legal). Never the render body —
//      that's what <Navigate> exists for.
//
// Q11. Why did [navigate] in a dependency array used to be dangerous?
// A11. The function wasn't identity-stable, so the effect re-ran on every
//      navigation — and an effect that navigates then loops.
//
// Q12. Do options apply to navigate(-1)?
// A12. No — a delta moves within existing entries; replace and state are
//      meaningless there.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: navigate()'s two signatures?
//   Back : A destination + options, or a NUMBER (history delta).
//
// Flashcard 2:
//   Front: What does `..` climb?
//   Back : One ROUTE in the matched chain — not one URL segment.
//
// Flashcard 3:
//   Front: How do you get segment-relative behaviour?
//   Back : relative: 'path' — an explicit opt-in.
//
// Flashcard 4:
//   Front: Is navigate(-1) "back to my list"?
//   Back : No — it's the browser back button. It can leave your site.
//
// Flashcard 5:
//   Front: Does location state survive a shared link?
//   Back : No. It survives a refresh, not a share or bookmark.
//
// Flashcard 6:
//   Front: State or search param?
//   Back : Would a pasted URL show the same page? Then search param.
//
// Flashcard 7:
//   Front: Where can't you call navigate()?
//   Back : The render body — use <Navigate> there.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "`..` climbs routes, not segments — and navigate(-1) is the
//          browser's back button, not my app's."
//
//
// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   In a real nested app, log the result of navigate('..') and
//   navigate('..', {relative:'path'}) from the deepest route. Confirm they
//   differ.
//
// Task 2:
//   Build a route tree where an intermediate URL segment has no route, then
//   navigate('..', {relative:'path'}) into it and see what renders.
//
// Task 3:
//   Add a "Back" button using navigate(-1), then open the page in a fresh
//   tab and click it. Then open it via a link from another site and click it.
//
// Task 4:
//   Replace that button with navigate('/users') and verify it behaves the
//   same in all three situations from Task 3.
//
// Task 5:
//   Pass a filter through location state, share the URL with yourself in
//   another browser, and confirm the filter is gone.
//
// Task 6:
//   Move that filter to a search param and repeat — confirm it survives.
//   (This is file 07's whole subject.)
//
// Task 7:
//   Write an effect with [navigate] in its dependency array that calls
//   navigate(). Confirm modern React Router does not loop, then reason about
//   why it would have on an older version.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   `..` climbs the ROUTE hierarchy, not the URL. In a nested tree those are
//   different destinations, and only one of them is guaranteed to exist.
//
// If you remember the common bug:
//   navigate(-1) used as "back to the list" — correct in one of four
//   realistic situations, and it leaves your site in another.
//
// If you remember the professional framing:
//   Location state describes the NAVIGATION; the URL describes the PAGE. If
//   a pasted link should show the same thing, it was never state.
//
// NEXT TOPIC -> 07_uselocation-and-usesearchparams.js
