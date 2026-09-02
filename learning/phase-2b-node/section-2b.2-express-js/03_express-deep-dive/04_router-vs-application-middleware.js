// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  04_router-vs-application-middleware.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Router vs Application middleware
//
// WHAT YOU WILL MASTER HERE:
//   1. The structural fact: an app is not one array — it is a TREE of
//      arrays, and mounting a router pushes a whole sub-stack in as a single
//      layer of the parent
//   2. The mechanic nobody explains: mounting REWRITES req.url for the
//      duration of the sub-stack, and restores it on the way out
//   3. req.url vs req.originalUrl vs req.baseUrl, printed side by side from
//      inside the same handler, mounted at two different prefixes at once
//   4. Application-level vs router-level middleware scope, proven with hit
//      counters across four different request paths
//   5. Router-scoped error handlers: an error raised inside a router is
//      caught by that router's handler and never reaches the app's
//   6. Fallthrough: a router whose prefix matched but whose routes didn't
//      hands control BACK to the parent — it does not 404 on its own
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/04_router-vs-application-middleware.js"
//
// Prerequisites: 01_middleware-concept-and-chain.js §3 (the stack and the
// cursor), 02_next-function.js §5 (error mode), 03_error-handling-middleware-
// 4-args.js §6 (error handlers are positional). Everything here is those
// three rules applied recursively.
//
// Files 01–03 described ONE flat array. That model is enough to explain a
// tutorial app and nothing else: real applications mount routers, and the
// moment they do, "where does this middleware run?" stops being a question
// about position and becomes a question about position AND depth.


const http = require("http");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Application middleware vs router middleware:
// application middleware (app.use) is a layer in the app's own stack and
// runs for every matching request; router middleware (router.use) is a layer
// in a SEPARATE stack that only exists once the parent hands control to that
// router — so it runs only for requests whose path matched the router's
// mount prefix.
//
// If interviewer says "explain it simply", say:
//   "app.use puts a function in the app's list. router.use puts it in the
//    router's own list. When you mount a router with app.use('/api',
//    router), the whole router becomes ONE entry in the app's list. A
//    request only ever sees the router's middleware if it first matched
//    /api and the app's walk actually reached that entry."
//
// If interviewer says "what changes inside the router?", say:
//   "req.url is rewritten. Inside a router mounted at /api, a request to
//    /api/users has req.url === '/users' — which is exactly why the router
//    can define its routes as '/users' without knowing where it's mounted.
//    req.baseUrl holds the prefix that was stripped, and req.originalUrl
//    always holds the untouched full path. On the way out of the router,
//    req.url is restored."
//
// Why it matters in interviews:
//   The rewrite is the reason routers are reusable, the reason logging
//   req.url in a router gives you the wrong path in your access logs, and
//   the reason a middleware "that definitely runs on every request" doesn't.
//   It's a one-line mechanic that explains three separate confusions.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   A ROUTER IS A SUB-STACK MOUNTED AS ONE LAYER — AND IT REWRITES req.url.
//
// Runtime rule:
//   app.use('/api', router) pushes a layer whose handler is the router. When
//   the walk reaches it and the prefix matches, the router runs its OWN
//   stack with req.url stripped of the prefix and req.baseUrl set to it.
//   When the router's stack is exhausted without a response, req.url is
//   restored and the parent's walk continues at the next layer.
//
// Practical rule:
//   Cross-cutting concerns that must apply to everything — helmet, cors,
//   request id, body parsers — go on the app, above the mounts. Concerns
//   that belong to one area — an auth guard for /admin, a tenant loader for
//   /api/v2 — go on that router. Log req.originalUrl, never req.url.
//
// Common trap:
//   Defining a router route as '/api/users' AND mounting the router at
//   '/api'. Inside the router, req.url is already '/users', so the route
//   would only match a request to /api/api/users. It silently 404s.
//
// The mental picture:
//
//   app stack                         router stack (mounted at /api)
//   ─────────                         ──────────────────────────────
//   [0] helmet                        [0] router.use(authApi)
//   [1] cors                          [1] GET /users
//   [2] logger                        [2] GET /orders
//   [3] ROUTER ──────────────────────▶[3] router.use(err…)   4 args
//   [4] GET /health
//   [5] app.use(err…)   4 args
//
//   Layer [3] of the app IS the entire right-hand column. A request to
//   /health never sees any of it. A request to /api/users sees the whole
//   left column down to [3], then the whole right column.


