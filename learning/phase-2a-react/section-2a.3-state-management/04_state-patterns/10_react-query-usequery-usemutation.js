// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  10_react-query-usequery-usemutation.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: React Query — useQuery, useMutation
//
// WHAT YOU WILL MASTER HERE:
//   1. "Server state is not state" — the idea the whole library rests on
//   2. Deduplication: 3 components, 1 request — PROVEN
//   3. staleTime vs gcTime — the two numbers everyone confuses
//   4. Stale-while-revalidate: why navigating back is instant
//   5. useMutation + invalidateQueries — and why queryKey is the design win
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/10_react-query-usequery-usemutation.js"
//
// Prerequisite: 03_custom-hooks/02_usefetch-custom-hook.js — you built the
// hand-rolled version and listed what it was missing. This is that list, built.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// React Query:
// A cache for server data, keyed by a queryKey, that dedupes requests, serves
// stale data instantly while revalidating in the background, and gives every
// component reading the same key the same value.
//
// If interviewer says "explain it simply", say:
// "It is a cache, not a store. useQuery(['user', id], fetchUser) gives you
//  the data plus loading and error states, and every component asking for the
//  same key shares one request and one cache entry."
//
// If interviewer asks "why does it matter?", say:
// "Because server data is not state — it is a CACHE of someone else's state.
//  You do not own it, it changes without you, it goes stale, and it is needed
//  in five places at once. useState pretends you own it, which is why every
//  hand-rolled useFetch grows into a bad cache library. Once you move server
//  data out, most apps discover they barely need a state library at all."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   server state is a CACHE, not state
//
// The distinction that the whole library rests on:
//
//   CLIENT STATE                      SERVER STATE
//   ────────────                      ────────────
//   you own it                        someone else owns it
//   synchronous                       asynchronous
//   always up to date                 goes stale the instant you fetch it
//   nobody else changes it            changes without telling you
//   lost on refresh                   persists elsewhere
//   → useState / Zustand              → a CACHE
//
//   isModalOpen, theme, a form draft  users, products, orders
//
// Once you see that line, the API follows:
//   • a KEY, because a cache needs keys
//   • staleTime, because cached data has a freshness horizon
//   • invalidate, because you know when it changed
//   • dedupe, because five components asking for one thing is one request
//
// Runtime rule:
//   The queryKey IS the cache key AND the dependency array. Change the key,
//   and it is a different query. That is the design lesson: React Query made
//   dependencies EXPLICIT instead of inferring them from a closure.
//
// Practical rule:
//   If the data came from a server, it belongs here. Not in Redux, not in
//   Zustand, not in useState.
//
// Common trap:
//   Copying query data into useState. Now you have two owners and one is
//   always stale. → §8


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD A QUERY CLIENT
// ══════════════════════════════════════════════════════════════════

