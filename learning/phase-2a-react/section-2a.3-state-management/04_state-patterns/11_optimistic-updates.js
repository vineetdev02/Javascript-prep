// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  11_optimistic-updates.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Optimistic updates
//
// WHAT YOU WILL MASTER HERE:
//   1. Update the UI before the server answers — and the rollback
//   2. The four-step contract: snapshot, apply, rollback, settle
//   3. Why you MUST cancel in-flight queries first (the overwrite bug)
//   4. Concurrent mutations, and why a naive snapshot loses data
//   5. useOptimistic (React 19) vs React Query — and when NOT to
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/11_optimistic-updates.js"
//
// Prerequisite: 10_react-query-usequery-usemutation.js.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Optimistic updates:
// Apply the change to the UI immediately, assuming the server will succeed —
// and roll back if it does not.
//
// If interviewer says "explain it simply", say:
// "You click Like, and the heart fills instantly. The request is still in
//  flight. If it fails, the heart un-fills. You bet on success and pay only
//  when you lose."
//
// If interviewer asks "why does it matter?", say:
// "Because a 200ms round trip on every interaction makes an app feel broken.
//  But the interesting part is the rollback: you need a snapshot of the exact
//  previous state, and you must cancel in-flight refetches first — otherwise
//  a request that started BEFORE your mutation lands after it and overwrites
//  your optimistic value with stale data."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   bet on success, keep the receipt
//
// The four steps — this is the contract, and every one matters:
//
//   1. CANCEL   in-flight queries for this key
//               (or they land later and overwrite you → §5)
//   2. SNAPSHOT the current state
//               (this is your ONLY way back → §4)
//   3. APPLY    the optimistic change immediately
//   4. SETTLE   on error → restore the snapshot
//               on success → keep it, then revalidate against the server
//
// React Query's API is literally those four:
//
//   useMutation({
//     mutationFn: toggleLike,
//     onMutate: async (id) => {
//       await queryClient.cancelQueries({ queryKey: ['post', id] });   // 1
//       const previous = queryClient.getQueryData(['post', id]);       // 2
//       queryClient.setQueryData(['post', id], optimisticValue);       // 3
//       return { previous };                                           // the receipt
//     },
//     onError: (err, id, context) => {
//       queryClient.setQueryData(['post', id], context.previous);      // 4a
//     },
//     onSettled: (data, err, id) => {
//       queryClient.invalidateQueries({ queryKey: ['post', id] });     // 4b
//     },
//   });
//
// Runtime rule:
//   onMutate runs BEFORE the request. Its return value becomes `context` in
//   onError and onSettled. That is how the snapshot travels.
//
// Practical rule:
//   Only bet when you are confident. Likes, toggles, reorders, adding a todo.
//   Never on payments, or anything where being wrong is expensive. → §7
//
// Common trap:
//   Skipping the cancel. It works in dev and fails under real latency.


// ══════════════════════════════════════════════════════════════════
// § 3 — A CACHE WITH CANCELLATION
// ══════════════════════════════════════════════════════════════════

function createClient() {
  const cache = new Map();
  const inFlight = new Map();
  const log = [];

  const hash = (k) => JSON.stringify(k);

  return {
    getQueryData: (key) => cache.get(hash(key)),
    setQueryData: (key, updater) => {
      const k = hash(key);
      const next = typeof updater === "function" ? updater(cache.get(k)) : updater;
      cache.set(k, next);
      log.push(`set        ${k} → ${JSON.stringify(next)}`);
      return next;
    },
    // Register a fetch so it can be cancelled.
    fetchQuery: async (key, fn) => {
      const k = hash(key);
      const token = { cancelled: false };
      inFlight.set(k, token);
      log.push(`fetch      ${k} (in flight)`);
      const data = await fn();
      if (token.cancelled) {
        log.push(`discarded  ${k} (cancelled — result dropped)`);
        return cache.get(k);                 // ← the stale result never lands
      }
      inFlight.delete(k);
      cache.set(k, data);
      log.push(`landed     ${k} → ${JSON.stringify(data)}`);
      return data;
    },
    cancelQueries: (key) => {
      const k = hash(key);
      const token = inFlight.get(k);
      if (token) {
        token.cancelled = true;
        inFlight.delete(k);
        log.push(`cancel     ${k} (in-flight request marked stale)`);
        return true;
      }
      log.push(`cancel     ${k} (nothing in flight)`);
      return false;
    },
    getLog: () => log.slice(),
    clearLog: () => (log.length = 0),
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));


