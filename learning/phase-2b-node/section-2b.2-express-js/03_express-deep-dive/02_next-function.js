// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  02_next-function.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: next() function
//
// WHAT YOU WILL MASTER HERE:
//   1. The fact that fixes half of all Express confusion: next() is a
//      FUNCTION CALL, not a return — the code after it still runs, and it
//      runs AFTER the entire rest of the app finished
//   2. The onion order proved with a single log array:
//      A-before → B-before → route → B-after → A-after
//   3. All three call forms — next(), next(err), next('route') — each with
//      a counter proving exactly which layers got skipped
//   4. next(err) jumping the queue: 3 normal layers skipped, error layer
//      reached, proven by hit counters
//   5. ERR_HTTP_HEADERS_SENT reproduced end to end: a guard that sends 401
//      without `return` — the client sees a clean 401 while the protected
//      handler still runs its side effect, and a literal double next()
//      proven to advance the cursor twice rather than repeat a layer
//   6. The async trap Express 4 never solved: an async middleware that
//      rejects is NOT caught by the dispatcher — the request hangs and you
//      get an unhandled rejection instead of a 500
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/02_next-function.js"
//
// Prerequisites: 01_middleware-concept-and-chain.js — specifically §3 (the
// app is an array plus a cursor) and §5 (a middleware that never calls
// next() hangs the request). This file opens up the cursor-advancing
// function itself.
//
// 01 proved THAT the chain is walked in order. It used exactly one form of
// next() and never asked what else that argument slot can hold. This file
// answers that, and produces the error value that 03 knows what to do with.


const http = require("http");

const results = {};

// An async middleware that rejects is not caught by Express 4's dispatcher
// (§8 proves it). Without this listener, Node would kill the process on the
// unhandled rejection — which is itself the point of §8, so we record it
// instead of dying.
const unhandled = [];
process.on("unhandledRejection", (err) => unhandled.push(err && err.message));


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// next():
// the callback Express hands to every layer that advances the cursor to the
// next matching layer in the stack — synchronously, as a normal function
// call — and whose single argument selects between three completely
// different behaviours: nothing (continue), an Error (jump to the error
// layers), or the string 'route' (skip the rest of this route).
//
// If interviewer says "explain it simply", say:
//   "next() means 'run the rest of the app now'. It is not `return`. When I
//    call it, the whole remainder of the middleware chain — including the
//    route handler and the response — runs to completion, and only then
//    does the line after my next() execute. That's why a logger can time a
//    request by putting code on both sides of next()."
//
// If interviewer says "what can you pass to it?", say:
//   "Three things. next() with no argument continues normally. next(err) —
//    anything truthy that isn't the literal string 'route' — abandons the
//    normal chain and jumps straight to the error-handling middleware.
//    next('route') is the odd one: it skips the remaining handlers of the
//    CURRENT route and resumes matching at the next route."
//
// Why it matters in interviews:
//   "next() is not a return" explains the two most common Express bugs at
//   once — code running after the response was already sent, and a layer
//   being reached after something else answered. Both are proven live below,
//   and both trace back to a single missing `return`.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   next() IS A CALL, NOT A RETURN. IT UNWINDS LIKE AN ONION.
//
// Runtime rule:
//   next() invokes the dispatcher's cursor-advance function on the CURRENT
//   call stack. Everything downstream runs inside that call. When it
//   returns, your middleware resumes on the line after next() — with the
//   response usually already sent.
//
// Practical rule:
//   Write `return next()` by default. The `return` costs nothing when you
//   meant to continue, and it eliminates the entire class of "fell through
//   into a second next() / a second res.send()" bugs (§7).
//
// Common trap:
//   Treating `next()` as "exit this function". It is not. Code after it
//   runs, and if that code touches res, you get
//   "Cannot set headers after they are sent to the client."
//
// The mental picture — the onion:
//
//   A  ──▶ before                                      after ◀── A
//            │                                           │
//   B  ──────▶ before                          after ◀────┘
//                │                               │
//   route ───────▶ res.end()  ─────────────────▶ ┘
//
//   Down the left side is the request. Up the right side is your code
//   resuming after next() returned. Express has no "after response" hook
//   because the right-hand side of the onion IS that hook.