function createQueryClient({ staleTime = 0, gcTime = 5 * 60_000 } = {}) {
  const cache = new Map();          // key → entry
  const inFlight = new Map();       // key → promise (the DEDUPE table)
  let now = 0;                      // a controllable clock
  const log = [];

  const hash = (key) => JSON.stringify(key);

  function getEntry(key) {
    const k = hash(key);
    if (!cache.has(k)) {
      cache.set(k, {
        data: undefined, error: undefined, status: "pending",
        updatedAt: 0, observers: new Set(),
      });
    }
    return cache.get(k);
  }

  async function fetchQuery(key, queryFn, opts = {}) {
    const k = hash(key);
    const entry = getEntry(key);
    const effectiveStaleTime = opts.staleTime ?? staleTime;

    // ── FRESH? Serve from cache, do not even fetch. ───────────────
    const age = now - entry.updatedAt;
    if (entry.status === "success" && age < effectiveStaleTime) {
      log.push(`cache HIT  ${k} (fresh, age ${age}ms)`);
      return entry.data;
    }

    // ── DEDUPE: a request for this key is already in flight. ──────
    if (inFlight.has(k)) {
      log.push(`dedupe     ${k} (joined the in-flight request)`);
      return inFlight.get(k);
    }

    // ── STALE-WHILE-REVALIDATE: we have data, it is old. Serve it
    //    NOW and refetch in the background. The user sees no spinner.
    const isRevalidating = entry.status === "success";
    if (isRevalidating) log.push(`stale      ${k} (serving cached, refetching)`);
    else log.push(`fetch      ${k} (no cache)`);

    const promise = Promise.resolve(queryFn()).then(
      (data) => {
        entry.data = data;
        entry.status = "success";
        entry.error = undefined;
        entry.updatedAt = now;
        entry.isInvalidated = false;
        inFlight.delete(k);
        entry.observers.forEach(fn => fn(entry));
        return data;
      },
      (error) => {
        entry.error = error;
        entry.status = "error";
        inFlight.delete(k);
        entry.observers.forEach(fn => fn(entry));
        throw error;
      }
    );

    inFlight.set(k, promise);
    return isRevalidating ? entry.data : promise;   // ← stale-while-revalidate
  }

  function invalidateQueries(keyPrefix) {
    const prefix = hash(keyPrefix).slice(0, -1);    // partial matching
    let count = 0;
    for (const [k, entry] of cache) {
      if (k.startsWith(prefix)) {
        // Mark STALE — do not delete, and do not refetch now. Anything mounted
        // will refetch; anything unmounted waits until someone wants it.
        entry.updatedAt = -Infinity;
        entry.isInvalidated = true;
        count++;
        log.push(`invalidate ${k}`);
      }
    }
    return count;
  }

  function setQueryData(key, updater) {
    const entry = getEntry(key);
    entry.data = typeof updater === "function" ? updater(entry.data) : updater;
    entry.observers.forEach(fn => fn(entry));
    return entry.data;
  }

  function getQueryData(key) { return getEntry(key).data; }

  // Garbage collection: an entry with no observers is removed after gcTime.
  function collectGarbage() {
    let collected = 0;
    for (const [k, entry] of cache) {
      if (entry.observers.size === 0 && now - entry.updatedAt > gcTime) {
        cache.delete(k);
        collected++;
        log.push(`gc         ${k} (unused for ${gcTime}ms)`);
      }
    }
    return collected;
  }

  return {
    fetchQuery, invalidateQueries, setQueryData, getQueryData, getEntry,
    collectGarbage,
    cacheSize: () => cache.size,
    getLog: () => log.slice(),
    clearLog: () => (log.length = 0),
    advance: (ms) => { now += ms; },
    now: () => now,
  };
}


// ══════════════════════════════════════════════════════════════════
// § 4 — DEDUPLICATION
// ══════════════════════════════════════════════════════════════════

console.log("§4 — three components, one request:\n");

let apiCalls = 0;
const api = {
  fetchUser: (id) => { apiCalls++; return Promise.resolve({ id, name: "Vineet" }); },
};

async function dedupeDemo() {
  const client = createQueryClient();
  apiCalls = 0;

  // Three components mount at once, all needing the same user:
  const [a, b, c] = await Promise.all([
    client.fetchQuery(["user", 1], () => api.fetchUser(1)),   // <Header/>
    client.fetchQuery(["user", 1], () => api.fetchUser(1)),   // <Sidebar/>
    client.fetchQuery(["user", 1], () => api.fetchUser(1)),   // <Profile/>
  ]);

  console.log("  <Header/>, <Sidebar/>, <Profile/> all useQuery(['user', 1]):\n");
  for (const line of client.getLog()) console.log("   ", line);
  console.log("\n    network requests:", apiCalls, "← not 3 ✅");
  console.log("    all three got the same data?",
    a.name === b.name && b.name === c.name);
  console.log("    the SAME object?", Object.is(a, b) && Object.is(b, c),
    "← one cache entry, one reference");

  console.log("\n  Three components, one request, one shared reference. With a");
  console.log("  hand-rolled useFetch that is THREE requests and three copies");
  console.log("  of the data that will drift apart the moment one refetches.");
  console.log("  → 03_custom-hooks/02_usefetch-custom-hook.js §8");
  console.log("\n  The mechanism is trivial: a Map from key to in-flight promise.");
  console.log("  Everyone asking for the same key awaits the same promise.\n");

  await staleDemo();
}


