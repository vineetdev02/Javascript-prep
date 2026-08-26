// ╔══════════════════════════════════════════════════════════════════╗
// ║   React Router v6  →  07_uselocation-and-usesearchparams.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useLocation & useSearchParams
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else follows from: THE URL IS THE STORE —
//      useSearchParams is useState whose state lives somewhere shareable
//   2. The bug that fact causes: MUTATING searchParams changes the object
//      and re-renders NOTHING — measured, with real URLSearchParams
//   3. The stale-snapshot bug: two updates in one handler, and how the
//      functional form saves the first one
//   4. URLSearchParams' four sharp edges: strings only, null vs "",
//      get() vs getAll(), and mutation-in-place
//   5. useLocation's shape — and `key`, the field nobody uses until they
//      need scroll restoration
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.5-patterns-and-architecture/07_react-router-v6/07_uselocation-and-usesearchparams.js"
//
// Prerequisites: 06_usenavigate-programmatic-navigation.js §6 — which ended
// on "if a pasted link should show the same thing, it belongs in search
// params, not state" and deferred the how. This is the how.
//
// Every file so far has read the location: 02 read its pathname, 03 matched
// a chain against it, 04-06 changed it. This file reads the two parts none
// of them touched — the query string and the location object itself — and
// they turn out to be the parts most likely to be misused, because
// useSearchParams LOOKS like useState and behaves differently in two
// specific, measurable ways.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useLocation():
// Returns the current location object — { pathname, search, hash, state,
// key } — a new object on every navigation.
//
// useSearchParams():
// Returns [searchParams, setSearchParams] — a URLSearchParams for reading
// the query string and a setter that navigates to a new one. useState's
// shape, with the URL as the storage.
//
// If interviewer says "explain it simply", say:
//   "useSearchParams is useState where the state lives in the URL. That
//    means it's shareable, bookmarkable, survives refresh, and the back
//    button undoes changes to it for free — because every change is a
//    navigation. The catch is that it only LOOKS like useState: the value
//    is a mutable URLSearchParams object, and mutating it does absolutely
//    nothing to your UI."
//
// If interviewer says "when do you put state in the URL?", say:
//   "Whenever someone should be able to send you a link and have you see
//    the same thing. Filters, sort order, pagination, the active tab, a
//    search query, an open detail panel. Not: form draft text, whether a
//    tooltip is open, or anything secret. My test is whether the URL pasted
//    into Slack should reproduce the view."
//
// Why it matters in interviews:
//   Putting view state in the URL is one of the highest-leverage habits in
//   front-end work — it makes features shareable and gives you undo for
//   free — and useSearchParams is the API that makes it a one-liner. The
//   two bugs in §4 and §5 are what make it a memorable one-liner.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   IT LOOKS LIKE useState. THE VALUE IS MUTABLE AND THE SETTER NAVIGATES.
//
// Runtime rule:
//   searchParams is a real URLSearchParams instance built from
//   location.search. React re-renders when the LOCATION changes, not when
//   that object changes — so mutating it (set/append/delete) updates the
//   object and nothing else. setSearchParams performs a navigation, which
//   produces a new location, which produces a new URLSearchParams, which is
//   what re-renders you.
//
// Practical rule:
//   Treat searchParams as READ-ONLY. To change it, build a new one and hand
//   it to setSearchParams — and prefer the functional form,
//   setSearchParams(prev => …), for the same reason you prefer
//   setCount(c => c + 1).
//
// Common trap:
//   `searchParams.set('page', '2')` and expecting a re-render. It compiles,
//   it runs, the object genuinely changes, the URL does not, and the UI does
//   not. Nothing warns. §4 measures it.
//
// The mental picture:
//
//   useState                         useSearchParams
//   ────────                         ───────────────
//   const [v, setV] = useState()     const [sp, setSp] = useSearchParams()
//   v is immutable-by-convention     sp is a MUTABLE object 🐛
//   setV(next) → re-render           setSp(next) → NAVIGATION → re-render
//   state dies on refresh            state survives refresh, sharing,
//                                      bookmarking, and the back button
//   invisible                        visible in the URL bar
//
//   mutating v.foo = 1 → nothing     mutating sp.set() → nothing 🐛
//                                      (the shape people actually hit)


// ══════════════════════════════════════════════════════════════════
// § 3 — WHAT useLocation ACTUALLY RETURNS
// ══════════════════════════════════════════════════════════════════