// ══════════════════════════════════════════════════════════════════
// § 4 — THE ROLLBACK
// ══════════════════════════════════════════════════════════════════

console.log("§4 — the snapshot IS the rollback:\n");

async function rollbackDemo() {
  // ── WITHOUT a snapshot ────────────────────────────────────────
  const c1 = createClient();
  c1.setQueryData(["post", 1], { id: 1, likes: 10, liked: false });
  c1.clearLog();

  const uiNoSnapshot = [];
  try {
    // 3. APPLY optimistically
    c1.setQueryData(["post", 1], (p) => ({ ...p, likes: p.likes + 1, liked: true }));
    uiNoSnapshot.push(c1.getQueryData(["post", 1]).likes);

    await sleep(5);
    throw new Error("500 Server Error");         // the request FAILS
  } catch {
    // 4a. ...roll back to what? We never took a snapshot.
    //     Guessing "likes - 1" is a BUG: what if it was 12 by now, because
    //     someone else liked it too? You would corrupt the count.
    uiNoSnapshot.push(c1.getQueryData(["post", 1]).likes);   // stuck at 11
  }

  // ── WITH a snapshot ───────────────────────────────────────────
  const c2 = createClient();
  c2.setQueryData(["post", 1], { id: 1, likes: 10, liked: false });
  const uiWithSnapshot = [];

  async function likeMutation(id) {
    // 1. CANCEL
    await c2.cancelQueries(["post", id]);
    // 2. SNAPSHOT — the receipt
    const previous = c2.getQueryData(["post", id]);
    // 3. APPLY
    c2.setQueryData(["post", id], (p) => ({ ...p, likes: p.likes + 1, liked: true }));
    uiWithSnapshot.push(c2.getQueryData(["post", id]).likes);

    try {
      await sleep(5);
      throw new Error("500 Server Error");
    } catch {
      // 4a. ROLL BACK — restore the exact snapshot. No arithmetic. No guessing.
      c2.setQueryData(["post", id], previous);
      uiWithSnapshot.push(c2.getQueryData(["post", id]).likes);
    }
  }
  await likeMutation(1);

  console.log("  user clicks Like. Starting likes: 10. The request FAILS.\n");
  console.log("    no snapshot  → UI showed:", JSON.stringify(uiNoSnapshot),
    "🐛 stuck at 11. The like never happened.");
  console.log("    with snapshot→ UI showed:", JSON.stringify(uiWithSnapshot),
    "✅ 11, then back to 10");

  console.log("\n  Note what the snapshot avoids: `likes - 1` as a rollback is a");
  console.log("  BUG. If someone else liked the post while your request was in");
  console.log("  flight, the count is 12, and subtracting gives 11 — wrong in a");
  console.log("  new way. You restore the exact object you saved. No arithmetic.");
  console.log("\n  That is why onMutate RETURNS the snapshot: React Query hands");
  console.log("  it to onError as `context`. The receipt travels with the");
  console.log("  mutation.\n");

  await cancelDemo();
}


// ══════════════════════════════════════════════════════════════════
// § 5 — WHY YOU MUST CANCEL FIRST
// ══════════════════════════════════════════════════════════════════
//
// Step 1 is the one everyone skips, and it works fine in dev.

