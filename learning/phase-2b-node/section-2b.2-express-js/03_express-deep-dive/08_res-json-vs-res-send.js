// ╔══════════════════════════════════════════════════════════════════╗
// ║   Express Deep Dive  →  08_res-json-vs-res-send.js
// ║   Level: Junior → Google/Apple Senior
// ╚══════════════════════════════════════════════════════════════════╝
//
// TARGET:
//   Crack interview questions around: res.json vs res.send
//
// WHAT YOU WILL MASTER HERE:
//   1. The real difference in one line: res.json ALWAYS serialises and always
//      claims application/json; res.send INFERS from the argument's type —
//      and for objects it just calls res.json anyway
//   2. A Content-Type table produced by sending six different JavaScript
//      types through res.send, measured from the client side
//   3. Content-Length counted in BYTES, not characters, proven with a
//      multi-byte string
//   4. res.send(404) — the overload that meant "status" in Express 4 and
//      means "body" in Express 5, both behaviours reproduced side by side
//   5. ETag and the conditional request: the same handler returning 200 with
//      a body and then 304 with zero bytes
//   6. What JSON.stringify quietly does to your data: undefined keys
//      vanish, Date becomes a string, NaN and Infinity become null, BigInt
//      throws, a cycle throws
//   7. Senior-level follow-up questions
//
// HOW TO RUN:
//   node "learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/08_res-json-vs-res-send.js"
//
// Prerequisites: 07_request-lifecycle.js §6 — headers are mutable until the
// first byte is written and frozen after. Every rule in this file is one of
// these helpers deciding what to put in that window before it closes.


const http = require("http");
const crypto = require("crypto");

const results = {};


// ══════════════════════════════════════════════════════════════════
// § 1 — THE ONE-SENTENCE DEFINITION
// ══════════════════════════════════════════════════════════════════
//
// res.json vs res.send:
// res.json(value) always runs JSON.stringify and always sets
// Content-Type: application/json; res.send(value) looks at the runtime type
// of what you gave it — a string becomes text/html, a Buffer becomes
// application/octet-stream, and anything object-shaped is handed to
// res.json.
//
// If interviewer says "explain it simply", say:
//   "res.json is the explicit one: serialise this and label it JSON.
//    res.send is the convenience one: figure out what I meant. For an object
//    or an array they end up doing exactly the same thing, because send
//    delegates to json. The difference shows up for the other types — a
//    string sent with res.send is HTML, but the same string through
//    res.json is a JSON string with quotes around it."
//
// If interviewer says "which should I use?", say:
//   "res.json in an API, without exception. Not because send is broken, but
//    because send's behaviour depends on the runtime type of a value, and
//    the runtime type of a value is exactly the thing that changes when
//    someone refactors. A handler that returns a string for one branch and
//    an object for another silently serves two different content types from
//    one endpoint."
//
// Why it matters in interviews:
//   This looks like a trivia question and isn't. It's the entry point to
//   content negotiation, ETags and conditional requests, byte-vs-character
//   length, and the deprecated res.send(status) overload that changed
//   meaning between major versions.


// ══════════════════════════════════════════════════════════════════
// § 2 — MENTAL MODEL
// ══════════════════════════════════════════════════════════════════
//
// Keyword to remember:
//   json IS EXPLICIT. send GUESSES FROM typeof. FOR OBJECTS THEY ARE ONE.
//
// Runtime rule:
//   Both end up at the same place: set Content-Type if not already set,
//   compute Content-Length in bytes, generate an ETag, answer 304 if the
//   client's If-None-Match matches, otherwise write the body. res.json's
//   only extra job is running JSON.stringify first and forcing the type.
//
// Practical rule:
//   res.json for data. res.status(n).json(...) for anything non-200.
//   res.sendStatus(n) for a bare status with its standard text. Never a
//   bare number in res.send. Never anything after the send call.
//
// Common trap:
//   res.json(...) then res.status(500). Status assignment after the body is
//   written is silently ignored (07 §6) — the error is logged as a 200.
//
// The mental picture:
//
//   res.send(x)
//     ├─ typeof x === 'string'  → Content-Type: text/html; charset=utf-8
//     ├─ Buffer.isBuffer(x)     → Content-Type: application/octet-stream
//     └─ anything else          → res.json(x) ─┐
//                                              ▼
//   res.json(x) → JSON.stringify(x) → Content-Type: application/json
//                                              │
//                                              ▼
//              Content-Length (BYTES) · ETag · 304 check · write