// ══════════════════════════════════════════════════════════════════
// § 5 — staleTime vs gcTime
// ══════════════════════════════════════════════════════════════════
//
// THE two numbers people confuse, and the interview question.
//
//   staleTime — how long the data is considered FRESH.
//     Fresh  → useQuery returns the cache and does NOT fetch. At all.
//     Stale  → useQuery returns the cache INSTANTLY and refetches in the
//              background.
//     Default: 0. So by default every mount refetches — which surprises
//     people, and is why "React Query fetches too much" is a common complaint
//     from people who never set staleTime.
//
//   gcTime (was cacheTime) — how long an UNUSED entry survives.
//     Starts counting when the LAST component using it unmounts.
//     Default: 5 minutes. Then the entry is deleted and the next mount is a
//     cold fetch with a spinner.
//
// The distinction in one line:
//   staleTime = "when do I refetch?"   (freshness)
//   gcTime    = "when do I forget?"    (memory)
//
// They are independent. staleTime: 0 + gcTime: 5min — the default — means
// "always refetch on mount, but show the old data instantly while you do."
// That IS stale-while-revalidate, and it is why navigating back feels instant.

async function staleDemo() {
  console.log("§5 — staleTime: fresh vs stale:\n");

  const client = createQueryClient({ staleTime: 30_000 });
  apiCalls = 0;
  client.clearLog();

  await client.fetchQuery(["user", 2], () => api.fetchUser(2));
  console.log("  staleTime: 30s. First mount → fetch. requests:", apiCalls);

  // Another component mounts 10s later — still FRESH:
  client.advance(10_000);
  await client.fetchQuery(["user", 2], () => api.fetchUser(2));
  console.log("  10s later, another component mounts → requests:", apiCalls,
    "← ZERO fetch. Data is fresh.");

  // 40s later — now STALE:
  client.advance(30_000);
  await client.fetchQuery(["user", 2], () => api.fetchUser(2));
  await new Promise(r => setImmediate(r));
  console.log("  40s later, mounts again → requests:", apiCalls,
    "← refetched, because it went stale");

  console.log("\n  the log:");
  for (const line of client.getLog()) console.log("   ", line);

  console.log("\n  Read `stale (serving cached, refetching)`. The user got the");
  console.log("  cached data IMMEDIATELY — no spinner — and the fresh data");
  console.log("  arrived a moment later. That is stale-while-revalidate, and it");
  console.log("  is why navigating back to a page you have visited is instant.");
  console.log("\n  ⚠️  staleTime defaults to 0, so by default EVERY mount");
  console.log("     refetches. 'React Query fetches too much' always means");
  console.log("     'I never set staleTime'.\n");

  await gcDemo();
}

async function gcDemo() {
  console.log("§6 — gcTime: when the cache forgets:\n");

  const client = createQueryClient({ staleTime: 0, gcTime: 5 * 60_000 });
  client.clearLog();
  apiCalls = 0;

  await client.fetchQuery(["user", 3], () => api.fetchUser(3));
  const entry = client.getEntry(["user", 3]);

  // A component is watching it:
  const observer = () => {};
  entry.observers.add(observer);
  console.log("  a component is mounted, watching ['user', 3]");
  client.advance(10 * 60_000);
  console.log("    10 minutes pass → collected:", client.collectGarbage(),
    "← ✅ still observed, so it survives");

  // The component unmounts:
  entry.observers.delete(observer);
  console.log("\n  the component unmounts (0 observers)");
  console.log("    gc now             → collected:", client.collectGarbage(),
    "← the entry is gone");
  console.log("    cache size         :", client.cacheSize());

  console.log("\n  The two numbers, side by side:");
  console.log("    staleTime = 'when do I REFETCH?'  → freshness");
  console.log("    gcTime    = 'when do I FORGET?'   → memory");
  console.log("\n  Independent. The default staleTime:0 + gcTime:5min means");
  console.log("  'refetch on every mount, but show the cached data instantly");
  console.log("  while you do, and keep it for 5 minutes after nobody wants it'.");
  console.log("\n  Tuning them is the whole art: staleTime: Infinity for data");
  console.log("  that never changes (a country list); staleTime: 0 for a live");
  console.log("  dashboard; gcTime long if you want back-navigation instant.\n");

  await mutationDemo();
}


