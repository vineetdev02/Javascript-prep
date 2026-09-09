// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  13_body-parsing-json-urlencoded.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: Body parsing (json, urlencoded)
//
// WHAT YOU WILL MASTER HERE:
//   1. express.json() written out in full — thirty lines that consume the
//      request stream, and every behaviour people memorise falls out of them
//   2. The Content-Type gate, measured: five different headers, and the
//      three that leave req.body undefined with no error at all
//   3. The size limit enforced DURING streaming: a 5 MB body rejected with
//      413 after reading roughly 100 KB, not 5 MB
//   4. urlencoded extended vs simple, and why it is the same qs decision
//      06 §6 already made for the query string
//   5. Raw body capture for webhook signatures — and proof that
//      re-serialising the parsed object produces a different signature
//   6. Malformed JSON becoming a 400 instead of a 500, and the check that
//      makes that happen
//   7. Prototype pollution executed: a JSON body that adds a property to
//      Object.prototype, and the three-line fix
//   8. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/13_body-parsing-json-urlencoded.js"
//
// Prerequisites: 07_request-lifecycle.js §4 and §5 — the handler runs before
// the body arrives, and the body is a stream that can be read exactly once.
// This file is what you build on top of that fact. Also 03 (errors reach a
// 4-argument handler) and 06 §6 (the extended/simple parser split).


const http = require("http");
const crypto = require("crypto");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// Body parsing middleware:
// a middleware that decides — from Content-Type — whether this request's
// body is its business, consumes the request stream if so while enforcing a
// byte limit, parses the collected bytes, and attaches the result as
// req.body before calling next().
//
// If interviewer says "explain it simply", say:
//   "req is a stream and nothing reads it for you. express.json() is the
//    thing that reads it. It checks the Content-Type first — if it isn't
//    JSON it calls next() and does nothing at all — then buffers the chunks
//    up to a limit, runs JSON.parse, and sets req.body. Everything people
//    find surprising about it is one of those four steps."
//
// If interviewer says "why is req.body undefined so often?", say:
//   "Three reasons, in order of frequency. The parser is registered below
//    the route, so it never ran. The Content-Type doesn't match, so the
//    parser skipped the request deliberately and silently. Or there is no
//    parser for that type at all — express.json() will not touch a
//    multipart upload, which is what Multer is for."
//
// Why it matters in interviews:
//   It's the clearest place to show you understand streams, because every
//   quirk — the read-once rule, the early 413, the raw-body problem for
//   webhooks — is a direct consequence of the body being a stream rather
//   than a value.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   IT IS A STREAM CONSUMER WITH A TYPE GATE. NO MATCH, NO BODY, NO ERROR.
//
// Runtime rule:
//   Content-Type matches? → accumulate chunks, counting bytes → over the
//   limit? destroy and next(413) → otherwise parse → set req.body → next().
//   No match? → next() immediately, req.body untouched.
//
// Practical rule:
//   express.json({ limit: '100kb' }) and express.urlencoded({ extended:
//   false }) above your routes, below helmet/cors/rate-limit. Capture the
//   raw body with the verify hook if anything you integrate with signs
//   payloads. Convert SyntaxError to 400 in your error handler.
//
// Common trap:
//   Assuming req.body is always an object. With no matching parser it is
//   undefined, so `req.body.email` throws TypeError before your validation
//   ever runs — a 500 for what should be a 400.
//
// The mental picture:
//
//   POST /orders  Content-Type: application/json
//        │
//   express.json() ── type matches? ──no──▶ next()   req.body stays undefined
//        │ yes
//        ├─ 'data' chunk ─▶ bytes += chunk.length ─▶ over limit? ─▶ 413, destroy
//        ├─ 'data' chunk ─▶ …
//        └─ 'end' ─▶ verify(raw) ─▶ JSON.parse ─▶ req.body ─▶ next()
//                        │                  └─ throws ─▶ next(SyntaxError) → 400
//                        └─ raw kept for signature checks (§7)


// ══════════════════════════════════════════════════════════════════
// § 3 — WRITING express.json() AND express.urlencoded()
// ══════════════════════════════════════════════════════════════════

function typeMatches(req, expected) {
  const ct = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  return ct === expected;
}