console.log("§3 — the five fields, and the one nobody uses until they need it:\n");

// A faithful location object. React Router builds this from the history
// entry; the five fields are exactly these.
function makeLocation(url, { state = null, key = "default" } = {}) {
  const parsed = new URL(url, "https://app.com");
  return { pathname: parsed.pathname, search: parsed.search, hash: parsed.hash, state, key };
}

const loc = makeLocation("/users/42/posts?tag=react&page=2#comments", {
  state: { from: "/users" },
  key: "ab12cd",
});

console.log("    URL: /users/42/posts?tag=react&page=2#comments\n");
const fieldNotes = {
  pathname: "the path — what routes match against (02, 03)",
  search:   "the RAW query string, '?' included — parse it, don't hand-split it",
  hash:     "the fragment — never sent to the server (01 §3)",
  state:    "data attached to this history entry (06 §6) — invisible in the URL",
  key:      "a unique id for THIS history entry",
};
for (const [field, note] of Object.entries(fieldNotes)) {
  console.log("      location." + field.padEnd(10) + JSON.stringify(loc[field]).padEnd(34) + note);
}

console.log("\n    Two things worth knowing about `key`:");
console.log("      • it is unique per HISTORY ENTRY, not per URL. Visit /users twice via");
console.log("        two separate navigations and you get two different keys — which is");
console.log("        exactly what you need to store a scroll position per visit.");
console.log("      • it is the standard remount trigger: <Outlet key={location.key} /> or");
console.log("        <Component key={location.key} /> forces a fresh mount on every");
console.log("        navigation, which is occasionally what you want (resetting a form)");
console.log("        and usually not (it throws away 03 §5's whole benefit).");

// The identity fact that drives effects.
const locA = makeLocation("/users?page=1", { key: "k1" });
const locB = makeLocation("/users?page=2", { key: "k2" });
const sameUrlAgain = makeLocation("/users?page=1", { key: "k3" });