// ══════════════════════════════════════════════════════════════════
// § 7 — useMutation + invalidateQueries
// ══════════════════════════════════════════════════════════════════
//
// useQuery READS. useMutation WRITES. The interesting part is what happens
// after a write.
//
//   const mutation = useMutation({
//     mutationFn: (newTodo) => api.createTodo(newTodo),
//     onSuccess: () => {
//       queryClient.invalidateQueries({ queryKey: ['todos'] });
//     },
//   });
//
//   mutation.mutate({ text: "Learn React Query" });
//
// invalidateQueries does NOT delete or refetch immediately. It marks matching
// entries STALE. Anything currently mounted refetches; anything not mounted
// refetches next time it is used. That laziness is the design.
//
// And the key matching is PARTIAL:
//   invalidateQueries(['todos'])       → invalidates ['todos'], ['todos', 1],
//                                        ['todos', { done: true }] — everything
//                                        under that prefix.
//   That hierarchy is why queryKey is an ARRAY, not a string.

async function mutationDemo() {
  console.log("§7 — useMutation + invalidateQueries:\n");

  const client = createQueryClient({ staleTime: 60_000 });
  client.clearLog();
  let todoApiCalls = 0;
  const todos = [{ id: 1, text: "First" }];

  const fetchTodos = () => { todoApiCalls++; return Promise.resolve([...todos]); };

  await client.fetchQuery(["todos"], fetchTodos);
  await client.fetchQuery(["todos", { done: false }], fetchTodos);
  await client.fetchQuery(["user", 1], () => api.fetchUser(1));
  console.log("  cached: ['todos'], ['todos', {done:false}], ['user', 1]");
  console.log("  requests so far:", todoApiCalls);

  // The mutation: create a todo, then invalidate.
  client.clearLog();
  todos.push({ id: 2, text: "Second" });          // the server changed
  const invalidated = client.invalidateQueries(["todos"]);

  console.log("\n  mutate(createTodo) → onSuccess → invalidateQueries(['todos'])");
  console.log("    entries invalidated:", invalidated, "← BOTH todos queries");
  console.log("    ['user', 1] invalidated?",
    client.getEntry(["user", 1]).isInvalidated ? "yes 🐛" : "no ✅ (different key)");

  // A mounted component refetches:
  await client.fetchQuery(["todos"], fetchTodos);
  await new Promise(r => setImmediate(r));
  console.log("\n    the mounted list refetches → requests:", todoApiCalls);
  console.log("    fresh data:", JSON.stringify(client.getQueryData(["todos"])));

  console.log("\n  Note the PARTIAL match: invalidateQueries(['todos']) hit both");
  console.log("  ['todos'] and ['todos', {done:false}], and left ['user', 1]");
  console.log("  alone. That hierarchy is why queryKey is an ARRAY.");
  console.log("\n  And note it did not refetch immediately — it marked them");
  console.log("  STALE. Mounted queries refetch; unmounted ones wait until");
  console.log("  someone needs them. You declare 'this data is now wrong' and");
  console.log("  the library decides when to act.\n");

  await keyDemo();
}


// ══════════════════════════════════════════════════════════════════
// § 8 — THE queryKey IS THE DESIGN WIN
// ══════════════════════════════════════════════════════════════════

async function keyDemo() {
  console.log("§8 — why queryKey is the real lesson:\n");

  console.log("  Remember the useFetch deps problem:");
  console.log("    useEffect(() => { fetch(url, options) }, [url]);");
  console.log("       ↑ `options` is READ but not declared → stale closure");
  console.log("       ↑ declare it → an object literal → infinite loop");
  console.log("    Neither option is correct. → 03_custom-hooks/02 §6");
  console.log("");
  console.log("  React Query's answer:");
  console.log("    useQuery({ queryKey: ['user', id, { full: true }], queryFn })");
  console.log("       ↑ you DECLARE the dependency. It is the cache key AND the");
  console.log("         dep array AND the identity, all at once.");

  const client = createQueryClient({ staleTime: 60_000 });
  apiCalls = 0;

  await client.fetchQuery(["user", 1], () => api.fetchUser(1));
  await client.fetchQuery(["user", 2], () => api.fetchUser(2));
  await client.fetchQuery(["user", 1], () => api.fetchUser(1));   // same key!

  console.log("\n    fetch ['user',1], ['user',2], then ['user',1] again:");
  console.log("      requests:", apiCalls, "← the third was a cache hit ✅");
  console.log("      cache entries:", client.cacheSize());

  console.log("\n  The key is DEEP-COMPARED, not reference-compared. So");
  console.log("  ['user', 1, { full: true }] built fresh every render is the");
  console.log("  SAME key. The object-identity trap that breaks useEffect deps");
  console.log("  simply does not exist here.");
  console.log("\n  That is the design lesson worth taking to any API you build:");
  console.log("  React Query looked at 'infer dependencies from a closure' —");
  console.log("  which is what useEffect does, and it is the source of half the");
  console.log("  bugs in this whole course — and said 'no, DECLARE them'.\n");

  await verdict();
}