function json({ limit = 100 * 1024, type = "application/json", verify = null,
                destroyOnLimit = false } = {}) {
  return function jsonParser(req, res, next) {
    // ── THE GATE. Everything about "req.body is undefined" starts here. ──
    if (!typeMatches(req, type)) return next();

    let bytes = 0;
    const chunks = [];
    let finished = false;
    const done = (err) => { if (finished) return; finished = true; next(err); };

    req.on("data", (chunk) => {
      if (finished) return;
      bytes += chunk.length;
      if (bytes > limit) {                       // enforced DURING the stream (§5)
        const err = new Error("request entity too large");
        err.status = 413;
        err.type = "entity.too.large";
        err.buffered = bytes;                    // what we held in memory
        chunks.length = 0;                       // release it immediately
        // Two ways to stop, and they trade different things (§5):
        //   resume() — keep draining the socket, discarding bytes, so the
        //              413 can actually be delivered to the client
        //   destroy() — hang up now, saving bandwidth, but the client sees a
        //              connection reset instead of your status code
        if (destroyOnLimit) req.destroy(); else req.resume();
        return done(err);
      }
      chunks.push(chunk);
    });

    req.on("error", () => done());
    req.on("end", () => {
      if (finished) return;
      const raw = Buffer.concat(chunks);
      req.rawBody = raw;                          // §7 — keep it, you get one read
      if (verify) {
        try { verify(req, res, raw); } catch (e) { e.status = e.status || 403; return done(e); }
      }
      if (raw.length === 0) { req.body = {}; return done(); }
      try {
        req.body = JSON.parse(raw.toString("utf8"));
        done();
      } catch (e) {
        e.status = 400;                           // §8 — a client error, not a 500
        e.type = "entity.parse.failed";
        done(e);
      }
    });
  };
}

function urlencoded({ limit = 100 * 1024, extended = false } = {}) {
  return function urlencodedParser(req, res, next) {
    if (!typeMatches(req, "application/x-www-form-urlencoded")) return next();

    let bytes = 0;
    const chunks = [];
    let finished = false;
    const done = (err) => { if (finished) return; finished = true; next(err); };

    req.on("data", (chunk) => {
      if (finished) return;
      bytes += chunk.length;
      if (bytes > limit) {
        const err = new Error("request entity too large");
        err.status = 413;
        req.destroy();
        return done(err);
      }
      chunks.push(chunk);
    });
    req.on("error", () => done());
    req.on("end", () => {
      if (finished) return;
      const raw = Buffer.concat(chunks).toString("utf8");
      req.rawBody = raw;
      req.body = parseForm(raw, extended);
      done();
    });
  };
}

// The same two algorithms as 06 §3 — because it is literally the same
// decision, applied to the body instead of the query string.
function parseForm(input, extended) {
  const out = {};
  if (!input) return out;
  const dec = (s) => decodeURIComponent(s.replace(/\+/g, " "));
  for (const pair of input.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = dec(eq === -1 ? pair : pair.slice(0, eq));
    const val = eq === -1 ? "" : dec(pair.slice(eq + 1));
    if (extended) {
      const bracket = /^([^[\]]+)\[([^[\]]*)\]$/.exec(key);
      if (bracket) {
        const [, base, sub] = bracket;
        if (sub === "") { (out[base] ||= []).push(val); continue; }
        if (typeof out[base] !== "object" || Array.isArray(out[base])) out[base] = {};
        out[base][sub] = val;
        continue;
      }
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = Array.isArray(out[key]) ? [...out[key], val] : [out[key], val];
    } else out[key] = val;
  }
  return out;
}

