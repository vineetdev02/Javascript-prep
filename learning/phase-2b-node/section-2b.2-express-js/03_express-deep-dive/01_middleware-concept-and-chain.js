// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  01_middleware-concept-and-chain.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Middleware concept & chain
//
// WHAT YOU WILL MASTER HERE:
//   1. The one fact everything else in Express follows from: an Express app
//      is NOT a router with hooks — it is an ORDERED ARRAY of functions,
//      walked one at a time
//   2. A working 40-line mini-Express, built from Node's raw http module,
//      that reproduces the real chain semantics — every later file in this
//      group extends it
//   3. Registration order IS the API: the SAME two functions, registered in
//      two different orders, produce 401 and 200 on the identical request
//   4. The #1 Express bug in production, reproduced live: a middleware that
//      forgets next() — the request hangs forever, no error, no timeout
//   5. Short-circuiting: a cache middleware that answers the request while
//      the route handler's call counter stays at exactly 0
//   6. Path-scoped middleware (app.use('/admin', …)) — prefix matching
//      proven with hit counters
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/01_middleware-concept-and-chain.js"
//
// Prerequisites: none beyond Node's http module. If you have not read
// section-2b.1-node-core/01_nodejs-internals/01_v8-engine-role.js and
// 12_streams-concept.js, you can still run this — but knowing that
// `res` is a Writable stream (2B.1) explains why res.end() is what actually
// finishes a request here.
//
// This is file 01 of ◆ Express Deep Dive, and it deliberately answers only
// HALF the question. It shows THAT the chain is walked in order — it does
// not yet explain the mechanics of the one function that does the walking.
// That function is next(), and it gets its own file: 02_next-function.js.


const http = require("http");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Middleware:
// a function with the signature (req, res, next) that sits in an ORDERED
// list, receives every request that matches its path, and decides one of
// exactly three things — end the response itself, pass control onward with
// next(), or (by accident) do neither and hang the request forever.
//
// If interviewer says "explain it simply", say:
//   "An Express app is a list of functions, in the order I registered them.
//    A request enters at the top of the list and walks down. Each function
//    can read the request, change it, answer it, or call next() to hand it
//    to the next function in the list. A 'route handler' isn't a special
//    kind of thing — it's just a middleware that happens to be matched to a
//    method and a path, and that usually ends the response instead of
//    calling next()."
//
// If interviewer says "why does that matter?", say:
//   "Because it makes registration order a load-bearing part of the API.
//    Auth registered after the route it protects doesn't protect it — the
//    route already sent the response. Same two functions, different order,
//    different security outcome. I can demonstrate that in about ten lines."
//
// Why it matters in interviews:
//   Almost every real Express bug — body parser 'not working', CORS headers
//   'missing', auth 'bypassed', error handler 'never firing' — is one bug
//   wearing four costumes: something was registered in the wrong position
//   in the list. If you understand the list, you have already debugged the
//   next four files in this group.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   AN EXPRESS APP IS AN ARRAY, NOT AN EVENT EMITTER.
//
// Runtime rule:
//   app.use() and app.get()/post()/… all push onto ONE array (Express calls
//   its entries "layers"). On each request Express walks that array from
//   index 0, skipping layers whose path or method doesn't match, and stops
//   walking the moment a layer neither ends the response nor calls next().
//   Nothing is parallel, nothing is a hook, nothing fires "on" an event.
//
// Practical rule:
//   Read any Express file top to bottom as the literal execution order for
//   a matching request. If a middleware appears below a route, it will
//   never run for that route. Cross-check: helmet, cors, express.json, and
//   session go ABOVE routes; the error handler goes BELOW everything
//   (→ 03_error-handling-middleware-4-args.js §4).
//
// Common trap:
//   Believing middleware is "registered globally so it always runs." It
//   runs only if the walker REACHES it. A route above it that ended the
//   response means the walk stopped — proven in §6 with a handler counter
//   that stays at 0.
//
// The mental picture:
//
//   request ──▶ [0] logger        next()
//               [1] express.json  next()
//               [2] auth          ── res.status(401).end()  ✗ walk STOPS
//               [3] GET /secret       (never reached)
//               [4] error handler     (never reached)
//
//   Move auth to index [3] and the walk reaches the route FIRST — the
//   secret is already sent before auth ever looks at the request. Same
//   functions. Different array. Different security posture.


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILD THE CHAIN: A 40-LINE MINI-EXPRESS
// ══════════════════════════════════════════════════════════════════
//
// Everything in this group is built on the object below. It is not a toy
// analogy — it is the actual shape of Express's dispatcher: an array of
// layers, a cursor, and a next() that advances the cursor.

