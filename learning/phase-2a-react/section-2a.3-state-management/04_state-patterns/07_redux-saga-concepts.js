// ╔══════════════════════════════════════════════════════════════════╗
// ║   State Patterns  →  07_redux-saga-concepts.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Redux Saga (concepts)
//
// WHAT YOU WILL MASTER HERE:
//   1. Why generators — you yield a DESCRIPTION, not a promise
//   2. That indirection is what makes sagas testable with zero mocks
//   3. takeLatest: cancellation that a thunk cannot do — PROVEN
//   4. The effect vocabulary: call, put, take, fork, select
//   5. The honest verdict: when saga is right, and why it lost
//   6. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2a-react/section-2a.3-state-management/04_state-patterns/07_redux-saga-concepts.js"
//
// Prerequisites: 06_redux-thunk-middleware.js, and
// 07_modern-es6-es2024-features/06_generators-iterators.js from Phase 1.


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Redux Saga:
// Middleware that runs generator functions, where you YIELD plain objects
// describing side effects — and the middleware performs them.
//
// If interviewer says "explain it simply", say:
// "Instead of calling fetch, you yield call(fetch, url) — an object that SAYS
//  'call fetch with this url'. The saga middleware does the actual work. Your
//  generator only describes intent."
//
// If interviewer asks "why does it matter?", say:
// "Two things fall out of that indirection. Tests become trivial — you assert
//  on the yielded objects, so no mocking fetch, no mocking dispatch. And
//  cancellation becomes possible — a generator can be stopped between yields,
//  so takeLatest can abandon a stale request. A thunk cannot do either."


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   yield a DESCRIPTION, not a promise
//
// The shift:
//
//   THUNK — you DO the work:
//     const data = await fetch(url);        // it happened. Right now.
//     dispatch({ type: "ok", payload: data });
//
//   SAGA — you DESCRIBE the work:
//     const data = yield call(fetch, url);  // an OBJECT: {type:CALL, fn, args}
//     yield put({ type: "ok", payload: data });   // an OBJECT: {type:PUT, action}
//
//   `call(fetch, url)` does NOT call fetch. It returns
//   { type: "CALL", fn: fetch, args: [url] }. The middleware receives that,
//   performs it, and sends the result back INTO the generator via .next(result).
//
// Why a generator?
//   Because a generator can be PAUSED at a yield and RESUMED — or NOT resumed.
//   That is the whole feature. An async function cannot be stopped once
//   started; a generator can simply never be advanced again. Cancellation is
//   free, and it is why takeLatest exists.
//
// Runtime rule:
//   The generator is a state machine the middleware drives. gen.next(value)
//   resumes it with a value; gen.throw(error) throws INTO it, so try/catch
//   inside your saga catches network errors.
//
// Practical rule:
//   Saga is for complex ASYNC FLOWS. Debounce, poll, retry, race, cancel,
//   sequence. Not for "fetch this list".
//
// Common trap:
//   Using saga for CRUD. You have added a generator runtime and an effect
//   vocabulary to do what six lines of thunk — or zero lines of React Query —
//   would do.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE EFFECT CREATORS
// ══════════════════════════════════════════════════════════════════

// Every one of these just returns a PLAIN OBJECT. That is the trick.
const call = (fn, ...args) => ({ type: "CALL", fn, args });
const put = (action) => ({ type: "PUT", action });
const take = (pattern) => ({ type: "TAKE", pattern });
const select = (selector) => ({ type: "SELECT", selector });
const fork = (saga, ...args) => ({ type: "FORK", saga, args });
const cancel = (task) => ({ type: "CANCEL", task });
const delay = (ms) => ({ type: "CALL", fn: (m) => new Promise(r => setTimeout(r, m)), args: [ms] });