// ══════════════════════════════════════════════════════════════════
// § 3 — IMPLEMENTING THE HELPERS
// ══════════════════════════════════════════════════════════════════
//
// Everything measured below comes out of these forty lines. Read them once;
// they are the entire behaviour people memorise as trivia.

const STATUS_TEXT = { 200: "OK", 201: "Created", 204: "No Content", 304: "Not Modified",
  400: "Bad Request", 401: "Unauthorized", 404: "Not Found", 500: "Internal Server Error" };

function etagOf(body) {
  const hash = crypto.createHash("sha1").update(body).digest("base64").slice(0, 27);
  return 'W/"' + Buffer.byteLength(body).toString(16) + "-" + hash + '"';
}

function decorate(req, res, { expressVersion = 5 } = {}) {
  res.status = (code) => { res.statusCode = code; return res; };            // chainable
  res.type = (t) => { res.setHeader("content-type", t); return res; };

  res.json = (value) => {
    const body = JSON.stringify(value);
    if (!res.getHeader("content-type")) res.setHeader("content-type", "application/json; charset=utf-8");
    return res.send(body === undefined ? "" : body, { alreadySerialised: true });
  };

  res.sendStatus = (code) => {
    res.statusCode = code;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    return res.end(STATUS_TEXT[code] || String(code));
  };

  res.send = (chunk, opts = {}) => {
    let body = chunk;

    if (!opts.alreadySerialised) {
      switch (typeof chunk) {
        case "string":
          if (!res.getHeader("content-type")) res.setHeader("content-type", "text/html; charset=utf-8");
          break;
        case "number":
          // THE OVERLOAD. Express 4: a bare number meant the STATUS CODE.
          // Express 5: removed — a number is data, so it falls through to json.
          if (expressVersion === 4) {
            res.statusCode = chunk;
            body = STATUS_TEXT[chunk] || String(chunk);
            if (!res.getHeader("content-type")) res.setHeader("content-type", "text/plain; charset=utf-8");
            break;
          }
          return res.json(chunk);
        default:
          if (Buffer.isBuffer(chunk)) {
            if (!res.getHeader("content-type")) res.setHeader("content-type", "application/octet-stream");
            break;
          }
          return res.json(chunk);                 // objects, arrays, null, booleans
      }
    }

    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    res.setHeader("content-length", buf.length); // BYTES, not characters (§5)

    if (buf.length > 0 && !res.getHeader("etag")) res.setHeader("etag", etagOf(buf));

    // Conditional request: the client already has this exact body (§7).
    const inm = req.headers["if-none-match"];
    if (inm && inm === res.getHeader("etag")) {
      res.statusCode = 304;
      res.removeHeader("content-type");
      res.removeHeader("content-length");
      return res.end();
    }

    return res.end(buf);
  };

  return res;
}

function serve(handler, opts) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      decorate(req, res, opts);
      try { handler(req, res); }
      catch (e) {
        if (!res.headersSent) { res.statusCode = 500; res.setHeader("x-threw", e.constructor.name); }
        if (!res.writableEnded) res.end("ERR: " + e.message);
      }
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
}

function request(port, path, opts = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, method: "GET", headers: opts.headers }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body: buf.toString("utf8"), bytes: buf.length });
      });
    });
    req.on("error", reject);
    req.end();
  });
}


// ══════════════════════════════════════════════════════════════════
// § 4 — THE CONTENT-TYPE TABLE
// ══════════════════════════════════════════════════════════════════