function miniExpress() {
  const stack = [];
  const app = {
    use(fn) { stack.push({ fn }); return app; },
    post(path, fn) { stack.push({ path, method: "POST", fn }); return app; },
    listen() {
      return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
          const urlPath = req.url.split("?")[0];
          let i = 0;
          (function next(err) {
            const layer = stack[i++];
            if (!layer) {
              if (res.writableEnded || res.destroyed) return;
              res.statusCode = err ? err.status || 500 : 404;
              return res.end(err ? "unhandled: " + err.message : "not found");
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

function request(port, path, { method = "POST", headers = {}, body = "" } = {}) {
  return new Promise((resolve) => {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const req = http.request(
      { host: "127.0.0.1", port, path, method, headers: { "content-length": payload.length, ...headers } },
      (res) => {
        let out = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (out += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: out }));
      }
    );
    req.on("error", (e) => resolve({ status: 0, body: "CLIENT_ERROR: " + e.code, headers: {} }));
    req.end(payload);
  });
}

const jsonEcho = (req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ bodyType: typeof req.body, body: req.body ?? null }));
};


// ══════════════════════════════════════════════════════════════════
// § 4 — THE CONTENT-TYPE GATE
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — five Content-Types, three empty bodies ══\n");

  const app = miniExpress();
  app.use(json());
  app.use(urlencoded({ extended: false }));
  app.post("/echo", jsonEcho);

  const { server, port } = await app.listen();

  const cases = {
    "application/json":               { ct: "application/json", body: '{"a":1}' },
    "application/json; charset=utf-8":{ ct: "application/json; charset=utf-8", body: '{"a":1}' },
    "application/x-www-form-urlencoded": { ct: "application/x-www-form-urlencoded", body: "a=1" },
    "text/plain":                     { ct: "text/plain", body: '{"a":1}' },
    "application/JSON (uppercase)":   { ct: "application/JSON", body: '{"a":1}' },
    "(no Content-Type)":              { ct: null, body: '{"a":1}' },
  };

  const table = {};
  for (const [label, c] of Object.entries(cases)) {
    const r = await request(port, "/echo", { headers: c.ct ? { "content-type": c.ct } : {}, body: c.body });
    table[label] = JSON.parse(r.body);
  }
  server.close();

  results.gateTable = table;

  console.log("  Content-Type sent                    typeof req.body   req.body");
  console.log("  ─────────────────────────────────────────────────────────────────");
  for (const [label, v] of Object.entries(table)) {
    console.log("  " + label.padEnd(37) + v.bodyType.padEnd(18) + JSON.stringify(v.body));
  }
  console.log("\n  The three 'undefined' rows are not failures — they are the parser");
  console.log("  correctly declining a request that is not its business, and calling");
  console.log("  next(). No error is raised, nothing is logged, and your handler then");
  console.log("  does req.body.email and throws TypeError. A 500 for what should have");
  console.log("  been a 400.");
  console.log("\n  Note the uppercase row: the media type is compared case-insensitively,");
  console.log("  and parameters after the ';' are ignored, which is why charset=utf-8");
  console.log("  works. Note also that 'text/plain' carrying valid JSON is still");
  console.log("  skipped — the gate is the DECLARED type, never the content.");
  console.log("\n  Defensive habit worth adopting: a small middleware after the parsers");
  console.log("  that rejects a body-bearing method with no req.body, so the failure is");
  console.log("  a clear 415 instead of a TypeError three functions later.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — THE LIMIT, ENFORCED WHILE STREAMING
// ══════════════════════════════════════════════════════════════════

async function section5() {
  console.log("\n══ § 5 — a 5 MB body rejected after ~100 KB ══\n");

  function build(destroyOnLimit) {
    const app = miniExpress();
    app.use(json({ limit: 100 * 1024, destroyOnLimit }));
    app.post("/upload", (req, res) => { res.end("accepted " + JSON.stringify(req.body).length); });
    app.use((err, req, res, next) => {
      if (res.destroyed || res.writableEnded) return;
      res.statusCode = err.status || 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: err.type || "error", buffered: err.buffered ?? null }));
    });
    return app;
  }

  const drainApp = await build(false).listen();
  const destroyApp = await build(true).listen();

  const headers = { "content-type": "application/json" };
  const small = JSON.stringify({ pad: "x".repeat(1000) });
  const huge = JSON.stringify({ pad: "x".repeat(5 * 1024 * 1024) });

  const okRes = await request(drainApp.port, "/upload", { headers, body: small });
  const drainRes = await request(drainApp.port, "/upload", { headers, body: huge });
  const destroyRes = await request(destroyApp.port, "/upload", { headers, body: huge });

  drainApp.server.close();
  destroyApp.server.close();

  results.limitOk = { status: okRes.status, body: okRes.body };
  results.limitRejected = { status: drainRes.status, body: drainRes.body };
  results.bufferedBeforeReject = JSON.parse(drainRes.body).buffered;
  results.limitDestroyed = { status: destroyRes.status, body: destroyRes.body };
  results.payloadSize = huge.length;

  console.log("  1 KB body                     →", okRes.status, JSON.stringify(okRes.body));
  console.log("  5 MB body, drain-then-reply   →", drainRes.status, drainRes.body);
  console.log("  5 MB body, destroy the socket →", destroyRes.status || "(no status)", destroyRes.body);
  console.log("\n  payload offered by the client    :", (results.payloadSize / 1024 / 1024).toFixed(1), "MB");
  console.log("  bytes the parser ever HELD       :", (results.bufferedBeforeReject / 1024).toFixed(0), "KB");
  console.log("  ratio                            : ~" +
              Math.round(results.payloadSize / results.bufferedBeforeReject) + "× less memory\n");
  console.log("  The limit is checked on every 'data' event, so the parser stops");
  console.log("  accumulating the instant the threshold is crossed and drops what it");
  console.log("  had. It never buffers 5 MB in order to discover that 5 MB is too much.");
  console.log("\n  But look at the last two rows, because this is the part nobody");
  console.log("  mentions: stopping the PARSER is not stopping the TRANSFER.");
  console.log("   • Drain and reply: you keep reading the socket and throw the bytes");
  console.log("     away, so the client actually receives your 413. Memory is saved;");
  console.log("     bandwidth is not — the 5 MB still crosses the wire.");
  console.log("   • Destroy the socket: bandwidth is saved, and the client gets a");
  console.log("     connection reset with NO status code at all, which every client");
  console.log("     library reports as a network failure rather than 'too large'.");
  console.log("  Express drains and replies, which is the right default: a diagnosable");
  console.log("  413 is worth more than the bandwidth, and the bandwidth ceiling belongs");
  console.log("  at the proxy (nginx client_max_body_size) where it can refuse before");
  console.log("  the bytes ever reach Node.");
  console.log("\n  Two related notes:");
  console.log("   • Real body-parser also short-circuits on Content-Length before");
  console.log("     reading anything at all (07 §4) — cheaper still, but only for");
  console.log("     honest clients, since a chunked request has no Content-Length.");
  console.log("     Both checks are needed.");
  console.log("   • The default limit is 100kb, which is generous for JSON and far too");
  console.log("     small for a base64 image someone will inevitably POST. Raising it");
  console.log("     globally is the wrong fix: raise it on the one route that needs it.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — urlencoded: extended VS simple
// ══════════════════════════════════════════════════════════════════

async function section6() {
  console.log("\n══ § 6 — the same qs decision, on the body ══\n");

  const ext = miniExpress();
  ext.use(urlencoded({ extended: true }));
  ext.post("/form", jsonEcho);

  const simple = miniExpress();
  simple.use(urlencoded({ extended: false }));
  simple.post("/form", jsonEcho);

  const e = await ext.listen();
  const s = await simple.listen();

  const bodies = [
    "name=ada&role=admin",
    "tag=js&tag=node",
    "user[name]=ada&user[role]=admin",
    "ids[]=1&ids[]=2",
    "note=hello+world%21",
  ];

  const table = {};
  for (const b of bodies) {
    const headers = { "content-type": "application/x-www-form-urlencoded" };
    table[b] = {
      extended: JSON.parse((await request(e.port, "/form", { headers, body: b })).body).body,
      simple: JSON.parse((await request(s.port, "/form", { headers, body: b })).body).body,
    };
  }
  e.server.close();
  s.server.close();

  results.formTable = table;

  console.log("  body                              extended                      simple");
  console.log("  ──────────────────────────────────────────────────────────────────────────────");
  for (const [b, v] of Object.entries(table)) {
    console.log("  " + b.padEnd(34) + JSON.stringify(v.extended).padEnd(30) + JSON.stringify(v.simple));
  }
  console.log("\n  This is 06 §6 again, and the same guidance applies: extended: true");
  console.log("  lets the CALLER choose the shape of your data. A form field you");
  console.log("  validated as a string can arrive as an object because someone renamed");
  console.log("  the input to user[role].");
  console.log("\n  extended: false is the safer default for HTML forms, which never need");
  console.log("  nesting. Choose extended: true deliberately, for an endpoint that");
  console.log("  genuinely accepts structured form data, and validate the shape after");
  console.log("  (→ 17_express-validator.js).");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — THE RAW BODY, AND WHY RE-SERIALISING BREAKS SIGNATURES
// ══════════════════════════════════════════════════════════════════
//
// Stripe, GitHub, Slack and every payment provider sign the exact BYTES they
// sent. You get one read of the stream (07 §5), so if you did not keep those
// bytes, the signature can never be checked again.

async function section7() {
  console.log("\n══ § 7 — webhook signatures need the bytes, not the object ══\n");

  const SECRET = "whsec_test";
  const sign = (buf) => crypto.createHmac("sha256", SECRET).update(buf).digest("hex");

  const app = miniExpress();
  app.use(json({
    verify: (req, res, raw) => { req.rawBody = raw; },     // the capture hook
  }));
  app.post("/webhook", (req, res) => {
    const header = req.headers["x-signature"];

    const fromRaw = sign(req.rawBody);                     // ✅ the bytes we received
    const fromReserialised = sign(Buffer.from(JSON.stringify(req.body)));  // 🐛 rebuilt

    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      rawMatches: crypto.timingSafeEqual(Buffer.from(fromRaw), Buffer.from(header)),
      reserialisedMatches: fromReserialised === header,
      rawLength: req.rawBody.length,
      reserialisedLength: JSON.stringify(req.body).length,
    }));
  });

  const { server, port } = await app.listen();

  // A provider's payload: pretty-printed, keys in their order.
  const payload = '{\n  "id": "evt_1",\n  "amount": 2000,\n  "currency": "usd"\n}';
  const signature = sign(Buffer.from(payload));

  const r = JSON.parse((await request(port, "/webhook", {
    headers: { "content-type": "application/json", "x-signature": signature },
    body: payload,
  })).body);
  server.close();

  results.webhook = r;

  console.log("  provider sent " + r.rawLength + " bytes, signed them, and we received them.\n");
  console.log("    HMAC over req.rawBody                     →", r.rawMatches ? "MATCH ✅" : "mismatch");
  console.log("    HMAC over JSON.stringify(req.body)        →", r.reserialisedMatches ? "match" : "MISMATCH 🐛");
  console.log("    bytes: original", r.rawLength, "vs re-serialised", r.reserialisedLength);
  console.log("\n  The parsed object is correct. It is simply not the same bytes:");
  console.log("  whitespace is gone, and key order and number formatting are whatever");
  console.log("  your JSON.stringify decides. A hash over 'the same data' is not a hash");
  console.log("  over the same bytes.");
  console.log("\n  Hence the verify hook. It runs inside the parser's single read, with");
  console.log("  the raw Buffer in hand, before parsing. Two rules that go with it:");
  console.log("   • Verify BEFORE trusting the payload — ideally throw from verify(),");
  console.log("     so an unsigned request never reaches a handler at all.");
  console.log("   • Compare with crypto.timingSafeEqual, never ===. A signature check");
  console.log("     with a short-circuiting comparison leaks the answer byte by byte.");
  console.log("     (2B.1 · 02_streams-and-buffers/09 §10 Q10 made the same point.)");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — BAD JSON, AND THE POLLUTED PROTOTYPE