console.log("§3 — effect creators return plain objects:\n");
console.log("  call(fetch, '/api/user') →");
console.log("   ", JSON.stringify({ type: "CALL", fn: "[Function: fetch]", args: ["/api/user"] }));
console.log("\n  put({ type: 'user/ok' }) →");
console.log("   ", JSON.stringify(put({ type: "user/ok" })));
console.log("\n  Nothing was called. Nothing was dispatched. These are just");
console.log("  descriptions — data. The middleware reads them and acts.");
console.log("\n  That indirection is the ENTIRE design. Everything below is a");
console.log("  consequence of it.\n");


// ══════════════════════════════════════════════════════════════════
// § 4 — THE SAGA MIDDLEWARE (the runner)
// ══════════════════════════════════════════════════════════════════

function createSagaRunner(store) {
  const takers = [];          // sagas blocked on `take`
  const tasks = [];

  async function runSaga(saga, ...args) {
    const iterator = saga(...args);
    const task = { cancelled: false, done: false };
    tasks.push(task);
    await drive(iterator, undefined, task);
    task.done = true;
    return task;
  }

  async function drive(iterator, injected, task) {
    let result = iterator.next(injected);

    while (!result.done) {
      // ← THE CANCELLATION POINT. If the task was cancelled while we were
      //   awaiting, we simply stop advancing the generator. It is frozen at
      //   its yield, forever. No abort needed — we just never resume it.
      if (task.cancelled) return;

      const effect = result.value;
      let value;

      try {
        switch (effect.type) {
          case "CALL":
            value = await effect.fn(...effect.args);
            break;
          case "PUT":
            store.dispatch(effect.action);
            value = effect.action;
            break;
          case "SELECT":
            value = effect.selector(store.getState());
            break;
          case "TAKE":
            value = await new Promise(resolve => takers.push({ pattern: effect.pattern, resolve }));
            break;
          case "FORK":
            value = runSaga(effect.saga, ...effect.args);   // NON-blocking
            break;
          case "CANCEL":
            effect.task.cancelled = true;
            value = undefined;
            break;
          default:
            value = undefined;
        }
      } catch (error) {
        // gen.throw() throws INSIDE the generator — so try/catch in the saga
        // catches network errors as if they were synchronous.
        result = iterator.throw(error);
        continue;
      }

      if (task.cancelled) return;
      result = iterator.next(value);
    }
    return result.value;
  }

  function notifyTakers(action) {
    const matching = takers.filter(t => t.pattern === action.type);
    for (const t of matching) {
      takers.splice(takers.indexOf(t), 1);
      t.resolve(action);
    }
  }

  return { runSaga, notifyTakers };
}

// A minimal store:
function createStore(reducer) {
  let state = reducer(undefined, { type: "@@INIT" });
  const middleware = [];
  return {
    getState: () => state,
    dispatch: (action) => {
      state = reducer(state, action);
      middleware.forEach(m => m(action));
      return action;
    },
    use: (m) => middleware.push(m),
  };
}


// ══════════════════════════════════════════════════════════════════
// § 5 — A SAGA, RUNNING
// ══════════════════════════════════════════════════════════════════

console.log("§5 — a saga end to end:\n");

const initial = { status: "idle", data: null, error: null };
function reducer(state = initial, action) {
  switch (action.type) {
    case "user/pending": return { ...state, status: "loading" };
    case "user/ok": return { status: "succeeded", data: action.payload, error: null };
    case "user/fail": return { status: "failed", data: null, error: action.error };
    default: return state;
  }
}

function fetchUserApi(id) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (id === 0) reject(new Error("Not found"));
      else resolve({ id, name: "Vineet" });
    }, 10);
  });
}

// THE SAGA. Read it: it looks synchronous, and it does nothing.
function* fetchUserSaga(action) {
  try {
    yield put({ type: "user/pending" });
    const user = yield call(fetchUserApi, action.payload);   // ← DESCRIBES a call
    yield put({ type: "user/ok", payload: user });
  } catch (error) {
    yield put({ type: "user/fail", error: error.message });  // ← gen.throw lands here
  }
}

