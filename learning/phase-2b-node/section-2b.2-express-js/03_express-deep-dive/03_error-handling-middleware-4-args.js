// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  03_error-handling-middleware-4-args.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Error-handling middleware (4 args)
//
// WHAT YOU WILL MASTER HERE:
//   1. The rule, stated exactly: Express decides what an error handler is by
//      reading fn.length — four declared parameters, nothing else
//   2. Why that makes it FRAGILE in a way no other framework rule is: a
//      default value or a rest parameter silently changes fn.length and your
//      error handler stops being one, with no warning
//   3. The three-arg impostor proven: the same body, one parameter short,
//      never runs in error mode
//   4. Placement proven: an error handler registered above the routes has a
//      hit count of 0, forever
//   5. Chaining error handlers with next(err), and what the built-in default
//      handler does when you have none
//   6. res.headersSent — the check every production error handler needs, and
//      what happens without it when a response has already started streaming
//   7. A production-shaped handler: status mapping, no stack leak, logging
//   8. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/03_error-handling-middleware-4-args.js"
//
// Prerequisites: 02_next-function.js §5 (next(err) switches the walk into
// error mode and skips every normal layer) and §8 (sync throws are caught,
// async rejections are not). This file is the other half of that story: the
// destination those errors are travelling to.


const http = require("http");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Error-handling middleware:
// a layer declared with exactly FOUR parameters — (err, req, res, next) —
// which Express skips during normal request handling and runs only once the
// walk is in error mode, i.e. after a synchronous throw or an explicit
// next(err).
//
// If interviewer says "explain it simply", say:
//   "It's an ordinary middleware with one extra parameter at the front.
//    Express counts the declared parameters of every function you register:
//    four means 'this is an error handler', anything else means 'this is a
//    normal one'. During a healthy request the four-argument ones are
//    skipped. As soon as an error is in flight, the normal ones are skipped
//    instead and the request goes straight to the first four-argument
//    handler that follows the point where the error happened."
//
// If interviewer says "why four arguments and not a flag?", say:
//   "History — it's the only signal available on a plain function, so
//    Express reads fn.length. That's also why it's the framework rule people
//    break most often by accident: give the last parameter a default value,
//    or use a rest parameter, and fn.length drops. The function is still
//    registered, still looks perfect in review, and simply never runs.
//    Express doesn't warn about it."
//
// Why it matters in interviews:
//   "Why is my error handler never called?" has exactly three causes, and a
//   senior can name all three cold: wrong arity, wrong position, or the
//   error never reached next() in the first place (async). This file proves
//   the first two; 02 §8 proved the third.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   FOUR PARAMETERS, AND LAST IN THE FILE. BOTH, OR IT NEVER RUNS.
//
// Runtime rule:
//   At registration Express records fn.length. During the walk it keeps two
//   modes. Normal mode runs layers with length !== 4 and skips the rest.
//   Error mode (entered by throw or next(err)) does the exact opposite —
//   and it starts from the position where the error occurred, never from
//   the top. Path and method filters still apply to error layers.
//
// Practical rule:
//   One app-wide error handler, registered after every route and every
//   router, written as (err, req, res, next) with all four names present and
//   used. Then a 404 handler just above it. Nothing below it.
//
// Common trap:
//   Writing (err, req, res) because "I never use next". fn.length is 3.
//   Express treats it as a normal middleware, so it is skipped in error mode
//   and, worse, will run on a HEALTHY request with err bound to req.
//
// The mental picture:
//
//   normal mode:   [use][use][route][route]   4-arg layers ─── skipped
//   error  mode:   ────── skipped ──────▶    [4-arg][4-arg]
//                          ▲
//                          └─ error entered here; the walk does NOT restart