// ══════════════════════════════════════════════════════════════════
// § 9 — THE VERDICT
// ══════════════════════════════════════════════════════════════════

async function verdict() {
  console.log("§9 — what happens to your state library:\n");

  const before = [
    ["users, products, orders", "Redux", "→ React Query"],
    ["the current user's profile", "Redux", "→ React Query"],
    ["a cart from the server", "Redux", "→ React Query"],
    ["search results", "Redux", "→ React Query"],
    ["isModalOpen", "Redux", "→ useState"],
    ["theme", "Redux", "→ Context"],
    ["a form draft", "Redux", "→ useState / RHF"],
  ];

  console.log("  a typical Redux store, audited:\n");
  console.log("    what                       | was    | belongs in");
  console.log("    ---------------------------|--------|----------------");
  for (const [what, was, belongs] of before) {
    console.log(`    ${what.padEnd(26)} | ${was.padEnd(6)} | ${belongs}`);
  }

  const serverData = before.filter(r => r[2].includes("Query")).length;
  console.log(`\n    ${serverData} of ${before.length} were SERVER DATA.`);
  console.log("\n  Move those out and what remains is a modal boolean, a theme,");
  console.log("  and a form draft. That does not need Redux. It does not need");
  console.log("  Zustand either.");
  console.log("\n  THIS is the point of this file, and of the whole section:");
  console.log("  most 'we need a state management library' conversations are");
  console.log("  really 'we are hand-caching server data'. Fix that first, then");
  console.log("  look at what is left. Usually it is small.");
  console.log("\n  ⚠️  And the honest 2026 note: React Server Components move this");
  console.log("     again. If the server renders with the data already in place,");
  console.log("     you do not need a client cache for it at all. React Query is");
  console.log("     still the answer for interactive, client-fetched data — but");
  console.log("     the ground keeps shifting toward 'do not ship it to the");
  console.log("     client in the first place'.\n");

  runAssertions();
}


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "React Query fetches too much":
//   staleTime is 0 by default. Every mount refetches. → §5.
//
// Bug 2 — Copying query data into useState:
//   const [user, setUser] = useState(query.data) — now there are two owners
//   and yours never updates. Just use query.data.
//
// Bug 3 — An unstable queryKey:
//   ['user', new Date()] — a new key every render, so a new cache entry every
//   render. Keys must be serializable and stable.
//
// Bug 4 — Invalidating too broadly:
//   invalidateQueries() with no key invalidates EVERYTHING. Partial matching
//   is a feature; use the narrowest prefix.
//
// Bug 5 — Mutations that do not invalidate:
//   You created a todo and the list still shows the old data. onSuccess must
//   invalidate.
//
// Bug 6 — Putting client state in a query:
//   isModalOpen is not server data. It has no key and no server.
//
// Bug 7 — Fighting Suspense:
//   useSuspenseQuery changes error/loading handling completely. Pick one model.
//
// Bug 8 — enabled: false and expecting a fetch:
//   A disabled query never runs. Common with dependent queries.
//
// Bug 9 — Non-serializable data in the key:
//   Keys are hashed deterministically. A function or a class instance breaks it.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