async function demoRun() {
  const store = createStore(reducer);
  const saga = createSagaRunner(store);
  store.use(saga.notifyTakers);

  await saga.runSaga(fetchUserSaga, { payload: 1 });
  console.log("  fetchUserSaga({ payload: 1 }) →", JSON.stringify(store.getState()));

  const store2 = createStore(reducer);
  const saga2 = createSagaRunner(store2);
  await saga2.runSaga(fetchUserSaga, { payload: 0 });
  console.log("  fetchUserSaga({ payload: 0 }) →", JSON.stringify(store2.getState()));

  console.log("\n  Note the try/catch. `fetchUserApi` REJECTED, and the catch");
  console.log("  inside the generator caught it — because the middleware calls");
  console.log("  iterator.throw(error), which throws AT the yield. Async errors");
  console.log("  become synchronous-looking. That is a genuinely nice property.\n");

  await demoTesting();
}


// ══════════════════════════════════════════════════════════════════
// § 6 — THE TESTING SUPERPOWER
// ══════════════════════════════════════════════════════════════════

async function demoTesting() {
  console.log("§6 — testing a saga with ZERO mocks:\n");

  // Drive the generator BY HAND. No middleware, no store, no fetch, no mocks.
  const gen = fetchUserSaga({ payload: 1 });

  const step1 = gen.next().value;
  console.log("  gen.next().value →", JSON.stringify(step1));
  console.log("    ✅ assert it is put({ type: 'user/pending' })");

  const step2 = gen.next().value;
  console.log("\n  gen.next().value →",
    JSON.stringify({ type: step2.type, fn: step2.fn.name, args: step2.args }));
  console.log("    ✅ assert it is call(fetchUserApi, 1)");
  console.log("    ...and fetchUserApi was NEVER CALLED. It is just in an object.");

  // Inject a fake result — no mocking library needed:
  const step3 = gen.next({ id: 1, name: "FAKE" }).value;
  console.log("\n  gen.next({ id: 1, name: 'FAKE' }).value →");
  console.log("   ", JSON.stringify(step3));
  console.log("    ✅ assert it puts the value we injected");

  console.log("\n  Read what just happened: we tested the ENTIRE async flow —");
  console.log("  including the network call and the dispatch — with no fetch");
  console.log("  mock, no store, no jest.mock, and no async. The test is");
  console.log("  synchronous and deterministic.");

  // The error path is equally trivial:
  const errGen = fetchUserSaga({ payload: 1 });
  errGen.next();                              // put(pending)
  errGen.next();                              // call(api)
  const errStep = errGen.throw(new Error("Network down")).value;
  console.log("\n  and the ERROR path — gen.throw(new Error('Network down')):");
  console.log("   ", JSON.stringify(errStep));
  console.log("    ✅ one line to test a failure. No mock rejection, no async.");

  console.log("\n  THIS is saga's real argument, and it is stronger than the");
  console.log("  async story. Compare a thunk test: mock fetch, mock dispatch,");
  console.log("  await the thunk, assert on the mock's calls. Saga tests are");
  console.log("  assertions on plain objects.\n");

  await demoCancellation();
}


// ══════════════════════════════════════════════════════════════════
// § 7 — takeLatest: THE THING THUNKS CANNOT DO
// ══════════════════════════════════════════════════════════════════

