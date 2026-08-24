// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Router v6  →  02_route-params-and-useparams.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Route params & useParams
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: EVERY PARAM IS A STRING.
//      Always. Even /users/42.
//   2. The bug that fact causes, measured: a `===` lookup finding 0 of 3
//      users, and `id + 1` producing "421"
//   3. React Router v6 RANKS routes — JSX order does not decide the match,
//      a real score does. The actual algorithm, implemented and printed.
//   4. Splat (`*`) params, and how they score LOWER on purpose
//   5. URL decoding: useParams gives you decoded values, and what that
//      means for slashes, spaces and '+'
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/07_react-router-v6/02_route-params-and-useparams.js"
//
// Prerequisites: 01_browserrouter-vs-hashrouter.js — that file established
// that a Router publishes a `location`. This file is the next step: turning
// that location's PATHNAME into a matched route plus a params object.
//
// 01 ended with "everything above the Router is identical for all three".
// This is the first of those things: the matching engine. Everything in
// files 03-09 — nested routes, guards, navigation, loaders — sits on top of
// the two functions this file builds and proves.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Route params:
// Named dynamic segments in a route pattern (`/users/:id`) that capture the
// corresponding piece of the actual URL, exposed to the matched component
// as an object of STRING values via the useParams() hook.
//
// If interviewer says "explain it simply", say:
//   "`:id` in a route pattern is a placeholder. When the URL is /users/42,
//    the router matches that pattern, pulls '42' out, and useParams() gives
//    you `{ id: '42' }`. The critical detail is that it's the STRING '42',
//    not the number 42 — a URL has no types, it's text all the way down."
//
// If interviewer says "how does it pick which route matches?", say:
//   "In v6 it ranks them. Every route pattern gets a score — static
//    segments score highest, dynamic segments lower, splats are penalised —
//    and the highest-scoring match wins regardless of the order you wrote
//    them in. That's a real change from v5, where the first match in source
//    order won and you had to order routes carefully by hand."
//
// Why it matters in interviews:
//   The string-vs-number thing catches almost everyone at least once,
//   because it fails SILENTLY: `fetch('/api/users/' + id)` works perfectly
//   with a string, so the bug hides until someone does a client-side `===`
//   comparison and gets an empty result with no error. §4 measures exactly
//   that.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   A URL HAS NO TYPES. EVERY PARAM IS A STRING.
//
// Runtime rule:
//   A route pattern is compiled to a regular expression, with each `:name`
//   becoming a capture group. On a match, each captured group is
//   decodeURIComponent()'d and stored under its name. Nothing anywhere in
//   that pipeline knows or cares whether the value looks numeric — there is
//   no coercion step, and there is no schema.
//
// Practical rule:
//   Convert params at the boundary, once, the moment you read them:
//   `const id = Number(useParams().id)` — and validate it (`Number.isFinite`)
//   rather than trusting it, because a user can type anything into a URL.
//
// Common trap:
//   Comparing a param against typed data with `===`. `user.id === params.id`
//   is `42 === '42'`, which is false, forever, silently. The list renders
//   empty, nothing throws, and the network tab looks perfect because the
//   API call itself worked fine.
//
// The mental picture:
//
//   pattern:  /users/:id/posts/:postId
//                    │           │
//                    └──────┬────┘
//                    compiled to a regex with 2 capture groups
//                           │
//   pathname: /users/42/posts/7
//                     │        │
//                     └────┬───┘
//                    captured, then decodeURIComponent'd
//                          │
//                          ▼
//   useParams() → { id: "42", postId: "7" }
//                        ▲          ▲
//                     STRINGS, both of them, always


// ══════════════════════════════════════════════════════════════════
// § 3 — THE MATCHER: PATTERN + PATHNAME → PARAMS
// ══════════════════════════════════════════════════════════════════

console.log("§3 — compiling a route pattern and extracting params:\n");

