// ╔══════════════════════════════════════════════════════════════════╗
// ║        NODE.JS INTERVIEW PREP — GOOGLE / APPLE LEVEL
// ║             ◆ Express Deep Dive — MASTER INDEX
// ╚══════════════════════════════════════════════════════════════════╝
//
// This index belongs to Node Phase 2B, Section 2B.2 — Express.js. It is the
// ONLY group in this section, and the THIRD group of Phase 2B, following
// ◆ Node.js Internals and ◆ Streams & Buffers (section-2b.1-node-core/).
// It leans on both constantly: req and res are the Readable and Writable of
// 2B.1 · 02/01, every "constant memory" claim continues 2B.1 · 02/07, and
// the event-loop timing behind res.on('finish') is 2B.1 · 01/04.
//
// Express is not installed, and is not needed. Every file builds the slice
// of Express it is about — the dispatcher, the router, the parsers, the
// storage engines — in plain Node, and then proves its claims against a
// REAL http server over a REAL socket. Nothing here is a mock: the status
// codes, headers, 413s, 429s and traversal reads are what actually crossed
// the wire.
//
// Folder:
//   learning/phase-2b-node/section-2b.2-express-js/03_express-deep-dive/
//
// Files:
// ├── index.js
// ├── 01_middleware-concept-and-chain.js
// ├── 02_next-function.js
// ├── 03_error-handling-middleware-4-args.js
// ├── 04_router-vs-application-middleware.js
// ├── 05_express-router.js
// ├── 06_route-params-vs-query-params.js
// ├── 07_request-lifecycle.js
// ├── 08_res-json-vs-res-send.js
// ├── 09_express-static.js
// ├── 10_cors-setup.js
// ├── 11_helmet-js-security-headers.js
// ├── 12_rate-limiting-express-rate-limit.js
// ├── 13_body-parsing-json-urlencoded.js
// ├── 14_multer-file-upload.js
// ├── 15_cookie-parser.js
// ├── 16_session-management.js
// ├── 17_express-validator.js
// ├── 18_morgan-logger.js
//
// Study rule:
//   Do not only read. Predict the status code before you run the file, then
//   run it. Several files ship two servers side by side — a broken one and
//   a correct one — differing by a single line; find that line before you
//   scroll to the explanation. Files 09 and 14 create and delete a real
//   temporary directory; 10, 11 and 15 ship browser SIMULATORS, because the
//   rules they teach are enforced by a browser and not by your server —
//   read those simulators as carefully as the numbered sections, since the
//   assertions come out of them.
//
// READ IN ORDER:
//   Eighteen files, two halves. 01-10 are the MACHINE: what an Express app
//   is, how control moves through it, how errors travel, how it becomes a
//   tree, what values a request carries, the lifecycle those values travel,
//   how a response ends, how a file is served, and who is allowed to read
//   any of it. 11-18 are the middleware that make a service SURVIVABLE, in
//   the order a request meets them: headers (11), limits (12), bodies
//   (13, 14), identity (15, 16), input (17), visibility (18). The second
//   half is only readable because the first half explains why position in
//   the stack decides everything.

