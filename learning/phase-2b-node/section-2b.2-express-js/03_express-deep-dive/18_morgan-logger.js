// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  18_morgan-logger.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Morgan logger
//
// WHAT YOU WILL MASTER HERE:
//   1. The mechanic that makes a request logger work at all: it runs FIRST
//      and logs LAST, on res 'finish' — proven against a naive logger that
//      reports `undefined` for status and 0 for duration
//   2. The four built-in formats produced from one real request, field by
//      field
//   3. Position: a logger below the routes records nothing, and a logger
//      above them records the 404s too
//   4. Aborted requests — the ones users actually complain about — missing
//      from a 'finish'-only logger, and the fix
//   5. Secrets in access logs: a token in a query string and an
//      Authorization header written to disk, and a redacting token
//   6. Request-id correlation: one id threaded through the log line, the
//      handler and the error handler
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/18_morgan-logger.js"
//
// Prerequisites: 07_request-lifecycle.js §3 and §7 — the timeline, the
// difference between res.end() and 'finish', and the abort that fires
// 'close' without 'finish'. This file is the practical payoff of both.
//
// This is the last file of ◆ Express Deep Dive.


const http = require("http");
const crypto = require("crypto");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Morgan:
// HTTP request-logging middleware that registers early in the stack, attaches
// a listener to the response, and writes one formatted line per request when
// the response FINISHES — because the status code, the response size and the
// duration do not exist until then.
//
// If interviewer says "explain it simply", say:
//   "It's a middleware you put near the top, but it doesn't log when it
//    runs. It records the start time, calls next(), and subscribes to the
//    response's 'finish' event. When the response has actually been sent it
//    formats a line — method, URL, status, size, duration — from tokens.
//    That deferral is the entire design; everything interesting about a
//    request is only known at the end."
//
// If interviewer says "what would you change for production?", say:
//   "Three things. Structured JSON instead of a text format, so the fields
//    are queryable. A request id generated up front and included in every
//    line, so an access log entry can be joined to application logs and an
//    error. And redaction — the default formats write the full URL and can
//    be configured to write headers, so tokens in query strings and
//    Authorization headers end up on disk and in your log vendor."
//
// Why it matters in interviews:
//   It's the smallest middleware in the group and the one that most exposes
//   whether someone has operated a service. Knowing that 'finish' misses
//   aborted requests — the exact requests users are complaining about — is
//   the senior signal.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   RUNS FIRST, LOGS LAST. THE INTERESTING FIELDS ONLY EXIST AT THE END.
//
// Runtime rule:
//   record start → next() → on res 'finish', evaluate the format's tokens
//   against (req, res) and write one line. It never delays or modifies the
//   response; it only observes it.
//
// Practical rule:
//   Register it above everything except a request-id middleware. Use a
//   structured format in production and a human one in development. Skip
//   health checks and static assets. Redact the URL and never log
//   Authorization or Cookie.
//
// Common trap:
//   Believing the access log is complete. A 'finish'-only logger silently
//   omits every request the client abandoned, which is exactly the
//   population you look at when someone reports slowness.
//
// The mental picture:
//
//   [morgan] ─ record start, subscribe to 'finish', next()
//        │                                    ▲
//   [helmet][cors][limiter][parsers][routes]  │
//        │                                    │
//   res.end() ──────────────────────────────▶ 'finish' → format → write line
//                                             │
//   client aborts ──────────────────────────▶ 'close' WITHOUT 'finish' (§6)


// ══════════════════════════════════════════════════════════════════
// § 3 — IMPLEMENTING MORGAN
// ══════════════════════════════════════════════════════════════════

const TOKENS = {
  method: (req) => req.method,
  url: (req) => req.originalUrl || req.url,
  status: (req, res) => (res.headersSent ? String(res.statusCode) : "-"),
  "response-time": (req, res, ctx) => ctx.durationMs.toFixed(3),
  "res-content-length": (req, res) => res.getHeader("content-length") ?? "-",
  "remote-addr": (req) => req.socket.remoteAddress,
  "http-version": (req) => req.httpVersion,
  referrer: (req) => req.headers.referer || req.headers.referrer || "-",
  "user-agent": (req) => req.headers["user-agent"] || "-",
  date: (req, res, ctx) => new Date(ctx.startedAt).toISOString(),
  id: (req) => req.id || "-",
};