async function cancelDemo() {
  console.log("§5 — the overwrite: skipping cancelQueries:\n");

  // ── NO CANCEL ─────────────────────────────────────────────────
  const c1 = createClient();
  c1.setQueryData(["post", 1], { id: 1, likes: 10 });
  c1.clearLog();

  // A refetch was ALREADY in flight when the user clicked — e.g. a window
  // focus refetch, or a poll. It will return the OLD data (likes: 10).
  const inFlightRefetch = c1.fetchQuery(["post", 1], async () => {
    await sleep(20);                        // slow
    return { id: 1, likes: 10 };            // the server's value BEFORE the like
  });

  await sleep(5);
  // The user clicks Like. No cancel!
  c1.setQueryData(["post", 1], (p) => ({ ...p, likes: p.likes + 1 }));
  const afterOptimistic = c1.getQueryData(["post", 1]).likes;

  await inFlightRefetch;                    // the old refetch lands...
  const afterRefetch = c1.getQueryData(["post", 1]).likes;

  console.log("  a refetch was already in flight when the user clicked Like:\n");
  for (const line of c1.getLog()) console.log("   ", line);
  console.log(`\n    after the optimistic update: ${afterOptimistic}`);
  console.log(`    after the old refetch landed: ${afterRefetch}`,
    "🐛 the heart un-filled by itself");

  // ── WITH CANCEL ───────────────────────────────────────────────
  const c2 = createClient();
  c2.setQueryData(["post", 1], { id: 1, likes: 10 });
  c2.clearLog();

  const inFlight2 = c2.fetchQuery(["post", 1], async () => {
    await sleep(20);
    return { id: 1, likes: 10 };
  });

  await sleep(5);
  c2.cancelQueries(["post", 1]);            // ← STEP 1
  c2.setQueryData(["post", 1], (p) => ({ ...p, likes: p.likes + 1 }));
  const opt2 = c2.getQueryData(["post", 1]).likes;

  await inFlight2;
  const after2 = c2.getQueryData(["post", 1]).likes;

  console.log("\n  the same thing, with cancelQueries first:\n");
  for (const line of c2.getLog()) console.log("   ", line);
  console.log(`\n    after the optimistic update: ${opt2}`);
  console.log(`    after the old refetch:        ${after2}`, "✅ held");

  console.log("\n  Read the two logs. Without the cancel, a request that started");
  console.log("  BEFORE the click landed AFTER it, carrying pre-click data, and");
  console.log("  overwrote the optimistic value. The user watched their like");
  console.log("  undo itself half a second later.");
  console.log("\n  This is the same class of bug as the useFetch race — a slow");
  console.log("  response landing last and winning. It works perfectly in dev on");
  console.log("  localhost and fails on a real network.");
  console.log("  → 03_custom-hooks/02_usefetch-custom-hook.js §4\n");

  await concurrentDemo();
}


// ══════════════════════════════════════════════════════════════════
// § 6 — CONCURRENT MUTATIONS
// ══════════════════════════════════════════════════════════════════
//
// The subtlety that separates a demo from production.

async function concurrentDemo() {
  console.log("§6 — two mutations in flight at once:\n");

  const c = createClient();
  c.setQueryData(["todos"], ["A"]);

  const results = [];

  // The user adds two todos quickly. BOTH mutations snapshot.
  async function addTodo(text, delay, shouldFail) {
    const previous = c.getQueryData(["todos"]);          // snapshot
    c.setQueryData(["todos"], (t) => [...t, text]);      // apply

    try {
      await sleep(delay);
      if (shouldFail) throw new Error("failed");
      results.push(`${text} ok`);
    } catch {
      // 🐛 THE BUG: rolling back to MY snapshot discards the OTHER
      //    mutation's optimistic update too.
      c.setQueryData(["todos"], previous);
      results.push(`${text} rolled back`);
    }
  }

  await Promise.all([
    addTodo("B", 20, true),      // slow, FAILS
    addTodo("C", 5, false),      // fast, succeeds
  ]);

  console.log("  add 'B' (fails, slow) and 'C' (succeeds, fast):\n");
  console.log("    results:", JSON.stringify(results));
  console.log("    final todos:", JSON.stringify(c.getQueryData(["todos"])));
  console.log("    🐛 'C' SUCCEEDED and is gone. B's rollback restored a");
  console.log("       snapshot taken before C existed.");

  console.log("\n  This is why naive optimistic updates break under concurrency.");
  console.log("  The snapshot is a point in time, and rolling back to it undoes");
  console.log("  everything that happened since — including other people's");
  console.log("  successful work.");
  console.log("\n  THE FIXES:");
  console.log("    • onSettled → invalidateQueries. Let the SERVER be the truth");
  console.log("      once the dust settles. This is why React Query's template");
  console.log("      always has onSettled, and it is the practical answer.");
  console.log("    • serialize mutations for the same key (a mutation queue)");
  console.log("    • React Query's variables-based approach: derive the UI from");
  console.log("      the list of PENDING mutations rather than mutating the cache");
  console.log("\n  The last one is what useOptimistic does, and it is why it is");
  console.log("  a better model. → §7\n");

  await useOptimisticDemo();
}


