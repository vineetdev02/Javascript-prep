// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  05_express-router.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: express.Router()
//
// WHAT YOU WILL MASTER HERE:
//   1. What express.Router() actually returns — a function that is also an
//      object, which is why `module.exports = router` and app.use(router)
//      both just work
//   2. Router({ strict, caseSensitive }) proven with a 4×2 request table:
//      /users vs /users/ vs /Users under each setting
//   3. router.route(path) — one Layer, many methods — and why that is not
//      the same as calling router.get() three times
//   4. What happens on a method miss, and how you turn it into a real 405
//      with an Allow header
//   5. mergeParams: the parent's :tenantId is INVISIBLE in a child router
//      until you opt in — proven with the same router twice, one flag apart
//   6. router.param(): a hook that runs once per request per param value,
//      before every handler for that route, and can end the request early
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/05_express-router.js"
//
// Prerequisites: 04_router-vs-application-middleware.js — the whole file,
// but especially §3 (a router is a sub-stack mounted as one layer) and §4
// (mounting rewrites req.url). 04 built the crudest router that could
// demonstrate mounting. This file builds the real API around it.


const http = require("http");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// express.Router():
// a factory returning an isolated, mountable mini-application — its own
// middleware stack, its own routes, its own error handlers — which is itself
// a valid (req, res, next) middleware, so it can be mounted anywhere a
// middleware can go, including inside another router.
//
// If interviewer says "explain it simply", say:
//   "It's a mini app you can hand around. It has use(), get(), post(),
//    param() and its own error handling, and because the thing it returns is
//    a function with the middleware signature, mounting it is just
//    app.use('/api', router) — the same call you'd use for any middleware.
//    That's the whole design: a router is not a special kind of object the
//    app knows about, it's a middleware that happens to contain a stack."
//
// If interviewer says "why bother?", say:
//   "Three things. Modularity: one file per resource, exported as a router.
//    Scoping: middleware that should only apply to /admin lives on the admin
//    router instead of being a global with an if-statement. And mount
//    independence: the router defines '/users', not '/api/v1/users', so the
//    prefix is decided once, at the mount, and versioning becomes a
//    one-line change."
//
// Why it matters in interviews:
//   Router options (strict, caseSensitive) and mergeParams are the two parts
//   people have never read, and both cause bugs that look like framework
//   misbehaviour: a URL that 404s only with a trailing slash, and a
//   req.params that is mysteriously empty.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   A ROUTER IS A MIDDLEWARE THAT CONTAINS A STACK. NOTHING MORE.
//
// Runtime rule:
//   Router() creates a stack plus a dispatch function. router.get(path, fn)
//   is sugar for router.route(path).get(fn) — routes are Layers wrapping a
//   Route object, and the Route holds a per-method handler list. Path
//   matching happens once per Layer; the method check happens inside.
//
// Practical rule:
//   One router per resource, in its own file, exporting the router. Define
//   paths WITHOUT the mount prefix. Put resource-wide middleware at the top
//   of the router file, an error handler at the bottom if the resource has
//   its own error vocabulary, and mount everything in one place.
//
// Common trap:
//   Assuming a child router sees the params captured by its mount path.
//   It does not, unless it was created with { mergeParams: true } — and the
//   symptom is `undefined`, never an error.
//
// The mental picture:
//
//   Router()
//     ├── stack: [ Layer(use), Layer(route '/'), Layer(route '/:id'), … ]
//     ├── params: { id: [fn] }          ← router.param() hooks
//     └── (req, res, next) ────────────▶ walks its own stack, calls next()
//                                        (the PARENT's next) when exhausted
//
//   Layer(route '/:id')
//     └── Route
//          ├── GET    → [handler]
//          ├── PUT    → [auth, handler]
//          └── DELETE → [auth, handler]
//        one path match, then a method lookup