async function runAssertions() {
  function assert(condition, message) {
    if (!condition) {
      throw new Error("Assertion failed: " + message);
    }
  }

  // Dedupe — the headline:
  const c1 = createQueryClient();
  apiCalls = 0;
  const results = await Promise.all([
    c1.fetchQuery(["user", 9], () => api.fetchUser(9)),
    c1.fetchQuery(["user", 9], () => api.fetchUser(9)),
    c1.fetchQuery(["user", 9], () => api.fetchUser(9)),
  ]);
  assert(apiCalls === 1, "THREE components asking for one key → ONE request");
  assert(Object.is(results[0], results[1]),
    "...and they all share the SAME object — one cache entry");

  // staleTime:
  const c2 = createQueryClient({ staleTime: 30_000 });
  apiCalls = 0;
  await c2.fetchQuery(["user", 8], () => api.fetchUser(8));
  await c2.fetchQuery(["user", 8], () => api.fetchUser(8));
  assert(apiCalls === 1, "fresh data → no fetch at all, not even in the background");
  c2.advance(40_000);
  await c2.fetchQuery(["user", 8], () => api.fetchUser(8));
  await new Promise(r => setImmediate(r));
  assert(apiCalls === 2, "past staleTime → refetch");

  // Stale-while-revalidate: the cached value is returned SYNCHRONOUSLY:
  const c3 = createQueryClient({ staleTime: 0 });
  await c3.fetchQuery(["swr"], () => Promise.resolve("v1"));
  c3.advance(1000);
  const served = await c3.fetchQuery(["swr"], () => Promise.resolve("v2"));
  assert(served === "v1",
    "stale-while-revalidate: the user gets the OLD data instantly — no spinner");
  await new Promise(r => setImmediate(r));
  assert(c3.getQueryData(["swr"]) === "v2", "...and the fresh data lands right after");

  // gcTime:
  const c4 = createQueryClient({ gcTime: 1000 });
  await c4.fetchQuery(["gc"], () => Promise.resolve("x"));
  const e = c4.getEntry(["gc"]);
  const obs = () => {};
  e.observers.add(obs);
  c4.advance(5000);
  assert(c4.collectGarbage() === 0, "an OBSERVED entry is never collected");
  e.observers.delete(obs);
  assert(c4.collectGarbage() === 1, "an unobserved entry past gcTime is collected");

  // Partial key matching:
  const c5 = createQueryClient();
  await c5.fetchQuery(["todos"], () => Promise.resolve([]));
  await c5.fetchQuery(["todos", 1], () => Promise.resolve({}));
  await c5.fetchQuery(["user", 1], () => Promise.resolve({}));
  const n = c5.invalidateQueries(["todos"]);
  assert(n === 2, "invalidateQueries(['todos']) hits ['todos'] AND ['todos', 1]");
  assert(c5.getEntry(["user", 1]).isInvalidated !== true,
    "...and leaves ['user', 1] alone. That hierarchy is why keys are arrays.");
  assert(c5.getEntry(["todos", 1]).isInvalidated === true,
    "the nested ['todos', 1] WAS invalidated — partial prefix matching");

  // The key is deep-compared — the useEffect deps trap does not exist:
  const c6 = createQueryClient({ staleTime: 60_000 });
  apiCalls = 0;
  await c6.fetchQuery(["user", 1, { full: true }], () => api.fetchUser(1));
  await c6.fetchQuery(["user", 1, { full: true }], () => api.fetchUser(1));
  assert(apiCalls === 1,
    "a key with a fresh object literal is the SAME key — deep-compared, not " +
    "reference-compared. The infinite-loop trap simply does not exist here.");

  console.log("§11 — mini assertions passed for: React Query");
  console.log("\n  The one that ties the section together: an object literal in");
  console.log("  a queryKey is the same key. In a useEffect dep array, that same");
  console.log("  object is an infinite loop. React Query DECLARES dependencies");
  console.log("  where useEffect INFERS them — and that is the whole difference.");
}


