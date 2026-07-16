// ╔══════════════════════════════════════════════════════════════════╗
// ║   Custom Hooks  →  02_usefetch-custom-hook.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: useFetch custom hook
//
// WHAT YOU WILL MASTER HERE:
//   1. Build it properly — the version that survives a code review
//   2. The race condition, and the cancelled flag that kills it
//   3. Why `if (!res.ok)` is mandatory (fetch does not throw on 404)
//   4. The four states, and why a reducer beats four useStates here
//   5. Why you should probably NOT write this hook in 2026
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.2-hooks/03_custom-hooks/02_usefetch-custom-hook.js"
//
// Prerequisites: 02_built-in-hooks/03_useeffect-cleanup.js (races),
// 06_usereducer-vs-usestate.js (impossible states).
// This is THE most common "build a custom hook" interview task.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// useFetch:
// A custom hook that wraps a request in an effect and exposes { data,
// loading, error } — and the interview is entirely about the details you
// remember to handle.
//
// If interviewer says "explain it simply", say:
// "It fetches on mount and whenever the URL changes, tracks the loading and
//  error states, and cancels in-flight requests in the cleanup so a stale
//  response can never overwrite a newer one."
//
// If interviewer asks "why does it matter?", say:
// "Because the naive version has four bugs that all reach production: a race
//  condition, a missing res.ok check, impossible states, and no cleanup. And
//  because the senior answer is that I would use React Query — writing this
//  by hand means rebuilding caching, dedup, and revalidation badly."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   an effect that must be able to cancel itself
//
// The naive version everyone writes first:
//
//   function useFetch(url) {
//     const [data, setData] = useState(null);
//     const [loading, setLoading] = useState(true);
//     const [error, setError] = useState(null);
//
//     useEffect(() => {
//       fetch(url)
//         .then(res => res.json())     // 🐛 no res.ok check
//         .then(setData)               // 🐛 no cancellation → race
//         .catch(setError)             // 🐛 loading never resets on error
//         .finally(() => setLoading(false));
//     }, [url]);                       // 🐛 no cleanup at all
//
//     return { data, loading, error };
//   }
//
// Every one of those four comments is a real production bug. §4 fixes them.
//
// Runtime rule:
//   fetch() only rejects on NETWORK failure. A 404 or a 500 RESOLVES. If you
//   do not check res.ok, you will call .json() on an error page and either
//   crash or set an HTML error body as your data.
//
// Practical rule:
//   If you are writing this hook for real work, stop and install React Query.
//   If you are writing it in an interview, write the good version and then
//   say that.
//
// Common trap:
//   Thinking the race condition is rare. It fires on every fast navigation
//   and every keystroke in a search box.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE TEST HARNESS
// ══════════════════════════════════════════════════════════════════