// ══════════════════════════════════════════════════════════════════
// § 3 — ONE DISPATCHER, USED FOR BOTH
// ══════════════════════════════════════════════════════════════════
//
// The punchline of the implementation: an app and a router are the SAME
// object. The only difference is that the app is the one nobody mounted, so
// it supplies the final "nothing answered" behaviour.

function createRouter() {
  const stack = [];

  function pathMatches(layer, urlPath) {
    if (layer.method) return layer.path === urlPath;
    if (layer.path === "/") return true;
    return urlPath === layer.path || urlPath.startsWith(layer.path + "/");
  }

  function stripPrefix(url, prefix) {
    if (prefix === "/") return url;
    const rest = url.slice(prefix.length);
    return rest.startsWith("/") ? rest : "/" + rest;
  }

  const router = {
    stack,

    use(path, ...fns) {
      if (typeof path !== "string") { fns.unshift(path); path = "/"; }
      for (const fn of fns) stack.push({ method: null, path, handler: fn });
      return router;
    },
    get(path, fn)  { stack.push({ method: "GET",  path, handler: fn }); return router; },
    post(path, fn) { stack.push({ method: "POST", path, handler: fn }); return router; },

    // `out` is the parent's next(). A router that answers nothing simply
    // calls it — that is the fallthrough behaviour proven in §7.
    handle(req, res, out) {
      let i = 0;

      function next(err) {
        const layer = stack[i++];
        if (!layer) return out(err);              // hand control back UP

        const isSubRouter = typeof layer.handler.handle === "function";
        const isErrorLayer = !isSubRouter && layer.handler.length === 4;

        if (err && !isErrorLayer) return next(err);
        if (!err && isErrorLayer) return next();
        if (layer.method && layer.method !== req.method) return next(err);

        const urlPath = req.url.split("?")[0];
        if (!pathMatches(layer, urlPath)) return next(err);

        if (isSubRouter) {
          // ───── THE MOUNT MECHANIC — the whole topic of this file ─────
          const savedUrl = req.url;
          const savedBase = req.baseUrl;
          req.baseUrl = (savedBase === "/" ? "" : savedBase) + (layer.path === "/" ? "" : layer.path);
          req.url = stripPrefix(req.url, layer.path);

          return layer.handler.handle(req, res, (subErr) => {
            req.url = savedUrl;                   // …and restored on the way out
            req.baseUrl = savedBase;
            next(subErr);
          });
          // ─────────────────────────────────────────────────────────────
        }

        try {
          if (err) layer.handler(err, req, res, next);
          else layer.handler(req, res, next);
        } catch (thrown) {
          next(thrown);
        }
      }

      next();
    },
  };

  return router;
}