// ══════════════════════════════════════════════════════════════════
// TOPIC MAP
// ══════════════════════════════════════════════════════════════════
// 01. Middleware concept & chain — an app is an ORDERED ARRAY, not an event
//     system. The identical auth function returned 401 above the route and
//     leaked the secret below it; a middleware with no next() hung the
//     request until the client gave up.
// 02. next() function — a CALL, not a return. The onion order printed
//     A-before, B-before, route, B-after, A-after; a guard that answered 401
//     without `return` still ran the protected handler's DB write.
// 03. Error-handling middleware (4 args) — fn.length === 4 is the entire
//     rule. A default parameter silently dropped it to 3; the same handler
//     above the routes had a hit count of 0.
// 04. Router vs Application middleware — mounting REWRITES req.url. One
//     router mounted at /api and /v2 saw '/list' both times, and a prefix
//     match with no route inside handed control back with req.url restored.
// 05. express.Router() — a middleware that contains a stack. Default routing
//     answered /users, /users/, /Users and /USERS/ alike; the same child
//     router one mergeParams flag apart returned tenantId 'acme' or null.
// 06. Route params vs query params — everything is a string ('2' + 1 gave
//     '21'), and under the extended parser you are not even guaranteed a
//     string: ?user[$ne]=nobody returned every user.
// 07. Request lifecycle — headers first, body later. The handler was entered
//     with 0 body bytes read but Content-Length already known; an aborted
//     request fired 'close' without 'finish' while its handler ran on.
// 08. res.json vs res.send — for objects they are the same function.
//     res.send('hello') is text/html and res.json('hello') is a quoted JSON
//     string; res.send(404) meant 404 in Express 4 and 200 in Express 5.
// 09. express.static() — a missing file is next(), not a 404. A naive
//     path.join served a live AWS key from outside the root via %2E%2E%2F.
// 10. CORS setup — the browser enforces it, your server only declares. A
//     "blocked" cross-origin POST still ran the handler and wrote the row.
// 11. Helmet.js security headers — fifteen headers, zero filtering. Adding
//     'unsafe-inline' un-blocked your inline script and the injected one
//     identically; the XSS payload was still stored and still reflected.
// 12. Rate limiting — key, algorithm, store, and all three defaults wrong.
//     A limit of 5 allowed 10 at a window boundary and 20 across four
//     processes; 200 bots making one login attempt each were never refused.
// 13. Body parsing (json, urlencoded) — a Content-Type gate that fails
//     silently. Valid JSON labelled text/plain left req.body undefined, and
//     one request body gave every object in the process an isAdmin property.
// 14. Multer — file upload — it writes BEFORE your handler runs. A filename
//     of '../../pwned.txt' escaped the upload directory, and five requests
//     rejected with 403 still left five files on disk.
// 15. Cookie-parser — attributes go out, only name=value comes back. Five
//     attributes were sent and zero returned; SameSite=Lax refused to attach
//     the session to the cross-site form POST that CORS could not stop.
// 16. Session management — the cookie is a pointer, the store is the truth.
//     Without regenerate() the attacker's own pre-login cookie came back as
//     userId 42; a logout that only cleared the cookie left it working.
// 17. express-validator — chains record, they do not reject. Chains without
//     validationResult saved an invalid user with a 200, and a body that
//     PASSED validation still set role:'admin' through Object.assign.
// 18. Morgan logger — runs first, logs last. A logger writing at request
//     time reported 200 for a 404 and 0ms for a 25ms handler; a
//     'finish'-only log omitted the abandoned request entirely.

const topics = [
  "Middleware concept & chain",
  "next() function",
  "Error-handling middleware (4 args)",
  "Router vs Application middleware",
  "express.Router()",
  "Route params vs query params",
  "Request lifecycle",
  "res.json vs res.send",
  "express.static()",
  "CORS setup",
  "Helmet.js security headers",
  "Rate limiting (express-rate-limit)",
  "Body parsing (json, urlencoded)",
  "Multer — file upload",
  "Cookie-parser",
  "Session management",
  "express-validator",
  "Morgan logger",
];

console.log("Express Deep Dive topic count:", topics.length);
console.log(topics.join(" | "));