function miniExpress() {
  const stack = [];

  function push(method, path, handler) {
    stack.push({ method, path, handler });
  }

  function pathMatches(layer, urlPath) {
    // Route layers (method set) match the path EXACTLY.
    if (layer.method) return layer.path === urlPath;
    // use() layers match the path AND everything under it — a prefix.
    if (layer.path === "/") return true;
    return urlPath === layer.path || urlPath.startsWith(layer.path + "/");
  }

  const app = {
    stack,

    use(path, handler) {
      if (typeof path === "function") { handler = path; path = "/"; }
      push(null, path, handler);
      return app;
    },

    get(path, handler) { push("GET", path, handler); return app; },
    post(path, handler) { push("POST", path, handler); return app; },

    // THE WHOLE DISPATCHER. This is the concept the file is about.
    handle(req, res) {
      const urlPath = req.url.split("?")[0];
      let i = 0;

      function next() {
        const layer = stack[i++];
        if (!layer) {                       // walked off the end of the array
          res.statusCode = 404;
          return res.end("Cannot " + req.method + " " + urlPath);
        }
        if (layer.method && layer.method !== req.method) return next();
        if (!pathMatches(layer, urlPath)) return next();
        layer.handler(req, res, next);      // ← control handed over; we STOP
      }

      next();
    },
  };

  return app;
}

// Two tiny helpers so every proof below is a REAL HTTP request over a real
// socket to a real server — no faked req/res objects anywhere in this file.

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => app.handle(req, res));
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
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
    if (opts.timeoutMs) {
      req.setTimeout(opts.timeoutMs, () => req.destroy(new Error("CLIENT_TIMEOUT")));
    }
    req.end();
  });
}

async function section3() {
  console.log("\n══ § 3 — the chain is an array, walked in registration order ══\n");

  const order = [];
  const app = miniExpress();

  app.use((req, res, next) => { order.push("A:logger");   next(); });
  app.use((req, res, next) => { order.push("B:tagger");    req.tagged = true; next(); });
  app.get("/ping", (req, res)  => { order.push("C:route"); res.end("pong tagged=" + req.tagged); });

  const { server, port } = await listen(app);
  const r = await request(port, "/ping");
  server.close();

  results.order = order.slice();
  results.pingBody = r.body;
  results.pingStatus = r.status;

  console.log("  registered:  use(A) → use(B) → get(C)");
  console.log("  executed:   ", order.join("  →  "));
  console.log("  response:   ", r.status, JSON.stringify(r.body));
  console.log("\n  Note B mutated req and C read the mutation. That is the whole");
  console.log("  'middleware' idea: shared, mutable req/res walked in order.");

  // And the walk-off-the-end case — no layer matched, so next() ran out of array:
  const app2 = miniExpress();
  app2.get("/only", (req, res) => res.end("hi"));
  const s2 = await listen(app2);
  const miss = await request(s2.port, "/nope");
  s2.server.close();
  results.missStatus = miss.status;
  console.log("\n  GET /nope with no matching layer →", miss.status, JSON.stringify(miss.body));
  console.log("  Express's 404 is not a feature. It is what falling off the end");
  console.log("  of the array looks like.");
}


// ══════════════════════════════════════════════════════════════════
// § 4 — ORDER IS THE API: THE SAME CODE, TWO SECURITY OUTCOMES
// ══════════════════════════════════════════════════════════════════
//
// This is the section to reproduce in an interview. Two apps. Identical
// middleware functions, identical route handler, identical request. The
// ONLY difference is which line was typed first.

const SECRET = "salary-data-2026";

function authMiddleware(req, res, next) {
  if (req.headers["x-token"] === "good") return next();
  res.statusCode = 401;
  res.end("unauthorized");
}

function secretHandler(req, res) {
  res.end(SECRET);
}

