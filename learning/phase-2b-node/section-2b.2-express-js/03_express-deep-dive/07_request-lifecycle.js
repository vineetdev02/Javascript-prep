// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  07_request-lifecycle.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Request lifecycle
//
// WHAT YOU WILL MASTER HERE:
//   1. The whole journey printed as one ordered, timestamped trace: TCP
//      connection → 'request' → middleware → route → res.end() → 'finish'
//      → 'close'
//   2. The fact that reorganises everything: your handler runs when the
//      HEADERS have arrived, not the body — req is still an open stream
//   3. Why that makes body parsing a MIDDLEWARE and not a property, proven
//      by reading the stream twice and getting 0 bytes the second time
//   4. The response half: headers are mutable until the first byte is
//      written, and immovable after — measured at three points
//   5. 'finish' vs 'close': a client that hangs up gets 'close' with no
//      'finish', while your handler happily keeps doing work for nobody
//   6. Keep-alive: two requests, ONE TCP connection, counted
//   7. The complete map of which file in this group runs at which stage
//   8. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/07_request-lifecycle.js"
//
// Prerequisites: everything in this group so far (01–06), plus
// section-2b.1-node-core/01_nodejs-internals/12_streams-concept.js and
// 02_streams-and-buffers/01_readable-writable-duplex-transform-streams.js —
// because the single most important fact in this file is that req is a
// Readable and res is a Writable.


const http = require("http");

const results = {};
const T0 = process.hrtime.bigint();
const ms = () => Number(process.hrtime.bigint() - T0) / 1e6;


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// The request lifecycle:
// a TCP connection is accepted, Node's HTTP parser reads the request line
// and headers and emits 'request' with a Readable req and a Writable res,
// Express walks its stack until something writes a response, and the
// response is finished — after which the socket is either reused
// (keep-alive) or closed.
//
// If interviewer says "explain it simply", say:
//   "A socket opens. Node parses the request line and the headers, and the
//    moment the headers are complete it hands your app a request object and
//    a response object. The body hasn't necessarily arrived yet — req is an
//    open readable stream. Express then walks its middleware stack, and the
//    request ends when someone writes a response. Then 'finish' fires, and
//    the connection is either kept alive for the next request or closed."
//
// If interviewer says "why does the headers-first part matter?", say:
//   "Because it explains three things at once. It's why body parsing is a
//    middleware — someone has to consume the stream and turn it into
//    req.body, and that can only be done once. It's why you can reject a
//    request on Content-Length before reading a single byte of an upload.
//    And it's why a route that never reads the body can leave an unread
//    stream behind, which stalls keep-alive on that socket."
//
// Why it matters in interviews:
//   Almost every 'weird' Express behaviour lives at a lifecycle boundary:
//   headers-sent errors, req.body undefined, uploads that hang, handlers
//   that keep burning CPU after the user closed the tab. Knowing the order
//   is what lets you place a bug on the timeline instead of guessing.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   HEADERS FIRST, BODY LATER. req IS A STREAM, res IS A STREAM.
//
// Runtime rule:
//   'request' fires on header completion. Everything Express does — routing,
//   middleware, params — happens against headers and the URL alone, unless a
//   middleware explicitly consumes the body stream. On the way out,
//   res.statusCode and res.setHeader are editable only until the first byte
//   of the response is written; after that they throw.
//
// Practical rule:
//   Put cheap, header-only decisions first: CORS, rate limiting, auth,
//   Content-Length rejection. Parse the body only on the routes that need
//   it. Use res.on('finish') for anything that must run after the response
//   — never code after next().
//
// Common trap:
//   Thinking req.body exists. Nothing populates it unless a body-parsing
//   middleware ran BEFORE the handler and consumed the stream.
//
// The mental picture:
//
//   TCP connection ─┐
//                   ├─ request line + headers parsed ──▶ 'request'
//                   │        │                              │
//                   │        │  req (Readable, body pending) │
//                   │        └──────────────────────────────▶ Express stack
//                   │                                             │
//                   │   body chunks arrive in parallel ───────────┤
//                   │                                             ▼
//                   │                                   res.write / res.end
//                   │                                             │
//                   │                              'finish' ◀─────┘
//                   └── socket kept alive for the next request ──▶ (or closed)


