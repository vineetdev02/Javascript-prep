// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  10_cors-setup.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: CORS setup
//
// WHAT YOU WILL MASTER HERE:
//   1. The fact that reframes the whole topic: CORS is enforced by the
//      BROWSER, not by your server — proven by showing the handler ran, the
//      database "write" happened, and only the READING of the response was
//      blocked
//   2. A working browser-side enforcer, so every rule below is executed
//      rather than quoted
//   3. Which requests are preflighted and which are not, as a table with an
//      OPTIONS counter behind it
//   4. The credentials rule: '*' and cookies are mutually exclusive, and the
//      browser rejects the combination outright
//   5. Vary: Origin — the one header that stops a shared cache serving one
//      origin's CORS decision to another
//   6. Allow-Headers vs Expose-Headers: why your custom request header is
//      rejected and your custom response header is invisible
//   7. Why a 500 shows up in the console as a "CORS error", and why auth
//      above the CORS middleware breaks every preflight
//   8. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/10_cors-setup.js"
//
// Prerequisites: 01_middleware-concept-and-chain.js §4 (order is the API),
// 03_error-handling-middleware-4-args.js §8 (a response that already
// started), 07_request-lifecycle.js §3 (where headers are set in the
// timeline). This is the last file in ◆ Express Deep Dive's first ten, and
// it is where "just a middleware" meets a rule your server does not enforce.


const http = require("http");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// CORS:
// a browser security mechanism in which the browser, not the server, refuses
// to let JavaScript on origin A read a response from origin B unless B's
// response carries headers explicitly permitting it — so "setting up CORS"
// means adding those headers, and answering the preflight OPTIONS request
// the browser sends first for anything non-trivial.
//
// If interviewer says "explain it simply", say:
//   "The same-origin policy stops a page on one origin from reading
//    responses from another. CORS is the opt-in: the server adds
//    Access-Control-Allow-Origin and friends to say 'this origin is allowed
//    to read me'. The critical detail is who enforces it — the browser does.
//    My server happily answers the request either way. The browser just
//    refuses to hand the response to the page."
//
// If interviewer says "so what actually gets blocked?", say:
//   "The read, not the request. For a simple request the server has already
//    received it and run the handler by the time the browser checks the
//    headers. That's why CORS is not an authorisation mechanism, and why a
//    cross-origin POST that 'failed' with a CORS error may well have
//    written a row."
//
// Why it matters in interviews:
//   Everyone can name Access-Control-Allow-Origin. The senior answer is
//   knowing that CORS is not a defence, that '*' and credentials cannot be
//   combined, that a missing Vary: Origin poisons shared caches, and that a
//   500 with no CORS headers is reported to the developer as a CORS error —
//   which sends people debugging the wrong thing for an afternoon.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   THE BROWSER ENFORCES IT. YOUR SERVER ONLY DECLARES.
//
// Runtime rule:
//   For a "simple" request the browser sends it, then checks
//   Access-Control-Allow-Origin on the response before letting the page read
//   it. For anything else it first sends an OPTIONS preflight carrying
//   Access-Control-Request-Method/-Headers, and only sends the real request
//   if the answer permits it.
//
// Practical rule:
//   cors() near the top of the stack, above auth and above your routes. An
//   allow-list of origins, never a reflected Origin with credentials. Add
//   Vary: Origin whenever the value depends on the request. Make sure error
//   responses carry the headers too.
//
// Common trap:
//   Access-Control-Allow-Origin: '*' together with credentials: include. The
//   browser rejects it — not the server. The fix is to echo the specific
//   origin and add Access-Control-Allow-Credentials: true.
//
// The mental picture:
//
//   page on https://app.example        server api.example
//   ───────────────────────────        ──────────────────
//   fetch(PUT /orders) ──── OPTIONS /orders ──────────▶
//                     ◀─── 204 + Allow-Origin/Method ──
//        browser checks the answer  ── not allowed ──▶ ✗ request never sent
//                     │ allowed
//                     ├──── PUT /orders ─────────────▶  handler RUNS
//                     ◀─── 200 + Allow-Origin ────────
//        browser checks again ── missing/mismatched ─▶ ✗ page cannot READ it
//                                                        (but the write happened)


// ══════════════════════════════════════════════════════════════════
// § 3 — A SERVER THAT DECLARES, AND A BROWSER THAT ENFORCES
// ══════════════════════════════════════════════════════════════════
//
// Node's http client does not implement the same-origin policy — nothing
// outside a browser does. So this file ships a small enforcer that applies
// the actual algorithm, and every result below is produced by running it.

const SIMPLE_METHODS = new Set(["GET", "HEAD", "POST"]);
const SIMPLE_HEADERS = new Set(["accept", "accept-language", "content-language", "content-type"]);
const SIMPLE_CONTENT_TYPES = new Set([
  "text/plain", "multipart/form-data", "application/x-www-form-urlencoded",
]);
// Response headers a page may read WITHOUT Access-Control-Expose-Headers:
const SAFELISTED_RESPONSE_HEADERS = new Set([
  "cache-control", "content-language", "content-length", "content-type", "expires",
  "last-modified", "pragma",
]);

function isSimpleRequest(method, headers) {
  if (!SIMPLE_METHODS.has(method)) return false;
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (!SIMPLE_HEADERS.has(key)) return false;
    if (key === "content-type" && !SIMPLE_CONTENT_TYPES.has(String(v).split(";")[0].trim())) return false;
  }
  return true;
}