async function demoCancellation() {
  console.log("§7 — cancellation: takeLatest vs a thunk:\n");

  const landed = [];

  function slowApi(id, ms) {
    return new Promise(r => setTimeout(() => r({ id }), ms));
  }

  // ── THUNK: no cancellation. Whoever lands last wins. ───────────
  async function thunkVersion() {
    landed.length = 0;
    const run = async (id, ms) => {
      const user = await slowApi(id, ms);
      landed.push(user.id);                   // no way to say "I'm obsolete"
    };
    run(1, 30);                               // user clicks user 1 (SLOW)
    run(2, 10);                               // then user 2 (fast)
    await new Promise(r => setTimeout(r, 60));
    return [...landed];
  }

  // ── SAGA takeLatest: the previous task is CANCELLED. ───────────
  async function sagaVersion() {
    landed.length = 0;
    const store = createStore(reducer);
    const runner = createSagaRunner(store);

    function* worker(id, ms) {
      const user = yield call(slowApi, id, ms);
      landed.push(user.id);                   // ← never reached if cancelled
    }

    // takeLatest, in essence: keep a handle on the last task and cancel it.
    let lastTask = null;
    const takeLatest = async (id, ms) => {
      if (lastTask) lastTask.cancelled = true;      // ← CANCEL the previous
      const task = { cancelled: false };
      lastTask = task;
      const iterator = worker(id, ms);
      let result = iterator.next();
      while (!result.done) {
        const effect = result.value;
        const value = await effect.fn(...effect.args);
        if (task.cancelled) return;                 // ← never resume it
        result = iterator.next(value);
      }
    };

    takeLatest(1, 30);
    await new Promise(r => setTimeout(r, 5));
    takeLatest(2, 10);
    await new Promise(r => setTimeout(r, 60));
    return [...landed];
  }

  const thunkResult = await thunkVersion();
  const sagaResult = await sagaVersion();

  console.log("  user clicks user 1 (30ms), then user 2 (10ms):\n");
  console.log("    thunk            → landed:", JSON.stringify(thunkResult),
    "🐛 user 1 landed LAST and won");
  console.log("    saga takeLatest  → landed:", JSON.stringify(sagaResult),
    "✅ only user 2");

  console.log("\n  HOW: the worker for user 1 is paused at its `yield call(...)`.");
  console.log("  When user 2 arrives, takeLatest marks task 1 cancelled — and");
  console.log("  the runner simply NEVER CALLS iterator.next() again. The");
  console.log("  generator is frozen at that yield forever, so `landed.push(1)`");
  console.log("  is never reached.");
  console.log("\n  That is why generators. You cannot do this with an async");
  console.log("  function — once it starts, every line after the await WILL run.");
  console.log("  A generator only advances when someone advances it, and");
  console.log("  cancellation is just... not advancing it.");
  console.log("\n  takeLatest is 4 lines in saga. It is the single most common");
  console.log("  reason people choose saga over thunk.\n");

  await demoVocabulary();
}


// ══════════════════════════════════════════════════════════════════
// § 8 — THE EFFECT VOCABULARY
// ══════════════════════════════════════════════════════════════════

async function demoVocabulary() {
  console.log("§8 — the vocabulary:\n");

  const vocab = [
    ["call(fn, ...args)", "call a function, BLOCK until it resolves"],
    ["put(action)", "dispatch an action to the store"],
    ["take(pattern)", "BLOCK until an action of this type is dispatched"],
    ["select(selector)", "read from the store's state"],
    ["fork(saga)", "start a saga WITHOUT blocking (a background task)"],
    ["cancel(task)", "stop a forked task"],
    ["all([...])", "run in parallel — like Promise.all"],
    ["race({...})", "first one wins, the rest are CANCELLED"],
    ["takeEvery(p, saga)", "run a saga on EVERY matching action"],
    ["takeLatest(p, saga)", "run it, cancelling any previous run"],
    ["takeLeading(p, saga)", "run it, IGNORING new ones while it runs"],
    ["debounce(ms, p, saga)", "wait for silence, then run"],
  ];

  for (const [effect, meaning] of vocab) {
    console.log(`    ${effect.padEnd(22)} ${meaning}`);
  }

  console.log("\n  Read takeLatest / takeLeading / debounce again. Those are");
  console.log("  DECLARATIVE concurrency policies. In a thunk each one is");
  console.log("  hand-rolled bookkeeping — a ref, a request id, a timer, a flag.");
  console.log("  In saga it is one word.");
  console.log("\n  The canonical example:");
  console.log("");
  console.log("    function* watchSearch() {");
  console.log("      yield debounce(300, 'search/typed', function* (action) {");
  console.log("        const results = yield call(api.search, action.payload);");
  console.log("        yield put({ type: 'search/results', payload: results });");
  console.log("      });");
  console.log("    }");
  console.log("");
  console.log("  Debounced, cancellable, testable search — in six lines. THAT");
  console.log("  is what saga is for. Not `fetch this list`.\n");

  await demoVerdict();
}