// A fake fetch with controllable latency and status.
function createFakeFetch() {
  const calls = [];
  return {
    calls,
    fetch(url, { signal } = {}) {
      const config = createFakeFetch.routes[url] ?? { status: 200, body: { id: url }, delay: 10 };
      calls.push(url);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve({
            ok: config.status >= 200 && config.status < 300,
            status: config.status,
            json: () => Promise.resolve(config.body),
          });
        }, config.delay);

        // AbortController support — this is what the real fetch does.
        if (signal) {
          signal.addEventListener("abort", () => {
            clearTimeout(timer);
            const err = new Error("The operation was aborted.");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    },
  };
}

createFakeFetch.routes = {
  "/users/1": { status: 200, body: { name: "Vineet" }, delay: 40 },   // SLOW
  "/users/2": { status: 200, body: { name: "Ankit" }, delay: 10 },    // fast
  "/missing": { status: 404, body: "<html>Not Found</html>", delay: 10 },
  "/boom": { status: 500, body: "<html>Server Error</html>", delay: 10 },
};

// A minimal fake AbortController (Node has a real one, but this makes the
// mechanism visible):
class FakeAbortController {
  constructor() {
    this.aborted = false;
    this.listeners = [];
    this.signal = {
      addEventListener: (_, fn) => this.listeners.push(fn),
      get aborted() { return this.aborted; },
    };
  }
  abort() {
    this.aborted = true;
    this.listeners.forEach(fn => fn());
  }
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE RACE CONDITION
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the race: a slow first request beats a fast second one:\n");

async function raceDemo() {
  const api = createFakeFetch();

  // ── NAIVE: no cleanup ─────────────────────────────────────────
  let naiveScreen = "-";
  function naiveEffect(url) {
    api.fetch(url).then(r => r.json()).then(body => {
      naiveScreen = body.name;         // ← no guard. Whoever lands last wins.
    });
  }

  naiveEffect("/users/1");             // user opens /users/1 (40ms)
  await sleep(5);
  naiveEffect("/users/2");             // user clicks /users/2 (10ms)
  await sleep(60);

  // ── FIXED: the cancelled flag ─────────────────────────────────
  let fixedScreen = "-";
  function fixedEffect(url) {
    let cancelled = false;                       // ← per-effect-run flag
    api.fetch(url).then(r => r.json()).then(body => {
      if (cancelled) return;                     // ← obsolete? drop it.
      fixedScreen = body.name;
    });
    return () => { cancelled = true; };          // ← the cleanup
  }

  const cleanup1 = fixedEffect("/users/1");
  await sleep(5);
  cleanup1();                                    // React runs this on the URL change
  fixedEffect("/users/2");
  await sleep(60);

  console.log("  user opens /users/1 (40ms), immediately clicks /users/2 (10ms):\n");
  console.log("    no cleanup     → screen shows:", naiveScreen,
    naiveScreen === "Ankit" ? "✅" : "🐛 user 1's data on user 2's page");
  console.log("    cancelled flag → screen shows:", fixedScreen,
    fixedScreen === "Ankit" ? "✅ correct" : "🐛");

  console.log("\n  The naive version renders Vineet on Ankit's page — forever,");
  console.log("  until something else re-renders. And it is not rare: it fires");
  console.log("  on every fast navigation and every keystroke in a search box.");
  console.log("\n  The flag does not cancel the REQUEST — it discards the");
  console.log("  obsolete RESULT. AbortController does both. → §6\n");

  return { naiveScreen, fixedScreen };
}


// ══════════════════════════════════════════════════════════════════
// § 5 — fetch DOES NOT THROW ON 404
// ══════════════════════════════════════════════════════════════════

console.log("§5 — the res.ok trap:\n");

async function okDemo() {
  const api = createFakeFetch();

  // ❌ no res.ok check
  let badData = null, badError = null;
  try {
    const res = await api.fetch("/missing");        // a 404
    badData = await res.json();                     // resolves! No throw!
  } catch (e) {
    badError = e.message;
  }

  // ✅ with the check
  let goodData = null, goodError = null;
  try {
    const res = await api.fetch("/missing");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);   // ← the one line
    goodData = await res.json();
  } catch (e) {
    goodError = e.message;
  }

  console.log("  GET /missing → 404\n");
  console.log("    without res.ok → data:", JSON.stringify(badData),
    "| error:", badError);
  console.log("      🐛 The 404 page's HTML is now your `data`. No error state.");
  console.log("         Your component renders '<html>Not Found</html>' or");
  console.log("         crashes on data.name.");
  console.log("\n    with res.ok    → data:", goodData, "| error:", JSON.stringify(goodError));
  console.log("      ✅ a real error state\n");
  console.log("  WHY: fetch() only rejects on NETWORK failure — DNS, offline,");
  console.log("  CORS. A 404 or a 500 is a successful HTTP round trip as far as");
  console.log("  fetch is concerned. This surprises everyone coming from axios,");
  console.log("  which throws on 4xx/5xx by default.\n");

  return { badData, goodError };
}


// ══════════════════════════════════════════════════════════════════
// § 6 — THE VERSION THAT SURVIVES CODE REVIEW
// ══════════════════════════════════════════════════════════════════
//
// Every fix, assembled. This is what to write on the whiteboard.
//
//   function useFetch(url, options) {
//     const [state, dispatch] = useReducer(reducer, {
//       status: "idle", data: null, error: null,
//     });
//
//     useEffect(() => {
//       if (!url) return;                            // guard: nothing to fetch
//       const controller = new AbortController();
//       dispatch({ type: "FETCH_START" });
//
//       fetch(url, { ...options, signal: controller.signal })
//         .then(res => {
//           if (!res.ok) throw new Error(`HTTP ${res.status}`);   // ← §5
//           return res.json();
//         })
//         .then(data => dispatch({ type: "FETCH_SUCCESS", payload: data }))
//         .catch(err => {
//           if (err.name === "AbortError") return;   // ← expected. Not an error.
//           dispatch({ type: "FETCH_ERROR", error: err.message });
//         });
//
//       return () => controller.abort();             // ← §4
//     }, [url]);                                     // ⚠️ `options` is NOT here
//
//     return state;
//   }
//
// Read the deps comment. If you put `options` in there and the caller passes
// an object literal — useFetch(url, { headers }) — it is a new reference every
// render and you have an infinite fetch loop. That is a REAL bug in a lot of
// hand-rolled useFetch hooks. → 02_built-in-hooks/02_useeffect-dependency-array.js
//
// The honest fixes: require callers to memoize options, serialize them into
// the deps (JSON.stringify(options)), or hold them in a ref. None are pretty.
// Note how React Query sidesteps this entirely with an explicit queryKey —
// it made the dependency EXPLICIT instead of inferred. That is not an
// accident; it is the design lesson.

console.log("§6 — the reducer, and why four useStates lose:\n");

function fetchReducer(state, action) {
  switch (action.type) {
    case "FETCH_START":
      return { status: "loading", data: null, error: null };
    case "FETCH_SUCCESS":
      return { status: "success", data: action.payload, error: null };
    case "FETCH_ERROR":
      return { status: "error", data: null, error: action.error };
    default:
      return state;
  }
}

// The four-useState version, and its signature bug:
function fourStatesFlow() {
  const s = { data: null, loading: false, error: null };
  s.loading = true;                        // setLoading(true)
  // ...request fails...
  s.error = "HTTP 500";                    // setError(...)
  // 🐛 someone forgot setLoading(false)
  return s;
}

const four = fourStatesFlow();
let reduced = { status: "idle", data: null, error: null };
reduced = fetchReducer(reduced, { type: "FETCH_START" });
reduced = fetchReducer(reduced, { type: "FETCH_ERROR", error: "HTTP 500" });

console.log("  four useStates, request fails:");
console.log("   ", JSON.stringify(four));
console.log("    🐛 loading:true AND error set → a spinner ON TOP of the error");
console.log("\n  useReducer, same failure:");
console.log("   ", JSON.stringify(reduced));
console.log("    ✅ status:'error'. There is no `loading` field to forget.");
console.log("\n  A useFetch is exactly the shape useReducer exists for: several");
console.log("  fields that MUST change together. → 06_usereducer-vs-usestate.js\n");


// ══════════════════════════════════════════════════════════════════
// § 7 — AbortController vs THE CANCELLED FLAG
// ══════════════════════════════════════════════════════════════════

console.log("§7 — flag vs AbortController:\n");

async function abortDemo() {
  const api = createFakeFetch();

  // The flag: the request still completes; we ignore the result.
  let flagCalls = 0;
  api.calls.length = 0;
  let cancelled = false;
  api.fetch("/users/1").then(r => r.json()).then(() => { if (!cancelled) flagCalls++; });
  cancelled = true;
  await sleep(60);
  const flagRequestsMade = api.calls.length;

  // AbortController: the request is actually cancelled.
  api.calls.length = 0;
  const controller = new FakeAbortController();
  let aborted = false;
  api.fetch("/users/1", { signal: controller.signal })
    .then(r => r.json())
    .catch(e => { if (e.name === "AbortError") aborted = true; });
  controller.abort();
  await sleep(60);

  console.log("    cancelled flag   → result ignored:", flagCalls === 0,
    "| request still sent:", flagRequestsMade === 1, "| bandwidth wasted");
  console.log("    AbortController  → request cancelled:", aborted,
    "| socket freed, server load reduced ✅");
  console.log("\n  Both fix the race. AbortController also saves the network.");
  console.log("  The catch: an aborted fetch REJECTS with an AbortError, so");
  console.log("  you MUST filter it — otherwise every navigation flashes an");
  console.log("  error message. That filter line is the one people forget.\n");

  return { aborted };
}


// ══════════════════════════════════════════════════════════════════
// § 8 — WHY YOU SHOULD NOT WRITE THIS HOOK
// ══════════════════════════════════════════════════════════════════
//
// The senior answer to "build me a useFetch". Build it — then say this.
//
// Even the good version in §6 is missing everything that matters at scale:
//
//   ❌ no CACHING            — navigate away and back, and you refetch. Every
//                             component using the same URL fetches separately.
//   ❌ no DEDUPLICATION      — three components need /user, you make three
//                             requests for the same data, in the same tick.
//   ❌ no REVALIDATION       — data goes stale and nothing refreshes it. No
//                             refetch on window focus or reconnect.
//   ❌ no RETRY              — one flaky network blip is a permanent error UI.
//   ❌ no PAGINATION support — you will hand-roll it, badly.
//   ❌ no OPTIMISTIC UPDATES — → 04_state-patterns/11
//   ❌ no SHARED STATE       — two components, two copies of the same data,
//                             which will drift apart.
//   ❌ no request WATERFALL control, no prefetching, no SSR hydration story.
//
// React Query / SWR / RTK Query give you all of it. And the deeper point:
//
//   Server data is not state. It is a CACHE of someone else's state.
//   useState pretends you own it. You do not — it can change without you,
//   go stale, and be needed in five places at once. That mismatch is why
//   hand-rolled useFetch always grows into a bad cache library.
//
// The interview move:
//   "Here's the hook with the race, res.ok, and the reducer handled. In real
//    work I'd use React Query — the moment you need caching or dedup, you're
//    rebuilding it anyway, and the useFetch you end up with is a worse
//    version of a library that's been battle-tested for years."
//
// That answer wins because it shows you can build it AND you know when not to.
// → 04_state-patterns/10_react-query-usequery-usemutation.js


// ══════════════════════════════════════════════════════════════════
// § 9 — WHAT REAL LIBRARIES DO DIFFERENTLY
// ══════════════════════════════════════════════════════════════════
//
//   Our useFetch              React Query
//   ────────────              ───────────
//   deps: [url]               an explicit queryKey: ['user', id] — the
//                             dependency is DECLARED, not inferred, which
//                             kills the options-in-deps problem entirely
//   fetch on mount            cache-first, then revalidate in the background
//   one component, one fetch  deduped: N components, ONE request
//   no cache                  a normalized cache with configurable staleTime
//   error = permanent         exponential backoff retries
//   n/a                       refetch on focus, on reconnect, on interval
//   n/a                       useMutation + optimistic updates + rollback
//   n/a                       devtools showing every query's state
//
// One precise fact:
//   React Query's queryKey is the answer to the deps problem in §6. Instead
//   of inferring dependencies from a closure — which breaks on object
//   identity — you state them. Every hard-won lesson about useEffect deps is
//   baked into that API design.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Stale data after a fast navigation:
//   No cancellation. → §4. The bug that defines this hook.
//
// Bug 2 — HTML rendered as your data:
//   No res.ok check on a 404. → §5.
//
// Bug 3 — A spinner on top of an error:
//   Four independent useStates. → §6.
//
// Bug 4 — Infinite fetch loop:
//   `options` in the deps, called with an object literal. → §6.
//
// Bug 5 — An error flashes on every navigation:
//   You did not filter AbortError. → §7.
//
// Bug 6 — Two fetches on mount in dev:
//   StrictMode. Which is CORRECT — it is checking your cleanup.
//   → 01_react-fundamentals/12_react-strictmode.js
//
// Bug 7 — "Can't perform a React state update on an unmounted component":
//   The response landed after unmount. The cleanup should have cancelled it.
//
// Bug 8 — Three components, three identical requests:
//   No dedup. You cannot fix this inside a per-component hook. → §8.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const race = await raceDemo();
  const ok = await okDemo();
  const abort = await abortDemo();

  function assert(condition, message) {
    if (!condition) {
      throw new Error("Assertion failed: " + message);
    }
  }

  // The race — the headline:
  assert(race.naiveScreen === "Vineet",
    "no cleanup: the SLOW first response overwrote the fast second one 🐛");
  assert(race.fixedScreen === "Ankit",
    "the cancelled flag dropped the obsolete result ✅");

  // res.ok:
  assert(ok.badData === "<html>Not Found</html>",
    "without res.ok, a 404's HTML body becomes your `data` 🐛");
  assert(ok.goodError === "HTTP 404",
    "with res.ok, a 404 becomes a real error");

  // fetch does not reject on 404 — the whole reason:
  const api = createFakeFetch();
  const res404 = await api.fetch("/missing");
  assert(res404.ok === false, "res.ok is false for a 404...");
  assert(res404.status === 404, "...and the status is there...");
  // ...but the promise RESOLVED. It did not reject. That is the trap.

  // AbortController:
  assert(abort.aborted === true,
    "an aborted fetch REJECTS with AbortError — which you must filter");

  // The reducer:
  assert(four.loading === true && four.error !== null,
    "four useStates reach loading:true AND error — an impossible state");
  assert(reduced.status === "error" && !("loading" in reduced),
    "the reducer has no `loading` field to forget");

  console.log("§11 — mini assertions passed for: useFetch");
  console.log("\n  The one to remember: naiveScreen === 'Vineet'. The user is");
  console.log("  looking at Ankit's page, reading Vineet's data.");
}