async function section4() {
  console.log("\n══ § 4 — what res.send() infers from each type ══\n");

  const cases = {
    "string":        (res) => res.send("hello"),
    "html string":   (res) => res.send("<b>hi</b>"),
    "object":        (res) => res.send({ ok: true }),
    "array":         (res) => res.send([1, 2, 3]),
    "Buffer":        (res) => res.send(Buffer.from("raw bytes")),
    "boolean":       (res) => res.send(true),
    "null":          (res) => res.send(null),
    "json(string)":  (res) => res.json("hello"),
    "json(object)":  (res) => res.json({ ok: true }),
  };

  const { server, port } = await serve((req, res) => {
    const key = decodeURIComponent(req.url.slice(1));
    cases[key](res);
  });

  const table = {};
  for (const key of Object.keys(cases)) {
    const r = await request(port, "/" + encodeURIComponent(key));
    table[key] = { type: r.headers["content-type"], body: r.body, length: r.headers["content-length"] };
  }
  server.close();

  results.typeTable = table;

  console.log("  call                content-type                        body");
  console.log("  ─────────────────────────────────────────────────────────────────────");
  for (const [k, v] of Object.entries(table)) {
    console.log("  " + ("res.send(" + k + ")").padEnd(22).replace("res.send(json", "res.json").replace("))", ")") +
      String(v.type).padEnd(36) + JSON.stringify(v.body));
  }

  console.log("\n  The two rows to compare are the last three:");
  console.log("   • res.send('hello') → text/html, body: hello");
  console.log("   • res.json('hello') → application/json, body: \"hello\"  ← with quotes");
  console.log("   • res.send({ok:true}) and res.json({ok:true}) are IDENTICAL, because");
  console.log("     send delegates objects straight to json.");
  console.log("\n  So the interview answer 'send is for strings, json is for objects' is");
  console.log("  backwards. For objects they are the same function. The difference is");
  console.log("  entirely about what happens to everything that ISN'T an object — and");
  console.log("  that is exactly the case a refactor introduces by accident.");
}


// ══════════════════════════════════════════════════════════════════
// § 5 — CONTENT-LENGTH IS BYTES, NOT CHARACTERS
// ══════════════════════════════════════════════════════════════════

async function section5() {
  console.log("\n══ § 5 — bytes vs characters ══\n");

  const samples = ["hello", "héllo", "日本語", "👋 hi"];

  const { server, port } = await serve((req, res) => {
    res.send(decodeURIComponent(req.url.slice(1)));
  });

  const rows = [];
  for (const s of samples) {
    const r = await request(port, "/" + encodeURIComponent(s));
    rows.push({
      text: s,
      jsChars: s.length,
      contentLength: Number(r.headers["content-length"]),
      actualBytes: r.bytes,
    });
  }
  server.close();

  results.byteRows = rows;

  console.log("  text        .length   Content-Length   bytes on the wire");
  console.log("  ──────────────────────────────────────────────────────────");
  for (const r of rows) {
    console.log("  " + r.text.padEnd(12) + String(r.jsChars).padEnd(10) +
                String(r.contentLength).padEnd(17) + r.actualBytes);
  }
  console.log("\n  '日本語' is 3 characters and 9 bytes. If you compute Content-Length");
  console.log("  with .length you under-report by 6, the client stops reading early,");
  console.log("  and you get a truncated body or a hung connection — a bug that only");
  console.log("  appears for non-ASCII users, which means it reaches production.");
  console.log("\n  Express uses Buffer.byteLength for you. The lesson is for the moment");
  console.log("  you hand-roll a response with res.writeHead + res.end, or set");
  console.log("  Content-Length yourself for a stream.");
}


// ══════════════════════════════════════════════════════════════════
// § 6 — res.send(404): THE OVERLOAD THAT CHANGED MEANING
// ══════════════════════════════════════════════════════════════════
//
// The same line of code, run under both semantics, so you can see exactly
// what an upgrade does to it.