// ══════════════════════════════════════════════════════════════════
// THE ARGUMENT THIS SECTION MAKES
// ══════════════════════════════════════════════════════════════════
//
//   01-03  Express is an ORDERED ARRAY of functions and a cursor. That is
//        the whole framework. 01 proves order is the API by turning a 401
//        into a leaked secret with one moved line, and proves the only two
//        legal endings for a middleware by showing what the third one costs:
//        a socket that never closes. 02 opens up the cursor-advancing
//        function — it is a CALL, not a return, so the code after it runs
//        last, and its argument selects between continue, error mode and
//        skip-this-route. 03 follows the error value to its destination and
//        finds the most fragile rule in the framework: fn.length === 4,
//        which a default parameter silently destroys.
//
//   04-06  The array is really a TREE, and the values it matches are
//        untyped. 04 shows mounting inserts a whole sub-stack as one layer
//        and rewrites req.url for its duration — one mechanic that explains
//        router reusability, the doubled-prefix 404, and why your access
//        logs lost the prefix. 05 builds the real Router API on top and
//        finds the two options nobody reads: strict/caseSensitive (four
//        URLs for one resource by default) and mergeParams (a silent null
//        that is a cross-tenant leak). 06 examines the values themselves —
//        every one a string, and under Express 4's parser not even
//        guaranteed to BE a string, which turns a lookup into an injection.
//
//   07-08  The timeline those values travel, and how it ends. 07 lays out
//        the whole journey with real events and finds the fact everything
//        else depends on: your handler runs when the HEADERS are parsed,
//        with the body still arriving on an unread stream that can only be
//        read once. That single property explains body parsing, cheap 413s,
//        raw-body signature checks, and half the header-sent errors. 08 is
//        the last step — the response helpers — where type inference,
//        byte-vs-character length, ETags and one version-changing overload
//        all live.
//
//   09-10  Two things a response can be that change the security question.
//        09 serves a file, and the root you choose becomes the entire
//        security boundary — proven by reading a secret from outside it with
//        four missing characters of validation. 10 asks who may READ any of
//        this, and answers with the pattern that governs the rest of the
//        group: your server declares, the browser enforces, and a request
//        it "blocked" was already delivered and already committed.
//
//   11-14  The middleware a request meets before your code. 11 is more
//        declarations for the browser, and the honest admission that
//        fifteen headers do not stop an injection from being stored. 12 is
//        the first middleware that must keep STATE, and every hard part of
//        it follows from that: which key, which algorithm, which store, and
//        all three library defaults wrong. 13 and 14 consume the body — one
//        buffering text behind a silent type gate, the other streaming
//        binary and writing it to disk before your handler ever sees it.
//
//   15-18  Identity, input and visibility. 15 finds the asymmetry cookies
//        are built on — attributes out, values back — and the attribute that
//        finally stops the CSRF that CORS could not. 16 trades the cookie's
//        contents for a pointer, and buys the one thing a self-contained
//        token cannot have: revocation on the next request. 17 is the
//        answer 06, 13 and 14 all pointed at — asserting SHAPE closes type
//        confusion, prototype pollution and mass assignment at once — with
//        the warning that a perfectly valid body can still say role:'admin'.
//        18 is how you see any of it happen, and why the log you have is
//        missing exactly the requests people are complaining about.
//
// THE PUNCHLINE:
//   Two sentences hold this entire group together. The first: POSITION IS
//   BEHAVIOUR — every file from 01 to 18 has a bug whose only cause is a
//   middleware being in the wrong place, and no framework error is ever
//   raised for it. The second: YOUR SERVER DECLARES, SOMETHING ELSE
//   ENFORCES — the browser for CORS, CSP, SameSite and framing; the client
//   for filenames, mimetypes, X-Forwarded-For and every query value. Almost
//   every security bug in this group is one of those two sentences being
//   forgotten.