const FORMATS = {
  tiny: ":method :url :status :res-content-length - :response-time ms",
  short: ":remote-addr :method :url HTTP/:http-version :status :res-content-length - :response-time ms",
  dev: ":method :url :status :response-time ms - :res-content-length",
  combined:
    ':remote-addr - - [:date] ":method :url HTTP/:http-version" :status :res-content-length ' +
    '":referrer" ":user-agent"',
};

function morgan(format = "dev", { stream = process.stdout, skip = null, redact = null } = {}) {
  const template = FORMATS[format] || format;

  return function morganMiddleware(req, res, next) {
    const startedAt = Date.now();
    const startedHr = process.hrtime.bigint();

    // Subscribe FIRST, log LAST. Nothing is written here.
    res.on("finish", () => {
      if (skip && skip(req, res)) return;
      const ctx = { startedAt, durationMs: Number(process.hrtime.bigint() - startedHr) / 1e6 };
      let line = template.replace(/:([a-zA-Z-]+)/g, (whole, name) => {
        const token = TOKENS[name];
        return token ? String(token(req, res, ctx)) : whole;
      });
      if (redact) line = redact(line);
      stream.write(line + "\n");
    });

    next();
  };
}

// A logger written the way people expect one to work.
function naiveLogger(stream) {
  return function naiveLoggerMiddleware(req, res, next) {
    const start = Date.now();
    stream.write([
      req.method, req.url,
      "status=" + res.statusCode,                    // not decided yet
      "sent=" + res.headersSent,
      "duration=" + (Date.now() - start) + "ms",     // nothing has happened yet
    ].join(" ") + "\n");
    next();
  };
}

function collector() {
  const lines = [];
  return { lines, write: (s) => lines.push(s.replace(/\n$/, "")) };
}