async function section6() {
  console.log("\n══ § 6 — a bare number: status or body? ══\n");

  const handler = (req, res) => {
    if (req.url === "/bare") return res.send(404);
    if (req.url === "/explicit") return res.status(404).send("not found");
    if (req.url === "/sendStatus") return res.sendStatus(404);
    return res.json({ ok: true });
  };

  const v4 = await serve(handler, { expressVersion: 4 });
  const v5 = await serve(handler, { expressVersion: 5 });

  const out = {};
  for (const [label, s] of [["express4", v4], ["express5", v5]]) {
    out[label] = {};
    for (const p of ["/bare", "/explicit", "/sendStatus"]) {
      const r = await request(s.port, p);
      out[label][p] = { status: r.status, body: r.body, type: r.headers["content-type"] };
    }
  }
  v4.server.close();
  v5.server.close();

  results.sendNumber = out;

  console.log("  res.send(404)          Express 4 →", JSON.stringify(out.express4["/bare"]));
  console.log("                         Express 5 →", JSON.stringify(out.express5["/bare"]));
  console.log("\n  res.status(404).send() Express 4 →", JSON.stringify(out.express4["/explicit"]));
  console.log("                         Express 5 →", JSON.stringify(out.express5["/explicit"]));
  console.log("\n  res.sendStatus(404)    Express 4 →", JSON.stringify(out.express4["/sendStatus"]));
  console.log("                         Express 5 →", JSON.stringify(out.express5["/sendStatus"]));

  console.log("\n  Read the first pair carefully. ONE line of unchanged code returns");
  console.log("  status 404 on Express 4 and status 200 with the body '404' on");
  console.log("  Express 5. No error, no warning at runtime — the endpoint simply");
  console.log("  starts telling every client that everything is fine.");
  console.log("\n  That is why the overload was deprecated and then removed, and why");
  console.log("  the two explicit forms exist:");
  console.log("     res.status(404).send('not found')   — status + your own body");
  console.log("     res.sendStatus(404)                 — status + its standard text");
  console.log("  Both behave identically in every version. Use them.");
}


// ══════════════════════════════════════════════════════════════════
// § 7 — ETag AND THE 304 THAT SENDS ZERO BYTES
// ══════════════════════════════════════════════════════════════════
//
// Both helpers fingerprint the body and honour If-None-Match. This is free
// bandwidth, and it is also a trap for anyone who thinks a handler running
// means bytes were sent.

async function section7() {
  console.log("\n══ § 7 — conditional requests ══\n");

  let handlerRuns = 0;
  const { server, port } = await serve((req, res) => {
    handlerRuns++;
    res.json({ id: 1, name: "ada", role: "engineer" });
  });

  const first = await request(port, "/user");
  const second = await request(port, "/user", { headers: { "if-none-match": first.headers.etag } });
  const stale = await request(port, "/user", { headers: { "if-none-match": 'W/"deadbeef"' } });
  server.close();

  results.etagFirst = { status: first.status, bytes: first.bytes, etag: first.headers.etag };
  results.etagSecond = { status: second.status, bytes: second.bytes, hasType: "content-type" in second.headers };
  results.etagStale = { status: stale.status, bytes: stale.bytes };
  results.etagHandlerRuns = handlerRuns;

  console.log("  1st request                    →", first.status, first.bytes, "bytes  etag:", first.headers.etag);
  console.log("  2nd, If-None-Match: <that etag>→", second.status, second.bytes, "bytes  ← body suppressed");
  console.log("  3rd, If-None-Match: <stale>    →", stale.status, stale.bytes, "bytes");
  console.log("\n  handler executions across all three requests:", handlerRuns);
  console.log("\n  Two things people miss:");
  console.log("   • A 304 saves BANDWIDTH, not work. The handler ran all three times —");
  console.log("     the database was queried, the object was built and serialised, and");
  console.log("     only then was the body discarded. If the goal is to save work you");
  console.log("     need a real cache in front of the handler (01 §6).");
  console.log("   • The ETag is computed from the response BODY. Any field that changes");
  console.log("     on every request — a timestamp, a request id, a random order —");
  console.log("     changes the ETag and makes it useless. Deterministic serialisation");
  console.log("     is a prerequisite for caching.");
}


// ══════════════════════════════════════════════════════════════════
// § 8 — WHAT JSON.stringify DOES TO YOUR DATA
// ══════════════════════════════════════════════════════════════════
//
// res.json is JSON.stringify with a Content-Type. Everything stringify does
// to a value, your API does to your data — silently, in most cases.