// ══════════════════════════════════════════════════════════════════
// THE DECISION LADDER — WHERE DOES IT GO, AND WHICH FORM
// ══════════════════════════════════════════════════════════════════
//
//   Ordering the stack, top to bottom:
//     request id → morgan → helmet → cors → rate limiter → body parsers →
//     static → cookies/session → auth → validation → routers → 404 →
//     error handler.                                    (01, 10-18)
//     Rule of thumb: cheapest and most security-relevant first; anything
//     that writes to disk or a database as late as possible.
//
//   Writing a middleware?
//     ...every branch must reach       → exactly one of res.end() or
//        an ending                        next(). Neither = a hung socket. (01)
//     ...continuing                    → `return next()`, always.          (02)
//     ...an error                      → next(err); async needs try/catch
//                                          or an asyncHandler wrapper.     (02, 03)
//     ...work after the response       → res.on('finish'), never code
//                                          after next().                   (02, 07, 18)
//
//   Handling errors?
//     ...one handler, last in the file → (err, req, res, next), four
//                                          parameters, no defaults.        (03)
//     ...specialists                   → chain them, and re-throw with
//                                          next(err) what isn't yours.     (03)
//     ...response already started      → if (res.headersSent) return
//                                          next(err).                      (03, 07)
//
//   Structuring routes?
//     ...one resource                  → a Router per file, paths WITHOUT
//                                          the mount prefix.               (04, 05)
//     ...mounted on a :param path      → Router({ mergeParams: true }).    (05)
//     ...one path, several verbs       → route(path).get().post().         (05)
//     ...an API                        → strict + caseSensitive, one
//                                          canonical URL per resource.     (05)
//     ...loading a resource by id      → router.param(), not a copy-pasted
//                                          lookup at the top of handlers.  (05)
//
//   Answering?
//     ...data                          → res.json / res.status(n).json.    (08)
//     ...a bare status                 → res.sendStatus(n). NEVER
//                                          res.send(number).               (08)
//     ...a file                        → express.static on a dedicated
//                                          directory, behind a prefix, with
//                                          hashed names + immutable.       (09)
//
//   Accepting input?
//     ...JSON                          → express.json({ limit }) above the
//                                          routes; raise the limit per
//                                          route, never globally.          (13)
//     ...a signed webhook              → the verify hook, HMAC the RAW
//                                          bytes, timingSafeEqual.         (13)
//     ...a form                        → urlencoded({ extended: false })
//                                          unless you truly need nesting.  (13)
//     ...a file                        → Multer with diskStorage, an
//                                          explicit fileSize limit, RANDOM
//                                          filenames, magic-byte checks —
//                                          and auth ABOVE it.              (14)
//     ...anything at all               → a validation chain plus a shared
//                                          handleValidation, and build
//                                          writes from matchedData().      (17)
//
//   Identity?
//     ...a session                     → opaque signed id, HttpOnly +
//                                          Secure + SameSite=Lax, shared
//                                          store with TTL.                 (15, 16)
//     ...login / any privilege change  → regenerate().                     (16)
//     ...logout                        → destroy() server-side. Clearing
//                                          the cookie is not logout.       (16)
//     ...state-changing endpoints      → a session-bound CSRF token, in
//                                          addition to SameSite.           (16)
//
//   Protecting capacity?
//     ...behind a proxy                → trust proxy = the real hop count,
//                                          never true.                     (12)
//     ...more than one process         → a shared store. Always.           (12)
//     ...login endpoints               → per-IP AND per-account AND global. (12)
//
//   Seeing what happened?
//     ...access logs                   → structured JSON, request id,
//                                          redacted URLs, health checks
//                                          skipped, percentiles not means.  (18)
//     ...requests users complain about → listen for 'close' too, or they
//                                          are not in your log at all.      (18)