async function section4() {
  console.log("\n══ § 4 — same two functions, two orders, two outcomes ══\n");

  // ✅ CORRECT: guard registered BEFORE the thing it guards.
  const good = miniExpress();
  good.use(authMiddleware);
  good.get("/secret", secretHandler);

  // ❌ BUG: guard registered AFTER the route. Looks harmless in a diff.
  const bad = miniExpress();
  bad.get("/secret", secretHandler);
  bad.use(authMiddleware);

  const g = await listen(good);
  const b = await listen(bad);

  const noTokenGood = await request(g.port, "/secret");
  const noTokenBad  = await request(b.port, "/secret");
  const tokenGood   = await request(g.port, "/secret", { headers: { "x-token": "good" } });

  g.server.close();
  b.server.close();

  results.blockedWithoutAuth = noTokenGood.status === 401;
  results.leakedWithoutAuth  = noTokenBad.status === 200 && noTokenBad.body === SECRET;
  results.allowedWithToken   = tokenGood.status === 200 && tokenGood.body === SECRET;

  console.log("  ✅ use(auth) → get(/secret)   , no token  →", noTokenGood.status, JSON.stringify(noTokenGood.body));
  console.log("  ❌ get(/secret) → use(auth)   , no token  →", noTokenBad.status,  JSON.stringify(noTokenBad.body), "  ← LEAKED 🐛");
  console.log("  ✅ use(auth) → get(/secret)   , token ok  →", tokenGood.status,  JSON.stringify(tokenGood.body));
  console.log("\n  Nothing about authMiddleware changed. The array index did.");
  console.log("  This is why 'where do I put app.use()?' is a real question and");
  console.log("  not a style preference.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — THE #1 EXPRESS BUG: A MIDDLEWARE THAT FORGETS next()
// ══════════════════════════════════════════════════════════════════
//
// A middleware that neither ends the response nor calls next() does not
// throw, does not warn, does not time out on the server. The walk simply
// stops and the socket stays open until the CLIENT gives up. In production
// this shows up as "the endpoint is slow" and it is not slow — it is dead.

async function section5() {
  console.log("\n══ § 5 — forgetting next(): the request that never ends ══\n");

  let handlerReached = false;
  let heldRes = null;

  const app = miniExpress();
  app.use((req, res, next) => {
    heldRes = res;            // stash it so we can release the socket later
    // 🐛 no next(), no res.end() — a common shape: an early-return branch,
    //    or an `if (ok) next()` with no else.
  });
  app.get("/ping", (req, res) => { handlerReached = true; res.end("pong"); });

  const { server, port } = await listen(app);

  let timedOut = false;
  try {
    await request(port, "/ping", { timeoutMs: 300 });
  } catch (err) {
    timedOut = err.message === "CLIENT_TIMEOUT" || err.code === "ECONNRESET";
  }

  results.hungRequest = timedOut;
  results.handlerReachedWhileHung = handlerReached;

  console.log("  client waited 300ms for GET /ping …");
  console.log("  request completed?      ", !timedOut ? "yes" : "NO — client gave up 🐛");
  console.log("  route handler reached?  ", handlerReached ? "yes" : "no — the walk stopped at layer 0");
  console.log("  server threw an error?   no. This is the cruel part:");
  console.log("  Node is perfectly happy. The socket is open, the process is idle,");
  console.log("  and every request to this route leaks one open connection.");

  if (heldRes && !heldRes.writableEnded) heldRes.end();   // release it
  server.close();
}


// ══════════════════════════════════════════════════════════════════
// § 6 — SHORT-CIRCUITING: ANSWERING WITHOUT REACHING THE ROUTE
// ══════════════════════════════════════════════════════════════════
//
// The opposite of §5's accident, done on purpose. A middleware that ends
// the response is the mechanism behind caches, rate limiters
// (→ 12_rate-limiting-express-rate-limit.js), auth guards, and maintenance
// modes. The proof that it truly short-circuits: the handler's call counter.

async function section6() {
  console.log("\n══ § 6 — short-circuit: the route handler is never called ══\n");

  let handlerCalls = 0;
  const cache = new Map([["/report", "CACHED-REPORT-v1"]]);

  const app = miniExpress();
  app.use((req, res, next) => {
    const hit = cache.get(req.url.split("?")[0]);
    if (hit === undefined) return next();     // miss → keep walking
    res.setHeader("x-cache", "HIT");
    res.end(hit);                             // hit → the walk ENDS here
  });
  app.get("/report", (req, res) => {
    handlerCalls++;
    res.setHeader("x-cache", "MISS");
    res.end("EXPENSIVE-REPORT");
  });
  app.get("/fresh", (req, res) => {
    handlerCalls++;
    res.end("computed");
  });

  const { server, port } = await listen(app);

  const cached = await request(port, "/report");
  results.handlerCallsAfterCacheHit = handlerCalls;

  const fresh = await request(port, "/fresh");
  results.handlerCallsAfterCacheMiss = handlerCalls;

  server.close();

  results.cacheHitBody = cached.body;
  results.cacheHitHeader = cached.headers["x-cache"];

  console.log("  GET /report →", cached.status, JSON.stringify(cached.body), " x-cache:", cached.headers["x-cache"]);
  console.log("  handler calls after that request:", results.handlerCallsAfterCacheHit, " ← the route never ran");
  console.log("  GET /fresh  →", fresh.status, JSON.stringify(fresh.body));
  console.log("  handler calls now:", results.handlerCallsAfterCacheMiss);
  console.log("\n  Same mechanism as §5's bug. The difference is res.end() —");
  console.log("  stopping the walk WITH an answer versus stopping it without one.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — PATH-SCOPED MIDDLEWARE: app.use('/admin', …)
// ══════════════════════════════════════════════════════════════════
//
// use() with a path is a PREFIX match, not an exact match — it runs for the
// mount path and everything beneath it. That prefix behaviour is the seed
// of routers (→ 04_router-vs-application-middleware.js §3), where the
// prefix is also STRIPPED from req.url before the sub-stack runs.

async function section7() {
  console.log("\n══ § 7 — path-scoped middleware runs on a PREFIX ══\n");

  let adminHits = 0;
  let globalHits = 0;

  const app = miniExpress();
  app.use((req, res, next) => { globalHits++; next(); });
  app.use("/admin", (req, res, next) => { adminHits++; next(); });
  app.get("/admin", (req, res) => res.end("admin root"));
  app.get("/admin/users", (req, res) => res.end("admin users"));
  app.get("/public", (req, res) => res.end("public"));
  app.get("/administrator", (req, res) => res.end("NOT under /admin"));

  const { server, port } = await listen(app);

  const paths = ["/admin", "/admin/users", "/public", "/administrator"];
  const seen = [];
  for (const p of paths) {
    const before = adminHits;
    const r = await request(port, p);
    seen.push({ path: p, status: r.status, ranAdminMw: adminHits > before });
  }

  server.close();

  results.adminHits = adminHits;
  results.globalHits = globalHits;
  results.scopeTable = seen;

  for (const row of seen) {
    console.log(
      "  " + row.path.padEnd(16),
      "→", row.status,
      " admin middleware ran:", row.ranAdminMw ? "yes" : "no "
    );
  }
  console.log("\n  global middleware hits:", globalHits, "(all 4 requests)");
  console.log("  /admin middleware hits:", adminHits, "(only /admin and /admin/users)");
  console.log("\n  Note /administrator did NOT match. Prefix matching is on path");
  console.log("  SEGMENTS, not raw string startsWith — '/admin' matches '/admin'");
  console.log("  and '/admin/…', never '/administrator'. Get that wrong in a");
  console.log("  hand-rolled guard and you ship an auth bypass.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "My endpoint hangs and there's no error in the logs."
//   A middleware with a branch that neither answers nor calls next().
//   Nothing throws; the socket just stays open. → §5
//
// Bug 2 — "Auth is applied but the route is still public."
//   app.use(auth) written BELOW the route it was meant to protect. The
//   walk ended at the route. → §4
//
// Bug 3 — "req.body is undefined even though I send JSON."
//   express.json() registered after the route. Same bug as #2, different
//   costume. → §4, and 13_body-parsing-json-urlencoded.js
//
// Bug 4 — "My error handler never runs."
//   Registered above the routes, so the walk reaches it before any error
//   exists. Error handlers must be last. → 03_error-handling-middleware-4-args.js §4
//
// Bug 5 — "CORS headers appear on some responses but not others."
//   The cors middleware sits below a route (or below a short-circuiting
//   cache) that answers first. → 10_cors-setup.js §6
//
// Bug 6 — "Middleware runs twice / response already sent."
//   A middleware called next() AND ended the response. The walk continues
//   into a handler that writes to a finished response.
//   → 02_next-function.js §6, 08_res-json-vs-res-send.js §7
//
// Bug 7 — An auth guard written as `url.startsWith('/admin')` that happily
//   lets '/administrator' through, or blocks it when it shouldn't. → §7


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 9 — assertions ══\n");

  // § 3 — order and mutation:
  assert.deepEqual(results.order, ["A:logger", "B:tagger", "C:route"],
    "layers executed in registration order, top to bottom ✅");
  assert.equal(results.pingBody, "pong tagged=true",
    "a middleware's mutation of req was visible to the later route handler");
  assert.equal(results.missStatus, 404,
    "walking off the end of the array IS the 404 ✅");

  // § 4 — order is the API:
  assert.equal(results.blockedWithoutAuth, true,
    "auth registered BEFORE the route blocked the unauthenticated request (401) ✅");
  assert.equal(results.leakedWithoutAuth, true,
    "the SAME auth function registered AFTER the route leaked the secret (200) 🐛");
  assert.equal(results.allowedWithToken, true,
    "…and the correct order still let a valid token through");

  // § 5 — the missing next():
  assert.equal(results.hungRequest, true,
    "a middleware with no next() and no res.end() hung the request until the CLIENT gave up 🐛");
  assert.equal(results.handlerReachedWhileHung, false,
    "…and the route handler below it was never reached");

  // § 6 — short-circuit:
  assert.equal(results.handlerCallsAfterCacheHit, 0,
    "a middleware that ended the response kept the route handler's call count at exactly 0 ✅");
  assert.equal(results.handlerCallsAfterCacheMiss, 1,
    "…while a cache MISS called next() and the handler ran exactly once");
  assert.equal(results.cacheHitHeader, "HIT",
    "the short-circuited response carried the middleware's own header");

  // § 7 — prefix scoping:
  assert.equal(results.globalHits, 4, "the use('/') middleware ran for all 4 requests");
  assert.equal(results.adminHits, 2, "the use('/admin') middleware ran for exactly 2 of them");
  assert.equal(results.scopeTable.find((r) => r.path === "/administrator").ranAdminMw, false,
    "'/administrator' did NOT match the '/admin' mount — segment matching, not startsWith ✅");

  console.log("§9 — mini assertions passed for: Middleware concept & chain");
  console.log("\n  The pair that captures it: the identical auth function produced");
  console.log("  401 above the route and a leaked secret below it — and the identical");
  console.log("  'stop the walk' mechanism is a cache hit when you call res.end()");
  console.log("  and a hung socket when you forget to.");
}


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is middleware in Express?", answer:
//
//   "Middleware is a function with the signature (req, res, next). The key
//    thing is what it's a member OF: an Express app is an ordered array of
//    these functions — Express calls them layers — and every request walks
//    that array from index zero. Each layer either ends the response, or
//    calls next() to hand control to the next matching layer.
//
//    Route handlers aren't a separate concept. app.get('/x', fn) is just a
//    layer with a method and path attached, and the built-in 404 isn't a
//    feature — it's what happens when next() runs off the end of the array.
//
//    The consequence I actually care about in code review is that
//    registration order is part of the API, not a style choice. I can show
//    that with two apps that share the exact same auth function and route
//    handler: with app.use(auth) above the route, an unauthenticated
//    request gets 401; move that one line below the route and the same
//    request gets 200 with the secret in the body, because the walk reached
//    the route and ended the response before auth ever ran. That single
//    demo explains 'my body parser isn't working', 'CORS headers are
//    missing on some routes', and 'my error handler never fires' — they're
//    all the same ordering bug.
//
//    The other half is that a middleware must do exactly one of two things:
//    end the response or call next(). If it does neither — an if-branch
//    with no else is the classic shape — the request hangs. Nothing throws,
//    nothing logs, the server looks idle, and each hit leaks an open socket
//    until the client times out. I treat 'every path through this
//    middleware either ends or calls next' as a hard review rule."
//
// Leading with "it's an array, not an event system" and then proving the
// order-dependent security outcome is what makes this answer senior rather
// than a definition recited from the docs.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Is a route handler a middleware?
// A1. Yes — a layer with a method and path filter attached. Same signature,
//     same array, same walk.
//
// Q2. What are the only two legal endings for a middleware?
// A2. End the response, or call next(). Doing neither hangs the request
//     (§5); doing both causes a write-after-end (→ 02 §6).
//
// Q3. Where does Express's 404 come from?
// A3. next() running past the last layer with nothing having answered — a
//     final built-in handler, not a route you registered. Proven in §3.
//
// Q4. Does app.use() run for every request?
// A4. Only for requests whose path matches its mount prefix, and only if
//     the walk actually reaches it. Both conditions matter (§4, §7).
//
// Q5. Is app.use('/admin') an exact match?
// A5. No — a prefix on path SEGMENTS. It matches /admin and /admin/anything
//     but not /administrator (§7).
//
// Q6. Why does a middleware's mutation of req survive into the handler?
// A6. Every layer receives the same req/res object references for that
//     request. That shared, mutable object is how auth attaches req.user
//     and how body parsers attach req.body.
//
// Q7. Is the chain synchronous?
// A7. The walk is driven by explicit next() calls, so it is as synchronous
//     or asynchronous as your code. next() called inside a callback or
//     after an await simply resumes the walk later — the array position is
//     held in a closure, not on the call stack.
//
// Q8. What happens if two middlewares both call next() for the same request?
// A8. The walk advances twice and layers run that shouldn't — typically
//     ending in "Cannot set headers after they are sent." → 02 §6.
//
// Q9. How would you order a real production stack?
// A9. helmet → cors → request-id/logger → rate limiter → body parsers →
//     static → session/auth → routes → 404 → error handler. Cheap and
//     security-relevant first; error handler strictly last.
//
// Q10. Why is "put it in the middleware" a bad debugging instinct sometimes?
// A10. Because a global middleware runs for every matching request,
//      including static assets and health checks — expensive work there
//      taxes every request. Scope it with a mount path (§7) or a router.
//
// Q11. What does the mini-Express in §3 leave out?
// A11. next(err) and error layers (03), sub-stacks and url rewriting (04),
//      param parsing (06), and response helpers (08). Every one of those
//      is an addition to this same array walk — none of them change it.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What IS an Express app, structurally?
//   Back : An ordered array of layers plus a cursor that walks it.
//
// Flashcard 2:
//   Front: Middleware signature?
//   Back : (req, res, next) — and (err, req, res, next) for error layers.
//
// Flashcard 3:
//   Front: The only two legal endings?
//   Back : res.end()/send the response, or call next().
//
// Flashcard 4:
//   Front: Middleware with neither → ?
//   Back : Request hangs forever, no error, socket leaked. Proven §5.
//
// Flashcard 5:
//   Front: auth below the route → ?
//   Back : Route already answered; auth never runs; endpoint public. §4.
//
// Flashcard 6:
//   Front: Where does 404 come from?
//   Back : next() walking off the end of the array. §3.
//
// Flashcard 7:
//   Front: use('/admin') matches '/administrator'?
//   Back : No — segment prefix, not string startsWith. §7.
//
// Flashcard 8:
//   Front: How do you sound senior?
//   Back : "Registration order is the API — I can turn a 401 into a leaked
//          secret by moving one line, without touching either function."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add a maintenance-mode middleware to §3's app that returns 503 for
//   everything when a flag is on — and prove the route counter stays at 0.
//
// Task 2:
//   Extend miniExpress() with app.all(path, fn) and prove it runs for both
//   GET and POST to the same path.
//
// Task 3:
//   Add timing: a middleware that records Date.now() before next() and logs
//   the duration after. Why does the "after" code run only if downstream
//   layers call next() synchronously? Fix it using res.on('finish').
//
// Task 4:
//   Break §7's prefix match on purpose — use urlPath.startsWith(layer.path)
//   without the segment check — and show /administrator now runs the admin
//   middleware. That is a real auth-bypass class of bug.
//
// Task 5:
//   Register the SAME middleware function twice and confirm it runs twice.
//   Then dedupe by tagging req and early-returning next().
//
// Task 6:
//   Instrument miniExpress().handle to log every layer it SKIPS and why
//   (method mismatch vs path mismatch). You have now built the debugging
//   tool that answers "why didn't my middleware run?"
//
// Task 7:
//   Reproduce §5's hang, then add server.setTimeout() (or a timeout
//   middleware) so hung requests are killed after 2s. Compare that to
//   fixing the missing next() — why is the timeout only a safety net?


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   An Express app is an ORDERED ARRAY of functions, walked one at a time.
//   Registration order is the API — proven by turning a 401 into a leaked
//   secret by moving a single app.use() line below a route.
//
// If you remember the common bug:
//   A middleware that neither ends the response nor calls next(). No error,
//   no log, request hangs, socket leaks.
//
// If you remember the professional framing:
//   Cheap and security-relevant middleware first, routes next, error
//   handler last — and every branch inside a middleware must reach exactly
//   one of res.end() or next().
//
// ─────────────────────────────────────────────────────────────────
// This file proved THAT the array is walked in order. It did not explain
// the one function doing the walking — its overloads, its error form, and
// what happens when you call it twice.
//
// NEXT TOPIC -> 02_next-function.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section3();
  await section4();
  await section5();
  await section6();
  await section7();
  assertions();
})();