// ══════════════════════════════════════════════════════════════════
// § 3 — THE WHOLE TIMELINE, INSTRUMENTED
// ══════════════════════════════════════════════════════════════════

function request(port, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1", port, path,
        method: opts.method || "GET",
        headers: opts.headers,
        agent: opts.agent,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }
    );
    req.on("error", reject);
    if (opts.abortAfterMs) setTimeout(() => req.destroy(new Error("CLIENT_ABORT")), opts.abortAfterMs);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const sleep = (n) => new Promise((r) => setTimeout(r, n));

async function section3() {
  console.log("\n══ § 3 — one request, every stage, in order ══\n");

  const trace = [];
  const mark = (label) => trace.push(label);

  const server = http.createServer();

  server.on("connection", () => mark("1. socket 'connection'  (TCP accepted)"));

  server.on("request", (req, res) => {
    mark("2. server 'request'    (request line + HEADERS parsed)");

    res.on("finish", () => mark("7. res 'finish'        (last byte handed to the socket)"));
    res.on("close",  () => mark("8. res 'close'         (response object done)"));
    req.on("end",    () => mark("-- req 'end'           (body stream exhausted)"));

    // ── the Express part of the lifecycle: a stack walk (01 §3) ──
    const stack = [
      (rq, rs, next) => { mark("3. middleware: logger"); next(); },
      (rq, rs, next) => { mark("4. middleware: auth");   next(); },
      (rq, rs) => {
        mark("5. route handler");
        mark("6. res.end()");
        rs.end("done");
      },
    ];
    let i = 0;
    (function next() { const fn = stack[i++]; if (fn) fn(req, res, next); })();
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  await request(port, "/x");
  await sleep(30);                      // let 'finish'/'close' land
  server.close();

  results.timeline = trace.slice();

  trace.forEach((t) => console.log("   " + t));
  console.log("\n  Three things to read out of that list:");
  console.log("   • 'request' fires after the HEADERS, not after the body. Every");
  console.log("     routing decision Express makes happens at that moment.");
  console.log("   • res.end() and 'finish' are two different events. end() means 'I");
  console.log("     have no more to write'; 'finish' means it actually left. Anything");
  console.log("     that must run after the response — metrics, timing, cleanup —");
  console.log("     belongs on 'finish', not after next() (02 §4).");
  console.log("   • 'close' fires last for a healthy response. §6 shows the case where");
  console.log("     it fires WITHOUT 'finish', which is how you detect an abandoned");
  console.log("     request.");
}


// ══════════════════════════════════════════════════════════════════
// § 4 — YOUR HANDLER RUNS BEFORE THE BODY ARRIVES
// ══════════════════════════════════════════════════════════════════
//
// The single most load-bearing fact of the lifecycle, measured: the handler
// is entered, does work, and only later does the body finish arriving.

async function section4() {
  console.log("\n══ § 4 — headers are early; the body is late ══\n");

  const events = [];
  const server = http.createServer((req, res) => {
    events.push({ at: "handler-entered", contentLength: req.headers["content-length"], bodySoFar: 0 });

    let bytes = 0;
    req.on("data", (chunk) => { bytes += chunk.length; events.push({ at: "body-chunk", bodySoFar: bytes }); });
    req.on("end", () => {
      events.push({ at: "body-end", bodySoFar: bytes });
      res.end("received " + bytes + " bytes");
    });
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const payload = JSON.stringify({ hello: "world", pad: "x".repeat(200) });
  const r = await request(port, "/upload", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
    body: payload,
  });
  server.close();

  results.lifecycleEvents = events;
  results.uploadBody = r.body;
  results.knewLengthBeforeBody =
    events[0].at === "handler-entered" &&
    events[0].bodySoFar === 0 &&
    Number(events[0].contentLength) === Buffer.byteLength(payload);

  events.forEach((e) => console.log("   " + e.at.padEnd(16), "bytes so far:", e.bodySoFar,
    e.contentLength ? "  (content-length header already known: " + e.contentLength + ")" : ""));
  console.log("\n  response:", JSON.stringify(r.body));
  console.log("\n  At the moment the handler was entered, ZERO body bytes had been read");
  console.log("  — and Content-Length was already known. That gap is where the cheap");
  console.log("  rejections live:");
  console.log("     if (+req.headers['content-length'] > MAX) {");
  console.log("       res.statusCode = 413; return res.end('too large');");
  console.log("     }");
  console.log("  Rejecting a 2 GB upload costs you nothing if you do it here, and costs");
  console.log("  you 2 GB of transfer if you wait for the body.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — THE BODY IS A STREAM, AND A STREAM IS READ ONCE
// ══════════════════════════════════════════════════════════════════
//
// This is why express.json() exists, why it must run before the handler, and
// why "just parse it again in the handler" does not work.

async function section5() {
  console.log("\n══ § 5 — read the body twice, get nothing the second time ══\n");

  // A body parser, written out in full — it is nothing but a stream consumer.
  function jsonParser(req, res, next) {
    if (req.headers["content-type"] !== "application/json") return next();
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { req.body = JSON.parse(raw); req.rawLength = raw.length; next(); }
      catch (e) { res.statusCode = 400; res.end("invalid json"); }
    });
  }

  const server = http.createServer((req, res) => {
    jsonParser(req, res, () => {
      // Second consumer, after the parser already drained the stream:
      let secondRead = "";
      req.on("data", (c) => (secondRead += c));
      const finish = () => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          bodyFromParser: req.body,
          rawLengthFirstRead: req.rawLength,
          secondReadLength: secondRead.length,
          streamEnded: req.readableEnded,
        }));
      };
      // 'end' already fired for this stream, so it will never fire again —
      // wait a tick and report what the second reader actually collected.
      setTimeout(finish, 20);
    });
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const payload = JSON.stringify({ user: "ada", role: "admin" });
  const r = JSON.parse((await request(port, "/echo", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
    body: payload,
  })).body);
  server.close();

  results.parsedBody = r.bodyFromParser;
  results.rawLengthFirstRead = r.rawLengthFirstRead;
  results.secondReadLength = r.secondReadLength;
  results.streamEndedAfterParse = r.streamEnded;

  console.log("  req.body after the parser :", JSON.stringify(r.bodyFromParser));
  console.log("  bytes read by the parser  :", r.rawLengthFirstRead);
  console.log("  bytes read by a SECOND    :", r.secondReadLength, " ← the stream is spent");
  console.log("  req.readableEnded         :", r.streamEnded);
  console.log("\n  Everything about body parsing follows from this one property:");
  console.log("   • It has to be a middleware, because someone must consume the stream");
  console.log("     before your handler runs.");
  console.log("   • It has to run BEFORE the route, or req.body is undefined (01 §4).");
  console.log("   • Only ONE parser can win. Two body parsers on the same request:");
  console.log("     the second one sees an exhausted stream and hangs waiting for an");
  console.log("     'end' event that already fired — a classic mystery timeout.");
  console.log("   • If you need the raw body too (webhook signature checks), you must");
  console.log("     capture it during that single read — there is no going back.");
  console.log("     → 13_body-parsing-json-urlencoded.js");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — THE RESPONSE HALF: MUTABLE, THEN FROZEN
// ══════════════════════════════════════════════════════════════════

async function section6() {
  console.log("\n══ § 6 — headers are editable until the first byte ══\n");

  const probe = {};
  const server = http.createServer((req, res) => {
    probe.beforeAnything = res.headersSent;
    res.statusCode = 201;
    res.setHeader("x-stage", "before-write");
    probe.afterSetHeader = res.headersSent;

    res.write("chunk-1");                       // ← headers go out with this
    probe.afterFirstWrite = res.headersSent;

    try { res.setHeader("x-late", "nope"); probe.lateSetHeaderThrew = false; }
    catch (e) { probe.lateSetHeaderThrew = e.code; }

    res.statusCode = 500;                        // silently ignored, no throw
    probe.statusAfterWriteIgnored = true;

    res.end("chunk-2");
    probe.afterEnd = { writableEnded: res.writableEnded, headersSent: res.headersSent };
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const r = await request(port, "/mutate");
  server.close();

  results.headerProbe = probe;
  results.mutateStatus = r.status;
  results.mutateHeader = r.headers["x-stage"];
  results.mutateLateHeader = r.headers["x-late"];
  results.mutateBody = r.body;

  console.log("  res.headersSent before anything :", probe.beforeAnything);
  console.log("  after setHeader()               :", probe.afterSetHeader, " ← still false, still editable");
  console.log("  after the first res.write()     :", probe.afterFirstWrite, " ← frozen from here");
  console.log("  setHeader() after that          :", probe.lateSetHeaderThrew, " ← throws");
  console.log("  statusCode = 500 after that     : silently ignored (no throw)");
  console.log("\n  client received: status", r.status, " x-stage:", r.headers["x-stage"],
              " x-late:", r.headers["x-late"]);
  console.log("  body:", JSON.stringify(r.body));
  console.log("\n  Note the asymmetry, because it is a real debugging trap: a late");
  console.log("  setHeader() THROWS and you find out immediately; a late statusCode");
  console.log("  assignment is silently discarded and you find out from a customer.");
  console.log("  That is why 03 §8's `if (res.headersSent)` check exists.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — 'finish' VS 'close': THE CLIENT THAT HUNG UP
// ══════════════════════════════════════════════════════════════════
//
// A request that is abandoned mid-flight does not stop your handler. The
// event loop has no idea the work became pointless.

async function section7() {
  console.log("\n══ § 7 — the client left; the work continued ══\n");

  const state = { finish: false, close: false, workCompleted: false, aborted: null };

  const server = http.createServer((req, res) => {
    res.on("finish", () => { state.finish = true; });
    res.on("close",  () => { state.close = true; state.aborted = !res.writableFinished; });

    // an "expensive" operation that keeps running regardless
    setTimeout(() => {
      state.workCompleted = true;
      if (!res.writableEnded && !res.destroyed) res.end("late answer");
    }, 150);
  });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  let clientErr = null;
  try { await request(port, "/slow", { abortAfterMs: 40 }); }
  catch (e) { clientErr = e.message; }

  await sleep(250);
  server.close();

  results.abort = { ...state, clientErr };

  console.log("  client aborted after 40ms; handler needed 150ms");
  console.log("    res 'finish' fired      :", state.finish, " ← the response never completed");
  console.log("    res 'close'  fired      :", state.close);
  console.log("    detected as aborted     :", state.aborted, " (close without writableFinished)");
  console.log("    expensive work finished :", state.workCompleted, " 🐛 nobody was waiting");
  console.log("\n  That combination — 'close' fired, 'finish' did not — IS the abort");
  console.log("  signal. Two things follow:");
  console.log("   • Metrics on 'finish' silently under-count. A dashboard built only");
  console.log("     on 'finish' shows a healthy p99 while users are timing out and");
  console.log("     hitting refresh — and each refresh starts ANOTHER 150ms of work");
  console.log("     on top of the abandoned one.");
  console.log("   • For expensive handlers, check res.writableEnded / listen for");
  console.log("     'close' and bail out. Databases have cancellation tokens and");
  console.log("     AbortSignal exists for exactly this.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — KEEP-ALIVE: THE LIFECYCLE IS NOT THE CONNECTION
// ══════════════════════════════════════════════════════════════════

async function section8() {
  console.log("\n══ § 8 — two requests, one TCP connection ══\n");

  let connections = 0;
  let requests = 0;

  const server = http.createServer((req, res) => { requests++; res.end("ok"); });
  server.on("connection", () => { connections++; });

  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const keepAliveAgent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  await request(port, "/a", { agent: keepAliveAgent });
  await request(port, "/b", { agent: keepAliveAgent });
  const keepAliveStats = { connections, requests };

  connections = 0; requests = 0;
  const closeAgent = new http.Agent({ keepAlive: false });
  await request(port, "/a", { agent: closeAgent });
  await request(port, "/b", { agent: closeAgent });
  const closeStats = { connections, requests };

  keepAliveAgent.destroy();
  closeAgent.destroy();
  server.close();

  results.keepAlive = keepAliveStats;
  results.noKeepAlive = closeStats;

  console.log("  keep-alive agent : connections =", keepAliveStats.connections,
              " requests =", keepAliveStats.requests);
  console.log("  connection:close : connections =", closeStats.connections,
              " requests =", closeStats.requests);
  console.log("\n  So the request lifecycle is NOT the connection lifecycle. One socket");
  console.log("  can carry many request/response pairs, one after another.");
  console.log("\n  Consequences worth naming in an interview:");
  console.log("   • Anything you attach to the SOCKET outlives the request. Storing");
  console.log("     per-request state on req.socket leaks it into the next request on");
  console.log("     the same connection — an authentication bug waiting to happen.");
  console.log("   • A request whose body you never read can block the parser from");
  console.log("     starting the next request on that socket.");
  console.log("   • Per-request state goes on req (which is new every time), and");
  console.log("     cleanup goes on 'finish'/'close' — never on socket events.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — THE COMPLETE MAP OF THIS GROUP
// ══════════════════════════════════════════════════════════════════
//
//   STAGE                                WHAT RUNS            EXPLAINED IN
//   ─────────────────────────────────────────────────────────────────────
//   TCP connection accepted              (Node/libuv)         2B.1 §02 libuv
//   request line + headers parsed        (Node http parser)   §3, §4
//   'request' emitted → app(req, res)    the stack walk       01 §3
//     ├ helmet / cors                    header-only work     10, 11
//     ├ rate limiter                     header-only work     12
//     ├ body parsers                     CONSUME the stream   §5, 13, 14
//     ├ cookies / session                header + store       15, 16
//     ├ static file check                fs, may respond      09
//     ├ routers, params                  matching             04, 05, 06
//     └ route handler                    your code            —
//   next(err) at any point               error mode           02 §5, 03
//   res.status/setHeader                 mutable window       §6
//   first res.write()                    HEADERS FROZEN       §6
//   res.end()                            done writing         §3
//   'finish'                             actually sent        §3, §7
//   'close'                              response released    §3, §7
//   socket reused or closed              keep-alive           §8
//
// Read top to bottom, that table is the whole group in one page — and it is
// the answer to "walk me through what happens when a request hits your
// Express app," which is one of the most common senior Node openers.


// ══════════════════════════════════════════════════════════════════
// § 10 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — req.body is undefined. No parser ran before the handler, or it ran
//   after it. The stream was never consumed. → §5, 01 §4
//
// Bug 2 — An upload endpoint hangs forever. Two body parsers; the second
//   waits for an 'end' that already fired. → §5
//
// Bug 3 — A webhook signature check fails because the raw body was lost —
//   the JSON parser consumed the only read. → §5
//
// Bug 4 — 413-worthy uploads accepted in full before being rejected,
//   because the size check happened after parsing instead of on
//   Content-Length. → §4
//
// Bug 5 — "Cannot set headers after they are sent" from any code that runs
//   after the first res.write(). → §6, 02 §7
//
// Bug 6 — A status code set after the first write is silently ignored, so a
//   failed request is logged as a 200. → §6
//
// Bug 7 — Latency dashboards that look healthy while users time out: the
//   metric is on 'finish', and abandoned requests only ever fire 'close'.
//   → §7
//
// Bug 8 — CPU burned on abandoned requests, then multiplied by users
//   hitting refresh. → §7
//
// Bug 9 — Per-request state stored on req.socket leaking into the next
//   request on a keep-alive connection. → §8
//
// Bug 10 — Timing middleware measuring the wrong span because it used code
//   after next() instead of res.on('finish'). → §3, 02 §4


// ══════════════════════════════════════════════════════════════════
// § 11 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 11 — assertions ══\n");

  // § 3 — ordering:
  const t = results.timeline;
  const idx = (needle) => t.findIndex((x) => x.includes(needle));
  assert.ok(idx("connection") < idx("'request'"),
    "the TCP connection was accepted before the HTTP request was parsed ✅");
  assert.ok(idx("'request'") < idx("middleware: logger"),
    "…and the request event preceded the first middleware");
  assert.ok(idx("middleware: logger") < idx("middleware: auth"),
    "…middleware ran in registration order (01 §3)");
  assert.ok(idx("middleware: auth") < idx("route handler"),
    "…then the route handler");
  assert.ok(idx("res.end()") < idx("'finish'"),
    "…res.end() came BEFORE 'finish' — they are two different moments ✅");
  assert.ok(idx("'finish'") < idx("'close'"),
    "…and 'close' fired last for a healthy response");

  // § 4 — headers before body:
  assert.equal(results.lifecycleEvents[0].at, "handler-entered",
    "the handler was entered first ✅");
  assert.equal(results.lifecycleEvents[0].bodySoFar, 0,
    "…with ZERO body bytes read at that point 🐛 (for anyone expecting req.body)");
  assert.equal(results.knewLengthBeforeBody, true,
    "…while Content-Length was already known — enough to reject an oversized upload for free ✅");
  assert.equal(results.lifecycleEvents.at(-1).at, "body-end",
    "…and the body finished arriving only afterwards");

  // § 5 — a stream is read once:
  assert.deepEqual(results.parsedBody, { user: "ada", role: "admin" },
    "the parser consumed the stream and produced req.body ✅");
  assert.ok(results.rawLengthFirstRead > 0, "…having read the whole payload");
  assert.equal(results.secondReadLength, 0,
    "…and a SECOND reader got 0 bytes — the stream is spent 🐛");
  assert.equal(results.streamEndedAfterParse, true,
    "…req.readableEnded confirms it: there is no second read to be had");

  // § 6 — the mutable window:
  const p = results.headerProbe;
  assert.equal(p.beforeAnything, false, "headers were not sent at handler entry");
  assert.equal(p.afterSetHeader, false, "…still not sent after setHeader — the window is open");
  assert.equal(p.afterFirstWrite, true, "…the FIRST res.write() sent them ✅");
  assert.equal(p.lateSetHeaderThrew, "ERR_HTTP_HEADERS_SENT",
    "…a setHeader() after that threw loudly ✅");
  assert.equal(results.mutateStatus, 201,
    "…while a statusCode assignment after the write was SILENTLY ignored — 201 stood 🐛");
  assert.equal(results.mutateLateHeader, undefined, "…and the late header never reached the client");
  assert.equal(results.mutateBody, "chunk-1chunk-2");

  // § 7 — abort:
  assert.equal(results.abort.finish, false,
    "an aborted request never fired 'finish' ✅");
  assert.equal(results.abort.close, true, "…but 'close' did fire — that pair IS the abort signal");
  assert.equal(results.abort.aborted, true, "…detectable as close-without-writableFinished");
  assert.equal(results.abort.workCompleted, true,
    "…and the expensive handler ran to completion anyway, for nobody 🐛");

  // § 8 — keep-alive:
  assert.deepEqual(results.keepAlive, { connections: 1, requests: 2 },
    "two requests travelled over ONE TCP connection with keep-alive ✅");
  assert.equal(results.noKeepAlive.connections, 2,
    "…and without it, each request opened its own connection");
  assert.equal(results.noKeepAlive.requests, 2);

  console.log("§11 — mini assertions passed for: Request lifecycle");
  console.log("\n  The pair that captures it: the handler was entered with 0 body bytes");
  console.log("  read but Content-Length already known — and an aborted request fired");
  console.log("  'close' without 'finish' while its handler kept working to completion.");
}


// ══════════════════════════════════════════════════════════════════
// § 12 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "walk me through what happens when a request hits your Express
// app", answer:
//
//   "A TCP connection is accepted, and Node's HTTP parser reads the request
//    line and the headers. The moment the headers are complete it emits
//    'request' with a req that's a Readable stream and a res that's a
//    Writable. That timing is the key fact: my handler runs when the headers
//    have arrived, not the body.
//
//    Express then walks its middleware stack in registration order until
//    something responds. Everything early in that stack — CORS, helmet, rate
//    limiting, auth — is header-only work, which is why it's cheap and why
//    it belongs first. Body parsing is different: it's a middleware because
//    someone has to consume the request stream and turn it into req.body,
//    and a stream can only be read once. I can demonstrate that — after
//    express.json() has run, a second reader on the same request gets zero
//    bytes. That single property explains why req.body is undefined if the
//    parser is registered after the route, why two body parsers make an
//    endpoint hang, and why you have to capture the raw body during that one
//    read if you need it for a webhook signature.
//
//    On the way out: statusCode and headers are mutable until the first byte
//    is written, then frozen. A setHeader after that throws; a statusCode
//    assignment after that is silently ignored, which is nastier. res.end()
//    means 'nothing more to write'; 'finish' means it actually went out. So
//    anything that has to happen after a response — timing, metrics, cleanup
//    — goes on res.on('finish'), not after next().
//
//    Two more things I'd mention because they bite in production. If a
//    client hangs up mid-request you get 'close' without 'finish' — that
//    pair is the abort signal, and it matters twice: metrics built only on
//    'finish' under-count exactly the requests users are complaining about,
//    and the handler keeps burning CPU for a response nobody will read. And
//    with keep-alive, one socket carries many request/response pairs, so the
//    request lifecycle isn't the connection lifecycle — per-request state
//    goes on req, never on req.socket, or it leaks into the next request."
//
// "Headers first, body later" is the sentence to lead with. Everything else
// in this file is a consequence of it.


// ══════════════════════════════════════════════════════════════════
// § 13 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. When exactly does your handler start running?
// A1. When the headers are parsed. The body may still be arriving (§4).
//
// Q2. Why is body parsing a middleware and not a built-in property?
// A2. Because the body is a stream someone must consume, and it can only be
//     read once (§5).
//
// Q3. What happens if two body parsers run on one request?
// A3. The second sees an exhausted stream and waits for an 'end' that
//     already fired — the endpoint hangs (§5).
//
// Q4. How do you reject a huge upload cheaply?
// A4. Check Content-Length in a header-only middleware before any parsing,
//     and return 413 (§4).
//
// Q5. Until when can you set headers?
// A5. Until the first byte is written. res.headersSent tells you (§6).
//
// Q6. setHeader vs statusCode after that point?
// A6. setHeader throws ERR_HTTP_HEADERS_SENT; statusCode is silently
//     ignored (§6).
//
// Q7. Difference between res.end() and 'finish'?
// A7. end() is your declaration; 'finish' is the confirmation the last byte
//     was handed to the socket (§3).
//
// Q8. How do you detect an aborted request?
// A8. 'close' fired without 'finish' (res.writableFinished false). Modern
//     Node also exposes req.destroyed / an AbortSignal (§7).
//
// Q9. Does an abort stop your handler?
// A9. No. Nothing cancels it. You have to check and bail out (§7).
//
// Q10. Where should timing/metrics go?
// A10. res.on('finish') for successful responses, plus 'close' to catch
//      aborts. Never code after next() (§3, 02 §4).
//
// Q11. Is one request one connection?
// A11. No — keep-alive multiplexes many requests over one socket (§8).
//
// Q12. Why is storing state on req.socket dangerous?
// A12. The socket outlives the request; the next request on the same
//      connection inherits it (§8).
//
// Q13. What happens if a handler never reads the request body?
// A13. Unread data sits in the socket buffer; Node may need it drained
//      before parsing the next request on that connection — a stall that
//      looks like intermittent slowness.
//
// Q14. Where do sync and async errors enter this timeline?
// A14. A sync throw is caught by the dispatcher at whatever stage it
//      happens; an async rejection on Express 4 never enters the timeline at
//      all → 02 §8, 03.


// ══════════════════════════════════════════════════════════════════
// § 14 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: When does 'request' fire?
//   Back : After the request line + headers are parsed. Body still pending.
//
// Flashcard 2:
//   Front: What are req and res?
//   Back : A Readable stream and a Writable stream.
//
// Flashcard 3:
//   Front: Why must express.json() come before the route?
//   Back : Something must consume the stream first; it can only be read once.
//
// Flashcard 4:
//   Front: Second read of a consumed body?
//   Back : 0 bytes. readableEnded is true.
//
// Flashcard 5:
//   Front: When are headers frozen?
//   Back : At the first res.write() / res.end().
//
// Flashcard 6:
//   Front: Late setHeader vs late statusCode?
//   Back : Throws vs silently ignored.
//
// Flashcard 7:
//   Front: Abort signature?
//   Back : 'close' without 'finish'.
//
// Flashcard 8:
//   Front: Keep-alive: requests per connection?
//   Back : Many. Request lifecycle ≠ connection lifecycle.
//
// Flashcard 9:
//   Front: Where does post-response code go?
//   Back : res.on('finish'), not after next().
//
// Flashcard 10:
//   Front: How do you sound senior?
//   Back : "Headers first, body later — that one fact explains body parsing,
//          cheap 413s, and half the header-sent errors."


// ══════════════════════════════════════════════════════════════════
// § 15 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Write the Content-Length guard from §4 and prove a 2 MB payload is
//   rejected with 413 while zero body bytes were read.
//
// Task 2:
//   Build a raw-body-capturing JSON parser (keep the raw string AND the
//   parsed object) and use it to verify an HMAC signature over the raw
//   bytes.
//
// Task 3:
//   Add a timing middleware on res.on('finish') and one using code after
//   next(). Make the route respond after a 50ms timer and compare the two
//   numbers.
//
// Task 4:
//   Extend §7: listen for 'close' and cancel the work with an AbortController.
//   Measure the CPU you just stopped wasting.
//
// Task 5:
//   Reproduce the two-body-parsers hang from §5's notes. Then add a guard:
//   skip parsing if req.readableEnded is already true.
//
// Task 6:
//   Store a value on req.socket in one request and read it in the next over
//   a keep-alive agent. Watch it leak across requests (§8).
//
// Task 7:
//   Instrument a real Express app's lifecycle with the same trace as §3
//   using app.use at the top, res.on('finish'), and res.on('close'). Compare
//   the order against this file's output.
//
// Task 8:
//   Write a handler that never reads the request body of a large POST over
//   a keep-alive connection, then send a second request on the same socket.
//   Time it. Explain the delay.


// ══════════════════════════════════════════════════════════════════
// § 16 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   The handler runs when the HEADERS are parsed, not the body — req is a
//   Readable that hasn't been consumed yet, and it can only be consumed once.
//
// If you remember the common bug:
//   req.body undefined, because nothing consumed the stream before the
//   handler ran — and its cousin, an endpoint that hangs because two things
//   tried to consume it.
//
// If you remember the professional framing:
//   Header-only work first, body parsing only where needed, headers set
//   before the first write, post-response work on 'finish', abort detected
//   as 'close' without 'finish', and per-request state never on the socket.
//
// ─────────────────────────────────────────────────────────────────
// The timeline ends at "someone writes a response" — and every file so far
// has written one with a bare res.end(). Express gives you res.json(),
// res.send(), res.sendStatus() and friends, and the differences between them
// are not cosmetic: content types, ETags, and one genuinely dangerous
// overload.
//
// NEXT TOPIC -> 08_res-json-vs-res-send.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section3();
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