// ══════════════════════════════════════════════════════════════════
// § 7 — useOptimistic (React 19)
// ══════════════════════════════════════════════════════════════════
//
// React 19 built this into the framework, with a genuinely better model.
//
//   const [optimisticTodos, addOptimistic] = useOptimistic(
//     todos,                                    // the REAL state
//     (current, newTodo) => [...current, newTodo]  // how to apply optimistically
//   );
//
//   async function formAction(formData) {
//     addOptimistic({ text: formData.get("text"), pending: true });  // instant
//     await createTodo(formData);               // the real request
//     // No rollback needed. When the action finishes, React DISCARDS the
//     // optimistic state and re-renders from the real one.
//   }
//
// The key difference:
//   React Query MUTATES the cache and needs a snapshot to undo.
//   useOptimistic DERIVES a temporary view on top of the real state. There is
//   nothing to undo — the optimistic layer just evaporates.
//
// Which means:
//   ✅ no snapshot, no rollback, no context
//   ✅ concurrent mutations compose — each is a layer on the real state, so
//      one failing does not erase another's success (§6's bug cannot happen)
//   ✅ automatic: it clears when the transition ends
//   ⚠️  it is tied to actions/transitions — it is not a general cache tool
//
// The framing: React Query asks "how do I undo?". useOptimistic asks "how do
// I show a pending layer?". The second question has no rollback bug in it,
// because there is nothing to roll back.

async function useOptimisticDemo() {
  console.log("§7 — useOptimistic: derive, do not mutate:\n");

  // Model it: real state + a list of pending optimistic values.
  function createOptimistic(realState, reducer) {
    let pending = [];
    return {
      // The rendered value is DERIVED, never stored:
      value: () => pending.reduce(reducer, realState),
      add: (v) => { pending.push(v); },
      // When an action settles, its layer is dropped:
      settle: (v) => { pending = pending.filter(p => p !== v); },
      setReal: (next) => { realState = next; },
      pendingCount: () => pending.length,
    };
  }

  const opt = createOptimistic(["A"], (list, todo) => [...list, todo]);

  console.log("  real todos:", JSON.stringify(opt.value()));

  opt.add("B");                                 // mutation 1 starts
  opt.add("C");                                 // mutation 2 starts
  console.log("  add B and C optimistically:", JSON.stringify(opt.value()));
  console.log("    pending layers:", opt.pendingCount());

  // C succeeds first — the server confirms it:
  opt.setReal(["A", "C"]);
  opt.settle("C");
  console.log("\n  C succeeds → server says ['A','C']:", JSON.stringify(opt.value()));
  console.log("    B is still shown optimistically. Nothing was lost.");

  // B FAILS — its layer just... goes away:
  opt.settle("B");
  console.log("\n  B fails → drop its layer:", JSON.stringify(opt.value()));
  console.log("    ✅ C survived. No snapshot, no rollback, no context object.");

  console.log("\n  Compare §6: the same scenario destroyed C's successful update.");
  console.log("  Here it cannot, because nothing was ever MUTATED. The optimistic");
  console.log("  values are layers derived on top of the real state, and a failed");
  console.log("  layer is simply removed.");
  console.log("\n  That is the deeper lesson: 'how do I undo this mutation?' is a");
  console.log("  harder question than 'how do I show a pending layer?'. Choosing");
  console.log("  the second question makes the rollback bug unrepresentable.\n");

  whenNot();
}