// Kick off the async demo chain: §4 → §5 → §6 → §7 → §8 → §9 → assertions.
dedupeDemo();


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "why React Query instead of Redux?", answer like this:
//
//   "Because they solve different problems, and the framing that clarifies it
//    is: server state is not state, it's a CACHE of someone else's state. You
//    don't own it, it changes without telling you, it goes stale the instant
//    you fetch it, and it's needed in five places at once. useState and Redux
//    both pretend you own it — which is why every hand-rolled useFetch grows
//    into a bad cache library.
//
//    Once you see it as a cache, the API is obvious. A key, because caches have
//    keys. staleTime, because cached data has a freshness horizon. Invalidate,
//    because you know when it changed. And dedupe — three components asking for
//    ['user', 1] is one request and one shared reference, where three useFetch
//    hooks are three requests and three copies that drift apart.
//
//    The two numbers people confuse: staleTime is 'when do I refetch',
//    gcTime is 'when do I forget'. Independent. The defaults — staleTime 0,
//    gcTime five minutes — mean 'refetch on every mount, but show the cached
//    data instantly while you do'. That's stale-while-revalidate, and it's why
//    navigating back feels instant. 'React Query fetches too much' always means
//    'I never set staleTime'.
//
//    Mutations invalidate rather than refetch — you declare the data is wrong,
//    and mounted queries refetch while unmounted ones wait. And the key match is
//    partial, which is why queryKey is an array: invalidating ['todos'] hits
//    ['todos', 1] too.
//
//    The design lesson I'd take from it: the queryKey is the cache key AND the
//    dependency array. useEffect INFERS dependencies from a closure, which is
//    the source of the stale-closure and infinite-loop bugs. React Query makes
//    you DECLARE them — and because the key is deep-compared, an object literal
//    in a key is fine, where in a dep array it's an infinite loop.
//
//    The practical punchline: audit a typical Redux store and most of it is
//    server data. Move that to React Query and what's left is a modal boolean,
//    a theme, and a form draft — which doesn't need a state library at all."
//
// The cache framing plus the queryKey design lesson is the senior answer.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why isn't server data "state"?
// A1. You do not own it. It changes without you, goes stale immediately, and
//     is needed in many places. That is a cache.
//
// Q2. staleTime vs gcTime?
// A2. staleTime = when to refetch (freshness). gcTime = when to delete an
//     unused entry (memory). Independent.
//
// Q3. What is stale-while-revalidate?
// A3. Serve the cached data instantly, refetch in the background, update when
//     it lands. No spinner on revisit.
//
// Q4. How does dedupe work?
// A4. A map from key to in-flight promise. Everyone asking for the same key
//     awaits the same promise.
//
// Q5. What does invalidateQueries do?
// A5. Marks matching entries stale — it does not refetch immediately. Mounted
//     queries refetch; unmounted ones wait.
//
// Q6. Why is queryKey an array?
// A6. Hierarchy and partial matching. ['todos'] invalidates ['todos', 1].
//
// Q7. Why does React Query "fetch too much"?
// A7. staleTime defaults to 0, so every mount refetches. Set it.
//
// Q8. Can you use it with Redux?
// A8. Yes, and it is common — React Query for server data, Redux for client
//     state. They are not competitors.
//
// Q9. What is the queryKey's design lesson?
// A9. Declare dependencies instead of inferring them from a closure. That is
//     the fix for the entire useEffect deps bug class.
//
// Q10. Does RSC make it obsolete?
// A10. It shrinks its scope. If the server renders with the data, no client
//      cache is needed. It is still the answer for interactive client fetching.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is React Query?
//   Back : A cache for server data, keyed by queryKey.
//
// Flashcard 2:
//   Front: The framing?
//   Back : Server state is not state — it is a cache of someone else's state.
//
// Flashcard 3:
//   Front: staleTime vs gcTime?
//   Back : When to refetch vs when to forget.
//
// Flashcard 4:
//   Front: What is the most common complaint, and its cause?
//   Back : "It fetches too much" = staleTime is 0 by default.
//
// Flashcard 5:
//   Front: Why is queryKey an array?
//   Back : Hierarchy — partial matching for invalidation.
//
// Flashcard 6:
//   Front: The design lesson?
//   Back : DECLARE dependencies; useEffect infers them, and that is the bug.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : Audit the store — most of it is server data. Remove that first.


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the dedupe from memory. It is a Map from key to in-flight promise.
//
// Task 2:
//   Add refetchOnWindowFocus. Notice it is just invalidate + refetch on an
//   event — and that this is the feature no useFetch ever has.
//
// Task 3:
//   Add retry with exponential backoff. Three lines, and it is the difference
//   between a network blip and a permanent error UI.
//
// Task 4:
//   Implement useMutation with onMutate/onError/onSettled for an optimistic
//   update. → 11_optimistic-updates.js
//
// Task 5:
//   Audit a real Redux store you have seen. Count what fraction is server
//   data. The number is usually shocking.
//
// Task 6:
//   Explain in 60 seconds why server data is not state, to someone who has
//   put their entire API response in Redux.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Server state is not state. It is a CACHE of someone else's state.
//
// If you remember the common bug:
//   staleTime is 0 by default, so every mount refetches. And copying
//   query.data into useState gives you a second owner that is always stale.
//
// If you remember the professional framing:
//   The queryKey declares dependencies instead of inferring them — the fix for
//   the whole useEffect deps bug class. And most state-library debates dissolve
//   once the server data leaves.
//
// NEXT TOPIC -> 11_optimistic-updates.js