// ══════════════════════════════════════════════════════════════════
// § 3 — THE DISPATCHER, NOW WITH ALL THREE next() FORMS
// ══════════════════════════════════════════════════════════════════
//
// This is 01 §3's miniExpress with three additions: layers can hold
// MULTIPLE handlers (so next('route') has something to skip), a layer whose
// handler takes 4 arguments is treated as an error layer, and next(err)
// routes to those. The arity rule gets its own file — 03 — this one only
// needs it to exist so next(err) has a destination.

function miniExpress() {
  const stack = [];

  function pathMatches(layer, urlPath) {
    if (layer.method) return layer.path === urlPath;
    if (layer.path === "/") return true;
    return urlPath === layer.path || urlPath.startsWith(layer.path + "/");
  }

  const app = {
    stack,
    use(path, ...fns) {
      if (typeof path === "function") { fns.unshift(path); path = "/"; }
      for (const fn of fns) stack.push({ method: null, path, handlers: [fn] });
      return app;
    },
    get(path, ...fns)  { stack.push({ method: "GET",  path, handlers: fns }); return app; },
    post(path, ...fns) { stack.push({ method: "POST", path, handlers: fns }); return app; },

    handle(req, res) {
      const urlPath = req.url.split("?")[0];
      let i = 0;

      function next(err) {
        const layer = stack[i++];

        if (!layer) {                                   // walked off the end
          if (res.writableEnded) return;                // someone already answered (§7)
          if (err) {                                    // …carrying an error
            res.statusCode = err.status || 500;
            return res.end("DEFAULT-HANDLER: " + err.message);
          }
          res.statusCode = 404;
          return res.end("Cannot " + req.method + " " + urlPath);
        }

        const isErrorLayer = layer.handlers.length === 1 && layer.handlers[0].length === 4;

        // The two skip rules that make next(err) "jump the queue":
        if (err && !isErrorLayer) return next(err);     // in error mode: skip normal layers
        if (!err && isErrorLayer) return next();        // in normal mode: skip error layers

        if (layer.method && layer.method !== req.method) return next(err);
        if (!pathMatches(layer, urlPath)) return next(err);

        if (err) {
          try { return layer.handlers[0](err, req, res, next); }
          catch (thrown) { return next(thrown); }
        }

        // A route can hold several handlers. They get their OWN cursor, and
        // next('route') abandons that inner cursor for the outer one.
        let j = 0;
        function nextInLayer(arg) {
          if (arg === "route") return next();           // skip the rest of THIS route
          if (arg) return next(arg);                    // an error escapes the route entirely
          const fn = layer.handlers[j++];
          if (!fn) return next();                       // route exhausted → outer chain
          try { fn(req, res, nextInLayer); }
          catch (thrown) { next(thrown); }              // SYNC throws are caught (§8: async are not)
        }
        nextInLayer();
      }

      next();
    },
  };

  return app;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => app.handle(req, res));
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function request(port, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path, method: opts.method || "GET", headers: opts.headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on("error", reject);
    if (opts.timeoutMs) req.setTimeout(opts.timeoutMs, () => req.destroy(new Error("CLIENT_TIMEOUT")));
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


// ══════════════════════════════════════════════════════════════════
// § 4 — next() IS A CALL, NOT A RETURN: THE ONION
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — the onion: code after next() runs LAST ══\n");

  const log = [];
  const app = miniExpress();

  app.use((req, res, next) => {
    log.push("A-before");
    next();
    log.push("A-after   (response already sent? " + res.writableEnded + ")");
  });
  app.use((req, res, next) => {
    log.push("B-before");
    next();
    log.push("B-after");
  });
  app.get("/x", (req, res) => {
    log.push("route: res.end()");
    res.end("done");
  });

  const { server, port } = await listen(app);
  await request(port, "/x");
  server.close();

  results.onion = log.slice();
  results.onionEndedBeforeAAfter = log.some((l) => l.startsWith("A-after") && l.includes("true"));

  log.forEach((l, n) => console.log("   " + (n + 1) + ". " + l));
  console.log("\n  Read that shape carefully: 'A-after' is the LAST line, and by then");
  console.log("  the response is already finished. next() didn't return control to A");
  console.log("  until the whole rest of the app had run. This is a plain synchronous");
  console.log("  call stack — which is exactly why a timing middleware works:");
  console.log("    const t = Date.now(); next(); console.log(Date.now() - t);");
  console.log("  …and exactly why touching res after next() throws (§7).");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — next(err): JUMPING THE QUEUE
// ══════════════════════════════════════════════════════════════════
//
// Passing anything truthy (other than 'route') switches the dispatcher into
// error mode: every remaining NORMAL layer is skipped, no matter how many,
// until a layer that takes four arguments is found.

async function section5() {
  console.log("\n══ § 5 — next(err) skips every normal layer that remains ══\n");

  const hits = { m2: 0, m3: 0, route: 0, errorLayer: 0 };
  const app = miniExpress();

  app.use((req, res, next) => {
    if (req.url === "/boom") {
      const err = new Error("validation failed");
      err.status = 422;
      return next(err);              // ← the jump
    }
    next();
  });
  app.use((req, res, next) => { hits.m2++; next(); });
  app.use((req, res, next) => { hits.m3++; next(); });
  app.get("/boom", (req, res) => { hits.route++; res.end("never"); });
  app.get("/ok",   (req, res) => { hits.route++; res.end("ok"); });
  app.use((err, req, res, next) => {                     // 4 args ⇒ error layer
    hits.errorLayer++;
    res.statusCode = err.status || 500;
    res.end("handled: " + err.message);
  });

  const { server, port } = await listen(app);
  const ok   = await request(port, "/ok");
  const okHits = { ...hits };
  const boom = await request(port, "/boom");
  server.close();

  results.errModeSkipped = { m2: hits.m2 - okHits.m2, m3: hits.m3 - okHits.m3, route: hits.route - okHits.route };
  results.errModeHandled = hits.errorLayer;
  results.errStatus = boom.status;
  results.errBody = boom.body;
  results.okStatus = ok.status;

  console.log("  GET /ok    →", ok.status, JSON.stringify(ok.body), "  (normal walk: m2, m3, route all ran)");
  console.log("  GET /boom  →", boom.status, JSON.stringify(boom.body));
  console.log("\n  layers that ran during the /boom request:");
  console.log("    m2 (normal)     :", results.errModeSkipped.m2, " ← skipped");
  console.log("    m3 (normal)     :", results.errModeSkipped.m3, " ← skipped");
  console.log("    route (normal)  :", results.errModeSkipped.route, " ← skipped");
  console.log("    error layer     :", results.errModeHandled, " ← reached");
  console.log("\n  next(err) is not 'throw'. It is 'switch the walk into error mode',");
  console.log("  and error mode has a different matching rule (→ 03 §3).");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — next('route'): THE THIRD FORM NOBODY EXPECTS
// ══════════════════════════════════════════════════════════════════
//
// A route can have several handlers: app.get('/x', a, b, c). next('route')
// inside `a` abandons b and c and resumes matching at the NEXT route — the
// clean way to say "this route doesn't apply after all, keep looking."

async function section6() {
  console.log("\n══ § 6 — next('route') skips the rest of THIS route ══\n");

  const hits = { guard: 0, expensive: 0, firstFinal: 0, fallback: 0 };
  const app = miniExpress();

  app.get("/user/premium",
    (req, res, next) => {                     // handler 1: the guard
      hits.guard++;
      if (req.headers["x-plan"] !== "premium") return next("route");   // ← skip 2 and 3
      next();
    },
    (req, res, next) => { hits.expensive++; next(); },                 // handler 2
    (req, res)       => { hits.firstFinal++; res.end("PREMIUM CONTENT"); }
  );

  app.get("/user/premium", (req, res) => {    // the NEXT matching route
    hits.fallback++;
    res.statusCode = 402;
    res.end("upgrade required");
  });

  const { server, port } = await listen(app);
  const free    = await request(port, "/user/premium");
  const freeHits = { ...hits };
  const premium = await request(port, "/user/premium", { headers: { "x-plan": "premium" } });
  server.close();

  results.routeSkipFree = { ...freeHits };
  results.routeSkipPremium = {
    expensive: hits.expensive - freeHits.expensive,
    firstFinal: hits.firstFinal - freeHits.firstFinal,
  };
  results.freeStatus = free.status;
  results.freeBody = free.body;
  results.premiumBody = premium.body;

  console.log("  free user     →", free.status, JSON.stringify(free.body));
  console.log("    guard ran:", freeHits.guard, " handler2 ran:", freeHits.expensive,
              " handler3 ran:", freeHits.firstFinal, " fallback route ran:", freeHits.fallback);
  console.log("  premium user  →", premium.status, JSON.stringify(premium.body));
  console.log("    handler2 ran:", results.routeSkipPremium.expensive,
              " handler3 ran:", results.routeSkipPremium.firstFinal);
  console.log("\n  Contrast the two exits carefully:");
  console.log("    next('route') → skip the REST of this route, keep matching   (§6)");
  console.log("    next(err)     → skip everything normal, go to error layers   (§5)");
  console.log("    next()        → the very next handler, inside or outside     (§4)");
  console.log("\n  Trap: next('route') only exists inside a ROUTE (app.get/post with");
  console.log("  multiple handlers). Inside a plain app.use() there is no route to");
  console.log("  skip — real Express treats it as an ordinary continue.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — ANSWERING *AND* CONTINUING: THE FAMOUS ERROR MESSAGE
// ══════════════════════════════════════════════════════════════════
//
// "Cannot set headers after they are sent to the client" almost never means
// what people think it means. It means: something already answered this
// request, the walk carried on anyway, and a later layer tried to answer it
// a second time.
//
// The shape below is by far the most common way that happens — a guard that
// sends a 401 and then forgets to `return`.

async function section7() {
  console.log("\n══ § 7 — a missing `return` in front of a response ══\n");

  let dbWrites = 0;                 // stands in for any real side effect
  let caughtCode = null;

  const app = miniExpress();

  app.use((req, res, next) => {
    if (req.headers["x-token"] !== "good") {
      res.statusCode = 401;
      res.end("unauthorized");      // 🐛 no `return` — the guard "worked"…
    }
    next();                         // …and then handed control on anyway
  });

  app.get("/secret", (req, res) => {
    dbWrites++;                     // the protected work RUNS
    try {
      res.setHeader("x-run", "1");
      res.end("SECRET");
    } catch (e) {
      caughtCode = e.code;          // …and only then explodes
    }
  });

  const { server, port } = await listen(app);
  const r = await request(port, "/secret");        // deliberately no token
  server.close();

  results.guardStatus = r.status;
  results.guardBody = r.body;
  results.guardSideEffects = dbWrites;
  results.guardErrorCode = caughtCode;

  console.log("  client saw            :", r.status, JSON.stringify(r.body), " ← looks perfectly secure");
  console.log("  protected handler ran :", dbWrites, "time(s) 🐛");
  console.log("  and died with         :", caughtCode);
  console.log("\n  Read that again. The 401 reached the client, so the test passes and");
  console.log("  the access log looks right — and the protected handler still executed");
  console.log("  its side effect. A DB write, a charge, an email, performed by a request");
  console.log("  that was supposedly rejected. The response body is never evidence that");
  console.log("  the code below it did not run.");
  console.log("\n  ✅ The fix is one keyword:  return res.end('unauthorized');");
}


// ── § 7b — and the misconception about a literal double next() ─────
//
// People assume next() called twice "runs the layer again". It does not.
// The cursor lives in one closure and is SHARED, so a second next() simply
// advances it again — meaning layers positioned after the responding one
// get executed after the response has already been sent.

async function section7b() {
  console.log("\n══ § 7b — next() twice advances the cursor twice ══\n");

  const ran = [];
  const app = miniExpress();

  app.use((req, res, next) => { ran.push("m0"); next(); next(); });   // 🐛 twice
  app.use((req, res, next) => { ran.push("m1"); next(); });
  app.get("/x", (req, res) => { ran.push("route"); res.end("ok"); });
  app.use((req, res, next) => { ran.push("m3-after-response"); next(); });

  const { server, port } = await listen(app);
  const r = await request(port, "/x");
  server.close();

  results.doubleNextRan = ran.slice();
  results.doubleNextBody = r.body;
  results.postResponseLayerRan = ran.includes("m3-after-response");
  results.routeRanTwice = ran.filter((x) => x === "route").length > 1;

  console.log("  execution order:", ran.join(" → "));
  console.log("  client body    :", JSON.stringify(r.body));
  console.log("\n  Note what did NOT happen: 'route' appears once. The second next()");
  console.log("  did not rewind — it advanced PAST the route into m3, which ran with");
  console.log("  the response already finished. Anything m3 tried to write would throw,");
  console.log("  and any work m3 does is work on a request nobody is waiting for.");
  console.log("\n  ✅ Same fix, same keyword: `return next()` everywhere.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — THE ASYNC TRAP: A REJECTED PROMISE IS NOT AN ERROR next()
// ══════════════════════════════════════════════════════════════════
//
// The dispatcher wraps each handler call in try/catch (see §3). try/catch
// catches SYNCHRONOUS throws only. An async handler returns a promise
// immediately — the throw happens later, on a different tick, with nobody
// listening. Express 4 behaves exactly like this mini version: the request
// hangs and you get an unhandled rejection. (Express 5 changed this and
// forwards rejections to next(err) automatically.)

async function section8() {
  console.log("\n══ § 8 — sync throw is caught; async rejection is not ══\n");

  const app = miniExpress();

  app.get("/sync-throw", (req, res) => {
    throw new Error("sync boom");                 // ✅ caught by the dispatcher
  });

  app.get("/async-throw", async (req, res) => {
    await sleep(5);
    throw new Error("async boom");                // 🐛 nobody catches this
  });

  app.get("/async-fixed", async (req, res, next) => {
    try {
      await sleep(5);
      throw new Error("async boom, handled");
    } catch (err) {
      next(err);                                  // ✅ the manual bridge
    }
  });

  app.use((err, req, res, next) => {
    res.statusCode = 500;
    res.end("error layer: " + err.message);
  });

  const { server, port } = await listen(app);

  const sync = await request(port, "/sync-throw");
  results.syncThrowStatus = sync.status;
  results.syncThrowBody = sync.body;

  let asyncHung = false;
  try {
    await request(port, "/async-throw", { timeoutMs: 300 });
  } catch (e) {
    asyncHung = e.message === "CLIENT_TIMEOUT" || e.code === "ECONNRESET";
  }
  await sleep(20);
  results.asyncThrowHung = asyncHung;
  results.unhandledSeen = unhandled.includes("async boom");

  const fixed = await request(port, "/async-fixed");
  results.asyncFixedStatus = fixed.status;
  results.asyncFixedBody = fixed.body;

  server.close();

  console.log("  GET /sync-throw   →", sync.status, JSON.stringify(sync.body), " ✅ caught");
  console.log("  GET /async-throw  →", asyncHung ? "NO RESPONSE — client timed out 🐛" : "responded?!");
  console.log("     unhandled rejection recorded:", JSON.stringify(unhandled), "🐛");
  console.log("  GET /async-fixed  →", fixed.status, JSON.stringify(fixed.body), " ✅ try/catch → next(err)");
  console.log("\n  This is THE Express 4 async gotcha. Three real fixes:");
  console.log("    1. try/catch in every async handler → next(err)   (shown above)");
  console.log("    2. an asyncHandler(fn) wrapper: fn(...a).catch(a[2])  ← do this");
  console.log("    3. Express 5, which forwards rejections for you");
  console.log("  Never rely on process.on('unhandledRejection') as the fix — by then");
  console.log("  you have already lost the req/res pair and the client is still waiting.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "Cannot set headers after they are sent to the client."
//   A layer answered the request and then called next() (or called next()
//   twice), so a later layer tried to answer it again. → §7, §7b
//
// Bug 2 — A rejected request that still charged the card.
//   The guard sent its 401 without `return`, the walk continued, and the
//   protected handler ran its side effect before throwing. The clean 401 in
//   the access log hides it completely. → §7
//
// Bug 3 — "My async route just hangs, no 500, no log."
//   A rejected promise in an Express 4 handler. try/catch in the dispatcher
//   never sees it. → §8
//
// Bug 4 — Code after next() touching res.
//   `next(); res.status(404).send('nope');` runs after the response is
//   finished. Looks like a fallback; is a crash. → §4
//
// Bug 5 — "if (bad) next(err)" without `return`, then continuing to run
//   the happy path in the same function — now BOTH the error layer and the
//   route respond. → §5 + §7
//
// Bug 6 — Using next('route') inside app.use() and expecting a skip.
//   There is no route to skip; it behaves as a plain continue. → §6
//
// Bug 7 — Passing a falsy value: next(null), next(undefined), next(0),
//   next('') all mean "continue normally" — an error you carefully built
//   and then passed as `next(err.message)` when err.message was '' will be
//   silently swallowed.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — the onion:
  assert.equal(results.onion[0], "A-before");
  assert.equal(results.onion[1], "B-before");
  assert.equal(results.onion[2], "route: res.end()");
  assert.equal(results.onion[3], "B-after");
  assert.ok(results.onion[4].startsWith("A-after"),
    "code AFTER next() ran last, not second — next() is a call, not a return ✅");
  assert.equal(results.onionEndedBeforeAAfter, true,
    "…and by the time it ran, the response was already finished (res.writableEnded === true)");

  // § 5 — next(err):
  assert.deepEqual(results.errModeSkipped, { m2: 0, m3: 0, route: 0 },
    "next(err) skipped ALL three remaining normal layers ✅");
  assert.equal(results.errModeHandled, 1, "…and reached the 4-argument error layer exactly once");
  assert.equal(results.errStatus, 422, "the error layer used err.status for the response code");
  assert.equal(results.errBody, "handled: validation failed");
  assert.equal(results.okStatus, 200, "the non-error request walked the chain normally");

  // § 6 — next('route'):
  assert.equal(results.routeSkipFree.guard, 1, "the guard handler ran for the free user");
  assert.equal(results.routeSkipFree.expensive, 0,
    "next('route') skipped handler 2 of the SAME route ✅");
  assert.equal(results.routeSkipFree.firstFinal, 0, "…and handler 3 too");
  assert.equal(results.routeSkipFree.fallback, 1, "…and matching resumed at the NEXT route");
  assert.equal(results.freeStatus, 402);
  assert.equal(results.routeSkipPremium.expensive, 1,
    "a premium user called plain next() and DID reach handler 2");
  assert.equal(results.premiumBody, "PREMIUM CONTENT");

  // § 7 — answering and continuing anyway:
  assert.equal(results.guardStatus, 401, "the client got a clean 401 — the guard LOOKED like it worked");
  assert.equal(results.guardBody, "unauthorized");
  assert.equal(results.guardSideEffects, 1,
    "…yet the protected handler still ran its side effect, because the guard forgot `return` 🐛");
  assert.equal(results.guardErrorCode, "ERR_HTTP_HEADERS_SENT",
    "…and the second response attempt died with the famous headers-sent error");

  // § 7b — what a literal double next() actually does:
  assert.deepEqual(results.doubleNextRan, ["m0", "m1", "route", "m3-after-response"],
    "next() twice advanced the SHARED cursor twice — it did not repeat a layer ✅");
  assert.equal(results.routeRanTwice, false, "…so the route ran exactly once");
  assert.equal(results.postResponseLayerRan, true,
    "…but a layer after the route ran with the response already finished 🐛");
  assert.equal(results.doubleNextBody, "ok", "…while the client saw a completely normal 200");

  // § 8 — sync vs async:
  assert.equal(results.syncThrowStatus, 500, "a SYNCHRONOUS throw was caught and routed to the error layer ✅");
  assert.equal(results.syncThrowBody, "error layer: sync boom");
  assert.equal(results.asyncThrowHung, true,
    "an async handler that rejected produced NO response — the request hung 🐛");
  assert.equal(results.unhandledSeen, true,
    "…and surfaced as an unhandledRejection instead of a 500");
  assert.equal(results.asyncFixedStatus, 500,
    "the same async failure, wrapped in try/catch → next(err), became a proper 500 ✅");

  console.log("§10 — mini assertions passed for: next() function");
  console.log("\n  The pair that captures it: 'A-after' printing LAST proves next() is a");
  console.log("  call and not a return — and a request answered with 401 still running");
  console.log("  the protected handler's DB write proves what one missing `return` costs.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what does next() do?", answer:
//
//   "next() advances Express's cursor to the next matching layer. The first
//    thing I'd stress is that it's a function CALL, not a return — the
//    entire rest of the app runs inside that call, and then execution
//    resumes on the line after my next(). If I log before and after next()
//    in two stacked middlewares I get A-before, B-before, route, B-after,
//    A-after — an onion. That's why a timing middleware works with plain
//    code on both sides of next(), and it's also why any code after next()
//    that touches res will throw, because the response is already sent by
//    then.
//
//    Its argument selects one of three behaviours. next() continues.
//    next(err) — any truthy value that isn't the string 'route' — switches
//    the walk into error mode: every remaining normal layer is skipped, no
//    matter how many, until a four-argument error handler is found.
//    next('route') is the rare third form: inside a route with several
//    handlers, it abandons the remaining handlers of that route and resumes
//    matching at the next route — nice for a cheap guard in front of an
//    expensive handler.
//
//    The bug I look for in review is a response or a next() without a
//    `return`. I've reproduced the classic: a guard that does
//    res.status(401).end() and then falls through to next(). The client gets
//    a clean 401, every test passes — and the protected route handler still
//    executed its DB write before dying on ERR_HTTP_HEADERS_SENT. It's also
//    worth knowing a literal double next() doesn't repeat a layer; the
//    cursor is shared, so it advances PAST the route into whatever comes
//    next, which then runs against a finished response. Writing
//    `return next()` and `return res.send()` removes the whole class.
//
//    And on Express 4 specifically: the dispatcher's try/catch only catches
//    synchronous throws. An async handler that rejects gets you a hung
//    request and an unhandled rejection, not a 500 — so every async handler
//    needs a try/catch that calls next(err), or an asyncHandler wrapper.
//    Express 5 forwards rejections automatically."
//
// Leading with the onion and then producing the double-next reproduction is
// what separates "I've read the docs" from "I've debugged this at 2am."


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Is next() asynchronous?
// A1. No. It is a synchronous call on the current stack. The chain only
//     becomes async because your handlers are.
//
// Q2. Does code after next() run?
// A2. Yes — after everything downstream finished. Proven in §4.
//
// Q3. What are the three call forms?
// A3. next(), next(err), next('route').
//
// Q4. What does next(err) skip?
// A4. Every remaining non-error layer, regardless of path or method, until
//     a 4-argument handler is reached (§5).
//
// Q5. Difference between next(err) and throw?
// A5. A synchronous throw is caught by Express and converted into the same
//     error mode. An async throw is not (§8) — that's why next(err) exists
//     as an explicit call.
//
// Q6. What does next('route') skip?
// A6. Only the remaining handlers of the current route; matching resumes at
//     the next route (§6).
//
// Q7. What happens on next() called twice?
// A7. The shared cursor advances twice, so the layer AFTER the responder
//     runs against an already-finished response — not a repeat of the same
//     layer, which is the common misconception (§7b).
//
// Q8. How do you prevent that structurally?
// A8. `return next()` as a house rule, plus a lint rule for a bare next()
//     that isn't the last statement.
//
// Q9. Why doesn't Express 4 catch async errors?
// A9. Because the dispatcher calls handlers inside try/catch and never
//     inspects the return value. A returned promise's rejection is invisible
//     to try/catch. Express 5 checks for a thenable and attaches .catch(next).
//
// Q10. Write the asyncHandler wrapper.
// A10. const ah = (fn) => (req, res, next) =>
//        Promise.resolve(fn(req, res, next)).catch(next);
//      Then: app.get('/x', ah(async (req, res) => { … })).
//
// Q11. Is next(null) an error?
// A11. No — falsy means continue. next(0), next(''), next(false) all
//      continue normally, which is a silent way to lose an error.
//
// Q12. Can you call next() after the response was sent?
// A12. Mechanically yes, and the walk continues; it just ends in a
//      headers-sent throw as soon as anything tries to write. Never do it.
//
// Q13. How would you time a request correctly?
// A13. res.on('finish', …) rather than code after next(), because the
//      after-next() position is wrong for anything that ends the response
//      asynchronously — the walk can return before the write completes.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: next() — call or return?
//   Back : A CALL. Code after it runs last, response already sent.
//
// Flashcard 2:
//   Front: The onion order for A → B → route?
//   Back : A-before, B-before, route, B-after, A-after.
//
// Flashcard 3:
//   Front: The three forms?
//   Back : next() · next(err) · next('route').
//
// Flashcard 4:
//   Front: next(err) skips what?
//   Back : All remaining normal layers, until a 4-arg error handler.
//
// Flashcard 5:
//   Front: next('route') skips what?
//   Back : The remaining handlers of the CURRENT route only.
//
// Flashcard 6:
//   Front: res.end() without `return`, then next() → ?
//   Back : Client gets the response; the handler below still runs its side
//          effect, then throws ERR_HTTP_HEADERS_SENT. §7.
//
// Flashcard 7:
//   Front: Async handler rejects on Express 4 → ?
//   Back : Hung request + unhandled rejection. Not a 500. §8.
//
// Flashcard 8:
//   Front: The one-keyword habit that prevents a whole bug class?
//   Back : `return next()`.
//
// Flashcard 9:
//   Front: How do you sound senior?
//   Back : "next() is a call, not a return — I can make one request run the
//          route handler twice by deleting a single `return`."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add a timing middleware to §4's app using code on both sides of next().
//   Then make the route respond after a 50ms setTimeout and watch the
//   measurement become wrong. Fix it with res.on('finish').
//
// Task 2:
//   Implement asyncHandler(fn) and rewrite §8's /async-throw with it —
//   confirm you get the 500 without touching the handler's body.
//
// Task 3:
//   Add a guard to miniExpress's next() that throws "next() called multiple
//   times" if invoked twice for the same layer. Real Express ships this
//   guard; §7 shows why.
//
// Task 4:
//   Chain three guards on one route with next('route') and prove each one
//   can hand off to a different fallback route.
//
// Task 5:
//   Pass a non-Error to next(): next('some string'), next(404), next({}).
//   Which reach the error layer? What does err.message become? Decide a
//   house rule.
//
// Task 6:
//   Instrument next() to push the layer index into an array on every call,
//   then print the walk for a request that errors halfway. You have built a
//   request tracer.
//
// Task 7:
//   Add a second guard below §7's first one that also answers without
//   `return`. How many layers now run against a dead response? Fix both
//   with one keyword each and re-run.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   next() is a CALL, not a return. The rest of the app runs inside it, and
//   your code resumes afterwards with the response already sent.
//
// If you remember the common bug:
//   A missing `return` in front of a response — the client gets a correct
//   401 while the handler it was supposed to block still runs, ending in an
//   ERR_HTTP_HEADERS_SENT that nobody ever sees.
//
// If you remember the professional framing:
//   next() continues, next(err) switches to error mode, next('route') skips
//   the rest of one route — and on Express 4 every async handler needs
//   try/catch → next(err) or an asyncHandler wrapper.
//
// ─────────────────────────────────────────────────────────────────
// This file created the error value and pushed it into "error mode". It
// never explained the rule that decides WHICH function is an error handler,
// why that rule is fn.length === 4, or what happens when there isn't one.
//
// NEXT TOPIC -> 03_error-handling-middleware-4-args.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  await section7b();
  await section8();
  assertions();
})();