// ══════════════════════════════════════════════════════════════════

async function section8() {
  console.log("\n══ § 8 — malformed input, and a body that edits Object.prototype ══\n");

  // ── (a) malformed JSON ──
  // The realistic mistake is NOT the absence of an error handler — the parser
  // sets err.status = 400 itself, and Express's default handler honours it.
  // It is a catch-all handler that ignores err.status, which is the shape
  // almost every codebase ends up with.
  const naive = miniExpress();
  naive.use(json());
  naive.post("/x", jsonEcho);
  naive.use((err, req, res, next) => {
    console.error("[log]", err.message);              // 🐛 everything is a 500
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "server error" }));
  });

  const careful = miniExpress();
  careful.use(json());
  careful.post("/x", jsonEcho);
  careful.use((err, req, res, next) => {
    const badJson = err instanceof SyntaxError && err.type === "entity.parse.failed";
    res.statusCode = badJson ? 400 : err.status || 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: badJson ? "invalid JSON body" : "server error" }));
  });

  const n = await naive.listen();
  const c = await careful.listen();
  const headers = { "content-type": "application/json" };
  const bad = '{"a":1,}';

  const naiveRes = await request(n.port, "/x", { headers, body: bad });
  const carefulRes = await request(c.port, "/x", { headers, body: bad });
  const emptyRes = await request(c.port, "/x", { headers, body: "" });
  n.server.close();
  c.server.close();

  results.badJsonDefault = { status: naiveRes.status };
  results.badJsonHandled = { status: carefulRes.status, body: carefulRes.body };
  results.emptyBody = { status: emptyRes.status, body: emptyRes.body };

  console.log("  (a) malformed JSON: " + bad);
  console.log("      catch-all handler (ignores err.status) →", naiveRes.status,
              " 🐛 a client typo logged as a server fault");
  console.log("      handler that honours err.status        →", carefulRes.status, carefulRes.body, " ✅");
  console.log("      empty body                             →", emptyRes.status, emptyRes.body,
              " ← {} , not an error");
  console.log("\n      The parser already did its job: it set err.status = 400 and");
  console.log("      err.type = 'entity.parse.failed'. Express's DEFAULT error handler");
  console.log("      would have honoured that. The 500 comes from the handler somebody");
  console.log("      wrote to \'standardise error responses\', which threw the status");
  console.log("      away. That is why 03 §9\'s production handler starts from");
  console.log("      err.status || err.statusCode and only then falls back to 500 —");
  console.log("      and why 4xx-vs-5xx matters for on-call: this one pages someone.");

  // ── (b) prototype pollution ──
  function naiveMerge(target, source) {
    for (const key of Object.keys(source)) {
      const value = source[key];
      if (value && typeof value === "object") {
        if (!target[key]) target[key] = {};
        naiveMerge(target[key], value);            // 🐛 walks into __proto__
      } else target[key] = value;
    }
    return target;
  }

  const SAFE_KEYS = (k) => k !== "__proto__" && k !== "constructor" && k !== "prototype";
  function safeMerge(target, source) {
    for (const key of Object.keys(source).filter(SAFE_KEYS)) {
      const value = source[key];
      if (value && typeof value === "object") {
        if (!target[key]) target[key] = {};
        safeMerge(target[key], value);
      } else target[key] = value;
    }
    return target;
  }

  const attack = JSON.parse('{"name":"ada","__proto__":{"isAdmin":true}}');

  const beforePollution = {}.isAdmin;
  naiveMerge({ name: "default" }, attack);
  const afterPollution = {}.isAdmin;
  const unrelatedObject = { anything: 1 }.isAdmin;
  delete Object.prototype.isAdmin;                 // clean up immediately
  const afterCleanup = {}.isAdmin;

  safeMerge({ name: "default" }, attack);
  const afterSafeMerge = {}.isAdmin;

  results.pollution = {
    before: beforePollution ?? null,
    after: afterPollution ?? null,
    unrelatedObject: unrelatedObject ?? null,
    afterCleanup: afterCleanup ?? null,
    afterSafeMerge: afterSafeMerge ?? null,
  };

  console.log("\n  (b) POST body: {\"name\":\"ada\",\"__proto__\":{\"isAdmin\":true}}");
  console.log("      ({}).isAdmin before the merge      :", results.pollution.before);
  console.log("      ({}).isAdmin after a naive merge   :", results.pollution.after, " 🐛");
  console.log("      ({anything:1}).isAdmin             :", results.pollution.unrelatedObject,
              " 🐛 EVERY object in the process");
  console.log("      after deleting the polluted key    :", results.pollution.afterCleanup);
  console.log("      after a merge that skips __proto__ :", results.pollution.afterSafeMerge, " ✅");
  console.log("\n  Read the third line again: a single request body gave every object");
  console.log("  created anywhere in this process — including ones created by libraries");
  console.log("  that have never seen the request — the property isAdmin: true. Any");
  console.log("  `if (user.isAdmin)` in the codebase is now true for everyone.");
  console.log("\n  JSON.parse itself is fine: it creates __proto__ as an ordinary own");
  console.log("  property. The vulnerability is in what you do NEXT — a recursive merge,");
  console.log("  Object.assign into a shared object, a config loader, lodash.merge in an");
  console.log("  old version. Three defences:");
  console.log("     1. Skip __proto__, constructor and prototype in any merge.");
  console.log("     2. Validate the body against a schema and copy only known fields —");
  console.log("        an allow-list makes the whole class impossible (→ 17).");
  console.log("     3. Object.create(null) for objects used as lookup maps.");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — req.body undefined because the parser is registered below the
