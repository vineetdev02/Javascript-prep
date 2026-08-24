// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Router v6  →  01_browserrouter-vs-hashrouter.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: BrowserRouter vs HashRouter
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: THE FRAGMENT IS NEVER
//      SENT TO THE SERVER — proven with Node's real URL parser
//   2. Why BrowserRouter 404s on refresh without server config, and
//      HashRouter never does — a simulated static server, both cases
//   3. The two browser APIs underneath: history.pushState vs the hash
//      fragment + 'hashchange'
//   4. What HashRouter costs: no SSR, degraded SEO, analytics that need
//      extra wiring, and an ugly URL — each one traced to fact #1
//   5. MemoryRouter, and why every test in this file's group would use it
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/07_react-router-v6/01_browserrouter-vs-hashrouter.js"
//
// Prerequisites: none beyond 06_design-patterns/05_provider-pattern.js —
// every Router IS a provider (that is literally what <BrowserRouter> is: a
// context provider publishing the current location), so 05's "one writer,
// many readers, and every reader wakes on every write" applies to routing
// exactly as written.
//
// This is file 01 of ◆ React Router v6, the second group of Section 2A.5.
// It comes first because every other file in this group — params, nested
// routes, guards, navigation, search params, lazy loading, loaders —
// assumes a Router is already in place and never questions WHICH one. This
// file is where that choice gets made, and it is the only routing decision
// that involves your server rather than your components.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// BrowserRouter:
// A Router that stores the current location in the real URL path
// (/users/42) using the HTML5 History API, so the server sees — and must
// know how to answer — every route your app can reach.
//
// HashRouter:
// A Router that stores the current location in the URL FRAGMENT
// (/#/users/42), which browsers never transmit to the server, so the server
// only ever sees "/" and needs no routing configuration at all.
//
// If interviewer says "explain it simply", say:
//   "Both put the current route in the URL. BrowserRouter puts it in the
//    PATH, HashRouter puts it after a '#'. The one fact that decides
//    everything else is that the browser never sends the part after '#' to
//    the server — so with HashRouter your server literally cannot know
//    which page the user is on, and with BrowserRouter it has to."
//
// If interviewer says "which should I use?", say:
//   "BrowserRouter, by default — real URLs, SSR-capable, better for SEO
//    and analytics. HashRouter is a fallback for when you genuinely cannot
//    configure the server: a static host with no rewrite rules, a file://
//    deployment, an app embedded somewhere you don't control, or a legacy
//    server you're not allowed to touch."
//
// Why it matters in interviews:
//   This is the one routing question whose answer lives OUTSIDE your React
//   code. A candidate who says "BrowserRouter is prettier" has memorised a
//   preference. A candidate who says "the fragment never reaches the
//   server, so BrowserRouter needs a rewrite rule and HashRouter doesn't"
//   has understood the mechanism, and can then derive the SSR and SEO
//   consequences on the spot instead of reciting them.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   THE SERVER SEES THE PATH. THE SERVER NEVER SEES THE FRAGMENT.
//
// Runtime rule:
//   A Router is a provider (06_design-patterns/05) that publishes a
//   `location` object. The only difference between these two is WHERE that
//   location is read from and written to:
//     BrowserRouter → window.location.pathname + history.pushState()
//     HashRouter    → window.location.hash    + the 'hashchange' event
//   Everything above the Router — Routes, useParams, useNavigate, Outlet —
//   is identical for both. They are interchangeable at the top of the tree
//   and invisible everywhere else.
//
// Practical rule:
//   Choose BrowserRouter and add the one-line server rewrite ("serve
//   index.html for any path that isn't a real file"). Choose HashRouter
//   only when you can prove that rewrite is impossible.
//
// Common trap:
//   Developing with a dev server (Vite, CRA, webpack-dev-server) that
//   already does the SPA rewrite for you, shipping to a static host that
//   doesn't, and discovering that every deep link 404s on refresh — while
//   in-app navigation works perfectly, because in-app navigation never
//   touches the server at all. §4 reproduces exactly that asymmetry.
//
// The mental picture:
//
//   BrowserRouter                        HashRouter
//   https://app.com/users/42             https://app.com/#/users/42
//                  └─────┬─────┘                        └─────┬─────┘
//                        │                                    │
//              SENT to the server              NEVER sent to the server
//                        │                                    │
//                        ▼                                    ▼
//     GET /users/42  ──▶ server must              GET /  ──▶ server always
//                        answer this                          answers this
//                        (rewrite needed)                     (no config needed)
//                        │                                    │
//                        ▼                                    ▼
//              index.html + JS boots              index.html + JS boots
//              React reads location.pathname      React reads location.hash