function corsError(reason) {
  const e = new Error("CORS: " + reason);
  e.isCors = true;
  return e;
}

// The browser's check, in full.
function assertAllowed(resHeaders, origin, credentials, phase) {
  const acao = resHeaders["access-control-allow-origin"];
  if (!acao) throw corsError("no Access-Control-Allow-Origin on the " + phase + " response");
  if (credentials) {
    if (acao === "*") throw corsError("wildcard Allow-Origin is not usable with credentials");
    if (resHeaders["access-control-allow-credentials"] !== "true") {
      throw corsError("credentialed request but Allow-Credentials is not true");
    }
  }
  if (acao !== "*" && acao !== origin) throw corsError("Allow-Origin '" + acao + "' does not match '" + origin + "'");
}

async function browserFetch(port, { origin, path, method = "GET", headers = {}, credentials = false }) {
  const trace = [];
  const needsPreflight = !isSimpleRequest(method, headers);

  if (needsPreflight) {
    const pre = await raw(port, path, {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": method,
        "access-control-request-headers": Object.keys(headers).join(",") || undefined,
      },
    });
    trace.push("preflight OPTIONS → " + pre.status);
    assertAllowed(pre.headers, origin, credentials, "preflight");

    const allowedMethods = (pre.headers["access-control-allow-methods"] || "").toUpperCase();
    if (!allowedMethods.split(/,\s*/).includes(method)) throw corsError("method " + method + " not in Allow-Methods");

    const allowedHeaders = (pre.headers["access-control-allow-headers"] || "").toLowerCase().split(/,\s*/);
    for (const h of Object.keys(headers)) {
      const key = h.toLowerCase();
      if (SIMPLE_HEADERS.has(key)) continue;
      if (!allowedHeaders.includes(key) && !allowedHeaders.includes("*")) {
        throw corsError("request header '" + key + "' not in Allow-Headers");
      }
    }
  } else {
    trace.push("no preflight (simple request)");
  }

  const actual = await raw(port, path, { method, headers: { origin, ...headers } });
  trace.push("actual " + method + " → " + actual.status);
  assertAllowed(actual.headers, origin, credentials, "actual");

  const exposed = new Set(
    (actual.headers["access-control-expose-headers"] || "").toLowerCase().split(/,\s*/).filter(Boolean)
  );
  const visibleHeaders = {};
  for (const [k, v] of Object.entries(actual.headers)) {
    if (SAFELISTED_RESPONSE_HEADERS.has(k) || exposed.has(k) || exposed.has("*")) visibleHeaders[k] = v;
  }

  return { status: actual.status, body: actual.body, visibleHeaders, trace, allHeaders: actual.headers };
}

function raw(port, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const headers = {};
    for (const [k, v] of Object.entries(opts.headers || {})) if (v !== undefined) headers[k] = v;
    const req = http.request({ host: "127.0.0.1", port, path, method: opts.method || "GET", headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

// ── the server side: what cors() actually does ──
function cors(options = {}) {
  const {
    origin = "*",
    methods = "GET,HEAD,PUT,PATCH,POST,DELETE",
    allowedHeaders = null,
    exposedHeaders = null,
    credentials = false,
    maxAge = null,
  } = options;

  return function corsMiddleware(req, res, next) {
    const requestOrigin = req.headers.origin;

    let allowOrigin = null;
    if (origin === "*") allowOrigin = "*";
    else if (typeof origin === "string") allowOrigin = origin;
    else if (Array.isArray(origin)) allowOrigin = origin.includes(requestOrigin) ? requestOrigin : null;
    else if (typeof origin === "function") allowOrigin = origin(requestOrigin) ? requestOrigin : null;

    if (allowOrigin) res.setHeader("access-control-allow-origin", allowOrigin);
    if (credentials) res.setHeader("access-control-allow-credentials", "true");
    if (exposedHeaders) res.setHeader("access-control-expose-headers", exposedHeaders);

    // Whenever the header VALUE depends on the request's Origin, the response
    // is not cacheable under one key. Vary tells shared caches that (§7).
    if (origin !== "*") res.setHeader("vary", "Origin");

    if (req.method === "OPTIONS" && req.headers["access-control-request-method"]) {
      res.setHeader("access-control-allow-methods", methods);
      const requested = req.headers["access-control-request-headers"];
      if (allowedHeaders) res.setHeader("access-control-allow-headers", allowedHeaders);
      else if (requested) res.setHeader("access-control-allow-headers", requested);   // reflect
      if (maxAge !== null) res.setHeader("access-control-max-age", String(maxAge));
      res.statusCode = 204;
      return res.end();                       // preflight ends HERE — never reaches routes
    }

    next();
  };
}

function miniExpress() {
  const stack = [];
  const app = {
    use(fn) { stack.push({ fn }); return app; },
    route(method, path, fn) { stack.push({ method, path, fn }); return app; },
    listen() {
      return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          const urlPath = req.url.split("?")[0];
          let i = 0;
          (function next(err) {
            const layer = stack[i++];
            if (!layer) {
              if (res.writableEnded) return;
              res.statusCode = err ? 500 : 404;
              return res.end(err ? "server error" : "not found");
            }
            const isErr = layer.fn.length === 4;
            if (err && !isErr) return next(err);
            if (!err && isErr) return next();
            if (layer.method && (layer.method !== req.method || layer.path !== urlPath)) return next(err);
            try { err ? layer.fn(err, req, res, next) : layer.fn(req, res, next); }
            catch (e) { next(e); }
          })();
        });
        server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
      });
    },
  };
  return app;
}