// ══════════════════════════════════════════════════════════════════
// § 3 — THE DISPATCHER, WITH THE ARITY RULE MADE EXPLICIT
// ══════════════════════════════════════════════════════════════════
//
// One line in the code below is the entire topic of this file:
//     const isErrorLayer = layer.handler.length === 4;

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
      for (const fn of fns) stack.push({ method: null, path, handler: fn });
      return app;
    },
    get(path, fn)  { stack.push({ method: "GET",  path, handler: fn }); return app; },
    post(path, fn) { stack.push({ method: "POST", path, handler: fn }); return app; },

    handle(req, res) {
      const urlPath = req.url.split("?")[0];
      let i = 0;

      function next(err) {
        const layer = stack[i++];

        if (!layer) {
          if (res.writableEnded) return;
          if (err) {
            // THE DEFAULT ERROR HANDLER. Express ships one; you cannot
            // remove it. It is the reason an unhandled error still produces
            // a 500 instead of a hung socket. → §6
            res.statusCode = err.status || err.statusCode || 500;
            res.setHeader("x-handled-by", "express-default");
            return res.end("DEFAULT: " + err.message);
          }
          res.statusCode = 404;
          return res.end("Cannot " + req.method + " " + urlPath);
        }

        // ───────── THE ENTIRE RULE, IN ONE EXPRESSION ─────────
        const isErrorLayer = layer.handler.length === 4;
        // ──────────────────────────────────────────────────────

        if (err && !isErrorLayer) return next(err);   // error mode skips normal layers
        if (!err && isErrorLayer) return next();      // normal mode skips error layers

        if (layer.method && layer.method !== req.method) return next(err);
        if (!pathMatches(layer, urlPath)) return next(err);

        try {
          if (err) layer.handler(err, req, res, next);
          else layer.handler(req, res, next);
        } catch (thrown) {
          next(thrown);                               // a throw INSIDE an error handler
        }                                             // moves to the NEXT error handler (§6)
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
    req.end();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — fn.length IS THE WHOLE RULE — AND IT IS EASY TO BREAK
// ══════════════════════════════════════════════════════════════════
//
// Before running anything: measure the arity of five functions that all
// LOOK like error handlers. Only two of them are.

function section4() {
  console.log("\n══ § 4 — what Express actually measures ══\n");

  const candidates = {
    "(err, req, res, next) => {}":            (err, req, res, next) => {},
    "function (err, req, res, next) {}":      function (err, req, res, next) {},
    "(err, req, res) => {}":                  (err, req, res) => {},
    "(err, req, res, next = null) => {}":     (err, req, res, next = null) => {},
    "(...args) => {}":                        (...args) => {},
    "(err, req, res, next, extra) => {}":     (err, req, res, next, extra) => {},
  };

  const table = {};
  for (const [src, fn] of Object.entries(candidates)) {
    table[src] = { length: fn.length, isErrorHandler: fn.length === 4 };
  }
  results.arityTable = table;

  for (const [src, info] of Object.entries(table)) {
    console.log(
      "  " + src.padEnd(36),
      "fn.length =", info.length,
      info.isErrorHandler ? " ✅ error handler" : " ❌ NOT an error handler"
    );
  }

  console.log("\n  Three of those six are traps, and they are traps a linter, a type");
  console.log("  checker and a code review all wave straight through:");
  console.log("    • a default value on ANY parameter stops counting at that point");
  console.log("    • rest parameters count as 0");
  console.log("    • a fifth parameter is not 4 either");
  console.log("\n  fn.length is 'parameters before the first default or rest' — that is");
  console.log("  a JavaScript rule, not an Express one. Express just reads it.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — THE THREE-ARG IMPOSTOR, AT RUNTIME
// ══════════════════════════════════════════════════════════════════
//
// Two apps. The error handler body is character-for-character identical.
// One declares four parameters, the other three.

async function section5() {
  console.log("\n══ § 5 — same body, one parameter short ══\n");

  let fourArgHits = 0;
  let threeArgHitsInErrorMode = 0;
  let threeArgHitsOnHealthyRequest = 0;

  const good = miniExpress();
  good.get("/boom", () => { throw new Error("kaboom"); });
  good.get("/fine", (req, res) => res.end("fine"));
  good.use((err, req, res, next) => {                       // length 4 ✅
    fourArgHits++;
    res.statusCode = 500;
    res.end("caught: " + err.message);
  });

  const bad = miniExpress();
  bad.get("/boom", () => { throw new Error("kaboom"); });
  bad.get("/fine", (req, res) => res.end("fine"));
  bad.use((err, req, res) => {                              // length 3 ❌
    // In ERROR mode this is skipped. On a HEALTHY request it runs as a
    // normal middleware — with `err` bound to req, `req` bound to res, and
    // `res` bound to next. Every name in the body now lies.
    if (typeof err.url === "string") { threeArgHitsOnHealthyRequest++; return res(); }
    threeArgHitsInErrorMode++;
  });

  const g = await listen(good);
  const b = await listen(bad);

  const gBoom = await request(g.port, "/boom");
  const bBoom = await request(b.port, "/boom");
  const bHealthy = await request(b.port, "/unknown");   // no route ends this one,
                                                        // so the walk REACHES the impostor

  g.server.close();
  b.server.close();

  results.fourArgHits = fourArgHits;
  results.fourArgStatus = gBoom.status;
  results.fourArgBody = gBoom.body;
  results.threeArgHitsInErrorMode = threeArgHitsInErrorMode;
  results.threeArgHitsOnHealthy = threeArgHitsOnHealthyRequest;
  results.threeArgFellThrough = bBoom.headers["x-handled-by"] === "express-default";
  results.threeArgBoomBody = bBoom.body;
  results.threeArgHealthyBody = bHealthy.body;

  console.log("  ✅ 4-arg handler, GET /boom →", gBoom.status, JSON.stringify(gBoom.body));
  console.log("     handler invocations:", fourArgHits);
  console.log("\n  ❌ 3-arg handler, GET /boom →", bBoom.status, JSON.stringify(bBoom.body));
  console.log("     handler invocations in error mode:", threeArgHitsInErrorMode, "  ← never ran");
  console.log("     fell through to the DEFAULT handler:", results.threeArgFellThrough);
  console.log("\n  ❌ 3-arg handler, GET /unknown →", bHealthy.status, JSON.stringify(bHealthy.body));
  console.log("     invocations on a NON-error request:", threeArgHitsOnHealthyRequest, "  ← it ran here 🐛");
  console.log("\n  That last line is the cruel part. The 'error handler' does run —");
  console.log("  just on requests with no error at all, whenever the walk reaches it:");
  console.log("  an unmatched path, or any route that calls next() instead of ending.");
  console.log("  And when it runs, `err` is bound to the REQUEST object, `req` to the");
  console.log("  response, and `res` to next. Every name in the body is a lie:");
  console.log("  err.message is undefined, the logging is garbage, and the real errors");
  console.log("  are still going unhandled.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — PLACEMENT: LAST, OR NEVER
// ══════════════════════════════════════════════════════════════════
//
// Error mode does not restart the walk. It continues forward from where the
// error happened. So an error handler registered ABOVE the routes has
// already been passed by the time anything can go wrong.

async function section6() {
  console.log("\n══ § 6 — an error handler above the routes never runs ══\n");

  let topHits = 0;
  let bottomHits = 0;

  const app = miniExpress();
  app.use((err, req, res, next) => { topHits++; res.end("TOP"); });     // ❌ too early
  app.get("/boom", () => { throw new Error("late boom"); });
  app.use((err, req, res, next) => {                                    // ✅ correct place
    bottomHits++;
    res.statusCode = err.status || 500;
    res.end("BOTTOM: " + err.message);
  });

  const { server, port } = await listen(app);
  const r = await request(port, "/boom");
  server.close();

  results.topErrorHandlerHits = topHits;
  results.bottomErrorHandlerHits = bottomHits;
  results.placementBody = r.body;

  console.log("  handler registered ABOVE the route, hits:", topHits, " ← 0, and always will be");
  console.log("  handler registered BELOW the route, hits:", bottomHits);
  console.log("  response:", r.status, JSON.stringify(r.body));
  console.log("\n  Both handlers are valid 4-argument functions. Only position");
  console.log("  separates them. This is the same lesson as 01 §4, and it is the");
  console.log("  second of the three reasons an error handler 'never runs'.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — CHAINING, AND THE DEFAULT HANDLER YOU CANNOT DELETE
// ══════════════════════════════════════════════════════════════════
//
// Error handlers form their own chain. next(err) inside one moves to the
// NEXT four-argument layer. Fall off the end and Express's built-in default
// handler answers — which is why a forgotten error still becomes a 500 and
// not a hung socket (contrast 01 §5, where forgetting next() DID hang).

async function section7() {
  console.log("\n══ § 7 — chained error handlers, and the default fallback ══\n");

  const seen = [];
  const app = miniExpress();

  app.get("/db",   () => { const e = new Error("connection lost"); e.kind = "db";   throw e; });
  app.get("/auth", () => { const e = new Error("bad token");       e.kind = "auth"; e.status = 401; throw e; });
  app.get("/weird",() => { const e = new Error("who knows");       e.kind = "???";  throw e; });

  app.use((err, req, res, next) => {                       // specialist 1
    seen.push("db-handler");
    if (err.kind !== "db") return next(err);               // not mine → pass it on
    res.statusCode = 503;
    res.end("database unavailable");
  });

  app.use((err, req, res, next) => {                       // specialist 2
    seen.push("auth-handler");
    if (err.kind !== "auth") return next(err);
    res.statusCode = err.status;
    res.end("please log in");
  });
  // NOTE: deliberately no catch-all. /weird will fall through to the default.

  const { server, port } = await listen(app);
  const db    = await request(port, "/db");
  const auth  = await request(port, "/auth");
  const weird = await request(port, "/weird");
  server.close();

  results.chainSeen = seen.slice();
  results.dbStatus = db.status;
  results.dbBody = db.body;
  results.authStatus = auth.status;
  results.authBody = auth.body;
  results.weirdStatus = weird.status;
  results.weirdHandledBy = weird.headers["x-handled-by"];

  console.log("  GET /db    →", db.status, JSON.stringify(db.body));
  console.log("  GET /auth  →", auth.status, JSON.stringify(auth.body));
  console.log("  GET /weird →", weird.status, JSON.stringify(weird.body),
              " handled by:", weird.headers["x-handled-by"]);
  console.log("\n  layer visit order across the three requests:");
  console.log("   ", seen.join(" · "));
  console.log("\n  Read that trace: /auth visited db-handler FIRST and was passed on");
  console.log("  with next(err). Specialists must re-throw what isn't theirs, or they");
  console.log("  swallow errors silently — a 200 with an empty body is the symptom.");
  console.log("\n  And /weird, with no matching specialist, still got a 500 from the");
  console.log("  built-in default handler. In real Express that default prints the");
  console.log("  stack in development and a bare 'Internal Server Error' when");
  console.log("  NODE_ENV=production — which is exactly what §9 rebuilds by hand.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — res.headersSent: THE CHECK EVERY REAL HANDLER NEEDS
// ══════════════════════════════════════════════════════════════════
//
// If the response already started — a streamed file, a chunked JSON list, a
// res.write() before the failure — the status code and headers are GONE.
// The client has already been told "200 OK". An error handler that tries to
// set a 500 at that point throws, and the request dies mid-body with no
// diagnosis.

async function section8() {
  console.log("\n══ § 8 — when the response has already started ══\n");

  let naiveCrashCode = null;

  const naive = miniExpress();
  naive.get("/stream", (req, res) => {
    res.write("partial-data");                     // headers are now SENT
    throw new Error("failed mid-stream");
  });
  naive.use((err, req, res, next) => {
    try {
      res.setHeader("content-type", "application/json");   // 💥
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    } catch (e) {
      naiveCrashCode = e.code;
      res.end();                                   // release the socket
    }
  });

  const safe = miniExpress();
  safe.get("/stream", (req, res) => {
    res.write("partial-data");
    throw new Error("failed mid-stream");
  });
  safe.use((err, req, res, next) => {
    if (res.headersSent) {
      // Cannot change the status any more. Two honest options: end the
      // response so the client sees a truncated body, or destroy the socket
      // so it sees a broken connection rather than believing the body was
      // complete. Log loudly either way.
      return res.end("\n[stream aborted: " + err.message + "]");
    }
    res.statusCode = 500;
    res.end("clean 500");
  });

  const n = await listen(naive);
  const s = await listen(safe);
  const naiveRes = await request(n.port, "/stream");
  const safeRes  = await request(s.port, "/stream");
  n.server.close();
  s.server.close();

  results.naiveCrashCode = naiveCrashCode;
  results.naiveStatus = naiveRes.status;
  results.naiveBody = naiveRes.body;
  results.safeStatus = safeRes.status;
  results.safeBody = safeRes.body;

  console.log("  ❌ no headersSent check:", naiveRes.status, JSON.stringify(naiveRes.body));
  console.log("     error handler died with:", naiveCrashCode);
  console.log("  ✅ with headersSent check:", safeRes.status, JSON.stringify(safeRes.body));
  console.log("\n  Both responses are 200. That is not a bug in the handler — it is");
  console.log("  physics. The status line left the building before the error existed.");
  console.log("  The only thing you control after that point is whether the client can");
  console.log("  TELL that the body is incomplete.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — THE PRODUCTION-SHAPED HANDLER
// ══════════════════════════════════════════════════════════════════
//
// Everything above, assembled: status mapping from error metadata, a stable
// JSON envelope, one log line with the full detail, and a body that leaks
// nothing in production.

function makeErrorHandler({ production }) {
  const logged = [];
  const handler = (err, req, res, next) => {
    logged.push({ msg: err.message, code: err.code, stack: Boolean(err.stack) });

    if (res.headersSent) return next(err);       // §8 — delegate, don't fight

    const status = err.status || err.statusCode || (err.code === "VALIDATION" ? 400 : 500);
    const body = {
      error: {
        code: err.code || "INTERNAL",
        message: status >= 500 && production ? "Internal Server Error" : err.message,
      },
    };
    if (!production && err.stack) body.error.stack = err.stack.split("\n").slice(0, 2);

    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
  return { handler, logged };
}

async function section9() {
  console.log("\n══ § 9 — one handler, four failures, prod vs dev ══\n");

  async function run(production) {
    const { handler, logged } = makeErrorHandler({ production });
    const app = miniExpress();
    app.get("/validation", () => { const e = new Error("email is required"); e.code = "VALIDATION"; throw e; });
    app.get("/notfound",   () => { const e = new Error("user 42 not found"); e.status = 404; e.code = "NOT_FOUND"; throw e; });
    app.get("/conflict",   () => { const e = new Error("slug taken");        e.status = 409; e.code = "CONFLICT"; throw e; });
    app.get("/crash",      () => { throw new Error("TypeError: cannot read property 'id' of undefined"); });
    app.use(handler);

    const { server, port } = await listen(app);
    const out = {};
    for (const p of ["/validation", "/notfound", "/conflict", "/crash"]) {
      const r = await request(port, p);
      out[p] = { status: r.status, body: JSON.parse(r.body) };
    }
    server.close();
    return { out, logged };
  }

  const dev  = await run(false);
  const prod = await run(true);

  results.statusMap = Object.fromEntries(Object.entries(dev.out).map(([k, v]) => [k, v.status]));
  results.devCrashMessage = dev.out["/crash"].body.error.message;
  results.prodCrashMessage = prod.out["/crash"].body.error.message;
  results.prodCrashHasStack = "stack" in prod.out["/crash"].body.error;
  results.devCrashHasStack = "stack" in dev.out["/crash"].body.error;
  results.prod404Message = prod.out["/notfound"].body.error.message;
  results.loggedCount = prod.logged.length;

  console.log("  status mapping (identical in both modes):");
  for (const [p, st] of Object.entries(results.statusMap)) console.log("   ", p.padEnd(13), "→", st);
  console.log("\n  GET /crash, development :", JSON.stringify(dev.out["/crash"].body.error.message));
  console.log("                    stack? :", results.devCrashHasStack);
  console.log("  GET /crash, production  :", JSON.stringify(prod.out["/crash"].body.error.message));
  console.log("                    stack? :", results.prodCrashHasStack);
  console.log("  GET /notfound, production:", JSON.stringify(results.prod404Message), " ← 4xx messages still shown");
  console.log("\n  server-side log entries in production:", results.loggedCount, "of 4 — every error");
  console.log("  is still fully logged. Hiding detail from the CLIENT is not the same");
  console.log("  as not recording it. And note the 4xx/5xx split: a 404's message is");
  console.log("  the client's own fault and safe to return; a 500's message is your");
  console.log("  internals and is not.");
}


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — "My error handler never runs" #1: three parameters.
//   (err, req, res) has fn.length 3 — a normal middleware that fires on
//   healthy requests with shifted arguments. → §4, §5
//
// Bug 2 — "My error handler never runs" #2: a default parameter.
//   (err, req, res, next = () => {}) has fn.length 3. Identical symptom,
//   even harder to spot. → §4
//
// Bug 3 — "My error handler never runs" #3: registered above the routes.
//   Error mode walks forward from the failure, never from the top. → §6
//
// Bug 4 — "My error handler never runs" #4: the error never entered the
//   chain — an async rejection on Express 4. → 02_next-function.js §8
//
// Bug 5 — Swallowed errors: a specialist handler that inspects err, doesn't
//   recognise it, and returns without calling next(err). The request ends
//   with a 200 and an empty body. → §7
//
// Bug 6 — "Cannot set headers after they are sent" INSIDE the error handler.
//   No res.headersSent check on a response that already started. → §8
//
// Bug 7 — Stack traces in production JSON. Paths, versions, and internal
//   function names handed to anyone who can trigger a 500. → §9
//
// Bug 8 — Returning err.message verbatim for 5xx. Driver errors leak table
//   names, connection strings, and query fragments. → §9
//
// Bug 9 — A 404 handler placed BELOW the error handler, so it never runs,
//   or written with four parameters, so it becomes an error handler.


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 11 — assertions ══\n");

  // § 4 — the arity rule:
  const t = results.arityTable;
  assert.equal(t["(err, req, res, next) => {}"].isErrorHandler, true,
    "four declared parameters ⇒ Express treats it as an error handler ✅");
  assert.equal(t["(err, req, res) => {}"].length, 3,
    "three parameters ⇒ fn.length 3 ⇒ NOT an error handler 🐛");
  assert.equal(t["(err, req, res, next = null) => {}"].length, 3,
    "a DEFAULT VALUE silently drops fn.length to 3 — the invisible version of the same bug 🐛");
  assert.equal(t["(...args) => {}"].length, 0,
    "a rest parameter makes fn.length 0 🐛");
  assert.equal(t["(err, req, res, next, extra) => {}"].isErrorHandler, false,
    "five parameters is not four either");

  // § 5 — the impostor at runtime:
  assert.equal(results.fourArgHits, 1, "the 4-arg handler ran exactly once for the throwing route ✅");
  assert.equal(results.fourArgStatus, 500);
  assert.equal(results.fourArgBody, "caught: kaboom");
  assert.equal(results.threeArgHitsInErrorMode, 0,
    "the identical body with 3 parameters never ran in error mode 🐛");
  assert.equal(results.threeArgFellThrough, true,
    "…the error fell through to Express's built-in default handler instead");
  assert.equal(results.threeArgHitsOnHealthy, 1,
    "…and it DID run on a NON-error request, with err bound to the request object 🐛");
  assert.equal(results.threeArgHealthyBody, "Cannot GET /unknown",
    "…then called what it thought was `res` — actually next() — and the walk carried on");

  // § 6 — placement:
  assert.equal(results.topErrorHandlerHits, 0,
    "an error handler above the routes was never reached — error mode walks forward 🐛");
  assert.equal(results.bottomErrorHandlerHits, 1,
    "…the identical function below the routes ran ✅");
  assert.equal(results.placementBody, "BOTTOM: late boom");

  // § 7 — chaining and the default:
  assert.deepEqual(results.chainSeen, ["db-handler", "db-handler", "auth-handler", "db-handler", "auth-handler"],
    "each error visited handlers in order until one claimed it — next(err) chains error layers ✅");
  assert.equal(results.dbStatus, 503);
  assert.equal(results.authStatus, 401, "the auth error passed THROUGH the db handler via next(err)");
  assert.equal(results.weirdStatus, 500);
  assert.equal(results.weirdHandledBy, "express-default",
    "an error nobody claimed still produced a 500 from the built-in default handler ✅");

  // § 8 — headersSent:
  assert.equal(results.naiveCrashCode, "ERR_HTTP_HEADERS_SENT",
    "an error handler that ignored res.headersSent threw while handling the error 🐛");
  assert.equal(results.naiveStatus, 200,
    "…and the client still saw 200, because the status line was already sent");
  assert.equal(results.naiveBody, "partial-data",
    "…with a truncated body and no indication anything went wrong 🐛");
  assert.equal(results.safeStatus, 200, "the safe handler also could not change the status — that part is physics");
  assert.equal(results.safeBody, "partial-data\n[stream aborted: failed mid-stream]",
    "…but it marked the body so the client can TELL it is incomplete ✅");

  // § 9 — production shape:
  assert.deepEqual(results.statusMap,
    { "/validation": 400, "/notfound": 404, "/conflict": 409, "/crash": 500 },
    "one handler mapped four different failures to four correct status codes ✅");
  assert.equal(results.devCrashHasStack, true, "development responses included a stack excerpt");
  assert.equal(results.prodCrashHasStack, false, "production responses carried NO stack ✅");
  assert.equal(results.prodCrashMessage, "Internal Server Error",
    "…and no 5xx internals leaked into the body ✅");
  assert.equal(results.prod404Message, "user 42 not found",
    "…while 4xx messages, which describe the CLIENT's mistake, were still returned");
  assert.equal(results.loggedCount, 4, "all four errors were still logged server-side in production");

  console.log("§11 — mini assertions passed for: Error-handling middleware (4 args)");
  console.log("\n  The pair that captures it: `(err, req, res, next = null)` has fn.length 3");
  console.log("  and silently stops being an error handler — and the same function moved");
  console.log("  above the routes has a hit count of 0 no matter how many errors you throw.");
}


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how does error handling work in Express?", answer:
//
//   "Express identifies an error handler purely by arity — it reads
//    fn.length and treats four declared parameters, (err, req, res, next),
//    as an error handler. During a normal request those layers are skipped;
//    once an error is in flight — a synchronous throw or an explicit
//    next(err) — the normal layers are skipped instead and the walk
//    continues FORWARD to the first four-argument layer after the point of
//    failure.
//
//    Two consequences fall straight out of that. First, position: an error
//    handler registered above the routes can never fire, because the walk
//    doesn't restart at the top. Mine goes last, below a 404 handler, below
//    every router. Second, arity is fragile in a way people don't expect —
//    fn.length counts parameters before the first default or rest
//    parameter, so writing (err, req, res, next = null) drops it to three
//    and the function silently stops being an error handler. Worse, a
//    three-parameter version doesn't just fail to catch errors, it starts
//    running on healthy requests with err bound to the request object.
//
//    Error handlers chain: next(err) inside one moves to the next
//    four-argument layer, which is how you write specialists — a database
//    handler, an auth handler — as long as each one re-throws what isn't
//    its own, or it swallows the error and the client gets an empty 200. If
//    nothing claims it, Express's built-in default handler produces the 500,
//    which is why an unhandled error is at least never a hung socket.
//
//    In production my handler does four things: check res.headersSent first
//    and delegate if the response already started, because at that point the
//    status is already on the wire and I can only mark the body as
//    truncated; map err.status or an error code to a real status; log the
//    full error server-side; and return a stable JSON envelope that echoes
//    4xx messages but replaces every 5xx message with 'Internal Server
//    Error' and never includes a stack.
//
//    The one thing this doesn't cover is async: on Express 4 a rejected
//    promise never reaches the chain at all, so every async handler needs a
//    try/catch calling next(err), or an asyncHandler wrapper."
//
// Naming the three distinct causes of "my error handler never runs" — wrong
// arity, wrong position, error never entered the chain — is the part that
// reads as experience rather than documentation.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. How does Express know a middleware is an error handler?
// A1. fn.length === 4. That is the entire mechanism.
//
// Q2. What does (err, req, res, next = null) do?
// A2. fn.length becomes 3, so it stops being an error handler — silently.
//     Proven in §4.
//
// Q3. What does a 3-parameter "error handler" do on a healthy request?
// A3. Runs as a normal middleware with shifted arguments: err is the
//     request, req is the response, res is next. Proven in §5.
//
// Q4. Why must the error handler be registered last?
// A4. Error mode continues forward from the failure point; it never
//     restarts the walk. Anything above has already been passed (§6).
//
// Q5. Can you have more than one error handler?
// A5. Yes — next(err) moves to the next four-argument layer. Specialists
//     must re-throw with next(err) or they swallow errors (§7).
//
// Q6. What happens if you register none?
// A6. Express's built-in default handler answers: 500, stack in
//     development, bare message in production (§7).
//
// Q7. What must you check first inside an error handler?
// A7. res.headersSent. If true, the status is already sent — delegate to
//     the default handler or end the body with a marker (§8).
//
// Q8. Do error handlers respect mount paths?
// A8. Yes. An error handler inside a router only handles errors raised
//     within that router → 04_router-vs-application-middleware.js §6.
//
// Q9. Does the error handler catch errors thrown in another error handler?
// A9. The NEXT error handler does. A throw inside one is caught and passed
//     forward, exactly like next(err) (§3, the try/catch).
//
// Q10. Why not just log err.message to the client?
// A10. 5xx messages come from your internals — driver errors carry table
//      names, hostnames, sometimes credentials in a connection string (§9).
//
// Q11. How do you handle async errors?
// A11. try/catch → next(err) per handler, an asyncHandler wrapper, or
//      Express 5, which forwards rejections. Never rely on
//      process.on('unhandledRejection') → 02 §8.
//
// Q12. Where does a 404 handler go?
// A12. A THREE-parameter middleware immediately after all routes and
//      immediately before the error handler. Making it four-parameter turns
//      it into an error handler and breaks both.
//
// Q13. What about uncaughtException / unhandledRejection at the process
//      level?
// A13. Log-and-exit only, with a supervisor restarting the process. The
//      process state is unknown at that point; continuing to serve requests
//      from it is how corrupt data gets written.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: How does Express detect an error handler?
//   Back : fn.length === 4. Nothing else.
//
// Flashcard 2:
//   Front: fn.length of (err, req, res, next = null)?
//   Back : 3 — silently no longer an error handler.
//
// Flashcard 3:
//   Front: 3-arg "error handler" on a healthy request?
//   Back : Runs as normal middleware with shifted args. err === req.
//
// Flashcard 4:
//   Front: Why last in the file?
//   Back : Error mode walks FORWARD from the failure; it never restarts.
//
// Flashcard 5:
//   Front: Chaining error handlers?
//   Back : next(err) → the next 4-arg layer. Re-throw what isn't yours.
//
// Flashcard 6:
//   Front: No error handler registered?
//   Back : The built-in default answers: 500, stack in dev only.
//
// Flashcard 7:
//   Front: First line of any real error handler?
//   Back : if (res.headersSent) return next(err);
//
// Flashcard 8:
//   Front: 4xx vs 5xx message policy?
//   Back : Echo 4xx (client's mistake), mask 5xx (your internals). Log both.
//
// Flashcard 9:
//   Front: How do you sound senior?
//   Back : "'My error handler never runs' has exactly three causes: arity,
//          position, or the error never reached next() because it was async."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add a length check to miniExpress's use() that throws at REGISTRATION
//   time if a function's name starts with "error" but fn.length !== 4.
//   You have just built the guardrail Express doesn't ship.
//
// Task 2:
//   Write a 404 middleware for §9's app and prove it runs for an unknown
//   path but not for a route that throws.
//
// Task 3:
//   Build an AppError class with status and code fields, throw four
//   subclasses of it, and make the §9 handler map them without any
//   if/else on message strings.
//
// Task 4:
//   Reproduce §5's three-arg impostor and add a console.log of typeof err
//   inside it on a healthy request. Confirm it prints "object" and that
//   err.url is the request path.
//
// Task 5:
//   Make §7's db-handler forget its `return next(err)`. Observe the empty
//   200 that /auth now returns — the silent swallow.
//
// Task 6:
//   Extend §8: instead of res.end() with a marker, call res.destroy() and
//   compare what the client observes. Which is safer for a JSON stream, and
//   why does a truncated JSON body arguably need the harsher option?
//
// Task 7:
//   Add a requestId middleware and include it in both the log line and the
//   JSON error envelope. That single field is what makes a masked 5xx
//   message supportable in production.
//
// Task 8:
//   Wrap §9's handler so it also records a metric per status class, then
//   assert that four requests produce one 4xx-family count of 3 and one 5xx
//   count of 1.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Express identifies an error handler by fn.length === 4, and error mode
//   walks FORWARD from the failure — so four parameters and last position
//   are both mandatory, and a default value on the last parameter silently
//   destroys the first requirement.
//
// If you remember the common bug:
//   A three-parameter "error handler": it never catches anything, and it
//   runs on every healthy request with err bound to the request object.
//
// If you remember the professional framing:
//   if (res.headersSent) return next(err) · map err.status/code to a status ·
//   log everything server-side · echo 4xx messages, mask 5xx, never ship a
//   stack.
//
// ─────────────────────────────────────────────────────────────────
// 01, 02 and 03 have described ONE flat stack — a single array belonging to
// the app. Real applications don't have one array; they mount sub-stacks at
// prefixes, and those sub-stacks have their own middleware, their own error
// handlers, and a rewritten req.url.
//
// NEXT TOPIC -> 04_router-vs-application-middleware.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  section4();
  await section5();
  await section6();
  await section7();
  await section8();
  await section9();
  assertions();
})();