// ══════════════════════════════════════════════════════════════════
// § 9 — THE HONEST VERDICT
// ══════════════════════════════════════════════════════════════════

async function demoVerdict() {
  console.log("§9 — why saga lost, honestly:\n");

  const comparison = [
    ["learning curve", "generators + ~15 effects", "one typeof check"],
    ["bundle size", "~14kB", "~200 bytes"],
    ["testing", "assert on objects — excellent", "mock fetch + dispatch"],
    ["cancellation", "takeLatest, built in", "none (raw thunk)"],
    ["debounce/poll/retry", "one word each", "hand-rolled"],
    ["reading a simple flow", "indirection", "it just reads"],
    ["TypeScript", "poor — yield types are `any`", "good"],
  ];

  console.log("  aspect               | saga                     | thunk");
  console.log("  ---------------------|--------------------------|------------------");
  for (const [aspect, saga, thunk] of comparison) {
    console.log(`  ${aspect.padEnd(20)} | ${saga.padEnd(24)} | ${thunk}`);
  }

  console.log("\n  The TypeScript row is the quiet killer. `const user = yield");
  console.log("  call(api, id)` types `user` as `any`, because TS cannot infer");
  console.log("  what the middleware will send back into the generator. There");
  console.log("  are workarounds (typed-redux-saga), and they are workarounds.");
  console.log("  In a TS codebase in 2026, that alone decides it for most teams.");

  console.log("\n  But the real reason saga faded is bigger than saga:");
  console.log("    Most sagas were fetching server data. React Query and RTK");
  console.log("    Query took that job entirely — with caching, dedup, and");
  console.log("    revalidation that no saga had. The problem saga solved");
  console.log("    best mostly LEFT Redux.");

  console.log("\n  When saga is still RIGHT:");
  console.log("    • genuinely complex orchestration — websockets, long-running");
  console.log("      background tasks, multi-step wizards with cancellation");
  console.log("    • racing several async flows and cancelling the losers");
  console.log("    • an existing codebase that already uses it (do NOT rewrite)");
  console.log("");
  console.log("  When it is WRONG:");
  console.log("    • CRUD, fetching lists, form submits — thunk or React Query");
  console.log("    • a new project, unless you KNOW you need the orchestration");
  console.log("");
  console.log("  The interview line: 'Saga is the best tool I would try hardest");
  console.log("  not to need. Its testing story is genuinely the best in Redux,");
  console.log("  but if my async is CRUD, that power buys me nothing and costs");
  console.log("  every new hire two weeks of generators.'\n");

  runAssertions(await (async () => {
    const t = await (async () => {
      const l = [];
      const slowApi = (id, ms) => new Promise(r => setTimeout(() => r({ id }), ms));
      const run = async (id, ms) => { const u = await slowApi(id, ms); l.push(u.id); };
      run(1, 30); run(2, 10);
      await new Promise(r => setTimeout(r, 60));
      return l;
    })();
    return t;
  })());
}


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The saga never runs:
//   You forgot to yield. `call(api)` without `yield` builds an object and
//   throws it away. Silent — the most common saga bug by far.
//
// Bug 2 — takeEvery where you meant takeLatest:
//   Every keystroke fires a request and they all land. The race is back.
//
// Bug 3 — An infinite loop:
//   A saga that puts an action it also takes. put → take → put → ...
//
// Bug 4 — `yield` returns `any` in TypeScript:
//   No type safety through the whole flow. → §9.
//
// Bug 5 — A forked saga leaks:
//   fork() is non-blocking and lives until cancelled. Forks in a loop with no
//   cancel = a growing pile of live tasks.
//
// Bug 6 — Testing the runner instead of the saga:
//   People write async saga tests with a real store — throwing away the exact
//   property that made saga worth using. → §6.
//
// Bug 7 — Saga for CRUD:
//   Not a bug, a cost. Every new hire pays it.
//
// Bug 8 — Cancellation without cleanup:
//   The generator freezes at its yield, but the fetch it started is still in
//   flight. Use finally + cancelled() for real teardown.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