console.log("\n    location object identity:");
console.log("      two DIFFERENT urls        → same object?", Object.is(locA, locB), "← new object, effects re-run");
console.log("      the SAME url, new visit   → same object?", Object.is(locA, sameUrlAgain), "← still new, and a new key");
console.log("      so useEffect(…, [location]) fires on EVERY navigation, including a");
console.log("      re-navigation to the identical URL. If you only care about the path,");
console.log("      depend on location.pathname — a string — not the object. 🐛\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — MUTATING searchParams RE-RENDERS NOTHING
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the bug that makes useSearchParams different from useState:\n");

// A model of how React decides to re-render: Object.is on the value.
function makeReactState(initial) {
  let value = initial;
  let renderCount = 0;
  return {
    get value() { return value; },
    commit(next) {
      if (Object.is(next, value)) return false;   // same reference → no re-render
      value = next;
      renderCount++;
      return true;
    },
    get renderCount() { return renderCount; },
  };
}

// 🐛 the mistake: mutate the object you were handed
const mutatingStore = makeReactState(new URLSearchParams("page=1&sort=date"));
const handed = mutatingStore.value;
handed.set("page", "2");
const mutationRerendered = mutatingStore.commit(handed);   // same reference

console.log("    ❌ searchParams.set('page', '2')");
console.log("       the URLSearchParams object now says :", JSON.stringify(handed.toString()));
console.log("       …so the object DID change           :", handed.get("page") === "2", "✅");
console.log("       did React re-render?                :", mutationRerendered, "🐛 no — same reference");
console.log("       did the URL change?                 : false 🐛 — nothing navigated");

// ✅ the fix: build a new one and hand it to the setter
const settingStore = makeReactState(new URLSearchParams("page=1&sort=date"));
const next = new URLSearchParams(settingStore.value);      // copy
next.set("page", "2");
const setterRerendered = settingStore.commit(next);

console.log("\n    ✅ setSearchParams(next)   (next built as a NEW URLSearchParams)");
console.log("       the new object says                 :", JSON.stringify(next.toString()));
console.log("       did React re-render?                :", setterRerendered, "✅ new reference");
console.log("       did the URL change?                 : true  ✅ — the setter NAVIGATES");

console.log("\n    Why this trips people specifically: with useState, mutating is a mistake");
console.log("    you rarely make because the values are usually primitives or you already");
console.log("    know to copy objects. Here the API HANDS you a mutable object with");
console.log("    inviting methods — set, append, delete, sort — none of which do what the");
console.log("    surrounding React code implies.");
console.log("\n    The reliable habit: treat searchParams as read-only, always.");
console.log("      const next = new URLSearchParams(searchParams);");
console.log("      next.set('page', '2');");
console.log("      setSearchParams(next);");
console.log("\n    …or better, use the functional form. §5.\n");


// ══════════════════════════════════════════════════════════════════
// § 5 — TWO UPDATES IN ONE HANDLER: THE STALE SNAPSHOT
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the same lesson useState taught, in a new costume:\n");

const startingParams = new URLSearchParams("page=1&sort=date");

// 🐛 object form: both updates are computed from the SAME render's snapshot,
// so the second overwrites the first — exactly setCount(count+1) twice.
function objectFormHandler(current) {
  const applied = [];
  const first = new URLSearchParams(current);   // built from the render snapshot
  first.set("page", "2");
  applied.push("set page=2");

  const second = new URLSearchParams(current);  // 🐛 ALSO from the snapshot, not from `first`
  second.set("sort", "name");
  applied.push("set sort=name");

  return { final: second, applied };            // last write wins
}

// ✅ functional form: each update receives the LIVE previous value.
function functionalFormHandler(current) {
  const applied = [];
  let live = new URLSearchParams(current);

  live = ((prev) => { const n = new URLSearchParams(prev); n.set("page", "2"); return n; })(live);
  applied.push("set page=2");

  live = ((prev) => { const n = new URLSearchParams(prev); n.set("sort", "name"); return n; })(live);
  applied.push("set sort=name");

  return { final: live, applied };
}

const objectResult = objectFormHandler(startingParams);
const functionalResult = functionalFormHandler(startingParams);

console.log("    starting query :", JSON.stringify(startingParams.toString()));
console.log("    handler applies: set page=2, then set sort=name\n");
console.log("      ❌ setSearchParams(obj) twice   → " + JSON.stringify(objectResult.final.toString()),
  objectResult.final.get("page") === "2" ? "" : "🐛 page=2 was LOST");
console.log("      ✅ setSearchParams(prev => …)   → " + JSON.stringify(functionalResult.final.toString()),
  functionalResult.final.get("page") === "2" && functionalResult.final.get("sort") === "name" ? "✅ both applied" : "");

console.log("\n    This is the identical rule as setCount(c => c + 1) versus");
console.log("    setCount(count + 1) called twice — 02_built-in-hooks' lesson, reappearing");
console.log("    because useSearchParams genuinely IS a state setter underneath.");
console.log("\n    And one option worth knowing: setSearchParams takes the same navigation");
console.log("    options as navigate. A filter change is usually a REPLACE — otherwise");
console.log("    every keystroke in a search box becomes a history entry and the back");
console.log("    button walks the user through their own typing:");
console.log("      setSearchParams(next, { replace: true });   // for rapid/continuous changes");
console.log("      setSearchParams(next);                       // for deliberate ones\n");


// ══════════════════════════════════════════════════════════════════
// § 6 — URLSearchParams' FOUR SHARP EDGES
// ══════════════════════════════════════════════════════════════════

console.log("§6 — reading, with the real API and its real surprises:\n");

const sp = new URLSearchParams("?tag=react&tag=router&page=2&q=");

const edges = [
  ["sp.get('tag')",     JSON.stringify(sp.get("tag")),      "only the FIRST of a repeated key 🐛"],
  ["sp.getAll('tag')",  JSON.stringify(sp.getAll("tag")),   "…getAll is how you read all of them"],
  ["sp.get('missing')", JSON.stringify(sp.get("missing")),  "null — NOT undefined. `?? default` works, `|| default` hides ''"],
  ["sp.get('q')",       JSON.stringify(sp.get("q")),        "empty string — PRESENT but blank"],
  ["sp.has('q')",       String(sp.has("q")),                "…which is why has() and get() answer different questions"],
  ["typeof sp.get()",   typeof sp.get("page"),              "always a string — same rule as route params (02 §4)"],
];

console.log("      expression".padEnd(22) + "value".padEnd(22) + "note");
console.log("      " + "─".repeat(88));
for (const [expr, value, note] of edges) {
  console.log("      " + expr.padEnd(22) + value.padEnd(22) + note);
}

const pageRaw = sp.get("page");
const pageNumber = Number(pageRaw);
const missingWithOr = sp.get("q") || "default";
const missingWithNullish = sp.get("q") ?? "default";

console.log("\n    the two that cause real bugs:");
console.log("      page as a number     : Number(" + JSON.stringify(pageRaw) + ") =", pageNumber,
  "← convert AND validate, exactly as 02 §4 required");
console.log("      q || 'default'       :", JSON.stringify(missingWithOr), "🐛 an intentional empty search became 'default'");
console.log("      q ?? 'default'       :", JSON.stringify(missingWithNullish), "✅ empty string preserved");

console.log("\n    The empty-string case is not hypothetical: a user clears the search box.");
console.log("    `?q=` means 'they searched for nothing'; a missing `q` means 'they never");
console.log("    searched'. Collapsing those with || makes clearing the box impossible.\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — WHAT BELONGS IN THE URL
// ══════════════════════════════════════════════════════════════════

console.log("§7 — the decision, and what putting it in the URL buys you for free:\n");

const placements = [
  ["active filters / facets",    "search param", "a shared link must reproduce the view"],
  ["sort order",                 "search param", "same"],
  ["page number",                "search param", "same — and back/forward paginate for free"],
  ["selected tab",               "search param", "deep-linkable, and survives refresh"],
  ["search query text",          "search param", "shareable; use replace so typing isn't history"],
  ["which detail row is open",   "search param", "deep-linkable"],
  ["'you came from here'",       "location state", "navigation context, not page content (06 §6)"],
  ["scroll position to restore", "location state", "per-history-entry, keyed by location.key (§3)"],
  ["unsaved form draft text",    "component state", "not shareable, and churns on every keystroke"],
  ["is a tooltip open",          "component state", "ephemeral, nobody links to it"],
  ["an auth token",              "NEITHER",      "URLs land in logs, referrers, and browser history 🐛"],
];

console.log("      " + "what".padEnd(30) + "where".padEnd(18) + "why");
console.log("      " + "─".repeat(90));
for (const [what, where, why] of placements) {
  console.log("      " + what.padEnd(30) + where.padEnd(18) + why);
}

const freeFeatures = ["shareable links", "bookmarkable", "survives refresh", "back/forward is undo/redo", "server-visible (BrowserRouter)"];
console.log("\n    Moving one filter from useState into the URL gives you, with no extra code:");
for (const f of freeFeatures) console.log("      ✅ " + f);

console.log("\n    That last one connects back to file 01: with BrowserRouter the query");
console.log("    string reaches the server, so it can render or cache the right thing.");
console.log("    Under HashRouter it cannot (01 §3) — one more consequence of that single");
console.log("    fact, showing up six files later.\n");


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A filter that "doesn't work": searchParams.set() called directly,
//   mutating the object while the URL and the UI stay put. Nothing warns.
//   → §4.
//
// Bug 2 — Two filters changed in one handler and only the second sticks:
//   both were computed from the same render's snapshot. → §5.
//
// Bug 3 — The back button walks through every keystroke of a search box:
//   setSearchParams pushed on every change instead of replacing. → §5.
//
// Bug 4 — Clearing a search box does nothing: `sp.get('q') || defaultValue`
//   turned an intentional empty string back into the default. → §6.
//
// Bug 5 — A multi-select filter that only ever applies one value:
//   get() instead of getAll() on a repeated key. → §6.
//
// Bug 6 — A page number used in arithmetic as a string, or NaN reaching a
//   request: search params are strings, exactly like route params. → §6,
//   02 §4.
//
// Bug 7 — An effect that refetches on every navigation including
//   same-URL ones: `[location]` as a dependency, where `[location.pathname]`
//   or `[location.search]` was meant. → §3.
//
// Bug 8 — A shared link that shows the sender a different page than the
//   recipient: view state was put in location state instead of the URL.
//   → §7, 06 §6.
//
// Bug 9 — Scroll restoration that restores the wrong position: keyed by
//   pathname instead of location.key, so two visits to the same URL share
//   one entry. → §3.
//
// Bug 10 — A token or email address in a query string: URLs end up in
//   server logs, Referer headers, browser history and analytics. Some data
//   belongs in neither the URL nor location state. → §7.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function assert(condition, message) {
  if (!condition) throw new Error("Assertion failed: " + message);
}

// useLocation:
assert(loc.pathname === "/users/42/posts" && loc.search === "?tag=react&page=2" && loc.hash === "#comments",
  "useLocation splits the URL into pathname / search / hash correctly");
assert(loc.search.startsWith("?"),
  "location.search includes the leading '?' — it is the RAW string, not parsed");
assert(loc.key === "ab12cd" && loc.state.from === "/users",
  "…plus `key` (unique per history entry) and `state` (invisible in the URL)");
assert(Object.is(locA, sameUrlAgain) === false && locA.key !== sameUrlAgain.key,
  "navigating to the SAME url again produces a new location object AND a new key 🐛→ effects re-run");

// The mutation bug — the headline:
assert(handed.get("page") === "2",
  "mutating searchParams genuinely changed the object…");
assert(mutationRerendered === false,
  "…and re-rendered NOTHING, because the reference never changed 🐛");
assert(setterRerendered === true,
  "…while a NEW URLSearchParams handed to the setter did re-render ✅");
assert(mutatingStore.renderCount === 0 && settingStore.renderCount === 1,
  "0 renders from mutation, 1 from the setter — the whole bug in two numbers");

// The stale snapshot:
assert(objectResult.final.get("page") === "1",
  "two object-form updates from one snapshot LOST the first change (page stayed 1) 🐛");
assert(objectResult.final.get("sort") === "name",
  "…the second one applied — last write wins");
assert(functionalResult.final.get("page") === "2" && functionalResult.final.get("sort") === "name",
  "the functional form applied BOTH, because each update saw the live previous value ✅");

// URLSearchParams edges:
assert(sp.get("tag") === "react" && sp.getAll("tag").length === 2,
  "get() returns only the first of a repeated key; getAll() returns all of them 🐛→✅");
assert(sp.get("missing") === null && sp.get("q") === "",
  "a missing key is null; a present-but-blank key is an empty string — different things");
assert(sp.has("q") === true && sp.has("missing") === false,
  "…which is why has() and get() answer genuinely different questions");
assert(typeof sp.get("page") === "string",
  "every search param is a string — the same rule as route params (02 §4)");
assert(missingWithOr === "default" && missingWithNullish === "",
  "|| destroys an intentional empty value; ?? preserves it 🐛→✅");

console.log("§9 — mini assertions passed for: useLocation & useSearchParams");
console.log("\n  The pair that captures it: searchParams.set('page','2') changed the object");
console.log("  to " + JSON.stringify(handed.toString()) + " and caused " + mutatingStore.renderCount + " renders, while handing a new");
console.log("  URLSearchParams to the setter caused " + settingStore.renderCount + " — and two updates written the");
console.log("  object way silently kept page=" + objectResult.final.get("page") + " when the user had asked for page=2.");


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do useLocation and useSearchParams work?", answer:
//
//   "useLocation gives you the current location — pathname, search, hash,
//    state, and key — as a new object on every navigation. useSearchParams
//    gives you [searchParams, setSearchParams], which is useState's shape
//    with the URL as the storage. That's the whole appeal: state in the URL
//    is shareable, bookmarkable, survives refresh, and the back button
//    becomes undo, all for free.
//
//    The thing that catches people is that it only LOOKS like useState. The
//    value is a real, mutable URLSearchParams object, and React re-renders
//    on location changes, not on that object changing. So
//    searchParams.set('page','2') genuinely mutates the object, changes
//    nothing about the URL, and triggers zero renders — I've measured it,
//    zero versus one for the setter. Nothing warns you. The habit is to
//    treat searchParams as read-only: copy it into a new URLSearchParams,
//    modify the copy, hand that to setSearchParams.
//
//    And setSearchParams is a state setter, so it has the same stale-snapshot
//    problem as setCount. Two updates in one handler, both computed from the
//    same render's params, and the second silently overwrites the first — I
//    can show page=2 being lost. The functional form, setSearchParams(prev
//    => …), fixes it exactly the way setCount(c => c + 1) does. It also
//    takes navigation options, and for anything rapid like a search box you
//    want replace, or the back button walks the user through their own
//    typing.
//
//    URLSearchParams itself has a few sharp edges worth naming: everything
//    is a string, get() returns only the FIRST value of a repeated key so
//    multi-select filters need getAll(), and a missing key is null while a
//    present-but-empty one is an empty string. That last distinction matters
//    — `?q=` means they cleared the search box, no q at all means they never
//    searched — so `?? default` rather than `|| default`, or clearing the
//    box becomes impossible.
//
//    On useLocation, the field people don't use until they need it is `key`
//    — unique per history entry, not per URL, which is exactly what scroll
//    restoration needs. And because location is a new object every
//    navigation, depending on `[location]` in an effect fires on every
//    navigation including a re-navigation to the same URL; usually you want
//    `[location.pathname]` or `[location.search]`."
//
// Leading with "it looks like useState and differs in two measurable ways"
// and then naming both with numbers is what makes this senior.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does useLocation return?
// A1. { pathname, search, hash, state, key } — a new object on every
//     navigation.
//
// Q2. What is location.key for?
// A2. A unique id per HISTORY ENTRY (not per URL) — the correct key for
//     per-visit data like scroll position.
//
// Q3. Why does searchParams.set() not update the UI?
// A3. It mutates the object in place. React re-renders on location changes;
//     the reference never changed and nothing navigated.
//
// Q4. What's the correct way to change a search param?
// A4. Build a new URLSearchParams from the current one, modify that, pass it
//     to setSearchParams — preferably via the functional form.
//
// Q5. Why does the functional form matter?
// A5. Same reason as setCount(c => c + 1): two updates in one handler
//     otherwise both read the same stale snapshot and the second wins.
//
// Q6. When should setSearchParams replace instead of push?
// A6. For rapid or continuous changes — a search box, a slider — or the
//     back button walks through every intermediate value.
//
// Q7. What does get() do with a repeated key?
// A7. Returns only the first. Use getAll() for multi-value params.
//
// Q8. Difference between a missing param and an empty one?
// A8. null vs "" — "never searched" vs "searched for nothing". Use ?? not ||.
//
// Q9. What type are search param values?
// A9. Always strings — same as route params. Convert and validate.
//
// Q10. What belongs in the URL vs location state vs component state?
// A10. URL: anything a shared link should reproduce. State: navigation
//      context like `from`. Component: ephemeral, unshareable things.
//
// Q11. Why is `[location]` usually the wrong effect dependency?
// A11. It's a new object every navigation, so the effect fires even when
//      re-navigating to the identical URL. Depend on the string you care
//      about.
//
// Q12. What should never go in a query string?
// A12. Tokens, credentials, personal data — URLs end up in server logs,
//      Referer headers, browser history and analytics.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is useSearchParams, in one line?
//   Back : useState whose state lives in the URL — shareable, bookmarkable,
//          undoable via back.
//
// Flashcard 2:
//   Front: Why does searchParams.set() do nothing?
//   Back : It mutates in place. React re-renders on location change, not
//          object change.
//
// Flashcard 3:
//   Front: The correct update pattern?
//   Back : new URLSearchParams(prev) → modify the copy → setSearchParams,
//          functional form.
//
// Flashcard 4:
//   Front: Two updates in one handler?
//   Back : Object form loses the first. Functional form applies both.
//
// Flashcard 5:
//   Front: get() vs getAll()?
//   Back : get() returns only the first value of a repeated key.
//
// Flashcard 6:
//   Front: Missing param vs empty param?
//   Back : null vs "". Use ?? not ||, or clearing a box breaks.
//
// Flashcard 7:
//   Front: What is location.key for?
//   Back : Unique per history entry — scroll restoration, forced remounts.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "If a pasted link should show the same view, it's a search param
//          — and searchParams is read-only, always."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write a filter with searchParams.set() and no setSearchParams. Confirm
//   the object changes and the UI doesn't. Then fix it.
//
// Task 2:
//   Change two params in one handler using the object form and watch the
//   first change vanish. Rewrite with the functional form.
//
// Task 3:
//   Wire a search box to setSearchParams without replace, type a word, then
//   count how many back presses it takes to leave the page.
//
// Task 4:
//   Implement a multi-select tag filter with getAll(), and confirm
//   `?tag=a&tag=b` round-trips correctly.
//
// Task 5:
//   Use `|| 'default'` on a query param, clear the input, and watch the
//   default come back. Switch to `??`.
//
// Task 6:
//   Move one piece of useState in an app you own into the URL. List
//   everything you got for free.
//
// Task 7:
//   Build scroll restoration keyed by location.key, then break it by keying
//   on pathname and visiting the same URL twice.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   useSearchParams is useState with the URL as storage — and the value it
//   hands you is mutable, so mutating it re-renders nothing. Treat it as
//   read-only.
//
// If you remember the common bug:
//   searchParams.set() with no setSearchParams: object changed, URL
//   unchanged, zero renders, no warning.
//
// If you remember the professional framing:
//   If a colleague pasting the URL should see the same view, it belongs in
//   search params. Navigation context belongs in location state. Everything
//   ephemeral stays in the component.
//
// NEXT TOPIC -> 08_lazy-loaded-routes.js