// ══════════════════════════════════════════════════════════════════
// § 3 — THE ONE FACT, PROVEN WITH A REAL URL PARSER
// ══════════════════════════════════════════════════════════════════

console.log("§3 — what the server actually receives, measured with Node's real URL class:\n");

// Not a simulation: this is the same WHATWG URL parser browsers use.
const browserUrl = new URL("https://app.com/users/42/settings?tab=profile");
const hashUrl    = new URL("https://app.com/#/users/42/settings?tab=profile");

// The HTTP request line a browser builds is "GET " + pathname + search.
// The fragment is deliberately excluded by the URL spec — it is a
// CLIENT-SIDE identifier, and always has been.
const requestLine = (u) => "GET " + u.pathname + u.search;

console.log("    BrowserRouter URL :", browserUrl.href);
console.log("      pathname (sent) :", JSON.stringify(browserUrl.pathname));
console.log("      search   (sent) :", JSON.stringify(browserUrl.search));
console.log("      hash (NOT sent) :", JSON.stringify(browserUrl.hash), "← empty");
console.log("      → request line  :", JSON.stringify(requestLine(browserUrl)));

console.log("\n    HashRouter URL    :", hashUrl.href);
console.log("      pathname (sent) :", JSON.stringify(hashUrl.pathname), "← just a slash");
console.log("      search   (sent) :", JSON.stringify(hashUrl.search), "← empty!");
console.log("      hash (NOT sent) :", JSON.stringify(hashUrl.hash), "← the ENTIRE route lives here");
console.log("      → request line  :", JSON.stringify(requestLine(hashUrl)));