async function section8() {
  console.log("\n══ § 8 — the serialisation you did not ask for ══\n");

  const circular = { name: "loop" };
  circular.self = circular;

  const payloads = {
    "undefined value":  { a: 1, b: undefined },
    "function value":   { a: 1, fn: function () {} },
    "Date":             { when: new Date("2026-08-31T00:00:00.000Z") },
    "NaN / Infinity":   { nan: NaN, inf: Infinity, negInf: -Infinity },
    "Map / Set":        { m: new Map([["k", "v"]]), s: new Set([1, 2]) },
    "nested undefined": { list: [1, undefined, 3] },
    "toJSON method":    { x: { toJSON: () => "I decided this" } },
    "BigInt":           { big: 10n },
    "circular":         circular,
  };

  const { server, port } = await serve((req, res) => {
    res.json(payloads[decodeURIComponent(req.url.slice(1))]);
  });

  const table = {};
  for (const key of Object.keys(payloads)) {
    const r = await request(port, "/" + encodeURIComponent(key));
    table[key] = { status: r.status, body: r.body, threw: r.headers["x-threw"] || null };
  }
  server.close();

  results.serialisation = table;

  console.log("  input                 status  result");
  console.log("  ────────────────────────────────────────────────────────────────────");
  for (const [k, v] of Object.entries(table)) {
    console.log("  " + k.padEnd(22) + String(v.status).padEnd(8) +
      (v.threw ? "💥 " + v.threw + " — " + v.body : v.body));
  }

  console.log("\n  Seven rules, all of them silent except the last two:");
  console.log("   1. undefined values are DROPPED from objects — the key disappears.");
  console.log("   2. Functions are dropped too.");
  console.log("   3. undefined inside an ARRAY becomes null (position must be kept).");
  console.log("   4. Date becomes an ISO string. It never round-trips back to a Date.");
  console.log("   5. NaN and Infinity become null. Your number became empty.");
  console.log("   6. Map and Set serialise as {} — every entry is gone, no error.");
  console.log("   7. A toJSON() method wins over the object's own fields — which is");
  console.log("      how Mongoose documents and Date do it, and how you control output.");
  console.log("\n  And the two loud ones: a BigInt throws TypeError, and a circular");
  console.log("  reference throws — both at SERIALISATION time, which is inside your");
  console.log("  response helper, after the handler 'succeeded'. On Express that throw");
  console.log("  is synchronous inside res.json, so it lands in the error handler (03) —");
  console.log("  but only if you didn't already write part of the response (07 §6).");
}


// ══════════════════════════════════════════════════════════════════
// § 9 — REAL BUGS THIS CAUSES
// ══════════════════════════════════════════════════════════════════
//
// Bug 1 — An endpoint that serves text/html for one branch and
//   application/json for another, because one branch returns a string
//   through res.send. Clients that switch on Content-Type break. → §4
//
// Bug 2 — res.send(404) reviewed as "returns a 404" — and after an Express 5
//   upgrade it returns 200 with the body "404". → §6
//
// Bug 3 — res.json(data) followed by res.status(500). The status is silently
//   ignored; the failure is logged as a success. → §2, 07 §6
//
// Bug 4 — Truncated responses for non-ASCII users from a hand-computed
//   Content-Length using .length. → §5
//
// Bug 5 — ETags that never match because the payload includes a timestamp
//   or a request id, so every response is byte-different. → §7
//
// Bug 6 — "We added caching and the database load didn't drop." 304s save
//   bandwidth, not handler work. → §7
//
// Bug 7 — A field that "sometimes disappears from the API": its value is
//   undefined, and stringify drops the key entirely. → §8
//
// Bug 8 — A Map or Set serialised as {} with no warning. → §8
//
// Bug 9 — A 500 from res.json on a BigInt id, in code that never touched
//   res explicitly. → §8
//
// Bug 10 — Sending twice: res.json(a); res.json(b). The second throws
//   ERR_HTTP_HEADERS_SENT after the first already answered. → 02 §7


// ══════════════════════════════════════════════════════════════════
// § 10 — MINI ASSERTIONS
// ══════════════════════════════════════════════════════════════════

const assert = require("assert").strict;