function runAssertions(thunkLanded) {
  function assert(condition, message) {
    if (!condition) {
      throw new Error("Assertion failed: " + message);
    }
  }

  // Effects are DATA:
  const effect = call(fetchUserApi, 1);
  assert(effect.type === "CALL", "call() returns a plain object...");
  assert(effect.fn === fetchUserApi, "...holding the function...");
  assert(JSON.stringify(effect.args) === "[1]", "...and its arguments");
  assert(typeof effect.then !== "function",
    "it is NOT a promise. Nothing has been called. That is the whole design.");

  assert(put({ type: "x" }).type === "PUT", "put() describes a dispatch");
  assert(put({ type: "x" }).action.type === "x", "...wrapping the action");

  // The testing superpower — the headline:
  const gen = fetchUserSaga({ payload: 1 });
  assert(JSON.stringify(gen.next().value) ===
    JSON.stringify({ type: "PUT", action: { type: "user/pending" } }),
    "step 1 is asserted with NO mocks, NO store, NO async");
  const callEffect = gen.next().value;
  assert(callEffect.type === "CALL" && callEffect.fn === fetchUserApi,
    "step 2 DESCRIBES the api call — the api was never invoked");
  const putEffect = gen.next({ id: 1, name: "FAKE" }).value;
  assert(putEffect.action.payload.name === "FAKE",
    "we injected a fake result by passing it to next() — no mocking library");

  // The error path:
  const errGen = fetchUserSaga({ payload: 1 });
  errGen.next(); errGen.next();
  const caught = errGen.throw(new Error("Network down")).value;
  assert(caught.action.type === "user/fail",
    "gen.throw() lands in the saga's catch — one line to test a failure");
  assert(caught.action.error === "Network down", "...with the message");

  // Cancellation — thunk cannot:
  assert(thunkLanded[thunkLanded.length - 1] === 1,
    "thunk: the SLOW first request landed LAST and won 🐛");
  assert(thunkLanded.length === 2, "...because both ran to completion");

  console.log("§11 — mini assertions passed for: Redux Saga");
  console.log("\n  The one that captures it: `typeof effect.then !== 'function'`.");
  console.log("  call() is not a promise. Nothing ran. That single fact gives");
  console.log("  you both the testing story AND cancellation.");
}