const APP_ORIGIN = "https://app.example";
const EVIL_ORIGIN = "https://evil.example";


// ══════════════════════════════════════════════════════════════════
// § 4 — THE REQUEST WAS NOT BLOCKED. THE READ WAS.
// ══════════════════════════════════════════════════════════════════
//
// The most important demonstration in this file, and the one that changes
// how you think about CORS.

async function section4() {
  console.log("\n══ § 4 — what 'blocked by CORS' actually blocks ══\n");

  let handlerRuns = 0;
  const database = [];

  const app = miniExpress();
  // NOTE: no cors() at all — the server declares nothing.
  app.route("POST", "/orders", (req, res) => {
    handlerRuns++;
    database.push({ item: "laptop" });                 // a real side effect
    res.setHeader("content-type", "text/plain");
    res.end("order created");
  });

  const { server, port } = await app.listen();

  let blocked = null;
  try {
    // A SIMPLE request: POST with a safelisted content type. No preflight.
    await browserFetch(port, {
      origin: EVIL_ORIGIN, path: "/orders", method: "POST",
      headers: { "content-type": "text/plain" },
    });
  } catch (e) {
    blocked = e.message;
  }
  server.close();

  results.crossOriginBlocked = blocked;
  results.handlerRunsDespiteBlock = handlerRuns;
  results.rowsWritten = database.length;

  console.log("  a page on " + EVIL_ORIGIN + " POSTs to our API…");
  console.log("    browser reported     :", blocked);
  console.log("    handler executions   :", handlerRuns, " 🐛 it RAN");
  console.log("    rows written         :", results.rowsWritten, " 🐛 the side effect happened");
  console.log("\n  Say this sentence out loud until it is automatic: CORS did not stop");
  console.log("  the request. The request was delivered, the handler ran, the row was");
  console.log("  written. The browser then refused to let the attacking page READ the");
  console.log("  response.");
  console.log("\n  Three consequences that follow directly:");
  console.log("   • CORS is not authorisation. It protects the USER's data from a");
  console.log("     malicious page; it does not protect your API from anyone. Auth");
  console.log("     does that, and it must be enforced regardless of Origin.");
  console.log("   • This is exactly why CSRF exists as a separate problem, and why");
  console.log("     SameSite cookies and CSRF tokens are separate defences.");
  console.log("   • A non-browser client — curl, a script, another server — is not");
  console.log("     subject to any of this. There is nobody to enforce it.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — WHICH REQUESTS GET A PREFLIGHT
// ══════════════════════════════════════════════════════════════════

async function section5() {
  console.log("\n══ § 5 — simple vs preflighted ══\n");

  let optionsCount = 0;
  const app = miniExpress();
  app.use((req, res, next) => { if (req.method === "OPTIONS") optionsCount++; next(); });
  app.use(cors({ origin: [APP_ORIGIN] }));
  for (const m of ["GET", "POST", "PUT", "DELETE"]) {
    app.route(m, "/api", (req, res) => { res.setHeader("content-type", "text/plain"); res.end(m + " ok"); });
  }

  const { server, port } = await app.listen();

  const cases = [
    ["GET, no custom headers",           { method: "GET" }],
    ["POST, text/plain",                 { method: "POST", headers: { "content-type": "text/plain" } }],
    ["POST, form-urlencoded",            { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } }],
    ["POST, application/json",           { method: "POST", headers: { "content-type": "application/json" } }],
    ["GET + Authorization header",       { method: "GET", headers: { authorization: "Bearer x" } }],
    ["PUT",                              { method: "PUT" }],
    ["DELETE",                           { method: "DELETE" }],
  ];

  const table = [];
  for (const [label, opts] of cases) {
    const before = optionsCount;
    const r = await browserFetch(port, { origin: APP_ORIGIN, path: "/api", ...opts });
    table.push({ label, preflighted: optionsCount > before, status: r.status });
  }
  server.close();

  results.preflightTable = table;
  results.totalPreflights = optionsCount;

  console.log("  request                          preflight?   result");
  console.log("  ───────────────────────────────────────────────────────");
  for (const row of table) {
    console.log("  " + row.label.padEnd(33) + (row.preflighted ? "YES" : "no ").padEnd(13) + row.status);
  }
  console.log("\n  total OPTIONS requests the server saw:", optionsCount);
  console.log("\n  The rule, stated precisely: no preflight only if the method is GET,");
  console.log("  HEAD or POST **and** every header is safelisted **and** Content-Type");
  console.log("  is one of text/plain, multipart/form-data or");
  console.log("  application/x-www-form-urlencoded.");
  console.log("\n  Which means the two things every modern API does — send JSON and an");
  console.log("  Authorization header — each force a preflight on their own. A JSON API");
  console.log("  is doubling its request count unless Access-Control-Max-Age lets the");
  console.log("  browser cache the preflight (§7).");
  console.log("\n  And note the direction of the danger: a form POST from any page on the");
  console.log("  internet is a SIMPLE request. It reaches your handler with no");
  console.log("  preflight and no permission check at all (§4).");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — ORIGINS AND CREDENTIALS
// ══════════════════════════════════════════════════════════════════

async function section6() {
  console.log("\n══ § 6 — '*' and cookies cannot coexist ══\n");

  const wildcardWithCreds = miniExpress();
  wildcardWithCreds.use(cors({ origin: "*", credentials: true }));      // 🐛
  wildcardWithCreds.route("GET", "/me", (req, res) => { res.setHeader("content-type", "text/plain"); res.end("profile"); });

  const allowlist = miniExpress();
  allowlist.use(cors({ origin: [APP_ORIGIN], credentials: true }));      // ✅
  allowlist.route("GET", "/me", (req, res) => { res.setHeader("content-type", "text/plain"); res.end("profile"); });

  const reflectAll = miniExpress();
  reflectAll.use(cors({ origin: () => true, credentials: true }));       // 🐛 worst of all
  reflectAll.route("GET", "/me", (req, res) => { res.setHeader("content-type", "text/plain"); res.end("profile"); });

  const w = await wildcardWithCreds.listen();
  const a = await allowlist.listen();
  const r = await reflectAll.listen();

  const attempt = async (port, origin, credentials) => {
    try { const res = await browserFetch(port, { origin, path: "/me", credentials }); return { ok: true, body: res.body }; }
    catch (e) { return { ok: false, error: e.message }; }
  };

  results.wildcardNoCreds  = await attempt(w.port, APP_ORIGIN, false);
  results.wildcardWithCreds = await attempt(w.port, APP_ORIGIN, true);
  results.allowlistGood    = await attempt(a.port, APP_ORIGIN, true);
  results.allowlistEvil    = await attempt(a.port, EVIL_ORIGIN, true);
  results.reflectEvil      = await attempt(r.port, EVIL_ORIGIN, true);

  const varyHeader = (await raw(a.port, "/me", { headers: { origin: APP_ORIGIN } })).headers.vary;
  results.varyHeader = varyHeader;

  w.server.close(); a.server.close(); r.server.close();

  console.log("  origin:'*',   no credentials      →", JSON.stringify(results.wildcardNoCreds));
  console.log("  origin:'*',   WITH credentials    →", JSON.stringify(results.wildcardWithCreds), " 🐛");
  console.log("  allow-list,   WITH credentials    →", JSON.stringify(results.allowlistGood), " ✅");
  console.log("  allow-list,   evil origin         →", JSON.stringify(results.allowlistEvil), " ✅ rejected");
  console.log("  reflect-any,  evil origin         →", JSON.stringify(results.reflectEvil), " 🐛 accepted");
  console.log("\n  Vary header on the allow-list server:", JSON.stringify(varyHeader));
  console.log("\n  Three rules, in the order they bite:");
  console.log("   1. Allow-Origin: '*' is ignored for credentialed requests. The browser");
  console.log("      refuses the pair. You must echo the ONE origin and add");
  console.log("      Access-Control-Allow-Credentials: true.");
  console.log("   2. 'Echo whatever Origin was sent' plus credentials is not a fix, it");
  console.log("      is the vulnerability: every site on the internet becomes an allowed");
  console.log("      origin for a cookie-authenticated API. Use a real allow-list.");
  console.log("   3. Once the value depends on the request, the response is not");
  console.log("      cacheable under a single key. Without Vary: Origin a shared cache");
  console.log("      can store app.example's Allow-Origin header and hand it to");
  console.log("      evil.example — or the reverse, breaking a legitimate origin.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — ALLOW-HEADERS, EXPOSE-HEADERS, MAX-AGE
// ══════════════════════════════════════════════════════════════════
//
// Two headers that sound alike and solve opposite problems, plus the one
// that pays for the preflight.

async function section7() {
  console.log("\n══ § 7 — request headers in, response headers out ══\n");

  const strict = miniExpress();
  strict.use(cors({ origin: [APP_ORIGIN], allowedHeaders: "content-type", maxAge: 600 }));
  strict.route("GET", "/data", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.setHeader("x-total-count", "1234");            // custom RESPONSE header
    res.setHeader("x-request-id", "abc-123");
    res.end('{"ok":true}');
  });

  const open = miniExpress();
  open.use(cors({
    origin: [APP_ORIGIN],
    allowedHeaders: "content-type, x-api-key",
    exposedHeaders: "x-total-count",
    maxAge: 600,
  }));
  open.route("GET", "/data", (req, res) => {
    res.setHeader("content-type", "application/json");
    res.setHeader("x-total-count", "1234");
    res.setHeader("x-request-id", "abc-123");
    res.end('{"ok":true}');
  });

  const s = await strict.listen();
  const o = await open.listen();

  let rejectedHeader = null;
  try {
    await browserFetch(s.port, { origin: APP_ORIGIN, path: "/data", headers: { "x-api-key": "k" } });
  } catch (e) { rejectedHeader = e.message; }

  const allowedRes = await browserFetch(o.port, { origin: APP_ORIGIN, path: "/data", headers: { "x-api-key": "k" } });
  const strictRes = await browserFetch(s.port, { origin: APP_ORIGIN, path: "/data" });

  const pre = await raw(o.port, "/data", {
    method: "OPTIONS",
    headers: { origin: APP_ORIGIN, "access-control-request-method": "GET", "access-control-request-headers": "x-api-key" },
  });

  s.server.close(); o.server.close();

  results.rejectedRequestHeader = rejectedHeader;
  results.allowedRequestHeaderStatus = allowedRes.status;
  results.visibleWithoutExpose = Object.keys(strictRes.visibleHeaders).sort();
  results.visibleWithExpose = Object.keys(allowedRes.visibleHeaders).sort();
  results.maxAgeHeader = pre.headers["access-control-max-age"];

  console.log("  sending X-Api-Key, server allows only content-type:");
  console.log("    →", rejectedHeader, " ✅ preflight rejected it before the real request");
  console.log("  same request, server allows x-api-key:");
  console.log("    →", allowedRes.status, " ✅");
  console.log("\n  headers the page can READ, no Expose-Headers:", JSON.stringify(results.visibleWithoutExpose));
  console.log("  headers the page can READ, with Expose-Headers:", JSON.stringify(results.visibleWithExpose));
  console.log("  (the server sent x-total-count and x-request-id in BOTH cases)");
  console.log("\n  Access-Control-Max-Age on the preflight:", results.maxAgeHeader, "seconds");
  console.log("\n  The distinction to keep straight:");
  console.log("   • Allow-Headers  = which REQUEST headers the page may SEND.");
  console.log("     Checked at the preflight, so a missing entry means the real request");
  console.log("     is never sent at all.");
  console.log("   • Expose-Headers = which RESPONSE headers the page may READ.");
  console.log("     Everything else is delivered over the wire and hidden by the");
  console.log("     browser — which is why a pagination header 'that the server");
  console.log("     definitely sets' reads as undefined in the client.");
  console.log("   • Max-Age lets the browser skip the preflight for that many seconds,");
  console.log("     which halves the request count for a JSON API (§5). Browsers cap it");
  console.log("     well below whatever you send.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — POSITION, AND THE 500 THAT LOOKS LIKE A CORS ERROR
// ══════════════════════════════════════════════════════════════════
//
// 01 §4 said registration order is the API. Here that rule costs you an
// afternoon of debugging the wrong subsystem.

async function section8() {
  console.log("\n══ § 8 — the two ordering mistakes ══\n");

  // ❌ 1: cors() below the routes — the route answers first, with no headers.
  const late = miniExpress();
  late.route("GET", "/data", (req, res) => { res.setHeader("content-type", "text/plain"); res.end("data"); });
  late.use(cors({ origin: [APP_ORIGIN] }));

  // ❌ 2: auth above cors() — the preflight carries no credentials, ever.
  const authFirst = miniExpress();
  authFirst.use((req, res, next) => {
    if (req.headers.authorization !== "Bearer good") { res.statusCode = 401; return res.end("unauthorized"); }
    next();
  });
  authFirst.use(cors({ origin: [APP_ORIGIN] }));
  authFirst.route("PUT", "/data", (req, res) => { res.setHeader("content-type", "text/plain"); res.end("saved"); });

  // ✅ correct: cors first, then auth, then routes, and an error handler that
  //    cannot strip the CORS headers because they were set before it ran.
  const correct = miniExpress();
  correct.use(cors({ origin: [APP_ORIGIN] }));
  correct.use((req, res, next) => {
    if (req.headers.authorization !== "Bearer good") { res.statusCode = 401; return res.end("unauthorized"); }
    next();
  });
  correct.route("PUT", "/data", (req, res) => { res.setHeader("content-type", "text/plain"); res.end("saved"); });
  correct.route("GET", "/boom", () => { throw new Error("database down"); });
  correct.use((err, req, res, next) => { res.statusCode = 500; res.end("server error"); });

  // ❌ 3: the same crash on a server whose CORS headers are only added by a
  //    later middleware the error skipped.
  const brokenErrors = miniExpress();
  brokenErrors.route("GET", "/boom", () => { throw new Error("database down"); });
  brokenErrors.use(cors({ origin: [APP_ORIGIN] }));
  brokenErrors.use((err, req, res, next) => { res.statusCode = 500; res.end("server error"); });

  const l = await late.listen();
  const a = await authFirst.listen();
  const c = await correct.listen();
  const b = await brokenErrors.listen();

  const attempt = async (port, opts) => {
    try { const r = await browserFetch(port, { origin: APP_ORIGIN, ...opts }); return { ok: true, status: r.status, body: r.body }; }
    catch (e) { return { ok: false, error: e.message }; }
  };

  results.corsBelowRoutes = await attempt(l.port, { path: "/data" });
  results.authAbovePreflight = await attempt(a.port, { path: "/data", method: "PUT", headers: { authorization: "Bearer good" } });
  results.correctPut = await attempt(c.port, { path: "/data", method: "PUT", headers: { authorization: "Bearer good" } });
  results.correct500 = await attempt(c.port, { path: "/boom", headers: { authorization: "Bearer good" } });
  results.broken500 = await attempt(b.port, { path: "/boom" });
  const raw500 = await raw(b.port, "/boom", { headers: { origin: APP_ORIGIN } });
  results.broken500RealStatus = raw500.status;

  l.server.close(); a.server.close(); c.server.close(); b.server.close();

  console.log("  ❌ cors() below the routes, GET /data");
  console.log("       →", JSON.stringify(results.corsBelowRoutes));
  console.log("  ❌ auth above cors(), PUT /data with a valid token");
  console.log("       →", JSON.stringify(results.authAbovePreflight));
  console.log("  ✅ cors() first, PUT /data with a valid token");
  console.log("       →", JSON.stringify(results.correctPut));
  console.log("\n  ✅ cors() first, a route that throws:");
  console.log("       →", JSON.stringify(results.correct500), " ← the page can READ the 500");
  console.log("  ❌ cors() after the throwing route:");
  console.log("       browser saw   :", JSON.stringify(results.broken500));
  console.log("       server ACTUALLY returned:", results.broken500RealStatus);
  console.log("\n  That last pair is the single most expensive debugging trap in this");
  console.log("  file. The server returned a 500. The developer console says 'blocked");
  console.log("  by CORS policy'. Somebody spends the afternoon editing CORS config for");
  console.log("  a database outage — because a response with no Allow-Origin header is");
  console.log("  unreadable, and the browser reports unreadable as a CORS failure");
  console.log("  regardless of the status code underneath.");
  console.log("\n  The middle case is the other one: a preflight is sent WITHOUT");
  console.log("  credentials — no cookies, no Authorization header, by specification.");
  console.log("  Any auth middleware above cors() rejects every OPTIONS request, so the");
  console.log("  real request is never sent and the endpoint is unreachable from a");
  console.log("  browser while working perfectly in curl.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — Treating CORS as a security control. It protects users from a
//   malicious page; it stops nobody from calling your API. → §4
//
// Bug 2 — "The CORS error means the request didn't go through." It did. The
//   handler ran and the row was written. → §4
//
// Bug 3 — Allow-Origin: '*' with credentials: 'include'. Rejected by the
//   browser, and the error message names the wrong header. → §6
//
// Bug 4 — "Fixing" that by reflecting any Origin with credentials — which
//   makes every website on the internet an allowed origin. → §6
//
// Bug 5 — Missing Vary: Origin behind a shared cache, so one origin's
//   Allow-Origin header is served to another. → §6
//
// Bug 6 — A custom response header that "the server definitely sets" reading
//   as undefined in the client: no Access-Control-Expose-Headers. → §7
//
// Bug 7 — A custom request header rejected at the preflight, so the real
//   request never happens and the network tab shows only an OPTIONS. → §7
//
// Bug 8 — Auth middleware above cors(), rejecting every preflight — works in
//   curl, unusable from a browser. → §8
//
// Bug 9 — cors() registered below the routes, so successful responses carry
//   no headers. → §8
//
// Bug 10 — A 500 reported as a CORS error because error responses skipped
//   the middleware that adds the headers. → §8
//
// Bug 11 — Doubling request count on a JSON API by never setting
//   Access-Control-Max-Age. → §5, §7
//
// Bug 12 — Assuming a form POST from another site is preflighted. It isn't —
//   it's a simple request, which is the whole basis of CSRF. → §5


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — enforcement is client-side:
  assert.ok(results.crossOriginBlocked.startsWith("CORS:"),
    "the browser refused to let the cross-origin page read the response ✅");
  assert.equal(results.handlerRunsDespiteBlock, 1,
    "…while the server handler ran anyway 🐛 — CORS blocked the READ, not the request");
  assert.equal(results.rowsWritten, 1,
    "…and the side effect was committed. CORS is not authorisation 🐛");

  // § 5 — preflight rules:
  const byLabel = Object.fromEntries(results.preflightTable.map((r) => [r.label, r]));
  assert.equal(byLabel["GET, no custom headers"].preflighted, false, "a plain GET was not preflighted ✅");
  assert.equal(byLabel["POST, text/plain"].preflighted, false, "…nor a POST with a safelisted content type");
  assert.equal(byLabel["POST, form-urlencoded"].preflighted, false,
    "…nor a form POST — which is exactly why CSRF is possible 🐛");
  assert.equal(byLabel["POST, application/json"].preflighted, true,
    "…but application/json alone forced a preflight ✅");
  assert.equal(byLabel["GET + Authorization header"].preflighted, true,
    "…and so did a single non-safelisted request header ✅");
  assert.equal(byLabel["PUT"].preflighted, true);
  assert.equal(byLabel["DELETE"].preflighted, true);
  assert.equal(results.totalPreflights, 4, "4 of the 7 requests cost an extra round trip");

  // § 6 — origins and credentials:
  assert.equal(results.wildcardNoCreds.ok, true, "'*' works fine without credentials ✅");
  assert.equal(results.wildcardWithCreds.ok, false,
    "…and is rejected the moment credentials are involved 🐛");
  assert.ok(results.wildcardWithCreds.error.includes("wildcard"),
    "…with the wildcard named as the reason");
  assert.equal(results.allowlistGood.ok, true, "an explicit allow-list + Allow-Credentials worked ✅");
  assert.equal(results.allowlistEvil.ok, false, "…and an origin outside the list was rejected ✅");
  assert.equal(results.reflectEvil.ok, true,
    "…while reflecting ANY origin accepted evil.example with credentials 🐛 — the vulnerability");
  assert.equal(results.varyHeader, "Origin",
    "a request-dependent Allow-Origin was accompanied by Vary: Origin ✅");

  // § 7 — allow vs expose:
  assert.ok(results.rejectedRequestHeader.includes("x-api-key"),
    "an un-allowed request header was rejected at the PREFLIGHT ✅");
  assert.equal(results.allowedRequestHeaderStatus, 200, "…and permitted once it was in Allow-Headers");
  assert.ok(!results.visibleWithoutExpose.includes("x-total-count"),
    "a custom response header was NOT readable without Expose-Headers 🐛");
  assert.ok(results.visibleWithoutExpose.includes("content-type"),
    "…while safelisted response headers were readable anyway");
  assert.ok(results.visibleWithExpose.includes("x-total-count"),
    "…and Expose-Headers made it readable ✅");
  assert.ok(!results.visibleWithExpose.includes("x-request-id"),
    "…but only the header that was actually listed — x-request-id stayed hidden");
  assert.equal(results.maxAgeHeader, "600", "the preflight carried a Max-Age the browser can cache ✅");

  // § 8 — ordering:
  assert.equal(results.corsBelowRoutes.ok, false,
    "cors() registered below the routes produced a response with no CORS headers 🐛");
  assert.equal(results.authAbovePreflight.ok, false,
    "auth above cors() rejected the credential-free preflight, so the real request never went 🐛");
  assert.equal(results.correctPut.ok, true, "cors() first, then auth, then routes — worked ✅");
  assert.equal(results.correctPut.body, "saved");
  assert.equal(results.correct500.ok, true,
    "…and with cors() first the page could READ the 500 ✅");
  assert.equal(results.correct500.status, 500, "…as an actual 500, diagnosable");
  assert.equal(results.broken500.ok, false,
    "…while the same crash without CORS headers was reported as a CORS error 🐛");
  assert.equal(results.broken500RealStatus, 500,
    "…even though the server really returned 500 — the browser hid the real cause 🐛");

  console.log("§10 — mini assertions passed for: CORS setup");
  console.log("\n  The pair that captures it: a 'blocked by CORS' POST still ran the");
  console.log("  handler and wrote the row — and a database outage was reported to the");
  console.log("  developer as a CORS error, because a 500 with no Allow-Origin header");
  console.log("  is unreadable and unreadable is all the browser can say.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you set up CORS in Express?", answer:
//
//   "Mechanically it's app.use(cors(options)) near the top of the stack. But
//    the thing I'd lead with is who enforces it: the browser, not my server.
//    My server only declares — it adds Access-Control-Allow-Origin and
//    friends, and the browser decides whether to let the page read the
//    response. I can demonstrate the consequence: a cross-origin POST that
//    the console reports as blocked by CORS still reached my handler and
//    still wrote its row. CORS blocked the read, not the request. So it is
//    not an authorisation mechanism — it protects a user's data from a
//    malicious page, and it stops nobody from calling my API with curl.
//
//    Requests come in two kinds. Simple ones — GET, HEAD or POST with only
//    safelisted headers and a form-ish Content-Type — go straight out and
//    are checked afterwards. Everything else is preflighted with an OPTIONS
//    carrying Access-Control-Request-Method and -Headers. That means the two
//    things every modern API does — send JSON and an Authorization header —
//    each force a preflight on their own, so I set Access-Control-Max-Age or
//    I've doubled my request count.
//
//    On configuration, the rules that actually bite. Allow-Origin '*' is
//    ignored for credentialed requests, so cookies require echoing one
//    specific origin plus Allow-Credentials: true — and 'echo whatever
//    Origin arrived' is not the fix, it's the vulnerability, because it
//    makes every site on the internet an allowed origin for a
//    cookie-authenticated API. I use a real allow-list, and I add Vary:
//    Origin, because once the header depends on the request a shared cache
//    can otherwise serve one origin's answer to another. Allow-Headers is
//    which request headers the page may send, checked at the preflight;
//    Expose-Headers is which response headers the page may read — that's why
//    a pagination header the server definitely sets reads as undefined in
//    the client.
//
//    Two ordering mistakes I look for. Auth above cors(): a preflight
//    carries no cookies and no Authorization header by specification, so the
//    auth middleware 401s every OPTIONS and the endpoint works in curl and
//    is unreachable from a browser. And error responses that skip the CORS
//    middleware — a 500 with no Allow-Origin is unreadable, so the console
//    says 'blocked by CORS policy' and somebody spends the afternoon editing
//    CORS config during a database outage."
//
// The "the handler ran and the row was written" demo is the part that
// separates a configuration answer from an understanding of the model.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Who enforces CORS?
// A1. The browser. The server only declares (§4).
//
// Q2. Does a CORS error mean the request wasn't sent?
// A2. For a simple request, no — it was sent and handled. For a preflighted
//     one the real request is not sent, but the OPTIONS was (§4, §5).
//
// Q3. Is CORS a security mechanism for my API?
// A3. It protects the user's data from a malicious page. It does not
//     protect the API — auth does (§4).
//
// Q4. Which requests are preflighted?
// A4. Anything that isn't GET/HEAD/POST with only safelisted headers and a
//     form-ish Content-Type (§5).
//
// Q5. Why does a JSON POST get preflighted?
// A5. application/json is not in the safelisted Content-Type set (§5).
//
// Q6. What does the preflight carry?
// A6. Origin, Access-Control-Request-Method, Access-Control-Request-Headers
//     — and no credentials (§5, §8).
//
// Q7. Can you use '*' with credentials?
// A7. No. The browser rejects the pair; echo one origin instead (§6).
//
// Q8. What's wrong with reflecting the Origin header?
// A8. With credentials it allows every origin on the internet (§6).
//
// Q9. Why Vary: Origin?
// A9. The response differs per Origin; without it a shared cache serves one
//     origin's headers to another (§6).
//
// Q10. Allow-Headers vs Expose-Headers?
// A10. Request headers the page may send, vs response headers it may read
//      (§7).
//
// Q11. What does Access-Control-Max-Age do?
// A11. Lets the browser cache the preflight result, removing a round trip
//      per request. Browsers cap the value (§7).
//
// Q12. Why does auth above cors() break everything?
// A12. Preflights carry no credentials, so auth 401s them (§8).
//
// Q13. Why does a 500 appear as a CORS error?
// A13. The error response carried no Allow-Origin, so the browser could not
//      expose it and reports it as a CORS failure (§8).
//
// Q14. Does CORS prevent CSRF?
// A14. No. A form POST is a simple request and is delivered. SameSite
//      cookies and CSRF tokens are the defence (§4, §5).
//
// Q15. What about credentials in a same-origin request?
// A15. None of this applies. CORS only concerns cross-origin reads.
//
// Q16. How do you debug a CORS problem properly?
// A16. Look at the OPTIONS response in the network tab, not the error text.
//      Then curl the actual endpoint with an Origin header and read the
//      response headers directly — that separates "my server is broken"
//      from "my headers are wrong" in one step.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: Who enforces CORS?
//   Back : The browser. The server only declares.
//
// Flashcard 2:
//   Front: What does a CORS error block?
//   Back : The READ. For simple requests the handler already ran.
//
// Flashcard 3:
//   Front: Simple request criteria?
//   Back : GET/HEAD/POST + safelisted headers + form-ish Content-Type.
//
// Flashcard 4:
//   Front: Why is a JSON POST preflighted?
//   Back : application/json isn't a safelisted Content-Type.
//
// Flashcard 5:
//   Front: '*' + credentials?
//   Back : Rejected by the browser. Echo one origin + Allow-Credentials.
//
// Flashcard 6:
//   Front: Reflect any Origin + credentials?
//   Back : Every site becomes allowed. That's the vulnerability.
//
// Flashcard 7:
//   Front: Why Vary: Origin?
//   Back : Shared caches would serve one origin's decision to another.
//
// Flashcard 8:
//   Front: Allow-Headers vs Expose-Headers?
//   Back : What the page may SEND vs what it may READ.
//
// Flashcard 9:
//   Front: Auth above cors()?
//   Back : Preflights have no credentials → every OPTIONS 401s.
//
// Flashcard 10:
//   Front: 500 shown as a CORS error?
//   Back : The error response had no Allow-Origin header.
//
// Flashcard 11:
//   Front: How do you sound senior?
//   Back : "CORS blocked the read, not the request — the row was already
//          written. It protects the user, not the API."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add Access-Control-Max-Age caching to §3's browserFetch and measure the
//   drop in OPTIONS requests over 20 calls.
//
// Task 2:
//   Implement an allow-list from an environment variable, including
//   wildcard subdomains, and write the test that proves evil-app.example
//   does not match *.app.example.
//
// Task 3:
//   Reproduce §8's 500-as-CORS-error, then fix it by setting the CORS
//   headers in the error handler as well. Which fix is more robust —
//   ordering, or duplicating the headers?
//
// Task 4:
//   Add a private-network / preflight logging middleware that records every
//   OPTIONS with its requested method and headers. Use it to discover which
//   of your endpoints are being preflighted unnecessarily.
//
// Task 5:
//   Build a CSRF demonstration: a cross-origin form POST that succeeds
//   despite CORS, then defend it with a SameSite=Lax cookie and show the
//   attack failing.
//
// Task 6:
//   Extend the enforcer to handle redirects — a cross-origin request that
//   redirects has its own rules. What happens to the Origin header after a
//   redirect?
//
// Task 7:
//   Serve the same endpoint through a caching proxy with and without
//   Vary: Origin and demonstrate the poisoned cache response.
//
// Task 8:
//   Add exposedHeaders: '*' and check what your enforcer does for a
//   credentialed request — the wildcard has the same restriction there as
//   Allow-Origin does.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The browser enforces CORS, not your server. A blocked cross-origin
//   request was still delivered and still handled — only the READ was
//   refused.
//
// If you remember the common bug:
//   Allow-Origin '*' with credentials (rejected), "fixed" by reflecting any
//   Origin (a vulnerability) — and a 500 that shows up in the console as a
//   CORS error because the error response carried no CORS headers.
//
// If you remember the professional framing:
//   cors() above auth and above the routes, a real allow-list, credentials
//   only with an exact origin, Vary: Origin, Expose-Headers for anything the
//   client must read, and Max-Age so a JSON API isn't paying for two round
//   trips per call.
//
// ─────────────────────────────────────────────────────────────────
// That closes the first ten topics of ◆ Express Deep Dive: the stack (01),
// next() (02), errors (03), routers (04, 05), the values a request carries
// (06), the lifecycle they travel through (07), the response helpers that
// end it (08), files (09) and the cross-origin rules that govern who may
// read any of it (10).
//
// Eight remain in this group, and they are all middleware you now know
// exactly how to place:
//   11 Helmet.js security headers      15 Cookie-parser
//   12 Rate limiting                   16 Session management
//   13 Body parsing (json, urlencoded) 17 express-validator
//   14 Multer — file upload            18 Morgan logger
//
// NEXT TOPIC -> 11_helmet-js-security-headers.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