function assertions() {
  console.log("\n══ § 10 — assertions ══\n");

  // § 4 — type inference:
  const t = results.typeTable;
  assert.ok(t["string"].type.startsWith("text/html"),
    "res.send(string) claimed text/html, not text/plain and not JSON ✅");
  assert.equal(t["string"].body, "hello");
  assert.ok(t["object"].type.startsWith("application/json"),
    "res.send(object) produced JSON — send delegates objects to json ✅");
  assert.deepEqual(JSON.parse(t["object"].body), { ok: true });
  assert.equal(t["object"].type, t["json(object)"].type,
    "…and res.send({…}) and res.json({…}) are byte-for-byte the same response ✅");
  assert.equal(t["object"].body, t["json(object)"].body);
  assert.ok(t["Buffer"].type.startsWith("application/octet-stream"),
    "res.send(Buffer) claimed octet-stream");
  assert.equal(t["json(string)"].body, '"hello"',
    "res.json('hello') sent a QUOTED JSON string, unlike res.send('hello') 🐛");
  assert.notEqual(t["string"].type, t["json(string)"].type,
    "…and the two content types differ for the identical input value");
  assert.equal(t["array"].body, "[1,2,3]");
  assert.equal(t["null"].body, "null", "res.send(null) went through json and produced the literal null");

  // § 5 — bytes:
  const rows = Object.fromEntries(results.byteRows.map((r) => [r.text, r]));
  assert.equal(rows["hello"].jsChars, rows["hello"].contentLength, "ASCII: characters === bytes");
  assert.equal(rows["héllo"].jsChars, 5);
  assert.equal(rows["héllo"].contentLength, 6, "…but 'héllo' is 5 characters and 6 BYTES 🐛");
  assert.equal(rows["日本語"].jsChars, 3);
  assert.equal(rows["日本語"].contentLength, 9, "…and '日本語' is 3 characters and 9 bytes 🐛");
  for (const r of results.byteRows) {
    assert.equal(r.contentLength, r.actualBytes, "Content-Length matched the bytes actually delivered ✅");
  }

  // § 6 — the number overload:
  assert.deepEqual(
    { status: results.sendNumber.express4["/bare"].status, body: results.sendNumber.express4["/bare"].body },
    { status: 404, body: "Not Found" },
    "under Express 4 semantics res.send(404) set the STATUS ✅");
  assert.deepEqual(
    { status: results.sendNumber.express5["/bare"].status, body: results.sendNumber.express5["/bare"].body },
    { status: 200, body: "404" },
    "…under Express 5 the identical line returns 200 with the body '404' 🐛");
  for (const v of ["express4", "express5"]) {
    assert.equal(results.sendNumber[v]["/explicit"].status, 404,
      "res.status(404).send('…') behaved identically in both — " + v + " ✅");
    assert.equal(results.sendNumber[v]["/sendStatus"].status, 404,
      "res.sendStatus(404) behaved identically in both — " + v + " ✅");
    assert.equal(results.sendNumber[v]["/sendStatus"].body, "Not Found",
      "…sending the standard status text as the body");
  }

  // § 7 — ETag / 304:
  assert.equal(results.etagFirst.status, 200);
  assert.ok(results.etagFirst.bytes > 0, "the first response carried a body");
  assert.ok(results.etagFirst.etag, "…and an ETag");
  assert.equal(results.etagSecond.status, 304,
    "a matching If-None-Match produced 304 ✅");
  assert.equal(results.etagSecond.bytes, 0, "…with ZERO body bytes on the wire ✅");
  assert.equal(results.etagSecond.hasType, false, "…and no Content-Type, as a 304 must not carry one");
  assert.equal(results.etagStale.status, 200, "a stale ETag got the full body again");
  assert.equal(results.etagHandlerRuns, 3,
    "…and the handler ran for ALL THREE requests — a 304 saves bandwidth, not work 🐛");

  // § 8 — serialisation:
  const s = results.serialisation;
  assert.equal(s["undefined value"].body, '{"a":1}', "an undefined value dropped the whole key 🐛");
  assert.equal(s["function value"].body, '{"a":1}', "a function value dropped the key too");
  assert.equal(s["Date"].body, '{"when":"2026-08-31T00:00:00.000Z"}', "Date became an ISO string");
  assert.equal(s["NaN / Infinity"].body, '{"nan":null,"inf":null,"negInf":null}',
    "NaN and ±Infinity all became null 🐛");
  assert.equal(s["Map / Set"].body, '{"m":{},"s":{}}',
    "a Map and a Set serialised as empty objects — every entry silently lost 🐛");
  assert.equal(s["nested undefined"].body, '{"list":[1,null,3]}',
    "…while undefined INSIDE an array became null, because positions must be preserved");
  assert.equal(s["toJSON method"].body, '{"x":"I decided this"}', "toJSON() overrode the object ✅");
  assert.equal(s["BigInt"].threw, "TypeError", "a BigInt threw TypeError during serialisation 💥");
  assert.equal(s["BigInt"].status, 500, "…surfacing as a 500 from inside the response helper");
  assert.equal(s["circular"].threw, "TypeError", "a circular reference threw too 💥");

  console.log("§10 — mini assertions passed for: res.json vs res.send");
  console.log("\n  The pair that captures it: res.send({ok:true}) and res.json({ok:true})");
  console.log("  are byte-identical, while res.send('hello') and res.json('hello') are");
  console.log("  not — and one unchanged res.send(404) means 404 on Express 4 and 200");
  console.log("  on Express 5.");
}