function miniExpress() {
  const stack = [];
  const app = {
    use(fn) { stack.push({ fn }); return app; },
    get(path, fn) { stack.push({ path, fn }); return app; },
    listen() {
      return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          req.originalUrl = req.url;
          const urlPath = req.url.split("?")[0];
          let i = 0;
          (function next(err) {
            const layer = stack[i++];
            if (!layer) {
              if (res.writableEnded || res.destroyed) return;
              res.statusCode = err ? 500 : 404;
              res.setHeader("content-type", "text/plain");
              return res.end(err ? "server error" : "not found");
            }
            const isErr = layer.fn.length === 4;
            if (err && !isErr) return next(err);
            if (!err && isErr) return next();
            if (layer.path && layer.path !== urlPath) return next(err);
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

function request(port, path, { headers = {}, abortAfterMs = null } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on("error", (e) => reject(e));
    if (abortAfterMs) setTimeout(() => req.destroy(new Error("ABORT")), abortAfterMs);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


// ══════════════════════════════════════════════════════════════════
// § 4 — RUNS FIRST, LOGS LAST
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — why a logger cannot log when it runs ══\n");

  const naive = collector();
  const proper = collector();

  const app = miniExpress();
  app.use(naiveLogger(naive));
  app.use(morgan("dev", { stream: proper }));
  app.get("/slow", async (req, res) => {
    await sleep(25);
    res.setHeader("content-type", "application/json");
    res.end('{"ok":true}');
  });
  app.get("/missing-route-on-purpose", (req, res, next) => next());

  const { server, port } = await app.listen();
  await request(port, "/slow");
  await request(port, "/nope");
  await sleep(30);
  server.close();

  results.naiveLines = naive.lines;
  results.properLines = proper.lines;
  const duration = Number(/(\d+\.\d+) ms/.exec(proper.lines[0])[1]);
  results.loggedDuration = duration;

  console.log("  a logger that writes when it RUNS:");
  for (const l of naive.lines) console.log("    " + l);
  console.log("\n  morgan, writing on 'finish':");
  for (const l of proper.lines) console.log("    " + l);
  console.log("\n  measured duration for the 25ms handler:", duration.toFixed(1), "ms ✅");
  console.log("\n  Look at the naive lines. status=200 is a LIE — that is just the");
  console.log("  default value of res.statusCode before anything set it, and the 404");
  console.log("  request logged 200 as well. sent=false confirms nothing had been");
  console.log("  written. duration=0ms is trivially true and completely useless.");
  console.log("\n  Everything an access log exists for — what status did the client get,");
  console.log("  how many bytes, how long did it take — is decided AFTER the handler.");
  console.log("  So the middleware runs early (to catch the start time and to see every");
  console.log("  request) and writes late (on 'finish'). That is also why 02 §4's rule");
  console.log("  matters: code after next() is not a reliable 'after the response' hook,");
  console.log("  because the response may finish asynchronously. The event is.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — THE FORMATS
// ══════════════════════════════════════════════════════════════════

async function section5() {
  console.log("\n══ § 5 — one request, four formats ══\n");

  const streams = {};
  const app = miniExpress();
  for (const name of ["tiny", "short", "dev", "combined"]) {
    streams[name] = collector();
    app.use(morgan(name, { stream: streams[name] }));
  }
  app.get("/api/orders", (req, res) => {
    res.statusCode = 201;
    res.setHeader("content-type", "application/json");
    res.end('{"id":7}');
  });

  const { server, port } = await app.listen();
  await request(port, "/api/orders?page=2", {
    headers: { referer: "https://app.example/checkout", "user-agent": "Mozilla/5.0 (JSHub)" },
  });
  await sleep(20);
  server.close();

  results.formats = Object.fromEntries(Object.entries(streams).map(([k, v]) => [k, v.lines[0]]));

  for (const [name, line] of Object.entries(results.formats)) {
    console.log("  " + name.padEnd(9) + line);
  }
  console.log("\n  Field by field, and why each one is in there:");
  console.log("   :method :url          what was asked for — the URL includes the query");
  console.log("                         string, which is where secrets leak (§7)");
  console.log("   :status               the outcome. The single most useful field: a");
  console.log("                         rate of 5xx over time IS your availability");
  console.log("   :res-content-length   response size — spots an endpoint that quietly");
  console.log("                         started returning 4 MB");
  console.log("   :response-time        latency. Log it, then look at p95/p99, never the");
  console.log("                         mean — the mean hides exactly the users who left");
  console.log("   :remote-addr          the client, subject to every proxy caveat in");
  console.log("                         12 §7 — behind a load balancer this is the load");
  console.log("                         balancer unless trust proxy is configured");
  console.log("   :referrer :user-agent  where they came from and what they used");
  console.log("\n  'combined' is the Apache/nginx standard, so every log tool understands");
  console.log("  it out of the box. 'dev' is colourised and terse for a terminal. For a");
  console.log("  service that ships logs anywhere, neither is right — §8 does JSON.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — POSITION, AND THE REQUESTS THAT NEVER GET LOGGED
// ══════════════════════════════════════════════════════════════════

async function section6() {
  console.log("\n══ § 6 — what your access log is missing ══\n");

  // (a) position
  const above = collector(), below = collector();
  const app = miniExpress();
  app.use(morgan("tiny", { stream: above }));
  app.get("/ok", (req, res) => { res.setHeader("content-type", "text/plain"); res.end("ok"); });
  app.use(morgan("tiny", { stream: below }));

  const a = await app.listen();
  await request(a.port, "/ok");
  await request(a.port, "/nope");
  await sleep(20);
  a.server.close();

  results.positionAbove = above.lines.length;
  results.positionBelow = below.lines.length;

  console.log("  (a) two identical loggers, above and below the routes:");
  console.log("      above the routes:", above.lines.length, "lines —", JSON.stringify(above.lines));
  console.log("      below the routes:", below.lines.length, "line  —", JSON.stringify(below.lines));
  console.log("      The one below never ran for /ok, because the route ended the walk");
  console.log("      (01 §6). It only saw the 404, which fell through to it. An access");
  console.log("      log that silently omits every SUCCESSFUL request is worse than no");
  console.log("      log at all, because it looks fine.");

  // (b) aborted requests
  const finishOnly = collector(), complete = collector();
  const app2 = miniExpress();
  app2.use(morgan("tiny", { stream: finishOnly }));
  app2.use((req, res, next) => {                    // a logger that also catches aborts
    const start = process.hrtime.bigint();
    let logged = false;
    const write = (outcome) => {
      if (logged) return;
      logged = true;
      complete.write([req.method, req.url, outcome,
        (Number(process.hrtime.bigint() - start) / 1e6).toFixed(1) + "ms"].join(" "));
    };
    res.on("finish", () => write(String(res.statusCode)));
    res.on("close", () => write(res.writableFinished ? String(res.statusCode) : "ABORTED"));
    next();
  });
  app2.get("/slow", async (req, res) => {
    await sleep(200);
    if (!res.writableEnded && !res.destroyed) { res.setHeader("content-type", "text/plain"); res.end("done"); }
  });
  app2.get("/fast", (req, res) => { res.setHeader("content-type", "text/plain"); res.end("done"); });

  const b = await app2.listen();
  await request(b.port, "/fast");
  try { await request(b.port, "/slow", { abortAfterMs: 40 }); } catch { /* the client gave up */ }
  await sleep(300);
  b.server.close();

  results.finishOnlyLines = finishOnly.lines;
  results.completeLines = complete.lines;

  console.log("\n  (b) one fast request, one the client abandoned after 40ms:");
  console.log("      morgan ('finish' only):", finishOnly.lines.length, "lines");
  for (const l of finishOnly.lines) console.log("        " + l);
  console.log("      with a 'close' listener:", complete.lines.length, "lines");
  for (const l of complete.lines) console.log("        " + l);
  console.log("\n  The abandoned request is absent from the first log entirely. That is");
  console.log("  the population you go looking for when somebody says 'the site is");
  console.log("  slow' — and by construction it is the one your dashboard cannot see.");
  console.log("  The p99 looks healthy precisely because the slowest requests never");
  console.log("  finished, so they were never measured (07 §7).");
  console.log("\n  Two more categories an access log misses, worth naming out loud:");
  console.log("   • Requests rejected before your app — by nginx, the load balancer, or");
  console.log("     a WAF. Your log shows nothing; theirs shows everything.");
  console.log("   • Requests that crashed the process. Nothing flushed.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — SECRETS IN THE ACCESS LOG
// ══════════════════════════════════════════════════════════════════

async function section7() {
  console.log("\n══ § 7 — what you just wrote to disk ══\n");

  const plain = collector();
  const redacted = collector();

  const SENSITIVE_PARAMS = ["token", "api_key", "password", "reset", "code", "access_token"];
  const redactUrl = (line) =>
    SENSITIVE_PARAMS.reduce(
      (acc, p) => acc.replace(new RegExp("([?&]" + p + "=)[^&\\s\"]*", "gi"), "$1[REDACTED]"),
      line);

  const app = miniExpress();
  app.use(morgan(':method :url :status ":user-agent"', { stream: plain }));
  app.use(morgan(':method :url :status ":user-agent"', { stream: redacted, redact: redactUrl }));
  app.get("/reset-password", (req, res) => { res.setHeader("content-type", "text/plain"); res.end("ok"); });

  const { server, port } = await app.listen();
  await request(port, "/reset-password?token=abc123SECRET&email=ada@example.com", {
    headers: { authorization: "Bearer eyJhbGciOi.SECRET.TOKEN", cookie: "sid=s%3A9f3a-session-value" },
  });
  await sleep(20);
  server.close();

  results.logPlain = plain.lines[0];
  results.logRedacted = redacted.lines[0];
  results.plainLeaksToken = /abc123SECRET/.test(plain.lines[0]);
  results.redactedLeaksToken = /abc123SECRET/.test(redacted.lines[0]);
  results.headersNotLogged = !/Bearer/.test(plain.lines[0]) && !/sid=/.test(plain.lines[0]);

  console.log("  default format:");
  console.log("    " + results.logPlain);
  console.log("  with URL redaction:");
  console.log("    " + results.logRedacted);
  console.log("\n  password-reset token in the plain line:", results.plainLeaksToken, " 🐛");
  console.log("  …in the redacted line                 :", results.redactedLeaksToken, " ✅");
  console.log("  Authorization / Cookie present        :", !results.headersNotLogged,
              " ← not in the default format, and DO NOT add them");
  console.log("\n  That first line is a live password-reset token, written to a file, then");
  console.log("  shipped to a log vendor, then retained for ninety days, then readable by");
  console.log("  everyone with dashboard access. The request itself was perfectly");
  console.log("  secure — TLS, short expiry, single use — and the log defeated all of it.");
  console.log("\n  Four rules that follow:");
  console.log("   • Never put a secret in a query string in the first place. It lands in");
  console.log("     access logs, browser history, and the Referer header sent to third");
  console.log("     parties (11 §4's Referrer-Policy exists for that last one).");
  console.log("   • Redact anyway, because you do not control every URL your clients");
  console.log("     construct.");
  console.log("   • Never log Authorization or Cookie headers. A session id in a log is");
  console.log("     a session anyone with log access can replay (16 §6).");
  console.log("   • Treat email addresses and IPs as personal data with a retention");
  console.log("     policy, not as free-form debugging text.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — STRUCTURED LOGS AND REQUEST-ID CORRELATION
// ══════════════════════════════════════════════════════════════════

async function section8() {
  console.log("\n══ § 8 — one id through the whole request ══\n");

  const access = collector();
  const appLog = collector();

  const jsonFormat = (req, res, ctx) => JSON.stringify({
    ts: new Date(ctx.startedAt).toISOString(),
    level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    reqId: req.id,
    method: req.method,
    path: (req.originalUrl || req.url).split("?")[0],
    status: res.statusCode,
    durationMs: Number(ctx.durationMs.toFixed(1)),
    bytes: Number(res.getHeader("content-length") || 0),
  });

  function jsonMorgan({ stream, skip }) {
    return (req, res, next) => {
      const startedAt = Date.now();
      const startedHr = process.hrtime.bigint();
      res.on("finish", () => {
        if (skip && skip(req, res)) return;
        stream.write(jsonFormat(req, res, {
          startedAt, durationMs: Number(process.hrtime.bigint() - startedHr) / 1e6,
        }) + "\n");
      });
      next();
    };
  }

  const app = miniExpress();
  app.use((req, res, next) => {                              // request id, FIRST
    req.id = req.headers["x-request-id"] || crypto.randomUUID();
    res.setHeader("x-request-id", req.id);                   // hand it back to the client
    next();
  });
  app.use(jsonMorgan({ stream: access, skip: (req) => req.url === "/healthz" }));
  app.get("/healthz", (req, res) => { res.setHeader("content-type", "text/plain"); res.end("ok"); });
  app.get("/orders", (req, res) => {
    appLog.write(JSON.stringify({ reqId: req.id, msg: "fetching orders", userId: 42 }));
    res.setHeader("content-type", "application/json");
    res.end('{"orders":[]}');
  });
  app.get("/boom", (req, res) => { throw new Error("database unavailable"); });
  app.use((err, req, res, next) => {
    appLog.write(JSON.stringify({ reqId: req.id, level: "error", msg: err.message }));
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "internal", requestId: req.id }));   // give it to the user
  });

  const { server, port } = await app.listen();
  const orders = await request(port, "/orders");
  const boom = await request(port, "/boom");
  await request(port, "/healthz");
  await request(port, "/healthz");
  await sleep(30);
  server.close();

  const accessEntries = access.lines.map((l) => JSON.parse(l));
  const appEntries = appLog.lines.map((l) => JSON.parse(l));
  const errorBody = JSON.parse(boom.body);

  results.structured = {
    accessCount: accessEntries.length,
    paths: accessEntries.map((e) => e.path),
    levels: accessEntries.map((e) => e.level),
    healthSkipped: !accessEntries.some((e) => e.path === "/healthz"),
    idInHeader: orders.headers["x-request-id"],
    idsMatch: accessEntries[0].reqId === appEntries[0].reqId,
    errorIdMatches: errorBody.requestId === accessEntries[1].reqId,
    errorId: errorBody.requestId,
  };

  console.log("  access log:");
  for (const e of accessEntries) console.log("    " + JSON.stringify(e));
  console.log("  application log:");
  for (const e of appEntries) console.log("    " + JSON.stringify(e));
  console.log("  the 500 response body:", JSON.stringify(errorBody));
  console.log("\n  health checks logged:", accessEntries.filter((e) => e.path === "/healthz").length,
              "of 2 requests ✅ (skipped)");
  console.log("  access-log id == application-log id:", results.structured.idsMatch, " ✅");
  console.log("  id returned to the user in the error body:", results.structured.errorIdMatches, " ✅");
  console.log("\n  That id is the whole point. A user says 'it failed at 2pm'; you ask for");
  console.log("  the request id from the error message, and one query returns the access");
  console.log("  line, every application log for that request, and the error — across");
  console.log("  services, if you propagate the header. Without it you are grepping a");
  console.log("  timestamp range and guessing.");
  console.log("\n  Three notes on the structured format:");
  console.log("   • JSON so fields are queryable. 'status >= 500 grouped by path' is a");
  console.log("     query, not a regex over text.");
  console.log("   • The path WITHOUT the query string, which both removes the §7 leak");
  console.log("     and makes /orders?page=1 and /orders?page=2 the same line for");
  console.log("     aggregation. Keep whitelisted params as separate fields if you need");
  console.log("     them.");
  console.log("   • Skip health checks and static assets, or a Kubernetes liveness probe");
  console.log("     every two seconds becomes the overwhelming majority of your log");
  console.log("     volume and your bill.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — A hand-rolled logger that logs at request time, reporting status
//   200 for everything and a duration of zero. → §4
//
// Bug 2 — Logger registered below the routes, so successful requests are
//   never logged and the log looks healthy. → §6
//
// Bug 3 — Dashboards built only on 'finish', so abandoned requests — the
//   slow ones users complain about — are invisible and p99 looks fine.
//   → §6, 07 §7
//
// Bug 4 — Password-reset tokens, API keys and magic-link codes written to
//   access logs via the query string. → §7
//
// Bug 5 — Authorization or Cookie headers added to a custom format "for
//   debugging", putting replayable sessions in the log. → §7, 16 §6
//
// Bug 6 — Personal data logged with no retention policy.
//
// Bug 7 — :remote-addr recorded as the load balancer's address because
//   trust proxy was never configured, making every log line identical.
//   → 12 §7
//
// Bug 8 — Health checks and static assets drowning the signal and the
//   budget. → §8
//
// Bug 9 — No request id, so an access line cannot be joined to the error it
//   corresponds to. → §8
//
// Bug 10 — Synchronous logging to a file on the request path, adding disk
//   latency to every response. Buffer, or write to stdout and let the
//   platform ship it.
//
// Bug 11 — Logging the full request body "temporarily" and shipping it,
//   which puts every password and card number in the log.
//
// Bug 12 — Alerting on the mean response time, which hides the tail that
//   actually hurts.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — runs first, logs last:
  assert.ok(results.naiveLines[0].includes("sent=false"),
    "the naive logger ran before anything had been written 🐛");
  assert.ok(results.naiveLines[0].includes("duration=0ms"),
    "…so its duration was 0ms — measured before the work happened 🐛");
  assert.ok(results.naiveLines[1].includes("status=200"),
    "…and it logged status 200 for a request that ended in a 404 🐛");
  assert.ok(results.properLines[0].startsWith("GET /slow 200"),
    "morgan logged the real status, because it waited for 'finish' ✅");
  assert.ok(results.properLines[1].startsWith("GET /nope 404"),
    "…including the 404 ✅");
  assert.ok(results.loggedDuration >= 20,
    "…and a real duration for the 25ms handler ✅ (" + results.loggedDuration.toFixed(1) + "ms)");

  // § 5 — formats:
  const f = results.formats;
  assert.ok(f.tiny.startsWith("GET /api/orders?page=2 201"), "tiny: method, url, status ✅");
  assert.ok(f.combined.includes('"https://app.example/checkout"'), "combined includes the referrer ✅");
  assert.ok(f.combined.includes('"Mozilla/5.0 (JSHub)"'), "…and the user agent ✅");
  assert.ok(f.combined.includes("HTTP/1.1"), "…and the protocol version");
  assert.ok(f.short.includes("127.0.0.1"), "short includes the remote address ✅");
  assert.ok(/ 201 /.test(f.dev), "…and every format carries the status the handler actually set");

  // § 6 — position and aborts:
  assert.equal(results.positionAbove, 2, "the logger above the routes recorded BOTH requests ✅");
  assert.equal(results.positionBelow, 1,
    "…the one below recorded only the 404 that fell through to it 🐛");
  assert.equal(results.finishOnlyLines.length, 1,
    "a 'finish'-only logger recorded just the completed request 🐛");
  assert.ok(results.finishOnlyLines[0].includes("/fast"), "…the fast one");
  assert.equal(results.completeLines.length, 2,
    "…while a logger that also listens for 'close' recorded both ✅");
  assert.ok(results.completeLines.some((l) => l.includes("ABORTED")),
    "…marking the abandoned request as ABORTED ✅");
  assert.ok(!results.finishOnlyLines.some((l) => l.includes("/slow")),
    "…which is exactly the request missing from the first log 🐛");

  // § 7 — secrets:
  assert.equal(results.plainLeaksToken, true,
    "the default format wrote a live password-reset token to the log 🐛");
  assert.equal(results.redactedLeaksToken, false, "…and redaction removed it ✅");
  assert.ok(results.logRedacted.includes("token=[REDACTED]"), "…leaving the parameter name visible");
  assert.equal(results.headersNotLogged, true,
    "…while Authorization and Cookie were not in the default format at all ✅");

  // § 8 — structured and correlated:
  const st = results.structured;
  assert.equal(st.accessCount, 2, "two loggable requests produced two access lines");
  assert.deepEqual(st.paths, ["/orders", "/boom"], "…paths without the query string ✅");
  assert.deepEqual(st.levels, ["info", "error"], "…with a level derived from the status ✅");
  assert.equal(st.healthSkipped, true, "…and the health checks were skipped entirely ✅");
  assert.ok(/^[0-9a-f-]{36}$/.test(st.idInHeader), "a request id was generated and returned to the client ✅");
  assert.equal(st.idsMatch, true,
    "…the access log and the application log carried the SAME id ✅");
  assert.equal(st.errorIdMatches, true,
    "…and the id in the 500 response body matches its access line — a user can quote it ✅");

  console.log("§10 — mini assertions passed for: Morgan logger");
  console.log("\n  The pair that captures it: a logger that writes when it runs reported");
  console.log("  status 200 for a 404 and 0ms for a 25ms request — and a 'finish'-only");
  console.log("  logger left out the abandoned request entirely.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how do you log requests in Express?", answer:
//
//   "Morgan, registered near the top of the stack. The mechanic worth
//    stating is that it runs first and logs last: it records the start time,
//    calls next(), and subscribes to the response's 'finish' event, because
//    the status, the response size and the duration don't exist until the
//    response is finished. A logger that writes when it runs reports status
//    200 for everything — that's just the default value of res.statusCode —
//    and a duration of zero.
//
//    Position matters for the same reason as every other middleware: below
//    the routes it only sees requests that fell through, so it logs your
//    404s and none of your successes, and the log looks perfectly healthy.
//
//    The thing I'd raise that people usually miss is what a 'finish'-only
//    log doesn't contain. If the client hangs up mid-request you get 'close'
//    without 'finish', so the request is absent from the log entirely — and
//    that's precisely the population you go looking for when someone says
//    the site is slow. Your p99 looks fine because the slowest requests were
//    never measured. I add a 'close' listener and record those as aborted,
//    with the elapsed time.
//
//    For production I'd change three things about the defaults. Structured
//    JSON, so status and duration are queryable fields rather than text.
//    A request id generated in the first middleware, echoed in a response
//    header, included in every access line and application log, and returned
//    in error bodies — so a user can quote it and one query reconstructs the
//    whole request. And redaction: the standard formats log the full URL,
//    which means password-reset tokens and API keys in query strings end up
//    on disk and in your log vendor for ninety days. I redact known
//    parameters and never log Authorization or Cookie, because a session id
//    in a log is a session anyone with log access can replay.
//
//    Plus the operational hygiene: skip health checks and static assets or a
//    liveness probe becomes most of your log volume, write to stdout rather
//    than synchronously to a file on the request path, and remember
//    :remote-addr is your load balancer unless trust proxy is set."
//
// The aborted-requests point is the one that marks this as an answer from
// someone who has been on call.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. When does morgan write its line?
// A1. On res 'finish' — never when the middleware runs (§4).
//
// Q2. Why not log immediately?
// A2. Status, size and duration do not exist yet (§4).
//
// Q3. What happens if you register it below the routes?
// A3. It only sees requests that fell through — successes are missing (§6).
//
// Q4. Which requests never appear in a 'finish'-only log?
// A4. Aborted ones: 'close' fires without 'finish' (§6, 07 §7).
//
// Q5. Why does that matter operationally?
// A5. The abandoned requests are the slow ones, so latency dashboards look
//     healthy while users time out (§6).
//
// Q6. What's wrong with logging the full URL?
// A6. Tokens and keys in query strings get persisted and shipped (§7).
//
// Q7. Should you log Authorization or Cookie?
// A7. Never. A logged session id is a replayable session (§7, 16 §6).
//
// Q8. Why JSON over 'combined'?
// A8. Queryable fields instead of regexes over text (§8).
//
// Q9. What is a request id for?
// A9. Joining an access line to application logs and to the error a user is
//     quoting — and across services if you propagate it (§8).
//
// Q10. Where should the request id be generated?
// A10. In the first middleware, accepting an incoming X-Request-Id if a
//      trusted upstream set one (§8).
//
// Q11. What should you skip?
// A11. Health checks and static assets — otherwise they dominate volume
//      and cost (§8).
//
// Q12. Why is :remote-addr often useless?
// A12. Behind a proxy it is the proxy. Configure trust proxy (12 §7).
//
// Q13. Mean or percentiles?
// A13. Percentiles. The mean hides the tail, and the tail is the complaint.
//
// Q14. Access logs vs application logs vs traces?
// A14. One line per request, arbitrary events within a request, and a
//      causal graph across services. The request id is what joins them.
//
// Q15. Is logging on the request path a performance risk?
// A15. Synchronous file writes are. Write to stdout and let the platform
//      ship it, or buffer.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: When does morgan log?
//   Back : On res 'finish'.
//
// Flashcard 2:
//   Front: Why not when it runs?
//   Back : Status, size and duration don't exist yet.
//
// Flashcard 3:
//   Front: Logger below the routes?
//   Back : Logs only what fell through — no successes.
//
// Flashcard 4:
//   Front: Which requests are missing from the log?
//   Back : Aborted ones — 'close' without 'finish'.
//
// Flashcard 5:
//   Front: Why does that break dashboards?
//   Back : The slowest requests were never measured.
//
// Flashcard 6:
//   Front: Biggest logging security bug?
//   Back : Secrets in query strings, persisted in access logs.
//
// Flashcard 7:
//   Front: Log Authorization / Cookie?
//   Back : Never. Replayable session.
//
// Flashcard 8:
//   Front: What makes logs joinable?
//   Back : A request id in every line and in error responses.
//
// Flashcard 9:
//   Front: What do you skip?
//   Back : Health checks and static assets.
//
// Flashcard 10:
//   Front: How do you sound senior?
//   Back : "A 'finish'-only log omits abandoned requests — the exact ones
//          users are complaining about."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add an :id token to the format table and wire §8's request id into the
//   'combined' format.
//
// Task 2:
//   Extend §6(b)'s logger into a drop-in replacement that logs both
//   completions and aborts with a distinguishing field, then measure what
//   fraction of a slow endpoint's requests are aborted under load.
//
// Task 3:
//   Build a redaction list from a config file and write the test that fails
//   if a new sensitive parameter name is introduced without being added.
//
// Task 4:
//   Compute p50/p95/p99 from your JSON access log for one endpoint. Compare
//   with the mean and write one sentence about the difference.
//
// Task 5:
//   Propagate X-Request-Id to a downstream HTTP call and show one id
//   appearing in two services' logs.
//
// Task 6:
//   Measure the cost of synchronous file logging versus stdout at 5,000
//   requests, and report the added p99.
//
// Task 7:
//   Add sampling: log 100% of 4xx/5xx and 5% of successes. What do you lose,
//   and what does that buy at a million requests a day?
//
// Task 8:
//   Write a middleware that asserts, in development, that every response
//   carries an x-request-id header. That is how the correlation stays true
//   as the codebase grows.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   Morgan runs first and logs last — on res 'finish' — because status,
//   size and duration are only known once the response is done.
//
// If you remember the common bug:
//   A 'finish'-only log silently omits every abandoned request, so the
//   dashboard is healthiest exactly when users are giving up.
//
// If you remember the professional framing:
//   Structured JSON, a request id in every line and every error body,
//   redacted URLs, no Authorization or Cookie, health checks skipped, and
//   percentiles rather than means.
//
// ─────────────────────────────────────────────────────────────────
// END OF ◆ EXPRESS DEEP DIVE (2B.2, group 1 of 1) — 18 files.
//
// The group's argument, end to end: an Express app is an ordered array (01)
// walked by next() (02); errors take a parallel path through it (03); the
// array is really a tree of routers (04, 05) matching values off the URL
// (06); those values travel a lifecycle (07) that ends in a response (08),
// which may be a file (09) that another origin wants to read (10). Then the
// middleware that make it survivable: headers (11), limits (12), bodies
// (13, 14), identity (15, 16), input (17) and visibility (18).
//
// NEXT SECTION -> phase-2b-node/section-2b.3-rest-api-design/
// (per the docx: 🟢 REST API DESIGN — ◆ API Design Standards, beginning with
// REST principles: stateless, uniform interface)
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