console.log("\n    Read the two request lines again. They are the whole file:");
console.log("      the server can distinguish", JSON.stringify(browserUrl.pathname), "from any other route");
console.log("      the server sees", JSON.stringify(hashUrl.pathname), "for EVERY route in the entire app");
console.log("\n    Note the second detail people miss: with HashRouter the QUERY STRING");
console.log("    moved inside the fragment too, so `?tab=profile` is also invisible to");
console.log("    the server. That is why HashRouter breaks server-side reading of query");
console.log("    params, not only paths. → §6\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE 404-ON-REFRESH BUG, REPRODUCED AND FIXED
// ══════════════════════════════════════════════════════════════════

console.log("§4 — a static host with no rewrite rule, and both routers refreshed:\n");

// A minimal static file server: it serves files that exist on disk, and
// 404s on everything else. This is the DEFAULT behaviour of nginx, Apache,
// S3 static hosting, GitHub Pages, and every dev server BEFORE anyone adds
// the SPA fallback.
const filesOnDisk = new Set(["/index.html", "/assets/app.js", "/assets/style.css"]);

function staticServer(pathname, { spaRewrite = false } = {}) {
  if (pathname === "/") return { status: 200, served: "/index.html" };
  if (filesOnDisk.has(pathname)) return { status: 200, served: pathname };
  if (spaRewrite) return { status: 200, served: "/index.html  (rewritten)" };
  return { status: 404, served: null };
}

const deepLinkBrowser = new URL("https://app.com/users/42/settings").pathname;
const deepLinkHash    = new URL("https://app.com/#/users/42/settings").pathname;

const browserNoRewrite = staticServer(deepLinkBrowser);
const hashNoRewrite    = staticServer(deepLinkHash);
const browserWithRewrite = staticServer(deepLinkBrowser, { spaRewrite: true });

console.log("    The user is on /users/42/settings and presses REFRESH (F5).");
console.log("    No SPA rewrite rule configured:");
console.log("      BrowserRouter → server gets", JSON.stringify(deepLinkBrowser),
  "→", browserNoRewrite.status, browserNoRewrite.status === 404 ? "🐛 the app never even loads" : "");
console.log("      HashRouter    → server gets", JSON.stringify(deepLinkHash),
  "→", hashNoRewrite.status, hashNoRewrite.status === 200 ? "✅ index.html, every time" : "");

console.log("\n    The SAME BrowserRouter deep link, WITH the rewrite rule:");
console.log("      BrowserRouter → server gets", JSON.stringify(deepLinkBrowser),
  "→", browserWithRewrite.status, "served:", browserWithRewrite.served, "✅");

console.log("\n    The rewrite rule itself is one line, on every platform:");
console.log("      nginx      : try_files $uri $uri/ /index.html;");
console.log("      Apache     : FallbackResource /index.html");
console.log("      Netlify    : /*  /index.html  200        (in _redirects)");
console.log("      Vercel     : { \"rewrites\": [{ \"source\": \"/(.*)\", \"destination\": \"/\" }] }");
console.log("      Express    : app.get('*', (req, res) => res.sendFile(indexHtml))");

console.log("\n    And here is the asymmetry that makes this bug survive code review:");
const inAppNavigationHitsServer = false;   // pushState never makes a request
console.log("      does clicking a <Link> inside the app hit the server?", inAppNavigationHitsServer, "← no");
console.log("      does refreshing / pasting the URL hit the server?    true  ← yes");
console.log("    So in-app navigation to /users/42/settings works PERFECTLY on a broken");
console.log("    server, and only a refresh, a bookmark, or a shared link exposes it.");
console.log("    That is why this ships to production: the dev server had the rewrite,");
console.log("    and nobody refreshed a deep link before release. 🐛\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — THE TWO BROWSER APIS UNDERNEATH
// ══════════════════════════════════════════════════════════════════

console.log("§5 — what each Router actually calls when you navigate:\n");

// A faithful model of the two mechanisms. Both maintain a stack and a
// current index; the difference is which part of the URL they write, and
// which event fires.
function createHistoryModel(kind) {
  const entries = [];
  let index = -1;
  const events = [];

  function urlFor(route) {
    return kind === "browser" ? "https://app.com" + route : "https://app.com/#" + route;
  }

  return {
    kind,
    push(route) {
      // BrowserRouter: history.pushState(state, "", route)   — no event fires
      // HashRouter   : location.hash = route                  — 'hashchange' fires
      entries.length = index + 1;         // truncate any forward history
      entries.push(urlFor(route));
      index = entries.length - 1;
      events.push(kind === "browser" ? "pushState (no event)" : "hashchange");
    },
    back() {
      if (index > 0) index--;
      events.push(kind === "browser" ? "popstate" : "hashchange");
    },
    get current() { return entries[index]; },
    get depth() { return entries.length; },
    get eventLog() { return events; },
    get serverSees() { return new URL(entries[index]).pathname; },
  };
}

const browserHistory = createHistoryModel("browser");
const hashHistory = createHistoryModel("hash");

for (const h of [browserHistory, hashHistory]) {
  h.push("/");
  h.push("/users");
  h.push("/users/42");
}

console.log("    after navigating  /  →  /users  →  /users/42 :");
console.log("      BrowserRouter current URL :", browserHistory.current);
console.log("      HashRouter    current URL :", hashHistory.current);
console.log("      history depth (both)      :", browserHistory.depth, "and", hashHistory.depth, "— identical");
console.log("      server would see (Browser):", JSON.stringify(browserHistory.serverSees));
console.log("      server would see (Hash)   :", JSON.stringify(hashHistory.serverSees), "← unchanged the whole time");

browserHistory.back();
hashHistory.back();

console.log("\n    events fired along the way:");
console.log("      BrowserRouter:", JSON.stringify(browserHistory.eventLog));
console.log("      HashRouter   :", JSON.stringify(hashHistory.eventLog));

console.log("\n    Two details worth knowing precisely:");
console.log("      • history.pushState() fires NO event. The Router knows the location");
console.log("        changed because IT called pushState — that is why you must navigate");
console.log("        through the Router (<Link>, useNavigate) and not by touching");
console.log("        window.history directly, or React never re-renders. → file 06");
console.log("      • 'popstate' fires on back/forward for BrowserRouter; 'hashchange'");
console.log("        fires for HashRouter on every change including back/forward.");
console.log("      • the BACK BUTTON works identically for both — this is the thing");
console.log("        people wrongly assume HashRouter breaks. It does not.\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — WHAT HashRouter COSTS, DERIVED FROM §3
// ══════════════════════════════════════════════════════════════════

console.log("§6 — every HashRouter downside traced back to one fact:\n");

// Each of these is a direct consequence of "the fragment is not sent".
// Nothing here is a separate fact to memorise.
const consequences = [
  ["server-side rendering",  "impossible",  "the server cannot know which route to render"],
  ["SEO / crawlers",         "degraded",    "the canonical URL is the same for every page"],
  ["server-side redirects",  "impossible",  "the server cannot see the route to redirect from"],
  ["server access logs",     "useless",     "every request logs as GET /"],
  ["CDN / edge caching",     "one entry",   "all routes share a single cache key: /"],
  ["query params server-side", "invisible", "?a=b after # is part of the fragment (§3)"],
  ["URL aesthetics",         "ugly",        "/#/users/42 instead of /users/42"],
];

console.log("      " + "capability".padEnd(27) + "under HashRouter".padEnd(18) + "why");
console.log("      " + "─".repeat(78));
for (const [what, status, why] of consequences) {
  console.log("      " + what.padEnd(27) + status.padEnd(18) + why);
}

console.log("\n    Notice what is NOT on that list: in-app navigation, the back button,");
console.log("    deep links WITHIN the app, bookmarks, params, nested routes, guards.");
console.log("    All of those work identically. HashRouter is not a crippled router —");
console.log("    it is a router that has traded SERVER awareness for ZERO server config.");
console.log("\n    Which makes the decision a deployment question, not a React question:");
console.log("      can you configure the server?  →  BrowserRouter");
console.log("      genuinely cannot?              →  HashRouter, and you accept the table above\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — MemoryRouter: THE THIRD ONE, AND WHY TESTS USE IT
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the Router with no URL at all:\n");

// MemoryRouter keeps the history stack in a plain JS array and never
// touches window.location. That makes it the only Router that works where
// there IS no window — tests (jsdom or not), React Native, and SSR.
function createMemoryHistory(initialEntries = ["/"], initialIndex = null) {
  const entries = [...initialEntries];
  let index = initialIndex ?? entries.length - 1;
  return {
    push(route) { entries.length = index + 1; entries.push(route); index = entries.length - 1; },
    back() { if (index > 0) index--; },
    get current() { return entries[index]; },
    get entries() { return [...entries]; },
    touchesWindow: false,
  };
}

const memory = createMemoryHistory(["/users/42/settings"]);   // start deep, instantly

console.log("    MemoryRouter initialEntries: [\"/users/42/settings\"]");
console.log("      current location    :", JSON.stringify(memory.current));
console.log("      reads window.location?", memory.touchesWindow, "← never");
console.log("      needs a server?      false");
console.log("      needs a browser?     false");

memory.push("/users/42/billing");
console.log("      after one push()    :", JSON.stringify(memory.current), " stack:", JSON.stringify(memory.entries));

console.log("\n    This is why every routing test in a real codebase uses MemoryRouter:");
console.log("      <MemoryRouter initialEntries={['/users/42/settings']}>");
console.log("        <App />");
console.log("      </MemoryRouter>");
console.log("\n    You start the test ALREADY on the route under test — no navigating to");
console.log("    get there, no URL to clean up between tests, no window to mock. The");
console.log("    three Routers are interchangeable precisely because everything above");
console.log("    them (Routes, useParams, Outlet, useNavigate) never asks which one it");
console.log("    is inside. → that interchangeability is what makes files 02-09 possible\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Every deep link 404s in production, and nothing 404s in dev:
//   The dev server does the SPA rewrite; the static host doesn't. → §4.
//
// Bug 2 — "It works when I click, it breaks when I refresh":
//   The exact same bug as 1, described by a user instead of a developer.
//   Clicking never touches the server; refreshing always does. → §4.
//
// Bug 3 — Shared links and bookmarks are broken for everyone except the
//   person who navigated there in-app: same root cause again. → §4.
//
// Bug 4 — Migrating HashRouter → BrowserRouter and silently breaking every
//   existing bookmark and shared link on the internet: /#/users/42 does not
//   redirect to /users/42 by itself. You need a one-time client-side
//   migration that reads location.hash on boot and replaces it. → §3.
//
// Bug 5 — Server-side query params are empty under HashRouter:
//   ?tab=profile after the # is part of the FRAGMENT, so it never arrives.
//   Analytics and server-rendered filters both silently see nothing. → §3.
//
// Bug 6 — SSR "works" locally and renders the wrong page in production:
//   HashRouter + SSR is a contradiction — the server has no route to
//   render. → §6.
//
// Bug 7 — Analytics reports 100% of traffic on "/":
//   Server access logs under HashRouter, exactly as §6's table predicts.
//   Client-side page-view tracking has to be wired manually.
//
// Bug 8 — Navigating with window.history.pushState() directly and React
//   not re-rendering: pushState fires no event, so the Router never
//   learns. Navigate through the Router. → §5, file 06.
//
// Bug 9 — A test suite that mutates the real URL and leaks state between
//   tests: use MemoryRouter with initialEntries instead. → §7.
//
// Bug 10 — Assuming HashRouter breaks the back button:
//   It doesn't — §5 shows identical history depth and working back for
//   both. The costs are all server-side, never navigation-side.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// The one fact:
assert(browserUrl.pathname === "/users/42/settings",
  "BrowserRouter puts the whole route in the pathname — the server can see it");
assert(hashUrl.pathname === "/",
  "HashRouter's pathname is just '/' — the server sees the SAME thing for every route 🐛");
assert(browserUrl.hash === "",
  "…BrowserRouter uses no fragment at all");
assert(hashUrl.hash === "#/users/42/settings?tab=profile",
  "…while HashRouter's ENTIRE route, query string included, lives in the fragment");
assert(hashUrl.search === "" && browserUrl.search === "?tab=profile",
  "the query string is invisible to the server under HashRouter, visible under BrowserRouter 🐛");

// The 404 bug:
assert(browserNoRewrite.status === 404,
  "refreshing a BrowserRouter deep link on a server with no rewrite → 404 🐛");
assert(hashNoRewrite.status === 200,
  "…the identical route under HashRouter → 200, because the server only ever saw '/' ✅");
assert(browserWithRewrite.status === 200,
  "…and one rewrite rule fixes BrowserRouter completely ✅");
assert(inAppNavigationHitsServer === false,
  "in-app navigation never reaches the server — which is exactly why this bug hides");

// The mechanisms:
assert(browserHistory.depth === hashHistory.depth && browserHistory.depth === 3,
  "both Routers built an identical 3-entry history stack — navigation is the same");
assert(browserHistory.eventLog.every(e => e.startsWith("pushState")) === false,
  "…but their event logs differ: BrowserRouter also fires popstate on back()");
assert(hashHistory.eventLog.filter(e => e === "hashchange").length === 4,
  "HashRouter fires 'hashchange' for all 3 pushes AND the back() — 4 events");
assert(hashHistory.serverSees === "/",
  "…and through all of it the server still only ever sees '/'");

// MemoryRouter:
assert(memory.touchesWindow === false,
  "MemoryRouter never reads window.location — which is why it works in tests and SSR ✅");
assert(memory.entries.length === 2 && memory.current === "/users/42/billing",
  "…while behaving like a normal history stack: start deep, push, current updates");

console.log("§9 — mini assertions passed for: BrowserRouter vs HashRouter");
console.log("\n  The pair that captures it: the same logical route produced the request");
console.log("  line " + JSON.stringify(requestLine(browserUrl)) + " under BrowserRouter");
console.log("  and " + JSON.stringify(requestLine(hashUrl)) + " under HashRouter — and that single difference");
console.log("  turned a refresh into a 404 in one case and a 200 in the other, with");
console.log("  zero difference in the React code above the Router.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what's the difference between BrowserRouter and HashRouter?",
// answer:
//
//   "One fact explains everything: the browser never sends the URL fragment
//    — the part after '#' — to the server. BrowserRouter puts the route in
//    the real path, so a request for /users/42 actually reaches the server
//    as GET /users/42. HashRouter puts it after a hash, so no matter which
//    route the user is on, the server receives GET / — always.
//
//    That single difference is where the practical trade-off comes from.
//    With BrowserRouter, refreshing a deep link sends a real request for a
//    path that has no file behind it, so a static host 404s unless you add
//    an SPA rewrite rule — one line of nginx, or a _redirects file, or a
//    catch-all route in Express. With HashRouter you need none of that,
//    because the server only ever gets asked for '/'.
//
//    The trap I watch for is that this bug is invisible in development.
//    Clicking a Link never touches the server — pushState is purely
//    client-side — so in-app navigation works perfectly even on a
//    completely misconfigured host. Only a refresh, a bookmark, or a shared
//    link exposes it, and dev servers already do the rewrite for you. So
//    it's a class of bug that reliably ships.
//
//    What HashRouter costs, and all of it comes from that same fact: server-
//    side rendering is impossible because the server can't know the route,
//    SEO is degraded because every page has the same canonical URL, server
//    access logs and CDN caching see one entry for the whole app, and query
//    strings after the hash aren't sent either — so server-side reading of
//    query params silently breaks too.
//
//    What HashRouter does NOT cost is anything about navigation itself —
//    the back button, deep links within the app, bookmarks, params, nested
//    routes all work identically. So I default to BrowserRouter plus the
//    rewrite rule, and reach for HashRouter only when I genuinely can't
//    configure the server: a locked-down static host, a file:// deployment,
//    or an app embedded somewhere I don't control.
//
//    And there's a third one worth mentioning: MemoryRouter keeps history
//    in a JS array and never touches window.location, which makes it the
//    right choice for tests — you can start a test already on the route
//    under test with initialEntries — and for anywhere there's no window at
//    all."
//
// Leading with "the fragment is never sent to the server" and deriving the
// SSR/SEO/404 consequences from it — rather than listing them as separate
// memorised facts — is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What's the single technical difference between them?
// A1. Where the location is stored: the path (History API) vs the fragment
//     (hash). The fragment is never transmitted to the server.
//
// Q2. Why does BrowserRouter 404 on refresh?
// A2. The browser makes a real request for a path with no file behind it,
//     and a static server 404s by default. An SPA rewrite fixes it.
//
// Q3. Why doesn't the same thing happen in development?
// A3. Dev servers ship the SPA rewrite already, and in-app navigation never
//     touches the server at all — so nothing exposes the gap.
//
// Q4. Name three things HashRouter makes impossible or worse.
// A4. Server-side rendering, meaningful server access logs / CDN cache
//     keys, and server-side visibility of query params — plus degraded SEO.
//     All from the fragment not being sent.
//
// Q5. Does HashRouter break the back button?
// A5. No — history behaves identically. Every cost is server-side.
//
// Q6. What event fires when you call history.pushState()?
// A6. None. That's why you must navigate through the Router rather than
//     touching window.history directly.
//
// Q7. What fires on back/forward for each?
// A7. 'popstate' for BrowserRouter; 'hashchange' for HashRouter (which also
//     fires on every forward navigation).
//
// Q8. How do you migrate HashRouter → BrowserRouter without breaking
//     existing bookmarks?
// A8. A one-time client-side shim on boot: if location.hash looks like a
//     route, read it and history.replaceState() to the equivalent path.
//
// Q9. What is MemoryRouter for?
// A9. History in a plain array, no window access — tests (start directly on
//     a route via initialEntries), React Native, and SSR.
//
// Q10. Is the choice a React decision or a deployment decision?
// A10. Deployment. The React code above the Router is byte-for-byte
//      identical for all three.
//
// Q11. Your app is served from a CDN with no rewrite capability and SEO
//      matters. What do you do?
// A11. Those two constraints conflict — HashRouter solves the hosting
//      constraint and destroys the SEO one. The real answer is to change a
//      constraint: pre-render/SSG the routes, move to a host that supports
//      rewrites, or accept SEO loss deliberately.
//
// Q12. Why does the query string disappear server-side under HashRouter?
// A12. Because `/#/users/42?tab=profile` puts the '?' INSIDE the fragment —
//      url.search is empty and url.hash holds the whole thing. Proven in §3.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: The one fact behind every difference?
//   Back : The browser never sends the fragment (after '#') to the server.
//
// Flashcard 2:
//   Front: Why does BrowserRouter 404 on refresh?
//   Back : Real request for a path with no file. Fix: SPA rewrite rule.
//
// Flashcard 3:
//   Front: Why is that bug invisible in dev?
//   Back : Dev servers already rewrite, and in-app navigation never hits
//          the server.
//
// Flashcard 4:
//   Front: What does the server see under HashRouter?
//   Back : GET / — for every route in the entire app.
//
// Flashcard 5:
//   Front: Does HashRouter break the back button?
//   Back : No. Every cost is server-side, never navigation-side.
//
// Flashcard 6:
//   Front: What event does history.pushState() fire?
//   Back : None — which is why you navigate through the Router.
//
// Flashcard 7:
//   Front: What is MemoryRouter for?
//   Back : Tests, React Native, SSR — history in an array, no window.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "It's a deployment decision, not a React one — the code above
//          the Router is identical for all three."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Take any URL with a route, query string and fragment, run it through
//   `new URL(...)`, and write down which parts a server receives. Do it
//   until you can predict it without running anything.
//
// Task 2:
//   Deploy a tiny BrowserRouter app to a static host with no rewrite.
//   Confirm in-app navigation works and refresh 404s. Then add the rewrite
//   and confirm the fix.
//
// Task 3:
//   Take the same app, swap BrowserRouter for HashRouter, change nothing
//   else, and confirm every route works with zero server config.
//
// Task 4:
//   Write the one-time migration shim from Bug 4: on boot, if
//   location.hash starts with '#/', replaceState to the equivalent path.
//
// Task 5:
//   Add `?tab=profile` to a HashRouter URL and log what an Express server
//   sees in `req.query`. Explain the result using §3.
//
// Task 6:
//   Call window.history.pushState() directly in a running React Router app
//   and confirm the UI does not update. Then navigate properly and watch it
//   work.
//
// Task 7:
//   Write a routing test with MemoryRouter and initialEntries that starts
//   directly on a deep route, with no navigation step at all.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The fragment is never sent to the server. BrowserRouter needs the
//   server to know your routes; HashRouter guarantees it never can.
//
// If you remember the common bug:
//   Deep links that 404 on refresh but work when clicked — because clicking
//   never touches the server and dev servers already had the rewrite.
//
// If you remember the professional framing:
//   This is a deployment decision, not a React decision. Everything above
//   the Router — files 02 through 09 of this group — is identical either
//   way, which is exactly why they never mention it again.
//
// NEXT TOPIC -> 02_route-params-and-useparams.js