// ══════════════════════════════════════════════════════════════════
// § 11 — INTERVIEW ANSWER TEMPLATE
// ══════════════════════════════════════════════════════════════════
//
// When asked "what's the difference between res.json and res.send?",
// answer:
//
//   "res.json always serialises with JSON.stringify and always sets
//    Content-Type: application/json. res.send inspects the runtime type of
//    what you pass it — a string becomes text/html, a Buffer becomes
//    application/octet-stream, and anything object-shaped is handed straight
//    to res.json. So for objects and arrays they're literally the same
//    function; the difference only shows up for other types. res.send('ok')
//    is HTML with the body ok, res.json('ok') is JSON with the body
//    quote-ok-quote.
//
//    I use res.json everywhere in an API, and the reason isn't style. send's
//    behaviour depends on the runtime type of a value, and that's exactly
//    what changes under refactoring — one branch starts returning a string
//    and the endpoint quietly serves two different content types.
//
//    Underneath, both do the same four things: set Content-Type if it isn't
//    set, compute Content-Length in bytes — not characters, which matters
//    the moment your data isn't ASCII — generate an ETag from the body, and
//    return 304 with zero bytes if the client's If-None-Match matches. Worth
//    saying out loud: a 304 saves bandwidth, not work. The handler still
//    ran, the database was still queried; only the body was discarded.
//
//    The one thing I'd flag in review is a bare number. res.send(404) meant
//    'set the status' in Express 4, was deprecated, and in Express 5 a number
//    is just data — so the same unchanged line returns 200 with the body
//    '404'. res.status(404).send(...) and res.sendStatus(404) mean the same
//    thing in every version.
//
//    And since res.json is JSON.stringify, its quirks are your API's:
//    undefined values drop the key entirely, Date becomes a string that
//    never round-trips, NaN and Infinity become null, Maps and Sets
//    serialise as empty objects, and BigInt or a circular reference throws —
//    inside the response helper, after the handler thought it had
//    succeeded."
//
// Leading with "for objects they're the same function" immediately corrects
// the answer the interviewer usually expects, which is the point.


// ══════════════════════════════════════════════════════════════════
// § 12 — SENIOR FOLLOW-UP QUESTIONS
// ══════════════════════════════════════════════════════════════════
//
// Q1. res.send({}) vs res.json({})?
// A1. Identical — send delegates objects to json (§4).
//
// Q2. res.send('x') vs res.json('x')?
// A2. text/html with body x, versus application/json with body "x" (§4).
//
// Q3. What does res.send(Buffer) set?
// A3. application/octet-stream, unless a type was already set (§4).
//
// Q4. Is Content-Length characters or bytes?
// A4. Bytes. Buffer.byteLength, not .length (§5).
//
// Q5. What did res.send(404) do in Express 4, and in 5?
// A5. Status 404, and 200 with the body '404' respectively (§6).
//
// Q6. res.sendStatus(404) vs res.status(404).send()?
// A6. sendStatus also writes the standard status text as the body; both set
//     the status in every version (§6).
//
// Q7. Where does the ETag come from?
// A7. A hash of the response body, generated by send (§7).
//
// Q8. Does a 304 skip your handler?
// A8. No. It skips the body only (§7).
//
// Q9. Why might an ETag never match?
// A9. Non-deterministic payloads — timestamps, request ids, unordered keys
//     (§7).
//
// Q10. What happens to a Date in res.json?
// A10. Its toJSON() runs; it becomes an ISO string, permanently (§8).
//
// Q11. What happens to undefined?
// A11. The key is dropped in an object; it becomes null in an array (§8).
//
// Q12. What throws?
// A12. BigInt and circular references, at serialisation time (§8).
//
// Q13. How do you control what a class serialises to?
// A13. Give it a toJSON() method — it wins over the object's own fields
//      (§8). This is how Mongoose documents work.
//
// Q14. What about res.status(500) after res.json()?
// A14. Silently ignored — headers were sent by the json call (07 §6).
//
// Q15. When would you use res.send over res.json?
// A15. Serving HTML or raw bytes deliberately. For data, never.