// ══════════════════════════════════════════════════════════════════
// § 8 — WHEN NOT TO BE OPTIMISTIC
// ══════════════════════════════════════════════════════════════════

function whenNot() {
  console.log("§8 — when NOT to bet:\n");

  const cases = [
    ["a Like button", "✅ yes", "fails ~never; wrong is trivial and reversible"],
    ["a todo checkbox", "✅ yes", "same"],
    ["drag to reorder", "✅ yes", "instant feedback is the whole feature"],
    ["adding a comment", "✅ yes", "show it greyed until confirmed"],
    ["a payment", "❌ NO", "'Paid!' then 'actually, declined' is unforgivable"],
    ["deleting an account", "❌ NO", "irreversible; the user must SEE it happen"],
    ["a bank transfer", "❌ NO", "money. Wait for the server."],
    ["a booking / seat", "❌ NO", "contended resource — someone else may win"],
  ];

  console.log("  action              | optimistic? | why");
  console.log("  --------------------|-------------|--------------------------------");
  for (const [action, verdict, why] of cases) {
    console.log(`  ${action.padEnd(19)} | ${verdict.padEnd(11)} | ${why}`);
  }

  console.log("\n  The test is TWO questions, not one:");
  console.log("    1. How likely is failure?  (a like: ~never. a booking: often.)");
  console.log("    2. How bad is being wrong? (a like: trivial. a payment: awful.)");
  console.log("\n  Optimistic only when the answer is 'unlikely AND cheap'. The");
  console.log("  booking row is the interesting one: failure is LIKELY, because");
  console.log("  someone else may take the seat. Optimism there is a lie you tell");
  console.log("  the user often.");
  console.log("\n  And the honest caveat: optimistic updates are DUPLICATED LOGIC.");
  console.log("  Your client now computes what the server would compute. When the");
  console.log("  server's rule changes — a like also bumps a trending score — your");
  console.log("  optimistic version is subtly wrong until someone remembers.");
  console.log("  That drift is the real cost, and it is why you only pay it where");
  console.log("  the UX win is genuine.\n");

  runAssertions();
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The like un-fills itself half a second later:
//   No cancelQueries. An in-flight refetch overwrote you. → §5.
//
// Bug 2 — Rollback corrupts the count:
//   You did `likes - 1` instead of restoring the snapshot. → §4.
//
// Bug 3 — A successful mutation's update disappears:
//   A concurrent mutation rolled back to a snapshot taken before it. → §6.
//
// Bug 4 — The optimistic value sticks around after an error:
//   No onError, or onMutate returned nothing so context is undefined.
//
// Bug 5 — Optimistic and server values both render (a duplicate row):
//   You added optimistically AND the refetch added it again. Match by a
//   temporary id, or let onSettled's invalidate be the truth.
//
// Bug 6 — Optimistic payments:
//   → §8. Do not.
//
// Bug 7 — The optimistic value drifts from the server's rule:
//   Duplicated logic. Your client's math and the server's diverge. → §8.
//
// Bug 8 — No pending indicator:
//   Optimistic without any "saving..." affordance means the user cannot tell
//   a failure from a slow network.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

async function runAssertions() {
  function assert(condition, message) {
    if (!condition) {
      throw new Error("Assertion failed: " + message);
    }
  }

  // Snapshot + rollback:
  const c = createClient();
  c.setQueryData(["post", 1], { likes: 10, liked: false });
  const snapshot = c.getQueryData(["post", 1]);
  c.setQueryData(["post", 1], (p) => ({ ...p, likes: p.likes + 1, liked: true }));
  assert(c.getQueryData(["post", 1]).likes === 11, "the optimistic update applied instantly");
  c.setQueryData(["post", 1], snapshot);
  assert(c.getQueryData(["post", 1]).likes === 10, "the snapshot restored it exactly");
  assert(c.getQueryData(["post", 1]).liked === false,
    "...including `liked` — a subtraction would have missed that field entirely");
  assert(Object.is(c.getQueryData(["post", 1]), snapshot),
    "the EXACT object, not a reconstruction. No arithmetic, no guessing.");

  // Cancellation:
  const c2 = createClient();
  c2.setQueryData(["x"], { v: 1 });
  const p = c2.fetchQuery(["x"], async () => { await sleep(10); return { v: 1 }; });
  await sleep(2);
  const cancelled = c2.cancelQueries(["x"]);
  assert(cancelled === true, "cancelQueries found an in-flight request and marked it");
  c2.setQueryData(["x"], { v: 2 });
  await p;
  assert(c2.getQueryData(["x"]).v === 2,
    "the cancelled refetch's result was DISCARDED — the optimistic value held ✅");

  // Without the cancel, the same sequence loses:
  const c3 = createClient();
  c3.setQueryData(["y"], { v: 1 });
  const p3 = c3.fetchQuery(["y"], async () => { await sleep(10); return { v: 1 }; });
  await sleep(2);
  c3.setQueryData(["y"], { v: 2 });        // optimistic, NO cancel
  await p3;
  assert(c3.getQueryData(["y"]).v === 1,
    "no cancel → the stale in-flight result landed last and overwrote the " +
    "optimistic value 🐛");

  // useOptimistic's model cannot have §6's bug:
  function derive(real, pending, reducer) { return pending.reduce(reducer, real); }
  const reducer = (list, item) => [...list, item];
  const withBoth = derive(["A"], ["B", "C"], reducer);
  assert(JSON.stringify(withBoth) === JSON.stringify(["A", "B", "C"]),
    "two pending layers compose");
  const afterBFails = derive(["A", "C"], [], reducer);
  assert(afterBFails.includes("C"),
    "B's failure removed only B's layer — C's success survives. The §6 bug is " +
    "unrepresentable when you DERIVE instead of MUTATE.");

  console.log("§10 — mini assertions passed for: Optimistic updates");
  console.log("\n  The pair that matters: with cancelQueries the optimistic value");
  console.log("  holds; without it, a request that started BEFORE the click lands");
  console.log("  after it and undoes the user's action.");
}

rollbackDemo();


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you implement optimistic updates?", answer:
//
//   "Four steps, and each one is there for a reason. Cancel in-flight queries
//    for that key, snapshot the current state, apply the change, and then on
//    error restore the snapshot, on settled invalidate.
//
//    The snapshot is the interesting part. People try to roll back with
//    arithmetic — likes minus one — and that's a bug: if someone else liked
//    the post while your request was in flight, the count is 12 and
//    subtracting gives 11, wrong in a new way. You restore the exact object
//    you saved. That's why onMutate RETURNS the snapshot — React Query passes
//    it to onError as context.
//
//    The step everyone skips is the cancel, and it works fine in dev. If a
//    refetch was already in flight when the user clicked — a focus refetch, a
//    poll — it carries pre-click data and lands AFTER your optimistic update,
//    overwriting it. The user watches their like undo itself. Same class as
//    the useFetch race: a slow response landing last and winning.
//
//    The subtlety that separates a demo from production is concurrent
//    mutations. Two in flight, the first fails and rolls back to a snapshot
//    taken before the second existed — so a SUCCESSFUL update gets erased.
//    The practical fix is onSettled invalidating so the server settles it.
//
//    React 19's useOptimistic has a better model: instead of mutating the
//    cache and needing a snapshot to undo, it DERIVES a pending layer on top
//    of the real state. There's nothing to roll back — the layer just
//    evaporates when the action settles, and concurrent mutations compose,
//    so that bug is unrepresentable. 'How do I show a pending layer' is a
//    much easier question than 'how do I undo this'.
//
//    And I'd only bet where failure is unlikely AND cheap. Likes, toggles,
//    reorders. Never payments — 'Paid!' then 'actually, declined' is
//    unforgivable — and never contended resources like seat booking, where
//    failure is LIKELY. The hidden cost is duplicated logic: your client now
//    computes what the server computes, and they drift."
//
// The cancel explanation and the useOptimistic contrast are the senior markers.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What are the four steps?
// A1. Cancel in-flight queries, snapshot, apply, then settle — restore on
//     error, invalidate on settled.
//
// Q2. Why cancel first?
// A2. A refetch that started before the click carries stale data and lands
//     after your update, overwriting it.
//
// Q3. Why snapshot instead of computing the inverse?
// A3. The inverse is wrong if anything else changed meanwhile. Restore the
//     exact object.
//
// Q4. How does the snapshot reach onError?
// A4. onMutate's return value becomes `context`.
//
// Q5. What breaks with concurrent mutations?
// A5. Rolling back to a snapshot taken before another mutation erases its
//     successful update. Fix with onSettled + invalidate, or derive instead.
//
// Q6. How is useOptimistic different?
// A6. It derives a pending layer over real state instead of mutating a cache.
//     No snapshot, no rollback, and layers compose.
//
// Q7. When should you NOT be optimistic?
// A7. When failure is likely (contended bookings) or expensive (payments,
//     deletions). The test is likelihood AND cost.
//
// Q8. What is the hidden cost?
// A8. Duplicated logic. Your client replicates the server's rules, and they
//     drift when the server changes.
//
// Q9. How do you avoid a duplicate row?
// A9. Use a temporary id and reconcile, or let onSettled's invalidate be the
//     source of truth.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What are optimistic updates?
//   Back : Apply now, roll back if the server says no.
//
// Flashcard 2:
//   Front: The four steps?
//   Back : Cancel, snapshot, apply, settle.
//
// Flashcard 3:
//   Front: What is the most-skipped step?
//   Back : cancelQueries. Without it a stale refetch overwrites you.
//
// Flashcard 4:
//   Front: Why snapshot, not subtract?
//   Back : Arithmetic is wrong if anything else changed. Restore the object.
//
// Flashcard 5:
//   Front: What breaks under concurrency?
//   Back : A rollback erases another mutation's success.
//
// Flashcard 6:
//   Front: Why is useOptimistic better?
//   Back : It DERIVES a layer instead of mutating. Nothing to undo.
//
// Flashcard 7:
//   Front: When not to?
//   Back : When failure is likely OR expensive. Never payments.


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the onMutate/onError/onSettled template from memory. Four steps.
//
// Task 2:
//   Reproduce §5 with a 500ms latency. Watch the like undo itself. Then add
//   the cancel.
//
// Task 3:
//   Fix §6 with a mutation queue: serialize mutations for the same key. What
//   did you lose? (Hint: parallelism.)
//
// Task 4:
//   Implement useOptimistic's model properly: real state + a pending array.
//   Prove §6's bug cannot occur.
//
// Task 5:
//   Build the duplicate-row bug: add optimistically AND let a refetch add it
//   too. Fix it with a temporary id.
//
// Task 6:
//   Explain in 60 seconds why the like un-fills itself, to someone who cannot
//   reproduce it locally.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Cancel, snapshot, apply, settle. The snapshot is your only way back.
//
// If you remember the common bug:
//   No cancelQueries → a refetch that started before the click lands after it
//   and undoes the user's action. Works in dev, fails on a real network.
//
// If you remember the professional framing:
//   Derive a pending layer instead of mutating and undoing — that is what
//   useOptimistic does, and it makes the rollback bug unrepresentable. Only
//   bet when failure is unlikely AND cheap.
//
// NEXT TOPIC -> 12_derived-state.js