main();


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "build a useFetch hook", say this WHILE writing:
//
//   "The shape is an effect keyed on the URL returning { data, loading,
//    error }. But there are four things I'd make sure to handle.
//
//    First, cancellation. If the user opens /users/1 and quickly clicks
//    /users/2, both are in flight, and if the first is slower it lands last
//    and overwrites the second — you render Vineet's data on Ankit's page.
//    So the cleanup returns controller.abort(), and I filter AbortError in the
//    catch, or every navigation flashes an error.
//
//    Second, res.ok. fetch only rejects on network failure — a 404 or 500
//    resolves happily. Without the check you call .json() on an error page and
//    the 404's HTML becomes your data. People coming from axios get caught by
//    this because axios throws on 4xx.
//
//    Third, I'd use useReducer rather than four useStates. loading, data, and
//    error must change together — with separate setters someone eventually
//    forgets setLoading(false) on the error path and you ship a spinner
//    rendered on top of an error message. With a reducer there's one status
//    field and that state can't be expressed.
//
//    Fourth, a subtle one: I would NOT put `options` in the deps. If the
//    caller passes an object literal it's a new reference every render, and
//    you get an infinite fetch loop.
//
//    That said — in real work I'd use React Query. The moment you need
//    caching, dedup, retry, or refetch-on-focus you're rebuilding it, and your
//    version will be worse. Server data isn't state, it's a cache of someone
//    else's state, and useState pretends you own it. React Query's queryKey is
//    even the fix for that deps problem — it makes the dependency explicit
//    instead of inferring it from a closure."
//
// Build it well, then say why you would not ship it. That is the whole answer.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What is the race condition?
// A1. Two requests in flight; the slower first one resolves last and
//     overwrites the newer data. Fix: abort or a cancelled flag in the cleanup.
//
// Q2. Does fetch throw on a 404?
// A2. No. It only rejects on network failure. Check res.ok yourself.
//
// Q3. AbortController or a cancelled flag?
// A3. Both fix the race. AbortController also cancels the request and frees
//     the socket — but it rejects with AbortError, which you must filter.
//
// Q4. Why useReducer here?
// A4. loading/data/error must move together. Separate setters produce
//     impossible states like a spinner over an error.
//
// Q5. Why not put options in the deps?
// A5. An object literal is a new reference every render → an infinite fetch
//     loop. Memoize, serialize, or ref it.
//
// Q6. Why does it fetch twice in dev?
// A6. StrictMode double-mounting — checking that your cleanup works. Not a bug.
//
// Q7. What is useFetch missing?
// A7. Caching, dedup, revalidation, retry, pagination, shared state,
//     prefetching, devtools. Everything that matters at scale.
//
// Q8. Why is server data not "state"?
// A8. You do not own it. It can change without you and go stale, and it is
//     needed in many places at once. It is a cache, so it needs a cache
//     library.
//
// Q9. What does React Query's queryKey solve?
// A9. It makes dependencies explicit instead of inferring them from a
//     closure — which is exactly the deps trap in Q5.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is the useFetch race condition?
//   Back : A slow first response overwrites a fast second one. Cancel in cleanup.
//
// Flashcard 2:
//   Front: Does fetch reject on 404?
//   Back : No. Network failures only. Check res.ok.
//
// Flashcard 3:
//   Front: What is the most common trap?
//   Back : No cleanup → stale data on the wrong page.
//
// Flashcard 4:
//   Front: Why useReducer?
//   Back : loading/data/error must change together. No impossible states.
//
// Flashcard 5:
//   Front: Why not options in the deps?
//   Back : An object literal → new reference → infinite fetch loop.
//
// Flashcard 6:
//   Front: What must you filter in the catch?
//   Back : AbortError. Otherwise every navigation flashes an error.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Build it, then say "server data is a cache, not state — use React
//          Query."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the §6 hook from memory. The four must-haves: abort in cleanup,
//   res.ok, AbortError filter, reducer.
//
// Task 2:
//   Reproduce the options-in-deps loop. Count the fetches before you stop it.
//
// Task 3:
//   Add a `refetch` function to the hook. Notice it needs a counter in the
//   deps — and that this is exactly what React Query's invalidateQueries does
//   properly.
//
// Task 4:
//   Add a module-level cache: a Map from url to data. Now add invalidation.
//   Now add staleTime. You are ten minutes into writing React Query, badly.
//
// Task 5:
//   Break §4: remove the `if (cancelled) return`. Then change /users/1's
//   delay to 5ms so it wins the race legitimately. Notice the bug DISAPPEARS
//   — that timing dependence is why races survive code review.
//
// Task 6:
//   Explain in 60 seconds why fetch not throwing on 404 is a deliberate
//   design choice, not an oversight.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The cleanup must cancel. A slow first response will overwrite a fast
//   second one, and it happens on every fast navigation.
//
// If you remember the common bug:
//   fetch does not throw on 404 — check res.ok, or render an HTML error page
//   as your data.
//
// If you remember the professional framing:
//   Server data is a cache, not state. Build the hook to prove you can, then
//   reach for React Query.
//
// NEXT TOPIC -> 03_usedebounce-hook.js