demoRun();


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is Redux Saga?", answer like this:
//
//   "Middleware that runs generators, where you yield plain objects describing
//    side effects instead of performing them. `yield call(api.fetchUser, id)`
//    doesn't call anything — it returns { type: 'CALL', fn, args }. The
//    middleware receives that object, does the work, and sends the result back
//    into the generator with .next(result).
//
//    Two things fall out of that indirection, and they're the whole value.
//
//    First, testing — and this is genuinely the best testing story in Redux.
//    You drive the generator by hand: gen.next() gives you the yielded object
//    and you assert on it. No mocking fetch, no mocking dispatch, no async
//    test. You inject a fake result by passing it to next(). And the error
//    path is gen.throw(new Error()) — one line, because the middleware uses
//    iterator.throw, so async errors land in a normal try/catch inside your
//    saga.
//
//    Second, cancellation. A generator pauses at a yield and only advances if
//    someone advances it. So takeLatest cancels the previous run by simply
//    never calling next() again — the generator freezes at that yield forever.
//    You can't do that with an async function; once it starts, every line
//    after the await runs. That's why a thunk race condition is unfixable
//    without an AbortController, and takeLatest is one word.
//
//    Where it lost: generators plus fifteen effects is a real learning curve,
//    it's 14kB versus thunk's 200 bytes, and TypeScript can't infer yield
//    types — everything is `any`, which in a TS codebase decides it.
//
//    But the honest reason it faded is bigger. Most sagas were fetching server
//    data, and React Query took that job entirely. The problem saga solved best
//    left Redux. It's still right for genuine orchestration — websockets,
//    racing flows, cancellable wizards. I'd say: saga is the best tool I'd try
//    hardest not to need."
//
// "yield a description, not a promise" plus the honest verdict is senior.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does yield call(fn, args) do?
// Q1. Nothing. It returns a plain object describing the call. The middleware
//     performs it and resumes the generator with the result.
//
// Q2. Why generators and not async/await?
// A2. A generator can be paused and never resumed — that IS cancellation. An
//     async function always runs to completion once started.
//
// Q3. Why are sagas easy to test?
// A3. You assert on the yielded objects. No mocks, no store, no async. Inject
//     results with next(value), errors with throw(error).
//
// Q4. How does takeLatest work?
// A4. It keeps a handle on the running task and stops advancing its generator
//     when a new action arrives. The old one freezes at its yield.
//
// Q5. takeEvery vs takeLatest vs takeLeading?
// A5. Every: run all. Latest: cancel the previous. Leading: ignore new ones
//     while one is running.
//
// Q6. What is fork?
// A6. Start a saga without blocking — a background task you can cancel later.
//
// Q7. Saga or thunk?
// A7. Thunk for simple async — smaller, simpler, RTK ships it. Saga for
//     cancellation and complex orchestration.
//
// Q8. Why did saga lose popularity?
// A8. TypeScript inference, the learning curve, and mostly that React Query
//     took over server data — the job sagas were usually doing.
//
// Q9. What is the most common saga bug?
// A9. Forgetting `yield`. The effect object is built and discarded. Silent.
//
// Q10. Does cancelling a saga cancel the network request?
// A10. No — the generator freezes, but the fetch is still in flight. Use
//      finally + cancelled() with an AbortController for real teardown.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is a saga effect?
//   Back : A plain object DESCRIBING a side effect. call() calls nothing.
//
// Flashcard 2:
//   Front: Why generators?
//   Back : They can be paused and never resumed. That is cancellation.
//
// Flashcard 3:
//   Front: Why are sagas testable?
//   Back : You assert on yielded objects. No mocks, no async.
//
// Flashcard 4:
//   Front: What is the most common trap?
//   Back : Forgetting `yield`. Silent no-op.
//
// Flashcard 5:
//   Front: What can saga do that thunk cannot?
//   Back : Cancel. takeLatest, in one word.
//
// Flashcard 6:
//   Front: Why did it lose?
//   Back : TS inference, the curve, and React Query took server data.
//
// Flashcard 7:
//   Front: How do you sound senior?
//   Back : "The best tool I'd try hardest not to need."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the effect creators from memory. They are one-liners returning
//   objects — that is the point.
//
// Task 2:
//   Test fetchUserSaga fully by hand: success and failure. Notice you never
//   import the api.
//
// Task 3:
//   Implement takeEvery and takeLeading in the mini runner. The difference is
//   three lines and a flag.
//
// Task 4:
//   Add `race`: run two effects, resolve the first, cancel the loser. That is
//   the effect thunks make genuinely painful.
//
// Task 5:
//   Break it: remove a `yield` from fetchUserSaga. Watch it silently skip a
//   step. Now you know the #1 saga bug.
//
// Task 6:
//   Explain in 60 seconds why a generator can be cancelled and an async
//   function cannot.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   You yield a DESCRIPTION, not a promise. Testing and cancellation both
//   fall out of that.
//
// If you remember the common bug:
//   Forgetting `yield` — the effect is built and discarded, silently. And
//   takeEvery where you meant takeLatest brings the race back.
//
// If you remember the professional framing:
//   Best-in-class testing, real cancellation, poor TS. It lost because React
//   Query took the job most sagas were doing.
//
// NEXT TOPIC -> 08_zustand-basics.js