// A faithful, working model of React Router's path compilation. Each
// `:name` becomes a capture group; a trailing `*` becomes a greedy splat.
function compilePath(path) {
  const paramNames = [];
  let regexpSource =
    "^" +
    path
      .replace(/\/*\*?$/, "")                       // strip a trailing splat
      .replace(/^\/*/, "/")                          // ensure a leading slash
      .replace(/[\\.*+^${}|()[\]]/g, "\\$&")         // escape regex metacharacters
      .replace(/\/:(\w+)/g, (_, name) => {           // :name → capture group
        paramNames.push(name);
        return "/([^\\/]+)";
      });

  if (path.endsWith("*")) {
    paramNames.push("*");
    regexpSource += "(?:\\/(.+)|\\/*)$";             // splat captures the REST, slashes included
  } else {
    regexpSource += "\\/*$";
  }
  return { matcher: new RegExp(regexpSource), paramNames };
}

function matchPath(pattern, pathname) {
  const { matcher, paramNames } = compilePath(pattern);
  const match = pathname.match(matcher);
  if (!match) return null;

  const params = {};
  paramNames.forEach((name, i) => {
    const raw = match[i + 1];
    // React Router decodes each param value — §6 covers what that means.
    params[name] = raw === undefined ? undefined : decodeURIComponent(raw);
  });
  return { pattern, params };
}

const cases = [
  ["/users/:id",               "/users/42"],
  ["/users/:id/posts/:postId", "/users/42/posts/7"],
  ["/users/new",               "/users/42"],
  ["/users/:id",               "/users/42/extra"],
];

for (const [pattern, pathname] of cases) {
  const result = matchPath(pattern, pathname);
  console.log("    " + pattern.padEnd(28) + "vs " + pathname.padEnd(22) + "→",
    result ? JSON.stringify(result.params) : "null  ← no match");
}

const twoParams = matchPath("/users/:id/posts/:postId", "/users/42/posts/7");