// ══════════════════════════════════════════════════════════════════
// § 3 — BUILDING THE REAL SHAPE: Layer, Route, Router
// ══════════════════════════════════════════════════════════════════
//
// This is the implementation the rest of the file measures. Three concepts,
// exactly as Express names them:
//   Layer  — a path matcher plus one handler (a fn, a Route, or a Router)
//   Route  — a per-method handler table for ONE path
//   Router — a stack of Layers, plus param hooks

function makeMatcher(path, { end, strict = false, caseSensitive = false }) {
  if (!end && path === "/") return () => ({ params: {}, matched: "" });

  const keys = [];
  const segments = path.split("/").filter(Boolean).map((seg) => {
    if (seg[0] === ":") { keys.push(seg.slice(1)); return "([^/]+)"; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });

  let source = "^/" + segments.join("/");
  if (end) source += strict ? "$" : "/?$";       // ← strict routing lives here
  else source += "(?=/|$)";

  const re = new RegExp(source, caseSensitive ? "" : "i");   // ← caseSensitive here

  return (urlPath) => {
    const m = re.exec(urlPath);
    if (!m) return null;
    const params = {};
    keys.forEach((k, idx) => { params[k] = decodeURIComponent(m[idx + 1]); });
    return { params, matched: m[0] };
  };
}

function createRoute(path) {
  const methods = {};                             // { GET: [fn, …], … }
  const route = {
    path,
    methods,
    all(...fns) { (methods.ALL ||= []).push(...fns); return route; },
  };
  for (const verb of ["get", "post", "put", "patch", "delete"]) {
    route[verb] = (...fns) => {
      (methods[verb.toUpperCase()] ||= []).push(...fns);
      return route;                               // ← chaining
    };
  }
  route.dispatch = (req, res, next) => {
    const fns = methods[req.method] || methods.ALL;
    if (!fns) return next();                      // method miss → fall through (§5)
    let i = 0;
    (function step(err) {
      if (err) return next(err);
      const fn = fns[i++];
      if (!fn) return next();
      try { fn(req, res, step); } catch (thrown) { next(thrown); }
    })();
  };
  return route;
}

function Router(options = {}) {
  const { strict = false, caseSensitive = false, mergeParams = false } = options;
  const stack = [];
  const paramHooks = {};                          // { id: [fn, …] }

  const router = function (req, res, next) {      // ← a Router IS a middleware
    router.handle(req, res, next, {});
  };

  router.stack = stack;
  router.mergeParams = mergeParams;
  router.options = { strict, caseSensitive, mergeParams };

  router.use = function (path, ...fns) {
    if (typeof path !== "string") { fns.unshift(path); path = "/"; }
    for (const fn of fns) {
      stack.push({
        kind: fn && typeof fn.handle === "function" ? "router" : "fn",
        handler: fn,
        match: makeMatcher(path, { end: false, strict, caseSensitive }),
        mountPath: path,
      });
    }
    return router;
  };

  router.route = function (path) {
    const route = createRoute(path);
    stack.push({
      kind: "route",
      route,
      match: makeMatcher(path, { end: true, strict, caseSensitive }),
      mountPath: path,
    });
    return route;
  };

  for (const verb of ["get", "post", "put", "patch", "delete"]) {
    router[verb] = (path, ...fns) => { router.route(path)[verb](...fns); return router; };
  }

  router.param = function (name, fn) {
    (paramHooks[name] ||= []).push(fn);
    return router;
  };

  function runParamHooks(req, res, names, done) {
    let i = 0;
    (function nextParam(err) {
      if (err) return done(err);
      const name = names[i++];
      if (!name) return done();
      const fns = paramHooks[name];
      if (!fns) return nextParam();
      const seenKey = name + "=" + req.params[name];
      req._paramsSeen ||= new Set();
      if (req._paramsSeen.has(seenKey)) return nextParam();   // once per value (§7)
      req._paramsSeen.add(seenKey);
      let j = 0;
      (function nextFn(e) {
        if (e) return done(e);
        const fn = fns[j++];
        if (!fn) return nextParam();
        try { fn(req, res, nextFn, req.params[name], name); }
        catch (thrown) { done(thrown); }
      })();
    })();
  }

  router.handle = function (req, res, out, inherited) {
    let i = 0;

    function next(err) {
      const layer = stack[i++];
      if (!layer) return out(err);

      const isErrorLayer = layer.kind === "fn" && layer.handler.length === 4;
      if (err && !isErrorLayer) return next(err);
      if (!err && isErrorLayer) return next();

      const urlPath = req.url.split("?")[0];
      const m = layer.match(urlPath);
      if (!m) return next(err);

      if (layer.kind === "router") {
        const savedUrl = req.url, savedBase = req.baseUrl, savedParams = req.params;
        req.baseUrl = savedBase + m.matched;
        req.url = urlPath.slice(m.matched.length) || "/";
        const childInherited = layer.handler.mergeParams
          ? { ...inherited, ...savedParams, ...m.params }     // ← mergeParams (§6)
          : {};
        return layer.handler.handle(req, res, (subErr) => {
          req.url = savedUrl; req.baseUrl = savedBase; req.params = savedParams;
          next(subErr);
        }, childInherited);
      }

      req.params = { ...inherited, ...m.params };

      if (layer.kind === "route") {
        return runParamHooks(req, res, Object.keys(m.params), (perr) => {
          if (perr) return next(perr);
          if (res.writableEnded) return;            // a param hook answered (§7)
          layer.route.dispatch(req, res, next);
        });
      }

      try {
        if (err) layer.handler(err, req, res, next);
        else layer.handler(req, res, next);
      } catch (thrown) { next(thrown); }
    }

    next();
  };

  return router;
}

function miniExpress(options) {
  const app = Router(options);
  app.listen = () => new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      req.originalUrl = req.url;
      req.baseUrl = "";
      req.params = {};
      app.handle(req, res, (err) => {
        if (res.writableEnded) return;
        if (err) { res.statusCode = err.status || 500; return res.end("DEFAULT: " + err.message); }
        res.statusCode = 404;
        res.end("Cannot " + req.method + " " + req.originalUrl);
      }, {});
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
// § 4 — A ROUTER IS A FUNCTION *AND* AN OBJECT
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — what Router() returns ══\n");

  const r = Router();
  r.get("/ping", (req, res) => res.end("pong"));

  results.routerTypeof = typeof r;
  results.routerArity = r.length;
  results.routerHasUse = typeof r.use === "function";
  results.routerStackSize = r.stack.length;

  console.log("  typeof Router()      :", results.routerTypeof);
  console.log("  Router().length      :", results.routerArity, "(req, res, next) — a valid middleware");
  console.log("  has .use/.get/.param :", results.routerHasUse);
  console.log("  .stack after one get :", results.routerStackSize, "layer");
  console.log("\n  That is the entire trick behind the modular pattern:");
  console.log("    // routes/users.js");
  console.log("    const router = express.Router();");
  console.log("    router.get('/', list);");
  console.log("    module.exports = router;      ← exporting a FUNCTION");
  console.log("    // app.js");
  console.log("    app.use('/users', require('./routes/users'));");
  console.log("\n  app.use() never checks 'is this a router'. It accepts a middleware,");
  console.log("  and a router satisfies that signature. Same reason a router can be");
  console.log("  mounted inside another router with no extra API.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — Router({ strict, caseSensitive })
// ══════════════════════════════════════════════════════════════════
//
// Both default to FALSE, which means /users, /users/ and /Users all hit the
// same route. That default is friendly and occasionally wrong: it makes two
// URLs for every resource, which search engines and cache keys both dislike.

async function section5() {
  console.log("\n══ § 5 — strict routing and case sensitivity ══\n");

  async function probe(options) {
    const app = miniExpress(options);
    app.get("/users", (req, res) => res.end("users"));
    const { server, port } = await app.listen();
    const out = {};
    for (const p of ["/users", "/users/", "/Users", "/USERS/"]) {
      out[p] = (await request(port, p)).status;
    }
    server.close();
    return out;
  }

  const loose  = await probe({});
  const strict = await probe({ strict: true });
  const cased  = await probe({ caseSensitive: true });
  const both   = await probe({ strict: true, caseSensitive: true });

  results.optionsTable = { loose, strict, cased, both };

  const paths = ["/users", "/users/", "/Users", "/USERS/"];
  console.log("  setting                        " + paths.map((p) => p.padEnd(9)).join(""));
  console.log("  ─────────────────────────────────────────────────────────────");
  const rows = [
    ["default (both false)", loose],
    ["strict: true", strict],
    ["caseSensitive: true", cased],
    ["strict + caseSensitive", both],
  ];
  for (const [label, row] of rows) {
    console.log("  " + label.padEnd(31) + paths.map((p) => String(row[p]).padEnd(9)).join(""));
  }

  console.log("\n  Read the first row: by default FOUR different URLs are the same");
  console.log("  resource. Every one of them is a separate cache key, a separate");
  console.log("  analytics row, and — if you ever build a URL by concatenation — a");
  console.log("  separate rate-limit bucket.");
  console.log("\n  Both options are per-router, so a strict API router can sit beside a");
  console.log("  forgiving public-pages router in the same app.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — router.route(): ONE PATH, MANY METHODS
// ══════════════════════════════════════════════════════════════════
//
// router.route('/x') returns a Route you chain methods onto. It is not
// cosmetic: it creates ONE layer, so the path is matched once instead of
// once per verb, and the Route knows which methods it supports — which is
// what makes a real 405 possible.

async function section6() {
  console.log("\n══ § 6 — route() chaining, and the method miss ══\n");

  const app = miniExpress();

  app.route("/books/:id")
    .get((req, res)  => res.end("GET book " + req.params.id))
    .put((req, res)  => res.end("PUT book " + req.params.id))
    .delete((req, res) => { res.statusCode = 204; res.end(); });

  const routeLayers = app.stack.filter((l) => l.kind === "route").length;

  // A 405 handler: same path, no method restriction, placed AFTER the route.
  // Reached only when the Route above found no handler for the method.
  app.use("/books", (req, res) => {
    res.statusCode = 405;
    res.setHeader("allow", "GET, PUT, DELETE");
    res.end("method not allowed");
  });

  const { server, port } = await app.listen();
  const get  = await request(port, "/books/7");
  const put  = await request(port, "/books/7", { method: "PUT" });
  const del  = await request(port, "/books/7", { method: "DELETE" });
  const post = await request(port, "/books/7", { method: "POST" });
  server.close();

  results.routeLayerCount = routeLayers;
  results.routeGet = get.body;
  results.routePut = put.body;
  results.routeDeleteStatus = del.status;
  results.routePostStatus = post.status;
  results.routePostAllow = post.headers["allow"];

  console.log("  layers created by ONE route('/books/:id') with 3 verbs:", routeLayers);
  console.log("    (three separate app.get/put/delete calls would create 3 layers");
  console.log("     and match the path 3 times per request)");
  console.log("\n  GET    /books/7 →", get.status, JSON.stringify(get.body));
  console.log("  PUT    /books/7 →", put.status, JSON.stringify(put.body));
  console.log("  DELETE /books/7 →", del.status, "(no body)");
  console.log("  POST   /books/7 →", post.status, JSON.stringify(post.body), " allow:", post.headers["allow"]);
  console.log("\n  Note what POST did NOT get: a 404. The path matched, the METHOD");
  console.log("  didn't, so the Route called next() and the walk continued — which is");
  console.log("  the only reason the 405 handler below it could answer. Without that");
  console.log("  handler, Express's default 404 would tell a client 'no such resource'");
  console.log("  when the truth is 'wrong verb'.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — mergeParams: THE FLAG THAT MAKES req.params EMPTY
// ══════════════════════════════════════════════════════════════════
//
// The same child router, mounted at the same param-bearing prefix, twice.
// One flag apart.

async function section7() {
  console.log("\n══ § 7 — mergeParams ══\n");

  function makeChild(mergeParams) {
    const child = Router({ mergeParams });
    child.get("/users/:userId", (req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        tenantId: req.params.tenantId ?? null,     // captured by the MOUNT path
        userId: req.params.userId ?? null,         // captured by the CHILD route
      }));
    });
    return child;
  }

  const app = miniExpress();
  app.use("/off/:tenantId", makeChild(false));
  app.use("/on/:tenantId", makeChild(true));

  const { server, port } = await app.listen();
  const off = JSON.parse((await request(port, "/off/acme/users/42")).body);
  const on  = JSON.parse((await request(port, "/on/acme/users/42")).body);
  server.close();

  results.mergeOff = off;
  results.mergeOn = on;

  console.log("  GET /off/acme/users/42  (mergeParams: false) →", JSON.stringify(off));
  console.log("  GET /on/acme/users/42   (mergeParams: true ) →", JSON.stringify(on));
  console.log("\n  Identical router code. Identical URL shape. The only difference is");
  console.log("  the flag, and with it off, tenantId is null — not an error, not a");
  console.log("  warning. A multi-tenant lookup written against that reads");
  console.log("  `Tenant.find(undefined)`, which in most ORMs means 'find anything'.");
  console.log("  That is a cross-tenant data leak caused by a missing option object.");
  console.log("\n  Rule: any router mounted on a path containing a :param needs");
  console.log("  Router({ mergeParams: true }). Write it at creation time, not when");
  console.log("  you notice it's broken.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — router.param(): THE HOOK THAT RUNS BEFORE THE HANDLERS
// ══════════════════════════════════════════════════════════════════
//
// router.param('id', fn) registers a hook that fires when a matched route
// has an :id — once per request per distinct value — before any handler for
// that route. It is the clean place to load-and-attach a resource, and to
// 404 early so no handler has to.

async function section8() {
  console.log("\n══ § 8 — router.param() ══\n");

  const DB = { 1: { id: "1", name: "ada" }, 2: { id: "2", name: "grace" } };
  const calls = [];

  const app = miniExpress();

  app.param("userId", (req, res, next, value, name) => {
    calls.push("param:" + name + "=" + value);
    const user = DB[value];
    if (!user) {
      res.statusCode = 404;
      return res.end("no user " + value);          // ends the request; handlers never run
    }
    req.user = user;                                // attach and continue
    next();
  });

  app.get("/users/:userId", (req, res) => {
    calls.push("handler:show");
    res.end("user " + req.user.name);
  });
  app.get("/users/:userId/posts", (req, res) => {
    calls.push("handler:posts");
    res.end("posts of " + req.user.name);
  });
  app.get("/health", (req, res) => { calls.push("handler:health"); res.end("ok"); });

  const { server, port } = await app.listen();

  calls.length = 0;
  const show = await request(port, "/users/1");
  const showCalls = calls.slice();

  calls.length = 0;
  const posts = await request(port, "/users/2/posts");
  const postsCalls = calls.slice();

  calls.length = 0;
  const missing = await request(port, "/users/99");
  const missingCalls = calls.slice();

  calls.length = 0;
  const health = await request(port, "/health");
  const healthCalls = calls.slice();

  server.close();

  results.paramShow = { body: show.body, calls: showCalls };
  results.paramPosts = { body: posts.body, calls: postsCalls };
  results.paramMissing = { status: missing.status, body: missing.body, calls: missingCalls };
  results.paramHealth = { calls: healthCalls };

  console.log("  GET /users/1        →", show.status, JSON.stringify(show.body));
  console.log("     order:", showCalls.join(" → "));
  console.log("  GET /users/2/posts  →", posts.status, JSON.stringify(posts.body));
  console.log("     order:", postsCalls.join(" → "));
  console.log("  GET /users/99       →", missing.status, JSON.stringify(missing.body));
  console.log("     order:", missingCalls.join(" → "), "  ← handler never ran");
  console.log("  GET /health         →", health.status, JSON.stringify(health.body));
  console.log("     order:", healthCalls.join(" → "), "  ← no :userId, hook skipped");
  console.log("\n  Two routes, one hook, zero duplicated lookup code — and the 404 for a");
  console.log("  missing resource is written once instead of at the top of every");
  console.log("  handler. This is the most under-used API on the router.");
  console.log("\n  The catch: it is router-scoped. A hook registered on the users router");
  console.log("  does not fire for a :userId matched by a different router, and it does");
  console.log("  not fire for params captured by a MOUNT path.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — req.params.tenantId is undefined in a child router. Missing
//   { mergeParams: true }. Silent, and in a multi-tenant app it is a data
//   isolation bug, not a cosmetic one. → §7
//
// Bug 2 — "/users works but /users/ 404s" (or the reverse) after someone
//   enabled strict routing for one router. → §5
//
// Bug 3 — Duplicate content: /Users and /users both serve, so caches and
//   analytics split. caseSensitive is off by default. → §5
//
// Bug 4 — A POST to a GET-only route returning 404 instead of 405, so the
//   client retries a "missing" endpoint forever. → §6
//
// Bug 5 — Three app.get/put/delete calls for one path, then someone edits
//   the path in two of the three. route() makes that impossible. → §6
//
// Bug 6 — A router.param() hook registered on the wrong router and silently
//   never firing. → §8
//
// Bug 7 — A param hook that loads from the database on EVERY request
//   including HEAD/OPTIONS probes, because nobody noticed it runs before
//   the method check inside the Route.
//
// Bug 8 — Defining router paths with the mount prefix included
//   ('/api/users' inside a router mounted at '/api'). → 04 §4
//
// Bug 9 — Mounting a router before the middleware it depends on (body
//   parser, session) is registered on the app. → 01 §4


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — what Router() is:
  assert.equal(results.routerTypeof, "function", "Router() returns a FUNCTION ✅");
  assert.equal(results.routerArity, 3, "…with the (req, res, next) middleware signature");
  assert.equal(results.routerHasUse, true, "…that also carries the router API as properties");
  assert.equal(results.routerStackSize, 1, "…and one get() produced exactly one layer");

  // § 5 — options:
  const { loose, strict, cased, both } = results.optionsTable;
  assert.deepEqual(loose, { "/users": 200, "/users/": 200, "/Users": 200, "/USERS/": 200 },
    "by DEFAULT four different URLs all hit the same route 🐛");
  assert.equal(strict["/users"], 200);
  assert.equal(strict["/users/"], 404, "strict: true made the trailing slash a different URL ✅");
  assert.equal(cased["/Users"], 404, "caseSensitive: true made /Users a different URL ✅");
  assert.equal(cased["/users/"], 200, "…while still accepting the trailing slash");
  assert.deepEqual(both, { "/users": 200, "/users/": 404, "/Users": 404, "/USERS/": 404 },
    "both options together leave exactly ONE canonical URL ✅");

  // § 6 — route() and the method miss:
  assert.equal(results.routeLayerCount, 1,
    "one route() with three verbs created ONE layer, not three ✅");
  assert.equal(results.routeGet, "GET book 7");
  assert.equal(results.routePut, "PUT book 7");
  assert.equal(results.routeDeleteStatus, 204);
  assert.equal(results.routePostStatus, 405,
    "a method miss fell THROUGH the route so a 405 handler could answer ✅");
  assert.equal(results.routePostAllow, "GET, PUT, DELETE",
    "…with a real Allow header, which a bare 404 could never carry");

  // § 7 — mergeParams:
  assert.deepEqual(results.mergeOff, { tenantId: null, userId: "42" },
    "without mergeParams the mount path's :tenantId was INVISIBLE to the child 🐛");
  assert.deepEqual(results.mergeOn, { tenantId: "acme", userId: "42" },
    "…the identical router with { mergeParams: true } saw both params ✅");

  // § 8 — router.param():
  assert.deepEqual(results.paramShow.calls, ["param:userId=1", "handler:show"],
    "the param hook ran BEFORE the handler ✅");
  assert.deepEqual(results.paramPosts.calls, ["param:userId=2", "handler:posts"],
    "…and for a different route sharing the same param, with no duplicated lookup");
  assert.equal(results.paramShow.body, "user ada", "…attaching the loaded resource to req");
  assert.equal(results.paramMissing.status, 404);
  assert.deepEqual(results.paramMissing.calls, ["param:userId=99"],
    "…and a hook that ends the response stops the handler from ever running ✅");
  assert.deepEqual(results.paramHealth.calls, ["handler:health"],
    "…while a route with no :userId skipped the hook entirely");

  console.log("§10 — mini assertions passed for: express.Router()");
  console.log("\n  The pair that captures it: the DEFAULT router answers /users, /users/,");
  console.log("  /Users and /USERS/ with 200 — and the same child router mounted twice,");
  console.log("  one mergeParams flag apart, returns tenantId 'acme' or null.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what is express.Router() and why use it?", answer:
//
//   "Router() returns a mountable mini-application: its own middleware
//    stack, its own routes, its own error handlers. The thing it actually
//    returns is a function with the (req, res, next) signature that also
//    carries the router API as properties — which is why `module.exports =
//    router` works and why app.use('/api', router) is the same call you'd
//    make for any middleware. There's no special 'router' concept in the
//    app; it's a middleware that contains a stack.
//
//    I use it for three things: one file per resource, middleware scoped to
//    an area instead of a global with an if-statement, and mount
//    independence — the router defines '/users', never '/api/v1/users', so
//    versioning is a one-line change at the mount.
//
//    Two parts of the API people miss. First the options: strict and
//    caseSensitive both default to false, which means /users, /users/,
//    /Users and /USERS/ are all the same route by default — four cache keys
//    for one resource. Second, mergeParams. A child router does NOT see
//    params captured by its mount path unless it was created with
//    mergeParams: true. I've demonstrated that with the same router mounted
//    twice, one flag apart: with it off, req.params.tenantId is undefined —
//    no error, no warning — and in a multi-tenant app a lookup on undefined
//    is a cross-tenant leak.
//
//    I also prefer router.route(path).get(…).put(…) over three separate
//    calls: it's one layer instead of three, so the path is matched once,
//    and the Route knows which methods it supports. That matters because a
//    method miss falls through rather than erroring, so without a 405
//    handler after the route a POST to a GET-only endpoint gets a 404 and
//    the client is told the resource doesn't exist when the real problem is
//    the verb.
//
//    And router.param() is the API I'd point at as under-used — a hook that
//    fires before every handler for a route carrying that param, which is
//    where I load the resource, attach it to req, and 404 once instead of at
//    the top of every handler."
//
// mergeParams and the strict/caseSensitive table are the two things that
// make this answer sound like someone who has shipped an API.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. What does Router() return?
// A1. A function with the middleware signature, carrying the router API as
//     properties (§4).
//
// Q2. Why does `module.exports = router` work?
// A2. Because app.use() takes a middleware and a router is one.
//
// Q3. What are the Router options?
// A3. strict, caseSensitive, mergeParams — all false by default (§5, §7).
//
// Q4. Default behaviour for /users vs /users/?
// A4. Both match. strict: true separates them (§5).
//
// Q5. What is mergeParams for?
// A5. Letting a child router see params captured by its mount path (§7).
//
// Q6. Symptom of forgetting it?
// A6. req.params.x is undefined. No error. Dangerous in multi-tenant code.
//
// Q7. router.route() vs three router.get/put/delete calls?
// A7. One layer vs three; path matched once; the Route holds the method
//     table, which is what makes a proper 405 with Allow possible (§6).
//
// Q8. What happens on a method miss?
// A8. The Route calls next() — fallthrough, not an error. You get a 404
//     unless you add a 405 handler after the route (§6).
//
// Q9. When does router.param() fire?
// A9. When a matched route carries that param, before the route's handlers,
//     once per distinct value per request (§8).
//
// Q10. Does router.param() fire for params in a MOUNT path?
// A10. No — those belong to the parent. This is the same boundary
//      mergeParams exists to cross.
//
// Q11. Can a router be mounted in more than one place?
// A11. Yes — proven in 04 §4. It never learns its own prefix.
//
// Q12. Can a router have its own error handler?
// A12. Yes, and it forms a boundary → 04 §6.
//
// Q13. app.route() vs router.route()?
// A13. Identical — an app IS a router with a final fallback attached.
//
// Q14. What is a Layer vs a Route in Express's own source?
// A14. A Layer is a matcher plus one handler; a Route is a per-method
//      handler table. Route layers wrap a Route; use() layers wrap a plain
//      function or another router (§3).
//
// Q15. Performance cost of many routers?
// A15. Each mounted router whose prefix matches runs its own stack, and a
//      miss costs every mounted router's middleware → 04 §7. Ordering hot
//      paths first is a real optimisation on large APIs.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is a Router, structurally?
//   Back : A middleware function that contains its own stack.
//
// Flashcard 2:
//   Front: Router() options?
//   Back : strict, caseSensitive, mergeParams — all default false.
//
// Flashcard 3:
//   Front: Default: how many URLs hit /users?
//   Back : /users, /users/, /Users, /USERS/ — all of them.
//
// Flashcard 4:
//   Front: Child router, parent's :tenantId?
//   Back : Invisible unless Router({ mergeParams: true }).
//
// Flashcard 5:
//   Front: route('/x').get().put() vs get('/x') + put('/x')?
//   Back : One layer, one path match, and a real method table.
//
// Flashcard 6:
//   Front: POST to a GET-only route?
//   Back : Falls through → 404, unless you add a 405 handler after it.
//
// Flashcard 7:
//   Front: When does router.param() run?
//   Back : Before the route's handlers, once per distinct value.
//
// Flashcard 8:
//   Front: Layer vs Route?
//   Back : Layer = matcher + handler. Route = per-method handler table.
//
// Flashcard 9:
//   Front: How do you sound senior?
//   Back : "mergeParams is off by default — in a multi-tenant API that
//          turns a missing option into a cross-tenant lookup on undefined."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Build routes/users.js and routes/orders.js as separate router modules,
//   require them in one app file, and mount both. Then change the API
//   version prefix by editing only the mount lines.
//
// Task 2:
//   Add a canonical-URL redirect middleware: if strict routing is on and the
//   path ends with '/', 301 to the version without it. Prove the 301 and
//   the Location header.
//
// Task 3:
//   Turn §6's 405 handler into a generic one that reads the Route's method
//   table (app.stack) instead of a hard-coded Allow string.
//
// Task 4:
//   Reproduce §7 with a real "tenant" object per request and write the
//   assertion that would have caught the mergeParams bug in CI.
//
// Task 5:
//   Add a second param hook for the same name and prove both run in
//   registration order for one request.
//
// Task 6:
//   Make a param hook async (await a fake DB) and confirm the handler still
//   waits. Then make it reject and observe what 02 §8 predicted.
//
// Task 7:
//   Count path-match operations per request for route() vs three separate
//   verb registrations, by instrumenting makeMatcher. Confirm 1 vs 3.
//
// Task 8:
//   Nest a mergeParams router inside another mergeParams router and print
//   req.params at the deepest handler. Which parent's params win on a name
//   collision, and why is a name collision a design smell?


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   express.Router() returns a MIDDLEWARE that contains a stack — which is
//   why mounting, exporting and nesting all work with no special API.
//
// If you remember the common bug:
//   mergeParams defaults to false, so a child router mounted at
//   '/tenant/:tenantId' sees req.params.tenantId as undefined — silently.
//
// If you remember the professional framing:
//   One router per resource, paths defined without the mount prefix, options
//   chosen deliberately (strict + caseSensitive for APIs), route() for
//   multi-verb paths, a 405 handler after it, and router.param() for
//   load-and-attach.
//
// ─────────────────────────────────────────────────────────────────
// Routes have been matching ':id' since §6 of this file, and req.params has
// been appearing without ever being examined. The next file is about where
// those values come from, how they differ from the ones after the '?', and
// why every single one of them is a string.
//
// NEXT TOPIC -> 06_route-params-vs-query-params.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