// ══════════════════════════════════════════════════════════════════
// THE NUMBERS THIS SECTION PROVES
// ══════════════════════════════════════════════════════════════════
//
//   auth above the route / below it            401 vs 200 + the secret   (01)
//   a middleware with no next()                client timed out, 0 handler(01)
//   a cache middleware that answered           route handler calls: 0     (01)
//   use('/admin') against /administrator       did NOT match              (01)
//   two middlewares + a route, logged          A,B,route,B-after,A-after  (02)
//   next(err) with 3 normal layers after       all 3 skipped, error layer 1(02)
//   a 401 sent without `return`                protected handler ran 1×   (02)
//   sync throw vs async rejection (Express 4)  500 vs a hung request      (02)
//   (err, req, res, next = null).length        3 — no longer a handler    (03)
//   error handler above the routes             hit count 0                (03)
//   a stream that failed mid-body              status stayed 200, truncated(03)
//   one handler, four failure types            400/404/409/500, no stack  (03)
//   one router mounted at /api and /v2         req.url '/list' both times (04)
//   4 requests, app vs router middleware       4 hits vs 1 hit each       (04)
//   an error inside a router with a handler    claimed locally, 402       (04)
//   default router: /users /users/ /Users      200, 200, 200              (05)
//   route('/x') with three verbs               1 layer, not 3             (05)
//   a POST to a GET-only route                 405 + Allow, not 404       (05)
//   mergeParams false vs true                  tenantId null vs 'acme'    (05)
//   '2' + 1  ·  (page - 1) * 10                '21'  ·  10                (06)
//   ?tag=js&tag=node  ·  ?flag                 ['js','node']  ·  ''       (06)
//   ?user[$ne]=nobody through a naive lookup   2 of 2 users, admin included(06)
//   /echo/%2E%2E%2Fetc%2Fpasswd                param '../etc/passwd'      (06)
//   handler entry: body bytes / Content-Length 0 read / already known     (07)
//   a body read a second time                  0 bytes, readableEnded true(07)
//   setHeader vs statusCode after first write  throws vs silently ignored (07)
//   a client that aborted after 40ms           'close', no 'finish', work
//                                                 ran to completion        (07)
//   2 requests over a keep-alive agent         1 TCP connection           (07)
//   res.send({}) vs res.json({})               byte-identical             (08)
//   '日本語'.length vs Content-Length           3 vs 9                     (08)
//   res.send(404), Express 4 vs 5              404 vs 200 body '404'      (08)
//   If-None-Match match                        304, 0 bytes, handler ran  (08)
//   JSON.stringify of undefined/NaN/Map        key dropped / null / {}    (08)
//   a missing static file                      next(), the route answered (09)
//   naive join + %2E%2E%2F                     served a live AWS key      (09)
//   the same request, resolve+contain check    403                        (09)
//   static default Cache-Control               max-age=0, revalidate      (09)
//   express.static one directory too high      served secrets.txt         (09)
//   a "CORS-blocked" cross-origin POST         handler ran, row written   (10)
//   7 request shapes, preflight or not         4 preflighted              (10)
//   Allow-Origin '*' + credentials             rejected by the browser    (10)
//   a 500 with no CORS headers                 reported as a CORS error   (10)
//   helmet() on one response                   11+ headers added, 1 removed(11)
//   text/plain HTML without nosniff            sniffed as text/html       (11)
//   X-Frame-Options DENY + CSP 'self'          still framable — CSP wins  (11)
//   'unsafe-inline' added to script-src        injected script RUNS too   (11)
//   a per-response nonce                       yours runs, injected doesn't(11)
//   5/minute across a window boundary          10 requests in 1.85s       (12)
//   the same limit across 4 processes          20 requests allowed        (12)
//   10 users behind one proxy, socket key      5 refused                  (12)
//   1 attacker forging X-Forwarded-For         0 refused                  (12)
//   200 bots, 1 login attempt each, per-IP     0 refused                  (12)
//   JSON sent as text/plain                    req.body undefined         (13)
//   a 5 MB body against a 100 KB limit         413, ~128 KB ever buffered (13)
//   HMAC over rawBody vs re-stringified        match vs MISMATCH          (13)
//   {"__proto__":{"isAdmin":true}} + merge     ({}).isAdmin === true      (13)
//   a multipart upload through express.json()  req.body and file both gone(14)
//   memoryStorage on a 2 MB upload             whole file in the heap     (14)
//   filename '../../pwned.txt', naive          written OUTSIDE the root   (14)
//   a script payload declared image/png        accepted on mimetype,
//                                                 rejected on magic bytes  (14)
//   5 uploads rejected with 403                5 files left on disk       (14)
//   3 cookies set, 5 attributes on one         3 Set-Cookie, 0 attributes
//                                                 returned                 (15)
//   a signed cookie edited to 'admin'          false — rejected           (15)
//   HttpOnly session vs document.cookie        invisible to script        (15)
//   SameSite=Lax on a cross-site form POST     not sent — CSRF dead       (15)
//   ten 200-byte cookies × a 40-asset page     ~84 KB uploaded per load   (15)
//   login without regenerate()                 attacker's old cookie = 42 (16)
//   logout that only cleared the cookie        replay still authenticated (16)
//   MemoryStore across two processes           session missing on one     (16)
//   200 anonymous visitors                     200 stored sessions, none
//                                                 evicted 31 minutes later (16)
//   chains without validationResult            invalid user saved, 200    (17)
//   .isEmail().trim() vs .trim().isEmail()     422 vs 200, same input     (17)
//   a VALID body containing role:'admin'       Object.assign → admin      (17)
//   a logger that writes when it runs          status 200 for a 404, 0ms  (18)
//   a 'finish'-only log, 1 aborted request     that request absent        (18)
//   a reset token in a query string            written to the access log  (18)
//
// None of those are quoted. Every one is produced by code in its file, over
// a real socket.