console.log("\n    Two details already visible above:");
console.log("      • a static pattern (/users/new) simply does NOT match /users/42 —");
console.log("        matching is exact, not fuzzy. Ranking (§5) only ever chooses");
console.log("        between patterns that ALL genuinely match.");
console.log("      • /users/:id does not match /users/42/extra — one `:param` captures");
console.log("        exactly ONE segment. Capturing multiple segments needs a splat. §6\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — EVERY PARAM IS A STRING, AND WHAT THAT COSTS
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the type of every value useParams() ever gives you:\n");

const { params } = matchPath("/users/:id", "/users/42");

console.log("    URL          : /users/42");
console.log("    useParams()  :", JSON.stringify(params));
console.log("    typeof id    :", typeof params.id, "← not 'number'. Never 'number'.");

// The three ways this bites, in increasing order of how long it takes to find.
const strictEquals = params.id === 42;
const looseEquals  = params.id == 42;          // eslint would flag this, and it's the only one that "works"
const plusOne      = params.id + 1;
const numeric      = Number(params.id) + 1;

console.log("\n    params.id === 42 :", strictEquals, strictEquals ? "" : "🐛 false, forever, silently");
console.log("    params.id ==  42 :", looseEquals, "← coercion 'works', which is why the bug hides");
console.log("    params.id + 1    :", JSON.stringify(plusOne), "🐛 string concatenation, not arithmetic");
console.log("    Number(id) + 1   :", numeric, "✅");

// The realistic failure: a client-side lookup against typed data.
const users = [
  { id: 41, name: "Ada" },
  { id: 42, name: "Grace" },
  { id: 43, name: "Alan" },
];

const foundStrict = users.filter(u => u.id === params.id);
const foundCoerced = users.filter(u => u.id === Number(params.id));

console.log("\n    a realistic lookup against typed data (ids are numbers in the store):");
console.log("      users.filter(u => u.id === params.id)          → found", foundStrict.length, "of", users.length, "🐛");
console.log("      users.filter(u => u.id === Number(params.id))  → found", foundCoerced.length, "of", users.length,
  "✅", foundCoerced.length ? "(" + foundCoerced[0].name + ")" : "");

console.log("\n    Why this specific bug survives to production:");
console.log("      • `fetch('/api/users/' + id)` works PERFECTLY with a string — the");
console.log("        URL was always going to be text anyway. The network tab is clean.");
console.log("      • nothing throws. The page renders, just empty, or with a spinner");
console.log("        that never resolves into anything.");
console.log("      • it only breaks where params meet TYPED data: a `.find()`, a");
console.log("        `.filter()`, a Map key, an array index comparison, a === in a");
console.log("        useMemo dependency.");
console.log("\n    The fix is one line at the boundary, and it should include validation,");
console.log("    because a user can put literally anything in a URL:");
console.log("      const id = Number(useParams().id);");
console.log("      if (!Number.isFinite(id)) return <NotFound />;");

const garbageParam = matchPath("/users/:id", "/users/abc").params.id;
console.log("\n    proof that URLs carry arbitrary text: /users/abc →",
  JSON.stringify(garbageParam), "  Number(...) →", Number(garbageParam), "🐛 NaN, unvalidated\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — v6 RANKS ROUTES. SOURCE ORDER DOES NOT DECIDE.
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the real ranking algorithm, implemented and scored:\n");

// This is React Router v6's actual scoring, constant for constant.
const paramRe = /^:\w+$/;
const DYNAMIC_SEGMENT = 3;
const INDEX_ROUTE = 2;
const EMPTY_SEGMENT = 1;
const STATIC_SEGMENT = 10;
const SPLAT_PENALTY = -2;
const isSplat = (s) => s === "*";

function computeScore(path, isIndex = false) {
  const segments = path.split("/");
  let initialScore = segments.length;
  if (segments.some(isSplat)) initialScore += SPLAT_PENALTY;
  if (isIndex) initialScore += INDEX_ROUTE;

  return segments
    .filter((s) => !isSplat(s))
    .reduce(
      (score, segment) =>
        score +
        (paramRe.test(segment) ? DYNAMIC_SEGMENT
         : segment === "" ? EMPTY_SEGMENT
         : STATIC_SEGMENT),
      initialScore
    );
}

// Deliberately written in the WORST possible order — the dynamic route
// first, exactly the ordering that would break React Router v5.
const routeTable = [
  "/users/:id",        // written FIRST
  "/users/new",        // written SECOND — and it still wins for /users/new
  "/users/:id/edit",
  "/users",
  "/users/*",
];

console.log("    routes, in the order they were written in JSX:");
for (const p of routeTable) {
  console.log("      score " + String(computeScore(p)).padStart(3) + "   " + p);
}

function resolveRoute(pathname) {
  const matches = routeTable
    .map((pattern) => ({ pattern, score: computeScore(pattern), match: matchPath(pattern, pathname) }))
    .filter((r) => r.match !== null)
    .sort((a, b) => b.score - a.score);
  return matches.length ? matches[0] : null;
}

const forNew = resolveRoute("/users/new");
const for42 = resolveRoute("/users/42");
const forEdit = resolveRoute("/users/42/edit");
const forDeep = resolveRoute("/users/42/a/b/c");

console.log("\n    resolving real pathnames against that table:");
console.log("      /users/new      → matched", forNew.pattern.padEnd(18), "(score " + forNew.score + ")",
  forNew.pattern === "/users/new" ? "✅ static beat dynamic" : "🐛");
console.log("      /users/42       → matched", for42.pattern.padEnd(18), "(score " + for42.score + ")", JSON.stringify(for42.match.params));
console.log("      /users/42/edit  → matched", forEdit.pattern.padEnd(18), "(score " + forEdit.score + ")", JSON.stringify(forEdit.match.params));
console.log("      /users/42/a/b/c → matched", forDeep.pattern.padEnd(18), "(score " + forDeep.score + ")", JSON.stringify(forDeep.match.params));

// Both /users/new and /users/:id genuinely match "/users/new" — ranking is
// what picks between them, not the order they appear in.
const bothMatchNew = ["/users/new", "/users/:id"].filter(p => matchPath(p, "/users/new") !== null);

console.log("\n    the key demonstration:");
console.log("      patterns that ALL genuinely match /users/new :", JSON.stringify(bothMatchNew));
console.log("      scores                                       :",
  bothMatchNew.map(p => p + "=" + computeScore(p)).join(", "));
console.log("      winner                                       :", forNew.pattern, "— the HIGHER score");
console.log("      note /users/:id was written FIRST in the table above, and lost anyway.");

console.log("\n    Why the scores come out this way, plainly:");
console.log("      static segment  = 10  (most specific — an exact literal)");
console.log("      dynamic :param  =  3  (less specific — matches anything)");
console.log("      empty segment   =  1  (the leading slash)");
console.log("      index route     = +2  (a tie-break bonus)");
console.log("      contains splat  = -2  (a penalty — least specific of all)");
console.log("\n    This is the v5 → v6 change worth naming explicitly: in v5 the FIRST");
console.log("    match in source order won, so you had to hand-order routes with");
console.log("    <Switch> and remember to put /users/new above /users/:id. In v6 you");
console.log("    cannot get that wrong by reordering, because order is not consulted.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — SPLAT PARAMS AND URL DECODING
// ══════════════════════════════════════════════════════════════════

console.log("§6 — the two params that behave differently:\n");

const splat = matchPath("/files/*", "/files/docs/2024/report.pdf");
console.log("    splat pattern  : /files/*");
console.log("      URL          : /files/docs/2024/report.pdf");
console.log("      params       :", JSON.stringify(splat.params));
console.log("      the key is literally \"*\", and the value KEEPS its slashes ← that is");
console.log("      the whole point: one `:param` captures one segment, a splat captures");
console.log("      the entire remainder however deep it goes.");
console.log("\n      typical uses: a file browser, a docs site, a catch-all 404 route");
console.log("      (`path=\"*\"`), or handing the rest of the path to a nested router.");
console.log("      and it scores LOWEST (" + computeScore("/files/*") + ") on purpose — a splat should only win when");
console.log("      nothing more specific matched.");

// Decoding: React Router runs decodeURIComponent on each captured value.
const spaced = matchPath("/users/:name", "/users/john%20doe");
const plussed = matchPath("/search/:q", "/search/c%2B%2B");
const slashed = matchPath("/users/:name", "/users/a%2Fb");

console.log("\n    URL decoding — useParams gives you DECODED values:");
console.log("      /users/john%20doe → ", JSON.stringify(spaced.params), "← %20 became a real space");
console.log("      /search/c%2B%2B   → ", JSON.stringify(plussed.params), "← %2B became a real '+'");
console.log("      /users/a%2Fb      → ", JSON.stringify(slashed.params), "← %2F became a real '/' INSIDE one param");

console.log("\n    That last one is the subtle one: an ENCODED slash (%2F) stays inside a");
console.log("    single param, because the regex matched the raw, still-encoded text");
console.log("    before decoding happened. So a param value CAN contain a slash — which");
console.log("    means code that splits a param on '/' to 'get the parts' is making an");
console.log("    assumption the router never guaranteed.");
console.log("\n    And the mirror-image rule when BUILDING a URL: encode the value, or a");
console.log("    name containing '/' or '?' silently changes which route matches:");
console.log("      ❌ `/users/${name}`                        with name = 'a/b'");
console.log("      ✅ `/users/${encodeURIComponent(name)}`\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHICH params DOES useParams() ACTUALLY RETURN?
// ══════════════════════════════════════════════════════════════════
//
// useParams() returns the params of the ROUTE THE CALLING COMPONENT WAS
// RENDERED BY — merged with every param captured by its ancestor routes.
// It is not global, and it is not "the params of the deepest match" from
// the perspective of an unrelated component.
//
//   <Route path="/users/:userId" element={<UserLayout />}>
//     <Route path="posts/:postId" element={<Post />} />
//   </Route>
//
//   inside <UserLayout /> : useParams() → { userId: "42" }
//   inside <Post />       : useParams() → { userId: "42", postId: "7" }
//                                          ▲ inherited from the parent route
//
// Two consequences worth stating:
//   • a child sees its ancestors' params for free — you never need to prop-
//     drill `userId` down to <Post />.
//   • a param name reused at two nesting levels means the CHILD's value
//     shadows the parent's in the merged object. Reusing `:id` at multiple
//     depths is therefore a real (and confusing) footgun; name them
//     `:userId` / `:postId`, not `:id` / `:id`.
//
// The nesting machinery that makes this work — matched route chains and
// <Outlet /> — is file 03's entire subject. It is mentioned here only so
// that "useParams returns params" doesn't get memorised as "useParams
// returns THE params, globally", which is the wrong mental model.


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A detail page that renders "not found" for a record that
//   definitely exists: `users.find(u => u.id === params.id)` comparing a
//   number to a string. Nothing throws. → §4.
//
// Bug 2 — An ID that becomes "421" instead of 43: `params.id + 1` is string
//   concatenation. → §4.
//
// Bug 3 — A useEffect that refetches on every render: `[Number(params.id)]`
//   is fine, but `[{ id: params.id }]` or any freshly-built object in the
//   dependency array is a new identity each time. (06_design-patterns' truth
//   #2 — identity decides everything — applies here unchanged.)
//
// Bug 4 — NaN reaching an API call: `Number(params.id)` on /users/abc is
//   NaN, and `fetch('/api/users/NaN')` is a real request that 404s
//   confusingly. Validate with Number.isFinite. → §4.
//
// Bug 5 — Upgrading v5 → v6 and finding routes now match "the wrong one":
//   v5 used source order, v6 uses ranking. Routes that were carefully
//   hand-ordered are now scored, and a `<Switch>`-era ordering trick can
//   produce a different (usually more correct) result. → §5.
//
// Bug 6 — A "/users/new" page that renders the user-detail component with
//   `id: "new"`: this is the v5 ordering bug. In v6 it cannot happen from
//   ordering — but it CAN still happen if you never defined /users/new at
//   all, and `/users/:id` legitimately matches it. → §5.
//
// Bug 7 — A file-path route that truncates at the first slash: using
//   `:path` where a splat `*` was needed. One `:param` is exactly one
//   segment. → §3, §6.
//
// Bug 8 — A user named "a/b" producing a 404 or matching a different route:
//   the value was interpolated into a URL without encodeURIComponent. → §6.
//
// Bug 9 — Code that does `params.filePath.split('/')` and breaks on an
//   encoded slash: %2F decodes to a real '/' INSIDE one param value. → §6.
//
// Bug 10 — A nested component reading `params.id` and getting the wrong
//   level's value because `:id` was reused at two depths — the child
//   shadows the parent in the merged object. → §7.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// Matching:
assert(JSON.stringify(params) === '{"id":"42"}',
  "/users/:id against /users/42 captured exactly { id: '42' }");
assert(twoParams.params.id === "42" && twoParams.params.postId === "7",
  "two dynamic segments captured both values, by name");
assert(matchPath("/users/new", "/users/42") === null,
  "a static pattern does NOT fuzzily match a different value — matching is exact");
assert(matchPath("/users/:id", "/users/42/extra") === null,
  "one :param captures exactly ONE segment, never two");

// The one fact:
assert(typeof params.id === "string",
  "every param is a STRING — a URL has no types ✅ (the fact this whole file rests on)");
assert(params.id === "42" && (params.id === 42) === false,
  "…so `params.id === 42` is false, forever, and silently 🐛");
assert(plusOne === "421",
  "…and `params.id + 1` concatenates instead of adding 🐛");
assert(foundStrict.length === 0 && foundCoerced.length === 1,
  "a === lookup against typed data found 0 of 3; Number() coercion found exactly 1 🐛→✅");
assert(Number.isNaN(Number(garbageParam)),
  "…and an unvalidated Number() on arbitrary URL text produces NaN 🐛");

// Ranking:
assert(computeScore("/users/new") > computeScore("/users/:id"),
  "a static segment scores higher than a dynamic one — specificity wins");
assert(bothMatchNew.length === 2,
  "BOTH /users/new and /users/:id genuinely match /users/new — ranking is what decides");
assert(routeTable.indexOf("/users/:id") < routeTable.indexOf("/users/new"),
  "…and /users/:id was written FIRST in the route table");
assert(forNew.pattern === "/users/new",
  "…yet /users/new still won: v6 ignores source order entirely ✅");
assert(computeScore("/users/*") < computeScore("/users/:id"),
  "a splat scores LOWER than a dynamic param — it should only win as a last resort");
assert(for42.pattern === "/users/:id" && forEdit.pattern === "/users/:id/edit",
  "the more specific multi-segment pattern wins for the deeper URL");

// Splat and decoding:
assert(splat.params["*"] === "docs/2024/report.pdf",
  "a splat param is keyed '*' and KEEPS its slashes — it captures the whole remainder ✅");
assert(spaced.params.name === "john doe",
  "params are decodeURIComponent'd: %20 arrives as a real space");
assert(slashed.params.name === "a/b",
  "…including %2F, which becomes a real slash INSIDE a single param value 🐛→ worth knowing");

console.log("§9 — mini assertions passed for: Route params & useParams");
console.log("\n  The pair that captures it: the same URL /users/42 produced the string");
console.log("  \"42\", which found 0 of 3 users with === and 1 of 3 with Number() — while");
console.log("  /users/new matched the static route despite the dynamic one being written");
console.log("  first, because v6 scored them " + computeScore("/users/new") + " vs " + computeScore("/users/:id") + " and never looked at order.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do route params work in React Router v6?", answer:
//
//   "A `:name` in a route pattern is a dynamic segment. The router compiles
//    the pattern into a regex with a capture group per param, matches it
//    against the pathname, decodes each captured value, and useParams()
//    hands you the result as an object.
//
//    The single most important detail is that every value is a STRING —
//    always, even for /users/42. A URL has no types. That causes a bug that
//    is nastier than it sounds because it fails silently: `fetch('/api/users/'
//    + id)` works perfectly with a string, so the network layer looks fine,
//    but any client-side comparison against typed data breaks. I've measured
//    it — filtering a list of users where ids are numbers, `u.id ===
//    params.id` found zero of three, and wrapping it in Number() found
//    exactly one. Nothing throws either way. So I convert at the boundary
//    and validate, because a user can put anything in a URL —
//    Number(params.id) on /users/abc is NaN, and NaN in a fetch URL is a
//    real request that 404s confusingly.
//
//    The other thing worth knowing is that v6 RANKS routes rather than
//    using source order. Every pattern gets a score — static segments are
//    worth 10, dynamic params 3, an index route gets a small bonus, and a
//    splat is actually penalised — and the highest-scoring match that
//    genuinely matches wins. I can demonstrate it: put /users/:id FIRST in
//    the route table and /users/new second, and /users/new still wins for
//    the URL /users/new, because it scores 24 against 17. That's a real
//    change from v5, where the first match in source order won and you had
//    to hand-order routes inside a Switch to avoid exactly that bug.
//
//    Two smaller details I'd mention: a splat, `*`, is the one param that
//    captures multiple segments including slashes — it's how you do file
//    paths or a catch-all — and params come back decodeURIComponent'd, so
//    an encoded %2F arrives as a real slash inside a single param value.
//    That means splitting a param on '/' to get its parts is an assumption
//    the router never actually promised."
//
// Leading with "every param is a string, and here's the measurement" and
// then volunteering the v5→v6 ranking change is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What type does useParams() return for /users/42?
// A1. `{ id: "42" }` — a string. Always a string; URLs have no types.
//
// Q2. Why is that a dangerous default?
// A2. It fails silently — API calls work fine with strings, so the bug only
//     appears where a param meets typed data (===, .find, a Map key).
//
// Q3. How do you fix it properly?
// A3. Convert once at the boundary AND validate: `const id =
//     Number(useParams().id); if (!Number.isFinite(id)) → not found`.
//
// Q4. Does the order you write routes in decide which one matches in v6?
// A4. No — v6 ranks by a computed score. v5 did use source order, which is
//     the change to name.
//
// Q5. How is the score computed, roughly?
// A5. Static segment 10, dynamic param 3, empty segment 1, index route +2,
//     and a splat is penalised -2 — so specificity wins.
//
// Q6. Both /users/new and /users/:id match /users/new. Which wins and why?
// A6. /users/new — it scores higher (24 vs 17) because a static segment is
//     more specific than a dynamic one.
//
// Q7. What does a splat (`*`) capture, and how is it keyed?
// A7. The entire remaining path INCLUDING slashes, under the key "*".
//
// Q8. Why is a splat scored lower than a dynamic param?
// A8. Deliberately — it's the least specific pattern, so it should only win
//     when nothing more specific matched (catch-all / 404 routes).
//
// Q9. Are param values URL-decoded?
// A9. Yes — useParams gives decoded values, so %20 is a space and %2F is a
//     literal slash inside one param.
//
// Q10. Can a single param value contain a slash?
// A10. Yes, via %2F — which is why splitting a param on '/' is unsafe.
//
// Q11. What params does a nested component's useParams() see?
// A11. Its own route's params merged with all ancestor routes' params — and
//      a reused name at a deeper level shadows the shallower one.
//
// Q12. What's the correct way to build a URL from a user-supplied value?
// A12. encodeURIComponent it — otherwise a value containing '/' or '?'
//      changes which route matches.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What type is every route param?
//   Back : String. Always. Even /users/42 gives "42".
//
// Flashcard 2:
//   Front: Why does the string bug survive to production?
//   Back : It fails silently — fetch works fine with strings; only typed
//          comparisons break.
//
// Flashcard 3:
//   Front: Does route order decide matching in v6?
//   Back : No — ranking by score does. That's the v5 → v6 change.
//
// Flashcard 4:
//   Front: The score values?
//   Back : static 10, dynamic 3, empty 1, index +2, splat -2.
//
// Flashcard 5:
//   Front: What does a splat capture?
//   Back : The whole remaining path, slashes included, keyed "*".
//
// Flashcard 6:
//   Front: How many segments does one `:param` capture?
//   Back : Exactly one. Use a splat for more.
//
// Flashcard 7:
//   Front: Are params decoded?
//   Back : Yes — %20 is a space, %2F is a real slash inside one value.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "Convert and validate at the boundary — and v6 ranks, it doesn't
//          use source order."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write out the score for /a/:b/c, /a/b/c, /a/*, and /a/:b/:c by hand
//   using §5's constants, then verify each with computeScore().
//
// Task 2:
//   Build a route table where a splat and a dynamic param both match the
//   same URL. Confirm which wins and explain the score gap.
//
// Task 3:
//   Reproduce §4's zero-results bug in a real app, then fix it and add a
//   test that would have caught it.
//
// Task 4:
//   Feed matchPath() a URL with an encoded slash in a param and write code
//   that handles it correctly (no naive .split('/')).
//
// Task 5:
//   Take an existing v5 `<Switch>` route list that relies on ordering,
//   compute every route's v6 score, and predict which matches change.
//
// Task 6:
//   Add optional-param support (`:id?`) to compilePath() and decide what
//   score it should get relative to a required param.
//
// Task 7:
//   Build a `useTypedParams(schema)` helper that converts and validates
//   every param in one place and returns typed values or a not-found flag.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Every param is a string. Convert and validate at the boundary, because
//   the failure is silent everywhere except one `===` you didn't think
//   about.
//
// If you remember the common bug:
//   A lookup that finds nothing because a number was compared to a string —
//   0 of 3, no error, clean network tab.
//
// If you remember the professional framing:
//   v6 ranks routes by specificity instead of source order, so the "put the
//   static route above the dynamic one" discipline from v5 is now the
//   router's job, not yours.
//
// NEXT TOPIC -> 03_nested-routes-outlet.js