// ══════════════════════════════════════════════════════════════════
// § 13 — FLASHCARDS
// ══════════════════════════════════════════════════════════════════
//
// Flashcard 1:
//   Front: res.send(object)?
//   Back : Calls res.json. Identical response.
//
// Flashcard 2:
//   Front: res.send('hi') content type?
//   Back : text/html; charset=utf-8.
//
// Flashcard 3:
//   Front: res.json('hi') body?
//   Back : "hi" — with quotes. JSON.
//
// Flashcard 4:
//   Front: Content-Length unit?
//   Back : Bytes. '日本語' = 3 chars, 9 bytes.
//
// Flashcard 5:
//   Front: res.send(404) in Express 4 vs 5?
//   Back : Status 404 vs 200 with body '404'.
//
// Flashcard 6:
//   Front: The safe forms?
//   Back : res.status(n).json(...) and res.sendStatus(n).
//
// Flashcard 7:
//   Front: What does a 304 save?
//   Back : Bandwidth only. The handler already ran.
//
// Flashcard 8:
//   Front: JSON.stringify on undefined / NaN / Map?
//   Back : Key dropped / null / {}.
//
// Flashcard 9:
//   Front: What throws in res.json?
//   Back : BigInt and circular references.
//
// Flashcard 10:
//   Front: How do you sound senior?
//   Back : "For objects they're the same function — the difference is what
//          send does to every type that ISN'T an object."


// ══════════════════════════════════════════════════════════════════
// § 14 — PRACTICE TASKS
// ══════════════════════════════════════════════════════════════════
//
// Task 1:
//   Add res.jsonp and res.redirect to §3's decorate() and prove the
//   Location header and 302 status.
//
// Task 2:
//   Write a res.json replacement that throws on undefined values instead of
//   dropping them. Run it against a payload with an optional field and
//   decide whether you'd ship it.
//
// Task 3:
//   Make §7's payload include Date.now(), then show the ETag changes every
//   request and the 304 never happens.
//
// Task 4:
//   Serialise a Map correctly by giving the wrapper a toJSON() that returns
//   Object.fromEntries. Prove the fix against §8's table.
//
// Task 5:
//   Reproduce the BigInt throw, then fix it with a JSON.stringify replacer
//   that converts BigInt to a string. Which is safer for a client: a string
//   or a possibly-lossy number?
//
// Task 6:
//   Measure the byte savings of §7's 304 for a 50 KB payload over 100
//   requests, then measure the CPU — and write one sentence explaining why
//   only one of those numbers improved.
//
// Task 7:
//   Add a strong vs weak ETag switch and explain when a proxy is allowed to
//   treat two weak ETags as equivalent.
//
// Task 8:
//   Instrument decorate() to warn when res.status() is called after
//   headersSent. You have just built the lint rule for Bug 3.


// ══════════════════════════════════════════════════════════════════
// § 15 — FINAL INTERVIEW SUMMARY
// ══════════════════════════════════════════════════════════════════
//
// If you remember only one thing:
//   res.json always serialises and always says application/json; res.send
//   guesses from the runtime type — and for objects it just calls res.json,
//   so for the case people ask about, they are the same function.
//
// If you remember the common bug:
//   res.send(404) — a status in Express 4, a body in Express 5 — and
//   res.status() called after the body was already written, which is
//   silently ignored.
//
// If you remember the professional framing:
//   res.json for data, res.status(n).json(...) for failures, res.sendStatus
//   for bare statuses, Content-Length in bytes, and an awareness that
//   res.json is JSON.stringify with all of its silent conversions.
//
// ─────────────────────────────────────────────────────────────────
// Every response so far has been generated. The next one is read off a
// disk — which brings a whole new set of concerns: caching headers, range
// requests, and the security question of what happens when a user-supplied
// path is joined to a directory (06 §8 already handed you '../etc/passwd').
//
// NEXT TOPIC -> 09_express-static.js
// ─────────────────────────────────────────────────────────────────


(async function main() {
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  assertions();
})();