// ══════════════════════════════════════════════════════════════════
// THE SIX TRUTHS THAT KEEP RETURNING
// ══════════════════════════════════════════════════════════════════
//
// 1. POSITION IS BEHAVIOUR, AND NOTHING WARNS YOU
//    Auth below a route is a public endpoint (01). An error handler above
//    the routes never fires (03). A parser below the route leaves req.body
//    undefined (13). cors() below the routes strips every header (10). A
//    logger below the routes hides your successes (18). Six identical bugs
//    wearing six costumes, and Express raises no error for any of them —
//    because from the framework's point of view nothing went wrong.
//
// 2. YOUR SERVER DECLARES; SOMETHING ELSE ENFORCES
//    CORS, CSP, X-Frame-Options, HttpOnly and SameSite are all instructions
//    to a browser (10, 11, 15). A "blocked" cross-origin POST already ran
//    your handler. And in the other direction, the client authors the
//    filename, the mimetype, X-Forwarded-For and the shape of every query
//    value (06, 12, 14). If you did not compute it, you did not verify it.
//
// 3. THE SILENT PATH IS THE DANGEROUS ONE
//    A type gate that calls next() (13). A router that falls through (04).
//    A cookie attribute that never comes back (15). A chain that records an
//    error nobody reads (17). A statusCode assigned after the first write
//    (07). None of these throw. Every one of them is a production incident
//    that presents as something else entirely.
//
// 4. THE STREAM CAN ONLY BE READ ONCE
//    Your handler runs before the body arrives (07). That is why body
//    parsing is a middleware, why two parsers hang an endpoint, why raw
//    bytes must be captured during that single read for a signature (13),
//    and why Multer has written the file to disk before your first line of
//    validation runs (14).
//
// 5. SHAPE IS THE VULNERABILITY, NOT VALUE
//    ?user[$ne]= is an object where a string was assumed (06). __proto__ is
//    a key nobody declared (13). role:'admin' is a perfectly valid field in
//    a perfectly valid body (17). Validating that a value is well-formed
//    answers none of these — asserting its TYPE and copying only DECLARED
//    fields answers all three.
//
// 6. STATE ON THE REQUEST PATH MULTIPLIES BY YOUR PROCESS COUNT
//    A rate limiter's memory store gives you max × instances (12). A
//    session's memory store logs users out at random and grows with traffic
//    forever (16). The moment a middleware remembers something between
//    requests, "how many processes?" becomes a correctness question.

// Interview drill:
// Pick any topic above and answer:
//   1. What is it?
//   2. What runtime rule controls it?
//   3. What number or status code did the example produce, and how?
//   4. What real bug does it cause?
//   5. How do you fix or avoid that bug?

// Section drill — the ten questions this group should let you answer cold:
//   1. What IS an Express app, structurally, and why is registration order
//      part of its API?
//   2. Is next() a call or a return, and what does each of its three
//      argument forms do?
//   3. How does Express identify an error handler, and what are the three
//      distinct reasons one "never runs"?
//   4. What exactly happens to req.url when a router is mounted, and which
//      three bugs does that one mechanic explain?
//   5. At what point in the lifecycle does your handler start running, and
//      what follows from the body being an unread stream?
//   6. Who enforces CORS, and what is a "CORS-blocked" request's server-side
//      effect?
//   7. What are the three independent decisions in a rate limiter, and what
//      goes wrong with each library default?
//   8. Which two strings in a file upload are attacker-controlled, and what
//      does each one let them do?
//   9. What is session fixation, and why is clearing a cookie not a logout?
//  10. Name three attacks that asserting the SHAPE of input closes, and one
//      it does not.

// ─────────────────────────────────────────────────────────────────
// END OF ◆ EXPRESS DEEP DIVE (2B.2, group 1 of 1) — 18 files.
//
// This completes SECTION 2B.2 — EXPRESS.JS in full:
//   ◆ Express Deep Dive   (03_express-deep-dive/)   — 18 files
//
// Phase 2B so far:
//   2B.1 Node Core   ◆ Node.js Internals (12) · ◆ Streams & Buffers (9)
//   2B.2 Express.js  ◆ Express Deep Dive (18)
//
// NEXT SECTION -> phase-2b-node/section-2b.3-rest-api-design/
// (per the docx: 🟢 REST API DESIGN — ◆ API Design Standards, beginning with
// REST principles: stateless, uniform interface)
// ─────────────────────────────────────────────────────────────────