//   route. → 01 §4
//
// Bug 2 — req.body undefined because the client sent text/plain, or no
//   Content-Type at all, and the parser correctly skipped it. → §4
//
// Bug 3 — TypeError reading req.body.x on an undefined body, producing a
//   500 where a 415 or 400 was the honest answer. → §4
//
// Bug 4 — 413 on a legitimate upload because the 100kb default was never
//   revisited — then "fixed" by raising the limit globally. → §5
//
// Bug 5 — An endpoint that hangs because two parsers both tried to consume
//   the stream. → 07 §5
//
// Bug 6 — express.json() used on a multipart upload, which it ignores, so
//   req.body is undefined and the file is never read. → 14_multer-file-upload.js
//
// Bug 7 — A webhook signature that never validates because the raw body was
//   not captured and the payload was re-serialised. → §7
//
// Bug 8 — A signature compared with === , leaking it to a timing attack.
//   → §7
//
// Bug 9 — Malformed JSON returning 500 because a catch-all error handler
//   discarded the err.status = 400 the parser had already set — so client
//   typos page the on-call engineer. → §8
//
// Bug 10 — Prototype pollution through a recursive merge of req.body. → §8
//
// Bug 11 — A form field validated as a string arriving as an object because
//   extended: true accepted user[role]. → §6
//
// Bug 12 — Parsing bodies on every route including GETs and static assets;
//   harmless but wasteful, and it hides the type mismatch in Bug 2.


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — the gate:
  const g = results.gateTable;
  assert.deepEqual(g["application/json"].body, { a: 1 }, "a matching Content-Type was parsed ✅");
  assert.deepEqual(g["application/json; charset=utf-8"].body, { a: 1 },
    "…parameters after ';' are ignored, so charset=utf-8 still matched ✅");
  assert.deepEqual(g["application/JSON (uppercase)"].body, { a: 1 },
    "…and the media type is compared case-insensitively ✅");
  assert.deepEqual(g["application/x-www-form-urlencoded"].body, { a: "1" },
    "the urlencoded parser handled its own type — note the value is a STRING");
  assert.equal(g["text/plain"].bodyType, "undefined",
    "valid JSON sent as text/plain left req.body undefined 🐛 — the gate is the declared type");
  assert.equal(g["(no Content-Type)"].bodyType, "undefined",
    "…as did a request with no Content-Type at all 🐛");

  // § 5 — the limit:
  assert.equal(results.limitOk.status, 200, "a 1 KB body was accepted");
  assert.equal(results.limitRejected.status, 413,
    "a 5 MB body was refused with 413 ✅");
  assert.ok(results.bufferedBeforeReject < 400 * 1024,
    "…having ever held well under 400 KB in memory ✅ (held " +
    Math.round(results.bufferedBeforeReject / 1024) + " KB of " +
    Math.round(results.payloadSize / 1024) + " KB offered)");
  assert.ok(results.payloadSize > 5_000_000, "…of a payload larger than 5 MB");
  assert.equal(results.limitDestroyed.status, 0,
    "…while destroying the socket instead saved the bandwidth and cost the client " +
    "its status code entirely — a network error, not a 413 🐛");
  assert.ok(results.limitDestroyed.body.startsWith("CLIENT_ERROR"),
    "…which the client library reports as a connection failure");

  // § 6 — extended vs simple:
  const f = results.formTable;
  assert.deepEqual(f["name=ada&role=admin"].extended, { name: "ada", role: "admin" });
  assert.deepEqual(f["name=ada&role=admin"].simple, { name: "ada", role: "admin" },
    "flat forms parse identically either way");
  assert.deepEqual(f["tag=js&tag=node"].simple, { tag: ["js", "node"] },
    "a repeated field is an array in BOTH modes 🐛 for code expecting a string");
  assert.deepEqual(f["user[name]=ada&user[role]=admin"].extended, { user: { name: "ada", role: "admin" } },
    "extended: true produced a nested object ✅");
  assert.deepEqual(f["user[name]=ada&user[role]=admin"].simple,
    { "user[name]": "ada", "user[role]": "admin" },
    "…while extended: false kept flat literal keys ✅");
  assert.deepEqual(f["ids[]=1&ids[]=2"].extended, { ids: ["1", "2"] });
  assert.deepEqual(f["note=hello+world%21"].simple, { note: "hello world!" },
    "'+' decoded to a space and %21 to '!'");

  // § 7 — raw body:
  assert.equal(results.webhook.rawMatches, true,
    "the HMAC over the RAW bytes matched the provider's signature ✅");
  assert.equal(results.webhook.reserialisedMatches, false,
    "…and the HMAC over JSON.stringify(req.body) did NOT 🐛");
  assert.notEqual(results.webhook.rawLength, results.webhook.reserialisedLength,
    "…because the re-serialised payload is a different length entirely (" +
    results.webhook.rawLength + " vs " + results.webhook.reserialisedLength + " bytes)");

  // § 8 — bad JSON and pollution:
  assert.equal(results.badJsonDefault.status, 500,
    "malformed JSON became a 500 under a catch-all handler that ignored err.status 🐛");
  assert.equal(results.badJsonHandled.status, 400,
    "…and a 400 once the handler honoured err.status / checked for SyntaxError ✅");
  assert.deepEqual(JSON.parse(results.badJsonHandled.body), { error: "invalid JSON body" },
    "…with a message the client can act on");
  assert.equal(results.emptyBody.status, 200, "an empty body is not an error…");
  assert.deepEqual(JSON.parse(results.emptyBody.body).body, {}, "…it parses to {} ✅");

  assert.equal(results.pollution.before, null, "Object.prototype was clean before the merge");
  assert.equal(results.pollution.after, true,
    "a naive recursive merge of the request body set a property on Object.prototype 🐛");
  assert.equal(results.pollution.unrelatedObject, true,
    "…visible on a completely unrelated object elsewhere in the process 🐛");
  assert.equal(results.pollution.afterCleanup, null, "…removed again for the rest of this run");
  assert.equal(results.pollution.afterSafeMerge, null,
    "…and a merge that skips __proto__/constructor/prototype left the prototype untouched ✅");

  console.log("§10 — mini assertions passed for: Body parsing (json, urlencoded)");
  console.log("\n  The pair that captures it: valid JSON labelled text/plain left req.body");
  console.log("  undefined with no error at all — and one request body gave every object");
  console.log("  in the process an isAdmin property.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "how does body parsing work in Express?", answer:
//
//   "req is a readable stream and nothing reads it for you, so
//    express.json() is a middleware that does four things: checks
//    Content-Type, buffers the chunks while counting bytes, parses, and sets
//    req.body. Everything surprising about it is one of those four steps.
//
//    The Content-Type check is the source of most 'req.body is undefined'
//    reports. If the type doesn't match, the parser calls next() and does
//    nothing — no error, no log. So valid JSON sent as text/plain, or with
//    no Content-Type at all, leaves req.body undefined, and the handler then
//    throws a TypeError reading a property off it. That's a 500 for what
//    should have been a 415. The other two causes are the parser registered
//    below the route, and there being no parser for that type at all —
//    express.json() will not touch multipart, which is what Multer is for.
//
//    The size limit is enforced during the stream, not after. I've measured
//    it: a 5 MB body against a 100 KB limit is rejected with 413 after
//    reading roughly a hundred kilobytes. Real body-parser also checks
//    Content-Length up front, which is cheaper still but only helps with
//    honest clients, since a chunked request has no Content-Length.
//
//    For urlencoded, extended true or false is the same qs decision as the
//    query string: extended lets the caller send nested objects, so a field
//    you validated as a string can arrive as an object. I default to false
//    for HTML forms.
//
//    Two things I'd raise unprompted. First, webhooks: the stream can only
//    be read once, so if you need to verify a signature you have to capture
//    the raw bytes during that read, with the verify hook. Re-serialising
//    the parsed object produces different bytes — different whitespace, key
//    order, number formatting — so the HMAC never matches. And compare with
//    timingSafeEqual, not ===. Second, prototype pollution: JSON.parse
//    happily creates a __proto__ key, and any recursive merge of req.body
//    into an object will walk into it and set a property on
//    Object.prototype — visible on every object in the process. The real fix
//    isn't a key blocklist, it's validating the body against a schema and
//    copying only known fields."
//
// The 413-after-100KB measurement and the raw-body signature demo are what
// make this sound like production experience rather than documentation.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. Why is body parsing a middleware at all?
// A1. The body is a stream that has to be consumed, once, before the
//     handler can see it (07 §5).
//
// Q2. Three reasons req.body is undefined?
// A2. Parser below the route; Content-Type mismatch; no parser for that
//     type (§4).
//
// Q3. Does the parser error on a mismatched type?
// A3. No — it calls next() silently. That silence is the bug (§4).
//
// Q4. Is the type match case-sensitive? What about charset?
// A4. Case-insensitive; parameters after ';' are ignored (§4).
//
// Q5. When is the size limit enforced?
// A5. On every data event during streaming, plus an up-front Content-Length
//     check in the real implementation (§5, 07 §4).
//
// Q6. Default limit?
// A6. 100kb. Raise it per route, not globally (§5).
//
// Q7. extended true vs false?
// A7. qs vs querystring — nesting and bracket syntax vs flat keys (§6, 06 §6).
//
// Q8. How do you verify a webhook signature?
// A8. Capture the raw Buffer in the verify hook and HMAC those bytes;
//     compare with timingSafeEqual (§7).
//
// Q9. Why can't you re-serialise the parsed body instead?
// A9. Different bytes — whitespace, key order, number formatting — so a
//     different hash (§7).
//
// Q10. What status should malformed JSON return?
// A10. 400 — and body-parser already sets err.status = 400 for you. You lose
//      it by writing a catch-all handler that hard-codes 500 instead of
//      starting from err.status (§8, 03 §9).
//
// Q11. What does an empty body parse to?
// A11. {} — not an error, not undefined (§8).
//
// Q12. What is prototype pollution and where does it enter?
// A12. A __proto__ key in parsed input, walked into by a recursive merge,
//      writing to Object.prototype (§8).
//
// Q13. Is JSON.parse itself the vulnerability?
// A13. No — it creates an ordinary own property. The merge that follows is
//      the vulnerability (§8).
//
// Q14. Best structural defence?
// A14. Schema validation with an allow-list of fields, so unknown keys
//      never reach your objects (→ 17).
//
// Q15. Why not just app.use(express.json()) globally?
// A15. It's fine, but it will not parse multipart, and a global limit is a
//      single number for endpoints with very different needs.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: What is express.json(), mechanically?
//   Back : A stream consumer gated on Content-Type.
//
// Flashcard 2:
//   Front: Content-Type doesn't match?
//   Back : next(), silently. req.body stays undefined.
//
// Flashcard 3:
//   Front: Three causes of undefined req.body?
//   Back : Registered too low · type mismatch · no parser for that type.
//
// Flashcard 4:
//   Front: When is the limit checked?
//   Back : During streaming, per chunk (+ Content-Length up front).
//
// Flashcard 5:
//   Front: Default limit?
//   Back : 100kb.
//
// Flashcard 6:
//   Front: Empty body parses to?
//   Back : {}.
//
// Flashcard 7:
//   Front: Malformed JSON status?
//   Back : 400 — the parser sets err.status; a catch-all handler loses it.
//
// Flashcard 8:
//   Front: Webhook signature needs?
//   Back : The raw bytes, captured in verify(). Never a re-stringify.
//
// Flashcard 9:
//   Front: Signature comparison?
//   Back : crypto.timingSafeEqual, never ===.
//
// Flashcard 10:
//   Front: __proto__ in a JSON body + recursive merge?
//   Back : Prototype pollution — every object in the process.
//
// Flashcard 11:
//   Front: How do you sound senior?
//   Back : "The type gate fails silently — that silence is why req.body is
//          undefined and why the symptom is a TypeError, not a 415."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add the 415 guard described in §4: after the parsers, reject a
//   body-bearing method with no req.body. Prove it turns the TypeError into
//   a clean 415.
//
// Task 2:
//   Add a Content-Length pre-check to json() and measure how many bytes are
//   read for an oversized honest request versus a chunked one.
//
// Task 3:
//   Implement a per-route limit: 100kb globally, 5mb on /upload only.
//
// Task 4:
//   Reproduce the two-parsers hang (07 §5) and then make json() skip when
//   req.readableEnded is already true.
//
// Task 5:
//   Build a full webhook endpoint: verify the signature in verify(), throw
//   403 on mismatch, and prove the handler never runs for a bad signature.
//
// Task 6:
//   Add a replay-protection window to Task 5 using a timestamp in the
//   signed payload. Why is a signature alone not enough?
//
// Task 7:
//   Write the prototype-pollution regression test for CI: POST the payload,
//   assert ({}).isAdmin is undefined afterwards.
//
// Task 8:
//   Compare parsing throughput for a 1 MB JSON body via JSON.parse versus a
//   streaming JSON parser. At what payload size does streaming start to win,
//   and what do you give up?


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   express.json() is a stream consumer gated on Content-Type — and when the
//   gate does not match it calls next() silently, which is why req.body is
//   undefined and why the symptom is a TypeError instead of a 415.
//
// If you remember the common bug:
//   A webhook signature that never validates because the raw bytes were not
//   captured — and a recursive merge of req.body polluting Object.prototype.
//
// If you remember the professional framing:
//   Parsers above the routes and below helmet/cors/limits, a per-route size
//   limit, extended: false unless you mean it, verify() for raw bytes,
//   SyntaxError mapped to 400, and schema validation so only known fields
//   ever reach your objects.
//
// ─────────────────────────────────────────────────────────────────
// json() and urlencoded() both refuse one very common Content-Type:
// multipart/form-data. It cannot be buffered into a string and parsed,
// because it may carry a two-gigabyte file — which needs a different design
// entirely.
//
// NEXT TOPIC -> 14_multer-file-upload.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