function miniExpress() {
  const app = createRouter();

  app.listen = () => new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      req.originalUrl = req.url;                  // set ONCE, never rewritten
      req.baseUrl = "";
      app.handle(req, res, (err) => {             // the app's final `out`
        if (res.writableEnded) return;
        if (err) {
          res.statusCode = err.status || 500;
          res.setHeader("x-handled-by", "app-default");
          return res.end("DEFAULT: " + err.message);
        }
        res.statusCode = 404;
        res.end("Cannot " + req.method + " " + req.originalUrl);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });

  return app;
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
// § 4 — THE REWRITE: req.url vs req.baseUrl vs req.originalUrl
// ══════════════════════════════════════════════════════════════════
//
// ONE router object. TWO mount points. The same handler, unchanged, serving
// both — which is only possible because it never sees the prefix.

async function section4() {
  console.log("\n══ § 4 — mounting rewrites req.url ══\n");

  const users = createRouter();
  users.get("/list", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      url: req.url,                 // rewritten — what the router sees
      baseUrl: req.baseUrl,         // the prefix that was stripped
      originalUrl: req.originalUrl, // never touched
    }));
  });

  const app = miniExpress();
  app.use("/api", users);           // mount #1
  app.use("/v2", users);            // mount #2 — the SAME router object
  app.get("/list", (req, res) => res.end("app-level /list, not the router"));

  const { server, port } = await app.listen();
  const api = JSON.parse((await request(port, "/api/list")).body);
  const v2  = JSON.parse((await request(port, "/v2/list")).body);
  const top = await request(port, "/list");
  server.close();

  results.mountApi = api;
  results.mountV2 = v2;
  results.topLevelBody = top.body;
  results.sameRouterTwoMounts = api.url === v2.url && api.originalUrl !== v2.originalUrl;

  console.log("  GET /api/list  →", JSON.stringify(api));
  console.log("  GET /v2/list   →", JSON.stringify(v2));
  console.log("  GET /list      →", JSON.stringify(top.body));
  console.log("\n  Same router, same handler, two prefixes. req.url is IDENTICAL in");
  console.log("  both ('" + api.url + "') and req.originalUrl differs. That is the");
  console.log("  entire reason a router is reusable: it never learns where it lives.");
  console.log("\n  Consequences worth stating out loud in an interview:");
  console.log("   • A logger inside a router that prints req.url logs '/list' for");
  console.log("     BOTH requests — your access log loses the prefix. Log");
  console.log("     req.originalUrl.");
  console.log("   • Defining the route as '/api/list' inside a router mounted at");
  console.log("     '/api' would need /api/api/list to match. Silent 404.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — SCOPE: WHO RUNS FOR WHICH REQUEST
// ══════════════════════════════════════════════════════════════════

async function section5() {
  console.log("\n══ § 5 — application-level vs router-level scope ══\n");

  const hits = { app: 0, adminRouter: 0, apiRouter: 0 };

  const adminRouter = createRouter();
  adminRouter.use((req, res, next) => { hits.adminRouter++; next(); });
  adminRouter.get("/dashboard", (req, res) => res.end("admin dashboard"));

  const apiRouter = createRouter();
  apiRouter.use((req, res, next) => { hits.apiRouter++; next(); });
  apiRouter.get("/users", (req, res) => res.end("api users"));

  const app = miniExpress();
  app.use((req, res, next) => { hits.app++; next(); });      // application-level
  app.use("/admin", adminRouter);
  app.use("/api", apiRouter);
  app.get("/health", (req, res) => res.end("ok"));

  const { server, port } = await app.listen();

  const table = [];
  for (const p of ["/health", "/admin/dashboard", "/api/users", "/nothing"]) {
    const before = { ...hits };
    const r = await request(port, p);
    table.push({
      path: p,
      status: r.status,
      app: hits.app - before.app,
      admin: hits.adminRouter - before.adminRouter,
      api: hits.apiRouter - before.apiRouter,
    });
  }
  server.close();

  results.scopeTable = table;
  results.scopeTotals = { ...hits };

  console.log("  path              status   app.use   admin.use   api.use");
  console.log("  ─────────────────────────────────────────────────────────");
  for (const row of table) {
    console.log(
      "  " + row.path.padEnd(18) + String(row.status).padEnd(9) +
      String(row.app).padEnd(10) + String(row.admin).padEnd(12) + row.api
    );
  }
  console.log("\n  The app-level middleware ran 4/4 — including the request that 404'd,");
  console.log("  because it is above everything and the walk always reaches it.");
  console.log("  Each router's middleware ran 1/4 — only for requests that entered");
  console.log("  that router. Nothing 'registers' a router middleware globally; the");
  console.log("  parent simply never hands control to a router whose prefix missed.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — ERROR HANDLERS ARE SCOPED TOO
// ══════════════════════════════════════════════════════════════════
//
// 03 established that error handlers are positional. Add depth and a second
// rule appears: a router's error handler sees only errors raised inside that
// router — and once it responds, the parent's error handler never runs.

async function section6() {
  console.log("\n══ § 6 — a router's error handler is a boundary ══\n");

  const hits = { paymentsErr: 0, appErr: 0 };

  const payments = createRouter();
  payments.get("/charge", () => { const e = new Error("card declined"); e.status = 402; throw e; });
  payments.use((err, req, res, next) => {
    hits.paymentsErr++;
    res.statusCode = err.status || 500;
    res.setHeader("x-handled-by", "payments-router");
    res.end(JSON.stringify({ scope: "payments", message: err.message }));
  });

  const reports = createRouter();
  reports.get("/monthly", () => { throw new Error("report generator offline"); });
  // NOTE: no error handler in this router — errors escape UPWARD.

  const app = miniExpress();
  app.use("/payments", payments);
  app.use("/reports", reports);
  app.get("/crash", () => { throw new Error("top-level crash"); });
  app.use((err, req, res, next) => {
    hits.appErr++;
    res.statusCode = err.status || 500;
    res.setHeader("x-handled-by", "app-error-handler");
    res.end(JSON.stringify({ scope: "app", message: err.message }));
  });

  const { server, port } = await app.listen();
  const charge  = await request(port, "/payments/charge");
  const monthly = await request(port, "/reports/monthly");
  const crash   = await request(port, "/crash");
  server.close();

  results.errScope = {
    charge: { status: charge.status, by: charge.headers["x-handled-by"] },
    monthly: { status: monthly.status, by: monthly.headers["x-handled-by"] },
    crash: { status: crash.status, by: crash.headers["x-handled-by"] },
  };
  results.errScopeHits = { ...hits };

  console.log("  GET /payments/charge →", charge.status, "handled by:", charge.headers["x-handled-by"]);
  console.log("  GET /reports/monthly →", monthly.status, "handled by:", monthly.headers["x-handled-by"]);
  console.log("  GET /crash           →", crash.status, "handled by:", crash.headers["x-handled-by"]);
  console.log("\n  payments error handler invocations:", hits.paymentsErr);
  console.log("  app error handler invocations      :", hits.appErr, "(the two that had nowhere else to go)");
  console.log("\n  Three rules in one table:");
  console.log("   • an error inside a router goes to that router's handler first");
  console.log("   • a router with no error handler lets the error travel UP to the parent");
  console.log("   • a router's error handler never sees errors from OUTSIDE it");
  console.log("\n  So the app-level handler is a safety net, not a duplicate. Keep it");
  console.log("  even when every router has its own — /crash proves why.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — FALLTHROUGH: A ROUTER IS NOT A DEAD END
// ══════════════════════════════════════════════════════════════════
//
// A common wrong assumption: "the request matched /api, so if the router has
// no matching route it's a 404." No. The router exhausts its stack, restores
// req.url, and calls the parent's next(). The rest of the app still gets a
// turn — which is how two routers can share a prefix.

async function section7() {
  console.log("\n══ § 7 — an unmatched router hands control back ══\n");

  const trace = [];

  const v1 = createRouter();
  v1.use((req, res, next) => { trace.push("v1.use(url=" + req.url + ")"); next(); });
  v1.get("/users", (req, res) => { trace.push("v1 /users"); res.end("v1 users"); });

  const v2 = createRouter();
  v2.use((req, res, next) => { trace.push("v2.use(url=" + req.url + ")"); next(); });
  v2.get("/orders", (req, res) => { trace.push("v2 /orders"); res.end("v2 orders"); });

  const app = miniExpress();
  app.use("/api", v1);
  app.use("/api", v2);                      // SAME prefix, second router
  app.use((req, res, next) => {
    trace.push("after-mounts(url=" + req.url + ", original=" + req.originalUrl + ")");
    next();
  });

  const { server, port } = await app.listen();

  trace.length = 0;
  const orders = await request(port, "/api/orders");
  const ordersTrace = trace.slice();

  trace.length = 0;
  const missing = await request(port, "/api/nothing");
  const missingTrace = trace.slice();

  server.close();

  results.fallthroughOrdersBody = orders.body;
  results.fallthroughOrdersTrace = ordersTrace;
  results.fallthroughMissingStatus = missing.status;
  results.fallthroughMissingBody = missing.body;
  results.fallthroughRestored = missingTrace.some((t) => t.startsWith("after-mounts(url=/api/nothing"));

  console.log("  GET /api/orders →", orders.status, JSON.stringify(orders.body));
  console.log("    trace:", ordersTrace.join("  →  "));
  console.log("\n  GET /api/nothing →", missing.status, JSON.stringify(missing.body));
  console.log("    trace:", missingTrace.join("  →  "));
  console.log("\n  Two things to notice in the second trace:");
  console.log("   1. BOTH routers ran their middleware. v1's prefix matched, its routes");
  console.log("      didn't, and it handed control back — that is how /api/orders");
  console.log("      reaches v2 at all.");
  console.log("   2. req.url is '/api/nothing' again by the time the app-level");
  console.log("      middleware runs. The rewrite was undone on the way out.");
  console.log("\n  Cost worth knowing: mounting five routers at the same prefix means");
  console.log("  every miss runs all five routers' middleware before the 404.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — The doubled prefix: router.get('/api/users') in a router mounted
//   at '/api'. Needs /api/api/users. Silent 404. → §4
//
// Bug 2 — Access logs missing the prefix: a logger inside a router printing
//   req.url instead of req.originalUrl. Every /api/users and /v2/users
//   entry reads '/users'. → §4
//
// Bug 3 — "My auth middleware doesn't protect the admin routes."
//   It was added with adminRouter.use() but the routes live on a different
//   router, or it was added after the mount. → §5
//
// Bug 4 — "The app error handler stopped running."
//   A router grew its own error handler, which now claims errors that used
//   to bubble up — including ones it doesn't actually understand. → §6
//
// Bug 5 — Errors escaping a router with no handler and hitting a generic
//   500, losing the domain-specific status the router would have set. → §6
//
// Bug 6 — Assuming a matched prefix means the router owns the request, then
//   being surprised that a later app-level route answered it. → §7
//
// Bug 7 — Mounting many routers on one prefix and paying every router's
//   middleware cost on every miss. → §7
//
// Bug 8 — Reading req.baseUrl at app level (it is '') or req.url inside a
//   deeply nested router and building a link from it. Build links from
//   req.originalUrl or from a configured base.


// ══════════════════════════════════════════════════════════════════
// § 9 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 9 — assertions ══\n");

  // § 4 — the rewrite:
  assert.deepEqual(results.mountApi, { url: "/list", baseUrl: "/api", originalUrl: "/api/list" },
    "inside the router req.url was stripped to '/list', baseUrl held '/api', originalUrl was intact ✅");
  assert.deepEqual(results.mountV2, { url: "/list", baseUrl: "/v2", originalUrl: "/v2/list" },
    "…and the SAME router mounted at /v2 saw the identical req.url");
  assert.equal(results.sameRouterTwoMounts, true,
    "one router object served two prefixes because it never sees its own mount path ✅");
  assert.equal(results.topLevelBody, "app-level /list, not the router",
    "an app-level route with the same name was unaffected by the mounts");

  // § 5 — scope:
  const byPath = Object.fromEntries(results.scopeTable.map((r) => [r.path, r]));
  assert.equal(byPath["/health"].app, 1, "app-level middleware ran for /health");
  assert.equal(byPath["/health"].admin, 0, "…and no router middleware did");
  assert.equal(byPath["/admin/dashboard"].admin, 1, "the admin router's middleware ran for /admin/dashboard ✅");
  assert.equal(byPath["/admin/dashboard"].api, 0, "…and the api router's did not");
  assert.equal(byPath["/api/users"].api, 1);
  assert.equal(byPath["/nothing"].app, 1,
    "app-level middleware ran even for the request that ended in a 404");
  assert.equal(byPath["/nothing"].admin + byPath["/nothing"].api, 0,
    "…while neither router was entered at all");
  assert.deepEqual(results.scopeTotals, { app: 4, adminRouter: 1, apiRouter: 1 },
    "4 requests: app middleware 4 hits, each router exactly 1 ✅");

  // § 6 — error scope:
  assert.deepEqual(results.errScope.charge, { status: 402, by: "payments-router" },
    "an error raised inside the payments router was claimed by the payments router's handler ✅");
  assert.deepEqual(results.errScope.monthly, { status: 500, by: "app-error-handler" },
    "…a router with NO error handler let its error travel up to the app's ✅");
  assert.deepEqual(results.errScope.crash, { status: 500, by: "app-error-handler" },
    "…and an error outside every router never touched the router handlers");
  assert.deepEqual(results.errScopeHits, { paymentsErr: 1, appErr: 2 },
    "hit counts confirm the boundary: 1 handled locally, 2 handled at app level");

  // § 7 — fallthrough:
  assert.equal(results.fallthroughOrdersBody, "v2 orders");
  assert.deepEqual(results.fallthroughOrdersTrace,
    ["v1.use(url=/orders)", "v2.use(url=/orders)", "v2 /orders"],
    "v1 matched the prefix, found no route, and handed control back so v2 could answer ✅");
  assert.equal(results.fallthroughMissingStatus, 404,
    "…and when neither router matched, the 404 came from the APP, not from a router");
  assert.equal(results.fallthroughMissingBody, "Cannot GET /api/nothing",
    "…with the original URL, because the rewrite was undone on the way out");
  assert.equal(results.fallthroughRestored, true,
    "req.url was restored to '/api/nothing' before the app-level middleware ran ✅");

  console.log("§9 — mini assertions passed for: Router vs Application middleware");
  console.log("\n  The pair that captures it: one router object mounted at /api and /v2");
  console.log("  saw req.url === '/list' both times — and a request that matched /api");
  console.log("  but no route inside still came back out with req.url restored.");
}


// ══════════════════════════════════════════════════════════════════
// § 10 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what's the difference between application-level and
// router-level middleware?", answer:
//
//   "They're the same kind of function in different stacks. app.use pushes
//    onto the application's stack; router.use pushes onto that router's own
//    stack. Mounting with app.use('/api', router) inserts the entire router
//    as a SINGLE layer of the app's stack — so an app isn't one array, it's
//    a tree of arrays.
//
//    The mechanic that makes it work is the URL rewrite. Entering a router
//    mounted at /api, Express strips the prefix: req.url becomes '/users'
//    for a request to /api/users, req.baseUrl holds '/api', and
//    req.originalUrl keeps the full path. On the way out it's restored. I
//    can demonstrate that by mounting one router object at two prefixes at
//    once — the handler sees the identical req.url both times, which is
//    exactly why routers are reusable. It also explains two bugs: defining a
//    route as '/api/users' inside a router mounted at '/api' silently needs
//    /api/api/users, and logging req.url inside a router strips the prefix
//    out of your access logs, so you log req.originalUrl instead.
//
//    Scope follows from that structure. Application middleware runs for
//    every request that reaches it, including ones that end in a 404. Router
//    middleware only runs for requests that entered the router — so it isn't
//    'global with a filter', the parent just never hands control over.
//
//    Error handlers are scoped the same way: an error thrown inside a router
//    goes to that router's error handler first, and if the router doesn't
//    have one it travels up to the app's. I keep an app-level handler even
//    when routers have their own, because errors raised outside every router
//    have nowhere else to go.
//
//    Last thing people get wrong: a router isn't a dead end. If the prefix
//    matched but no route inside did, the router exhausts its stack and
//    calls the parent's next — so a second router on the same prefix still
//    gets its turn, and the 404 comes from the app. That's also a cost:
//    every miss on a shared prefix runs every mounted router's middleware."
//
// The URL rewrite is the detail that separates people who use routers from
// people who understand them. Lead with it.


// ══════════════════════════════════════════════════════════════════
// § 11 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does app.use('/api', router) actually do?
// A1. Pushes ONE layer whose handler is the router's sub-stack.
//
// Q2. What is req.url inside a router mounted at /api, for /api/users?
// A2. '/users'. baseUrl is '/api', originalUrl is '/api/users' (§4).
//
// Q3. Is the rewrite permanent?
// A3. No — restored when the router hands control back (§7).
//
// Q4. Which one should you log?
// A4. req.originalUrl. req.url lies inside every router (§4).
//
// Q5. Can one router be mounted twice?
// A5. Yes, proven in §4 — it never learns its own prefix.
//
// Q6. Does router middleware run for a request that misses the prefix?
// A6. No. It is never entered (§5).
//
// Q7. Does app-level middleware run for a request that 404s?
// A7. Yes, if it is registered above the point of failure (§5).
//
// Q8. Where does an error thrown in a router go?
// A8. That router's error handler; if it has none, upward to the parent's
//     (§6).
//
// Q9. Can a router's error handler catch an error from outside it?
// A9. No. It is a boundary in both directions (§6).
//
// Q10. What happens if a router's prefix matched but no route did?
// A10. Fallthrough: the parent's walk resumes at the next layer (§7).
//
// Q11. Two routers mounted on the same prefix — legal?
// A11. Yes, and useful for splitting a large API. The cost is that a miss
//      runs both routers' middleware (§7).
//
// Q12. How deep can this nest?
// A12. Arbitrarily — a router can mount a router. baseUrl accumulates the
//      prefixes; the implementation in §3 concatenates them.
//
// Q13. When would you NOT reach for a router?
// A13. When the grouping is purely cosmetic. A router adds a real dispatch
//      layer and a rewrite; for three routes it's overhead and one more
//      place a middleware can be in the wrong stack.
//
// Q14. What's mergeParams for?
// A14. Params captured by the mount path aren't visible in a child router
//      unless it opts in → 05_express-router.js §6.


// ══════════════════════════════════════════════════════════════════
// § 12 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: An Express app is…?
//   Back : A TREE of stacks. Each mounted router is one layer of its parent.
//
// Flashcard 2:
//   Front: req.url inside a router mounted at /api, request /api/users?
//   Back : '/users'.
//
// Flashcard 3:
//   Front: req.baseUrl / req.originalUrl there?
//   Back : '/api' / '/api/users'.
//
// Flashcard 4:
//   Front: Which URL do you log?
//   Back : originalUrl. Always.
//
// Flashcard 5:
//   Front: Router middleware scope?
//   Back : Only requests that entered the router.
//
// Flashcard 6:
//   Front: Error inside a router, router has no error handler?
//   Back : It travels up to the parent's handler.
//
// Flashcard 7:
//   Front: Prefix matched, no route inside matched?
//   Back : Fallthrough — parent's walk continues, req.url restored.
//
// Flashcard 8:
//   Front: Classic doubled-prefix bug?
//   Back : router.get('/api/users') inside app.use('/api', router).
//
// Flashcard 9:
//   Front: How do you sound senior?
//   Back : "Mounting rewrites req.url and restores it on the way out — that
//          one mechanic explains reusability, the doubled prefix, and why
//          your access logs lost the prefix."


// ══════════════════════════════════════════════════════════════════
// § 13 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Nest a router inside a router (app → /api → /v1 → users) and print
//   req.url, req.baseUrl and req.originalUrl at the deepest level. Confirm
//   baseUrl accumulated both prefixes.
//
// Task 2:
//   Add a logger at app level and an identical one inside a router, both
//   printing req.url. Run one request and see the two different values.
//   Then fix both to use req.originalUrl.
//
// Task 3:
//   Reproduce the doubled-prefix bug on purpose and prove the 404, then fix
//   it by removing the prefix from the route definition.
//
// Task 4:
//   Give §6's reports router its own error handler that maps its errors to
//   503, and prove the app-level handler's hit count drops from 2 to 1.
//
// Task 5:
//   Add a counter to §7's v1 middleware and hit /api/orders 100 times. How
//   much work does the unmatched router do? Now reorder the mounts and
//   measure again.
//
// Task 6:
//   Implement a router-level 404 (a middleware at the END of the router's
//   stack that responds) and explain what you just gave up — the
//   fallthrough that let a second router answer.
//
// Task 7:
//   Extend §3's mount code to also expose req.route-style debugging: an
//   array of every mount prefix the request passed through. That array is
//   the tree path, and it is what a good request tracer prints.


// ══════════════════════════════════════════════════════════════════
// § 14 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   A mounted router is ONE layer of its parent that contains a whole stack
//   of its own — and entering it rewrites req.url to strip the mount prefix,
//   restoring it on the way out.
//
// If you remember the common bug:
//   The doubled prefix: defining router.get('/api/users') inside a router
//   already mounted at '/api'. Silent 404, and req.originalUrl in the log
//   looks perfectly correct.
//
// If you remember the professional framing:
//   Cross-cutting concerns on the app above the mounts; area concerns on the
//   router; an app-level error handler kept as the safety net even when
//   routers have their own; log req.originalUrl.
//
// ─────────────────────────────────────────────────────────────────
// This file used routers as a structural mechanism and built the crudest
// possible one. The next file is about the actual express.Router() API — the
// options it takes, route chaining, router-level param handling, and the
// mergeParams switch that §11 Q14 deferred.
//
// NEXT TOPIC -> 05_express-router.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  assertions();
})();
